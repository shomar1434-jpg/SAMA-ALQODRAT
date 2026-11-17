// اختبار المسارات الكاملة في الوضع التجريبي: التسجيل، والتحضير، والإدارة، والأرشفة، والشهادات، والطباعة، والتصدير.
import { chromium } from 'playwright';
import { serveDist, reporter, autoConsent } from './_server.mjs';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 }, acceptDownloads: true });
const p = await ctx.newPage();
await p.addInitScript(() => { try { localStorage.setItem('sama_skip_reg_intro', '1'); } catch {} });   // شاشة التعليمات تُختبر في home_courses
const errs = []; p.on('pageerror', e => errs.push(e.message));
const go = async (h, w = 900) => { await p.evaluate(() => { location.hash = '#zz'; }); await p.waitForTimeout(150); await p.evaluate(x => { location.hash = '#' + x; }, h); await p.waitForTimeout(w); };
const S = (fn, arg) => p.evaluate(fn, arg);
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();

await p.goto(U + '#home'); await p.waitForTimeout(1200);

// ---------- التسجيل ----------
const openCode = await S(() => { const { LocalStore, cohortArchived, progCode, takenOf } = window.__SAMA__; const D = LocalStore.data;
  const c = D.cohorts.find(c => !cohortArchived(c) && c.reg_open && takenOf(D, c.id) < c.seats); return progCode(D.programs.find(x => x.id === c.program_id)); });
const nid = await S(() => window.__SAMA__.makeSaudiId('1'));
const fillReg = async () => {
  await go(openCode, 800); await p.waitForSelector('.tab[data-t=reg]', { timeout:10000 }); await p.click('.tab[data-t=reg]'); await p.waitForSelector('[name=full_name]', { timeout:10000 });
  await p.fill('[name=full_name]', 'يحيى محمد علي الحكمي'); await p.fill('[name=national_id]', nid); await p.fill('[name=phone]', '0551234567');
  await p.selectOption('[name=gender]', 'ذكر'); await p.fill('[name=birth_date]', '1995-01-01', { timeout: 400 }).catch(() => {}); await p.selectOption('[name=city]', { index: 1 }, { timeout: 400 }).catch(() => {}); await p.selectOption('[name=education]', { index: 1 }, { timeout: 400 }).catch(() => {});
  await p.check('[name=agree]'); if (await p.$('#rf-pol')) await p.check('#rf-pol'); await autoConsent(p); await p.click('#rfGo'); await p.waitForTimeout(700);
};
await fillReg(); ok(await p.$('.refbox'), 'تسجيل متدرب جديد في دفعة مفتوحة');
await fillReg(); ok((await text('#rfE')) !== '' && !(await p.$('.refbox')), 'منع التسجيل المكرر في الدفعة نفسها');

// ---------- التحضير ----------
const info = await S(() => { const { LocalStore, cohortArchived, enrollsOf, progCode, riyadhNow } = window.__SAMA__; const D = LocalStore.data, n = riyadhNow();
  const free = c => enrollsOf(D, c.id).filter(e => !D.attendance.some(a => a.enrollment_id === e.id && a.att_date === n.date));
  const c = D.cohorts.find(c => !cohortArchived(c) && c.start_date <= n.date && free(c).length > 0 && enrollsOf(D, c.id).length > 3);
  c.days = [0, 1, 2, 3, 4, 5, 6]; const h = +n.hm.slice(0, 2); c.start_time = String(h).padStart(2, '0') + ':00'; c.end_time = String(Math.min(h + 2, 23)).padStart(2, '0') + ':59';
  const es = free(c);
  const t = D.trainees.find(x => x.id === es[0].trainee_id);
  const other = D.cohorts.find(x => x.id !== c.id && x.program_id !== c.program_id && !cohortArchived(x));
  const ot = D.trainees.find(x => enrollsOf(D, other.id).some(e => e.trainee_id === x.id) && !enrollsOf(D, c.id).some(e => e.trainee_id === x.id));
  LocalStore.save(); return { code: progCode(D.programs.find(x => x.id === c.program_id)), cid: c.id, nid: t.national_id, other: ot.national_id }; });
const ck = async id => { await go(info.code, 700); await p.click('.tab[data-t=att]'); await p.waitForTimeout(300); await p.fill('#nid', id); await p.click('#cBtn'); await p.waitForTimeout(500); return text('#cRes'); };
const r1 = await ck(info.nid); ok(/تم|سُجّل|حضور/.test(r1), 'تحضير متدرب من كشف الدفعة');
const attCount = () => S(n => { const { LocalStore } = window.__SAMA__; const D = LocalStore.data; const t = D.trainees.find(x => x.national_id === n); return D.attendance.filter(a => D.enrollments.some(e => e.id === a.enrollment_id && e.trainee_id === t.id)).length; }, info.nid);
const before = await attCount(); await ck(info.nid); ok(await attCount() === before, 'المسح المكرر في اليوم نفسه لا ينشئ حضورًا ثانيًا');
const r3 = await ck(info.other); ok(!r3.includes(await S(n => window.__SAMA__.LocalStore.data.trainees.find(x => x.national_id === n).full_name, info.other)), 'رفض متدرب من برنامج آخر دون كشف اسمه');

// ---------- حضور البرنامج في بوابة المتدرب (بدل «حضوري») ----------
await go('me'); ok(await p.evaluate(() => location.hash) === '#portals' && !(await p.$('nav a[href="#me"]')), '«حضوري» تحوّل إلى البوابات ولا رابط لها');
const ph = await S(n => { const D = window.__SAMA__.LocalStore.data, t = D.trainees.find(x => x.national_id === n); if (D.trainees.some(x => x.id !== t.id && x.phone === '0558880001')) return null; t.phone = '0558880001'; window.__SAMA__.LocalStore.save(); return t.phone; }, info.nid);
await p.goto(U + 'student/'); await p.waitForTimeout(700); await p.fill('#pl-phone', ph); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(1500);
const pt = p.locator('.tab[data-si]').filter({ has: p.locator('svg') }); if (!(await p.$('.prog-head')) && await pt.count()) for (let i = 0; i < await pt.count(); i++) { await pt.nth(i).click(); await p.waitForTimeout(300); if (await p.$('.prog-head')) break; }
ok(await p.$('.prog-head') && /نسبة الإنجاز في البرنامج/.test(await p.innerText('#app')) && /نسبة الحضور/.test(await p.innerText('#app')), 'متدرب البرنامج يرى حضوره وإنجازه في البوابة');
await p.click('#logoutBtn').catch(() => {}); await p.goto(U + '#home'); await p.waitForTimeout(800);

// ---------- الإدارة (صفحة /admin/) ----------
await go('admin', 1000); ok(p.url().startsWith(U + 'admin/'), 'الانتقال إلى صفحة الإدارة');
await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1500);
ok(await p.$('#main .kpis, #main canvas'), 'لوحة التحليلات بعد الدخول');

await go('admin-cohorts', 1000); await p.click(`[data-cv="${info.cid}"]`); await p.waitForTimeout(1000);
ok(await p.$(`[data-ar="${info.cid}"]`), 'كشف الدفعة يفتح من صفحة الدفعات');

// الطباعة من مركز التقارير
await go('admin-reports', 1000);
for (const id of ['r1', 'r2', 'r3', 'r4', 'r5']) {
  await p.click('#' + id); await p.waitForTimeout(700);
  ok(await p.$$eval('#printRoot .pdoc', x => x.length) > 0, 'معاينة طباعة ' + id);
  await p.click('#pbBack').catch(() => {}); await p.waitForTimeout(300);
}
// التصدير
for (const id of ['r6a', 'r6b']) {
  const dl = p.waitForEvent('download', { timeout: 4000 }).catch(() => null);
  await p.click('#' + id); const d = await dl; await p.waitForTimeout(300);
  if (!d) console.log('   toast:', await text('#toast'), '| overlay:', !!(await p.$('#printRoot .pdoc')));
  // ملاحظة: متصفح الاختبار المختصر يتجاهل أسماء الملفات العربية، فنتحقق من المحتوى لا من الاسم
  const body = d ? (await import('node:fs')).readFileSync(await d.path(), 'utf8') : '';
  ok(body.startsWith('\ufeff') && body.split('\r\n').length > 1, 'تصدير Excel ' + id + ' (CSV بترميز يدعم العربية)');
}

// الأرشفة وإصدار الشهادات
await go('admin-cohorts', 900); if (!(await p.$(`[data-ar="${info.cid}"]`))) { await p.click(`[data-cv="${info.cid}"]`); await p.waitForTimeout(900); }
await p.click(`[data-ar="${info.cid}"]`); await p.waitForTimeout(300); await p.click('#mo'); await p.waitForTimeout(1200);
const arch = await S(c => { const { LocalStore } = window.__SAMA__; const D = LocalStore.data; return { archived: !!D.cohorts.find(x => x.id === c).archived_at, cert: (D.certificates || []).find(x => D.enrollments.some(e => e.id === x.enrollment_id && e.cohort_id === c))?.serial }; }, info.cid);
ok(arch.archived, 'أرشفة الدفعة');

// باركود البرنامج يشير إلى الصفحة العامة لا إلى /admin/
await go('qr-' + openCode, 1200); await p.waitForFunction(() => document.querySelector('[data-qr]') || [...document.querySelectorAll('#app *')].some(e => /^https?:\/\/\S+#p/.test(e.textContent.trim())), null, { timeout:10000 }).catch(() => {});
const qrUrl = await S(() => document.querySelector('[data-qr]')?.dataset.qr || [...document.querySelectorAll('#app *')].map(e => e.textContent).find(t => /^https?:\/\/\S+#p/.test(t.trim()))?.trim() || '');
ok(qrUrl.startsWith(U + '#p'), 'رابط الباركود يشير إلى الصفحة العامة: ' + qrUrl);

// آلية الاحتساب والشركاء
await go('admin-rules', 900); await p.selectOption('#rl-lw', '0.5'); await p.click('#rlS'); await p.waitForTimeout(600);
ok(await S(() => window.__SAMA__.LocalStore.data.settings.late_weight) === 0.5, 'حفظ آلية الاحتساب');
await go('admin-partners', 300); ok(await p.waitForSelector('#ptAdd', {timeout:5000}).catch(() => null), 'صفحة النبذة والشركاء');

// الشهادة والتحقق والتحضير بعد الأرشفة (من الصفحة العامة)
if (arch.cert) { await go('v-' + arch.cert, 1200); ok(!p.url().includes('#v-') && !(await text('#app')).includes(arch.cert), 'صفحة التحقق العامة أُلغيت: المسار القديم يُحال إلى الرئيسية دون بيانات الإفادة'); }
else ok(true, 'لا إفادة مستحقة في هذه الدفعة');
const r4 = await ck(info.nid); ok(!/تم تسجيل حضورك/.test(r4), 'لا تحضير بعد أرشفة الدفعة');

// الشريط والجوال
const m = await ctx.newPage(); await m.setViewportSize({ width: 390, height: 844 }); m.on('pageerror', e => errs.push('m:' + e.message));
await m.addInitScript(() => { try { localStorage.setItem('sama_skip_reg_intro', '1'); } catch {} });   // شاشة التعليمات تُختبر في home_courses
await m.goto(U + '#' + openCode); await m.waitForTimeout(1200); ok(await m.$('.tab[data-t=reg]'), 'صفحة البرنامج على الجوال');

ok(errs.length === 0, 'لا أخطاء في الصفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
