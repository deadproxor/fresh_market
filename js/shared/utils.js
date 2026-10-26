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
  } else {
    zoneId = 'zone_3';
    fee = 3.50;
    isOutside = true;
    zoneKey = 'zone_outside_name';
    defaultName = 'Вне стандартной зоны';
  }

  const name = (typeof window !== 'undefined' && window.i18n && typeof window.i18n.t === 'function')
    ? window.i18n.t(`cart.${zoneKey}`)
    : defaultName;

  return { zoneId, fee, distanceKm: dist, isOutside, zoneKey, name };
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

if (typeof window !== 'undefined') {
  window.FreshMarketConfig = Object.freeze({
    SUPABASE_URL: 'https://qifazsptdgcskrchfocc.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_N0kYhX05rgDeXuh9B6DgNg_Fese__Pg'
  });
  window.DEFAULT_SUPABASE_URL = window.FreshMarketConfig.SUPABASE_URL;
  window.DEFAULT_SUPABASE_KEY = window.FreshMarketConfig.SUPABASE_ANON_KEY;
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
