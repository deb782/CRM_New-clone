// ---- People: Users Directory + Roles & Access (granular permissions) ----
(function () {
  const { el, api, toast, modal, initials, state } = CRM;

  const DEPT = { admin: 'Administration', sales: 'Sales', accounts: 'Accounts', legal: 'Legal', crm: 'Customer Relationship', partner: 'Partners' };
  const DEPT_ORDER = ['admin', 'sales', 'accounts', 'legal', 'crm', 'partner'];
  const GROUP_LABELS = { leads: 'Leads & Pipeline', crm: 'Customer Relationship', accounts: 'Accounts & Finance', legal: 'Legal', postsales: 'Post-Sales & Bookings', projects: 'Projects & Inventory', discounts: 'Approvals', config: 'Configuration & Setup', workflow: 'Workflow Automation', users: 'User Management', partner: 'Partner Portal' };
  const GROUP_ICON = { leads: 'fa-users', crm: 'fa-headset', accounts: 'fa-indian-rupee-sign', legal: 'fa-scale-balanced', postsales: 'fa-file-contract', projects: 'fa-building', discounts: 'fa-gavel', config: 'fa-sliders', workflow: 'fa-diagram-project', users: 'fa-user-shield', partner: 'fa-handshake' };

  // Reusable labelled toggle switch (used in place of yes/no dropdowns)
  CRM.switchField = function (checked, onChange, testid) {
    const knob = el('span', { class: 'sw__knob' });
    const s = el('button', { class: 'sw ' + (checked ? 'is-on' : ''), type: 'button', 'data-testid': testid || null }, knob);
    s.addEventListener('click', () => { const on = !s.classList.contains('is-on'); s.classList.toggle('is-on', on); onChange(on); });
    return s;
  };

  // ============ USERS DIRECTORY ============
  CRM.pages.users = async function (view) {
    const [users, roles] = await Promise.all([api.get('/users').then(r => r.data), api.get('/roles').then(r => r.data)]);
    CRM.setActions(el('div', { style: 'display:flex;gap:8px' },
      CRM.can('users.manage') ? el('button', { class: 'btn btn--sm', 'data-testid': 'goto-access', onclick: () => location.hash = '#/access' }, el('i', { class: 'fa-solid fa-shield-halved' }), 'Roles & Access') : null,
      el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'add-user', onclick: () => userForm() }, el('i', { class: 'fa-solid fa-plus' }), 'Add User')));
    view.innerHTML = '';

    const active = users.filter(u => u.is_active).length;
    view.appendChild(el('div', { class: 'kpi-row', style: 'margin-bottom:24px' },
      dirStat('Team members', users.length),
      dirStat('Active', active),
      dirStat('Roles defined', roles.length),
      dirStat('Departments', new Set(roles.map(r => r.department)).size)));

    const search = el('input', { class: 'input', placeholder: 'Search people by name or email…', 'data-testid': 'user-search', style: 'max-width:340px' });
    view.appendChild(el('div', { style: 'margin-bottom:18px' }, search));
    const listWrap = el('div');
    view.appendChild(listWrap);

    function render(q) {
      q = (q || '').toLowerCase();
      listWrap.innerHTML = '';
      DEPT_ORDER.forEach(dep => {
        const members = users.filter(u => (u.role && u.role.department) === dep && (!q || (u.name + u.email).toLowerCase().includes(q)));
        if (!members.length) return;
        listWrap.appendChild(el('div', { class: 'section-title' }, el('i', { class: 'fa-solid fa-people-group' }), DEPT[dep] || dep, el('span', { class: 'chip', style: 'margin-left:8px' }, members.length)));
        const grid = el('div', { class: 'people-grid' });
        members.forEach(u => grid.appendChild(personCard(u)));
        listWrap.appendChild(grid);
      });
      if (!listWrap.children.length) listWrap.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-user-slash' }), el('div', {}, 'No people match')));
    }

    function personCard(u) {
      const toggle = CRM.switchField(u.is_active, async (on) => {
        try { await api.put('/users/' + u.id, { is_active: on }); u.is_active = on; toast(on ? 'Activated' : 'Deactivated', 'success'); }
        catch (e) { toast(e.message, 'error'); }
      }, 'user-active-' + u.id);
      return el('div', { class: 'person-card', 'data-testid': 'user-row-' + u.id },
        el('div', { class: 'person-card__top' },
          el('div', { class: 'avatar avatar--lg', style: u.avatar_color ? 'background:' + u.avatar_color + ';color:#fff' : null }, initials(u.name)),
          el('button', { class: 'icon-btn', 'data-testid': 'edit-user-' + u.id, onclick: () => userForm(u) }, el('i', { class: 'fa-solid fa-pen' }))),
        el('div', { class: 'person-card__name' }, u.name),
        el('div', { class: 'person-card__email' }, u.email),
        el('div', { class: 'person-card__foot' },
          el('span', { class: 'stage-pill' }, u.role ? u.role.name : '—'),
          el('div', { class: 'person-card__active' }, el('span', { class: 'mut' }, u.is_active ? 'Active' : 'Inactive'), toggle)));
    }

    function userForm(user) {
      const f = Object.assign({ role_id: roles[0] && roles[0].id }, user ? { name: user.name, email: user.email, phone: user.phone, role_id: user.role && user.role.id } : {});
      const inp = (k, ph, type = 'text') => { const i = el('input', { class: 'input', type, value: f[k] || '', placeholder: ph, 'data-testid': 'u-' + k }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const roleSel = el('select', { class: 'select', 'data-testid': 'u-role' }, ...roles.map(r => el('option', { value: r.id, selected: f.role_id === r.id ? 'selected' : null }, r.name + ' · ' + (DEPT[r.department] || r.department))));
      roleSel.addEventListener('change', () => f.role_id = Number(roleSel.value));
      const body = el('div', {},
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Full name'), inp('name', 'Full name')), el('div', { class: 'field' }, el('label', {}, 'Email (login ID)'), user ? el('input', { class: 'input', value: f.email, disabled: 'disabled' }) : inp('email', 'name@company.com', 'email'))),
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Role'), roleSel), el('div', { class: 'field' }, el('label', {}, 'Phone' + (user ? '' : ' (temp password)')), inp('phone', '9xxxxxxxxx'))),
        user ? el('div', { class: 'field' }, el('label', {}, 'Reset password (optional)'), inp('password', 'Leave blank to keep', 'password')) : el('div', { class: 'help' }, 'A temporary password (the phone number) is issued; the user must change it at first login.'));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'u-save' }, 'Save');
      const m = modal({ title: user ? 'Edit ' + user.name : 'New team member', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        try {
          if (user) await api.put('/users/' + user.id, { name: f.name, role_id: f.role_id, phone: f.phone, password: f.password || undefined });
          else { const r = await api.post('/users', { name: f.name, email: f.email, role_id: f.role_id, phone: f.phone }); if (r.credential_text) navigator.clipboard?.writeText(r.credential_text).catch(() => {}); }
          toast(user ? 'Saved' : 'User created — credentials copied', 'success'); m.close(); CRM.render();
        } catch (err) { toast(err.message, 'error'); }
      });
    }

    render('');
    search.addEventListener('input', () => render(search.value));
  };

  function dirStat(label, val) {
    return el('div', { class: 'kpi' }, el('div', { class: 'kpi__label' }, label), el('div', { class: 'kpi__val' }, String(val)));
  }

  // ============ ROLES & ACCESS (granular permission control) ============
  CRM.pages.access = async function (view) {
    CRM.setActions(null);
    const [roles, perms] = await Promise.all([api.get('/roles').then(r => r.data), api.get('/permissions').then(r => r.data)]);
    view.innerHTML = '';

    // group permissions by function
    const byGroup = {};
    perms.forEach(p => { (byGroup[p.group] = byGroup[p.group] || []).push(p); });
    const groupKeys = Object.keys(byGroup);

    let selected = roles.find(r => r.slug !== 'admin' && r.slug !== 'channel_partner') || roles[0];
    let enabled = new Set(); let dirty = false;

    function isCustomised(r) {
      if (r.slug === 'admin') return false;
      const cur = (r.permissions || []).map(p => p.key).sort().join(',');
      const def = (r.default_keys || []).slice().sort().join(',');
      return cur !== def;
    }

    const roleList = el('div', { class: 'access-roles', 'data-testid': 'access-roles' });
    const panel = el('div', { class: 'access-panel card', 'data-testid': 'access-panel' });

    view.appendChild(el('div', { class: 'access-intro' },
      el('div', {}, el('h2', { class: 'access-intro__h' }, 'Roles & Access'),
        el('p', { class: 'access-intro__p' }, 'Each role starts with the access its job needs. Turn features on or off per role — grant a team something outside its usual remit, or lock it down. Changes apply the next time that user signs in.'))));

    view.appendChild(el('div', { class: 'access-grid' }, roleList, panel));

    function paintRoles() {
      roleList.innerHTML = '';
      DEPT_ORDER.forEach(dep => {
        const rs = roles.filter(r => r.department === dep);
        if (!rs.length) return;
        roleList.appendChild(el('div', { class: 'access-roles__dept' }, DEPT[dep] || dep));
        rs.forEach(r => {
          const locked = r.slug === 'admin';
          const item = el('button', { class: 'access-role' + (selected && selected.id === r.id ? ' active' : '') + (locked ? ' locked' : ''), 'data-testid': 'access-role-' + r.slug, onclick: () => selectRole(r) },
            el('div', {}, el('div', { class: 'access-role__name' }, r.name, isCustomised(r) ? el('span', { class: 'access-role__diff', 'data-testid': 'access-diff-' + r.slug }, 'Customised') : null), el('div', { class: 'access-role__meta' }, locked ? 'Full access' : (r.permissions ? r.permissions.length : 0) + ' features · ' + r.users_count + ' users')),
            locked ? el('i', { class: 'fa-solid fa-lock' }) : el('i', { class: 'fa-solid fa-chevron-right' }));
          roleList.appendChild(item);
        });
      });
    }

    function selectRole(r) {
      if (dirty && !confirm('Discard unsaved access changes?')) return;
      selected = r; dirty = false;
      enabled = new Set((r.permissions || []).map(p => p.id));
      paintRoles(); paintPanel();
    }

    function paintPanel() {
      panel.innerHTML = '';
      const locked = selected.slug === 'admin';
      const searchInput = el('input', { class: 'input', placeholder: 'Search a feature…', 'data-testid': 'access-search', style: 'max-width:320px' });
      const saveBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'access-save', disabled: 'disabled' }, 'Save access');
      const resetBtn = el('button', { class: 'btn', 'data-testid': 'access-reset' }, el('i', { class: 'fa-solid fa-rotate-left' }), 'Reset to default');
      resetBtn.addEventListener('click', async () => {
        if (!confirm('Reset ' + selected.name + ' to its default (KRA) access?')) return;
        resetBtn.disabled = true;
        try {
          const r = await api.post('/roles/' + selected.id + '/reset-permissions', {});
          const idx = roles.findIndex(x => x.id === selected.id);
          if (idx >= 0) { roles[idx].permissions = r.role.permissions; selected = roles[idx]; }
          dirty = false; toast('Reset to default access', 'success'); paintRoles(); paintPanel();
        } catch (e) { toast(e.message, 'error'); resetBtn.disabled = false; }
      });

      panel.appendChild(el('div', { class: 'access-panel__head' },
        el('div', {}, el('div', { class: 'access-panel__role' }, selected.name),
          el('div', { class: 'access-panel__sub' }, locked ? 'Super Admin has unrestricted access to every feature.' : (DEPT[selected.department] || selected.department) + ' · ' + selected.users_count + ' user(s)' + (isCustomised(selected) ? ' · customised' : ' · default access'))),
        locked ? null : el('div', { class: 'access-panel__actions' }, isCustomised(selected) ? resetBtn : null, saveBtn)));

      if (locked) { panel.appendChild(el('div', { class: 'empty', style: 'padding:40px' }, el('i', { class: 'fa-solid fa-shield-halved' }), el('div', {}, 'Full access — nothing to configure'))); return; }
      panel.appendChild(el('div', { style: 'margin:4px 0 20px' }, searchInput));

      const groupsWrap = el('div', { class: 'access-groups' });
      panel.appendChild(groupsWrap);

      function markDirty() { dirty = true; saveBtn.removeAttribute('disabled'); }

      function paintGroups(q) {
        q = (q || '').toLowerCase();
        groupsWrap.innerHTML = '';
        groupKeys.forEach(g => {
          const items = byGroup[g].filter(p => !q || (p.label + ' ' + p.key).toLowerCase().includes(q));
          if (!items.length) return;
          const onCount = items.filter(p => enabled.has(p.id)).length;
          const rows = el('div', { class: 'access-feature-rows' });
          const groupSwitch = CRM.switchField(onCount === items.length, (on) => {
            items.forEach(p => { on ? enabled.add(p.id) : enabled.delete(p.id); });
            markDirty(); paintGroups(searchInput.value);
          }, 'access-group-' + g);
          items.forEach(p => {
            rows.appendChild(el('div', { class: 'access-feature' },
              el('div', {}, el('div', { class: 'access-feature__t' }, p.label || p.key), el('div', { class: 'access-feature__k' }, p.key)),
              CRM.switchField(enabled.has(p.id), (on) => { on ? enabled.add(p.id) : enabled.delete(p.id); markDirty(); }, 'access-perm-' + p.key.replace(/\./g, '-'))));
          });
          groupsWrap.appendChild(el('div', { class: 'access-group' },
            el('div', { class: 'access-group__head' },
              el('div', { class: 'access-group__title' }, el('i', { class: 'fa-solid ' + (GROUP_ICON[g] || 'fa-cube') }), GROUP_LABELS[g] || g,
                el('span', { class: 'access-group__count' }, onCount + '/' + items.length)),
              el('div', { class: 'access-group__all' }, el('span', { class: 'mut' }, 'All'), groupSwitch)),
            rows));
        });
        if (!groupsWrap.children.length) groupsWrap.appendChild(el('div', { class: 'empty', style: 'padding:30px' }, 'No features match'));
      }

      searchInput.addEventListener('input', () => paintGroups(searchInput.value));
      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try {
          const r = await api.put('/roles/' + selected.id + '/permissions', { permission_ids: [...enabled] });
          const idx = roles.findIndex(x => x.id === selected.id);
          if (idx >= 0) { roles[idx].permissions = r.role.permissions; selected = roles[idx]; }
          dirty = false; toast('Access updated for ' + selected.name, 'success'); paintRoles(); paintPanel();
        } catch (e) { toast(e.message, 'error'); saveBtn.disabled = false; }
      });

      paintGroups('');
    }

    selectRole(selected);
  };
})();
