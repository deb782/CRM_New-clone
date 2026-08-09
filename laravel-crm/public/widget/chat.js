/* Real Estate CRM — embeddable website chat widget (scripted lead capture).
   Usage: <script src="https://YOUR-CRM/widget/chat.js" async></script>
   Optional attributes: data-ref="PARTNERCODE"  data-title="..."  data-accent="#6c8cff" */
(function () {
  if (window.__crmChatWidget) return;
  window.__crmChatWidget = true;

  var script = document.currentScript || (function () { var s = document.getElementsByTagName('script'); return s[s.length - 1]; })();
  var origin = (function () { try { return new URL(script.src).origin; } catch (e) { return window.location.origin; } })();
  var ref = script.getAttribute('data-ref') || '';
  var title = script.getAttribute('data-title') || 'Find your dream home';
  var accent = script.getAttribute('data-accent') || '#6c8cff';
  var endpoint = ref ? (origin + '/api/v1/public/refer/' + encodeURIComponent(ref)) : (origin + '/api/v1/chatbot');

  var answers = {};
  var idx = 0;
  var steps = [
    { key: 'name', q: "Hi! I can help you explore our projects. First, what's your name?", validate: function (v) { return v.trim().length >= 2 ? '' : 'Please enter your name.'; } },
    { key: 'contact', q: "Great to meet you, {name}! What's the best phone or email to reach you?", validate: validateContact },
    { key: 'looking', q: "What are you looking for?", quick: ['Apartment', 'Plot', 'Villa', 'Commercial'] },
    { key: 'budget', q: "What's your budget range?", quick: ['Under ₹50L', '₹50L–1Cr', '₹1–2Cr', '₹2Cr+'], optional: true },
    { key: 'location', q: "Any preferred location or area? (or skip)", optional: true }
  ];

  function validateContact(v) {
    v = v.trim();
    if (v.indexOf('@') > -1) { answers._email = v; return ''; }
    var digits = v.replace(/\D/g, '');
    if (digits.length >= 8) { answers._phone = v; return ''; }
    return 'Enter a valid phone number or email.';
  }

  function css() {
    return '#crmcw-root{position:fixed;bottom:22px;right:22px;z-index:2147483000;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif}' +
      '#crmcw-bubble{width:60px;height:60px;border-radius:50%;background:' + accent + ';border:0;cursor:pointer;box-shadow:0 12px 30px rgba(0,0,0,.28);display:flex;align-items:center;justify-content:center;transition:transform .15s ease}' +
      '#crmcw-bubble:hover{transform:translateY(-2px) scale(1.04)}' +
      '#crmcw-bubble svg{width:28px;height:28px;fill:#fff}' +
      '.crmcw-panel{position:absolute;bottom:74px;right:0;width:340px;max-width:calc(100vw - 32px);height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:16px;box-shadow:0 24px 70px rgba(0,0,0,.32);display:none;flex-direction:column;overflow:hidden;border:1px solid #e6e9f2}' +
      '.crmcw-panel.open{display:flex;animation:crmcw-in .18s ease}' +
      '@keyframes crmcw-in{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
      '.crmcw-head{background:' + accent + ';color:#fff;padding:16px 18px;display:flex;align-items:center;justify-content:space-between}' +
      '.crmcw-head b{font-size:15px;display:block}.crmcw-head span{font-size:12px;opacity:.85}' +
      '.crmcw-close{background:transparent;border:0;color:#fff;font-size:20px;cursor:pointer;line-height:1;opacity:.9}' +
      '.crmcw-msgs{flex:1;overflow-y:auto;padding:16px;background:#f6f7fb;display:flex;flex-direction:column;gap:10px}' +
      '.crmcw-b{max-width:82%;padding:10px 13px;border-radius:14px;font-size:14px;line-height:1.4}' +
      '.crmcw-bot{background:#fff;border:1px solid #e6e9f2;color:#1a2036;align-self:flex-start;border-bottom-left-radius:4px}' +
      '.crmcw-me{background:' + accent + ';color:#fff;align-self:flex-end;border-bottom-right-radius:4px}' +
      '.crmcw-quick{display:flex;flex-wrap:wrap;gap:6px;align-self:flex-start;max-width:90%}' +
      '.crmcw-chip{background:#fff;border:1px solid ' + accent + ';color:' + accent + ';border-radius:20px;padding:6px 12px;font-size:13px;cursor:pointer}' +
      '.crmcw-chip:hover{background:' + accent + ';color:#fff}' +
      '.crmcw-foot{display:flex;gap:8px;padding:12px;border-top:1px solid #eceef5;background:#fff}' +
      '.crmcw-input{flex:1;border:1px solid #d9dEEA;border-radius:22px;padding:10px 14px;font-size:14px;outline:none}' +
      '.crmcw-input:focus{border-color:' + accent + '}' +
      '.crmcw-send{width:40px;height:40px;border-radius:50%;background:' + accent + ';border:0;cursor:pointer;display:flex;align-items:center;justify-content:center}' +
      '.crmcw-send svg{width:18px;height:18px;fill:#fff}.crmcw-send:disabled{opacity:.5;cursor:default}';
  }

  var root, msgs, input, sendBtn, panel;

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    if (attrs) for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  function bot(text) {
    var b = el('div', { class: 'crmcw-b crmcw-bot', 'data-testid': 'chat-widget-bot-msg' }, text);
    msgs.appendChild(b); scroll();
  }
  function me(text) {
    var b = el('div', { class: 'crmcw-b crmcw-me', 'data-testid': 'chat-widget-user-msg' }, text);
    msgs.appendChild(b); scroll();
  }
  function scroll() { msgs.scrollTop = msgs.scrollHeight; }

  function ask() {
    var step = steps[idx];
    var q = step.q.replace('{name}', answers.name || '');
    bot(q);
    if (step.quick) {
      var wrap = el('div', { class: 'crmcw-quick' });
      var opts = step.quick.concat(step.optional ? ['Skip'] : []);
      opts.forEach(function (o) {
        var c = el('button', { class: 'crmcw-chip', 'data-testid': 'chat-widget-quick', type: 'button' }, o);
        c.onclick = function () { wrap.remove(); submit(o === 'Skip' ? '' : o); };
        wrap.appendChild(c);
      });
      msgs.appendChild(wrap); scroll();
    }
  }

  function submit(val) {
    var step = steps[idx];
    val = (val || '').trim();
    if (step.validate) { var err = step.validate(val); if (err) { bot(err); return; } }
    if (step.optional && !val && !step.quick) { val = ''; }
    if (val) me(val);
    answers[step.key] = val;
    idx++;
    if (idx < steps.length) { setTimeout(ask, 250); }
    else { setTimeout(finish, 250); }
  }

  function finish() {
    input.disabled = true; sendBtn.disabled = true;
    var msg = 'Looking for: ' + (answers.looking || 'Not specified') +
      ' | Budget: ' + (answers.budget || 'Not specified') +
      ' | Location: ' + (answers.location || 'Not specified');
    var payload = { name: answers.name, phone: answers._phone || null, email: answers._email || null, message: msg };
    bot('Thanks! Submitting your details…');
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok) throw new Error((res.d && res.d.message) || 'Something went wrong');
        var done = el('div', { class: 'crmcw-b crmcw-bot', 'data-testid': 'chat-widget-success' },
          (res.d && res.d.reply) || (res.d && res.d.message) || "You're all set — our team will reach out shortly!");
        msgs.appendChild(done); scroll();
      })
      .catch(function (e) {
        input.disabled = false; sendBtn.disabled = false;
        bot(e.message || 'Sorry, something went wrong. Please try again.');
        idx = steps.length - 1;
      });
  }

  function iconChat() { return '<svg viewBox="0 0 24 24"><path d="M12 3C6.5 3 2 6.8 2 11.5c0 2.2 1 4.2 2.7 5.7-.1 1.1-.5 2.5-1.4 3.6 1.7-.2 3.3-.9 4.5-1.7 1.3.4 2.7.7 4.2.7 5.5 0 10-3.8 10-8.5S17.5 3 12 3z"/></svg>'; }
  function iconSend() { return '<svg viewBox="0 0 24 24"><path d="M3 20.5l18-8.5L3 3.5 3 10l13 2-13 2z"/></svg>'; }

  function build() {
    if (document.getElementById('crmcw-root')) return;
    var style = el('style'); style.textContent = css(); document.head.appendChild(style);

    root = el('div', { id: 'crmcw-root' });
    var bubble = el('button', { id: 'crmcw-bubble', 'data-testid': 'chat-widget-bubble', 'aria-label': 'Open chat' });
    bubble.innerHTML = iconChat();

    panel = el('div', { class: 'crmcw-panel', 'data-testid': 'chat-widget-panel' });
    var head = el('div', { class: 'crmcw-head' });
    head.appendChild(el('div', {}, null));
    head.firstChild.appendChild(el('b', {}, title));
    head.firstChild.appendChild(el('span', {}, 'Typically replies in a few minutes'));
    var close = el('button', { class: 'crmcw-close', 'data-testid': 'chat-widget-close', 'aria-label': 'Close' }, '×');
    head.appendChild(close);

    msgs = el('div', { class: 'crmcw-msgs', 'data-testid': 'chat-widget-messages' });

    var foot = el('div', { class: 'crmcw-foot' });
    input = el('input', { class: 'crmcw-input', 'data-testid': 'chat-widget-input', placeholder: 'Type your reply…' });
    sendBtn = el('button', { class: 'crmcw-send', 'data-testid': 'chat-widget-send', 'aria-label': 'Send' });
    sendBtn.innerHTML = iconSend();
    foot.appendChild(input); foot.appendChild(sendBtn);

    panel.appendChild(head); panel.appendChild(msgs); panel.appendChild(foot);
    root.appendChild(panel); root.appendChild(bubble);
    document.body.appendChild(root);

    var started = false;
    function open() { panel.classList.add('open'); if (!started) { started = true; ask(); } input.focus(); }
    function toggle() { panel.classList.contains('open') ? panel.classList.remove('open') : open(); }
    bubble.onclick = toggle;
    close.onclick = function () { panel.classList.remove('open'); };
    function send() { var v = input.value; if (!v.trim()) return; input.value = ''; submit(v); }
    sendBtn.onclick = send;
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); send(); } });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
