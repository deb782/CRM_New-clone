// ---- In-app notifications (bell + dropdown) ----
(function () {
  const { el, api, toast, timeAgo } = window.CRM;

  async function loadInto(panel, btnBadge) {
    panel.innerHTML = '';
    panel.appendChild(el('div', { class: 'notif__loading' }, 'Loading…'));
    let res;
    try { res = await api.get('/notifications'); }
    catch (e) { panel.innerHTML = ''; panel.appendChild(el('div', { class: 'notif__empty' }, 'Could not load')); return; }
    panel.innerHTML = '';
    panel.appendChild(el('div', { class: 'notif__head' },
      el('b', {}, 'Notifications'),
      el('button', {
        class: 'notif__all', 'data-testid': 'notif-mark-all',
        onclick: async () => { await api.post('/notifications/read-all'); toast('All marked read', 'success'); loadInto(panel, btnBadge); updateBadge(0, btnBadge); }
      }, 'Mark all read')));

    if (!res.data.length) {
      panel.appendChild(el('div', { class: 'notif__empty' },
        el('i', { class: 'fa-regular fa-bell' }), el('div', {}, 'You’re all caught up')));
      return;
    }
    const list = el('div', { class: 'notif__list' });
    const icons = { payment: 'fa-indian-rupee-sign', discount: 'fa-gavel', booking: 'fa-file-contract', lead: 'fa-user-plus', whatsapp: 'fa-comment', task: 'fa-list-check', visit: 'fa-calendar-check', info: 'fa-circle-info' };
    res.data.forEach(n => {
      list.appendChild(el('a', {
        class: 'notif__item ' + (n.read_at ? '' : 'notif__item--unread'),
        href: n.link || '#', 'data-testid': 'notif-item-' + n.id,
        onclick: async () => { if (!n.read_at) { try { await api.post('/notifications/' + n.id + '/read'); } catch (e) {} } closePanel(); }
      },
        el('span', { class: 'notif__ico notif__ico--' + n.type }, el('i', { class: 'fa-solid ' + (icons[n.type] || icons.info) })),
        el('span', { class: 'notif__txt' },
          el('b', {}, n.title),
          n.body ? el('span', { class: 'notif__body' }, n.body) : null,
          el('span', { class: 'notif__time' }, timeAgo(n.created_at)))));
    });
    panel.appendChild(list);
  }

  function updateBadge(count, badge) {
    if (!badge) return;
    if (count > 0) { badge.textContent = count > 99 ? '99+' : String(count); badge.style.display = ''; }
    else { badge.style.display = 'none'; }
  }

  function closePanel() { document.querySelectorAll('.notif__panel').forEach(p => p.remove()); }

  // ---- Center-screen "New Lead" popup (beautifully designed, all roles) ----
  function seenSet() {
    try { return new Set(JSON.parse(localStorage.getItem('crm_notif_popup_seen') || '[]')); }
    catch (e) { return new Set(); }
  }
  function markSeen(ids) {
    const s = seenSet(); ids.forEach(i => s.add(i));
    try { localStorage.setItem('crm_notif_popup_seen', JSON.stringify([...s].slice(-200))); } catch (e) {}
  }
  function ensurePopupStyles() {
    if (document.getElementById('notif-popup-styles')) return;
    const st = document.createElement('style');
    st.id = 'notif-popup-styles';
    st.textContent = `
      .npop__ovl{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(17,17,17,.45);backdrop-filter:blur(4px);animation:npopFade .2s ease}
      .npop{width:min(92vw,420px);background:#fff;border-radius:20px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.28);border:1px solid #ECECE6;transform:translateY(8px) scale(.98);animation:npopIn .28s cubic-bezier(.2,.8,.2,1) forwards}
      .npop__bar{height:6px;background:linear-gradient(90deg,#4F5823,#8BA43B)}
      .npop__body{padding:26px 24px 20px;text-align:center}
      .npop__ring{width:64px;height:64px;border-radius:50%;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;background:#F2F5E6;color:#4F5823;font-size:26px;position:relative}
      .npop__ring::after{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid #4F5823;opacity:.25;animation:npopPulse 1.6s ease-out infinite}
      .npop__kicker{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#8A8A82;font-weight:700}
      .npop__title{font-size:22px;font-weight:800;color:#111;margin:4px 0 2px}
      .npop__sub{font-size:15px;color:#333;margin:0 0 4px}
      .npop__meta{font-size:13px;color:#777;margin-bottom:18px}
      .npop__actions{display:flex;gap:10px}
      .npop__btn{flex:1;border:none;border-radius:999px;padding:12px 16px;font-size:14px;font-weight:700;cursor:pointer;transition:transform .12s ease,background-color .15s ease}
      .npop__btn:hover{transform:translateY(-1px)}
      .npop__btn--primary{background:#111;color:#fff}
      .npop__btn--ghost{background:#F2F2EE;color:#333}
      .npop__stack{position:fixed;top:14px;right:14px;z-index:9998;font-size:12px;color:#4F5823;background:#F2F5E6;border:1px solid #DDE6C2;border-radius:999px;padding:4px 12px;font-weight:700;animation:npopFade .2s ease}
      @keyframes npopFade{from{opacity:0}to{opacity:1}}
      @keyframes npopIn{to{transform:translateY(0) scale(1)}}
      @keyframes npopPulse{0%{transform:scale(.85);opacity:.35}100%{transform:scale(1.35);opacity:0}}`;
    document.head.appendChild(st);
  }
  function showLeadPopup(n) {
    ensurePopupStyles();
    document.querySelectorAll('.npop__ovl').forEach(o => o.remove());
    const d = n.data || {};
    const name = d.name || (n.body || '').split('·')[0].trim() || 'a new lead';
    const phone = d.phone || '';
    const link = n.link ? ('#/leads') : '#/leads';
    const ovl = el('div', { class: 'npop__ovl', 'data-testid': 'lead-popup', onclick: (e) => { if (e.target === ovl) ovl.remove(); } });
    const card = el('div', { class: 'npop', onclick: (e) => e.stopPropagation() },
      el('div', { class: 'npop__bar' }),
      el('div', { class: 'npop__body' },
        el('div', { class: 'npop__ring' }, el('i', { class: 'fa-solid fa-user-plus' })),
        el('div', { class: 'npop__kicker' }, 'New Lead Generated'),
        el('div', { class: 'npop__title' }, name),
        phone ? el('div', { class: 'npop__sub' }, el('i', { class: 'fa-solid fa-phone', style: 'font-size:12px;margin-right:6px;color:#8BA43B' }), phone) : null,
        el('div', { class: 'npop__meta' }, 'Assigned to you just now'),
        el('div', { class: 'npop__actions' },
          el('button', { class: 'npop__btn npop__btn--ghost', 'data-testid': 'lead-popup-dismiss', onclick: () => ovl.remove() }, 'Dismiss'),
          el('button', {
            class: 'npop__btn npop__btn--primary', 'data-testid': 'lead-popup-open',
            onclick: async () => { if (!n.read_at) { try { await api.post('/notifications/' + n.id + '/read'); } catch (e) {} } ovl.remove(); location.hash = link; }
          }, 'Open lead'))));
    ovl.appendChild(card);
    document.body.appendChild(ovl);
  }
  async function maybePopup() {
    let res;
    try { res = await api.get('/notifications'); } catch (e) { return; }
    const seen = seenSet();
    const fresh = (res.data || []).filter(n => !n.read_at && !seen.has(n.id) &&
      (n.type === 'lead' || (n.data && n.data.popup)));
    if (!fresh.length) return;
    // Newest first from API; show the most recent, note the rest as a small stack badge.
    markSeen(fresh.map(n => n.id));
    showLeadPopup(fresh[0]);
    if (fresh.length > 1) {
      const b = el('div', { class: 'npop__stack' }, '+' + (fresh.length - 1) + ' more new leads');
      document.body.appendChild(b);
      setTimeout(() => b.remove(), 5000);
    }
  }

  window.CRM.renderBell = function () {
    const host = document.getElementById('topbar-bell');
    if (!host) return;
    host.innerHTML = '';
    const badge = el('span', { class: 'notif__badge', 'data-testid': 'notif-badge', style: 'display:none' });
    const btn = el('button', { class: 'icon-btn notif__btn', 'data-testid': 'notif-bell', title: 'Notifications' },
      el('i', { class: 'fa-regular fa-bell' }), badge);
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (document.querySelector('.notif__panel')) { closePanel(); return; }
      const panel = el('div', { class: 'notif__panel', 'data-testid': 'notif-panel', onclick: (ev) => ev.stopPropagation() });
      host.appendChild(panel);
      loadInto(panel, badge);
      updateBadge(0, badge);
      setTimeout(() => document.addEventListener('click', closePanel, { once: true }), 0);
    });
    host.appendChild(btn);

    // initial + polling unread count (+ center-screen popup for new leads)
    const refresh = async () => {
      try { const r = await api.get('/notifications/unread-count'); updateBadge(r.unread, badge); } catch (e) {}
      maybePopup();
    };
    refresh();
    if (window.__notifPoll) clearInterval(window.__notifPoll);
    window.__notifPoll = setInterval(refresh, 15000);
  };
})();
