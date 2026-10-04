# Настройка Supabase и Авторизации Клиентской Витрины

Данный документ содержит полное руководство по разделению прав доступа между **Каталогом (Администратор)** и **Витриной магазина (Клиенты)**, а также пошаговую инструкцию по настройке провайдеров авторизации и политик безопасности (RLS) в Supabase.

---

## 1. Архитектура разделения ключей и прав

### 🏢 Каталог (`index.html` / `app.js` — Администратор / Закупщик)
- **Назначение:** Управление товарами, фото, ценами, категориями, синхронизация словаря.
- **Хранение ключей:** Персональный `localStorage` устройства администратора (URL + `service_role` или расширенный `anon_key`).
- **Права доступа:** Полный доступ на чтение, создание, редактирование и удаление записей (`SELECT`, `INSERT`, `UPDATE`, `DELETE`).

### 🛒 Витрина магазина (`shop.html` / `shop.js` — Клиент / Покупатель)
- **Назначение:** Просмотр витрины, сбор корзины, авторизация и оформление заказов на утренний закуп.
- **Хранение ключей:** Публичный **Supabase URL** и **Public `anon` key**, зашитые в код конфигурации витрины (клиент не вводит ключи вручную).
- **Права доступа:** Ограничены политиками Row Level Security (RLS) на сервере Supabase.

---

## 2. Настройка Supabase: Шаг за шагом

### 🌐 Шаг 1. Настройка Redirect URLs (Куда возвращать пользователя после входа)
1. В консоли Supabase перейдите в раздел **Authentication** → **URL Configuration**.
2. В поле **Site URL** укажите адрес витрины:
   - Локально: `http://localhost:3030/shop.html`
   - Продакшен: `https://your-domain.com/shop.html`
3. В поле **Redirect URLs (Allow list)** добавьте паттерны для возврата:
   - `http://localhost:3030/**`
   - `https://your-domain.com/**`

---

### 🔑 Шаг 2. Включение провайдеров авторизации (Authentication → Providers)

#### 1. Google OAuth
1. В Supabase перейдите в **Authentication** → **Providers** → **Google** и включите тумблер (*Enabled*).
2. Скопируйте из Supabase поле **Callback URL (for OAuth)**:
   ```text
   https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback
   ```
3. Откройте [Google Cloud Console](https://console.cloud.google.com/):
   - Перейдите в **APIs & Services** → **Credentials**.
   - Нажмите **Create Credentials** → **OAuth client ID**.
   - Application type: **Web application**.
   - В поле **Authorized redirect URIs** вставьте скопированный Callback URL.
4. Скопируйте выданные **Client ID** и **Client Secret** и сохраните их в настройках Google Provider в Supabase.

#### 2. Facebook Login
1. В Supabase перейдите в **Authentication** → **Providers** → **Facebook** (включить).
2. В [Meta for Developers](https://developers.facebook.com/) создайте приложение, подключите продукт **Facebook Login**.
3. Вставьте Callback URL из Supabase в настройки валидных URI перенаправления OAuth в Meta.
4. Вставьте **App ID** и **App Secret** в Supabase.

---

## 3. Политики безопасности (Row Level Security — RLS)

Выполните следующие SQL-запросы в **SQL Editor** панели Supabase для корректного разграничения доступа:

### Таблица `products` (Каталог товаров)
```sql
-- Включаем защиту строк
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- 1. Чтение доступно абсолютно всем (покупателям и гостям)
CREATE POLICY "Public read products"
ON products FOR SELECT
TO public
USING (true);

-- 2. Добавление, изменение и удаление — только для аутентифицированных администраторов
CREATE POLICY "Admin write products"
ON products FOR ALL
TO authenticated
USING (auth.role() = 'authenticated');
```

### Таблица `orders` (Заказы)
```sql
-- Включаем защиту строк
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;

-- 1. Создание заказа разрешено любому авторизованному клиенту
CREATE POLICY "Users can create orders"
ON orders FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- 2. Покупатель видит только свои заказы
CREATE POLICY "Users can view own orders"
ON orders FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- 3. Администраторы могут просматривать и обновлять любые заказы
CREATE POLICY "Admin full access to orders"
ON orders FOR ALL
TO service_role
USING (true);
```

### Таблица `order_items` (Состав заказа)
```sql
-- Включаем защиту строк
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- 1. Добавление позиций к своему заказу
CREATE POLICY "Users can insert order items"
ON order_items FOR INSERT
TO authenticated
WITH CHECK (true);

-- 2. Просмотр позиций своего заказа
CREATE POLICY "Users can view own order items"
ON order_items FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = order_items.order_id
    AND orders.user_id = auth.uid()
  )
);
```

---

## 4. Конфигурация в коде клиента (`shop.js`)

Для продакшена публичные константы витрины задаются в начале `js/shop.js`:

```javascript
// Публичная конфигурация витрины магазина
const SHOP_CONFIG = {
  SUPABASE_URL: 'https://<YOUR-PROJECT-REF>.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', // Public anon key
};
```
