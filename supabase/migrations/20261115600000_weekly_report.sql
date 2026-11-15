-- الخطوة AS: تقرير ولي الأمر الأسبوعي ↔ src/weekly_logic.js
-- التقرير يُحسب في الواجهة من بيانات البوابة؛ هنا: إشعار داخلي أسبوعي لأولياء الأمور (الخميس 6 مساءً بتوقيت الرياض)،
-- وبيانات التعلم لمتدرب واحد للإدارة (لا تُحمَّل في لوحة الإدارة عمومًا).

create or replace function run_weekly_reports(p_now timestamp default null) returns int language plpgsql volatile security definer set search_path = public as $$
declare n timestamp := coalesce(p_now, riyadh_now()); d date := n::date; v_from date := d - extract(dow from d)::int; x int;
begin
  if extract(dow from d) <> 4 or extract(hour from n) < 18 then return 0; end if;
  insert into notifications(date, sender, "to", trainee_id, kind, text, dedupe_key)
    select d, 'system', 'guardian', t.id, 'weekly_report',
      'تقرير أسبوع ' || split_part(t.full_name, ' ', 1) || ' جاهز: الحضور والواجبات والتدريب ونقاط التركيز. افتح «تقرير الأسبوع» في البوابة.',
      'weekly:g:' || t.id || ':' || v_from
      from trainees t
     where exists (select 1 from guardian_links l where l.status = 'verified' and l.trainee_id = t.id)
       and (exists (select 1 from subscriptions s where s.trainee_id = t.id and sub_live(s, d) and (s.start_date is null or s.start_date <= d))
            or exists (select 1 from enrollments e where e.trainee_id = t.id and e.status <> 'ملغى'))
    on conflict (dedupe_key) do nothing;
  get diagnostics x = row_count;
  return x;
end $$;
revoke execute on function run_weekly_reports(timestamp) from public, anon, authenticated;

create or replace function admin_trainee_learning(p_trainee uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v jsonb;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  v := jsonb_build_object(
    'attempts', coalesce((select jsonb_agg(to_jsonb(a) order by a.started_at) from (select * from attempts where trainee_id = p_trainee and submitted_at is not null order by started_at desc limit 300) a), '[]'),
    'submissions', coalesce((select jsonb_agg(to_jsonb(s)) from submissions s where s.trainee_id = p_trainee), '[]'),
    'assignments', coalesce((select jsonb_agg(to_jsonb(a)) from assignments a where exists (select 1 from subscriptions s where s.trainee_id = p_trainee and s.section = a.section and a.subject = any(s.subjects))), '[]'));
  return v || jsonb_build_object('q_meta', coalesce((select jsonb_object_agg(q.id, jsonb_build_array(q.category, q.unit)) from questions q
    where q.id in (select (e->>'id')::uuid from jsonb_array_elements(v->'attempts') a, jsonb_array_elements(coalesce(a->'snapshot','[]')) e where e->>'id' ~ '^[0-9a-f-]{36}$'
                   union select (e->>'id')::uuid from jsonb_array_elements(v->'assignments') a, jsonb_array_elements(case when jsonb_typeof(a->'quiz') = 'array' then a->'quiz' else '[]' end) e where e->>'id' ~ '^[0-9a-f-]{36}$')), '{}'));
end $$;
revoke execute on function admin_trainee_learning(uuid) from public, anon;
grant execute on function admin_trainee_learning(uuid) to authenticated;

do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'sama-weekly-reports';
    perform cron.schedule('sama-weekly-reports', '5 * * * 4', 'select public.run_weekly_reports()');
  end if;
end $$;
