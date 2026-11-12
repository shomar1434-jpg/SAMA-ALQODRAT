-- =====================================================================
-- مرآة الإنجاز للمدرب: يرى نسبة إنجاز كل متدرب بالحساب نفسه الذي يراه المتدرب
-- (src/portal_logic.js: achievementOf). يضيف إلى portal_data('teacher') واجبات كل مقررات متدربيه
-- (حقول التوقيت فقط) وحالات تسليمها، دون نصوص الإجابات.
-- =====================================================================
alter function portal_data(text) rename to portal_data_learning;
revoke execute on function portal_data_learning(text) from public, anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_learning(p_role); me teachers := me_teacher(); ids uuid[];
begin
  if p_role <> 'teacher' or me.id is null then return base; end if;
  select coalesce(array_agg((x->>'id')::uuid), '{}') into ids from jsonb_array_elements(base->'trainees') x;
  return base || jsonb_build_object(
    'hw_assignments', coalesce((select jsonb_agg(jsonb_build_object('id', a.id, 'section', a.section, 'subject', a.subject, 'publish_date', a.publish_date, 'due_date', a.due_date, 'max_score', a.max_score))
       from assignments a where exists (select 1 from subscriptions s where s.trainee_id = any(ids) and s.section = me.section and s.section = a.section and a.subject = any(s.subjects))), '[]'),
    'hw_submissions', coalesce((select jsonb_agg(jsonb_build_object('assignment_id', x.assignment_id, 'trainee_id', x.trainee_id, 'status', x.status, 'score', x.score))
       from submissions x join assignments a on a.id = x.assignment_id
       where x.trainee_id = any(ids) and exists (select 1 from subscriptions s where s.trainee_id = x.trainee_id and s.section = a.section and a.subject = any(s.subjects))), '[]'));
end $$;
revoke execute on function portal_data(text) from anon;
grant execute on function portal_data(text) to authenticated;
