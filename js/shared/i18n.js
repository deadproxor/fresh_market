/**
 * FreshMarket — Lightweight i18n Localization Engine (i18n.js)
 * Supports RU, UA, EN, KM with Waterfall Language Detection,
 * Reactive DOM bindings, and Dropdown Controller
 */

(function () {
  'use strict';

  const SUPPORTED_LANGS = {
    ru: { code: 'ru', label: 'RU', name: 'Русский', flag: '🇷🇺' },
    ua: { code: 'ua', label: 'UA', name: 'Українська', flag: '🇺🇦' },
    en: { code: 'en', label: 'EN', name: 'English', flag: '🇬🇧' },
    km: { code: 'km', label: 'KM', name: 'ភាសាខ្មែរ', flag: '🇰🇭' }
  };

  const DEFAULT_LANG = 'ru';
  const STORAGE_KEY = 'freshmarket_lang';

  class I18nEngine {
    constructor() {
      this.currentLang = DEFAULT_LANG;
      this.dictionaries = {};
      this.isReady = false;
      this.readyCallbacks = [];
    }

    /**
     * Multi-tier Waterfall Language Detection:
     * 1. URL search param ?lang=...
     * 2. localStorage saved preference
     * 3. Browser/OS language (navigator.languages / navigator.language)
     * 4. Default fallback: 'ru'
     */
    detectLanguage() {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        if (urlLang && SUPPORTED_LANGS[urlLang.toLowerCase()]) {
          return urlLang.toLowerCase();
        }
      } catch (e) {}

      try {
        const savedLang = localStorage.getItem(STORAGE_KEY);
        if (savedLang && SUPPORTED_LANGS[savedLang.toLowerCase()]) {
          return savedLang.toLowerCase();
        }
      } catch (e) {}

      try {
        const browserLangs = navigator.languages || [navigator.language || navigator.userLanguage || ''];
        for (let l of browserLangs) {
          if (!l) continue;
          const code = l.toLowerCase().split('-')[0];
          if (code === 'uk' || code === 'ua') return 'ua';
          if (code === 'ru' || code === 'be') return 'ru';
          if (code === 'km') return 'km';
          if (code === 'en') return 'en';
        }
      } catch (e) {}

      return DEFAULT_LANG;
    }

    /**
     * Resolve base path for /locales/ depending on current page location
     */
    getLocalesBasePath() {
      const path = window.location.pathname;
      if (path.includes('/admin/')) {
        return '../locales/';
      }
      return './locales/';
    }

    /**
     * Fetch and cache dictionary JSON for a language
     */
    async loadDictionary(lang) {
      if (this.dictionaries[lang]) {
        return this.dictionaries[lang];
      }

      const basePath = this.getLocalesBasePath();
      const url = `${basePath}${lang}.json`;

      try {
        const resp = await fetch(url, { cache: 'no-cache' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status} while fetching ${url}`);
        const data = await resp.json();
        this.dictionaries[lang] = data;
        return data;
      } catch (err) {
        console.warn(`[i18n] Failed to load locale "${lang}" from ${url}:`, err);
        // Fallback to empty object so we don't crash
        this.dictionaries[lang] = {};
        return this.dictionaries[lang];
      }
    }

    /**
     * Initialize engine on page load
     */
    async init() {
      this.currentLang = this.detectLanguage();

      // Ensure fallback 'ru' is loaded alongside target language
      await Promise.all([
        this.loadDictionary('ru'),
        this.currentLang !== 'ru' ? this.loadDictionary(this.currentLang) : Promise.resolve()
      ]);

      document.documentElement.setAttribute('lang', this.currentLang);
      this.isReady = true;

      // Apply translations to DOM elements
      this.applyToDOM();

      // Execute queued callbacks
      this.readyCallbacks.forEach(cb => {
        try { cb(this); } catch (e) { console.error(e); }
      });
      this.readyCallbacks = [];

      // Auto-mount any language dropdown placeholders on the page
      this.mountAllLanguageDropdowns();

      return this;
    }

    onReady(callback) {
      if (this.isReady) {
        callback(this);
      } else {
        this.readyCallbacks.push(callback);
      }
    }

    /**
     * Get translated string with fallback and parameter interpolation
     * Usage: i18n.t('cart.total_label') or i18n.t('toasts.item_added', { count: 3 })
     */
    t(keyPath, params = null) {
      if (!keyPath) return '';

      const getNested = (obj, path) => {
        if (!obj) return null;
        const keys = path.split('.');
        let cur = obj;
        for (const k of keys) {
          if (cur && typeof cur === 'object' && k in cur) {
            cur = cur[k];
          } else {
            return null;
          }
        }
        return cur;
      };

      // 1. Check current dictionary
      let val = getNested(this.dictionaries[this.currentLang], keyPath);

      // 2. Fallback to 'ru' if missing
      if (val === null && this.currentLang !== 'ru') {
        val = getNested(this.dictionaries['ru'], keyPath);
      }

      // 3. Fallback to key itself
      if (val === null) {
        return keyPath;
      }

      // Interpolate parameters {paramName}
      if (params && typeof params === 'object' && typeof val === 'string') {
        return val.replace(/\{(\w+)\}/g, (match, pName) => {
          return params[pName] !== undefined ? params[pName] : match;
        });
      }

      return val;
    }

    /**
     * Change language dynamically, update DOM, save preference, and emit event
     */
    async setLanguage(lang) {
      if (!SUPPORTED_LANGS[lang]) {
        console.warn(`[i18n] Unsupported language requested: "${lang}"`);
        return;
      }

      if (this.currentLang === lang && this.dictionaries[lang]) {
        return;
      }

      await this.loadDictionary(lang);
      this.currentLang = lang;

      try {
        localStorage.setItem(STORAGE_KEY, lang);
      } catch (e) {}

      document.documentElement.setAttribute('lang', lang);

      // Update all data-i18n in DOM
      this.applyToDOM();

      // Update dropdown UI labels
      this.updateAllLanguageDropdowns();

      // Emit custom event for components/controllers
      window.dispatchEvent(new CustomEvent('freshmarket:langchange', {
        detail: { lang, info: SUPPORTED_LANGS[lang] }
      }));
    }

    /**
     * Translate DOM elements via data attributes:
     * - [data-i18n="key"] -> textContent
     * - [data-i18n-html="key"] -> innerHTML
     * - [data-i18n-placeholder="key"] -> placeholder
     * - [data-i18n-title="key"] -> title
     * - [data-i18n-alt="key"] -> alt
     */
    applyToDOM(root = document) {
      if (!root) return;

      // textContent
      root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        const translated = this.t(key);
        if (translated && translated !== key) {
          el.textContent = translated;
        }
      });

      // innerHTML
      root.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        const translated = this.t(key);
        if (translated && translated !== key) {
          el.innerHTML = translated;
        }
      });

      // placeholder
      root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        const translated = this.t(key);
        if (translated && translated !== key) {
          el.setAttribute('placeholder', translated);
        }
      });

      // title
      root.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        const translated = this.t(key);
        if (translated && translated !== key) {
          el.setAttribute('title', translated);
        }
      });

      // alt
      root.querySelectorAll('[data-i18n-alt]').forEach(el => {
        const key = el.getAttribute('data-i18n-alt');
        const translated = this.t(key);
        if (translated && translated !== key) {
          el.setAttribute('alt', translated);
        }
      });
    }

    /**
     * Render and wire up language selector dropdown component
     */
    mountLanguageDropdown(container) {
      if (typeof container === 'string') {
        container = document.querySelector(container);
      }
      if (!container) return;

      const current = SUPPORTED_LANGS[this.currentLang] || SUPPORTED_LANGS[DEFAULT_LANG];

      container.classList.add('lang-dropdown-container');
      container.innerHTML = `
        <button type="button" class="lang-dropdown-trigger icon-btn" aria-haspopup="true" aria-expanded="false" title="Выбор языка / Language">
          <span class="lang-flag">${current.flag}</span>
        </button>
        <div class="lang-dropdown-menu" role="menu">
          ${Object.values(SUPPORTED_LANGS).map(item => `
            <button type="button" class="lang-dropdown-item ${item.code === this.currentLang ? 'active' : ''}" data-lang="${item.code}" role="menuitem">
              <span class="lang-item-flag">${item.flag}</span>
              <span class="lang-item-name">${item.name}</span>
              <span class="lang-item-code">${item.label}</span>
              ${item.code === this.currentLang ? '<span class="lang-item-check">✓</span>' : ''}
            </button>
          `).join('')}
        </div>
      `;

      const trigger = container.querySelector('.lang-dropdown-trigger');
      const menu = container.querySelector('.lang-dropdown-menu');

      const toggleMenu = (open) => {
        const isOpen = open !== undefined ? open : !menu.classList.contains('show');
        menu.classList.toggle('show', isOpen);
        trigger.setAttribute('aria-expanded', String(isOpen));
      };

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        // Close any other open dropdowns
        document.querySelectorAll('.lang-dropdown-menu.show').forEach(m => {
          if (m !== menu) m.classList.remove('show');
        });
        toggleMenu();
      });

      menu.querySelectorAll('.lang-dropdown-item').forEach(itemBtn => {
        itemBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetLang = itemBtn.getAttribute('data-lang');
          toggleMenu(false);
          this.setLanguage(targetLang);
        });
      });

      // Global click outside listener
      if (!window._langDropdownGlobalBound) {
        document.addEventListener('click', (e) => {
          if (!e.target.closest('.lang-dropdown-container')) {
            document.querySelectorAll('.lang-dropdown-menu.show').forEach(m => {
              m.classList.remove('show');
              const t = m.previousElementSibling;
              if (t) t.setAttribute('aria-expanded', 'false');
            });
          }
        });
        document.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') {
            document.querySelectorAll('.lang-dropdown-menu.show').forEach(m => {
              m.classList.remove('show');
              const t = m.previousElementSibling;
              if (t) t.setAttribute('aria-expanded', 'false');
            });
          }
        });
        window._langDropdownGlobalBound = true;
      }
    }

    /**
     * Auto-mount all elements matching [data-lang-picker]
     */
    mountAllLanguageDropdowns() {
      document.querySelectorAll('[data-lang-picker]').forEach(el => {
        this.mountLanguageDropdown(el);
      });
    }

    /**
     * Update triggers and active states of all dropdowns when language changes
     */
    updateAllLanguageDropdowns() {
      const current = SUPPORTED_LANGS[this.currentLang] || SUPPORTED_LANGS[DEFAULT_LANG];
      document.querySelectorAll('.lang-dropdown-container').forEach(container => {
        const flagEl = container.querySelector('.lang-flag');
        if (flagEl) flagEl.textContent = current.flag;

        container.querySelectorAll('.lang-dropdown-item').forEach(item => {
          const itemLang = item.getAttribute('data-lang');
          const isActive = itemLang === this.currentLang;
          item.classList.toggle('active', isActive);

          let checkEl = item.querySelector('.lang-item-check');
          if (isActive) {
            if (!checkEl) {
              const span = document.createElement('span');
              span.className = 'lang-item-check';
              span.textContent = '✓';
              item.appendChild(span);
            }
          } else {
            if (checkEl) checkEl.remove();
          }
        });
      });
    }

    getSupportedLanguages() {
      return SUPPORTED_LANGS;
    }
  }

  // Create global singleton
  const i18n = new I18nEngine();

  if (typeof window !== 'undefined') {
    window.i18n = i18n;
    // Auto-init as soon as DOM is ready or immediately if already loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => i18n.init());
    } else {
      i18n.init();
    }
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { i18n, SUPPORTED_LANGS };
  }
})();
