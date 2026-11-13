/* =====================================================================
   «تفعيل الجهاز»: دخول البوابات دون مزود رسائل. تصدر الإدارة رمز تفعيل لمرة واحدة لرقم الجوال ودوره،
   يدخله صاحبه مرة فيُعتمد جهازه ويبقى داخلًا. جهاز جديد = رمز جديد من الإدارة. مطابق لـ …_device_activation.sql.
   ===================================================================== */
export const ACT_TTL_DAYS = 7, ACT_MAX_FAILS = 5, ACT_WINDOW_MIN = 60;
export const ACT_FAIL = 'رمز التفعيل غير صحيح أو منتهٍ. اطلب رمزًا جديدًا من إدارة المركز.';
export const ACT_LOCKED = 'محاولات كثيرة خاطئة. حاول بعد ساعة أو راجع إدارة المركز.';
export const newActCode = () => { const a = new Uint32Array(1); (globalThis.crypto || {}).getRandomValues ? crypto.getRandomValues(a) : (a[0] = Math.floor(Math.random() * 4294967296)); return String(100000 + (a[0] % 900000)); };
/* فحص رمز التفعيل: رسالة واحدة للخطأ والمنتهي والمستخدَم، وقفل بعد 5 محاولات خاطئة في الساعة */
export function checkActivation(D, phone, role, code, now = Date.now()){
  const since = now - ACT_WINDOW_MIN * 60000, fails = (D.activation_attempts || []).filter(a => a.phone === phone && !a.ok && Date.parse(a.at) >= since).length;
  if(fails >= ACT_MAX_FAILS) return { ok:false, locked:true, error:ACT_LOCKED };
  const a = (D.activations || []).find(x => x.phone === phone && x.role === role && !x.used_at && !x.revoked && Date.parse(x.expires_at) > now && x.code === String(code));
  return a ? { ok:true, activation:a } : { ok:false, error:ACT_FAIL };
}
export const actStatus = (a, now = Date.now()) => a.used_at ? 'used' : a.revoked ? 'revoked' : Date.parse(a.expires_at) <= now ? 'expired' : 'active';
export const ACT_ST = { active:'بانتظار الاستخدام', used:'استُخدم', expired:'انتهى', revoked:'أُلغي' };
export const actMessage = (name, code, url) => `السلام عليكم ${name}،\nرمز تفعيل حسابك في منصة مركز سما القدرات: ${code}\nادخل من: ${url}\nاكتب رقم جوالك ثم الرمز مرة واحدة ويبقى جهازك معتمدًا. الرمز صالح ${ACT_TTL_DAYS} أيام ولا تشاركه مع أحد.`;
