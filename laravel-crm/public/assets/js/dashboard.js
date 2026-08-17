// ---- Role-aware Dashboard: admin overview · sales cockpit (AI summaries + railway map) · functional (accounts/legal/crm) ----
(function () {
  const { el, api, timeAgo, tempBadge, stageName, state } = CRM;

  function fmt(n) { n = Number(n || 0); return n.toLocaleString('en-IN'); }
  const ymd = (dt) => { const d = new Date(dt); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const hhmm = (dt) => new Date(dt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  // ---------- shared KPI ----------
  function kpi(label, value, opts = {}) {
    return el('div', { class: 'kpi', 'data-testid': 'kpi-' + label.toLowerCase().replace(/\s+/g, '-') },
      el('div', { class: 'kpi__label' },
        el('span', {}, label),
        opts.icon ? el('span', { class: 'kpi__ico' }, el('i', { class: 'fa-solid ' + opts.icon })) : null),
      el('div', { class: 'kpi__val' }, value),
      el('div', { class: 'kpi__sub', style: 'display:flex;align-items:center;gap:8px' },
        opts.delta ? el('span', { class: 'delta ' + (opts.deltaClass || '') }, opts.delta) : null,
        opts.sub ? el('span', {}, opts.sub) : null));
  }

  function miniBars(entries) {
    const total = entries.reduce((a, b) => a + b.value, 0) || 1;
    return el('div', { class: 'mini-bars' }, ...entries.map(e =>
      el('div', { class: 'mb' },
        el('div', { class: 'mb__top' }, el('span', {}, e.label), el('b', {}, fmt(e.value))),
        el('div', { class: 'mb__track' }, (() => { const f = el('div', { class: 'mb__fill', style: 'width:0' }); setTimeout(() => f.style.width = Math.round(e.value / total * 100) + '%', 40); return f; })()))));
  }

  function funnelBars(entries) {
    const max = Math.max(1, ...entries.map(e => e.value));
    const hot = entries.reduce((a, b) => (b.value > (a ? a.value : -1) ? b : a), null);
    const bars = el('div', { class: 'bars', 'data-testid': 'dash-funnel-bars' });
    entries.forEach(e => {
      const isHot = hot && e.label === hot.label && e.value > 0;
      const h = Math.round((e.value / max) * 150) + 4;
      const bar = el('div', { class: 'bar', style: 'height:2px' }, isHot ? el('span', { class: 'btag' }, fmt(e.value)) : null);
      setTimeout(() => bar.style.height = h + 'px', 40);
      bars.appendChild(el('div', { class: 'barcol' + (isHot ? ' hot' : '') },
        el('div', { class: 'bv' }, fmt(e.value)), bar, el('div', { class: 'bx' }, e.short)));
    });
    return bars;
  }

  // =========================================================================
  // ADMIN — company-wide overview (hero ring)
  // =========================================================================
  function ring(pct, centerCap) {
    const r = 92, circ = 2 * Math.PI * r;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 210 210'); svg.setAttribute('width', '210'); svg.setAttribute('height', '210');
    const mk = (stroke, w, dash) => {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', '105'); c.setAttribute('cy', '105'); c.setAttribute('r', String(r));
      c.setAttribute('fill', 'none'); c.setAttribute('stroke', stroke); c.setAttribute('stroke-width', String(w));
      c.setAttribute('stroke-linecap', 'round'); c.setAttribute('transform', 'rotate(-90 105 105)');
      if (dash !== undefined) { c.setAttribute('stroke-dasharray', String(circ)); c.setAttribute('stroke-dashoffset', String(circ)); c.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.22,1,.36,1)'; setTimeout(() => c.setAttribute('stroke-dashoffset', String(circ * (1 - dash))), 60); }
      return c;
    };
    svg.appendChild(mk('rgba(17,17,17,0.08)', 14));
    svg.appendChild(mk('#111111', 14, Math.max(0, Math.min(1, pct / 100))));
    return el('div', { class: 'ring-wrap', 'data-testid': 'dash-ring' }, svg,
      el('div', { class: 'ring-center' }, el('div', {},
        el('div', { class: 'pct' }, pct + '%'),
        el('div', { class: 'cap' }, centerCap))));
  }

  function renderAdmin(view, d) {
    const first = (state.user && state.user.name ? state.user.name.split(' ')[0] : 'there');
    const total = Number(d.total_leads || 0);
    const engaged = Math.max(0, total - Number(d.unverified || 0));
    const pct = total ? Math.round(engaged / total * 100) : 0;
    const t = d.temperature || {};

    const hero = el('div', { class: 'dash-hero', 'data-testid': 'dash-hero' },
      el('div', { class: 'hero-greet' }, 'Hello, ', el('b', {}, first + '!')),
      el('div', { class: 'hero-sub' }, 'Here is where your pipeline stands today. ' + fmt(d.new_today || 0) + ' new leads captured, ' + fmt(engaged) + ' engaged.'),
      ring(pct, fmt(engaged) + ' of ' + fmt(total)),
      el('div', { class: 'breakdown' },
        el('div', { class: 'bd', style: '--dot:var(--hot)' }, el('div', { class: 'lbl' }, 'Hot'), el('div', { class: 'num' }, fmt(t.hot || 0))),
        el('div', { class: 'bd', style: '--dot:var(--warm)' }, el('div', { class: 'lbl' }, 'Warm'), el('div', { class: 'num' }, fmt(t.warm || 0))),
        el('div', { class: 'bd', style: '--dot:var(--cold)' }, el('div', { class: 'lbl' }, 'Cold'), el('div', { class: 'num' }, fmt(t.cold || 0)))),
      el('div', { class: 'hero-foot' },
        el('div', { class: 'lbl' }, 'Total Leads'),
        el('div', { class: 'hero-num', 'data-testid': 'hero-total-leads' }, fmt(total), el('span', { class: 'unit' }, 'leads'))));

    const kpiRow = el('div', { class: 'kpi-row', 'data-testid': 'dash-kpis' },
      kpi('New Today', fmt(d.new_today || 0), { sub: 'freshly captured' }),
      kpi('Hot Leads', fmt(d.hot_leads || 0), { delta: total ? Math.round((d.hot_leads || 0) / total * 100) + '%' : '0%', deltaClass: 'delta--lime', sub: 'ready to convert' }),
      kpi('Open Tasks', fmt(d.open_tasks || 0), { delta: (d.overdue_tasks || 0) + ' overdue', deltaClass: (d.overdue_tasks ? 'delta--down' : ''), sub: 'across the team' }),
      kpi('Automation Fails', fmt(d.automation_failures || 0), { deltaClass: 'delta--down', sub: (d.automation_failures ? 'needs attention' : 'all healthy') }));

    const funnelEntries = Object.entries(d.funnel || {}).map(([k, v]) => ({ label: k, short: stageName(k).split(' ')[0], value: v }));
    const funnelCard = el('div', { class: 'chart-card', 'data-testid': 'dash-funnel' },
      el('div', { class: 'chart-card__head' }, el('h3', {}, 'Pipeline Funnel'), el('span', { class: 'mut' }, fmt(funnelEntries.reduce((a, b) => a + b.value, 0)) + ' leads in motion')),
      funnelEntries.length ? funnelBars(funnelEntries) : el('div', { class: 'empty', style: 'padding:40px' }, 'No pipeline data yet'));

    const srcEntries = Object.entries(d.by_source || {}).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value).slice(0, 6);
    const srcCard = el('div', { class: 'chart-card', 'data-testid': 'dash-sources' },
      el('div', { class: 'chart-card__head' }, el('h3', {}, 'Leads by Source')),
      srcEntries.length ? miniBars(srcEntries) : el('div', { class: 'empty', style: 'padding:20px' }, 'No source data'));

    const recent = el('div', { class: 'table-wrap' },
      el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Recent Leads'), el('th', {}, 'Stage'), el('th', {}, 'Temp'), el('th', {}, 'Score'), el('th', {}, 'Captured'))),
        el('tbody', {}, ...(d.recent_leads || []).slice(0, 6).map(l =>
          el('tr', { 'data-testid': 'recent-lead-' + l.id, onclick: () => location.hash = '#/leads/' + l.id },
            el('td', {}, el('div', { class: 'name-cell' }, el('div', { class: 'avatar' }, CRM.initials(l.name)), l.name)),
            el('td', {}, el('span', { class: 'stage-pill' }, stageName(l.status))),
            el('td', {}, tempBadge(l.temperature)),
            el('td', { class: 'mono' }, String(l.score)),
            el('td', { style: 'color:var(--text-3)' }, timeAgo(l.created_at)))))));

    const right = el('div', { class: 'dash-right' }, kpiRow, funnelCard,
      el('div', { style: 'display:grid;grid-template-columns:1fr 1.4fr;gap:20px' }, srcCard, recent));

    view.appendChild(el('div', { class: 'dash-grid' }, hero, right));
    if (CRM.can && CRM.can('integrations.manage')) integrationsStrip(view);
  }

  // =========================================================================
  // SALES — personal / team cockpit
  // =========================================================================
  function railmap(jm) {
    const stations = jm.stations || [];
    const track = el('div', { class: 'rm-track', 'data-testid': 'railmap-track' });
    stations.forEach((s, i) => {
      const active = s.count > 0;
      const litNext = active && stations[i + 1];
      track.appendChild(el('div', { class: 'rm-station', 'data-testid': 'railmap-station-' + s.key, title: s.name + ': ' + s.count },
        el('span', { class: 'line' + (litNext ? ' lit' : '') }),
        el('div', { class: 'rm-node' + (active ? ' active' : '') }, el('span', { class: 'pip' })),
        el('div', { class: 'rm-count' + (active ? '' : ' zero') }, fmt(s.count)),
        el('div', { class: 'rm-block' + (s.key === 'won' ? ' won' : '') }, s.name)));
    });
    return el('div', { class: 'railmap', 'data-testid': 'dash-railmap' },
      el('div', { class: 'rm-head' },
        el('h3', {}, el('span', { class: 'dot' }), 'Lead Flow Journey'),
        el('span', { class: 'mut' }, 'LIVE PIPELINE SIGNAL')),
      track,
      el('div', { class: 'rm-foot' },
        el('div', { class: 'rm-siding' }, el('span', { class: 'sq' }), 'Lost / Dropped', el('span', { class: 'b' }, fmt(jm.lost || 0)))));
  }

  function prospectRow(p) {
    const hot = p.score >= 70;
    const summary = el('div', { class: 'summary' + (p.summary ? '' : ' pending'), 'data-testid': 'prospect-summary-' + p.id },
      p.summary
        ? [el('span', { class: 'ai' }, el('i', { class: 'fa-solid fa-wand-magic-sparkles' }), 'AI'), p.summary]
        : [el('span', { class: 'spin' }), 'Generating conversation summary…']);
    const row = el('div', { class: 'prospect', 'data-testid': 'prospect-' + p.id, onclick: () => location.hash = '#/leads/' + p.id },
      el('div', { class: 'avatar' }, CRM.initials(p.name)),
      el('div', { class: 'pmid' },
        el('div', { class: 'pname' }, p.name, tempBadge(p.temperature)),
        el('div', { class: 'pmeta' },
          el('span', {}, stageName(p.status)),
          p.property_type ? el('span', {}, '· ' + p.property_type) : null,
          el('span', {}, '· ' + (p.last_contacted_at ? 'contacted ' + timeAgo(p.last_contacted_at) : 'not contacted'))),
        summary),
      el('div', { class: 'pright' },
        el('div', { class: 'score-pill' + (hot ? ' hot' : '') }, String(p.score)),
        el('span', { class: 'link-more' }, 'Open →')));
    row._summaryEl = summary;
    return row;
  }

  function trendChart(series) {
    const W = 320, H = 150, pad = 6;
    const max = Math.max(1, ...series.map(s => s.count));
    const step = (W - pad * 2) / Math.max(1, series.length - 1);
    const pts = series.map((s, i) => [pad + i * step, H - pad - (s.count / max) * (H - pad * 2 - 14) - 8]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (H - pad) + ' L' + pts[0][0].toFixed(1) + ' ' + (H - pad) + ' Z';
    const NS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('class', 'trend-svg'); svg.setAttribute('preserveAspectRatio', 'none');
    const grad = document.createElementNS(NS, 'linearGradient'); grad.setAttribute('id', 'tg'); grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0'); grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    grad.innerHTML = '<stop offset="0%" stop-color="#DFFF00" stop-opacity="0.35"/><stop offset="100%" stop-color="#DFFF00" stop-opacity="0"/>';
    const defs = document.createElementNS(NS, 'defs'); defs.appendChild(grad); svg.appendChild(defs);
    const ap = document.createElementNS(NS, 'path'); ap.setAttribute('d', area); ap.setAttribute('fill', 'url(#tg)'); svg.appendChild(ap);
    const lp = document.createElementNS(NS, 'path'); lp.setAttribute('d', line); lp.setAttribute('fill', 'none'); lp.setAttribute('stroke', '#111'); lp.setAttribute('stroke-width', '2.5'); lp.setAttribute('stroke-linecap', 'round'); lp.setAttribute('stroke-linejoin', 'round');
    lp.style.strokeDasharray = '1000'; lp.style.strokeDashoffset = '1000'; lp.style.transition = 'stroke-dashoffset 1.1s ease'; setTimeout(() => lp.style.strokeDashoffset = '0', 60);
    svg.appendChild(lp);
    const last = pts[pts.length - 1];
    const dot = document.createElementNS(NS, 'circle'); dot.setAttribute('cx', last[0]); dot.setAttribute('cy', last[1]); dot.setAttribute('r', '4'); dot.setAttribute('fill', '#111'); dot.setAttribute('stroke', '#DFFF00'); dot.setAttribute('stroke-width', '2'); svg.appendChild(dot);
    return el('div', { class: 'trend-wrap', 'data-testid': 'dash-trend' }, svg,
      el('div', { class: 'trend-legend' }, el('span', {}, series.length + ' days ago'), el('span', {}, 'today')));
  }

  function calendarCard(agenda) {
    const byDate = {};
    (agenda || []).forEach(a => { (byDate[a.date] = byDate[a.date] || []).push(a); });
    let selected = ymd(new Date());
    const agendaBox = el('div', { class: 'agenda', 'data-testid': 'dash-agenda' });
    const strip = el('div', { class: 'calstrip' });

    function renderAgenda() {
      agendaBox.innerHTML = '';
      const items = (byDate[selected] || []).slice().sort((a, b) => new Date(a.at) - new Date(b.at));
      if (!items.length) { agendaBox.appendChild(el('div', { class: 'empty', style: 'padding:20px' }, el('i', { class: 'fa-regular fa-calendar-check' }), el('div', {}, 'Nothing scheduled'))); return; }
      items.forEach(it => {
        agendaBox.appendChild(el('div', { class: 'agenda-item ' + (it.overdue ? 'overdue' : it.kind), 'data-testid': 'agenda-' + it.kind + '-' + it.id, onclick: () => { if (it.lead_id) location.hash = '#/leads/' + it.lead_id; } },
          el('div', { class: 'ai-ic' }, el('i', { class: 'fa-solid ' + (it.kind === 'visit' ? 'fa-location-dot' : 'fa-list-check') })),
          el('div', { style: 'min-width:0' },
            el('div', { class: 'at' }, it.title),
            el('div', { class: 'am' }, (it.lead_name ? it.lead_name + ' · ' : '') + (it.overdue ? 'Overdue' : (it.priority || it.status || '')))),
          el('div', { class: 'atime' }, hhmm(it.at))));
      });
    }
    function renderStrip() {
      strip.innerHTML = '';
      for (let i = 0; i < 7; i++) {
        const d = new Date(); d.setDate(d.getDate() + i);
        const key = ymd(d); const list = byDate[key] || [];
        const dots = el('div', { class: 'cdot' });
        if (list.some(x => x.kind === 'task')) dots.appendChild(el('i', { class: 't' }));
        if (list.some(x => x.kind === 'visit')) dots.appendChild(el('i', { class: 'v' }));
        strip.appendChild(el('div', { class: 'calday' + (key === selected ? ' sel' : ''), 'data-testid': 'calday-' + key, onclick: () => { selected = key; renderStrip(); renderAgenda(); } },
          el('div', { class: 'cw' }, ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()]),
          el('div', { class: 'cd' }, String(d.getDate())), dots));
      }
    }
    renderStrip(); renderAgenda();
    return el('div', { class: 'chart-card', 'data-testid': 'dash-calendar' },
      el('div', { class: 'chart-card__head' }, el('h3', {}, 'Calendar'), el('span', { class: 'mut' }, 'This week')),
      strip, agendaBox);
  }

  function activityCard(items) {
    const feed = el('div', { class: 'actfeed', 'data-testid': 'dash-activity' });
    const icon = { email: 'fa-envelope', whatsapp: 'fa-whatsapp', call: 'fa-phone', note: 'fa-note-sticky' };
    if (!items.length) feed.appendChild(el('div', { class: 'empty', style: 'padding:20px' }, 'No recent activity'));
    items.forEach(a => {
      const type = (a.type || 'note').toLowerCase();
      feed.appendChild(el('div', { class: 'actrow ' + type },
        el('div', { class: 'adot' }, el('i', { class: (type === 'whatsapp' ? 'fa-brands ' : 'fa-solid ') + (icon[type] || 'fa-circle') })),
        el('div', { class: 'atitle' }, a.title || stageName(type)),
        a.body ? el('div', { class: 'abody' }, String(a.body).slice(0, 90)) : null,
        el('div', { class: 'ameta' }, (a.user ? a.user + ' · ' : '') + timeAgo(a.at))));
    });
    return el('div', { class: 'chart-card', 'data-testid': 'dash-activity-card' },
      el('div', { class: 'chart-card__head' }, el('h3', {}, 'Recent Activity')), feed);
  }

  function renderSales(view, d) {
    const first = (state.user && state.user.name ? state.user.name.split(' ')[0] : 'there');
    const total = Number(d.total_leads || 0);
    const scopeTxt = d.scope === 'team' ? "your team's" : 'your';

    view.appendChild(el('div', { class: 'dash-head', 'data-testid': 'dash-header' },
      el('div', {},
        el('div', { class: 'greet' }, 'Hello, ', el('b', {}, first), ' 👋'),
        el('div', { class: 'sub' }, 'Showing ' + scopeTxt + ' book · ' + fmt(d.new_today || 0) + ' new today · ' + fmt(d.hot_leads || 0) + ' hot · ' + fmt(d.open_tasks || 0) + ' open tasks')),
      el('div', { class: 'today' }, 'Today', el('span', { class: 'd' }, new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })))));

    const kpiRow = el('div', { class: 'kpi-row span-12', 'data-testid': 'dash-kpis' },
      kpi('New This Week', fmt(d.new_week || 0), { icon: 'fa-bolt', delta: fmt(d.new_today || 0) + ' today', deltaClass: 'delta--lime', sub: 'captured' }),
      kpi('Hot Leads', fmt(d.hot_leads || 0), { icon: 'fa-fire', delta: total ? Math.round((d.hot_leads || 0) / total * 100) + '%' : '0%', sub: 'ready to convert' }),
      kpi('Open Tasks', fmt(d.open_tasks || 0), { icon: 'fa-list-check', delta: (d.overdue_tasks || 0) + ' overdue', deltaClass: d.overdue_tasks ? 'delta--down' : '', sub: 'to action' }),
      kpi('Conversions', fmt(d.conversions || 0), { icon: 'fa-trophy', delta: (d.conversion_rate || 0) + '%', deltaClass: 'delta--up', sub: 'won deals' }));

    const funnelEntries = Object.entries(d.funnel || {}).map(([k, v]) => ({ label: k, short: stageName(k).split(' ')[0], value: v })).sort((a, b) => b.value - a.value).slice(0, 7);
    const funnelCard = el('div', { class: 'chart-card span-4', 'data-testid': 'dash-funnel' },
      el('div', { class: 'chart-card__head' }, el('h3', {}, 'Pipeline Funnel'), el('span', { class: 'mut' }, fmt(funnelEntries.reduce((a, b) => a + b.value, 0)) + ' leads')),
      funnelEntries.length ? funnelBars(funnelEntries) : el('div', { class: 'empty', style: 'padding:30px' }, 'No pipeline data'));

    const trendCard = el('div', { class: 'chart-card span-4', 'data-testid': 'dash-trend-card' },
      el('div', { class: 'chart-card__head' }, el('h3', {}, 'Leads Over Time'), el('span', { class: 'mut' }, 'last 14 days')),
      trendChart(d.leads_over_time || []));

    const srcEntries = Object.entries(d.by_source || {}).map(([k, v]) => ({ label: k, value: v })).sort((a, b) => b.value - a.value).slice(0, 6);
    const srcCard = el('div', { class: 'chart-card span-4', 'data-testid': 'dash-sources' },
      el('div', { class: 'chart-card__head' }, el('h3', {}, 'Leads by Source')),
      srcEntries.length ? miniBars(srcEntries) : el('div', { class: 'empty', style: 'padding:20px' }, 'No source data'));

    const prospectsWrap = el('div', { class: 'prospects' });
    const rows = (d.top_prospects || []).map(prospectRow);
    if (!rows.length) prospectsWrap.appendChild(el('div', { class: 'empty', style: 'padding:40px' }, el('i', { class: 'fa-regular fa-star' }), el('div', {}, 'No active prospects yet')));
    rows.forEach(r => prospectsWrap.appendChild(r));
    const prospectsCard = el('div', { class: 'chart-card span-8', 'data-testid': 'dash-prospects' },
      el('div', { class: 'chart-card__head' }, el('h3', {}, 'Top Prospects'), el('span', { class: 'mut' }, 'Best leads · AI conversation summaries')),
      prospectsWrap);

    view.appendChild(el('div', { class: 'dash2' },
      kpiRow,
      el('div', { class: 'span-12' }, railmap(d.journey_map || { stations: [], lost: 0 })),
      prospectsCard,
      el('div', { class: 'span-4', style: 'display:flex;flex-direction:column;gap:20px' },
        calendarCard(d.agenda), activityCard(d.recent_activity || [])),
      funnelCard, trendCard, srcCard));

    // AI summaries (lazy) for prospects lacking one
    if ((d.top_prospects || []).some(p => !p.summary)) {
      api.get('/dashboard/summaries').then(res => {
        const map = (res && res.summaries) || {};
        (d.top_prospects || []).forEach((p, i) => {
          const row = rows[i]; if (!row || !row._summaryEl) return;
          const text = map[p.id];
          row._summaryEl.innerHTML = '';
          if (text) {
            row._summaryEl.className = 'summary';
            row._summaryEl.appendChild(el('span', { class: 'ai' }, el('i', { class: 'fa-solid fa-wand-magic-sparkles' }), 'AI'));
            row._summaryEl.appendChild(document.createTextNode(text));
          } else {
            row._summaryEl.className = 'summary pending';
            row._summaryEl.appendChild(document.createTextNode('Not enough conversation to summarize yet.'));
          }
        });
      }).catch(() => {
        rows.forEach(row => { if (row._summaryEl && row._summaryEl.classList.contains('pending')) { row._summaryEl.innerHTML = ''; row._summaryEl.appendChild(document.createTextNode('Summary unavailable.')); } });
      });
    }
  }

  // =========================================================================
  // FUNCTIONAL — accounts / legal / crm (KPIs + table)
  // =========================================================================
  function renderFunctional(view, d) {
    const first = (state.user && state.user.name ? state.user.name.split(' ')[0] : 'there');
    view.appendChild(el('div', { class: 'dash-head', 'data-testid': 'dash-header' },
      el('div', {},
        el('div', { class: 'greet' }, d.heading || 'Dashboard'),
        el('div', { class: 'sub' }, d.sub || ('Welcome back, ' + first))),
      el('div', { class: 'today' }, 'Today', el('span', { class: 'd' }, new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })))));

    const toneMap = { up: 'delta--up', down: 'delta--down', lime: 'delta--lime' };
    const kpiRow = el('div', { class: 'kpi-row', 'data-testid': 'dash-kpis' },
      ...(d.kpis || []).map(k => kpi(k.label, k.value, { sub: k.sub, delta: k.tone ? (k.tone === 'up' ? '▲' : k.tone === 'down' ? '▼' : '') : null, deltaClass: toneMap[k.tone] || '' })));

    const panels = (d.panels || []).map(p => {
      if (p.type !== 'table') return null;
      const body = (p.rows || []).length
        ? el('tbody', {}, ...p.rows.map(r =>
          el('tr', r.lead_id ? { 'data-testid': 'frow-' + r.lead_id, onclick: () => location.hash = '#/leads/' + r.lead_id, style: 'cursor:pointer' } : {},
            ...r.cells.map((c, i) => el('td', i === 0 ? { style: 'font-weight:600' } : {}, c)))))
        : el('tbody', {}, el('tr', {}, el('td', { colspan: (p.columns || []).length, style: 'text-align:center;color:var(--text-3);padding:40px' }, 'Nothing here yet')));
      return el('div', { class: 'chart-card', 'data-testid': p.testid, style: 'padding:0;overflow:hidden' },
        el('div', { class: 'chart-card__head', style: 'padding:24px 24px 0' }, el('h3', {}, p.title)),
        el('div', { class: 'table-wrap', style: 'border:0;border-radius:0;margin-top:14px' },
          el('table', {}, el('thead', {}, el('tr', {}, ...(p.columns || []).map(c => el('th', {}, c)))), body)));
    }).filter(Boolean);

    view.appendChild(el('div', { style: 'display:flex;flex-direction:column;gap:20px' }, kpiRow, ...panels));
  }

  // ---------- integrations strip (admins) ----------
  async function integrationsStrip(view) {
    try {
      const ints = (await api.get('/integrations')).data || [];
      if (!ints.length) return;
      const badge = (it) => {
        const on = it.enabled && it.configured;
        const label = on ? 'Connected' : (it.configured ? 'Configured' : 'Not configured');
        const color = on ? 'var(--won,#2F9E44)' : (it.configured ? '#B45309' : 'var(--text-3,#94A3B8)');
        const dot = on ? '#2F9E44' : (it.configured ? '#F59E0B' : '#CBD5E1');
        return el('div', { class: 'chip', 'data-testid': 'int-status-' + it.key, style: 'display:flex;align-items:center;gap:8px;padding:10px 14px;border:1px solid var(--border);border-radius:12px;background:var(--surface);cursor:pointer', onclick: () => location.hash = '#/integrations' },
          el('span', { style: 'width:9px;height:9px;border-radius:50%;flex:none;background:' + dot }),
          el('div', {}, el('div', { style: 'font-size:13px;font-weight:600;color:var(--text)' }, it.name), el('div', { style: 'font-size:11px;font-weight:600;color:' + color }, label)));
      };
      view.appendChild(el('div', { class: 'chart-card', 'data-testid': 'dash-integrations', style: 'margin-top:20px' },
        el('div', { class: 'chart-card__head' }, el('h3', {}, 'Integrations'), el('span', { class: 'mut' }, 'Live connection status')),
        el('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;margin-top:6px' }, ...ints.map(badge))));
    } catch (e) { /* non-admins skip */ }
  }

  // ---------- skeleton ----------
  function skeleton() {
    const b = (h, span) => el('div', { class: 'skeleton ' + (span || 'span-12'), style: 'height:' + h + 'px;border-radius:22px' });
    return el('div', { class: 'dash2' }, b(96), b(160), b(360, 'span-8'), b(360, 'span-4'), b(260, 'span-4'), b(260, 'span-4'), b(260, 'span-4'));
  }

  // ---------- entry ----------
  CRM.pages.dashboard = async function (view) {
    view.innerHTML = '';
    view.appendChild(skeleton());
    const d = await api.get('/dashboard');
    view.innerHTML = '';
    if (d.view === 'sales') return renderSales(view, d);
    if (d.view === 'functional') return renderFunctional(view, d);
    return renderAdmin(view, d);
  };
  // Expose the shared visual helpers so other modules (sales cockpit) reuse the exact look.
  CRM.dashHelpers = { kpi, funnelBars, miniBars, ring, fmt, ymd, hhmm };

})();
