// ---- WhatsApp Business: Team Inbox, Broadcasts, Auto-Replies ----
(function () {
  const { el, api, toast, modal, timeAgo, can } = CRM;

  function tableWrap(headers, rows) {
    return el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, ...headers.map(h => el('th', {}, h)))),
      el('tbody', {}, ...rows)));
  }

  // ========================= TEAM INBOX =========================
  let activeId = null;
  let filter = 'all';
  let agents = [];
  let pollTimer = null;
  let lastCount = -1;

  function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

  CRM.pages.inbox = async function (view) {
    CRM.setActions(null);
    stopPoll();
    view.innerHTML = '';

    const listPane = el('div', { class: 'card', style: 'width:320px;min-width:280px;max-height:calc(100vh - 190px);overflow-y:auto;padding:0', 'data-testid': 'wa-conv-list' });
    const threadPane = el('div', { class: 'card', style: 'flex:1;display:flex;flex-direction:column;min-width:0;max-height:calc(100vh - 190px);padding:0', 'data-testid': 'wa-thread' });

    const mkFilter = (k, label) => el('button', {
      class: 'btn btn--sm' + (filter === k ? ' btn--primary' : ''), 'data-testid': 'wa-filter-' + k,
      onclick: () => { filter = k; renderFilters(); loadList(); }
    }, label);
    const filterBar = el('div', { style: 'display:flex;gap:6px;margin-bottom:12px' });
    function renderFilters() { filterBar.innerHTML = ''; [['all', 'All'], ['mine', 'Mine'], ['unread', 'Unread']].forEach(([k, l]) => filterBar.appendChild(mkFilter(k, l))); }
    renderFilters();

    view.appendChild(el('div', {}, filterBar,
      el('div', { style: 'display:flex;gap:16px;align-items:flex-start' }, listPane, threadPane)));
    emptyThread();

    function emptyThread() {
      threadPane.innerHTML = '';
      threadPane.appendChild(el('div', { class: 'empty', style: 'margin:auto' }, el('i', { class: 'fa-brands fa-whatsapp', style: 'color:#25D366' }), el('div', {}, 'Select a conversation')));
    }

    async function loadList() {
      let path = '/whatsapp/conversations';
      const p = [];
      if (filter === 'mine') p.push('mine=true');
      if (filter === 'unread') p.push('unread=true');
      if (p.length) path += '?' + p.join('&');
      const res = await api.get(path);
      agents = res.agents || [];
      const convs = res.conversations || [];
      listPane.innerHTML = '';
      if (!convs.length) { listPane.appendChild(el('div', { class: 'empty', style: 'padding:30px 12px' }, el('div', {}, 'No conversations'))); return; }
      convs.forEach(c => {
        listPane.appendChild(el('div', {
          'data-testid': 'wa-conv-' + c.id,
          style: 'padding:12px 14px;border-bottom:1px solid var(--line);cursor:pointer;' + (c.id === activeId ? 'background:var(--accent-weak,#eef2ff)' : ''),
          onclick: () => openThread(c.id)
        },
          el('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:8px' },
            el('b', { style: 'font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, c.contact_name),
            c.unread_count ? el('span', { 'data-testid': 'wa-unread-' + c.id, style: 'background:#25D366;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;font-weight:600' }, String(c.unread_count)) : null),
          el('div', { style: 'font-size:12px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px' }, c.last_message_preview || '—'),
          el('div', { style: 'font-size:11px;color:var(--text-3);margin-top:3px' }, c.contact_phone + ' · ' + (c.last_message_at ? timeAgo(c.last_message_at) : ''))));
      });
    }

    async function openThread(id) { activeId = id; lastCount = -1; await loadThread(); loadList(); }

    async function loadThread() {
      if (!activeId) return;
      const d = await api.get('/whatsapp/conversations/' + activeId + '/messages');
      buildThread(d);
      if (d.conversation.unread_count) { api.post('/whatsapp/conversations/' + activeId + '/read').then(loadList); }
    }

    function buildThread(d) {
      const c = d.conversation;
      threadPane.innerHTML = '';

      // Header
      const assignSel = el('select', { class: 'input', style: 'width:auto;height:32px;font-size:13px', 'data-testid': 'wa-assign' },
        el('option', { value: '' }, 'Unassigned'),
        ...agents.map(a => el('option', { value: a.id }, a.name)));
      assignSel.value = c.assigned_to || '';
      assignSel.addEventListener('change', async () => {
        await api.post('/whatsapp/conversations/' + c.id + '/assign', { assigned_to: assignSel.value || null });
        toast('Assigned', 'success'); loadList();
      });
      const simBtn = el('button', { class: 'btn btn--sm', 'data-testid': 'wa-simulate', disabled: !c.lead_id ? 'disabled' : null }, el('i', { class: 'fa-solid fa-flask' }), 'Simulate inbound');
      simBtn.addEventListener('click', () => simulateModal(c));
      const leadLink = c.lead ? el('a', { class: 'chip', href: '#/leads/' + c.lead.id, style: 'font-size:12px' }, 'Lead: ' + c.lead.name) : null;

      threadPane.appendChild(el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)' },
        el('div', {}, el('b', {}, c.contact_name), el('div', { style: 'font-size:12px;color:var(--text-3)' }, c.contact_phone)),
        el('div', { style: 'display:flex;gap:8px;align-items:center' }, leadLink, assignSel, simBtn)));

      // Messages box
      const box = el('div', { style: 'flex:1;overflow-y:auto;padding:16px;background:var(--bg-2,#f6f7fb);display:flex;flex-direction:column;gap:8px', 'data-testid': 'wa-messages' });
      fillMessages(box, d.messages);
      threadPane.appendChild(box);

      // Composer
      const composer = el('div', { style: 'border-top:1px solid var(--line);padding:12px 14px' });
      if (!d.within_window) {
        composer.appendChild(el('div', { 'data-testid': 'wa-window-banner', style: 'font-size:12px;color:var(--warm,#b7791f);background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px 10px;margin-bottom:10px' },
          el('i', { class: 'fa-solid fa-clock' }), ' 24-hour window closed — you can only send an approved template.'));
      }
      const ta = el('textarea', { class: 'input', rows: '2', placeholder: d.within_window ? 'Type a message…' : 'Free-form disabled outside 24h window', 'data-testid': 'wa-reply-input', disabled: !d.within_window ? 'disabled' : null });
      const sendBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-send', disabled: !d.within_window ? 'disabled' : null }, el('i', { class: 'fa-solid fa-paper-plane' }), 'Send');
      const tplBtn = el('button', { class: 'btn', 'data-testid': 'wa-send-template' }, el('i', { class: 'fa-solid fa-file-lines' }), 'Template');
      async function sendText() {
        const body = ta.value.trim(); if (!body) return;
        sendBtn.disabled = true;
        try { await api.post('/whatsapp/conversations/' + c.id + '/reply', { body }); ta.value = ''; await loadThread(); loadList(); }
        catch (e) { toast(e.message, 'error'); } finally { sendBtn.disabled = false; }
      }
      sendBtn.addEventListener('click', sendText);
      ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); } });
      tplBtn.addEventListener('click', () => templateModal(c));
      composer.appendChild(el('div', { style: 'display:flex;gap:8px;align-items:flex-end' }, ta, el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, sendBtn, tplBtn)));
      threadPane.appendChild(composer);
    }

    function fillMessages(box, messages) {
      box.innerHTML = '';
      messages.forEach(m => {
        const out = m.direction === 'outbound';
        box.appendChild(el('div', {
          'data-testid': 'wa-msg-' + m.id,
          style: 'max-width:72%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.4;' +
            (out ? 'align-self:flex-end;background:#dcf8c6;color:#0b3d0b;border-bottom-right-radius:4px'
              : 'align-self:flex-start;background:#fff;border:1px solid var(--line);border-bottom-left-radius:4px')
        },
          m.template ? el('div', { style: 'font-size:11px;color:var(--text-3);margin-bottom:2px' }, 'Template: ' + m.template) : null,
          el('div', {}, m.body || ''),
          el('div', { style: 'font-size:10px;color:var(--text-3);margin-top:3px;text-align:right' }, (m.sender_name ? m.sender_name + ' · ' : '') + (out ? (m.status || '') : ''))));
      });
      box.scrollTop = box.scrollHeight;
      lastCount = messages.length;
    }

    function simulateModal(c) {
      const ta = el('textarea', { class: 'input', rows: '3', placeholder: 'e.g. What is the price?', 'data-testid': 'wa-sim-input' });
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-sim-send' }, 'Send as customer');
      const m = modal({ title: 'Simulate inbound message (test)', bodyNode: el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Customer message'), ta)), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        const body = ta.value.trim(); if (!body) return;
        try { await api.post('/whatsapp/simulate-inbound', { lead_id: c.lead_id, body }); m.close(); await loadThread(); loadList(); toast('Inbound simulated', 'success'); }
        catch (e) { toast(e.message, 'error'); }
      });
    }

    function templateModal(c) {
      const nameI = el('input', { class: 'input', placeholder: 'template_name', 'data-testid': 'wa-tpl-name' });
      const bodyI = el('textarea', { class: 'input', rows: '2', placeholder: 'Preview text stored in the thread', 'data-testid': 'wa-tpl-body' });
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-tpl-send' }, 'Send template');
      const m = modal({ title: 'Send template message', bodyNode: el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Template name'), nameI), el('div', { class: 'field' }, el('label', {}, 'Preview text'), bodyI)), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!nameI.value.trim()) { toast('Template name required', 'error'); return; }
        try { await api.post('/whatsapp/conversations/' + c.id + '/reply', { type: 'template', template: nameI.value.trim(), body: bodyI.value.trim() || ('[Template: ' + nameI.value.trim() + ']') }); m.close(); await loadThread(); loadList(); }
        catch (e) { toast(e.message, 'error'); }
      });
    }

    await loadList();
    pollTimer = setInterval(async () => {
      if (!document.body.contains(view)) { stopPoll(); return; }
      try {
        await loadList();
        if (activeId) {
          const d = await api.get('/whatsapp/conversations/' + activeId + '/messages');
          const box = threadPane.querySelector('[data-testid="wa-messages"]');
          if (box && d.messages.length !== lastCount) fillMessages(box, d.messages);
        }
      } catch (e) { /* silent poll */ }
    }, 4000);
  };

  // ========================= BROADCASTS =========================
  CRM.pages.broadcasts = async function (view) {
    const addBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-broadcast-new', onclick: () => broadcastModal() }, el('i', { class: 'fa-solid fa-bullhorn' }), 'New Broadcast');
    CRM.setActions(addBtn);
    view.innerHTML = '<div class="spinner"></div>';
    const { broadcasts } = await api.get('/whatsapp/broadcasts');
    view.innerHTML = '';
    if (!broadcasts.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-bullhorn' }), el('div', {}, 'No broadcasts yet'))); return; }
    const rows = broadcasts.map(b => {
      const sendBtn = b.status === 'sent'
        ? el('span', { class: 'chip', style: 'color:var(--won)' }, 'sent ' + (b.sent_at ? timeAgo(b.sent_at) : ''))
        : el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'wa-broadcast-send-' + b.id, onclick: async () => { try { const r = await api.post('/whatsapp/broadcasts/' + b.id + '/send'); toast('Sent to ' + r.sent + ' (failed ' + r.failed + ')', 'success'); CRM.render(); } catch (e) { toast(e.message, 'error'); } } }, 'Send now');
      return el('tr', { 'data-testid': 'wa-broadcast-row-' + b.id },
        el('td', {}, b.name), el('td', {}, b.template ? ('Template: ' + b.template) : (b.body || '').slice(0, 40)),
        el('td', {}, b.audience_type + (b.audience_value ? (':' + b.audience_value) : '')),
        el('td', {}, String(b.recipients)), el('td', {}, b.status === 'sent' ? (b.sent_count + '✓ / ' + b.failed_count + '✗') : '—'),
        el('td', {}, sendBtn));
    });
    view.appendChild(tableWrap(['Name', 'Message', 'Audience', 'Recipients', 'Result', ''], rows));

    function broadcastModal() {
      const f = { name: '', mode: 'text', body: '', template: '', audience_type: 'all', audience_value: '' };
      const nameI = el('input', { class: 'input', 'data-testid': 'wa-b-name' }); nameI.addEventListener('input', () => f.name = nameI.value);
      const bodyI = el('textarea', { class: 'input', rows: '3', 'data-testid': 'wa-b-body' }); bodyI.addEventListener('input', () => f.body = bodyI.value);
      const tplI = el('input', { class: 'input', placeholder: 'template_name (optional, required outside 24h)', 'data-testid': 'wa-b-template' }); tplI.addEventListener('input', () => f.template = tplI.value);
      const audType = el('select', { class: 'input', 'data-testid': 'wa-b-audience' }, ...[['all', 'All contacts'], ['status', 'By status'], ['temperature', 'By temperature'], ['source', 'By source']].map(([v, l]) => el('option', { value: v }, l)));
      const audVal = el('input', { class: 'input', placeholder: 'e.g. new / hot / Website Form', 'data-testid': 'wa-b-audience-value' });
      audType.addEventListener('change', () => { f.audience_type = audType.value; audVal.style.display = audType.value === 'all' ? 'none' : ''; });
      audVal.addEventListener('input', () => f.audience_value = audVal.value); audVal.style.display = 'none';
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-b-save' }, 'Create');
      const m = modal({ title: 'New WhatsApp Broadcast', bodyNode: el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Name'), nameI),
        el('div', { class: 'field' }, el('label', {}, 'Message'), bodyI),
        el('div', { class: 'field' }, el('label', {}, 'Template name (optional)'), tplI),
        el('div', { class: 'field' }, el('label', {}, 'Audience'), audType),
        el('div', { class: 'field' }, el('label', {}, 'Audience value'), audVal)), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!f.name) { toast('Name required', 'error'); return; }
        try { await api.post('/whatsapp/broadcasts', { name: f.name, body: f.body || null, template: f.template || null, audience_type: f.audience_type, audience_value: f.audience_value || null }); toast('Broadcast created', 'success'); m.close(); CRM.render(); }
        catch (e) { toast(e.message, 'error'); }
      });
    }
  };

  // ========================= AUTO-REPLIES =========================
  CRM.pages.waAutomations = async function (view) {
    const addBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-auto-new', onclick: () => ruleModal() }, el('i', { class: 'fa-solid fa-robot' }), 'New Auto-Reply');
    CRM.setActions(addBtn);
    view.innerHTML = '<div class="spinner"></div>';
    const { rules } = await api.get('/whatsapp/auto-replies');
    view.innerHTML = '';
    view.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:14px' }, 'When a customer messages, the first matching rule auto-replies instantly (respects opt-out & the 24h window).'));
    if (!rules.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-robot' }), el('div', {}, 'No auto-reply rules yet'))); return; }
    const rows = rules.map(r => el('tr', { 'data-testid': 'wa-auto-row-' + r.id },
      el('td', {}, r.name), el('td', { class: 'mono' }, r.keyword), el('td', {}, r.match_type),
      el('td', {}, r.reply_template ? ('Template: ' + r.reply_template) : (r.reply_body || '').slice(0, 40)),
      el('td', {}, el('span', { class: 'chip', style: 'color:' + (r.active ? 'var(--won)' : 'var(--text-3)') }, r.active ? 'active' : 'off')),
      el('td', {}, String(r.hits)),
      el('td', {}, el('div', { style: 'display:flex;gap:6px' },
        el('button', { class: 'btn btn--sm', 'data-testid': 'wa-auto-edit-' + r.id, onclick: () => ruleModal(r) }, 'Edit'),
        el('button', { class: 'btn btn--sm', 'data-testid': 'wa-auto-del-' + r.id, onclick: async () => { await api.del('/whatsapp/auto-replies/' + r.id); toast('Deleted', 'success'); CRM.render(); } }, 'Delete')))));
    view.appendChild(tableWrap(['Name', 'Keyword', 'Match', 'Reply', 'Status', 'Hits', ''], rows));

    function ruleModal(r) {
      const f = { name: r?.name || '', keyword: r?.keyword || '', match_type: r?.match_type || 'contains', reply_body: r?.reply_body || '', reply_template: r?.reply_template || '', active: r ? !!r.active : true };
      const inp = (k, ph) => { const i = el('input', { class: 'input', value: f[k], placeholder: ph, 'data-testid': 'wa-auto-' + k }); i.addEventListener('input', () => f[k] = i.value); return i; };
      const matchSel = el('select', { class: 'input', 'data-testid': 'wa-auto-match' }, ...['contains', 'exact', 'starts'].map(v => el('option', { value: v, selected: f.match_type === v ? 'selected' : null }, v)));
      matchSel.addEventListener('change', () => f.match_type = matchSel.value);
      const bodyI = el('textarea', { class: 'input', rows: '2', 'data-testid': 'wa-auto-reply_body' }); bodyI.value = f.reply_body; bodyI.addEventListener('input', () => f.reply_body = bodyI.value);
      const activeC = el('input', { type: 'checkbox', 'data-testid': 'wa-auto-active' }); activeC.checked = f.active; activeC.addEventListener('change', () => f.active = activeC.checked);
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-auto-save' }, 'Save');
      const m = modal({ title: r ? 'Edit Auto-Reply' : 'New Auto-Reply', bodyNode: el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Name'), inp('name', 'e.g. Price enquiry')),
        el('div', { class: 'field' }, el('label', {}, 'Trigger keyword'), inp('keyword', 'e.g. price')),
        el('div', { class: 'field' }, el('label', {}, 'Match type'), matchSel),
        el('div', { class: 'field' }, el('label', {}, 'Reply message'), bodyI),
        el('div', { class: 'field' }, el('label', {}, 'Reply template (optional)'), inp('reply_template', 'template_name')),
        el('label', { style: 'display:flex;gap:8px;align-items:center;font-size:13px' }, activeC, 'Active')),
        footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!f.name || !f.keyword) { toast('Name & keyword required', 'error'); return; }
        try {
          const body = { name: f.name, keyword: f.keyword, match_type: f.match_type, reply_body: f.reply_body || null, reply_template: f.reply_template || null, active: f.active };
          if (r) await api.put('/whatsapp/auto-replies/' + r.id, body); else await api.post('/whatsapp/auto-replies', body);
          toast('Saved', 'success'); m.close(); CRM.render();
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  };
})();
