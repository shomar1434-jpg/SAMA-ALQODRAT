// الخطوة AX: الرئيسية (دورات حاليا/قريبا، أرغب بالتسجيل)، حالة العرض من «الدفعات والكشوف»، إلغاء صفحة التحقق، دليل منار، الإقرار، القائمة، وملخص جميع المدفوعات
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const admin = async r => { await p.goto(U + 'admin/#' + r); await p.reload(); await p.waitForTimeout(500);
  if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); } await p.waitForSelector('#main'); };

await p.goto(U); await p.waitForSelector('#coursesSec');
const intro = await text('.intro-cta');
ok(/دورات متاحة حاليا/.test(intro) && /دورات متاحة قريبا/.test(intro) && !/استعرض البرامج|التحقق من شهادة/.test(intro), 'النبذة: زرا «دورات متاحة حاليا» و«قريبا» بدل الاستعراض والتحقق');
ok(/أرغب بالتسجيل/.test(await text('#ctaEnroll')), 'الزر العلوي «أرغب بالتسجيل»');
// الخطوة BQ: القسم العلوي الجديد (صورتا القسمين، المبدّل، البطاقات الثلاث، الشعاران)
ok(await p.$('.nh #nhM.on') && await p.$('.nh #nhF') && (await p.$$('.nh-logos img')).length === 2 && (await p.$$('.nh-gc')).length === 3, 'القسم العلوي: صورتا البنين والبنات والشعاران والبطاقات الثلاث');
await p.click('.nh-seg [data-s=F]'); await p.waitForTimeout(1000);
ok(await p.$('#nhF.on') && !(await p.$('#nhM.on')) && /قسم البنات/.test(await text('#nhSec')) && await p.getAttribute('.nh-seg [data-s=F]', 'aria-pressed') === 'true', 'زر «قسم البنات» ينقل الصورة والجلسة القادمة إلى قسم البنات');
await p.waitForTimeout(2600); ok(/^78$/.test(await text('#nhPct')), 'مؤشر الأداء يمتلئ حتى 78');
ok((await p.$$('[data-crp=now] .crs-card')).length > 0 && /أرغب بالتسجيل فيها/.test(await text('[data-crp=now]')), 'دورات متاحة حاليا ببطاقات وزر «أرغب بالتسجيل فيها»');
await p.click('.intro-cta [data-go-crs=soon]'); await p.waitForTimeout(500);
ok(await p.isVisible('[data-crp=soon]') && !(await p.isVisible('[data-crp=now]')) && /عن بُعد/.test(await text('[data-crp=soon]')), '«دورات متاحة قريبا» تعرض القادم (ومنه الباقات عن بُعد)');
const foot = await text('footer');
ok(/طريقة التسجيل في منصة منار/.test(foot) && /منصة منار/.test(foot) && !/التحقق من إفادة/.test(foot), 'التذييل: منار ودليل التسجيل فيها، ولا رابط تحقق');
ok(!(await p.$('a[href="#verify"], a[href^="#v-"]')), 'لا روابط تحقق في الرئيسية');
await p.click('#manarGuideLink'); await p.waitForSelector('#manarSteps');
ok((await p.$$('#manarSteps li')).length === 6 && await p.$('a[href="https://mnar.sa/auth/registration"][target=_blank]') && !(await p.$('#app input')), 'دليل منار: الخطوات والروابط الرسمية بلا أي حقل إدخال');
await p.goto(U + '#verify'); await p.waitForTimeout(900);
ok(!p.url().includes('#verify') && await p.$('#coursesSec'), 'مسار التحقق القديم يُحال إلى الرئيسية');
await p.goto(U + '#v-SAMA-TEST-1'); await p.waitForTimeout(900);
ok(!p.url().includes('#v-') && !(await text('#app')).includes('SAMA-TEST-1'), 'مسار إفادة قديم لا يعرض شيئًا');
// شاشة التعليمات قبل أي نموذج تسجيل (البند 17)، ثم النموذج بالخدمة المختارة نفسها
const plan0 = (await data()).plans.find(x => x.mode !== 'remote' && x.status !== 'coming_soon');
await p.goto(U + '#enroll-q-' + plan0.id); await p.waitForSelector('#regIntro');
ok(await p.isHidden('#regCard') && /تنبيه مهم قبل التسجيل/.test(await text('#regIntro')) && /إن كان مطلوبًا لبرنامجك/.test(await text('#regIntro')) && !(await p.$('#regIntro input')), 'التعليمات أولًا بلا أي حقل، وتاريخ الميلاد «إن كان مطلوبًا»');
await p.click('#regAck'); await p.waitForSelector('#en-item');
ok(!(await p.$('#regIntro')) && (await p.inputValue('#en-item')) === plan0.id, '«قرأت التعليمات وأرغب بالمتابعة» يفتح النموذج بالباقة المختارة');
ok(/أقر بصحة البيانات أعلاه/.test(await text('label.check:has(#rf-agree)')), 'نص الإقرار المختصر');
await p.goto(U + '#home'); await p.waitForSelector('#coursesSec'); await p.click('[data-crp=now] .crs-card a.btn'); await p.waitForTimeout(600);
ok(await p.isVisible('#regIntro'), 'التعليمات تظهر أيضًا من بطاقة «أرغب بالتسجيل فيها»');
await p.goto(U + '#register'); await p.waitForTimeout(800);
ok(!/نموذج التسجيل الموحّد/.test(await text('#app')), 'لا زر للنموذج الموحّد في دليل البرامج');

// حالة العرض من «الدفعات والكشوف»
await admin('admin-cohorts');
const nav = await p.$$eval('.side a', l => l.map(a => a.textContent.trim()));
ok(nav.indexOf('باركود محاضرات اليوم') >= 0 && nav.indexOf('باركود محاضرات اليوم') < nav.indexOf('لوحة التحليلات') && nav.includes('حضور البرامج التدريبية'), 'القائمة: الباركود أولًا، و«حضور البرامج التدريبية»');
await p.click('[data-ct=pub]'); await p.waitForSelector('#pubT');
let D = await data();
const today = await p.evaluate(() => window.__SAMA__?.riyadhNow?.().date || new Date().toISOString().slice(0, 10));
const noCoh = D.programs.find(x => x.active !== false && !D.cohorts.some(c => c.program_id === x.id && c.reg_open && !c.archived_at && c.end_date >= today));
const row = `#pubT tr[data-pr="${noCoh.id}"]`;
await p.selectOption(`${row} [data-ps]`, 'open_for_registration'); await p.click(`${row} [data-psv]`); await p.waitForTimeout(500);
ok(!(await data()).programs.find(x => x.id === noCoh.id).publish_state, 'لا يُفتح للتسجيل بلا دفعة مفتوحة');
await p.selectOption(`${row} [data-ps]`, 'coming_soon'); await p.fill(`${row} [data-pe]`, '2027-01-10'); await p.click(`${row} [data-psv]`); await p.waitForTimeout(700);
D = await data(); const np = D.programs.find(x => x.id === noCoh.id);
ok(np.publish_state === 'coming_soon' && np.expected_start === '2027-01-10' && D.audit_logs.some(a => a.action === 'programs.update' && a.entity === noCoh.id), 'قريبًا بموعد متوقع، والتغيير في سجل الحركات');
const openP = D.programs.find(x => D.cohorts.some(c => c.program_id === x.id && c.reg_open && c.end_date >= today));
await p.click('[data-ct=pub]').catch(() => {}); await p.waitForSelector('#pubT');
await p.selectOption(`#pubT tr[data-pr="${openP.id}"] [data-ps]`, 'closed'); await p.click(`#pubT tr[data-pr="${openP.id}"] [data-psv]`); await p.waitForTimeout(700);
await p.goto(U); await p.waitForSelector('#coursesSec');
ok((await p.$(`[data-crp=soon] [data-crs="${noCoh.id}"]`)) && /2027|٢٠٢٧|يناير/.test(await text(`[data-crp=soon] [data-crs="${noCoh.id}"]`)), 'يظهر في «قريبا» بالموعد المتوقع');
ok(!(await p.$(`[data-crs="${openP.id}"]`)), 'المغلق لا يظهر في الرئيسية');
const blocked = await p.evaluate(async id => { const S = window.__SAMA__.LocalStore; S.load?.(); try { await S.register({ program_id:id, national_id:window.__SAMA__.makeSaudiId('1'), full_name:'سالم علي محمد الشهري', phone:'0551112233', gender:'ذكر', birth_date:'2000-01-01', agree:true }); return 'ok'; } catch(e){ return e.message; } }, openP.id);
ok(/غير متاح/.test(blocked), 'التسجيل في البرنامج المغلق مرفوض');

// ملخص جميع المدفوعات
await admin('admin-invoices'); await p.waitForSelector('#psT');
D = await data();
const nOrders = D.orders.filter(o => o.approval !== 'rejected').length;
ok((await p.$$('#psT tbody tr')).length >= nOrders && /المدفوع المعتمد/.test(await text('#psCards')), 'الملخص يعرض كل الطلبات مع البطاقات');
await p.selectOption('#ps-t', 'program'); await p.waitForTimeout(300);
const types = await p.$$eval('#psT tbody tr td:nth-child(2)', l => [...new Set(l.map(x => x.textContent.trim()))]);
ok(types.length === 1 && types[0] === 'البرامج التدريبية', 'تصفية نوع الخدمة');
await p.selectOption('#ps-t', 'all'); await p.waitForTimeout(300);
ok((await p.$$eval('#psT [data-ins]', l => l.map(x => x.textContent))).every(t => /من|لا ينطبق/.test(t)), 'عمود الأقساط «س من ص» أو «لا ينطبق»');
await p.click('#psP'); await p.waitForTimeout(500);
ok(/ملخص جميع المدفوعات/.test(await text('#printRoot')), 'طباعة الكشف A4');
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
