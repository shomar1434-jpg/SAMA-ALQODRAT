/* =====================================================================
   إلغاء جلسات الباقات لفترة مع تعويض تلقائي (الخطوة BR، طلب المالك 22 نوفمبر)
   مطابق لـ admin_cancel_sessions / admin_revoke_session_break في
   supabase/migrations/…_session_breaks.sql — أي تعديل هنا يُعدَّل هناك.
   ===================================================================== */
import { addDays } from './utils.js';
import { sessionOn, subEnd, SECTIONS } from './qudurat.js';

export const BREAK_REASONS = { official:'إجازة رسمية', center:'عدم جاهزية المركز', eid:'إجازة العيد', other:'أخرى' };
export const BREAK_MAX_DAYS = 60, BREAK_BACK_DAYS = 7;
export const breakReasonText = (reason, note) => reason === 'other' ? String(note || '').trim() : (BREAK_REASONS[reason] || '');
const span = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 864e5);

/* التحقق من النموذج؛ يعيد رسالة الخطأ أو '' */
export function checkBreak(f, today){
  if(!f.from || !f.to) return 'حدد تاريخ البداية والنهاية';
  if(f.to < f.from) return 'تاريخ النهاية قبل البداية';
  if(span(f.from, f.to) > BREAK_MAX_DAYS) return `الفترة ${BREAK_MAX_DAYS} يومًا على الأكثر`;
  if(f.from < addDays(today, -BREAK_BACK_DAYS)) return `لا يُلغى ما مضى عليه أكثر من ${BREAK_BACK_DAYS} أيام`;
  if(!BREAK_REASONS[f.reason]) return 'اختر سبب الإلغاء';
  if(f.reason === 'other' && !String(f.note || '').trim()) return 'اكتب سبب الإلغاء';
  if(String(f.note || '').trim().length > 200) return 'السبب طويل';
  const secs = f.sections || [];
  if(!secs.length || secs.some(s => !SECTIONS[s])) return 'القسم غير صالح';
  return '';
}

/* الخطة: الجلسات الملغاة لكل قسم، وتمديد كل اشتراك قائم بعدد ما فقده (النهاية = الجلسة رقم k بعد نهايته، تُتخطى الأيام الملغاة) */
export function planBreak(D, f, breakId = 'preview'){
  const secs = [...new Set(f.sections)], sessions = [], label = breakReasonText(f.reason, f.note);
  const exc = [...(D.schedule_exceptions || [])], comps = [];
  const E = { ...D, schedule_exceptions: exc };
  const lost = {};
  for(const sec of secs){
    const dates = [];
    for(let d = f.from; d <= f.to; d = addDays(d, 1)) if(sessionOn(E, sec, d)) dates.push(d);
    lost[sec] = dates; dates.forEach(date => { sessions.push({ section:sec, date }); exc.push({ id:`brk-${breakId}-${sec}-${date}`, date, section:sec, type:'cancel', note:label, break_id:breakId }); });
  }
  for(const sec of secs){
    const dates = lost[sec]; if(!dates.length) continue;
    for(const s of (D.subscriptions || []).filter(x => x.section === sec && x.status !== 'cancelled' && x.start_date)){
      const plan = (D.plans || []).find(p => p.id === s.plan_id), end = s.end_date || subEnd(plan, s.start_date);
      const k = dates.filter(d => d >= s.start_date && d <= end).length; if(!k) continue;
      let n = end, c = 0; const lim = addDays(end, 400);
      while(c < k && n < lim){ n = addDays(n, 1); if(sessionOn(E, sec, n)) c++; }
      comps.push({ subscription_id:s.id, trainee_id:s.trainee_id, section:sec, old_end:end, new_end:n, sessions:k });
    }
  }
  const groups = {};
  comps.forEach(c => { const key = [c.section, c.old_end, c.new_end, c.sessions].join('|'); (groups[key] = groups[key] || { section:c.section, old_end:c.old_end, new_end:c.new_end, sessions:c.sessions, n:0 }).n++; });
  const changes = Object.values(groups).sort((a, b) => a.section.localeCompare(b.section) || a.old_end.localeCompare(b.old_end));
  return { sessions, exceptions: exc.filter(x => x.break_id === breakId), comps, changes, affected: comps.length, reason: label };
}

/* نص الإشعار (مطابق لنص الخادم) */
export const breakNoteText = (c, f, label, first) => first
  ? `أُلغيت ${c.sessions} من جلسات ${first} بين ${f.from} و${f.to} (${label})، وعُوّضت بتمديد الباقة حتى ${c.new_end}.`
  : `أُلغيت ${c.sessions} من جلساتك بين ${f.from} و${f.to} (${label})، وعُوّضت بتمديد باقتك حتى ${c.new_end}. لا تُحتسب غيابًا.`;
