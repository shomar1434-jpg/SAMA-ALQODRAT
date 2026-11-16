-- تسجيل باقات القدرات والتحصيلي دون تاريخ ميلاد أو مدينة أو مؤهل.
-- برامج الأطفال والبرامج التدريبية الأخرى تحتفظ بقواعد العمر الأصلية.
-- يحافظ التعديل على بيانات المتدربين الحاليين عند إعادة التسجيل.
create or replace function public.reg_guardian(p jsonb) returns text
language plpgsql stable set search_path = public as $$
declare
  b date;
  a int;
  g text := translate(trim(coalesce(p->>'guardian_phone','')), '٠١٢٣٤٥٦٧٨٩', '0123456789');
begin
  begin b := nullif(p->>'birth_date','')::date;
  exception when others then raise exception 'تاريخ الميلاد غير صحيح';
  end;
  -- النموذج الجديد للباقات الثانوية لا يطلب تاريخ الميلاد؛ ويلزم جوال ولي الأمر.
  if b is null and nullif(p->>'plan_id','') is not null then
    if g !~ '^05[0-9]{8}$' then raise exception 'جوال ولي الأمر مطلوب لباقات القدرات والتحصيلي'; end if;
    return g;
  end if;
  if b is null then raise exception 'تاريخ الميلاد مطلوب'; end if;
  a := age_on(b);
  if b > riyadh_now()::date or a < 3 or a > 100 then raise exception 'تاريخ الميلاد غير صحيح'; end if;
  if a >= 19 then return null; end if;
  if g = '' and a < 13 then
    g := translate(trim(coalesce(p->>'phone','')), '٠١٢٣٤٥٦٧٨٩', '0123456789');
  end if;
  if g !~ '^05[0-9]{8}$' then raise exception 'جوال ولي الأمر مطلوب لمن هم دون 19 سنة (10 أرقام تبدأ بـ 05)'; end if;
  return g;
end $$;

create or replace function public.register_subscription_base(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pl plans%rowtype; t trainees%rowtype; v_ref text; v_sec text;
begin
  if coalesce(p->>'national_id','') !~ '^[12][0-9]{9}$' then raise exception 'رقم السجل المدني غير صحيح'; end if;
  select * into pl from plans where id = (p->>'plan_id')::uuid;
  if not found or not pl.active or pl.mode = 'remote' or pl.status <> 'open' then
    raise exception 'التسجيل في هذه الباقة غير متاح حاليًا';
  end if;
  insert into trainees(national_id, full_name, phone, email, gender, birth_date, city, education, employer)
  values (p->>'national_id', p->>'full_name', p->>'phone', coalesce(p->>'email',''), p->>'gender',
          nullif(p->>'birth_date','')::date, nullif(p->>'city',''),
          coalesce(nullif(p->>'education',''), 'ثانوي'), coalesce(p->>'employer',''))
  on conflict (national_id) do update
    set full_name = excluded.full_name,
        phone = excluded.phone,
        email = excluded.email,
        gender = excluded.gender,
        city = coalesce(excluded.city, trainees.city),
        education = coalesce(nullif(p->>'education',''), trainees.education)
  returning * into t;
  if exists (select 1 from subscriptions s where s.trainee_id = t.id and s.plan_id = pl.id and sub_live(s, riyadh_now()::date)) then
    raise exception 'هذا السجل المدني مشترك مسبقًا في %', plan_label(pl);
  end if;
  v_sec := case when t.gender = 'أنثى' then 'girls' else 'boys' end;
  v_ref := 'SQ-' || (100000 + floor(random()*900000))::int;
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects)
    values (v_ref, t.id, pl.id, v_sec, pl.subjects);
  return jsonb_build_object('ok',true,'subscription',true,'ref',v_ref,
    'plan',plan_label(pl),'section',case v_sec when 'girls' then 'البنات' else 'البنون' end,
    'schedule',section_days_txt(v_sec));
end $$;
