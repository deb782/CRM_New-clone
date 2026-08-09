// ===== Phase 3: Mission-Control Workflow Builder (Drawflow) =====
(function () {
  const { el, api, toast } = CRM;

  const STATUS_OPTIONS = ['New', 'Assigned', 'First Contact', 'In Profiling', 'Positive', 'NRTY', 'Nurturing', 'Meeting Scheduled', 'Cost Sheet Shared', 'Booking Paid', 'Converted', 'ATS Pending', 'Instalments'];

  // Node type registry
  const T = {
    trigger: { color: '#10B981', icon: 'fa-bolt', label: 'Trigger', cat: 'Triggers', in: 0, out: 1,
      help: 'Starts the flow — e.g. a new lead arrives or a lead enters a status.',
      data: { node_type: 'trigger', trigger_type: 'new_lead', status: 'New', hours: 24 },
      summary: d => d.trigger_type === 'new_lead' ? 'On <b>new lead</b>'
        : d.trigger_type === 'status_enter' ? 'When status → <b>' + (d.status || '—') + '</b>'
        : 'In <b>' + (d.status || '—') + '</b> for <b>' + (d.hours || 0) + 'h</b>' },
    status_change: { color: '#475569', icon: 'fa-flag', label: 'Set Status', cat: 'Flow', in: 1, out: 1,
      help: 'Moves the lead to a new pipeline status.',
      data: { node_type: 'status_change', status: 'Assigned' },
      summary: d => 'Set status → <b>' + (d.status || '—') + '</b>' },
    task: { color: '#0EA5E9', icon: 'fa-list-check', label: 'Create Task', cat: 'Flow', in: 1, out: 1,
      help: 'Creates a task for the assigned team member (e.g. call back later).',
      data: { node_type: 'task', task_type: 'call', title: 'Follow-up call', due_hours: 2, assignee: 'owner' },
      summary: d => '<b>' + (d.task_type || 'task') + '</b>: ' + (d.title || '—') + '<br><span class="muted">due in ' + (d.due_hours || 0) + 'h</span>' },
    send_whatsapp: { color: '#22C55E', icon: 'fa-whatsapp', iconStyle: 'brand', label: 'Send WhatsApp', cat: 'Communications', in: 1, out: 1,
      help: 'Sends an approved WhatsApp template. Counts toward your template checklist.',
      data: { node_type: 'send_whatsapp', template: '', attach_pdf: false },
      summary: d => 'WA template: <b>' + (d.template || 'unnamed') + '</b>' + (d.attach_pdf ? '<br><span class="muted">+ PDF attachment</span>' : '') },
    send_email: { color: '#3B82F6', icon: 'fa-envelope', label: 'Send Email', cat: 'Communications', in: 1, out: 1,
      help: 'Sends an email template. Counts toward your template checklist.',
      data: { node_type: 'send_email', template: '', attach_pdf: false },
      summary: d => 'Email: <b>' + (d.template || 'unnamed') + '</b>' + (d.attach_pdf ? '<br><span class="muted">+ PDF attachment</span>' : '') },
    wait: { color: '#8B5CF6', icon: 'fa-hourglass-half', label: 'Wait / Delay', cat: 'Flow', in: 1, out: 1,
      help: 'Pauses the flow for a set duration before the next step.',
      data: { node_type: 'wait', amount: 1, unit: 'days' },
      summary: d => 'Wait <b>' + (d.amount || 0) + ' ' + (d.unit || 'days') + '</b>' },
    condition: { color: '#F59E0B', icon: 'fa-code-branch', label: 'Condition', cat: 'Logic', in: 1, out: 2,
      help: 'Branches the flow. Output 1 = TRUE, Output 2 = FALSE.',
      data: { node_type: 'condition', field: 'temperature', operator: '=', value: 'Hot' },
      summary: d => 'If <b>' + (d.field || '?') + ' ' + (d.operator || '=') + ' ' + (d.value || '?') + '</b><br><span class="muted">out1=yes · out2=no</span>' },
    fallback: { color: '#EF4444', icon: 'fa-shield-halved', label: 'Fallback', cat: 'Logic', in: 1, out: 1,
      help: 'Handles failures — e.g. WhatsApp not delivered → send email or notify a rep.',
      data: { node_type: 'fallback', action: 'send_email', notify_role: 'sales_head' },
      summary: d => 'On failure → <b>' + (d.action || '—') + '</b>' },
  };
  const CATS = ['Triggers', 'Flow', 'Communications', 'Logic'];

  let editor = null, current = null, selectedId = null;

  CRM.pages.workflows = async function (view) {
    CRM.setActions(null);
    const { workflows } = await api.get('/workflows');
    current = workflows[0] ? (await api.get('/workflows/' + workflows[0].id)).workflow : null;

    view.innerHTML = '';
    const root = buildShell();
    view.appendChild(root);

    // init Drawflow
    editor = new Drawflow(document.getElementById('wf-df'));
    editor.reroute = true; editor.reroute_fix_curvature = true;
    editor.start();

    if (current && current.graph && current.graph.drawflow) {
      try { editor.import(current.graph); } catch (e) { /* ignore */ }
    }
    toggleEmpty();
    editor.on('nodeSelected', id => openConfig(id));
    editor.on('nodeUnselected', () => { selectedId = null; renderConfigEmpty(); });
    editor.on('nodeRemoved', () => { selectedId = null; renderConfigEmpty(); toggleEmpty(); recomputeTally(); });
    editor.on('nodeCreated', () => { toggleEmpty(); recomputeTally(); });
    editor.on('connectionCreated', () => {});
    recomputeTally();
  };

  function buildShell() {
    const root = el('div', { class: 'wf-root', 'data-testid': 'workflow-builder' });

    // topbar
    const nameInput = el('input', { id: 'wf-name', style: 'background:#1e293b;border:1px solid #334155;color:#fff;border-radius:6px;padding:6px 10px;font-size:13px;width:220px', value: current?.name || 'Lead Flow Journey', 'data-testid': 'wf-name-input' });
    const statusBadge = el('span', { class: 'wf-badge' + (current?.status === 'active' ? ' active' : ''), id: 'wf-status' }, current?.status || 'draft');
    root.appendChild(el('div', { class: 'wf-topbar' },
      el('span', { class: 'wf-title' }, el('i', { class: 'fa-solid fa-diagram-project', style: 'margin-right:8px' }), 'FLOW BUILDER'),
      nameInput, statusBadge,
      el('span', { class: 'wf-spacer' }),
      el('button', { class: 'wf-btn wf-btn--ghost', 'data-testid': 'wf-validate', onclick: validate }, el('i', { class: 'fa-solid fa-circle-check' }), 'Validate'),
      el('button', { class: 'wf-btn', 'data-testid': 'wf-activate', onclick: activate }, el('i', { class: 'fa-solid fa-rocket' }), 'Activate'),
      el('button', { class: 'wf-btn wf-btn--primary', 'data-testid': 'wf-save', onclick: save }, el('i', { class: 'fa-solid fa-floppy-disk' }), 'Save flow'),
      el('button', { class: 'wf-btn wf-btn--ghost', 'data-testid': 'wf-exit', onclick: () => { location.hash = '#/dashboard'; CRM.render(); } }, el('i', { class: 'fa-solid fa-xmark' }))));

    // body
    const palette = el('div', { class: 'wf-palette', 'data-testid': 'wf-palette' });
    CATS.forEach(cat => {
      palette.appendChild(el('div', { class: 'wf-palette__label' }, cat));
      Object.keys(T).filter(k => T[k].cat === cat).forEach(k => {
        const d = T[k];
        const item = el('div', { class: 'wf-pnode', draggable: 'true', style: '--c:' + d.color, 'data-node': k, 'data-testid': 'wf-palette-' + k },
          el('i', { class: (d.iconStyle === 'brand' ? 'fa-brands ' : 'fa-solid ') + d.icon + ' wf-pi' }),
          el('div', {}, el('div', { class: 'wf-pn' }, d.label), el('div', { class: 'wf-pd' }, d.cat)));
        item.addEventListener('dragstart', e => e.dataTransfer.setData('node', k));
        palette.appendChild(item);
      });
    });

    const canvasWrap = el('div', { class: 'wf-canvas-wrap' },
      el('div', { class: 'wf-tools' },
        el('button', { title: 'Zoom in', 'data-testid': 'wf-zoom-in', onclick: () => editor.zoom_in() }, el('i', { class: 'fa-solid fa-magnifying-glass-plus' })),
        el('button', { title: 'Zoom out', 'data-testid': 'wf-zoom-out', onclick: () => editor.zoom_out() }, el('i', { class: 'fa-solid fa-magnifying-glass-minus' })),
        el('button', { title: 'Reset view', onclick: () => { editor.zoom = 1; editor.zoom_refresh(); } }, el('i', { class: 'fa-solid fa-expand' })),
        el('button', { title: 'Clear canvas', 'data-testid': 'wf-clear', onclick: clearCanvas }, el('i', { class: 'fa-solid fa-trash-can' }))),
      el('div', { id: 'wf-df', class: 'wf-canvas', 'data-testid': 'wf-canvas' }),
      el('div', { class: 'wf-empty', id: 'wf-empty' }, el('div', {}, el('i', { class: 'fa-solid fa-diagram-project' }), 'Drag nodes from the left to map your lead-flow journey')));

    canvasWrap.addEventListener('dragover', e => e.preventDefault());
    canvasWrap.addEventListener('drop', onDrop);

    const config = el('div', { class: 'wf-config', 'data-testid': 'wf-config' },
      el('div', { class: 'wf-config__head' }, el('h3', {}, 'Node settings'), el('p', {}, 'Select a node to configure it')),
      el('div', { class: 'wf-config__body', id: 'wf-config-body' }),
      el('div', { class: 'wf-tally', id: 'wf-tally' }));

    root.appendChild(el('div', { class: 'wf-body' }, palette, canvasWrap, config));
    renderConfigEmpty();
    return root;
  }

  function onDrop(e) {
    e.preventDefault();
    const key = e.dataTransfer.getData('node');
    if (!key || !T[key]) return;
    const rect = editor.precanvas.getBoundingClientRect();
    const zoom = editor.zoom;
    const x = (e.clientX - rect.left) / zoom;
    const y = (e.clientY - rect.top) / zoom;
    addNode(key, x, y);
  }

  function nodeHtml(def, data) {
    return '<div class="wf-node">'
      + '<div class="wf-node__head"><i class="' + (def.iconStyle === 'brand' ? 'fa-brands ' : 'fa-solid ') + def.icon + '"></i><span>' + def.label + '</span></div>'
      + '<div class="wf-node__body">' + def.summary(data) + '</div></div>';
  }

  function addNode(key, x, y) {
    const def = T[key];
    const data = JSON.parse(JSON.stringify(def.data));
    const id = editor.addNode(key, def.in, def.out, x, y, 'wf-t-' + key, data, nodeHtml(def, data));
    return id;
  }

  function refreshNodeBody(id) {
    const node = editor.getNodeFromId(id);
    const def = T[node.data.node_type];
    const bodyEl = document.querySelector('#node-' + id + ' .wf-node__body');
    if (bodyEl && def) bodyEl.innerHTML = def.summary(node.data);
  }

  // ---- config panel ----
  function renderConfigEmpty() {
    const body = document.getElementById('wf-config-body');
    if (body) body.innerHTML = '<div class="wf-config__empty"><i class="fa-solid fa-hand-pointer"></i>Click a node on the canvas to edit its settings, or drag a new node from the palette.</div>';
  }

  function openConfig(id) {
    selectedId = id;
    const node = editor.getNodeFromId(id);
    const def = T[node.data.node_type];
    if (!def) return;
    const body = document.getElementById('wf-config-body');
    body.innerHTML = '';
    body.appendChild(el('div', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:16px' },
      el('span', { style: 'width:26px;height:26px;display:grid;place-items:center;border-radius:6px;color:#fff;background:' + def.color },
        el('i', { class: (def.iconStyle === 'brand' ? 'fa-brands ' : 'fa-solid ') + def.icon, style: 'font-size:12px' })),
      el('b', { style: 'font-size:14px' }, def.label),
      el('i', { class: 'fa-solid fa-circle-info wf-help', 'data-tip': def.help, style: 'margin-left:auto' })));

    const d = node.data;
    const commit = () => { editor.updateNodeDataFromId(id, d); refreshNodeBody(id); recomputeTally(); };
    const fields = configFields(def.data.node_type, d, commit);
    fields.forEach(f => body.appendChild(f));

    body.appendChild(el('button', { class: 'wf-del', 'data-testid': 'wf-delete-node', onclick: () => { editor.removeNodeId('node-' + id); } }, el('i', { class: 'fa-solid fa-trash' }), ' Delete node'));
  }

  function field(label, control, help) {
    return el('div', { class: 'wf-field' },
      el('label', {}, label, help ? el('i', { class: 'fa-solid fa-circle-info wf-help', 'data-tip': help }) : null),
      control);
  }
  function sel(value, options, on) { const s = el('select', {}, ...options.map(o => el('option', Object.assign({ value: typeof o === 'object' ? o.v : o }, (typeof o === 'object' ? o.v : o) == value ? { selected: 'true' } : {}), typeof o === 'object' ? o.l : o))); s.addEventListener('change', () => on(s.value)); return s; }
  function txt(value, on, opts) { const i = el('input', Object.assign({ value: value == null ? '' : value }, opts || {})); i.addEventListener('input', () => on(i.value)); return i; }
  function chk(value, label, on) { const c = el('input', Object.assign({ type: 'checkbox' }, value ? { checked: 'true' } : {})); c.addEventListener('change', () => on(c.checked)); return el('label', { class: 'wf-toggle' }, c, label); }

  function configFields(type, d, commit) {
    const F = [];
    if (type === 'trigger') {
      F.push(field('Trigger type', sel(d.trigger_type, [{ v: 'new_lead', l: 'New lead created' }, { v: 'status_enter', l: 'Lead enters status' }, { v: 'time_in_status', l: 'Time in status' }], v => { d.trigger_type = v; commit(); openConfig(selectedId); }), T.trigger.help));
      if (d.trigger_type !== 'new_lead') F.push(field('Status', sel(d.status, STATUS_OPTIONS, v => { d.status = v; commit(); })));
      if (d.trigger_type === 'time_in_status') F.push(field('Hours in status', txt(d.hours, v => { d.hours = +v; commit(); }, { type: 'number' })));
    } else if (type === 'status_change') {
      F.push(field('New status', sel(d.status, STATUS_OPTIONS, v => { d.status = v; commit(); })));
    } else if (type === 'task') {
      F.push(field('Task type', sel(d.task_type, [{ v: 'call', l: 'Call' }, { v: 'callback', l: 'Call back later' }, { v: 'visit', l: 'Site visit' }, { v: 'document', l: 'Collect document' }], v => { d.task_type = v; commit(); })));
      F.push(field('Title', txt(d.title, v => { d.title = v; commit(); })));
      F.push(field('Due in (hours)', txt(d.due_hours, v => { d.due_hours = +v; commit(); }, { type: 'number' })));
      F.push(field('Assign to', sel(d.assignee, [{ v: 'owner', l: 'Lead owner' }, { v: 'sales_head', l: 'Sales Head' }, { v: 'crm_head', l: 'CRM Head' }], v => { d.assignee = v; commit(); })));
    } else if (type === 'send_whatsapp' || type === 'send_email') {
      F.push(field('Template name', txt(d.template, v => { d.template = v; commit(); }, { placeholder: 'e.g. welcome_v1' }), 'This template will be added to your onboarding checklist to create.'));
      F.push(field('Attachment', chk(d.attach_pdf, 'Attach a PDF (brochure / cost sheet)', v => { d.attach_pdf = v; commit(); })));
    } else if (type === 'wait') {
      F.push(field('Wait amount', txt(d.amount, v => { d.amount = +v; commit(); }, { type: 'number' })));
      F.push(field('Unit', sel(d.unit, ['minutes', 'hours', 'days'], v => { d.unit = v; commit(); })));
    } else if (type === 'condition') {
      F.push(field('Field', sel(d.field, ['temperature', 'source', 'status', 'score'], v => { d.field = v; commit(); }), T.condition.help));
      F.push(field('Operator', sel(d.operator, ['=', '!=', '>', '<'], v => { d.operator = v; commit(); })));
      F.push(field('Value', txt(d.value, v => { d.value = v; commit(); })));
    } else if (type === 'fallback') {
      F.push(field('On failure, do', sel(d.action, [{ v: 'send_email', l: 'Send email instead' }, { v: 'notify_rep', l: 'Notify a team member' }, { v: 'create_task', l: 'Create a task' }], v => { d.action = v; commit(); }), T.fallback.help));
      F.push(field('Notify role', sel(d.notify_role, [{ v: 'sales_head', l: 'Sales Head' }, { v: 'crm_head', l: 'CRM Head' }, { v: 'accounts_head', l: 'Accounts Head' }], v => { d.notify_role = v; commit(); })));
    }
    return F;
  }

  // ---- tally ----
  function currentGraphCounts() {
    const nodes = (editor.export().drawflow.Home.data) || {};
    const c = { whatsapp: 0, email: 0, task: 0, nodes: 0 };
    Object.values(nodes).forEach(n => { c.nodes++; const t = n.data?.node_type; if (t === 'send_whatsapp') c.whatsapp++; else if (t === 'send_email') c.email++; else if (t === 'task') c.task++; });
    return c;
  }

  function recomputeTally() {
    const box = document.getElementById('wf-tally');
    if (!box) return;
    const c = currentGraphCounts();
    box.innerHTML = '';
    box.appendChild(el('h4', {}, el('i', { class: 'fa-solid fa-list-check', style: 'margin-right:6px' }), 'Mission checklist'));
    box.appendChild(el('p', {}, 'Templates & tasks this flow will need you to prepare.'));
    const row = (icon, color, label, count) => el('div', { class: 'wf-tally__row', 'data-testid': 'wf-tally-' + label.toLowerCase().replace(/\W/g, '') },
      el('i', { class: icon, style: 'background:' + color }), el('span', { class: 't-label' }, label), el('span', { class: 't-count' }, String(count)));
    box.appendChild(row('fa-brands fa-whatsapp', '#22C55E', 'WhatsApp templates', c.whatsapp));
    box.appendChild(row('fa-solid fa-envelope', '#3B82F6', 'Email templates', c.email));
    box.appendChild(row('fa-solid fa-list-check', '#0EA5E9', 'Task types', c.task));
    box.appendChild(row('fa-solid fa-circle-nodes', '#475569', 'Total nodes', c.nodes));
  }

  function toggleEmpty() {
    const empty = document.getElementById('wf-empty');
    if (!empty) return;
    const n = Object.keys(editor.export().drawflow.Home.data || {}).length;
    empty.style.display = n ? 'none' : 'grid';
  }

  function clearCanvas() {
    if (!confirm('Clear the whole canvas? This cannot be undone until you re-save.')) return;
    editor.clear(); toggleEmpty(); recomputeTally(); renderConfigEmpty();
  }

  // ---- validation ----
  function validate() {
    const g = editor.export().drawflow.Home.data || {};
    const nodes = Object.values(g);
    const problems = [];
    if (!nodes.length) problems.push('Canvas is empty — add at least a Trigger.');
    const hasTrigger = nodes.some(n => n.data?.node_type === 'trigger');
    if (nodes.length && !hasTrigger) problems.push('No Trigger node — every flow must start with a Trigger.');
    nodes.forEach(n => {
      const t = n.data?.node_type;
      const outCount = Object.values(n.outputs || {}).reduce((a, o) => a + (o.connections?.length || 0), 0);
      if (t !== 'trigger') {
        const inCount = Object.values(n.inputs || {}).reduce((a, i) => a + (i.connections?.length || 0), 0);
        if (!inCount) problems.push('"' + (T[t]?.label || t) + '" is not connected to anything.');
      }
      if ((t === 'send_whatsapp' || t === 'send_email') && !n.data.template) problems.push('A ' + T[t].label + ' node has no template name.');
    });
    if (!problems.length) { toast('Flow looks valid ✓', 'success'); return true; }
    toast(problems[0] + (problems.length > 1 ? ' (+' + (problems.length - 1) + ' more)' : ''), 'error');
    return false;
  }

  // ---- persistence ----
  async function save(silent) {
    const graph = editor.export();
    const name = document.getElementById('wf-name').value || 'Lead Flow Journey';
    try {
      if (current) { const r = await api.put('/workflows/' + current.id, { name, graph, status: current.status }); current = r.workflow; }
      else { const r = await api.post('/workflows', { name, graph }); current = r.workflow; }
      if (silent !== true) toast('Flow saved', 'success');
      return true;
    } catch (e) { toast(e.message || 'Save failed', 'error'); return false; }
  }

  async function activate() {
    if (!validate()) return;
    if (!(await save(true))) return;
    try {
      const r = await api.post('/workflows/' + current.id + '/activate');
      current = r.workflow;
      const badge = document.getElementById('wf-status');
      badge.textContent = 'active'; badge.classList.add('active');
      toast('Flow activated 🚀 — the system will now run it', 'success');
    } catch (e) { toast(e.message || 'Activation failed', 'error'); }
  }
})();
