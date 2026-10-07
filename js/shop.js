/**
 * FreshMarket — Client Shop Application (shop.js)
 * Architecture: Vanilla JS + Supabase Client + PWA Ready
 */

const SHOP_VERSION = '1.3.8';
window.SHOP_VERSION = SHOP_VERSION;

const DEFAULT_SUPABASE_URL = 'https://qifazsptdgcskrchfocc.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_N0kYhX05rgDeXuh9B6DgNg_Fese__Pg';

const FAB_ICONS = {
  cart: `<svg class="fab-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>`,
  close: `<svg class="fab-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  confirm: `<svg class="fab-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  edit: `<svg class="fab-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
  trash: `<svg class="fab-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`
};

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
    this.currentUser = null;
    this.currentSlide = 0;

    this.initSplashScreen();
    this.initSupabase();
    this.initDomElements();
    this.initEventListeners();
    this.switchView('catalog');
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
    const sbUrl = localStorage.getItem('freshmarket_supabase_url') || DEFAULT_SUPABASE_URL;
    const sbKey = localStorage.getItem('freshmarket_supabase_key') || DEFAULT_SUPABASE_KEY;
    if (sbUrl && sbKey && window.supabase) {
      try {
        this.sb = window.supabase.createClient(sbUrl, sbKey, {
          auth: {
            storageKey: 'freshmarket_customer_auth',
            storage: window.localStorage,
            persistSession: true,
            autoRefreshToken: true
          }
        });
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
  // 3. DOM Elements & Navigation
  // ------------------------------------------------------------------------
  initDomElements() {
    // Header & Search
    this.btnAuthProfile = document.getElementById('btnAuthProfile');
    this.btnShopHeaderLogout = document.getElementById('btnShopHeaderLogout');
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

    // Full-page Tab Views
    this.viewCatalog = document.getElementById('viewCatalog');
    this.viewCart = document.getElementById('viewCart');
    this.viewOrders = document.getElementById('viewOrders');
    this.viewProfile = document.getElementById('viewProfile');

    // Cart View Elements
    this.cartItemsList = document.getElementById('cartItemsList');
    this.checkoutForm = document.getElementById('checkoutForm');
    this.cartAuthGate = document.getElementById('cartAuthGate');
    this.btnCartAuthGate = document.getElementById('btnCartAuthGate');
    this.btnChangeUserProfile = document.getElementById('btnChangeUserProfile');
    this.btnCancelCheckout = document.getElementById('btnCancelCheckout');

    // Orders View Elements
    this.ordersModalBody = document.getElementById('ordersModalBody');

    // Profile View Elements
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
    // Profile & Auth
    if (this.btnAuthProfile) {
      this.btnAuthProfile.addEventListener('click', () => this.openAuthModal());
    }

    if (this.btnShopHeaderLogout) {
      this.btnShopHeaderLogout.addEventListener('click', async () => {
        if (this.sb) await this.sb.auth.signOut();
        this.currentUser = null;
        this.updateUserAvatar();
        this.showToast(window.i18n ? window.i18n.t('toasts.logged_out') : 'Вы вышли из профиля');
      });
    }

    // i18n Language change reactive re-render
    window.addEventListener('freshmarket:langchange', () => {
      this.renderCategories();
      this.renderProducts();
      this.updateCartUi();
      if (this.currentView === 'cart') {
        this.renderCartModalList();
        this.prefillCheckoutData();
      } else if (this.currentView === 'orders') {
        this.loadOrders();
      } else if (this.currentView === 'profile') {
        this.renderProfileView();
      }
      if (this.shopProductsCount && window.i18n) {
        this.shopProductsCount.textContent = `${this.products.length} ${window.i18n.t('cart.items_count')}`;
      }
      if (window.i18n) {
        this.showToast(window.i18n.t('toasts.lang_changed'), 'info', 2000);
      }
    });

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
        this.switchView('profile');
      });
    }
    if (this.btnChangeUserProfile) {
      this.btnChangeUserProfile.addEventListener('click', () => {
        this.switchView('profile');
      });
    }
    if (this.btnCancelCheckout) {
      this.btnCancelCheckout.addEventListener('click', () => {
        this.switchView('catalog');
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

    // Bottom Navigation (Full View Switching)
    if (this.navCatalog) {
      this.navCatalog.addEventListener('click', () => {
        this.switchView('catalog');
        this.setHomeTab('categories');
        this.selectedCategory = 'all';
        this.renderCategories();
        this.renderProducts();
      });
    }
    if (this.navCart) {
      this.navCart.addEventListener('click', () => {
        this.switchView('cart');
      });
    }
    if (this.navOrders) {
      this.navOrders.addEventListener('click', () => {
        this.switchView('orders');
      });
    }
    if (this.navProfile) {
      this.navProfile.addEventListener('click', () => {
        this.switchView('profile');
      });
    }

    // Online/Offline status
    window.addEventListener('online', () => {
      this.showToast(window.i18n ? window.i18n.t('toasts.network_restored') : '🟢 Сеть восстановлена: обновляем каталог...');
      this.loadCatalog();
    });

    window.addEventListener('offline', () => {
      this.showToast(window.i18n ? window.i18n.t('toasts.network_lost') : '📡 Потеряно соединение с интернетом');
      this.showOfflineState();
    });
  }

  switchView(viewName) {
    this.currentView = viewName;

    const views = {
      catalog: this.viewCatalog,
      cart: this.viewCart,
      orders: this.viewOrders,
      profile: this.viewProfile
    };

    const navButtons = {
      catalog: this.navCatalog,
      cart: this.navCart,
      orders: this.navOrders,
      profile: this.navProfile
    };

    // Toggle view elements
    Object.entries(views).forEach(([name, el]) => {
      if (el) {
        el.style.display = name === viewName ? 'flex' : 'none';
      }
    });

    // Update bottom nav active state
    Object.entries(navButtons).forEach(([name, btn]) => {
      if (btn) {
        btn.classList.toggle('active', name === viewName);
      }
    });

    window.scrollTo({ top: 0, behavior: 'instant' });

    // Render contents on demand
    if (viewName === 'cart') {
      this.renderCartModalList();
      this.prefillCheckoutData();
    } else if (viewName === 'orders') {
      this.loadOrders();
    } else if (viewName === 'profile') {
      this.renderProfileView();
    }
  }

  setActiveNav(id) {
    const idToView = {
      navCatalog: 'catalog',
      navCart: 'cart',
      navOrders: 'orders',
      navProfile: 'profile'
    };
    if (idToView[id]) {
      this.switchView(idToView[id]);
    } else {
      [this.navCatalog, this.navCart, this.navOrders, this.navProfile].forEach((el) => {
        if (el) el.classList.remove('active');
      });
      const target = document.getElementById(id);
      if (target) target.classList.add('active');
    }
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
      this.btnNextOnboarding.textContent = index === 2 
        ? (window.i18n ? window.i18n.t('onboarding.btn_start') : 'Начать') 
        : (window.i18n ? window.i18n.t('onboarding.btn_next') : 'Далее →');
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
    this.showLoadingState();

    // 1. Check network connectivity
    if (!navigator.onLine) {
      this.showOfflineState();
      return;
    }

    // 2. Fetch from Supabase
    if (this.sb) {
      try {
        const { data, error } = await this.sb
          .from('products')
          .select('*')
          .order('category', { ascending: true });

        if (!error && data && data.length > 0) {
          this.products = data;
          this.renderProducts();
          this.renderCategories();
          return;
        } else if (error) {
          console.warn('[FreshMarket Shop] Supabase fetch error:', error);
        }
      } catch (err) {
        console.warn('[FreshMarket Shop] Supabase connection error:', err);
      }
    }

    // 3. Fallback when fetch fails or returns empty
    const offTitle = window.i18n ? window.i18n.t('offline.empty_title') : 'Каталог недоступен офлайн';
    const offDesc = window.i18n ? window.i18n.t('offline.empty_desc') : 'Не удалось загрузить свежие продукты с рынка. Проверьте интернет-соединение.';
    this.showOfflineState(offTitle, offDesc);
  }

  showOfflineState(title = null, desc = null) {
    const finalTitle = title || (window.i18n ? window.i18n.t('offline.empty_title') : 'Нет подключения к сети');
    const finalDesc = desc || (window.i18n ? window.i18n.t('offline.empty_desc') : 'Не удалось загрузить свежие продукты с рынка. Проверьте интернет-соединение.');
    const retryText = window.i18n ? window.i18n.t('offline.retry_btn') : '🔄 Попробовать снова';
    this.products = [];
    this.renderCategories();

    if (this.shopProductsCount) {
      this.shopProductsCount.textContent = window.i18n ? window.i18n.t('offline.banner') : 'Нет подключения к сети';
    }

    if (this.shopProductsGrid) {
      this.shopProductsGrid.innerHTML = `
        <div class="empty-state offline-empty-state">
          <div class="empty-icon">📡</div>
          <div class="empty-title">${this.escapeHtml(finalTitle)}</div>
          <div class="empty-desc">${this.escapeHtml(finalDesc)}</div>
          <button type="button" class="btn btn-primary btn-retry-catalog" id="btnRetryCatalog" style="margin-top: 14px; padding: 10px 24px;">
            ${retryText}
          </button>
        </div>
      `;
      const btn = this.shopProductsGrid.querySelector('#btnRetryCatalog');
      if (btn) {
        btn.addEventListener('click', () => {
          this.loadCatalog();
        });
      }
    }

    if (this.shopCategoryGrid) {
      this.shopCategoryGrid.innerHTML = `
        <div class="empty-state offline-empty-state" style="grid-column: 1 / -1; padding: 40px 20px;">
          <div class="empty-icon">📡</div>
          <div class="empty-title">${this.escapeHtml(finalTitle)}</div>
          <div class="empty-desc">${this.escapeHtml(finalDesc)}</div>
          <button type="button" class="btn btn-primary" id="btnRetryCategories" style="margin-top: 14px; padding: 10px 24px;">
            ${retryText}
          </button>
        </div>
      `;
      const btnCat = this.shopCategoryGrid.querySelector('#btnRetryCategories');
      if (btnCat) {
        btnCat.addEventListener('click', () => {
          this.loadCatalog();
        });
      }
    }
  }

  showLoadingState() {
    if (this.shopProductsGrid) {
      const loadTitle = window.i18n ? window.i18n.t('shop.loading_title') : 'Загрузка свежих продуктов...';
      const loadDesc = window.i18n ? window.i18n.t('shop.loading_desc') : 'Связываемся с базой утреннего рынка';
      this.shopProductsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🥬</div>
          <div class="empty-title">${loadTitle}</div>
          <div class="empty-desc">${loadDesc}</div>
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
      const catName = window.i18n ? window.i18n.t(`categories.${cat.id}`) : cat.name;
      return `
        <button type="button" class="filter-pill ${isActive}" data-category="${cat.id}">
          <span class="category-icon">${cat.icon}</span>
          <span class="category-name">${catName}</span>
          <span class="category-count">${count}</span>
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
        const catName = window.i18n ? window.i18n.t(`categories.${cat.id}`) : cat.name;
        return `
          <div class="category-card ${isActive}" data-category="${cat.id}">
            <div class="cat-card-left">
              <span class="cat-card-icon">${cat.icon}</span>
              <span class="cat-card-name">${catName}</span>
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

  getProductOptions(product) {
    const form = (product.form || '').toLowerCase();
    const cat = (product.category || '').toLowerCase();

    const unitBunch = window.i18n ? window.i18n.t('common.unit_bunch') : 'пучок';
    const unitPcs = window.i18n ? window.i18n.t('common.unit_pcs') : 'шт';
    const unitKg = window.i18n ? window.i18n.t('common.weight_kg') : 'кг';

    if (form.includes('пучок') || form.includes('связка') || form.includes('букет')) {
      return {
        unit: unitBunch,
        options: [1, 2, 3, 4, 5, 10].map((n) => `${n} ${unitBunch}`),
        defaultQty: `1 ${unitBunch}`
      };
    }
    if (form.includes('штук') || form.includes('кочан') || form.includes('пачка') || form.includes('бутылк') || form.includes('банка') || form.includes('упаковк')) {
      return {
        unit: unitPcs,
        options: [1, 2, 3, 4, 5, 10].map((n) => `${n} ${unitPcs}`),
        defaultQty: `1 ${unitPcs}`
      };
    }
    // Default Produce / Produce / Seafood / Meat weight
    return {
      unit: unitKg,
      options: ['0.5', '1', '1.5', '2', '3', '5'].map((n) => `${n} ${unitKg}`),
      defaultQty: `1 ${unitKg}`
    };
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
      const foundLabel = window.i18n ? window.i18n.t('categories.found_count') : 'Найдено продуктов';
      this.shopProductsCount.textContent = `${foundLabel}: ${filtered.length}`;
    }

    if (filtered.length === 0) {
      const notFoundTitle = window.i18n ? window.i18n.t('categories.not_found_title') : 'Продукты не найдены';
      const notFoundDesc = window.i18n ? window.i18n.t('categories.not_found_desc') : 'Попробуйте изменить категорию или поисковый запрос';
      this.shopProductsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🔍</div>
          <div class="empty-title">${notFoundTitle}</div>
          <div class="empty-desc">${notFoundDesc}</div>
        </div>
      `;
      return;
    }

    const toggleTitle = window.i18n ? window.i18n.t('shop.card_toggle_title') : 'Свернуть / Развернуть';
    const selectQtyTitle = window.i18n ? window.i18n.t('product.select_qty_title') : 'Выберите количество / вес:';
    const backBtnText = window.i18n ? window.i18n.t('product.back_btn') : '✕ Назад';
    const removeBtnTitle = window.i18n ? window.i18n.t('product.remove_btn') : 'Убрать из корзины';
    const editOrderTitle = window.i18n ? window.i18n.t('product.edit_order') : 'Изменить заказ';
    const addToCartTitle = window.i18n ? window.i18n.t('product.add_to_cart') : 'Добавить в заказ';

    this.shopProductsGrid.innerHTML = filtered.map((item) => {
      const cartItem = this.cart[item.id];
      const inCart = Boolean(cartItem);
      const qtyText = cartItem ? cartItem.qty : '';
      const catObj = CATEGORIES.find((c) => c.name === item.category || c.id === item.category);
      const catIcon = catObj ? catObj.icon : '📦';
      const catName = catObj ? (window.i18n ? window.i18n.t(`categories.${catObj.id}`) : catObj.name) : (item.category || (window.i18n ? window.i18n.t('common.product') : 'Продукт'));
      const optionsConfig = this.getProductOptions(item);
      const currentSelectedQty = inCart ? cartItem.qty : '';

      return `
        <div class="product-card shop-product-card ${inCart ? 'in-cart' : ''}" data-id="${item.id}">
          <div class="card-names-block">
            <!-- Header with prominent EN Name and In-Cart Badge -->
            <div class="card-header-row">
              <div class="card-name-title-wrap" style="display: flex; align-items: center; flex-wrap: wrap; gap: 6px;">
                <div class="card-name-en">${this.escapeHtml(item.name_en)}</div>
                ${inCart ? `<span class="badge-in-cart" id="badge_${item.id}">✓ ${this.escapeHtml(qtyText)}</span>` : `<span class="badge-in-cart" id="badge_${item.id}" style="display: none;"></span>`}
              </div>
              <button type="button" class="btn-card-toggle" title="${toggleTitle}" aria-label="${toggleTitle}">
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
              <span class="badge badge-category">${catIcon} ${this.escapeHtml(catName)}</span>
              ${item.form ? `<span class="badge badge-form">${this.escapeHtml(item.form)}</span>` : ''}
            </div>

            <!-- 2-Slide Viewport: Slide 1 (Photo) <-> Slide 2 (Options) -->
            <div class="card-slider-viewport">
              <div class="card-slider-track">
                <!-- Slide 1: Main View (Photo + Description) -->
                <div class="card-slide card-slide-main">
                  ${item.img_url ? `
                    <div class="card-photo-container">
                      <img src="${item.img_url}" class="card-photo-full" alt="${this.escapeHtml(item.name_en)}" loading="lazy" />
                    </div>
                  ` : `
                    <div class="card-photo-container" style="display: flex; align-items: center; justify-content: center; font-size: 64px;">
                      ${catIcon}
                    </div>
                  `}
                  ${item.description ? `<div class="card-desc">${this.escapeHtml(item.description)}</div>` : ''}
                </div>

                <!-- Slide 2: Options Selection View -->
                <div class="card-slide card-slide-options">
                  <div class="card-options-header">
                    <div class="card-options-title">${selectQtyTitle}</div>
                    <button type="button" class="btn-options-cancel" data-id="${item.id}">${backBtnText}</button>
                  </div>

                  <div class="card-options-grid" data-id="${item.id}">
                    ${optionsConfig.options.map((opt) => `
                      <button type="button" class="option-chip ${currentSelectedQty === opt ? 'active' : ''}" data-id="${item.id}" data-val="${opt}">
                        ${opt}
                      </button>
                    `).join('')}
                  </div>
                </div>
              </div>

              <!-- Floating Remove Button (Red FAB, shown only during options edit for in-cart items) -->
              <button type="button" class="btn-floating-remove" data-id="${item.id}" title="${removeBtnTitle}" style="display: none;">
                <span class="fab-icon">${FAB_ICONS.trash}</span>
              </button>

              <!-- Floating Action Button (FAB) -->
              <button type="button" class="btn-floating-cart ${inCart ? 'is-in-cart' : ''}" data-id="${item.id}" title="${inCart ? editOrderTitle : addToCartTitle}">
                <span class="fab-icon">${inCart ? FAB_ICONS.edit : FAB_ICONS.cart}</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Attach card collapse / expand toggle
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

    // Attach Option Chips Click Handlers
    this.shopProductsGrid.querySelectorAll('.option-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const val = e.currentTarget.dataset.val;
        const card = e.currentTarget.closest('.product-card');
        if (!card) return;

        card.querySelectorAll('.option-chip').forEach((c) => c.classList.remove('active'));
        e.currentTarget.classList.add('active');

        // Switch FAB from ✕ to ✓
        const fab = card.querySelector('.btn-floating-cart');
        if (fab) {
          fab.classList.add('is-confirm');
          fab.title = window.i18n ? window.i18n.t('product.confirm_add') : 'Подтвердить и добавить в заказ';
          const iconEl = fab.querySelector('.fab-icon');
          if (iconEl) iconEl.innerHTML = FAB_ICONS.confirm;
        }
      });
    });

    // Cancel / Back Button Click Handlers
    this.shopProductsGrid.querySelectorAll('.btn-options-cancel').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const card = e.currentTarget.closest('.product-card');
        const id = e.currentTarget.dataset.id;
        if (!card) return;

        card.classList.remove('is-options-open');
        const btnRemove = card.querySelector('.btn-floating-remove');
        if (btnRemove) btnRemove.style.display = 'none';

        const fab = card.querySelector('.btn-floating-cart');
        const inCart = Boolean(this.cart[id]);
        if (fab) {
          fab.classList.remove('is-confirm');
          fab.classList.toggle('is-in-cart', inCart);
          fab.title = inCart 
            ? (window.i18n ? window.i18n.t('product.edit_order') : 'Изменить заказ') 
            : (window.i18n ? window.i18n.t('product.add_to_cart') : 'Добавить в заказ');
          const iconEl = fab.querySelector('.fab-icon');
          if (iconEl) iconEl.innerHTML = inCart ? FAB_ICONS.edit : FAB_ICONS.cart;
        }
      });
    });

    // Floating Remove Button (Red FAB) Click Handlers
    this.shopProductsGrid.querySelectorAll('.btn-floating-remove').forEach((btnRemove) => {
      btnRemove.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const card = e.currentTarget.closest('.product-card');
        this.removeFromCart(id, false);

        if (card) {
          card.classList.remove('is-options-open', 'in-cart');
          btnRemove.style.display = 'none';

          const fab = card.querySelector('.btn-floating-cart');
          if (fab) {
            fab.classList.remove('is-confirm', 'is-in-cart');
            fab.title = window.i18n ? window.i18n.t('product.add_to_cart') : 'Добавить в заказ';
            const iconEl = fab.querySelector('.fab-icon');
            if (iconEl) iconEl.innerHTML = FAB_ICONS.cart;
          }

          const badge = card.querySelector(`#badge_${id}`);
          if (badge) badge.style.display = 'none';

          card.querySelectorAll('.option-chip').forEach((c) => c.classList.remove('active'));
        }

        this.showToast(window.i18n ? window.i18n.t('toasts.item_removed') : '🗑️ Товар убран из корзины');
      });
    });

    // Floating Action Button (FAB) Click Handlers
    this.shopProductsGrid.querySelectorAll('.btn-floating-cart').forEach((fab) => {
      fab.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const card = e.currentTarget.closest('.product-card');
        if (!card) return;

        const isOptionsOpen = card.classList.contains('is-options-open');
        const inCart = Boolean(this.cart[id]);
        const btnRemove = card.querySelector('.btn-floating-remove');

        if (!isOptionsOpen) {
          // 1. OPEN OPTIONS (Slide to Left)
          card.classList.add('is-options-open');

          if (inCart) {
            // Already in cart -> pre-selected, confirm icon (✓), show red remove FAB
            fab.classList.add('is-confirm');
            fab.title = window.i18n ? window.i18n.t('product.confirm_changes') : 'Подтвердить изменения';
            const iconEl = fab.querySelector('.fab-icon');
            if (iconEl) iconEl.innerHTML = FAB_ICONS.confirm;
            if (btnRemove) btnRemove.style.display = 'flex';
          } else {
            // New item -> no selection, cross icon (✕), hide red remove FAB
            card.querySelectorAll('.option-chip').forEach((c) => c.classList.remove('active'));
            fab.classList.remove('is-confirm');
            fab.title = window.i18n ? window.i18n.t('product.cancel_back') : 'Назад / Отмена';
            const iconEl = fab.querySelector('.fab-icon');
            if (iconEl) iconEl.innerHTML = FAB_ICONS.close;
            if (btnRemove) btnRemove.style.display = 'none';
          }
        } else {
          // 2. FAB CLICKED WHILE OPTIONS OPEN
          const isConfirmState = fab.classList.contains('is-confirm');
          const activeChip = card.querySelector('.option-chip.active');
          const qty = activeChip?.dataset.val;

          if (btnRemove) btnRemove.style.display = 'none';

          if (!isConfirmState || !qty) {
            // Act as Cancel / Back
            card.classList.remove('is-options-open');
            fab.classList.remove('is-confirm');
            fab.classList.toggle('is-in-cart', inCart);
            fab.title = inCart 
              ? (window.i18n ? window.i18n.t('product.edit_order') : 'Изменить заказ') 
              : (window.i18n ? window.i18n.t('product.add_to_cart') : 'Добавить в заказ');
            const iconEl = fab.querySelector('.fab-icon');
            if (iconEl) iconEl.innerHTML = inCart ? FAB_ICONS.edit : FAB_ICONS.cart;
          } else {
            // Confirm & Save to Cart
            const product = this.products.find((p) => p.id === id);
            if (product) {
              this.cart[id] = {
                product: product,
                qty: qty
              };
              this.saveCart();

              // Slide back to main view
              card.classList.remove('is-options-open');
              card.classList.add('in-cart');
              fab.classList.remove('is-confirm');
              fab.classList.add('is-in-cart');
              fab.title = window.i18n ? window.i18n.t('product.edit_order') : 'Изменить заказ';
              const iconEl = fab.querySelector('.fab-icon');
              if (iconEl) iconEl.innerHTML = FAB_ICONS.edit;

              // Update badge in header
              const badge = card.querySelector(`#badge_${id}`);
              if (badge) {
                badge.textContent = `✓ ${qty}`;
                badge.style.display = 'inline-flex';
              }

              this.showToast(`${window.i18n ? window.i18n.t('toasts.item_added') : '✅ В корзине'}: ${product.name_en} (${qty})`);
            }
          }
        }
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
    const defaultQty = product.form && product.form.toLowerCase().includes('пучок') 
      ? (window.i18n ? `1 ${window.i18n.t('common.unit_bunch')}` : '1 пучок') 
      : (window.i18n ? `1 ${window.i18n.t('common.weight_kg')}` : '1 кг');

    this.cart[productId] = {
      product: product,
      qty: defaultQty
    };

    this.saveCart();
    this.renderProducts();
    this.showToast(`${window.i18n ? window.i18n.t('toasts.item_added') : 'Добавлено'}: ${product.name_en}`);
  }

  increaseQty(productId) {
    if (!this.cart[productId]) return;
    const current = this.cart[productId].qty;
    // Simple incremental heuristic
    const match = current.match(/^([\d.]+)\s*(.*)$/);
    if (match) {
      const val = parseFloat(match[1]) + 1;
      const unit = match[2] || (window.i18n ? window.i18n.t('common.weight_kg') : 'кг');
      this.cart[productId].qty = `${val} ${unit}`;
    } else {
      this.cart[productId].qty = window.i18n ? `2 ${window.i18n.t('common.weight_kg')}` : '2 кг';
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
      const unit = match[2] || (window.i18n ? window.i18n.t('common.weight_kg') : 'кг');
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

  removeFromCart(productId, shouldReRender = true) {
    delete this.cart[productId];
    this.saveCart();
    if (shouldReRender) {
      this.renderProducts();
    }
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
  // 8. Cart & Checkout View
  // ------------------------------------------------------------------------
  openCartModal() {
    this.switchView('cart');
  }

  closeCartModal() {
    this.switchView('catalog');
  }

  isUserAuthenticated() {
    return Boolean(this.currentUser);
  }

  getCurrentCustomerInfo() {
    const defaultCustomer = window.i18n ? window.i18n.t('common.customer') : 'Покупатель';
    let name = defaultCustomer;
    let email = '';
    let messenger = localStorage.getItem('freshmarket_customer_messenger') || 'telegram';
    let phone = localStorage.getItem('freshmarket_customer_phone') || '';
    let address = localStorage.getItem('freshmarket_customer_address') || '';

    if (this.currentUser) {
      name = this.currentUser.user_metadata?.full_name || this.currentUser.email || defaultCustomer;
      email = this.currentUser.email || '';
      if (!phone && this.currentUser.phone) {
        phone = this.currentUser.phone;
      }
    }
    return { name, email, messenger, phone, address };
  }

  renderCartModalList() {
    if (!this.cartItemsList) return;
    const items = Object.values(this.cart);

    if (items.length === 0) {
      const emptyTitle = window.i18n ? window.i18n.t('cart.empty_title') : 'Корзина пуста';
      const emptyDesc = window.i18n ? window.i18n.t('cart.empty_desc') : 'Выберите свежие продукты на витрине';
      const toCatalogBtn = window.i18n ? window.i18n.t('nav.catalog') : 'Перейти в каталог 🛍️';
      this.cartItemsList.innerHTML = `
        <div class="empty-state" style="padding: 40px 0;">
          <div class="empty-icon">🛒</div>
          <div class="empty-title">${emptyTitle}</div>
          <div class="empty-desc">${emptyDesc}</div>
          <button type="button" class="btn btn-primary" id="btnCartEmptyToCatalog" style="margin-top: 14px;">${toCatalogBtn}</button>
        </div>
      `;
      document.getElementById('btnCartEmptyToCatalog')?.addEventListener('click', () => {
        this.switchView('catalog');
      });
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

    const qtyPlaceholder = window.i18n ? window.i18n.t('cart.qty_placeholder') : '1 кг / 3 шт';
    const removeTitle = window.i18n ? window.i18n.t('cart.remove_item') : 'Удалить';

    this.cartItemsList.innerHTML = items.map(({ product, qty }) => `
      <div class="cart-item-row" data-id="${product.id}">
        <div class="cart-item-info">
          <div class="cart-item-name">${this.escapeHtml(product.name_en)}</div>
          <div class="cart-item-kh khmer-font">${this.escapeHtml(product.name_kh || '')}</div>
        </div>
        <div class="cart-item-qty-input-wrap">
          <input type="text" class="cart-item-qty-input" value="${this.escapeHtml(qty)}" data-id="${product.id}" placeholder="${qtyPlaceholder}" />
        </div>
        <button type="button" class="cart-item-remove-btn" data-id="${product.id}" title="${removeTitle}">✕</button>
      </div>
    `).join('');

    // Quantity manual change & remove listeners
    this.cartItemsList.querySelectorAll('.cart-item-qty-input').forEach((input) => {
      input.addEventListener('change', (e) => {
        const id = e.target.dataset.id;
        if (this.cart[id]) {
          this.cart[id].qty = e.target.value.trim() || (window.i18n ? `1 ${window.i18n.t('common.unit_pcs')}` : '1 шт');
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
    const { name, messenger, phone, address } = this.getCurrentCustomerInfo();

    const nameBadge = document.getElementById('checkoutUserName');
    const phoneBadge = document.getElementById('checkoutUserPhone');
    const addressInput = document.getElementById('deliveryAddress');

    if (nameBadge) nameBadge.textContent = name;
    if (phoneBadge) {
      if (!phone) {
        const contactHint = window.i18n ? window.i18n.t('cart.specify_contact') : '⚠️ Укажите контакт (Telegram / WhatsApp)';
        phoneBadge.innerHTML = `<span style="color: var(--accent-amber, #f59e0b);">${contactHint}</span>`;
      } else {
        const messengerIcon = messenger === 'whatsapp' ? '💬 WhatsApp:' : messenger === 'phone' ? '📞 Телефон:' : '✈️ Telegram:';
        phoneBadge.textContent = `${messengerIcon} ${phone}`;
      }
    }
    if (addressInput && !addressInput.value) addressInput.value = address;
  }

  // ------------------------------------------------------------------------
  // 9. Checkout Submission
  // ------------------------------------------------------------------------
  async handleCheckoutSubmit() {
    if (!this.isUserAuthenticated()) {
      this.showToast(window.i18n ? window.i18n.t('toasts.auth_required') : '⚠️ Войдите через Google или Facebook для оформления заказа');
      this.openAuthModal();
      return;
    }

    const { name: customerName, messenger: customerMessenger, phone: customerPhone } = this.getCurrentCustomerInfo();

    if (!customerPhone) {
      this.showToast(window.i18n ? window.i18n.t('toasts.contacts_required') : '⚠️ Укажите контакт (Telegram / WhatsApp) для связи с закупщиком');
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
      this.showToast(window.i18n ? window.i18n.t('toasts.address_required') : '⚠️ Пожалуйста, укажите адрес или ориентир доставки');
      if (addressInput) addressInput.focus();
      return;
    }

    const items = Object.values(this.cart);
    if (items.length === 0) {
      this.showToast(window.i18n ? window.i18n.t('toasts.cart_is_empty') : '⚠️ Корзина пуста');
      return;
    }

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
      customer_messenger: customerMessenger,
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

      this.showToast(window.i18n ? `${window.i18n.t('toasts.order_sent')} (${orderNumber})` : `🎉 Заказ ${orderNumber} успешно оформлен на утренний закуп!`);
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
      this.showToast(window.i18n ? `${window.i18n.t('toasts.order_saved')}: ${orderNumber}` : `Заказ сохранен: ${orderNumber}`);
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
  // 10. Orders History View
  // ------------------------------------------------------------------------
  openOrdersModal() {
    this.switchView('orders');
  }

  closeOrdersModal() {
    this.switchView('catalog');
  }

  async loadOrders() {
    if (!this.ordersModalBody) return;

    const ordersLoading = window.i18n ? window.i18n.t('orders.loading') : 'Загрузка заказов...';
    this.ordersModalBody.innerHTML = `
      <div class="empty-state" style="padding: 30px 0;">
        <div class="empty-icon">⏳</div>
        <div class="empty-title">${ordersLoading}</div>
      </div>
    `;

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

  renderOrdersList(orders) {
    if (!this.ordersModalBody) return;

    if (!orders || orders.length === 0) {
      const emptyOrdersTitle = window.i18n ? window.i18n.t('orders.empty_title') : 'У вас пока нет заказов';
      const emptyOrdersDesc = window.i18n ? window.i18n.t('orders.empty_desc') : 'Соберите корзину на утренний закуп продуктов';
      const toCatalogBtn = window.i18n ? window.i18n.t('nav.catalog') : 'Перейти в каталог 🛍️';
      this.ordersModalBody.innerHTML = `
        <div class="empty-state" style="padding: 40px 0;">
          <div class="empty-icon">📦</div>
          <div class="empty-title">${emptyOrdersTitle}</div>
          <div class="empty-desc">${emptyOrdersDesc}</div>
          <button type="button" class="btn btn-primary" id="btnOrdersEmptyToCatalog" style="margin-top: 14px;">${toCatalogBtn}</button>
        </div>
      `;
      document.getElementById('btnOrdersEmptyToCatalog')?.addEventListener('click', () => {
        this.switchView('catalog');
      });
      return;
    }

    const statusMap = {
      new: { label: window.i18n ? window.i18n.t('orders.status_new') : '🌅 Принят на утренний закуп', class: 'status-new' },
      purchasing: { label: window.i18n ? window.i18n.t('orders.status_purchasing') : '🥬 Закупается на рынке (05:00)', class: 'status-purchasing' },
      delivering: { label: window.i18n ? window.i18n.t('orders.status_delivering') : '🛵 Передан курьеру', class: 'status-delivering' },
      completed: { label: window.i18n ? window.i18n.t('orders.status_completed') : '✅ Доставлен и оплачен', class: 'status-completed' },
      cancelled: { label: window.i18n ? window.i18n.t('orders.status_cancelled') : '❌ Отменен', class: 'status-cancelled' }
    };

    const deliveryPrefix = window.i18n ? window.i18n.t('orders.delivery_prefix') : 'Доставка:';
    const tomorrowLabel = window.i18n ? window.i18n.t('orders.delivery_tomorrow') : 'Завтра';
    const receiptBtnText = window.i18n ? window.i18n.t('orders.receipt_btn') : '🧾 Чек';
    const receiptTitleText = window.i18n ? window.i18n.t('orders.receipt_title') : 'Посмотреть QR-чек';
    const marketLabel = window.i18n ? window.i18n.t('orders.market_label') : 'Рынок:';
    const feeDeliveryLabel = window.i18n ? window.i18n.t('orders.fee_delivery_label') : 'Услуга + Доставка:';
    const totalLabel = window.i18n ? window.i18n.t('orders.total_label') : 'Итого:';
    const currentLocale = window.i18n?.currentLang || 'ru';
    const localeCode = currentLocale === 'ua' ? 'uk-UA' : currentLocale === 'km' ? 'km-KH' : currentLocale === 'en' ? 'en-US' : 'ru-RU';

    this.ordersModalBody.innerHTML = orders.map((order) => {
      const st = statusMap[order.status] || { label: order.status, class: '' };
      const items = order.items || [];
      const dateStr = new Date(order.created_at).toLocaleDateString(localeCode, {
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
              <div class="order-card-date">${dateStr} • ${deliveryPrefix} ${order.target_delivery_date || tomorrowLabel}</div>
            </div>
            <span class="order-status-pill ${st.class}">${st.label}</span>
          </div>

          <!-- Items preview -->
          <div class="order-card-items">
            ${items.map((item) => `
              <div class="order-item-mini">
                <span class="order-item-mini-name">${this.escapeHtml(item.product_name_en)} (${this.escapeHtml(item.requested_qty)})</span>
                ${item.receipt_url ? `
                  <a href="${item.receipt_url}" target="_blank" class="receipt-link" title="${receiptTitleText}">${receiptBtnText}</a>
                ` : ''}
              </div>
            `).join('')}
          </div>

          <!-- Totals Calculation -->
          <div class="order-card-footer">
            <div class="order-calc-breakdown">
              <div>${marketLabel} <b>$${Number(order.market_items_total || 0).toFixed(2)}</b></div>
              <div>${feeDeliveryLabel} <b>$${(Number(order.service_fee || 3) + Number(order.delivery_fee || 1.5)).toFixed(2)}</b></div>
            </div>
            <div class="order-grand-total">
              ${totalLabel} <b>$${Number(order.grand_total || (Number(order.market_items_total || 0) + 4.5)).toFixed(2)}</b>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // ------------------------------------------------------------------------
  // 11. Auth & Profile View
  // ------------------------------------------------------------------------
  openAuthModal() {
    this.switchView('profile');
  }

  closeAuthModal() {
    this.switchView('catalog');
  }

  renderProfileView() {
    if (!this.authModalBody) return;

    const defaultCustomer = window.i18n ? window.i18n.t('common.customer') : 'Покупатель';
    const messengerLabelText = window.i18n ? window.i18n.t('profile.messenger_label') : 'Предпочтительный мессенджер для связи *:';
    const tgPill = window.i18n ? window.i18n.t('profile.messenger_telegram') : '✈️ Telegram';
    const waPill = window.i18n ? window.i18n.t('profile.messenger_whatsapp') : '💬 WhatsApp';
    const phonePill = window.i18n ? window.i18n.t('profile.messenger_phone') : '📞 Звонок';
    const addressLabelText = window.i18n ? window.i18n.t('profile.address_label') : 'Адрес или ориентир доставки по умолчанию:';
    const addressPlaceholderText = window.i18n ? window.i18n.t('profile.address_placeholder') : 'Улица, дом, квартира, ориентир';
    const saveContactsText = window.i18n ? window.i18n.t('profile.save_contacts_btn') : 'Сохранить контакты';
    const installAppText = window.i18n ? window.i18n.t('profile.install_app_btn') : '📲 Установить приложение на телефон';
    const howItWorksText = window.i18n ? window.i18n.t('profile.how_it_works_btn') : '📖 Как работает FreshMarket';
    const logoutBtnText = window.i18n ? window.i18n.t('profile.logout_btn') : 'Выйти из аккаунта';
    const loginIntroText = window.i18n ? window.i18n.t('profile.login_intro') : 'Войдите через Google или Facebook для связи с закупщиком и оформления заказов:';
    const googleBtnText = window.i18n ? window.i18n.t('auth.btn_google') : 'Войти через Google';
    const fbBtnText = window.i18n ? window.i18n.t('auth.btn_facebook') : 'Войти через Facebook';

    const getPhoneLabelAndPlaceholder = (msgType) => {
      if (msgType === 'telegram') {
        return {
          label: window.i18n ? window.i18n.t('profile.phone_label_telegram') : 'Юзернейм Telegram (@username) или номер *:',
          placeholder: window.i18n ? window.i18n.t('profile.phone_placeholder_telegram') : '@username или +855...'
        };
      } else if (msgType === 'whatsapp') {
        return {
          label: window.i18n ? window.i18n.t('profile.phone_label_whatsapp') : 'Номер телефона WhatsApp (с кодом) *:',
          placeholder: window.i18n ? window.i18n.t('profile.phone_placeholder_whatsapp') : '+855 ... (номер WhatsApp)'
        };
      } else {
        return {
          label: window.i18n ? window.i18n.t('profile.phone_label_call') : 'Номер телефона для звонков *:',
          placeholder: window.i18n ? window.i18n.t('profile.phone_placeholder_call') : '+855 ...'
        };
      }
    };

    if (this.currentUser) {
      // 1. Supabase Authenticated User Profile View
      const name = this.currentUser.user_metadata?.full_name || this.currentUser.email || defaultCustomer;
      const email = this.currentUser.email || '';
      let currentMessenger = localStorage.getItem('freshmarket_customer_messenger') || 'telegram';
      let phone = localStorage.getItem('freshmarket_customer_phone') || this.currentUser.phone || '';
      let address = localStorage.getItem('freshmarket_customer_address') || '';
      const phoneMeta = getPhoneLabelAndPlaceholder(currentMessenger);

      this.authModalBody.innerHTML = `
        <div class="profile-view">
          <div class="profile-avatar">👤</div>
          <div class="profile-name">${this.escapeHtml(name)}</div>
          <div class="profile-email">${this.escapeHtml(email)}</div>
          
          <div class="profile-edit-box" style="width: 100%; margin-top: 14px; text-align: left; background: var(--bg-card-subtle); padding: 14px; border-radius: var(--radius-md); border: 1px solid var(--border-subtle);">
            <label class="field-label" style="margin-bottom: 2px;">${messengerLabelText}</label>
            <div class="messenger-selector" id="profileMessengerSelector">
              <button type="button" class="messenger-pill ${currentMessenger === 'telegram' ? 'active' : ''}" data-messenger="telegram">${tgPill}</button>
              <button type="button" class="messenger-pill ${currentMessenger === 'whatsapp' ? 'active' : ''}" data-messenger="whatsapp">${waPill}</button>
              <button type="button" class="messenger-pill ${currentMessenger === 'phone' ? 'active' : ''}" data-messenger="phone">${phonePill}</button>
            </div>

            <label class="field-label" for="profilePhone" id="profilePhoneLabel" style="margin-top: 8px;">
              ${phoneMeta.label}
            </label>
            <input type="text" id="profilePhone" class="text-input" placeholder="${phoneMeta.placeholder}" value="${this.escapeHtml(phone)}" required />

            <label class="field-label" for="profileAddress" style="margin-top: 10px;">${addressLabelText}</label>
            <textarea id="profileAddress" class="text-input" rows="2" placeholder="${addressPlaceholderText}">${this.escapeHtml(address)}</textarea>
            
            <button type="button" class="btn btn-primary btn-sm" id="btnSaveProfileDetails" style="margin-top: 10px; width: 100%;">${saveContactsText}</button>
          </div>

          <div class="form-actions" style="margin-top: 18px; width: 100%; display: flex; flex-direction: column; gap: 8px;">
            <button type="button" class="btn btn-primary" id="btnInstallAppUser" style="width: 100%;">${installAppText}</button>
            <button type="button" class="btn btn-secondary" id="btnShowOnboardingFromProfile" style="width: 100%;">${howItWorksText}</button>
            <button type="button" class="btn btn-secondary" id="btnLogout" style="width: 100%;">${logoutBtnText}</button>
          </div>
        </div>
      `;

      // Messenger selector pill click handler
      const selector = document.getElementById('profileMessengerSelector');
      selector?.querySelectorAll('.messenger-pill').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          selector.querySelectorAll('.messenger-pill').forEach((b) => b.classList.remove('active'));
          e.currentTarget.classList.add('active');
          currentMessenger = e.currentTarget.dataset.messenger;
          const phoneLabel = document.getElementById('profilePhoneLabel');
          const phoneInput = document.getElementById('profilePhone');
          if (phoneLabel && phoneInput) {
            const updatedMeta = getPhoneLabelAndPlaceholder(currentMessenger);
            phoneLabel.textContent = updatedMeta.label;
            phoneInput.placeholder = updatedMeta.placeholder;
          }
        });
      });

      document.getElementById('btnInstallAppUser')?.addEventListener('click', () => {
        this.triggerInstallPrompt();
      });

      document.getElementById('btnSaveProfileDetails')?.addEventListener('click', () => {
        const pPhone = document.getElementById('profilePhone')?.value.trim() || '';
        const pAddress = document.getElementById('profileAddress')?.value.trim() || '';
        if (!pPhone) {
          this.showToast(window.i18n ? window.i18n.t('toasts.contacts_required') : '⚠️ Укажите контакт (Telegram / WhatsApp / телефон) для связи');
          document.getElementById('profilePhone')?.focus();
          return;
        }
        localStorage.setItem('freshmarket_customer_messenger', currentMessenger);
        localStorage.setItem('freshmarket_customer_phone', pPhone);
        if (pAddress) localStorage.setItem('freshmarket_customer_address', pAddress);
        this.showToast(window.i18n ? window.i18n.t('toasts.contacts_saved') : '✅ Контакты сохранены');
      });

      document.getElementById('btnShowOnboardingFromProfile')?.addEventListener('click', () => {
        this.openOnboarding();
      });

      document.getElementById('btnLogout')?.addEventListener('click', async () => {
        if (this.sb) await this.sb.auth.signOut();
        this.currentUser = null;
        this.updateUserAvatar();
        this.renderProfileView();
        this.showToast(window.i18n ? window.i18n.t('toasts.logged_out') : 'Вы вышли из профиля');
      });
    } else {
      // 2. Login Prompt View (Google & Facebook OAuth ONLY)
      this.authModalBody.innerHTML = `
        <div class="auth-buttons-column">
          <button type="button" class="btn btn-primary" id="btnInstallAppIntro" style="width: 100%; margin-bottom: 6px;">${installAppText}</button>
          
          <div class="auth-intro-text">
            ${loginIntroText}
          </div>

          <button type="button" class="btn-auth-provider btn-auth-google" id="btnLoginGoogle">
            <span class="auth-provider-icon">🌐</span> ${googleBtnText}
          </button>

          <button type="button" class="btn-auth-provider btn-auth-facebook" id="btnLoginFacebook">
            <span class="auth-provider-icon">📘</span> ${fbBtnText}
          </button>

          <div style="margin-top: 14px; width: 100%;">
            <button type="button" class="btn btn-secondary" id="btnShowOnboardingGuest" style="width: 100%;">${howItWorksText}</button>
          </div>
        </div>
      `;

      document.getElementById('btnInstallAppIntro')?.addEventListener('click', () => {
        this.triggerInstallPrompt();
      });

      document.getElementById('btnShowOnboardingGuest')?.addEventListener('click', () => {
        this.openOnboarding();
      });

      document.getElementById('btnLoginGoogle')?.addEventListener('click', () => {
        if (this.sb) {
          const redirectTo = window.location.origin + window.location.pathname;
          this.sb.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo
            }
          });
        } else {
          this.showToast(window.i18n ? window.i18n.t('toasts.network_lost') : 'Supabase не подключен');
        }
      });

      document.getElementById('btnLoginFacebook')?.addEventListener('click', () => {
        if (this.sb) {
          const redirectTo = window.location.origin + window.location.pathname;
          this.sb.auth.signInWithOAuth({
            provider: 'facebook',
            options: {
              redirectTo
            }
          });
        } else {
          this.showToast(window.i18n ? window.i18n.t('toasts.network_lost') : 'Supabase не подключен');
        }
      });
    }
  }

  updateUserAvatar() {
    const isAuth = this.isUserAuthenticated();
    if (this.userAvatarIcon) {
      this.userAvatarIcon.textContent = isAuth ? '🟢' : '👤';
    }
    if (this.btnShopHeaderLogout) {
      this.btnShopHeaderLogout.style.display = isAuth ? 'inline-flex' : 'none';
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
      this.showToast(window.i18n ? window.i18n.t('toasts.app_installed') : '🎉 Приложение FreshMarket успешно установлено!');
    });
  }

  triggerInstallPrompt() {
    if (!this.deferredInstallPrompt) {
      this.showToast(window.i18n ? window.i18n.t('toasts.install_hint') : 'ℹ️ Чтобы установить: нажмите «Поделиться / Меню» в браузере и выберите «На экран Домой»');
      return;
    }
    this.deferredInstallPrompt.prompt();
    this.deferredInstallPrompt.userChoice.then((choiceResult) => {
      if (choiceResult && choiceResult.outcome === 'accepted') {
        this.showToast(window.i18n ? window.i18n.t('toasts.install_started') : '✅ Установка приложения начата');
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

    const closeToastTitle = window.i18n ? window.i18n.t('common.close') : 'Закрыть';
    toastEl.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-text">${this.escapeHtml(cleanMsg)}</span>
      <button type="button" class="toast-close-btn" title="${closeToastTitle}" aria-label="${closeToastTitle}">✕</button>
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
