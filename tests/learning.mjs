// الجانب التعليمي: الواجبات، وبنك الأسئلة وقياس المستوى، والمراسلة، وتقييم المعلم.
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
const login = async (role, phone) => {
  await p.goto(U + role + '/'); await p.waitForTimeout(700);
  if (await p.$('#logoutBtn:not([hidden])')) { await p.click('#logoutBtn'); await p.waitForTimeout(400); }
  await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(900);
};
const tab = async (attr, k) => { await p.click(`[${attr}="${k}"]`); await p.waitForTimeout(500); };

await p.goto(U); await p.waitForTimeout(800);
const D = await data();
const T = D.teachers.find(t => t.phone === '0501000003');      // معلم البنين - كمي
// طالب بنين في مقرر كمي حضر 3 أيام على الأقل، وجواله غير مشترك مع طالب آخر
const days = id => new Set(D.sub_attendance.filter(a => a.trainee_id === id).map(a => a.att_date)).size;
const sub = D.subscriptions.find(s => s.section === 'boys' && s.subjects.includes('كمي') && s.start_date && days(s.trainee_id) >= 3 && D.trainees.filter(t => t.phone === D.trainees.find(x => x.id === s.trainee_id).phone).length === 1);
const st = D.trainees.find(t => t.id === sub.trainee_id);

// ---------- الواجبات ----------
await login('teacher', T.phone); await tab('data-tt', 'hw');
await p.click('#hwAdd'); await p.waitForTimeout(300); await p.fill('#hf-t', 'واجب اختبار الكسور'); await p.fill('#hf-b', 'حل التمرين 5'); await p.click('#hfS'); await p.waitForTimeout(700);
const asg = (await data()).assignments.find(a => a.title === 'واجب اختبار الكسور');
ok(asg && asg.section === 'boys' && asg.subject === 'كمي', 'المعلم ينشر واجبًا لقسمه ومقرره');
await login('student', st.phone); await tab('data-st', 'hw');
ok(/واجب اختبار الكسور/.test(await text('#sBody')), 'الطالب يرى الواجب في صفحة واجباتي');
await p.fill(`#hw-${asg.id}`, 'الحل: 3/4'); await p.click(`[data-hw="${asg.id}"] [data-draft]`); await p.waitForTimeout(600);
ok((await data()).submissions.some(s => s.assignment_id === asg.id && s.status === 'draft'), 'حفظ مسودة');
await p.click(`[data-hw="${asg.id}"] button.pri`); await p.waitForTimeout(600);
ok((await data()).submissions.some(s => s.assignment_id === asg.id && s.status === 'submitted'), 'إرسال الإجابة');
const girl = D.subscriptions.find(s => s.section === 'girls'), girlT = D.trainees.find(t => t.id === girl.trainee_id);
await login('student', girlT.phone); await tab('data-st', 'hw');
ok(!/واجب اختبار الكسور/.test(await text('#sBody')), 'الواجب لا يصل لطالبات البنات');
await login('teacher', T.phone); await tab('data-tt', 'hw');
const sid = (await data()).submissions.find(s => s.assignment_id === asg.id).id;
await p.click(`[data-gr="${sid}"]`); await p.waitForTimeout(300); await p.fill('#g-s', '9'); await p.fill('#g-f', 'أحسنت'); await p.click('#gS'); await p.waitForTimeout(600);
ok((await data()).submissions.some(s => s.id === sid && s.status === 'graded' && s.score === 9), 'التصحيح والدرجة');

// ---------- بنك الأسئلة وقياس المستوى ----------
await tab('data-tt', 'bank'); await p.click('#qAdd2'); await p.waitForTimeout(300);
await p.fill('#qf-u', 'وحدة الاختبار'); await p.fill('#qf-t', 'كم يساوي 7 × 8؟'); for (const [i, v] of ['54', '56', '58', '64'].entries()) await p.fill(`[name=o${i}]`, v);
await p.check('#qf input[name=correct][value="1"]'); await p.fill('#qf-e', 'جدول الضرب'); await p.click('#qfS'); await p.waitForTimeout(600);
const q = (await data()).questions.find(x => x.text === 'كم يساوي 7 × 8؟');
ok(q && q.section === 'boys' && q.status === 'published', 'المعلم يضيف سؤالًا منشورًا لبنك قسمه');
await p.evaluate(k => { const D = JSON.parse(localStorage.getItem(k)); D.questions.push({ id:'gq', section:'girls', subject:'كمي', unit:'وحدة البنات فقط', text:'سؤال بنات', options:['1','2','3','4'], correct:0, status:'published', version:1 }); localStorage.setItem(k, JSON.stringify(D)); }, KEY);
await login('student', st.phone); await tab('data-st', 'level');
const opts = await p.$$eval('#lv-u option', x => x.map(o => o.textContent));
ok(opts.some(o => o.includes('وحدة الاختبار')) && !opts.some(o => o.includes('وحدة البنات فقط')), 'الطالب يرى وحدات بنك قسمه ومقرره فقط');
await p.selectOption('#lv-u', { index: opts.findIndex(o => o.includes('وحدة الاختبار')) }); await p.click('#lvGo'); await p.waitForTimeout(600);
const hasAnswerKey = (await data()).attempts.slice(-1)[0];
ok(!(await p.content()).includes('جدول الضرب'), 'لا تظهر الإجابة أو التفسير قبل التسليم');
await p.check('#atF input[value="1"]'); await p.click('#atS'); await p.waitForTimeout(700);
ok(/النتيجة: ١ من ١/.test(await text('.modal')), 'التصحيح والنتيجة بعد التسليم');
await p.click('#atX'); await p.waitForTimeout(400);
await login('teacher', T.phone); await tab('data-tt', 'bank');
await p.click(`[data-qe="${q.id}"]`); await p.waitForTimeout(300); await p.fill('#qf-t', 'كم يساوي 7 × 9؟'); await p.click('#qfS'); await p.waitForTimeout(600);
const at = (await data()).attempts.find(a => a.id === hasAnswerKey.id);
ok(at.snapshot[0].text === 'كم يساوي 7 × 8؟' && at.score === 1, 'تعديل السؤال لا يغير نسخة المحاولة السابقة');
ok(/7 × 8|٧/.test(await text('#tBody')) || (await p.$$eval('#tBody table', x => x.length)) >= 2, 'المعلم يرى نتائج قياس طلابه');

// ---------- المراسلة ----------
await login('student', st.phone); await tab('data-st', 'msg');
await p.fill('#msgT', 'أستاذ، سؤال عن الواجب'); await p.click('#msgF button'); await p.waitForTimeout(600);
ok((await data()).messages.some(m => m.trainee_id === st.id && m.teacher_id === T.id && m.from === 'student'), 'الطالب يراسل معلم مقرره');
await login('teacher', T.phone);
ok(/1|١/.test(await text('[data-tt="msg"] .badge-n')), 'تنبيه رسالة جديدة للمعلم');
await tab('data-tt', 'msg'); await p.click(`[data-th]`); await p.waitForTimeout(300);
const idx = await p.$$eval('[data-th]', (x, n) => x.findIndex(b => b.textContent.includes(n)), st.full_name);
await p.click(`[data-th="${idx}"]`); await p.waitForTimeout(300); await p.fill('#msgT', 'أهلًا، تفضّل'); await p.click('#msgF button'); await p.waitForTimeout(600);
ok((await data()).messages.some(m => m.from === 'teacher' && m.trainee_id === st.id), 'المعلم يرد');

// ---------- تقييم المعلم ----------
await login('student', st.phone); await tab('data-st', 'rate');
const form = `[data-rt="${T.id}"]`;
await p.click(`${form} label[for="s-${T.id}-4"]`); await p.fill(`#rc-${T.id}`, 'شرح واضح'); await p.click(`${form} button`); await p.waitForTimeout(600);
await tab('data-st', 'rate'); await p.click(`${form} label[for="s-${T.id}-5"]`); await p.click(`${form} button`); await p.waitForTimeout(600);
const rs = (await data()).ratings.filter(r => r.trainee_id === st.id && r.teacher_id === T.id);
ok(rs.length === 1 && rs[0].stars === 5, 'تقييم واحد في الفترة، والتعديل يحدّثه');
await login('teacher', T.phone); await tab('data-tt', 'rate');
ok(/تقييم/.test(await text('#tBody')) && !(await text('#tBody')).includes(st.full_name), 'المعلم يرى التقييم مجمّعًا دون اسم الطالب');

ok(errs.length === 0, 'لا أخطاء في الصفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
