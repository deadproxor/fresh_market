-- ============================================================================
-- FreshMarket: Customer Order Cancellation RPC
-- Version: 20261031010000_customer_order_cancellation.sql
-- Description:
--   Безопасная серверная функция public.cancel_order для самостоятельной
--   отмены заказа покупателем до момента начала закупки на утреннем рынке.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.cancel_order(
  p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID;
  v_order_status TEXT;
  v_order_number TEXT;
BEGIN
  -- 1. Верификация аутентификации
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required: user must be signed in to cancel an order';
  END IF;

  -- 2. Проверка существования заказа и принадлежности пользователю (или администратору)
  SELECT status, order_number INTO v_order_status, v_order_number
  FROM public.orders
  WHERE id = p_order_id AND (user_id = v_user_id OR public.is_admin());

  IF v_order_status IS NULL THEN
    RAISE EXCEPTION 'Order not found or access denied';
  END IF;

  -- 3. Проверка статуса: отмена разрешена только на ранних стадиях
  IF v_order_status IN ('completed', 'cancelled', 'rejected') THEN
    RAISE EXCEPTION 'Order is already closed (status: %)', v_order_status;
  END IF;

  IF v_order_status IN ('shopping', 'purchasing', 'delivering') THEN
    RAISE EXCEPTION 'Order is already being shopped or delivered. Please contact support to cancel.';
  END IF;

  -- 4. Перевод статуса в cancelled
  UPDATE public.orders
  SET status = 'cancelled',
      updated_at = now()
  WHERE id = p_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'order_id', p_order_id,
    'order_number', v_order_number,
    'status', 'cancelled'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID) TO authenticated;

