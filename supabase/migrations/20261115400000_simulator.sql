-- الخطوة AQ: تصنيف مهارات قياس للأسئلة، ومحاكي الاختبار ↔ src/sim_logic.js
-- questions.category من قائمة ثابتة لكل مقرر (الفارغ = غير مصنّف). المحاكي محاولة attempts.kind='sim' بوقت ومهلة على الخادم.

create or replace function sim_categories(p_subject text) returns text[] language sql immutable as $$
  select case p_subject
    when 'لفظي' then array['استيعاب المقروء','التناظر اللفظي','إكمال الجمل','الخطأ السياقي','الارتباط والاختلاف']
    when 'كمي' then array['الحساب','الجبر','الهندسة','الإحصاء والاحتمالات','المقارنات الكمية']
    when 'تحصيلي' then array['الرياضيات','الفيزياء','الكيمياء','الأحياء']
    else array[]::text[] end $$;
create or replace function cat_ok(p_subject text, p_cat text) returns boolean language sql immutable as $$
  select coalesce(p_cat,'') = '' or p_cat = any(sim_categories(p_subject)) $$;

alter table questions add column if not exists category text not null default '';
alter table questions drop constraint if exists questions_category_check;
alter table questions add constraint questions_category_check check (cat_ok(subject, category));
-- تصنيف آمن: أسئلة اللفظي ذات صفحة القطعة قطع قرائية (يطابق backfillCategories)
update questions set category = 'استيعاب المقروء' where subject = 'لفظي' and page_image <> '' and category = '';

alter table attempts add column if not exists kind text not null default 'practice';
alter table attempts drop constraint if exists attempts_kind_check;
alter table attempts add constraint attempts_kind_check check (kind in ('practice','sim'));
alter table attempts add column if not exists deadline timestamptz;
alter table attempts add column if not exists parts jsonb;
alter table attempts add column if not exists focus text;
create index if not exists attempts_trainee on attempts(trainee_id, started_at desc);

alter table settings add column if not exists sim_per_subject int not null default 24;
alter table settings add column if not exists sim_sec_per_q int not null default 75;
alter table settings drop constraint if exists settings_sim_check;
alter table settings add constraint settings_sim_check check (sim_per_subject between 5 and 60 and sim_sec_per_q between 30 and 180);

-- نسخة السؤال تحمل المقرر والوحدة والتصنيف (للتحليل)
create or replace function q_snap(q questions) returns jsonb language sql immutable as $$
  select jsonb_build_object('id', q.id, 'text', q.text, 'options', to_jsonb(q.options), 'correct', q.correct, 'explanation', q.explanation, 'skill', q.skill, 'version', q.version,
                            'subject', q.subject, 'unit', q.unit, 'category', q.category)
    || case when q.image <> '' then jsonb_build_object('image', q.image, 'page_image', q.page_image, 'code', coalesce(q.code,'')) else '{}'::jsonb end $$;

-- حفظ التصنيف عند حفظ السؤال (المدرب والإدارة): الدالة الأصلية ثم التصنيف للسؤال نفسه
alter function teacher_save_question(jsonb) rename to teacher_save_question_nocat;
alter function admin_save_question(jsonb) rename to admin_save_question_nocat;
revoke execute on function teacher_save_question_nocat(jsonb), admin_save_question_nocat(jsonb) from public, anon, authenticated;
create or replace function q_set_cat_after(p jsonb, p_teacher uuid) returns void language plpgsql volatile security definer set search_path = public as $$
declare v_id uuid := nullif(p->>'id','')::uuid; v_c text := coalesce(p->>'category','');
begin
  if not cat_ok(p->>'subject', v_c) then raise exception 'التصنيف لا يناسب المقرر'; end if;
  if v_id is null then select id into v_id from questions where teacher_id = p_teacher and created_at = now() order by id desc limit 1; end if;
  if v_id is not null then update questions set category = v_c where id = v_id and category is distinct from v_c; end if;
end $$;
revoke execute on function q_set_cat_after(jsonb, uuid) from public, anon, authenticated;
create or replace function teacher_save_question(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb;
begin
  if not cat_ok(p->>'subject', coalesce(p->>'category','')) then raise exception 'التصنيف لا يناسب المقرر'; end if;
  r := teacher_save_question_nocat(p); perform q_set_cat_after(p, (me_teacher()).id); return r;
end $$;
create or replace function admin_save_question(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb;
begin
  if not cat_ok(p->>'subject', coalesce(p->>'category','')) then raise exception 'التصنيف لا يناسب المقرر'; end if;
  r := admin_save_question_nocat(p); perform q_set_cat_after(p, nullif(p->>'teacher_id','')::uuid); return r;
end $$;
revoke execute on function teacher_save_question(jsonb), admin_save_question(jsonb) from public, anon;
grant execute on function teacher_save_question(jsonb), admin_save_question(jsonb) to authenticated;

-- تصنيف جماعي من صفحة البنك (الإدارة)
create or replace function admin_set_category(p_ids uuid[], p_category text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare n int; v_c text := coalesce(p_category,'');
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if coalesce(array_length(p_ids,1),0) = 0 or array_length(p_ids,1) > 1000 then raise exception 'اختر سؤالًا واحدًا على الأقل'; end if;
  if exists (select 1 from questions where id = any(p_ids) and status <> 'deleted' and not cat_ok(subject, v_c)) then raise exception 'التصنيف لا يناسب مقرر السؤال'; end if;
  update questions set category = v_c where id = any(p_ids) and status <> 'deleted';
  get diagnostics n = row_count;
  if n = 0 then raise exception 'اختر سؤالًا واحدًا على الأقل'; end if;
  return jsonb_build_object('count', n);
end $$;
revoke execute on function admin_set_category(uuid[], text) from public, anon;
grant execute on function admin_set_category(uuid[], text) to authenticated;

-- التدريب السريع: يقبل تصفية بالمهارة (تدريب علاجي)
create or replace function student_start_attempt(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tr uuid := (p->>'trainee_id')::uuid; v_snap jsonb; v_n int := greatest(1, least(coalesce((p->>'count')::int, 10), 50)); at attempts%rowtype;
        v_t uuid := nullif(p->>'teacher_id','')::uuid; v_c text := coalesce(p->>'category','');
begin
  if not student_owns(v_tr) then raise exception 'غير مصرح'; end if;
  if not trainee_in_scope(v_tr, p->>'section', p->>'subject') then raise exception 'هذا المقرر ليس ضمن اشتراكك'; end if;
  if v_t is not null and not exists (select 1 from teachers where id = v_t and active and section = p->>'section' and p->>'subject' = any(subjects)) then
    raise exception 'هذا البنك ليس لمدرب مقررك'; end if;
  if v_c <> '' and not cat_ok(p->>'subject', v_c) then raise exception 'المهارة غير معروفة'; end if;
  select jsonb_agg(q_snap(q)) into v_snap from (select * from questions where status = 'published' and subject = p->>'subject'
                       and (shared or (section = p->>'section' and (v_t is null or teacher_id = v_t))) and (nullif(p->>'unit','') is null or unit = p->>'unit')
                       and (v_c = '' or category = v_c) order by random() limit v_n) q;
  if v_snap is null then raise exception '%', case when v_c <> '' then 'لا توجد أسئلة منشورة في هذه المهارة بعد' else 'لا توجد أسئلة منشورة في هذه الوحدة بعد' end; end if;
  insert into attempts(trainee_id, teacher_id, section, subject, unit, minutes, snapshot, total, kind, focus)
  values (v_tr, v_t, p->>'section', p->>'subject', nullif(p->>'unit',''), greatest(5, jsonb_array_length(v_snap) * 2), v_snap, jsonb_array_length(v_snap), 'practice', nullif(v_c,'')) returning * into at;
  return attempt_public(at);
end $$;

-- التصحيح (↔ gradeAny): المهارات بالتصنيف والأقسام بالمقرر؛ بعد انتهاء وقت المحاكي يُصحَّح المحفوظ فقط
create or replace function attempt_grade(p_id uuid, p_answers jsonb) returns attempts language plpgsql volatile security definer set search_path = public as $$
declare at attempts%rowtype; v_in jsonb := '{}'; v_ans jsonb := '{}'; v_score int := 0; q jsonb; v int; v_sk jsonb := '{}'; v_pt jsonb := '{}'; k text; s text; x text; ok int;
begin
  select * into at from attempts where id = p_id for update;
  if at.submitted_at is not null then return at; end if;
  if at.deadline is null or now() <= at.deadline + interval '20 seconds' then v_in := coalesce(p_answers, '{}'); end if;
  for q in select * from jsonb_array_elements(at.snapshot) loop
    x := case when v_in ? (q->>'id') then v_in->>(q->>'id') else at.answers->>(q->>'id') end;
    v := case when x ~ '^[0-3]$' then x::int end;
    v_ans := v_ans || jsonb_build_object(q->>'id', v);
    ok := case when v = (q->>'correct')::int then 1 else 0 end;
    s := coalesce(nullif(q->>'subject',''), at.subject);
    k := case when cat_ok(s, q->>'category') and coalesce(q->>'category','') <> '' then q->>'category' else 'غير مصنّف' end;
    v_sk := jsonb_set(v_sk, array[k], jsonb_build_object('total', coalesce((v_sk->k->>'total')::int,0) + 1, 'right', coalesce((v_sk->k->>'right')::int,0) + ok));
    v_pt := jsonb_set(v_pt, array[s], jsonb_build_object('total', coalesce((v_pt->s->>'total')::int,0) + 1, 'right', coalesce((v_pt->s->>'right')::int,0) + ok));
    v_score := v_score + ok;
  end loop;
  update attempts set answers = v_ans, score = v_score, skills = v_sk, parts = v_pt, submitted_at = now() where id = p_id returning * into at;
  return at;
end $$;
revoke execute on function attempt_grade(uuid, jsonb) from public, anon, authenticated;

create or replace function student_finish_attempt(p_id uuid, p_answers jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare at attempts%rowtype;
begin
  select * into at from attempts where id = p_id;
  if at.id is null or not student_owns(at.trainee_id) then raise exception 'غير مصرح'; end if;
  return to_jsonb(attempt_grade(p_id, p_answers));
end $$;

-- حفظ الإجابات أولًا بأول داخل الوقت فقط
create or replace function student_save_attempt(p_id uuid, p_answers jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare at attempts%rowtype; v jsonb := '{}'; r record;
begin
  select * into at from attempts where id = p_id for update;
  if at.id is null or not student_owns(at.trainee_id) then raise exception 'غير مصرح'; end if;
  if at.submitted_at is not null then raise exception 'سُلّمت المحاولة'; end if;
  if at.deadline is not null and now() > at.deadline + interval '20 seconds' then raise exception 'انتهى الوقت'; end if;
  for r in select key, value from jsonb_each(coalesce(p_answers,'{}')) loop
    if exists (select 1 from jsonb_array_elements(at.snapshot) q where q->>'id' = r.key) then
      v := v || jsonb_build_object(r.key, case when r.value #>> '{}' ~ '^[0-3]$' then (r.value #>> '{}')::int end);
    end if;
  end loop;
  update attempts set answers = coalesce(answers,'{}') || v where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- بدء المحاكي (↔ startSim / buildSim): يُستأنف المفتوح، والمنتهي يُصحَّح، وحد يومي 3
create or replace function student_start_sim(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_tr uuid := (p->>'trainee_id')::uuid; at attempts%rowtype; v_subj text[]; s text; v_sec text; v_s text; v_part jsonb; v_snap jsonb := '[]';
        v_n int; v_sec_q int; v_min int; v_today date := riyadh_now()::date;
begin
  if not student_owns(v_tr) then raise exception 'غير مصرح'; end if;
  select * into at from attempts where trainee_id = v_tr and kind = 'sim' and submitted_at is null order by started_at desc limit 1;
  if at.id is not null then
    if now() <= at.deadline + interval '20 seconds' then return attempt_public(at); end if;
    perform attempt_grade(at.id, '{}');
  end if;
  if (select count(*) from attempts where trainee_id = v_tr and kind = 'sim' and (started_at at time zone 'Asia/Riyadh')::date = v_today) >= 3 then
    raise exception 'وصلت الحد اليومي للمحاكي (3 محاولات)'; end if;
  select array_agg(x order by array_position(array['لفظي','كمي','تحصيلي'], x)) into v_subj
    from (select distinct jsonb_array_elements_text(coalesce(p->'subjects','[]')) x) q;
  if v_subj is null then raise exception 'اختر مقررًا واحدًا على الأقل'; end if;
  select coalesce(sim_per_subject, 24), coalesce(sim_sec_per_q, 75) into v_n, v_sec_q from settings where id = 1;
  v_n := coalesce(v_n, 24); v_sec_q := coalesce(v_sec_q, 75);
  foreach s in array v_subj loop
    select section into v_s from subscriptions where trainee_id = v_tr and sub_live(subscriptions, v_today) and s = any(subjects) order by start_date desc nulls last limit 1;
    if v_s is null then raise exception 'هذا المقرر ليس ضمن اشتراكك'; end if;
    v_sec := coalesce(v_sec, v_s);
    with pool as (
           select q.id, q."order", coalesce(nullif(q.page_image,''), q.id::text) gk from questions q
            where q.status = 'published' and q.subject = s
              and (q.shared or (q.section = v_s and exists (select 1 from teachers t where t.id = q.teacher_id and t.active)))),
         seen as (select distinct e->>'id' id from attempts a, jsonb_array_elements(a.snapshot) e where a.trainee_id = v_tr),
         grp as (select gk, bool_or(p.id::text in (select id from seen)) was_seen, random() r from pool p group by gk),
         ord as (select p.id, row_number() over (order by g.was_seen, g.r, p."order", p.id) rn from pool p join grp g using (gk))
    select jsonb_agg(q_snap(q) || jsonb_build_object('subject', s) order by o.rn) into v_part from ord o join questions q on q.id = o.id where o.rn <= v_n;
    if coalesce(jsonb_array_length(v_part), 0) < 5 then raise exception 'أسئلة % في البنك غير كافية للمحاكي بعد', s; end if;
    v_snap := v_snap || v_part;
  end loop;
  v_min := greatest(1, ceil(jsonb_array_length(v_snap) * v_sec_q / 60.0)::int);
  insert into attempts(trainee_id, section, subject, unit, minutes, snapshot, total, kind, focus, deadline)
  values (v_tr, v_sec, 'محاكي', null, v_min, v_snap, jsonb_array_length(v_snap), 'sim', array_to_string(v_subj, ' + '), now() + make_interval(mins => v_min))
  returning * into at;
  return attempt_public(at);
end $$;

revoke execute on function student_start_attempt(jsonb), student_finish_attempt(uuid, jsonb), student_save_attempt(uuid, jsonb), student_start_sim(jsonb) from public, anon;
grant execute on function student_start_attempt(jsonb), student_finish_attempt(uuid, jsonb), student_save_attempt(uuid, jsonb), student_start_sim(jsonb) to authenticated;
revoke execute on function sim_categories(text), cat_ok(text, text) from anon;

-- البوابة: إعدادات المحاكي
alter function portal_data(text) rename to portal_data_sim;
revoke execute on function portal_data_sim(text) from public, anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_sim(p_role);
begin
  if base is null then return base; end if;
  return base || jsonb_build_object('settings', coalesce(base->'settings','{}') || (select jsonb_build_object('sim_per_subject', sim_per_subject, 'sim_sec_per_q', sim_sec_per_q) from settings where id = 1));
end $$;
revoke execute on function portal_data(text) from public, anon;
grant execute on function portal_data(text) to authenticated;
