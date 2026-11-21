-- ============================================================================
-- FreshMarket Migration: 20261121010000_product_visibility.sql
-- Description: Добавление флага видимости товара на витрине (is_visible)
-- ============================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_products_is_visible
  ON public.products(is_visible);
