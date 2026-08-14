// ---- Inventory board (Projects->Phases->Plots) + Site Visits ----
(function () {
  const { el, api, toast, modal, money, timeAgo, initials, can, stageName } = CRM;

  const STATUS_META = {
    available: { c: 'var(--won)', l: 'Available' },
    held: { c: 'var(--warm)', l: 'Held' },
    booked: { c: 'var(--accent)', l: 'Booked' },
    sold: { c: 'var(--text-3)', l: 'Sold' },
  };

  function statusDot(s) { const m = STATUS_META[s] || STATUS_META.available; return el('span', { class: 'temp', style: 'color:' + m.c }, el('span', { style: `display:inline-block;width:8px;height:8px;border-radius:50%;background:${m.c};margin-right:6px` }), m.l); }

  // ============ INVENTORY — Spatial Availability Map ============
  CRM.pages.inventory = async function (view) {
    CRM.setActions(can('projects.manage')
      ? el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'add-plot-btn', onclick: () => plotForm() }, el('i', { class: 'fa-solid fa-plus' }), 'Add Unit')
      : null);
    const res = await api.get('/inventory/tree');
    view.innerHTML = '';

    if (!res.projects.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-building' }), el('div', {}, 'No projects yet'))); return; }

    res.projects.forEach(p => {
      const c = p.counts;
      const totalUnits = (c.available || 0) + (c.held || 0) + (c.booked || 0) + (c.sold || 0);
      const soldPct = totalUnits ? Math.round(((c.booked || 0) + (c.sold || 0)) / totalUnits * 100) : 0;

      // Project hero: big available number + a thin absorption bar
      const hero = el('div', { class: 'inv-hero', 'data-testid': 'inv-project-' + p.id },
        el('div', { class: 'inv-hero__left' },
          el('div', { class: 'inv-hero__name' }, p.name),
          el('div', { class: 'inv-hero__loc' }, [p.city, p.zone].filter(Boolean).join(' · ') || 'Location not set'),
          el('div', { class: 'inv-legend' },
            legendChip('available', c.available || 0), legendChip('held', c.held || 0),
            legendChip('booked', c.booked || 0), legendChip('sold', c.sold || 0))),
        el('div', { class: 'inv-hero__metric' },
          el('div', { class: 'inv-hero__num' }, String(c.available || 0), el('span', { class: 'unit' }, '/ ' + totalUnits)),
          el('div', { class: 'inv-hero__lbl' }, 'Units available'),
          el('div', { class: 'inv-absorb' }, el('span', { style: 'width:' + soldPct + '%' })),
          el('div', { class: 'inv-hero__lbl', style: 'margin-top:6px' }, soldPct + '% absorbed')));
      view.appendChild(hero);

      const phases = p.phases.concat(p.unassigned_plots.length ? [{ id: null, name: 'Unassigned', plots: p.unassigned_plots }] : []);
      phases.forEach(ph => {
        view.appendChild(el('div', { class: 'section-title', style: 'margin-top:20px' },
          el('i', { class: 'fa-solid fa-layer-group' }), ph.name,
          ph.possession_target ? el('span', { class: 'chip', style: 'margin-left:8px' }, 'Possession: ' + ph.possession_target) : null));
        const map = el('div', { class: 'inv-map', 'data-testid': 'phase-' + (ph.id || 'none') });
        (ph.plots || []).forEach(plot => {
          const st = STATUS_META[plot.status] ? plot.status : 'available';
          const tip = 'Unit ' + plot.number + ' · ' + (STATUS_META[st].l) + (plot.unit_type ? ' · ' + plot.unit_type : '') + (plot.price ? ' · ' + money(plot.price) : '');
          map.appendChild(el('button', { class: 'inv-cell inv-cell--' + st, type: 'button', title: tip, 'data-testid': 'plot-' + plot.id, onclick: () => plotForm(plot, p) },
            el('span', { class: 'inv-cell__no' }, plot.number),
            el('span', { class: 'inv-cell__t' }, plot.unit_type || '—')));
        });
        if (!(ph.plots || []).length) map.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;padding:10px' }, 'No units'));
        view.appendChild(map);
      });
    });

    async function plotForm(plot, project) {
      const projects = await api.get('/projects').then(r => r.data).catch(() => []);
      const f = Object.assign({ status: 'available' }, plot || {});
      const inp = (k, ph, type = 'text') => { const i = el('input', { class: 'input', type, value: f[k] ?? '', placeholder: ph, 'data-testid': 'plot-' + k }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const projSel = el('select', { class: 'select', 'data-testid': 'plot-project' }, ...projects.map(pr => el('option', { value: pr.id, selected: (f.project_id || (project && project.id)) == pr.id ? 'selected' : null }, pr.name)));
      projSel.addEventListener('change', () => f.project_id = projSel.value);
      if (!f.project_id && project) f.project_id = project.id; else if (!f.project_id && projects[0]) f.project_id = projects[0].id;
      const statusSel = el('select', { class: 'select', 'data-testid': 'plot-status' }, ...Object.keys(STATUS_META).map(s => el('option', { value: s, selected: f.status === s ? 'selected' : null }, STATUS_META[s].l)));
      statusSel.addEventListener('change', () => f.status = statusSel.value);

      const body = el('div', {},
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Project'), projSel), el('div', { class: 'field' }, el('label', {}, 'Unit / Plot No.'), inp('number', 'A-101'))),
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Unit Type'), inp('unit_type', '2BHK / Plot')), el('div', { class: 'field' }, el('label', {}, 'Status'), statusSel)),
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Carpet Area (sqft)'), inp('carpet_area', '1150', 'number')), el('div', { class: 'field' }, el('label', {}, 'Price (₹)'), inp('price', '7500000', 'number'))),
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Floor'), inp('floor', '5')), el('div', { class: 'field' }, el('label', {}, 'Facing'), inp('facing', 'East'))),
        plot && plot.held_by_lead_id ? el('div', { class: 'help' }, 'Currently held for lead #' + plot.held_by_lead_id) : null);
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'plot-save' }, 'Save');
      const del = plot ? el('button', { class: 'btn btn--danger', 'data-testid': 'plot-del', onclick: async () => { if (confirm('Delete unit?')) { await api.del('/plots/' + plot.id); toast('Deleted'); m.close(); CRM.render(); } } }, 'Delete') : null;
      const m = modal({ title: plot ? 'Unit ' + plot.number : 'Add Unit', bodyNode: body, footNodes: [del, el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save].filter(Boolean) });
      save.addEventListener('click', async () => {
        const payload = { project_id: f.project_id, number: f.number, unit_type: f.unit_type, carpet_area: f.carpet_area || null, price: f.price ? Number(f.price) : null, floor: f.floor, facing: f.facing, status: f.status };
        try { plot ? await api.put('/plots/' + plot.id, payload) : await api.post('/plots', payload); toast('Saved', 'success'); m.close(); CRM.render(); }
        catch (err) { toast(err.message, 'error'); }
      });
    }
  };

  function legendChip(status, count) {
    const m = STATUS_META[status];
    return el('span', { class: 'inv-legchip inv-legchip--' + status }, el('i', {}), m.l, el('b', {}, String(count)));
  }

  // ============ SITE VISITS ============
  CRM.pages.visits = async function (view) {
    CRM.setActions(null);
    let filter = 'upcoming';
    const tbody = el('tbody', { 'data-testid': 'visits-tbody' });

    async function load() {
      tbody.innerHTML = '<tr><td colspan="6"><div class="spinner"></div></td></tr>';
      const q = filter === 'upcoming' ? 'upcoming=1' : (filter === 'all' ? '' : 'status=' + filter);
      const res = await api.get('/site-visits?' + q);
      tbody.innerHTML = '';
      if (!res.data.length) { tbody.appendChild(el('tr', {}, el('td', { colspan: 6 }, el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-calendar-day' }), el('div', {}, 'No site visits'))))); return; }
      res.data.forEach(v => {
        const badgeColor = { scheduled: 'var(--accent)', confirmed: 'var(--won)', rescheduled: 'var(--warm)', completed: 'var(--won)', no_show: 'var(--hot)', cancelled: 'var(--text-3)', at_risk: 'var(--hot)' }[v.status] || 'var(--text-2)';
        tbody.appendChild(el('tr', { 'data-testid': 'visit-row-' + v.id },
          el('td', {}, el('div', { class: 'name-cell', style: 'cursor:pointer', onclick: () => v.lead && (location.hash = '#/leads/' + v.lead.id) }, el('div', { class: 'avatar' }, initials(v.lead ? v.lead.name : '?')), v.lead ? v.lead.name : '—')),
          el('td', {}, v.project ? v.project.name : '—', v.plot ? el('div', { style: 'font-size:12px;color:var(--text-3)' }, 'Unit ' + v.plot.number) : null),
          el('td', {}, new Date(v.scheduled_at).toLocaleString()),
          el('td', {}, el('span', { class: 'chip', style: 'color:' + badgeColor }, stageName(v.status))),
          el('td', {}, v.assignee ? v.assignee.name : '—'),
          el('td', { style: 'text-align:right;white-space:nowrap' }, ...actions(v))));
      });
    }

    function actions(v) {
      const btns = [];
      const done = ['completed', 'no_show', 'cancelled'].includes(v.status);
      if (!done && v.status !== 'confirmed') btns.push(el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'v-confirm-' + v.id, title: 'Confirm', onclick: async () => { await api.post('/site-visits/' + v.id + '/confirm'); toast('Confirmed', 'success'); load(); } }, el('i', { class: 'fa-solid fa-check' })));
      if (!done && !v.checkin_at) btns.push(el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'v-checkin-' + v.id, title: 'Check-in', onclick: async () => { await api.post('/site-visits/' + v.id + '/checkin', { geo: '12.97,77.59' }); toast('Checked in', 'success'); load(); } }, el('i', { class: 'fa-solid fa-location-dot' })));
      if (!done) btns.push(el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'v-complete-' + v.id, onclick: () => completeForm(v) }, 'Outcome'));
      if (!done) btns.push(el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'v-reschedule-' + v.id, title: 'Reschedule', onclick: () => rescheduleForm(v) }, el('i', { class: 'fa-solid fa-calendar-plus' })));
      return btns;
    }

    function completeForm(v) {
      const f = { outcome: 'interested' };
      const outSel = el('select', { class: 'select', 'data-testid': 'v-outcome' }, ...[['interested','Interested — move to negotiation'],['considering','Considering — follow up in 3 days'],['not_interested','Not Interested'],['no_show','No-Show'],['reschedule','Reschedule']].map(([k, l]) => el('option', { value: k }, l)));
      outSel.addEventListener('change', () => f.outcome = outSel.value);
      const scoreI = el('input', { class: 'input', type: 'number', min: 1, max: 10, placeholder: '1-10', 'data-testid': 'v-score' }); scoreI.addEventListener('input', () => f.buyer_interest_score = scoreI.value);
      const fb = el('textarea', { class: 'input', rows: 3, placeholder: 'Site visit report / feedback…', 'data-testid': 'v-feedback' }); fb.addEventListener('input', () => f.feedback = fb.value);
      const loss = el('input', { class: 'input', placeholder: 'Loss reason (if not interested)', 'data-testid': 'v-loss' }); loss.addEventListener('input', () => f.loss_reason = loss.value);
      const body = el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Outcome'), outSel),
        el('div', { class: 'field' }, el('label', {}, 'Buyer interest score'), scoreI),
        el('div', { class: 'field' }, el('label', {}, 'Feedback / report'), fb),
        el('div', { class: 'field' }, el('label', {}, 'Loss reason'), loss));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'v-outcome-save' }, 'Save Outcome');
      const m = modal({ title: 'Site Visit Outcome', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => { try { await api.post('/site-visits/' + v.id + '/complete', f); toast('Outcome recorded', 'success'); m.close(); load(); } catch (err) { toast(err.message, 'error'); } });
    }

    function rescheduleForm(v) {
      const f = {};
      const picker = CRM.datePicker({ value: v.scheduled_at });
      const reason = el('input', { class: 'input', placeholder: 'Reason', 'data-testid': 'v-resched-reason' }); reason.addEventListener('input', () => f.reason = reason.value);
      const body = el('div', {}, el('div', { class: 'field' }, el('label', {}, 'New date & time'), picker.node), el('div', { class: 'field' }, el('label', {}, 'Reason'), reason));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'v-resched-save' }, 'Reschedule');
      const m = modal({ title: 'Reschedule Visit', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => { const dtv = picker.getValue(); if (!dtv) { toast('Pick a date', 'error'); return; } f.scheduled_at = dtv.replace('T', ' ') + ':00'; await api.post('/site-visits/' + v.id + '/reschedule', f); toast('Rescheduled', 'success'); m.close(); load(); });
    }

    const filters = el('div', { class: 'filters' });
    [['upcoming', 'Upcoming'], ['completed', 'Completed'], ['no_show', 'No-Shows'], ['all', 'All']].forEach(([k, l]) => {
      const b = el('button', { class: 'btn btn--sm ' + (filter === k ? 'btn--primary' : ''), 'data-testid': 'vf-' + k, onclick: () => { filter = k; [...filters.children].forEach(c => c.classList.remove('btn--primary')); b.classList.add('btn--primary'); load(); } }, l);
      filters.appendChild(b);
    });
    view.innerHTML = '';
    view.appendChild(el('div', { class: 'toolbar' }, filters));
    view.appendChild(el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Lead'), el('th', {}, 'Project / Unit'), el('th', {}, 'Scheduled'), el('th', {}, 'Status'), el('th', {}, 'Rep'), el('th', {}, ''))), tbody)));
    load();
  };

  // ============ Schedule modal (reused by lead drawer) ============
  CRM.scheduleVisit = async function (lead, onDone) {
    const f = { project_id: lead.project_id || '' };
    const projects = await api.get('/projects').then(r => r.data).catch(() => []);
    const picker = CRM.datePicker({ defaultTime: '11:00' });
    const projSel = el('select', { class: 'select', 'data-testid': 'sv-project' }, el('option', { value: '' }, 'Select project'), ...projects.map(p => el('option', { value: p.id, selected: f.project_id == p.id ? 'selected' : null }, p.name)));
    const plotSel = el('select', { class: 'select', 'data-testid': 'sv-plot' }, el('option', { value: '' }, 'No specific unit'));
    async function loadPlots() { plotSel.innerHTML = ''; plotSel.appendChild(el('option', { value: '' }, 'No specific unit')); if (!f.project_id) return; const plots = await api.get('/inventory/available-plots?project_id=' + f.project_id).then(r => r.data).catch(() => []); plots.forEach(p => plotSel.appendChild(el('option', { value: p.id }, p.number + ' · ' + (p.unit_type || '') + ' · ' + CRM.money(p.price)))); }
    projSel.addEventListener('change', () => { f.project_id = projSel.value; loadPlots(); });
    plotSel.addEventListener('change', () => f.plot_id = plotSel.value);
    if (f.project_id) loadPlots();
    const mp = el('input', { class: 'input', placeholder: 'Meeting point', value: 'Sales Office', 'data-testid': 'sv-meeting' }); mp.addEventListener('input', () => f.meeting_point = mp.value); f.meeting_point = 'Sales Office';

    const body = el('div', {},
      el('div', { class: 'field' }, el('label', {}, 'Date & time *'), picker.node),
      el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Project'), projSel), el('div', { class: 'field' }, el('label', {}, 'Unit (optional)'), plotSel)),
      el('div', { class: 'field' }, el('label', {}, 'Meeting point'), mp),
      el('div', { class: 'help' }, 'Confirmation is sent via WhatsApp + email; reminders are auto-scheduled.'));
    const save = el('button', { class: 'btn btn--primary', 'data-testid': 'sv-save' }, 'Schedule Visit');
    const m = modal({ title: 'Schedule Site Visit', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
    save.addEventListener('click', async () => {
      const dtv = picker.getValue();
      if (!dtv) { toast('Pick a date & time', 'error'); return; }
      try { await api.post('/leads/' + lead.id + '/site-visits', { scheduled_at: dtv.replace('T', ' ') + ':00', project_id: f.project_id || null, plot_id: f.plot_id || null, meeting_point: f.meeting_point }); toast('Site visit scheduled', 'success'); m.close(); if (onDone) onDone(); }
      catch (err) { toast(err.message, 'error'); }
    });
  };
})();
