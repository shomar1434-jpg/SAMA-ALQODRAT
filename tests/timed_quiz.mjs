// الخطوة V: الاختبار يُفتح مرة واحدة، ومدته دقيقتان لكل سؤال؛ الأسئلة لا تظهر قبل البدء؛ الإجابات تُحفظ أولًا بأول؛ وعند انتهاء الوقت يُصحَّح ما حُفظ
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
const mk = async title => { await p.click('#hwAdd'); await p.waitForTimeout(300); await p.fill('#hf-t', title); await p.check('#hf [name=kind][value=quiz]'); await p.waitForTimeout(200); await p.fill('#hf-n', '5'); await p.click('#hfS'); await p.waitForTimeout(800); };

await p.goto(U); await p.waitForTimeout(800);
let D = await data();
const T = D.teachers.find(t => t.section === 'boys' && t.subjects.includes('كمي'));
const sub = D.subscriptions.find(s => ['pending', 'active'].includes(s.status) && s.section === 'boys' && s.subjects.includes('كمي') && D.trainees.filter(t => t.phone === D.trainees.find(x => x.id === s.trainee_id).phone).length === 1);
const st = D.trainees.find(t => t.id === sub.trainee_id);
await login('teacher', T.phone); await tab('data-tt', 'hw'); await mk('اختبار موقوت أول'); await mk('اختبار موقوت ثانٍ');
D = await data(); const q1 = D.assignments.find(a => a.title === 'اختبار موقوت أول'), q2 = D.assignments.find(a => a.title === 'اختبار موقوت ثانٍ'), n = q1.quiz.length;

await login('student', st.phone); await tab('data-st', 'hw');
const before = await text(`[data-qsb="${q1.id}"]`);
ok(!(await p.$(`.hw-quiz[data-qz="${q1.id}"]`)) && before.includes('يُفتح مرة واحدة') && /دقيقتان لكل سؤال/.test(before) && !(await p.content()).includes(q1.quiz[0].text), 'قبل البدء: المدة والتنبيه فقط، والأسئلة غير مرسلة للمتصفح');
ok(new RegExp(`${n * 2}|${(n * 2).toLocaleString('ar-SA')}`).test(before), 'المدة دقيقتان لكل سؤال');
await p.click(`[data-qs="${q1.id}"]`); await p.waitForSelector('#qsGo'); await p.click('#qsNo'); await p.waitForTimeout(300);
ok(!(await data()).submissions.some(s => s.assignment_id === q1.id && s.trainee_id === st.id), 'التراجع قبل التأكيد لا يبدأ الاختبار');
await p.click(`[data-qs="${q1.id}"]`); await p.click('#qsGo'); await p.waitForSelector(`.hw-quiz[data-qz="${q1.id}"]`);
D = await data(); let sb = D.submissions.find(s => s.assignment_id === q1.id && s.trainee_id === st.id);
ok(sb.status === 'draft' && Math.abs((Date.parse(sb.deadline) - Date.parse(sb.started_at)) / 60000 - n * 2) < 0.01 && /\d\d:\d\d/.test(await text(`.hw-quiz[data-qz="${q1.id}"] [data-qt]`)), 'البدء يسجّل الوقت ويظهر العدّاد');
// الإجابة تُحفظ أولًا بأول، وتبقى بعد إعادة التحميل، والعدّ لا يُعاد
const first = q1.quiz[0];
await p.check(`[data-qz="${q1.id}"] input[data-q="${first.id}"][value="${first.correct}"]`); await p.waitForTimeout(400);
D = await data(); sb = D.submissions.find(s => s.id === sb.id);
ok(sb.answers[first.id] === first.correct, 'الإجابة تُحفظ فور اختيارها');
const dl = sb.deadline; await p.reload(); await p.waitForTimeout(900); await tab('data-st', 'hw');
ok(await p.isChecked(`[data-qz="${q1.id}"] input[data-q="${first.id}"][value="${first.correct}"]`) && (await data()).submissions.find(s => s.id === sb.id).deadline === dl && !(await p.$(`[data-qs="${q1.id}"]`)), 'بعد إعادة الفتح: الإجابات محفوظة والوقت نفسه ولا زر بدء');
// انتهاء الوقت: يُصحَّح ما حُفظ تلقائيًا ولا يُعاد
await p.evaluate(id => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); const s = D.submissions.find(x => x.id === id); s.started_at = new Date(Date.now() - 3600e3).toISOString(); s.deadline = new Date(Date.now() - 1800e3).toISOString(); localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); }, sb.id);
await p.reload(); await p.waitForTimeout(1200); await tab('data-st', 'hw'); await p.waitForTimeout(800);
D = await data(); sb = D.submissions.find(s => s.id === sb.id);
ok(sb.status === 'graded' && /أجبت 1 من/.test(sb.feedback) && !(await p.$(`.hw-quiz[data-qz="${q1.id}"]`)) && !(await p.$(`[data-qs="${q1.id}"]`)), 'عند انتهاء الوقت يُصحَّح ما حُفظ ولا تُعاد المحاولة');
// اختبار ثانٍ: ينتهي وقته والصفحة مفتوحة فيُسلَّم تلقائيًا
await p.click(`[data-qs="${q2.id}"]`); await p.click('#qsGo'); await p.waitForSelector(`.hw-quiz[data-qz="${q2.id}"]`);
await p.check(`[data-qz="${q2.id}"] input[data-q="${q2.quiz[0].id}"][value="${q2.quiz[0].correct}"]`); await p.waitForTimeout(300);
await p.evaluate(id => { const f = document.querySelector(`[data-qz="${id}"]`); f.dataset.deadline = new Date(Date.now() + 1500).toISOString(); }, q2.id);
await p.waitForTimeout(3500);
D = await data(); const s2 = D.submissions.find(s => s.assignment_id === q2.id && s.trainee_id === st.id);
ok(s2.status === 'graded' && /أجبت 1 من/.test(s2.feedback), 'عند وصول العدّاد إلى الصفر يُسلَّم الاختبار تلقائيًا');
await login('teacher', T.phone); await tab('data-tt', 'hw');
ok(/آلي/.test(await text('#tBody')), 'المدرب يرى النتيجة الآلية');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
