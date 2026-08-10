/* forms-ui.js — Form Builder + CSV Import admin pages */
/* global Api, h, fmtDate, toast, Modal, setTitle, setTopbarActions, Router */

const SOURCE_OPTIONS = [
  { value: 'manual',           label: 'Manual',
    sub: ['Walk-in', 'Word of Mouth', 'Other'] },
  { value: 'offline_channels', label: 'Offline Channels',
    sub: ['Newspaper', 'Hoarding / Billboard', 'Event / Expo', 'Tele-marketing', 'Print Ad', 'Other'] },
  { value: 'digital',          label: 'Digital',
    sub: ['Website', 'Facebook Ads', 'Instagram', 'Google Ads', 'YouTube', 'LinkedIn', 'Email Campaign', 'Other'] },
  { value: 'referrals',        label: 'Referrals',
    sub: ['Customer Referral', 'Channel Partner', 'Broker', 'Employee', 'Other'] },
  { value: 'others',           label: 'Others',
    sub: ['Inbound Call', 'Reception', 'Hot Lead', 'Other'] },
  { value: 'bulk_upload',      label: 'Bulk Upload',
    sub: ['CSV Import', 'Excel Import', 'API Sync', 'Other'] },
];

const FIELD_PALETTE = [
  { type: 'name',          label: 'Name (letters only)' },
  { type: 'text',          label: 'Text' },
  { type: 'number',        label: 'Number' },
  { type: 'email',         label: 'Email' },
  { type: 'phone',         label: 'Mobile Number' },
  { type: 'date',          label: 'Date' },
  { type: 'textarea',      label: 'Text Area' },
  { type: 'radio',         label: 'Radio Group' },
  { type: 'checkbox',      label: 'Checkbox' },
  { type: 'checkbox_group',label: 'Checkbox Group' },
  { type: 'dropdown',      label: 'Drop down' },
  { type: 'multiselect',   label: 'Drop down (Multi Select)' },
];

const MAP_TO_OPTIONS = [
  { value: '',          label: '— Not mapped —' },
  { value: 'first_name',label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email',     label: 'Email' },
  { value: 'phone',     label: 'Phone' },
  { value: 'city',      label: 'City' },
  { value: 'budget_min',label: 'Budget Min' },
  { value: 'budget_max',label: 'Budget Max' },
  { value: 'configuration', label: 'Configuration' },
  { value: 'notes',     label: 'Notes' },
];

const DEFAULT_FIELDS = () => [
  { slug: 'first_name', label: 'First Name',    type: 'name',  is_required: true,  maps_to_field: 'first_name', placeholder: 'Enter first name' },
  { slug: 'last_name',  label: 'Last Name',     type: 'name',  is_required: false, maps_to_field: 'last_name',  placeholder: 'Enter last name' },
  { slug: 'email',      label: 'Email',         type: 'email', is_required: true,  maps_to_field: 'email',      placeholder: 'Enter email' },
  { slug: 'phone',      label: 'Mobile Number', type: 'phone', is_required: true,  maps_to_field: 'phone',      placeholder: '+91 ...' },
];

const FormBuilderView = {
  state: {
    step: 1,
    editing: null,
    form: {
      name: '', description: '', source: 'manual', sub_source: 'Walk-in',
      project_id: null, redirect_url: '', thank_you_msg: '',
      styles: {
        form_font_color: '#000000', header_font_color: '#ffffff',
        sub_header_font_color: '#ffffff',
        form_header_font_size: '16', form_subheader_font_size: '12',
        form_text_font_size: '10',
      },
      button_config: {
        label: 'Submit', size: '24', bg_color: '#000000', text_color: '#ffffff',
        redirection: 'new_page', redirect_url: '',
      },
      fields: DEFAULT_FIELDS(),
      is_active: true,
    },
    selectedFieldIdx: 3, // Mobile Number selected by default
  },

  async render() {
    setTitle('Form Builder');
    const page = document.getElementById('page');
    page.innerHTML = '<div class="spinner"></div>';

    let data, projects;
    try {
      [data, projects] = await Promise.all([
        Api.get('/api/v1/forms'),
        Api.get('/api/v1/projects')
      ]);
    } catch (e) {
      page.innerHTML = '<div class="empty">Admin access required.</div>'; return;
    }
    this._projects = projects.items || projects.data || [];

    setTopbarActions(h('button', { class: 'btn-primary', onclick: () => FormBuilderView.startNew() }, '+ New Form'));
    page.innerHTML = '';

    if (!data.items.length) {
      page.appendChild(h('div', { class: 'card' }, h('div', { class: 'card-body' },
        h('div', { class: 'empty' }, 'No forms yet. Click "+ New Form" — submissions become leads automatically.')
      )));
      return;
    }

    page.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-body' },
        h('table', { class: 'table' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Name'), h('th', {}, 'Source'), h('th', {}, 'Sub Source'), h('th', {}, 'Fields'),
            h('th', {}, 'Submissions'), h('th', {}, 'Status'), h('th', {}, 'Actions')
          )),
          h('tbody', {}, ...data.items.map(f => h('tr', {},
            h('td', {}, f.name),
            h('td', {}, f.settings?.source || 'manual'),
            h('td', {}, f.settings?.sub_source || '—'),
            h('td', {}, String((f.fields || []).length)),
            h('td', {}, String(f.submission_count || 0)),
            h('td', {}, h('span', { class: 'badge badge-' + (f.is_active ? 'won' : 'lost') }, f.is_active ? 'active' : 'inactive')),
            h('td', { style: 'display:flex;gap:6px' },
              h('button', { class: 'btn-sm btn-secondary', onclick: () => FormBuilderView.showEmbed(f) }, 'Embed'),
              h('button', { class: 'btn-sm btn-secondary', onclick: () => FormBuilderView.edit(f) }, 'Edit'),
              h('button', { class: 'btn-sm btn-secondary', style: 'color:#dc2626;border-color:#fecaca',
                onclick: async () => {
                  if (!confirm('Delete this form? Embed code on websites will stop working.')) return;
                  try { await Api.delete('/api/v1/forms/' + f.id); toast('Form deleted'); FormBuilderView.render(); }
                  catch (e) { toast(e.message, 'error'); }
                } }, 'Delete')
            )
          )))
        )
      )
    ));
  },

  startNew() {
    this.state.step = 1;
    this.state.editing = null;
    this.state.form = {
      name: '', description: '', source: 'manual', sub_source: 'Walk-in',
      project_id: null, redirect_url: '', thank_you_msg: '',
      styles: { form_font_color: '#000000', header_font_color: '#ffffff', sub_header_font_color: '#ffffff',
        form_header_font_size: '16', form_subheader_font_size: '12', form_text_font_size: '10' },
      button_config: { label: 'Submit', size: '24', bg_color: '#000000', text_color: '#ffffff',
        redirection: 'new_page', redirect_url: '' },
      fields: DEFAULT_FIELDS(), is_active: true,
    };
    this.state.selectedFieldIdx = 3;
    this.renderWizard();
  },

  edit(form) {
    this.state.step = 1;
    this.state.editing = form.id;
    this.state.form = {
      name:         form.name,
      description:  form.settings?.description || '',
      source:       form.settings?.source || 'manual',
      sub_source:   form.settings?.sub_source || 'Walk-in',
      project_id:   form.project_id,
      redirect_url: form.redirect_url || '',
      thank_you_msg:form.settings?.thank_you_msg || '',
      styles:       form.settings?.styles || {
        form_font_color: '#000000', header_font_color: '#ffffff', sub_header_font_color: '#ffffff',
        form_header_font_size: '16', form_subheader_font_size: '12', form_text_font_size: '10' },
      button_config:form.settings?.button_config || {
        label: 'Submit', size: '24', bg_color: '#000000', text_color: '#ffffff',
        redirection: 'new_page', redirect_url: '' },
      fields:       (form.fields || DEFAULT_FIELDS()).map(f => ({ ...f })),
      is_active:    form.is_active,
    };
    this.state.selectedFieldIdx = 0;
    this.renderWizard();
  },

  renderWizard() {
    setTitle(this.state.editing ? 'Edit Form' : 'New Form');
    setTopbarActions();
    const page = document.getElementById('page');
    page.innerHTML = '';

    // ===== Stepper =====
    page.appendChild(this.stepperBar());

    // ===== Action bar (Back / Save) =====
    page.appendChild(h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:18px' },
      h('button', { class: 'btn-secondary btn-sm', onclick: () => FormBuilderView.render() }, '‹ Back to list'),
      h('div', { style: 'display:flex;gap:10px' },
        this.state.step === 2 ? h('button', { class: 'btn-secondary',
          onclick: () => { this.state.step = 1; this.renderWizard(); } }, 'Discard Changes') : null,
        this.state.step === 1
          ? h('button', { class: 'btn-primary', onclick: () => FormBuilderView.goStep2() }, 'Next →')
          : h('button', { class: 'btn-primary', onclick: () => FormBuilderView.save() }, 'Save Changes')
      )
    ));

    if (this.state.step === 1) page.appendChild(this.step1());
    else                       page.appendChild(this.step2());
  },

  stepperBar() {
    const step = this.state.step;
    const dot = (n, active, done, label) => h('div', { style: 'display:flex;align-items:center;gap:8px' },
      h('div', { style: `width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        background:${done ? '#16a34a' : active ? 'var(--primary)' : 'var(--border)'};color:#fff;font-size:13px;font-weight:600` }, done ? '✓' : String(n)),
      h('span', { style: 'font-weight:' + (active ? '600' : '400') + ';color:' + (active || done ? 'var(--text)' : 'var(--text-muted)') }, label)
    );
    return h('div', { style: 'display:flex;justify-content:center;align-items:center;gap:14px;padding:18px;margin-bottom:18px;background:var(--surface);border-radius:var(--radius);border:1px solid var(--border)' },
      dot(1, step === 1, step > 1, 'Form Details'),
      h('div', { style: 'width:90px;height:2px;background:var(--border)' }),
      dot(2, step === 2, false, 'Form Configuration'),
    );
  },

  // ===== STEP 1 — Form Details =====
  step1() {
    const f = this.state.form;
    const card = h('div', { class: 'card mb-16' },
      h('div', { class: 'card-header' }, h('div', { class: 'card-title' }, 'Enter Form Details')),
      h('div', { class: 'card-body' })
    );
    const body = card.lastChild;

    // Form name
    body.appendChild(h('label', {}, 'Form Name *'));
    const nameInp = h('input', { value: f.name, onchange: (e) => f.name = e.target.value, placeholder: 'Lead Capture Form' });
    body.appendChild(nameInp);

    // Description
    body.appendChild(h('label', { style: 'margin-top:14px' }, 'Form Description *'));
    const descInp = h('textarea', { onchange: (e) => f.description = e.target.value, placeholder: 'Short description' }, f.description);
    body.appendChild(descInp);

    // Source / Sub Source row
    body.appendChild(h('div', { class: 'grid grid-2', style: 'margin-top:14px' },
      h('div', {},
        h('label', {}, 'Select Source *'),
        h('select', {
          onchange: (e) => {
            f.source = e.target.value;
            const opt = SOURCE_OPTIONS.find(s => s.value === e.target.value);
            f.sub_source = opt?.sub[0] || '';
            this.renderWizard();
          }
        }, ...SOURCE_OPTIONS.map(s => h('option', { value: s.value, selected: f.source === s.value ? 'selected' : null }, s.label)))
      ),
      h('div', {},
        h('label', {}, 'Select Sub Source *'),
        h('select', { onchange: (e) => f.sub_source = e.target.value },
          ...(SOURCE_OPTIONS.find(s => s.value === f.source)?.sub || []).map(sub =>
            h('option', { value: sub, selected: f.sub_source === sub ? 'selected' : null }, sub))
        )
      )
    ));

    // Project (optional)
    body.appendChild(h('div', { style: 'margin-top:14px' },
      h('label', {}, 'Project (optional)'),
      h('select', { onchange: (e) => f.project_id = e.target.value ? parseInt(e.target.value) : null },
        h('option', { value: '' }, '— No specific project —'),
        ...this._projects.map(p => h('option', { value: p.id, selected: f.project_id == p.id ? 'selected' : null }, p.name))
      )
    ));

    // ===== Styling =====
    const styleCard = h('div', { class: 'card mb-16' },
      h('div', { class: 'card-header' }, h('div', { class: 'card-title' }, 'Form Styling')),
      h('div', { class: 'card-body' },
        h('div', { class: 'grid grid-2' },
          this.colorRow('Form Font Color',     f.styles, 'form_font_color'),
          this.colorRow('Header Font Color',   f.styles, 'header_font_color'),
          this.colorRow('Sub Header Font Color', f.styles, 'sub_header_font_color'),
          this.sizeRow('Form Header Font Size',  f.styles, 'form_header_font_size'),
          this.sizeRow('Form Subheader Font Size', f.styles, 'form_subheader_font_size'),
          this.sizeRow('Form Text Font Size',    f.styles, 'form_text_font_size'),
        )
      )
    );

    // ===== Submission Button Config =====
    const btnCard = h('div', { class: 'card mb-16' },
      h('div', { class: 'card-header' }, h('div', { class: 'card-title' }, 'Submission Button Configuration')),
      h('div', { class: 'card-body' },
        h('div', { class: 'grid grid-2' },
          h('div', {},
            h('label', {}, 'Button Label'),
            h('input', { value: f.button_config.label, onchange: (e) => f.button_config.label = e.target.value })),
          this.sizeRow('Button Size', f.button_config, 'size'),
          this.colorRow('Button Background Color', f.button_config, 'bg_color'),
          this.colorRow('Button Text Color',       f.button_config, 'text_color'),
        ),
        h('label', { style: 'margin-top:14px' }, 'Button Redirection *'),
        h('div', { style: 'display:flex;gap:18px;align-items:center;margin-bottom:10px' },
          this.radioOpt('redirection', 'new_page', 'New Page', f.button_config),
          this.radioOpt('redirection', 'thank_you', 'Thank You Page', f.button_config),
        ),
        h('label', {}, 'Enter URL'),
        h('input', {
          value: f.button_config.redirect_url || '',
          onchange: (e) => f.button_config.redirect_url = e.target.value,
          placeholder: 'https://example.com/thank-you'
        }),
        h('label', { style: 'margin-top:14px' }, 'Thank-you message (shown inline if "Thank You Page" selected)'),
        h('input', { value: f.thank_you_msg, onchange: (e) => f.thank_you_msg = e.target.value, placeholder: 'Thank you! We will get back to you.' })
      )
    );

    const wrap = h('div', {});
    wrap.appendChild(card);
    wrap.appendChild(styleCard);
    wrap.appendChild(btnCard);
    return wrap;
  },

  colorRow(label, obj, key) {
    return h('div', {},
      h('label', {}, label),
      h('div', { style: 'display:flex;gap:8px;align-items:center' },
        h('input', { value: obj[key], onchange: (e) => obj[key] = e.target.value, style: 'flex:1' }),
        h('input', { type: 'color', value: obj[key], onchange: (e) => { obj[key] = e.target.value; this.renderWizard(); },
          style: 'width:42px;height:38px;border:1px solid var(--border);border-radius:6px;cursor:pointer;padding:2px' })
      )
    );
  },
  sizeRow(label, obj, key) {
    return h('div', {},
      h('label', {}, label),
      h('select', { onchange: (e) => obj[key] = e.target.value },
        ...['8','10','12','14','16','18','20','24','28','32','36','48'].map(v =>
          h('option', { value: v, selected: obj[key] === v ? 'selected' : null }, v + ' PX'))
      )
    );
  },
  radioOpt(group, val, label, obj) {
    const id = group + '_' + val;
    return h('label', { style: 'display:flex;align-items:center;gap:6px;margin:0;cursor:pointer' },
      h('input', { type: 'radio', name: group, id, value: val, checked: obj[group] === val ? 'checked' : null,
        onchange: (e) => { if (e.target.checked) obj[group] = val; } }),
      h('span', {}, label)
    );
  },

  // ===== STEP 2 — Form Configuration (3-col drag-and-drop) =====
  step2() {
    const wrap = h('div', { style: 'display:grid;grid-template-columns:240px 1fr 280px;gap:14px;min-height:600px' });
    wrap.appendChild(this.paletteCol());
    wrap.appendChild(this.previewCol());
    wrap.appendChild(this.settingsCol());
    return wrap;
  },

  paletteCol() {
    const col = h('div', { class: 'card' },
      h('div', { class: 'card-body' },
        h('h4', { style: 'margin-bottom:6px' }, 'Fields'),
        h('div', { class: 'muted text-sm', style: 'margin-bottom:14px' }, 'Click a type to add it to the form.'),
        ...FIELD_PALETTE.map(f => h('button', {
          class: 'btn-secondary', style: 'width:100%;margin-bottom:6px;justify-content:flex-start;text-align:center;padding:10px',
          onclick: () => {
            const newField = {
              slug: f.type + '_' + (this.state.form.fields.length + 1),
              label: f.label, type: f.type, is_required: false,
              maps_to_field: '', placeholder: 'Enter ' + f.label.toLowerCase(),
              options: ['radio','checkbox_group','dropdown','multiselect'].includes(f.type) ? ['Option 1', 'Option 2'] : null,
            };
            this.state.form.fields.push(newField);
            this.state.selectedFieldIdx = this.state.form.fields.length - 1;
            this.renderWizard();
          }
        }, f.label))
      )
    );
    return col;
  },

  previewCol() {
    const col = h('div', { class: 'card' },
      h('div', { class: 'card-body' },
        h('h4', { style: 'margin-bottom:14px' }, this.state.form.name || 'Lead Capture Form'),
      )
    );
    const body = col.lastChild;
    this.state.form.fields.forEach((f, i) => body.appendChild(this.previewField(f, i)));
    if (!this.state.form.fields.length) body.appendChild(h('div', { class: 'empty', style: 'padding:40px' }, 'Click a field type on the left to add it.'));
    return col;
  },

  previewField(f, i) {
    const isSel = this.state.selectedFieldIdx === i;
    const wrap = h('div', {
      style: 'border:1px solid ' + (isSel ? 'var(--primary)' : 'var(--border)') + ';' +
             (isSel ? 'background:var(--primary-soft);' : '') +
             'padding:12px;border-radius:8px;margin-bottom:10px;cursor:pointer;position:relative',
      onclick: (e) => { e.stopPropagation(); this.state.selectedFieldIdx = i; this.renderWizard(); },
      draggable: 'true',
      'data-idx': i,
    },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:center;margin-bottom:6px' },
        h('div', { style: 'display:flex;align-items:center;gap:6px' },
          h('span', { style: 'color:#9ca3af;font-size:14px;cursor:grab' }, '⋮⋮'),
          h('span', { style: 'font-size:13px;font-weight:500' }, f.label, f.is_required ? h('span', { style: 'color:#dc2626' }, ' *') : null)
        ),
        h('div', { style: 'display:flex;gap:4px' },
          h('button', { class: 'btn-sm', style: 'background:transparent;border:0;color:#0b5fff;cursor:pointer;font-size:14px', title: 'Duplicate this field',
            'data-testid': 'field-duplicate-' + i,
            onclick: (e) => { e.stopPropagation();
              const src = this.state.form.fields[i];
              // Deep clone + append `_copy` to the slug (and `_copy_2`, `_copy_3` if collisions).
              const clone = JSON.parse(JSON.stringify(src));
              const base  = (clone.slug || 'field') + '_copy';
              const taken = new Set(this.state.form.fields.map(f => f.slug));
              let slug = base, n = 2;
              while (taken.has(slug)) { slug = base + '_' + n; n++; }
              clone.slug = slug;
              clone.label = (clone.label || 'Field') + ' (copy)';
              this.state.form.fields.splice(i + 1, 0, clone);
              this.state.selectedFieldIdx = i + 1;
              this.renderWizard();
            } }, 'Copy'),
          h('button', { class: 'btn-sm', style: 'background:transparent;border:0;color:#dc2626;cursor:pointer;font-size:16px',
            onclick: (e) => { e.stopPropagation();
              this.state.form.fields.splice(i, 1);
              if (this.state.selectedFieldIdx >= this.state.form.fields.length) this.state.selectedFieldIdx = this.state.form.fields.length - 1;
              this.renderWizard(); } }, '\u00D7')
        )
      ),
      this.previewInput(f)
    );
    // Drag reorder
    wrap.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/idx', String(i)); wrap.style.opacity = '0.5'; });
    wrap.addEventListener('dragend',   () => wrap.style.opacity = '1');
    wrap.addEventListener('dragover',  (e) => { e.preventDefault(); wrap.style.borderTop = '2px solid var(--primary)'; });
    wrap.addEventListener('dragleave', () => wrap.style.borderTop = '');
    wrap.addEventListener('drop',      (e) => {
      e.preventDefault(); wrap.style.borderTop = '';
      const from = parseInt(e.dataTransfer.getData('text/idx'));
      if (from === i) return;
      const arr = this.state.form.fields;
      const [moved] = arr.splice(from, 1); arr.splice(i, 0, moved);
      this.state.selectedFieldIdx = i; this.renderWizard();
    });
    return wrap;
  },

  previewInput(f) {
    switch (f.type) {
      case 'textarea': return h('textarea', { placeholder: f.placeholder || '', disabled: 'disabled' });
      case 'dropdown':
      case 'multiselect': return h('select', { disabled: 'disabled' },
        h('option', {}, f.placeholder || 'Select...'),
        ...(f.options || []).map(o => h('option', {}, o)));
      case 'checkbox': return h('label', { style: 'display:flex;align-items:center;gap:8px;font-size:14px;margin:0' },
        h('input', { type: 'checkbox', disabled: 'disabled' }), h('span', {}, f.placeholder || f.label));
      case 'checkbox_group':
      case 'radio':
        return h('div', { style: 'display:flex;flex-direction:column;gap:6px' },
          ...(f.options || []).map(o => h('label', { style: 'display:flex;align-items:center;gap:6px;margin:0;font-size:13px' },
            h('input', { type: f.type === 'radio' ? 'radio' : 'checkbox', disabled: 'disabled', name: f.slug }),
            h('span', {}, o))));
      case 'phone': return h('div', { style: 'display:flex;gap:6px' },
        h('div', { style: 'padding:9px 10px;border:1px solid var(--border);border-radius:6px;font-size:13px;background:var(--bg)' }, '🇮🇳 +91'),
        h('input', { placeholder: f.placeholder || '', disabled: 'disabled', style: 'flex:1' }));
      case 'date':   return h('input', { type: 'date',   disabled: 'disabled' });
      case 'number': return h('input', { type: 'number', placeholder: f.placeholder || '', disabled: 'disabled' });
      case 'email':  return h('input', { type: 'email',  placeholder: f.placeholder || '', disabled: 'disabled' });
      default:       return h('input', { type: 'text',   placeholder: f.placeholder || '', disabled: 'disabled' });
    }
  },

  settingsCol() {
    const col = h('div', { class: 'card' },
      h('div', { class: 'card-body' })
    );
    const body = col.lastChild;
    const i = this.state.selectedFieldIdx;
    if (i < 0 || i >= this.state.form.fields.length) {
      body.appendChild(h('div', { class: 'empty' }, 'Select a field to edit its settings'));
      return col;
    }
    const f = this.state.form.fields[i];

    body.appendChild(h('h4', { style: 'margin-bottom:14px' }, 'Field Settings'));

    // Required toggle
    body.appendChild(h('label', { style: 'display:flex;align-items:center;gap:8px;margin-bottom:14px;cursor:pointer' },
      h('input', { type: 'checkbox', checked: f.is_required ? 'checked' : null,
        onchange: (e) => { f.is_required = e.target.checked; this.renderWizard(); } }),
      h('div', {}, h('div', { style: 'font-weight:500' }, 'Required field'),
        h('div', { class: 'muted text-sm' }, 'User must fill this before submitting.'))
    ));

    body.appendChild(h('label', {}, 'Label Name *'));
    body.appendChild(h('input', { value: f.label, onchange: (e) => { f.label = e.target.value; this.renderWizard(); } }));

    body.appendChild(h('label', { style: 'margin-top:14px' }, 'Placeholder'));
    body.appendChild(h('input', { value: f.placeholder || '', onchange: (e) => { f.placeholder = e.target.value; this.renderWizard(); } }));

    body.appendChild(h('label', { style: 'margin-top:14px' }, 'Map to CRM field'));
    body.appendChild(h('select', { onchange: (e) => f.maps_to_field = e.target.value },
      ...MAP_TO_OPTIONS.map(o => h('option', { value: o.value, selected: (f.maps_to_field || '') === o.value ? 'selected' : null }, o.label))
    ));

    if (['radio','checkbox_group','dropdown','multiselect'].includes(f.type)) {
      body.appendChild(h('label', { style: 'margin-top:14px' }, 'Options (one per line)'));
      const ta = h('textarea', { style: 'min-height:90px', onchange: (e) =>
        f.options = e.target.value.split('\n').map(s => s.trim()).filter(Boolean) }, (f.options || []).join('\n'));
      body.appendChild(ta);
    }

    return col;
  },

  goStep2() {
    const f = this.state.form;
    if (!f.name.trim()) { toast('Form name is required', 'error'); return; }
    if (!f.description.trim()) { toast('Form description is required', 'error'); return; }
    this.state.step = 2;
    this.renderWizard();
  },

  async save() {
    const f = this.state.form;
    if (!f.fields.length) { toast('Add at least one field', 'error'); return; }
    const payload = {
      name: f.name.trim(),
      project_id: f.project_id,
      redirect_url: f.button_config.redirect_url || null,
      settings: {
        description: f.description,
        source: f.source, sub_source: f.sub_source,
        styles: f.styles, button_config: f.button_config,
        thank_you_msg: f.thank_you_msg,
      },
      fields: f.fields,
    };
    try {
      if (this.state.editing) {
        await Api.put('/api/v1/forms/' + this.state.editing, payload);
        toast('Form updated');
      } else {
        const r = await Api.post('/api/v1/forms', payload);
        toast('Form created');
        // Show embed snippet then return to list
        FormBuilderView.showEmbedFromCreate(r);
        return;
      }
      FormBuilderView.render();
    } catch (e) { toast(e.message, 'error'); }
  },

  showEmbed(form) {
    Api.get('/api/v1/forms/' + form.id).then(f => this.showEmbedFromCreate({
      slug: f.slug, embed_script: f.embed_script
    }));
  },

  showEmbedFromCreate(r) {
    const snippet = r.embed_script || ('<div data-crm-form="' + r.slug + '"></div>\n<script src="/assets/js/form-embed.js" data-form="' + r.slug + '" async></script>');
    // Robust copy — modern browsers block navigator.clipboard on non-HTTPS / non-localhost hosts,
    // and it throws synchronously in Firefox when unavailable. Fall back to legacy execCommand.
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
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_) { ok = false; }
      ta.remove();
      return ok;
    };

    Modal.open('Form Embed Snippet',
      h('div', {},
        h('div', { style: 'background:#dbeafe;padding:12px;border-radius:6px;margin-bottom:14px;color:#1e3a8a' },
          'Paste this snippet into your website. Submissions create leads automatically with round-robin BDE assignment.'),
        h('pre', { 'data-testid': 'embed-snippet', style: 'background:#0f172a;color:#e2e8f0;padding:14px;border-radius:6px;overflow-x:auto;font-size:12px;white-space:pre-wrap;word-break:break-all' }, snippet),
        h('div', { class: 'muted text-sm', style: 'margin-top:8px' }, 'Direct API URL: ', h('code', {}, location.origin + CRM.API + '/public/forms/' + r.slug + '/submit'))
      ),
      h('div', { class: 'flex gap-8' },
        h('button', { class: 'btn-secondary', 'data-testid': 'embed-close-btn', type: 'button',
          onclick: (e) => { e.preventDefault(); e.stopPropagation(); Modal.close(); FormBuilderView.render(); }
        }, 'Close'),
        h('button', { class: 'btn-primary', 'data-testid': 'embed-copy-close-btn', type: 'button', onclick: async (e) => {
          e.preventDefault(); e.stopPropagation();
          const ok = await copyToClipboard(snippet);
          toast(ok ? 'Copied to clipboard' : 'Copy failed — please select the code manually', ok ? 'success' : 'error');
          Modal.close();
          FormBuilderView.render();
        } }, 'Copy & Close')
      )
    );
  }
};

/* =========================================================== */
/* CSV Import wizard                                            */
/* =========================================================== */
const CsvImportView = {
  async render() {
    setTitle('Bulk Lead Import (CSV)');
    setTopbarActions();
    const page = document.getElementById('page');
    page.innerHTML = '<div class="spinner"></div>';

    let projects, sources;
    try {
      [projects] = await Promise.all([Api.get('/api/v1/projects')]);
    } catch (e) {
      page.innerHTML = '<div class="empty">Admin access required.</div>';
      return;
    }
    page.innerHTML = '';

    const projSel = h('select', { id: 'csvProj' },
      h('option', { value: '' }, '— No default project —'),
      ...projects.items.map(p => h('option', { value: p.id }, p.name)));
    const sourceInp = h('input', { id: 'csvSrc', placeholder: 'meta / mcube / partner / website', value: 'meta' });
    const fileInp = h('input', { type: 'file', id: 'csvFile', accept: '.csv,text/csv' });

    const mapping = h('div', { id: 'csvMapping', style: 'margin-top:16px' });
    const results = h('div', { id: 'csvResults', style: 'margin-top:16px' });

    page.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-body' },
        h('div', { style: 'background:#fef3c7;padding:10px;border-radius:6px;margin-bottom:14px;color:#92400e' },
          'Upload a CSV → map each column to a CRM field → import. Phone-based dedupe applies; assignment uses round-robin.'),
        h('div', { class: 'flex gap-16' },
          h('div', { style: 'flex:1' }, h('label', {}, 'Default project'), projSel),
          h('div', { style: 'flex:1' }, h('label', {}, 'Source (will tag all rows)'), sourceInp),
        ),
        h('div', { style: 'margin-top:12px' }, h('label', {}, 'CSV file'), fileInp),
        h('div', { style: 'margin-top:12px' },
          h('button', { class: 'btn-primary btn-sm', onclick: () => CsvImportView.parseHeaders(mapping, fileInp) }, 'Read columns →')
        ),
        mapping, results
      )
    ));
  },

  parseHeaders(container, fileInp) {
    const file = fileInp.files[0];
    if (!file) { toast('Pick a file first', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result;
      const firstLine = text.split('\n')[0] || '';
      const headers = firstLine.split(',').map(h => h.replace(/^"|"$/g, '').trim());
      this._headers = headers;
      this.renderMapping(container, headers);
    };
    reader.readAsText(file);
  },

  renderMapping(container, headers) {
    container.innerHTML = '';
    container.appendChild(h('h4', { style: 'margin-bottom:10px' }, 'Map CSV columns → CRM fields'));
    const targets = [
      ['', '— skip this column —'],
      // Contact
      ['first_name', 'First Name'],
      ['last_name',  'Last Name'],
      ['phone',      'Phone (E.164, e.g. +9198...)'],
      ['email',      'Email'],
      ['city',       'City'],
      // Lead — attribution
      ['source',     'Source (facebook / meta / website / walk-in / phone / referral)'],
      ['sub_source', 'Sub-source (ad name, chatbot flow, etc.)'],
      ['campaign',   'Campaign'],
      // Lead — assignment (looked up server-side)
      ['project',    'Project (matches by name OR project code)'],
      ['owner',      'Owner (matches by user email OR full name)'],
      ['stage',      'Stage (new / contacted / qualified / site-visit-done / booked)'],
      ['status',     'Status (open / lost / won / dropped)'],
      // Lead — financial
      ['budget_min', 'Budget Min'],
      ['budget_max', 'Budget Max'],
      ['configuration', 'Configuration (e.g. 3BHK)'],
      ['priority',   'Priority (low / medium / high / hot)'],
      // Lead — misc
      ['notes',      'Notes / Remarks'],
      ['lost_reason','Lost Reason'],
      ['created_at', 'Created Date (2026-07-28 or 28/07/2026)'],
      ['created_by', 'Created By (user email OR full name)'],
      // Custom slots (auto-created; also see "+ Add custom field" below)
      ['custom:plot_size_pref', 'Custom: Plot Size'],
      ['custom:occupation',     'Custom: Occupation'],
      ['custom:requirement',    'Custom: Requirement'],
      ['custom:message',        'Custom: Message'],
      ['custom:_new_',          '➕ Add new custom field...'],
    ];
    const tbl = h('table', { class: 'table' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'CSV Column (left)'),
        h('th', {}, 'CRM Field (right)'),
        h('th', { style: 'width:40px' }, '')
      )),
      h('tbody', { id: 'csvMappingTbody' }, ...headers.map(col => this.mappingRow(col, targets)))
    );
    container.appendChild(tbl);
    // "Add column" button so the admin can attach a NEW custom field on the fly.
    container.appendChild(h('div', { style: 'display:flex;gap:8px;margin-top:8px' },
      h('button', { class: 'btn-secondary btn-sm', 'data-testid': 'csv-add-custom-row', onclick: () => {
        const raw = prompt('New field name (e.g. "Sub Source" or "Interest Level"):');
        if (!raw || !raw.trim()) return;
        // Auto-slugify — convert to lower_snake_case so users don't have to think about slugs.
        const slug = raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (!slug) return toast('Field name must contain letters or digits', 'error');
        const label = raw.trim();
        const tbody = document.getElementById('csvMappingTbody');
        const row = this.mappingRow('(added: ' + label + ')', targets, 'custom:' + slug, label);
        tbody.appendChild(row);
      } }, '➕ Add extra column'),
      h('button', {
        class: 'btn-primary', style: 'margin-left:auto',
        'data-testid': 'csv-start-import',
        onclick: () => CsvImportView.runImport()
      }, 'Start Import')
    ));
  },

  /** Render a single CSV column → CRM field mapping row. */
  mappingRow(col, targets, forceTarget, customLabel) {
    const sel = h('select', { 'data-csv-col': col, style: 'width:100%' },
      ...targets.map(([v, l]) => h('option', {
        value: v,
        selected: (forceTarget ? forceTarget === v : this.guessTarget(col) === v) ? 'selected' : null
      }, l))
    );
    // When user picks "Add new custom field..." we prompt and rewrite the option value inline.
    sel.addEventListener('change', () => {
      if (sel.value === 'custom:_new_') {
        const raw = prompt('New field name (letters/digits/spaces — we\'ll auto-slugify):');
        if (!raw || !raw.trim()) { sel.value = ''; return; }
        const slug = raw.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (!slug) { toast('Field name must contain letters or digits', 'error'); sel.value = ''; return; }
        const label = raw.trim();
        const opt = h('option', { value: 'custom:' + slug, selected: 'selected' }, 'Custom: ' + label);
        sel.appendChild(opt);
        sel.value = 'custom:' + slug;
      }
    });
    return h('tr', {},
      h('td', {}, h('code', { style: 'font-size:12px' }, col)),
      h('td', {}, sel),
      h('td', {}, h('button', { class: 'btn-icon', title: 'Skip this column', onclick: (e) => { sel.value = ''; } }, '×'))
    );
  },

  guessTarget(col) {
    const c = col.toLowerCase();
    if (/full\s*name|^name$/.test(c) && !/last/.test(c)) return 'first_name';
    if (/first\s*name/.test(c)) return 'first_name';
    if (/last\s*name|surname/.test(c)) return 'last_name';
    if (/phone|mobile|cell/.test(c)) return 'phone';
    if (/email|mail/.test(c)) return 'email';
    if (/city|location/.test(c)) return 'city';
    if (/sub\s*source|subsource|sub_source|ad\s*name|adname/.test(c)) return 'sub_source';
    if (/source|channel/.test(c)) return 'source';
    if (/campaign/.test(c)) return 'campaign';
    if (/budget\s*min|min\s*budget/.test(c)) return 'budget_min';
    if (/budget\s*max|max\s*budget|budget$/.test(c)) return 'budget_max';
    if (/configuration|bhk|unit\s*type/.test(c)) return 'configuration';
    if (/priority/.test(c)) return 'priority';
    if (/notes?|remark|comment/.test(c)) return 'notes';
    if (/lost.*reason|reason.*lost/.test(c)) return 'lost_reason';
    if (/project/.test(c)) return 'project';
    if (/^status$/.test(c)) return 'status';
    if (/stage/.test(c)) return 'stage';
    if (/owner|assigned.*to|bde/.test(c)) return 'owner';
    if (/created.*by|creator/.test(c)) return 'created_by';
    if (/created.*date|created.*at|date/.test(c)) return 'created_at';
    return '';
  },

  async runImport() {
    const fileInp = document.getElementById('csvFile');
    const projSel = document.getElementById('csvProj');
    const sourceInp = document.getElementById('csvSrc');
    const results = document.getElementById('csvResults');

    const columnMap = {};
    document.querySelectorAll('#csvMapping select[data-csv-col]').forEach(s => {
      if (s.value) columnMap[s.dataset.csvCol] = s.value;
    });
    if (!Object.keys(columnMap).length) { toast('Map at least one column', 'error'); return; }

    const defaults = {};
    if (projSel.value) defaults.project_id = parseInt(projSel.value);
    if (sourceInp.value.trim()) defaults.source = sourceInp.value.trim();

    const fd = new FormData();
    fd.append('file', fileInp.files[0]);
    fd.append('column_map', JSON.stringify(columnMap));
    fd.append('defaults', JSON.stringify(defaults));

    results.innerHTML = '<div class="spinner"></div>';
    const res = await fetch('/api/v1/csv/import', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + Api.token() },
      body: fd
    });
    const data = await res.json();
    results.innerHTML = '';
    if (!res.ok) { results.appendChild(h('div', { class: 'empty', style: 'color:#dc2626' }, data.error?.message || 'Import failed')); return; }

    results.appendChild(h('div', { class: 'card', style: 'background:#dcfce7;padding:14px' },
      h('div', { style: 'font-weight:600;color:#15803d' }, '✓ Import complete'),
      h('div', { style: 'margin-top:6px' }, 'Imported: ' + data.imported + ' · Failed: ' + data.failed)
    ));

    if (data.errors && data.errors.length) {
      results.appendChild(h('div', { class: 'card', style: 'margin-top:10px' },
        h('div', { class: 'card-body' },
          h('h4', {}, 'First errors (capped at 20)'),
          h('ul', {}, ...data.errors.map(e =>
            h('li', { class: 'text-sm muted' }, 'Row ' + e.row + ': ' + e.error)
          ))
        )
      ));
    }
  }
};

/* =========================================================== */
/* Profile + Change Password                                    */
/* =========================================================== */
const ProfileView = {
  async render() {
    setTitle('My Profile');
    setTopbarActions();
    const page = document.getElementById('page');
    page.innerHTML = '<div class="spinner"></div>';
    const p = await Api.get('/api/v1/profile');
    page.innerHTML = '';

    // ===== Profile card =====
    const nameInp = h('input', { value: p.name, name: 'name' });
    const phoneInp = h('input', { value: p.phone || '', name: 'phone' });

    page.appendChild(h('div', { class: 'card mb-16' },
      h('div', { class: 'card-header' }, h('div', { class: 'card-title' }, 'Profile Details')),
      h('div', { class: 'card-body' },
        h('div', { class: 'grid grid-2' },
          h('div', {}, h('label', {}, 'Name'), nameInp),
          h('div', {}, h('label', {}, 'Email (read-only)'), h('input', { value: p.email, disabled: 'disabled' })),
          h('div', {}, h('label', {}, 'Phone'), phoneInp),
          h('div', {}, h('label', {}, 'Role'), h('input', { value: p.role_name, disabled: 'disabled' })),
        ),
        h('div', { style: 'margin-top:14px;display:flex;gap:10px' },
          h('button', { class: 'btn-primary', onclick: async () => {
            try {
              await Api.put('/api/v1/profile', { name: nameInp.value, phone: phoneInp.value });
              toast('Profile updated');
            } catch (e) { toast(e.message, 'error'); }
          } }, 'Save Profile')
        )
      )
    ));

    // ===== Change password card =====
    const cur = h('input', { type: 'password', autocomplete: 'current-password' });
    const np1 = h('input', { type: 'password', autocomplete: 'new-password' });
    const np2 = h('input', { type: 'password', autocomplete: 'new-password' });

    page.appendChild(h('div', { class: 'card' },
      h('div', { class: 'card-header' }, h('div', { class: 'card-title' }, 'Change Password')),
      h('div', { class: 'card-body' },
        h('div', { style: 'background:#fef3c7;padding:10px;border-radius:6px;margin-bottom:14px;color:#92400e;font-size:13px' },
          'Choose a strong password (6+ characters). All other devices will be logged out after change.'),
        h('div', { class: 'grid grid-2' },
          h('div', { class: 'col-span-2' }, h('label', {}, 'Current Password'), cur),
          h('div', {}, h('label', {}, 'New Password'), np1),
          h('div', {}, h('label', {}, 'Confirm New Password'), np2),
        ),
        h('div', { style: 'margin-top:14px' },
          h('button', { class: 'btn-primary', onclick: async () => {
            if (np1.value !== np2.value) { toast('New passwords do not match', 'error'); return; }
            try {
              const r = await Api.post('/api/v1/profile/password', {
                current_password: cur.value,
                new_password: np1.value,
                new_password_confirmation: np2.value,
              });
              toast(r.message || 'Password changed');
              cur.value = ''; np1.value = ''; np2.value = '';
            } catch (e) { toast(e.message, 'error'); }
          } }, 'Change Password')
        )
      )
    ));
  }
};

window.FormBuilderView = FormBuilderView;
