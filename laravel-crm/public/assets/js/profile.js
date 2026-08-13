// ---- Account Settings / Profile + Command Palette ----
(function () {
  const { el, api, toast, state, initials } = CRM;

  const AVATAR_COLORS = ['#111111', '#3F72C4', '#2f9e44', '#E08C1A', '#E5484D', '#8B5CF6', '#0EA5E9', '#DF9200'];
  const PREF_ITEMS = [
    { key: 'notify_new_lead', label: 'New lead assigned', desc: 'When a lead is routed to you' },
    { key: 'notify_task_due', label: 'Task reminders', desc: 'Before an SLA task falls due' },
    { key: 'notify_whatsapp', label: 'WhatsApp replies', desc: 'When a customer replies in the inbox' },
    { key: 'weekly_digest', label: 'Weekly digest', desc: 'A Monday summary of your pipeline' },
  ];

  function switchToggle(checked, onChange, testid) {
    const knob = el('span', { class: 'sw__knob' });
    const s = el('button', { class: 'sw ' + (checked ? 'is-on' : ''), type: 'button', 'data-testid': testid }, knob);
    s.addEventListener('click', () => { s.classList.toggle('is-on'); onChange(s.classList.contains('is-on')); });
    return s;
  }

  CRM.pages.profile = async function (view) {
    CRM.setActions(null);
    const u = state.user;
    let section = (location.hash.split('/')[2]) || 'profile';
    const prefs = Object.assign({ notify_new_lead: true, notify_task_due: true, notify_whatsapp: true, weekly_digest: false }, u.preferences || {});
    let avatarColor = u.avatar_color || '#111111';

    view.innerHTML = '';

    // Hero header
    const bigAvatar = el('div', { class: 'pf-avatar', style: 'background:' + avatarColor, 'data-testid': 'profile-avatar' }, initials(u.name));
    view.appendChild(el('div', { class: 'pf-head' },
      bigAvatar,
      el('div', {},
        el('div', { class: 'pf-name', 'data-testid': 'profile-name' }, u.name),
        el('div', { class: 'pf-meta' },
          el('span', { class: 'stage-pill' }, u.role_name || '—'),
          u.department ? el('span', { class: 'chip' }, u.department[0].toUpperCase() + u.department.slice(1)) : null,
          el('span', { class: 'chip' }, u.email)))));

    const nav = el('div', { class: 'settings-nav' });
    const panel = el('div', { class: 'settings-panel', 'data-testid': 'settings-panel' });
    [['profile', 'Profile', 'fa-user'], ['notifications', 'Notifications', 'fa-bell'], ['security', 'Security', 'fa-shield-halved']].forEach(([k, l, ic]) => {
      const a = el('a', { class: 'settings-nav__item ' + (section === k ? 'active' : ''), 'data-testid': 'settings-tab-' + k, onclick: () => { section = k; [...nav.children].forEach(c => c.classList.remove('active')); a.classList.add('active'); renderPanel(); } }, el('i', { class: 'fa-solid ' + ic }), l);
      nav.appendChild(a);
    });

    function renderPanel() {
      panel.innerHTML = '';
      if (section === 'profile') return renderProfile();
      if (section === 'notifications') return renderNotifs();
      if (section === 'security') return renderSecurity();
    }

    function renderProfile() {
      const f = { name: u.name, phone: u.phone || '', avatar_color: avatarColor };
      const nameI = el('input', { class: 'input', value: f.name, 'data-testid': 'pf-name-input' }); nameI.addEventListener('input', () => f.name = nameI.value);
      const phoneI = el('input', { class: 'input', value: f.phone, placeholder: '9xxxxxxxxx', 'data-testid': 'pf-phone-input' }); phoneI.addEventListener('input', () => f.phone = phoneI.value);
      const swatches = el('div', { class: 'pf-swatches' }, ...AVATAR_COLORS.map(c =>
        el('button', { class: 'pf-swatch' + (f.avatar_color === c ? ' active' : ''), type: 'button', style: 'background:' + c, 'data-testid': 'pf-color-' + c.replace('#', ''), onclick: (e) => {
          f.avatar_color = c; [...e.currentTarget.parentNode.children].forEach(x => x.classList.remove('active')); e.currentTarget.classList.add('active'); bigAvatar.style.background = c;
        } })));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'pf-save' }, 'Save changes');
      save.addEventListener('click', async () => {
        save.disabled = true;
        try { const r = await api.put('/auth/profile', f); state.user = Object.assign(state.user, r.user); avatarColor = f.avatar_color; toast('Profile updated', 'success'); CRM.render(); }
        catch (e) { toast(e.message, 'error'); save.disabled = false; }
      });
      panel.append(
        el('div', { class: 'set-block' }, el('div', { class: 'set-block__h' }, 'Avatar colour'), swatches),
        el('div', { class: 'form-row', style: 'margin-top:8px' },
          el('div', { class: 'field' }, el('label', {}, 'Full name'), nameI),
          el('div', { class: 'field' }, el('label', {}, 'Phone'), phoneI)),
        el('div', { class: 'form-row' },
          el('div', { class: 'field' }, el('label', {}, 'Email (login ID)'), el('input', { class: 'input', value: u.email, disabled: 'disabled' })),
          el('div', { class: 'field' }, el('label', {}, 'Role'), el('input', { class: 'input', value: (u.role_name || '') + (u.tier ? ' · ' + u.tier : ''), disabled: 'disabled' }))),
        el('div', { style: 'margin-top:8px' }, save));
    }

    function renderNotifs() {
      const draft = Object.assign({}, prefs);
      const rows = el('div', { class: 'set-rows' });
      PREF_ITEMS.forEach(it => rows.appendChild(el('div', { class: 'set-row' },
        el('div', {}, el('div', { class: 'set-row__t' }, it.label), el('div', { class: 'set-row__d' }, it.desc)),
        switchToggle(!!draft[it.key], (v) => draft[it.key] = v, 'pref-' + it.key))));
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'pf-notif-save' }, 'Save preferences');
      save.addEventListener('click', async () => {
        save.disabled = true;
        try { const r = await api.put('/auth/profile', { preferences: draft }); state.user = Object.assign(state.user, r.user); Object.assign(prefs, draft); toast('Preferences saved', 'success'); save.disabled = false; }
        catch (e) { toast(e.message, 'error'); save.disabled = false; }
      });
      panel.append(el('div', { class: 'set-block' }, el('div', { class: 'set-block__h' }, 'Email & in-app alerts'), rows), el('div', { style: 'margin-top:16px' }, save));
    }

    function renderSecurity() {
      const cur = el('input', { class: 'input', type: 'password', placeholder: 'Current password', 'data-testid': 'sec-current' });
      const npw = el('input', { class: 'input', type: 'password', placeholder: 'New password (min 8)', 'data-testid': 'sec-new' });
      const cpw = el('input', { class: 'input', type: 'password', placeholder: 'Confirm new password', 'data-testid': 'sec-confirm' });
      const save = el('button', { class: 'btn btn--primary', 'data-testid': 'sec-save' }, 'Update password');
      save.addEventListener('click', async () => {
        if (npw.value.length < 8) { toast('Password must be at least 8 characters', 'error'); return; }
        if (npw.value !== cpw.value) { toast('Passwords do not match', 'error'); return; }
        save.disabled = true;
        try { await api.post('/auth/change-password', { current_password: cur.value, new_password: npw.value, new_password_confirmation: cpw.value }); toast('Password updated', 'success'); cur.value = npw.value = cpw.value = ''; save.disabled = false; }
        catch (e) { toast(e.message, 'error'); save.disabled = false; }
      });
      panel.append(
        el('div', { class: 'set-block' }, el('div', { class: 'set-block__h' }, 'Change password'),
          el('div', { class: 'field' }, el('label', {}, 'Current password'), cur),
          el('div', { class: 'form-row' }, el('div', { class: 'field' }, el('label', {}, 'New password'), npw), el('div', { class: 'field' }, el('label', {}, 'Confirm'), cpw)),
          el('div', { style: 'margin-top:8px' }, save)));

      // ---- Active sessions & devices ----
      const list = el('div', { 'data-testid': 'sessions-list' }, el('div', { class: 'spinner' }));
      const logoutAll = el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'sessions-logout-all' }, el('i', { class: 'fa-solid fa-power-off' }), ' Log out all other devices');
      const uaLabel = (ua) => {
        ua = (ua || '').toLowerCase();
        const os = ua.includes('windows') ? 'Windows' : ua.includes('mac') ? 'macOS' : ua.includes('android') ? 'Android' : ua.includes('iphone') || ua.includes('ipad') ? 'iOS' : ua.includes('linux') ? 'Linux' : 'Device';
        const br = ua.includes('edg') ? 'Edge' : ua.includes('chrome') ? 'Chrome' : ua.includes('firefox') ? 'Firefox' : ua.includes('safari') ? 'Safari' : 'Browser';
        return br + ' · ' + os;
      };
      async function loadSessions() {
        list.innerHTML = '';
        try {
          const r = await api.get('/auth/sessions');
          const rows = r.data || [];
          if (!rows.length) { list.appendChild(el('div', { class: 'help' }, 'No active sessions.')); return; }
          rows.forEach(s => {
            const revoke = s.current ? null : el('button', { class: 'btn btn--ghost btn--sm', 'data-testid': 'session-revoke-' + s.id, onclick: async () => {
              try { await api.del('/auth/sessions/' + s.id); toast('Session revoked', 'success'); loadSessions(); } catch (e) { toast(e.message, 'error'); }
            } }, 'Revoke');
            list.appendChild(el('div', { class: 'set-row', 'data-testid': 'session-row-' + s.id, style: 'display:flex;justify-content:space-between;align-items:center;gap:12px;padding:10px 0;border-bottom:1px solid var(--line)' },
              el('div', {},
                el('div', { class: 'set-row__t' }, uaLabel(s.user_agent), s.current ? el('span', { class: 'chip', style: 'margin-left:8px;font-size:10px' }, 'This device') : null),
                el('div', { class: 'set-row__d' }, 'IP ' + (s.ip_address || 'unknown') + ' · last active ' + (s.last_used_at ? CRM.timeAgo(s.last_used_at) : 'never'))),
              revoke));
          });
        } catch (e) { list.appendChild(el('div', { class: 'help' }, 'Could not load sessions.')); }
      }
      logoutAll.addEventListener('click', async () => {
        if (!confirm('Log out of all other devices? Your current session stays signed in.')) return;
        try { await api.post('/auth/logout-all'); toast('Signed out of all devices', 'success'); location.hash = '#/login'; setTimeout(() => location.reload(), 200); }
        catch (e) { toast(e.message, 'error'); }
      });
      panel.append(el('div', { class: 'set-block', style: 'margin-top:24px' },
        el('div', { class: 'set-block__h' }, 'Active sessions & devices'),
        el('div', { class: 'help', style: 'margin-bottom:8px' }, 'Sessions end automatically after 1 hour of inactivity. Revoke any you don’t recognise.'),
        list, el('div', { style: 'margin-top:12px' }, logoutAll)));
      loadSessions();
    }

    view.appendChild(el('div', { class: 'settings-grid' }, nav, el('div', { class: 'card', style: 'padding:28px' }, panel)));
    renderPanel();
  };

  // ---------- Command palette (⌘K) ----------
  CRM.openCommandPalette = function (destinations) {
    if (document.getElementById('cmdk')) return;
    const input = el('input', { class: 'cmdk__input', placeholder: 'Search leads, pages, actions…', 'data-testid': 'cmdk-input' });
    const list = el('div', { class: 'cmdk__list', 'data-testid': 'cmdk-list' });
    const overlay = el('div', { class: 'cmdk-overlay', id: 'cmdk', 'data-testid': 'cmdk-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
      el('div', { class: 'cmdk' }, el('div', { class: 'cmdk__bar' }, el('i', { class: 'fa-solid fa-magnifying-glass' }), input), list));
    document.body.appendChild(overlay);
    function close() { overlay.remove(); }
    let items = [], active = 0;

    function paint() {
      list.innerHTML = '';
      if (!items.length) { list.appendChild(el('div', { class: 'cmdk__empty' }, 'No matches')); return; }
      items.forEach((it, i) => list.appendChild(el('div', { class: 'cmdk__item' + (i === active ? ' active' : ''), 'data-testid': 'cmdk-item-' + i, onclick: () => go(it) },
        el('i', { class: 'fa-solid ' + it.icon }),
        el('div', {}, el('div', { class: 'cmdk__t' }, it.label), it.sub ? el('div', { class: 'cmdk__s' }, it.sub) : null),
        el('span', { class: 'cmdk__k' }, it.kind))));
    }
    function go(it) { close(); location.hash = it.hash; }

    async function search(q) {
      const nav = destinations.filter(d => d.label.toLowerCase().includes(q.toLowerCase())).slice(0, 6)
        .map(d => ({ label: d.label, hash: '#/' + d.route, icon: d.icon, kind: 'Page' }));
      let leads = [];
      if (q.trim().length >= 2 && CRM.can('leads.view')) {
        try { const r = await api.get('/leads?search=' + encodeURIComponent(q) + '&per_page=6'); leads = (r.data || []).map(l => ({ label: l.name, sub: (l.email || l.phone || '') + ' · ' + (l.status || ''), hash: '#/leads/' + l.id, icon: 'fa-user', kind: 'Lead' })); } catch (e) {}
      }
      items = q.trim() ? [...leads, ...nav] : destinations.slice(0, 8).map(d => ({ label: d.label, hash: '#/' + d.route, icon: d.icon, kind: 'Page' }));
      active = 0; paint();
    }

    let t; input.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => search(input.value), 160); });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { active = Math.min(active + 1, items.length - 1); paint(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); paint(); e.preventDefault(); }
      else if (e.key === 'Enter' && items[active]) { go(items[active]); }
      else if (e.key === 'Escape') { close(); }
    });
    search('');
    setTimeout(() => input.focus(), 30);
  };
})();
