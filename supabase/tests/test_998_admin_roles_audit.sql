-- الخطوة Z: أدوار المسؤولين (مالك، مدير كامل، مسؤول عادي) وسجل الحركات الإلحاقي
\set ON_ERROR_STOP on
do $$
declare ow uuid; fu uuid := gen_random_uuid(); st uuid := gen_random_uuid(); x uuid := gen_random_uuid(); ok boolean; r jsonb; n int; o uuid;
  recent text := json_build_object('amr', json_build_array(json_build_object('method','password','timestamp', extract(epoch from now())::bigint)))::text;
  stale text := json_build_object('amr', json_build_array(json_build_object('method','password','timestamp', extract(epoch from now())::bigint - 3600)))::text;
begin
  select user_id into ow from admins where role = 'owner';
  if ow is null then ow := gen_random_uuid(); insert into auth.users(id, email, email_confirmed_at) values (ow, 'owner-z@test.local', now()); insert into admins(user_id, email, name, role) values (ow, 'owner-z@test.local', 'المالك', 'owner'); end if;
  assert ow is not null and (select count(*) from admins where role = 'owner') = 1, 'مالك واحد';
  insert into auth.users(id, email, email_confirmed_at) values (fu, 'full-z@test.local', now()), (st, 'staff-z@test.local', now()), (x, 'outsider-z@test.local', now());

  -- غير المدعوّ لا ينال شيئًا حتى لو أنشأ حسابًا
  perform set_config('app.uid', x::text, true);
  assert claim_admin() = false and not is_admin() and admin_me() is null, 'غير المدعوّ لا ينال الصلاحية';
  begin perform admin_add('evil@test.local', 'مهاجم', 'full'); ok := false; exception when others then ok := true; end;
  assert ok, 'بلا صلاحية لا إضافة';

  -- المالك: «مدير كامل» يحتاج إعادة تحقق حديثة
  perform set_config('app.uid', ow::text, true); perform set_config('request.jwt.claims', stale, true);
  begin perform admin_add('full-z@test.local', 'مدير كامل', 'full'); ok := false; exception when others then ok := true; end;
  assert ok, 'منح الكامل بلا إعادة تحقق يُرفض';
  perform set_config('request.jwt.claims', recent, true);
  perform admin_add('full-z@test.local', 'مدير كامل', 'full');
  assert (select role from admins where user_id = fu) = 'full' and (select created_by from admins where user_id = fu) = ow, 'المالك يمنح الكامل ويُحفظ المنشئ';

  -- المدير الكامل: يضيف مسؤولًا عاديًا، ولا يمنح الكامل ولا يمس المالك
  perform set_config('app.uid', fu::text, true);
  perform admin_add('staff-z@test.local', 'مسؤول عادي');
  assert (select role from admins where user_id = st) = 'staff', 'الافتراضي مسؤول عادي';
  begin perform admin_add('full2-z@test.local', 'كامل آخر', 'full'); ok := false; exception when others then ok := true; end;
  assert ok, 'الكامل لا يمنح الكامل';
  begin perform admin_set_role(st, 'full', 'ترقية'); ok := false; exception when others then ok := true; end;
  assert ok, 'الكامل لا يغيّر الأدوار';
  begin perform admin_set_active(ow, false, 'محاولة'); ok := false; exception when others then ok := true; end;
  assert ok, 'لا أحد يعطّل المالك';
  begin perform admin_remove(ow::text); ok := false; exception when others then ok := true; end;
  assert ok, 'لا أحد يزيل المالك';
  begin perform admin_set_active(fu, false, 'نفسي'); ok := false; exception when others then ok := true; end;
  assert ok, 'لا يعطّل نفسه';
  begin r := admin_audit('{}'); ok := false; exception when others then ok := true; end;
  assert ok, 'الأرشيف للمالك وحده';

  -- المسؤول العادي: تشغيل يومي فقط
  perform set_config('app.uid', st::text, true);
  assert is_admin() and not is_full_admin() and (admin_me()->>'role') = 'staff', 'دور المسؤول العادي';
  begin perform admin_list(); ok := false; exception when others then ok := true; end;
  assert ok, 'العادي لا يرى إدارة المسؤولين';
  begin perform admin_add('z@test.local', 'أحد', 'staff'); ok := false; exception when others then ok := true; end;
  assert ok, 'العادي لا يضيف مسؤولًا';
  begin perform admin_set_role(st, 'full', 'نفسي'); ok := false; exception when others then ok := true; end;
  assert ok, 'لا يرقّي نفسه';
  select id into o from orders limit 1;
  if o is not null then
    begin perform admin_confirm_payment(o, 1, true, '', 'cash'); ok := false; exception when others then ok := sqlerrm like '%لمدير النظام%'; end;
    assert ok, 'العادي لا يؤكد السداد';
  end if;
  begin perform admin_save_bank('{"enabled":false}'); ok := false; exception when others then ok := sqlerrm like '%لمدير النظام%'; end;
  assert ok, 'العادي لا يعدّل الحساب البنكي';
  update settings set audit_retention_days = 900 where id = 1;   -- RLS يمنعه في Supabase؛ محليًا نتحقق من السياسة نفسها
  assert exists (select 1 from pg_policies where tablename = 'settings' and policyname = 'settings_write' and qual like '%is_full_admin%'), 'تعديل الإعدادات للمدير الكامل';

  -- المالك يخفّض ويعطّل، والمعطَّل يفقد الصلاحية فورًا
  perform set_config('app.uid', ow::text, true);
  begin perform admin_set_role(fu, 'staff', ''); ok := false; exception when others then ok := true; end;
  assert ok, 'تغيير الدور يحتاج سببًا';
  perform admin_set_role(fu, 'staff', 'إعادة توزيع المهام');
  perform admin_set_active(st, false, 'انتهاء التكليف');
  perform set_config('app.uid', st::text, true);
  assert not is_admin(), 'المعطَّل لا يدخل';

  -- سجل الحركات: يسجّل المنفّذ ودوره، ويحجب الأسرار، ولا يُعدَّل ولا يُحذف
  perform set_config('app.uid', ow::text, true);
  r := admin_audit(jsonb_build_object('section', 'admins'));
  assert (r->>'total')::int >= 3 and exists (select 1 from jsonb_array_elements(r->'rows') y where y->>'actor' = fu::text and y->>'actor_role' = 'full' and y->>'action' = 'admins.insert'), 'الأرشيف يحدد المنفّذ ودوره';
  assert exists (select 1 from jsonb_array_elements(r->'rows') y where y->>'action' = 'admins.update' and y->'detail'->'after'->>'role_reason' = 'إعادة توزيع المهام'), 'تُسجَّل القيم قبل وبعد مع السبب';
  select count(*) into n from audit_logs;
  r := admin_audit(jsonb_build_object('export', true));
  assert (select count(*) from audit_logs) = n + 1 and exists (select 1 from audit_logs where action = 'audit.export' and actor = ow), 'التصدير يُسجَّل';
  begin update audit_logs set action = 'x' where id = (select max(id) from audit_logs); ok := false; exception when others then ok := true; end;
  assert ok, 'السجل لا يُعدَّل';
  begin delete from audit_logs where id = (select max(id) from audit_logs); ok := false; exception when others then ok := true; end;
  assert ok, 'السجل لا يُحذف';
  assert not exists (select 1 from audit_logs where detail::text like '%code_hash%'), 'الرموز المجزّأة لا تُسجَّل';
  assert not has_table_privilege('authenticated', 'audit_logs', 'delete') and not has_table_privilege('authenticated', 'audit_logs', 'update'), 'لا صلاحية تعديل للمستخدمين';
  assert exists (select 1 from pg_policies where tablename = 'audit_logs' and policyname = 'audit_logs_owner' and cmd = 'SELECT'), 'الاطلاع للمالك';

  perform set_config('app.uid', '', true); perform set_config('request.jwt.claims', '', true);
  delete from admins where user_id in (fu, st); delete from admin_invites where email like '%-z@test.local'; delete from auth.users where id in (fu, st, x);
end $$;
