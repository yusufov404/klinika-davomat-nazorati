/* =====================================================================
 *  KLINIKA DAVOMAT NAZORATI - Admin panel
 *  Alpine.js + Tailwind CSS + Chart.js (oflayn, CDN'siz)
 * ===================================================================== */

(function () {
  'use strict';

  const TOKEN_KEY = 'att_access_token';
  const REFRESH_KEY = 'att_refresh_token';

  /**
   * Chart.js grafiklari — Alpine reaktivligidan tashqarida saqlanadi.
   * (Reaktiv obyekt ichida Chart instance qo'yilsa, "Maximum call stack
   *  size exceeded" xatosi chiqadi — Chart ichki getter'lar proxy'ga uriladi)
   */
  const chartStore = {};

  // -------------------------------------------------------------------
  //  API klient
  // -------------------------------------------------------------------
  async function request(path, options = {}) {
    const opts = Object.assign({ headers: {} }, options);
    const token = localStorage.getItem(TOKEN_KEY);

    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers);
    // FormData uchun Content-Type brauzer tomonidan qo'yiladi (boundary kerak)
    if (opts.headers['Content-Type'] === undefined) {
      delete opts.headers['Content-Type'];
    }
    if (token) opts.headers.Authorization = `Bearer ${token}`;

    if (opts.body && typeof opts.body !== 'string' && !(opts.body instanceof FormData)) {
      opts.body = JSON.stringify(opts.body);
    }

    const res = await fetch(`/api${path}`, opts);
    const isJson = (res.headers.get('content-type') || '').includes('application/json');
    const data = isJson ? await res.json() : null;

    if (res.status === 401) {
      const refreshed = await tryRefresh();
      if (refreshed) return request(path, options);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(REFRESH_KEY);
      window.dispatchEvent(new CustomEvent('auth:expired'));
      throw new Error('Sessiya tugadi, qayta kiring');
    }

    if (!res.ok) {
      const msg = data && data.error ? data.error.message : `Xato (${res.status})`;
      const err = new Error(msg);
      err.details = data && data.error ? data.error.details : null;
      err.status = res.status;
      throw err;
    }

    return data;
  }

  async function tryRefresh() {
    const refresh = localStorage.getItem(REFRESH_KEY);
    if (!refresh) return false;
    try {
      const res = await fetch('/api/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: refresh }),
      });
      if (!res.ok) return false;
      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.data.accessToken);
      localStorage.setItem(REFRESH_KEY, data.data.refreshToken);
      return true;
    } catch (e) {
      return false;
    }
  }

  // -------------------------------------------------------------------
  //  Format yordamchilari
  // -------------------------------------------------------------------
  const fmtDate = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d)) return String(v).slice(0, 10);
    return d.toLocaleDateString('uz-UZ');
  };
  const fmtTime = (v) => {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d)) return '—';
    return d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
  };
  const fmtDateTime = (v) => (v ? `${fmtDate(v)} ${fmtTime(v)}` : '—');
  const fmtHours = (min) => (min ? `${(min / 60).toFixed(1)} soat` : '0');
  const fmtAgo = (v) => {
    if (!v) return '—';
    const diff = Math.round((Date.now() - new Date(v).getTime()) / 60000);
    if (diff < 1) return 'hozir';
    if (diff < 60) return `${diff} daq oldin`;
    if (diff < 1440) return `${Math.round(diff / 60)} soat oldin`;
    return `${Math.round(diff / 1440)} kun oldin`;
  };

  const STATUS_LABELS = {
    present: 'Ishda',
    late: 'Kechikdi',
    absent: 'Kelmagan',
    leave: "Ta'til",
    holiday: 'Bayram',
    day_off: 'Dam kuni',
    incomplete: 'Tuzatish kerak',
  };

  const STATUS_COLORS = {
    present: '#10b981',
    late: '#f59e0b',
    absent: '#ef4444',
    leave: '#3b82f6',
    holiday: '#8b5cf6',
    day_off: '#94a3b8',
    incomplete: '#d946ef',
  };

  const ROLE_LABELS = {
    superadmin: 'Super admin',
    adminka: 'Administrator (adminka)',
    glavniy_vrach: 'Glavniy vrach',
    hr_head: "Kadrlar boshlig'i",
    director: 'Direktor',
    accountant: 'Hisobchi',
  };

  const todayStr = () => new Date().toISOString().slice(0, 10);
  const addDaysStr = (days) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  };

  // -------------------------------------------------------------------
  //  Asosiy komponent
  // -------------------------------------------------------------------
  function appComponent() {
    return {
      // Holat
      isAuth: !!localStorage.getItem(TOKEN_KEY),
      user: null,
      page: 'dashboard',
      loading: false,
      toasts: [],
      sidebarOpen: false,
      mobileNav: false,

      // Login / profil
      loginForm: { username: '', password: '' },
      loginError: '',
      showProfileMenu: false,
      showProfileModal: false,
      showPasswordModal: false,
      showSessions: false,
      passwordForm: { currentPassword: '', newPassword: '', confirmPassword: '' },
      passwordErrors: {},
      profileForm: { fullName: '', phone: '' },
      sessions: [],

      // Bildirishnomalar
      notifications: [],
      unreadCount: 0,
      showNotifications: false,

      // Dashboard
      dash: { summary: null, terminals: [], logs: [] },
      dashRange: 7,
      get charts() {
        return chartStore;
      },

      // Xodimlar
      employees: [],
      employeesMeta: {},
      employeeSearch: '',
      employeePage: 1,
      employeeSort: { key: 'fullName', dir: 'asc' },
      departments: [],
      positions: [],
      showEmployeeModal: false,
      employeeForm: {},
      employeeErrors: {},
      showImportModal: false,
      importReport: null,
      importing: false,
      importFileName: '',

      // Terminallar
      terminals: [],
      monitoring: { summary: null, terminals: [] },
      showTerminalModal: false,
      terminalForm: {},
      terminalErrors: {},
      terminalTest: {},

      // Grafik
      shifts: [],
      schedules: [],
      showShiftModal: false,
      shiftForm: {},
      showScheduleModal: false,
      scheduleForm: {},
      showBulkModal: false,
      bulkForm: { employeeIds: [], shiftId: '', validFrom: todayStr(), validTo: '', weekdays: [1, 2, 3, 4, 5] },
      bulkResult: null,

      // Tabel / davomat
      attendance: [],
      attendanceMeta: {},
      attendanceFilters: {
        dateFrom: todayStr(),
        dateTo: todayStr(),
        employeeId: '',
        departmentId: '',
        status: '',
      },
      attendanceSort: { key: 'date', dir: 'desc' },
      showAdjustModal: false,
      adjustForm: {},

      // Ta'tillar
      leaves: [],
      leaveTypes: [],
      showLeaveModal: false,
      leaveForm: {},
      leaveFilter: 'pending',

      // Hisobotlar
      reports: { summary: null, late: [], absent: [], incomplete: [] },
      reportFilters: { dateFrom: addDaysStr(-30), dateTo: todayStr(), departmentId: '' },
      timesheetYear: new Date().getFullYear(),
      timesheetMonth: new Date().getMonth() + 1,
      timesheets: [],

      // Audit
      auditLogs: [],
      auditFilters: { action: '', entity: '', dateFrom: '', dateTo: '' },

      // Sozlamalar
      holidays: [],
      users: [],
      showHolidayModal: false,
      holidayForm: {},
      showUserModal: false,
      userForm: {},
      settings: [],
      errorLogs: [],
      errorStats: null,
      roles: [],
      allPermissions: [],
      roleMatrix: {},

      // Excel integratsiyasi
      importReport2: null,
      importing: false,

      // ---------------------------------------------------------
      //  Professional: HR oqimi
      // ---------------------------------------------------------
      periods: [],
      currentPeriod: null,
      periodStatus: 'open',
      balances: [],
      overtimeRows: [],
      overtimeForm: { employeeId: '', date: '', minutes: 60, kind: 'regular', note: '' },
      showOvertimeModal: false,
      requests: [],
      consents: [],
      consentForm: { employeeId: '', kind: 'biometric', documentNo: '', expiresAt: '', note: '' },
      showConsentModal: false,

      // ---------------------------------------------------------
      //  Professional: hisobotlar
      // ---------------------------------------------------------
      builderColumns: [],
      builderSelected: ['date', 'employee', 'department', 'status', 'workedHours', 'lateMinutes'],
      builderRows: [],
      reportTemplates: [],
      builderFilters: { dateFrom: addDaysStr(-30), dateTo: todayStr(), departmentId: '', status: '' },
      payroll: null,
      payrollRates: { baseRate: 0, overtimeRate: 0, latePenaltyPerMinute: 0, absenceDeductionPerDay: 0 },

      // ---------------------------------------------------------
      //  Professional: xavfsizlik
      // ---------------------------------------------------------
      twoFactorSetup: null,
      apiKeys: [],
      showApiKeyModal: false,
      newApiKey: null,
      auditVerification: null,

      // ---------------------------------------------------------
      //  Professional: xodimning o'z paneli
      // ---------------------------------------------------------
      myProfile: null,
      myBalances: [],
      myOvertime: null,
      myRequests: [],
      myRequestForm: { date: todayStr(), requestedIn: '', requestedOut: '', reason: '' },

      // ---------------------------------------------------------
      //  UI: dark mode, command palette, til
      // ---------------------------------------------------------
      theme: localStorage.getItem('att_theme') || 'light',
      lang: localStorage.getItem('att_lang') || 'uz',
      paletteOpen: false,
      paletteQuery: '',
      paletteIndex: 0,

      // ---------------------------------------------------------
      //  Tarjimalar
      // ---------------------------------------------------------
      i18n: {
        uz: {
          dashboard: 'Boshqaruv paneli',
          employees: 'Xodimlar',
          terminals: 'Terminallar',
          schedule: 'Ish grafigi',
          attendance: 'Tabel',
          leaves: "Ta'tillar",
          reports: 'Hisobotlar',
          audit: 'Audit log',
          settings: 'Sozlamalar',
          periods: 'Oylik oqim',
          balances: 'Ta\'til balansi',
          overtime: 'Qo\'shimcha ish vaqti',
          requests: 'Tasdiqlash so\'rovlari',
          consents: 'Roziliklar',
          builder: 'Hisobot konstruktori',
          payroll: 'Hisob-chek',
          security: 'Xavfsizlik',
          my: 'Menim panel',
          present: 'Ishda',
          late: 'Kechikdi',
          absent: 'Kelmagan',
          leave: 'Ta\'til',
          holiday: 'Bayram',
          day_off: 'Dam kuni',
          incomplete: 'Tuzatish kerak',
          worked: 'Ish soati',
          lateMin: 'Kechikish',
          absentDays: 'Kelmagan',
          leaveDays: 'Ta\'til',
          save: 'Saqlash',
          cancel: 'Bekor qilish',
          search: 'Qidirish',
          actions: 'Amallar',
        },
        ru: {
          dashboard: 'Панель управления',
          employees: 'Сотрудники',
          terminals: 'Терминалы',
          schedule: 'График работы',
          attendance: 'Табель',
          leaves: 'Отпуска',
          reports: 'Отчёты',
          audit: 'Журнал аудита',
          settings: 'Настройки',
          periods: 'Месячный цикл',
          balances: 'Баланс отпусков',
          overtime: 'Сверхурочные',
          requests: 'Запросы на подтверждение',
          consents: 'Согласия',
          builder: 'Конструктор отчётов',
          payroll: 'Расчёт зарплаты',
          security: 'Безопасность',
          my: 'Мой кабинет',
          present: 'Работал',
          late: 'Опоздал',
          absent: 'Отсутствовал',
          leave: 'Отпуск',
          holiday: 'Праздник',
          day_off: 'Выходной',
          incomplete: 'Требует правки',
          worked: 'Часы работы',
          lateMin: 'Опоздание',
          absentDays: 'Пропуски',
          leaveDays: 'Отпуск',
          save: 'Сохранить',
          cancel: 'Отмена',
          search: 'Поиск',
          actions: 'Действия',
        },
      },

      // -----------------------------------------------------------------
      //  Hayot sikli
      // -----------------------------------------------------------------
      async init() {
        this.applyTheme();

        window.addEventListener('auth:expired', () => {
          this.isAuth = false;
          this.user = null;
          this.toast('Sessiya muddati tugadi. Qayta kiring.', 'error');
        });

        if (this.isAuth) {
          try {
            const res = await request('/auth/me');
            this.user = res.data;
            if (this.user.mustChangePassword) {
              this.showPasswordModal = true;
              this.passwordForm.currentPassword = '';
            }
            await this.loadNotifications();
            // Xodim roli faqat "Menim panel"dan foydalanadi
            if (!this.can('reports:read')) this.page = 'my';
            await this.loadPage();
          } catch (e) {
            this.isAuth = false;
          }
        }
      },

      // -----------------------------------------------------------------
      //  Autentifikatsiya
      // -----------------------------------------------------------------
      async login() {
        this.loginError = '';
        try {
          const res = await request('/auth/login', {
            method: 'POST',
            body: this.loginForm,
          });
          localStorage.setItem(TOKEN_KEY, res.data.accessToken);
          localStorage.setItem(REFRESH_KEY, res.data.refreshToken);
          this.user = res.data.user;
          this.isAuth = true;
          this.loginForm = { username: '', password: '' };
          this.toast('Tizimga xush kelibsiz!', 'success');
          await this.loadNotifications();
          // Xodim roli faqat "Menim panel"dan foydalanadi
          if (!this.can('reports:read')) this.page = 'my';
          await this.loadPage();
        } catch (e) {
          this.loginError = e.message;
        }
      },

      async logout() {
        try {
          await request('/auth/logout', {
            method: 'POST',
            body: { refreshToken: localStorage.getItem(REFRESH_KEY) },
          });
        } catch (e) {
          /* xato bo'lsa ham chiqamiz */
        }
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(REFRESH_KEY);
        this.isAuth = false;
        this.user = null;
        this.page = 'dashboard';
        this.showProfileMenu = false;
      },

      // -----------------------------------------------------------------
      //  Profil va parol
      // -----------------------------------------------------------------
      openProfile() {
        this.showProfileMenu = false;
        this.profileForm = { fullName: this.user?.fullName || '', phone: this.user?.phone || '' };
        this.showProfileModal = true;
      },

      async saveProfile() {
        try {
          const res = await request('/auth/profile', { method: 'PUT', body: this.profileForm });
          this.user = res.data;
          this.showProfileModal = false;
          this.toast('Profil yangilandi', 'success');
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async changePassword() {
        this.passwordErrors = {};
        try {
          await request('/auth/password', { method: 'POST', body: this.passwordForm });
          this.showPasswordModal = false;
          this.passwordForm = { currentPassword: '', newPassword: '', confirmPassword: '' };
          this.toast('Parol o\'zgartirildi. Qayta kiring.', 'success');
          await this.logout();
        } catch (e) {
          this.passwordErrors = {};
          if (e.details) e.details.forEach((d) => (this.passwordErrors[d.field] = d.message));
          this.toast(e.message, 'error');
        }
      },

      async loadSessions() {
        this.showSessions = true;
        try {
          const res = await request('/auth/sessions');
          this.sessions = res.data;
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async revokeSessions() {
        try {
          const res = await request('/auth/sessions', { method: 'DELETE' });
          this.toast(`${res.data.revoked} ta sessiya bekor qilindi`, 'success');
          await this.loadSessions();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Bildirishnomalar
      // -----------------------------------------------------------------
      async loadNotifications() {
        try {
          const res = await request('/notifications?limit=20');
          this.notifications = res.data;
          this.unreadCount = (res.pagination && res.pagination.unread) || 0;
        } catch (e) {
          /* bildirishnoma yuklanmasa — panel ishlayveradi */
        }
      },

      async toggleNotifications() {
        this.showNotifications = !this.showNotifications;
        if (this.showNotifications) await this.loadNotifications();
      },

      async markNotificationRead(n) {
        if (!n.isRead) {
          await request(`/notifications/${n.id}/read`, { method: 'POST' });
          n.isRead = true;
          this.unreadCount = Math.max(0, this.unreadCount - 1);
        }
      },

      async markAllRead() {
        await request('/notifications/read-all', { method: 'POST' });
        this.notifications.forEach((n) => (n.isRead = true));
        this.unreadCount = 0;
      },

      // -----------------------------------------------------------------
      //  Toast
      // -----------------------------------------------------------------
      toast(message, type = 'info') {
        const id = Date.now() + Math.random();
        this.toasts.push({ id, message, type });
        setTimeout(() => {
          this.toasts = this.toasts.filter((t) => t.id !== id);
        }, 4500);
      },

      // -----------------------------------------------------------------
      //  Navigatsiya
      // -----------------------------------------------------------------
      nav: [
        { id: 'dashboard', label: 'Boshqaruv paneli', perm: 'reports:read', icon: 'M3 12l9-9 9 9M5 10v10a1 1 0 001 1h3a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1h3a1 1 0 001-1V10' },
        { id: 'employees', label: 'Xodimlar', perm: 'employees:read', icon: 'M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87M16 3.13a4 4 0 010 7.75M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
        { id: 'terminals', label: 'Terminallar', perm: 'terminals:read', icon: 'M9 17H7A2 2 0 015 15V7a2 2 0 012-2h2m10 10h2a2 2 0 002-2V7a2 2 0 00-2-2h-2M7 8h10M7 12h5' },
        { id: 'schedule', label: 'Ish grafigi', perm: 'shifts:read', icon: 'M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z' },
        { id: 'attendance', label: 'Tabel', perm: 'attendance:read', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2' },
        { id: 'leaves', label: "Ta'tillar", perm: 'leaves:read', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
        { id: 'reports', label: 'Hisobotlar', perm: 'reports:read', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { id: 'audit', label: 'Audit log', perm: 'audit:read', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
        { id: 'settings', label: 'Sozlamalar', perm: 'holidays:read', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.324 1.324 0 002.658 0c1.756 0 2.924 1.756 3.35 0a1.324 1.324 0 002.658 0c1.756 0 2.924 1.756 3.35 0a1.324 1.324 0 002.658 0c1.756 0 2.924 1.756 3.35 0a1.324 1.324 0 002.658 0M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
        // --- Professional bo'limlar ---
        { id: 'periods', label: 'Oylik oqim', perm: 'timesheets:read', icon: 'M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z' },
        { id: 'balances', label: "Ta'til balansi", perm: 'leaves:read', icon: 'M8 7V3m8 4V3M4 11h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z' },
        { id: 'overtime', label: "Qo'shimcha ish vaqti", perm: 'attendance:read', icon: 'M12 6v6l4 2m6-2a10 10 0 11-20 0 10 10 0 0020 0M12 6v6l4 2' },
        { id: 'requests', label: 'Tasdiqlash so\'rovlari', perm: 'attendance:read', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
        { id: 'consents', label: 'Roziliklar', perm: 'employees:read', icon: 'M12 3l8 3v6c0 4.5-3.2 7.8-8 9-4.8-1.2-8-4.5-8-9V6zM8.5 12l2.5 2.5L16 9.5' },
        { id: 'builder', label: 'Hisobot konstruktori', perm: 'reports:read', icon: 'M4 6h16M4 12h10M4 18h7' },
        { id: 'payroll', label: 'Hisob-chek', perm: 'reports:read', icon: 'M9 7h6m-6 0L9 12m3-3h6m-6 0L9 17m3-3h6' },
        { id: 'security', label: 'Xavfsizlik', perm: 'users:read', icon: 'M9 12l2 2 4-4m5.6 2A10 10 0 11-18 0 10 10 0 0020 0M12 15v2' },
        { id: 'my', label: 'Menim panel', perm: null, icon: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0z' },
      ],

      /** Foydalanuvchi huquqi bo'yicha ko'ra oladigan bo'limlar */
      get visibleNav() {
        return this.nav.filter((n) => {
          if (!n.perm) return true;
          return this.can(n.perm);
        });
      },

      /** Joriy sahifa sarlavhasi (tarjima bilan) */
      get navTitle() {
        const item = this.nav.find((n) => n.id === this.page);
        return item ? this.t(item.id) : '';
      },

      can(permission) {
        if (!this.user || !this.user.permissions) return false;
        const list = this.user.permissions;
        if (list.includes('*')) return true;
        if (list.includes(permission)) return true;
        const resource = String(permission).split(':')[0];
        return list.includes(`${resource}:*`);
      },

      async go(page) {
        // Dashboarddan chiqayotganda grafiklarni tozalaymiz (yashirilgan
        // canvas ustida Chart.js xato beradi)
        if (this.page === 'dashboard' && page !== 'dashboard') this.destroyCharts();
        this.page = page;
        this.sidebarOpen = false;
        this.showNotifications = false;
        await this.loadPage();
      },

      /** Grafiklarni yo'q qilish (xotira va xatolarni oldini oladi) */
      destroyCharts() {
        for (const key of Object.keys(chartStore)) {
          if (chartStore[key]) {
            try {
              chartStore[key].stop();
              chartStore[key].destroy();
            } catch (e) {
              /* e'tiborsiz */
            }
            chartStore[key] = null;
          }
        }
      },

      async loadPage() {
        this.loading = true;
        try {
          switch (this.page) {
            case 'dashboard': await this.loadDashboard(); break;
            case 'employees': await this.loadEmployees(); break;
            case 'terminals': await this.loadTerminals(); break;
            case 'schedule': await this.loadSchedule(); break;
            case 'attendance': await this.loadAttendance(); break;
            case 'leaves': await this.loadLeaves(); break;
            case 'reports': await this.loadReports(); break;
            case 'audit': await this.loadAudit(); break;
            case 'settings': await this.loadSettings(); break;
            case 'periods': await this.loadPeriods(); break;
            case 'balances': await this.loadBalances(); break;
            case 'overtime':
              if (!this.employees.length) await this.loadEmployees();
              await this.loadOvertime();
              break;
            case 'requests': await this.loadRequests(); break;
            case 'consents':
              if (!this.employees.length) await this.loadEmployees();
              await this.loadConsents();
              break;
            case 'builder': await this.loadBuilder(); break;
            case 'payroll': await this.loadPayroll(); break;
            case 'security': await this.loadSecurity(); break;
            case 'my': await this.loadMyProfile(); break;
          }
        } catch (e) {
          this.toast(e.message, 'error');
        } finally {
          this.loading = false;
        }
      },

      // -----------------------------------------------------------------
      //  Dashboard + chartlar
      // -----------------------------------------------------------------
      async loadDashboard() {
        const from = addDaysStr(-this.dashRange);
        const to = todayStr();
        const [sum, term, logs] = await Promise.all([
          request(`/reports/summary?dateFrom=${from}&dateTo=${to}`),
          request('/terminals?limit=50'),
          request('/attendance/logs?limit=15'),
        ]);
        this.dash.summary = sum.data;
        this.dash.terminals = term.data;
        this.dash.logs = logs.data;

        await this.loadTrend();
        await this.renderCharts();
        // Sahifa ko'rinishi kechikishi mumkin — keyinroq qayta chizamiz
        this.$nextTick(() => this.renderCharts());
      },

      /** Kunlik trend (oxirgi N kun) */
      async loadTrend() {
        const from = addDaysStr(-this.dashRange);
        const to = todayStr();
        const res = await request(
          `/attendance/daily?dateFrom=${from}&dateTo=${to}&limit=5000`
        );

        const days = {};
        for (let i = this.dashRange - 1; i >= 0; i -= 1) {
          const key = addDaysStr(-i);
          days[key] = { date: key, present: 0, late: 0, absent: 0, leave: 0 };
        }
        for (const row of res.data) {
          if (!days[row.date]) continue;
          if (row.status === 'present') days[row.date].present += 1;
          else if (row.status === 'late') days[row.date].late += 1;
          else if (row.status === 'absent') days[row.date].absent += 1;
          else if (row.status === 'leave' || row.status === 'holiday') days[row.date].leave += 1;
        }
        this.dash.trend = Object.values(days);
      },

      /** Chart.js grafiklarni chizish */
      async renderCharts() {
        if (typeof Chart === 'undefined') return;

        // Chart.js yashirilgan canvas ustida chizilganda xato beradi —
        // shuning uchun faqat ko'rinadigan canvas ustida ishlaymiz.
        const isVisible = (el) => !!el && el.offsetParent !== null && el.width > 0;

        const defaults = {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { boxWidth: 12, font: { size: 11 } } } },
          scales: {
            x: { grid: { display: false }, ticks: { font: { size: 10 } } },
            y: { beginAtZero: true, ticks: { precision: 0, font: { size: 10 } }, grid: { color: '#eef2f7' } },
          },
        };

        // 1) Trend
        const trendCanvas = document.getElementById('chartTrend');
        if (isVisible(trendCanvas) && this.dash.trend) {
          this.charts.trend = this.renderChart('trend', trendCanvas, {
            type: 'bar',
            data: {
              labels: this.dash.trend.map((d) => d.date.slice(5)),
              datasets: [
                {
                  label: 'Ishda',
                  data: this.dash.trend.map((d) => d.present),
                  backgroundColor: STATUS_COLORS.present,
                  borderRadius: 3,
                },
                {
                  label: 'Kechikdi',
                  data: this.dash.trend.map((d) => d.late),
                  backgroundColor: STATUS_COLORS.late,
                  borderRadius: 3,
                },
                {
                  label: 'Kelmagan',
                  data: this.dash.trend.map((d) => d.absent),
                  backgroundColor: STATUS_COLORS.absent,
                  borderRadius: 3,
                },
              ],
            },
            options: { ...defaults, scales: { ...defaults.scales, x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef2f7' } } } },
          });
        }

        // 2) Bo'limlar kesimi
        const deptCanvas = document.getElementById('chartDepartments');
        if (isVisible(deptCanvas) && this.dash.summary) {
          const depts = this.dash.summary.byDepartment || [];
          this.charts.departments = this.renderChart('departments', deptCanvas, {
            type: 'bar',
            data: {
              labels: depts.map((d) => d.department),
              datasets: [
                { label: 'Ishda', data: depts.map((d) => d.present), backgroundColor: STATUS_COLORS.present, borderRadius: 3 },
                { label: 'Kechikdi', data: depts.map((d) => d.late), backgroundColor: STATUS_COLORS.late, borderRadius: 3 },
                { label: 'Kelmagan', data: depts.map((d) => d.absent), backgroundColor: STATUS_COLORS.absent, borderRadius: 3 },
              ],
            },
            options: { ...defaults, indexAxis: 'y', scales: { ...defaults.scales, x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: '#eef2f7' } }, y: { stacked: true, grid: { display: false } } } },
          });
        }

        // 3) Taqsimot
        const distCanvas = document.getElementById('chartDistribution');
        if (isVisible(distCanvas) && this.dash.summary) {
          const s = this.dash.summary;
          this.charts.distribution = this.renderChart('distribution', distCanvas, {
            type: 'doughnut',
            data: {
              labels: ['Ishda', 'Kechikdi', 'Kelmagan', "Ta'til/dam"],
              datasets: [
                {
                  data: [s.present, s.late, s.absent, s.leave + s.dayOff + s.holiday],
                  backgroundColor: [
                    STATUS_COLORS.present,
                    STATUS_COLORS.late,
                    STATUS_COLORS.absent,
                    STATUS_COLORS.leave,
                  ],
                  borderWidth: 0,
                },
              ],
            },
            options: {
              ...defaults,
              cutout: '62%',
              scales: { x: { display: false }, y: { display: false } },
              plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 }, padding: 12 } } },
            },
          });
        }
      },

      /**
       * Grafikni (qayta) yaratadi.
       * Chart.js da `options` ni to'liq almashtirish ichki ma'lumotnoma
       * buzadi — shuning uchun eski grafik to'liq tozalanadi va qayta
       * quriladi (faqat ko'rinadigan canvas ustida).
       */
      renderChart(key, canvas, config) {
        const existing = chartStore[key];
        if (existing) {
          try {
            existing.stop();
            existing.destroy();
          } catch (e) {
            /* e'tiborsiz */
          }
          chartStore[key] = null;
        }
        chartStore[key] = new Chart(canvas, config);
        return chartStore[key];
      },

      // -----------------------------------------------------------------
      //  Xodimlar
      // -----------------------------------------------------------------
      async loadEmployees() {
        const q = this.employeeSearch ? `&q=${encodeURIComponent(this.employeeSearch)}` : '';
        const res = await request(`/employees?page=${this.employeePage}&limit=50${q}`);
        this.employees = this.sortRows(res.data, this.employeeSort);
        this.employeesMeta = res.pagination || {};
        if (!this.departments.length) await this.loadRefs();
      },

      async loadRefs() {
        const [dep, pos] = await Promise.all([
          request('/departments?limit=200'),
          request('/positions?limit=200'),
        ]);
        this.departments = dep.data;
        this.positions = pos.data;
      },

      /** Jadval saralash */
      sortRows(rows, sort) {
        if (!sort || !sort.key) return rows;
        const dir = sort.dir === 'asc' ? 1 : -1;
        return [...rows].sort((a, b) => {
          const av = this.sortValue(a, sort.key);
          const bv = this.sortValue(b, sort.key);
          if (av === bv) return 0;
          return av > bv ? dir : -dir;
        });
      },

      sortValue(row, key) {
        const map = {
          fullName: row.fullName,
          employeeNo: row.employeeNo,
          department: row.Department ? row.Department.name : '',
          position: row.Position ? row.Position.name : '',
          status: row.status,
          date: row.date,
          workedMinutes: row.workedMinutes || 0,
          lateMinutes: row.lateMinutes || 0,
        };
        const v = map[key] !== undefined ? map[key] : row[key];
        return typeof v === 'string' ? v.toLowerCase() : v || 0;
      },

      toggleSort(listName, key) {
        const store = listName === 'employees' ? this.employeeSort : this.attendanceSort;
        if (store.key === key) {
          store.dir = store.dir === 'asc' ? 'desc' : 'asc';
        } else {
          store.key = key;
          store.dir = 'asc';
        }
        if (listName === 'employees') {
          this.employees = this.sortRows(this.employees, this.employeeSort);
        } else {
          this.attendance = this.sortRows(this.attendance, this.attendanceSort);
        }
      },

      sortIcon(listName, key) {
        const store = listName === 'employees' ? this.employeeSort : this.attendanceSort;
        if (store.key !== key) return '↕';
        return store.dir === 'asc' ? '↑' : '↓';
      },

      openEmployeeModal(employee = null) {
        this.employeeErrors = {};
        this.employeeForm = employee
          ? Object.assign({}, employee)
          : {
              fullName: '',
              employeeNo: '',
              departmentId: '',
              positionId: '',
              hireDate: todayStr(),
              phone: '',
              terminalUserId: '',
              isActive: true,
            };
        this.showEmployeeModal = true;
      },

      async saveEmployee() {
        this.employeeErrors = {};
        const payload = Object.assign({}, this.employeeForm);
        if (!payload.departmentId) payload.departmentId = null;
        if (!payload.positionId) payload.positionId = null;
        if (!payload.terminalUserId) payload.terminalUserId = payload.employeeNo;

        try {
          if (payload.id) {
            await request(`/employees/${payload.id}`, { method: 'PUT', body: payload });
            this.toast('Xodim ma\'lumotlari yangilandi', 'success');
          } else {
            await request('/employees', { method: 'POST', body: payload });
            this.toast('Xodim qo\'shildi, terminallarga yuborilmoqda', 'success');
          }
          this.showEmployeeModal = false;
          await this.loadEmployees();
        } catch (e) {
          if (e.details) e.details.forEach((d) => (this.employeeErrors[d.field] = d.message));
          this.toast(e.message, 'error');
        }
      },

      async deleteEmployee(employee) {
        if (!confirm(`${employee.fullName} o'chirilsinmi?`)) return;
        try {
          await request(`/employees/${employee.id}`, { method: 'DELETE' });
          this.toast('Xodim o\'chirildi', 'success');
          await this.loadEmployees();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async syncEmployee(employee) {
        this.toast('Terminallarga yuborilmoqda...', 'info');
        try {
          const res = await request(`/employees/${employee.id}/sync`, { method: 'POST', body: {} });
          this.toast(`Sinxronlash: ${res.data.processed.ok} muvaffaqiyat, ${res.data.processed.failed} xato`, 'success');
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async uploadFace(employee, file) {
        if (!file) return;
        const fd = new FormData();
        fd.append('file', file);
        try {
          const res = await request(`/employees/${employee.id}/face`, {
            method: 'POST',
            body: fd,
            headers: { 'Content-Type': undefined },
          });
          const failed = (res.data || []).filter((r) => !r.ok);
          if (failed.length) {
            this.toast(`Ba'zi terminallarda xato: ${failed.map((f) => f.terminal).join(', ')}`, 'error');
          } else {
            this.toast('Yuz rasmi barcha terminallarga yuborildi', 'success');
          }
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Xodimlarni Excel'dan import
      // -----------------------------------------------------------------
      downloadEmployeeTemplate() {
        this.downloadFile('/employees/template.xlsx', 'xodimlar_shabloni.xlsx');
      },

      async importEmployees(file) {
        if (!file) return;
        this.importing = true;
        this.importReport = null;
        this.importFileName = file.name;

        const fd = new FormData();
        fd.append('file', file);

        try {
          const res = await request('/employees/import-excel', {
            method: 'POST',
            body: fd,
            headers: { 'Content-Type': undefined },
          });
          this.importReport = res.data;
          this.toast(
            `Import: ${res.data.created} yangi, ${res.data.updated} yangilandi` +
              (res.data.errors.length ? `, ${res.data.errors.length} xato` : ''),
            res.data.errors.length ? 'error' : 'success'
          );
          await this.loadEmployees();
        } catch (e) {
          this.importReport = {
            errors: (e.details || []).map((d) => ({ message: d.message || d.field })),
            created: 0,
            updated: 0,
          };
          this.toast(e.message, 'error');
        } finally {
          this.importing = false;
        }
      },

      // -----------------------------------------------------------------
      //  Terminallar
      // -----------------------------------------------------------------
      async loadTerminals() {
        const [res, mon] = await Promise.all([
          request('/terminals?limit=100'),
          request('/terminals/monitoring').catch(() => null),
        ]);
        this.terminals = res.data;
        this.monitoring = mon ? mon.data : { summary: null, terminals: [] };
      },

      openTerminalModal(terminal = null) {
        this.terminalErrors = {};
        this.terminalForm = terminal
          ? Object.assign({}, terminal)
          : {
              name: '',
              ipAddress: '',
              port: 80,
              username: 'admin',
              password: '',
              direction: 'both',
              isActive: true,
            };
        this.showTerminalModal = true;
      },

      async saveTerminal() {
        this.terminalErrors = {};
        try {
          if (this.terminalForm.id) {
            const payload = Object.assign({}, this.terminalForm);
            if (!payload.password) delete payload.password;
            await request(`/terminals/${payload.id}`, { method: 'PUT', body: payload });
            this.toast('Terminal yangilandi', 'success');
          } else {
            await request('/terminals', { method: 'POST', body: this.terminalForm });
            this.toast('Terminal qo\'shildi', 'success');
          }
          this.showTerminalModal = false;
          await this.loadTerminals();
        } catch (e) {
          if (e.details) e.details.forEach((d) => (this.terminalErrors[d.field] = d.message));
          this.toast(e.message, 'error');
        }
      },

      async deleteTerminal(terminal) {
        if (!confirm(`${terminal.name} o'chirilsinmi?`)) return;
        try {
          await request(`/terminals/${terminal.id}`, { method: 'DELETE' });
          this.toast('Terminal o\'chirildi', 'success');
          await this.loadTerminals();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async testTerminal(terminal) {
        this.terminalTest[terminal.id] = { loading: true };
        try {
          const res = await request(`/terminals/${terminal.id}/test`, { method: 'POST', body: {} });
          const r = res.data;
          this.terminalTest[terminal.id] = {
            loading: false,
            ok: r.reachable,
            detail: r.reachable
              ? `${r.deviceInfo.deviceType || 'Terminal'} | ${r.deviceInfo.firmwareVersion || ''} | ${r.latencyMs}ms${
                  r.timeWarning ? ` | VAQT FARQI: ${r.timeDriftSeconds}s` : ''
                }`
              : r.error,
          };
          await this.loadTerminals();
        } catch (e) {
          this.terminalTest[terminal.id] = { loading: false, ok: false, detail: e.message };
        }
      },

      async configureNotify(terminal) {
        try {
          await request(`/terminals/${terminal.id}/notify`, { method: 'POST', body: {} });
          this.toast('Push konfiguratsiyasi terminalga yuborildi', 'success');
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Ish grafigi
      // -----------------------------------------------------------------
      async loadSchedule() {
        const [sh, sc] = await Promise.all([
          request('/shifts?limit=100'),
          request('/schedules?limit=300'),
        ]);
        this.shifts = sh.data;
        this.schedules = sc.data;
        if (!this.employees.length) await this.loadEmployees();
      },

      openShiftModal(shift = null) {
        this.shiftForm = shift
          ? Object.assign({}, shift)
          : {
              name: '',
              startTime: '08:00',
              endTime: '17:00',
              crossesMidnight: false,
              graceLateMinutes: 10,
              graceEarlyMinutes: 10,
              breakMinutes: 0,
            };
        this.showShiftModal = true;
      },

      async saveShift() {
        try {
          if (this.shiftForm.id) {
            await request(`/shifts/${this.shiftForm.id}`, { method: 'PUT', body: this.shiftForm });
          } else {
            await request('/shifts', { method: 'POST', body: this.shiftForm });
          }
          this.showShiftModal = false;
          this.toast('Smena saqlandi', 'success');
          await this.loadSchedule();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async deleteShift(shift) {
        if (!confirm(`${shift.name} o'chirilsinmi?`)) return;
        try {
          await request(`/shifts/${shift.id}`, { method: 'DELETE' });
          this.toast('Smena o\'chirildi', 'success');
          await this.loadSchedule();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      openScheduleModal(schedule = null) {
        this.scheduleForm = schedule
          ? Object.assign({}, schedule)
          : {
              employeeId: '',
              shiftId: '',
              validFrom: todayStr(),
              validTo: '',
              weekdays: [1, 2, 3, 4, 5],
              priority: 0,
              isActive: true,
            };
        this.showScheduleModal = true;
      },

      async saveSchedule() {
        try {
          const payload = Object.assign({}, this.scheduleForm);
          payload.employeeId = Number(payload.employeeId);
          payload.shiftId = Number(payload.shiftId);
          if (!payload.validTo) payload.validTo = null;

          if (payload.id) {
            await request(`/schedules/${payload.id}`, { method: 'PUT', body: payload });
          } else {
            await request('/schedules', { method: 'POST', body: payload });
          }
          this.showScheduleModal = false;
          this.toast('Grafik saqlandi', 'success');
          await this.loadSchedule();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async deleteSchedule(schedule) {
        if (!confirm('Grafik o\'chirilsinmi?')) return;
        try {
          await request(`/schedules/${schedule.id}`, { method: 'DELETE' });
          this.toast('Grafik o\'chirildi', 'success');
          await this.loadSchedule();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // --- Bulk grafik ---
      openBulkModal() {
        this.bulkForm = {
          employeeIds: [],
          shiftId: this.shifts[0] ? this.shifts[0].id : '',
          validFrom: todayStr(),
          validTo: '',
          weekdays: [1, 2, 3, 4, 5],
        };
        this.bulkResult = null;
        this.showBulkModal = true;
      },

      toggleBulkEmployee(id) {
        const idx = this.bulkForm.employeeIds.indexOf(id);
        if (idx >= 0) this.bulkForm.employeeIds.splice(idx, 1);
        else this.bulkForm.employeeIds.push(id);
      },

      selectAllBulk() {
        this.bulkForm.employeeIds = this.employees.map((e) => e.id);
      },

      async saveBulkSchedule() {
        try {
          const res = await request('/schedules/bulk', {
            method: 'POST',
            body: {
              employeeIds: this.bulkForm.employeeIds,
              shiftId: Number(this.bulkForm.shiftId),
              validFrom: this.bulkForm.validFrom,
              validTo: this.bulkForm.validTo || null,
              weekdays: this.bulkForm.weekdays,
            },
          });
          this.bulkResult = res.data;
          this.toast(`${res.data.created} ta grafik yaratildi`, 'success');
          await this.loadSchedule();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      weekdayName(w) {
        return ['Dush', 'Sesh', 'Chor', 'Pay', 'Jum', 'Shan', 'Yak'][w - 1] || w;
      },

      // -----------------------------------------------------------------
      //  Tabel (kunlik davomat)
      // -----------------------------------------------------------------
      async loadAttendance() {
        const f = this.attendanceFilters;
        const params = new URLSearchParams();
        params.set('dateFrom', f.dateFrom);
        params.set('dateTo', f.dateTo);
        if (f.employeeId) params.set('employeeId', f.employeeId);
        if (f.departmentId) params.set('departmentId', f.departmentId);
        if (f.status) params.set('status', f.status);
        params.set('limit', '1000');

        const res = await request(`/attendance/daily?${params.toString()}`);
        this.attendance = this.sortRows(res.data, this.attendanceSort);
        this.attendanceMeta = res.pagination || {};
        if (!this.employees.length) await this.loadEmployees();
        if (!this.departments.length) await this.loadRefs();
      },

      openAdjustModal(row) {
        this.adjustForm = {
          employeeId: row.employeeId,
          date: row.date,
          status: row.status,
          firstIn: row.firstIn ? new Date(row.firstIn).toISOString().slice(0, 16) : '',
          lastOut: row.lastOut ? new Date(row.lastOut).toISOString().slice(0, 16) : '',
          workedMinutes: row.workedMinutes || 0,
          lateMinutes: row.lateMinutes || 0,
          earlyLeaveMinutes: row.earlyLeaveMinutes || 0,
          note: row.note || '',
          reason: '',
        };
        this.showAdjustModal = true;
      },

      async saveAdjustment() {
        try {
          await request('/attendance/adjust', { method: 'POST', body: this.adjustForm });
          this.showAdjustModal = false;
          this.toast('Tuzatish saqlandi (audit logga yozildi)', 'success');
          await this.loadAttendance();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async recalculate() {
        this.toast('Qayta hisoblanmoqda...', 'info');
        try {
          const res = await request('/attendance/recalculate', {
            method: 'POST',
            body: {
              dateFrom: this.attendanceFilters.dateFrom,
              dateTo: this.attendanceFilters.dateTo,
            },
          });
          this.toast(`${res.data.count} ta kunlik yozuv qayta hisoblandi`, 'success');
          await this.loadAttendance();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Ta'tillar
      // -----------------------------------------------------------------
      async loadLeaves() {
        const res = await request(`/leaves?limit=200${this.leaveFilter ? `&status=${this.leaveFilter}` : ''}`);
        this.leaves = res.data;
        if (!this.leaveTypes.length) {
          const lt = await request('/leave-types?limit=50');
          this.leaveTypes = lt.data;
        }
        if (!this.employees.length) await this.loadEmployees();
      },

      openLeaveModal() {
        this.leaveForm = {
          employeeId: '',
          leaveTypeId: '',
          startDate: todayStr(),
          endDate: todayStr(),
          comment: '',
        };
        this.showLeaveModal = true;
      },

      async saveLeave() {
        try {
          const payload = Object.assign({}, this.leaveForm);
          payload.employeeId = Number(payload.employeeId);
          payload.leaveTypeId = Number(payload.leaveTypeId);
          await request('/leaves', { method: 'POST', body: payload });
          this.showLeaveModal = false;
          this.toast("Ta'til so'rovi yuborildi", 'success');
          await this.loadLeaves();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async approveLeave(leave) {
        try {
          await request(`/leaves/${leave.id}/approve`, { method: 'POST', body: {} });
          this.toast("Ta'til tasdiqlandi", 'success');
          await this.loadLeaves();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async rejectLeave(leave) {
        try {
          await request(`/leaves/${leave.id}/reject`, { method: 'POST', body: {} });
          this.toast("Ta'til rad etildi", 'success');
          await this.loadLeaves();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Hisobotlar
      // -----------------------------------------------------------------
      async loadReports() {
        const f = this.reportFilters;
        const params = new URLSearchParams();
        params.set('dateFrom', f.dateFrom);
        params.set('dateTo', f.dateTo);
        if (f.departmentId) params.set('departmentId', f.departmentId);

        const [sum, late, absent, incomplete, ts] = await Promise.all([
          request(`/reports/summary?${params.toString()}`),
          request(`/reports/late?${params.toString()}`),
          request(`/reports/absent?${params.toString()}`),
          request(`/reports/incomplete?${params.toString()}`),
          request(`/timesheets/${this.timesheetYear}/${this.timesheetMonth}`),
        ]);

        this.reports.summary = sum.data;
        this.reports.late = late.data;
        this.reports.absent = absent.data;
        this.reports.incomplete = incomplete.data;
        this.timesheets = ts.data;
        if (!this.departments.length) await this.loadRefs();
      },

      async generateTimesheet() {
        this.toast('Tabel shakllantirilmoqda...', 'info');
        try {
          const res = await request(
            `/timesheets/${this.timesheetYear}/${this.timesheetMonth}/generate`,
            { method: 'POST', body: {} }
          );
          this.toast(`${res.data.count} ta xodim uchun tabel tayyor`, 'success');
          await this.loadReports();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Fayl yuklab olish (JWT header bilan)
      // -----------------------------------------------------------------
      async downloadFile(path, fallbackName) {
        try {
          const token = localStorage.getItem(TOKEN_KEY);
          const res = await fetch(`/api${path}`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) {
            const j = await res.json().catch(() => null);
            throw new Error((j && j.error && j.error.message) || `Yuklab olish xatosi (${res.status})`);
          }

          const disposition = res.headers.get('content-disposition') || '';
          const match = disposition.match(/filename="?([^";]+)"?/i);
          const name = match ? match[1] : fallbackName || 'download';

          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
          this.toast(`${name} yuklab olindi`, 'success');
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      exportExcel() {
        const f = this.reportFilters;
        const params = new URLSearchParams();
        params.set('dateFrom', f.dateFrom);
        params.set('dateTo', f.dateTo);
        if (f.departmentId) params.set('departmentId', f.departmentId);
        this.downloadFile(
          `/reports/export/daily.xlsx?${params.toString()}`,
          `tabel_${f.dateFrom}_${f.dateTo}.xlsx`
        );
      },

      exportTimesheetExcel() {
        this.downloadFile(
          `/reports/export/timesheet.xlsx?year=${this.timesheetYear}&month=${this.timesheetMonth}`,
          `oylik_tabel_${this.timesheetYear}_${String(this.timesheetMonth).padStart(2, '0')}.xlsx`
        );
      },

      exportTimesheetPdf() {
        this.downloadFile(
          `/reports/export/timesheet.pdf?year=${this.timesheetYear}&month=${this.timesheetMonth}`,
          `oylik_tabel_${this.timesheetYear}_${String(this.timesheetMonth).padStart(2, '0')}.pdf`
        );
      },

      // -----------------------------------------------------------------
      //  Excel: oylik tabel shabloni va import
      // -----------------------------------------------------------------
      downloadTemplate() {
        const year = this.timesheetYear;
        const month = this.timesheetMonth;
        const params = new URLSearchParams();
        if (this.attendanceFilters.departmentId) {
          params.set('departmentId', this.attendanceFilters.departmentId);
        }
        const q = params.toString() ? `?${params.toString()}` : '';
        this.downloadFile(
          `/attendance/tabel/${year}/${month}/template.xlsx${q}`,
          `tabel_shabloni_${year}_${String(month).padStart(2, '0')}.xlsx`
        );
      },

      async importExcel(file) {
        if (!file) return;
        this.importing = true;
        this.importReport2 = null;

        const fd = new FormData();
        fd.append('file', file);
        fd.append('year', String(this.timesheetYear));
        fd.append('month', String(this.timesheetMonth));
        fd.append('reason', 'Excel orqali import qilindi');

        try {
          const res = await request('/attendance/import-excel', {
            method: 'POST',
            body: fd,
            headers: { 'Content-Type': undefined },
          });
          this.importReport2 = res.data;
          this.toast(
            `Import: ${res.data.applied} ta o'zgarish qo'llandi, ${res.data.unchanged} ta o'zgarmagan`,
            res.data.errors.length ? 'error' : 'success'
          );
          await this.loadAttendance();
        } catch (e) {
          this.importReport2 = {
            errors: (e.details || []).map((d) => ({ message: d.message || d.field })),
            applied: 0,
            unchanged: 0,
            skipped: 0,
          };
          this.toast(e.message, 'error');
        } finally {
          this.importing = false;
        }
      },

      // -----------------------------------------------------------------
      //  Audit
      // -----------------------------------------------------------------
      async loadAudit() {
        const params = new URLSearchParams();
        if (this.auditFilters.action) params.set('action', this.auditFilters.action);
        if (this.auditFilters.entity) params.set('entity', this.auditFilters.entity);
        if (this.auditFilters.dateFrom) params.set('dateFrom', this.auditFilters.dateFrom);
        if (this.auditFilters.dateTo) params.set('dateTo', this.auditFilters.dateTo);
        params.set('limit', '200');
        const res = await request(`/audit?${params.toString()}`);
        this.auditLogs = res.data;
      },

      // -----------------------------------------------------------------
      //  Sozlamalar
      // -----------------------------------------------------------------
      async loadSettings() {
        const safe = async (path, apply) => {
          try {
            const res = await request(path);
            apply(res.data);
          } catch (e) {
            /* ruxsat yo'q bo'lsa — jimgina o'tkazib yuboramiz */
          }
        };

        await Promise.all([
          safe('/holidays?limit=200', (d) => (this.holidays = d)),
          safe('/users?limit=100', (d) => (this.users = d)),
          safe('/leave-types?limit=50', (d) => (this.leaveTypes = d)),
        ]);

        if (this.can('users:read')) {
          await this.loadRoles();
          await Promise.all([
            safe('/settings', (d) => (this.settings = d)),
            safe('/errors?limit=50', (d) => (this.errorLogs = d)),
            safe('/errors/stats', (d) => (this.errorStats = d)),
          ]);
        }
      },

      // --- Rollar ---
      async loadRoles() {
        try {
          const res = await request('/roles');
          this.roles = res.data.roles;
          this.allPermissions = res.data.allPermissions;
          this.buildRoleMatrix();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      buildRoleMatrix() {
        const matrix = {};
        this.roles.forEach((role) => {
          const effective = new Set(role.effectivePermissions || []);
          const overrides = {};
          (role.overrides || []).forEach((o) => {
            overrides[o.permission] = o.enabled;
          });
          matrix[role.id] = {
            role,
            permissions: this.allPermissions.map((p) => ({
              permission: p,
              enabled: effective.has(p),
              overridden: overrides[p] !== undefined,
            })),
          };
        });
        this.roleMatrix = matrix;
      },

      toggleRolePermission(roleId, permission) {
        const item = this.roleMatrix[roleId];
        if (!item) return;
        const row = item.permissions.find((p) => p.permission === permission);
        if (row) {
          row.enabled = !row.enabled;
          row.overridden = true;
        }
      },

      resetRolePermissions(roleId) {
        const item = this.roleMatrix[roleId];
        if (!item) return;
        const effective = new Set(item.role.effectivePermissions || []);
        item.permissions.forEach((p) => {
          p.enabled = effective.has(p.permission);
          p.overridden = false;
        });
      },

      async saveRolePermissions(roleId) {
        const item = this.roleMatrix[roleId];
        if (!item) return;
        try {
          const payload = item.permissions
            .filter((p) => p.overridden)
            .map((p) => ({ permission: p.permission, enabled: p.enabled }));

          await request(`/roles/${roleId}/permissions`, {
            method: 'PUT',
            body: { permissions: payload },
          });
          this.toast('Rol huquqlari saqlandi', 'success');
          await this.loadRoles();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // --- Sozlamalar (Telegram) ---
      async saveSettings() {
        try {
          const values = {};
          this.settings.forEach((s) => {
            if (s.isSecret) return; // maxfiy qiymatlar o'zgartirilmaguncha saqlanadi
            values[s.key] = s.value;
          });
          // maxfiy maydonlar uchun alohida
          const tokenInput = this.settings.find((s) => s.key === 'telegram.botToken');
          if (tokenInput && tokenInput.value && !String(tokenInput.value).includes('•')) {
            values['telegram.botToken'] = tokenInput.value;
          }
          await request('/settings', { method: 'PUT', body: { settings: values } });
          this.toast('Sozlamalar saqlandi', 'success');
          await this.loadSettings();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async testTelegram() {
        try {
          await request('/settings/telegram/test', { method: 'POST', body: {} });
          this.toast('Telegram test xabari yuborildi', 'success');
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // --- Bayramlar ---
      openHolidayModal() {
        this.holidayForm = { date: todayStr(), name: '', isWorking: false };
        this.showHolidayModal = true;
      },

      async saveHoliday() {
        try {
          if (this.holidayForm.id) {
            await request(`/holidays/${this.holidayForm.id}`, { method: 'PUT', body: this.holidayForm });
          } else {
            await request('/holidays', { method: 'POST', body: this.holidayForm });
          }
          this.showHolidayModal = false;
          this.toast('Bayram saqlandi', 'success');
          await this.loadSettings();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async deleteHoliday(holiday) {
        if (!confirm(`${holiday.name} o'chirilsinmi?`)) return;
        try {
          await request(`/holidays/${holiday.id}`, { method: 'DELETE' });
          this.toast('Bayram o\'chirildi', 'success');
          await this.loadSettings();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // --- Foydalanuvchilar ---
      openUserModal() {
        this.userForm = { username: '', fullName: '', password: '', roleId: 1, isActive: true };
        this.showUserModal = true;
      },

      async saveUser() {
        try {
          if (this.userForm.id) {
            const payload = Object.assign({}, this.userForm);
            if (!payload.password) delete payload.password;
            await request(`/users/${payload.id}`, { method: 'PUT', body: payload });
          } else {
            await request('/users', { method: 'POST', body: this.userForm });
          }
          this.showUserModal = false;
          this.toast('Foydalanuvchi saqlandi', 'success');
          await this.loadSettings();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Tarjima yordamchisi
      // -----------------------------------------------------------------
      t(key) {
        const dict = this.i18n[this.lang] || this.i18n.uz;
        return dict[key] || key;
      },

      setLang(lang) {
        this.lang = lang;
        localStorage.setItem('att_lang', lang);
        document.documentElement.lang = lang;
      },

      toggleTheme() {
        this.theme = this.theme === 'dark' ? 'light' : 'dark';
        localStorage.setItem('att_theme', this.theme);
        document.documentElement.setAttribute('data-theme', this.theme);
      },

      applyTheme() {
        document.documentElement.setAttribute('data-theme', this.theme);
        document.documentElement.lang = this.lang;
      },

      // -----------------------------------------------------------------
      //  Command palette (Ctrl+K)
      // -----------------------------------------------------------------
      get paletteCommands() {
        const cmds = [];
        this.visibleNav.forEach((n) => {
          cmds.push({ label: this.t(n.id), hint: 'bo\'lim', action: () => this.go(n.id) });
        });
        cmds.push({ label: 'Qayta hisobla', hint: 'tabel', action: () => this.go('attendance') });
        cmds.push({ label: 'Excel shablon (tabel)', hint: 'eksport', action: () => this.downloadTemplate() });
        cmds.push({ label: 'Excel shablon (xodimlar)', hint: 'eksport', action: () => this.downloadEmployeeTemplate() });
        cmds.push({ label: 'Parolni o\'zgartirish', hint: 'profil', action: () => (this.showPasswordModal = true) });
        cmds.push({ label: 'Chiqish', hint: 'sessiya', action: () => this.logout() });
        return cmds;
      },

      get paletteResults() {
        const q = this.paletteQuery.trim().toLowerCase();
        const all = this.paletteCommands;
        if (!q) return all.slice(0, 8);
        return all.filter((c) => c.label.toLowerCase().includes(q)).slice(0, 8);
      },

      runPaletteCommand(cmd) {
        this.paletteOpen = false;
        this.paletteQuery = '';
        if (cmd && cmd.action) cmd.action();
      },

      // -----------------------------------------------------------------
      //  Oylik davr (tasdiqlash / yopish)
      // -----------------------------------------------------------------
      async loadPeriods() {
        const res = await request('/periods');
        this.periods = res.data;
        const cur = await request(`/periods/${this.timesheetYear}/${this.timesheetMonth}`);
        this.currentPeriod = cur.data.period;
        this.periodStatus = cur.data.period.status;
      },

      async periodAction(action) {
        try {
          const res = await request(
            `/periods/${this.timesheetYear}/${this.timesheetMonth}/${action}`,
            { method: 'POST', body: {} }
          );
          this.toast(
            action === 'lock'
              ? `Davr yopildi: ${this.timesheetYear}-${this.timesheetMonth}`
              : `Davr holati: ${res.data.status || this.periodStatus}`,
            'success'
          );
          await this.loadPeriods();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Ta'til balansi
      // -----------------------------------------------------------------
      async loadBalances() {
        const res = await request('/balances');
        this.balances = res.data;
      },

      async saveBalance(data) {
        try {
          await request('/balances', { method: 'PUT', body: data });
          this.toast('Balans saqlandi', 'success');
          await this.loadBalances();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Overtime
      // -----------------------------------------------------------------
      async loadOvertime() {
        const res = await request(
          `/overtime?year=${this.timesheetYear}&month=${this.timesheetMonth}`
        );
        this.overtimeRows = res.data;
      },

      openOvertimeModal() {
        this.overtimeForm = {
          employeeId: this.employees[0] ? this.employees[0].id : '',
          date: todayStr(),
          minutes: 60,
          kind: 'regular',
          note: '',
        };
        this.showOvertimeModal = true;
      },

      async saveOvertime() {
        try {
          await request('/overtime', { method: 'POST', body: this.overtimeForm });
          this.showOvertimeModal = false;
          this.toast('Qo\'shimcha ish vaqti qo\'shildi', 'success');
          await this.loadOvertime();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Tasdiqlashga so'rovlar
      // -----------------------------------------------------------------
      async loadRequests() {
        const res = await request('/requests');
        this.requests = res.data;
      },

      async reviewRequest(id, status) {
        try {
          await request(`/requests/${id}/review`, {
            method: 'POST',
            body: { status, comment: '' },
          });
          this.toast(status === 'approved' ? 'Tasdiqlandi' : 'Rad etildi', 'success');
          await this.loadRequests();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Roziliklar
      // -----------------------------------------------------------------
      async loadConsents() {
        const res = await request('/consents');
        this.consents = res.data;
      },

      openConsentModal() {
        this.consentForm = {
          employeeId: this.employees[0] ? this.employees[0].id : '',
          kind: 'biometric',
          documentNo: '',
          expiresAt: '',
          note: '',
        };
        this.showConsentModal = true;
      },

      async saveConsent() {
        try {
          await request('/consents', { method: 'POST', body: this.consentForm });
          this.showConsentModal = false;
          this.toast('Rozilik qayd etildi', 'success');
          await this.loadConsents();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Hisobot konstruktori
      // -----------------------------------------------------------------
      async loadBuilder() {
        const [cols, templates] = await Promise.all([
          request('/report-builder/columns'),
          request('/report-builder/templates'),
        ]);
        this.builderColumns = cols.data;
        this.reportTemplates = templates.data;
        await this.runBuilder();
      },

      async runBuilder() {
        const params = new URLSearchParams();
        params.set('dateFrom', this.builderFilters.dateFrom);
        params.set('dateTo', this.builderFilters.dateTo);
        if (this.builderFilters.departmentId)
          params.set('departmentId', this.builderFilters.departmentId);
        if (this.builderFilters.status) params.set('status', this.builderFilters.status);
        params.set('columns', this.builderSelected.join(','));
        const res = await request(`/report-builder/data?${params.toString()}`);
        this.builderRows = res.data.rows;
        this.builderTotal = res.data.total;
      },

      toggleBuilderColumn(key) {
        const i = this.builderSelected.indexOf(key);
        if (i >= 0) this.builderSelected.splice(i, 1);
        else this.builderSelected.push(key);
      },

      async saveTemplate() {
        const name = prompt('Shablon nomi:');
        if (!name) return;
        try {
          await request('/report-builder/templates', {
            method: 'POST',
            body: {
              name,
              columns: this.builderSelected,
              filters: this.builderFilters,
            },
          });
          this.toast('Shablon saqlandi', 'success');
          await this.loadBuilder();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async applyTemplate(template) {
        this.builderSelected = [...(template.columns || [])];
        this.builderFilters = { ...this.builderFilters, ...(template.filters || {}) };
        await this.runBuilder();
        this.toast(`"${template.name}" shabloni qo'llandi`, 'success');
      },

      // -----------------------------------------------------------------
      //  Payroll
      // -----------------------------------------------------------------
      async loadPayroll() {
        const params = new URLSearchParams({
          year: String(this.timesheetYear),
          month: String(this.timesheetMonth),
          baseRate: String(this.payrollRates.baseRate || 0),
          overtimeRate: String(this.payrollRates.overtimeRate || 0),
          latePenaltyPerMinute: String(this.payrollRates.latePenaltyPerMinute || 0),
          absenceDeductionPerDay: String(this.payrollRates.absenceDeductionPerDay || 0),
        });
        const res = await request(`/payroll?${params.toString()}`);
        this.payroll = res.data;
      },

      // -----------------------------------------------------------------
      //  Xavfsizlik
      // -----------------------------------------------------------------
      async loadSecurity() {
        const [keys, verify] = await Promise.all([
          request('/security/api-keys').catch(() => ({ data: [] })),
          request('/security/audit/verify').catch(() => ({ data: null })),
        ]);
        this.apiKeys = keys.data || [];
        this.auditVerification = verify.data;
      },

      async setupTwoFactor() {
        try {
          const res = await request('/security/2fa/setup', { method: 'POST', body: {} });
          this.twoFactorSetup = res.data;
          this.toast('QR/secret yaratildi — kodni tasdiqlang', 'info');
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async enableTwoFactor() {
        const code = prompt('Autentifikator kodini kiriting:');
        if (!code) return;
        try {
          await request('/security/2fa/enable', { method: 'POST', body: { code } });
          this.twoFactorSetup = null;
          this.toast('2FA yoqildi', 'success');
          await this.loadSecurity();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async createApiKey() {
        const name = prompt('Kalit nomi:');
        if (!name) return;
        try {
          const res = await request('/security/api-keys', {
            method: 'POST',
            body: { name, scopes: [] },
          });
          this.newApiKey = res.data;
          this.showApiKeyModal = true;
          await this.loadSecurity();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      async revokeApiKey(id) {
        if (!confirm('Kalit bekor qilinsinmi?')) return;
        try {
          await request(`/security/api-keys/${id}`, { method: 'DELETE' });
          this.toast('Kalit bekor qilindi', 'success');
          await this.loadSecurity();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Xodimning o'z paneli
      // -----------------------------------------------------------------
      async loadMyProfile() {
        const res = await request('/my/profile');
        this.myProfile = res.data;
        const [bal, ot, reqs] = await Promise.all([
          request('/my/balances').catch(() => ({ data: [] })),
          request('/my/overtime').catch(() => ({ data: null })),
          request('/my/requests').catch(() => ({ data: [] })),
        ]);
        this.myBalances = bal.data || [];
        this.myOvertime = ot.data;
        this.myRequests = reqs.data || [];
      },

      async submitMyRequest() {
        try {
          await request('/my/requests', { method: 'POST', body: this.myRequestForm });
          this.toast('So\'rov yuborildi', 'success');
          this.myRequestForm = { date: todayStr(), requestedIn: '', requestedOut: '', reason: '' };
          await this.loadMyProfile();
        } catch (e) {
          this.toast(e.message, 'error');
        }
      },

      // -----------------------------------------------------------------
      //  Format yordamchilari (template uchun)
      // -----------------------------------------------------------------
      fmtDate,
      fmtTime,
      fmtDateTime,
      fmtHours,
      fmtAgo,
      STATUS_LABELS,
      STATUS_COLORS,
      ROLE_LABELS,
    };
  }

  // Alpine yuklanganda registratsiya qilish
  function register() {
    if (window.Alpine && typeof window.Alpine.data === 'function') {
      window.Alpine.data('app', appComponent);
    }
  }

  if (window.Alpine) {
    register();
  } else {
    document.addEventListener('alpine:init', register);
  }
})();
