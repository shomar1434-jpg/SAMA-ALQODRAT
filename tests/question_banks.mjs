// بنوك أسئلة المدربين: الإدارة تستورد وتضيف لبنك مدرب، والمدرب يرى بنكه وحده ويرسل واجب اختبار منه،
// والمتدرب يحل الاختبار فيُصحَّح آليًا دون كشف الإجابات قبل التسليم، وقياس المستوى من بنك مدرب محدد.
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
let D = await data();
const T = D.teachers.find(t => t.phone === '0501000003');                 // مدرب البنين - كمي
const other = D.teachers.find(t => t.phone === '0501000004');             // مدرب البنين - لفظي
const before = D.questions.filter(q => q.teacher_id === T.id).length;

// ---------- الإدارة: بنوك الأسئلة ----------
await p.goto(U + 'admin/#admin-bank'); await p.waitForTimeout(900);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
ok(await p.$(`[data-bt="${T.id}"]`), 'صفحة بنوك الأسئلة تعرض بطاقة لكل مدرب');
await p.click(`[data-bt="${T.id}"]`); await p.waitForTimeout(400);
ok(/بنك خالد/.test(await text('#bankBody')), 'اختيار بنك المدرب');
await p.click('#bkImp'); await p.waitForTimeout(300);
const rows = ['المقرر\tالوحدة\tالمهارة\tالسؤال\tأ\tب\tج\tد\tالصحيحة\tالتفسير\tالصعوبة',
  'كمي\tالأسس\tالأسس\tقيمة 2 أس 3 تساوي\t6\t8\t9\t12\tب\t2×2×2 = 8\tسهل',
  'كمي\tالأسس\tالأسس\tقيمة 3 أس 2 تساوي\t6\t8\t9\t12\tج\t3×3 = 9\tسهل',
  'لفظي\tالأسس\t\tمقرر ليس للمدرب\t1\t2\t3\t4\tأ\t\t'].join('\n');
await p.fill('#imp-t', rows); await p.waitForTimeout(300);
ok(/السطر ٤|السطر 4/.test(await text('#imp-r')) && await p.$eval('#impGo', e => e.disabled), 'المعاينة تكشف السطر الخاطئ وتمنع الاستيراد');
await p.fill('#imp-t', rows.split('\n').slice(0, 3).join('\n')); await p.waitForTimeout(300);
ok(/٢ سؤال جاهز|2 سؤال جاهز/.test(await text('#imp-r')), 'معاينة سؤالين جاهزين');
await p.click('#impGo'); await p.waitForTimeout(900);
D = await data();
const imp = D.questions.filter(q => q.teacher_id === T.id && q.unit === 'الأسس');
ok(imp.length === 2 && imp.every(q => q.status === 'published' && q.section === 'boys' && q.correct >= 1), 'استيراد سؤالين منشورين في بنك المدرب');
await p.click('#bkAdd'); await p.waitForTimeout(300);
await p.fill('#qf-u', 'الأسس'); await p.fill('#qf-t', 'قيمة 10 أس 2 تساوي'); for (const [i, v] of ['20', '100', '1000', '12'].entries()) await p.fill(`[name=o${i}]`, v);
await p.check('#qf [name=correct][value="1"]'); await p.click('#qfS'); await p.waitForTimeout(800);
D = await data();
ok(D.questions.filter(q => q.teacher_id === T.id).length === before + 3, 'الإدارة تضيف سؤالًا لبنك المدرب');
await p.selectOption('#bf-u', 'الأسس'); await p.waitForTimeout(300);
ok((await p.$$('#bankBody tbody tr')).length === 3, 'تصفية البنك بالوحدة');

// ---------- المدرب: بنكه وحده، وواجب اختبار منه ----------
await login('teacher', T.phone); await tab('data-tt', 'bank');
ok(/بنك أسئلتي/.test(await text('#tBody')) && !(await text('#tBody')).includes('كتاب : مكتبة'), 'المدرب يرى بنكه وحده');
await tab('data-tt', 'hw');
await p.click('#hwAdd'); await p.waitForTimeout(300);
await p.fill('#hf-t', 'اختبار الأسس'); await p.check('#hf [name=kind][value=quiz]'); await p.waitForTimeout(200);
await p.check('#hfUnits input[value="الأسس"]'); await p.fill('#hf-n', '5'); await p.click('#hfS'); await p.waitForTimeout(800);
D = await data();
const qa = D.assignments.find(a => a.title === 'اختبار الأسس');
ok(qa && qa.kind === 'quiz' && qa.quiz.length === 3 && qa.quiz.every(q => imp.some(x => x.text === q.text) || q.text.includes('10 أس')), 'واجب اختبار من وحدة البنك (3 أسئلة)');

// ---------- المتدرب: يحل الاختبار ----------
const sub = D.subscriptions.find(s => s.section === 'boys' && s.subjects.includes('كمي') && ['pending', 'active'].includes(s.status) && D.trainees.filter(t => t.phone === D.trainees.find(x => x.id === s.trainee_id).phone).length === 1);
const st = D.trainees.find(t => t.id === sub.trainee_id);
await login('student', st.phone); await tab('data-st', 'hw');
await p.click(`[data-qs="${qa.id}"]`); await p.click('#qsGo'); await p.waitForSelector(`.hw-quiz[data-qz="${qa.id}"]`);   // الاختبار يُفتح مرة واحدة
const leak = await p.evaluate(id => { const f = document.querySelector(`[data-qz="${id}"]`); return f ? /2×2×2|3×3/.test(f.textContent) : null; }, qa.id);
ok(leak === false, 'الاختبار يظهر للمتدرب بلا تفسير ولا إجابة');
// يجيب صحيحًا على أول سؤال فقط
const first = qa.quiz[0];
await p.check(`[data-qz="${qa.id}"] input[data-q="${first.id}"][value="${first.correct}"]`);
await p.click(`[data-qz="${qa.id}"] button.pri`); await p.waitForTimeout(300);
ok(/لم تُجب عن/.test(await text(`[data-qz="${qa.id}"] .qz-w`)), 'تنبيه الأسئلة غير المجابة قبل التسليم');
await p.click(`[data-qz="${qa.id}"] button.pri`); await p.waitForTimeout(900); if(await p.$('#qrX')) await p.click('#qrX');
D = await data();
const sb = D.submissions.find(x => x.assignment_id === qa.id && x.trainee_id === st.id);
ok(sb && sb.status === 'graded' && Math.abs(sb.score - Math.round(1 / 3 * qa.max_score * 10) / 10) < 0.01, 'تصحيح آلي فوري (1 من 3)');
ok(/الصحيح:/.test(await text('#sBody')) && /2×2×2|3×3|10/.test(await text('#sBody')), 'مراجعة الإجابات الصحيحة بعد التسليم');

// ---------- قياس المستوى من بنك مدرب ----------
await tab('data-st', 'level');
const opts = await p.$$eval('#lv-u option', o => o.map(x => x.textContent));
ok(opts.some(o => o.includes('الأسس') && o.includes('خالد')), 'وحدات القياس تظهر باسم المدرب');
const i = opts.findIndex(o => o.includes('الأسس') && o.includes('خالد'));
await p.selectOption('#lv-u', String(i)); await p.click('#lvGo'); await p.waitForTimeout(700);
D = await data();
const at = D.attempts.filter(a => a.trainee_id === st.id).slice(-1)[0];
ok(at && at.teacher_id === T.id && at.snapshot.every(q => D.questions.find(x => x.id === q.id)?.teacher_id === T.id), 'المحاولة من بنك ذلك المدرب وحده');
ok(other && !at.snapshot.some(q => D.questions.find(x => x.id === q.id)?.teacher_id === other.id), 'لا أسئلة من بنك مدرب آخر');

ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
