// الخطوة P: الإدارة تسند الدفعة لمدرب مسجّل، فيرى كشفها وحضورها في بوابته، ويظهر اسمه في بوابة المتدرب
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const login = async (role, phone) => { await p.goto(U + role + '/'); await p.waitForTimeout(700);
  if (await p.$('#logoutBtn:not([hidden])')) { await p.click('#logoutBtn'); await p.waitForTimeout(400); }
  await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(900); };

await p.goto(U); await p.waitForTimeout(800);
let D = await data();
const kid = D.trainees.find(t => t.phone === '0550000003');                       // متدرب برنامج تدريبي تجريبي
const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
const enr = D.enrollments.find(e => e.trainee_id === kid.id && e.status !== 'ملغى' && D.cohorts.some(c => c.id === e.cohort_id && !c.archived_at && c.start_date <= today && c.end_date >= today));
if (!enr) throw new Error('لا توجد دفعة جارية مرتبطة بمتدرب البرامج التجريبي');
const co = D.cohorts.find(c => c.id === enr.cohort_id);
const T = D.teachers.find(t => t.phone === '0501000003');

// مدرب جديد للبرامج فقط (بلا مقررات)، ثم إسناد الدفعة
await p.goto(U + 'admin/#admin-users'); await p.waitForTimeout(900);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
await p.click('#tAdd'); await p.waitForTimeout(300); await p.check('#tf [name=kind][value=programs]'); await p.fill('#tf-name', 'سلطان فهد علي الدوسري'); await p.fill('#tf-phone', '0501000077'); await p.click('#tfS'); await p.waitForTimeout(800);
D = await data(); const PT = D.teachers.find(t => t.phone === '0501000077');
ok(PT && PT.active !== false && !PT.subjects.length, 'إضافة مدرب برامج بلا مقررات');
await p.goto(U + 'admin/#admin-cohorts'); await p.waitForTimeout(900);
await p.evaluate(id => { const b = document.querySelector(`[data-ec="${id}"]`); if (b) b.click(); }, co.id); await p.waitForTimeout(400);
if (!(await p.$('#cm'))) { await p.fill('input[type=search], #cq', '').catch(() => {}); await p.evaluate(id => { document.querySelector(`[data-cv="${id}"]`)?.click(); }, co.id); await p.waitForTimeout(600); await p.evaluate(id => document.querySelector(`[data-ec="${id}"]`)?.click(), co.id); await p.waitForTimeout(400); }
ok(await p.$('#cm [name=teacher_id]'), 'نموذج الدفعة فيه قائمة المدربين المسجلين');
await p.selectOption('#cm [name=teacher_id]', PT.id); await p.waitForTimeout(100);
ok(await p.inputValue('#cm [name=trainer]') === 'سلطان فهد علي الدوسري', 'اختيار المدرب يملأ اسمه في الكشوف');
await p.click('#cm button.pri'); await p.waitForTimeout(900);
D = await data();
ok(D.cohorts.find(c => c.id === co.id).teacher_id === PT.id, 'حفظ ربط المدرب بالدفعة');

// بوابة المدرب: دفعته وكشفها
await login('teacher', '0501000077');
const body = await text('#app');
ok(/الدفعة/.test(body) && body.includes(kid.full_name) && !/كشف اليوم/.test(body), 'مدرب البرامج يرى دفعته وكشفها مباشرة دون تبويبات الباقات');
ok(!body.includes(kid.national_id) && !body.includes(kid.phone), 'الكشف بلا السجل المدني والجوال');
const scope = await p.evaluate(async () => (await window.__SAMA__?.Store?.portalData?.('teacher')) || null).catch(() => null);
ok(!scope || (scope.cohort_trainees.every(t => !t.phone && !t.national_id) && scope.cohorts.length === 1), 'بيانات المدرب محصورة بدفعته وأسماء متدربيها');

// مدرب باقات لا دفعة له: لا يرى تبويب الدفعات
await login('teacher', T.phone);
ok(!(await p.$('[data-tt="cohorts"]')) && await p.$('[data-tt="today"]'), 'مدرب الباقات بلا دفعات لا يرى تبويب الدفعات');

// المتدرب يرى اسم مدربه
await login('student', kid.phone);
ok(/المدرب: سلطان فهد علي الدوسري/.test(await text('#app')), 'المتدرب يرى اسم مدرب دفعته');

ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
