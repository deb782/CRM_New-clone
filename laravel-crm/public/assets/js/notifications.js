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

    // initial + polling unread count
    const refresh = async () => {
      try { const r = await api.get('/notifications/unread-count'); updateBadge(r.unread, badge); } catch (e) {}
    };
    refresh();
    if (window.__notifPoll) clearInterval(window.__notifPoll);
    window.__notifPoll = setInterval(refresh, 30000);
  };
})();
