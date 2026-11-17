/* =====================================================================
   طلبات الشراء (المرحلة 1 من docs/payments/SPEC_v1_4.md، القسمان 7 و13 و41):
   لكل تسجيل طلب برقم فريد دائم، ومحوران مستقلان: مراجعة المسؤول، والسداد (تحويل بنكي يؤكده المحاسب).
   الأسعار من المنصة (الحضوري 690 + أقساط 250…)، والتسجيل يبقى كما هو؛ ومنع الحضور قبل الاعتماد خيار في الإعدادات.
   مطابق لـ supabase/migrations/…_orders.sql.
   ===================================================================== */
export const AP_TXT = { pending_review:'بانتظار المراجعة', needs_information:'مطلوب استكمال', approved:'موافق عليه', rejected:'مرفوض' };
export const AP_TONE = { pending_review:'warn', needs_information:'info', approved:'ok', rejected:'bad' };
export const PAY_TXT = { unpaid:'غير مسدد', claimed:'تحويل قيد المطابقة', confirmed:'تم تأكيد السداد' };
export const PAY_TONE = { unpaid:'g', claimed:'warn', confirmed:'ok' };
export const EV_TXT = { created:'إنشاء الطلب', transfer_reported:'إبلاغ بتحويل', approved:'موافقة', needs_information:'طلب استكمال معلومات', rejected:'رفض', payment_confirmed:'تأكيد السداد', payment_unconfirmed:'إلغاء تأكيد السداد', payment_added:'تسجيل دفعة', imported:'استيراد من سجل سابق', edited:'تعديل الرسوم', provisional_on:'قبول مؤقت', provisional_off:'إلغاء القبول المؤقت', plan_changed:'تغيير الباقة', cancelled:'إلغاء وانسحاب', refunded:'استرداد', refund_voided:'إلغاء إشعار استرداد' };
/* بيانات الحساب البنكي المقدمة من المالك (القسم 7)؛ لا تُعرض للعملاء حتى يفعّلها المسؤول */
export const PAY_METHODS = { transfer:'تحويل بنكي', pos:'شبكة', cash:'نقدًا', other:'أخرى' };
export const orderRemaining = o => o.cancelled_at ? 0 : Math.max(0, Math.round(((+o.total || 0) - (+o.paid_amount || 0)) * 100) / 100);
export const BANK_DEFAULT = { enabled:false, bank:'البنك الأهلي', beneficiary:'مركز سما القدرات', iban:'SA1210000001400012583008', account:'01400012583008' };
export const orderNumber = (seq, year) => `SAMA-${year}-${String(seq).padStart(6, '0')}`;
/* الطلب مستوفٍ: موافقة المسؤول + سداد مؤكد للمطلوب الآن، أو قبول مؤقت من الإدارة */
export const orderReady = o => !!o && (o.provisional === true || (o.approval === 'approved' && o.payment === 'confirmed'));
export const orderOf = (D, { subscription_id, enrollment_id }) => (D.orders || []).find(o => (subscription_id && o.subscription_id === subscription_id) || (enrollment_id && (o.enrollment_ids || []).includes(enrollment_id)));
/* يُمنع الحضور فقط إذا فعّلت الإدارة الخيار ووُجد للتسجيل طلب غير مستوفٍ؛ التسجيلات السابقة بلا طلب لا تُمنع */
export const attendanceBlocked = (D, key) => { if(!D.settings?.require_order_approval) return false; const o = orderOf(D, key); return !!o && !orderReady(o); };
export const validIban = v => { const s = String(v || '').replace(/\s/g, '').toUpperCase(); if(!/^SA\d{22}$/.test(s)) return false;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => c.charCodeAt(0) - 55); let m = 0; for(const ch of r) m = (m * 10 + +ch) % 97; return m === 1; };
/* رسالة واتساب المجهزة (قالب القسم 7): يرسلها العميل بنفسه ويرفق الإيصال يدويًا */
export const waTransferText = (o, name, amount) => `السلام عليكم، بخصوص طلب الشراء رقم ${o.number}.\nالاسم: ${name}\nالبرنامج/الخدمة: ${o.title}\nالمبلغ المحول: ${amount ?? o.due_now} ريال.\nأرغب في متابعة مطابقة التحويل واعتماد الطلب، وسأرفق إثبات السداد.`;
/* ما يراه صاحب الطلب: بلا هوية المراجع */
export const orderPublic = (o, bank) => ({ id:o.id, number:o.number, title:o.title, kind:o.kind, total:o.total, due_now:o.due_now, approval:o.approval, payment:o.payment, provisional:!!o.provisional,
  note:o.note || '', paid_amount:o.paid_amount || 0, discount_note:o.discount_note || '', claim:o.claim ? { amount:o.claim.amount, reference:o.claim.reference, date:o.claim.date } : null, created_at:o.created_at, trainee_id:o.trainee_id, cancelled:!!o.cancelled_at, refunded:+o.refunded || 0,
  bank: bank?.enabled ? { bank:bank.bank, beneficiary:bank.beneficiary, iban:bank.iban, account:bank.account } : null });
export function checkTransfer(f, today){
  const amount = Math.round(+f.amount * 100) / 100;
  if(!(amount > 0) || amount > 100000) throw new Error('اكتب المبلغ المحوَّل بالريال');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(f.date || '')) || f.date > today) throw new Error('اختر تاريخ التحويل');
  return { amount, date:f.date, reference:String(f.reference || '').trim().slice(0, 60) };
}

/* الأقساط المسددة (قرار المالك 17 نوفمبر): الدفعة الأولى (رسوم التسجيل) ثم أقساط الباقة بالترتيب، والمدفوع يغطيها بالترتيب.
   يُحسب من إجمالي الطلب (بعد أي خصم)، والقسط الأخير يستوعب فرق التقريب. للعرض فقط. */
const rr = v => Math.round((+v || 0) * 100) / 100;
export const planOfOrder = (D, o) => { const s = o?.subscription_id && (D.subscriptions || []).find(x => x.id === o.subscription_id); return s ? (D.plans || []).find(p => p.id === s.plan_id) || null : null; };
export function installmentsOf(o, plan){
  const n = +plan?.installments || 0, total = +o?.total || 0; if(!n || total <= 0 || o.kind !== 'plan') return null;
  const first = Math.min(+plan.reg_fee || 0, total), rest = rr(total - first), per = rr(rest / n), paid = Math.min(+o.paid_amount || 0, total);
  const after = rr(Math.max(0, paid - first)), paidN = Math.min(n, Math.floor((after + 0.005) / (per || 1)));
  return { first, firstPaid:paid >= first - 0.005, n, per, paidN, instPaid:Math.min(after, rest), partial:rr(after - paidN * per) > 0 && paidN < n, remaining:orderRemaining(o) };
}
export const instText = (x, fmt) => !x ? '' : `${x.firstPaid ? 'الدفعة الأولى مسددة' : 'الدفعة الأولى غير مكتملة'} · الأقساط المسددة ${fmt(x.paidN)} من ${fmt(x.n)} (${fmt(x.instPaid)} ريال)${x.partial ? ' وجزء من التالي' : ''} · المتبقي ${fmt(x.remaining)} ريال`;
