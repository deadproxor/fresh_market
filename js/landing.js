/**
 * FreshMarket - Landing Page Interactive Controller (landing.js)
 * Architecture: Pure Vanilla JS + Leaflet Map + Ambient Parallax
 */

// 1. Immediate OAuth Auto-Forward: If auth tokens arrive at landing, seamlessly forward to shop
(function () {
  var h = window.location.hash || '';
  var s = window.location.search || '';
  if (h.indexOf('access_token') !== -1 || h.indexOf('error') !== -1 || s.indexOf('code=') !== -1) {
    window.location.replace('shop.html' + s + h);
  }
})();

document.addEventListener('DOMContentLoaded', function () {
  // 1. Interactive Receipt Calculator Logic
  var calcStallProduce = document.getElementById('calcStallProduce');
  var calcBuyerFee = document.getElementById('calcBuyerFee');
  var calcDeliveryFee = document.getElementById('calcDeliveryFee');
  var calcTotal = document.getElementById('calcTotal');
  var calcKhrEquivalent = document.getElementById('calcKhrEquivalent');
  var zoneButtons = document.querySelectorAll('.calc-zone-btn');

  var produceAmount = 18.50;
  var feeRate = 0.10;
  var khrRate = 4000;
  var activeDeliveryFee = 1.00;

  function updateCalculator() {
    var buyerFee = produceAmount * feeRate;
    var total = produceAmount + buyerFee + activeDeliveryFee;
    var totalKhr = Math.round(total * khrRate);

    if (calcStallProduce) calcStallProduce.textContent = '$' + produceAmount.toFixed(2);
    if (calcBuyerFee) calcBuyerFee.textContent = '+$' + buyerFee.toFixed(2);
    if (calcDeliveryFee) calcDeliveryFee.textContent = '+$' + activeDeliveryFee.toFixed(2);
    if (calcTotal) calcTotal.textContent = '$' + total.toFixed(2);
    if (calcKhrEquivalent) calcKhrEquivalent.textContent = '≈ ' + totalKhr.toLocaleString() + ' ៛';
  }

  zoneButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      zoneButtons.forEach(function (b) { b.classList.remove('active'); });
      btn.classList.add('active');
      activeDeliveryFee = parseFloat(btn.dataset.fee) || 1.00;
      updateCalculator();
    });
  });

  // Initial calculation
  updateCalculator();

  // 2. Live Ambient Leaflet Map Controller
  var HUB_COORDS = [10.6120, 104.1780]; // Market Hub location

  // Parallax Configuration: tweak amplitude and viewport progress pivot
  var MAP_PARALLAX_CONFIG = {
    amplitude: 180,       // Total vertical travel distance in pixels
    centerProgress: 0.7   // Viewport scroll pivot (0.0 = bottom entry, 0.5 = middle, 1.0 = top exit)
  };

  var liveMap = null;
  var zoneCircles = {};

  // Dynamic Framer: aligns HUB_COORDS to the exact center of .map-visual-pane (col-7)
  function getFramerCamera(customZoom) {
    var visualPane = document.querySelector('.map-visual-pane');
    var mapEl = document.getElementById('liveLeafletMap');
    var mapWrapper = document.querySelector('.unified-map-wrapper');
    var zoom = (typeof customZoom === 'number') ? customZoom : (window.innerWidth > 1080 ? 13.0 : 11.5);

    if (!visualPane || !mapEl || !liveMap || window.innerWidth <= 1080) {
      return { center: HUB_COORDS, zoom: zoom };
    }

    var vRect = visualPane.getBoundingClientRect();
    var refRect = mapWrapper ? mapWrapper.getBoundingClientRect() : mapEl.getBoundingClientRect();
    var targetContainerX = (vRect.left - refRect.left) + (vRect.width / 2);
    var targetContainerY = (vRect.top - refRect.top) + (vRect.height / 2);

    var containerCenterX = refRect.width / 2;
    var containerCenterY = refRect.height / 2;

    var offsetX = targetContainerX - containerCenterX;
    var offsetY = targetContainerY - containerCenterY;

    var hubWorldPoint = liveMap.project(HUB_COORDS, zoom);
    var targetWorldPoint = L.point(hubWorldPoint.x - offsetX, hubWorldPoint.y - offsetY);
    var targetLatLng = liveMap.unproject(targetWorldPoint, zoom);

    return {
      center: targetLatLng,
      zoom: zoom
    };
  }

  var mapContainer = document.getElementById('liveLeafletMap');
  if (mapContainer && typeof L !== 'undefined') {
    liveMap = L.map('liveLeafletMap', {
      center: HUB_COORDS,
      zoom: 12.3,
      zoomSnap: 0.1,
      zoomDelta: 0.5,
      zoomControl: false,
      attributionControl: true,
      scrollWheelZoom: false,
      touchZoom: false,
      dragging: true,
      doubleClickZoom: false
    });

    // Set initial camera to center hub in col-7
    var initialCam = getFramerCamera();
    liveMap.setView(initialCam.center, initialCam.zoom);

    // OpenStreetMap Tile Layer (Muted Pastel Theme via CSS)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: ['a', 'b', 'c'],
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors'
    }).addTo(liveMap);

    // Concentric delivery zones (1000m, 3000m, 6000m)
    zoneCircles = {
      3: L.circle(HUB_COORDS, {
        radius: 6000,
        color: '#059669',
        dashArray: '6, 6',
        weight: 1.5,
        fillColor: '#059669',
        fillOpacity: 0.03
      }).addTo(liveMap),
      2: L.circle(HUB_COORDS, {
        radius: 3000,
        color: '#059669',
        dashArray: '5, 5',
        weight: 1.5,
        fillColor: '#059669',
        fillOpacity: 0.07
      }).addTo(liveMap),
      1: L.circle(HUB_COORDS, {
        radius: 1000,
        color: '#059669',
        weight: 2,
        fillColor: '#059669',
        fillOpacity: 0.16
      }).addTo(liveMap)
    };

    // Center Market Hub Marker with pulse animation
    var hubIcon = L.divIcon({
      className: 'custom-hub-icon',
      html: '<div class="leaflet-hub-marker"><div class="hub-pulse-ring"></div><div class="hub-center-dot"></div><div class="hub-label-pill">🌱 Market Hub • 5&nbsp;AM</div></div>',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });
    L.marker(HUB_COORDS, { icon: hubIcon }).addTo(liveMap);

    // Click on circles triggers zone highlight
    Object.keys(zoneCircles).forEach(function (z) {
      var circle = zoneCircles[z];
      circle.on('click', function (e) {
        L.DomEvent.stopPropagation(e);
        highlightZone(z);
      });
      circle.on('mouseover', function () { highlightZone(z); });
    });

    // Tactile drag restriction: max 200px from calibrated home center
    var isSpringingBack = false;

    liveMap.on('drag', function () {
      if (isSpringingBack) return;
      var homeCam = getFramerCamera();
      var currentZoom = liveMap.getZoom();
      var currentCenter = liveMap.getCenter();
      var currentPoint = liveMap.project(currentCenter, currentZoom);
      var homePoint = liveMap.project(homeCam.center, currentZoom);

      var dx = currentPoint.x - homePoint.x;
      var dy = currentPoint.y - homePoint.y;
      var MAX_DRAG = 200; // 200px limit in all directions

      var clampedDx = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dx));
      var clampedDy = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, dy));

      if (dx !== clampedDx || dy !== clampedDy) {
        var clampedPoint = L.point(homePoint.x + clampedDx, homePoint.y + clampedDy);
        liveMap.setView(liveMap.unproject(clampedPoint, currentZoom), currentZoom, { animate: false });
      }
    });

    // Elastic spring-back to calibrated center on mouse release
    liveMap.on('dragend', function () {
      isSpringingBack = true;
      var homeCam = getFramerCamera();
      liveMap.panTo(homeCam.center, { duration: 0.55, easeLinearity: 0.25 });
      setTimeout(function () {
        isSpringingBack = false;
      }, 600);
    });

    // Resize handler
    window.addEventListener('resize', function () {
      if (liveMap) {
        liveMap.invalidateSize();
        var cam = getFramerCamera();
        liveMap.setView(cam.center, cam.zoom);
      }
    });

    // IntersectionObserver camera choreography between Bento and Delivery Zones
    var zonesSection = document.getElementById('deliveryZones');
    if ('IntersectionObserver' in window && zonesSection) {
      var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            var cam = getFramerCamera();
            liveMap.flyTo(cam.center, cam.zoom, { duration: 1.0 });
          }
        });
      }, { threshold: 0.25 });
      observer.observe(zonesSection);
    }

    // Smooth GPU Scroll Parallax for Unified Map Underlay
    var mapWrapper = document.querySelector('.unified-map-wrapper');
    var mapUnderlay = document.getElementById('unifiedMapUnderlay');
    var isParallaxTicking = false;

    function updateMapParallax() {
      if (!mapWrapper || !mapUnderlay) return;
      var rect = mapWrapper.getBoundingClientRect();
      var winH = window.innerHeight;

      if (rect.bottom > 0 && rect.top < winH) {
        var progress = (winH - rect.top) / (winH + rect.height);
        var translateY = (progress - MAP_PARALLAX_CONFIG.centerProgress) * MAP_PARALLAX_CONFIG.amplitude;
        mapUnderlay.style.transform = 'translate3d(0, ' + translateY.toFixed(1) + 'px, 0)';
      }
      isParallaxTicking = false;
    }

    window.addEventListener('scroll', function () {
      if (!isParallaxTicking) {
        requestAnimationFrame(updateMapParallax);
        isParallaxTicking = true;
      }
    }, { passive: true });

    // Initial alignment
    updateMapParallax();
  }

  var zoneRows = document.querySelectorAll('.zone-interactive-row');

  function highlightZone(zoneId) {
    if (window.innerWidth <= 1080) {
      return;
    }

    var id = parseInt(zoneId, 10);

    zoneRows.forEach(function (row) {
      var isTarget = parseInt(row.dataset.zone, 10) === id;
      row.classList.toggle('active', isTarget);
      row.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    if (liveMap && zoneCircles) {
      Object.keys(zoneCircles).forEach(function (z) {
        var isTarget = parseInt(z, 10) === id;
        var circle = zoneCircles[z];
        if (z === '1') {
          circle.setStyle({
            fillOpacity: isTarget ? 0.24 : 0.08,
            weight: isTarget ? 2.5 : 1.5,
            dashArray: isTarget ? null : '4, 4'
          });
        } else if (z === '2') {
          circle.setStyle({
            fillOpacity: isTarget ? 0.18 : 0.05,
            weight: isTarget ? 2.5 : 1.5,
            dashArray: isTarget ? null : '5, 5'
          });
        } else if (z === '3') {
          circle.setStyle({
            fillOpacity: isTarget ? 0.14 : 0.02,
            weight: isTarget ? 2.5 : 1.5,
            dashArray: isTarget ? null : '6, 6'
          });
        }
      });
    }
  }

  zoneRows.forEach(function (row) {
    var zoneId = row.dataset.zone;
    row.addEventListener('click', function () { highlightZone(zoneId); });
    row.addEventListener('mouseenter', function () { highlightZone(zoneId); });
    row.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        highlightZone(zoneId);
      }
    });
  });

  // 3. Customer Auth check for logout button
  try {
    var rawAuth = localStorage.getItem('freshmarket_customer_auth');
    var btnLogout = document.getElementById('btnLandingLogout');
    if (rawAuth && btnLogout) {
      var parsed = JSON.parse(rawAuth);
      if (parsed && (parsed.access_token || parsed.user)) {
        btnLogout.style.display = 'inline-flex';
        btnLogout.addEventListener('click', function () {
          localStorage.removeItem('freshmarket_customer_auth');
          btnLogout.style.display = 'none';
          window.location.reload();
        });
      }
    }
  } catch (err) { }
});
