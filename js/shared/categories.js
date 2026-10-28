/**
 * FreshMarket — Shared Produce Categories Definition (categories.js)
 * Single Source of Truth for Storefront, Buyer Admin, and Catalog
 */

(function () {
  const CATEGORIES = [
    { id: 'all', name: 'Все', icon: '🧺', img: 'assets/categories/all.png', name_en: 'All' },
    { id: 'vegetables', name: 'Овощи', icon: '🥦', img: 'assets/categories/vegetables.png', name_en: 'Vegetables', name_kh: 'បន្លែ' },
    { id: 'roots_tubers', name: 'Корнеплоды', icon: '🥔', img: 'assets/categories/roots_tubers.png', name_en: 'Roots & Tubers', name_kh: 'មើម' },
    { id: 'fruits', name: 'Фрукты', icon: '🥭', img: 'assets/categories/fruits.png', name_en: 'Fruits', name_kh: 'ផ្លែឈើ' },
    { id: 'herbs', name: 'Зелень и травы', icon: '🌿', img: 'assets/categories/herbs.png', name_en: 'Herbs & Greens', name_kh: 'បន្លែស្លឹក' },
    { id: 'spices_roots', name: 'Корни и пряности', icon: '🫚', img: 'assets/categories/spices_roots.png', name_en: 'Spices & Roots', name_kh: 'គ្រឿងទេស' },
    { id: 'seafood', name: 'Морепродукты и рыба', icon: '🐟', img: 'assets/categories/seafood.png', name_en: 'Seafood & Fish', name_kh: 'គ្រឿងសមុទ្រ' },
    { id: 'meat', name: 'Мясо и птица', icon: '🥩', img: 'assets/categories/meat.png', name_en: 'Meat & Poultry', name_kh: 'សាច់' },
    { id: 'sauces', name: 'Соусы и бакалея', icon: '🥫', img: 'assets/categories/sauces.png', name_en: 'Sauces & Groceries', name_kh: 'ទឹកត្រី និងគ្រឿងទេស' },
    { id: 'legumes_nuts', name: 'Бобовые, орехи и тофу', icon: '🥜', img: 'assets/categories/legumes_nuts.png', name_en: 'Legumes, Nuts & Tofu', name_kh: 'សណ្តែក គ្រាប់ធញ្ញជាតិ និងតៅហ៊ូ' },
    { id: 'grains_noodles', name: 'Крупы, мука и лапша', icon: '🌾', img: 'assets/categories/grains_noodles.png', name_en: 'Grains, Flour & Noodles', name_kh: 'អង្ករ ម្សៅ និងមី' },
    { id: 'dairy_eggs', name: 'Молочные продукты и яйца', icon: '🥚', img: 'assets/categories/dairy_eggs.png', name_en: 'Dairy & Eggs', name_kh: 'ទឹកដោះគោ និងស៊ុត' },
    { id: 'mushrooms', name: 'Грибы', icon: '🍄', img: 'assets/categories/mushrooms.png', name_en: 'Mushrooms', name_kh: 'ផ្សិត' },
    { id: 'homemade', name: 'Домашние продукты', icon: '🍯', img: 'assets/categories/homemade.png', name_en: 'Homemade', name_kh: 'ផលិតផលធ្វើនៅផ្ទះ' },
    { id: 'street_exotic', name: 'Уличная экзотика', icon: '🦗', img: 'assets/categories/street_exotic.png', name_en: 'Street Exotic', name_kh: 'អាហារប្លែកៗតាមផ្លូវ' },
    { id: 'other', name: 'Другое', icon: '📦', img: 'assets/categories/other.png', name_en: 'Other', name_kh: 'ផ្សេងៗ' }
  ];

  if (typeof window !== 'undefined') {
    window.FRESHMARKET_CATEGORIES = CATEGORIES;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CATEGORIES };
  }
})();
