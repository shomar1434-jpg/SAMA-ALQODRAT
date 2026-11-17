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

/* =====================================================================
   الخطوة BC (قرار المالك 17 نوفمبر): قاعة Zoom ثابتة لكل مدرب وجدول أسبوعي ثابت تُولَّد منه محاضرات كل يوم،
   والبث على قناة يوتيوب المركز (غير مدرج) يُجلب آليًا بعد ربط القناة ويُسند إلى المحاضرة بالموعد.
   ↔ …_studio_channel.sql (lecture_slots، ensure_lectures، yt_assign، yt_upsert_videos، admin_save_slot، admin_assign_video)
   ===================================================================== */
export const DOW_TXT = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const SLOT_AHEAD_DAYS = 8;                 // تُولَّد محاضرات اليوم والأيام السبعة التالية
export const ASSIGN_EARLY_MIN = 30;               // يُقبل بث بدأ قبل الموعد بنصف ساعة
export const zoomOk = u => u === '' || /^https:\/\/([a-z0-9-]+\.)*zoom\.us\/(j|my|w|s)\/[A-Za-z0-9._?=&\/-]+$/i.test(String(u));
export const channelOk = c => c === '' || /^UC[A-Za-z0-9_-]{22}$/.test(String(c));
export const channelLiveEmbed = ch => `https://www.youtube.com/embed/live_stream?channel=${ch}&rel=0&playsinline=1`;
const dowOfDate = d => new Date(d + 'T12:00:00Z').getUTCDay();
const addD = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
export const riyadhIso = (date, hm) => new Date(`${date}T${hm.slice(0, 5)}:00+03:00`).toISOString();

/* التحقق من موعد ثابت؛ النطاق مقرر من مقررات المدرب لقسمه أو دفعة مسندة إليه */
export function checkSlot(f, teacher, cohorts = []){
  if(!teacher) throw new Error('اختر المدرب');
  const title = String(f.title || '').trim(); if(title.length < 3 || title.length > 120) throw new Error('اكتب عنوان المحاضرة (3 إلى 120 حرفًا)');
  const dow = [...new Set((f.dow || []).map(Number))].filter(x => x >= 0 && x <= 6).sort(); if(!dow.length) throw new Error('اختر يومًا واحدًا على الأقل');
  const hm = String(f.start_time || '').slice(0, 5); if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(hm)) throw new Error('حدّد وقت البداية');
  const minutes = Math.floor(+f.minutes); if(!(minutes >= LEC_MIN[0] && minutes <= LEC_MIN[1])) throw new Error(`مدة المحاضرة من ${LEC_MIN[0]} إلى ${LEC_MIN[1]} دقيقة`);
  const cohort_id = f.cohort_id || null, subject = cohort_id ? null : String(f.subject || '');
  if(cohort_id ? !cohorts.some(c => c.id === cohort_id && c.teacher_id === teacher.id) : !(teacher.subjects || []).includes(subject)) throw new Error('المقرر أو الدفعة خارج نطاق المدرب');
  return { teacher_id: teacher.id, title, dow, start_time: hm, minutes, subject, cohort_id, section: cohort_id ? 'all' : teacher.section, recording: f.recording !== false && f.recording !== 'false', active: f.active !== false };
}

/* محاضرات الجدول الثابت لفترة (محليًا ↔ ensure_lectures): يوم القسم بلا جلسة (عطلة) يُتخطى، والدفعة داخل مدتها فقط */
export function slotLectures(D, from, days = SLOT_AHEAD_DAYS, sessionOn = null){
  const out = [], have = new Set((D.lectures || []).filter(l => l.slot_id).map(l => l.slot_id + '|' + l.slot_date));
  for(const s of (D.lecture_slots || []).filter(x => x.active !== false)){
    const c = s.cohort_id ? (D.cohorts || []).find(x => x.id === s.cohort_id) : null; if(s.cohort_id && (!c || c.archived_at)) continue;
    for(let i = 0; i < days; i++){ const d = addD(from, i);
      if(!s.dow.includes(dowOfDate(d)) || have.has(s.id + '|' + d)) continue;
      if(c && (d < c.start_date || d > c.end_date)) continue;
      if(!c && sessionOn && ['boys', 'girls'].includes(s.section) && !sessionOn(D, s.section, d)) continue;
      out.push({ slot_id: s.id, slot_date: d, teacher_id: s.teacher_id, section: s.section, subject: s.subject, cohort_id: s.cohort_id, title: s.title,
        starts_at: riyadhIso(d, s.start_time), minutes: s.minutes, recording: s.recording !== false, youtube_id: '', status: 'scheduled' }); } }
  return out;
}

/* إسناد بثوث القناة إلى المحاضرات (↔ yt_assign): بث بدأ فعلًا بين (الموعد − 30 دقيقة) ونهاية المحاضرة؛
   عند تعدد المحاضرات المرشحة يُختار من يحمل عنوان البث وسمَ مدربها (teachers.yt_tag)، وإلا يُترك للإسناد اليدوي */
export function assignVideos(lectures, videos, teachers = []){
  const res = [], used = new Set(lectures.filter(l => l.youtube_id).map(l => l.youtube_id)), taken = new Set();
  for(const v of [...videos].filter(v => v.actual_start && !v.lecture_id && !used.has(v.video_id)).sort((a, b) => a.actual_start.localeCompare(b.actual_start))){
    const t = Date.parse(v.actual_start);
    const cand = lectures.filter(l => l.status !== 'cancelled' && !l.youtube_id && !taken.has(l.id) && t >= Date.parse(l.starts_at) - ASSIGN_EARLY_MIN * 60000 && t <= lectureEndMs(l));
    const tag = l => (teachers.find(x => x.id === l.teacher_id)?.yt_tag || '').trim();
    const tagged = cand.filter(l => tag(l) && String(v.title || '').includes(tag(l)));
    const pick = tagged.length === 1 ? tagged[0] : cand.length === 1 ? cand[0] : null;
    if(pick){ taken.add(pick.id); res.push({ video_id: v.video_id, lecture_id: pick.id }); }
  }
  return res;
}
