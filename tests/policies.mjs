// مركز السياسات: مسودة ← نشر بإصدار، وثبات المنشور، والإصدارات القادمة. السياسات للاطلاع ولا تُلزم عند التسجيل.
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
await go('policies');
ok((await p.$$('.pol-card')).length === 6, 'السياسات الست المعتمدة منشورة للعامة');
await go('policy-attendance'); ok(/75%/.test(await text('.pol-body')) && /الإصدار ١|الإصدار 1/.test(await text('.pol-meta')), 'نص سياسة الحضور المنقول بإصداره الأول');

// ---------- الإدارة ----------
await p.goto(U + 'admin/#admin-policies'); await p.waitForTimeout(900);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
ok((await p.$$('#main tr[data-slug]')).length === 6, 'ست سياسات في الإدارة');
const v1 = (await pols()).find(x => x.slug === 'privacy');
let threw = await S(id => window.__SAMA__.LocalStore.savePolicy({ ...window.__SAMA__.LocalStore.data.policies.find(x => x.id === id), body:'تعديل على النص المنشور بعد نشره' }).then(() => false, () => true), v1.id);
ok(threw, 'النسخة المنشورة لا تُعدَّل');
await p.click('[data-pn="privacy"]'); await p.waitForTimeout(300);
ok((await p.inputValue('#pf-b')).includes('بيان سياسة الخصوصية') && (await p.inputValue('#pf-a')).length > 3, 'الإصدار الجديد يبدأ من نص الساري وجهة اعتماده');
const later = await S(() => new Date(Date.now() + 8 * 864e5).toISOString().slice(0, 10));
await p.fill('#pf-d', later); await p.fill('#pf-b', (await p.inputValue('#pf-b')) + '\n\n## إضافة\n- يُكمل من الإدارة'); await p.click('#pfS'); await p.waitForTimeout(700);
const d2 = (await pols()).find(x => x.slug === 'privacy' && x.status === 'draft');
await p.click(`[data-pp="${d2.id}"]`); await p.waitForTimeout(300); await p.click('.modal button:has-text("نشر")'); await p.waitForTimeout(600);
ok((await pols()).find(x => x.id === d2.id).status === 'draft', 'لا نشر والنص فيه أقسام ناقصة');
await p.click(`[data-pe="${d2.id}"]`); await p.waitForTimeout(300);
await p.fill('#pf-b', (await p.inputValue('#pf-b')).replace('- يُكمل من الإدارة', '- نحذف البيانات بعد سنتين من آخر اشتراك.')); await p.click('#pfS'); await p.waitForTimeout(700);
await p.click(`[data-pp="${d2.id}"]`); await p.waitForTimeout(300); await p.click('.modal button:has-text("نشر")'); await p.waitForTimeout(800);
ok((await pols()).find(x => x.id === d2.id).version === 2, 'نشر الإصدار الثاني');

// ---------- العامة ----------
await p.goto(U + '#policies'); await p.waitForTimeout(900);
ok(/إصدارات قادمة/.test(await text('#app')), 'عرض الإصدار القادم');
await go('policy-privacy'); ok(await p.$('.pol-body h3') && /سجل الإصدارات/.test(await text('#app')) && !/سنتين/.test(await text('.pol-body')), 'الساري اليوم هو الأول مع سجل الإصدارات');
ok(!(await p.$('.pol-body script')), 'النص يُعرض آمنًا');
await go('policy-privacy~2'); ok(/إصدار قادم/.test(await text('.pol-doc')) && /سنتين/.test(await text('.pol-body')), 'الإصدار القادم موسوم');

// ---------- التسجيل: السياسات للاطلاع لا للإلزام ----------
const silver = await S(() => window.__SAMA__.LocalStore.data.plans.find(x => x.tier === 'silver' && x.mode === 'in_person').id);
const nid = await S(() => window.__SAMA__.makeSaudiId('1'));
await go('plan-' + silver);
await p.fill('[name=full_name]', 'ماجد سعيد علي القحطاني'); await p.fill('[name=national_id]', nid); await p.fill('[name=phone]', '0554443322');
await p.selectOption('[name=gender]', 'ذكر'); await p.fill('[name=birth_date]', '1995-01-01'); await p.selectOption('[name=city]', { index: 1 }); await p.selectOption('[name=education]', { index: 1 }); await p.check('[name=agree]');
ok(!(await p.$('#rf-pol')) && await p.$('#rfPol .pol-note a[href="#policies"]'), 'رابط السياسات للاطلاع دون خانة إلزام');
ok(!/يلزم قبولها/.test(await p.innerText('body')), 'لا عبارة «يلزم قبولها»');
await p.click('#rfGo'); await p.waitForTimeout(800);
ok(await p.$('.refbox'), 'التسجيل دون موافقة على السياسات');
await go('policies'); ok(!/يلزم قبولها/.test(await text('#app')), 'صفحة السياسات بلا إلزام');

ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
