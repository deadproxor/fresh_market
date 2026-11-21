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
 * Delivery Zones Definition (3 zones)
 */
const DELIVERY_ZONES = {
  zone_1: {
    id: 'zone_1',
    name: 'Зона 1: Центр (до 1 км)',
    desc: 'Центральные районы в радиусе до 1 км',
    fee: 1.00
  },
  zone_2: {
    id: 'zone_2',
    name: 'Зона 2: Средние районы (1–3 км)',
    desc: 'Районы города на удалении 1–3 км',
    fee: 2.00
  },
  zone_3: {
    id: 'zone_3',
    name: 'Зона 3: Дальние районы (3–6 км)',
    desc: 'Удалённые районы и окраины 3–6 км',
    fee: 3.50
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

const MARKET_COORDS = { lat: 10.6120, lng: 104.1780 };

/**
 * Calculate distance in km between two geo points (Haversine formula)
 */
function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round((R * c) * 100) / 100;
}

/**
 * Determine delivery zone & fee by distance in km
 */
function getDeliveryZoneByDistance(distanceKm) {
  const dist = Number(distanceKm) || 0;
  let zoneId = 'zone_1';
  let fee = 1.00;
  let isOutside = false;
  let isOutsideCity = false;
  let isBlocked = false;
  let zoneKey = 'zone_1_name';
  let defaultName = 'Зона 1: Центр';

  if (dist <= 1.0) {
    zoneId = 'zone_1';
    fee = 1.00;
    zoneKey = 'zone_1_name';
    defaultName = 'Зона 1: Центр';
  } else if (dist <= 3.0) {
    zoneId = 'zone_2';
    fee = 2.00;
    zoneKey = 'zone_2_name';
    defaultName = 'Зона 2: Средние районы';
  } else if (dist <= 6.0) {
    zoneId = 'zone_3';
    fee = 3.50;
    zoneKey = 'zone_3_name';
    defaultName = 'Зона 3: Дальние районы';
  } else if (dist <= 10.0) {
    zoneId = 'zone_outside';
    fee = 3.50;
    isOutsideCity = true;
    zoneKey = 'zone_outside_name';
    defaultName = 'Вне стандартной зоны (согласование)';
  } else {
    zoneId = 'zone_outside';
    fee = 0.00;
    isOutside = true;
    isOutsideCity = true;
    isBlocked = true;
    zoneKey = 'zone_blocked_name';
    defaultName = 'Вне зоны доставки (> 10 км)';
  }

  const name = (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function')
    ? window.i18n.t(`cart.${zoneKey}`)
    : defaultName;

  return { zoneId, fee, distanceKm: dist, isOutside, isOutsideCity, isBlocked, zoneKey, name };
}

/**
 * Try to extract coordinates { lat, lng } from address text or maps URL
 */
function extractCoordsFromText(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/(?:q=|ll=|@|^|\s)(-?\d+\.\d{3,})\s*,\s*(-?\d+\.\d{3,})/);
  if (match) {
    const lat = parseFloat(match[1]);
    const lng = parseFloat(match[2]);
    if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
      return { lat, lng };
    }
  }
  return null;
}

/**
 * Calculate driving route & road distance between two points via OSRM
 * Fallback to Haversine * 1.25 if network is unavailable
 */
async function calculateRoadDistanceAndRoute(lat1, lon1, lat2, lon2) {
  const pLat1 = parseFloat(lat1);
  const pLon1 = parseFloat(lon1);
  const pLat2 = parseFloat(lat2);
  const pLon2 = parseFloat(lon2);

  const directKm = calculateDistanceKm(pLat1, pLon1, pLat2, pLon2);
  const fallbackKm = Math.round(directKm * 1.25 * 100) / 100;
  const fallbackDurationMin = Math.max(1, Math.round(fallbackKm * 2.5));

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);

    const url = `https://router.project-osrm.org/route/v1/driving/${pLon1},${pLat1};${pLon2},${pLat2}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      if (data && data.code === 'Ok' && data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const roadDistanceKm = Math.round((route.distance / 1000.0) * 100) / 100;
        const durationMin = Math.max(1, Math.round(route.duration / 60.0));
        const latLngs = (route.geometry?.coordinates || []).map(coord => [coord[1], coord[0]]);
        return {
          roadDistanceKm,
          durationMin,
          coordinates: latLngs,
          isActualRoad: true
        };
      }
    }
  } catch (e) {
    console.warn('OSRM routing fallback used:', e);
  }

  return {
    roadDistanceKm: fallbackKm,
    durationMin: fallbackDurationMin,
    coordinates: [[pLat1, pLon1], [pLat2, pLon2]],
    isActualRoad: false
  };
}

/**
 * Reverse geocode coordinates via OpenStreetMap Nominatim
 * Returns a short readable place / street name or null
 */
async function reverseGeocodeCoords(lat, lng) {
  try {
    const parsedLat = parseFloat(lat);
    const parsedLng = parseFloat(lng);
    if (isNaN(parsedLat) || isNaN(parsedLng)) return null;

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${parsedLat}&lon=${parsedLng}&accept-language=en,ru`;
    const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data) return null;

    const a = data.address || {};
    const primary = a.hotel || a.tourism || a.building || a.amenity || a.shop || a.leisure || '';
    const street = a.road || a.street || a.pedestrian || a.residential || '';
    const area = a.suburb || a.neighbourhood || a.city_district || a.quarter || '';

    const parts = [primary, street, area].filter(Boolean);
    if (parts.length > 0) {
      return parts.slice(0, 2).join(', ');
    }

    if (data.display_name) {
      return data.display_name.split(',').slice(0, 2).join(', ').trim();
    }
    return null;
  } catch (e) {
    console.warn('Reverse geocoding error:', e);
    return null;
  }
}

/**
 * Unified Grouped Toast Notification Controller
 * Groups incoming notifications into a single card with duplicate counters,
 * severity priority, pause-on-read, and extended auto-dismiss timeouts
 * (20s for info/success, 60s for error/warning).
 */
const FreshMarketToast = (() => {
  const DEFAULT_DURATION_MS = 20000;
  const ERROR_DURATION_MS = 60000;
  const MIN_RESUME_MS = 3000;
  const MAX_ROWS = 12;
  const SEVERITY_RANK = { info: 1, success: 2, warning: 3, error: 4 };

  function detectType(cleanMsg, type) {
    if (type && type !== 'auto') return type;
    if (/^⚠️|^❌|ошибка|не удалось|пуста|заполните|error|failed|помилка|erreur/i.test(cleanMsg)) {
      return 'error';
    }
    if (/^✅|^🎉|успешно|оформлен|сохранен|добавлен|обновлен|добро пожаловать|welcome|bienvenue|ласкаво/i.test(cleanMsg)) {
      return 'success';
    }
    return 'info';
  }

  function extractIconAndMessage(rawMsg, toastType) {
    let cleanMsg = String(rawMsg || '').trim();
    let icon = '';
    const emojiMatch = cleanMsg.match(
      /^([\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|\p{Emoji_Presentation}|\p{Extended_Pictographic})/u
    );
    if (emojiMatch) {
      icon = emojiMatch[0];
      cleanMsg = cleanMsg.slice(icon.length).trim();
    } else if (toastType === 'success') {
      icon = '✅';
    } else if (toastType === 'error' || toastType === 'warning') {
      icon = '⚠️';
    } else {
      icon = 'ℹ️';
    }
    return { icon, cleanMsg };
  }

  function getHighestSeverity(toastEl) {
    const rows = toastEl.querySelectorAll('.toast-message-row');
    let best = 'info';
    let bestRank = 0;
    rows.forEach((row) => {
      const t = row.dataset.toastType || 'info';
      const rank = SEVERITY_RANK[t] || 1;
      if (rank > bestRank) {
        bestRank = rank;
        best = t;
      }
    });
    return best;
  }

  function applySeverityClass(toastEl, severity) {
    toastEl.classList.remove('toast-info', 'toast-success', 'toast-warning', 'toast-error');
    toastEl.classList.add(`toast-${severity}`);
  }

  function scheduleDismiss(toastEl, durationMs) {
    if (!toastEl || toastEl.classList.contains('toast-hiding')) return;
    if (toastEl._toastTimer) {
      clearTimeout(toastEl._toastTimer);
      toastEl._toastTimer = null;
    }
    toastEl._remainingMs = durationMs;
    if (toastEl._isPaused) {
      return;
    }
    toastEl._startedAt = Date.now();
    toastEl._toastTimer = setTimeout(() => {
      dismiss(toastEl);
    }, durationMs);
  }

  function pauseDismiss(toastEl) {
    if (!toastEl || toastEl._isPaused || toastEl.classList.contains('toast-hiding')) return;
    toastEl._isPaused = true;
    if (toastEl._toastTimer) {
      clearTimeout(toastEl._toastTimer);
      toastEl._toastTimer = null;
      const elapsed = Date.now() - (toastEl._startedAt || Date.now());
      toastEl._remainingMs = Math.max(MIN_RESUME_MS, (toastEl._remainingMs || DEFAULT_DURATION_MS) - elapsed);
    }
  }

  function resumeDismiss(toastEl) {
    if (!toastEl || !toastEl._isPaused || toastEl.classList.contains('toast-hiding')) return;
    toastEl._isPaused = false;
    const nextMs = Math.max(MIN_RESUME_MS, toastEl._remainingMs || DEFAULT_DURATION_MS);
    scheduleDismiss(toastEl, nextMs);
  }

  function dismiss(toastEl) {
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
    }, 250);
  }

  function createGroupToast(container, closeTitle) {
    const toastEl = document.createElement('div');
    toastEl.className = 'toast-item toast-grouped toast-info';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl._isPaused = false;
    toastEl._remainingMs = DEFAULT_DURATION_MS;

    toastEl.innerHTML = `
      <div class="toast-messages-list"></div>
      <button type="button" class="toast-close-btn" title="${escapeHtml(closeTitle)}" aria-label="${escapeHtml(closeTitle)}">✕</button>
    `;

    const closeBtn = toastEl.querySelector('.toast-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dismiss(toastEl);
      });
    }

    toastEl.addEventListener('mouseenter', () => pauseDismiss(toastEl));
    toastEl.addEventListener('mouseleave', () => resumeDismiss(toastEl));
    toastEl.addEventListener('touchstart', () => pauseDismiss(toastEl), { passive: true });
    toastEl.addEventListener('touchend', () => resumeDismiss(toastEl), { passive: true });
    toastEl.addEventListener('touchcancel', () => resumeDismiss(toastEl), { passive: true });

    container.appendChild(toastEl);
    return toastEl;
  }

  function show(msg, type = 'auto', duration = null, options = {}) {
    if (typeof document === 'undefined') return null;
    const container = options.container || document.getElementById('toastContainer');
    if (!container) return null;

    const rawText = String(msg || '').trim();
    if (!rawText) return null;

    const toastType = detectType(rawText, type);
    const { icon, cleanMsg } = extractIconAndMessage(rawText, toastType);
    const closeTitle =
      options.closeTitle ||
      (typeof window !== 'undefined' && window.i18n && window.i18n.isReady
        ? window.i18n.t('common.close')
        : 'Закрыть');

    let toastEl = container.querySelector('.toast-item.toast-grouped:not(.toast-hiding)');
    if (!toastEl) {
      toastEl = createGroupToast(container, closeTitle);
    }

    const listEl = toastEl.querySelector('.toast-messages-list');
    if (!listEl) return toastEl;

    const rowKey = `${toastType}::${cleanMsg}`;
    const existingRows = Array.from(listEl.querySelectorAll('.toast-message-row'));
    const duplicateRow = existingRows.find((r) => r.dataset.toastKey === rowKey);

    if (duplicateRow) {
      const nextCount = (parseInt(duplicateRow.dataset.toastCount || '1', 10) || 1) + 1;
      duplicateRow.dataset.toastCount = String(nextCount);
      let badge = duplicateRow.querySelector('.toast-dup-badge');
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'toast-dup-badge';
        duplicateRow.appendChild(badge);
      }
      badge.textContent = `×${nextCount}`;
      // Move duplicate to bottom so latest occurrence is immediately visible
      listEl.appendChild(duplicateRow);
    } else {
      if (existingRows.length >= MAX_ROWS) {
        existingRows[0].remove();
      }
      const rowEl = document.createElement('div');
      rowEl.className = `toast-message-row toast-row-${toastType}`;
      rowEl.dataset.toastKey = rowKey;
      rowEl.dataset.toastType = toastType;
      rowEl.dataset.toastCount = '1';
      rowEl.innerHTML = `
        <span class="toast-icon">${escapeHtml(icon)}</span>
        <span class="toast-text">${escapeHtml(cleanMsg)}</span>
      `;
      listEl.appendChild(rowEl);
    }

    // Update overall group severity (error > warning > success > info)
    const highestSeverity = getHighestSeverity(toastEl);
    applySeverityClass(toastEl, highestSeverity);

    // Compute extended timeout (never shorter than group's severity minimum)
    const severityBaseMs =
      highestSeverity === 'error' || highestSeverity === 'warning'
        ? ERROR_DURATION_MS
        : DEFAULT_DURATION_MS;
    const requestedMs = Number(duration) || 0;
    const effectiveDuration = Math.max(severityBaseMs, requestedMs);

    scheduleDismiss(toastEl, effectiveDuration);

    // Keep newest entry scrolled into view
    listEl.scrollTop = listEl.scrollHeight;
    return toastEl;
  }

  return {
    DEFAULT_DURATION_MS,
    ERROR_DURATION_MS,
    show,
    dismiss
  };
})();

if (typeof window !== 'undefined') {
  window.FreshMarketConfig = Object.freeze({
    SUPABASE_URL: 'https://qifazsptdgcskrchfocc.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_N0kYhX05rgDeXuh9B6DgNg_Fese__Pg'
  });
  window.DEFAULT_SUPABASE_URL = window.FreshMarketConfig.SUPABASE_URL;
  window.DEFAULT_SUPABASE_KEY = window.FreshMarketConfig.SUPABASE_ANON_KEY;
  window.FreshMarketToast = FreshMarketToast;
  window.sanitizeUrl = sanitizeUrl;
  window.escapeHtml = escapeHtml;
  window.generateUUID = generateUUID;
  window.DELIVERY_ZONES = DELIVERY_ZONES;
  window.calculateOrderTotals = calculateOrderTotals;
  window.MARKET_COORDS = MARKET_COORDS;
  window.calculateDistanceKm = calculateDistanceKm;
  window.getDeliveryZoneByDistance = getDeliveryZoneByDistance;
  window.extractCoordsFromText = extractCoordsFromText;
  window.reverseGeocodeCoords = reverseGeocodeCoords;
  window.calculateRoadDistanceAndRoute = calculateRoadDistanceAndRoute;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    FreshMarketToast,
    sanitizeUrl,
    escapeHtml,
    generateUUID,
    DELIVERY_ZONES,
    calculateOrderTotals,
    MARKET_COORDS,
    calculateDistanceKm,
    getDeliveryZoneByDistance,
    extractCoordsFromText,
    reverseGeocodeCoords,
    calculateRoadDistanceAndRoute
  };
}
