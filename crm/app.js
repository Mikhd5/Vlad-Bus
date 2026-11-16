(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const el = {
    loginScreen: $('#login-screen'), appShell: $('#app-shell'), loginForm: $('#login-form'), loginError: $('#login-error'),
    loginSubmit: $('#login-submit'), nav: $('#side-nav'), viewContent: $('#view-content'), viewTitle: $('#view-title'),
    viewDescription: $('#view-description'), viewKicker: $('#view-kicker'), breadcrumb: $('#breadcrumb-title'),
    headingActions: $('#heading-actions'), configWarning: $('#config-warning'), modal: $('#modal-backdrop'),
    modalForm: $('#modal-form'), modalBody: $('#modal-body'), modalTitle: $('#modal-title'), modalKicker: $('#modal-kicker'),
    modalClose: $('#modal-close'), modalCancel: $('#modal-cancel'), modalSave: $('#modal-save'), toastRegion: $('#toast-region'),
    refresh: $('#refresh-btn'), logout: $('#logout-btn'), sidebar: $('#sidebar'), mobileMenu: $('#mobile-menu')
  };

  const viewMeta = {
    dashboard: ['Огляд', 'КОНТРОЛЬ БІЗНЕСУ', 'Ключові показники та останні події у вашій системі.'],
    bookings: ['Бронювання', 'КЛІЄНТИ ТА ЗАЯВКИ', 'Керуйте зверненнями з усіх каналів зв’язку.'],
    finances: ['Фінанси', 'ОПЛАТИ ТА НАДХОДЖЕННЯ', 'Облік оплат, залишків і фінансових операцій за бронюваннями.'],
    trips: ['Рейси', 'ПЛАНУВАННЯ ПОЇЗДОК', 'Створюйте рейси, призначайте транспорт і контролюйте вільні місця.'],
    routes: ['Маршрути', 'ГЕОГРАФІЯ ПЕРЕВЕЗЕНЬ', 'Керуйте напрямками, містами та базовою вартістю поїздок.'],
    customers: ['Клієнти', 'КЛІЄНТСЬКА БАЗА', 'Контактна інформація, історія та нотатки по пасажирах.'],
    vehicles: ['Транспорт', 'АВТОПАРК', 'Облік автобусів, мікроавтобусів і доступної кількості місць.'],
    drivers: ['Водії', 'КОМАНДА ПЕРЕВІЗНИКА', 'Контакти водіїв та інформація для планування рейсів.']
  };

  const state = {
    supabase: null, user: null, profile: null, view: 'dashboard',
    data: { bookings: [], routes: [], trips: [], customers: [], vehicles: [], drivers: [], payments: [] },
    loading: false, currentModal: null, demoMode: false
  };

  const statusText = {
    new: 'Нова', pending: 'Очікує підтвердження', confirmed: 'Підтверджена', paid: 'Оплачена',
    completed: 'Завершена', cancelled: 'Скасована', unpaid: 'Не оплачено', partial: 'Частково', refunded: 'Повернення',
    scheduled: 'Запланований', boarding: 'Посадка', in_progress: 'У дорозі', active: 'Активний',
    maintenance: 'На обслуговуванні', inactive: 'Неактивний'
  };
  const statusClass = {
    new: 'status-new', pending: 'status-pending', confirmed: 'status-confirmed', paid: 'status-paid',
    completed: 'status-completed', cancelled: 'status-cancelled', unpaid: 'status-unpaid', partial: 'status-partial',
    refunded: 'status-refunded', scheduled: 'status-new', boarding: 'status-pending', in_progress: 'status-paid',
    active: 'status-confirmed', maintenance: 'status-pending', inactive: 'status-cancelled'
  };

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }
  function money(value, currency = 'EUR') {
    if (value === null || value === undefined || value === '') return '—';
    return new Intl.NumberFormat('uk-UA', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value));
  }
  function moneyBreakdown(rows, amountKey, currencyKey = 'currency') {
    const totals = new Map();
    rows.forEach(row => {
      const currency = row[currencyKey] || 'EUR';
      totals.set(currency, (totals.get(currency) || 0) + Number(row[amountKey] || 0));
    });
    return [...totals.entries()].filter(([,total]) => total !== 0).map(([currency,total]) => money(total,currency)).join(' · ') || '—';
  }
  function date(value, withTime = false) {
    if (!value) return '—';
    const d = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? new Date(`${value}T12:00:00`) : new Date(value);
    if (Number.isNaN(d.getTime())) return esc(value);
    return new Intl.DateTimeFormat('uk-UA', withTime ? { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
  }
  function localDate(value) {
    if (!value) return '';
    const d = new Date(value);
    const offset = d.getTimezoneOffset();
    return new Date(d.getTime() - offset * 60000).toISOString().slice(0, 16);
  }
  function pill(value) {
    return `<span class="status-pill ${statusClass[value] || 'status-completed'}">${esc(statusText[value] || value || '—')}</span>`;
  }
  function toast(message, type = 'success') {
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    el.toastRegion.appendChild(node);
    window.setTimeout(() => node.remove(), 3600);
  }
  function initials(name) {
    return String(name || 'UA').trim().split(/\s+/).slice(0, 2).map(part => part[0] || '').join('').toUpperCase();
  }
  function isAdmin() { return state.profile?.role === 'admin'; }
  function field(label, name, value = '', type = 'text', opts = {}) {
    const full = opts.full ? ' full-width' : '';
    const required = opts.required === false ? '' : ' required';
    let control;
    if (opts.options) {
      control = `<select name="${esc(name)}"${required}${opts.disabled ? ' disabled' : ''}>${opts.options.map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (type === 'textarea') {
      control = `<textarea name="${esc(name)}" placeholder="${esc(opts.placeholder || '')}"${required}>${esc(value)}</textarea>`;
    } else {
      control = `<input type="${esc(type)}" name="${esc(name)}" value="${esc(value)}" placeholder="${esc(opts.placeholder || '')}" ${opts.min !== undefined ? `min="${esc(opts.min)}"` : ''} ${opts.step !== undefined ? `step="${esc(opts.step)}"` : ''}${required}>`;
    }
    return `<label class="form-field${full}"><span>${esc(label)}</span>${control}${opts.hint ? `<small class="field-hint">${esc(opts.hint)}</small>` : ''}</label>`;
  }
  function options(items, getValue, getLabel, emptyLabel = 'Оберіть значення') {
    return [{ value: '', label: emptyLabel }, ...items.map(item => ({ value: getValue(item), label: getLabel(item) }))];
  }
  function routeName(route) { return route ? `${route.from_city} → ${route.to_city}` : 'Маршрут не прив’язаний'; }
  function getRoute(id) { return state.data.routes.find(x => x.id === id); }
  function getVehicle(id) { return state.data.vehicles.find(x => x.id === id); }
  function getDriver(id) { return state.data.drivers.find(x => x.id === id); }

  async function boot() {
    $('#login-year').textContent = new Date().getFullYear();
    $('#topbar-date').textContent = new Intl.DateTimeFormat('uk-UA', { weekday: 'short', day: 'numeric', month: 'long' }).format(new Date());
    el.configWarning.classList.add('is-hidden');
    el.loginSubmit.disabled = false;

    // The test account is available locally so the interface can be reviewed
    // without a server connection. A configured Supabase instance enables
    // shared team accounts for a production deployment.
    if (window.location.protocol === 'file:') return;

    try {
      const configResponse = await fetch('/api/config', { headers: { Accept: 'application/json' } });
      if (!configResponse.ok) throw new Error(`HTTP ${configResponse.status}`);
      const config = await configResponse.json();
      if (config.configured && window.supabase?.createClient) {
        state.supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
        });
        const { data: sessionData, error } = await state.supabase.auth.getSession();
        if (error) throw error;
        if (sessionData.session) await enterApp(sessionData.session.user);
        state.supabase.auth.onAuthStateChange((_event, session) => {
          if (session?.user && !state.user && !state.demoMode) window.setTimeout(() => { if (!state.user) enterApp(session.user); }, 0);
          if (!session && state.user && !state.demoMode) showLogin();
        });
      } else {
        // Local test access remains available even when the shared database is not configured.
      }
    } catch (error) {
      // Keep the test workspace usable when the project is opened locally.
    }
  }

  function showLogin() {
    state.user = null; state.profile = null; state.demoMode = false;
    $('.system-live').innerHTML = '<i></i> Система активна';
    el.configWarning.classList.add('is-hidden');
    el.loginScreen.classList.remove('is-hidden');
    el.appShell.classList.add('is-hidden');
    el.loginSubmit.disabled = false;
  }

  function enterDemoMode() {
    state.demoMode = true;
    state.user = { id: 'demo-user', email: 'test' };
    state.profile = { id: 'demo-user', full_name: 'Адміністратор', role: 'admin', active: true };
    $('#user-name').textContent = 'Адміністратор';
    $('#user-role').textContent = 'Тестовий доступ';
    $('#user-avatar').textContent = 'А';
    $('.system-live').innerHTML = '<i></i> Локальний режим';
    el.configWarning.innerHTML = '<b>Режим перегляду.</b> Записи зберігаються в цьому браузері на цьому пристрої. Для спільної роботи команди використовується серверна база даних.';
    el.configWarning.classList.remove('is-hidden');
    el.loginError.textContent = '';
    el.loginScreen.classList.add('is-hidden');
    el.appShell.classList.remove('is-hidden');
    loadAll().then(() => changeView('dashboard')).catch(() => changeView('dashboard'));
  }

  async function enterApp(user) {
    state.user = user;
    el.loginError.textContent = '';
    try {
      const { data: profile, error } = await state.supabase.from('profiles').select('*').eq('id', user.id).single();
      if (error || !profile || !profile.active) {
        await state.supabase.auth.signOut();
        el.loginError.textContent = 'Для цього облікового запису ще не створено активний профіль CRM. Адміністратор має додати профіль у таблицю profiles.';
        showLogin();
        return;
      }
      state.profile = profile;
      $('.system-live').innerHTML = '<i></i> Система активна';
      el.configWarning.classList.add('is-hidden');
      $('#user-name').textContent = profile.full_name || user.email;
      $('#user-role').textContent = profile.role === 'admin' ? 'Адміністратор' : 'Менеджер';
      $('#user-avatar').textContent = initials(profile.full_name || user.email);
      el.loginScreen.classList.add('is-hidden');
      el.appShell.classList.remove('is-hidden');
      await loadAll();
      changeView('dashboard');
    } catch (error) {
      toast(`Помилка доступу: ${error.message}`, 'error');
      showLogin();
    }
  }

  const DEMO_STORAGE_KEY = 'ua-eu-crm-demo-v1';
  let demoMemoryCache = null;
  const dayKey = (offset = 0) => { const d = new Date(); d.setDate(d.getDate() + offset); return d.toISOString().slice(0, 10); };
  const dateTimeKey = (offset = 0, hour = 9) => { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(hour, 0, 0, 0); return d.toISOString(); };
  function seedDemoData() {
    const routes = [
      { id:'demo-route-1', country:'Німеччина', from_city:'Київ', to_city:'Берлін', default_price:150, currency:'EUR', duration_text:'24–28 годин', active:true, notes:'' },
      { id:'demo-route-2', country:'Польща', from_city:'Львів', to_city:'Варшава', default_price:55, currency:'EUR', duration_text:'8–10 годин', active:true, notes:'' },
      { id:'demo-route-3', country:'Чехія', from_city:'Київ', to_city:'Прага', default_price:130, currency:'EUR', duration_text:'22–26 годин', active:true, notes:'' },
      { id:'demo-route-4', country:'Нідерланди', from_city:'Київ', to_city:'Амстердам', default_price:170, currency:'EUR', duration_text:'30–34 години', active:true, notes:'' }
    ];
    const vehicles = [
      { id:'demo-vehicle-1', name:'Mercedes-Benz Sprinter', vehicle_type:'Мікроавтобус', registration_number:'AA 0001 UE', seats:8, status:'active', notes:'' },
      { id:'demo-vehicle-2', name:'Touring Coach', vehicle_type:'Автобус', registration_number:'AA 0050 UE', seats:50, status:'active', notes:'' }
    ];
    const drivers = [
      { id:'demo-driver-1', full_name:'Олександр Коваленко', phone:'+380 97 000 00 01', license_number:'DEMO-001', status:'active', notes:'' },
      { id:'demo-driver-2', full_name:'Андрій Мельник', phone:'+380 63 000 00 02', license_number:'DEMO-002', status:'active', notes:'' }
    ];
    const trips = [
      { id:'demo-trip-1', route_id:routes[0].id, departure_at:dateTimeKey(2,18), vehicle_id:vehicles[1].id, driver_id:drivers[0].id, seats_total:50, seats_available:34, price:150, currency:'EUR', status:'scheduled', notes:'' },
      { id:'demo-trip-2', route_id:routes[1].id, departure_at:dateTimeKey(3,7), vehicle_id:vehicles[0].id, driver_id:drivers[1].id, seats_total:8, seats_available:3, price:55, currency:'EUR', status:'scheduled', notes:'' },
      { id:'demo-trip-3', route_id:routes[2].id, departure_at:dateTimeKey(5,16), vehicle_id:vehicles[1].id, driver_id:drivers[0].id, seats_total:50, seats_available:41, price:130, currency:'EUR', status:'boarding', notes:'' }
    ];
    const customers = [
      { id:'demo-customer-1', full_name:'Ірина Шевченко', phone:'+380 97 111 22 33', phone_normalized:'+380971112233', email:'iryna@example.com', notes:'' },
      { id:'demo-customer-2', full_name:'Максим Бондар', phone:'+380 63 222 33 44', phone_normalized:'+380632223344', email:'maksym@example.com', notes:'' },
      { id:'demo-customer-3', full_name:'Наталія Кравець', phone:'+380 50 333 44 55', phone_normalized:'+380503334455', email:'', notes:'' }
    ];
    const bookings = [
      { id:'demo-booking-1', booking_number:'UA-26001', customer_id:customers[0].id, customer_name:customers[0].full_name, customer_phone:customers[0].phone, country:'Німеччина', from_city:'Київ', to_city:'Берлін', travel_date:dayKey(2), preferred_time:'18:00', passengers:2, status:'confirmed', payment_status:'partial', price_total:300, paid_amount:100, currency:'EUR', trip_id:trips[0].id, source:'website', notes:'Заявка з онлайн-форми', created_at:dateTimeKey(-1,11) },
      { id:'demo-booking-2', booking_number:'UA-26002', customer_id:customers[1].id, customer_name:customers[1].full_name, customer_phone:customers[1].phone, country:'Польща', from_city:'Львів', to_city:'Варшава', travel_date:dayKey(3), preferred_time:'07:00', passengers:1, status:'new', payment_status:'unpaid', price_total:55, paid_amount:0, currency:'EUR', trip_id:null, source:'website', notes:'Потрібно підтвердити час', created_at:dateTimeKey(0,8) },
      { id:'demo-booking-3', booking_number:'UA-26003', customer_id:customers[2].id, customer_name:customers[2].full_name, customer_phone:customers[2].phone, country:'Чехія', from_city:'Київ', to_city:'Прага', travel_date:dayKey(5), preferred_time:'16:00', passengers:3, status:'pending', payment_status:'paid', price_total:390, paid_amount:390, currency:'EUR', trip_id:trips[2].id, source:'manual', notes:'Бронювання телефоном', created_at:dateTimeKey(-2,15) },
      { id:'demo-booking-4', booking_number:'UA-26004', customer_id:customers[0].id, customer_name:customers[0].full_name, customer_phone:customers[0].phone, country:'Німеччина', from_city:'Берлін', to_city:'Київ', travel_date:dayKey(9), preferred_time:'10:00', passengers:1, status:'completed', payment_status:'paid', price_total:150, paid_amount:150, currency:'EUR', trip_id:null, source:'phone', notes:'Зворотна поїздка', created_at:dateTimeKey(-7,12) }
    ];
    const payments = [
      { id:'demo-payment-1', booking_id:bookings[0].id, amount:100, currency:'EUR', method:'bank_transfer', payment_date:dateTimeKey(-1,12), reference:'DEMO-TRX-001', notes:'Передоплата', created_at:dateTimeKey(-1,12) },
      { id:'demo-payment-2', booking_id:bookings[2].id, amount:390, currency:'EUR', method:'card', payment_date:dateTimeKey(0,9), reference:'DEMO-TRX-002', notes:'Повна оплата', created_at:dateTimeKey(0,9) },
      { id:'demo-payment-3', booking_id:bookings[3].id, amount:150, currency:'EUR', method:'cash', payment_date:dateTimeKey(-6,10), reference:'', notes:'Готівка', created_at:dateTimeKey(-6,10) }
    ];
    return { bookings, routes, trips, customers, vehicles, drivers, payments };
  }
  function readDemoData() {
    try {
      const stored = JSON.parse(window.localStorage.getItem(DEMO_STORAGE_KEY) || 'null');
      if (stored && Array.isArray(stored.bookings)) { demoMemoryCache = stored; return stored; }
    } catch (_) { /* file:// or browser privacy settings may disable localStorage */ }
    if (demoMemoryCache && Array.isArray(demoMemoryCache.bookings)) return demoMemoryCache;
    const seeded = seedDemoData();
    demoMemoryCache = seeded;
    try { window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(seeded)); } catch (_) { /* in-memory demo fallback */ }
    return seeded;
  }
  function writeDemoData() {
    demoMemoryCache = state.data;
    try { window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state.data)); } catch (_) { /* changes remain for this page session */ }
  }
  function demoUpsert(collection, payload, id) {
    const rows = state.data[collection];
    const existing = id ? rows.find(row => row.id === id) : null;
    if (existing) Object.assign(existing, payload, { updated_at: new Date().toISOString() });
    else rows.unshift({ id: `demo-${collection.slice(0,-1)}-${Date.now()}`, created_at: new Date().toISOString(), ...payload });
    writeDemoData();
  }

  async function loadAll() {
    if (state.demoMode) {
      state.data = readDemoData();
      $('#new-bookings-count').textContent = state.data.bookings.filter(x => x.status === 'new' || x.status === 'pending').length;
      state.loading = false;
      return;
    }
    state.loading = true;
    el.viewContent.innerHTML = '<div class="loading-state"><span class="spinner"></span> Синхронізація даних…</div>';
    const tables = ['bookings', 'routes', 'trips', 'customers', 'vehicles', 'drivers', 'payments'];
    try {
      const responses = await Promise.all(tables.map(table => state.supabase.from(table).select('*').order('created_at', { ascending: false }).limit(1000)));
      for (let i = 0; i < tables.length; i++) {
        if (responses[i].error) throw new Error(`${tables[i]}: ${responses[i].error.message}`);
        state.data[tables[i]] = responses[i].data || [];
      }
      $('#new-bookings-count').textContent = state.data.bookings.filter(x => x.status === 'new' || x.status === 'pending').length;
    } catch (error) {
      toast(`Не вдалося завантажити дані: ${error.message}`, 'error');
      el.viewContent.innerHTML = `<div class="empty-state">Не вдалося завантажити дані. Перевірте SQL-схему та політики доступу.<br><br>${esc(error.message)}</div>`;
      throw error;
    } finally { state.loading = false; }
  }

  function changeView(view) {
    if (!viewMeta[view]) return;
    state.view = view;
    const [title, kicker, description] = viewMeta[view];
    el.viewTitle.textContent = title;
    el.viewKicker.textContent = kicker;
    el.viewDescription.textContent = description;
    el.breadcrumb.textContent = title;
    $$('.nav-item', el.nav).forEach(btn => btn.classList.toggle('is-active', btn.dataset.view === view));
    el.sidebar.classList.remove('is-open');
    renderView();
  }

  function setHeadingActions(html) { el.headingActions.innerHTML = html || ''; }
  function renderView() {
    if (state.view === 'dashboard') return renderDashboard();
    if (state.view === 'bookings') return renderBookings();
    if (state.view === 'finances') return renderFinances();
    if (state.view === 'trips') return renderTrips();
    if (state.view === 'routes') return renderRoutes();
    if (state.view === 'customers') return renderCustomers();
    if (state.view === 'vehicles') return renderVehicles();
    if (state.view === 'drivers') return renderDrivers();
  }

  function renderDashboard() {
    setHeadingActions('<button class="primary-btn" data-add="booking">＋ Нова заявка <span>→</span></button>');
    const bookings = state.data.bookings;
    const today = new Date().toISOString().slice(0, 10);
    const month = today.slice(0, 7);
    const newCount = bookings.filter(b => ['new', 'pending'].includes(b.status)).length;
    const todayCount = bookings.filter(b => b.travel_date === today).length;
    const upcoming = state.data.trips.filter(t => new Date(t.departure_at) >= new Date() && t.status !== 'cancelled').sort((a,b) => new Date(a.departure_at)-new Date(b.departure_at));
    const paidTotal = moneyBreakdown(state.data.payments.filter(p => String(p.payment_date || p.created_at || '').startsWith(month)), 'amount');
    const recent = bookings.slice().sort((a,b) => new Date(b.created_at)-new Date(a.created_at)).slice(0,7);
    const weekBars = Array.from({length:7},(_,i)=>{
      const d=new Date(); d.setDate(d.getDate()-(6-i)); const key=d.toISOString().slice(0,10);
      return {label:new Intl.DateTimeFormat('uk-UA',{weekday:'short'}).format(d),value:bookings.filter(b=>String(b.created_at||'').slice(0,10)===key).length};
    });
    const max = Math.max(1,...weekBars.map(x=>x.value));
    const routes = state.data.routes.filter(r=>r.active).slice(0,5);
    el.viewContent.innerHTML = `
      <div class="stats-grid">
        <article class="stat-card"><div class="stat-top"><span class="stat-label">Усього бронювань</span><span class="stat-icon">▤</span></div><div class="stat-value">${bookings.length}</div><div class="stat-foot">Усі заявки в системі</div></article>
        <article class="stat-card"><div class="stat-top"><span class="stat-label">Потребують уваги</span><span class="stat-icon">◷</span></div><div class="stat-value">${newCount}</div><div class="stat-foot">Нові та очікують підтвердження</div></article>
        <article class="stat-card"><div class="stat-top"><span class="stat-label">Поїздки сьогодні</span><span class="stat-icon">↗</span></div><div class="stat-value">${todayCount}</div><div class="stat-foot">Заявки на сьогодні</div></article>
        <article class="stat-card"><div class="stat-top"><span class="stat-label">Отримано цього місяця</span><span class="stat-icon">¤</span></div><div class="stat-value stat-value--small">${esc(paidTotal)}</div><div class="stat-foot">За внесеними оплатами</div></article>
      </div>
      <div class="dashboard-grid">
        <div class="panel"><div class="panel-head"><div><h3>Останні заявки</h3><p>Останні звернення з усіх каналів</p></div><button class="text-btn" data-go="bookings">Усі бронювання →</button></div>
          ${recent.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>НОМЕР / КЛІЄНТ</th><th>МАРШРУТ</th><th>ДАТА</th><th>СТАТУС</th><th></th></tr></thead><tbody>${recent.map(b=>`<tr><td><span class="primary-cell">${esc(b.booking_number)}</span><span class="sub-cell">${esc(b.customer_name)}</span></td><td>${esc(b.from_city)} → ${esc(b.to_city)}</td><td>${date(b.travel_date)}</td><td>${pill(b.status)}</td><td><button class="row-action" data-edit="booking" data-id="${b.id}">Відкрити</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="muted-empty">Заявок поки немає. Створіть першу заявку, щоб почати вести облік поїздок.</div>'}</div>
        <div class="panel"><div class="panel-head"><div><h3>Швидкі дії</h3><p>Основні інструменти менеджера</p></div></div><div class="quick-actions">
          <button class="quick-action" data-add="booking"><span>＋</span> Створити заявку</button><button class="quick-action" data-add="trip"><span>↗</span> Додати рейс</button><button class="quick-action" data-add="route"><span>⌖</span> Новий маршрут</button><button class="quick-action" data-go="customers"><span>♙</span> База клієнтів</button><button class="quick-action" data-go="finances"><span>¤</span> Фінанси</button>
        </div><div class="panel-head"><div><h3>Активні напрямки</h3><p>Маршрути, доступні в CRM</p></div><button class="text-btn" data-go="routes">Керувати →</button></div><div class="route-snapshot">${routes.length ? routes.map(r=>`<div class="route-line"><div><b>${esc(r.from_city)} → ${esc(r.to_city)}</b><small>${esc(r.country)}</small></div><strong>${r.default_price ? money(r.default_price,r.currency) : 'Ціну не задано'}</strong></div>`).join('') : '<div class="muted-empty">Додайте реальні маршрути компанії.</div>'}</div></div>
      </div>
      <div class="panel chart-card" style="margin-top:15px"><div class="panel-head" style="padding:0 0 10px;border:0"><div><h3>Активність заявок</h3><p>Кількість нових заявок за останні 7 днів</p></div></div><div class="bars">${weekBars.map(x=>`<div class="bar-group"><div class="bar-track"><div class="bar-fill" style="height:${Math.max(3,x.value/max*100)}%"></div></div><small>${esc(x.label)}</small></div>`).join('')}</div><div class="chart-note">Показники розраховуються за заявками у робочому просторі.</div></div>`;
  }

  function listToolbar(searchPlaceholder, filterHtml, actionsHtml) {
    return `<div class="toolbar"><div class="toolbar-left"><label class="search-box"><input type="search" id="table-search" placeholder="${esc(searchPlaceholder)}"></label>${filterHtml || ''}</div><div class="toolbar-right">${actionsHtml || ''}</div></div>`;
  }
  function tablePanel(headers, rows, foot) {
    const content = rows || `<tr><td colspan="${headers.length}"><div class="muted-empty">Записів поки немає. Додайте перший запис, щоб наповнити робочий простір.</div></td></tr>`;
    return `<div class="panel table-panel"><div class="table-wrap"><table class="data-table"><thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead><tbody>${content}</tbody></table></div><div class="table-footer"><span>${foot || ''}</span><span>${state.demoMode ? 'Локальні дані цього пристрою' : 'Збережено в CRM'}</span></div></div>`;
  }
  function renderBookings() {
    setHeadingActions(`<button class="ghost-btn" data-export="bookings">↓ Експорт CSV</button><button class="primary-btn" data-add="booking">＋ Нова заявка <span>→</span></button>`);
    const rows = state.data.bookings.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(b=>{
      const search = `${b.booking_number} ${b.customer_name} ${b.customer_phone} ${b.from_city} ${b.to_city} ${b.country}`.toLowerCase();
      return `<tr data-search="${esc(search)}"><td><span class="primary-cell">${esc(b.booking_number)}</span><span class="sub-cell">${date(b.created_at,true)}</span></td><td><span class="primary-cell">${esc(b.customer_name)}</span><span class="sub-cell">${esc(b.customer_phone)}</span></td><td>${esc(b.from_city)} <span class="muted">→</span> ${esc(b.to_city)}<span class="sub-cell">${esc(b.country)}</span></td><td>${date(b.travel_date)}<span class="sub-cell">${esc(b.preferred_time || 'Час не вказано')}${b.trip_id ? ' · Рейс призначено' : ' · Без рейсу'}</span></td><td>${esc(b.passengers)} ос.</td><td>${pill(b.status)}</td><td>${b.price_total ? money(b.price_total,b.currency) : '—'}<span class="sub-cell">Оплачено: ${money(b.paid_amount,b.currency)}</span></td><td><button class="row-action" data-edit="booking" data-id="${b.id}">Керувати</button></td></tr>`;
    }).join('');
    el.viewContent.innerHTML = listToolbar('Пошук за клієнтом, телефоном або маршрутом', `<select class="filter-select" id="status-filter"><option value="">Усі статуси</option>${['new','pending','confirmed','paid','completed','cancelled'].map(s=>`<option value="${s}">${statusText[s]}</option>`).join('')}</select>`, '') + tablePanel(['НОМЕР','КЛІЄНТ','МАРШРУТ','ДАТА ПОЇЗДКИ','ПАСАЖИРИ','СТАТУС','СУМА','ДІЇ'], rows, `Усього заявок: ${state.data.bookings.length}`);
    wireTableFilters();
  }

  function renderFinances() {
    setHeadingActions('<button class="primary-btn" data-add="payment">＋ Зареєструвати оплату <span>→</span></button>');
    const month = new Date().toISOString().slice(0, 7);
    const monthPayments = state.data.payments.filter(p => String(p.payment_date || p.created_at).slice(0, 7) === month);
    const received = moneyBreakdown(monthPayments, 'amount');
    const outstandingRows = state.data.bookings.filter(b=>b.price_total!==null&&b.price_total!==undefined).map(b=>({...b,remaining:Math.max(0,Number(b.price_total||0)-Number(b.paid_amount||0))}));
    const outstanding = moneyBreakdown(outstandingRows, 'remaining');
    const latest = state.data.payments.slice().sort((a,b)=>new Date(b.payment_date||b.created_at)-new Date(a.payment_date||a.created_at));
    const rows = latest.map(p=>{
      const booking=state.data.bookings.find(b=>b.id===p.booking_id);
      return `<tr data-search="${esc(`${booking?.booking_number||''} ${booking?.customer_name||''} ${p.method||''} ${p.reference||''}`.toLowerCase())}"><td><span class="primary-cell">${esc(booking?.booking_number||'Бронювання видалено')}</span><span class="sub-cell">${esc(booking?.customer_name||'')}</span></td><td>${date(p.payment_date||p.created_at,true)}</td><td>${esc(({cash:'Готівка',bank_transfer:'Банківський переказ',card:'Картка',other:'Інше'})[p.method]||p.method||'—')}</td><td>${esc(p.reference||'—')}</td><td><span class="primary-cell">${money(p.amount,p.currency)}</span></td><td>${esc(p.notes||'—')}</td></tr>`;
    }).join('');
    el.viewContent.innerHTML = `<div class="stats-grid">
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Надходження цього місяця</span><span class="stat-icon">¤</span></div><div class="stat-value stat-value--small">${esc(received)}</div><div class="stat-foot">За записами фінансового журналу</div></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Кількість оплат</span><span class="stat-icon">▤</span></div><div class="stat-value">${monthPayments.length}</div><div class="stat-foot">Операції поточного місяця</div></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Очікує оплати</span><span class="stat-icon">◷</span></div><div class="stat-value stat-value--small">${esc(outstanding)}</div><div class="stat-foot">Залишок за бронюваннями з указаною ціною</div></article>
      <article class="stat-card"><div class="stat-top"><span class="stat-label">Усього оплат</span><span class="stat-icon">✓</span></div><div class="stat-value">${state.data.payments.length}</div><div class="stat-foot">Всі внесені транзакції</div></article>
    </div>` + listToolbar('Пошук за номером бронювання, клієнтом або методом','', '') + tablePanel(['БРОНЮВАННЯ / КЛІЄНТ','ДАТА ОПЛАТИ','МЕТОД','РЕКВІЗИТ / НОМЕР','СУМА','ПРИМІТКА'],rows,`Фінансових операцій: ${state.data.payments.length}`);
    wireTableFilters();
  }

  function renderRoutes() {
    setHeadingActions('<button class="primary-btn" data-add="route">＋ Додати маршрут <span>→</span></button>');
    const rows=state.data.routes.slice().sort((a,b)=>a.country.localeCompare(b.country,'uk')).map(r=>`<tr data-search="${esc(`${r.country} ${r.from_city} ${r.to_city}`.toLowerCase())}"><td><span class="primary-cell">${esc(r.from_city)} → ${esc(r.to_city)}</span><span class="sub-cell">${esc(r.country)}</span></td><td>${r.default_price ? money(r.default_price,r.currency) : 'Не задано'}</td><td>${esc(r.duration_text || '—')}</td><td>${r.active ? pill('active') : pill('inactive')}</td><td><button class="row-action" data-edit="route" data-id="${r.id}">Редагувати</button> ${isAdmin()?`<button class="row-action" data-delete="route" data-id="${r.id}">Видалити</button>`:''}</td></tr>`).join('');
    el.viewContent.innerHTML=listToolbar('Пошук за країною або містом','', '')+tablePanel(['МАРШРУТ','БАЗОВА ЦІНА','ТРИВАЛІСТЬ','СТАТУС','ДІЇ'],rows,`Маршрутів: ${state.data.routes.length}`);
    wireTableFilters();
  }

  function renderTrips() {
    setHeadingActions('<button class="primary-btn" data-add="trip">＋ Створити рейс <span>→</span></button>');
    const rows=state.data.trips.slice().sort((a,b)=>new Date(a.departure_at)-new Date(b.departure_at)).map(t=>{
      const r=getRoute(t.route_id),v=getVehicle(t.vehicle_id),d=getDriver(t.driver_id);
      return `<tr data-search="${esc(`${routeName(r)} ${v?.name||''} ${d?.full_name||''}`.toLowerCase())}"><td><span class="primary-cell">${date(t.departure_at,true)}</span><span class="sub-cell">${esc(r?.country||'Маршрут не вказано')}</span></td><td><span class="primary-cell">${esc(r?routeName(r):'Маршрут не задано')}</span></td><td>${esc(v?.name||'Не призначено')}<span class="sub-cell">${esc(v?.registration_number||'')}</span></td><td>${esc(d?.full_name||'Не призначено')}</td><td>${t.seats_available} / ${t.seats_total}</td><td>${t.price ? money(t.price,t.currency) : '—'}</td><td>${pill(t.status)}</td><td><button class="row-action" data-edit="trip" data-id="${t.id}">Редагувати</button> ${isAdmin()?`<button class="row-action" data-delete="trip" data-id="${t.id}">Видалити</button>`:''}</td></tr>`;
    }).join('');
    el.viewContent.innerHTML=listToolbar('Пошук за маршрутом, транспортом або водієм','', '')+tablePanel(['ВІДПРАВЛЕННЯ','МАРШРУТ','ТРАНСПОРТ','ВОДІЙ','МІСЦЯ','ЦІНА','СТАТУС','ДІЇ'],rows,`Рейсів у системі: ${state.data.trips.length}`);
    wireTableFilters();
  }

  function renderCustomers() {
    setHeadingActions('<button class="primary-btn" data-add="customer">＋ Додати клієнта <span>→</span></button>');
    const rows=state.data.customers.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).map(c=>{
      const count=state.data.bookings.filter(b=>b.customer_id===c.id).length;
      return `<tr data-search="${esc(`${c.full_name} ${c.phone} ${c.email||''}`.toLowerCase())}"><td><span class="primary-cell">${esc(c.full_name)}</span><span class="sub-cell">Клієнт з ${date(c.created_at)}</span></td><td>${esc(c.phone)}</td><td>${esc(c.email||'—')}</td><td>${count}</td><td><span class="sub-cell">${esc(c.notes||'Нотаток немає')}</span></td><td><button class="row-action" data-edit="customer" data-id="${c.id}">Відкрити</button></td></tr>`;
    }).join('');
    el.viewContent.innerHTML=listToolbar('Пошук за ім’ям, телефоном або email','', '')+tablePanel(['КЛІЄНТ','ТЕЛЕФОН','EMAIL','БРОНЮВАНЬ','НОТАТКИ','ДІЇ'],rows,`Клієнтів у базі: ${state.data.customers.length}`);
    wireTableFilters();
  }

  function renderVehicles() {
    setHeadingActions('<button class="primary-btn" data-add="vehicle">＋ Додати транспорт <span>→</span></button>');
    const rows=state.data.vehicles.slice().map(v=>`<tr data-search="${esc(`${v.name} ${v.vehicle_type} ${v.registration_number||''}`.toLowerCase())}"><td><span class="primary-cell">${esc(v.name)}</span><span class="sub-cell">${esc(v.registration_number||'Номер не вказано')}</span></td><td>${esc(v.vehicle_type)}</td><td>${v.seats}</td><td>${pill(v.status)}</td><td><button class="row-action" data-edit="vehicle" data-id="${v.id}">Редагувати</button> ${isAdmin()?`<button class="row-action" data-delete="vehicle" data-id="${v.id}">Видалити</button>`:''}</td></tr>`).join('');
    el.viewContent.innerHTML=listToolbar('Пошук за моделлю або номером','', '')+tablePanel(['НАЗВА / НОМЕР','ТИП','МІСЦЬ','СТАТУС','ДІЇ'],rows,`Одиниць транспорту: ${state.data.vehicles.length}`);
    wireTableFilters();
  }

  function renderDrivers() {
    setHeadingActions('<button class="primary-btn" data-add="driver">＋ Додати водія <span>→</span></button>');
    const rows=state.data.drivers.slice().map(d=>`<tr data-search="${esc(`${d.full_name} ${d.phone||''} ${d.license_number||''}`.toLowerCase())}"><td><span class="primary-cell">${esc(d.full_name)}</span><span class="sub-cell">Посвідчення: ${esc(d.license_number||'—')}</span></td><td>${esc(d.phone||'—')}</td><td>${pill(d.status)}</td><td><button class="row-action" data-edit="driver" data-id="${d.id}">Редагувати</button> ${isAdmin()?`<button class="row-action" data-delete="driver" data-id="${d.id}">Видалити</button>`:''}</td></tr>`).join('');
    el.viewContent.innerHTML=listToolbar('Пошук за ім’ям або телефоном','', '')+tablePanel(['ВОДІЙ','ТЕЛЕФОН','СТАТУС','ДІЇ'],rows,`Водіїв у базі: ${state.data.drivers.length}`);
    wireTableFilters();
  }

  function wireTableFilters() {
    const search=$('#table-search');
    const filter=$('#status-filter');
    const apply=()=>{
      const q=(search?.value||'').toLowerCase().trim();
      const status=filter?.value||'';
      $$('.data-table tbody tr').forEach(row=>{
        const matchesText=!q||(row.dataset.search||row.textContent.toLowerCase()).includes(q);
        const statusCell=row.children[5];
        const matchesStatus=!status||statusCell?.textContent.includes(statusText[status]);
        row.style.display=matchesText&&matchesStatus?'':'none';
      });
    };
    search?.addEventListener('input',apply);
    filter?.addEventListener('change',apply);
  }

  function openModal(kind, item = null) {
    const data=item||{};
    state.currentModal={kind,id:data.id||null};
    el.modalForm.dataset.kind=kind;
    el.modalForm.dataset.id=data.id||'';
    const titles={booking:data.id?'Редагувати бронювання':'Нова заявка',payment:'Реєстрація оплати',route:data.id?'Редагувати маршрут':'Новий маршрут',trip:data.id?'Редагувати рейс':'Новий рейс',customer:data.id?'Картка клієнта':'Новий клієнт',vehicle:data.id?'Редагувати транспорт':'Нова одиниця транспорту',driver:data.id?'Редагувати водія':'Новий водій'};
    el.modalKicker.textContent={booking:'ЗАЯВКИ ТА ПАСАЖИРИ',payment:'ФІНАНСОВИЙ ОБЛІК',route:'НАПРЯМКИ',trip:'РОЗКЛАД ТА МІСЦЯ',customer:'КЛІЄНТСЬКА БАЗА',vehicle:'АВТОПАРК',driver:'КОМАНДА'}[kind]||'КЕРУВАННЯ';
    el.modalTitle.textContent=titles[kind]||'Редагування';
    el.modalSave.textContent=data.id?'Зберегти зміни':'Створити';
    el.modalSave.disabled=false;
    let html='';
    if(kind==='booking'){
      html=field('Ім’я клієнта','customer_name',data.customer_name||'')+
        field('Номер телефону','customer_phone',data.customer_phone||'','tel')+
        field('Країна / напрямок','country',data.country||'')+
        field('Місто відправлення','from_city',data.from_city||'')+
        field('Місто прибуття','to_city',data.to_city||'')+
        field('Дата поїздки','travel_date',data.travel_date||new Date().toISOString().slice(0,10),'date')+
        field('Бажаний час','preferred_time',data.preferred_time||'Не має значення','text',{required:false})+
        field('Кількість пасажирів','passengers',data.passengers||1,'number',{min:1,step:1})+
        field('Призначити рейс','trip_id',data.trip_id||'','text',{required:false,options:options(state.data.trips.filter(t=>t.id===data.trip_id||(['scheduled','boarding'].includes(t.status)&&t.seats_available>0)),x=>x.id,x=>{const r=getRoute(x.route_id);return `${r?routeName(r):'Маршрут'} · ${date(x.departure_at,true)} · ${x.seats_available} місць`},'Без призначення')})+
        field('Статус заявки','status',data.status||'new','text',{options:['new','pending','confirmed',...(data.status==='paid'?['paid']:[]),'completed','cancelled'].map(v=>({value:v,label:statusText[v]}))})+
        field('Загальна сума','price_total',data.price_total??'','number',{required:false,min:0,step:0.01})+
        field('Валюта','currency',data.currency||'EUR','text',{disabled:Boolean(data.id&&Number(data.paid_amount||0)>0),options:['EUR','USD','UAH','SEK','PLN','CZK','CHF','DKK','GBP','NOK'].map(v=>({value:v,label:v})),hint:data.id&&Number(data.paid_amount||0)>0?'Валюта заблокована, оскільки вже зареєстровані оплати.':''})+
        field('Додаткові нотатки','notes',data.notes||'','textarea',{full:true,required:false,placeholder:'Багаж, зворотний маршрут, побажання клієнта…'});
    } else if(kind==='payment'){
      const payableBookings=state.data.bookings.filter(b=>b.price_total===null||b.price_total===undefined||Number(b.paid_amount||0)<Number(b.price_total||0));
      html=field('Бронювання','booking_id',data.booking_id||'','text',{options:options(payableBookings,x=>x.id,x=>`${x.booking_number} · ${x.customer_name} · ${x.from_city} → ${x.to_city}`)})+
        field('Сума оплати','amount',data.amount||'','number',{min:0.01,step:0.01})+
        field('Валюта','currency',data.currency||'EUR','text',{options:['EUR','USD','UAH','SEK','PLN','CZK','CHF','DKK','GBP','NOK'].map(v=>({value:v,label:v}))})+
        field('Спосіб оплати','method',data.method||'bank_transfer','text',{options:[{value:'cash',label:'Готівка'},{value:'bank_transfer',label:'Банківський переказ'},{value:'card',label:'Банківська картка'},{value:'other',label:'Інше'}]})+
        field('Дата оплати','payment_date',data.payment_date?localDate(data.payment_date):localDate(new Date()),'datetime-local')+
        field('Номер транзакції / квитанції','reference',data.reference||'','text',{required:false})+
        field('Примітки','notes',data.notes||'','textarea',{full:true,required:false});
    } else if(kind==='route'){
      html=field('Країна','country',data.country||'')+field('Місто відправлення','from_city',data.from_city||'')+
        field('Місто прибуття','to_city',data.to_city||'')+field('Базова ціна','default_price',data.default_price??'','number',{required:false,min:0,step:0.01})+
        field('Валюта','currency',data.currency||'EUR','text',{options:['EUR','USD','UAH','SEK','PLN','CZK','CHF','DKK','GBP','NOK'].map(v=>({value:v,label:v}))})+
        field('Орієнтовна тривалість','duration_text',data.duration_text||'','text',{required:false,placeholder:'Наприклад, 24–28 годин'})+
        field('Статус','active',String(data.active??true),'text',{options:[{value:'true',label:'Активний'},{value:'false',label:'Прихований'}]})+
        field('Примітки','notes',data.notes||'','textarea',{full:true,required:false});
    } else if(kind==='trip'){
      html=field('Маршрут','route_id',data.route_id||'','text',{options:options(state.data.routes.filter(x=>x.active||x.id===data.route_id),x=>x.id,x=>`${x.from_city} → ${x.to_city} · ${x.country}`)})+
        field('Дата та час відправлення','departure_at',data.departure_at?localDate(data.departure_at):'','datetime-local')+
        field('Транспорт','vehicle_id',data.vehicle_id||'','text',{required:false,options:options(state.data.vehicles.filter(x=>x.status==='active'||x.id===data.vehicle_id),x=>x.id,x=>`${x.name} · ${x.seats} місць`)})+
        field('Водій','driver_id',data.driver_id||'','text',{required:false,options:options(state.data.drivers.filter(x=>x.status==='active'||x.id===data.driver_id),x=>x.id,x=>x.full_name)})+
        field('Усього місць','seats_total',data.seats_total||8,'number',{min:1,step:1})+
        field('Вільних місць','seats_available',data.seats_available??data.seats_total??8,'number',{min:0,step:1})+
        field('Ціна за пасажира','price',data.price??'','number',{required:false,min:0,step:0.01})+
        field('Валюта','currency',data.currency||'EUR','text',{options:['EUR','USD','UAH','SEK','PLN','CZK','CHF','DKK','GBP','NOK'].map(v=>({value:v,label:v}))})+
        field('Статус рейсу','status',data.status||'scheduled','text',{options:['scheduled','boarding','in_progress','completed','cancelled'].map(v=>({value:v,label:statusText[v]}))})+
        field('Примітки','notes',data.notes||'','textarea',{full:true,required:false});
    } else if(kind==='customer'){
      html=field('Ім’я та прізвище','full_name',data.full_name||'')+field('Телефон','phone',data.phone||'','tel')+
        field('Email','email',data.email||'','email',{required:false})+field('Нотатки','notes',data.notes||'','textarea',{full:true,required:false});
    } else if(kind==='vehicle'){
      html=field('Назва / модель','name',data.name||'')+field('Тип транспорту','vehicle_type',data.vehicle_type||'Мікроавтобус','text',{options:['Мікроавтобус','Автобус','Легковий автомобіль','Інше'].map(v=>({value:v,label:v}))})+
        field('Реєстраційний номер','registration_number',data.registration_number||'','text',{required:false})+field('Кількість місць','seats',data.seats||8,'number',{min:1,step:1})+
        field('Статус','status',data.status||'active','text',{options:['active','maintenance','inactive'].map(v=>({value:v,label:statusText[v]}))})+
        field('Примітки','notes',data.notes||'','textarea',{full:true,required:false});
    } else if(kind==='driver'){
      html=field('ПІБ водія','full_name',data.full_name||'')+field('Телефон','phone',data.phone||'','tel',{required:false})+
        field('Номер посвідчення','license_number',data.license_number||'','text',{required:false})+
        field('Статус','status',data.status||'active','text',{options:['active','inactive'].map(v=>({value:v,label:statusText[v]}))})+
        field('Примітки','notes',data.notes||'','textarea',{full:true,required:false});
    }
    el.modalBody.innerHTML=html;
    el.modal.classList.remove('is-hidden');
    document.body.style.overflow='hidden';
    setTimeout(()=>$('input,select,textarea',el.modalBody)?.focus(),40);
  }

  function closeModal() {
    el.modal.classList.add('is-hidden');
    document.body.style.overflow='';
    state.currentModal=null;
    el.modalForm.reset();
  }

  function normalizePhone(phone) { return String(phone||'').replace(/[\s()\-]/g,''); }

  async function saveBooking(data, id) {
    if (state.demoMode) {
      const normalized = normalizePhone(data.customer_phone);
      let customer = state.data.customers.find(c => c.phone_normalized === normalized);
      if (customer) Object.assign(customer, { full_name: data.customer_name, phone: data.customer_phone });
      else {
        customer = { id: `demo-customer-${Date.now()}`, full_name: data.customer_name, phone: data.customer_phone, phone_normalized: normalized, email: '', notes: '' };
        state.data.customers.unshift(customer);
      }
      const route = state.data.routes.find(r => r.country.toLowerCase() === data.country.toLowerCase() && r.from_city.toLowerCase() === data.from_city.toLowerCase() && r.to_city.toLowerCase() === data.to_city.toLowerCase());
      const existing = id ? state.data.bookings.find(b => b.id === id) : null;
      const tripId = data.status === 'cancelled' ? null : (data.trip_id || null);
      if (existing?.trip_id && existing.trip_id !== tripId) {
        const oldTrip = state.data.trips.find(t => t.id === existing.trip_id);
        if (oldTrip) oldTrip.seats_available = Math.min(Number(oldTrip.seats_total || 0), Number(oldTrip.seats_available || 0) + Number(existing.passengers || 0));
      }
      const payload = { ...data, customer_id: customer.id, route_id: route?.id || null, currency: data.currency || existing?.currency || route?.currency || 'EUR', price_total: data.price_total === '' ? null : Number(data.price_total), passengers: Number(data.passengers), paid_amount: Number(existing?.paid_amount || 0), source: existing?.source || 'manual', trip_id: tripId };
      if (!id) payload.booking_number = `DEMO-${String(Date.now()).slice(-6)}`;
      if (tripId) {
        const trip = state.data.trips.find(t => t.id === tripId);
        if (!trip) throw new Error('Обраний рейс не знайдено.');
        const previous = existing?.trip_id === tripId ? Number(existing.passengers || 0) : 0;
        const needed = Number(data.passengers) - previous;
        if (Number(trip.seats_available || 0) < needed) throw new Error('Недостатньо вільних місць на цьому рейсі.');
        trip.seats_available = Number(trip.seats_available || 0) - needed;
      }
      if (existing) Object.assign(existing, payload, { updated_at: new Date().toISOString() });
      else state.data.bookings.unshift({ id: `demo-booking-${Date.now()}`, created_at: new Date().toISOString(), ...payload });
      writeDemoData();
      return;
    }
    const normalized=normalizePhone(data.customer_phone);
    let customer=state.data.customers.find(c=>c.phone_normalized===normalized);
    if(customer){
      const {error}=await state.supabase.from('customers').update({full_name:data.customer_name,phone:data.customer_phone,phone_normalized:normalized}).eq('id',customer.id);
      if(error) throw error;
    } else {
      const {data:created,error}=await state.supabase.from('customers').insert({full_name:data.customer_name,phone:data.customer_phone,phone_normalized:normalized}).select('*').single();
      if(error) throw error; customer=created;
    }
    const route=state.data.routes.find(r=>r.country.toLowerCase()===data.country.toLowerCase()&&r.from_city.toLowerCase()===data.from_city.toLowerCase()&&r.to_city.toLowerCase()===data.to_city.toLowerCase());
    const tripId=data.status==='cancelled'?null:(data.trip_id||null);
    const existingBooking=id?state.data.bookings.find(b=>b.id===id):null;
    const payload={...data,customer_id:customer.id,route_id:route?.id||null,currency:data.currency||existingBooking?.currency||route?.currency||'EUR',price_total:data.price_total===''?null:Number(data.price_total),source:id?undefined:'manual'};
    delete payload.trip_id;
    if(id) delete payload.passengers; else payload.passengers=Number(data.passengers);
    if(!id) delete payload.id;
    const query=id?state.supabase.from('bookings').update(payload).eq('id',id).select('id').single():state.supabase.from('bookings').insert(payload).select('id').single();
    const {data:saved,error}=await query;
    if(error) throw error;
    const {error:seatError}=await state.supabase.rpc('set_booking_trip',{p_booking_id:saved.id,p_trip_id:tripId,p_passengers:Number(data.passengers)});
    if(seatError) return { warning: `Заявку збережено, але рейс не призначено: ${seatError.message}` };
  }

  async function saveEntity(kind, data, id) {
    if(kind==='booking') return saveBooking(data,id);
    if (state.demoMode && kind === 'payment') {
      const booking = state.data.bookings.find(b => b.id === data.booking_id);
      if (!booking) throw new Error('Оберіть чинне бронювання.');
      const amount = Number(data.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('Вкажіть коректну суму оплати.');
      if (booking.price_total !== null && booking.price_total !== undefined && Number(booking.paid_amount || 0) + amount > Number(booking.price_total)) throw new Error('Сума оплати перевищує залишок за бронюванням.');
      state.data.payments.unshift({ id:`demo-payment-${Date.now()}`, booking_id:data.booking_id, amount, currency:data.currency, method:data.method, payment_date:new Date(data.payment_date).toISOString(), reference:data.reference||'', notes:data.notes||'', created_at:new Date().toISOString() });
      booking.paid_amount = Number(booking.paid_amount || 0) + amount;
      if (booking.price_total !== null && booking.paid_amount >= Number(booking.price_total)) { booking.payment_status='paid'; booking.status='paid'; }
      else booking.payment_status = 'partial';
      writeDemoData();
      return;
    }
    if(kind==='payment') {
      const booking=state.data.bookings.find(b=>b.id===data.booking_id);
      if(!booking) throw new Error('Оберіть чинне бронювання.');
      const amount=Number(data.amount);
      if(!Number.isFinite(amount)||amount<=0) throw new Error('Вкажіть коректну суму оплати.');
      const nextPaid=Number(booking.paid_amount||0)+amount;
      if(booking.price_total!==null&&booking.price_total!==undefined&&nextPaid>Number(booking.price_total)) throw new Error('Сума оплати перевищує залишок за бронюванням.');
      const {error:paymentError}=await state.supabase.rpc('register_payment',{p_booking_id:data.booking_id,p_amount:amount,p_currency:data.currency,p_method:data.method,p_payment_date:new Date(data.payment_date).toISOString(),p_reference:data.reference||'',p_notes:data.notes||''});
      if(paymentError) throw paymentError;
      return;
    }
    const tableMap={route:'routes',trip:'trips',customer:'customers',vehicle:'vehicles',driver:'drivers'};
    const table=tableMap[kind];
    if(!table) throw new Error('Невідомий тип запису.');
    let payload={...data};
    if(kind==='route') payload={...payload,default_price:payload.default_price===''?null:Number(payload.default_price),active:payload.active==='true'};
    if(kind==='trip') payload={...payload,departure_at:new Date(payload.departure_at).toISOString(),route_id:payload.route_id||null,vehicle_id:payload.vehicle_id||null,driver_id:payload.driver_id||null,seats_total:Number(payload.seats_total),seats_available:Number(payload.seats_available),price:payload.price===''?null:Number(payload.price)};
    if(kind==='customer') payload={...payload,phone_normalized:normalizePhone(payload.phone)};
    if(kind==='vehicle') payload={...payload,seats:Number(payload.seats)};
    if (state.demoMode) { demoUpsert(table, payload, id); return; }
    if(id){const {error}=await state.supabase.from(table).update(payload).eq('id',id);if(error)throw error;}
    else {const {error}=await state.supabase.from(table).insert(payload);if(error)throw error;}
  }

  async function deleteEntity(kind,id) {
    const tables={route:'routes',trip:'trips',vehicle:'vehicles',driver:'drivers'};
    const table=tables[kind]; if(!table) return;
    if (state.demoMode) { state.data[table] = state.data[table].filter(row => row.id !== id); writeDemoData(); return; }
    const {error}=await state.supabase.from(table).delete().eq('id',id);
    if(error) throw error;
  }

  async function handleModalSubmit(event) {
    event.preventDefault();
    if(!el.modalForm.reportValidity()) return;
    const kind=el.modalForm.dataset.kind,id=el.modalForm.dataset.id||null;
    const data=Object.fromEntries(new FormData(el.modalForm).entries());
    if(kind==='trip'&&Number(data.seats_available)>Number(data.seats_total)){toast('Вільних місць не може бути більше, ніж загальна кількість.','error');return;}
    el.modalSave.disabled=true;el.modalSave.textContent='Зберігаємо…';
    try {
      const result=await saveEntity(kind,data,id);
      closeModal();await loadAll();renderView();
      if(result?.warning) toast(result.warning,'error'); else toast(id?'Зміни успішно збережено.':'Запис додано до системи.');
    } catch(error) {toast(`Не вдалося зберегти: ${error.message}`,'error');}
    finally {el.modalSave.disabled=false;el.modalSave.innerHTML='Зберегти зміни <span>→</span>';}
  }

  async function handleDelete(kind,id) {
    if(!isAdmin()){toast('Видалення доступне лише адміністратору.','error');return;}
    if(!window.confirm('Ви впевнені, що хочете видалити цей запис? Пов’язані бронювання збережуться, але посилання на запис буде очищено.')) return;
    try {await deleteEntity(kind,id);await loadAll();renderView();toast('Запис видалено.');}
    catch(error){toast(`Не вдалося видалити: ${error.message}`,'error');}
  }

  function exportBookings() {
    const cols=['booking_number','customer_name','customer_phone','country','from_city','to_city','travel_date','preferred_time','passengers','status','payment_status','price_total','paid_amount','currency','notes'];
    const csv=[cols.join(';'),...state.data.bookings.map(row=>cols.map(key=>`"${String(row[key]??'').replace(/"/g,'""')}"`).join(';'))].join('\r\n');
    const blob=new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`ua-eu-bookings-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(url);
  }

  el.loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    el.loginError.textContent = '';
    const form = new FormData(el.loginForm);
    const username = String(form.get('username') || '').trim();
    const password = String(form.get('password') || '');
    if (username === 'test' && password === 'test') {
      enterDemoMode();
      return;
    }
    if (!state.supabase) {
      el.loginError.textContent = 'Невірний логін або пароль.';
      return;
    }
    el.loginSubmit.disabled = true;
    el.loginSubmit.textContent = 'Перевіряємо доступ…';
    try {
      const { data: result, error } = await state.supabase.auth.signInWithPassword({ email: username, password });
      if (error) throw error;
      await enterApp(result.user);
    } catch (error) {
      el.loginError.textContent = error.message || 'Не вдалося увійти. Перевірте логін і пароль.';
    } finally {
      el.loginSubmit.disabled = false;
      el.loginSubmit.innerHTML = 'Увійти до системи <span>→</span>';
    }
  });

  el.nav.addEventListener('click',event=>{const btn=event.target.closest('[data-view]');if(btn){changeView(btn.dataset.view);el.sidebar.classList.remove('is-open');el.mobileMenu.setAttribute('aria-expanded','false');}});
  el.viewContent.addEventListener('click',delegateClick);
  el.headingActions.addEventListener('click',delegateClick);
  async function delegateClick(event){
    const add=event.target.closest('[data-add]');if(add){openModal(add.dataset.add);return;}
    const edit=event.target.closest('[data-edit]');if(edit){const kind=edit.dataset.edit;const collection={booking:'bookings',route:'routes',trip:'trips',customer:'customers',vehicle:'vehicles',driver:'drivers'}[kind];const item=state.data[collection].find(x=>x.id===edit.dataset.id);if(item)openModal(kind,item);return;}
    const del=event.target.closest('[data-delete]');if(del){await handleDelete(del.dataset.delete,del.dataset.id);return;}
    const go=event.target.closest('[data-go]');if(go){changeView(go.dataset.go);return;}
    const exp=event.target.closest('[data-export]');if(exp){exportBookings();return;}
  }
  el.modalForm.addEventListener('change',event=>{
    if(event.target.name==='booking_id'){
      const booking=state.data.bookings.find(b=>b.id===event.target.value);
      const currencySelect=$('[name="currency"]',el.modalForm);
      if(booking&&currencySelect&&[...currencySelect.options].some(o=>o.value===booking.currency)) currencySelect.value=booking.currency;
    }
    if(event.target.name==='vehicle_id' && el.modalForm.dataset.kind==='trip'){
      const vehicle=getVehicle(event.target.value);
      if(vehicle){const total=$('[name="seats_total"]',el.modalForm);const available=$('[name="seats_available"]',el.modalForm);if(total)total.value=vehicle.seats;if(available)available.value=vehicle.seats;}
    }
    if(event.target.name==='route_id' && el.modalForm.dataset.kind==='trip'){
      const route=getRoute(event.target.value);
      const price=$('[name="price"]',el.modalForm);const currency=$('[name="currency"]',el.modalForm);
      if(route){if(price&&(!price.value||price.value==='0')&&route.default_price!==null)price.value=route.default_price;if(currency&&[...currency.options].some(o=>o.value===route.currency))currency.value=route.currency;}
    }
  });
  el.modalForm.addEventListener('submit',handleModalSubmit);
  el.modalClose.addEventListener('click',closeModal);el.modalCancel.addEventListener('click',closeModal);
  el.modal.addEventListener('click',event=>{if(event.target===el.modal)closeModal();});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!el.modal.classList.contains('is-hidden'))closeModal();});
  el.refresh.addEventListener('click',async()=>{try{await loadAll();renderView();toast('Дані оновлено.');}catch(_){}});
  el.logout.addEventListener('click', async () => { if (state.supabase && !state.demoMode) await state.supabase.auth.signOut(); showLogin(); });
  el.mobileMenu.addEventListener('click',()=>{const open=el.sidebar.classList.toggle('is-open');el.mobileMenu.setAttribute('aria-expanded',String(open));el.mobileMenu.setAttribute('aria-label',open?'Закрити меню':'Відкрити меню');});
  document.addEventListener('click',event=>{if(window.innerWidth<=760&&!el.sidebar.contains(event.target)&&!el.mobileMenu.contains(event.target)&&el.sidebar.classList.contains('is-open')){el.sidebar.classList.remove('is-open');el.mobileMenu.setAttribute('aria-expanded','false');el.mobileMenu.setAttribute('aria-label','Відкрити меню');}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&el.sidebar.classList.contains('is-open')){el.sidebar.classList.remove('is-open');el.mobileMenu.setAttribute('aria-expanded','false');el.mobileMenu.focus();}});

  boot();
})();
