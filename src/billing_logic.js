/* =====================================================================
   عمليات الفوترة (الخطوة AH): الدفع بأكثر من طريقة في فاتورة واحدة، وتغيير الباقة (ترقية/تخفيض)،
   والإلغاء والانسحاب، والاسترداد بإشعار استرداد مرتبط بالفاتورة الأصلية، وإغلاق الصندوق اليومي.
   قرارات المالك: الترقية تُبقي بداية الاشتراك (29 أغسطس)، والفائض والاسترداد الجزئي يُردّان بأمر المالك
   بإشعار استرداد بطرق الدفع المستخدمة، والمالك وحده يعتمد تغيير الباقة والإلغاء والاسترداد.
   مطابق لـ supabase/migrations/…_billing_ops.sql.
   ===================================================================== */
import { PAY_METHODS } from './order_logic.js';

export const MAX_LINES = 6;
export const r2 = v => Math.round((+v || 0) * 100) / 100;
export const refundNumber = (seq, year) => `RF-${year}-${String(seq).padStart(6, '0')}`;
export const DOC_TXT = { invoice:'فاتورة', refund:'إشعار استرداد' };

/* سطور السداد: [{method, amount, reference}] ↔ check_pay_lines */
export function checkLines(lines){
  const L = (Array.isArray(lines) ? lines : []).filter(x => x && (String(x.amount ?? '').trim() !== '' || x.reference));
  if(!L.length) throw new Error('أضف مبلغًا وطريقة سداد');
  if(L.length > MAX_LINES) throw new Error(`${MAX_LINES} طرق سداد على الأكثر`);
  const out = L.map(x => { const amount = r2(x.amount);
    if(!(amount > 0)) throw new Error('اكتب مبلغ كل طريقة سداد');
    if(!PAY_METHODS[x.method]) throw new Error('اختر طريقة السداد');
    return { method:x.method, amount, reference:String(x.reference || '').trim().slice(0, 60) }; });
  return { lines:out, sum:r2(out.reduce((a, x) => a + x.amount, 0)) };
}
/* عمود «طريقة السداد» في المستند: اسم الطريقة إن كانت واحدة، و«متعددة» إن تعددت ↔ lines_method */
export const linesMethod = lines => lines.length === 1 ? PAY_METHODS[lines[0].method] : 'متعددة';
export const linesText = lines => lines.map(x => `${PAY_METHODS[x.method] || x.method} ${x.amount}`).join(' + ');
export const linesRef = lines => lines.map(x => x.reference).filter(Boolean).join(' / ').slice(0, 60);
/* سطور المستند؛ الفواتير القديمة بلا سطور تُشتق من طريقتها ومبلغها */
const METHOD_KEY = Object.fromEntries(Object.entries(PAY_METHODS).map(([k, v]) => [v, k]));
export const docLines = i => (i.lines && i.lines.length) ? i.lines : [{ method:METHOD_KEY[i.method] || 'other', amount:+i.paid || 0, reference:i.transfer_ref || '' }];
export const isRefund = i => i.doc_type === 'refund';

/* القابل للاسترداد: كل المدفوع بعد إلغاء الطلب، أو الفائض عن الإجمالي بعد تخفيض الباقة ↔ order_refundable */
export const refundable = o => !o ? 0 : o.cancelled_at ? r2(o.paid_amount) : Math.max(0, r2((+o.paid_amount || 0) - (+o.total || 0)));
/* معاينة تغيير الباقة: الإجمالي الجديد يحفظ الخصم الممنوح على الباقة السابقة */
export function planChangePreview(o, oldTotal, newPlanTotal){
  const discount = Math.max(0, r2(oldTotal - (+o.total || 0))), total = Math.max(0, r2(newPlanTotal - discount)), paid = r2(o.paid_amount);
  return { discount, total, paid, remaining:Math.max(0, r2(total - paid)), surplus:Math.max(0, r2(paid - total)) };
}

/* إغلاق الصندوق ليوم: المقبوض والمردود والصافي لكل طريقة، من المستندات السارية الصادرة في ذلك اليوم */
export function cashClose(docs, date){
  const day = (docs || []).filter(i => i.status === 'issued' && i.issue_date === date);
  const by = Object.fromEntries(Object.keys(PAY_METHODS).map(k => [k, { in:0, out:0, n:0 }]));
  day.forEach(i => docLines(i).forEach(x => { const b = by[x.method] || by.other; if(isRefund(i)) b.out = r2(b.out + x.amount); else b.in = r2(b.in + x.amount); b.n++; }));
  Object.values(by).forEach(b => { b.net = r2(b.in - b.out); });
  const tin = r2(day.filter(i => !isRefund(i)).reduce((a, i) => a + i.paid, 0)), tout = r2(day.filter(isRefund).reduce((a, i) => a + i.paid, 0));
  return { date, docs:day, by, in:tin, out:tout, net:r2(tin - tout), invoices:day.filter(i => !isRefund(i)).length, refunds:day.filter(isRefund).length };
}
