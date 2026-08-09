// ---- API layer + shared UI helpers (global CRM namespace) ----
(function () {
  const TOKEN_KEY = 'crm_token';
  const state = { user: null };

  function token() { return localStorage.getItem(TOKEN_KEY); }
  function setToken(t) { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); }

  async function req(method, path, body) {
    const headers = { 'Accept': 'application/json' };
    if (token()) headers['Authorization'] = 'Bearer ' + token();
    const opts = { method, headers };
    if (body instanceof FormData) { opts.body = body; }
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }

    const res = await fetch(CRM.API + path, opts);
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (res.status === 401) { setToken(null); if (location.hash !== '#/login') location.hash = '#/login'; }
    if (!res.ok) { const err = new Error((data && data.message) || 'Request failed'); err.status = res.status; err.data = data; throw err; }
    return data;
  }

  const api = {
    get: (p) => req('GET', p),
    post: (p, b) => req('POST', p, b),
    put: (p, b) => req('PUT', p, b),
    del: (p) => req('DELETE', p),
    login: (email, password) => req('POST', '/auth/login', { email, password }),
    me: () => req('GET', '/me'),
  };

  // ---- DOM helpers ----
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === 'class') node.className = v;
      else if (k === 'html') node.innerHTML = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c === null || c === undefined || c === false) continue;
      node.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return node;
  }

  function toast(msg, type = '') {
    const wrap = document.getElementById('toast');
    // Clear any lingering toast so only the latest shows (avoids stacked/overlapping messages)
    wrap.querySelectorAll('.toast').forEach(o => o.remove());
    const icon = type === 'error' ? 'fa-circle-exclamation' : type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
    const t = el('div', { class: 'toast ' + (type ? 'toast--' + type : ''), 'data-testid': 'toast' },
      el('i', { class: 'fa-solid ' + icon }), el('span', {}, msg));
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3200);
  }

  function modal({ title, bodyNode, wide, footNodes }) {
    const root = document.getElementById('modal-root');
    const close = () => { overlay.remove(); };
    const overlay = el('div', { class: 'modal-overlay', 'data-testid': 'modal-overlay', onclick: (e) => { if (e.target === overlay) close(); } },
      el('div', { class: 'modal ' + (wide ? 'modal--wide' : '') },
        el('div', { class: 'modal__head' }, el('h3', {}, title),
          el('button', { class: 'icon-btn', 'data-testid': 'modal-close', onclick: close }, el('i', { class: 'fa-solid fa-xmark' }))),
        el('div', { class: 'modal__body' }, bodyNode),
        footNodes ? el('div', { class: 'modal__foot' }, ...footNodes) : null
      ));
    root.appendChild(overlay);
    return { close, overlay };
  }

  function initials(name) { return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase(); }
  function money(n) { if (n === null || n === undefined || n === '') return '—'; return '₹' + Number(n).toLocaleString('en-IN'); }
  function timeAgo(d) {
    if (!d) return '';
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    if (s < 604800) return Math.floor(s / 86400) + 'd ago';
    return new Date(d).toLocaleDateString();
  }
  function tempBadge(t) { return el('span', { class: 'temp temp--' + (t || 'cold') }, (t || 'cold').charAt(0).toUpperCase() + (t || 'cold').slice(1)); }
  function stageName(slug) { return (slug || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }

  function can(perm) {
    const p = state.user && state.user.permissions || [];
    return p.includes('*') || p.includes(perm);
  }

  window.CRM = Object.assign(window.CRM || {}, {
    api, el, toast, modal, state, token, setToken, initials, money, timeAgo, tempBadge, stageName, can,
    pages: (window.CRM && window.CRM.pages) || {},
  });
})();
