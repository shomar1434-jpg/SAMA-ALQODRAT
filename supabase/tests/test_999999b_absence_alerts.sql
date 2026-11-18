-- الخطوة BM: قرار المسؤول في تنبيه الغياب (إرسال لولي الأمر أو إلغاء الرسالة)
\set ON_ERROR_STOP on
do $$
declare v_adm uuid := gen_random_uuid(); v_sub uuid; v_basic uuid; r jsonb; ok boolean;
begin
  insert into auth.users(id, email) values (v_adm, 'abs-alert@test');
  insert into admins(user_id, role, name) values (v_adm, 'full', 'مدير');
  perform set_config('app.uid', v_adm::text, true);
  select id into v_basic from plans where tier = 'basic' and mode = 'in_person';
  r := admin_save_subscription(jsonb_build_object('national_id', '1934121003', 'full_name', 'سالم علي حسن', 'phone', '0557770199', 'gender', 'ذكر', 'plan_id', v_basic, 'section', 'boys', 'start_date', riyadh_now()::date - 20));
  select id into v_sub from subscriptions where trainee_id = (select id from trainees where national_id = '1934121003');
  -- غير المسؤول مرفوض
  perform set_config('app.uid', '', true);
  ok := false; begin perform admin_absence_alert(v_sub, 4, 'sent'); exception when others then ok := true; end;
  assert ok, 'غير المسؤول لا يسجّل قرار التنبيه';
  perform set_config('app.uid', v_adm::text, true);
  perform admin_absence_alert(v_sub, 4, 'dismissed');
  perform admin_absence_alert(v_sub, 4, 'sent');
  assert (select count(*) from absence_alerts where subscription_id = v_sub and level = 4) = 1, 'قرار واحد لكل مستوى غياب';
  assert (select action from absence_alerts where subscription_id = v_sub and level = 4) = 'sent', 'آخر قرار يُعتمد';
  ok := false; begin perform admin_absence_alert(v_sub, 4, 'delete'); exception when others then ok := true; end;
  assert ok, 'إجراء غير معروف مرفوض';
  ok := false; begin perform admin_absence_alert(gen_random_uuid(), 4, 'sent'); exception when others then ok := true; end;
  assert ok, 'اشتراك غير موجود مرفوض';
  assert has_function_privilege('anon', 'admin_absence_alert(uuid,int,text)', 'execute') = false, 'لا تنفيذ للمجهول';
  delete from absence_alerts where subscription_id = v_sub;
  perform set_config('app.uid', '', true);
end $$;
\echo 'PASS absence alerts'
