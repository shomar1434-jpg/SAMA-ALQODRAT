-- الخطوة AQ: تصنيف المهارات ومحاكي الاختبار
\set ON_ERROR_STOP on
do $$
declare v_admin uuid := gen_random_uuid(); u1 uuid := gen_random_uuid(); r jsonb; c text; ok boolean; t1 uuid; ph text := '0557779957'; a1 uuid; i int; q jsonb; v_ids uuid[];
begin
  insert into trainees(national_id, full_name, phone, gender) values ('1999999957', 'فهد ناصر علي القحطاني', ph, 'ذكر') returning id into t1;
  insert into trainees(national_id, full_name, phone, gender) values ('1999999958', 'سلمان ناصر علي القحطاني', ph, 'ذكر');   -- جوال مشترك فلا يلتقطه اختبار التفعيل
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects, status) select 'SQ-SM9997', t1, id, 'boys', array['كمي','لفظي'], 'pending' from plans where mode = 'in_person' limit 1;
  -- لفظي: 3 قطع × 4 أسئلة؛ كمي: 8 أسئلة منفردة
  for i in 1..12 loop
    insert into questions(shared, teacher_id, section, subject, unit, skill, "order", text, image, page_image, options, correct, status, code, key_status)
    values (true, null, 'all', 'لفظي', 'النموذج 99', 'قطعة', i, '', 'verbal/q' || i || '.webp', 'verbal/p' || ((i - 1) / 4) || '.webp', array['أ','ب','ج','د'], i % 4, 'published', 'TSV-' || i, 'approved');
  end loop;
  for i in 1..8 loop
    insert into questions(shared, teacher_id, section, subject, unit, skill, "order", text, image, options, correct, status, code, key_status, category)
    values (true, null, 'all', 'كمي', 'وحدة 99', '', i, '', 'quant/q' || i || '.webp', array['أ','ب','ج','د'], 0, 'published', 'TSQ-' || i, 'approved', case when i <= 4 then 'الجبر' else '' end);
  end loop;
  -- التصنيف التلقائي يطال الأسئلة الموجودة عند الترحيل فقط؛ هنا نطبّق القاعدة نفسها
  update questions set category = 'استيعاب المقروء' where subject = 'لفظي' and page_image <> '' and category = '';
  begin insert into questions(shared, teacher_id, section, subject, unit, text, image, options, correct, status, code, category)
    values (true, null, 'all', 'كمي', 'x', '', 'x.webp', array['أ','ب','ج','د'], 0, 'draft', 'TSX-1', 'التناظر اللفظي'); ok := false; exception when others then ok := true; end;
  assert ok, 'التصنيف يطابق المقرر';

  insert into auth.users(id, email) values (v_admin, 'sm-admin@test'); insert into admins(user_id, role) values (v_admin, 'full');
  perform set_config('app.uid', v_admin::text, true);
  update settings set sim_per_subject = 6, sim_sec_per_q = 60 where id = 1;
  select array_agg(id) into v_ids from questions where code in ('TSQ-5','TSQ-6');
  r := admin_set_category(v_ids, 'الهندسة');
  assert (r->>'count')::int = 2 and (select count(*) from questions where code in ('TSQ-5','TSQ-6') and category = 'الهندسة') = 2, 'تصنيف جماعي';
  begin perform admin_set_category(v_ids, 'الفيزياء'); ok := false; exception when others then ok := true; end;
  assert ok, 'لا تصنيف من مقرر آخر';
  perform admin_open_activation(ph, 'student', 15);
  perform set_config('app.uid', u1::text, true);
  c := request_login(ph, 'student')->>'code';
  perform activate_device(ph, c, 'student');
  begin perform admin_set_category(v_ids, 'الجبر'); ok := false; exception when others then ok := true; end;
  assert ok, 'التصنيف للإدارة فقط';

  r := student_start_sim(jsonb_build_object('trainee_id', t1, 'subjects', jsonb_build_array('كمي', 'لفظي')));
  a1 := (r->>'id')::uuid;
  assert r->>'kind' = 'sim' and (r->>'total')::int = 12 and r->>'deadline' is not null and (r->>'minutes')::int = 12, 'محاكٍ بـ 6 أسئلة لكل مقرر ودقيقة لكل سؤال';
  assert not exists (select 1 from jsonb_array_elements(r->'snapshot') x where x ? 'correct'), 'لا مفاتيح قبل التسليم';
  assert r->'snapshot'->0->>'subject' = 'لفظي' and r->'snapshot'->11->>'subject' = 'كمي', 'اللفظي أولًا ثم الكمي';
  -- القطعة لا تُقطع إلا في آخرها: الأسئلة الأربعة الأولى من صفحة واحدة
  assert (select count(distinct x->>'page_image') from (select x from jsonb_array_elements(r->'snapshot') with ordinality e(x, n) where n <= 4) y) = 1, 'أسئلة القطعة معًا';
  assert (student_start_sim(jsonb_build_object('trainee_id', t1, 'subjects', jsonb_build_array('كمي')))->>'id')::uuid = a1, 'المحاكي المفتوح يُستأنف';

  q := (select jsonb_object_agg(x->>'id', 0) from jsonb_array_elements(r->'snapshot') x where x->>'subject' = 'كمي');
  perform student_save_attempt(a1, q || jsonb_build_object(gen_random_uuid()::text, 2));
  assert (select count(*) from attempts a, jsonb_each(a.answers) where a.id = a1) = 6, 'تُحفظ إجابات النسخة فقط';
  r := student_finish_attempt(a1, '{}');
  i := (select count(*) from jsonb_array_elements(r->'snapshot') x where x->>'subject' = 'كمي' and (x->>'correct')::int = 0);
  assert (r->>'score')::int = i and (r->'parts'->'كمي'->>'right')::int = i and (r->'parts'->'كمي'->>'total')::int = 6 and (r->'parts'->'لفظي'->>'total')::int = 6, 'التصحيح بالمحفوظ والأقسام بالمقرر';
  assert r->'skills' ? 'استيعاب المقروء', 'المهارات بالتصنيف';
  assert r->'snapshot'->0 ? 'correct', 'المفاتيح بعد التسليم';

  -- انتهاء الوقت: لا حفظ، والتسليم بالمحفوظ فقط
  r := student_start_sim(jsonb_build_object('trainee_id', t1, 'subjects', jsonb_build_array('كمي')));
  a1 := (r->>'id')::uuid;
  assert (select count(*) from jsonb_array_elements(r->'snapshot') x where x->>'id' in (select (y->>'id') from attempts, jsonb_array_elements(snapshot) y where kind = 'sim' and id <> a1 and trainee_id = t1))
       <= greatest(0, 6 - ((select count(*) from questions where subject = 'كمي' and status = 'published' and (shared or section = 'boys')) - 6)), 'غير المرئي أولًا';
  update attempts set deadline = now() - interval '5 minutes' where id = a1;
  begin perform student_save_attempt(a1, '{}'); ok := false; exception when others then ok := true; end;
  assert ok, 'لا حفظ بعد انتهاء الوقت';
  r := student_finish_attempt(a1, (select jsonb_object_agg(x->>'id', 0) from jsonb_array_elements(r->'snapshot') x));
  assert (r->>'score')::int = 0, 'بعد الوقت لا تُقبل إجابات جديدة';
  r := student_start_sim(jsonb_build_object('trainee_id', t1, 'subjects', jsonb_build_array('كمي')));
  begin perform student_start_sim(jsonb_build_object('trainee_id', t1, 'subjects', jsonb_build_array('كمي'))); ok := true; exception when others then ok := false; end;
  assert ok, 'المفتوح يُستأنف حتى عند الحد';
  perform student_finish_attempt((r->>'id')::uuid, '{}');
  begin perform student_start_sim(jsonb_build_object('trainee_id', t1, 'subjects', jsonb_build_array('كمي'))); ok := false; exception when others then ok := true; end;
  assert ok, 'حد يومي 3';

  -- تدريب علاجي بالمهارة
  r := student_start_attempt(jsonb_build_object('trainee_id', t1, 'section', 'boys', 'subject', 'كمي', 'category', 'الجبر', 'count', 10));
  assert (r->>'total')::int = (select count(*) from questions where subject = 'كمي' and status = 'published' and category = 'الجبر' and (shared or section = 'boys')) and r->>'focus' = 'الجبر' and not exists (select 1 from jsonb_array_elements(r->'snapshot') x where x->>'category' <> 'الجبر'), 'التدريب على مهارة واحدة';
  assert not has_function_privilege('anon', 'student_start_sim(jsonb)', 'execute') and not has_function_privilege('authenticated', 'attempt_grade(uuid,jsonb)', 'execute'), 'الصلاحيات';
  perform set_config('app.uid', '', true);
  update settings set sim_per_subject = 24, sim_sec_per_q = 75 where id = 1;
end $$;
