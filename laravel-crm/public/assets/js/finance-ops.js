// ---- Finance & Operations: Expenses, Stock Book, Revenue Overview ----
(function () {
  const { el, api, toast, modal, can, money } = CRM;

  function tableWrap(headers, rows) {
    return el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, ...headers.map(h => el('th', {}, h)))),
      el('tbody', {}, ...rows)));
  }
  function stat(k, v, color) {
    return el('div', { class: 'card stat' }, el('div', { class: 'k' }, k), el('div', { class: 'v mono', style: color ? ('color:' + color) : '' }, v));
  }
  const EXP_STATUS = {
    pending_accounts: ['Pending — Accounts', 'var(--warm, #d9a441)'],
    pending_management: ['Pending — Management', 'var(--accent, #2f7d8c)'],
    approved: ['Approved', 'var(--won, #4a8f3c)'],
    rejected: ['Rejected', 'var(--hot, #c0433c)'],
  };
  function expPill(s) {
    const [label, color] = EXP_STATUS[s] || [s, 'var(--text-2)'];
    return el('span', { class: 'stage-pill', style: 'background:' + color + '22;color:' + color + ';border:1px solid ' + color + '55' }, label);
  }

  async function projectOptions(selectedId) {
    const projects = await api.get('/projects').then(r => r.data).catch(() => []);
    return { projects, node: (testid) => el('select', { class: 'select', 'data-testid': testid },
      el('option', { value: '' }, 'All projects'),
      ...projects.map(p => el('option', { value: p.id, selected: String(selectedId) === String(p.id) ? 'selected' : null }, p.name))) };
  }

  // ==================== EXPENSES ====================
  CRM.pages.expenses = async function (view) {
    CRM.setTitle('Site Expenses');
    let statusFilter = '';
    const actions = el('div', { style: 'display:flex;gap:8px' });
    if (can('expenses.raise')) actions.appendChild(el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'raise-expense', onclick: () => expenseForm() }, el('i', { class: 'fa-solid fa-plus' }), 'Raise Expense'));
    CRM.setActions(actions);

    async function load() {
      const [sum, list] = await Promise.all([
        api.get('/expenses/summary').catch(() => ({ counts: {}, approved_amount: 0, pending_amount: 0 })),
        api.get('/expenses' + (statusFilter ? '?status=' + statusFilter : '')).then(r => r.data),
      ]);
      view.innerHTML = '';
      view.appendChild(el('div', { class: 'cards', style: 'margin-bottom:16px', 'data-testid': 'expense-stats' },
        stat('Pending Accounts', String(sum.counts.pending_accounts || 0), 'var(--warm,#d9a441)'),
        stat('Pending Management', String(sum.counts.pending_management || 0), 'var(--accent,#2f7d8c)'),
        stat('Approved', String(sum.counts.approved || 0), 'var(--won,#4a8f3c)'),
        stat('Approved ₹', money(sum.approved_amount || 0)),
        stat('Pending ₹', money(sum.pending_amount || 0))));

      const filterBar = el('div', { style: 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap' },
        ...[['', 'All'], ['pending_accounts', 'Pending Accounts'], ['pending_management', 'Pending Management'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([v, l]) =>
          el('button', { class: 'btn btn--sm ' + (statusFilter === v ? 'btn--primary' : 'btn--ghost'), 'data-testid': 'exp-filter-' + (v || 'all'), onclick: () => { statusFilter = v; load(); } }, l)));
      view.appendChild(filterBar);

      if (!list.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-receipt' }), el('div', {}, 'No expenses yet'))); return; }
      view.appendChild(tableWrap(['Title', 'Project', 'Category', 'Amount', 'Status', 'Raised by', ''], list.map(e =>
        el('tr', { 'data-testid': 'expense-row-' + e.id },
          el('td', {}, el('b', {}, e.title), e.vendor ? el('div', { style: 'font-size:12px;color:var(--text-3)' }, e.vendor) : null),
          el('td', {}, e.project ? e.project.name : '—'),
          el('td', {}, el('span', { class: 'chip' }, e.category)),
          el('td', { class: 'mono' }, money(e.amount)),
          el('td', {}, expPill(e.status)),
          el('td', {}, e.raised_by ? (e.raised_by.name || '—') : '—'),
          el('td', { style: 'text-align:right;white-space:nowrap' }, ...rowActions(e))))));
    }

    function rowActions(e) {
      const btns = [];
      if (e.status === 'rejected' && e.rejection_reason) btns.push(el('span', { class: 'chip', title: e.rejection_reason, style: 'color:var(--hot,#c0433c)' }, 'Reason'));
      if (e.status === 'pending_accounts' && can('expenses.approve')) {
        btns.push(el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'exp-approve-acc-' + e.id, onclick: () => act('/expenses/' + e.id + '/approve-accounts') }, 'Approve'));
      }
      if (e.status === 'pending_management' && can('expenses.approve_final')) {
        btns.push(el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'exp-approve-mgmt-' + e.id, onclick: () => act('/expenses/' + e.id + '/approve-management') }, 'Final Approve'));
      }
      if (['pending_accounts', 'pending_management'].includes(e.status) && (can('expenses.approve') || can('expenses.approve_final'))) {
        btns.push(el('button', { class: 'btn btn--sm btn--ghost', 'data-testid': 'exp-reject-' + e.id, onclick: () => rejectForm(e) }, el('i', { class: 'fa-solid fa-xmark' })));
      }
      return btns;
    }

    async function act(url) {
      try { await api.post(url); toast('Done', 'success'); load(); }
      catch (err) { toast(err.message || 'Action failed', 'error'); }
    }

    function rejectForm(e) {
      let reason = '';
      const ta = el('textarea', { class: 'input', rows: '3', placeholder: 'Reason for rejection (required)', 'data-testid': 'exp-reject-reason' });
      ta.addEventListener('input', () => reason = ta.value);
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'exp-reject-save' }, 'Reject expense');
      const m = modal({ title: 'Reject — ' + e.title, bodyNode: el('div', { class: 'field' }, el('label', {}, 'Reason'), ta), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!reason.trim()) { toast('A reason is required', 'error'); return; }
        try { await api.post('/expenses/' + e.id + '/reject', { reason }); toast('Rejected', 'success'); m.close(); load(); }
        catch (err) { toast(err.message, 'error'); }
      });
    }

    async function expenseForm() {
      const { projects } = await projectOptions();
      const f = { category: 'material' };
      const inp = (k, ph, type = 'text') => { const i = el('input', { class: 'input', type, placeholder: ph, 'data-testid': 'exp-' + k }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const projSel = el('select', { class: 'select', 'data-testid': 'exp-project' }, el('option', { value: '' }, 'Select project…'), ...projects.map(p => el('option', { value: p.id }, p.name)));
      projSel.addEventListener('change', () => f.project_id = projSel.value);
      const catSel = el('select', { class: 'select', 'data-testid': 'exp-category' }, ...['material', 'labour', 'equipment', 'transport', 'utilities', 'other'].map(c => el('option', { value: c }, c)));
      catSel.addEventListener('change', () => f.category = catSel.value);
      const body = el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Project'), projSel),
        el('div', { class: 'field' }, el('label', {}, 'Title'), inp('title', 'e.g. Cement — 200 bags')),
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Category'), catSel), el('div', { class: 'field' }, el('label', {}, 'Vendor'), inp('vendor', 'Supplier name'))),
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Amount (₹)'), inp('amount', '0', 'number')), el('div', { class: 'field' }, el('label', {}, 'Incurred on'), inp('incurred_on', '', 'date'))),
        el('div', { class: 'field' }, el('label', {}, 'Description'), inp('description', 'Notes (optional)')),
        el('div', { class: 'help' }, 'Every expense goes through Accounts approval, then Management final approval.'));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'exp-save' }, 'Submit for approval');
      const m = modal({ title: 'Raise Expense', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!f.project_id || !f.title || !f.amount) { toast('Project, title and amount are required', 'error'); return; }
        try { await api.post('/expenses', { project_id: Number(f.project_id), title: f.title, category: f.category, vendor: f.vendor, amount: Number(f.amount), incurred_on: f.incurred_on || null, description: f.description }); toast('Expense submitted', 'success'); m.close(); load(); }
        catch (err) { toast(err.message, 'error'); }
      });
    }

    await load();
  };

  // ==================== STOCK BOOK ====================
  CRM.pages.stockBook = async function (view) {
    CRM.setTitle('Stock Book');
    const actions = el('div', { style: 'display:flex;gap:8px' });
    if (can('stock.manage')) actions.appendChild(el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'add-material', onclick: () => itemForm() }, el('i', { class: 'fa-solid fa-plus' }), 'Add Material'));
    CRM.setActions(actions);

    async function load() {
      const items = await api.get('/stock/items').then(r => r.data);
      view.innerHTML = '';
      view.appendChild(el('p', { style: 'color:var(--text-2);margin-bottom:16px' }, 'Per-project material ledger. Closing = Opening + Inward − Outward. Inward deliveries must reference an approved expense.'));
      if (!items.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-boxes-stacked' }), el('div', {}, 'No materials tracked yet'))); return; }
      view.appendChild(tableWrap(['Material', 'Project', 'Unit', 'Opening', 'Inward', 'Outward', 'Closing', ''], items.map(it =>
        el('tr', { 'data-testid': 'stock-row-' + it.id },
          el('td', {}, el('b', {}, it.name)),
          el('td', {}, it.project || '—'),
          el('td', {}, el('span', { class: 'chip' }, it.unit)),
          el('td', { class: 'mono' }, String(it.opening_qty)),
          el('td', { class: 'mono', style: 'color:var(--won,#4a8f3c)' }, '+' + it.inward),
          el('td', { class: 'mono', style: 'color:var(--hot,#c0433c)' }, '−' + it.outward),
          el('td', { class: 'mono' }, el('b', {}, String(it.closing_qty))),
          el('td', { style: 'text-align:right' }, el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'stock-moves-' + it.id, onclick: () => movementsView(it) }, el('i', { class: 'fa-solid fa-right-left' }), 'Ledger'))))));
    }

    async function itemForm() {
      const { projects } = await projectOptions();
      const f = { unit: 'nos', opening_qty: 0 };
      const inp = (k, ph, type = 'text') => { const i = el('input', { class: 'input', type, placeholder: ph, value: f[k] ?? '', 'data-testid': 'si-' + k }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const projSel = el('select', { class: 'select', 'data-testid': 'si-project' }, el('option', { value: '' }, 'Select project…'), ...projects.map(p => el('option', { value: p.id }, p.name)));
      projSel.addEventListener('change', () => f.project_id = projSel.value);
      const unitSel = el('select', { class: 'select', 'data-testid': 'si-unit' }, ...['nos', 'bag', 'kg', 'ton', 'cum', 'litre'].map(u => el('option', { value: u }, u)));
      unitSel.addEventListener('change', () => f.unit = unitSel.value);
      const body = el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Project'), projSel),
        el('div', { class: 'field' }, el('label', {}, 'Material name'), inp('name', 'e.g. Cement (OPC 53)')),
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Unit'), unitSel), el('div', { class: 'field' }, el('label', {}, 'Opening qty'), inp('opening_qty', '0', 'number'))));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'si-save' }, 'Add material');
      const m = modal({ title: 'Add Material', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!f.project_id || !f.name) { toast('Project and name are required', 'error'); return; }
        try { await api.post('/stock/items', { project_id: Number(f.project_id), name: f.name, unit: f.unit, opening_qty: Number(f.opening_qty) || 0 }); toast('Material added', 'success'); m.close(); load(); }
        catch (err) { toast(err.message, 'error'); }
      });
    }

    async function movementsView(item) {
      const moves = await api.get('/stock/items/' + item.id + '/movements').then(r => r.data).catch(() => []);
      const rows = moves.length ? moves.map(mv => el('tr', {},
        el('td', {}, mv.direction === 'inward' ? el('span', { style: 'color:var(--won,#4a8f3c)' }, '↓ Inward') : el('span', { style: 'color:var(--hot,#c0433c)' }, '↑ Outward')),
        el('td', { class: 'mono' }, String(mv.qty)),
        el('td', {}, mv.expense ? el('span', { class: 'chip', title: money(mv.expense.amount) }, mv.expense.title) : (mv.note || '—')),
        el('td', {}, mv.moved_on || (mv.created_at ? mv.created_at.slice(0, 10) : '')))) : [el('tr', {}, el('td', { colspan: '4', style: 'color:var(--text-3)' }, 'No movements yet'))];
      const table = tableWrap(['Type', 'Qty', 'Expense / Note', 'Date'], rows);
      const foot = [el('button', { class: 'btn', onclick: () => m.close() }, 'Close')];
      if (can('stock.manage')) foot.unshift(el('button', { class: 'btn btn--primary', 'data-testid': 'add-movement', onclick: () => { m.close(); movementForm(item); } }, el('i', { class: 'fa-solid fa-plus' }), 'Add Movement'));
      const m = modal({ title: 'Ledger — ' + item.name, bodyNode: table, footNodes: foot });
    }

    async function movementForm(item) {
      const approved = await api.get('/stock/approved-expenses?project_id=' + item.project_id).then(r => r.data).catch(() => []);
      const f = { direction: 'inward' };
      const dirSel = el('select', { class: 'select', 'data-testid': 'mv-direction' }, el('option', { value: 'inward' }, 'Inward (delivery)'), el('option', { value: 'outward' }, 'Outward (consumed)'));
      const expWrap = el('div', { class: 'field' });
      const expSel = el('select', { class: 'select', 'data-testid': 'mv-expense' }, el('option', { value: '' }, approved.length ? 'Select approved expense…' : 'No approved expenses for this project'), ...approved.map(e => el('option', { value: e.id }, e.title + ' — ' + money(e.amount))));
      expSel.addEventListener('change', () => f.expense_id = expSel.value);
      function drawExp() { expWrap.innerHTML = ''; if (f.direction === 'inward') { expWrap.appendChild(el('label', {}, 'Approved expense (required)')); expWrap.appendChild(expSel); } }
      dirSel.addEventListener('change', () => { f.direction = dirSel.value; drawExp(); });
      const qty = el('input', { class: 'input', type: 'number', placeholder: '0', 'data-testid': 'mv-qty' }); qty.addEventListener('input', () => f.qty = qty.value);
      const note = el('input', { class: 'input', placeholder: 'Note (optional)', 'data-testid': 'mv-note' }); note.addEventListener('input', () => f.note = note.value);
      const moved = el('input', { class: 'input', type: 'date', 'data-testid': 'mv-date' }); moved.addEventListener('input', () => f.moved_on = moved.value);
      const body = el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Direction'), dirSel),
        expWrap,
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Quantity (' + item.unit + ')'), qty), el('div', { class: 'field' }, el('label', {}, 'Date'), moved)),
        el('div', { class: 'field' }, el('label', {}, 'Note'), note));
      drawExp();
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'mv-save' }, 'Save movement');
      const m = modal({ title: 'Stock Movement — ' + item.name, bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!f.qty || Number(f.qty) <= 0) { toast('Enter a quantity', 'error'); return; }
        if (f.direction === 'inward' && !f.expense_id) { toast('Inward stock needs an approved expense', 'error'); return; }
        try { await api.post('/stock/items/' + item.id + '/movements', { direction: f.direction, qty: Number(f.qty), expense_id: f.direction === 'inward' ? Number(f.expense_id) : null, note: f.note, moved_on: f.moved_on || null }); toast('Movement recorded', 'success'); m.close(); load(); }
        catch (err) { toast(err.message, 'error'); }
      });
    }

    await load();
  };

  // ==================== REVENUE OVERVIEW ====================
  CRM.pages.finance = async function (view) {
    CRM.setTitle('Revenue Overview');
    let period = new Date().toISOString().slice(0, 7); // YYYY-MM

    async function load() {
      const data = await api.get('/finance/overview?period=' + period + '&period_type=month');
      view.innerHTML = '';

      const monthInput = el('input', { class: 'input', type: 'month', value: period, 'data-testid': 'finance-period', style: 'max-width:180px' });
      monthInput.addEventListener('change', () => { period = monthInput.value; load(); });
      view.appendChild(el('div', { style: 'display:flex;align-items:center;gap:12px;margin-bottom:16px;flex-wrap:wrap' },
        el('span', { style: 'color:var(--text-2)' }, 'Target period:'), monthInput,
        can('finance.overview') ? el('button', { class: 'btn btn--sm btn--ghost', 'data-testid': 'set-target', onclick: () => targetForm() }, el('i', { class: 'fa-solid fa-bullseye' }), 'Set Targets') : null));

      const t = data.totals;
      view.appendChild(el('div', { class: 'cards', style: 'margin-bottom:16px', 'data-testid': 'finance-stats' },
        stat('Accrued (booked)', money(t.accrued)),
        stat('Received', money(t.received), 'var(--won,#4a8f3c)'),
        stat('Receivable', money(t.receivable), 'var(--warm,#d9a441)'),
        stat('Approved Expenses', money(t.expenses), 'var(--hot,#c0433c)'),
        stat('Net (Received − Exp)', money(t.net))));

      view.appendChild(el('div', { class: 'section-title' }, el('i', { class: 'fa-solid fa-building-columns' }), 'Per-Project — ' + period));
      view.appendChild(tableWrap(['Project', 'Bookings', 'Accrued', 'Received', 'Receivable', 'Expenses', 'Net', 'Target (mo)', 'Recv (mo)', 'Variance'], data.rows.map(r =>
        el('tr', { 'data-testid': 'finance-row-' + r.project_id },
          el('td', {}, el('b', {}, r.project), el('div', { style: 'font-size:12px;color:var(--text-3)' }, r.code)),
          el('td', { class: 'mono' }, String(r.bookings)),
          el('td', { class: 'mono' }, money(r.accrued)),
          el('td', { class: 'mono', style: 'color:var(--won,#4a8f3c)' }, money(r.received)),
          el('td', { class: 'mono', style: 'color:var(--warm,#d9a441)' }, money(r.receivable)),
          el('td', { class: 'mono', style: 'color:var(--hot,#c0433c)' }, money(r.expenses)),
          el('td', { class: 'mono' }, money(r.net)),
          el('td', { class: 'mono' }, money(r.target)),
          el('td', { class: 'mono' }, money(r.period_received)),
          el('td', { class: 'mono', style: 'color:' + (r.variance >= 0 ? 'var(--won,#4a8f3c)' : 'var(--hot,#c0433c)') }, (r.variance >= 0 ? '+' : '') + money(r.variance))))));
    }

    async function targetForm() {
      const { projects } = await projectOptions();
      const f = { period_type: 'month', period };
      const projSel = el('select', { class: 'select', 'data-testid': 'tgt-project' }, ...projects.map(p => el('option', { value: p.id }, p.name)));
      f.project_id = projects[0] && projects[0].id;
      projSel.addEventListener('change', () => f.project_id = projSel.value);
      const per = el('input', { class: 'input', type: 'month', value: period, 'data-testid': 'tgt-period' }); per.addEventListener('input', () => f.period = per.value);
      const amt = el('input', { class: 'input', type: 'number', placeholder: '0', 'data-testid': 'tgt-amount' }); amt.addEventListener('input', () => f.amount = amt.value);
      const body = el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Project'), projSel),
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Month'), per), el('div', { class: 'field' }, el('label', {}, 'Target (₹)'), amt)));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'tgt-save' }, 'Save target');
      const m = modal({ title: 'Set Monthly Target', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!f.project_id || !f.amount) { toast('Project and amount required', 'error'); return; }
        try { await api.post('/finance/targets', { project_id: Number(f.project_id), period_type: 'month', period: f.period, amount: Number(f.amount) }); toast('Target saved', 'success'); m.close(); load(); }
        catch (err) { toast(err.message, 'error'); }
      });
    }

    await load();
  };
})();
