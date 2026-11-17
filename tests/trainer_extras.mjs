// الخطوة X: صورة المدرب وسيرته، بطاقة المتدرب التفصيلية بالفلاتر، المجموعات المحفوظة، وحد المحاولات
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
// صورة PNG صغيرة تُرسم في المتصفح
const png = async () => Buffer.from((await p.evaluate(() => { const c = document.createElement('canvas'); c.width = 400; c.height = 300; const x = c.getContext('2d'); x.fillStyle = '#0d9488'; x.fillRect(0, 0, 400, 300); return c.toDataURL('image/png'); })).split(',')[1], 'base64');

await p.goto(U); await p.waitForTimeout(800);
let D = await data();
const T = D.teachers.find(t => t.section === 'boys' && t.subjects.includes('كمي'));
await p.evaluate(tid => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); D.assignments.push({ id: 'hw-late-x', teacher_id: tid, section: 'boys', subject: 'كمي', title: 'واجب فائت', body: '', kind: 'text', publish_date: '2026-01-01', due_date: '2026-01-05', max_score: 10, created_at: '2026-01-01T00:00:00Z' }); localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); }, T.id);
const live = s => ['pending', 'active'].includes(s.status);
const solo = id => { const t = D.trainees.find(x => x.id === id); return D.trainees.filter(x => x.phone === t.phone).length === 1; };
const sub = D.subscriptions.find(s => live(s) && s.section === 'boys' && s.subjects.includes('كمي') && solo(s.trainee_id)), st = D.trainees.find(t => t.id === sub.trainee_id);

// ---- طباعة كشف اليوم ----
await login('teacher', T.phone);
await p.click('#tPrint'); await p.waitForSelector('#printRoot.on .pdoc');
const sheet = await text('#printRoot .pdoc');
ok(/كشف الحضور والغياب اليومي/.test(sheet) && sheet.includes(T.full_name) && sheet.includes(st.full_name) && /غائب/.test(sheet) && /مدير المركز/.test(sheet) && !sheet.includes(st.national_id) && !sheet.includes(st.phone), 'المدرب يطبع كشف الحضور والغياب اليومي بلا هوية ولا جوال');
await p.click('#pbBack'); await p.waitForTimeout(300);
ok(!(await p.$('#printRoot.on')) && !!(await p.$('#tSheet')), 'الرجوع من الطباعة يعيد الكشف');
// ---- ملف المدرب: الصورة والسيرة ----
await tab('data-tt', 'profile');
await p.setInputFiles('#tp-av', { name: 'me.png', mimeType: 'image/png', buffer: await png() }); await p.waitForTimeout(500);
ok(!!(await p.$('#tpAv img.avt')), 'الصورة تُعرض قبل الحفظ بعد قصّها');
await p.setInputFiles('#tp-av', { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }); await p.waitForTimeout(300);
ok(/صورة/.test(await text('#tpE')), 'ملف غير صورة يُرفض');
await p.fill('#tp-cv', 'بكالوريوس رياضيات\nخبرة عشر سنوات في تدريب القدرات'); await p.click('#tpS'); await p.waitForTimeout(800);
D = await data(); let me = D.teachers.find(t => t.id === T.id);
ok(/^data:image\/jpeg;base64,/.test(me.avatar) && me.avatar.length <= 90000 && me.cv.startsWith('بكالوريوس'), 'تُحفظ الصورة مصغَّرة والسيرة');

// ---- متدربيّ: الفلاتر والبطاقة ----
await tab('data-tt', 'people');
const allRows = (await p.$$('#ppList tbody tr')).length;
ok(allRows > 0 && /من/.test(await text('#ppN')), 'قائمة متدربي المدرب');
await p.selectOption('#pp-f', 'hw_late'); await p.waitForTimeout(300);
const lateRows = (await p.$$('#ppList tbody tr')).length;
ok(lateRows > 0 && lateRows <= allRows && (await p.$$('#ppList tbody tr .pill.warn')).length === lateRows, 'فلتر «متأخر في الواجبات» من الواجبات الفعلية');
await p.fill('#pp-q', 'اسم لا يوجد'); await p.waitForTimeout(300);
ok(/لا متدربين/.test(await text('#ppList')), 'البحث بالاسم يصفّي');
await p.fill('#pp-q', ''); await p.selectOption('#pp-f', 'all'); await p.waitForTimeout(300);
await p.click(`[data-pc="${st.id}"]`); await p.waitForSelector('.tcard');
const card = await text('.tcard');
ok(card.includes(st.full_name) && /نسبة الحضور/.test(card) && /واجباتي المرسلة له/.test(card) && /متأخرة لم تُسلَّم/.test(card) && !card.includes(st.national_id) && !card.includes(st.phone), 'بطاقة المتدرب التفصيلية بلا هوية ولا جوال');
await p.click('#pcX'); await p.waitForTimeout(300);

// ---- المجموعات المحفوظة ----
await p.click('#ppSave'); await p.waitForTimeout(300);
ok(!(await p.$('#gsF')), 'لا حفظ دون تحديد');
await p.check(`[data-pk="${st.id}"]`); await p.click('#ppSave'); await p.waitForSelector('#gsF');
await p.fill('#gs-n', 'م'); await p.click('#gsS'); await p.waitForTimeout(300);
ok(/اسم المجموعة/.test(await text('#gsE')), 'اسم قصير يُرفض');
await p.fill('#gs-n', 'مجموعة المتابعة'); await p.click('#gsS'); await p.waitForTimeout(900);
D = await data();
ok(D.trainer_groups?.length === 1 && D.trainer_groups[0].teacher_id === T.id && D.trainer_groups[0].trainee_ids.includes(st.id) && /مجموعة المتابعة/.test(await text('#myGroups')), 'تُحفظ المجموعة وتظهر في تبويب المجموعات');

// ---- اختبار بمحاولتين موجَّه للمجموعة ----
await tab('data-tt', 'hw'); await p.click('#hwAdd'); await p.waitForTimeout(300);
await p.fill('#hf-t', 'اختبار بمحاولتين'); await p.check('#hf [name=kind][value=quiz]'); await p.waitForTimeout(200); await p.fill('#hf-n', '5'); await p.selectOption('#hf-at', '2');
await p.selectOption('#hf-tg', 'group'); await p.waitForTimeout(200);
ok(/1|١/.test(await text('#hfTgN')), 'المجموعة المحفوظة هدف للواجب');
await p.click('#hfS'); await p.waitForTimeout(900);
D = await data(); const A = D.assignments.find(a => a.title === 'اختبار بمحاولتين');
ok(A && A.max_attempts === 2 && A.targets.length === 1 && A.targets[0] === st.id && /مجموعة/.test(A.target_label), 'يُنشر بحد محاولتين لأعضاء المجموعة');

// ---- المتدرب: المحاولة الأولى ثم الثانية ----
await login('student', st.phone);
ok(!!(await p.$('#myTrainers img.avt')) && /السيرة المهنية/.test(await text('#myTrainers')), 'المتدرب يرى صورة مدربه وسيرته');
await tab('data-st', 'hw');
await p.click(`[data-qs="${A.id}"]`); await p.click('#qsGo'); await p.waitForSelector(`.hw-quiz[data-qz="${A.id}"]`);
for (const q of A.quiz) await p.check(`[data-qz="${A.id}"] input[data-q="${q.id}"][value="${q.correct}"]`);
await p.click(`[data-qz="${A.id}"] button.pri`); await p.waitForTimeout(1000);
D = await data(); let sb = D.submissions.find(s => s.assignment_id === A.id && s.trainee_id === st.id);
ok(sb.status === 'graded' && sb.score === A.max_score && !!(await p.$(`[data-qr="${A.id}"]`)) && !(await p.$('.qres')) && /بقيت لك/.test(await p.content()), 'بعد المحاولة الأولى: زر محاولة جديدة والإجابات محجوبة');
await p.click(`[data-qr="${A.id}"]`); await p.waitForSelector('#qsGo');
ok(/محاولة جديدة/.test(await text('.modal h3, #modal h3, dialog h3')), 'تأكيد قبل المحاولة الجديدة');
await p.click('#qsGo'); await p.waitForSelector(`.hw-quiz[data-qz="${A.id}"]`);
await p.click(`[data-qz="${A.id}"] button.pri`); await p.waitForTimeout(400);
if (await p.$(`.hw-quiz[data-qz="${A.id}"]`)) { await p.click(`[data-qz="${A.id}"] button.pri`); await p.waitForTimeout(800); }
await p.waitForTimeout(600);
D = await data(); sb = D.submissions.find(s => s.id === sb.id);
ok(sb.status === 'graded' && sb.attempt_no === 2 && sb.score === A.max_score && /المحاولة 2/.test(sb.feedback), 'تُحتسب أعلى درجة بين المحاولتين');
ok(!(await p.$(`[data-qr="${A.id}"]`)) && !!(await p.$('.qres')), 'بعد آخر محاولة: لا محاولة جديدة وتظهر الإجابات');

// ---- حذف المجموعة ----
await login('teacher', T.phone); await tab('data-tt', 'groups');
await p.click('#myGroups summary'); await p.click('[data-gd]'); await p.waitForSelector('#gdGo'); await p.click('#gdGo'); await p.waitForTimeout(900);
D = await data();
ok(D.trainer_groups.length === 0 && D.assignments.find(a => a.id === A.id).targets.length === 1, 'حذف المجموعة لا يمس الواجب المنشور');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
