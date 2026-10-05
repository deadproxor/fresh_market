/**
 * FreshMarket — Shared Utility Functions & Helpers (utils.js)
 * Architecture: Pure Vanilla JS / Zero Dependencies
 */

/**
 * Sanitize URLs for <img> and <a> tags to prevent XSS (javascript: etc.)
 */
function sanitizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const clean = url.trim();
  if (/^(https?:\/\/|\/|\.\/|\.\.\/|data:image\/)/i.test(clean)) {
    return clean.replace(/"/g, '&quot;');
  }
  return '';
}

/**
 * Escape HTML special characters for safe innerHTML injection
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Cryptographically safe UUID v4 generator
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    try {
      return crypto.randomUUID();
    } catch (_) {}
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Kampot Delivery Zones Definition
 */
const DELIVERY_ZONES = {
  zone_1: {
    id: 'zone_1',
    name: 'Зона 1: Центр и Набережная',
    desc: 'Центр Кампота, Старый рынок, Набережная реки',
    fee: 1.00
  },
  zone_2: {
    id: 'zone_2',
    name: 'Зона 2: Остров и Пригород',
    desc: 'Рыбный остров (Fish Island), Ближний пригород',
    fee: 2.00
  },
  zone_3: {
    id: 'zone_3',
    name: 'Зона 3: Дальние виллы и курорты',
    desc: 'River Road (вверх по реке), Соляные поля, отдаленные виллы',
    fee: 3.00
  }
};

/**
 * Calculate order grand total based on market concierge model
 * Grand Total = Market Total + Service Fee (10%) + Delivery Fee
 */
function calculateOrderTotals(actualMarketTotal = 0, deliveryZoneId = 'zone_1', servicePercent = 10.0) {
  const market = Number(actualMarketTotal) || 0;
  const zone = DELIVERY_ZONES[deliveryZoneId] || DELIVERY_ZONES.zone_1;
  const serviceFee = Math.round(market * (servicePercent / 100.0) * 100) / 100;
  const deliveryFee = zone.fee;
  const grandTotal = Math.round((market + serviceFee + deliveryFee) * 100) / 100;

  return {
    actualMarketTotal: market,
    servicePercent,
    serviceFee,
    deliveryFee,
    grandTotal
  };
}

if (typeof window !== 'undefined') {
  window.sanitizeUrl = sanitizeUrl;
  window.escapeHtml = escapeHtml;
  window.generateUUID = generateUUID;
  window.DELIVERY_ZONES = DELIVERY_ZONES;
  window.calculateOrderTotals = calculateOrderTotals;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    sanitizeUrl,
    escapeHtml,
    generateUUID,
    DELIVERY_ZONES,
    calculateOrderTotals
  };
}
