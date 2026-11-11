/* =====================================================================
   لوحة الإدارة: تقرير اليوم (20:30) وأرشيفه، والمعاينة المباشرة لليوم.
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtDate, riyadhNow, t12 } from './utils.js';
import { ic, emptyBox, toast, statusPill, countUp } from './views2_head.js';
import { Store } from './data2.js';
import { titleBar, kpiCard } from './views2_main.js';
import { AD, reloadAD } from './views2_admin.js';
import { buildDailyReport, REPORT_TIME, isPastReportTime } from './report_logic.js';
import { docShell, printDocs, exportCSV, fmtHijri } from './print.js';
import { setBusy } from './features.js';

let sel = null;   // {id} لتقرير محفوظ، أو 'live' للمعاينة
export function pageDaily(){
  const m = $('#main'), D = AD, n = riyadhNow();
  const reports = (D.daily_reports || []).slice().sort((a, b) => b.date.localeCompare(a.date) || b.version - a.version);
  const today = reports.filter(r => r.date === n.date);
  if(!sel) sel = today.length ? today[0].id : 'live';
  const cur = sel === 'live' ? { date:n.date, version:0, kind:'live', data:buildDailyReport(D, n.date, n), note:'', changes:[] } : reports.find(r => r.id === sel) || reports[0];
  const dates = [...new Set(reports.map(r => r.date))].slice(0, 30);
  m.innerHTML = titleBar(`${ic('form')}تقرير اليوم`, `تقرير اليوم <em>${REPORT_TIME}</em>`,
      `يُولَّد تلقائيًا الساعة ${REPORT_TIME} بتوقيت الرياض كلقطة أولى لا تُعدَّل، وأي تحديث بعدها يصدر مراجعة مرقّمة.`,
      `<button class="btn sm" id="drLive">${ic('activity')} معاينة اليوم الآن</button>${!today.length ? `<button class="btn pri sm" id="drGen" ${isPastReportTime(n) ? '' : 'title="قبل 20:30 تُحفظ كلقطة جزئية"'}>${ic('check')} توليد لقطة اليوم</button>` : `<button class="btn pri sm" id="drRev">${ic('refresh')} إصدار مراجعة</button>`}`) +
    `<div class="grid" style="grid-template-columns:260px 1fr;gap:16px;align-items:start;margin-top:16px" id="drGrid">
      <div class="card pad rv"><h3 class="ctitle">${ic('calendar')}الأرشيف</h3>
        ${dates.length ? `<ul class="dr-list">${dates.map(d => { const vs = reports.filter(r => r.date === d);
          return `<li><b>${fmtDate(d)}</b><div>${vs.slice().reverse().map(r => `<button class="chip ${cur.id === r.id ? 'on' : ''}" data-dr="${r.id}">${r.version === 1 ? 'اللقطة' : 'مراجعة ' + fmtNum(r.version - 1)}</button>`).join('')}</div></li>`; }).join('')}</ul>` : `<p class="hint">لا توجد تقارير محفوظة بعد. يُولَّد أول تقرير الساعة ${REPORT_TIME}.</p>`}</div>
      <div id="drBody"></div></div>`;
  $('#drBody').innerHTML = reportHtml(cur, n);
  countUp(m);
  $('#drLive').onclick = () => { sel = 'live'; pageDaily(); };
  $$('[data-dr]').forEach(b => b.onclick = () => { sel = b.dataset.dr; pageDaily(); });
  if($('#drGen')) $('#drGen').onclick = async e => { setBusy(e.currentTarget, true, 'جارٍ التوليد'); const r = await Store.generateReport(n.date, 'snapshot'); await reloadAD(); sel = r.report.id; toast('حُفظت لقطة اليوم'); pageDaily(); };
  if($('#drRev')) $('#drRev').onclick = async e => { setBusy(e.currentTarget, true, 'جارٍ الإصدار'); const r = await Store.generateReport(n.date, 'revision'); await reloadAD(); sel = r.report.id; toast(`صدرت المراجعة ${fmtNum(r.report.version - 1)}`); pageDaily(); };
  if($('#drPrint')) $('#drPrint').onclick = () => printDocs([reportDoc(cur)], 'تقرير اليوم');
  if($('#drCsv')) $('#drCsv').onclick = () => exportCSV(`تقرير-اليوم-${cur.date}`, [['المجموعة', 'الطالب', 'الحالة', 'وقت الحضور'], ...cur.data.groups.flatMap(g => g.rows.map(r => [g.label, r.name, r.status, r.time || '']))]);
  if($('#drNoteS')) $('#drNoteS').onclick = async e => { setBusy(e.currentTarget, true, 'جارٍ الحفظ'); await Store.setReportNote(cur.id, $('#drNote').value); await reloadAD(); toast('حُفظت الملاحظة'); pageDaily(); };
}

function reportHtml(r, n){
  const s = r.data.summary, live = r.kind === 'live';
  return `<div class="card pad rv">
    <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:flex-start">
      <div><h3 class="ctitle" style="font-size:18px">تقرير اليوم — ${esc(fmtDate(r.date))}</h3><div class="hint">${esc(fmtHijri(r.date))}</div></div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">${live ? `<span class="pill info">معاينة مباشرة · ${t12(n.hm)}</span>` : `<span class="pill ${r.version === 1 ? 'ok' : 'o'}">${r.version === 1 ? 'اللقطة الأولى' : 'مراجعة ' + fmtNum(r.version - 1)}</span><span class="pill g">${r.auto ? 'تلقائي' : 'يدوي'} · ${new Date(r.generated_at).toLocaleTimeString('ar-SA', { timeZone:'Asia/Riyadh', hour:'numeric', minute:'2-digit' })}</span>`}
        <button class="btn sm" id="drPrint">${ic('form')} طباعة</button><button class="btn sm" id="drCsv">${ic('copy')} Excel</button></div></div>
    ${r.changes?.length ? `<div class="alert t-gold" style="margin-top:10px"><span class="aic">${ic('refresh')}</span><div><b style="font-weight:600">تغيّر عن الإصدار السابق</b><p style="margin:4px 0 0">${r.changes.map(esc).join(' · ')}</p></div></div>` : ''}
    <div class="kpis" style="grid-template-columns:repeat(5,1fr);margin-top:12px">
      ${kpiCard(0, 'calendar', 'info', 'الجلسات', s.sessions_scheduled, '', `${fmtNum(s.expected)} طالب متوقع`)}
      ${kpiCard(1, 'check', 'success', 'الحاضرون', s.present, '', '')}${kpiCard(2, 'timer', 'gold', 'المتأخرون', s.late, '', '')}
      ${kpiCard(3, 'x', 'danger', 'الغائبون', s.absent, '', '')}${kpiCard(4, 'clock', 'early', 'لم يسجلوا بعد', s.pending, '', r.data.closed ? '' : 'اليوم لم ينتهِ')}</div>
    <p class="hint" style="margin:8px 0 0">${esc(r.data.completeness)}. «لم يسجل بعد» أثناء الجلسة لا يُعد غيابًا حتى تنتهي.</p>
  </div>
  ${r.data.groups.length ? r.data.groups.map((g, i) => `<details class="card pad rv dr-group" style="--i:${i}" ${i < 2 ? 'open' : ''}><summary><b>${esc(g.label)}</b> <span class="hint">${g.session ? `${t12(g.session.start)} – ${t12(g.session.end)}` : ''} · ${fmtNum(g.rows.filter(x => ['حاضر', 'متأخر'].includes(x.status)).length)} من ${fmtNum(g.rows.length)}</span></summary>
      <div class="tblwrap" style="margin-top:8px"><table class="tb"><thead><tr><th>الطالب</th>${g.rows[0]?.plan !== undefined ? '<th>الباقة</th>' : ''}<th>الحالة</th><th>وقت أول حضور</th></tr></thead><tbody>
      ${g.rows.map(x => `<tr><td>${esc(x.name)}</td>${x.plan !== undefined ? `<td>${esc(x.plan)}</td>` : ''}<td><span class="pill dot ${x.status === 'لم يسجل بعد' ? 'g' : statusPill(x.status)}">${x.status}</span>${x.manual ? ' <span class="hint">تصحيح إداري</span>' : ''}</td><td class="num">${x.time ? t12(x.time) : '—'}</td></tr>`).join('')}</tbody></table></div></details>`).join('')
    : `<div class="card pad rv">${emptyBox('لا توجد جلسات في هذا اليوم')}</div>`}
  <div class="grid g2" style="align-items:start">
    <div class="card pad rv"><h3 class="ctitle">${ic('alert')}الحوادث التشغيلية المسجّلة</h3>
      ${r.data.incidents.length ? `<ul class="ses-list">${r.data.incidents.map(x => `<li><span class="pill ${x.type === 'device' ? 'bad' : x.type === 'manual' ? 'o' : 'warn'}">${fmtNum(x.count)}</span><span>${esc(x.text)}</span></li>`).join('')}</ul>` : '<p class="hint">لم تُسجَّل حوادث.</p>'}
      <p class="hint" style="margin:8px 0 0">تُعرض الحوادث المسجّلة فعلًا فقط.</p></div>
    <div class="card pad rv"><h3 class="ctitle">${ic('users')}متابعات المعلمين</h3>
      ${r.data.teachers.length ? `<ul class="ses-list">${r.data.teachers.map(x => `<li><b>${esc(x.teacher)}</b><span>${fmtNum(x.reminders)} تذكير للطلاب</span><span>${fmtNum(x.guardians)} إشعار لأولياء الأمور</span></li>`).join('')}</ul>` : '<p class="hint">لا توجد متابعات اليوم.</p>'}
      ${r.data.homework.length ? `<h3 class="ctitle" style="margin-top:12px">${ic('form')}واجبات استحقت اليوم</h3><ul class="ses-list">${r.data.homework.map(h => `<li><b>${esc(h.title)}</b><span>${esc(h.section)}</span><span>${fmtNum(h.submitted)} تسليم</span></li>`).join('')}</ul>` : ''}</div></div>
  ${live ? '' : `<div class="card pad rv"><h3 class="ctitle">${ic('edit')}ملاحظات الإدارة والإجراءات المفتوحة</h3>
    <textarea class="inp" id="drNote" rows="3" maxlength="1000" style="padding:10px 14px;line-height:1.8">${esc(r.note || '')}</textarea>
    <div style="margin-top:8px"><button class="btn sm pri" id="drNoteS">${ic('check')} حفظ الملاحظة</button></div></div>`}`;
}

function reportDoc(r){
  const s = r.data.summary;
  const body = r.data.groups.map(g => `<h3 class="psec">${esc(g.label)}${g.session ? ` · ${t12(g.session.start)} – ${t12(g.session.end)}` : ''}</h3>
    <table class="ptab"><thead><tr><th style="width:30px">م</th><th>الطالب</th><th style="width:110px">الحالة</th><th style="width:90px">الوقت</th></tr></thead>
    <tbody>${g.rows.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td>${x.status}${x.manual ? ' (تصحيح)' : ''}</td><td>${x.time ? t12(x.time) : '—'}</td></tr>`).join('')}</tbody></table>`).join('')
    + (r.data.incidents.length ? `<h3 class="psec">الحوادث التشغيلية</h3><ul>${r.data.incidents.map(x => `<li>${esc(x.text)}: ${x.count}</li>`).join('')}</ul>` : '')
    + (r.note ? `<h3 class="psec">ملاحظات الإدارة</h3><p>${esc(r.note)}</p>` : '');
  return docShell({ docNo:`DR-${r.date}-${r.version || 0}`, title:'تقرير اليوم', sub:`${fmtDate(r.date)} · ${fmtHijri(r.date)}${r.version > 1 ? ` · مراجعة ${r.version - 1}` : r.version === 1 ? ' · اللقطة الأولى' : ' · معاينة'}`,
    stats:[['الجلسات', fmtNum(s.sessions_scheduled)], ['المتوقعون', fmtNum(s.expected)], ['الحاضرون', fmtNum(s.present), 'ok'], ['المتأخرون', fmtNum(s.late), 'warn'], ['الغائبون', fmtNum(s.absent), 'bad']],
    body, note:`ولّد النظام هذا التقرير ${r.kind === 'live' ? 'كمعاينة' : 'آليًا'}. ${esc(r.data.completeness)}.` });
}
