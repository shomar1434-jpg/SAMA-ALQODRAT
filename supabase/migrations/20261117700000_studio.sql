-- الخطوة AZ: استوديو سما للبث (قرار المالك 17 نوفمبر): الشرح في قاعة Zoom المركز ويُبث إلى يوتيوب، ويظهر في بوابة المتدرب.
-- محاضرة لكل مدرب بمقرر من مقرراته (لقسمه) أو بدفعة مسندة إليه، وموعد ومدة ورابط يوتيوب، وإتاحة التسجيل بعد الانتهاء.
-- معرّف الفيديو لا يُرسل للمتدرب قبل 15 دقيقة من البداية، ولا بعد الانتهاء إلا بإتاحة التسجيل ↔ src/studio_logic.js
create table if not exists lectures (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete restrict,
  section text not null check (section in ('boys','girls','all')),
  subject text, cohort_id uuid references cohorts(id) on delete restrict,
  title text not null check (length(title) between 3 and 120),
  starts_at timestamptz not null, minutes int not null check (minutes between 15 and 300),
  youtube_id text not null default '' check (youtube_id = '' or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  recording boolean not null default true,
  status text not null default 'scheduled' check (status in ('scheduled','ended','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((subject is null) <> (cohort_id is null))
);
create index if not exists lectures_teacher on lectures(teacher_id, starts_at desc);
create index if not exists lectures_scope on lectures(section, subject, starts_at desc);
alter table lectures enable row level security;
drop policy if exists lectures_admin on lectures;
create policy lectures_admin on lectures for select using (is_admin());
drop trigger if exists lectures_audit on lectures;
create trigger lectures_audit after insert or update or delete on lectures for each row execute function audit_row();

create or replace function lecture_can_watch(l lectures) returns boolean language sql stable as $$
  select l.youtube_id <> '' and l.status <> 'cancelled' and (
    (l.status = 'scheduled' and now() <= l.starts_at + make_interval(mins => l.minutes) and now() >= l.starts_at - interval '15 minutes')
    or ((l.status = 'ended' or now() > l.starts_at + make_interval(mins => l.minutes)) and l.recording)) $$;
create or replace function lecture_public(l lectures) returns jsonb language sql stable as $$
  select jsonb_build_object('id', l.id, 'teacher_id', l.teacher_id, 'subject', l.subject, 'cohort_id', l.cohort_id, 'section', l.section, 'title', l.title,
    'starts_at', l.starts_at, 'minutes', l.minutes, 'status', l.status, 'recording', l.recording, 'youtube_id', case when lecture_can_watch(l) then l.youtube_id end) $$;

-- المدرب: إنشاء أو تعديل محاضرة في نطاقه
create or replace function teacher_save_lecture(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher(); v_id uuid := nullif(p->>'id','')::uuid; v_cohort uuid := nullif(p->>'cohort_id','')::uuid; v_subject text := nullif(p->>'subject','');
  v_yt text := coalesce(p->>'youtube_id',''); v_min int; v_at timestamptz; l lectures;
begin
  if me.id is null then raise exception 'غير مصرح'; end if;
  if v_cohort is not null then
    if not exists (select 1 from cohorts where id = v_cohort and teacher_id = me.id) then raise exception 'المقرر أو الدفعة خارج نطاقك'; end if; v_subject := null;
  elsif v_subject is null or not (v_subject = any(me.subjects)) then raise exception 'المقرر أو الدفعة خارج نطاقك'; end if;
  if v_yt <> '' and v_yt !~ '^[A-Za-z0-9_-]{11}$' then raise exception 'رابط يوتيوب غير صحيح'; end if;
  begin v_min := (p->>'minutes')::int; v_at := (p->>'starts_at')::timestamptz; exception when others then raise exception 'حدّد موعد المحاضرة ومدتها'; end;
  if v_min is null or v_min < 15 or v_min > 300 then raise exception 'مدة المحاضرة من 15 إلى 300 دقيقة'; end if;
  if v_at is null then raise exception 'حدّد موعد المحاضرة'; end if;
  if length(btrim(coalesce(p->>'title',''))) < 3 then raise exception 'اكتب عنوان المحاضرة (3 إلى 120 حرفًا)'; end if;
  if v_id is null then
    insert into lectures(teacher_id, section, subject, cohort_id, title, starts_at, minutes, youtube_id, recording)
    values (me.id, case when v_cohort is null then me.section else 'all' end, v_subject, v_cohort, left(btrim(p->>'title'), 120), v_at, v_min, v_yt, coalesce((p->>'recording')::boolean, true)) returning * into l;
  else
    update lectures set subject = v_subject, cohort_id = v_cohort, section = case when v_cohort is null then me.section else 'all' end, title = left(btrim(p->>'title'), 120),
      starts_at = v_at, minutes = v_min, youtube_id = v_yt, recording = coalesce((p->>'recording')::boolean, recording), updated_at = now()
    where id = v_id and teacher_id = me.id and status <> 'cancelled' returning * into l;
    if l.id is null then raise exception 'المحاضرة غير موجودة أو ملغاة'; end if;
  end if;
  return jsonb_build_object('ok', true, 'id', l.id);
end $$;
-- المدرب: إنهاء أو إلغاء أو إعادة الجدولة؛ والإدارة: الإلغاء والإنهاء
create or replace function teacher_set_lecture(p_id uuid, p_status text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher();
begin
  if p_status not in ('scheduled','ended','cancelled') then raise exception 'حالة غير صالحة'; end if;
  update lectures set status = p_status, updated_at = now() where id = p_id and (teacher_id = me.id or is_admin());
  if not found then raise exception 'غير مصرح'; end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function admin_lectures() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  return coalesce((select jsonb_agg(to_jsonb(l) || jsonb_build_object('teacher_name', t.full_name, 'program_name', pr.name) order by l.starts_at desc)
    from lectures l join teachers t on t.id = l.teacher_id left join cohorts c on c.id = l.cohort_id left join programs pr on pr.id = c.program_id), '[]');
end $$;

-- البوابات: المتدرب يرى محاضرات مقرراته (اشتراك قائم في قسمه) ودفعاته، والمدرب محاضراته كاملة
alter function portal_data(text) rename to portal_data_studio;
revoke execute on function portal_data_studio(text) from public, anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_studio(p_role); ids uuid[]; me teachers;
begin
  if base is null then return base; end if;
  if p_role = 'student' then
    select coalesce(array_agg((t->>'id')::uuid), '{}') into ids from jsonb_array_elements(coalesce(base->'trainees','[]')) t where t->>'id' ~ '^[0-9a-f-]{36}$';
    return base || jsonb_build_object('lectures', coalesce((select jsonb_agg(lecture_public(l) order by l.starts_at) from lectures l where l.status <> 'cancelled' and (
      (l.cohort_id is not null and exists (select 1 from enrollments e where e.cohort_id = l.cohort_id and e.trainee_id = any(ids) and e.status <> 'ملغى'))
      or (l.subject is not null and exists (select 1 from subscriptions s where s.trainee_id = any(ids) and s.status in ('pending','active') and s.section = l.section and l.subject = any(s.subjects))))), '[]'));
  elsif p_role = 'teacher' then
    me := me_teacher();
    return base || jsonb_build_object('lectures', coalesce((select jsonb_agg(to_jsonb(l) order by l.starts_at desc) from lectures l where l.teacher_id = me.id), '[]'));
  end if;
  return base;
end $$;
revoke execute on function lecture_can_watch(lectures), lecture_public(lectures) from public, anon, authenticated;
revoke execute on function teacher_save_lecture(jsonb), teacher_set_lecture(uuid, text), admin_lectures(), portal_data(text) from public, anon;
grant execute on function teacher_save_lecture(jsonb), teacher_set_lecture(uuid, text), admin_lectures(), portal_data(text) to authenticated;
