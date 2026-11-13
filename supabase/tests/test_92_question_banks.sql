-- بنوك أسئلة المدربين: الإدارة تضيف وتستورد لبنك مدرب، والمدرب يدير بنكه وحده،
-- وواجب اختبار من البنك يُصحَّح آليًا دون كشف الإجابات قبل التسليم، وقياس المستوى من بنك مدرب محدد.
\set ON_ERROR_STOP on
do $$
declare d date := riyadh_now()::date; ok boolean; r jsonb; v_admin uuid; t1 uuid; t2 uuid; v_tr uuid; v_a uuid; q jsonb; ans jsonb := '{}'; v_q uuid;
begin
  -- مدربان في قسم البنين لمقرر كمي، ومتدرب مشترك
  insert into teachers(full_name, phone, section, subjects) values ('مدرب البنك الأول', '0501008881', 'boys', '{كمي,لفظي}') returning id into t1;
  insert into teachers(full_name, phone, section, subjects) values ('مدرب البنك الثاني', '0501008882', 'boys', '{كمي}') returning id into t2;
  perform register_subscription(jsonb_build_object('birth_date','1995-01-01','national_id','1999999988','full_name','سامي فهد علي الحربي','phone','0557778881','gender','ذكر',
    'plan_id',(select id from plans where tier='basic' and mode='in_person'),
    'accepted_policies',(select coalesce(jsonb_agg(id), '[]') from current_policies(d) where requires_acceptance)));
  select id into v_tr from trainees where national_id = '1999999988';
  update subscriptions set subjects = '{كمي,لفظي}' where trainee_id = v_tr;

  -- الإدارة فقط
  perform set_config('app.phone', '', true); perform set_config('app.uid', '', true);
  begin perform admin_import_questions(t1, '[]'::jsonb); ok := false; exception when others then ok := sqlerrm like '%غير مصرح%'; end;
  assert ok, 'الاستيراد للإدارة فقط';
  v_admin := gen_random_uuid(); insert into auth.users(id, email) values (v_admin, 'bank-admin@test'); insert into admins(user_id) values (v_admin);
  perform set_config('app.uid', v_admin::text, true);

  -- استيراد: الكل أو لا شيء، برقم السطر
  begin perform admin_import_questions(t2, jsonb_build_array(
      jsonb_build_object('subject','كمي','text','سؤال صالح للاختبار','options',jsonb_build_array('1','2','3','4'),'correct',0),
      jsonb_build_object('subject','لفظي','text','مقرر ليس للمدرب','options',jsonb_build_array('1','2','3','4'),'correct',0))); ok := false;
  exception when others then ok := sqlerrm like '%السطر 2%'; end;
  assert ok and not exists (select 1 from questions where teacher_id = t2), 'رفض الدفعة كاملة مع رقم السطر';
  r := admin_import_questions(t1, (select jsonb_agg(jsonb_build_object('subject','كمي','unit','الكسور','skill','الكسور','text','سؤال كسور رقم ' || k,
        'options',jsonb_build_array('أ'||k,'ب'||k,'ج'||k,'د'||k),'correct',k % 4,'explanation','تفسير ' || k)) from generate_series(1,8) k));
  assert (r->>'count')::int = 8 and (select count(*) from questions where teacher_id = t1 and section = 'boys' and status = 'published') = 8, 'استيراد 8 أسئلة منشورة في بنك المدرب الأول';
  perform admin_save_question(jsonb_build_object('teacher_id',t2,'subject','كمي','unit','الجبر','text','سؤال من الإدارة للمدرب الثاني','options',jsonb_build_array('1','2','3','4'),'correct',2,'status','published'));
  select id into v_q from questions where teacher_id = t2;
  perform admin_question_status(v_q, 'draft');
  assert (select status from questions where id = v_q) = 'draft', 'الإدارة توقف سؤالًا';
  perform admin_question_status(v_q, 'published');
  perform set_config('app.uid', '', true);

  -- المدرب يرى بنكه وحده ولا يعدّل بنك غيره
  perform set_config('app.phone', '0501008882', true);
  r := portal_data('teacher');
  assert jsonb_array_length(r->'questions') = 1, 'المدرب الثاني يرى سؤاله فقط';
  begin perform teacher_question_status((select id from questions where teacher_id = t1 limit 1), 'deleted'); ok := false; exception when others then ok := sqlerrm like '%غير مصرح%'; end;
  assert ok, 'لا يعدّل المدرب بنك مدرب آخر';

  -- واجب اختبار من بنك المدرب الأول
  perform set_config('app.phone', '0501008881', true);
  begin perform teacher_save_assignment(jsonb_build_object('title','اختبار لفظي','subject','لفظي','kind','quiz','publish_date',d,'due_date',d+2)); ok := false;
  exception when others then ok := sqlerrm like '%لا توجد أسئلة منشورة%'; end;
  assert ok, 'لا اختبار من بنك فارغ';
  perform teacher_save_assignment(jsonb_build_object('title','اختبار الكسور','subject','كمي','kind','quiz','unit','الكسور','count',5,'max_score',10,'publish_date',d,'due_date',d+2));
  select id into v_a from assignments where title = 'اختبار الكسور';
  assert (select kind from assignments where id = v_a) = 'quiz' and (select jsonb_array_length(quiz) from assignments where id = v_a) = 5, 'واجب اختبار بخمسة أسئلة';

  -- المتدرب: لا إجابات قبل التسليم، وتصحيح آلي
  perform set_config('app.phone', '0557778881', true);
  r := portal_data('student');
  select x into q from jsonb_array_elements(r->'assignments') x where x->>'id' = v_a::text;
  assert q is not null and not (q->'quiz'->0 ? 'correct') and not (q->'quiz'->0 ? 'explanation'), 'الاختبار يصل بلا إجابات صحيحة';
  assert exists (select 1 from jsonb_array_elements(r->'bank_units') u where u->>'teacher_id' = t1::text and u->>'teacher_name' = 'مدرب البنك الأول' and (u->>'count')::int = 8), 'وحدات البنك باسم المدرب';
  -- يجيب صحيحًا على الثلاثة الأولى فقط
  select coalesce(jsonb_object_agg(x->>'id', case when n <= 3 then (x->>'correct')::int else ((x->>'correct')::int + 1) % 4 end), '{}') into ans
    from (select x, row_number() over () n from assignments a, jsonb_array_elements(a.quiz) x where a.id = v_a) z;
  perform student_start_quiz(jsonb_build_object('trainee_id',v_tr,'assignment_id',v_a));   -- الاختبار يُفتح مرة واحدة ثم يُسلَّم
  r := student_submit(jsonb_build_object('trainee_id',v_tr,'assignment_id',v_a,'answers',ans));
  assert (r->>'right')::int = 3 and (r->>'score')::numeric = 6, 'تصحيح آلي: 3 من 5 = 6 من 10';
  assert (select status from submissions where assignment_id = v_a and trainee_id = v_tr) = 'graded' and (select jsonb_array_length(review) from submissions where assignment_id = v_a) = 5, 'مصحح ومعه المراجعة';
  begin perform student_submit(jsonb_build_object('trainee_id',v_tr,'assignment_id',v_a,'answers',ans)); ok := false; exception when others then ok := sqlerrm like '%صُحّح%'; end;
  assert ok, 'لا إعادة بعد التصحيح';

  -- قياس المستوى من بنك مدرب محدد
  r := student_start_attempt(jsonb_build_object('trainee_id',v_tr,'section','boys','subject','كمي','teacher_id',t2,'count',10));
  assert (r->>'total')::int = 1 and r->>'teacher_id' = t2::text, 'المحاولة من بنك المدرب الثاني وحده';
  begin perform student_start_attempt(jsonb_build_object('trainee_id',v_tr,'section','boys','subject','كمي','teacher_id',(select id from teachers where section = 'girls' limit 1))); ok := false;
  exception when others then ok := sqlerrm like '%ليس لمدرب مقررك%'; end;
  assert ok, 'لا بنك لمدرب خارج المقرر';
  perform set_config('app.phone', '', true);

  -- تنظيف
  delete from attempts where trainee_id = v_tr; delete from submissions where trainee_id = v_tr; delete from assignments where teacher_id in (t1, t2);
  delete from questions where teacher_id in (t1, t2); delete from teachers where id in (t1, t2);
  delete from admins where user_id = v_admin; delete from auth.users where id = v_admin;
end $$;
