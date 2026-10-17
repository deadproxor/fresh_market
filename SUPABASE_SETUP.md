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

## 2. SQL Скрипты: Выберите подходящий вариант

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
ALTER TABLE orders ADD COLUMN IF NOT EXISTS market_items_total NUMERIC(10, 2) DEFAULT 0;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name_en TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name_kh TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_name_ru TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_img_url TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_category TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_form TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS requested_qty NUMERIC(10, 2) DEFAULT 1;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customer_comment TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(10, 2) DEFAULT 0;
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
    OR (auth.jwt() ->> 'email') = 'deadproxor@gmail.com'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- 2.1. Каталог products: Чтение всем, Запись ТОЛЬКО администратору
DROP POLICY IF EXISTS "Public read products" ON products;
DROP POLICY IF EXISTS "Admin write products" ON products;

CREATE POLICY "Public read products" ON products
FOR SELECT TO public USING (true);

CREATE POLICY "Admin write products" ON products
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2.2. Заказы orders: Клиенты создают и видят свои, Админ видит и меняет все
DROP POLICY IF EXISTS "Users can create orders" ON orders;
DROP POLICY IF EXISTS "Users can view own orders" ON orders;
DROP POLICY IF EXISTS "Admin full access to orders" ON orders;

CREATE POLICY "Users can create orders" ON orders
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own orders" ON orders
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admin full access to orders" ON orders
FOR ALL TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 2.3. Позиции order_items
DROP POLICY IF EXISTS "Users can insert order items" ON order_items;
DROP POLICY IF EXISTS "Users and admin can view order items" ON order_items;
DROP POLICY IF EXISTS "Admin can manage order items" ON order_items;

CREATE POLICY "Users can insert order items" ON order_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
      AND orders.user_id = auth.uid()
  )
);

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

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Автоматический триггер: при входе через Google / Facebook / Email
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', NEW.raw_user_meta_data->>'picture', '')
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = CASE WHEN profiles.full_name IS NULL OR profiles.full_name = '' THEN EXCLUDED.full_name ELSE profiles.full_name END,
    avatar_url = CASE WHEN profiles.avatar_url IS NULL OR profiles.avatar_url = '' THEN EXCLUDED.avatar_url ELSE profiles.avatar_url END,
    updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================================
-- 2.5. ТРАНЗАКЦИОННАЯ RPC-ФУНКЦИЯ ОФОРМЛЕНИЯ ЗАКАЗА (public.create_order)
-- ============================================================================
-- Решает проблему неатомарности (§3.2 Аудита) и исключает подделку стоимости/статуса
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
  v_target_date DATE;
  v_item RECORD;
  v_result JSONB;
BEGIN
  -- 1. Проверка аутентификации пользователя
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: order creation requires authentication';
  END IF;

  -- 2. Валидация обязательных данных
  IF p_customer_phone IS NULL OR trim(p_customer_phone) = '' THEN
    RAISE EXCEPTION 'Customer phone or messenger contact is required';
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Order must contain at least one item';
  END IF;

  -- 3. Серверная тарификация доставки по зонам (защита от клиентских манипуляций)
  CASE p_delivery_zone
    WHEN 'zone_1' THEN v_delivery_fee := 1.00;
    WHEN 'zone_2' THEN v_delivery_fee := 2.00;
    WHEN 'zone_3' THEN v_delivery_fee := 3.50;
    ELSE v_delivery_fee := 3.50;
  END CASE;

  -- 4. Генерация/присвоение идентификаторов
  v_order_id := COALESCE(p_order_id, gen_random_uuid());
  
  -- Генерация последовательного номера заказа FM-YYMMDD-NNN
  v_order_number := 'FM-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 3, '0');
  v_target_date := COALESCE(p_target_delivery_date, CURRENT_DATE + INTERVAL '1 day');

  -- 5. Вставка шапки заказа (атомарно в транзакции)
  -- Если заказ с таким p_order_id уже был вставлен (повторная синхронизация), обновляем контакты
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
    'pending',
    'pending',
    'cash',
    p_customer_name,
    p_customer_phone,
    COALESCE(p_customer_messenger, 'telegram'),
    p_delivery_address,
    p_customer_comment,
    p_customer_comment,
    v_target_date,
    COALESCE(p_replacement_policy, 'call_to_agree'),
    COALESCE(p_replacement_policy, 'call_to_agree'),
    p_delivery_zone,
    v_delivery_fee,
    10.00,
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
  RETURNING order_number INTO v_order_number;

  -- 6. Вставка всех позиций заказа в той же транзакции
  FOR v_item IN SELECT * FROM jsonb_to_recordset(p_items) AS (
    id UUID,
    product_id UUID,
    product_title TEXT,
    product_name_en TEXT,
    product_name_kh TEXT,
    product_name_ru TEXT,
    product_img_url TEXT,
    product_category TEXT,
    product_form TEXT,
    quantity NUMERIC,
    requested_qty NUMERIC,
    unit TEXT,
    customer_comment TEXT,
    estimated_price NUMERIC
  )
  LOOP
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
      v_item.product_id,
      COALESCE(v_item.product_title, 'Товар'),
      v_item.product_name_en,
      v_item.product_name_kh,
      v_item.product_name_ru,
      v_item.product_img_url,
      v_item.product_category,
      v_item.product_form,
      COALESCE(v_item.requested_qty, v_item.quantity, 1.00),
      COALESCE(v_item.requested_qty, v_item.quantity, 1.00),
      COALESCE(v_item.unit, 'кг'),
      v_item.customer_comment,
      'pending',
      COALESCE(v_item.estimated_price, 0.00),
      0.00,
      now()
    )
    ON CONFLICT (id) DO NOTHING;
  END LOOP;

  -- 7. Формирование возвращаемого JSON-результата
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

-- Выдача прав на вызов функции авторизованным покупателям
GRANT EXECUTE ON FUNCTION public.create_order TO authenticated;
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
     *(⚠️ Важно: этот email должен в точности совпадать с email, указанным в политиках RLS в разделе 2 данного документа).*
   * **User Password**: задайте надёжный пароль для входа в панель закупщика.
   * **Auto Confirm User?**: **ОБЯЗАТЕЛЬНО включите эту галочку!**  
     *(Это активирует аккаунт мгновенно, без необходимости переходить по ссылке подтверждения из почты).*
5. Нажмите **Create user**. Пользователь мгновенно появится в списке с бейджем `Confirmed`.
6. *(Опционально)* Назначение роли `admin` в метаданных:
   * Самый надежный и быстрый способ — выполнить разовый SQL-запрос в **SQL Editor** в консоли Supabase:
     ```sql
     -- 🔑 Назначение роли администратора пользователю:
     UPDATE auth.users 
     SET raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'::jsonb 
     WHERE email = 'deadproxor@gmail.com';
     ```
   * Либо через интерфейс Dashboard: нажмите на созданного пользователя в списке **Authentication** → **Users**, и в блоке **App Metadata** укажите `{"role": "admin"}` и нажмите **Save**.

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
| **Ролевая проверка (RBAC Gatekeeper)** | Покупатель (OAuth Google/Facebook или гость) | Строгая проверка: `role === 'admin' \|\| 'buyer'` или email в доверенном списке (`deadproxor@gmail.com`) |
| **Защита на уровне базы данных** | RLS (доступ только к своим заказам) | RLS (полный доступ к заказам и редактированию каталога) |

*Преимущества:*
1. В соседних вкладках можно одновременно работать под администратором и тестировать покупку от лица клиента без взаимных разлогинов или перехвата сессий.
2. При закрытии служебной вкладки админки сессия закрывается автоматически, исключая несанкционированный доступ с общего устройства.
3. Попытка входа с учетной записи обычного покупателя в админку пресекается немедленным завершением сессии с сообщением об отказе в доступе.

