-- ============================================================================
-- FreshMarket Database Migration
-- Version: 20261023020000_server_side_delivery_zone_calculation.sql
-- Description: Серверный расчет зоны и стоимости доставки по координатам.
--              Добавление колонок delivery_lat и delivery_lng в orders.
--              Защита от занижения тарифа доставки клиентом.
-- ============================================================================

-- 1. Добавление колонок координат в таблицу orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_lat NUMERIC(10, 7) DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_lng NUMERIC(10, 7) DEFAULT NULL;

-- 2. Удаление устаревшей сигнатуры create_order (10 параметров) для исключения неоднозначности в PostgREST
DROP FUNCTION IF EXISTS public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB);

-- 3. Создание обновленной функции create_order (12 параметров) с серверным расчетом зоны доставки
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
  p_items JSONB DEFAULT '[]'::jsonb,
  p_delivery_lat NUMERIC DEFAULT NULL,
  p_delivery_lng NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_market_lat CONSTANT NUMERIC := 10.6120;
  v_market_lng CONSTANT NUMERIC := 104.1780;
  v_distance_km NUMERIC;
  v_user_id UUID;
  v_existing_order RECORD;
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
  v_product public.products%ROWTYPE;
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

  -- 1.1. Транзакционная рекомендательная блокировка от гонок (Advisory Lock)
  -- Сериализует одновременные вызовы create_order для одного аккаунта,
  -- предотвращая обход rate limiting и дублирование генерации номеров заказов.
  PERFORM pg_advisory_xact_lock(hashtext('create_order'), hashtext(v_user_id::text));

  -- 1.2. Проверка идемпотентности (повторный вызов для уже созданного заказа)
  -- Если заказ с переданным p_order_id уже существует в базе, проверяем владельца
  -- и немедленно возвращаем существующие данные заказа ДО проверки rate limit и лимита pending!
  IF p_order_id IS NOT NULL THEN
    SELECT * INTO v_existing_order
    FROM public.orders
    WHERE id = p_order_id;

    IF FOUND THEN
      IF v_existing_order.user_id <> v_user_id THEN
        RAISE EXCEPTION 'Access denied: order belongs to another user';
      END IF;

      RETURN jsonb_build_object(
        'success', true,
        'order_id', v_existing_order.id,
        'order_number', v_existing_order.order_number,
        'delivery_fee', v_existing_order.delivery_fee,
        'grand_total', v_existing_order.grand_total,
        'status', v_existing_order.status,
        'created_at', v_existing_order.created_at,
        'idempotent_replay', true
      );
    END IF;
  END IF;

  -- 2. Серверный Rate Limiting (только для НОВЫХ заказов!)
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

  -- 4. Серверные белые списки и строгая валидация полей (Аудит v4 §2.3)
  IF p_replacement_policy IS NOT NULL AND trim(p_replacement_policy) <> '' THEN
    IF trim(p_replacement_policy) IN ('picker_choice', 'shopper_choice') THEN
      v_replacement_policy := 'picker_choice';
    ELSIF trim(p_replacement_policy) IN ('call_to_agree', 'do_not_replace') THEN
      v_replacement_policy := trim(p_replacement_policy);
    ELSE
      RAISE EXCEPTION 'Invalid replacement policy: %. Allowed values: call_to_agree, picker_choice, do_not_replace', p_replacement_policy;
    END IF;
  ELSE
    v_replacement_policy := 'call_to_agree';
  END IF;

  IF p_customer_messenger IS NOT NULL AND trim(p_customer_messenger) <> '' THEN
    IF trim(p_customer_messenger) NOT IN ('telegram', 'whatsapp', 'phone') THEN
      RAISE EXCEPTION 'Invalid customer messenger: %. Allowed values: telegram, whatsapp, phone', p_customer_messenger;
    END IF;
    v_customer_messenger := trim(p_customer_messenger);
  ELSE
    v_customer_messenger := 'telegram';
  END IF;

  v_customer_name := substring(trim(p_customer_name) from 1 for 100);
  v_customer_phone := substring(trim(p_customer_phone) from 1 for 50);
  v_delivery_address := substring(trim(p_delivery_address) from 1 for 300);
  v_customer_comment := substring(trim(p_customer_comment) from 1 for 500);

  -- 5. Серверный расчёт зоны и стоимости доставки (по координатам или fallback)
  IF p_delivery_lat IS NOT NULL AND p_delivery_lng IS NOT NULL
     AND p_delivery_lat BETWEEN -90 AND 90 AND p_delivery_lng BETWEEN -180 AND 180 THEN

    -- Формула гаверсинусов с коэффициентом извилистости дорог 1.25 (Great Circle Distance * 1.25)
    v_distance_km := 6371.0 * acos(
      LEAST(1.0, GREATEST(-1.0,
        sin(radians(v_market_lat)) * sin(radians(p_delivery_lat)) +
        cos(radians(v_market_lat)) * cos(radians(p_delivery_lat)) * 
        cos(radians(p_delivery_lng) - radians(v_market_lng))
      ))
    ) * 1.25;

    IF v_distance_km <= 1.0 THEN
      v_delivery_zone := 'zone_1';
      v_delivery_fee := 1.00;
    ELSIF v_distance_km <= 3.0 THEN
      v_delivery_zone := 'zone_2';
      v_delivery_fee := 2.00;
    ELSE
      v_delivery_zone := 'zone_3';
      v_delivery_fee := 3.50;
    END IF;
  ELSE
    -- Fallback: координаты не переданы (ручной ввод адреса без GPS).
    -- Защита от занижения: если запрошена zone_1 без координат, безопасно поднимаем до zone_2 ($2.00).
    IF p_delivery_zone IN ('zone_2', 'zone_3') THEN
      v_delivery_zone := p_delivery_zone;
      v_delivery_fee := CASE p_delivery_zone WHEN 'zone_2' THEN 2.00 ELSE 3.50 END;
    ELSE
      v_delivery_zone := 'zone_2';
      v_delivery_fee := 2.00;
    END IF;
  END IF;

  -- 6. Часовой пояс Asia/Phnom_Penh (UTC+7) и предварительная валидация
  v_local_date := (now() AT TIME ZONE 'Asia/Phnom_Penh')::date;
  v_order_id := COALESCE(p_order_id, gen_random_uuid());

  -- 6.1. Строгая валидация целевой даты доставки (не в прошлом и не далее 14 дней)
  IF p_target_delivery_date IS NOT NULL THEN
    IF p_target_delivery_date < v_local_date THEN
      RAISE EXCEPTION 'Invalid target delivery date: cannot be in the past (%)', p_target_delivery_date;
    END IF;
    IF p_target_delivery_date > (v_local_date + INTERVAL '14 days') THEN
      RAISE EXCEPTION 'Invalid target delivery date: exceeds 14 days limit (%)', p_target_delivery_date;
    END IF;
    v_target_date := p_target_delivery_date;
  ELSE
    v_target_date := v_local_date + INTERVAL '1 day';
  END IF;

  -- 6.2. Предварительная валидация состава заказа (до вызова nextval, чтобы исключить холостой расход номеров)
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (
    quantity TEXT,
    requested_qty TEXT
  )
  LOOP
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
  END LOOP;

  -- 6.3. Генерация номера заказа из последовательности ТОЛЬКО после успешной проверки всех полей и позиций
  v_order_number := 'FM-' || to_char(v_local_date, 'YYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 3, '0');

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
    delivery_lat,
    delivery_lng,
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
    p_delivery_lat,
    p_delivery_lng,
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
    delivery_lat = COALESCE(EXCLUDED.delivery_lat, orders.delivery_lat),
    delivery_lng = COALESCE(EXCLUDED.delivery_lng, orders.delivery_lng),
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

    -- Проверка наличия в таблице products
    IF v_item.product_id IS NOT NULL AND v_item.product_id <> '' THEN
      SELECT * INTO v_product FROM public.products WHERE products.id::text = v_item.product_id::text;
      IF NOT FOUND THEN
        v_product := NULL;
        v_item_product_id := NULL;
      ELSE
        v_item_product_id := v_product.id;
      END IF;
    ELSE
      v_product := NULL;
      v_item_product_id := NULL;
    END IF;

    -- Метаданные: приоритет БД, иначе безопасная санитизация кастомных позиций
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

    -- Ограничение ориентировочной цены
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
    'delivery_zone', v_delivery_zone,
    'status', 'pending',
    'created_at', now()
  ) INTO v_result;

  RETURN v_result;
END;
$$;

-- 10. Ограничение прав
REVOKE ALL ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB, NUMERIC, NUMERIC) TO authenticated;
