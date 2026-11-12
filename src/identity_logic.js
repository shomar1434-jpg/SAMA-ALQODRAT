/* =====================================================================
   الهوية والتسجيل: العمر من تاريخ الميلاد، وشرط جوال ولي الأمر لمن هم دون 19 سنة،
   وربط ولي الأمر الذاتي بالسجل المدني. مطابق لـ supabase/migrations/…_registration.sql و…_guardian_self_link.sql.
   ===================================================================== */
export const GUARDIAN_AGE = 19;                 // دون هذا العمر: جوال ولي الأمر إلزامي
export const LINK_MAX_TRIES = 5;                // محاولات ربط ولي الأمر في الساعة
export function ageOn(birth, today){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(birth || ''))) return null;
  const [by, bm, bd] = birth.split('-').map(Number), [ty, tm, td] = today.split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}
export const isMinor = (birth, today) => { const a = ageOn(birth, today); return a != null && a < GUARDIAN_AGE; };
/* يتحقق من تاريخ الميلاد وجوال ولي الأمر، ويعيد جوال ولي الأمر المعتمد ('' للبالغ) */
export function checkBirthGuardian(f, today){
  const a = ageOn(f.birth_date, today);
  if(a == null) throw new Error('تاريخ الميلاد مطلوب');
  if(f.birth_date > today || a < 5 || a > 100) throw new Error('تاريخ الميلاد غير صحيح');
  if(a >= GUARDIAN_AGE) return '';
  const g = String(f.guardian_phone || '').trim();
  if(!/^05\d{8}$/.test(g)) throw new Error('جوال ولي الأمر مطلوب لمن هم دون 19 سنة (10 أرقام تبدأ بـ 05)');
  return g;
}
