-- =====================================================================
-- الخطوة D: صندوق الوارد والتنبيهات — مطابق لـ src/inbox_logic.js
--   • إشعارات للمدرب أيضًا (to = 'teacher')، ومفتاح منع التكرار dedupe_key، ودفعة الإرسال batch
--   • تنبيه «تبدأ الجلسة بعد N دقائق» عبر pg_cron كل دقيقة (run_session_reminders)
--   • portal_inbox(role): ما يحتاجه الجرس (آخر الإشعارات + الرسائل غير المقروءة) بطلب خفيف
--   • admin_notify(p): رسالة الإدارة إلى المتدربين أو أولياء الأمور أو المدربين بنطاق
-- =====================================================================
alter table notifications drop constraint if exists notifications_to_check;
alter table notifications add constraint notifications_to_check check ("to" in ('student','guardian','teacher'));
alter table notifications alter column trainee_id drop not null;
alter table notifications add column if not exists teacher_id uuid references teachers(id) on delete restrict;
alter table notifications add column if not exists dedupe_key text unique;
alter table notifications add column if not exists batch uuid;
alter table notifications drop constraint if exists notifications_target;
alter table notifications add constraint notifications_target check (("to" = 'teacher' and teacher_id is not null) or ("to" <> 'teacher' and trainee_id is not null));
create index if not exists notifications_teacher on notifications(teacher_id, at) where teacher_id is not null;
alter table settings add column if not exists soon_minutes int not null default 10 check (soon_minutes between 0 and 60);

create or replace function t12(p time) returns text language sql immutable as $$
  select ltrim(to_char(p, 'HH12:MI'), '0') || case when p < '12:00' then ' ص' else ' م' end;
$$;

-- ---------- تنبيه بدء الجلسة ----------
create or replace function run_session_reminders() returns int language plpgsql volatile security definer set search_path = public as $$
declare n timestamp := riyadh_now(); d date := n::date; hm time := n::time; mins int; sec text; ss record; c record; k text; w text; cnt int := 0; x int;
begin
  select soon_minutes into mins from settings where id = 1;
  if coalesce(mins, 0) <= 0 then return 0; end if;
  foreach sec in array array['boys','girls'] loop
    select * into ss from session_on(sec, d);
    if ss.start_time is null or not (hm >= ss.start_time - make_interval(mins => mins) and hm < ss.start_time) then continue; end if;
    w := t12(ss.start_time); k := d || ':' || sec || ':' || to_char(ss.start_time, 'HH24:MI');
    insert into notifications(date, sender, "to", trainee_id, kind, text, dedupe_key)
      select distinct on (s.trainee_id) d, 'system', 'student', s.trainee_id, 'session_soon',
        'تبدأ جلستك في ' || plan_label(p) || ' الساعة ' || w || '، بعد ' || mins || ' دقائق. لا تنسَ مسح باركود الحضور عند وصولك.', 'soon:s:' || s.trainee_id || ':' || k
      from subscriptions s join plans p on p.id = s.plan_id where s.section = sec and sub_live(s, d)
      on conflict (dedupe_key) do nothing;
    get diagnostics x = row_count; cnt := cnt + x;
    insert into notifications(date, sender, "to", trainee_id, kind, text, dedupe_key)
      select distinct on (t.id) d, 'system', 'guardian', t.id, 'session_soon',
        'تبدأ جلسة ' || split_part(t.full_name, ' ', 1) || ' في ' || plan_label(p) || ' الساعة ' || w || '، بعد ' || mins || ' دقائق.', 'soon:g:' || t.id || ':' || k
      from subscriptions s join plans p on p.id = s.plan_id join trainees t on t.id = s.trainee_id
      where s.section = sec and sub_live(s, d) and exists (select 1 from guardian_links l where l.status = 'verified' and l.trainee_id = t.id)
      on conflict (dedupe_key) do nothing;
    get diagnostics x = row_count; cnt := cnt + x;
    insert into notifications(date, sender, "to", teacher_id, kind, text, dedupe_key)
      select d, 'system', 'teacher', te.id, 'session_soon',
        'تبدأ جلسة قسم ' || case sec when 'boys' then 'البنون' else 'البنات' end || ' الساعة ' || w || '، بعد ' || mins || ' دقائق. عدد المشتركين '
          || (select count(distinct s.trainee_id) from subscriptions s where s.section = sec and sub_live(s, d)) || '.', 'soon:t:' || te.id || ':' || k
      from teachers te where te.active and te.section = sec
      on conflict (dedupe_key) do nothing;
    get diagnostics x = row_count; cnt := cnt + x;
  end loop;
  for c in select co.*, pr.name pname from cohorts co join programs pr on pr.id = co.program_id
           where co.archived_at is null and co.start_date <= d and co.end_date >= d and extract(dow from d)::int = any(co.days)
             and hm >= co.start_time - make_interval(mins => mins) and hm < co.start_time loop
    w := t12(c.start_time); k := d || ':c:' || c.id;
    insert into notifications(date, sender, "to", trainee_id, kind, text, dedupe_key)
      select d, 'system', 'student', e.trainee_id, 'session_soon', 'تبدأ محاضرة «' || c.pname || '» الساعة ' || w || '، بعد ' || mins || ' دقائق. لا تنسَ تسجيل حضورك.', 'soon:s:' || e.trainee_id || ':' || k
      from enrollments e where e.cohort_id = c.id and e.status <> 'ملغى' on conflict (dedupe_key) do nothing;
    get diagnostics x = row_count; cnt := cnt + x;
    insert into notifications(date, sender, "to", trainee_id, kind, text, dedupe_key)
      select d, 'system', 'guardian', t.id, 'session_soon', 'تبدأ محاضرة ' || split_part(t.full_name, ' ', 1) || ' في «' || c.pname || '» الساعة ' || w || '، بعد ' || mins || ' دقائق.', 'soon:g:' || t.id || ':' || k
      from enrollments e join trainees t on t.id = e.trainee_id
      where e.cohort_id = c.id and e.status <> 'ملغى' and exists (select 1 from guardian_links l where l.status = 'verified' and l.trainee_id = t.id)
      on conflict (dedupe_key) do nothing;
    get diagnostics x = row_count; cnt := cnt + x;
  end loop;
  return cnt;
end $$;
revoke execute on function run_session_reminders() from public, anon, authenticated;

-- ---------- صندوق الوارد للجرس ----------
create or replace function portal_inbox(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ph text := my_phone(); ids uuid[]; me teachers := me_teacher(); items jsonb;
begin
  if ph = '' or not (p_role = any(portal_roles())) then raise exception 'غير مصرح'; end if;
  if p_role = 'student' then select coalesce(array_agg(id), '{}') into ids from trainees where phone = ph;
  elsif p_role = 'guardian' then select coalesce(array_agg(trainee_id), '{}') into ids from guardian_links where status = 'verified' and guardian_phone = ph; end if;
  select coalesce(jsonb_agg(u.i order by u.i->>'at' desc), '[]') into items from (
    (select jsonb_build_object('id', 'n:' || n.id, 'kind', n.kind, 'at', n.at, 'title', case n.kind when 'session_soon' then 'تبدأ الجلسة قريبًا' when 'absence' then 'غياب' when 'late' then 'تأخر'
              when 'reminder' then 'تذكير بالحضور' when 'homework' then 'واجب' when 'admin' then 'رسالة من إدارة المعهد' else 'إشعار' end,
            'text', n.text, 'read', n.read_at is not null, 'action', 'notice') i
       from notifications n
      where (p_role = 'teacher' and n."to" = 'teacher' and n.teacher_id = me.id) or (p_role <> 'teacher' and n."to" = p_role and n.trainee_id = any(ids))
      order by n.at desc limit 40)
    union all
    (select jsonb_build_object('id', 'm:' || m.id, 'kind', 'message', 'at', m.at,
            'title', 'رسالة من ' || coalesce(case when p_role = 'teacher' then (select split_part(full_name, ' ', 1) || ' ' || split_part(full_name, ' ', 2) from trainees where id = m.trainee_id)
                                       else (select split_part(full_name, ' ', 1) || ' ' || split_part(full_name, ' ', 2) from teachers where id = m.teacher_id) end, ''),
            'text', m.text, 'read', false, 'action', 'msg', 'thread', jsonb_build_object('trainee_id', m.trainee_id, 'teacher_id', m.teacher_id))
       from messages m
      where m.read_at is null and ((p_role = 'teacher' and m.teacher_id = me.id and m."from" = 'student') or (p_role = 'student' and m.trainee_id = any(ids) and m."from" = 'teacher')))
  ) u;
  items := coalesce((select jsonb_agg(x order by x->>'at' desc) from (select x from jsonb_array_elements(items) x order by x->>'at' desc limit 40) y), '[]');
  return jsonb_build_object('items', items, 'unread', (select count(*) from jsonb_array_elements(items) x where not (x->>'read')::boolean));
end $$;

-- تعليم الإشعارات مقروءة (يشمل المدرب)
create or replace function mark_read(p_role text) returns void language plpgsql volatile security definer set search_path = public as $$
declare ph text := my_phone(); me teachers := me_teacher();
begin
  if not (p_role = any(portal_roles())) then return; end if;
  if p_role = 'teacher' then update notifications set read_at = now() where read_at is null and "to" = 'teacher' and teacher_id = me.id; return; end if;
  update notifications set read_at = now() where read_at is null and "to" = p_role and trainee_id in (
    select id from trainees where p_role = 'student' and phone = ph union select trainee_id from guardian_links where p_role = 'guardian' and status = 'verified' and guardian_phone = ph);
end $$;

-- ---------- رسالة الإدارة ----------
create or replace function admin_notify(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare aud text := p->>'audience'; sc text := coalesce(nullif(p->>'scope',''), 'all'); txt text := trim(coalesce(p->>'text','')); d date := riyadh_now()::date; b uuid := gen_random_uuid(); ids uuid[]; cnt int;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if length(txt) < 3 then raise exception 'اكتب نص الرسالة'; end if;
  if length(txt) > 600 then raise exception 'الرسالة أطول من 600 حرف'; end if;
  if aud = 'teacher' then
    insert into notifications(date, sender, "to", teacher_id, kind, text, batch)
      select d, 'admin', 'teacher', id, 'admin', txt, b from teachers where active and (sc <> 'section' or section = p->>'section');
  elsif aud in ('student','guardian') then
    ids := case sc
      when 'trainee' then array[(p->>'trainee_id')::uuid]
      when 'section' then array(select distinct trainee_id from subscriptions s where s.section = p->>'section' and sub_live(s, d))
      when 'program' then array(select distinct e.trainee_id from enrollments e join cohorts c on c.id = e.cohort_id where e.program_id = (p->>'program_id')::uuid and e.status <> 'ملغى' and c.archived_at is null and c.end_date >= d)
      else array(select trainee_id from subscriptions s where sub_live(s, d) union select e.trainee_id from enrollments e join cohorts c on c.id = e.cohort_id where e.status <> 'ملغى' and c.archived_at is null and c.end_date >= d) end;
    if aud = 'guardian' then ids := array(select distinct trainee_id from guardian_links where status = 'verified' and trainee_id = any(ids)); end if;
    insert into notifications(date, sender, "to", trainee_id, kind, text, batch) select d, 'admin', aud, x, 'admin', txt, b from unnest(ids) x where x is not null;
  else raise exception 'اختر الفئة المستهدفة'; end if;
  get diagnostics cnt = row_count;
  if cnt = 0 then raise exception 'لا يوجد مستلمون في هذا النطاق'; end if;
  return jsonb_build_object('ok', true, 'count', cnt);
end $$;

revoke execute on function portal_inbox(text), mark_read(text), admin_notify(jsonb) from anon;
grant execute on function portal_inbox(text), mark_read(text), admin_notify(jsonb) to authenticated;

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'sama_session_reminders';
    perform cron.schedule('sama_session_reminders', '* * * * *', $j$select run_session_reminders()$j$);
  end if;
end $$;
