// ---- P3: WhatsApp Inbound Rules (office hours, away, keyword routing, auto-assign) ----
(function () {
  const { el, api, toast } = CRM;
  const DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
  const ACTION_LABEL = { bot: 'Start bot', assign: 'Assign to agent', tag: 'Add tag', reply: 'Auto-reply' };

  CRM.pages.waInbound = async function (view) {
    if (!CRM.can('messaging.manage')) { view.innerHTML = '<div class="empty">No access.</div>'; return; }
    CRM.setActions(null);
    view.innerHTML = '<div class="spinner"></div>';
    const data = await api.get('/wa-inbound');
    let flows = [];
    try { flows = (await api.get('/wa-flows')).flows || []; } catch (e) { /* ignore */ }
    view.innerHTML = '';
    const s = data.settings;
    const agents = data.agents || [];

    view.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:18px' }, 'Decide what happens automatically when a customer messages you on WhatsApp — business hours & away replies, keyword routing, and who the chat goes to. Test any message below.'));

    const grid = el('div', { class: 'inbound-grid' });

    // ---- Business hours + away ----
    const ohToggle = el('input', { type: 'checkbox', 'data-testid': 'oh-enabled', checked: !!s.office_hours_enabled });
    const hoursWrap = el('div', { class: 'oh-days' });
    const hourInputs = {};
    DAYS.forEach(([k, lbl]) => {
      const cfg = (s.hours && s.hours[k]) || { on: true, open: '09:00', close: '18:00' };
      const on = el('input', { type: 'checkbox', checked: !!cfg.on, 'data-testid': 'oh-' + k });
      const open = el('input', { type: 'time', class: 'input', value: cfg.open || '09:00' });
      const close = el('input', { type: 'time', class: 'input', value: cfg.close || '18:00' });
      hourInputs[k] = { on, open, close };
      hoursWrap.appendChild(el('div', { class: 'oh-row' }, el('label', { class: 'oh-day' }, on, el('span', {}, lbl)), open, el('span', { class: 'oh-dash' }, '–'), close));
    });
    const away = el('textarea', { class: 'input', rows: 3, 'data-testid': 'oh-away' }, s.away_message || '');
    const saveHours = el('button', { class: 'btn btn--primary', 'data-testid': 'oh-save', onclick: () => saveSettings() }, 'Save hours & away');
    grid.appendChild(el('div', { class: 'inbound-card', 'data-testid': 'card-hours' },
      el('div', { class: 'ic-head' }, el('h3', {}, el('i', { class: 'fa-solid fa-clock' }), ' Business hours'), el('label', { class: 'switch-lbl' }, ohToggle, el('span', {}, 'Enforce hours'))),
      hoursWrap,
      el('label', { class: 'ic-lbl' }, 'Away message (sent outside hours)'), away, saveHours));

    // ---- Auto-assignment ----
    const modeSel = el('select', { class: 'input', 'data-testid': 'assign-mode' }, ...[['off', 'Off — leave unassigned'], ['round_robin', 'Round-robin across agents'], ['specific', 'Specific agents (first available)']].map(([v, l]) => el('option', { value: v, selected: s.auto_assign_mode === v }, l)));
    const agentBox = el('div', { class: 'agent-pick' });
    const agentChecks = {};
    agents.forEach(a => {
      const cb = el('input', { type: 'checkbox', checked: (s.auto_assign_agents || []).includes(a.id) });
      agentChecks[a.id] = cb;
      agentBox.appendChild(el('label', { class: 'agent-chip' }, cb, el('span', {}, a.name)));
    });
    const assignNote = el('div', { style: 'font-size:12px;color:var(--text-3);margin-top:8px' }, 'Leave all unchecked to include the whole sales team.');
    grid.appendChild(el('div', { class: 'inbound-card', 'data-testid': 'card-assign' },
      el('div', { class: 'ic-head' }, el('h3', {}, el('i', { class: 'fa-solid fa-user-plus' }), ' Auto-assignment')),
      el('label', { class: 'ic-lbl' }, 'Mode'), modeSel,
      el('label', { class: 'ic-lbl' }, 'Agents'), agentBox, assignNote,
      el('button', { class: 'btn btn--primary', 'data-testid': 'assign-save', style: 'margin-top:12px', onclick: () => saveSettings() }, 'Save assignment')));

    // ---- Test simulator ----
    const testText = el('input', { class: 'input', placeholder: 'e.g. what is the price?', 'data-testid': 'inbound-test-text' });
    const testTime = el('input', { type: 'datetime-local', class: 'input' });
    const testOut = el('div', { class: 'test-out', 'data-testid': 'inbound-test-out' });
    grid.appendChild(el('div', { class: 'inbound-card', 'data-testid': 'card-test' },
      el('div', { class: 'ic-head' }, el('h3', {}, el('i', { class: 'fa-solid fa-flask' }), ' Test an inbound message')),
      el('label', { class: 'ic-lbl' }, 'Message'), testText,
      el('label', { class: 'ic-lbl' }, 'Received at (optional)'), testTime,
      el('button', { class: 'btn btn--primary', style: 'margin-top:12px', 'data-testid': 'inbound-test-run', onclick: async () => {
        if (!testText.value.trim()) return;
        try {
          const r = await api.post('/wa-inbound/test', { text: testText.value.trim(), time: testTime.value ? testTime.value.replace('T', ' ') : null });
          testOut.innerHTML = '';
          (r.steps || []).forEach(st => testOut.appendChild(el('div', { class: 'test-step' }, el('i', { class: 'fa-solid fa-angles-right' }), st)));
          if (r.reply) testOut.appendChild(el('div', { class: 'test-reply' }, el('b', {}, 'Auto-reply: '), r.reply));
        } catch (e) { toast(e.message, 'error'); }
      } }, 'Run test'),
      testOut));

    view.appendChild(grid);

    // ---- Keyword rules table ----
    const rulesHost = el('div', {});
    view.appendChild(el('div', { class: 'inbound-card', style: 'margin-top:20px', 'data-testid': 'card-rules' },
      el('div', { class: 'ic-head' }, el('h3', {}, el('i', { class: 'fa-solid fa-filter' }), ' Keyword rules'), el('button', { class: 'btn btn--primary', 'data-testid': 'rule-new', onclick: () => editRule(null) }, el('i', { class: 'fa-solid fa-plus' }), 'New rule')),
      el('div', { style: 'font-size:12px;color:var(--text-3);margin-bottom:10px' }, 'Checked top-to-bottom by priority; the first match wins.'),
      rulesHost));
    drawRules(data.rules);

    function drawRules(rules) {
      rulesHost.innerHTML = '';
      if (!rules.length) { rulesHost.appendChild(el('div', { class: 'empty', style: 'padding:24px' }, 'No rules yet')); return; }
      const table = el('table', { class: 'inbound-table' },
        el('thead', {}, el('tr', {}, ...['Priority', 'Name', 'Keywords', 'Match', 'Action', 'Target', 'On', ''].map(h => el('th', {}, h)))),
        el('tbody', {}, ...rules.map(r => {
          const target = r.action === 'bot' ? ((flows.find(f => f.id === r.flow_id) || {}).name || '—')
            : r.action === 'assign' ? ((agents.find(a => a.id === r.assignee_id) || {}).name || '—')
              : r.action === 'tag' ? r.tag : (r.reply_text || '').slice(0, 40);
          return el('tr', { 'data-testid': 'rule-row-' + r.id },
            el('td', { class: 'mono' }, String(r.priority)),
            el('td', {}, r.name),
            el('td', {}, (r.keywords || []).map(k => el('span', { class: 'kw-chip' }, k))),
            el('td', {}, r.match_type),
            el('td', {}, ACTION_LABEL[r.action] || r.action),
            el('td', { style: 'color:var(--text-3);font-size:12px' }, target),
            el('td', {}, el('span', { class: 'chip', style: 'color:' + (r.enabled ? 'var(--won)' : 'var(--text-3)') }, r.enabled ? 'On' : 'Off')),
            el('td', {}, el('div', { style: 'display:flex;gap:6px' },
              el('button', { class: 'icon-btn', 'data-testid': 'rule-edit-' + r.id, onclick: () => editRule(r) }, el('i', { class: 'fa-solid fa-pen' })),
              el('button', { class: 'icon-btn', 'data-testid': 'rule-del-' + r.id, onclick: async () => { if (!confirm('Delete rule?')) return; await api.del('/wa-inbound/rules/' + r.id); toast('Deleted', 'success'); reload(); } }, el('i', { class: 'fa-solid fa-trash' })))));
        })));
      rulesHost.appendChild(el('div', { class: 'table-wrap' }, table));
    }

    async function reload() { CRM.render(); }

    async function saveSettings() {
      const hours = {};
      DAYS.forEach(([k]) => { hours[k] = { on: hourInputs[k].on.checked, open: hourInputs[k].open.value, close: hourInputs[k].close.value }; });
      const agentsSel = Object.keys(agentChecks).filter(id => agentChecks[id].checked).map(Number);
      try {
        await api.put('/wa-inbound/settings', { office_hours_enabled: ohToggle.checked, hours, away_message: away.value, auto_assign_mode: modeSel.value, auto_assign_agents: agentsSel });
        toast('Settings saved', 'success');
      } catch (e) { toast(e.data && e.data.message ? e.data.message : e.message, 'error'); }
    }

    function editRule(rule) {
      const t = Object.assign({ name: '', keywords: [], match_type: 'contains', action: 'assign', flow_id: null, assignee_id: null, tag: '', reply_text: '', priority: 100, enabled: true }, rule || {});
      const nameI = el('input', { class: 'input', value: t.name, 'data-testid': 'rf-name' });
      const kwI = el('input', { class: 'input', value: (t.keywords || []).join(', '), placeholder: 'price, cost, emi', 'data-testid': 'rf-keywords' });
      const matchSel = el('select', { class: 'input' }, ...[['contains', 'Contains'], ['exact', 'Exact match']].map(([v, l]) => el('option', { value: v, selected: t.match_type === v }, l)));
      const prioI = el('input', { type: 'number', class: 'input', value: t.priority });
      const enI = el('input', { type: 'checkbox', checked: !!t.enabled });
      const actSel = el('select', { class: 'input', 'data-testid': 'rf-action' }, ...Object.entries(ACTION_LABEL).map(([v, l]) => el('option', { value: v, selected: t.action === v }, l)));
      const flowSel = el('select', { class: 'input' }, ...flows.map(f => el('option', { value: f.id, selected: t.flow_id === f.id }, f.name)));
      const agentSel = el('select', { class: 'input' }, ...agents.map(a => el('option', { value: a.id, selected: t.assignee_id === a.id }, a.name)));
      const tagI = el('input', { class: 'input', value: t.tag || '', placeholder: 'hot-lead' });
      const replyI = el('textarea', { class: 'input', rows: 3 }, t.reply_text || '');
      const targetWrap = el('div', {});
      const drawTarget = () => {
        targetWrap.innerHTML = '';
        const a = actSel.value;
        if (a === 'bot') targetWrap.appendChild(field('Start which bot?', flows.length ? flowSel : el('div', { style: 'color:var(--text-3);font-size:12px' }, 'No bots yet — create one in WhatsApp Bots')));
        else if (a === 'assign') targetWrap.appendChild(field('Assign to', agentSel));
        else if (a === 'tag') targetWrap.appendChild(field('Tag', tagI));
        else if (a === 'reply') targetWrap.appendChild(field('Auto-reply text', replyI));
      };
      actSel.addEventListener('change', drawTarget); drawTarget();
      const field = (l, n) => el('div', { class: 'tpl-field', style: 'margin-bottom:12px' }, el('label', {}, l), n);

      const form = el('div', {},
        field('Rule name', nameI),
        field('Keywords (comma separated)', kwI),
        el('div', { style: 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px' }, field('Match', matchSel), field('Priority', prioI), field('Enabled', el('label', { class: 'switch-lbl', style: 'margin-top:8px' }, enI, el('span', {}, 'Active')))),
        field('Action', actSel), targetWrap);
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'rf-save', onclick: async () => {
        const payload = { name: nameI.value, keywords: kwI.value.split(',').map(x => x.trim()).filter(Boolean), match_type: matchSel.value, action: actSel.value, priority: Number(prioI.value) || 100, enabled: enI.checked, flow_id: actSel.value === 'bot' ? Number(flowSel.value) : null, assignee_id: actSel.value === 'assign' ? Number(agentSel.value) : null, tag: actSel.value === 'tag' ? tagI.value : null, reply_text: actSel.value === 'reply' ? replyI.value : null };
        try { if (rule && rule.id) await api.put('/wa-inbound/rules/' + rule.id, payload); else await api.post('/wa-inbound/rules', payload); toast('Rule saved', 'success'); m.close(); reload(); }
        catch (e) { toast(e.data && e.data.message ? e.data.message : e.message, 'error'); }
      } }, 'Save rule');
      const m = CRM.modal({ title: rule && rule.id ? 'Edit rule' : 'New keyword rule', bodyNode: form, footNodes: [save] });
    }
  };
})();
