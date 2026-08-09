// ---- Executive Dashboard (reimagined hero composition) ----
(function () {
  const { el, api, timeAgo, tempBadge, stageName, state } = CRM;

  function fmt(n) { n = Number(n || 0); return n.toLocaleString('en-IN'); }
  function compact(n) {
    n = Number(n || 0);
    if (n >= 1e7) return { v: (n / 1e7).toFixed(1).replace(/\.0$/, ''), u: 'Cr' };
    if (n >= 1e5) return { v: (n / 1e5).toFixed(1).replace(/\.0$/, ''), u: 'L' };
    if (n >= 1e3) return { v: (n / 1e3).toFixed(1).replace(/\.0$/, ''), u: 'k' };
    return { v: String(n), u: '' };
  }

  // Big KPI cell with tiny delta pill
  function kpi(label, value, opts = {}) {
    const c = typeof value === 'object' ? value : { v: fmt(value), u: '' };
    return el('div', { class: 'kpi', 'data-testid': 'kpi-' + label.toLowerCase().replace(/\s+/g, '-') },
      el('div', { class: 'kpi__label' }, el('span', {}, label),
        opts.delta ? el('span', { class: 'delta ' + (opts.deltaClass || '') }, opts.delta) : null),
      el('div', { class: 'kpi__val' }, c.v, c.u ? el('span', { class: 'unit' }, c.u) : null),
      opts.sub ? el('div', { class: 'kpi__sub' }, opts.sub) : null);
  }

  // Animated SVG progress ring
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

  // Understated bar chart with a single lime-highlighted column (the reference "654")
  function barChart(entries, opts = {}) {
    const max = Math.max(1, ...entries.map(e => e.value));
    const hotKey = entries.reduce((a, b) => (b.value > (a ? a.value : -1) ? b : a), null);
    const bars = el('div', { class: 'bars', 'data-testid': 'dash-barchart' });
    entries.forEach(e => {
      const isHot = opts.highlightMax && hotKey && e.label === hotKey.label && e.value > 0;
      const h = Math.round((e.value / max) * 160) + 4;
      const bar = el('div', { class: 'bar', style: 'height:2px' },
        isHot ? el('span', { class: 'btag' }, fmt(e.value)) : null);
      setTimeout(() => { bar.style.height = h + 'px'; }, 40);
      bars.appendChild(el('div', { class: 'barcol' + (isHot ? ' hot' : ''), 'data-testid': 'bar-' + e.label },
        el('div', { class: 'bv' }, fmt(e.value)),
        bar,
        el('div', { class: 'bx' }, e.short || e.label)));
    });
    return bars;
  }

  function miniBars(entries, fillVar) {
    const total = entries.reduce((a, b) => a + b.value, 0) || 1;
    return el('div', { class: 'mini-bars' }, ...entries.map(e =>
      el('div', { class: 'mb' },
        el('div', { class: 'mb__top' }, el('span', {}, e.label), el('b', { class: 'mono' }, fmt(e.value))),
        el('div', { class: 'mb__track' }, (() => { const f = el('div', { class: 'mb__fill', style: 'width:0' }); setTimeout(() => f.style.width = Math.round(e.value / total * 100) + '%', 40); return f; })()))));
  }

  function skeleton() {
    const box = (cls, h) => el('div', { class: 'skeleton', style: 'height:' + h + (cls || '') });
    return el('div', { class: 'dash-grid' },
      el('div', { class: 'skeleton', style: 'grid-column:span 4;height:520px;border-radius:24px' }),
      el('div', { class: 'dash-right' },
        el('div', { class: 'skeleton', style: 'height:150px;border-radius:20px' }),
        el('div', { class: 'skeleton', style: 'height:300px;border-radius:24px' })));
  }

  CRM.pages.dashboard = async function (view) {
    view.innerHTML = '';
    view.appendChild(skeleton());
    const d = await api.get('/dashboard');
    view.innerHTML = '';

    const first = (state.user && state.user.name ? state.user.name.split(' ')[0] : 'there');
    const total = Number(d.total_leads || 0);
    const engaged = Math.max(0, total - Number(d.unverified || 0));
    const pct = total ? Math.round(engaged / total * 100) : 0;
    const t = d.temperature || {};

    // ----- Left hero panel -----
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

    // ----- Right column -----
    const kpiRow = el('div', { class: 'kpi-row', 'data-testid': 'dash-kpis' },
      kpi('New Today', d.new_today, { delta: 'today', sub: 'freshly captured' }),
      kpi('Hot Leads', d.hot_leads, { delta: total ? Math.round((d.hot_leads || 0) / total * 100) + '%' : '0%', deltaClass: 'delta--lime', sub: 'ready to convert' }),
      kpi('Open Tasks', d.open_tasks, { delta: (d.overdue_tasks || 0) + ' overdue', deltaClass: (d.overdue_tasks ? 'delta--down' : ''), sub: 'across the team' }),
      kpi('Automation Fails', d.automation_failures, { deltaClass: 'delta--down', sub: (d.automation_failures ? 'needs attention' : 'all healthy') }));

    // Pipeline funnel bar chart
    const funnelEntries = Object.entries(d.funnel || {}).map(([k, v]) => ({ label: k, short: stageName(k).split(' ')[0], value: v }));
    const funnelCard = el('div', { class: 'chart-card', 'data-testid': 'dash-funnel' },
      el('div', { class: 'chart-card__head' }, el('h3', {}, 'Pipeline Funnel'), el('span', { class: 'mut' }, fmt(funnelEntries.reduce((a, b) => a + b.value, 0)) + ' leads in motion')),
      funnelEntries.length ? barChart(funnelEntries, { highlightMax: true }) : el('div', { class: 'empty', style: 'padding:40px' }, 'No pipeline data yet'));

    // Sources + recent (2-up)
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

    const right = el('div', { class: 'dash-right' },
      kpiRow, funnelCard,
      el('div', { style: 'display:grid;grid-template-columns:1fr 1.4fr;gap:20px' }, srcCard, recent));

    view.appendChild(el('div', { class: 'dash-grid' }, hero, right));
  };
})();
