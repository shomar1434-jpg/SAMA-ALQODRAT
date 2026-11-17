/* =====================================================================
   «كشف حساب المتدرب» (الخطوة AL): نافذة وطباعة A4 وتصدير CSV، من كشف الحساب في src/statement_logic.js.
   تُفتح من بيانات المتدرب، و«المتدربون»، ونافذة طلب الشراء.
   ===================================================================== */
import { $, esc, fmtNum, fmtShort, riyadhNow } from './utils.js';
import { ic } from './views2_head.js';
import { modal, closeModal } from './views2_programs.js';
import { AD } from './views2_admin.js';
import { docShell, printDocs, fmtGreg, exportCSV } from './print.js';
import { traineeStatement } from './statement_logic.js';

const KIND = { charge:'رسوم', opening:'دفعة سابقة', payment:'سداد', refund:'استرداد' };
const money = v => v ? fmtNum(v) : '';
const balTxt = b => b > 0 ? `متبقٍ عليه ${fmtNum(b)} ريال` : b < 0 ? `له رصيد ${fmtNum(-b)} ريال` : 'لا رصيد مستحق';

export function statementModal(traineeId){
  const t = (AD.trainees || []).find(x => x.id === traineeId); if(!t) return;
  const S = traineeStatement(AD, traineeId);
  modal(`<h3>${ic('receipt')} كشف حساب ${esc(t.full_name)}</h3>
    <p class="hint" style="margin:-4px 0 10px"><span dir="ltr">${esc(t.national_id)}</span> · ${fmtNum(S.orders)} طلب · حتى ${fmtShort(riyadhNow().date)}</p>
    <div class="grid g4" style="margin-bottom:12px">${[['الرسوم', S.charges], ['المدفوع', S.paid], ['المسترد', S.refunded], ['الرصيد', S.balance]].map(([k, v], i) => `<div class="card pad ostat"><span class="hint">${k}</span><b class="num">${i === 3 ? esc(balTxt(v)) : fmtNum(v) + ' ريال'}</b></div>`).join('')}</div>
    ${S.rows.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>التاريخ</th><th>البيان</th><th>المستند</th><th>عليه</th><th>له</th><th>الرصيد</th></tr></thead><tbody>${S.rows.map(r => `<tr><td class="num">${fmtShort(r.date)}</td><td><span class="pill ${r.kind === 'charge' ? 'info' : r.kind === 'refund' ? 'bad' : 'ok'}">${KIND[r.kind]}</span> ${esc(r.text)}<div class="hint" dir="ltr" style="text-align:right">${esc(r.order)}</div></td><td dir="ltr" class="num">${esc(r.doc)}</td><td class="num">${money(r.debit)}</td><td class="num">${money(r.credit)}</td><td class="num"><b>${fmtNum(r.balance)}</b></td></tr>`).join('')}</tbody></table></div>
      <p class="hint" style="margin:8px 0 0">«عليه» الرسوم والمبالغ المستردة له، و«له» ما دفعه. الطلب الملغى رسومه ما احتُفظ به بعد الاسترداد. الدفعات السابقة مرحَّلة من كشوف المركز قبل المنصة بلا فواتير.</p>` : '<p class="hint">لا طلبات شراء لهذا المتدرب.</p>'}
    <div style="display:flex;gap:8px;justify-content:end;flex-wrap:wrap;margin-top:12px"><button class="btn" id="stX">إغلاق</button>${S.rows.length ? `<button class="btn" id="stC">${ic('copy')} تصدير CSV</button><button class="btn pri" id="stP">${ic('printer')} طباعة A4</button>` : ''}</div>`);
  $('#stX').onclick = closeModal;
  if($('#stP')) $('#stP').onclick = () => printDocs([statementDoc(t, S)], `كشف حساب ${t.full_name}`);
  if($('#stC')) $('#stC').onclick = () => exportCSV(`كشف-حساب-${t.full_name}`, [['التاريخ', 'النوع', 'البيان', 'الطلب', 'المستند', 'عليه', 'له', 'الرصيد'], ...S.rows.map(r => [r.date, KIND[r.kind], r.text, r.order, r.doc, r.debit, r.credit, r.balance])]);
}

export function statementDoc(t, S){
  const D2 = v => (Math.round(v * 100) / 100).toLocaleString('en', { minimumFractionDigits:2 });
  return docShell({ docNo:`SOA-${String(t.national_id).slice(-4)}-${riyadhNow().date.replace(/-/g, '')}`, title:'كشف حساب متدرب', sub:`حتى ${fmtGreg(riyadhNow().date)}`,
    info:[['المتدرب', t.full_name, 'w2'], ['رقم الهوية', t.national_id], ['الجوال', t.phone || '']],
    stats:[['الرسوم (ريال)', D2(S.charges)], ['المدفوع (ريال)', D2(S.paid)], ['المسترد (ريال)', D2(S.refunded)], ['الرصيد (ريال)', D2(S.balance)]],
    body:`<table class="inv-t"><thead><tr><th>التاريخ</th><th>النوع</th><th>البيان</th><th>المستند</th><th>عليه</th><th>له</th><th>الرصيد</th></tr></thead><tbody>${S.rows.map(r => `<tr><td>${fmtGreg(r.date)}</td><td>${KIND[r.kind]}</td><td>${esc(r.text)}<br><small dir="ltr">${esc(r.order)}</small></td><td dir="ltr">${esc(r.doc)}</td><td class="n">${r.debit ? D2(r.debit) : ''}</td><td class="n">${r.credit ? D2(r.credit) : ''}</td><td class="n"><b>${D2(r.balance)}</b></td></tr>`).join('')}</tbody></table>`,
    note:`${balTxt(S.balance)}. مستند داخلي من نظام المركز وليس فاتورة ضريبية؛ الدفعات السابقة مرحَّلة من كشوف المركز قبل المنصة.` });
}
