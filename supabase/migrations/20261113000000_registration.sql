-- =====================================================================
-- الخطوة B — التسجيل الموحّد: تاريخ الميلاد إلزامي، وجوال ولي الأمر إلزامي لمن هم دون 19 سنة.
-- جوال ولي الأمر المصرَّح به يُحفظ في ملف المتدرب عند أول تسجيل فقط؛ وفي إعادة التسجيل
-- لا يُكمَّل ولا يُستبدل تلقائيًا (يفتح بوابة ولي الأمر) بل يصبح طلب تحديث تراجعه الإدارة.
-- مطابق لـ src/identity_logic.js (checkBirthGuardian) و mergeOnRegister في src/data2.js.
-- =====================================================================
alter table trainees add column if not exists guardian_phone text check (guardian_phone is null or guardian_phone ~ '^05[0-9]{8}$');

create or replace function age_on(p_birth date, p_today date default (riyadh_now()::date)) returns int language sql immutable as $$
  select extract(year from age(p_today, p_birth))::int;
$$;
-- يتحقق ويعيد جوال ولي الأمر المعتمد (null للبالغ)
create or replace function reg_guardian(p jsonb) returns text language plpgsql stable as $$
declare b date; a int; g text := translate(trim(coalesce(p->>'guardian_phone','')), '٠١٢٣٤٥٦٧٨٩', '0123456789');
begin
  begin b := nullif(p->>'birth_date','')::date; exception when others then raise exception 'تاريخ الميلاد غير صحيح'; end;
  if b is null then raise exception 'تاريخ الميلاد مطلوب'; end if;
  a := age_on(b);
  if b > riyadh_now()::date or a < 5 or a > 100 then raise exception 'تاريخ الميلاد غير صحيح'; end if;
  if a >= 19 then return null; end if;
  if g !~ '^05[0-9]{8}$' then raise exception 'جوال ولي الأمر مطلوب لمن هم دون 19 سنة (10 أرقام تبدأ بـ 05)'; end if;
  return g;
end $$;
create or replace function reg_apply_guardian(p_nid text, p_existed boolean, p_g text) returns void language plpgsql volatile security definer set search_path = public as $$
declare t trainees%rowtype; ch jsonb;
begin
  select * into t from trainees where national_id = p_nid;
  if t.id is null or p_g is null then return; end if;
  if not p_existed then update trainees set guardian_phone = p_g where id = t.id; return; end if;
  if p_g is distinct from t.guardian_phone then
    ch := jsonb_build_object('guardian_phone', jsonb_build_object('old', coalesce(t.guardian_phone,''), 'new', p_g));
    if not exists (select 1 from profile_change_requests where trainee_id = t.id and status = 'pending' and changes = ch) then
      insert into profile_change_requests(trainee_id, changes) values (t.id, ch);
    end if;
  end if;
end $$;
revoke execute on function reg_apply_guardian(text, boolean, text) from public, anon, authenticated;

create or replace function register_trainee(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g text := reg_guardian(p); ids uuid[] := check_policy_acceptance(p); r jsonb; v_ex boolean := exists (select 1 from trainees where national_id = p->>'national_id');
begin
  perform set_config('sama.registering', 'on', true);
  r := register_trainee_base(p);
  perform set_config('sama.registering', '', true);
  perform reg_apply_guardian(p->>'national_id', v_ex, g);
  perform record_policy_acceptance(ids, p->>'national_id', 'registration');
  return r;
end $$;
create or replace function register_subscription(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare g text := reg_guardian(p); ids uuid[] := check_policy_acceptance(p); r jsonb; v_ex boolean := exists (select 1 from trainees where national_id = p->>'national_id');
begin
  perform set_config('sama.registering', 'on', true);
  r := register_subscription_base(p);
  perform set_config('sama.registering', '', true);
  perform reg_apply_guardian(p->>'national_id', v_ex, g);
  perform record_policy_acceptance(ids, p->>'national_id', 'subscription');
  return r;
end $$;

create or replace function resolve_profile_change(p_id uuid, p_approve boolean) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r profile_change_requests%rowtype; t trainees%rowtype;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into r from profile_change_requests where id = p_id for update;
  if r.id is null or r.status <> 'pending' then raise exception 'الطلب غير موجود أو سبق البت فيه'; end if;
  if p_approve then
    select * into t from trainees where id = r.trainee_id for update;
    t := jsonb_populate_record(t, (select jsonb_object_agg(k, v->'new') from jsonb_each(r.changes) x(k, v)));
    update trainees set full_name = t.full_name, phone = t.phone, email = t.email, gender = t.gender, birth_date = t.birth_date,
      city = t.city, education = t.education, employer = t.employer, guardian_phone = nullif(t.guardian_phone,'') where id = r.trainee_id;
  end if;
  update profile_change_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = auth.uid() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
grant execute on function register_trainee(jsonb), register_subscription(jsonb) to anon, authenticated;
