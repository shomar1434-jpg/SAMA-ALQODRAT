-- الخطوة AR: تحليل نقاط الضعف ↔ src/analysis_logic.js
-- البوابة تُرسل التصنيف الحالي لأسئلة المحاولات والاختبارات (q_meta: {id: [category, unit]})،
-- والمدرب يرى محاكيات متدربيه (يعرض منها مقرراته فقط).
alter function portal_data(text) rename to portal_data_weak;
revoke execute on function portal_data_weak(text) from public, anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_weak(p_role); ids uuid[]; v_meta jsonb;
begin
  if base is null then return base; end if;
  select coalesce(array_agg((t->>'id')::uuid), '{}') into ids from jsonb_array_elements(coalesce(base->'trainees','[]')) t where t->>'id' ~ '^[0-9a-f-]{36}$';
  if p_role = 'teacher' and cardinality(ids) > 0 then
    base := base || jsonb_build_object('attempts', coalesce(base->'attempts','[]') || coalesce((select jsonb_agg(to_jsonb(a)) from attempts a
      where a.trainee_id = any(ids) and a.kind = 'sim' and a.submitted_at is not null), '[]'));
  end if;
  select jsonb_object_agg(q.id, jsonb_build_array(q.category, q.unit)) into v_meta from questions q
   where q.id in (select (e->>'id')::uuid from jsonb_array_elements(coalesce(base->'attempts','[]')) a, jsonb_array_elements(coalesce(a->'snapshot','[]')) e where e->>'id' ~ '^[0-9a-f-]{36}$'
                  union select (e->>'id')::uuid from jsonb_array_elements(coalesce(base->'assignments','[]')) a, jsonb_array_elements(case when jsonb_typeof(a->'quiz') = 'array' then a->'quiz' else '[]' end) e where e->>'id' ~ '^[0-9a-f-]{36}$');
  return base || jsonb_build_object('q_meta', coalesce(v_meta, '{}'));
end $$;
revoke execute on function portal_data(text) from public, anon;
grant execute on function portal_data(text) to authenticated;
