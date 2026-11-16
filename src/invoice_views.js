/* =====================================================================
   الإدارة: «الفواتير» (#admin-invoices) — مرجع المسؤول لمراجعة الحسابات.
   قائمة وتصفية وإجماليات، عرض الفاتورة وإرفاق صورة الإيصال، طباعة A4، كشف الفترة، وتصدير CSV.
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort, riyadhNow } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { titleBar } from './views2_main.js';
import { modal, closeModal } from './views2_programs.js';
import { AD, reloadAD } from './views2_admin.js';
import { setBusy } from './features.js';
import { docShell, printDocs, exportCSV, fmtGreg } from './print.js';
import { INV_ST, INV_TONE, KIND_TXT, RECEIPT_MAX, invoiceFilter, invoiceTotals } from './invoice_logic.js';
import { PAY_METHODS } from './order_logic.js';
import { docLines, isRefund, DOC_TXT } from './billing_logic.js';
import { cashCloseHtml, bindCashClose, isOwner } from './billing_views.js';

const sar = v => `${fmtNum(v)} ريال`, D2 = v => (Math.round(v * 100) / 100).toLocaleString('en', { minimumFractionDigits:2 });
let iF = null;
const filt = () => iF || (iF = { from:riyadhNow().date.slice(0, 8) + '01', to:riyadhNow().date, st:'issued', q:'', tab:'list', day:riyadhNow().date });
const linesTxt = i => docLines(i).map(x => `${PAY_METHODS[x.method] || x.method} ${fmtNum(x.amount)}${x.reference ? ` (${esc(x.reference)})` : ''}`).join(' + ');

/* الفاتورة للطباعة (A4، RTL): نسخة ثابتة من بيانات العميل والخدمة والتحويل */
export function invoiceHtml(i, receipt){
  const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
  const rf = isRefund(i);
  return docShell({ docNo:i.number, title:rf ? 'إشعار استرداد' : 'فاتورة', sub:`مستند داخلي لمراجعة الحسابات${rf && i.ref_invoice ? ` — مرتبط بالفاتورة ${i.ref_invoice}` : ''}${i.status === 'void' ? ' — ملغى' : ''}`,
    info:[['اسم صاحب الخدمة', i.customer_name, 'wide'], ['رقم السجل المدني', i.customer_nid || '—'], ['الجوال', i.customer_phone || '—'], ['تاريخ الفاتورة', fmtGreg(i.issue_date)], ['رقم طلب الشراء', i.order_number]],
    body:`${i.status === 'void' ? `<div class="inv-void">${rf ? 'إشعار ملغى' : 'فاتورة ملغاة'} — ${esc(i.void_reason || '')}</div>` : ''}
      <table class="inv-t"><thead><tr><th>نوع الخدمة</th><th>الخدمة</th><th>تاريخ الشراء</th><th>مبلغ الخدمة (ريال)</th></tr></thead>
        <tbody><tr><td>${KIND_TXT[i.kind] || ''}</td><td>${esc(i.service)}</td><td>${fmtGreg(i.purchase_date)}</td><td class="n">${D2(i.total)}</td></tr></tbody></table>
      <div class="inv-2"><table class="inv-k"><caption>${rf ? 'بيانات الرد' : 'بيانات السداد'}</caption><tbody>${row(rf ? 'طرق الرد' : 'طريقة السداد', docLines(i).length > 1 ? linesTxt(i) : esc(i.method))}${row(rf ? 'تاريخ الرد' : 'تاريخ السداد', fmtGreg(i.transfer_date))}${row('رقم المرجع', i.transfer_ref ? `<span dir="ltr">${esc(i.transfer_ref)}</span>` : '—')}${rf ? row('سبب الاسترداد', esc(i.reason || '')) : row('صورة الإيصال', i.has_receipt ? 'مرفقة' : 'غير مرفقة')}</tbody></table>
        <table class="inv-k inv-sum"><caption>الملخص المالي</caption><tbody>${row('مبلغ الخدمة', D2(i.total))}${row(rf ? 'المبلغ المسترد' : 'المدفوع بهذه الفاتورة', `<b>${D2(i.paid)}</b>`)}${row('المتبقي', D2(i.remaining))}</tbody></table></div>`,
    note:rf ? 'مستند داخلي مرجعي صادر من مركز المركز عند رد المبلغ بأمر المالك، وليس إشعارًا ضريبيًا.' : 'مستند داخلي مرجعي صادر من مركز المركز عند تأكيد وصول المبلغ، وليس فاتورة ضريبية.' }) +
    (receipt ? `<div class="pdoc inv-rc"><h2>صورة إيصال التحويل — الفاتورة <span dir="ltr">${i.number}</span></h2><img src="${receipt}" alt="صورة إيصال التحويل"></div>` : '');
}
/* كشف الفواتير للفترة */
function statementHtml(list, f){
  const t = invoiceTotals(list);
  return docShell({ docNo:`INVS-${f.from.replace(/-/g, '')}-${f.to.replace(/-/g, '')}`, title:'كشف الفواتير', sub:`من ${fmtGreg(f.from)} إلى ${fmtGreg(f.to)}`,
    stats:[['فواتير سارية', fmtNum(t.count)], ['المحصَّل (ريال)', D2(t.paid)], ['المسترد (ريال)', D2(t.refunded)], ['الصافي (ريال)', D2(t.net)]],
    body:`<table class="inv-t"><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>صاحب الخدمة</th><th>الخدمة</th><th>مرجع التحويل</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th></tr></thead><tbody>${list.map(i => `<tr class="${i.status}"><td dir="ltr">${i.number}</td><td>${fmtShort(i.issue_date)}</td><td>${esc(i.customer_name)}</td><td>${esc(i.service)}</td><td dir="ltr">${esc(i.transfer_ref || '—')}</td><td class="n">${isRefund(i) ? '−' : ''}${D2(i.paid)}</td><td class="n">${isRefund(i) ? '—' : D2(i.remaining)}</td><td>${isRefund(i) ? 'استرداد · ' : ''}${INV_ST[i.status]}</td></tr>`).join('')}</tbody></table>`,
    note:'الإجماليات للمستندات السارية فقط، والصافي = المحصَّل − المسترد.' });
}
const csvRows = list => [['رقم الفاتورة', 'تاريخ الفاتورة', 'رقم الطلب', 'صاحب الخدمة', 'السجل المدني', 'الجوال', 'نوع الخدمة', 'الخدمة', 'تاريخ الشراء', 'مبلغ الخدمة', 'المدفوع', 'المتبقي', 'طريقة السداد', 'تاريخ التحويل', 'مرجع التحويل', 'الإيصال', 'الحالة', 'سبب الإلغاء', 'نوع المستند', 'تفصيل الطرق', 'الفاتورة المرتبطة'],
  ...list.map(i => [i.number, i.issue_date, i.order_number, i.customer_name, i.customer_nid, i.customer_phone, KIND_TXT[i.kind] || '', i.service, i.purchase_date, i.total, i.paid, i.remaining, i.method, i.transfer_date, i.transfer_ref, i.has_receipt ? 'مرفق' : '', INV_ST[i.status], i.void_reason || '', DOC_TXT[i.doc_type || 'invoice'], docLines(i).map(x => `${PAY_METHODS[x.method] || x.method} ${x.amount}`).join(' + '), i.ref_invoice || ''])];

export function pageInvoices(){
  const f = filt(), all = (AD.invoices || []).slice().sort((a, b) => b.number.localeCompare(a.number)), list = invoiceFilter(all, { ...f, q:f.q.trim() }), t = invoiceTotals(list);
  const head = titleBar(`${ic('form')}الفواتير`, 'الفواتير <em>ومراجعة الحسابات</em>', 'تصدر فاتورة برقم تسلسلي عند استلام المبلغ من صفحة طلبات الشراء، بطريقة أو أكثر، وتحفظ بيانات صاحب الخدمة والخدمة والسداد كما كانت وقت الإصدار. الاسترداد بأمر المالك يصدر له «إشعار استرداد» مرتبط بالفاتورة. المستندات لا تُحذف ولا تُعدَّل؛ تُلغى بسبب مكتوب.') +
    `<div class="tabs" role="tablist" style="margin:0 0 14px">${[['list', 'form', 'الفواتير والاسترداد'], ['cash', 'wallet', 'إغلاق الصندوق']].map(([k, i, l]) => `<button class="tab" role="tab" data-it="${k}" aria-selected="${f.tab === k}">${ic(i)}${l}</button>`).join('')}</div>`;
  if(f.tab === 'cash'){ $('#main').innerHTML = head + cashCloseHtml(f.day); $$('[data-it]').forEach(b => b.onclick = () => { iF.tab = b.dataset.it; pageInvoices(); }); bindCashClose(f.day, d => { iF.day = d || riyadhNow().date; pageInvoices(); }); return; }
  $('#main').innerHTML = head +
    `<div class="grid g4" style="margin-bottom:14px">${[['فواتير سارية', fmtNum(t.count), 'ok'], ['المحصَّل', sar(t.paid), 'ok'], ['المسترد', `${sar(t.refunded)}${t.refunds ? ` (${fmtNum(t.refunds)})` : ''}`, 'bad'], ['الصافي', sar(t.net), 'info']].map(([k, v, c]) => `<div class="card pad ostat"><span class="hint"><span class="pill dot ${c}" aria-hidden="true" style="padding:0 0 0 6px"></span>${k}</span><b class="num">${v}</b></div>`).join('')}</div>
    <div class="filters"><div class="field" style="margin:0"><label for="if-a">من</label><input class="inp" type="date" id="if-a" value="${f.from}"></div><div class="field" style="margin:0"><label for="if-b">إلى</label><input class="inp" type="date" id="if-b" value="${f.to}"></div>
      <div class="field" style="margin:0"><label for="if-s">الحالة</label><select class="inp" id="if-s">${[['issued', 'السارية'], ['refund', 'إشعارات الاسترداد'], ['void', 'الملغاة'], ['all', 'الكل']].map(([k, v]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field" style="margin:0;flex:1;min-width:200px"><label for="if-q">بحث</label><input class="inp" id="if-q" type="search" placeholder="رقم الفاتورة أو الطلب، الاسم، الجوال، مرجع التحويل" value="${esc(f.q)}"></div>
      <div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap"><button class="btn sm" id="ifP" ${list.length ? '' : 'disabled'}>${ic('form')} طباعة الكشف</button><button class="btn sm" id="ifC" ${list.length ? '' : 'disabled'}>${ic('copy')} تصدير CSV</button></div></div>
    ${list.length ? `<div class="card rv"><div class="tblwrap"><table class="tb"><thead><tr><th>رقم الفاتورة</th><th>التاريخ</th><th>صاحب الخدمة</th><th>الخدمة</th><th>مبلغ الخدمة</th><th>المدفوع</th><th>المتبقي</th><th>مرجع التحويل</th><th>الحالة</th><th></th></tr></thead><tbody>${list.map(i => `<tr><td class="num" dir="ltr"><b>${i.number}</b></td><td>${fmtShort(i.issue_date)}</td><td>${esc(i.customer_name)}<div class="hint num" dir="ltr">${esc(i.customer_phone)}</div></td><td style="max-width:220px">${esc(i.service)}<div class="hint">${KIND_TXT[i.kind] || ''}</div></td>
        <td class="num">${fmtNum(i.total)}</td><td class="num"><b>${isRefund(i) ? '−' : ''}${fmtNum(i.paid)}</b>${docLines(i).length > 1 ? `<div class="hint">${docLines(i).length} طرق</div>` : ''}</td><td class="num">${isRefund(i) ? '—' : fmtNum(i.remaining)}</td><td class="num" dir="ltr">${esc(i.transfer_ref || '—')}${i.has_receipt ? `<div class="hint" dir="rtl">${ic('check')} إيصال</div>` : ''}</td>
        <td>${isRefund(i) ? '<span class="pill bad">استرداد</span> ' : ''}<span class="pill dot ${INV_TONE[i.status]}">${INV_ST[i.status]}</span></td><td><button class="btn sm pri" data-io="${i.id}">فتح</button></td></tr>`).join('')}</tbody></table></div></div>`
      : emptyBox(all.length ? 'لا فواتير بهذه التصفية' : 'لا توجد فواتير بعد', all.length ? '' : 'تصدر الفاتورة تلقائيًا عند «تأكيد وصول المبلغ» في صفحة طلبات الشراء.')}`;
  const set = (k, v) => { iF[k] = v; pageInvoices(); };
  $$('[data-it]').forEach(b => b.onclick = () => set('tab', b.dataset.it));
  $('#if-a').onchange = e => set('from', e.target.value); $('#if-b').onchange = e => set('to', e.target.value); $('#if-s').onchange = e => set('st', e.target.value);
  $('#if-q').oninput = e => { iF.q = e.target.value; clearTimeout(pageInvoices.t); pageInvoices.t = setTimeout(() => { pageInvoices(); const x = $('#if-q'); x.focus(); x.setSelectionRange(x.value.length, x.value.length); }, 300); };
  $('#ifP').onclick = () => printDocs([statementHtml(list.slice().reverse(), f)], 'كشف الفواتير');
  $('#ifC').onclick = () => exportCSV(`فواتير-${f.from}-${f.to}`, csvRows(list.slice().reverse()));
  $$('[data-io]').forEach(b => b.onclick = () => invoiceModal(all.find(i => i.id === b.dataset.io)));
}

/* ضغط صورة الإيصال في المتصفح قبل الحفظ */
export function compressImage(file, max = 1400){
  return new Promise((res, rej) => { if(!/^image\//.test(file?.type || '')) return rej(new Error('اختر ملف صورة'));
    const r = new FileReader(); r.onerror = () => rej(new Error('تعذّرت قراءة الصورة'));
    r.onload = () => { const im = new Image(); im.onerror = () => rej(new Error('تعذّرت قراءة الصورة'));
      im.onload = () => { let q = 0.72, k = Math.min(1, max / Math.max(im.width, im.height)), out = '';
        for(let n = 0; n < 5; n++){ const c = document.createElement('canvas'); c.width = Math.round(im.width * k); c.height = Math.round(im.height * k); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(im, 0, 0, c.width, c.height);
          out = c.toDataURL('image/jpeg', q); if(out.length <= RECEIPT_MAX) break; k *= 0.75; q -= 0.08; }
        out.length <= RECEIPT_MAX ? res(out) : rej(new Error('الصورة كبيرة جدًا')); };
      im.src = r.result; };
    r.readAsDataURL(file); });
}
async function invoiceModal(i){
  const rc = i.has_receipt ? await Store.invoiceReceipt(i.id).catch(() => null) : null;
  const rf = isRefund(i);
  modal(`<h3>${DOC_TXT[i.doc_type || 'invoice']} <span dir="ltr">${i.number}</span> <span class="pill dot ${INV_TONE[i.status]}">${INV_ST[i.status]}</span></h3>
    <dl class="ord-dl"><dt>صاحب الخدمة</dt><dd>${esc(i.customer_name)} · <span dir="ltr" class="num">${esc(i.customer_phone)}</span></dd><dt>نوع الخدمة</dt><dd>${KIND_TXT[i.kind] || ''} — ${esc(i.service)}</dd>
      <dt>تاريخ الشراء</dt><dd>${fmtShort(i.purchase_date)}</dd><dt>تاريخ الفاتورة</dt><dd>${fmtShort(i.issue_date)}</dd><dt>رقم الطلب</dt><dd dir="ltr">${i.order_number}</dd>
      <dt>مبلغ الخدمة</dt><dd>${sar(i.total)}</dd><dt>${rf ? 'المسترد' : 'المدفوع'}</dt><dd><b>${sar(i.paid)}</b></dd>${rf ? '' : `<dt>المتبقي</dt><dd>${sar(i.remaining)}</dd>`}
      <dt>${rf ? 'طرق الرد' : 'طرق السداد'}</dt><dd>${linesTxt(i)}</dd><dt>التاريخ</dt><dd>${fmtShort(i.transfer_date)}</dd>
      ${rf ? `<dt>الفاتورة المرتبطة</dt><dd dir="ltr">${esc(i.ref_invoice || '—')}</dd><dt>السبب</dt><dd>${esc(i.reason || '')}</dd>` : ''}
      ${i.status === 'void' ? `<dt>سبب الإلغاء</dt><dd>${esc(i.void_reason)}</dd>` : ''}</dl>
    ${rf ? '' : `<h4 class="ord-sec">صورة إيصال التحويل</h4>
    ${rc ? `<a href="${rc}" target="_blank" rel="noopener"><img class="inv-thumb" src="${rc}" alt="صورة إيصال التحويل"></a>` : '<p class="hint" style="margin:0">لم تُرفق صورة. أرفق الصورة التي وصلتك من العميل عبر واتساب.</p>'}
    <div class="ord-acts"><label class="btn sm" for="im-f">${ic('plus')} ${rc ? 'استبدال الصورة' : 'إرفاق صورة الإيصال'}</label><input type="file" id="im-f" accept="image/*" class="sr-only"></div>`}
    ${i.status === 'issued' && rf && isOwner() ? `<h4 class="ord-sec">إلغاء الإشعار</h4><div class="ord-acts"><div class="field" style="flex:1;min-width:200px;margin:0"><label for="im-r">سبب الإلغاء (يعود المبلغ إلى المدفوع)</label><input class="inp" id="im-r" maxlength="300"></div><button class="btn sm danger soft" id="im-vr">إلغاء الإشعار</button></div>` : ''}
    ${i.status === 'issued' && !rf ? `<h4 class="ord-sec">إلغاء الفاتورة</h4><div class="ord-acts"><div class="field" style="flex:1;min-width:200px;margin:0"><label for="im-r">سبب الإلغاء (يُلغى معه تأكيد سداد الطلب)</label><input class="inp" id="im-r" maxlength="300"></div><button class="btn sm danger soft" id="im-v">إلغاء الفاتورة</button></div>` : ''}
    <div class="errtxt" id="imE" role="alert"></div>
    <div style="display:flex;gap:8px;justify-content:end;margin-top:14px;flex-wrap:wrap"><button class="btn" id="im-x">إغلاق</button><button class="btn pri" id="im-p">${ic('form')} طباعة A4</button></div>`);
  $('#im-x').onclick = closeModal;
  $('#im-p').onclick = () => printDocs([invoiceHtml(i, rc)], `فاتورة ${i.number}`);
  if($('#im-vr')) $('#im-vr').onclick = async e => { const b = e.currentTarget; $('#imE').textContent = ''; setBusy(b, true, 'جارٍ الإلغاء');
    try { await Store.voidRefund(i.id, $('#im-r').value); await reloadAD(); closeModal(); toast('أُلغي إشعار الاسترداد'); pageInvoices(); } catch(x){ setBusy(b, false); $('#imE').textContent = x.message; } };
  if($('#im-f')) $('#im-f').onchange = async e => { const E = $('#imE'); E.textContent = ''; try { const img = await compressImage(e.target.files[0]); await Store.attachReceipt(i.id, img); await reloadAD(); toast('أُرفقت صورة الإيصال'); pageInvoices(); invoiceModal(AD.invoices.find(x => x.id === i.id)); } catch(x){ E.textContent = x.message; } };
  if($('#im-v')) $('#im-v').onclick = async e => { const b = e.currentTarget; $('#imE').textContent = ''; setBusy(b, true, 'جارٍ الإلغاء');
    try { await Store.confirmOrderPayment(i.order_id, 0, false, $('#im-r').value); await reloadAD(); closeModal(); toast('أُلغيت الفاتورة وتأكيد السداد'); pageInvoices(); } catch(x){ setBusy(b, false); $('#imE').textContent = x.message; } };
}
