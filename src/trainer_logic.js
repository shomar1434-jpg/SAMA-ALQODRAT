/* =====================================================================
   بوابة المدرب: المجموعات الذكية (ديناميكية من بيانات الحضور والواجبات الحقيقية) وملف المدرب.
   العتبات من إعدادات المركز (حد الشهادة، الغياب المتتالي) لا أرقامًا ثابتة؛ ولا يُرسل شيء تلقائيًا:
   المجموعة تجهّز قائمة مستهدفين لواجب علاجي يعتمده المدرب. مطابق لـ …_trainer_portal.sql (الملف فقط).
   ===================================================================== */
import { addDays, matchQ } from './utils.js';
import { subStatus } from './qudurat.js';
import { teacherTeaches } from './learning_logic.js';

export const ENDING_DAYS = 14, LOW_ACH = 50, BIO_MAX = 600, AVATAR_MAX = 90000, CV_MAX = 2000, GROUP_NAME_MAX = 60, GROUPS_MAX = 30;
export const validTelegram = v => !v || /^https:\/\/t\.me\/[A-Za-z0-9_+/-]{3,80}$/.test(v);
export const validAvatar = v => !v || (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= AVATAR_MAX);
export function checkProfile(p){
  const bio = String(p.bio ?? '').trim(), tg = String(p.telegram ?? '').trim(), av = String(p.avatar ?? '');
  if(bio.length > BIO_MAX) throw new Error(`النبذة أطول من ${BIO_MAX} حرف`); if(!validTelegram(tg)) throw new Error('رابط تيليجرام يبدأ بـ https://t.me/'); if(!validAvatar(av)) throw new Error('الصورة غير صالحة أو كبيرة');
  const cv = String(p.cv ?? '').trim(); if(cv.length > CV_MAX) throw new Error(`السيرة أطول من ${CV_MAX} حرف`);
  return { bio, telegram:tg, avatar:av, cv };
}
/* واجبات المدرب المتأخرة لكل متدرب: منشورة، فات استحقاقها، مستهدَف بها، ولم يسلّمها */
export function overdueOf(D, teacher, trainee_id, today){
  return (D.assignments || []).filter(a => a.teacher_id === teacher.id && a.publish_date <= today && a.due_date < today && (!Array.isArray(a.targets) || a.targets.includes(trainee_id))
    && !(D.submissions || []).some(s => s.assignment_id === a.id && s.trainee_id === trainee_id && ['submitted', 'graded', 'needs_revision'].includes(s.status))).length;
}
/* dash = ناتج teacherDashboard. تُعاد المجموعات غير الفارغة فقط، وكل مجموعة: مفتاح، عنوان، سبب، أعضاء */
export function smartGroups(D, teacher, dash, today){
  const th = D.settings?.cert_threshold ?? 75, wc = D.settings?.warn_consec ?? 2, lim = addDays(today, ENDING_DAYS);
  const rows = dash.rows.map(r => { const s = (D.subscriptions || []).find(x => x.id === r.sub_id); return { ...r, overdue:overdueOf(D, teacher, r.trainee_id, today), end:s?.end_date || null, plan_id:s?.plan_id, live:s && subStatus(s, today) === 'active' }; });
  const G = (key, title, why, f, note) => ({ key, title, why, members:rows.filter(f).map(r => ({ trainee_id:r.trainee_id, name:r.name, plan:r.plan, note:note(r) })) });
  const out = [
    G('hw_late', 'متأخرون في الواجبات', 'لهم واجب فات موعده ولم يُسلَّم', r => r.overdue > 0, r => `${r.overdue} واجبًا متأخرًا`),
    G('low_att', 'حضور دون حد الاستحقاق', `نسبة الحضور أقل من ${th}٪`, r => r.rate != null && r.rate < th, r => `الحضور ${r.rate}٪`),
    G('consec', 'غياب متتالٍ', `غابوا ${wc} جلسات متتالية أو أكثر`, r => r.consec >= wc, r => `${r.consec} جلسات متتالية`),
    G('low_ach', 'إنجاز منخفض', `نسبة الإنجاز أقل من ${LOW_ACH}٪`, r => r.achievement?.overall != null && r.achievement.overall < LOW_ACH, r => `الإنجاز ${r.achievement.overall}٪`),
    G('ending', 'يقترب انتهاء اشتراكهم', `ينتهي الاشتراك خلال ${ENDING_DAYS} يومًا`, r => r.live && r.end && r.end <= lim, r => `ينتهي ${r.end}`),
  ];
  const plans = {}; rows.forEach(r => { (plans[r.plan] = plans[r.plan] || []).push(r); });
  if(Object.keys(plans).length > 1) Object.entries(plans).forEach(([p, m]) => out.push({ key:'plan:' + p, title:'باقة ' + p, why:'مشتركو الباقة', members:m.map(r => ({ trainee_id:r.trainee_id, name:r.name, plan:r.plan, note:'' })) }));
  return out.filter(g => g.members.length);
}
/* ملخص عمل اليوم */
export function daySummary(D, teacher, dash){
  const c = k => dash.rows.filter(r => r.today === k).length;
  return { total:dash.rows.length, present:c('حاضر'), late:c('متأخر'), absent:c('غائب'), pending:c('لم يسجل بعد'),
    to_grade:(D.submissions || []).filter(s => s.status === 'submitted' && (D.assignments || []).some(a => a.id === s.assignment_id && a.teacher_id === teacher.id)).length };
}

/* ---------- المجموعات المحفوظة: قائمة يدوية يسمّيها المدرب من متدربيه، تُستعمل هدفًا لواجب ---------- */
export function checkGroup(D, teacher, g){
  const name = String(g.name ?? '').trim(), ids = [...new Set(Array.isArray(g.trainee_ids) ? g.trainee_ids : [])];
  if(name.length < 2 || name.length > GROUP_NAME_MAX) throw new Error(`اسم المجموعة من حرفين إلى ${GROUP_NAME_MAX} حرفًا`);
  if(!ids.length) throw new Error('اختر متدربًا واحدًا على الأقل'); if(ids.length > 500) throw new Error('الحد 500 متدرب');
  if(ids.some(id => !teacherTeaches(D, teacher, id))) throw new Error('أحد المتدربين ليس ضمن متدربيك');
  return { name, trainee_ids:ids };
}
/* ---------- بطاقة المتدرب التفصيلية (للمدرب): من الحضور والواجبات الفعلية لواجبات هذا المدرب ---------- */
export const PEOPLE_FLAGS = { all:'الكل', hw_late:'متأخر في الواجبات', low_att:'حضور دون الحد', consec:'غياب متتالٍ', low_ach:'إنجاز منخفض', ending:'يقترب انتهاء اشتراكه' };
export function peopleRows(D, teacher, dash, today){
  const th = D.settings?.cert_threshold ?? 75, wc = D.settings?.warn_consec ?? 2, lim = addDays(today, ENDING_DAYS);
  return dash.rows.map(r => { const s = (D.subscriptions || []).find(x => x.id === r.sub_id), overdue = overdueOf(D, teacher, r.trainee_id, today), end = s?.end_date || null, live = !!s && subStatus(s, today) === 'active';
    const flags = []; if(overdue > 0) flags.push('hw_late'); if(r.rate != null && r.rate < th) flags.push('low_att'); if(r.consec >= wc) flags.push('consec');
    if(r.achievement?.overall != null && r.achievement.overall < LOW_ACH) flags.push('low_ach'); if(live && end && end <= lim) flags.push('ending');
    return { ...r, overdue, end, flags }; });
}
export const peopleFilter = (rows, f) => { return rows.filter(r => matchQ(f?.q, r.name) && (!f?.plan || r.plan === f.plan) && (!f?.flag || f.flag === 'all' || r.flags.includes(f.flag))); };
export function traineeCard(D, teacher, row, today){
  const id = row.trainee_id, mine = (D.assignments || []).filter(a => a.teacher_id === teacher.id && a.publish_date <= today && (!Array.isArray(a.targets) || a.targets.includes(id)));
  const sub = a => (D.submissions || []).find(s => s.assignment_id === a.id && s.trainee_id === id), done = mine.filter(a => ['submitted', 'graded', 'needs_revision'].includes(sub(a)?.status));
  const graded = done.filter(a => sub(a).status === 'graded' && sub(a).score != null && a.max_score > 0);
  const days = row.end ? Math.round((Date.parse(row.end) - Date.parse(today)) / 86400000) : null;
  return { trainee_id:id, name:row.name, plan:row.plan, rate:row.rate, consec:row.consec || 0, achievement:row.achievement?.overall ?? null, end:row.end, days_left:days, flags:row.flags || [],
    hw:{ assigned:mine.length, done:done.length, overdue:row.overdue ?? overdueOf(D, teacher, id, today), late:done.filter(a => sub(a).late).length,
      avg:graded.length ? Math.round(graded.reduce((n, a) => n + sub(a).score / a.max_score * 100, 0) / graded.length) : null },
    recent:done.slice().sort((a, b) => String(sub(b).submitted_at || '').localeCompare(String(sub(a).submitted_at || ''))).slice(0, 5)
      .map(a => { const s = sub(a); return { title:a.title, status:s.status, score:s.score ?? null, max:a.max_score, late:!!s.late, at:(s.submitted_at || '').slice(0, 10) }; }) };
}
