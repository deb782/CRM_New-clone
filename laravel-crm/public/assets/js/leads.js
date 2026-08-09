// ---- Leads, Pipeline, Call List, Tasks, Import ----
(function () {
  const { el, api, toast, modal, money, timeAgo, tempBadge, stageName, initials, can, state } = CRM;

  const STAGES = ['new_lead','contacted','interested','opportunity','site_visit_scheduled','site_visit_completed','negotiation','won','lost','not_interested','no_response'];
  const SOURCES = ['Website Form','Meta','Facebook','Instagram','Chatbot','Walk-in','Phone','Referral','Bulk Import','Other'];

  function scoreBar(score) {
    return el('span', { class: 'score-bar' },
      el('span', { class: 'track' }, el('span', { class: 'fill', style: 'width:' + Math.min(100, score) + '%' })),
      el('b', { class: 'mono', style: 'font-size:12px' }, String(score)));
  }

  // ========== LEADS TABLE ==========
  CRM.pages.leads = async function (view, id) {
    if (id) { return openLead(id); }
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
  async function openLead(id) {
    const overlay = el('div', { class: 'drawer-overlay', onclick: (e) => { if (e.target === overlay) close(); } });
    const drawer = el('div', { class: 'drawer', 'data-testid': 'lead-drawer' }, el('div', { class: 'spinner' }));
    overlay.appendChild(drawer);
    document.body.appendChild(overlay);
    function close() { overlay.remove(); if (location.hash.startsWith('#/leads/')) history.replaceState(null, '', '#/leads'); }

    const res = await api.get('/leads/' + id);
    const lead = res.lead;
    let timeline = res.timeline;
    let activeTab = 'timeline';

    function reload() { overlay.remove(); openLead(id); }

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
        save);
    }

    function commsPanel() {
      const waBody = el('textarea', { class: 'input', rows: 2, placeholder: 'WhatsApp message…', 'data-testid': 'wa-body' });
      const waSend = el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'wa-send' }, el('i', { class: 'fa-brands fa-whatsapp' }), 'Send WhatsApp');
      waSend.addEventListener('click', async () => { if (!waBody.value.trim()) return; await api.post('/leads/' + id + '/whatsapp', { body: waBody.value }); toast('WhatsApp sent', 'success'); reload(); });

      const emSub = el('input', { class: 'input', placeholder: 'Subject', 'data-testid': 'em-subject' });
      const emBody = el('textarea', { class: 'input', rows: 3, placeholder: 'Email body…', 'data-testid': 'em-body' });
      const emSend = el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'em-send' }, el('i', { class: 'fa-solid fa-envelope' }), 'Send Email');
      emSend.addEventListener('click', async () => { if (!emSub.value.trim()) return; await api.post('/leads/' + id + '/email', { subject: emSub.value, body: emBody.value }); toast('Email sent', 'success'); reload(); });

      const outcomes = [{v:'connected',l:'Connected'},{v:'no_answer',l:'No Answer'},{v:'switched_off',l:'Switched Off'},{v:'wrong_number',l:'Wrong Number'},{v:'busy',l:'Busy'}];
      const callOut = el('select', { class: 'select', 'data-testid': 'call-outcome' }, ...outcomes.map(o => el('option', { value: o.v }, o.l)));
      const callNotes = el('input', { class: 'input', placeholder: 'Call notes…', 'data-testid': 'call-notes' });
      const callLog = el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'call-log' }, el('i', { class: 'fa-solid fa-phone' }), 'Log Call');
      callLog.addEventListener('click', async () => { await api.post('/leads/' + id + '/call-log', { outcome: callOut.value, notes: callNotes.value }); toast('Call logged', 'success'); reload(); });

      return el('div', {},
        el('div', { class: 'card', style: 'margin-bottom:14px' }, el('div', { class: 'section-title', style: 'margin-top:0' }, el('i', { class: 'fa-solid fa-phone' }), 'Log Call'),
          el('div', { class: 'form-row' }, el('div', { class: 'field', style: 'margin:0' }, callOut), el('div', { class: 'field', style: 'margin:0' }, callNotes)),
          el('div', { style: 'margin-top:10px' }, callLog)),
        el('div', { class: 'card', style: 'margin-bottom:14px' }, el('div', { class: 'section-title', style: 'margin-top:0' }, el('i', { class: 'fa-brands fa-whatsapp' }), 'WhatsApp'),
          waBody, el('div', { style: 'margin-top:10px' }, waSend)),
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

    // build drawer
    drawer.innerHTML = '';
    const main = el('div', { class: 'drawer__main' });
    main.appendChild(el('div', { class: 'drawer__head' },
      el('div', { class: 'avatar' }, initials(lead.name)),
      el('div', { style: 'flex:1' },
        el('h2', { 'data-testid': 'lead-name' }, lead.name),
        el('div', { class: 'sub' }, (lead.email || '') + (lead.phone ? ' · ' + lead.phone : '')),
        el('div', { style: 'display:flex;gap:10px;align-items:center;margin-top:10px' }, tempBadge(lead.temperature), scoreBar(lead.score), stageChanger())),
      el('button', { class: 'icon-btn', 'data-testid': 'drawer-close', onclick: close }, el('i', { class: 'fa-solid fa-xmark' }))));

    const actionRow = el('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px' });
    if (!lead.contact_verified) actionRow.appendChild(el('button', { class: 'btn btn--sm', 'data-testid': 'verify-btn', onclick: async () => { await api.post('/leads/' + id + '/verify', {}); toast('Contact verified', 'success'); reload(); } }, el('i', { class: 'fa-solid fa-user-check' }), 'Verify Contact'));
    actionRow.appendChild(el('button', { class: 'btn btn--sm', 'data-testid': 'recalc-btn', onclick: async () => { const r = await api.post('/leads/' + id + '/recalculate'); toast('Score: ' + r.result.total + ' (' + r.result.temperature + ')', 'success'); reload(); } }, el('i', { class: 'fa-solid fa-arrows-rotate' }), 'Recalculate'));
    actionRow.appendChild(el('button', { class: 'btn btn--sm', 'data-testid': 'enroll-btn', onclick: async () => { await api.post('/leads/' + id + '/enroll', {}); toast('Enrolled in ' + lead.temperature + ' cadence', 'success'); reload(); } }, el('i', { class: 'fa-solid fa-seedling' }), 'Enroll Nurture'));
    actionRow.appendChild(el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'schedule-visit-btn', onclick: () => CRM.scheduleVisit(lead, reload) }, el('i', { class: 'fa-solid fa-calendar-check' }), 'Schedule Visit'));
    if (!lead.do_not_contact && !lead.is_invalid && !lead.locked) {
      actionRow.appendChild(el('button', { class: 'btn btn--sm', 'data-testid': 'dnc-btn', onclick: async () => { if (!confirm('Mark this lead Do-Not-Contact? Outbound messaging will stop.')) return; await api.post('/leads/' + id + '/dnc', { reason: 'requested' }); toast('Marked Do-Not-Contact', 'success'); reload(); } }, el('i', { class: 'fa-solid fa-ban' }), 'DNC'));
      actionRow.appendChild(el('button', { class: 'btn btn--sm btn--danger', 'data-testid': 'invalid-btn', onclick: async () => { const r = prompt('Reason (wrong_number, spam, invalid, junk):', 'spam'); if (!r) return; await api.post('/leads/' + id + '/invalid', { reason: r }); toast('Marked invalid', 'warning'); reload(); } }, el('i', { class: 'fa-solid fa-triangle-exclamation' }), 'Invalid'));
    }
    if (!lead.locked && lead.status !== 'won' && lead.status !== 'lost') {
      actionRow.appendChild(el('button', { class: 'btn btn--sm', style: 'color:var(--won);border-color:var(--won)', 'data-testid': 'won-btn', onclick: () => CRM.markWon(lead, reload) }, el('i', { class: 'fa-solid fa-trophy' }), 'Mark Won'));
      actionRow.appendChild(el('button', { class: 'btn btn--sm btn--danger', 'data-testid': 'lost-btn', onclick: () => CRM.markLost(lead, reload) }, el('i', { class: 'fa-solid fa-xmark' }), 'Mark Lost'));
    }
    if (lead.locked) {
      main.appendChild(el('div', { class: 'dup-alert', 'data-testid': 'lock-banner', style: 'display:flex;align-items:center;gap:8px' }, el('i', { class: 'fa-solid fa-lock' }), el('span', {}, 'Record locked — deal won and handed over to post-sales. Editing is restricted.')));
    }
    if (lead.do_not_contact || lead.is_invalid) {
      main.appendChild(el('div', { class: 'dup-alert', 'data-testid': 'flag-banner', style: 'display:flex;align-items:center;gap:8px' }, el('i', { class: 'fa-solid fa-ban' }), el('span', {}, (lead.is_invalid ? 'Invalid lead' : 'Do-Not-Contact') + (lead.invalid_reason ? (' · ' + lead.invalid_reason) : '') + ' — outbound messaging is suppressed.')));
    }
    main.appendChild(actionRow);

    const tabsBar = el('div', { class: 'tabs' });
    const content = el('div', { 'data-testid': 'tab-content' });
    [['timeline', 'Activity'], ['qualify', 'Qualify'], ['comms', 'Communicate'], ['quote', 'Quote'], ['booking', 'Booking'], ['postsales', 'Post-Sales']].forEach(([key, label]) => {
      const t = el('div', { class: 'tab ' + (activeTab === key ? 'active' : ''), 'data-testid': 'tab-' + key, onclick: () => { activeTab = key; [...tabsBar.children].forEach(c => c.classList.remove('active')); t.classList.add('active'); content.innerHTML = ''; content.appendChild(tabContent()); } }, label);
      tabsBar.appendChild(t);
    });
    main.appendChild(tabsBar);
    content.appendChild(tabContent());
    main.appendChild(content);

    drawer.appendChild(main);
    drawer.appendChild(sidePanel());
  }

  // ========== PIPELINE (Kanban) ==========
  CRM.pages.pipeline = async function (view) {
    CRM.setActions(null);
    const res = await api.get('/leads/board');
    view.innerHTML = '';
    const board = el('div', { class: 'kanban', 'data-testid': 'kanban' });
    res.stages.forEach(stage => {
      const leads = res.leads[stage.id] || [];
      const col = el('div', { class: 'kcol', 'data-testid': 'kcol-' + stage.slug });
      col.appendChild(el('div', { class: 'kcol__head' }, el('span', {}, stage.name), el('span', { class: 'count' }, leads.length)));
      const bodyEl = el('div', { class: 'kcol__body' });
      leads.forEach(l => bodyEl.appendChild(el('div', { class: 'kcard', 'data-testid': 'kcard-' + l.id, onclick: () => location.hash = '#/leads/' + l.id },
        el('div', { class: 'kn' }, l.name),
        el('div', { class: 'ks' }, l.email || l.phone || ''),
        el('div', { class: 'kf' }, tempBadge(l.temperature), el('b', { class: 'mono', style: 'font-size:12px' }, String(l.score))))));
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
