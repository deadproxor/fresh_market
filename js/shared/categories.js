/**
 * FreshMarket — Shared Produce Categories Definition (categories.js)
 * Single Source of Truth for Storefront, Buyer Admin, and Catalog
 */

(function () {
  const CATEGORIES = [
    { id: 'all', name: 'Все', icon: '🧺', name_en: 'All' },
    { id: 'vegetables', name: 'Овощи', icon: '🥦', name_en: 'Vegetables', name_kh: 'បន្លែ' },
    { id: 'roots_tubers', name: 'Корнеплоды', icon: '🥔', name_en: 'Roots & Tubers', name_kh: 'មើម' },
    { id: 'fruits', name: 'Фрукты', icon: '🥭', name_en: 'Fruits', name_kh: 'ផ្លែឈើ' },
    { id: 'herbs', name: 'Зелень и травы', icon: '🌿', name_en: 'Herbs & Greens', name_kh: 'បន្លែស្លឹក' },
    { id: 'spices_roots', name: 'Корни и пряности', icon: '🫚', name_en: 'Spices & Roots', name_kh: 'គ្រឿងទេស' },
    { id: 'seafood', name: 'Морепродукты и рыба', icon: '🐟', name_en: 'Seafood & Fish', name_kh: 'គ្រឿងសមុទ្រ' },
    { id: 'meat', name: 'Мясо и птица', icon: '🥩', name_en: 'Meat & Poultry', name_kh: 'សាច់' },
    { id: 'sauces', name: 'Соусы и бакалея', icon: '🥫', name_en: 'Sauces & Groceries', name_kh: 'ទឹកត្រី និងគ្រឿងទេស' },
    { id: 'mushrooms', name: 'Грибы', icon: '🍄', name_en: 'Mushrooms', name_kh: 'ផ្សិត' },
    { id: 'other', name: 'Другое', icon: '📦', name_en: 'Other', name_kh: 'ផ្សេងៗ' }
  ];

  if (typeof window !== 'undefined') {
    window.FRESHMARKET_CATEGORIES = CATEGORIES;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CATEGORIES };
  }
})();
