-- الخطوة X: سيرة المدرب، المجموعات المحفوظة، وحد المحاولات (أعلى درجة، وحجب الإجابات حتى آخر محاولة)
\set ON_ERROR_STOP on
do $$
declare s1 uuid; p1 text; d date := riyadh_now()::date; a assignments; pd jsonb; x jsonb; r jsonb; ok boolean; ids jsonb; sb submissions; q1 text; q2 text; g uuid; other uuid;
begin
  select t.id, t.phone into s1, p1 from trainees t join subscriptions s on s.trainee_id = t.id where s.section = 'boys' and 'كمي' = any(s.subjects) and s.status in ('pending','active') and t.phone ~ '^05' and (select count(*) from trainees z where z.phone = t.phone) = 1 order by t.id desc limit 1;
  select t.id into other from trainees t where not exists (select 1 from subscriptions s where s.trainee_id = t.id and s.section = 'boys') limit 1;
  select jsonb_agg(id) into ids from questions where code in ('KT-01','KT-02');
  perform set_config('app.phone', '0501009801', true);
  -- الملف: السيرة
  perform teacher_save_profile(jsonb_build_object('bio','نبذة','cv','بكالوريوس رياضيات، خبرة عشر سنوات','telegram','','avatar',''));
  begin perform teacher_save_profile(jsonb_build_object('cv', repeat('س', 2001))); ok := false; exception when others then ok := true; end;
  assert ok, 'السيرة الطويلة تُرفض';
  -- المجموعات
  perform teacher_save_group(jsonb_build_object('name','مجموعة المتابعة','trainee_ids', jsonb_build_array(s1)));
  select id into g from trainer_groups where name = 'مجموعة المتابعة';
  assert g is not null, 'تُحفظ المجموعة';
  if other is not null then
    begin perform teacher_save_group(jsonb_build_object('name','خارج النطاق','trainee_ids', jsonb_build_array(other))); ok := false; exception when others then ok := true; end;
    assert ok, 'متدرب خارج نطاق المدرب يُرفض';
  end if;
  begin perform teacher_save_group(jsonb_build_object('name','ف','trainee_ids', jsonb_build_array(s1))); ok := false; exception when others then ok := true; end;
  assert ok, 'اسم قصير يُرفض';
  pd := portal_data('teacher');
  assert exists (select 1 from jsonb_array_elements(pd->'groups') y where y->>'name' = 'مجموعة المتابعة' and y->'trainee_ids' ? s1::text), 'المجموعة تصل المدرب';
  assert pd->'me'->>'cv' like 'بكالوريوس%', 'السيرة في ملف المدرب';
  -- حد المحاولات
  begin perform teacher_save_assignment(jsonb_build_object('kind','quiz','subject','كمي','title','محاولات كثيرة','publish_date',d,'due_date',d + 2,'question_ids',ids,'max_attempts',4)); ok := false; exception when others then ok := true; end;
  assert ok, 'أكثر من 3 محاولات يُرفض';
  perform teacher_save_assignment(jsonb_build_object('kind','quiz','subject','كمي','title','اختبار بمحاولتين','publish_date',d,'due_date',d + 2,'question_ids',ids,'max_attempts',2));
  select * into a from assignments where title = 'اختبار بمحاولتين'; q1 := a.quiz->0->>'id'; q2 := a.quiz->1->>'id';
  assert a.max_attempts = 2, 'يُحفظ حد المحاولات';
  assert (select max_attempts from assignments where title = 'اختبار موقوت') = 1, 'الافتراضي محاولة واحدة';
  perform set_config('app.phone', p1, true);
  pd := portal_data('student');
  assert exists (select 1 from jsonb_array_elements(pd->'teachers') y where y->>'cv' like 'بكالوريوس%'), 'السيرة تصل المتدرب';
  -- المحاولة الأولى: إجابتان صحيحتان
  perform student_start_quiz(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id));
  perform student_submit(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id, 'answers', jsonb_build_object(q1, (a.quiz->0->>'correct')::int, q2, (a.quiz->1->>'correct')::int)));
  select * into sb from submissions where assignment_id = a.id and trainee_id = s1;
  assert sb.status = 'graded' and sb.score = a.max_score and sb.attempt_no = 1, 'المحاولة الأولى مصححة';
  pd := portal_data('student'); select y into x from jsonb_array_elements(pd->'submissions') y where y->>'id' = sb.id::text;
  assert not (x ? 'review') and (x->>'review_hidden')::boolean, 'الإجابات محجوبة ما بقيت محاولة';
  assert (x->'marks'->>q1)::boolean and (x->'marks'->>q2)::boolean and jsonb_typeof(x->'marks'->q1) = 'boolean', 'صح/خطأ لكل سؤال دون الإجابة الصحيحة (marks)';
  -- بلا طلب صريح لا تبدأ محاولة جديدة
  r := student_start_quiz(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id));
  assert (r->>'again')::boolean, 'البدء دون retry لا يفتح محاولة';
  r := student_start_quiz(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id, 'retry', true));
  assert (r->>'attempt_no')::int = 2, 'محاولة ثانية بطلب صريح';
  perform student_submit(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id, 'answers', jsonb_build_object(q1, (a.quiz->0->>'correct')::int)));
  select * into sb from submissions where id = sb.id;
  assert sb.status = 'graded' and sb.score = a.max_score and sb.attempt_no = 2 and sb.feedback like '%المحاولة 2%', 'تُحتسب أعلى درجة';
  pd := portal_data('student'); select y into x from jsonb_array_elements(pd->'submissions') y where y->>'id' = sb.id::text;
  assert x ? 'review', 'بعد آخر محاولة تظهر الإجابات';
  r := student_start_quiz(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id, 'retry', true));
  assert (r->>'again')::boolean and (select attempt_no from submissions where id = sb.id) = 2, 'لا محاولة بعد الحد';
  -- حذف المجموعة لصاحبها فقط
  begin perform teacher_delete_group(g); ok := false; exception when others then ok := true; end;
  assert ok, 'غير المدرب لا يحذف';
  perform set_config('app.phone', '0501009801', true);
  perform teacher_delete_group(g);
  assert not exists (select 1 from trainer_groups where id = g), 'تُحذف المجموعة';
  perform set_config('app.phone', '', true);
  assert not has_function_privilege('anon', 'teacher_save_group(jsonb)', 'execute') and has_function_privilege('authenticated', 'teacher_save_group(jsonb)', 'execute'), 'صلاحيات المجموعات';
  assert not has_function_privilege('authenticated', 'teacher_save_assignment_base(jsonb)', 'execute') and not has_function_privilege('authenticated', 'portal_data_timed(text)', 'execute'), 'النسخ السابقة مغلقة';
end $$;
