// Only a revision number is streamed. Each page refetches through its own authorized APIs.
export function watchData(store, changed, { target = window, doc = document, pollMs = 15000 } = {}) {
  let revision = null, channel = null, stopped = false, checking = false;
  const accept = value => {
    if (stopped || value == null) return;
    const next = String(value);
    if (revision !== null && BigInt(next) <= BigInt(revision)) return;
    if (revision !== null && next !== revision) changed();
    revision = next;
  };
  const check = async () => {
    if (stopped || checking || doc.hidden || store.mode !== 'cloud') return;
    checking = true;
    try {
      const result = await store.sb.from('app_data_revision').select('version').eq('id', 1).single();
      if (!result.error) accept(result.data?.version);
    } catch (_) { /* Reconnection and polling retry transient failures. */ }
    finally { checking = false; }
  };
  // الاتصال وعودة التبويب يراجعان رقم الإصدار فقط؛ لا إعادة عرض ما لم تتغير البيانات فعلًا (كانت سبب الومضات عند الفتح)
  const resume = () => { if (!doc.hidden) check(); };
  const peek = () => { check(); };
  const local = event => {
    if (event.key !== store.key) return;
    store.load();
    changed();
  };
  if (store.mode === 'cloud') {
    channel = store.sb.channel('app-data-revision').on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'app_data_revision', filter: 'id=eq.1'
    }, payload => accept(payload.new?.version)).subscribe(status => {
      if (status === 'SUBSCRIBED') check();
    });
    check();
  }
  const timer = setInterval(check, pollMs);
  target.addEventListener('online', resume);
  target.addEventListener('focus', peek);
  target.addEventListener('storage', local);
  target.addEventListener('sama-data-changed', changed);
  doc.addEventListener('visibilitychange', resume);
  return () => {
    stopped = true;
    clearInterval(timer);
    if (channel) store.sb.removeChannel(channel);
    target.removeEventListener('online', resume);
    target.removeEventListener('focus', peek);
    target.removeEventListener('storage', local);
    target.removeEventListener('sama-data-changed', changed);
    doc.removeEventListener('visibilitychange', resume);
  };
}

// Coalesce events and wait until the current edit has been saved or dismissed.
export function refreshQueue(refresh, blocked, { delay = 350, retry = 1000, minGap = 0 } = {}) {
  let pending = false, running = false, stopped = false, timer, last = 0;
  const flush = async () => {
    if (stopped || running || !pending) return;
    if (blocked()) { timer = setTimeout(flush, retry); return; }
    const wait = last + minGap - Date.now();   // حد أدنى بين إعادتي عرض (لوحة الإدارة ثقيلة)
    if (wait > 0) { timer = setTimeout(flush, wait); return; }
    pending = false;
    running = true; last = Date.now();
    try { await refresh(); } catch (_) { pending = true; }
    finally { running = false; if (pending && !stopped) timer = setTimeout(flush, retry); }
  };
  const request = () => { if (stopped) return; pending = true; clearTimeout(timer); timer = setTimeout(flush, delay); };
  request.stop = () => { stopped = true; clearTimeout(timer); };
  return request;
}
