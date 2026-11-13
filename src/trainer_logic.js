/* =====================================================================
   بوابة المدرب: المجموعات الذكية (ديناميكية من بيانات الحضور والواجبات الحقيقية) وملف المدرب.
   العتبات من إعدادات المركز (حد الشهادة، الغياب المتتالي) لا أرقامًا ثابتة؛ ولا يُرسل شيء تلقائيًا:
   المجموعة تجهّز قائمة مستهدفين لواجب علاجي يعتمده المدرب. مطابق لـ …_trainer_portal.sql (الملف فقط).
   ===================================================================== */
import { addDays } from './utils.js';
import { subStatus } from './qudurat.js';

export const ENDING_DAYS = 14, LOW_ACH = 50, BIO_MAX = 600, AVATAR_MAX = 90000;
export const validTelegram = v => !v || /^https:\/\/t\.me\/[A-Za-z0-9_+/-]{3,80}$/.test(v);
export const validAvatar = v => !v || (/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= AVATAR_MAX);
export function checkProfile(p){
  const bio = String(p.bio ?? '').trim(), tg = String(p.telegram ?? '').trim(), av = String(p.avatar ?? '');
  if(bio.length > BIO_MAX) throw new Error(`النبذة أطول من ${BIO_MAX} حرف`); if(!validTelegram(tg)) throw new Error('رابط تيليجرام يبدأ بـ https://t.me/'); if(!validAvatar(av)) throw new Error('الصورة غير صالحة أو كبيرة');
  return { bio, telegram:tg, avatar:av };
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
