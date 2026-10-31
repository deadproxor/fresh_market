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
    this.currentUser = user;
    window.adminUser = user;

    if (this.adminUserEmail) {
      this.adminUserEmail.textContent = user.email || 'Администратор';
    }

    this.hideLoginGate();

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
        .select('*, order_items(*)')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) {
        listEl.innerHTML = `<div class="empty-desc">Ошибка загрузки: ${error.message}</div>`;
        return;
      }

      this.cachedAdminOrders = data || [];
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

    const marketNow = this.getMarketLocalTime();
    const todayStr = marketNow.toISOString().slice(0, 10);
    const orders = this.cachedAdminOrders || [];

    const filteredOrders = orders.filter((order) => {
      const targetDate = order.target_delivery_date || (order.created_at ? order.created_at.slice(0, 10) : todayStr);
      const isTerminal = order.status === 'completed' || order.status === 'cancelled' || order.status === 'rejected';

      if (activeTab === 'current') {
        return !isTerminal && targetDate <= todayStr;
      }
      if (activeTab === 'upcoming') {
        return !isTerminal && targetDate > todayStr;
      }
      if (activeTab === 'archive') {
        return isTerminal || targetDate < todayStr;
      }
      return true;
    });

    if (filteredOrders.length === 0) {
      let emptyTitle, emptyDesc;
      if (activeTab === 'current') {
        emptyTitle = 'Нет активных заявок';
        emptyDesc = 'Заявки на утренний закуп сегодня отображаются здесь.';
      } else if (activeTab === 'upcoming') {
        emptyTitle = 'Нет будущих предзаказов';
        emptyDesc = 'Заявки с датой доставки на завтра и последующие дни отображаются здесь.';
      } else {
        emptyTitle = 'Архив заявок пуст';
        emptyDesc = 'Здесь сохраняется история выполненных и закрытых доставок.';
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
        const safeNum = this.escapeHtml(order.order_number || 'FM-ЗАКАЗ');
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
              const itTitle = this.escapeHtml(it.product_title || it.product_name_ru || it.product_name_en || 'Товар');
              const rawQty = Number(it.quantity || it.requested_qty || 1) || 1;
              const itQty = this.escapeHtml(rawQty);
              const rawUnit = String(it.unit || 'кг').trim();
              const itUnit = this.escapeHtml(rawUnit);
              const itComment = it.customer_comment ? ` <i style="color: var(--text-muted); font-size: 11px;">[💬 ${this.escapeHtml(it.customer_comment)}]</i>` : '';
              const estPrice = Number(it.actual_cost || it.estimated_price || 0);
              let itemUsd = 0;
              if (estPrice > 0 && estPrice < 500) {
                itemUsd = Number(estPrice.toFixed(2));
              } else if (estPrice >= 500) {
                const isGrams = /^(г|g|ក្រាម)$/i.test(rawUnit) || rawQty >= 50;
                const mult = isGrams ? (rawQty / 1000) : rawQty;
                itemUsd = Number(((estPrice * mult) / khrRate).toFixed(2));
              }
              if (itemUsd > 0) {
                calcItemsUsd += itemUsd;
              } else {
                unknownCount += 1;
              }
              const priceLabel = itemUsd > 0
                ? ` — <b>$${itemUsd.toFixed(2)}</b>`
                : ` — <i style="color: var(--accent-amber, #f59e0b);">по чеку</i>`;
              return `<div style="padding: 2px 0;">• <b>${itTitle}</b> (${itQty} ${itUnit})${priceLabel}${itComment}</div>`;
            }).join('')}
          </div>
        ` : '';

        const dbActualMarket = Number(order.actual_market_total || 0);
        const effectiveUnknown = dbActualMarket > 0 ? 0 : unknownCount;
        const dbMarketTotal = dbActualMarket > 0 ? dbActualMarket : Number(order.market_items_total || order.estimated_total || 0);
        const marketTotalUsd = (dbMarketTotal > 0 && dbMarketTotal < 500) ? dbMarketTotal : Number(calcItemsUsd.toFixed(2));
        const servicePercent = typeof order.service_percent === 'number' ? order.service_percent : 10;
        const serviceFeeUsd = Number(order.service_fee || 0) > 0 ? Number(order.service_fee) : Number((marketTotalUsd * (servicePercent / 100.0)).toFixed(2));
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
            <button type="button" class="btn btn-secondary btn-sm" data-action="view-items" data-order-id="${this.escapeHtml(order.id)}">🔍 Позиции</button>
            <button type="button" class="btn btn-primary btn-sm" data-action="enter-receipt" data-order-id="${this.escapeHtml(order.id)}">📝 Ввести чек</button>
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
          if (action === 'view-items') {
            alert('Детализация и сборка заказа на рынке будут доступны в следующей фазе');
          } else if (action === 'enter-receipt') {
            alert('Ввод суммы чека и смена статуса будут доступны в следующей фазе');
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
      } catch (_) {}
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
    } catch (_) {}
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
    } catch (_) {}
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
      } catch (_) {}
      this.realtimeOrdersChannel = null;
    }
  }

  handleRealtimeOrderEvent(payload) {
    if (!payload) return;
    const { eventType, new: newRecord } = payload;
    const currentView = window.app?.currentMainView || 'viewCatalog';

    if (eventType === 'INSERT') {
      const orderNum = newRecord?.order_number || 'FM-ЗАКАЗ';
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
