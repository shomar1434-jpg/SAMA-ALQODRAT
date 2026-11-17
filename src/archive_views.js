/* الخطوة BB: صفحة «بيانات مؤرشفة» (#admin-archive) ونافذة حذف المتدرب كاملًا (المالك ومدير النظام) */
import { $, $$, esc, fmtNum, fmtMoney, fmtDate, riyadhNow, matchQ } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { setBusy } from './features.js';
import { modal, closeModal } from './views2_programs.js';
import { reauth } from './admins_views.js';
import { ARCHIVE_STATE, ARCHIVE_DAYS, confirmNameOk } from './archive_logic.js';

const daysTo = d => d ? Math.round((new Date(d + 'T12:00:00Z') - new Date(riyadhNow().date + 'T12:00:00Z')) / 864e5) : null;

/* نافذة الحذف: سبب + كتابة الاسم كاملًا، ثم إعادة إدخال كلمة المرور إن لزم */
export function deleteTraineeModal(t, after){
  modal(`<div class="alert t-danger"><span class="aic">${ic('alert')}</span><div><b style="font-weight:600;font-size:16px">حذف المتدرب نهائيًا</b>
      <div class="hint">يُحذف <b>${esc(t.full_name)}</b> وكل ما يخصه: اشتراكاته وتسجيلاته وحضوره وواجباته، وطلبات الشراء والفواتير والمدفوعات، وما يخصه في سجل الحركات. <b>لا يمكن التراجع</b>، وتتغير إجماليات الفوترة السابقة.</div></div></div>
    <form id="dtF" class="grid" novalidate style="margin-top:12px">
      <div class="field"><label for="dt-r">سبب الحذف</label><select class="inp" id="dt-r"><option>انسحب ولا يرغب بالاستمرار</option><option>انقطع عن البرنامج</option><option>انتهت خدماته</option><option>حساب مكرر أو خاطئ</option><option>أخرى</option></select></div>
      <div class="field"><label for="dt-n">للتأكيد اكتب اسم المتدرب كما هو</label><input class="inp" id="dt-n" autocomplete="off" placeholder="${esc(t.full_name)}"></div>
      <div class="errtxt" id="dtE" role="alert"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"><button type="button" class="btn" id="dtC">إلغاء</button><button class="btn danger" id="dtS" disabled>${ic('trash')} حذف نهائي</button></div></form>`);
  const inp = $('#dt-n'), btn = $('#dtS');
  inp.oninput = () => { btn.disabled = !confirmNameOk(inp.value, t.full_name); };
  $('#dtC').onclick = closeModal;
  const go = async () => { await Store.deleteTrainee(t.id, inp.value, $('#dt-r').value); closeModal(); toast('حُذف المتدرب وكل بياناته'); await after?.(); };
  $('#dtF').onsubmit = async e => { e.preventDefault(); if(btn.disabled) return; setBusy(btn, true, 'جارٍ الحذف'); $('#dtE').textContent = '';
    try { await go(); }
    catch(x){ setBusy(btn, false);
      if(/أعد إدخال كلمة المرور/.test(x.message)){ const keep = { n: inp.value, r: $('#dt-r').value };
        reauth(async () => { try { await Store.deleteTrainee(t.id, keep.n, keep.r); toast('حُذف المتدرب وكل بياناته'); await after?.(); } catch(y){ toast(y.message); } }, 'حذف متدرب نهائيًا يحتاج إعادة إدخال كلمة مرورك.'); }
      else $('#dtE').textContent = x.message; } };
}

let arQ = '', arSt = 'all';
export async function pageArchive(titleBar, days = ARCHIVE_DAYS){
  const m = $('#main'); let L;
  try { L = await Store.archivedTrainees(); } catch(x){ m.innerHTML = emptyBox('تعذّر تحميل البيانات المؤرشفة', esc(x.message)); return; }
  const rows = L.filter(x => (arSt === 'all' || x.state === arSt) && matchQ(arQ, x.full_name, x.national_id, x.phone));
  const soon = L.filter(x => x.purge_on && daysTo(x.purge_on) <= 14 && x.remaining === 0).length;
  m.innerHTML = titleBar('الحوكمة', 'بيانات مؤرشفة', `من انتهت خدماته كلها تبقى بياناته ${fmtNum(days)} يومًا من انتهائها ثم يحذفها النظام آليًا. المنسحبون يُحذفون يدويًا.`) +
    `<div class="alert t-warn rv" style="margin-bottom:14px"><span class="aic">${ic('alert')}</span><div>الحذف نهائي ويشمل الطلبات والفواتير والمدفوعات. من عليه مبلغ متبقٍ لا يُحذف آليًا حتى يُسوّى أو يُحذف يدويًا.${soon ? ` <b>${fmtNum(soon)}</b> سيُحذفون خلال أسبوعين.` : ''}</div></div>
    <div class="filters rv"><label class="sr-only" for="arq">بحث</label><input class="inp" id="arq" type="search" placeholder="بحث بالاسم أو الهوية أو الجوال" value="${esc(arQ)}" style="flex:1;min-width:200px" autocomplete="off">
      <label class="sr-only" for="ars">الحالة</label><select class="inp" id="ars">${[['all', 'الكل'], ['completed', ARCHIVE_STATE.completed], ['withdrawn', ARCHIVE_STATE.withdrawn]].map(([k, v]) => `<option value="${k}" ${arSt === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    ${rows.length ? `<div class="tblwrap rv"><table class="tb" id="arT"><thead><tr><th>المتدرب</th><th>الحالة</th><th>انتهت الخدمة</th><th>الحذف الآلي</th><th>المتبقي</th><th></th></tr></thead><tbody>
      ${rows.map(x => { const d = daysTo(x.purge_on);
        return `<tr><td><b>${esc(x.full_name)}</b>${x.is_test ? ' <span class="pill g">تجريبي</span>' : ''}<div class="hint num" dir="ltr" style="text-align:right">${esc(x.national_id || '')}</div></td>
        <td><span class="pill ${x.state === 'completed' ? 'info' : 'warn'}">${ARCHIVE_STATE[x.state]}</span></td>
        <td class="num">${x.completed_on ? fmtDate(x.completed_on) : '—'}</td>
        <td data-pd>${x.state !== 'completed' ? '<span class="hint">يدوي</span>' : x.remaining > 0 ? '<span class="pill bad">موقوف: عليه متبقٍ</span>' : `${fmtDate(x.purge_on)} <span class="hint">(${d <= 0 ? 'اليوم' : 'بعد ' + fmtNum(d) + ' يوم'})</span>`}</td>
        <td class="num">${x.remaining > 0 ? fmtMoney(x.remaining) : '—'}</td>
        <td><button class="btn sm danger soft" data-ard="${x.id}">${ic('trash')} حذف الآن</button></td></tr>`; }).join('')}
      </tbody></table></div>` : emptyBox('لا توجد بيانات مؤرشفة', 'يظهر هنا من انتهت كل خدماته أو انسحب منها.')}`;
  let tm; $('#arq').oninput = e => { arQ = e.target.value; clearTimeout(tm); tm = setTimeout(() => { pageArchive(titleBar, days); }, 250); };
  $('#ars').onchange = e => { arSt = e.target.value; pageArchive(titleBar, days); };
  $$('[data-ard]').forEach(b => b.onclick = () => deleteTraineeModal(L.find(x => x.id === b.dataset.ard), () => pageArchive(titleBar, days)));
  const q = $('#arq'); if(arQ && document.activeElement !== q){ q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
}
