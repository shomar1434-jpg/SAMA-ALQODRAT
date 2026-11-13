// الخطوة R: بنك مشترك مصوَّر لكل مقرر — استيراد الحزمة، رؤيته لمدرّبَي المقرر، انتقاء الأسئلة، وحل المتدرب دون مفاتيح
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const KEY = 'sama_qudrat_v4';
const data = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();
const login = async (role, phone) => { await p.goto(U + role + '/'); await p.waitForTimeout(700);
  if (await p.$('#logoutBtn:not([hidden])')) { await p.click('#logoutBtn'); await p.waitForTimeout(400); }
  await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(900); };
const tab = async (attr, k) => { await p.click(`[${attr}="${k}"]`); await p.waitForTimeout(500); };
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
const BUNDLE = { subject: 'كمي', title: 'بنك تجريبي', questions: [
  { code: 'KT-01', unit: 'النموذج 1', skill: 'القسم الأول', order: 1, image: PX, page_image: PX, correct: 'ب', key_source: 'تظليل' },
  { code: 'KT-02', unit: 'النموذج 1', skill: 'القسم الأول', order: 2, image: PX, correct: 'ج' },
  { code: 'KT-03', unit: 'النموذج 1', skill: 'القسم الثاني', order: 3, image: PX, correct: 'أ' },
  { code: 'KT-04', unit: 'النموذج 2', skill: 'القسم الأول', order: 4, image: 'quant/KT-04.webp', correct: 'د' },
  { code: 'KT-05', unit: 'النموذج 2', skill: 'القسم الأول', order: 5, image: PX, correct: 'أ', active: false }] };

await p.goto(U + 'admin/#admin-bank'); await p.waitForTimeout(500);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
await p.waitForSelector('#sharedBank');
await p.setInputFiles('#sb-file', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"subject":"كمي","questions":[{"code":"X1","image":"a"}]}') }); await p.waitForTimeout(400);
ok(/الإجابة الصحيحة/.test(await text('#sbE')), 'حزمة ناقصة المفتاح تُرفض');
await p.setInputFiles('#sb-file', { name: 'bank.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BUNDLE)) }); await p.waitForTimeout(900);
let D = await data(); let sh = D.questions.filter(q => q.shared);
ok(sh.length === 5 && sh.every(q => q.section === 'all' && q.teacher_id === null && q.key_status === 'unverified') && sh.find(q => q.code === 'KT-05').status === 'draft' && sh.find(q => q.code === 'KT-01').correct === 1, 'تُستورد الحزمة بنكًا مشتركًا بمفاتيح «غير معتمدة»، والموقوف مسودة');
ok(/كمي/.test(await text('#sharedBank')) && /٥/.test(await text('#sharedBank tbody')), 'لوحة البنوك المشتركة تعرض المقرر وأعداده');
await p.setInputFiles('#sb-file', { name: 'bank.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ ...BUNDLE, questions: BUNDLE.questions.map(q => q.code === 'KT-01' ? { ...q, correct: 'د' } : q) })) }); await p.waitForTimeout(900);
D = await data(); sh = D.questions.filter(q => q.shared);
ok(sh.length === 5 && sh.find(q => q.code === 'KT-01').correct === 3 && sh.find(q => q.code === 'KT-01').version === 2, 'إعادة الاستيراد تحدّث ولا تكرر، وتغيّر المفتاح يرفع الإصدار');

const tb = D.teachers.find(t => t.section === 'boys' && t.subjects.includes('كمي')), tg = D.teachers.find(t => t.section === 'girls' && t.subjects.includes('كمي')), tv = D.teachers.find(t => !t.subjects.includes('كمي'));
// مدربة البنات: ترى البنك المشترك وتنتقي أسئلة بعينها
await login('teacher', tg.phone); await tab('data-tt', 'bank');
ok(/بنك مشترك/.test(await text('#tBody')) && /مفتاح غير معتمد/.test(await text('#tBody')) && /تديره الإدارة/.test(await text('#tBody')) && (await p.$$('#tBody .qimg img')).length >= 3, 'مدربة الكمي بنات ترى البنك المشترك مصوَّرًا ولا تعدّله');
await tab('data-tt', 'hw'); await p.click('#hwAdd'); await p.waitForTimeout(300);
await p.fill('#hf-t', 'واجب منتقى من المشترك'); await p.check('#hf [name=kind][value=quiz]'); await p.waitForTimeout(200);
await p.selectOption('#hf-m', 'pick'); await p.selectOption('#hf-u', 'النموذج 1'); await p.waitForTimeout(200);
ok((await p.$$('#hfPick .qp')).length === 3 && (await p.$$eval('#hf-k option', o => o.length)) === 3, 'الانتقاء: النموذج ثم أقسامه ثم أسئلته');
await p.click('#hfS'); await p.waitForTimeout(300);
ok(/انتقِ/.test(await text('#hfE')), 'لا يُنشر واجب منتقى بلا أسئلة');
const id = c => sh.find(q => q.code === c).id;
await p.check(`#hfPick input[value="${id('KT-03')}"]`); await p.check(`#hfPick input[value="${id('KT-01')}"]`);
ok(/٢ سؤالًا/.test(await text('#hfPn')), 'عدّاد المختار');
await p.click('#hfS'); await p.waitForTimeout(800);
D = await data(); const qa = D.assignments.find(a => a.title === 'واجب منتقى من المشترك');
ok(qa && qa.teacher_id === tg.id && qa.section === 'girls' && qa.quiz.length === 2 && qa.quiz[0].code === 'KT-03' && qa.quiz[1].code === 'KT-01' && qa.quiz[0].image === PX, 'الواجب لقسم المدربة وحدها بالأسئلة المنتقاة وترتيبها وصورها');

// مدرب البنين يرى البنك نفسه، وواجب المدربة ليس عنده؛ ومدرب مقرر آخر لا يرى البنك
await login('teacher', tb.phone); await tab('data-tt', 'bank');
ok(/KT-0|بنك مشترك/.test(await text('#tBody')), 'مدرب الكمي بنين يرى البنك نفسه');
await tab('data-tt', 'hw');
ok(!(await text('#tBody')).includes('واجب منتقى من المشترك'), 'واجبات المدربة لا تظهر لمدرب البنين');
if (tv) { await login('teacher', tv.phone); await tab('data-tt', 'bank'); ok(!/بنك مشترك/.test(await text('#tBody')), 'مدرب مقرر آخر لا يرى بنك الكمي'); }

// المتدربة: تحل الواجب المصوَّر، والمفاتيح لا تصلها قبل التسليم
const sub = D.subscriptions.find(s => s.section === 'girls' && s.subjects.includes('كمي') && ['pending', 'active'].includes(s.status) && D.trainees.filter(t => t.phone === D.trainees.find(x => x.id === s.trainee_id).phone).length === 1);
const st = D.trainees.find(t => t.id === sub.trainee_id);
await login('student', st.phone);
const { quizPublic } = await import('../src/learning_logic.js'); const pd = JSON.stringify(quizPublic(qa));
ok(pd.includes('KT-03') && pd.includes('"image"') && !/"correct"/.test(pd), 'نسخة الواجب المرسلة للمتدربة فيها صور الأسئلة دون المفاتيح');
await tab('data-st', 'hw');
const form = `.hw-quiz[data-qz="${qa.id}"]`;
await p.click(`[data-qs="${qa.id}"]`); await p.click('#qsGo'); await p.waitForSelector(`.hw-quiz[data-qz="${qa.id}"]`);   // الاختبار يُفتح مرة واحدة
ok((await p.$$(`${form} .qimg img`)).length === 2 && (await p.$$(`${form} .q.qi`)).length === 2 && /عرض صفحة القطعة/.test(await text(form)), 'الواجب يعرض صور الأسئلة وخيارات أ ب ج د ورابط صفحة القطعة');
const radios = await p.$$(`${form} input[type=radio]`);
await radios[0].check(); await radios[4 + 3].check();   // السؤال الأول (KT-03) أ = صحيح، الثاني (KT-01) د = صحيح
await p.click(`${form} button.pri`); await p.waitForTimeout(900);
D = await data(); const sb = D.submissions.find(x => x.assignment_id === qa.id && x.trainee_id === st.id);
ok(sb && sb.status === 'graded' && sb.score === 10, 'التصحيح الآلي بمفاتيح البنك المشترك');
await tab('data-st', 'level');
ok(/النموذج 1/.test(await text('#sBody')), 'قياس المستوى يعرض وحدات البنك المشترك');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
