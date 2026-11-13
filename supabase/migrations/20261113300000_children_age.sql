-- برامج الأطفال (من 3 إلى 12 سنة): الحد الأدنى للعمر 3 سنوات بدل 5،
-- ومن هم دون 13 سنة يكون جوال التواصل هو جوال ولي الأمر إن لم يُكتب جوال ولي أمر مستقل.
-- مطابق لـ checkBirthGuardian في src/identity_logic.js (MIN_AGE، CHILD_AGE).
create or replace function reg_guardian(p jsonb) returns text language plpgsql stable as $$
declare b date; a int; g text := translate(trim(coalesce(p->>'guardian_phone','')), '٠١٢٣٤٥٦٧٨٩', '0123456789');
begin
  begin b := nullif(p->>'birth_date','')::date; exception when others then raise exception 'تاريخ الميلاد غير صحيح'; end;
  if b is null then raise exception 'تاريخ الميلاد مطلوب'; end if;
  a := age_on(b);
  if b > riyadh_now()::date or a < 3 or a > 100 then raise exception 'تاريخ الميلاد غير صحيح'; end if;
  if a >= 19 then return null; end if;
  if g = '' and a < 13 then g := translate(trim(coalesce(p->>'phone','')), '٠١٢٣٤٥٦٧٨٩', '0123456789'); end if;
  if g !~ '^05[0-9]{8}$' then raise exception 'جوال ولي الأمر مطلوب لمن هم دون 19 سنة (10 أرقام تبدأ بـ 05)'; end if;
  return g;
end $$;
