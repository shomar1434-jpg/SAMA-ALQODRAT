-- الخطوة BI: إضافة جهاز آخر من الجهاز المفعّل، والخروج من جميع الأجهزة (قرار المالك 18 نوفمبر) ↔ src/device_logic.js
-- من فُعّل جهازه يفتح حسابه ويضغط «إضافة جهاز آخر» فيظهر رمز (10 دقائق، مرة واحدة) يكتبه في الجهاز الجديد بعد رقم هويته؛
-- بلا تدخل الإدارة، ولا يكفي رقم الهوية وحده. ومع الرمز خيار «أخرج جميع الأجهزة الأخرى عند ربط الجديد»،
-- وزر «الخروج من جميع الأجهزة الأخرى» في الحساب. الرموز مجزّأة، وقفل بعد 5 محاولات خاطئة/ساعة (activation_attempts).

create table if not exists device_link_codes (
  id uuid primary key default gen_random_uuid(),
  phone text not null, role text not null check (role in ('student','guardian','teacher')),
  code_hash text not null, created_by uuid not null, logout_others boolean not null default false,
  created_at timestamptz not null default now(), expires_at timestamptz not null, used_at timestamptz
);
create index if not exists device_link_codes_phone on device_link_codes(phone, role, created_at desc);
alter table device_link_codes enable row level security;
revoke all on device_link_codes from anon, authenticated;

-- جلسة هذا الجهاز لدور معيّن (مفعّلة وغير ملغاة)
create or replace function my_device(p_role text) returns device_sessions language sql stable security definer set search_path = public, extensions as $$
  select * from device_sessions where uid = auth.uid() and role = p_role and revoked_at is null limit 1 $$;

-- رمز الربط من الجهاز المفعّل
create or replace function portal_device_link(p_role text, p_logout_others boolean default false) returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare d device_sessions := my_device(p_role); v_code text; v_exp timestamptz := now() + interval '10 minutes';
begin
  if d.uid is null or not phone_has_role(d.phone, p_role) then raise exception 'سجّل الدخول من جهازك المفعّل أولًا'; end if;
  if (select count(*) from device_link_codes where phone = d.phone and role = p_role and created_at > now() - interval '60 minutes') >= 5 then
    raise exception 'طلبت رموزًا كثيرة. حاول بعد ساعة.'; end if;
  update device_link_codes set used_at = now() where phone = d.phone and role = p_role and used_at is null;
  v_code := lpad((100000 + floor(random() * 900000))::int::text, 6, '0');
  insert into device_link_codes(phone, role, code_hash, created_by, logout_others, expires_at)
  values (d.phone, p_role, act_hash(d.phone, 'link:' || v_code), d.uid, coalesce(p_logout_others, false), v_exp);
  return jsonb_build_object('ok', true, 'code', v_code, 'expires_at', v_exp);
end $$;

-- الربط في الجهاز الجديد: رقم الهوية + رمز الربط
create or replace function link_device(p_ident text, p_role text, p_code text) returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); ph text := resolve_ident(p_ident, p_role); c device_link_codes;
        v_key text := left(coalesce(ph, regexp_replace(coalesce(p_ident,''), '[^0-9]', '', 'g')), 15);
begin
  if v_uid is null or p_role not in ('student','guardian','teacher') then raise exception 'ابدأ الدخول من جديد'; end if;
  if (select count(*) from activation_attempts where not ok and at > now() - interval '60 minutes' and (phone = v_key or uid = v_uid)) >= 5 then
    raise exception 'محاولات كثيرة خاطئة. حاول بعد ساعة أو راجع إدارة المركز.'; end if;
  if ph is not null and phone_has_role(ph, p_role) then
    select * into c from device_link_codes where phone = ph and role = p_role and used_at is null and expires_at > now()
      and code_hash = act_hash(ph, 'link:' || coalesce(p_code, '')) for update;
  end if;
  if c.id is null then
    insert into activation_attempts(phone, uid, ok) values (v_key, v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'رمز الربط غير صحيح أو منتهٍ. اطلب رمزًا جديدًا من جهازك المفعّل.');
  end if;
  update device_link_codes set used_at = now() where id = c.id;
  if c.logout_others then update device_sessions set revoked_at = now() where phone = ph and role = p_role and revoked_at is null and uid <> v_uid; end if;
  insert into device_sessions(uid, phone, role, label) values (v_uid, ph, p_role, '')
    on conflict (uid) do update set phone = excluded.phone, role = excluded.role, label = '', created_at = now(), revoked_at = null;
  insert into activation_attempts(phone, uid, ok) values (ph, v_uid, true);
  return jsonb_build_object('ok', true);
end $$;

-- عدد أجهزتي، والخروج من الأجهزة الأخرى (يبقى هذا الجهاز)
create or replace function portal_devices(p_role text) returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare d device_sessions := my_device(p_role);
begin
  if d.uid is null then return jsonb_build_object('count', 0); end if;
  return jsonb_build_object('count', (select count(*) from device_sessions where phone = d.phone and role = p_role and revoked_at is null));
end $$;

create or replace function portal_logout_others(p_role text) returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare d device_sessions := my_device(p_role); n int;
begin
  if d.uid is null then raise exception 'سجّل الدخول أولًا'; end if;
  update device_sessions set revoked_at = now() where phone = d.phone and role = p_role and revoked_at is null and uid <> d.uid;
  get diagnostics n = row_count;
  update device_link_codes set used_at = now() where phone = d.phone and role = p_role and used_at is null;
  return jsonb_build_object('ok', true, 'revoked', n);
end $$;

-- إخراج الإدارة للأجهزة يُلغي رموز الربط المفتوحة أيضًا
create or replace function admin_revoke_devices(p_phone text, p_role text) returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  update device_sessions set revoked_at = now() where phone = p_phone and role = p_role and revoked_at is null;
  update activation_codes set revoked = true where phone = p_phone and role = p_role and used_at is null and not revoked;
  update activation_windows set revoked = true where phone = p_phone and role = p_role and used_at is null and not revoked;
  update device_link_codes set used_at = now() where phone = p_phone and role = p_role and used_at is null;
  return jsonb_build_object('ok', true);
end $$;

create or replace function device_link_purge() returns int language plpgsql volatile security definer set search_path = public, extensions as $$
declare n int;
begin delete from device_link_codes where created_at < now() - interval '7 days'; get diagnostics n = row_count; return n; end $$;

revoke execute on function my_device(text), device_link_purge() from public, anon, authenticated;
revoke execute on function portal_device_link(text, boolean), link_device(text, text, text), portal_devices(text), portal_logout_others(text) from public, anon;
grant execute on function portal_device_link(text, boolean), link_device(text, text, text), portal_devices(text), portal_logout_others(text) to authenticated;
revoke execute on function admin_revoke_devices(text, text) from public, anon;
grant execute on function admin_revoke_devices(text, text) to authenticated;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sama-device-link-purge', '35 1 * * *', 'select public.device_link_purge()');
  end if;
end $$;
