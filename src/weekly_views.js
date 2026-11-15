/* =====================================================================
   تقرير ولي الأمر الأسبوعي (الخطوة AS): بطاقة في بوابة ولي الأمر بتنقل بين الأسابيع
   وطباعة A4، ونافذة للإدارة (من «المتدربون» ونافذة الاشتراك) فيها طباعة وزر واتساب
   يفتح رسالة جاهزة يرسلها المسؤول بنفسه.
   ===================================================================== */
import { $, esc, fmtNum, fmtShort, riyadhNow, addDays, DAYS } from './utils.js';
import { ic, toast } from './views2_head.js';
import { modal, closeModal } from './views2_programs.js';
import { weekOf, weeklyReport, weeklyText } from './weekly_logic.js';
import { LEVEL } from './analysis_logic.js';
import { docShell, printDocs, fmtGreg } from './print.js';
import { waTo } from './absence_notify.js';

const dowName = d => DAYS[new Date(d + 'T12:00:00Z').getUTCDay()];
const ST_PILL = { 'حاضر':'ok', 'متأخر':'warn', 'غائب':'bad' };
const pc = v => v == null ? '—' : fmtNum(v) + '٪';

export function weeklyBody(r){
  const A = r.attendance, an = r.analysis;
  return `<div class="wk">
    <div class="wk-sum">${r.summary.lines.map(x => `<p>${esc(x)}</p>`).join('')}</div>
    <div class="wk-kpis"><div><span>الحضور</span><b class="num">${A.held ? `${fmtNum(A.present)} / ${fmtNum(A.held)}` : '—'}</b><small>${A.late ? `${fmtNum(A.late)} تأخر` : A.held ? pc(A.rate) : 'لا جلسات'}</small></div>
      <div><span>الواجبات</span><b class="num">${r.hw.length ? `${fmtNum(r.hwDone)} / ${fmtNum(r.hw.length)}` : '—'}</b><small>${r.hw.some(h => h.overdue) ? `${fmtNum(r.hw.filter(h => h.overdue).length)} متأخر` : r.hw.length ? 'مسلّمة' : 'لا واجبات'}</small></div>
      <div><span>التدريب</span><b class="num">${fmtNum(r.practice.answered)}</b><small>سؤالًا${r.practice.pct != null ? ` · دقة ${pc(r.practice.pct)}` : ''}</small></div>
      <div><span>المحاكي</span><b class="num">${r.sims.length ? pc(r.sims.slice(-1)[0].pct) : '—'}</b><small>${r.sims.length ? `${fmtNum(r.sims.length)} هذا الأسبوع` : 'لم يُؤدَّ'}</small></div></div>
    ${r.days.length ? `<h4>الحضور يومًا بيوم</h4><ul class="wk-days">${r.days.map(d => `<li><span>${dowName(d.date)} ${fmtShort(d.date)}</span><span class="hint">${esc(d.label)}</span><span class="pill dot ${ST_PILL[d.status] || 'g'}">${esc(d.status)}</span></li>`).join('')}</ul>` : ''}
    ${r.hw.length ? `<h4>الواجبات</h4><ul class="wk-days">${r.hw.map(h => `<li><span>${esc(h.title)}</span><span class="hint">${esc(h.subject)} · يُستحق ${fmtShort(h.due)}</span><span class="pill ${h.done ? 'ok' : h.overdue ? 'bad' : 'g'}">${h.done ? (h.score ? 'الدرجة ' + esc(h.score) : h.late ? 'سُلّم متأخرًا' : 'سُلّم') : h.overdue ? 'لم يُسلَّم' : 'لم يحن موعده'}</span></li>`).join('')}</ul>` : ''}
    ${an.subjects.length ? `<h4>مستوى المهارات</h4><div class="wk-sk">${an.subjects.map(s => `<div><b>${esc(s.subject)} ${pc(s.pct)}</b>${s.skills.filter(k => k.ranked).slice(0, 4).map(k => `<span class="pill ${LEVEL[k.level][0]}">${esc(k.category)} ${pc(k.pct)}</span>`).join(' ') || '<span class="hint">بيانات قليلة</span>'}</div>`).join('')}</div>` : ''}
    ${r.summary.tips.length ? `<h4>نوصي هذا الأسبوع بـ</h4><ul class="wk-tips">${r.summary.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
  </div>`;
}

export function weeklyDoc(r){
  const A = r.attendance;
  return docShell({ docNo:`WK-${r.week.from.replace(/-/g, '')}`, title:'تقرير الأسبوع للمتدرب', sub:`${fmtGreg(r.week.from)} – ${fmtGreg(r.week.to)}`,
    info:[['المتدرب', r.trainee.name, 'wide'], ['القسم', r.sections.join('، ') || '—'], ['حتى تاريخ', fmtGreg(r.upto)]],
    stats:[['الحضور', A.held ? `${A.present} / ${A.held}` : '—', A.absent.length ? 'warn' : 'ok'], ['الواجبات', r.hw.length ? `${r.hwDone} / ${r.hw.length}` : '—'], ['أسئلة التدريب', String(r.practice.answered)], ['دقة التدريب', pc(r.practice.pct)], ['آخر محاكٍ', r.sims.length ? pc(r.sims.slice(-1)[0].pct) : '—']],
    body:weeklyBody(r).replace('<div class="wk">', '<div class="wk wk-print">'), note:'تقرير تلقائي من منصة المركز للاطلاع والمتابعة؛ مؤشر المحاكي تدريبي وليس درجة قياس.' });
}

/* بطاقة البوابة (ولي الأمر) */
let wkFrom = null, wkFor = null;
export function weeklyCard(D, trainee_id){
  const n = riyadhNow(), cur = weekOf(n.date).from; if(wkFor !== trainee_id){ wkFor = trainee_id; wkFrom = cur; }
  const r = weeklyReport(D, trainee_id, wkFrom, n);
  return `<div class="card pad rv wk-card" id="wkCard"><div class="wk-h"><h3 class="ctitle" style="margin:0">${ic('calendar')}تقرير الأسبوع</h3>
      <div class="wk-nav"><button class="btn sm" id="wkPrev" aria-label="الأسبوع السابق">${ic('prev')}</button><b>${fmtShort(r.week.from)} – ${fmtShort(r.week.to)}${wkFrom === cur ? ' <span class="pill info">هذا الأسبوع</span>' : ''}</b>
      <button class="btn sm" id="wkNext" aria-label="الأسبوع التالي" ${wkFrom >= cur ? 'disabled' : ''}>${ic('next')}</button></div></div>
    ${weeklyBody(r)}<div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn sm" id="wkPrint">${ic('form')} طباعة / PDF</button></div></div>`;
}
export function bindWeeklyCard(D, trainee_id, redraw){
  const cur = weekOf(riyadhNow().date).from;
  $('#wkPrev').onclick = () => { wkFrom = addDays(wkFrom, -7); redraw(); };
  $('#wkNext').onclick = () => { if(wkFrom < cur){ wkFrom = addDays(wkFrom, 7); redraw(); } };
  $('#wkPrint').onclick = () => printDocs([weeklyDoc(weeklyReport(D, trainee_id, wkFrom))], 'تقرير الأسبوع');
}

/* نافذة الإدارة: تُحمَّل بيانات التعلم للمتدرب ثم يُبنى التقرير؛ واتساب لولي الأمر أو للمتدرب */
export async function adminWeeklyModal(AD, trainee_id, loadLearning){
  let from = weekOf(riyadhNow().date).from, X;
  try { X = await loadLearning(trainee_id); } catch(e){ return toast(e.message); }
  const D = { ...AD, ...X }, t = (AD.trainees || []).find(x => x.id === trainee_id) || {};
  const draw = () => { const r = weeklyReport(D, trainee_id, from), cur = weekOf(riyadhNow().date).from, gp = t.guardian_phone, wa = waTo(gp || t.phone, weeklyText(r));
    modal(`<h3>تقرير الأسبوع · ${esc(t.full_name || '')}</h3><div class="wk-nav" style="margin:-6px 0 10px"><button class="btn sm" id="awP" aria-label="الأسبوع السابق">${ic('prev')}</button><b>${fmtShort(r.week.from)} – ${fmtShort(r.week.to)}</b><button class="btn sm" id="awN" aria-label="الأسبوع التالي" ${from >= cur ? 'disabled' : ''}>${ic('next')}</button></div>
      ${weeklyBody(r)}<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px">
      ${wa ? `<a class="btn sm" id="awWa" href="${esc(wa)}" target="_blank" rel="noopener">${ic('chat')} واتساب ${gp ? 'لولي الأمر' : 'للمتدرب'}</a>` : '<span class="hint">لا يوجد جوال صالح للواتساب</span>'}
      <button class="btn sm" id="awPr">${ic('form')} طباعة / PDF</button><button class="btn pri sm" id="awX">إغلاق</button></div>`);
    $('#awP').onclick = () => { from = addDays(from, -7); draw(); }; $('#awN').onclick = () => { if(from < cur){ from = addDays(from, 7); draw(); } };
    $('#awPr').onclick = () => printDocs([weeklyDoc(r)], 'تقرير الأسبوع'); $('#awX').onclick = closeModal; };
  draw();
}
