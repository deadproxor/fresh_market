/**
 * FreshMarket — Universal Quantity, Weight & Unit Selector Component
 * Shared across Shop (picker mode), Admin (config mode), and UI Workbench (components.html).
 */
(function (global) {
  'use strict';

  const PURCHASE_UNITS = [
    {
      id: 'kg',
      family: 'weight',
      toBase: 1,
      i18nKey: 'common.weight_kg',
      fallbackLabel: 'кг',
      step: 0.5,
      smallStep: 0.25,
      min: 0.1,
      max: 100,
      decimals: 2,
      presets: [0.25, 0.5, 1, 1.5, 2, 3],
      defaultQty: 1
    },
    {
      id: 'g',
      family: 'weight',
      toBase: 0.001,
      i18nKey: 'common.unit_g',
      fallbackLabel: 'г',
      step: 100,
      smallStep: 50,
      min: 50,
      max: 5000,
      decimals: 0,
      presets: [100, 200, 250, 300, 500],
      defaultQty: 300
    },
    {
      id: 'pc',
      family: 'pc',
      toBase: 1,
      i18nKey: 'common.unit_pcs',
      fallbackLabel: 'шт',
      step: 1,
      smallStep: 1,
      min: 1,
      max: 100,
      decimals: 0,
      presets: [1, 2, 3, 4, 5, 10],
      defaultQty: 2
    },
    {
      id: 'bunch',
      family: 'bunch',
      toBase: 1,
      i18nKey: 'common.unit_bunch',
      fallbackLabel: 'пучок',
      step: 1,
      smallStep: 1,
      min: 1,
      max: 30,
      decimals: 0,
      presets: [1, 2, 3, 4, 5],
      defaultQty: 1
    },
    {
      id: 'pack',
      family: 'pack',
      toBase: 1,
      i18nKey: 'common.unit_pack',
      fallbackLabel: 'упак',
      step: 1,
      smallStep: 1,
      min: 1,
      max: 50,
      decimals: 0,
      presets: [1, 2, 3, 4, 5],
      defaultQty: 1
    },
    {
      id: 'tray',
      family: 'tray',
      toBase: 1,
      i18nKey: 'common.unit_tray',
      fallbackLabel: 'лоток',
      step: 1,
      smallStep: 1,
      min: 1,
      max: 20,
      decimals: 0,
      presets: [1, 2, 3, 5],
      defaultQty: 1
    },
    {
      id: 'bottle',
      family: 'bottle',
      toBase: 1,
      i18nKey: 'common.unit_bottle',
      fallbackLabel: 'бут',
      step: 1,
      smallStep: 1,
      min: 1,
      max: 24,
      decimals: 0,
      presets: [1, 2, 3, 4, 6],
      defaultQty: 1
    },
    {
      id: 'l',
      family: 'volume',
      toBase: 1,
      i18nKey: 'common.unit_l',
      fallbackLabel: 'л',
      step: 0.5,
      smallStep: 0.25,
      min: 0.2,
      max: 20,
      decimals: 2,
      presets: [0.2, 0.5, 0.7, 1, 2],
      defaultQty: 0.5
    },
    {
      id: 'ml',
      family: 'volume',
      toBase: 0.001,
      i18nKey: 'common.unit_ml',
      fallbackLabel: 'мл',
      step: 100,
      smallStep: 50,
      min: 50,
      max: 5000,
      decimals: 0,
      presets: [100, 250, 500, 750],
      defaultQty: 500
    }
  ];

  const UNIT_BY_ID = Object.create(null);
  PURCHASE_UNITS.forEach((u) => {
    UNIT_BY_ID[u.id] = u;
  });

  // Price reference units (how catalog price is quoted in DB `products.unit`)
  const PRICE_UNIT_META = {
    '1_kg': { purchaseUnit: 'kg', family: 'weight', baseAmount: 1, label: '1 кг' },
    'kg': { purchaseUnit: 'kg', family: 'weight', baseAmount: 1, label: 'кг' },
    '500_g': { purchaseUnit: 'g', family: 'weight', baseAmount: 0.5, label: '500 г' },
    '250_g': { purchaseUnit: 'g', family: 'weight', baseAmount: 0.25, label: '250 г' },
    '100_g': { purchaseUnit: 'g', family: 'weight', baseAmount: 0.1, label: '100 г' },
    'g': { purchaseUnit: 'g', family: 'weight', baseAmount: 0.001, label: 'г' },
    '1_pc': { purchaseUnit: 'pc', family: 'pc', baseAmount: 1, label: '1 шт' },
    'pc': { purchaseUnit: 'pc', family: 'pc', baseAmount: 1, label: 'шт' },
    '10_pcs': { purchaseUnit: 'pc', family: 'pc', baseAmount: 10, label: '10 шт' },
    '1_bunch': { purchaseUnit: 'bunch', family: 'bunch', baseAmount: 1, label: '1 пучок' },
    'bunch': { purchaseUnit: 'bunch', family: 'bunch', baseAmount: 1, label: 'пучок' },
    '1_pack': { purchaseUnit: 'pack', family: 'pack', baseAmount: 1, label: '1 упак' },
    'pack': { purchaseUnit: 'pack', family: 'pack', baseAmount: 1, label: 'упак' },
    '1_tray': { purchaseUnit: 'tray', family: 'tray', baseAmount: 1, label: '1 лоток' },
    'tray': { purchaseUnit: 'tray', family: 'tray', baseAmount: 1, label: 'лоток' },
    '1_bottle': { purchaseUnit: 'bottle', family: 'bottle', baseAmount: 1, label: '1 бут' },
    'bottle': { purchaseUnit: 'bottle', family: 'bottle', baseAmount: 1, label: 'бут' },
    '0_2_l': { purchaseUnit: 'l', family: 'volume', baseAmount: 0.2, label: '0.2 л' },
    '0_5_l': { purchaseUnit: 'l', family: 'volume', baseAmount: 0.5, label: '0.5 л' },
    '0_7_l': { purchaseUnit: 'l', family: 'volume', baseAmount: 0.7, label: '0.7 л' },
    '1_l': { purchaseUnit: 'l', family: 'volume', baseAmount: 1, label: '1 л' },
    'l': { purchaseUnit: 'l', family: 'volume', baseAmount: 1, label: 'л' },
    'ml': { purchaseUnit: 'ml', family: 'volume', baseAmount: 0.001, label: 'мл' }
  };

  function safeEscape(str) {
    if (typeof global.escapeHtml === 'function') return global.escapeHtml(str);
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function translate(key, fallback) {
    if (global.i18n && global.i18n.isReady && typeof global.i18n.t === 'function') {
      const val = global.i18n.t(key);
      if (val && val !== key) return val;
    }
    return fallback;
  }

  function normalizePriceUnitKey(raw) {
    if (!raw || typeof raw !== 'string') return '1_kg';
    const norm = raw.trim().toLowerCase();
    if (!norm) return '1_kg';
    if (PRICE_UNIT_META[norm]) return norm;

    const map = {
      '1 кг': '1_kg', '1 kg': '1_kg', '1kg': '1_kg', 'кг': '1_kg', 'kg': '1_kg', 'គីឡូ': '1_kg',
      '500 г': '500_g', '500 g': '500_g', '500g': '500_g', '0.5 кг': '500_g', '0.5 kg': '500_g',
      '250 г': '250_g', '250 g': '250_g', '250g': '250_g',
      '100 г': '100_g', '100 g': '100_g', '100g': '100_g',
      'г': 'g', 'g': 'g', 'гр': 'g', 'ក្រាម': 'g',
      '10 шт': '10_pcs', '10 pcs': '10_pcs', '10pcs': '10_pcs', '10 pc': '10_pcs', '10 pièces': '10_pcs',
      '1 шт': '1_pc', '1 pc': '1_pc', '1 pcs': '1_pc', '1 pièce': '1_pc', 'шт': '1_pc', 'шт.': '1_pc', 'pc': '1_pc', 'pcs': '1_pc', 'pièce': '1_pc', 'pièces': '1_pc', 'ផ្លែ': '1_pc', 'គ្រាប់': '1_pc',
      '1 пучок': '1_bunch', '1 bunch': '1_bunch', 'пучок': '1_bunch', 'пуч': '1_bunch', 'пуч.': '1_bunch', 'связка': '1_bunch', 'bunch': '1_bunch', 'botte': '1_bunch', 'បាច់': '1_bunch',
      '1 упак': '1_pack', '1 pack': '1_pack', 'упак': '1_pack', 'упак.': '1_pack', 'упаковка': '1_pack', 'пачка': '1_pack', 'pack': '1_pack', 'paquet': '1_pack', 'កញ្ចប់': '1_pack',
      '1 лоток': '1_tray', '1 tray': '1_tray', 'лоток': '1_tray', 'tray': '1_tray', 'barquette': '1_tray', 'ថាស': '1_tray',
      '1 бут': '1_bottle', '1 bottle': '1_bottle', 'бут': '1_bottle', 'бут.': '1_bottle', 'бутылка': '1_bottle', 'bottle': '1_bottle', 'bouteille': '1_bottle', 'ដប': '1_bottle',
      '0.2 л': '0_2_l', '0.2 l': '0_2_l', '0.2l': '0_2_l',
      '0.5 л': '0_5_l', '0.5 l': '0_5_l', '0.5l': '0_5_l',
      '0.7 л': '0_7_l', '0.7 l': '0_7_l', '0.7l': '0_7_l',
      '1 л': '1_l', '1 l': '1_l', '1l': '1_l', 'л': '1_l', 'l': '1_l', 'លីត្រ': '1_l',
      'мл': 'ml', 'ml': 'ml', 'មីលីលីត្រ': 'ml'
    };
    return map[norm] || '1_kg';
  }

  function normalizeUnitSlug(raw, fallback = 'kg') {
    if (!raw || typeof raw !== 'string') return fallback;
    const norm = raw.trim().toLowerCase().replace(/\.$/, '');
    if (!norm) return fallback;
    if (UNIT_BY_ID[norm]) return norm;
    if (PRICE_UNIT_META[norm]) return PRICE_UNIT_META[norm].purchaseUnit;

    if (/^(кг|kg|кило|кіло|គីឡូ|1_kg|1\s*кг|1\s*kg)$/i.test(norm)) return 'kg';
    if (/^(г|гр|g|gr|gram|grams|грамм|грам|ក្រាម|\d+_g|\d+\s*[гg])$/i.test(norm)) return 'g';
    if (/^(шт|pc|pcs|piece|pieces|pièce|pièces|штук|штука|ផ្លែ|គ្រាប់|1_pc|10_pcs|\d+\s*(шт|pcs?|pièces?))$/i.test(norm)) return 'pc';
    if (/^(пучок|пуч|пучка|пучков|связка|bunch|bunches|botte|bottes|បាច់|1_bunch|1\s*пучок)$/i.test(norm)) return 'bunch';
    if (/^(упак|упаковка|пачка|pack|packs|paquet|paquets|កញ្ចប់|1_pack|1\s*упак)$/i.test(norm)) return 'pack';
    if (/^(лоток|лотка|tray|trays|barquette|ថាស|1_tray|1\s*лоток)$/i.test(norm)) return 'tray';
    if (/^(бут|бутылка|бутылок|bottle|bottles|bouteille|ដប|1_bottle|1\s*бут)$/i.test(norm)) return 'bottle';
    if (/^(мл|ml|milliliter|មីលីលីត្រ)$/i.test(norm)) return 'ml';
    if (/^(л|l|литр|літр|liter|litre|លីត្រ|0_2_l|0_5_l|0_7_l|1_l|[\d.]+\s*[лl])$/i.test(norm)) return 'l';

    return fallback;
  }

  function getUnitMeta(unitIdOrRaw) {
    const slug = normalizeUnitSlug(unitIdOrRaw, 'kg');
    return UNIT_BY_ID[slug] || UNIT_BY_ID.kg;
  }

  function getUnitLabel(unitIdOrRaw) {
    const meta = getUnitMeta(unitIdOrRaw);
    return translate(meta.i18nKey, meta.fallbackLabel);
  }

  function getDefaultAllowedUnits(product) {
    const cat = String(product?.category || product?.cat || '').trim().toLowerCase();
    const form = String(product?.form || '').trim().toLowerCase();
    const basePriceKey = normalizePriceUnitKey(product?.unit || '');
    const baseUnit = PRICE_UNIT_META[basePriceKey]?.purchaseUnit || 'kg';

    let units;

    if (
      form.includes('бутылк') || form.includes('bottle') || form.includes('жидк') || form.includes('соус') ||
      cat === 'sauces' || ['bottle', 'l', 'ml'].includes(baseUnit)
    ) {
      units = ['bottle', 'l', 'ml'];
    } else if (form.includes('пучок') || form.includes('bunch') || form.includes('связк') || cat === 'herbs' || baseUnit === 'bunch') {
      units = ['bunch', 'g', 'kg'];
    } else if (cat === 'fruits' || cat === 'vegetables' || cat === 'roots_tubers') {
      units = ['kg', 'g', 'pc'];
    } else if (cat === 'spices_roots') {
      units = ['g', 'kg', 'bunch', 'pc'];
    } else if (cat === 'dairy_eggs') {
      units = baseUnit === 'tray' || baseUnit === 'pc'
        ? ['pc', 'tray', 'pack']
        : ['pc', 'pack', 'kg', 'g'];
    } else if (cat === 'seafood' || cat === 'meat') {
      units = (form.includes('цел') || form.includes('whole') || form === '')
        ? ['kg', 'g', 'pc']
        : ['kg', 'g'];
    } else if (cat === 'mushrooms' || cat === 'grains_noodles' || cat === 'legumes_nuts') {
      units = ['kg', 'g', 'pack'];
    } else if (cat === 'homemade' || cat === 'street_exotic') {
      units = ['pc', 'pack', 'g', 'kg'];
    } else {
      units = ['kg', 'g', 'pc', 'pack'];
    }

    // Ensure the base unit of the product is always included and placed first
    const dedup = [];
    if (UNIT_BY_ID[baseUnit]) dedup.push(baseUnit);
    units.forEach((u) => {
      if (UNIT_BY_ID[u] && !dedup.includes(u)) dedup.push(u);
    });
    return dedup;
  }

  function getAllowedUnits(product) {
    const raw = product?.allowed_units;
    if (Array.isArray(raw) && raw.length > 0) {
      const cleaned = [];
      raw.forEach((entry) => {
        const slug = normalizeUnitSlug(String(entry || ''), '');
        if (slug && UNIT_BY_ID[slug] && !cleaned.includes(slug)) {
          cleaned.push(slug);
        }
      });
      if (cleaned.length > 0) return cleaned;
    }
    return getDefaultAllowedUnits(product);
  }

  function roundQty(val, decimals) {
    const factor = Math.pow(10, decimals);
    return Math.round(val * factor) / factor;
  }

  function formatNumber(val, decimals = 2) {
    const num = Number(val);
    if (!Number.isFinite(num) || num <= 0) return '1';
    const rounded = roundQty(num, decimals);
    return String(rounded);
  }

  function formatQuantity(qty, unitSlug) {
    const meta = getUnitMeta(unitSlug);
    const numStr = formatNumber(qty, meta.decimals);
    return `${numStr} ${getUnitLabel(meta.id)}`;
  }

  function parseQuantityString(qtyInput, fallbackUnit = 'kg') {
    if (qtyInput && typeof qtyInput === 'object' && qtyInput.qty !== undefined) {
      const slug = normalizeUnitSlug(qtyInput.unit || fallbackUnit, fallbackUnit);
      const num = parseFloat(qtyInput.qty);
      return {
        qty: Number.isFinite(num) && num > 0 ? num : getUnitMeta(slug).defaultQty,
        unit: slug
      };
    }

    const str = String(qtyInput ?? '').trim();
    const fallbackSlug = normalizeUnitSlug(fallbackUnit, 'kg');
    if (!str) {
      return { qty: getUnitMeta(fallbackSlug).defaultQty, unit: fallbackSlug };
    }

    const numMatch = str.match(/^([\d]+(?:[.,]\d+)?)/);
    const num = numMatch ? parseFloat(numMatch[1].replace(',', '.')) : NaN;
    const rawUnit = str.replace(/^[\d.,\s]+/, '').trim();
    const unitSlug = rawUnit ? normalizeUnitSlug(rawUnit, fallbackSlug) : fallbackSlug;

    return {
      qty: Number.isFinite(num) && num > 0 ? num : getUnitMeta(unitSlug).defaultQty,
      unit: unitSlug
    };
  }

  function calculateCost(product, qtyInput, explicitUnit = '', khrRate = 4000) {
    const rate = Number(khrRate) > 0 ? Number(khrRate) : 4000;
    const rawPrice = Number(product?.price ?? product?.estimated_price ?? 0);
    if (!Number.isFinite(rawPrice) || rawPrice <= 0) {
      return {
        hasPrice: false,
        incompatibleUnit: false,
        khr: 0,
        usd: 0,
        unitPriceKhr: 0,
        unitPriceUsd: 0,
        multiplier: 1
      };
    }

    // Catalog prices are in KHR (>= 50); explicit USD prices are < 50
    const unitPriceKhr = rawPrice < 50 ? Math.round(rawPrice * rate) : Math.round(rawPrice);
    const unitPriceUsd = unitPriceKhr / rate;

    const basePriceKey = normalizePriceUnitKey(product?.unit || '1_kg');
    const baseMeta = PRICE_UNIT_META[basePriceKey] || PRICE_UNIT_META['1_kg'];

    const parsed = parseQuantityString(qtyInput, explicitUnit || baseMeta.purchaseUnit);
    const reqUnitSlug = explicitUnit ? normalizeUnitSlug(explicitUnit, parsed.unit) : parsed.unit;
    const reqMeta = getUnitMeta(reqUnitSlug);

    // Check dimension compatibility between catalog price unit and selected purchase unit
    if (reqMeta.family !== baseMeta.family) {
      return {
        hasPrice: false,
        incompatibleUnit: true,
        khr: 0,
        usd: 0,
        unitPriceKhr,
        unitPriceUsd,
        multiplier: 0
      };
    }

    const reqInBase = parsed.qty * reqMeta.toBase;
    let multiplier = reqInBase / baseMeta.baseAmount;
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      multiplier = 1;
    }

    const khr = Math.round(unitPriceKhr * multiplier);
    const usd = Number((khr / rate).toFixed(2));

    return {
      hasPrice: true,
      incompatibleUnit: false,
      khr,
      usd,
      unitPriceKhr,
      unitPriceUsd,
      multiplier
    };
  }

  // --------------------------------------------------------------------------
  // Universal UI Component: FreshMarketQtySelector
  // --------------------------------------------------------------------------
  const FreshMarketQtySelector = {
    /**
     * Mode 1: Customer Quantity & Unit Picker (Shop bottom sheet / Cart)
     */
    renderPicker(containerEl, opts = {}) {
      if (!containerEl) return null;
      const product = opts.product || {};
      const allowedUnits = getAllowedUnits(product);
      const basePriceKey = normalizePriceUnitKey(product.unit || '1_kg');
      const defaultUnit = allowedUnits.includes(PRICE_UNIT_META[basePriceKey]?.purchaseUnit)
        ? PRICE_UNIT_META[basePriceKey].purchaseUnit
        : allowedUnits[0];

      const initial = opts.value
        ? parseQuantityString(opts.value, opts.unit || defaultUnit)
        : {
            qty: Number(opts.qty) > 0 ? Number(opts.qty) : getUnitMeta(opts.unit || defaultUnit).defaultQty,
            unit: normalizeUnitSlug(opts.unit || defaultUnit, defaultUnit)
          };

      // If previously saved cart item uses a unit not in allowedUnits, include it so user sees what was saved
      const activeUnits = allowedUnits.slice();
      if (!activeUnits.includes(initial.unit) && UNIT_BY_ID[initial.unit]) {
        activeUnits.push(initial.unit);
      }

      const state = {
        qty: initial.qty,
        unit: initial.unit
      };

      const emitChange = () => {
        if (typeof opts.onChange === 'function') {
          opts.onChange({
            qty: state.qty,
            unit: state.unit,
            formatted: formatQuantity(state.qty, state.unit)
          });
        }
      };

      const render = () => {
        const meta = getUnitMeta(state.unit);
        const unitLabel = getUnitLabel(meta.id);
        const displayVal = formatNumber(state.qty, meta.decimals);
        const isSingleUnit = activeUnits.length <= 1;
        const unitLabelHeading = translate('product.select_unit_label', 'Единица');

        containerEl.innerHTML = `
          <div class="qty-selector">
            <div class="qty-controls-row">
              <div class="qty-unit-select-wrap">
                <select class="qty-unit-select" aria-label="${safeEscape(unitLabelHeading)}" ${isSingleUnit ? 'disabled' : ''}>
                  ${activeUnits.map((uId) => `
                    <option value="${uId}" ${uId === state.unit ? 'selected' : ''}>
                      ${safeEscape(getUnitLabel(uId))}
                    </option>
                  `).join('')}
                </select>
              </div>

              <div class="qty-stepper-row">
                <button type="button" class="qty-stepper-btn" data-step="dec" aria-label="−">−</button>
                <div class="qty-stepper-input-wrap">
                  <input type="text" inputmode="${meta.decimals > 0 ? 'decimal' : 'numeric'}" class="qty-stepper-input" value="${safeEscape(displayVal)}" aria-label="${safeEscape(unitLabel)}" />
                </div>
                <button type="button" class="qty-stepper-btn" data-step="inc" aria-label="+">+</button>
              </div>
            </div>

            <div class="qty-presets-grid">
              ${meta.presets.map((pVal) => {
                const isActive = Math.abs(state.qty - pVal) < 0.0001;
                return `
                  <button type="button" class="sheet-option-chip qty-preset-chip ${isActive ? 'active' : ''}" data-preset="${pVal}">
                    ${safeEscape(formatNumber(pVal, meta.decimals))} ${safeEscape(unitLabel)}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;

        // Unit dropdown change
        const unitSelect = containerEl.querySelector('.qty-unit-select');
        if (unitSelect) {
          unitSelect.addEventListener('change', () => {
            const nextUnit = unitSelect.value;
            if (!nextUnit || nextUnit === state.unit) return;
            const prevMeta = getUnitMeta(state.unit);
            const nextMeta = getUnitMeta(nextUnit);

            // Smart conversion within same dimension family (kg <-> g, l <-> ml)
            if (prevMeta.family === nextMeta.family && prevMeta.toBase !== nextMeta.toBase) {
              const converted = (state.qty * prevMeta.toBase) / nextMeta.toBase;
              const clamped = Math.min(nextMeta.max, Math.max(nextMeta.min, converted));
              state.qty = roundQty(clamped, nextMeta.decimals);
            } else {
              state.qty = nextMeta.defaultQty;
            }
            state.unit = nextUnit;
            render();
            emitChange();
          });
        }

        // Stepper buttons
        const decBtn = containerEl.querySelector('[data-step="dec"]');
        const incBtn = containerEl.querySelector('[data-step="inc"]');
        const inputEl = containerEl.querySelector('.qty-stepper-input');

        const stepAdjust = (dir) => {
          const m = getUnitMeta(state.unit);
          const delta = (dir < 0 && state.qty <= m.step) || (dir > 0 && state.qty < m.step)
            ? m.smallStep
            : m.step;
          const next = roundQty(state.qty + dir * delta, m.decimals);
          state.qty = Math.min(m.max, Math.max(m.min, next));
          render();
          emitChange();
        };

        if (decBtn) decBtn.addEventListener('click', () => stepAdjust(-1));
        if (incBtn) incBtn.addEventListener('click', () => stepAdjust(1));

        if (inputEl) {
          inputEl.addEventListener('focus', () => {
            try { inputEl.select(); } catch (_) {}
          });
          inputEl.addEventListener('input', () => {
            const cleaned = inputEl.value.replace(',', '.').replace(/[^0-9.]/g, '');
            const parsed = parseFloat(cleaned);
            const m = getUnitMeta(state.unit);
            if (Number.isFinite(parsed) && parsed > 0) {
              state.qty = Math.min(m.max, roundQty(parsed, m.decimals));
              containerEl.querySelectorAll('.qty-preset-chip').forEach((chip) => {
                const pVal = parseFloat(chip.dataset.preset);
                chip.classList.toggle('active', Math.abs(state.qty - pVal) < 0.0001);
              });
              emitChange();
            }
          });
          inputEl.addEventListener('blur', () => {
            const m = getUnitMeta(state.unit);
            if (!Number.isFinite(state.qty) || state.qty < m.min) {
              state.qty = m.min;
            }
            inputEl.value = formatNumber(state.qty, m.decimals);
            emitChange();
          });
        }

        // Preset chips
        containerEl.querySelectorAll('.qty-preset-chip').forEach((chip) => {
          chip.addEventListener('click', () => {
            const pVal = parseFloat(chip.dataset.preset);
            if (!Number.isFinite(pVal) || pVal <= 0) return;
            state.qty = pVal;
            render();
            emitChange();
          });
        });
      };

      render();
      emitChange();

      return {
        getState() {
          return {
            qty: state.qty,
            unit: state.unit,
            formatted: formatQuantity(state.qty, state.unit)
          };
        },
        setState(next = {}) {
          if (next.unit && UNIT_BY_ID[next.unit]) state.unit = next.unit;
          if (Number(next.qty) > 0) state.qty = Number(next.qty);
          render();
          emitChange();
        }
      };
    },

    /**
     * Mode 2: Admin Allowed Units Configurator (Product creation & edit forms)
     */
    renderConfig(containerEl, opts = {}) {
      if (!containerEl) return null;

      const context = {
        unit: opts.baseUnit || '1_kg',
        category: opts.category || '',
        form: opts.form || ''
      };

      let selected = Array.isArray(opts.allowedUnits) && opts.allowedUnits.length > 0
        ? opts.allowedUnits.map((u) => normalizeUnitSlug(u, '')).filter((u) => u && UNIT_BY_ID[u])
        : getDefaultAllowedUnits(context);

      if (selected.length === 0) selected = getDefaultAllowedUnits(context);
      let userCustomized = Array.isArray(opts.allowedUnits) && opts.allowedUnits.length > 0;

      const emit = () => {
        if (typeof opts.onChange === 'function') {
          opts.onChange(selected.slice());
        }
      };

      const render = () => {
        const basePurchaseUnit = PRICE_UNIT_META[normalizePriceUnitKey(context.unit)]?.purchaseUnit || 'kg';
        containerEl.innerHTML = `
          <div class="qty-config-wrap">
            <div class="qty-config-header">
              <span class="qty-config-title">Доступные размерности для покупателя</span>
              <button type="button" class="qty-config-auto-btn" title="Подобрать автоматически по категории и форме">Авто</button>
            </div>
            <div class="qty-allowed-pills">
              ${PURCHASE_UNITS.map((u) => {
                const isSelected = selected.includes(u.id);
                const isBase = u.id === basePurchaseUnit;
                return `
                  <button type="button" class="qty-allowed-pill ${isSelected ? 'active' : ''} ${isBase ? 'is-base' : ''}" data-unit="${u.id}" aria-pressed="${isSelected}">
                    ${safeEscape(u.fallbackLabel)}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;

        containerEl.querySelectorAll('.qty-allowed-pill').forEach((btn) => {
          btn.addEventListener('click', () => {
            const uId = btn.dataset.unit;
            if (!uId) return;
            userCustomized = true;
            if (selected.includes(uId)) {
              if (selected.length <= 1) return; // Always keep at least one unit
              selected = selected.filter((id) => id !== uId);
            } else {
              selected = [...selected, uId];
            }
            render();
            emit();
          });
        });

        const autoBtn = containerEl.querySelector('.qty-config-auto-btn');
        if (autoBtn) {
          autoBtn.addEventListener('click', () => {
            userCustomized = false;
            selected = getDefaultAllowedUnits(context);
            render();
            emit();
          });
        }
      };

      render();
      emit();

      return {
        getAllowedUnits() {
          return selected.slice();
        },
        setAllowedUnits(units, markCustom = true) {
          const cleaned = Array.isArray(units)
            ? units.map((u) => normalizeUnitSlug(u, '')).filter((u) => u && UNIT_BY_ID[u])
            : [];
          selected = cleaned.length > 0 ? Array.from(new Set(cleaned)) : getDefaultAllowedUnits(context);
          userCustomized = markCustom && cleaned.length > 0;
          render();
          emit();
        },
        syncWithContext(nextCtx = {}) {
          if (nextCtx.baseUnit !== undefined) context.unit = nextCtx.baseUnit;
          if (nextCtx.category !== undefined) context.category = nextCtx.category;
          if (nextCtx.form !== undefined) context.form = nextCtx.form;

          const basePurchaseUnit = PRICE_UNIT_META[normalizePriceUnitKey(context.unit)]?.purchaseUnit || 'kg';
          if (!userCustomized || nextCtx.autoReset) {
            selected = getDefaultAllowedUnits(context);
          } else if (!selected.includes(basePurchaseUnit)) {
            selected = [basePurchaseUnit, ...selected];
          }
          render();
          emit();
        }
      };
    }
  };

  const FreshMarketUnits = {
    PURCHASE_UNITS,
    PRICE_UNIT_META,
    normalizePriceUnitKey,
    normalizeUnitSlug,
    getUnitMeta,
    getUnitLabel,
    getDefaultAllowedUnits,
    getAllowedUnits,
    parseQuantityString,
    formatQuantity,
    formatNumber,
    calculateCost
  };

  if (typeof global !== 'undefined') {
    global.FreshMarketUnits = FreshMarketUnits;
    global.FreshMarketQtySelector = FreshMarketQtySelector;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { FreshMarketUnits, FreshMarketQtySelector };
  }
})(typeof window !== 'undefined' ? window : globalThis);
