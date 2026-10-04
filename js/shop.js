/**
 * FreshMarket — Client Shop Application (shop.js)
 * Architecture: Vanilla JS + Supabase Client + PWA Ready
 */

const SHOP_VERSION = '1.1.0';
window.SHOP_VERSION = SHOP_VERSION;

// Categories Configuration with Emojis (synced with app.js)
const CATEGORIES = [
  { id: 'all', name: 'Все', icon: '🧺' },
  { id: 'vegetables', name: 'Овощи', icon: '🥦' },
  { id: 'roots_tubers', name: 'Корнеплоды', icon: '🥔' },
  { id: 'fruits', name: 'Фрукты', icon: '🥭' },
  { id: 'herbs', name: 'Зелень и травы', icon: '🌿' },
  { id: 'spices_roots', name: 'Корни и пряности', icon: '🫚' },
  { id: 'seafood', name: 'Морепродукты и рыба', icon: '🐟' },
  { id: 'meat', name: 'Мясо и птица', icon: '🥩' },
  { id: 'sauces', name: 'Соусы и бакалея', icon: '🥫' },
  { id: 'mushrooms', name: 'Грибы', icon: '🍄' },
  { id: 'other', name: 'Другое', icon: '📦' }
];

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function generateOrderNumber() {
  const now = new Date();
  const dateStr = now.toISOString().slice(2, 10).replace(/-/g, '');
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `FM-${dateStr}-${randomSuffix}`;
}

class ShopApp {
  constructor() {
    this.products = [];
    this.selectedCategory = 'all';
    this.searchQuery = '';
    this.activeHomeTab = 'categories';
    this.cart = this.loadCart();
    this.currentTheme = localStorage.getItem('freshmarket_theme') || 'dark';
    this.currentUser = null;
    this.currentSlide = 0;

    this.initSplashScreen();
    this.initSupabase();
    this.initTheme();
    this.initDomElements();
    this.initEventListeners();
    this.initOnboarding();
    this.loadCatalog();
    this.updateCartUi();
    this.initServiceWorker();
  }

  // ------------------------------------------------------------------------
  // Splash Screen Controller
  // ------------------------------------------------------------------------
  initSplashScreen() {
    const splash = document.getElementById('splashScreen');
    const splashVersion = document.getElementById('splashVersion');
    if (splashVersion) splashVersion.textContent = `v${SHOP_VERSION}`;
    if (!splash) return;
    setTimeout(() => {
      splash.classList.add('hide');
    }, 450);
  }

  // ------------------------------------------------------------------------
  // 1. Supabase Initialization
  // ------------------------------------------------------------------------
  initSupabase() {
    const sbUrl = localStorage.getItem('freshmarket_supabase_url');
    const sbKey = localStorage.getItem('freshmarket_supabase_key');
    if (sbUrl && sbKey && window.supabase) {
      try {
        this.sb = window.supabase.createClient(sbUrl, sbKey);
        this.sb.auth.onAuthStateChange((event, session) => {
          this.currentUser = session?.user || null;
          this.updateUserAvatar();
        });
      } catch (err) {
        console.warn('[FreshMarket Shop] Supabase client init error:', err);
      }
    }
  }

  // ------------------------------------------------------------------------
  // 2. Theme Controller
  // ------------------------------------------------------------------------
  initTheme() {
    document.documentElement.setAttribute('data-theme', this.currentTheme);
    localStorage.setItem('freshmarket_theme', this.currentTheme);
    this.updateThemeIcon();
  }

  toggleTheme() {
    this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', this.currentTheme);
    localStorage.setItem('freshmarket_theme', this.currentTheme);
    this.updateThemeIcon();
  }

  updateThemeIcon() {
    const icon = document.getElementById('themeIcon');
    if (icon) {
      icon.textContent = this.currentTheme === 'light' ? '🌙' : '☀️';
    }
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', this.currentTheme === 'light' ? '#f1f5f9' : '#0b1120');
    }
  }

  // ------------------------------------------------------------------------
  // 3. DOM Elements & Navigation
  // ------------------------------------------------------------------------
  initDomElements() {
    // Header & Search
    this.btnThemeToggle = document.getElementById('btnThemeToggle');
    this.btnAuthProfile = document.getElementById('btnAuthProfile');
    this.userAvatarIcon = document.getElementById('userAvatarIcon');
    this.shopSearchInput = document.getElementById('shopSearchInput');
    this.shopSearchClear = document.getElementById('shopSearchClear');
    this.shopHomeTabs = document.getElementById('shopHomeTabs');
    this.tabBtnCategories = document.getElementById('tabBtnCategories');
    this.tabBtnProducts = document.getElementById('tabBtnProducts');
    this.tabViewCategories = document.getElementById('tabViewCategories');
    this.tabViewProducts = document.getElementById('tabViewProducts');
    this.shopCategoriesContainer = document.getElementById('shopCategoriesContainer');
    this.shopCategoryGrid = document.getElementById('shopCategoryGrid');
    this.shopProductsGrid = document.getElementById('shopProductsGrid');
    this.shopProductsCount = document.getElementById('shopProductsCount');

    // Cart Badge in Navigation
    this.navCartBadge = document.getElementById('navCartBadge');

    // Modals
    this.cartModal = document.getElementById('cartModal');
    this.btnCloseCart = document.getElementById('btnCloseCart');
    this.btnCancelCheckout = document.getElementById('btnCancelCheckout');
    this.cartItemsList = document.getElementById('cartItemsList');
    this.checkoutForm = document.getElementById('checkoutForm');
    this.cartAuthGate = document.getElementById('cartAuthGate');
    this.btnCartAuthGate = document.getElementById('btnCartAuthGate');
    this.btnChangeUserProfile = document.getElementById('btnChangeUserProfile');

    this.ordersModal = document.getElementById('ordersModal');
    this.btnCloseOrders = document.getElementById('btnCloseOrders');
    this.ordersModalBody = document.getElementById('ordersModalBody');

    this.authModal = document.getElementById('authModal');
    this.btnCloseAuth = document.getElementById('btnCloseAuth');
    this.authModalBody = document.getElementById('authModalBody');

    // Bottom Navigation
    this.navCatalog = document.getElementById('navCatalog');
    this.navCart = document.getElementById('navCart');
    this.navOrders = document.getElementById('navOrders');
    this.navProfile = document.getElementById('navProfile');

    // Onboarding
    this.onboardingOverlay = document.getElementById('onboardingOverlay');
    this.onboardingSlider = document.getElementById('onboardingSlider');
    this.btnSkipOnboarding = document.getElementById('btnSkipOnboarding');
    this.btnNextOnboarding = document.getElementById('btnNextOnboarding');
    this.chkDontShowOnboarding = document.getElementById('chkDontShowOnboarding');
  }

  // ------------------------------------------------------------------------
  // 4. Event Listeners
  // ------------------------------------------------------------------------
  initEventListeners() {
    // Theme
    if (this.btnThemeToggle) {
      this.btnThemeToggle.addEventListener('click', () => this.toggleTheme());
    }

    // Profile & Auth
    if (this.btnAuthProfile) {
      this.btnAuthProfile.addEventListener('click', () => this.openAuthModal());
    }

    // Search
    if (this.shopSearchInput) {
      this.shopSearchInput.addEventListener('input', (e) => {
        this.searchQuery = e.target.value.trim().toLowerCase();
        if (this.shopSearchClear) {
          this.shopSearchClear.style.display = this.searchQuery ? 'flex' : 'none';
        }
        if (this.searchQuery) {
          this.setHomeTab('products');
        }
        this.renderProducts();
      });
    }

    if (this.shopSearchClear) {
      this.shopSearchClear.addEventListener('click', () => {
        if (this.shopSearchInput) {
          this.shopSearchInput.value = '';
          this.searchQuery = '';
          this.shopSearchClear.style.display = 'none';
          this.shopSearchInput.focus();
          this.renderProducts();
        }
      });
    }

    // Cart Modal
    if (this.btnCloseCart) {
      this.btnCloseCart.addEventListener('click', () => this.closeCartModal());
    }
    if (this.btnCancelCheckout) {
      this.btnCancelCheckout.addEventListener('click', () => this.closeCartModal());
    }
    if (this.btnCartAuthGate) {
      this.btnCartAuthGate.addEventListener('click', () => {
        this.closeCartModal();
        this.openAuthModal();
      });
    }
    if (this.btnChangeUserProfile) {
      this.btnChangeUserProfile.addEventListener('click', () => {
        this.closeCartModal();
        this.openAuthModal();
      });
    }
    if (this.cartModal) {
      this.cartModal.addEventListener('click', (e) => {
        if (e.target === this.cartModal) this.closeCartModal();
      });
    }

    // Orders Modal
    if (this.btnCloseOrders) {
      this.btnCloseOrders.addEventListener('click', () => this.closeOrdersModal());
    }
    if (this.ordersModal) {
      this.ordersModal.addEventListener('click', (e) => {
        if (e.target === this.ordersModal) this.closeOrdersModal();
      });
    }

    // Auth Modal
    if (this.btnCloseAuth) {
      this.btnCloseAuth.addEventListener('click', () => this.closeAuthModal());
    }
    if (this.authModal) {
      this.authModal.addEventListener('click', (e) => {
        if (e.target === this.authModal) this.closeAuthModal();
      });
    }

    // Checkout Form
    if (this.checkoutForm) {
      this.checkoutForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleCheckoutSubmit();
      });
    }

    // Home Screen Segmented Tabs
    if (this.tabBtnCategories) {
      this.tabBtnCategories.addEventListener('click', () => this.setHomeTab('categories'));
    }
    if (this.tabBtnProducts) {
      this.tabBtnProducts.addEventListener('click', () => this.setHomeTab('products'));
    }

    // Bottom Navigation
    if (this.navCatalog) {
      this.navCatalog.addEventListener('click', () => {
        this.setActiveNav('navCatalog');
        this.setHomeTab('categories');
        this.selectedCategory = 'all';
        this.renderCategories();
        this.renderProducts();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
    if (this.navCart) {
      this.navCart.addEventListener('click', () => {
        this.openCartModal();
      });
    }
    if (this.navOrders) {
      this.navOrders.addEventListener('click', () => {
        this.openOrdersModal();
      });
    }
    if (this.navProfile) {
      this.navProfile.addEventListener('click', () => {
        this.openAuthModal();
      });
    }

    // Online/Offline status
    window.addEventListener('online', () => {
      this.showToast('🟢 Соединение восстановлено');
      this.loadCatalog();
    });

    window.addEventListener('offline', () => {
      this.showToast('📶 Офлайн-режим: каталог доступен из кэша');
    });
  }

  setActiveNav(id) {
    [this.navCatalog, this.navCart, this.navOrders, this.navProfile].forEach((el) => {
      if (el) el.classList.remove('active');
    });
    const target = document.getElementById(id);
    if (target) target.classList.add('active');
  }

  setHomeTab(tabName) {
    this.activeHomeTab = tabName;
    if (this.tabBtnCategories) {
      this.tabBtnCategories.classList.toggle('active', tabName === 'categories');
    }
    if (this.tabBtnProducts) {
      this.tabBtnProducts.classList.toggle('active', tabName === 'products');
    }
    if (this.tabViewCategories) {
      this.tabViewCategories.style.display = tabName === 'categories' ? 'block' : 'none';
    }
    if (this.tabViewProducts) {
      this.tabViewProducts.style.display = tabName === 'products' ? 'block' : 'none';
    }
  }

  // ------------------------------------------------------------------------
  // 5. Onboarding Carousel Controller
  // ------------------------------------------------------------------------
  initOnboarding() {
    const hideOnboarding = localStorage.getItem('freshmarket_hide_onboarding') === 'true';
    if (!hideOnboarding && this.onboardingOverlay) {
      this.openOnboarding();
    }

    if (this.btnSkipOnboarding) {
      this.btnSkipOnboarding.addEventListener('click', () => this.finishOnboarding());
    }

    if (this.btnNextOnboarding) {
      this.btnNextOnboarding.addEventListener('click', () => {
        if (this.currentSlide < 2) {
          this.setSlide(this.currentSlide + 1);
        } else {
          this.finishOnboarding();
        }
      });
    }

    // Allow clicking dots to navigate
    const dots = document.querySelectorAll('.onboarding-dots .dot');
    dots.forEach((dot, index) => {
      dot.addEventListener('click', () => this.setSlide(index));
      dot.style.cursor = 'pointer';
    });
  }

  openOnboarding() {
    this.setSlide(0);
    if (this.chkDontShowOnboarding) {
      this.chkDontShowOnboarding.checked = false;
    }
    if (this.onboardingOverlay) {
      this.onboardingOverlay.style.display = 'flex';
    }
  }

  setSlide(index) {
    this.currentSlide = index;
    const slides = document.querySelectorAll('.onboarding-slide');
    const dots = document.querySelectorAll('.onboarding-dots .dot');

    slides.forEach((s, i) => s.classList.toggle('active', i === index));
    dots.forEach((d, i) => d.classList.toggle('active', i === index));

    if (this.btnNextOnboarding) {
      this.btnNextOnboarding.textContent = index === 2 ? 'Начать покупки 🎉' : 'Далее →';
    }
  }

  finishOnboarding() {
    if (this.chkDontShowOnboarding && this.chkDontShowOnboarding.checked) {
      localStorage.setItem('freshmarket_hide_onboarding', 'true');
    }
    if (this.onboardingOverlay) {
      this.onboardingOverlay.style.display = 'none';
    }
  }

  // ------------------------------------------------------------------------
  // 6. Catalog Loading & Rendering
  // ------------------------------------------------------------------------
  async loadCatalog() {
    this.renderCategories();
    this.showLoadingState();

    // 1. Try Supabase if online and initialized
    if (navigator.onLine && this.sb) {
      try {
        const { data, error } = await this.sb
          .from('products')
          .select('*')
          .order('category', { ascending: true });

        if (!error && data && data.length > 0) {
          this.products = data;
          try {
            localStorage.setItem('freshmarket_products', JSON.stringify(data));
          } catch (_) {}
          this.renderProducts();
          this.renderCategories();
          return;
        }
      } catch (err) {
        console.warn('[FreshMarket Shop] Supabase fetch error, fallback to local cache:', err.message || err);
      }
    }

    // 2. Fallback: localStorage cache
    try {
      const localData = localStorage.getItem('freshmarket_products');
      if (localData) {
        this.products = JSON.parse(localData);
        this.renderProducts();
        this.renderCategories();
        return;
      }
    } catch (err) {
      console.warn('[FreshMarket Shop] localStorage parse failed:', err);
    }

    // 3. Fallback: products_dictionary.json
    try {
      let res = await fetch('./data/products_dictionary.json');
      if (!res.ok) {
        res = await fetch('./products_dictionary.json');
      }
      if (res.ok) {
        this.products = await res.json();
        this.renderProducts();
        this.renderCategories();
      }
    } catch (err) {
      console.error('[FreshMarket Shop] Error loading fallback products dictionary:', err);
      this.showToast('Каталог загружен в автономном режиме');
    }
  }

  showLoadingState() {
    if (this.shopProductsGrid) {
      this.shopProductsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🥬</div>
          <div class="empty-title">Загрузка свежих продуктов...</div>
          <div class="empty-desc">Связываемся с базой утреннего рынка</div>
        </div>
      `;
    }
  }

  renderCategories() {
    if (!this.shopCategoriesContainer) return;

    // Calculate count per category
    const counts = {};
    CATEGORIES.forEach((cat) => {
      if (cat.id === 'all') {
        counts[cat.id] = this.products.length;
      } else {
        counts[cat.id] = this.products.filter(
          (p) => p.category === cat.name || p.category === cat.id
        ).length;
      }
    });

    this.shopCategoriesContainer.innerHTML = CATEGORIES.map((cat) => {
      const count = counts[cat.id] || 0;
      const isActive = this.selectedCategory === cat.id ? 'active' : '';
      return `
        <button type="button" class="filter-pill ${isActive}" data-category="${cat.id}">
          <span class="category-icon">${cat.icon}</span>
          <span class="category-name">${cat.name}</span>
          <span class="category-count" style="opacity: 0.75; margin-left: 4px; font-size: 11px;">${count}</span>
        </button>
      `;
    }).join('');

    this.shopCategoriesContainer.querySelectorAll('.filter-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.selectedCategory = btn.dataset.category;
        this.renderCategories();
        this.renderProducts();
      });
    });

    // Render Category Cards Grid on Home Screen
    if (this.shopCategoryGrid) {
      const mainCategories = CATEGORIES.filter((c) => c.id !== 'all');
      this.shopCategoryGrid.innerHTML = mainCategories.map((cat) => {
        const count = counts[cat.id] || 0;
        const isActive = this.selectedCategory === cat.id ? 'active' : '';
        return `
          <div class="category-card ${isActive}" data-category="${cat.id}">
            <div class="cat-card-left">
              <span class="cat-card-icon">${cat.icon}</span>
              <span class="cat-card-name">${cat.name}</span>
            </div>
            <span class="cat-card-count">${count}</span>
          </div>
        `;
      }).join('');

      this.shopCategoryGrid.querySelectorAll('.category-card').forEach((card) => {
        card.addEventListener('click', () => {
          const catId = card.dataset.category;
          this.selectedCategory = catId;
          this.setHomeTab('products');
          this.renderCategories();
          this.renderProducts();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        });
      });
    }
  }

  renderProducts() {
    if (!this.shopProductsGrid) return;

    let filtered = this.products;

    // Filter by Category
    if (this.selectedCategory !== 'all') {
      const selectedCatObj = CATEGORIES.find((c) => c.id === this.selectedCategory);
      filtered = filtered.filter((p) => {
        if (selectedCatObj) {
          return p.category === selectedCatObj.name || p.category === selectedCatObj.id;
        }
        return p.category === this.selectedCategory;
      });
    }

    // Filter by Search Query (EN, KH, RU)
    if (this.searchQuery) {
      filtered = filtered.filter((p) => {
        const en = (p.name_en || '').toLowerCase();
        const kh = (p.name_kh || '').toLowerCase();
        const ru = (p.name_ru || '').toLowerCase();
        const cat = (p.category || '').toLowerCase();
        return en.includes(this.searchQuery) ||
          kh.includes(this.searchQuery) ||
          ru.includes(this.searchQuery) ||
          cat.includes(this.searchQuery);
      });
    }

    // Update Counter
    if (this.shopProductsCount) {
      this.shopProductsCount.textContent = `Найдено продуктов: ${filtered.length}`;
    }

    if (filtered.length === 0) {
      this.shopProductsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">Продукты не найдены</div>
          <div class="empty-desc">Попробуйте изменить категорию или поисковый запрос</div>
        </div>
      `;
      return;
    }

    this.shopProductsGrid.innerHTML = filtered.map((item) => {
      const cartItem = this.cart[item.id];
      const inCart = !!cartItem;
      const qtyText = cartItem ? cartItem.qty : '';
      const catObj = CATEGORIES.find((c) => c.name === item.category || c.id === item.category);
      const catIcon = catObj ? catObj.icon : '📦';

      return `
        <div class="product-card shop-product-card" data-id="${item.id}">
          <div class="card-names-block">
            <!-- Header with prominent EN Name and Minimalist Collapse Arrow -->
            <div class="card-header-row">
              <div class="card-name-en">${this.escapeHtml(item.name_en)}</div>
              <button type="button" class="btn-card-toggle" title="Свернуть / Развернуть" aria-label="Свернуть / Развернуть">
                <svg class="toggle-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>

            ${item.name_kh ? `<div class="card-name-kh khmer-font">${this.escapeHtml(item.name_kh)}</div>` : ''}
            <div class="card-name-ru">${this.escapeHtml(item.name_ru)}</div>
          </div>

          <div class="card-collapsible-body">
            <!-- Badges (Category & Form) -->
            <div class="card-badges">
              <span class="badge badge-category">${catIcon} ${this.escapeHtml(item.category || 'Продукт')}</span>
              ${item.form ? `<span class="badge badge-form">${this.escapeHtml(item.form)}</span>` : ''}
            </div>

            ${item.img_url ? `
              <div class="card-photo-container">
                <img src="${item.img_url}" class="card-photo-full" alt="${this.escapeHtml(item.name_en)}" loading="lazy" />
              </div>
            ` : ''}

            ${item.description ? `<div class="card-desc">${this.escapeHtml(item.description)}</div>` : ''}

            <!-- Add to Cart / Quantity Selector -->
            <div class="shop-card-actions">
              ${inCart ? `
                <div class="cart-qty-control">
                  <button type="button" class="btn-qty-minus" data-id="${item.id}">−</button>
                  <span class="qty-number">${this.escapeHtml(qtyText)}</span>
                  <button type="button" class="btn-qty-plus" data-id="${item.id}">+</button>
                </div>
              ` : `
                <button type="button" class="btn btn-primary btn-add-cart" data-id="${item.id}">
                  + В заказ
                </button>
              `}
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Toggle card collapse / expand
    this.shopProductsGrid.querySelectorAll('.product-card').forEach((card) => {
      const namesBlock = card.querySelector('.card-names-block');
      const toggleBtn = card.querySelector('.btn-card-toggle');

      if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          card.classList.toggle('is-collapsed');
        });
      }

      if (namesBlock) {
        namesBlock.addEventListener('click', (e) => {
          if (e.target.closest('.btn-card-toggle')) return;
          card.classList.toggle('is-collapsed');
        });
      }
    });

    // Attach Add to Cart & Qty buttons
    this.shopProductsGrid.querySelectorAll('.btn-add-cart').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        this.addToCart(id);
      });
    });

    this.shopProductsGrid.querySelectorAll('.btn-qty-plus').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        this.increaseQty(id);
      });
    });

    this.shopProductsGrid.querySelectorAll('.btn-qty-minus').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        this.decreaseQty(id);
      });
    });
  }

  // ------------------------------------------------------------------------
  // 7. Cart State Management
  // ------------------------------------------------------------------------
  loadCart() {
    try {
      const saved = localStorage.getItem('freshmarket_cart');
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  }

  saveCart() {
    localStorage.setItem('freshmarket_cart', JSON.stringify(this.cart));
    this.updateCartUi();
  }

  addToCart(productId) {
    const product = this.products.find((p) => p.id === productId);
    if (!product) return;

    // Default quantity format
    const defaultQty = product.form && product.form.toLowerCase().includes('пучок') ? '1 пучок' : '1 кг';

    this.cart[productId] = {
      product: product,
      qty: defaultQty
    };

    this.saveCart();
    this.renderProducts();
    this.showToast(`Добавлено: ${product.name_en}`);
  }

  increaseQty(productId) {
    if (!this.cart[productId]) return;
    const current = this.cart[productId].qty;
    // Simple incremental heuristic
    const match = current.match(/^([\d.]+)\s*(.*)$/);
    if (match) {
      const val = parseFloat(match[1]) + 1;
      const unit = match[2] || 'кг';
      this.cart[productId].qty = `${val} ${unit}`;
    } else {
      this.cart[productId].qty = '2 кг';
    }
    this.saveCart();
    this.renderProducts();
    this.renderCartModalList();
  }

  decreaseQty(productId) {
    if (!this.cart[productId]) return;
    const current = this.cart[productId].qty;
    const match = current.match(/^([\d.]+)\s*(.*)$/);
    if (match) {
      const val = parseFloat(match[1]) - 1;
      const unit = match[2] || 'кг';
      if (val <= 0) {
        delete this.cart[productId];
      } else {
        this.cart[productId].qty = `${val} ${unit}`;
      }
    } else {
      delete this.cart[productId];
    }
    this.saveCart();
    this.renderProducts();
    this.renderCartModalList();
  }

  removeFromCart(productId) {
    delete this.cart[productId];
    this.saveCart();
    this.renderProducts();
    this.renderCartModalList();
  }

  updateCartUi() {
    const items = Object.values(this.cart);
    const count = items.length;

    // Update Bottom Nav Badge Indicator
    if (this.navCartBadge) {
      if (count > 0) {
        this.navCartBadge.textContent = count;
        this.navCartBadge.style.display = 'inline-flex';
      } else {
        this.navCartBadge.style.display = 'none';
      }
    }
  }

  // ------------------------------------------------------------------------
  // 8. Cart & Checkout Modal
  // ------------------------------------------------------------------------
  openCartModal() {
    this.renderCartModalList();
    this.prefillCheckoutData();
    if (this.cartModal) {
      this.cartModal.style.display = 'flex';
    }
  }

  closeCartModal() {
    if (this.cartModal) {
      this.cartModal.style.display = 'none';
    }
  }

  isUserAuthenticated() {
    if (this.currentUser) return true;
    const guestName = localStorage.getItem('freshmarket_customer_name');
    const guestPhone = localStorage.getItem('freshmarket_customer_phone');
    return Boolean(guestName && guestPhone);
  }

  getCurrentCustomerInfo() {
    let name = 'Покупатель';
    let phone = '';
    let address = localStorage.getItem('freshmarket_customer_address') || '';

    if (this.currentUser) {
      name = this.currentUser.user_metadata?.full_name || this.currentUser.email || 'Покупатель';
      phone = localStorage.getItem('freshmarket_customer_phone') || this.currentUser.phone || this.currentUser.email || '';
    } else {
      name = localStorage.getItem('freshmarket_customer_name') || 'Покупатель';
      phone = localStorage.getItem('freshmarket_customer_phone') || '';
    }
    return { name, phone, address };
  }

  renderCartModalList() {
    if (!this.cartItemsList) return;
    const items = Object.values(this.cart);

    if (items.length === 0) {
      this.cartItemsList.innerHTML = `
        <div class="empty-state" style="padding: 20px 0;">
          <div class="empty-icon">🛒</div>
          <div class="empty-title">Корзина пуста</div>
          <div class="empty-desc">Выберите свежие продукты на витрине</div>
        </div>
      `;
      if (this.checkoutForm) this.checkoutForm.style.display = 'none';
      if (this.cartAuthGate) this.cartAuthGate.style.display = 'none';
      return;
    }

    const isAuth = this.isUserAuthenticated();
    if (!isAuth) {
      if (this.checkoutForm) this.checkoutForm.style.display = 'none';
      if (this.cartAuthGate) this.cartAuthGate.style.display = 'flex';
    } else {
      if (this.cartAuthGate) this.cartAuthGate.style.display = 'none';
      if (this.checkoutForm) this.checkoutForm.style.display = 'block';
      this.prefillCheckoutData();
    }

    this.cartItemsList.innerHTML = items.map(({ product, qty }) => `
      <div class="cart-item-row" data-id="${product.id}">
        <div class="cart-item-info">
          <div class="cart-item-name">${this.escapeHtml(product.name_en)}</div>
          <div class="cart-item-kh khmer-font">${this.escapeHtml(product.name_kh || '')}</div>
        </div>
        <div class="cart-item-qty-input-wrap">
          <input type="text" class="cart-item-qty-input" value="${this.escapeHtml(qty)}" data-id="${product.id}" placeholder="1 кг / 3 шт" />
        </div>
        <button type="button" class="cart-item-remove-btn" data-id="${product.id}" title="Удалить">✕</button>
      </div>
    `).join('');

    // Quantity manual change & remove listeners
    this.cartItemsList.querySelectorAll('.cart-item-qty-input').forEach((input) => {
      input.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        if (this.cart[id]) {
          this.cart[id].qty = e.target.value.trim() || '1 шт';
          this.saveCart();
        }
      });
    });

    this.cartItemsList.querySelectorAll('.cart-item-remove-btn').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = e.target.dataset.id;
        this.removeFromCart(id);
      });
    });
  }

  prefillCheckoutData() {
    const { name, phone, address } = this.getCurrentCustomerInfo();

    const nameBadge = document.getElementById('checkoutUserName');
    const phoneBadge = document.getElementById('checkoutUserPhone');
    const addressInput = document.getElementById('deliveryAddress');

    if (nameBadge) nameBadge.textContent = name;
    if (phoneBadge) phoneBadge.textContent = phone ? `📞 ${phone}` : 'Контакты сохранены';
    if (addressInput && !addressInput.value) addressInput.value = address;
  }

  // ------------------------------------------------------------------------
  // 9. Checkout Submission
  // ------------------------------------------------------------------------
  async handleCheckoutSubmit() {
    if (!this.isUserAuthenticated()) {
      this.showToast('⚠️ Войдите в профиль для оформления заказа');
      this.openAuthModal();
      return;
    }

    const addressInput = document.getElementById('deliveryAddress');
    const commentInput = document.getElementById('customerComment');
    const replacementRadio = document.querySelector('input[name="replacementPolicy"]:checked');

    const deliveryAddress = addressInput?.value.trim();
    const customerComment = commentInput?.value.trim() || '';
    const replacementPolicy = replacementRadio?.value || 'call_to_agree';

    if (!deliveryAddress) {
      this.showToast('⚠️ Пожалуйста, укажите адрес или ориентир доставки');
      if (addressInput) addressInput.focus();
      return;
    }

    const items = Object.values(this.cart);
    if (items.length === 0) {
      this.showToast('⚠️ Корзина пуста');
      return;
    }

    const { name: customerName, phone: customerPhone } = this.getCurrentCustomerInfo();

    // Save profile address locally
    localStorage.setItem('freshmarket_customer_address', deliveryAddress);

    const orderNumber = generateOrderNumber();
    const orderId = generateUUID();

    // Target delivery date: Tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const targetDate = tomorrow.toISOString().slice(0, 10);

    const orderPayload = {
      id: orderId,
      order_number: orderNumber,
      user_id: this.currentUser?.id || null,
      customer_name: customerName,
      customer_phone: customerPhone,
      delivery_address: deliveryAddress,
      customer_comment: customerComment,
      target_delivery_date: targetDate,
      replacement_policy: replacementPolicy,
      status: 'new',
      payment_status: 'pending',
      payment_method: 'cash',
      market_items_total: 0.00,
      service_fee: 3.00,
      delivery_fee: 1.50,
      grand_total: 4.50,
      created_at: new Date().toISOString()
    };

    const orderItemsPayload = items.map(({ product, qty }) => ({
      id: generateUUID(),
      order_id: orderId,
      product_id: product.id,
      product_name_en: product.name_en,
      product_name_kh: product.name_kh || '',
      product_name_ru: product.name_ru || '',
      product_img_url: product.img_url || '',
      product_category: product.category || '',
      product_form: product.form || '',
      requested_qty: qty,
      status: 'pending',
      actual_cost: 0.00,
      created_at: new Date().toISOString()
    }));

    try {
      // 1. Send to Supabase if connected
      if (this.sb) {
        const { error: orderErr } = await this.sb.from('orders').insert([orderPayload]);
        if (orderErr) throw orderErr;

        const { error: itemsErr } = await this.sb.from('order_items').insert(orderItemsPayload);
        if (itemsErr) throw itemsErr;
      }

      // 2. Save locally in client history
      this.saveOrderLocally({
        ...orderPayload,
        items: orderItemsPayload
      });

      // Clear cart
      this.cart = {};
      this.saveCart();
      this.renderProducts();
      this.closeCartModal();

      this.showToast(`🎉 Заказ ${orderNumber} успешно оформлен на утренний закуп!`);
      this.openOrdersModal();
    } catch (err) {
      console.error('[FreshMarket Shop] Checkout error:', err);
      // Fallback: save locally even if offline
      this.saveOrderLocally({
        ...orderPayload,
        items: orderItemsPayload
      });
      this.cart = {};
      this.saveCart();
      this.renderProducts();
      this.closeCartModal();
      this.showToast(`Заказ сохранен: ${orderNumber}`);
      this.openOrdersModal();
    }
  }

  saveOrderLocally(order) {
    try {
      const saved = JSON.parse(localStorage.getItem('freshmarket_my_orders') || '[]');
      saved.unshift(order);
      localStorage.setItem('freshmarket_my_orders', JSON.stringify(saved.slice(0, 30)));
    } catch (err) {
      console.warn('Local order save error:', err);
    }
  }

  // ------------------------------------------------------------------------
  // 10. Orders History Modal
  // ------------------------------------------------------------------------
  async openOrdersModal() {
    this.setActiveNav('navOrders');
    if (!this.ordersModalBody) return;

    this.ordersModalBody.innerHTML = `
      <div class="empty-state" style="padding: 20px 0;">
        <div class="empty-icon">⏳</div>
        <div class="empty-title">Загрузка заказов...</div>
      </div>
    `;

    if (this.ordersModal) this.ordersModal.style.display = 'flex';

    let orders = [];

    // Try fetch from Supabase
    if (this.sb) {
      try {
        let query = this.sb
          .from('orders')
          .select('*, order_items(*)')
          .order('created_at', { ascending: false });

        if (this.currentUser) {
          query = query.eq('user_id', this.currentUser.id);
        } else {
          const phone = localStorage.getItem('freshmarket_customer_phone');
          if (phone) query = query.eq('customer_phone', phone);
        }

        const { data, error } = await query;
        if (!error && data && data.length > 0) {
          orders = data.map((o) => ({
            ...o,
            items: o.order_items || []
          }));
        }
      } catch (err) {
        console.warn('Supabase fetch orders error:', err);
      }
    }

    // Fallback to local storage history
    if (orders.length === 0) {
      orders = JSON.parse(localStorage.getItem('freshmarket_my_orders') || '[]');
    }

    this.renderOrdersList(orders);
  }

  closeOrdersModal() {
    if (this.ordersModal) this.ordersModal.style.display = 'none';
    this.setActiveNav('navCatalog');
  }

  renderOrdersList(orders) {
    if (!this.ordersModalBody) return;

    if (!orders || orders.length === 0) {
      this.ordersModalBody.innerHTML = `
        <div class="empty-state" style="padding: 30px 0;">
          <div class="empty-icon">📦</div>
          <div class="empty-title">У вас пока нет заказов</div>
          <div class="empty-desc">Соберите корзину на утренний закуп продуктов</div>
        </div>
      `;
      return;
    }

    const statusMap = {
      new: { label: '🌅 Принят на утренний закуп', class: 'status-new' },
      purchasing: { label: '🥬 Закупается на рынке (05:00)', class: 'status-purchasing' },
      delivering: { label: '🛵 Передан курьеру', class: 'status-delivering' },
      completed: { label: '✅ Доставлен и оплачен', class: 'status-completed' },
      cancelled: { label: '❌ Отменен', class: 'status-cancelled' }
    };

    this.ordersModalBody.innerHTML = orders.map((order) => {
      const st = statusMap[order.status] || { label: order.status, class: '' };
      const items = order.items || [];
      const dateStr = new Date(order.created_at).toLocaleDateString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit'
      });

      return `
        <div class="order-card">
          <div class="order-card-header">
            <div>
              <div class="order-card-number">${this.escapeHtml(order.order_number)}</div>
              <div class="order-card-date">${dateStr} • Доставка: ${order.target_delivery_date || 'Завтра'}</div>
            </div>
            <span class="order-status-pill ${st.class}">${st.label}</span>
          </div>

          <!-- Items preview -->
          <div class="order-card-items">
            ${items.map((item) => `
              <div class="order-item-mini">
                <span class="order-item-mini-name">${this.escapeHtml(item.product_name_en)} (${this.escapeHtml(item.requested_qty)})</span>
                ${item.receipt_url ? `
                  <a href="${item.receipt_url}" target="_blank" class="receipt-link" title="Посмотреть QR-чек">🧾 Чек</a>
                ` : ''}
              </div>
            `).join('')}
          </div>

          <!-- Totals Calculation -->
          <div class="order-card-footer">
            <div class="order-calc-breakdown">
              <div>Рынок: <b>$${Number(order.market_items_total || 0).toFixed(2)}</b></div>
              <div>Услуга + Доставка: <b>$${(Number(order.service_fee || 3) + Number(order.delivery_fee || 1.5)).toFixed(2)}</b></div>
            </div>
            <div class="order-grand-total">
              Итого: <b>$${Number(order.grand_total || (Number(order.market_items_total || 0) + 4.5)).toFixed(2)}</b>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ------------------------------------------------------------------------
  // 11. Auth & Profile Modal
  // ------------------------------------------------------------------------
  openAuthModal() {
    this.setActiveNav('navProfile');
    if (!this.authModalBody) return;

    const guestName = localStorage.getItem('freshmarket_customer_name') || '';
    const guestPhone = localStorage.getItem('freshmarket_customer_phone') || '';
    const savedAddress = localStorage.getItem('freshmarket_customer_address') || '';

    if (this.currentUser) {
      // 1. Supabase User Profile View
      const name = this.currentUser.user_metadata?.full_name || this.currentUser.email || 'Покупатель';
      this.authModalBody.innerHTML = `
        <div class="profile-view">
          <div class="profile-avatar">👤</div>
          <div class="profile-name">${this.escapeHtml(name)}</div>
          <div class="profile-email">${this.escapeHtml(this.currentUser.email || '')}</div>
          
          <div class="profile-edit-box" style="width: 100%; margin-top: 14px; text-align: left; background: var(--bg-card-subtle); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <label class="field-label" for="profilePhone">Телефон или Telegram:</label>
            <input type="tel" id="profilePhone" class="text-input" placeholder="+855... или @username" value="${this.escapeHtml(guestPhone)}" />

            <label class="field-label" for="profileAddress" style="margin-top: 10px;">Адрес или ориентир доставки:</label>
            <textarea id="profileAddress" class="text-input" rows="2" placeholder="Улица, дом, ориентир">${this.escapeHtml(savedAddress)}</textarea>
            
            <button type="button" class="btn btn-primary btn-sm" id="btnSaveProfileDetails" style="margin-top: 10px; width: 100%;">Сохранить контакты</button>
          </div>

          <div class="form-actions" style="margin-top: 18px; width: 100%; display: flex; flex-direction: column; gap: 8px;">
            <button type="button" class="btn btn-primary" id="btnInstallAppUser" style="width: 100%;">📲 Установить приложение на телефон</button>
            <button type="button" class="btn btn-secondary" id="btnShowOnboardingFromProfile" style="width: 100%;">📖 Как работает FreshMarket</button>
            <button type="button" class="btn btn-secondary" id="btnLogout" style="width: 100%;">Выйти из аккаунта</button>
          </div>
        </div>
      `;

      document.getElementById('btnInstallAppUser')?.addEventListener('click', () => {
        this.triggerInstallPrompt();
      });

      document.getElementById('btnSaveProfileDetails')?.addEventListener('click', () => {
        const pPhone = document.getElementById('profilePhone')?.value.trim() || '';
        const pAddress = document.getElementById('profileAddress')?.value.trim() || '';
        if (pPhone) localStorage.setItem('freshmarket_customer_phone', pPhone);
        if (pAddress) localStorage.setItem('freshmarket_customer_address', pAddress);
        this.showToast('✅ Контакты сохранены');
        this.closeAuthModal();
      });

      document.getElementById('btnShowOnboardingFromProfile')?.addEventListener('click', () => {
        this.closeAuthModal();
        this.openOnboarding();
      });

      document.getElementById('btnLogout')?.addEventListener('click', async () => {
        if (this.sb) await this.sb.auth.signOut();
        this.currentUser = null;
        this.updateUserAvatar();
        this.closeAuthModal();
        this.showToast('Вы вышли из профиля');
      });
    } else if (guestName && guestPhone) {
      // 2. Guest Profile View (Logged in via Saved Contact Info)
      this.authModalBody.innerHTML = `
        <div class="profile-view">
          <div class="profile-avatar">👤</div>
          <div class="profile-name">${this.escapeHtml(guestName)}</div>
          <div class="profile-email">Гостевой профиль (${this.escapeHtml(guestPhone)})</div>
          
          <div class="profile-edit-box" style="width: 100%; margin-top: 14px; text-align: left; background: var(--bg-card-subtle); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <label class="field-label" for="editGuestName">Ваше имя:</label>
            <input type="text" id="editGuestName" class="text-input" value="${this.escapeHtml(guestName)}" />

            <label class="field-label" for="editGuestPhone" style="margin-top: 10px;">Телефон или Telegram:</label>
            <input type="tel" id="editGuestPhone" class="text-input" value="${this.escapeHtml(guestPhone)}" />

            <label class="field-label" for="editGuestAddress" style="margin-top: 10px;">Адрес или ориентир доставки:</label>
            <textarea id="editGuestAddress" class="text-input" rows="2">${this.escapeHtml(savedAddress)}</textarea>
            
            <button type="button" class="btn btn-primary btn-sm" id="btnUpdateGuestDetails" style="margin-top: 10px; width: 100%;">Обновить данные</button>
          </div>

          <div class="form-actions" style="margin-top: 18px; width: 100%; display: flex; flex-direction: column; gap: 8px;">
            <button type="button" class="btn btn-primary" id="btnInstallAppGuest" style="width: 100%;">📲 Установить приложение на телефон</button>
            <button type="button" class="btn btn-secondary" id="btnShowOnboardingFromProfile" style="width: 100%;">📖 Как работает FreshMarket</button>
            <button type="button" class="btn btn-secondary" id="btnGuestLogout" style="width: 100%;">Сменить покупателя</button>
          </div>
        </div>
      `;

      document.getElementById('btnInstallAppGuest')?.addEventListener('click', () => {
        this.triggerInstallPrompt();
      });

      document.getElementById('btnUpdateGuestDetails')?.addEventListener('click', () => {
        const n = document.getElementById('editGuestName')?.value.trim() || '';
        const p = document.getElementById('editGuestPhone')?.value.trim() || '';
        const a = document.getElementById('editGuestAddress')?.value.trim() || '';
        if (n) localStorage.setItem('freshmarket_customer_name', n);
        if (p) localStorage.setItem('freshmarket_customer_phone', p);
        if (a) localStorage.setItem('freshmarket_customer_address', a);
        this.showToast('✅ Данные обновлены');
        this.closeAuthModal();
      });

      document.getElementById('btnShowOnboardingFromProfile')?.addEventListener('click', () => {
        this.closeAuthModal();
        this.openOnboarding();
      });

      document.getElementById('btnGuestLogout')?.addEventListener('click', () => {
        localStorage.removeItem('freshmarket_customer_name');
        localStorage.removeItem('freshmarket_customer_phone');
        this.updateUserAvatar();
        this.openAuthModal();
        this.showToast('Вы вышли из гостевого профиля');
      });
    } else {
      // 3. Login / Authorization Prompt View
      this.authModalBody.innerHTML = `
        <div class="auth-buttons-column">
          <button type="button" class="btn btn-primary" id="btnInstallAppIntro" style="width: 100%; margin-bottom: 4px;">📲 Установить приложение на телефон</button>
          <button type="button" class="btn btn-secondary" id="btnShowOnboardingGuest" style="width: 100%; margin-bottom: 6px;">📖 Как работает доставка и заказ</button>
          
          <div class="auth-intro-text">
            Войдите для быстрой связи с закупщиком и отслеживания заказа:
          </div>

          <button type="button" class="btn-auth-provider btn-auth-google" id="btnLoginGoogle">
            <span class="auth-provider-icon">🌐</span> Войти через Google
          </button>

          <button type="button" class="btn-auth-provider btn-auth-facebook" id="btnLoginFacebook">
            <span class="auth-provider-icon">📘</span> Войти через Facebook
          </button>

          <div class="auth-divider"><span>или</span></div>

          <div class="guest-profile-box" style="background: var(--bg-card-subtle); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <div class="field-hint" style="margin-bottom: 8px; font-weight: 600; color: var(--text-primary);">Быстрый вход по контактам:</div>
            <input type="text" id="quickName" class="text-input" placeholder="Ваше имя *" value="${this.escapeHtml(guestName)}" />
            <input type="tel" id="quickPhone" class="text-input" style="margin-top: 8px;" placeholder="Телефон или Telegram *" value="${this.escapeHtml(guestPhone)}" />
            <textarea id="quickAddress" class="text-input" style="margin-top: 8px;" rows="2" placeholder="Адрес доставки (необязательно)">${this.escapeHtml(savedAddress)}</textarea>
            <button type="button" class="btn btn-primary" id="btnSaveGuest" style="margin-top: 10px; width: 100%;">Сохранить и войти</button>
          </div>
        </div>
      `;

      document.getElementById('btnInstallAppIntro')?.addEventListener('click', () => {
        this.triggerInstallPrompt();
      });

      document.getElementById('btnShowOnboardingGuest')?.addEventListener('click', () => {
        this.closeAuthModal();
        this.openOnboarding();
      });

      document.getElementById('btnLoginGoogle')?.addEventListener('click', () => {
        if (this.sb) {
          this.sb.auth.signInWithOAuth({ provider: 'google' });
        } else {
          this.showToast('Supabase не подключен');
        }
      });

      document.getElementById('btnLoginFacebook')?.addEventListener('click', () => {
        if (this.sb) {
          this.sb.auth.signInWithOAuth({ provider: 'facebook' });
        } else {
          this.showToast('Supabase не подключен');
        }
      });

      document.getElementById('btnSaveGuest')?.addEventListener('click', () => {
        const name = document.getElementById('quickName')?.value.trim();
        const phone = document.getElementById('quickPhone')?.value.trim();
        const address = document.getElementById('quickAddress')?.value.trim();

        if (!name || !phone) {
          this.showToast('⚠️ Укажите имя и телефон/Telegram');
          return;
        }

        localStorage.setItem('freshmarket_customer_name', name);
        localStorage.setItem('freshmarket_customer_phone', phone);
        if (address) localStorage.setItem('freshmarket_customer_address', address);

        this.updateUserAvatar();
        this.showToast('✅ Профиль успешно создан!');
        this.closeAuthModal();
      });
    }

    if (this.authModal) this.authModal.style.display = 'flex';
  }

  closeAuthModal() {
    if (this.authModal) this.authModal.style.display = 'none';
    this.setActiveNav('navCatalog');
    this.updateUserAvatar();
    if (this.cartModal && this.cartModal.style.display === 'flex') {
      this.renderCartModalList();
    }
  }

  updateUserAvatar() {
    if (this.userAvatarIcon) {
      const isAuth = this.isUserAuthenticated();
      this.userAvatarIcon.textContent = isAuth ? '🟢' : '👤';
    }
  }

  // ------------------------------------------------------------------------
  // 12. PWA Service Worker & Installation Prompts
  // ------------------------------------------------------------------------
  initServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw-shop.js', { scope: './shop.html' })
          .then((reg) => {
            console.log('[FreshMarket Shop] Service Worker active with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('[FreshMarket Shop] Service Worker registration failed:', err);
          });
      });
    }

    // Capture beforeinstallprompt for manual 1-click trigger
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      console.log('[FreshMarket Shop] PWA install prompt ready');
    });

    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      this.showToast('🎉 Приложение FreshMarket успешно установлено!');
    });
  }

  triggerInstallPrompt() {
    if (!this.deferredInstallPrompt) {
      this.showToast('ℹ️ Чтобы установить: нажмите «Поделиться / Меню» в браузере и выберите «На экран Домой»');
      return;
    }
    this.deferredInstallPrompt.prompt();
    this.deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult && choiceResult.outcome === 'accepted') {
        this.showToast('✅ Установка приложения начата');
      }
      this.deferredInstallPrompt = null;
    });
  }

  // ------------------------------------------------------------------------
  // 13. Helpers & Toast Notifications
  // ------------------------------------------------------------------------
  showToast(msg, type = 'auto', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    let toastType = type;
    let icon = '';
    let cleanMsg = String(msg || '').trim();

    if (toastType === 'auto') {
      if (/^✅|^🎉|успешно|оформлен|сохранен|добавлено/i.test(cleanMsg)) {
        toastType = 'success';
      } else if (/^⚠️|^❌|ошибка|не удалось|пуста|заполните/i.test(cleanMsg)) {
        toastType = 'error';
      } else if (/^ℹ️|^✨|^☀️|^🌙|^🟢|^📶|офлайн|восстановлено|режиме|профиля/i.test(cleanMsg)) {
        toastType = 'info';
      } else {
        toastType = 'info';
      }
    }

    const emojiMatch = cleanMsg.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
    if (emojiMatch) {
      icon = emojiMatch[0];
      cleanMsg = cleanMsg.slice(icon.length).trim();
    } else {
      if (toastType === 'success') icon = '✅';
      else if (toastType === 'error') icon = '⚠️';
      else icon = 'ℹ️';
    }

    const activeToasts = container.querySelectorAll('.toast-item:not(.toast-hiding)');
    if (activeToasts.length >= 3) {
      this.removeToast(activeToasts[0]);
    }

    const toastEl = document.createElement('div');
    toastEl.className = `toast-item toast-${toastType}`;
    toastEl.setAttribute('role', 'status');

    toastEl.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-text">${this.escapeHtml(cleanMsg)}</span>
      <button type="button" class="toast-close-btn" title="Закрыть" aria-label="Закрыть">✕</button>
    `;

    const closeBtn = toastEl.querySelector('.toast-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeToast(toastEl);
      });
    }

    const timer = setTimeout(() => {
      this.removeToast(toastEl);
    }, duration);
    toastEl._toastTimer = timer;

    container.appendChild(toastEl);
  }

  removeToast(toastEl) {
    if (!toastEl || toastEl.classList.contains('toast-hiding')) return;
    if (toastEl._toastTimer) {
      clearTimeout(toastEl._toastTimer);
    }
    toastEl.classList.add('toast-hiding');
    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.parentNode.removeChild(toastEl);
      }
    }, 250);
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  declension(number, titles) {
    const cases = [2, 0, 1, 1, 1, 2];
    return titles[
      number % 100 > 4 && number % 100 < 20
        ? 2
        : cases[number % 10 < 5 ? number % 10 : 5]
    ];
  }
}

// Instantiate App on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.shopApp = new ShopApp();
});
