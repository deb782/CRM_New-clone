// ---- Integrations Hub (self-service 3rd-party connections; Admin + Process Admin) ----
(function () {
  const { el, api, toast, modal } = CRM;

  const STATUS = {
    connected: { l: 'Connected', c: 'ig-status--ok' },
    error: { l: 'Error', c: 'ig-status--err' },
  };

  CRM.pages.integrations = async function (view) {
    CRM.setActions(null);
    let items = (await api.get('/integrations')).data;
    render();

    function stateOf(it) {
      if (!it.configured) return { l: 'Not configured', c: 'ig-status--idle' };
      if (it.status && STATUS[it.status]) return it.enabled && it.status === 'connected' ? { l: 'Live', c: 'ig-status--ok' } : STATUS[it.status];
      return it.enabled ? { l: 'Enabled', c: 'ig-status--ok' } : { l: 'Configured', c: 'ig-status--idle' };
    }

    function render() {
      view.innerHTML = '';
      view.appendChild(el('div', { class: 'ig-intro' },
        el('h2', { class: 'ig-intro__h' }, 'Integrations'),
        el('p', { class: 'ig-intro__p' }, 'Connect the CRM to your own accounts. Credentials are encrypted and never leave your workspace. Until a service is configured and enabled, the CRM safely runs in simulation mode.')));
      const grid = el('div', { class: 'ig-grid', 'data-testid': 'integrations-grid' });
      items.forEach(it => {
        const st = stateOf(it);
        grid.appendChild(el('div', { class: 'ig-card', 'data-testid': 'ig-card-' + it.key, onclick: () => configure(it) },
          el('div', { class: 'ig-card__top' },
            el('div', { class: 'ig-card__icon', style: 'background:' + it.accent }, el('i', { class: (it.icon_style === 'brand' ? 'fa-brands ' : 'fa-solid ') + it.icon })),
            el('span', { class: 'ig-status ' + st.c, 'data-testid': 'ig-status-' + it.key }, st.l)),
          el('div', { class: 'ig-card__name' }, it.name),
          el('div', { class: 'ig-card__cat' }, it.category),
          el('div', { class: 'ig-card__desc' }, it.description),
          el('div', { class: 'ig-card__foot' },
            el('span', { class: 'mut' }, it.last_tested_at ? 'Tested ' + CRM.timeAgo(it.last_tested_at) : 'Never tested'),
            el('span', { class: 'btn btn--sm' }, it.configured ? 'Manage' : 'Connect'))));
      });
      view.appendChild(grid);
    }

    async function refresh() { items = (await api.get('/integrations')).data; render(); }

    function configure(it) {
      const draft = {};
      const fieldEls = it.fields.map(f => {
        const input = el('input', {
          class: 'input', type: f.type === 'password' ? 'password' : 'text',
          value: f.secret ? '' : (f.value || ''),
          placeholder: f.secret && f.has_value ? '•••••••• (unchanged)' : (f.placeholder || ''),
          'data-testid': 'ig-field-' + it.key + '-' + f.key,
        });
        input.addEventListener('input', () => { draft[f.key] = input.value; });
        if (!f.secret) draft[f.key] = f.value || '';
        return el('div', { class: 'field' },
          el('label', {}, f.label, f.required ? el('span', { style: 'color:var(--hot)' }, ' *') : null),
          input,
          f.help ? el('div', { class: 'help', style: 'margin-top:4px' }, f.help) : null);
      });

      const result = el('div', { class: 'ig-result', 'data-testid': 'ig-test-result' });
      const enableRow = el('div', { class: 'ig-enable' },
        el('div', {}, el('div', { class: 'set-row__t' }, 'Enable ' + it.name), el('div', { class: 'set-row__d' }, 'Route live traffic through this integration')),
        CRM.switchField(it.enabled, async (on) => {
          try { await api.post('/integrations/' + it.key + '/toggle', { enabled: on }); it.enabled = on; toast(on ? it.name + ' is now live' : it.name + ' disabled', 'success'); }
          catch (e) { toast(e.message, 'error'); await refresh(); m.close(); }
        }, 'ig-enable-' + it.key));

      const saveBtn = el('button', { class: 'btn btn--primary', 'data-testid': 'ig-save-' + it.key }, 'Save');
      const testBtn = el('button', { class: 'btn', 'data-testid': 'ig-test-' + it.key }, el('i', { class: 'fa-solid fa-plug-circle-check' }), 'Test connection');

      saveBtn.addEventListener('click', async () => {
        saveBtn.disabled = true;
        try { await api.put('/integrations/' + it.key, draft); toast('Saved', 'success'); await refresh(); m.close(); }
        catch (e) { toast(e.message, 'error'); saveBtn.disabled = false; }
      });
      testBtn.addEventListener('click', async () => {
        result.className = 'ig-result'; result.textContent = 'Testing…'; testBtn.disabled = true;
        try { await api.put('/integrations/' + it.key, draft); const r = await api.post('/integrations/' + it.key + '/test', {}); result.className = 'ig-result ig-result--ok'; result.textContent = '✓ ' + (r.message || 'Connected'); }
        catch (e) { result.className = 'ig-result ig-result--err'; result.textContent = '✕ ' + (e.message || 'Connection failed'); }
        testBtn.disabled = false;
        try { items = (await api.get('/integrations')).data; render(); } catch (_) {}
      });

      const body = el('div', {},
        it.configured ? enableRow : el('div', { class: 'help', style: 'margin-bottom:8px' }, 'Fill the required fields, Save, then Test to go live.'),
        ...fieldEls,
        result,
        it.docs ? el('a', { class: 'ig-docs', href: it.docs, target: '_blank', rel: 'noopener' }, el('i', { class: 'fa-solid fa-book' }), 'Setup guide') : null);
      const m = modal({ title: it.name, bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Close'), testBtn, saveBtn] });
    }
  };
})();
