// Designed inline date + time picker (vanilla) matching the cockpit look.
(function () {
  const { el } = CRM;
  const WD = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const pad = n => String(n).padStart(2, '0');
  const to12 = h => ((h + 11) % 12) + 1;
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

  CRM.datePicker = function (opts) {
    opts = opts || {};
    let sel = opts.value ? new Date(opts.value) : null;
    let view = sel ? new Date(sel) : new Date();
    let time = sel ? pad(sel.getHours()) + ':' + pad(sel.getMinutes()) : (opts.defaultTime || '11:00');

    const grid = el('div', { class: 'dp-grid' });
    const label = el('div', { class: 'dp-title' });
    const timeSel = el('select', { class: 'dp-time', 'data-testid': 'dp-time' });
    for (let h = 8; h <= 20; h++) {
      ['00', '30'].forEach(mm => { const v = pad(h) + ':' + mm; const o = el('option', { value: v }, to12(h) + ':' + mm + ' ' + (h < 12 ? 'AM' : 'PM')); if (v === time) o.selected = true; timeSel.appendChild(o); });
    }
    timeSel.addEventListener('change', () => { time = timeSel.value; });

    function draw() {
      label.textContent = MON[view.getMonth()] + ' ' + view.getFullYear();
      grid.innerHTML = '';
      WD.forEach(d => grid.appendChild(el('div', { class: 'dp-wd' }, d)));
      const start = new Date(view.getFullYear(), view.getMonth(), 1).getDay();
      const days = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
      const today = new Date(); today.setHours(0, 0, 0, 0);
      for (let i = 0; i < start; i++) grid.appendChild(el('div', { class: 'dp-day dp-empty' }));
      for (let d = 1; d <= days; d++) {
        const date = new Date(view.getFullYear(), view.getMonth(), d);
        const past = date < today;
        const btn = el('button', { type: 'button', class: 'dp-day' + (sel && sameDay(date, sel) ? ' dp-sel' : '') + (sameDay(date, today) ? ' dp-today' : ''), 'data-testid': 'dp-day-' + d, disabled: past ? 'disabled' : null,
          onclick: () => { sel = new Date(date); [...grid.querySelectorAll('.dp-sel')].forEach(x => x.classList.remove('dp-sel')); btn.classList.add('dp-sel'); } }, String(d));
        grid.appendChild(btn);
      }
    }
    const prev = el('button', { type: 'button', class: 'dp-nav', 'data-testid': 'dp-prev', onclick: () => { view = new Date(view.getFullYear(), view.getMonth() - 1, 1); draw(); } }, el('i', { class: 'fa-solid fa-chevron-left' }));
    const next = el('button', { type: 'button', class: 'dp-nav', 'data-testid': 'dp-next', onclick: () => { view = new Date(view.getFullYear(), view.getMonth() + 1, 1); draw(); } }, el('i', { class: 'fa-solid fa-chevron-right' }));
    const node = el('div', { class: 'dp', 'data-testid': 'date-picker' },
      el('div', { class: 'dp-head' }, prev, label, next),
      grid,
      el('div', { class: 'dp-timerow' }, el('i', { class: 'fa-solid fa-clock' }), el('span', { class: 'dp-timelbl' }, 'Time'), timeSel));
    draw();

    return {
      node,
      getValue() {
        if (!sel) return null;
        const [h, mm] = time.split(':');
        const d = new Date(sel); d.setHours(+h, +mm, 0, 0);
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
      },
    };
  };
})();
