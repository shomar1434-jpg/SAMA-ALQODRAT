/* =====================================================================
   محاكي الاختبار وتصنيف مهارات قياس (الخطوة AQ) ↔ supabase/migrations/…_simulator.sql
   - كل سؤال يحمل تصنيفًا من قائمة ثابتة لكل مقرر (questions.category، والفارغ = غير مصنّف).
   - المحاكي: اختبار موقوت يبدؤه المتدرب، قسم لكل مقرر، يُسحب من البنك بمجموعات القطع
     (أسئلة صفحة القطعة الواحدة معًا) ويُقدَّم ما لم يره المتدرب من قبل.
   - النتيجة «مؤشر الجاهزية» (نسبة الصواب)، لا درجة قياس متوقعة.
   ===================================================================== */
import { riyadhNow, uid } from './utils.js';

export const CATEGORIES = {
  'لفظي':   ['استيعاب المقروء', 'التناظر اللفظي', 'إكمال الجمل', 'الخطأ السياقي', 'الارتباط والاختلاف'],
  'كمي':    ['الحساب', 'الجبر', 'الهندسة', 'الإحصاء والاحتمالات', 'المقارنات الكمية'],
  'تحصيلي': ['الرياضيات', 'الفيزياء', 'الكيمياء', 'الأحياء'],
};
export const UNCAT = 'غير مصنّف';
export const SIM_SUBJECT = 'محاكي';
export const SIM_ORDER = ['لفظي', 'كمي', 'تحصيلي'];
export const SIM_DEFAULTS = { sim_per_subject:24, sim_sec_per_q:75 };
export const SIM_DAILY_MAX = 3, SIM_GRACE_SEC = 20, SIM_MIN_POOL = 5;

export const catOk = (subject, c) => !c || (CATEGORIES[subject] || []).includes(c);
export const catOf = q => (q && q.category && catOk(q.subject, q.category) ? q.category : '') || UNCAT;
export function simSet(st){
  const n = Math.round(+st?.sim_per_subject), s = Math.round(+st?.sim_sec_per_q);
  return { sim_per_subject:n >= 5 && n <= 60 ? n : SIM_DEFAULTS.sim_per_subject, sim_sec_per_q:s >= 30 && s <= 180 ? s : SIM_DEFAULTS.sim_sec_per_q };
}
export const simMinutes = (n, st) => Math.max(1, Math.ceil(n * simSet(st).sim_sec_per_q / 60));
export const simDeadline = (started_at, minutes) => new Date(Date.parse(started_at) + minutes * 60000).toISOString();
export const simOpen = (at, now = Date.now()) => !!at && at.kind === 'sim' && !at.submitted_at && !!at.deadline && now <= Date.parse(at.deadline) + SIM_GRACE_SEC * 1000;
export const simExpired = (at, now = Date.now()) => !!at && at.kind === 'sim' && !at.submitted_at && !!at.deadline && now > Date.parse(at.deadline) + SIM_GRACE_SEC * 1000;
export const sortSubjects = a => [...new Set(a)].sort((x, y) => SIM_ORDER.indexOf(x) - SIM_ORDER.indexOf(y));

/* الانتقاء: مجموعات (صفحة القطعة أو السؤال وحده)، غير المرئية أولًا ثم عشوائيًا، وبترتيب المصدر داخل المجموعة */
export function pickSim(pool, n, seen = new Set(), rnd = Math.random){
  const groups = new Map();
  pool.forEach(q => { const k = q.page_image || q.id; if(!groups.has(k)) groups.set(k, []); groups.get(k).push(q); });
  const gs = [...groups.values()].map(qs => ({ qs:qs.slice().sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.id).localeCompare(String(b.id))), seen:qs.some(q => seen.has(q.id)), r:rnd() }))
    .sort((a, b) => (a.seen - b.seen) || (a.r - b.r));
  return gs.flatMap(g => g.qs).slice(0, n);
}

/* المقررات المتاحة للمحاكي: من الاشتراكات القائمة، وفي البنك أسئلة كافية */
export function simSubjects(D, trainee_id, liveSubs){
  const subs = liveSubs, out = [];
  for(const s of sortSubjects(subs.flatMap(x => x.subjects || []))){
    const sec = subs.find(x => (x.subjects || []).includes(s))?.section;
    const per = {}; (D.bank_units || []).filter(u => u.subject === s && u.section === sec).forEach(u => { per[u.unit] = Math.max(per[u.unit] || 0, +u.count || 0); });
    const count = Object.values(per).reduce((a, b) => a + b, 0);
    out.push({ subject:s, section:sec, count, ok:count >= SIM_MIN_POOL });
  }
  return out;
}

/* بناء المحاكي محليًا (يطابق student_start_sim) */
export function buildSim(D, trainee_id, section, subjects, pools, st, snapOf){
  const S = simSet(st), seen = new Set((D.attempts || []).filter(a => a.trainee_id === trainee_id).flatMap(a => (a.snapshot || []).map(q => q.id)));
  const snap = []; const parts = {};
  for(const s of sortSubjects(subjects)){ const qs = pickSim(pools[s] || [], S.sim_per_subject, seen); if(qs.length < SIM_MIN_POOL) throw new Error(`أسئلة ${s} في البنك غير كافية للمحاكي بعد`);
    qs.forEach(q => snap.push({ ...snapOf(q), subject:s })); parts[s] = qs.length; }
  if(!snap.length) throw new Error('اختر مقررًا واحدًا على الأقل');
  const started_at = new Date().toISOString(), minutes = simMinutes(snap.length, st);
  return { id:uid(), kind:'sim', trainee_id, teacher_id:null, section, subject:SIM_SUBJECT, unit:null, focus:sortSubjects(subjects).join(' + '), started_at, deadline:simDeadline(started_at, minutes),
    submitted_at:null, minutes, snapshot:snap, answers:{}, score:null, total:snap.length, parts:null, skills:null };
}

/* تنقية الإجابات: معرّفات النسخة فقط، وقيم 0..3 أو فارغ */
export function cleanAnswers(at, answers){
  const ids = new Set((at.snapshot || []).map(q => q.id)), o = {};
  for(const [k, v] of Object.entries(answers || {})) if(ids.has(k)) o[k] = v === null || v === '' || v === undefined ? null : Number.isInteger(+v) && +v >= 0 && +v < 4 ? +v : null;
  return o;
}

/* التصحيح (يطابق student_finish_attempt): المهارات بالتصنيف، والأقسام بالمقرر */
export function gradeAny(at, answers){
  const ans = {}; at.snapshot.forEach(q => { const v = answers?.[q.id]; ans[q.id] = v !== null && v !== '' && v !== undefined && Number.isInteger(+v) && +v >= 0 && +v < 4 ? +v : null; });
  const skills = {}, parts = {}; let score = 0;
  at.snapshot.forEach(q => { const ok = ans[q.id] === q.correct, k = catOf({ ...q, subject:q.subject || at.subject }), p = q.subject || at.subject;
    skills[k] = skills[k] || { right:0, total:0 }; skills[k].total++; parts[p] = parts[p] || { right:0, total:0 }; parts[p].total++;
    if(ok){ score++; skills[k].right++; parts[p].right++; } });
  return { answers:ans, score, skills, parts, submitted_at:new Date().toISOString() };
}
export const pct = (r, t) => t ? Math.round(r / t * 100) : 0;
export const READY = [[85, 'ok', 'جاهزية عالية'], [65, 'info', 'جاهزية جيدة'], [45, 'warn', 'تحتاج تدريبًا'], [0, 'bad', 'تحتاج تأسيسًا']];
export const readyOf = p => READY.find(([m]) => p >= m);
export const simsToday = (D, trainee_id, today = riyadhNow().date) => (D.attempts || []).filter(a => a.trainee_id === trainee_id && a.kind === 'sim' && new Date(Date.parse(a.started_at) + 3 * 3600e3).toISOString().slice(0, 10) === today).length;
