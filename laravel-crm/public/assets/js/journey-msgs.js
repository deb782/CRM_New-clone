// ---- Journey Stage Messages: per-status customer WhatsApp broadcast on stage change ----
(function () {
  const { el, api, toast, modal } = CRM;

  CRM.pages.journeyMsgs = async function (view) {
    CRM.setTitle('Journey Stage Messages');
    const r = await api.get('/journey/statuses');
    const stages = r.stages || [];
    view.innerHTML = '';
    view.appendChild(el('p', { style: 'color:var(--text-2);margin-bottom:20px;max-width:760px' },
      'Each lead status can auto-send a WhatsApp message to the customer the moment a lead enters it. Use ',
      el('code', { style: 'background:var(--surface-2,#eef2f4);padding:1px 6px;border-radius:5px' }, '{name}'),
      ' to insert the customer\'s name. Toggle off to pause a message.'));

    stages.forEach(st => {
      const lane = el('div', { class: 'card', style: 'margin-bottom:18px;overflow:hidden', 'data-testid': 'jm-stage-' + st.key });
      lane.appendChild(el('div', { style: 'padding:12px 18px;border-bottom:1px solid var(--border,#e4e9ec);font-weight:700;letter-spacing:-.01em;display:flex;align-items:center;gap:8px' },
        el('i', { class: 'fa-solid fa-layer-group', style: 'color:var(--text-3)' }), st.name));
      st.statuses.forEach(s => lane.appendChild(statusRow(s)));
      view.appendChild(lane);
    });

    function statusRow(s) {
      const dot = el('span', { style: 'width:14px;height:14px;border-radius:50%;flex:0 0 auto;background:' + (s.color || '#7c8b93') });
      const ta = el('textarea', { class: 'input', rows: '2', 'data-testid': 'jm-msg-' + s.code, placeholder: s.is_terminal ? 'No message (terminal status)' : 'WhatsApp message to customer…', style: 'resize:vertical' }, s.wa_message || '');
      const toggle = el('input', { type: 'checkbox', 'data-testid': 'jm-toggle-' + s.code });
      toggle.checked = !!s.wa_enabled;

      // Quick-reply buttons editor (up to 3). Each button moves the lead to a target status on tap.
      const targets = (s.allowed_next || []);
      let buttons = Array.isArray(s.wa_buttons) ? s.wa_buttons.slice() : [];
      const btnList = el('div', { style: 'display:flex;flex-direction:column;gap:6px;margin-top:8px' });
      function drawButtons() {
        btnList.innerHTML = '';
        buttons.forEach((b, i) => {
          const lbl = el('input', { class: 'input', style: 'max-width:150px', maxlength: '20', placeholder: 'Button text', value: b.label || '', 'data-testid': 'jm-btn-label-' + s.code + '-' + i });
          lbl.addEventListener('input', () => b.label = lbl.value);
          const sel = el('select', { class: 'select', style: 'max-width:220px', 'data-testid': 'jm-btn-next-' + s.code + '-' + i },
            el('option', { value: '' }, 'On tap → move to…'),
            ...targets.map(code => el('option', { value: code, selected: code === b.next_code ? 'selected' : null }, statusLabel(code))));
          sel.addEventListener('change', () => b.next_code = sel.value);
          const del = el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'jm-btn-del-' + s.code + '-' + i, onclick: () => { buttons.splice(i, 1); drawButtons(); } }, el('i', { class: 'fa-solid fa-xmark' }));
          btnList.appendChild(el('div', { style: 'display:flex;gap:6px;align-items:center' }, el('i', { class: 'fa-solid fa-reply', style: 'color:var(--won,#25d366)' }), lbl, sel, del));
        });
        if (!s.is_terminal && buttons.length < 3 && targets.length) {
          btnList.appendChild(el('button', { class: 'btn btn--ghost btn--sm', style: 'align-self:flex-start', 'data-testid': 'jm-btn-add-' + s.code, onclick: () => { buttons.push({ label: '', next_code: '' }); drawButtons(); } }, el('i', { class: 'fa-solid fa-plus' }), 'Add quick-reply button'));
        }
      }
      drawButtons();

      const save = el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'jm-save-' + s.code }, 'Save');
      const test = el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'jm-test-' + s.code, title: 'Send this message to a lead now' }, el('i', { class: 'fa-solid fa-paper-plane' }), 'Test send');
      save.addEventListener('click', async () => {
        const clean = buttons.filter(b => (b.label || '').trim() && b.next_code);
        try { await api.put('/journey/statuses/' + s.code, { wa_message: ta.value, wa_enabled: toggle.checked, color: s.color, wa_buttons: clean }); s.wa_buttons = clean; toast('Saved', 'success'); }
        catch (e) { toast(e.message, 'error'); }
      });
      test.addEventListener('click', () => testSend(s, ta.value, buttons));
      return el('div', { class: 'jm-row', style: 'display:grid;grid-template-columns:220px 1fr auto;gap:16px;align-items:start;padding:16px 18px;border-bottom:1px solid var(--border-soft,#eef2f4)' },
        el('div', { style: 'display:flex;align-items:center;gap:10px' }, dot, el('div', {}, el('b', {}, s.display_name), el('div', { class: 'mono', style: 'font-size:11px;color:var(--text-3)' }, s.code))),
        el('div', {}, ta, btnList),
        el('div', { style: 'display:flex;flex-direction:column;gap:8px;align-items:flex-end' },
          el('label', { style: 'display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-2)' }, toggle, 'Auto-send'),
          el('div', { style: 'display:flex;gap:6px' }, test, save)));
    }

    function statusLabel(code) {
      for (const st of stages) { for (const x of st.statuses) { if (x.code === code) return x.display_name; } }
      return code;
    }

    async function testSend(s, currentMsg, buttons) {
      if (!currentMsg.trim()) { toast('Add a message first (and Save)', 'error'); return; }
      let leadId = '';
      const leads = await api.get('/leads?per_page=25').then(x => x.data || x).catch(() => []);
      const arr = Array.isArray(leads) ? leads : (leads.data || []);
      const sel = el('select', { class: 'select', 'data-testid': 'jm-test-lead' }, el('option', { value: '' }, 'Select a lead…'), ...arr.map(l => el('option', { value: l.id }, l.name + ' · ' + (l.phone || 'no phone'))));
      sel.addEventListener('change', () => leadId = sel.value);
      const preview = el('div', { style: 'background:#e8f3ef;border-radius:10px;padding:12px 14px;margin-top:12px;font-size:14px' }, currentMsg.replace(/\{name\}|\{first_name\}/g, 'Rohan'));
      const validBtns = (buttons || []).filter(b => (b.label || '').trim() && b.next_code);
      if (validBtns.length) {
        preview.appendChild(el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;border-top:1px solid #cfe5db;padding-top:10px' },
          ...validBtns.map(b => el('span', { style: 'background:#fff;border:1px solid #b7d8cc;color:#0d5c4a;border-radius:8px;padding:5px 12px;font-weight:600;font-size:13px' }, el('i', { class: 'fa-solid fa-reply', style: 'margin-right:6px;opacity:.6' }), b.label))));
      }
      const send = el('button', { class: 'btn btn--primary', 'data-testid': 'jm-test-send' }, 'Send WhatsApp now');
      const m = modal({ title: 'Test — ' + s.display_name, bodyNode: el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Send to lead'), sel), el('div', { style: 'font-size:12px;color:var(--text-3);margin-top:8px' }, 'Preview:'), preview), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), send] });
      send.addEventListener('click', async () => {
        if (!leadId) { toast('Pick a lead', 'error'); return; }
        try { const res = await api.post('/journey/statuses/' + s.code + '/test-message', { lead_id: Number(leadId) }); toast('WhatsApp ' + (res.status || 'sent') + ' ✓', 'success'); m.close(); }
        catch (e) { toast(e.message, 'error'); }
      });
    }
  };
})();
