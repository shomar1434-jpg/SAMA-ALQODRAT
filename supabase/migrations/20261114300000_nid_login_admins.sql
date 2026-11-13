-- =====================================================================
-- الخطوة W — (1) الدخول برقم الهوية ثم رمز تحقق يصل عبر المراسلات الداخلية لهذا الجهاز؛ (2) أكثر من مسؤول للنظام.
-- مطابق لـ src/device_logic.js (resolveIdent) ودوال src/data2.js (requestOtp، portalLogin، listAdmins…).
-- =====================================================================
alter table teachers add column if not exists national_id text check (national_id is null or national_id ~ '^[12][0-9]{9}$');
create unique index if not exists teachers_national_id on teachers(national_id) where national_id is not null;

create table if not exists login_requests (
  id uuid primary key default gen_random_uuid(), uid uuid not null, phone text not null, role text not null check (role in ('student','guardian','teacher')),
  code text not null, name text not null default '', created_at timestamptz not null default now(), expires_at timestamptz not null, used_at timestamptz
);
create index if not exists login_requests_phone on login_requests(phone, created_at);
alter table login_requests enable row level security;   -- لا سياسة قراءة: الإدارة تقرأ عبر الدالة فقط

-- رقم الهوية ← جوال الحساب حسب الدور (المتدرب: هويته؛ ولي الأمر: هوية ابنه؛ المدرب: هويته). الجوال يبقى مقبولًا
create or replace function resolve_ident(p_ident text, p_role text) returns text language sql stable security definer set search_path = public as $$
  select case when v ~ '^05[0-9]{8}$' then v
    when v !~ '^[12][0-9]{9}$' then null
    when p_role = 'teacher' then (select phone from teachers where active and national_id = v)
    when p_role = 'guardian' then (select guardian_phone from trainees where national_id = v)
    else (select phone from trainees where national_id = v) end
  from (select regexp_replace(coalesce(p_ident,''), '[^0-9]', '', 'g') v) x $$;
revoke execute on function resolve_ident(text, text) from public, anon, authenticated;

-- طلب الدخول: يولّد رمزًا لهذه الجلسة (الجهاز) صالحًا ربع ساعة، ويرسله إلى صندوق الحساب. الرد واحد سواء وُجد الحساب أم لا
create or replace function request_login(p_ident text, p_role text, p_label text default '') returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); ph text; v_code text; t trainees; v_name text;
begin
  if v_uid is null or p_role not in ('student','guardian','teacher') then return jsonb_build_object('ok', true); end if;
  ph := resolve_ident(p_ident, p_role);
  if ph is null or not phone_has_role(ph, p_role) then return jsonb_build_object('ok', true); end if;
  if (select count(*) from login_requests where created_at > now() - interval '60 minutes' and (phone = ph or uid = v_uid)) >= 5 then return jsonb_build_object('ok', true); end if;
  update login_requests set used_at = now() where phone = ph and role = p_role and uid = v_uid and used_at is null;
  v_code := lpad((100000 + floor(random() * 900000))::int::text, 6, '0');
  if p_role = 'teacher' then select full_name into v_name from teachers where active and phone = ph limit 1;
  else select * into t from trainees where (case when p_role = 'guardian' then guardian_phone else phone end) = ph order by created_at limit 1;
    v_name := case when p_role = 'guardian' then 'ولي أمر ' else '' end || coalesce(t.full_name, ''); end if;
  insert into login_requests(uid, phone, role, code, name, expires_at) values (v_uid, ph, p_role, v_code, coalesce(v_name,''), now() + interval '15 minutes');
  if t.id is not null then
    insert into notifications(date, sender, "to", trainee_id, kind, text)
    values (riyadh_now()::date, 'system', p_role, t.id, 'login_code', format('رمز الدخول لجهاز جديد (%s): %s — صالح 15 دقيقة. إن لم تطلبه فتجاهله ولا تشاركه.', upper(left(replace(v_uid::text,'-',''), 4)), v_code));
  end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function admin_login_requests() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'role', role, 'device', upper(left(replace(uid::text,'-',''), 4)), 'code', code, 'created_at', (created_at at time zone 'Asia/Riyadh'), 'expires_at', expires_at) order by created_at desc)
    from login_requests where used_at is null and expires_at > now()), '[]');
end $$;

-- التفعيل يقبل رقم الهوية أو الجوال، ورمز طلب الدخول لهذه الجلسة أو رمز التفعيل الصادر من الإدارة
create or replace function activate_device(p_phone text, p_code text, p_role text, p_label text default '') returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); a activation_codes; r login_requests; ph text := resolve_ident(p_phone, p_role); v_key text := left(coalesce(ph, regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')), 15);
begin
  if v_uid is null then raise exception 'ابدأ الدخول من جديد'; end if;
  if (select count(*) from activation_attempts where not ok and at > now() - interval '60 minutes' and (phone = v_key or uid = v_uid)) >= 5 then
    raise exception 'محاولات كثيرة خاطئة. حاول بعد ساعة أو راجع إدارة المركز.'; end if;
  if ph is not null then
    select * into r from login_requests where uid = v_uid and phone = ph and role = p_role and used_at is null and expires_at > now() and code = coalesce(p_code,'') for update;
    if r.id is null then
      select * into a from activation_codes where phone = ph and role = p_role and used_at is null and not revoked and expires_at > now() and code_hash = act_hash(ph, coalesce(p_code,'')) for update;
    end if;
  end if;
  if r.id is null and a.id is null then
    insert into activation_attempts(phone, uid, ok) values (v_key, v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'رمز التحقق غير صحيح أو منتهٍ. اطلب رمزًا جديدًا.');
  end if;
  if r.id is not null then update login_requests set used_at = now() where id = r.id; else update activation_codes set used_at = now() where id = a.id; end if;
  insert into device_sessions(uid, phone, role, label) values (v_uid, ph, p_role, left(coalesce(p_label,''), 80))
    on conflict (uid) do update set phone = excluded.phone, role = excluded.role, label = excluded.label, created_at = now(), revoked_at = null;
  insert into activation_attempts(phone, uid, ok) values (ph, v_uid, true);
  return jsonb_build_object('ok', true);
end $$;

-- ---------- مسؤولو النظام ----------
alter table admins add column if not exists email text;
alter table admins add column if not exists name text not null default '';
alter table admins add column if not exists created_at timestamptz not null default now();
create table if not exists admin_invites (
  email text primary key check (email = lower(email)), name text not null default '', invited_by uuid, created_at timestamptz not null default now()
);
alter table admin_invites enable row level security;
-- المدعوّ ينال الصلاحية عند أول دخول ببريد مؤكَّد مطابق للدعوة
create or replace function claim_admin() returns boolean language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; i admin_invites;
begin
  if v_uid is null then return false; end if;
  if exists (select 1 from admins where user_id = v_uid) then return true; end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  select * into i from admin_invites where email = v_email;
  if i.email is null then return false; end if;
  insert into admins(user_id, email, name) values (v_uid, i.email, i.name) on conflict (user_id) do nothing;
  delete from admin_invites where email = i.email;
  return true;
end $$;
create or replace function admin_list() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(x order by x->>'pending', x->>'name') from (
    select jsonb_build_object('id', a.user_id, 'email', coalesce(a.email, u.email), 'name', a.name, 'active', true, 'pending', false, 'self', a.user_id = auth.uid()) x from admins a left join auth.users u on u.id = a.user_id
    union all select jsonb_build_object('id', 'invite:' || i.email, 'email', i.email, 'name', i.name, 'active', true, 'pending', true, 'self', false) from admin_invites i) q), '[]');
end $$;
create or replace function admin_add(p_email text, p_name text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email,''))); u uuid;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if e !~ '^\S+@\S+\.\S+$' then raise exception 'اكتب بريدًا صحيحًا'; end if;
  if length(btrim(coalesce(p_name,''))) < 3 then raise exception 'اكتب اسم المسؤول'; end if;
  select id into u from auth.users where lower(email) = e and email_confirmed_at is not null;
  if u is not null then
    if exists (select 1 from admins where user_id = u) then raise exception 'هذا البريد مسؤول بالفعل'; end if;
    insert into admins(user_id, email, name) values (u, e, btrim(p_name));
  else
    insert into admin_invites(email, name, invited_by) values (e, btrim(p_name), auth.uid()) on conflict (email) do update set name = excluded.name;
  end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function admin_remove(p_id text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if p_id like 'invite:%' then delete from admin_invites where email = substr(p_id, 8); return jsonb_build_object('ok', true); end if;
  if p_id::uuid = auth.uid() then raise exception 'لا تحذف حسابك الحالي'; end if;
  if (select count(*) from admins) <= 1 then raise exception 'لا يُحذف آخر مسؤول'; end if;
  delete from admins where user_id = p_id::uuid;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function request_login(text, text, text), admin_login_requests(), claim_admin(), admin_list(), admin_add(text, text), admin_remove(text) from public, anon;
grant execute on function request_login(text, text, text), admin_login_requests(), claim_admin(), admin_list(), admin_add(text, text), admin_remove(text) to authenticated;
