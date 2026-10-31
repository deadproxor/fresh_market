-- ============================================================================
-- FreshMarket: Admin Settings & Dynamic Service Rules Migration
-- Version: 20261031000000_admin_settings_and_dynamic_service_rules.sql
-- Description:
--   1. Создание защищенной таблицы public.admin_settings для приватных интеграций
--      (Cloudinary, Gemini AI, параметры хранилища) с доступом строго для admin.
--   2. Начальное заполнение публичных правил сервиса в public.service_settings
--      ('service_rules': комиссия 10%, тарифы зон $1 / $2 / $3.50, дедлайн 23:00,
--       интервал доставки 09:00-12:00, условия оплаты).
--   3. Обновление функции create_order для динамического расчета комиссии
--      и тарифов доставки на основе данных из public.service_settings.
-- ============================================================================

-- 1. Таблица приватных настроек администратора (Zero-Storage / Cloud Sync)
CREATE TABLE IF NOT EXISTS public.admin_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Включаем Row Level Security
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Закрываем доступ всем публичным/анонимным пользователям и клиентам витрины
REVOKE ALL ON public.admin_settings FROM anon, public;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_settings TO authenticated;

-- Политика: полный доступ только пользователю с ролью admin
DROP POLICY IF EXISTS "Allow admin all on admin_settings" ON public.admin_settings;
CREATE POLICY "Allow admin all on admin_settings"
  ON public.admin_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 2. Начальное заполнение публичных правил сервиса в service_settings
INSERT INTO public.service_settings (key, value, description)
VALUES (
  'service_rules',
  '{
    "service_fee_percent": 10.0,
    "zones": {
      "zone_1": 1.00,
      "zone_2": 2.00,
      "zone_3": 3.50
    },
    "cutoff_time": "23:00",
    "delivery_window": {
      "start": "09:00",
      "end": "12:00"
    },
    "payment_methods": "Наличные или перевод по факту доставки"
  }'::jsonb,
  'Глобальные тарифы комиссий, зон доставки и график работы сервиса'
)
ON CONFLICT (key) DO NOTHING;

-- 3. Обновление серверной функции создания заказа с динамическими правилами
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
  v_service_fee_percent NUMERIC(5, 2) := 10.00;
  v_zone_1_fee NUMERIC(10, 2) := 1.00;
  v_zone_2_fee NUMERIC(10, 2) := 2.00;
  v_zone_3_fee NUMERIC(10, 2) := 3.50;
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
        'idempotent', true
      );
    END IF;
  END IF;

  -- 3. Защита от спама (Rate Limiting)
  SELECT MAX(created_at) INTO v_last_order_at
  FROM public.orders
  WHERE user_id = v_user_id;

  IF v_last_order_at IS NOT NULL AND (now() - v_last_order_at) < INTERVAL '3 seconds' THEN
    RAISE EXCEPTION 'Rate limit exceeded: please wait a few seconds before creating another order';
  END IF;

  -- 4. Лимит активных заказов (не более 5)
  IF (SELECT COUNT(*) FROM public.orders WHERE user_id = v_user_id AND status IN ('pending', 'new', 'accepted', 'clarify', 'shopping', 'purchasing', 'delivering')) >= 5 THEN
    RAISE EXCEPTION 'Active orders limit reached (maximum 5 concurrent orders)';
  END IF;

  -- 5. Валидация входных данных
  v_customer_name := btrim(COALESCE(p_customer_name, ''));
  IF length(v_customer_name) < 2 OR length(v_customer_name) > 100 THEN
    RAISE EXCEPTION 'Customer name must be between 2 and 100 characters';
  END IF;

  v_customer_phone := btrim(COALESCE(p_customer_phone, ''));
  IF length(v_customer_phone) < 6 OR length(v_customer_phone) > 30 THEN
    RAISE EXCEPTION 'Customer phone must be between 6 and 30 characters';
  END IF;

  v_delivery_address := btrim(COALESCE(p_delivery_address, ''));
  IF length(v_delivery_address) < 3 OR length(v_delivery_address) > 300 THEN
    RAISE EXCEPTION 'Delivery address must be between 3 and 300 characters';
  END IF;

  v_customer_messenger := btrim(COALESCE(p_customer_messenger, ''));
  IF length(v_customer_messenger) > 100 THEN
    RAISE EXCEPTION 'Customer messenger username cannot exceed 100 characters';
  END IF;

  v_customer_comment := btrim(COALESCE(p_customer_comment, ''));
  IF length(v_customer_comment) > 500 THEN
    RAISE EXCEPTION 'Customer comment cannot exceed 500 characters';
  END IF;

  v_replacement_policy := COALESCE(p_replacement_policy, 'call');
  IF v_replacement_policy NOT IN ('call', 'substitute', 'ignore') THEN
    v_replacement_policy := 'call';
  END IF;

  -- Валидация даты доставки с учетом местного времени рынка (UTC+7)
  v_local_time := timezone('Asia/Phnom_Penh', now());
  v_local_date := v_local_time::DATE;
  v_current_hour := EXTRACT(HOUR FROM v_local_time)::INT;

  -- Дедлайн в 23:00 UTC+7:
  IF v_current_hour >= 23 THEN
    v_min_delivery_date := v_local_date + INTERVAL '2 day';
  ELSIF v_current_hour < 5 THEN
    v_min_delivery_date := v_local_date + INTERVAL '1 day';
  ELSE
    v_min_delivery_date := v_local_date + INTERVAL '1 day';
  END IF;

  IF p_target_delivery_date IS NULL OR p_target_delivery_date < v_min_delivery_date THEN
    v_target_delivery_date := v_min_delivery_date;
  ELSE
    v_target_delivery_date := p_target_delivery_date;
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order items array cannot be empty';
  END IF;

  IF jsonb_array_length(p_items) > 50 THEN
    RAISE EXCEPTION 'Order items limit exceeded: maximum 50 items allowed per order';
  END IF;

  -- 6. Чтение курса KHR и динамических правил сервиса из service_settings
  BEGIN
    SELECT COALESCE((value->>'rate')::numeric, 4000.00) INTO v_khr_rate
    FROM public.service_settings
    WHERE key = 'khr_rate';
    IF v_khr_rate IS NULL OR v_khr_rate <= 0 THEN
      v_khr_rate := 4000.00;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_khr_rate := 4000.00;
  END;

  BEGIN
    SELECT 
      COALESCE((value->>'service_fee_percent')::numeric, 10.00),
      COALESCE((value->'zones'->>'zone_1')::numeric, 1.00),
      COALESCE((value->'zones'->>'zone_2')::numeric, 2.00),
      COALESCE((value->'zones'->>'zone_3')::numeric, 3.50)
    INTO 
      v_service_fee_percent,
      v_zone_1_fee,
      v_zone_2_fee,
      v_zone_3_fee
    FROM public.service_settings
    WHERE key = 'service_rules';

    IF v_service_fee_percent IS NULL OR v_service_fee_percent < 0 THEN
      v_service_fee_percent := 10.00;
    END IF;
    IF v_zone_1_fee IS NULL OR v_zone_1_fee < 0 THEN v_zone_1_fee := 1.00; END IF;
    IF v_zone_2_fee IS NULL OR v_zone_2_fee < 0 THEN v_zone_2_fee := 2.00; END IF;
    IF v_zone_3_fee IS NULL OR v_zone_3_fee < 0 THEN v_zone_3_fee := 3.50; END IF;
  EXCEPTION WHEN OTHERS THEN
    v_service_fee_percent := 10.00;
    v_zone_1_fee := 1.00;
    v_zone_2_fee := 2.00;
    v_zone_3_fee := 3.50;
  END;

  -- 7. Серверный расчет расстояния и зоны доставки (радиус 10 км)
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
      v_delivery_fee := v_zone_1_fee;
      v_order_status := 'pending';
    ELSIF v_distance_km <= 3.0 THEN
      v_delivery_zone := 'zone_2';
      v_delivery_fee := v_zone_2_fee;
      v_order_status := 'pending';
    ELSIF v_distance_km <= 6.0 THEN
      v_delivery_zone := 'zone_3';
      v_delivery_fee := v_zone_3_fee;
      v_order_status := 'pending';
    ELSIF v_distance_km <= 10.0 THEN
      v_delivery_zone := 'zone_outside';
      v_delivery_fee := v_zone_3_fee;
      v_order_status := 'clarify';
    ELSE
      RAISE EXCEPTION 'Delivery address is outside delivery service radius (exceeds 10 km limit: % km)', round(v_distance_km::numeric, 1);
    END IF;
  ELSE
    IF p_delivery_zone = 'zone_1' THEN
      v_delivery_zone := 'zone_1';
      v_delivery_fee := v_zone_1_fee;
    ELSIF p_delivery_zone = 'zone_3' THEN
      v_delivery_zone := 'zone_3';
      v_delivery_fee := v_zone_3_fee;
    ELSE
      v_delivery_zone := 'zone_2';
      v_delivery_fee := v_zone_2_fee;
    END IF;
    v_order_status := 'pending';
  END IF;

  -- 8. Генерация читаемого номера заказа (FM-XXXXXX)
  v_order_number := 'FM-' || upper(substring(replace(gen_random_uuid()::text, '-', '') from 1 for 6));

  -- 9. Создание записи в таблице orders
  v_order_id := COALESCE(p_order_id, gen_random_uuid());

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
    customer_notes,
    replacement_policy,
    status,
    target_delivery_date,
    delivery_lat,
    delivery_lng,
    service_percent,
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
    v_customer_comment,
    v_replacement_policy,
    v_order_status,
    v_target_delivery_date,
    p_delivery_lat,
    p_delivery_lng,
    v_service_fee_percent,
    now(),
    now()
  );

  -- 10. Валидация и вставка позиций заказа (order_items)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULL;
    IF v_item ? 'product_id' AND v_item->>'product_id' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      v_product_id := (v_item->>'product_id')::UUID;
    END IF;

    v_product_title := btrim(COALESCE(v_item->>'title', 'Товар'));
    IF length(v_product_title) > 200 THEN
      v_product_title := substring(v_product_title from 1 for 200);
    END IF;

    v_product_name_ru := btrim(COALESCE(v_item->>'name_ru', v_product_title));
    v_product_name_en := btrim(COALESCE(v_item->>'name_en', ''));
    v_product_name_kh := btrim(COALESCE(v_item->>'name_kh', ''));
    v_product_category := btrim(COALESCE(v_item->>'category', 'other'));
    v_product_form := btrim(COALESCE(v_item->>'form', ''));
    v_product_img_url := btrim(COALESCE(v_item->>'img_url', ''));

    v_quantity := COALESCE((v_item->>'quantity')::NUMERIC, 1.0);
    IF v_quantity <= 0 OR v_quantity > 1000 THEN
      RAISE EXCEPTION 'Item quantity must be between 0.001 and 1000 (got: %)', v_quantity;
    END IF;

    v_unit := btrim(COALESCE(v_item->>'unit', 'kg'));
    IF length(v_unit) > 20 THEN
      v_unit := substring(v_unit from 1 for 20);
    END IF;

    v_item_comment := btrim(COALESCE(v_item->>'comment', ''));
    IF length(v_item_comment) > 300 THEN
      v_item_comment := substring(v_item_comment from 1 for 300);
    END IF;

    v_item_price := COALESCE((v_item->>'price')::NUMERIC, 0.00);
    IF v_item_price < 0 THEN
      v_item_price := 0.00;
    END IF;

    -- Конвертация каталожной цены KHR (>= 500) в USD
    IF v_item_price >= 500 THEN
      v_item_usd := round((v_item_price / v_khr_rate)::numeric, 2);
    ELSE
      v_item_usd := v_item_price;
    END IF;

    v_items_total_usd := v_items_total_usd + (v_item_usd * v_quantity);

    INSERT INTO public.order_items (
      order_id,
      product_id,
      title,
      name_ru,
      name_en,
      name_kh,
      category,
      form,
      img_url,
      quantity,
      requested_quantity,
      unit,
      customer_comment,
      estimated_price,
      actual_price,
      status,
      created_at
    ) VALUES (
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

  -- 11. Обновление итоговых сумм заказа (товары + динамический сервисный сбор + доставка)
  v_service_fee_usd := round((v_items_total_usd * (v_service_fee_percent / 100.0))::numeric, 2);
  v_grand_total_usd := round((v_items_total_usd + v_service_fee_usd + v_delivery_fee)::numeric, 2);

  UPDATE public.orders
  SET estimated_total = v_items_total_usd,
      market_items_total = v_items_total_usd,
      service_fee = v_service_fee_usd,
      service_percent = v_service_fee_percent,
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

