-- ============================================================================
-- FreshMarket: Dictionary-to-Database Full Sync & Deduplication RPC
-- Version: 20261119000000_sync_dictionary_to_products.sql
-- Description:
--   1. Добавление мультиязычных колонок name_ua и name_fr в public.products.
--   2. Обеспечение автогенерации DEFAULT для products.id (независимо от типа TEXT или UUID).
--   3. Создание серверной RPC-функции public.sync_products_from_dictionary(p_items JSONB)
--      с безопасным приведением типов ::text, защитой от дубликатов, сохранением цен/фото/ID
--      существующих товаров и пакетным добавлением новых позиций из словаря.
--   4. Первичная полная синхронизация всех 215 позиций из products_dictionary.json.
-- ============================================================================

-- 1. Расширение таблицы products колонками украинской и французской локализации
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name_ua TEXT,
  ADD COLUMN IF NOT EXISTS name_fr TEXT,
  ADD COLUMN IF NOT EXISTS price_currency TEXT DEFAULT 'KHR';

-- 2. Гарантируем наличие DEFAULT генератора UUID на колонке id (как для TEXT, так и для UUID)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'id' AND data_type = 'text'
  ) THEN
    ALTER TABLE public.products ALTER COLUMN id SET DEFAULT (gen_random_uuid())::text;
  ELSE
    ALTER TABLE public.products ALTER COLUMN id SET DEFAULT gen_random_uuid();
  END IF;
END $$;

-- 3. Серверная функция идемпотентной синхронизации базы со словарём
CREATE OR REPLACE FUNCTION public.sync_products_from_dictionary(
  p_items JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_item JSONB;
  v_ru TEXT;
  v_en TEXT;
  v_kh TEXT;
  v_ua TEXT;
  v_fr TEXT;
  v_cat TEXT;
  v_form TEXT;
  v_desc TEXT;
  v_img_url TEXT;
  v_en_norm TEXT;
  v_ru_norm TEXT;
  v_kh_base TEXT;
  v_en_p1 TEXT;
  v_en_p2 TEXT;
  v_ru_p1 TEXT;
  v_ru_p2 TEXT;
  v_existing_id TEXT;
  v_new_id TEXT;
  v_matched_ids TEXT[] := ARRAY[]::TEXT[];
  v_inserted_count INT := 0;
  v_updated_count INT := 0;
  v_dedup_count INT := 0;
  v_dup_rec RECORD;
BEGIN
  -- Разрешаем вызов из SQL Editor (auth.uid() IS NULL) или авторизованному администратору
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied: admin role required to synchronize product dictionary';
  END IF;

  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'Invalid payload: p_items must be a JSONB array';
  END IF;

  -- Сериализация параллельных запусков синхронизации
  PERFORM pg_advisory_xact_lock(hashtext('sync_products_from_dictionary'));

  -- Шаг А: Очистка возможных существующих дубликатов внутри таблицы products
  -- (сохраняем запись с фото, ценой и самой ранней датой, перепривязывая order_items)
  FOR v_dup_rec IN
    WITH ranked AS (
      SELECT
        id::text AS id_text,
        FIRST_VALUE(id::text) OVER (
          PARTITION BY lower(btrim(name_en))
          ORDER BY
            (img_url IS NOT NULL AND btrim(img_url) <> '') DESC,
            (price IS NOT NULL) DESC,
            created_at ASC,
            id::text ASC
        ) AS keep_id,
        ROW_NUMBER() OVER (
          PARTITION BY lower(btrim(name_en))
          ORDER BY
            (img_url IS NOT NULL AND btrim(img_url) <> '') DESC,
            (price IS NOT NULL) DESC,
            created_at ASC,
            id::text ASC
        ) AS rn
      FROM public.products
      WHERE name_en IS NOT NULL AND btrim(name_en) <> ''
    )
    SELECT id_text AS dup_id, keep_id
    FROM ranked
    WHERE rn > 1
  LOOP
    BEGIN
      EXECUTE 'UPDATE public.order_items SET product_id = $1::uuid WHERE product_id::text = $2'
      USING v_dup_rec.keep_id, v_dup_rec.dup_id;
    EXCEPTION WHEN OTHERS THEN
      EXECUTE 'UPDATE public.order_items SET product_id = $1 WHERE product_id::text = $2'
      USING v_dup_rec.keep_id, v_dup_rec.dup_id;
    END;

    DELETE FROM public.products
    WHERE id::text = v_dup_rec.dup_id;

    v_dedup_count := v_dedup_count + 1;
  END LOOP;

  -- Шаг Б: Проход по всем элементам словаря (Upsert / Merge без потери цен и фото)
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_ru := btrim(COALESCE(v_item->>'ru', ''));
    v_en := btrim(COALESCE(v_item->>'en', ''));
    v_kh := btrim(COALESCE(v_item->>'kh', ''));
    v_ua := btrim(COALESCE(v_item->>'ua', v_ru));
    v_fr := btrim(COALESCE(v_item->>'fr', v_en));
    v_cat := btrim(COALESCE(NULLIF(v_item->>'cat', ''), 'other'));
    v_form := btrim(COALESCE(NULLIF(v_item->>'form', ''), 'Целый'));
    v_desc := btrim(COALESCE(v_item->>'desc', ''));
    v_img_url := btrim(COALESCE(v_item->>'img_url', ''));

    IF v_ru = '' AND v_en = '' THEN
      CONTINUE;
    END IF;

    v_en_norm := lower(v_en);
    v_ru_norm := lower(v_ru);
    v_kh_base := lower(btrim(split_part(v_kh, '(', 1)));

    v_en_p1 := lower(btrim(split_part(v_en, '/', 1)));
    v_en_p2 := CASE WHEN position('/' in v_en) > 0 THEN lower(btrim(split_part(v_en, '/', 2))) ELSE '' END;
    v_ru_p1 := lower(btrim(split_part(v_ru, '/', 1)));
    v_ru_p2 := CASE WHEN position('/' in v_ru) > 0 THEN lower(btrim(split_part(v_ru, '/', 2))) ELSE '' END;

    -- Исключаем общие родовые слова во второй части через слэш из критериев склейки
    IF v_en_p2 IN ('offal') THEN v_en_p2 := ''; END IF;
    IF v_ru_p2 IN ('субпродукты') THEN v_ru_p2 := ''; END IF;

    v_existing_id := NULL;

    SELECT p.id::text INTO v_existing_id
    FROM public.products p
    WHERE NOT (p.id::text = ANY(v_matched_ids))
      AND (
        lower(btrim(p.name_en)) = v_en_norm
        OR lower(btrim(p.name_ru)) = v_ru_norm
        OR (v_en_p1 <> '' AND (lower(btrim(p.name_en)) = v_en_p1 OR lower(btrim(split_part(p.name_en, '/', 1))) = v_en_p1))
        OR (v_en_p2 <> '' AND (lower(btrim(p.name_en)) = v_en_p2 OR lower(btrim(split_part(p.name_en, '/', 1))) = v_en_p2))
        OR (v_ru_p1 <> '' AND (lower(btrim(p.name_ru)) = v_ru_p1 OR lower(btrim(split_part(p.name_ru, '/', 1))) = v_ru_p1))
        OR (v_ru_p2 <> '' AND (lower(btrim(p.name_ru)) = v_ru_p2 OR lower(btrim(split_part(p.name_ru, '/', 1))) = v_ru_p2))
        OR (v_kh_base <> '' AND p.name_kh IS NOT NULL AND btrim(p.name_kh) <> '' AND (lower(btrim(split_part(p.name_kh, '(', 1))) = v_kh_base OR position(lower(btrim(split_part(p.name_kh, '(', 1))) in v_kh_base) > 0) AND lower(btrim(COALESCE(p.category, ''))) = lower(v_cat))
      )
    ORDER BY
      (lower(btrim(p.name_en)) = v_en_norm) DESC,
      (lower(btrim(p.name_ru)) = v_ru_norm) DESC,
      (p.img_url IS NOT NULL AND btrim(p.img_url) <> '') DESC,
      (p.price IS NOT NULL) DESC,
      p.created_at ASC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      -- Обновляем существующий товар, сохраняя его ID, фото, цену, валюту, единицу измерения и развернутое описание
      UPDATE public.products
      SET
        name_ru = CASE WHEN v_ru <> '' THEN v_ru ELSE name_ru END,
        name_en = CASE WHEN v_en <> '' THEN v_en ELSE name_en END,
        category = v_cat,
        form = COALESCE(NULLIF(v_form, ''), form, 'Целый'),
        name_kh = CASE WHEN v_kh <> '' THEN v_kh ELSE name_kh END,
        name_ua = CASE WHEN v_ua <> '' THEN v_ua ELSE COALESCE(name_ua, name_ru) END,
        name_fr = CASE WHEN v_fr <> '' THEN v_fr ELSE COALESCE(name_fr, name_en) END,
        description = CASE
          WHEN description IS NULL OR btrim(description) = '' THEN v_desc
          ELSE description
        END,
        img_url = CASE
          WHEN (img_url IS NULL OR btrim(img_url) = '') AND v_img_url <> '' THEN v_img_url
          ELSE img_url
        END
      WHERE id::text = v_existing_id;

      v_matched_ids := array_append(v_matched_ids, v_existing_id);
      v_updated_count := v_updated_count + 1;
    ELSE
      -- Вставляем новый товар из словаря
      INSERT INTO public.products (
        name_ru,
        name_en,
        name_kh,
        name_ua,
        name_fr,
        category,
        form,
        description,
        img_url,
        price,
        unit,
        price_currency
      ) VALUES (
        v_ru,
        v_en,
        v_kh,
        v_ua,
        v_fr,
        v_cat,
        v_form,
        v_desc,
        NULLIF(v_img_url, ''),
        NULL,
        '1 кг',
        'KHR'
      )
      RETURNING id::text INTO v_new_id;

      v_matched_ids := array_append(v_matched_ids, v_new_id);
      v_inserted_count := v_inserted_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'inserted', v_inserted_count,
    'updated', v_updated_count,
    'deduplicated', v_dedup_count,
    'total_processed', v_inserted_count + v_updated_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.sync_products_from_dictionary(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sync_products_from_dictionary(JSONB) TO authenticated;

-- 4. Выполнение полной синхронизации словаря products_dictionary.json (v1.5.4)
SELECT public.sync_products_from_dictionary($dict$
[
  {
    "ru": "Авокадо",
    "en": "Avocado",
    "kh": "ផ្លែប័រ (Phlae Bor) [?]",
    "ua": "Авокадо",
    "fr": "Avocat",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Маслянистые плоды авокадо",
    "img_url": ""
  },
  {
    "ru": "Ананас",
    "en": "Pineapple",
    "kh": "ម្នាស់ (Mnoas)",
    "ua": "Ананас",
    "fr": "Ananas",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Сладкий спелый ананас",
    "img_url": ""
  },
  {
    "ru": "Апельсин",
    "en": "Orange",
    "kh": "ក្រូចពោធិ៍សាត់ (Krouch Pouthisat)",
    "ua": "Апельсин",
    "fr": "Orange",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Сладкие апельсины, знаменитые сорта из провинции Поусат",
    "img_url": ""
  },
  {
    "ru": "Арахис",
    "en": "Peanuts",
    "kh": "សណ្តែកដី (Sandaek Dei)",
    "ua": "Арахіс",
    "fr": "Cacahuètes / Arachides",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Арахис для закусок и соусов",
    "img_url": ""
  },
  {
    "ru": "Арахис варёный",
    "en": "Peanuts Boiled",
    "kh": "សណ្តែកដីស្ងោរ (Sandaek Dei Sngao)",
    "ua": "Арахіс варений",
    "fr": "Cacahuètes bouillies",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Варёный арахис в скорлупе, популярная закуска",
    "img_url": ""
  },
  {
    "ru": "Арахис домашний с чесноком и чили",
    "en": "Peanuts Homemade Garlic & Chili",
    "kh": "សណ្ដែកដីលីងខ្ទឹមស (Sandaek Dei Ling Khtem Sa)",
    "ua": "Арахіс домашній з часником та чилі",
    "fr": "Cacahuètes grillées maison à l'ail et au piment",
    "cat": "homemade",
    "form": "Целый",
    "desc": "Жареный хрустящий арахис со свежим хрустящим чесноком и перцем",
    "img_url": ""
  },
  {
    "ru": "Арахис жареный",
    "en": "Peanuts Roasted",
    "kh": "សណ្តែកដីលីង (Sandaek Dei Ling)",
    "ua": "Арахіс смажений",
    "fr": "Cacahuètes grillées",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Обжаренный арахис для закусок и салатов",
    "img_url": ""
  },
  {
    "ru": "Арбуз",
    "en": "Watermelon",
    "kh": "ឪឡឹក (Ovloek)",
    "ua": "Кавун",
    "fr": "Pastèque",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Сочный сладкий арбуз",
    "img_url": ""
  },
  {
    "ru": "Базилик священный",
    "en": "Basil Holy",
    "kh": "ម្រះព្រៅ (Mreah Prov)",
    "ua": "Базилік священний (Тулсі)",
    "fr": "Basilic sacré (Tulsi)",
    "cat": "herbs",
    "form": "Пучок",
    "desc": "Пряный базилик с перечным ароматом",
    "img_url": ""
  },
  {
    "ru": "Базилик сладкий тайский",
    "en": "Basil Thai Sweet",
    "kh": "ជីរនាងវង (Chi Neang Vong)",
    "ua": "Базилік солодкий тайський",
    "fr": "Basilic thaï doux",
    "cat": "herbs",
    "form": "Пучок",
    "desc": "Анисовый базилик для супов и карри",
    "img_url": ""
  },
  {
    "ru": "Баклажан обычный / Баклажан",
    "en": "Eggplant / Aubergine",
    "kh": "ត្រប់វែង / ត្រប់ (Trob Veng / Trob)",
    "ua": "Баклажан класичний / Баклажан",
    "fr": "Aubergine classique / Aubergine",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Фиолетовый классический продолговатый баклажан",
    "img_url": ""
  },
  {
    "ru": "Баклажан тайский",
    "en": "Eggplant Thai",
    "kh": "ត្រប់ស្រួយ (Troap Sruoy)",
    "ua": "Баклажан тайський",
    "fr": "Aubergine thaïlandaise",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Маленькие круглые зелено-белые хрустящие баклажаны для карри",
    "img_url": ""
  },
  {
    "ru": "Балют (утиное яйцо с зародышем)",
    "en": "Balut / Fertilized Duck Egg",
    "kh": "ពងទាកូន (Pong Tea Koun)",
    "ua": "Балют (качине яйце)",
    "fr": "Balut / Œuf de cane fécondé",
    "cat": "street_exotic",
    "form": "Целый",
    "desc": "Уличный деликатес, подается со свежим перцем, солью и лаймом",
    "img_url": ""
  },
  {
    "ru": "Бамия / Окра",
    "en": "Okra / Lady's Finger",
    "kh": "ពោតបារាំង (Pout Barang) [?]",
    "ua": "Бамія / Окра",
    "fr": "Gombo / Okra",
    "cat": "vegetables",
    "form": "Стручок",
    "desc": "Зеленые граненые стручки бамии для супов и жарки",
    "img_url": ""
  },
  {
    "ru": "Банан",
    "en": "Banana",
    "kh": "ចេក (Chek)",
    "ua": "Банан",
    "fr": "Banane",
    "cat": "fruits",
    "form": "Пучок",
    "desc": "Сладкие маленькие бананы",
    "img_url": ""
  },
  {
    "ru": "Батат / Картофель сладкий",
    "en": "Potato Sweet / Yam",
    "kh": "ដំឡូងជ្វា (Domlong Chvea)",
    "ua": "Батат / Картопля солодка",
    "fr": "Patate douce / Batate",
    "cat": "roots_tubers",
    "form": "Корень",
    "desc": "Сладкий оранжевый, желтый или фиолетовый клубень",
    "img_url": ""
  },
  {
    "ru": "Брокколи",
    "en": "Broccoli",
    "kh": "ផ្កាខាត់ណាខៀវ (Phka Khatna Khiev)",
    "ua": "Броколі",
    "fr": "Brocoli",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Соцветия зеленого брокколи",
    "img_url": ""
  },
  {
    "ru": "Вермишель рисовая",
    "en": "Noodles Rice Vermicelli",
    "kh": "នំបញ្ចុក (Nom Banchok)",
    "ua": "Вермішель рисова",
    "fr": "Vermicelles de riz",
    "cat": "grains_noodles",
    "form": "Целый",
    "desc": "Свежая рисовая лапша для супа и карри",
    "img_url": ""
  },
  {
    "ru": "Виноград",
    "en": "Grapes",
    "kh": "ទំពាំងបាយជូរ (Tumpeang Bay Chur)",
    "ua": "Виноград",
    "fr": "Raisin",
    "cat": "fruits",
    "form": "Пучок",
    "desc": "Гроздья свежего винограда",
    "img_url": ""
  },
  {
    "ru": "Галангал / Синий имбирь",
    "en": "Galangal / Blue Ginger",
    "kh": "រំដេង (Rumdeng)",
    "ua": "Галангал / Синій імбир",
    "fr": "Galanga / Gingembre bleu",
    "cat": "spices_roots",
    "form": "Корень",
    "desc": "Ароматный твердый корень с хвойным вкусом",
    "img_url": ""
  },
  {
    "ru": "Говядина",
    "en": "Beef",
    "kh": "សាច់គោ (Sach Kou)",
    "ua": "Яловичина",
    "fr": "Bœuf",
    "cat": "meat",
    "form": "Целый",
    "desc": "Свежая местная говядина",
    "img_url": ""
  },
  {
    "ru": "Говядина (печень / субпродукты)",
    "en": "Beef Liver / Offal",
    "kh": "ថ្លើមគោ (Thlaem Kou)",
    "ua": "Яловичина (печінка / субпродукти)",
    "fr": "Bœuf (foie / abats)",
    "cat": "meat",
    "form": "Нарезка",
    "desc": "Свежая говяжья печень",
    "img_url": ""
  },
  {
    "ru": "Горчица кислая (квашеная)",
    "en": "Mustard Greens Pickled",
    "kh": "ស្ពៃជូរ (Spay Chur)",
    "ua": "Гірчиця квашена (зелень)",
    "fr": "Moutarde saumurée",
    "cat": "vegetables",
    "form": "Нарезка",
    "desc": "Квашеная зелень для супов и жарки",
    "img_url": ""
  },
  {
    "ru": "Грибы древесные (ухо)",
    "en": "Mushrooms Wood Ear",
    "kh": "ផ្សិតត្រចៀកកណ្ដុរ (Phset Trachiek Kandor) [?]",
    "ua": "Гриби деревні (муер)",
    "fr": "Champignons noirs (Oreilles de Judas)",
    "cat": "mushrooms",
    "form": "Сушеный",
    "desc": "Сушёные чёрные древесные грибы для супов и жарки",
    "img_url": ""
  },
  {
    "ru": "Грибы соломенные / Вешенки",
    "en": "Mushrooms Straw / Oyster Mushrooms",
    "kh": "ផ្សិតចំបើង (Phset Chambaeng) [?]",
    "ua": "Гриби солом'яні / Гливи",
    "fr": "Champignons de paille / Pleurotes",
    "cat": "mushrooms",
    "form": "Целый",
    "desc": "Свежие рыночные соломенные грибы для супов и стир-фрая",
    "img_url": ""
  },
  {
    "ru": "Гуава",
    "en": "Guava",
    "kh": "ត្របែក (Trobaek)",
    "ua": "Гуава",
    "fr": "Goyave",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Хрустящая гуава с солью и чили",
    "img_url": ""
  },
  {
    "ru": "Дайкон / Белый редис",
    "en": "Daikon Radish",
    "kh": "ឆៃថាវ (Chhay Thav)",
    "ua": "Дайкон / Біла редька",
    "fr": "Radis daïkon blanc",
    "cat": "roots_tubers",
    "form": "Корень",
    "desc": "Сочный белый хрустящий редис для супов и солений",
    "img_url": ""
  },
  {
    "ru": "Джекфрут",
    "en": "Jackfruit",
    "kh": "ខ្នុរ (Khnor)",
    "ua": "Джекфрут",
    "fr": "Jacquier / Fruit du jacquier",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Крупный плод с ароматной сладкой мякотью",
    "img_url": ""
  },
  {
    "ru": "Джем манговый домашний / Варенье",
    "en": "Jam Mango Homemade / Marmalade",
    "kh": "ដំណាប់ស្វាយធ្វើនៅផ្ទះ (Damnab Svay)",
    "ua": "Джем манговий домашній / Варення",
    "fr": "Confiture de mangue maison",
    "cat": "homemade",
    "form": "Соус",
    "desc": "Ароматный джем из спелых местных манго без искусственных добавок",
    "img_url": ""
  },
  {
    "ru": "Джикама / Ямсовая фасоль",
    "en": "Jicama / Yam Bean",
    "kh": "ដំឡូងរលួស / ប៉ិកួច (Roluos / Pe-kuoch)",
    "ua": "Джікама / Ямсова квасоля",
    "fr": "Jicama / Pois-patate",
    "cat": "roots_tubers",
    "form": "Корень",
    "desc": "Сочный хрустящий сладковатый клубень, едят свежим",
    "img_url": ""
  },
  {
    "ru": "Драгонфрут / Питахайя",
    "en": "Dragon Fruit / Pitaya",
    "kh": "ផ្លែស្រកានាគ (Phlae Sroka Neak)",
    "ua": "Драгонфрут / Пітая",
    "fr": "Fruit du dragon / Pitaya",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Плод дракона со сладкой освежающей мякотью",
    "img_url": ""
  },
  {
    "ru": "Дуриан",
    "en": "Durian",
    "kh": "ធុរេន (Thuren)",
    "ua": "Дуріан",
    "fr": "Durian",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Король фруктов с кремовой мякотью",
    "img_url": ""
  },
  {
    "ru": "Дыня / Канталупа",
    "en": "Melon / Cantaloupe",
    "kh": "ត្រសក់ផ្អែម (Trosak Phaem)",
    "ua": "Диня / Канталупа",
    "fr": "Melon / Cantaloup",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Сладкая ароматная дыня",
    "img_url": ""
  },
  {
    "ru": "Имбирь свежий",
    "en": "Ginger Fresh",
    "kh": "ខ្ញី (Knhyei)",
    "ua": "Імбир свіжий",
    "fr": "Gingembre frais",
    "cat": "spices_roots",
    "form": "Целый",
    "desc": "Сочный корень имбиря",
    "img_url": ""
  },
  {
    "ru": "Йогурт",
    "en": "Yogurt",
    "kh": "យ៉ាអ៊ួត (Ya-uot) [?]",
    "ua": "Йогурт",
    "fr": "Yaourt",
    "cat": "dairy_eggs",
    "form": "Бутылка",
    "desc": "Кисломолочный йогурт",
    "img_url": ""
  },
  {
    "ru": "Кабачок / Цукини",
    "en": "Zucchini / Courgette",
    "kh": "ត្រឡាច (Trolach) [?]",
    "ua": "Кабачок / Цукіні",
    "fr": "Courgette / Zucchini",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Нежный кабачок",
    "img_url": ""
  },
  {
    "ru": "Кальмар свежий",
    "en": "Squid / Calamari",
    "kh": "មឹក (Meuk)",
    "ua": "Кальмар свіжий",
    "fr": "Calmar frais / Encornet",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Свежий кальмар",
    "img_url": ""
  },
  {
    "ru": "Капуста белокочанная",
    "en": "Cabbage White",
    "kh": "ស្ពៃក្តោប (Spay Kdaob)",
    "ua": "Капуста білокачанна",
    "fr": "Chou blanc",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Свежая плотная капуста",
    "img_url": ""
  },
  {
    "ru": "Капуста китайская / Бок-чой",
    "en": "Cabbage Chinese / Bok Choy",
    "kh": "ស្ពៃបូកគោ (Spay Buk Kou) [?]",
    "ua": "Капуста китайська / Бок-чой",
    "fr": "Chou chinois / Bok choy",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Нежные хрустящие листья китайской капусты",
    "img_url": ""
  },
  {
    "ru": "Капуста цветная",
    "en": "Cabbage Cauliflower / Cauliflower",
    "kh": "ផ្កាខាត់ណា (Phka Khatna)",
    "ua": "Капуста цвітна",
    "fr": "Chou-fleur",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Белая цветная капуста",
    "img_url": ""
  },
  {
    "ru": "Карамбола / Звездный фрукт",
    "en": "Star Fruit / Carambola",
    "kh": "ផ្លែទ្រព្យ (Phlae Troap) [?]",
    "ua": "Карамбола / Зірковий фрукт",
    "fr": "Carambole / Fruit étoilé",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Освежающий кисло-сладкий фрукт звездочкой",
    "img_url": ""
  },
  {
    "ru": "Кардамон в стручках",
    "en": "Cardamom Pods",
    "kh": "ក្រវាញ (Kravanh)",
    "ua": "Кардамон у стручках",
    "fr": "Cardamome en gousses",
    "cat": "spices_roots",
    "form": "Стручок",
    "desc": "Ароматные цельные стручки кардамона",
    "img_url": ""
  },
  {
    "ru": "Картофель",
    "en": "Potato",
    "kh": "ដំឡូងបារាំង (Domlong Barang)",
    "ua": "Картопля",
    "fr": "Pomme de terre",
    "cat": "roots_tubers",
    "form": "Корень",
    "desc": "Свежий картофель",
    "img_url": ""
  },
  {
    "ru": "Кешью",
    "en": "Cashew Nuts",
    "kh": "ស្វាយចន្ទី (Svay Chantei)",
    "ua": "Кеш'ю",
    "fr": "Noix de cajou",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Орехи кешью",
    "img_url": ""
  },
  {
    "ru": "Кимчи домашний / Капуста квашеная",
    "en": "Kimchi Homemade / Fermented Cabbage",
    "kh": "គីមឈីធ្វើនៅផ្ទះ (Kimchi)",
    "ua": "Кімчі домашнє / Капуста квашена",
    "fr": "Kimchi maison / Chou fermenté",
    "cat": "homemade",
    "form": "Маринованный",
    "desc": "Хрустящая пекинская капуста натурального брожения с чили и имбирём",
    "img_url": ""
  },
  {
    "ru": "Кинза / Кориандр",
    "en": "Coriander / Cilantro",
    "kh": "ជីរវ៉ាន់ស៊ុយ (Chi Van Suy)",
    "ua": "Кінза / Коріандр",
    "fr": "Coriandre fraîche / Cilantro",
    "cat": "herbs",
    "form": "Пучок",
    "desc": "Свежая кинза с корнями",
    "img_url": ""
  },
  {
    "ru": "Козлятина",
    "en": "Goat Meat",
    "kh": "សាច់ពពែ (Sach Pope)",
    "ua": "Козлятина",
    "fr": "Viande de chèvre",
    "cat": "meat",
    "form": "Нарезка",
    "desc": "Мясо козы для тушения и жарки",
    "img_url": ""
  },
  {
    "ru": "Кокос зрелый",
    "en": "Coconut Mature",
    "kh": "ដូងចាស់ (Doung Chas)",
    "ua": "Кокос зрілий",
    "fr": "Noix de coco mûre",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Зрелый кокос для получения мякоти и кокосового молока",
    "img_url": ""
  },
  {
    "ru": "Кокос питьевой",
    "en": "Coconut Fresh",
    "kh": "ដូងខ្ចី (Doung Khchei)",
    "ua": "Кокос питний свіжий",
    "fr": "Noix de coco fraîche",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Молодой кокос с кокосовой водой",
    "img_url": ""
  },
  {
    "ru": "Кокосовая вода",
    "en": "Coconut Water",
    "kh": "ទឹកដូង (Teuk Doung)",
    "ua": "Кокосова вода",
    "fr": "Eau de coco",
    "cat": "sauces",
    "form": "Целый",
    "desc": "Сок молодого кокоса",
    "img_url": ""
  },
  {
    "ru": "Кокосовое молоко",
    "en": "Coconut Milk",
    "kh": "ខ្ទិះដូង (Khteh Doung)",
    "ua": "Кокосове молоко",
    "fr": "Lait de coco",
    "cat": "sauces",
    "form": "Паста",
    "desc": "Свежевыжатое кокосовое молоко",
    "img_url": ""
  },
  {
    "ru": "Комбуча домашняя / Чайный квас",
    "en": "Kombucha Homemade",
    "kh": "តែគមប៊ូឆាធ្វើនៅផ្ទះ (Te Kombucha)",
    "ua": "Комбуча домашня / Чайний гриб",
    "fr": "Kombucha maison",
    "cat": "homemade",
    "form": "Бутылка",
    "desc": "Натуральный ферментированный чайный напиток с пробиотиками",
    "img_url": ""
  },
  {
    "ru": "Корень лотоса",
    "en": "Lotus Root",
    "kh": "មើមឈូក (Meum Chhuk)",
    "ua": "Корінь лотоса",
    "fr": "Racine de lotus",
    "cat": "roots_tubers",
    "form": "Корень",
    "desc": "Узорчатый хрустящий корень лотоса для супов и стир-фрая",
    "img_url": ""
  },
  {
    "ru": "Кофе",
    "en": "Coffee",
    "kh": "កាហ្វេ (Kafe)",
    "ua": "Кава",
    "fr": "Café",
    "cat": "sauces",
    "form": "Молотый",
    "desc": "Молотый кофе",
    "img_url": ""
  },
  {
    "ru": "Краб (мясо консервированное)",
    "en": "Crab Meat Canned",
    "kh": "សាច់ក្តាមកំប៉ុង (Sach Kdam Kompong)",
    "ua": "Краб (м'ясо консервоване)",
    "fr": "Crabe (chair en conserve)",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Консервированное крабовое мясо для супов",
    "img_url": ""
  },
  {
    "ru": "Краб (мясо)",
    "en": "Crab Meat",
    "kh": "សាច់ក្តាម (Sach Kdam)",
    "ua": "Краб (м'ясо)",
    "fr": "Crabe (chair)",
    "cat": "seafood",
    "form": "Нарезка",
    "desc": "Очищенное мясо краба для жарки и супов",
    "img_url": ""
  },
  {
    "ru": "Краб голубой плавунец",
    "en": "Crab Blue Swimming / Flower Crab",
    "kh": "ក្តាម (Kdam)",
    "ua": "Краб блакитний плавунець",
    "fr": "Crabe bleu nageur / Crabe fleur",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Голубой или морской краб",
    "img_url": ""
  },
  {
    "ru": "Краб голубой плавунец, самец",
    "en": "Crab Blue Swimmer (Male)",
    "kh": "ក្តាមសេះ (Kdam Seh)",
    "ua": "Краб блакитний плавунець, самець",
    "fr": "Crabe bleu nageur (mâle)",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Голубой краб-плавунец, самцы с голубыми клешнями",
    "img_url": ""
  },
  {
    "ru": "Краб голубой плавунец, самка",
    "en": "Crab Blue Swimmer (Female)",
    "kh": "ក្តាមសេះញី (Kdam Seh Nhi)",
    "ua": "Краб блакитний плавунець, самка",
    "fr": "Crabe bleu nageur (femelle)",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Самка голубого краба зеленовато-коричневого цвета с округлым панцирем",
    "img_url": ""
  },
  {
    "ru": "Краб мангровый (илистый)",
    "en": "Crab Mud",
    "kh": "ក្តាមថ្ម (Kdam Thma)",
    "ua": "Краб мангровий (мулистий)",
    "fr": "Crabe de palétuvier",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Крупный краб с массивными клешнями для жарки и тушения",
    "img_url": ""
  },
  {
    "ru": "Краб морской",
    "en": "Crab Sea",
    "kh": "ក្តាមសមុទ្រ (Kdam Samot)",
    "ua": "Краб морський",
    "fr": "Crabe de mer",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Свежий морской краб общего названия",
    "img_url": ""
  },
  {
    "ru": "Краб рисовых полей",
    "en": "Crab Rice Field",
    "kh": "ក្តាមស្រែ (Kdam Srae)",
    "ua": "Краб рисових полів",
    "fr": "Crabe des rizières",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Мелкий пресноводный краб для супов и паст",
    "img_url": ""
  },
  {
    "ru": "Крахмал кукурузный",
    "en": "Starch Corn",
    "kh": "ម្សៅពោត (Msov Pout)",
    "ua": "Крохмаль кукурудзяний",
    "fr": "Fécule de maïs",
    "cat": "grains_noodles",
    "form": "Молотый",
    "desc": "Крахмал для загущения соусов и супов",
    "img_url": ""
  },
  {
    "ru": "Крахмал тапиоки",
    "en": "Starch Tapioca",
    "kh": "ម្សៅដំឡូងមី (Msov Domlong Mi)",
    "ua": "Крохмаль тапіоки",
    "fr": "Fécule de tapioca",
    "cat": "grains_noodles",
    "form": "Молотый",
    "desc": "Крахмал из маниоки для десертов и теста",
    "img_url": ""
  },
  {
    "ru": "Креветка гигантская речная / Лангуст",
    "en": "Shrimp Giant River Prawn / Lobster",
    "kh": "បង្កង (Bongkong)",
    "ua": "Креветка гігантська річкова / Лангуст",
    "fr": "Crevette géante d'eau douce / Langouste",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Крупная пресноводная креветка (Macrobrachium rosenbergii) с большими клешнями, обычно жарится на углях; так же называют лангуста",
    "img_url": ""
  },
  {
    "ru": "Креветка речная восточная",
    "en": "Shrimp Oriental River Prawn",
    "kh": "ព្រោន (Proun) [?]",
    "ua": "Креветка річкова східна",
    "fr": "Crevette de rivière orientale",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Пресноводная креветка среднего размера из прудов и канав",
    "img_url": ""
  },
  {
    "ru": "Креветки крупные",
    "en": "Shrimp Large",
    "kh": "បង្គាធំ (Bongkea Thum)",
    "ua": "Креветки великі",
    "fr": "Crevettes grosses",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Крупные креветки для гриля и жарки",
    "img_url": ""
  },
  {
    "ru": "Креветки мелкие",
    "en": "Shrimp Small",
    "kh": "បង្គាតូច (Bongkea Touch)",
    "ua": "Креветки дрібні",
    "fr": "Crevettes petites",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Мелкие креветки для супов, жарки и салатов",
    "img_url": ""
  },
  {
    "ru": "Креветки речные мелкие (стеклянные)",
    "en": "Shrimp Tiny River (Glass Prawn)",
    "kh": "កំពឹស (Kampeus)",
    "ua": "Креветки річкові дрібні (скляні)",
    "fr": "Crevettes petites de rivière",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Прозрачные мелкие речные креветки для жарки и закусок",
    "img_url": ""
  },
  {
    "ru": "Креветки свежие / Лангустины",
    "en": "Shrimp Fresh / Prawns",
    "kh": "បង្គាស្រស់ (Bongkea Sros)",
    "ua": "Креветки свіжі / Лангустини",
    "fr": "Crevettes fraîches / Gambas",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Свежие морские или речные креветки",
    "img_url": ""
  },
  {
    "ru": "Креветки сушёные",
    "en": "Shrimp Dried",
    "kh": "បង្គាក្រៀម (Bongkea Kriem)",
    "ua": "Креветки сушені",
    "fr": "Crevettes séchées",
    "cat": "seafood",
    "form": "Сушеный",
    "desc": "Сушёные креветки для супов и приправ",
    "img_url": ""
  },
  {
    "ru": "Креветки сушёные мелкие",
    "en": "Shrimp Dried Small",
    "kh": "បង្គាក្រៀមតូច (Bongkea Kriem Touch)",
    "ua": "Креветки сушені дрібні",
    "fr": "Crevettes séchées petites",
    "cat": "seafood",
    "form": "Сушеный",
    "desc": "Мелкие сушёные креветки для бульонов, салатов и жарки",
    "img_url": ""
  },
  {
    "ru": "Креветки тигровые",
    "en": "Shrimp Tiger Prawns",
    "kh": "បង្គាខ្លា (Bongkea Khla) [?]",
    "ua": "Креветки тигрові",
    "fr": "Crevettes tigrées",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Крупные полосатые креветки для гриля и жарки",
    "img_url": ""
  },
  {
    "ru": "Кузнечики",
    "en": "Grasshoppers",
    "kh": "កណ្ដូប (Kandoup)",
    "ua": "Коники",
    "fr": "Sauterelles",
    "cat": "street_exotic",
    "form": "Целый",
    "desc": "Жареные кузнечики с чесноком",
    "img_url": ""
  },
  {
    "ru": "Кукуруза",
    "en": "Corn",
    "kh": "ពោត (Pout)",
    "ua": "Кукурудза",
    "fr": "Maïs",
    "cat": "vegetables",
    "form": "Стручок",
    "desc": "Сладкая желтая кукуруза",
    "img_url": ""
  },
  {
    "ru": "Кунжут",
    "en": "Sesame Seeds",
    "kh": "ល្ង (Lngo)",
    "ua": "Кунжут",
    "fr": "Sésame (graines)",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Семена кунжута",
    "img_url": ""
  },
  {
    "ru": "Кунжут белый",
    "en": "Sesame White",
    "kh": "ល្ងស (Lngo Sor)",
    "ua": "Кунжут білий",
    "fr": "Sésame blanc",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Белые семена кунжута для соусов и выпечки",
    "img_url": ""
  },
  {
    "ru": "Кунжут чёрный",
    "en": "Sesame Black",
    "kh": "ល្ងខ្មៅ (Lngo Khmao)",
    "ua": "Кунжут чорний",
    "fr": "Sésame noir",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Чёрные семена кунжута для десертов и закусок",
    "img_url": ""
  },
  {
    "ru": "Курица",
    "en": "Chicken",
    "kh": "សាច់មាន់ (Sach Moan)",
    "ua": "Курка",
    "fr": "Poulet",
    "cat": "meat",
    "form": "Целый",
    "desc": "Свежая фермерская курица",
    "img_url": ""
  },
  {
    "ru": "Курица (бедра / ножки)",
    "en": "Chicken Thighs / Drumsticks",
    "kh": "ភ្លៅមាន់ (Phlov Moan)",
    "ua": "Курка (стегна / гомілки)",
    "fr": "Poulet (cuisses / pilons)",
    "cat": "meat",
    "form": "Целый",
    "desc": "Сочные куриные ножки",
    "img_url": ""
  },
  {
    "ru": "Курица (крылышки)",
    "en": "Chicken Wings",
    "kh": "ស្លាបមាន់ (Slab Moan)",
    "ua": "Курка (крильця)",
    "fr": "Poulet (ailes)",
    "cat": "meat",
    "form": "Целый",
    "desc": "Куриные крылья для жарки или гриля",
    "img_url": ""
  },
  {
    "ru": "Курица (лапки)",
    "en": "Chicken Feet",
    "kh": "ជើងមាន់ (Cheung Moan)",
    "ua": "Курка (лапки)",
    "fr": "Poulet (pattes)",
    "cat": "meat",
    "form": "Целый",
    "desc": "Куриные лапки для супов и закусок",
    "img_url": ""
  },
  {
    "ru": "Курица (филе / грудка)",
    "en": "Chicken Breast / Fillet",
    "kh": "ទ្រូងមាន់ (Trung Moan)",
    "ua": "Курка (філе / грудка)",
    "fr": "Poulet (blanc / filet)",
    "cat": "meat",
    "form": "Нарезка",
    "desc": "Нежное белое мясо курицы без костей",
    "img_url": ""
  },
  {
    "ru": "Куркума свежая",
    "en": "Turmeric Fresh",
    "kh": "រមៀត (Romiet)",
    "ua": "Куркума свіжа",
    "fr": "Curcuma frais",
    "cat": "spices_roots",
    "form": "Корень",
    "desc": "Ярко-оранжевый корень, основа пасты Крёнг",
    "img_url": ""
  },
  {
    "ru": "Лайм",
    "en": "Lime",
    "kh": "ក្រូចឆ្មា (Krouch Chhma)",
    "ua": "Лайм",
    "fr": "Citron vert / Lime",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Кислый зеленый лайм для соусов и напитков",
    "img_url": ""
  },
  {
    "ru": "Лапша жёлтая яичная",
    "en": "Noodles Egg",
    "kh": "មី (Mi)",
    "ua": "Локшина жовта яєчна",
    "fr": "Nouilles aux œufs",
    "cat": "grains_noodles",
    "form": "Целый",
    "desc": "Яичная лапша для супов и жарки",
    "img_url": ""
  },
  {
    "ru": "Лапша рисовая",
    "en": "Noodles Rice",
    "kh": "គុយទាវ (Kuyteav)",
    "ua": "Локшина рисова",
    "fr": "Nouilles de riz",
    "cat": "grains_noodles",
    "form": "Сушеный",
    "desc": "Свежая или сушеная рисовая лапша",
    "img_url": ""
  },
  {
    "ru": "Лапша стеклянная",
    "en": "Noodles Glass",
    "kh": "មីសួ (Mi Suo) [?]",
    "ua": "Локшина скляна",
    "fr": "Nouilles de verre / Vermicelles",
    "cat": "grains_noodles",
    "form": "Сушеный",
    "desc": "Прозрачная лапша для супов и салатов",
    "img_url": ""
  },
  {
    "ru": "Лемонграсс / Лимонная трава",
    "en": "Lemongrass / Citronella",
    "kh": "ស្លឹកគ្រៃ (Sloek Krey)",
    "ua": "Лемонграс / Лимонна трава",
    "fr": "Citronnelle / Lemongrass",
    "cat": "herbs",
    "form": "Пучок",
    "desc": "Свежие стебли лимонного сорго",
    "img_url": ""
  },
  {
    "ru": "Лимон желтый",
    "en": "Lemon",
    "kh": "ក្រូចឆ្មាលឿង (Krouch Chhma Lueang) [?]",
    "ua": "Лимон жовтий",
    "fr": "Citron jaune",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Классический желтый лимон",
    "img_url": ""
  },
  {
    "ru": "Лист банановый",
    "en": "Leaf Banana",
    "kh": "ស្លឹកចេក (Sloek Chek)",
    "ua": "Лист банановий",
    "fr": "Feuille de bananier",
    "cat": "herbs",
    "form": "Пучок",
    "desc": "Листья для заворачивания еды и запекания",
    "img_url": ""
  },
  {
    "ru": "Листья каффир-лайма / Листья макрут",
    "en": "Leaves Kaffir Lime / Makrut Leaves",
    "kh": "ស្លឹកក្រូចសើច (Sloek Krouch Saech)",
    "ua": "Листя кафрського лайма / Листя макрут",
    "fr": "Feuilles de combava / Feuilles de kaffir",
    "cat": "herbs",
    "form": "Целый",
    "desc": "Листья лайма для ароматизации паст карри и супов",
    "img_url": ""
  },
  {
    "ru": "Листья маниоки",
    "en": "Leaves Cassava",
    "kh": "ស្លឹកដំឡូងមី (Sloek Domlong Mi)",
    "ua": "Листя маніоку",
    "fr": "Feuilles de manioc",
    "cat": "herbs",
    "form": "Пучок",
    "desc": "Молодые листья маниоки для супов и тушения",
    "img_url": ""
  },
  {
    "ru": "Личи",
    "en": "Lychee",
    "kh": "គូលែន (Kulen)",
    "ua": "Лічі",
    "fr": "Litchi",
    "cat": "fruits",
    "form": "Пучок",
    "desc": "Ароматные сладкие плоды личи",
    "img_url": ""
  },
  {
    "ru": "Лонган",
    "en": "Longan",
    "kh": "មៀន (Mien)",
    "ua": "Лонган",
    "fr": "Longane",
    "cat": "fruits",
    "form": "Пучок",
    "desc": "Сладкие сочные плоды глаз дракона",
    "img_url": ""
  },
  {
    "ru": "Лук зеленый",
    "en": "Onion Green / Spring Onion",
    "kh": "ខ្ទឹមស្លឹក / ស្លឹកខ្ទឹម (Khtoem Sloek / Sloek Khtoem)",
    "ua": "Цибуля зелена",
    "fr": "Oignon vert / Ciboule",
    "cat": "herbs",
    "form": "Пучок",
    "desc": "Свежие перья зеленого лука",
    "img_url": ""
  },
  {
    "ru": "Лук красный",
    "en": "Onion Red",
    "kh": "ខ្ទឹមក្រហម (Khtoem Krahom)",
    "ua": "Цибуля червона",
    "fr": "Oignon rouge",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Красный сладковатый репчатый лук",
    "img_url": ""
  },
  {
    "ru": "Лук репчатый",
    "en": "Onion",
    "kh": "ខ្ទឹមបារាំង (Khtoem Barang)",
    "ua": "Цибуля ріпчаста",
    "fr": "Oignon",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Репчатый желтый или белый лук",
    "img_url": ""
  },
  {
    "ru": "Лук-шалот",
    "en": "Onion Shallot / Shallots",
    "kh": "ខ្ទឹមក្រហម (Khtoem Krahom)",
    "ua": "Цибуля-шалот",
    "fr": "Échalotes / Oignon échalote",
    "cat": "spices_roots",
    "form": "Целый",
    "desc": "Красный сладковатый азиатский лук",
    "img_url": ""
  },
  {
    "ru": "Лягушка",
    "en": "Frog",
    "kh": "កង្កែប (Kangkaep)",
    "ua": "Жаба",
    "fr": "Grenouille",
    "cat": "street_exotic",
    "form": "Целый",
    "desc": "Лягушки для жарки и тушения",
    "img_url": ""
  },
  {
    "ru": "Лёд",
    "en": "Ice",
    "kh": "ទឹកកក (Teuk Kok)",
    "ua": "Лід",
    "fr": "Glaçons / Glace",
    "cat": "sauces",
    "form": "Целый",
    "desc": "Лёд для напитков",
    "img_url": ""
  },
  {
    "ru": "Манго зеленое",
    "en": "Mango Green",
    "kh": "ស្វាយខ្ចី (Svay Khchei)",
    "ua": "Манго зелене",
    "fr": "Mangue verte",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Кислое твердое манго для салатов",
    "img_url": ""
  },
  {
    "ru": "Манго спелое / желтое",
    "en": "Mango Ripe",
    "kh": "ស្វាយទុំ (Svay Tum)",
    "ua": "Манго стигле / жовте",
    "fr": "Mangue mûre",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Сладкое ароматное желтое манго",
    "img_url": ""
  },
  {
    "ru": "Мангостин",
    "en": "Mangosteen",
    "kh": "មង្ឃុត (Mongkhut)",
    "ua": "Мангостан",
    "fr": "Mangoustan",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Королева фруктов с нежной белой мякотью",
    "img_url": ""
  },
  {
    "ru": "Маниок / Корень тапиоки (кассава)",
    "en": "Cassava / Tapioca Root",
    "kh": "ដំឡូងមី (Domlong Mi)",
    "ua": "Маніок / Корінь тапіоки (касава)",
    "fr": "Manioc / Racine de tapioca",
    "cat": "roots_tubers",
    "form": "Корень",
    "desc": "Крахмалистый клубень маниока, свежий корень тапиоки",
    "img_url": ""
  },
  {
    "ru": "Маракуйя",
    "en": "Passion Fruit",
    "kh": "ផ្លែផាសិន (Phlae Passion)",
    "ua": "Маракуя",
    "fr": "Fruit de la passion",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Кисло-сладкая маракуйя",
    "img_url": ""
  },
  {
    "ru": "Масло растительное",
    "en": "Oil Cooking",
    "kh": "ប្រេង (Preng)",
    "ua": "Олія рослинна",
    "fr": "Huile de cuisson",
    "cat": "sauces",
    "form": "Паста",
    "desc": "Масло для жарки",
    "img_url": ""
  },
  {
    "ru": "Масло сливочное",
    "en": "Butter",
    "kh": "ប៊ឺ (Beu)",
    "ua": "Масло вершкове",
    "fr": "Beurre",
    "cat": "dairy_eggs",
    "form": "Целый",
    "desc": "Сливочное масло для выпечки и жарки",
    "img_url": ""
  },
  {
    "ru": "Мидии / Моллюски",
    "en": "Mussels / Clams",
    "kh": "គ្រុំ / ងាវ (Krum / Ngeav) [?]",
    "ua": "Мідії / Молюски",
    "fr": "Moules / Palourdes",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Свежие моллюски в раковинах",
    "img_url": ""
  },
  {
    "ru": "Молоко",
    "en": "Milk",
    "kh": "ទឹកដោះគោ (Teuk Daoh Kou)",
    "ua": "Молоко",
    "fr": "Lait",
    "cat": "dairy_eggs",
    "form": "Бутылка",
    "desc": "Коровье молоко",
    "img_url": ""
  },
  {
    "ru": "Молоко сгущённое",
    "en": "Milk Condensed",
    "kh": "ទឹកដោះគោខាប់ (Teuk Daoh Kou Khap)",
    "ua": "Молоко згущене",
    "fr": "Lait concentré",
    "cat": "dairy_eggs",
    "form": "Бутылка",
    "desc": "Сладкое сгущённое молоко для кофе и десертов",
    "img_url": ""
  },
  {
    "ru": "Молоко сухое",
    "en": "Milk Powdered",
    "kh": "ទឹកដោះគោម្សៅ (Teuk Daoh Kou Msov)",
    "ua": "Молоко сухе",
    "fr": "Lait en poudre",
    "cat": "dairy_eggs",
    "form": "Молотый",
    "desc": "Сухое молоко для напитков и выпечки",
    "img_url": ""
  },
  {
    "ru": "Морковь",
    "en": "Carrot",
    "kh": "ការ៉ុត (Karot)",
    "ua": "Морква",
    "fr": "Carotte",
    "cat": "roots_tubers",
    "form": "Корень",
    "desc": "Сладкая хрустящая морковь",
    "img_url": ""
  },
  {
    "ru": "Мороженое",
    "en": "Ice Cream",
    "kh": "ការ៉េម (Karem)",
    "ua": "Морозиво",
    "fr": "Glace",
    "cat": "dairy_eggs",
    "form": "Целый",
    "desc": "Мороженое, популярный десерт на уличных лотках",
    "img_url": ""
  },
  {
    "ru": "Мука",
    "en": "Flour",
    "kh": "ម្សៅ (Msov)",
    "ua": "Борошно",
    "fr": "Farine",
    "cat": "grains_noodles",
    "form": "Молотый",
    "desc": "Мука для выпечки и теста",
    "img_url": ""
  },
  {
    "ru": "Мука из клейкого риса",
    "en": "Flour Glutinous Rice",
    "kh": "ម្សៅអង្ករដំណើប (Msov Angkor Damnaeb)",
    "ua": "Борошно з клейкого рису",
    "fr": "Farine de riz gluant",
    "cat": "grains_noodles",
    "form": "Молотый",
    "desc": "Мука для липких десертов и шариков моти",
    "img_url": ""
  },
  {
    "ru": "Мука пшеничная",
    "en": "Flour Wheat",
    "kh": "ម្សៅស្រូវសាលី (Msov Srov Sali)",
    "ua": "Борошно пшеничне",
    "fr": "Farine de blé",
    "cat": "grains_noodles",
    "form": "Молотый",
    "desc": "Пшеничная мука для выпечки и лапши",
    "img_url": ""
  },
  {
    "ru": "Мука рисовая",
    "en": "Flour Rice",
    "kh": "ម្សៅអង្ករ (Msov Angkor)",
    "ua": "Борошно рисове",
    "fr": "Farine de riz",
    "cat": "grains_noodles",
    "form": "Молотый",
    "desc": "Мука из риса для блинов, лапши и десертов",
    "img_url": ""
  },
  {
    "ru": "Мясо змеи",
    "en": "Snake Meat",
    "kh": "សាច់ពស់ (Sach Pos)",
    "ua": "М'ясо змії",
    "fr": "Viande de serpent",
    "cat": "street_exotic",
    "form": "Нарезка",
    "desc": "Мясо змеи для жарки и тушения",
    "img_url": ""
  },
  {
    "ru": "Мята свежая",
    "en": "Mint Fresh",
    "kh": "ជីរអង្កាម (Chi Angkam)",
    "ua": "М'ята свіжа",
    "fr": "Menthe fraîche",
    "cat": "herbs",
    "form": "Пучок",
    "desc": "Свежая ароматная мята",
    "img_url": ""
  },
  {
    "ru": "Огурец",
    "en": "Cucumber",
    "kh": "ត្រសក់ (Trosak)",
    "ua": "Огірок",
    "fr": "Concombre",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Хрустящие свежие огурцы",
    "img_url": ""
  },
  {
    "ru": "Огурец горький / Момордика",
    "en": "Cucumber Bitter / Bitter Gourd",
    "kh": "ម្រះ (Mreah)",
    "ua": "Огірок гіркий / Момордика",
    "fr": "Margose / Melon amer",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Ребристый горький огурец для супов и фарширования свининой",
    "img_url": ""
  },
  {
    "ru": "Осьминог",
    "en": "Octopus",
    "kh": "មឹកយក្ស (Meuk Yeak) [?]",
    "ua": "Восьминіг",
    "fr": "Poulpe",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Свежий осьминог для гриля",
    "img_url": ""
  },
  {
    "ru": "Папайя зеленая",
    "en": "Papaya Green",
    "kh": "ល្ហុងខ្ចី (Lhong Khchei)",
    "ua": "Папая зелена",
    "fr": "Papaye verte",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Для хрустящего салата Сом Там / Бок Лхунг",
    "img_url": ""
  },
  {
    "ru": "Папайя спелая",
    "en": "Papaya Ripe",
    "kh": "ល្ហុងទុំ (Lhong Tum)",
    "ua": "Папая стигла",
    "fr": "Papaye mûre",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Оранжевая сладкая папайя",
    "img_url": ""
  },
  {
    "ru": "Паста карри Амок / Крёнг",
    "en": "Paste Amok Curry / Kroeung",
    "kh": "គ្រឿងអាម៉ុក (Kreuang Amok)",
    "ua": "Паста карі Амок / Крьонг",
    "fr": "Pâte de curry amok / Kroeung",
    "cat": "sauces",
    "form": "Паста",
    "desc": "Ароматная паста из лемонграсса, куркумы и специй для рыбного амока",
    "img_url": ""
  },
  {
    "ru": "Паста креветочная",
    "en": "Paste Shrimp",
    "kh": "កាពិ (Kapi)",
    "ua": "Паста креветкова",
    "fr": "Pâte de crevettes",
    "cat": "sauces",
    "form": "Паста",
    "desc": "Ферментированная паста из мелких креветок для соусов и супов",
    "img_url": ""
  },
  {
    "ru": "Перец белый",
    "en": "Pepper White",
    "kh": "ម្រេចស (Mrech Sor)",
    "ua": "Перець білий",
    "fr": "Poivre blanc",
    "cat": "spices_roots",
    "form": "Молотый",
    "desc": "Очищенные спелые зерна перца с утонченным ароматом",
    "img_url": ""
  },
  {
    "ru": "Перец зеленый свежий (гроздья)",
    "en": "Pepper Green Fresh (Bunches)",
    "kh": "ម្រេចខ្ចី (Mrech Khchei)",
    "ua": "Перець зелений свіжий (грона)",
    "fr": "Poivre vert frais (en grappes)",
    "cat": "spices_roots",
    "form": "Стручок",
    "desc": "Свежие зеленые гроздья перца прямо с лозы для жарки с морепродуктами",
    "img_url": ""
  },
  {
    "ru": "Перец красный",
    "en": "Pepper Red",
    "kh": "ម្រេចក្រហម (Mrech Krahom)",
    "ua": "Перець червоний",
    "fr": "Poivre rouge",
    "cat": "spices_roots",
    "form": "Молотый",
    "desc": "Спелый ароматный перец со сладковато-острыми нотами",
    "img_url": ""
  },
  {
    "ru": "Перец черный горошком",
    "en": "Pepper Black",
    "kh": "ម្រេចខ្មៅ (Mrech Khmao)",
    "ua": "Перець чорний горошком",
    "fr": "Poivre noir en grains",
    "cat": "spices_roots",
    "form": "Молотый",
    "desc": "Ароматный черный перец с теплыми древесными нотами",
    "img_url": ""
  },
  {
    "ru": "Перец чили свежий",
    "en": "Pepper Chili Fresh",
    "kh": "ម្ទេសស្រស់ (Mtes Sros)",
    "ua": "Перець чилі свіжий",
    "fr": "Piment frais / Poivre piment",
    "cat": "spices_roots",
    "form": "Стручок",
    "desc": "Острый свежий перец чили",
    "img_url": ""
  },
  {
    "ru": "Побеги бамбука",
    "en": "Bamboo Shoots",
    "kh": "ទំពាំងឫស្សី (Tumpeang Ruessei)",
    "ua": "Пагони бамбука",
    "fr": "Pousses de bambou",
    "cat": "vegetables",
    "form": "Нарезка",
    "desc": "Молодые побеги бамбука для супов и карри",
    "img_url": ""
  },
  {
    "ru": "Помело",
    "en": "Pomelo",
    "kh": "ក្រូចថ្លុង (Krouch Thlong)",
    "ua": "Помело",
    "fr": "Pomélo",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Крупный сочный цитрус с плотной сладкой мякотью",
    "img_url": ""
  },
  {
    "ru": "Помидор / Томат",
    "en": "Tomato",
    "kh": "ប៉េងប៉ោះ (Peng Paoh)",
    "ua": "Помідор / Томат",
    "fr": "Tomate",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Спелые сочные помидоры",
    "img_url": ""
  },
  {
    "ru": "Прахок (ферментированная рыбная паста)",
    "en": "Prahok (Fermented Fish Paste)",
    "kh": "ប្រហុក (Prahok)",
    "ua": "Прахок (рибна паста)",
    "fr": "Prahok (pâte de poisson fermentée)",
    "cat": "sauces",
    "form": "Паста",
    "desc": "Традиционная кхмерская соленая рыбная паста умами",
    "img_url": ""
  },
  {
    "ru": "Рамбутан",
    "en": "Rambutan",
    "kh": "សាវម៉ាវ (Savmav)",
    "ua": "Рамбутан",
    "fr": "Ramboutan",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Волосатый сладкий рамбутан",
    "img_url": ""
  },
  {
    "ru": "Рис варёный",
    "en": "Rice Cooked",
    "kh": "បាយ (Bay)",
    "ua": "Рис варений",
    "fr": "Riz cuit",
    "cat": "grains_noodles",
    "form": "Целый",
    "desc": "Готовый варёный рис, основа каждой трапезы",
    "img_url": ""
  },
  {
    "ru": "Рис Жасмин",
    "en": "Rice Jasmine",
    "kh": "អង្ករផ្កាម្លិះ (Angkor Phka Mlih)",
    "ua": "Рис Жасмин",
    "fr": "Riz jasmin",
    "cat": "grains_noodles",
    "form": "Целый",
    "desc": "Ароматный камбоджийский жасминовый рис",
    "img_url": ""
  },
  {
    "ru": "Рис клейкий (белый / черный)",
    "en": "Rice Sticky / Glutinous Rice",
    "kh": "អង្ករដំណើប (Angkor Damnaeb)",
    "ua": "Рис клейкий",
    "fr": "Riz gluant",
    "cat": "grains_noodles",
    "form": "Целый",
    "desc": "Клейкий рис для десертов с манго и бамбукового риса Кролан",
    "img_url": ""
  },
  {
    "ru": "Рис красный",
    "en": "Rice Red",
    "kh": "អង្ករក្រហម (Angkor Krahom)",
    "ua": "Рис червоний",
    "fr": "Riz rouge",
    "cat": "grains_noodles",
    "form": "Целый",
    "desc": "Нешлифованный красный рис с ореховым вкусом",
    "img_url": ""
  },
  {
    "ru": "Рис сырой",
    "en": "Rice Uncooked",
    "kh": "អង្ករ (Angkor)",
    "ua": "Рис сирий",
    "fr": "Riz cru",
    "cat": "grains_noodles",
    "form": "Целый",
    "desc": "Неварёный рис, базовая крупа",
    "img_url": ""
  },
  {
    "ru": "Ростки сои / Маша",
    "en": "Bean Sprouts",
    "kh": "សណ្តែកបណ្តុះ (Sandaek Bandoh)",
    "ua": "Паростки сої / Машу",
    "fr": "Pousses de soja / Haricot mungo",
    "cat": "legumes_nuts",
    "form": "Пучок",
    "desc": "Хрустящие свежие ростки для супов и лапши",
    "img_url": ""
  },
  {
    "ru": "Рыба консервированная",
    "en": "Fish Canned",
    "kh": "ត្រីខ (Trei Kor)",
    "ua": "Риба консервована",
    "fr": "Poisson en boîte",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Рыба в консервной банке",
    "img_url": ""
  },
  {
    "ru": "Рыба речная (Сом / Змееголов)",
    "en": "Fish River (Catfish / Snakehead)",
    "kh": "ត្រីរ៉ស់ / ត្រីអណ្តែង (Trei Ros / Trei Andaeng)",
    "ua": "Риба річкова (Сом / Змієголов)",
    "fr": "Poisson de rivière (Silure / Tête de serpent)",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Свежая речная рыба для супов, прахока и жарки",
    "img_url": ""
  },
  {
    "ru": "Рыба свежая",
    "en": "Fish Fresh",
    "kh": "ត្រីស្រស់ (Trei Sros)",
    "ua": "Риба свіжа",
    "fr": "Poisson frais",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Свежая рыба речная или морская",
    "img_url": ""
  },
  {
    "ru": "Рыба сушеная / вяленая",
    "en": "Fish Dried",
    "kh": "ត្រីងៀត (Trei Ngiet)",
    "ua": "Риба сушена / в'ялена",
    "fr": "Poisson séché",
    "cat": "seafood",
    "form": "Сушеный",
    "desc": "Традиционная сушеная соленая рыба для жарки с рисом",
    "img_url": ""
  },
  {
    "ru": "Салат листовой / Салатная зелень",
    "en": "Lettuce / Salad Greens",
    "kh": "សាឡាដ (Salad)",
    "ua": "Салат листовий / Салатна зелень",
    "fr": "Salade verte / Laitue",
    "cat": "herbs",
    "form": "Пучок",
    "desc": "Свежие листья салата",
    "img_url": ""
  },
  {
    "ru": "Сахар белый",
    "en": "Sugar White",
    "kh": "ស្ករ (Skor)",
    "ua": "Цукор білий",
    "fr": "Sucre blanc",
    "cat": "sauces",
    "form": "Молотый",
    "desc": "Белый сахар",
    "img_url": ""
  },
  {
    "ru": "Сахар пальмовый",
    "en": "Sugar Palm",
    "kh": "ស្ករត្នោត (Skor Tnaot)",
    "ua": "Цукор пальмовий",
    "fr": "Sucre de palme",
    "cat": "sauces",
    "form": "Паста",
    "desc": "Натуральный нерафинированный сахар из сока сахарной пальмы",
    "img_url": ""
  },
  {
    "ru": "Свекла",
    "en": "Beetroot",
    "kh": "មើមឆៃថាវក្រហម (Meum Chhay Thav Krahom) [?]",
    "ua": "Буряк",
    "fr": "Betterave",
    "cat": "roots_tubers",
    "form": "Корень",
    "desc": "Свекла столовая красная",
    "img_url": ""
  },
  {
    "ru": "Сверчки жареные",
    "en": "Crickets Fried",
    "kh": "ចង្រិតចៀន (Chongret Chien)",
    "ua": "Цвіркуни смажені",
    "fr": "Grillons frits",
    "cat": "street_exotic",
    "form": "Целый",
    "desc": "Хрустящие жареные сверчки, классическая уличная закуска",
    "img_url": ""
  },
  {
    "ru": "Свинина",
    "en": "Pork",
    "kh": "សាច់ជ្រូក (Sach Chruk)",
    "ua": "Свинина",
    "fr": "Porc",
    "cat": "meat",
    "form": "Целый",
    "desc": "Свежая свиная вырезка",
    "img_url": ""
  },
  {
    "ru": "Свинина (грудинка / бекон)",
    "en": "Pork Belly / Bacon",
    "kh": "សាច់ជ្រូកបីជាន់ (Sach Chruk Bei Choan)",
    "ua": "Свинина (грудинка / бекон)",
    "fr": "Porc (poitrine / lard)",
    "cat": "meat",
    "form": "Нарезка",
    "desc": "Свиная грудинка трехуровневая",
    "img_url": ""
  },
  {
    "ru": "Свинина (кожа)",
    "en": "Pork Skin",
    "kh": "ស្បែកជ្រូក (Sbaek Chruk)",
    "ua": "Свинина (шкіра)",
    "fr": "Porc (couenne)",
    "cat": "meat",
    "form": "Нарезка",
    "desc": "Свиная кожа для закусок и тушёных блюд",
    "img_url": ""
  },
  {
    "ru": "Свинина (кровь)",
    "en": "Pork Blood",
    "kh": "ឈាមជ្រូក (Chheam Chruk)",
    "ua": "Свинина (кров)",
    "fr": "Porc (sang)",
    "cat": "meat",
    "form": "Целый",
    "desc": "Свернувшаяся кровь для супов",
    "img_url": ""
  },
  {
    "ru": "Свинина (ножки)",
    "en": "Pork Trotters",
    "kh": "ជើងជ្រូក (Cheung Chruk)",
    "ua": "Свинина (ніжки)",
    "fr": "Porc (pieds)",
    "cat": "meat",
    "form": "Целый",
    "desc": "Свиные ножки для бульонов и тушения",
    "img_url": ""
  },
  {
    "ru": "Свинина (печень / субпродукты)",
    "en": "Pork Liver / Offal",
    "kh": "ថ្លើមជ្រូក (Thlaem Chruk)",
    "ua": "Свинина (печінка / субпродукти)",
    "fr": "Porc (foie / abats)",
    "cat": "meat",
    "form": "Нарезка",
    "desc": "Свежая свиная печень и субпродукты",
    "img_url": ""
  },
  {
    "ru": "Свинина (ребра)",
    "en": "Pork Ribs",
    "kh": "ឆ្អឹងជំនីជ្រូក (Chhoeng Chumni Chruk)",
    "ua": "Свинина (реберця)",
    "fr": "Porc (travers / côtes)",
    "cat": "meat",
    "form": "Нарезка",
    "desc": "Свиные ребрышки для супов и гриля",
    "img_url": ""
  },
  {
    "ru": "Свинина (фарш)",
    "en": "Pork Minced / Minced Meat",
    "kh": "សាច់ចិញ្ច្រាំ (Sach Chinjram)",
    "ua": "Свинина (фарш)",
    "fr": "Porc haché / Viande hachée",
    "cat": "meat",
    "form": "Молотый",
    "desc": "Свежемолотый фарш",
    "img_url": ""
  },
  {
    "ru": "Свинина (язык)",
    "en": "Pork Tongue",
    "kh": "អណ្ដាតជ្រូក (Andat Chruk)",
    "ua": "Свинина (язик)",
    "fr": "Porc (langue)",
    "cat": "meat",
    "form": "Целый",
    "desc": "Субпродукт для тушения",
    "img_url": ""
  },
  {
    "ru": "Семена лотоса",
    "en": "Lotus Seeds",
    "kh": "គ្រាប់ឈូក (Kroab Chhuk)",
    "ua": "Насіння лотоса",
    "fr": "Graines de lotus",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Свежие или сушёные семена лотоса для супов и десертов",
    "img_url": ""
  },
  {
    "ru": "Соль морская натуральная",
    "en": "Salt Sea Natural",
    "kh": "អំបិលសមុទ្រធម្មជាតិ (Ambel Samut Thomcheat)",
    "ua": "Сіль морська натуральна",
    "fr": "Sel marin naturel",
    "cat": "sauces",
    "form": "Молотый",
    "desc": "Чистая натуральная морская соль солевых приморских бассейнов",
    "img_url": ""
  },
  {
    "ru": "Соль поваренная",
    "en": "Salt Table",
    "kh": "អំបិល (Ambel)",
    "ua": "Сіль кухонна",
    "fr": "Sel de table",
    "cat": "sauces",
    "form": "Молотый",
    "desc": "Обычная пищевая соль",
    "img_url": ""
  },
  {
    "ru": "Соус острый чили",
    "en": "Sauce Chili",
    "kh": "ទឹកម្ទេស (Teuk Mtes)",
    "ua": "Соус гострий чилі",
    "fr": "Sauce pimentée",
    "cat": "sauces",
    "form": "Паста",
    "desc": "Острый соус из перца чили",
    "img_url": ""
  },
  {
    "ru": "Соус рыбный",
    "en": "Sauce Fish",
    "kh": "ទឹកត្រី (Teuk Trei)",
    "ua": "Соус рибний",
    "fr": "Sauce de poisson (Nuoc-mâm)",
    "cat": "sauces",
    "form": "Паста",
    "desc": "Традиционный ферментированный соус",
    "img_url": ""
  },
  {
    "ru": "Соус соевый",
    "en": "Sauce Soy",
    "kh": "ទឹកស៊ីអ៊ីវ (Tuk Sei-Iew)",
    "ua": "Соус соєвий",
    "fr": "Sauce soja",
    "cat": "sauces",
    "form": "Жидкий",
    "desc": "Соевый соус светлый или темный",
    "img_url": ""
  },
  {
    "ru": "Соус устричный",
    "en": "Sauce Oyster",
    "kh": "ប្រេងខ្យង (Preng Khyang)",
    "ua": "Соус устричний",
    "fr": "Sauce d'huître",
    "cat": "sauces",
    "form": "Паста",
    "desc": "Густой устричный соус для стир-фрая",
    "img_url": ""
  },
  {
    "ru": "Соус чили острый домашний",
    "en": "Sauce Chili Hot Homemade",
    "kh": "ទឹកម្ទេសធ្វើនៅផ្ទះ (Teuk Mtes)",
    "ua": "Соус чилі гострий домашній",
    "fr": "Sauce pimentée maison",
    "cat": "homemade",
    "form": "Бутылка",
    "desc": "Натуральный острый соус из свежих местных перцев чили и чеснока",
    "img_url": ""
  },
  {
    "ru": "Соя",
    "en": "Soybeans",
    "kh": "សណ្តែកសៀង (Sandaek Sieng) [?]",
    "ua": "Соя",
    "fr": "Soja",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Соевые бобы для тофу, соусов и закусок",
    "img_url": ""
  },
  {
    "ru": "Стебли лотоса",
    "en": "Lotus Stems",
    "kh": "ទងឈូក (Tong Chhuk)",
    "ua": "Стебла лотоса",
    "fr": "Tiges de lotus",
    "cat": "vegetables",
    "form": "Пучок",
    "desc": "Стебли лотоса для салатов и кислых супов",
    "img_url": ""
  },
  {
    "ru": "Сыр",
    "en": "Cheese",
    "kh": "ឈីស (Chhis)",
    "ua": "Сир",
    "fr": "Fromage",
    "cat": "dairy_eggs",
    "form": "Нарезка",
    "desc": "Привозной сыр в нарезке",
    "img_url": ""
  },
  {
    "ru": "Тамаринд паста / мякоть",
    "en": "Tamarind Paste",
    "kh": "សាច់អំពិល (Sach Ampil)",
    "ua": "Тамаринд паста / м'якоть",
    "fr": "Tamarin (pâte)",
    "cat": "sauces",
    "form": "Паста",
    "desc": "Концентрированная паста тамаринда для супа Том Ям и пад-тая",
    "img_url": ""
  },
  {
    "ru": "Тамаринд спелый / кислый",
    "en": "Tamarind Ripe",
    "kh": "អំពិល / អំពិលទុំ (Ampil / Ampil Tum)",
    "ua": "Тамаринд стиглий",
    "fr": "Tamarin mûr",
    "cat": "fruits",
    "form": "Стручок",
    "desc": "Сладковато-кислый тамаринд для соусов, супов и перекуса",
    "img_url": ""
  },
  {
    "ru": "Тапиока (жемчужины) / Саго",
    "en": "Tapioca Pearls / Sago",
    "kh": "គ្រាប់សាគូ (Kroab Saku)",
    "ua": "Перлини тапіоки / Саго",
    "fr": "Perles de tapioca / Sagou",
    "cat": "grains_noodles",
    "form": "Сушеный",
    "desc": "Шарики тапиоки для боба-чая и десертов с кокосовым молоком",
    "img_url": ""
  },
  {
    "ru": "Тарантул жареный",
    "en": "Tarantula Fried",
    "kh": "ពីងពាងចៀន (Ping Peang Chien) [?]",
    "ua": "Тарантул смажений",
    "fr": "Tarentule frite",
    "cat": "street_exotic",
    "form": "Целый",
    "desc": "Жареный тарантул с чесноком и специями, традиционная уличная закуска",
    "img_url": ""
  },
  {
    "ru": "Таро / Колоказия",
    "en": "Taro Root",
    "kh": "ដំឡូងត្រាវ / ត្រាវ (Domlong Trav / Trav) [?]",
    "ua": "Таро / Колоказія",
    "fr": "Racine de taro",
    "cat": "roots_tubers",
    "form": "Корень",
    "desc": "Плотный серо-фиолетовый клубень для десертов и супов",
    "img_url": ""
  },
  {
    "ru": "Творог домашний / Сыр свежий",
    "en": "Cheese Cottage Homemade / Farmer's Cheese",
    "kh": "ប្រូម៉ាសស្រស់ធ្វើនៅផ្ទះ (Fromage Sros)",
    "ua": "Сир домашній / Творог",
    "fr": "Fromage blanc maison / Fromage fermier",
    "cat": "homemade",
    "form": "Целый",
    "desc": "Свежий натуральный домашний творог ручной работы",
    "img_url": ""
  },
  {
    "ru": "Тофу свежий",
    "en": "Tofu Fresh",
    "kh": "តៅហ៊ូ (Taohu)",
    "ua": "Тофу свіжий",
    "fr": "Tofu frais",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Соевый сыр тофу мягкий или твердый",
    "img_url": ""
  },
  {
    "ru": "Тыква",
    "en": "Pumpkin",
    "kh": "ល្ពៅ (Lpao)",
    "ua": "Гарбуз",
    "fr": "Courge / Citrouille",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Сладкая плотная тыква",
    "img_url": ""
  },
  {
    "ru": "Тыква бутылочная",
    "en": "Pumpkin Bottle Gourd / Bottle Gourd",
    "kh": "ឃ្លោក (Khlouk)",
    "ua": "Гарбуз пляшковий (Лагенарія)",
    "fr": "Courge calebasse / Gourde",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Светло-зелёная тыква для супов и тушения",
    "img_url": ""
  },
  {
    "ru": "Угорь",
    "en": "Eel",
    "kh": "ត្រីអន្ទង់ (Trei Antong)",
    "ua": "Вугор",
    "fr": "Anguille",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Речной угорь для жарки и тушения",
    "img_url": ""
  },
  {
    "ru": "Укроп",
    "en": "Dill",
    "kh": "ជីរបារាំង (Chi Barang) [?]",
    "ua": "Кріп",
    "fr": "Aneth",
    "cat": "herbs",
    "form": "Пучок",
    "desc": "Свежий укроп",
    "img_url": ""
  },
  {
    "ru": "Уксус",
    "en": "Vinegar",
    "kh": "ទឹកខ្មេះ (Teuk Khmeh)",
    "ua": "Оцет",
    "fr": "Vinaigre",
    "cat": "sauces",
    "form": "Паста",
    "desc": "Кислая приправа для маринадов и салатов",
    "img_url": ""
  },
  {
    "ru": "Улитки",
    "en": "Snails",
    "kh": "ខ្យង (Khyang)",
    "ua": "Равлики",
    "fr": "Escargots",
    "cat": "street_exotic",
    "form": "Целый",
    "desc": "Речные улитки для жарки и супов",
    "img_url": ""
  },
  {
    "ru": "Утка",
    "en": "Duck",
    "kh": "សាច់ទា (Sach Tea)",
    "ua": "Качка",
    "fr": "Canard",
    "cat": "meat",
    "form": "Целый",
    "desc": "Свежая утка",
    "img_url": ""
  },
  {
    "ru": "Фасоль красная",
    "en": "Beans Red",
    "kh": "សណ្តែកក្រហម (Sandaek Krahom)",
    "ua": "Квасоля червона",
    "fr": "Haricots rouges",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Красная фасоль для десертов и супов",
    "img_url": ""
  },
  {
    "ru": "Фасоль крылатая / Драконьи бобы",
    "en": "Beans Winged / Dragon Bean",
    "kh": "សណ្ដែកពួរ (Sandaek Puor) [?]",
    "ua": "Квасоля крилата / Драконячі боби",
    "fr": "Haricots ailés / Pois carrés",
    "cat": "legumes_nuts",
    "form": "Стручок",
    "desc": "Четырёхгранные стручки с «крылышками» для салатов и жарки",
    "img_url": ""
  },
  {
    "ru": "Фасоль маш (зелёная)",
    "en": "Beans Mung",
    "kh": "សណ្តែកបៃតង (Sandaek Baitong) [?]",
    "ua": "Квасоля маш (зелена)",
    "fr": "Haricots mungo",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Зелёные бобы для десертов, супов и ростков",
    "img_url": ""
  },
  {
    "ru": "Фасоль спаржевая / Длинная фасоль",
    "en": "Beans Yardlong / Green Beans",
    "kh": "សណ្តែកកួរ (Sandaek Kuor)",
    "ua": "Квасоля спаржева / Довга квасоля",
    "fr": "Haricots longs / Haricots kilomètres",
    "cat": "legumes_nuts",
    "form": "Стручок",
    "desc": "Длинные зеленые хрустящие стручки фасоли",
    "img_url": ""
  },
  {
    "ru": "Фасоль чёрная",
    "en": "Beans Black",
    "kh": "សណ្តែកខ្មៅ (Sandaek Khmao)",
    "ua": "Квасоля чорна",
    "fr": "Haricots noirs",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Чёрная фасоль для десертов и каш",
    "img_url": ""
  },
  {
    "ru": "Хлеб / Багет",
    "en": "Bread / Baguette",
    "kh": "នំបុ័ង (Nom Pang)",
    "ua": "Хліб / Багет",
    "fr": "Pain / Baguette",
    "cat": "grains_noodles",
    "form": "Целый",
    "desc": "Хрустящий багет по-французски",
    "img_url": ""
  },
  {
    "ru": "Цветок банана (соцветие)",
    "en": "Banana Blossom",
    "kh": "ផ្កាចេក (Phka Chek)",
    "ua": "Квітка банана (суцвіття)",
    "fr": "Fleur de bananier (inflorescence)",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Цветок банана для салатов и лапши",
    "img_url": ""
  },
  {
    "ru": "Чай",
    "en": "Tea",
    "kh": "តែ (Tae)",
    "ua": "Чай",
    "fr": "Thé",
    "cat": "sauces",
    "form": "Сушеный",
    "desc": "Сушёные чайные листья",
    "img_url": ""
  },
  {
    "ru": "Чеснок",
    "en": "Garlic",
    "kh": "ខ្ទឹមស (Khtoem Sor)",
    "ua": "Часник",
    "fr": "Ail",
    "cat": "spices_roots",
    "form": "Целый",
    "desc": "Мелкий пряный чеснок",
    "img_url": ""
  },
  {
    "ru": "Шпинат водяной / Морнинг глори",
    "en": "Spinach Water / Morning Glory",
    "kh": "ត្រកួន (Trakuon)",
    "ua": "Шпинат водяний / Морнінг глорі",
    "fr": "Épinard d'eau / Liseron d'eau",
    "cat": "herbs",
    "form": "Пучок",
    "desc": "Стебли и листья для жарки на воке с чесноком",
    "img_url": ""
  },
  {
    "ru": "Яблоко",
    "en": "Apple",
    "kh": "ផ្លែប៉ោម (Phlae Paom)",
    "ua": "Яблуко",
    "fr": "Pomme",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Привозные хрустящие яблоки",
    "img_url": ""
  },
  {
    "ru": "Яблоко сахарное / Аннона (нойна)",
    "en": "Apple Sugar / Sweetsop",
    "kh": "ផ្លែទៀប (Phlae Tieb)",
    "ua": "Яблуко цукрове / Аннона (нойна)",
    "fr": "Pomme cannelle / Attier (Annona)",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Сладкий кремовый плод с чешуйчатой зеленой кожурой",
    "img_url": ""
  },
  {
    "ru": "Яйца красных муравьёв",
    "en": "Eggs Red Ant",
    "kh": "ពងស្រមោច (Pong Sromaoch)",
    "ua": "Яйця червоних мурах",
    "fr": "Œufs de fourmis rouges",
    "cat": "street_exotic",
    "form": "Целый",
    "desc": "Яйца муравьёв для салатов и омлетов",
    "img_url": ""
  },
  {
    "ru": "Яйца куриные / утиные",
    "en": "Eggs Chicken / Duck",
    "kh": "ពងមាន់ / ស៊ុត (Pong Moan / Sut)",
    "ua": "Яйця курячі / качині",
    "fr": "Œufs (poulet / canard)",
    "cat": "dairy_eggs",
    "form": "Целый",
    "desc": "Свежие фермерские яйца",
    "img_url": ""
  },
  {
    "ru": "Яйца перепелиные",
    "en": "Eggs Quail",
    "kh": "ពងក្រួច (Pong Kruoch)",
    "ua": "Яйця перепелині",
    "fr": "Œufs de caille",
    "cat": "dairy_eggs",
    "form": "Целый",
    "desc": "Маленькие пятнистые перепелиные яйца",
    "img_url": ""
  },
  {
    "ru": "Яйца утиные",
    "en": "Eggs Duck",
    "kh": "ពងទា (Pong Tea)",
    "ua": "Яйця качині",
    "fr": "Œufs de canard",
    "cat": "dairy_eggs",
    "form": "Целый",
    "desc": "Крупные утиные яйца для варки и жарки",
    "img_url": ""
  },
  {
    "ru": "Яйца утиные солёные",
    "en": "Eggs Duck Salted",
    "kh": "ពងទាប្រៃ (Pong Tea Pray)",
    "ua": "Яйця качині солоні",
    "fr": "Œufs de canard salés",
    "cat": "dairy_eggs",
    "form": "Целый",
    "desc": "Солёные утиные яйца к рису и к жареным блюдам",
    "img_url": ""
  },
  {
    "ru": "Ямс фиолетовый / Убе",
    "en": "Yam Purple / Ube",
    "kh": "ដំឡូងឈាមមាន់ / ដំឡូងស្វាយ (Domlong Chheam Moan / Domlong Svay) [?]",
    "ua": "Ямс фіолетовий / Убе",
    "fr": "Igname violet / Ubé",
    "cat": "roots_tubers",
    "form": "Корень",
    "desc": "Ярко-фиолетовый сладкий клубень для десертов",
    "img_url": ""
  },
  {
    "ru": "Рыба индийский алект",
    "en": "Fish Indian Threadfish",
    "kh": "ត្រីឆ្មុក (Trei Chhmok)",
    "ua": "Риба індійський алект",
    "fr": "Poisson cordonnier fil (Alectis indica)",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Морская рыба семейства ставридовых для жарки",
    "img_url": "",
    "source": "database"
  },
  {
    "ru": "Рыба нитепёрый окунь",
    "en": "Fish Threadfin Bream",
    "kh": "ត្រីខ្សាច់ (Trei Khsach)",
    "ua": "Риба ниткоперий окунь",
    "fr": "Poisson cohana dorée (Nemiptère)",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Популярная морская рыба с нежным белым мясом",
    "img_url": "",
    "source": "database"
  },
  {
    "ru": "Рыба сарган",
    "en": "Fish Needlefish",
    "kh": "ត្រីម្ជុល (Trei Mjul)",
    "ua": "Риба сарган",
    "fr": "Poisson aiguille de mer / Orphie",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Морская хищная рыба с удлиненным телом для жарки на углях",
    "img_url": "",
    "source": "database"
  },
  {
    "ru": "Рыба-сиган (морской кролик)",
    "en": "Fish Rabbitfish (Streaked Spinefoot)",
    "kh": "ត្រីត្រម៉ង់ (Trei Tromong)",
    "ua": "Риба-сиган (морський кролик)",
    "fr": "Poisson-lapin (Sigan marbré)",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Прибрежная морская рыба для ухи и запекания",
    "img_url": "",
    "source": "database"
  },
  {
    "ru": "Семена стеркулии (Мальва-нат)",
    "en": "Malva Nut",
    "kh": "ផ្លែសំរង (Phlae Samrong)",
    "ua": "Насіння стеркулії (Мальва-нат)",
    "fr": "Graines de malva (Samrong)",
    "cat": "legumes_nuts",
    "form": "Сушеный",
    "desc": "Сушеные семена мальва-нат для охлаждающих десертов и напитков",
    "img_url": "",
    "source": "database"
  },
  {
    "ru": "Соус хойсин",
    "en": "Sauce Hoisin",
    "kh": "ទឹកសៀងឆ្ងាញ់ (Tuk Sieng Chhnganh)",
    "ua": "Соус хойсін",
    "fr": "Sauce hoisin",
    "cat": "sauces",
    "form": "Соус",
    "desc": "Густой сладковато-пряный соус для мяса и маринадов",
    "img_url": "",
    "source": "database"
  },
  {
    "ru": "Соус Шрирача",
    "en": "Sauce Sriracha",
    "kh": "ទឹកម្ទេសស្រីរ៉ាចា (Tuk Mtes Sriracha)",
    "ua": "Соус Шрірача",
    "fr": "Sauce Sriracha",
    "cat": "sauces",
    "form": "Соус",
    "desc": "Острый соус из перцев чили, чеснока и уксуса",
    "img_url": "",
    "source": "database"
  },
  {
    "ru": "Тамаринд молодой зеленый",
    "en": "Tamarind Green",
    "kh": "អំពិលខ្ចី (Ampil Kchey)",
    "ua": "Тамаринд молодий зелений",
    "fr": "Tamarin vert",
    "cat": "fruits",
    "form": "Целый",
    "desc": "Свежие стручки молодого тамаринда обладают ярким терпко-кислым вкусом. В камбоджийской кухне их толкут для кислых супов (сомло мачу) или едят сырыми, макая в острую соль с чили.",
    "img_url": "https://res.cloudinary.com/xzoeawbu/image/upload/v1790986536/FreshMarket/hjtibffxgkb4jqg5yplq.jpg",
    "source": "database"
  },
  {
    "ru": "Тофу яичный",
    "en": "Tofu Egg",
    "kh": "តៅហ៊ូពងមាន់ (Tawhu Pong Moan)",
    "ua": "Тофу яєчний",
    "fr": "Tofu aux œufs",
    "cat": "legumes_nuts",
    "form": "Целый",
    "desc": "Нежный японский яичный тофу в тубах для супов и обжарки",
    "img_url": "",
    "source": "database"
  },
  {
    "ru": "Угорь колючий",
    "en": "Eel Spiny",
    "kh": "ត្រីឆ្លូញ (Trei Chhluonh)",
    "ua": "Вугор колючий",
    "fr": "Anguille épineuse",
    "cat": "seafood",
    "form": "Целый",
    "desc": "Мелкая пресноводная рыба с плотным, нежным и сладковатым мясом. В камбоджийской кухне её чаще всего жарят во фритюре до хруста, вялят на солнце или варят в кисло-острых супах.",
    "img_url": "https://res.cloudinary.com/xzoeawbu/image/upload/v1790986504/FreshMarket/psam2v4r3c14rh3dm3jh.jpg",
    "source": "database"
  },
  {
    "ru": "Цветок банана",
    "en": "Banana Flower",
    "kh": "ត្រយូងចេក (Troyoong Chek)",
    "ua": "Квітка банана",
    "fr": "Fleur de bananier",
    "cat": "vegetables",
    "form": "Целый",
    "desc": "Мясистый бутон банана для свежих кхмерских салатов и супов",
    "img_url": "",
    "source": "database"
  }
]
$dict$::jsonb);
