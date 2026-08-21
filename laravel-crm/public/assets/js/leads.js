// ---- Leads, Pipeline, Call List, Tasks, Import ----
(function () {
  const { el, api, toast, modal, money, timeAgo, tempBadge, stageName, initials, can, state } = CRM;

  const STAGES = ['new_lead','contacted','interested','opportunity','site_visit_scheduled','site_visit_completed','negotiation','won','lost','not_interested','no_response'];
  const SOURCES = ['Website Form','Meta','Facebook','Instagram','Chatbot','Walk-in','Phone','Referral','Bulk Import','Other'];

  // ---- Live lead train-tracker (read-only journey) ----
  let journeyTimer = null;
  function stopJourneyPoll() { if (journeyTimer) { clearInterval(journeyTimer); journeyTimer = null; } }

  const NODE_META = {
    trigger: { c: '#10B981', i: 'fa-solid fa-bolt', l: 'Trigger' },
    status_change: { c: '#475569', i: 'fa-solid fa-arrow-right-arrow-left', l: 'Set Status' },
    task: { c: '#0EA5E9', i: 'fa-solid fa-list-check', l: 'Task' },
    send_whatsapp: { c: '#22C55E', i: 'fa-brands fa-whatsapp', l: 'WhatsApp' },
    send_email: { c: '#3B82F6', i: 'fa-solid fa-envelope', l: 'Email' },
    wait: { c: '#8B5CF6', i: 'fa-solid fa-hourglass-half', l: 'Wait' },
    condition: { c: '#F59E0B', i: 'fa-solid fa-code-branch', l: 'Condition' },
    fallback: { c: '#EF4444', i: 'fa-solid fa-shield-halved', l: 'Fallback' },
    system: { c: '#94A3B8', i: 'fa-solid fa-gear', l: 'System' },
  };
  function nodeMeta(t) { return NODE_META[t] || { c: '#94A3B8', i: 'fa-solid fa-circle', l: t || 'Step' }; }
  function nodeTitle(t, d) {
    d = d || {};
    if (t === 'trigger') return (d.trigger_type || 'new lead').replace(/_/g, ' ');
    if (t === 'status_change') return 'to ' + (d.status || '?');
    if (t === 'task') return d.title || 'Task';
    if (t === 'send_whatsapp' || t === 'send_email') return d.template || 'template';
    if (t === 'wait') return (d.amount || 1) + ' ' + (d.unit || 'days');
    if (t === 'condition') return (d.field || '?') + ' ' + (d.operator || '=') + ' ' + (d.value || '?');
    if (t === 'fallback') return d.action || 'fallback';
    return '';
  }
  function stStateLabel(st) { return { done: 'Done', current: 'Here now', waiting: 'Waiting', failed: 'Stopped', pending: 'Upcoming', skipped: 'Skipped' }[st] || st; }
  function journeyBadge(status, run) {
    if (!run) return el('span', { class: 'jt-pill jt-pill--idle' }, 'Not started');
    const map = { running: ['On track', 'jt-pill--run'], waiting: ['Waiting', 'jt-pill--wait'], completed: ['Completed', 'jt-pill--done'], failed: ['Stopped', 'jt-pill--fail'] };
    const m = map[status] || [status || 'idle', 'jt-pill--idle'];
    return el('span', { class: 'jt-pill ' + m[1] }, m[0]);
  }
  // Order Drawflow nodes left-to-right by longest path from the trigger.
  function orderStations(nodesObj) {
    const nodes = Object.keys(nodesObj || {}).map(k => Object.assign({ id: String(k) }, nodesObj[k]));
    const outs = {};
    nodes.forEach(n => {
      outs[n.id] = [];
      const o = n.outputs || {};
      Object.keys(o).forEach(key => (((o[key] || {}).connections) || []).forEach(c => outs[n.id].push(String(c.node))));
    });
    const depth = {}; nodes.forEach(n => depth[n.id] = 0);
    for (let iter = 0; iter <= nodes.length; iter++) {
      let changed = false;
      nodes.forEach(n => outs[n.id].forEach(t => { if (depth[t] !== undefined && depth[t] < depth[n.id] + 1) { depth[t] = depth[n.id] + 1; changed = true; } }));
      if (!changed) break;
    }
    return nodes.sort((a, b) => (depth[a.id] - depth[b.id]) || (Number(a.id) - Number(b.id)));
  }

  function renderJourney(wrap, data) {
    wrap.innerHTML = '';
    if (!data.workflow) {
      wrap.appendChild(el('div', { class: 'jt-empty', 'data-testid': 'journey-none' },
        el('i', { class: 'fa-solid fa-diagram-project' }),
        el('div', {}, 'No active lead-flow yet.'),
        el('div', { class: 'jt-sub' }, 'Once a Process Admin activates a workflow, this lead\u2019s live position will appear here.')));
      return;
    }
    const nodesObj = (((data.workflow.graph || {}).drawflow || {}).Home || {}).data || {};
    const stations = orderStations(nodesObj);
    const run = data.run;
    const done = new Set((run && run.done) || []);
    const current = run && run.current_node ? String(run.current_node) : null;
    const status = run ? run.status : null;
    const total = (data.progress && data.progress.total) || stations.length;
    const doneCount = (data.progress && data.progress.done) || 0;

    wrap.appendChild(el('div', { class: 'jt-head' },
      el('div', {},
        el('div', { class: 'jt-wf', 'data-testid': 'journey-wf-name' }, el('i', { class: 'fa-solid fa-route' }), data.workflow.name),
        el('div', { class: 'jt-status', 'data-testid': 'journey-status' }, journeyBadge(status, run))),
      el('div', { class: 'jt-progress' },
        el('div', { class: 'jt-progress__bar' }, el('span', { style: 'width:' + (total ? Math.round(doneCount / total * 100) : 0) + '%' })),
        el('div', { class: 'jt-progress__label' }, doneCount + ' / ' + total + ' stops'))));

    if (!run) {
      wrap.appendChild(el('div', { class: 'jt-hint', 'data-testid': 'journey-notstarted' },
        el('i', { class: 'fa-solid fa-circle-info' }), 'This lead hasn\u2019t entered the flow yet \u2014 here\u2019s the route it will follow.'));
    }

    const track = el('div', { class: 'jt-track', 'data-testid': 'journey-track' });
    stations.forEach((s, i) => {
      const sid = s.id;
      let st = 'pending';
      if (current && String(sid) === current) st = (status === 'failed') ? 'failed' : (status === 'waiting' ? 'waiting' : 'current');
      else if (done.has(sid) || done.has(String(sid)) || done.has(Number(sid))) st = 'done';
      else if (run && status === 'completed') st = 'skipped';
      const type = (s.data && s.data.node_type) || 'unknown';
      const meta = nodeMeta(type);
      const nextOn = i < stations.length - 1 && (done.has(stations[i + 1].id) || done.has(String(stations[i + 1].id)) || current === String(stations[i + 1].id));
      track.appendChild(el('div', { class: 'jt-stop jt-stop--' + st, 'data-testid': 'journey-stop-' + sid },
        i < stations.length - 1 ? el('span', { class: 'jt-rail' + (nextOn ? ' jt-rail--on' : '') }) : null,
        el('span', { class: 'jt-dot', style: '--sc:' + meta.c }, el('i', { class: meta.i })),
        el('div', { class: 'jt-card' },
          el('div', { class: 'jt-type' }, meta.l),
          el('div', { class: 'jt-title' }, nodeTitle(type, s.data)),
          (st === 'waiting' && run && run.resume_at) ? el('div', { class: 'jt-when' }, 'Resumes ' + new Date(run.resume_at).toLocaleString()) : null,
          el('div', { class: 'jt-badge jt-badge--' + st }, stStateLabel(st)))));
    });
    wrap.appendChild(track);

    const focus = track.querySelector('.jt-stop--current, .jt-stop--waiting, .jt-stop--failed');
    // Only auto-scroll on the first render — not on the 4s polling refresh (was causing the page to auto-scroll).
    if (focus && !wrap.dataset.jtScrolled) {
      wrap.dataset.jtScrolled = '1';
      requestAnimationFrame(() => { try { focus.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (e) {} });
    }

    if (run && run.log && run.log.length) {
      const log = el('div', { class: 'jt-log', 'data-testid': 'journey-log' });
      log.appendChild(el('div', { class: 'jt-log__h' }, 'Activity trail'));
      run.log.forEach(le => {
        const meta = nodeMeta(le.type);
        log.appendChild(el('div', { class: 'jt-log__row' },
          el('i', { class: meta.i, style: 'color:' + meta.c }),
          el('span', { class: 'jt-log__d' }, le.detail),
          el('span', { class: 'jt-log__t' }, le.at)));
      });
      wrap.appendChild(log);
    }
  }


  function scoreBar(score) {
    return el('span', { class: 'score-bar' },
      el('span', { class: 'track' }, el('span', { class: 'fill', style: 'width:' + Math.min(100, score) + '%' })),
      el('b', { class: 'mono', style: 'font-size:12px' }, String(score)));
  }

  // ========== LEADS TABLE ==========
  CRM.pages.leads = async function (view, id) {
    if (id) { return openLead(view, id); }
    const filters = { search: '', status: '', temperature: '', source: '' };

    CRM.setActions(can('leads.create')
      ? el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'new-lead-btn', onclick: () => leadForm() }, el('i', { class: 'fa-solid fa-plus' }), 'New Lead')
      : null);

    const tbody = el('tbody', { 'data-testid': 'leads-tbody' });
    const search = el('input', { class: 'input', placeholder: 'Search name, email, phone…', 'data-testid': 'leads-search' });
    let timer;
    search.addEventListener('input', () => { clearTimeout(timer); filters.search = search.value; timer = setTimeout(load, 300); });

    function sel(key, label, opts) {
      const s = el('select', { class: 'select', style: 'width:auto', 'data-testid': 'filter-' + key },
        el('option', { value: '' }, label), ...opts.map(o => el('option', { value: o.v }, o.l)));
      s.addEventListener('change', () => { filters[key] = s.value; load(); });
      return s;
    }

    view.innerHTML = '';
    view.appendChild(el('div', { class: 'toolbar' },
      el('div', { class: 'search', style: 'flex:1;max-width:360px' }, el('i', { class: 'fa-solid fa-magnifying-glass' }), search),
      el('div', { class: 'filters' },
        sel('status', 'All stages', STAGES.map(s => ({ v: s, l: stageName(s) }))),
        sel('temperature', 'All temps', [{v:'hot',l:'Hot'},{v:'warm',l:'Warm'},{v:'cold',l:'Cold'}]),
        sel('source', 'All sources', SOURCES.map(s => ({ v: s, l: s }))))));

    view.appendChild(el('div', { class: 'table-wrap' },
      el('table', {}, el('thead', {}, el('tr', {},
        el('th', {}, 'Name'), el('th', {}, 'Stage'), el('th', {}, 'Temp'), el('th', {}, 'Score'),
        el('th', {}, 'Source'), el('th', {}, 'Owner'), el('th', {}, 'Last Contact'))), tbody)));

    async function load() {
      tbody.innerHTML = '<tr><td colspan="7"><div class="spinner"></div></td></tr>';
      const q = new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, v]) => v))).toString();
      const res = await api.get('/leads?' + q);
      tbody.innerHTML = '';
      if (!res.data.length) { tbody.appendChild(el('tr', {}, el('td', { colspan: 7 }, el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-inbox' }), el('div', {}, 'No leads found'))))); return; }
      res.data.forEach(l => tbody.appendChild(el('tr', { 'data-testid': 'lead-row-' + l.id, onclick: () => location.hash = '#/leads/' + l.id },
        el('td', {}, el('div', { class: 'name-cell' }, el('div', { class: 'avatar' }, initials(l.name)), el('div', {}, el('div', {}, l.name), el('div', { style: 'font-size:12px;color:var(--text-3)' }, l.email || l.phone || '')))),
        el('td', {}, el('span', { class: 'stage-pill' }, stageName(l.status))),
        el('td', {}, tempBadge(l.temperature)),
        el('td', {}, scoreBar(l.score)),
        el('td', {}, el('span', { class: 'chip' }, l.source)),
        el('td', {}, l.owner ? l.owner.name : '—'),
        el('td', { style: 'color:var(--text-3)' }, l.last_contacted_at ? timeAgo(l.last_contacted_at) : 'never'))));
    }
    load();
  };

  // ========== CREATE / EDIT LEAD ==========
  async function leadForm() {
    const f = {};
    const projects = await api.get('/projects').then(r => r.data).catch(() => []);
    const inp = (key, ph, type = 'text') => { const i = el('input', { class: 'input', type, placeholder: ph, 'data-testid': 'lead-' + key }); i.addEventListener('input', () => f[key] = i.value); return i; };
    const dupBox = el('div', {});

    const name = inp('name', 'Full name');
    const email = inp('email', 'Email', 'email');
    const phone = inp('phone', 'Phone');
    async function checkDup() {
      dupBox.innerHTML = '';
      if (!f.email && !f.phone) return;
      const r = await api.get('/leads/check-duplicate?' + new URLSearchParams({ email: f.email || '', phone: f.phone || '', name: f.name || '' })).catch(() => null);
      if (r && (r.block || r.flag)) {
        dupBox.appendChild(el('div', { class: 'dup-alert', 'data-testid': 'dup-alert' },
          el('b', {}, r.block ? '⚠ Duplicate blocked: ' : '⚠ Possible duplicate: '),
          (r.reason || '').replace(/_/g, ' '), ' — ', (r.matches || []).map(m => m.name).join(', ')));
      }
    }
    email.addEventListener('blur', checkDup); phone.addEventListener('blur', checkDup);

    const projectSel = el('select', { class: 'select', 'data-testid': 'lead-project' }, el('option', { value: '' }, 'No project'), ...projects.map(p => el('option', { value: p.id }, p.name)));
    projectSel.addEventListener('change', () => f.project_id = projectSel.value);
    const sourceSel = el('select', { class: 'select', 'data-testid': 'lead-source' }, ...SOURCES.map(s => el('option', { value: s }, s)));
    sourceSel.addEventListener('change', () => f.source = sourceSel.value); f.source = SOURCES[0];

    const body = el('div', {}, dupBox,
      el('div', { class: 'field' }, el('label', {}, 'Name *'), name),
      el('div', { class: 'form-row' },
        el('div', { class: 'field' }, el('label', {}, 'Email'), email),
        el('div', { class: 'field' }, el('label', {}, 'Phone'), phone)),
      el('div', { class: 'form-row' },
        el('div', { class: 'field' }, el('label', {}, 'Source'), sourceSel),
        el('div', { class: 'field' }, el('label', {}, 'Project'), projectSel)),
      el('div', { class: 'field' }, el('label', {}, 'City'), inp('city', 'City')),
      el('div', { class: 'help' }, 'Auto-acknowledgement, verify task and welcome automation fire on capture.'));

    const save = el('button', { class: 'btn btn--primary', 'data-testid': 'lead-save' }, 'Create Lead');
    const m = modal({ title: 'New Lead', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
    save.addEventListener('click', async () => {
      if (!f.name || (!f.email && !f.phone)) { toast('Name and phone/email required', 'error'); return; }
      save.disabled = true;
      try { await api.post('/leads', f); toast('Lead created', 'success'); m.close(); CRM.render(); }
      catch (err) {
        if (err.status === 409) {
          const proceed = confirm('Duplicate detected (' + err.data.duplicate.reason + '). Create anyway?');
          if (proceed) { try { await api.post('/leads', Object.assign({}, f, { force: true })); toast('Lead created', 'success'); m.close(); CRM.render(); } catch (e) { toast(e.message, 'error'); } }
          else save.disabled = false;
        } else { toast(err.message, 'error'); save.disabled = false; }
      }
    });
  }

  // ========== LEAD DRAWER / WORKSPACE ==========
  async function openLead(view, id) {
    view.innerHTML = '';
    view.appendChild(el('div', { class: 'spinner' }));
    function close() { stopJourneyPoll(); location.hash = '#/leads'; }

    const res = await api.get('/leads/' + id);
    const lead = res.lead;
    let timeline = res.timeline;
    let activeTab = 'timeline';

    function reload() { openLead(view, id); }

    function detailRow(l, r) { return el('div', { class: 'row' }, el('span', { class: 'l' }, l), el('span', { class: 'r' }, r || '—')); }

    function sidePanel() {
      return el('div', { class: 'drawer__side', 'data-testid': 'lead-side' },
        el('div', { class: 'section-title', style: 'margin-top:0' }, 'Details'),
        el('div', { class: 'detail-grid' },
          detailRow('Email', lead.email), detailRow('Phone', lead.phone),
          detailRow('Alt Phone', lead.alt_phone), detailRow('City', lead.city),
          detailRow('Source', lead.source), detailRow('Campaign', lead.campaign),
          detailRow('Project', lead.project ? lead.project.name : '—'), detailRow('Owner', lead.owner ? lead.owner.name : '—'),
          detailRow('Verified', lead.contact_verified ? 'Yes' : 'No'), detailRow('Attempts', lead.contact_attempts)),
        el('div', { class: 'section-title' }, 'Qualification'),
        el('div', { class: 'detail-grid' },
          detailRow('Interest', lead.interest_level), detailRow('Timeline', lead.timeline),
          detailRow('Budget', lead.budget_min ? money(lead.budget_min) + (lead.budget_max ? '–' + money(lead.budget_max) : '') : '—'),
          detailRow('Financing', lead.financing), detailRow('Decision', lead.decision_maker),
          detailRow('Pref. Location', lead.preferred_location)),
        el('div', { class: 'section-title' }, 'Site Visits'),
        (lead.site_visits || []).length
          ? el('div', {}, ...(lead.site_visits || []).map(v =>
              el('div', { class: 'chip', style: 'display:flex;width:100%;margin-bottom:6px;justify-content:space-between', 'data-testid': 'lead-visit-' + v.id },
                el('span', {}, new Date(v.scheduled_at).toLocaleDateString() + (v.plot ? ' · ' + v.plot.number : '')),
                el('span', { style: 'font-weight:600' }, CRM.stageName(v.status)))))
          : el('div', { style: 'color:var(--text-3);font-size:13px' }, 'No visits scheduled'),
        el('div', { class: 'section-title' }, 'Open Tasks'),
        (lead.tasks || []).filter(t => t.status === 'open').length
          ? el('div', {}, ...(lead.tasks || []).filter(t => t.status === 'open').map(t =>
              el('div', { class: 'chip', style: 'display:flex;width:100%;margin-bottom:6px;justify-content:space-between', 'data-testid': 'task-' + t.id },
                el('span', {}, (t.escalated ? '🔺 ' : '') + t.title),
                el('button', { class: 'btn btn--ghost btn--sm', onclick: async () => { await api.post('/tasks/' + t.id + '/complete'); toast('Task done', 'success'); reload(); } }, el('i', { class: 'fa-solid fa-check' })))))
          : el('div', { style: 'color:var(--text-3);font-size:13px' }, 'No open tasks'));
    }

    function tabContent() {
      if (activeTab === 'timeline') {
        const composer = el('div', { class: 'composer' });
        const note = el('input', { class: 'input', placeholder: 'Add a note…', 'data-testid': 'note-input' });
        const add = el('button', { class: 'btn btn--primary', 'data-testid': 'note-add' }, 'Add');
        add.addEventListener('click', async () => { if (!note.value.trim()) return; await api.post('/leads/' + id + '/note', { body: note.value }); toast('Note added', 'success'); reload(); });
        composer.append(note, add);
        const tl = el('div', { class: 'timeline', 'data-testid': 'timeline' });
        if (!timeline.length) tl.appendChild(el('div', { style: 'color:var(--text-3)' }, 'No activity yet'));
        timeline.forEach(a => {
          const icons = { note: 'fa-note-sticky', call: 'fa-phone', whatsapp: 'fa-whatsapp', email: 'fa-envelope', status_change: 'fa-arrow-right-arrow-left', system: 'fa-gear' };
          tl.appendChild(el('div', { class: 'tl-item t-' + a.type },
            el('div', { class: 'dot' }, el('i', { class: (a.type === 'whatsapp' ? 'fa-brands ' : 'fa-solid ') + (icons[a.type] || 'fa-circle') })),
            el('div', { class: 't' }, a.title),
            a.body ? el('div', { class: 'b' }, a.body) : null,
            el('div', { class: 'm' }, (a.user ? a.user.name + ' · ' : '') + timeAgo(a.created_at))));
        });
        return el('div', {}, composer, tl);
      }
      if (activeTab === 'qualify') return qualifyForm();
      if (activeTab === 'journey') return journeyTab();
      if (activeTab === 'comms') return commsPanel();
      if (activeTab === 'quote') return CRM.leadQuoteTab(lead, reload);
      if (activeTab === 'booking') return CRM.leadBookingTab(lead, reload);
      if (activeTab === 'postsales') return CRM.leadPostSalesTab(lead, reload);
    }

    function qualifyForm() {
      const f = {};
      const mk = (key, label, opts) => {
        const s = el('select', { class: 'select', 'data-testid': 'q-' + key }, el('option', { value: '' }, '—'), ...opts.map(o => el('option', { value: o.v, selected: lead[key] === o.v ? 'selected' : null }, o.l)));
        s.addEventListener('change', () => f[key] = s.value);
        return el('div', { class: 'field' }, el('label', {}, label), s);
      };
      const num = (key, label) => { const i = el('input', { class: 'input', type: 'number', value: lead[key] || '', 'data-testid': 'q-' + key }); i.addEventListener('input', () => f[key] = i.value); return el('div', { class: 'field' }, el('label', {}, label), i); };
      const obj = el('textarea', { class: 'input', rows: 3, 'data-testid': 'q-objection' }, lead.primary_objection || '');
      obj.addEventListener('input', () => f.primary_objection = obj.value);
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'qualify-save' }, 'Save & Recalculate Score');
      save.addEventListener('click', async () => { await api.post('/leads/' + id + '/qualify', f); toast('Qualified & scored', 'success'); reload(); });
      return el('div', {},
        el('div', { class: 'form-row' },
          mk('interest_level', 'Interest Level', [{v:'very_high',l:'Very High'},{v:'high',l:'High'},{v:'medium',l:'Medium'},{v:'low',l:'Low'}]),
          mk('timeline', 'Timeline', [{v:'immediate',l:'Immediate'},{v:'1-3m',l:'1-3 months'},{v:'3-6m',l:'3-6 months'},{v:'6-12m',l:'6-12 months'},{v:'later',l:'Later'}])),
        el('div', { class: 'form-row' }, num('budget_min', 'Budget Min (₹)'), num('budget_max', 'Budget Max (₹)')),
        el('div', { class: 'form-row' },
          mk('financing', 'Financing', [{v:'cash',l:'Cash'},{v:'loan',l:'Loan'},{v:'mixed',l:'Mixed'}]),
          mk('decision_maker', 'Decision Maker', [{v:'self',l:'Self'},{v:'spouse',l:'Spouse'},{v:'family',l:'Family'},{v:'advisor',l:'Advisor'}])),
        el('div', { class: 'field' }, el('label', {}, 'Preferred Location'), (() => { const i = el('input', { class: 'input', value: lead.preferred_location || '', 'data-testid': 'q-location' }); i.addEventListener('input', () => f.preferred_location = i.value); return i; })()),
        el('div', { class: 'form-row' },
          mk('objection_severity', 'Objection Severity', [{v:'blocking',l:'Blocking'},{v:'manageable',l:'Manageable'},{v:'minor',l:'Minor'}]),
          el('div')),
        el('div', { class: 'field' }, el('label', {}, 'Primary Objection'), obj),
        save,
        interestsPanel());
    }

    function interestsPanel() {
      const wrap = el('div', { style: 'margin-top:22px;border-top:1px solid var(--border);padding-top:16px', 'data-testid': 'interests-panel' });
      wrap.appendChild(el('div', { class: 'section-title' }, 'Decision Makers & Interests'));

      // Stakeholders (multiple decision-makers)
      const stakeHost = el('div', { 'data-testid': 'stakeholders-list' });
      const renderStake = () => {
        stakeHost.innerHTML = '';
        (lead.stakeholders || []).forEach((s, i) => stakeHost.appendChild(el('div', { class: 'row', 'data-testid': 'stakeholder-' + i, style: 'display:flex;justify-content:space-between;align-items:center;padding:6px 0' },
          el('div', {}, el('b', {}, s.name), el('span', { style: 'color:var(--text-3);font-size:12px;margin-left:6px' }, (s.role || '') + (s.phone ? (' · ' + s.phone) : '')), s.is_primary ? el('span', { class: 'chip', style: 'margin-left:6px;color:var(--won)' }, 'primary') : null),
          el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'stakeholder-del-' + i, onclick: async () => { const r = await api.del('/leads/' + id + '/stakeholders/' + i); lead.stakeholders = r.lead.stakeholders; renderStake(); toast('Removed'); } }, el('i', { class: 'fa-solid fa-trash' })))));
        if (!(lead.stakeholders || []).length) stakeHost.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px' }, 'No additional decision-makers'));
      };
      renderStake();
      const sName = el('input', { class: 'input', placeholder: 'Name', 'data-testid': 'stakeholder-name' });
      const sRole = el('input', { class: 'input', placeholder: 'Role (e.g. spouse)', 'data-testid': 'stakeholder-role' });
      const sPhone = el('input', { class: 'input', placeholder: 'Phone', 'data-testid': 'stakeholder-phone' });
      const sAdd = el('button', { class: 'btn btn--sm', 'data-testid': 'stakeholder-add', onclick: async () => { if (!sName.value.trim()) { toast('Name required', 'error'); return; } const r = await api.post('/leads/' + id + '/stakeholders', { name: sName.value, role: sRole.value, phone: sPhone.value }); lead.stakeholders = r.lead.stakeholders; sName.value = sRole.value = sPhone.value = ''; renderStake(); toast('Added', 'success'); } }, el('i', { class: 'fa-solid fa-user-plus' }), 'Add');
      wrap.appendChild(stakeHost);
      wrap.appendChild(el('div', { style: 'display:flex;gap:6px;margin:8px 0 18px' }, sName, sRole, sPhone, sAdd));

      // Interested units (multiple)
      const unitsInp = el('input', { class: 'input', value: (lead.interested_units || []).join(', '), placeholder: 'e.g. A-101, B-204', 'data-testid': 'interested-units-input' });
      const unitsSave = el('button', { class: 'btn btn--sm', 'data-testid': 'interested-units-save', onclick: async () => { const units = unitsInp.value.split(',').map(u => u.trim()).filter(Boolean); const r = await api.post('/leads/' + id + '/interested-units', { units }); lead.interested_units = r.lead.interested_units; toast('Units saved', 'success'); } }, 'Save');
      wrap.appendChild(el('div', { class: 'field' }, el('label', {}, 'Units of interest'), el('div', { style: 'display:flex;gap:6px' }, unitsInp, unitsSave)));

      // Switch project (competing project)
      const projSel = el('select', { class: 'select', 'data-testid': 'switch-project-select' }, el('option', { value: '' }, 'Select project…'));
      api.get('/projects').then(r => { (r.data || r.projects || r || []).forEach(p => projSel.appendChild(el('option', { value: p.id, selected: lead.project_id === p.id ? 'selected' : null }, p.name))); }).catch(() => {});
      const projSave = el('button', { class: 'btn btn--sm', 'data-testid': 'switch-project-save', onclick: async () => { if (!projSel.value) { toast('Pick a project', 'error'); return; } const reason = prompt('Reason for switch (optional)') || null; await api.post('/leads/' + id + '/switch-project', { project_id: Number(projSel.value), reason }); toast('Project switched', 'success'); reload(); } }, 'Switch');
      wrap.appendChild(el('div', { class: 'field' }, el('label', {}, 'Switch to competing / other project'), el('div', { style: 'display:flex;gap:6px' }, projSel, projSave)));
      return wrap;
    }

    function journeyTab() {
      const wrap = el('div', { 'data-testid': 'lead-journey' });
      wrap.appendChild(el('div', { class: 'jt-loading' }, el('span', { class: 'spinner' })));
      async function load() {
        let data;
        try { data = await api.get('/leads/' + id + '/journey'); }
        catch (e) { stopJourneyPoll(); wrap.innerHTML = ''; wrap.appendChild(el('div', { class: 'jt-empty', 'data-testid': 'journey-error' }, el('i', { class: 'fa-solid fa-triangle-exclamation' }), el('div', {}, e.message || 'Unable to load journey'))); return; }
        if (!location.hash.startsWith('#/leads/' + id)) { stopJourneyPoll(); return; }
        renderJourney(wrap, data);
        if (!data.run || data.run.status === 'completed' || data.run.status === 'failed') stopJourneyPoll();
      }
      stopJourneyPoll();
      load();
      journeyTimer = setInterval(load, 4000);
      return wrap;
    }

    function commsPanel() {      const waBody = el('textarea', { class: 'input', rows: 2, placeholder: 'WhatsApp message…', 'data-testid': 'wa-body' });
      let waTemplateName = null;
      const waSend = el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'wa-send' }, el('i', { class: 'fa-brands fa-whatsapp' }), 'Send WhatsApp');
      waSend.addEventListener('click', async () => { if (!waBody.value.trim()) return; await api.post('/leads/' + id + '/whatsapp', { body: waBody.value, template: waTemplateName || null }); waTemplateName = null; toast('WhatsApp sent', 'success'); reload(); });

      const waTplBtn = el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'wa-template-btn' }, el('i', { class: 'fa-solid fa-layer-group' }), 'Use template');
      waTplBtn.addEventListener('click', () => {
        api.get('/whatsapp/templates').then(res => {
          const raw = (res && (res.data || res.templates)) || res || [];
          const list = (Array.isArray(raw) ? raw : []).filter(t => String(t.status || '').toLowerCase() !== 'rejected');
          if (!list.length) { toast('No synced templates yet — sync them in Integrations → WhatsApp.', 'error'); return; }
          const body = el('div', { style: 'max-height:60vh;overflow:auto' });
          let handle;
          list.forEach(t => body.appendChild(el('div', { class: 'card', style: 'padding:12px;margin-bottom:8px;cursor:pointer', 'data-testid': 'wa-tpl-' + t.id,
            onclick: () => { handle && handle.close(); pickWaTemplate(t); } },
            el('div', { style: 'font-weight:700;font-size:13px' }, t.name, el('span', { class: 'chip', style: 'margin-left:8px;font-size:10px' }, (t.language || '') + ' · ' + (t.category || ''))),
            el('div', { style: 'font-size:12px;color:var(--text-2);margin-top:4px;white-space:pre-wrap' }, t.body || ''))));
          handle = CRM.modal({ title: 'Pick a WhatsApp template', bodyNode: body, wide: true });
        }).catch(() => toast('Could not load templates', 'error'));
      });

      function pickWaTemplate(t) {
        const vars = Array.from(new Set(String(t.body || '').match(/\{\{\s*\d+\s*\}\}/g) || []));
        if (!vars.length) { waTemplateName = t.name; waBody.value = t.body || ''; toast('Template inserted — review & send', 'success'); return; }
        const inputs = {};
        const preview = el('div', { 'data-testid': 'wa-tpl-preview', style: 'white-space:pre-wrap;background:var(--surface-2);padding:10px;border-radius:8px;font-size:13px' });
        const renderPrev = () => { let out = String(t.body || ''); vars.forEach(v => { const val = (inputs[v].value || '').trim(); out = out.split(v).join(val || v); }); preview.textContent = out; };
        const fields = el('div', {});
        vars.forEach((v, i) => { const inp = el('input', { class: 'input', placeholder: 'Value for ' + v, 'data-testid': 'wa-var-' + (i + 1), oninput: renderPrev }); inputs[v] = inp; fields.appendChild(el('div', { style: 'margin-bottom:8px' }, el('label', { style: 'font-size:12px;font-weight:600;display:block;margin-bottom:4px' }, 'Variable ' + v), inp)); });
        renderPrev();
        const insertBtn = el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'wa-tpl-insert' }, 'Insert message');
        let h2;
        insertBtn.addEventListener('click', () => { waTemplateName = t.name; waBody.value = preview.textContent; h2 && h2.close(); toast('Template inserted — review & send', 'success'); });
        h2 = CRM.modal({ title: 'Fill template variables', bodyNode: el('div', {}, fields, el('div', { style: 'margin:12px 0 4px;font-size:11px;color:var(--text-3);text-transform:uppercase;letter-spacing:.04em' }, 'Preview'), preview), footNodes: [insertBtn], wide: true });
      }

      const emSub = el('input', { class: 'input', placeholder: 'Subject', 'data-testid': 'em-subject' });
      const emBody = el('textarea', { class: 'input', rows: 3, placeholder: 'Email body…', 'data-testid': 'em-body' });
      const emSend = el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'em-send' }, el('i', { class: 'fa-solid fa-envelope' }), 'Send Email');
      emSend.addEventListener('click', async () => { if (!emSub.value.trim()) return; await api.post('/leads/' + id + '/email', { subject: emSub.value, body: emBody.value }); toast('Email sent', 'success'); reload(); });

      const outcomes = [{v:'connected',l:'Connected'},{v:'no_answer',l:'No Answer'},{v:'switched_off',l:'Switched Off'},{v:'wrong_number',l:'Wrong Number'},{v:'busy',l:'Busy'}];
      const callOut = el('select', { class: 'select', 'data-testid': 'call-outcome' }, ...outcomes.map(o => el('option', { value: o.v }, o.l)));
      const callNotes = el('input', { class: 'input', placeholder: 'Discussion summary (required)…', 'data-testid': 'call-notes' });
      const confirmSV = el('input', { type: 'checkbox', 'data-testid': 'call-confirm-sv', style: 'margin-right:6px' });
      const confirmSVWrap = el('label', { style: 'display:flex;align-items:center;font-size:13px;color:#555;margin-top:8px;cursor:pointer' }, confirmSV, 'Confirm the booked site visit (starts the Sales nurture sequence)');
      const callLog = el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'call-log' }, el('i', { class: 'fa-solid fa-phone' }), 'Log Call');
      callLog.addEventListener('click', async () => {
        if (!callNotes.value.trim()) { toast('Please write a short discussion summary', 'error'); return; }
        await api.post('/leads/' + id + '/call-log', { outcome: callOut.value, notes: callNotes.value, confirm_visit: confirmSV.checked });
        toast(confirmSV.checked ? 'Call logged · site visit confirmed' : 'Call logged', 'success'); reload();
      });

      return el('div', {},
        el('div', { class: 'card', style: 'margin-bottom:14px' }, el('div', { class: 'section-title', style: 'margin-top:0' }, el('i', { class: 'fa-solid fa-phone' }), 'Log Call'),
          el('div', { class: 'form-row' }, el('div', { class: 'field', style: 'margin:0' }, callOut), el('div', { class: 'field', style: 'margin:0' }, callNotes)),
          confirmSVWrap,
          el('div', { style: 'margin-top:10px' }, callLog)),
        el('div', { class: 'card', style: 'margin-bottom:14px' }, el('div', { class: 'section-title', style: 'margin-top:0' }, el('i', { class: 'fa-brands fa-whatsapp' }), 'WhatsApp'),
          waBody, el('div', { style: 'margin-top:10px;display:flex;gap:8px' }, waTplBtn, waSend)),
        el('div', { class: 'card' }, el('div', { class: 'section-title', style: 'margin-top:0' }, el('i', { class: 'fa-solid fa-envelope' }), 'Email'),
          emSub, el('div', { style: 'height:8px' }), emBody, el('div', { style: 'margin-top:10px' }, emSend)));
    }

    function stageChanger() {
      const s = el('select', { class: 'select', style: 'width:auto', 'data-testid': 'stage-select' }, ...STAGES.map(st => el('option', { value: st, selected: lead.status === st ? 'selected' : null }, stageName(st))));
      s.addEventListener('change', async () => {
        let reason = null;
        try { const r = await api.post('/leads/' + id + '/transition', { stage: s.value, reason }); lead.status = r.lead.status; lead.pipeline_stage_id = r.lead.pipeline_stage_id; toast('Stage → ' + stageName(s.value), 'success'); reload(); }
        catch (err) { toast(err.message, 'error'); s.value = lead.status; }
      });
      return s;
    }

    // ===== build full-page Lead Cockpit =====
    const prettyStatus = (c) => (c || '').replace(/^S\d_/, '').replace(/_/g, ' ').replace(/\b\w/g, m => m.toUpperCase());

    // --- header: identity + score + stage/status + actions ---
    const contactBits = [];
    if (lead.email) contactBits.push(el('a', { href: 'mailto:' + lead.email, 'data-testid': 'lead-email' }, el('i', { class: 'fa-solid fa-envelope', style: 'margin-right:5px' }), lead.email));
    if (lead.phone) contactBits.push(el('a', { href: 'tel:' + lead.phone, 'data-testid': 'lead-phone' }, el('i', { class: 'fa-solid fa-phone', style: 'margin-right:5px' }), lead.phone));

    const statusPill = el('span', { class: 'lc-pill lc-pill--status', 'data-testid': 'lead-status-pill' }, lead.status_code ? prettyStatus(lead.status_code) : 'No journey status');

    // action items -> dropdown
    const items = [];
    if (!lead.contact_verified) items.push(['verify-btn', 'fa-solid fa-user-check', 'Verify Contact', null, async () => { await api.post('/leads/' + id + '/verify', {}); toast('Contact verified', 'success'); reload(); }]);
    items.push(['recalc-btn', 'fa-solid fa-arrows-rotate', 'Recalculate Score', null, async () => { const r = await api.post('/leads/' + id + '/recalculate'); toast('Score: ' + r.result.total + ' (' + r.result.temperature + ')', 'success'); reload(); }]);
    items.push(['enroll-btn', 'fa-solid fa-seedling', 'Enroll Nurture', null, async () => { await api.post('/leads/' + id + '/enroll', {}); toast('Enrolled in ' + lead.temperature + ' cadence', 'success'); reload(); }]);
    if (!lead.do_not_contact && !lead.is_invalid && !lead.locked) {
      items.push(['dnc-btn', 'fa-solid fa-ban', 'Do-Not-Contact', 'danger', async () => { if (!confirm('Mark this lead Do-Not-Contact? Outbound messaging will stop.')) return; await api.post('/leads/' + id + '/dnc', { reason: 'requested' }); toast('Marked Do-Not-Contact', 'success'); reload(); }]);
      items.push(['invalid-btn', 'fa-solid fa-triangle-exclamation', 'Mark Invalid', 'danger', async () => { const r = prompt('Reason (wrong_number, spam, invalid, junk):', 'spam'); if (!r) return; await api.post('/leads/' + id + '/invalid', { reason: r }); toast('Marked invalid', 'warning'); reload(); }]);
    }
    if (!lead.locked && lead.status !== 'won' && lead.status !== 'lost') {
      items.push(['won-btn', 'fa-solid fa-trophy', 'Mark Won', 'won', () => CRM.markWon(lead, reload)]);
      items.push(['lost-btn', 'fa-solid fa-xmark', 'Mark Lost', 'danger', () => CRM.markLost(lead, reload)]);
    }
    const menuList = el('div', { class: 'lc-menu__list', 'data-testid': 'lead-actions-menu', style: 'display:none' });
    function closeMenu() { menuList.style.display = 'none'; document.removeEventListener('click', closeMenu); }
    items.forEach(([tid, icon, label, kind, onClick]) => menuList.appendChild(el('button', { class: 'lc-menu__item' + (kind ? ' lc-menu__item--' + kind : ''), 'data-testid': tid, onclick: async (e) => { e.stopPropagation(); closeMenu(); await onClick(); } }, el('i', { class: icon }), label)));
    const menuBtn = el('button', { class: 'btn', 'data-testid': 'lead-actions-btn', onclick: (e) => { e.stopPropagation(); const open = menuList.style.display === 'none'; menuList.style.display = open ? 'block' : 'none'; if (open) setTimeout(() => document.addEventListener('click', closeMenu), 0); } }, el('i', { class: 'fa-solid fa-ellipsis' }), 'Actions');
    const actionsMenu = el('div', { class: 'lc-menu' }, menuBtn, menuList);
    const scheduleBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'schedule-visit-btn', onclick: () => CRM.scheduleVisit(lead, reload) }, el('i', { class: 'fa-solid fa-calendar-check' }), 'Schedule Visit');

    const actionsRow = lead.locked
      ? el('div', { class: 'lc-actions' }, el('span', { class: 'lc-pill lc-pill--status', 'data-testid': 'lead-status-pill', style: 'background:#EDE5D8;color:#7A5C1E' }, el('i', { class: 'fa-solid fa-lock', style: 'margin-right:6px' }), 'Won · Locked'))
      : el('div', { class: 'lc-actions' }, el('div', { class: 'lc-pill-group' }, stageChanger(), statusPill), scheduleBtn, actionsMenu);

    const header = el('div', { class: 'lc-card lc__header', 'data-testid': 'lead-header' },
      el('div', { class: 'lc-id' },
        el('button', { class: 'icon-btn', 'data-testid': 'lead-back', onclick: close }, el('i', { class: 'fa-solid fa-arrow-left' })),
        el('div', { class: 'avatar avatar--lg' }, initials(lead.name)),
        el('div', { style: 'min-width:0' },
          el('h1', { class: 'lc-name', 'data-testid': 'lead-name' }, lead.name),
          el('div', { class: 'lc-contact' }, ...contactBits),
          el('div', { class: 'lc-badges' }, tempBadge(lead.temperature), scoreBar(lead.score)))),
      actionsRow);

    // --- banners ---
    const banners = el('div', { class: 'lc__banners' });
    if (lead.locked) banners.appendChild(el('div', { class: 'dup-alert', 'data-testid': 'lock-banner', style: 'display:flex;align-items:center;gap:8px' }, el('i', { class: 'fa-solid fa-lock' }), el('span', {}, 'Record locked — deal won and handed over to post-sales. Editing is restricted.')));
    if (lead.do_not_contact || lead.is_invalid) banners.appendChild(el('div', { class: 'dup-alert', 'data-testid': 'flag-banner', style: 'display:flex;align-items:center;gap:8px' }, el('i', { class: 'fa-solid fa-ban' }), el('span', {}, (lead.is_invalid ? 'Invalid lead' : 'Do-Not-Contact') + (lead.invalid_reason ? (' · ' + lead.invalid_reason) : '') + ' — outbound messaging is suppressed.')));

    // --- left rail: details / qualification / site visits ---
    const kv = (k, v, full) => el('div', { class: 'lc-kv__item' + (full ? ' lc-kv__item--full' : '') }, el('div', { class: 'k' }, k), el('div', { class: 'v' }, v || '—'));
    const detailsCard = el('div', { class: 'lc-card', 'data-testid': 'lead-details' },
      el('div', { class: 'lc-card__h' }, el('span', { class: 'lc-card__hl' }, el('i', { class: 'fa-solid fa-address-card' }), 'Details')),
      el('div', { class: 'lc-kv' },
        kv('Alt Phone', lead.alt_phone), kv('City', lead.city),
        kv('Source', lead.source), kv('Campaign', lead.campaign),
        kv('Project', lead.project ? lead.project.name : '—'), kv('Owner', lead.owner ? lead.owner.name : '—'),
        kv('Verified', lead.contact_verified ? 'Yes' : 'No'), kv('Attempts', String(lead.contact_attempts || 0))));

    const qualCard = el('div', { class: 'lc-card', 'data-testid': 'lead-qualification' },
      el('div', { class: 'lc-card__h' }, el('span', { class: 'lc-card__hl' }, el('i', { class: 'fa-solid fa-clipboard-check' }), 'Qualification'),
        el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'edit-qualify-btn', onclick: () => CRM.modal({ title: 'Qualify lead', bodyNode: qualifyForm(), wide: true }) }, el('i', { class: 'fa-solid fa-pen' }), 'Edit')),
      el('div', { class: 'lc-kv' },
        kv('Interest', lead.interest_level), kv('Timeline', lead.timeline),
        kv('Budget', lead.budget_min ? money(lead.budget_min) + (lead.budget_max ? '–' + money(lead.budget_max) : '') : '—', true),
        kv('Financing', lead.financing), kv('Decision', lead.decision_maker),
        kv('Preferred Location', lead.preferred_location, true)));

    const visits = lead.site_visits || [];
    const visitsCard = el('div', { class: 'lc-card', 'data-testid': 'lead-visits' },
      el('div', { class: 'lc-card__h' }, el('span', { class: 'lc-card__hl' }, el('i', { class: 'fa-solid fa-map-location-dot' }), 'Site Visits')),
      visits.length ? el('div', {}, ...visits.map(v => el('div', { class: 'lc-row', 'data-testid': 'lead-visit-' + v.id },
        el('span', { class: 'lc-row__t' }, new Date(v.scheduled_at).toLocaleDateString() + (v.plot ? ' · ' + v.plot.number : '')),
        el('div', { style: 'display:flex;align-items:center;gap:8px' },
          el('span', { style: 'font-weight:700;font-size:12px' }, CRM.stageName(v.status)),
          (v.status !== 'completed' && v.status !== 'cancelled') ? el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'lead-visit-reschedule-' + v.id, title: 'Reschedule', onclick: () => CRM.rescheduleVisit(v, reload) }, el('i', { class: 'fa-solid fa-calendar-plus' })) : null))))
        : el('div', { class: 'lc-empty' }, 'No visits scheduled'));

    const leftRail = el('div', { class: 'lc__left', 'data-testid': 'lead-side' }, detailsCard, qualCard, visitsCard);

    // --- main: journey stepper + unified composer + timeline ---
    const journeyCard = el('div', { class: 'lc-card', 'data-testid': 'lead-journey-card' },
      el('div', { class: 'lc-card__h' }, el('span', { class: 'lc-card__hl' }, el('i', { class: 'fa-solid fa-route' }), 'Journey')), journeyTab());

    // composer with Note / Communicate sub-tabs
    const noteInput = el('input', { class: 'input', placeholder: 'Add a note…', 'data-testid': 'note-input' });
    const noteAdd = el('button', { class: 'btn btn--primary', 'data-testid': 'note-add' }, 'Add note');
    noteAdd.addEventListener('click', async () => { if (!noteInput.value.trim()) return; await api.post('/leads/' + id + '/note', { body: noteInput.value }); toast('Note added', 'success'); reload(); });
    const noteBox = el('div', { class: 'lc-note' }, noteInput, noteAdd);
    const commBox = commsPanel();
    const compBody = el('div', { 'data-testid': 'composer-body' }, noteBox);
    const subtabs = el('div', { class: 'lc-subtabs' });
    [['note', 'Note', noteBox], ['comm', 'Communicate', commBox]].forEach(([k, label, node], i) => {
      const b = el('button', { class: 'lc-subtab' + (i === 0 ? ' active' : ''), 'data-testid': 'composer-tab-' + k, onclick: () => { [...subtabs.children].forEach(c => c.classList.remove('active')); b.classList.add('active'); compBody.innerHTML = ''; compBody.appendChild(node); } }, label);
      subtabs.appendChild(b);
    });
    const composerCard = el('div', { class: 'lc-card', 'data-testid': 'lead-composer' },
      el('div', { class: 'lc-card__h' }, el('span', { class: 'lc-card__hl' }, el('i', { class: 'fa-solid fa-pen-to-square' }), 'Log an activity')), subtabs, compBody);

    const tl = el('div', { class: 'timeline', 'data-testid': 'timeline' });
    if (!timeline.length) tl.appendChild(el('div', { class: 'lc-empty' }, 'No activity yet'));
    const icons = { note: 'fa-note-sticky', call: 'fa-phone', whatsapp: 'fa-whatsapp', email: 'fa-envelope', status_change: 'fa-arrow-right-arrow-left', system: 'fa-gear' };
    timeline.forEach(a => tl.appendChild(el('div', { class: 'tl-item t-' + a.type },
      el('div', { class: 'dot' }, el('i', { class: (a.type === 'whatsapp' ? 'fa-brands ' : 'fa-solid ') + (icons[a.type] || 'fa-circle') })),
      el('div', { class: 't' }, a.title),
      a.body ? el('div', { class: 'b' }, a.body) : null,
      el('div', { class: 'm' }, (a.user ? a.user.name + ' · ' : '') + timeAgo(a.created_at)))));
    const timelineCard = el('div', { class: 'lc-card', 'data-testid': 'lead-timeline-card' },
      el('div', { class: 'lc-card__h' }, el('span', { class: 'lc-card__hl' }, el('i', { class: 'fa-solid fa-clock-rotate-left' }), 'Activity Timeline')), tl);

    const mainCol = el('div', { class: 'lc__main' }, journeyCard, composerCard, timelineCard);

    // --- right rail: open tasks + module widgets ---
    const openTasks = (lead.tasks || []).filter(t => t.status === 'open');
    const tasksCard = el('div', { class: 'lc-card', 'data-testid': 'lead-tasks' },
      el('div', { class: 'lc-card__h' }, el('span', { class: 'lc-card__hl' }, el('i', { class: 'fa-solid fa-list-check' }), 'Open Tasks'), el('span', { class: 'lc-pill lc-pill--status' }, String(openTasks.length))),
      openTasks.length ? el('div', {}, ...openTasks.map(t => el('div', { class: 'lc-row', 'data-testid': 'task-' + t.id },
        el('span', { class: 'lc-row__t' }, (t.escalated ? '🔺 ' : '') + t.title),
        el('button', { class: 'btn btn--ghost btn--sm', onclick: async () => { await api.post('/tasks/' + t.id + '/complete'); toast('Task done', 'success'); reload(); } }, el('i', { class: 'fa-solid fa-check' })))))
        : el('div', { class: 'lc-empty' }, 'No open tasks'));

    const moduleCard = (tid, icon, title, sub, build) => el('div', { class: 'lc-card', 'data-testid': tid },
      el('div', { class: 'lc-card__h' }, el('span', { class: 'lc-card__hl' }, el('i', { class: icon }), title)),
      el('div', { class: 'lc-mod__row' }, el('div', { class: 'lc-mod__sum' }, sub),
        el('button', { class: 'btn btn--sm', 'data-testid': tid + '-open', onclick: () => CRM.modal({ title: title, bodyNode: build(), wide: true }) }, 'Open')));
    const rightRail = el('div', { class: 'lc__right' }, tasksCard,
      moduleCard('mod-quote', 'fa-solid fa-file-invoice-dollar', 'Quote / Cost Sheet', 'Build or view the cost sheet', () => CRM.leadQuoteTab(lead, reload)),
      moduleCard('mod-booking', 'fa-solid fa-file-signature', 'Booking', 'Manage booking & payment plan', () => CRM.leadBookingTab(lead, reload)),
      moduleCard('mod-postsales', 'fa-solid fa-headset', 'Post-Sales', 'Handover, agreements & demands', () => CRM.leadPostSalesTab(lead, reload)));

    // --- mount cockpit ---
    view.innerHTML = '';
    view.appendChild(el('div', { class: 'lc', 'data-testid': 'lead-cockpit' }, header, banners, leftRail, mainCol, rightRail));
  }

  // ========== PIPELINE (Kanban) ==========
  CRM.pages.pipeline = async function (view) {
    CRM.setActions(null);
    const res = await api.get('/leads/board');
    view.innerHTML = '';
    const canMove = CRM.can('leads.edit');
    const board = el('div', { class: 'kanban', 'data-testid': 'kanban' });
    const dotColor = { hot: 'var(--hot)', warm: 'var(--warm)', cold: 'var(--cold)' };

    res.stages.forEach(stage => {
      const leads = res.leads[stage.id] || [];
      const col = el('div', { class: 'kcol', 'data-testid': 'kcol-' + stage.slug });
      col.dataset.stage = stage.slug;
      col.appendChild(el('div', { class: 'kcol__head' }, el('span', {}, stage.name), el('span', { class: 'count' }, leads.length)));
      const bodyEl = el('div', { class: 'kcol__body' });
      leads.forEach(l => {
        const card = el('div', { class: 'kcard', 'data-testid': 'kcard-' + l.id, draggable: canMove ? 'true' : null, onclick: () => location.hash = '#/leads/' + l.id },
          el('div', { class: 'kn' }, el('span', { class: 'kdot', style: 'background:' + (dotColor[l.temperature] || 'var(--text-3)') }), l.name),
          el('div', { class: 'ks' }, l.email || l.phone || ''),
          el('div', { class: 'kf' }, tempBadge(l.temperature), el('b', { class: 'mono', style: 'font-size:12px' }, String(l.score))));
        if (canMove) {
          card.addEventListener('dragstart', (e) => { card.classList.add('dragging'); e.dataTransfer.setData('text/plain', JSON.stringify({ id: l.id, from: stage.slug })); e.dataTransfer.effectAllowed = 'move'; });
          card.addEventListener('dragend', () => card.classList.remove('dragging'));
        }
        bodyEl.appendChild(card);
      });
      if (canMove) {
        col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop-target'); });
        col.addEventListener('dragleave', () => col.classList.remove('drop-target'));
        col.addEventListener('drop', async (e) => {
          e.preventDefault(); col.classList.remove('drop-target');
          let payload; try { payload = JSON.parse(e.dataTransfer.getData('text/plain')); } catch (_) { return; }
          if (!payload || payload.from === stage.slug) return;
          try { await api.post('/leads/' + payload.id + '/transition', { stage: stage.slug }); toast('Moved to ' + stage.name, 'success'); CRM.render(); }
          catch (err) { toast(err.message || 'Transition not allowed', 'error'); CRM.render(); }
        });
      }
      col.appendChild(bodyEl);
      board.appendChild(col);
    });
    view.appendChild(board);
  };

  // ========== CALL LIST ==========
  CRM.pages.callList = async function (view) {
    CRM.setActions(null);
    const res = await api.get('/leads/call-list');
    view.innerHTML = '';
    view.appendChild(el('p', { style: 'color:var(--text-2);margin-bottom:16px' }, 'Prioritized by temperature, score and recency. Hot leads first.'));
    const tbody = el('tbody', {});
    res.leads.forEach((l, i) => tbody.appendChild(el('tr', { 'data-testid': 'call-row-' + l.id, onclick: () => location.hash = '#/leads/' + l.id },
      el('td', { class: 'mono', style: 'color:var(--text-3)' }, String(i + 1)),
      el('td', {}, el('div', { class: 'name-cell' }, el('div', { class: 'avatar' }, initials(l.name)), l.name)),
      el('td', {}, tempBadge(l.temperature)),
      el('td', {}, scoreBar(l.score)),
      el('td', {}, l.phone || '—'),
      el('td', {}, el('span', { class: 'stage-pill' }, stageName(l.status))),
      el('td', { style: 'color:var(--text-3)' }, l.last_contacted_at ? timeAgo(l.last_contacted_at) : 'never'))));
    view.appendChild(el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Lead'), el('th', {}, 'Temp'), el('th', {}, 'Score'), el('th', {}, 'Phone'), el('th', {}, 'Stage'), el('th', {}, 'Last Contact'))),
      tbody)));
  };

  // ========== TASKS ==========
  CRM.pages.tasks = async function (view) {
    CRM.setActions(null);
    let mine = true;
    const tbody = el('tbody', { 'data-testid': 'tasks-tbody' });
    async function load() {
      tbody.innerHTML = '<tr><td colspan="5"><div class="spinner"></div></td></tr>';
      const res = await api.get('/tasks?status=open' + (mine ? '&mine=1' : ''));
      tbody.innerHTML = '';
      if (!res.data.length) { tbody.appendChild(el('tr', {}, el('td', { colspan: 5 }, el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-check-double' }), el('div', {}, 'No open tasks'))))); return; }
      res.data.forEach(t => {
        const overdue = t.due_at && new Date(t.due_at) < new Date();
        tbody.appendChild(el('tr', { 'data-testid': 'task-row-' + t.id },
          el('td', {}, el('span', { class: 'chip' }, t.type), t.escalated ? el('span', { style: 'margin-left:8px;color:var(--hot)' }, '🔺 escalated') : null),
          el('td', { onclick: () => t.lead_id && (location.hash = '#/leads/' + t.lead_id), style: 'cursor:pointer;font-weight:500' }, t.title),
          el('td', {}, t.lead ? t.lead.name : '—'),
          el('td', { style: overdue ? 'color:var(--hot)' : 'color:var(--text-3)' }, t.due_at ? (overdue ? 'Overdue · ' : '') + new Date(t.due_at).toLocaleDateString() : '—'),
          el('td', {}, el('button', { class: 'btn btn--sm', 'data-testid': 'complete-' + t.id, onclick: async () => { await api.post('/tasks/' + t.id + '/complete'); toast('Completed', 'success'); load(); } }, 'Complete'))));
      });
    }
    const toggle = el('div', { class: 'filters' });
    const mineBtn = el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'tasks-mine' }, 'My Tasks');
    const allBtn = el('button', { class: 'btn btn--sm', 'data-testid': 'tasks-all' }, 'All Tasks');
    mineBtn.addEventListener('click', () => { mine = true; mineBtn.classList.add('btn--primary'); allBtn.classList.remove('btn--primary'); load(); });
    allBtn.addEventListener('click', () => { mine = false; allBtn.classList.add('btn--primary'); mineBtn.classList.remove('btn--primary'); load(); });
    toggle.append(mineBtn, allBtn);
    view.innerHTML = '';
    view.appendChild(el('div', { class: 'toolbar' }, toggle));
    view.appendChild(el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Type'), el('th', {}, 'Task'), el('th', {}, 'Lead'), el('th', {}, 'Due'), el('th', {}, ''))), tbody)));
    load();
  };

  // ========== IMPORT ==========
  CRM.pages.import = async function (view) {
    CRM.setActions(null);
    view.innerHTML = '';
    const sample = 'name,email,phone,source,city\nJohn Doe,john@example.com,9800000001,Website Form,Bengaluru\nJane Roe,jane@example.com,9800000002,Meta,Chennai';
    const ta = el('textarea', { class: 'input', rows: 8, 'data-testid': 'import-csv', placeholder: 'Paste CSV (first row = headers: name,email,phone,source,city)' }, sample);
    const preview = el('div', { style: 'margin-top:16px' });
    const previewBtn = el('button', { class: 'btn', 'data-testid': 'import-preview' }, el('i', { class: 'fa-solid fa-eye' }), 'Preview');
    const commitBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'import-commit' }, el('i', { class: 'fa-solid fa-file-import' }), 'Import Valid Rows');
    const fileInput = el('input', { type: 'file', accept: '.csv', 'data-testid': 'import-file', style: 'display:none' });
    fileInput.addEventListener('change', () => { const f = fileInput.files[0]; if (f) { const r = new FileReader(); r.onload = () => ta.value = r.result; r.readAsText(f); } });

    previewBtn.addEventListener('click', async () => {
      preview.innerHTML = '<div class="spinner"></div>';
      const res = await api.post('/leads-import/preview', { csv: ta.value });
      preview.innerHTML = '';
      const tbody = el('tbody', {});
      res.rows.forEach(r => tbody.appendChild(el('tr', {},
        el('td', {}, String(r.row)),
        el('td', {}, r.data.name || '—'),
        el('td', {}, r.data.email || r.data.phone || '—'),
        el('td', {}, r.data.source || '—'),
        el('td', {}, r.valid ? el('span', { class: 'tag-ok' }, '✓ Valid') : el('span', { class: 'tag-bad' }, '✗ Invalid')),
        el('td', {}, r.duplicate ? el('span', { class: 'tag-bad' }, r.duplicate.replace(/_/g, ' ')) : el('span', { class: 'tag-ok' }, 'unique')))));
      preview.appendChild(el('div', { class: 'section-title' }, 'Preview (' + res.total + ' rows)'));
      preview.appendChild(el('div', { class: 'table-wrap' }, el('table', { class: 'import-table' },
        el('thead', {}, el('tr', {}, el('th', {}, '#'), el('th', {}, 'Name'), el('th', {}, 'Contact'), el('th', {}, 'Source'), el('th', {}, 'Valid'), el('th', {}, 'Duplicate'))), tbody)));
    });

    commitBtn.addEventListener('click', async () => {
      commitBtn.disabled = true;
      try {
        const res = await api.post('/leads-import/commit', { csv: ta.value, skip_duplicates: true });
        const im = res.import;
        toast(`Imported ${im.imported} · ${im.duplicates} dupes · ${im.failed} failed`, 'success');
        preview.innerHTML = '';
        preview.appendChild(el('div', { class: 'card' },
          el('div', { class: 'section-title', style: 'margin-top:0' }, 'Import Result'),
          el('div', { class: 'cards' },
            el('div', { class: 'stat' }, el('div', { class: 'k' }, 'Imported'), el('div', { class: 'v mono tag-ok' }, String(im.imported))),
            el('div', { class: 'stat' }, el('div', { class: 'k' }, 'Duplicates'), el('div', { class: 'v mono' }, String(im.duplicates))),
            el('div', { class: 'stat' }, el('div', { class: 'k' }, 'Failed'), el('div', { class: 'v mono tag-bad' }, String(im.failed)))),
          (im.error_log && im.error_log.length) ? el('div', { style: 'margin-top:14px' }, el('div', { class: 'section-title' }, 'Error Log'),
            ...im.error_log.map(e => el('div', { style: 'font-size:12.5px;color:var(--text-2);padding:4px 0;border-bottom:1px solid var(--border)' }, `Row ${e.row}: ${e.error}`))) : null));
      } catch (err) { toast(err.message, 'error'); }
      commitBtn.disabled = false;
    });

    view.appendChild(el('div', { class: 'card' },
      el('div', { class: 'section-title', style: 'margin-top:0' }, el('i', { class: 'fa-solid fa-file-csv' }), 'Bulk Lead Import'),
      el('p', { class: 'help', style: 'margin-bottom:12px' }, 'Duplicate detection runs on preview. Valid, unique rows are imported and routed to the pre-sales queue with a Verify task each.'),
      ta,
      el('div', { class: 'toolbar', style: 'margin-top:14px' }, previewBtn,
        el('button', { class: 'btn', onclick: () => fileInput.click() }, el('i', { class: 'fa-solid fa-upload' }), 'Upload File'), fileInput,
        el('div', { class: 'spacer' }), commitBtn)));
    view.appendChild(preview);
  };
})();
