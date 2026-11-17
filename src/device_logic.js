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
/* الدخول برقم الهوية: يُحوَّل داخليًا إلى جوال الحساب حسب الدور (المتدرب: هويته؛ ولي الأمر: هوية ابنه؛ المدرب: هويته). يبقى الجوال مقبولًا للتوافق */
export const REQ_TTL_MIN = 15, REQ_MAX_HOUR = 5;
export function resolveIdent(D, ident, role){
  const v = String(ident || '').replace(/\D/g, ''); if(/^05\d{8}$/.test(v)) return v; if(!/^[12]\d{9}$/.test(v)) return null;
  if(role === 'teacher') return (D.teachers || []).find(t => t.active !== false && t.national_id === v)?.phone || null;
  const t = (D.trainees || []).find(x => x.national_id === v); return !t ? null : role === 'guardian' ? (t.guardian_phone || null) : (t.phone || null);
}
export const deviceShort = id => String(id || '').replace(/-/g, '').slice(0, 4).toUpperCase();
export const reqLive = (r, now = Date.now()) => !r.used_at && Date.parse(r.expires_at) > now;
/* الخطوة AT (قرار المالك): المسؤول يفتح «تفعيل» لمدة محددة لجهاز واحد (activation_windows ↔ admin_open_activation)،
   والرمز يصدر لجهاز صاحب الحساب ويظهر عليه وحده (request_login يعيده للجلسة نفسها)، ولا ترى الإدارة رمزًا ولا جهازًا. */
export const WINDOW_MINUTES = [[15, '15 دقيقة'], [60, 'ساعة'], [1440, '24 ساعة'], [4320, '3 أيام']];
export const windowLive = (w, now = Date.now()) => !!w && !w.used_at && !w.revoked && Date.parse(w.expires_at) > now;
export const ACT_STATE = { on:'تم التفعيل', wait:'بانتظار التفعيل', none:'لم يُفعَّل' };
export const NO_WINDOW = 'لا يوجد تفعيل مفتوح لحسابك على جهاز جديد. اطلب من إدارة المركز «تفعيل» حسابك، ثم اضغط «رمز التحقق» مرة أخرى.';
export const actMessage = (name, url) => `السلام عليكم ${name}،\nفُتح تفعيل حسابك في ${'مركز سما القدرات للتدريب'}.\nادخل من: ${url}\nاكتب رقم هويتك ثم اضغط «رمز التحقق»، فيظهر لك الرمز على جهازك، اكتبه ليُعتمد جهازك ويبقى داخلًا.\nلا تشارك الرمز مع أحد.`;
/* بصمة الرمز (محليًا كما في act_hash بالخادم): SHA-256 عند توفره، وإلا بصمة بديلة للوضع التجريبي */
export async function sha256(t){ try { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }
  catch(_){ let h = 2166136261; for(let i = 0; i < t.length; i++){ h ^= t.charCodeAt(i); h = Math.imul(h, 16777619); } return 'f' + (h >>> 0).toString(16); } }
