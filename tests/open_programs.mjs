// الخطوة AA: كل البرامج متاحة للتسجيل (المبدئي عند غياب الدفعة المفتوحة)، ونقل الطلبات إلى الدفعة، وشاشة جلسات اليوم بالباركود الموحد
import { chromium } from 'playwright';
import { serveDist, reporter, autoConsent } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.addInitScript(() => { try { localStorage.setItem('sama_skip_reg_intro', '1'); } catch {} });   // شاشة التعليمات تُختبر في home_courses
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const put = fn => p.evaluate(src => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); (0, eval)(src)(D); localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); }, fn.toString()).then(() => p.reload());
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();

await p.goto(U + '#enroll'); await p.waitForSelector('#en-item');
// لا دفعات مفتوحة إطلاقًا: كل البرامج النشطة تظهر للتسجيل المبدئي
await put(D => { D.cohorts.forEach(c => { c.reg_open = false; }); });
await p.waitForSelector('#en-item');
let D = await data(); const nActive = D.programs.filter(x => x.active !== false).length;
const opts = await p.$$eval('#en-item option', o => o.map(x => x.textContent));
ok(opts.length - 1 === nActive && opts.slice(1).every(x => /تسجيل مبدئي/.test(x)), `كل البرامج النشطة (${nActive}) في قائمة التسجيل، بوسم «تسجيل مبدئي»`);
await p.selectOption('#en-item', { index: 1 });
ok(/سجّل مبدئيًا/.test(await text('#en-info')), 'شرح التسجيل المبدئي تحت القائمة');
await p.fill('[name=full_name]', 'ماجد سالم علي الحربي'); await p.fill('[name=national_id]', '1000000495'); await p.fill('[name=phone]', '0556660021');
await p.selectOption('[name=gender]', 'ذكر'); await p.fill('[name=birth_date]', '1995-03-01', { timeout: 400 }).catch(() => {}); await p.dispatchEvent('[name=birth_date]', 'change');
await p.selectOption('[name=city]', { index: 1 }, { timeout: 400 }).catch(() => {}); await p.selectOption('[name=education]', { index: 1 }, { timeout: 400 }).catch(() => {}); await p.check('[name=agree]');
await autoConsent(p); await p.click('#rfGo'); await p.waitForSelector('.refbox');
ok(/اكتمل تسجيلك المبدئي/.test(await text('#regCard')) && /^SR-/.test(await text('.refbox')), 'رسالة التسجيل المبدئي برقم الطلب');
D = await data(); const t = D.trainees.find(x => x.national_id === '1000000495'); const rq = D.program_requests.find(r => r.trainee_id === t?.id);
ok(rq && rq.status === 'pending' && !(D.orders || []).some(o => o.trainee_id === t.id), 'الطلب محفوظ معلّقًا، ولا طلب شراء قبل الدفعة');

// الصفحة الرئيسية ودليل البرامج: لا «دفعات مفتوحة الآن» صفرية
await p.goto(U + '#home'); await p.waitForTimeout(800);
ok(!/دفعات مفتوحة الآن/.test(await text('#app')) && /متاحًا للتسجيل/.test(await text('#app')), 'الرئيسية تعرض البرامج المتاحة للتسجيل');
const prog = D.programs.find(x => x.id === rq.program_id);
await p.goto(U + '#' + (prog.code || ('p' + prog.accreditation_no))); await p.waitForTimeout(800);
ok(/التسجيل المبدئي في البرنامج/.test(await text('#pBody')) && !!(await p.$('#rf')), 'صفحة البرنامج بلا دفعة: نموذج تسجيل مبدئي');

// الإدارة: الطلب ظاهر، ولا يُنقل قبل فتح دفعة، ثم يُنقل فيُنشأ التسجيل وطلب الشراء
await p.goto(U + 'admin/#admin'); await p.waitForSelector('#lf'); await p.fill('[name=p]', '1234'); await p.click('#lfGo'); await p.waitForTimeout(1000);
await put(D => { const r = D.program_requests[0]; D.cohorts.filter(c => c.program_id === r.program_id).forEach(c => { c.archived_at = new Date().toISOString(); }); });
await p.goto(U + 'admin/#admin-cohorts'); await p.waitForTimeout(900);
ok(/طلبات التسجيل المبدئي/.test(await text('#main')) && /ماجد سالم/.test(await text('#reqCard')) && !(await p.$('[data-rqall]')), 'الطلب في صفحة الدفعات مع «افتح دفعة للبرنامج»');
await put(D => { const r = D.program_requests[0], d = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  D.cohorts.push({ id: 'c-aa', program_id: r.program_id, number: 99, start_date: d, end_date: d, days: [0,1,2,3,4,5,6], start_time: '16:00', end_time: '19:00', seats: 20, reg_open: true, archived_at: null, created_at: new Date().toISOString() }); });
await p.goto(U + 'admin/#admin-cohorts'); await p.waitForTimeout(900);
await p.click('[data-rqall]'); await p.waitForTimeout(800);
D = await data(); const r2 = D.program_requests[0];
ok(r2.status === 'placed' && D.enrollments.some(e => e.id === r2.enrollment_id && e.cohort_id === 'c-aa') && D.orders.some(o => (o.enrollment_ids || []).includes(r2.enrollment_id)), 'النقل ينشئ التسجيل في الدفعة وطلب الشراء');
ok(!(await p.$('#reqCard')), 'لا طلبات معلّقة بعد النقل');

// شاشة محاضرات اليوم: الباركود الموحد وجلسات الباقات
await put(D => { const dow = new Date(Date.now() + 3 * 3600e3).getUTCDay(); D.schedule_exceptions = []; D.schedule_templates = [{ id: 't1', section: 'boys', dow, start: '00:00', end: '23:59' }, { id: 't2', section: 'girls', dow, start: '00:00', end: '23:59' }]; });
await p.goto(U + 'admin/#display'); await p.waitForTimeout(900);
const disp = await text('#app');
ok(!!(await p.$('#uQR')) && !!(await p.$('a[href="#qr-checkin"]')) && /باركود الحضور الموحد/.test(disp), 'الباركود الموحد في رأس الشاشة');
ok(/القدرات والتحصيلي · البنون/.test(disp) && /القدرات والتحصيلي · البنات/.test(disp), 'جلستا قسمي الباقات اليوم ظاهرتان');
ok(!/افتح باركود البرنامج على شاشة القاعة/.test(disp), 'لا رسالة باركود البرنامج القديمة');
await p.click('[data-sheet^="pkg:boys"]'); await p.waitForSelector('#printRoot.on .pdoc', { timeout: 4000 }).catch(() => {});
const sheet = await text('#printRoot');
ok(/كشف الحضور اليومي/.test(sheet) && /باقات القدرات والتحصيلي/.test(sheet) && /البنون/.test(sheet) && /التوقيع/.test(sheet), 'زر الجلسة يفتح كشف حضور اليوم للقسم جاهزًا للطباعة');
await p.click('#pbBack'); await p.waitForTimeout(300);
await p.goto(U + 'admin/#admin-reports'); await p.waitForTimeout(900);
ok(/باقات القدرات والتحصيلي · البنون/.test(await p.$eval('#r1c', s => s.textContent)), 'التقارير: كشف يوم سابق لأقسام الباقات أيضًا');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs[0] : ''));
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
