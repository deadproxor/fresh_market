-- ============================================================================
-- FreshMarket Migration: 20261020000000_hardening_v4.sql
-- Description: Комплексное усиление безопасности и бизнес-логики (Аудит v4):
--   1. Динамическая зачистка всех устаревших RLS-политик через PL/pgSQL цикл
--   2. Строгая проверка роли администратора public.is_admin() (исключена роль buyer)
--   3. Эталонные RLS-политики с запретом прямого INSERT на заказы и позиции
--   4. Выделенная колонка cart_updated_at в public.profiles и публикация в Realtime
--   5. Корректировка часового пояса (Asia/Phnom_Penh, UTC+7) для нумерации заказов
--   6. Серверный Rate Limiting в create_order() (1 заказ в 2 мин, макс 5 pending)
--   7. Обязательная валидация полей (имя, адрес, телефон) и белые списки enum
--   8. Валидация позиций без product_id и ограничение диапазона estimated_price
-- ============================================================================

-- 1. Динамическая зачистка ВСЕХ существующих политик на целевых таблицах
-- Решает проблему остаточных legacy-политик из копий старых баз (Аудит v4 §2.4)
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN 
    SELECT policyname, tablename 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename IN ('products', 'orders', 'order_items', 'profiles')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- 2. Включение Row Level Security (RLS) для гарантии защиты
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Строгая функция проверки прав администратора: только role = 'admin' в app_metadata JWT
-- Решает проблему избыточной роли buyer (Аудит v4 §3.3)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, auth, pg_temp;

-- 4. Установка эталонных строгих политик RLS

-- 4.1. Каталог товаров (products)
-- Публичное чтение доступно всем, управление — только администратору
CREATE POLICY "Public read products" ON public.products
FOR SELECT TO public USING (true);

CREATE POLICY "Admin write products" ON public.products
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4.2. Заказы (orders)
-- Чтение только своих заказов клиентами, полный доступ — администратору
-- Прямой INSERT закрыт: заказы создаются исключительно через RPC create_order()
CREATE POLICY "Users can view own orders" ON public.orders
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admin full access to orders" ON public.orders
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4.3. Позиции заказов (order_items)
-- Чтение доступно владельцу родительского заказа и администратору
-- Прямой INSERT закрыт: наполнение позиций происходит внутри транзакции create_order()
CREATE POLICY "Users and admin can view order items" ON public.order_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders
    WHERE orders.id = order_items.order_id
      AND (orders.user_id = auth.uid() OR public.is_admin())
  )
);

CREATE POLICY "Admin can manage order items" ON public.order_items
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4.4. Профили пользователей (profiles)
CREATE POLICY "Users can view own profile" ON public.profiles
FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "Users can update own profile" ON public.profiles
FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

CREATE POLICY "Admin full access to profiles" ON public.profiles
FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- 5. Изоляция метки времени синхронизации корзины и Realtime публикация (Аудит v4 §2.4)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS cart_updated_at TIMESTAMPTZ DEFAULT now();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
END $$;

-- 6. Функция нумерации заказов с учетом часового пояса (Asia/Phnom_Penh, UTC+7) (Аудит v4 §2.3)
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'FM-' || to_char((now() AT TIME ZONE 'Asia/Phnom_Penh')::date, 'YYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_order_number ON public.orders;
CREATE TRIGGER trg_set_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_number();

-- 7. Усиленная транзакционная RPC-функция оформления заказа (public.create_order)
-- Решает проблемы Аудита v4: §2.2 (верификация), §2.3 (rate limit, валидация полей, таймзона, лимиты цен)
CREATE OR REPLACE FUNCTION public.create_order(
  p_order_id UUID DEFAULT NULL,
  p_customer_name TEXT DEFAULT NULL,
  p_customer_phone TEXT DEFAULT NULL,
  p_customer_messenger TEXT DEFAULT 'telegram',
  p_delivery_address TEXT DEFAULT NULL,
  p_delivery_zone TEXT DEFAULT 'zone_1',
  p_customer_comment TEXT DEFAULT NULL,
  p_replacement_policy TEXT DEFAULT 'call_to_agree',
  p_target_delivery_date DATE DEFAULT NULL,
  p_items JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_user_id UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_delivery_fee NUMERIC(10, 2);
  v_delivery_zone TEXT;
  v_local_date DATE;
  v_target_date DATE;
  v_customer_name TEXT;
  v_customer_phone TEXT;
  v_customer_messenger TEXT;
  v_delivery_address TEXT;
  v_customer_comment TEXT;
  v_replacement_policy TEXT;
  v_item RECORD;
  v_product RECORD;
  v_item_product_id UUID;
  v_raw_qty TEXT;
  v_num_str TEXT;
  v_qty NUMERIC(10, 3);
  v_final_title TEXT;
  v_final_name_en TEXT;
  v_final_name_kh TEXT;
  v_final_name_ru TEXT;
  v_final_img TEXT;
  v_final_cat TEXT;
  v_final_form TEXT;
  v_final_unit TEXT;
  v_final_comment TEXT;
  v_final_price NUMERIC(10, 2);
  v_result JSONB;
BEGIN
  -- 1. Проверка аутентификации пользователя
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: order creation requires authentication';
  END IF;

  -- 2. Серверный Rate Limiting (Аудит v4 §2.3)
  -- 2.1. Интервал между заказами: не чаще 1 заказа в 2 минуты для одного аккаунта
  IF EXISTS (
    SELECT 1 FROM public.orders 
    WHERE user_id = v_user_id 
      AND created_at > (now() - INTERVAL '2 minutes')
  ) THEN
    RAISE EXCEPTION 'Rate limit exceeded: please wait 2 minutes between orders';
  END IF;

  -- 2.2. Лимит активных заявок: не более 5 заказов в статусе pending
  IF (
    SELECT count(*) FROM public.orders
    WHERE user_id = v_user_id AND status = 'pending'
  ) >= 5 THEN
    RAISE EXCEPTION 'Maximum pending orders limit reached (5). Please wait until your active orders are processed.';
  END IF;

  -- 3. Обязательная валидация клиентских полей (Аудит v4 §2.3)
  IF p_customer_phone IS NULL OR length(trim(p_customer_phone)) < 3 THEN
    RAISE EXCEPTION 'Customer phone or messenger contact is required (minimum 3 characters)';
  END IF;

  IF p_customer_name IS NULL OR length(trim(p_customer_name)) < 2 THEN
    RAISE EXCEPTION 'Customer name is required (minimum 2 characters)';
  END IF;

  IF p_delivery_address IS NULL OR length(trim(p_delivery_address)) < 5 THEN
    RAISE EXCEPTION 'Delivery address is required (minimum 5 characters)';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Order contains too many items (maximum 50)';
  END IF;

  -- 4. Серверные белые списки и санитизация строк (Аудит v4 §2.3)
  IF trim(COALESCE(p_replacement_policy, '')) IN ('call_to_agree', 'shopper_choice', 'do_not_replace') THEN
    v_replacement_policy := trim(p_replacement_policy);
  ELSE
    v_replacement_policy := 'call_to_agree';
  END IF;

  IF trim(COALESCE(p_customer_messenger, '')) IN ('telegram', 'whatsapp', 'phone') THEN
    v_customer_messenger := trim(p_customer_messenger);
  ELSE
    v_customer_messenger := 'telegram';
  END IF;

  v_customer_name := substring(trim(p_customer_name) from 1 for 100);
  v_customer_phone := substring(trim(p_customer_phone) from 1 for 50);
  v_delivery_address := substring(trim(p_delivery_address) from 1 for 300);
  v_customer_comment := substring(trim(p_customer_comment) from 1 for 500);

  -- 5. Предварительная тарификация доставки по зонам (белый список)
  -- Примечание: Тариф является ориентировочным (estimated). При расчете итогового чека 
  -- закупщик сверяет адрес на карте в админке и при необходимости корректирует доставку.
  CASE p_delivery_zone
    WHEN 'zone_1' THEN v_delivery_fee := 1.00; v_delivery_zone := 'zone_1';
    WHEN 'zone_2' THEN v_delivery_fee := 2.00; v_delivery_zone := 'zone_2';
    WHEN 'zone_3' THEN v_delivery_fee := 3.50; v_delivery_zone := 'zone_3';
    ELSE v_delivery_fee := 3.50; v_delivery_zone := 'zone_3';
  END CASE;

  -- 6. Часовой пояс Asia/Phnom_Penh (UTC+7) для нумерации и дат доставки (Аудит v4 §2.3)
  v_local_date := (now() AT TIME ZONE 'Asia/Phnom_Penh')::date;
  v_order_id := COALESCE(p_order_id, gen_random_uuid());
  v_order_number := 'FM-' || to_char(v_local_date, 'YYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 3, '0');
  v_target_date := COALESCE(p_target_delivery_date, v_local_date + INTERVAL '1 day');

  -- 7. Вставка шапки заказа (с защитой от изменения чужих заказов)
  INSERT INTO public.orders (
    id,
    order_number,
    user_id,
    status,
    payment_status,
    payment_method,
    customer_name,
    customer_phone,
    customer_messenger,
    delivery_address,
    customer_notes,
    customer_comment,
    target_delivery_date,
    replacement_policy,
    replace_rule,
    delivery_zone,
    delivery_fee,
    estimated_total,
    market_items_total,
    actual_market_total,
    service_fee,
    grand_total,
    created_at,
    updated_at
  ) VALUES (
    v_order_id,
    v_order_number,
    v_user_id,
    'pending',
    'pending',
    'cash',
    v_customer_name,
    v_customer_phone,
    v_customer_messenger,
    v_delivery_address,
    v_customer_comment,
    v_customer_comment,
    v_target_date,
    v_replacement_policy,
    v_replacement_policy,
    v_delivery_zone,
    v_delivery_fee,
    0.00,
    0.00,
    0.00,
    0.00,
    v_delivery_fee,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE SET
    customer_phone = EXCLUDED.customer_phone,
    delivery_address = EXCLUDED.delivery_address,
    customer_notes = EXCLUDED.customer_notes,
    customer_comment = EXCLUDED.customer_comment,
    updated_at = now()
  WHERE orders.id::text = v_order_id::text AND orders.user_id::text = v_user_id::text
  RETURNING order_number INTO v_order_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access denied: cannot modify an order owned by another user';
  END IF;

  -- 8. Вставка позиций (универсальный парсинг количества и цен)
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (
    id UUID,
    product_id TEXT,
    product_title TEXT,
    product_name_en TEXT,
    product_name_kh TEXT,
    product_name_ru TEXT,
    product_img_url TEXT,
    product_category TEXT,
    product_form TEXT,
    quantity TEXT,
    requested_qty TEXT,
    unit TEXT,
    customer_comment TEXT,
    estimated_price TEXT
  )
  LOOP
    -- 8.1. Извлечение числа из "1.5 kg", "2 шт", "1" или 1.5
    v_raw_qty := trim(COALESCE(v_item.requested_qty, v_item.quantity, '1'));
    v_num_str := (regexp_match(v_raw_qty, '^([0-9]+(?:\.[0-9]+)?)'))[1];
    IF v_num_str IS NOT NULL AND v_num_str <> '' THEN
      v_qty := v_num_str::numeric;
    ELSE
      v_qty := 1.00;
    END IF;

    IF v_qty <= 0 OR v_qty > 500 THEN
      RAISE EXCEPTION 'Invalid item quantity: % (must be between 0.001 and 500)', v_qty;
    END IF;

    -- 8.2. Проверка наличия в таблице products с безопасным приведением ::text
    IF v_item.product_id IS NOT NULL AND v_item.product_id <> '' THEN
      SELECT * INTO v_product FROM public.products WHERE products.id::text = v_item.product_id::text;
      v_item_product_id := v_product.id;
    ELSE
      v_product := NULL;
      v_item_product_id := NULL;
    END IF;

    -- 8.3. Метаданные: приоритет БД, иначе безопасная санитизация кастомных позиций (Аудит v4 §2.3)
    v_final_title := COALESCE(
      v_product.name_ru,
      NULLIF(substring(trim(v_item.product_name_ru) from 1 for 100), ''),
      NULLIF(substring(trim(v_item.product_title) from 1 for 100), ''),
      'Товар'
    );
    v_final_name_en := COALESCE(v_product.name_en, substring(trim(v_item.product_name_en) from 1 for 100), '');
    v_final_name_kh := COALESCE(v_product.name_kh, substring(trim(v_item.product_name_kh) from 1 for 100), '');
    v_final_name_ru := COALESCE(v_product.name_ru, substring(trim(v_item.product_name_ru) from 1 for 100), '');
    v_final_img := COALESCE(v_product.img_url, substring(trim(v_item.product_img_url) from 1 for 500), '');
    v_final_cat := COALESCE(v_product.category, substring(trim(v_item.product_category) from 1 for 50), 'other');
    v_final_form := COALESCE(v_product.form, substring(trim(v_item.product_form) from 1 for 50), 'Целый');
    v_final_unit := substring(trim(COALESCE(v_item.unit, 'кг')) from 1 for 20);
    v_final_comment := substring(trim(v_item.customer_comment) from 1 for 300);

    -- 8.4. Ограничение ориентировочной цены (диапазон от 0 до 1,000,000 KHR) (Аудит v4 §2.3)
    v_final_price := COALESCE(
      v_product.price,
      GREATEST(0.00, LEAST(COALESCE(NULLIF(regexp_replace(v_item.estimated_price, '[^0-9.]', '', 'g'), '')::numeric, 0.00), 1000000.00))
    );

    INSERT INTO public.order_items (
      id,
      order_id,
      product_id,
      product_title,
      product_name_en,
      product_name_kh,
      product_name_ru,
      product_img_url,
      product_category,
      product_form,
      quantity,
      requested_qty,
      unit,
      customer_comment,
      status,
      estimated_price,
      actual_cost,
      created_at
    ) VALUES (
      COALESCE(v_item.id, gen_random_uuid()),
      v_order_id,
      v_item_product_id,
      v_final_title,
      v_final_name_en,
      v_final_name_kh,
      v_final_name_ru,
      v_final_img,
      v_final_cat,
      v_final_form,
      v_qty,
      v_qty,
      v_final_unit,
      v_final_comment,
      'pending',
      v_final_price,
      0.00,
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- 9. Формирование возвращаемого JSON-результата
  SELECT jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'delivery_fee', v_delivery_fee,
    'grand_total', v_delivery_fee,
    'status', 'pending',
    'created_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 10. Ограничение прав: вызов функции разрешен только авторизованным покупателям
REVOKE ALL ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB) TO authenticated;
