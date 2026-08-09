// ---- Email Broadcast module: Templates, Visual Designer, Campaigns ----
(function () {
  const { el, api, toast, modal, timeAgo } = CRM;
  window.EMAIL = window.EMAIL || { starter: null };

  function tableWrap(headers, rows) {
    return el('div', { class: 'table-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, ...headers.map(h => el('th', {}, h)))),
      el('tbody', {}, ...rows)));
  }
  const MERGE = ['{{name}}', '{{email}}', '{{phone}}', '{{project}}'];

  // ========================= TEMPLATES LIST =========================
  CRM.pages.emailTemplates = async function (view) {
    const addBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'email-tpl-new', onclick: () => starterPicker() }, el('i', { class: 'fa-solid fa-plus' }), 'New Template');
    CRM.setActions(addBtn);
    view.innerHTML = '<div class="spinner"></div>';
    const { templates } = await api.get('/email/templates');
    view.innerHTML = '';
    view.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:14px' }, 'Design reusable email templates with the visual editor, import HTML, and use them in campaigns.'));
    if (!templates.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-envelope-open-text' }), el('div', {}, 'No templates yet — click New Template'))); return; }
    const rows = templates.map(t => el('tr', { 'data-testid': 'email-tpl-row-' + t.id },
      el('td', {}, t.name), el('td', {}, t.category || '—'), el('td', { style: 'color:var(--text-3)' }, t.subject || '—'),
      el('td', {}, el('div', { style: 'display:flex;gap:6px' },
        el('button', { class: 'btn btn--sm', 'data-testid': 'email-tpl-edit-' + t.id, onclick: () => { window.location.hash = '#/emailDesign/' + t.id; } }, 'Edit'),
        el('button', { class: 'btn btn--sm', 'data-testid': 'email-tpl-del-' + t.id, onclick: async () => { await api.del('/email/templates/' + t.id); toast('Deleted', 'success'); CRM.render(); } }, 'Delete')))));
    view.appendChild(tableWrap(['Name', 'Category', 'Subject', ''], rows));
  };

  async function starterPicker() {
    const { starters } = await api.get('/email/templates/starters');
    const grid = el('div', { style: 'display:grid;grid-template-columns:1fr 1fr;gap:12px' });
    const m = modal({ title: 'Start from a template', bodyNode: grid, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel')] });
    starters.forEach(s => grid.appendChild(el('div', { class: 'card', 'data-testid': 'email-starter-' + s.name.replace(/\s+/g, '-').toLowerCase(), style: 'padding:14px;cursor:pointer', onclick: () => { window.EMAIL.starter = s; m.close(); window.location.hash = '#/emailDesign'; } },
      el('b', {}, s.name), el('div', { style: 'font-size:12px;color:var(--text-3);margin-top:4px' }, s.category))));
  }

  // ========================= VISUAL DESIGNER =========================
  CRM.pages.emailDesign = async function (view, id) {
    CRM.setActions(null);
    view.innerHTML = '';
    let tpl = { name: '', subject: '', category: 'General', html: '<div style="padding:24px;font-family:Arial,sans-serif">Start writing…</div>' };
    if (id) { tpl = (await api.get('/email/templates/' + id)).template; }
    else if (window.EMAIL.starter) { tpl = { name: window.EMAIL.starter.name === 'Blank' ? '' : window.EMAIL.starter.name, subject: window.EMAIL.starter.subject, category: window.EMAIL.starter.category, html: window.EMAIL.starter.html }; window.EMAIL.starter = null; }

    const nameI = el('input', { class: 'input', 'data-testid': 'email-design-name', value: tpl.name, placeholder: 'Template name' });
    const subjI = el('input', { class: 'input', 'data-testid': 'email-design-subject', value: tpl.subject || '', placeholder: 'Subject line' });
    const catI = el('input', { class: 'input', 'data-testid': 'email-design-category', value: tpl.category || 'General' });

    const canvas = el('div', { class: 'card', 'data-testid': 'email-canvas', contenteditable: 'true', style: 'min-height:420px;padding:0;overflow:auto;background:#fff;color:#111' });
    canvas.innerHTML = tpl.html || '';
    const rawArea = el('textarea', { class: 'input', 'data-testid': 'email-raw', style: 'display:none;min-height:420px;font-family:monospace;font-size:12px' });
    const preview = el('iframe', { 'data-testid': 'email-preview', style: 'width:100%;height:460px;border:1px solid var(--line);border-radius:10px;background:#fff' });

    function currentHtml() { return rawMode ? rawArea.value : canvas.innerHTML; }
    function refreshPreview() { preview.srcdoc = currentHtml(); }
    canvas.addEventListener('input', refreshPreview);
    rawArea.addEventListener('input', refreshPreview);

    let rawMode = false;
    function toggleRaw() {
      rawMode = !rawMode;
      if (rawMode) { rawArea.value = canvas.innerHTML; canvas.style.display = 'none'; rawArea.style.display = ''; }
      else { canvas.innerHTML = rawArea.value; rawArea.style.display = 'none'; canvas.style.display = ''; }
      refreshPreview();
    }

    const exec = (cmd, val) => { canvas.focus(); document.execCommand(cmd, false, val || null); refreshPreview(); };
    const insertHtml = (html) => { canvas.focus(); document.execCommand('insertHTML', false, html); refreshPreview(); };
    const tbtn = (label, testid, fn) => el('button', { class: 'btn btn--sm', 'data-testid': testid, type: 'button', onclick: fn }, label);

    const mergeSel = el('select', { class: 'input', style: 'width:auto;height:32px', 'data-testid': 'email-merge' }, el('option', { value: '' }, 'Merge tag…'), ...MERGE.map(t => el('option', { value: t }, t)));
    mergeSel.addEventListener('change', () => { if (mergeSel.value) { insertHtml(mergeSel.value); mergeSel.value = ''; } });

    const toolbar = el('div', { style: 'display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px' },
      tbtn('H1', 'email-h1', () => exec('formatBlock', 'h1')),
      tbtn('H2', 'email-h2', () => exec('formatBlock', 'h2')),
      tbtn('B', 'email-bold', () => exec('bold')),
      tbtn('I', 'email-italic', () => exec('italic')),
      tbtn('• List', 'email-ul', () => exec('insertUnorderedList')),
      tbtn('Link', 'email-link', () => { const u = prompt('Link URL', 'https://'); if (u) exec('createLink', u); }),
      tbtn('Image', 'email-image', () => { const u = prompt('Image URL', 'https://'); if (u) insertHtml('<img src="' + u + '" style="max-width:100%"/>'); }),
      tbtn('Button', 'email-button', () => { const t = prompt('Button text', 'Learn more'); const u = prompt('Button URL', 'https://'); if (t && u) insertHtml('<p><a href="' + u + '" style="display:inline-block;background:#2f6df6;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600">' + t + '</a></p>'); }),
      mergeSel,
      tbtn('Import', 'email-import', () => importModal()),
      tbtn('</> HTML', 'email-toggle-html', toggleRaw));

    const saveBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'email-design-save' }, el('i', { class: 'fa-solid fa-floppy-disk' }), 'Save template');
    saveBtn.addEventListener('click', async () => {
      if (!nameI.value.trim()) { toast('Template name required', 'error'); return; }
      const body = { name: nameI.value.trim(), subject: subjI.value.trim(), category: catI.value.trim() || 'General', html: currentHtml() };
      try { if (id) await api.put('/email/templates/' + id, body); else await api.post('/email/templates', body); toast('Template saved', 'success'); window.location.hash = '#/emailTemplates'; }
      catch (e) { toast(e.message, 'error'); }
    });
    const backBtn = el('button', { class: 'btn', 'data-testid': 'email-design-back', onclick: () => { window.location.hash = '#/emailTemplates'; } }, 'Back');

    view.appendChild(el('div', { style: 'display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap' },
      el('div', { class: 'field', style: 'flex:1;min-width:180px' }, el('label', {}, 'Name'), nameI),
      el('div', { class: 'field', style: 'flex:1;min-width:180px' }, el('label', {}, 'Subject'), subjI),
      el('div', { class: 'field', style: 'width:140px' }, el('label', {}, 'Category'), catI)));
    view.appendChild(el('div', { style: 'display:flex;gap:16px;align-items:flex-start' },
      el('div', { style: 'flex:1;min-width:0' }, el('div', { class: 'section-title' }, 'Editor'), toolbar, canvas, rawArea),
      el('div', { style: 'flex:1;min-width:0' }, el('div', { class: 'section-title' }, 'Live preview'), preview)));
    view.appendChild(el('div', { style: 'display:flex;gap:8px;margin-top:16px' }, saveBtn, backBtn));
    refreshPreview();

    function importModal() {
      const ta = el('textarea', { class: 'input', rows: '8', placeholder: '<html>…paste your email HTML here…</html>', 'data-testid': 'email-import-html' });
      const file = el('input', { type: 'file', accept: '.html,.htm', 'data-testid': 'email-import-file' });
      file.addEventListener('change', () => { if (file.files[0]) { const r = new FileReader(); r.onload = () => ta.value = r.result; r.readAsText(file.files[0]); } });
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'email-import-apply' }, 'Import');
      const m = modal({ title: 'Import HTML', bodyNode: el('div', {}, el('div', { class: 'field' }, el('label', {}, 'Upload .html'), file), el('div', { class: 'field' }, el('label', {}, 'or paste HTML'), ta)), footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', () => { if (!ta.value.trim()) { toast('Nothing to import', 'error'); return; } if (rawMode) rawArea.value = ta.value; else canvas.innerHTML = ta.value; refreshPreview(); m.close(); toast('Imported', 'success'); });
    }
  };

  // ========================= CAMPAIGNS =========================
  CRM.pages.emailCampaigns = async function (view) {
    const addBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'email-camp-new', onclick: () => campaignModal() }, el('i', { class: 'fa-solid fa-paper-plane' }), 'New Campaign');
    CRM.setActions(addBtn);
    view.innerHTML = '<div class="spinner"></div>';
    const { campaigns } = await api.get('/email/campaigns');
    view.innerHTML = '';
    if (!campaigns.length) { view.appendChild(el('div', { class: 'empty' }, el('i', { class: 'fa-solid fa-paper-plane' }), el('div', {}, 'No campaigns yet'))); return; }
    const rows = campaigns.map(c => {
      const openRate = c.sent_count ? Math.round((c.open_count / c.sent_count) * 100) : 0;
      const clickRate = c.sent_count ? Math.round((c.click_count / c.sent_count) * 100) : 0;
      const action = c.status === 'sent'
        ? el('span', { class: 'chip', style: 'color:var(--won)' }, 'sent ' + (c.sent_at ? timeAgo(c.sent_at) : ''))
        : el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'email-camp-send-' + c.id, onclick: async () => { try { const r = await api.post('/email/campaigns/' + c.id + '/send'); toast('Sent to ' + r.sent + ' (failed ' + r.failed + ')', 'success'); CRM.render(); } catch (e) { toast(e.message, 'error'); } } }, 'Send now');
      return el('tr', { 'data-testid': 'email-camp-row-' + c.id },
        el('td', {}, c.name), el('td', { style: 'color:var(--text-3)' }, c.subject),
        el('td', {}, c.audience_type + (c.audience_value ? (':' + c.audience_value) : '')), el('td', {}, String(c.recipients)),
        el('td', {}, c.status === 'sent' ? (c.sent_count + '✓') : '—'),
        el('td', {}, c.status === 'sent' ? (openRate + '% / ' + clickRate + '%') : '—'),
        el('td', {}, action));
    });
    view.appendChild(el('div', { style: 'color:var(--text-3);font-size:12px;margin-bottom:10px' }, 'Opens % / Clicks % are tracked per campaign.'));
    view.appendChild(tableWrap(['Name', 'Subject', 'Audience', 'Recipients', 'Sent', 'Open/Click', ''], rows));

    async function campaignModal() {
      const { templates } = await api.get('/email/templates');
      const f = { name: '', subject: '', template_id: '', html: '', audience_type: 'all', audience_value: '', from_name: '', from_email: '' };
      const nameI = el('input', { class: 'input', 'data-testid': 'email-camp-name' }); nameI.addEventListener('input', () => f.name = nameI.value);
      const subjI = el('input', { class: 'input', 'data-testid': 'email-camp-subject' }); subjI.addEventListener('input', () => f.subject = subjI.value);
      const tplSel = el('select', { class: 'input', 'data-testid': 'email-camp-template' }, el('option', { value: '' }, 'Select a template…'), ...templates.map(t => el('option', { value: t.id }, t.name)));
      tplSel.addEventListener('change', () => { const t = templates.find(x => String(x.id) === tplSel.value); if (t) { f.template_id = t.id; f.html = t.html; if (!f.subject) { f.subject = t.subject || ''; subjI.value = f.subject; } } });
      const audType = el('select', { class: 'input', 'data-testid': 'email-camp-audience' }, ...[['all', 'All contacts'], ['status', 'By status'], ['temperature', 'By temperature'], ['source', 'By source']].map(([v, l]) => el('option', { value: v }, l)));
      const audVal = el('input', { class: 'input', placeholder: 'e.g. new / hot', 'data-testid': 'email-camp-audience-value', style: 'display:none' });
      audType.addEventListener('change', () => { f.audience_type = audType.value; audVal.style.display = audType.value === 'all' ? 'none' : ''; });
      audVal.addEventListener('input', () => f.audience_value = audVal.value);
      const fromN = el('input', { class: 'input', placeholder: 'Sales Team', 'data-testid': 'email-camp-fromname' }); fromN.addEventListener('input', () => f.from_name = fromN.value);
      const fromE = el('input', { class: 'input', placeholder: 'hello@yourco.com', 'data-testid': 'email-camp-fromemail' }); fromE.addEventListener('input', () => f.from_email = fromE.value);
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'email-camp-save' }, 'Create campaign');
      const m = modal({ title: 'New Email Campaign', bodyNode: el('div', {},
        el('div', { class: 'field' }, el('label', {}, 'Name'), nameI),
        el('div', { class: 'field' }, el('label', {}, 'Template'), tplSel),
        el('div', { class: 'field' }, el('label', {}, 'Subject'), subjI),
        el('div', { class: 'field' }, el('label', {}, 'Audience'), audType),
        el('div', { class: 'field' }, audVal),
        el('div', { style: 'display:flex;gap:10px' }, el('div', { class: 'field', style: 'flex:1' }, el('label', {}, 'From name'), fromN), el('div', { class: 'field', style: 'flex:1' }, el('label', {}, 'From email'), fromE))),
        footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Cancel'), save] });
      save.addEventListener('click', async () => {
        if (!f.name || !f.subject) { toast('Name & subject required', 'error'); return; }
        if (!f.html) { toast('Pick a template', 'error'); return; }
        try { await api.post('/email/campaigns', { name: f.name, subject: f.subject, template_id: f.template_id || null, html: f.html, audience_type: f.audience_type, audience_value: f.audience_value || null, from_name: f.from_name || null, from_email: f.from_email || null }); toast('Campaign created', 'success'); m.close(); CRM.render(); }
        catch (e) { toast(e.message, 'error'); }
      });
    }
  };
})();
