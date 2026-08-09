// ---- Phase 2: Onboarding wizard, forced password change, Preview Roles ----
(function () {
  const { el, api, toast, state, setToken, token, initials } = CRM;

  const DEPTS = [
    { key: 'sales', name: 'Sales', icon: 'fa-user-tie' },
    { key: 'accounts', name: 'Accounts', icon: 'fa-indian-rupee-sign' },
    { key: 'legal', name: 'Legal', icon: 'fa-scale-balanced' },
    { key: 'crm', name: 'Customer Relationship', icon: 'fa-headset' },
    { key: 'admin', name: 'Administration', icon: 'fa-user-shield' },
  ];

  // ---------- Forced first-login password change ----------
  CRM.changePasswordScreen = function () {
    const app = document.getElementById('app');
    const npass = el('input', { class: 'input', type: 'password', 'data-testid': 'cpw-new', placeholder: 'New password (min 8 chars)' });
    const cpass = el('input', { class: 'input', type: 'password', 'data-testid': 'cpw-confirm', placeholder: 'Confirm new password' });
    const btn = el('button', { class: 'btn btn--primary', style: 'width:100%;height:40px;margin-top:6px', 'data-testid': 'cpw-submit' }, 'Set new password & continue');
    async function submit(e) {
      if (e) e.preventDefault();
      if (npass.value.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
      if (npass.value !== cpass.value) { toast('Passwords do not match', 'error'); return; }
      btn.disabled = true; btn.textContent = 'Saving…';
      try {
        const res = await api.post('/auth/change-password', { new_password: npass.value, new_password_confirmation: cpass.value });
        state.user = res.user; toast('Password updated', 'success'); location.hash = '#/dashboard'; CRM.render();
      } catch (err) { toast(err.message || 'Failed', 'error'); btn.disabled = false; btn.textContent = 'Set new password & continue'; }
    }
    btn.addEventListener('click', submit);
    app.innerHTML = '';
    app.appendChild(el('div', { class: 'auth', 'data-testid': 'force-change-password' },
      el('div', { class: 'auth__brand' }, el('div', {},
        el('div', { class: 'nav__logo', style: 'width:40px;height:40px;font-size:18px;border-radius:11px' }, 'RE'),
        el('h1', { style: 'margin-top:28px' }, 'Secure your account'),
        el('p', {}, 'For your security, please set a new password before you start. Your temporary password can no longer be used.'))),
      el('div', { class: 'auth__form' }, el('form', { class: 'auth__card', onsubmit: submit },
        el('h2', {}, 'Create a new password'),
        el('div', { class: 'sub' }, 'Signed in as ' + (state.user?.email || '')),
        el('div', { class: 'field' }, el('label', {}, 'New password'), npass),
        el('div', { class: 'field' }, el('label', {}, 'Confirm password'), cpass),
        btn))));
  };

  // ---------- Impersonation banner ----------
  CRM.renderImpersonationBanner = function () {
    document.getElementById('imp-banner')?.remove();
    if (!sessionStorage.getItem('crm_admin_token')) return;
    const bar = el('div', { id: 'imp-banner', 'data-testid': 'impersonation-banner',
      style: 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#0f172a;color:#fff;padding:8px 16px;display:flex;align-items:center;gap:12px;font-size:13px;box-shadow:0 2px 10px rgba(0,0,0,.25)' },
      el('i', { class: 'fa-solid fa-user-secret' }),
      el('span', {}, 'Preview mode — viewing as ', el('b', {}, (state.user?.name || '') + ' · ' + (state.user?.role_name || ''))),
      el('button', { class: 'btn btn--sm', style: 'margin-left:auto;background:#fff;color:#0f172a', 'data-testid': 'exit-preview',
        onclick: () => {
          const adminTok = sessionStorage.getItem('crm_admin_token');
          sessionStorage.removeItem('crm_admin_token'); setToken(adminTok); state.user = null;
          sessionStorage.removeItem('crm_homed'); location.hash = '#/preview'; CRM.render();
        } }, 'Exit preview'));
    document.body.appendChild(bar);
    document.querySelector('.shell')?.style.setProperty('padding-top', '38px');
  };

  // ---------- Preview Roles page ----------
  CRM.pages.preview = async function (view) {
    view.innerHTML = '<div class="spinner"></div>';
    const { data: users } = await api.get('/users');
    view.innerHTML = '';
    view.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:16px' },
      'Instantly view the CRM exactly as any team member sees it. Click Preview to open their dashboard, then use the banner to return.'));
    const byDept = {};
    users.forEach(u => { const d = u.role?.department || 'other'; (byDept[d] = byDept[d] || []).push(u); });
    DEPTS.concat([{ key: 'partner', name: 'Channel Partners', icon: 'fa-handshake' }, { key: 'other', name: 'Other', icon: 'fa-user' }]).forEach(d => {
      const list = byDept[d.key]; if (!list || !list.length) return;
      const grid = el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-bottom:22px' });
      list.forEach(u => grid.appendChild(el('div', { class: 'card', style: 'padding:14px;display:flex;align-items:center;gap:12px', 'data-testid': 'preview-user-' + u.id },
        el('div', { class: 'avatar' }, initials(u.name)),
        el('div', { style: 'flex:1;min-width:0' }, el('b', { style: 'display:block' }, u.name), el('span', { style: 'font-size:12px;color:var(--text-3)' }, u.role?.name || '—')),
        u.role?.slug === 'admin' ? el('span', { class: 'chip' }, 'you')
          : el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'preview-btn-' + u.id, onclick: () => previewAs(u) }, el('i', { class: 'fa-solid fa-eye' }), 'Preview'))));
      view.appendChild(el('div', {}, el('div', { style: 'font-weight:700;margin-bottom:10px' }, el('i', { class: 'fa-solid ' + d.icon, style: 'margin-right:8px;color:var(--primary)' }), d.name), grid));
    });

    async function previewAs(u) {
      try {
        const res = await api.post('/auth/impersonate', { user_id: u.id });
        sessionStorage.setItem('crm_admin_token', token());
        setToken(res.token); state.user = res.user; sessionStorage.removeItem('crm_homed');
        toast('Now previewing as ' + u.name, 'success'); location.hash = '#/dashboard'; CRM.render();
      } catch (e) { toast(e.message || 'Preview failed', 'error'); }
    }
  };

  // ---------- Onboarding timeline (dashboard banner) ----------
  CRM.renderOnboardingBanner = async function (view) {
    if (!(state.user?.role === 'admin' || state.user?.role === 'process_admin')) return;
    let ob; try { ob = await api.get('/onboarding'); } catch (e) { return; }
    const restartBtn = () => state.user?.role === 'admin'
      ? el('button', { class: 'btn btn--sm', 'data-testid': 'ob-restart', onclick: async () => {
          if (!confirm('Restart the setup wizard? Your projects, users and data stay — only the setup checklist resets.')) return;
          try { await api.post('/onboarding/reset'); sessionStorage.removeItem('crm_onboard_checked'); toast('Setup restarted', 'success'); location.hash = '#/onboarding'; CRM.render(); }
          catch (e) { toast(e.message, 'error'); } } }, el('i', { class: 'fa-solid fa-rotate-right' }), 'Restart setup')
      : null;

    if (ob.completed) {
      view.insertBefore(el('div', { class: 'card', 'data-testid': 'onboarding-complete', style: 'padding:12px 16px;margin-bottom:18px;display:flex;align-items:center;gap:12px;border-left:4px solid var(--won)' },
        el('i', { class: 'fa-solid fa-circle-check', style: 'color:var(--won);font-size:18px' }),
        el('div', { style: 'flex:1' }, el('b', {}, 'Setup complete'), el('span', { style: 'color:var(--text-3);font-size:12px;margin-left:8px' }, 'Your CRM is fully configured.')),
        restartBtn()), view.firstChild);
      return;
    }
    const steps = [
      { key: 'profile', label: 'Your profile', route: 'onboarding' },
      { key: 'projects', label: 'Set up a project', route: 'onboarding' },
      { key: 'users', label: 'Map department users', route: 'users' },
      { key: 'inventory', label: 'Upload inventory', route: 'onboarding' },
      { key: 'process_admin', label: 'Assign a Process Admin', route: 'users' },
    ];
    const chips = steps.map(s => {
      const done = ob.steps[s.key];
      return el('a', { href: '#/' + s.route, 'data-testid': 'ob-step-' + s.key,
        style: 'display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;text-decoration:none;border:1px solid var(--border);background:' + (done ? 'rgba(34,197,94,.08)' : 'var(--surface)') + ';color:var(--text-1);font-size:13px;transition:transform .15s',
        onmouseover: (e) => e.currentTarget.style.transform = 'translateY(-2px)', onmouseout: (e) => e.currentTarget.style.transform = '' },
        el('i', { class: 'fa-solid ' + (done ? 'fa-circle-check' : 'fa-circle'), style: 'color:' + (done ? 'var(--won)' : 'var(--text-3)') }),
        el('span', {}, s.label));
    });
    const pct = ob.progress.pct;
    const banner = el('div', { class: 'card', 'data-testid': 'onboarding-timeline', style: 'padding:18px;margin-bottom:18px;border-left:4px solid var(--primary)' },
      el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:12px' },
        el('div', { style: 'flex:1' }, el('div', { style: 'font-weight:800;font-size:16px' }, 'Finish setting up your CRM'),
          el('div', { style: 'font-size:12px;color:var(--text-3)' }, ob.progress.done + ' of ' + ob.progress.total + ' steps complete')),
        el('div', { style: 'font-weight:800;color:var(--primary)' }, pct + '%'),
        restartBtn(),
        state.user?.role === 'admin' ? el('a', { href: '#/onboarding', class: 'btn btn--sm btn--primary', 'data-testid': 'ob-resume' }, 'Resume setup') : null),
      el('div', { style: 'height:6px;border-radius:6px;background:var(--surface-2);overflow:hidden;margin-bottom:14px' },
        el('div', { style: 'height:100%;width:' + pct + '%;background:var(--primary);transition:width .5s' })),
      el('div', { style: 'display:flex;gap:10px;flex-wrap:wrap' }, ...chips));
    view.insertBefore(banner, view.firstChild);
  };

  // ---------- Onboarding wizard ----------
  CRM.pages.onboarding = async function (view) {
    if (state.user?.role !== 'admin') { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-lock' }), el('div', {}, 'Only the Super Admin runs onboarding.'))); return; }
    const ctx = { step: 0, projectType: null, project: null, roles: [], ob: null };
    ctx.roles = (await api.get('/roles')).data;
    ctx.ob = await api.get('/onboarding');
    CRM.setActions(null);
    const host = el('div', { 'data-testid': 'onboarding-wizard', style: 'max-width:820px;margin:0 auto' });
    view.innerHTML = ''; view.appendChild(host);

    const STEPS = ['Welcome', 'Projects?', 'Project type', 'Project info', 'Map users', 'Inventory', 'Launch'];
    function railEl() {
      return el('div', { style: 'display:flex;gap:6px;margin-bottom:22px' }, ...STEPS.map((s, i) =>
        el('div', { style: 'flex:1;height:5px;border-radius:5px;background:' + (i <= ctx.step ? 'var(--primary)' : 'var(--surface-2)') + ';transition:background .3s' })));
    }
    function card(children) {
      host.innerHTML = '';
      host.appendChild(railEl());
      host.appendChild(el('div', { class: 'card', style: 'padding:28px' }, ...children));
    }
    const go = (n) => { ctx.step = n; renderStep(); };

    function renderStep() {
      if (ctx.step === 0) return stepWelcome();
      if (ctx.step === 1) return stepChoice();
      if (ctx.step === 2) return stepType();
      if (ctx.step === 3) return stepInfo();
      if (ctx.step === 4) return stepUsers();
      if (ctx.step === 5) return stepInventory();
      if (ctx.step === 6) return stepLaunch();
    }

    function stepWelcome() {
      const nameI = el('input', { class: 'input', 'data-testid': 'ob-name', value: state.user.name || '' });
      const phoneI = el('input', { class: 'input', 'data-testid': 'ob-phone', value: state.user.phone || '' });
      card([
        el('h2', { style: 'margin:0 0 4px' }, 'Welcome to your CRM 👋'),
        el('p', { style: 'color:var(--text-3);margin-top:0' }, 'Let\'s get you set up. First, confirm your details.'),
        el('div', { class: 'field' }, el('label', {}, 'Your name'), nameI),
        el('div', { class: 'field' }, el('label', {}, 'Contact number'), phoneI),
        el('div', { class: 'field' }, el('label', {}, 'Email (login ID)'), el('input', { class: 'input', value: state.user.email, disabled: 'true' })),
        el('div', { style: 'display:flex;justify-content:flex-end;margin-top:10px' },
          el('button', { class: 'btn btn--primary', 'data-testid': 'ob-welcome-next', onclick: async () => {
            try { await api.put('/users/' + state.user.id, { name: nameI.value, phone: phoneI.value }); await api.put('/onboarding', { step: 'profile', value: true }); state.user.name = nameI.value; go(1); }
            catch (e) { toast(e.message, 'error'); } } }, 'Continue')),
      ]);
    }

    function stepChoice() {
      const choose = (c) => el('div', { class: 'card', 'data-testid': 'ob-choice-' + c.k, style: 'flex:1;padding:22px;cursor:pointer;text-align:center;border:2px solid var(--border);transition:border-color .2s',
        onmouseover: (e) => e.currentTarget.style.borderColor = 'var(--primary)', onmouseout: (e) => e.currentTarget.style.borderColor = 'var(--border)', onclick: c.fn },
        el('i', { class: 'fa-solid ' + c.icon, style: 'font-size:28px;color:var(--primary)' }),
        el('div', { style: 'font-weight:700;margin-top:10px' }, c.title), el('div', { style: 'font-size:12px;color:var(--text-3);margin-top:4px' }, c.sub));
      card([
        el('h2', { style: 'margin:0 0 4px' }, 'Would you like to set up a project now?'),
        el('p', { style: 'color:var(--text-3);margin-top:0' }, 'You can always do this later from your dashboard.'),
        el('div', { style: 'display:flex;gap:16px;margin-top:14px' },
          choose({ k: 'now', icon: 'fa-rocket', title: 'Set up projects now', sub: 'Create a project, map your team & inventory', fn: () => go(2) }),
          choose({ k: 'later', icon: 'fa-clock', title: 'I\'ll do this later', sub: 'Go to dashboard with a setup checklist', fn: async () => { await api.put('/onboarding', { setup_choice: 'later' }); toast('No problem — your setup checklist is on the dashboard', 'success'); location.hash = '#/dashboard'; CRM.render(); } })),
      ]);
    }

    function stepType() {
      const pick = (t) => el('div', { class: 'card', 'data-testid': 'ob-type-' + t.k, style: 'flex:1;padding:22px;cursor:pointer;text-align:center;border:2px solid var(--border);transition:border-color .2s',
        onmouseover: (e) => e.currentTarget.style.borderColor = 'var(--primary)', onmouseout: (e) => e.currentTarget.style.borderColor = 'var(--border)',
        onclick: () => { ctx.projectType = t.k; go(3); } },
        el('i', { class: 'fa-solid ' + t.icon, style: 'font-size:30px;color:var(--primary)' }),
        el('div', { style: 'font-weight:700;margin-top:10px' }, t.title), el('div', { style: 'font-size:12px;color:var(--text-3);margin-top:4px' }, t.sub));
      card([
        el('h2', { style: 'margin:0 0 4px' }, 'What type of project is this?'),
        el('p', { style: 'color:var(--text-3);margin-top:0' }, 'The next form adapts to the type you pick.'),
        el('div', { style: 'display:flex;gap:16px;margin-top:14px' },
          pick({ k: 'plotted', icon: 'fa-map', title: 'Plotted Development', sub: 'Plots / land parcels' }),
          pick({ k: 'residential', icon: 'fa-building', title: 'Residential Development', sub: 'Apartments / towers / units' })),
        el('div', { style: 'margin-top:16px' }, el('button', { class: 'btn btn--ghost btn--sm', onclick: () => go(1) }, '← Back')),
      ]);
    }

    function stepInfo() {
      const f = {};
      const inp = (key, label, opts = {}) => { const i = el('input', Object.assign({ class: 'input', 'data-testid': 'ob-proj-' + key }, opts)); i.addEventListener('input', () => f[key] = i.value); return el('div', { class: 'field' }, el('label', {}, label), i); };
      const common = [inp('name', 'Project name'), inp('code', 'Project code (unique)'), inp('city', 'City'), inp('zone', 'Zone / locality'),
        inp('address', 'Address'),
        el('div', { style: 'display:flex;gap:10px' }, el('div', { style: 'flex:1' }, inp('price_min', 'Price from (₹)', { type: 'number' })), el('div', { style: 'flex:1' }, inp('price_max', 'Price up to (₹)', { type: 'number' })))];
      const typeFields = ctx.projectType === 'plotted'
        ? [inp('total_area', 'Total area (acres)'), inp('plot_sizes', 'Plot sizes offered (e.g. 30x40, 40x60)'), inp('approvals', 'Approvals (RERA/DTCP no.)')]
        : [inp('towers', 'No. of towers'), inp('floors', 'Floors per tower'), inp('configs', 'Unit configs (e.g. 2BHK, 3BHK)'), inp('amenities', 'Key amenities')];
      card([
        el('h2', { style: 'margin:0 0 4px' }, (ctx.projectType === 'plotted' ? 'Plotted' : 'Residential') + ' project details'),
        el('p', { style: 'color:var(--text-3);margin-top:0' }, 'Fill the basics — you can refine later.'),
        ...common, el('div', { style: 'font-weight:700;margin:8px 0;color:var(--primary)' }, ctx.projectType === 'plotted' ? 'Plotted specifics' : 'Residential specifics'), ...typeFields,
        el('div', { style: 'display:flex;justify-content:space-between;margin-top:12px' },
          el('button', { class: 'btn btn--ghost', onclick: () => go(2) }, '← Back'),
          el('button', { class: 'btn btn--primary', 'data-testid': 'ob-proj-save', onclick: async () => {
            if (!f.name || !f.code) { toast('Name & code are required', 'error'); return; }
            const meta = {}; ['total_area', 'plot_sizes', 'approvals', 'towers', 'floors', 'configs', 'amenities'].forEach(k => { if (f[k]) meta[k] = f[k]; });
            try {
              const r = await api.post('/projects', { name: f.name, code: f.code, project_type: ctx.projectType, city: f.city, zone: f.zone, address: f.address, price_min: f.price_min ? +f.price_min : null, price_max: f.price_max ? +f.price_max : null, meta });
              ctx.project = r.project; await api.put('/onboarding', { step: 'projects', value: true }); toast('Project created', 'success'); go(4);
            } catch (e) { toast(e.message || 'Could not create project', 'error'); }
          } }, 'Create project & continue')),
      ]);
    }

    function stepUsers() {
      const added = el('div', { 'data-testid': 'ob-users-added', style: 'margin-top:10px' });
      const roleSel = el('select', { class: 'input', 'data-testid': 'ob-user-role' }, el('option', { value: '' }, 'Select role…'),
        ...ctx.roles.filter(r => !['admin', 'channel_partner'].includes(r.slug)).map(r => el('option', { value: r.id }, r.name)));
      const nameI = el('input', { class: 'input', 'data-testid': 'ob-user-name', placeholder: 'POC name' });
      const emailI = el('input', { class: 'input', 'data-testid': 'ob-user-email', placeholder: 'Email (login ID)' });
      const phoneI = el('input', { class: 'input', 'data-testid': 'ob-user-phone', placeholder: 'Phone (temp password)' });
      async function addUser() {
        if (!nameI.value || !emailI.value || !phoneI.value || !roleSel.value) { toast('Fill name, email, phone & role', 'error'); return; }
        try {
          const r = await api.post('/users', { name: nameI.value, email: emailI.value, phone: phoneI.value, role_id: +roleSel.value });
          await api.put('/onboarding', { step: 'users', value: true });
          added.appendChild(el('div', { class: 'card', style: 'padding:12px;margin-bottom:8px', 'data-testid': 'ob-added-' + r.user.id },
            el('div', { style: 'display:flex;align-items:center;gap:8px' }, el('i', { class: 'fa-solid fa-circle-check', style: 'color:var(--won)' }),
              el('b', {}, r.user.name), el('span', { class: 'chip' }, r.user.role.name),
              el('span', { style: 'margin-left:auto;font-size:11px;color:var(--warm)' }, '✉ credential email sent (mock)')),
            el('div', { style: 'margin-top:8px;background:var(--surface-2);border-radius:8px;padding:10px;font-family:monospace;font-size:12px;white-space:pre-wrap', 'data-testid': 'ob-cred-' + r.user.id }, r.credential_text),
            el('button', { class: 'btn btn--sm', style: 'margin-top:8px', 'data-testid': 'ob-copy-' + r.user.id, onclick: () => { navigator.clipboard?.writeText(r.credential_text); toast('Credentials copied', 'success'); } }, el('i', { class: 'fa-solid fa-copy' }), 'Copy credentials')));
          nameI.value = emailI.value = phoneI.value = ''; roleSel.value = ''; toast('User provisioned', 'success');
        } catch (e) { toast(e.message || 'Could not add user', 'error'); }
      }
      card([
        el('h2', { style: 'margin:0 0 4px' }, 'Map your department users'),
        el('p', { style: 'color:var(--text-3);margin-top:0' }, 'Add a point of contact per department. They get a login (user ID = email, temp password = phone) and are asked to change it on first login. Credentials are emailed (mocked) and shown here to copy/share.'),
        el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' },
          el('div', { class: 'field' }, el('label', {}, 'Role'), roleSel),
          el('div', { class: 'field' }, el('label', {}, 'Name'), nameI),
          el('div', { class: 'field' }, el('label', {}, 'Email'), emailI),
          el('div', { class: 'field' }, el('label', {}, 'Phone'), phoneI)),
        el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'ob-add-user', onclick: addUser }, el('i', { class: 'fa-solid fa-user-plus' }), 'Provision user'),
        added,
        el('div', { style: 'display:flex;justify-content:space-between;margin-top:16px' },
          el('button', { class: 'btn btn--ghost', onclick: () => go(3) }, '← Back'),
          el('button', { class: 'btn btn--primary', 'data-testid': 'ob-users-next', onclick: () => go(5) }, 'Next: Inventory →')),
      ]);
    }

    function stepInventory() {
      const catI = el('input', { class: 'input', 'data-testid': 'ob-inv-category', placeholder: ctx.projectType === 'plotted' ? 'e.g. 30x40 Plots' : 'e.g. Tower A — 2BHK' });
      const countI = el('input', { class: 'input', type: 'number', 'data-testid': 'ob-inv-count', placeholder: 'Number of units', value: '10' });
      const priceI = el('input', { class: 'input', type: 'number', 'data-testid': 'ob-inv-price', placeholder: 'Base price (₹)' });
      const attrI = el('input', { class: 'input', 'data-testid': 'ob-inv-attr', placeholder: ctx.projectType === 'plotted' ? 'Area (sq.ft)' : 'Carpet area (sq.ft)' });
      async function upload() {
        if (!ctx.project) { toast('Create a project first', 'error'); return; }
        if (!catI.value || !(+countI.value > 0)) { toast('Category and count required', 'error'); return; }
        try {
          const ph = await api.post('/phases', { project_id: ctx.project.id, name: catI.value, code: catI.value.replace(/\s+/g, '-').toLowerCase().slice(0, 20) });
          const phaseId = ph.phase?.id || ph.data?.id || ph.id;
          const n = Math.min(+countI.value, 200);
          for (let i = 1; i <= n; i++) {
            await api.post('/plots', { project_id: ctx.project.id, phase_id: phaseId, category: catI.value, number: catI.value.slice(0, 3).toUpperCase() + '-' + i,
              unit_type: ctx.projectType === 'plotted' ? 'plot' : 'unit', price: priceI.value ? +priceI.value : null,
              attributes: { size: attrI.value || null } });
          }
          await api.put('/onboarding', { step: 'inventory', value: true });
          toast(n + ' units added under "' + catI.value + '"', 'success'); go(6);
        } catch (e) { toast(e.message || 'Inventory upload failed', 'error'); }
      }
      card([
        el('h2', { style: 'margin:0 0 4px' }, 'Upload inventory'),
        el('p', { style: 'color:var(--text-3);margin-top:0' }, 'Each category can have its own attributes. Add one category to get started — you can add more from Inventory later.'),
        el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:10px' },
          el('div', { class: 'field' }, el('label', {}, 'Category'), catI),
          el('div', { class: 'field' }, el('label', {}, 'No. of units'), countI),
          el('div', { class: 'field' }, el('label', {}, 'Base price'), priceI),
          el('div', { class: 'field' }, el('label', {}, ctx.projectType === 'plotted' ? 'Plot area' : 'Carpet area'), attrI)),
        el('div', { style: 'display:flex;justify-content:space-between;margin-top:12px' },
          el('button', { class: 'btn btn--ghost', onclick: () => go(4) }, '← Back'),
          el('div', {}, el('button', { class: 'btn btn--ghost', style: 'margin-right:8px', 'data-testid': 'ob-inv-skip', onclick: () => go(6) }, 'Skip for now'),
            el('button', { class: 'btn btn--primary', 'data-testid': 'ob-inv-save', onclick: upload }, 'Add inventory & finish'))),
      ]);
    }

    function stepLaunch() {
      host.innerHTML = '';
      const msgs = ['Preparing your dashboard…', 'Loading your projects…', 'Wiring up your team…', 'Almost ready…'];
      const line = el('div', { style: 'font-size:15px;color:var(--text-2);margin-top:18px', 'data-testid': 'ob-launch-msg' }, msgs[0]);
      host.appendChild(el('div', { 'data-testid': 'ob-launch', style: 'text-align:center;padding:60px 20px' },
        el('div', { class: 'nav__logo', style: 'width:64px;height:64px;font-size:26px;border-radius:18px;margin:0 auto;animation:pulse 1.4s infinite' }, 'RE'),
        el('h2', { style: 'margin-top:24px' }, 'Setting things up 🚀'), line,
        el('div', { style: 'height:6px;border-radius:6px;background:var(--surface-2);overflow:hidden;max-width:360px;margin:26px auto 0' },
          el('div', { id: 'ob-launch-bar', style: 'height:100%;width:0;background:var(--primary);transition:width .6s' }))));
      let i = 0; const bar = document.getElementById('ob-launch-bar');
      const iv = setInterval(() => { i++; if (msgs[i]) line.textContent = msgs[i]; if (bar) bar.style.width = Math.min(100, i * 28) + '%'; }, 1600);
      api.put('/onboarding', { completed: true }).catch(() => {});
      setTimeout(() => { clearInterval(iv); if (bar) bar.style.width = '100%'; sessionStorage.removeItem('crm_homed'); toast('Your CRM is ready!', 'success'); location.hash = '#/dashboard'; CRM.render(); }, 6500);
    }

    renderStep();
  };
})();
