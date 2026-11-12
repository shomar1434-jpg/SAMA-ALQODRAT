// الخطوة E: التطبيق القابل للتثبيت — ملفات التعريف والأيقونات، عامل الخدمة والعمل دون اتصال، زر التثبيت وإرشاده، إشعار التحديث، إشعارات الجهاز
import { chromium, devices } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();

// ملفات التعريف والأيقونات لكل صفحة
let good = true; const names = [];
for (const dir of ['', 'student/', 'guardian/', 'teacher/', 'admin/']) {
  await p.goto(U + dir); await p.waitForTimeout(300);
  const href = await p.getAttribute('link[rel=manifest]', 'href').catch(() => null); if (!href) { good = false; continue; }
  const m = await p.evaluate(async h => { const r = await fetch(h); const j = await r.json(); const icons = await Promise.all(j.icons.map(i => fetch(new URL(i.src, r.url)).then(x => x.ok && x.headers.get('content-type') === 'image/png')));
    return { j, icons, apple: (await fetch(document.querySelector('link[rel=apple-touch-icon]').href)).ok }; }, href);
  names.push(m.j.short_name);
  if (!(m.j.display === 'standalone' && m.j.dir === 'rtl' && m.j.start_url === './' && m.j.scope === './' && m.icons.every(Boolean) && m.j.icons.some(i => i.purpose === 'maskable') && m.j.icons.some(i => i.sizes === '512x512') && m.apple)) good = false;
}
ok(good && new Set(names).size === 5, 'لكل صفحة ملف تعريف مستقل باسمها وأيقوناتها (192 و512 وmaskable وأيقونة آبل)');
ok((await p.getAttribute('meta[name=viewport]', 'content')).includes('viewport-fit=cover') && await p.$('meta[name=theme-color]'), 'وسوم العرض ولون الشريط');

// عامل الخدمة والحفظ المسبق
await p.goto(U + 'student/'); await p.waitForTimeout(500);
const sw = await p.evaluate(async () => { const r = await navigator.serviceWorker.ready; await new Promise(z => setTimeout(z, 1500)); const ks = await caches.keys(); const c = await caches.open(ks.find(k => k.startsWith('sama-') && k !== 'sama-rt'));
  return { scope: r.scope, n: (await c.keys()).length, admin: (await c.keys()).some(x => /\/admin\/index\.html/.test(x.url)) }; });
ok(sw.scope === U && sw.n >= 20 && !sw.admin, `عامل الخدمة مسجّل على الجذر ويحفظ ملفات التطبيق (${sw.n}) دون لوحة الإدارة`);

// العمل دون اتصال
await p.reload(); await p.waitForTimeout(800);
await ctx.setOffline(true);
await p.goto(U + 'student/').catch(() => {}); await p.waitForTimeout(1200);
ok(await p.$('#pl-phone'), 'بوابة المتدرب تفتح دون اتصال');
await p.goto(U + 'guardian/').catch(() => {}); await p.waitForTimeout(1200);
ok(await p.$('#pl-phone') && /ولي الأمر/.test(await text('#app')), 'بوابة ولي الأمر تفتح دون اتصال');
await p.goto(U).catch(() => {}); await p.waitForTimeout(1500);
ok(/سما القدرات/.test(await text('body')), 'الصفحة الرئيسية تفتح دون اتصال');
await ctx.setOffline(false);

// زر التثبيت وإرشاده
await p.goto(U + 'student/'); await p.waitForTimeout(600);
ok(await p.$('#installBtn'), 'زر التثبيت في الشريط العلوي');
await p.click('#installBtn'); await p.waitForTimeout(300);
const steps = await text('.modal');
ok(/الكمبيوتر/.test(steps) && /آيفون/.test(steps) && /أندرويد/.test(steps) && /Dock/.test(steps), 'إرشاد التثبيت لكل الأنظمة');
await p.click('#pwaX');
const ios = await b.newContext({ ...devices['iPhone 13'] }); const ip = await ios.newPage();
await ip.goto(U + 'student/'); await ip.waitForTimeout(700); await ip.click('#installBtn'); await ip.waitForTimeout(300);
ok(/آيفون وآيباد/.test(await ip.textContent('.modal h4')) && /إضافة إلى الشاشة الرئيسية/.test(await ip.textContent('.modal')), 'على الآيفون يظهر إرشاد Safari أولًا');
await ios.close();

// إشعار التحديث عند صدور إصدار جديد
const swFile = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'dist', 'sw.js'), orig = fs.readFileSync(swFile, 'utf8');
try {
  fs.writeFileSync(swFile, orig.replace(/const VERSION = '([0-9a-f]+)'/, "const VERSION = 'test$1'"));
  await p.reload(); await p.waitForSelector('#pwaUpdate', { timeout: 15000 });
  ok(/يتوفر تحديث/.test(await text('#pwaUpdate')), 'يظهر «يتوفر تحديث» عند إصدار جديد دون تبديل الصفحة تلقائيًا');
  await Promise.all([p.waitForNavigation({ timeout: 15000 }).catch(() => {}), p.click('#pwaUp')]); await p.waitForTimeout(1200);
  const v = await p.evaluate(async () => (await caches.keys()).filter(k => k.startsWith('sama-test')).length);
  ok(v === 1 && !(await p.$('#pwaUpdate')), '«تحديث الآن» يفعّل الإصدار الجديد ويعيد التحميل');
} finally { fs.writeFileSync(swFile, orig); }

// إشعارات الجهاز من لائحة الإشعارات
const login = async (pg, phone) => { await pg.fill('#pl-phone', phone); await pg.click('#plB'); await pg.waitForTimeout(300); await pg.fill('#pl-code', '1234'); await pg.click('#plB'); await pg.waitForTimeout(1400); };
await p.goto(U + 'student/'); await p.waitForTimeout(600); await login(p, '0550000001');
await p.click('#bellBtn'); await p.waitForTimeout(400);
ok(await p.$('#ibDev') || /إشعارات الجهاز/.test(await text('#inboxPanel')), 'خيار إشعارات الجهاز في لائحة الإشعارات');
await ctx.grantPermissions(['notifications']); await p.keyboard.press('Escape'); await p.reload(); await p.waitForTimeout(1200); await p.click('#bellBtn'); await p.waitForTimeout(400);
const perm = await p.evaluate(() => Notification.permission);
ok(perm === 'granted' ? /إشعارات الجهاز مفعّلة/.test(await text('#inboxPanel')) : /إشعارات الجهاز/.test(await text('#inboxPanel')), `حالة إشعارات الجهاز تظهر في اللائحة (${perm})`);

ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
