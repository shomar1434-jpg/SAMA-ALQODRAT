-- =====================================================================
-- الخطوات 10–12: الواجبات، وبنوك الأسئلة واختبار قياس المستوى، وتقييم المدرب، والمراسلة.
-- النطاق: القسم × المقرر، ويُتحقق منه في كل دالة (مطابق لـ src/learning_logic.js).
-- =====================================================================
create table if not exists assignments (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references teachers(id) on delete restrict,
  section text not null check (section in ('girls','boys')), subject text not null, title text not null, body text not null default '',
  publish_date date not null, due_date date not null check (due_date >= publish_date), max_score numeric not null default 10, created_at timestamptz not null default now()
);
create table if not exists submissions (
  id uuid primary key default gen_random_uuid(), assignment_id uuid not null references assignments(id) on delete restrict,
  trainee_id uuid not null references trainees(id) on delete restrict, answer text not null default '',
  status text not null check (status in ('draft','submitted','needs_revision','graded')), late boolean not null default false,
  score numeric, feedback text, submitted_at timestamptz, graded_at timestamptz, unique (assignment_id, trainee_id)
);
create table if not exists questions (
  id uuid primary key default gen_random_uuid(), teacher_id uuid references teachers(id) on delete set null,
  section text not null check (section in ('girls','boys')), subject text not null, unit text not null default 'عام', skill text not null default '',
  text text not null, options text[] not null check (array_length(options, 1) = 4), correct int not null check (correct between 0 and 3),
  explanation text not null default '', difficulty text not null default 'متوسط', status text not null default 'draft' check (status in ('draft','published','deleted')),
  version int not null default 1, created_at timestamptz not null default now()
);
create index if not exists questions_bank on questions(section, subject, unit) where status = 'published';
create table if not exists attempts (
  id uuid primary key default gen_random_uuid(), trainee_id uuid not null references trainees(id) on delete restrict,
  section text not null, subject text not null, unit text, minutes int not null, snapshot jsonb not null,           -- نسخة الأسئلة وقت المحاولة
  answers jsonb not null default '{}', score int, total int not null, skills jsonb, started_at timestamptz not null default now(), submitted_at timestamptz
);
create table if not exists ratings (
  id uuid primary key default gen_random_uuid(), trainee_id uuid not null references trainees(id) on delete restrict, teacher_id uuid not null references teachers(id) on delete restrict,
  period text not null, stars int not null check (stars between 1 and 5), items jsonb not null default '{}', comment text not null default '', comment_status text not null default 'visible',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (trainee_id, teacher_id, period)
);
create table if not exists messages (
  id uuid primary key default gen_random_uuid(), trainee_id uuid not null references trainees(id) on delete restrict, teacher_id uuid not null references teachers(id) on delete restrict,
  "from" text not null check ("from" in ('student','teacher')), text text not null check (length(text) between 1 and 1000), at timestamptz not null default now(), read_at timestamptz
);
create index if not exists messages_thread on messages(trainee_id, teacher_id, at);
do $$ declare t text; begin
  foreach t in array array['assignments','submissions','questions','attempts','ratings','messages'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I_admin on %I', t, t);
    execute format('create policy %I_admin on %I for all using (is_admin()) with check (is_admin())', t, t);
  end loop; end $$;

-- ---------- أدوات النطاق ----------
create or replace function me_teacher() returns teachers language sql stable security definer set search_path = public as $$
  select * from teachers where active and phone = my_phone() limit 1;
$$;
create or replace function student_owns(p_trainee uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from trainees where id = p_trainee and phone = my_phone());
$$;
create or replace function trainee_in_scope(p_trainee uuid, p_section text, p_subject text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from subscriptions s where s.trainee_id = p_trainee and sub_live(s, riyadh_now()::date) and s.section = p_section and p_subject = any(s.subjects));
$$;
create or replace function teacher_teaches(p_teacher teachers, p_trainee uuid) returns boolean language sql stable security definer set search_path = public as $$
  select p_teacher.id is not null and exists (select 1 from subscriptions s where s.trainee_id = p_trainee and sub_live(s, riyadh_now()::date) and s.section = p_teacher.section and s.subjects && p_teacher.subjects);
$$;

-- ---------- المدرب ----------
create or replace function teacher_save_assignment(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher();
begin
  if me.id is null then raise exception 'غير مصرح'; end if;
  if not (p->>'subject' = any(me.subjects)) then raise exception 'المقرر خارج نطاقك'; end if;
  if length(trim(coalesce(p->>'title',''))) < 3 then raise exception 'اكتب عنوان الواجب'; end if;
  if nullif(p->>'id','') is not null then
    update assignments set title = trim(p->>'title'), body = left(coalesce(p->>'body',''),4000), subject = p->>'subject', publish_date = (p->>'publish_date')::date, due_date = (p->>'due_date')::date, max_score = coalesce((p->>'max_score')::numeric, 10)
     where id = (p->>'id')::uuid and teacher_id = me.id;
    if not found then raise exception 'غير مصرح'; end if;
  else
    insert into assignments(teacher_id, section, subject, title, body, publish_date, due_date, max_score)
    values (me.id, me.section, p->>'subject', trim(p->>'title'), left(coalesce(p->>'body',''),4000), (p->>'publish_date')::date, (p->>'due_date')::date, coalesce((p->>'max_score')::numeric, 10));
  end if;
  return jsonb_build_object('ok', true);
end $$;

create or replace function teacher_grade(p_id uuid, p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher(); a assignments%rowtype; v_score numeric := nullif(p->>'score','')::numeric;
begin
  select a2.* into a from submissions s join assignments a2 on a2.id = s.assignment_id where s.id = p_id and a2.teacher_id = me.id;
  if a.id is null then raise exception 'غير مصرح'; end if;
  if p->>'status' not in ('graded','needs_revision') then raise exception 'حالة غير صالحة'; end if;
  if v_score is not null and (v_score < 0 or v_score > a.max_score) then raise exception 'الدرجة من 0 إلى %', a.max_score; end if;
  update submissions set status = p->>'status', score = v_score, feedback = left(coalesce(p->>'feedback',''),1000), graded_at = now() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function teacher_save_question(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher(); v_opts text[] := array(select jsonb_array_elements_text(p->'options'));
begin
  if me.id is null then raise exception 'غير مصرح'; end if;
  if not (p->>'subject' = any(me.subjects)) then raise exception 'المقرر خارج نطاقك'; end if;
  if length(trim(coalesce(p->>'text',''))) < 5 then raise exception 'اكتب نص السؤال'; end if;
  if array_length(v_opts,1) <> 4 or exists (select 1 from unnest(v_opts) o where trim(o) = '') then raise exception 'اكتب الخيارات الأربعة'; end if;
  if coalesce((p->>'correct')::int, -1) not between 0 and 3 then raise exception 'حدد الإجابة الصحيحة'; end if;
  if nullif(p->>'id','') is not null then
    update questions set subject = p->>'subject', unit = coalesce(nullif(trim(p->>'unit'),''),'عام'), skill = coalesce(p->>'skill',''), text = trim(p->>'text'), options = v_opts, correct = (p->>'correct')::int,
      explanation = coalesce(p->>'explanation',''), status = case when p->>'status' = 'published' then 'published' else 'draft' end, version = version + 1
     where id = (p->>'id')::uuid and section = me.section and subject = any(me.subjects);
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
  update questions set status = p_status where id = p_id and section = me.section and subject = any(me.subjects);
  if not found then raise exception 'غير مصرح'; end if;
end $$;

-- ---------- المتدرب ----------
create or replace function student_submit(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare a assignments%rowtype; v_tr uuid := (p->>'trainee_id')::uuid; v_draft boolean := coalesce((p->>'draft')::boolean, false); v_ans text := trim(coalesce(p->>'answer','')); s submissions%rowtype;
begin
  if not student_owns(v_tr) then raise exception 'غير مصرح'; end if;
  select * into a from assignments where id = (p->>'assignment_id')::uuid;
  if a.id is null or a.publish_date > riyadh_now()::date or not trainee_in_scope(v_tr, a.section, a.subject) then raise exception 'الواجب غير متاح لك'; end if;
  select * into s from submissions where assignment_id = a.id and trainee_id = v_tr;
  if s.status = 'graded' then raise exception 'صُحّح الواجب ولا يمكن تعديله'; end if;
  if not v_draft and v_ans = '' then raise exception 'اكتب إجابتك قبل الإرسال'; end if;
  insert into submissions(assignment_id, trainee_id, answer, status, submitted_at, late)
  values (a.id, v_tr, left(v_ans,6000), case when v_draft then 'draft' else 'submitted' end, case when v_draft then null else now() end, not v_draft and riyadh_now()::date > a.due_date)
  on conflict (assignment_id, trainee_id) do update set answer = excluded.answer, status = excluded.status, submitted_at = excluded.submitted_at, late = excluded.late;
  return jsonb_build_object('ok', true);
end $$;

create or replace function attempt_public(at attempts) returns jsonb language sql immutable as $$
  select case when at.submitted_at is not null then to_jsonb(at)
    else to_jsonb(at) || jsonb_build_object('snapshot', (select jsonb_agg(q - 'correct' - 'explanation') from jsonb_array_elements(at.snapshot) q)) end;
$$;
create or replace function student_start_attempt(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tr uuid := (p->>'trainee_id')::uuid; v_snap jsonb; v_n int := greatest(1, least(coalesce((p->>'count')::int, 10), 50)); at attempts%rowtype;
begin
  if not student_owns(v_tr) then raise exception 'غير مصرح'; end if;
  if not trainee_in_scope(v_tr, p->>'section', p->>'subject') then raise exception 'هذا المقرر ليس ضمن اشتراكك'; end if;
  select jsonb_agg(jsonb_build_object('id', id, 'text', text, 'options', to_jsonb(options), 'correct', correct, 'explanation', explanation, 'skill', skill, 'version', version))
    into v_snap from (select * from questions where status = 'published' and section = p->>'section' and subject = p->>'subject' and (nullif(p->>'unit','') is null or unit = p->>'unit') order by random() limit v_n) q;
  if v_snap is null then raise exception 'لا توجد أسئلة منشورة في هذه الوحدة بعد'; end if;
  insert into attempts(trainee_id, section, subject, unit, minutes, snapshot, total)
  values (v_tr, p->>'section', p->>'subject', nullif(p->>'unit',''), jsonb_array_length(v_snap) * 2, v_snap, jsonb_array_length(v_snap)) returning * into at;
  return attempt_public(at);
end $$;
create or replace function student_finish_attempt(p_id uuid, p_answers jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare at attempts%rowtype; v_ans jsonb := '{}'; v_score int := 0; q jsonb; v int; v_sk jsonb := '{}'; k text;
begin
  select * into at from attempts where id = p_id;
  if at.id is null or not student_owns(at.trainee_id) then raise exception 'غير مصرح'; end if;
  if at.submitted_at is not null then return to_jsonb(at); end if;
  for q in select * from jsonb_array_elements(at.snapshot) loop
    v := case when (p_answers->>(q->>'id')) ~ '^[0-3]$' then (p_answers->>(q->>'id'))::int end;
    v_ans := v_ans || jsonb_build_object(q->>'id', v);
    k := coalesce(nullif(q->>'skill',''), 'عام');
    v_sk := jsonb_set(v_sk, array[k], jsonb_build_object('total', coalesce((v_sk->k->>'total')::int,0) + 1, 'right', coalesce((v_sk->k->>'right')::int,0) + case when v = (q->>'correct')::int then 1 else 0 end));
    if v = (q->>'correct')::int then v_score := v_score + 1; end if;
  end loop;
  update attempts set answers = v_ans, score = v_score, skills = v_sk, submitted_at = now() where id = p_id returning * into at;
  return to_jsonb(at);
end $$;

create or replace function student_rate(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tr uuid := (p->>'trainee_id')::uuid; t teachers%rowtype; v_days int; v_st int := round((p->>'stars')::numeric); v_per text := to_char(riyadh_now(), 'YYYY-MM'); v_upd boolean;
begin
  if not student_owns(v_tr) then raise exception 'غير مصرح'; end if;
  select * into t from teachers where id = (p->>'teacher_id')::uuid and active;
  if not teacher_teaches(t, v_tr) then raise exception 'المدرب لا يدرّسك في اشتراك قائم'; end if;
  select count(distinct att_date) into v_days from sub_attendance where trainee_id = v_tr;
  if v_days < 3 then raise exception 'يُتاح التقييم بعد حضور 3 أيام على الأقل'; end if;
  if v_st is null or v_st not between 1 and 5 then raise exception 'اختر من نجمة إلى خمس نجوم'; end if;
  v_upd := exists (select 1 from ratings where trainee_id = v_tr and teacher_id = t.id and period = v_per);
  insert into ratings(trainee_id, teacher_id, period, stars, items, comment) values (v_tr, t.id, v_per, v_st, coalesce(p->'items','{}'), left(coalesce(p->>'comment',''),500))
  on conflict (trainee_id, teacher_id, period) do update set stars = excluded.stars, items = excluded.items, comment = excluded.comment, updated_at = now();
  return jsonb_build_object('ok', true, 'updated', v_upd);
end $$;

-- ---------- المراسلة ----------
create or replace function send_message(p jsonb, p_role text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tr uuid := (p->>'trainee_id')::uuid; t teachers%rowtype; v_text text := trim(coalesce(p->>'text',''));
begin
  if v_text = '' or length(v_text) > 1000 then raise exception 'الرسالة فارغة أو أطول من 1000 حرف'; end if;
  if p_role = 'teacher' then t := me_teacher(); if t.id is null or t.id <> (p->>'teacher_id')::uuid or not teacher_teaches(t, v_tr) then raise exception 'المتدرب ليس ضمن متدربيك'; end if;
  else if not student_owns(v_tr) then raise exception 'غير مصرح'; end if; select * into t from teachers where id = (p->>'teacher_id')::uuid and active;
       if not teacher_teaches(t, v_tr) then raise exception 'المدرب لا يدرّسك'; end if; end if;
  insert into messages(trainee_id, teacher_id, "from", text) values (v_tr, t.id, case when p_role = 'teacher' then 'teacher' else 'student' end, v_text);
  return jsonb_build_object('ok', true);
end $$;
create or replace function mark_thread_read(p_trainee uuid, p_teacher uuid, p_role text) returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if (p_role = 'teacher' and (me_teacher()).id = p_teacher) or (p_role = 'student' and student_owns(p_trainee)) then
    update messages set read_at = now() where trainee_id = p_trainee and teacher_id = p_teacher and "from" <> p_role and read_at is null;
  end if;
end $$;

-- ---------- توسيع بيانات البوابة ----------
alter function portal_data(text) rename to portal_data_base;
revoke execute on function portal_data_base(text) from anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_base(p_role); me teachers := me_teacher(); ids uuid[];
begin
  if p_role = 'teacher' then
    select coalesce(array_agg((x->>'id')::uuid), '{}') into ids from jsonb_array_elements(base->'trainees') x;
    return base || jsonb_build_object(
      'assignments', coalesce((select jsonb_agg(to_jsonb(a)) from assignments a where a.teacher_id = me.id), '[]'),
      'submissions', coalesce((select jsonb_agg(to_jsonb(s)) from submissions s join assignments a on a.id = s.assignment_id where a.teacher_id = me.id and s.trainee_id = any(ids)), '[]'),
      'questions', coalesce((select jsonb_agg(to_jsonb(q) || jsonb_build_object('options', to_jsonb(q.options))) from questions q where q.section = me.section and q.subject = any(me.subjects) and q.status <> 'deleted'), '[]'),
      'attempts', coalesce((select jsonb_agg(to_jsonb(a)) from attempts a where a.trainee_id = any(ids) and a.section = me.section and a.subject = any(me.subjects) and a.submitted_at is not null), '[]'),
      'messages', coalesce((select jsonb_agg(to_jsonb(m)) from messages m where m.teacher_id = me.id), '[]'),
      'rating_summary', (select jsonb_build_object('count', count(*), 'stars', round(avg(stars)::numeric, 1),
          'items', jsonb_build_object('clarity', round(avg((items->>'clarity')::numeric),1), 'interaction', round(avg((items->>'interaction')::numeric),1), 'commitment', round(avg((items->>'commitment')::numeric),1), 'usefulness', round(avg((items->>'usefulness')::numeric),1)),
          'comments', coalesce(jsonb_agg(jsonb_build_object('text', comment, 'period', period)) filter (where comment <> '' and comment_status = 'visible'), '[]')) from ratings where teacher_id = me.id));
  end if;
  select coalesce(array_agg((x->>'id')::uuid), '{}') into ids from jsonb_array_elements(base->'trainees') x;
  return base || jsonb_build_object(
    'assignments', coalesce((select jsonb_agg(to_jsonb(a)) from assignments a where exists (select 1 from subscriptions s where s.trainee_id = any(ids) and s.section = a.section and a.subject = any(s.subjects))), '[]'),
    'submissions', coalesce((select jsonb_agg(to_jsonb(s)) from submissions s where s.trainee_id = any(ids)), '[]'),
    'bank_units', coalesce((select jsonb_agg(jsonb_build_object('section', section, 'subject', subject, 'unit', unit, 'count', n)) from (
        select q.section, q.subject, q.unit, count(*) n from questions q where q.status = 'published'
          and exists (select 1 from subscriptions s where s.trainee_id = any(ids) and s.section = q.section and q.subject = any(s.subjects)) group by 1,2,3) u), '[]'),
    'attempts', coalesce((select jsonb_agg(attempt_public(a)) from attempts a where a.trainee_id = any(ids)), '[]'),
    'ratings', coalesce((select jsonb_agg(to_jsonb(r)) from ratings r where r.trainee_id = any(ids)), '[]'),
    'messages', coalesce((select jsonb_agg(to_jsonb(m)) from messages m where m.trainee_id = any(ids)), '[]'));
end $$;

revoke execute on function teacher_save_assignment(jsonb), teacher_grade(uuid, jsonb), teacher_save_question(jsonb), teacher_question_status(uuid, text), student_submit(jsonb),
  student_start_attempt(jsonb), student_finish_attempt(uuid, jsonb), student_rate(jsonb), send_message(jsonb, text), mark_thread_read(uuid, uuid, text), portal_data(text) from anon;
grant execute on function teacher_save_assignment(jsonb), teacher_grade(uuid, jsonb), teacher_save_question(jsonb), teacher_question_status(uuid, text), student_submit(jsonb),
  student_start_attempt(jsonb), student_finish_attempt(uuid, jsonb), student_rate(jsonb), send_message(jsonb, text), mark_thread_read(uuid, uuid, text), portal_data(text) to authenticated;
