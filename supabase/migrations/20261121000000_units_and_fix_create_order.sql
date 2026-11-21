-- ============================================================================
-- FreshMarket Migration: 20261121000000_units_and_fix_create_order.sql
-- Description:
--   1. Добавление колонки allowed_units (TEXT[]) в public.products и нормализация unit
--   2. Исправление create_order(): обогащение из public.products, поддержка
--      обоих форматов ключей (product_title/title и др.), канонизация unit,
--      корректный расчёт цены с учётом размерностей (kg/g/l/ml/pc/bunch...)
--   3. Восстановление позиций уже созданных заказов (где записалось 'Товар')
-- ============================================================================

-- 1. Расширение таблицы products колонкой allowed_units
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS allowed_units TEXT[] DEFAULT NULL;

-- 2. Хелпер нормализации канонического slug единицы заказа
CREATE OR REPLACE FUNCTION public.normalize_order_unit(p_raw TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_norm TEXT;
BEGIN
  v_norm := lower(btrim(COALESCE(p_raw, '')));
  v_norm := regexp_replace(v_norm, '\.$', '');

  IF v_norm = '' THEN
    RETURN 'kg';
  ELSIF v_norm IN ('kg', '1_kg', 'кг', '1 кг', '1 kg', 'кило', 'кіло', 'គីឡូ') THEN
    RETURN 'kg';
  ELSIF v_norm IN ('g', '500_g', '250_g', '100_g', 'г', 'гр', 'gr', 'gram', 'grams', 'грамм', 'грам', 'ក្រាម', '500 г', '250 г', '100 г') THEN
    RETURN 'g';
  ELSIF v_norm IN ('pc', 'pcs', '1_pc', '10_pcs', 'шт', '1 шт', '10 шт', '1 pc', 'piece', 'pieces', 'pièce', 'pièces', 'штук', 'ផ្លែ', 'គ្រាប់') THEN
    RETURN 'pc';
  ELSIF v_norm IN ('bunch', '1_bunch', 'пучок', '1 пучок', 'пуч', 'связка', 'bunches', 'botte', 'បាច់') THEN
    RETURN 'bunch';
  ELSIF v_norm IN ('pack', '1_pack', 'упак', '1 упак', 'упаковка', 'пачка', 'packs', 'paquet', 'កញ្ចប់') THEN
    RETURN 'pack';
  ELSIF v_norm IN ('tray', '1_tray', 'лоток', '1 лоток', 'trays', 'barquette', 'ថាស') THEN
    RETURN 'tray';
  ELSIF v_norm IN ('bottle', '1_bottle', 'бут', '1 бут', 'бутылка', 'bottles', 'bouteille', 'ដប') THEN
    RETURN 'bottle';
  ELSIF v_norm IN ('ml', 'мл', 'milliliter', 'មីលីលីត្រ') THEN
    RETURN 'ml';
  ELSIF v_norm IN ('l', '1_l', '0_7_l', '0_5_l', '0_2_l', 'л', '1 л', '0.5 л', '0.7 л', '0.2 л', 'литр', 'літр', 'liter', 'litre', 'លីត្រ') THEN
    RETURN 'l';
  END IF;

  RETURN substring(v_norm from 1 for 20);
END;
$$;

-- 3. Хелпер подбора умных разрешённых размерностей по категории, форме и базовой единице
CREATE OR REPLACE FUNCTION public.default_allowed_units(p_cat TEXT, p_form TEXT, p_unit TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_cat TEXT := lower(btrim(COALESCE(p_cat, '')));
  v_form TEXT := lower(btrim(COALESCE(p_form, '')));
  v_base TEXT := public.normalize_order_unit(p_unit);
  v_units TEXT[];
BEGIN
  IF v_form LIKE '%бутылк%' OR v_form LIKE '%bottle%' OR v_form LIKE '%жидк%' OR v_form LIKE '%соус%'
     OR v_cat = 'sauces' OR v_base IN ('bottle', 'l', 'ml') THEN
    v_units := ARRAY['bottle', 'l', 'ml'];
  ELSIF v_form LIKE '%пучок%' OR v_form LIKE '%bunch%' OR v_form LIKE '%связк%'
     OR v_cat = 'herbs' OR v_base = 'bunch' THEN
    v_units := ARRAY['bunch', 'g', 'kg'];
  ELSIF v_cat IN ('fruits', 'vegetables', 'roots_tubers') THEN
    v_units := ARRAY['kg', 'g', 'pc'];
  ELSIF v_cat = 'spices_roots' THEN
    v_units := ARRAY['g', 'kg', 'bunch', 'pc'];
  ELSIF v_cat = 'dairy_eggs' THEN
    IF v_base IN ('tray', 'pc') THEN
      v_units := ARRAY['pc', 'tray', 'pack'];
    ELSE
      v_units := ARRAY['pc', 'pack', 'kg', 'g'];
    END IF;
  ELSIF v_cat IN ('seafood', 'meat') THEN
    IF v_form = '' OR v_form LIKE '%цел%' OR v_form LIKE '%whole%' THEN
      v_units := ARRAY['kg', 'g', 'pc'];
    ELSE
      v_units := ARRAY['kg', 'g'];
    END IF;
  ELSIF v_cat IN ('mushrooms', 'grains_noodles', 'legumes_nuts') THEN
    v_units := ARRAY['kg', 'g', 'pack'];
  ELSIF v_cat IN ('homemade', 'street_exotic') THEN
    v_units := ARRAY['pc', 'pack', 'g', 'kg'];
  ELSE
    v_units := ARRAY['kg', 'g', 'pc', 'pack'];
  END IF;

  -- Гарантируем, что базовая единица товара присутствует первой
  IF v_base = ANY(v_units) THEN
    RETURN ARRAY[v_base] || array_remove(v_units, v_base);
  ELSE
    RETURN ARRAY[v_base] || v_units;
  END IF;
END;
$$;

-- 4. Нормализация products.unit к каноническим slug-ключам и заполнение allowed_units
UPDATE public.products
SET unit = CASE lower(btrim(COALESCE(unit, '')))
  WHEN '1 кг' THEN '1_kg'
  WHEN '1 kg' THEN '1_kg'
  WHEN 'кг' THEN '1_kg'
  WHEN '500 г' THEN '500_g'
  WHEN '250 г' THEN '250_g'
  WHEN '100 г' THEN '100_g'
  WHEN '1 шт' THEN '1_pc'
  WHEN 'шт' THEN '1_pc'
  WHEN '10 шт' THEN '10_pcs'
  WHEN '1 пучок' THEN '1_bunch'
  WHEN 'пучок' THEN '1_bunch'
  WHEN '1 упак' THEN '1_pack'
  WHEN 'упак' THEN '1_pack'
  WHEN '1 лоток' THEN '1_tray'
  WHEN 'лоток' THEN '1_tray'
  WHEN '1 бут' THEN '1_bottle'
  WHEN 'бут' THEN '1_bottle'
  WHEN '0.2 л' THEN '0_2_l'
  WHEN '0.5 л' THEN '0_5_l'
  WHEN '0.7 л' THEN '0_7_l'
  WHEN '1 л' THEN '1_l'
  WHEN '' THEN '1_kg'
  ELSE unit
END
WHERE unit IS NULL OR unit ~ '[\sа-яА-ЯёЁ\.]';

-- Исправление дефолтного '1_kg' у товаров без цены, у которых форма явно пучок/бутылка
UPDATE public.products
SET unit = '1_bunch'
WHERE price IS NULL
  AND unit = '1_kg'
  AND (lower(COALESCE(form, '')) LIKE '%пучок%' OR lower(COALESCE(form, '')) LIKE '%bunch%');

UPDATE public.products
SET unit = '1_bottle'
WHERE price IS NULL
  AND unit = '1_kg'
  AND (lower(COALESCE(form, '')) LIKE '%бутылк%' OR lower(COALESCE(form, '')) LIKE '%bottle%' OR lower(COALESCE(form, '')) LIKE '%жидк%');

UPDATE public.products
SET allowed_units = public.default_allowed_units(category, form, unit)
WHERE allowed_units IS NULL OR cardinality(allowed_units) = 0;

-- 5. Исправленная RPC-функция create_order()
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
  v_product RECORD;
  v_product_id UUID;
  v_product_title TEXT;
  v_product_name_ru TEXT;
  v_product_name_en TEXT;
  v_product_name_kh TEXT;
  v_product_category TEXT;
  v_product_form TEXT;
  v_product_img_url TEXT;
  v_product_unit TEXT;
  v_raw_qty TEXT;
  v_num_str TEXT;
  v_quantity NUMERIC(10, 3);
  v_unit TEXT;
  v_item_comment TEXT;
  v_item_price NUMERIC(10, 2);
  v_item_usd NUMERIC(10, 2);
  v_base_unit_norm TEXT;
  v_base_amount NUMERIC(10, 4);
  v_req_in_base NUMERIC(10, 4);
  v_multiplier NUMERIC(10, 4);
  v_base_family TEXT;
  v_req_family TEXT;
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
  IF length(v_customer_phone) < 6 OR length(v_customer_phone) > 50 THEN
    RAISE EXCEPTION 'Customer phone must be between 6 and 50 characters';
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

  v_replacement_policy := btrim(COALESCE(p_replacement_policy, 'call_to_agree'));
  IF v_replacement_policy NOT IN ('call_to_agree', 'picker_choice', 'do_not_replace', 'call', 'substitute', 'ignore') THEN
    v_replacement_policy := 'call_to_agree';
  END IF;

  -- Валидация даты доставки с учетом местного времени рынка (UTC+7)
  v_local_time := timezone('Asia/Phnom_Penh', now());
  v_local_date := v_local_time::DATE;
  v_current_hour := EXTRACT(HOUR FROM v_local_time)::INT;

  IF v_current_hour >= 23 THEN
    v_min_delivery_date := v_local_date + INTERVAL '2 day';
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

    IF v_service_fee_percent IS NULL OR v_service_fee_percent < 0 THEN v_service_fee_percent := 10.00; END IF;
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
    customer_comment,
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

  -- 10. Валидация, обогащение из products и вставка позиций заказа (order_items)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_product_id := NULL;
    v_product := NULL;

    IF v_item ? 'product_id' AND v_item->>'product_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
      SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::UUID;
      IF FOUND THEN
        v_product_id := v_product.id;
      END IF;
    END IF;

    -- Поддержка обоих форматов ключей (product_title / title и др.) + приоритет БД
    v_product_name_ru := btrim(COALESCE(
      NULLIF(v_product.name_ru, ''),
      NULLIF(v_item->>'product_name_ru', ''),
      NULLIF(v_item->>'name_ru', ''),
      ''
    ));
    v_product_name_en := btrim(COALESCE(
      NULLIF(v_product.name_en, ''),
      NULLIF(v_item->>'product_name_en', ''),
      NULLIF(v_item->>'name_en', ''),
      ''
    ));
    v_product_name_kh := btrim(COALESCE(
      NULLIF(v_product.name_kh, ''),
      NULLIF(v_item->>'product_name_kh', ''),
      NULLIF(v_item->>'name_kh', ''),
      ''
    ));

    v_product_title := btrim(COALESCE(
      NULLIF(v_product_name_ru, ''),
      NULLIF(v_item->>'product_title', ''),
      NULLIF(v_item->>'title', ''),
      NULLIF(v_product_name_en, ''),
      'Товар'
    ));
    IF length(v_product_title) > 200 THEN
      v_product_title := substring(v_product_title from 1 for 200);
    END IF;
    IF v_product_name_ru = '' THEN
      v_product_name_ru := v_product_title;
    END IF;

    v_product_category := btrim(COALESCE(
      NULLIF(v_product.category, ''),
      NULLIF(v_item->>'product_category', ''),
      NULLIF(v_item->>'category', ''),
      'other'
    ));
    v_product_form := btrim(COALESCE(
      NULLIF(v_product.form, ''),
      NULLIF(v_item->>'product_form', ''),
      NULLIF(v_item->>'form', ''),
      ''
    ));
    v_product_img_url := btrim(COALESCE(
      NULLIF(v_product.img_url, ''),
      NULLIF(v_item->>'product_img_url', ''),
      NULLIF(v_item->>'img_url', ''),
      ''
    ));
    v_product_unit := COALESCE(NULLIF(v_product.unit, ''), '1_kg');

    -- Парсинг количества
    v_raw_qty := btrim(COALESCE(v_item->>'requested_qty', v_item->>'quantity', '1'));
    v_num_str := (regexp_match(v_raw_qty, '^([0-9]+(?:\.[0-9]+)?)'))[1];
    IF v_num_str IS NOT NULL AND v_num_str <> '' THEN
      v_quantity := v_num_str::NUMERIC;
    ELSE
      v_quantity := 1.0;
    END IF;

    IF v_quantity <= 0 OR v_quantity > 5000 THEN
      RAISE EXCEPTION 'Item quantity must be between 0.001 and 5000 (got: %)', v_quantity;
    END IF;

    -- Канонизация размерности позиции заказа
    v_unit := public.normalize_order_unit(COALESCE(v_item->>'unit', v_product_unit, 'kg'));

    v_item_comment := btrim(COALESCE(
      NULLIF(v_item->>'customer_comment', ''),
      NULLIF(v_item->>'comment', ''),
      ''
    ));
    IF length(v_item_comment) > 300 THEN
      v_item_comment := substring(v_item_comment from 1 for 300);
    END IF;

    -- Расчёт ориентировочной стоимости с учётом совместимости размерностей
    v_item_usd := 0.00;
    v_item_price := COALESCE(
      v_product.price,
      NULLIF(regexp_replace(COALESCE(v_item->>'estimated_price', v_item->>'price', '0'), '[^0-9.]', '', 'g'), '')::NUMERIC,
      0.00
    );

    IF v_item_price > 0 THEN
      -- Определяем семейство и базовый шаг цены из products.unit
      v_base_unit_norm := lower(btrim(v_product_unit));
      IF v_base_unit_norm IN ('1_kg', 'kg', '1 кг', 'кг', '500_g', '250_g', '100_g', 'g', '500 г', '250 г', '100 г', 'г') THEN
        v_base_family := 'weight';
        v_base_amount := CASE
          WHEN v_base_unit_norm IN ('500_g', '500 г') THEN 0.5
          WHEN v_base_unit_norm IN ('250_g', '250 г') THEN 0.25
          WHEN v_base_unit_norm IN ('100_g', '100 г') THEN 0.1
          WHEN v_base_unit_norm IN ('g', 'г') THEN 0.001
          ELSE 1.0
        END;
      ELSIF v_base_unit_norm IN ('1_l', 'l', '1 л', '0_7_l', '0_5_l', '0_2_l', 'ml', 'мл') THEN
        v_base_family := 'volume';
        v_base_amount := CASE
          WHEN v_base_unit_norm = '0_7_l' THEN 0.7
          WHEN v_base_unit_norm = '0_5_l' THEN 0.5
          WHEN v_base_unit_norm = '0_2_l' THEN 0.2
          WHEN v_base_unit_norm IN ('ml', 'мл') THEN 0.001
          ELSE 1.0
        END;
      ELSIF v_base_unit_norm = '10_pcs' THEN
        v_base_family := 'pc';
        v_base_amount := 10.0;
      ELSE
        v_base_family := public.normalize_order_unit(v_base_unit_norm);
        v_base_amount := 1.0;
      END IF;

      -- Семейство выбранной покупателем единицы
      IF v_unit IN ('kg', 'g') THEN
        v_req_family := 'weight';
        v_req_in_base := CASE WHEN v_unit = 'g' THEN v_quantity / 1000.0 ELSE v_quantity END;
      ELSIF v_unit IN ('l', 'ml') THEN
        v_req_family := 'volume';
        v_req_in_base := CASE WHEN v_unit = 'ml' THEN v_quantity / 1000.0 ELSE v_quantity END;
      ELSE
        v_req_family := v_unit;
        v_req_in_base := v_quantity;
      END IF;

      -- Считаем стоимость только при совпадении размерностей; иначе 0 (по чеку)
      IF v_product.price IS NOT NULL AND v_product.price > 0 THEN
        IF v_req_family = v_base_family AND v_base_amount > 0 THEN
          v_multiplier := v_req_in_base / v_base_amount;
          IF v_product.price >= 50 THEN
            v_item_usd := round(((v_product.price * v_multiplier) / v_khr_rate)::numeric, 2);
          ELSE
            v_item_usd := round((v_product.price * v_multiplier)::numeric, 2);
          END IF;
        ELSE
          v_item_usd := 0.00;
        END IF;
      ELSE
        -- Fallback на клиентскую оценку (уже в USD если < 50)
        IF v_item_price >= 50 THEN
          v_item_usd := round((v_item_price / v_khr_rate)::numeric, 2);
        ELSE
          v_item_usd := round(v_item_price::numeric, 2);
        END IF;
      END IF;
    END IF;

    v_items_total_usd := v_items_total_usd + v_item_usd;

    INSERT INTO public.order_items (
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

-- 6. Автовосстановление позиций ранее созданных заказов (включая FM-0AEF1D),
--    где из-за расхождения ключей в create_order записалось 'Товар'
UPDATE public.order_items oi
SET
  product_title = COALESCE(NULLIF(p.name_ru, ''), NULLIF(p.name_en, ''), oi.product_title),
  product_name_ru = COALESCE(NULLIF(p.name_ru, ''), oi.product_name_ru),
  product_name_en = COALESCE(NULLIF(p.name_en, ''), oi.product_name_en),
  product_name_kh = COALESCE(NULLIF(p.name_kh, ''), oi.product_name_kh),
  product_category = COALESCE(NULLIF(p.category, ''), oi.product_category),
  product_form = COALESCE(NULLIF(p.form, ''), oi.product_form),
  product_img_url = COALESCE(NULLIF(p.img_url, ''), oi.product_img_url),
  unit = public.normalize_order_unit(oi.unit)
FROM public.products p
WHERE oi.product_id = p.id
  AND (
    oi.product_title IS NULL
    OR btrim(oi.product_title) = ''
    OR oi.product_title = 'Товар'
    OR oi.product_name_en IS NULL
    OR btrim(oi.product_name_en) = ''
  );

