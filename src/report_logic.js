/* =====================================================================
   تقرير اليوم (وثيقة التطوير 3-أ-12): لقطة عند 20:30 بتوقيت الرياض، ثم مراجعات
   مرقّمة لا تغيّر اللقطة الأولى. لا يُختلق أي حدث: الحوادث من سجلات فعلية فقط.
   مقابله في SQL: generate_daily_report(date, kind).
   ===================================================================== */
import { riyadhNow, toMin, uid } from './utils.js';
import { sessionOn, subStatus, planName, SECTIONS } from './qudurat.js';
import { isSessionDay } from './data2.js';

export const REPORT_TIME = '20:30';
const FAIL_TXT = { not_in_cohort:'رقم غير مسجّل', no_session:'خارج وقت الجلسة', bad_code:'رمز يوم خاطئ', no_program:'باركود غير معروف', order_pending:'طلب غير معتمد', no_cohort:'لا دفعة منعقدة', error:'خطأ اتصال' };

/* يبني محتوى التقرير لتاريخ معيّن من مصدر البيانات الواحد */
export function buildDailyReport(D, date, n = riyadhNow()){
  const closed = date < n.date || toMin(n.hm) >= toMin(REPORT_TIME);
  const sections = Object.keys(SECTIONS).map(sec => {
    const ses = sessionOn(D, sec, date);
    const testIds = new Set((D.trainees || []).filter(t => t.is_test).map(t => t.id));
    const subs = (D.subscriptions || []).filter(s => !testIds.has(s.trainee_id) && s.section === sec && s.status !== 'cancelled' && (!s.start_date || s.start_date <= date) && (!s.end_date || s.end_date >= date) && ['pending', 'active', 'ended'].includes(subStatus(s, date)));
    const rows = ses ? subs.map(s => { const t = D.trainees.find(x => x.id === s.trainee_id), a = (D.sub_attendance || []).find(x => x.subscription_id === s.id && x.att_date === date);
      const done = date < n.date || toMin(n.hm) > toMin(ses.end);
      return { name:t?.full_name || '—', plan:planName((D.plans || []).find(p => p.id === s.plan_id)), status: a ? a.status : done ? 'غائب' : 'لم يسجل بعد', time:a?.time?.slice(0, 5) || null, manual:!!a?.manual, pending:!s.start_date }; })
      .sort((a, b) => a.name.localeCompare(b.name, 'ar')) : [];
    return { key:sec, label:SECTIONS[sec], session:ses, rows };
  });
  const cohorts = (D.cohorts || []).filter(c => isSessionDay(c, date) && !(c.archived_at && c.archived_at.slice(0, 10) < date)).map(c => {
    const p = D.programs.find(x => x.id === c.program_id), ens = (D.enrollments || []).filter(e => e.cohort_id === c.id && e.status !== 'ملغى' && !(D.trainees || []).find(t => t.id === e.trainee_id)?.is_test);
    const done = date < n.date || toMin(n.hm) > toMin(c.end_time);
    const rows = ens.map(e => { const t = D.trainees.find(x => x.id === e.trainee_id), a = (D.attendance || []).find(x => x.enrollment_id === e.id && x.att_date === date);
      return { name:t?.full_name || '—', status: a ? a.status : done ? 'غائب' : 'لم يسجل بعد', time:a?.time?.slice(0, 5) || null, manual:!!a?.manual }; }).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return { key:c.id, label:`${p?.name || ''} · الدفعة ${c.number}`, session:{ start:c.start_time, end:c.end_time }, rows };
  });
  const all = [...sections, ...cohorts].flatMap(g => g.rows);
  const count = st => all.filter(r => r.status === st).length;
  const att = (D.checkin_attempts || []).filter(a => a.date === date);
  const fails = {}; att.filter(a => !['ok', 'already'].includes(a.result)).forEach(a => { fails[a.result] = (fails[a.result] || 0) + 1; });
  const byDev = {}; att.filter(a => ['ok', 'already'].includes(a.result) && a.device && a.trainee_hint).forEach(a => { (byDev[a.device] = byDev[a.device] || new Set()).add(a.trainee_hint); });
  const incidents = [
    ...Object.entries(fails).map(([k, v]) => ({ type:'checkin_fail', text:`محاولات تحضير مرفوضة: ${FAIL_TXT[k] || k}`, count:v })),
    ...(att.filter(a => a.result === 'already').length ? [{ type:'duplicate', text:'مسح مكرر في اليوم نفسه (لم يُحتسب مرتين)', count:att.filter(a => a.result === 'already').length }] : []),
    ...Object.values(byDev).filter(s => s.size > 1).map(s => ({ type:'device', text:'تحضير أكثر من متدرب من جهاز واحد', count:s.size })),
    ...(D.audit_logs || []).filter(l => l.action === 'attendance.manual' && l.at && l.detail?.date === date).map(() => ({ type:'manual', text:'تصحيح حضور يدوي من الإدارة', count:1 })),
  ];
  const merged = {}; incidents.forEach(i => { const k = i.type + i.text; merged[k] = merged[k] ? { ...merged[k], count:merged[k].count + i.count } : { ...i }; });
  const tSent = {}; (D.notifications || []).filter(x => (x.date || x.at.slice(0, 10)) === date && String(x.sender).startsWith('teacher:')).forEach(x => {
    const t = (D.teachers || []).find(y => 'teacher:' + y.id === x.sender), k = t?.full_name || 'مدرب';
    tSent[k] = tSent[k] || { teacher:k, reminders:0, guardians:0 }; if(x.to === 'guardian') tSent[k].guardians++; else tSent[k].reminders++; });
  const homework = (D.assignments || []).filter(a => a.due_date === date).map(a => ({ title:a.title, section:SECTIONS[a.section], submitted:(D.submissions || []).filter(s => s.assignment_id === a.id && ['submitted', 'graded'].includes(s.status)).length }));
  return {
    date, closed, generated_at:new Date().toISOString(), generated_hm:n.date === date ? n.hm : null,
    summary:{ sessions_scheduled:[...sections, ...cohorts].filter(g => g.session).length, expected:all.length, present:count('حاضر'), late:count('متأخر'), absent:count('غائب'), pending:count('لم يسجل بعد'), excused:0 },
    groups:[...sections.filter(g => g.session), ...cohorts], incidents:Object.values(merged), teachers:Object.values(tSent), homework,
    completeness: closed ? 'مكتملة حتى وقت التوليد' : 'جزئية: اليوم لم ينتهِ بعد',
  };
}

/* لقطة أولى مرة واحدة لكل تاريخ، ثم مراجعات مرقّمة (لا تعديل خفي) */
export function makeReport(D, date, kind, note, n = riyadhNow()){
  const list = (D.daily_reports || []).filter(r => r.date === date).sort((a, b) => a.version - b.version);
  if(kind === 'snapshot' && list.length) return { existing:true, report:list[0] };
  if(kind === 'revision' && !list.length) kind = 'snapshot';
  const data = buildDailyReport(D, date, n);
  const prev = list[list.length - 1];
  const changes = prev ? diffSummary(prev.data.summary, data.summary) : [];
  return { existing:false, report:{ id:uid(), date, version:(prev?.version || 0) + 1, kind, status:'success', data, note:note || '', changes, generated_at:data.generated_at } };
}
export function diffSummary(a, b){
  const L = { present:'الحاضرون', late:'المتأخرون', absent:'الغائبون', pending:'لم يسجلوا', expected:'المتوقعون' };
  return Object.keys(L).filter(k => a[k] !== b[k]).map(k => `${L[k]}: ${a[k]} ← ${b[k]}`);
}
export const isPastReportTime = (n = riyadhNow()) => toMin(n.hm) >= toMin(REPORT_TIME);
