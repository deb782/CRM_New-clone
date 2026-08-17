// Channel Partner Portal — standalone SPA (separate auth from staff CRM)
(function () {
  const API = window.CP.API + '/cp';
  const TKEY = 'cp_token';
  let PARTNER = null;

  // ---------- helpers ----------
  function el(tag, attrs, ...kids) {
    const n = document.createElement(tag);
    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (v == null) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v);
    }
    kids.flat().forEach(c => { if (c == null || c === false) return; n.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return n;
  }
  function token() { return localStorage.getItem(TKEY); }
  function add(parent, ...kids) { kids.flat().forEach(k => { if (k == null || k === false) return; parent.appendChild(typeof k === 'string' || typeof k === 'number' ? document.createTextNode(String(k)) : k); }); }
  async function api(path, opts) {
    opts = opts || {};
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const t = token(); if (t) headers['Authorization'] = 'Bearer ' + t;
    const res = await fetch(API + path, { method: opts.method || 'GET', headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401) {
      // Only treat as an expired session if we actually had a token (i.e. not a failed login attempt).
      if (t) { localStorage.removeItem(TKEY); if (location.hash !== '#/login') { location.hash = '#/login'; render(); } }
      throw new Error((data && data.message) || 'Session expired');
    }
    if (!res.ok) throw new Error(data.message || (data.errors && Object.values(data.errors)[0][0]) || 'Request failed');
    return data;
  }
  function toast(msg, type) {
    const t = el('div', { class: 'cp-toast ' + (type || ''), 'data-testid': 'cp-toast' }, msg);
    document.getElementById('cp-toast').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }
  function modal({ title, body, foot }) {
    const root = document.getElementById('cp-modal-root');
    const close = () => { root.innerHTML = ''; };
    const bg = el('div', { class: 'cp-modal-bg', onclick: e => { if (e.target === bg) close(); } },
      el('div', { class: 'cp-modal' },
        el('div', { class: 'cp-modal__h' }, el('h3', {}, title), el('button', { class: 'cp-x', onclick: close }, '\u00d7')),
        el('div', { class: 'cp-modal__b' }, body),
        foot ? el('div', { class: 'cp-modal__f' }, ...foot) : null));
    root.appendChild(bg);
    return { close };
  }
  function money(n) { if (n == null) return '—'; return '₹' + Number(n).toLocaleString('en-IN'); }
  const LEAD_STATUS = { new: ['New', '#2f7d8c'], contacted: ['Contacted', '#d9a441'], qualified: ['Qualified', '#4a8f3c'], converted: ['In CRM', '#0d5c4a'], rejected: ['Rejected', '#c0433c'], lost: ['Lost', '#7c8b93'] };
  function leadPill(s) { const [l, c] = LEAD_STATUS[s] || [s, '#7c8b93']; return el('span', { class: 'cp-pill', style: 'background:' + c + '1f;color:' + c }, l); }

  // ---------- auth screens ----------
  function loginView(root) {
    let email = '', password = '', err = '';
    const box = el('div', { class: 'cp-auth__card' });
    function draw() {
      box.innerHTML = '';
      const emailI = el('input', { class: 'cp-input', type: 'email', placeholder: 'you@company.com', 'data-testid': 'cp-login-email', value: email });
      emailI.addEventListener('input', () => email = emailI.value);
      const passI = el('input', { class: 'cp-input', type: 'password', placeholder: '••••••••', 'data-testid': 'cp-login-password', value: password });
      passI.addEventListener('input', () => password = passI.value);
      const btn = el('button', { class: 'cp-btn cp-btn--primary cp-btn--block', 'data-testid': 'cp-login-submit' }, 'Sign in');
      btn.addEventListener('click', doLogin);
      add(box, 
        el('h2', {}, 'Partner sign in'),
        el('p', { class: 'sub' }, 'Access your leads, inventory and payouts.'),
        err ? el('div', { class: 'cp-err', 'data-testid': 'cp-login-error' }, err) : null,
        el('div', { class: 'cp-field' }, el('label', {}, 'Email'), emailI),
        el('div', { class: 'cp-field' }, el('label', {}, 'Password'), passI),
        btn,
        el('div', { style: 'text-align:center;margin-top:16px' }, el('a', { style: 'cursor:pointer;font-size:13px', 'data-testid': 'cp-forgot-link', onclick: () => { location.hash = '#/forgot'; render(); } }, 'Forgot password?')));
      passI.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
    }
    async function doLogin() {
      err = '';
      try {
        const r = await api('/auth/login', { method: 'POST', body: { email, password } });
        localStorage.setItem(TKEY, r.token); PARTNER = r.partner;
        location.hash = r.partner.must_change_password ? '#/change-password' : '#/dashboard';
        render();
      } catch (e) { err = e.message; draw(); }
    }
    draw();
    root.appendChild(authShell(box));
  }

  function forgotView(root) {
    let email = '', msg = '';
    const box = el('div', { class: 'cp-auth__card' });
    function draw() {
      box.innerHTML = '';
      const emailI = el('input', { class: 'cp-input', type: 'email', placeholder: 'you@company.com', 'data-testid': 'cp-forgot-email', value: email });
      emailI.addEventListener('input', () => email = emailI.value);
      const btn = el('button', { class: 'cp-btn cp-btn--primary cp-btn--block', 'data-testid': 'cp-forgot-submit' }, 'Send reset link');
      btn.addEventListener('click', async () => { try { const r = await api('/auth/forgot-password', { method: 'POST', body: { email } }); msg = r.message; draw(); } catch (e) { msg = e.message; draw(); } });
      add(box, el('h2', {}, 'Reset password'), el('p', { class: 'sub' }, 'We\'ll email you a reset link.'),
        msg ? el('div', { class: 'cp-banner' }, msg) : null,
        el('div', { class: 'cp-field' }, el('label', {}, 'Email'), emailI), btn,
        el('div', { style: 'text-align:center;margin-top:16px' }, el('a', { style: 'cursor:pointer;font-size:13px', onclick: () => { location.hash = '#/login'; render(); } }, 'Back to sign in')));
    }
    draw();
    root.appendChild(authShell(box));
  }

  function authShell(card) {
    return el('div', { class: 'cp-auth' },
      el('div', { class: 'cp-auth__hero' },
        el('div', { class: 'cp-auth__brand' }, el('i', { class: 'fa-solid fa-handshake-angle' }), 'Agrocorp Partners'),
        el('div', { class: 'cp-auth__pitch' },
          el('h1', {}, 'Grow with us. Refer, track, earn.'),
          el('p', {}, 'The official channel partner portal — submit customer leads straight into our sales team, check live plot availability, and follow every referral to closing.'),
          el('ul', { class: 'cp-auth__points' },
            el('li', {}, el('i', { class: 'fa-solid fa-bolt' }), 'Instant lead submission to our CRM'),
            el('li', {}, el('i', { class: 'fa-solid fa-map-location-dot' }), 'Live inventory & price lists'),
            el('li', {}, el('i', { class: 'fa-solid fa-users' }), 'Manage your own sales team'))),
        el('div', { class: 'cp-auth__foot' }, '© Agrocorp Realty · Channel Partner Programme')),
      el('div', { class: 'cp-auth__form' }, card));
  }

  function changePasswordView(root) {
    let p1 = '', p2 = '', err = '';
    const box = el('div', { class: 'cp-auth__card' });
    function draw() {
      box.innerHTML = '';
      const a = el('input', { class: 'cp-input', type: 'password', placeholder: 'New password (min 8)', 'data-testid': 'cp-newpass' }); a.addEventListener('input', () => p1 = a.value);
      const b = el('input', { class: 'cp-input', type: 'password', placeholder: 'Confirm new password', 'data-testid': 'cp-newpass2' }); b.addEventListener('input', () => p2 = b.value);
      const btn = el('button', { class: 'cp-btn cp-btn--primary cp-btn--block', 'data-testid': 'cp-changepass-submit' }, 'Set password');
      btn.addEventListener('click', async () => {
        err = '';
        if (p1.length < 8) { err = 'Password must be at least 8 characters'; draw(); return; }
        if (p1 !== p2) { err = 'Passwords do not match'; draw(); return; }
        try { await api('/auth/change-password', { method: 'POST', body: { password: p1, password_confirmation: p2 } }); if (PARTNER) PARTNER.must_change_password = false; toast('Password updated', 'success'); location.hash = '#/dashboard'; render(); }
        catch (e) { err = e.message; draw(); }
      });
      add(box, el('h2', {}, 'Set a new password'), el('p', { class: 'sub' }, 'For security, please change your temporary password.'),
        err ? el('div', { class: 'cp-err' }, err) : null,
        el('div', { class: 'cp-field' }, el('label', {}, 'New password'), a),
        el('div', { class: 'cp-field' }, el('label', {}, 'Confirm password'), b), btn);
    }
    draw();
    root.appendChild(authShell(box));
  }

  // ---------- portal shell ----------
  const NAV = [
    ['dashboard', 'fa-gauge-high', 'Dashboard'],
    ['leads', 'fa-user-plus', 'My Leads'],
    ['representatives', 'fa-users', 'My Team'],
    ['inventory', 'fa-map-location-dot', 'Inventory'],
    ['documents', 'fa-folder-open', 'Documents'],
    ['tickets', 'fa-life-ring', 'Support'],
    ['profile', 'fa-id-card', 'Profile & KYC'],
  ];

  function shell(active, title, sub, contentNode) {
    const nav = el('nav', { class: 'cp-nav' }, ...NAV.map(([r, ic, label]) =>
      el('a', { class: (active === r ? 'active' : ''), 'data-testid': 'cp-nav-' + r, onclick: () => { location.hash = '#/' + r; render(); } }, el('i', { class: 'fa-solid ' + ic }), label)));
    const logout = el('button', { class: 'cp-logout', 'data-testid': 'cp-logout', onclick: async () => { try { await api('/auth/logout', { method: 'POST' }); } catch (e) {} localStorage.removeItem(TKEY); PARTNER = null; location.hash = '#/login'; render(); } }, el('i', { class: 'fa-solid fa-right-from-bracket' }), ' Sign out');
    const side = el('aside', { class: 'cp-side' },
      el('div', { class: 'cp-side__brand' }, el('i', { class: 'fa-solid fa-handshake-angle' }), 'Agrocorp Partners'),
      nav,
      el('div', { class: 'cp-side__user' }, el('b', {}, PARTNER ? PARTNER.partner_name : ''), el('span', { class: 'code mono' }, PARTNER ? PARTNER.cp_code : ''), logout));
    const main = el('main', { class: 'cp-main' },
      el('div', { class: 'cp-topbar' }, el('div', {}, el('h1', {}, title), sub ? el('div', { class: 'sub' }, sub) : null)),
      contentNode);
    return el('div', { class: 'cp-shell' }, side, main);
  }

  // ---------- pages ----------
  async function dashboardPage(root) {
    const view = el('div', {});
    root.appendChild(shell('dashboard', 'Welcome, ' + (PARTNER.contact_name || PARTNER.partner_name), 'Here\'s how your referrals are performing.', view));
    const d = await api('/dashboard');
    const kyc = d.partner.kyc_status;
    add(view, 
      kyc !== 'approved' ? el('div', { class: 'cp-banner', 'data-testid': 'cp-kyc-banner' }, el('i', { class: 'fa-solid fa-triangle-exclamation' }), 'Your KYC is ' + kyc + '. Complete it under Profile & KYC to unlock payouts.') : null,
      el('div', { class: 'cp-cards' },
        stat('Total leads', d.stats.total, 'fa-layer-group'),
        stat('New', d.stats.new, 'fa-star'),
        stat('Qualified', d.stats.qualified, 'fa-circle-check'),
        stat('In CRM', d.stats.converted, 'fa-building-circle-arrow-right'),
        stat('Team members', d.stats.representatives, 'fa-users')),
      el('div', { class: 'cp-card' },
        el('div', { class: 'cp-card__h' }, el('h3', {}, 'Recent leads'), el('button', { class: 'cp-btn cp-btn--primary cp-btn--sm', onclick: () => { location.hash = '#/leads'; render(); } }, el('i', { class: 'fa-solid fa-plus' }), 'Submit lead')),
        el('div', { class: 'cp-card__b' }, d.recent.length ? tableOf(['Customer', 'Rep', 'Status', 'Date'], d.recent.map(l => el('tr', {}, el('td', {}, el('b', {}, l.customer_name)), el('td', {}, l.representative ? l.representative.name : '—'), el('td', {}, leadPill(l.status)), el('td', {}, (l.created_at || '').slice(0, 10))))) : emptyState('fa-inbox', 'No leads yet'))));
  }
  function stat(k, v, ic) { return el('div', { class: 'cp-stat' }, el('div', { class: 'k' }, el('i', { class: 'fa-solid ' + ic }), k), el('div', { class: 'v' }, String(v))); }
  function tableOf(headers, rows) { return el('table', { class: 'cp-table' }, el('thead', {}, el('tr', {}, ...headers.map(h => el('th', {}, h)))), el('tbody', {}, ...rows)); }
  function emptyState(ic, msg) { return el('div', { class: 'cp-empty' }, el('i', { class: 'fa-solid ' + ic }), el('div', {}, msg)); }

  async function leadsPage(root) {
    const view = el('div', {});
    root.appendChild(shell('leads', 'My Leads', 'Submit and track your customer referrals.', view));
    let status = '';
    const listWrap = el('div', {});
    const bar = el('div', { class: 'cp-toolbar' },
      el('button', { class: 'cp-btn cp-btn--primary', 'data-testid': 'cp-submit-lead', onclick: submitForm }, el('i', { class: 'fa-solid fa-plus' }), 'Submit new lead'),
      ...[['', 'All'], ['new', 'New'], ['contacted', 'Contacted'], ['qualified', 'Qualified'], ['converted', 'In CRM'], ['rejected', 'Rejected']].map(([v, l]) =>
        el('button', { class: 'cp-btn cp-btn--sm ' + (status === v ? 'cp-btn--primary' : 'cp-btn--ghost'), 'data-testid': 'cp-leadfilter-' + (v || 'all'), onclick: () => { status = v; load(); } }, l)));
    add(view, bar, listWrap);
    async function load() {
      bar.querySelectorAll('.cp-btn--sm').forEach(b => {});
      const r = await api('/leads' + (status ? '?status=' + status : ''));
      listWrap.innerHTML = '';
      const rows = (r.data || []);
      listWrap.appendChild(el('div', { class: 'cp-card' }, el('div', { class: 'cp-card__b' },
        rows.length ? tableOf(['Customer', 'Phone', 'Interest', 'Rep', 'Status', ''], rows.map(l => el('tr', { 'data-testid': 'cp-lead-' + l.id },
          el('td', {}, el('b', {}, l.customer_name), l.email ? el('div', { style: 'font-size:12px;color:var(--ink-3)' }, l.email) : null),
          el('td', { class: 'mono' }, l.phone),
          el('td', {}, l.plot_type ? el('span', { class: 'cp-chip' }, l.plot_type) : '—'),
          el('td', {}, l.representative ? l.representative.name : '—'),
          el('td', {}, leadPill(l.status)),
          el('td', { style: 'text-align:right' }, l.status !== 'converted' && l.status !== 'rejected' ? el('button', { class: 'cp-btn cp-btn--sm cp-btn--ghost', 'data-testid': 'cp-lead-edit-' + l.id, onclick: () => submitForm(l) }, el('i', { class: 'fa-solid fa-pen' })) : el('span', { class: 'cp-chip' }, 'Locked'))))) : emptyState('fa-user-plus', 'No leads yet — submit your first referral'))));
    }
    async function submitForm(lead) {
      const isEdit = lead && lead.id;
      const [{ data: reps }, { data: projects }] = await Promise.all([api('/representatives'), api('/projects')]);
      const f = isEdit ? { customer_name: lead.customer_name, phone: lead.phone, email: lead.email, plot_type: lead.plot_type, notes: lead.notes } : {};
      const inp = (k, ph, type) => { const i = el('input', { class: 'cp-input', type: type || 'text', placeholder: ph, 'data-testid': 'cp-lf-' + k, value: f[k] || '' }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const repSel = el('select', { class: 'cp-select', 'data-testid': 'cp-lf-rep' }, el('option', { value: '' }, 'Unassigned'), ...reps.map(r => el('option', { value: r.id }, r.name)));
      repSel.addEventListener('change', () => f.cp_representative_id = repSel.value || null);
      const projSel = el('select', { class: 'cp-select', 'data-testid': 'cp-lf-project' }, el('option', { value: '' }, 'Any project'), ...projects.map(p => el('option', { value: p.id }, p.name)));
      projSel.addEventListener('change', () => f.project_id = projSel.value || null);
      const body = el('div', {},
        el('div', { class: 'cp-field' }, el('label', {}, 'Customer name *'), inp('customer_name', 'Full name')),
        el('div', { class: 'cp-row' }, el('div', { class: 'cp-field' }, el('label', {}, 'Phone *'), inp('phone', '10-digit mobile')), el('div', { class: 'cp-field' }, el('label', {}, 'Email'), inp('email', 'email', 'email'))),
        el('div', { class: 'cp-row' }, el('div', { class: 'cp-field' }, el('label', {}, 'Plot / interest'), inp('plot_type', 'e.g. 3BHK Villa Plot')), el('div', { class: 'cp-field' }, el('label', {}, 'Project'), projSel)),
        isEdit ? null : el('div', { class: 'cp-field' }, el('label', {}, 'Assign to your rep'), repSel),
        el('div', { class: 'cp-field' }, el('label', {}, 'Notes'), el('textarea', { class: 'cp-input', rows: '3', 'data-testid': 'cp-lf-notes', oninput: e => f.notes = e.target.value }, f.notes || '')));
      const save = el('button', { class: 'cp-btn cp-btn--primary', 'data-testid': 'cp-lf-save' }, isEdit ? 'Save changes' : 'Submit lead');
      const m = modal({ title: isEdit ? 'Edit lead' : 'Submit new lead', body, foot: [el('button', { class: 'cp-btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!f.customer_name || !f.phone) { toast('Name and phone are required', 'error'); return; }
        try {
          if (isEdit) await api('/leads/' + lead.id, { method: 'PUT', body: f });
          else await api('/leads', { method: 'POST', body: f });
          toast(isEdit ? 'Lead updated' : 'Lead submitted to our team', 'success'); m.close(); load();
        } catch (e) { toast(e.message, 'error'); }
      });
    }
    load();
  }

  async function repsPage(root) {
    const view = el('div', {});
    root.appendChild(shell('representatives', 'My Team', 'Add your own sales agents and attribute leads to them.', view));
    const bar = el('div', { class: 'cp-toolbar' }, el('button', { class: 'cp-btn cp-btn--primary', 'data-testid': 'cp-add-rep', onclick: addForm }, el('i', { class: 'fa-solid fa-user-plus' }), 'Add team member'));
    const wrap = el('div', {});
    add(view, bar, wrap);
    async function load() {
      const r = await api('/representatives');
      wrap.innerHTML = '';
      wrap.appendChild(el('div', { class: 'cp-card' }, el('div', { class: 'cp-card__b' },
        r.data.length ? tableOf(['Name', 'Phone', 'Email', 'Leads', ''], r.data.map(rep => el('tr', { 'data-testid': 'cp-rep-' + rep.id },
          el('td', {}, el('b', {}, rep.name)), el('td', { class: 'mono' }, rep.phone || '—'), el('td', {}, rep.email || '—'),
          el('td', {}, el('span', { class: 'cp-chip' }, rep.leads_count + ' leads')),
          el('td', { style: 'text-align:right' }, el('button', { class: 'cp-btn cp-btn--sm cp-btn--ghost cp-btn--danger', 'data-testid': 'cp-rep-del-' + rep.id, onclick: async () => { try { await api('/representatives/' + rep.id, { method: 'DELETE' }); toast('Removed', 'success'); load(); } catch (e) { toast(e.message, 'error'); } } }, el('i', { class: 'fa-solid fa-trash' }))))))
          : emptyState('fa-users', 'No team members yet'))));
    }
    function addForm() {
      const f = {};
      const inp = (k, ph) => { const i = el('input', { class: 'cp-input', placeholder: ph, 'data-testid': 'cp-rep-' + k }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const body = el('div', {}, el('div', { class: 'cp-field' }, el('label', {}, 'Name *'), inp('name', 'Agent name')), el('div', { class: 'cp-row' }, el('div', { class: 'cp-field' }, el('label', {}, 'Phone'), inp('phone', 'Mobile')), el('div', { class: 'cp-field' }, el('label', {}, 'Email'), inp('email', 'Email'))));
      const save = el('button', { class: 'cp-btn cp-btn--primary', 'data-testid': 'cp-rep-save' }, 'Add member');
      const m = modal({ title: 'Add team member', body, foot: [el('button', { class: 'cp-btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => { if (!f.name) { toast('Name required', 'error'); return; } try { await api('/representatives', { method: 'POST', body: f }); toast('Added', 'success'); m.close(); load(); } catch (e) { toast(e.message, 'error'); } });
    }
    load();
  }

  async function inventoryPage(root) {
    const view = el('div', {});
    root.appendChild(shell('inventory', 'Inventory', 'Live plot availability across our projects.', view));
    let search = '', statusF = '';
    const searchI = el('input', { class: 'cp-input', placeholder: 'Search plot / unit no…', style: 'max-width:260px', 'data-testid': 'cp-inv-search' });
    searchI.addEventListener('input', () => { search = searchI.value; load(); });
    const bar = el('div', { class: 'cp-toolbar' }, searchI, ...[['', 'All'], ['available', 'Available'], ['booked', 'Booked'], ['sold', 'Sold']].map(([v, l]) => el('button', { class: 'cp-btn cp-btn--sm ' + (statusF === v ? 'cp-btn--primary' : 'cp-btn--ghost'), 'data-testid': 'cp-inv-' + (v || 'all'), onclick: () => { statusF = v; load(); } }, l)));
    const wrap = el('div', {});
    add(view, bar, wrap);
    async function load() {
      const q = []; if (search) q.push('search=' + encodeURIComponent(search)); if (statusF) q.push('status=' + statusF);
      const r = await api('/inventory' + (q.length ? '?' + q.join('&') : ''));
      wrap.innerHTML = '';
      wrap.appendChild(el('div', { class: 'cp-card' }, el('div', { class: 'cp-card__b' },
        r.data.length ? tableOf(['Project', 'Unit', 'Type', 'Area', 'Facing', 'Price', 'Status'], r.data.map(p => el('tr', { 'data-testid': 'cp-plot-' + p.id },
          el('td', {}, p.project), el('td', { class: 'mono' }, el('b', {}, p.number)), el('td', {}, p.unit_type || '—'),
          el('td', {}, p.carpet_area ? p.carpet_area + ' sqft' : '—'), el('td', {}, p.facing || '—'), el('td', { class: 'mono' }, money(p.price)),
          el('td', {}, el('span', { class: 'cp-pill', style: 'background:' + (p.available ? '#4a8f3c1f;color:#4a8f3c' : '#c0433c1f;color:#c0433c') }, p.status)))))
          : emptyState('fa-map-location-dot', 'No plots match'))));
    }
    load();
  }

  async function documentsPage(root) {
    const view = el('div', {});
    root.appendChild(shell('documents', 'Documents', 'Brochures, price lists and marketing collateral.', view));
    const r = await api('/documents');
    view.appendChild(el('div', { class: 'cp-card' }, el('div', { class: 'cp-card__b' },
      r.data.length ? tableOf(['Title', 'Category', ''], r.data.map(d => el('tr', {}, el('td', {}, el('b', {}, d.title)), el('td', {}, el('span', { class: 'cp-chip' }, d.category || 'General')), el('td', { style: 'text-align:right' }, el('a', { class: 'cp-btn cp-btn--sm cp-btn--primary', href: d.file_path, target: '_blank' }, el('i', { class: 'fa-solid fa-download' }), 'Download')))))
        : emptyState('fa-folder-open', 'No documents available yet'))));
  }

  async function ticketsPage(root) {
    const view = el('div', {});
    root.appendChild(shell('tickets', 'Support', 'Raise queries with the Agrocorp team.', view));
    const bar = el('div', { class: 'cp-toolbar' }, el('button', { class: 'cp-btn cp-btn--primary', 'data-testid': 'cp-new-ticket', onclick: newForm }, el('i', { class: 'fa-solid fa-plus' }), 'New ticket'));
    const wrap = el('div', {});
    add(view, bar, wrap);
    async function load() {
      const r = await api('/tickets');
      wrap.innerHTML = '';
      wrap.appendChild(el('div', { class: 'cp-card' }, el('div', { class: 'cp-card__b' },
        r.data.length ? tableOf(['Subject', 'Priority', 'Status', 'Messages', ''], r.data.map(t => el('tr', { 'data-testid': 'cp-ticket-' + t.id },
          el('td', {}, el('b', {}, t.subject)), el('td', {}, el('span', { class: 'cp-chip' }, t.priority)),
          el('td', {}, leadPillTicket(t.status)), el('td', {}, String(t.messages_count)),
          el('td', { style: 'text-align:right' }, el('button', { class: 'cp-btn cp-btn--sm cp-btn--ghost', 'data-testid': 'cp-ticket-open-' + t.id, onclick: () => openTicket(t.id) }, 'Open')))))
          : emptyState('fa-life-ring', 'No support tickets'))));
    }
    function leadPillTicket(s) { const c = { open: '#2f7d8c', in_progress: '#d9a441', resolved: '#4a8f3c', closed: '#7c8b93' }[s] || '#7c8b93'; return el('span', { class: 'cp-pill', style: 'background:' + c + '1f;color:' + c }, s.replace('_', ' ')); }
    async function openTicket(id) {
      const r = await api('/tickets/' + id); const t = r.ticket;
      const thread = el('div', { style: 'display:flex;flex-direction:column;gap:10px;max-height:340px;overflow:auto;margin-bottom:14px' },
        ...t.messages.map(m => el('div', { style: 'padding:10px 13px;border-radius:10px;font-size:14px;' + (m.sender_type === 'partner' ? 'background:#e8f3ef;align-self:flex-end' : 'background:#f1f4f5') }, el('div', { style: 'font-size:11px;color:var(--ink-3);margin-bottom:3px' }, m.sender_type === 'partner' ? 'You' : 'Agrocorp'), m.body)));
      const reply = el('textarea', { class: 'cp-input', rows: '2', placeholder: 'Type a reply…', 'data-testid': 'cp-ticket-reply' });
      const send = el('button', { class: 'cp-btn cp-btn--primary', 'data-testid': 'cp-ticket-send' }, 'Send');
      const m = modal({ title: t.subject, body: el('div', {}, thread, el('div', { class: 'cp-field' }, reply)), foot: [el('button', { class: 'cp-btn', onclick: () => m.close() }, 'Close'), send] });
      send.addEventListener('click', async () => { if (!reply.value.trim()) return; try { await api('/tickets/' + id + '/reply', { method: 'POST', body: { body: reply.value } }); toast('Reply sent', 'success'); m.close(); load(); } catch (e) { toast(e.message, 'error'); } });
    }
    function newForm() {
      const f = { priority: 'normal' };
      const subj = el('input', { class: 'cp-input', placeholder: 'Subject', 'data-testid': 'cp-ticket-subject' }); subj.addEventListener('input', () => f.subject = subj.value);
      const pri = el('select', { class: 'cp-select', 'data-testid': 'cp-ticket-priority' }, ...['low', 'normal', 'high'].map(p => el('option', { value: p, selected: p === 'normal' ? 'selected' : null }, p))); pri.addEventListener('change', () => f.priority = pri.value);
      const bodyI = el('textarea', { class: 'cp-input', rows: '4', placeholder: 'Describe your query', 'data-testid': 'cp-ticket-body' }); bodyI.addEventListener('input', () => f.body = bodyI.value);
      const save = el('button', { class: 'cp-btn cp-btn--primary', 'data-testid': 'cp-ticket-create' }, 'Create ticket');
      const m = modal({ title: 'New support ticket', body: el('div', {}, el('div', { class: 'cp-field' }, el('label', {}, 'Subject *'), subj), el('div', { class: 'cp-field' }, el('label', {}, 'Priority'), pri), el('div', { class: 'cp-field' }, el('label', {}, 'Message *'), bodyI)), foot: [el('button', { class: 'cp-btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => { if (!f.subject || !f.body) { toast('Subject and message required', 'error'); return; } try { await api('/tickets', { method: 'POST', body: f }); toast('Ticket created', 'success'); m.close(); load(); } catch (e) { toast(e.message, 'error'); } });
    }
    load();
  }

  async function profilePage(root) {
    const view = el('div', {});
    root.appendChild(shell('profile', 'Profile & KYC', 'Keep your company and bank details up to date.', view));
    const r = await api('/profile'); const p = r.partner;
    const f = {};
    const FIELDS = [
      ['company', 'Company name'], ['phone', 'Phone'], ['contact_name', 'Contact person'], ['contact_designation', 'Designation'],
      ['registered_address', 'Registered address'], ['entity_type', 'Entity type'], ['nature_of_business', 'Nature of business'],
      ['pan', 'PAN'], ['gstin', 'GSTIN'], ['rera_number', 'RERA number'],
      ['bank_account_name', 'Bank account name'], ['bank_name', 'Bank name'], ['bank_account_number', 'Account number'],
      ['bank_ifsc', 'IFSC'], ['bank_account_type', 'Account type'], ['signature_name', 'Signatory name'], ['signature_designation', 'Signatory designation'],
    ];
    const grid = el('div', { class: 'cp-row' });
    FIELDS.forEach(([k, label]) => { f[k] = p[k] || ''; const i = el('input', { class: 'cp-input', value: p[k] || '', 'data-testid': 'cp-prof-' + k }); i.addEventListener('input', () => f[k] = i.value); grid.appendChild(el('div', { class: 'cp-field' }, el('label', {}, label), i)); });
    const save = el('button', { class: 'cp-btn cp-btn--primary', 'data-testid': 'cp-prof-save' }, 'Save details');
    save.addEventListener('click', async () => { try { await api('/profile', { method: 'PUT', body: f }); toast('Profile saved', 'success'); } catch (e) { toast(e.message, 'error'); } });
    const submitKyc = el('button', { class: 'cp-btn', 'data-testid': 'cp-prof-submitkyc', onclick: async () => { try { const rr = await api('/profile/submit-kyc', { method: 'POST' }); PARTNER.kyc_status = rr.partner.kyc_status; toast('KYC submitted for review', 'success'); render(); } catch (e) { toast(e.message, 'error'); } } }, el('i', { class: 'fa-solid fa-paper-plane' }), 'Submit KYC for review');
    add(view, 
      el('div', { class: 'cp-banner' }, el('i', { class: 'fa-solid fa-shield-halved' }), 'KYC status: ', el('b', { style: 'margin-left:4px' }, p.kyc_status)),
      el('div', { class: 'cp-card' }, el('div', { class: 'cp-card__h' }, el('h3', {}, 'Company & bank details')), el('div', { style: 'padding:20px' }, grid, el('div', { style: 'display:flex;gap:10px;margin-top:8px' }, save, p.kyc_status !== 'approved' ? submitKyc : null))));
  }

  // ---------- router ----------
  async function render() {
    const root = document.getElementById('cp-app');
    root.innerHTML = '';
    const hash = location.hash || '#/login';
    const route = hash.replace('#/', '').split('?')[0];

    if (!token()) { if (route === 'forgot') return forgotView(root); return loginView(root); }
    if (!PARTNER) { try { const r = await api('/auth/me'); PARTNER = r.partner; } catch (e) { return loginView(root); } }
    if (PARTNER.must_change_password && route !== 'change-password') { location.hash = '#/change-password'; }
    if (route === 'change-password') return changePasswordView(root);

    try {
      const map = { dashboard: dashboardPage, leads: leadsPage, representatives: repsPage, inventory: inventoryPage, documents: documentsPage, tickets: ticketsPage, profile: profilePage };
      const page = map[route] || dashboardPage;
      await page(root);
    } catch (e) { root.appendChild(el('div', { style: 'padding:40px' }, el('div', { class: 'cp-err' }, e.message))); }
  }

  window.addEventListener('hashchange', render);
  if (document.readyState !== 'loading') render(); else document.addEventListener('DOMContentLoaded', render);
})();
