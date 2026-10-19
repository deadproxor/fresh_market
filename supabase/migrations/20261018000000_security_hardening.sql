-- ============================================================================
-- FreshMarket Migration: 20261018000000_security_hardening.sql
-- Description: Усиление безопасности базы данных (Пакет 1, Аудит v3 §3):
--   1. Включение Row Level Security (RLS) для всех таблиц
--   2. Функция проверки прав администратора/закупщика public.is_admin()
--   3. Удаление устаревших и небезопасных прямых политик INSERT
--   4. Защита от эскалации привилегий: триггер protect_profile_role()
--   5. Защищенная транзакционная RPC-функция public.create_order()
-- ============================================================================

-- 1. Включение защиты Row Level Security (RLS)
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 2. Функция безопасности: проверка роли администратора / закупщика в защищенных app_metadata JWT
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'buyer')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, auth, pg_temp;

-- 3. Очистка старых / небезопасных политик на всех таблицах
DROP POLICY IF EXISTS "Allow public read-only access" ON public.products;
DROP POLICY IF EXISTS "Allow all for admin" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated read-only access" ON public.products;
DROP POLICY IF EXISTS "Public read products" ON public.products;
DROP POLICY IF EXISTS "Admin write products" ON public.products;

DROP POLICY IF EXISTS "Allow individual read access" ON public.orders;
DROP POLICY IF EXISTS "Allow individual insert access" ON public.orders;
DROP POLICY IF EXISTS "Allow admin all access" ON public.orders;
DROP POLICY IF EXISTS "Users can create orders" ON public.orders;
DROP POLICY IF EXISTS "Users can view own orders" ON public.orders;
DROP POLICY IF EXISTS "Admin full access to orders" ON public.orders;

DROP POLICY IF EXISTS "Allow individual read access" ON public.order_items;
DROP POLICY IF EXISTS "Allow individual insert access" ON public.order_items;
DROP POLICY IF EXISTS "Allow admin all access" ON public.order_items;
DROP POLICY IF EXISTS "Users can insert order items" ON public.order_items;
DROP POLICY IF EXISTS "Users and admin can view order items" ON public.order_items;
DROP POLICY IF EXISTS "Admin can manage order items" ON public.order_items;

DROP POLICY IF EXISTS "Allow individual read access" ON public.profiles;
DROP POLICY IF EXISTS "Allow individual update access" ON public.profiles;
DROP POLICY IF EXISTS "Allow individual insert access" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
DROP POLICY IF EXISTS "Admin full access to profiles" ON public.profiles;

-- 4. Установка строгих политик RLS

-- 4.1. Каталог товаров (products)
-- Публичное чтение доступно всем, запись — только администраторам
CREATE POLICY "Public read products" ON public.products
FOR SELECT TO public USING (true);

CREATE POLICY "Admin write products" ON public.products
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4.2. Заказы (orders)
-- Чтение только своих заказов клиентами, полный доступ — администраторам
-- Прямой INSERT закрыт: заказы создаются исключительно через RPC create_order
CREATE POLICY "Users can view own orders" ON public.orders
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admin full access to orders" ON public.orders
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4.3. Позиции заказов (order_items)
-- Чтение доступно владельцу родительского заказа и администратору
-- Прямой INSERT закрыт: наполнение позиций происходит внутри транзакции create_order
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

-- 5. Защита от эскалации привилегий в профилях (prevent role escalation)
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  -- Если вызывающий пользователь НЕ является администратором, запретить изменение роли:
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
    NEW.role := OLD.role;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- 6. Защищенная транзакционная RPC-функция оформления заказа (public.create_order)
-- Решает проблему неатомарности (§3.2 Аудита v2, §3.3 Аудита v3)
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

  -- 2. Валидация контактов и ограничений
  IF p_customer_phone IS NULL OR trim(p_customer_phone) = '' THEN
    RAISE EXCEPTION 'Customer phone or messenger contact is required';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Order contains too many items (maximum 50)';
  END IF;

  -- 3. Санитизация и обрезка строк по лимитам
  v_customer_name := substring(trim(p_customer_name) from 1 for 100);
  v_customer_phone := substring(trim(p_customer_phone) from 1 for 50);
  v_customer_messenger := substring(trim(COALESCE(p_customer_messenger, 'telegram')) from 1 for 50);
  v_delivery_address := substring(trim(p_delivery_address) from 1 for 300);
  v_customer_comment := substring(trim(p_customer_comment) from 1 for 500);
  v_replacement_policy := substring(trim(COALESCE(p_replacement_policy, 'call_to_agree')) from 1 for 50);

  -- 4. Серверная тарификация доставки по зонам (белый список)
  CASE p_delivery_zone
    WHEN 'zone_1' THEN v_delivery_fee := 1.00; v_delivery_zone := 'zone_1';
    WHEN 'zone_2' THEN v_delivery_fee := 2.00; v_delivery_zone := 'zone_2';
    WHEN 'zone_3' THEN v_delivery_fee := 3.50; v_delivery_zone := 'zone_3';
    ELSE v_delivery_fee := 3.50; v_delivery_zone := 'zone_3';
  END CASE;

  -- 5. Генерация/присвоение идентификаторов
  v_order_id := COALESCE(p_order_id, gen_random_uuid());
  v_order_number := 'FM-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 3, '0');
  v_target_date := COALESCE(p_target_delivery_date, CURRENT_DATE + INTERVAL '1 day');

  -- 6. Вставка шапки заказа (с защитой от Hijacking чужого заказа)
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
    updated_at = now()
  WHERE orders.id::text = v_order_id::text AND orders.user_id::text = v_user_id::text
  RETURNING order_number INTO v_order_number;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Access denied: cannot modify an order owned by another user';
  END IF;

  -- 7. Вставка позиций (универсальный парсинг количества и цен)
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
    -- Извлечение числа из "1.5 kg", "2 шт", "1" или 1.5
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

    -- Проверка наличия в таблице products с безопасным приведением ::text
    IF v_item.product_id IS NOT NULL AND v_item.product_id <> '' THEN
      SELECT * INTO v_product FROM public.products WHERE products.id::text = v_item.product_id::text;
      v_item_product_id := v_product.id;
    ELSE
      v_product := NULL;
      v_item_product_id := NULL;
    END IF;

    -- Метаданные: приоритет БД, иначе безопасный fallback на клиентские данные
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
    v_final_price := COALESCE(
      v_product.price,
      GREATEST(0.00, LEAST(COALESCE(NULLIF(regexp_replace(v_item.estimated_price, '[^0-9.]', '', 'g'), '')::numeric, 0.00), 9999.99))
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

  -- 8. Формирование возвращаемого JSON-результата
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

-- Ограничение прав: вызов функции разрешен только авторизованным покупателям
REVOKE ALL ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB) TO authenticated;
