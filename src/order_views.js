/* =====================================================================
   الإدارة: «طلبات الشراء» (#admin-orders): مراجعة، تأكيد سداد، قبول مؤقت، وإعدادات الحساب البنكي.
   ===================================================================== */
import { statementModal } from './statement_views.js';
import { $, $$, esc, fmtNum, fmtShort, matchPerson, scopeSelect } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { titleBar } from './views2_main.js';
import { modal, closeModal } from './views2_programs.js';
import { AD, reloadAD } from './views2_admin.js';
import { setBusy } from './features.js';
import { AP_TXT, AP_TONE, PAY_TXT, PAY_TONE, EV_TXT, PAY_METHODS, orderReady, orderRemaining } from './order_logic.js';
import { sar, pills } from './order_panel.js';
import { waTo } from './absence_notify.js';
import { CENTER } from './catalog.js';
import { payHtml, bindPay, opsHtml, bindOps, isFull } from './billing_views.js';

/* ---------- الإدارة: طلبات الشراء ---------- */
let oF = { st:'open', q:'', sc:'all' };
export const openOrdersCount = D => (D.orders || []).filter(o => o.approval === 'pending_review' || (o.payment === 'claimed' && o.approval !== 'rejected')).length;
export function pageOrders(){
  const m = $('#main'), D = AD, all = (D.orders || []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at)), tr = id => (D.trainees || []).find(t => t.id === id);
  const match = o => oF.st === 'all' ? true : oF.st === 'open' ? (o.approval === 'pending_review' || o.approval === 'needs_information' || (o.approval !== 'rejected' && o.payment !== 'confirmed')) : oF.st === 'claimed' ? o.payment === 'claimed' : oF.st === 'ready' ? orderReady(o) : o.approval === oF.st;
  const list = all.filter(o => match(o) && matchPerson(oF.sc, oF.q, tr(o.trainee_id), o.number, o.title));
  const bank = D.settings?.bank || {}, n = k => all.filter(o => k(o)).length;
  m.innerHTML = titleBar(`${ic('wallet')}طلبات الشراء`, 'طلبات الشراء <em>للمراجعة</em>', 'لكل تسجيل طلب برقم فريد. المراجعة وتأكيد السداد قراران مستقلان: الموافقة لا تثبت وصول التحويل، وتأكيد السداد يكون بعد مطابقة كشف البنك.') +
    `<div class="grid g4" style="margin-bottom:14px">${[['بانتظار المراجعة', n(o => o.approval === 'pending_review'), 'warn'], ['تحويلات قيد المطابقة', n(o => o.payment === 'claimed'), 'info'], ['مستوفية (موافقة + سداد)', n(o => orderReady(o) && !o.provisional), 'ok'], ['قبول مؤقت', n(o => o.provisional), 'g']].map(([t, v, c]) => `<div class="card pad ostat"><span class="hint"><span class="pill dot ${c}" aria-hidden="true" style="padding:0 0 0 6px"></span>${t}</span><b class="num">${fmtNum(v)}</b></div>`).join('')}</div>
    <div class="filters"><label class="sr-only" for="of-st">الحالة</label><select class="inp" id="of-st">${[['open', 'تحتاج إجراء'], ['pending_review', 'بانتظار المراجعة'], ['claimed', 'تحويل قيد المطابقة'], ['needs_information', 'مطلوب استكمال'], ['approved', 'موافق عليها'], ['ready', 'مستوفية'], ['rejected', 'مرفوضة'], ['all', 'الكل']].map(([k, v]) => `<option value="${k}" ${oF.st === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label class="sr-only" for="of-q">بحث</label><input class="inp" id="of-q" type="search" placeholder="رقم الطلب أو أي جزء من الاسم أو الجوال" value="${esc(oF.q)}" style="flex:1;min-width:200px">${scopeSelect('of-sc', oF.sc)}</div>
    ${list.length ? `<div class="card rv"><div class="tblwrap"><table class="tb"><thead><tr><th>رقم الطلب</th><th>التاريخ</th><th>المتدرب</th><th>البند</th><th>المطلوب الآن</th><th>المتبقي</th><th>المراجعة</th><th>السداد</th><th></th></tr></thead><tbody>${list.map(o => { const t = tr(o.trainee_id);
        return `<tr><td class="num" dir="ltr"><b>${esc(o.number)}</b></td><td>${fmtShort(o.created_at.slice(0, 10))}</td><td>${esc(t?.full_name || '—')}<div class="hint num" dir="ltr">${esc(t?.phone || '')}</div></td><td style="max-width:240px">${esc(o.title)}</td>
          <td class="num">${o.due_now > 0 ? fmtNum(o.due_now) : '—'}${o.total > o.due_now ? `<div class="hint">من ${fmtNum(o.total)}</div>` : ''}</td>
          <td class="num">${fmtNum(orderRemaining(o))}</td>
          <td><span class="pill dot ${AP_TONE[o.approval]}">${AP_TXT[o.approval]}</span>${o.provisional ? '<div class="hint">قبول مؤقت</div>' : ''}${o.cancelled_at ? '<div><span class="pill bad">ملغى</span></div>' : ''}</td>
          <td><span class="pill dot ${PAY_TONE[o.payment]}">${PAY_TXT[o.payment]}</span>${o.claim && o.payment !== 'confirmed' ? `<div class="hint num">${fmtNum(o.claim.amount)} · ${fmtShort(o.claim.date)}</div>` : ''}</td>
          <td><button class="btn sm pri" data-oo="${o.id}">فتح</button></td></tr>`; }).join('')}</tbody></table></div></div>` : emptyBox(all.length ? 'لا طلبات بهذه التصفية' : 'لا توجد طلبات بعد', all.length ? '' : 'يُنشأ طلب برقم فريد مع كل تسجيل جديد في برنامج أو باقة.')}
    <div class="grid g2" style="margin-top:18px;align-items:start">
      <form class="card pad rv" id="bankF" novalidate><h3 class="ctitle">${ic('wallet')}الحساب البنكي للتحويل</h3><p class="hint" style="margin:-4px 0 10px">لا تظهر بيانات الحساب للمسجّلين إلا بعد تفعيلها هنا. تحقق من البيانات مع البنك قبل التفعيل.</p>
        <div class="grid g2"><div class="field"><label for="bk-b">البنك</label><input class="inp" id="bk-b" name="bank" value="${esc(bank.bank || '')}"></div><div class="field"><label for="bk-n">اسم المستفيد</label><input class="inp" id="bk-n" name="beneficiary" value="${esc(bank.beneficiary || '')}"></div>
          <div class="field" style="grid-column:1/-1"><label for="bk-i">الآيبان</label><input class="inp num" id="bk-i" name="iban" dir="ltr" value="${esc(bank.iban || '')}"></div>
          <div class="field"><label for="bk-a">رقم الحساب</label><input class="inp num" id="bk-a" name="account" dir="ltr" value="${esc(bank.account || '')}"></div></div>
        <label class="chk" style="margin-top:8px"><input type="checkbox" name="enabled" ${bank.enabled ? 'checked' : ''}> تحققت من البيانات؛ اعرضها للمسجّلين</label>
        <div class="errtxt" id="bkE" role="alert"></div><div style="text-align:end;margin-top:8px"><button class="btn pri sm">${ic('check')} حفظ</button></div></form>
      <div class="card pad rv"><h3 class="ctitle">${ic('alert')}الحضور قبل اعتماد الطلب</h3>
        <label class="chk"><input type="checkbox" id="reqAp" ${D.settings?.require_order_approval ? 'checked' : ''}> منع تسجيل الحضور قبل «موافقة المسؤول + تأكيد السداد»</label>
        <p class="hint" style="margin:8px 0 0">معطَّل افتراضيًا: يحضر المتدرب من أول يوم كما هو الآن، وتتابع الإدارة السداد من هذه الصفحة. عند تفعيله يُرفض مسح الباركود لمن لم يُعتمد طلبه، إلا من مُنح «قبولًا مؤقتًا». التسجيلات السابقة لهذه الميزة لا تتأثر.</p></div></div>`;
  $('#of-st').onchange = e => { oF.st = e.target.value; pageOrders(); };
  $('#of-sc').onchange = e => { oF.sc = e.target.value; pageOrders(); };
  $('#of-q').oninput = e => { oF.q = e.target.value; clearTimeout(pageOrders.t); pageOrders.t = setTimeout(() => { pageOrders(); const i = $('#of-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  $$('[data-oo]').forEach(b => b.onclick = () => orderModal(all.find(o => o.id === b.dataset.oo)));
  $('#bankF').onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target), b = $('button', e.target); $('#bkE').textContent = ''; setBusy(b, true, 'جارٍ الحفظ');
    try { await Store.saveBank({ bank:fd.get('bank'), beneficiary:fd.get('beneficiary'), iban:fd.get('iban'), account:fd.get('account'), enabled:!!fd.get('enabled') }); await reloadAD(); toast('حُفظت بيانات الحساب'); pageOrders(); } catch(x){ setBusy(b, false); $('#bkE').textContent = x.message; } };
  $('#reqAp').onchange = async e => { await Store.saveSettings({ require_order_approval:e.target.checked }); await reloadAD(); toast(e.target.checked ? 'فُعّل منع الحضور قبل الاعتماد' : 'أُلغي منع الحضور قبل الاعتماد'); };
}

/* تذكير بالسداد عبر واتساب: رسالة جاهزة للمتدرب أو لولي أمره، والإرسال بيد المسؤول */
function remindHtml(o, t){
  const rem = orderRemaining(o); if(!t || !(rem > 0) || o.approval === 'rejected') return '';
  const msg = to => `السلام عليكم ورحمة الله وبركاته\n${to === 'g' ? `ولي أمر ${t.gender === 'أنثى' ? 'المتدربة' : 'المتدرب'}: ${t.full_name}` : `${t.gender === 'أنثى' ? 'المتدربة' : 'المتدرب'}: ${t.full_name}`}\nنذكّركم بالمبلغ المتبقي على طلب ${o.number} (${o.title}): ${fmtNum(rem)} ريال.\nللسداد أو الاستفسار تواصلوا معنا عبر واتساب المركز:\n${CENTER.whatsappLink}\n${CENTER.name}`;
  const a = waTo(t.phone, msg('t')), g = t.guardian_phone && t.guardian_phone !== t.phone ? waTo(t.guardian_phone, msg('g')) : '';
  return a || g ? `<div class="ord-acts" style="margin-top:10px"><span class="hint" style="flex:1;min-width:160px">تذكير بالمتبقي (${sar(rem)}) عبر واتساب:</span>${a ? `<a class="btn sm" target="_blank" rel="noopener" href="${a}">${ic('send')} للمتدرب</a>` : ''}${g ? `<a class="btn sm" target="_blank" rel="noopener" href="${g}">${ic('send')} لولي الأمر</a>` : ''}</div>` : '';
}
function orderModal(o){
  const t = (AD.trainees || []).find(x => x.id === o.trainee_id), dup = (AD.orders || []).filter(x => x.trainee_id === o.trainee_id && x.id !== o.id && x.approval !== 'rejected').length;
  modal(`<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h3 style="margin:0">طلب <span dir="ltr">${esc(o.number)}</span></h3><button type="button" class="btn sm" id="omST">${ic('receipt')} كشف حساب المتدرب</button></div><div class="ord-st" style="margin:-4px 0 10px">${pills(o)}${o.cancelled_at ? ' <span class="pill bad">ملغى</span>' : ''}</div>
    <dl class="ord-dl"><dt>المتدرب</dt><dd>${esc(t?.full_name || '—')} · <span dir="ltr" class="num">${esc(t?.phone || '')}</span>${t?.guardian_phone ? ` · ولي الأمر <span dir="ltr" class="num">${esc(t.guardian_phone)}</span>` : ''}</dd>
      <dt>البند</dt><dd>${esc(o.title)}</dd><dt>المطلوب الآن</dt><dd>${o.due_now > 0 ? sar(o.due_now) : 'غير محدد السعر'}${o.total > o.due_now ? ` من إجمالي ${sar(o.total)}` : ''}</dd>
      <dt>التحويل المُبلَّغ</dt><dd>${o.claim ? `${sar(o.claim.amount)} بتاريخ ${fmtShort(o.claim.date)}${o.claim.reference ? ` · مرجع <span dir="ltr">${esc(o.claim.reference)}</span>` : ''}` : 'لم يُبلَّغ بتحويل'}</dd>
      ${o.paid_amount ? `<dt>المدفوع</dt><dd>${sar(o.paid_amount)}${o.opening ? ` (منها ${sar(o.opening.paid)} مرحَّلة من قبل النظام)` : ''} · المتبقي <b>${sar(orderRemaining(o))}</b></dd>` : ''}
      ${o.discount_note ? `<dt>سبب الخصم</dt><dd>${esc(o.discount_note)}</dd>` : ''}
      ${o.opening?.payments?.length ? `<dt>دفعات سابقة</dt><dd>${o.opening.payments.map(p => `${esc(p.label)} ${fmtNum(p.amount)} (${PAY_METHODS[p.method] || ''})`).join(' · ')}</dd>` : ''}</dl>
    ${dup ? `<p class="alert t-info" style="margin:10px 0 0"><span class="aic">${ic('alert')}</span><span>للمتدرب ${fmtNum(dup)} طلبًا آخر. تأكد أن التحويل نفسه لا يُعتمد لطلبين.</span></p>` : ''}
    ${remindHtml(o, t)}
    <h4 class="ord-sec">1. مراجعة الطلب</h4>
    <div class="field"><label for="om-r">السبب أو المطلوب استكماله (إلزامي عند الرفض أو طلب الاستكمال)</label><input class="inp" id="om-r" maxlength="300" value="${esc(o.note || '')}"></div>
    <div class="ord-acts"><button class="btn pri sm" data-od="approved">${ic('check')} موافقة</button><button class="btn sm" data-od="needs_information">طلب استكمال معلومات</button><button class="btn sm danger soft" data-od="rejected">رفض مع السبب</button></div>
    <h4 class="ord-sec">2. استلام المبلغ وتأكيد السداد</h4>
    ${payHtml(o)}
    ${o.payment === 'confirmed' && isFull() ? `<div class="ord-acts"><span class="pill ok">${ic('check')} المدفوع ${sar(o.paid_amount)}</span>${o.refunded ? `<span class="pill bad">المسترد ${sar(o.refunded)}</span>` : ''}<button class="btn sm" id="om-un">إلغاء تأكيد السداد (بسبب في الخانة أعلاه)</button><a class="btn sm" href="#admin-invoices">الفواتير</a></div>` : ''}
    <h4 class="ord-sec">3. قبول مؤقت</h4>
    <div class="ord-acts"><span class="hint" style="flex:1;min-width:200px">يسمح بالحضور قبل اكتمال السداد أو المراجعة (لمن وعد بالسداد). يحتاج سببًا في الخانة أعلاه.</span><button class="btn sm" id="om-prov">${o.provisional ? 'إلغاء القبول المؤقت' : 'منح قبول مؤقت'}</button></div>
    ${opsHtml(o)}
    <div class="errtxt" id="omE" role="alert"></div>
    <details class="ord-log"><summary>سجل الطلب (${fmtNum((o.events || []).length)})</summary><ol>${(o.events || []).map(e => `<li><b>${EV_TXT[e.action] || e.action}</b> · ${e.by === 'admin' || (e.by && e.by !== 'trainee') ? 'الإدارة' : 'صاحب الطلب'} · <span class="num">${fmtShort(String(e.at).slice(0, 10))}</span>${e.reason ? ` — ${esc(e.reason)}` : ''}</li>`).join('')}</ol></details>
    <div style="text-align:end;margin-top:12px"><button class="btn" id="om-x">إغلاق</button></div>`);
  const E = x => { $('#omE').textContent = x; }, run = async (btn, fn, msg, reopen) => { E(''); setBusy(btn, true, 'جارٍ الحفظ'); try { await fn(); await reloadAD(); closeModal(); toast(msg); pageOrders(); if(reopen) orderModal((AD.orders || []).find(x => x.id === o.id)); } catch(x){ setBusy(btn, false); E(x.message); } };
  $('#om-x').onclick = closeModal;
  $$('[data-od]').forEach(b => b.onclick = () => run(b, () => Store.reviewOrder(o.id, b.dataset.od, $('#om-r').value, o.version), { approved:'وُوفق على الطلب', needs_information:'طُلب استكمال المعلومات', rejected:'رُفض الطلب' }[b.dataset.od]));
  if($('#om-un')) $('#om-un').onclick = e => run(e.currentTarget, () => Store.confirmOrderPayment(o.id, 0, false, $('#om-r').value), 'أُلغي تأكيد السداد وأُلغيت فاتورته');
  $('#omST').onclick = () => statementModal(o.trainee_id);
  bindPay(o, run); bindOps(o, run);
  $('#om-prov').onclick = e => run(e.currentTarget, () => Store.setOrderProvisional(o.id, !o.provisional, $('#om-r').value), o.provisional ? 'أُلغي القبول المؤقت' : 'مُنح قبول مؤقت');
}
