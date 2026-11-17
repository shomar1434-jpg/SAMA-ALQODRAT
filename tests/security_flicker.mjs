// الخطوة BF: لا ومضات عند الفتح والتحديث الحي، والسمة الداكنة قبل الرسم، وسياسة أمان المحتوى والمكتبات المحلية
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const errs = [], csp = [], external = [];
const ctx = await b.newContext({ viewport: { width: 1280, height: 800 } });
const p = await ctx.newPage();
p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()); });
p.on('request', r => { const h = new URL(r.url()).host; if (/cdnjs|jsdelivr/.test(h)) external.push(r.url()); });
await p.addInitScript(() => {
  window.__redraws = 0; window.__skel = 0;
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1) {
    if (n.matches?.('.skel') || n.querySelector?.('.skel')) window.__skel++;
    if (m.target.id === 'app') window.__redraws++;
  } }).observe(document, { childList: true, subtree: true });
});
await p.goto(U + '#home'); await p.waitForSelector('#app .wrap, #app section');
await p.waitForTimeout(1500);
const first = await p.evaluate(() => window.__redraws);
ok(first >= 1, 'الرئيسية تُرسم');
await p.waitForTimeout(2500);
ok(await p.evaluate(() => window.__redraws) === first, 'لا إعادة رسم بعد الفتح ما لم تتغير البيانات');
// تغيّر حقيقي: إعادة هادئة بلا هيكل تحميل ولا حركات ظهور
await p.evaluate(() => { window.__skel = 0; window.__quiet = []; new MutationObserver(() => window.__quiet.push(document.documentElement.classList.contains('live-redraw'))).observe(document.getElementById('app'), { childList: true }); });
await p.evaluate(() => window.dispatchEvent(new Event('sama-data-changed')));
await p.waitForFunction(() => window.__quiet.length > 0, null, { timeout: 8000 });
await p.waitForTimeout(400);
ok(await p.evaluate(() => window.__quiet.every(Boolean)), 'التحديث الحي يعيد العرض بالوضع الهادئ');
ok(await p.evaluate(() => !document.documentElement.classList.contains('live-redraw')), 'الوضع الهادئ يزول بعد الرسم');
await p.goto(U + '#register'); await p.waitForSelector('#app .wrap');
await p.waitForTimeout(800);
await p.evaluate(() => { window.__skel = 0; window.dispatchEvent(new Event('sama-data-changed')); });
await p.waitForTimeout(3600);
ok(await p.evaluate(() => window.__skel) === 0, 'دليل البرامج لا يعرض هيكل التحميل في التحديث الحي');
// السمة الداكنة قبل الرسم الأول
const d = await b.newContext({ colorScheme: 'dark' });
const dp = await d.newPage();
await dp.addInitScript(() => { window.__firstTheme = null; document.addEventListener('readystatechange', () => { if (window.__firstTheme === null) window.__firstTheme = document.documentElement.dataset.theme; }); });
await dp.goto(U + '#home'); await dp.waitForSelector('#app .wrap, #app section');
ok(await dp.evaluate(() => window.__firstTheme) === 'dark', 'الوضع الداكن مضبوط قبل ظهور الصفحة');
await d.close();
// الأمان: CSP في كل صفحة، والمكتبات من الموقع نفسه، ولا مخالفات
for (const page of ['index.html', 'admin/index.html', 'student/index.html', 'teacher/index.html', 'guardian/index.html']) {
  const html = readFileSync(new URL('../dist/' + page, import.meta.url), 'utf8');
  ok(/http-equiv="Content-Security-Policy"/.test(html) && /object-src 'none'/.test(html) && /name="referrer"/.test(html), `CSP وسياسة الإحالة في ${page}`);
  ok(!/cdnjs|jsdelivr/.test(html) && /vendor\/supabase-2\.119\.0\.min\.js/.test(html), `المكتبات محلية في ${page}`);
}
for (const path of ['admin/', 'student/', 'teacher/', 'guardian/']) {
  const q = await ctx.newPage(); q.on('pageerror', e => errs.push(path + ': ' + e.message));
  q.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(path + ': ' + m.text()); });
  await q.goto(U + path); await q.waitForTimeout(1200);
  ok(await q.evaluate(() => typeof window.supabase?.createClient === 'function'), `مكتبة Supabase المحلية محمّلة (${path})`);
  await q.close();
}
ok(await p.evaluate(() => typeof window.Chart === 'function' && typeof window.QRCode === 'function'), 'مكتبتا الرسوم والباركود المحليتان محمّلتان');
ok(external.length === 0, 'لا طلبات إلى خوادم المكتبات الخارجية: ' + external.join(' '));
ok(csp.length === 0, 'لا مخالفات لسياسة أمان المحتوى: ' + csp.slice(0, 3).join(' | '));
ok(errs.length === 0, 'لا أخطاء: ' + errs.slice(0, 3).join(' | '));
await b.close(); server.close();
if (failed()) process.exit(1);
console.log('PASS security_flicker');
