/* Presentation only: never changes stored dates, sorting, or message metadata. */
function compactMessageDate(timestamp, now = new Date(), locale) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime()) || timestamp <= 0) return null;
  const today = date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  const options = today ? {hour:'numeric', minute:'2-digit'} :
    date.getFullYear() === now.getFullYear() ? {month:'short', day:'numeric'} :
      {year:'numeric', month:'short', day:'numeric'};
  return {
    short: new Intl.DateTimeFormat(locale, options).format(date),
    full: new Intl.DateTimeFormat(locale, {weekday:'long', year:'numeric', month:'long',
      day:'numeric', hour:'numeric', minute:'2-digit', second:'2-digit', timeZoneName:'short'}).format(date)
  };
}

function installCompactDates(win) {
  const doc = win.document;
  let closed = false, prototype, original, wrapped, timer;
  const saved = new Map();
  const locale = win.Services?.locale?.appLocalesAsBCP47 || win.navigator.languages;
  function render(row, nativeFill = false) {
    const cell = row.querySelector('.datecol-column');
    if (!cell) return;
    if (nativeFill || !saved.has(cell)) saved.set(cell, {
      text:cell.textContent, title:cell.getAttribute('title'),
      args:cell.getAttribute('data-l10n-args')
    });
    if ((row.dataset.properties || '').split(' ').includes('dummy')) return;
    try {
      const hdr = win.gDBView?.getMsgHdrAt(row.index);
      if (!hdr) return;
      const timestamp = hdr.dateInSeconds ? hdr.dateInSeconds * 1000 : hdr.date / 1000;
      const formatted = compactMessageDate(timestamp, new Date(), locale);
      if (!formatted) return;
      cell.textContent = formatted.short;
      cell.title = formatted.full;
      // Native Fluent translation runs asynchronously; give it the full tooltip
      // too so it cannot later replace it with the shortened display string.
      const id = cell.getAttribute('data-l10n-id');
      if (id) doc.l10n.setAttributes(cell, id, {title:formatted.full});
    } catch (error) { console.error('Compact message dates:', error); }
  }
  function refresh() {
    if (closed) return;
    for (const row of doc.querySelectorAll('#threadTree tr.table-layout')) render(row);
  }
  function midnight() {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate()+1);
    timer = win.setTimeout(() => { refresh(); midnight(); }, next-now+100);
  }
  win.customElements.whenDefined('thread-row').then(() => {
    if (closed) return;
    prototype = win.customElements.get('thread-row').prototype;
    original = prototype.fillRow;
    wrapped = function(...args) {
      const result = original.apply(this, args);
      render(this, true);
      return result;
    };
    prototype.fillRow = wrapped;
    refresh(); midnight();
  });
  win.addEventListener('focus', refresh);
  function close() {
    if (closed) return;
    closed = true;
    win.clearTimeout(timer);
    win.removeEventListener('focus', refresh);
    win.removeEventListener('unload', close);
    if (prototype?.fillRow === wrapped) prototype.fillRow = original;
    for (const [cell, state] of saved) {
      cell.textContent = state.text;
      for (const [name, value] of [['title',state.title],['data-l10n-args',state.args]]) {
        if (value === null) cell.removeAttribute(name); else cell.setAttribute(name, value);
      }
    }
    saved.clear();
  }
  win.addEventListener('unload', close, {once:true});
  return {refresh, close};
}
