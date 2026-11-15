/* =====================================================================
   تحليل نقاط الضعف (الخطوة AR): يجمع كل إجابات المتدرب — التدريب السريع والمحاكي
   واختبارات الواجبات المصححة — ويحسب نسبة الصواب لكل مقرر ومهارة قياس،
   ويرتّب المهارات من الأضعف، ويقارن آخر الإجابات بما قبلها (الاتجاه).
   التصنيف الحالي للسؤال (q_meta من الخادم) يتقدم على المحفوظ في نسخة المحاولة.
   ===================================================================== */
import { UNCAT, catOk, pct } from './sim_logic.js';

export const MIN_ANSWERS = 3;      // أقل عدد إجابات لترتيب المهارة
export const WEAK = 50, MID = 75;  // دون 50 ضعف، دون 75 متوسط
export const levelOf = p => p < WEAK ? 'weak' : p < MID ? 'mid' : 'strong';
export const LEVEL = { weak:['bad', 'تحتاج تدريبًا'], mid:['warn', 'متوسطة'], strong:['ok', 'جيدة'] };

const metaOf = (D, q, subject) => { const m = D.q_meta?.[q.id], s = q.subject || subject;
  const c = m ? m[0] : q.category; return { subject:s, category:c && catOk(s, c) ? c : UNCAT, unit:(m ? m[1] : q.unit) || '' }; };

/* سجل الإجابات: لكل سؤال أُجيب عنه أو تُرك في محاولة مسلَّمة */
export function answerLog(D, trainee_id){
  const out = [];
  for(const a of D.attempts || []){ if(a.trainee_id !== trainee_id || !a.submitted_at || !Array.isArray(a.snapshot)) continue;
    for(const q of a.snapshot){ if(q.correct === undefined) continue; const v = a.answers?.[q.id];
      out.push({ qid:q.id, ...metaOf(D, q, a.subject), right:v === q.correct, at:a.submitted_at, src:a.kind === 'sim' ? 'sim' : 'practice' }); } }
  for(const s of D.submissions || []){ if(s.trainee_id !== trainee_id || s.status !== 'graded' || !Array.isArray(s.review)) continue;
    const a = (D.assignments || []).find(x => x.id === s.assignment_id), qs = a?.quiz || [];
    for(const r of s.review){ const q = qs.find(x => x.id === r.id) || { id:r.id }; out.push({ qid:r.id, ...metaOf(D, q, a?.subject), right:s.answers?.[r.id] === r.correct, at:s.submitted_at || s.graded_at || '', src:'quiz' }); } }
  return out.sort((x, y) => String(x.at).localeCompare(String(y.at)));
}

const agg = rows => { const right = rows.filter(r => r.right).length; return { right, total:rows.length, pct:pct(right, rows.length) }; };
/* الاتجاه: آخر 10 إجابات مقابل ما قبلها (يكفي 6 إجابات على الأقل) */
const trendOf = rows => { if(rows.length < 6) return 0; const k = Math.min(10, Math.floor(rows.length / 2)), last = agg(rows.slice(-k)).pct, prev = agg(rows.slice(0, -k)).pct;
  return last - prev >= 10 ? 1 : prev - last >= 10 ? -1 : 0; };

/* التحليل: لكل مقرر نسبته ومهاراته (مرتبة من الأضعف)، والأضعف إجمالًا */
export function analyze(log, subjects = null){
  const rows = subjects ? log.filter(r => subjects.includes(r.subject)) : log, bySub = {};
  rows.forEach(r => { (bySub[r.subject] = bySub[r.subject] || []).push(r); });
  const subs = Object.entries(bySub).map(([subject, rs]) => { const cats = {};
    rs.forEach(r => { (cats[r.category] = cats[r.category] || []).push(r); });
    const skills = Object.entries(cats).map(([category, cr]) => ({ category, ...agg(cr), trend:trendOf(cr), ranked:cr.length >= MIN_ANSWERS && category !== UNCAT }))
      .map(x => ({ ...x, level:levelOf(x.pct) }))
      .sort((a, b) => (b.ranked - a.ranked) || a.pct - b.pct || b.total - a.total);
    return { subject, ...agg(rs), trend:trendOf(rs), level:levelOf(agg(rs).pct), skills }; })
    .sort((a, b) => ['لفظي', 'كمي', 'تحصيلي'].indexOf(a.subject) - ['لفظي', 'كمي', 'تحصيلي'].indexOf(b.subject));
  const weakest = subs.flatMap(s => s.skills.filter(k => k.ranked && k.level !== 'strong').map(k => ({ ...k, subject:s.subject }))).sort((a, b) => a.pct - b.pct).slice(0, 3);
  return { total:rows.length, ...agg(rows), subjects:subs, weakest, sims:null };
}

/* آخر نتائج المحاكي (للتقرير والمتابعة) */
export const simHistory = (D, trainee_id) => (D.attempts || []).filter(a => a.trainee_id === trainee_id && a.kind === 'sim' && a.submitted_at)
  .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at)).map(a => ({ id:a.id, at:a.submitted_at, pct:pct(a.score, a.total), focus:a.focus || '', parts:a.parts || {} }));
