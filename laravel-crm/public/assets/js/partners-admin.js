// ---- Channel Partner admin management (Partner Onboarding, Leads, Documents, Support) ----
(function () {
  const { el, api, toast, modal, money } = CRM;

  function tableWrap(headers, rows) {
    return el('div', { class: 'table-wrap' }, el('table', {}, el('thead', {}, el('tr', {}, ...headers.map(h => el('th', {}, h)))), el('tbody', {}, ...rows)));
  }
  function pill(text, color) { return el('span', { class: 'stage-pill', style: 'background:' + color + '22;color:' + color + ';border:1px solid ' + color + '55' }, text); }
  const CP_STATUS = { pending: '#d9a441', approved: '#4a8f3c', suspended: '#c0433c' };
  const LEAD_STATUS = { new: '#2f7d8c', contacted: '#d9a441', qualified: '#4a8f3c', converted: '#0d5c4a', rejected: '#c0433c', lost: '#7c8b93' };
  const TICKET_STATUS = { open: '#2f7d8c', in_progress: '#d9a441', resolved: '#4a8f3c', closed: '#7c8b93' };

  // ============ Partner Onboarding ============
  CRM.pages.cpPartners = async function (view) {
    CRM.setTitle('Partner Onboarding');
    CRM.setActions(el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'cp-invite', onclick: inviteForm }, el('i', { class: 'fa-solid fa-user-plus' }), 'Invite Partner'));
    async function load() {
      const r = await api.get('/admin/partners');
      view.innerHTML = '';
      view.appendChild(el('p', { style: 'color:var(--text-2);margin-bottom:16px' }, 'Invite channel partners (credentials are emailed), review KYC and control portal access.'));
      view.appendChild(tableWrap(['Partner', 'Code', 'Contact', 'Leads', 'KYC', 'Status', ''], (r.data || []).map(p =>
        el('tr', { 'data-testid': 'cp-partner-' + p.id },
          el('td', {}, el('b', {}, p.name), p.company ? el('div', { style: 'font-size:12px;color:var(--text-3)' }, p.company) : null),
          el('td', { class: 'mono' }, p.cp_code || '—'),
          el('td', {}, p.contact_name || '—', p.contact_email ? el('div', { style: 'font-size:12px;color:var(--text-3)' }, p.contact_email) : null),
          el('td', { class: 'mono' }, String(p.cp_leads_count || 0)),
          el('td', {}, p.kyc_status === 'approved' ? pill('Approved', '#4a8f3c') : (p.kyc_status === 'submitted' ? pill('Review', '#d9a441') : el('span', { style: 'color:var(--text-3)' }, p.kyc_status || 'incomplete'))),
          el('td', {}, pill(p.status, CP_STATUS[p.status] || '#7c8b93')),
          el('td', { style: 'text-align:right;white-space:nowrap' },
            p.kyc_status === 'submitted' ? el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'cp-approve-kyc-' + p.id, onclick: () => act('/admin/partners/' + p.id + '/approve-kyc', 'KYC approved') }, 'Approve KYC') : null,
            p.status !== 'approved' ? el('button', { class: 'btn btn--sm btn--ghost', 'data-testid': 'cp-approve-' + p.id, onclick: () => setStatus(p, 'approved') }, 'Approve') : el('button', { class: 'btn btn--sm btn--ghost', 'data-testid': 'cp-suspend-' + p.id, onclick: () => setStatus(p, 'suspended') }, 'Suspend')))))); 
    }
    async function act(url, msg) { try { await api.post(url); toast(msg, 'success'); load(); } catch (e) { toast(e.message, 'error'); } }
    async function setStatus(p, status) { try { await api.put('/admin/partners/' + p.id + '/status', { status }); toast('Status updated', 'success'); load(); } catch (e) { toast(e.message, 'error'); } }
    function inviteForm() {
      const f = {};
      const inp = (k, ph, type) => { const i = el('input', { class: 'input', type: type || 'text', placeholder: ph, 'data-testid': 'cpi-' + k }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const body = el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Partner / company name *'), inp('name', 'e.g. Skyline Realtors')),
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Contact person *'), inp('contact_name', 'Full name')), el('div', { class: 'field' }, el('label', {}, 'Designation'), inp('contact_designation', 'e.g. Director'))),
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Contact email *'), inp('contact_email', 'partner@company.com', 'email')), el('div', { class: 'field' }, el('label', {}, 'Phone'), inp('phone', 'Mobile'))),
        el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Company (legal)'), inp('company', 'Legal entity')), el('div', { class: 'field' }, el('label', {}, 'Commission %'), inp('commission_rate', '2.5', 'number'))),
        el('div', { class: 'help' }, 'A Partner ID + temporary password are generated and emailed. The partner logs in at /partner and completes KYC.'));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'cpi-save' }, 'Send invite');
      const m = modal({ title: 'Invite Channel Partner', bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!f.name || !f.contact_name || !f.contact_email) { toast('Name, contact and email are required', 'error'); return; }
        try { const r = await api.post('/admin/partners/invite', f); toast('Invited ' + r.partner.cp_code + ' — temp password: ' + r.temp_password, 'success'); m.close(); load(); }
        catch (e) { toast(e.message, 'error'); }
      });
    }
    await load();
  };

  // ============ Partner Leads ============
  CRM.pages.cpLeadsAdmin = async function (view) {
    CRM.setTitle('Partner Leads');
    let status = '';
    async function load() {
      const r = await api.get('/admin/cp-leads' + (status ? '?status=' + status : ''));
      view.innerHTML = '';
      view.appendChild(el('p', { style: 'color:var(--text-2);margin-bottom:12px' }, 'Leads submitted by channel partners. Accept a lead to push it into the main CRM pipeline (routing & scoring apply), or reject with a reason.'));
      view.appendChild(el('div', { style: 'display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap' },
        ...[['', 'All'], ['new', 'New'], ['contacted', 'Contacted'], ['qualified', 'Qualified'], ['converted', 'In CRM'], ['rejected', 'Rejected']].map(([v, l]) =>
          el('button', { class: 'btn btn--sm ' + (status === v ? 'btn--primary' : 'btn--ghost'), 'data-testid': 'cpl-filter-' + (v || 'all'), onclick: () => { status = v; load(); } }, l))));
      const rows = (r.data || []);
      view.appendChild(tableWrap(['Customer', 'Partner', 'Rep', 'Interest', 'Status', ''], rows.map(l =>
        el('tr', { 'data-testid': 'cpl-row-' + l.id },
          el('td', {}, el('b', {}, l.customer_name), el('div', { style: 'font-size:12px;color:var(--text-3)' }, l.phone + (l.email ? ' · ' + l.email : ''))),
          el('td', {}, l.partner ? l.partner.name : '—', el('div', { style: 'font-size:12px;color:var(--text-3)' }, l.partner ? l.partner.cp_code : '')),
          el('td', {}, l.representative ? l.representative.name : '—'),
          el('td', {}, l.plot_type ? el('span', { class: 'chip' }, l.plot_type) : '—'),
          el('td', {}, pill(l.status, LEAD_STATUS[l.status] || '#7c8b93'), l.converted_lead ? el('div', { style: 'font-size:11px;color:var(--text-3);margin-top:2px' }, 'CRM #' + l.converted_lead.id) : null),
          el('td', { style: 'text-align:right;white-space:nowrap' },
            (l.status !== 'converted' && l.status !== 'rejected') ? el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'cpl-accept-' + l.id, onclick: () => accept(l) }, 'Accept into CRM') : null,
            (l.status !== 'converted' && l.status !== 'rejected') ? el('button', { class: 'btn btn--sm btn--ghost', 'data-testid': 'cpl-reject-' + l.id, onclick: () => rejectForm(l) }, 'Reject') : null))))); 
    }
    async function accept(l) { try { await api.post('/admin/cp-leads/' + l.id + '/accept'); toast('Lead accepted into CRM', 'success'); load(); } catch (e) { toast(e.message, 'error'); } }
    function rejectForm(l) {
      const ta = el('textarea', { class: 'input', rows: '3', placeholder: 'Reason for rejection (required)', 'data-testid': 'cpl-reject-reason' });
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'cpl-reject-save' }, 'Reject lead');
      const m = modal({ title: 'Reject — ' + l.customer_name, bodyNode: el('div', { class: 'field' }, el('label', {}, 'Reason'), ta), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => { if (!ta.value.trim()) { toast('A reason is required', 'error'); return; } try { await api.post('/admin/cp-leads/' + l.id + '/reject', { reason: ta.value }); toast('Rejected', 'success'); m.close(); load(); } catch (e) { toast(e.message, 'error'); } });
    }
    await load();
  };

  // ============ Partner Documents ============
  CRM.pages.cpDocs = async function (view) {
    CRM.setTitle('Partner Documents');
    CRM.setActions(el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'cpd-upload', onclick: uploadForm }, el('i', { class: 'fa-solid fa-upload' }), 'Upload Document'));
    async function load() {
      const r = await api.get('/admin/cp-documents');
      view.innerHTML = '';
      view.appendChild(el('p', { style: 'color:var(--text-2);margin-bottom:16px' }, 'Brochures & price lists visible to all active partners in their portal.'));
      view.appendChild(tableWrap(['Title', 'Category', 'Link', ''], (r.data || []).map(d =>
        el('tr', { 'data-testid': 'cpd-row-' + d.id },
          el('td', {}, el('b', {}, d.title)),
          el('td', {}, el('span', { class: 'chip' }, d.category || 'General')),
          el('td', {}, el('a', { href: d.file_path, target: '_blank' }, 'View')),
          el('td', { style: 'text-align:right' }, el('button', { class: 'btn btn--sm btn--ghost', 'data-testid': 'cpd-del-' + d.id, onclick: async () => { try { await api.del('/admin/cp-documents/' + d.id); toast('Deleted', 'success'); load(); } catch (e) { toast(e.message, 'error'); } } }, el('i', { class: 'fa-solid fa-trash' })))))));
    }
    function uploadForm() {
      let file = null; const f = {};
      const titleI = el('input', { class: 'input', placeholder: 'Document title', 'data-testid': 'cpd-title' }); titleI.addEventListener('input', () => f.title = titleI.value);
      const catI = el('input', { class: 'input', placeholder: 'e.g. Price List', 'data-testid': 'cpd-category' }); catI.addEventListener('input', () => f.category = catI.value);
      const fileI = el('input', { type: 'file', class: 'input', 'data-testid': 'cpd-file' }); fileI.addEventListener('change', () => file = fileI.files[0]);
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'cpd-save' }, 'Upload');
      const m = modal({ title: 'Upload partner document', bodyNode: el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Title *'), titleI), el('div', { class: 'field' }, el('label', {}, 'Category'), catI), el('div', { class: 'field' }, el('label', {}, 'File *'), fileI)), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!f.title || !file) { toast('Title and file are required', 'error'); return; }
        const fd = new FormData(); fd.append('title', f.title); if (f.category) fd.append('category', f.category); fd.append('file', file);
        try { await api.post('/admin/cp-documents', fd); toast('Uploaded', 'success'); m.close(); load(); } catch (e) { toast(e.message, 'error'); }
      });
    }
    await load();
  };

  // ============ Partner Support ============
  CRM.pages.cpTicketsAdmin = async function (view) {
    CRM.setTitle('Partner Support');
    async function load() {
      const r = await api.get('/admin/cp-tickets');
      view.innerHTML = '';
      view.appendChild(tableWrap(['Subject', 'Partner', 'Priority', 'Status', 'Msgs', ''], (r.data || []).map(t =>
        el('tr', { 'data-testid': 'cpt-row-' + t.id },
          el('td', {}, el('b', {}, t.subject)),
          el('td', {}, t.partner ? t.partner.name : '—'),
          el('td', {}, el('span', { class: 'chip' }, t.priority)),
          el('td', {}, pill(t.status.replace('_', ' '), TICKET_STATUS[t.status] || '#7c8b93')),
          el('td', { class: 'mono' }, String(t.messages_count)),
          el('td', { style: 'text-align:right' }, el('button', { class: 'btn btn--sm btn--ghost', 'data-testid': 'cpt-open-' + t.id, onclick: () => openTicket(t.id) }, 'Open')))))); 
    }
    async function openTicket(id) {
      const r = await api.get('/admin/cp-tickets/' + id); const t = r.ticket;
      const thread = el('div', { style: 'display:flex;flex-direction:column;gap:10px;max-height:320px;overflow:auto;margin-bottom:14px' },
        ...t.messages.map(msg => el('div', { style: 'padding:10px 13px;border-radius:10px;font-size:14px;' + (msg.sender_type === 'admin' ? 'background:#e8f3ef;align-self:flex-end' : 'background:var(--surface-2,#f1f4f5)') }, el('div', { style: 'font-size:11px;color:var(--text-3);margin-bottom:3px' }, msg.sender_type === 'admin' ? 'You (Agrocorp)' : (t.partner ? t.partner.name : 'Partner')), msg.body)));
      const reply = el('textarea', { class: 'input', rows: '2', placeholder: 'Reply to partner…', 'data-testid': 'cpt-reply' });
      const statusSel = el('select', { class: 'select', 'data-testid': 'cpt-status' }, ...['open', 'in_progress', 'resolved', 'closed'].map(s => el('option', { value: s, selected: s === t.status ? 'selected' : null }, s.replace('_', ' '))));
      const send = el('button', { class: 'btn btn--primary', 'data-testid': 'cpt-send' }, 'Send reply');
      const m = modal({ title: t.subject + ' — ' + (t.partner ? t.partner.name : ''), bodyNode: el('div', {}, thread, el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'Reply'), reply), el('div', { class: 'field', style: 'max-width:160px' }, el('label', {}, 'Set status'), statusSel))), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Close'), send] });
      send.addEventListener('click', async () => { if (!reply.value.trim()) { toast('Write a reply', 'error'); return; } try { await api.post('/admin/cp-tickets/' + id + '/reply', { body: reply.value, status: statusSel.value }); toast('Reply sent', 'success'); m.close(); load(); } catch (e) { toast(e.message, 'error'); } });
    }
    await load();
  };
})();
