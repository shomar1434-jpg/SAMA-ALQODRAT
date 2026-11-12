/* =====================================================================
   لوحة الإدارة: بنوك أسئلة المدربين (#admin-bank) — بنك مستقل لكل مدرب ضمن قسمه ومقرراته.
   الإدارة تضيف وتعدّل وتوقف، وتستورد دفعة باللصق من Excel أو من ملف CSV.
   من هذا البنك يرسل المدرب واجبات اختبار تُصحَّح آليًا، ويقيس المتدرب مستواه.
   ===================================================================== */
import { $, $$, esc, fmtNum } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { titleBar } from './views2_main.js';
import { modal, closeModal, confirmBox } from './views2_programs.js';
import { AD, reloadAD } from './views2_admin.js';
import { setBusy } from './features.js';
import { SECTIONS } from './qudurat.js';
import { parseBank, BANK_COLUMNS, BANK_SAMPLE } from './learning_logic.js';
import { questionModal } from './learning_views.js';

const ST_TXT = { published:'منشور', draft:'مسودة' };
let cur = null, fSub = '', fUnit = '', fSt = '', fQ = '';
export const openBank = id => { cur = id; fSub = fUnit = fSt = fQ = ''; };

export function pageBank(){
  const m = $('#main'), teachers = (AD.teachers || []).filter(t => t.active !== false && (t.subjects || []).length).sort((a, b) => a.section.localeCompare(b.section) || a.full_name.localeCompare(b.full_name, 'ar'));
  const qs = (AD.questions || []).filter(q => q.status !== 'deleted');
  if(!teachers.some(t => t.id === cur)) cur = teachers[0]?.id || null;
  m.innerHTML = titleBar(`${ic('database')}بنوك الأسئلة`, 'بنوك أسئلة <em>المدربين</em>',
      'لكل مدرب بنك مستقل في قسمه ومقرراته. منه يرسل المدرب واجبات اختبار تُصحَّح آليًا، ويختبر المتدرب مستواه من بنك مدرب مقرره. الإجابات الصحيحة لا تصل للمتدرب قبل التسليم.') +
    (teachers.length ? `<div class="bank-ts" role="tablist" aria-label="المدربون">${teachers.map(t => { const mine = qs.filter(q => q.teacher_id === t.id), pub = mine.filter(q => q.status === 'published').length;
        return `<button class="bank-t" role="tab" data-bt="${t.id}" aria-selected="${t.id === cur}"><b>${esc(t.full_name)}</b><span>${SECTIONS[t.section]} · ${esc((t.subjects || []).join('، '))}</span>
          <span class="pill ${pub ? 'ok' : 'g'}">${fmtNum(pub)} منشور${mine.length - pub ? ` · ${fmtNum(mine.length - pub)} مسودة` : ''}</span></button>`; }).join('')}</div><div id="bankBody"></div>`
      : `<div class="card pad">${emptyBox('لا يوجد مدربون بعد', 'أضف المدرب أولًا من «المدربون وأولياء الأمور»، ثم ارجع لبناء بنكه.')}<div style="text-align:center;margin-top:10px"><a class="btn pri" href="#admin-users">${ic('plus')} إضافة مدرب</a></div></div>`);
  $$('[data-bt]').forEach(b => b.onclick = () => { openBank(b.dataset.bt); pageBank(); });
  if(cur) body(teachers.find(t => t.id === cur), qs.filter(q => q.teacher_id === cur));
}

function body(t, mine){
  const units = [...new Set(mine.filter(q => !fSub || q.subject === fSub).map(q => q.unit || 'عام'))].sort((a, b) => a.localeCompare(b, 'ar'));
  if(fUnit && !units.includes(fUnit)) fUnit = '';
  const list = mine.filter(q => (!fSub || q.subject === fSub) && (!fUnit || q.unit === fUnit) && (!fSt || q.status === fSt) && (!fQ || q.text.includes(fQ)))
    .sort((a, b) => (a.subject + a.unit).localeCompare(b.subject + b.unit, 'ar') || String(a.created_at).localeCompare(String(b.created_at)));
  const per = (t.subjects || []).map(s => { const x = mine.filter(q => q.subject === s); return `<div class="kpi-s"><span>${esc(s)}</span><b class="num">${fmtNum(x.filter(q => q.status === 'published').length)}</b><small>منشور من ${fmtNum(x.length)}</small></div>`; }).join('');
  $('#bankBody').innerHTML = `<div class="card pad rv" style="margin-top:14px">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:10px"><h3 class="ctitle" style="margin:0">${ic('book')}بنك ${esc(t.full_name)} <span class="hint">${SECTIONS[t.section]}</span></h3>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="bkImp">${ic('form')} استيراد من Excel</button><button class="btn pri sm" id="bkAdd">${ic('plus')} سؤال</button></div></div>
    <div class="bank-kpi">${per}</div>
    <div class="bank-f"><label class="sr-only" for="bf-s">المقرر</label><select class="inp" id="bf-s"><option value="">كل المقررات</option>${(t.subjects || []).map(s => `<option ${fSub === s ? 'selected' : ''}>${s}</option>`).join('')}</select>
      <label class="sr-only" for="bf-u">الوحدة</label><select class="inp" id="bf-u"><option value="">كل الوحدات</option>${units.map(u => `<option ${fUnit === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
      <label class="sr-only" for="bf-st">الحالة</label><select class="inp" id="bf-st"><option value="">كل الحالات</option>${Object.entries(ST_TXT).map(([k, v]) => `<option value="${k}" ${fSt === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label class="sr-only" for="bf-q">بحث</label><input class="inp" id="bf-q" type="search" placeholder="بحث في نص السؤال" value="${esc(fQ)}"></div>
    ${list.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>المقرر</th><th>الوحدة</th><th>السؤال</th><th>الصحيح</th><th>الحالة</th><th></th></tr></thead><tbody>${list.map(q => `<tr>
        <td>${esc(q.subject)}</td><td>${esc(q.unit || 'عام')}</td><td style="max-width:420px">${esc(q.text)}${q.skill ? ` <span class="hint">· ${esc(q.skill)}</span>` : ''}</td><td>${esc(q.options?.[q.correct] ?? '')}</td>
        <td><span class="pill dot ${q.status === 'published' ? 'ok' : 'g'}">${ST_TXT[q.status] || q.status}</span></td>
        <td style="white-space:nowrap"><button class="btn sm" data-qe="${q.id}" aria-label="تعديل">${ic('edit')}</button> <button class="btn sm" data-qp="${q.id}">${q.status === 'published' ? 'إيقاف' : 'نشر'}</button> <button class="btn sm danger soft" data-qd="${q.id}" aria-label="حذف">${ic('trash')}</button></td></tr>`).join('')}</tbody></table></div>`
      : emptyBox(mine.length ? 'لا أسئلة بهذه التصفية' : 'البنك فارغ', mine.length ? '' : 'أضف الأسئلة واحدًا واحدًا، أو الصقها كلها من ملف Excel.')}</div>`;
  const re = () => body(t, mine);
  $('#bf-s').onchange = e => { fSub = e.target.value; re(); }; $('#bf-u').onchange = e => { fUnit = e.target.value; re(); };
  $('#bf-st').onchange = e => { fSt = e.target.value; re(); }; $('#bf-q').oninput = e => { fQ = e.target.value.trim(); clearTimeout(re.t); re.t = setTimeout(() => { re(); const i = $('#bf-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 250); };
  const done = async () => { await reloadAD(); pageBank(); };
  $('#bkAdd').onclick = () => questionModal({ q:null, subjects:t.subjects, title:`سؤال جديد · بنك ${t.full_name}`, save:o => Store.adminSaveQuestion({ ...o, teacher_id:t.id }), done });
  $$('[data-qe]').forEach(b => b.onclick = () => questionModal({ q:mine.find(q => q.id === b.dataset.qe), subjects:t.subjects, save:o => Store.adminSaveQuestion({ ...o, teacher_id:t.id }), done }));
  $$('[data-qp]').forEach(b => b.onclick = async () => { const q = mine.find(x => x.id === b.dataset.qp); await Store.adminQuestionStatus(q.id, q.status === 'published' ? 'draft' : 'published'); done(); });
  $$('[data-qd]').forEach(b => b.onclick = () => confirmBox('حذف السؤال من البنك', 'لا يظهر في الاختبارات الجديدة. المحاولات والواجبات السابقة تحتفظ بنسختها.', async () => { await Store.adminQuestionStatus(b.dataset.qd, 'deleted'); closeModal(); toast('حُذف السؤال'); done(); }));
  $('#bkImp').onclick = () => importModal(t, done);
}

function importModal(t, done){
  let parsed = { rows:[], errors:[] };
  modal(`<h3>استيراد أسئلة إلى بنك ${esc(t.full_name)}</h3>
    <ol class="hint imp-steps"><li>رتّب الأعمدة في Excel بهذا الترتيب: <b>${BANK_COLUMNS.join(' | ')}</b>.</li>
      <li>المقرر: ${esc((t.subjects || []).join(' أو '))}. الصحيحة: أ أو ب أو ج أو د (أو 1–4). الصعوبة اختيارية: سهل، متوسط، صعب.</li>
      <li>انسخ الصفوف (مع سطر العناوين أو بدونه) والصقها هنا، أو اختر ملف CSV.</li></ol>
    <div class="field"><label for="imp-t">الأسئلة</label><textarea class="inp" id="imp-t" rows="7" dir="auto" style="padding:10px 14px;font-size:14px;white-space:pre" placeholder="${esc(BANK_SAMPLE.replace(/\t/g, '   '))}"></textarea></div>
    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label class="btn sm" for="imp-f">${ic('form')} اختيار ملف CSV</label><input type="file" id="imp-f" accept=".csv,.tsv,.txt,text/csv,text/plain" class="sr-only">
      <button type="button" class="btn sm" id="imp-sample">لصق مثال</button>
      <label class="chk" style="margin-inline-start:auto"><input type="checkbox" id="imp-pub" checked> نشر مباشرة</label></div>
    <div id="imp-r" aria-live="polite" style="margin-top:10px"></div>
    <div class="errtxt" id="impE" aria-live="polite"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn" id="impC">إلغاء</button><button class="btn pri" id="impGo" disabled>${ic('check')} استيراد</button></div>`);
  const show = () => { parsed = parseBank($('#imp-t').value, t.subjects || []); const n = parsed.rows.length, e = parsed.errors;
    $('#imp-r').innerHTML = !$('#imp-t').value.trim() ? '' : `<div class="alert ${e.length ? 't-gold' : 't-teal'}"><span class="aic">${ic(e.length ? 'alert' : 'check')}</span><div><b>${fmtNum(n)} سؤال جاهز</b>${e.length ? ` · ${fmtNum(e.length)} سطر يحتاج تصحيحًا` : ''}
      ${e.length ? `<ul class="imp-err">${e.slice(0, 8).map(x => `<li>السطر ${fmtNum(x.line)}: ${esc(x.msg)}</li>`).join('')}${e.length > 8 ? `<li>و${fmtNum(e.length - 8)} أخرى…</li>` : ''}</ul>` : ''}</div></div>`;
    const go = $('#impGo'); go.disabled = !n || e.length > 0; go.lastChild.textContent = n ? ` استيراد ${fmtNum(n)} سؤال` : ' استيراد'; };
  $('#imp-t').oninput = show;
  $('#imp-sample').onclick = () => { $('#imp-t').value = BANK_COLUMNS.join('\t') + '\n' + BANK_SAMPLE.replace(/^كمي/, (t.subjects || ['كمي'])[0]); show(); };
  $('#imp-f').onchange = async e => { const f = e.target.files?.[0]; if(!f) return; if(f.size > 2e6){ $('#impE').textContent = 'الملف أكبر من 2 ميجابايت'; return; }
    $('#imp-t').value = await f.text(); show(); };
  $('#impC').onclick = closeModal;
  $('#impGo').onclick = async () => { const b = $('#impGo'); setBusy(b, true, 'جارٍ الاستيراد');
    try { const r = await Store.adminImportQuestions(t.id, parsed.rows, $('#imp-pub').checked ? 'published' : 'draft'); closeModal(); toast(`أُضيف ${fmtNum(r.count)} سؤال إلى بنك ${t.full_name}`); done(); }
    catch(x){ setBusy(b, false); $('#impE').textContent = x.message; } };
}
