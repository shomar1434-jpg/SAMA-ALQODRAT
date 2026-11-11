// باقات القدرات والتحصيلي: الشريط، والاشتراك، والباركود الموحد، ولوحة الإدارة.
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
const go = async (h, w = 900) => { await p.evaluate(() => { location.hash = '#zz'; }); await p.waitForTimeout(150); await p.evaluate(x => { location.hash = '#' + x; }, h); await p.waitForTimeout(w); };
const S = (fn, arg) => p.evaluate(fn, arg);
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();

await p.goto(U + '#home'); await p.waitForTimeout(1500);

// ---------- الشريط في الرئيسية ----------
ok(await p.$$eval('#plMq .pl-card:not([aria-hidden])', x => x.length) === 5, 'الشريط يعرض 4 باقات حضورية + المخصصة');
ok(await p.$('#plMq [data-mq=toggle]'), 'زر إيقاف الحركة موجود');
await p.click('.pl-filter [data-mode=remote]'); await p.waitForTimeout(500);
const soon = await p.$$eval('#plMq .pl-card:not([aria-hidden])', x => x.map(c => c.classList.contains('soon') && c.getAttribute('aria-disabled') === 'true'));
ok(soon.length === 4 && soon.every(Boolean), 'باقات عن بُعد: 4 بطاقات «قريبًا» معطّلة');
await p.focus('#plMq .pl-card:not([aria-hidden])'); await p.keyboard.press('Enter'); await p.waitForTimeout(400);
ok(!p.url().includes('#plan-'), 'النقر على باقة عن بُعد لا يفتح التسجيل');

// ---------- صفحة الباقة والاشتراك ----------
const ids = await S(() => { const P = window.__SAMA__.LocalStore.data.plans; return { silver: P.find(x => x.tier === 'silver' && x.mode === 'in_person').id, remote: P.find(x => x.mode === 'remote').id }; });
await go('plan-' + ids.remote); ok(/قريبًا/.test(await text('#plReg')) && !(await p.$('#rf')), 'صفحة باقة عن بُعد بلا نموذج تسجيل');
const nid = await S(() => window.__SAMA__.makeSaudiId('1'));
const subscribe = async () => {
  await go('plan-' + ids.silver);
  await p.fill('[name=full_name]', 'سلمان أحمد علي الشهري'); await p.fill('[name=national_id]', nid); await p.fill('[name=phone]', '0551112233');
  await p.selectOption('[name=gender]', 'ذكر'); await p.selectOption('[name=city]', { index: 1 }); await p.selectOption('[name=education]', { index: 1 });
  await p.check('[name=agree]'); await p.click('#rfGo'); await p.waitForTimeout(700);
};
await subscribe(); ok(await p.$('.refbox') && /البنون/.test(await text('#regCard')), 'الاشتراك في الفضية يحدد قسم البنين ومواعيده');
const sub = () => S(n => { const D = window.__SAMA__.LocalStore.data; const t = D.trainees.find(x => x.national_id === n); return D.subscriptions.filter(s => s.trainee_id === t.id); }, nid);
ok((await sub())[0]?.start_date === null, 'الاشتراك «بانتظار أول حضور» قبل التحضير');
await subscribe(); ok(!(await p.$('.refbox')) && /مشترك مسبقًا/.test(await text('#rfE')), 'منع الاشتراك المكرر في الباقة نفسها');

// ---------- الباركود الموحد ----------
// جلسة للبنين الآن (تعديل قالب اليوم في البيانات التجريبية)
await S(() => { const { LocalStore, riyadhNow } = window.__SAMA__; const D = LocalStore.data, n = riyadhNow(); const m = +n.hm.slice(0, 2) * 60 + +n.hm.slice(3);
  const f = x => `${String(Math.floor(x / 60)).padStart(2, '0')}:${String(x % 60).padStart(2, '0')}`;
  D.schedule_templates = D.schedule_templates.filter(x => !(x.section === 'boys' && x.dow === n.dow));
  D.schedule_templates.push({ id: 'tnow', section: 'boys', dow: n.dow, start: f(Math.max(0, m - 5)), end: f(Math.min(1439, m + 110)) }); LocalStore.save(); });
const checkin = async (id, w = 600) => { await go('checkin', 700); await p.fill('#nid', id); await p.click('#cBtn'); await p.waitForTimeout(w); return text('#cRes'); };
const r1 = await checkin(nid);
const s1 = (await sub())[0], today = await S(() => window.__SAMA__.riyadhNow().date);
ok(/سُجّل حضورك/.test(r1) && /بدأ اشتراكك اليوم/.test(r1), 'أول حضور بالباركود الموحد يبدأ الاشتراك');
ok(s1.start_date === today && s1.end_date > today && s1.status === 'active', 'البداية = اليوم، والنهاية محسوبة (3 أشهر)');
const r2 = await checkin(nid);
const cnt = await S(id => window.__SAMA__.LocalStore.data.sub_attendance.filter(a => a.subscription_id === id).length, s1.id);
ok(/مسبقًا/.test(r2) && cnt === 1, 'المسح المكرر = يوم حضور واحد');

// طالب له اشتراك وتسجيل دفعة في الوقت نفسه ← يختار
const both = await S(() => { const { LocalStore, cohortArchived, enrollsOf, riyadhNow } = window.__SAMA__; const D = LocalStore.data, n = riyadhNow();
  const c = D.cohorts.find(c => !cohortArchived(c) && c.start_date <= n.date && enrollsOf(D, c.id).some(e => !D.attendance.some(a => a.enrollment_id === e.id && a.att_date === n.date)));
  c.days = [0, 1, 2, 3, 4, 5, 6]; const h = +n.hm.slice(0, 2); c.start_time = String(h).padStart(2, '0') + ':00'; c.end_time = String(Math.min(h + 2, 23)).padStart(2, '0') + ':59';
  const e = enrollsOf(D, c.id).find(e => !D.attendance.some(a => a.enrollment_id === e.id && a.att_date === n.date)); const t = D.trainees.find(x => x.id === e.trainee_id);
  D.subscriptions.push({ id: 'sboth', ref: 'SQ-1', trainee_id: t.id, plan_id: D.plans.find(x => x.tier === 'basic' && x.mode === 'in_person').id, section: 'boys', subjects: [], status: 'pending', start_date: null, end_date: null });
  LocalStore.save(); return t.national_id; });
await checkin(both);
ok(await p.$$eval('[data-ch]', x => x.length) === 2, 'عند التعدد يختار الطالب بين برنامجين');
await p.click('[data-ch]'); await p.waitForTimeout(600);
ok(/سُجّل حضورك/.test(await text('#cRes')), 'التحضير بعد الاختيار');

// ---------- حضوري ----------
await go('me'); await p.fill('[name=nid]', nid); await p.click('#mGo'); await p.waitForTimeout(600);
ok(/قسم البنون/.test(await text('#mRes')) && await p.$('.mecard .me-rate'), 'حضوري يعرض اشتراك الباقة ونسبته');

// ---------- الإدارة ----------
await go('admin', 900); await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200);
await go('admin-qudurat', 1200);
ok(/تحضير متعدد من جهاز واحد/.test(await text('#main')), 'تنبيه التحضير من جهاز واحد لأكثر من طالب');
ok(await p.$$eval('#qBody tbody tr', x => x.length) > 10, 'قائمة المشتركين');

// إضافة طالب حالي بتاريخ بداية فعلي
const nid2 = await S(() => window.__SAMA__.makeSaudiId('1'));
const past = await S(() => { const d = new Date(); d.setDate(d.getDate() - 20); return d.toISOString().slice(0, 10); });
await p.click('#qAdd'); await p.waitForTimeout(300);
await p.fill('#sm-nid', nid2); await p.fill('#sm-name', 'نورة علي محمد الحازمي'); await p.fill('#sm-phone', '0559998877'); await p.selectOption('#sm-gender', 'أنثى');
await p.selectOption('#sm-plan', { label: 'الذهبية' }); await p.fill('#sm-start', past); await p.click('#smS'); await p.waitForTimeout(800);
const s2 = await S(n => { const D = window.__SAMA__.LocalStore.data; const t = D.trainees.find(x => x.national_id === n); return D.subscriptions.find(s => s.trainee_id === t?.id); }, nid2);
ok(s2 && s2.section === 'girls' && s2.start_date === past && s2.start_manual && s2.status === 'active', 'إضافة طالبة حالية بتاريخ بداية يدوي وقسم البنات');

// الاستيراد من Excel: صف سليم وصف خاطئ
const nid3 = await S(() => window.__SAMA__.makeSaudiId('1'));
await p.click('#qImp'); await p.waitForTimeout(300);
await p.fill('#imT', `${nid3}\tفهد سعيد علي القحطاني\t0553334444\tذكر\tالأساسية\t${past}\n123\tاسم\t\tذكر\tغير موجودة`);
await p.click('#imV'); await p.waitForTimeout(300);
ok(/1 صفًا سليمًا|١ صفًا سليمًا/.test(await text('#imP')), 'معاينة الاستيراد تكشف الصف الخاطئ');
await p.click('#imS'); await p.waitForTimeout(900);
ok(await S(n => !!window.__SAMA__.LocalStore.data.trainees.find(x => x.national_id === n), nid3), 'استيراد الصف السليم');

// السجل والتعديل اليدوي الموثّق
await go('admin-qudurat', 900); await p.fill('#qq', 'نورة علي محمد'); await p.waitForTimeout(700);
await p.click('[data-sv]'); await p.waitForTimeout(500);
const before = await S(id => window.__SAMA__.LocalStore.data.sub_attendance.filter(a => a.subscription_id === id).length, s2.id);
await p.click('.dg.abs'); await p.waitForTimeout(600);
const after = await S(id => window.__SAMA__.LocalStore.data.sub_attendance.filter(a => a.subscription_id === id).length, s2.id);
ok(after === before + 1, 'تعديل يوم غياب إلى حضور من السجل');
ok(await S(() => window.__SAMA__.LocalStore.data.audit_logs.some(a => a.action === 'attendance.manual')), 'التعديل اليدوي مسجّل في سجل التدقيق');
await p.click('#sdX').catch(() => {});

// استثناء: إلغاء جلسة اليوم للبنين
await go('admin-qudurat', 600); await p.click('[data-qt=schedule]'); await p.waitForTimeout(500);
await p.click('#exAdd'); await p.waitForTimeout(300); await p.selectOption('#ex-sec', 'boys'); await p.selectOption('#ex-type', 'cancel'); await p.fill('#ex-note', 'اختبار'); await p.click('#exF button.pri'); await p.waitForTimeout(700);
await p.click('[data-qt=today]'); await p.waitForTimeout(500);
ok(/لا توجد جلسة اليوم/.test(await text('#qBody')), 'الاستثناء يلغي جلسة اليوم في الكشف');

// تعديل سعر باقة
await p.click('[data-qt=plans]'); await p.waitForTimeout(500);
await p.click(`[data-pe="${ids.silver}"]`); await p.waitForTimeout(300); await p.fill('#pm-reg', '700'); await p.click('#pmS'); await p.waitForTimeout(700);
ok(await S(id => window.__SAMA__.LocalStore.data.plans.find(x => x.id === id).reg_fee, ids.silver) === 700, 'تعديل رسوم الباقة');

// الباركود الموحد
await go('qr-checkin', 1200);
ok(/#checkin$/.test(await text('.display .hint[dir=ltr]')), 'شاشة الباركود الموحد تشير إلى صفحة التحضير العامة');

ok(errs.length === 0, 'لا أخطاء في الصفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
