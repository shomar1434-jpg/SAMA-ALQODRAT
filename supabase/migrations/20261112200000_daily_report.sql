-- =====================================================================
-- الخطوة 9: تقرير اليوم الساعة 20:30 بتوقيت الرياض (مطابق لـ src/report_logic.js)
-- لقطة أولى مرة واحدة لكل تاريخ، ومراجعات مرقّمة لاحقة. لا تعديل للقطة.
-- يُجدول عبر pg_cron على الخادم، فلا يعتمد على فتح لوحة الإدارة.
-- =====================================================================
create table if not exists daily_reports (
  id uuid primary key default gen_random_uuid(),
  date date not null, version int not null check (version > 0),
  kind text not null check (kind in ('snapshot','revision')),
  status text not null default 'success', data jsonb not null, note text not null default '', changes text[] not null default '{}',
  auto boolean not null default false, generated_at timestamptz not null default now(), generated_by uuid,
  unique (date, version)
);
create table if not exists daily_report_runs (
  id bigserial primary key, at timestamptz not null default now(), date date not null, kind text, status text not null, error text
);
alter table daily_reports enable row level security; alter table daily_report_runs enable row level security;
drop policy if exists daily_reports_admin on daily_reports;  create policy daily_reports_admin on daily_reports for select using (is_admin());
drop policy if exists daily_report_runs_admin on daily_report_runs; create policy daily_report_runs_admin on daily_report_runs for select using (is_admin());
-- اللقطة لا تُعدَّل: يُسمح بتحديث الملاحظة فقط عبر دالة
create or replace function set_report_note(p_id uuid, p_note text) returns void language plpgsql volatile security definer set search_path = public as $$
begin if not is_admin() then raise exception 'غير مصرح'; end if; update daily_reports set note = left(coalesce(p_note,''), 1000) where id = p_id; end $$;

create or replace function build_daily_report(p_date date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare n timestamp := riyadh_now(); groups jsonb := '[]'; g jsonb; sec text; ses record; c record; v_rows jsonb; v_done boolean; v_all jsonb := '[]';
begin
  foreach sec in array array['girls','boys'] loop
    select * into ses from session_on(sec, p_date);
    if ses.start_time is null then continue; end if;
    v_done := p_date < n::date or n::time > ses.end_time;
    select coalesce(jsonb_agg(jsonb_build_object('name', t.full_name, 'plan', plan_label(pl), 'status', coalesce(a.status, case when v_done then 'غائب' else 'لم يسجل بعد' end),
             'time', to_char(a.checkin_at at time zone 'Asia/Riyadh','HH24:MI'), 'manual', coalesce(a.manual,false)) order by t.full_name), '[]')
      into v_rows
      from subscriptions s join trainees t on t.id = s.trainee_id join plans pl on pl.id = s.plan_id
      left join sub_attendance a on a.subscription_id = s.id and a.att_date = p_date
     where s.section = sec and s.status <> 'cancelled' and (s.start_date is null or s.start_date <= p_date) and (s.end_date is null or s.end_date >= p_date);
    groups := groups || jsonb_build_object('key', sec, 'label', case sec when 'girls' then 'البنات' else 'البنون' end, 'session', jsonb_build_object('start', to_char(ses.start_time,'HH24:MI'), 'end', to_char(ses.end_time,'HH24:MI')), 'rows', v_rows);
    v_all := v_all || v_rows;
  end loop;
  for c in select x.*, p.name pname from cohorts x join programs p on p.id = x.program_id
           where x.start_date <= p_date and x.end_date >= p_date and extract(dow from p_date)::int = any(x.days) and (x.archived_at is null or x.archived_at::date >= p_date) loop
    v_done := p_date < n::date or n::time > c.end_time;
    select coalesce(jsonb_agg(jsonb_build_object('name', t.full_name, 'status', coalesce(a.status, case when v_done then 'غائب' else 'لم يسجل بعد' end),
             'time', to_char(a.checkin_at at time zone 'Asia/Riyadh','HH24:MI'), 'manual', false) order by t.full_name), '[]')
      into v_rows from enrollments e join trainees t on t.id = e.trainee_id left join attendance a on a.enrollment_id = e.id and a.att_date = p_date
     where e.cohort_id = c.id and e.status <> 'ملغى';
    groups := groups || jsonb_build_object('key', c.id, 'label', c.pname || ' · الدفعة ' || c.number, 'session', jsonb_build_object('start', to_char(c.start_time,'HH24:MI'), 'end', to_char(c.end_time,'HH24:MI')), 'rows', v_rows);
    v_all := v_all || v_rows;
  end loop;
  return jsonb_build_object('date', p_date, 'closed', p_date < n::date or n::time >= time '20:30', 'generated_at', now(),
    'summary', jsonb_build_object('sessions_scheduled', jsonb_array_length(groups), 'expected', jsonb_array_length(v_all),
      'present', (select count(*) from jsonb_array_elements(v_all) x where x->>'status' = 'حاضر'), 'late', (select count(*) from jsonb_array_elements(v_all) x where x->>'status' = 'متأخر'),
      'absent', (select count(*) from jsonb_array_elements(v_all) x where x->>'status' = 'غائب'), 'pending', (select count(*) from jsonb_array_elements(v_all) x where x->>'status' = 'لم يسجل بعد'), 'excused', 0),
    'groups', groups,
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('type', case when result = 'already' then 'duplicate' else 'checkin_fail' end,
        'text', case result when 'already' then 'مسح مكرر في اليوم نفسه (لم يُحتسب مرتين)' when 'not_in_cohort' then 'محاولات تحضير مرفوضة: رقم غير مسجّل' when 'no_session' then 'محاولات تحضير مرفوضة: خارج وقت الجلسة'
                     when 'bad_code' then 'محاولات تحضير مرفوضة: رمز يوم خاطئ' else 'محاولات تحضير مرفوضة: ' || result end, 'count', cnt))
        from (select result, count(*) cnt from checkin_attempts where date = p_date and result <> 'ok' group by result) q), '[]')
      || coalesce((select jsonb_agg(jsonb_build_object('type','device','text','تحضير أكثر من طالب من جهاز واحد','count',k))
        from (select count(distinct trainee_hint) k from checkin_attempts where date = p_date and result in ('ok','already') and device <> '' and trainee_hint is not null group by device having count(distinct trainee_hint) > 1) q), '[]'),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('teacher', te.full_name, 'reminders', q.r, 'guardians', q.g))
        from (select sender, count(*) filter (where "to" = 'student') r, count(*) filter (where "to" = 'guardian') g from notifications where date = p_date and sender like 'teacher:%' group by sender) q
        join teachers te on 'teacher:' || te.id = q.sender), '[]'),
    'homework', '[]'::jsonb,
    'completeness', case when p_date < n::date or n::time >= time '20:30' then 'مكتملة حتى وقت التوليد' else 'جزئية: اليوم لم ينتهِ بعد' end);
end $$;

-- توليد التقرير: snapshot مرة واحدة لكل تاريخ (إعادة التشغيل لا تكرره)، و revision تضيف إصدارًا مرقّمًا
create or replace function generate_daily_report(p_date date default null, p_kind text default 'snapshot', p_note text default '', p_auto boolean default false) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d date := coalesce(p_date, riyadh_now()::date); prev daily_reports%rowtype; v_data jsonb; v_changes text[] := '{}'; r daily_reports%rowtype; k text;
begin
  if not p_auto and not is_admin() then raise exception 'غير مصرح'; end if;
  perform pg_advisory_xact_lock(hashtext('daily_report:' || d));                                    -- يمنع التوليد المتزامن
  select * into prev from daily_reports where date = d order by version desc limit 1;
  if p_kind = 'snapshot' and prev.id is not null then
    select * into r from daily_reports where date = d and version = 1; return jsonb_build_object('existing', true, 'report', to_jsonb(r));
  end if;
  v_data := build_daily_report(d);
  if prev.id is not null then
    foreach k in array array['present','late','absent','pending','expected'] loop
      if (prev.data->'summary'->>k) is distinct from (v_data->'summary'->>k) then
        v_changes := v_changes || (case k when 'present' then 'الحاضرون' when 'late' then 'المتأخرون' when 'absent' then 'الغائبون' when 'pending' then 'لم يسجلوا' else 'المتوقعون' end || ': ' || (prev.data->'summary'->>k) || ' ← ' || (v_data->'summary'->>k));
      end if;
    end loop;
  end if;
  insert into daily_reports(date, version, kind, data, note, changes, auto, generated_by)
  values (d, coalesce(prev.version, 0) + 1, case when prev.id is null then 'snapshot' else 'revision' end, v_data, coalesce(p_note,''), v_changes, p_auto, auth.uid())
  returning * into r;
  insert into daily_report_runs(date, kind, status) values (d, r.kind, 'success');
  return jsonb_build_object('existing', false, 'report', to_jsonb(r));
end $$;
revoke execute on function generate_daily_report(date, text, text, boolean), build_daily_report(date) from anon;

-- المهمة المجدولة: 20:30 الرياض = 17:30 UTC (لا توقيت صيفي في المملكة). مراجعة نهائية بعد فترة سماح 21:15.
-- تُسجَّل محاولة فاشلة في daily_report_runs ليظهر الفشل للمالك، ويعاد التنفيذ بأمان دون تكرار اللقطة.
create or replace function run_daily_report_job(p_kind text) returns void language plpgsql volatile security definer set search_path = public as $$
begin
  begin perform generate_daily_report(riyadh_now()::date, p_kind, '', true);
  exception when others then insert into daily_report_runs(date, kind, status, error) values (riyadh_now()::date, p_kind, 'failed', sqlerrm); end;
end $$;
revoke execute on function run_daily_report_job(text) from anon, authenticated;
do $$ begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname in ('sama_daily_report', 'sama_daily_report_final', 'sama_daily_report_retry');
    perform cron.schedule('sama_daily_report',       '30 17 * * *', $j$select run_daily_report_job('snapshot')$j$);
    perform cron.schedule('sama_daily_report_retry', '45 17 * * *', $j$select run_daily_report_job('snapshot')$j$);   -- إعادة محاولة آمنة إن فشلت الأولى
    perform cron.schedule('sama_daily_report_final', '15 18 * * *', $j$select run_daily_report_job('revision')$j$);
  end if;
end $$;
