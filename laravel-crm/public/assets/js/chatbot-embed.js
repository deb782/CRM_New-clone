/**
 * Agrocorp CRM - Chatbot Embed (v16.1, menu-driven)
 *
 * <script src="https://your-crm.com/assets/js/chatbot-embed.js"
 *         data-slug="your-chatbot-slug"
 *         data-api="https://your-crm.com" async></script>
 *
 * Renders a floating bubble bottom-right that opens a chat panel showing a
 * welcome bubble + a grid of quick-action option pills (Brochure, Location,
 * Book a site visit, ...). Each option can:
 *   * answer  -> bot replies with text (+ optional image)
 *   * form    -> shows an inline form; on submit creates a lead in the CRM
 *   * link    -> opens a URL in a new tab
 */
(function () {
  const script = document.currentScript || document.querySelector('script[data-slug]');
  if (!script) return console.error('[chatbot-embed] no <script data-slug> tag');
  const SLUG = script.dataset.slug;
  const API  = (script.dataset.api || (new URL(script.src)).origin).replace(/\/$/, '');
  // /api/v1 on the CRM host; Emergent preview hosts reserve /api, so use /crm-api/v1 there.
  const PREFIX = (function () {
    try { return /(^|\.)preview\.emergentagent\.com$/i.test(new URL(API).hostname) ? '/crm-api/v1' : '/api/v1'; }
    catch (e) { return '/api/v1'; }
  })();

  let cfg = null;
  let sessionUuid = null;
  let panelOpen = false;
  let menuEl = null;

  // ----- Styles -----
  const css = `
    .cb-bubble{position:fixed;bottom:24px;right:24px;width:60px;height:60px;border-radius:50%;background:var(--cb-c);color:#fff;box-shadow:0 8px 24px rgba(0,0,0,0.25);cursor:pointer;z-index:2147483647;display:grid;place-items:center;font-size:26px;transition:transform 0.2s;border:none;}
    .cb-bubble:hover{transform:scale(1.08);}
    .cb-panel{position:fixed;bottom:100px;right:24px;width:400px;max-width:calc(100vw - 32px);max-height:640px;background:#fff;border-radius:20px;box-shadow:0 24px 60px rgba(0,0,0,0.25);display:none;flex-direction:column;z-index:2147483647;overflow:hidden;font-family:-apple-system,'Inter','Helvetica Neue',sans-serif;}
    .cb-panel.open{display:flex;}
    .cb-header{background:var(--cb-c);color:#fff;padding:14px 20px;display:flex;justify-content:space-between;align-items:center;}
    .cb-header-brand{display:flex;align-items:center;gap:12px;}
    .cb-avatar{width:38px;height:38px;background:#fff;border-radius:50%;display:grid;place-items:center;font-weight:700;color:var(--cb-c);font-size:15px;border:2px solid rgba(255,255,255,0.4);}
    .cb-title{font-weight:600;font-size:17px;letter-spacing:0.2px;}
    .cb-close{background:transparent;border:none;color:#fff;font-size:24px;cursor:pointer;line-height:1;opacity:0.9;padding:4px 8px;}
    .cb-close:hover{opacity:1;}
    .cb-body{flex:1;overflow-y:auto;padding:16px;background:#fafaf7;display:flex;flex-direction:column;gap:10px;}
    .cb-bubble-in{background:#fff;padding:14px 16px;border-radius:14px;box-shadow:0 1px 2px rgba(0,0,0,0.05);color:#0a2540;font-size:14px;line-height:1.55;}
    .cb-bubble-out{background:var(--cb-c);color:#fff;padding:10px 14px;border-radius:14px;font-size:13px;align-self:flex-end;max-width:80%;}
    .cb-menu{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;}
    .cb-opt{padding:9px 16px;border:1px solid var(--cb-c);background:#fff;color:var(--cb-c);border-radius:22px;font-size:13px;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-family:inherit;transition:all 0.15s;}
    .cb-opt:hover{background:var(--cb-c);color:#fff;}
    .cb-opt-solid{background:var(--cb-c);color:#fff;}
    .cb-opt-solid:hover{background:#0a2c25;}
    .cb-form{background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(0,0,0,0.05);margin-top:4px;}
    .cb-form h4{margin:0 0 12px 0;color:var(--cb-c);font-size:15px;font-weight:600;}
    .cb-form label{display:block;font-size:12px;color:#6b7280;margin-bottom:4px;font-weight:500;}
    .cb-form input,.cb-form textarea,.cb-form select{width:100%;padding:9px 12px;border:1px solid #e5e7eb;border-radius:10px;font-size:13px;margin-bottom:10px;box-sizing:border-box;font-family:inherit;background:#fff;color:#0a2540;}
    .cb-form input:focus,.cb-form textarea:focus,.cb-form select:focus{outline:none;border-color:var(--cb-c);}
    .cb-form button{width:100%;padding:11px;background:var(--cb-c);color:#fff;border:none;border-radius:22px;font-size:14px;font-weight:600;cursor:pointer;font-family:inherit;margin-top:4px;}
    .cb-form button:hover{background:#0a2c25;}
    .cb-back{align-self:flex-start;padding:5px 12px;border:1px solid var(--cb-c);background:#fff;color:var(--cb-c);border-radius:16px;font-size:12px;font-weight:500;cursor:pointer;font-family:inherit;margin-top:2px;}
    .cb-back:hover{background:var(--cb-c);color:#fff;}
    .cb-input{border-top:1px solid #e5e7eb;padding:12px 14px;display:flex;gap:8px;background:#fff;align-items:center;}
    .cb-input input{flex:1;padding:10px 16px;border:1px solid #e5e7eb;border-radius:20px;font-size:13px;font-family:inherit;background:#fafaf7;color:#9ca3af;}
    .cb-input button{width:36px;height:36px;border-radius:50%;background:var(--cb-c);color:#fff;border:none;font-size:16px;cursor:pointer;display:grid;place-items:center;flex-shrink:0;}
    .cb-link{background:#fff;padding:10px 14px;border-radius:14px;color:var(--cb-c);text-decoration:none;font-weight:600;border:1px solid var(--cb-c);font-size:13px;display:inline-flex;align-items:center;gap:6px;align-self:flex-start;}
    .cb-link:hover{background:var(--cb-c);color:#fff;}
    .cb-pdf{background:#fef3c7;padding:9px 14px;border-radius:12px;color:#92400e;text-decoration:none;font-weight:600;border:1px solid #fcd34d;font-size:13px;display:inline-flex;align-items:center;gap:6px;align-self:flex-start;margin-bottom:6px;}
    .cb-pdf:hover{background:#fde68a;}
    .cb-img{max-width:100%;border-radius:10px;}
    @media(max-width:520px){.cb-panel{right:8px;left:8px;bottom:88px;width:auto;}}
  `;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  // ----- DOM -----
  // NOTE: every non-ASCII character in this innerHTML is written as an HTML entity
  // (or unicode escape) so the widget renders correctly on external sites that
  // serve their HTML as Windows-1252 / ISO-8859-1 (a common mis-config that
  // otherwise causes the close x to render as "-",  as "Y'", etc.).
  const root = document.createElement('div');
  root.innerHTML =
    '<button class="cb-bubble" id="cbBubble" title="Chat with us" data-testid="cb-bubble">' +
      '<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>' +
    '</button>' +
    '<div class="cb-panel" id="cbPanel" data-testid="cb-panel">' +
      '<div class="cb-header">' +
        '<div class="cb-header-brand">' +
          '<div class="cb-avatar" id="cbAvatar">A</div>' +
          '<div class="cb-title" id="cbBrand">Chat</div>' +
        '</div>' +
        '<button class="cb-close" id="cbClose" aria-label="Close" title="Close">&#215;</button>' +
      '</div>' +
      '<div class="cb-body" id="cbBody"></div>' +
    '</div>';
  document.body.appendChild(root);
  const $ = (id) => document.getElementById(id);

  document.documentElement.style.setProperty('--cb-c', '#0f3d33');

  $('cbBubble').onclick = async () => {
    panelOpen = !panelOpen;
    $('cbPanel').classList.toggle('open', panelOpen);
    if (panelOpen && !sessionUuid) await start();
  };
  $('cbClose').onclick = () => { panelOpen = false; $('cbPanel').classList.remove('open'); };

  async function start() {
    try {
      cfg = await fetch(`${API}${PREFIX}/public/chatbots/${SLUG}/config`).then(r => r.json());
      $('cbBrand').textContent = cfg.chatbot.brand_name || 'Chat';
      // If the admin uploaded a logo, use it in the avatar circle; otherwise fall back to the brand initial.
      const av = $('cbAvatar');
      if (cfg.chatbot.logo_url) {
        av.innerHTML = '';
        const img = document.createElement('img');
        img.src = cfg.chatbot.logo_url;
        img.alt = cfg.chatbot.brand_name || '';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:50%;';
        img.onerror = () => { av.textContent = (cfg.chatbot.brand_name || 'A').charAt(0).toUpperCase(); };
        av.appendChild(img);
      } else {
        av.textContent = (cfg.chatbot.brand_name || 'A').charAt(0).toUpperCase();
      }
      document.documentElement.style.setProperty('--cb-c', cfg.chatbot.brand_color || '#0f3d33');
      const s = await fetch(`${API}${PREFIX}/public/chatbots/${SLUG}/session`, { method: 'POST' }).then(r => r.json());
      sessionUuid = s.session_uuid;
      renderInitial();
    } catch (e) {
      $('cbBody').innerHTML = '<div class="cb-bubble-in">Sorry, chat is unavailable. Please try again later.</div>';
      console.error('[chatbot-embed]', e);
    }
  }

  function renderInitial() {
    const body = $('cbBody'); body.innerHTML = '';
    if (cfg.chatbot.welcome_message) {
      body.appendChild(el('div', 'cb-bubble-in', cfg.chatbot.welcome_message));
    }
    renderMenu();
  }

  function renderMenu() {
    const body = $('cbBody');
    menuEl = document.createElement('div'); menuEl.className = 'cb-menu';
    (cfg.menu || []).forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'cb-opt' + (i === 0 ? ' cb-opt-solid' : '');
      b.setAttribute('data-testid', 'cb-option-' + o.id);
      b.innerHTML = (o.icon ? `<span>${escapeHtml(o.icon)}</span>` : '') + `<span>${escapeHtml(o.label)}</span>`;
      b.onclick = () => handleOption(o.id, o.label);
      menuEl.appendChild(b);
    });
    body.appendChild(menuEl);
    body.scrollTop = 99999;
  }

  async function handleOption(id, label) {
    // Echo the tap as an outgoing bubble
    $('cbBody').appendChild(el('div', 'cb-bubble-out', '\u25B8 ' + label));
    // Hide menu while showing result
    if (menuEl) { menuEl.remove(); menuEl = null; }
    try {
      const res = await fetch(`${API}${PREFIX}/public/chatbots/${SLUG}/session/${sessionUuid}/action`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ option_id: id }) }).then(r => r.json());
      renderResult(res);
    } catch (e) { console.error(e); }
  }

  function renderResult(res) {
    const body = $('cbBody');
    if (res.action === 'form') { renderForm(res); return; }
    // v17 rich answers: gallery of images
    if (Array.isArray(res.images) && res.images.length) {
      const gal = document.createElement('div');
      gal.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:6px;margin-bottom:8px';
      res.images.forEach(u => {
        const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener';
        const img = document.createElement('img'); img.src = u;
        img.style.cssText = 'width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:8px;cursor:zoom-in';
        a.appendChild(img); gal.appendChild(a);
      });
      body.appendChild(gal);
    }
    if (res.image) { const img = document.createElement('img'); img.src = res.image; img.className = 'cb-img'; body.appendChild(img); }
    if (res.action === 'link' && res.url) {
      const a = document.createElement('a'); a.href = res.url; a.target = '_blank'; a.rel = 'noopener';
      a.className = 'cb-link'; a.textContent = '^ Open link';
      body.appendChild(a);
      try { window.open(res.url, '_blank', 'noopener'); } catch (_) {}
    }
    if (res.text) body.appendChild(el('div', 'cb-bubble-in', res.text));
    if (res.pdf) {
      const a = document.createElement('a'); a.href = res.pdf; a.target = '_blank'; a.rel = 'noopener';
      a.className = 'cb-pdf';
      a.textContent = res.pdf_label || 'Download brochure';
      body.appendChild(a);
    }
    if (res.back_to_menu !== false) appendBack();
    body.scrollTop = 99999;
  }

  function renderForm(res) {
    const body = $('cbBody');
    const form = document.createElement('div'); form.className = 'cb-form';
    form.setAttribute('data-testid', 'cb-form-' + res.option_id);
    const h4 = document.createElement('h4'); h4.textContent = res.title || 'Please fill in your details'; form.appendChild(h4);
    const inputs = {}; const errorEls = {};
    (res.fields || []).forEach(f => {
      const lab = document.createElement('label'); lab.textContent = f.label + (f.required ? ' *' : ''); form.appendChild(lab);
      let inp;
      if (f.type === 'textarea') inp = document.createElement('textarea');
      else if (f.type === 'dropdown') {
        inp = document.createElement('select');
        inp.appendChild(new Option('Select...', ''));
        (f.options || []).forEach(op => inp.appendChild(new Option(op, op)));
      } else {
        inp = document.createElement('input');
        inp.type = f.type === 'email' ? 'email' : (f.type === 'phone' ? 'tel' : (f.type === 'number' ? 'number' : 'text'));
        if (f.type === 'phone')  inp.setAttribute('inputmode', 'tel');
        if (f.type === 'number') inp.setAttribute('inputmode', 'numeric');
        if (f.type === 'email')  inp.setAttribute('autocomplete', 'email');
        if (f.type === 'name')   inp.setAttribute('autocomplete', 'name');
      }
      if (f.required) inp.required = true;
      inp.setAttribute('data-testid', 'cb-field-' + f.slug);
      inp.addEventListener('blur', () => {
        const err = validateField(f, String(inp.value || '').trim());
        setError(errorEls[f.slug], err);
        inp.style.borderColor = err ? '#dc2626' : '#e5e7eb';
      });
      inp.addEventListener('input', () => {
        // Clear error as user types.
        if (errorEls[f.slug]) errorEls[f.slug].textContent = '';
        inp.style.borderColor = '#e5e7eb';
      });
      inputs[f.slug] = inp;
      form.appendChild(inp);
      const errEl = document.createElement('div');
      errEl.style.cssText = 'color:#dc2626;font-size:11px;margin-top:-6px;margin-bottom:8px;min-height:14px';
      errEl.setAttribute('data-testid', 'cb-err-' + f.slug);
      errorEls[f.slug] = errEl;
      form.appendChild(errEl);
    });
    const btn = document.createElement('button'); btn.textContent = res.submit_label || 'Submit';
    btn.setAttribute('data-testid', 'cb-submit-' + res.option_id);
    btn.onclick = async () => {
      // Client-side validation - mirrors the backend rules so users get instant feedback.
      const values = {}; let firstBadField = null;
      for (const f of (res.fields || [])) {
        const v = String(inputs[f.slug].value || '').trim();
        values[f.slug] = v;
        const err = validateField(f, v);
        setError(errorEls[f.slug], err);
        inputs[f.slug].style.borderColor = err ? '#dc2626' : '#e5e7eb';
        if (err && !firstBadField) firstBadField = f.slug;
      }
      if (firstBadField) { inputs[firstBadField].focus(); return; }

      btn.disabled = true; btn.textContent = 'Sending...';
      try {
        const resp = await fetch(`${API}${PREFIX}/public/chatbots/${SLUG}/session/${sessionUuid}/form`,
          { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ option_id: res.option_id, values }) });
        const r = await resp.json();
        if (!resp.ok || r.errors) {
          // Backend validation errors -> highlight each offending field.
          btn.disabled = false; btn.textContent = res.submit_label || 'Submit';
          const errs = (r && r.errors) || {};
          Object.keys(errs).forEach(k => {
            const slug = k.replace(/^values\./, '');
            const msg  = Array.isArray(errs[k]) ? errs[k][0] : errs[k];
            if (errorEls[slug]) { setError(errorEls[slug], msg); if (inputs[slug]) inputs[slug].style.borderColor = '#dc2626'; }
          });
          return;
        }
        form.remove();
        body.appendChild(el('div', 'cb-bubble-in', r.text || 'Thanks!'));
        if (r.back_to_menu !== false) appendBack();
        body.scrollTop = 99999;
      } catch (e) { btn.disabled = false; btn.textContent = res.submit_label || 'Submit'; alert('Sorry, could not submit. Please try again.'); }
    };
    form.appendChild(btn);
    var backBtn = document.createElement('button');
    backBtn.className = 'cb-back';
    backBtn.textContent = '\u2190 Back to menu';
    backBtn.setAttribute('data-testid', 'cb-form-back');
    backBtn.onclick = function () { form.remove(); renderMenu(); };
    form.appendChild(backBtn);
    body.appendChild(form);
    body.scrollTop = 99999;
  }

  function setError(node, msg) { if (node) node.textContent = msg || ''; }

  function validateField(f, v) {
    if (f.required && !v) return f.label + ' is required.';
    if (!v) return null;
    if (f.type === 'name') {
      if (v.length < 2 || v.length > 60) return f.label + ' must be 2-60 characters.';
      if (!/^[\p{L}][\p{L}\s.'\-]{1,59}$/u.test(v)) return f.label + ' should only contain letters.';
    } else if (f.type === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Please enter a valid email address.';
    } else if (f.type === 'phone') {
      const digits = v.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) return 'Please enter a valid phone number.';
    } else if (f.type === 'number') {
      if (!/^-?\d+(\.\d+)?$/.test(v)) return f.label + ' must be a number.';
    }
    return null;
  }

  function appendBack() {
    const back = document.createElement('button'); back.className = 'cb-back'; back.textContent = '<- Show menu';
    back.setAttribute('data-testid', 'cb-back-to-menu');
    back.onclick = () => { back.remove(); renderMenu(); };
    $('cbBody').appendChild(back);
  }

  function el(tag, cls, text) { const d = document.createElement(tag); d.className = cls; d.textContent = text; return d; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]); }
})();
