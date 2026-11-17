-- الخطوة AX: حالة عرض البرنامج (قريبًا/مفتوح/مغلق) ومنع التسجيل في غير المنشور والمغلق والمؤرشف
\set ON_ERROR_STOP on
do $$
declare v_admin uuid := gen_random_uuid(); v_p uuid; ok boolean;
begin
  select id into v_p from programs where active and (program_open_cohort(id)).id is null limit 1;
  begin perform admin_set_publish(v_p, 'coming_soon', null); ok := false; exception when others then ok := sqlerrm like '%غير مصرح%'; end;
  assert ok, 'للإدارة فقط';
  insert into auth.users(id, email) values (v_admin, 'pub-admin@test'); insert into admins(user_id, role) values (v_admin, 'staff');
  perform set_config('app.uid', v_admin::text, true);
  begin perform admin_set_publish(v_p, 'open_for_registration', null); ok := false; exception when others then ok := sqlerrm like '%افتح دفعة%'; end;
  assert ok, 'لا فتح بلا دفعة مفتوحة';
  begin perform admin_set_publish(v_p, 'bogus', null); ok := false; exception when others then ok := true; end;
  assert ok, 'حالة غير صالحة';
  perform admin_set_publish(v_p, 'coming_soon', date '2027-01-10');
  assert (select publish_state = 'coming_soon' and expected_start = date '2027-01-10' from programs where id = v_p), 'قريبًا بموعد';
  assert exists (select 1 from audit_logs where action = 'programs.update' and entity = v_p::text and detail->'after'->>'publish_state' = 'coming_soon'), 'مسجّل';
  assert (select (x->>'publish_state') from jsonb_array_elements(public_catalog()->'programs') x where x->>'id' = v_p::text) = 'coming_soon', 'يظهر في الدليل العام';
  perform admin_set_publish(v_p, 'closed', null);
  perform set_config('app.uid', '', true);
  begin perform register_trainee(jsonb_build_object('program_id', v_p, 'national_id', '1999999911', 'full_name', 'سالم علي محمد الشهري', 'phone', '0551112233', 'gender', 'ذكر', 'birth_date', '2000-01-01')); ok := false;
  exception when others then ok := sqlerrm like '%غير متاح%'; end;
  assert ok, 'المغلق لا يقبل تسجيلًا';
  perform set_config('app.uid', v_admin::text, true); perform admin_set_publish(v_p, null, null); perform set_config('app.uid', '', true);
end $$;
