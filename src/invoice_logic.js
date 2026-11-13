/* =====================================================================
   الفواتير الداخلية (مرجع المسؤول لمراجعة الحسابات): تصدر فاتورة برقم تسلسلي عند تأكيد السداد،
   وتحفظ نسخة ثابتة من بيانات العميل والخدمة والتحويل. لا تُحذف؛ تُلغى بسبب مكتوب.
   مستند داخلي وليس فاتورة ضريبية. مطابق لـ supabase/migrations/…_invoices.sql.
   ===================================================================== */
export const INV_ST = { issued:'سارية', void:'ملغاة' };
export const INV_TONE = { issued:'ok', void:'bad' };
export const KIND_TXT = { plan:'باقة قدرات وتحصيلي', program:'برنامج تدريبي' };
export const RECEIPT_MAX = 900000;   // حد حجم صورة الإيصال المضغوطة (حروف data URL)
export const invoiceNumber = (seq, year) => `INV-${year}-${String(seq).padStart(6, '0')}`;
/* نسخة ثابتة وقت الإصدار: لا تتغير بتغيّر بيانات المتدرب أو الباقة لاحقًا */
export function buildInvoice(o, t, { amount, seq, date, prior = 0, method = 'تحويل بنكي', transfer_date, transfer_ref }){
  const paid = Math.round(+amount * 100) / 100;
  return { number:invoiceNumber(seq, date.slice(0, 4)), order_id:o.id, order_number:o.number, trainee_id:o.trainee_id,
    customer_name:t?.full_name || '', customer_nid:t?.national_id || '', customer_phone:t?.phone || '',
    kind:o.kind, service:o.title, purchase_date:String(o.created_at).slice(0, 10), total:+o.total || 0, paid, remaining:Math.max(0, Math.round(((+o.total || 0) - prior - paid) * 100) / 100),
    method, transfer_date:transfer_date || o.claim?.date || date, transfer_ref:transfer_ref ?? (o.claim?.reference || ''), issue_date:date, status:'issued', void_reason:'', has_receipt:false };
}
export const invoiceFilter = (list, { from, to, st, q }) => (list || []).filter(i => (!from || i.issue_date >= from) && (!to || i.issue_date <= to) && (!st || st === 'all' || i.status === st) &&
  (!q || i.number.includes(q.toUpperCase()) || i.order_number.includes(q.toUpperCase()) || i.customer_name.includes(q) || i.customer_phone.includes(q) || i.customer_nid.includes(q) || (i.transfer_ref || '').includes(q)));
/* الإجماليات للفواتير السارية فقط */
export const invoiceTotals = list => { const ok = (list || []).filter(i => i.status === 'issued');
  return { count:ok.length, voided:(list || []).length - ok.length, paid:Math.round(ok.reduce((a, i) => a + i.paid, 0) * 100) / 100, remaining:Math.round(ok.reduce((a, i) => a + i.remaining, 0) * 100) / 100 }; };
export const validReceipt = s => typeof s === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(s) && s.length <= RECEIPT_MAX;
