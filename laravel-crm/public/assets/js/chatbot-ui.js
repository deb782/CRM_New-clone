/* chatbot-ui.js — Menu-driven Chatbot Builder (v16.1)
 *
 * Simple model that matches how estate developers use chat widgets:
 * a welcome message + a list of quick-action option buttons. Each option has
 * ONE of three actions:
 *   • Answer  → bot replies with text (+ optional image URL)
 *   • Form    → shows an inline form; submit creates a lead
 *   • Link    → opens an external URL (map, brochure PDF, video)
 *
 * The whole config is stored in Chatbot.settings.menu (JSON). No node graph.
 */
/* global Api, h, toast, Modal, setTitle, setTopbarActions */

const ACTION_TYPES = [
  { value: 'answer', label: 'Answer (bot text reply)' },
  { value: 'form',   label: 'Form (collect details → create lead)' },
  { value: 'link',   label: 'Link (open URL / brochure PDF / map)' },
];

const FIELD_TYPES = [
  { value: 'name',     label: 'Name (letters only)' },
  { value: 'text',     label: 'Text' },
  { value: 'email',    label: 'Email' },
  { value: 'phone',    label: 'Phone' },
  { value: 'number',   label: 'Number' },
  { value: 'textarea', label: 'Long text' },
  { value: 'dropdown', label: 'Dropdown' },
];

const DEFAULT_FORM_FIELDS = () => ([
  { slug: 'first_name', label: 'Your Name',  type: 'name',  required: true },
  { slug: 'phone',      label: 'Phone',      type: 'phone', required: true },
  { slug: 'email',      label: 'Email',      type: 'email', required: true },
]);

const DEFAULT_OPTIONS = () => ([
  { id: 'brochure',        icon: '📁', label: 'Brochure',            action: 'form',
    form_title: 'Get the brochure',  thank_you: 'Thanks! Brochure link has been sent to your email.',
    mark_qualified: true, form_fields: DEFAULT_FORM_FIELDS() },
  { id: 'project_details', icon: '🏠', label: 'Project details',     action: 'answer',
    answer: 'We are Bangalore\'s premium real-estate developers offering managed farmland communities and premium plots. Ask about our latest projects or explore below.' },
  { id: 'current_price',   icon: '📗', label: 'Current Price',       action: 'form',
    form_title: 'Get current pricing', thank_you: 'Our sales team will send you the latest price sheet shortly.',
    mark_qualified: true, form_fields: DEFAULT_FORM_FIELDS() },
  { id: 'location',        icon: '📍', label: 'Location',            action: 'link',
    url: 'https://maps.google.com/?q=Bangalore' },
  { id: 'site_visit',      icon: '✅', label: 'Book a site visit',   action: 'form',
    form_title: 'Book your site visit',
    thank_you: 'Booked! Our team will call you to confirm the slot.',
    mark_qualified: true,
    form_fields: [
      { slug: 'first_name', label: 'Your Name',  type: 'name',  required: true },
      { slug: 'phone',      label: 'Phone',      type: 'phone', required: true },
      { slug: 'email',      label: 'Email',      type: 'email', required: true },
      { slug: 'preferred_date', label: 'Preferred date', type: 'text', required: false },
    ]},
]);

const ChatbotBuilderView = {
  state: {
    editing: null,
    bot: null,
    selectedOptionIdx: 0,
  },

  // Validates a form-field value against its type + required flag. Returns null if OK,
  // or a human-readable error string. Kept in sync with backend ChatbotController rules.
  _validateField(f, v) {
    if (f.required && !v) return f.label + ' is required.';
    if (!v) return null;
    if (f.type === 'name') {
      if (v.length < 2 || v.length > 60) return f.label + ' must be 2–60 characters.';
      if (!/^[\p{L}][\p{L}\s.'\-]{1,59}$/u.test(v)) return f.label + ' should only contain letters.';
    } else if (f.type === 'email') {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) return 'Please enter a valid email address.';
    } else if (f.type === 'phone') {
      const digits = v.replace(/\D/g, '');
      if (digits.length < 7 || digits.length > 15) return 'Please enter a valid phone number.';
    } else if (f.type === 'number') {
      if (!/^-?\d+(\.\d+)?$/.test(v)) return f.label + ' must be a number.';
    } else if (f.type === 'dropdown') {
      if (f.required && !v) return 'Please pick an option for ' + f.label + '.';
      if (Array.isArray(f.options) && f.options.length && !f.options.includes(v)) return 'Please pick a valid option for ' + f.label + '.';
    }
    return null;
  },

  /**
   * Renders a compact "Upload / Choose file" row for images or PDFs.
   * Uploads via POST /api/v1/chatbots/upload and calls opts.onChange(url).
   */
  _renderUploadRow(opts) {
    const wrap = h('div', { style: 'display:flex;gap:10px;align-items:center;flex-wrap:wrap' });
    const preview = h('div', { style: 'display:flex;align-items:center;gap:6px' });
    const renderPreview = () => {
      preview.innerHTML = '';
      if (!opts.current) { preview.appendChild(h('span', { class: 'muted text-sm' }, 'No file')); return; }
      if (/\.pdf(\?|$)/i.test(opts.current)) {
        preview.appendChild(h('a', { href: opts.current, target: '_blank', rel: 'noopener',
          class: 'muted text-sm', style: 'text-decoration:underline' }, 'View PDF'));
      } else {
        preview.appendChild(h('img', { src: opts.current,
          style: 'width:44px;height:44px;border-radius:6px;object-fit:cover;border:1px solid var(--border)',
          onerror: (e) => { e.target.style.display = 'none'; } }));
      }
      preview.appendChild(h('button', { class: 'btn-xs', style: 'color:#dc2626',
        onclick: (e) => { e.preventDefault(); opts.onChange(''); } }, 'Remove'));
    };

    const status = h('span', { class: 'muted text-sm' });
    const input = h('input', { type: 'file', accept: opts.accept || 'image/*',
      'data-testid': opts.testid || 'upload-input',
      onchange: async (e) => {
        const file = e.target.files && e.target.files[0]; if (!file) return;
        status.textContent = 'Uploading...';
        try {
          const url = await ChatbotBuilderView._uploadFile(file, opts.kind || 'logo');
          opts.onChange(url);
          status.textContent = 'Uploaded';
        } catch (err) { status.textContent = ''; toast(err.message || 'Upload failed', 'error'); }
        e.target.value = ''; // allow re-uploading same file
      }
    });

    const urlInput = h('input', { placeholder: 'or paste a URL', value: opts.current || '',
      onchange: (e) => { opts.onChange(e.target.value.trim()); },
      style: 'flex:1;min-width:180px' });

    wrap.appendChild(input);
    wrap.appendChild(urlInput);
    wrap.appendChild(status);
    wrap.appendChild(preview);
    renderPreview();
    return wrap;
  },

  async _uploadFile(file, kind) {
    const fd = new FormData(); fd.append('file', file); fd.append('kind', kind);
    const resp = await fetch(CRM.API + '/chatbots/upload', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + CRM.token(), 'Accept': 'application/json' },
      body: fd,
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.message || ('Upload failed: ' + resp.status));
    return data.url;
  },

  async render() {
    setTitle('Chatbot Builder');
    setTopbarActions(h('button', { class: 'btn-primary', 'data-testid': 'chatbot-new-btn', onclick: () => ChatbotBuilderView.startNew() }, '+ New Chatbot'));
    const page = document.getElementById('page');
    page.innerHTML = '<div class="spinner"></div>';

    let data;
    try { data = await Api.get('/api/v1/chatbots'); }
    catch (e) { page.innerHTML = '<div class="empty">Admin access required.</div>'; return; }

    page.innerHTML = '';

    if (!data.items.length) {
      page.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-body' },
        h('div', { class: 'empty' },
          h('p', {}, 'No chatbots yet.'),
          h('p', { class: 'muted' }, 'Click "+ New Chatbot" to build a menu of quick actions (Brochure, Project details, Location, Book a site visit…) with one click each. Every form submission creates a lead.')
        )
      )));
      return;
    }

    page.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-body' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Name'), h('th', {}, 'Slug'), h('th', {}, 'Options'),
            h('th', {}, 'Status'), h('th', {}, 'Actions')
          )),
          h('tbody', { 'data-testid': 'chatbot-list' }, ...data.items.map(bot => {
            const menuCount = (bot.settings && bot.settings.menu) ? bot.settings.menu.length : 0;
            return h('tr', { 'data-testid': 'chatbot-row-' + bot.id },
              h('td', {}, bot.name),
              h('td', {}, h('code', {}, bot.slug)),
              h('td', {}, String(menuCount)),
              h('td', {}, h('span', { class: 'badge badge-' + (bot.is_active ? 'won' : 'lost') }, bot.is_active ? 'active' : 'inactive')),
              h('td', { style: 'display:flex;gap:6px;flex-wrap:wrap' },
                h('button', { class: 'btn-sm btn-secondary', 'data-testid': 'chatbot-embed-' + bot.id, onclick: () => ChatbotBuilderView.showEmbed(bot) }, 'Embed'),
                h('button', { class: 'btn-sm btn-secondary', 'data-testid': 'chatbot-test-' + bot.id, onclick: () => ChatbotBuilderView.openPreview(bot) }, 'Test'),
                h('button', { class: 'btn-sm btn-secondary', 'data-testid': 'chatbot-edit-' + bot.id, onclick: () => ChatbotBuilderView.edit(bot.id) }, 'Edit'),
                h('button', { class: 'btn-sm btn-secondary', style: 'color:#dc2626;border-color:#fecaca',
                  'data-testid': 'chatbot-delete-' + bot.id,
                  onclick: async () => {
                    if (!confirm('Delete chatbot "' + bot.name + '"? Embed scripts using this slug will stop working.')) return;
                    try { await Api.delete('/api/v1/chatbots/' + bot.id); toast('Chatbot deleted'); ChatbotBuilderView.render(); }
                    catch (e) { toast(e.message, 'error'); }
                  } }, 'Delete')
              )
            );
          }))
        )
      )
    ));
  },

  startNew() {
    this.state.editing = null;
    this.state.bot = {
      name: 'Agrocorp Website Bot', brand_name: 'Agrocorp', brand_color: '#0f3d33',
      logo_url: '',
      welcome_message: 'Welcome to Agrocorp. Bangalore\'s Premium Real Estate Developers. Explore premium farmhouse plots and managed communities designed for hassle-free, secure, and sustainable living.',
      is_active: true, escalate_on_qualified: true,
      project_id: null,
      menu_options: DEFAULT_OPTIONS(),
    };
    this.state.selectedOptionIdx = 0;
    this.renderEditor();
  },

  async edit(id) {
    const page = document.getElementById('page');
    page.innerHTML = '<div class="spinner"></div>';
    try {
      const bot = await Api.get('/api/v1/chatbots/' + id);
      this.state.editing = bot.id;
      this.state.bot = {
        name: bot.name, brand_name: bot.brand_name, brand_color: bot.brand_color,
        logo_url: (bot.settings && bot.settings.logo_url) || '',
        welcome_message: bot.welcome_message,
        is_active: !!bot.is_active, escalate_on_qualified: !!bot.escalate_on_qualified,
        project_id: bot.project_id,
        menu_options: ((bot.settings && bot.settings.menu) || []).map(o => ({
          id: o.id, icon: o.icon || '', label: o.label || '',
          action: o.action || 'answer',
          answer: o.answer || '', answer_image: o.answer_image || '',
          answer_images: Array.isArray(o.answer_images) ? [...o.answer_images] : [],
          answer_pdf: o.answer_pdf || '', answer_pdf_label: o.answer_pdf_label || '',
          url: o.url || '',
          form_title: o.form_title || '', thank_you: o.thank_you || '',
          mark_qualified: !!o.mark_qualified,
          form_fields: (o.form_fields || []).map(f => ({ ...f })),
        })),
      };
      if (!this.state.bot.menu_options.length) this.state.bot.menu_options = DEFAULT_OPTIONS();
      this.state.selectedOptionIdx = 0;
      this.renderEditor();
    } catch (e) { toast(e.message, 'error'); this.render(); }
  },

  renderEditor() {
    const bot = this.state.bot;
    setTitle(this.state.editing ? 'Edit Chatbot' : 'New Chatbot');
    setTopbarActions();
    const page = document.getElementById('page');
    page.innerHTML = '';

    page.appendChild(h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:16px' },
      h('button', { class: 'btn-secondary btn-sm', onclick: () => ChatbotBuilderView.render() }, '‹ Back to list'),
      h('div', { style: 'display:flex;gap:10px' },
        h('button', { class: 'btn-secondary', 'data-testid': 'chatbot-preview-btn', onclick: () => ChatbotBuilderView.previewDraft() }, 'Preview'),
        h('button', { class: 'btn-primary', 'data-testid': 'chatbot-save-btn', onclick: () => ChatbotBuilderView.save() }, this.state.editing ? 'Save Changes' : 'Create Chatbot'),
      )
    ));

    // 1) Bot metadata
    const meta = h('div', { class: 'card mb-16' },
      h('div', { class: 'card-header' }, h('div', { class: 'card-title' }, 'Chatbot Details')),
      h('div', { class: 'card-body' })
    );
    const mb = meta.lastChild;
    mb.appendChild(h('div', { class: 'grid grid-2' },
      h('div', {},
        h('label', {}, 'Bot Name *'),
        h('input', { 'data-testid': 'chatbot-name-input', value: bot.name, onchange: (e) => bot.name = e.target.value, placeholder: 'e.g. Website Sales Bot' })
      ),
      h('div', {},
        h('label', {}, 'Brand Label (in header)'),
        h('input', { value: bot.brand_name, onchange: (e) => bot.brand_name = e.target.value, placeholder: 'e.g. Agrocorp' })
      ),
      h('div', {},
        h('label', {}, 'Brand Color'),
        h('input', { type: 'color', value: bot.brand_color || '#0f3d33', onchange: (e) => bot.brand_color = e.target.value, style: 'height:40px' })
      ),
      h('div', {},
        h('label', { style: 'display:flex;align-items:center;gap:6px;font-weight:normal;margin-top:24px' },
          h('input', { type: 'checkbox', checked: bot.is_active ? 'checked' : null,
            onchange: (e) => bot.is_active = e.target.checked }),
          'Active (visitors can chat)')
      ),
    ));
    mb.appendChild(h('label', { style: 'margin-top:14px' }, 'Logo (shown in chat header - leave blank to show the brand initial)'));
    mb.appendChild(this._renderUploadRow({
      kind: 'logo', accept: 'image/*',
      current: bot.logo_url || '',
      testid: 'chatbot-logo-upload',
      onChange: (url) => { bot.logo_url = url || ''; ChatbotBuilderView.renderEditor(); },
      previewClass: 'logo',
    }));
    mb.appendChild(h('label', { style: 'margin-top:14px' }, 'Welcome Message'));
    mb.appendChild(h('textarea', { onchange: (e) => bot.welcome_message = e.target.value, placeholder: 'The first bubble the visitor sees', style: 'min-height:80px' }, bot.welcome_message || ''));
    mb.appendChild(h('label', { style: 'display:flex;align-items:center;gap:6px;font-weight:normal;margin-top:14px' },
      h('input', { type: 'checkbox', checked: bot.escalate_on_qualified ? 'checked' : null,
        onchange: (e) => bot.escalate_on_qualified = e.target.checked }),
      'Mark leads captured via qualified options as "Hot" priority'
    ));
    page.appendChild(meta);

    // 2) Menu builder — two columns
    const flow = h('div', { class: 'card mb-16' },
      h('div', { class: 'card-header' }, h('div', { class: 'card-title' }, 'Menu Options')),
      h('div', { class: 'card-body' })
    );
    const fb = flow.lastChild;
    fb.appendChild(h('div', { class: 'muted text-sm', style: 'margin-bottom:12px' },
      'These are the quick-action buttons the visitor sees. Click a row to configure its action (answer text, form fields, or a link).'));
    const cols = h('div', { style: 'display:grid;grid-template-columns:320px 1fr;gap:20px' });
    cols.appendChild(this.renderOptionList());
    cols.appendChild(this.renderOptionEditor());
    fb.appendChild(cols);
    page.appendChild(flow);
  },

  renderOptionList() {
    const bot = this.state.bot;
    const box = h('div', { style: 'border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--surface)' },
      h('div', { style: 'padding:10px 12px;background:var(--surface-alt);font-weight:600;font-size:13px;display:flex;justify-content:space-between;align-items:center' },
        h('span', {}, 'Options (' + bot.menu_options.length + ')'),
        h('button', { class: 'btn-sm btn-primary', 'data-testid': 'chatbot-add-option-btn', onclick: () => ChatbotBuilderView.addOption() }, '+ Add')
      ),
    );
    bot.menu_options.forEach((o, i) => {
      const sel = this.state.selectedOptionIdx === i;
      const row = h('div', {
        'data-testid': 'chatbot-option-row-' + i,
        draggable: 'true',
        style: 'padding:10px 12px;border-top:1px solid var(--border);cursor:grab;background:' + (sel ? 'var(--primary-50, #ecfdf5)' : 'transparent'),
        ondragstart: (e) => { e.dataTransfer.setData('text/plain', String(i)); e.dataTransfer.effectAllowed = 'move'; row.style.opacity = '0.4'; },
        ondragend:   () => { row.style.opacity = '1'; },
        ondragover:  (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; row.style.background = 'var(--primary-50, #ecfdf5)'; },
        ondragleave: () => { row.style.background = sel ? 'var(--primary-50, #ecfdf5)' : 'transparent'; },
        ondrop: (e) => {
          e.preventDefault();
          const from = parseInt(e.dataTransfer.getData('text/plain'), 10);
          if (Number.isNaN(from) || from === i) return;
          const arr = bot.menu_options; const [moved] = arr.splice(from, 1); arr.splice(i, 0, moved);
          if (ChatbotBuilderView.state.selectedOptionIdx === from) ChatbotBuilderView.state.selectedOptionIdx = i;
          ChatbotBuilderView.renderEditor();
        },
        onclick: () => { ChatbotBuilderView.state.selectedOptionIdx = i; ChatbotBuilderView.renderEditor(); }
      },
        h('div', { style: 'display:flex;justify-content:space-between;align-items:center;gap:6px' },
          h('div', { style: 'display:flex;align-items:center;gap:8px;min-width:0' },
            h('span', { class: 'muted', style: 'font-size:14px;cursor:grab' }, '⋮⋮'),
            h('span', { style: 'font-size:18px' }, o.icon || '•'),
            h('div', { style: 'min-width:0' },
              h('div', { style: 'font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' }, o.label || '(untitled)'),
              h('div', { class: 'muted text-sm', style: 'font-size:12px' }, o.action)
            )
          ),
          h('div', { style: 'display:flex;gap:2px;flex-shrink:0' },
            h('button', { class: 'btn-xs', title: 'Move up',
              onclick: (e) => { e.stopPropagation(); ChatbotBuilderView.moveOption(i, -1); } }, '↑'),
            h('button', { class: 'btn-xs', title: 'Move down',
              onclick: (e) => { e.stopPropagation(); ChatbotBuilderView.moveOption(i, 1); } }, '↓'),
            h('button', { class: 'btn-xs', title: 'Delete', style: 'color:#dc2626',
              onclick: (e) => { e.stopPropagation(); ChatbotBuilderView.deleteOption(i); } }, '×'),
          )
        )
      );
      box.appendChild(row);
    });
    return box;
  },

  renderOptionEditor() {
    const bot = this.state.bot;
    const idx = this.state.selectedOptionIdx;
    if (idx < 0 || idx >= bot.menu_options.length) {
      return h('div', { class: 'empty' }, 'Add or select an option to edit.');
    }
    const o = bot.menu_options[idx];
    const editor = h('div', { style: 'padding:16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--bg)' });

    editor.appendChild(h('div', { class: 'grid grid-2' },
      h('div', {},
        h('label', {}, 'Icon (emoji)'),
        h('input', { 'data-testid': 'option-icon-input', value: o.icon || '', maxlength: 4,
          onchange: (e) => { o.icon = e.target.value; ChatbotBuilderView.renderEditor(); },
          placeholder: '📁 🏠 📍 ✅' })),
      h('div', {},
        h('label', {}, 'Button Label *'),
        h('input', { 'data-testid': 'option-label-input', value: o.label || '',
          onchange: (e) => { o.label = e.target.value; ChatbotBuilderView.renderEditor(); },
          placeholder: 'e.g. Brochure' })),
    ));

    editor.appendChild(h('div', { style: 'margin-top:14px' },
      h('label', {}, 'Option ID (auto-generated slug)'),
      h('input', { value: o.id || '', onchange: (e) => o.id = e.target.value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_'),
        placeholder: 'e.g. brochure' })
    ));

    editor.appendChild(h('div', { style: 'margin-top:14px' },
      h('label', {}, 'When clicked, do this: *'),
      h('select', { 'data-testid': 'option-action-select',
        onchange: (e) => { o.action = e.target.value; ChatbotBuilderView.renderEditor(); } },
        ...ACTION_TYPES.map(t => h('option', { value: t.value,
          selected: o.action === t.value ? 'selected' : null }, t.label)))
    ));

    if (o.action === 'answer') {
      editor.appendChild(h('label', { style: 'margin-top:14px' }, 'Bot Answer *'));
      editor.appendChild(h('textarea', { 'data-testid': 'option-answer-input', style: 'min-height:100px',
        onchange: (e) => o.answer = e.target.value,
        placeholder: 'What the bot replies. You can use plain text or a short paragraph.' }, o.answer || ''));

      // v17 rich answers: an optional image gallery + PDF brochure alongside the reply.
      editor.appendChild(h('label', { style: 'margin-top:14px' }, 'Image gallery (shown above the answer)'));
      if (!Array.isArray(o.answer_images)) o.answer_images = [];
      const gallery = h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px' });
      o.answer_images.forEach((url, gi) => gallery.appendChild(h('div', {
        style: 'position:relative;width:80px;height:80px;border:1px solid var(--border);border-radius:8px;overflow:hidden'
      },
        h('img', { src: url, style: 'width:100%;height:100%;object-fit:cover',
          onerror: (e) => { e.target.style.display = 'none'; } }),
        h('button', { class: 'btn-xs', style: 'position:absolute;top:2px;right:2px;background:rgba(255,255,255,0.9);color:#dc2626',
          onclick: (e) => { e.preventDefault(); o.answer_images.splice(gi, 1); ChatbotBuilderView.renderEditor(); } }, 'x'),
      )));
      editor.appendChild(gallery);
      editor.appendChild(this._renderUploadRow({
        kind: 'answer', accept: 'image/*', current: '',
        testid: 'option-image-upload',
        onChange: (url) => { if (url) { o.answer_images.push(url); ChatbotBuilderView.renderEditor(); } },
      }));

      editor.appendChild(h('label', { style: 'margin-top:14px' }, 'PDF brochure (optional link + preview below the answer)'));
      editor.appendChild(this._renderUploadRow({
        kind: 'brochure', accept: 'application/pdf', current: o.answer_pdf || '',
        testid: 'option-pdf-upload',
        onChange: (url) => { o.answer_pdf = url || ''; ChatbotBuilderView.renderEditor(); },
      }));
      editor.appendChild(h('input', { value: o.answer_pdf_label || '',
        onchange: (e) => o.answer_pdf_label = e.target.value,
        placeholder: 'Button label for the PDF (default: "Download brochure")',
        style: 'margin-top:6px' }));
    }

    if (o.action === 'link') {
      editor.appendChild(h('label', { style: 'margin-top:14px' }, 'URL to open in a new tab *'));
      editor.appendChild(h('input', { 'data-testid': 'option-url-input', value: o.url || '',
        onchange: (e) => o.url = e.target.value,
        placeholder: 'https://maps.google.com/... or /brochure.pdf' }));
      editor.appendChild(h('label', { style: 'margin-top:14px' }, 'Message shown alongside the link (optional)'));
      editor.appendChild(h('input', { value: o.answer || '', onchange: (e) => o.answer = e.target.value,
        placeholder: 'Tap below to view the location on Google Maps.' }));
    }

    if (o.action === 'form') {
      editor.appendChild(h('div', { class: 'grid grid-2', style: 'margin-top:14px' },
        h('div', {},
          h('label', {}, 'Form Title'),
          h('input', { value: o.form_title || '', onchange: (e) => o.form_title = e.target.value,
            placeholder: 'e.g. Get the brochure' })),
        h('div', {},
          h('label', { style: 'display:flex;align-items:center;gap:6px;font-weight:normal;margin-top:24px' },
            h('input', { type: 'checkbox', checked: o.mark_qualified ? 'checked' : null,
              onchange: (e) => o.mark_qualified = e.target.checked }),
            'This form marks the lead as qualified (→ hot priority)')),
      ));

      editor.appendChild(h('label', { style: 'margin-top:14px' }, 'Thank-you message shown after submission'));
      editor.appendChild(h('input', { value: o.thank_you || '', onchange: (e) => o.thank_you = e.target.value,
        placeholder: 'Thanks! Our team will call you shortly.' }));

      editor.appendChild(h('label', { style: 'margin-top:14px' }, 'Form Fields'));
      if (!Array.isArray(o.form_fields)) o.form_fields = [];
      o.form_fields.forEach((f, fi) => {
        editor.appendChild(h('div', { style: 'display:grid;grid-template-columns:1fr 1fr 140px 60px 40px;gap:8px;margin-bottom:6px;align-items:center' },
          h('input', { 'data-testid': 'field-slug-' + fi, value: f.slug || '',
            placeholder: 'slug (e.g. first_name)',
            onchange: (e) => f.slug = e.target.value.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_') }),
          h('input', { 'data-testid': 'field-label-' + fi, value: f.label || '',
            placeholder: 'Label (e.g. Your Name)',
            onchange: (e) => f.label = e.target.value }),
          h('select', { onchange: (e) => f.type = e.target.value },
            ...FIELD_TYPES.map(t => h('option', { value: t.value,
              selected: f.type === t.value ? 'selected' : null }, t.label))),
          h('label', { style: 'display:flex;align-items:center;gap:4px;font-weight:normal;font-size:13px' },
            h('input', { type: 'checkbox', checked: f.required ? 'checked' : null,
              onchange: (e) => f.required = e.target.checked }),
            'Req.'),
          h('button', { class: 'btn-xs', style: 'color:#dc2626',
            onclick: () => { o.form_fields.splice(fi, 1); ChatbotBuilderView.renderEditor(); } }, '×'),
        ));
        if (f.type === 'dropdown') {
          editor.appendChild(h('input', { style: 'margin-bottom:8px', value: (f.options || []).join(', '),
            placeholder: 'Dropdown options, comma-separated',
            onchange: (e) => f.options = e.target.value.split(',').map(s => s.trim()).filter(Boolean) }));
        }
      });
      editor.appendChild(h('button', { class: 'btn-sm btn-secondary', 'data-testid': 'field-add-btn',
        onclick: () => { o.form_fields.push({ slug: '', label: '', type: 'text', required: false }); ChatbotBuilderView.renderEditor(); } }, '+ Add Field'));
    }

    return editor;
  },

  addOption() {
    const bot = this.state.bot;
    const n = bot.menu_options.length + 1;
    bot.menu_options.push({
      id: 'option_' + n, icon: '•', label: 'New Option', action: 'answer', answer: '',
    });
    this.state.selectedOptionIdx = bot.menu_options.length - 1;
    this.renderEditor();
  },

  deleteOption(i) {
    if (!confirm('Delete this option?')) return;
    this.state.bot.menu_options.splice(i, 1);
    if (this.state.selectedOptionIdx >= this.state.bot.menu_options.length) this.state.selectedOptionIdx = Math.max(0, this.state.bot.menu_options.length - 1);
    this.renderEditor();
  },

  moveOption(i, dir) {
    const arr = this.state.bot.menu_options;
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    if (this.state.selectedOptionIdx === i) this.state.selectedOptionIdx = j;
    else if (this.state.selectedOptionIdx === j) this.state.selectedOptionIdx = i;
    this.renderEditor();
  },

  async save() {
    const bot = this.state.bot;
    if (!bot.name || !bot.name.trim()) { toast('Please enter a bot name', 'error'); return; }
    if (!bot.menu_options.length) { toast('Add at least one menu option', 'error'); return; }
    // Ensure every option has an id + label
    const ids = new Set();
    for (const [i, o] of bot.menu_options.entries()) {
      if (!o.label || !o.label.trim()) { toast('Option #' + (i + 1) + ' needs a label', 'error'); return; }
      if (!o.id || !o.id.trim()) o.id = 'option_' + (i + 1);
      if (ids.has(o.id)) { toast('Duplicate option ID: ' + o.id, 'error'); return; }
      ids.add(o.id);
      if (o.action === 'form' && (!o.form_fields || !o.form_fields.length)) {
        toast('Form option "' + o.label + '" needs at least one field', 'error'); return;
      }
      if (o.action === 'link' && !o.url) {
        toast('Link option "' + o.label + '" needs a URL', 'error'); return;
      }
    }

    const payload = {
      name: bot.name, brand_name: bot.brand_name, brand_color: bot.brand_color,
      welcome_message: bot.welcome_message, is_active: bot.is_active,
      escalate_on_qualified: bot.escalate_on_qualified,
      project_id: bot.project_id,
      logo_url: bot.logo_url || null,
      menu_options: bot.menu_options,
    };

    try {
      const saved = this.state.editing
        ? await Api.put('/api/v1/chatbots/' + this.state.editing, payload)
        : await Api.post('/api/v1/chatbots', payload);
      toast('Chatbot saved');
      this.showEmbed(saved);
    } catch (e) { toast(e.message, 'error'); }
  },

  showEmbed(bot) {
    const origin = location.origin;
    const v = Date.now();
    const snippet = '<script src="' + origin + '/assets/js/chatbot-embed.js?v=' + v + '"\n'
      + '        data-slug="' + bot.slug + '"\n'
      + '        data-api="' + origin + '" async></' + 'script>';
    const copyToClipboard = (text) => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          return navigator.clipboard.writeText(text).then(() => true).catch(() => legacyCopy(text));
        }
        return Promise.resolve(legacyCopy(text));
      } catch (_) { return Promise.resolve(legacyCopy(text)); }
    };
    const legacyCopy = (text) => {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.left = '-9999px';
      document.body.appendChild(ta); ta.select();
      let ok = false; try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove(); return ok;
    };

    Modal.open('Chatbot Embed Snippet',
      h('div', {},
        h('div', { style: 'background:#dbeafe;padding:12px;border-radius:6px;margin-bottom:14px;color:#1e3a8a' },
          'Paste this snippet into your website (just before </body>). Every form submission creates a lead with round-robin BDE assignment + welcome email + drip.'),
        h('pre', { 'data-testid': 'chatbot-embed-snippet', style: 'background:#0f172a;color:#e2e8f0;padding:14px;border-radius:6px;overflow-x:auto;font-size:12px;white-space:pre-wrap;word-break:break-all' }, snippet),
        h('div', { class: 'muted text-sm', style: 'margin-top:10px' },
          'Slug: ', h('code', {}, bot.slug), ' · Config URL: ',
          h('code', {}, origin + CRM.API + '/public/chatbots/' + bot.slug + '/config'))
      ),
      h('div', { class: 'flex gap-8' },
        h('button', { class: 'btn-secondary', type: 'button',
          onclick: (e) => { e.preventDefault(); Modal.close(); ChatbotBuilderView.render(); } }, 'Close'),
        h('button', { class: 'btn-primary', 'data-testid': 'chatbot-copy-close-btn', type: 'button',
          onclick: async (e) => { e.preventDefault();
            const ok = await copyToClipboard(snippet);
            toast(ok ? 'Copied to clipboard' : 'Copy failed — select the code manually', ok ? 'success' : 'error');
            Modal.close(); ChatbotBuilderView.render();
          } }, 'Copy & Close')
      )
    );
  },

  /* ---------- Preview (in-CRM) ---------- */
  openPreview(bot) {
    // Renders a mini-widget in a modal using the same DOM/CSS structure as the real embed.
    this._openWidgetPreview(bot.slug);
  },

  previewDraft() {
    // Client-side preview of the DRAFT (unsaved) config — uses local menu_options.
    const bot = this.state.bot;
    this._openStaticPreview(bot);
  },

  _openStaticPreview(bot) {
    const body = this._renderWidget({
      brand_name: bot.brand_name, brand_color: bot.brand_color, logo_url: bot.logo_url,
      welcome: bot.welcome_message,
      menu: (bot.menu_options || []).map(o => ({ id: o.id, icon: o.icon, label: o.label, action: o.action })),
      onClick: (id) => {
        const opt = bot.menu_options.find(o => o.id === id);
        if (!opt) return null;
        if (opt.action === 'answer') return Promise.resolve({ action: 'answer', text: opt.answer, image: opt.answer_image, back_to_menu: true });
        if (opt.action === 'link') { window.open(opt.url, '_blank'); return Promise.resolve({ action: 'link', text: opt.answer || 'Opened in a new tab.', back_to_menu: true }); }
        return Promise.resolve({ action: 'form', option_id: opt.id, title: opt.form_title || opt.label, fields: opt.form_fields || [] });
      },
      onSubmitForm: (id, values) => {
        const opt = bot.menu_options.find(o => o.id === id);
        return Promise.resolve({ action: 'thank_you', text: opt?.thank_you || 'Thanks!', back_to_menu: true });
      },
    });
    Modal.open('Preview (draft)', body, h('button', { class: 'btn-primary', onclick: () => Modal.close() }, 'Close'));
  },

  async _openWidgetPreview(slug) {
    try {
      const cfg = await fetch(CRM.API + '/public/chatbots/' + slug + '/config').then(r => r.json());
      const start = await fetch(CRM.API + '/public/chatbots/' + slug + '/session', { method: 'POST' }).then(r => r.json());
      const body = this._renderWidget({
        brand_name: cfg.chatbot.brand_name, brand_color: cfg.chatbot.brand_color, logo_url: cfg.chatbot.logo_url,
        welcome: cfg.chatbot.welcome_message,
        menu: cfg.menu || [],
        onClick: (id) => fetch(CRM.API + '/public/chatbots/' + slug + '/session/' + start.session_uuid + '/action',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ option_id: id }) }).then(r => r.json()),
        onSubmitForm: (id, values) => fetch(CRM.API + '/public/chatbots/' + slug + '/session/' + start.session_uuid + '/form',
          { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ option_id: id, values }) }).then(r => r.json()),
      });
      Modal.open('Live Test: ' + (cfg.chatbot.brand_name || 'Chatbot'), body, h('button', { class: 'btn-primary', onclick: () => Modal.close() }, 'Close'));
    } catch (e) { toast(e.message || 'Preview failed', 'error'); }
  },

  // Renders the widget UI (header + welcome bubble + menu grid + result area).
  _renderWidget(cfg) {
    const color = cfg.brand_color || '#0f3d33';
    const wrap = h('div', { style: 'max-width:520px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.08);border:1px solid #e5e7eb' });
    // Header (logo if provided, else brand initial)
    const avatarInner = cfg.logo_url
      ? h('img', { src: cfg.logo_url, alt: cfg.brand_name || '',
          style: 'width:100%;height:100%;object-fit:cover;border-radius:50%',
          onerror: (e) => { e.target.replaceWith(document.createTextNode((cfg.brand_name || 'A').charAt(0).toUpperCase())); } })
      : document.createTextNode((cfg.brand_name || 'A').charAt(0).toUpperCase());
    wrap.appendChild(h('div', { style: 'background:' + color + ';color:#fff;padding:14px 20px;display:flex;align-items:center;gap:10px' },
      h('div', { style: 'width:36px;height:36px;background:#fff;border-radius:50%;display:grid;place-items:center;font-weight:700;color:' + color + ';overflow:hidden' }, avatarInner),
      h('div', { style: 'font-weight:600;font-size:16px' }, cfg.brand_name || 'Chat'),
    ));
    // Body
    const body = h('div', { style: 'padding:16px;background:#fafaf7;max-height:520px;overflow-y:auto' });
    const welcomeBubble = h('div', { style: 'background:#fff;border-radius:14px;padding:14px 16px;box-shadow:0 1px 2px rgba(0,0,0,0.04);margin-bottom:12px;color:#0a2540;font-size:14px;line-height:1.5' }, cfg.welcome || '');
    body.appendChild(welcomeBubble);

    const menu = h('div', { style: 'display:flex;flex-wrap:wrap;gap:8px' });
    (cfg.menu || []).forEach(o => menu.appendChild(h('button', {
      style: 'padding:10px 16px;border:1px solid ' + color + ';background:#fff;color:' + color + ';border-radius:22px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px',
      onclick: async () => {
        const res = await cfg.onClick(o.id);
        if (!res) return;
        this._renderResult(body, res, cfg, menu);
      }
    }, h('span', {}, o.icon || ''), h('span', {}, o.label))));
    body.appendChild(menu);

    wrap.appendChild(body);
    return wrap;
  },

  _renderResult(body, res, cfg, menuEl) {
    // If back_to_menu is false or absent (form step), replace menu with the form.
    if (res.action === 'form') {
      menuEl.remove();
      const form = h('div', { style: 'background:#fff;border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(0,0,0,0.04);margin-top:8px' });
      form.appendChild(h('div', { style: 'font-weight:600;margin-bottom:12px;color:' + (cfg.brand_color || '#0f3d33') }, res.title || 'Please fill in your details'));
      const inputs = {};
      (res.fields || []).forEach(f => {
        form.appendChild(h('label', { style: 'font-size:12px;color:#6b7280;display:block;margin-bottom:4px' }, f.label + (f.required ? ' *' : '')));
        let el;
        if (f.type === 'textarea') el = h('textarea', { style: 'width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;margin-bottom:10px;min-height:60px' });
        else if (f.type === 'dropdown') el = h('select', { style: 'width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;margin-bottom:10px' },
          h('option', { value: '' }, 'Select…'),
          ...(f.options || []).map(op => h('option', { value: op }, op)));
        else el = h('input', {
          type: f.type === 'email' ? 'email' : (f.type === 'phone' ? 'tel' : (f.type === 'number' ? 'number' : 'text')),
          inputmode: f.type === 'phone' ? 'tel' : (f.type === 'email' ? 'email' : (f.type === 'number' ? 'numeric' : 'text')),
          autocomplete: f.type === 'email' ? 'email' : (f.type === 'phone' ? 'tel' : (f.type === 'name' ? 'name' : 'off')),
          style: 'width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:8px;font-size:13px;margin-bottom:10px'
        });
        inputs[f.slug] = el;
        form.appendChild(el);
      });
      form.appendChild(h('button', {
        style: 'width:100%;padding:10px;background:' + (cfg.brand_color || '#0f3d33') + ';color:#fff;border:none;border-radius:22px;font-weight:600;cursor:pointer',
        onclick: async () => {
          const values = {};
          for (const f of (res.fields || [])) {
            const v = String(inputs[f.slug].value || '').trim();
            values[f.slug] = v;
            const err = ChatbotBuilderView._validateField(f, v);
            if (err) { toast(err, 'error'); inputs[f.slug].focus(); return; }
          }
          try {
            const r = await cfg.onSubmitForm(res.option_id, values);
            if (r && r.errors) { toast(r.errors[Object.keys(r.errors)[0]] || 'Please check the form', 'error'); return; }
            form.remove();
            this._renderResult(body, r, cfg, null);
          } catch (e) { toast(e.message || 'Submission failed', 'error'); }
        }
      }, res.submit_label || 'Submit'));
      form.appendChild(h('button', {
        style: 'width:100%;padding:8px;background:transparent;border:none;color:#6b7280;font-size:12px;cursor:pointer;margin-top:8px',
        onclick: () => { form.remove(); if (menuEl) { body.appendChild(menuEl); body.scrollTop = 99999; } }
      }, '← Back to menu'));
      body.appendChild(form);
      body.scrollTop = 99999;
      return;
    }

    // answer / link / thank_you -> append a bot bubble
    // v17 rich answers: image gallery grid + optional PDF link.
    if (Array.isArray(res.images) && res.images.length) {
      const gal = h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(90px,1fr));gap:6px;margin-bottom:8px' });
      res.images.forEach(u => gal.appendChild(h('a', { href: u, target: '_blank', rel: 'noopener' },
        h('img', { src: u, style: 'width:100%;aspect-ratio:1/1;object-fit:cover;border-radius:8px;cursor:zoom-in' }))));
      body.appendChild(gal);
    }
    if (res.image) body.appendChild(h('img', { src: res.image, style: 'max-width:100%;border-radius:10px;margin-bottom:8px' }));
    if (res.action === 'link' && res.url) {
      body.appendChild(h('a', { href: res.url, target: '_blank', rel: 'noopener',
        style: 'display:block;background:#fff;padding:10px 14px;border-radius:14px;color:' + (cfg.brand_color || '#0f3d33') + ';margin-bottom:8px;text-decoration:none;font-weight:600;border:1px solid ' + (cfg.brand_color || '#0f3d33') }, '^ Open link') );
    }
    if (res.text) body.appendChild(h('div', { style: 'background:#fff;border-radius:14px;padding:12px 14px;margin-bottom:8px;color:#0a2540;font-size:14px;line-height:1.5' }, res.text));
    if (res.pdf) {
      body.appendChild(h('a', { href: res.pdf, target: '_blank', rel: 'noopener',
        style: 'display:inline-flex;align-items:center;gap:6px;background:#fef3c7;padding:8px 14px;border-radius:12px;color:#92400e;margin-bottom:8px;text-decoration:none;font-weight:600;font-size:13px;border:1px solid #fcd34d' },
        h('span', {}, 'PDF'), h('span', {}, res.pdf_label || 'Download brochure')));
    }

    // Show a "Back to menu" pill
    if (res.back_to_menu !== false) {
      const backBtn = h('button', {
        style: 'padding:6px 14px;border:1px solid ' + (cfg.brand_color || '#0f3d33') + ';background:#fff;color:' + (cfg.brand_color || '#0f3d33') + ';border-radius:16px;font-size:12px;cursor:pointer;margin-top:4px',
        onclick: () => { backBtn.remove(); if (menuEl && !menuEl.isConnected) body.appendChild(menuEl); body.scrollTop = 99999; }
      }, '← Show menu');
      body.appendChild(backBtn);
    }
    body.scrollTop = 99999;
  },
};
window.ChatbotBuilderView = ChatbotBuilderView;

