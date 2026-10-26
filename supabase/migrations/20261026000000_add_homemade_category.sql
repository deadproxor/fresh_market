-- Migration: Add 'homemade' category support and normalize legacy variations
-- Maps 'Домашние продукты', 'Homemade', 'ផលិតផលធ្វើនៅផ្ទះ' to canonical 'homemade' slug

UPDATE public.products
SET category = 'homemade'
WHERE category ILIKE '%домашн%' 
   OR category ILIKE '%homemade%'
   OR category = 'ផលិតផលធ្វើនៅផ្ទះ'
   OR category = 'Produits maison';

UPDATE public.order_items
SET product_category = 'homemade'
WHERE product_category ILIKE '%домашн%' 
   OR product_category ILIKE '%homemade%'
   OR product_category = 'ផលិតផលធ្វើនៅផ្ទះ'
   OR product_category = 'Produits maison';
