// ---- Configuration pages: Scoring, Automations, Templates, Users ----
(function () {
  const { el, api, toast, modal, initials, money, can } = CRM;

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
      const STAGES = ['new_lead', 'contacted', 'interested', 'opportunity', 'site_visit_scheduled', 'site_visit_completed', 'negotiation', 'won', 'lost', 'not_interested', 'no_response'];
      const EVENTS = [['lead.created', 'Lead created'], ['status.changed', 'Status changed'], ['whatsapp.replied', 'WhatsApp reply received'], ['email.opened', 'Email opened'], ['email.clicked', 'Email link clicked']];
      const ACTION_TYPES = [['create_task', 'Create task'], ['send_whatsapp', 'Send WhatsApp'], ['send_email', 'Send email'], ['enroll_sequence', 'Enroll in sequence'], ['pause_sequence', 'Pause sequences']];
      const f = { name: rule?.name || '', event: rule?.event || 'status.changed', to: (rule?.conditions && rule.conditions.to) || 'interested' };
      let actions = JSON.parse(JSON.stringify(rule?.actions || [{ type: 'create_task', title: '', due_in_hours: 24, priority: 'high' }]));

      const nameInp = el('input', { class: 'input', value: f.name, placeholder: 'e.g. Handover on Opportunity', 'data-testid': 'auto-name' });
      nameInp.addEventListener('input', () => f.name = nameInp.value);
      const evSel = el('select', { class: 'select', 'data-testid': 'auto-event' }, ...EVENTS.map(([v, l]) => el('option', { value: v, selected: f.event === v ? 'selected' : null }, l)));
      const condField = el('div', { class: 'field' });
      const toSel = el('select', { class: 'select', 'data-testid': 'auto-cond-to' }, ...STAGES.map(s => el('option', { value: s, selected: f.to === s ? 'selected' : null }, s.replace(/_/g, ' '))));
      toSel.addEventListener('change', () => f.to = toSel.value);
      function renderCond() { condField.innerHTML = ''; if (f.event === 'status.changed') { condField.appendChild(el('label', {}, 'When status becomes')); condField.appendChild(toSel); } else { condField.appendChild(el('div', { class: 'help' }, 'Runs on every "' + f.event + '" event (no extra condition).')); } }
      evSel.addEventListener('change', () => { f.event = evSel.value; renderCond(); });

      const actionsHost = el('div', { 'data-testid': 'auto-actions-host' });
      function actionRow(a, i) {
        const row = el('div', { class: 'card', style: 'padding:12px;margin-bottom:10px', 'data-testid': 'auto-action-' + i });
        const typeSel = el('select', { class: 'select', 'data-testid': 'auto-action-type-' + i }, ...ACTION_TYPES.map(([v, l]) => el('option', { value: v, selected: a.type === v ? 'selected' : null }, l)));
        typeSel.addEventListener('change', () => { actions[i] = { type: typeSel.value }; renderActions(); });
        const fields = el('div', { style: 'margin-top:8px;display:grid;gap:8px' });
        const txt = (k, ph, val) => { const x = el('input', { class: 'input', placeholder: ph, value: a[k] ?? val ?? '', 'data-testid': 'auto-f-' + k + '-' + i }); x.addEventListener('input', () => a[k] = x.value); return x; };
        if (a.type === 'create_task') {
          fields.appendChild(txt('title', 'Task title'));
          const due = el('input', { class: 'input', type: 'number', placeholder: 'Due in hours', value: a.due_in_hours ?? 24, 'data-testid': 'auto-f-due-' + i }); due.addEventListener('input', () => a.due_in_hours = Number(due.value));
          const prio = el('select', { class: 'select', 'data-testid': 'auto-f-prio-' + i }, ...['low', 'medium', 'high'].map(p => el('option', { value: p, selected: (a.priority || 'high') === p ? 'selected' : null }, p))); prio.addEventListener('change', () => a.priority = prio.value);
          fields.appendChild(el('div', { style: 'display:flex;gap:8px' }, el('div', { style: 'flex:1' }, el('label', { class: 'help' }, 'Due (hours)'), due), el('div', { style: 'flex:1' }, el('label', { class: 'help' }, 'Priority'), prio)));
        } else if (a.type === 'send_whatsapp') { fields.appendChild(txt('body', 'WhatsApp message (use {{name}}, {{project}})')); }
        else if (a.type === 'send_email') { fields.appendChild(txt('subject', 'Email subject')); fields.appendChild(txt('body', 'Email body')); }
        else if (a.type === 'enroll_sequence') { const s = el('select', { class: 'select', 'data-testid': 'auto-f-temp-' + i }, ...['hot', 'warm', 'cold'].map(t => el('option', { value: t, selected: a.temperature === t ? 'selected' : null }, t))); s.addEventListener('change', () => a.temperature = s.value); fields.appendChild(el('label', { class: 'help' }, 'Sequence temperature')); fields.appendChild(s); }
        else if (a.type === 'pause_sequence') { fields.appendChild(txt('reason', 'Reason')); }
        const del = el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'auto-del-action-' + i, onclick: () => { actions.splice(i, 1); if (!actions.length) actions.push({ type: 'create_task', title: '', due_in_hours: 24, priority: 'high' }); renderActions(); } }, el('i', { class: 'fa-solid fa-trash' }), 'Remove');
        row.appendChild(el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px' }, typeSel, del));
        row.appendChild(fields);
        return row;
      }
      function renderActions() { actionsHost.innerHTML = ''; actions.forEach((a, i) => actionsHost.appendChild(actionRow(a, i))); }

      const addActionBtn = el('button', { class: 'btn btn--sm', 'data-testid': 'auto-add-action', onclick: () => { actions.push({ type: 'send_whatsapp', body: '' }); renderActions(); } }, el('i', { class: 'fa-solid fa-plus' }), 'Add action');
      const body = el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Rule name'), nameInp),
        el('div', { class: 'field' }, el('label', {}, 'Trigger event'), evSel),
        condField,
        el('div', { class: 'section-title', style: 'margin-top:6px' }, 'Actions'),
        actionsHost, addActionBtn);
      renderCond(); renderActions();

      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'auto-save' }, 'Save Rule');
      const m = modal({ title: rule ? 'Edit Automation Rule' : 'New Automation Rule', wide: true, bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!f.name.trim()) { toast('Rule name required', 'error'); return; }
        const conditions = f.event === 'status.changed' ? { to: f.to } : {};
        const clean = actions.filter(a => a.type).map(a => { const o = { type: a.type }; ['title', 'due_in_hours', 'priority', 'body', 'subject', 'temperature', 'reason'].forEach(k => { if (a[k] !== undefined && a[k] !== '') o[k] = a[k]; }); return o; });
        if (!clean.length) { toast('Add at least one action', 'error'); return; }
        const payload = { name: f.name, event: f.event, conditions, actions: clean, active: rule ? rule.active : true };
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

  // ===== System & Integration Health (Section T) =====
  CRM.pages.health = async function (view) {
    CRM.setActions(null);
    const [h, perf] = await Promise.all([api.get('/system/health'), api.get('/system/performance?q=lead').catch(() => null)]);
    view.innerHTML = '';
    const stat = (k, v, color) => el('div', { class: 'card stat' }, el('div', { class: 'k' }, k), el('div', { class: 'v mono', style: color ? ('color:' + color) : '' }, String(v)));
    view.appendChild(el('div', { class: 'cards', style: 'margin-bottom:20px', 'data-testid': 'health-cards' },
      stat('Comms sent', h.communications.total),
      stat('Comms failed', h.communications.failed, h.communications.failed ? 'var(--hot)' : 'var(--won)'),
      stat('Automation OK', h.automation.success, 'var(--won)'),
      stat('Automation failed', h.automation.failed, h.automation.failed ? 'var(--hot)' : 'var(--text-1)'),
      stat('Search latency', (perf ? perf.elapsed_ms + ' ms' : '—'), (perf && perf.within_target) ? 'var(--won)' : 'var(--hot)')));

    view.appendChild(el('div', { class: 'section-title' }, 'Integrations'));
    const itbody = el('tbody', { 'data-testid': 'health-integrations' });
    h.integrations.forEach(i => itbody.appendChild(el('tr', {},
      el('td', {}, i.name), el('td', { class: 'mono' }, i.driver),
      el('td', {}, el('span', { class: 'chip', style: 'color:' + (i.live ? 'var(--won)' : 'var(--warm)') }, i.live ? 'LIVE' : 'MOCK')))));
    view.appendChild(el('div', { class: 'table-wrap', style: 'margin-bottom:20px' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Service'), el('th', {}, 'Driver'), el('th', {}, 'Mode'))), itbody)));

    if (perf) view.appendChild(el('div', { class: 'help', style: 'margin-bottom:16px' }, 'Search probe over ' + perf.total_leads.toLocaleString() + ' leads: ' + perf.elapsed_ms + ' ms (target < ' + perf.target_ms + ' ms) — ' + (perf.within_target ? '✓ within target' : '✗ over target')));

    view.appendChild(el('div', { class: 'section-title' }, 'Recent errors'));
    if (!h.recent_errors.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-circle-check' }), el('div', {}, 'No recent errors'))); return; }
    const ebody = el('tbody', { 'data-testid': 'health-errors' });
    h.recent_errors.forEach(e => ebody.appendChild(el('tr', {}, el('td', {}, e.kind), el('td', {}, e.event || '—'), el('td', {}, e.action || '—'), el('td', {}, e.message || '—'))));
    view.appendChild(el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Kind'), el('th', {}, 'Event'), el('th', {}, 'Action'), el('th', {}, 'Message'))), ebody)));
  };

  // ===== Audit Log (Section T) =====
  CRM.pages.audit = async function (view) {
    CRM.setActions(null);
    view.innerHTML = '';
    const filters = el('div', { style: 'display:flex;gap:10px;margin-bottom:16px' });
    const actionSel = el('select', { class: 'select', style: 'width:auto', 'data-testid': 'audit-action-filter' },
      el('option', { value: '' }, 'All actions'), ...['created', 'updated', 'status_changed', 'merged', 'deleted'].map(a => el('option', { value: a }, a)));
    const typeInput = el('input', { class: 'input', style: 'width:220px', placeholder: 'Entity type (e.g. Lead)', 'data-testid': 'audit-type-filter' });
    filters.appendChild(actionSel); filters.appendChild(typeInput);
    view.appendChild(filters);
    const tableHost = el('div', { 'data-testid': 'audit-host' });
    view.appendChild(tableHost);

    async function load() {
      tableHost.innerHTML = '<div class="spinner"></div>';
      const params = [];
      if (actionSel.value) params.push('action=' + actionSel.value);
      if (typeInput.value) params.push('auditable_type=' + encodeURIComponent(typeInput.value));
      const res = await api.get('/audit-logs' + (params.length ? '?' + params.join('&') : ''));
      tableHost.innerHTML = '';
      if (!res.data.length) { tableHost.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-clipboard-list' }), el('div', {}, 'No audit entries'))); return; }
      const tbody = el('tbody', { 'data-testid': 'audit-tbody' });
      res.data.forEach(a => tbody.appendChild(el('tr', { 'data-testid': 'audit-row-' + a.id },
        el('td', {}, new Date(a.created_at).toLocaleString()),
        el('td', {}, (a.auditable_type || '').split('\\').pop() + ' #' + a.auditable_id),
        el('td', {}, el('span', { class: 'chip' }, a.action)),
        el('td', {}, a.field || '—'),
        el('td', {}, (a.old_value ?? '—') + ' → ' + (a.new_value ?? '—')),
        el('td', {}, a.user ? a.user.name : 'system'),
        el('td', {}, a.reason || '—'))));
      tableHost.appendChild(el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {},
        el('th', {}, 'When'), el('th', {}, 'Entity'), el('th', {}, 'Action'), el('th', {}, 'Field'), el('th', {}, 'Change'), el('th', {}, 'By'), el('th', {}, 'Reason'))), tbody)));
    }
    actionSel.addEventListener('change', load);
    typeInput.addEventListener('input', () => { clearTimeout(window.__auditT); window.__auditT = setTimeout(load, 350); });
    load();
  };

  // ========== CHANNEL PARTNERS (admin) ==========
  CRM.pages.partners = async function (view) {
    const addBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'add-partner-btn', onclick: () => partnerModal() }, el('i', { class: 'fa-solid fa-plus' }), 'Add Partner');
    CRM.setActions(addBtn);
    view.innerHTML = '<div class="spinner"></div>';
    const { partners } = await api.get('/partners');
    view.innerHTML = '';
    if (!partners.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-handshake' }), el('div', {}, 'No channel partners yet'))); }
    else {
      const rows = partners.map(p => el('tr', { 'data-testid': 'partner-row-' + p.id },
        el('td', {}, p.name), el('td', {}, p.company || '—'), el('td', {}, p.phone || '—'),
        el('td', {}, (p.commission_rate || 0) + '%'), el('td', {}, String(p.leads_count)), el('td', {}, String(p.bookings_count)),
        el('td', {}, el('span', { class: 'chip', style: 'color:' + (p.active ? 'var(--won)' : 'var(--text-3)') }, p.active ? 'active' : 'inactive')),
        el('td', {}, el('button', { class: 'btn btn--sm', 'data-testid': 'edit-partner-' + p.id, onclick: () => partnerModal(p) }, 'Edit'))));
      view.appendChild(tableWrap(['Name', 'Company', 'Phone', 'Rate', 'Leads', 'Bookings', 'Status', ''], rows));
    }
    function partnerModal(p) {
      const f = { name: p?.name || '', company: p?.company || '', phone: p?.phone || '', email: p?.email || '', commission_rate: p?.commission_rate || 2 };
      const inp = (k, ph, type) => { const i = el('input', { class: 'input', type: type || 'text', value: f[k], placeholder: ph, 'data-testid': 'partner-' + k }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'partner-save' }, 'Save');
      const m = modal({ title: p ? 'Edit Partner' : 'Add Partner', bodyNode: el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Name'), inp('name', 'Partner name')),
        el('div', { class: 'field' }, el('label', {}, 'Company'), inp('company', 'Company')),
        el('div', { class: 'field' }, el('label', {}, 'Phone'), inp('phone', 'Phone')),
        el('div', { class: 'field' }, el('label', {}, 'Email'), inp('email', 'Email', 'email')),
        el('div', { class: 'field' }, el('label', {}, 'Commission rate (%)'), inp('commission_rate', '2', 'number'))),
        footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => { if (!f.name) { toast('Name required', 'error'); return; } try { const body = { ...f, commission_rate: Number(f.commission_rate) }; if (p) await api.put('/partners/' + p.id, body); else await api.post('/partners', body); toast('Saved', 'success'); m.close(); CRM.render(); } catch (e) { toast(e.message, 'error'); } });
    }
  };

  // ========== COMMISSIONS (admin) ==========
  CRM.pages.commissions = async function (view) {
    CRM.setActions(null);
    view.innerHTML = '<div class="spinner"></div>';
    const res = await api.get('/commissions');
    view.innerHTML = '';
    if (!res.data.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-hand-holding-dollar' }), el('div', {}, 'No commissions yet'))); return; }
    const colors = { pending: 'var(--warm)', approved: 'var(--accent)', paid: 'var(--won)', none: 'var(--text-3)' };
    const rows = res.data.map(b => {
      const actions = el('div', { style: 'display:flex;gap:6px' });
      if (b.commission_status === 'pending') actions.appendChild(el('button', { class: 'btn btn--sm', 'data-testid': 'comm-approve-' + b.id, onclick: async () => { await api.post('/bookings/' + b.id + '/commission', { action: 'approve' }); toast('Approved', 'success'); CRM.render(); } }, 'Approve'));
      if (['pending', 'approved'].includes(b.commission_status)) actions.appendChild(el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'comm-pay-' + b.id, onclick: async () => { await api.post('/bookings/' + b.id + '/commission', { action: 'pay' }); toast('Marked paid', 'success'); CRM.render(); } }, 'Mark Paid'));
      return el('tr', { 'data-testid': 'commission-row-' + b.id },
        el('td', { class: 'mono' }, b.booking_ref), el('td', {}, b.channel_partner ? b.channel_partner.name : '—'),
        el('td', {}, b.lead ? b.lead.name : '—'), el('td', {}, b.commission_pct + '%'), el('td', {}, money(b.commission_amount)),
        el('td', {}, el('span', { class: 'chip', style: 'color:' + (colors[b.commission_status] || 'var(--text-2)') }, b.commission_status)), el('td', {}, actions));
    });
    view.appendChild(tableWrap(['Booking', 'Partner', 'Customer', 'Rate', 'Amount', 'Status', ''], rows));
  };

  // ========== PARTNER PORTAL (scoped to partner) ==========
  CRM.pages.portal = async function (view) {
    CRM.setActions(null);
    view.innerHTML = '<div class="spinner"></div>';
    let d;
    try { d = await api.get('/partner/portal'); }
    catch (e) { view.innerHTML = ''; view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-circle-info' }), el('div', {}, e.message || 'No partner profile'))); return; }
    view.innerHTML = '';
    view.appendChild(el('div', { style: 'margin-bottom:8px' }, el('b', {}, d.partner.name), el('span', { style: 'color:var(--text-3);margin-left:8px' }, d.partner.commission_rate + '% commission')));
    if (d.partner.referral_url) {
      const link = el('input', { class: 'input', readonly: true, value: d.partner.referral_url, 'data-testid': 'referral-link', style: 'flex:1;font-family:var(--mono,monospace);font-size:12px' });
      const copy = el('button', { class: 'btn btn--sm', 'data-testid': 'referral-copy', onclick: () => { navigator.clipboard.writeText(d.partner.referral_url); toast('Referral link copied', 'success'); } }, el('i', { class: 'fa-solid fa-copy' }), 'Copy');
      view.appendChild(el('div', { class: 'card', style: 'padding:14px;margin-bottom:18px' },
        el('div', { style: 'font-size:12px;color:var(--text-3);margin-bottom:6px' }, 'Your referral link — share it to auto-attribute new leads & commission'),
        el('div', { style: 'display:flex;gap:8px' }, link, copy)));
    }
    // Chat widget branding editor + embed snippet
    {
      const b = { title: d.partner.widget_title || '', accent: d.partner.widget_accent || '#6c8cff', greeting: d.partner.widget_greeting || '' };
      const titleI = el('input', { class: 'input', 'data-testid': 'widget-title', value: b.title, placeholder: 'Find your dream home' });
      const accentI = el('input', { type: 'color', 'data-testid': 'widget-accent', value: b.accent, style: 'width:52px;height:38px;padding:2px;border-radius:8px;border:1px solid var(--line);background:transparent;cursor:pointer' });
      const greetI = el('textarea', { class: 'input', 'data-testid': 'widget-greeting', rows: '2', placeholder: "Hi! I can help you explore our projects. First, what's your name?" });
      greetI.value = b.greeting;
      const save = el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'widget-branding-save' }, 'Save branding');
      save.addEventListener('click', async () => {
        try {
          await api.put('/partner/branding', { widget_title: titleI.value.trim() || null, widget_accent: accentI.value || null, widget_greeting: greetI.value.trim() || null });
          toast('Widget branding saved', 'success');
        } catch (e) { toast(e.message, 'error'); }
      });
      const snippet = d.partner.widget_snippet || '';
      const snipCopy = el('button', { class: 'btn btn--sm', 'data-testid': 'widget-snippet-copy', onclick: () => { navigator.clipboard.writeText(snippet); toast('Snippet copied', 'success'); } }, el('i', { class: 'fa-solid fa-copy' }), 'Copy');
      view.appendChild(el('div', { class: 'card', style: 'padding:16px;margin-bottom:20px', 'data-testid': 'widget-branding-card' },
        el('div', { style: 'font-weight:600;margin-bottom:4px' }, 'Chat widget branding'),
        el('div', { style: 'font-size:12px;color:var(--text-3);margin-bottom:12px' }, 'Customise the chat widget prospects see when you embed it on your website.'),
        el('div', { style: 'display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap' },
          el('div', { class: 'field', style: 'flex:1;min-width:200px' }, el('label', {}, 'Title'), titleI),
          el('div', { class: 'field' }, el('label', {}, 'Accent colour'), accentI)),
        el('div', { class: 'field', style: 'margin-top:10px' }, el('label', {}, 'Greeting message'), greetI),
        el('div', { style: 'margin-top:12px' }, save),
        el('div', { style: 'font-size:12px;color:var(--text-3);margin:18px 0 6px' }, 'Embed this snippet on your website (auto-attributes captured leads & commission to you):'),
        el('div', { style: 'display:flex;gap:8px;align-items:flex-start' },
          el('pre', { class: 'card', style: 'flex:1;margin:0;padding:10px 12px;overflow-x:auto;font-family:var(--mono,monospace);font-size:12px;white-space:pre-wrap;word-break:break-all;color:var(--text-2)' }, snippet), snipCopy)));
    }
    const card = (k, v, color) => el('div', { class: 'card stat' }, el('div', { class: 'k' }, k), el('div', { class: 'v', style: color ? ('color:' + color) : '' }, String(v)));
    view.appendChild(el('div', { class: 'cards', style: 'margin-bottom:20px', 'data-testid': 'portal-cards' },
      card('My Leads', d.summary.leads), card('My Bookings', d.summary.bookings),
      card('Earned', money(d.summary.commission_earned), 'var(--won)'), card('Pending', money(d.summary.commission_pending), 'var(--warm)')));
    view.appendChild(el('div', { class: 'section-title' }, 'My Bookings'));
    if (!d.bookings.length) view.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:16px' }, 'No bookings yet'));
    else {
      const colors = { pending: 'var(--warm)', approved: 'var(--accent)', paid: 'var(--won)', none: 'var(--text-3)' };
      view.appendChild(tableWrap(['Booking', 'Customer', 'Unit', 'Commission', 'Status'], d.bookings.map(b => el('tr', { 'data-testid': 'portal-booking-' + b.id },
        el('td', { class: 'mono' }, b.booking_ref), el('td', {}, b.lead ? b.lead.name : '—'), el('td', {}, b.plot ? b.plot.number : '—'),
        el('td', {}, money(b.commission_amount)), el('td', {}, el('span', { class: 'chip', style: 'color:' + (colors[b.commission_status] || 'var(--text-2)') }, b.commission_status))))));
    }
    view.appendChild(el('div', { class: 'section-title' }, 'My Leads'));
    if (!d.leads.length) view.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px' }, 'No leads yet'));
    else view.appendChild(tableWrap(['Name', 'Phone', 'Stage'], d.leads.map(l => el('tr', { 'data-testid': 'portal-lead-' + l.id },
      el('td', {}, l.name), el('td', {}, l.phone || '—'), el('td', {}, l.stage ? l.stage.name : l.status)))));
  };

  // ========== WEBSITE CHAT WIDGET (embed + live preview) ==========
  CRM.pages.chatbot = async function (view) {
    CRM.setActions(null);
    view.innerHTML = '';
    const origin = window.location.origin;
    const snippet = '<script src="' + origin + '/widget/chat.js" async><\/script>';
    const refSnippet = '<script src="' + origin + '/widget/chat.js" data-ref="PARTNER-CODE" async><\/script>';

    const copyBtn = (id, text) => {
      const b = el('button', { class: 'btn btn--sm', 'data-testid': id }, el('i', { class: 'fa-solid fa-copy' }), 'Copy');
      b.addEventListener('click', () => { navigator.clipboard.writeText(text); toast('Copied to clipboard', 'success'); });
      return b;
    };
    const codeBox = (code) => el('pre', { class: 'card', style: 'padding:14px 16px;overflow-x:auto;font-family:var(--mono,monospace);font-size:12.5px;white-space:pre-wrap;word-break:break-all;margin:0' }, code);

    view.appendChild(el('div', { class: 'card', style: 'padding:18px 20px;margin-bottom:18px' },
      el('div', { style: 'display:flex;align-items:center;gap:10px;margin-bottom:6px' },
        el('i', { class: 'fa-solid fa-robot', style: 'color:var(--accent)' }),
        el('b', {}, 'Capture leads from any website')),
      el('div', { style: 'color:var(--text-3);font-size:13px;line-height:1.6' },
        'Paste the one-line snippet below just before the ', el('code', {}, '</body>'),
        ' tag on your marketing site. Visitors get a friendly chat bubble; every completed conversation lands in the CRM as a new lead (source ',
        el('b', {}, 'Chatbot'), ').')));

    view.appendChild(el('div', { class: 'section-title' }, 'Embed snippet'));
    view.appendChild(el('div', { style: 'display:flex;gap:10px;align-items:flex-start;margin-bottom:20px' },
      codeBox(snippet), copyBtn('chatbot-embed-copy', snippet)));

    view.appendChild(el('div', { class: 'section-title' }, 'Partner-attributed snippet'));
    view.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:8px' },
      'Give partners this variant — replace ', el('b', {}, 'PARTNER-CODE'), ' with their referral code so captured leads (and commission) auto-attribute to them.'));
    view.appendChild(el('div', { style: 'display:flex;gap:10px;align-items:flex-start;margin-bottom:20px' },
      codeBox(refSnippet), copyBtn('chatbot-ref-copy', refSnippet)));

    const demoUrl = origin + '/chat-demo';
    view.appendChild(el('div', { style: 'display:flex;gap:10px;align-items:center' },
      el('a', { class: 'btn btn--primary', 'data-testid': 'chatbot-demo-link', href: demoUrl, target: '_blank' },
        el('i', { class: 'fa-solid fa-arrow-up-right-from-square' }), 'Open live demo'),
      el('span', { style: 'color:var(--text-3);font-size:13px' }, 'A real page with the widget installed — try a full capture flow.')));

    // Live preview: load the widget on this page (bottom-right bubble)
    if (!document.getElementById('crmcw-root') && !window.__crmChatWidget) {
      const s = document.createElement('script');
      s.src = origin + '/widget/chat.js'; s.async = true;
      s.setAttribute('data-title', 'Find your dream home');
      document.body.appendChild(s);
    }
  };
})();
