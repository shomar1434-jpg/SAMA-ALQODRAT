// الخطوة BH: اختبار تحديد المستوى للزوار
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { try { localStorage.setItem('sama_skip_reg_intro', '1'); } catch {} });
const KEY = 'sama_qudrat_v4';
const data = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const put = async fn => { await p.evaluate(([k, f]) => { const D = JSON.parse(localStorage.getItem(k)); new Function('D', f)(D); localStorage.setItem(k, JSON.stringify(D)); }, [KEY, `(${fn})(D)`]); };
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));

await p.goto(U); await p.waitForTimeout(900);
// بنك مشترك: الإجابة الصحيحة 2، والمهارات مصنّفة (الكمي نصفه بلا تصنيف)
await put(D => {
  D.questions = (D.questions || []).map(q => ({ ...q, shared: false }));
  for (let i = 1; i <= 12; i++) for (const s of ['لفظي', 'كمي']) D.questions.push({ id: `pl-${s === 'لفظي' ? 'v' : 'q'}-${i}`, shared: true, teacher_id: null, section: 'all', subject: s, unit: 'عام', order: i,
    text: `سؤال ${s} ${i}`, options: ['أ', 'ب', 'ج', 'د'], correct: 2, explanation: 'شرح سري', status: 'published', key_status: 'approved', code: `PL${i}`,
    category: s === 'لفظي' ? (i <= 6 ? 'التناظر اللفظي' : 'إكمال الجمل') : (i <= 6 ? 'الجبر' : '') });
});

// الزر بجوار «قارن بين الباقات»
await p.goto(U); await p.reload(); await p.waitForSelector('[data-pl-link]');
const near = await p.evaluate(() => { const a = document.querySelector('[data-pl-link]'); return !!a && a.previousElementSibling?.id === 'plCompare'; });
ok(near, 'زر «اختبر مستواك مجانًا» بجوار «قارن بين الباقات»');

await p.goto(U + '#placement'); await p.waitForTimeout(700);
ok(await p.isVisible('[data-plgo="qudurat"]'), 'القدرات متاح');
ok(!(await p.$('[data-plgo="tahsili"]')) && /قريبًا/.test(await text('.pl-kind:nth-child(2)')), 'التحصيلي «قريبًا» بلا بنك معتمد');
ok(/لا نطلب اسمك/.test(await text('.pl-facts')), 'لا بيانات شخصية');

const run = async pick => {
  await p.click('[data-plgo="qudurat"]'); await p.waitForSelector('#plRoot');
  const r = await p.evaluate(() => JSON.parse(sessionStorage.getItem('sama_pl_run')));
  for (let i = 0; i < r.questions.length; i++) {
    const v = pick(r.questions[i]); if (v !== null) await p.click(`#plRoot .sim-opt:nth-child(${v + 1})`);
    if (i < r.questions.length - 1) await p.click('#plNext');
  }
  await p.click('#plEnd');
  if (await p.waitForSelector('#plGo', { timeout: 800 }).catch(() => null)) await p.click('#plGo');
  await p.waitForSelector('[data-plres]');
  return r;
};

const r1 = await run(() => 2);
ok(r1.questions.length === 20 && r1.questions.filter(q => q.subject === 'لفظي').length === 10, '20 سؤالًا: 10 لفظي و10 كمي');
ok(!r1.questions.some(q => 'correct' in q || 'explanation' in q || 'category' in q), 'الإجابة الصحيحة لا تصل للمتصفح');
ok(/100٪/.test(await text('[data-plres] h1')) && await p.getAttribute('[data-pltier]', 'data-pltier') === 'basic', 'فوق 65٪: الأساسية');
ok(/enroll-q-/.test(await p.getAttribute('[data-pltier] a.pri', 'href')), 'زر التسجيل في الباقة المقترحة');
ok(/wa\.me|whatsapp/.test(await p.getAttribute('[data-plrec] a[target=_blank]', 'href')), 'سؤال المركز عبر واتساب');

ok(await p.isVisible('[data-pllinknote]'), 'تنبيه حفظ النتيجة 100 يوم عند التسجيل');

// التسجيل في الباقة المقترحة من الجهاز نفسه يربط النتيجة بملف المتدرب
await p.click('[data-pltier] a.pri'); await p.waitForSelector('#en-item');
const nid = await p.evaluate(() => window.__SAMA__.makeSaudiId('1'));
await p.fill('[name=full_name]', 'سامي فهد علي القحطاني'); await p.fill('[name=national_id]', nid); await p.fill('[name=phone]', '0557779001');
await p.selectOption('[name=gender]', 'ذكر'); await p.check('[name=agree]'); await p.check('#rf-minor-no').catch(() => {});
await p.click('#rfGo'); await p.waitForSelector('.refbox');
let D0 = await data(); const tr = D0.trainees.find(t => t.national_id === nid), la = D0.placement_attempts.find(a => a.id === r1.id);
ok(tr && la && la.trainee_id === tr.id && la.linked_at, 'النتيجة مربوطة بملف المتدرب بعد التسجيل في الباقة');
ok(await p.evaluate(() => !localStorage.getItem('sama_pl_last')), 'لا تُربط النتيجة مرة أخرى');

await p.goto(U + '#placement'); await p.reload(); await p.waitForSelector('[data-plgo]');
await run(() => null);
ok(/^0٪/.test(await text('[data-plres] h1')) && (await p.$$eval('[data-pltier]', e => e.map(x => x.dataset.pltier))).join() === 'diamond,gold', 'دون 40٪: الماسية والذهبية');

await p.click('#plAgain'); await p.waitForSelector('[data-plgo]');
await run(q => q.subject === 'لفظي' ? 2 : 0);
const t3 = await p.$$eval('[data-pltier]', e => e.map(x => x.dataset.pltier));
ok(/50٪/.test(await text('[data-plres] h1')) && t3.join() === 'custom,silver' && /الجبر/.test(await text('[data-plres]')), 'بين الحدين مع ضعف مهارة: خصصناها لك ثم الفضية');

await p.click('#plAgain'); await p.waitForSelector('[data-plgo]');
await p.click('[data-plgo="qudurat"]'); await p.waitForTimeout(600);
ok(!(await p.$('#plRoot')) && /حد محاولات اليوم/.test(await text('#toasts, .toast, body')), 'حد المحاولات اليومي');

// الاستئناف بعد التحديث
await p.evaluate(k => { const D = JSON.parse(localStorage.getItem(k)); D.settings.placement_daily_max = 5; localStorage.setItem(k, JSON.stringify(D)); }, KEY);
await p.goto(U + '#placement'); await p.reload(); await p.waitForTimeout(600);
await p.click('[data-plgo="qudurat"]'); await p.waitForSelector('#plRoot');
await p.click("#plRoot .sim-opt:nth-child(2)"); await p.click('#plNext');
await p.reload(); await p.waitForSelector('#plRoot');
ok(/السؤال 2 من 20/.test(await text('#plRoot .sim-qh')), 'يُستأنف الاختبار بعد التحديث');
await p.evaluate(() => sessionStorage.removeItem('sama_pl_run'));

// الحذف بعد 100 يوم
await put(D => { D.placement_attempts.push({ id:'old-pl', kind:'qudurat', session_id:'x', day:'2026-01-01', snapshot:[], started_at:new Date(Date.now() - 101 * 864e5).toISOString(), deadline:new Date().toISOString(), submitted_at:new Date().toISOString(), result:{ pct:10, tiers:['diamond'] } }); });
// الإدارة
await p.goto(U + 'admin/#admin-assistant'); await p.reload(); await p.waitForTimeout(600);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
await p.click('[data-ast="pl"]'); await p.waitForSelector('[data-plstats]');
ok(/3 \/ 4/.test(await text('[data-plstats]')), 'إحصاء المحاولات');
ok(/سامي فهد علي القحطاني/.test(await text('[data-pllinked]')), 'النتائج المرتبطة بأسماء المتدربين للإدارة');
await p.fill('#pl-low', '30'); await p.click('#plSet [type=submit]'); await p.waitForTimeout(600);
ok((await data()).settings.placement_low === 30, 'حفظ الحد الأدنى');
ok(!(await data()).placement_attempts.some(a => a.id === 'old-pl'), 'تُحذف المحاولات بعد 100 يوم');
await p.fill('#pl-low', '80'); await p.click('#plSet [type=submit]'); await p.waitForTimeout(600);
ok((await data()).settings.placement_low === 30 && /الأدنى أصغر/.test(await text('body')), 'حدود غير صحيحة مرفوضة');

ok(!errs.length, 'بلا أخطاء صفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
