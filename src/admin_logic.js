/* =====================================================================
   أدوار المسؤولين وسجل الحركات (الخطوة Z) — مطابق لـ supabase/migrations/…_admin_roles_audit.sql
   owner: المالك الأساسي (واحد) · full: مدير نظام كامل يمنحه المالك صراحة · staff: مسؤول عادي (التشغيل اليومي)
   ===================================================================== */
export const ADMIN_ROLES = { owner:'المالك الأساسي', full:'مدير نظام كامل', staff:'مسؤول عادي' };
export const ROLE_HINT = {
  full:'يدير المسؤولين العاديين، ويعدّل الإعدادات، ويؤكد السداد ويلغيه. لا يمس المالك ولا يرى أرشيف الحركات.',
  staff:'التشغيل اليومي: الحضور، المتدربون، الدفعات، الطلبات، البنوك والواجبات. لا يدير المسؤولين ولا يعدّل الإعدادات ولا يؤكد السداد أو يلغيه.'
};
export const isFull = role => role === 'owner' || role === 'full';
export const isOwner = role => role === 'owner';
/* صفحات لا يراها إلا من له الدور المطلوب */
export const PAGE_ROLE = { 'admin-settings':'full', 'admin-admins':'full', 'admin-archive':'full', 'admin-audit':'owner' };
export const canSeePage = (role, page) => { const need = PAGE_ROLE[page]; return !need || (need === 'owner' ? isOwner(role) : isFull(role)); };

/* قواعد إدارة المسؤولين (الواجهة؛ والخادم يطبّقها نفسها) */
export function adminRules(actor, target){
  const self = target.self || target.id === actor.id, owner = target.role === 'owner', pending = !!target.pending;
  return {
    canInviteFull: isOwner(actor.role),
    canSetRole: isOwner(actor.role) && !self && !owner && !pending,
    canToggle: !pending && !self && !owner && (isOwner(actor.role) || (actor.role === 'full' && target.role === 'staff')),
    canCancelInvite: pending && isFull(actor.role) && (isOwner(actor.role) || target.role === 'staff'),
    canResetPassword: isOwner(actor.role) && !self && !owner && !pending && target.active !== false
  };
}
export function checkRole(actor, role, reason, recent){
  if(!['full', 'staff'].includes(role)) throw new Error('دور غير صالح');
  if(role === 'full' && !isOwner(actor.role)) throw new Error('منح «مدير نظام كامل» للمالك الأساسي وحده');
  if(reason != null && String(reason).trim().length < 3) throw new Error('اكتب سبب التغيير');
  if(role === 'full' && !recent) throw new Error('أعد إدخال كلمة المرور لتأكيد منح الصلاحيات الكاملة');
}

/* ---------- سجل الحركات ---------- */
export const AUDIT_SECTIONS = {
  assistant_responses:'ردود المساعد الذكي', admins:'المسؤولون', admin_invites:'دعوات المسؤولين', trainees:'المتدربون', subscriptions:'الاشتراكات', sub_attendance:'حضور الباقات', attendance:'حضور الدفعات',
  enrollments:'التسجيلات', cohorts:'الدفعات', programs:'البرامج', plans:'الباقات', orders:'الطلبات', invoices:'الفواتير', invoice_receipts:'إيصالات الفواتير',
  teachers:'المدربون', questions:'بنوك الأسئلة', assignments:'الواجبات', settings:'الإعدادات', policies:'السياسات', certificates:'الشهادات',
  guardian_links:'روابط أولياء الأمور', activation_codes:'رموز التفعيل', trainer_groups:'مجموعات المدربين', notifications:'الإشعارات',
  schedule_templates:'جداول الجلسات', schedule_exceptions:'استثناءات الجداول', session_breaks:'إلغاء الجلسات', break_compensations:'تعويض الجلسات الملغاة', profile_change_requests:'طلبات تعديل البيانات', audit:'سجل الحركات'
};
export const AUDIT_OPS = { insert:'إنشاء', update:'تعديل', delete:'حذف', export:'تصدير', purge:'تنظيف دوري' };
export const auditSection = a => AUDIT_SECTIONS[String(a || '').split('.')[0]] || String(a || '').split('.')[0];
export const auditOp = a => AUDIT_OPS[String(a || '').split('.')[1]] || String(a || '').split('.').slice(1).join('.');
/* الحقول التي تغيّرت بين القيمة السابقة واللاحقة (المحجوبة لا تُعرض) */
export function auditChanges(detail){
  const b = detail?.before || {}, a = detail?.after || {}, skip = new Set(['updated_at', 'version']);
  return [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(k => !skip.has(k) && JSON.stringify(b[k]) !== JSON.stringify(a[k]))
    .map(k => ({ field:k, before:b[k], after:a[k] }));
}
const SECRET = ['code_hash', 'hash', 'token', 'password', 'avatar', 'image_data', 'data', 'snapshot', 'quiz', 'answers', 'review'];
export const auditRedact = o => { if(!o || typeof o !== 'object') return o ?? null; const x = { ...o }; SECRET.forEach(k => delete x[k]); return x; };
export function auditFilter(rows, f = {}){
  const q = String(f.q || '').trim();
  return rows.filter(r => { const d = String(r.at || '').slice(0, 10), [sec, op] = String(r.action || '').split('.');
    return (!f.from || d >= f.from) && (!f.to || d <= f.to) && (!f.actor || (f.actor === 'system' ? !r.actor : r.actor === f.actor))
      && (!f.section || sec === f.section) && (!f.op || op === f.op) && (!f.role || r.actor_role === f.role)
      && (!q || String(r.entity || '').includes(q) || JSON.stringify(r.detail || '').includes(q)); })
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
