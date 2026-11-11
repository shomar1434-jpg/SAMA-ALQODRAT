-- اختبارات قاعدة البيانات: الباقات، والاشتراكات، والباركود الموحد، والتدقيق، ومنع الحذف التاريخي
\set ON_ERROR_STOP on
do $$
declare r jsonb; v_sub subscriptions%rowtype; d date := riyadh_now()::date; m int := extract(epoch from riyadh_now()::time)::int / 60;
  v_nid text := '1000000008'; v_nid2 text := '1000000016'; v_cnt int; v_admin uuid := gen_random_uuid(); ok boolean;
  fmt text;
begin
  -- 1) البيانات الأولية
  assert (select count(*) from plans) = 8, 'ثماني باقات';
  assert (select count(*) from plans where mode = 'remote' and status = 'coming_soon') = 4, 'باقات عن بُعد = قريبًا';
  assert (select count(*) from schedule_templates) = 6, 'ستة أيام في القالب';
  begin update plans set status = 'open' where mode = 'remote'; ok := false; exception when check_violation then ok := true; end;
  assert ok, 'لا تُفتح باقة عن بُعد';

  -- جلسة للبنين الآن
  delete from schedule_templates where section = 'boys' and dow = extract(dow from d)::int;
  insert into schedule_templates(section, dow, start_time, end_time)
  values ('boys', extract(dow from d)::int, make_time(greatest(0, m - 5) / 60, greatest(0, m - 5) % 60, 0), make_time(least(1439, m + 110) / 60, least(1439, m + 110) % 60, 0));
  update settings set require_code = false where id = 1;

  -- 2) الاشتراك العام
  r := register_subscription(jsonb_build_object('national_id', v_nid, 'full_name', 'سلمان أحمد علي الشهري', 'phone', '0551112233', 'gender', 'ذكر', 'city', 'جازان', 'education', 'ثانوي',
       'plan_id', (select id from plans where tier = 'silver' and mode = 'in_person')));
  assert (r->>'ok')::boolean and r->>'section' = 'البنون', 'اشتراك في الفضية لقسم البنين';
  begin r := register_subscription(jsonb_build_object('national_id', v_nid, 'full_name', 'سلمان أحمد علي الشهري', 'phone', '0551112233', 'gender', 'ذكر', 'city', 'جازان', 'education', 'ثانوي',
       'plan_id', (select id from plans where tier = 'silver' and mode = 'in_person'))); ok := false; exception when others then ok := true; end;
  assert ok, 'منع الاشتراك المكرر';
  begin r := register_subscription(jsonb_build_object('national_id', v_nid2, 'full_name', 'خالد', 'gender', 'ذكر', 'plan_id', (select id from plans where tier = 'silver' and mode = 'remote'))); ok := false; exception when others then ok := true; end;
  assert ok, 'لا تسجيل في باقة عن بُعد';

  -- 3) الباركود الموحد
  r := checkin(v_nid, null, null, 'dev-1', null);
  assert (r->>'ok')::boolean and (r->>'started')::boolean and r->>'kind' = 'subscription', 'أول حضور يبدأ الاشتراك: ' || r::text;
  select * into v_sub from subscriptions where trainee_id = (select id from trainees where national_id = v_nid);
  assert v_sub.start_date = d and v_sub.end_date = (d + interval '3 months')::date - 1 and v_sub.status = 'active', 'البداية اليوم والنهاية بعد 3 أشهر';
  r := checkin(v_nid, null, null, 'dev-1', null);
  assert (r->>'already')::boolean, 'المسح المكرر';
  assert (select count(*) from sub_attendance where subscription_id = v_sub.id) = 1, 'يوم حضور واحد';
  assert (select count(*) from checkin_attempts where nid_hash = md5('sama:' || v_nid)) = 2, 'سجل المحاولات مجزّأ';
  assert not exists (select 1 from checkin_attempts where nid_hash = v_nid), 'لا يُخزَّن السجل المدني نصًا';
  r := checkin('1000000024', null, null, 'dev-1', null);
  assert not (r->>'ok')::boolean and r->>'reason' = 'not_in_cohort', 'رقم غير مسجل';

  -- 4) حضوري
  r := my_attendance(v_nid);
  assert jsonb_array_length(r->'items') = 1 and r->'items'->0->>'kind' = 'subscription' and (r->'items'->0->>'rate')::int = 100, 'حضوري يعرض الاشتراك: ' || r::text;

  -- 5) دوال الإدارة تتطلب مسؤولًا
  begin perform admin_save_subscription('{}'::jsonb); ok := false; exception when others then ok := sqlerrm like '%غير مصرح%'; end;
  assert ok, 'الإدارة ممنوعة لغير المسؤول';
  insert into auth.users(id, email) values (v_admin, 'admin@test'); insert into admins(user_id) values (v_admin);
  perform set_config('app.uid', v_admin::text, true);
  r := admin_save_subscription(jsonb_build_object('national_id', v_nid2, 'full_name', 'نورة علي محمد الحازمي', 'gender', 'أنثى',
       'plan_id', (select id from plans where tier = 'gold' and mode = 'in_person'), 'start_date', d - 20));
  assert r->>'section' = 'girls' and (r->>'start_manual')::boolean and r->>'status' = 'active', 'طالبة حالية بتاريخ بداية يدوي';
  perform set_sub_attendance((r->>'id')::uuid, d - 20, 'حاضر');
  assert exists (select 1 from sub_attendance where subscription_id = (r->>'id')::uuid and manual), 'حضور يدوي';
  assert exists (select 1 from audit_logs where action = 'sub_attendance.insert' and actor = v_admin), 'التدقيق يسجل المسؤول';
  r := sub_stats((r->>'id')::uuid);
  assert (r->>'attended')::int = 1 and (r->>'held')::int >= 1, 'إحصاء الاشتراك: ' || r::text;

  -- 6) لا حذف لسجل له حضور
  begin delete from trainees where national_id = v_nid; ok := false; exception when foreign_key_violation then ok := true; end;
  assert ok, 'منع حذف متدرب له حضور';
  perform set_config('app.uid', '', true);
  raise notice 'test_qudurat: كل الفحوص ناجحة';
end $$;
