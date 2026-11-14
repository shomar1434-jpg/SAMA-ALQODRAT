/* التسجيل المبدئي (الخطوة AA): طلبات البرامج التي لا دفعة مفتوحة لها، تنقلها الإدارة إلى الدفعة حين تُفتح
   ↔ admin_place_requests / admin_cancel_request. الطلب لا يُنشئ طلب شراء؛ النقل يُنشئ التسجيل وطلب الشراء. */
import { $, $$, esc, fmtNum, fmtShort, riyadhNow } from './utils.js';
import { ic, toast } from './views2_head.js';
import { Store, openCohortOf } from './data2.js';
import { modal, closeModal } from './views2_programs.js';
import { setBusy } from './features.js';

/* الطلبات المعلّقة مجمّعة بالبرنامج، والدفعة المفتوحة إن وُجدت */
export function pendingByProgram(AD, today = riyadhNow().date){
  const by = new Map();
  for(const r of (AD.program_requests || []).filter(x => x.status === 'pending')){
    if(!by.has(r.program_id)) by.set(r.program_id, []);
    by.get(r.program_id).push(r);
  }
  return [...by.entries()].map(([pid, list]) => ({ program: AD.programs.find(p => p.id === pid), list: list.sort((a, b) => a.created_at.localeCompare(b.created_at)), open: openCohortOf(AD, pid, today) }))
    .sort((a, b) => (!!b.open - !!a.open) || b.list.length - a.list.length);
}

export function requestsHtml(AD){
  const G = pendingByProgram(AD); if(!G.length) return '';
  const n = G.reduce((s, g) => s + g.list.length, 0), tn = id => AD.trainees.find(t => t.id === id);
  return `<details class="card pad rv" id="reqCard" style="--i:1;margin-bottom:14px" ${G.some(g => g.open) ? 'open' : ''}>
    <summary style="cursor:pointer;display:flex;gap:8px;align-items:center;min-height:44px"><span class="kic t-info">${ic('form')}</span><b style="font-weight:600">طلبات التسجيل المبدئي</b><span class="pill info">${fmtNum(n)} طلب في ${fmtNum(G.length)} برنامج</span></summary>
    <p class="hint" style="margin:8px 0 12px">سجّل أصحابها في برامج لا دفعة مفتوحة لها. افتح دفعة للبرنامج، ثم انقل الطلبات إليها فيُنشأ التسجيل وطلب الشراء لكل متدرب.</p>
    <div class="grid" style="gap:10px">${G.map(g => `<div class="card pad" style="background:var(--surface-2,transparent)">
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><b style="font-weight:600">${esc(g.program?.name || '—')}</b>
        ${g.open ? `<button class="btn pri sm" data-rqall="${g.program?.id}">${ic('check')} نقل ${fmtNum(g.list.length)} إلى الدفعة ${fmtNum(g.open.number)}</button>` : `<a class="btn sm" href="#admin-programs">${ic('plus')} افتح دفعة للبرنامج</a>`}</div>
      <ul style="list-style:none;padding:0;margin:8px 0 0;display:grid;gap:6px">${g.list.map(r => { const t = tn(r.trainee_id);
        return `<li style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center"><span>${esc(t?.full_name || '—')} <span class="hint num" dir="ltr">${esc(t?.phone || '')}</span> <span class="hint">· ${fmtShort(r.created_at.slice(0, 10))} · ${esc(r.ref)}</span></span>
          <span style="display:flex;gap:6px">${g.open ? `<button class="btn sm" data-rq="${r.id}">نقل</button>` : ''}<button class="btn sm danger soft" data-rqx="${r.id}">إلغاء</button></span></li>`; }).join('')}</ul></div>`).join('')}</div></details>`;
}

export function bindRequests(AD, after){
  const place = async (ids, b) => { setBusy(b, true, 'جارٍ النقل');
    try { const r = await Store.placeRequests(ids); toast(`نُقل ${fmtNum(r.placed)} طلب إلى الدفعة${r.skipped ? `، وبقي ${fmtNum(r.skipped)} لاكتمال المقاعد` : ''}`); await after(); }
    catch(x){ setBusy(b, false); toast(x.message); } };
  $$('[data-rqall]').forEach(b => b.onclick = () => place(pendingByProgram(AD).find(g => g.program?.id === b.dataset.rqall).list.map(r => r.id), b));
  $$('[data-rq]').forEach(b => b.onclick = () => place([b.dataset.rq], b));
  $$('[data-rqx]').forEach(b => b.onclick = () => {
    modal(`<h3>إلغاء طلب التسجيل المبدئي</h3><form id="rqF" novalidate><div class="field"><label for="rq-r">السبب</label><input class="inp" id="rq-r" maxlength="300"></div><div class="errtxt" id="rqE" role="alert"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button type="button" class="btn" id="rqC">تراجع</button><button class="btn danger" id="rqGo">إلغاء الطلب</button></div></form>`);
    $('#rqC').onclick = closeModal;
    $('#rqF').onsubmit = async e => { e.preventDefault(); const go = $('#rqGo'); setBusy(go, true, 'جارٍ الإلغاء');
      try { await Store.cancelRequest(b.dataset.rqx, $('#rq-r').value); closeModal(); toast('أُلغي الطلب'); await after(); }
      catch(x){ setBusy(go, false); $('#rqE').textContent = x.message; } };
  });
}
