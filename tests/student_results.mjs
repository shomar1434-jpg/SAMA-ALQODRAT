// طلب المالك 18 نوفمبر: تفاصيل بطاقات «لوحتي»، ونتائج الواجبات والاختبارات وشرح نسبها، ومراجعة الإجابات
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const KEY = 'sama_qudrat_v4';
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10), back = n => new Date(Date.parse(today) - n * 864e5).toISOString().slice(0, 10);

await p.goto(U); await p.waitForTimeout(800);
const st = await p.evaluate(([k, today]) => { const D = JSON.parse(localStorage.getItem(k));
  const s = D.subscriptions.find(x => x.start_date && x.start_date < today && (!x.end_date || x.end_date >= today) && x.status !== 'cancelled' && D.trainees.filter(t => t.phone === D.trainees.find(y => y.id === x.trainee_id).phone).length === 1);
  const t = D.trainees.find(x => x.id === s.trainee_id); return { phone:t.phone, id:t.id, section:s.section, subject:s.subjects[0] }; }, [KEY, today]);
// اختبار مصحَّح (الإجابات الصحيحة متاحة) وآخر مخفي المفتاح، واختبار جديد للحل
await p.evaluate(([k, st, d1, d2]) => { const D = JSON.parse(localStorage.getItem(k));
  const q = (id, c) => ({ id, text:'سؤال ' + id, options:['أ١', 'ب١', 'ج١', 'د١'], correct:c, explanation:'شرح ' + id });
  const base = { kind:'quiz', section:st.section, subject:st.subject, teacher_id:(D.teachers.find(t => t.section === st.section) || D.teachers[0]).id, publish_date:d2, due_date:d1, max_score:10, max_attempts:1, targets:null, body:'' };
  D.assignments.push({ ...base, id:'tq1', title:'اختبار الوحدة الأولى', type:'exam', reveal:'after_submit', quiz:[q('a1', 0), q('a2', 1), q('a3', 2)] });
  D.assignments.push({ ...base, id:'tq2', title:'تدريب مخفي المفتاح', type:'practice', reveal:'never', quiz:[q('b1', 0), q('b2', 1)] });
  D.assignments.push({ ...base, id:'tq3', title:'اختبار للحل الآن', type:'homework', reveal:'after_submit', due_date:new Date(Date.now() + 5 * 864e5).toISOString().slice(0, 10), quiz:[q('c1', 0), q('c2', 1)] });
  const rv = qs => qs.map(x => ({ id:x.id, correct:x.correct, explanation:x.explanation }));
  D.submissions.push({ id:'sb1', assignment_id:'tq1', trainee_id:st.id, status:'graded', score:6.7, answers:{ a1:0, a2:1, a3:null }, review:rv(D.assignments.find(a => a.id === 'tq1').quiz), submitted_at:new Date().toISOString(), started_at:new Date().toISOString(), deadline:new Date().toISOString() });
  D.submissions.push({ id:'sb2', assignment_id:'tq2', trainee_id:st.id, status:'graded', score:5, answers:{ b1:0, b2:3 }, review:rv(D.assignments.find(a => a.id === 'tq2').quiz), submitted_at:new Date().toISOString(), started_at:new Date().toISOString(), deadline:new Date().toISOString() });
  localStorage.setItem(k, JSON.stringify(D)); }, [KEY, st, back(1), back(3)]);

await p.goto(U + 'student/'); await p.waitForSelector('#pl-phone');
await p.fill('#pl-phone', st.phone); await p.click('#plB'); await p.waitForSelector('#otpF:not([hidden])'); await p.fill('#pl-code', '1234'); await p.click('#plB');
await p.waitForSelector('[data-ind="att"]'); await p.evaluate(() => document.querySelector('.modal-bg .btn')?.click()); await p.waitForTimeout(300);

// تفاصيل البطاقات
await p.click('[data-ind="att"]'); await p.waitForSelector('[data-detail="att"]');
ok(/نسبة الحضور/.test(await text('[data-detail="att"]')) && (await p.$$('[data-attf]')).length === 4, 'الحضور والغياب: الإحصاء وتصفية الأيام');
await p.click('[data-attf="غائب"]'); await p.waitForSelector('[data-attf="غائب"][aria-selected="true"]');
const rows = await p.$$eval('[data-detail="att"] tbody tr td:nth-child(3)', e => e.map(x => x.textContent.trim()));
ok(rows.every(r => r.includes('غائب')), 'تصفية الغياب تعرض أيام الغياب فقط');
await p.click('[data-ind-back]'); await p.waitForSelector('[data-ind="time"]');
await p.click('[data-ind="time"]'); await p.waitForSelector('[data-detail="time"]');
ok(/البداية/.test(await text('[data-detail="time"]')) && /جلساتي القادمة/.test(await text('[data-detail="time"]')), 'المؤقت الزمني: المدة والمتبقي والجلسات القادمة');
await p.click('[data-ind-back]'); await p.waitForSelector('[data-ind="hw"]');
await p.click('[data-ind="hw"]'); await p.waitForSelector('[data-results]');
ok(await p.getAttribute('[data-st="hw"]', 'aria-selected') === 'true', 'بطاقة الواجبات تفتح «واجباتي»');

// نتائجي
const res = await text('[data-results]');
ok(/67٪/.test(res) && /50٪/.test(res) && /متوسط/.test(res), 'نتائجي: نسبة كل واجب واختبار والمتوسطات');
const r1 = await text('[data-hwres="tq1"]');
ok(/أجبت إجابة صحيحة عن 2 من 3/.test(r1) && /تركت 1/.test(r1), 'شرح النسبة: الصحيحة والمتروكة');
await p.click('[data-goto="tq1"]'); await p.waitForTimeout(300);
ok(await p.evaluate(() => document.querySelector('[data-rev="tq1"]').open) && /الصحيح/.test(await text('[data-rev="tq1"]')), 'مراجعة الإجابات مع الصحيح حين يسمح الاختبار');
await p.click('[data-rev="tq2"] summary'); await p.waitForTimeout(200);
const r2 = await text('[data-rev="tq2"]');
ok(/إجابتك/.test(r2) && /الصحيح:/.test(r2), 'قرار المالك: الإجابة الصحيحة تظهر مع إجابتي دائمًا للمراجعة');

// الحل ثم نافذة النتيجة
await p.click('[data-qs="tq3"]'); await p.click('#qsGo'); await p.waitForSelector('[data-qz="tq3"]');
await p.check('[data-qz="tq3"] input[data-q="c1"][value="0"]', { force:true }); await p.check('[data-qz="tq3"] input[data-q="c2"][value="2"]', { force:true }); await p.waitForTimeout(300);
await p.click('[data-qz="tq3"] button.pri'); await p.waitForSelector('#qrRev');
ok(/50٪/.test(await text('.modal')) && /أخطأت في 1/.test(await text('.modal')), 'نافذة النتيجة بعد التسليم بالشرح');
await p.click('#qrRev'); await p.waitForTimeout(400);
ok(await p.evaluate(() => document.querySelector('[data-rev="tq3"]')?.open), '«مراجعة إجاباتي» من نافذة النتيجة');

ok(!errs.length, 'بلا أخطاء صفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
