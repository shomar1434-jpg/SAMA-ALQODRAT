-- الخطوة T: الاستهداف بقائمة ثابتة، سياسة إظهار الإجابات، واعتماد المفاتيح شرطًا للاختبار الرسمي
\set ON_ERROR_STOP on
do $$
declare tb uuid; v_admin uuid := gen_random_uuid(); s1 uuid; s2 uuid; p1 text; p2 text; d date := riyadh_now()::date; a assignments; pd jsonb; r jsonb; ok boolean; ids jsonb; x jsonb; q jsonb;
begin
  select id into tb from teachers where phone = '0501009801';   -- مدرب كمي بنين من الاختبار السابق
  select t.id, t.phone into s1, p1 from trainees t join subscriptions s on s.trainee_id = t.id where s.section = 'boys' and 'كمي' = any(s.subjects) and s.status in ('pending','active') and t.phone ~ '^05' and (select count(*) from trainees z where z.phone = t.phone) = 1 order by t.id limit 1;
  select t.id, t.phone into s2, p2 from trainees t join subscriptions s on s.trainee_id = t.id where s.section = 'boys' and 'كمي' = any(s.subjects) and s.status in ('pending','active') and t.phone ~ '^05' and (select count(*) from trainees z where z.phone = t.phone) = 1 and t.id <> s1 order by t.id limit 1;
  select jsonb_agg(id) into ids from questions where code in ('KT-01','KT-02');
  perform set_config('app.phone', '0501009801', true);
  -- اختبار رسمي بمفاتيح غير معتمدة يُرفض
  begin perform teacher_save_assignment(jsonb_build_object('kind','quiz','type','exam','subject','كمي','title','اختبار رسمي','publish_date',d,'due_date',d + 2,'question_ids',ids)); ok := false; exception when others then ok := true; end;
  assert ok, 'الاختبار الرسمي يحتاج مفاتيح معتمدة';
  -- مستهدف خارج نطاق المدرب يُرفض
  begin perform teacher_save_assignment(jsonb_build_object('kind','text','subject','كمي','title','خارج النطاق','publish_date',d,'due_date',d,'targets',jsonb_build_array(gen_random_uuid()))); ok := false; exception when others then ok := true; end;
  assert ok, 'مستهدف خارج النطاق يُرفض';
  perform teacher_save_assignment(jsonb_build_object('kind','quiz','type','practice','reveal','after_due','subject','كمي','title','تدريب مستهدف','publish_date',d,'due_date',d + 2,'question_ids',ids,'targets',jsonb_build_array(s1),'target_label','متدرب واحد'));
  select * into a from assignments where title = 'تدريب مستهدف';
  assert a.type = 'practice' and a.reveal = 'after_due' and a.targets = array[s1] and a.target_label = 'متدرب واحد', 'الواجب بنوعه وسياسته وقائمته الثابتة';
  -- المستهدَف يراه دون معرّفات غيره، وغير المستهدَف لا يراه ولا يسلّم
  perform set_config('app.phone', p1, true); pd := portal_data('student');
  select y into x from jsonb_array_elements(pd->'assignments') y where y->>'id' = a.id::text;
  assert x is not null and x->'targets' = jsonb_build_array(s1) and (x->'quiz'->0) ? 'correct' = false, 'المستهدَف يرى الواجب بلا مفاتيح';
  perform set_config('app.phone', p2, true); pd := portal_data('student');
  assert not exists (select 1 from jsonb_array_elements(pd->'assignments') y where y->>'id' = a.id::text), 'غير المستهدَف لا يرى الواجب';
  begin perform student_submit(jsonb_build_object('trainee_id', s2, 'assignment_id', a.id, 'answers', '{}'::jsonb)); ok := false; exception when others then ok := true; end;
  assert ok, 'غير المستهدَف لا يسلّم';
  -- التسليم: المراجعة محجوبة حتى بعد الاستحقاق
  perform set_config('app.phone', p1, true);
  select jsonb_object_agg(y->>'id', 0) into q from jsonb_array_elements(a.quiz) y;
  r := student_submit(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id, 'answers', q));
  pd := portal_data('student');
  select y into x from jsonb_array_elements(pd->'submissions') y where y->>'assignment_id' = a.id::text;
  assert x->>'status' = 'graded' and not (x ? 'review') and (x->>'review_hidden')::boolean, 'المراجعة محجوبة قبل موعد الاستحقاق';
  update assignments set publish_date = d - 5, due_date = d - 1 where id = a.id;
  pd := portal_data('student');
  select y into x from jsonb_array_elements(pd->'submissions') y where y->>'assignment_id' = a.id::text;
  assert x ? 'review', 'تظهر المراجعة بعد موعد الاستحقاق';
  -- اعتماد المفاتيح ثم الاختبار الرسمي
  perform set_config('app.phone', '', true);
  begin perform admin_approve_keys('كمي'); ok := false; exception when others then ok := true; end;
  assert ok, 'اعتماد المفاتيح للمسؤول فقط';
  insert into auth.users(id, email) values (v_admin, 'keys-admin@test'); insert into admins(user_id) values (v_admin);
  perform set_config('app.uid', v_admin::text, true);
  r := admin_approve_keys('كمي');
  assert (r->>'count')::int >= 3 and (select key_status from questions where code = 'KT-01') = 'approved' and (select key_approved_by from questions where code = 'KT-01') = v_admin, 'اعتماد مفاتيح المقرر';
  perform set_config('app.uid', '', true); perform set_config('app.phone', '0501009801', true);
  perform teacher_save_assignment(jsonb_build_object('kind','quiz','type','exam','reveal','never','subject','كمي','title','اختبار رسمي معتمد','publish_date',d,'due_date',d + 2,'question_ids',ids));
  assert (select type from assignments where title = 'اختبار رسمي معتمد') = 'exam', 'بعد الاعتماد يُنشر الاختبار الرسمي';
  -- مرآة الإنجاز للمدرب تحمل المستهدفين
  pd := portal_data('teacher');
  assert exists (select 1 from jsonb_array_elements(pd->'hw_assignments') y where y->>'id' = a.id::text and y->'targets' = jsonb_build_array(s1)), 'مرآة الإنجاز تعرف المستهدفين';
  perform set_config('app.phone', '', true);
  delete from admins where user_id = v_admin; delete from auth.users where id = v_admin;
end $$;
