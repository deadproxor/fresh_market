-- Migration: Normalize product categories to language-agnostic slug IDs
-- Maps existing Russian category names to canonical slugs defined in js/shared/categories.js

UPDATE public.products SET category = 'vegetables' WHERE category = 'Овощи';
UPDATE public.products SET category = 'roots_tubers' WHERE category = 'Корнеплоды';
UPDATE public.products SET category = 'fruits' WHERE category = 'Фрукты';
UPDATE public.products SET category = 'herbs' WHERE category = 'Зелень и травы';
UPDATE public.products SET category = 'spices_roots' WHERE category = 'Корни и пряности';
UPDATE public.products SET category = 'seafood' WHERE category = 'Морепродукты и рыба';
UPDATE public.products SET category = 'meat' WHERE category = 'Мясо и птица';
UPDATE public.products SET category = 'sauces' WHERE category = 'Соусы и бакалея';
UPDATE public.products SET category = 'mushrooms' WHERE category = 'Грибы';
UPDATE public.products SET category = 'other' WHERE category = 'Другое' OR category IS NULL OR category = '';

-- Normalize order_items product_category for consistency in past order records
UPDATE public.order_items SET product_category = 'vegetables' WHERE product_category = 'Овощи';
UPDATE public.order_items SET product_category = 'roots_tubers' WHERE product_category = 'Корнеплоды';
UPDATE public.order_items SET product_category = 'fruits' WHERE product_category = 'Фрукты';
UPDATE public.order_items SET product_category = 'herbs' WHERE product_category = 'Зелень и травы';
UPDATE public.order_items SET product_category = 'spices_roots' WHERE product_category = 'Корни и пряности';
UPDATE public.order_items SET product_category = 'seafood' WHERE product_category = 'Морепродукты и рыба';
UPDATE public.order_items SET product_category = 'meat' WHERE product_category = 'Мясо и птица';
UPDATE public.order_items SET product_category = 'sauces' WHERE product_category = 'Соусы и бакалея';
UPDATE public.order_items SET product_category = 'mushrooms' WHERE product_category = 'Грибы';
UPDATE public.order_items SET product_category = 'other' WHERE product_category = 'Другое';
