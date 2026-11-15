// الخطوة AN: تاريخ بداية الباقة مرن من سجل الاشتراك، ولكل المعروضين دفعة واحدة
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
await p.goto(U + 'admin/#admin-qudurat'); await p.waitForTimeout(800);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
await p.waitForSelector('[data-sv]');
let D = await data();
const sid = await p.getAttribute('[data-sv]', 'data-sv'), s0 = D.subscriptions.find(x => x.id === sid);
await p.click(`[data-sv="${sid}"]`); await p.waitForSelector('#sdStart');
ok(/تاريخ بداية الباقة/.test(await p.textContent('.modal')), 'محرر تاريخ البداية في سجل الاشتراك');
await p.fill('#sdStart', '2026-09-01'); await p.dispatchEvent('#sdStart', 'change'); await p.waitForTimeout(200);
ok(/النهاية/.test(await p.textContent('#sdEnd')), 'معاينة تاريخ النهاية');
await p.click('#sdSv'); await p.waitForTimeout(900);
D = await data(); let s1 = D.subscriptions.find(x => x.id === sid);
ok(s1.start_date === '2026-09-01' && s1.end_date && s1.end_date !== s0.end_date && s1.start_manual, 'حُفظ تاريخ البداية وأعيد حساب النهاية');
ok(await p.isVisible('#sdStart') && (await p.inputValue('#sdStart')) === '2026-09-01', 'السجل يُعاد فتحه بالتاريخ الجديد');
await p.evaluate(() => { document.querySelector('#modalRoot').innerHTML = ''; });
// الكل دفعة واحدة: باقة واحدة بالتصفية
const plan = D.plans.find(x => x.tier === 'silver' && x.mode === 'in_person');
await p.selectOption('#qp', plan.id); await p.selectOption('#qst', 'all'); await p.waitForTimeout(400);
const n = (await p.$$('[data-sv]')).length;
await p.click('#qBS'); await p.waitForSelector('#bsD');
await p.click('#bsS'); await p.waitForTimeout(200); ok(/اختر تاريخ البداية/.test(await p.textContent('#bsE')), 'يُطلب التاريخ');
await p.fill('#bsD', '2026-10-06'); await p.click('#bsS'); await p.waitForTimeout(1500 + n * 150);
D = await data();
const subs = D.subscriptions.filter(x => x.plan_id === plan.id && x.status !== 'cancelled');
ok(n > 0 && subs.every(x => x.start_date === '2026-10-06' && x.end_date > '2026-10-06'), `طُبّق تاريخ البداية على ${n} اشتراك الباقة المعروضة`);
ok(D.subscriptions.filter(x => x.plan_id !== plan.id).every(x => x.start_date !== '2026-10-06' || x.id === 'none'), 'لم يمس الاشتراكات غير المعروضة');
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
