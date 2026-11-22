-- قرار المالك (22 نوفمبر): في «مراجعة إجاباتي» ما بقيت للمتدرب محاولة، يرى صح/خطأ لكل سؤال (marks) دون كشف الإجابة الصحيحة.
-- مطابق لـ marksOf/submissionPublic في src/learning_logic.js. يغلّف portal_data الحالي دون تغيير غيره.
alter function portal_data(text) rename to portal_data_marks;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_marks(p_role);
begin
  if base is null or p_role not in ('student','guardian') or jsonb_typeof(base->'submissions') <> 'array' then return base; end if;
  return base || jsonb_build_object('submissions', coalesce((select jsonb_agg(
    case when coalesce((x->>'review_hidden')::boolean, false) then x || jsonb_build_object('marks', coalesce((
           select jsonb_object_agg(r->>'id', (s.answers ? (r->>'id')) and (s.answers->>(r->>'id')) = (r->>'correct'))
           from submissions s, jsonb_array_elements(coalesce(s.review, '[]')) r where s.id = (x->>'id')::uuid), '{}'))
         else x end) from jsonb_array_elements(base->'submissions') x), '[]'));
end $$;
revoke execute on function portal_data_marks(text) from public, anon, authenticated;
revoke execute on function portal_data(text) from public, anon;
grant execute on function portal_data(text) to authenticated;
