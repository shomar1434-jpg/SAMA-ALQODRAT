-- الخطوة AR: بيانات تحليل الضعف في البوابة (q_meta، ومحاكيات متدربي المدرب)
\set ON_ERROR_STOP on
do $$
declare v_admin uuid := gen_random_uuid(); us uuid := gen_random_uuid(); ut uuid := gen_random_uuid(); r jsonb; c text; t1 uuid; tq uuid; ph text := '0557779961'; tph text := '0501009961'; a1 uuid; q1 uuid;
begin
  insert into trainees(national_id, full_name, phone, gender) values ('1999999963', 'ماجد ناصر علي الزهراني', ph, 'ذكر') returning id into t1;
  insert into trainees(national_id, full_name, phone, gender) values ('1999999964', 'مازن ناصر علي الزهراني', ph, 'ذكر');
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects, status) select 'SQ-WK9998', t1, id, 'boys', array['كمي'], 'pending' from plans where mode = 'in_person' limit 1;
  insert into teachers(full_name, phone, section, subjects) values ('مدرب التحليل', tph, 'boys', '{كمي}') returning id into tq;
  for i in 1..6 loop
    insert into questions(shared, teacher_id, section, subject, unit, text, image, options, correct, status, code, key_status)
    values (true, null, 'all', 'كمي', 'وحدة التحليل', '', 'quant/w' || i || '.webp', array['أ','ب','ج','د'], 0, 'published', 'TWK-' || i, 'approved');
  end loop;
  insert into auth.users(id, email) values (v_admin, 'wk-admin@test'); insert into admins(user_id, role) values (v_admin, 'full');
  perform set_config('app.uid', v_admin::text, true);
  perform admin_open_activation(ph, 'student', 15);
  perform set_config('app.uid', us::text, true); c := request_login(ph, 'student')->>'code'; perform activate_device(ph, c, 'student');
  r := student_start_sim(jsonb_build_object('trainee_id', t1, 'subjects', jsonb_build_array('كمي')));
  a1 := (r->>'id')::uuid; q1 := (r->'snapshot'->0->>'id')::uuid;
  perform student_finish_attempt(a1, jsonb_build_object(q1::text, 0));
  r := portal_data('student');
  assert r->'q_meta' ? q1::text and r->'q_meta'->q1::text->>0 = (select category from questions where id = q1), 'q_meta بالتصنيف الحالي';
  perform set_config('app.uid', v_admin::text, true);
  perform admin_set_category(array[q1], 'الجبر');
  perform admin_open_activation(tph, 'teacher', 15);
  perform set_config('app.uid', us::text, true);
  assert portal_data('student')->'q_meta'->q1::text->>0 = 'الجبر', 'تعديل التصنيف يظهر في التحليل دون تغيير نسخة المحاولة';
  perform set_config('app.uid', ut::text, true); c := request_login(tph, 'teacher')->>'code'; perform activate_device(tph, c, 'teacher');
  r := portal_data('teacher');
  assert exists (select 1 from jsonb_array_elements(r->'attempts') x where x->>'id' = a1::text and x->>'kind' = 'sim'), 'المدرب يرى محاكيات متدربيه';
  assert r->'q_meta' ? q1::text, 'وتصنيف أسئلتها';
  perform set_config('app.uid', '', true);
end $$;
