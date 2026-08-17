// ---- Sales command-centre dashboards (BDE / BDM / Sales-Admin) + BDM Opportunity board ----
(function () {
  const { el: h, api, toast, state } = CRM;
  const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

  function heroBlock(hello, sub) {
    return h('div', { class: 'ck-hero' },
      h('div', {}, h('div', { class: 'ck-hello', html: hello }), h('div', { class: 'ck-sub' }, sub)));
  }
  function stat(lbl, val, opts = {}) {
    return h('div', { class: 'ck-stat' + (opts.hot ? ' is-hot' : '') + (opts.urgent ? ' is-urgent' : ''), 'data-testid': 'stat-' + (opts.key || lbl) },
      h('div', { class: 'lbl' }, lbl), h('div', { class: 'num' }, fmt(val)));
  }
  const tmpClass = (t) => 'tmp ' + (t || 'cold');
  const when = (iso) => iso ? new Date(iso).toLocaleString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  // ---------------- BDE — Focus Stream ----------------
  let bdeStatusMap = null;
  async function loadBdeStatuses() {
    if (bdeStatusMap) return bdeStatusMap;
    const r = await api.get('/journey/statuses?group=bde');
    const map = {};
    (r.stages || []).forEach(st => (st.statuses || []).forEach(s => { map[s.code] = s; }));
    bdeStatusMap = map; return map;
  }

  async function renderBDE(view) {
    view.innerHTML = '';
    const wrap = h('div', { class: 'cockpit', 'data-testid': 'bde-dashboard' });
    view.appendChild(wrap);
    const [d, smap] = await Promise.all([api.get('/dashboards/bde'), loadBdeStatuses()]);
    const s = d.stats || {};
    wrap.appendChild(heroBlock('Good day, <b>' + (state.user?.name?.split(' ')[0] || 'there') + '</b>', 'Your call queue, sorted by what needs you first.'));

    const grid = h('div', { class: 'bde-grid' });
    wrap.appendChild(grid);

    // left stats
    grid.appendChild(h('div', { class: 'bde-stats' },
      stat('Calls due today', s.calls_due_today, { key: 'calls-due', urgent: (s.calls_due_today || 0) > 0 }),
      stat('Open tasks', s.open_tasks, { key: 'open-tasks' }),
      stat('Contacted today', s.contacted_today, { key: 'contacted', hot: true }),
      stat('Follow-ups pending', s.followups_pending, { key: 'followups' }),
      stat('Converted this month', s.converted_month, { key: 'converted', hot: true })));

    // center work stack
    const center = h('div', {});
    grid.appendChild(center);
    center.appendChild(h('div', { class: 'ck-h2' }, 'Due now', h('span', { class: 'cnt' }, (d.work_stack || []).length + ' in queue')));
    const stack = h('div', { class: 'stack', 'data-testid': 'bde-work-stack' });
    center.appendChild(stack);

    // right context
    const ctxWrap = h('div', {});
    grid.appendChild(ctxWrap);

    const items = d.work_stack || [];
    if (!items.length) {
      stack.appendChild(h('div', { class: 'ck-empty' }, h('div', { class: 'big' }, 'Queue clear'), h('div', { class: 'small' }, 'Excellent work — nothing needs you right now.')));
      ctxWrap.appendChild(h('div', { class: 'ctx' }, h('div', { class: 'ctx-meta' }, 'Select a lead to see details.')));
      CRM.setTitle('Pre-Sales Command'); return;
    }

    function renderCtx(item) {
      ctxWrap.innerHTML = '';
      const l = item.lead || {};
      ctxWrap.appendChild(h('div', { class: 'ctx', 'data-testid': 'bde-context' },
        h('div', { class: 'ctx-name' }, l.name || '—'),
        h('div', { class: 'ctx-meta' }, (l.status_label || '—') + ' · ' + (l.source || 'Direct')),
        h('div', { class: 'ctx-grid' },
          h('div', { class: 'ctx-cell' }, h('div', { class: 'k' }, 'Score'), h('div', { class: 'v' }, l.score ?? '—')),
          h('div', { class: 'ctx-cell' }, h('div', { class: 'k' }, 'Temp'), h('div', { class: 'v' }, h('span', { class: tmpClass(l.temperature) }, (l.temperature || 'cold').toUpperCase()))),
          h('div', { class: 'ctx-cell' }, h('div', { class: 'k' }, 'Phone'), h('div', { class: 'v', style: 'font-size:.95rem' }, l.phone || '—'))),
        l.phone ? h('a', { class: 'btn-pill', href: 'tel:' + l.phone, style: 'display:block;text-align:center;text-decoration:none', 'data-testid': 'bde-call' }, '📞  Call now') : null,
        h('button', { class: 'btn-ghost', 'data-testid': 'bde-open-lead', onclick: () => { location.hash = '#/leads'; } }, 'Open in Leads')));
    }

    async function disposition(item, code, node) {
      try {
        await api.post('/journey/leads/' + item.lead.id + '/transition', { code });
        node.classList.add('leaving');
        toast('Updated → ' + (smap[code]?.display_name || code), 'success');
        setTimeout(() => renderBDE(view), 350);
      } catch (e) { toast(e.message || 'Move blocked', 'error'); }
    }

    items.forEach((item, i) => {
      const focus = i === 0;
      const card = h('div', { class: 'task-card bk-' + item.bucket + (focus ? ' focus' : ''), 'data-testid': 'bde-task-' + item.id, onclick: () => renderCtx(item) });
      if (focus) card.appendChild(h('div', { class: 'focus-badge' }, 'Next up'));
      card.appendChild(h('div', { class: 'tc-top' },
        h('div', {}, h('div', { class: 'tc-name' }, item.lead?.name || 'Lead'), h('div', { class: 'tc-title' }, item.title)),
        h('div', { class: 'tc-due bk-' + item.bucket }, item.minutes_to_due === null ? 'No due' : (item.minutes_to_due < 0 ? 'Overdue' : 'in ' + Math.round(item.minutes_to_due / 60) + 'h'))));
      // disposition buttons from the lead's allowed_next
      const cur = smap[item.lead?.status_code];
      const nexts = (cur?.allowed_next || []).filter(c => smap[c]);
      if (nexts.length) {
        const disp = h('div', { class: 'disp' });
        nexts.forEach(c => {
          const dst = smap[c];
          const cls = dst.disposition === 'lost' || dst.is_terminal ? 'lose' : (c === 'CONVERTED_OPPORTUNITY' ? 'win' : '');
          disp.appendChild(h('button', { class: cls, 'data-testid': 'bde-disp-' + item.id + '-' + c, onclick: (e) => { e.stopPropagation(); disposition(item, c, card); } }, dst.display_name));
        });
        card.appendChild(disp);
      }
      stack.appendChild(card);
    });
    renderCtx(items[0]);
    CRM.setTitle('Pre-Sales Command');
  }

  // ---------------- BDM — Opportunity Canvas ----------------
  async function renderBDM(view) {
    view.innerHTML = '';
    const wrap = h('div', { class: 'cockpit', 'data-testid': 'bdm-dashboard' });
    view.appendChild(wrap);
    const d = await api.get('/dashboards/bdm');
    const s = d.stats || {};
    wrap.appendChild(heroBlock('Opportunity <b>Canvas</b>', 'Confirmed meetings, live pipeline and engagement pulse.'));
    wrap.appendChild(h('div', { class: 'ck-stats', style: 'margin-bottom:26px' },
      stat('Active opportunities', s.active_opportunities, { key: 'opps', hot: true }),
      stat('Upcoming visits', s.upcoming_visits, { key: 'upcoming', urgent: (s.upcoming_visits || 0) > 0 }),
      stat('Active nudges', s.active_nudges, { key: 'nudges' }),
      stat('Won this month', s.won_month, { key: 'won', hot: true }),
      stat('Lost this month', s.lost_month, { key: 'lost' })));

    // Today's agenda
    wrap.appendChild(h('div', { class: 'ck-h2' }, 'Upcoming agenda', h('span', { class: 'cnt' }, (d.upcoming || []).length)));
    const agenda = h('div', { class: 'agenda', 'data-testid': 'bdm-agenda' });
    if (!(d.upcoming || []).length) agenda.appendChild(h('div', { class: 'ck-empty', style: 'padding:30px' }, h('div', { class: 'small' }, 'No upcoming visits or meetings.')));
    (d.upcoming || []).forEach(v => agenda.appendChild(h('div', { class: 'agenda-card' },
      h('div', { class: 'when' }, when(v.scheduled_at)),
      h('div', { class: 'who' }, v.lead?.name || 'Lead'),
      h('div', { class: 'st' }, v.status),
      h('button', { onclick: () => { location.hash = '#/visits'; } }, 'Open'))));
    wrap.appendChild(agenda);

    // Pipeline pulse
    wrap.appendChild(h('div', { class: 'ck-h2', style: 'margin-top:26px' }, '13-stage pipeline pulse',
      h('button', { class: 'btn-ghost', style: 'width:auto;margin:0 0 0 auto;padding:6px 14px', onclick: () => { location.hash = '#/opportunities'; }, 'data-testid': 'bdm-open-board' }, 'Open board →')));
    const pulse = h('div', { class: 'pulse', 'data-testid': 'bdm-pulse' });
    (d.pipeline || []).filter(p => p.code !== 'OPP_WON' && p.code !== 'OPP_LOST').forEach(p => {
      const col = h('div', { class: 'pulse-col' });
      col.style.borderTopColor = p.color || '#4F5823';
      col.appendChild(h('div', { class: 'pc-stage' }, p.stage_name));
      col.appendChild(h('div', { class: 'pc-name' }, p.display_name));
      col.appendChild(h('div', { class: 'pc-num' }, fmt(p.count)));
      pulse.appendChild(col);
    });
    wrap.appendChild(pulse);

    // Engagement pulse
    wrap.appendChild(h('div', { class: 'ck-h2', style: 'margin-top:26px' }, 'Engagement nudges', h('span', { class: 'cnt' }, (d.engagements || []).length + ' active')));
    const eng = h('div', { class: 'eng-list', 'data-testid': 'bdm-engagements' });
    if (!(d.engagements || []).length) eng.appendChild(h('div', { class: 'ck-empty', style: 'padding:24px' }, h('div', { class: 'small' }, 'No active nudge loops.')));
    (d.engagements || []).forEach(e => {
      const dots = h('div', { class: 'eng-dots' });
      for (let i = 0; i < e.total_sends; i++) dots.appendChild(h('i', { class: i < e.sends_done ? 'on' : '' }));
      eng.appendChild(h('div', { class: 'eng-row' },
        h('div', {}, h('div', { class: 'en-name' }, e.lead?.name || 'Lead'), h('div', { class: 'en-mode' }, (e.mode === 'google_meet' ? 'Google Meet' : 'Site visit') + ' · ' + when(e.appointment_at))),
        dots,
        h('div', { class: 'en-next' }, e.next_send_at ? 'next ' + when(e.next_send_at) : 'done')));
    });
    wrap.appendChild(eng);
    CRM.setTitle('Sales Command');
  }

  // ---------------- Sales-Admin — Command Matrix ----------------
  function funnelBars(entries, key) {
    const max = Math.max(1, ...entries.map(e => e.count));
    const panel = h('div', { class: 'panel', 'data-testid': 'admin-' + key });
    panel.appendChild(h('div', { class: 'ck-h2' }, key === 'funnel_bde' ? 'Pre-Sales funnel (BDE)' : 'Opportunity funnel (BDM)'));
    entries.forEach(e => {
      panel.appendChild(h('div', { class: 'fbar' },
        h('div', { class: 'fl' }, e.display_name),
        h('div', { class: 'track' }, (() => { const f = h('div', { class: 'fill' }); f.style.width = Math.round(e.count / max * 100) + '%'; f.style.background = e.color || '#4F5823'; return f; })()),
        h('div', { class: 'fv' }, fmt(e.count))));
    });
    return panel;
  }

  async function renderSalesAdmin(view) {
    view.innerHTML = '';
    const wrap = h('div', { class: 'cockpit', 'data-testid': 'salesadmin-dashboard' });
    view.appendChild(wrap);
    const d = await api.get('/dashboards/admin');
    const s = d.stats || {};
    wrap.appendChild(heroBlock('Command <b>Matrix</b>', 'Funnel health, team workload and SLA pressure at a glance.'));
    wrap.appendChild(h('div', { class: 'ck-stats', style: 'margin-bottom:26px' },
      stat('Open leads', s.total_open, { key: 'open' }),
      stat('Opportunities', s.opportunities, { key: 'opps', hot: true }),
      stat('Won this month', s.won_month, { key: 'won', hot: true }),
      stat('Active nudges', s.active_nudges, { key: 'nudges' }),
      stat('Upcoming visits', s.upcoming_visits, { key: 'upcoming', urgent: (s.upcoming_visits || 0) > 0 })));

    const bento = h('div', { class: 'bento' });
    wrap.appendChild(bento);
    bento.appendChild(funnelBars(d.funnel_bde || [], 'funnel_bde'));

    // Workload
    const wl = h('div', { class: 'panel', 'data-testid': 'admin-workload' });
    wl.appendChild(h('div', { class: 'ck-h2' }, 'Workload balance'));
    (d.workload || []).forEach(u => wl.appendChild(h('div', { class: 'wl-row' },
      h('span', { class: 'wl-band' }, u.band),
      h('span', { class: 'wl-name' }, u.name),
      h('span', { class: 'wl-metric' }, h('div', { class: 'k' }, 'Leads'), h('div', { class: 'v' }, fmt(u.open_leads))),
      h('span', { class: 'wl-metric' }, h('div', { class: 'k' }, 'Tasks'), h('div', { class: 'v' }, fmt(u.open_tasks))))));
    if (!(d.workload || []).length) wl.appendChild(h('div', { class: 'ck-empty', style: 'padding:20px' }, h('div', { class: 'small' }, 'No active reps.')));
    bento.appendChild(wl);

    bento.appendChild(funnelBars(d.funnel_bdm || [], 'funnel_bdm'));

    // SLA
    const sla = d.sla || {};
    const slaPanel = h('div', { class: 'panel', 'data-testid': 'admin-sla' });
    slaPanel.appendChild(h('div', { class: 'ck-h2' }, 'Task SLA pressure'));
    slaPanel.appendChild(h('div', { class: 'sla-strip' },
      h('div', { class: 'sla-cell breached' }, h('div', { class: 'v' }, fmt(sla.breached)), h('div', { class: 'k' }, 'Breached')),
      h('div', { class: 'sla-cell red' }, h('div', { class: 'v' }, fmt(sla.red)), h('div', { class: 'k' }, '< 1h')),
      h('div', { class: 'sla-cell amber' }, h('div', { class: 'v' }, fmt(sla.amber)), h('div', { class: 'k' }, '< 4h')),
      h('div', { class: 'sla-cell green' }, h('div', { class: 'v' }, fmt(sla.green)), h('div', { class: 'k' }, 'Healthy'))));
    bento.appendChild(slaPanel);

    // Gravity heatmap (BDM stage load)
    const bdm = d.funnel_bdm || [];
    const max = Math.max(1, ...bdm.map(e => e.count));
    const heatPanel = h('div', { class: 'panel full', 'data-testid': 'admin-heatmap' });
    heatPanel.appendChild(h('div', { class: 'ck-h2' }, 'Opportunity gravity heatmap'));
    const heat = h('div', { class: 'heat' });
    bdm.forEach(e => {
      const alpha = 0.06 + 0.55 * (e.count / max);
      const cell = h('div', { class: 'heat-cell' },
        h('div', { class: 'hn' }, e.display_name),
        h('div', { class: 'hv' }, fmt(e.count)));
      cell.style.background = 'rgba(79,88,35,' + alpha.toFixed(2) + ')';
      if (e.count === max && max > 0) cell.style.borderColor = '#111';
      heat.appendChild(cell);
    });
    heatPanel.appendChild(heat);
    bento.appendChild(heatPanel);
    CRM.setTitle('Sales Admin Command');
  }

  // ---------------- BDM Opportunity board (kanban page) ----------------
  CRM.pages.opportunities = async function (view) {
    view.innerHTML = '';
    CRM.setTitle('Opportunity Pipeline');
    const wrap = h('div', { class: 'oppboard', 'data-testid': 'opportunity-board' });
    view.appendChild(wrap);
    let dragCode = null, dragLeadId = null;

    async function load() {
      const d = await api.get('/opportunities/board');
      wrap.innerHTML = '';
      wrap.appendChild(h('div', { class: 'ck-hero', style: 'font-family:Manrope' },
        h('div', {}, h('div', { style: 'font-size:2rem;font-weight:300;letter-spacing:-0.03em' }, (d.total || 0) + ' open opportunities'),
          h('div', { style: 'color:#666;margin-top:4px' }, 'Drag a card to advance its stage. Transitions follow the pipeline rules.'))));
      const lanes = h('div', { class: 'ob-lanes' });
      (d.lanes || []).forEach(lane => {
        const laneEl = h('div', { class: 'ob-lane' }, h('div', { class: 'ob-lane-head' }, lane.name));
        (lane.statuses || []).forEach(st => {
          const col = h('div', { class: 'ob-col', 'data-testid': 'opp-col-' + st.code });
          col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('drop'); });
          col.addEventListener('dragleave', () => col.classList.remove('drop'));
          col.addEventListener('drop', async (e) => {
            e.preventDefault(); col.classList.remove('drop');
            if (!dragLeadId || dragCode === st.code) return;
            try { await api.post('/journey/leads/' + dragLeadId + '/transition', { code: st.code }); toast('Moved → ' + st.display_name, 'success'); load(); }
            catch (err) { toast(err.message || 'Move blocked', 'error'); }
          });
          col.appendChild(h('div', { class: 'ob-col-head' },
            h('div', { class: 'ob-col-title' }, (() => { const dot = h('span', { class: 'ob-dot' }); dot.style.background = st.color || '#4F5823'; return dot; })(), st.display_name),
            h('span', { class: 'ob-col-count' }, st.count)));
          if (!st.leads.length) col.appendChild(h('div', { class: 'ob-empty' }, '—'));
          st.leads.forEach(l => {
            const card = h('div', { class: 'ob-card', draggable: 'true', 'data-testid': 'opp-card-' + l.id },
              h('div', { class: 'oc-name' }, l.name),
              h('div', { class: 'oc-meta' }, h('span', {}, (l.temperature || 'cold').toUpperCase()), h('span', {}, l.owner || '—'), h('span', {}, l.source || '')));
            card.addEventListener('dragstart', () => { dragCode = st.code; dragLeadId = l.id; card.classList.add('dragging'); });
            card.addEventListener('dragend', () => card.classList.remove('dragging'));
            col.appendChild(card);
          });
          laneEl.appendChild(col);
        });
        lanes.appendChild(laneEl);
      });
      wrap.appendChild(lanes);
    }
    await load();
  };

  // ---------------- Route the main dashboard by role ----------------
  const origDash = CRM.pages.dashboard;
  CRM.pages.dashboard = async function (view, id) {
    const role = state.user && state.user.role;
    try {
      if (role === 'sales_bde') return await renderBDE(view);
      if (role === 'sales_bdm') return await renderBDM(view);
      if (role === 'sales_head' || role === 'admin' || role === 'process_admin') return await renderSalesAdmin(view);
    } catch (e) { /* fall back to the legacy dashboard on any error */ }
    return origDash ? origDash(view, id) : null;
  };
})();
