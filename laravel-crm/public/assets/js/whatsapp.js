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
          (c.tags && c.tags.length) ? el('div', { style: 'display:flex;gap:4px;flex-wrap:wrap;margin-top:4px' }, ...c.tags.slice(0, 3).map(t => el('span', { class: 'chip', style: 'font-size:10px;padding:0 6px' }, t))) : null,
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
      const notesBtn = el('button', { class: 'btn btn--sm', 'data-testid': 'wa-notes-btn', onclick: () => notesModal(c) }, el('i', { class: 'fa-solid fa-note-sticky' }), 'Notes');
      const leadLink = c.lead ? el('a', { class: 'chip', href: '#/leads/' + c.lead.id, style: 'font-size:12px' }, 'Lead: ' + c.lead.name) : null;

      threadPane.appendChild(el('div', { style: 'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--line)' },
        el('div', {}, el('b', {}, c.contact_name), el('div', { style: 'font-size:12px;color:var(--text-3)' }, c.contact_phone)),
        el('div', { style: 'display:flex;gap:8px;align-items:center' }, leadLink, notesBtn, assignSel, simBtn)));

      // Tags bar
      const tagsBar = el('div', { 'data-testid': 'wa-tags-bar', style: 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;padding:8px 16px;border-bottom:1px solid var(--line)' });
      threadPane.appendChild(tagsBar);
      renderTags();
      function renderTags() {
        tagsBar.innerHTML = '';
        (c.tags || []).forEach(t => {
          tagsBar.appendChild(el('span', { class: 'chip', 'data-testid': 'wa-tag-' + t, style: 'display:inline-flex;gap:6px;align-items:center' }, t,
            el('i', { class: 'fa-solid fa-xmark', style: 'cursor:pointer', onclick: () => saveTags((c.tags || []).filter(x => x !== t)) })));
        });
        const inp = el('input', { class: 'input', 'data-testid': 'wa-tag-input', placeholder: '+ tag', style: 'width:110px;height:28px;font-size:12px' });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = inp.value.trim(); if (v) saveTags([...(c.tags || []), v]); } });
        tagsBar.appendChild(inp);
      }
      async function saveTags(tags) {
        try { const r = await api.put('/whatsapp/conversations/' + c.id + '/tags', { tags }); c.tags = r.conversation.tags; renderTags(); loadList(); }
        catch (e) { toast(e.message, 'error'); }
      }
      async function notesModal(conv) {
        const list = el('div', { style: 'display:flex;flex-direction:column;gap:8px;max-height:300px;overflow-y:auto', 'data-testid': 'wa-notes-list' });
        const ta = el('textarea', { class: 'input', rows: '2', placeholder: 'Add a private note (internal only)…', 'data-testid': 'wa-note-input' });
        const add = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-note-add' }, 'Add note');
        const m = modal({ title: 'Private notes', bodyNode: el('div', {}, list, el('div', { class: 'field', style: 'margin-top:10px' }, ta, add)), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Close')] });
        async function load() {
          const { notes } = await api.get('/whatsapp/conversations/' + conv.id + '/notes');
          list.innerHTML = '';
          if (!notes.length) { list.appendChild(el('div', { class: 'empty', style: 'padding:16px' }, 'No notes yet')); return; }
          notes.forEach(n => list.appendChild(el('div', { class: 'card', 'data-testid': 'wa-note-' + n.id, style: 'padding:8px 10px' },
            el('div', { style: 'font-size:13px' }, n.body),
            el('div', { style: 'font-size:11px;color:var(--text-3);margin-top:3px;display:flex;justify-content:space-between' },
              el('span', {}, (n.author ? n.author.name : '—') + ' · ' + timeAgo(n.created_at)),
              el('span', { style: 'cursor:pointer;color:#c0392b', 'data-testid': 'wa-note-del-' + n.id, onclick: async () => { try { await api.del('/whatsapp/conversations/' + conv.id + '/notes/' + n.id); load(); } catch (e) { toast(e.message, 'error'); } } }, 'delete')))));
        }
        add.addEventListener('click', async () => { const b = ta.value.trim(); if (!b) return; try { await api.post('/whatsapp/conversations/' + conv.id + '/notes', { body: b }); ta.value = ''; load(); } catch (e) { toast(e.message, 'error'); } });
        load();
      }

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

      // Attach media + quick-reply buttons (only usable within the 24h window)
      const fileInput = el('input', { type: 'file', style: 'display:none', 'data-testid': 'wa-file-input', accept: '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,.xls,.xlsx' });
      fileInput.addEventListener('change', async () => {
        if (!fileInput.files.length) return;
        const fd = new FormData(); fd.append('file', fileInput.files[0]);
        try {
          const up = await api.post('/whatsapp/media/upload', fd);
          await api.post('/whatsapp/conversations/' + c.id + '/reply', { type: up.type, media_url: up.url, body: fileInput.value.split('\\').pop() });
          fileInput.value = ''; await loadThread(); loadList();
        } catch (e) { toast(e.message, 'error'); }
      });
      const attachBtn = el('button', { class: 'btn', 'data-testid': 'wa-attach', disabled: !d.within_window ? 'disabled' : null, onclick: () => fileInput.click() }, el('i', { class: 'fa-solid fa-paperclip' }));
      const btnsBtn = el('button', { class: 'btn', 'data-testid': 'wa-buttons', disabled: !d.within_window ? 'disabled' : null, onclick: () => buttonsModal(c) }, el('i', { class: 'fa-solid fa-list-check' }));
      const cannedBtn = el('button', { class: 'btn', 'data-testid': 'wa-canned', disabled: !d.within_window ? 'disabled' : null, onclick: () => cannedModal(ta) }, el('i', { class: 'fa-solid fa-bolt' }));

      composer.appendChild(fileInput);
      composer.appendChild(el('div', { style: 'display:flex;gap:8px;align-items:flex-end' },
        ta,
        el('div', { style: 'display:flex;flex-direction:column;gap:6px' }, sendBtn, el('div', { style: 'display:flex;gap:6px' }, tplBtn, cannedBtn, attachBtn, btnsBtn))));
      threadPane.appendChild(composer);
    }

    async function cannedModal(ta) {
      let replies = [];
      try { replies = (await api.get('/whatsapp/canned-replies')).replies || []; } catch (e) { /* ignore */ }
      const list = el('div', { style: 'display:flex;flex-direction:column;gap:8px;max-height:360px;overflow-y:auto' });
      if (!replies.length) list.appendChild(el('div', { class: 'empty' }, el('div', {}, 'No canned replies yet — add them on the WA Canned Replies page')));
      const m = modal({ title: 'Canned replies', bodyNode: list, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Close')] });
      replies.forEach(r => {
        list.appendChild(el('div', { class: 'card', 'data-testid': 'wa-canned-' + r.id, style: 'padding:10px 12px;cursor:pointer', onclick: () => { ta.value = ta.value ? (ta.value + ' ' + r.body) : r.body; ta.focus(); m.close(); } },
          el('b', { style: 'font-size:13px' }, r.title + (r.shortcut ? (' · ' + r.shortcut) : '')),
          el('div', { style: 'font-size:12px;color:var(--text-3)' }, (r.body || '').slice(0, 90))));
      });
    }

    function buttonsModal(c) {
      const bodyI = el('textarea', { class: 'input', rows: '2', placeholder: 'Question / message', 'data-testid': 'wa-btn-body' });
      const b1 = el('input', { class: 'input', placeholder: 'Button 1 (required)', 'data-testid': 'wa-btn-1' });
      const b2 = el('input', { class: 'input', placeholder: 'Button 2 (optional)', 'data-testid': 'wa-btn-2' });
      const b3 = el('input', { class: 'input', placeholder: 'Button 3 (optional)', 'data-testid': 'wa-btn-3' });
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-btn-send' }, 'Send buttons');
      const m = modal({ title: 'Send quick-reply buttons', bodyNode: el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Message'), bodyI),
        el('div', { class: 'field' }, el('label', {}, 'Buttons (max 3, 20 chars each)'), b1),
        el('div', { class: 'field' }, b2), el('div', { class: 'field' }, b3)),
        footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        const buttons = [b1.value, b2.value, b3.value].map(t => t.trim()).filter(Boolean).map(t => ({ title: t.slice(0, 20) }));
        if (!bodyI.value.trim() || !buttons.length) { toast('Message and at least one button required', 'error'); return; }
        try { await api.post('/whatsapp/conversations/' + c.id + '/reply', { type: 'interactive', body: bodyI.value.trim(), buttons }); m.close(); await loadThread(); loadList(); }
        catch (e) { toast(e.message, 'error'); }
      });
    }

    function fillMessages(box, messages) {
      box.innerHTML = '';
      messages.forEach(m => {
        const out = m.direction === 'outbound';
        const content = [];
        if (m.template) content.push(el('div', { style: 'font-size:11px;color:var(--text-3);margin-bottom:2px' }, 'Template: ' + m.template));
        if (m.message_type === 'image' && m.media_url) content.push(el('img', { src: m.media_url, style: 'max-width:220px;border-radius:8px;display:block;margin-bottom:4px' }));
        if (m.message_type === 'document' && m.media_url) content.push(el('a', { href: m.media_url, target: '_blank', class: 'chip', style: 'display:inline-flex;gap:6px;margin-bottom:4px' }, el('i', { class: 'fa-solid fa-file' }), 'Document'));
        if (m.body) content.push(el('div', {}, m.body));
        if (m.message_type === 'interactive' && m.meta && m.meta.buttons) {
          content.push(el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-top:6px' },
            ...m.meta.buttons.map(b => el('span', { class: 'chip', style: 'border:1px solid var(--accent);color:var(--accent)' }, b.title))));
        }
        content.push(el('div', { style: 'font-size:10px;color:var(--text-3);margin-top:3px;text-align:right' }, (m.sender_name ? m.sender_name + ' · ' : '') + (out ? (m.status || '') : '')));
        box.appendChild(el('div', {
          'data-testid': 'wa-msg-' + m.id,
          style: 'max-width:72%;padding:8px 12px;border-radius:12px;font-size:14px;line-height:1.4;' +
            (out ? 'align-self:flex-end;background:#dcf8c6;color:#0b3d0b;border-bottom-right-radius:4px'
              : 'align-self:flex-start;background:#fff;border:1px solid var(--line);border-bottom-left-radius:4px')
        }, ...content));
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

    async function templateModal(c) {
      let templates = [];
      try { templates = (await api.get('/whatsapp/templates')).templates || []; } catch (e) { /* ignore */ }
      const sel = el('select', { class: 'input', 'data-testid': 'wa-tpl-select' },
        el('option', { value: '' }, templates.length ? 'Select a template…' : 'No templates — sync from WA Templates page'),
        ...templates.map(t => el('option', { value: t.name }, t.name + ' (' + t.language + ')')));
      const varsWrap = el('div', { 'data-testid': 'wa-tpl-vars' });
      const bodyI = el('textarea', { class: 'input', rows: '2', placeholder: 'Preview text stored in the thread', 'data-testid': 'wa-tpl-body' });
      const nums = (t) => t && t.body ? [...new Set((t.body.match(/\{\{(\d+)\}\}/g) || []).map(s => parseInt(s.replace(/\D/g, ''))))].sort((a, b) => a - b) : [];
      const store = {};
      function currentVars() {
        const t = templates.find(x => x.name === sel.value); const ns = nums(t);
        if (!ns.length) return [];
        const max = Math.max(...ns); const arr = [];
        for (let i = 1; i <= max; i++) arr.push(store[i] || '');
        return arr;
      }
      function updatePreview() {
        const t = templates.find(x => x.name === sel.value);
        bodyI.value = (t?.body || '').replace(/\{\{(\d+)\}\}/g, (mm, d) => store[parseInt(d)] || mm);
      }
      function renderVars() {
        varsWrap.innerHTML = ''; Object.keys(store).forEach(k => delete store[k]);
        const t = templates.find(x => x.name === sel.value);
        nums(t).forEach(n => {
          store[n] = '';
          const i = el('input', { class: 'input', 'data-testid': 'wa-tpl-var-' + n, placeholder: '{{' + n + '}}' });
          i.addEventListener('input', () => { store[n] = i.value; updatePreview(); });
          varsWrap.appendChild(el('div', { class: 'field' }, el('label', {}, 'Variable {{' + n + '}}'), i));
        });
        updatePreview();
      }
      sel.addEventListener('change', renderVars);
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-tpl-send' }, 'Send template');
      const m = modal({ title: 'Send template message', bodyNode: el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Template'), sel), varsWrap, el('div', { class: 'field' }, el('label', {}, 'Preview'), bodyI)), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!sel.value) { toast('Select a template', 'error'); return; }
        try { await api.post('/whatsapp/conversations/' + c.id + '/reply', { type: 'template', template: sel.value, variables: currentVars(), body: bodyI.value.trim() || ('[Template: ' + sel.value + ']') }); m.close(); await loadThread(); loadList(); }
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
  // ========================= WA TEMPLATES =========================
  CRM.pages.waTemplates = async function (view) {
    const syncBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-tpl-sync', onclick: async () => { try { const r = await api.post('/whatsapp/templates/sync'); toast('Synced ' + r.synced + ' templates', 'success'); CRM.render(); } catch (e) { toast(e.message, 'error'); } } }, el('i', { class: 'fa-solid fa-rotate' }), 'Sync from Meta');
    CRM.setActions(syncBtn);
    view.innerHTML = '<div class="spinner"></div>';
    const { templates } = await api.get('/whatsapp/templates');
    view.innerHTML = '';
    view.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:14px' }, 'Approved WhatsApp templates. Agents pick these in the inbox & broadcasts. Sync pulls the latest from Meta (mock samples until live keys are added).'));
    if (!templates.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-file-lines' }), el('div', {}, 'No templates yet — click Sync from Meta'))); return; }
    const rows = templates.map(t => el('tr', { 'data-testid': 'wa-tpl-row-' + t.id },
      el('td', { class: 'mono' }, t.name), el('td', {}, t.language), el('td', {}, t.category),
      el('td', {}, el('span', { class: 'chip', style: 'color:var(--won)' }, t.status)),
      el('td', { style: 'color:var(--text-3);font-size:13px' }, (t.body || '').slice(0, 70))));
    view.appendChild(tableWrap(['Name', 'Lang', 'Category', 'Status', 'Body'], rows));
  };

  // ========================= WA ANALYTICS =========================
  CRM.pages.waAnalytics = async function (view) {
    CRM.setActions(null);
    view.innerHTML = '<div class="spinner"></div>';
    const a = await api.get('/whatsapp/analytics');
    view.innerHTML = '';
    const card = (k, v, color) => el('div', { class: 'card stat' }, el('div', { class: 'k' }, k), el('div', { class: 'v', style: color ? ('color:' + color) : '' }, String(v)));
    view.appendChild(el('div', { class: 'cards', style: 'margin-bottom:22px', 'data-testid': 'wa-analytics-cards' },
      card('Open conversations', a.open_conversations),
      card('Unread backlog', a.unread_backlog, a.unread_backlog ? 'var(--warm)' : 'var(--won)'),
      card('Unassigned', a.unassigned, a.unassigned ? 'var(--warm)' : ''),
      card('Avg first response', a.avg_response_minutes != null ? (a.avg_response_minutes + 'm') : '—')));
    view.appendChild(el('div', { class: 'section-title' }, 'Messages per agent'));
    if (!a.per_agent.length) view.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px' }, 'No outbound messages yet'));
    else view.appendChild(tableWrap(['Agent', 'Sent'], a.per_agent.map(x => el('tr', { 'data-testid': 'wa-agent-row' }, el('td', {}, x.sender_name || 'Broadcasts / System'), el('td', {}, String(x.sent))))));

    // Auto-assignment routing toggle
    try {
      const s = (await api.get('/whatsapp/settings')).settings;
      const toggle = el('input', { type: 'checkbox', 'data-testid': 'wa-autoassign-toggle' }); toggle.checked = !!s.auto_assign;
      toggle.addEventListener('change', async () => { try { await api.put('/whatsapp/settings', { auto_assign: toggle.checked }); toast('Saved', 'success'); } catch (e) { toast(e.message, 'error'); toggle.checked = !toggle.checked; } });
      view.appendChild(el('div', { class: 'card', style: 'padding:14px 16px;margin-top:22px' },
        el('label', { style: 'display:flex;gap:10px;align-items:center;font-size:14px;cursor:pointer' }, toggle,
          el('div', {}, el('b', {}, 'Auto-assign new WhatsApp chats'), el('div', { style: 'font-size:12px;color:var(--text-3)' }, 'New conversations are routed to the least-busy available sales agent, so nothing sits unclaimed.')))));
    } catch (e) { /* settings gated to managers */ }
  };

  // ========================= WA CANNED REPLIES =========================
  CRM.pages.waCanned = async function (view) {
    const addBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-canned-new', onclick: () => cannedForm() }, el('i', { class: 'fa-solid fa-bolt' }), 'New Canned Reply');
    CRM.setActions(addBtn);
    view.innerHTML = '<div class="spinner"></div>';
    const { replies } = await api.get('/whatsapp/canned-replies');
    view.innerHTML = '';
    view.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:14px' }, 'Saved snippets agents insert with one click in the inbox to answer common questions faster.'));
    if (!replies.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-bolt' }), el('div', {}, 'No canned replies yet'))); return; }
    const rows = replies.map(r => el('tr', { 'data-testid': 'wa-canned-row-' + r.id },
      el('td', {}, r.title), el('td', { class: 'mono' }, r.shortcut || '—'),
      el('td', { style: 'color:var(--text-3);font-size:13px' }, (r.body || '').slice(0, 70)),
      el('td', {}, el('div', { style: 'display:flex;gap:6px' },
        el('button', { class: 'btn btn--sm', 'data-testid': 'wa-canned-edit-' + r.id, onclick: () => cannedForm(r) }, 'Edit'),
        el('button', { class: 'btn btn--sm', 'data-testid': 'wa-canned-del-' + r.id, onclick: async () => { await api.del('/whatsapp/canned-replies/' + r.id); toast('Deleted', 'success'); CRM.render(); } }, 'Delete')))));
    view.appendChild(tableWrap(['Title', 'Shortcut', 'Body', ''], rows));

    function cannedForm(r) {
      const f = { title: r?.title || '', shortcut: r?.shortcut || '', body: r?.body || '' };
      const titleI = el('input', { class: 'input', value: f.title, 'data-testid': 'wa-canned-title' }); titleI.addEventListener('input', () => f.title = titleI.value);
      const scI = el('input', { class: 'input', value: f.shortcut, placeholder: '/hours', 'data-testid': 'wa-canned-shortcut' }); scI.addEventListener('input', () => f.shortcut = scI.value);
      const bodyI = el('textarea', { class: 'input', rows: '3', 'data-testid': 'wa-canned-body' }); bodyI.value = f.body; bodyI.addEventListener('input', () => f.body = bodyI.value);
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'wa-canned-save' }, 'Save');
      const m = modal({ title: r ? 'Edit Canned Reply' : 'New Canned Reply', bodyNode: el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Title'), titleI),
        el('div', { class: 'field' }, el('label', {}, 'Shortcut (optional)'), scI),
        el('div', { class: 'field' }, el('label', {}, 'Message'), bodyI)), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!f.title || !f.body) { toast('Title & message required', 'error'); return; }
        try {
          const body = { title: f.title, shortcut: f.shortcut || null, body: f.body };
          if (r) await api.put('/whatsapp/canned-replies/' + r.id, body); else await api.post('/whatsapp/canned-replies', body);
          toast('Saved', 'success'); m.close(); CRM.render();
        } catch (e) { toast(e.message, 'error'); }
      });
    }
  };
})();
