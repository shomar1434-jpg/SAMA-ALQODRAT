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
  return (D.assignments || []).filter(a => a.publish_date <= n.date && subs.some(s => inScope(s, a.section, a.subject)) && isTargeted(a, trainee_id))
    .map(a => { const sb = mine.find(x => x.assignment_id === a.id);
      const state = sb ? sb.status : a.due_date < n.date ? 'late' : 'new';
      return { ...a, submission:sb || null, state }; })
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
}
/* ---------- محرر الواجبات: النوع، سياسة إظهار الإجابات، والاستهداف بقائمة ثابتة ---------- */
export const HW_TYPES = { homework:'واجب', practice:'تدريب', exam:'اختبار رسمي' };
export const REVEAL = { after_submit:'بعد التسليم مباشرة', after_due:'بعد موعد الاستحقاق', never:'لا تُعرض' };
/* targets = null يعني كل متدربي القسم والمقرر؛ وإلا قائمة ثابتة وقت الإرسال */
export const isTargeted = (a, trainee_id) => !Array.isArray(a.targets) || a.targets.includes(trainee_id);
/* حد المحاولات: يحدده المدرب للاختبار (1 افتراضيًا، حتى 3)؛ تُحتسب أعلى درجة، وتظهر الإجابات بعد آخر محاولة */
export const MAX_ATTEMPTS = 3;
export const attemptsOf = a => Math.min(MAX_ATTEMPTS, Math.max(1, +a?.max_attempts || 1));
export const attemptsLeft = (a, s) => a?.kind === 'quiz' && s?.status === 'graded' ? Math.max(0, attemptsOf(a) - (s.attempt_no || 1)) : 0;
export const canReveal = (a, today) => (a.reveal || 'after_submit') === 'after_submit' || (a.reveal === 'after_due' && today > a.due_date);
/* نسخة الواجب للمتدرب: بلا مفاتيح وبلا معرّفات زملائه في قائمة المستهدفين */
export const assignmentPublic = (a, ids, started) => { let x = quizPublic(a); if(Array.isArray(x.targets)) x = { ...x, targets:x.targets.filter(t => (ids || []).includes(t)) };
  return x.kind === 'quiz' && !started ? { ...x, quiz:null, quiz_count:(a.quiz || []).length, quiz_minutes:quizMinutes(a) } : x.kind === 'quiz' ? { ...x, quiz_count:(a.quiz || []).length, quiz_minutes:quizMinutes(a) } : x; };
/* الاختبار يُفتح مرة واحدة: أسئلته لا تُرسل للمتدرب قبل أن يبدأ؛ ومدته دقيقتان لكل سؤال من لحظة البدء؛ تُحفظ إجاباته أولًا بأول ويُصحَّح ما حُفظ عند انتهاء الوقت */
export const QUIZ_MIN_PER_Q = 2, QUIZ_GRACE_SEC = 20;
export const quizMinutes = a => (a.quiz || []).length * QUIZ_MIN_PER_Q || a.quiz_minutes || 0;
export const quizDeadline = (started_at, a) => new Date(Date.parse(started_at) + quizMinutes(a) * 60000).toISOString();
export const quizOpen = (sb, now = Date.now()) => !!sb && sb.status === 'draft' && !!sb.deadline && now <= Date.parse(sb.deadline) + QUIZ_GRACE_SEC * 1000;
export const quizExpired = (sb, now = Date.now()) => !!sb && sb.status === 'draft' && !!sb.deadline && now > Date.parse(sb.deadline) + QUIZ_GRACE_SEC * 1000;   // يبقى من القائمة أبناء هذا الحساب فقط
/* تسليم المتدرب: تُحجب المراجعة (الإجابات الصحيحة) حتى تسمح سياسة الواجب */
export const submissionPublic = (s, a, today) => !a || a.kind !== 'quiz' || (canReveal(a, today) && !attemptsLeft(a, s)) ? s : (({ review, ...x }) => ({ ...x, review_hidden:true }))(s);
/* التحقق من المستهدفين: كلهم ضمن نطاق المدرب (قسمه ومقرر الواجب باشتراك قائم) */
export function checkTargets(D, teacher, subject, targets){
  if(targets == null) return null; if(!Array.isArray(targets) || !targets.length) throw new Error('اختر متدربًا واحدًا على الأقل'); const ids = [...new Set(targets)];
  if(ids.length > 500) throw new Error('الحد 500 متدرب'); if(ids.some(id => !studentHasScope(D, id, teacher.section, subject))) throw new Error('أحد المستهدفين ليس ضمن متدربي هذا المقرر');
  return ids;
}
/* الاختبار الرسمي لا يُنشر إلا بمفاتيح معتمدة (أسئلة البنك المشترك) */
export function checkExamKeys(D, quiz){ const bad = (quiz || []).filter(q => { const x = (D.questions || []).find(y => y.id === q.id); return x?.shared && x.key_status !== 'approved'; });
  if(bad.length) throw new Error(`الاختبار الرسمي يحتاج مفاتيح معتمدة: ${bad.length} سؤالًا مفتاحه غير معتمد. اطلب اعتماد المفاتيح من الإدارة أو اختر «واجب» أو «تدريب».`); }
export function validateAssignment(a){
  if(a.type && !HW_TYPES[a.type]) throw new Error('نوع غير صالح'); if(a.max_attempts != null && a.max_attempts !== '' && !(Number.isInteger(+a.max_attempts) && +a.max_attempts >= 1 && +a.max_attempts <= MAX_ATTEMPTS)) throw new Error(`عدد المحاولات من 1 إلى ${MAX_ATTEMPTS}`); if(a.reveal && !REVEAL[a.reveal]) throw new Error('سياسة إظهار الإجابات غير صالحة');
  if(!a.title || a.title.trim().length < 3) throw new Error('اكتب عنوان الواجب');
  if(!SUBJECTS.includes(a.subject)) throw new Error('اختر المقرر');
  if(!a.publish_date || !a.due_date || a.due_date < a.publish_date) throw new Error('تاريخ الاستحقاق يجب أن يكون بعد تاريخ النشر');
}

/* ---------- بنوك الأسئلة واختبار قياس المستوى ---------- */
export const bankKey = (section, subject) => `${section}:${subject}`;
/* بنك كل مدرب مستقل: teacher_id يحدد صاحب البنك (إن مُرّر) */
export function bankFor(D, section, subject, unit, published = true, teacher_id = null){
  return (D.questions || []).filter(q => q.subject === subject && (!unit || q.unit === unit) && (!published || q.status === 'published') && (q.shared ? true : q.section === section && (!teacher_id || q.teacher_id === teacher_id)));
}
/* البنك المشترك: محتوى واحد لكل مقرر يراه كل مدرب مكلف به (بنين وبنات)؛ الواجبات والنتائج تبقى لكل مدرب */
export const KEY_ST = { unverified:'مفتاح غير معتمد', approved:'مفتاح معتمد' };
export const LETTERS = ['أ', 'ب', 'ج', 'د'];
export const teacherBank = (D, me) => (D.questions || []).filter(q => q.status !== 'deleted' && (q.shared ? (me.subjects || []).includes(q.subject) : q.teacher_id === me.id));
/* مسار صورة السؤال: رابط كامل أو data: كما هو، وإلا يُلحق بقاعدة التخزين */
export const assetUrl = (path, base) => !path ? '' : /^(data:image\/|https?:\/\/)/.test(path) ? path : base ? String(base).replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '') : '';
/* حزمة بنك مشترك (ناتج scripts/build_bank_bundle.mjs): تحقق وتطبيع قبل الاستيراد */
export function normalizeBundle(b){
  if(!b || !SUBJECTS.includes(b.subject) || !Array.isArray(b.questions) || !b.questions.length) throw new Error('ملف البنك غير صالح: يلزم المقرر وقائمة الأسئلة');
  const seen = new Set();
  return { subject:b.subject, title:String(b.title || '').slice(0, 120), questions:b.questions.map((q, i) => { const code = String(q.code || '').trim(), c = typeof q.correct === 'number' ? q.correct : LETTERS.indexOf(String(q.correct || '').trim());
    if(!/^[A-Za-z0-9_-]{2,30}$/.test(code)) throw new Error(`السؤال ${i + 1}: الرمز غير صالح`); if(seen.has(code)) throw new Error(`الرمز ${code} مكرر`); seen.add(code);
    if(!(c >= 0 && c < 4)) throw new Error(`${code}: الإجابة الصحيحة غير محددة`); if(!q.image && !String(q.text || '').trim()) throw new Error(`${code}: بلا صورة ولا نص`);
    return { code, unit:String(q.unit || 'عام').trim().slice(0, 80), skill:String(q.skill || '').trim().slice(0, 120), order:+q.order || i + 1, text:String(q.text || '').trim(), image:String(q.image || ''), page_image:String(q.page_image || ''), correct:c,
      key_status:q.key_status === 'approved' ? 'approved' : 'unverified', key_source:String(q.key_source || '').slice(0, 160), status:q.active === false ? 'draft' : 'published', difficulty:String(q.difficulty || 'متوسط').slice(0, 20) }; }) };
}
/* وحدات البنوك المتاحة لمتدرب: لكل مدرب يدرّسه (القسم × المقرر) وحداته المنشورة وعددها */
export function bankUnitsOf(D, subs, teachers){
  const scopes = new Set(subs.flatMap(s => (s.subjects || []).map(x => s.section + ':' + x))), units = {};
  (D.questions || []).filter(q => q.status === 'published' && q.teacher_id && scopes.has(q.section + ':' + q.subject)).forEach(q => {
    const t = (teachers || []).find(x => x.id === q.teacher_id && teacherCovers(x, q.section, q.subject)); if(!t) return;
    const k = [q.section, q.subject, q.unit || 'عام', q.teacher_id].join('|'); units[k] = units[k] || { section:q.section, subject:q.subject, unit:q.unit || 'عام', teacher_id:q.teacher_id, teacher_name:t.full_name, count:0 }; units[k].count++; });
  for(const s of subs) for(const x of s.subjects || []) for(const t of (teachers || []).filter(y => teacherCovers(y, s.section, x)))
    (D.questions || []).filter(q => q.shared && q.status === 'published' && q.subject === x).forEach(q => { const k = [s.section, x, q.unit || 'عام', t.id].join('|'); units[k] = units[k] || { section:s.section, subject:x, unit:q.unit || 'عام', teacher_id:t.id, teacher_name:t.full_name, count:0, counted:new Set() };
      if(units[k].counted && !units[k].counted.has(q.id)){ units[k].counted.add(q.id); units[k].count++; } });
  Object.values(units).forEach(u => delete u.counted);
  return Object.values(units).sort((a, b) => (a.subject + a.teacher_name + a.unit).localeCompare(b.subject + b.teacher_name + b.unit, 'ar'));
}
export function validateQuestion(q){
  if(!q.image && (!q.text || q.text.trim().length < 5)) throw new Error('اكتب نص السؤال');
  if(!Array.isArray(q.options) || q.options.filter(x => String(x || '').trim()).length !== 4) throw new Error('اكتب الخيارات الأربعة');
  if(!(q.correct >= 0 && q.correct < 4)) throw new Error('حدد الإجابة الصحيحة');
}
/* يبني محاولة من أسئلة منشورة في نطاق المتدرب، ويحفظ نسخة الأسئلة كما هي وقت المحاولة */
export function buildAttempt(D, trainee_id, section, subject, unit, count, teacher_id = null){
  const pool = bankFor(D, section, subject, unit, true, teacher_id).slice();
  if(!pool.length) throw new Error('لا توجد أسئلة منشورة في هذه الوحدة بعد');
  for(let i = pool.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const qs = pool.slice(0, Math.max(1, Math.min(count || 10, pool.length)));
  return { id:uid(), trainee_id, teacher_id:teacher_id || null, section, subject, unit:unit || null, started_at:new Date().toISOString(), submitted_at:null, minutes:Math.max(5, qs.length * 2),
    snapshot: qs.map(snapOf), answers:{}, score:null, total:qs.length };
}
export const snapOf = q => ({ id:q.id, text:q.text || '', options:q.options, correct:q.correct, explanation:q.explanation || '', skill:q.skill || '', version:q.version || 1, ...(q.image ? { image:q.image, page_image:q.page_image || '', code:q.code || '' } : {}) });
export const shuffle = a => { for(let i = a.length - 1; i > 0; i--){ const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

/* ---------- واجب اختبار من بنك المدرب ----------
   تُحفظ نسخة الأسئلة في الواجب وقت النشر (quiz)، ولا يرى المتدرب الإجابات الصحيحة إلا في مراجعة تسليمه. */
export function buildQuiz(D, teacher, subject, unit, count, ids){
  if(Array.isArray(ids) && ids.length){   // انتقاء أسئلة بعينها بترتيب المدرب
    if(ids.length > 100) throw new Error('الحد 100 سؤال في الواجب'); const all = bankFor(D, teacher.section, subject, null, true, teacher.id), picked = [...new Set(ids)].map(id => all.find(q => q.id === id));
    if(picked.some(q => !q)) throw new Error('أحد الأسئلة المختارة ليس منشورًا في بنكك'); return picked.map(snapOf); }
  const pool = shuffle(bankFor(D, teacher.section, subject, unit, true, teacher.id).slice());
  if(!pool.length) throw new Error('لا توجد أسئلة منشورة في بنكك لهذا المقرر' + (unit ? ' وهذه الوحدة' : ''));
  return pool.slice(0, Math.max(1, Math.min(+count || 10, 50, pool.length))).map(snapOf);
}
export const quizPublic = a => a.kind === 'quiz' && Array.isArray(a.quiz) ? { ...a, quiz:a.quiz.map(({ correct, explanation, ...q }) => q) } : a;
export function gradeQuiz(a, answers){
  const ans = {}, review = a.quiz.map(q => { const v = answers?.[q.id]; ans[q.id] = Number.isInteger(+v) && v !== null && v !== '' && +v >= 0 && +v < 4 ? +v : null;
    return { id:q.id, correct:q.correct, explanation:q.explanation || '' }; });
  const right = a.quiz.filter(q => ans[q.id] === q.correct).length;
  return { answers:ans, review, right, total:a.quiz.length, score:Math.round(right / a.quiz.length * (a.max_score || 10) * 10) / 10 };
}

/* ---------- استيراد بنك أسئلة (لصق من Excel أو ملف CSV) ----------
   الأعمدة: المقرر | الوحدة | المهارة | السؤال | أ | ب | ج | د | الصحيحة | التفسير | الصعوبة (اختياري) */
export const BANK_COLUMNS = ['المقرر', 'الوحدة', 'المهارة', 'السؤال', 'أ', 'ب', 'ج', 'د', 'الصحيحة', 'التفسير', 'الصعوبة'];
export const BANK_SAMPLE = 'كمي\tالجبر\tالمعادلات\tإذا كان 2س = 10 فإن س =\t2\t5\t8\t10\tب\tنقسم الطرفين على 2\tسهل';
const AR_DIG = s => String(s ?? '').replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
export function correctIndex(v){
  const x = AR_DIG(v).trim().toLowerCase().replace(/[()\.]/g, '');
  const map = { 'أ':0, 'ا':0, 'إ':0, 'a':0, '1':0, 'ب':1, 'b':1, '2':1, 'ج':2, 'c':2, '3':2, 'د':3, 'd':3, '4':3 };
  return x in map ? map[x] : -1;
}
function splitLine(line, sep){
  if(sep === '\t') return line.split('\t');
  const out = []; let cur = '', q = false;
  for(let i = 0; i < line.length; i++){ const c = line[i];
    if(q){ if(c === '"' && line[i + 1] === '"'){ cur += '"'; i++; } else if(c === '"') q = false; else cur += c; }
    else if(c === '"') q = true; else if(c === sep){ out.push(cur); cur = ''; } else cur += c; }
  out.push(cur); return out;
}
export function parseBank(text, subjects){
  const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim());
  if(!lines.length) return { rows:[], errors:[{ line:0, msg:'لا توجد بيانات. الصق الأسئلة من الجدول أو اختر ملفًا.' }] };
  const sep = lines[0].includes('\t') ? '\t' : (lines[0].split(';').length > lines[0].split(',').length ? ';' : ',');
  const rows = [], errors = [];
  lines.forEach((l, i) => {
    const c = splitLine(l, sep).map(x => String(x || '').trim());
    if(i === 0 && /المقرر|السؤال/.test(c.join(' '))) return;                 // سطر العناوين
    const subject = c[0], q = { subject, unit:c[1] || 'عام', skill:c[2] || '', text:c[3] || '', options:[c[4], c[5], c[6], c[7]].map(x => x || ''),
      correct:correctIndex(c[8]), explanation:c[9] || '', difficulty:['سهل', 'متوسط', 'صعب'].includes(c[10]) ? c[10] : 'متوسط' };
    const why = !subjects.includes(subject) ? `المقرر «${subject || 'فارغ'}» ليس من مقررات المدرب (${subjects.join('، ')})`
      : q.text.length < 5 ? 'نص السؤال قصير أو فارغ' : q.options.some(o => !o) ? 'يلزم أربعة خيارات' : q.correct < 0 ? 'الإجابة الصحيحة: أ أو ب أو ج أو د' : '';
    if(why) errors.push({ line:i + 1, msg:why }); else rows.push(q);
  });
  return { rows, errors };
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
