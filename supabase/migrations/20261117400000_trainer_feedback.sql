-- الخطوة AV (طلبات المالك لبوابة المدرب): تغذية راجعة على إجابات المتدرب بعد التسليم.
-- ملاحظة عامة (teacher_note) وملاحظة لكل سؤال (comments: {معرّف السؤال: نص}) لا تغيّر الدرجة ولا التصحيح الآلي، ويراها المتدرب في واجبه.
alter table submissions add column if not exists comments jsonb;
alter table submissions add column if not exists teacher_note text;

create or replace function teacher_comment(p_id uuid, p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher(); s submissions; a assignments; c jsonb := '{}'; k text; v text; n int := 0;
begin
  if me.id is null then raise exception 'غير مصرح'; end if;
  select * into s from submissions where id = p_id for update;
  select * into a from assignments where id = s.assignment_id and teacher_id = me.id;
  if s.id is null or a.id is null then raise exception 'غير مصرح'; end if;
  if s.status = 'draft' then raise exception 'لم يُسلِّم المتدرب بعد'; end if;
  if jsonb_typeof(p->'comments') = 'object' then
    for k, v in select key, btrim(value) from jsonb_each_text(p->'comments') loop
      if v <> '' then
        if a.kind <> 'quiz' or not exists (select 1 from jsonb_array_elements(coalesce(a.quiz, '[]')) q where q->>'id' = k) then raise exception 'ملاحظة على سؤال خارج الاختبار'; end if;
        n := n + 1; if n > 100 then raise exception 'الحد 100 ملاحظة'; end if;
        c := c || jsonb_build_object(k, left(v, 500));
      end if;
    end loop;
  end if;
  update submissions set teacher_note = nullif(left(btrim(coalesce(p->>'note', '')), 1000), ''), comments = nullif(c, '{}'::jsonb) where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function teacher_comment(uuid, jsonb) from public, anon;
grant execute on function teacher_comment(uuid, jsonb) to authenticated;
