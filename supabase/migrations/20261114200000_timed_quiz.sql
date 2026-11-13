-- =====================================================================
-- الخطوة V — الاختبار يُفتح مرة واحدة بمدة دقيقتين لكل سؤال (قرار المالك):
-- أسئلة الاختبار لا تُرسل للمتدرب قبل أن يبدأ؛ البدء مرة واحدة ويبدأ معه العدّ؛ تُحفظ الإجابات أولًا بأول؛
-- وعند انتهاء الوقت يُصحَّح ما حُفظ (مهمة مجدولة كل دقيقة) ولا تُعاد المحاولة. مطابق لـ src/learning_logic.js (quizMinutes، quizOpen).
-- =====================================================================
alter table submissions add column if not exists started_at timestamptz;
alter table submissions add column if not exists deadline timestamptz;

create or replace function quiz_finalize(p_sub uuid, p_extra jsonb default null) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare s submissions; a assignments; q jsonb; v int; v_right int := 0; v_total int; v_map jsonb := '{}'; v_rev jsonb := '[]'; v_score numeric; v_ans jsonb;
begin
  select * into s from submissions where id = p_sub for update;
  select * into a from assignments where id = s.assignment_id;
  if s.id is null or a.kind <> 'quiz' or s.status = 'graded' then return jsonb_build_object('ok', false); end if;
  v_ans := coalesce(s.answers, '{}') || coalesce(p_extra, '{}'); v_total := jsonb_array_length(a.quiz);
  for q in select * from jsonb_array_elements(a.quiz) loop
    v := case when (v_ans->>(q->>'id')) ~ '^[0-3]$' then (v_ans->>(q->>'id'))::int end;
    v_map := v_map || jsonb_build_object(q->>'id', v);
    v_rev := v_rev || jsonb_build_array(jsonb_build_object('id', q->>'id', 'correct', (q->>'correct')::int, 'explanation', coalesce(q->>'explanation','')));
    if v = (q->>'correct')::int then v_right := v_right + 1; end if;
  end loop;
  v_score := round(v_right::numeric / v_total * a.max_score, 1);
  update submissions set answers = v_map, review = v_rev, status = 'graded', score = v_score, feedback = format('أجبت %s من %s إجابة صحيحة', v_right, v_total),
    submitted_at = now(), graded_at = now(), late = riyadh_now()::date > a.due_date where id = s.id;
  return jsonb_build_object('ok', true, 'right', v_right, 'total', v_total, 'score', v_score);
end $$;
revoke execute on function quiz_finalize(uuid, jsonb) from public, anon, authenticated;

create or replace function quiz_access(p_tr uuid, p_as uuid) returns assignments language plpgsql stable security definer set search_path = public as $$
declare a assignments;
begin
  if not student_owns(p_tr) then raise exception 'غير مصرح'; end if;
  select * into a from assignments where id = p_as;
  if a.id is null or a.publish_date > riyadh_now()::date or not trainee_in_scope(p_tr, a.section, a.subject) or (a.targets is not null and not (p_tr = any(a.targets))) then raise exception 'الواجب غير متاح لك'; end if;
  return a;
end $$;
revoke execute on function quiz_access(uuid, uuid) from public, anon, authenticated;

-- البدء: مرة واحدة فقط
create or replace function student_start_quiz(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tr uuid := (p->>'trainee_id')::uuid; a assignments := quiz_access(v_tr, (p->>'assignment_id')::uuid); s submissions;
begin
  if a.kind <> 'quiz' then raise exception 'الواجب غير متاح لك'; end if;
  select * into s from submissions where assignment_id = a.id and trainee_id = v_tr;
  if s.id is not null then return jsonb_build_object('started_at', s.started_at, 'deadline', s.deadline, 'status', s.status, 'again', true); end if;
  insert into submissions(assignment_id, trainee_id, answer, answers, status, started_at, deadline)
  values (a.id, v_tr, '', '{}', 'draft', now(), now() + make_interval(mins => jsonb_array_length(a.quiz) * 2)) returning * into s;
  return jsonb_build_object('started_at', s.started_at, 'deadline', s.deadline, 'status', 'draft');
end $$;
create or replace function student_save_quiz_answer(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tr uuid := (p->>'trainee_id')::uuid; a assignments := quiz_access(v_tr, (p->>'assignment_id')::uuid); s submissions;
begin
  select * into s from submissions where assignment_id = a.id and trainee_id = v_tr for update;
  if s.id is null or s.status <> 'draft' or s.deadline is null or now() > s.deadline + interval '20 seconds' then raise exception 'انتهى وقت الاختبار'; end if;
  if coalesce(p->>'value','') !~ '^[0-3]$' or not exists (select 1 from jsonb_array_elements(a.quiz) q where q->>'id' = p->>'question_id') then raise exception 'إجابة غير صالحة'; end if;
  update submissions set answers = coalesce(answers, '{}') || jsonb_build_object(p->>'question_id', (p->>'value')::int) where id = s.id;
  return jsonb_build_object('ok', true);
end $$;
-- التسليم: الاختبار يُصحَّح مما حُفظ داخل الوقت؛ ولا يُقبل دون بدء
create or replace function student_submit(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tr uuid := nullif(p->>'trainee_id','')::uuid; a assignments := quiz_access(v_tr, nullif(p->>'assignment_id','')::uuid); s submissions;
begin
  if a.kind <> 'quiz' then return student_submit_untargeted(p); end if;
  select * into s from submissions where assignment_id = a.id and trainee_id = v_tr;
  if s.id is null then raise exception 'ابدأ الاختبار أولًا'; end if;
  if s.status = 'graded' then raise exception 'صُحّح الواجب ولا يمكن تعديله'; end if;
  return quiz_finalize(s.id, case when s.deadline is not null and now() <= s.deadline + interval '20 seconds' then p->'answers' end);
end $$;
-- تصحيح ما انتهى وقته ولم يُسلَّم
create or replace function finalize_expired_quizzes() returns int language plpgsql volatile security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in select s.id from submissions s join assignments a on a.id = s.assignment_id where a.kind = 'quiz' and s.status = 'draft' and s.deadline is not null and now() > s.deadline + interval '20 seconds' loop
    perform quiz_finalize(r.id, null); n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function student_start_quiz(jsonb), student_save_quiz_answer(jsonb), student_submit(jsonb), finalize_expired_quizzes() from public, anon;
grant execute on function student_start_quiz(jsonb), student_save_quiz_answer(jsonb), student_submit(jsonb) to authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sama-finalize-quizzes', '* * * * *', 'select public.finalize_expired_quizzes()');
  end if;
end $$;

-- بيانات البوابة: أسئلة الاختبار لا تُرسل قبل البدء
alter function portal_data(text) rename to portal_data_trainer;
revoke execute on function portal_data_trainer(text) from public, anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_trainer(p_role); ph text := my_phone(); ids uuid[];
begin
  if base is null or p_role not in ('student','guardian') then return base; end if;
  if p_role = 'student' then select coalesce(array_agg(id), '{}') into ids from trainees where phone = ph;
  else select coalesce(array_agg(trainee_id), '{}') into ids from guardian_links where guardian_phone = ph and status = 'verified'; end if;
  return base || jsonb_build_object('assignments', coalesce((select jsonb_agg(case when x->>'kind' = 'quiz' then
      (case when exists (select 1 from submissions s where s.assignment_id = (x->>'id')::uuid and s.trainee_id = any(ids)) then x else x || jsonb_build_object('quiz', null) end)
        || jsonb_build_object('quiz_count', jsonb_array_length(x->'quiz'), 'quiz_minutes', jsonb_array_length(x->'quiz') * 2)
      else x end) from jsonb_array_elements(coalesce(base->'assignments','[]')) x), '[]'));
end $$;
revoke execute on function portal_data(text) from public, anon;
grant execute on function portal_data(text) to authenticated;
