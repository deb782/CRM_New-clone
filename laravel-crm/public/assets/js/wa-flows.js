// ---- P2: Visual WhatsApp Chatbot / Flow Builder ----
(function () {
  const { el, api, toast } = CRM;

  const TYPE = {
    message: { icon: 'fa-message', color: 'var(--cold)', label: 'Message' },
    buttons: { icon: 'fa-hand-pointer', color: 'var(--lime)', label: 'Buttons' },
    list: { icon: 'fa-list-ul', color: '#7C3AED', label: 'List menu' },
    capture: { icon: 'fa-keyboard', color: 'var(--warm)', label: 'Capture' },
    handoff: { icon: 'fa-headset', color: 'var(--hot)', label: 'Agent handoff' },
    end: { icon: 'fa-flag-checkered', color: 'var(--text-3)', label: 'End' },
  };
  const CAPTURE_FIELDS = ['name', 'email', 'phone', 'preferred_location', 'property_type', 'budget_max', 'timeline', 'note'];

  // ============================ LIST VIEW ============================
  CRM.pages.waFlows = async function (view) {
    if (!CRM.can('messaging.manage')) { view.innerHTML = '<div class="empty">You do not have access to the bot builder.</div>'; return; }
    CRM.setActions(el('div', { style: 'display:flex;gap:8px' },
      el('button', { class: 'btn', 'data-testid': 'wa-flow-templates', onclick: () => openTemplatesPicker(view) }, el('i', { class: 'fa-solid fa-bookmark' }), 'Templates'),
      el('button', { class: 'btn btn--primary', 'data-testid': 'wa-flow-new', onclick: () => newFlow() }, el('i', { class: 'fa-solid fa-plus' }), 'New bot')));
    view.innerHTML = '<div class="spinner"></div>';
    const { flows } = await api.get('/wa-flows');
    view.innerHTML = '';
    view.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:14px' }, 'Design automated WhatsApp conversations — buttons, list menus, capture answers and hand off to an agent. Test them live here; they run for real once WhatsApp is connected.'));
    if (!flows.length) { view.appendChild(el('div', { class: 'empty', 'data-testid': 'wa-flow-empty' }, el('i', { class: 'fa-solid fa-robot' }), el('div', {}, 'No bots yet — click New bot'))); return; }
    const grid = el('div', { class: 'flow-cards' });
    flows.forEach(f => grid.appendChild(el('div', { class: 'flow-card', 'data-testid': 'wa-flow-card-' + f.id, onclick: () => openBuilder(view, f.id) },
      el('div', { class: 'fc-top' },
        el('div', { class: 'fc-name' }, el('i', { class: 'fa-solid fa-robot' }), f.name),
        el('div', { style: 'display:flex;align-items:center;gap:8px' },
          el('button', { class: 'icon-btn', title: 'Analytics', 'data-testid': 'wa-flow-analytics-' + f.id, onclick: (e) => { e.stopPropagation(); openAnalytics(f.id, f.name); } }, el('i', { class: 'fa-solid fa-chart-simple' })),
          el('span', { class: 'chip', style: 'color:' + (f.status === 'active' ? 'var(--won)' : 'var(--text-3)') }, f.status))),
      el('div', { class: 'fc-meta' },
        el('span', {}, f.trigger_type === 'default' ? 'Default (fallback)' : 'Keyword: ' + ((f.keywords || []).join(', ') || '—')),
        el('span', {}, (f.node_count || 0) + ' steps')),
      el('div', { class: 'fc-desc' }, f.description || 'No description'))));
    view.appendChild(grid);

    async function newFlow() {
      const name = prompt('Name your WhatsApp bot:', 'Welcome bot');
      if (!name) return;
      try { const r = await api.post('/wa-flows', { name, trigger_type: 'default', keywords: [] }); openBuilder(view, r.flow.id); }
      catch (e) { toast(e.message, 'error'); }
    }
  };

  // ============================ BUILDER ============================
  async function openBuilder(host, id) {
    const { flow } = await api.get('/wa-flows/' + id);
    const graph = flow.graph && flow.graph.nodes ? flow.graph : { entry: 'start', nodes: {} };
    let counter = Object.keys(graph.nodes).length + 1;

    CRM.setActions(null);
    host.innerHTML = '';

    // ---- top bar ----
    const nameInput = el('input', { class: 'input flow-name', value: flow.name, 'data-testid': 'flow-name' });
    const trigSel = el('select', { class: 'input', 'data-testid': 'flow-trigger' }, ...['default', 'keyword'].map(o => el('option', { value: o, selected: flow.trigger_type === o }, o === 'default' ? 'Default (fallback bot)' : 'Keyword trigger')));
    const kwInput = el('input', { class: 'input', value: (flow.keywords || []).join(', '), placeholder: 'e.g. hi, price, visit', style: flow.trigger_type === 'keyword' ? '' : 'display:none', 'data-testid': 'flow-keywords' });
    trigSel.addEventListener('change', () => { kwInput.style.display = trigSel.value === 'keyword' ? '' : 'none'; });
    const statusChip = el('span', { class: 'chip', 'data-testid': 'flow-status', style: 'color:' + (flow.status === 'active' ? 'var(--won)' : 'var(--text-3)') }, flow.status);

    const save = async (silent) => {
      try {
        await api.put('/wa-flows/' + id, { name: nameInput.value, description: flow.description, trigger_type: trigSel.value, keywords: kwInput.value.split(',').map(s => s.trim()).filter(Boolean), graph });
        if (!silent) toast('Bot saved', 'success');
      } catch (e) { toast(e.data && e.data.message ? e.data.message : e.message, 'error'); }
    };

    const bar = el('div', { class: 'flow-bar' },
      el('button', { class: 'icon-btn', 'data-testid': 'flow-back', onclick: () => { location.hash = '#/waFlows'; } }, el('i', { class: 'fa-solid fa-arrow-left' })),
      nameInput, trigSel, kwInput, statusChip,
      el('div', { style: 'flex:1' }),
      el('button', { class: 'btn', 'data-testid': 'flow-test', onclick: async () => { await save(true); openSimulator(id); } }, el('i', { class: 'fa-solid fa-play' }), 'Test'),
      el('button', { class: 'btn', 'data-testid': 'flow-analytics', onclick: () => openAnalytics(id, flow.name) }, el('i', { class: 'fa-solid fa-chart-simple' }), 'Analytics'),
      el('button', { class: 'btn', 'data-testid': 'flow-save-template', onclick: async () => { await save(true); saveAsTemplate(id, nameInput.value); } }, el('i', { class: 'fa-solid fa-bookmark' }), 'Save as template'),
      el('button', { class: 'btn', 'data-testid': 'flow-save', onclick: () => save() }, el('i', { class: 'fa-solid fa-floppy-disk' }), 'Save'),
      el('button', { class: 'btn btn--primary', 'data-testid': 'flow-activate', onclick: async () => {
        await save(true);
        const makeActive = flow.status !== 'active';
        try { const r = await api.post('/wa-flows/' + id + '/activate', { active: makeActive }); flow.status = r.flow.status; statusChip.textContent = flow.status; statusChip.style.color = flow.status === 'active' ? 'var(--won)' : 'var(--text-3)'; toast(flow.status === 'active' ? 'Bot is now live' : 'Bot paused', 'success'); }
        catch (e) { toast(e.message, 'error'); }
      } }, el('i', { class: 'fa-solid fa-bolt' }), 'Activate'));

    // ---- palette ----
    const palette = el('div', { class: 'flow-palette' },
      el('span', { class: 'fp-label' }, 'Add step'),
      ...Object.keys(TYPE).filter(t => t !== 'end' || true).map(t => el('button', { class: 'fp-btn', 'data-testid': 'add-node-' + t, title: TYPE[t].label, onclick: () => addNode(t) },
        el('i', { class: 'fa-solid ' + TYPE[t].icon, style: 'color:' + TYPE[t].color }), TYPE[t].label)));

    // ---- canvas ----
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'flow-svg');
    const canvas = el('div', { class: 'flow-canvas', 'data-testid': 'flow-canvas' }, svg);
    const wrap = el('div', { class: 'flow-canvas-wrap' }, canvas);

    host.appendChild(el('div', { class: 'flow-builder' }, bar, palette, wrap));

    const cardEls = {};

    function nodeOptions(excludeKey) {
      return [el('option', { value: '' }, '— end —'), ...Object.values(graph.nodes).filter(n => n.key !== excludeKey).map(n => el('option', { value: n.key }, n.title || n.key))];
    }
    function targetSelect(currentVal, exclude, onChange) {
      const s = el('select', { class: 'input flow-target' }, ...nodeOptions(exclude));
      s.value = currentVal || '';
      s.addEventListener('change', () => { onChange(s.value || null); drawConnectors(); });
      s.addEventListener('pointerdown', e => e.stopPropagation());
      return s;
    }

    function addNode(type) {
      const key = 'n' + (counter++);
      const cfg = { message: { text: '', next: null }, buttons: { text: '', buttons: [{ id: 'o1', label: 'Option 1', next: null }] }, list: { text: '', button_label: 'Choose', rows: [{ id: 'r1', label: 'Item 1', description: '', next: null }] }, capture: { text: '', field: 'name', next: null }, handoff: { note: 'Connecting you to an agent…' }, end: { text: '' } }[type];
      graph.nodes[key] = { key, type, title: TYPE[type].label, config: cfg, x: 60 + Object.keys(graph.nodes).length % 4 * 300, y: 60 + Math.floor(Object.keys(graph.nodes).length / 4) * 260 };
      if (!graph.entry) graph.entry = key;
      renderCards();
    }
    function deleteNode(key) {
      if (graph.entry === key) { toast('This is the start step — set another as start first (drag it to the top or delete others).', 'error'); return; }
      delete graph.nodes[key];
      Object.values(graph.nodes).forEach(n => {
        const c = n.config;
        if (c.next === key) c.next = null;
        (c.buttons || []).forEach(b => { if (b.next === key) b.next = null; });
        (c.rows || []).forEach(r => { if (r.next === key) r.next = null; });
      });
      renderCards();
    }
    function setEntry(key) { graph.entry = key; renderCards(); }

    function buildCard(n) {
      const meta = TYPE[n.type];
      const isEntry = graph.entry === n.key;
      const title = el('input', { class: 'fn-title', value: n.title || meta.label });
      title.addEventListener('input', () => n.title = title.value);
      title.addEventListener('pointerdown', e => e.stopPropagation());

      const header = el('div', { class: 'fn-head', style: '--nc:' + meta.color },
        el('i', { class: 'fa-solid ' + meta.icon }), title,
        isEntry ? el('span', { class: 'fn-start', title: 'Start step' }, el('i', { class: 'fa-solid fa-star' })) : el('button', { class: 'fn-x', title: 'Set as start', onclick: (e) => { e.stopPropagation(); setEntry(n.key); } }, el('i', { class: 'fa-regular fa-star' })),
        el('button', { class: 'fn-x', title: 'Delete', onclick: (e) => { e.stopPropagation(); deleteNode(n.key); } }, el('i', { class: 'fa-solid fa-trash' })));

      const bodyRows = [];
      const ta = (val, ph, on) => { const t = el('textarea', { class: 'input fn-ta', rows: 2, placeholder: ph }, val || ''); t.addEventListener('input', () => on(t.value)); t.addEventListener('pointerdown', e => e.stopPropagation()); return t; };
      const outRow = (label, targetVal, exclude, onSet) => el('div', { class: 'fn-out' }, el('span', { class: 'fn-out-lbl' }, label), targetSelect(targetVal, exclude, onSet), el('span', { class: 'flow-anchor', 'data-node': n.key, 'data-target': targetVal || '' }));

      if (n.type === 'message') {
        bodyRows.push(ta(n.config.text, 'Message text…', v => n.config.text = v));
        bodyRows.push(outRow('Next', n.config.next, n.key, v => n.config.next = v));
      } else if (n.type === 'capture') {
        bodyRows.push(ta(n.config.text, 'Question to ask…', v => n.config.text = v));
        const fsel = el('select', { class: 'input' }, ...CAPTURE_FIELDS.map(f => el('option', { value: f, selected: n.config.field === f }, 'Save to: ' + f)));
        fsel.addEventListener('change', () => n.config.field = fsel.value); fsel.addEventListener('pointerdown', e => e.stopPropagation());
        bodyRows.push(fsel);
        bodyRows.push(outRow('Next', n.config.next, n.key, v => n.config.next = v));
      } else if (n.type === 'buttons' || n.type === 'list') {
        bodyRows.push(ta(n.config.text, n.type === 'buttons' ? 'Prompt above buttons…' : 'Prompt above the list…', v => n.config.text = v));
        if (n.type === 'list') {
          const blbl = el('input', { class: 'input', value: n.config.button_label || 'Choose', placeholder: 'List button label (e.g. View projects)', maxlength: 20, 'data-testid': 'fn-list-btn-' + n.key });
          blbl.addEventListener('input', () => n.config.button_label = blbl.value);
          blbl.addEventListener('pointerdown', e => e.stopPropagation());
          bodyRows.push(el('div', { class: 'fn-hint', style: 'font-size:11px;color:var(--text-3);margin:2px 0' }, 'Menu button label'), blbl);
        }
        const optsKey = n.type === 'buttons' ? 'buttons' : 'rows';
        const optWrap = el('div', { class: 'fn-opts' });
        const drawOpts = () => {
          optWrap.innerHTML = '';
          n.config[optsKey].forEach((o, i) => {
            const lbl = el('input', { class: 'input', value: o.label, placeholder: 'Label', style: 'flex:1' });
            lbl.addEventListener('input', () => o.label = lbl.value); lbl.addEventListener('pointerdown', e => e.stopPropagation());
            const anchor = el('span', { class: 'flow-anchor', 'data-node': n.key, 'data-target': o.next || '' });
            const tgt = targetSelect(o.next, n.key, v => { o.next = v; anchor.setAttribute('data-target', v || ''); });
            const del = el('button', { class: 'fn-x', onclick: (e) => { e.stopPropagation(); n.config[optsKey].splice(i, 1); drawOpts(); drawConnectors(); } }, el('i', { class: 'fa-solid fa-xmark' }));
            const rowTop = el('div', { class: 'fn-opt' }, el('span', { class: 'fn-opt-ic' }, el('i', { class: 'fa-solid ' + (n.type === 'buttons' ? 'fa-reply' : 'fa-circle-dot') })), lbl, tgt, del, anchor);
            if (n.type === 'list') {
              const desc = el('input', { class: 'input', value: o.description || '', placeholder: 'Description (optional)', style: 'flex:1;font-size:12px', 'data-testid': 'fn-row-desc-' + o.id });
              desc.addEventListener('input', () => o.description = desc.value); desc.addEventListener('pointerdown', e => e.stopPropagation());
              optWrap.appendChild(el('div', { class: 'fn-opt-list' }, rowTop, el('div', { style: 'padding-left:24px;margin-top:4px' }, desc)));
            } else {
              optWrap.appendChild(rowTop);
            }
          });
        };
        drawOpts();
        const addOpt = el('button', { class: 'fn-add', onclick: (e) => { e.stopPropagation(); const idx = n.config[optsKey].length + 1; if (n.type === 'buttons' && n.config.buttons.length >= 3) { toast('WhatsApp allows max 3 buttons', 'error'); return; } if (n.type === 'list' && n.config.rows.length >= 10) { toast('WhatsApp allows max 10 list rows', 'error'); return; } n.config[optsKey].push({ id: (n.type === 'buttons' ? 'o' : 'r') + idx, label: 'Option ' + idx, next: null, description: '' }); drawOpts(); drawConnectors(); } }, el('i', { class: 'fa-solid fa-plus' }), n.type === 'buttons' ? 'Add button' : 'Add row');
        bodyRows.push(optWrap, addOpt);
      } else if (n.type === 'handoff') {
        bodyRows.push(ta(n.config.note, 'Message before handing to agent…', v => n.config.note = v));
        bodyRows.push(el('div', { class: 'fn-terminal' }, el('i', { class: 'fa-solid fa-headset' }), 'Assigns the chat to a human agent'));
      } else if (n.type === 'end') {
        bodyRows.push(ta(n.config.text, 'Closing message (optional)…', v => n.config.text = v));
        bodyRows.push(el('div', { class: 'fn-terminal' }, el('i', { class: 'fa-solid fa-flag-checkered' }), 'Ends the conversation'));
      }

      const card = el('div', { class: 'flow-node', 'data-testid': 'flow-node-' + n.key, 'data-key': n.key, style: 'left:' + (n.x || 40) + 'px;top:' + (n.y || 40) + 'px' }, header, el('div', { class: 'fn-body' }, ...bodyRows));

      // drag via header
      header.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button') || e.target.closest('input')) return;
        const sx = e.clientX, sy = e.clientY, ox = n.x || 40, oy = n.y || 40;
        const move = (ev) => { n.x = Math.max(0, ox + ev.clientX - sx); n.y = Math.max(0, oy + ev.clientY - sy); card.style.left = n.x + 'px'; card.style.top = n.y + 'px'; drawConnectors(); };
        const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up); };
        document.addEventListener('pointermove', move); document.addEventListener('pointerup', up);
      });
      return card;
    }

    function renderCards() {
      Object.keys(cardEls).forEach(k => { if (cardEls[k] && cardEls[k].parentNode) cardEls[k].remove(); delete cardEls[k]; });
      Object.values(graph.nodes).forEach(n => { const c = buildCard(n); cardEls[n.key] = c; canvas.appendChild(c); });
      requestAnimationFrame(drawConnectors);
    }

    function drawConnectors() {
      const cr = canvas.getBoundingClientRect();
      svg.innerHTML = '';
      canvas.querySelectorAll('.flow-anchor').forEach(a => {
        const target = a.getAttribute('data-target');
        if (!target || !cardEls[target]) return;
        const ar = a.getBoundingClientRect();
        const tr = cardEls[target].getBoundingClientRect();
        const x1 = ar.left - cr.left + 6, y1 = ar.top - cr.top + 6;
        const x2 = tr.left - cr.left + 14, y2 = tr.top - cr.top + 4;
        const dx = Math.max(40, Math.abs(x2 - x1) / 2);
        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', `M${x1},${y1} C${x1 + dx},${y1} ${x2 - dx},${y2} ${x2},${y2}`);
        p.setAttribute('class', 'flow-link');
        svg.appendChild(p);
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', x2); dot.setAttribute('cy', y2); dot.setAttribute('r', '4'); dot.setAttribute('class', 'flow-link-dot');
        svg.appendChild(dot);
      });
    }

    renderCards();
    window.addEventListener('resize', drawConnectors);
  }

  // ============================ TEST SIMULATOR ============================
  async function openSimulator(id) {
    let state = null, done = false;
    const chat = el('div', { class: 'sim-chat', 'data-testid': 'sim-chat' });
    const inputBar = el('div', { class: 'sim-input' });

    function botText(t) { chat.appendChild(el('div', { class: 'sim-msg bot' }, t)); }
    function userText(t) { chat.appendChild(el('div', { class: 'sim-msg user' }, t)); }
    function scroll() { chat.scrollTop = chat.scrollHeight; }

    function renderInput(last) {
      inputBar.innerHTML = '';
      if (done) { inputBar.appendChild(el('button', { class: 'btn btn--primary', 'data-testid': 'sim-restart', onclick: () => run(null, null) }, 'Restart')); return; }
      if (last && last.type === 'buttons') {
        last.buttons.forEach(b => inputBar.appendChild(el('button', { class: 'sim-chip', 'data-testid': 'sim-btn-' + b.id, onclick: () => run(b.id, b.label) }, b.label)));
      } else if (last && last.type === 'list') {
        last.rows.forEach(r => inputBar.appendChild(el('button', { class: 'sim-chip', 'data-testid': 'sim-row-' + r.id, onclick: () => run(r.id, r.label) }, r.label)));
      } else {
        const t = el('input', { class: 'input', placeholder: 'Type a reply…', 'data-testid': 'sim-text' });
        const send = () => { if (t.value.trim()) run(t.value.trim(), t.value.trim()); };
        t.addEventListener('keydown', e => { if (e.key === 'Enter') send(); });
        inputBar.appendChild(t);
        inputBar.appendChild(el('button', { class: 'btn btn--primary', onclick: send }, el('i', { class: 'fa-solid fa-paper-plane' })));
      }
    }

    async function run(input, display) {
      if (display) userText(display);
      try {
        const r = await api.post('/wa-flows/' + id + '/test', input === null ? {} : { state, input });
        state = r.state; done = r.done;
        (r.messages || []).forEach(m => {
          botText(m.text || '');
          if (m.type === 'buttons') chat.appendChild(el('div', { class: 'sim-hint' }, (m.buttons || []).map(b => b.label).join(' · ')));
          if (m.type === 'list') chat.appendChild(el('div', { class: 'sim-hint' }, (m.rows || []).map(x => x.label).join(' · ')));
        });
        if (r.action === 'handoff') chat.appendChild(el('div', { class: 'sim-note' }, '✅ Handed off to a human agent'));
        if (done && r.action !== 'handoff') chat.appendChild(el('div', { class: 'sim-note' }, '— conversation ended —'));
        renderInput((r.messages || [])[r.messages.length - 1]);
        scroll();
      } catch (e) { toast(e.message, 'error'); }
    }

    CRM.modal({ title: 'Test your bot', bodyNode: el('div', { class: 'sim-wrap' }, el('div', { class: 'sim-phone' }, el('div', { class: 'sim-topbar' }, el('i', { class: 'fa-brands fa-whatsapp' }), 'Preview chat'), chat, inputBar)) });
    run(null, null);
  }

  // ============================ ANALYTICS ============================
  async function openAnalytics(id, name) {
    const body = el('div', { style: 'min-width:520px' }, el('div', { class: 'spinner' }));
    const m = CRM.modal({ title: 'Bot analytics · ' + name, bodyNode: body, wide: true });
    try {
      const a = await api.get('/wa-flows/' + id + '/analytics');
      body.innerHTML = '';
      if (!a.sessions) {
        body.appendChild(el('div', { class: 'empty', 'data-testid': 'wa-analytics-empty' }, el('i', { class: 'fa-solid fa-chart-simple' }), el('div', {}, 'No conversations yet. Analytics appear once people chat with this bot.')));
        return;
      }
      const stat = (lbl, val) => el('div', { class: 'wa-astat' }, el('div', { class: 'wa-astat-n' }, String(val)), el('div', { class: 'wa-astat-l' }, lbl));
      body.appendChild(el('div', { class: 'wa-astats', 'data-testid': 'wa-analytics-stats' },
        stat('Sessions', a.sessions), stat('Completed', a.completed), stat('Completion', a.completion_rate + '%'), stat('Handoffs', a.handoffs)));
      body.appendChild(el('div', { style: 'font-weight:600;margin:16px 0 8px' }, 'Step funnel & drop-off'));
      const max = Math.max(1, ...a.funnel.map(f => f.reached));
      a.funnel.forEach(f => {
        const pct = Math.round(f.reached * 100 / max);
        const rows = [el('div', { class: 'wa-fn-head' },
          el('span', {}, el('i', { class: 'fa-solid fa-circle', style: 'font-size:7px;color:var(--accent);margin-right:6px' }), f.title),
          el('span', { class: 'wa-fn-cnt' }, f.reached + ' reached' + (typeof f.dropped === 'number' && f.dropped > 0 ? ' · ' + f.dropped + ' dropped off' : ''))),
          el('div', { class: 'wa-fn-bar' }, el('div', { class: 'wa-fn-fill', style: 'width:' + pct + '%' }))];
        (f.options || []).forEach(o => rows.push(el('div', { class: 'wa-fn-opt' },
          el('span', {}, el('i', { class: 'fa-solid fa-reply', style: 'font-size:10px;margin-right:6px;color:var(--text-3)' }), o.label),
          el('span', { class: 'wa-fn-tap', 'data-testid': 'wa-tap-' + f.key + '-' + o.id }, o.taps + ' tap' + (o.taps === 1 ? '' : 's')))));
        body.appendChild(el('div', { class: 'wa-fn-node' }, ...rows));
      });
    } catch (e) { body.innerHTML = ''; body.appendChild(el('div', { class: 'empty' }, e.message)); }
  }

  // ========================= SAVE AS TEMPLATE =========================
  async function saveAsTemplate(id, defaultName) {
    const name = prompt('Name this bot template (reusable across projects):', defaultName || 'My bot template');
    if (!name) return;
    try { await api.post('/wa-flows/' + id + '/save-template', { name }); toast('Saved to your bot template library', 'success'); }
    catch (e) { toast(e.data && e.data.message ? e.data.message : e.message, 'error'); }
  }

  async function openTemplatesPicker(host) {
    const body = el('div', { style: 'min-width:460px' }, el('div', { class: 'spinner' }));
    const m = CRM.modal({ title: 'Bot template library', bodyNode: body });
    const load = async () => {
      const { templates } = await api.get('/wa-flow-templates');
      body.innerHTML = '';
      body.appendChild(el('div', { style: 'color:var(--text-3);font-size:13px;margin-bottom:12px' }, 'Reuse a saved bot in one click — it becomes a new draft you can tweak and activate.'));
      if (!templates.length) { body.appendChild(el('div', { class: 'empty', 'data-testid': 'wa-tpl-lib-empty' }, el('i', { class: 'fa-solid fa-bookmark' }), el('div', {}, 'No saved templates yet. Open a bot and click "Save as template".'))); return; }
      templates.forEach(t => body.appendChild(el('div', { class: 'wa-tpl-row', 'data-testid': 'wa-flowtpl-' + t.id },
        el('div', {}, el('div', { style: 'font-weight:600' }, t.name), el('div', { style: 'font-size:12px;color:var(--text-3)' }, t.description || 'No description')),
        el('div', { style: 'display:flex;gap:6px' },
          el('button', { class: 'btn btn--sm btn--primary', 'data-testid': 'wa-flowtpl-use-' + t.id, onclick: async () => { try { const r = await api.post('/wa-flow-templates/' + t.id + '/use'); toast('Bot created from template', 'success'); m.close(); openBuilder(host, r.flow.id); } catch (e) { toast(e.message, 'error'); } } }, 'Use'),
          el('button', { class: 'icon-btn', 'data-testid': 'wa-flowtpl-del-' + t.id, onclick: async () => { if (!confirm('Delete this template?')) return; await api.del('/wa-flow-templates/' + t.id); load(); } }, el('i', { class: 'fa-solid fa-trash' }))))));
    };
    try { await load(); } catch (e) { body.innerHTML = ''; body.appendChild(el('div', { class: 'empty' }, e.message)); }
  }

})();
