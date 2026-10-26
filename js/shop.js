/**
 * FreshMarket — Client Shop Application (shop.js)
 * Architecture: Vanilla JS + Supabase Client + PWA Ready
 */

const SHOP_VERSION = '1.5.0';
window.SHOP_VERSION = SHOP_VERSION;

const FAB_ICONS = {
  cart: `<svg class="fab-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path></svg>`,
  close: `<svg class="fab-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`,
  confirm: `<svg class="fab-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  edit: `<svg class="fab-svg" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#ffffff" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>`,
  trash: `<svg class="fab-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>`
};

// Categories Configuration (inherits from shared categories.js or falls back)
const CATEGORIES = (Array.isArray(window.FRESHMARKET_CATEGORIES) && window.FRESHMARKET_CATEGORIES.length > 0)
  ? window.FRESHMARKET_CATEGORIES
  : [
    { id: 'all', name: 'Все', icon: '🧺', img: 'assets/categories/all.png' },
    { id: 'vegetables', name: 'Овощи', icon: '🥦', img: 'assets/categories/vegetables.png' },
    { id: 'roots_tubers', name: 'Корнеплоды', icon: '🥔', img: 'assets/categories/roots_tubers.png' },
    { id: 'fruits', name: 'Фрукты', icon: '🥭', img: 'assets/categories/fruits.png' },
    { id: 'herbs', name: 'Зелень и травы', icon: '🌿', img: 'assets/categories/herbs.png' },
    { id: 'spices_roots', name: 'Корни и пряности', icon: '🫚', img: 'assets/categories/spices_roots.png' },
    { id: 'seafood', name: 'Морепродукты и рыба', icon: '🐟', img: 'assets/categories/seafood.png' },
    { id: 'meat', name: 'Мясо и птица', icon: '🥩', img: 'assets/categories/meat.png' },
    { id: 'sauces', name: 'Соусы и бакалея', icon: '🥫', img: 'assets/categories/sauces.png' },
    { id: 'mushrooms', name: 'Грибы', icon: '🍄', img: 'assets/categories/mushrooms.png' },
    { id: 'homemade', name: 'Домашние продукты', icon: '🍯', img: 'assets/categories/homemade.png' },
    { id: 'other', name: 'Другое', icon: '📦', img: 'assets/categories/other.png' }
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
    this.produceDictionary = [];
    this.selectedCategory = 'all';
    this.searchQuery = '';
    this.activeHomeTab = localStorage.getItem('freshmarket_home_tab') || 'categories';
    this.cart = this.loadCart();
    this.currentUser = null;
    this.userProfile = null;
    this.initialCartSynced = false;
    this.cloudCartDebounceTimer = null;
    this.realtimeCartChannel = null;
    this.currentSlide = 0;
    this.khrRate = this.getKhrRate();
    this.shopLayout = localStorage.getItem('freshmarket_shop_layout') || 'grid-2';
    this.isCartAddressCustomized = false;
    this.profileMap = null;
    this.profileCustomerMarker = null;
    this.profileRoutePolyline = null;

    // 0. Synchronous fast recovery of cached customer session and profile
    this.initCachedUser();

    this.initSplashScreen();
    this.initDomElements();
    this.initSupabase();
    this.initEventListeners();
    this.switchView('catalog');
    this.initOnboarding();
    this.loadCatalog();
    this.updateCartUi();
    this.updateHeaderUi();
    this.initServiceWorker();
  }

  initCachedUser() {
    try {
      const rawAuth = localStorage.getItem('freshmarket_customer_auth');
      if (rawAuth) {
        const parsed = JSON.parse(rawAuth);
        if (parsed && parsed.user) {
          this.currentUser = parsed.user;
        }
      }
      const rawProfile = localStorage.getItem('freshmarket_user_profile');
      if (rawProfile) {
        this.userProfile = JSON.parse(rawProfile);
      }
    } catch (_) {}
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
    const fallbackUrl = window.FreshMarketConfig?.SUPABASE_URL || '';
    const fallbackKey = window.FreshMarketConfig?.SUPABASE_ANON_KEY || '';
    const sbUrl = localStorage.getItem('freshmarket_supabase_url') || fallbackUrl;
    const sbKey = localStorage.getItem('freshmarket_supabase_key') || fallbackKey;
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

        // 1. Explicit immediate session check (handles page reload & cached tokens)
        this.checkInitialSession();

        // 2. Real-time auth state changes (login, logout, token refresh)
        this.sb.auth.onAuthStateChange(async (event, session) => {
          this.currentUser = session?.user || null;
          this.updateUserAvatar();
          if (this.currentUser) {
            this.setupRealtimeProfileSync();
            await this.loadUserProfileAndSyncCart();
          } else {
            this.teardownRealtimeProfileSync();
            this.userProfile = null;
            localStorage.removeItem('freshmarket_user_profile');
            localStorage.removeItem('freshmarket_cart_synced_user');
            this.updateUserAvatar();
          }
          if (this.currentView === 'profile') {
            this.renderProfileView();
          } else if (this.currentView === 'cart') {
            this.renderCartModalList();
            this.prefillCheckoutData();
          }
        });
      } catch (err) {
        console.warn('[FreshMarket Shop] Supabase client init error:', err);
      }
    }
  }

  async checkInitialSession() {
    if (!this.sb) return;
    try {
      const { data: { session }, error } = await this.sb.auth.getSession();
      if (!error && session?.user) {
        this.currentUser = session.user;
        this.updateUserAvatar();
        this.setupRealtimeProfileSync();
        await this.loadUserProfileAndSyncCart();
      } else if (!session) {
        // If Supabase confirms no active session, clear guest cache
        if (this.currentUser) {
          this.teardownRealtimeProfileSync();
          this.currentUser = null;
          this.userProfile = null;
          localStorage.removeItem('freshmarket_user_profile');
          localStorage.removeItem('freshmarket_cart_synced_user');
          this.updateUserAvatar();
        }
      }
    } catch (err) {
      console.warn('[FreshMarket Shop] Initial session check error:', err);
    }
  }

  // ------------------------------------------------------------------------
  // 2. User Profile & Cross-Device Cart Synchronization
  // ------------------------------------------------------------------------
  async loadUserProfileAndSyncCart() {
    if (!this.sb || !this.currentUser) return;
    if (this.isSyncingAuthCart) return;
    this.isSyncingAuthCart = true;

    try {
      const { data: profile, error } = await this.sb
        .from('profiles')
        .select('*')
        .eq('id', this.currentUser.id)
        .maybeSingle();

      if (error) {
        console.warn('[FreshMarket Shop] Error fetching profile:', error);
        this.updateUserAvatar();
        return;
      }

      if (!profile) {
        const nowIso = new Date().toISOString();
        const newProfile = {
          id: this.currentUser.id,
          email: this.currentUser.email || '',
          full_name: this.currentUser.user_metadata?.full_name || this.currentUser.user_metadata?.name || '',
          avatar_url: this.currentUser.user_metadata?.avatar_url || this.currentUser.user_metadata?.picture || '',
          messenger: localStorage.getItem('freshmarket_customer_messenger') || 'telegram',
          phone: localStorage.getItem('freshmarket_customer_phone') || '',
          address: localStorage.getItem('freshmarket_customer_address') || '',
          preferred_lang: window.i18n?.currentLang || 'ru',
          onboarding_completed: localStorage.getItem('freshmarket_hide_onboarding') === 'true',
          shop_layout: this.shopLayout || 'grid-2',
          default_replacement_policy: localStorage.getItem('freshmarket_replacement_policy') || 'call_to_agree',
          cart: this.cart || {},
          cart_updated_at: nowIso,
          updated_at: nowIso
        };
        await this.sb.from('profiles').upsert(newProfile);
        this.userProfile = newProfile;
        localStorage.setItem('freshmarket_user_profile', JSON.stringify(newProfile));
        localStorage.setItem('freshmarket_cart_synced_user', this.currentUser.id);
        this.updateUserAvatar();
        return;
      }

      this.userProfile = profile;
      if (!profile.avatar_url) {
        const oauthAvatar = this.currentUser.user_metadata?.avatar_url || this.currentUser.user_metadata?.picture;
        if (oauthAvatar) {
          profile.avatar_url = oauthAvatar;
          this.updateProfileField({ avatar_url: oauthAvatar });
        }
      }
      localStorage.setItem('freshmarket_user_profile', JSON.stringify(profile));

      // 1. Sync contacts to localStorage
      if (profile.messenger) {
        localStorage.setItem('freshmarket_customer_messenger', profile.messenger);
      }
      if (profile.phone) {
        localStorage.setItem('freshmarket_customer_phone', profile.phone);
      }
      if (profile.address) {
        localStorage.setItem('freshmarket_customer_address', profile.address);
      }

      // 2. Cross-device Preferences Synchronization
      // A. Preferred Language
      if (profile.preferred_lang && window.i18n && window.i18n.currentLang !== profile.preferred_lang) {
        window.i18n.setLanguage(profile.preferred_lang);
      }

      // B. Onboarding Completed State
      if (profile.onboarding_completed) {
        localStorage.setItem('freshmarket_hide_onboarding', 'true');
        if (this.onboardingOverlay && this.onboardingOverlay.style.display !== 'none') {
          this.closeOnboarding();
        }
      }

      // C. Shop Layout (grid-1 / grid-2)
      if (profile.shop_layout && (profile.shop_layout === 'grid-1' || profile.shop_layout === 'grid-2')) {
        this.shopLayout = profile.shop_layout;
        localStorage.setItem('freshmarket_shop_layout', profile.shop_layout);
        this.applyShopLayout();
      }

      // D. Default Replacement Policy
      if (profile.default_replacement_policy) {
        localStorage.setItem('freshmarket_replacement_policy', profile.default_replacement_policy);
        const radio = document.querySelector(`input[name="replacementPolicy"][value="${profile.default_replacement_policy}"]`);
        if (radio) radio.checked = true;
      }

      // 3. Cross-device Cart Synchronization with Guaranteed Guest Cart Protection
      const cloudCart = (profile.cart && typeof profile.cart === 'object' && !Array.isArray(profile.cart))
        ? profile.cart
        : {};

      const cloudKeys = Object.keys(cloudCart);
      const localKeys = Object.keys(this.cart || {});
      const syncedUserKey = 'freshmarket_cart_synced_user';
      const lastSyncedUser = localStorage.getItem(syncedUserKey);
      const localUpdatedAt = parseInt(localStorage.getItem('freshmarket_cart_updated_at') || '0', 10);
      const cloudUpdatedAt = profile.cart_updated_at
        ? new Date(profile.cart_updated_at).getTime()
        : (profile.updated_at ? new Date(profile.updated_at).getTime() : 0);

      const isFirstLoginOnDevice = lastSyncedUser !== this.currentUser.id;

      if (isFirstLoginOnDevice) {
        // === СЦЕНАРИЙ 1: Первичная авторизация гостя на этом устройстве ===
        if (localKeys.length > 0 && cloudKeys.length === 0) {
          // Гость набрал товары до входа, в облаке пусто: сохраняем гостевую корзину в облако
          const now = Date.now();
          localStorage.setItem('freshmarket_cart', JSON.stringify(this.cart));
          localStorage.setItem('freshmarket_cart_updated_at', String(now));
          this.updateCartUi();
          this.renderProducts();
          if (this.currentView === 'cart') this.renderCartModalList();
          this.syncCartToCloud(true);
        } else if (localKeys.length > 0 && cloudKeys.length > 0) {
          // И у гостя есть товары, и в облаке есть корзина: объединяем, чтобы не потерять добавленное до логина
          const mergedCart = { ...cloudCart, ...this.cart };
          this.cart = mergedCart;
          const now = Date.now();
          localStorage.setItem('freshmarket_cart', JSON.stringify(mergedCart));
          localStorage.setItem('freshmarket_cart_updated_at', String(now));
          this.updateCartUi();
          this.renderProducts();
          if (this.currentView === 'cart') this.renderCartModalList();
          this.syncCartToCloud(true);
        } else if (localKeys.length === 0 && cloudKeys.length > 0) {
          // Локальная корзина пуста: подгружаем облачную корзину
          this.cart = cloudCart;
          localStorage.setItem('freshmarket_cart', JSON.stringify(cloudCart));
          localStorage.setItem('freshmarket_cart_updated_at', String(cloudUpdatedAt || Date.now()));
          this.updateCartUi();
          this.renderProducts();
          if (this.currentView === 'cart') this.renderCartModalList();
        }
        localStorage.setItem(syncedUserKey, this.currentUser.id);
      } else {
        // === СЦЕНАРИЙ 2: Регулярная синхронизация уже авторизованного аккаунта (Cross-Device LWW) ===
        const localCartStr = JSON.stringify(this.cart || {});
        const cloudCartStr = JSON.stringify(cloudCart);

        if (localCartStr !== cloudCartStr) {
          if (cloudUpdatedAt >= localUpdatedAt) {
            // Облако новее или равно: применяем актуальное состояние из БД (удаление товаров или очистка после заказа)
            this.cart = cloudCart;
            localStorage.setItem('freshmarket_cart', cloudCartStr);
            localStorage.setItem('freshmarket_cart_updated_at', String(cloudUpdatedAt || Date.now()));
            this.updateCartUi();
            this.renderProducts();
            if (this.currentView === 'cart') this.renderCartModalList();
          } else {
            // Локальные изменения новее: отправляем их в облако
            this.syncCartToCloud(true);
          }
        }
      }

      localStorage.setItem(syncedUserKey, this.currentUser.id);
      this.updateUserAvatar();
    } catch (err) {
      console.warn('[FreshMarket Shop] Error syncing profile & cart:', err);
    } finally {
      this.isSyncingAuthCart = false;
    }
  }

  async updateProfileField(fields) {
    if (!this.sb || !this.currentUser) return;
    try {
      await this.sb.from('profiles').update({
        ...fields,
        updated_at: new Date().toISOString()
      }).eq('id', this.currentUser.id);
      if (this.userProfile) {
        Object.assign(this.userProfile, fields);
      }
    } catch (err) {
      console.warn('[FreshMarket Shop] Error updating profile fields:', err);
    }
  }

  syncCartToCloud(immediate = false) {
    if (!this.sb || !this.currentUser) return;
    if (this.cloudCartDebounceTimer) {
      clearTimeout(this.cloudCartDebounceTimer);
      this.cloudCartDebounceTimer = null;
    }

    const doSync = async () => {
      try {
        const cartPayload = (this.cart && typeof this.cart === 'object') ? this.cart : {};
        const nowIso = new Date().toISOString();
        const nowMs = new Date(nowIso).getTime();

        // 1. Try direct update first (updating cart_updated_at dedicated timestamp)
        const { error: updateErr } = await this.sb
          .from('profiles')
          .update({
            cart: cartPayload,
            cart_updated_at: nowIso,
            updated_at: nowIso
          })
          .eq('id', this.currentUser.id);

        if (updateErr) {
          // 2. If update failed (e.g. profile row does not exist yet), try upsert
          const { error: upsertErr } = await this.sb
            .from('profiles')
            .upsert({
              id: this.currentUser.id,
              cart: cartPayload,
              cart_updated_at: nowIso,
              updated_at: nowIso
            }, { onConflict: 'id' });
          if (upsertErr) {
            console.warn('[FreshMarket Shop] Failed to sync cart to cloud:', upsertErr);
          } else {
            localStorage.setItem('freshmarket_cart_updated_at', String(nowMs));
          }
        } else {
          localStorage.setItem('freshmarket_cart_updated_at', String(nowMs));
        }
      } catch (err) {
        console.warn('[FreshMarket Shop] Error syncing cart to cloud:', err);
      }
    };

    if (immediate) {
      doSync();
    } else {
      this.cloudCartDebounceTimer = setTimeout(doSync, 200);
    }
  }

  setupRealtimeProfileSync() {
    if (!this.sb || !this.currentUser) return;
    if (this.realtimeCartChannel) {
      try {
        this.sb.removeChannel(this.realtimeCartChannel);
      } catch (_) {}
      this.realtimeCartChannel = null;
    }

    try {
      this.realtimeCartChannel = this.sb.channel(`cart-sync-${this.currentUser.id}`)
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${this.currentUser.id}`
        }, (payload) => {
          if (payload?.new) {
            this.handleRemoteProfileUpdate(payload.new);
          }
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[FreshMarket Shop] Realtime profile sync active');
          }
        });
    } catch (err) {
      console.warn('[FreshMarket Shop] Could not initialize realtime channel:', err);
    }
  }

  teardownRealtimeProfileSync() {
    if (this.realtimeCartChannel && this.sb) {
      try {
        this.sb.removeChannel(this.realtimeCartChannel);
      } catch (_) {}
      this.realtimeCartChannel = null;
    }
  }

  handleRemoteProfileUpdate(remoteProfile) {
    if (this.isSyncingAuthCart) return;
    if (!remoteProfile || !this.currentUser || remoteProfile.id !== this.currentUser.id) return;

    const cloudCart = (remoteProfile.cart && typeof remoteProfile.cart === 'object' && !Array.isArray(remoteProfile.cart))
      ? remoteProfile.cart
      : {};

    const localCartStr = JSON.stringify(this.cart || {});
    const cloudCartStr = JSON.stringify(cloudCart);
    const cloudUpdatedAt = remoteProfile.cart_updated_at
      ? new Date(remoteProfile.cart_updated_at).getTime()
      : (remoteProfile.updated_at ? new Date(remoteProfile.updated_at).getTime() : 0);
    const localUpdatedAt = parseInt(localStorage.getItem('freshmarket_cart_updated_at') || '0', 10);

    // Применяем удаленное состояние только если оно новее локального (LWW, включая очистку после заказа на другом устройстве)
    if (localCartStr !== cloudCartStr && cloudUpdatedAt > localUpdatedAt) {
      this.cart = cloudCart;
      localStorage.setItem('freshmarket_cart', cloudCartStr);
      localStorage.setItem('freshmarket_cart_updated_at', String(cloudUpdatedAt));
      this.updateCartUi();
      this.renderProducts();
      if (this.currentView === 'cart') {
        this.renderCartModalList();
        this.prefillCheckoutData();
      }
    }
  }



  // ------------------------------------------------------------------------
  // 3. DOM Elements & Navigation
  // ------------------------------------------------------------------------
  initDomElements() {
    // Header Actions & Search
    this.headerLangPicker = document.getElementById('headerLangPicker');
    this.headerCartBtn = document.getElementById('headerCartBtn');
    this.headerCartBadge = document.getElementById('headerCartBadge');
    this.headerAvatarBtn = document.getElementById('headerAvatarBtn');
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
    this.setHomeTab(this.activeHomeTab, false);

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

    // Product Bottom Sheet Elements
    this.productBottomSheet = document.getElementById('productBottomSheet');
    this.sheetBtnClose = document.getElementById('sheetBtnClose');
    this.sheetBtnRemove = document.getElementById('sheetBtnRemove');
    this.sheetBtnSubmit = document.getElementById('sheetBtnSubmit');
    this.sheetProductMedia = document.getElementById('sheetProductMedia');
    this.sheetProductName = document.getElementById('sheetProductName');
    this.sheetProductKhmer = document.getElementById('sheetProductKhmer');
    this.sheetPriceUsd = document.getElementById('sheetPriceUsd');
    this.sheetPriceKhr = document.getElementById('sheetPriceKhr');
    this.sheetFormBadge = document.getElementById('sheetFormBadge');
    this.sheetOptionsGrid = document.getElementById('sheetOptionsGrid');
    this.sheetCommentInput = document.getElementById('sheetCommentInput');
    this.sheetTagsRow = document.getElementById('sheetTagsRow');

    // Floating Cart Bar Elements
    this.floatingCartBar = document.getElementById('floatingCartBar');
    this.floatingCartCount = document.getElementById('floatingCartCount');
    this.floatingCartTotal = document.getElementById('floatingCartTotal');
    this.btnFloatingToCart = document.getElementById('btnFloatingToCart');
    this.activeSheetProductId = null;
    this.activeSheetSelectedQty = null;

    // Alert / Error Dialog Modal Elements
    this.alertDialog = document.getElementById('alertDialog');
    this.dialogTitle = document.getElementById('dialogTitle');
    this.dialogMessage = document.getElementById('dialogMessage');
    this.dialogBtnOk = document.getElementById('dialogBtnOk');
  }

  // ------------------------------------------------------------------------
  // 4. Event Listeners
  // ------------------------------------------------------------------------
  initEventListeners() {
    // Header Actions
    if (this.headerAvatarBtn) {
      this.headerAvatarBtn.addEventListener('click', () => this.switchView('profile'));
    }
    if (this.headerCartBtn) {
      this.headerCartBtn.addEventListener('click', () => this.switchView('cart'));
    }

    // Profile & Auth
    if (this.btnAuthProfile) {
      this.btnAuthProfile.addEventListener('click', () => this.openAuthModal());
    }

    if (this.btnShopHeaderLogout) {
      this.btnShopHeaderLogout.addEventListener('click', () => this.handleCustomerLogout());
    }

    // Product Bottom Sheet & Floating Bar listeners
    if (this.sheetBtnClose) {
      this.sheetBtnClose.addEventListener('click', () => this.closeProductSheet());
    }
    if (this.productBottomSheet) {
      this.productBottomSheet.addEventListener('click', (e) => {
        if (e.target === this.productBottomSheet) this.closeProductSheet();
      });
    }
    if (this.sheetBtnSubmit) {
      this.sheetBtnSubmit.addEventListener('click', () => this.submitProductSheet());
    }
    if (this.sheetBtnRemove) {
      this.sheetBtnRemove.addEventListener('click', () => this.removeProductFromSheet());
    }
    if (this.btnFloatingToCart) {
      this.btnFloatingToCart.addEventListener('click', () => this.switchView('cart'));
    }
    if (this.sheetTagsRow) {
      this.sheetTagsRow.querySelectorAll('.sheet-tag-btn').forEach((tagBtn) => {
        tagBtn.addEventListener('click', () => {
          const tagKey = tagBtn.dataset.tagKey;
          const tagText = (tagKey && window.i18n ? window.i18n.t(`product.${tagKey}`) : null) || tagBtn.dataset.tag || tagBtn.textContent.trim();
          if (!this.sheetCommentInput) return;
          if (this.sheetCommentInput.value) {
            if (!this.sheetCommentInput.value.includes(tagText)) {
              this.sheetCommentInput.value += ', ' + tagText;
            }
          } else {
            this.sheetCommentInput.value = tagText;
          }
        });
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeProductSheet();
      }
    });

    // i18n Language change reactive re-render
    window.addEventListener('freshmarket:langchange', () => {
      this.renderCategories();
      this.renderProducts();
      this.updateCartUi();
      if (this.productBottomSheet && this.productBottomSheet.style.display === 'flex' && this.activeSheetProductId) {
        this.openProductSheet(this.activeSheetProductId);
      }
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
      if (this.currentDeliveryDistance !== undefined && typeof getDeliveryZoneByDistance === 'function') {
        const currentZoneInfo = getDeliveryZoneByDistance(this.currentDeliveryDistance);
        this.updateDeliveryMapBadge(currentZoneInfo, this.currentDeliveryDistance);
      }
      if (window.i18n) {
        this.showToast(window.i18n.t('toasts.lang_changed'), 'info', 2000);
        if (this.sb && this.currentUser) {
          this.updateProfileField({ preferred_lang: window.i18n.currentLang });
        }
      }
    });

    // Cross-device / Cross-tab focus re-sync (Chrome <-> Safari)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.currentUser && this.sb) {
        this.loadUserProfileAndSyncCart();
      }
    });
    window.addEventListener('focus', () => {
      if (this.currentUser && this.sb) {
        this.loadUserProfileAndSyncCart();
      }
    });

    // Reactive Storage Change listener (Cross-tab synchronization)
    window.addEventListener('storage', (e) => {
      if (e.key === 'freshmarket_khr_rate') {
        this.khrRate = this.getKhrRate();
        this.renderProducts();
      } else if (e.key === 'freshmarket_cart') {
        this.cart = this.loadCart();
        this.updateCartUi();
        this.renderProducts();
        if (this.currentView === 'cart') {
          this.renderCartModalList();
        }
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

      this.checkoutForm.querySelectorAll('input[name="replacementPolicy"]').forEach((r) => {
        r.addEventListener('change', (e) => {
          const val = e.target.value;
          localStorage.setItem('freshmarket_replacement_policy', val);
          this.updateCartPreferencesBadge(val);
          if (this.sb && this.currentUser) {
            this.updateProfileField({ default_replacement_policy: val });
          }
        });
      });

      this.setupDeliveryLocationHandlers();
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
        if (this.currentView === 'catalog') {
          this.setHomeTab('categories');
          this.selectedCategory = 'all';
          this.renderCategories();
          this.renderProducts();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          this.switchView('catalog');
        }
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
    if (viewName === 'orders' && !this.isUserAuthenticated()) {
      viewName = 'catalog';
    }
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
    this.updateFloatingCartBar();

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

  setHomeTab(tabName, save = true) {
    this.activeHomeTab = tabName;
    if (save) {
      try {
        localStorage.setItem('freshmarket_home_tab', tabName);
      } catch (e) {
        console.warn('Could not save home tab to localStorage:', e);
      }
    }
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
      document.body.classList.add('modal-open');
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
      if (this.sb && this.currentUser) {
        this.updateProfileField({ onboarding_completed: true });
      }
    }
    if (this.onboardingOverlay) {
      this.onboardingOverlay.style.display = 'none';
      this.updateModalOpenState();
    }
  }

  // ------------------------------------------------------------------------
  // 6. Catalog Loading & Rendering
  // ------------------------------------------------------------------------
  async loadProduceDictionary() {
    if (this.produceDictionary && this.produceDictionary.length > 0) {
      return this.produceDictionary;
    }
    try {
      let resp = await fetch('./data/products_dictionary.json');
      if (!resp.ok) resp = await fetch('../data/products_dictionary.json');
      if (!resp.ok) resp = await fetch('./products_dictionary.json');
      if (resp.ok) {
        const data = await resp.json();
        const core = Array.isArray(data.core) ? data.core : [];
        const fromDb = Array.isArray(data.from_database) ? data.from_database : [];
        this.produceDictionary = Array.isArray(data) ? data : [...core, ...fromDb];
        return this.produceDictionary;
      }
    } catch (e) {
      console.warn('[FreshMarket Shop] Could not load dictionary:', e);
    }
    this.produceDictionary = [];
    return this.produceDictionary;
  }

  enrichProductsWithDict(products) {
    if (!Array.isArray(products) || products.length === 0) return products;
    if (!this.produceDictionary || this.produceDictionary.length === 0) return products;

    const norm = (s) => (s || '').toLowerCase().trim();

    return products.map((item) => {
      const enName = norm(item.name_en);
      const ruName = norm(item.name_ru);
      const khName = norm(item.name_kh);

      const match = this.produceDictionary.find((d) => {
        const dEn = norm(d.en);
        const dRu = norm(d.ru);
        const dKh = norm(d.kh);

        if (enName && (dEn === enName || dEn.split('/').map(norm).includes(enName))) return true;
        if (ruName && (dRu === ruName || dRu.split('/').map(norm).includes(ruName))) return true;
        if (khName && (dKh === khName || dKh.split('(')[0].trim() === khName.split('(')[0].trim())) return true;
        return false;
      });

      if (match) {
        if (!item.name_ua) item.name_ua = match.ua || match.ru || '';
        if (!item.name_fr) item.name_fr = match.fr || match.en || '';
        if (!item.desc && match.desc) item.desc = match.desc;
      }
      return item;
    });
  }

  async loadCatalog() {
    this.showLoadingState();

    // 1. Check network connectivity
    if (!navigator.onLine) {
      this.showOfflineState();
      return;
    }

    // Load Produce Dictionary to enrich products with UA/FR/KH translations
    await this.loadProduceDictionary();

    // 2. Fetch from Supabase
    if (this.sb) {
      try {
        const { data, error } = await this.sb
          .from('products')
          .select('*')
          .order('category', { ascending: true });

        if (!error && data && data.length > 0) {
          this.products = this.enrichProductsWithDict(data);
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
      const hasI18n = window.i18n && window.i18n.isReady;
      const loadTitle = hasI18n ? window.i18n.t('shop.loading_title') : 'Загрузка свежих продуктов...';
      const loadDesc = hasI18n ? window.i18n.t('shop.loading_desc') : 'Связываемся с базой утреннего рынка';
      this.shopProductsGrid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🥬</div>
          <div class="empty-title" data-i18n="shop.loading_title">${loadTitle}</div>
          <div class="empty-desc" data-i18n="shop.loading_desc">${loadDesc}</div>
        </div>
      `;
    }
  }

  renderCategories() {
    if (!this.shopCategoriesContainer) return;

    // Calculate count per category (case-insensitive & slug resilient)
    const counts = {};
    CATEGORIES.forEach((cat) => {
      if (cat.id === 'all') {
        counts[cat.id] = this.products.length;
      } else {
        const catNorm = (cat.name || '').toLowerCase().trim();
        const idNorm = (cat.id || '').toLowerCase().trim();
        counts[cat.id] = this.products.filter((p) => {
          const pCat = (p.category || '').toLowerCase().trim();
          return pCat === catNorm || pCat === idNorm;
        }).length;
      }
    });

    this.shopCategoriesContainer.innerHTML = CATEGORIES.map((cat) => {
      const count = counts[cat.id] || 0;
      const isActive = this.selectedCategory === cat.id ? 'active' : '';
      const catName = window.i18n ? window.i18n.t(`categories.${cat.id}`) : cat.name;
      return `
        <button type="button" class="filter-pill ${isActive}" data-category="${cat.id}">
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

    // Auto-scroll active pill into view within horizontal container
    const activePill = this.shopCategoriesContainer.querySelector('.filter-pill.active');
    if (activePill && typeof activePill.scrollIntoView === 'function') {
      activePill.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
    }

    // Render Category Cards Grid on Home Screen
    if (this.shopCategoryGrid) {
      const mainCategories = CATEGORIES.filter((c) => c.id !== 'all');
      this.shopCategoryGrid.innerHTML = mainCategories.map((cat) => {
        const count = counts[cat.id] || 0;
        const isActive = this.selectedCategory === cat.id ? 'active' : '';
        const catName = window.i18n ? window.i18n.t(`categories.${cat.id}`) : cat.name;
        return `
          <div class="category-card ${isActive}" data-category="${cat.id}">
            ${count > 0 ? `<span class="cat-card-count">${count}</span>` : ''}
            <div class="cat-card-icon-wrap">
              ${cat.img ? `
                <img src="${cat.img}" class="cat-card-brand-img" alt="${this.escapeHtml(catName)}" loading="lazy" />
              ` : `
                <span class="cat-card-icon">${cat.icon}</span>
              `}
            </div>
            <span class="cat-card-name">${catName}</span>
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
          setTimeout(() => {
            const currentActivePill = this.shopCategoriesContainer?.querySelector('.filter-pill.active');
            if (currentActivePill && typeof currentActivePill.scrollIntoView === 'function') {
              currentActivePill.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
            }
          }, 60);
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

  getKhmerSubtitle(item, lang = null) {
    if (!item) return '';
    const currentLang = (lang || (window.i18n ? window.i18n.currentLang : 'ru')).toLowerCase();
    if (currentLang === 'km') {
      return item.name_en || item.en || '';
    }
    return item.name_kh || item.name_km || item.kh || '';
  }

  renderProducts() {
    if (!this.shopProductsGrid) return;

    let filtered = this.products;

    // Filter by Category (case-insensitive & slug resilient)
    if (this.selectedCategory !== 'all') {
      const selectedCatObj = CATEGORIES.find((c) => c.id === this.selectedCategory);
      const catNorm = (selectedCatObj?.name || '').toLowerCase().trim();
      const idNorm = (selectedCatObj?.id || this.selectedCategory || '').toLowerCase().trim();
      filtered = filtered.filter((p) => {
        const pCat = (p.category || '').toLowerCase().trim();
        return pCat === catNorm || pCat === idNorm;
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
      const catImg = catObj ? catObj.img : null;
      const catId = catObj ? catObj.id : (item.category || 'other');
      const catName = catObj ? (window.i18n ? window.i18n.t(`categories.${catObj.id}`) : catObj.name) : (item.category || (window.i18n ? window.i18n.t('common.product') : 'Продукт'));
      const optionsConfig = this.getProductOptions(item);
      const currentSelectedQty = inCart ? cartItem.qty : '';
      const formInfo = this.getFormInfo(item.form);

      const primaryName = this.getLocalizedProductName(item);
      const khmerName = this.getKhmerSubtitle(item);

      // 1. Photo Container with In-Cart Badge, Price Badge and Add/Edit Button
      const photoBlock = `
        <div class="card-slider-viewport">
          <div class="card-photo-container" data-id="${item.id}" title="${inCart ? editOrderTitle : addToCartTitle}">
            ${item.img_url ? `
              <img src="${this.sanitizeUrl(item.img_url)}" class="card-photo-full" alt="${this.escapeHtml(primaryName)}" loading="lazy" />
            ` : `
              <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-size: 52px;" title="${inCart ? editOrderTitle : addToCartTitle}">
                ${catImg ? `<img src="${catImg}" class="card-empty-brand-img" alt="${this.escapeHtml(catName)}" loading="lazy" />` : catIcon}
              </div>
            `}
            ${inCart ? `<span class="badge-in-cart" id="badge_${item.id}">✓ ${this.escapeHtml(qtyText)}${cartItem.comment ? ' 💬' : ''}</span>` : `<span class="badge-in-cart" id="badge_${item.id}" style="display: none;"></span>`}
            ${this.renderPriceBadge(item.price, item.unit)}
            <button type="button" class="card-btn-add" data-id="${item.id}" title="${inCart ? editOrderTitle : addToCartTitle}">
              ${inCart ? '✓' : '+'}
            </button>
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
            ${catImg ? `
              <img src="${catImg}" class="badge-cat-brand-img" alt="${this.escapeHtml(catName)}" loading="lazy" />
            ` : `
              <span class="badge-cat-icon">${catIcon}</span>
            `}
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

    // Click Handlers -> Open Product Bottom Sheet
    this.shopProductsGrid.querySelectorAll('.card-photo-container, .card-btn-add').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = el.dataset.id;
        if (id) {
          this.openProductSheet(id);
        }
      });
    });
  }

  // ------------------------------------------------------------------------
  // Product Bottom Sheet Implementation
  // ------------------------------------------------------------------------
  openProductSheet(productId) {
    const product = this.products.find((p) => p.id === productId);
    if (!product || !this.productBottomSheet) return;

    this.activeSheetProductId = productId;
    const cartItem = this.cart[productId];
    const inCart = Boolean(cartItem);
    const optionsConfig = this.getProductOptions(product);

    // Initial selected quantity
    this.activeSheetSelectedQty = inCart ? cartItem.qty : (optionsConfig.defaultQty || optionsConfig.options[0]);

    // Product Header Info
    const catObj = CATEGORIES.find((c) => c.name === product.category || c.id === product.category);
    const catIcon = catObj ? catObj.icon : '📦';
    const primaryName = this.getLocalizedProductName(product);
    const khmerName = this.getKhmerSubtitle(product);
    const formInfo = this.getFormInfo(product.form);

    if (this.sheetProductMedia) {
      if (product.img_url) {
        this.sheetProductMedia.innerHTML = `<img src="${this.sanitizeUrl(product.img_url)}" alt="${this.escapeHtml(primaryName)}" />`;
      } else {
        const catImg = catObj ? catObj.img : null;
        this.sheetProductMedia.innerHTML = catImg
          ? `<img src="${catImg}" class="card-empty-brand-img" alt="${this.escapeHtml(primaryName)}" />`
          : catIcon;
      }
    }

    if (this.sheetProductName) this.sheetProductName.textContent = primaryName;
    if (this.sheetProductKhmer) this.sheetProductKhmer.textContent = khmerName || '';

    // Price tags
    const rate = this.khrRate || 4000;
    const hasPrice = product.price !== null && product.price !== undefined && product.price !== '' && !isNaN(Number(product.price)) && Number(product.price) > 0;
    const khrPrice = hasPrice ? Number(product.price) : 0;
    const priceUsd = hasPrice ? `$${(khrPrice / rate).toFixed(2)}` : (window.i18n ? window.i18n.t('product.price_na') : 'n/a');
    const priceKhr = hasPrice ? `~${Math.round(khrPrice).toLocaleString('en-US')} ៛` : '';

    if (this.sheetPriceUsd) this.sheetPriceUsd.textContent = priceUsd;
    if (this.sheetPriceKhr) this.sheetPriceKhr.textContent = priceKhr;

    if (this.sheetFormBadge) {
      if (formInfo) {
        this.sheetFormBadge.textContent = formInfo.label;
        this.sheetFormBadge.style.display = 'inline-flex';
      } else {
        this.sheetFormBadge.style.display = 'none';
      }
    }

    // Populate Option Chips
    if (this.sheetOptionsGrid) {
      this.sheetOptionsGrid.innerHTML = optionsConfig.options.map((opt) => `
        <button type="button" class="sheet-option-chip ${this.activeSheetSelectedQty === opt ? 'active' : ''}" data-val="${opt}">
          ${opt}
        </button>
      `).join('');

      this.sheetOptionsGrid.querySelectorAll('.sheet-option-chip').forEach((chip) => {
        chip.addEventListener('click', () => {
          this.sheetOptionsGrid.querySelectorAll('.sheet-option-chip').forEach((c) => c.classList.remove('active'));
          chip.classList.add('active');
          this.activeSheetSelectedQty = chip.dataset.val;
          this.updateSheetSubmitBtnText(product, inCart);
        });
      });
    }

    // Customer Comment Input
    if (this.sheetCommentInput) {
      this.sheetCommentInput.value = (cartItem && cartItem.comment) ? cartItem.comment : '';
    }

    // Action buttons
    if (this.sheetBtnRemove) {
      this.sheetBtnRemove.style.display = inCart ? 'block' : 'none';
    }

    this.updateSheetSubmitBtnText(product, inCart);

    // Show modal
    this.productBottomSheet.style.display = 'flex';
    document.body.classList.add('modal-open');
  }

  updateSheetSubmitBtnText(product, inCart) {
    if (!this.sheetBtnSubmit) return;

    let estPrice = '';
    const hasPrice = product.price !== null && product.price !== undefined && product.price !== '' && !isNaN(Number(product.price)) && Number(product.price) > 0;
    if (hasPrice) {
      const numMatch = (this.activeSheetSelectedQty || '').match(/^([\d.]+)/);
      if (numMatch) {
        const qtyVal = parseFloat(numMatch[1]) || 1;
        const rate = this.khrRate || 4000;
        const usdPerUnit = Number(product.price) / rate;
        estPrice = ` • ~$${(usdPerUnit * qtyVal).toFixed(2)}`;
      }
    }

    if (inCart) {
      const saveText = window.i18n ? window.i18n.t('product.btn_update_order') : 'Сохранить';
      this.sheetBtnSubmit.textContent = `${saveText}${estPrice}`;
    } else {
      const addText = window.i18n ? window.i18n.t('product.confirm_btn') : 'В заказ';
      this.sheetBtnSubmit.textContent = `${addText}${estPrice}`;
    }
  }

  closeProductSheet() {
    if (this.productBottomSheet) {
      this.productBottomSheet.style.display = 'none';
      this.updateModalOpenState();
    }
    this.activeSheetProductId = null;
    this.activeSheetSelectedQty = null;
  }

  submitProductSheet() {
    if (!this.activeSheetProductId) return;
    const product = this.products.find((p) => p.id === this.activeSheetProductId);
    if (!product) return;

    const qty = this.activeSheetSelectedQty || '1 кг';
    const comment = this.sheetCommentInput ? this.sheetCommentInput.value.trim() : '';

    this.cart[this.activeSheetProductId] = {
      product: product,
      qty: qty,
      comment: comment
    };

    this.saveCart();
    this.renderProducts();
    if (this.currentView === 'cart') {
      this.renderCartModalList();
    }
    this.closeProductSheet();

    const localizedName = this.getLocalizedProductName(product);
    const addedMsg = window.i18n ? window.i18n.t('toasts.item_added') : 'В корзине';
    this.showToast(`${addedMsg}: ${localizedName} (${qty})`);
  }

  removeProductFromSheet() {
    if (!this.activeSheetProductId) return;
    const id = this.activeSheetProductId;
    this.removeFromCart(id);
    this.closeProductSheet();
  }

  updateFloatingCartBar() {
    if (!this.floatingCartBar) return;
    const items = Object.values(this.cart);
    const count = items.length;

    // Only show on catalog view when items > 0
    if (count > 0 && this.currentView === 'catalog') {
      if (this.floatingCartCount) this.floatingCartCount.textContent = count;

      // Estimate total sum in KHR and USD
      let sumKhr = 0;
      items.forEach(({ product, qty }) => {
        if (product && product.price !== null && product.price !== undefined && product.price !== '' && !isNaN(Number(product.price))) {
          const numMatch = (qty || '').match(/^([\d.]+)/);
          const qVal = numMatch ? parseFloat(numMatch[1]) : 1;
          sumKhr += Number(product.price) * qVal;
        }
      });

      const rate = this.khrRate || 4000;
      const sumUsd = sumKhr / rate;

      if (this.floatingCartTotal) {
        this.floatingCartTotal.textContent = sumKhr > 0
          ? `~$${sumUsd.toFixed(2)} / ${Math.round(sumKhr).toLocaleString('en-US')} ៛`
          : '';
      }

      this.floatingCartBar.style.display = 'flex';
    } else {
      this.floatingCartBar.style.display = 'none';
    }
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

  saveCart(immediate = false) {
    localStorage.setItem('freshmarket_cart', JSON.stringify(this.cart));
    localStorage.setItem('freshmarket_cart_updated_at', String(Date.now()));
    this.updateCartUi();
    if (this.currentUser) {
      this.syncCartToCloud(immediate);
    }
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
        this.saveCart(true);
      } else {
        this.cart[productId].qty = `${val} ${unit}`;
        this.saveCart(false);
      }
    } else {
      delete this.cart[productId];
      this.saveCart(true);
    }
    this.renderProducts();
    this.renderCartModalList();
  }

  removeFromCart(productId, shouldReRender = true) {
    delete this.cart[productId];
    this.saveCart(true);
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

    // Update Header Cart Badge Indicator
    if (this.headerCartBadge) {
      if (count > 0) {
        this.headerCartBadge.textContent = count;
        this.headerCartBadge.style.display = 'inline-flex';
      } else {
        this.headerCartBadge.style.display = 'none';
      }
    }

    // Update Cart Card Badge
    const cartItemsBadge = document.getElementById('cartSectionItemsBadge');
    if (cartItemsBadge) {
      const itemsWord = window.i18n ? window.i18n.t('cart.items_count') : 'позиций';
      cartItemsBadge.textContent = `${count} ${itemsWord}`;
    }

    this.updateFloatingCartBar();
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
    let address = (this.userProfile && this.userProfile.address) || localStorage.getItem('freshmarket_default_address') || localStorage.getItem('freshmarket_customer_address') || '';
    let addressName = (this.userProfile && this.userProfile.address_name) || localStorage.getItem('freshmarket_customer_address_name') || '';

    if (this.currentUser) {
      name = this.currentUser.user_metadata?.full_name || this.currentUser.user_metadata?.name || this.currentUser.email || defaultCustomer;
      email = this.currentUser.email || '';
      if (!phone && this.currentUser.phone) {
        phone = this.currentUser.phone;
      }
    }

    if (this.userProfile) {
      if (this.userProfile.full_name) name = this.userProfile.full_name;
      if (this.userProfile.phone) phone = this.userProfile.phone;
      if (this.userProfile.messenger) messenger = this.userProfile.messenger;
      if (this.userProfile.address) address = this.userProfile.address;
      if (this.userProfile.address_name) addressName = this.userProfile.address_name;
      if (this.userProfile.email) email = this.userProfile.email;
    }

    // Parse prefix if address stored as "Name: Location" and addressName not explicitly separate
    if (!addressName && address && address.includes(': ')) {
      const match = address.match(/^([^:(]+):\s+(.+)$/);
      if (match && !match[1].startsWith('http')) {
        addressName = match[1].trim();
        address = match[2].trim();
      }
    }

    return { name, email, messenger, phone, address, addressName };
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

    this.cartItemsList.innerHTML = items.map(({ product, qty, comment }) => `
      <div class="cart-item-row" data-id="${product.id}">
        <div class="cart-item-info" title="${window.i18n ? window.i18n.t('product.edit_order') : 'Изменить заказ'}">
          <div class="cart-item-name">${this.escapeHtml(this.getLocalizedProductName(product))}</div>
          <div class="cart-item-kh khmer-font">${this.escapeHtml(this.getKhmerSubtitle(product))}</div>
          ${comment ? `
            <div class="cart-item-comment-row">
              <span class="cart-comment-badge">💬 ${this.escapeHtml(comment)}</span>
            </div>
          ` : ''}
        </div>
        <div class="cart-item-qty-input-wrap">
          <input type="text" class="cart-item-qty-input" value="${this.escapeHtml(qty)}" data-id="${product.id}" placeholder="${qtyPlaceholder}" />
        </div>
        <button type="button" class="cart-item-remove-btn" data-id="${product.id}" title="${removeTitle}">✕</button>
      </div>
    `).join('');

    // Clicking cart item info opens Product Bottom Sheet for easy adjustment
    this.cartItemsList.querySelectorAll('.cart-item-info').forEach((info) => {
      info.style.cursor = 'pointer';
      info.addEventListener('click', (e) => {
        const row = info.closest('.cart-item-row');
        const id = row ? row.dataset.id : null;
        if (id) {
          this.openProductSheet(id);
        }
      });
    });

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
        e.stopPropagation();
        const id = btn.dataset.id || e.currentTarget?.dataset.id || e.target?.dataset.id;
        if (id) {
          this.removeFromCart(id);
        }
      });
    });
  }

  prefillCheckoutData() {
    const { name, messenger, phone, address, addressName } = this.getCurrentCustomerInfo();

    const nameBadge = document.getElementById('checkoutUserName');
    const phoneBadge = document.getElementById('checkoutUserPhone');
    const addressNameInput = document.getElementById('deliveryAddressName');
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

    if (addressNameInput && (!addressNameInput.value || !this.isCartAddressCustomized)) {
      const presetKey = this.resolveAddressPresetKey(addressName);
      if (presetKey && ['home', 'office', 'villa'].includes(presetKey)) {
        addressNameInput.value = window.i18n ? window.i18n.t(`cart.preset_${presetKey}`) : addressName;
      } else {
        addressNameInput.value = addressName || '';
      }
    }
    if (addressInput && (!addressInput.value || !this.isCartAddressCustomized)) {
      addressInput.value = address;
    }

    this.syncCartAddressPresetPills(addressNameInput?.value);

    // Accordion expand/collapse click handlers for Cart Cards
    document.querySelectorAll('#viewCart .settings-section-header').forEach((header) => {
      if (header.dataset.hasCartToggleListener) return;
      header.dataset.hasCartToggleListener = 'true';
      header.addEventListener('click', () => {
        const section = header.closest('.settings-section');
        if (section) {
          section.classList.toggle('is-collapsed');
          if (section.id === 'cartSectionDelivery' && !section.classList.contains('is-collapsed')) {
            setTimeout(() => {
              if (this.checkoutMap) this.checkoutMap.invalidateSize({ pan: false });
            }, 340);
          }
        }
      });
    });

    this.renderRecentDeliveryAddresses();
    this.initCheckoutMiniMap();

    const savedPolicy = this.userProfile?.default_replacement_policy || localStorage.getItem('freshmarket_replacement_policy') || 'call_to_agree';
    const radio = document.querySelector(`input[name="replacementPolicy"][value="${savedPolicy}"]`);
    if (radio) radio.checked = true;
    this.updateCartPreferencesBadge(savedPolicy);
  }

  resolveAddressPresetKey(val) {
    if (!val) return null;
    const clean = String(val).trim().toLowerCase();
    if (!clean) return null;

    const synonyms = {
      home: ['home', 'дом', 'дім', 'maison', 'ផ្ទះ'],
      office: ['office', 'офис', 'офіс', 'bureau', 'ការិយាល័យ'],
      villa: ['villa', 'вилла', 'вілла', 'វីឡា'],
      other: ['other', 'другое', 'інше', 'autre', 'ផ្សេងទៀត']
    };

    for (const [key, list] of Object.entries(synonyms)) {
      if (list.includes(clean)) return key;
    }

    if (window.i18n && typeof window.i18n.t === 'function') {
      for (const key of ['home', 'office', 'villa', 'other']) {
        const tr = window.i18n.t(`cart.preset_${key}`)?.trim().toLowerCase();
        if (tr && tr === clean) return key;
      }
    }

    return 'other';
  }

  syncCartAddressPresetPills(activeVal) {
    const pills = document.querySelectorAll('#cartAddressPresetSelector .address-preset-pill, #cartAddressPresetSelector .messenger-pill');
    if (!pills.length) return;

    const nameInput = document.getElementById('deliveryAddressName');
    const isFocused = nameInput && document.activeElement === nameInput;

    let targetKey = null;
    if (activeVal) {
      targetKey = this.resolveAddressPresetKey(activeVal);
    } else if (isFocused) {
      targetKey = 'other';
    } else {
      targetKey = 'home';
    }

    pills.forEach((pill) => {
      const preset = pill.dataset.preset;
      pill.classList.toggle('active', preset === targetKey);
    });
  }

  updateCartPreferencesBadge(policy) {
    const badge = document.getElementById('cartPreferencesBadge');
    if (!badge) return;
    const t = (k, fb) => (window.i18n ? window.i18n.t(k) : fb);
    if (policy === 'picker_choice') {
      badge.textContent = t('cart.sub_picker_title', 'Закупщик');
    } else if (policy === 'do_not_replace') {
      badge.textContent = t('cart.sub_remove_title', 'Не заменять');
    } else {
      badge.textContent = t('cart.sub_call_title', 'Позвонить');
    }
  }

  initCheckoutMiniMap() {
    const mapContainer = document.getElementById('checkoutMiniMap');
    if (!mapContainer || typeof L === 'undefined') return;

    const marketCoords = window.MARKET_COORDS || { lat: 10.6120, lng: 104.1780 };

    if (!this.checkoutMap) {
      this.checkoutMap = L.map('checkoutMiniMap', {
        center: [marketCoords.lat, marketCoords.lng],
        zoom: 14.2,
        zoomControl: false,
        attributionControl: false
      });

      // OpenStreetMap HOT (Humanitarian): high contrast roads, buildings, and landmarks without API key
      L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
        subdomains: 'abc',
        maxZoom: 19
      }).addTo(this.checkoutMap);

      // Market Hub Marker (Icon only, no text label)
      const hubIcon = L.divIcon({
        className: 'checkout-hub-pin',
        html: '<div style="background: var(--accent-emerald, #10b981); width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid #ffffff; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.45); display: flex; align-items: center; justify-content: center; font-size: 13px;">🛒</div>',
        iconSize: [26, 26],
        iconAnchor: [13, 13]
      });
      L.marker([marketCoords.lat, marketCoords.lng], { icon: hubIcon }).addTo(this.checkoutMap);

      // Concentric Delivery Circles: Zone 3 (6km), Zone 2 (3km), Zone 1 (1km)
      L.circle([marketCoords.lat, marketCoords.lng], {
        radius: 6000,
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.04,
        weight: 1,
        dashArray: '3, 6'
      }).addTo(this.checkoutMap);

      L.circle([marketCoords.lat, marketCoords.lng], {
        radius: 3000,
        color: '#10b981',
        fillColor: '#10b981',
        fillOpacity: 0.08,
        weight: 1.2
      }).addTo(this.checkoutMap);

      L.circle([marketCoords.lat, marketCoords.lng], {
        radius: 1000,
        color: '#059669',
        fillColor: '#10b981',
        fillOpacity: 0.16,
        weight: 1.5
      }).addTo(this.checkoutMap);

      // Draggable Customer Marker
      const pinIcon = L.divIcon({
        className: 'checkout-customer-pin',
        html: '<span>📍</span>',
        iconSize: [28, 28],
        iconAnchor: [14, 26]
      });

      this.checkoutCustomerMarker = L.marker([marketCoords.lat, marketCoords.lng], {
        icon: pinIcon,
        draggable: true
      }).addTo(this.checkoutMap);

      // Marker drag event
      this.checkoutCustomerMarker.on('dragend', async (e) => {
        this.isCartAddressCustomized = true;
        const pos = e.target.getLatLng();
        await this.applyLocationToCheckout(pos.lat, pos.lng, false);
      });

      // Map click event
      this.checkoutMap.on('click', async (e) => {
        this.isCartAddressCustomized = true;
        const pos = e.latlng;
        this.checkoutCustomerMarker.setLatLng(pos);
        await this.applyLocationToCheckout(pos.lat, pos.lng, false);
      });
    }

    setTimeout(() => {
      if (this.checkoutMap) {
        this.checkoutMap.invalidateSize({ pan: false });
        const addressInput = document.getElementById('deliveryAddress');
        const coords = typeof extractCoordsFromText === 'function' ? extractCoordsFromText(addressInput?.value) : null;
        if (coords) {
          const coordsKey = `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
          if (this._lastCheckoutCoordsKey !== coordsKey) {
            this._lastCheckoutCoordsKey = coordsKey;
            this.applyLocationToCheckout(coords.lat, coords.lng, true);
          }
        } else {
          if (!this._lastCheckoutCoordsKey) {
            this._lastCheckoutCoordsKey = 'default';
            this.checkoutMap.setView([marketCoords.lat, marketCoords.lng], 13);
          }
        }
      }
    }, 340);
  }

  updateDeliveryMapBadge(zoneInfo, roadKm, durationMin) {
    const badgeText = document.getElementById('deliveryMapStatusText');
    const feeStr = `$${Number(zoneInfo.fee || 1).toFixed(2)}`;
    const byRoadText = window.i18n ? window.i18n.t('cart.by_road') : 'по дороге';
    const minText = window.i18n ? window.i18n.t('cart.min') : 'мин';
    const kmUnit = window.i18n ? window.i18n.t('common.unit_km') : 'км';
    const zoneName = (zoneInfo.zoneKey && window.i18n) ? window.i18n.t(`cart.${zoneInfo.zoneKey}`) : zoneInfo.name;

    let infoStr = '';
    if (roadKm !== undefined) {
      infoStr = ` • ${roadKm} ${kmUnit} ${byRoadText}`;
      if (durationMin !== undefined) {
        infoStr += ` (~${durationMin} ${minText})`;
      }
    }
    if (badgeText) {
      badgeText.textContent = `${zoneName} (${feeStr})${infoStr}`;
    }

    const cartZoneBadge = document.getElementById('cartDeliveryZoneBadge');
    if (cartZoneBadge) {
      cartZoneBadge.textContent = `${zoneName} • ${feeStr}`;
    }
  }

  async applyLocationToCheckout(lat, lng, panMap = true) {
    const marketCoords = window.MARKET_COORDS || { lat: 10.6120, lng: 104.1780 };
    this._lastCheckoutCoordsKey = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;

    if (this.checkoutCustomerMarker) {
      this.checkoutCustomerMarker.setLatLng([lat, lng]);
    }

    // Calculate real road distance and geometry via OSRM
    let routeInfo = null;
    if (typeof window.calculateRoadDistanceAndRoute === 'function') {
      routeInfo = await window.calculateRoadDistanceAndRoute(marketCoords.lat, marketCoords.lng, lat, lng);
    } else {
      const dist = calculateDistanceKm(lat, lng, marketCoords.lat, marketCoords.lng);
      routeInfo = { roadDistanceKm: dist, durationMin: Math.max(1, Math.round(dist * 2.5)), coordinates: [[marketCoords.lat, marketCoords.lng], [lat, lng]] };
    }

    // Determine delivery zone & fee based on road distance
    const zoneInfo = getDeliveryZoneByDistance(routeInfo.roadDistanceKm);

    this.currentDeliveryZone = zoneInfo.zoneId;
    this.currentDeliveryFee = zoneInfo.fee;
    this.currentDeliveryDistance = routeInfo.roadDistanceKm;

    // Draw route polyline on Leaflet map
    if (this.checkoutMap && routeInfo.coordinates && routeInfo.coordinates.length > 0) {
      if (this.checkoutRoutePolyline) {
        this.checkoutMap.removeLayer(this.checkoutRoutePolyline);
        this.checkoutRoutePolyline = null;
      }
      this.checkoutRoutePolyline = L.polyline(routeInfo.coordinates, {
        color: '#10b981',
        weight: 4,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(this.checkoutMap);

      if (panMap) {
        this.checkoutMap.flyToBounds([[marketCoords.lat, marketCoords.lng], [lat, lng]], {
          padding: [28, 28],
          maxZoom: 15.5,
          duration: 1.1,
          easeLinearity: 0.25
        });
      }
    } else if (panMap && this.checkoutMap) {
      this.checkoutMap.flyTo([lat, lng], 14.5, { duration: 0.9 });
    }

    this.updateDeliveryMapBadge(zoneInfo, routeInfo.roadDistanceKm, routeInfo.durationMin);

    const mapUrl = `https://maps.google.com/?q=${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
    const addressInput = document.getElementById('deliveryAddress');
    if (!addressInput) return;

    let placeName = '';
    if (typeof window.reverseGeocodeCoords === 'function') {
      placeName = await window.reverseGeocodeCoords(lat, lng);
    }

    if (placeName) {
      addressInput.value = `${placeName} (${mapUrl})`;
    } else {
      addressInput.value = mapUrl;
    }
  }

  setupDeliveryLocationHandlers() {
    const btnGetLocation = document.getElementById('btnGetLocation');
    const addressInput = document.getElementById('deliveryAddress');
    const nameInput = document.getElementById('deliveryAddressName');
    if (!btnGetLocation || !addressInput) return;

    if (nameInput && !nameInput.dataset.hasNameListener) {
      nameInput.dataset.hasNameListener = 'true';
      nameInput.addEventListener('input', () => {
        this.isCartAddressCustomized = true;
        this.syncCartAddressPresetPills(nameInput.value);
      });
      nameInput.addEventListener('focus', () => {
        if (!nameInput.value.trim()) {
          this.syncCartAddressPresetPills('other');
        }
      });
      nameInput.addEventListener('blur', () => {
        if (!nameInput.value.trim()) {
          this.syncCartAddressPresetPills('');
        }
      });
    }

    const presetPills = document.querySelectorAll('#cartAddressPresetSelector .address-preset-pill, #cartAddressPresetSelector .messenger-pill');
    presetPills.forEach((pill) => {
      if (pill.dataset.hasPresetListener) return;
      pill.dataset.hasPresetListener = 'true';
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        const presetKey = pill.dataset.preset;
        if (!nameInput) return;

        this.isCartAddressCustomized = true;

        if (presetKey === 'other') {
          const isStandard = ['home', 'office', 'villa'].some((k) => {
            const tr = (window.i18n ? window.i18n.t(`cart.preset_${k}`) : '').trim().toLowerCase();
            return tr && nameInput.value.trim().toLowerCase() === tr;
          });
          if (isStandard) {
            nameInput.value = '';
          }
          nameInput.focus();
          this.syncCartAddressPresetPills('other');
        } else {
          const text = (window.i18n ? window.i18n.t(`cart.preset_${presetKey}`) : pill.textContent).trim();
          nameInput.value = text;
          this.syncCartAddressPresetPills(presetKey);
        }
      });
    });

    btnGetLocation.addEventListener('click', () => {
      this.isCartAddressCustomized = true;
      if (!navigator.geolocation) {
        this.showToast(window.i18n ? window.i18n.t('toasts.location_error') : 'Геолокация не поддерживается вашим браузером');
        return;
      }

      btnGetLocation.disabled = true;
      btnGetLocation.style.opacity = '0.5';

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          btnGetLocation.disabled = false;
          btnGetLocation.style.opacity = '1';

          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          await this.applyLocationToCheckout(lat, lng, true);

          this.showToast(window.i18n ? window.i18n.t('toasts.location_detected') : '📍 Местоположение определено');
        },
        (error) => {
          btnGetLocation.disabled = false;
          btnGetLocation.style.opacity = '1';
          console.warn('Geolocation error:', error);
          this.showToast(window.i18n ? window.i18n.t('toasts.location_error') : 'Не удалось определить координаты. Укажите адрес вручную');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });

    addressInput.addEventListener('input', (e) => {
      this.isCartAddressCustomized = true;
      const val = addressInput.value.trim();
      const coords = typeof extractCoordsFromText === 'function' ? extractCoordsFromText(val) : null;
      if (coords) {
        this.applyLocationToCheckout(coords.lat, coords.lng, true);
      }
    });

    const btnGeodataPrivacy = document.getElementById('btnGeodataPrivacy');
    if (btnGeodataPrivacy) {
      btnGeodataPrivacy.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showGeodataPrivacyDialog();
      });
    }

    const btnGeodataPrivacyOpen = document.getElementById('btnGeodataPrivacyModalOpen');
    if (btnGeodataPrivacyOpen) {
      btnGeodataPrivacyOpen.addEventListener('click', (e) => {
        e.preventDefault();
        this.showGeodataPrivacyDialog();
      });
      btnGeodataPrivacyOpen.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showGeodataPrivacyDialog();
        }
      });
    }
  }

  saveRecentDeliveryAddress(address, coords = null, name = '') {
    if (!address || typeof address !== 'string') return;
    const cleanAddr = address.trim();
    if (!cleanAddr) return;

    try {
      let recents = JSON.parse(localStorage.getItem('freshmarket_recent_addresses') || '[]');
      if (!Array.isArray(recents)) recents = [];

      const extracted = coords || (typeof extractCoordsFromText === 'function' ? extractCoordsFromText(cleanAddr) : null);

      recents = recents.filter(item => {
        const text = typeof item === 'string' ? item : item?.address;
        return text && text.toLowerCase() !== cleanAddr.toLowerCase();
      });

      recents.unshift({
        name: (name || '').trim(),
        address: cleanAddr,
        lat: extracted?.lat || null,
        lng: extracted?.lng || null
      });

      recents = recents.slice(0, 3);
      localStorage.setItem('freshmarket_recent_addresses', JSON.stringify(recents));
    } catch (_) {}
  }

  renderRecentDeliveryAddresses() {
    const container = document.getElementById('recentLocationsContainer');
    const list = document.getElementById('recentLocationsList');
    if (!container || !list) return;

    try {
      let recents = JSON.parse(localStorage.getItem('freshmarket_recent_addresses') || '[]');
      if (!Array.isArray(recents)) recents = [];

      const savedAddr = localStorage.getItem('freshmarket_customer_address') || this.userProfile?.default_delivery_address;
      const savedName = localStorage.getItem('freshmarket_customer_address_name') || '';
      if (recents.length === 0 && savedAddr && savedAddr.trim()) {
        const extracted = typeof extractCoordsFromText === 'function' ? extractCoordsFromText(savedAddr) : null;
        recents = [{ name: savedName, address: savedAddr.trim(), lat: extracted?.lat || null, lng: extracted?.lng || null }];
        localStorage.setItem('freshmarket_recent_addresses', JSON.stringify(recents));
      }

      if (recents.length === 0) {
        container.style.display = 'none';
        list.innerHTML = '';
        return;
      }

      container.style.display = 'block';
      list.innerHTML = recents.map((item, idx) => {
        const addr = typeof item === 'string' ? item : (item?.address || '');
        const addrName = typeof item === 'object' && item?.name ? item.name : '';
        const fullDisplay = addrName ? `${addrName}: ${addr}` : addr;
        const displayLabel = fullDisplay.length > 32 ? fullDisplay.slice(0, 30) + '…' : fullDisplay;
        const safeTitle = typeof escapeHtml === 'function' ? escapeHtml(fullDisplay) : fullDisplay;
        const safeLabel = typeof escapeHtml === 'function' ? escapeHtml(displayLabel) : displayLabel;
        return `<button type="button" class="recent-location-chip" data-idx="${idx}" title="${safeTitle}">
          <span class="chip-text">${safeLabel}</span>
        </button>`;
      }).join('');

      list.querySelectorAll('.recent-location-chip').forEach(btn => {
        btn.addEventListener('click', async () => {
          this.isCartAddressCustomized = true;
          const idx = parseInt(btn.dataset.idx, 10);
          const item = recents[idx];
          if (!item) return;
          let chosenAddr = typeof item === 'string' ? item : (item?.address || '');
          let chosenName = typeof item === 'object' && item ? (item.name || '') : '';
          const addressInput = document.getElementById('deliveryAddress');
          const addressNameInput = document.getElementById('deliveryAddressName');

          // Parse prefix from chosenAddr if chosenName was not separated
          if (!chosenName && chosenAddr && chosenAddr.includes(': ')) {
            const match = chosenAddr.match(/^([^:(]+):\s+(.+)$/);
            if (match && !match[1].startsWith('http')) {
              chosenName = match[1].trim();
              chosenAddr = match[2].trim();
            }
          }

          if (addressNameInput) {
            const presetKey = this.resolveAddressPresetKey(chosenName);
            let displayPresetName = chosenName;
            if (presetKey && ['home', 'office', 'villa'].includes(presetKey)) {
              displayPresetName = window.i18n ? window.i18n.t(`cart.preset_${presetKey}`) : chosenName;
            }
            addressNameInput.value = displayPresetName || '';
            this.syncCartAddressPresetPills(presetKey || 'home');
          }

          if (addressInput && chosenAddr) {
            addressInput.value = chosenAddr;

            // Extract or use saved coordinates to set pin on map
            let lat = typeof item === 'object' && item ? item.lat : null;
            let lng = typeof item === 'object' && item ? item.lng : null;

            if (!lat || !lng) {
              const coords = typeof extractCoordsFromText === 'function' ? extractCoordsFromText(chosenAddr) : null;
              if (coords) {
                lat = coords.lat;
                lng = coords.lng;
              }
            }

            if (lat && lng) {
              await this.applyLocationToCheckout(lat, lng, true);
            }
          }
        });
      });
    } catch (_) {
      container.style.display = 'none';
    }
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

    const trimmedName = (customerName || '').trim();
    const trimmedPhone = (customerPhone || '').trim();

    // Client Pre-Validation: customer name and phone before any network activity
    if (!trimmedPhone || trimmedName.length < 2 || trimmedName.length > 100) {
      const friendly = this.getFriendlyErrorMessage({ message: 'customer name or phone required' });
      this.showAlertDialog({
        ...friendly,
        onConfirm: () => this.openAuthModal()
      });
      return;
    }

    const nameInput = document.getElementById('deliveryAddressName');
    const addressInput = document.getElementById('deliveryAddress');
    const commentInput = document.getElementById('customerComment');
    const replacementRadio = document.querySelector('input[name="replacementPolicy"]:checked');

    const customAddrName = (nameInput?.value || '').trim();
    const rawDeliveryAddress = (addressInput?.value || '').trim();
    const customerComment = (commentInput?.value || '').trim();
    const replacementPolicy = replacementRadio?.value || 'call_to_agree';

    let deliveryAddress = rawDeliveryAddress;
    if (customAddrName && rawDeliveryAddress) {
      deliveryAddress = `${customAddrName}: ${rawDeliveryAddress}`;
    }

    localStorage.setItem('freshmarket_replacement_policy', replacementPolicy);
    if (this.sb && this.currentUser) {
      this.updateProfileField({ default_replacement_policy: replacementPolicy });
    }

    // Client Pre-Validation: delivery address (5..300 chars) before any network activity
    if (!rawDeliveryAddress || rawDeliveryAddress.length < 5 || deliveryAddress.length > 300) {
      const friendly = this.getFriendlyErrorMessage({ message: 'delivery address required' });
      this.showAlertDialog({
        ...friendly,
        onConfirm: () => { if (addressInput) addressInput.focus(); }
      });
      return;
    }

    const items = Object.values(this.cart);
    if (items.length === 0) {
      this.showToast(window.i18n ? window.i18n.t('toasts.cart_is_empty') : '⚠️ Корзина пуста');
      return;
    }

    // Client Pre-Validation: Rate Limit check (2 minutes) from local timestamp
    const lastOrderTime = parseInt(localStorage.getItem('freshmarket_last_order_timestamp') || '0', 10);
    const now = Date.now();
    if (lastOrderTime && (now - lastOrderTime) < 120000) {
      const friendly = this.getFriendlyErrorMessage({ message: 'Rate limit exceeded: please wait 2 minutes between orders' });
      this.showAlertDialog(friendly);
      return;
    }

    const submitBtn = document.getElementById('btnSubmitOrder');
    if (submitBtn) submitBtn.disabled = true;

    // Client Pre-Validation: Active Orders check (max 5 active orders via lightweight HEAD query)
    if (this.sb && this.currentUser) {
      try {
        const { count: activeCount, error: countErr } = await this.sb
          .from('orders')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', this.currentUser.id)
          .in('status', ['pending', 'new', 'shopping', 'purchasing']);

        if (!countErr && typeof activeCount === 'number' && activeCount >= 5) {
          const friendly = this.getFriendlyErrorMessage({ message: 'Maximum pending orders limit reached (5 active orders max)' });
          this.showAlertDialog(friendly);
          if (submitBtn) submitBtn.disabled = false;
          return;
        }
      } catch (headCheckErr) {
        console.debug('[FreshMarket Shop] Active orders HEAD pre-check bypassed:', headCheckErr);
      }
    }

    // Save order address in recents (does not overwrite profile default if already set)
    const pinCoords = this.checkoutCustomerMarker ? this.checkoutCustomerMarker.getLatLng() : null;
    const effectiveSavedName = customAddrName || (window.i18n ? window.i18n.t('cart.preset_home') : 'Дом');
    this.saveRecentDeliveryAddress(rawDeliveryAddress, pinCoords ? { lat: pinCoords.lat, lng: pinCoords.lng } : null, effectiveSavedName);
    localStorage.setItem('freshmarket_customer_address_name', effectiveSavedName);
    if (!localStorage.getItem('freshmarket_default_address') && !this.userProfile?.address) {
      localStorage.setItem('freshmarket_default_address', rawDeliveryAddress);
      localStorage.setItem('freshmarket_customer_address', rawDeliveryAddress);
    }

    // Determine delivery zone & fee automatically (using road distance if available)
    let deliveryZoneId = this.currentDeliveryZone || 'zone_1';
    let deliveryFee = this.currentDeliveryFee || 1.00;

    const coords = typeof extractCoordsFromText === 'function' ? extractCoordsFromText(rawDeliveryAddress) : null;
    const finalLat = (pinCoords && typeof pinCoords.lat === 'number') ? pinCoords.lat : (coords?.lat || null);
    const finalLng = (pinCoords && typeof pinCoords.lng === 'number') ? pinCoords.lng : (coords?.lng || null);

    if (coords && !this.currentDeliveryZone && typeof calculateDistanceKm === 'function' && typeof getDeliveryZoneByDistance === 'function') {
      const marketCoords = window.MARKET_COORDS || { lat: 10.6120, lng: 104.1780 };
      const dist = calculateDistanceKm(coords.lat, coords.lng, marketCoords.lat, marketCoords.lng);
      const zoneInfo = getDeliveryZoneByDistance(dist * 1.25);
      deliveryZoneId = zoneInfo.zoneId;
      deliveryFee = zoneInfo.fee;
    }

    const orderNumber = generateOrderNumber();
    const orderId = generateUUID();

    // Target delivery date: Tomorrow
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const targetDate = tomorrow.toISOString().slice(0, 10);

    const orderPayload = {
      id: orderId,
      order_number: orderNumber,
      user_id: this.currentUser.id,
      customer_name: customerName,
      customer_messenger: customerMessenger,
      customer_phone: customerPhone,
      delivery_address: deliveryAddress,
      delivery_zone: deliveryZoneId,
      delivery_lat: finalLat,
      delivery_lng: finalLng,
      customer_notes: customerComment,
      customer_comment: customerComment,
      target_delivery_date: targetDate,
      replacement_policy: replacementPolicy,
      replace_rule: replacementPolicy,
      status: 'pending',
      payment_status: 'pending',
      payment_method: 'cash',
      estimated_total: 0.00,
      market_items_total: 0.00,
      actual_market_total: 0.00,
      service_fee: 0.00,
      delivery_fee: deliveryFee,
      grand_total: deliveryFee,
      created_at: new Date().toISOString()
    };

    const orderItemsPayload = items.map(({ product, qty, comment }) => {
      const title = this.getLocalizedProductName(product) || (window.i18n ? window.i18n.t('common.product') : 'Товар');
      const numMatch = String(qty || '').match(/^([\d.]+)/);
      const parsedQty = numMatch ? parseFloat(numMatch[1]) : 1;
      const unitMatch = String(qty || '').replace(/^[\d.\s]+/, '').trim();
      const finalUnit = unitMatch || product.unit || 'кг';
      return {
        id: generateUUID(),
        order_id: orderId,
        product_id: product.id || null,
        product_title: title,
        product_name_en: product.name_en || '',
        product_name_kh: product.name_kh || '',
        product_name_ru: product.name_ru || '',
        product_img_url: product.img_url || '',
        product_category: product.category || '',
        product_form: product.form || '',
        quantity: parsedQty,
        requested_qty: parsedQty,
        unit: finalUnit,
        customer_comment: comment || '',
        status: 'pending',
        estimated_price: Number(product.price) || 0.00,
        actual_cost: 0.00,
        created_at: new Date().toISOString()
      };
    });

    let supabaseSuccess = false;
    let syncErrorMsg = null;
    let finalOrderNumber = orderNumber;
    let businessError = null;

    try {
      // 1. Send to Supabase atomically via RPC create_order
      if (this.sb) {
        const { data: rpcData, error: rpcErr } = await this.sb.rpc('create_order', {
          p_order_id: orderId,
          p_customer_name: customerName,
          p_customer_phone: customerPhone,
          p_customer_messenger: customerMessenger,
          p_delivery_address: deliveryAddress,
          p_delivery_zone: deliveryZoneId,
          p_customer_comment: customerComment,
          p_replacement_policy: replacementPolicy,
          p_target_delivery_date: targetDate,
          p_items: orderItemsPayload,
          p_delivery_lat: finalLat,
          p_delivery_lng: finalLng
        });

        if (!rpcErr && rpcData?.success) {
          supabaseSuccess = true;
          localStorage.setItem('freshmarket_last_order_timestamp', String(Date.now()));
          if (rpcData.order_number) {
            finalOrderNumber = rpcData.order_number;
            orderPayload.order_number = rpcData.order_number;
          }
          if (rpcData.delivery_zone) {
            orderPayload.delivery_zone = rpcData.delivery_zone;
          }
          if (typeof rpcData.delivery_fee === 'number') {
            orderPayload.delivery_fee = rpcData.delivery_fee;
          }
        } else {
          if (rpcErr?.code === 'P0001' || /limit|reached|wait|exceeded/i.test(rpcErr?.message || '')) {
            businessError = rpcErr;
          }
          throw rpcErr || new Error('RPC create_order failed');
        }
      } else {
        syncErrorMsg = 'Нет подключения к базе данных';
      }
    } catch (err) {
      if (err?.code !== 'P0001' && !/limit|reached|wait|exceeded/i.test(err?.message || '')) {
        console.debug('[FreshMarket Shop] Checkout Supabase error:', err);
      }
      syncErrorMsg = err?.message || 'Сбой соединения с базой';
      if (!businessError && (err?.code === 'P0001' || /limit|reached|wait|exceeded/i.test(err?.message || ''))) {
        businessError = err;
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }

    // If server actively rejected the order (e.g. rate limit or 5 max pending orders)
    if (businessError) {
      const friendly = this.getFriendlyErrorMessage(businessError);
      this.showAlertDialog(friendly);
      // Keep cart intact so customer does not lose their selection
      return;
    }

    // 2. Save locally in client history with synchronization status
    this.saveOrderLocally({
      ...orderPayload,
      order_number: finalOrderNumber,
      items: orderItemsPayload,
      sync_status: supabaseSuccess ? 'synced' : 'pending_sync',
      sync_error: syncErrorMsg
    });

    if (!supabaseSuccess) {
      localStorage.setItem('freshmarket_last_order_timestamp', String(Date.now()));
    }

    // Clear cart & refresh catalog cards
    this.cart = {};
    this.isCartAddressCustomized = false;
    const checkoutAddrInput = document.getElementById('deliveryAddress');
    if (checkoutAddrInput) checkoutAddrInput.value = '';
    const checkoutNameInput = document.getElementById('deliveryAddressName');
    if (checkoutNameInput) checkoutNameInput.value = '';
    this.syncCartAddressPresetPills('');
    this.saveCart(true);
    this.renderProducts();
    this.closeCartModal();

    if (supabaseSuccess) {
      this.showToast(
        window.i18n ? `${window.i18n.t('toasts.order_sent')} (${finalOrderNumber})` : `🎉 Заказ ${finalOrderNumber} успешно отправлен закупщику!`,
        'success',
        4000
      );
    } else {
      const warnMsg = window.i18n
        ? window.i18n.t('orders.saved_offline_warning', { orderNumber: finalOrderNumber, error: syncErrorMsg })
        : `⚠️ Заказ ${finalOrderNumber} сохранен локально, но не передан в базу: ${syncErrorMsg}`;
      this.showToast(warnMsg, 'warning', 7000);
    }
    this.openOrdersModal();
  }

  saveOrderLocally(order) {
    if (!this.isUserAuthenticated()) return;
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
    if (this.isUserAuthenticated()) {
      this.switchView('orders');
    } else {
      this.switchView('catalog');
    }
  }

  closeOrdersModal() {
    this.switchView('catalog');
  }

  async loadOrders() {
    if (!this.ordersModalBody) return;
    if (!this.isUserAuthenticated()) {
      this.switchView('catalog');
      return;
    }

    const ordersLoading = window.i18n ? window.i18n.t('orders.loading') : 'Загрузка заказов...';
    this.ordersModalBody.innerHTML = `
      <div class="empty-state" style="padding: 30px 0;">
        <div class="empty-icon">⏳</div>
        <div class="empty-title">${ordersLoading}</div>
      </div>
    `;

    // 1. Sync any locally pending orders first if online and authenticated
    if (this.sb && this.currentUser) {
      await this.syncPendingOrders();
    }

    let orders = [];

    // 2. Fetch authenticated user's orders from Supabase
    if (this.sb && this.currentUser) {
      try {
        const { data, error } = await this.sb
          .from('orders')
          .select('*, order_items(*)')
          .eq('user_id', this.currentUser.id)
          .order('created_at', { ascending: false });

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

    // 3. Fallback or merge with local storage history (only authenticated user orders)
    if (orders.length === 0 && this.currentUser) {
      orders = JSON.parse(localStorage.getItem('freshmarket_my_orders') || '[]')
        .filter((o) => o.user_id === this.currentUser.id);
    }

    this.renderOrdersList(orders);
  }

  async syncPendingOrders() {
    if (!this.sb || !this.currentUser) return;
    try {
      const localOrders = JSON.parse(localStorage.getItem('freshmarket_my_orders') || '[]');
      let hasUpdates = false;

      // Восстанавливаем заказы, которые могли быть ошибочно помечены 'rejected' из-за лимитов
      localOrders.forEach(o => {
        if (o.sync_status === 'rejected' && o.sync_error && /limit|reached|wait|exceeded|P0001/i.test(o.sync_error)) {
          o.sync_status = 'pending_sync';
          hasUpdates = true;
        }
      });

      const pendingOrders = localOrders.filter(o => o.sync_status === 'pending_sync');
      if (pendingOrders.length === 0) {
        if (hasUpdates) {
          localStorage.setItem('freshmarket_my_orders', JSON.stringify(localOrders));
        }
        return;
      }

      // Если предыдущая попытка синхронизации вернула ограничение частоты и 2 минуты еще не прошли — ждем
      const lastOrderTime = parseInt(localStorage.getItem('freshmarket_last_order_timestamp') || '0', 10);
      const now = Date.now();
      if (lastOrderTime && (now - lastOrderTime) < 120000 && pendingOrders.some(o => o.sync_error && /rate limit/i.test(o.sync_error))) {
        return;
      }

      for (const order of pendingOrders) {
        const { items, sync_status, sync_error, ...orderPayload } = order;
        orderPayload.user_id = this.currentUser.id;

        const sanitizedItems = (items || []).map(it => {
          const numMatch = String(it.quantity || it.requested_qty || '').match(/^([\d.]+)/);
          const parsedQty = numMatch ? parseFloat(numMatch[1]) : (Number(it.quantity) || 1);
          return {
            ...it,
            quantity: parsedQty,
            requested_qty: parsedQty
          };
        });

        let synced = false;
        try {
          // Вызов атомарной RPC create_order с проверкой идемпотентности по order.id
          const { data: rpcData, error: rpcErr } = await this.sb.rpc('create_order', {
            p_order_id: order.id,
            p_customer_name: order.customer_name,
            p_customer_phone: order.customer_phone,
            p_customer_messenger: order.customer_messenger || 'telegram',
            p_delivery_address: order.delivery_address,
            p_delivery_zone: order.delivery_zone || 'zone_1',
            p_customer_comment: order.customer_comment || order.customer_notes || '',
            p_replacement_policy: order.replacement_policy || 'call_to_agree',
            p_target_delivery_date: order.target_delivery_date || null,
            p_items: sanitizedItems,
            p_delivery_lat: order.delivery_lat || null,
            p_delivery_lng: order.delivery_lng || null
          });

          if (!rpcErr && rpcData?.success) {
            synced = true;
            localStorage.setItem('freshmarket_last_order_timestamp', String(Date.now()));
            if (rpcData.order_number) {
              order.order_number = rpcData.order_number;
            }
          } else {
            order.sync_error = rpcErr?.message || 'RPC create_order failed';
            const isLimit = /limit|reached|wait|exceeded/i.test(rpcErr?.message || '') || rpcErr?.code === 'P0001';
            if (isLimit) {
              // Временное ограничение (Rate limit 2 мин или 5 active pending заявок):
              // НЕ бракуем заказ (он остается в 'pending_sync' для последующей синхронизации)
              localStorage.setItem('freshmarket_last_order_timestamp', String(Date.now()));
              hasUpdates = true;
              console.debug('[FreshMarket Shop] Sync throttled by server limits:', rpcErr?.message);
              break; // Прерываем синхронизацию следующих заказов до окончания лимита
            } else {
              console.debug('[FreshMarket Shop] Resync RPC info:', rpcErr);
            }
          }
        } catch (syncItemErr) {
          console.debug('[FreshMarket Shop] Resync item exception:', syncItemErr);
        }

        if (synced) {
          order.sync_status = 'synced';
          delete order.sync_error;
          hasUpdates = true;
        }
      }
      if (hasUpdates) {
        localStorage.setItem('freshmarket_my_orders', JSON.stringify(localOrders));
      }
    } catch (e) {
      console.debug('Sync pending orders info:', e);
    }
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
      pending: { label: window.i18n ? window.i18n.t('orders.status_new') : '🌅 Принят на утренний закуп', class: 'status-new' },
      new: { label: window.i18n ? window.i18n.t('orders.status_new') : '🌅 Принят на утренний закуп', class: 'status-new' },
      shopping: { label: window.i18n ? window.i18n.t('orders.status_purchasing') : '🥬 Закупается на рынке (05:00)', class: 'status-purchasing' },
      purchasing: { label: window.i18n ? window.i18n.t('orders.status_purchasing') : '🥬 Закупается на рынке (05:00)', class: 'status-purchasing' },
      delivering: { label: window.i18n ? window.i18n.t('orders.status_delivering') : '🛵 Передан курьеру', class: 'status-delivering' },
      completed: { label: window.i18n ? window.i18n.t('orders.status_completed') : '✅ Доставлен и оплачен', class: 'status-completed' },
      cancelled: { label: window.i18n ? window.i18n.t('orders.status_cancelled') : '❌ Отменен', class: 'status-cancelled' },
      rejected: { label: window.i18n ? (window.i18n.t('dialogs.generic_error_title') + ' (Не отправлен)') : '⚠️ Отклонен', class: 'status-cancelled' }
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
        <div class="settings-section order-card" id="order-${this.escapeHtml(order.order_number)}">
          <div class="settings-section-header">
            <div class="settings-section-title" style="flex-direction: column; align-items: flex-start; gap: 2px;">
              <span class="order-card-number">${this.escapeHtml(order.order_number)}</span>
              <span class="order-card-date">${dateStr} • ${deliveryPrefix} ${order.target_delivery_date || tomorrowLabel}</span>
            </div>
            <div class="settings-section-header-right">
              <span class="order-status-pill ${st.class}">${st.label}</span>
              ${order.sync_status === 'pending_sync' ? '<span class="badge badge-amber" title="Ожидает связи с базой">⏳</span>' : ''}
              <button type="button" class="btn-card-toggle" title="Свернуть / Развернуть" aria-label="Свернуть / Развернуть">
                <svg class="toggle-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          </div>

          <div class="settings-section-body">
            <div class="order-replacement-policy-tag" style="font-size: 11.5px; color: var(--text-muted); font-weight: 500;">
              ${this.formatReplacementPolicy(order.replacement_policy || order.replace_rule)}
            </div>

            <!-- Items preview -->
            <div class="order-card-items">
              ${items.map((item) => {
                const itemTitle = this.getLocalizedProductName(item) || item.product_title || (window.i18n ? window.i18n.t('common.product') : 'Товар');
                const itemQty = item.quantity || item.requested_qty || 1;
                const itemUnit = item.unit || 'кг';
                return `
                <div class="order-item-mini">
                  <span class="order-item-mini-name">${this.escapeHtml(itemTitle)} (${this.escapeHtml(itemQty)} ${this.escapeHtml(itemUnit)})${item.customer_comment ? ` <small style="color: var(--text-muted);">[💬 ${this.escapeHtml(item.customer_comment)}]</small>` : ''}</span>
                  ${item.receipt_url ? `
                    <a href="${this.sanitizeUrl(item.receipt_url)}" target="_blank" rel="noopener noreferrer" class="receipt-link" title="${receiptTitleText}">${receiptBtnText}</a>
                  ` : ''}
                </div>
              `;
              }).join('')}
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
        </div>
      `;
    }).join('');

    // Accordion expand/collapse click handlers for order cards
    this.ordersModalBody.querySelectorAll('.settings-section-header').forEach((header) => {
      header.addEventListener('click', () => {
        const section = header.closest('.settings-section');
        if (section) {
          section.classList.toggle('is-collapsed');
        }
      });
    });
  }

  formatReplacementPolicy(policy) {
    const t = (k, fallback) => (window.i18n ? window.i18n.t(k) : fallback);
    if (policy === 'picker_choice') {
      return `🔄 ${t('cart.sub_picker_title', 'На усмотрение закупщика')}`;
    }
    if (policy === 'do_not_replace') {
      return `❌ ${t('cart.sub_remove_title', 'Не заменять')}`;
    }
    return `📞 ${t('cart.sub_call_title', 'Позвонить / написать')}`;
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
    const addressNameLabelText = t('cart.address_name_label', 'Название или ориентир:');
    const addressNamePlaceholderText = t('cart.address_name_placeholder', 'Например: Дом, Офис, Вилла 12...');
    const presetHomeText = t('cart.preset_home', 'Дом');
    const presetOfficeText = t('cart.preset_office', 'Офис');
    const presetVillaText = t('cart.preset_villa', 'Вилла');
    const presetOtherText = t('cart.preset_other', 'Другое');
    const addressLocationLabelText = t('cart.address_location_label', 'Точка на карте / Адрес *:');
    const addressPlaceholderText = t('cart.address_placeholder', 'Улица, дом или ссылка на карту');
    const mapHintText = t('cart.map_hint', 'Перетащите метку 📍 для выбора точки');
    const geodataPrivacyHintText = t('cart.geodata_privacy_hint', 'Конфиденциальность геоданных');
    const geodataBtnTitle = t('cart.geodata_btn_label', 'Подробнее о геоданных');
    const defaultZoneStatusText = t('cart.zone_1_name', 'Зона 1: Центр ($1.00)');
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
    let address = (this.userProfile && this.userProfile.address) || localStorage.getItem('freshmarket_default_address') || localStorage.getItem('freshmarket_customer_address') || '';
    let addressName = (this.userProfile && this.userProfile.address_name) || localStorage.getItem('freshmarket_customer_address_name') || '';

    if (!addressName && address && address.includes(': ')) {
      const match = address.match(/^([^:(]+):\s+(.+)$/);
      if (match && !match[1].startsWith('http')) {
        addressName = match[1].trim();
        address = match[2].trim();
      }
    }
    const phoneMeta = getPhoneLabelAndPlaceholder(currentMessenger);

    const currentLang = window.i18n?.currentLang || 'ru';
    const langBadges = { ru: '🇷🇺 RU', en: '🇬🇧 EN', fr: '🇫🇷 FR', ua: '🇺🇦 UA', km: '🇰🇭 KM' };
    const activeLangBadge = langBadges[currentLang] || '🇷🇺 RU';

    const isAuthenticated = !!this.currentUser;
    const userName = isAuthenticated ? (this.userProfile?.full_name || this.currentUser.user_metadata?.full_name || this.currentUser.user_metadata?.name || this.currentUser.email || defaultCustomer) : defaultCustomer;
    const userEmail = isAuthenticated ? (this.userProfile?.email || this.currentUser.email || '') : '';
    const userAvatarUrl = isAuthenticated ? (this.userProfile?.avatar_url || this.currentUser.user_metadata?.avatar_url || this.currentUser.user_metadata?.picture || '') : '';

    const profilePresetKey = this.resolveAddressPresetKey(addressName);
    const effectiveProfilePreset = profilePresetKey || 'home';
    const isProfileHomeActive = effectiveProfilePreset === 'home';
    const isProfileOfficeActive = effectiveProfilePreset === 'office';
    const isProfileVillaActive = effectiveProfilePreset === 'villa';
    const isProfileOtherActive = effectiveProfilePreset === 'other';
    let localizedProfileAddrName = addressName || '';
    if (profilePresetKey && ['home', 'office', 'villa'].includes(profilePresetKey)) {
      localizedProfileAddrName = window.i18n ? window.i18n.t(`cart.preset_${profilePresetKey}`) : addressName;
    }

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
                <div style="font-size: 28px; width: 44px; height: 44px; border-radius: 50%; background: var(--bg-main, #f5f5f7); display: flex; align-items: center; justify-content: center; border: 1px solid var(--border-subtle); overflow: hidden; flex-shrink: 0;">
                  ${userAvatarUrl ? `<img src="${this.sanitizeUrl(userAvatarUrl)}" alt="${this.escapeHtml(userName)}" referrerpolicy="no-referrer" style="width: 100%; height: 100%; object-fit: cover; border-radius: 50%;" />` : '👤'}
                </div>
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

            <!-- Custom Location / Address Name (e.g. Home, Office, Villa, Other) -->
            <div class="form-group" style="margin-top: 10px; margin-bottom: 8px;">
              <label class="field-label" for="profileAddressName" style="margin-bottom: 2px;">${addressNameLabelText}</label>
              <div class="messenger-selector address-preset-selector" id="profileAddressPresetSelector" style="margin-top: 6px; margin-bottom: 8px;">
                <button type="button" class="messenger-pill address-preset-pill ${isProfileHomeActive ? 'active' : ''}" data-preset="home">${presetHomeText}</button>
                <button type="button" class="messenger-pill address-preset-pill ${isProfileOfficeActive ? 'active' : ''}" data-preset="office">${presetOfficeText}</button>
                <button type="button" class="messenger-pill address-preset-pill ${isProfileVillaActive ? 'active' : ''}" data-preset="villa">${presetVillaText}</button>
                <button type="button" class="messenger-pill address-preset-pill ${isProfileOtherActive ? 'active' : ''}" data-preset="other">${presetOtherText}</button>
              </div>
              <input type="text" id="profileAddressName" class="text-input" placeholder="${addressNamePlaceholderText}" value="${this.escapeHtml(localizedProfileAddrName)}" />
            </div>

            <label class="field-label" for="profileAddress" style="margin-top: 6px;">${addressLocationLabelText}</label>
            <div class="input-action-wrapper">
              <input type="text" id="profileAddress" class="text-input" placeholder="${addressPlaceholderText}" value="${this.escapeHtml(address)}" />
              <button type="button" class="input-trailing-btn" id="btnGetProfileLocation" title="Моё местоположение" aria-label="Моё местоположение">
                📍
              </button>
            </div>

            <!-- Mini-Map Interactive Delivery Radius for Profile -->
            <div class="delivery-mini-map-wrap" id="profileMiniMapWrap">
              <div id="profileMiniMap" class="delivery-mini-map"></div>
              <div class="delivery-map-status-bar" id="profileMapStatusBar">
                <span class="delivery-map-status-badge" id="profileMapStatusBadge">
                  <span>📍</span> <span id="profileMapStatusText">${defaultZoneStatusText}</span>
                </span>
                <span class="delivery-map-status-hint">${mapHintText}</span>
              </div>
            </div>
            <div class="delivery-map-privacy-note" id="btnProfileGeodataPrivacyWrap" role="button" tabindex="0">
              <span>${geodataPrivacyHintText}</span>
              <button type="button" class="btn-help-badge" id="btnProfileGeodataPrivacy" aria-label="Подробнее о геоданных" title="${geodataBtnTitle}">?</button>
            </div>
            
            <button type="button" class="btn btn-primary" id="btnSaveProfileDetails" style="margin-top: 10px; width: 100%;">
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
        if (section) {
          section.classList.toggle('is-collapsed');
          if (section.id === 'profileSectionContacts' && !section.classList.contains('is-collapsed')) {
            setTimeout(() => {
              if (this.profileMap) this.profileMap.invalidateSize({ pan: false });
            }, 340);
          }
        }
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

    // Profile address preset pills handler
    const profileAddrNameInput = document.getElementById('profileAddressName');
    const profilePresetPills = document.querySelectorAll('#profileAddressPresetSelector .address-preset-pill, #profileAddressPresetSelector .messenger-pill');

    const syncProfilePresetPills = (val) => {
      const isFocused = profileAddrNameInput && document.activeElement === profileAddrNameInput;
      let targetKey = null;
      if (val) {
        targetKey = this.resolveAddressPresetKey(val);
      } else if (isFocused) {
        targetKey = 'other';
      } else {
        targetKey = 'home';
      }
      profilePresetPills.forEach((pill) => {
        const presetKey = pill.dataset.preset;
        pill.classList.toggle('active', presetKey === targetKey);
      });
    };

    if (profileAddrNameInput) {
      profileAddrNameInput.addEventListener('input', () => {
        syncProfilePresetPills(profileAddrNameInput.value);
      });
      profileAddrNameInput.addEventListener('focus', () => {
        if (!profileAddrNameInput.value.trim()) {
          syncProfilePresetPills('other');
        }
      });
      profileAddrNameInput.addEventListener('blur', () => {
        if (!profileAddrNameInput.value.trim()) {
          syncProfilePresetPills('');
        }
      });
    }

    profilePresetPills.forEach((pill) => {
      pill.addEventListener('click', (e) => {
        e.preventDefault();
        const presetKey = pill.dataset.preset;
        if (!profileAddrNameInput) return;

        this.isCartAddressCustomized = true;

        if (presetKey === 'other') {
          const isStandard = ['home', 'office', 'villa'].some((k) => {
            const tr = (window.i18n ? window.i18n.t(`cart.preset_${k}`) : '').trim().toLowerCase();
            return tr && profileAddrNameInput.value.trim().toLowerCase() === tr;
          });
          if (isStandard) {
            profileAddrNameInput.value = '';
          }
          profileAddrNameInput.focus();
          syncProfilePresetPills('other');
        } else {
          const text = (window.i18n ? window.i18n.t(`cart.preset_${presetKey}`) : pill.textContent).trim();
          profileAddrNameInput.value = text;
          syncProfilePresetPills(presetKey);
        }
      });
    });

    // Save Contacts click handler
    document.getElementById('btnSaveProfileDetails')?.addEventListener('click', async () => {
      let pAddressName = document.getElementById('profileAddressName')?.value.trim() || '';
      const pPhone = document.getElementById('profilePhone')?.value.trim() || '';
      const pAddress = document.getElementById('profileAddress')?.value.trim() || '';
      if (!pPhone) {
        this.showToast(window.i18n ? window.i18n.t('toasts.contacts_required') : '⚠️ Укажите контакт (Telegram / WhatsApp / телефон) для связи');
        document.getElementById('profilePhone')?.focus();
        return;
      }
      if (!pAddressName && pAddress) {
        pAddressName = window.i18n ? window.i18n.t('cart.preset_home') : 'Дом';
      }
      localStorage.setItem('freshmarket_customer_messenger', currentMessenger);
      localStorage.setItem('freshmarket_customer_phone', pPhone);
      localStorage.setItem('freshmarket_customer_address_name', pAddressName);
      if (pAddress) {
        localStorage.setItem('freshmarket_default_address', pAddress);
        localStorage.setItem('freshmarket_customer_address', pAddress);
        const pinCoords = this.profileCustomerMarker ? this.profileCustomerMarker.getLatLng() : null;
        this.saveRecentDeliveryAddress(pAddress, pinCoords ? { lat: pinCoords.lat, lng: pinCoords.lng } : null, pAddressName);

        // If the cart address has not been customized by the user for the current order, update it to the new default:
        if (!this.isCartAddressCustomized) {
          const cartAddrNameInput = document.getElementById('deliveryAddressName');
          if (cartAddrNameInput) {
            cartAddrNameInput.value = pAddressName;
            this.syncCartAddressPresetPills(pAddressName);
          }
          const cartAddrInput = document.getElementById('deliveryAddress');
          if (cartAddrInput) {
            cartAddrInput.value = pAddress;
          }
          if (this.checkoutMap && pinCoords) {
            this.applyLocationToCheckout(pinCoords.lat, pinCoords.lng, true);
          }
        }
      }

      if (this.sb && this.currentUser) {
        try {
          await this.sb.from('profiles').update({
            phone: pPhone,
            address: pAddress,
            messenger: currentMessenger,
            updated_at: new Date().toISOString()
          }).eq('id', this.currentUser.id);
          if (this.userProfile) {
            this.userProfile.phone = pPhone;
            this.userProfile.address = pAddress;
            this.userProfile.messenger = currentMessenger;
          }
        } catch (err) {
          console.warn('[FreshMarket Shop] Error saving profile to Supabase:', err);
        }
      }

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
        if (this.sb && this.currentUser) {
          this.updateProfileField({ shop_layout: this.shopLayout });
        }
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
    document.getElementById('btnLogout')?.addEventListener('click', () => {
      this.handleCustomerLogout();
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

    if (isAuthenticated) {
      this.initProfileMiniMap();
      this.setupProfileLocationHandlers();
    }
  }

  async handleCustomerLogout() {
    // 1. Sign out from Supabase Auth
    if (this.sb) {
      try {
        await this.sb.auth.signOut();
      } catch (err) {
        console.warn('[FreshMarket Shop] SignOut error:', err);
      }
    }

    // 2. Clear all customer personal data, session tokens and order history from localStorage
    const customerKeysToRemove = [
      'freshmarket_customer_auth',
      'freshmarket_user_profile',
      'freshmarket_cart_synced_user',
      'freshmarket_customer_phone',
      'freshmarket_customer_messenger',
      'freshmarket_customer_address',
      'freshmarket_customer_address_name',
      'freshmarket_default_address',
      'freshmarket_recent_addresses',
      'freshmarket_my_orders',
      'freshmarket_cart',
      'freshmarket_cart_updated_at',
      'freshmarket_pending_sync_orders',
      'freshmarket_last_order_timestamp'
    ];
    customerKeysToRemove.forEach((k) => localStorage.removeItem(k));

    // 3. Reset in-memory application state
    this.currentUser = null;
    this.userProfile = null;
    this.cart = [];
    this.deliveryDistanceKm = 0;
    this.deliveryFee = 0;
    this.currentDeliveryZone = null;
    this.currentDeliveryFee = null;
    this.isCartAddressCustomized = false;
    this._lastCheckoutCoordsKey = null;
    this._lastProfileCoordsKey = null;

    // 4. Reset Profile Map & Leaflet Markers
    if (this.profileMap) {
      try { this.profileMap.remove(); } catch (_) {}
      this.profileMap = null;
      this.profileCustomerMarker = null;
      this.profileRoutePolyline = null;
    }
    if (this.checkoutCustomerMarker && this.checkoutMap) {
      try {
        this.checkoutMap.removeLayer(this.checkoutCustomerMarker);
      } catch (_) {}
      this.checkoutCustomerMarker = null;
    }
    if (this.checkoutRoutePolyline && this.checkoutMap) {
      try {
        this.checkoutMap.removeLayer(this.checkoutRoutePolyline);
      } catch (_) {}
      this.checkoutRoutePolyline = null;
    }
    if (this.checkoutMap) {
      const marketCoords = window.MARKET_COORDS || { lat: 10.6120, lng: 104.1780 };
      try {
        this.checkoutMap.setView([marketCoords.lat, marketCoords.lng], 13);
      } catch (_) {}
    }

    // 5. Reset inputs in Cart and Profile DOM
    const inputIdsToClear = [
      'cartPhone',
      'cartAddress',
      'cartAddressName',
      'cartComment',
      'profilePhone',
      'profileAddress',
      'profileAddressName'
    ];
    inputIdsToClear.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    // 6. Reset UI components
    this.syncCartAddressPresetPills('');
    const recentContainer = document.getElementById('recentLocationsContainer');
    if (recentContainer) recentContainer.style.display = 'none';
    const recentList = document.getElementById('recentLocationsList');
    if (recentList) recentList.innerHTML = '';

    // 7. Update Cart, Orders and Header UI
    this.updateCartCountBadge();
    this.updateFloatingCartBar();
    this.updateHeaderUi();

    if (this.currentView === 'orders') {
      this.switchView('catalog');
    } else if (this.currentView === 'cart') {
      this.renderCartModalList();
      this.prefillCheckoutData();
    } else if (this.currentView === 'profile') {
      this.renderProfileView();
    } else {
      this.renderProfileView();
    }

    this.showToast(window.i18n ? window.i18n.t('toasts.logged_out') : 'Вы вышли из профиля');
  }

  initProfileMiniMap() {
    const mapContainer = document.getElementById('profileMiniMap');
    if (!mapContainer || typeof L === 'undefined') return;

    if (this.profileMap) {
      try {
        this.profileMap.remove();
      } catch (_) {}
      this.profileMap = null;
      this.profileCustomerMarker = null;
      this.profileRoutePolyline = null;
    }

    const marketCoords = window.MARKET_COORDS || { lat: 10.6120, lng: 104.1780 };

    this.profileMap = L.map('profileMiniMap', {
      center: [marketCoords.lat, marketCoords.lng],
      zoom: 14.2,
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      subdomains: 'abc',
      maxZoom: 19
    }).addTo(this.profileMap);

    const hubIcon = L.divIcon({
      className: 'checkout-hub-pin',
      html: '<div style="background: var(--accent-emerald, #10b981); width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid #ffffff; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.45); display: flex; align-items: center; justify-content: center; font-size: 13px;">🛒</div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13]
    });
    L.marker([marketCoords.lat, marketCoords.lng], { icon: hubIcon }).addTo(this.profileMap);

    L.circle([marketCoords.lat, marketCoords.lng], {
      radius: 6000,
      color: '#10b981',
      fillColor: '#10b981',
      fillOpacity: 0.04,
      weight: 1,
      dashArray: '3, 6'
    }).addTo(this.profileMap);

    L.circle([marketCoords.lat, marketCoords.lng], {
      radius: 3000,
      color: '#10b981',
      fillColor: '#10b981',
      fillOpacity: 0.08,
      weight: 1.2
    }).addTo(this.profileMap);

    L.circle([marketCoords.lat, marketCoords.lng], {
      radius: 1000,
      color: '#059669',
      fillColor: '#10b981',
      fillOpacity: 0.16,
      weight: 1.5
    }).addTo(this.profileMap);

    const pinIcon = L.divIcon({
      className: 'checkout-customer-pin',
      html: '<span>📍</span>',
      iconSize: [28, 28],
      iconAnchor: [14, 26]
    });

    this.profileCustomerMarker = L.marker([marketCoords.lat, marketCoords.lng], {
      icon: pinIcon,
      draggable: true
    }).addTo(this.profileMap);

    this.profileCustomerMarker.on('dragend', async (e) => {
      const pos = e.target.getLatLng();
      await this.applyLocationToProfile(pos.lat, pos.lng, false);
    });

    this.profileMap.on('click', async (e) => {
      const pos = e.latlng;
      this.profileCustomerMarker.setLatLng(pos);
      await this.applyLocationToProfile(pos.lat, pos.lng, false);
    });

    setTimeout(() => {
      if (this.profileMap) {
        this.profileMap.invalidateSize({ pan: false });
        const addressInput = document.getElementById('profileAddress');
        const coords = typeof extractCoordsFromText === 'function' ? extractCoordsFromText(addressInput?.value) : null;
        if (coords) {
          const coordsKey = `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
          if (this._lastProfileCoordsKey !== coordsKey) {
            this._lastProfileCoordsKey = coordsKey;
            this.applyLocationToProfile(coords.lat, coords.lng, true);
          }
        } else {
          if (!this._lastProfileCoordsKey) {
            this._lastProfileCoordsKey = 'default';
            this.profileMap.setView([marketCoords.lat, marketCoords.lng], 13);
          }
        }
      }
    }, 340);
  }

  updateProfileDeliveryMapBadge(zoneInfo, roadKm, durationMin) {
    const badgeText = document.getElementById('profileMapStatusText');
    if (!badgeText) return;
    const feeStr = `$${Number(zoneInfo.fee || 1).toFixed(2)}`;
    const byRoadText = window.i18n ? window.i18n.t('cart.by_road') : 'по дороге';
    const minText = window.i18n ? window.i18n.t('cart.min') : 'мин';
    const kmUnit = window.i18n ? window.i18n.t('common.unit_km') : 'км';
    const zoneName = (zoneInfo.zoneKey && window.i18n) ? window.i18n.t(`cart.${zoneInfo.zoneKey}`) : zoneInfo.name;

    let infoStr = '';
    if (roadKm !== undefined) {
      infoStr = ` • ${roadKm} ${kmUnit} ${byRoadText}`;
      if (durationMin !== undefined) {
        infoStr += ` (~${durationMin} ${minText})`;
      }
    }
    badgeText.textContent = `${zoneName} (${feeStr})${infoStr}`;
  }

  async applyLocationToProfile(lat, lng, panMap = true) {
    const marketCoords = window.MARKET_COORDS || { lat: 10.6120, lng: 104.1780 };
    this._lastProfileCoordsKey = `${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;

    if (this.profileCustomerMarker) {
      this.profileCustomerMarker.setLatLng([lat, lng]);
    }

    let routeInfo = null;
    if (typeof window.calculateRoadDistanceAndRoute === 'function') {
      routeInfo = await window.calculateRoadDistanceAndRoute(marketCoords.lat, marketCoords.lng, lat, lng);
    } else {
      const dist = calculateDistanceKm(lat, lng, marketCoords.lat, marketCoords.lng);
      routeInfo = { roadDistanceKm: dist, durationMin: Math.max(1, Math.round(dist * 2.5)), coordinates: [[marketCoords.lat, marketCoords.lng], [lat, lng]] };
    }

    const zoneInfo = getDeliveryZoneByDistance(routeInfo.roadDistanceKm);

    if (this.profileMap && routeInfo.coordinates && routeInfo.coordinates.length > 0) {
      if (this.profileRoutePolyline) {
        this.profileMap.removeLayer(this.profileRoutePolyline);
        this.profileRoutePolyline = null;
      }
      this.profileRoutePolyline = L.polyline(routeInfo.coordinates, {
        color: '#10b981',
        weight: 4,
        opacity: 0.85,
        lineJoin: 'round',
        lineCap: 'round'
      }).addTo(this.profileMap);

      if (panMap) {
        this.profileMap.flyToBounds([[marketCoords.lat, marketCoords.lng], [lat, lng]], {
          padding: [28, 28],
          maxZoom: 15.5,
          duration: 1.1,
          easeLinearity: 0.25
        });
      }
    } else if (panMap && this.profileMap) {
      this.profileMap.flyTo([lat, lng], 14.5, { duration: 0.9 });
    }

    this.updateProfileDeliveryMapBadge(zoneInfo, routeInfo.roadDistanceKm, routeInfo.durationMin);

    const mapUrl = `https://maps.google.com/?q=${Number(lat).toFixed(5)},${Number(lng).toFixed(5)}`;
    const addressInput = document.getElementById('profileAddress');
    if (!addressInput) return;

    let placeName = '';
    if (typeof window.reverseGeocodeCoords === 'function') {
      placeName = await window.reverseGeocodeCoords(lat, lng);
    }

    if (placeName) {
      addressInput.value = `${placeName} (${mapUrl})`;
    } else {
      addressInput.value = mapUrl;
    }
  }

  setupProfileLocationHandlers() {
    const btnGetLocation = document.getElementById('btnGetProfileLocation');
    const addressInput = document.getElementById('profileAddress');
    if (!btnGetLocation || !addressInput) return;

    btnGetLocation.addEventListener('click', () => {
      if (!navigator.geolocation) {
        this.showToast(window.i18n ? window.i18n.t('toasts.location_error') : 'Геолокация не поддерживается вашим браузером');
        return;
      }

      btnGetLocation.disabled = true;
      btnGetLocation.style.opacity = '0.5';

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          btnGetLocation.disabled = false;
          btnGetLocation.style.opacity = '1';

          const lat = position.coords.latitude;
          const lng = position.coords.longitude;

          await this.applyLocationToProfile(lat, lng, true);

          this.showToast(window.i18n ? window.i18n.t('toasts.location_detected') : '📍 Местоположение определено');
        },
        (error) => {
          btnGetLocation.disabled = false;
          btnGetLocation.style.opacity = '1';
          console.warn('Geolocation error in profile:', error);
          this.showToast(window.i18n ? window.i18n.t('toasts.location_error') : 'Не удалось определить координаты. Укажите адрес вручную');
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
      );
    });

    addressInput.addEventListener('input', (e) => {
      const val = addressInput.value.trim();
      const coords = typeof extractCoordsFromText === 'function' ? extractCoordsFromText(val) : null;
      if (coords) {
        this.applyLocationToProfile(coords.lat, coords.lng, true);
      }
    });

    const btnGeodataPrivacy = document.getElementById('btnProfileGeodataPrivacy');
    if (btnGeodataPrivacy) {
      btnGeodataPrivacy.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showGeodataPrivacyDialog();
      });
    }

    const btnProfileGeodataWrap = document.getElementById('btnProfileGeodataPrivacyWrap');
    if (btnProfileGeodataWrap) {
      btnProfileGeodataWrap.addEventListener('click', (e) => {
        e.preventDefault();
        this.showGeodataPrivacyDialog();
      });
      btnProfileGeodataWrap.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.showGeodataPrivacyDialog();
        }
      });
    }
  }

  updateHeaderUi() {
    const isAuth = this.isUserAuthenticated();

    // 1. Language Picker (Visible only for guests)
    if (this.headerLangPicker) {
      this.headerLangPicker.style.display = isAuth ? 'none' : 'inline-flex';
    }

    // 2. Header Cart Button (Visible only for authenticated users)
    if (this.headerCartBtn) {
      this.headerCartBtn.style.display = isAuth ? 'inline-flex' : 'none';
    }

    // 3. Header Avatar / Profile Button
    if (this.headerAvatarBtn) {
      if (isAuth) {
        const avatarUrl = this.userProfile?.avatar_url || this.currentUser?.user_metadata?.avatar_url || this.currentUser?.user_metadata?.picture || '';
        const userName = this.userProfile?.full_name || this.currentUser?.user_metadata?.full_name || this.currentUser?.email || '';
        const initial = userName ? userName.charAt(0).toUpperCase() : '👤';

        if (avatarUrl) {
          this.headerAvatarBtn.innerHTML = `
            <img src="${this.sanitizeUrl(avatarUrl)}" alt="${this.escapeHtml(userName)}" referrerpolicy="no-referrer" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" />
            <span style="display: none; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 13.5px; font-weight: 700; color: var(--text-primary);">${this.escapeHtml(initial)}</span>
          `;
        } else {
          this.headerAvatarBtn.innerHTML = `<span style="display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; font-size: 13.5px; font-weight: 700; color: var(--text-primary);">${this.escapeHtml(initial)}</span>`;
        }
      } else {
        // Guest: clean neutral silhouette
        this.headerAvatarBtn.innerHTML = `
          <svg class="header-avatar-silhouette" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        `;
      }
    }

    if (this.btnShopHeaderLogout) {
      this.btnShopHeaderLogout.style.display = isAuth ? 'inline-flex' : 'none';
    }

    // 4. Bottom Nav Orders Button (Visible only for authenticated users)
    if (this.navOrders) {
      this.navOrders.style.display = isAuth ? '' : 'none';
    }
    if (!isAuth && this.currentView === 'orders') {
      this.switchView('catalog');
    }
  }

  updateUserAvatar() {
    this.updateHeaderUi();
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

  // ------------------------------------------------------------------------
  // 13.1 Alert / Error Dialog Controller
  // ------------------------------------------------------------------------
  showAlertDialog({ title, message, buttonText, onConfirm } = {}) {
    if (!this.alertDialog) {
      this.alertDialog = document.getElementById('alertDialog');
      this.dialogTitle = document.getElementById('dialogTitle');
      this.dialogMessage = document.getElementById('dialogMessage');
      this.dialogBtnOk = document.getElementById('dialogBtnOk');
    }
    if (!this.alertDialog) {
      alert(`${title ? title + '\n\n' : ''}${message || ''}`);
      if (typeof onConfirm === 'function') onConfirm();
      return;
    }

    const defaultTitle = window.i18n ? window.i18n.t('dialogs.generic_error_title') : 'Внимание';
    const defaultBtn = window.i18n ? window.i18n.t('dialogs.btn_ok') : 'Понятно';

    if (this.dialogTitle) this.dialogTitle.textContent = title || defaultTitle;
    if (this.dialogMessage) this.dialogMessage.textContent = message || '';
    if (this.dialogBtnOk) this.dialogBtnOk.textContent = buttonText || defaultBtn;

    this.alertDialog.style.display = 'flex';
    document.body.classList.add('modal-open');

    const handleDismiss = () => {
      this.closeAlertDialog();
      if (typeof onConfirm === 'function') onConfirm();
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', onKeyDown);
        handleDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown, { once: true });

    if (this.dialogBtnOk) {
      this.dialogBtnOk.onclick = () => {
        window.removeEventListener('keydown', onKeyDown);
        handleDismiss();
      };
    }

    this.alertDialog.onclick = (e) => {
      if (e.target === this.alertDialog) {
        window.removeEventListener('keydown', onKeyDown);
        handleDismiss();
      }
    };
  }

  updateModalOpenState() {
    const isAlertOpen = this.alertDialog && this.alertDialog.style.display === 'flex';
    const isProductSheetOpen = this.productBottomSheet && this.productBottomSheet.style.display === 'flex';
    const isOnboardingOpen = this.onboardingOverlay && this.onboardingOverlay.style.display === 'flex';
    const isGeodataOpen = this.geodataDialog && this.geodataDialog.style.display === 'flex';

    if (!isAlertOpen && !isProductSheetOpen && !isOnboardingOpen && !isGeodataOpen) {
      document.body.classList.remove('modal-open');
    } else {
      document.body.classList.add('modal-open');
    }
  }

  closeAlertDialog() {
    if (this.alertDialog) {
      this.alertDialog.style.display = 'none';
    }
    this.updateModalOpenState();
  }

  showGeodataPrivacyDialog() {
    if (!this.geodataDialog) {
      this.geodataDialog = document.getElementById('geodataPrivacyDialog');
      this.btnGeodataModalClose = document.getElementById('btnGeodataModalClose');
    }
    if (!this.geodataDialog) return;

    this.geodataDialog.style.display = 'flex';
    document.body.classList.add('modal-open');

    const handleDismiss = () => {
      this.closeGeodataPrivacyDialog();
    };

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        window.removeEventListener('keydown', onKeyDown);
        handleDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown, { once: true });

    if (this.btnGeodataModalClose) {
      this.btnGeodataModalClose.onclick = () => {
        window.removeEventListener('keydown', onKeyDown);
        handleDismiss();
      };
    }

    this.geodataDialog.onclick = (e) => {
      if (e.target === this.geodataDialog) {
        window.removeEventListener('keydown', onKeyDown);
        handleDismiss();
      }
    };
  }

  closeGeodataPrivacyDialog() {
    if (this.geodataDialog) {
      this.geodataDialog.style.display = 'none';
    }
    this.updateModalOpenState();
  }

  getFriendlyErrorMessage(err) {
    const rawMsg = err?.message || String(err || '');
    if (/maximum.*pending.*orders|pending.*orders.*limit|too many pending|active.*orders/i.test(rawMsg)) {
      return {
        title: window.i18n ? window.i18n.t('dialogs.max_pending_title') : 'Заказы в обработке',
        message: window.i18n ? window.i18n.t('dialogs.max_pending_desc') : 'У вас уже есть 5 активных заказов, которые ожидают утренней закупки на рынке. Новые заказы можно будет оформить после доставки текущих.'
      };
    }
    if (/rate limit|exceeded.*minutes|wait.*minutes|between orders/i.test(rawMsg)) {
      return {
        title: window.i18n ? window.i18n.t('dialogs.rate_limit_title') : 'Подождите немного',
        message: window.i18n ? window.i18n.t('dialogs.rate_limit_desc') : 'Вы недавно отправили заказ. Пожалуйста, подождите 2 минуты перед отправкой следующей заявки.'
      };
    }
    if (/customer name|delivery address|phone|contacts|required field/i.test(rawMsg)) {
      return {
        title: window.i18n ? window.i18n.t('dialogs.contacts_required_title') : 'Укажите контакты',
        message: window.i18n ? window.i18n.t('dialogs.contacts_required_desc') : 'Пожалуйста, укажите имя, телефон и адрес доставки для связи с закупщиком.'
      };
    }
    return {
      title: window.i18n ? window.i18n.t('dialogs.generic_error_title') : 'Внимание',
      message: rawMsg || (window.i18n ? window.i18n.t('dialogs.generic_error_desc') : 'Не удалось отправить заказ. Пожалуйста, проверьте подключение к интернету и повторите попытку.')
    };
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

  sanitizeUrl(url) {
    if (typeof window.sanitizeUrl === 'function') {
      return window.sanitizeUrl(url);
    }
    return (url && typeof url === 'string') ? url.trim().replace(/"/g, '&quot;') : '';
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
