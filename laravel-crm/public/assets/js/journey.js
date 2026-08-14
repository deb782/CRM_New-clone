// ===== Journey Builder — guided, zero-tech lead-flow designer (replaces Drawflow) =====
(function () {
  const { el, api, toast } = CRM;

  // Step palette registry — plain-language, engine-backed node types.
  const STEP = {
    send_whatsapp: { icon: 'fa-whatsapp', brand: true, color: '#22C55E', label: 'Send WhatsApp', desc: 'Send an approved WhatsApp template',
      def: { template: '', attach_pdf: false }, node_type: 'send_whatsapp',
      sum: c => 'WhatsApp: <b>' + (c.template || 'choose a template') + '</b>' + (c.attach_pdf ? ' + PDF' : '') },
    send_email: { icon: 'fa-envelope', color: '#3B82F6', label: 'Send Email', desc: 'Send an email template',
      def: { template: '', attach_pdf: false }, node_type: 'send_email',
      sum: c => 'Email: <b>' + (c.template || 'choose a template') + '</b>' + (c.attach_pdf ? ' + PDF' : '') },
    wait: { icon: 'fa-clock', color: '#A855F7', label: 'Wait / Delay', desc: 'Pause before the next step',
      def: { amount: 1, unit: 'days' }, node_type: 'wait',
      sum: c => 'Wait <b>' + (c.amount || 1) + ' ' + (c.unit || 'days') + '</b>' },
    task: { icon: 'fa-list-check', color: '#0EA5E9', label: 'Create Task', desc: 'Assign a to-do to the lead owner',
      def: { title: 'Follow-up', task_type: 'call', due_hours: 2 }, node_type: 'task',
      sum: c => '<b>' + (c.task_type || 'task') + '</b>: ' + (c.title || '—') + ' <span style="opacity:.6">(' + (c.due_hours || 0) + 'h)</span>' },
    status_change: { icon: 'fa-flag', color: '#475569', label: 'Change Status', desc: 'Move the lead to a new status',
      def: { status_code: '' }, node_type: 'status_change',
      sum: (c, m) => 'Set status → <b>' + (m[c.status_code] || c.status_code || 'pick a status') + '</b>' },
    condition: { icon: 'fa-code-branch', color: '#F59E0B', label: 'If / Branch', desc: 'Take a decision (e.g. interested?)',
      def: { field: 'temperature', operator: '=', value: 'hot', branches: 'Positive,Negative' }, node_type: 'condition',
      sum: c => 'If <b>' + (c.field || '?') + ' ' + (c.operator || '=') + ' ' + (c.value || '?') + '</b>' },
  };

  const CHIP_CLASS = { positive: 'jb-chip--positive', negative: 'jb-chip--negative', nurture: 'jb-chip--nurture' };
  const chipKind = (label) => {
    const l = (label || '').toLowerCase();
    if (/(positive|book|convert|won|interested|paid)/.test(l)) return 'positive';
    if (/(dead|lost|negative|invalid|no.?show|drop|disqualif)/.test(l)) return 'negative';
    if (/(nurture|recycle|long|later|nrty)/.test(l)) return 'nurture';
    return 'neutral';
  };

  let uidc = 1;
  const uid = () => 'u' + (uidc++);
  const step = (type, config, branches) => ({ uid: uid(), type, config: Object.assign({}, STEP[type].def, config || {}), branches: branches || [] });

  // The ready-made Agrocorp lead-to-customer journey (seeded from the Operating Guidebook).
  function defaultJourney() {
    return {
      name: 'Agrocorp Lead-to-Customer Journey',
      lanes: [
        { key: 'S1', title: 'Lead Entry', idx: 'STAGE 1', steps: [
          step('send_whatsapp', { template: 'Lead Acknowledgement' }),
          step('task', { title: 'First contact call', task_type: 'call', due_hours: 2 }),
          step('status_change', { status_code: 'S1_ASSIGNED' }, ['Duplicate → review', 'Invalid → close']),
        ] },
        { key: 'S2', title: 'Qualification', idx: 'STAGE 2', steps: [
          step('task', { title: 'Qualify & profile lead', task_type: 'call', due_hours: 24 }),
          step('condition', { field: 'temperature', operator: '=', value: 'hot', branches: 'Positive,NRTY,Negative' }, ['Positive → meeting', 'NRTY → nurture', 'Negative → dead']),
          step('status_change', { status_code: 'S2_QUALIFYING' }),
          step('task', { title: 'Schedule meeting / site visit', task_type: 'meeting', due_hours: 48 }),
          step('status_change', { status_code: 'S2_MEETING_SCHEDULED' }),
        ] },
        { key: 'S3', title: 'Meeting & Site Visit', idx: 'STAGE 3', steps: [
          step('send_whatsapp', { template: 'Appointment Confirmation' }),
          step('wait', { amount: 1, unit: 'days' }),
          step('send_whatsapp', { template: 'Visit Reminder' }),
          step('task', { title: 'Conduct meeting / site visit', task_type: 'meeting', due_hours: 2 }),
          step('status_change', { status_code: 'S3_MEETING_COMPLETED' }, ['No-show → recovery', 'Lost → drop']),
          step('send_email', { template: 'Cost Sheet', attach_pdf: true }),
          step('status_change', { status_code: 'S3_COST_SHEET_SHARED' }),
          step('status_change', { status_code: 'S3_BOOKING_INTENT' }),
        ] },
        { key: 'S4', title: 'Booking & Verification', idx: 'STAGE 4', steps: [
          step('task', { title: 'Accounts: verify booking payment', task_type: 'other', due_hours: 24 }),
          step('status_change', { status_code: 'S4_VERIFIED' }),
          step('send_whatsapp', { template: 'Booking Confirmation' }),
          step('task', { title: 'Post-sales handover', task_type: 'other', due_hours: 24 }),
          step('status_change', { status_code: 'S4_CONVERTED' }, ['Payment issue → exception']),
        ] },
        { key: 'S5', title: 'Customer Lifecycle', idx: 'STAGE 5', steps: [
          step('task', { title: 'Collect KYC & agreement docs', task_type: 'other', due_hours: 72 }),
          step('status_change', { status_code: 'S5_AGREEMENT_EXECUTED' }),
          step('send_email', { template: 'Payment Plan & Schedule' }),
          step('status_change', { status_code: 'S5_PAYMENT_PLAN_ACTIVE' }),
          step('status_change', { status_code: 'S5_RELATIONSHIP' }, ['Overdue → reminders']),
        ] },
      ],
    };
  }

  const S = { journey: null, workflowId: null, statusMap: {}, stages: [] };

  // ---- compile the lane view-model into an engine-ready Drawflow graph ----
  function compile(journey) {
    const nodes = {};
    let id = 1;
    const flat = [];
    journey.lanes.forEach(lane => lane.steps.forEach(s => flat.push({ s, stage: lane.key })));
    const triggerId = String(id++);
    flat.forEach(f => { f.id = String(id++); });
    const mk = (nid, type, data, x, y, nextId) => {
      const conn = nextId ? [{ node: String(nextId), output: 'input_1' }] : [];
      const outputs = { output_1: { connections: conn } };
      // Branch chips are informational — keep the linear journey flowing on either outcome.
      if (type === 'condition') { outputs.output_2 = { connections: conn }; }
      nodes[nid] = {
        id: Number(nid), name: type, data: data, class: type, typenode: false,
        html: type, pos_x: x, pos_y: y,
        inputs: { input_1: { connections: [] } },
        outputs: outputs,
      };
    };
    mk(triggerId, 'trigger', { node_type: 'trigger', trigger_type: 'new_lead', label: 'New lead' }, 40, 40, flat[0] ? flat[0].id : null);
    flat.forEach((f, i) => {
      const reg = STEP[f.s.type];
      const data = Object.assign({ node_type: reg.node_type, stage: f.stage, label: reg.label }, f.s.config);
      const laneIdx = journey.lanes.findIndex(l => l.key === f.stage);
      mk(f.id, f.s.type, data, 60 + laneIdx * 340, 140 + i * 120, flat[i + 1] ? flat[i + 1].id : null);
    });
    return { drawflow: { Home: { data: nodes } }, journey };
  }

  // Rebuild the lane view-model from a stored graph (prefers the journey view-model,
  // falls back to decompiling the Drawflow nodes by their stage tag).
  function journeyFromGraph(graph) {
    if (graph && graph.journey && Array.isArray(graph.journey.lanes)) {
      const j = JSON.parse(JSON.stringify(graph.journey));
      j.lanes.forEach(l => l.steps.forEach(s => { s.uid = uid(); if (!s.branches) s.branches = []; }));
      return j;
    }
    const shells = defaultJourney().lanes.map(l => ({ key: l.key, title: l.title, idx: l.idx, steps: [] }));
    const byKey = {}; shells.forEach(l => { byKey[l.key] = l; });
    const nodes = graph && graph.drawflow && graph.drawflow.Home && graph.drawflow.Home.data;
    if (nodes) {
      Object.values(nodes).sort((a, b) => a.id - b.id).forEach(n => {
        const t = n.data && n.data.node_type;
        if (!t || t === 'trigger' || !STEP[t]) return;
        const stage = (n.data.stage && byKey[n.data.stage]) ? n.data.stage : 'S1';
        const cfg = Object.assign({}, n.data); delete cfg.node_type; delete cfg.stage; delete cfg.label;
        byKey[stage].steps.push(step(t, cfg));
      });
    }
    return { name: (graph && graph.journey && graph.journey.name) || 'Lead Journey', lanes: shells };
  }

  function syncFromDom(canvas) {
    const map = {};
    S.journey.lanes.forEach(l => l.steps.forEach(s => { map[s.uid] = s; }));
    S.journey.lanes.forEach((lane, i) => {
      const body = canvas.querySelector('[data-lane="' + lane.key + '"] .jb-lane__body');
      const order = [...body.querySelectorAll('.jb-card')].map(c => map[c.dataset.uid]).filter(Boolean);
      lane.steps = order;
    });
  }

  // ---- rendering ----
  function cardEl(s, lane, canvas) {
    const reg = STEP[s.type];
    const icon = el('div', { class: 'jb-card__icon', style: 'background:' + reg.color }, el('i', { class: (reg.brand ? 'fa-brands ' : 'fa-solid ') + reg.icon }));
    const chips = (s.branches || []).map(b => el('span', { class: 'jb-chip ' + (CHIP_CLASS[chipKind(b)] || 'jb-chip--neutral') }, b));
    const card = el('div', { class: 'jb-card', 'data-uid': s.uid, 'data-testid': 'jb-card-' + s.uid },
      el('div', { class: 'jb-card__actions' },
        el('button', { title: 'Edit', 'data-testid': 'jb-edit-' + s.uid, onclick: (e) => { e.stopPropagation(); openDrawer(s, lane, canvas); } }, el('i', { class: 'fa-solid fa-pen' })),
        el('button', { title: 'Delete', 'data-testid': 'jb-del-' + s.uid, onclick: (e) => { e.stopPropagation(); lane.steps = lane.steps.filter(x => x.uid !== s.uid); rerender(canvas); } }, el('i', { class: 'fa-solid fa-trash' }))),
      el('div', { class: 'jb-card__top' }, icon, el('div', { class: 'jb-card__label' }, reg.label)),
      el('div', { class: 'jb-card__sum' }),
      chips.length ? el('div', { class: 'jb-chips' }, ...chips) : null);
    card.querySelector('.jb-card__sum').innerHTML = reg.sum(s.config, S.statusMap);
    card.addEventListener('click', () => openDrawer(s, lane, canvas));
    return card;
  }

  function laneEl(lane, canvas) {
    const body = el('div', { class: 'jb-lane__body' });
    lane.steps.forEach(s => body.appendChild(cardEl(s, lane, canvas)));
    const addBtn = el('button', { class: 'jb-add', 'data-testid': 'jb-add-' + lane.key, onclick: (e) => openPalette(e, lane, canvas) }, el('i', { class: 'fa-solid fa-plus' }), 'Add step');
    body.appendChild(addBtn);
    const laneNode = el('div', { class: 'jb-lane', 'data-lane': lane.key, 'data-testid': 'jb-lane-' + lane.key },
      el('div', { class: 'jb-lane__head' },
        el('div', {}, el('div', { class: 'jb-lane__idx' }, lane.idx), el('div', { class: 'jb-lane__title' }, lane.title))),
      body);
    if (window.Sortable) {
      window.Sortable.create(body, { group: 'jb', animation: 150, ghostClass: 'jb-ghost', draggable: '.jb-card', filter: '.jb-add', onEnd: () => { syncFromDom(canvas); } });
    }
    return laneNode;
  }

  function rerender(canvas) {
    canvas.innerHTML = '';
    S.journey.lanes.forEach(lane => canvas.appendChild(laneEl(lane, canvas)));
  }

  // ---- add-step palette popover ----
  function openPalette(evt, lane, canvas) {
    document.querySelector('.jb-pal')?.remove();
    const pal = el('div', { class: 'jb-pal', 'data-testid': 'jb-palette' });
    Object.keys(STEP).forEach(type => {
      const reg = STEP[type];
      pal.appendChild(el('div', { class: 'jb-pal__item', 'data-testid': 'jb-pal-' + type, onclick: () => {
        pal.remove();
        const s = step(type, {});
        lane.steps.push(s);
        rerender(canvas);
        openDrawer(s, lane, canvas);
      } },
        el('div', { class: 'jb-pal__ic', style: 'background:' + reg.color }, el('i', { class: (reg.brand ? 'fa-brands ' : 'fa-solid ') + reg.icon })),
        el('div', {}, el('div', { class: 'jb-pal__t' }, reg.label), el('div', { class: 'jb-pal__d' }, reg.desc))));
    });
    document.body.appendChild(pal);
    const r = evt.currentTarget.getBoundingClientRect();
    let top = r.top - pal.offsetHeight - 8; if (top < 12) top = r.bottom + 8;
    pal.style.top = top + 'px';
    pal.style.left = Math.min(r.left, window.innerWidth - 250) + 'px';
    setTimeout(() => document.addEventListener('click', function h(e) { if (!pal.contains(e.target)) { pal.remove(); document.removeEventListener('click', h); } }), 0);
  }

  // ---- inline drawer editor ----
  function field(label, input, hint) {
    return el('div', { class: 'jb-field' }, el('label', {}, label), input, hint ? el('div', { class: 'jb-hint' }, hint) : null);
  }
  function statusSelect(value) {
    const sel = el('select', { 'data-testid': 'jb-drawer-status' });
    sel.appendChild(el('option', { value: '' }, '— choose a status —'));
    S.stages.forEach(st => {
      const g = el('optgroup', { label: st.key + ' · ' + st.name });
      st.statuses.forEach(x => { const o = el('option', { value: x.code }, x.display_name); if (x.code === value) o.selected = true; g.appendChild(o); });
      sel.appendChild(g);
    });
    return sel;
  }

  function openDrawer(s, lane, canvas) {
    document.querySelector('.jb-drawer-ov')?.remove();
    document.querySelector('.jb-drawer')?.remove();
    const reg = STEP[s.type];
    const ov = el('div', { class: 'jb-drawer-ov', 'data-testid': 'jb-drawer-overlay' });
    const body = el('div', { class: 'jb-drawer__body' });
    const c = s.config;
    const inputs = {};

    if (s.type === 'send_whatsapp' || s.type === 'send_email') {
      inputs.template = el('input', { value: c.template || '', 'data-testid': 'jb-f-template', placeholder: s.type === 'send_whatsapp' ? 'e.g. Lead Acknowledgement' : 'e.g. Cost Sheet' });
      body.appendChild(field('Template name', inputs.template, 'Must match a synced ' + (s.type === 'send_whatsapp' ? 'WhatsApp' : 'email') + ' template.'));
      inputs.attach = el('input', { type: 'checkbox' }); inputs.attach.checked = !!c.attach_pdf;
      body.appendChild(el('div', { class: 'jb-field' }, el('label', {}, 'Attachment'), el('label', { class: 'jb-check' }, inputs.attach, 'Attach the generated PDF (cost sheet / receipt)')));
    } else if (s.type === 'wait') {
      inputs.amount = el('input', { type: 'number', min: '1', value: c.amount || 1, 'data-testid': 'jb-f-amount' });
      inputs.unit = el('select', { 'data-testid': 'jb-f-unit' });
      ['minutes', 'hours', 'days'].forEach(u => { const o = el('option', { value: u }, u); if (u === c.unit) o.selected = true; inputs.unit.appendChild(o); });
      body.appendChild(field('Wait for', inputs.amount));
      body.appendChild(field('Unit', inputs.unit));
    } else if (s.type === 'task') {
      inputs.title = el('input', { value: c.title || '', 'data-testid': 'jb-f-title' });
      inputs.ttype = el('select', {}); ['call', 'meeting', 'email', 'other'].forEach(t => { const o = el('option', { value: t }, t); if (t === c.task_type) o.selected = true; inputs.ttype.appendChild(o); });
      inputs.due = el('input', { type: 'number', min: '0', value: c.due_hours || 2, 'data-testid': 'jb-f-due' });
      body.appendChild(field('Task title', inputs.title));
      body.appendChild(field('Type', inputs.ttype));
      body.appendChild(field('Due in (hours)', inputs.due));
    } else if (s.type === 'status_change') {
      inputs.status = statusSelect(c.status_code);
      body.appendChild(field('Move lead to status', inputs.status, 'Only allow-listed transitions run at execution time; required-field gates come from the status catalog.'));
    } else if (s.type === 'condition') {
      inputs.cfield = el('select', {}); ['temperature', 'source', 'score', 'status'].forEach(f => { const o = el('option', { value: f }, f); if (f === c.field) o.selected = true; inputs.cfield.appendChild(o); });
      inputs.op = el('select', {}); ['=', '!=', '>', '<'].forEach(o2 => { const o = el('option', { value: o2 }, o2); if (o2 === c.operator) o.selected = true; inputs.op.appendChild(o); });
      inputs.val = el('input', { value: c.value || '', 'data-testid': 'jb-f-value' });
      inputs.branches = el('input', { value: (s.branches || []).join(', '), 'data-testid': 'jb-f-branches', placeholder: 'Positive, Negative, NRTY' });
      body.appendChild(field('Field', inputs.cfield));
      body.appendChild(field('Operator', inputs.op));
      body.appendChild(field('Value', inputs.val));
      body.appendChild(field('Branch labels (chips)', inputs.branches, 'Shown as coloured chips on the card.'));
    }
    if (s.type !== 'condition') {
      inputs.branches = el('input', { value: (s.branches || []).join(', '), 'data-testid': 'jb-f-branches', placeholder: 'e.g. Dead → drop' });
      body.appendChild(field('Branch notes (chips, optional)', inputs.branches));
    }

    const close = () => { ov.classList.remove('open'); drawer.classList.remove('open'); setTimeout(() => { ov.remove(); drawer.remove(); }, 280); };
    const saveBtn = el('button', { class: 'jb-btn jb-btn--primary', 'data-testid': 'jb-drawer-save' }, 'Save step');
    saveBtn.addEventListener('click', () => {
      if (s.type === 'send_whatsapp' || s.type === 'send_email') { c.template = inputs.template.value.trim(); c.attach_pdf = inputs.attach.checked; }
      else if (s.type === 'wait') { c.amount = Number(inputs.amount.value) || 1; c.unit = inputs.unit.value; }
      else if (s.type === 'task') { c.title = inputs.title.value.trim(); c.task_type = inputs.ttype.value; c.due_hours = Number(inputs.due.value) || 0; }
      else if (s.type === 'status_change') { c.status_code = inputs.status.value; }
      else if (s.type === 'condition') { c.field = inputs.cfield.value; c.operator = inputs.op.value; c.value = inputs.val.value.trim(); }
      s.branches = inputs.branches.value.split(',').map(x => x.trim()).filter(Boolean);
      rerender(canvas);
      close();
    });
    const drawer = el('div', { class: 'jb-drawer', 'data-testid': 'jb-drawer' },
      el('div', { class: 'jb-drawer__head' }, el('div', { class: 'jb-card__icon', style: 'background:' + reg.color }, el('i', { class: (reg.brand ? 'fa-brands ' : 'fa-solid ') + reg.icon })), el('h3', {}, reg.label)),
      body,
      el('div', { class: 'jb-drawer__foot' }, saveBtn, el('button', { class: 'jb-btn jb-btn--ghost', onclick: close }, 'Cancel')));
    ov.addEventListener('click', close);
    document.body.appendChild(ov); document.body.appendChild(drawer);
    requestAnimationFrame(() => { ov.classList.add('open'); drawer.classList.add('open'); });
  }

  async function save(activate) {
    syncFromDomAll();
    const graph = compile(S.journey);
    const payload = { name: S.journey.name || 'Lead Journey', description: 'Built with the guided Journey Builder', status: 'active', graph };
    try {
      let r;
      if (S.workflowId) { r = await api.put('/workflows/' + S.workflowId, payload); }
      else { r = await api.post('/workflows', payload); S.workflowId = r.workflow.id; }
      toast('Journey saved & active — it now drives every new lead', 'success');
    } catch (e) { toast(e.message || 'Could not save journey', 'error'); }
  }
  let _canvasRef = null;
  function syncFromDomAll() { if (_canvasRef) syncFromDom(_canvasRef); }

  // ---- team-shared templates (save current journey / load a starter) ----
  function openTemplates(canvas) {
    document.querySelector('.jb-drawer-ov')?.remove();
    document.querySelector('.jb-drawer')?.remove();
    const ov = el('div', { class: 'jb-drawer-ov', 'data-testid': 'jb-tpl-overlay' });
    const list = el('div', { 'data-testid': 'jb-tpl-list', style: 'display:flex;flex-direction:column;gap:10px' }, el('div', { class: 'jb-hint' }, 'Loading…'));
    const nameIn = el('input', { placeholder: 'e.g. Premium Apartments – Bangalore', 'data-testid': 'jb-tpl-name' });
    const descIn = el('input', { placeholder: 'Optional note for your team', 'data-testid': 'jb-tpl-desc' });

    const close = () => { ov.classList.remove('open'); drawer.classList.remove('open'); setTimeout(() => { ov.remove(); drawer.remove(); }, 280); };

    async function refresh() {
      list.innerHTML = '';
      try {
        const r = await api.get('/flow-templates');
        const items = r.templates || [];
        if (!items.length) { list.appendChild(el('div', { class: 'jb-hint' }, 'No saved templates yet. Save your current journey to reuse it on new projects.')); return; }
        items.forEach(t => {
          list.appendChild(el('div', { class: 'jb-card', style: 'cursor:default', 'data-testid': 'jb-tpl-' + t.id },
            el('div', { class: 'jb-card__top' }, el('div', { class: 'jb-card__icon', style: 'background:#475569' }, el('i', { class: 'fa-solid fa-layer-group' })), el('div', { class: 'jb-card__label' }, t.name)),
            el('div', { class: 'jb-card__sum' }, (t.description || 'Starter journey') + ' · ' + (t.node_count || 0) + ' steps · by ' + (t.created_by_name || 'team')),
            el('div', { style: 'display:flex;gap:8px;margin-top:10px' },
              el('button', { class: 'jb-btn jb-btn--primary', style: 'padding:6px 14px;font-size:12px', 'data-testid': 'jb-tpl-load-' + t.id, onclick: () => {
                S.journey = journeyFromGraph(t.graph);
                rerender(canvas);
                toast('Loaded "' + t.name + '" — edit then Save & Activate', 'success');
                close();
              } }, 'Load'),
              el('button', { class: 'jb-btn jb-btn--ghost', style: 'padding:6px 14px;font-size:12px', 'data-testid': 'jb-tpl-del-' + t.id, onclick: async () => {
                if (!confirm('Delete template "' + t.name + '" for everyone?')) return;
                try { await api.del('/flow-templates/' + t.id); toast('Template deleted', 'success'); refresh(); } catch (e) { toast(e.message, 'error'); }
              } }, 'Delete'))));
        });
      } catch (e) { list.innerHTML = ''; list.appendChild(el('div', { class: 'jb-hint' }, 'Could not load templates.')); }
    }

    const saveBtn = el('button', { class: 'jb-btn jb-btn--primary', 'data-testid': 'jb-tpl-save', onclick: async () => {
      const name = nameIn.value.trim();
      if (name.length < 2) { toast('Give the template a name', 'error'); return; }
      syncFromDomAll();
      try {
        await api.post('/flow-templates', { name: name, description: descIn.value.trim() || null, graph: compile(S.journey) });
        toast('Saved as a reusable template', 'success');
        nameIn.value = ''; descIn.value = ''; refresh();
      } catch (e) { toast(e.message || 'Could not save template', 'error'); }
    } }, el('i', { class: 'fa-solid fa-floppy-disk' }), 'Save current journey');

    const drawer = el('div', { class: 'jb-drawer', 'data-testid': 'jb-tpl-drawer' },
      el('div', { class: 'jb-drawer__head' }, el('div', { class: 'jb-card__icon', style: 'background:#475569' }, el('i', { class: 'fa-solid fa-layer-group' })), el('h3', {}, 'Journey Templates')),
      el('div', { class: 'jb-drawer__body' },
        el('div', { class: 'jb-field' }, el('label', {}, 'Save current journey as a template'), nameIn, el('div', { style: 'height:8px' }), descIn, el('div', { style: 'margin-top:10px' }, saveBtn)),
        el('div', { style: 'height:1px;background:rgba(24,24,27,.08);margin:4px 0' }),
        el('div', { class: 'jb-field' }, el('label', {}, 'Team templates'), list)),
      el('div', { class: 'jb-drawer__foot' }, el('button', { class: 'jb-btn jb-btn--ghost', onclick: close }, 'Close')));
    ov.addEventListener('click', close);
    document.body.appendChild(ov); document.body.appendChild(drawer);
    requestAnimationFrame(() => { ov.classList.add('open'); drawer.classList.add('open'); });
    refresh();
  }

  CRM.pages.workflows = async function (view) {
    view.innerHTML = '';
    // load status catalog + existing journey workflow
    let stages = [], wf = null;
    try { const r = await api.get('/journey/statuses'); stages = r.stages || []; } catch (e) {}
    try {
      const list = (await api.get('/workflows')).workflows || [];
      const jw = list.find(w => w.name && w.name.toLowerCase().includes('journey')) || list.find(w => w.status === 'active') || list[0];
      if (jw) { wf = (await api.get('/workflows/' + jw.id)).workflow; }
    } catch (e) {}

    S.stages = stages;
    S.statusMap = {};
    stages.forEach(st => st.statuses.forEach(x => { S.statusMap[x.code] = x.display_name; }));
    S.journey = (wf && wf.graph) ? journeyFromGraph(wf.graph) : defaultJourney();
    S.workflowId = wf ? wf.id : null;
    // ensure uids exist on loaded steps
    S.journey.lanes.forEach(l => l.steps.forEach(s => { if (!s.uid) s.uid = uid(); if (!s.branches) s.branches = []; }));

    const nameInput = el('input', { class: 'jb-name-input', value: S.journey.name, 'data-testid': 'jb-name', oninput: (e) => { S.journey.name = e.target.value; } });
    const saveBtn = el('button', { class: 'jb-btn jb-btn--primary', 'data-testid': 'jb-save', onclick: () => save(true) }, el('i', { class: 'fa-solid fa-bolt' }), 'Save & Activate');
    const resetBtn = el('button', { class: 'jb-btn jb-btn--ghost', 'data-testid': 'jb-reset', onclick: () => { if (confirm('Reset to the ready-made Agrocorp journey? Unsaved changes will be lost.')) { S.journey = defaultJourney(); rerender(canvas); } } }, el('i', { class: 'fa-solid fa-rotate-left' }), 'Reset to default');
    const tplBtn = el('button', { class: 'jb-btn jb-btn--ghost', 'data-testid': 'jb-templates', onclick: () => openTemplates(canvas) }, el('i', { class: 'fa-solid fa-layer-group' }), 'Templates');

    const canvas = el('div', { class: 'jb-canvas', 'data-testid': 'jb-canvas' });
    _canvasRef = canvas;

    const wrap = el('div', { class: 'jb-wrap' },
      el('div', { class: 'jb-explain' }, el('i', { class: 'fa-solid fa-route' }),
        el('div', {}, el('div', {}, el('b', {}, 'This drives every lead.'), ' Drag steps to reorder, tap ', el('b', {}, '+ Add step'), ' to extend a stage, and click any card to edit its message, wait or status.'),
          el('div', { class: 'jb-sub' }, 'Left-to-right = the lead\u2019s journey from first enquiry to customer. Each lane is a stage; each card is an automated step.'))),
      el('div', { class: 'jb-toolbar' }, nameInput, el('div', { class: 'jb-spacer' }), tplBtn, resetBtn, saveBtn),
      canvas);
    view.appendChild(wrap);
    rerender(canvas);
  };
})();
