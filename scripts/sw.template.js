/* عامل الخدمة لمركز سما القدرات — يولَّد عند البناء (vite.config.js) بقائمة ملفات dist ورقم إصدار.
   - الصفحات: الشبكة أولًا، والنسخة المحفوظة عند انقطاع الاتصال.
   - ملفات assets (بأسماء مبصومة): المحفوظ أولًا.
   - مكتبات CDN والخطوط: المحفوظ ثم التحديث في الخلفية.
   - طلبات البيانات (Supabase وغيرها) لا تُحفظ أبدًا.
   التحديث لا يُفعَّل إلا بطلب المستخدم (SKIP_WAITING) كي لا تتبدل الصفحة أثناء العمل. */
const VERSION = '__VERSION__', CACHE = 'sama-' + VERSION, RUNTIME = 'sama-rt';
const PRECACHE = __PRECACHE__;
const CDN = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.jsdelivr.net'];
const abs = u => new URL(u, self.registration.scope).href;

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(PRECACHE.map(u => c.add(new Request(abs(u), { cache: 'reload' })).catch(() => {})))));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('sama-') && k !== CACHE && k !== RUNTIME).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

const put = (name, req, res) => { if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(name).then(c => c.put(req, copy)).catch(() => {}); } return res; };
const swr = (name, req) => caches.match(req).then(hit => { const net = fetch(req).then(r => put(name, req, r)).catch(() => hit); return hit || net; });

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (!url.href.startsWith(self.registration.scope)) return;
    if (url.href.startsWith(abs('admin/'))) return;                       // لوحة الإدارة تعمل بالاتصال فقط ولا تُحفظ
    if (req.mode === 'navigate') {
      const page = url.pathname.endsWith('/') ? url.origin + url.pathname + 'index.html' : url.origin + url.pathname;
      e.respondWith(fetch(req).then(r => put(CACHE, page, r)).catch(() => caches.match(page).then(r => r || caches.match(abs('index.html')))));
      return;
    }
    if (url.pathname.includes('/assets/')) { e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => put(CACHE, req, r)))); return; }
    e.respondWith(swr(CACHE, req)); return;
  }
  if (CDN.includes(url.hostname)) e.respondWith(swr(RUNTIME, req));
});

/* إشعارات الجهاز (Web Push): تُفعَّل من الخادم في خطوة الربط؛ المعالج جاهز من الآن */
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (_) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || 'مركز سما القدرات', { body: d.body || '', icon: abs('pwa/icon-192.png'), badge: abs('pwa/badge-96.png'),
    tag: d.tag || undefined, dir: 'rtl', lang: 'ar', data: { url: d.url || '' } }));
});
self.addEventListener('notificationclick', e => {
  e.notification.close(); const target = abs(e.notification.data?.url || './');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(cs => {
    const hit = cs.find(c => c.url.split('#')[0] === target.split('#')[0]) || cs.find(c => c.url.startsWith(self.registration.scope));
    return hit ? hit.focus() : self.clients.openWindow(target);
  }));
});
