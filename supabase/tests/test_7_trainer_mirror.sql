-- مرآة الإنجاز: المدرب يرى واجبات كل مقررات متدربيه وحالات تسليمها دون نصوص الإجابات
\set ON_ERROR_STOP on
do $$
declare r jsonb; v_t uuid; me uuid; other uuid; d date := riyadh_now()::date;
begin
  select id into v_t from trainees where national_id = '1000000008';
  select id into me from teachers where phone = '0501000003';         -- مدرب كمي (بنين)
  insert into teachers(full_name, phone, section, subjects) values ('فيصل علي المدخلي', '0501000004', 'boys', '{لفظي}') returning id into other;   -- مدرب لفظي (بنين)
  insert into assignments(teacher_id, section, subject, title, publish_date, due_date) values (other, 'boys', 'لفظي', 'واجب لفظي للمرآة', d, d + 2);
  insert into submissions(assignment_id, trainee_id, answer, status, submitted_at)
    select id, v_t, 'نص سري', 'submitted', now() from assignments where title = 'واجب لفظي للمرآة';
  perform set_config('app.phone', '0501000003', true);
  r := portal_data('teacher');
  assert exists (select 1 from jsonb_array_elements(r->'hw_assignments') a where a->>'subject' = 'لفظي'), 'المدرب يرى واجبات المقرر الآخر للمتدرب (للمرآة)';
  assert exists (select 1 from jsonb_array_elements(r->'hw_submissions') x where x->>'trainee_id' = v_t::text and x->>'status' = 'submitted'), 'وحالة تسليمها';
  assert position('نص سري' in r::text) = 0, 'دون نصوص الإجابات';
  assert not exists (select 1 from jsonb_array_elements(r->'assignments') a where a->>'subject' = 'لفظي'), 'قائمة واجباته الخاصة كما هي';
  perform set_config('app.phone', '', true);
end $$;
