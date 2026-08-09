// ---- Section L: Cost Sheets, Discounts, Proposals ----
(function () {
  const { el, api, toast, modal, money, timeAgo, can } = CRM;

  const bandBadge = (sheet) => {
    if (sheet.discount_status === 'pending') return el('span', { class: 'chip', style: 'color:var(--warm)' }, 'Discount pending approval');
    if (sheet.discount_status === 'approved' && sheet.discount_amount > 0) return el('span', { class: 'chip', style: 'color:var(--won)' }, 'Discount approved');
    if (sheet.discount_status === 'rejected') return el('span', { class: 'chip', style: 'color:var(--hot)' }, 'Discount rejected');
    return null;
  };

  // ===== Quote tab in the lead drawer =====
  CRM.leadQuoteTab = function (lead, reload) {
    const wrap = el('div', { 'data-testid': 'quote-tab' }, el('div', { class: 'spinner' }));
    (async () => {
      const [data, plans] = await Promise.all([
        api.get('/leads/' + lead.id + '/cost-sheets'),
        api.get('/payment-plans').then(r => r.data).catch(() => []),
      ]);
      wrap.innerHTML = '';
      wrap.appendChild(builder(lead, plans, reload));
      wrap.appendChild(el('div', { class: 'section-title' }, 'Cost Sheets'));
      if (!data.cost_sheets.length) wrap.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:12px' }, 'None yet'));
      data.cost_sheets.forEach(cs => wrap.appendChild(sheetCard(cs, plans, reload)));
      if (data.proposals.length) {
        wrap.appendChild(el('div', { class: 'section-title' }, 'Proposals'));
        data.proposals.forEach(p => wrap.appendChild(proposalCard(p, reload)));
      }
    })();
    return wrap;
  };

  function builder(lead, plans, reload) {
    const f = { gst_rate: 5, discount_pct: 0 };
    const totalEl = el('b', { class: 'mono', 'data-testid': 'cs-total', style: 'font-size:18px' }, '₹0');
    const num = (k, ph) => { const i = el('input', { class: 'input', type: 'number', placeholder: ph, 'data-testid': 'cs-' + k, value: f[k] ?? '' }); i.addEventListener('input', () => { f[k] = i.value === '' ? '' : Number(i.value); recompute(); }); return i; };
    function recompute() {
      const base = Number(f.base_price || 0);
      const sub = base + Math.round(base * Number(f.gst_rate || 0) / 100) + Number(f.registration_charges || 0) + Number(f.maintenance_charges || 0) + Number(f.other_charges || 0);
      const disc = Math.round(base * Number(f.discount_pct || 0) / 100);
      totalEl.textContent = money(Math.max(0, sub - disc));
      warn.style.display = Number(f.discount_pct || 0) > 5 ? 'block' : 'none';
    }
    const planSel = el('select', { class: 'select', 'data-testid': 'cs-plan' }, el('option', { value: '' }, 'No payment plan'), ...plans.map(p => el('option', { value: p.id }, p.name)));
    planSel.addEventListener('change', () => f.payment_plan_id = planSel.value || null);
    const reason = el('input', { class: 'input', placeholder: 'Discount reason (required if >5%)', 'data-testid': 'cs-reason' });
    reason.addEventListener('input', () => f.discount_reason = reason.value);
    const warn = el('div', { class: 'help', style: 'display:none;color:var(--warm)' }, '⚠ Discounts above 5% require manager approval before a proposal can be generated.');

    const create = el('button', { class: 'btn btn--primary', 'data-testid': 'cs-create' }, el('i', { class: 'fa-solid fa-file-invoice' }), 'Create Cost Sheet');
    create.addEventListener('click', async () => {
      if (!f.base_price) { toast('Enter a base price', 'error'); return; }
      try {
        await api.post('/leads/' + lead.id + '/cost-sheets', {
          base_price: Number(f.base_price), gst_rate: Number(f.gst_rate || 0),
          registration_charges: Number(f.registration_charges || 0), maintenance_charges: Number(f.maintenance_charges || 0),
          other_charges: Number(f.other_charges || 0), discount_pct: Number(f.discount_pct || 0),
          discount_reason: f.discount_reason || null, payment_plan_id: f.payment_plan_id || null,
        });
        toast('Cost sheet created', 'success'); reload();
      } catch (err) { toast(err.message, 'error'); }
    });

    return el('div', { class: 'card', style: 'margin-bottom:16px' },
      el('div', { class: 'section-title', style: 'margin-top:0' }, el('i', { class: 'fa-solid fa-calculator' }), 'Cost Sheet Generator'),
      el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Base Price (₹)'), num('base_price', '8000000')), el('div', { class: 'field' }, el('label', {}, 'GST %'), num('gst_rate', '5'))),
      el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Registration (₹)'), num('registration_charges', '80000')), el('div', { class: 'field' }, el('label', {}, 'Maintenance (₹)'), num('maintenance_charges', '120000'))),
      el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Other Charges (₹)'), num('other_charges', '0')), el('div', { class: 'field' }, el('label', {}, 'Discount %'), num('discount_pct', '0'))),
      el('div', { class: 'field' }, el('label', {}, 'Payment Plan'), planSel),
      el('div', { class: 'field' }, el('label', {}, 'Discount Reason'), reason),
      warn,
      el('div', { style: 'display:flex;align-items:center;justify-content:space-between;margin-top:8px' },
        el('div', {}, el('div', { style: 'font-size:12px;color:var(--text-3)' }, 'Estimated Total'), totalEl), create));
  }

  function sheetCard(cs, plans, reload) {
    const line = (l, v) => el('div', { class: 'row' }, el('span', { class: 'l' }, l), el('span', { class: 'r' }, v));
    const pendingDiscount = cs.discount_status === 'pending';
    const share = el('button', { class: 'btn btn--sm', 'data-testid': 'cs-share-' + cs.id, onclick: async () => { await api.post('/cost-sheets/' + cs.id + '/share'); toast('Shared with lead', 'success'); reload(); } }, el('i', { class: 'fa-solid fa-paper-plane' }), 'Share');
    const gen = el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'cs-proposal-' + cs.id, disabled: pendingDiscount ? 'disabled' : null, onclick: async () => { try { await api.post('/cost-sheets/' + cs.id + '/proposal'); toast('Proposal generated', 'success'); reload(); } catch (e) { toast(e.message, 'error'); } } }, el('i', { class: 'fa-solid fa-file-signature' }), 'Generate Proposal');
    return el('div', { class: 'card', 'data-testid': 'cost-sheet-' + cs.id, style: 'margin-bottom:12px' },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' },
        el('b', {}, 'Total ' + money(cs.total)), bandBadge(cs)),
      el('div', { class: 'detail-grid' },
        line('Base', money(cs.base_price)), line('GST (' + cs.gst_rate + '%)', money(cs.gst_amount)),
        line('Registration', money(cs.registration_charges)), line('Maintenance', money(cs.maintenance_charges)),
        line('Discount', cs.discount_amount ? '-' + money(cs.discount_amount) + ' (' + cs.discount_pct + '%)' : '—'),
        line('Plan', cs.payment_plan ? cs.payment_plan.name : '—')),
      el('div', { style: 'display:flex;gap:8px;margin-top:12px' }, share, gen));
  }

  function proposalCard(p, reload) {
    const send = el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'prop-send-' + p.id, onclick: async () => { await api.post('/proposals/' + p.id + '/send'); toast('Proposal sent', 'success'); reload(); } }, el('i', { class: 'fa-solid fa-paper-plane' }), 'Send');
    const consent = el('button', { class: 'btn btn--sm', 'data-testid': 'prop-consent-' + p.id, onclick: () => {
      const nameI = el('input', { class: 'input', placeholder: 'Full name of consenting party', 'data-testid': 'consent-name' });
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'consent-save' }, 'Capture Consent');
      const m = modal({ title: 'Capture Consent · ' + p.reference_no, bodyNode: el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Consent'), nameI), el('div', { class: 'help' }, 'Records explicit acceptance of the proposal terms.')), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => { if (!nameI.value.trim()) { toast('Enter a name', 'error'); return; } await api.post('/proposals/' + p.id + '/consent', { name: nameI.value }); toast('Consent captured', 'success'); m.close(); reload(); });
    } }, el('i', { class: 'fa-solid fa-signature' }), 'Consent');
    const statusColor = { draft: 'var(--text-3)', sent: 'var(--accent)', accepted: 'var(--won)', rejected: 'var(--hot)' }[p.status] || 'var(--text-2)';
    return el('div', { class: 'card', 'data-testid': 'proposal-' + p.id, style: 'margin-bottom:10px' },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center' },
        el('div', {}, el('b', { class: 'mono' }, p.reference_no), el('div', { style: 'font-size:12px;color:var(--text-3)' }, 'Total ' + money((p.snapshot || {}).total || 0) + (p.consent_captured ? ' · consent by ' + p.consent_name : ''))),
        el('span', { class: 'chip', style: 'color:' + statusColor }, p.status)),
      el('div', { style: 'display:flex;gap:8px;margin-top:10px' }, p.status === 'draft' ? send : null, !p.consent_captured ? consent : null));
  }

  // ===== Approvals page (managers) =====
  CRM.pages.approvals = async function (view) {
    CRM.setActions(null);
    const res = await api.get('/discount-approvals?status=pending');
    view.innerHTML = '';
    view.appendChild(el('p', { style: 'color:var(--text-2);margin-bottom:16px' }, 'Discount requests above 5% awaiting manager decision (Section L1.3).'));
    if (!res.data.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-badge-check' }), el('div', {}, 'No pending approvals'))); return; }
    const tbody = el('tbody', { 'data-testid': 'approvals-tbody' });
    res.data.forEach(a => {
      const decide = async (decision, counter_pct) => {
        let note = decision === 'rejected' ? prompt('Reason for rejection?') || '' : '';
        try { await api.post('/discount-approvals/' + a.id + '/decide', { decision, note, counter_pct }); toast('Decision saved', 'success'); CRM.render(); } catch (e) { toast(e.message, 'error'); }
      };
      tbody.appendChild(el('tr', { 'data-testid': 'approval-row-' + a.id },
        el('td', {}, a.lead ? a.lead.name : '—'),
        el('td', {}, el('b', { class: 'mono', style: 'color:var(--warm)' }, a.discount_pct + '%'), ' (', money(a.discount_amount), ')'),
        el('td', {}, el('span', { class: 'chip' }, a.band === 'over_10' ? '>10%' : '>5%')),
        el('td', {}, a.reason || '—'),
        el('td', {}, a.requester ? a.requester.name : '—'),
        el('td', { style: 'text-align:right;white-space:nowrap' },
          el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'approve-' + a.id, onclick: () => decide('approved') }, 'Approve'),
          el('button', { class: 'btn btn--sm', 'data-testid': 'counter-' + a.id, onclick: () => { const c = prompt('Counter offer % (e.g. 5)'); if (c) decide('counter', Number(c)); } }, 'Counter'),
          el('button', { class: 'btn btn--sm btn--danger', 'data-testid': 'reject-' + a.id, onclick: () => decide('rejected') }, 'Reject'))));
    });
    view.appendChild(el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Lead'), el('th', {}, 'Discount'), el('th', {}, 'Band'), el('th', {}, 'Reason'), el('th', {}, 'Requested By'), el('th', {}, ''))), tbody)));
  };

  // ===== Payment Plans config =====
  CRM.pages.plans = async function (view) {
    CRM.setActions(can('config.manage') ? el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'add-plan', onclick: () => planForm() }, el('i', { class: 'fa-solid fa-plus' }), 'Add Plan') : null);
    const plans = await api.get('/payment-plans').then(r => r.data);
    view.innerHTML = '';
    view.appendChild(el('div', { class: 'grid', style: 'grid-template-columns:repeat(auto-fill,minmax(280px,1fr))' }, ...plans.map(p =>
      el('div', { class: 'card', 'data-testid': 'plan-' + p.id },
        el('b', {}, p.name), el('div', { style: 'font-size:12px;color:var(--text-3);margin:4px 0 10px' }, p.description || ''),
        ...p.milestones.map(m => el('div', { style: 'display:flex;justify-content:space-between;font-size:13px;padding:5px 0;border-bottom:1px solid var(--border)' }, el('span', {}, m.label), el('b', { class: 'mono' }, m.pct + '%')))))));

    function planForm() {
      const f = { milestones: [{ label: 'On Booking', pct: 20 }, { label: 'On Possession', pct: 80 }] };
      const inp = (k, ph) => { const i = el('input', { class: 'input', placeholder: ph, 'data-testid': 'plan-' + k }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const ms = el('textarea', { class: 'input', rows: 4, 'data-testid': 'plan-milestones' }, JSON.stringify(f.milestones, null, 2));
      const body = el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Name'), inp('name', 'Construction Linked')),
        el('div', { class: 'field' }, el('label', {}, 'Code'), inp('code', 'CLP')),
        el('div', { class: 'field' }, el('label', {}, 'Description'), inp('description', '')),
        el('div', { class: 'field' }, el('label', {}, 'Milestones (JSON: [{label,pct}])'), ms),
        el('div', { class: 'help' }, 'Percentages should total 100.'));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'plan-save' }, 'Save');
      const m = modal({ title: 'New Payment Plan', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => { let milestones; try { milestones = JSON.parse(ms.value); } catch (e) { toast('Invalid milestones JSON', 'error'); return; } try { await api.post('/payment-plans', { name: f.name, code: f.code, description: f.description, milestones }); toast('Saved', 'success'); m.close(); CRM.render(); } catch (err) { toast(err.message, 'error'); } });
    }
  };
})();
