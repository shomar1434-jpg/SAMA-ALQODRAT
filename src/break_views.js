/* =====================================================================
   «إلغاء جلسات» في شاشة محاضرات اليوم (#display): فترة من تاريخ إلى تاريخ،
   للقسمين أو أحدهما، بسبب، مع معاينة إلزامية ثم تعويض تلقائي وتراجع.
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort, fmtDate, riyadhNow } from './utils.js';
import { ic, toast } from './views2_head.js';
import { Store } from './data2.js';
import { SECTIONS } from './qudurat.js';
import { BREAK_REASONS, breakReasonText, checkBreak } from './break_logic.js';
import { setBusy } from './features.js';
import { confirmBox } from './views2_programs.js';

const secTxt = s => s.length === 2 ? 'البنون والبنات' : SECTIONS[s[0]] || '';
const sessionsTxt = list => Object.keys(SECTIONS).map(sec => { const d = list.filter(x => x.section === sec); return d.length ? `<div><b>${SECTIONS[sec]}:</b> ${fmtNum(d.length)} جلسة (${d.map(x => fmtShort(x.date)).join('، ')})</div>` : ''; }).join('');

const row = c => `<tr><td>${SECTIONS[c.section]}</td><td>${fmtDate(c.old_end)}</td><td><b>${fmtDate(c.new_end)}</b></td><td class="num">${fmtNum(c.sessions)}</td><td class="num">${fmtNum(c.n)}</td></tr>`;
const head = '<thead><tr><th>القسم</th><th>النهاية الحالية</th><th>النهاية الجديدة</th><th>جلسات التعويض</th><th>المشتركون</th></tr></thead>';
/* الأكثر عددًا أولًا، وما زاد على 6 في قائمة قابلة للفتح */
function changesTable(ch){
  const L = ch.slice().sort((a, b) => b.n - a.n || a.old_end.localeCompare(b.old_end)), top = L.slice(0, 6), rest = L.slice(6);
  return `<div class="tblwrap"><table class="tb" style="white-space:nowrap">${head}<tbody>${top.map(row).join('')}</tbody></table></div>
    ${rest.length ? `<details><summary style="cursor:pointer;min-height:44px;display:flex;align-items:center">عرض ${fmtNum(rest.length)} مجموعة أخرى من النهايات</summary><div class="tblwrap"><table class="tb" style="white-space:nowrap">${head}<tbody>${rest.map(row).join('')}</tbody></table></div></details>` : ''}`;
}

export async function mountBreaks(root, onDone){
  if(!root) return;
  const [me, list] = await Promise.all([Store.adminMe?.().catch(() => null), Store.sessionBreaks?.().catch(() => []) ?? []]);
  const can = ['owner', 'full'].includes(me?.role), today = riyadhNow().date;
  root.innerHTML = `<div class="card pad rv" id="brkCard" style="margin-top:20px">
    <h2 class="ctitle">${ic('calendar')}إلغاء جلسات الباقات (إجازة أو طارئ)</h2>
    <p class="hint" style="margin:4px 0 12px">تُلغى كل جلسات القدرات والتحصيلي في الفترة للقسم المختار فلا تُحتسب غيابًا، ويُمدَّد كل اشتراك قائم بعدد الجلسات التي فقدها بالضبط، ويصل المتدرب وولي أمره إشعار بذلك. يمكن التراجع لاحقًا.</p>
    ${can ? `<form id="bkF" class="grid g2" novalidate>
      <div class="field"><label for="bkFrom">من تاريخ</label><input class="inp" type="date" id="bkFrom" value="${today}"></div>
      <div class="field"><label for="bkTo">إلى تاريخ</label><input class="inp" type="date" id="bkTo" value="${today}"></div>
      <div class="field"><label for="bkSec">القسم</label><select class="inp" id="bkSec"><option value="both">البنون والبنات</option>${Object.entries(SECTIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label for="bkReason">السبب</label><select class="inp" id="bkReason">${Object.entries(BREAK_REASONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field" id="bkNoteF" style="grid-column:1/-1" hidden><label for="bkNote">اكتب السبب</label><input class="inp" id="bkNote" maxlength="200" placeholder="مثل: صيانة القاعة"></div>
      <div class="errtxt" id="bkE" role="alert" style="grid-column:1/-1"></div>
      <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button class="btn pri" id="bkPrev">${ic('search')} معاينة</button></div></form>
      <div id="bkOut" aria-live="polite"></div>`
    : `<p class="hint">إلغاء الجلسات وتعويضها للمالك ومدير النظام.</p>`}
    <h3 style="font-size:16px;font-weight:600;margin:16px 0 8px">الإلغاءات السابقة</h3>
    ${list.length ? `<div class="tblwrap"><table class="tb" id="bkList"><thead><tr><th>الفترة</th><th>القسم</th><th>السبب</th><th>الجلسات</th><th>المشتركون</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${list.map(b => `<tr class="${b.revoked_at ? 'muted' : ''}"><td>${fmtShort(b.from_date)}${b.to_date !== b.from_date ? ` – ${fmtShort(b.to_date)}` : ''}</td><td>${secTxt(b.sections)}</td><td>${esc(breakReasonText(b.reason, b.note))}</td>
        <td class="num">${fmtNum((b.sessions || []).length)}</td><td class="num">${fmtNum(b.affected)}</td><td><span class="pill ${b.revoked_at ? 'g' : 'bad'}">${b.revoked_at ? 'تم التراجع' : 'ملغاة ومعوَّضة'}</span></td>
        <td>${can && !b.revoked_at ? `<button class="btn sm" data-bkr="${b.id}">${ic('prev')} تراجع</button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="hint">لا توجد إلغاءات.</p>`}</div>`;
  if(!can) return;
  const form = () => { const s = $('#bkSec').value; return { from:$('#bkFrom').value, to:$('#bkTo').value, sections: s === 'both' ? ['boys', 'girls'] : [s], reason:$('#bkReason').value, note:$('#bkNote').value }; };
  const sync = () => { $('#bkNoteF').hidden = $('#bkReason').value !== 'other'; $('#bkOut').innerHTML = ''; };
  $('#bkReason').onchange = sync; ['#bkFrom', '#bkTo', '#bkSec', '#bkNote'].forEach(s => $(s).addEventListener('input', () => { $('#bkOut').innerHTML = ''; }));
  $('#bkF').onsubmit = async e => { e.preventDefault(); const f = form(), er = $('#bkE'), b = $('#bkPrev'); er.textContent = '';
    const msg = checkBreak(f, today); if(msg){ er.textContent = msg; return; }
    setBusy(b, true, 'جارٍ الحساب');
    try {
      const r = await Store.cancelSessions({ ...f, preview:true }); setBusy(b, false);
      $('#bkOut').innerHTML = `<div class="alert t-gold" style="margin-top:12px" data-bkprev><span class="aic">${ic('alert')}</span><div style="display:grid;gap:6px">
        <b>معاينة: ${fmtNum(r.sessions.length)} جلسة ملغاة (${esc(r.reason)})، وتمديد ${fmtNum(r.affected)} اشتراكًا</b>${sessionsTxt(r.sessions)}
        ${r.changes.length ? changesTable(r.changes) : '<div class="hint">لا يوجد اشتراك قائم يتأثر.</div>'}
        <div style="display:flex;justify-content:flex-end"><button class="btn danger" id="bkGo">${ic('check')} تأكيد الإلغاء والتعويض</button></div></div></div>`;
      $('#bkGo').onclick = () => confirmBox('إلغاء الجلسات وتعويضها', `تُلغى ${r.sessions.length} جلسة ويُمدَّد ${r.affected} اشتراكًا ويصل الإشعار للمتدربين. يمكن التراجع لاحقًا.`, async () => {
        try { const x = await Store.cancelSessions(f); toast(`أُلغيت ${fmtNum(x.sessions.length)} جلسة وعُوّض ${fmtNum(x.affected)} اشتراكًا`); onDone?.(); }
        catch(err){ toast(err.message); } }, 'تأكيد الإلغاء');
    } catch(err){ setBusy(b, false); er.textContent = err.message; }
  };
  $$('[data-bkr]').forEach(btn => btn.onclick = () => confirmBox('التراجع عن الإلغاء', 'تعود الجلسات إلى الجدول وتعود نهايات الاشتراكات إلى ما كانت عليه.', async () => {
    try { const x = await Store.revokeSessionBreak(btn.dataset.bkr); toast(`أُعيدت ${fmtNum(x.restored)} نهاية${x.conflicts ? `، و${fmtNum(x.conflicts)} عُدّلت بعده فلم تُغيَّر` : ''}`); onDone?.(); }
    catch(err){ toast(err.message); } }, 'تراجع'));
}
