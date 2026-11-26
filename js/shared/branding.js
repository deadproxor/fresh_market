/**
 * Riper — Centralized Brand Identity & Naming System (branding.js)
 * Single Source of Truth for Brand Name, Logos, Slogans, Keywords, and Core Service Aspects.
 */

(function () {
  'use strict';

  const LEGACY_PRESET_KEY = 'freshmarket_brand_preset';
  const STORAGE_LOGO_MODE_KEY = 'freshmarket_brand_logo_mode';

  // ==========================================================================
  // 1. SHARED MULTILINGUAL SLOGANS, TAGLINES, KEYWORDS & SERVICE ASPECTS
  // ==========================================================================
  const BASE_SLOGANS = {
    ru: 'Доставка свежих продуктов',
    en: 'Fresh Produce Delivery',
    km: 'ដឹកជញ្ជូនបន្លែផ្លែឈើស្រស់ៗ',
    fr: 'Livraison de produits frais',
    ua: 'Доставка свіжих продуктів'
  };

  const BASE_TAGLINES = {
    ru: 'Консьерж-доставка свежих продуктов с утреннего рынка прямо к вашей двери',
    en: 'Honest morning market produce delivered before noon',
    km: 'សេវាកម្មទិញ និងដឹកជញ្ជូនបន្លែផ្លែឈើស្រស់ពីផ្សារព្រឹកដោយផ្ទាល់',
    fr: 'Service de conciergerie et livraison de produits frais du marché du matin',
    ua: 'Консьєрж-доставка свіжих продуктів з ранкового ринку прямо до ваших дверей'
  };

  const BASE_KEYWORDS = {
    ru: 'свежие продукты, утренний рынок, консьерж-доставка, овощи, фрукты, морепродукты, честные чеки',
    en: 'fresh produce, morning market, personal shopper, concierge delivery, vegetables, fruits, seafood, honest receipts',
    km: 'បន្លែស្រស់, ផ្លែឈើស្រស់, ផ្សារព្រឹក, ដឹកជញ្ជូនដល់ផ្ទះ',
    fr: 'produits frais, marché du matin, conciergerie, livraison, légumes, fruits, fruits de mer',
    ua: 'свіжі продукти, ранковий ринок, консьєрж-доставка, овочі, фрукти, морепродукти, чесні чеки'
  };

  const BASE_ASPECTS = {
    cutoffTime: '23:00',
    dawnTime: '05:00',
    deliveryWindow: '09:00–12:00',
    serviceFee: '10%'
  };

  // ==========================================================================
  // 2. PRIMARY BRAND CONFIGURATION (RIPER)
  // ==========================================================================
  const BRAND_CONFIG = {
    id: 'riper',
    name: 'Riper',
    shortName: 'Riper',
    adminTitle: 'Riper Admin',
    orderPrefix: 'RP',
    adminEmailPlaceholder: 'admin@riper.app',
    logos: {
      mode: 'image', // 'image' | 'svg' | 'emoji'
      headerLogo: 'assets/brand/logo-riper.png',
      splashLogo: 'assets/brand/logo-riper.png',
      pwaIcon192: 'assets/icon-192.svg',
      pwaIcon512: 'assets/icon-512.svg',
      emojiShop: '🧺',
      emojiDefault: '🌱'
    },
    slogans: { ...BASE_SLOGANS },
    taglines: { ...BASE_TAGLINES },
    keywords: { ...BASE_KEYWORDS },
    aspects: { ...BASE_ASPECTS }
  };

  class BrandManager {
    constructor() {
      let savedLogoMode = null;
      try {
        localStorage.removeItem(LEGACY_PRESET_KEY);
        const modeFromStorage = localStorage.getItem(STORAGE_LOGO_MODE_KEY);
        if (modeFromStorage && ['image', 'svg', 'emoji'].includes(modeFromStorage)) {
          savedLogoMode = modeFromStorage;
        }
      } catch (_) { }

      this.activeId = BRAND_CONFIG.id;
      this.current = JSON.parse(JSON.stringify(BRAND_CONFIG));
      if (savedLogoMode) {
        this.current.logos.mode = savedLogoMode;
      }
    }

    getLang() {
      if (window.i18n && window.i18n.currentLang) {
        return window.i18n.currentLang;
      }
      const htmlLang = document.documentElement.getAttribute('lang');
      return htmlLang || 'ru';
    }

    resolveAssetPath(relPath) {
      if (!relPath) return '';
      if (/^(https?:|data:|blob:|\/)/.test(relPath)) return relPath;
      const clean = relPath.replace(/^\.?\//, '');
      const isSubdir = typeof window !== 'undefined' && window.location && window.location.pathname.includes('/admin/');
      return isSubdir ? `../${clean}` : `./${clean}`;
    }

    getSlogan(lang = null) {
      const l = lang || this.getLang();
      return (this.current.slogans && (this.current.slogans[l] || this.current.slogans.ru)) || '';
    }

    getTagline(lang = null) {
      const l = lang || this.getLang();
      return (this.current.taglines && (this.current.taglines[l] || this.current.taglines.ru)) || '';
    }

    getKeywords(lang = null) {
      const l = lang || this.getLang();
      return (this.current.keywords && (this.current.keywords[l] || this.current.keywords.ru)) || '';
    }

    /**
     * Returns formatted console log prefix, e.g. "[Riper]" or "[Riper Shop]"
     */
    getLogPrefix(scope = '') {
      const name = this.current?.name || 'Riper';
      return scope ? `[${name} ${scope}]` : `[${name}]`;
    }

    /**
     * Returns interpolation tokens used automatically by i18n.t()
     */
    getInterpolationTokens(lang = null) {
      const b = this.current;
      const a = b.aspects || BASE_ASPECTS;
      return {
        brand: b.name,
        brand_short: b.shortName || b.name,
        brand_admin: b.adminTitle || `${b.name} Admin`,
        brand_slogan: this.getSlogan(lang),
        brand_tagline: this.getTagline(lang),
        cutoff_time: a.cutoffTime,
        dawn_time: a.dawnTime,
        delivery_window: a.deliveryWindow,
        service_fee: a.serviceFee
      };
    }

    /**
     * Render logo HTML inside a container element
     */
    renderLogoInto(el) {
      if (!el) return;
      const role = el.getAttribute('data-brand-logo') || 'header';
      const logos = this.current.logos || {};
      const mode = logos.mode || 'image';

      if (mode === 'emoji') {
        const emoji = role === 'shop' || role === 'splash-shop'
          ? (logos.emojiShop || '🧺')
          : (logos.emojiDefault || '🌱');
        el.innerHTML = `<span class="brand-logo-emoji">${emoji}</span>`;
        return;
      }

      const rawSrc = mode === 'svg'
        ? (logos.pwaIcon192 || 'assets/icon-192.svg')
        : (role.includes('splash') ? (logos.splashLogo || logos.headerLogo) : logos.headerLogo);

      const resolvedSrc = this.resolveAssetPath(rawSrc);
      const sizeClass = role.includes('splash')
        ? 'brand-logo-img brand-logo-splash'
        : (role === 'login' ? 'brand-logo-img brand-logo-login' : 'brand-logo-img');

      el.innerHTML = `<img src="${resolvedSrc}" class="${sizeClass}" alt="${this.current.name}" loading="eager" />`;
    }

    /**
     * Apply current brand identity to DOM elements and meta tags
     */
    applyToDOM(root = document) {
      if (!root) return;
      const b = this.current;
      const lang = this.getLang();

      // 1. Brand Name elements
      root.querySelectorAll('[data-brand-name]').forEach(el => {
        el.textContent = b.name;
      });

      // 2. Admin Title elements
      root.querySelectorAll('[data-brand-admin-title]').forEach(el => {
        el.textContent = b.adminTitle || `${b.name} Admin`;
      });

      // 3. Slogan elements
      root.querySelectorAll('[data-brand-slogan]').forEach(el => {
        el.textContent = this.getSlogan(lang);
      });

      // 4. Tagline elements
      root.querySelectorAll('[data-brand-tagline]').forEach(el => {
        el.textContent = this.getTagline(lang);
      });

      // 5. Email placeholder inputs
      root.querySelectorAll('[data-brand-email-placeholder]').forEach(el => {
        if (b.adminEmailPlaceholder) {
          el.setAttribute('placeholder', b.adminEmailPlaceholder);
        }
      });

      // 6. Logo containers
      root.querySelectorAll('[data-brand-logo]').forEach(el => {
        this.renderLogoInto(el);
      });

      // 7. Document-level metadata updates
      if (root === document) {
        const appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
        if (appleTitle) appleTitle.setAttribute('content', b.shortName || b.name);

        let metaKeywords = document.querySelector('meta[name="keywords"]');
        if (!metaKeywords && document.head) {
          metaKeywords = document.createElement('meta');
          metaKeywords.setAttribute('name', 'keywords');
          document.head.appendChild(metaKeywords);
        }
        if (metaKeywords) {
          metaKeywords.setAttribute('content', this.getKeywords(lang));
        }

        // Replace legacy brand names in <title>
        if (document.title) {
          document.title = document.title.replace(/\b(FreshMarket|FreshBuddy|Fresh Buddy|Riper)\b/g, b.name);
        }
      }
    }

    /**
     * Switch logo rendering mode ('image' | 'svg' | 'emoji')
     */
    setLogoMode(mode, persist = true) {
      if (!['image', 'svg', 'emoji'].includes(mode)) return false;
      this.current.logos.mode = mode;
      if (persist) {
        try {
          localStorage.setItem(STORAGE_LOGO_MODE_KEY, mode);
        } catch (_) { }
      }
      this.refreshAll();
      return true;
    }

    /**
     * Update arbitrary brand configuration fields at runtime
     */
    updateBrand(partialConfig = {}) {
      if (!partialConfig || typeof partialConfig !== 'object') return;
      if (partialConfig.name) this.current.name = partialConfig.name;
      if (partialConfig.shortName) this.current.shortName = partialConfig.shortName;
      if (partialConfig.adminTitle) this.current.adminTitle = partialConfig.adminTitle;
      if (partialConfig.orderPrefix) this.current.orderPrefix = partialConfig.orderPrefix;
      if (partialConfig.logos && typeof partialConfig.logos === 'object') {
        Object.assign(this.current.logos, partialConfig.logos);
      }
      if (partialConfig.slogans && typeof partialConfig.slogans === 'object') {
        Object.assign(this.current.slogans, partialConfig.slogans);
      }
      if (partialConfig.taglines && typeof partialConfig.taglines === 'object') {
        Object.assign(this.current.taglines, partialConfig.taglines);
      }
      if (partialConfig.aspects && typeof partialConfig.aspects === 'object') {
        Object.assign(this.current.aspects, partialConfig.aspects);
      }
      this.refreshAll();
    }

    refreshAll() {
      this.applyToDOM(document);
      if (window.i18n && window.i18n.isReady) {
        window.i18n.applyToDOM(document);
      }
      window.dispatchEvent(new CustomEvent('freshmarket:brandchange', {
        detail: { brand: this.current }
      }));
    }
  }

  const brandInstance = new BrandManager();
  window.FreshMarketBrand = brandInstance;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => brandInstance.applyToDOM());
    } else {
      brandInstance.applyToDOM();
    }
    window.addEventListener('freshmarket:langchange', () => {
      brandInstance.applyToDOM();
    });
  }
})();
