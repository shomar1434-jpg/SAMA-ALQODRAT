/* =====================================================================
   الإعداد العام. مفاتيح Supabase تأتي من متغيرات البيئة عند البناء:
   VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY (ملف .env.local محليًا، وأسرار GitHub عند النشر).
   إذا تُركت فارغة يعمل النظام ببيانات تجريبية محفوظة في المتصفح.
   ===================================================================== */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/* الصفحة الحالية: 'public' أو 'admin'، يحددها ملف الدخول لكل صفحة */
export let PAGE = 'public';
export function setPage(p){ PAGE = p; }

/* رابط الصفحة العامة ورابط لوحة الإدارة، أيًّا كانت الصفحة الحالية */
const here = () => location.href.split('#')[0];
export const publicBase = () => PAGE === 'admin' ? new URL('../', here()).href : here();
export const adminBase  = () => PAGE === 'admin' ? here() : new URL('admin/', publicBase()).href;
