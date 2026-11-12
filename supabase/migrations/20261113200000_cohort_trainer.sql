-- =====================================================================
-- الخطوة P — ربط مدرب البرنامج بالدفعة: cohorts.teacher_id يربط الدفعة بحساب مدرب،
-- فيرى كشفها وحضورها في بوابته (أسماء المتدربين فقط)، ويصله تنبيه بدء المحاضرة.
-- مطابق لـ scopeData (دور المدرب) و sessionReminders في الواجهة.
-- =====================================================================
alter table cohorts add column if not exists teacher_id uuid references teachers(id) on delete set null;
create index if not exists cohorts_teacher on cohorts(teacher_id) where teacher_id is not null;

alter function portal_data(text) rename to portal_data_bank;
revoke execute on function portal_data_bank(text) from public, anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_bank(p_role); me teachers := me_teacher(); cids uuid[];
begin
  if base is null or p_role <> 'teacher' or me.id is null then return base; end if;
  select coalesce(array_agg(id), '{}') into cids from cohorts where teacher_id = me.id and archived_at is null;
  return base || jsonb_build_object(
    'cohorts', coalesce((select jsonb_agg(to_jsonb(c)) from cohorts c where c.id = any(cids)), '[]'),
    'programs', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'code', p.code, 'name', p.name, 'hours', p.hours)) from programs p where exists (select 1 from cohorts c where c.id = any(cids) and c.program_id = p.id)), '[]'),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(e)) from enrollments e where e.cohort_id = any(cids) and e.status <> 'ملغى'), '[]'),
    'attendance', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('time', to_char(a.checkin_at at time zone 'Asia/Riyadh', 'HH24:MI:SS')))
        from attendance a join enrollments e on e.id = a.enrollment_id where e.cohort_id = any(cids) and e.status <> 'ملغى'), '[]'),
    'cohort_trainees', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'full_name', t.full_name, 'gender', t.gender))
        from trainees t where exists (select 1 from enrollments e where e.trainee_id = t.id and e.cohort_id = any(cids) and e.status <> 'ملغى')), '[]'));
end $$;
revoke execute on function portal_data(text) from public, anon;
grant execute on function portal_data(text) to authenticated;

-- تنبيه بدء المحاضرة لمدرب الدفعة
alter function run_session_reminders() rename to run_session_reminders_base;
create or replace function run_session_reminders() returns int language plpgsql volatile security definer set search_path = public as $$
declare cnt int := run_session_reminders_base(); n timestamp := riyadh_now(); d date := n::date; hm time := n::time; mins int; x int;
begin
  select soon_minutes into mins from settings where id = 1;
  if coalesce(mins, 0) <= 0 then return cnt; end if;
  insert into notifications(date, sender, "to", teacher_id, kind, text, dedupe_key)
    select d, 'system', 'teacher', te.id, 'session_soon', 'تبدأ محاضرتك في «' || pr.name || '» الساعة ' || t12(co.start_time) || '، بعد ' || mins || ' دقائق.', 'soon:t:' || te.id || ':' || d || ':c:' || co.id
    from cohorts co join programs pr on pr.id = co.program_id join teachers te on te.id = co.teacher_id and te.active
    where co.archived_at is null and co.start_date <= d and co.end_date >= d and extract(dow from d)::int = any(co.days)
      and hm >= co.start_time - make_interval(mins => mins) and hm < co.start_time
    on conflict (dedupe_key) do nothing;
  get diagnostics x = row_count;
  return cnt + x;
end $$;
revoke execute on function run_session_reminders(), run_session_reminders_base() from public, anon, authenticated;
