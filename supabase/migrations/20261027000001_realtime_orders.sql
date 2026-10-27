-- ============================================================================
-- FreshMarket: Realtime Orders Publication Migration
-- Version: 20261027000001_realtime_orders.sql
-- Description:
--   Включает таблицы `public.orders` и `public.order_items` в публикацию
--   `supabase_realtime` для мгновенного получения уведомлений о новых заказах
--   и изменениях статусов закупщиком на утреннем рынке в реальном времени.
-- ============================================================================

-- 1. Устанавливаем REPLICA IDENTITY FULL для полноценной передачи строки при UPDATE/DELETE
ALTER TABLE IF EXISTS public.orders REPLICA IDENTITY FULL;
ALTER TABLE IF EXISTS public.order_items REPLICA IDENTITY FULL;

-- 2. Включаем таблицы в публикацию supabase_realtime
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    -- Orders
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
    END IF;

    -- Order Items
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'order_items'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.order_items;
    END IF;
  END IF;
END $$;
