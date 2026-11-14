-- =====================================================================
-- الخطوة X — تكملة وثيقة المدربين: سيرة المدرب مع صورته، مجموعات المدرب المحفوظة، وحد المحاولات للاختبار
-- (يحدده المدرب 1–3؛ تُحتسب أعلى درجة، ولا تظهر الإجابات قبل آخر محاولة). مطابق لـ src/trainer_logic.js و src/learning_logic.js.
-- =====================================================================
alter table teachers add column if not exists cv text not null default '' check (length(cv) <= 2000);

create or replace function teacher_save_profile(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher();
begin
  if me.id is null then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(p->>'bio',''))) > 600 then raise exception 'النبذة أطول من 600 حرف'; end if;
  if length(btrim(coalesce(p->>'cv',''))) > 2000 then raise exception 'السيرة أطول من 2000 حرف'; end if;
  if coalesce(p->>'telegram','') <> '' and p->>'telegram' !~ '^https://t\.me/[A-Za-z0-9_+/-]{3,80}$' then raise exception 'رابط تيليجرام يبدأ بـ https://t.me/'; end if;
  update teachers set bio = btrim(coalesce(p->>'bio','')), telegram = btrim(coalesce(p->>'telegram','')), avatar = coalesce(p->>'avatar',''), cv = btrim(coalesce(p->>'cv','')) where id = me.id;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- مجموعات المدرب المحفوظة ----------
create table if not exists trainer_groups (
  id uuid primary key default gen_random_uuid(), teacher_id uuid not null references teachers(id) on delete cascade,
  name text not null check (length(name) between 2 and 60), trainee_ids uuid[] not null check (cardinality(trainee_ids) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists trainer_groups_teacher on trainer_groups(teacher_id);
alter table trainer_groups enable row level security;
drop policy if exists trainer_groups_admin on trainer_groups;
create policy trainer_groups_admin on trainer_groups for select using (is_admin());

create or replace function teacher_save_group(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher(); v_name text := btrim(coalesce(p->>'name','')); v_ids uuid[];
begin
  if me.id is null then raise exception 'غير مصرح'; end if;
  if length(v_name) < 2 or length(v_name) > 60 then raise exception 'اسم المجموعة من حرفين إلى 60 حرفًا'; end if;
  if jsonb_typeof(p->'trainee_ids') = 'array' then select array_agg(distinct x::uuid) into v_ids from jsonb_array_elements_text(p->'trainee_ids') x; end if;
  if v_ids is null then raise exception 'اختر متدربًا واحدًا على الأقل'; end if;
  if cardinality(v_ids) > 500 then raise exception 'الحد 500 متدرب'; end if;
  if exists (select 1 from unnest(v_ids) t where not teacher_teaches(me, t)) then raise exception 'أحد المتدربين ليس ضمن متدربيك'; end if;
  if nullif(p->>'id','') is not null then
    update trainer_groups set name = v_name, trainee_ids = v_ids where id = (p->>'id')::uuid and teacher_id = me.id;
    if not found then raise exception 'غير مصرح'; end if;
  else
    if (select count(*) from trainer_groups where teacher_id = me.id) >= 30 then raise exception 'الحد 30 مجموعة'; end if;
    insert into trainer_groups(teacher_id, name, trainee_ids) values (me.id, v_name, v_ids);
  end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function teacher_delete_group(p_id uuid) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher();
begin
  if me.id is null then raise exception 'غير مصرح'; end if;
  delete from trainer_groups where id = p_id and teacher_id = me.id;
  if not found then raise exception 'غير مصرح'; end if;
  return jsonb_build_object('ok', true);
end $$;

-- ---------- حد المحاولات ----------
alter table assignments add column if not exists max_attempts int not null default 1 check (max_attempts between 1 and 3);
alter table submissions add column if not exists attempt_no int not null default 1;
alter table submissions add column if not exists best_score numeric;

alter function teacher_save_assignment(jsonb) rename to teacher_save_assignment_base;
create or replace function teacher_save_assignment(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher(); v int := coalesce(nullif(p->>'max_attempts','')::int, 1); r jsonb;
begin
  if v < 1 or v > 3 then raise exception 'عدد المحاولات من 1 إلى 3'; end if;
  r := teacher_save_assignment_base(p);
  if nullif(p->>'id','') is null and v > 1 then   -- الصف المُدرج في هذه العملية نفسها
    update assignments set max_attempts = v where teacher_id = me.id and kind = 'quiz' and created_at = now() and title = trim(p->>'title');
  end if;
  return r;
end $$;

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
  update submissions set answers = v_map, review = v_rev, status = 'graded', score = greatest(v_score, coalesce(best_score, 0)),
    feedback = format('أجبت %s من %s إجابة صحيحة', v_right, v_total) || case when attempt_no > 1 then format(' (المحاولة %s، وتُحتسب أعلى درجة)', attempt_no) else '' end,
    submitted_at = now(), graded_at = now(), late = riyadh_now()::date > a.due_date where id = s.id;
  return jsonb_build_object('ok', true, 'right', v_right, 'total', v_total, 'score', v_score);
end $$;

-- البدء: مرة واحدة، أو محاولة جديدة ضمن حد المدرب بطلب صريح
create or replace function student_start_quiz(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tr uuid := (p->>'trainee_id')::uuid; a assignments := quiz_access(v_tr, (p->>'assignment_id')::uuid); s submissions;
begin
  if a.kind <> 'quiz' then raise exception 'الواجب غير متاح لك'; end if;
  select * into s from submissions where assignment_id = a.id and trainee_id = v_tr for update;
  if s.id is not null and coalesce((p->>'retry')::boolean, false) and s.status = 'graded' and s.attempt_no < a.max_attempts then
    update submissions set best_score = greatest(coalesce(best_score, 0), coalesce(score, 0)), attempt_no = attempt_no + 1, status = 'draft', answers = '{}', review = null, score = null, feedback = '',
      started_at = now(), deadline = now() + make_interval(mins => jsonb_array_length(a.quiz) * 2), submitted_at = null, graded_at = null where id = s.id returning * into s;
    return jsonb_build_object('started_at', s.started_at, 'deadline', s.deadline, 'status', 'draft', 'attempt_no', s.attempt_no);
  end if;
  if s.id is not null then return jsonb_build_object('started_at', s.started_at, 'deadline', s.deadline, 'status', s.status, 'again', true); end if;
  insert into submissions(assignment_id, trainee_id, answer, answers, status, started_at, deadline)
  values (a.id, v_tr, '', '{}', 'draft', now(), now() + make_interval(mins => jsonb_array_length(a.quiz) * 2)) returning * into s;
  return jsonb_build_object('started_at', s.started_at, 'deadline', s.deadline, 'status', 'draft');
end $$;

-- ---------- بيانات البوابة: السيرة للمتدرب، المجموعات للمدرب، وحجب المراجعة ما بقيت محاولات ----------
alter function portal_data(text) rename to portal_data_timed;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_timed(p_role); me teachers;
begin
  if base is null then return base; end if;
  if p_role = 'teacher' then
    me := me_teacher();
    return base || jsonb_build_object('groups', coalesce((select jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name, 'created_at', g.created_at,
        'trainee_ids', (select coalesce(jsonb_agg(t), '[]') from unnest(g.trainee_ids) t where teacher_teaches(me, t))) order by g.created_at) from trainer_groups g where g.teacher_id = me.id), '[]'))
      || case when jsonb_typeof(base->'me') = 'object' then jsonb_build_object('me', (base->'me') || jsonb_build_object('cv', me.cv)) else '{}'::jsonb end;
  end if;
  if p_role not in ('student','guardian') then return base; end if;
  return base
    || case when jsonb_typeof(base->'teachers') = 'array' then jsonb_build_object('teachers', coalesce((select jsonb_agg(x || jsonb_build_object('cv', t.cv))
         from jsonb_array_elements(base->'teachers') x join teachers t on t.id = (x->>'id')::uuid), '[]')) else '{}'::jsonb end
    || case when jsonb_typeof(base->'submissions') = 'array' then jsonb_build_object('submissions', coalesce((select jsonb_agg(
         case when s ? 'review' and exists (select 1 from assignments a where a.id = (s->>'assignment_id')::uuid and a.kind = 'quiz' and s->>'status' = 'graded' and coalesce((s->>'attempt_no')::int, 1) < a.max_attempts)
              then (s - 'review') || jsonb_build_object('review_hidden', true) else s end) from jsonb_array_elements(base->'submissions') s), '[]')) else '{}'::jsonb end;
end $$;

-- الصلاحيات: Supabase يمنح الدوال الجديدة افتراضيًا، فتُضبط صراحةً
revoke execute on function teacher_save_assignment_base(jsonb), portal_data_timed(text), quiz_finalize(uuid, jsonb) from public, anon, authenticated;
revoke execute on function teacher_save_profile(jsonb), teacher_save_group(jsonb), teacher_delete_group(uuid), teacher_save_assignment(jsonb), student_start_quiz(jsonb), portal_data(text) from public, anon;
grant execute on function teacher_save_profile(jsonb), teacher_save_group(jsonb), teacher_delete_group(uuid), teacher_save_assignment(jsonb), student_start_quiz(jsonb), portal_data(text) to authenticated;
