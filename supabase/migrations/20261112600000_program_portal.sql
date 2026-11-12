-- =====================================================================
-- بوابة متدربي البرامج: بوابة المتدرب (وولي الأمر) تعرض حضور البرامج التدريبية (الدفعات) وتقدمها
-- بدل صفحة «حضوري». المتدرب = مشترك في باقة أو مسجّل في برنامج (مطابق لـ rolesOfPhone وscopeData).
-- =====================================================================
create or replace function portal_roles() returns text[] language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when exists (select 1 from teachers where active and phone = my_phone()) then 'teacher' end,
    case when exists (select 1 from trainees t where t.phone = my_phone() and (
           exists (select 1 from subscriptions s where s.trainee_id = t.id)
        or exists (select 1 from enrollments e where e.trainee_id = t.id and e.status <> 'ملغى'))) then 'student' end,
    case when exists (select 1 from guardian_links where status = 'verified' and guardian_phone = my_phone()) then 'guardian' end,
    case when is_admin() then 'admin' end], null);
$$;

alter function portal_data(text) rename to portal_data_mirror;
revoke execute on function portal_data_mirror(text) from public, anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_mirror(p_role); ids uuid[]; eids uuid[];
begin
  if p_role not in ('student', 'guardian') then return base; end if;
  select coalesce(array_agg((x->>'id')::uuid), '{}') into ids from jsonb_array_elements(base->'trainees') x;
  select coalesce(array_agg(id), '{}') into eids from enrollments where trainee_id = any(ids);
  return base || jsonb_build_object(
    'settings', (base->'settings') || (select jsonb_build_object('msg_ok',msg_ok,'msg_low',msg_low,'msg_consec',msg_consec,'msg_last',msg_last,'msg_lost',msg_lost,'msg_done',msg_done,'msg_below',msg_below,'msg_upcoming',msg_upcoming) from settings where id = 1),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(e)) from enrollments e where e.id = any(eids)), '[]'),
    'cohorts', coalesce((select jsonb_agg(to_jsonb(c)) from cohorts c where c.id in (select cohort_id from enrollments where id = any(eids))), '[]'),
    'programs', coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'code',p.code,'name',p.name,'category',p.category,'accreditation_no',p.accreditation_no,'hours',p.hours))
                          from programs p where p.id in (select program_id from enrollments where id = any(eids))), '[]'),
    'attendance', coalesce((select jsonb_agg(to_jsonb(a)) from attendance a where a.enrollment_id = any(eids)), '[]'),
    'certificates', coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'serial',x.serial,'enrollment_id',x.enrollment_id,'rate',x.rate,'issued_at',x.issued_at,'revoked',x.revoked))
                              from certificates x where x.enrollment_id = any(eids)), '[]'));
end $$;
revoke execute on function portal_data(text) from anon;
grant execute on function portal_data(text) to authenticated;
