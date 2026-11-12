-- اختبارات الجانب التعليمي: نطاق القسم والمقرر، وإخفاء الإجابات، ونسخة الأسئلة، والتقييم، والمراسلة
\set ON_ERROR_STOP on
do $$
declare r jsonb; ok boolean; v_t uuid; v_g uuid; v_a uuid; v_q uuid; v_at jsonb; d date := riyadh_now()::date; me uuid;
begin
  select id into v_t from trainees where national_id = '1000000008';        -- متدرب بنين (فضية: كمي/لفظي)
  select id into v_g from trainees where national_id = '1000000016';        -- طالبة بنات
  select id into me from teachers where phone = '0501000003';

  -- المدرب ينشر واجبًا وسؤالًا في نطاقه فقط
  perform set_config('app.phone', '0501000003', true);
  begin perform teacher_save_assignment(jsonb_build_object('title','واجب لفظي','subject','لفظي','publish_date',d,'due_date',d+3)); ok := false; exception when others then ok := sqlerrm like '%خارج نطاقك%'; end;
  assert ok, 'لا واجب خارج مقررات المدرب';
  perform teacher_save_assignment(jsonb_build_object('title','واجب الكسور','subject','كمي','publish_date',d,'due_date',d+3,'body','حل 5'));
  select id into v_a from assignments where title = 'واجب الكسور';
  perform teacher_save_question(jsonb_build_object('subject','كمي','unit','الضرب','text','كم يساوي 7 × 8؟','options',jsonb_build_array('54','56','58','64'),'correct',1,'status','published','explanation','جدول الضرب'));
  select id into v_q from questions where text = 'كم يساوي 7 × 8؟';
  assert (select section from questions where id = v_q) = 'boys', 'السؤال في بنك البنين';
  insert into questions(section, subject, unit, text, options, correct, status) values ('girls','كمي','بنات فقط','سؤال بنات', '{1,2,3,4}', 0, 'published');

  -- المتدرب
  perform set_config('app.phone', '0551112233', true);
  perform student_submit(jsonb_build_object('trainee_id',v_t,'assignment_id',v_a,'answer','3/4'));
  assert (select status from submissions where assignment_id = v_a and trainee_id = v_t) = 'submitted', 'تسليم الواجب';
  r := portal_data('student');
  assert not exists (select 1 from jsonb_array_elements(r->'bank_units') u where u->>'unit' = 'بنات فقط'), 'لا يرى المتدرب وحدات بنك البنات';
  begin perform student_start_attempt(jsonb_build_object('trainee_id',v_g,'section','girls','subject','كمي')); ok := false; exception when others then ok := sqlerrm like '%غير مصرح%'; end;
  assert ok, 'لا يبدأ محاولة باسم متدرب آخر';
  begin perform student_start_attempt(jsonb_build_object('trainee_id',v_t,'section','girls','subject','كمي')); ok := false; exception when others then ok := sqlerrm like '%ليس ضمن اشتراكك%'; end;
  assert ok, 'لا يصل إلى بنك البنات حتى بطلب مباشر';
  v_at := student_start_attempt(jsonb_build_object('trainee_id',v_t,'section','boys','subject','كمي','unit','الضرب','count',5));
  assert not (v_at->'snapshot'->0 ? 'correct') and not (v_at->'snapshot'->0 ? 'explanation'), 'لا تُرسل الإجابة الصحيحة قبل التسليم';
  r := student_finish_attempt((v_at->>'id')::uuid, jsonb_build_object(v_q::text, 1));
  assert (r->>'score')::int = 1 and r->'snapshot'->0 ? 'correct', 'التصحيح بعد التسليم';

  -- تعديل السؤال لاحقًا لا يغيّر المحاولة
  perform set_config('app.phone', '0501000003', true);
  perform teacher_save_question(jsonb_build_object('id',v_q,'subject','كمي','unit','الضرب','text','كم يساوي 7 × 9؟','options',jsonb_build_array('54','56','63','64'),'correct',2,'status','published'));
  assert (select snapshot->0->>'text' from attempts where id = (v_at->>'id')::uuid) = 'كم يساوي 7 × 8؟', 'نسخة السؤال محفوظة في المحاولة';
  perform teacher_grade((select id from submissions where assignment_id = v_a), jsonb_build_object('status','graded','score',9,'feedback','أحسنت'));
  assert (select score from submissions where assignment_id = v_a) = 9, 'التصحيح';

  -- المراسلة والتقييم
  perform set_config('app.phone', '0551112233', true);
  perform send_message(jsonb_build_object('trainee_id',v_t,'teacher_id',me,'text','سؤال'), 'student');
  begin perform send_message(jsonb_build_object('trainee_id',v_t,'teacher_id',(select id from teachers where phone = '0501000001'),'text','x'), 'student'); ok := false; exception when others then ok := sqlerrm like '%لا يدرّسك%'; end;
  assert ok, 'لا مراسلة لمدرب لا يدرّس المتدرب';
  begin perform student_rate(jsonb_build_object('trainee_id',v_t,'teacher_id',me,'stars',5)); ok := false; exception when others then ok := sqlerrm like '%3 أيام%'; end;
  assert ok, 'التقييم بعد حضور 3 أيام';
  insert into sub_attendance(subscription_id, trainee_id, att_date, status) select id, v_t, d - k, 'حاضر' from subscriptions, generate_series(1,3) k where trainee_id = v_t on conflict do nothing;
  perform student_rate(jsonb_build_object('trainee_id',v_t,'teacher_id',me,'stars',4,'comment','واضح'));
  r := student_rate(jsonb_build_object('trainee_id',v_t,'teacher_id',me,'stars',5));
  assert (r->>'updated')::boolean and (select count(*) from ratings where trainee_id = v_t) = 1 and (select stars from ratings where trainee_id = v_t) = 5, 'تقييم واحد في الفترة';
  perform set_config('app.phone', '0501000003', true);
  r := portal_data('teacher');
  assert (r->'rating_summary'->>'count')::int = 1 and position(v_t::text in (r->'rating_summary')::text) = 0, 'ملخص التقييم دون هوية';
  assert jsonb_array_length(r->'messages') = 1, 'المدرب يرى رسائل طلابه';
  perform set_config('app.phone', '', true);
end $$;
