-- ============================================================================
-- FreshMarket Database Migration
-- Version: 20261023010000_protect_profile_role_on_insert.sql
-- Description: Защита колонки profiles.role при INSERT и UPDATE.
--              Предотвращает создание профилей с ролью 'admin' неавторизованными пользователями.
-- ============================================================================

-- 1. Обновление функции защиты роли для покрытия событий INSERT и UPDATE
CREATE OR REPLACE FUNCTION public.protect_profile_role()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Обычный аутентифицированный пользователь не может назначить себе роль администратора
    IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
      NEW.role := 'customer';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    -- При обновлении запрещено изменять роль, если пользователь не администратор
    IF NEW.role IS DISTINCT FROM OLD.role AND NOT public.is_admin() THEN
      NEW.role := OLD.role;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_temp;

-- 2. Пересоздание триггера на события INSERT OR UPDATE
DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_profile_role();

-- 3. Ужесточение RLS-политики вставки профиля (Defense in Depth)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles
FOR INSERT TO authenticated 
WITH CHECK (
  auth.uid() = id 
  AND (role IS NULL OR role = 'customer' OR public.is_admin())
);
