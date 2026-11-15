/* =====================================================================
   تقرير ولي الأمر الأسبوعي (الخطوة AS): أسبوع الدراسة من الأحد إلى السبت.
   الحضور (جلسات الباقة ودفعات البرامج)، والواجبات، والتدريب والمحاكي، ونقاط الضعف،
   وملخص بجمل جاهزة. عرض فقط (لا يُحفظ)؛ والإشعار الأسبوعي داخلي يوم الخميس
   (weeklyNotes ↔ run_weekly_reports) ولا إرسال خارجي آلي.
   ===================================================================== */
import { addDays, riyadhNow, fmtShort, fmtNum } from './utils.js';
import { sessionOn, planName, SECTIONS } from './qudurat.js';
import { isTargeted } from './learning_logic.js';
import { answerLog, analyze } from './analysis_logic.js';
import { pct } from './sim_logic.js';

export const WEEK_NOTE_DOW = 4, WEEK_NOTE_HOUR = 18;   // الخميس 6 مساءً بتوقيت الرياض
const dow = d => new Date(d + 'T12:00:00Z').getUTCDay();
export const weekOf = d => { const from = addDays(d, -dow(d)); return { from, to:addDays(from, 6) }; };
const inR = (d, w) => !!d && d >= w.from && d <= w.to;
const dateOf = ts => ts ? new Date(Date.parse(ts) + 3 * 3600e3).toISOString().slice(0, 10) : '';
const live = (s, d) => ['pending', 'active'].includes(s.status) && (!s.start_date || s.start_date <= d) && (!s.end_date || s.end_date >= d);

export function weeklyReport(D, trainee_id, from, n = riyadhNow()){
  const w = { from, to:addDays(from, 6) }, upto = w.to < n.date ? w.to : n.date, t = (D.trainees || []).find(x => x.id === trainee_id) || { id:trainee_id };
  // الحضور: جلسات الباقة المنعقدة حتى اليوم (اليوم بعد نهاية جلسته)، ودفعات البرامج
  const days = [], att = { held:0, present:0, late:0, absent:[] };
  for(const s of (D.subscriptions || []).filter(x => x.trainee_id === trainee_id)){
    for(let d = w.from; d <= upto; d = addDays(d, 1)){ if(!live(s, d) || (s.track_from && d < s.track_from)) continue; const ses = sessionOn(D, s.section, d); if(!ses) continue;
      if(d === n.date && n.hm < String(ses.end).slice(0, 5)) continue;
      const a = (D.sub_attendance || []).find(x => x.subscription_id === s.id && x.att_date === d);
      att.held++; if(a){ att.present++; if(a.status === 'متأخر') att.late++; } else att.absent.push(d);
      days.push({ date:d, label:planName((D.plans || []).find(p => p.id === s.plan_id)), status:a ? a.status : 'غائب' }); } }
  for(const e of (D.enrollments || []).filter(x => x.trainee_id === trainee_id && x.status !== 'ملغى')){
    const c = (D.cohorts || []).find(x => x.id === e.cohort_id), pr = (D.programs || []).find(x => x.id === (c?.program_id || e.program_id));
    for(const a of (D.attendance || []).filter(x => x.enrollment_id === e.id && inR(x.att_date, w))){ att.held++; if(a.status === 'غائب'){ att.absent.push(a.att_date); } else { att.present++; if(a.status === 'متأخر') att.late++; }
      days.push({ date:a.att_date, label:pr?.name || 'برنامج', status:a.status }); } }
  days.sort((a, b) => a.date.localeCompare(b.date));
  // الواجبات: المنشورة له هذا الأسبوع أو المستحقة فيه
  const asg = (D.assignments || []).filter(a => isTargeted(a, trainee_id) && (inR(a.publish_date, w) || inR(a.due_date, w)) && a.publish_date <= upto
    && (D.subscriptions || []).some(s => s.trainee_id === trainee_id && s.section === a.section && (s.subjects || []).includes(a.subject)));
  const hw = asg.map(a => { const s = (D.submissions || []).find(x => x.assignment_id === a.id && x.trainee_id === trainee_id);
    const done = ['submitted', 'graded', 'needs_revision'].includes(s?.status);
    return { title:a.title, subject:a.subject, due:a.due_date, kind:a.kind, done, late:!!s?.late, score:s?.status === 'graded' && s.score != null ? `${s.score} / ${a.max_score}` : null, overdue:!done && a.due_date < n.date }; });
  // التدريب والمحاكي
  const ats = (D.attempts || []).filter(a => a.trainee_id === trainee_id && a.submitted_at && inR(dateOf(a.submitted_at), w));
  const answered = ats.reduce((s, a) => s + a.total, 0), right = ats.reduce((s, a) => s + (a.score || 0), 0);
  const sims = ats.filter(a => a.kind === 'sim').map(a => ({ date:dateOf(a.submitted_at), pct:pct(a.score, a.total), focus:a.focus || '' }));
  // الضعف: كل الإجابات حتى نهاية الأسبوع، ودقة هذا الأسبوع مقابل ما قبله
  const log = answerLog(D, trainee_id).filter(r => dateOf(r.at) <= w.to), an = analyze(log);
  const wk = log.filter(r => inR(dateOf(r.at), w)), before = log.filter(r => dateOf(r.at) < w.from);
  const acc = { week:wk.length ? pct(wk.filter(r => r.right).length, wk.length) : null, before:before.length ? pct(before.filter(r => r.right).length, before.length) : null };
  const r = { trainee:{ id:t.id, name:t.full_name || '', first:String(t.full_name || '').split(' ')[0] }, week:w, upto, attendance:{ ...att, rate:att.held ? pct(att.present, att.held) : null }, days, hw,
    hwDone:hw.filter(h => h.done).length, practice:{ attempts:ats.length, answered, right, pct:answered ? pct(right, answered) : null }, sims, analysis:an, accuracy:acc,
    sections:[...new Set((D.subscriptions || []).filter(s => s.trainee_id === trainee_id).map(s => SECTIONS[s.section]))] };
  r.summary = summaryOf(r); return r;
}

/* ملخص بجمل جاهزة، ونصائح عملية */
export function summaryOf(r){
  const out = [], tips = [], A = r.attendance, nm = r.trainee.first || 'المتدرب';
  if(A.held) out.push(`حضر ${nm} ${fmtNum(A.present)} من ${fmtNum(A.held)} ${A.held === 1 ? 'جلسة' : 'جلسات'}${A.late ? `، منها ${fmtNum(A.late)} بتأخر` : ''}.`); else out.push('لم تنعقد له جلسات هذا الأسبوع حتى الآن.');
  if(r.hw.length) out.push(`سلّم ${fmtNum(r.hwDone)} من ${fmtNum(r.hw.length)} ${r.hw.length === 1 ? 'واجب' : 'واجبات'}.`);
  if(r.practice.attempts) out.push(`حل ${fmtNum(r.practice.answered)} سؤالًا تدريبيًا بدقة ${fmtNum(r.practice.pct)}٪${r.sims.length ? `، وأدّى ${r.sims.length === 1 ? 'محاكيًا' : fmtNum(r.sims.length) + ' محاكيات'} آخرها ${fmtNum(r.sims.slice(-1)[0].pct)}٪` : ''}.`);
  else out.push('لم يحل تدريبات في المنصة هذا الأسبوع.');
  if(r.accuracy.week != null && r.accuracy.before != null){ const d = r.accuracy.week - r.accuracy.before; if(Math.abs(d) >= 5) out.push(d > 0 ? `تحسّنت دقته ${fmtNum(d)} نقطة عن الأسابيع السابقة.` : `تراجعت دقته ${fmtNum(-d)} نقطة عن الأسابيع السابقة.`); }
  if(A.absent.length) tips.push('الانتظام في الحضور؛ كل جلسة فائتة تؤثر في الاستيعاب ونسبة الحضور.');
  if(r.hw.some(h => h.overdue)) tips.push('إكمال الواجبات المتأخرة قبل نهاية الأسبوع.');
  if(r.analysis.weakest.length) tips.push(`التدريب على: ${r.analysis.weakest.map(w => w.category).join('، ')} (من «قياس مستواي» ← «تدرّب على هذه»).`);
  if(!r.practice.attempts) tips.push('حل تدريب سريع أو محاكٍ واحد على الأقل أسبوعيًا.');
  return { lines:out, tips };
}

/* إشعار داخلي أسبوعي لأولياء الأمور (↔ run_weekly_reports) */
export function weeklyNotes(D, n){
  if(dow(n.date) !== WEEK_NOTE_DOW || +n.hm.slice(0, 2) < WEEK_NOTE_HOUR) return [];
  const w = weekOf(n.date), out = [];
  const ids = [...new Set((D.guardian_links || []).filter(l => l.status === 'verified').map(l => l.trainee_id))]
    .filter(id => (D.subscriptions || []).some(s => s.trainee_id === id && live(s, n.date)) || (D.enrollments || []).some(e => e.trainee_id === id && e.status !== 'ملغى'));
  for(const id of ids){ const t = (D.trainees || []).find(x => x.id === id); if(!t) continue;
    out.push({ to:'guardian', trainee_id:id, date:n.date, kind:'weekly_report', sender:'system', dedupe_key:`weekly:g:${id}:${w.from}`,
      text:`تقرير أسبوع ${String(t.full_name).split(' ')[0]} جاهز: الحضور والواجبات والتدريب ونقاط التركيز. افتح «تقرير الأسبوع» في البوابة.` }); }
  return out;
}

/* نص مختصر للواتساب (يرسله المسؤول بنفسه) */
export function weeklyText(r){
  return [`تقرير الأسبوع (${fmtShort(r.week.from)} – ${fmtShort(r.week.to)}) — ${r.trainee.name}`, ...r.summary.lines, ...(r.summary.tips.length ? ['نوصي بـ:', ...r.summary.tips.map(x => '• ' + x)] : []), 'مركز سما القدرات للتدريب'].join('\n');
}
