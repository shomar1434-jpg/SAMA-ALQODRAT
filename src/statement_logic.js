/* =====================================================================
   كشف حساب المتدرب (الخطوة AL): كل طلباته ورسومها، والدفعات السابقة المرحَّلة، والفواتير، وإشعارات الاسترداد،
   بالتسلسل الزمني مع رصيد متحرك. منطق عرض فقط من بيانات الإدارة (لا جدول جديد ولا عملية مالية).
   الرصيد = الرسوم − المدفوع + المسترد. الطلب الملغى رسومه = ما احتُفظ به بعد الاسترداد، فيُغلق رصيده.
   ===================================================================== */
import { PAY_METHODS } from './order_logic.js';
import { docLines } from './billing_logic.js';

const r2 = v => Math.round((+v || 0) * 100) / 100;
const day = v => String(v || '').slice(0, 10);

export function traineeStatement(D, traineeId){
  const orders = (D.orders || []).filter(o => o.trainee_id === traineeId && o.approval !== 'rejected');
  const docs = (D.invoices || []).filter(i => i.status === 'issued' && orders.some(o => o.id === i.order_id));
  const rows = [];
  for(const o of orders){
    const charge = o.cancelled_at ? r2((+o.paid_amount || 0)) : r2(o.total);
    rows.push({ date:day(o.created_at), order:o.number, kind:'charge', doc:o.number, text:`${o.title}${o.cancelled_at ? ' — ملغى، والرسوم = المحتفظ به بعد الاسترداد' : ''}`, debit:charge, credit:0 });
    const op = o.opening;
    if(op && +op.paid){
      const ps = (op.payments || []).length ? op.payments : [{ amount:op.paid, label:'رصيد مرحَّل' }];
      ps.forEach(p => rows.push({ date:day(o.created_at), order:o.number, kind:'opening', doc:'—', text:`دفعة سابقة قبل المنصة${p.label ? ` (${p.label})` : ''}${p.method ? ` · ${PAY_METHODS[p.method] || p.method}` : ''}`, debit:0, credit:r2(p.amount) }));
    }
  }
  for(const i of docs){
    const ways = docLines(i).map(x => `${PAY_METHODS[x.method] || x.method} ${r2(x.amount)}`).join(' + ');
    if(i.doc_type === 'refund') rows.push({ date:i.issue_date, order:i.order_number, kind:'refund', doc:i.number, text:`إشعار استرداد · ${ways}${i.reason ? ` · ${i.reason}` : ''}`, debit:r2(i.paid), credit:0 });
    else rows.push({ date:i.issue_date, order:i.order_number, kind:'payment', doc:i.number, text:`سداد · ${ways}`, debit:0, credit:r2(i.paid) });
  }
  const rank = { charge:0, opening:1, payment:2, refund:3 };
  rows.sort((a, b) => a.date.localeCompare(b.date) || a.order.localeCompare(b.order) || rank[a.kind] - rank[b.kind]);
  let bal = 0; rows.forEach(x => { bal = r2(bal + x.debit - x.credit); x.balance = bal; });
  const sum = k => r2(rows.reduce((a, x) => a + (x.kind === k ? (k === 'charge' || k === 'refund' ? x.debit : x.credit) : 0), 0));
  return { rows, orders:orders.length, charges:sum('charge'), paid:r2(sum('payment') + sum('opening')), refunded:sum('refund'), balance:bal };
}
