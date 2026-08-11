// ---- Integrations Hub (self-service 3rd-party connections; Admin + Process Admin) ----
(function () {
  const { el, api, toast, modal } = CRM;

  function loadFB(appId, version) {
    return new Promise((resolve) => {
      const v = version || 'v21.0';
      if (window.FB) { try { FB.init({ appId: String(appId), version: v, xfbml: false, cookie: true }); } catch (e) {} resolve(); return; }
      window.fbAsyncInit = function () { try { FB.init({ appId: String(appId), version: v, xfbml: false, cookie: true }); } catch (e) {} resolve(); };
      const s = document.createElement('script');
      s.async = true; s.defer = true; s.crossOrigin = 'anonymous';
      s.src = 'https://connect.facebook.net/en_US/sdk.js';
      s.onerror = function () { resolve(); };
      document.body.appendChild(s);
    });
  }

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

    async function syncWaTemplates(manual) {
      try {
        const r = await api.post('/whatsapp/templates/sync', {});
        const n = (r && (r.count != null ? r.count : (r.synced != null ? r.synced : (Array.isArray(r.templates) ? r.templates.length : null))));
        toast(n != null ? ('Synced ' + n + ' WhatsApp templates from Meta') : 'WhatsApp templates synced from Meta', 'success');
      } catch (e) { if (manual) toast('Template sync failed: ' + (e.message || 'error'), 'error'); }
    }

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
          try { await api.post('/integrations/' + it.key + '/toggle', { enabled: on }); it.enabled = on; toast(on ? it.name + ' is now live' : it.name + ' disabled', 'success'); if (on && it.key === 'meta_whatsapp') { syncWaTemplates(false); } }
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
        it.key === 'meta_whatsapp' && it.configured ? el('button', { class: 'btn', style: 'width:100%;justify-content:center;margin-bottom:12px', 'data-testid': 'ig-wa-sync', onclick: () => syncWaTemplates(true) }, el('i', { class: 'fa-solid fa-rotate' }), ' Sync templates from Meta') : null,
        it.key === 'meta_lead_ads' ? el('div', { class: 'ig-fb' },
          el('button', {
            class: 'btn', style: 'width:100%;background:#0866FF;border-color:#0866FF;color:#fff;justify-content:center',
            'data-testid': 'ig-fb-connect',
            onclick: async () => {
              const appId = draft.app_id || (it.fields.find(f => f.key === 'app_id') || {}).value;
              const configId = draft.config_id || (it.fields.find(f => f.key === 'config_id') || {}).value;
              if (!appId || !configId) { toast('Enter App ID and Config ID, click Save, then Connect', 'error'); return; }
              try { await api.put('/integrations/' + it.key, draft); } catch (e) {}
              await loadFB(appId, draft.graph_version || 'v21.0');
              if (!window.FB) { toast('Could not load the Facebook SDK', 'error'); return; }
              FB.login(async (response) => {
                const code = response && response.authResponse && response.authResponse.code;
                if (!code) { toast('Facebook login was cancelled', 'error'); return; }
                try {
                  const r = await api.post('/integrations/meta_lead_ads/oauth', { code });
                  toast(r.message || 'Connected', 'success'); await refresh(); m.close();
                } catch (e) { toast(e.message || 'Connection failed', 'error'); }
              }, { config_id: configId, response_type: 'code', override_default_response_type: true });
            }
          }, el('i', { class: 'fa-brands fa-facebook' }), ' Connect with Facebook'),
          el('div', { class: 'help', style: 'margin:8px 0 14px;text-align:center' }, 'Recommended. Or fill the Page fields below to connect a token manually.')) : null,
        it.configured ? enableRow : el('div', { class: 'help', style: 'margin-bottom:8px' }, 'Fill the required fields, Save, then Test to go live.'),
        ...fieldEls,
        result,
        it.docs ? el('a', { class: 'ig-docs', href: it.docs, target: '_blank', rel: 'noopener' }, el('i', { class: 'fa-solid fa-book' }), 'Setup guide') : null);
      const m = modal({ title: it.name, bodyNode: body, footNodes: [el('button', { class: 'btn', onclick: () => m.close() }, 'Close'), testBtn, saveBtn] });
    }
  };
})();
