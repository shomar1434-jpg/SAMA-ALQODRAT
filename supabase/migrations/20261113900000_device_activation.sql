-- =====================================================================
-- الخطوة S — «تفعيل الجهاز»: دخول البوابات دون مزود رسائل.
-- تصدر الإدارة رمز تفعيل لمرة واحدة (6 أرقام، 7 أيام) لرقم الجوال ودوره؛ يدخله صاحبه من جلسة مجهولة
-- (Supabase anonymous sign-in) فتُربط الجلسة بالجوال وتبقى. جهاز جديد = رمز جديد. مطابق لـ src/device_logic.js.
-- يتطلب تفعيل «Anonymous sign-ins» في إعدادات المصادقة بالمشروع.
-- =====================================================================
create table if not exists activation_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null check (phone ~ '^05[0-9]{8}$'), role text not null check (role in ('student','guardian','teacher')),
  code_hash text not null, expires_at timestamptz not null, used_at timestamptz, revoked boolean not null default false,
  issued_by uuid, created_at timestamptz not null default now()
);
create index if not exists activation_codes_phone on activation_codes(phone, role) where used_at is null and not revoked;
create table if not exists device_sessions (
  uid uuid primary key, phone text not null, role text not null, label text not null default '',
  created_at timestamptz not null default now(), revoked_at timestamptz
);
create index if not exists device_sessions_phone on device_sessions(phone) where revoked_at is null;
create table if not exists activation_attempts (
  id bigint generated always as identity primary key, phone text not null, uid uuid, ok boolean not null, at timestamptz not null default now()
);
create index if not exists activation_attempts_phone on activation_attempts(phone, at);
alter table activation_codes enable row level security; alter table device_sessions enable row level security; alter table activation_attempts enable row level security;
drop policy if exists activation_codes_admin on activation_codes; create policy activation_codes_admin on activation_codes for select using (is_admin());
drop policy if exists device_sessions_admin on device_sessions; create policy device_sessions_admin on device_sessions for select using (is_admin());
revoke select (code_hash) on activation_codes from anon, authenticated;

create or replace function act_hash(p_phone text, p_code text) returns text language sql immutable as $$
  select encode(sha256(convert_to('sama-act:' || p_phone || ':' || p_code, 'utf8')), 'hex') $$;

-- جوال الجلسة: من رمز JWT (إن وُجد مزود لاحقًا)، وإلا من الجهاز المفعَّل، وإلا من إعداد الاختبار
create or replace function my_phone() returns text language sql stable security definer set search_path = public as $$
  -- جلسة بلا جوال تعيد NULL (لا نصًّا فارغًا) حتى لا تطابق سجلًّا جواله فارغ
  select nullif(case when p ~ '^9665[0-9]{8}$' then '0' || substr(p, 4) when p ~ '^5[0-9]{8}$' then '0' || p else p end, '')
  from (select regexp_replace(coalesce(
      nullif(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'phone', ''),
      (select d.phone from device_sessions d where d.uid = auth.uid() and d.revoked_at is null),
      current_setting('app.phone', true), ''), '[^0-9]', '', 'g') p) x $$;

create or replace function phone_has_role(p_phone text, p_role text) returns boolean language sql stable security definer set search_path = public as $$
  select case p_role
    when 'teacher' then exists (select 1 from teachers where active and phone = p_phone)
    when 'student' then exists (select 1 from trainees t where t.phone = p_phone and (exists (select 1 from subscriptions s where s.trainee_id = t.id) or exists (select 1 from enrollments e where e.trainee_id = t.id and e.status <> 'ملغى')))
    when 'guardian' then exists (select 1 from guardian_links l where l.status = 'verified' and l.guardian_phone = p_phone) or exists (select 1 from trainees t where t.guardian_phone = p_phone)
    else false end $$;
revoke execute on function phone_has_role(text, text) from public, anon, authenticated;

create or replace function admin_issue_activation(p_phone text, p_role text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_code text := lpad((100000 + floor(random() * 900000))::int::text, 6, '0'); v_exp timestamptz := now() + interval '7 days';
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if p_phone !~ '^05[0-9]{8}$' or p_role not in ('student','guardian','teacher') then raise exception 'رقم الجوال أو الدور غير صحيح'; end if;
  if not phone_has_role(p_phone, p_role) then raise exception 'هذا الرقم غير مرتبط بحساب بهذا الدور'; end if;
  update activation_codes set revoked = true where phone = p_phone and role = p_role and used_at is null and not revoked;
  insert into activation_codes(phone, role, code_hash, expires_at, issued_by) values (p_phone, p_role, act_hash(p_phone, v_code), v_exp, auth.uid());
  return jsonb_build_object('phone', p_phone, 'role', p_role, 'code', v_code, 'expires_at', v_exp);
end $$;
create or replace function admin_issue_activation_bulk(p_role text, p_phones text[]) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ph text; out jsonb := '[]';
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if cardinality(p_phones) > 1000 then raise exception 'الحد 1000 رقم في المرة'; end if;
  foreach ph in array p_phones loop
    begin out := out || admin_issue_activation(ph, p_role);
    exception when others then out := out || jsonb_build_object('phone', ph, 'role', p_role, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;
-- التفعيل: رسالة واحدة للخطأ والمنتهي والمستخدَم، وقفل بعد 5 محاولات خاطئة في الساعة للرقم أو للجلسة
create or replace function activate_device(p_phone text, p_code text, p_role text, p_label text default '') returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); a activation_codes;
begin
  if v_uid is null then raise exception 'ابدأ الدخول من جديد'; end if;
  if (select count(*) from activation_attempts where not ok and at > now() - interval '60 minutes' and (phone = p_phone or uid = v_uid)) >= 5 then
    raise exception 'محاولات كثيرة خاطئة. حاول بعد ساعة أو راجع إدارة المركز.'; end if;
  select * into a from activation_codes where phone = p_phone and role = p_role and used_at is null and not revoked and expires_at > now()
    and code_hash = act_hash(p_phone, coalesce(p_code,'')) for update;
  if a.id is null then
    insert into activation_attempts(phone, uid, ok) values (left(coalesce(p_phone,''), 15), v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'رمز التفعيل غير صحيح أو منتهٍ. اطلب رمزًا جديدًا من إدارة المركز.');
  end if;
  update activation_codes set used_at = now() where id = a.id;
  insert into device_sessions(uid, phone, role, label) values (v_uid, p_phone, p_role, left(coalesce(p_label,''), 80))
    on conflict (uid) do update set phone = excluded.phone, role = excluded.role, label = excluded.label, created_at = now(), revoked_at = null;
  insert into activation_attempts(phone, uid, ok) values (p_phone, v_uid, true);
  return jsonb_build_object('ok', true);
end $$;
create or replace function device_logout() returns void language sql volatile security definer set search_path = public as $$
  update device_sessions set revoked_at = now() where uid = auth.uid() and revoked_at is null $$;
create or replace function admin_revoke_devices(p_phone text, p_role text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  update device_sessions set revoked_at = now() where phone = p_phone and role = p_role and revoked_at is null;
  update activation_codes set revoked = true where phone = p_phone and role = p_role and used_at is null and not revoked;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function admin_issue_activation(text, text), admin_issue_activation_bulk(text, text[]), admin_revoke_devices(text, text), activate_device(text, text, text, text), device_logout() from public, anon;
grant execute on function admin_issue_activation(text, text), admin_issue_activation_bulk(text, text[]), admin_revoke_devices(text, text), activate_device(text, text, text, text), device_logout(), my_phone() to authenticated;
