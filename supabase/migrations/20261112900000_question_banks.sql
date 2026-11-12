-- =====================================================================
-- بنوك أسئلة المدربين: بنك مستقل لكل مدرب (teacher_id)، تديره الإدارة (إضافة واستيراد)
-- والمدرب نفسه، ومنه: واجبات اختبار تُصحَّح آليًا، واختبار قياس المستوى من بنك مدرب المقرر.
-- مطابق لـ src/learning_logic.js (buildQuiz، gradeQuiz، bankUnitsOf، parseBank) و src/data2.js.
-- =====================================================================
alter table assignments add column if not exists kind text not null default 'text' check (kind in ('text','quiz'));
alter table assignments add column if not exists quiz jsonb;                        -- نسخة الأسئلة وقت النشر
alter table submissions add column if not exists answers jsonb;
alter table submissions add column if not exists review jsonb;                      -- الإجابات الصحيحة والتفسير بعد التسليم فقط
alter table attempts add column if not exists teacher_id uuid references teachers(id) on delete set null;
create index if not exists questions_owner on questions(teacher_id, subject, unit) where status <> 'deleted';

-- ---------- تحقق مشترك من صحة السؤال ----------
create or replace function q_check(p jsonb) returns text[] language plpgsql immutable as $$
declare v_opts text[] := array(select trim(x) from jsonb_array_elements_text(coalesce(p->'options','[]')) x);
begin
  if length(trim(coalesce(p->>'text',''))) < 5 then raise exception 'اكتب نص السؤال'; end if;
  if coalesce(array_length(v_opts,1),0) <> 4 or exists (select 1 from unnest(v_opts) o where o = '') then raise exception 'اكتب الخيارات الأربعة'; end if;
  if coalesce(nullif(p->>'correct','')::int, -1) not between 0 and 3 then raise exception 'حدد الإجابة الصحيحة'; end if;
  return v_opts;
end $$;

-- ---------- المدرب: بنكه هو فقط ----------
create or replace function teacher_save_question(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher(); v_opts text[];
begin
  if me.id is null then raise exception 'غير مصرح'; end if;
  if not (p->>'subject' = any(me.subjects)) then raise exception 'المقرر خارج نطاقك'; end if;
  v_opts := q_check(p);
  if nullif(p->>'id','') is not null then
    update questions set subject = p->>'subject', unit = coalesce(nullif(trim(p->>'unit'),''),'عام'), skill = coalesce(p->>'skill',''), text = trim(p->>'text'), options = v_opts, correct = (p->>'correct')::int,
      explanation = coalesce(p->>'explanation',''), status = case when p->>'status' = 'published' then 'published' else 'draft' end, version = version + 1
     where id = (p->>'id')::uuid and teacher_id = me.id;
    if not found then raise exception 'غير مصرح'; end if;
  else
    insert into questions(teacher_id, section, subject, unit, skill, text, options, correct, explanation, status)
    values (me.id, me.section, p->>'subject', coalesce(nullif(trim(p->>'unit'),''),'عام'), coalesce(p->>'skill',''), trim(p->>'text'), v_opts, (p->>'correct')::int, coalesce(p->>'explanation',''),
            case when p->>'status' = 'published' then 'published' else 'draft' end);
  end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function teacher_question_status(p_id uuid, p_status text) returns void language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher();
begin
  if p_status not in ('draft','published','deleted') then raise exception 'حالة غير صالحة'; end if;
  update questions set status = p_status where id = p_id and teacher_id = me.id;
  if not found then raise exception 'غير مصرح'; end if;
end $$;

-- ---------- الإدارة: بنك أي مدرب، ضمن قسمه ومقرراته ----------
create or replace function admin_save_question(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare t teachers%rowtype; v_opts text[];
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into t from teachers where id = nullif(p->>'teacher_id','')::uuid;
  if t.id is null then raise exception 'اختر المدرب'; end if;
  if not (p->>'subject' = any(t.subjects)) then raise exception 'المقرر ليس من مقررات المدرب'; end if;
  v_opts := q_check(p);
  if nullif(p->>'id','') is not null then
    update questions set teacher_id = t.id, section = t.section, subject = p->>'subject', unit = coalesce(nullif(trim(p->>'unit'),''),'عام'), skill = coalesce(p->>'skill',''), text = trim(p->>'text'),
      options = v_opts, correct = (p->>'correct')::int, explanation = coalesce(p->>'explanation',''), difficulty = coalesce(nullif(p->>'difficulty',''),'متوسط'),
      status = case when p->>'status' = 'published' then 'published' else 'draft' end, version = version + 1
     where id = (p->>'id')::uuid;
    if not found then raise exception 'السؤال غير موجود'; end if;
  else
    insert into questions(teacher_id, section, subject, unit, skill, text, options, correct, explanation, difficulty, status)
    values (t.id, t.section, p->>'subject', coalesce(nullif(trim(p->>'unit'),''),'عام'), coalesce(p->>'skill',''), trim(p->>'text'), v_opts, (p->>'correct')::int, coalesce(p->>'explanation',''),
            coalesce(nullif(p->>'difficulty',''),'متوسط'), case when p->>'status' = 'published' then 'published' else 'draft' end);
  end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function admin_question_status(p_id uuid, p_status text) returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if p_status not in ('draft','published','deleted') then raise exception 'حالة غير صالحة'; end if;
  update questions set status = p_status where id = p_id;
  if not found then raise exception 'السؤال غير موجود'; end if;
end $$;
-- استيراد دفعة واحدة: كلها أو لا شيء، مع رقم السطر عند الخطأ
create or replace function admin_import_questions(p_teacher uuid, p_rows jsonb, p_status text default 'published') returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare t teachers%rowtype; r jsonb; i int := 0; v_opts text[];
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into t from teachers where id = p_teacher;
  if t.id is null then raise exception 'اختر المدرب'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'لا توجد أسئلة صالحة للاستيراد'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'الحد 2000 سؤال في المرة الواحدة'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    if not (r->>'subject' = any(t.subjects)) then raise exception 'السطر %: المقرر ليس من مقررات المدرب', i; end if;
    begin v_opts := q_check(r); exception when others then raise exception 'السطر %: %', i, sqlerrm; end;
    insert into questions(teacher_id, section, subject, unit, skill, text, options, correct, explanation, difficulty, status)
    values (t.id, t.section, r->>'subject', coalesce(nullif(trim(r->>'unit'),''),'عام'), coalesce(r->>'skill',''), trim(r->>'text'), v_opts, (r->>'correct')::int, coalesce(r->>'explanation',''),
            case when r->>'difficulty' in ('سهل','متوسط','صعب') then r->>'difficulty' else 'متوسط' end, case when p_status = 'draft' then 'draft' else 'published' end);
  end loop;
  return jsonb_build_object('count', i);
end $$;

-- ---------- واجب كتابي أو اختبار من بنك المدرب ----------
create or replace function teacher_save_assignment(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher(); v_quiz jsonb; v_n int := greatest(1, least(coalesce(nullif(p->>'count','')::int, 10), 50));
begin
  if me.id is null then raise exception 'غير مصرح'; end if;
  if not (p->>'subject' = any(me.subjects)) then raise exception 'المقرر خارج نطاقك'; end if;
  if length(trim(coalesce(p->>'title',''))) < 3 then raise exception 'اكتب عنوان الواجب'; end if;
  if (p->>'due_date')::date < (p->>'publish_date')::date then raise exception 'تاريخ الاستحقاق يجب أن يكون بعد تاريخ النشر'; end if;
  if nullif(p->>'id','') is not null then
    update assignments set title = trim(p->>'title'), body = left(coalesce(p->>'body',''),4000), subject = case when kind = 'quiz' then subject else p->>'subject' end,
      publish_date = (p->>'publish_date')::date, due_date = (p->>'due_date')::date, max_score = coalesce((p->>'max_score')::numeric, 10)
     where id = (p->>'id')::uuid and teacher_id = me.id;
    if not found then raise exception 'غير مصرح'; end if;
    return jsonb_build_object('ok', true);
  end if;
  if p->>'kind' = 'quiz' then
    select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'options', to_jsonb(options), 'correct', correct, 'explanation', explanation, 'skill', skill, 'version', version))
      into v_quiz from (select * from questions where teacher_id = me.id and status = 'published' and subject = p->>'subject'
                         and (nullif(p->>'unit','') is null or unit = p->>'unit') order by random() limit v_n) q;
    if v_quiz is null then raise exception 'لا توجد أسئلة منشورة في بنكك لهذا المقرر'; end if;
  end if;
  insert into assignments(teacher_id, section, subject, title, body, publish_date, due_date, max_score, kind, quiz)
  values (me.id, me.section, p->>'subject', trim(p->>'title'), left(coalesce(p->>'body',''),4000), (p->>'publish_date')::date, (p->>'due_date')::date,
          coalesce((p->>'max_score')::numeric, 10), case when v_quiz is null then 'text' else 'quiz' end, v_quiz);
  return jsonb_build_object('ok', true);
end $$;

create or replace function student_submit(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a assignments%rowtype; v_tr uuid := (p->>'trainee_id')::uuid; v_draft boolean := coalesce((p->>'draft')::boolean, false); v_ans text := trim(coalesce(p->>'answer',''));
        s submissions%rowtype; q jsonb; v int; v_right int := 0; v_total int; v_map jsonb := '{}'; v_rev jsonb := '[]'; v_score numeric;
begin
  if not student_owns(v_tr) then raise exception 'غير مصرح'; end if;
  select * into a from assignments where id = (p->>'assignment_id')::uuid;
  if a.id is null or a.publish_date > riyadh_now()::date or not trainee_in_scope(v_tr, a.section, a.subject) then raise exception 'الواجب غير متاح لك'; end if;
  select * into s from submissions where assignment_id = a.id and trainee_id = v_tr;
  if s.status = 'graded' then raise exception 'صُحّح الواجب ولا يمكن تعديله'; end if;
  if a.kind = 'quiz' then
    v_total := jsonb_array_length(a.quiz);
    for q in select * from jsonb_array_elements(a.quiz) loop
      v := case when (p->'answers'->>(q->>'id')) ~ '^[0-3]$' then (p->'answers'->>(q->>'id'))::int end;
      v_map := v_map || jsonb_build_object(q->>'id', v);
      v_rev := v_rev || jsonb_build_array(jsonb_build_object('id', q->>'id', 'correct', (q->>'correct')::int, 'explanation', coalesce(q->>'explanation','')));
      if v = (q->>'correct')::int then v_right := v_right + 1; end if;
    end loop;
    v_score := round(v_right::numeric / v_total * a.max_score, 1);
    insert into submissions(assignment_id, trainee_id, answer, answers, review, status, score, feedback, submitted_at, graded_at, late)
    values (a.id, v_tr, '', v_map, v_rev, 'graded', v_score, format('أجبت %s من %s إجابة صحيحة', v_right, v_total), now(), now(), riyadh_now()::date > a.due_date)
    on conflict (assignment_id, trainee_id) do update set answers = excluded.answers, review = excluded.review, status = 'graded', score = excluded.score,
      feedback = excluded.feedback, submitted_at = excluded.submitted_at, graded_at = excluded.graded_at, late = excluded.late;
    return jsonb_build_object('ok', true, 'right', v_right, 'total', v_total, 'score', v_score);
  end if;
  if not v_draft and v_ans = '' then raise exception 'اكتب إجابتك قبل الإرسال'; end if;
  insert into submissions(assignment_id, trainee_id, answer, status, submitted_at, late)
  values (a.id, v_tr, left(v_ans,6000), case when v_draft then 'draft' else 'submitted' end, case when v_draft then null else now() end, not v_draft and riyadh_now()::date > a.due_date)
  on conflict (assignment_id, trainee_id) do update set answer = excluded.answer, status = excluded.status, submitted_at = excluded.submitted_at, late = excluded.late;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- قياس المستوى من بنك مدرب المقرر ----------
create or replace function student_start_attempt(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tr uuid := (p->>'trainee_id')::uuid; v_snap jsonb; v_n int := greatest(1, least(coalesce((p->>'count')::int, 10), 50)); at attempts%rowtype;
        v_t uuid := nullif(p->>'teacher_id','')::uuid;
begin
  if not student_owns(v_tr) then raise exception 'غير مصرح'; end if;
  if not trainee_in_scope(v_tr, p->>'section', p->>'subject') then raise exception 'هذا المقرر ليس ضمن اشتراكك'; end if;
  if v_t is not null and not exists (select 1 from teachers where id = v_t and active and section = p->>'section' and p->>'subject' = any(subjects)) then
    raise exception 'هذا البنك ليس لمدرب مقررك'; end if;
  select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'options', to_jsonb(options), 'correct', correct, 'explanation', explanation, 'skill', skill, 'version', version))
    into v_snap from (select * from questions where status = 'published' and section = p->>'section' and subject = p->>'subject'
                       and (v_t is null or teacher_id = v_t) and (nullif(p->>'unit','') is null or unit = p->>'unit') order by random() limit v_n) q;
  if v_snap is null then raise exception 'لا توجد أسئلة منشورة في هذه الوحدة بعد'; end if;
  insert into attempts(trainee_id, teacher_id, section, subject, unit, minutes, snapshot, total)
  values (v_tr, v_t, p->>'section', p->>'subject', nullif(p->>'unit',''), greatest(5, jsonb_array_length(v_snap) * 2), v_snap, jsonb_array_length(v_snap)) returning * into at;
  return attempt_public(at);
end $$;

-- ---------- بيانات البوابة: بنك المدرب له وحده، والاختبارات بلا إجابات للمتدرب ----------
alter function portal_data(text) rename to portal_data_program;
revoke execute on function portal_data_program(text) from anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_program(p_role); me teachers := me_teacher(); ids uuid[];
begin
  if base is null then return null; end if;
  select coalesce(array_agg((x->>'id')::uuid), '{}') into ids from jsonb_array_elements(coalesce(base->'trainees','[]')) x;
  if p_role = 'teacher' then
    return base || jsonb_build_object(
      'questions', coalesce((select jsonb_agg(to_jsonb(q) || jsonb_build_object('options', to_jsonb(q.options))) from questions q where q.teacher_id = me.id and q.status <> 'deleted'), '[]'),
      'attempts', coalesce((select jsonb_agg(to_jsonb(a)) from attempts a where a.trainee_id = any(ids) and a.submitted_at is not null
          and (a.teacher_id = me.id or (a.teacher_id is null and a.section = me.section and a.subject = any(me.subjects)))), '[]'));
  end if;
  return base || jsonb_build_object(
    'assignments', coalesce((select jsonb_agg(case when x->>'kind' = 'quiz'
        then x || jsonb_build_object('quiz', (select jsonb_agg(q - 'correct' - 'explanation') from jsonb_array_elements(x->'quiz') q)) else x end)
      from jsonb_array_elements(coalesce(base->'assignments','[]')) x), '[]'),
    'bank_units', coalesce((select jsonb_agg(jsonb_build_object('section', section, 'subject', subject, 'unit', unit, 'teacher_id', teacher_id, 'teacher_name', full_name, 'count', n)
        order by subject, full_name, unit) from (
      select q.section, q.subject, q.unit, q.teacher_id, t.full_name, count(*) n from questions q join teachers t on t.id = q.teacher_id and t.active
       where q.status = 'published' and t.section = q.section and q.subject = any(t.subjects)
         and exists (select 1 from subscriptions s where s.trainee_id = any(ids) and s.section = q.section and q.subject = any(s.subjects))
       group by 1,2,3,4,5) u), '[]'));
end $$;

revoke execute on function q_check(jsonb), admin_save_question(jsonb), admin_question_status(uuid, text), admin_import_questions(uuid, jsonb, text), portal_data(text) from anon;
grant execute on function admin_save_question(jsonb), admin_question_status(uuid, text), admin_import_questions(uuid, jsonb, text), portal_data(text) to authenticated;
