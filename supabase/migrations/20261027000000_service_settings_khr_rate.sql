-- ============================================================================
-- FreshMarket Database Migration
-- Version: 20261027000000_service_settings_khr_rate.sql
-- Description: Создание таблицы service_settings для централизованных настроек сервиса
--              (курс обмена KHR, системные параметры) и синхронизации с покупательской витриной.
-- ============================================================================

-- 1. Таблица настроек сервиса
CREATE TABLE IF NOT EXISTS public.service_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Включаем Row Level Security
ALTER TABLE public.service_settings ENABLE ROW LEVEL SECURITY;

-- 2. Политики RLS
-- 2.1. Публичное чтение для всех (покупатели, витрина, anon и authenticated)
DROP POLICY IF EXISTS "Allow public read on service_settings" ON public.service_settings;
CREATE POLICY "Allow public read on service_settings"
  ON public.service_settings
  FOR SELECT
  TO public
  USING (true);

-- 2.2. Запись и обновление только для администратора/закупщика
DROP POLICY IF EXISTS "Allow admin modify on service_settings" ON public.service_settings;
CREATE POLICY "Allow admin modify on service_settings"
  ON public.service_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 3. Добавление в Realtime публикацию
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'service_settings'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.service_settings;
    END IF;
  END IF;
END $$;

-- 4. Начальное заполнение курса KHR по умолчанию (4000 ៛)
INSERT INTO public.service_settings (key, value, description)
VALUES (
  'khr_rate',
  '{"rate": 4000, "updated_at": "2026-10-27T00:00:00.000Z"}'::jsonb,
  'Официальный/рыночный курс пересчета USD к KHR'
)
ON CONFLICT (key) DO NOTHING;
