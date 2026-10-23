# Настройка Supabase и Модель Безопасности FreshMarket (v1.4)

Данный документ содержит полное руководство по настройке базы данных **Supabase**, разграничению прав доступа (RLS) и бизнес-логике консьерж-закупки между **Служебной зоной закупщика (`/admin/`)** и **Клиентской витриной (`shop.html`)**.

---

## 1. Бизнес-модель консьерж-закупки (Concierge Shopper)

На традиционном утреннем рынке цены меняются ежедневно, зависят от утреннего завоза, сорта и фактического веса при взвешивании. 

1. **Оформление заявки клиентом (Витрина `shop.html`):**
   * Клиент выбирает продукты, ориентировочный вес/количество, правила автозамен и адрес доставки.
   * В базу сохраняется заявка со статусом `pending` (Ожидает закупки на рынке).
2. **Закупка на рынке (Админка `/admin/`):**
   * Закупщик утром отбирает свежие продукты на рынке, получает чеки от торговцев.
   * В админке закупщик вводит фактическую сумму чеков `actual_market_total` (или прикрепляет фото чека `receipt_url`).
3. **Расчёт итогового счёта (Админка):**
   $$\text{Итоговый счёт (grand\_total)} = \text{Чек с рынка} + \text{Услуга (10\%)} + \text{Тариф зоны доставки}$$
4. **Доставка и оплата:**
   * Заказ переводится в статус `delivering` (Доставляется).
   * Покупатель видит в витрине итоговый счёт с фото чека и оплачивает заказ (наличными курьеру или переводом).

---

## 2. Структура миграций и SQL Скрипты

> 💡 **Рекомендуемый способ управления базой данных (v1.5.0+):**  
> Все изменения схемы базы данных и политик RLS версионируются в каталоге [`supabase/migrations/`](file:///Users/elwis/dev/FreshMarket/supabase/migrations/):
> * [`supabase/migrations/20261017000000_initial_schema.sql`](file:///Users/elwis/dev/FreshMarket/supabase/migrations/20261017000000_initial_schema.sql) — базовые таблицы (`products`, `orders`, `order_items`, `profiles`), индексы, триггеры нумерации и создания профилей.
> * [`supabase/migrations/20261018000000_security_hardening.sql`](file:///Users/elwis/dev/FreshMarket/supabase/migrations/20261018000000_security_hardening.sql) — активация RLS, функции `is_admin()`, триггер защиты ролей `protect_profile_role()`, защищенная транзакционная RPC `create_order()`, очистка устаревших политик.
> * [`supabase/migrations/20261020000000_hardening_v4.sql`](file:///Users/elwis/dev/FreshMarket/supabase/migrations/20261020000000_hardening_v4.sql) — комплексное усиление по Аудиту v4: динамическая зачистка политик, унификация роли `admin`, Rate Limiting в `create_order()`, таймзона UTC+7, колонка `cart_updated_at` и Realtime публикация.
> * [`supabase/migrations/20261023000000_idempotent_order_creation.sql`](file:///Users/elwis/dev/FreshMarket/supabase/migrations/20261023000000_idempotent_order_creation.sql) — идемпотентность `create_order()`: проверка и немедленный возврат существующего заказа по `p_order_id` до проверок rate limit и лимита pending.
>
> 🔍 **Диагностический скрипт верификации базы данных:**  
> Файл [`scripts/verify_database.sql`](file:///Users/elwis/dev/FreshMarket/scripts/verify_database.sql) содержит готовые запросы для SQL Editor для мгновенной проверки соответствия живой базы миграциям.
>
> Миграции могут применяться автоматически через Supabase CLI (`supabase db push`) либо копированием содержимого файлов в **SQL Editor** консоли Supabase.

---

### 🚀 Быстрая миграция (v1.5.3): Добавление поля фасовки/веса (unit) и базовой цены в KHR

Если у вас уже развернуты таблицы `products`, `orders` и настроены политики RLS, для включения цен и фасовки достаточно выполнить две строчки в **SQL Editor**:

```sql
-- Добавление колонки примерной рыночной цены (базовый расчет в камбоджийских риэлях KHR)
ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT NULL;

-- Добавление колонки фасовки / единицы измерения / веса
ALTER TABLE products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT '1 кг';

-- Кросс-девайс настройки пользователя и правила замен (v1.5.4)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS preferred_lang TEXT DEFAULT 'ru';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS shop_layout TEXT DEFAULT 'grid-2';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS default_replacement_policy TEXT DEFAULT 'call_to_agree';
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS replacement_policy TEXT DEFAULT 'call_to_agree';
```

> **Особенности работы с полем `price` и `unit`:**
> * **Базовый расчет ведется в риэлях (KHR)**: в поле `price` сохраняется ориентировочная стоимость единицы продукта в камбоджийских риэлях (напр. `6000`).
> * **Поле `unit`**: хранит единицу фасовки или вес продукта (напр. канонический ключ `1_kg`, `500_g`, `1_pc`, `1_bunch` или текстовое значение), который автоматически локализуется через секцию `"units"` словарей `locales/*.json`.
> * При добавлении/редактировании продукта доступен выбор валюты (`៛ KHR` по умолчанию или `$ USD`). Если выбран доллар, цена автоматически пересчитывается в базовые риэли по курсу сервиса.
> * По умолчанию `price` равен `NULL` — на карточках товара отображается аккуратная плашка с меткой `n/a`.
> * При указании цены на карточке товара крупно отображается цена в риэлях с привязкой к единице (напр. `6,000 ៛ / 1 кг`) и динамический эквивалент в USD (`~$1.50`). Курс конвертации (по умолчанию $1 = 4,000 KHR) вынесен в параметры панели закупщика (`/admin/` → «Параметры сервиса») и пересчитывается на лету.
> * Цена сохраняется в базу данных Supabase и не перезаписывает словарь `products_dictionary.json`.

---

### 🟢 Вариант А: Быстрое обновление для СУЩЕСТВУЮЩЕЙ базы (100% сохранение товаров)

Если в вашей базе Supabase **уже создана и наполнена таблица `products`**, вам **НЕ нужно** ничего удалять или пересоздавать. 

Выполните в **SQL Editor** только этот безопасный блок, который добавит колонку цены, создаст таблицы заказов и обновит политики защиты RLS:

```sql
-- ============================================================================
-- 1. СОЗДАНИЕ ТАБЛИЦ ЗАКАЗОВ (Если их еще нет)
-- ============================================================================
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number TEXT UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payment_status TEXT NOT NULL DEFAULT 'pending',
  payment_method TEXT NOT NULL DEFAULT 'cash',
  customer_name TEXT,
  customer_phone TEXT,
  customer_messenger TEXT,
  delivery_address TEXT,
  customer_notes TEXT,
  customer_comment TEXT,
  target_delivery_date DATE,
  replacement_policy TEXT DEFAULT 'call_to_agree',
  replace_rule TEXT DEFAULT 'call',
  delivery_zone TEXT DEFAULT 'zone_1',
  delivery_fee NUMERIC(10, 2) DEFAULT 1.00,
  service_percent NUMERIC(5, 2) DEFAULT 10.00,
  estimated_total NUMERIC(10, 2) DEFAULT 0,
  market_items_total NUMERIC(10, 2) DEFAULT 0,
  actual_market_total NUMERIC(10, 2) DEFAULT 0,
  service_fee NUMERIC(10, 2) DEFAULT 0,
  grand_total NUMERIC(10, 2) DEFAULT 0,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_title TEXT NOT NULL,
  product_name_en TEXT,
  product_name_kh TEXT,
  product_name_ru TEXT,
  product_img_url TEXT,
  product_category TEXT,
  product_form TEXT,
  quantity NUMERIC(10, 2) NOT NULL DEFAULT 1,
  requested_qty NUMERIC(10, 2) DEFAULT 1,
  unit TEXT DEFAULT 'кг',
  customer_comment TEXT,
  estimated_price NUMERIC(10, 2) DEFAULT 0,
  actual_cost NUMERIC(10, 2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  selected_options JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Если таблицы orders и order_items в вашей базе уже были созданы ранее,
-- выполните этот блок безопасных миграций (добавление недостающих полей):
ALTER TABLE orders ADD COLUMN IF NOT EXISTS target_delivery_date DATE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_comment TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_notes TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_zone TEXT DEFAULT 'zone_1';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) DEFAULT 1.00;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS replace_rule TEXT DEFAULT 'call';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS replacement_policy TEXT DEFAULT 'call_to_agree';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS market_items_total NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS actual_market_total NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS service_fee NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS estimated_total NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS grand_total NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name_en TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name_kh TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name_ru TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_img_url TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_category TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_form TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS requested_qty NUMERIC(10, 3) DEFAULT 1;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customer_comment TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS estimated_price NUMERIC(10, 2) DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Триггер автоматической нумерации заказов: FM-YYMMDD-NNN
CREATE OR REPLACE FUNCTION set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'FM-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_order_number ON orders;
CREATE TRIGGER trg_set_order_number
BEFORE INSERT ON orders
FOR EACH ROW EXECUTE FUNCTION set_order_number();

-- ============================================================================
-- 2. ОБНОВЛЕНИЕ ТАБЛИЦЫ ТОВАРОВ (Колонка примерной цены)
-- ============================================================================
ALTER TABLE products ADD COLUMN IF NOT EXISTS price NUMERIC(10, 2) DEFAULT NULL;

-- ============================================================================
-- 3. ВКЛЮЧЕНИЕ ЗАЩИТЫ RLS (ROW LEVEL SECURITY)
-- ============================================================================
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- 2.0. Функция безопасности: проверка прав администратора / закупщика
-- Проверяет доверенные метаданные JWT токена (app_metadata.role), которые клиент не может подделать
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('admin', 'buyer')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, auth, pg_temp;

-- 2.1. Каталог products: Чтение всем, Запись ТОЛЬКО администратору
DROP POLICY IF EXISTS "Allow public read-only access" ON public.products;
DROP POLICY IF EXISTS "Allow all for admin" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated read-only access" ON public.products;
DROP POLICY IF EXISTS "Public read products" ON products;
DROP POLICY IF EXISTS "Admin write products" ON products;

CREATE POLICY "Public read products" ON products
FOR SELECT TO public USING (true);

CREATE POLICY "Admin write products" ON products
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2.2. Заказы orders: Создание ТОЛЬКО через RPC create_order; клиенты видят свои заказы, админ видит и меняет все
-- Прямой INSERT в orders закрыт (Шаг 1б, Аудит v3 §3.3)
DROP POLICY IF EXISTS "Allow individual read access" ON public.orders;
DROP POLICY IF EXISTS "Allow individual insert access" ON public.orders;
DROP POLICY IF EXISTS "Allow admin all access" ON public.orders;
DROP POLICY IF EXISTS "Users can create orders" ON orders;
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Admin full access to orders" ON orders;

CREATE POLICY "Users can view own orders" ON orders
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admin full access to orders" ON orders
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2.3. Позиции order_items: Создание ТОЛЬКО через RPC create_order
-- Прямой INSERT в order_items закрыт (Шаг 1б, Аудит v3 §3.3)
DROP POLICY IF EXISTS "Allow individual read access" ON public.order_items;
DROP POLICY IF EXISTS "Allow individual insert access" ON public.order_items;
DROP POLICY IF EXISTS "Allow admin all access" ON public.order_items;
DROP POLICY IF EXISTS "Users can insert order items" ON order_items;
DROP POLICY IF EXISTS "Users and admin can view order items" ON order_items;
DROP POLICY IF EXISTS "Admin can manage order items" ON order_items;

CREATE POLICY "Users and admin can view order items" ON order_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
      AND (orders.user_id = auth.uid() OR public.is_admin())
  )
);

CREATE POLICY "Admin can manage order items" ON order_items
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2.4. Профили пользователей profiles (Кросс-девайс синхронизация контактов и корзины)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  phone TEXT,
  messenger TEXT DEFAULT 'telegram',
  address TEXT,
  preferred_lang TEXT DEFAULT 'ru',
  onboarding_completed BOOLEAN DEFAULT false,
  shop_layout TEXT DEFAULT 'grid-2',
  default_replacement_policy TEXT DEFAULT 'call_to_agree',
  cart JSONB DEFAULT '{}'::jsonb,
  role TEXT DEFAULT 'customer',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow individual read access" ON public.profiles;
DROP POLICY IF EXISTS "Allow individual update access" ON public.profiles;
DROP POLICY IF EXISTS "Allow individual insert access" ON public.profiles;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Admin full access to profiles" ON public.profiles;
CREATE POLICY "Admin full access to profiles" ON public.profiles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Защита от эскалации привилегий: запрет клиентам изменять собственную роль в profiles
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

-- Автоматический триггер: при входе через Google / Facebook / Email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_assigned_role TEXT;
BEGIN
  v_assigned_role := COALESCE(NEW.raw_app_meta_data->>'role', 'customer');

  INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', ''),
    v_assigned_role
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE WHEN profiles.full_name IS NULL OR profiles.full_name = '' THEN EXCLUDED.full_name ELSE profiles.full_name END,
    avatar_url = CASE WHEN profiles.avatar_url IS NULL OR profiles.avatar_url = '' THEN EXCLUDED.avatar_url ELSE profiles.avatar_url END,
    role = CASE WHEN EXCLUDED.role IS NOT NULL AND EXCLUDED.role <> 'customer' THEN EXCLUDED.role ELSE profiles.role END,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 2.5. ТРАНЗАКЦИОННАЯ RPC-ФУНКЦИЯ ОФОРМЛЕНИЯ ЗАКАЗА (public.create_order)
-- ============================================================================
-- Решает проблему неатомарности (§3.2 Аудита v2, §3.3 Аудита v3, Аудит v4)
-- Включает:
--   1. Идемпотентность: возврат существующего заказа по p_order_id до лимитов
--   2. Серверный Rate Limiting (1 заказ в 2 мин, макс 5 pending)
--   3. Валидацию полей, санитизацию строк и защиту от перезаписи чужих заказов
--   4. Часовой пояс Asia/Phnom_Penh (UTC+7) и расчет зон доставки
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

  -- 1.1. Проверка идемпотентности (повторный вызов для уже созданного заказа)
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

-- Ограничение прав: вызов функции разрешен только авторизованным покупателям
REVOKE ALL ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, DATE, JSONB) TO authenticated;
```

---

### 📦 Вариант Б: Полная инициализация с нуля (Новый проект Supabase)

Если вы настраиваете совершенно новый проект Supabase, используйте скрипт ниже, включающий первоначальное создание `products`:

```sql
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name_ru TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_kh TEXT,
  category TEXT NOT NULL DEFAULT 'other',
  form TEXT DEFAULT 'Целый',
  price NUMERIC(10, 2) DEFAULT NULL,
  unit TEXT DEFAULT '1 кг',
  img_url TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Далее выполните все шаги из Варианта А выше.
```

---

## 3. Подробная настройка Аутентификации (Supabase Auth)

---

### 🔑 3.1. Создание учётной записи Администратора / Закупщика (для входа в `/admin/`)

Вход в служебную панель закупщика не использует публичную регистрацию. Учётная запись администратора создаётся вручную владельцем проекта в консоли Supabase:

1. Откройте панель управления вашим проектом в **[Supabase Dashboard](https://supabase.com/dashboard/project/qifazsptdgcskrchfocc)**.
2. В левом навигационном меню перейдите в раздел **Authentication** → **Users**.
3. Нажмите зелёную кнопку **Add user** в правом верхнем углу и выберите **Create user**.
4. В открывшемся модальном окне заполните:
   * **User Email**: ваш рабочий email администратора.
   * **User Password**: задайте надёжный пароль для входа в панель закупщика.
   * **Auto Confirm User?**: **ОБЯЗАТЕЛЬНО включите эту галочку!**  
     *(Это активирует аккаунт мгновенно, без необходимости переходить по ссылке подтверждения из почты).*
5. Нажмите **Create user**. Пользователь мгновенно появится в списке с бейджем `Confirmed`.
6. Назначение роли `admin` или `buyer` в защищенных метаданных:
   * Самый надежный способ — выполнить разовый SQL-запрос в **SQL Editor** в консоли Supabase:
     ```sql
     -- 🔑 1. Назначение роли администратора в защищенных app_metadata auth.users:
     UPDATE auth.users 
     SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb 
     WHERE email = 'YOUR_ADMIN_EMAIL@DOMAIN.COM';

     -- 🔑 2. Синхронизация роли в публичный профиль:
     UPDATE public.profiles 
     SET role = 'admin' 
     WHERE email = 'YOUR_ADMIN_EMAIL@DOMAIN.COM';
     ```
   * Либо через интерфейс Dashboard: нажмите на созданного пользователя в списке **Authentication** → **Users**, и в блоке **App Metadata** укажите `{"role": "admin"}` (или `{"role": "buyer"}`) и нажмите **Save**.

Теперь вы можете открыть `http://localhost:3030/admin/index.html`, ввести этот Email и Пароль и войти в систему. Токен сессии автоматически сохранится в браузере.

---

### ⚙️ 3.2. Настройка провайдера Email / Password

1. В левом меню Supabase перейдите в **Authentication** → **Providers**.
2. Найдите в списке провайдер **Email** и убедитесь, что тумблер установлен в положение **Enabled**.
3. Рекомендуемые параметры:
   * **Allow new users to sign up**: включено (для покупателей) или выключено (если регистрация клиентов планируется только через соцсети).
   * **Confirm email**: выключите, если не хотите требовать подтверждения почты для обычных покупателей, либо настройте SMTP.

---

### 🌐 3.3. Настройка URL Configuration (Куда возвращать пользователя)

Чтобы OAuth-авторизация и сессии работали корректно как локально, так и в продакшене:

1. Перейдите в **Authentication** → **URL Configuration**.
2. В поле **Site URL** укажите адрес витрины магазина (это дефолтный адрес возврата):
   * Для локальной разработки: `http://localhost:3030/shop.html`
   * Для продакшена: `https://your-domain.com/shop.html`
3. В поле **Redirect URLs (Allow list)** нажмите **Add URL** и добавьте паттерны (это *белый список безопасности*, разрешающий перенаправление):
   * `http://localhost:3030/**`
   * `http://127.0.0.1:3030/**`
   * `https://your-domain.com/**`
   
   > 💡 **Важно:** Паттерн `http://localhost:3030/**` сам по себе никуда не перенаправляет — он лишь сообщает Supabase, что любой адрес на этом порту разрешён. Витрина в коде `shop.js` всегда явно передаёт параметр `redirectTo: window.location.origin + '/shop.html'`, гарантируя возврат покупателя в магазин.
4. Нажмите **Save** внизу страницы.

---

### 📱 3.4. Настройка входа для покупателей (Google & Facebook OAuth)

На клиентской витрине (`shop.html`) покупатели входят в один клик через свои социальные аккаунты.

#### 1. Google OAuth
1. В Supabase перейдите в **Authentication** → **Providers** → **Google** и включите его (**Enabled**).
2. Скопируйте из поля значение **Callback URL (for OAuth)**:
   ```text
   https://qifazsptdgcskrchfocc.supabase.co/auth/v1/callback
   ```
3. Откройте **[Google Cloud Console](https://console.cloud.google.com/)**:
   * Перейдите в **APIs & Services** → **Credentials**.
   * Нажмите **Create Credentials** → **OAuth client ID**.
   * Application type: **Web application**.
   * В поле **Authorized redirect URIs** вставьте скопированный Callback URL.
4. Скопируйте выданные Google **Client ID** и **Client Secret** и вставьте их в настройки провайдера Google в панели Supabase.
5. Нажмите **Save**.

#### 2. Facebook Login
1. В Supabase перейдите в **Authentication** → **Providers** → **Facebook** и включите его (**Enabled**).
2. Скопируйте **Callback URL (for OAuth)**.
3. В **[Meta for Developers](https://developers.facebook.com/)** создайте приложение, добавьте продукт **Facebook Login**.
4. Вставьте Callback URL в поле **Valid OAuth Redirect URIs**.
5. Скопируйте **App ID** и **App Secret** в настройки Supabase и нажмите **Save**.

---

### 🔒 3.5. Управление сессией и смена пароля администратора

* **Выход из системы:** в правом верхнем углу панели закупщика доступна кнопка **«Выйти 🚪»**, сбрасывающая сессию администратора в `sessionStorage`.
* **Смена пароля:** если вы забыли пароль администратора:
  1. Зайдите в **Supabase Dashboard** → **Authentication** → **Users**.
  2. Нажмите на три точки `...` напротив учетной записи администратора.
  3. Выберите **Send password recovery** (письмо на почту) либо удалите и создайте заново с новым паролем через **Create user** с галочкой **Auto confirm**.

---

### 🛡️ 3.6. Архитектура трёхуровневой изоляции сессий и ролевой модели (Admin vs Shop)

Для предотвращения смешивания сессий администратора и покупателей в одном браузере (на общем `Origin`), реализована 3-уровневая система изоляции:

| Уровень | Витрина магазина (`shop.html`) | Панель закупщика (`/admin/`) |
| :--- | :--- | :--- |
| **Ключ Supabase (`storageKey`)** | `freshmarket_customer_auth` | `freshmarket_admin_auth` |
| **Тип браузерного хранилища** | `window.localStorage` (долговечная сессия клиента) | `window.sessionStorage` (изоляция во вкладке, безопасность) |
| **Ролевая проверка (RBAC Gatekeeper)** | Покупатель (OAuth Google/Facebook или гость) | Серверная проверка RBAC: `role === 'admin'` в защищённых `app_metadata` |
| **Защита на уровне базы данных** | RLS (доступ только к своим заказам) | RLS (полный доступ к заказам и редактированию каталога) |

*Преимущества:*
1. В соседних вкладках можно одновременно работать под администратором и тестировать покупку от лица клиента без взаимных разлогинов или перехвата сессий.
2. При закрытии служебной вкладки админки сессия закрывается автоматически, исключая несанкционированный доступ с общего устройства.
3. Попытка входа с учетной записи обычного покупателя в админку пресекается немедленным завершением сессии с сообщением об отказе в доступе.

---

### 🛡️ 3.7. Рекомендации по безопасности Auth и двухфакторной аутентификации (MFA) (Аудит v4 §3.3)

1. **Включение MFA для администратора:**
   * В **Supabase Dashboard** перейдите в **Authentication** → **Multi-Factor Authentication**.
   * Включите **App Authenticator (TOTP)** (Google Authenticator, Apple Passwords или 1Password).
   * Защитите аккаунт закупщика/администратора вторым фактором при входе.
2. **Конфигурация регистрации по Email (Sign-ups):**
   * Если закупщик — единственный оператор системы, в **Authentication** → **Providers** → **Email** рекомендуется отключить **Enable Email Signup** (оставить только вход существующих пользователей) либо включить обязательное подтверждение почты **Confirm email**.
   * Создание учетной записи администратора производить вручную из консоли **Authentication** → **Users** → **Create user** с назначением `app_metadata.role = 'admin'`.

