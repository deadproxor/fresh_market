// Ensure clean PWA boundary: unregister any rogue root shop Service Worker that hijacked /admin/
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    for (var i = 0; i < regs.length; i++) {
      var r = regs[i];
      if (r.active && r.active.scriptURL.includes('sw-shop.js')) {
        r.unregister().then(function () {
          console.log('[Admin] Cleaned conflicting shop Service Worker registration');
        });
      }
    }
  });
}



class AdminAuth {
  constructor() {
    this.sb = null;
    this.currentUser = null;

    // DOM Elements
    this.loginGate = document.getElementById('loginGate');
    this.adminMainApp = document.getElementById('adminMainApp');
    this.loginForm = document.getElementById('loginForm');
    this.loginEmail = document.getElementById('loginEmail');
    this.loginPassword = document.getElementById('loginPassword');
    this.loginErrorBox = document.getElementById('loginErrorBox');
    this.btnLogin = document.getElementById('btnLogin');
    this.btnLogout = document.getElementById('btnLogout');
    this.adminUserEmail = document.getElementById('adminUserEmail');
    this.adminOrdersBadge = document.getElementById('adminOrdersBadge');

    // Realtime Orders & Notifications
    this.realtimeOrdersChannel = null;
    this.audioContext = null;
    this.unreadOrdersCount = 0;
    this.currentAdminOrdersTab = 'current';
    this.cachedAdminOrders = [];

    // Section Tabs
    this.navTabs = document.querySelectorAll('.admin-nav-tab');
    this.sectionViews = document.querySelectorAll('.admin-section-view');

    this.initSupabase();
    this.initAudioUnlock();
    this.initEvents();
    this.checkSession();
  }

  initSupabase() {
    const sbUrl = localStorage.getItem('freshmarket_supabase_url') || window.FreshMarketConfig?.SUPABASE_URL || '';
    const sbKey = localStorage.getItem('freshmarket_supabase_key') || window.FreshMarketConfig?.SUPABASE_ANON_KEY || '';
    if (sbUrl && sbKey && window.supabase) {
      try {
        this.sb = window.supabase.createClient(sbUrl, sbKey, {
          auth: {
            storageKey: 'freshmarket_admin_auth',
            storage: window.sessionStorage,
            persistSession: true,
            autoRefreshToken: true
          }
        });
        window.supabaseClient = this.sb;
      } catch (err) {
        console.error('[AdminAuth] Supabase init error:', err);
      }
    }
  }

  isAdminUser(user) {
    if (!user) return false;
    // Строгая проверка серверной роли (app_metadata защищена Supabase и не может быть изменена клиентом)
    const role = user.app_metadata?.role;
    return role === 'admin' || role === 'buyer';
  }

  initEvents() {
    // Login Form Submit
    if (this.loginForm) {
      this.loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.handleLogin();
      });
    }

    // Logout button
    if (this.btnLogout) {
      this.btnLogout.addEventListener('click', () => {
        this.handleLogout();
      });
    }

    // Nav tabs switching
    this.navTabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.adminTab;
        this.switchSection(target);
      });
    });

    // Orders segmented tabs switching (Current / Upcoming / Archive)
    const ordersTabsContainer = document.getElementById('adminOrdersSegmentedTabs');
    if (ordersTabsContainer) {
      ordersTabsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-orders-tab]');
        if (!btn) return;
        const tab = btn.dataset.ordersTab;
        if (tab && tab !== this.currentAdminOrdersTab) {
          this.currentAdminOrdersTab = tab;
          this.renderAdminOrders();
        }
      });
    }

    // Supabase Auth State Change Listener
    if (this.sb) {
      this.sb.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          if (this.isAdminUser(session.user)) {
            this.onSignedIn(session.user);
          } else {
            await this.sb.auth.signOut();
            this.onSignedOut();
            this.showError('Доступ запрещен: учетная запись не имеет прав администратора');
          }
        } else if (event === 'SIGNED_OUT') {
          this.onSignedOut();
        }
      });
    }
  }

  async checkSession() {
    if (!this.sb) {
      this.showLoginGate();
      return;
    }

    try {
      const { data: { session }, error } = await this.sb.auth.getSession();
      if (session && session.user && !error) {
        if (this.isAdminUser(session.user)) {
          this.onSignedIn(session.user);
        } else {
          console.warn('[AdminAuth] User does not have admin privileges:', session.user.email);
          await this.sb.auth.signOut();
          this.onSignedOut();
          this.showError('Доступ запрещен: учетная запись не имеет прав администратора');
        }
      } else {
        this.onSignedOut();
      }
    } catch (err) {
      console.warn('[AdminAuth] Session check failed:', err);
      this.onSignedOut();
    }
  }

  async handleLogin() {
    const email = this.loginEmail?.value.trim();
    const password = this.loginPassword?.value;

    if (!email || !password) {
      this.showError('Пожалуйста, введите Email и пароль администратора');
      return;
    }

    if (!this.sb) {
      this.showError('Supabase клиент не инициализирован. Проверьте настройки сети.');
      return;
    }

    this.setLoading(true);
    this.hideError();

    try {
      const { data, error } = await this.sb.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        throw error;
      }

      if (data && data.user) {
        if (!this.isAdminUser(data.user)) {
          await this.sb.auth.signOut();
          this.showError('Доступ запрещен: учетная запись не имеет прав администратора или закупщика');
          return;
        }
        this.onSignedIn(data.user);
      }
    } catch (err) {
      console.error('[AdminAuth] Login failed:', err);
      this.showError(err.message || 'Неверный логин или пароль администратора');
    } finally {
      this.setLoading(false);
    }
  }

  async handleLogout() {
    if (this.sb) {
      try {
        await this.sb.auth.signOut();
      } catch (err) {
        console.warn('[AdminAuth] SignOut error:', err);
      }
    }
    this.onSignedOut();
  }

  onSignedIn(user) {
    const isAlreadySignedIn = Boolean(
      this._signedInInitialized &&
      this.currentUser &&
      user &&
      String(this.currentUser.id) === String(user.id)
    );

    this.currentUser = user;
    window.adminUser = user;

    if (this.adminUserEmail) {
      this.adminUserEmail.textContent = user.email || 'Администратор';
    }

    this.hideLoginGate();

    if (isAlreadySignedIn) {
      return;
    }
    this._signedInInitialized = true;

    // Initialize or refresh catalog app
    if (window.app && typeof window.app.init === 'function') {
      window.app.init();
    } else if (window.initAdminCatalog) {
      window.initAdminCatalog();
    }

    // Initialize Realtime Orders Subscription & sync initial count
    this.setupRealtimeOrdersSync();
    this.syncInitialPendingOrdersCount();
  }

  onSignedOut() {
    this._signedInInitialized = false;
    this.teardownRealtimeOrdersSync();
    this.clearOrdersBadge();
    this.currentUser = null;
    window.adminUser = null;
    this.showLoginGate();
  }

  showLoginGate() {
    if (this.loginGate) this.loginGate.classList.add('active');
    if (this.adminMainApp) {
      this.adminMainApp.classList.add('is-hidden');
      this.adminMainApp.style.display = '';
    }
  }

  hideLoginGate() {
    if (this.loginGate) this.loginGate.classList.remove('active');
    if (this.adminMainApp) {
      this.adminMainApp.classList.remove('is-hidden');
      this.adminMainApp.style.display = '';
    }
  }

  showError(msg) {
    if (this.loginErrorBox) {
      this.loginErrorBox.textContent = msg;
      this.loginErrorBox.classList.add('active');
    }
  }

  hideError() {
    if (this.loginErrorBox) {
      this.loginErrorBox.classList.remove('active');
      this.loginErrorBox.textContent = '';
    }
  }

  setLoading(isLoading) {
    if (this.btnLogin) {
      this.btnLogin.disabled = isLoading;
      this.btnLogin.textContent = isLoading ? 'Вход в систему...' : 'Войти в панель';
    }
  }

  switchSection(sectionId) {
    if (window.app && typeof window.app.switchMainView === 'function') {
      const targetView = (sectionId === 'orders' || sectionId === 'viewOrders')
        ? 'viewOrders'
        : (sectionId === 'settings' || sectionId === 'viewSettings' ? 'viewSettings' : 'viewCatalog');
      window.app.switchMainView(targetView);
      return;
    }

    if (this.navTabs) {
      this.navTabs.forEach((tab) => {
        tab.classList.toggle('active', tab.dataset.adminTab === sectionId);
      });
    }

    if (this.sectionViews) {
      this.sectionViews.forEach((view) => {
        const isTarget = view.id === `section-${sectionId}` || view.id === `view${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}`;
        view.classList.toggle('active', isTarget);
        view.style.display = isTarget ? 'flex' : 'none';
      });
    }

    // Special handlers when switching tabs
    if (sectionId === 'orders') {
      this.loadAdminOrders();
    }
  }

  getMarketLocalTime() {
    // UTC+7 (Asia/Phnom_Penh)
    const now = new Date();
    const utcMs = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utcMs + (7 * 3600000));
  }

  isNightDeferredOrder(order, nowMs = Date.now()) {
    const rawStatus = String(order?.status || 'pending').trim().toLowerCase();
    const isNewStatus = rawStatus === 'pending' || rawStatus === 'new';
    if (!isNewStatus) return false;
    if (!order?.created_at) return false;

    const createdMs = Date.parse(order.created_at);
    if (!Number.isFinite(createdMs)) return false;

    // Convert created_at to market local time (UTC+7)
    const tzOffsetMs = 7 * 3600000;
    const createdMkt = new Date(createdMs + tzOffsetMs);
    const createdHour = createdMkt.getUTCHours();

    // Only new orders created in the night window (23:00 - 04:59 UTC+7) enter "upcoming"
    const isCreatedInNightWindow = createdHour >= 23 || createdHour < 5;
    if (!isCreatedInNightWindow) return false;

    // Nearest 05:00 AM (UTC+7) after creation time
    const unlockMkt = new Date(createdMs + tzOffsetMs);
    if (createdHour >= 23) {
      unlockMkt.setUTCDate(unlockMkt.getUTCDate() + 1);
    }
    unlockMkt.setUTCHours(5, 0, 0, 0);

    const nowMktMs = nowMs + tzOffsetMs;
    return nowMktMs < unlockMkt.getTime();
  }

  getOrderTabBucket(order, nowMs = Date.now()) {
    const rawStatus = String(order?.status || 'pending').trim().toLowerCase();
    const isTerminal = rawStatus === 'completed' || rawStatus === 'cancelled' || rawStatus === 'rejected';
    if (isTerminal) return 'archive';
    if (this.isNightDeferredOrder(order, nowMs)) return 'upcoming';
    return 'current';
  }

  ensureMorningRolloverTimer() {
    if (this._morningRolloverTimer) return;
    this._lastUpcomingCount = null;
    this._morningRolloverTimer = setInterval(() => {
      if (!Array.isArray(this.cachedAdminOrders) || this.cachedAdminOrders.length === 0) return;
      const nowMs = Date.now();
      const upcomingCount = this.cachedAdminOrders.filter((o) => this.getOrderTabBucket(o, nowMs) === 'upcoming').length;
      if (this._lastUpcomingCount !== null && upcomingCount !== this._lastUpcomingCount) {
        this._lastUpcomingCount = upcomingCount;
        this.renderAdminOrders();
      } else {
        this._lastUpcomingCount = upcomingCount;
      }
    }, 30000);
  }

  async loadAdminOrders(isSilent = false) {
    const listEl = document.getElementById('adminOrdersList');
    if (!listEl) return;

    this.clearOrdersBadge();

    if (!this.sb) {
      listEl.innerHTML = '<div class="empty-desc">База данных не подключена</div>';
      return;
    }

    if (!isSilent && (!this.cachedAdminOrders || this.cachedAdminOrders.length === 0)) {
      listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Загрузка заявок...</div>';
    }

    try {
      const { data, error } = await this.sb
        .from('orders')
        .select('*, order_items(*, products(id, name_ru, name_en, name_kh, img_url, category, form, price, unit))')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        listEl.innerHTML = `<div class="empty-desc">Ошибка загрузки: ${error.message}</div>`;
        return;
      }

      this.cachedAdminOrders = data || [];
      this.ensureMorningRolloverTimer();
      this.renderAdminOrders();
    } catch (err) {
      console.warn('[AdminAuth] Orders load error:', err);
      listEl.innerHTML = `<div class="empty-desc">Не удалось загрузить заказы</div>`;
    }
  }

  renderAdminOrders() {
    const listEl = document.getElementById('adminOrdersList');
    if (!listEl) return;

    try {
      const activeTab = this.currentAdminOrdersTab || 'current';
      document.querySelectorAll('#adminOrdersSegmentedTabs [data-orders-tab]').forEach((btn) => {
        const isActive = btn.dataset.ordersTab === activeTab;
        btn.classList.toggle('active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });

      const nowMs = Date.now();
      const orders = this.cachedAdminOrders || [];
      this._lastUpcomingCount = orders.filter((o) => this.getOrderTabBucket(o, nowMs) === 'upcoming').length;

      const filteredOrders = orders.filter((order) => {
        return this.getOrderTabBucket(order, nowMs) === activeTab;
      });

      if (filteredOrders.length === 0) {
        let emptyTitle, emptyDesc;
        if (activeTab === 'current') {
          emptyTitle = 'Нет активных заявок';
          emptyDesc = 'Текущие заказы в работе и заявки на ближайший закуп отображаются здесь.';
        } else if (activeTab === 'upcoming') {
          emptyTitle = 'Нет ночных предзаказов';
          emptyDesc = 'Новые заказы, оформленные после 23:00, отображаются здесь до 05:00 утра.';
        } else {
          emptyTitle = 'Архив заявок пуст';
          emptyDesc = 'Здесь сохраняется история доставленных и отмененных заказов.';
        }
        listEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <div class="empty-title">${this.escapeHtml(emptyTitle)}</div>
            <div class="empty-desc">${this.escapeHtml(emptyDesc)}</div>
          </div>
        `;
        return;
      }

      listEl.innerHTML = filteredOrders.map(order => {
        const safeNum = this.escapeHtml(order.order_number || 'RP-ЗАКАЗ');
        const rawStatus = order.status || 'pending';
        const safeStatus = this.escapeHtml(rawStatus);
        const statusLabel = this.escapeHtml(this.formatStatus(rawStatus));
        const safeName = this.escapeHtml(order.customer_name || 'Клиент');
        const safePhone = this.escapeHtml(order.customer_phone || 'нет тел.');
        const safeMessenger = order.customer_messenger ? ` • 💬 ${this.escapeHtml(order.customer_messenger)}` : '';
        const safeZone = this.escapeHtml(this.formatZone(order.delivery_zone));
        const feeNum = Number(order.delivery_fee || 1).toFixed(2);
        const safeAddress = this.escapeHtml(order.delivery_address || '—');
        const notes = order.customer_notes || order.customer_comment || '';
        const safeNotes = notes ? `<div>💬 Комментарий: <i>${this.escapeHtml(notes)}</i></div>` : '';
        const safePolicy = this.escapeHtml(this.formatReplacementPolicy(order.replacement_policy || order.replace_rule));
        const deliveryDateStr = order.target_delivery_date ? ` • 📅 ${this.escapeHtml(order.target_delivery_date)}` : '';
        const createdTimeStr = order.created_at ? new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

        const items = order.order_items || [];
        const khrRate = (window.app && window.app.khrRate) || 4000;
        let calcItemsUsd = 0;
        let unknownCount = 0;

        const itemsListHtml = items.length > 0 ? `
          <div class="order-admin-items" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-subtle); font-size: 12px;">
            <div style="font-weight: 600; margin-bottom: 4px; color: var(--text-primary);">🛍️ Состав заказа (${items.length}):</div>
            ${items.map(it => {
          const linkedProd = it.products || (window.app && Array.isArray(window.app.products) ? window.app.products.find(p => p.id === it.product_id) : null);
          const rawSavedTitle = (it.product_title && it.product_title !== 'Товар') ? it.product_title : '';
          const rawSavedRu = (it.product_name_ru && it.product_name_ru !== 'Товар') ? it.product_name_ru : '';
          const resolvedTitle = rawSavedRu
            || rawSavedTitle
            || (linkedProd && linkedProd.name_ru)
            || it.product_name_en
            || (linkedProd && linkedProd.name_en)
            || 'Товар';
          const resolvedKh = it.product_name_kh || (linkedProd && linkedProd.name_kh) || '';
          const itTitle = this.escapeHtml(resolvedTitle);
          const khBadge = resolvedKh ? ` <span class="khmer-font" style="color: var(--text-khmer, #1a6896); font-size: 11px;">(${this.escapeHtml(resolvedKh)})</span>` : '';
          const rawQty = Number(it.quantity || it.requested_qty || 1) || 1;
          const itQty = this.escapeHtml(rawQty);
          const rawUnit = String(it.unit || 'kg').trim();
          const unitDisplay = (window.FreshMarketUnits && typeof window.FreshMarketUnits.getUnitLabel === 'function')
            ? window.FreshMarketUnits.getUnitLabel(rawUnit)
            : rawUnit;
          const itUnit = this.escapeHtml(unitDisplay);
          const itComment = it.customer_comment ? ` <i style="color: var(--text-muted); font-size: 11px;">[💬 ${this.escapeHtml(it.customer_comment)}]</i>` : '';
          const estPrice = Number(it.actual_cost || it.estimated_price || 0);
          let itemUsd = 0;
          if (estPrice > 0 && estPrice < 500) {
            itemUsd = Number(estPrice.toFixed(2));
          } else if (estPrice >= 500) {
            if (window.FreshMarketUnits && typeof window.FreshMarketUnits.calculateCost === 'function') {
              const calc = window.FreshMarketUnits.calculateCost({ price: estPrice, unit: (linkedProd && linkedProd.unit) || '1_kg' }, rawQty, rawUnit, khrRate);
              itemUsd = calc.hasPrice ? calc.usd : 0;
            } else {
              const isGrams = /^(г|g|ក្រាម)$/i.test(rawUnit) || rawQty >= 50;
              const mult = isGrams ? (rawQty / 1000) : rawQty;
              itemUsd = Number(((estPrice * mult) / khrRate).toFixed(2));
            }
          } else if (linkedProd && Number(linkedProd.price) > 0 && window.FreshMarketUnits && typeof window.FreshMarketUnits.calculateCost === 'function') {
            const calc = window.FreshMarketUnits.calculateCost(linkedProd, rawQty, rawUnit, khrRate);
            itemUsd = calc.hasPrice ? calc.usd : 0;
          }
          if (it.status === 'missing') {
            itemUsd = 0;
          } else if (itemUsd > 0) {
            calcItemsUsd += itemUsd;
          } else {
            unknownCount += 1;
          }
          const priceLabel = it.status === 'missing'
            ? ` — <s style="color: var(--accent-rose, #ef4444);">нет в наличии</s>`
            : itemUsd > 0
              ? ` — <b>$${itemUsd.toFixed(2)}</b>`
              : ` — <i style="color: var(--accent-amber, #f59e0b);">по чеку</i>`;
          const statusDot = it.status === 'picked' ? '✅ ' : it.status === 'missing' ? '❌ ' : '• ';
          return `<div style="padding: 2px 0;">${statusDot}<b>${itTitle}</b>${khBadge} (${itQty} ${itUnit})${priceLabel}${itComment}</div>`;
        }).join('')}
          </div>
        ` : '';

        const dbActualMarket = Number(order.actual_market_total || 0);
        const hasAssemblyStatuses = items.some(it => it.status === 'picked' || it.status === 'missing');
        const effectiveUnknown = dbActualMarket > 0 ? 0 : unknownCount;
        const dbMarketTotal = dbActualMarket > 0
          ? dbActualMarket
          : (hasAssemblyStatuses ? calcItemsUsd : Number(order.market_items_total || order.estimated_total || 0));
        const marketTotalUsd = (dbMarketTotal > 0 && dbMarketTotal < 500) ? dbMarketTotal : Number(calcItemsUsd.toFixed(2));
        const servicePercent = typeof order.service_percent === 'number' ? order.service_percent : 10;
        const serviceFeeUsd = (dbActualMarket > 0 && Number(order.service_fee || 0) > 0) ? Number(order.service_fee) : Number((marketTotalUsd * (servicePercent / 100.0)).toFixed(2));
        const deliveryFeeUsd = Number(order.delivery_fee || 1.00);
        const grandTotalUsd = Number((marketTotalUsd + serviceFeeUsd + deliveryFeeUsd).toFixed(2));

        let totalText = `<b>$${grandTotalUsd.toFixed(2)}</b>`;
        let breakdownText = `(рынок $${marketTotalUsd.toFixed(2)} + сбор $${serviceFeeUsd.toFixed(2)} + доставка $${deliveryFeeUsd.toFixed(2)})`;
        if (effectiveUnknown > 0) {
          if (marketTotalUsd === 0) {
            totalText = `<b>$${deliveryFeeUsd.toFixed(2)} + по чеку</b>`;
            breakdownText = `(рынок: по чеку + сбор: ${servicePercent}% + доставка $${deliveryFeeUsd.toFixed(2)})`;
          } else {
            totalText = `<b>~$${grandTotalUsd.toFixed(2)} + по чеку</b>`;
            breakdownText = `(рынок ~$${marketTotalUsd.toFixed(2)} + сбор ~$${serviceFeeUsd.toFixed(2)} + доставка $${deliveryFeeUsd.toFixed(2)} + по чеку)`;
          }
        }

        const normalizeStatus = (st) => {
          if (st === 'new') return 'pending';
          if (st === 'purchasing') return 'shopping';
          if (st === 'needs_confirmation') return 'clarify';
          return st || 'pending';
        };
        const canonicalStatus = normalizeStatus(rawStatus);
        const statusOptions = [
          { value: 'pending', label: 'Новый' },
          { value: 'accepted', label: 'Принят' },
          { value: 'clarify', label: 'Уточнение' },
          { value: 'shopping', label: 'Закупка' },
          { value: 'delivering', label: 'Доставка' },
          { value: 'completed', label: 'Доставлен' },
          { value: 'cancelled', label: 'Отменен' },
          { value: 'rejected', label: 'Отклонен' }
        ];
        const statusSelectHtml = `
          <select class="order-status-select status-${this.escapeHtml(canonicalStatus)}" data-order-id="${this.escapeHtml(order.id)}" data-current-status="${this.escapeHtml(canonicalStatus)}" aria-label="Статус заказа">
            ${statusOptions.map(opt => `<option value="${opt.value}" ${opt.value === canonicalStatus ? 'selected' : ''}>${opt.label}</option>`).join('')}
          </select>
        `;

        return `
        <div class="order-admin-card" data-order-id="${this.escapeHtml(order.id)}">
          <div class="order-admin-header">
            <span class="order-admin-num">${safeNum}</span>
            ${statusSelectHtml}
          </div>
          <div class="order-admin-meta">
            <div>👤 <b>${safeName}</b> (${safePhone}${safeMessenger})</div>
            <div>📍 Зона доставки: <b>${safeZone}</b> ($${feeNum})</div>
            <div>🛒 Адрес: ${safeAddress}</div>
            ${safeNotes}
            <div>🔄 Замена: <b>${safePolicy}</b></div>
            <div>🕒 Создан: ${createdTimeStr}${deliveryDateStr}</div>
            <div>💰 Итого: ${totalText} <span style="color: var(--text-muted); font-size: 11.5px;">${breakdownText}</span></div>
          </div>
          ${itemsListHtml}
          <div class="order-admin-actions">
            <button type="button" class="btn btn-primary btn-sm" style="width: 100%;" data-action="assemble-order" data-order-id="${this.escapeHtml(order.id)}">🧺 Сборка заказа</button>
          </div>
        </div>
      `;
      }).join('');

      if (!this.ordersDelegationBound) {
        this.ordersDelegationBound = true;
        listEl.addEventListener('click', (e) => {
          const btn = e.target.closest('[data-action]');
          if (!btn) return;
          const action = btn.dataset.action;
          const orderId = btn.dataset.orderId;
          if (action === 'assemble-order' && orderId) {
            this.openOrderAssemblyModal(orderId);
          }
        });

        listEl.addEventListener('change', async (e) => {
          const select = e.target.closest('.order-status-select');
          if (!select) return;
          const orderId = select.dataset.orderId;
          const newStatus = select.value;
          const oldStatus = select.dataset.currentStatus || 'pending';
          if (newStatus === oldStatus) return;

          select.disabled = true;
          try {
            const { error } = await this.sb
              .from('orders')
              .update({ status: newStatus, updated_at: new Date().toISOString() })
              .eq('id', orderId);

            if (error) throw error;

            select.dataset.currentStatus = newStatus;
            select.className = `order-status-select status-${newStatus}`;
            select.disabled = false;

            // Update in-memory cache
            const targetOrder = (this.cachedAdminOrders || []).find(o => o.id === orderId);
            if (targetOrder) {
              targetOrder.status = newStatus;
              targetOrder.updated_at = new Date().toISOString();
            }

            if (typeof window.showToast === 'function') {
              window.showToast(`Статус заказа обновлен: ${this.formatStatus(newStatus)}`, 'success', 3000);
            }
            this.syncInitialPendingOrdersCount();

            // Re-render current tab so closed orders move to archive
            this.renderAdminOrders();
          } catch (err) {
            console.error('[AdminAuth] Status update error:', err);
            select.value = oldStatus;
            select.className = `order-status-select status-${oldStatus}`;
            select.disabled = false;
            if (typeof window.showToast === 'function') {
              window.showToast(`Не удалось обновить статус: ${err.message || 'Ошибка сети'}`, 'error', 4000);
            }
          }
        });
      }
    } catch (err) {
      console.warn('[AdminAuth] Orders render error:', err);
      listEl.innerHTML = `<div class="empty-desc">Не удалось отобразить заказы</div>`;
    }
  }

  escapeHtml(str) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(str);
    if (!str && str !== 0) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  formatReplacementPolicy(policy) {
    const map = {
      call_to_agree: '📞 Согласовать звонком/сообщением',
      call: '📞 Согласовать звонком/сообщением',
      picker_choice: '🔄 На усмотрение закупщика',
      do_not_replace: '❌ Не заменять (убрать из чека)'
    };
    return map[policy] || '📞 Согласовать звонком';
  }

  formatStatus(status) {
    const map = {
      pending: 'Новый',
      new: 'Новый',
      accepted: 'Принят',
      clarify: 'Уточнение',
      needs_confirmation: 'Уточнение',
      shopping: 'Закупка',
      purchasing: 'Закупка',
      delivering: 'Доставка',
      completed: 'Доставлен',
      cancelled: 'Отменен',
      rejected: 'Отклонен'
    };
    return map[status] || status || 'Новый';
  }

  formatZone(zone) {
    const map = {
      zone_1: 'Центр (до 1 км) — $1.00',
      zone_2: '1–3 км — $2.00',
      zone_3: '3–6 км — $3.50',
      zone_outside: 'Вне стандартной зоны (6–10 км)'
    };
    return map[zone] || zone || 'Зона 1: Центр ($1.00)';
  }

  // ------------------------------------------------------------------------
  // Order Assembly Modal (Single-Column Row Market Picker, KHR -> USD calc)
  // ------------------------------------------------------------------------
  setAssemblyCardState(card, nextStatus) {
    if (!card) return;
    card.dataset.itemStatus = nextStatus;
    card.classList.toggle('is-pending', nextStatus === 'pending');
    card.classList.toggle('is-picked', nextStatus === 'picked');
    card.classList.toggle('is-missing', nextStatus === 'missing');

    const checkBtn = card.querySelector('[data-assembly-toggle-pick]');
    if (checkBtn) {
      checkBtn.textContent = nextStatus === 'picked' ? '✓' : nextStatus === 'missing' ? '✕' : '';
      checkBtn.setAttribute(
        'aria-label',
        nextStatus === 'picked' ? 'Отмечено как купленное' : nextStatus === 'missing' ? 'Отмечено как отсутствующее' : 'Отметить как купленное'
      );
    }

    card.querySelectorAll('[data-assembly-status]').forEach((b) => {
      b.classList.toggle('active', b.dataset.assemblyStatus === nextStatus);
    });

    const khrInput = card.querySelector('.assembly-khr-input');
    if (khrInput) {
      if (nextStatus === 'missing') {
        if (khrInput.value && khrInput.value !== '0') {
          khrInput.dataset.prevKhr = khrInput.value;
        }
        khrInput.value = '0';
        khrInput.disabled = true;
      } else if (nextStatus === 'pending') {
        if (khrInput.value && khrInput.value !== '0') {
          khrInput.dataset.prevKhr = khrInput.value;
        }
        khrInput.value = '';
        khrInput.disabled = false;
      } else if (nextStatus === 'picked') {
        khrInput.disabled = false;
        if (khrInput.value === '0' || khrInput.value === '') {
          if (khrInput.dataset.prevKhr && Number(khrInput.dataset.prevKhr) > 0) {
            khrInput.value = khrInput.dataset.prevKhr;
          } else if (khrInput.dataset.estKhr && Number(khrInput.dataset.estKhr) > 0) {
            khrInput.value = khrInput.dataset.estKhr;
          }
        }
      }
    }
  }

  commitAssemblyTitleEdit(card) {
    if (!card) return;
    const editWrap = card.querySelector('.assembly-title-edit-wrap');
    const titleInput = card.querySelector('.assembly-item-title-input');
    const titleDisplay = card.querySelector('.assembly-title-display');
    const editBtn = card.querySelector('[data-assembly-edit-title]');
    if (!titleInput) return;

    const committed = titleInput.value.trim() || titleInput.dataset.committedTitle || 'Товар';
    titleInput.value = committed;
    titleInput.dataset.committedTitle = committed;
    if (titleDisplay) titleDisplay.textContent = committed;
    editWrap?.classList.remove('is-open');
    editBtn?.classList.remove('active');
  }

  revertAssemblyTitleEdit(card) {
    if (!card) return;
    const editWrap = card.querySelector('.assembly-title-edit-wrap');
    const titleInput = card.querySelector('.assembly-item-title-input');
    const titleDisplay = card.querySelector('.assembly-title-display');
    const editBtn = card.querySelector('[data-assembly-edit-title]');
    if (!titleInput) return;

    const original = titleInput.dataset.committedTitle || 'Товар';
    titleInput.value = original;
    if (titleDisplay) titleDisplay.textContent = original;
    editWrap?.classList.remove('is-open');
    editBtn?.classList.remove('active');
  }

  revertAllOpenAssemblyTitleEdits(exceptCard = null) {
    const openWraps = document.querySelectorAll('#assemblyItemsList .assembly-title-edit-wrap.is-open');
    let revertedAny = false;
    openWraps.forEach((wrap) => {
      const card = wrap.closest('.assembly-item-card');
      if (card && card !== exceptCard) {
        this.revertAssemblyTitleEdit(card);
        revertedAny = true;
      }
    });
    return revertedAny;
  }

  recalculateCardEstimateFromQty(card) {
    if (!card) return;
    const khrRate = (window.app && Number(window.app.khrRate)) || 4000;
    const basePrice = Number(card.dataset.basePrice || 0);
    const baseUnit = card.dataset.baseUnit || '1_kg';
    const qtyInput = card.querySelector('.assembly-qty-input');
    const unitSelect = card.querySelector('.assembly-unit-select');
    const khrInput = card.querySelector('.assembly-khr-input');
    if (!qtyInput || !unitSelect || !khrInput) return;

    const curQty = Math.max(0.01, Number(qtyInput.value || 1) || 1);
    const curUnit = unitSelect.value || 'kg';

    if (basePrice > 0 && window.FreshMarketUnits && typeof window.FreshMarketUnits.calculateCost === 'function') {
      const calc = window.FreshMarketUnits.calculateCost({ price: basePrice, unit: baseUnit }, curQty, curUnit, khrRate);
      if (calc.hasPrice && !calc.incompatibleUnit && calc.khr > 0) {
        const newEstKhr = Math.round(calc.khr);
        const oldEstKhr = khrInput.dataset.estKhr || '';
        khrInput.dataset.estKhr = String(newEstKhr);
        khrInput.placeholder = String(newEstKhr);
        if (card.dataset.itemStatus === 'picked' && (khrInput.value === '' || khrInput.value === oldEstKhr)) {
          khrInput.value = String(newEstKhr);
        }
      }
    }
  }

  applyAssemblyFilter(filterVal) {
    this.activeAssemblyFilter = filterVal || this.activeAssemblyFilter || 'all';
    const tabsWrap = document.getElementById('assemblyFilterTabs');
    tabsWrap?.querySelectorAll('[data-assembly-filter]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.assemblyFilter === this.activeAssemblyFilter);
    });

    const cards = Array.from(document.querySelectorAll('#assemblyItemsList .assembly-item-card'));
    cards.forEach((card) => {
      const st = card.dataset.itemStatus || 'pending';
      const visible = this.activeAssemblyFilter === 'all' || st === this.activeAssemblyFilter;
      card.classList.toggle('is-hidden-by-filter', !visible);
    });
  }

  ensureAssemblyModalListeners() {
    if (this._assemblyListenersBound) return;
    this._assemblyListenersBound = true;

    const modal = document.getElementById('orderAssemblyModal');
    const closeBtn = document.getElementById('assemblyModalCloseBtn');
    const saveBtn = document.getElementById('btnSaveOrderAssembly');
    const itemsList = document.getElementById('assemblyItemsList');
    const filterTabs = document.getElementById('assemblyFilterTabs');

    closeBtn?.addEventListener('click', () => this.closeOrderAssemblyModal());

    // Click outside open inline edit fields reverts them to initial state
    modal?.addEventListener('mousedown', (e) => {
      if (e.target.closest('.assembly-title-edit-wrap') || e.target.closest('[data-assembly-edit-title]')) {
        return;
      }
      this.revertAllOpenAssemblyTitleEdits();
    });

    modal?.addEventListener('click', (e) => {
      if (e.target === modal) this.closeOrderAssemblyModal();
    });

    // Global Escape handler: first reverts any open inline edit field; if none open, closes assembly modal
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!modal || modal.style.display === 'none') return;
      const reverted = this.revertAllOpenAssemblyTitleEdits();
      if (reverted) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      this.closeOrderAssemblyModal();
    });

    saveBtn?.addEventListener('click', () => this.saveOrderAssembly());

    filterTabs?.addEventListener('click', (e) => {
      const tabBtn = e.target.closest('[data-assembly-filter]');
      if (!tabBtn) return;
      this.applyAssemblyFilter(tabBtn.dataset.assemblyFilter);
    });

    itemsList?.addEventListener('click', (e) => {
      const card = e.target.closest('.assembly-item-card');
      if (!card) return;

      // 1. Left 44x44 1-tap check-off button
      const quickToggleBtn = e.target.closest('[data-assembly-toggle-pick]');
      if (quickToggleBtn) {
        const currentStatus = card.dataset.itemStatus || 'pending';
        const nextStatus = currentStatus === 'picked' ? 'pending' : 'picked';
        this.setAssemblyCardState(card, nextStatus);
        this.recalculateAssemblyModal();
        return;
      }

      // 2. Inline replacement title toggle button
      const editTitleBtn = e.target.closest('[data-assembly-edit-title]');
      if (editTitleBtn) {
        this.revertAllOpenAssemblyTitleEdits(card);
        const editWrap = card.querySelector('.assembly-title-edit-wrap');
        const titleInput = card.querySelector('.assembly-item-title-input');
        if (editWrap) {
          if (editWrap.classList.contains('is-open')) {
            this.revertAssemblyTitleEdit(card);
          } else {
            editWrap.classList.add('is-open');
            editTitleBtn.classList.add('active');
            if (titleInput) {
              titleInput.value = titleInput.dataset.committedTitle || titleInput.value;
              titleInput.focus();
              titleInput.select();
            }
          }
        }
        return;
      }

      // 2b. Confirm replacement title button (✓)
      const confirmTitleBtn = e.target.closest('[data-assembly-confirm-title]');
      if (confirmTitleBtn) {
        this.commitAssemblyTitleEdit(card);
        return;
      }

      // 2c. Cancel replacement title button (✕)
      const cancelTitleBtn = e.target.closest('[data-assembly-cancel-title]');
      if (cancelTitleBtn) {
        this.revertAssemblyTitleEdit(card);
        return;
      }

      // 3. Explicit Status Buttons (Куплено / Нет в наличии)
      const statusBtn = e.target.closest('[data-assembly-status]');
      if (statusBtn) {
        const targetStatus = statusBtn.dataset.assemblyStatus; // 'picked' | 'missing'
        const currentStatus = card.dataset.itemStatus || 'pending';
        const nextStatus = currentStatus === targetStatus ? 'pending' : targetStatus;
        this.setAssemblyCardState(card, nextStatus);
        this.recalculateAssemblyModal();
      }
    });

    itemsList?.addEventListener('keydown', (e) => {
      if (!e.target.classList.contains('assembly-item-title-input')) return;
      const card = e.target.closest('.assembly-item-card');
      if (!card) return;
      if (e.key === 'Enter') {
        e.preventDefault();
        this.commitAssemblyTitleEdit(card);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.revertAssemblyTitleEdit(card);
      }
    });

    itemsList?.addEventListener('input', (e) => {
      const card = e.target.closest('.assembly-item-card');
      if (!card) return;

      if (e.target.classList.contains('assembly-item-title-input')) {
        const titleDisplay = card.querySelector('.assembly-title-display');
        if (titleDisplay) {
          titleDisplay.textContent = e.target.value.trim() || e.target.dataset.committedTitle || 'Товар';
        }
        return;
      }

      if (e.target.classList.contains('assembly-qty-input')) {
        this.recalculateCardEstimateFromQty(card);
        this.recalculateAssemblyModal();
        return;
      }

      if (e.target.classList.contains('assembly-khr-input')) {
        const rawStr = String(e.target.value || '').trim();
        const valKhr = Number(rawStr || 0);
        if (rawStr !== '' && valKhr > 0 && card.dataset.itemStatus !== 'picked') {
          this.setAssemblyCardState(card, 'picked');
        } else if (rawStr === '' && card.dataset.itemStatus === 'picked') {
          this.setAssemblyCardState(card, 'pending');
        }
      }
      this.recalculateAssemblyModal();
    });

    itemsList?.addEventListener('change', (e) => {
      const card = e.target.closest('.assembly-item-card');
      if (!card) return;
      if (e.target.classList.contains('assembly-unit-select') || e.target.classList.contains('assembly-qty-input')) {
        this.recalculateCardEstimateFromQty(card);
        this.recalculateAssemblyModal();
      }
    });
  }

  buildCustomerContactLinks(order) {
    const rawPhone = String(order.customer_phone || '').trim();
    const messenger = String(order.customer_messenger || '').trim().toLowerCase();
    if (!rawPhone) return '';

    const links = [];
    const digits = rawPhone.replace(/[^0-9+]/g, '');

    if (rawPhone.startsWith('@') || messenger === 'telegram') {
      const tgHandle = rawPhone.startsWith('@') ? rawPhone.slice(1) : rawPhone.replace(/[^a-zA-Z0-9_+]/g, '');
      if (tgHandle) {
        links.push(`<a href="https://t.me/${this.escapeHtml(tgHandle)}" target="_blank" rel="noopener" class="assembly-contact-pill">✈️ Telegram</a>`);
      }
    }
    if (messenger === 'whatsapp' && digits) {
      const waDigits = digits.replace(/^\+/, '');
      links.push(`<a href="https://wa.me/${this.escapeHtml(waDigits)}" target="_blank" rel="noopener" class="assembly-contact-pill">💬 WhatsApp</a>`);
    }
    if (digits.length >= 6) {
      links.push(`<a href="tel:${this.escapeHtml(digits)}" class="assembly-contact-pill">📞 ${this.escapeHtml(rawPhone)}</a>`);
    } else {
      links.push(`<span class="assembly-contact-pill">💬 ${this.escapeHtml(rawPhone)}</span>`);
    }
    return links.join('');
  }

  openOrderAssemblyModal(orderId) {
    this.ensureAssemblyModalListeners();
    const order = (this.cachedAdminOrders || []).find((o) => String(o.id) === String(orderId));
    if (!order) return;

    this.activeAssemblyOrderId = order.id;
    this.activeAssemblyFilter = 'all';
    const modal = document.getElementById('orderAssemblyModal');
    const titleEl = document.getElementById('assemblyModalTitle');
    const statusBadge = document.getElementById('assemblyModalStatusBadge');
    const metaCard = document.getElementById('assemblyMetaCard');
    const rateBadge = document.getElementById('assemblyRateBadge');
    const itemsList = document.getElementById('assemblyItemsList');
    if (!modal || !itemsList) return;

    const khrRate = (window.app && Number(window.app.khrRate)) || 4000;
    const orderNum = order.order_number || 'RP-ЗАКАЗ';
    if (titleEl) titleEl.textContent = `Сборка ${orderNum}`;
    if (statusBadge) statusBadge.textContent = this.formatStatus(order.status);
    if (rateBadge) rateBadge.textContent = `Курс: $1 = ${Math.round(khrRate).toLocaleString('en-US')} ៛`;

    const safeName = this.escapeHtml(order.customer_name || 'Клиент');
    const safeAddress = this.escapeHtml(order.delivery_address || '—');
    const safeZone = this.escapeHtml(this.formatZone(order.delivery_zone));
    const safePolicy = this.escapeHtml(this.formatReplacementPolicy(order.replacement_policy || order.replace_rule));
    const notes = order.customer_notes || order.customer_comment || '';
    const notesHtml = notes ? `<div class="assembly-meta-note">Пожелание к заказу: <b>${this.escapeHtml(notes)}</b></div>` : '';

    if (metaCard) {
      metaCard.innerHTML = `
        <div class="assembly-meta-top">
          <span class="assembly-customer-name">${safeName}</span>
          <div class="assembly-contact-links">${this.buildCustomerContactLinks(order)}</div>
        </div>
        <div class="assembly-meta-details">
          <span class="assembly-meta-chip"><b>${safeZone}</b></span>
          <span class="assembly-meta-sep">•</span>
          <span>${safeAddress}</span>
          <span class="assembly-meta-sep">•</span>
          <span>Замены: <b>${safePolicy}</b></span>
        </div>
        ${notesHtml}
      `;
    }

    const items = order.order_items || [];
    const unitOptions = [
      { value: 'kg', label: 'кг' },
      { value: 'g', label: 'г' },
      { value: 'pc', label: 'шт' },
      { value: 'bunch', label: 'пучок' },
      { value: 'pack', label: 'упак' },
      { value: 'tray', label: 'лоток' },
      { value: 'bottle', label: 'бут' },
      { value: 'l', label: 'л' },
      { value: 'ml', label: 'мл' }
    ];

    itemsList.innerHTML = items.map((it) => {
      const linkedProd = it.products || (window.app && Array.isArray(window.app.products) ? window.app.products.find((p) => String(p.id) === String(it.product_id)) : null);
      const rawSavedTitle = (it.product_title && it.product_title !== 'Товар') ? it.product_title : '';
      const rawSavedRu = (it.product_name_ru && it.product_name_ru !== 'Товар') ? it.product_name_ru : '';
      const resolvedTitle = rawSavedRu
        || rawSavedTitle
        || (linkedProd && linkedProd.name_ru)
        || it.product_name_en
        || (linkedProd && linkedProd.name_en)
        || 'Товар';
      const resolvedKh = it.product_name_kh || (linkedProd && linkedProd.name_kh) || '';
      const resolvedForm = it.product_form || (linkedProd && linkedProd.form) || '';
      const imgUrl = it.product_img_url || (linkedProd && linkedProd.img_url) || '';

      const reqQty = Number(it.requested_qty || it.quantity || 1) || 1;
      const curQty = Number(it.quantity || it.requested_qty || 1) || 1;
      const rawUnit = String(it.unit || 'kg').trim();
      const canonicalUnit = (window.FreshMarketUnits && typeof window.FreshMarketUnits.normalizeUnitSlug === 'function')
        ? window.FreshMarketUnits.normalizeUnitSlug(rawUnit, 'kg')
        : rawUnit;
      const reqUnitLabel = (window.FreshMarketUnits && typeof window.FreshMarketUnits.getUnitLabel === 'function')
        ? window.FreshMarketUnits.getUnitLabel(canonicalUnit)
        : canonicalUnit;

      // 1. Base Unit Price Badge (from catalog product or derived from estimated_price)
      const baseProdPrice = Number(linkedProd?.price || 0);
      const baseProdUnitRaw = (linkedProd && linkedProd.unit) || '1_kg';
      let unitPriceBadgeHtml = '<span class="assembly-unit-price-badge is-by-receipt">Цена: по чеку</span>';
      if (baseProdPrice > 0) {
        const basePriceKey = (window.FreshMarketUnits && typeof window.FreshMarketUnits.normalizePriceUnitKey === 'function')
          ? window.FreshMarketUnits.normalizePriceUnitKey(baseProdUnitRaw)
          : '1_kg';
        const baseUnitLabel = window.FreshMarketUnits?.PRICE_UNIT_META?.[basePriceKey]?.label || baseProdUnitRaw || '1 кг';
        const unitPriceKhr = baseProdPrice < 50 ? Math.round(baseProdPrice * khrRate) : Math.round(baseProdPrice);
        const unitPriceUsd = (unitPriceKhr / khrRate).toFixed(2);
        unitPriceBadgeHtml = `<span class="assembly-unit-price-badge">${unitPriceKhr.toLocaleString('en-US')} ៛ / ${this.escapeHtml(baseUnitLabel)} ($${unitPriceUsd})</span>`;
      }

      // 2. Estimated cost for current quantity
      const estRaw = Number(it.estimated_price || 0);
      let estUsd = 0;
      if (baseProdPrice > 0 && window.FreshMarketUnits && typeof window.FreshMarketUnits.calculateCost === 'function') {
        const calc = window.FreshMarketUnits.calculateCost({ price: baseProdPrice, unit: baseProdUnitRaw }, curQty, canonicalUnit, khrRate);
        if (calc.hasPrice && !calc.incompatibleUnit) {
          estUsd = calc.usd;
        }
      }
      if (estUsd <= 0 && estRaw > 0) {
        estUsd = estRaw < 500 ? estRaw : Number((estRaw / khrRate).toFixed(2));
        if (baseProdPrice <= 0 && reqQty > 0) {
          const derivedUnitUsd = estUsd / reqQty;
          const derivedUnitKhr = Math.round(derivedUnitUsd * khrRate);
          unitPriceBadgeHtml = `<span class="assembly-unit-price-badge">${derivedUnitKhr.toLocaleString('en-US')} ៛ / 1 ${this.escapeHtml(reqUnitLabel)} ($${derivedUnitUsd.toFixed(2)})</span>`;
        }
      }
      const estKhr = estUsd > 0 ? Math.round(estUsd * khrRate) : 0;

      // 3. Item status & initial KHR value (ONLY pre-fill value if item is explicitly 'picked')
      const itemStatus = it.status === 'picked' ? 'picked' : it.status === 'missing' ? 'missing' : 'pending';
      const actRaw = Number(it.actual_cost || 0);
      const savedKhr = actRaw > 0 ? (actRaw >= 500 ? Math.round(actRaw) : Math.round(actRaw * khrRate)) : 0;

      let initialKhr = 0;
      if (itemStatus === 'picked') {
        initialKhr = savedKhr > 0 ? savedKhr : estKhr;
      }

      const stateClass = itemStatus === 'picked' ? 'is-picked' : itemStatus === 'missing' ? 'is-missing' : 'is-pending';
      const checkIcon = itemStatus === 'picked' ? '✓' : itemStatus === 'missing' ? '✕' : '';
      const hintKhr = itemStatus === 'picked' ? initialKhr : (itemStatus === 'pending' ? estKhr : 0);
      const hintUsd = hintKhr > 0 ? (hintKhr / khrRate).toFixed(2) : '0.00';
      const hintPrefix = itemStatus === 'picked' ? '≈' : (itemStatus === 'pending' && estKhr > 0 ? '~' : '');
      const hintClass = itemStatus === 'picked' ? 'is-active' : (itemStatus === 'pending' && estKhr > 0 ? 'is-estimate' : 'is-zero');

      return `
        <div class="assembly-item-card ${stateClass}"
             data-item-id="${this.escapeHtml(it.id)}"
             data-item-status="${itemStatus}"
             data-base-price="${baseProdPrice > 0 ? baseProdPrice : 0}"
             data-base-unit="${this.escapeHtml(baseProdUnitRaw)}">
          <!-- Left Lead Zone: 1-Tap Check + Thumbnail + Product Details -->
          <div class="assembly-row-lead">
            <button type="button" class="assembly-quick-check" data-assembly-toggle-pick="1"
                    aria-label="Отметить как купленное">${checkIcon}</button>
            <div class="assembly-item-thumb">
              ${imgUrl ? `<img src="${this.escapeHtml(imgUrl)}" alt="${this.escapeHtml(resolvedTitle)}" loading="lazy" />` : '🥬'}
            </div>
            <div class="assembly-item-info">
              <div class="assembly-title-line">
                <span class="assembly-title-display">${this.escapeHtml(resolvedTitle)}</span>
                ${resolvedKh ? `<span class="assembly-item-kh khmer-font">${this.escapeHtml(resolvedKh)}</span>` : ''}
                <button type="button" class="assembly-btn-replace-toggle" data-assembly-edit-title="1" title="Заменить позицию">
                  Замена
                </button>
                <span class="assembly-req-badge">Заказано: ${this.escapeHtml(reqQty)} ${this.escapeHtml(reqUnitLabel)}</span>
                ${unitPriceBadgeHtml}
                ${resolvedForm ? `<span class="assembly-est-badge">${this.escapeHtml(resolvedForm)}</span>` : ''}
                ${it.customer_comment ? `<span class="assembly-item-wish">Пожелание: ${this.escapeHtml(it.customer_comment)}</span>` : ''}
              </div>
              <div class="assembly-title-edit-wrap">
                <div class="assembly-title-edit-row">
                  <input type="text" class="assembly-item-title-input"
                         value="${this.escapeHtml(resolvedTitle)}"
                         data-committed-title="${this.escapeHtml(resolvedTitle)}"
                         aria-label="Название позиции (замена)" />
                  <button type="button" class="assembly-title-confirm-btn" data-assembly-confirm-title="1" title="Применить (Enter)">✓</button>
                  <button type="button" class="assembly-title-cancel-btn" data-assembly-cancel-title="1" title="Отмена (Esc)">✕</button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Controls Zone: Fact Qty + Riels Cost + Status -->
          <div class="assembly-row-controls">
            <div class="assembly-ctrl-qty">
              <span class="assembly-field-label">Факт. кол-во</span>
              <div class="assembly-qty-group">
                <input type="number" class="assembly-qty-input" step="any" min="0.01" max="5000" value="${this.escapeHtml(curQty)}" aria-label="Количество" />
                <select class="assembly-unit-select" aria-label="Размерность">
                  ${unitOptions.map((u) => `<option value="${u.value}" ${u.value === canonicalUnit ? 'selected' : ''}>${u.label}</option>`).join('')}
                </select>
              </div>
            </div>

            <div class="assembly-ctrl-khr">
              <div class="assembly-field-label-row">
                <span class="assembly-field-label">Сумма по чеку (៛)</span>
              </div>
              <div class="assembly-khr-wrap">
                <span class="assembly-khr-prefix">៛</span>
                <input type="number" class="assembly-khr-input" inputmode="numeric" step="100" min="0"
                       value="${initialKhr > 0 ? initialKhr : ''}"
                       data-est-khr="${estKhr}"
                       data-prev-khr="${savedKhr > 0 ? savedKhr : ''}"
                       placeholder="${estKhr > 0 ? estKhr : '0'}"
                       ${itemStatus === 'missing' ? 'disabled' : ''}
                       aria-label="Стоимость в риелях" />
                <span class="assembly-khr-usd-hint ${hintClass}">${hintPrefix}$${hintUsd}</span>
              </div>
            </div>

            <div class="assembly-status-btns">
              <button type="button" class="assembly-status-btn btn-pick ${itemStatus === 'picked' ? 'active' : ''}" data-assembly-status="picked">
                ✓ Куплено
              </button>
              <button type="button" class="assembly-status-btn btn-miss ${itemStatus === 'missing' ? 'active' : ''}" data-assembly-status="missing">
                ✕ Нет
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

    this.applyAssemblyFilter('all');
    this.recalculateAssemblyModal();
    modal.style.display = 'flex';
    document.body.classList.add('modal-open');
  }

  closeOrderAssemblyModal() {
    this.revertAllOpenAssemblyTitleEdits();
    const modal = document.getElementById('orderAssemblyModal');
    if (modal) modal.style.display = 'none';
    document.body.classList.remove('modal-open');
    this.activeAssemblyOrderId = null;
  }

  recalculateAssemblyModal() {
    const order = (this.cachedAdminOrders || []).find((o) => String(o.id) === String(this.activeAssemblyOrderId));
    if (!order) return;

    const khrRate = (window.app && Number(window.app.khrRate)) || 4000;
    const cards = Array.from(document.querySelectorAll('#assemblyItemsList .assembly-item-card'));
    const totalCount = cards.length;
    let pickedCount = 0;
    let missingCount = 0;
    let pendingCount = 0;
    let totalMarketKhr = 0;

    cards.forEach((card) => {
      const st = card.dataset.itemStatus || 'pending';
      const khrInput = card.querySelector('.assembly-khr-input');
      const usdHint = card.querySelector('.assembly-khr-usd-hint');
      const estKhr = Math.max(0, Number(khrInput?.dataset.estKhr || 0));
      const rawKhr = st === 'picked' ? Math.max(0, Number(khrInput?.value || 0)) : 0;
      const itemUsd = Number((rawKhr / khrRate).toFixed(2));

      if (usdHint) {
        usdHint.classList.remove('is-active', 'is-estimate', 'is-zero');
        if (st === 'picked') {
          usdHint.classList.add('is-active');
          usdHint.textContent = `≈ $${itemUsd.toFixed(2)}`;
        } else if (st === 'pending' && estKhr > 0) {
          usdHint.classList.add('is-estimate');
          usdHint.textContent = `~$${(estKhr / khrRate).toFixed(2)}`;
        } else {
          usdHint.classList.add('is-zero');
          usdHint.textContent = '$0.00';
        }
      }

      if (st === 'picked') {
        pickedCount += 1;
        totalMarketKhr += rawKhr;
      } else if (st === 'missing') {
        missingCount += 1;
      } else {
        pendingCount += 1;
      }
    });

    const processedCount = pickedCount + missingCount;
    const pct = totalCount > 0 ? Math.round((processedCount / totalCount) * 100) : 0;

    const progressLabel = document.getElementById('assemblyProgressLabel');
    const progressPct = document.getElementById('assemblyProgressPct');
    const progressFill = document.getElementById('assemblyProgressFill');
    if (progressLabel) {
      progressLabel.textContent = `Куплено: ${pickedCount} из ${totalCount} • Осталось: ${pendingCount}${missingCount > 0 ? ` • Нет: ${missingCount}` : ''}`;
    }
    if (progressPct) {
      progressPct.textContent = `${pct}%`;
    }
    if (progressFill) {
      progressFill.style.width = `${pct}%`;
    }

    const countAllEl = document.getElementById('assemblyCountAll');
    const countPendingEl = document.getElementById('assemblyCountPending');
    const countPickedEl = document.getElementById('assemblyCountPicked');
    const countMissingEl = document.getElementById('assemblyCountMissing');
    if (countAllEl) countAllEl.textContent = String(totalCount);
    if (countPendingEl) countPendingEl.textContent = String(pendingCount);
    if (countPickedEl) countPickedEl.textContent = String(pickedCount);
    if (countMissingEl) countMissingEl.textContent = String(missingCount);

    this.applyAssemblyFilter(this.activeAssemblyFilter || 'all');

    const marketTotalUsd = Number((totalMarketKhr / khrRate).toFixed(2));
    const servicePercent = typeof order.service_percent === 'number' ? order.service_percent : 10;
    const serviceFeeUsd = Number((marketTotalUsd * (servicePercent / 100.0)).toFixed(2));
    const deliveryFeeUsd = Number(order.delivery_fee || 1.00);
    const grandTotalUsd = Number((marketTotalUsd + serviceFeeUsd + deliveryFeeUsd).toFixed(2));
    const grandTotalKhr = Math.round(grandTotalUsd * khrRate);

    const totalsBox = document.getElementById('assemblyTotalsBox');
    if (totalsBox) {
      totalsBox.innerHTML = `
        <div class="assembly-total-row">
          <span>Рынок (чеки):</span>
          <b>${Math.round(totalMarketKhr).toLocaleString('en-US')} ៛ (~$${marketTotalUsd.toFixed(2)})</b>
        </div>
        <div class="assembly-total-row">
          <span>Сбор (${servicePercent}%):</span>
          <b>$${serviceFeeUsd.toFixed(2)}</b>
        </div>
        <div class="assembly-total-row">
          <span>Доставка:</span>
          <b>$${deliveryFeeUsd.toFixed(2)}</b>
        </div>
        <div class="assembly-total-row is-grand">
          <span>Итого к оплате:</span>
          <span class="grand-val">$${grandTotalUsd.toFixed(2)} (~${grandTotalKhr.toLocaleString('en-US')} ៛)</span>
        </div>
      `;
    }

    return {
      totalMarketKhr,
      marketTotalUsd,
      servicePercent,
      serviceFeeUsd,
      deliveryFeeUsd,
      grandTotalUsd
    };
  }

  async saveOrderAssembly() {
    const order = (this.cachedAdminOrders || []).find((o) => String(o.id) === String(this.activeAssemblyOrderId));
    if (!order || !this.sb) return;

    const saveBtn = document.getElementById('btnSaveOrderAssembly');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Сохранение...';
    }

    const khrRate = (window.app && Number(window.app.khrRate)) || 4000;
    const cards = Array.from(document.querySelectorAll('#assemblyItemsList .assembly-item-card'));
    const totals = this.recalculateAssemblyModal();
    const nowIso = new Date().toISOString();

    try {
      const updatedItems = [];

      for (const card of cards) {
        const itemId = card.dataset.itemId;
        const itemStatus = card.dataset.itemStatus || 'pending';
        const titleInput = card.querySelector('.assembly-item-title-input');
        const qtyInput = card.querySelector('.assembly-qty-input');
        const unitSelect = card.querySelector('.assembly-unit-select');
        const khrInput = card.querySelector('.assembly-khr-input');

        const newTitle = (titleInput?.dataset.committedTitle || titleInput?.value || '').trim() || 'Товар';
        const newQty = Math.max(0.01, Number(qtyInput?.value || 1) || 1);
        const newUnit = unitSelect?.value || 'kg';
        const rawKhr = itemStatus === 'picked' ? Math.max(0, Number(khrInput?.value || 0)) : 0;
        const actualCostUsd = itemStatus === 'picked' ? Number((rawKhr / khrRate).toFixed(2)) : 0;

        const payload = {
          product_title: newTitle,
          product_name_ru: newTitle,
          quantity: newQty,
          unit: newUnit,
          actual_cost: actualCostUsd,
          status: itemStatus
        };

        const { data: itemRows, error: itemErr } = await this.sb
          .from('order_items')
          .update(payload)
          .eq('id', itemId)
          .select('id');

        if (itemErr) throw itemErr;
        if (!itemRows || itemRows.length === 0) {
          throw new Error(`Позиция ${newTitle} не обновлена (проверьте права доступа)`);
        }

        updatedItems.push({ id: itemId, ...payload });
      }

      const orderUpdatePayload = {
        status: 'shopping',
        actual_market_total: totals.marketTotalUsd,
        market_items_total: totals.marketTotalUsd > 0 ? totals.marketTotalUsd : Number(order.estimated_total || 0),
        service_fee: totals.serviceFeeUsd,
        grand_total: totals.grandTotalUsd,
        updated_at: nowIso
      };

      const { data: orderRows, error: orderErr } = await this.sb
        .from('orders')
        .update(orderUpdatePayload)
        .eq('id', order.id)
        .select('id');

      if (orderErr) throw orderErr;
      if (!orderRows || orderRows.length === 0) {
        throw new Error('Заказ не обновлен в базе данных');
      }

      // Update local cache
      Object.assign(order, orderUpdatePayload);
      if (Array.isArray(order.order_items)) {
        order.order_items = order.order_items.map((orig) => {
          const patch = updatedItems.find((u) => String(u.id) === String(orig.id));
          return patch ? { ...orig, ...patch } : orig;
        });
      }

      if (typeof window.showToast === 'function') {
        window.showToast(`✅ Сборка ${order.order_number || ''} сохранена (статус: Закупка)`, 'success', 3500);
      }

      this.syncInitialPendingOrdersCount();
      this.renderAdminOrders();
      this.closeOrderAssemblyModal();
    } catch (err) {
      console.error('[AdminAuth] Save order assembly error:', err);
      if (typeof window.showToast === 'function') {
        window.showToast(`Ошибка сохранения сборки: ${err.message || 'Ошибка сети'}`, 'error', 5000);
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Сохранить';
      }
    }
  }

  // ------------------------------------------------------------------------
  // Realtime Orders, Audio Chime & Notifications
  // ------------------------------------------------------------------------
  initAudioUnlock() {
    const unlock = () => {
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (AudioContextClass && !this.audioContext) {
          this.audioContext = new AudioContextClass();
        }
        if (this.audioContext && this.audioContext.state === 'suspended') {
          this.audioContext.resume();
        }
      } catch (_) { }
      document.removeEventListener('click', unlock);
      document.removeEventListener('keydown', unlock);
      document.removeEventListener('touchstart', unlock);
    };
    document.addEventListener('click', unlock, { once: true, passive: true });
    document.addEventListener('keydown', unlock, { once: true, passive: true });
    document.addEventListener('touchstart', unlock, { once: true, passive: true });
  }

  playOrderNotificationSound() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      if (!this.audioContext) {
        this.audioContext = new AudioContextClass();
      }
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume();
      }
      const now = this.audioContext.currentTime;

      // Note 1 (A5 ~ 880Hz)
      const osc1 = this.audioContext.createOscillator();
      const gain1 = this.audioContext.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now);
      gain1.gain.setValueAtTime(0.18, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
      osc1.connect(gain1);
      gain1.connect(this.audioContext.destination);
      osc1.start(now);
      osc1.stop(now + 0.25);

      // Note 2 (D6 ~ 1174.66Hz)
      const osc2 = this.audioContext.createOscillator();
      const gain2 = this.audioContext.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(1174.66, now + 0.12);
      gain2.gain.setValueAtTime(0.22, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc2.connect(gain2);
      gain2.connect(this.audioContext.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.45);
    } catch (e) {
      console.debug('[AdminAuth] Sound notification skipped:', e);
    }
  }

  triggerVibration() {
    try {
      if ('vibrate' in navigator && typeof navigator.vibrate === 'function') {
        navigator.vibrate([200, 100, 200]);
      }
    } catch (_) { }
  }

  updateOrdersBadge(count) {
    if (!this.adminOrdersBadge) {
      this.adminOrdersBadge = document.getElementById('adminOrdersBadge');
    }
    if (!this.adminOrdersBadge) return;

    if (count > 0) {
      this.adminOrdersBadge.textContent = count > 99 ? '99+' : String(count);
      this.adminOrdersBadge.style.display = 'inline-block';
    } else {
      this.adminOrdersBadge.textContent = '0';
      this.adminOrdersBadge.style.display = 'none';
    }
  }

  incrementOrdersBadge() {
    this.unreadOrdersCount = (this.unreadOrdersCount || 0) + 1;
    this.updateOrdersBadge(this.unreadOrdersCount);
  }

  clearOrdersBadge() {
    this.unreadOrdersCount = 0;
    this.updateOrdersBadge(0);
  }

  async syncInitialPendingOrdersCount() {
    if (!this.sb) return;
    try {
      const { count, error } = await this.sb
        .from('orders')
        .select('*', { count: 'exact', head: true })
        .in('status', ['pending', 'new', 'clarify']);
      if (!error && typeof count === 'number') {
        const currentView = window.app?.currentMainView || 'viewCatalog';
        if (currentView !== 'viewOrders') {
          this.unreadOrdersCount = count;
          this.updateOrdersBadge(count);
        }
      }
    } catch (_) { }
  }

  setupRealtimeOrdersSync() {
    if (!this.sb || !this.currentUser) return;
    this.teardownRealtimeOrdersSync();

    try {
      this.realtimeOrdersChannel = this.sb.channel('admin-realtime-orders')
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'orders'
        }, (payload) => {
          this.handleRealtimeOrderEvent(payload);
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            console.log('[AdminAuth] Realtime orders sync active');
          }
        });
    } catch (err) {
      console.warn('[AdminAuth] Could not initialize orders realtime channel:', err);
    }
  }

  teardownRealtimeOrdersSync() {
    if (this.realtimeOrdersChannel && this.sb) {
      try {
        this.sb.removeChannel(this.realtimeOrdersChannel);
      } catch (_) { }
      this.realtimeOrdersChannel = null;
    }
  }

  handleRealtimeOrderEvent(payload) {
    if (!payload) return;
    const { eventType, new: newRecord } = payload;
    const currentView = window.app?.currentMainView || 'viewCatalog';

    if (eventType === 'INSERT') {
      const orderNum = newRecord?.order_number || 'RP-ЗАКАЗ';
      const custName = newRecord?.customer_name || 'Клиент';

      this.playOrderNotificationSound();
      this.triggerVibration();

      if (typeof window.showToast === 'function') {
        window.showToast(`🔔 Новый заказ ${orderNum}: ${custName}`, 'success', 5000);
      }

      if (currentView === 'viewOrders') {
        this.loadAdminOrders(true);
      } else {
        this.incrementOrdersBadge();
      }
    } else if (eventType === 'UPDATE' || eventType === 'DELETE') {
      if (currentView === 'viewOrders') {
        this.loadAdminOrders(true);
      }
    }
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.adminAuth = new AdminAuth();
});
