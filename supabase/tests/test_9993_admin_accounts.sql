-- الخطوة AC: الإزالة تعطيل محفوظ يُعاد، وإعادة تعيين كلمة المرور للمالك وحده
\set ON_ERROR_STOP on
do $$
declare o uuid; f uuid := gen_random_uuid(); s uuid := gen_random_uuid(); ok boolean; L jsonb; e text;
begin
  select user_id into o from admins where role = 'owner' limit 1;
  if o is null then o := gen_random_uuid(); insert into auth.users(id, email) values (o, 'acc-owner@test'); insert into admins(user_id, role, name) values (o, 'owner', 'المالك'); end if;
  insert into auth.users(id, email) values (f, 'acc-full@test'), (s, 'acc-staff@test');
  insert into admins(user_id, role, name, email) values (f, 'full', 'مدير كامل', 'acc-full@test'), (s, 'staff', 'موظف', 'acc-staff@test');
  perform set_config('app.uid', f::text, true);
  begin perform admin_password_reset_target(s); ok := false; exception when others then ok := true; end;
  assert ok, 'إعادة التعيين ليست للمدير الكامل';
  perform admin_remove(s::text);
  L := admin_list();
  assert (select (x->>'removed')::boolean and not (x->>'active')::boolean from jsonb_array_elements(L) x where x->>'id' = s::text), 'أُزيل: معطّل وفي السابقين';
  assert exists (select 1 from admins where user_id = s), 'لا حذف فعلي';
  perform admin_set_active(s, true, 'عودة');
  assert (select removed_at is null and active from admins where user_id = s), 'التفعيل يعيده إلى القائمة';
  perform set_config('app.uid', o::text, true);
  begin perform admin_password_reset_target(o); ok := false; exception when others then ok := true; end;
  assert ok, 'لا لنفسه';
  e := admin_password_reset_target(s);
  assert e = 'acc-staff@test', 'يعيد بريد الحساب';
  assert exists (select 1 from audit_logs where action = 'admins.password_reset' and entity = 'acc-staff@test'), 'مسجّلة في الأرشيف';
  assert not has_function_privilege('anon', 'admin_password_reset_target(uuid)', 'execute'), 'ليست للزائر';
  perform set_config('app.uid', '', true);
end $$;
