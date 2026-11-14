-- =====================================================================
-- حواجز الاستيراد: لا يُقبل كشف فارغ للمسجّلين سابقًا، ولا يتكرر سؤال بنصه في بنك المدرب نفسه عند إعادة اللصق.
-- (كشف المسجّلين يمنع التكرار أصلًا بالهوية والباقة، والبنك المشترك يحدّث برمز السؤال.) مطابق لـ src/data2.js.
-- =====================================================================
alter function admin_import_legacy(jsonb) rename to admin_import_legacy_base;
create or replace function admin_import_legacy(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if p is null or jsonb_typeof(p) <> 'array' or jsonb_array_length(p) = 0 then raise exception 'لا صفوف للاستيراد؛ اختر الملف من جديد'; end if;
  return admin_import_legacy_base(p);
end $$;

create or replace function admin_import_questions(p_teacher uuid, p_rows jsonb, p_status text default 'published') returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare t teachers%rowtype; r jsonb; i int := 0; n int := 0; v_skip int := 0; v_opts text[];
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into t from teachers where id = p_teacher;
  if t.id is null then raise exception 'اختر المدرب'; end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then raise exception 'لا توجد أسئلة صالحة للاستيراد'; end if;
  if jsonb_array_length(p_rows) > 2000 then raise exception 'الحد 2000 سؤال في المرة الواحدة'; end if;
  for r in select * from jsonb_array_elements(p_rows) loop
    i := i + 1;
    if not (r->>'subject' = any(t.subjects)) then raise exception 'السطر %: المقرر ليس من مقررات المدرب', i; end if;
    begin v_opts := q_check(r); exception when others then raise exception 'السطر %: %', i, sqlerrm; end;
    if exists (select 1 from questions q where q.teacher_id = t.id and q.status <> 'deleted' and q.subject = r->>'subject' and btrim(q.text) = btrim(r->>'text')) then v_skip := v_skip + 1; continue; end if;
    insert into questions(teacher_id, section, subject, unit, skill, text, options, correct, explanation, difficulty, status)
    values (t.id, t.section, r->>'subject', coalesce(nullif(trim(r->>'unit'),''),'عام'), coalesce(r->>'skill',''), trim(r->>'text'), v_opts, (r->>'correct')::int, coalesce(r->>'explanation',''),
            case when r->>'difficulty' in ('سهل','متوسط','صعب') then r->>'difficulty' else 'متوسط' end, case when p_status = 'draft' then 'draft' else 'published' end);
    n := n + 1;
  end loop;
  return jsonb_build_object('count', n, 'skipped', v_skip);
end $$;

revoke execute on function admin_import_legacy_base(jsonb) from public, anon, authenticated;
revoke execute on function admin_import_legacy(jsonb), admin_import_questions(uuid, jsonb, text) from public, anon;
grant execute on function admin_import_legacy(jsonb), admin_import_questions(uuid, jsonb, text) to authenticated;
