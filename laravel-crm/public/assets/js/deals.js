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

  // ===== Deal closure (Won / Lost) =====
  CRM.markWon = async function (lead, onDone) {
    const f = {};
    const plots = await api.get('/inventory/available-plots' + (lead.project_id ? '?project_id=' + lead.project_id : '')).then(r => r.data).catch(() => []);
    const plotSel = el('select', { class: 'select', 'data-testid': 'won-plot' }, el('option', { value: '' }, 'Use held unit / none'), ...plots.map(p => el('option', { value: p.id }, p.number + ' · ' + (p.unit_type || '') + ' · ' + money(p.price))));
    plotSel.addEventListener('change', () => f.plot_id = plotSel.value || null);
    const token = el('input', { class: 'input', type: 'number', placeholder: 'Auto = 10% of deal', 'data-testid': 'won-token' }); token.addEventListener('input', () => f.token_amount = token.value);
    const body = el('div', {},
      el('div', { class: 'field' }, el('label', {}, 'Unit'), plotSel),
      el('div', { class: 'field' }, el('label', {}, 'Token / EOI amount (₹)'), token),
      el('div', { class: 'help' }, 'Marking Won initiates the booking, auto-sends the booking form (WhatsApp + email), holds the unit, hands over to post-sales and locks the lead record.'));
    const save = el('button', { class: 'btn btn--primary', 'data-testid': 'won-confirm' }, el('i', { class: 'fa-solid fa-trophy' }), 'Confirm Deal Won');
    const m = modal({ title: 'Close Deal — Won', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
    save.addEventListener('click', async () => { try { await api.post('/leads/' + lead.id + '/won', { plot_id: f.plot_id || null, token_amount: f.token_amount ? Number(f.token_amount) : null }); toast('Deal won — booking initiated', 'success'); m.close(); if (onDone) onDone(); } catch (err) { toast(err.message, 'error'); } });
  };

  CRM.markLost = function (lead, onDone) {
    const reason = el('textarea', { class: 'input', rows: 3, placeholder: 'Reason for loss (e.g. price, chose competitor, financing)…', 'data-testid': 'lost-reason' });
    const save = el('button', { class: 'btn btn--danger', 'data-testid': 'lost-confirm' }, 'Confirm Deal Lost');
    const m = modal({ title: 'Close Deal — Lost', bodyNode: el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Loss reason'), reason), el('div', { class: 'help' }, 'The unit is released back to inventory and the lead enters long-term re-engagement.')), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
    save.addEventListener('click', async () => { try { await api.post('/leads/' + lead.id + '/lost', { reason: reason.value }); toast('Deal marked lost', 'success'); m.close(); if (onDone) onDone(); } catch (err) { toast(err.message, 'error'); } });
  };

  // ===== Booking tab in the lead drawer =====
  CRM.leadBookingTab = function (lead, reload) {
    const wrap = el('div', { 'data-testid': 'booking-tab' }, el('div', { class: 'spinner' }));
    (async () => {
      const full = await api.get('/leads/' + lead.id);
      const bookings = full.lead.bookings || [];
      wrap.innerHTML = '';
      if (!bookings.length) {
        wrap.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-file-contract' }), el('div', {}, 'No booking yet — mark the deal Won to initiate one')));
        return;
      }
      bookings.forEach(b => wrap.appendChild(bookingCard(b, reload)));
    })();
    return wrap;
  };

  function bookingCard(b, reload) {
    const line = (l, v) => el('div', { class: 'row' }, el('span', { class: 'l' }, l), el('span', { class: 'r' }, v));
    const statusColor = { initiated: 'var(--text-3)', form_sent: 'var(--accent)', form_submitted: 'var(--warm)', verified: 'var(--accent)', confirmed: 'var(--won)', cancelled: 'var(--hot)' }[b.status] || 'var(--text-2)';
    const btns = el('div', { style: 'display:flex;gap:8px;margin-top:12px;flex-wrap:wrap' });
    if (['form_submitted'].includes(b.status)) btns.appendChild(el('button', { class: 'btn btn--sm', 'data-testid': 'bk-verify-' + b.id, onclick: async () => { await api.post('/bookings/' + b.id + '/verify'); toast('Booking verified', 'success'); reload(); } }, el('i', { class: 'fa-solid fa-clipboard-check' }), 'Verify Form'));
    if (b.token_status !== 'paid') btns.appendChild(el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'bk-pay-' + b.id, onclick: async () => { await api.post('/bookings/' + b.id + '/pay-token'); toast('Token payment recorded', 'success'); reload(); } }, el('i', { class: 'fa-solid fa-indian-rupee-sign' }), 'Record Token (mock)'));
    if (!['cancelled'].includes(b.status) && can('postsales.manage')) btns.appendChild(el('button', { class: 'btn btn--sm btn--danger', 'data-testid': 'bk-cancel-' + b.id, onclick: async () => { const r = prompt('Cancellation reason'); if (r === null) return; await api.post('/bookings/' + b.id + '/cancel', { reason: r }); toast('Booking cancelled — unit released', 'warning'); reload(); } }, el('i', { class: 'fa-solid fa-ban' }), 'Cancel Booking'));
    const fd = b.form_data || {};
    return el('div', { class: 'card', 'data-testid': 'booking-' + b.id },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:8px' },
        el('b', { class: 'mono' }, b.booking_ref), el('span', { class: 'chip', style: 'color:' + statusColor }, CRM.stageName(b.status))),
      el('div', { class: 'detail-grid' },
        line('Deal Value', money(b.deal_value)), line('Token / EOI', money(b.token_amount)),
        line('Token Status', b.token_status), line('Unit', b.plot ? b.plot.number : '—'),
        line('Form', b.form_submitted_at ? 'Submitted' : 'Awaiting'), line('Verified', b.verified_at ? 'Yes' : 'No')),
      b.payment_link ? el('div', { class: 'help', style: 'margin-top:8px' }, 'Payment link: ' + b.payment_link) : null,
      Object.keys(fd).length ? el('div', { style: 'margin-top:10px' }, el('div', { class: 'section-title', style: 'margin:6px 0' }, 'Submitted details'),
        ...Object.entries(fd).map(([k, v]) => el('div', { style: 'font-size:12.5px;color:var(--text-2);display:flex;justify-content:space-between;padding:3px 0' }, el('span', {}, k.replace(/_/g, ' ')), el('b', {}, String(v))))) : null,
      btns);
  }

  // ===== Post-Sales tab in the lead drawer (Section N) =====
  CRM.leadPostSalesTab = function (lead, reload) {
    const wrap = el('div', { 'data-testid': 'postsales-tab' }, el('div', { class: 'spinner' }));
    (async () => {
      const full = await api.get('/leads/' + lead.id);
      const bookings = full.lead.bookings || [];
      wrap.innerHTML = '';
      if (!bookings.length) {
        wrap.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-box-open' }), el('div', {}, 'No booking yet — post-sales begins once a deal is Won')));
        return;
      }
      const booking = bookings.find(b => b.status === 'confirmed') || bookings[bookings.length - 1];
      await renderPostSales(wrap, booking, () => CRM.reopenPostSales(lead, reload));
    })();
    return wrap;
  };

  CRM.reopenPostSales = function (lead, reload) {
    const content = document.querySelector('[data-testid="tab-content"]');
    if (content) { content.innerHTML = ''; content.appendChild(CRM.leadPostSalesTab(lead, reload)); }
  };

  async function renderPostSales(wrap, booking, refresh) {
    const bid = booking.id;
    const canManage = can('postsales.manage');
    const [ps, pays, sched, ags, dems] = await Promise.all([
      api.get('/bookings/' + bid + '/post-sales'),
      api.get('/payments?booking_id=' + bid).then(r => r.data).catch(() => []),
      api.get('/bookings/' + bid + '/milestones').catch(() => ({ milestones: [], collected: 0, deal_value: 0 })),
      api.get('/bookings/' + bid + '/agreements').then(r => r.agreements).catch(() => []),
      api.get('/demand-letters?booking_id=' + bid).then(r => r.data).catch(() => []),
    ]);
    wrap.innerHTML = '';
    wrap.appendChild(el('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px' },
      el('b', { class: 'mono' }, booking.booking_ref),
      el('span', { class: 'chip', style: 'color:var(--won)' }, CRM.stageName(booking.status))));

    // --- Payments & receipts ---
    const payHead = el('div', { class: 'section-title', style: 'display:flex;justify-content:space-between;align-items:center' }, el('span', {}, 'Payments & Receipts'));
    if (canManage) payHead.appendChild(el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'ps-record-payment', onclick: () => recordPaymentModal(booking, refresh) }, el('i', { class: 'fa-solid fa-plus' }), 'Record Payment'));
    wrap.appendChild(payHead);
    if (!pays.length) wrap.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:12px' }, 'No payments recorded yet'));
    pays.forEach(p => wrap.appendChild(paymentRow(p, canManage, refresh)));

    // --- Document checklist ---
    wrap.appendChild(el('div', { class: 'section-title' }, 'Document Checklist'));
    const grid = el('div', { 'data-testid': 'ps-doc-list' });
    ps.documents.forEach(d => grid.appendChild(docRow(d, canManage, refresh)));
    wrap.appendChild(grid);

    // --- Letters ---
    const letHead = el('div', { class: 'section-title', style: 'display:flex;justify-content:space-between;align-items:center' }, el('span', {}, 'Letters'));
    if (canManage && !ps.letters.some(l => l.type === 'welcome')) letHead.appendChild(el('button', { class: 'btn btn--sm', 'data-testid': 'ps-gen-welcome', onclick: async () => { await api.post('/bookings/' + bid + '/welcome-letter'); toast('Welcome letter generated', 'success'); refresh(); } }, el('i', { class: 'fa-solid fa-envelope-open-text' }), 'Generate Welcome'));
    wrap.appendChild(letHead);
    if (!ps.letters.length) wrap.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px' }, 'No letters yet'));
    ps.letters.forEach(l => wrap.appendChild(el('div', { class: 'card', 'data-testid': 'ps-letter-' + l.id, style: 'padding:12px' },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, el('b', {}, l.title), el('span', { class: 'chip mono' }, l.serial_no)),
      el('div', { style: 'white-space:pre-line;font-size:12.5px;color:var(--text-2);margin-top:8px' }, l.body),
      el('div', { class: 'help', style: 'margin-top:6px' }, l.status === 'sent' ? ('Sent · ' + (l.sent_via || '')) : 'Generated'))));

    // --- Payment schedule (Section P) ---
    wrap.appendChild(el('div', { class: 'section-title' }, 'Payment Schedule'));
    if (!sched.milestones.length) wrap.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px' }, 'No schedule yet'));
    sched.milestones.forEach(m => wrap.appendChild(milestoneRow(m, canManage, refresh)));

    // --- Agreement for Sale (Section O) ---
    const agHead = el('div', { class: 'section-title', style: 'display:flex;justify-content:space-between;align-items:center' }, el('span', {}, 'Agreement for Sale'));
    if (canManage && !ags.length) agHead.appendChild(el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'ps-gen-afs', onclick: async () => { await api.post('/bookings/' + bid + '/agreements'); toast('AFS drafted', 'success'); refresh(); } }, el('i', { class: 'fa-solid fa-file-signature' }), 'Draft AFS'));
    wrap.appendChild(agHead);
    if (!ags.length) wrap.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px' }, 'No agreement yet'));
    ags.forEach(a => wrap.appendChild(agreementCard(a, canManage, refresh)));

    // --- Demand letters (Section Q) ---
    if (dems.length) {
      wrap.appendChild(el('div', { class: 'section-title' }, 'Demand Letters'));
      dems.forEach(d => wrap.appendChild(demandRow(d, canManage, refresh)));
    }
  }

  function milestoneRow(m, canManage, refresh) {
    const colors = { pending: 'var(--text-3)', due: 'var(--warm)', partial: 'var(--accent)', paid: 'var(--won)', overdue: 'var(--hot)' };
    const out = (m.amount - m.paid_amount);
    const actions = el('div', {});
    if (canManage && out > 0 && m.status !== 'paid') actions.appendChild(el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'ms-pay-' + m.id, onclick: () => milestonePayModal(m, refresh) }, 'Pay'));
    return el('div', { class: 'row', 'data-testid': 'milestone-' + m.id, style: 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)' },
      el('div', {}, el('div', {}, m.label, el('span', { style: 'color:var(--text-3);font-size:11px;margin-left:6px' }, m.pct + '%')),
        el('div', { style: 'font-size:11px;color:var(--text-3)' }, m.due_at ? ('Due ' + new Date(m.due_at).toLocaleDateString()) : '')),
      el('div', { style: 'display:flex;gap:10px;align-items:center' },
        el('b', {}, money(m.amount)),
        el('span', { class: 'chip', style: 'color:' + (colors[m.status] || 'var(--text-2)') }, m.status),
        actions));
  }

  function milestonePayModal(m, refresh) {
    const out = m.amount - m.paid_amount;
    const f = { method: 'neft', amount: out };
    const amt = el('input', { class: 'input', type: 'number', value: out, 'data-testid': 'ms-amount' }); amt.addEventListener('input', () => f.amount = amt.value);
    const methodSel = el('select', { class: 'select', 'data-testid': 'ms-method' }, ...['neft', 'upi', 'cheque', 'cash', 'razorpay', 'online'].map(x => el('option', { value: x }, x)));
    methodSel.addEventListener('change', () => f.method = methodSel.value);
    const ref = el('input', { class: 'input', placeholder: 'Reference', 'data-testid': 'ms-ref' }); ref.addEventListener('input', () => f.reference = ref.value);
    const save = el('button', { class: 'btn btn--primary', 'data-testid': 'ms-pay-save' }, 'Record Payment');
    const mo = modal({ title: 'Pay ' + m.label, bodyNode: el('div', {},
      el('div', { class: 'field' }, el('label', {}, 'Amount (₹)'), amt),
      el('div', { class: 'field' }, el('label', {}, 'Method'), methodSel),
      el('div', { class: 'field' }, el('label', {}, 'Reference'), ref)), footNodes: [el('button', { class: 'btn', onclick: () => mo.close() }, 'Cancel'), save] });
    save.addEventListener('click', async () => { try { await api.post('/milestones/' + m.id + '/pay', { amount: Number(f.amount), method: f.method, reference: f.reference }); toast('Payment recorded', 'success'); mo.close(); refresh(); } catch (e) { toast(e.message, 'error'); } });
  }

  function agreementCard(a, canManage, refresh) {
    const colors = { draft: 'var(--text-3)', sent_for_sign: 'var(--warm)', signed: 'var(--accent)', registered: 'var(--won)' };
    const btns = el('div', { style: 'display:flex;gap:6px;margin-top:10px;flex-wrap:wrap' });
    if (canManage && a.status === 'draft') btns.appendChild(el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'afs-send-' + a.id, onclick: async () => { await api.post('/agreements/' + a.id + '/send-for-sign'); toast('Sent for e-signature', 'success'); refresh(); } }, 'Send for e-Sign'));
    if (canManage && a.status === 'sent_for_sign') btns.appendChild(el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'afs-sign-' + a.id, onclick: async () => { await api.post('/agreements/' + a.id + '/sign'); toast('Signed', 'success'); refresh(); } }, 'Mark Signed'));
    if (canManage && a.status === 'signed') btns.appendChild(el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'afs-register-' + a.id, onclick: async () => { const rn = prompt('Registration number'); if (!rn) return; await api.post('/agreements/' + a.id + '/register', { registration_no: rn }); toast('Registered', 'success'); refresh(); } }, 'Register'));
    return el('div', { class: 'card', 'data-testid': 'agreement-' + a.id, style: 'padding:12px' },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center' }, el('b', { class: 'mono' }, a.serial_no), el('span', { class: 'chip', style: 'color:' + (colors[a.status] || 'var(--text-2)') }, a.status.replace(/_/g, ' '))),
      a.review_until ? el('div', { class: 'help', style: 'margin-top:4px' }, 'Review until ' + new Date(a.review_until).toLocaleDateString() + (a.esign_ref ? (' · e-sign ' + a.esign_ref) : '')) : null,
      a.registration_no ? el('div', { class: 'help', style: 'margin-top:4px;color:var(--won)' }, 'Registered: ' + a.registration_no) : null,
      btns);
  }

  function demandRow(d, canManage, refresh) {
    const colors = { issued: 'var(--warm)', paid: 'var(--won)', escalated: 'var(--hot)' };
    const btns = el('div', { style: 'display:flex;gap:6px' });
    if (canManage && d.status === 'issued') {
      btns.appendChild(el('button', { class: 'btn btn--sm', 'data-testid': 'dm-post-' + d.id, onclick: async () => { const rp = prompt('Registered-post tracking ref (optional)') || null; await api.post('/demand-letters/' + d.id + '/deliver', { via: 'registered_post', registered_post_ref: rp }); toast('Delivered by registered post', 'success'); refresh(); } }, 'Reg. Post'));
      btns.appendChild(el('button', { class: 'btn btn--sm btn--danger', 'data-testid': 'dm-esc-' + d.id, onclick: async () => { await api.post('/demand-letters/' + d.id + '/escalate'); toast('Escalated to legal', 'warning'); refresh(); } }, 'Escalate'));
    }
    return el('div', { class: 'card', 'data-testid': 'demand-' + d.id, style: 'padding:12px' },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center' },
        el('div', {}, el('b', { class: 'mono' }, d.serial_no), el('span', { style: 'color:var(--text-3);font-size:12px;margin-left:8px' }, d.days_overdue + 'd overdue')),
        el('span', { class: 'chip', style: 'color:' + (colors[d.status] || 'var(--text-2)') }, d.status)),
      el('div', { class: 'help', style: 'margin-top:4px' }, 'Due ' + money(d.amount_due) + ' + interest ' + money(d.late_interest) + ' = ' + money(d.total_due)),
      btns);
  }

  function paymentRow(p, canManage, refresh) {
    const colors = { received: 'var(--warm)', verified: 'var(--accent)', reconciled: 'var(--won)', discrepancy: 'var(--hot)', failed: 'var(--hot)' };
    const btns = el('div', { style: 'display:flex;gap:6px;margin-top:8px;flex-wrap:wrap' });
    if (canManage && p.status === 'received') btns.appendChild(el('button', { class: 'btn btn--sm', 'data-testid': 'pay-verify-' + p.id, onclick: async () => { await api.post('/payments/' + p.id + '/verify'); toast('Payment verified', 'success'); refresh(); } }, 'Verify'));
    if (canManage && ['received', 'verified'].includes(p.status)) {
      btns.appendChild(el('button', { class: 'btn btn--sm', 'data-testid': 'pay-match-' + p.id, onclick: async () => { await api.post('/payments/' + p.id + '/reconcile', { result: 'matched' }); toast('Reconciled', 'success'); refresh(); } }, 'Match'));
      btns.appendChild(el('button', { class: 'btn btn--sm btn--danger', 'data-testid': 'pay-disc-' + p.id, onclick: async () => { const note = prompt('Discrepancy note'); if (note === null) return; await api.post('/payments/' + p.id + '/reconcile', { result: 'discrepancy', note }); toast('Flagged discrepancy', 'warning'); refresh(); } }, 'Discrepancy'));
      btns.appendChild(el('button', { class: 'btn btn--sm btn--danger', 'data-testid': 'pay-fail-' + p.id, onclick: async () => { const r = prompt('Failure reason (e.g. cheque bounced)'); if (r === null) return; await api.post('/payments/' + p.id + '/fail', { reason: r }); toast('Payment marked failed', 'warning'); refresh(); } }, 'Bounce/Fail'));
    }
    return el('div', { class: 'card', 'data-testid': 'payment-' + p.id, style: 'padding:12px;margin-bottom:8px' },
      el('div', { style: 'display:flex;justify-content:space-between;align-items:center' },
        el('div', {}, el('b', { class: 'mono' }, p.receipt_no || '—'), el('span', { style: 'color:var(--text-3);font-size:12px;margin-left:8px' }, p.type + ' · ' + p.method)),
        el('div', { style: 'display:flex;gap:10px;align-items:center' }, el('b', {}, money(p.amount)), el('span', { class: 'chip', style: 'color:' + (colors[p.status] || 'var(--text-2)') }, p.status))),
      p.reconcile_note ? el('div', { class: 'help', style: 'margin-top:4px;color:var(--hot)' }, p.reconcile_note) : null,
      btns);
  }

  function docRow(d, canManage, refresh) {
    const colors = { pending: 'var(--text-3)', received: 'var(--warm)', verified: 'var(--won)', rejected: 'var(--hot)' };
    const actions = el('div', { style: 'display:flex;gap:6px' });
    if (canManage && d.status === 'pending') actions.appendChild(el('button', { class: 'btn btn--sm', 'data-testid': 'doc-recv-' + d.id, onclick: async () => { await api.put('/documents/' + d.id, { status: 'received' }); toast('Marked received', 'success'); refresh(); } }, 'Received'));
    if (canManage && ['received', 'pending'].includes(d.status)) actions.appendChild(el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'doc-verify-' + d.id, onclick: async () => { await api.put('/documents/' + d.id, { status: 'verified' }); toast('Verified', 'success'); refresh(); } }, 'Verify'));
    return el('div', { class: 'row', 'data-testid': 'doc-' + d.id, style: 'display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)' },
      el('div', {}, el('div', {}, d.name, d.required ? el('span', { style: 'color:var(--hot);margin-left:4px' }, '*') : null),
        el('div', { style: 'font-size:11px;color:var(--text-3)' }, d.category)),
      el('div', { style: 'display:flex;gap:10px;align-items:center' }, el('span', { class: 'chip', style: 'color:' + (colors[d.status] || 'var(--text-2)') }, d.status), actions));
  }

  function recordPaymentModal(booking, refresh) {
    const f = { type: 'milestone', method: 'neft' };
    const typeSel = el('select', { class: 'select', 'data-testid': 'pay-type' }, ...['token', 'eoi', 'milestone', 'registration', 'other'].map(t => el('option', { value: t, selected: t === f.type ? 'selected' : null }, t)));
    typeSel.addEventListener('change', () => f.type = typeSel.value);
    const methodSel = el('select', { class: 'select', 'data-testid': 'pay-method' }, ...['neft', 'upi', 'cheque', 'cash', 'razorpay', 'online'].map(m => el('option', { value: m, selected: m === f.method ? 'selected' : null }, m)));
    methodSel.addEventListener('change', () => f.method = methodSel.value);
    const amt = el('input', { class: 'input', type: 'number', placeholder: 'Amount (₹)', 'data-testid': 'pay-amount' }); amt.addEventListener('input', () => f.amount = amt.value);
    const ref = el('input', { class: 'input', placeholder: 'Bank / txn / cheque reference', 'data-testid': 'pay-ref' }); ref.addEventListener('input', () => f.reference = ref.value);
    const save = el('button', { class: 'btn btn--primary', 'data-testid': 'pay-save' }, 'Record & Issue Receipt');
    const m = modal({ title: 'Record Payment', bodyNode: el('div', {},
      el('div', { class: 'field' }, el('label', {}, 'Type'), typeSel),
      el('div', { class: 'field' }, el('label', {}, 'Method'), methodSel),
      el('div', { class: 'field' }, el('label', {}, 'Amount (₹)'), amt),
      el('div', { class: 'field' }, el('label', {}, 'Reference'), ref)), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
    save.addEventListener('click', async () => { if (!f.amount) { toast('Enter an amount', 'error'); return; } try { await api.post('/bookings/' + booking.id + '/payments', { type: f.type, amount: Number(f.amount), method: f.method, reference: f.reference }); toast('Payment recorded — receipt issued', 'success'); m.close(); refresh(); } catch (e) { toast(e.message, 'error'); } });
  }

  // ===== Collections dashboard page (Section P) =====
  CRM.pages.collections = async function (view) {
    CRM.setActions(null);
    const d = await api.get('/collections');
    view.innerHTML = '';
    const card = (label, val, color) => el('div', { class: 'card', style: 'padding:16px;flex:1' }, el('div', { style: 'font-size:12px;color:var(--text-3)' }, label), el('div', { style: 'font-size:22px;font-weight:700;margin-top:4px;color:' + (color || 'var(--text-1)') }, money(val)));
    view.appendChild(el('div', { style: 'display:flex;gap:14px;margin-bottom:18px', 'data-testid': 'collections-cards' },
      card('Collected', d.collected, 'var(--won)'), card('Scheduled', d.scheduled), card('Outstanding', d.outstanding, 'var(--warm)')));
    view.appendChild(el('div', { class: 'section-title' }, 'Aging'));
    const ag = d.aging || {};
    view.appendChild(el('div', { style: 'display:flex;gap:12px;margin-bottom:18px', 'data-testid': 'aging-buckets' },
      ...[['Current', 'current'], ['0–30d', '0_30'], ['31–60d', '31_60'], ['61–90d', '61_90'], ['90d+', '90_plus']].map(([l, k]) =>
        el('div', { class: 'card', style: 'padding:12px;flex:1;text-align:center' }, el('div', { style: 'font-size:11px;color:var(--text-3)' }, l), el('div', { style: 'font-weight:600;margin-top:4px' }, money(ag[k] || 0))))));
    view.appendChild(el('div', { class: 'section-title' }, 'Overdue milestones'));
    if (!(d.overdue_milestones || []).length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-circle-check' }), el('div', {}, 'Nothing overdue'))); return; }
    const tbody = el('tbody', { 'data-testid': 'collections-overdue' });
    d.overdue_milestones.forEach(m => tbody.appendChild(el('tr', {}, el('td', { class: 'mono' }, m.booking_ref || '—'), el('td', {}, m.label), el('td', {}, money(m.outstanding)), el('td', {}, m.days_overdue + 'd'))));
    view.appendChild(el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Booking'), el('th', {}, 'Milestone'), el('th', {}, 'Outstanding'), el('th', {}, 'Overdue'))), tbody)));
  };

  // ===== Demand letters page (Section Q) =====
  CRM.pages.demands = async function (view) {
    CRM.setActions(null);
    const res = await api.get('/demand-letters');
    view.innerHTML = '';
    if (!res.data.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-file-invoice-dollar' }), el('div', {}, 'No demand letters yet'))); return; }
    const colors = { issued: 'var(--warm)', paid: 'var(--won)', escalated: 'var(--hot)' };
    const tbody = el('tbody', { 'data-testid': 'demands-tbody' });
    res.data.forEach(d => tbody.appendChild(el('tr', { 'data-testid': 'demand-row-' + d.id, onclick: () => d.lead && (location.hash = '#/leads/' + d.lead.id) },
      el('td', { class: 'mono' }, d.serial_no),
      el('td', {}, d.lead ? d.lead.name : '—'),
      el('td', {}, d.booking ? d.booking.booking_ref : '—'),
      el('td', {}, money(d.total_due)),
      el('td', {}, d.days_overdue + 'd'),
      el('td', {}, el('span', { class: 'chip', style: 'color:' + (colors[d.status] || 'var(--text-2)') }, d.status)))));
    view.appendChild(el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Ref'), el('th', {}, 'Customer'), el('th', {}, 'Booking'), el('th', {}, 'Total Due'), el('th', {}, 'Overdue'), el('th', {}, 'Status'))), tbody)));
  };

  // ===== SLA Heat-Board (manager) =====
  CRM.pages.slaBoard = async function (view) {
    CRM.setActions(null);
    view.innerHTML = '<div class="spinner"></div>';
    const d = await api.get('/tasks/sla-board');
    view.innerHTML = '';
    const colors = { breached: 'var(--hot)', red: '#ff6b57', amber: 'var(--warm)', green: 'var(--won)' };
    const labels = { breached: 'Breached', red: '< 1 hour', amber: '1–4 hours', green: 'On track' };
    view.appendChild(el('div', { class: 'cards', style: 'margin-bottom:20px', 'data-testid': 'sla-cards' },
      ...['breached', 'red', 'amber', 'green'].map(k => el('div', { class: 'card stat', 'data-testid': 'sla-count-' + k },
        el('div', { class: 'k', style: 'color:' + colors[k] }, labels[k]),
        el('div', { class: 'v', style: 'color:' + colors[k] }, String(d.counts[k] || 0))))));

    if (!d.tasks.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-mug-hot' }), el('div', {}, 'No open tasks — all clear'))); return; }

    const fmt = (m) => { const a = Math.abs(m); const h = Math.floor(a / 60), mm = a % 60; const s = (h ? h + 'h ' : '') + mm + 'm'; return m < 0 ? '-' + s : s; };
    const tbody = el('tbody', { 'data-testid': 'sla-tbody' });
    d.tasks.forEach(t => {
      const sel = el('select', { class: 'select', style: 'width:auto;min-width:130px', 'data-testid': 'sla-reassign-' + t.id },
        ...d.users.map(u => el('option', { value: u.id, selected: t.assignee && t.assignee.id === u.id ? 'selected' : null }, u.name)));
      sel.addEventListener('change', async () => { try { await api.put('/tasks/' + t.id, { assigned_to: Number(sel.value) }); toast('Reassigned', 'success'); } catch (e) { toast(e.message, 'error'); } });
      tbody.appendChild(el('tr', { 'data-testid': 'sla-row-' + t.id, style: 'border-left:3px solid ' + colors[t.bucket] },
        el('td', {}, el('span', { class: 'chip', style: 'color:' + colors[t.bucket] }, labels[t.bucket]), t.escalated ? el('i', { class: 'fa-solid fa-fire', style: 'color:var(--hot);margin-left:6px' }) : null),
        el('td', {}, t.title),
        el('td', {}, t.lead ? el('a', { href: '#/leads/' + t.lead.id, style: 'color:var(--accent)' }, t.lead.name) : '—'),
        el('td', { style: 'font-weight:600;color:' + colors[t.bucket] }, fmt(t.minutes_to_breach)),
        el('td', {}, sel)));
    });
    view.appendChild(el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {},
      el('th', {}, 'SLA'), el('th', {}, 'Task'), el('th', {}, 'Lead'), el('th', {}, 'Time to breach'), el('th', {}, 'Assignee'))), tbody)));
  };

  // ===== Bookings page =====
  CRM.pages.bookings = async function (view) {
    CRM.setActions(null);
    const res = await api.get('/bookings');
    view.innerHTML = '';
    if (!res.data.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-file-contract' }), el('div', {}, 'No bookings yet'))); return; }
    const tbody = el('tbody', { 'data-testid': 'bookings-tbody' });
    res.data.forEach(b => {
      const statusColor = { initiated: 'var(--text-3)', form_sent: 'var(--accent)', form_submitted: 'var(--warm)', verified: 'var(--accent)', confirmed: 'var(--won)', cancelled: 'var(--hot)' }[b.status] || 'var(--text-2)';
      tbody.appendChild(el('tr', { 'data-testid': 'booking-row-' + b.id, onclick: () => b.lead && (location.hash = '#/leads/' + b.lead.id) },
        el('td', { class: 'mono' }, b.booking_ref),
        el('td', {}, b.lead ? b.lead.name : '—'),
        el('td', {}, b.project ? b.project.name : '—', b.plot ? el('div', { style: 'font-size:12px;color:var(--text-3)' }, 'Unit ' + b.plot.number) : null),
        el('td', {}, money(b.deal_value)),
        el('td', {}, money(b.token_amount) + ' · ' + b.token_status),
        el('td', {}, el('span', { class: 'chip', style: 'color:' + statusColor }, CRM.stageName(b.status)))));
    });
    view.appendChild(el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Ref'), el('th', {}, 'Customer'), el('th', {}, 'Project / Unit'), el('th', {}, 'Deal Value'), el('th', {}, 'Token'), el('th', {}, 'Status'))), tbody)));
  };
})();
