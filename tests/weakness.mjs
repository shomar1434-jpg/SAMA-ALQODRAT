// الخطوة AR: تحليل نقاط الضعف للمتدرب وولي الأمر والمدرب
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const KEY = 'sama_qudrat_v4';
const data = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();
const login = async (role, phone) => {
  await p.goto(U + role + '/'); await p.waitForTimeout(700);
  if (await p.$('#logoutBtn:not([hidden])')) { await p.click('#logoutBtn'); await p.waitForTimeout(400); }
  await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(900);
};

await p.goto(U); await p.waitForTimeout(900);
let D = await data();
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const live = s => ['pending', 'active'].includes(s.status) && (!s.end_date || s.end_date >= today);
const link = D.guardian_links.find(l => l.status === 'verified' && D.subscriptions.some(s => s.trainee_id === l.trainee_id && s.section === 'boys' && live(s) && s.subjects.includes('كمي') && s.subjects.includes('لفظي'))
  && D.trainees.filter(t => t.phone === D.trainees.find(x => x.id === l.trainee_id).phone).length === 1);
const st = D.trainees.find(t => t.id === link.trainee_id);
// ثلاث محاولات: الجبر خطأ دائمًا، والبقية صحيحة؛ ومحاولة لفظي
await p.evaluate(([k, id]) => { const D = JSON.parse(localStorage.getItem(k));
  const pool = s => D.questions.filter(q => q.section === 'boys' && q.subject === s && q.status === 'published');
  const snap = q => ({ id:q.id, text:q.text, options:q.options, correct:q.correct, explanation:q.explanation || '', skill:q.skill, subject:q.subject, unit:q.unit, category:q.category || '' });
  const mk = (s, i, kind) => { const qs = pool(s), ans = {}; qs.forEach(q => { ans[q.id] = q.category === 'الجبر' ? (q.correct + 1) % 4 : q.correct; });
    const t = new Date(Date.now() - (5 - i) * 86400000).toISOString();
    return { id:'wk-' + s + i, kind, trainee_id:id, section:'boys', subject:kind === 'sim' ? 'محاكي' : s, unit:null, started_at:t, submitted_at:t, minutes:10, snapshot:qs.map(snap), answers:ans,
      score:qs.filter(q => ans[q.id] === q.correct).length, total:qs.length, parts:{ [s]:{ right:qs.filter(q => ans[q.id] === q.correct).length, total:qs.length } }, focus:s }; };
  D.attempts = (D.attempts || []).concat([mk('كمي', 1, 'practice'), mk('كمي', 2, 'sim'), mk('كمي', 3, 'practice'), mk('لفظي', 4, 'practice')]);
  localStorage.setItem(k, JSON.stringify(D)); }, [KEY, st.id]);

// ---------- المتدرب ----------
await login('student', st.phone); await p.click('[data-st="level"]'); await p.waitForTimeout(600);
ok(await p.isVisible('.an-card') && /تحليل مستواي/.test(await text('.an-card')), 'بطاقة تحليل مستواي');
ok(/ركّز على:\s*الجبر ٠٪/.test(await text('.an-weak')), 'الأضعف أولًا: الجبر');
const subs = await p.$$eval('.an-sn', x => x.map(e => e.textContent));
ok(subs[0] === 'لفظي' && subs[1] === 'كمي', 'مقرر لكل قسم (اللفظي ثم الكمي)');
ok(/آخر محاكٍ/.test(await text('.an-h')), 'آخر نتيجة محاكٍ في الرأس');
const firstSkill = await text('.an-sub:nth-child(2) .an-skills li:first-child .an-k');
ok(/الجبر/.test(firstSkill), 'المهارات مرتبة من الأضعف');
await p.click('[data-anp="كمي|الجبر"]'); await p.waitForTimeout(700);
D = await data(); const pr = D.attempts.filter(a => a.kind === 'practice' && a.focus === 'الجبر').slice(-1)[0];
ok(pr && pr.snapshot.every(q => q.category === 'الجبر') && await p.isVisible('#atF'), '«تدرّب على هذه» يفتح تدريبًا علاجيًا في المهارة');
await p.click('#atS'); await p.waitForTimeout(700); await p.click('#atX'); await p.waitForTimeout(600);

// إعادة تصنيف سؤال: التحليل يتبع التصنيف الحالي
await p.evaluate(k => { const D = JSON.parse(localStorage.getItem(k)); const q = D.questions.find(x => x.section === 'boys' && x.category === 'الحساب'); q.category = 'المقارنات الكمية'; localStorage.setItem(k, JSON.stringify(D)); }, KEY);
await p.reload(); await p.waitForTimeout(900); await p.click('[data-st="level"]'); await p.waitForTimeout(600);
ok(/المقارنات الكمية/.test(await text('.an-card')), 'التحليل يتبع التصنيف الحالي للسؤال');

// ---------- ولي الأمر ----------
await login('guardian', st.national_id || link.guardian_phone); await p.waitForTimeout(400);
if (!(await p.$('.an-card'))) await login('guardian', link.guardian_phone);
ok(await p.isVisible('.an-card') && /تحليل مستوى/.test(await text('.an-card')) && /يحتاج تركيزًا في/.test(await text('.an-card')), 'ولي الأمر يرى تحليل مستوى ابنه');
ok(!(await p.$('[data-anp]')), 'لا أزرار تدريب لولي الأمر');

// ---------- المدرب: مقرراته فقط ----------
D = await data();
const T = D.teachers.find(t => t.section === 'boys' && t.subjects.includes('كمي') && !t.subjects.includes('لفظي'));
await login('teacher', T.phone); await p.click('[data-tt="people"]'); await p.waitForTimeout(600);
await p.fill('#pp-q', st.full_name.split(' ')[0]); await p.waitForTimeout(500);
await p.click(`[data-pc="${st.id}"]`); await p.waitForTimeout(500);
const an = await text('.modal .an-card');
ok(/كمي/.test(an) && !/لفظي/.test(an) && /الجبر/.test(an), 'المدرب يرى تحليل متدربه في مقرراته فقط (ومنه المحاكي)');

ok(!errs.length, 'لا أخطاء في الصفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
