// ---- Dashboard page ----
(function () {
  const { el, api, timeAgo, tempBadge, stageName } = CRM;

  function stat(k, v, icon, d) {
    return el('div', { class: 'card stat', 'data-testid': 'stat-' + k.toLowerCase().replace(/\s+/g, '-') },
      el('div', { class: 'k' }, el('i', { class: 'fa-solid ' + icon }), k),
      el('div', { class: 'v mono' }, String(v)),
      d ? el('div', { class: 'd' }, d) : null);
  }

  function bar(label, value, total, color) {
    const pct = total ? Math.round((value / total) * 100) : 0;
    return el('div', { style: 'margin-bottom:12px' },
      el('div', { style: 'display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px' },
        el('span', {}, label), el('b', { class: 'mono' }, String(value))),
      el('div', { class: 'track', style: 'height:8px;background:var(--border);border-radius:5px;overflow:hidden' },
        el('div', { style: `height:100%;width:${pct}%;background:${color};transition:width .5s` })));
  }

  CRM.pages.dashboard = async function (view) {
    const d = await api.get('/dashboard');
    view.innerHTML = '';

    view.appendChild(el('div', { class: 'cards' },
      stat('Total Leads', d.total_leads, 'fa-users'),
      stat('New Today', d.new_today, 'fa-star', 'captured today'),
      stat('Hot Leads', d.hot_leads, 'fa-fire'),
      stat('Unverified', d.unverified, 'fa-user-clock', 'need verification'),
      stat('Open Tasks', d.open_tasks, 'fa-list-check', d.overdue_tasks + ' overdue'),
      stat('Automation Fails', d.automation_failures, 'fa-triangle-exclamation')));

    const totalTemp = Object.values(d.temperature || {}).reduce((a, b) => a + b, 0);
    const tempColors = { hot: 'var(--hot)', warm: 'var(--warm)', cold: 'var(--cold)' };
    const tempCard = el('div', { class: 'card' }, el('div', { class: 'section-title', style: 'margin-top:0' }, el('i', { class: 'fa-solid fa-temperature-half' }), 'Temperature Breakdown'));
    ['hot', 'warm', 'cold'].forEach(t => tempCard.appendChild(bar(t.charAt(0).toUpperCase() + t.slice(1), d.temperature[t] || 0, totalTemp, tempColors[t])));

    const totalFunnel = Object.values(d.funnel || {}).reduce((a, b) => a + b, 0);
    const funnelCard = el('div', { class: 'card' }, el('div', { class: 'section-title', style: 'margin-top:0' }, el('i', { class: 'fa-solid fa-filter' }), 'Pipeline Funnel'));
    Object.entries(d.funnel || {}).forEach(([k, v]) => funnelCard.appendChild(bar(stageName(k), v, totalFunnel, 'var(--accent)')));

    const srcCard = el('div', { class: 'card' }, el('div', { class: 'section-title', style: 'margin-top:0' }, el('i', { class: 'fa-solid fa-signal' }), 'Leads by Source'));
    const totalSrc = Object.values(d.by_source || {}).reduce((a, b) => a + b, 0);
    Object.entries(d.by_source || {}).forEach(([k, v]) => srcCard.appendChild(bar(k, v, totalSrc, 'var(--won)')));

    view.appendChild(el('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr 1fr;margin-top:16px' }, funnelCard, tempCard, srcCard));

    const recent = el('div', { class: 'table-wrap', style: 'margin-top:24px' },
      el('table', {},
        el('thead', {}, el('tr', {}, el('th', {}, 'Recent Leads'), el('th', {}, 'Stage'), el('th', {}, 'Temp'), el('th', {}, 'Score'), el('th', {}, 'Captured'))),
        el('tbody', {}, ...(d.recent_leads || []).map(l =>
          el('tr', { 'data-testid': 'recent-lead-' + l.id, onclick: () => location.hash = '#/leads/' + l.id },
            el('td', {}, el('div', { class: 'name-cell' }, el('div', { class: 'avatar' }, CRM.initials(l.name)), l.name)),
            el('td', {}, el('span', { class: 'stage-pill' }, stageName(l.status))),
            el('td', {}, tempBadge(l.temperature)),
            el('td', { class: 'mono' }, String(l.score)),
            el('td', { style: 'color:var(--text-3)' }, timeAgo(l.created_at)))))));
    view.appendChild(recent);
  };
})();
