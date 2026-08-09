// ---- Configuration pages: Scoring, Automations, Templates, Users ----
(function () {
  const { el, api, toast, modal, initials } = CRM;

  function tableWrap(headers, rows) {
    return el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, ...headers.map(h => el('th', {}, h)))),
      el('tbody', {}, ...rows)));
  }

  // ========== SCORING RULES ==========
  CRM.pages.scoring = async function (view) {
    const recalc = el('button', { class: 'btn btn--sm', 'data-testid': 'recalc-all', onclick: async () => { const r = await api.post('/scoring-rules/recalculate-all'); toast('Recalculated ' + r.recalculated + ' leads', 'success'); } }, el('i', { class: 'fa-solid fa-arrows-rotate' }), 'Recalculate All');
    const addBtn = el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'add-scoring', onclick: () => ruleForm() }, el('i', { class: 'fa-solid fa-plus' }), 'Add Rule');
    CRM.setActions(el('div', { style: 'display:flex;gap:8px' }, recalc, addBtn));

    const rules = await api.get('/scoring-rules').then(r => r.data);
    view.innerHTML = '';
    view.appendChild(el('p', { style: 'color:var(--text-2);margin-bottom:16px' }, 'Configure scoring factors. Total ≥70 = Hot, 40–69 = Warm, <40 = Cold. Applied on qualification and daily recalculation.'));

    const cats = {};
    rules.forEach(r => { (cats[r.category] = cats[r.category] || []).push(r); });
    Object.entries(cats).forEach(([cat, list]) => {
      view.appendChild(el('div', { class: 'section-title' }, el('i', { class: 'fa-solid fa-layer-group' }), cat.charAt(0).toUpperCase() + cat.slice(1)));
      view.appendChild(tableWrap(['Factor', 'Field', 'Condition', 'Points', 'Active', ''], list.map(r =>
        el('tr', { 'data-testid': 'scoring-row-' + r.id },
          el('td', { style: 'font-weight:500' }, r.factor),
          el('td', {}, el('span', { class: 'chip mono' }, r.field)),
          el('td', { class: 'mono' }, r.operator + ' ' + (r.value ?? '')),
          el('td', {}, el('b', { class: 'mono', style: 'color:var(--accent)' }, '+' + r.points)),
          el('td', {}, r.active ? el('span', { class: 'tag-ok' }, 'Yes') : el('span', { style: 'color:var(--text-3)' }, 'No')),
          el('td', { style: 'text-align:right' },
            el('button', { class: 'btn btn--ghost btn--sm', onclick: () => ruleForm(r) }, el('i', { class: 'fa-solid fa-pen' })),
            el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'del-scoring-' + r.id, onclick: async () => { if (confirm('Delete rule?')) { await api.del('/scoring-rules/' + r.id); toast('Deleted'); CRM.render(); } } }, el('i', { class: 'fa-solid fa-trash' })))))));
    });

    function ruleForm(rule) {
      const f = Object.assign({ category: 'qualification', operator: '=', points: 5, active: true }, rule || {});
      const inp = (k, ph, type = 'text') => { const i = el('input', { class: 'input', type, value: f[k] ?? '', placeholder: ph, 'data-testid': 'sr-' + k }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const catSel = el('select', { class: 'select', 'data-testid': 'sr-category' }, ...['engagement','qualification','responsiveness','recency','source'].map(c => el('option', { value: c, selected: f.category === c ? 'selected' : null }, c)));
      catSel.addEventListener('change', () => f.category = catSel.value);
      const opSel = el('select', { class: 'select', 'data-testid': 'sr-operator' }, ...['=','!=','>','>=','<','<=','in','exists'].map(o => el('option', { value: o, selected: f.operator === o ? 'selected' : null }, o)));
      opSel.addEventListener('change', () => f.operator = opSel.value);
      const body = el('div', {},
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Category'), catSel), el('div', { class: 'field' }, el('label', {}, 'Factor label'), inp('factor', 'Budget confirmed'))),
        el('div', { class: 'field' }, el('label', {}, 'Field'), inp('field', 'e.g. budget_confirmed, email_opens, days_since_contact')),
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Operator'), opSel), el('div', { class: 'field' }, el('label', {}, 'Value'), inp('value', '1'))),
        el('div', { class: 'field' }, el('label', {}, 'Points'), inp('points', '5', 'number')),
        el('div', { class: 'help' }, 'Fields: budget_confirmed, timeline_clear, location_specified, decision_maker, email_opens, email_clicks, message_responses, contact_verified, calls_connected, days_since_contact, source'));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'sr-save' }, 'Save');
      const m = modal({ title: rule ? 'Edit Scoring Rule' : 'New Scoring Rule', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        const payload = { category: f.category, factor: f.factor, field: f.field, operator: f.operator, value: f.value, points: Number(f.points), active: true };
        try { rule ? await api.put('/scoring-rules/' + rule.id, payload) : await api.post('/scoring-rules', payload); toast('Saved', 'success'); m.close(); CRM.render(); }
        catch (err) { toast(err.message, 'error'); }
      });
    }
  };

  // ========== AUTOMATIONS ==========
  CRM.pages.automation = async function (view) {
    CRM.setActions(el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'add-automation', onclick: () => autoForm() }, el('i', { class: 'fa-solid fa-plus' }), 'Add Rule'));
    const [rules, logs] = await Promise.all([api.get('/automation-rules').then(r => r.data), api.get('/automation-logs?per_page=20').then(r => r.data).catch(() => [])]);
    view.innerHTML = '';
    view.appendChild(el('p', { style: 'color:var(--text-2);margin-bottom:16px' }, 'Event-driven rules run within SLA on lead/status/engagement events (Sections S & T).'));
    view.appendChild(tableWrap(['Name', 'Event', 'Conditions', 'Actions', 'Active', ''], rules.map(r =>
      el('tr', { 'data-testid': 'auto-row-' + r.id },
        el('td', { style: 'font-weight:500' }, r.name),
        el('td', {}, el('span', { class: 'chip mono' }, r.event)),
        el('td', { class: 'mono', style: 'font-size:12px;color:var(--text-2)' }, r.conditions && Object.keys(r.conditions).length ? JSON.stringify(r.conditions) : '—'),
        el('td', {}, el('div', { class: 'pill-row' }, ...(r.actions || []).map(a => el('span', { class: 'chip' }, a.type)))),
        el('td', {}, r.active ? el('span', { class: 'tag-ok' }, 'On') : el('span', { style: 'color:var(--text-3)' }, 'Off')),
        el('td', { style: 'text-align:right' },
          el('button', { class: 'btn btn--ghost btn--sm', onclick: () => autoForm(r) }, el('i', { class: 'fa-solid fa-pen' })),
          el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'del-auto-' + r.id, onclick: async () => { if (confirm('Delete rule?')) { await api.del('/automation-rules/' + r.id); toast('Deleted'); CRM.render(); } } }, el('i', { class: 'fa-solid fa-trash' }))))) ));

    view.appendChild(el('div', { class: 'section-title' }, el('i', { class: 'fa-solid fa-clock-rotate-left' }), 'Recent Automation Logs'));
    view.appendChild(tableWrap(['Event', 'Action', 'Status', 'When'], (logs || []).map(l =>
      el('tr', {}, el('td', { class: 'mono' }, l.event), el('td', {}, l.action),
        el('td', {}, l.status === 'success' ? el('span', { class: 'tag-ok' }, '✓ success') : el('span', { class: 'tag-bad' }, '✗ ' + l.status)),
        el('td', { style: 'color:var(--text-3)' }, CRM.timeAgo(l.executed_at || l.created_at))))));

    function autoForm(rule) {
      const f = Object.assign({ event: 'status.changed', active: true }, rule || {});
      const inp = (v) => { const i = el('input', { class: 'input', value: v || '', 'data-testid': 'auto-name' }); i.addEventListener('input', () => f.name = i.value); return i; };
      const evSel = el('select', { class: 'select', 'data-testid': 'auto-event' }, ...['lead.created','status.changed','email.opened','email.clicked','whatsapp.replied'].map(e => el('option', { value: e, selected: f.event === e ? 'selected' : null }, e)));
      evSel.addEventListener('change', () => f.event = evSel.value);
      const cond = el('textarea', { class: 'input', rows: 2, 'data-testid': 'auto-cond' }, rule ? JSON.stringify(rule.conditions || {}) : '{"to":"interested"}');
      const acts = el('textarea', { class: 'input', rows: 4, 'data-testid': 'auto-actions' }, rule ? JSON.stringify(rule.actions || [], null, 2) : JSON.stringify([{ type: 'create_task', title: 'Follow-up', due_in_hours: 24 }], null, 2));
      const body = el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Name'), inp(f.name)),
        el('div', { class: 'field' }, el('label', {}, 'Event'), evSel),
        el('div', { class: 'field' }, el('label', {}, 'Conditions (JSON)'), cond),
        el('div', { class: 'field' }, el('label', {}, 'Actions (JSON array)'), acts),
        el('div', { class: 'help' }, 'Action types: create_task, send_email, send_whatsapp, enroll_sequence, pause_sequence'));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'auto-save' }, 'Save');
      const m = modal({ title: rule ? 'Edit Automation' : 'New Automation', wide: true, bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        let conditions, actions;
        try { conditions = JSON.parse(cond.value || '{}'); actions = JSON.parse(acts.value || '[]'); }
        catch (e) { toast('Invalid JSON', 'error'); return; }
        const payload = { name: f.name, event: f.event, conditions, actions, active: true };
        try { rule ? await api.put('/automation-rules/' + rule.id, payload) : await api.post('/automation-rules', payload); toast('Saved', 'success'); m.close(); CRM.render(); }
        catch (err) { toast(err.message, 'error'); }
      });
    }
  };

  // ========== TEMPLATES ==========
  CRM.pages.templates = async function (view) {
    CRM.setActions(el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'add-template', onclick: () => tplForm() }, el('i', { class: 'fa-solid fa-plus' }), 'Add Template'));
    const tpls = await api.get('/templates').then(r => r.data);
    view.innerHTML = '';
    view.appendChild(el('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(300px,1fr))' }, ...tpls.map(t =>
      el('div', { class: 'card', 'data-testid': 'tpl-' + t.id },
        el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' },
          el('b', {}, t.name), el('span', { class: 'chip' }, t.channel)),
        t.subject ? el('div', { style: 'font-size:13px;font-weight:500;margin-bottom:4px' }, t.subject) : null,
        el('div', { style: 'font-size:13px;color:var(--text-2);white-space:pre-wrap' }, (t.body || '').slice(0, 180)),
        el('div', { style: 'margin-top:12px;display:flex;gap:8px' },
          el('button', { class: 'btn btn--ghost btn--sm', onclick: () => tplForm(t) }, el('i', { class: 'fa-solid fa-pen' }), 'Edit'),
          el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'del-tpl-' + t.id, onclick: async () => { if (confirm('Delete template?')) { await api.del('/templates/' + t.id); toast('Deleted'); CRM.render(); } } }, el('i', { class: 'fa-solid fa-trash' })))))));

    function tplForm(tpl) {
      const f = Object.assign({ channel: 'email' }, tpl || {});
      const inp = (k, ph) => { const i = el('input', { class: 'input', value: f[k] || '', placeholder: ph, 'data-testid': 'tpl-' + k }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const chSel = el('select', { class: 'select', 'data-testid': 'tpl-channel' }, ...['email','sms','whatsapp'].map(c => el('option', { value: c, selected: f.channel === c ? 'selected' : null }, c)));
      chSel.addEventListener('change', () => f.channel = chSel.value);
      const bodyTa = el('textarea', { class: 'input', rows: 5, 'data-testid': 'tpl-body' }, f.body || '');
      bodyTa.addEventListener('input', () => f.body = bodyTa.value);
      const body = el('div', {},
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Name'), inp('name', 'Welcome')), el('div', { class: 'field' }, el('label', {}, 'Channel'), chSel)),
        !tpl ? el('div', { class: 'field' }, el('label', {}, 'Slug'), inp('slug', 'welcome_email')) : null,
        el('div', { class: 'field' }, el('label', {}, 'Subject (email)'), inp('subject', 'Subject')),
        el('div', { class: 'field' }, el('label', {}, 'Body'), bodyTa),
        el('div', { class: 'help' }, 'Variables: {{name}}, {{project}}'));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'tpl-save' }, 'Save');
      const m = modal({ title: tpl ? 'Edit Template' : 'New Template', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        try {
          if (tpl) await api.put('/templates/' + tpl.id, { name: f.name, channel: f.channel, subject: f.subject, body: f.body });
          else await api.post('/templates', { name: f.name, slug: f.slug, channel: f.channel, subject: f.subject, body: f.body });
          toast('Saved', 'success'); m.close(); CRM.render();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  };

  // ========== USERS & ROLES ==========
  CRM.pages.users = async function (view) {
    const [users, roles] = await Promise.all([api.get('/users').then(r => r.data), api.get('/roles').then(r => r.data)]);
    CRM.setActions(el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'add-user', onclick: () => userForm() }, el('i', { class: 'fa-solid fa-plus' }), 'Add User'));
    view.innerHTML = '';

    view.appendChild(el('div', { class: 'cards', style: 'margin-bottom:20px' }, ...roles.map(r =>
      el('div', { class: 'card stat' }, el('div', { class: 'k' }, el('i', { class: 'fa-solid fa-user-tag' }), r.name), el('div', { class: 'v mono' }, String(r.users_count))))));

    view.appendChild(tableWrap(['Name', 'Email', 'Role', 'Status', ''], users.map(u =>
      el('tr', { 'data-testid': 'user-row-' + u.id },
        el('td', {}, el('div', { class: 'name-cell' }, el('div', { class: 'avatar' }, initials(u.name)), u.name)),
        el('td', {}, u.email),
        el('td', {}, el('span', { class: 'stage-pill' }, u.role ? u.role.name : '—')),
        el('td', {}, u.is_active ? el('span', { class: 'tag-ok' }, 'Active') : el('span', { class: 'tag-bad' }, 'Inactive')),
        el('td', { style: 'text-align:right' }, el('button', { class: 'btn btn--ghost btn--sm', onclick: () => userForm(u, roles) }, el('i', { class: 'fa-solid fa-pen' })))))));

    function userForm(user) {
      const f = Object.assign({ role_id: roles[0] && roles[0].id }, user || {});
      const inp = (k, ph, type = 'text') => { const i = el('input', { class: 'input', type, value: f[k] || '', placeholder: ph, 'data-testid': 'u-' + k }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const roleSel = el('select', { class: 'select', 'data-testid': 'u-role' }, ...roles.map(r => el('option', { value: r.id, selected: (user && user.role && user.role.id === r.id) ? 'selected' : null }, r.name)));
      roleSel.addEventListener('change', () => f.role_id = roleSel.value);
      const body = el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Name'), inp('name', 'Full name')),
        el('div', { class: 'field' }, el('label', {}, 'Email'), inp('email', 'email', 'email')),
        el('div', { class: 'field' }, el('label', {}, 'Role'), roleSel),
        el('div', { class: 'field' }, el('label', {}, user ? 'New Password (optional)' : 'Password'), inp('password', '••••••••', 'password')),
        el('div', { class: 'field' }, el('label', {}, 'Phone'), inp('phone', 'Phone')));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'u-save' }, 'Save');
      const m = modal({ title: user ? 'Edit User' : 'New User', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        try {
          if (user) await api.put('/users/' + user.id, { name: f.name, role_id: f.role_id, phone: f.phone, password: f.password || undefined });
          else await api.post('/users', { name: f.name, email: f.email, password: f.password, role_id: f.role_id, phone: f.phone });
          toast('Saved', 'success'); m.close(); CRM.render();
        } catch (err) { toast(err.message, 'error'); }
      });
    }
  };
})();
