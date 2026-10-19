-- ============================================================================
-- FreshMarket Migration: 20261017000000_initial_schema.sql
-- Description: Базовая схема таблиц, последовательностей, индексов и триггеров
-- ============================================================================

-- 1. Таблица каталога товаров (products)
CREATE TABLE IF NOT EXISTS public.products (
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

-- Индекс для быстрой фильтрации по категориям
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category);

-- 2. Последовательность и таблица заказов (orders)
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.orders (
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

-- Индексы для заказов
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);

-- Триггер автоматической нумерации заказов: FM-YYMMDD-NNN
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.order_number IS NULL OR NEW.order_number = '' THEN
    NEW.order_number := 'FM-' || to_char(CURRENT_DATE, 'YYMMDD') || '-' || lpad(nextval('order_number_seq')::text, 3, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_order_number ON public.orders;
CREATE TRIGGER trg_set_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_number();

-- 3. Таблица позиций заказа (order_items)
CREATE TABLE IF NOT EXISTS public.order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_title TEXT NOT NULL,
  product_name_en TEXT,
  product_name_kh TEXT,
  product_name_ru TEXT,
  product_img_url TEXT,
  product_category TEXT,
  product_form TEXT,
  quantity NUMERIC(10, 3) NOT NULL DEFAULT 1,
  requested_qty NUMERIC(10, 3) DEFAULT 1,
  unit TEXT DEFAULT 'кг',
  customer_comment TEXT,
  estimated_price NUMERIC(10, 2) DEFAULT 0,
  actual_cost NUMERIC(10, 2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  selected_options JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Индекс для выборки позиций по заказу
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);

-- 4. Таблица профилей пользователей (profiles)
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

-- Триггер автоматического создания профиля при регистрации через Supabase Auth
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
