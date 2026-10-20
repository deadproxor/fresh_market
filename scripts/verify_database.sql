-- ============================================================================
-- FreshMarket Diagnostic & Verification Script (Audit v4 §2.2)
-- Usage: Скопируйте и выполните этот скрипт в Supabase SQL Editor
-- Результат: Мгновенная проверка соответствия живой базы данным миграций
-- ============================================================================

-- 1. Проверка наличия и определений функций безопасности
SELECT 
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS function_owner,
  p.prosecdef AS is_security_definer,
  pg_get_function_identity_arguments(p.oid) AS arguments
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('is_admin', 'create_order', 'protect_profile_role', 'set_order_number')
ORDER BY p.proname;

-- 2. Проверка активных RLS-политик на целевых таблицах
-- Ожидается: Только строгие политики (Public read products, Users can view own orders и т.д.)
-- Отсутствуют: Прямые INSERT на orders и order_items, любые Allow all
SELECT 
  tablename, 
  policyname, 
  cmd, 
  roles, 
  qual, 
  with_check
FROM pg_policies 
WHERE schemaname = 'public' 
  AND tablename IN ('products', 'orders', 'order_items', 'profiles')
ORDER BY tablename, cmd, policyname;

-- 3. Проверка триггеров на таблицах profiles и orders
SELECT 
  event_object_table AS target_table,
  trigger_name,
  action_timing,
  event_manipulation AS event,
  action_statement
FROM information_schema.triggers
WHERE trigger_schema = 'public'
  AND event_object_table IN ('profiles', 'orders')
ORDER BY event_object_table, trigger_name;

-- 4. Проверка колонки cart_updated_at в таблице profiles
SELECT 
  column_name, 
  data_type, 
  column_default, 
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'profiles' 
  AND column_name = 'cart_updated_at';

-- 5. Проверка включения таблицы profiles в Realtime публикацию
SELECT 
  pubname, 
  schemaname, 
  tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' 
  AND schemaname = 'public' 
  AND tablename = 'profiles';

-- 6. Проверка прав вызова RPC create_order (REVOKE anon, GRANT authenticated)
SELECT 
  grantee, 
  privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public' 
  AND routine_name = 'create_order'
ORDER BY grantee;
