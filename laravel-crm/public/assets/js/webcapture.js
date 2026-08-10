/* webcapture.js — compatibility shim + page wiring for the ported
 * Website Form Builder (forms-ui.js) and Website Chatbot (chatbot-ui.js).
 *
 * Those two files were authored against a different micro-framework
 * (globals: Api, h, toast, Modal, setTitle, setTopbarActions). This shim maps
 * them onto the current CRM namespace without touching the imported UI code. */
(function () {
  if (!window.CRM) return;
  CRM.pages = CRM.pages || {};

  // Strip the source project's hardcoded prefix so paths route via CRM.API
  // (which resolves to /api/v1 on :8000 or /crm-api/v1 behind the preview proxy).
  function stripV1(p) { return String(p).replace(/^\/api\/v1/, ''); }

  window.h = CRM.el;
  window.toast = (m, t) => CRM.toast(m, t);
  window.setTitle = (t) => CRM.setTitle(t);
  window.setTopbarActions = (n) => CRM.setActions(n);
  window.fmtDate = function (d) {
    if (!d) return '';
    try { return new Date(d).toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' }); }
    catch (e) { return d; }
  };

  window.Api = {
    get: (p) => CRM.api.get(stripV1(p)),
    post: (p, b) => CRM.api.post(stripV1(p), b),
    put: (p, b) => CRM.api.put(stripV1(p), b),
    delete: (p) => CRM.api.del(stripV1(p)),
    token: () => CRM.token(),
  };

  let _modal = null;
  window.Modal = {
    open(title, bodyNode, footNode) {
      const body = CRM.el('div', { class: 'wc' }, bodyNode);
      const foot = footNode ? [CRM.el('div', { class: 'wc', style: 'display:contents' }, footNode)] : undefined;
      _modal = CRM.modal({ title, bodyNode: body, wide: true, footNodes: foot });
    },
    close() { if (_modal) { _modal.close(); _modal = null; } },
  };

  // The imported views render into #page; give them a scoped container inside the view.
  function mountPage(view) {
    view.innerHTML = '';
    const page = CRM.el('div', { id: 'page', class: 'wc' });
    view.appendChild(page);
    return page;
  }

  CRM.pages.webforms = async function (view) {
    mountPage(view);
    await window.FormBuilderView.render();
  };
  CRM.pages.webchatbot = async function (view) {
    mountPage(view);
    await window.ChatbotBuilderView.render();
  };
})();
