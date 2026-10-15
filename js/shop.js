/**
 * FreshMarket — Client Shop Application (shop.js)
 * Architecture: Vanilla JS + Supabase Client + PWA Ready
 */

const SHOP_VERSION = '1.4.0';
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
    this.khrRate = this.getKhrRate();
    this.shopLayout = localStorage.getItem('freshmarket_shop_layout') || 'grid-2';

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

  getKhrRate() {
    const saved = localStorage.getItem('freshmarket_khr_rate');
    const num = saved ? parseInt(saved, 10) : 4000;
    return (!isNaN(num) && num > 0) ? num : 4000;
  }

  applyShopLayout() {
    if (!this.shopProductsGrid) return;
    this.shopProductsGrid.classList.remove('layout-grid-1', 'layout-grid-2');
    this.shopProductsGrid.classList.add(this.shopLayout === 'grid-1' ? 'layout-grid-1' : 'layout-grid-2');
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
          if (this.currentView === 'profile') {
            this.renderProfileView();
          }
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
    this.applyShopLayout();

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

    // Reactive KHR Currency Rate Change listener
    window.addEventListener('storage', (e) => {
      if (e.key === 'freshmarket_khr_rate') {
        this.khrRate = this.getKhrRate();
        this.renderProducts();
      }
    });
    window.addEventListener('freshmarket:ratechange', (e) => {
      if (e.detail && e.detail.rate) {
        this.khrRate = e.detail.rate;
      } else {
        this.khrRate = this.getKhrRate();
      }
      this.renderProducts();
    });

    // Search
    if (this.shopSearchInput) {
      this.shopSearchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (this.shopSearchClear) {
          this.shopSearchClear.style.display = val ? 'flex' : 'none';
        }
        if (val.length >= 2) {
          this.searchQuery = val.toLowerCase();
          this.setHomeTab('products');
          if (this.selectedCategory !== 'all') {
            this.selectedCategory = 'all';
            this.renderCategories();
          }
        } else {
          this.searchQuery = '';
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

    // Touch swipe gestures support
    if (this.onboardingSlider) {
      let touchStartX = 0;
      let touchStartY = 0;
      this.onboardingSlider.addEventListener('touchstart', (e) => {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      }, { passive: true });

      this.onboardingSlider.addEventListener('touchend', (e) => {
        if (!e.changedTouches || !e.changedTouches[0]) return;
        const diffX = e.changedTouches[0].screenX - touchStartX;
        const diffY = e.changedTouches[0].screenY - touchStartY;
        if (Math.abs(diffX) > 40 && Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX < 0) {
            // swipe left -> next slide
            if (this.currentSlide < 2) {
              this.setSlide(this.currentSlide + 1);
            }
          } else {
            // swipe right -> previous slide
            if (this.currentSlide > 0) {
              this.setSlide(this.currentSlide - 1);
            }
          }
        }
      }, { passive: true });
    }

    // Keyboard navigation
    window.addEventListener('keydown', (e) => {
      if (!this.onboardingOverlay || this.onboardingOverlay.style.display === 'none') return;
      if (e.key === 'Escape') {
        this.finishOnboarding();
      } else if (e.key === 'ArrowRight') {
        if (this.currentSlide < 2) this.setSlide(this.currentSlide + 1);
      } else if (e.key === 'ArrowLeft') {
        if (this.currentSlide > 0) this.setSlide(this.currentSlide - 1);
      }
    });

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

    const btnRow = this.btnNextOnboarding?.parentElement;
    if (this.btnSkipOnboarding) {
      this.btnSkipOnboarding.style.display = index === 2 ? 'none' : 'block';
    }
    if (btnRow) {
      btnRow.classList.toggle('single-btn', index === 2);
    }

    if (this.btnNextOnboarding) {
      this.btnNextOnboarding.textContent = index === 2 
        ? (window.i18n ? window.i18n.t('onboarding.btn_start') : 'Начать покупки') 
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
          <button type="button" class="btn btn-primary btn-retry-catalog" id="btnRetryCatalog">
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
        <div class="empty-state offline-empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">📡</div>
          <div class="empty-title">${this.escapeHtml(finalTitle)}</div>
          <div class="empty-desc">${this.escapeHtml(finalDesc)}</div>
          <button type="button" class="btn btn-primary" id="btnRetryCategories">
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
    const unitField = (product.unit || '').toLowerCase();
    const uInfo = this.getUnitInfo(product.unit);
    const uKey = uInfo ? uInfo.key : '';

    const unitBunch = window.i18n ? window.i18n.t('common.unit_bunch') : 'пучок';
    const unitPcs = window.i18n ? window.i18n.t('common.unit_pcs') : 'шт';
    const unitKg = window.i18n ? window.i18n.t('common.weight_kg') : 'кг';
    const unitL = window.i18n ? window.i18n.t('common.unit_l') : 'л';

    // 1. Bottles & Sauces -> Volume options (0.2, 0.5, 0.7, 1)
    if (form.includes('бутылк') || form.includes('bottle') || form.includes('соус') || form.includes('жидкий') || uKey === '0_2_l' || uKey === '0_5_l' || uKey === '0_7_l' || uKey === '1_l' || uKey === '1_bottle' || unitField.includes('бут')) {
      return {
        unit: unitL,
        options: ['0.2', '0.5', '0.7', '1'].map((n) => `${n} ${unitL}`),
        defaultQty: (uInfo ? uInfo.label : product.unit) || `0.5 ${unitL}`
      };
    }

    // 2. Bunches
    if (uKey === '1_bunch' || uKey === 'bunch' || unitField.includes('пучок') || unitField.includes('связка') || form.includes('пучок') || form.includes('связка') || form.includes('букет')) {
      return {
        unit: unitBunch,
        options: [1, 2, 3, 4, 5, 10].map((n) => `${n} ${unitBunch}`),
        defaultQty: (uInfo ? uInfo.label : product.unit) || `1 ${unitBunch}`
      };
    }

    // 3. Pieces / Packs / Trays
    if (uKey === '1_pc' || uKey === 'pc' || uKey === '10_pcs' || uKey === '1_pack' || uKey === 'pack' || uKey === '1_tray' || unitField.includes('шт') || unitField.includes('упак') || form.includes('штук') || form.includes('кочан') || form.includes('пачка') || form.includes('банка') || form.includes('упаковк')) {
      return {
        unit: unitPcs,
        options: [1, 2, 3, 4, 5, 10].map((n) => `${n} ${unitPcs}`),
        defaultQty: (uInfo ? uInfo.label : product.unit) || `1 ${unitPcs}`
      };
    }

    // 4. Default Produce / Seafood / Meat weight (kg)
    return {
      unit: unitKg,
      options: ['0.5', '1', '1.5', '2', '3', '5'].map((n) => `${n} ${unitKg}`),
      defaultQty: (uInfo ? uInfo.label : product.unit) || `1 ${unitKg}`
    };
  }

  getFormInfo(form) {
    if (typeof window.normalizeFormInfo === 'function') {
      return window.normalizeFormInfo(form);
    }
    if (!form || typeof form !== 'string') return null;
    const formTrim = form.trim();
    if (!formTrim) return null;
    const formNorm = formTrim.toLowerCase();
    const formMap = {
      'целый': 'whole', 'цілий': 'whole', 'whole': 'whole', 'ទាំងមូល': 'whole',
      'корень': 'root', 'корінь': 'root', 'root': 'root', 'មើម': 'root',
      'пучок': 'bunch', 'bunch': 'bunch', 'កញ្ចប់': 'bunch',
      'стручок': 'pods', 'pods': 'pods', 'ផ្លែ': 'pods',
      'нарезка': 'sliced', 'нарізка': 'sliced', 'sliced': 'sliced', 'ចំណិត': 'sliced',
      'филе': 'fillet', 'філе': 'fillet', 'fillet': 'fillet', 'សាច់សុទ្ធ': 'fillet',
      'фарш': 'minced', 'minced': 'minced', 'សាច់ចិញ្ច្រាំ': 'minced',
      'очищенный': 'peeled', 'очищений': 'peeled', 'peeled': 'peeled', 'បកសម្បក': 'peeled',
      'сушеный': 'dried', 'сушений': 'dried', 'dried': 'dried', 'ក្រៀម': 'dried',
      'молотый': 'powder', 'мелений': 'powder', 'powder': 'powder', 'ម្សៅ': 'powder',
      'паста': 'paste', 'paste': 'paste', 'គ្រឿងបុក': 'paste',
      'маринованный': 'pickled', 'маринований': 'pickled', 'pickled': 'pickled', 'ជ្រក់': 'pickled',
      'замороженный': 'frozen', 'заморожений': 'frozen', 'frozen': 'frozen', 'កក': 'frozen',
      'бутылка': 'bottle', 'пляшка': 'bottle', 'bottle': 'bottle', 'ដប': 'bottle',
      'соус': 'bottle', 'жидкий': 'bottle', 'liquid': 'bottle'
    };
    const key = formMap[formNorm] || null;
    let label = formTrim;
    if (key && window.i18n) {
      const trans = window.i18n.t(`forms.${key}`);
      if (trans && trans !== `forms.${key}`) {
        label = trans;
      }
    }
    return { key, label };
  }

  getUnitInfo(unit) {
    if (!unit || typeof unit !== 'string') return null;
    const trim = unit.trim();
    if (!trim) return null;
    const norm = trim.toLowerCase();
    const unitMap = {
      '1_kg': '1_kg', '1 кг': '1_kg', '1 kg': '1_kg', '1кг': '1_kg', '1kg': '1_kg', '១ គីឡូ': '1_kg',
      '500_g': '500_g', '500 г': '500_g', '500 g': '500_g', '500г': '500_g', '500g': '500_g', '៥០០ ក្រាម': '500_g',
      '250_g': '250_g', '250 г': '250_g', '250 g': '250_g', '250г': '250_g', '250g': '250_g', '២៥០ ក្រាម': '250_g',
      '100_g': '100_g', '100 г': '100_g', '100 g': '100_g', '100г': '100_g', '100g': '100_g', '១០០ ក្រាម': '100_g',
      '1_pc': '1_pc', '1 шт': '1_pc', '1 pc': '1_pc', '1шт': '1_pc', '1pc': '1_pc', '១ ផ្លែ': '1_pc', '១ ដើម': '1_pc', '១ ផ្លែ/ដើម': '1_pc',
      '1_bunch': '1_bunch', '1 пучок': '1_bunch', '1 bunch': '1_bunch', '1пучок': '1_bunch', '១ ដុំ': '1_bunch', '១ បាច់': '1_bunch', '១ ដុំ/បាច់': '1_bunch',
      '1_pack': '1_pack', '1 упак': '1_pack', '1 pack': '1_pack', '1 упаковка': '1_pack', '១ កញ្ចប់': '1_pack',
      '1_tray': '1_tray', '1 лоток': '1_tray', '1 tray': '1_tray', '១ ថាស': '1_tray',
      '1_bottle': '1_bottle', '1 бут': '1_bottle', '1 bottle': '1_bottle', '1 бутылка': '1_bottle', '១ ដប': '1_bottle',
      '0_2_l': '0_2_l', '0.2 л': '0_2_l', '0.2л': '0_2_l', '0.2 l': '0_2_l', '0.2l': '0_2_l', '0.2 bottle': '0_2_l', '0.2 бут': '0_2_l', '០.២ ល': '0_2_l',
      '0_5_l': '0_5_l', '0.5 л': '0_5_l', '0.5л': '0_5_l', '0.5 l': '0_5_l', '0.5l': '0_5_l', '0.5 bottle': '0_5_l', '0.5 бут': '0_5_l', '០.៥ ល': '0_5_l',
      '0_7_l': '0_7_l', '0.7 л': '0_7_l', '0.7л': '0_7_l', '0.7 l': '0_7_l', '0.7l': '0_7_l', '0.7 bottle': '0_7_l', '0.7 бут': '0_7_l', '០.៧ ល': '0_7_l',
      '1_l': '1_l', '1 л': '1_l', '1л': '1_l', '1 l': '1_l', '1l': '1_l', '1.0 л': '1_l', '1.0 l': '1_l', '1 литр': '1_l', '១ ល': '1_l',
      '10_pcs': '10_pcs', '10 шт': '10_pcs', '10 pcs': '10_pcs', '10шт': '10_pcs', '10pcs': '10_pcs', 'десяток': '10_pcs', '១០ គ្រាប់': '10_pcs',
      'kg': 'kg', 'кг': 'kg', 'គីឡូ': 'kg',
      'g': 'g', 'г': 'g', 'ក្រាម': 'g',
      'pc': 'pc', 'шт': 'pc', 'ផ្លែ/ដើម': 'pc',
      'bunch': 'bunch', 'пучок': 'bunch', 'ដុំ/បាច់': 'bunch',
      'pack': 'pack', 'упак': 'pack', 'упаковка': 'pack', 'កញ្ចប់': 'pack'
    };
    const key = unitMap[norm] || null;
    let label = trim;
    if (key && window.i18n && typeof window.i18n.t === 'function') {
      const trans = window.i18n.t(`units.${key}`);
      if (trans && trans !== `units.${key}`) {
        label = trans;
      }
    }
    return { key: key || norm, label };
  }

  renderPriceBadge(price, unit = '') {
    if (price !== null && price !== undefined && price !== '' && !isNaN(Number(price))) {
      const khr = Number(price);
      const usd = (khr / this.khrRate).toFixed(2);
      const uInfo = this.getUnitInfo(unit);
      const unitLabel = uInfo ? uInfo.label : unit;
      const unitKey = uInfo ? uInfo.key : '';
      const unitSuffix = unitLabel ? ` / <span class="badge-unit-text" ${unitKey ? `data-unit-id="${this.escapeHtml(unitKey)}" data-i18n="units.${this.escapeHtml(unitKey)}"` : ''}>${this.escapeHtml(unitLabel)}</span>` : '';
      return `
        <div class="card-price-badge">
          <span class="price-khr">${Math.round(khr).toLocaleString('en-US')} ៛${unitSuffix}</span>
          <span class="price-usd">~$${usd}</span>
        </div>
      `;
    }
    return `
      <div class="card-price-badge price-na">
        <span class="price-na">n/a</span>
      </div>
    `;
  }

  getLocalizedProductName(item, lang = null) {
    if (!item) return '';
    const currentLang = (lang || (window.i18n ? window.i18n.currentLang : 'ru')).toLowerCase();

    if (currentLang === 'ua' || currentLang === 'uk') {
      return item.name_ua || item.ua || item.name_ru || item.ru || item.name_en || item.en || '';
    }
    if (currentLang === 'fr') {
      return item.name_fr || item.fr || item.name_en || item.en || item.name_ru || item.ru || '';
    }
    if (currentLang === 'en') {
      return item.name_en || item.en || item.name_ru || item.ru || '';
    }
    if (currentLang === 'km') {
      return item.name_km || item.name_kh || item.kh || item.name_en || item.en || '';
    }
    // Default: Russian
    return item.name_ru || item.ru || item.name_en || item.en || '';
  }

  getKhmerSubtitle(item) {
    if (!item) return '';
    return item.name_kh || item.name_km || item.kh || '';
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

    // Filter by Search Query (EN, KH, RU, UA, FR)
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter((p) => {
        const en = (p.name_en || p.en || '').toLowerCase();
        const kh = (p.name_kh || p.name_km || p.kh || '').toLowerCase();
        const ru = (p.name_ru || p.ru || '').toLowerCase();
        const ua = (p.name_ua || p.ua || '').toLowerCase();
        const fr = (p.name_fr || p.fr || '').toLowerCase();
        const cat = (p.category || p.cat || '').toLowerCase();
        const desc = (p.description || p.desc || '').toLowerCase();
        return en.includes(q) ||
          kh.includes(q) ||
          ru.includes(q) ||
          ua.includes(q) ||
          fr.includes(q) ||
          cat.includes(q) ||
          desc.includes(q);
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

    this.applyShopLayout();

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
      const catId = catObj ? catObj.id : (item.category || 'other');
      const catName = catObj ? (window.i18n ? window.i18n.t(`categories.${catObj.id}`) : catObj.name) : (item.category || (window.i18n ? window.i18n.t('common.product') : 'Продукт'));
      const optionsConfig = this.getProductOptions(item);
      const currentSelectedQty = inCart ? cartItem.qty : '';
      const formInfo = this.getFormInfo(item.form);

      const primaryName = this.getLocalizedProductName(item);
      const khmerName = this.getKhmerSubtitle(item);

      // 1. Photo & Interactive Options Viewport Block
      const photoBlock = `
        <div class="card-slider-viewport">
          <div class="card-slider-track">
            <!-- Slide 1: Main View (Photo with inside In-Cart Badge & Price) -->
            <div class="card-slide card-slide-main">
              ${item.img_url ? `
                <div class="card-photo-container" data-id="${item.id}" title="${inCart ? editOrderTitle : addToCartTitle}">
                  <img src="${item.img_url}" class="card-photo-full" alt="${this.escapeHtml(primaryName)}" loading="lazy" />
                  ${inCart ? `<span class="badge-in-cart" id="badge_${item.id}">✓ ${this.escapeHtml(qtyText)}</span>` : `<span class="badge-in-cart" id="badge_${item.id}" style="display: none;"></span>`}
                  ${this.renderPriceBadge(item.price, item.unit)}
                </div>
              ` : `
                <div class="card-photo-container" data-id="${item.id}" style="display: flex; align-items: center; justify-content: center; font-size: 52px;" title="${inCart ? editOrderTitle : addToCartTitle}">
                  ${catIcon}
                  ${inCart ? `<span class="badge-in-cart" id="badge_${item.id}">✓ ${this.escapeHtml(qtyText)}</span>` : `<span class="badge-in-cart" id="badge_${item.id}" style="display: none;"></span>`}
                  ${this.renderPriceBadge(item.price, item.unit)}
                </div>
              `}
            </div>

            <!-- Slide 2: Options Selection View -->
            <div class="card-slide card-slide-options">
              <div class="card-options-header">
                <div class="card-options-title">${selectQtyTitle}</div>
              </div>

              <div class="card-options-grid" data-id="${item.id}">
                ${optionsConfig.options.map((opt) => `
                  <button type="button" class="option-chip ${currentSelectedQty === opt ? 'active' : ''}" data-id="${item.id}" data-val="${opt}">
                    ${opt}
                  </button>
                `).join('')}
              </div>

              <div class="card-options-actions">
                ${inCart ? `
                  <button type="button" class="btn-options-remove" data-id="${item.id}" title="${removeBtnTitle}">
                    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
                ` : ''}
                <button type="button" class="btn-options-cancel" data-id="${item.id}" title="${backBtnText}">✕</button>
              </div>
            </div>
          </div>
        </div>
      `;

      // 2. Product Names Block: Primary localized title + Khmer subtitle with phonetic transcription
      const namesBlock = `
        <div class="card-names-block">
          <div class="card-header-row">
            <div class="card-name-title-wrap">
              <div class="card-name-en card-name-primary">${this.escapeHtml(primaryName)}</div>
            </div>
          </div>
          ${khmerName ? `<div class="card-name-kh khmer-font">${this.escapeHtml(khmerName)}</div>` : ''}
        </div>
      `;

      // 3. Badges Block (Category Icon & Form Badge)
      const badgesBlock = `
        <div class="card-badges">
          <span class="badge badge-category" data-cat-id="${this.escapeHtml(catId)}" title="${this.escapeHtml(catName)}" aria-label="${this.escapeHtml(catName)}">
            <span class="badge-cat-icon">${catIcon}</span>
          </span>
          ${formInfo ? `
            <span class="badge badge-form" ${formInfo.key ? `data-form-id="${this.escapeHtml(formInfo.key)}" data-i18n="forms.${this.escapeHtml(formInfo.key)}"` : ''}>${this.escapeHtml(formInfo.label)}</span>
          ` : ''}
        </div>
      `;

      return `
        <div class="product-card shop-product-card ${inCart ? 'in-cart' : ''}" data-id="${item.id}">
          ${photoBlock}
          ${namesBlock}
          ${badgesBlock}
        </div>
      `;
    }).join('');

    // 1. Photo Click Handlers -> Open Options Slider
    this.shopProductsGrid.querySelectorAll('.card-photo-container').forEach((photo) => {
      photo.addEventListener('click', (e) => {
        const card = photo.closest('.product-card');
        if (!card) return;
        card.classList.add('is-options-open');
      });
    });

    // 2. Attach Option Chips Click Handlers (1-tap selection & save)
    this.shopProductsGrid.querySelectorAll('.option-chip').forEach((chip) => {
      chip.addEventListener('click', (e) => {
        const id = e.currentTarget.dataset.id;
        const val = e.currentTarget.dataset.val;
        const card = e.currentTarget.closest('.product-card');
        if (!card) return;

        card.querySelectorAll('.option-chip').forEach((c) => c.classList.remove('active'));
        e.currentTarget.classList.add('active');

        const product = this.products.find((p) => p.id === id);
        if (product) {
          this.cart[id] = {
            product: product,
            qty: val
          };
          this.saveCart();

          // Slide back to main photo view
          card.classList.remove('is-options-open');
          card.classList.add('in-cart');

          // Update badge inside photo container
          const badge = card.querySelector(`#badge_${id}`);
          if (badge) {
            badge.textContent = `✓ ${val}`;
            badge.style.display = 'inline-flex';
          }

          // Ensure remove button is shown in options actions
          const optActions = card.querySelector('.card-options-actions');
          if (optActions && !optActions.querySelector('.btn-options-remove')) {
            const btnRemove = document.createElement('button');
            btnRemove.type = 'button';
            btnRemove.className = 'btn-options-remove';
            btnRemove.dataset.id = id;
            btnRemove.title = window.i18n ? window.i18n.t('product.remove_btn') : 'Убрать из корзины';
            btnRemove.innerHTML = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
            btnRemove.addEventListener('click', (ev) => {
              ev.stopPropagation();
              this.handleRemoveProductFromCard(card, id);
            });
            optActions.prepend(btnRemove);
          }

          this.showToast(`${window.i18n ? window.i18n.t('toasts.item_added') : '✅ В корзине'}: ${this.getLocalizedProductName(product)} (${val})`);
        }
      });
    });

    // 3. Remove Button Click Handlers in Options
    this.shopProductsGrid.querySelectorAll('.btn-options-remove').forEach((btnRemove) => {
      btnRemove.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = e.currentTarget.dataset.id;
        const card = e.currentTarget.closest('.product-card');
        if (card) {
          this.handleRemoveProductFromCard(card, id);
        }
      });
    });

    // 4. Cancel / Back Button Click Handlers
    this.shopProductsGrid.querySelectorAll('.btn-options-cancel').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = e.currentTarget.closest('.product-card');
        if (!card) return;
        card.classList.remove('is-options-open');
      });
    });
  }

  handleRemoveProductFromCard(card, id) {
    this.removeFromCart(id, false);
    if (card) {
      card.classList.remove('is-options-open', 'in-cart');
      const badge = card.querySelector(`#badge_${id}`);
      if (badge) badge.style.display = 'none';
      card.querySelectorAll('.option-chip').forEach((c) => c.classList.remove('active'));
      card.querySelector('.btn-options-remove')?.remove();
    }
    this.showToast(window.i18n ? window.i18n.t('toasts.item_removed') : '🗑️ Товар убран из корзины');
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
    this.showToast(`${window.i18n ? window.i18n.t('toasts.item_added') : 'Добавлено'}: ${this.getLocalizedProductName(product)}`);
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
        <div class="empty-state">
          <div class="empty-icon">🛒</div>
          <div class="empty-title">${emptyTitle}</div>
          <div class="empty-desc">${emptyDesc}</div>
          <button type="button" class="btn btn-primary" id="btnCartEmptyToCatalog">${toCatalogBtn}</button>
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
          <div class="cart-item-name">${this.escapeHtml(this.getLocalizedProductName(product))}</div>
          <div class="cart-item-kh khmer-font">${this.escapeHtml(this.getKhmerSubtitle(product))}</div>
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
      service_fee: 0.00,
      delivery_fee: 1.00,
      grand_total: 1.00,
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
        <div class="empty-state">
          <div class="empty-icon">📋</div>
          <div class="empty-title">${emptyOrdersTitle}</div>
          <div class="empty-desc">${emptyOrdersDesc}</div>
          <button type="button" class="btn btn-primary" id="btnOrdersEmptyToCatalog">${toCatalogBtn}</button>
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
              <div>${feeDeliveryLabel} <b>$${(Number(order.service_fee || 0) + Number(order.delivery_fee || 1.0)).toFixed(2)}</b></div>
            </div>
            <div class="order-grand-total">
              ${totalLabel} <b>$${Number(order.grand_total || (Number(order.market_items_total || 0) + Number(order.service_fee || 0) + Number(order.delivery_fee || 1.0))).toFixed(2)}</b>
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

    const t = (key, fallback) => (window.i18n ? window.i18n.t(key) : fallback);

    const defaultCustomer = t('common.customer', 'Покупатель');
    const contactsTitle = t('profile.contacts_title', 'Контакты и доставка');
    const langTitle = t('profile.lang_title', 'Язык интерфейса');
    const appTitle = t('profile.app_title', 'Приложение FreshMarket');
    const appOfflineHint = t('profile.app_offline_hint', 'Быстрый доступ к каталогу и сохраненным контактам даже при нестабильной связи.');
    const aboutTitle = t('profile.about_title', 'О сервисе FreshMarket');
    const rulesSchedule = t('profile.rules_schedule', '⏰ Приём заказов до 23:00 • Доставка 9:00–12:00');
    const rulesPricing = t('profile.rules_pricing', '🧾 Оплата: Чеки с рынка + сервисный сбор 10% + доставка ($1 / $2 / $3)');
    const accountTitle = t('profile.account_title', 'Аккаунт и вход');
    const statusOnline = t('profile.status_online', 'В сети');
    const statusGuest = t('profile.status_guest', 'Гость');

    const messengerLabelText = t('profile.messenger_label', 'Предпочтительный мессенджер для связи *:');
    const tgPill = t('profile.messenger_telegram', 'Telegram');
    const waPill = t('profile.messenger_whatsapp', 'WhatsApp');
    const phonePill = t('profile.messenger_phone', 'Звонок');
    const addressLabelText = t('profile.address_label', 'Адрес или ориентир доставки по умолчанию:');
    const addressPlaceholderText = t('profile.address_placeholder', 'Улица, дом, квартира, ориентир');
    const saveContactsText = t('profile.save_contacts_btn', 'Сохранить контакты');
    const installAppText = t('profile.install_app_btn', 'Установить приложение');
    const howItWorksText = t('profile.how_it_works_btn', 'Как работает FreshMarket');
    const logoutBtnText = t('profile.logout_btn', 'Выйти из аккаунта');
    const layoutTitle = t('profile.layout_title', 'Вид витрины товаров:');
    const layout2ColsText = t('profile.layout_2_cols', '2 колонки');
    const layout1ColText = t('profile.layout_1_col', '1 колонка');
    const loginIntroText = t('profile.login_intro', 'Войдите через Google или Facebook для связи с закупщиком и оформления заказов:');
    const googleBtnText = t('auth.btn_google', 'Войти через Google');
    const fbBtnText = t('auth.btn_facebook', 'Войти через Facebook');

    const getPhoneLabelAndPlaceholder = (msgType) => {
      if (msgType === 'telegram') {
        return {
          label: t('profile.phone_label_telegram', 'Юзернейм Telegram (@username) или номер *:'),
          placeholder: t('profile.phone_placeholder_telegram', '@username или +855...')
        };
      } else if (msgType === 'whatsapp') {
        return {
          label: t('profile.phone_label_whatsapp', 'Номер телефона WhatsApp (с кодом) *:'),
          placeholder: t('profile.phone_placeholder_whatsapp', '+855 ... (номер WhatsApp)')
        };
      } else {
        return {
          label: t('profile.phone_label_call', 'Номер телефона для звонков *:'),
          placeholder: t('profile.phone_placeholder_call', '+855 ...')
        };
      }
    };

    let currentMessenger = localStorage.getItem('freshmarket_customer_messenger') || 'telegram';
    let phone = localStorage.getItem('freshmarket_customer_phone') || (this.currentUser?.phone || '');
    let address = localStorage.getItem('freshmarket_customer_address') || '';
    const phoneMeta = getPhoneLabelAndPlaceholder(currentMessenger);

    const currentLang = window.i18n?.currentLang || 'ru';
    const langBadges = { ru: '🇷🇺 RU', en: '🇬🇧 EN', fr: '🇫🇷 FR', ua: '🇺🇦 UA', km: '🇰🇭 KM' };
    const activeLangBadge = langBadges[currentLang] || '🇷🇺 RU';

    const isAuthenticated = !!this.currentUser;
    const userName = isAuthenticated ? (this.currentUser.user_metadata?.full_name || this.currentUser.email || defaultCustomer) : defaultCustomer;
    const userEmail = isAuthenticated ? (this.currentUser.email || '') : '';

    this.authModalBody.innerHTML = `
      <div class="profile-view" style="width: 100%;">
        
        <!-- SECTION 1: ACCOUNT & SESSION (Open by default) -->
        <div class="settings-section" id="profileSectionAccount">
          <div class="settings-section-header">
            <div class="settings-section-title">
              <span>${accountTitle}</span>
            </div>
            <div class="settings-section-header-right">
              <span class="badge ${isAuthenticated ? 'badge-success' : 'badge-gray'}">${isAuthenticated ? statusOnline : statusGuest}</span>
              <button type="button" class="btn-card-toggle" title="Свернуть / Развернуть" aria-label="Свернуть / Развернуть">
                <svg class="toggle-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          </div>
          <div class="settings-section-body">
            ${isAuthenticated ? `
              <div style="display: flex; align-items: center; gap: 12px; padding: 6px 0;">
                <div style="font-size: 28px; width: 44px; height: 44px; border-radius: 50%; background: var(--bg-main, #f5f5f7); display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-subtle);">👤</div>
                <div style="overflow: hidden;">
                  <div style="font-weight: 700; font-size: 14.5px; color: var(--text-primary); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${this.escapeHtml(userName)}</div>
                  <div style="font-size: 12px; color: var(--text-muted); text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${this.escapeHtml(userEmail)}</div>
                </div>
              </div>
              <button type="button" class="btn btn-secondary" id="btnLogout" style="width: 100%; margin-top: 6px;">
                ${logoutBtnText}
              </button>
            ` : `
              <div class="auth-intro-text" style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 4px;">
                ${loginIntroText}
              </div>
              <button type="button" class="btn-auth-provider btn-auth-google" id="btnLoginGoogle" style="width: 100%; margin-bottom: 8px;">
                ${googleBtnText}
              </button>
              <button type="button" class="btn-auth-provider btn-auth-facebook" id="btnLoginFacebook" style="width: 100%;">
                ${fbBtnText}
              </button>
            `}
          </div>
        </div>

        <!-- SECTION 2: CONTACTS & DELIVERY (Only for authenticated users, Collapsed by default) -->
        ${isAuthenticated ? `
        <div class="settings-section is-collapsed" id="profileSectionContacts">
          <div class="settings-section-header">
            <div class="settings-section-title">
              <span>${contactsTitle}</span>
            </div>
            <div class="settings-section-header-right">
              <span class="badge badge-success" id="profileContactsBadge">${currentMessenger === 'telegram' ? 'Telegram' : currentMessenger === 'whatsapp' ? 'WhatsApp' : 'Телефон'}</span>
              <button type="button" class="btn-card-toggle" title="Свернуть / Развернуть" aria-label="Свернуть / Развернуть">
                <svg class="toggle-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          </div>
          <div class="settings-section-body">
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
            
            <button type="button" class="btn btn-primary" id="btnSaveProfileDetails" style="margin-top: 6px; width: 100%;">
              ${saveContactsText}
            </button>
          </div>
        </div>
        ` : ''}

        <!-- SECTION 3: INTERFACE LANGUAGE (Collapsed) -->
        <div class="settings-section is-collapsed" id="profileSectionLang">
          <div class="settings-section-header">
            <div class="settings-section-title">
              <span>${langTitle}</span>
            </div>
            <div class="settings-section-header-right">
              <span class="badge badge-primary">${activeLangBadge}</span>
              <button type="button" class="btn-card-toggle" title="Свернуть / Развернуть" aria-label="Свернуть / Развернуть">
                <svg class="toggle-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          </div>
          <div class="settings-section-body">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
              <button type="button" class="filter-pill profile-lang-pill ${currentLang === 'ru' ? 'active' : ''}" data-lang="ru">
                🇷🇺 Русский
              </button>
              <button type="button" class="filter-pill profile-lang-pill ${currentLang === 'en' ? 'active' : ''}" data-lang="en">
                🇬🇧 English
              </button>
              <button type="button" class="filter-pill profile-lang-pill ${currentLang === 'fr' ? 'active' : ''}" data-lang="fr">
                🇫🇷 Français
              </button>
              <button type="button" class="filter-pill profile-lang-pill ${currentLang === 'ua' ? 'active' : ''}" data-lang="ua">
                🇺🇦 Українська
              </button>
              <button type="button" class="filter-pill profile-lang-pill ${currentLang === 'km' ? 'active' : ''}" data-lang="km">
                🇰🇭 ភាសាខ្មែរ
              </button>
            </div>
          </div>
        </div>

        <!-- SECTION 4: APP & PWA (Collapsed) -->
        <div class="settings-section is-collapsed" id="profileSectionApp">
          <div class="settings-section-header">
            <div class="settings-section-title">
              <span>${appTitle}</span>
            </div>
            <div class="settings-section-header-right">
              <span class="badge badge-success">PWA</span>
              <button type="button" class="btn-card-toggle" title="Свернуть / Развернуть" aria-label="Свернуть / Развернуть">
                <svg class="toggle-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          </div>
          <div class="settings-section-body">
            <!-- Showcase Layout Selector -->
            <div class="form-group" style="margin-bottom: 12px;">
              <label class="form-label">${layoutTitle}</label>
              <div class="messenger-selector" id="profileLayoutSelector">
                <button type="button" class="messenger-pill ${this.shopLayout === 'grid-2' ? 'active' : ''}" data-layout="grid-2">
                  ${layout2ColsText}
                </button>
                <button type="button" class="messenger-pill ${this.shopLayout === 'grid-1' ? 'active' : ''}" data-layout="grid-1">
                  ${layout1ColText}
                </button>
              </div>
            </div>

            <p class="form-field-hint" style="margin: 0 0 10px 0;">
              ${appOfflineHint}
            </p>
            <button type="button" class="btn btn-primary" id="btnInstallAppUser" style="width: 100%;">
              ${installAppText}
            </button>
          </div>
        </div>

        <!-- SECTION 5: SERVICE RULES (Collapsed) -->
        <div class="settings-section is-collapsed" id="profileSectionAbout">
          <div class="settings-section-header">
            <div class="settings-section-title">
              <span>${aboutTitle}</span>
            </div>
            <div class="settings-section-header-right">
              <button type="button" class="btn-card-toggle" title="Свернуть / Развернуть" aria-label="Свернуть / Развернуть">
                <svg class="toggle-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          </div>
          <div class="settings-section-body">
            <div style="font-size: 13px; color: var(--text-secondary); line-height: 1.5; display: flex; flex-direction: column; gap: 6px;">
              <div>${rulesSchedule}</div>
              <div>${rulesPricing}</div>
            </div>
            <button type="button" class="btn btn-secondary" id="btnShowOnboardingFromProfile" style="width: 100%; margin-top: 4px;">
              ${howItWorksText}
            </button>
          </div>
        </div>

      </div>
    `;

    // Accordion expand/collapse click handlers
    this.authModalBody.querySelectorAll('.settings-section-header').forEach((header) => {
      header.addEventListener('click', () => {
        const section = header.closest('.settings-section');
        if (section) section.classList.toggle('is-collapsed');
      });
    });

    // Language pills selection handler
    this.authModalBody.querySelectorAll('.profile-lang-pill').forEach((btn) => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        if (window.i18n && typeof window.i18n.setLanguage === 'function') {
          window.i18n.setLanguage(lang);
        }
      });
    });

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
        const badge = document.getElementById('profileContactsBadge');
        if (badge) {
          badge.textContent = currentMessenger === 'telegram' ? 'Telegram' : currentMessenger === 'whatsapp' ? 'WhatsApp' : 'Телефон';
        }
      });
    });

    // Save Contacts click handler
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

    // Layout selector pill click handler
    const layoutSelector = document.getElementById('profileLayoutSelector');
    layoutSelector?.querySelectorAll('.messenger-pill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        layoutSelector.querySelectorAll('.messenger-pill').forEach((b) => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        this.shopLayout = e.currentTarget.dataset.layout;
        localStorage.setItem('freshmarket_shop_layout', this.shopLayout);
        this.applyShopLayout();
        this.showToast(window.i18n ? window.i18n.t('toasts.settings_saved') : '✅ Настройки сохранены', 'info', 2000);
      });
    });

    // Install App click handler
    document.getElementById('btnInstallAppUser')?.addEventListener('click', () => {
      this.triggerInstallPrompt();
    });

    // Onboarding / How It Works click handler
    document.getElementById('btnShowOnboardingFromProfile')?.addEventListener('click', () => {
      this.openOnboarding();
    });

    // Logout click handler
    document.getElementById('btnLogout')?.addEventListener('click', async () => {
      if (this.sb) await this.sb.auth.signOut();
      this.currentUser = null;
      this.updateUserAvatar();
      this.renderProfileView();
      this.showToast(window.i18n ? window.i18n.t('toasts.logged_out') : 'Вы вышли из профиля');
    });

    // OAuth Login click handlers
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
