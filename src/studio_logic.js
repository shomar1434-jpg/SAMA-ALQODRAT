/* =====================================================================
   استوديو سما للبث (الخطوة AZ، قرار المالك 17 نوفمبر): المدرب يشرح في قاعة Zoom المركز،
   ويُبث الشرح إلى يوتيوب، ويظهر البث في بوابة المتدرب (مشغّل مضمَّن مع ملء الشاشة) لمن يحق له فقط.
   ↔ supabase/migrations/…_studio.sql (lecture_state، lecture_can_watch، teacher_save_lecture، portal_data).
   الحالة من الموعد والمدة وإنهاء المدرب؛ ومعرّف الفيديو لا يُرسل للمتدرب قبل 15 دقيقة من البداية،
   ولا بعد الانتهاء إلا إن أتاح المدرب التسجيل. «يوتيوب غير المدرج» ليس حماية تامة: من يملك الرابط يشاهده.
   ===================================================================== */
export const LIVE_EARLY_MIN = 15;
export const LEC_MIN = [15, 300];
export const LEC_STATE = { upcoming:'قادمة', live:'مباشر الآن', ended:'انتهت', cancelled:'ملغاة' };
export const LEC_TONE = { upcoming:'info', live:'bad', ended:'g', cancelled:'g' };
/* يقبل رابط يوتيوب بأي صيغة شائعة أو المعرّف نفسه (11 حرفًا) */
export function ytId(s){
  const v = String(s || '').trim(); if(!v) return '';
  if(/^[A-Za-z0-9_-]{11}$/.test(v)) return v;
  const m = v.match(/(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:[^#]*&)?v=|live\/|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}
export const embedUrl = id => `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
export const lectureEndMs = l => Date.parse(l.starts_at) + (+l.minutes || 0) * 60000;
export function lectureState(l, now = Date.now()){
  if(l.status === 'cancelled') return 'cancelled';
  if(l.status === 'ended' || now > lectureEndMs(l)) return 'ended';
  return now >= Date.parse(l.starts_at) ? 'live' : 'upcoming';
}
export function canWatch(l, now = Date.now()){
  const st = lectureState(l, now);
  return !!l.youtube_id && (st === 'live' || (st === 'upcoming' && Date.parse(l.starts_at) - now <= LIVE_EARLY_MIN * 60000) || (st === 'ended' && !!l.recording));
}
export const lecturePublic = (l, now = Date.now()) => ({ id:l.id, teacher_id:l.teacher_id, subject:l.subject || null, cohort_id:l.cohort_id || null, section:l.section, title:l.title,
  starts_at:l.starts_at, minutes:l.minutes, status:l.status, recording:!!l.recording, youtube_id:canWatch(l, now) ? l.youtube_id : null });
/* التحقق من بيانات المحاضرة؛ النطاق مقرر من مقررات المدرب أو دفعة مسندة إليه */
export function checkLecture(f, teacher, cohortIds = []){
  const title = String(f.title || '').trim(); if(title.length < 3 || title.length > 120) throw new Error('اكتب عنوان المحاضرة (3 إلى 120 حرفًا)');
  const minutes = Math.floor(+f.minutes); if(!(minutes >= LEC_MIN[0] && minutes <= LEC_MIN[1])) throw new Error(`مدة المحاضرة من ${LEC_MIN[0]} إلى ${LEC_MIN[1]} دقيقة`);
  const t = Date.parse(f.starts_at); if(!Number.isFinite(t)) throw new Error('حدّد موعد المحاضرة');
  const yt = ytId(f.youtube); if(yt === null) throw new Error('رابط يوتيوب غير صحيح');
  const subject = f.cohort_id ? null : String(f.subject || ''), cohort_id = f.cohort_id || null;
  if(cohort_id ? !cohortIds.includes(cohort_id) : !(teacher.subjects || []).includes(subject)) throw new Error('المقرر أو الدفعة خارج نطاقك');
  return { title, minutes, starts_at:new Date(t).toISOString(), youtube_id:yt || '', subject, cohort_id, recording:f.recording !== false && f.recording !== 'false' };
}
/* محاضرات المتدرب (محليًا ↔ portal_data): مقرر من اشتراك قائم في قسمه، أو دفعة مسجّل فيها */
export function lecturesForTrainees(D, ids, now = Date.now()){
  const subs = (D.subscriptions || []).filter(s => ids.includes(s.trainee_id) && ['pending', 'active'].includes(s.status));
  const cids = (D.enrollments || []).filter(e => ids.includes(e.trainee_id) && e.status !== 'ملغى').map(e => e.cohort_id);
  return (D.lectures || []).filter(l => l.status !== 'cancelled' && (l.cohort_id ? cids.includes(l.cohort_id) : subs.some(s => s.section === l.section && (s.subjects || []).includes(l.subject))))
    .map(l => lecturePublic(l, now));
}
