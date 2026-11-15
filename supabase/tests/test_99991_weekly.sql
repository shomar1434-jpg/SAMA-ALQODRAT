-- الخطوة AS: الإشعار الأسبوعي لأولياء الأمور، وبيانات التعلم للإدارة
\set ON_ERROR_STOP on
do $$
declare v_admin uuid := gen_random_uuid(); t1 uuid; r jsonb; n int; ok boolean; thu timestamp; d date := riyadh_now()::date;
begin
  insert into trainees(national_id, full_name, phone, gender, guardian_phone) values ('1999999965', 'وليد ناصر علي العمري', '0557779965', 'ذكر', '0557779966') returning id into t1;
  insert into trainees(national_id, full_name, phone, gender) values ('1999999966', 'وائل ناصر علي العمري', '0557779965', 'ذكر');   -- جوال مشترك فلا يلتقطه اختبار التفعيل
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects, status, start_date) select 'SQ-WR9999', t1, id, 'boys', array['كمي'], 'pending', d - 30 from plans where mode = 'in_person' limit 1;
  insert into guardian_links(trainee_id, guardian_phone, status) values (t1, '0557779966', 'verified');
  thu := (d + ((4 - extract(dow from d)::int + 7) % 7))::timestamp + interval '18 hours 5 minutes';
  assert run_weekly_reports(thu - interval '1 hour') = 0, 'قبل السادسة لا إشعار';
  assert run_weekly_reports(thu - interval '1 day') = 0, 'غير الخميس لا إشعار';
  n := run_weekly_reports(thu);
  assert n >= 1 and exists (select 1 from notifications where trainee_id = t1 and "to" = 'guardian' and kind = 'weekly_report'), 'إشعار ولي الأمر يوم الخميس';
  assert run_weekly_reports(thu + interval '1 hour') = 0, 'لا تكرار في الأسبوع نفسه';
  begin perform admin_trainee_learning(t1); ok := false; exception when others then ok := true; end;
  assert ok, 'بيانات التعلم للإدارة فقط';
  insert into auth.users(id, email) values (v_admin, 'wr-admin@test'); insert into admins(user_id, role) values (v_admin, 'staff');
  perform set_config('app.uid', v_admin::text, true);
  r := admin_trainee_learning(t1);
  assert r ? 'attempts' and r ? 'submissions' and r ? 'assignments' and r ? 'q_meta', 'بيانات التعلم للمتدرب';
  assert not has_function_privilege('authenticated', 'run_weekly_reports(timestamp)', 'execute'), 'المهمة داخلية';
  perform set_config('app.uid', '', true);
end $$;
