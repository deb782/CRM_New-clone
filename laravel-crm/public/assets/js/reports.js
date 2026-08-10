// ---- Reports & Analytics ----
(function () {
  const { el, api, toast, money, can } = window.CRM;

  function kpi(label, value, accent) {
    return el('div', { class: 'rep-kpi' + (accent ? ' rep-kpi--accent' : '') },
      el('div', { class: 'rep-kpi__v' }, value),
      el('div', { class: 'rep-kpi__l' }, label));
  }

  function bars(title, entries, fmt) {
    const max = Math.max(1, ...entries.map(e => e.value));
    return el('div', { class: 'card rep-card' },
      el('h3', { class: 'rep-h' }, title),
      el('div', { class: 'rep-bars' }, entries.map(e =>
        el('div', { class: 'rep-bar' },
          el('div', { class: 'rep-bar__lbl' }, e.label),
          el('div', { class: 'rep-bar__track' }, el('div', { class: 'rep-bar__fill', style: 'width:' + Math.round(e.value / max * 100) + '%' })),
          el('div', { class: 'rep-bar__val' }, fmt ? fmt(e.value) : e.value)))));
  }

  function table(title, headers, rows) {
    return el('div', { class: 'card rep-card' },
      el('h3', { class: 'rep-h' }, title),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'table' },
          el('thead', {}, el('tr', {}, headers.map(h => el('th', {}, h)))),
          el('tbody', {}, rows.map(r => el('tr', {}, r.map(c => el('td', {}, c))))))));
  }

  async function csv(section) {
    try {
      const res = await fetch(CRM.API + '/reports/' + section + '?format=csv', { headers: { Authorization: 'Bearer ' + CRM.token() } });
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = el('a', { href: url, download: 'agrocorp-' + section + '.csv' });
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    } catch (e) { toast('Export failed', 'error'); }
  }

  function order(obj) {
    return Object.entries(obj || {}).map(([label, value]) => ({ label: String(label).replace(/_/g, ' '), value: Number(value) }))
      .sort((a, b) => b.value - a.value);
  }

  async function renderSales(body) {
    const d = await api.get('/reports/sales');
    body.appendChild(el('div', { class: 'rep-kpis' },
      kpi('Total leads', Number(d.total_leads).toLocaleString('en-IN')),
      kpi('Deals won', Number(d.won).toLocaleString('en-IN')),
      kpi('Conversion', d.conversion_rate + '%', true)));
    body.appendChild(el('div', { class: 'rep-grid' },
      bars('Pipeline by stage', order(d.funnel)),
      bars('Leads by source', (d.by_source || []).map(s => ({ label: s.source || 'Unknown', value: Number(s.c) })))));
    body.appendChild(bars('Leads by temperature', order(d.by_temperature)));
    body.appendChild(table('Rep performance', ['Rep', 'Leads', 'Won', 'Conversion %'],
      (d.by_rep || []).map(r => [r.name, r.leads, r.won, r.rate + '%'])));
  }

  async function renderFinancial(body) {
    const d = await api.get('/reports/financial');
    body.appendChild(el('div', { class: 'rep-kpis' },
      kpi('Collected', money(d.collected), true),
      kpi('Total deal value', money(d.deal_value)),
      kpi('Token collected', money(d.token_collected)),
      kpi('Outstanding', money(d.outstanding))));
    body.appendChild(el('div', { class: 'rep-grid' },
      bars('Payments by type', (d.payments_by_type || []).map(p => ({ label: p.type || '—', value: Number(p.total) })), money),
      bars('Bookings by status', (d.bookings_by_status || []).map(b => ({ label: b.status || '—', value: Number(b.value) })), money)));
    body.appendChild(table('Payments by status', ['Status', 'Count', 'Total'],
      (d.payments_by_status || []).map(p => [p.status, p.c, money(p.total)])));
  }

  async function renderActivity(body) {
    const d = await api.get('/reports/activity');
    body.appendChild(el('div', { class: 'rep-kpis' },
      kpi('Open tasks', Number(d.tasks_open).toLocaleString('en-IN')),
      kpi('Overdue tasks', Number(d.tasks_overdue).toLocaleString('en-IN'), true)));
    body.appendChild(bars('Site visits by status', order(d.site_visits)));
    body.appendChild(table('Contact coverage by rep', ['Rep', 'Leads', 'Contacted', 'Pending'],
      (d.by_rep || []).map(r => [r.name, r.leads, r.contacted, r.pending])));
  }

  CRM.pages.reports = async function (view) {
    const tabs = [];
    if (can('reports.sales')) tabs.push({ key: 'sales', label: 'Sales Performance', fn: renderSales });
    if (can('reports.financial')) tabs.push({ key: 'financial', label: 'Financial', fn: renderFinancial });
    if (can('reports.activity')) tabs.push({ key: 'activity', label: 'Activity & SLA', fn: renderActivity });

    if (!tabs.length) { view.innerHTML = ''; view.appendChild(el('div', { class: 'empty' }, 'No reports available for your role')); return; }

    let active = tabs[0].key;
    const tabRow = el('div', { class: 'rep-tabs', 'data-testid': 'reports-tabs' });
    const body = el('div', { class: 'rep-body', id: 'rep-body' });

    async function load() {
      CRM.setActions(el('div', { style: 'display:flex;gap:8px' },
        el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'report-export-csv', onclick: () => csv(active) },
          el('i', { class: 'fa-solid fa-file-csv' }), 'Export Excel'),
        el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'report-export-pdf', onclick: () => window.print() },
          el('i', { class: 'fa-solid fa-print' }), 'Print / PDF')));
      tabRow.querySelectorAll('.rep-tab').forEach(t => t.classList.toggle('rep-tab--active', t.dataset.key === active));
      body.innerHTML = '';
      body.appendChild(el('div', { class: 'spinner' }));
      const tab = tabs.find(t => t.key === active);
      try { body.innerHTML = ''; await tab.fn(body); }
      catch (e) { body.innerHTML = ''; body.appendChild(el('div', { class: 'empty' }, e.message || 'Failed to load report')); }
    }

    tabs.forEach(t => tabRow.appendChild(el('button', {
      class: 'rep-tab', 'data-key': t.key, 'data-testid': 'report-tab-' + t.key,
      onclick: () => { active = t.key; load(); }
    }, t.label)));

    view.innerHTML = '';
    view.appendChild(el('div', { class: 'rep-wrap' }, tabRow, body));
    load();
  };
})();
