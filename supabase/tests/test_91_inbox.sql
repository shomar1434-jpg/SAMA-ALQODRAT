-- الخطوة D: تنبيه بدء الجلسة دون تكرار، وصندوق الوارد لكل دور، ورسالة الإدارة
\set ON_ERROR_STOP on
do $$
declare d date := riyadh_now()::date; st time := (riyadh_now() + interval '5 minutes')::time; n1 int; n2 int; r jsonb; ok boolean; v_admin uuid; v_t uuid;
begin
  if st < '00:10' then return; end if;   -- تجنب منتصف الليل
  perform register_subscription(jsonb_build_object('birth_date','1995-01-01','national_id','1999999996','full_name','ياسر علي محمد الفيفي','phone','0557771234','gender','ذكر',
    'plan_id',(select id from plans where tier='basic' and mode='in_person'),
    'accepted_policies',(select coalesce(jsonb_agg(id), '[]') from current_policies(d) where requires_acceptance)));
  select id into v_t from trainees where national_id = '1999999996';
  insert into teachers(full_name, phone, section, subjects) values ('مدرب التنبيهات', '0501009999', 'boys', '{كمي}');
  insert into schedule_exceptions(date, section, type, start_time, end_time) values (d, 'boys', 'makeup', st, st + interval '1 hour');
  update settings set soon_minutes = 10 where id = 1;
  insert into schedule_exceptions(date, section, type) values (d, 'girls', 'cancel');   -- جلسة البنات الحقيقية قد تقع في نافذة التنبيه وقت تشغيل الاختبار

  n1 := run_session_reminders();
  assert n1 > 0, 'إنشاء تنبيهات بدء الجلسة';
  assert exists (select 1 from notifications where kind = 'session_soon' and "to" = 'student' and trainee_id = v_t), 'تنبيه للمتدرب';
  assert exists (select 1 from notifications n join teachers t on t.id = n.teacher_id where n.kind = 'session_soon' and t.phone = '0501009999'), 'تنبيه لمدرب القسم';
  assert not exists (select 1 from notifications n join subscriptions s on s.trainee_id = n.trainee_id where n.kind = 'session_soon' and s.section = 'girls' and n."to" = 'student'
                     and not exists (select 1 from subscriptions s2 where s2.trainee_id = n.trainee_id and s2.section = 'boys')), 'لا تنبيه لقسم آخر';
  n2 := run_session_reminders();
  assert n2 = 0, 'لا تكرار عند إعادة التشغيل';

  perform set_config('app.phone', '0557771234', true);
  r := portal_inbox('student');
  assert exists (select 1 from jsonb_array_elements(r->'items') x where x->>'kind' = 'session_soon') and (r->>'unread')::int >= 1, 'صندوق المتدرب';
  perform mark_read('student');
  r := portal_inbox('student');
  assert not exists (select 1 from jsonb_array_elements(r->'items') x where x->>'action' = 'notice' and not (x->>'read')::boolean), 'تعليم الإشعارات مقروءة';
  perform set_config('app.phone', '0501009999', true);
  r := portal_inbox('teacher');
  assert exists (select 1 from jsonb_array_elements(r->'items') x where x->>'kind' = 'session_soon'), 'صندوق المدرب';
  perform mark_read('teacher');
  assert not exists (select 1 from notifications n join teachers t on t.id = n.teacher_id where t.phone = '0501009999' and n.read_at is null), 'قراءة المدرب';

  -- رسالة الإدارة
  perform set_config('app.phone', '', true); perform set_config('app.uid', '', true);
  begin perform admin_notify(jsonb_build_object('audience','student','text','رسالة تجريبية')); ok := false; exception when others then ok := sqlerrm like '%غير مصرح%'; end;
  assert ok, 'رسالة الإدارة للإدارة فقط';
  v_admin := gen_random_uuid(); insert into auth.users(id, email) values (v_admin, 'inbox-admin@test'); insert into admins(user_id, role) values (v_admin, 'full');
  perform set_config('app.uid', v_admin::text, true);
  r := admin_notify(jsonb_build_object('audience','student','scope','section','section','boys','text','تذكير بالاختبار الأسبوع القادم'));
  assert (r->>'count')::int >= 1 and exists (select 1 from notifications where kind = 'admin' and trainee_id = v_t), 'رسالة لقسم البنين';
  r := admin_notify(jsonb_build_object('audience','teacher','text','اجتماع المدربين غدًا'));
  assert (r->>'count')::int >= 1, 'رسالة للمدربين';
  begin perform admin_notify(jsonb_build_object('audience','student','text','ab')); ok := false; exception when others then ok := sqlerrm like '%نص الرسالة%'; end;
  assert ok, 'نص قصير مرفوض';
  perform set_config('app.uid', '', true);

  -- إلغاء الجلسة يمنع التنبيه
  delete from notifications where kind = 'session_soon';
  insert into schedule_exceptions(date, section, type) values (d, 'boys', 'cancel');
  assert run_session_reminders() = 0 or not exists (select 1 from notifications where kind = 'session_soon' and dedupe_key like '%:boys:%'), 'لا تنبيه لجلسة ملغاة';
  delete from schedule_exceptions where date = d and section in ('boys', 'girls');   -- تنظيف حتى لا يتأثر غيره
end $$;
