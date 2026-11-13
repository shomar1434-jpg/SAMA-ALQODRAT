-- =====================================================================
-- الخطوة T — محرر الواجبات: النوع (واجب/تدريب/اختبار رسمي)، سياسة إظهار الإجابات، والاستهداف بقائمة ثابتة،
-- واعتماد مفاتيح البنك المشترك شرطًا للاختبار الرسمي. مطابق لـ src/learning_logic.js.
-- =====================================================================
alter table assignments add column if not exists type text not null default 'homework' check (type in ('homework','practice','exam'));
alter table assignments add column if not exists reveal text not null default 'after_submit' check (reveal in ('after_submit','after_due','never'));
alter table assignments add column if not exists targets uuid[];
alter table assignments add column if not exists target_label text not null default '';
alter table questions add column if not exists key_approved_at timestamptz;
alter table questions add column if not exists key_approved_by uuid;

create or replace function admin_approve_keys(p_subject text, p_unit text default null, p_approved boolean default true) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  update questions set key_status = case when p_approved then 'approved' else 'unverified' end, key_approved_at = case when p_approved then now() end, key_approved_by = case when p_approved then auth.uid() end
   where shared and subject = p_subject and (p_unit is null or unit = p_unit) and status <> 'deleted';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'لا أسئلة في هذا النطاق'; end if;
  return jsonb_build_object('count', n);
end $$;
revoke execute on function admin_approve_keys(text, text, boolean) from public, anon;
grant execute on function admin_approve_keys(text, text, boolean) to authenticated;

create or replace function teacher_save_assignment(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher(); v_quiz jsonb; v_n int := greatest(1, least(coalesce(nullif(p->>'count','')::int, 10), 50)); v_ids uuid[]; v_type text := coalesce(nullif(p->>'type',''), 'homework'); v_reveal text := coalesce(nullif(p->>'reveal',''), 'after_submit'); v_targets uuid[]; v_bad int;
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
    if jsonb_typeof(p->'question_ids') = 'array' and jsonb_array_length(p->'question_ids') > 0 then
      select array_agg(distinct_ids.id order by distinct_ids.ord) into v_ids from (select x::uuid id, min(o) ord from jsonb_array_elements_text(p->'question_ids') with ordinality t(x, o) group by 1) distinct_ids;
      if cardinality(v_ids) > 100 then raise exception 'الحد 100 سؤال في الواجب'; end if;
      select jsonb_agg(q_snap(q) order by array_position(v_ids, q.id)) into v_quiz from questions q
       where q.id = any(v_ids) and q.status = 'published' and q.subject = p->>'subject' and (q.shared or q.teacher_id = me.id);
      if v_quiz is null or jsonb_array_length(v_quiz) <> cardinality(v_ids) then raise exception 'أحد الأسئلة المختارة ليس منشورًا في بنكك'; end if;
    else
      select jsonb_agg(q_snap(q)) into v_quiz from (select * from questions where status = 'published' and subject = p->>'subject' and (shared or teacher_id = me.id)
                         and (nullif(p->>'unit','') is null or unit = p->>'unit') order by random() limit v_n) q;
      if v_quiz is null then raise exception 'لا توجد أسئلة منشورة في بنكك لهذا المقرر'; end if;
    end if;
  end if;
  if v_type not in ('homework','practice','exam') then raise exception 'نوع غير صالح'; end if;
  if v_reveal not in ('after_submit','after_due','never') then raise exception 'سياسة إظهار الإجابات غير صالحة'; end if;
  if jsonb_typeof(p->'targets') = 'array' then
    select array_agg(distinct x::uuid) into v_targets from jsonb_array_elements_text(p->'targets') x;
    if v_targets is null then raise exception 'اختر متدربًا واحدًا على الأقل'; end if;
    if cardinality(v_targets) > 500 then raise exception 'الحد 500 متدرب'; end if;
    if exists (select 1 from unnest(v_targets) t where not trainee_in_scope(t, me.section, p->>'subject')) then raise exception 'أحد المستهدفين ليس ضمن متدربي هذا المقرر'; end if;
  end if;
  if v_type = 'exam' and v_quiz is not null then
    select count(*) into v_bad from jsonb_array_elements(v_quiz) q join questions x on x.id = (q->>'id')::uuid where x.shared and x.key_status <> 'approved';
    if v_bad > 0 then raise exception 'الاختبار الرسمي يحتاج مفاتيح معتمدة: % سؤالًا مفتاحه غير معتمد', v_bad; end if;
  end if;
  insert into assignments(teacher_id, section, subject, title, body, publish_date, due_date, max_score, kind, quiz, type, reveal, targets, target_label)
  values (me.id, me.section, p->>'subject', trim(p->>'title'), left(coalesce(p->>'body',''),4000), (p->>'publish_date')::date, (p->>'due_date')::date,
          coalesce((p->>'max_score')::numeric, 10), case when v_quiz is null then 'text' else 'quiz' end, v_quiz, v_type, v_reveal, v_targets,
          case when v_targets is null then '' else left(coalesce(nullif(p->>'target_label',''), cardinality(v_targets) || ' متدربًا'), 80) end);
  return jsonb_build_object('ok', true);
end $$;

-- التسليم: المستهدَف فقط يسلّم
alter function student_submit(jsonb) rename to student_submit_untargeted;
revoke execute on function student_submit_untargeted(jsonb) from public, anon, authenticated;
create or replace function student_submit(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if exists (select 1 from assignments a where a.id = nullif(p->>'assignment_id','')::uuid and a.targets is not null and not (nullif(p->>'trainee_id','')::uuid = any(a.targets))) then
    raise exception 'الواجب غير متاح لك'; end if;
  return student_submit_untargeted(p);
end $$;
revoke execute on function student_submit(jsonb) from public, anon;
grant execute on function student_submit(jsonb) to authenticated;

-- بيانات البوابة: المتدرب يرى واجباته المستهدَف بها فقط (بلا معرّفات زملائه)، وتُحجب المراجعة حتى تسمح سياسة الواجب؛ والمدرب يرى المستهدفين في مرآة الإنجاز
alter function portal_data(text) rename to portal_data_banks;
revoke execute on function portal_data_banks(text) from public, anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_banks(p_role); ph text := my_phone(); ids uuid[]; d date := riyadh_now()::date;
begin
  if base is null then return base; end if;
  if p_role in ('student','guardian') then
    if p_role = 'student' then select coalesce(array_agg(id), '{}') into ids from trainees where phone = ph;
    else select coalesce(array_agg(trainee_id), '{}') into ids from guardian_links where guardian_phone = ph and status = 'verified'; end if;
    base := base || jsonb_build_object(
      'assignments', coalesce((select jsonb_agg(case when jsonb_typeof(x->'targets') = 'array'
          then x || jsonb_build_object('targets', (select coalesce(jsonb_agg(t), '[]') from jsonb_array_elements_text(x->'targets') t where t::uuid = any(ids))) else x end)
        from jsonb_array_elements(coalesce(base->'assignments','[]')) x
        where jsonb_typeof(x->'targets') <> 'array' or exists (select 1 from jsonb_array_elements_text(x->'targets') t where t::uuid = any(ids))), '[]'),
      'submissions', coalesce((select jsonb_agg(case when a.id is not null and a.kind = 'quiz' and not (a.reveal = 'after_submit' or (a.reveal = 'after_due' and d > a.due_date))
          then (s - 'review') || jsonb_build_object('review_hidden', true) else s end)
        from jsonb_array_elements(coalesce(base->'submissions','[]')) s left join assignments a on a.id = (s->>'assignment_id')::uuid), '[]'));
  elsif p_role = 'teacher' and base ? 'hw_assignments' then
    base := base || jsonb_build_object('hw_assignments', coalesce((select jsonb_agg(case when a.targets is not null then x || jsonb_build_object('targets', to_jsonb(a.targets)) else x end)
      from jsonb_array_elements(base->'hw_assignments') x left join assignments a on a.id = (x->>'id')::uuid), '[]'));
  end if;
  return base;
end $$;
revoke execute on function portal_data(text) from public, anon;
grant execute on function portal_data(text) to authenticated;
