import { watchData, refreshQueue } from './data_sync.js';

export function startLiveRefresh(store, refresh, { minGap = 0 } = {}) {
  const dirtyForms = new Set();
  const edit = event => {
    const form = event.target.closest?.('form');
    if (form && event.isTrusted) dirtyForms.add(form);
  };
  const blocked = () => {
    for (const form of dirtyForms) {
      const dirty = [...form.elements].some(el => {
        if (el.matches('input[type="checkbox"],input[type="radio"]')) return el.checked !== el.defaultChecked;
        if (el.tagName === 'SELECT') return el.selectedIndex !== Math.max(0, [...el.options].findIndex(option => option.defaultSelected));
        return el.matches('input:not([type="submit"]):not([type="button"]),textarea') && el.value !== el.defaultValue;
      });
      if (!form.isConnected || !dirty) dirtyForms.delete(form);
    }
    return document.hidden || dirtyForms.size > 0 || !!document.querySelector('.modal-bg, #simRoot, [data-live-busy], [aria-busy="true"]') ||
      document.activeElement?.matches('input,textarea,select,[contenteditable="true"]');
  };
  const request = refreshQueue(async () => {
    const hash = location.hash, x = window.scrollX, y = window.scrollY;
    const filters = [...document.querySelectorAll('.filters input, .filters select, input[type="search"]')]
      .filter(el => el.id).map(el => ({ id: el.id, value: el.value, type: el.tagName === 'SELECT' ? 'change' : 'input' }));
    const root = document.documentElement;
    root.classList.add('live-redraw');   // إعادة هادئة: بلا هيكل تحميل ولا حركات ظهور
    try { await refresh(); }
    finally { requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('live-redraw'))); }
    if (location.hash !== hash) return;
    for (const filter of filters) {
      const el = document.getElementById(filter.id);
      if (el && el.value !== filter.value) { el.value = filter.value; el.dispatchEvent(new Event(filter.type, { bubbles: true })); }
    }
    window.scrollTo(x, y);
  }, blocked, { minGap });
  document.addEventListener('input', edit);
  document.addEventListener('change', edit);
  const stop = watchData(store, request);
  return () => {
    stop(); request.stop();
    document.removeEventListener('input', edit);
    document.removeEventListener('change', edit);
  };
}
