-- الخطوة AC: حسابات المسؤولين — إزالة من القائمة (تعطيل محفوظ لا حذف)، وإعادة تعيين كلمة المرور من المالك
-- الحذف الفعلي ممنوع: عمليات المسؤول في أرشيف الحركات مرتبطة بمعرّفه. «الإزالة» = تعطيل + نقل إلى «المسؤولين السابقين»، وتُعاد بالتفعيل.

alter table admins add column if not exists removed_at timestamptz;

create or replace function admin_set_active(p_id uuid, p_active boolean, p_reason text default '') returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare t admins;
begin
  if not is_full_admin() then raise exception 'إدارة المسؤولين لمدير النظام فقط'; end if;
  select * into t from admins where user_id = p_id;
  if t.user_id is null then raise exception 'الحساب غير موجود'; end if;
  if t.user_id = auth.uid() then raise exception 'لا تعطّل حسابك الحالي'; end if;
  if t.role = 'owner' then raise exception 'لا يُعطَّل المالك الأساسي'; end if;
  if t.role = 'full' and not is_owner() then raise exception 'تعطيل مدير النظام الكامل للمالك الأساسي وحده'; end if;
  update admins set active = p_active, removed_at = case when p_active then null else removed_at end,
    role_reason = coalesce(nullif(btrim(coalesce(p_reason,'')), ''), role_reason), updated_at = now() where user_id = t.user_id;
  if not p_active and to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions where user_id = $1' using t.user_id; end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_remove(p_id text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_full_admin() then raise exception 'إدارة المسؤولين لمدير النظام فقط'; end if;
  if p_id like 'invite:%' then delete from admin_invites where email = substr(p_id, 8); return jsonb_build_object('ok', true); end if;
  perform admin_set_active(p_id::uuid, false, 'إزالة من قائمة المسؤولين');
  update admins set removed_at = now() where user_id = p_id::uuid;
  return jsonb_build_object('ok', true);
end $$;

create or replace function admin_list() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_full_admin() then raise exception 'إدارة المسؤولين لمدير النظام فقط'; end if;
  return coalesce((select jsonb_agg(x order by x->>'pending', (x->>'role') <> 'owner', x->>'name') from (
    select jsonb_build_object('id', a.user_id, 'email', coalesce(a.email, u.email), 'name', a.name, 'role', a.role, 'active', a.active, 'pending', false,
      'removed', a.removed_at is not null, 'self', a.user_id = auth.uid(), 'created_at', a.created_at, 'created_by', (select b.name from admins b where b.user_id = a.created_by)) x
      from admins a left join auth.users u on u.id = a.user_id
    union all select jsonb_build_object('id', 'invite:' || i.email, 'email', i.email, 'name', i.name, 'role', i.role, 'active', true, 'pending', true, 'removed', false, 'self', false,
      'created_at', i.created_at, 'created_by', (select b.name from admins b where b.user_id = i.invited_by)) from admin_invites i) q), '[]');
end $$;

-- إعادة تعيين كلمة مرور مسؤول: للمالك وحده، لا لنفسه ولا لحساب معطّل. تُنهي جلسات الحساب، وتعيد البريد لتضع دالة الخادم الكلمة المؤقتة.
create or replace function admin_password_reset_target(p_id uuid) returns text language plpgsql volatile security definer set search_path = public as $$
declare t admins; v_email text;
begin
  if not is_owner() then raise exception 'إعادة تعيين كلمات المرور للمالك الأساسي وحده'; end if;
  select * into t from admins where user_id = p_id;
  if t.user_id is null then raise exception 'الحساب غير موجود'; end if;
  if t.user_id = auth.uid() then raise exception 'غيّر كلمة مرورك من «تغيير كلمة المرور»'; end if;
  if t.role = 'owner' then raise exception 'لا تُعاد كلمة مرور المالك الأساسي'; end if;
  if not t.active then raise exception 'فعّل الحساب أولًا'; end if;
  select coalesce(t.email, u.email) into v_email from auth.users u where u.id = t.user_id;
  if to_regclass('auth.sessions') is not null then execute 'delete from auth.sessions where user_id = $1' using t.user_id; end if;
  insert into audit_logs(actor, actor_role, actor_name, action, entity, detail)
    values (auth.uid(), 'owner', (select name from admins where user_id = auth.uid()), 'admins.password_reset', v_email, jsonb_build_object('target', t.name));
  return v_email;
end $$;
revoke execute on function admin_password_reset_target(uuid) from public, anon;
grant execute on function admin_password_reset_target(uuid) to authenticated;
