-- الخطوة AV: اختبار من أكثر من قسم بترتيب المدرب، وتغذية راجعة بعد التسليم لا تغيّر الدرجة ويراها المتدرب وحده
\set ON_ERROR_STOP on
do $$
declare d date := riyadh_now()::date; ok boolean; r jsonb; v_admin uuid := gen_random_uuid(); t1 uuid; t2 uuid; v_tr uuid; v_a uuid; v_s uuid; ids jsonb; q1 text; q2 text;
begin
  insert into teachers(full_name, phone, section, subjects) values ('مدرب التغذية الراجعة', '0501009991', 'boys', '{كمي}') returning id into t1;
  insert into teachers(full_name, phone, section, subjects) values ('مدرب آخر', '0501009992', 'boys', '{كمي}') returning id into t2;
  perform register_subscription(jsonb_build_object('birth_date','1995-01-01','national_id','1978033023','full_name','ماهر سعد علي الغامدي','phone','0557778881','gender','ذكر',
    'plan_id',(select id from plans where tier='basic' and mode='in_person'),
    'accepted_policies',(select coalesce(jsonb_agg(id), '[]') from current_policies(d) where requires_acceptance)));
  select id into v_tr from trainees where national_id = '1978033023';
  update subscriptions set subjects = '{كمي}' where trainee_id = v_tr;
  insert into auth.users(id, email) values (v_admin, 'fb-admin@test'); insert into admins(user_id, role) values (v_admin, 'full');
  perform set_config('app.uid', v_admin::text, true);
  perform admin_import_questions(t1, (select jsonb_agg(jsonb_build_object('subject','كمي','unit', case when k <= 3 then 'الجبر' else 'الهندسة' end,'text','سؤال تغذية ' || k,
        'options',jsonb_build_array('أ','ب','ج','د'),'correct',0)) from generate_series(1,6) k));
  perform set_config('app.uid', '', true);
  -- أسئلة من قسمين بترتيب المدرب
  select jsonb_agg(id order by text desc) into ids from questions where teacher_id = t1 and text in ('سؤال تغذية 1','سؤال تغذية 5','سؤال تغذية 2');
  perform set_config('app.phone', '0501009991', true);
  perform teacher_save_assignment(jsonb_build_object('title','اختبار شامل','subject','كمي','kind','quiz','question_ids',ids,'max_score',10,'publish_date',d,'due_date',d+2));
  select id into v_a from assignments where title = 'اختبار شامل' and teacher_id = t1;
  assert (select jsonb_agg(x->'id') from assignments a, jsonb_array_elements(a.quiz) x where a.id = v_a) = ids, 'الأسئلة بترتيب المدرب';
  assert (select count(distinct x->>'unit') from assignments a, jsonb_array_elements(a.quiz) x where a.id = v_a) = 2, 'من قسمين';
  q1 := ids->>0; q2 := ids->>1;
  -- قبل التسليم لا ملاحظات
  perform set_config('app.phone', '0557778881', true);
  perform student_start_quiz(jsonb_build_object('trainee_id',v_tr,'assignment_id',v_a));
  select id into v_s from submissions where assignment_id = v_a and trainee_id = v_tr;
  perform set_config('app.phone', '0501009991', true);
  begin perform teacher_comment(v_s, '{"note":"مبكر"}'); ok := false; exception when others then ok := sqlerrm like '%لم يُسلِّم%'; end;
  assert ok, 'لا ملاحظات قبل التسليم';
  perform set_config('app.phone', '0557778881', true);
  perform student_submit(jsonb_build_object('trainee_id',v_tr,'assignment_id',v_a,'answers',jsonb_build_object(q1, 0, q2, 1)));
  -- مدرب آخر لا يكتب، وسؤال خارج الاختبار مرفوض
  perform set_config('app.phone', '0501009992', true);
  begin perform teacher_comment(v_s, '{"note":"x"}'); ok := false; exception when others then ok := sqlerrm like '%غير مصرح%'; end;
  assert ok, 'مدرب آخر لا يعلّق';
  perform set_config('app.phone', '0501009991', true);
  begin perform teacher_comment(v_s, jsonb_build_object('comments', jsonb_build_object(gen_random_uuid()::text, 'x'))); ok := false; exception when others then ok := sqlerrm like '%خارج الاختبار%'; end;
  assert ok, 'سؤال خارج الاختبار مرفوض';
  r := (select to_jsonb(s) from submissions s where id = v_s);
  perform teacher_comment(v_s, jsonb_build_object('note', '  أحسنت في الجبر  ', 'comments', jsonb_build_object(q2, 'راجع الخطوة الثانية', q1, '   ')));
  assert (select teacher_note = 'أحسنت في الجبر' and comments = jsonb_build_object(q2, 'راجع الخطوة الثانية') and score = (r->>'score')::numeric and status = 'graded' from submissions where id = v_s), 'حُفظت الملاحظات والدرجة كما هي';
  -- المتدرب يراها
  perform set_config('app.phone', '0557778881', true);
  r := portal_data('student');
  assert exists (select 1 from jsonb_array_elements(r->'submissions') x where x->>'id' = v_s::text and x->>'teacher_note' = 'أحسنت في الجبر' and x->'comments'->>q2 = 'راجع الخطوة الثانية'), 'المتدرب يرى الملاحظات';
  perform set_config('app.phone', '', true);
end $$;
