// الخطوة T: محرر الواجبات — النوع، الاستهداف بقائمة ثابتة، سياسة إظهار الإجابات، واعتماد المفاتيح للاختبار الرسمي
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();
const login = async (role, phone) => { await p.goto(U + role + '/'); await p.waitForTimeout(700);
  if (await p.$('#logoutBtn:not([hidden])')) { await p.click('#logoutBtn'); await p.waitForTimeout(400); }
  await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(900); };
const tab = async (attr, k) => { await p.click(`[${attr}="${k}"]`); await p.waitForTimeout(500); };
const adminBank = async () => { await p.goto(U + 'admin/#admin-bank'); await p.reload(); await p.waitForTimeout(500);
  if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); } await p.waitForSelector('#sharedBank'); };
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
const BUNDLE = { subject: 'كمي', questions: ['أ', 'ب', 'ج'].map((c, i) => ({ code: 'KE-0' + (i + 1), unit: 'النموذج 1', skill: 'القسم الأول', order: i + 1, image: PX, correct: c })) };

await adminBank();
await p.setInputFiles('#sb-file', { name: 'bank.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(BUNDLE)) }); await p.waitForTimeout(900);
let D = await data();
const T = D.teachers.find(t => t.section === 'boys' && t.subjects.includes('كمي'));
const live = s => ['pending', 'active'].includes(s.status) && s.section === 'boys' && s.subjects.includes('كمي');
const solo = id => { const t = D.trainees.find(x => x.id === id); return D.trainees.filter(x => x.phone === t.phone).length === 1; };
const [A, B] = [...new Set(D.subscriptions.filter(live).map(s => s.trainee_id))].filter(solo).map(id => D.trainees.find(t => t.id === id));

// المدرب: اختبار رسمي بمفاتيح غير معتمدة يُرفض
await login('teacher', T.phone); await tab('data-tt', 'hw'); await p.click('#hwAdd'); await p.waitForTimeout(300);
await p.fill('#hf-t', 'اختبار رسمي'); await p.selectOption('#hf-ty', 'exam'); await p.check('#hf [name=kind][value=quiz]'); await p.waitForTimeout(200);
await p.selectOption('#hf-u', 'النموذج 1'); await p.selectOption('#hf-n', '5'); await p.click('#hfS'); await p.waitForTimeout(500);
ok(/مفاتيح معتمدة/.test(await text('#hfE')), 'الاختبار الرسمي لا يُنشر بمفاتيح غير معتمدة');
// تدريب مستهدف لفرد واحد، والإجابات بعد موعد الاستحقاق
await p.fill('#hf-t', 'تدريب علاجي'); await p.selectOption('#hf-ty', 'practice'); await p.selectOption('#hf-rv', 'after_due');
await p.selectOption('#hf-tg', 'pick'); await p.waitForTimeout(200); await p.click('#hfS'); await p.waitForTimeout(300);
ok(/متدربًا واحدًا/.test(await text('#hfE')), 'الاستهداف بأفراد يتطلب اختيار متدرب');
await p.check(`#hfTgList input[value="${A.id}"]`);
ok(/١ متدربًا/.test(await text('#hfTgN')), 'يظهر العدد النهائي قبل النشر');
await p.click('#hfS'); await p.waitForTimeout(800);
D = await data(); const hw = D.assignments.find(a => a.title === 'تدريب علاجي');
ok(hw && hw.type === 'practice' && hw.reveal === 'after_due' && hw.targets.length === 1 && hw.targets[0] === A.id && hw.quiz.length === 3, 'يُحفظ الواجب بنوعه وسياسته وقائمة مستهدفيه الثابتة');
ok(/تدريب/.test(await text('#tBody')) && /من ١/.test(await text('#tBody')), 'المدرب يرى النوع وعدد المستهدفين');
// استهداف بباقة
await p.click('#hwAdd'); await p.waitForTimeout(300); await p.fill('#hf-t', 'واجب باقة'); await p.selectOption('#hf-tg', 'plan'); await p.waitForTimeout(200);
const planId = await p.$eval('#hf-tp', s => s.value); await p.click('#hfS'); await p.waitForTimeout(800);
D = await data(); const hp = D.assignments.find(a => a.title === 'واجب باقة');
const expect = [...new Set(D.subscriptions.filter(s => live(s) && s.plan_id === planId).map(s => s.trainee_id))];
ok(hp && hp.targets.length === expect.length && expect.every(id => hp.targets.includes(id)) && hp.target_label.length > 2, 'الاستهداف بباقة يثبّت قائمة مشتركيها');

// غير المستهدَف لا يرى التدريب؛ المستهدَف يحله والمراجعة محجوبة حتى موعد الاستحقاق
await login('student', B.phone); await tab('data-st', 'hw');
ok(!(await text('#sBody')).includes('تدريب علاجي'), 'غير المستهدَف لا يرى الواجب');
await login('student', A.phone); await tab('data-st', 'hw');
const form = `.hw-quiz[data-qz="${hw.id}"]`;
ok(!!(await p.$(`[data-qs="${hw.id}"]`)) && !(await p.$(form)) && /تدريب/.test(await text('#sBody')), 'المستهدَف يرى الواجب ونوعه، وأسئلته لا تظهر قبل البدء');
await p.click(`[data-qs="${hw.id}"]`); await p.click('#qsGo'); await p.waitForSelector(`.hw-quiz[data-qz="${hw.id}"]`);   // الاختبار يُفتح مرة واحدة

const radios = await p.$$(`${form} input[type=radio]`); for (const i of [0, 4, 8]) await radios[i].check();
await p.click(`${form} button.pri`); await p.waitForTimeout(900);
D = await data(); const sb = D.submissions.find(x => x.assignment_id === hw.id && x.trainee_id === A.id);
ok(sb && sb.status === 'graded' && sb.review, 'يُصحَّح على الخادم وتُحفظ المراجعة');
const after = await text('#sBody');
ok(/سُلّم الاختبار/.test(after) && /تظهر الإجابات الصحيحة بعد/.test(after) && !(await p.$(form)) && !/الصحيح:/.test(after), 'المراجعة محجوبة عن المتدرب حتى موعد الاستحقاق، ولا يُعاد الحل');
await p.evaluate(id => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); const a = D.assignments.find(x => x.id === id); a.publish_date = '2026-01-01'; a.due_date = '2026-01-02'; localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); }, hw.id);
await p.reload(); await p.waitForTimeout(900); await tab('data-st', 'hw');
ok(/الصحيح:/.test(await text('#sBody')), 'تظهر الإجابات بعد موعد الاستحقاق');

// الإدارة تعتمد المفاتيح، فيُنشر الاختبار الرسمي
await adminBank(); await p.click('[data-ka="كمي"]'); await p.waitForTimeout(300); await p.click('#mo'); await p.waitForTimeout(800);
D = await data();
ok(D.questions.filter(q => q.shared && q.subject === 'كمي').every(q => q.key_status === 'approved'), 'الإدارة تعتمد مفاتيح المقرر');
await login('teacher', T.phone); await tab('data-tt', 'hw'); await p.click('#hwAdd'); await p.waitForTimeout(300);
await p.fill('#hf-t', 'اختبار رسمي معتمد'); await p.selectOption('#hf-ty', 'exam'); await p.check('#hf [name=kind][value=quiz]'); await p.waitForTimeout(200); await p.selectOption('#hf-rv', 'never');
await p.selectOption('#hf-u', 'النموذج 1'); await p.click('#hfS'); await p.waitForTimeout(800);
D = await data();
ok(D.assignments.some(a => a.title === 'اختبار رسمي معتمد' && a.type === 'exam' && a.reveal === 'never' && !a.targets), 'بعد الاعتماد يُنشر الاختبار الرسمي لكل متدربي المقرر');

// اختبار واجهة المدرب: اختيار سؤالين من قسمين ووحدتين، معاينة الإجابة الصحيحة، ثم مراجعة تسليم المتدرب.
await p.evaluate(() => {
  const key='sama_qudrat_v4', D=JSON.parse(localStorage.getItem(key));
  const base=D.questions.find(q=>q.subject==='كمي'&&q.status==='published');
  if(!base) throw new Error('لا توجد أسئلة كمي للتجربة');
  D.questions.push({...base,id:crypto.randomUUID(),code:'QA-MULTI-2',unit:'النموذج 2',skill:'القسم الثاني',correct:2,order:999,shared:true,status:'published',key_status:'approved'});
  localStorage.setItem(key,JSON.stringify(D));
});
await p.reload(); await p.waitForTimeout(650); await tab('data-tt','hw'); await p.click('#hwAdd');
await p.fill('#hf-t','واجب اختبار متعدد الأقسام'); await p.check('#hf [name=kind][value=quiz]');
await p.selectOption('#hf-m','pick'); await p.selectOption('#hf-u','النموذج 1'); await p.waitForTimeout(200);
const qOne=await p.$eval('#hfPick input[type=checkbox]',el=>el.value); await p.check(`#hfPick input[value="${qOne}"]`);
await p.selectOption('#hf-u','النموذج 2'); await p.waitForTimeout(200);
const qTwo=await p.$eval('#hfPick input[type=checkbox]',el=>el.value); await p.check(`#hfPick input[value="${qTwo}"]`);
ok(/٢ سؤالًا/.test(await text('#hfPn')),'اختيار سؤالين من وحدتين مختلفتين دون فقد الاختيار الأول');
await p.click('#hfPreview');
ok(/الإجابة الصحيحة/.test(await text('#hfPreviewLayer')),'المعاينة قبل الإرسال تعرض مفاتيح الإجابة للمدرب');
await p.click('#hfPreviewBack');
ok(!!(await p.$('#hfS')) && !!(await p.$('#hf-t')),'العودة من المعاينة تحفظ نموذج الواجب ومحتوياته');
await p.click('#hfS'); await p.waitForTimeout(850);
D=await data(); const mixed=D.assignments.find(a=>a.title==='واجب اختبار متعدد الأقسام');
ok(mixed?.quiz?.length===2 && new Set(mixed.quiz.map(q=>q.unit)).size===2,'نُشر الواجب بسؤالين من وحدتين مختلفتين');
await login('student',A.phone); await tab('data-st','hw'); await p.click(`[data-qs="${mixed.id}"]`); await p.click('#qsGo');
await p.waitForSelector(`.hw-quiz[data-qz="${mixed.id}"]`);
await p.check(`.hw-quiz[data-qz="${mixed.id}"] input[type=radio]`);
await p.click(`.hw-quiz[data-qz="${mixed.id}"] button.pri`); await p.waitForTimeout(650);
await login('teacher',T.phone); await tab('data-tt','hw');
await p.click(`[data-qa="${(await data()).submissions.find(x=>x.assignment_id===mixed.id&&x.trainee_id===A.id).id}"]`);
ok(/اختيار المتدرب/.test(await text('.hw-review')) && /الإجابة الصحيحة/.test(await text('.hw-review')),'المدرب يرى إجابة المتدرب مقابل الإجابة الصحيحة');
await p.fill('#qReviewFeedback','أحسنت، راجع شرح النسب والتناسب.'); await p.click('#qReviewSave'); await p.waitForTimeout(700);
D=await data(); ok(D.submissions.some(x=>x.assignment_id===mixed.id&&x.feedback==='أحسنت، راجع شرح النسب والتناسب.'),'تُحفظ التغذية الراجعة على تسليم المتدرب');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
