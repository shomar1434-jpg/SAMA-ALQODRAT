// دليل الاستخدام: زر عائم أسفل يسار الشاشة في الإدارة وبوابتي المدرب والمتدرب، وصفحات الدليل وصورها
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const fab = async () => p.evaluate(() => { const a = document.querySelector('#guideFab'); if (!a || a.hidden) return null; const r = a.getBoundingClientRect(); return { href: a.getAttribute('href'), text: a.textContent.trim(), left: r.left, bottom: innerHeight - r.bottom, target: a.target }; });

await p.goto(U); await p.waitForTimeout(800);
ok(!(await fab()), 'لا زر دليل في الصفحة العامة');
await p.goto(U + 'admin/'); await p.waitForTimeout(800);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
let f = await fab();
ok(f && f.href === '../guide/admin.html' && /دليل الاستخدام/.test(f.text) && f.left < 40 && f.bottom < 40 && f.target === '_blank', 'زر دليل الإدارة أسفل يسار الشاشة ويفتح في نافذة جديدة');
await p.goto(U + 'admin/#display'); await p.waitForTimeout(900);
ok(!(await fab()), 'لا يظهر الزر على شاشة القاعة');
const D = await p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const login = async (role, phone) => { await p.goto(U + role + '/'); await p.waitForTimeout(700); await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(900); };
await p.goto(U + 'teacher/'); await p.waitForTimeout(700); f = await fab();
ok(f && f.href === '../guide/trainer.html', 'زر دليل المدرب ظاهر حتى قبل الدخول');
await login('teacher', D.teachers[0].phone); f = await fab();
ok(f && f.href === '../guide/trainer.html', 'زر دليل المدرب بعد الدخول');
await p.goto(U + 'student/'); await p.waitForTimeout(700); f = await fab();
ok(f && f.href === '../guide/trainee.html', 'زر دليل المتدرب');
for (const g of ['admin', 'trainer', 'trainee']) {
  await p.goto(U + 'guide/' + g + '.html'); await p.waitForLoadState('load');
  await p.evaluate(async () => { for (const i of document.images) { i.loading = 'eager'; } await Promise.all([...document.images].map(i => i.complete ? 0 : new Promise(r => { i.onload = i.onerror = r; }))); });
  const r = await p.evaluate(() => ({ n: document.images.length, broken: [...document.images].filter(i => !i.naturalWidth).map(i => i.src), toc: [...document.querySelectorAll('nav.toc a')].every(a => document.querySelector(a.getAttribute('href'))), back: document.querySelector('.top a').getAttribute('href') }));
  ok(r.n >= 8 && !r.broken.length && r.toc, `دليل ${g}: ${r.n} صورة كلها تعمل والمحتويات مرتبطة` + (r.broken.length ? ' ' + r.broken.join(',') : ''));
  ok(/^\.\.\/(admin|teacher|student)\/$/.test(r.back), `دليل ${g}: رابط العودة إلى المنصة`);
}
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
