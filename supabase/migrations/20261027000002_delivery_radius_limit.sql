-- ============================================================================
-- FreshMarket: Delivery Radius Limit, Buffer Zone & Status Consistency Migration
-- Version: 20261027000002_delivery_radius_limit.sql
-- Description:
--   1. Ограничение радиуса доставки:
--      - <= 1.0 км  -> zone_1 ($1.00), статус 'pending'
--      - <= 3.0 км  -> zone_2 ($2.00), статус 'pending'
--      - <= 6.0 км  -> zone_3 ($3.50), статус 'pending' (граница стандартного города)
--      - 6.0–10.0 км -> zone_outside ($3.50), статус 'clarify' (требует согласования)
--      - > 10.0 км   -> Исключение (заказ НЕ МОЖЕТ быть создан)
--   2. Учет статуса 'clarify' в rate limit активных заказов (не более 5)
-- ============================================================================

-- Удаление предыдущей сигнатуры create_order (12 параметров)
DROP FUNCTION IF EXISTS public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB, NUMERIC, NUMERIC);

-- Создание обновленной функции create_order с валидацией радиуса 10 км и статусом clarify
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
  v_last_order_at TIMESTAMPTZ;
  v_local_date DATE;
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
      SELECT order_number, delivery_zone, delivery_fee, status
      INTO v_order_number, v_delivery_zone, v_delivery_fee, v_order_status
      FROM public.orders
      WHERE id = p_order_id AND user_id = v_user_id;

      RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_number', v_order_number,
        'delivery_zone', v_delivery_zone,
        'delivery_fee', v_delivery_fee,
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
    RAISE EXCEPTION 'Rate limit exceeded: please wait 2 minutes between orders';
  END IF;

  -- 4. Лимит активных заявок (pending + clarify + shopping): не более 5
  IF (
    SELECT count(*) FROM public.orders
    WHERE user_id = v_user_id AND status IN ('pending', 'clarify', 'new', 'shopping', 'purchasing')
  ) >= 5 THEN
    RAISE EXCEPTION 'Maximum pending orders limit reached (5). Please wait until your active orders are processed.';
  END IF;

  -- 5. Валидация контактов и позиций
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

  -- Белые списки замены и мессенджера
  IF p_replacement_policy IS NOT NULL AND trim(p_replacement_policy) <> '' THEN
    IF trim(p_replacement_policy) IN ('picker_choice', 'shopper_choice') THEN
      v_replacement_policy := 'picker_choice';
    ELSIF trim(p_replacement_policy) IN ('call_to_agree', 'do_not_replace') THEN
      v_replacement_policy := trim(p_replacement_policy);
    ELSE
      v_replacement_policy := 'call_to_agree';
    END IF;
  ELSE
    v_replacement_policy := 'call_to_agree';
  END IF;

  IF p_customer_messenger IS NOT NULL AND trim(p_customer_messenger) <> '' THEN
    IF trim(p_customer_messenger) IN ('telegram', 'whatsapp', 'phone') THEN
      v_customer_messenger := trim(p_customer_messenger);
    ELSE
      v_customer_messenger := 'telegram';
    END IF;
  ELSE
    v_customer_messenger := 'telegram';
  END IF;

  v_customer_name := substring(trim(p_customer_name) from 1 for 100);
  v_customer_phone := substring(trim(p_customer_phone) from 1 for 50);
  v_delivery_address := substring(trim(p_delivery_address) from 1 for 300);
  v_customer_comment := substring(trim(p_customer_comment) from 1 for 500);

  -- 6. Серверный расчет зоны, стоимости и статуса по расстоянию
  IF p_delivery_lat IS NOT NULL AND p_delivery_lng IS NOT NULL
     AND p_delivery_lat BETWEEN -90 AND 90 AND p_delivery_lng BETWEEN -180 AND 180 THEN

    -- Формула гаверсинусов с коэффициентом извилистости дорог 1.25
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
      -- Вне стандартной зоны города (6–10 км): принимается со статусом 'clarify' для согласования
      v_delivery_zone := 'zone_outside';
      v_delivery_fee := 3.50;
      v_order_status := 'clarify';
    ELSE
      -- Свыше 10 км: заказ НЕ МОЖЕТ быть создан
      RAISE EXCEPTION 'Delivery address is outside delivery service radius (exceeds 10 km limit: % km)', round(v_distance_km::numeric, 1);
    END IF;
  ELSE
    -- Fallback: ручной ввод адреса без GPS. Поднимаем до zone_2 ($2.00) минимум.
    IF p_delivery_zone IN ('zone_2', 'zone_3') THEN
      v_delivery_zone := p_delivery_zone;
      v_delivery_fee := CASE p_delivery_zone WHEN 'zone_2' THEN 2.00 ELSE 3.50 END;
    ELSE
      v_delivery_zone := 'zone_2';
      v_delivery_fee := 2.00;
    END IF;
    v_order_status := 'pending';
  END IF;

  -- 7. Дата доставки и номер заказа
  v_local_date := (now() AT TIME ZONE 'Asia/Phnom_Penh')::date;
  v_order_id := COALESCE(p_order_id, gen_random_uuid());

  IF p_target_delivery_date IS NOT NULL THEN
    IF p_target_delivery_date < v_local_date THEN
      RAISE EXCEPTION 'Invalid target delivery date: cannot be in the past (%)', p_target_delivery_date;
    END IF;
    IF p_target_delivery_date > (v_local_date + INTERVAL '14 days') THEN
      RAISE EXCEPTION 'Invalid target delivery date: exceeds 14 days limit (%)', p_target_delivery_date;
    END IF;
  END IF;

  v_order_number := 'FM-' || to_char(v_local_date, 'YYYYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 4, '0');

  -- 8. Атомарное создание заказа
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
    service_percent,
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
    p_target_delivery_date,
    v_replacement_policy,
    v_replacement_policy,
    v_order_status,
    'pending',
    'cash',
    10.00,
    0.00,
    0.00,
    0.00,
    0.00,
    v_delivery_fee,
    now(),
    now()
  );

  -- 9. Вставка позиций заказа
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
      v_item_price,
      0.00,
      'pending',
      now()
    );
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', v_order_id,
    'order_number', v_order_number,
    'delivery_zone', v_delivery_zone,
    'delivery_fee', v_delivery_fee,
    'status', v_order_status
  );
END;
$$;

-- Права доступа
REVOKE ALL ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB, NUMERIC, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB, NUMERIC, NUMERIC) TO authenticated;
