/* تنبيه غياب باقات القدرات والتحصيلي (الخطوة BM، قرار المالك 18 نوفمبر)
   إذا زاد غياب المتدرب في أي باقة عن ABS_AFTER (3) — أي من الغياب الرابع ثم مع كل غياب بعده — يظهر للمسؤول تنبيه
   برسالة جاهزة لولي الأمر (أو للمتدرب إن لم يُسجَّل جوال ولي أمر). المسؤول يختار «إرسال لولي الأمر» (يفتح واتساب على جهازه
   والرسالة مكتوبة؛ لا إرسال آلي) أو «إلغاء الرسالة». القرار يُحفظ لكل (اشتراك، عدد غياب) في absence_alerts ↔ admin_absence_alert. */
import { CENTER } from './catalog.js';
import { intlPhone, waTo } from './absence_notify.js';
import { subStats, subStatus, planName } from './qudurat.js';
import { fmtDate, fmtNum, riyadhNow, nameCmp } from './utils.js';
import { ic } from './views2_head.js';

export const ABS_AFTER = 3;
export const absAfter = D => { const v = Number(D?.settings?.absence_alert_after); return Number.isInteger(v) && v >= 1 && v <= 30 ? v : ABS_AFTER; };

/* نص الرسالة الجاهزة: لولي الأمر بصيغة الابن أو الابنة، أو للمتدرب نفسه */
export function absenceAlertText(t, toGuardian, planTxt, absent, rate, date){
  const girl = t.gender === 'أنثى', name = String(t.full_name || '').trim(), days = `${fmtNum(absent)} ${absent <= 10 ? 'أيام' : 'يومًا'}`;
  const head = toGuardian
    ? `السلام عليكم ورحمة الله وبركاته\nولي أمر ${girl ? 'المتدربة' : 'المتدرب'}: ${name}\nنفيدكم بأن غياب ${girl ? 'ابنتكم' : 'ابنكم'} في ${planTxt} بلغ ${days} حتى ${fmtDate(date)}${rate != null ? `، ونسبة حضور${girl ? 'ها' : 'ه'} ${fmtNum(rate)}٪` : ''}.\nنأمل التعاون معنا في الحرص على انتظام${girl ? 'ها' : 'ه'} في الحضور حفاظًا على استفادت${girl ? 'ها' : 'ه'}.`
    : `السلام عليكم ورحمة الله وبركاته\n${girl ? 'المتدربة' : 'المتدرب'}: ${name}\nبلغ غيابك في ${planTxt} ${days} حتى ${fmtDate(date)}${rate != null ? `، ونسبة حضورك ${fmtNum(rate)}٪` : ''}.\nنأمل الحرص على الانتظام في الحضور.`;
  return `${head}\nللاستفسار التواصل معنا عبر واتساب المركز:\n${CENTER.whatsappLink}\n${CENTER.name}`;
}

/* التنبيهات القائمة: اشتراك نشط (غير تجريبي) زاد غيابه عن الحد، ولم يُتخذ قرار عند هذا العدد أو بعده */
export function absenceAlerts(D, n = riyadhNow()){
  const after = absAfter(D), done = new Map();
  (D.absence_alerts || []).forEach(a => done.set(a.subscription_id, Math.max(done.get(a.subscription_id) || 0, +a.level || 0)));
  const out = [];
  for(const s of D.subscriptions || []){
    if(subStatus(s, n.date) !== 'active') continue;
    const t = (D.trainees || []).find(x => x.id === s.trainee_id); if(!t || t.is_test) continue;
    const st = subStats(D, s, n); if(st.absent <= after || st.absent <= (done.get(s.id) || 0)) continue;
    const plan = (D.plans || []).find(p => p.id === s.plan_id), planTxt = plan ? `باقة «${planName(plan)}»` : 'باقة القدرات والتحصيلي';
    const g = intlPhone(t.guardian_phone), to = g ? 'guardian' : 'trainee', phone = g ? t.guardian_phone : t.phone;
    const text = absenceAlertText(t, !!g, planTxt, st.absent, st.rate, n.date);
    out.push({ sub_id:s.id, level:st.absent, t, plan, planTxt, absent:st.absent, rate:st.rate, consec:st.consec, to, phone, text, link:waTo(phone, text) });
  }
  return out.sort((a, b) => nameCmp(a.t.full_name, b.t.full_name));
}

/* شريط التنبيه في لوحة الإدارة (يُرسم داخل الصفحات ويربطه bindAbsenceAlerts) */
export function absenceBanner(D, n = riyadhNow()){
  const A = absenceAlerts(D, n); if(!A.length) return '';
  return `<div class="alert t-bad rv" data-absalert style="margin:10px 0;align-items:center"><span class="aic">${ic('alert')}</span><span style="flex:1"><b>تنبيه غياب:</b> ${fmtNum(A.length)} ${A.length === 1 ? 'متدرب زاد' : A.length === 2 ? 'متدربان زاد' : 'متدربين زاد'} غيابه في باقات القدرات والتحصيلي عن ${fmtNum(absAfter(D))} مرات، ومعه رسالة جاهزة لولي الأمر.</span>
    <button class="btn sm pri" id="absAlertBtn">عرض التنبيهات</button></div>`;
}
