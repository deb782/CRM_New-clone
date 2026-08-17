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

    // One-tap reschedule requests (customer tapped "Reschedule"; proposed slot auto-filled from their reply).
    const rr = d.reschedule_requests || [];
    if (rr.length) {
      wrap.appendChild(h('div', { class: 'ck-h2', style: 'margin-top:26px' }, 'Reschedule requests', h('span', { class: 'cnt' }, rr.length)));
      const box = h('div', { class: 'eng-list', 'data-testid': 'bdm-reschedules' });
      rr.forEach(r => {
        const propTxt = r.proposed_at ? when(r.proposed_at) : (r.preferred_text || 'awaiting reply');
        box.appendChild(h('div', { class: 'eng-row' },
          h('div', { style: 'min-width:0' }, h('div', { class: 'en-name' }, r.lead_name || 'Lead'), h('div', { class: 'en-mode' }, 'Wants: ' + propTxt)),
          (r.proposed_at && r.visit_id)
            ? h('button', {
                class: 'btn-pill', style: 'width:auto;padding:9px 16px', 'data-testid': 'confirm-resched-' + r.task_id,
                onclick: async () => {
                  try { await api.post('/reschedules/' + r.task_id + '/confirm', {}); toast('Rescheduled to ' + when(r.proposed_at), 'success'); renderBDM(view); }
                  catch (e) { toast(e.message || 'Could not reschedule', 'error'); }
                }
              }, 'Confirm ' + when(r.proposed_at))
            : h('span', { class: 'en-next' }, 'awaiting date')));
      });
      wrap.appendChild(box);
    }

    // Full-month calendar — everything on the BDM's plate (visits + tasks). Drag a visit to another day to reschedule.
    wrap.appendChild(h('div', { class: 'ck-h2', style: 'margin-top:26px' }, 'Your month'));
    wrap.appendChild(monthCalendar(d.calendar || [], {
      title: 'This month · visits & tasks',
      onReschedule: async (vid, iso) => {
        try { await api.post('/site-visits/' + vid + '/reschedule', { scheduled_at: iso, reason: 'Rescheduled from calendar' }); toast('Visit moved', 'success'); renderBDM(view); }
        catch (e) { toast(e.message || 'Could not move visit', 'error'); }
      },
    }));
    CRM.setTitle('Sales Command');
  }

  // ---------------- Shared: full-month calendar ----------------
  const dh = CRM.dashHelpers || {};
  const df = (n) => (dh.fmt ? dh.fmt(n) : String(n || 0));

  function monthCalendar(events, opts) {
    opts = opts || {};
    const byDate = {};
    (events || []).forEach(e => { if (e.date) (byDate[e.date] = byDate[e.date] || []).push(e); });
    const today = new Date();
    let year = today.getFullYear(), month = today.getMonth();
    const pad = (n) => String(n).padStart(2, '0');
    const key = (y, m, d) => y + '-' + pad(m + 1) + '-' + pad(d);
    let selected = key(year, month, today.getDate());
    let dragVisit = null;
    const head = h('div', { class: 'cal-head' });
    const grid = h('div', { class: 'cal-grid' });
    const agenda = h('div', { class: 'cal-agenda' });

    function renderAgenda() {
      agenda.innerHTML = '';
      const list = (byDate[selected] || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at));
      agenda.appendChild(h('div', { class: 'cal-agenda-h' }, new Date(selected + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })));
      if (!list.length) { agenda.appendChild(h('div', { class: 'cal-none' }, 'Nothing scheduled')); return; }
      list.forEach(it => {
        const item = h('div', { class: 'cal-item ' + it.kind + (it.kind === 'visit' && it.visit_id && opts.onReschedule ? ' drag' : ''), 'data-testid': 'cal-item', onclick: () => { if (it.lead_id) location.hash = '#/leads'; } },
          h('span', { class: 'cal-ic' }, h('i', { class: 'fa-solid ' + (it.kind === 'visit' ? 'fa-location-dot' : 'fa-list-check') })),
          h('div', { style: 'min-width:0' },
            h('div', { class: 'cal-it-t' }, it.title),
            h('div', { class: 'cal-it-m' }, (it.lead_name ? it.lead_name + ' · ' : '') + (it.at ? new Date(it.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''))));
        if (it.kind === 'visit' && it.visit_id && opts.onReschedule) {
          item.setAttribute('draggable', 'true');
          item.addEventListener('dragstart', () => { dragVisit = it; });
          item.addEventListener('dragend', () => { dragVisit = null; });
        }
        agenda.appendChild(item);
      });
    }
    function render() {
      head.innerHTML = ''; grid.innerHTML = '';
      const monthName = new Date(year, month, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
      head.appendChild(h('div', { class: 'cal-title' }, opts.title || 'Calendar'));
      head.appendChild(h('div', { class: 'cal-nav' },
        h('button', { 'data-testid': 'cal-prev', onclick: () => { month--; if (month < 0) { month = 11; year--; } render(); } }, h('i', { class: 'fa-solid fa-chevron-left' })),
        h('span', { class: 'cal-mon' }, monthName),
        h('button', { 'data-testid': 'cal-next', onclick: () => { month++; if (month > 11) { month = 0; year++; } render(); } }, h('i', { class: 'fa-solid fa-chevron-right' }))));
      ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(w => grid.appendChild(h('div', { class: 'cal-dow' }, w)));
      const first = new Date(year, month, 1).getDay();
      const days = new Date(year, month + 1, 0).getDate();
      for (let i = 0; i < first; i++) grid.appendChild(h('div', { class: 'cal-cell empty' }));
      for (let d = 1; d <= days; d++) {
        const k = key(year, month, d);
        const list = byDate[k] || [];
        const isToday = k === key(today.getFullYear(), today.getMonth(), today.getDate());
        const cell = h('div', { class: 'cal-cell' + (isToday ? ' today' : '') + (k === selected ? ' sel' : '') + (list.length ? ' has' : ''), 'data-testid': 'cal-day-' + k, onclick: () => { selected = k; render(); } },
          h('span', { class: 'cal-d' }, String(d)));
        if (list.length) {
          const dots = h('div', { class: 'cal-dots' });
          if (list.some(x => x.kind === 'visit')) dots.appendChild(h('i', { class: 'v' }));
          if (list.some(x => x.kind === 'task')) dots.appendChild(h('i', { class: 't' }));
          cell.appendChild(dots);
        }
        if (opts.onReschedule) {
          cell.addEventListener('dragover', (e) => { if (dragVisit) { e.preventDefault(); cell.classList.add('cal-drop'); } });
          cell.addEventListener('dragleave', () => cell.classList.remove('cal-drop'));
          cell.addEventListener('drop', async (e) => {
            e.preventDefault(); cell.classList.remove('cal-drop');
            if (!dragVisit || !dragVisit.visit_id) return;
            const t = dragVisit.at ? new Date(dragVisit.at) : new Date();
            const nd = new Date(year, month, d, t.getHours(), t.getMinutes());
            const vid = dragVisit.visit_id; dragVisit = null;
            await opts.onReschedule(vid, nd.toISOString());
          });
        }
        grid.appendChild(cell);
      }
      renderAgenda();
    }
    render();
    return h('div', { class: 'cal-card', 'data-testid': 'dash-month-calendar' }, head, grid, agenda);
  }

  // ---------------- Sales-Admin — Command Matrix ----------------
  const FUNNEL_ICONS = ['fa-crown', 'fa-medal', 'fa-award'];
  function funnelCard(title, entries) {
    const sorted = (entries || []).slice().sort((a, b) => b.count - a.count);
    const top = sorted.slice(0, 3), rest = sorted.slice(3);
    const max = Math.max(1, ...sorted.map(e => e.count));
    const card = h('div', { class: 'chart-card', 'data-testid': 'funnel-' + title.replace(/\W+/g, '-').toLowerCase() });
    card.appendChild(h('div', { class: 'chart-card__head' }, h('h3', {}, title), h('span', { class: 'mut' }, df(sorted.reduce((a, b) => a + b.count, 0)) + ' in stage')));
    const cards = h('div', { class: 'fn-top' });
    top.forEach((e, i) => {
      const ic = h('div', { class: 'fn-tic' }, h('i', { class: 'fa-solid ' + FUNNEL_ICONS[i] }));
      ic.style.color = e.color || '#4F5823';
      cards.appendChild(h('div', { class: 'fn-tcard' }, ic, h('div', { class: 'fn-tnum' }, df(e.count)), h('div', { class: 'fn-tlbl' }, e.display_name)));
    });
    card.appendChild(cards);
    if (rest.length) {
      const list = h('div', { class: 'fn-list' });
      rest.forEach(e => {
        const fill = h('div', { class: 'fn-fill' }); fill.style.background = e.color || '#4F5823'; setTimeout(() => fill.style.width = Math.round(e.count / max * 100) + '%', 40);
        list.appendChild(h('div', { class: 'fn-row' },
          (() => { const dot = h('span', { class: 'fn-dot' }); dot.style.background = e.color || '#4F5823'; return dot; })(),
          h('span', { class: 'fn-name' }, e.display_name),
          h('div', { class: 'fn-bar' }, fill),
          h('span', { class: 'fn-val' }, df(e.count))));
      });
      card.appendChild(list);
    }
    return card;
  }

  async function renderSalesAdmin(view) {
    view.innerHTML = '';
    const wrap = h('div', { class: 'dash-admin2', 'data-testid': 'salesadmin-dashboard' });
    view.appendChild(wrap);
    const d = await api.get('/dashboards/admin');
    const s = d.stats || {};
    const closed = (s.won_month || 0) + (s.lost_month || 0);
    const pct = closed ? Math.round((s.won_month || 0) / closed * 100) : 0;

    const hero = h('div', { class: 'dash-hero', 'data-testid': 'dash-hero' },
      h('div', { class: 'hero-greet' }, 'Command ', h('b', {}, 'Matrix')),
      h('div', { class: 'hero-sub' }, 'Funnel health and this month\u2019s meetings at a glance.'),
      dh.ring ? dh.ring(pct, df(s.won_month) + ' won') : null,
      h('div', { class: 'breakdown' },
        h('div', { class: 'bd', style: '--dot:var(--hot)' }, h('div', { class: 'lbl' }, 'Opportunities'), h('div', { class: 'num' }, df(s.opportunities))),
        h('div', { class: 'bd', style: '--dot:#2F7D32' }, h('div', { class: 'lbl' }, 'Won (mo)'), h('div', { class: 'num' }, df(s.won_month))),
        h('div', { class: 'bd', style: '--dot:var(--cold)' }, h('div', { class: 'lbl' }, 'Lost (mo)'), h('div', { class: 'num' }, df(s.lost_month)))),
      h('div', { class: 'hero-foot' }, h('div', { class: 'lbl' }, 'Open Leads'), h('div', { class: 'hero-num' }, df(s.total_open), h('span', { class: 'unit' }, 'leads'))));

    const kpiRow = h('div', { class: 'kpi-row', 'data-testid': 'dash-kpis' },
      dh.kpi('Open Leads', df(s.total_open), { icon: 'fa-users', sub: 'in the pipeline' }),
      dh.kpi('Opportunities', df(s.opportunities), { icon: 'fa-bullseye', sub: 'with a BDM' }),
      dh.kpi('Won This Month', df(s.won_month), { icon: 'fa-trophy', deltaClass: 'delta--lime', sub: 'closed deals' }),
      dh.kpi('Upcoming Visits', df(s.upcoming_visits), { icon: 'fa-location-dot', sub: 'site visits & meets' }));

    const right = h('div', { class: 'dash-right' }, kpiRow,
      funnelCard('Pre-Sales funnel (BDE)', d.funnel_bde || []),
      funnelCard('Opportunity funnel (BDM)', d.funnel_bdm || []),
      monthCalendar(d.calendar || [], {
        title: 'This month · site visits & meets',
        onReschedule: async (vid, iso) => {
          try { await api.post('/site-visits/' + vid + '/reschedule', { scheduled_at: iso, reason: 'Rescheduled from calendar' }); toast('Visit moved', 'success'); renderSalesAdmin(view); }
          catch (e) { toast(e.message || 'Could not move visit', 'error'); }
        },
      }));

    wrap.appendChild(h('div', { class: 'dash-grid' }, hero, right));
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
