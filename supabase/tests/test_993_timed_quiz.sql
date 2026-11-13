-- الخطوة V: الاختبار يُفتح مرة واحدة بدقيقتين لكل سؤال؛ الأسئلة لا تُرسل قبل البدء؛ وما انتهى وقته يُصحَّح مما حُفظ
\set ON_ERROR_STOP on
do $$
declare s1 uuid; p1 text; d date := riyadh_now()::date; a assignments; pd jsonb; x jsonb; r jsonb; ok boolean; ids jsonb; sb submissions; q1 text; q2 text;
begin
  select t.id, t.phone into s1, p1 from trainees t join subscriptions s on s.trainee_id = t.id where s.section = 'boys' and 'كمي' = any(s.subjects) and s.status in ('pending','active') and t.phone ~ '^05' and (select count(*) from trainees z where z.phone = t.phone) = 1 order by t.id desc limit 1;
  select jsonb_agg(id) into ids from questions where code in ('KT-01','KT-02');
  perform set_config('app.phone', '0501009801', true);
  perform teacher_save_assignment(jsonb_build_object('kind','quiz','subject','كمي','title','اختبار موقوت','publish_date',d,'due_date',d + 2,'question_ids',ids));
  select * into a from assignments where title = 'اختبار موقوت'; q1 := a.quiz->0->>'id'; q2 := a.quiz->1->>'id';
  perform set_config('app.phone', p1, true);
  pd := portal_data('student'); select y into x from jsonb_array_elements(pd->'assignments') y where y->>'id' = a.id::text;
  assert x->'quiz' = 'null'::jsonb and (x->>'quiz_count')::int = 2 and (x->>'quiz_minutes')::int = 4, 'قبل البدء: لا أسئلة، فقط العدد والمدة (دقيقتان لكل سؤال)';
  begin perform student_submit(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id, 'answers', '{}'::jsonb)); ok := false; exception when others then ok := true; end;
  assert ok, 'لا تسليم دون بدء';
  r := student_start_quiz(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id));
  select * into sb from submissions where assignment_id = a.id and trainee_id = s1;
  assert sb.status = 'draft' and sb.deadline - sb.started_at = interval '4 minutes', 'البدء يسجّل الوقت والمهلة';
  r := student_start_quiz(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id));
  assert (r->>'again')::boolean and (select deadline from submissions where id = sb.id) = sb.deadline, 'البدء مرة واحدة: لا يُعاد العدّ';
  pd := portal_data('student'); select y into x from jsonb_array_elements(pd->'assignments') y where y->>'id' = a.id::text;
  assert jsonb_array_length(x->'quiz') = 2 and not ((x->'quiz'->0) ? 'correct'), 'بعد البدء تصل الأسئلة بلا مفاتيح';
  perform student_save_quiz_answer(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id, 'question_id', q1, 'value', (a.quiz->0->>'correct')::int));
  begin perform student_save_quiz_answer(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id, 'question_id', q1, 'value', 9)); ok := false; exception when others then ok := true; end;
  assert ok, 'قيمة غير صالحة تُرفض';
  -- انتهى الوقت: لا حفظ، والتسليم المتأخر لا يضيف إجابات، والمهمة المجدولة تصحح ما حُفظ
  update submissions set started_at = now() - interval '10 minutes', deadline = now() - interval '6 minutes' where id = sb.id;
  begin perform student_save_quiz_answer(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id, 'question_id', q2, 'value', (a.quiz->1->>'correct')::int)); ok := false; exception when others then ok := true; end;
  assert ok, 'لا حفظ بعد انتهاء الوقت';
  assert finalize_expired_quizzes() >= 1, 'المهمة المجدولة تصحح المنتهي';
  select * into sb from submissions where id = sb.id;
  assert sb.status = 'graded' and sb.feedback like 'أجبت 1 من 2%' and sb.score = round(a.max_score / 2, 1), 'يُصحَّح ما حُفظ داخل الوقت فقط';
  begin perform student_submit(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id, 'answers', jsonb_build_object(q2, 0))); ok := false; exception when others then ok := true; end;
  assert ok, 'لا إعادة بعد التصحيح';
  begin perform student_start_quiz(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id)); r := student_start_quiz(jsonb_build_object('trainee_id', s1, 'assignment_id', a.id)); ok := (r->>'status') = 'graded'; exception when others then ok := true; end;
  assert ok, 'البدء بعد التصحيح لا يفتح الاختبار من جديد';
  perform set_config('app.phone', '', true);
end $$;
