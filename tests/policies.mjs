// مركز السياسات: مسودة ← نشر بإصدار، وثبات المنشور، والإصدارات القادمة، وإلزام القبول في التسجيل وتوثيقه.
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const go = async (h, w = 900) => { await p.evaluate(() => { location.hash = '#zz'; }); await p.waitForTimeout(150); await p.evaluate(x => { location.hash = '#' + x; }, h); await p.waitForTimeout(w); };
const S = (fn, arg) => p.evaluate(fn, arg);
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();
const pols = () => S(() => window.__SAMA__.LocalStore.data.policies);

await p.goto(U + '#home'); await p.waitForTimeout(1200);
ok(await p.$('.sfoot a[href="#policies"]'), 'رابط السياسات في تذييل الرئيسية');
await go('policies'); ok(/لم تُنشر السياسات بعد/.test(await text('#app')), 'المسودات لا تظهر للعامة');

// ---------- الإدارة ----------
await p.goto(U + 'admin/#admin-policies'); await p.waitForTimeout(900);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
ok((await p.$$('#main tr[data-slug]')).length === 10, 'عشر سياسات في الإدارة');
const priv = (await pols()).find(x => x.slug === 'privacy');
await p.click(`[data-pp="${priv.id}"]`); await p.waitForTimeout(300); await p.click('.modal .btn.danger, .modal button:has-text("نشر")'); await p.waitForTimeout(600);
ok((await pols()).find(x => x.id === priv.id).status === 'draft', 'لا نشر دون جهة اعتماد');
await p.click(`[data-pe="${priv.id}"]`); await p.waitForTimeout(300);
await p.fill('#pf-a', 'مدير المركز'); await p.click('#pfS'); await p.waitForTimeout(600);
await p.click(`[data-pp="${priv.id}"]`); await p.waitForTimeout(300); await p.click('.modal button:has-text("نشر")'); await p.waitForTimeout(600);
ok((await pols()).find(x => x.id === priv.id).status === 'draft', 'لا نشر والنص فيه أقسام ناقصة');
await p.click(`[data-pe="${priv.id}"]`); await p.waitForTimeout(300);
await p.fill('#pf-b', '## البيانات التي نجمعها\n- الاسم ورقم السجل والجوال\n\nنستخدم بياناتك لتسجيل الحضور فقط.'); await p.click('#pfS'); await p.waitForTimeout(700);
await p.click(`[data-pp="${priv.id}"]`); await p.waitForTimeout(300); await p.click('.modal button:has-text("نشر")'); await p.waitForTimeout(800);
const v1 = (await pols()).find(x => x.id === priv.id);
ok(v1.status === 'published' && v1.version === 1, 'نشر الإصدار الأول');
let threw = await S(id => window.__SAMA__.LocalStore.savePolicy({ ...window.__SAMA__.LocalStore.data.policies.find(x => x.id === id), body:'تعديل على النص المنشور بعد نشره' }).then(() => false, () => true), priv.id);
ok(threw, 'النسخة المنشورة لا تُعدَّل');
// إصدار ثانٍ يسري بعد أسبوع
await p.click('[data-pn="privacy"]'); await p.waitForTimeout(300);
ok((await p.inputValue('#pf-b')).includes('البيانات التي نجمعها'), 'الإصدار الجديد يبدأ من نص الساري');
const later = await S(() => { const d = new Date(Date.now() + 8 * 864e5); return d.toISOString().slice(0, 10); });
await p.fill('#pf-d', later); await p.fill('#pf-b', '## البيانات التي نجمعها\n- الاسم والجوال فقط\n\nالإصدار الثاني من سياسة الخصوصية.'); await p.click('#pfS'); await p.waitForTimeout(700);
const d2 = (await pols()).find(x => x.slug === 'privacy' && x.status === 'draft');
await p.click(`[data-pp="${d2.id}"]`); await p.waitForTimeout(300); await p.click('.modal button:has-text("نشر")'); await p.waitForTimeout(800);
ok((await pols()).find(x => x.id === d2.id).version === 2, 'الإصدار الثاني');

// ---------- العامة ----------
await p.goto(U + '#policies'); await p.waitForTimeout(900);
ok(/سياسة الخصوصية/.test(await text('#app')) && /الإصدار ١|الإصدار 1/.test(await text('.pol-grid')), 'السياسة الساري إصدارها الأول');
ok(/إصدارات قادمة/.test(await text('#app')), 'عرض الإصدار القادم');
await go('policy-privacy'); ok(await p.$('.pol-body h3') && /سجل الإصدارات/.test(await text('#app')), 'صفحة السياسة بنصها وسجل إصداراتها');
ok(!(await p.$('.pol-body script')), 'النص يُعرض آمنًا');
await go('policy-privacy~2'); ok(/إصدار قادم/.test(await text('.pol-doc')), 'الإصدار القادم موسوم');

// ---------- القبول في التسجيل ----------
const silver = await S(() => window.__SAMA__.LocalStore.data.plans.find(x => x.tier === 'silver' && x.mode === 'in_person').id);
const nid = await S(() => window.__SAMA__.makeSaudiId('1'));
const fill = async () => {
  await go('plan-' + silver);
  await p.fill('[name=full_name]', 'ماجد سعيد علي القحطاني'); await p.fill('[name=national_id]', nid); await p.fill('[name=phone]', '0554443322');
  await p.selectOption('[name=gender]', 'ذكر'); await p.selectOption('[name=city]', { index: 1 }); await p.selectOption('[name=education]', { index: 1 }); await p.check('[name=agree]');
};
await fill();
ok(await p.$('#rf-pol') && /سياسة الخصوصية/.test(await text('#rfPol')), 'خانة قبول السياسة في النموذج');
await p.click('#rfGo'); await p.waitForTimeout(600);
ok(!(await p.$('.refbox')) && /وافق/.test(await text('#rfSum')), 'رفض التسجيل دون القبول');
threw = await S(n => window.__SAMA__.LocalStore.registerSubscription({ national_id:n, full_name:'أ ب ج', gender:'ذكر', plan_id:window.__SAMA__.LocalStore.data.plans[0].id }).then(() => false, e => /يلزم قبول/.test(e.message)), nid);
ok(threw, 'المخزن يرفض دون القبول حتى لو تُجووزت الواجهة');
await p.check('#rf-pol'); await p.click('#rfGo'); await p.waitForTimeout(800);
ok(await p.$('.refbox'), 'التسجيل بعد القبول');
const acc = await S(n => { const D = window.__SAMA__.LocalStore.data, t = D.trainees.find(x => x.national_id === n); return D.policy_acceptances.filter(a => a.trainee_id === t.id); }, nid);
ok(acc.length === 1 && acc[0].policy_id === v1.id && acc[0].context === 'subscription', 'توثيق القبول بالإصدار الساري');
await p.goto(U + 'admin/#admin-policies'); await p.waitForTimeout(900);
ok(/^1$|^١$/.test((await text('tr[data-slug="privacy"] td.num'))), 'عدد القبولات في الإدارة');

ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
