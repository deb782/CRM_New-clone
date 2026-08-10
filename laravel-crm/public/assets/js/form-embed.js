/* form-embed.js — Public embed script for CRM website forms.
   Renders a form into <div data-crm-form="{slug}"></div> by fetching the
   field schema from the CRM, then POSTs to the public submit endpoint.

   Usage (recommended):
     <div data-crm-form="my-form-slug"></div>
     <script src="https://crm.example.com/assets/js/form-embed.js"
             data-crm-base="https://crm.example.com" async></script>

   data-crm-base is optional — script auto-detects its own origin if omitted.
*/
(function () {
  function getBase(script) {
    // 1) Explicit override (most reliable)
    var explicit = script && script.getAttribute('data-crm-base');
    if (explicit) return explicit.replace(/\/+$/, '');
    // 2) Derive from script src
    var src = (script && script.src) || '';
    if (src) return src.replace(/\/assets\/js\/form-embed\.js.*$/, '').replace(/\/+$/, '');
    // 3) Last-ditch — same origin
    return location.origin;
  }

  function init() {
    var script = document.currentScript || (function () {
      var s = document.getElementsByTagName('script');
      // Find the script that loaded *this* file
      for (var i = s.length - 1; i >= 0; i--) {
        if ((s[i].src || '').indexOf('form-embed.js') !== -1) return s[i];
      }
      return s[s.length - 1];
    })();
    var base = getBase(script);

    var mounts = document.querySelectorAll('[data-crm-form]');
    if (!mounts.length) {
      console.warn('[CRM form-embed] No <div data-crm-form="..."> found on this page.');
      return;
    }

    mounts.forEach(function (mount) {
      var slug = mount.getAttribute('data-crm-form');
      if (!slug) return;
      mount.innerHTML = '<div style="padding:14px;color:#6b7280;font-family:system-ui,sans-serif">Loading form...</div>';

      var schemaUrl = base + '/crm-api/v1/public/forms/' + slug + '/schema';
      fetch(schemaUrl)
        .then(function (r) {
          if (!r.ok) {
            return r.text().then(function (body) {
              throw new Error('Schema fetch failed (' + r.status + '): ' + body.slice(0, 200));
            });
          }
          return r.json();
        })
        .then(function (schema) { render(mount, base, slug, schema); })
        .catch(function (err) {
          console.error('[CRM form-embed]', err);
          mount.innerHTML =
            '<div style="padding:18px;background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;color:#7f1d1d;font-family:system-ui,sans-serif">' +
            '<strong>Form failed to load.</strong><br>' + escapeHtml(err.message) +
            '<br><br><span style="font-size:12px;opacity:.8">Slug: <code>' + escapeHtml(slug) + '</code> · CRM URL: <code>' + escapeHtml(base) + '</code></span></div>';
        });
    });
  }

  function render(mount, base, slug, schema) {
    var fields = (schema && schema.fields) || [
      { slug: 'name',  label: 'Full Name', type: 'name',  is_required: true },
      { slug: 'phone', label: 'Phone',     type: 'tel',   is_required: true },
      { slug: 'email', label: 'Email',     type: 'email', is_required: true },
    ];
    var formStyle = 'font-family:system-ui,-apple-system,sans-serif;max-width:520px;padding:24px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.04)';
    var labelStyle = 'display:block;margin-top:14px;font-size:13px;color:#374151;font-weight:500';
    var inputStyle = 'width:100%;padding:10px 12px;margin-top:6px;border:1px solid #d1d5db;border-radius:6px;font-size:14px;box-sizing:border-box;font-family:inherit';
    var errStyle = 'color:#dc2626;font-size:12px;margin-top:4px;min-height:15px';
    var btnStyle = 'margin-top:18px;width:100%;padding:12px;background:#0b5fff;color:#fff;border:0;border-radius:6px;font-weight:600;cursor:pointer;font-size:15px';

    mount.innerHTML = '';
    var heading = document.createElement('h3');
    heading.textContent = (schema && schema.name) || 'Get in touch';
    heading.style.cssText = 'margin:0 0 6px;font-family:system-ui,sans-serif;color:#111827;font-size:18px';

    var form = document.createElement('form');
    form.setAttribute('style', formStyle);
    form.setAttribute('novalidate', '');
    form.appendChild(heading);

    var inputs = {}; var errors = {};
    fields.forEach(function (f) {
      var inputType = f.type === 'phone' ? 'tel'
                    : f.type === 'name'  ? 'text'
                    : f.type === 'textarea' ? 'textarea'
                    : (f.type || 'text');

      // Checkboxes render horizontally with the caption text NEXT TO the box
      // (not above), because the field's `placeholder` (or label) usually IS
      // the consent copy the user must read + tick.
      if (inputType === 'checkbox') {
        var wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex;align-items:flex-start;gap:8px;margin-top:14px';
        var cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.name = f.slug;
        cb.style.cssText = 'width:16px;height:16px;margin-top:2px;flex-shrink:0';
        if (f.is_required) cb.required = true;
        var cap = document.createElement('label');
        cap.style.cssText = 'font-size:13px;color:#374151;line-height:1.5;cursor:pointer';
        cap.textContent = (f.placeholder && f.placeholder.trim())
          ? f.placeholder + (f.is_required ? ' *' : '')
          : f.label + (f.is_required ? ' *' : '');
        cap.prepend(cb);
        wrap.appendChild(cap);
        form.appendChild(wrap);

        var errEl0 = document.createElement('div');
        errEl0.setAttribute('style', errStyle);
        errEl0.setAttribute('data-cf-err', f.slug);
        errors[f.slug] = errEl0;
        form.appendChild(errEl0);
        inputs[f.slug] = cb;
        cb.addEventListener('change', function () {
          var err = validateField(f, cb.checked ? '1' : '');
          setErr(errors[f.slug], null, err);
        });
        return;
      }

      var label = document.createElement('label');
      label.setAttribute('style', labelStyle);
      label.textContent = f.label + (f.is_required ? ' *' : '');

      var input;
      if (inputType === 'textarea') {
        input = document.createElement('textarea');
        input.style.minHeight = '80px';
      } else if (inputType === 'dropdown' || inputType === 'multiselect' || inputType === 'radio' || inputType === 'checkbox_group') {
        // Use <select> for dropdown/radio-like fields (radio/checkbox_group render as a select for simplicity).
        input = document.createElement('select');
        if (inputType === 'multiselect') input.multiple = true;
        if (!f.is_required) input.appendChild(new Option('Select...', ''));
        (f.options || []).forEach(function (o) { input.appendChild(new Option(o, o)); });
      } else {
        input = document.createElement('input');
        input.type = inputType === 'name' ? 'text' : inputType;
        if (f.type === 'phone') input.setAttribute('inputmode', 'tel');
        if (f.type === 'number') input.setAttribute('inputmode', 'numeric');
        if (f.type === 'email') input.setAttribute('autocomplete', 'email');
        if (f.type === 'name')  input.setAttribute('autocomplete', 'name');
      }
      input.name = f.slug;
      if (f.placeholder) input.setAttribute('placeholder', f.placeholder);
      input.setAttribute('style', inputStyle);
      inputs[f.slug] = input;
      label.appendChild(input);
      form.appendChild(label);

      var errEl = document.createElement('div');
      errEl.setAttribute('style', errStyle);
      errEl.setAttribute('data-cf-err', f.slug);
      errors[f.slug] = errEl;
      form.appendChild(errEl);

      // Inline validation on blur + clear on input
      input.addEventListener('blur', function () {
        var err = validateField(f, String(input.value || '').trim());
        setErr(errors[f.slug], input, err);
      });
      input.addEventListener('input', function () { setErr(errors[f.slug], input, null); });
    });

    var msg = document.createElement('div'); msg.style.cssText = 'margin-top:12px;font-size:13px';
    var btn = document.createElement('button');
    btn.type = 'submit'; btn.textContent = (schema && schema.button_label) || 'Submit';
    btn.setAttribute('style', btnStyle);
    form.appendChild(btn); form.appendChild(msg);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // 1) Full client-side validation - same rules the backend enforces.
      var firstBad = null;
      fields.forEach(function (f) {
        var v;
        if (f.type === 'checkbox') {
          v = inputs[f.slug].checked ? '1' : '';
        } else {
          v = String((inputs[f.slug].value !== undefined ? inputs[f.slug].value : '')).trim();
        }
        var err = validateField(f, v);
        setErr(errors[f.slug], f.type === 'checkbox' ? null : inputs[f.slug], err);
        if (err && !firstBad) firstBad = f.slug;
      });
      if (firstBad) { if (inputs[firstBad].focus) inputs[firstBad].focus(); msg.style.color = '#dc2626'; msg.textContent = 'Please fix the highlighted fields.'; return; }

      var origBtnHTML = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid #fff;border-top-color:transparent;border-radius:50%;animation:_crmspin .7s linear infinite;vertical-align:-2px;margin-right:6px"></span>Sending...';
      ensureKeyframes();
      msg.style.color = '#6b7280'; msg.textContent = '';

      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = v; });
      ['utm_source', 'utm_medium', 'utm_campaign'].forEach(function (k) {
        var m = location.search.match(new RegExp('[?&]' + k + '=([^&]+)'));
        if (m) data[k] = decodeURIComponent(m[1]);
      });

      fetch(base + '/crm-api/v1/public/forms/' + slug + '/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json; charset=utf-8', 'Accept': 'application/json' },
        body: JSON.stringify(data),
      }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; })
          .catch(function () { return { ok: r.ok, status: r.status, data: {} }; });
      }).then(function (r) {
        if (r.ok || (r.status >= 200 && r.status < 300)) {
          if (r.data && r.data.redirect_url) { location.href = r.data.redirect_url; return; }
          mount.innerHTML =
            '<div style="padding:32px 24px;background:#dcfce7;color:#14532d;border-radius:12px;font-family:system-ui;text-align:center;border:1px solid #86efac">' +
            '<div style="font-size:48px;margin-bottom:12px;line-height:1">&#10003;</div>' +
            '<div style="font-weight:700;font-size:18px;margin-bottom:6px">Thank you for submitting!</div>' +
            '<div style="font-size:14px;opacity:.85">' + escapeHtml((r.data && r.data.message) || 'We have received your details and will reach out shortly.') + '</div>' +
            '</div>';
        } else if (r.status === 422 && r.data && r.data.errors) {
          // Backend rejected — highlight offending fields
          Object.keys(r.data.errors).forEach(function (k) {
            var slug = k.replace(/^values\./, '');
            var m = Array.isArray(r.data.errors[k]) ? r.data.errors[k][0] : r.data.errors[k];
            if (errors[slug]) setErr(errors[slug], inputs[slug], m);
          });
          msg.style.color = '#dc2626'; msg.textContent = 'Please fix the highlighted fields.';
          btn.disabled = false; btn.innerHTML = origBtnHTML;
        } else {
          msg.style.color = '#dc2626';
          msg.textContent = (r.data && r.data.message) || ((r.data && r.data.error && r.data.error.message) || 'Submission failed (HTTP ' + r.status + ')');
          btn.disabled = false; btn.innerHTML = origBtnHTML;
        }
      }).catch(function (err) {
        msg.style.color = '#dc2626';
        msg.textContent = err.message + ' - check browser DevTools (F12) Network tab for details.';
        btn.disabled = false; btn.innerHTML = origBtnHTML;
      });

      setTimeout(function () {
        if (btn.disabled) {
          btn.disabled = false; btn.innerHTML = origBtnHTML;
          msg.style.color = '#92400e';
          msg.textContent = 'Request timed out. The lead may still have been saved - please check with the admin.';
        }
      }, 20000);
    });

    mount.appendChild(form);
  }

  function setErr(errEl, inp, msg) {
    if (!errEl) return;
    errEl.textContent = msg || '';
    if (inp && inp.style) inp.style.borderColor = msg ? '#dc2626' : '#d1d5db';
  }

  // Kept in sync with the CRM's server-side rules.
  function validateField(f, v) {
    var t = f.type;
    if (f.is_required && !v) return f.label + ' is required.';
    if (!v) return null;
    if (t === 'name' || (t === 'text' && /(^|_)name(_|$)/i.test(f.slug))) {
      if (v.length < 2 || v.length > 60) return f.label + ' must be 2-60 characters.';
      if (!/^[A-Za-z][A-Za-z\s.'\-]{1,59}$/.test(v)) return f.label + ' should only contain letters.';
    } else if (t === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Please enter a valid email address.';
    } else if (t === 'phone' || t === 'tel') {
      var d = v.replace(/\D/g, '');
      if (d.length < 7 || d.length > 15) return 'Please enter a valid phone number.';
    } else if (t === 'number') {
      if (!/^-?\d+(\.\d+)?$/.test(v)) return f.label + ' must be a number.';
    }
    return null;
  }

  function ensureKeyframes() {
    if (document.getElementById('_crm_kf')) return;
    var st = document.createElement('style');
    st.id = '_crm_kf';
    st.textContent = '@keyframes _crmspin{to{transform:rotate(360deg)}}';
    document.head.appendChild(st);
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
