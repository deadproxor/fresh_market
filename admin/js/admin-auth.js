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

    // Section Tabs
    this.navTabs = document.querySelectorAll('.admin-nav-tab');
    this.sectionViews = document.querySelectorAll('.admin-section-view');

    this.initSupabase();
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
  }

  onSignedOut() {
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

  async loadAdminOrders() {
    const listEl = document.getElementById('adminOrdersList');
    if (!listEl) return;

    if (!this.sb) {
      listEl.innerHTML = '<div class="empty-desc">База данных не подключена</div>';
      return;
    }

    listEl.innerHTML = '<div style="text-align:center; padding:20px; color:var(--text-muted);">Загрузка заявок...</div>';

    try {
      const { data, error } = await this.sb
        .from('orders')
        .select('*, order_items(*)')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        listEl.innerHTML = `<div class="empty-desc">Ошибка загрузки: ${error.message}</div>`;
        return;
      }

      if (!data || data.length === 0) {
        listEl.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <div class="empty-title">Нет активных заявок</div>
            <div class="empty-desc">Когда покупатели оформят заявку на утренний закуп в магазине, она мгновенно появится здесь.</div>
          </div>
        `;
        return;
      }

      listEl.innerHTML = data.map(order => {
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
        const itemsListHtml = items.length > 0 ? `
          <div class="order-admin-items" style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed var(--border-subtle); font-size: 12px;">
            <div style="font-weight: 600; margin-bottom: 4px; color: var(--text-primary);">🛍️ Состав заказа (${items.length}):</div>
            ${items.map(it => {
              const itTitle = this.escapeHtml(it.product_title || it.product_name_ru || it.product_name_en || 'Товар');
              const itQty = this.escapeHtml(it.quantity || it.requested_qty || 1);
              const itUnit = this.escapeHtml(it.unit || 'кг');
              const itComment = it.customer_comment ? ` <i style="color: var(--text-muted); font-size: 11px;">[💬 ${this.escapeHtml(it.customer_comment)}]</i>` : '';
              return `<div style="padding: 2px 0;">• <b>${itTitle}</b> — ${itQty} ${itUnit}${itComment}</div>`;
            }).join('')}
          </div>
        ` : '';

        return `
        <div class="order-admin-card">
          <div class="order-admin-header">
            <span class="order-admin-num">${safeNum}</span>
            <span class="status-badge status-${safeStatus}">${statusLabel}</span>
          </div>
          <div class="order-admin-meta">
            <div>👤 <b>${safeName}</b> (${safePhone}${safeMessenger})</div>
            <div>📍 Зона доставки: <b>${safeZone}</b> ($${feeNum})</div>
            <div>🛒 Адрес: ${safeAddress}</div>
            ${safeNotes}
            <div>🔄 Замена: <b>${safePolicy}</b></div>
            <div>🕒 Создан: ${createdTimeStr}${deliveryDateStr}</div>
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
      }
    } catch (err) {
      console.warn('[AdminAuth] Orders load error:', err);
      listEl.innerHTML = `<div class="empty-desc">Не удалось загрузить заказы</div>`;
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
      pending: '⏳ Новая заявка',
      new: '⏳ Новая заявка',
      shopping: '🛒 Закупка на рынке',
      delivering: '🛵 В доставке',
      completed: '✅ Доставлен',
      cancelled: '❌ Отменен'
    };
    return map[status] || status || 'Новый';
  }

  formatZone(zone) {
    const map = {
      zone_1: 'Центр (до 1 км) — $1.00',
      zone_2: '1–3 км — $2.00',
      zone_3: '3–6 км — $3.50'
    };
    return map[zone] || zone || 'Зона 1: Центр ($1.00)';
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.adminAuth = new AdminAuth();
});
