-- =====================================================================
-- الخطوة Z — أدوار المسؤولين وسجل الحركات (وثيقة المالك: تأمين لوحة الإدارة، 14 نوفمبر 2026)
-- الأدوار: owner (المالك الأساسي، واحد، بمعرّفه لا ببريده) · full (مدير نظام كامل يمنحه المالك صراحة) · staff (مسؤول عادي).
-- المسؤول العادي يعمل في التشغيل اليومي، ولا يدير المسؤولين ولا يرى أرشيف الحركات ولا يعدّل الإعدادات
-- ولا يؤكد السداد أو يلغيه (فلا يصدر ولا يلغي فواتير) ولا يعدّل الحساب البنكي.
-- الحذف تعطيل يحفظ هوية المنفّذ في السجلات القديمة. لا أحد يغيّر دوره أو حالته بنفسه، ولا أحد يمس المالك.
-- سجل الحركات إلحاقي فقط: لا تعديل ولا حذف لأي مسؤول، ويطّلع عليه المالك وحده. مطابق لـ src/admin_logic.js.
-- =====================================================================

-- ---------- الأدوار ----------
alter table admins add column if not exists role text not null default 'staff' check (role in ('owner','full','staff'));
alter table admins add column if not exists active boolean not null default true;
alter table admins add column if not exists created_by uuid;
alter table admins add column if not exists role_reason text not null default '';
alter table admins add column if not exists updated_at timestamptz not null default now();
create unique index if not exists admins_one_owner on admins ((true)) where role = 'owner';
alter table admin_invites add column if not exists role text not null default 'staff' check (role in ('full','staff'));

-- أول مسؤول هو المالك، ومن سبقه من المسؤولين يبقى بصلاحياته الكاملة السابقة (مدير كامل)
update admins set role = 'full' where role = 'staff';
update admins set role = 'owner' where user_id = (select user_id from admins order by created_at, user_id limit 1)
  and not exists (select 1 from admins where role = 'owner');

create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid() and active);
$$;
create or replace function admin_role() returns text language sql stable security definer set search_path = public as $$
  select role from admins where user_id = auth.uid() and active;
$$;
create or replace function is_full_admin() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(admin_role() in ('owner','full'), false);
$$;
create or replace function is_owner() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(admin_role() = 'owner', false);
$$;
-- إعادة التحقق: دخول بكلمة المرور خلال آخر 10 دقائق (من مطالبة amr في رمز الجلسة الذي يصدره الخادم)
create or replace function recent_password_auth() returns boolean language sql stable set search_path = public as $$
  select coalesce((select max((x->>'timestamp')::bigint) from jsonb_array_elements(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->'amr', '[]')) x
    where x->>'method' = 'password') > extract(epoch from now())::bigint - 600, false);
$$;

create or replace function admin_me() returns jsonb language plpgsql stable security definer set search_path = public as $$
declare a admins;
begin
  select * into a from admins where user_id = auth.uid() and active;
  if a.user_id is null then return null; end if;
  return jsonb_build_object('id', a.user_id, 'email', a.email, 'name', a.name, 'role', a.role);
end $$;

-- المدعوّ ينال الدور المحدد في دعوته (والمعطَّل لا يعود بالدعوة القديمة)
create or replace function claim_admin() returns boolean language plpgsql volatile security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_email text; i admin_invites;
begin
  if v_uid is null then return false; end if;
  if exists (select 1 from admins where user_id = v_uid) then return exists (select 1 from admins where user_id = v_uid and active); end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;
  select * into i from admin_invites where email = v_email;
  if i.email is null then return false; end if;
  insert into admins(user_id, email, name, role, created_by) values (v_uid, i.email, i.name, i.role, i.invited_by) on conflict (user_id) do nothing;
  delete from admin_invites where email = i.email;
  return true;
end $$;

create or replace function admin_list() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_full_admin() then raise exception 'إدارة المسؤولين لمدير النظام فقط'; end if;
  return coalesce((select jsonb_agg(x order by x->>'pending', (x->>'role') <> 'owner', x->>'name') from (
    select jsonb_build_object('id', a.user_id, 'email', coalesce(a.email, u.email), 'name', a.name, 'role', a.role, 'active', a.active, 'pending', false,
      'self', a.user_id = auth.uid(), 'created_at', a.created_at, 'created_by', (select b.name from admins b where b.user_id = a.created_by)) x
      from admins a left join auth.users u on u.id = a.user_id
    union all select jsonb_build_object('id', 'invite:' || i.email, 'email', i.email, 'name', i.name, 'role', i.role, 'active', true, 'pending', true, 'self', false,
      'created_at', i.created_at, 'created_by', (select b.name from admins b where b.user_id = i.invited_by)) from admin_invites i) q), '[]');
end $$;

-- الإضافة: المدير الكامل والمالك؛ دور «مدير كامل» يمنحه المالك وحده وبعد إعادة التحقق
drop function if exists admin_add(text, text);
create or replace function admin_add(p_email text, p_name text, p_role text default 'staff') returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare e text := lower(btrim(coalesce(p_email,''))); u uuid; r text := coalesce(nullif(p_role,''), 'staff');
begin
  if not is_full_admin() then raise exception 'إدارة المسؤولين لمدير النظام فقط'; end if;
  if r not in ('full','staff') then raise exception 'دور غير صالح'; end if;
  if r = 'full' and not is_owner() then raise exception 'منح «مدير نظام كامل» للمالك الأساسي وحده'; end if;
  if r = 'full' and not recent_password_auth() then raise exception 'أعد إدخال كلمة المرور لتأكيد منح الصلاحيات الكاملة'; end if;
  if e !~ '^\S+@\S+\.\S+$' then raise exception 'اكتب بريدًا صحيحًا'; end if;
  if length(btrim(coalesce(p_name,''))) < 3 then raise exception 'اكتب اسم المسؤول'; end if;
  select id into u from auth.users where lower(email) = e and email_confirmed_at is not null;
  if u is not null and exists (select 1 from admins where user_id = u) then raise exception 'هذا البريد له حساب مسؤول؛ فعّله أو عدّل دوره من القائمة'; end if;
  if u is not null then
    insert into admins(user_id, email, name, role, created_by) values (u, e, btrim(p_name), r, auth.uid());
  else
    insert into admin_invites(email, name, invited_by, role) values (e, btrim(p_name), auth.uid(), r)
      on conflict (email) do update set name = excluded.name, role = excluded.role, invited_by = excluded.invited_by;
  end if;
  return jsonb_build_object('ok', true, 'pending', u is null);
end $$;

-- تغيير الدور: المالك وحده، لا على نفسه ولا على مالك، وبسبب مكتوب
create or replace function admin_set_role(p_id uuid, p_role text, p_reason text default '') returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare t admins;
begin
  if not is_owner() then raise exception 'تغيير الأدوار للمالك الأساسي وحده'; end if;
  if p_role not in ('full','staff') then raise exception 'دور غير صالح'; end if;
  select * into t from admins where user_id = p_id;
  if t.user_id is null then raise exception 'الحساب غير موجود'; end if;
  if t.user_id = auth.uid() or t.role = 'owner' then raise exception 'لا يُغيَّر دور المالك الأساسي'; end if;
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'اكتب سبب التغيير'; end if;
  if p_role = 'full' and not recent_password_auth() then raise exception 'أعد إدخال كلمة المرور لتأكيد منح الصلاحيات الكاملة'; end if;
  update admins set role = p_role, role_reason = btrim(p_reason), updated_at = now() where user_id = t.user_id;
  return jsonb_build_object('ok', true);
end $$;

-- التعطيل والتفعيل (بدل الحذف): المدير الكامل يعطّل المسؤول العادي، والمالك يعطّل الجميع عدا نفسه
create or replace function admin_set_active(p_id uuid, p_active boolean, p_reason text default '') returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare t admins;
begin
  if not is_full_admin() then raise exception 'إدارة المسؤولين لمدير النظام فقط'; end if;
  select * into t from admins where user_id = p_id;
  if t.user_id is null then raise exception 'الحساب غير موجود'; end if;
  if t.user_id = auth.uid() then raise exception 'لا تعطّل حسابك الحالي'; end if;
  if t.role = 'owner' then raise exception 'لا يُعطَّل المالك الأساسي'; end if;
  if t.role = 'full' and not is_owner() then raise exception 'تعطيل مدير النظام الكامل للمالك الأساسي وحده'; end if;
  update admins set active = p_active, role_reason = coalesce(nullif(btrim(coalesce(p_reason,'')), ''), role_reason), updated_at = now() where user_id = t.user_id;
  if not p_active and to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions where user_id = $1' using t.user_id; end if;   -- يخرج من جلساته فورًا
  return jsonb_build_object('ok', true);
end $$;

-- الإزالة من القائمة: الدعوة المعلّقة تُلغى، والحساب يُعطَّل ولا يُحذف
create or replace function admin_remove(p_id text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_full_admin() then raise exception 'إدارة المسؤولين لمدير النظام فقط'; end if;
  if p_id like 'invite:%' then delete from admin_invites where email = substr(p_id, 8); return jsonb_build_object('ok', true); end if;
  return admin_set_active(p_id::uuid, false, 'إزالة من قائمة المسؤولين');
end $$;

-- ---------- حدود المسؤول العادي على الخادم ----------
drop policy if exists settings_admin on settings;
create policy settings_read on settings for select using (is_admin());
create policy settings_write on settings for update using (is_full_admin()) with check (is_full_admin());

alter function admin_confirm_payment(uuid, numeric, boolean, text, text) rename to admin_confirm_payment_base;
create or replace function admin_confirm_payment(p_id uuid, p_amount numeric, p_confirmed boolean default true, p_reason text default '', p_method text default 'transfer') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_full_admin() then raise exception 'تأكيد السداد وإلغاؤه لمدير النظام فقط'; end if;
  return admin_confirm_payment_base(p_id, p_amount, p_confirmed, p_reason, p_method);
end $$;
alter function admin_add_payment(uuid, jsonb) rename to admin_add_payment_base;
create or replace function admin_add_payment(p_id uuid, p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_full_admin() then raise exception 'تسجيل الدفعات لمدير النظام فقط'; end if;
  return admin_add_payment_base(p_id, p);
end $$;
alter function admin_save_bank(jsonb) rename to admin_save_bank_base;
create or replace function admin_save_bank(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_full_admin() then raise exception 'الحساب البنكي لمدير النظام فقط'; end if;
  return admin_save_bank_base(p);
end $$;

-- ---------- سجل الحركات ----------
alter table audit_logs add column if not exists actor_role text;
alter table audit_logs add column if not exists actor_name text;
create index if not exists audit_logs_at on audit_logs (at desc);
create index if not exists audit_logs_actor on audit_logs (actor, at desc);

-- الحقول السرية أو الثقيلة لا تُسجَّل قيمها
create or replace function audit_redact(j jsonb) returns jsonb language sql immutable set search_path = public as $$
  select case when j is null then null else j - array['code_hash','hash','token','password','avatar','image_data','data','snapshot','quiz','answers','review'] end;
$$;
create or replace function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
declare a admins; v_id text;
begin
  select * into a from admins where user_id = auth.uid();
  v_id := coalesce(to_jsonb(case when tg_op = 'DELETE' then old else new end)->>'id', to_jsonb(case when tg_op = 'DELETE' then old else new end)->>'user_id',
                   to_jsonb(case when tg_op = 'DELETE' then old else new end)->>'email', '');
  insert into audit_logs(actor, actor_role, actor_name, action, entity, detail)
  values (auth.uid(), coalesce(a.role, case when auth.uid() is null then 'system' else 'user' end), a.name, lower(tg_table_name) || '.' || lower(tg_op), v_id,
    jsonb_build_object('before', audit_redact(case when tg_op <> 'INSERT' then to_jsonb(old) end), 'after', audit_redact(case when tg_op <> 'DELETE' then to_jsonb(new) end)));
  return coalesce(new, old);
end $$;

-- تغطية الجداول التي لم تكن مسجّلة (الأسئلة والواجبات تُسجَّل، وتسليمات المتدربين لكثرتها لا)
do $$ declare t text; begin
  foreach t in array array['trainees','orders','invoices','admins','admin_invites','settings','questions','assignments','cohorts','programs','activation_codes','trainer_groups','invoice_receipts'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I_audit on %I', t, t);
      execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function audit_row()', t, t);
    end if;
  end loop;
end $$;

-- إلحاقي فقط: لا تعديل ولا حذف من أي جهة، إلا التنظيف الدوري بعد مدة الاحتفاظ
drop policy if exists audit_logs_admin on audit_logs;
create policy audit_logs_owner on audit_logs for select using (is_owner());
revoke insert, update, delete, truncate on audit_logs from public, anon, authenticated;
create or replace function audit_logs_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' and current_setting('app.audit_purge', true) = 'on' then return old; end if;
  raise exception 'سجل الحركات لا يُعدَّل ولا يُحذف';
end $$;
drop trigger if exists audit_logs_append_only on audit_logs;
create trigger audit_logs_append_only before update or delete on audit_logs for each row execute function audit_logs_guard();
create or replace function audit_logs_no_truncate() returns trigger language plpgsql as $$ begin raise exception 'سجل الحركات لا يُحذف'; end $$;
drop trigger if exists audit_logs_no_truncate on audit_logs;
create trigger audit_logs_no_truncate before truncate on audit_logs for each statement execute function audit_logs_no_truncate();

alter table settings add column if not exists audit_retention_days int not null default 730 check (audit_retention_days between 365 and 3650);
create or replace function audit_purge() returns int language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  perform set_config('app.audit_purge', 'on', true);
  delete from audit_logs where at < now() - make_interval(days => (select audit_retention_days from settings where id = 1));
  get diagnostics n = row_count;
  perform set_config('app.audit_purge', '', true);
  if n > 0 then insert into audit_logs(actor, actor_role, action, entity, detail) values (null, 'system', 'audit.purge', '', jsonb_build_object('deleted', n)); end if;
  return n;
end $$;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'sama-audit-purge';
    perform cron.schedule('sama-audit-purge', '17 2 1 * *', 'select public.audit_purge()');
  end if;
end $$;

-- أرشيف الحركات للمالك وحده: بحث وتصفية وتصدير (والتصدير يُسجَّل)
create or replace function admin_audit(p jsonb default '{}') returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_lim int := least(greatest(coalesce((p->>'limit')::int, 200), 1), case when (p->>'export')::boolean then 20000 else 500 end);
  v_from date := nullif(p->>'from','')::date; v_to date := nullif(p->>'to','')::date; v_q text := nullif(btrim(coalesce(p->>'q','')), ''); rows jsonb; v_total int;
begin
  if not is_owner() then raise exception 'أرشيف الحركات للمالك الأساسي وحده'; end if;
  with f as (select l.* from audit_logs l
    where (v_from is null or (l.at at time zone 'Asia/Riyadh')::date >= v_from) and (v_to is null or (l.at at time zone 'Asia/Riyadh')::date <= v_to)
      and (nullif(p->>'actor','') is null or l.actor::text = p->>'actor' or (p->>'actor' = 'system' and l.actor is null))
      and (nullif(p->>'section','') is null or split_part(l.action, '.', 1) = p->>'section')
      and (nullif(p->>'op','') is null or split_part(l.action, '.', 2) = p->>'op')
      and (nullif(p->>'role','') is null or l.actor_role = p->>'role')
      and (v_q is null or l.entity ilike '%' || v_q || '%' or l.detail::text ilike '%' || v_q || '%'))
  select (select count(*) from f), coalesce(jsonb_agg(jsonb_build_object('id', id, 'at', at, 'actor', actor, 'actor_role', actor_role, 'actor_name', actor_name,
      'action', action, 'entity', entity, 'detail', detail) order by at desc, id desc), '[]')
    into v_total, rows from (select * from f order by at desc, id desc limit v_lim offset greatest(coalesce((p->>'offset')::int, 0), 0)) x;
  if (p->>'export')::boolean then
    insert into audit_logs(actor, actor_role, actor_name, action, entity, detail)
    values (auth.uid(), 'owner', (select name from admins where user_id = auth.uid()), 'audit.export', '', jsonb_build_object('filter', p - 'export' - 'limit', 'rows', jsonb_array_length(rows)));
  end if;
  return jsonb_build_object('total', v_total, 'rows', rows,
    'actors', (select coalesce(jsonb_agg(jsonb_build_object('id', user_id, 'name', name, 'role', role) order by name), '[]') from admins));
end $$;

-- ---------- الصلاحيات ----------
revoke execute on function admin_role(), is_full_admin(), is_owner(), recent_password_auth(), audit_redact(jsonb), audit_purge(), audit_logs_guard(), audit_logs_no_truncate(),
  admin_confirm_payment_base(uuid, numeric, boolean, text, text), admin_add_payment_base(uuid, jsonb), admin_save_bank_base(jsonb) from public, anon, authenticated;
grant execute on function is_full_admin(), is_owner() to authenticated;   -- تُستعمل في سياسات RLS
revoke execute on function admin_me(), admin_list(), admin_add(text, text, text), admin_set_role(uuid, text, text), admin_set_active(uuid, boolean, text), admin_remove(text),
  admin_confirm_payment(uuid, numeric, boolean, text, text), admin_add_payment(uuid, jsonb), admin_save_bank(jsonb), admin_audit(jsonb), claim_admin() from public, anon;
grant execute on function admin_me(), admin_list(), admin_add(text, text, text), admin_set_role(uuid, text, text), admin_set_active(uuid, boolean, text), admin_remove(text),
  admin_confirm_payment(uuid, numeric, boolean, text, text), admin_add_payment(uuid, jsonb), admin_save_bank(jsonb), admin_audit(jsonb), claim_admin() to authenticated;
