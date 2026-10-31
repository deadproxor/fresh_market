-- ============================================================================
-- FreshBuddy / FreshMarket: Order Totals Calculation in create_order RPC
-- Version: 20261030000000_calculate_order_totals_in_create_order.sql
-- Description:
--   1. Вычисление суммы товаров (estimated_total / market_items_total),
--      сервисного сбора 10% (service_fee) и общей суммы к оплате (grand_total)
--      при атомарном создании заказа через RPC create_order.
--   2. Поддержка как цен позиций в USD (< 500), так и каталожных цен в KHR (>= 500)
--      с учетом курса из service_settings.khr_exchange_rate (по умолчанию 4000).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_order(
  p_order_id UUID,
  p_customer_name TEXT,
  p_customer_phone TEXT,
  p_customer_messenger TEXT,
  p_delivery_address TEXT,
  p_delivery_zone TEXT,
  p_customer_comment TEXT,
  p_replacement_policy TEXT,
  p_target_delivery_date DATE,
  p_items JSONB,
  p_delivery_lat NUMERIC DEFAULT NULL,
  p_delivery_lng NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_order_id UUID;
  v_order_number TEXT;
  v_order_status TEXT := 'pending';
  v_delivery_zone TEXT;
  v_delivery_fee NUMERIC(10, 2);
  v_replacement_policy TEXT;
  v_customer_messenger TEXT;
  v_customer_name TEXT;
  v_customer_phone TEXT;
  v_delivery_address TEXT;
  v_customer_comment TEXT;
  v_distance_km NUMERIC;
  v_item JSONB;
  v_product_id UUID;
  v_product_title TEXT;
  v_product_name_ru TEXT;
  v_product_name_en TEXT;
  v_product_name_kh TEXT;
  v_product_category TEXT;
  v_product_form TEXT;
  v_product_img_url TEXT;
  v_quantity NUMERIC(10, 3);
  v_unit TEXT;
  v_item_comment TEXT;
  v_item_price NUMERIC(10, 2);
  v_item_usd NUMERIC(10, 2);
  v_items_total_usd NUMERIC(10, 2) := 0.00;
  v_service_fee_usd NUMERIC(10, 2) := 0.00;
  v_grand_total_usd NUMERIC(10, 2) := 0.00;
  v_khr_rate NUMERIC(10, 2) := 4000.00;
  v_last_order_at TIMESTAMPTZ;
  v_local_time TIMESTAMP;
  v_local_date DATE;
  v_current_hour INT;
  v_min_delivery_date DATE;
  v_target_delivery_date DATE;
  v_market_lat CONSTANT NUMERIC := 10.6120;
  v_market_lng CONSTANT NUMERIC := 104.1780;
BEGIN
  -- 1. Верификация аутентификации
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: user must be signed in to create an order';
  END IF;

  -- Сериализация одновременных вызовов create_order для пользователя
  PERFORM pg_advisory_xact_lock(hashtext('create_order'), hashtext(v_user_id::text));

  -- 2. Идемпотентность по p_order_id
  IF p_order_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND user_id = v_user_id) THEN
      SELECT order_number, delivery_zone, delivery_fee, status, target_delivery_date,
             market_items_total, service_fee, grand_total
      INTO v_order_number, v_delivery_zone, v_delivery_fee, v_order_status, v_target_delivery_date,
           v_items_total_usd, v_service_fee_usd, v_grand_total_usd
      FROM public.orders
      WHERE id = p_order_id AND user_id = v_user_id;

      RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_number', v_order_number,
        'delivery_zone', v_delivery_zone,
        'delivery_fee', v_delivery_fee,
        'market_items_total', v_items_total_usd,
        'service_fee', v_service_fee_usd,
        'grand_total', v_grand_total_usd,
        'target_delivery_date', v_target_delivery_date,
        'status', v_order_status,
        'is_duplicate', true
      );
    ELSIF EXISTS (SELECT 1 FROM public.orders WHERE id = p_order_id AND user_id <> v_user_id) THEN
      RAISE EXCEPTION 'Invalid order id: order belongs to another user';
    END IF;
  END IF;

  -- 3. Rate Limiting: не чаще 1 заказа в 2 минуты
  SELECT created_at INTO v_last_order_at
  FROM public.orders
  WHERE user_id = v_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_last_order_at IS NOT NULL AND (now() - v_last_order_at) < INTERVAL '2 minutes' THEN
    RAISE EXCEPTION 'Rate limit exceeded: please wait % seconds before placing another order',
      round(EXTRACT(EPOCH FROM (INTERVAL '2 minutes' - (now() - v_last_order_at))));
  END IF;

  -- 4. Лимит активных заявок (не более 5 в обработке)
  IF (
    SELECT count(*) FROM public.orders
    WHERE user_id = v_user_id AND status IN ('pending', 'new', 'accepted', 'clarify', 'shopping', 'purchasing')
  ) >= 5 THEN
    RAISE EXCEPTION 'Active orders limit reached: you cannot have more than 5 pending orders at once';
  END IF;

  -- 5. Валидация входных данных
  v_customer_name := substring(trim(COALESCE(p_customer_name, '')) from 1 for 100);
  IF length(v_customer_name) < 2 THEN
    RAISE EXCEPTION 'Customer name is too short (minimum 2 characters)';
  END IF;

  v_customer_phone := substring(trim(COALESCE(p_customer_phone, '')) from 1 for 30);
  IF length(v_customer_phone) < 6 THEN
    RAISE EXCEPTION 'Customer phone is too short (minimum 6 characters)';
  END IF;

  v_customer_messenger := lower(trim(COALESCE(p_customer_messenger, 'telegram')));
  IF v_customer_messenger NOT IN ('telegram', 'whatsapp', 'phone') THEN
    v_customer_messenger := 'telegram';
  END IF;

  v_delivery_address := substring(trim(COALESCE(p_delivery_address, '')) from 1 for 300);
  IF length(v_delivery_address) < 3 THEN
    RAISE EXCEPTION 'Delivery address is too short (minimum 3 characters)';
  END IF;

  v_replacement_policy := lower(trim(COALESCE(p_replacement_policy, 'call_to_agree')));
  IF v_replacement_policy NOT IN ('call_to_agree', 'picker_choice', 'do_not_replace') THEN
    v_replacement_policy := 'call_to_agree';
  END IF;

  v_customer_comment := substring(trim(COALESCE(p_customer_comment, '')) from 1 for 500);

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order items cannot be empty';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Order items limit exceeded: maximum 50 items allowed per order';
  END IF;

  -- Чтение активного курса KHR из service_settings (если таблица существует)
  BEGIN
    SELECT COALESCE(khr_exchange_rate, 4000.00) INTO v_khr_rate
    FROM public.service_settings
    WHERE id = 1;
    IF v_khr_rate IS NULL OR v_khr_rate <= 0 THEN
      v_khr_rate := 4000.00;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_khr_rate := 4000.00;
  END;

  -- 6. Серверный расчет расстояния и зоны доставки (радиус 10 км)
  IF p_delivery_lat IS NOT NULL AND p_delivery_lng IS NOT NULL THEN
    IF p_delivery_lat < 8.0 OR p_delivery_lat > 15.0 OR p_delivery_lng < 100.0 OR p_delivery_lng > 110.0 THEN
      RAISE EXCEPTION 'Delivery coordinates are out of region bounds (lat: %, lng: %)', p_delivery_lat, p_delivery_lng;
    END IF;

    v_distance_km := (
      6371 * acos(
        least(1.0, greatest(-1.0,
          cos(radians(v_market_lat)) * cos(radians(p_delivery_lat)) *
          cos(radians(p_delivery_lng) - radians(v_market_lng)) +
          sin(radians(v_market_lat)) * sin(radians(p_delivery_lat))
        ))
      )
    ) * 1.25;

    IF v_distance_km <= 1.0 THEN
      v_delivery_zone := 'zone_1';
      v_delivery_fee := 1.00;
      v_order_status := 'pending';
    ELSIF v_distance_km <= 3.0 THEN
      v_delivery_zone := 'zone_2';
      v_delivery_fee := 2.00;
      v_order_status := 'pending';
    ELSIF v_distance_km <= 6.0 THEN
      v_delivery_zone := 'zone_3';
      v_delivery_fee := 3.50;
      v_order_status := 'pending';
    ELSIF v_distance_km <= 10.0 THEN
      v_delivery_zone := 'zone_outside';
      v_delivery_fee := 3.50;
      v_order_status := 'clarify';
    ELSE
      RAISE EXCEPTION 'Delivery address is outside delivery service radius (exceeds 10 km limit: % km)', round(v_distance_km::numeric, 1);
    END IF;
  ELSE
    IF p_delivery_zone IN ('zone_2', 'zone_3') THEN
      v_delivery_zone := p_delivery_zone;
      v_delivery_fee := CASE p_delivery_zone WHEN 'zone_2' THEN 2.00 ELSE 3.50 END;
    ELSE
      v_delivery_zone := 'zone_2';
      v_delivery_fee := 2.00;
    END IF;
    v_order_status := 'pending';
  END IF;

  -- 7. Дата доставки с учетом дедлайна 23:00 UTC+7 (Asia/Phnom_Penh)
  v_local_time := now() AT TIME ZONE 'Asia/Phnom_Penh';
  v_local_date := v_local_time::date;
  v_current_hour := EXTRACT(HOUR FROM v_local_time);
  v_order_id := COALESCE(p_order_id, gen_random_uuid());

  IF v_current_hour >= 23 THEN
    v_min_delivery_date := v_local_date + INTERVAL '2 days';
  ELSIF v_current_hour < 5 THEN
    v_min_delivery_date := v_local_date + INTERVAL '1 day';
  ELSE
    v_min_delivery_date := v_local_date + INTERVAL '1 day';
  END IF;

  IF p_target_delivery_date IS NOT NULL THEN
    IF p_target_delivery_date < v_min_delivery_date THEN
      v_target_delivery_date := v_min_delivery_date;
    ELSIF p_target_delivery_date > (v_local_date + INTERVAL '14 days') THEN
      RAISE EXCEPTION 'Invalid target delivery date: exceeds 14 days limit (%)', p_target_delivery_date;
    ELSE
      v_target_delivery_date := p_target_delivery_date;
    END IF;
  ELSE
    v_target_delivery_date := v_min_delivery_date;
  END IF;

  v_order_number := 'FB-' || to_char(v_local_date, 'YYYYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 4, '0');

  -- 8. Первичное создание записи заказа
  INSERT INTO public.orders (
    id,
    order_number,
    user_id,
    customer_name,
    customer_phone,
    customer_messenger,
    delivery_address,
    delivery_zone,
    delivery_fee,
    delivery_lat,
    delivery_lng,
    customer_notes,
    customer_comment,
    target_delivery_date,
    replacement_policy,
    replace_rule,
    status,
    payment_status,
    payment_method,
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
    v_customer_name,
    v_customer_phone,
    v_customer_messenger,
    v_delivery_address,
    v_delivery_zone,
    v_delivery_fee,
    p_delivery_lat,
    p_delivery_lng,
    v_customer_comment,
    v_customer_comment,
    v_target_delivery_date,
    v_replacement_policy,
    v_replacement_policy,
    v_order_status,
    'pending',
    'cash',
    0.00,
    0.00,
    0.00,
    0.00,
    v_delivery_fee,
    now(),
    now()
  );

  -- 9. Вставка позиций заказа и подсчет суммы товаров
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULL;
    IF (v_item->>'product_id') IS NOT NULL AND trim(v_item->>'product_id') <> '' THEN
      BEGIN
        v_product_id := (v_item->>'product_id')::uuid;
      EXCEPTION WHEN OTHERS THEN
        v_product_id := NULL;
      END;
    END IF;

    v_product_title := substring(trim(COALESCE(v_item->>'product_title', 'Товар')) from 1 for 150);
    v_product_name_ru := substring(trim(COALESCE(v_item->>'product_name_ru', '')) from 1 for 150);
    v_product_name_en := substring(trim(COALESCE(v_item->>'product_name_en', '')) from 1 for 150);
    v_product_name_kh := substring(trim(COALESCE(v_item->>'product_name_kh', '')) from 1 for 150);
    v_product_category := substring(trim(COALESCE(v_item->>'product_category', '')) from 1 for 50);
    v_product_form := substring(trim(COALESCE(v_item->>'product_form', '')) from 1 for 50);
    v_product_img_url := substring(trim(COALESCE(v_item->>'product_img_url', '')) from 1 for 500);

    v_quantity := COALESCE(NULLIF(v_item->>'quantity', '')::numeric, 1.0);
    IF v_quantity <= 0 OR v_quantity > 500 THEN
      RAISE EXCEPTION 'Invalid item quantity: %. Must be between 0.001 and 500', v_quantity;
    END IF;

    v_unit := substring(trim(COALESCE(v_item->>'unit', 'кг')) from 1 for 20);
    v_item_comment := substring(trim(COALESCE(v_item->>'customer_comment', '')) from 1 for 300);
    v_item_price := COALESCE(NULLIF(v_item->>'estimated_price', '')::numeric, 0.00);

    -- Если передана цена в USD (< 500), она уже содержит стоимость позиции;
    -- если передана цена в KHR (>= 500), переводим в USD по курсу v_khr_rate
    IF v_item_price >= 500 THEN
      IF lower(v_unit) IN ('г', 'g', 'ក្រាម') OR v_quantity >= 50 THEN
        v_item_usd := round(((v_item_price * (v_quantity / 1000.0)) / v_khr_rate)::numeric, 2);
      ELSE
        v_item_usd := round(((v_item_price * v_quantity) / v_khr_rate)::numeric, 2);
      END IF;
    ELSIF v_item_price > 0 THEN
      v_item_usd := round(v_item_price::numeric, 2);
    ELSE
      v_item_usd := 0.00;
    END IF;

    v_items_total_usd := v_items_total_usd + v_item_usd;

    INSERT INTO public.order_items (
      id,
      order_id,
      product_id,
      product_title,
      product_name_ru,
      product_name_en,
      product_name_kh,
      product_category,
      product_form,
      product_img_url,
      quantity,
      requested_qty,
      unit,
      customer_comment,
      estimated_price,
      actual_cost,
      status,
      created_at
    ) VALUES (
      COALESCE(NULLIF(v_item->>'id', '')::uuid, gen_random_uuid()),
      v_order_id,
      v_product_id,
      v_product_title,
      v_product_name_ru,
      v_product_name_en,
      v_product_name_kh,
      v_product_category,
      v_product_form,
      v_product_img_url,
      v_quantity,
      v_quantity,
      v_unit,
      v_item_comment,
      v_item_usd,
      0.00,
      'pending',
      now()
    );
  END LOOP;

  -- 10. Обновление итоговых сумм заказа (товары + 10% сервисный сбор + доставка)
  v_service_fee_usd := round((v_items_total_usd * 0.10)::numeric, 2);
  v_grand_total_usd := round((v_items_total_usd + v_service_fee_usd + v_delivery_fee)::numeric, 2);

  UPDATE public.orders
  SET estimated_total = v_items_total_usd,
      market_items_total = v_items_total_usd,
      service_fee = v_service_fee_usd,
      grand_total = v_grand_total_usd
  WHERE id = v_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'delivery_zone', v_delivery_zone,
    'delivery_fee', v_delivery_fee,
    'market_items_total', v_items_total_usd,
    'service_fee', v_service_fee_usd,
    'grand_total', v_grand_total_usd,
    'target_delivery_date', v_target_delivery_date,
    'status', v_order_status
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB, NUMERIC, NUMERIC) TO authenticated;

