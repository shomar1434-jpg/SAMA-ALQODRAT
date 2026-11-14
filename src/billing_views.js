/* =====================================================================
   واجهات عمليات الفوترة (الخطوة AH) داخل صفحتي «طلبات الشراء» و«الفواتير»:
   محرر سطور السداد (مبلغ × طريقة × مرجع)، نافذة «استلام المبلغ»، تغيير الباقة، الإلغاء والاسترداد،
   وتبويب «إغلاق الصندوق». المنطق في src/billing_logic.js.
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort } from './utils.js';
import { ic, toast } from './views2_head.js';
import { Store } from './data2.js';
import { modal, closeModal } from './views2_programs.js';
import { AD, ME, reloadAD } from './views2_admin.js';
import { setBusy, toLatin } from './features.js';
import { PAY_METHODS, orderRemaining } from './order_logic.js';
import { MAX_LINES, r2, refundable, planChangePreview, cashClose, docLines, isRefund, DOC_TXT } from './billing_logic.js';
import { planTotal, planName } from './qudurat.js';
import { docShell, printDocs, fmtGreg } from './print.js';

const sar = v => `${fmtNum(v)} ريال`;
export const isOwner = () => ME?.role === 'owner';
export const isFull = () => ['owner', 'full'].includes(ME?.role);

/* ---------- محرر سطور السداد ---------- */
const lineRow = (id, n, x = {}) => `<div class="pl-row" data-pl="${n}">
  <div class="field"><label for="${id}-a${n}">المبلغ (ريال)</label><input class="inp num" id="${id}-a${n}" data-k="amount" inputmode="decimal" value="${x.amount ?? ''}" autocomplete="off"></div>
  <div class="field"><label for="${id}-m${n}">الطريقة</label><select class="inp" id="${id}-m${n}" data-k="method">${Object.entries(PAY_METHODS).map(([k, v]) => `<option value="${k}" ${x.method === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
  <div class="field"><label for="${id}-r${n}">المرجع (اختياري)</label><input class="inp num" id="${id}-r${n}" data-k="reference" dir="ltr" maxlength="60" value="${esc(x.reference || '')}" placeholder="رقم العملية أو السند"></div>
  <button type="button" class="btn sm ghost pl-x" data-plx="${n}" aria-label="حذف هذه الطريقة">${ic('x')}</button></div>`;
export const linesHtml = (id, init = [{ method:'cash' }]) => `<div class="pl" id="${id}">${init.map((x, n) => lineRow(id, n, x)).join('')}</div>
  <div class="pl-foot"><button type="button" class="btn sm" id="${id}-add">${ic('plus')} إضافة طريقة سداد</button><span class="pl-sum">المجموع: <b class="num" id="${id}-sum">0</b> ريال</span></div>`;
export function bindLines(id, onSum){
  const box = $('#' + id), sum = () => { const v = r2(readLines(id).reduce((a, x) => a + (+x.amount || 0), 0)); $(`#${id}-sum`).textContent = fmtNum(v); onSum?.(v); return v; };
  const wire = () => { $$('[data-plx]', box).forEach(b => b.onclick = () => { if($$('.pl-row', box).length > 1){ b.closest('.pl-row').remove(); sum(); } });
    $$('input,select', box).forEach(i => i.oninput = sum); };
  $(`#${id}-add`).onclick = () => { const n = $$('.pl-row', box).length; if(n >= MAX_LINES) return toast(`${MAX_LINES} طرق سداد على الأكثر`);
    const used = readLines(id).map(x => x.method), next = Object.keys(PAY_METHODS).find(k => !used.includes(k)) || 'other';
    box.insertAdjacentHTML('beforeend', lineRow(id, Date.now() % 100000, { method:next })); wire(); $$('.pl-row input', box).slice(-3)[0].focus(); };
  wire(); sum(); return sum;
}
export const readLines = id => $$(`#${id} .pl-row`).map(r => { const g = k => $(`[data-k="${k}"]`, r).value; return { amount:toLatin(g('amount')).replace(/[^\d.]/g, ''), method:g('method'), reference:g('reference') }; });

/* ---------- قسم السداد داخل نافذة الطلب ---------- */
export function payHtml(o){
  const rem = orderRemaining(o), first = o.payment !== 'confirmed';
  if(o.cancelled_at) return '';
  if(!isFull()) return `<p class="hint" style="margin:0">تأكيد السداد واستلام المبالغ لمدير النظام فقط.</p>`;
  if(!first && !(rem > 0)) return `<div class="ord-acts"><span class="pill ok">${ic('check')} مسدَّد بالكامل ${sar(o.paid_amount)}</span></div>`;
  const init = first && o.claim ? [{ method:'transfer', amount:o.claim.amount, reference:o.claim.reference }] : [{ method:'cash', amount:first ? (o.due_now || '') : rem }];
  return `<p class="hint" style="margin:0 0 6px">${first ? `المطلوب الآن ${sar(o.due_now)}${o.total > o.due_now ? ` من إجمالي ${sar(o.total)}` : ''}. ` : `المتبقي ${sar(rem)}. `}اكتب كل طريقة بمبلغها؛ تصدر فاتورة واحدة تُفصَّل فيها الطرق. التحويل البنكي لا يُسجَّل إلا بعد مطابقة كشف البنك.</p>
    ${linesHtml('opl', init)}<div class="ord-acts"><span class="hint" id="opl-left" style="flex:1"></span><button class="btn pri sm" id="om-recv">${ic('wallet')} ${first ? 'تأكيد الاستلام وإصدار الفاتورة' : 'تسجيل الدفعة وإصدار فاتورتها'}</button></div>`;
}
export function bindPay(o, run){
  if(!$('#om-recv')) return;
  const rem = o.payment !== 'confirmed' ? r2(o.total - (+o.paid_amount || 0)) : orderRemaining(o);
  bindLines('opl', v => { const l = $('#opl-left'); if(l) l.textContent = o.total > 0 ? (v > rem ? `أكبر من المتبقي (${fmtNum(rem)})` : `يبقى بعدها ${fmtNum(r2(rem - v))} ريال`) : ''; });
  $('#om-recv').onclick = e => run(e.currentTarget, () => Store.receivePayment(o.id, { lines:readLines('opl') }), 'سُجّل المبلغ وصدرت الفاتورة');
}

/* ---------- تغيير الباقة والإلغاء والاسترداد (المالك) ---------- */
export function opsHtml(o){
  const sub = o.subscription_id ? (AD.subscriptions || []).find(s => s.id === o.subscription_id) : null, cur = sub && (AD.plans || []).find(p => p.id === sub.plan_id);
  const plans = (AD.plans || []).filter(p => p.active !== false && p.mode !== 'remote' && p.status !== 'coming_soon' && p.id !== sub?.plan_id).sort((a, b) => planTotal(a) - planTotal(b));
  const refund = refundable(o);
  if(!isOwner()) return o.cancelled_at || refund > 0 ? `<h4 class="ord-sec">4. الإلغاء والاسترداد</h4><p class="hint" style="margin:0">${o.cancelled_at ? 'الطلب ملغى. ' : ''}${refund > 0 ? `قابل للاسترداد ${sar(refund)}. ` : ''}الاسترداد وتغيير الباقة يعتمدها المالك.</p>` : '';
  return `${sub && cur && !o.cancelled_at ? `<h4 class="ord-sec">4. تغيير الباقة (ترقية أو تخفيض)</h4>
      <p class="hint" style="margin:0 0 6px">الباقة الحالية ${esc(planName(cur))} (${sar(planTotal(cur))}). تبقى بداية الاشتراك ${sub.start_date ? fmtShort(sub.start_date) : '(لم يبدأ)'} وتُحسب النهاية للباقة الجديدة. الباقات عن بُعد غير متاحة بعد.</p>
      <div class="grid g3"><div class="field"><label for="om-pl">الباقة الجديدة</label><select class="inp" id="om-pl"><option value="">اختر</option>${plans.map(p => `<option value="${p.id}" data-t="${planTotal(p)}">${esc(planName(p))} — ${fmtNum(planTotal(p))}</option>`).join('')}</select></div>
        <div class="field"><label for="om-pt">الإجمالي الجديد (ريال)</label><input class="inp num" id="om-pt" inputmode="decimal"></div>
        <div class="field"><label for="om-pr">سبب التغيير</label><input class="inp" id="om-pr" maxlength="200"></div></div>
      <div class="ord-acts"><span class="hint" id="om-pv" style="flex:1;min-width:200px"></span><button class="btn sm pri" id="om-chg" disabled>${ic('check')} اعتماد تغيير الباقة</button></div>` : ''}
    <h4 class="ord-sec">${sub && !o.cancelled_at ? '5' : '4'}. الإلغاء والاسترداد</h4>
    ${o.cancelled_at ? `<p class="alert t-danger" style="margin:0 0 8px"><span class="aic">${ic('x')}</span><span>الطلب ملغى ${fmtShort(String(o.cancelled_at).slice(0, 10))}: ${esc(o.cancel_reason || '')}</span></p>`
      : `<div class="ord-acts"><div class="field" style="flex:1;min-width:200px;margin:0"><label for="om-cr">سبب الإلغاء والانسحاب</label><input class="inp" id="om-cr" maxlength="300"></div><button class="btn sm danger soft" id="om-cancel">${ic('x')} إلغاء الطلب وانسحاب المتدرب</button></div>
        <p class="hint" style="margin:6px 0 0">يُلغى الاشتراك أو التسجيل ويبقى الطلب وفواتيره وسجله. الاسترداد بعدها قرار مستقل بالمبلغ الذي تحدده.</p>`}
    ${refund > 0 ? `<div class="card pad" style="margin-top:10px;background:var(--surface-2)"><b>${o.cancelled_at ? 'المدفوع القابل للاسترداد' : 'فائض بعد تخفيض الباقة'}: ${sar(refund)}</b>
        <p class="hint" style="margin:4px 0 6px">اكتب طرق الرد ومبالغها (كلها أو جزءًا منها)؛ يصدر «إشعار استرداد» مرتبط بآخر فاتورة.</p>
        ${linesHtml('orf', [{ method:'cash', amount:refund }])}
        <div class="field" style="margin-top:8px"><label for="om-rr">سبب الاسترداد</label><input class="inp" id="om-rr" maxlength="300"></div>
        <div class="ord-acts"><button class="btn sm pri" id="om-ref">${ic('wallet')} اعتماد الاسترداد وإصدار الإشعار</button></div></div>` : ''}`;
}
export function bindOps(o, run){
  if($('#om-pl')){ const sub = (AD.subscriptions || []).find(s => s.id === o.subscription_id), cur = (AD.plans || []).find(p => p.id === sub.plan_id);
    const pv = () => { const ok = !!$('#om-pl').value; $('#om-chg').disabled = !ok; if(!ok){ $('#om-pv').textContent = ''; return; }
      const paid = r2(o.paid_amount), d = r2(paid - r2(toLatin($('#om-pt').value)));
      $('#om-pv').textContent = `المدفوع ${fmtNum(paid)} · ${d > 0 ? `فائض ${fmtNum(d)} ريال يُرد بأمرك` : `المتبقي ${fmtNum(-d)} ريال`}`; };
    $('#om-pl').onchange = () => { const opt = $('#om-pl').selectedOptions[0]; if($('#om-pl').value){ const p = planChangePreview(o, planTotal(cur), +opt.dataset.t); $('#om-pt').value = p.total; } pv(); };
    $('#om-pt').oninput = pv;
    $('#om-chg').onclick = e => run(e.currentTarget, () => Store.changePlan(o.id, { plan_id:$('#om-pl').value, total:toLatin($('#om-pt').value), reason:$('#om-pr').value }), 'تغيّرت الباقة', true);
  }
  if($('#om-cancel')) $('#om-cancel').onclick = e => run(e.currentTarget, () => Store.cancelOrder(o.id, $('#om-cr').value), 'أُلغي الطلب', true);
  if($('#om-ref')){ bindLines('orf'); $('#om-ref').onclick = e => run(e.currentTarget, () => Store.refundOrder(o.id, { lines:readLines('orf'), reason:$('#om-rr').value }), 'صدر إشعار الاسترداد'); }
}

/* ---------- نافذة «استلام المبلغ» بعد إضافة مشترك ---------- */
export function receiveModal(orderId, after){
  const o = (AD.orders || []).find(x => x.id === orderId), t = o && (AD.trainees || []).find(x => x.id === o.trainee_id);
  if(!o || !isFull()) return after?.();
  modal(`<h3>${ic('wallet')} استلام المبلغ</h3><p class="hint" style="margin:-4px 0 10px">${esc(t?.full_name || '')} · ${esc(o.title)} · طلب <span dir="ltr">${esc(o.number)}</span></p>
    ${payHtml(o)}<div class="errtxt" id="omE" role="alert"></div>
    <div style="text-align:end;margin-top:12px"><button class="btn" id="rm-later">لاحقًا</button></div>`);
  $('#rm-later').onclick = () => { closeModal(); after?.(); };
  bindPay(o, async (btn, fn, msg) => { $('#omE').textContent = ''; setBusy(btn, true, 'جارٍ الحفظ');
    try { const r = await fn(); await reloadAD(); closeModal(); toast(msg); after?.(r); } catch(x){ setBusy(btn, false); $('#omE').textContent = x.message; } });
}

/* ---------- إغلاق الصندوق ---------- */
export function cashCloseHtml(date){
  const c = cashClose(AD.invoices, date), rows = Object.entries(PAY_METHODS).filter(([k]) => c.by[k].n);
  return `<div class="card pad rv"><div class="filters" style="margin:0 0 10px"><div class="field" style="margin:0"><label for="cc-d">اليوم</label><input class="inp" type="date" id="cc-d" value="${date}"></div>
      <div style="flex:1"></div><button class="btn sm" id="cc-p" ${c.docs.length ? '' : 'disabled'}>${ic('form')} طباعة إغلاق الصندوق</button></div>
    <div class="grid g4" style="margin-bottom:12px">${[['المقبوض', sar(c.in), 'ok'], ['المردود', sar(c.out), 'bad'], ['الصافي', sar(c.net), 'info'], ['المستندات', `${fmtNum(c.invoices)} فاتورة · ${fmtNum(c.refunds)} استرداد`, 'g']].map(([k, v, t]) => `<div class="card pad ostat"><span class="hint"><span class="pill dot ${t}" aria-hidden="true" style="padding:0 0 0 6px"></span>${k}</span><b class="num">${v}</b></div>`).join('')}</div>
    ${rows.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>الطريقة</th><th>المقبوض</th><th>المردود</th><th>الصافي</th></tr></thead><tbody>${rows.map(([k, v]) => `<tr><td>${v}</td><td class="num">${fmtNum(c.by[k].in)}</td><td class="num">${fmtNum(c.by[k].out)}</td><td class="num"><b>${fmtNum(c.by[k].net)}</b></td></tr>`).join('')}</tbody></table></div>
      <p class="hint" style="margin:8px 0 0">طابق «نقدًا» مع ما في الصندوق، و«شبكة» مع تقرير جهاز نقاط البيع، و«تحويل بنكي» مع كشف البنك.</p>` : '<p class="hint" style="margin:0">لا مستندات سارية صدرت في هذا اليوم.</p>'}</div>`;
}
export function cashCloseDoc(date){
  const c = cashClose(AD.invoices, date), D2 = v => (Math.round(v * 100) / 100).toLocaleString('en', { minimumFractionDigits:2 });
  return docShell({ docNo:`CASH-${date.replace(/-/g, '')}`, title:'إغلاق الصندوق', sub:fmtGreg(date),
    stats:[['المقبوض (ريال)', D2(c.in)], ['المردود (ريال)', D2(c.out)], ['الصافي (ريال)', D2(c.net)], ['المستندات', fmtNum(c.docs.length)]],
    body:`<table class="inv-t"><thead><tr><th>الطريقة</th><th>المقبوض</th><th>المردود</th><th>الصافي</th><th>ما في الصندوق/الجهاز فعلًا</th></tr></thead><tbody>${Object.entries(PAY_METHODS).map(([k, v]) => `<tr><td>${v}</td><td class="n">${D2(c.by[k].in)}</td><td class="n">${D2(c.by[k].out)}</td><td class="n"><b>${D2(c.by[k].net)}</b></td><td></td></tr>`).join('')}</tbody></table>
      <table class="inv-t" style="margin-top:12px"><thead><tr><th>المستند</th><th>النوع</th><th>صاحب الخدمة</th><th>الطرق</th><th>المبلغ</th></tr></thead><tbody>${c.docs.map(i => `<tr><td dir="ltr">${i.number}</td><td>${DOC_TXT[i.doc_type || 'invoice']}</td><td>${esc(i.customer_name)}</td><td>${docLines(i).map(x => `${PAY_METHODS[x.method] || ''} ${D2(x.amount)}`).join(' + ')}</td><td class="n">${isRefund(i) ? '−' : ''}${D2(i.paid)}</td></tr>`).join('')}</tbody></table>`,
    note:'يوقّع المسؤول المستلم بعد مطابقة النقد وتقرير الشبكة وكشف البنك.' });
}
export function bindCashClose(date, rerender){
  $('#cc-d').onchange = e => rerender(e.target.value);
  $('#cc-p').onclick = () => printDocs([cashCloseDoc(date)], `إغلاق الصندوق ${date}`);
}
