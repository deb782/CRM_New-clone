// ---- P4: WhatsApp Campaign Manager (segmented template broadcasts + analytics) ----
(function () {
  const { el, api, toast } = CRM;
  const STATUS_COLOR = { draft: 'var(--text-3)', scheduled: 'var(--warm)', sending: 'var(--cold)', sent: 'var(--won)', cancelled: 'var(--hot)' };

  let CACHE = { templates: [], filters: {} };

  CRM.pages.waCampaigns = async function (view) {
    if (!CRM.can('messaging.manage')) { view.innerHTML = '<div class="empty">No access.</div>'; return; }
    CRM.setActions(el('button', { class: 'btn btn--primary', 'data-testid': 'camp-new', onclick: () => editCampaign(null) }, el('i', { class: 'fa-solid fa-plus' }), 'New campaign'));
    view.innerHTML = '<div class="spinner"></div>';
    const data = await api.get('/wa-campaigns');
    CACHE = { templates: data.templates || [], filters: data.filters || {} };
    view.innerHTML = '';
    view.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:16px' }, 'Broadcast an approved WhatsApp template to a segment of leads, now or on a schedule, and track delivery, read and reply rates.'));

    if (!data.campaigns.length) { view.appendChild(el('div', { class: 'empty', 'data-testid': 'camp-empty' }, el('i', { class: 'fa-solid fa-bullhorn' }), el('div', {}, 'No campaigns yet — click New campaign'))); return; }

    const grid = el('div', { class: 'flow-cards' });
    data.campaigns.forEach(c => {
      const st = c.stats || { total: 0 };
      grid.appendChild(el('div', { class: 'camp-card', 'data-testid': 'camp-card-' + c.id, onclick: () => openAnalytics(c.id) },
        el('div', { class: 'fc-top' }, el('div', { class: 'fc-name' }, el('i', { class: 'fa-solid fa-bullhorn' }), c.name), el('span', { class: 'chip', style: 'color:' + (STATUS_COLOR[c.status] || 'var(--text-3)') }, c.status)),
        el('div', { class: 'fc-meta' }, el('span', {}, c.template_name || 'no template'), el('span', {}, (st.total || 0) + ' recipients')),
        c.status === 'sent' ? miniFunnel(st) : el('div', { class: 'fc-desc' }, c.scheduled_at ? 'Scheduled: ' + new Date(c.scheduled_at).toLocaleString() : 'Draft — not sent'),
        el('div', { class: 'camp-actions' },
          c.status !== 'sent' ? el('button', { class: 'btn btn--primary btn--sm', 'data-testid': 'camp-send-' + c.id, onclick: (e) => { e.stopPropagation(); launch(c.id); } }, el('i', { class: 'fa-solid fa-paper-plane' }), 'Send now') : el('span', {}),
          el('button', { class: 'icon-btn', 'data-testid': 'camp-del-' + c.id, onclick: async (e) => { e.stopPropagation(); if (!confirm('Delete campaign?')) return; await api.del('/wa-campaigns/' + c.id); toast('Deleted', 'success'); CRM.render(); } }, el('i', { class: 'fa-solid fa-trash' })))));
    });
    view.appendChild(grid);
  };

  function miniFunnel(st) {
    const rows = [['Sent', st.sent || 0, 'var(--cold)'], ['Delivered', st.delivered || 0, 'var(--warm)'], ['Read', st.read || 0, '#7C3AED'], ['Replied', st.replied || 0, 'var(--won)']];
    const total = st.total || 1;
    return el('div', { class: 'camp-funnel' }, ...rows.map(([lbl, val, col]) => el('div', { class: 'cf-row' },
      el('span', { class: 'cf-lbl' }, lbl),
      el('div', { class: 'cf-track' }, (() => { const f = el('div', { class: 'cf-fill', style: 'width:0;background:' + col }); setTimeout(() => f.style.width = Math.round(val / total * 100) + '%', 40); return f; })()),
      el('b', {}, String(val)))));
  }

  async function launch(id) {
    try { const r = await api.post('/wa-campaigns/' + id + '/launch'); toast(r.message, 'success'); CRM.render(); }
    catch (e) { toast(e.data && e.data.message ? e.data.message : e.message, 'error'); }
  }

  async function openAnalytics(id) {
    const { campaign, recipients } = await api.get('/wa-campaigns/' + id);
    const st = campaign.stats || {};
    const body = el('div', {},
      campaign.simulated ? el('div', { class: 'sim-banner' }, el('i', { class: 'fa-solid fa-flask' }), ' Sandbox mode — analytics are simulated. Connect WhatsApp to send for real and track live delivery/read/reply.') : null,
      el('div', { class: 'camp-stats' },
        stat('Recipients', st.total || 0), stat('Sent', st.sent || 0), stat('Delivered', st.delivered || 0), stat('Read', st.read || 0), stat('Replied', st.replied || 0), stat('Failed', st.failed || 0)),
      miniFunnel(st),
      el('h4', { style: 'margin:18px 0 8px;font-size:13px' }, 'Recipients'),
      el('div', { class: 'table-wrap', style: 'max-height:320px;overflow:auto' },
        el('table', {}, el('thead', {}, el('tr', {}, el('th', {}, 'Name'), el('th', {}, 'Phone'), el('th', {}, 'Status'))),
          el('tbody', {}, ...recipients.map(r => el('tr', {}, el('td', {}, r.name || '—'), el('td', { class: 'mono' }, r.phone), el('td', {}, el('span', { class: 'chip', style: 'color:' + rColor(r.status) }, r.status))))))));
    CRM.modal({ title: campaign.name, bodyNode: body, wide: true });
  }
  function stat(l, v) { return el('div', { class: 'camp-stat' }, el('div', { class: 'cs-val' }, String(v)), el('div', { class: 'cs-lbl' }, l)); }
  function rColor(s) { return { replied: 'var(--won)', read: '#7C3AED', delivered: 'var(--warm)', sent: 'var(--cold)', failed: 'var(--hot)', queued: 'var(--text-3)' }[s] || 'var(--text-3)'; }

  function editCampaign() {
    const t = { name: '', template_id: CACHE.templates[0] ? CACHE.templates[0].id : null, audience: {}, scheduled_at: '' };
    const nameI = el('input', { class: 'input', placeholder: 'e.g. Diwali offer blast', 'data-testid': 'camp-name' });
    const tplSel = el('select', { class: 'input', 'data-testid': 'camp-template' }, ...(CACHE.templates.length ? CACHE.templates.map(tp => el('option', { value: tp.id }, tp.name + ' (' + tp.language + ')')) : [el('option', { value: '' }, 'No approved templates yet')]));
    const preview = el('div', { class: 'camp-tpl-preview' });
    const drawPreview = () => { const tp = CACHE.templates.find(x => String(x.id) === tplSel.value); preview.textContent = tp ? tp.body : '—'; };
    tplSel.addEventListener('change', drawPreview); drawPreview();

    const audience = {};
    const countEl = el('b', { 'data-testid': 'camp-audience-count' }, '…');
    const refreshCount = async () => { try { const r = await api.post('/wa-campaigns/preview', { audience }); countEl.textContent = r.count; } catch (e) { countEl.textContent = '?'; } };
    const multi = (key, opts) => {
      const box = el('div', { class: 'agent-pick' });
      (opts || []).forEach(o => {
        const v = typeof o === 'object' ? o.id : o; const lbl = typeof o === 'object' ? o.name : o;
        const cb = el('input', { type: 'checkbox' });
        cb.addEventListener('change', () => { audience[key] = (audience[key] || []); if (cb.checked) audience[key].push(v); else audience[key] = audience[key].filter(x => x !== v); if (!audience[key].length) delete audience[key]; refreshCount(); });
        box.appendChild(el('label', { class: 'agent-chip' }, cb, el('span', {}, String(lbl))));
      });
      return box;
    };
    const f = CACHE.filters;
    const field = (l, n) => el('div', { class: 'tpl-field', style: 'margin-bottom:14px' }, el('label', {}, l), n);
    const schedI = el('input', { type: 'datetime-local', class: 'input', 'data-testid': 'camp-schedule' });

    refreshCount();
    const form = el('div', { class: 'camp-form' },
      field('Campaign name', nameI),
      field('Template (approved only)', el('div', {}, tplSel, preview)),
      el('div', { class: 'camp-audience' },
        el('div', { class: 'ca-head' }, 'Audience', el('span', {}, 'Matching leads: ', countEl)),
        field('Temperature', multi('temperature', f.temperature)),
        field('Stage', multi('status', f.status)),
        field('Source', multi('source', f.source)),
        field('Owner', multi('owner_id', (f.owners || [])))),
      field('Schedule (optional — leave blank to send now)', schedI));

    const save = el('button', { class: 'btn btn--primary', 'data-testid': 'camp-save', onclick: async () => {
      if (!nameI.value.trim()) { toast('Name required', 'error'); return; }
      try {
        const payload = { name: nameI.value, template_id: Number(tplSel.value) || null, audience, scheduled_at: schedI.value ? schedI.value.replace('T', ' ') : null };
        const r = await api.post('/wa-campaigns', payload);
        toast(schedI.value ? 'Campaign scheduled' : 'Draft saved', 'success');
        m.close();
        if (!schedI.value && confirm('Send this campaign now?')) await launch(r.campaign.id); else CRM.render();
      } catch (e) { toast(e.data && e.data.message ? e.data.message : e.message, 'error'); }
    } }, 'Save');
    const m = CRM.modal({ title: 'New campaign', bodyNode: form, wide: true, footNodes: [save] });
  }
})();
