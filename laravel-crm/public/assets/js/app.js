// ---- App shell, router, auth ----
(function () {
  const { el, api, toast, state, setToken, token, initials, can } = CRM;
  CRM.pages = CRM.pages || {};

  const NAV = [
    { label: 'Workspace', perm: 'leads.view', items: [
      { route: 'dashboard', icon: 'fa-gauge-high', name: 'Dashboard' },
      { route: 'leads', icon: 'fa-users', name: 'Leads' },
      { route: 'pipeline', icon: 'fa-diagram-project', name: 'Pipeline' },
      { route: 'inventory', icon: 'fa-building', name: 'Inventory' },
      { route: 'visits', icon: 'fa-calendar-check', name: 'Site Visits' },
      { route: 'bookings', icon: 'fa-file-contract', name: 'Bookings' },
      { route: 'collections', icon: 'fa-indian-rupee-sign', name: 'Collections' },
      { route: 'demands', icon: 'fa-file-invoice-dollar', name: 'Demand Letters' },
      { route: 'callList', icon: 'fa-phone-volume', name: 'Call List' },
      { route: 'slaBoard', icon: 'fa-gauge-high', name: 'SLA Board' },
      { route: 'tasks', icon: 'fa-list-check', name: 'Tasks' },
      { route: 'import', icon: 'fa-file-arrow-up', name: 'Import' },
    ]},
    { label: 'Configuration', perm: 'config.manage', items: [
      { route: 'approvals', icon: 'fa-gavel', name: 'Discount Approvals', perm: 'discounts.approve' },
      { route: 'plans', icon: 'fa-money-check-dollar', name: 'Payment Plans' },
      { route: 'scoring', icon: 'fa-sliders', name: 'Lead Scoring' },
      { route: 'automation', icon: 'fa-bolt', name: 'Automations' },
      { route: 'templates', icon: 'fa-comment-dots', name: 'Templates' },
      { route: 'partners', icon: 'fa-handshake', name: 'Channel Partners' },
      { route: 'commissions', icon: 'fa-hand-holding-dollar', name: 'Commissions' },
      { route: 'health', icon: 'fa-heart-pulse', name: 'System Health' },
      { route: 'audit', icon: 'fa-clipboard-list', name: 'Audit Log' },
      { route: 'users', icon: 'fa-user-shield', name: 'Users & Roles', perm: 'users.manage' },
    ]},
    { label: 'Partner', perm: 'partner.portal', items: [
      { route: 'portal', icon: 'fa-handshake', name: 'My Portal' },
    ]},
  ];

  const TITLES = { dashboard: 'Dashboard', leads: 'Leads', pipeline: 'Pipeline', inventory: 'Inventory', visits: 'Site Visits', bookings: 'Bookings', collections: 'Collections', demands: 'Demand Letters', callList: 'Prioritized Call List', tasks: 'Tasks', import: 'Bulk Import', approvals: 'Discount Approvals', plans: 'Payment Plans', scoring: 'Lead Scoring Rules', automation: 'Automation Rules', templates: 'Message Templates', partners: 'Channel Partners', commissions: 'Commissions', slaBoard: 'SLA Heat-Board', health: 'System & Integration Health', audit: 'Audit Log', users: 'Users & Roles', portal: 'Partner Portal' };

  function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); localStorage.setItem('crm_theme', t); }
  applyTheme(localStorage.getItem('crm_theme') || 'light');

  function parseRoute() {
    const h = (location.hash || '#/dashboard').replace('#/', '');
    const [route, id] = h.split('/');
    return { route: route || 'dashboard', id };
  }

  function renderLogin() {
    const app = document.getElementById('app');
    const email = el('input', { class: 'input', type: 'email', value: 'admin@crm.local', 'data-testid': 'login-email' });
    const pass = el('input', { class: 'input', type: 'password', value: 'Admin@12345', 'data-testid': 'login-password' });
    const btn = el('button', { class: 'btn btn--primary', style: 'width:100%;height:40px;margin-top:6px', 'data-testid': 'login-submit' }, 'Sign in');

    async function submit(e) {
      if (e) e.preventDefault();
      btn.disabled = true; btn.textContent = 'Signing in…';
      try {
        const res = await api.login(email.value.trim(), pass.value);
        setToken(res.token); state.user = res.user; sessionStorage.removeItem('crm_homed');
        toast('Welcome back, ' + res.user.name.split(' ')[0], 'success');
        location.hash = '#/dashboard';
      } catch (err) {
        toast(err.message || 'Login failed', 'error'); btn.disabled = false; btn.textContent = 'Sign in';
      }
    }
    btn.addEventListener('click', submit);

    app.innerHTML = '';
    app.appendChild(el('div', { class: 'auth' },
      el('div', { class: 'auth__brand' },
        el('div', {},
          el('div', { class: 'nav__logo', style: 'width:40px;height:40px;font-size:18px;border-radius:11px' }, 'RE'),
          el('h1', { style: 'margin-top:28px' }, 'Real Estate CRM'),
          el('p', {}, 'Pre-Sales to Post-Sales, one workspace. Capture, qualify, nurture and convert leads with automated scoring and workflows.')
        ),
        el('div', { class: 'auth__badges' },
          el('span', { class: 'auth__badge' }, 'Lead Scoring'),
          el('span', { class: 'auth__badge' }, 'Nurture Sequences'),
          el('span', { class: 'auth__badge' }, 'Duplicate Detection'),
          el('span', { class: 'auth__badge' }, 'Automations'))
      ),
      el('div', { class: 'auth__form' },
        el('form', { class: 'auth__card', onsubmit: submit },
          el('h2', {}, 'Sign in'),
          el('div', { class: 'sub' }, 'Access your CRM workspace'),
          el('div', { class: 'field' }, el('label', {}, 'Email'), email),
          el('div', { class: 'field' }, el('label', {}, 'Password'), pass),
          btn,
          el('div', { class: 'demo-hint' }, 'Demo: admin@crm.local / Admin@12345 · priya@crm.local / Demo@12345')
        ))
    ));
  }

  function renderShell(active) {
    const app = document.getElementById('app');
    const nav = el('nav', { class: 'nav', id: 'nav' });
    nav.appendChild(el('div', { class: 'nav__brand' }, el('div', { class: 'nav__logo' }, 'RE'), 'Real Estate CRM'));

    NAV.forEach(group => {
      if (group.perm && !can(group.perm)) return;
      const items = group.items.filter(i => !i.perm || can(i.perm));
      if (!items.length) return;
      const g = el('div', { class: 'nav__group' }, el('div', { class: 'nav__label' }, group.label));
      items.forEach(i => {
        g.appendChild(el('a', { class: 'nav__item ' + (i.route === active ? 'active' : ''), href: '#/' + i.route, 'data-testid': 'nav-' + i.route },
          el('i', { class: 'fa-solid ' + i.icon }), i.name));
      });
      nav.appendChild(g);
    });

    const theme = document.documentElement.getAttribute('data-theme');
    nav.appendChild(el('div', { class: 'nav__foot' },
      el('div', { class: 'nav__user' },
        el('div', { class: 'avatar' }, initials(state.user.name)),
        el('div', { class: 'meta' }, el('b', {}, state.user.name), el('span', {}, state.user.role_name || ''))),
      el('div', { style: 'display:flex;gap:8px;margin-top:8px' },
        el('button', { class: 'btn btn--ghost btn--sm', style: 'flex:1', 'data-testid': 'theme-toggle', onclick: () => { applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); render(); } },
          el('i', { class: 'fa-solid ' + (theme === 'dark' ? 'fa-sun' : 'fa-moon') }), theme === 'dark' ? 'Light' : 'Dark'),
        el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'logout-btn', onclick: logout }, el('i', { class: 'fa-solid fa-arrow-right-from-bracket' })))
    ));

    const view = el('div', { class: 'content', id: 'view' }, el('div', { class: 'spinner' }));
    const topbar = el('div', { class: 'topbar' },
      el('button', { class: 'icon-btn nav-toggle', onclick: () => document.getElementById('nav').classList.toggle('open') }, el('i', { class: 'fa-solid fa-bars' })),
      el('h1', { id: 'page-title' }, TITLES[active] || 'CRM'),
      el('div', { class: 'spacer' }),
      el('span', { id: 'topbar-actions' }));

    app.innerHTML = '';
    app.appendChild(el('div', { class: 'shell' }, nav, el('main', { class: 'main' }, topbar, view)));
    return view;
  }

  function logout() { api.post('/auth/logout').catch(() => {}); setToken(null); state.user = null; sessionStorage.removeItem('crm_homed'); location.hash = '#/login'; }

  async function render() {
    document.querySelectorAll('.drawer-overlay, .modal-overlay').forEach(n => n.remove());
    if (!token()) { renderLogin(); return; }
    if (!state.user) {
      try { const res = await api.me(); state.user = res.user; }
      catch (e) { renderLogin(); return; }
    }
    const { route, id } = parseRoute();
    if (route === 'login') { location.hash = '#/dashboard'; return; }
    // Role-based home: land each role on what they act on first (once per session)
    if ((route === 'dashboard' || !route) && !sessionStorage.getItem('crm_homed')) {
      sessionStorage.setItem('crm_homed', '1');
      const home = { channel_partner: 'portal', post_sales: 'collections', sales_exec: 'callList' }[state.user.role];
      if (home && ('#/' + home) !== location.hash) { location.hash = '#/' + home; return; }
    }
    if (route === 'dashboard' && !can('leads.view') && can('partner.portal')) { location.hash = '#/portal'; return; }
    const view = renderShell(route);
    const page = CRM.pages[route];
    if (!page) { view.innerHTML = ''; view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-compass' }), el('div', {}, 'Page not found'))); return; }
    try { await page(view, id); }
    catch (err) { view.innerHTML = ''; view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-triangle-exclamation' }), el('div', {}, err.message || 'Failed to load'))); }
  }

  CRM.render = render;
  CRM.setTitle = (t) => { const n = document.getElementById('page-title'); if (n) n.textContent = t; };
  CRM.setActions = (node) => { const a = document.getElementById('topbar-actions'); if (a) { a.innerHTML = ''; if (node) a.appendChild(node); } };

  window.addEventListener('hashchange', render);
  window.addEventListener('DOMContentLoaded', render);
  if (document.readyState !== 'loading') render();
})();
