// الخطوة AV: بنّاء الاختبار للمدرب (أقسام متعددة، عدد مفتوح، ترتيب، معاينة المدرب والمتدرب)، والإرسال الفردي والجماعي، والتغذية الراجعة بعد التسليم
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

await p.goto(U); await p.waitForTimeout(800);
let D = await data();
const T = D.teachers.find(t => t.section === 'boys' && t.subjects.includes('كمي'));
const sub = D.subscriptions.find(s => ['pending', 'active'].includes(s.status) && s.section === 'boys' && s.subjects.includes('كمي') && D.trainees.filter(t => t.phone === D.trainees.find(x => x.id === s.trainee_id).phone).length === 1);
const st = D.trainees.find(t => t.id === sub.trainee_id);
await login('teacher', T.phone); await tab('data-tt', 'hw');
await p.click('#hwAdd'); await p.waitForTimeout(300);
await p.fill('#hf-t', 'اختبار شامل لأكثر من قسم'); await p.check('#hf [name=kind][value=quiz]'); await p.waitForTimeout(200);
const units = await p.$$eval('#hfUnits input', l => l.map(i => i.value));
ok(units.length >= 2, 'أقسام البنك قائمة اختيار متعدد');
for (const u of units) await p.check(`#hfUnits input[value="${u}"]`);
const avail = await p.evaluate(() => [...document.querySelectorAll('#hfUnits label')].reduce((n, l) => n + +(l.textContent.match(/\((.+)\)/)[1].replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d))), 0));
const N = avail - 1;
await p.fill('#hf-n', String(N)); await p.click('#hfDraw'); await p.waitForTimeout(200);
const pick = await p.$$eval('#hfSel li', l => l.length);
D = await data();
const qOf = id => D.questions.find(q => q.id === id);
ok(N >= 4 && pick === N && /أقسام/.test(await text('#hfPn')), `سحب عشوائي بعدد مفتوح (${N}) موزّع على الأقسام المحددة`);
// ترتيب وحذف
const firstTxt = await text('#hfSel li:nth-child(1) .qb-t'), secondTxt = await text('#hfSel li:nth-child(2) .qb-t');
await p.click('#hfSel li:nth-child(2) [data-mv$=":-1"]'); await p.waitForTimeout(100);
ok((await text('#hfSel li:nth-child(1) .qb-t')) === secondTxt && (await text('#hfSel li:nth-child(2) .qb-t')) === firstTxt, 'تقديم السؤال يغيّر الترتيب');
await p.click(`#hfSel li:nth-child(${N}) [data-rm]`); await p.waitForTimeout(100);
ok((await p.$$('#hfSel li')).length === N - 1, 'حذف سؤال من المختار');
// انتقاء يدوي يضيف إلى المختار
await p.click('.qb-man summary'); await p.waitForTimeout(150);
const extra = await p.$eval('#hfPick input:not(:checked)', i => i.value); await p.check(`#hfPick input[value="${extra}"]`); await p.waitForTimeout(100);
ok((await p.$$('#hfSel li')).length === N, 'الانتقاء اليدوي يضاف إلى المختار');
// المعاينة
await p.click('#hfPv'); await p.waitForTimeout(200);
ok((await p.$$('#hfPrevB .qb-pv > li')).length === N && (await p.$$('#hfPrevB .qb-opts li.ok')).length === N, 'معاينة المدرب بالإجابات الصحيحة');
await p.click('#hfPrev [data-pv=s]'); await p.waitForTimeout(150);
ok((await p.$$('#hfPrevB .qb-pv > li')).length === N && !(await p.$('#hfPrevB .qb-opts li.ok')) && /ابدأ الآن/.test(await text('#hfPrevB')), 'معاينة المتدرب بلا إجابات');
// إرسال فردي: متدرب واحد بالبحث
await p.selectOption('#hf-tg', 'pick'); await p.waitForTimeout(150);
await p.fill('#hfTgQ', st.full_name.split(' ').slice(0, 2).join(' ')); await p.waitForTimeout(350);
await p.check(`#hfTgList input[value="${st.id}"]`); await p.waitForTimeout(100);
ok(/١ متدربًا|1 متدربًا/.test(await text('#hfTgN')), 'إرسال فردي بالبحث بالاسم');
await p.click('#hfS'); await p.waitForTimeout(900);
D = await data(); const a = D.assignments.find(x => x.title === 'اختبار شامل لأكثر من قسم');
ok(a && a.quiz.length === N && new Set(a.quiz.map(q => q.unit)).size >= 2 && JSON.stringify(a.targets) === JSON.stringify([st.id]), 'نُشر بالأسئلة المختارة من أكثر من قسم ولمتدرب واحد');
// إرسال جماعي: تحديد الظاهرين
await p.click('#hwAdd'); await p.waitForTimeout(300); await p.fill('#hf-t', 'واجب جماعي'); await p.selectOption('#hf-tg', 'pick'); await p.waitForTimeout(150);
await p.click('#hfTgAll'); await p.waitForTimeout(150); const nAll = (await p.$$('#hfTgList input:checked')).length;
ok(nAll > 1, 'تحديد كل الظاهرين للإرسال الجماعي');
await p.click('#hfTgNone'); await p.waitForTimeout(100); ok(!(await p.$$('#hfTgList input:checked')).length, 'إلغاء التحديد');
await p.evaluate(() => document.querySelector('#modalRoot').innerHTML = '');

// المتدرب يسلّم (مُحاكى)، ثم يراجع المدرب ويكتب ملاحظات
await p.evaluate(({ aid, tid }) => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); const a = D.assignments.find(x => x.id === aid);
  const answers = Object.fromEntries(a.quiz.map((q, i) => [q.id, i === 0 ? q.correct : (q.correct + 1) % 4]));
  D.submissions.push({ id:'sub-fb-1', assignment_id:aid, trainee_id:tid, status:'graded', answers, score:1, feedback:'تصحيح آلي', review:a.quiz.map(q => ({ id:q.id, correct:q.correct, explanation:'' })), attempt_no:1, created_at:new Date().toISOString(), submitted_at:new Date().toISOString() });
  localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); }, { aid:a.id, tid:st.id });
await p.reload(); await p.waitForTimeout(900); await tab('data-tt', 'hw');
await p.click('[data-fb="sub-fb-1"]'); await p.waitForSelector('#fbf');
ok((await p.$$('#fbf .qres li.ok')).length === 1 && (await p.$$('#fbf .qres li.bad')).length === N - 1 && /الصحيح/.test(await text('#fbf')), 'المدرب يرى إجابة المتدرب والصحيح لكل سؤال');
await p.fill(`[data-fq="${a.quiz[1].id}"]`, 'راجع قاعدة النسبة'); await p.fill('#fb-n', 'أداء جيد، ركّز على الأخطاء'); await p.click('#fbS'); await p.waitForTimeout(700);
D = await data(); const s = D.submissions.find(x => x.id === 'sub-fb-1');
ok(s.teacher_note === 'أداء جيد، ركّز على الأخطاء' && s.comments[a.quiz[1].id] === 'راجع قاعدة النسبة' && s.score === 1, 'حُفظت الملاحظات ولم تتغير الدرجة');
await login('student', st.phone); await tab('data-st', 'hw');
const body = await text('#tBody, main');
ok(/ملاحظات المدرب/.test(body) && body.includes('أداء جيد') && /السؤال (2|٢): راجع قاعدة النسبة/.test(body), 'المتدرب يرى الملاحظة العامة وملاحظة السؤال برقمه');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
