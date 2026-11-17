/* =====================================================================
   لوحة طلب الشراء لصاحبه (بعد التسجيل وفي بوابتي المتدرب وولي الأمر):
   رقم الطلب، الحالتان، بيانات التحويل إن فُعّلت، الإبلاغ بالتحويل، وواتساب برسالة مجهزة.
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort, riyadhNow } from './utils.js';
import { ic, toast } from './views2_head.js';
import { Store } from './data2.js';
import { setBusy, toLatin } from './features.js';
import { waLink, WA_LOGO } from './landing.js';
import { AP_TXT, AP_TONE, PAY_TXT, PAY_TONE, orderReady, waTransferText, installmentsOf, instText } from './order_logic.js';

export const sar = v => `${fmtNum(v)} ريال`;
export const pills = o => `<span class="pill dot ${AP_TONE[o.approval]}">المراجعة: ${AP_TXT[o.approval]}</span> <span class="pill dot ${PAY_TONE[o.payment]}">السداد: ${PAY_TXT[o.payment]}</span>${o.provisional ? ' <span class="pill info">قبول مؤقت</span>' : ''}`;

/* لوحة الطلب لصاحبه: رقم الطلب، الحالتان، بيانات التحويل، الإبلاغ بالتحويل، وواتساب برسالة مجهزة */
export function orderPanelHtml(o, name, plan){
  if(!o) return ''; const ins = installmentsOf(o, plan);
  const done = orderReady(o) && !o.provisional, b = o.bank;
  return `<div class="ord" data-ord="${o.id}"><div class="ord-h"><div><small>رقم الطلب</small><b class="ord-no" dir="ltr">${esc(o.number)}</b></div><button type="button" class="btn sm" data-copy="${esc(o.number)}">${ic('form')} نسخ</button></div>
    <p class="ord-t">${esc(o.title)}</p><div class="ord-st">${pills(o)}</div>
    <div class="ord-amt"><span>المطلوب الآن <b>${o.due_now > 0 ? sar(o.due_now) : 'يحدده المركز'}</b></span>${o.total > o.due_now ? `<span>إجمالي الباقة <b>${sar(o.total)}</b></span>` : ''}${o.paid_amount ? `<span>المؤكَّد وصوله <b>${sar(o.paid_amount)}</b></span>` : ''}</div>
    ${ins ? `<p class="ord-inst" data-inst>${esc(instText(ins, fmtNum))}</p>` : ''}
    ${o.note ? `<p class="alert t-${o.approval === 'rejected' ? 'danger' : 'info'}" style="margin:10px 0 0"><span class="aic">${ic('alert')}</span><span>${o.approval === 'rejected' ? 'سبب الرفض' : 'المطلوب استكماله'}: ${esc(o.note)}</span></p>` : ''}
    ${done ? `<p class="hint" style="margin:10px 0 0">${ic('check')} اعتُمد طلبك وتأكد سدادك.</p>` : o.approval === 'rejected' ? '' : `
    ${b ? `<div class="ord-bank"><b>التحويل البنكي</b><dl><dt>البنك</dt><dd>${esc(b.bank)}</dd><dt>المستفيد</dt><dd>${esc(b.beneficiary)}</dd><dt>الآيبان</dt><dd dir="ltr">${esc(b.iban)} <button type="button" class="linkbtn" data-copy="${esc(b.iban)}">نسخ</button></dd>${b.account ? `<dt>رقم الحساب</dt><dd dir="ltr">${esc(b.account)}</dd>` : ''}</dl>
        <p class="hint" style="margin:6px 0 0">اكتب رقم الطلب في خانة الغرض عند التحويل إن أمكن.</p></div>` : `<p class="hint" style="margin:10px 0 0">يتواصل معك المركز لإتمام السداد، أو تواصل معه عبر واتساب.</p>`}
    ${o.payment === 'confirmed' ? '' : `<details class="ord-claim" ${o.claim ? '' : 'open'}><summary>${o.claim ? `أبلغت بتحويل ${sar(o.claim.amount)} بتاريخ ${fmtShort(o.claim.date)} · تعديل` : 'حوّلت المبلغ؟ أبلغنا بالتحويل'}</summary>
      <form class="ord-f" novalidate><div class="field"><label>المبلغ المحوَّل (ريال)</label><input class="inp num" name="amount" inputmode="decimal" value="${o.claim?.amount ?? (o.due_now || '')}"></div>
        <div class="field"><label>تاريخ التحويل</label><input class="inp" name="date" type="date" max="${riyadhNow().date}" value="${o.claim?.date || riyadhNow().date}"></div>
        <div class="field"><label>رقم مرجع العملية (اختياري)</label><input class="inp num" name="reference" dir="ltr" maxlength="60" value="${esc(o.claim?.reference || '')}"></div>
        <div class="errtxt" role="alert"></div><button class="btn pri sm">${ic('check')} إبلاغ بالتحويل</button></form>
      <p class="hint" style="margin:8px 0 0">الإبلاغ لا يعني تأكيد وصول المبلغ؛ يطابقه المحاسب مع كشف البنك ثم يؤكد السداد.</p></details>`}
    <p style="margin:10px 0 0"><a class="btn sm" data-wa target="_blank" rel="noopener" href="${waLink(waTransferText(o, name || '', o.claim?.amount))}">${WA_LOGO} إرسال إثبات السداد عبر واتساب</a></p>`}</div>`;
}
/* key: {national_id} من صفحة التأكيد، أو {} من البوابة (الجلسة) */
export function bindOrderPanel(root, o, key, onChange){
  const box = root?.querySelector?.(`[data-ord="${o?.id}"]`); if(!box) return;
  $$('[data-copy]', box).forEach(b => b.onclick = async () => { try { await navigator.clipboard.writeText(b.dataset.copy); toast('نُسخ'); } catch(_){ toast(b.dataset.copy); } });
  const f = $('.ord-f', box); if(!f) return;
  f.amount.addEventListener('input', () => { f.amount.value = toLatin(f.amount.value).replace(/[^\d.]/g, ''); });
  f.onsubmit = async e => { e.preventDefault(); const b = $('button', f), E = $('.errtxt', f); E.textContent = ''; setBusy(b, true, 'جارٍ الإرسال');
    try { const r = await Store.orderReportTransfer({ number:o.number, order_id:o.id, ...key, amount:f.amount.value, date:f.date.value, reference:f.reference.value }); toast('سُجّل إبلاغك بالتحويل؛ بانتظار المطابقة'); onChange?.(r); }
    catch(x){ setBusy(b, false); E.textContent = x.message; } };
}

/* بطاقة «طلباتي» في البوابة: كل طلبات المتدرب */
export function ordersCardHtml(orders, name, planOf = () => null){
  if(!orders?.length) return '';
  return `<section class="card pad rv" id="myOrders" style="margin-top:14px"><h3 class="ctitle">${ic('wallet')}طلباتي والسداد</h3>${orders.map(o => orderPanelHtml(o, name, planOf(o))).join('')}</section>`;
}
export function bindOrdersCard(root, orders, onChange){ (orders || []).forEach(o => bindOrderPanel(root, o, {}, onChange)); }
