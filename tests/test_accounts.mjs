// الخطوة BA: البند 5.1 (تصفية «حضور اليوم» بالباقة) والبند 13 (حسابات تجريبية معزولة is_test)
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
import { createServer } from 'vite';
// وحدات الواجهة تستورد صورًا ومتغيرات البيئة؛ تُحمَّل عبر Vite (SSR)
const vs = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
const { quduratAnalytics } = await vs.ssrLoadModule('/src/qudurat.js');
const { buildDailyReport } = await vs.ssrLoadModule('/src/report_logic.js');
const { absentees } = await vs.ssrLoadModule('/src/absence_notify.js');
const { paymentRows } = await vs.ssrLoadModule('/src/payments_summary.js');
const { validSaudiId, riyadhNow } = await import('../src/utils.js');
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const admin = async r => { await p.goto(U + 'admin/#' + r); await p.reload(); await p.waitForTimeout(500);
  if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); } await p.waitForSelector('#main'); };

/* 5.1 تصفية حضور اليوم بالباقة */
await admin('admin-qudurat'); await p.click('[data-qt="today"]'); await p.waitForSelector('#tdp');
const opts = await p.$$eval('#tdp option', o => o.map(x => ({ v: x.value, t: x.textContent })));
ok(opts.length > 1 && opts[0].v === '', 'قائمة الباقات في حضور اليوم');
const pick = opts[1]; await p.selectOption('#tdp', pick.v); await p.waitForTimeout(300);
const planCells = await p.$$eval('#qBody table tbody tr td:nth-child(2)', c => c.map(x => x.textContent.trim()));
ok(planCells.every(x => x === pick.t), 'الصفوف المعروضة من الباقة المختارة وحدها');
const sums = await p.$$eval('[data-tdsum]', s => s.map(x => x.textContent));
ok(sums.every(x => x.includes('باقة ' + pick.t)), 'ملخص الحضور للباقة المختارة');
await p.selectOption('#tdp', ''); await p.waitForTimeout(200);

/* 13 الحسابات التجريبية */
await admin('admin-trainees'); await p.waitForSelector('#taBox');
await p.click('#taBox summary'); await p.fill('#ta-n', 'تجربة العرض الأولى'); await p.fill('#ta-ph', '0557778881');
await p.click('#taAdd'); await p.waitForTimeout(800);
let D = await data(); const tt = D.trainees.find(t => t.is_test);
ok(tt && tt.full_name.includes('(تجريبي)') && !validSaudiId(tt.national_id), 'حساب تجريبي بهوية لا تجتاز التحقق');
const ts = D.subscriptions.find(s => s.trainee_id === tt.id);
ok(ts && ts.status === 'active' && !(D.orders || []).some(o => o.trainee_id === tt.id), 'اشتراك قائم بلا طلب شراء');
ok(await p.isVisible(`[data-tap="${tt.id}"]`), 'يظهر في قائمة الحسابات التجريبية');

// العزل: النتائج مع الحساب التجريبي = النتائج بدونه
const NOW = riyadhNow(), today = NOW.date;
const without = JSON.parse(JSON.stringify(D)); without.trainees = without.trainees.filter(t => t.id !== tt.id); without.subscriptions = without.subscriptions.filter(s => s.trainee_id !== tt.id);
const same = (f, l) => { const A=JSON.stringify(f(D)), B=JSON.stringify(f(without)); if(A!==B){ let i=0; while(A[i]===B[i]) i++; console.log(l, A.slice(i-150,i+80), '\n---\n', B.slice(i-150,i+80)); } return ok(JSON.stringify(f(D)) === JSON.stringify(f(without)), l); };
same(x => quduratAnalytics(x, today, today, NOW), 'التحليلات تستبعد التجريبي');
ok(!JSON.stringify(buildDailyReport(D, today, NOW)).includes(tt.full_name), 'تقرير اليوم يستبعد التجريبي');
same(x => absentees(x, 'pkg', ts.section, today).rows, 'رسائل الغياب تستبعد التجريبي');
same(x => paymentRows(x).map(r => r.id), 'ملخص المدفوعات يستبعد التجريبي');

// جوال حساب حقيقي مرفوض
const real = D.trainees.find(t => !t.is_test && t.phone);
await p.fill('#ta-ph', real.phone); await p.click('#taAdd'); await p.waitForTimeout(500);
ok(/لحساب حقيقي/.test(await p.textContent('#taE')), 'جوال حساب حقيقي مرفوض');

// التحضير يقبل هوية الحساب التجريبي (قرار المالك 18 نوفمبر: فحص الصيغة فقط)
await p.goto(U + '#checkin'); await p.reload(); await p.waitForSelector('#nid');
await p.fill('#nid', tt.national_id); await p.click('#cBtn'); await p.waitForTimeout(900);
ok(!/رقم السجل غير صحيح/.test(await p.textContent('#cErr')), 'التحضير لا يرفض هوية الحساب التجريبي بالصيغة');
await p.reload(); await p.waitForSelector('#nid'); await p.fill('#nid', '3123456789'); await p.click('#cBtn'); await p.waitForTimeout(300);
ok(/رقم السجل غير صحيح/.test(await p.textContent('#cErr')), 'الصيغة الخاطئة ما زالت مرفوضة');
// الخطوة BN: رفض التحضير لا يكشف اسم صاحب الهوية (لا جلسة الآن لحساب حقيقي)
const realT = (await data()).trainees.find(t => !t.is_test && (D.subscriptions || []).some(x => x.trainee_id === t.id));
if (realT) { const rr = await p.evaluate(async nid => { const S = window.__SAMA__?.LocalStore; if (!S) return null; return S.checkin(nid, null, null, { device:'t' }); }, realT.national_id);
  if (rr) ok(rr.ok || !('name' in rr), 'رفض التحضير بلا اسم المتدرب'); }
await admin('admin-trainees'); await p.waitForSelector('#taBox'); await p.click('#taBox summary');

// الإزالة: التجريبي وحده
const before = (await data()).trainees.filter(t => !t.is_test).length;
await p.click(`[data-tap="${tt.id}"]`); await p.click('#mo'); await p.waitForTimeout(800);
D = await data();
ok(!D.trainees.some(t => t.id === tt.id) && !D.subscriptions.some(s => s.trainee_id === tt.id), 'أُزيل الحساب التجريبي واشتراكه');
ok(D.trainees.filter(t => !t.is_test).length === before, 'الحسابات الحقيقية لم تتأثر');
ok(!(await p.$$('[data-tap]')).length, 'زر الإزالة للحسابات التجريبية وحدها');
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close(); await vs.close();
if (failed()) process.exit(1);
