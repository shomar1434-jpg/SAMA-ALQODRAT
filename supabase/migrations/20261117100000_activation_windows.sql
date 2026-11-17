-- الخطوة AT: إغلاق كشف رموز التفعيل وبيانات الأجهزة للإدارة ↔ src/device_logic.js
-- الطريقة الجديدة (قرار المالك 17 نوفمبر): المسؤول يضغط «تفعيل» فتُفتح مهلة لجهاز واحد؛ صاحب الحساب يكتب هويته على جهازه
-- فيصدر رمز التحقق لهذا الجهاز وحده ويظهر عليه فقط؛ يكتبه فيُعتمد الجهاز وتُغلق المهلة. الإدارة ترى الحالة فقط
-- (لم يُفعَّل، بانتظار التفعيل، تم التفعيل)، ولا ترى أي رمز ولا نوع جهاز ولا رمز جهاز، في الواجهة ولا في الخادم.

create table if not exists activation_windows (
  id uuid primary key default gen_random_uuid(), phone text not null, role text not null check (role in ('student','guardian','teacher')),
  opened_by uuid, created_at timestamptz not null default now(), expires_at timestamptz not null,
  used_at timestamptz, revoked boolean not null default false
);
create index if not exists activation_windows_phone on activation_windows(phone, role, created_at desc);
alter table activation_windows enable row level security;
drop policy if exists activation_windows_admin on activation_windows;
create policy activation_windows_admin on activation_windows for select using (is_admin());

-- رموز طلب الدخول تُحفظ مجزّأة لا نصًّا
alter table login_requests add column if not exists code_hash text;
alter table login_requests add column if not exists window_id uuid;
update login_requests set code_hash = act_hash(phone, code) where code_hash is null and code <> '';
update login_requests set code = '' where code <> '';
-- رموز التفعيل التي رأتها الإدارة سابقًا تُلغى، وإشعارات رموز الدخول تُحجب، وأوصاف الأجهزة تُمسح
update activation_codes set revoked = true where used_at is null and not revoked;
update notifications set text = 'رمز دخول لجهاز جديد (محجوب).' where kind = 'login_code' and text <> 'رمز دخول لجهاز جديد (محجوب).';
update device_sessions set label = '' where label <> '';

-- فتح التفعيل (المسؤول): مهلة لجهاز واحد، والأحدث يلغي السابق غير المستخدم
create or replace function admin_open_activation(p_phone text, p_role text, p_minutes int default 15) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_exp timestamptz;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if p_phone !~ '^05[0-9]{8}$' or p_role not in ('student','guardian','teacher') then raise exception 'رقم الجوال أو الدور غير صحيح'; end if;
  if p_minutes not in (15, 60, 1440, 4320) then raise exception 'مدة غير صالحة'; end if;
  if not phone_has_role(p_phone, p_role) then raise exception 'هذا الرقم غير مرتبط بحساب بهذا الدور'; end if;
  update activation_windows set revoked = true where phone = p_phone and role = p_role and used_at is null and not revoked;
  update activation_codes set revoked = true where phone = p_phone and role = p_role and used_at is null and not revoked;
  v_exp := now() + make_interval(mins => p_minutes);
  insert into activation_windows(phone, role, opened_by, expires_at) values (p_phone, p_role, auth.uid(), v_exp);
  return jsonb_build_object('phone', p_phone, 'role', p_role, 'expires_at', v_exp);
end $$;
create or replace function admin_open_activation_bulk(p_role text, p_phones text[], p_minutes int default 1440) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ph text; out jsonb := '[]';
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if cardinality(p_phones) > 1000 then raise exception 'الحد 1000 رقم في المرة'; end if;
  foreach ph in array p_phones loop
    begin out := out || admin_open_activation(ph, p_role, p_minutes);
    exception when others then out := out || jsonb_build_object('phone', ph, 'role', p_role, 'error', sqlerrm); end;
  end loop;
  return out;
end $$;
create or replace function admin_close_activation(p_phone text, p_role text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  update activation_windows set revoked = true where phone = p_phone and role = p_role and used_at is null and not revoked;
  return jsonb_build_object('ok', true);
end $$;
-- الإصدار القديم للرموز موقوف: لا يعيد رمزًا للإدارة بعد الآن
create or replace function admin_issue_activation(p_phone text, p_role text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin return admin_open_activation(p_phone, p_role, 1440); end $$;
create or replace function admin_issue_activation_bulk(p_role text, p_phones text[]) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin return admin_open_activation_bulk(p_role, p_phones, 1440); end $$;
create or replace function admin_revoke_devices(p_phone text, p_role text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  update device_sessions set revoked_at = now() where phone = p_phone and role = p_role and revoked_at is null;
  update activation_codes set revoked = true where phone = p_phone and role = p_role and used_at is null and not revoked;
  update activation_windows set revoked = true where phone = p_phone and role = p_role and used_at is null and not revoked;
  return jsonb_build_object('ok', true);
end $$;

-- طلب الدخول: إن كانت للحساب مهلة مفتوحة صدر رمز لهذا الجهاز وعاد إليه وحده؛ وإلا يُسجَّل طلب يراه المسؤول (بالاسم فقط)
create or replace function request_login(p_ident text, p_role text, p_label text default '') returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); ph text; v_code text; t trainees; v_name text; w activation_windows;
begin
  if v_uid is null or p_role not in ('student','guardian','teacher') then return jsonb_build_object('ok', true, 'open', false); end if;
  ph := resolve_ident(p_ident, p_role);
  if ph is null or not phone_has_role(ph, p_role) then return jsonb_build_object('ok', true, 'open', false); end if;
  if (select count(*) from login_requests where created_at > now() - interval '60 minutes' and (phone = ph or uid = v_uid)) >= 5 then return jsonb_build_object('ok', true, 'open', false); end if;
  update login_requests set used_at = now() where phone = ph and role = p_role and uid = v_uid and used_at is null;
  if p_role = 'teacher' then select full_name into v_name from teachers where active and phone = ph limit 1;
  else select * into t from trainees where (case when p_role = 'guardian' then guardian_phone else phone end) = ph order by created_at limit 1;
    v_name := case when p_role = 'guardian' then 'ولي أمر ' else '' end || coalesce(t.full_name, ''); end if;
  select * into w from activation_windows where phone = ph and role = p_role and used_at is null and not revoked and expires_at > now() order by created_at desc limit 1;
  if w.id is null then
    insert into login_requests(uid, phone, role, code, code_hash, name, expires_at) values (v_uid, ph, p_role, '', null, coalesce(v_name,''), now() + interval '30 minutes');
    return jsonb_build_object('ok', true, 'open', false);
  end if;
  v_code := lpad((100000 + floor(random() * 900000))::int::text, 6, '0');
  insert into login_requests(uid, phone, role, code, code_hash, window_id, name, expires_at)
  values (v_uid, ph, p_role, '', act_hash(ph, v_code), w.id, coalesce(v_name,''), least(w.expires_at, now() + interval '15 minutes'));
  return jsonb_build_object('ok', true, 'open', true, 'code', v_code);
end $$;

-- طلبات الدخول للإدارة: الاسم والدور والوقت فقط (والجوال لفتح التفعيل)، دون رمز أو جهاز
create or replace function admin_login_requests() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', id, 'name', name, 'role', role, 'phone', phone, 'created_at', (created_at at time zone 'Asia/Riyadh')) order by created_at desc)
    from (select distinct on (phone, role) * from login_requests where used_at is null and expires_at > now() and window_id is null
           and not exists (select 1 from device_sessions d where d.phone = login_requests.phone and d.role = login_requests.role and d.revoked_at is null and d.created_at > login_requests.created_at)
          order by phone, role, created_at desc) q), '[]');
end $$;

-- التفعيل: رمز طلب الدخول لهذه الجلسة فقط (المهلة تُغلق بأول جهاز)؛ رموز الإدارة القديمة لم تعد تُقبل
create or replace function activate_device(p_phone text, p_code text, p_role text, p_label text default '') returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); r login_requests; ph text := resolve_ident(p_phone, p_role); v_key text := left(coalesce(ph, regexp_replace(coalesce(p_phone,''), '[^0-9]', '', 'g')), 15);
begin
  if v_uid is null then raise exception 'ابدأ الدخول من جديد'; end if;
  if (select count(*) from activation_attempts where not ok and at > now() - interval '60 minutes' and (phone = v_key or uid = v_uid)) >= 5 then
    raise exception 'محاولات كثيرة خاطئة. حاول بعد ساعة أو راجع إدارة المركز.'; end if;
  if ph is not null then
    select * into r from login_requests where uid = v_uid and phone = ph and role = p_role and used_at is null and expires_at > now()
      and code_hash is not null and code_hash = act_hash(ph, coalesce(p_code,'')) for update;
  end if;
  if r.id is not null and r.window_id is not null and not exists (select 1 from activation_windows where id = r.window_id and used_at is null and not revoked) then r.id := null; end if;
  if r.id is null then
    insert into activation_attempts(phone, uid, ok) values (v_key, v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'رمز التحقق غير صحيح أو منتهٍ. اطلب رمزًا جديدًا.');
  end if;
  update login_requests set used_at = now() where id = r.id;
  update login_requests set used_at = now() where phone = ph and role = p_role and used_at is null;
  update activation_windows set used_at = now() where id = r.window_id;
  insert into device_sessions(uid, phone, role, label) values (v_uid, ph, p_role, '')
    on conflict (uid) do update set phone = excluded.phone, role = excluded.role, label = '', created_at = now(), revoked_at = null;
  insert into activation_attempts(phone, uid, ok) values (ph, v_uid, true);
  return jsonb_build_object('ok', true);
end $$;

-- حالة التفعيل للإدارة: لكل جوال ودور، دون أي رمز أو وصف جهاز
create or replace function admin_access_status() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
    'devices', coalesce((select jsonb_agg(jsonb_build_object('id', uid, 'phone', phone, 'role', role, 'created_at', created_at, 'revoked_at', revoked_at)) from device_sessions), '[]'),
    'windows', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'phone', phone, 'role', role, 'created_at', created_at, 'expires_at', expires_at, 'used_at', used_at, 'revoked', revoked))
                         from (select distinct on (phone, role) * from activation_windows order by phone, role, created_at desc) w), '[]'),
    'requests', admin_login_requests());
end $$;

revoke execute on function admin_open_activation(text, text, int), admin_open_activation_bulk(text, text[], int), admin_close_activation(text, text), admin_access_status(),
  admin_issue_activation(text, text), admin_issue_activation_bulk(text, text[]), admin_revoke_devices(text, text), admin_login_requests(), request_login(text, text, text), activate_device(text, text, text, text) from public, anon;
grant execute on function admin_open_activation(text, text, int), admin_open_activation_bulk(text, text[], int), admin_close_activation(text, text), admin_access_status(),
  admin_issue_activation(text, text), admin_issue_activation_bulk(text, text[]), admin_revoke_devices(text, text), admin_login_requests(), request_login(text, text, text), activate_device(text, text, text, text) to authenticated;
