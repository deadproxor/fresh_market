/**
 * FreshMarket Admin - Authentication & Workspace Gatekeeper (admin-auth.js)
 * Architecture: Pure Vanilla JS + Supabase Auth
 */

const DEFAULT_SUPABASE_URL = 'https://qifazsptdgcskrchfocc.supabase.co';
const DEFAULT_SUPABASE_KEY = 'sb_publishable_N0kYhX05rgDeXuh9B6DgNg_Fese__Pg';

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
    const sbUrl = localStorage.getItem('freshmarket_supabase_url') || DEFAULT_SUPABASE_URL;
    const sbKey = localStorage.getItem('freshmarket_supabase_key') || DEFAULT_SUPABASE_KEY;
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
    const role = user.app_metadata?.role || user.user_metadata?.role;
    if (role === 'admin' || role === 'buyer') return true;
    const email = (user.email || '').toLowerCase().trim();
    const adminEmails = ['admin@freshmarket.com', 'deadproxor@gmail.com'];
    if (adminEmails.includes(email)) return true;
    return false;
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
    if (this.adminMainApp) this.adminMainApp.style.display = 'none';
  }

  hideLoginGate() {
    if (this.loginGate) this.loginGate.classList.remove('active');
    if (this.adminMainApp) this.adminMainApp.style.display = 'block';
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
    this.navTabs.forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.adminTab === sectionId);
    });

    this.sectionViews.forEach((view) => {
      const isTarget = view.id === `section-${sectionId}`;
      view.classList.toggle('active', isTarget);
    });

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
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) {
        listEl.innerHTML = `<div class="empty-desc">Ошибка загрузки: ${error.message}</div>`;
        return;
      }

      if (!data || data.length === 0) {
        listEl.innerHTML = `
          <div class="orders-stub-card">
            <div class="orders-stub-icon">📋</div>
            <div class="orders-stub-title">Нет активных заявок</div>
            <div class="orders-stub-desc">Когда покупатели оформят заявку на утренний закуп в магазине, она мгновенно появится здесь.</div>
          </div>
        `;
        return;
      }

      listEl.innerHTML = data.map(order => `
        <div class="order-admin-card">
          <div class="order-admin-header">
            <span class="order-admin-num">${order.order_number || 'FM-ЗАКАЗ'}</span>
            <span class="status-badge status-${order.status || 'pending'}">${this.formatStatus(order.status)}</span>
          </div>
          <div class="order-admin-meta">
            <div>👤 <b>${order.customer_name || 'Клиент'}</b> (${order.customer_phone || 'нет тел.'})</div>
            <div>📍 Зона доставки: <b>${this.formatZone(order.delivery_zone)}</b> ($${Number(order.delivery_fee || 1).toFixed(2)})</div>
            <div>🛒 Адрес: ${order.delivery_address || '—'}</div>
            ${order.customer_notes ? `<div>💬 Комментарий: <i>${order.customer_notes}</i></div>` : ''}
            <div>🕒 Создан: ${new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
          </div>
          <div class="order-admin-actions">
            <button type="button" class="btn btn-secondary btn-sm" onclick="alert('Детализация и сборка заказа на рынке будут доступны в следующей фазе')">🔍 Позиции</button>
            <button type="button" class="btn btn-primary btn-sm" onclick="alert('Ввод суммы чека и смена статуса будут доступны в следующей фазе')">📝 Ввести чек</button>
          </div>
        </div>
      `).join('');
    } catch (err) {
      console.warn('[AdminAuth] Orders load error:', err);
      listEl.innerHTML = `<div class="empty-desc">Не удалось загрузить заказы</div>`;
    }
  }

  formatStatus(status) {
    const map = {
      pending: '⏳ Новая заявка',
      shopping: '🛒 Закупка на рынке',
      delivering: '🛵 В доставке',
      completed: '✅ Доставлен',
      cancelled: '❌ Отменен'
    };
    return map[status] || status || 'Новый';
  }

  formatZone(zone) {
    const map = {
      zone_1: 'Центр / Набережная ($1.00)',
      zone_2: 'Остров / Пригород ($2.00)',
      zone_3: 'Дальние виллы ($3.00)'
    };
    return map[zone] || zone || 'Зона 1';
  }
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  window.adminAuth = new AdminAuth();
});
