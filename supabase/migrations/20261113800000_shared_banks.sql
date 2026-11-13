-- =====================================================================
-- الخطوة R — البنوك المشتركة المصوَّرة: بنك واحد لكل مقرر يراه مدربا المقرر (بنين وبنات)،
-- والواجبات والمحاولات والنتائج تبقى لكل مدرب مع طلابه. انتقاء أسئلة بعينها للواجب.
-- مطابق لـ src/learning_logic.js (bankFor، teacherBank، buildQuiz، normalizeBundle).
-- =====================================================================
alter table questions add column if not exists shared boolean not null default false;
alter table questions add column if not exists code text;
alter table questions add column if not exists image text not null default '';
alter table questions add column if not exists page_image text not null default '';
alter table questions add column if not exists "order" int not null default 0;
alter table questions add column if not exists key_status text not null default 'unverified' check (key_status in ('unverified','approved'));
alter table questions add column if not exists key_source text not null default '';
alter table questions drop constraint if exists questions_section_check;
alter table questions add constraint questions_section_check check (section in ('girls','boys','all'));
alter table questions add constraint questions_shared_shape check ((shared and section = 'all' and teacher_id is null and code is not null) or (not shared and section <> 'all'));
create unique index if not exists questions_shared_code on questions(code) where shared;
create index if not exists questions_shared_subject on questions(subject, unit) where shared and status = 'published';
alter table settings add column if not exists bank_assets text not null default '';

create or replace function q_snap(q questions) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', q.id, 'text', q.text, 'options', to_jsonb(q.options), 'correct', q.correct, 'explanation', q.explanation, 'skill', q.skill, 'version', q.version)
    || case when q.image <> '' then jsonb_build_object('image', q.image, 'page_image', q.page_image, 'code', coalesce(q.code,'')) else '{}'::jsonb end $$;

-- استيراد حزمة بنك مشترك: يضيف الجديد ويحدّث الموجود برمزه؛ تغيّر المفتاح يرفع الإصدار
create or replace function admin_import_shared_bank(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; v_added int := 0; v_updated int := 0; v_sub text := p->>'subject'; v_c int; x questions;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if v_sub not in ('كمي','لفظي','تحصيلي') or jsonb_typeof(p->'questions') <> 'array' then raise exception 'ملف البنك غير صالح'; end if;
  for r in select * from jsonb_array_elements(p->'questions') loop
    v_c := (r->>'correct')::int;
    if r->>'code' !~ '^[A-Za-z0-9_-]{2,30}$' or v_c not between 0 and 3 or (coalesce(r->>'image','') = '' and btrim(coalesce(r->>'text','')) = '') then raise exception 'سؤال غير صالح في الحزمة: %', r->>'code'; end if;
    select * into x from questions where shared and code = r->>'code';
    if x.id is null then
      insert into questions(shared, teacher_id, section, subject, unit, skill, "order", text, image, page_image, options, correct, difficulty, key_status, key_source, status, code)
      values (true, null, 'all', v_sub, coalesce(nullif(r->>'unit',''),'عام'), coalesce(r->>'skill',''), coalesce((r->>'order')::int, 0), coalesce(r->>'text',''), coalesce(r->>'image',''), coalesce(r->>'page_image',''),
        array['أ','ب','ج','د'], v_c, coalesce(nullif(r->>'difficulty',''),'متوسط'), case when r->>'key_status' = 'approved' then 'approved' else 'unverified' end, left(coalesce(r->>'key_source',''),160),
        case when r->>'status' = 'draft' then 'draft' else 'published' end, r->>'code');
      v_added := v_added + 1;
    else
      update questions set subject = v_sub, unit = coalesce(nullif(r->>'unit',''),'عام'), skill = coalesce(r->>'skill',''), "order" = coalesce((r->>'order')::int, 0), text = coalesce(r->>'text',''), image = coalesce(r->>'image',''),
        page_image = coalesce(r->>'page_image',''), correct = v_c, key_status = case when r->>'key_status' = 'approved' then 'approved' else 'unverified' end, key_source = left(coalesce(r->>'key_source',''),160),
        status = case when r->>'status' = 'draft' then 'draft' else 'published' end, version = version + case when correct <> v_c then 1 else 0 end where id = x.id;
      v_updated := v_updated + 1;
    end if;
  end loop;
  return jsonb_build_object('added', v_added, 'updated', v_updated);
end $$;
revoke execute on function admin_import_shared_bank(jsonb) from public, anon;
grant execute on function admin_import_shared_bank(jsonb) to authenticated;

-- واجب كتابي أو اختبار: من بنك المدرب والبنك المشترك لمقرره، عشوائيًا أو بانتقاء أسئلة بعينها
create or replace function teacher_save_assignment(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher(); v_quiz jsonb; v_n int := greatest(1, least(coalesce(nullif(p->>'count','')::int, 10), 50)); v_ids uuid[];
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
  insert into assignments(teacher_id, section, subject, title, body, publish_date, due_date, max_score, kind, quiz)
  values (me.id, me.section, p->>'subject', trim(p->>'title'), left(coalesce(p->>'body',''),4000), (p->>'publish_date')::date, (p->>'due_date')::date,
          coalesce((p->>'max_score')::numeric, 10), case when v_quiz is null then 'text' else 'quiz' end, v_quiz);
  return jsonb_build_object('ok', true);
end $$;

-- قياس المستوى: من بنك مدرب المقرر والبنك المشترك للمقرر
create or replace function student_start_attempt(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tr uuid := (p->>'trainee_id')::uuid; v_snap jsonb; v_n int := greatest(1, least(coalesce((p->>'count')::int, 10), 50)); at attempts%rowtype;
        v_t uuid := nullif(p->>'teacher_id','')::uuid;
begin
  if not student_owns(v_tr) then raise exception 'غير مصرح'; end if;
  if not trainee_in_scope(v_tr, p->>'section', p->>'subject') then raise exception 'هذا المقرر ليس ضمن اشتراكك'; end if;
  if v_t is not null and not exists (select 1 from teachers where id = v_t and active and section = p->>'section' and p->>'subject' = any(subjects)) then
    raise exception 'هذا البنك ليس لمدرب مقررك'; end if;
  select jsonb_agg(q_snap(q)) into v_snap from (select * from questions where status = 'published' and subject = p->>'subject'
                       and (shared or (section = p->>'section' and (v_t is null or teacher_id = v_t))) and (nullif(p->>'unit','') is null or unit = p->>'unit') order by random() limit v_n) q;
  if v_snap is null then raise exception 'لا توجد أسئلة منشورة في هذه الوحدة بعد'; end if;
  insert into attempts(trainee_id, teacher_id, section, subject, unit, minutes, snapshot, total)
  values (v_tr, v_t, p->>'section', p->>'subject', nullif(p->>'unit',''), greatest(5, jsonb_array_length(v_snap) * 2), v_snap, jsonb_array_length(v_snap)) returning * into at;
  return attempt_public(at);
end $$;

-- بيانات البوابة: المدرب يرى البنك المشترك لمقرراته، والمتدرب يرى وحداته دون مفاتيح، ومسار صور البنك
alter function portal_data(text) rename to portal_data_orders;
revoke execute on function portal_data_orders(text) from public, anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_orders(p_role); me teachers; ph text := my_phone(); ids uuid[]; v_units jsonb;
begin
  if base is null then return base; end if;
  base := base || jsonb_build_object('bank_assets', (select bank_assets from settings where id = 1));
  if p_role = 'teacher' then
    me := me_teacher();
    if me.id is not null then
      base := base || jsonb_build_object('questions', coalesce(base->'questions', '[]') || coalesce((select jsonb_agg(to_jsonb(q) || jsonb_build_object('options', to_jsonb(q.options)) order by q.unit, q."order")
        from questions q where q.shared and q.status <> 'deleted' and q.subject = any(me.subjects)), '[]'));
    end if;
  elsif p_role in ('student','guardian') then
    if p_role = 'student' then select coalesce(array_agg(id), '{}') into ids from trainees where phone = ph;
    else select coalesce(array_agg(trainee_id), '{}') into ids from guardian_links where guardian_phone = ph and status = 'verified'; end if;
    select jsonb_agg(jsonb_build_object('section', section, 'subject', subject, 'unit', unit, 'teacher_id', teacher_id, 'teacher_name', full_name, 'count', n)) into v_units from (
      select sc.section, q.subject, q.unit, t.id teacher_id, t.full_name, count(distinct q.id) n
        from (select distinct s.section, unnest(s.subjects) subject from subscriptions s where s.trainee_id = any(ids) and s.status in ('pending','active')) sc
        join teachers t on t.active and t.section = sc.section and sc.subject = any(t.subjects)
        join questions q on q.shared and q.status = 'published' and q.subject = sc.subject
       group by 1,2,3,4,5) u;
    if v_units is not null then base := base || jsonb_build_object('bank_units', coalesce(base->'bank_units', '[]') || v_units); end if;
  end if;
  return base;
end $$;
revoke execute on function portal_data(text) from public, anon;
grant execute on function portal_data(text) to authenticated;
