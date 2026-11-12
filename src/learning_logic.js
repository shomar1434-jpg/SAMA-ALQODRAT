/* =====================================================================
   الجانب التعليمي (الخطوات 10–12): الواجبات، وبنوك الأسئلة واختبار قياس المستوى،
   وتقييم المدرب بالنجوم، والمراسلة بين المتدرب ومدرب المقرر.
   النطاق دائمًا: القسم (بنون/بنات) × المقرر، ويُتحقق منه هنا وفي SQL.
   ===================================================================== */
import { riyadhNow, uid } from './utils.js';
import { subStatus } from './qudurat.js';

export const SUBJECTS = ['كمي', 'لفظي', 'تحصيلي'];
export const SUB_TXT = { draft:'مسودة', submitted:'مُرسل', needs_revision:'يحتاج تعديلًا', graded:'مصحح' };
export const RATE_ITEMS = { clarity:'وضوح الشرح', interaction:'التفاعل', commitment:'الالتزام', usefulness:'فائدة التدريبات' };
export const MIN_ATTEND_TO_RATE = 3;            // شرط المشاركة قبل التقييم (قابل للتعديل)
export const period = (n = riyadhNow()) => n.date.slice(0, 7);   // فترة التقييم: الشهر

/* اشتراكات المتدرب القائمة ونطاقها */
export const liveSubsOf = (D, trainee_id) => (D.subscriptions || []).filter(s => s.trainee_id === trainee_id && ['pending', 'active'].includes(subStatus(s)));
export const inScope = (sub, section, subject) => sub.section === section && (sub.subjects || []).includes(subject);
export const teacherCovers = (t, section, subject) => t && t.active !== false && t.section === section && (t.subjects || []).includes(subject);
export const studentHasScope = (D, trainee_id, section, subject) => liveSubsOf(D, trainee_id).some(s => inScope(s, section, subject));
export const teacherTeaches = (D, t, trainee_id) => liveSubsOf(D, trainee_id).some(s => s.section === t.section && (s.subjects || []).some(x => (t.subjects || []).includes(x)));

/* ---------- الواجبات ---------- */
export function assignmentsFor(D, trainee_id, n = riyadhNow()){
  const subs = liveSubsOf(D, trainee_id), mine = (D.submissions || []).filter(x => x.trainee_id === trainee_id);
  return (D.assignments || []).filter(a => a.publish_date <= n.date && subs.some(s => inScope(s, a.section, a.subject)))
    .map(a => { const sb = mine.find(x => x.assignment_id === a.id);
      const state = sb ? sb.status : a.due_date < n.date ? 'late' : 'new';
      return { ...a, submission:sb || null, state }; })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}
export function validateAssignment(a){
  if(!a.title || a.title.trim().length < 3) throw new Error('اكتب عنوان الواجب');
  if(!SUBJECTS.includes(a.subject)) throw new Error('اختر المقرر');
  if(!a.publish_date || !a.due_date || a.due_date < a.publish_date) throw new Error('تاريخ الاستحقاق يجب أن يكون بعد تاريخ النشر');
}

/* ---------- بنوك الأسئلة واختبار قياس المستوى ---------- */
export const bankKey = (section, subject) => `${section}:${subject}`;
export function bankFor(D, section, subject, unit, published = true){
  return (D.questions || []).filter(q => q.section === section && q.subject === subject && (!unit || q.unit === unit) && (!published || q.status === 'published'));
}
export function validateQuestion(q){
  if(!q.text || q.text.trim().length < 5) throw new Error('اكتب نص السؤال');
  if(!Array.isArray(q.options) || q.options.filter(x => String(x || '').trim()).length !== 4) throw new Error('اكتب الخيارات الأربعة');
  if(!(q.correct >= 0 && q.correct < 4)) throw new Error('حدد الإجابة الصحيحة');
}
/* يبني محاولة من أسئلة منشورة في نطاق المتدرب، ويحفظ نسخة الأسئلة كما هي وقت المحاولة */
export function buildAttempt(D, trainee_id, section, subject, unit, count){
  const pool = bankFor(D, section, subject, unit).slice();
  if(!pool.length) throw new Error('لا توجد أسئلة منشورة في هذه الوحدة بعد');
  for(let i = pool.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const qs = pool.slice(0, Math.max(1, Math.min(count || 10, pool.length)));
  return { id:uid(), trainee_id, section, subject, unit:unit || null, started_at:new Date().toISOString(), submitted_at:null, minutes:Math.max(5, qs.length * 2),
    snapshot: qs.map(q => ({ id:q.id, text:q.text, options:q.options, correct:q.correct, explanation:q.explanation || '', skill:q.skill || '', version:q.version || 1 })), answers:{}, score:null, total:qs.length };
}
/* ما يُرسل للمتدرب قبل الإنهاء: بلا الإجابات الصحيحة ولا التفسير */
export const attemptPublic = at => at.submitted_at ? at : { ...at, snapshot: at.snapshot.map(({ correct, explanation, ...q }) => q) };
export function gradeAttempt(at, answers){
  const ans = {}; at.snapshot.forEach(q => { const v = answers?.[q.id]; ans[q.id] = Number.isInteger(+v) && +v >= 0 && +v < 4 ? +v : null; });
  const score = at.snapshot.filter(q => ans[q.id] === q.correct).length;
  const skills = {}; at.snapshot.forEach(q => { const k = q.skill || 'عام'; skills[k] = skills[k] || { right:0, total:0 }; skills[k].total++; if(ans[q.id] === q.correct) skills[k].right++; });
  return { ...at, answers:ans, score, submitted_at:new Date().toISOString(), skills };
}

/* ---------- تقييم المدرب ---------- */
export function canRate(D, trainee_id, teacher){
  if(!teacherTeaches(D, teacher, trainee_id)) return { ok:false, why:'المدرب لا يدرّسك في اشتراك قائم' };
  const days = new Set((D.sub_attendance || []).filter(a => a.trainee_id === trainee_id).map(a => a.att_date)).size;
  if(days < MIN_ATTEND_TO_RATE) return { ok:false, why:`يُتاح التقييم بعد حضور ${MIN_ATTEND_TO_RATE} أيام على الأقل` };
  return { ok:true };
}
/* للمدرب: نتائج مجمّعة دون هوية المقيّمين */
export function ratingSummary(D, teacher_id){
  const rs = (D.ratings || []).filter(r => r.teacher_id === teacher_id);
  const avg = k => rs.length ? Math.round(rs.reduce((s, r) => s + (k ? r.items?.[k] || 0 : r.stars), 0) / rs.length * 10) / 10 : null;
  return { count:rs.length, stars:avg(null), items:Object.fromEntries(Object.keys(RATE_ITEMS).map(k => [k, avg(k)])),
    comments: rs.filter(r => r.comment && r.comment_status !== 'hidden').map(r => ({ text:r.comment, period:r.period })).slice(-20) };
}

/* ---------- المراسلة ---------- */
export function threadFor(D, trainee_id, teacher_id){
  return (D.messages || []).filter(m => m.trainee_id === trainee_id && m.teacher_id === teacher_id).sort((a, b) => a.at.localeCompare(b.at));
}
export function validateMessage(text){ const t = String(text || '').trim(); if(!t) throw new Error('اكتب الرسالة'); if(t.length > 1000) throw new Error('الرسالة أطول من 1000 حرف'); return t; }

/* ---------- بيانات تجريبية: أسئلة منشورة وواجب لكل قسم ---------- */
export function demoLearning(D){
  const n = riyadhNow(), addDays = (d, k) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + k); return x.toISOString().slice(0, 10); };
  const Q = {
    'كمي': [['إذا كان 3س + 5 = 20، فما قيمة س؟', ['3', '5', '6', '15'], 1, 'نطرح 5 ثم نقسم على 3: س = 15 ÷ 3 = 5.', 'المعادلات', 'الجبر'],
      ['ما 25٪ من 240؟', ['40', '48', '60', '80'], 2, 'ربع 240 = 60.', 'النسبة المئوية', 'الحساب'],
      ['متوسط الأعداد 4، 8، 12 هو:', ['6', '8', '10', '12'], 1, 'المجموع 24 ÷ 3 = 8.', 'الإحصاء', 'الحساب'],
      ['مستطيل طوله 9 وعرضه 4، مساحته:', ['13', '26', '36', '40'], 2, 'المساحة = الطول × العرض = 36.', 'المساحات', 'الهندسة'],
      ['العدد التالي في المتتابعة 2، 6، 18، ... هو:', ['24', '36', '54', '72'], 2, 'كل حد يساوي السابق × 3.', 'المتتابعات', 'الجبر'],
      ['إذا كانت النسبة بين أ و ب = 2 : 3 ومجموعهما 25، فإن أ =', ['8', '10', '12', '15'], 1, 'أ = 25 × 2/5 = 10.', 'التناسب', 'الحساب']],
    'لفظي': [['كتاب : مكتبة', ['سيارة : طريق', 'دواء : صيدلية', 'قلم : ورقة', 'باب : منزل'], 1, 'المكان الذي يُحفظ فيه الشيء ويُباع.', 'التناظر اللفظي', 'التناظر'],
      ['ضد كلمة «يُسرف»:', ['يبذّر', 'يقتصد', 'يُنفق', 'يجمع'], 1, 'الإسراف ضده الاقتصاد.', 'المفردات', 'المفردات'],
      ['الكلمة الشاذة: (شمس، قمر، نجم، سحاب)', ['شمس', 'قمر', 'نجم', 'سحاب'], 3, 'السحاب ليس جرمًا سماويًا.', 'المفردة الشاذة', 'المفردات'],
      ['أكمل: «العلمُ في الصغر كالنقشِ على ....»', ['الورق', 'الحجر', 'الرمل', 'الماء'], 1, 'مثل مشهور يدل على الثبات.', 'إكمال الجمل', 'الجمل'],
      ['معنى «الوَجِل»:', ['الخائف', 'الكريم', 'المسرع', 'الحزين'], 0, 'الوجل هو الخوف.', 'المفردات', 'المفردات'],
      ['شجرة : غابة', ['نجمة : مجرّة', 'ماء : بحر', 'رمل : صحراء', 'كل ما سبق'], 3, 'الجزء إلى الكل في كل الخيارات.', 'التناظر اللفظي', 'التناظر']],
  };
  D.questions = []; D.attempts = []; D.ratings = []; D.messages = [];
  for(const section of ['boys', 'girls']) for(const subject of ['كمي', 'لفظي']) {
    const t = (D.teachers || []).find(x => x.section === section && x.subjects.includes(subject));
    Q[subject].forEach(([text, options, correct, explanation, skill, unit]) => D.questions.push({ id:uid(), section, subject, unit, skill, text, options, correct, explanation, difficulty:'متوسط', status:'published', teacher_id:t?.id || null, version:1, created_at:new Date().toISOString() }));
    if(t) D.assignments.push({ id:uid(), teacher_id:t.id, section, subject, title:`تدريبات ${subject} — الأسبوع الحالي`, body:'حل التمارين من 1 إلى 10 في ملزمة الوحدة، واكتب خطوات الحل.', publish_date:addDays(n.date, -3), due_date:addDays(n.date, 2), max_score:10, created_at:new Date().toISOString() });
  }
}
