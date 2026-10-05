/**
 * FreshMarket - Pure Vanilla JavaScript Application
 * Zero external libraries / 100% lightweight & offline-ready
 */

// ==========================================================================
// 1. CONSTANTS & INITIAL DATA
// ==========================================================================

const APP_VERSION = '1.4.0';
window.APP_VERSION = APP_VERSION;

// Safe URL sanitizer for image URLs to prevent XSS
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const clean = url.trim();
  if (/^(https?:\/\/|\/|\.\/|\.\.\/|data:image\/)/i.test(clean)) {
    return clean.replace(/"/g, '&quot;');
  }
  return '';
}

// Safe UUID v4 generator for Supabase & LocalStorage
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (e) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const CATEGORIES = [
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

const FORMS = [
  { id: 'whole', label: 'Целый' },
  { id: 'bunch', label: 'Пучок' },
  { id: 'pods', label: 'Стручок' },
  { id: 'root', label: 'Корень' },
  { id: 'sliced', label: 'Нарезка' },
  { id: 'dried', label: 'Сушеный' },
  { id: 'powder', label: 'Молотый' },
  { id: 'paste', label: 'Паста' },
  { id: 'pickled', label: 'Маринованный' },
  { id: 'frozen', label: 'Замороженный' },
  { id: 'custom', label: 'Свой вариант...' }
];

// Produce Dictionary loaded dynamically from external products_dictionary.json + persistent custom extensions
let PRODUCE_DICTIONARY = [];
const CUSTOM_DICT_KEY = 'freshmarket_custom_produce_dictionary';

// Load produce dictionary from standalone JSON file + localStorage custom items
async function loadProduceDictionary() {
  try {
    let response = await fetch('../data/products_dictionary.json');
    if (!response.ok) {
      response = await fetch('./data/products_dictionary.json');
    }
    if (!response.ok) {
      response = await fetch('./products_dictionary.json');
    }
    if (response.ok) {
      PRODUCE_DICTIONARY = await response.json();
    }
  } catch (err) {
    console.warn('[FreshMarket Admin] Could not load external products_dictionary.json, using fallback', err);
  }

  // Merge custom user-added items from localStorage
  try {
    const savedCustom = localStorage.getItem(CUSTOM_DICT_KEY);
    if (savedCustom) {
      const customItems = JSON.parse(savedCustom);
      if (Array.isArray(customItems)) {
        customItems.forEach(custom => {
          const exists = PRODUCE_DICTIONARY.some(p =>
            (p.ru && custom.ru && p.ru.toLowerCase() === custom.ru.toLowerCase()) ||
            (p.en && custom.en && p.en.toLowerCase() === custom.en.toLowerCase())
          );
          if (!exists) {
            PRODUCE_DICTIONARY.unshift(custom);
          }
        });
      }
    }
  } catch (err) {
    console.error('Error loading custom dictionary items', err);
  }

  console.log(`[FreshMarket] Loaded ${PRODUCE_DICTIONARY.length} produce definitions`);
  if (window.app && typeof window.app.updateStats === 'function') {
    window.app.updateStats();
  }
}

// Auto-save new completed product to produce dictionary
function saveCustomProduceToDictionary(product) {
  if (!product.name_ru || !product.name_en || !product.name_kh) return;
  const ru = product.name_ru.trim();
  const en = product.name_en.trim();
  const kh = product.name_kh.trim();
  if (!ru || !en || !kh) return;

  const exists = PRODUCE_DICTIONARY.some(p =>
    (p.ru && p.ru.toLowerCase() === ru.toLowerCase()) ||
    (p.en && p.en.toLowerCase() === en.toLowerCase())
  );

  if (!exists) {
    const newItem = {
      ru,
      en,
      kh,
      cat: product.category || 'Овощи',
      form: product.form || 'Целый',
      desc: product.description || ''
    };
    PRODUCE_DICTIONARY.unshift(newItem);

    try {
      const savedCustom = localStorage.getItem(CUSTOM_DICT_KEY);
      const customItems = savedCustom ? JSON.parse(savedCustom) : [];
      customItems.unshift(newItem);
      localStorage.setItem(CUSTOM_DICT_KEY, JSON.stringify(customItems));
      console.log(`[FreshMarket] Saved new product «${en}» to custom dictionary`);
    } catch (e) {
      console.error('Failed to persist custom dictionary item', e);
    }
  }
}

// Initial immediate fetch
loadProduceDictionary();


// Initial seed products with English transcription in brackets
const INITIAL_PRODUCTS = [
  {
    id: 'prod_1',
    category: 'Зелень и травы',
    name_en: 'Lemongrass',
    name_kh: 'ស្លឹកគ្រៃ (Sloek Krey)',
    name_ru: 'Лемонграсс',
    form: 'Пучок',
    description: 'Свежие стебли лимонного сорго с плотным основанием',
    img_url: '',
    created_at: new Date().toISOString()
  },
  {
    id: 'prod_2',
    category: 'Корни и пряности',
    name_en: 'Galangal',
    name_kh: 'រំដេង (Romdeng)',
    name_ru: 'Галангал',
    form: 'Корень',
    description: 'Плотный корень с ярким хвойно-цитрусовым ароматом для карри и супов',
    img_url: '',
    created_at: new Date().toISOString()
  },
  {
    id: 'prod_3',
    category: 'Зелень и травы',
    name_en: 'Morning Glory',
    name_kh: 'ត្រកួន (Trakoun)',
    name_ru: 'Водный шпинат',
    form: 'Пучок',
    description: 'Для быстрого обжаривания с чесноком на сильном огне',
    img_url: '',
    created_at: new Date().toISOString()
  },
  {
    id: 'prod_4',
    category: 'Фрукты',
    name_en: 'Dragon Fruit',
    name_kh: 'ផ្លែស្រកានាគ (Plae Sroka Neak)',
    name_ru: 'Питахайя (Драгонфрут)',
    form: 'Целый',
    description: 'Свежие плоды с ярко-розовой кожурой',
    img_url: '',
    created_at: new Date().toISOString()
  }
];

// ==========================================================================
// 2. STORAGE LAYER (LOCALSTORAGE & SUPABASE READY ADAPTER)
// ==========================================================================

const STORAGE_KEY = 'freshmarket_products_v2';

class LocalStorageAdapter {
  async getAll() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_PRODUCTS));
      return INITIAL_PRODUCTS;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      console.error('Failed to parse localStorage data', e);
      return [];
    }
  }

  async create(product) {
    const products = await this.getAll();
    const newProduct = {
      ...product,
      id: 'prod_' + Date.now() + '_' + Math.random().toString(36).substring(2, 6),
      created_at: new Date().toISOString()
    };
    products.unshift(newProduct);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    return newProduct;
  }

  async update(id, updatedFields) {
    const products = await this.getAll();
    const index = products.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Product not found');
    products[index] = { ...products[index], ...updatedFields };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
    return products[index];
  }

  async delete(id) {
    let products = await this.getAll();
    products = products.filter(p => p.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  }
}

/**
 * Cloudinary Photo Storage Service
 */
class CloudinaryService {
  static getConfig() {
    return {
      cloudName: (localStorage.getItem('freshmarket_cloudinary_cloud_name') || '').trim(),
      uploadPreset: (localStorage.getItem('freshmarket_cloudinary_preset') || '').trim(),
      folder: (localStorage.getItem('freshmarket_cloudinary_folder') || 'freshmarket').trim(),
      apiKey: (localStorage.getItem('freshmarket_cloudinary_api_key') || '').trim(),
      apiSecret: (localStorage.getItem('freshmarket_cloudinary_api_secret') || '').trim()
    };
  }

  static isConfigured() {
    const { cloudName, uploadPreset } = this.getConfig();
    return Boolean(cloudName && uploadPreset);
  }

  static extractPublicId(url) {
    if (!url || typeof url !== 'string') return null;
    if (!url.includes('cloudinary.com') && !url.includes('res.cloudinary')) return null;
    try {
      const cleanUrl = url.split('?')[0].split('#')[0];
      const uploadIdx = cleanUrl.indexOf('/upload/');
      if (uploadIdx === -1) return null;
      let afterUpload = cleanUrl.substring(uploadIdx + '/upload/'.length);
      // Strip transformations and version prefix like v1234567890/
      afterUpload = afterUpload.replace(/^(?:[a-z]_[^/]+,)*v\d+\//, '');
      afterUpload = afterUpload.replace(/^(?:[a-z]{1,2}_[^/]+(?:\/|$))+/, '');
      const dotIdx = afterUpload.lastIndexOf('.');
      if (dotIdx !== -1) {
        afterUpload = afterUpload.substring(0, dotIdx);
      }
      return decodeURIComponent(afterUpload).trim();
    } catch (e) {
      return null;
    }
  }

  static async sha1(str) {
    const buffer = new TextEncoder().encode(str);
    const digest = await crypto.subtle.digest('SHA-1', buffer);
    return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  static async upload(fileOrBase64) {
    if (!this.isConfigured() || !fileOrBase64) {
      return fileOrBase64;
    }

    // If it's already a hosted URL, return as is
    if (typeof fileOrBase64 === 'string' && (fileOrBase64.startsWith('http://') || fileOrBase64.startsWith('https://'))) {
      return fileOrBase64;
    }

    const { cloudName, uploadPreset, folder } = this.getConfig();
    const formData = new FormData();
    formData.append('file', fileOrBase64);
    formData.append('upload_preset', uploadPreset);
    if (folder) {
      formData.append('folder', folder);
    }

    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `Ошибка Cloudinary: ${res.statusText}`);
    }

    const data = await res.json();
    return data.secure_url || data.url;
  }

  static async delete(urlOrPublicId) {
    if (!urlOrPublicId) return;
    const { cloudName, apiKey, apiSecret } = this.getConfig();
    if (!cloudName || !apiKey || !apiSecret) {
      console.warn('[CloudinaryService] API Key/Secret not set. Image not deleted from Cloudinary.');
      return;
    }

    const publicId = urlOrPublicId.includes('http') ? this.extractPublicId(urlOrPublicId) : urlOrPublicId.trim();
    if (!publicId) return;

    const timestamp = Math.floor(Date.now() / 1000);
    const cleanSecret = String(apiSecret).trim();
    const cleanApiKey = String(apiKey).trim();
    const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${cleanSecret}`;
    const signature = await this.sha1(stringToSign);

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('timestamp', String(timestamp));
    formData.append('api_key', cleanApiKey);
    formData.append('signature', signature);

    const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/destroy`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.error?.message || `Ошибка удаления (${res.status})`;
      console.warn('[CloudinaryService] Image destroy request failed:', msg);
      throw new Error(msg);
    }

    const data = await res.json().catch(() => ({}));
    console.log('[CloudinaryService] Image deleted successfully:', data);
    return data;
  }
}

/**
 * Supabase Storage Adapter (Pure fetch wrapper)
 */
class SupabaseAdapter {
  constructor(supabaseUrl, supabaseAnonKey) {
    this.url = supabaseUrl ? supabaseUrl.replace(/\/+$/, '') : '';
    this.key = supabaseAnonKey || '';
  }

  get headers() {
    let token = this.key;
    try {
      const rawSession = sessionStorage.getItem('freshmarket_admin_auth');
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        if (parsed?.access_token) {
          token = parsed.access_token;
        }
      }
    } catch (e) {}

    return {
      'apikey': this.key,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  async getAll() {
    if (!this.url || !this.key) throw new Error('Параметры Supabase не настроены');
    const res = await fetch(`${this.url}/rest/v1/products?select=*&order=created_at.desc`, {
      headers: this.headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Supabase error: ${res.statusText}`);
    }
    return await res.json();
  }

  async getById(id) {
    if (!this.url || !this.key) throw new Error('Параметры Supabase не настроены');
    const res = await fetch(`${this.url}/rest/v1/products?id=eq.${encodeURIComponent(id)}&select=*`, {
      headers: this.headers
    });
    if (!res.ok) throw new Error(`Supabase error: ${res.statusText}`);
    const data = await res.json();
    return data[0] || null;
  }

  async create(product) {
    if (!this.url || !this.key) throw new Error('Параметры Supabase не настроены');
    const payload = {
      id: product.id || generateUUID(),
      created_at: product.created_at || new Date().toISOString(),
      ...product
    };
    if (!payload.id) {
      payload.id = generateUUID();
    }
    const res = await fetch(`${this.url}/rest/v1/products`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(payload)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.hint || `Supabase error: ${res.statusText}`);
    }
    const data = await res.json();
    return (data && data[0]) ? data[0] : payload;
  }

  async update(id, updatedFields) {
    if (!this.url || !this.key) throw new Error('Параметры Supabase не настроены');
    const res = await fetch(`${this.url}/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify(updatedFields)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Supabase error: ${res.statusText}`);
    }
    const data = await res.json();
    return data[0];
  }

  async delete(id) {
    if (!this.url || !this.key) throw new Error('Параметры Supabase не настроены');
    const res = await fetch(`${this.url}/rest/v1/products?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: this.headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Supabase error: ${res.statusText}`);
    }
  }

  async testConnection() {
    if (!this.url || !this.key) throw new Error('Введите URL и Anon Key');
    const res = await fetch(`${this.url}/rest/v1/products?select=id&limit=1`, {
      headers: this.headers
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Ошибка доступа (${res.status}): проверьте URL, ключ и создание таблицы products.`);
    }
    return true;
  }
}

function getActiveStorage() {
  const provider = localStorage.getItem('freshmarket_storage_provider') || 'supabase';
  const sbUrl = localStorage.getItem('freshmarket_supabase_url');
  const sbKey = localStorage.getItem('freshmarket_supabase_key');

  if (provider === 'supabase' && sbUrl && sbKey) {
    return new SupabaseAdapter(sbUrl, sbKey);
  }
  return new LocalStorageAdapter();
}

let storage = getActiveStorage();

// ==========================================================================
// 3. ONLINE & LOCAL LOOKUP SERVICE (RU <-> EN <-> KH + Transcription)
// ==========================================================================

class LookupService {
  static normalize(str) {
    return (str || '').trim().toLowerCase().replace(/ё/g, 'е');
  }

  static findInDictionary(term) {
    const clean = this.normalize(term);
    if (!clean) return null;

    // 1. Direct contains check
    let match = PRODUCE_DICTIONARY.find(item => {
      const ruNorm = this.normalize(item.ru);
      const enNorm = this.normalize(item.en);
      const khNorm = this.normalize(item.kh);
      return ruNorm.includes(clean) || clean.includes(ruNorm) ||
        enNorm.includes(clean) || clean.includes(enNorm) ||
        khNorm.includes(clean);
    });

    if (match) return match;

    // 2. Token & Stem matching (e.g. "курица", "куриное", "курицу", "куриный" -> match "куриц")
    const searchTokens = clean.split(/[\s,/-]+/).filter(t => t.length >= 3);
    for (const token of searchTokens) {
      const stem = token.length > 4 ? token.slice(0, 4) : token;
      match = PRODUCE_DICTIONARY.find(item => {
        const ruTokens = this.normalize(item.ru).split(/[\s,/-]+/);
        const enTokens = this.normalize(item.en).split(/[\s,/-]+/);
        return ruTokens.some(r => r.startsWith(stem)) || enTokens.some(e => e.startsWith(stem));
      });
      if (match) return match;
    }

    return null;
  }

  static findSuggestions(term, limit = 6) {
    const clean = this.normalize(term);
    if (!clean || clean.length < 1) return [];

    const searchTokens = clean.split(/[\s,/-]+/).filter(Boolean);

    const matches = PRODUCE_DICTIONARY.filter(item => {
      const ruNorm = this.normalize(item.ru);
      const enNorm = this.normalize(item.en);
      const khNorm = this.normalize(item.kh);

      return searchTokens.every(token =>
        ruNorm.includes(token) ||
        enNorm.includes(token) ||
        khNorm.includes(token)
      );
    });

    return matches.slice(0, limit);
  }

  static async lookup(term) {
    const clean = this.normalize(term);
    if (!clean) return null;

    // 1. Check local dictionary first
    const localMatch = this.findInDictionary(clean);
    if (localMatch) {
      return {
        name_ru: localMatch.ru,
        name_en: localMatch.en,
        name_kh: localMatch.kh,
        category: localMatch.cat,
        form: localMatch.form,
        description: localMatch.desc,
        source: 'dict'
      };
    }

    // 2. Query free translation API
    try {
      const isCyrillic = /[а-я]/i.test(clean);
      let translatedEn = '';
      let translatedRu = '';
      let translatedKh = '';

      if (isCyrillic) {
        translatedRu = term;
        const enRes = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=ru|en`);
        if (enRes.ok) {
          const enData = await enRes.json();
          if (enData.responseData && enData.responseData.translatedText) {
            translatedEn = enData.responseData.translatedText;
          }
        }

        // Cross check translated English against dictionary to see if Khmer is known!
        if (translatedEn) {
          const crossMatch = this.findInDictionary(translatedEn);
          if (crossMatch) {
            return {
              name_ru: term,
              name_en: crossMatch.en,
              name_kh: crossMatch.kh,
              category: crossMatch.cat,
              form: crossMatch.form,
              description: crossMatch.desc,
              source: 'dict'
            };
          }
        }
      } else {
        translatedEn = term;
        const ruRes = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=en|ru`);
        if (ruRes.ok) {
          const ruData = await ruRes.json();
          if (ruData.responseData && ruData.responseData.translatedText) {
            translatedRu = ruData.responseData.translatedText;
          }
        }

        // Cross check translated Russian against dictionary
        if (translatedRu) {
          const crossMatch = this.findInDictionary(translatedRu);
          if (crossMatch) {
            return {
              name_ru: crossMatch.ru,
              name_en: term,
              name_kh: crossMatch.kh,
              category: crossMatch.cat,
              form: crossMatch.form,
              description: crossMatch.desc,
              source: 'dict'
            };
          }
        }
      }

      // If Khmer translation is still missing, query Google Translate for Khmer
      if (!translatedKh) {
        try {
          const queryForKh = translatedEn || translatedRu || term;
          const kmRes = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=km&dt=t&q=${encodeURIComponent(queryForKh)}`);
          if (kmRes.ok) {
            const kmData = await kmRes.json();
            if (kmData && kmData[0] && kmData[0][0] && kmData[0][0][0]) {
              translatedKh = kmData[0][0][0];
            }
          }
        } catch (khErr) {
          console.warn('Khmer online translation error', khErr);
        }
      }

      return {
        name_ru: translatedRu || term,
        name_en: translatedEn || term,
        name_kh: translatedKh,
        source: 'online'
      };
    } catch (e) {
      console.warn('Online translation fetch failed', e);
      return null;
    }
  }
}

// ==========================================================================
// 4. IMAGE COMPRESSION UTILITY (Pure Canvas)
// ==========================================================================

function compressImage(file, maxWidth = 800, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', quality);
        resolve(compressedBase64);
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

// ==========================================================================
// 5. APPLICATION CONTROLLER
// ==========================================================================

class App {
  constructor() {
    this.products = [];
    this.activeFilterCategory = 'all';
    this.searchQuery = '';
    this.currentView = 'viewAdd';
    this.selectedCategory = CATEGORIES[0].name;
    this.selectedForm = FORMS[0].label;
    this.currentImageBase64 = '';
    this.editModalImageBase64 = '';
    this.initElements();
    this.initEventListeners();
    this.initAutocomplete();
    this.renderCategoryChips();
    this.renderFormChips();
    this.renderCategoryFilterPills();
    this.loadData();
    this.initServiceWorker();
    this.renderAppVersion();
    this.initSplashScreen();
  }

  renderAppVersion() {
    const splashEl = document.getElementById('splashVersion');
    if (splashEl) splashEl.textContent = `v${APP_VERSION}`;
    const settingsVerEl = document.getElementById('settingsAppVersion');
    if (settingsVerEl) settingsVerEl.textContent = `v${APP_VERSION}`;
  }

  initSplashScreen() {
    const splash = document.getElementById('splashScreen');
    if (!splash) return;
    setTimeout(() => {
      splash.classList.add('hide');
    }, 600);
  }

  initElements() {
    // Header
    this.headerCountBadge = document.getElementById('headerCountBadge');

    // Navigation
    this.navBtnAdd = document.getElementById('navBtnAdd');
    this.navBtnFabAdd = document.getElementById('navBtnFabAdd');
    this.navBtnList = document.getElementById('navBtnList');
    this.viewAdd = document.getElementById('viewAdd');
    this.viewList = document.getElementById('viewList');

    // Stats & Dashboard
    this.statCategoriesRatio = document.getElementById('statCategoriesRatio');
    this.statDictCount = document.getElementById('statDictCount');
    this.statProductsCount = document.getElementById('statProductsCount');
    this.categoryStatsGrid = document.getElementById('categoryStatsGrid');
    this.recentList = document.getElementById('recentList');
    this.btnViewAllRecent = document.getElementById('btnViewAllRecent');

    // Add Modal Elements
    this.addModal = document.getElementById('addModal');
    this.addModalCloseBtn = document.getElementById('addModalCloseBtn');
    this.productForm = document.getElementById('productForm');
    this.categoryChips = document.getElementById('categoryChips');
    this.fieldCategory = document.getElementById('fieldCategory');
    this.formChips = document.getElementById('formChips');
    this.fieldForm = document.getElementById('fieldForm');
    this.customFormWrap = document.getElementById('customFormWrap');
    this.fieldCustomForm = document.getElementById('fieldCustomForm');

    // Names, Lookup & Autocomplete
    this.fieldNameEn = document.getElementById('fieldNameEn');
    this.fieldNameRu = document.getElementById('fieldNameRu');
    this.fieldNameKh = document.getElementById('fieldNameKh');
    this.suggestionsEn = document.getElementById('suggestionsEn');
    this.suggestionsRu = document.getElementById('suggestionsRu');
    this.btnLookup = document.getElementById('btnLookup');
    this.lookupSpinner = document.getElementById('lookupSpinner');

    // Image & Notes
    this.imagePickerZone = document.getElementById('imagePickerZone');
    this.fieldImageFile = document.getElementById('fieldImageFile');
    this.imagePlaceholder = document.getElementById('imagePlaceholder');
    this.imagePreviewContainer = document.getElementById('imagePreviewContainer');
    this.imagePreview = document.getElementById('imagePreview');
    this.aiScanOverlay = document.getElementById('aiScanOverlay');
    this.btnRemovePhoto = document.getElementById('btnRemovePhoto');
    this.fieldImgUrl = document.getElementById('fieldImgUrl');
    this.fieldDescription = document.getElementById('fieldDescription');

    // Settings Modal Elements
    this.btnSettings = document.getElementById('btnSettings');
    this.settingsModal = document.getElementById('settingsModal');
    this.settingsModalCloseBtn = document.getElementById('settingsModalCloseBtn');
    this.btnCancelSettings = document.getElementById('btnCancelSettings');
    this.settingsForm = document.getElementById('settingsForm');
    this.settingApiKey = document.getElementById('settingApiKey');
    this.settingModel = document.getElementById('settingModel');
    this.customModelWrap = document.getElementById('customModelWrap');
    this.settingCustomModel = document.getElementById('settingCustomModel');

    this.providerLocal = document.getElementById('providerLocal');
    this.providerSupabase = document.getElementById('providerSupabase');
    this.supabaseFieldsWrap = document.getElementById('supabaseFieldsWrap');
    this.settingSupabaseUrl = document.getElementById('settingSupabaseUrl');
    this.settingSupabaseKey = document.getElementById('settingSupabaseKey');
    this.btnTestSupabase = document.getElementById('btnTestSupabase');
    this.btnMigrateToSupabase = document.getElementById('btnMigrateToSupabase');

    this.settingCloudinaryName = document.getElementById('settingCloudinaryName');
    this.settingCloudinaryPreset = document.getElementById('settingCloudinaryPreset');
    this.settingCloudinaryFolder = document.getElementById('settingCloudinaryFolder');
    this.settingCloudinaryApiKey = document.getElementById('settingCloudinaryApiKey');
    this.settingCloudinaryApiSecret = document.getElementById('settingCloudinaryApiSecret');
    this.btnTestCloudinary = document.getElementById('btnTestCloudinary');

    // Settings Backup & Import/Export Elements
    this.btnExportSettings = document.getElementById('btnExportSettings');
    this.btnImportSettings = document.getElementById('btnImportSettings');
    this.inputImportSettingsFile = document.getElementById('inputImportSettingsFile');
    this.btnCopySettingsClipboard = document.getElementById('btnCopySettingsClipboard');
    this.btnPasteSettingsClipboard = document.getElementById('btnPasteSettingsClipboard');

    // List Screen Elements
    this.searchInput = document.getElementById('searchInput');
    this.searchClearBtn = document.getElementById('searchClearBtn');
    this.categoryFilterPills = document.getElementById('categoryFilterPills');
    this.productsGrid = document.getElementById('productsGrid');
    this.emptyState = document.getElementById('emptyState');
    this.btnEmptyGoAdd = document.getElementById('btnEmptyGoAdd');

    // Toast & Modals
    this.toastContainer = document.getElementById('toastContainer');
    this.editModal = document.getElementById('editModal');
    this.modalBody = document.getElementById('modalBody');
    this.modalCloseBtn = document.getElementById('modalCloseBtn');

    // Delete Confirm Modal
    this.deleteModal = document.getElementById('deleteModal');
    this.deleteModalCloseBtn = document.getElementById('deleteModalCloseBtn');
    this.deleteConfirmMsg = document.getElementById('deleteConfirmMsg');
    this.btnCancelDelete = document.getElementById('btnCancelDelete');
    this.btnConfirmDelete = document.getElementById('btnConfirmDelete');
    this.pendingDeleteId = null;
    this.pendingDeleteName = '';
  }

  initEventListeners() {
    // View switching
    this.navBtnAdd.addEventListener('click', () => this.switchView('viewAdd'));
    this.navBtnList.addEventListener('click', () => this.switchView('viewList'));
    if (this.navBtnFabAdd) {
      this.navBtnFabAdd.addEventListener('click', () => this.openAddModal());
    }
    this.btnEmptyGoAdd.addEventListener('click', () => this.openAddModal());
    this.btnViewAllRecent.addEventListener('click', () => this.switchView('viewList'));

    // Delete Modal Events
    this.deleteModalCloseBtn.addEventListener('click', () => this.closeDeleteModal());
    this.btnCancelDelete.addEventListener('click', () => this.closeDeleteModal());
    this.deleteModal.addEventListener('click', (e) => {
      if (e.target === this.deleteModal) this.closeDeleteModal();
    });
    this.btnConfirmDelete.addEventListener('click', () => this.executeDelete());

    // Close Add Modal
    this.addModalCloseBtn.addEventListener('click', () => this.closeAddModal());
    this.addModal.addEventListener('click', (e) => {
      if (e.target === this.addModal) this.closeAddModal();
    });

    // Settings Modal Events
    if (this.btnSettings) {
      this.btnSettings.addEventListener('click', () => this.openSettingsModal());
    }
    if (this.settingsModalCloseBtn) {
      this.settingsModalCloseBtn.addEventListener('click', () => this.closeSettingsModal());
    }
    if (this.btnCancelSettings) {
      this.btnCancelSettings.addEventListener('click', () => this.closeSettingsModal());
    }
    if (this.settingsModal) {
      this.settingsModal.addEventListener('click', (e) => {
        if (e.target === this.settingsModal) this.closeSettingsModal();
      });
    }
    if (this.settingModel) {
      this.settingModel.addEventListener('change', () => this.toggleCustomModelInput());
    }
    if (this.btnTestSupabase) {
      this.btnTestSupabase.addEventListener('click', () => this.testSupabaseConnection());
    }
    if (this.btnMigrateToSupabase) {
      this.btnMigrateToSupabase.addEventListener('click', () => this.migrateLocalToSupabase());
    }
    if (this.btnTestCloudinary) {
      this.btnTestCloudinary.addEventListener('click', () => this.testCloudinaryConnection());
    }
    if (this.btnExportSettings) {
      this.btnExportSettings.addEventListener('click', () => this.exportSettings());
    }
    if (this.btnImportSettings) {
      this.btnImportSettings.addEventListener('click', () => this.inputImportSettingsFile?.click());
    }
    if (this.inputImportSettingsFile) {
      this.inputImportSettingsFile.addEventListener('change', (e) => this.handleSettingsFileImport(e));
    }
    if (this.btnCopySettingsClipboard) {
      this.btnCopySettingsClipboard.addEventListener('click', () => this.copySettingsToClipboard());
    }
    if (this.btnPasteSettingsClipboard) {
      this.btnPasteSettingsClipboard.addEventListener('click', () => this.pasteSettingsFromClipboard());
    }
    // Settings Accordion Sections
    const settingsSections = document.querySelectorAll('.settings-section');
    settingsSections.forEach((section) => {
      const header = section.querySelector('.settings-section-header');
      if (header) {
        header.addEventListener('click', () => {
          section.classList.toggle('is-collapsed');
        });
      }
    });
    if (this.settingsForm) {
      this.settingsForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveSettings();
      });
    }

    // Lookup Button Click
    this.btnLookup.addEventListener('click', () => this.handleLookup());

    // Image picker click & change
    this.imagePickerZone.addEventListener('click', (e) => {
      if (e.target !== this.btnRemovePhoto) {
        this.fieldImageFile.click();
      }
    });

    this.fieldImageFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const base64 = await compressImage(file, 800, 0.75);
          this.setImagePreview(base64);
          // Automatically trigger Gemini Vision analysis
          this.analyzeImageWithGemini(base64);
        } catch (err) {
          this.showToast('Ошибка при загрузке фото');
        }
      }
    });

    this.btnRemovePhoto.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearImagePreview();
    });

    // Form Submit
    this.productForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Search input
    this.searchInput.addEventListener('input', (e) => {
      this.searchQuery = e.target.value.trim().toLowerCase();
      this.searchClearBtn.style.display = this.searchQuery ? 'block' : 'none';
      this.renderProductsList();
    });

    this.searchClearBtn.addEventListener('click', () => {
      this.searchInput.value = '';
      this.searchQuery = '';
      this.searchClearBtn.style.display = 'none';
      this.renderProductsList();
    });

    // Edit Modal Close
    this.modalCloseBtn.addEventListener('click', () => {
      this.editModal.style.display = 'none';
    });

    this.editModal.addEventListener('click', (e) => {
      if (e.target === this.editModal) {
        this.editModal.style.display = 'none';
      }
    });
  }


  // ------------------------------------------------------------------------
  // Navigation & Modals
  // ------------------------------------------------------------------------
  switchView(viewId) {
    this.currentView = viewId;
    if (viewId === 'viewAdd') {
      this.viewAdd.classList.add('active');
      this.viewList.classList.remove('active');
      this.navBtnAdd.classList.add('active');
      this.navBtnList.classList.remove('active');
      this.renderRecentList();
    } else {
      this.viewList.classList.add('active');
      this.viewAdd.classList.remove('active');
      this.navBtnList.classList.add('active');
      this.navBtnAdd.classList.remove('active');
      this.renderProductsList();
    }
  }

  openAddModal() {
    if (this.activeFilterCategory && this.activeFilterCategory !== 'all') {
      this.selectCategoryByName(this.activeFilterCategory);
    }
    this.addModal.style.display = 'flex';
  }

  closeAddModal() {
    this.addModal.style.display = 'none';
  }

  // ------------------------------------------------------------------------
  // Form Setup & Chip Rendering
  // ------------------------------------------------------------------------
  renderCategoryChips() {
    this.categoryChips.innerHTML = '';
    CATEGORIES.forEach((cat, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chip-btn ${index === 0 ? 'active' : ''}`;
      btn.dataset.category = cat.name;
      btn.dataset.id = cat.id;
      btn.innerHTML = `${cat.icon} <span>${cat.name}</span>`;
      btn.addEventListener('click', () => {
        this.categoryChips.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedCategory = cat.name;
        this.fieldCategory.value = cat.name;
      });
      this.categoryChips.appendChild(btn);
    });
    this.fieldCategory.value = CATEGORIES[0].name;
  }

  renderFormChips() {
    this.formChips.innerHTML = '';
    FORMS.forEach((f, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chip-btn ${index === 0 ? 'active' : ''}`;
      btn.textContent = f.label;
      btn.addEventListener('click', () => {
        this.formChips.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        if (f.id === 'custom') {
          this.customFormWrap.style.display = 'block';
          this.fieldCustomForm.focus();
          this.selectedForm = this.fieldCustomForm.value || 'Свой вариант';
        } else {
          this.customFormWrap.style.display = 'none';
          this.selectedForm = f.label;
        }
        this.fieldForm.value = this.selectedForm;
      });
      this.formChips.appendChild(btn);
    });

    this.fieldCustomForm.addEventListener('input', (e) => {
      this.selectedForm = e.target.value.trim() || 'Свой вариант';
      this.fieldForm.value = this.selectedForm;
    });

    this.fieldForm.value = FORMS[0].label;
  }

  renderCategoryFilterPills() {
    this.categoryFilterPills.innerHTML = '';

    // "All" Pill
    const allPill = document.createElement('button');
    allPill.type = 'button';
    allPill.className = `filter-pill ${this.activeFilterCategory === 'all' ? 'active' : ''}`;
    allPill.textContent = '🌟 Все';
    allPill.addEventListener('click', () => {
      this.activeFilterCategory = 'all';
      this.updateActiveFilterPills();
      this.renderProductsList();
    });
    this.categoryFilterPills.appendChild(allPill);

    // Specific Category Pills
    CATEGORIES.forEach(cat => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `filter-pill ${this.activeFilterCategory === cat.name ? 'active' : ''}`;
      pill.textContent = `${cat.icon} ${cat.name}`;
      pill.addEventListener('click', () => {
        this.activeFilterCategory = cat.name;
        this.updateActiveFilterPills();
        this.renderProductsList();
      });
      this.categoryFilterPills.appendChild(pill);
    });
  }

  updateActiveFilterPills() {
    const pills = this.categoryFilterPills.querySelectorAll('.filter-pill');
    pills.forEach(pill => {
      const isAll = pill.textContent.includes('Все') && this.activeFilterCategory === 'all';
      const isCat = pill.textContent.includes(this.activeFilterCategory);
      if (isAll || (this.activeFilterCategory !== 'all' && isCat)) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  // ------------------------------------------------------------------------
  // Image handling
  // ------------------------------------------------------------------------
  setImagePreview(base64) {
    this.currentImageBase64 = base64;
    this.fieldImgUrl.value = base64;
    this.imagePreview.src = base64;
    this.imagePlaceholder.style.display = 'none';
    this.imagePreviewContainer.style.display = 'block';
  }

  clearImagePreview() {
    this.currentImageBase64 = '';
    this.fieldImgUrl.value = '';
    this.imagePreview.src = '';
    this.fieldImageFile.value = '';
    this.imagePlaceholder.style.display = 'flex';
    this.imagePreviewContainer.style.display = 'none';
    if (this.aiScanOverlay) {
      this.aiScanOverlay.style.display = 'none';
    }
  }

  // ------------------------------------------------------------------------
  // Settings (Gemini API, Supabase, Cloudinary)
  // ------------------------------------------------------------------------
  openSettingsModal(isTriggeredByPhoto = false) {
    if (!this.settingsModal) {
      this.settingsModal = document.getElementById('settingsModal');
    }
    if (!this.settingsModal) return;

    // AI
    const savedKey = localStorage.getItem('freshmarket_gemini_api_key') || '';
    const savedModel = localStorage.getItem('freshmarket_gemini_model') || 'gemini-2.5-flash';
    const customModel = localStorage.getItem('freshmarket_gemini_custom_model') || '';

    if (this.settingApiKey) this.settingApiKey.value = savedKey;
    if (this.settingModel) {
      this.settingModel.value = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.8-flash'].includes(savedModel) ? savedModel : 'custom';
    }
    if (this.settingCustomModel) {
      this.settingCustomModel.value = customModel || (savedModel === 'custom' ? '' : savedModel);
    }
    this.toggleCustomModelInput();

    // Supabase
    const provider = localStorage.getItem('freshmarket_storage_provider') || 'supabase';
    const supabaseUrl = localStorage.getItem('freshmarket_supabase_url') || '';
    const supabaseKey = localStorage.getItem('freshmarket_supabase_key') || '';

    if (this.providerLocal) this.providerLocal.checked = (provider === 'local');
    if (this.providerSupabase) this.providerSupabase.checked = (provider === 'supabase');
    if (this.settingSupabaseUrl) this.settingSupabaseUrl.value = supabaseUrl;
    if (this.settingSupabaseKey) this.settingSupabaseKey.value = supabaseKey;

    // Cloudinary
    const cloudName = localStorage.getItem('freshmarket_cloudinary_cloud_name') || '';
    const preset = localStorage.getItem('freshmarket_cloudinary_preset') || '';
    const folder = localStorage.getItem('freshmarket_cloudinary_folder') || 'freshmarket';
    const cloudApiKey = localStorage.getItem('freshmarket_cloudinary_api_key') || '';
    const cloudApiSecret = localStorage.getItem('freshmarket_cloudinary_api_secret') || '';

    if (this.settingCloudinaryName) this.settingCloudinaryName.value = cloudName;
    if (this.settingCloudinaryPreset) this.settingCloudinaryPreset.value = preset;
    if (this.settingCloudinaryFolder) this.settingCloudinaryFolder.value = folder;
    if (this.settingCloudinaryApiKey) this.settingCloudinaryApiKey.value = cloudApiKey;
    if (this.settingCloudinaryApiSecret) this.settingCloudinaryApiSecret.value = cloudApiSecret;

    this.settingsModal.style.display = 'flex';

    if (isTriggeredByPhoto) {
      this.showToast('ℹ️ Введите Gemini API Key для автозаполнения по фото');
    }
  }

  closeSettingsModal() {
    const modal = this.settingsModal || document.getElementById('settingsModal');
    if (modal) {
      modal.style.display = 'none';
    }
  }

  toggleCustomModelInput() {
    const modelEl = this.settingModel || document.getElementById('settingModel');
    const wrapEl = this.customModelWrap || document.getElementById('customModelWrap');
    if (modelEl && wrapEl) {
      wrapEl.style.display = (modelEl.value === 'custom') ? 'block' : 'none';
    }
  }

  async saveSettings() {
    // 1. AI Settings
    const apiKey = this.settingApiKey ? this.settingApiKey.value.trim() : '';
    const model = this.settingModel ? this.settingModel.value : 'gemini-2.5-flash';
    const customModel = this.settingCustomModel ? this.settingCustomModel.value.trim() : '';

    if (apiKey) localStorage.setItem('freshmarket_gemini_api_key', apiKey);
    localStorage.setItem('freshmarket_gemini_model', model);
    if (model === 'custom' && customModel) {
      localStorage.setItem('freshmarket_gemini_custom_model', customModel);
    }

    // 2. Supabase Settings
    const provider = this.providerSupabase && this.providerSupabase.checked ? 'supabase' : 'local';
    const supabaseUrl = this.settingSupabaseUrl ? this.settingSupabaseUrl.value.trim() : '';
    const supabaseKey = this.settingSupabaseKey ? this.settingSupabaseKey.value.trim() : '';

    if (provider === 'supabase' && (!supabaseUrl || !supabaseKey)) {
      this.showToast('⚠️ Для режима Supabase заполните URL и Anon Key');
      return;
    }

    localStorage.setItem('freshmarket_storage_provider', provider);
    localStorage.setItem('freshmarket_supabase_url', supabaseUrl);
    localStorage.setItem('freshmarket_supabase_key', supabaseKey);

    // 3. Cloudinary Settings
    const cloudName = this.settingCloudinaryName ? this.settingCloudinaryName.value.trim() : '';
    const preset = this.settingCloudinaryPreset ? this.settingCloudinaryPreset.value.trim() : '';
    const folder = this.settingCloudinaryFolder ? this.settingCloudinaryFolder.value.trim() : 'freshmarket';
    const cloudApiKey = this.settingCloudinaryApiKey ? this.settingCloudinaryApiKey.value.trim() : '';
    const cloudApiSecret = this.settingCloudinaryApiSecret ? this.settingCloudinaryApiSecret.value.trim() : '';

    localStorage.setItem('freshmarket_cloudinary_cloud_name', cloudName);
    localStorage.setItem('freshmarket_cloudinary_preset', preset);
    localStorage.setItem('freshmarket_cloudinary_folder', folder || 'freshmarket');
    localStorage.setItem('freshmarket_cloudinary_api_key', cloudApiKey);
    localStorage.setItem('freshmarket_cloudinary_api_secret', cloudApiSecret);

    // Re-initialize storage adapter
    storage = getActiveStorage();

    this.closeSettingsModal();
    this.showToast('✅ Настройки сохранены');

    // Reload catalog with active storage provider
    await this.loadData();
  }

  setSupabaseStatus(type, message) {
    const box = document.getElementById('supabaseStatusBox');
    const dot = document.getElementById('supabaseStatusDot');
    const text = document.getElementById('supabaseStatusText');
    if (!box || !dot || !text) return;

    box.className = `settings-status-box status-${type}`;
    dot.className = `status-dot status-${type}`;
    text.textContent = message;
  }

  setCloudinaryStatus(type, message) {
    const box = document.getElementById('cloudinaryStatusBox');
    const dot = document.getElementById('cloudinaryStatusDot');
    const text = document.getElementById('cloudinaryStatusText');
    if (!box || !dot || !text) return;

    box.className = `settings-status-box status-${type}`;
    dot.className = `status-dot status-${type}`;
    text.textContent = message;
  }

  async testSupabaseConnection() {
    const supabaseUrl = (this.settingSupabaseUrl?.value || localStorage.getItem('freshmarket_supabase_url') || '').trim();
    const supabaseKey = (this.settingSupabaseKey?.value || localStorage.getItem('freshmarket_supabase_key') || '').trim();

    if (!supabaseUrl || !supabaseKey) {
      this.setSupabaseStatus('error', 'Ошибка: заполните поля URL и Anon Key выше');
      this.showToast('⚠️ Введите Supabase URL и Anon Key');
      return;
    }

    const btn = document.getElementById('btnTestSupabase');
    if (btn) btn.classList.add('loading');
    this.setSupabaseStatus('loading', 'Проверка соединения с базой данных Supabase...');

    try {
      this.showToast('⏳ Проверяем подключение к Supabase...');
      const sb = new SupabaseAdapter(supabaseUrl, supabaseKey);
      await sb.testConnection();
      this.setSupabaseStatus('success', 'Подключение успешно! Таблица "products" доступна.');
      this.showToast('✅ Успешное подключение к таблице products в Supabase!');
    } catch (e) {
      console.error(e);
      this.setSupabaseStatus('error', `Ошибка: ${e.message}`);
      this.showToast(`❌ Supabase: ${e.message}`);
    } finally {
      if (btn) btn.classList.remove('loading');
    }
  }

  async migrateLocalToSupabase() {
    const supabaseUrl = (this.settingSupabaseUrl?.value || localStorage.getItem('freshmarket_supabase_url') || '').trim();
    const supabaseKey = (this.settingSupabaseKey?.value || localStorage.getItem('freshmarket_supabase_key') || '').trim();

    if (!supabaseUrl || !supabaseKey) {
      this.setSupabaseStatus('error', 'Ошибка: укажите URL и Anon Key перед миграцией');
      this.showToast('⚠️ Укажите URL и Anon Key Supabase');
      return;
    }

    const sb = new SupabaseAdapter(supabaseUrl, supabaseKey);
    const btn = document.getElementById('btnMigrateToSupabase');
    if (btn) btn.classList.add('loading');
    this.setSupabaseStatus('loading', 'Миграция локальных продуктов в Supabase...');

    try {
      this.showToast('⏳ Проверяем базу Supabase...');
      const existingInSupabase = await sb.getAll();
      const existingIds = new Set(existingInSupabase.map(p => p.id));
      const existingNames = new Set(existingInSupabase.map(p => (p.name_en || '').toLowerCase().trim()));

      const localProducts = await new LocalStorageAdapter().getAll();
      if (!localProducts || localProducts.length === 0) {
        this.setSupabaseStatus('idle', 'В локальном хранилище нет продуктов для переноса');
        this.showToast('ℹ️ В локальном хранилище нет продуктов для переноса');
        return;
      }

      let insertedCount = 0;
      let skippedCount = 0;

      for (const prod of localProducts) {
        const nameNorm = (prod.name_en || '').toLowerCase().trim();
        // Check for duplicates by ID or English name
        if (existingIds.has(prod.id) || existingNames.has(nameNorm)) {
          skippedCount++;
          continue;
        }

        let finalImgUrl = prod.img_url || '';
        // If image is base64 and Cloudinary is configured, upload to Cloudinary
        if (finalImgUrl && finalImgUrl.startsWith('data:') && CloudinaryService.isConfigured()) {
          try {
            finalImgUrl = await CloudinaryService.upload(finalImgUrl);
          } catch (imgErr) {
            console.warn('Cloudinary upload during migration failed, keeping base64:', imgErr);
          }
        }

        await sb.create({
          id: prod.id,
          category: prod.category || 'Овощи',
          name_en: prod.name_en || '',
          name_ru: prod.name_ru || '',
          name_kh: prod.name_kh || '',
          form: prod.form || 'Целый',
          description: prod.description || '',
          img_url: finalImgUrl,
          created_at: prod.created_at || new Date().toISOString()
        });

        insertedCount++;
      }

      this.setSupabaseStatus('success', `Миграция завершена: ${insertedCount} добавлено, ${skippedCount} пропущено (дубликаты).`);
      this.showToast(`✅ Перенесено: ${insertedCount} продуктов (${skippedCount} пропущено как дубликаты)`);

      if (localStorage.getItem('freshmarket_storage_provider') === 'supabase') {
        await this.loadData();
      }
    } catch (err) {
      console.error('Migration error:', err);
      this.setSupabaseStatus('error', `Ошибка миграции: ${err.message}`);
      this.showToast(`❌ Ошибка миграции: ${err.message}`);
    } finally {
      if (btn) btn.classList.remove('loading');
    }
  }

  async testCloudinaryConnection() {
    const cloudName = (this.settingCloudinaryName?.value || localStorage.getItem('freshmarket_cloudinary_cloud_name') || '').trim();
    const uploadPreset = (this.settingCloudinaryPreset?.value || localStorage.getItem('freshmarket_cloudinary_preset') || '').trim();
    const folder = (this.settingCloudinaryFolder?.value || localStorage.getItem('freshmarket_cloudinary_folder') || 'freshmarket').trim();
    const cloudApiKey = (this.settingCloudinaryApiKey?.value || localStorage.getItem('freshmarket_cloudinary_api_key') || '').trim();
    const cloudApiSecret = (this.settingCloudinaryApiSecret?.value || localStorage.getItem('freshmarket_cloudinary_api_secret') || '').trim();

    if (!cloudName || !uploadPreset) {
      this.setCloudinaryStatus('error', 'Ошибка: заполните Cloud Name и Upload Preset выше');
      this.showToast('⚠️ Введите Cloud Name и Upload Preset');
      return;
    }

    const btn = document.getElementById('btnTestCloudinary');
    if (btn) btn.classList.add('loading');
    this.setCloudinaryStatus('loading', 'Тестирование загрузки тестового изображения...');

    try {
      this.showToast('⏳ Тестируем Cloudinary...');
      const testPixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

      const formData = new FormData();
      formData.append('file', testPixel);
      formData.append('upload_preset', uploadPreset);
      if (folder) formData.append('folder', folder);

      const res = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/image/upload`, {
        method: 'POST',
        body: formData
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        let detail = err.error?.message || `Статус ${res.status} ${res.statusText}`;
        if (detail.includes('Signing') || detail.includes('unsigned')) {
          detail += ' (Убедитесь, что пресет переключен в Signing Mode: Unsigned)';
        }
        throw new Error(detail);
      }

      const uploadResult = await res.json();
      const testPublicId = uploadResult.public_id;

      // If API Key and Secret are filled, test immediate deletion
      if (cloudApiKey && cloudApiSecret) {
        this.setCloudinaryStatus('loading', 'Загрузка успешна! Тестируем удаление через API Key/Secret...');
        // Save temporarily to test delete
        localStorage.setItem('freshmarket_cloudinary_api_key', cloudApiKey);
        localStorage.setItem('freshmarket_cloudinary_api_secret', cloudApiSecret);
        localStorage.setItem('freshmarket_cloudinary_cloud_name', cloudName);

        try {
          await CloudinaryService.delete(testPublicId);
          this.setCloudinaryStatus('success', 'Cloudinary настроен полностью! Загрузка и удаление (API Key/Secret) работают корректно.');
          this.showToast('✅ Cloudinary: загрузка и удаление работают!');
        } catch (delErr) {
          this.setCloudinaryStatus('error', `Загрузка успешна, но ошибка удаления: ${delErr.message}. Проверьте правильность API Key и API Secret.`);
          this.showToast(`❌ Cloudinary: ${delErr.message}`);
        }
      } else {
        this.setCloudinaryStatus('success', `Cloudinary настроен для загрузки в папку "${folder}". Для автоудаления фото укажите API Key и Secret.`);
        this.showToast('✅ Cloudinary: тест загрузки успешен!');
      }
    } catch (e) {
      console.error(e);
      this.setCloudinaryStatus('error', `Ошибка: ${e.message}`);
      this.showToast(`❌ Ошибка Cloudinary: ${e.message}`);
    } finally {
      if (btn) btn.classList.remove('loading');
    }
  }

  // ------------------------------------------------------------------------
  // Settings Backup: Export, Import, Clipboard Sync
  // ------------------------------------------------------------------------
  setBackupStatus(type, message) {
    const box = document.getElementById('backupStatusBox');
    const dot = document.getElementById('backupStatusDot');
    const text = document.getElementById('backupStatusText');
    if (!box || !dot || !text) return;

    box.style.display = 'flex';
    box.className = `settings-status-box status-${type}`;
    dot.className = `status-dot status-${type}`;
    text.textContent = message;
  }

  collectSettingsPayload() {
    return {
      app: 'FreshMarket',
      version: APP_VERSION,
      exportedAt: new Date().toISOString(),
      settings: {
        gemini: {
          apiKey: (this.settingApiKey?.value || localStorage.getItem('freshmarket_gemini_api_key') || '').trim(),
          model: this.settingModel?.value || localStorage.getItem('freshmarket_gemini_model') || 'gemini-2.5-flash',
          customModel: (this.settingCustomModel?.value || localStorage.getItem('freshmarket_gemini_custom_model') || '').trim()
        },
        supabase: {
          provider: (this.providerSupabase && this.providerSupabase.checked ? 'supabase' : (localStorage.getItem('freshmarket_storage_provider') || 'supabase')),
          url: (this.settingSupabaseUrl?.value || localStorage.getItem('freshmarket_supabase_url') || '').trim(),
          anonKey: (this.settingSupabaseKey?.value || localStorage.getItem('freshmarket_supabase_key') || '').trim()
        },
        cloudinary: {
          cloudName: (this.settingCloudinaryName?.value || localStorage.getItem('freshmarket_cloudinary_cloud_name') || '').trim(),
          preset: (this.settingCloudinaryPreset?.value || localStorage.getItem('freshmarket_cloudinary_preset') || '').trim(),
          folder: (this.settingCloudinaryFolder?.value || localStorage.getItem('freshmarket_cloudinary_folder') || 'freshmarket').trim(),
          apiKey: (this.settingCloudinaryApiKey?.value || localStorage.getItem('freshmarket_cloudinary_api_key') || '').trim(),
          apiSecret: (this.settingCloudinaryApiSecret?.value || localStorage.getItem('freshmarket_cloudinary_api_secret') || '').trim()
        }
      }
    };
  }

  exportSettings() {
    try {
      const payload = this.collectSettingsPayload();
      const jsonStr = JSON.stringify(payload, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const dateStr = new Date().toISOString().split('T')[0];
      a.href = url;
      a.download = `freshmarket-settings-${dateStr}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      this.setBackupStatus('success', 'Настройки успешно экспортированы в файл');
      this.showToast('Настройки экспортированы в файл');
    } catch (err) {
      console.error(err);
      this.setBackupStatus('error', 'Ошибка экспорта: ' + err.message);
      this.showToast('Ошибка экспорта: ' + err.message);
    }
  }

  async copySettingsToClipboard() {
    try {
      const payload = this.collectSettingsPayload();
      const jsonStr = JSON.stringify(payload, null, 2);
      await navigator.clipboard.writeText(jsonStr);
      this.setBackupStatus('success', 'Конфигурация скопирована в буфер обмена');
      this.showToast('Настройки скопированы в буфер обмена');
    } catch (err) {
      console.error(err);
      this.setBackupStatus('error', 'Ошибка копирования: ' + err.message);
      this.showToast('Не удалось скопировать в буфер');
    }
  }

  async pasteSettingsFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text || !text.trim()) {
        this.setBackupStatus('error', 'Буфер обмена пуст');
        this.showToast('Буфер обмена пуст');
        return;
      }
      const parsed = JSON.parse(text);
      await this.applyImportedSettings(parsed);
    } catch (err) {
      console.error(err);
      this.setBackupStatus('error', 'Ошибка импорта из буфера: ' + err.message);
      this.showToast('Неверный формат настроек в буфере');
    }
  }

  handleSettingsFileImport(e) {
    const file = e.target?.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result;
        const parsed = JSON.parse(text);
        await this.applyImportedSettings(parsed);
      } catch (err) {
        console.error(err);
        this.setBackupStatus('error', 'Ошибка чтения файла: ' + err.message);
        this.showToast('Ошибка чтения файла настроек');
      } finally {
        if (this.inputImportSettingsFile) {
          this.inputImportSettingsFile.value = '';
        }
      }
    };
    reader.readAsText(file);
  }

  async applyImportedSettings(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Файл не содержит корректных настроек JSON');
    }
    const s = parsed.settings || parsed;

    // 1. Gemini
    if (s.gemini && typeof s.gemini === 'object') {
      if (s.gemini.apiKey !== undefined) {
        localStorage.setItem('freshmarket_gemini_api_key', s.gemini.apiKey || '');
        if (this.settingApiKey) this.settingApiKey.value = s.gemini.apiKey || '';
      }
      if (s.gemini.model) {
        localStorage.setItem('freshmarket_gemini_model', s.gemini.model);
        if (this.settingModel) {
          this.settingModel.value = ['gemini-2.5-flash', 'gemini-3.5-flash', 'gemini-3.8-flash'].includes(s.gemini.model) ? s.gemini.model : 'custom';
        }
      }
      if (s.gemini.customModel !== undefined) {
        localStorage.setItem('freshmarket_gemini_custom_model', s.gemini.customModel || '');
        if (this.settingCustomModel) this.settingCustomModel.value = s.gemini.customModel || '';
      }
      this.toggleCustomModelInput();
    }

    // 2. Supabase
    if (s.supabase && typeof s.supabase === 'object') {
      if (s.supabase.provider) {
        localStorage.setItem('freshmarket_storage_provider', s.supabase.provider);
        if (this.providerLocal) this.providerLocal.checked = (s.supabase.provider === 'local');
        if (this.providerSupabase) this.providerSupabase.checked = (s.supabase.provider === 'supabase');
      }
      if (s.supabase.url !== undefined) {
        localStorage.setItem('freshmarket_supabase_url', s.supabase.url || '');
        if (this.settingSupabaseUrl) this.settingSupabaseUrl.value = s.supabase.url || '';
      }
      if (s.supabase.anonKey !== undefined) {
        localStorage.setItem('freshmarket_supabase_key', s.supabase.anonKey || '');
        if (this.settingSupabaseKey) this.settingSupabaseKey.value = s.supabase.anonKey || '';
      }
    }

    // 3. Cloudinary
    if (s.cloudinary && typeof s.cloudinary === 'object') {
      if (s.cloudinary.cloudName !== undefined) {
        localStorage.setItem('freshmarket_cloudinary_cloud_name', s.cloudinary.cloudName || '');
        if (this.settingCloudinaryName) this.settingCloudinaryName.value = s.cloudinary.cloudName || '';
      }
      if (s.cloudinary.preset !== undefined) {
        localStorage.setItem('freshmarket_cloudinary_preset', s.cloudinary.preset || '');
        if (this.settingCloudinaryPreset) this.settingCloudinaryPreset.value = s.cloudinary.preset || '';
      }
      if (s.cloudinary.folder !== undefined) {
        const folder = s.cloudinary.folder || 'freshmarket';
        localStorage.setItem('freshmarket_cloudinary_folder', folder);
        if (this.settingCloudinaryFolder) this.settingCloudinaryFolder.value = folder;
      }
      if (s.cloudinary.apiKey !== undefined) {
        localStorage.setItem('freshmarket_cloudinary_api_key', s.cloudinary.apiKey || '');
        if (this.settingCloudinaryApiKey) this.settingCloudinaryApiKey.value = s.cloudinary.apiKey || '';
      }
      if (s.cloudinary.apiSecret !== undefined) {
        localStorage.setItem('freshmarket_cloudinary_api_secret', s.cloudinary.apiSecret || '');
        if (this.settingCloudinaryApiSecret) this.settingCloudinaryApiSecret.value = s.cloudinary.apiSecret || '';
      }
    }


    // Re-initialize storage adapter instance
    storage = getActiveStorage();

    this.setBackupStatus('success', 'Настройки успешно применены');
    this.showToast('Настройки успешно применены');

    // Reload catalog with newly applied storage credentials
    await this.loadData();
  }

  // ------------------------------------------------------------------------
  // Gemini Vision Analysis
  // ------------------------------------------------------------------------
  async analyzeImageWithGemini(base64Image, isEdit = false, editCtx = null) {
    const apiKey = localStorage.getItem('freshmarket_gemini_api_key');
    if (!apiKey) {
      this.openSettingsModal(true);
      return;
    }

    const selectedModel = localStorage.getItem('freshmarket_gemini_model') || 'gemini-2.5-flash';
    const customModel = localStorage.getItem('freshmarket_gemini_custom_model');
    const modelToUse = (selectedModel === 'custom' && customModel) ? customModel.trim() : selectedModel;

    const overlay = isEdit ? (editCtx?.editAiScanOverlay || document.getElementById('editAiScanOverlay')) : this.aiScanOverlay;

    if (overlay) {
      overlay.style.display = 'flex';
    }

    try {
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
      const mimeTypeMatch = base64Image.match(/^data:(image\/\w+);base64,/);
      const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/jpeg';

      const prompt = `You are an expert botanist, food specialist, and Cambodian market expert specializing in fresh produce, ingredients, seafood, meats, herbs, fruits, and mushrooms found in Southeast Asian and Cambodian markets (such as Samaki Market in Kampot).
Analyze the food product in this image and return a JSON object with:
- "name_en": Clear English name of the product (e.g. "Chicken Drumsticks", "Lemongrass", "Garlic", "Kep Crab", "Bitter Gourd").
- "name_ru": Clear Russian name of the product (e.g. "Куриные голени", "Лемонграсс", "Чеснок", "Кепский краб", "Горькая тыква").
- "name_kh": Authentic Khmer script name followed by pronunciation transcription in English in brackets (e.g. "ភ្លៅមាន់ (Phlov Moan)", "ស្លឹកគ្រៃ (Sloek Krey)", "ខ្ទឹមស (Khtem Sor)").
- "category": MUST be one of these exact 9 categories:
  ["Овощи", "Корнеплоды", "Фрукты", "Зелень и травы", "Корни и пряности", "Морепродукты и рыба", "Мясо и птица", "Соусы и бакалея", "Грибы"]
- "form": The form/state of the item, MUST be one of:
  ["Целый", "Нарезка", "Филе", "Фарш", "Очищенный", "Сушеный", "Маринованный", "Замороженный"] or another short 1-word descriptor.
- "description": Short helpful description in Russian (1-2 sentences about taste, culinary use, or how to pick it at the market).

Return ONLY raw valid JSON, no markdown code block fences.`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelToUse)}:generateContent`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64Data
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.2,
            response_mime_type: "application/json"
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errMsg = errorData.error?.message || `Ошибка API Gemini (${response.status})`;
        throw new Error(errMsg);
      }

      const result = await response.json();
      const textResponse = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) {
        throw new Error('Пустой ответ от Gemini');
      }

      let parsed;
      try {
        const cleanText = textResponse.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
        parsed = JSON.parse(cleanText);
      } catch (e) {
        console.error('Failed to parse Gemini JSON response:', textResponse);
        throw new Error('Не удалось разобрать ответ ИИ');
      }

      // Check against local dictionary for exact authentic names if matching (Dictionary has top priority)
      if (typeof PRODUCE_DICTIONARY !== 'undefined' && PRODUCE_DICTIONARY.length > 0) {
        const matched = this.matchWithLocalDictionary(parsed);
        if (matched) {
          if (matched.kh) parsed.name_kh = matched.kh; // 100% priority for dictionary Khmer
          if (matched.cat) parsed.category = matched.cat;
          parsed.name_en = matched.en || parsed.name_en;
          parsed.name_ru = matched.ru || parsed.name_ru;
          if (matched.form && !parsed.form) parsed.form = matched.form;
          if (matched.desc && !parsed.description) parsed.description = matched.desc;
        }
      }

      this.applyAiRecognitionResults(parsed, isEdit, editCtx);
      this.showToast(`✨ Распознано: ${parsed.name_ru || parsed.name_en}`);
    } catch (err) {
      console.error('Gemini Vision error:', err);
      this.showToast(`⚠️ AI анализ: ${err.message}`);
    } finally {
      if (overlay) {
        overlay.style.display = 'none';
      }
    }
  }

  applyAiRecognitionResults(data, isEdit = false, editCtx = null) {
    if (isEdit && editCtx) {
      if (data.name_en && editCtx.editNameEn) {
        editCtx.editNameEn.value = data.name_en;
        this.highlightField(editCtx.editNameEn);
      }
      if (data.name_ru && editCtx.editNameRu) {
        editCtx.editNameRu.value = data.name_ru;
        this.highlightField(editCtx.editNameRu);
      }
      if (data.name_kh && editCtx.editNameKh) {
        editCtx.editNameKh.value = data.name_kh;
        this.highlightField(editCtx.editNameKh);
      }
      if (data.category && editCtx.editCategory) {
        editCtx.editCategory.value = data.category;
        this.highlightField(editCtx.editCategory);
      }
      if (data.form && editCtx.editFormSelect) {
        let exists = false;
        for (let opt of editCtx.editFormSelect.options) {
          if (opt.value === data.form) {
            opt.selected = true;
            exists = true;
            break;
          }
        }
        if (!exists) {
          const newOpt = new Option(data.form, data.form, true, true);
          editCtx.editFormSelect.add(newOpt);
        }
        this.highlightField(editCtx.editFormSelect);
      }
      if (data.description && editCtx.editDescription) {
        editCtx.editDescription.value = data.description;
        this.highlightField(editCtx.editDescription);
      }
      return;
    }

    if (data.name_en) {
      this.fieldNameEn.value = data.name_en;
      this.highlightField(this.fieldNameEn);
    }
    if (data.name_ru) {
      this.fieldNameRu.value = data.name_ru;
      this.highlightField(this.fieldNameRu);
    }
    if (data.name_kh) {
      this.fieldNameKh.value = data.name_kh;
      this.highlightField(this.fieldNameKh);
    }
    if (data.category) {
      this.selectCategoryByName(data.category);
      if (this.categoryChips) this.highlightField(this.categoryChips);
    }
    if (data.form) {
      this.selectFormByName(data.form);
    }
    if (data.description) {
      this.fieldDescription.value = data.description;
      this.highlightField(this.fieldDescription);
    }

    // Instant duplicate check right after AI autofill
    if (!isEdit) {
      this.checkDuplicateProduct(data.name_en, data.name_ru, data.form);
    }
  }

  highlightField(element) {
    if (!element) return;
    element.classList.remove('field-highlight-ai');
    void element.offsetWidth; // trigger reflow
    element.classList.add('field-highlight-ai');
  }

  matchWithLocalDictionary(parsed) {
    if (!parsed || typeof PRODUCE_DICTIONARY === 'undefined' || PRODUCE_DICTIONARY.length === 0) return null;
    const en = (parsed.name_en || '').trim();
    const ru = (parsed.name_ru || '').trim();

    // 1. Check with LookupService smart dictionary matching (handles aliases, stems, clean terms)
    if (en) {
      const match = LookupService.findInDictionary(en);
      if (match) return match;
    }
    if (ru) {
      const match = LookupService.findInDictionary(ru);
      if (match) return match;
    }

    // 2. Direct partial scan fallback
    const enLow = en.toLowerCase();
    const ruLow = ru.toLowerCase();
    for (const item of PRODUCE_DICTIONARY) {
      const itemEn = (item.en || '').toLowerCase().trim();
      const itemRu = (item.ru || '').toLowerCase().trim();
      if (enLow && (itemEn === enLow || enLow.includes(itemEn) || itemEn.includes(enLow))) {
        return item;
      }
      if (ruLow && (itemRu === ruLow || ruLow.includes(itemRu) || itemRu.includes(ruLow))) {
        return item;
      }
    }
    return null;
  }

  // ------------------------------------------------------------------------
  // Live Autocomplete Suggestions Controller
  // ------------------------------------------------------------------------
  initAutocomplete() {
    this.bindSuggestionsToInput(this.fieldNameEn, this.suggestionsEn, 'en');
    this.bindSuggestionsToInput(this.fieldNameRu, this.suggestionsRu, 'ru');

    // Close popups on click outside
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.has-suggestions')) {
        this.closeAllSuggestions();
      }
    });
  }

  closeAllSuggestions() {
    if (this.suggestionsEn) this.suggestionsEn.style.display = 'none';
    if (this.suggestionsRu) this.suggestionsRu.style.display = 'none';
    const editPopups = document.querySelectorAll('.edit-suggestions-popup');
    editPopups.forEach(p => p.style.display = 'none');
  }

  bindSuggestionsToInput(inputEl, popupEl, lang = 'ru', isEditModal = false, editCtx = null) {
    if (!inputEl || !popupEl) return;

    let selectedIndex = -1;

    const renderSuggestions = () => {
      const term = inputEl.value.trim();
      if (!term || term.length < 1) {
        popupEl.style.display = 'none';
        popupEl.innerHTML = '';
        return;
      }

      const matches = LookupService.findSuggestions(term, 6);
      if (matches.length === 0) {
        popupEl.style.display = 'none';
        popupEl.innerHTML = '';
        return;
      }

      selectedIndex = -1;
      popupEl.innerHTML = '';

      matches.forEach(item => {
        const div = document.createElement('div');
        div.className = 'suggestion-item';
        div.innerHTML = `
          <div class="sug-left">
            <div class="sug-title">${this.escapeHtml(item.en)}</div>
            <div class="sug-kh">${this.escapeHtml(item.kh)}</div>
            <div class="sug-ru">${this.escapeHtml(item.ru)}</div>
          </div>
          <span class="sug-cat">${this.escapeHtml(item.cat)}</span>
        `;

        div.addEventListener('mousedown', (e) => {
          e.preventDefault();
          this.applyProduceSuggestion(item, isEditModal, editCtx);
          popupEl.style.display = 'none';
        });

        popupEl.appendChild(div);
      });

      popupEl.style.display = 'flex';
    };

    inputEl.addEventListener('input', renderSuggestions);
    inputEl.addEventListener('focus', renderSuggestions);

    inputEl.addEventListener('keydown', (e) => {
      const items = popupEl.querySelectorAll('.suggestion-item');
      if (popupEl.style.display !== 'flex' || items.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        this.highlightSuggestion(items, selectedIndex);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        this.highlightSuggestion(items, selectedIndex);
      } else if (e.key === 'Enter') {
        if (selectedIndex >= 0 && selectedIndex < items.length) {
          e.preventDefault();
          items[selectedIndex].dispatchEvent(new MouseEvent('mousedown'));
        }
      } else if (e.key === 'Escape') {
        popupEl.style.display = 'none';
      }
    });

    // Auto-match category and translations when typing finishes / focus leaves input
    const autoMatchCategory = () => {
      const term = inputEl.value.trim();
      if (!term) return;
      const match = LookupService.findInDictionary(term);
      if (match) {
        if (!isEditModal) {
          if (match.kh) {
            this.fieldNameKh.value = match.kh; // Priority dictionary Khmer
            this.highlightField(this.fieldNameKh);
          }
          if (match.cat) {
            this.selectCategoryByName(match.cat);
          }
          if (match.form && (!this.selectedForm || this.selectedForm === FORMS[0].label)) {
            this.selectFormByName(match.form);
          }
          if (match.en && !this.fieldNameEn.value.trim()) {
            this.fieldNameEn.value = match.en;
          }
          if (match.ru && !this.fieldNameRu.value.trim()) {
            this.fieldNameRu.value = match.ru;
          }
          if (match.desc && !this.fieldDescription.value.trim()) {
            this.fieldDescription.value = match.desc;
          }
          this.checkDuplicateProduct(this.fieldNameEn.value, this.fieldNameRu.value, this.fieldForm.value || this.selectedForm);
        } else if (editCtx) {
          if (match.kh && editCtx.editNameKh) {
            editCtx.editNameKh.value = match.kh; // Priority dictionary Khmer
            this.highlightField(editCtx.editNameKh);
          }
          if (match.cat && editCtx.editCategory) {
            editCtx.editCategory.value = match.cat;
          }
          if (match.form && editCtx.editFormSelect) {
            editCtx.editFormSelect.value = match.form;
          }
          if (match.desc && editCtx.editDescription && !editCtx.editDescription.value.trim()) {
            editCtx.editDescription.value = match.desc;
          }
        }
      }
    };

    inputEl.addEventListener('blur', autoMatchCategory);
    inputEl.addEventListener('change', autoMatchCategory);
  }

  highlightSuggestion(items, index) {
    items.forEach((item, idx) => {
      if (idx === index) {
        item.classList.add('active');
        item.scrollIntoView({ block: 'nearest' });
      } else {
        item.classList.remove('active');
      }
    });
  }

  applyProduceSuggestion(item, isEditModal = false, editCtx = null) {
    if (!isEditModal) {
      this.fieldNameEn.value = item.en;
      this.fieldNameRu.value = item.ru;
      this.fieldNameKh.value = item.kh;
      this.selectCategoryByName(item.cat);
      if (item.form) this.selectFormByName(item.form);
      if (item.desc && !this.fieldDescription.value.trim()) {
        this.fieldDescription.value = item.desc;
      }
      this.showToast(`✨ Выбран «${item.en}»`);
      this.checkDuplicateProduct(item.en, item.ru, item.form);
    } else if (editCtx) {
      editCtx.editNameEn.value = item.en;
      editCtx.editNameRu.value = item.ru;
      editCtx.editNameKh.value = item.kh;
      if (editCtx.editCategory) editCtx.editCategory.value = item.cat;
      if (editCtx.editFormSelect && item.form) editCtx.editFormSelect.value = item.form;
      if (editCtx.editDescription && item.desc && !editCtx.editDescription.value.trim()) {
        editCtx.editDescription.value = item.desc;
      }
      this.showToast(`✨ Выбран «${item.en}»`);
    }
  }

  // ------------------------------------------------------------------------
  // Smart Lookup
  // ------------------------------------------------------------------------
  async handleLookup(isEdit = false, editCtx = null) {
    const enInput = isEdit ? editCtx?.editNameEn : this.fieldNameEn;
    const ruInput = isEdit ? editCtx?.editNameRu : this.fieldNameRu;
    const khInput = isEdit ? editCtx?.editNameKh : this.fieldNameKh;
    const descInput = isEdit ? editCtx?.editDescription : this.fieldDescription;
    const btn = isEdit ? editCtx?.btnEditLookup : this.btnLookup;

    const enVal = enInput?.value.trim() || '';
    const ruVal = ruInput?.value.trim() || '';
    const khVal = khInput?.value.trim() || '';
    const term = enVal || ruVal || khVal;

    if (!term) {
      this.showToast('Введите название на EN или RU для поиска');
      if (enInput) enInput.focus();
      return;
    }

    if (btn) btn.classList.add('loading');

    try {
      const result = await LookupService.lookup(term);
      if (result) {
        if (!enInput.value.trim() && result.name_en) {
          enInput.value = result.name_en;
          this.highlightField(enInput);
        }
        if (!ruInput.value.trim() && result.name_ru) {
          ruInput.value = result.name_ru;
          this.highlightField(ruInput);
        }
        if (result.name_kh && khInput) {
          khInput.value = result.name_kh;
          this.highlightField(khInput);
        }
        if (result.category) {
          if (isEdit && editCtx?.editCategory) {
            editCtx.editCategory.value = result.category;
            this.highlightField(editCtx.editCategory);
          } else {
            this.selectCategoryByName(result.category);
          }
        }
        if (result.form) {
          if (isEdit && editCtx?.editFormSelect) {
            let exists = false;
            for (let opt of editCtx.editFormSelect.options) {
              if (opt.value === result.form) {
                opt.selected = true;
                exists = true;
                break;
              }
            }
            if (!exists) {
              const newOpt = new Option(result.form, result.form, true, true);
              editCtx.editFormSelect.add(newOpt);
            }
            this.highlightField(editCtx.editFormSelect);
          } else {
            this.selectFormByName(result.form);
          }
        }
        if (result.description && (!descInput.value.trim())) {
          descInput.value = result.description;
          this.highlightField(descInput);
        }
        this.showToast(`✨ Найдено: ${result.name_en || result.name_ru}`);
        if (!isEdit) {
          this.checkDuplicateProduct(enInput.value, ruInput.value, this.fieldForm.value || this.selectedForm);
        }
      } else {
        this.showToast('Не удалось найти перевод, заполните вручную');
      }
    } catch (e) {
      console.error(e);
      this.showToast('Ошибка при поиске');
    } finally {
      if (btn) btn.classList.remove('loading');
    }
  }

  selectCategoryByName(categoryName) {
    if (!categoryName || !this.categoryChips) return;
    const targetName = categoryName.trim();
    const chips = this.categoryChips.querySelectorAll('.chip-btn');
    chips.forEach(chip => {
      const chipText = chip.querySelector('span')?.textContent?.trim() || chip.textContent.trim();
      const chipCat = chip.dataset.category || chipText;
      if (chipCat === targetName || chip.dataset.id === targetName || chipText.includes(targetName) || targetName.includes(chipCat)) {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.selectedCategory = chipCat;
        this.fieldCategory.value = chipCat;
        chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    });
  }

  // ------------------------------------------------------------------------
  // Instant Duplicate Product Checker
  // ------------------------------------------------------------------------
  checkDuplicateProduct(nameEn, nameRu, form = '', showToastMessage = true, ignoreId = null) {
    if (!nameEn && !nameRu) return null;
    const enNorm = (nameEn || '').trim().toLowerCase();
    const ruNorm = (nameRu || '').trim().toLowerCase();
    const formNorm = (form || 'целый').trim().toLowerCase();

    // Find matches by name in active catalog
    const existingByName = (this.products || []).filter(p => {
      if (ignoreId && p.id === ignoreId) return false;
      const pEn = (p.name_en || '').trim().toLowerCase();
      const pRu = (p.name_ru || '').trim().toLowerCase();
      return (enNorm && pEn === enNorm) || (ruNorm && pRu === ruNorm);
    });

    if (existingByName.length === 0) return null;

    // 1. Exact duplicate check: same name AND same form
    const exactDuplicate = existingByName.find(p => {
      const pForm = (p.form || 'Целый').trim().toLowerCase();
      return pForm === formNorm;
    });

    if (exactDuplicate) {
      if (showToastMessage) {
        this.showToast(`⚠️ «${exactDuplicate.name_en}» (${exactDuplicate.form || 'Целый'}) уже есть в каталоге!`, 'warning');
      }
      return { type: 'exact', product: exactDuplicate };
    }

    // 2. Same name, different form: informative message
    if (showToastMessage && existingByName.length > 0) {
      const existingForms = existingByName.map(p => p.form || 'Целый').join(', ');
      this.showToast(`ℹ️ «${existingByName[0].name_en}» уже есть в форме: ${existingForms}`, 'info');
    }
    return { type: 'different_form', existing: existingByName };
  }

  selectFormByName(formLabel) {
    const chips = this.formChips.querySelectorAll('.chip-btn');
    let matched = false;
    chips.forEach(chip => {
      if (chip.textContent === formLabel) {
        chips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        this.selectedForm = formLabel;
        this.fieldForm.value = formLabel;
        this.customFormWrap.style.display = 'none';
        matched = true;
      }
    });
    if (!matched) {
      const lastChip = chips[chips.length - 1];
      chips.forEach(c => c.classList.remove('active'));
      lastChip.classList.add('active');
      this.customFormWrap.style.display = 'block';
      this.fieldCustomForm.value = formLabel;
      this.selectedForm = formLabel;
      this.fieldForm.value = formLabel;
    }
  }

  // ------------------------------------------------------------------------
  // Data Operations
  // ------------------------------------------------------------------------
  async loadData() {
    try {
      this.products = await storage.getAll();
      this.updateStats();
      this.renderRecentList();
      this.renderProductsList();
    } catch (e) {
      console.error(e);
      this.showToast('Ошибка загрузки данных');
    }
  }

  async handleSubmit() {
    const nameEn = this.fieldNameEn.value.trim();
    const nameRu = this.fieldNameRu.value.trim();
    let nameKh = this.fieldNameKh.value.trim();
    let category = this.fieldCategory.value || this.selectedCategory;
    let form = this.fieldForm.value || this.selectedForm;
    let description = this.fieldDescription.value.trim();

    if (!nameEn) {
      this.showToast('Заполните поле Name (EN)');
      this.fieldNameEn.focus();
      return;
    }

    if (!nameRu) {
      this.showToast('Заполните поле Название (RU)');
      this.fieldNameRu.focus();
      return;
    }

    // Prevent saving exact duplicate (same name AND same form)
    const duplicateCheck = this.checkDuplicateProduct(nameEn, nameRu, form, false);
    if (duplicateCheck && duplicateCheck.type === 'exact') {
      this.showToast(`⚠️ «${duplicateCheck.product.name_en}» (${duplicateCheck.product.form || 'Целый'}) уже есть в каталоге!`, 'warning');
      return;
    }

    // Final Dictionary Check: Dictionary data (especially Khmer) ALWAYS has priority
    const dictMatch = LookupService.findInDictionary(nameEn) || LookupService.findInDictionary(nameRu);
    if (dictMatch) {
      if (dictMatch.kh) nameKh = dictMatch.kh;
      if (dictMatch.cat) category = dictMatch.cat;
      if (dictMatch.form && (!form || form === FORMS[0].label)) form = dictMatch.form;
      if (dictMatch.desc && !description) description = dictMatch.desc;
    }

    let imgUrl = this.currentImageBase64;
    if (imgUrl && imgUrl.startsWith('data:') && CloudinaryService.isConfigured()) {
      try {
        this.showToast('☁️ Загружаем фото в Cloudinary...');
        imgUrl = await CloudinaryService.upload(imgUrl);
      } catch (err) {
        console.warn('Cloudinary upload failed, fallback to local base64:', err);
        this.showToast('⚠️ Не удалось загрузить в Cloudinary, сохранено локально');
      }
    }

    const newProduct = {
      name_en: nameEn,
      name_ru: nameRu,
      name_kh: nameKh,
      category: category,
      form: form,
      description: description,
      img_url: imgUrl
    };

    try {
      const saved = await storage.create(newProduct);
      saveCustomProduceToDictionary(newProduct);
      this.products.unshift(saved);
      this.updateStats();
      this.renderRecentList();
      this.showToast(`✅ «${nameEn}» добавлен!`);

      this.resetForm();
      this.closeAddModal();
      this.switchView('viewList');
    } catch (e) {
      console.error(e);
      this.showToast(e.message ? `❌ Ошибка: ${e.message}` : 'Не удалось сохранить продукт');
    }
  }

  resetForm() {
    this.productForm.reset();
    this.renderCategoryChips();
    this.renderFormChips();
    this.clearImagePreview();
    this.fieldCustomForm.value = '';
    this.customFormWrap.style.display = 'none';
    if (this.activeFilterCategory && this.activeFilterCategory !== 'all') {
      this.selectCategoryByName(this.activeFilterCategory);
    }
  }

  handleDelete(id, name) {
    this.pendingDeleteId = id;
    this.pendingDeleteName = name;
    this.deleteConfirmMsg.textContent = `Вы действительно хотите удалить «${name}» из каталога?`;
    this.deleteModal.style.display = 'flex';
  }

  closeDeleteModal() {
    this.deleteModal.style.display = 'none';
    this.pendingDeleteId = null;
    this.pendingDeleteName = '';
  }

  async deleteProductEverywhere(id, product = null) {
    const errors = [];

    // 1. Always delete from LocalStorage
    try {
      const localAdapter = new LocalStorageAdapter();
      await localAdapter.delete(id);

      // If product object is known, also remove any local matching item by name_en (in case ID differed)
      if (product && product.name_en) {
        const localProds = await localAdapter.getAll();
        const targetName = (product.name_en || '').toLowerCase().trim();
        const cleaned = localProds.filter(p => p.id !== id && (p.name_en || '').toLowerCase().trim() !== targetName);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
      }
    } catch (localErr) {
      console.warn('[FreshMarket] Error deleting from LocalStorage:', localErr);
      errors.push(localErr.message);
    }

    // 2. If Supabase credentials are configured, also delete from Supabase
    const sbUrl = localStorage.getItem('freshmarket_supabase_url');
    const sbKey = localStorage.getItem('freshmarket_supabase_key');
    if (sbUrl && sbKey) {
      try {
        const sb = new SupabaseAdapter(sbUrl, sbKey);
        await sb.delete(id);

        // Also delete by matching name_en if known (to remove duplicate cloud records)
        if (product && product.name_en) {
          const encodedName = encodeURIComponent(product.name_en.trim());
          await fetch(`${sb.url}/rest/v1/products?name_en=eq.${encodedName}`, {
            method: 'DELETE',
            headers: sb.headers
          }).catch(() => {});
        }
      } catch (sbErr) {
        console.warn('[FreshMarket] Error deleting from Supabase:', sbErr);
        if (localStorage.getItem('freshmarket_storage_provider') === 'supabase') {
          errors.push(sbErr.message);
        }
      }
    }

    // 3. If product has an image hosted on Cloudinary, delete it from Cloudinary
    if (product && product.img_url && (product.img_url.includes('cloudinary.com') || product.img_url.includes('res.cloudinary'))) {
      try {
        await CloudinaryService.delete(product.img_url);
      } catch (cloudErr) {
        console.warn('[FreshMarket] Error deleting image from Cloudinary:', cloudErr);
      }
    }

    if (errors.length > 0 && localStorage.getItem('freshmarket_storage_provider') === 'supabase') {
      throw new Error(errors.join(', '));
    }
  }

  async executeDelete() {
    if (!this.pendingDeleteId) return;
    const id = this.pendingDeleteId;
    const name = this.pendingDeleteName;
    const targetProduct = this.products.find(p => p.id === id);

    try {
      await this.deleteProductEverywhere(id, targetProduct);
      this.products = this.products.filter(p => p.id !== id);
      this.updateStats();
      this.renderRecentList();
      this.renderProductsList();
      this.closeDeleteModal();
      this.showToast(`«${name}» удален`);
    } catch (e) {
      console.error(e);
      this.showToast(e.message ? `❌ Ошибка при удалении: ${e.message}` : 'Ошибка при удалении');
    }
  }

  // ------------------------------------------------------------------------
  // Stats & Dashboard Rendering
  // ------------------------------------------------------------------------
  updateStats() {
    const categoriesUsed = new Set(this.products.map(p => p.category)).size;
    const totalCategories = CATEGORIES.length;
    const dictTotal = PRODUCE_DICTIONARY.length;
    const userProductsCount = this.products.length;

    if (this.statCategoriesRatio) this.statCategoriesRatio.textContent = `${categoriesUsed} / ${totalCategories}`;
    if (this.statDictCount) this.statDictCount.textContent = dictTotal;
    if (this.statProductsCount) this.statProductsCount.textContent = userProductsCount;

    this.renderCategoryStatsBreakdown();
  }

  renderCategoryStatsBreakdown() {
    if (!this.categoryStatsGrid) return;
    this.categoryStatsGrid.innerHTML = '';

    // Count products per category
    const countMap = {};
    this.products.forEach(p => {
      countMap[p.category] = (countMap[p.category] || 0) + 1;
    });

    CATEGORIES.forEach(cat => {
      const count = countMap[cat.name] || 0;
      const pill = document.createElement('div');
      pill.className = 'category-stat-pill';
      pill.innerHTML = `
        <div class="cat-pill-left">
          <span class="cat-pill-icon">${cat.icon}</span>
          <span class="cat-pill-name">${this.escapeHtml(cat.name)}</span>
        </div>
        <span class="cat-pill-count" style="${count === 0 ? 'opacity:0.4;' : ''}">${count}</span>
      `;

      pill.addEventListener('click', () => {
        this.activeFilterCategory = cat.name;
        this.updateActiveFilterPills();
        this.switchView('viewList');
      });

      this.categoryStatsGrid.appendChild(pill);
    });
  }

  renderRecentList() {
    if (!this.recentList) return;
    const recents = this.products.slice(0, 3);
    this.recentList.innerHTML = '';

    if (recents.length === 0) {
      this.recentList.innerHTML = '<div class="recent-empty">Каталог пока пуст</div>';
      return;
    }

    recents.forEach(item => {
      const div = document.createElement('div');
      div.className = 'recent-item';
      div.innerHTML = `
        <div class="recent-info">
          <div class="recent-name-en">${this.escapeHtml(item.name_en)}</div>
          ${item.name_kh ? `<div class="recent-name-kh khmer-font">${this.escapeHtml(item.name_kh)}</div>` : ''}
          <div class="recent-name-ru">${this.escapeHtml(item.name_ru)} • <span class="recent-cat">${this.escapeHtml(item.category)}</span></div>
        </div>
        ${item.img_url ? `<img src="${item.img_url}" class="recent-img" alt="${this.escapeHtml(item.name_en)}" />` : ''}
      `;
      div.addEventListener('click', () => {
        this.switchView('viewList');
      });
      this.recentList.appendChild(div);
    });
  }

  // ------------------------------------------------------------------------
  // List Screen Rendering
  // ------------------------------------------------------------------------
  renderProductsList() {
    let list = this.products;

    // Filter by Category
    if (this.activeFilterCategory !== 'all') {
      list = list.filter(p => p.category === this.activeFilterCategory);
    }

    // Filter by Search Query
    if (this.searchQuery) {
      list = list.filter(p =>
        (p.name_en && p.name_en.toLowerCase().includes(this.searchQuery)) ||
        (p.name_ru && p.name_ru.toLowerCase().includes(this.searchQuery)) ||
        (p.name_kh && p.name_kh.toLowerCase().includes(this.searchQuery)) ||
        (p.description && p.description.toLowerCase().includes(this.searchQuery))
      );
    }

    this.productsGrid.innerHTML = '';

    if (list.length === 0) {
      this.emptyState.style.display = 'flex';
      return;
    }

    this.emptyState.style.display = 'none';

    list.forEach(item => {
      const container = document.createElement('div');
      container.className = 'swipe-container';
      container.setAttribute('data-id', item.id);

      const catObj = CATEGORIES.find(c => c.name === item.category);
      const catIcon = catObj ? catObj.icon : '📦';

      container.innerHTML = `
        <!-- Underlay Action Buttons (Revealed on Swipe Left) -->
        <div class="swipe-actions-underlay">
          <button type="button" class="swipe-action-btn btn-swipe-edit" title="Редактировать" data-id="${item.id}">
            <span class="swipe-icon">✏️</span>
          </button>
          <button type="button" class="swipe-action-btn btn-swipe-delete" title="Удалить" data-id="${item.id}" data-name="${this.escapeHtml(item.name_en)}">
            <span class="swipe-icon">🗑️</span>
          </button>
        </div>

        <!-- Main Card Content Surface -->
        <div class="swipe-card-content product-card">
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
            <!-- Badges (Category & Form - hidden in collapsed state) -->
            <div class="card-badges">
              <span class="badge badge-category">${catIcon} ${this.escapeHtml(item.category)}</span>
              ${item.form ? `<span class="badge badge-form">${this.escapeHtml(item.form)}</span>` : ''}
            </div>

            ${item.img_url ? `
              <div class="card-photo-container">
                <img src="${item.img_url}" class="card-photo-full" alt="${this.escapeHtml(item.name_en)}" loading="lazy" />
              </div>
            ` : ''}

            ${item.description ? `<div class="card-desc">${this.escapeHtml(item.description)}</div>` : ''}
          </div>
        </div>
      `;

      // Event listeners for underlay action buttons
      container.querySelector('.btn-swipe-edit').addEventListener('click', (e) => {
        e.stopPropagation();
        this.closeAllSwipes();
        this.openEditModal(item);
      });

      container.querySelector('.btn-swipe-delete').addEventListener('click', (e) => {
        e.stopPropagation();
        this.handleDelete(item.id, item.name_en);
      });

      // Toggle card collapse / expand via chevron button or clicking .card-names-block
      const toggleCollapse = (e) => {
        e.stopPropagation();
        const cardEl = container.querySelector('.product-card');
        if (cardEl && !cardEl.classList.contains('swiped-open')) {
          cardEl.classList.toggle('is-collapsed');
        }
      };

      const toggleBtn = container.querySelector('.btn-card-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleCollapse);
      }

      const namesBlock = container.querySelector('.card-names-block');
      if (namesBlock) {
        namesBlock.addEventListener('click', toggleCollapse);
      }

      // Attach Swipe Gesture Handler
      this.initSwipeGesture(container);

      this.productsGrid.appendChild(container);
    });
  }

  // ------------------------------------------------------------------------
  // Swipe Actions Controller (Swipe Left to Reveal Edit/Delete)
  // ------------------------------------------------------------------------
  closeAllSwipes(exceptContainer = null) {
    const swipedCards = document.querySelectorAll('.swipe-card-content.swiped-open');
    swipedCards.forEach(card => {
      if (!exceptContainer || !exceptContainer.contains(card)) {
        card.style.transform = 'translateX(0px)';
        card.classList.remove('swiped-open');
      }
    });
  }

  initSwipeGesture(container) {
    const card = container.querySelector('.swipe-card-content');
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let isSwiping = false;
    let isHorizontal = null;
    const maxRevealWidth = 110; // width of 2 action buttons

    const handleStart = (clientX, clientY) => {
      this.closeAllSwipes(container);
      startX = clientX;
      startY = clientY;
      currentX = card.classList.contains('swiped-open') ? -maxRevealWidth : 0;
      isSwiping = true;
      isHorizontal = null;
      card.style.transition = 'none';
    };

    const handleMove = (clientX, clientY, e) => {
      if (!isSwiping) return;

      const deltaX = clientX - startX;
      const deltaY = clientY - startY;

      // Determine gesture direction on initial move
      if (isHorizontal === null) {
        if (Math.abs(deltaX) > 6 || Math.abs(deltaY) > 6) {
          isHorizontal = Math.abs(deltaX) > Math.abs(deltaY);
        }
      }

      if (!isHorizontal) return;

      if (e && e.cancelable) {
        e.preventDefault();
      }

      let newX = currentX + deltaX;

      // Resistance when dragging right past 0 or left past -maxRevealWidth
      if (newX > 0) {
        newX = newX * 0.2;
      } else if (newX < -maxRevealWidth) {
        newX = -maxRevealWidth + (newX + maxRevealWidth) * 0.2;
      }

      card.style.transform = `translateX(${newX}px)`;
    };

    const handleEnd = (clientX) => {
      if (!isSwiping) return;
      isSwiping = false;
      card.style.transition = 'transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)';

      const deltaX = clientX - startX;
      const finalX = currentX + deltaX;

      // Snap logic
      if (card.classList.contains('swiped-open')) {
        if (deltaX > 25) {
          // Closed by swipe right
          card.style.transform = 'translateX(0px)';
          card.classList.remove('swiped-open');
        } else {
          // Keep open
          card.style.transform = `translateX(-${maxRevealWidth}px)`;
        }
      } else {
        if (finalX < -40) {
          // Open
          card.style.transform = `translateX(-${maxRevealWidth}px)`;
          card.classList.add('swiped-open');
        } else {
          // Snap closed
          card.style.transform = 'translateX(0px)';
          card.classList.remove('swiped-open');
        }
      }
    };

    // Touch Event Listeners (Mobile)
    card.addEventListener('touchstart', (e) => {
      const touch = e.touches[0];
      handleStart(touch.clientX, touch.clientY);
    }, { passive: true });

    card.addEventListener('touchmove', (e) => {
      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY, e);
    }, { passive: false });

    card.addEventListener('touchend', (e) => {
      const touch = e.changedTouches[0];
      handleEnd(touch.clientX);
    });

    card.addEventListener('touchcancel', (e) => {
      const touch = e.changedTouches[0];
      handleEnd(touch ? touch.clientX : startX);
    });

    // Pointer Event Listeners (Desktop mouse drag)
    card.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button === 0) {
        handleStart(e.clientX, e.clientY);

        const onPointerMove = (moveEvent) => {
          handleMove(moveEvent.clientX, moveEvent.clientY, moveEvent);
        };

        const onPointerUp = (upEvent) => {
          handleEnd(upEvent.clientX);
          window.removeEventListener('pointermove', onPointerMove);
          window.removeEventListener('pointerup', onPointerUp);
        };

        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);
      }
    });

    // Tap card to close if open
    card.addEventListener('click', (e) => {
      if (card.classList.contains('swiped-open')) {
        e.stopPropagation();
        card.style.transition = 'transform 0.2s ease';
        card.style.transform = 'translateX(0px)';
        card.classList.remove('swiped-open');
      }
    });
  }

  // ------------------------------------------------------------------------
  // Edit Modal (Dropdown for Forms & Full Photo Edit Support)
  // ------------------------------------------------------------------------
  openEditModal(item) {
    this.editModalImageBase64 = item.img_url || '';

    // Collect all available form options + current form if not in list
    const formOptions = FORMS.filter(f => f.id !== 'custom').map(f => f.label);
    if (item.form && !formOptions.includes(item.form)) {
      formOptions.push(item.form);
    }

    this.modalBody.innerHTML = `
      <form id="editForm" class="product-form" novalidate>
        <!-- 1. PHOTO / IMAGE (First - triggers visual AI analysis) -->
        <div class="form-group photo-block">
          <div class="photo-block-header">
            <label class="field-label">1. Фото продукта</label>
            <span class="ai-badge">✨ AI Автозаполнение</span>
          </div>
          <div class="image-picker-zone" id="editImagePickerZone">
            <input type="file" id="editImageFile" accept="image/*" class="file-input-hidden" />
            <div class="image-placeholder" id="editImagePlaceholder" style="display: ${this.editModalImageBase64 ? 'none' : 'flex'};">
              <div class="cam-icon">📷</div>
              <span class="picker-text">Сделайте фото или выберите из галереи</span>
              <span class="picker-subtext">ИИ автоматически определит продукт и заполнит поля</span>
            </div>
            <div class="image-preview-container" id="editImagePreviewContainer" style="display: ${this.editModalImageBase64 ? 'block' : 'none'};">
              <img id="editImagePreview" src="${this.editModalImageBase64}" alt="Превью" />
              <div class="ai-scan-overlay" id="editAiScanOverlay" style="display: none;">
                <div class="ai-scan-line"></div>
                <div class="ai-scan-status">
                  <span class="spinner ai-spinner"></span>
                  <span class="ai-scan-text">Распознаём продукт...</span>
                </div>
              </div>
              <button type="button" class="btn-remove-photo" id="editBtnRemovePhoto" title="Удалить фото">✕</button>
            </div>
          </div>
        </div>

        <!-- 2. NAMES BLOCK (EN, RU mandatory, KH Khmer with (transcription) + Online Lookup) -->
        <div class="form-group names-block">
          <div class="names-block-header">
            <label class="field-label">2. Названия <span class="req-star">*</span></label>
            <button type="button" class="btn-lookup" id="btnEditLookup"
              title="Автоматически найти перевод и кхмерское название с транскрипцией">
              <span class="lookup-icon">✨</span>
              <span class="lookup-text">Автопоиск (EN/RU/KH)</span>
              <span class="spinner" id="editLookupSpinner"></span>
            </button>
          </div>

          <!-- EN Name (Mandatory) -->
          <div class="input-wrap has-suggestions" style="position:relative;">
            <span class="input-lang-badge">EN *</span>
            <input type="text" id="editNameEn" class="text-input" value="${this.escapeHtml(item.name_en)}"
              placeholder="e.g. Chicken, Lemongrass, Garlic" autocomplete="off" required />
            <div class="suggestions-popup edit-suggestions-popup" id="editSuggestionsEn" style="display:none;"></div>
          </div>

          <!-- RU Name (Mandatory) -->
          <div class="input-wrap has-suggestions" style="position:relative;">
            <span class="input-lang-badge">RU *</span>
            <input type="text" id="editNameRu" class="text-input" value="${this.escapeHtml(item.name_ru)}"
              placeholder="напр. Курица, Лемонграсс, Чеснок" autocomplete="off" required />
            <div class="suggestions-popup edit-suggestions-popup" id="editSuggestionsRu" style="display:none;"></div>
          </div>

          <!-- KH Name (Khmer script + English transcription in brackets) -->
          <div class="input-wrap khmer-wrap">
            <span class="input-lang-badge kh-badge">KH</span>
            <input type="text" id="editNameKh" class="text-input khmer-input"
              placeholder="напр. សាច់មាន់ (Sach Moan), ស្លឹកគ្រៃ (Sloek Krey)"
              value="${this.escapeHtml(item.name_kh || '')}" autocomplete="off" />
          </div>
          <div class="field-hint">Подсказки появляются автоматически при вводе или анализе фото.</div>
        </div>

        <!-- 3. CATEGORY -->
        <div class="form-group">
          <label class="field-label">3. Категория <span class="req-star">*</span></label>
          <select id="editCategory" class="text-input select-input" required>
            ${CATEGORIES.map(c => `<option value="${c.name}" ${c.name === item.category ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('')}
          </select>
        </div>

        <!-- 4. FORM / STATE -->
        <div class="form-group">
          <label class="field-label">4. Форма / Состояние продукта</label>
          <select id="editFormSelect" class="text-input select-input">
            ${formOptions.map(f => `<option value="${f}" ${f === item.form ? 'selected' : ''}>${f}</option>`).join('')}
          </select>
        </div>

        <!-- 5. DESCRIPTION / NOTES -->
        <div class="form-group">
          <label class="field-label">5. Описание / Заметки</label>
          <textarea id="editDescription" class="text-input textarea-input" rows="3"
            placeholder="Вкус, как выбирать на рынке, в какие блюда добавлять...">${this.escapeHtml(item.description || '')}</textarea>
        </div>

        <!-- FORM ACTIONS -->
        <div class="form-actions" style="margin-top:14px;">
          <button type="submit" class="btn btn-primary">Сохранить изменения</button>
        </div>
      </form>
    `;

    // Elements inside edit modal
    const editImagePickerZone = document.getElementById('editImagePickerZone');
    const editImageFile = document.getElementById('editImageFile');
    const editImagePlaceholder = document.getElementById('editImagePlaceholder');
    const editImagePreviewContainer = document.getElementById('editImagePreviewContainer');
    const editImagePreview = document.getElementById('editImagePreview');
    const editAiScanOverlay = document.getElementById('editAiScanOverlay');
    const editBtnRemovePhoto = document.getElementById('editBtnRemovePhoto');

    const editNameEn = document.getElementById('editNameEn');
    const editNameRu = document.getElementById('editNameRu');
    const editNameKh = document.getElementById('editNameKh');
    const editSuggestionsEn = document.getElementById('editSuggestionsEn');
    const editSuggestionsRu = document.getElementById('editSuggestionsRu');
    const btnEditLookup = document.getElementById('btnEditLookup');
    const editCategory = document.getElementById('editCategory');
    const editFormSelect = document.getElementById('editFormSelect');
    const editDescription = document.getElementById('editDescription');

    const editCtx = {
      editNameEn,
      editNameRu,
      editNameKh,
      editCategory,
      editFormSelect,
      editDescription,
      editAiScanOverlay,
      btnEditLookup
    };

    // Hook photo events inside edit modal
    editImagePickerZone.addEventListener('click', (e) => {
      if (e.target !== editBtnRemovePhoto) {
        editImageFile.click();
      }
    });

    editImageFile.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (file) {
        try {
          const base64 = await compressImage(file, 800, 0.75);
          this.editModalImageBase64 = base64;
          editImagePreview.src = base64;
          editImagePlaceholder.style.display = 'none';
          editImagePreviewContainer.style.display = 'block';

          // Trigger Gemini Vision AI analysis for edit modal
          this.analyzeImageWithGemini(base64, true, editCtx);
        } catch (err) {
          this.showToast('Ошибка при загрузке фото');
        }
      }
    });

    editBtnRemovePhoto.addEventListener('click', (e) => {
      e.stopPropagation();
      this.editModalImageBase64 = '';
      editImagePreview.src = '';
      editImageFile.value = '';
      editImagePlaceholder.style.display = 'flex';
      editImagePreviewContainer.style.display = 'none';
      if (editAiScanOverlay) editAiScanOverlay.style.display = 'none';
    });

    // Hook autocomplete suggestions for edit modal inputs
    this.bindSuggestionsToInput(editNameEn, editSuggestionsEn, 'en', true, editCtx);
    this.bindSuggestionsToInput(editNameRu, editSuggestionsRu, 'ru', true, editCtx);

    // Hook smart lookup button in edit modal
    if (btnEditLookup) {
      btnEditLookup.addEventListener('click', () => this.handleLookup(true, editCtx));
    }

    // Handle Edit Form Submission
    const editForm = document.getElementById('editForm');
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const nameEn = document.getElementById('editNameEn').value.trim();
      const nameRu = document.getElementById('editNameRu').value.trim();

      if (!nameEn) {
        this.showToast('Заполните поле Name (EN)');
        return;
      }
      if (!nameRu) {
        this.showToast('Заполните поле Название (RU)');
        return;
      }

      let finalImgUrl = this.editModalImageBase64;
      if (finalImgUrl && finalImgUrl.startsWith('data:') && CloudinaryService.isConfigured()) {
        try {
          this.showToast('☁️ Загружаем фото в Cloudinary...');
          finalImgUrl = await CloudinaryService.upload(finalImgUrl);
          this.editModalImageBase64 = finalImgUrl;
        } catch (err) {
          console.warn('Cloudinary upload failed, keeping base64:', err);
          this.showToast('⚠️ Не удалось загрузить в Cloudinary, сохранено локально');
        }
      }

      // Final Dictionary Check on edit save: Dictionary has priority for Khmer & Category
      let finalNameKh = document.getElementById('editNameKh').value.trim();
      let finalCat = document.getElementById('editCategory').value;
      let finalForm = document.getElementById('editFormSelect').value.trim();
      let finalDesc = document.getElementById('editDescription').value.trim();

      const dictMatch = LookupService.findInDictionary(nameEn) || LookupService.findInDictionary(nameRu);
      if (dictMatch) {
        if (dictMatch.kh) finalNameKh = dictMatch.kh;
        if (dictMatch.cat) finalCat = dictMatch.cat;
        if (dictMatch.desc && !finalDesc) finalDesc = dictMatch.desc;
      }

      const updatedData = {
        category: finalCat,
        name_en: nameEn,
        name_ru: nameRu,
        name_kh: finalNameKh,
        form: finalForm,
        description: finalDesc,
        img_url: this.editModalImageBase64
      };

      try {
        await storage.update(item.id, updatedData);
        saveCustomProduceToDictionary(updatedData);
        const idx = this.products.findIndex(p => p.id === item.id);
        if (idx !== -1) {
          this.products[idx] = { ...this.products[idx], ...updatedData };
        }
        this.renderProductsList();
        this.renderRecentList();
        this.editModal.style.display = 'none';
        this.showToast('✅ Продукт обновлен');
      } catch (err) {
        this.showToast('Ошибка при обновлении');
      }
    });

    this.editModal.style.display = 'flex';
  }

  // ------------------------------------------------------------------------
  // Utilities & Toast Notifications
  // ------------------------------------------------------------------------
  showToast(msg, type = 'auto', duration = 3200) {
    if (!this.toastContainer) {
      this.toastContainer = document.getElementById('toastContainer');
      if (!this.toastContainer) return;
    }

    let toastType = type;
    let icon = '';
    let cleanMsg = String(msg || '').trim();

    // Auto-detect type if 'auto'
    if (toastType === 'auto') {
      if (/^✅|успешно|сохранен|добавлен|обновлен/i.test(cleanMsg)) {
        toastType = 'success';
      } else if (/^⚠️|^❌|ошибка|не удалось|заполните/i.test(cleanMsg)) {
        toastType = 'error';
      } else if (/^ℹ️|^✨|^☀️|^🌙|распознано|найдено|выбран/i.test(cleanMsg)) {
        toastType = 'info';
      } else {
        toastType = 'info';
      }
    }

    // Extract leading emoji icon or set default icon based on toastType
    const emojiMatch = cleanMsg.match(/^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
    if (emojiMatch) {
      icon = emojiMatch[0];
      cleanMsg = cleanMsg.slice(icon.length).trim();
    } else {
      if (toastType === 'success') icon = '✅';
      else if (toastType === 'error') icon = '⚠️';
      else if (toastType === 'warning') icon = '⚠️';
      else icon = 'ℹ️';
    }

    // Cap active toasts to 3 max to avoid stacking over whole screen
    const activeToasts = this.toastContainer.querySelectorAll('.toast-item:not(.toast-hiding)');
    if (activeToasts.length >= 3) {
      this.removeToast(activeToasts[0]);
    }

    // Create toast element
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

    this.toastContainer.appendChild(toastEl);
  }

  removeToast(toastEl) {
    if (!toastEl || toastEl.classList.contains('toast-hiding')) return;
    if (toastEl._toastTimer) {
      clearTimeout(toastEl._toastTimer);
      toastEl._toastTimer = null;
    }
    toastEl.classList.add('toast-hiding');
    setTimeout(() => {
      if (toastEl.parentNode) {
        toastEl.parentNode.removeChild(toastEl);
      }
    }, 240);
  }

  escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  initServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw-admin.js', { scope: './' })
          .then((reg) => {
            console.log('[FreshMarket Admin] Service Worker active with scope:', reg.scope);
          })
          .catch((err) => {
            console.warn('[FreshMarket Admin] Service Worker registration failed:', err);
          });
      });
    }
  }
}

// Global initialization helper for Admin Auth gate
window.initAdminCatalog = function() {
  if (!window.app) {
    window.app = new App();
    window.showToast = (msg, type, duration) => window.app?.showToast(msg, type, duration);
  }
};

// Instantiate on DOM load
document.addEventListener('DOMContentLoaded', () => {
  window.initAdminCatalog();
});
