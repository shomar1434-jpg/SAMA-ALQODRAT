-- البند 1 من «طلبات نهائية»: تاريخ الميلاد يُطلب في برامج الأطفال فقط (رقم الاعتماد 25194)، ولا يُطلب في الباقات والبرامج الأخرى.
-- بدونه يُقبل جوال ولي الأمر اختياريًا كما كتبه المسجّل، ولا يُنسخ من جوال المتدرب. ومع تاريخ الميلاد يبقى السلوك السابق. ↔ checkBirthGuardian
create or replace function reg_guardian(p jsonb) returns text language plpgsql stable as $$
declare b date; a int; g text := translate(trim(coalesce(p->>'guardian_phone','')), '٠١٢٣٤٥٦٧٨٩', '0123456789'); v_pid uuid; v_need boolean := false;
begin
  begin v_pid := nullif(p->>'program_id','')::uuid; exception when others then v_pid := null; end;
  if v_pid is not null then select coalesce(accreditation_no, '') = '25194' into v_need from programs where id = v_pid; v_need := coalesce(v_need, false); end if;
  begin b := nullif(p->>'birth_date','')::date; exception when others then raise exception 'تاريخ الميلاد غير صحيح'; end;
  if b is null then
    if v_need then raise exception 'تاريخ الميلاد مطلوب'; end if;
    if g <> '' and g !~ '^05[0-9]{8}$' then raise exception 'جوال ولي الأمر غير صحيح (10 أرقام تبدأ بـ 05)'; end if;
    return nullif(g, '');
  end if;
  a := age_on(b);
  if b > riyadh_now()::date or a < 3 or a > 100 then raise exception 'تاريخ الميلاد غير صحيح'; end if;
  if a >= 19 then return null; end if;
  if g = '' and a < 13 then g := translate(trim(coalesce(p->>'phone','')), '٠١٢٣٤٥٦٧٨٩', '0123456789'); end if;
  if g !~ '^05[0-9]{8}$' then raise exception 'جوال ولي الأمر مطلوب لمن هم دون 19 سنة (10 أرقام تبدأ بـ 05)'; end if;
  return g;
end $$;
revoke execute on function reg_guardian(jsonb) from public, anon, authenticated;
