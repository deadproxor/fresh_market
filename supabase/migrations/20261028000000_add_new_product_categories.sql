-- Migration: Add 4 new produce categories ('legumes_nuts', 'grains_noodles', 'dairy_eggs', 'street_exotic')
-- and recategorize existing products in public.products and public.order_items to match products_dictionary.json v1.5.4

-- 1. Normalize localized category names to canonical slugs in public.products
UPDATE public.products
SET category = 'legumes_nuts'
WHERE category IN ('Бобовые, орехи и тофу', 'Legumes, Nuts & Tofu', 'សណ្តែក គ្រាប់ធញ្ញជាតិ និងតៅហ៊ូ', 'Légumineuses, noix & tofu', 'Бобові, горіхи та тофу');

UPDATE public.products
SET category = 'grains_noodles'
WHERE category IN ('Крупы, мука и лапша', 'Grains, Flour & Noodles', 'អង្ករ ម្សៅ និងមី', 'Céréales, farine & nouilles', 'Крупи, борошно та локшина');

UPDATE public.products
SET category = 'dairy_eggs'
WHERE category IN ('Молочные продукты и яйца', 'Dairy & Eggs', 'ទឹកដោះគោ និងស៊ុត', 'Produits laitiers & œufs', 'Молочні продукти та яйця');

UPDATE public.products
SET category = 'street_exotic'
WHERE category IN ('Уличная экзотика', 'Street Exotic', 'អាហារប្លែកៗតាមផ្លូវ', 'Exotique de rue', 'Вулична екзотика');

-- 2. Normalize localized category names to canonical slugs in public.order_items
UPDATE public.order_items
SET product_category = 'legumes_nuts'
WHERE product_category IN ('Бобовые, орехи и тофу', 'Legumes, Nuts & Tofu', 'សណ្តែក គ្រាប់ធញ្ញជាតិ និងតៅហ៊ូ', 'Légumineuses, noix & tofu', 'Бобові, горіхи та тофу');

UPDATE public.order_items
SET product_category = 'grains_noodles'
WHERE product_category IN ('Крупы, мука и лапша', 'Grains, Flour & Noodles', 'អង្ករ ម្សៅ និងមី', 'Céréales, farine & nouilles', 'Крупи, борошно та локшина');

UPDATE public.order_items
SET product_category = 'dairy_eggs'
WHERE product_category IN ('Молочные продукты и яйца', 'Dairy & Eggs', 'ទឹកដោះគោ និងស៊ុត', 'Produits laitiers & œufs', 'Молочні продукти та яйця');

UPDATE public.order_items
SET product_category = 'street_exotic'
WHERE product_category IN ('Уличная экзотика', 'Street Exotic', 'អាហារប្លែកៗតាមផ្លូវ', 'Exotique de rue', 'Вулична екзотика');

-- 3. Recategorize existing products in public.products that moved to new categories in products_dictionary.json v1.5.4
-- legumes_nuts
UPDATE public.products
SET category = 'legumes_nuts'
WHERE name_en ILIKE '%Yardlong Beans%'
   OR name_en ILIKE '%Bean Sprouts%'
   OR name_en ILIKE '%Winged Bean%'
   OR name_en ILIKE '%Tofu%'
   OR name_en ILIKE '%Peanuts%'
   OR name_en ILIKE '%Cashew%'
   OR name_en ILIKE '%Sesame%'
   OR name_en ILIKE '%Malva Nut%'
   OR name_ru ILIKE '%тофу%'
   OR name_ru ILIKE '%фасоль%'
   OR name_ru ILIKE '%ростки сои%'
   OR name_ru ILIKE '%арахис%'
   OR name_ru ILIKE '%кешью%'
   OR name_ru ILIKE '%кунжут%'
   OR name_ru ILIKE '%стеркули%';

-- grains_noodles
UPDATE public.products
SET category = 'grains_noodles'
WHERE name_en ILIKE '%Tapioca Pearls%'
   OR name_en ILIKE '%Jasmine Rice%'
   OR name_en ILIKE '%Rice Noodles%'
   OR name_en ILIKE '%Sticky Rice%'
   OR name_en ILIKE '%Glutinous Rice%'
   OR name_en ILIKE '%Flour%'
   OR name_en ILIKE '%Baguette%'
   OR name_en ILIKE '%Rice Vermicelli%'
   OR name_en ILIKE '%Egg Noodles%'
   OR name_ru ILIKE '%рис жасмин%'
   OR name_ru ILIKE '%рисовая лапша%'
   OR name_ru ILIKE '%рис клейкий%'
   OR name_ru ILIKE '%рисовая вермишель%'
   OR name_ru ILIKE '%лапша жёлтая%'
   OR name_ru ILIKE '%багет%'
   OR name_ru ILIKE '%тапиока (жемчужины)%';

-- dairy_eggs
UPDATE public.products
SET category = 'dairy_eggs'
WHERE name_en IN ('Eggs', 'Quail Eggs', 'Milk', 'Duck Eggs', 'Salted Duck Eggs', 'Condensed Milk', 'Powdered Milk', 'Butter', 'Cheese', 'Yogurt', 'Ice Cream')
   OR name_ru IN ('Яйца куриные / утиные', 'Яйца перепелиные', 'Молоко', 'Яйца утиные', 'Яйца утиные солёные', 'Молоко сгущённое', 'Молоко сухое', 'Масло сливочное', 'Сыр', 'Йогурт', 'Мороженое');

-- street_exotic
UPDATE public.products
SET category = 'street_exotic'
WHERE name_en IN ('Frog', 'Snails', 'Balut / Fertilized Duck Egg', 'Balut', 'Fried Crickets', 'Grasshoppers', 'Red Ant Eggs', 'Snake Meat', 'Fried Tarantula')
   OR name_ru IN ('Лягушка', 'Улитки', 'Балют (утиное яйцо с зародышем)', 'Сверчки жареные', 'Кузнечики', 'Яйца красных муравьёв', 'Мясо змеи', 'Тарантул жареный');

