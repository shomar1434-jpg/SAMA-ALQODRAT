-- الخطوة BC (قرار المالك 17 نوفمبر): قاعة Zoom ثابتة لكل مدرب، وجدول أسبوعي ثابت تُولَّد منه محاضرات كل يوم،
-- والبث على قناة يوتيوب المركز (غير مدرج) يُجلب آليًا بعد ربط القناة (Edge Function «youtube») ويُسند إلى المحاضرة بموعده.
-- ↔ src/studio_logic.js (checkSlot، slotLectures، assignVideos)
alter table teachers add column if not exists zoom_url text not null default '';
alter table teachers add column if not exists yt_tag text not null default '';
alter table teachers drop constraint if exists teachers_zoom_url_check;
alter table teachers add constraint teachers_zoom_url_check check (zoom_url = '' or zoom_url ~* '^https://([a-z0-9-]+\.)*zoom\.us/(j|my|w|s)/[A-Za-z0-9._?=&/-]+$');
alter table settings add column if not exists yt_channel_id text not null default '' check (yt_channel_id = '' or yt_channel_id ~ '^UC[A-Za-z0-9_-]{22}$');
alter table settings add column if not exists yt_channel_title text not null default '';
alter table settings add column if not exists yt_synced_at timestamptz;

create table if not exists lecture_slots (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references teachers(id) on delete restrict,
  section text not null check (section in ('boys','girls','all')),
  subject text, cohort_id uuid references cohorts(id) on delete restrict,
  title text not null check (length(title) between 3 and 120),
  dow int[] not null check (cardinality(dow) between 1 and 7 and dow <@ array[0,1,2,3,4,5,6]),
  start_time time not null, minutes int not null check (minutes between 15 and 300),
  recording boolean not null default true, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((subject is null) <> (cohort_id is null))
);
alter table lecture_slots enable row level security;
drop policy if exists lecture_slots_admin on lecture_slots;
create policy lecture_slots_admin on lecture_slots for select using (is_admin());
drop trigger if exists lecture_slots_audit on lecture_slots;
create trigger lecture_slots_audit after insert or update or delete on lecture_slots for each row execute function audit_row();

alter table lectures add column if not exists slot_id uuid references lecture_slots(id) on delete set null;
alter table lectures add column if not exists slot_date date;
create unique index if not exists lectures_slot_day on lectures(slot_id, slot_date) where slot_id is not null;

-- ربط القناة: رمز التحديث لا يقرؤه إلا مفتاح الخدمة (RLS بلا سياسات)
create table if not exists yt_auth (
  id int primary key default 1 check (id = 1),
  refresh_token text, state text, state_expires timestamptz, return_to text, linked_at timestamptz, linked_by uuid
);
alter table yt_auth enable row level security;
insert into yt_auth(id) values (1) on conflict do nothing;

create table if not exists yt_videos (
  video_id text primary key check (video_id ~ '^[A-Za-z0-9_-]{11}$'),
  title text not null default '', privacy text not null default '', life_cycle text not null default '',
  scheduled_start timestamptz, actual_start timestamptz, actual_end timestamptz, thumb text not null default '',
  lecture_id uuid references lectures(id) on delete set null, synced_at timestamptz not null default now()
);
alter table yt_videos enable row level security;
drop policy if exists yt_videos_admin on yt_videos;
create policy yt_videos_admin on yt_videos for select using (is_admin());

-- توليد محاضرات الجدول الثابت (داخلية): أيام القسم بلا جلسة تُتخطى، والدفعة داخل مدتها فقط
create or replace function ensure_lectures(p_from date default null, p_days int default 8) returns int
language plpgsql volatile security definer set search_path = public as $$
declare d0 date := coalesce(p_from, riyadh_now()::date); s lecture_slots; c cohorts; d date; n int := 0; ses record;
begin
  for s in select * from lecture_slots where active loop
    c := null;
    if s.cohort_id is not null then select * into c from cohorts where id = s.cohort_id; if c.id is null or c.archived_at is not null then continue; end if; end if;
    for i in 0 .. greatest(p_days, 1) - 1 loop
      d := d0 + i;
      if not (extract(dow from d)::int = any(s.dow)) then continue; end if;
      if c.id is not null and (d < c.start_date or d > c.end_date) then continue; end if;
      if c.id is null and s.section in ('boys','girls') then
        select * into ses from session_on(s.section, d); if ses.start_time is null then continue; end if;
      end if;
      insert into lectures(teacher_id, section, subject, cohort_id, title, starts_at, minutes, recording, slot_id, slot_date)
      values (s.teacher_id, s.section, s.subject, s.cohort_id, s.title, (d + s.start_time) at time zone 'Asia/Riyadh', s.minutes, s.recording, s.id, d)
      on conflict (slot_id, slot_date) where slot_id is not null do nothing;
      if found then n := n + 1; end if;
    end loop;
  end loop;
  return n;
end $$;

-- إسناد البثوث إلى المحاضرات (داخلية) ↔ assignVideos
create or replace function yt_assign() returns int language plpgsql volatile security definer set search_path = public as $$
declare v yt_videos; l lectures; n int := 0; c int; t int;
begin
  for v in select * from yt_videos y where y.actual_start is not null and y.lecture_id is null
             and not exists (select 1 from lectures x where x.youtube_id = y.video_id) order by y.actual_start loop
    select count(*), count(*) filter (where te.yt_tag <> '' and position(te.yt_tag in v.title) > 0) into c, t
      from lectures x join teachers te on te.id = x.teacher_id
     where x.status <> 'cancelled' and x.youtube_id = '' and v.actual_start between x.starts_at - interval '30 minutes' and x.starts_at + make_interval(mins => x.minutes);
    l := null;
    if t = 1 then
      select x.* into l from lectures x join teachers te on te.id = x.teacher_id
       where x.status <> 'cancelled' and x.youtube_id = '' and v.actual_start between x.starts_at - interval '30 minutes' and x.starts_at + make_interval(mins => x.minutes)
         and te.yt_tag <> '' and position(te.yt_tag in v.title) > 0;
    elsif c = 1 then
      select x.* into l from lectures x
       where x.status <> 'cancelled' and x.youtube_id = '' and v.actual_start between x.starts_at - interval '30 minutes' and x.starts_at + make_interval(mins => x.minutes);
    end if;
    if l.id is not null then
      update lectures set youtube_id = v.video_id, updated_at = now() where id = l.id;
      update yt_videos set lecture_id = l.id where video_id = v.video_id; n := n + 1;
    end if;
  end loop;
  return n;
end $$;

-- تحديث قائمة بثوث القناة (يستدعيها Edge Function بمفتاح الخدمة فقط)
create or replace function yt_upsert_videos(p jsonb, p_channel text default null, p_title text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare x jsonb; n int := 0;
begin
  for x in select * from jsonb_array_elements(coalesce(p, '[]')) loop
    continue when coalesce(x->>'video_id','') !~ '^[A-Za-z0-9_-]{11}$';
    insert into yt_videos(video_id, title, privacy, life_cycle, scheduled_start, actual_start, actual_end, thumb, synced_at)
    values (x->>'video_id', left(coalesce(x->>'title',''), 200), coalesce(x->>'privacy',''), coalesce(x->>'life_cycle',''),
            nullif(x->>'scheduled_start','')::timestamptz, nullif(x->>'actual_start','')::timestamptz, nullif(x->>'actual_end','')::timestamptz, left(coalesce(x->>'thumb',''), 300), now())
    on conflict (video_id) do update set title = excluded.title, privacy = excluded.privacy, life_cycle = excluded.life_cycle, scheduled_start = excluded.scheduled_start,
      actual_start = excluded.actual_start, actual_end = excluded.actual_end, thumb = excluded.thumb, synced_at = now();
    n := n + 1;
  end loop;
  update settings set yt_synced_at = now(), yt_channel_id = coalesce(nullif(p_channel, ''), yt_channel_id), yt_channel_title = coalesce(nullif(p_title, ''), yt_channel_title) where id = 1;
  return jsonb_build_object('ok', true, 'videos', n, 'assigned', yt_assign());
end $$;

-- بدء ربط القناة (المالك): حالة عشوائية صالحة 10 دقائق
create or replace function yt_begin_link(p_return text) returns text language plpgsql volatile security definer set search_path = public as $$
declare v text := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
begin
  if not is_owner() then raise exception 'ربط القناة للمالك وحده'; end if;
  if coalesce(p_return, '') !~ '^https://' then raise exception 'رابط العودة غير صالح'; end if;
  update yt_auth set state = v, state_expires = now() + interval '10 minutes', return_to = left(p_return, 300), linked_by = auth.uid() where id = 1;
  return v;
end $$;
create or replace function yt_unlink() returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_owner() then raise exception 'للمالك وحده'; end if;
  update yt_auth set refresh_token = null, state = null, linked_at = null where id = 1;
  update settings set yt_channel_title = '' where id = 1;
  insert into audit_logs(actor, actor_role, action, entity, detail) values (auth.uid(), 'owner', 'youtube.unlink', '1', '{}');
  return jsonb_build_object('ok', true);
end $$;
-- مزامنة لا تتكرر أكثر من مرة كل دقيقة (يستدعيها Edge Function قبل الجلب)
create or replace function yt_sync_due(p_force boolean default false) returns boolean language sql stable security definer set search_path = public as $$
  select (select refresh_token is not null from yt_auth where id = 1) and (p_force or coalesce((select yt_synced_at from settings where id = 1) < now() - interval '60 seconds', true)) $$;

-- الإدارة: الجدول الثابت وقاعات Zoom
create or replace function admin_save_slot(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare te teachers; v_id uuid := nullif(p->>'id','')::uuid; v_cohort uuid := nullif(p->>'cohort_id','')::uuid; v_subject text := nullif(p->>'subject','');
  v_dow int[]; v_time time; v_min int; s lecture_slots;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into te from teachers where id = nullif(p->>'teacher_id','')::uuid; if te.id is null then raise exception 'اختر المدرب'; end if;
  if length(btrim(coalesce(p->>'title',''))) < 3 then raise exception 'اكتب عنوان المحاضرة (3 إلى 120 حرفًا)'; end if;
  begin v_dow := array(select distinct x::int from jsonb_array_elements_text(p->'dow') x order by 1); v_time := (p->>'start_time')::time; v_min := (p->>'minutes')::int;
  exception when others then raise exception 'حدّد الأيام والوقت والمدة'; end;
  if cardinality(v_dow) = 0 or not (v_dow <@ array[0,1,2,3,4,5,6]) then raise exception 'اختر يومًا واحدًا على الأقل'; end if;
  if v_time is null then raise exception 'حدّد وقت البداية'; end if;
  if v_min is null or v_min < 15 or v_min > 300 then raise exception 'مدة المحاضرة من 15 إلى 300 دقيقة'; end if;
  if v_cohort is not null then
    if not exists (select 1 from cohorts where id = v_cohort and teacher_id = te.id) then raise exception 'المقرر أو الدفعة خارج نطاق المدرب'; end if; v_subject := null;
  elsif v_subject is null or not (v_subject = any(te.subjects)) then raise exception 'المقرر أو الدفعة خارج نطاق المدرب'; end if;
  if v_id is null then
    insert into lecture_slots(teacher_id, section, subject, cohort_id, title, dow, start_time, minutes, recording)
    values (te.id, case when v_cohort is null then te.section else 'all' end, v_subject, v_cohort, left(btrim(p->>'title'), 120), v_dow, v_time, v_min, coalesce((p->>'recording')::boolean, true)) returning * into s;
  else
    update lecture_slots set teacher_id = te.id, section = case when v_cohort is null then te.section else 'all' end, subject = v_subject, cohort_id = v_cohort,
      title = left(btrim(p->>'title'), 120), dow = v_dow, start_time = v_time, minutes = v_min, recording = coalesce((p->>'recording')::boolean, recording),
      active = coalesce((p->>'active')::boolean, active), updated_at = now() where id = v_id returning * into s;
    if s.id is null then raise exception 'الموعد غير موجود'; end if;
    -- المحاضرات القادمة غير المبدوءة تتبع التعديل
    delete from lectures where slot_id = s.id and starts_at > now() and youtube_id = '' and status = 'scheduled';
  end if;
  perform ensure_lectures(riyadh_now()::date, 8);
  return jsonb_build_object('ok', true, 'id', s.id);
end $$;
create or replace function admin_set_teacher_studio(p_teacher uuid, p_zoom text, p_tag text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if coalesce(p_zoom,'') <> '' and p_zoom !~* '^https://([a-z0-9-]+\.)*zoom\.us/(j|my|w|s)/[A-Za-z0-9._?=&/-]+$' then raise exception 'رابط قاعة Zoom غير صحيح'; end if;
  update teachers set zoom_url = btrim(coalesce(p_zoom,'')), yt_tag = left(btrim(coalesce(p_tag,'')), 60) where id = p_teacher;
  if not found then raise exception 'المدرب غير موجود'; end if;
  return jsonb_build_object('ok', true);
end $$;
-- إسناد يدوي لبث إلى محاضرة أو فكّه
create or replace function admin_assign_video(p_video text, p_lecture uuid) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if not exists (select 1 from yt_videos where video_id = p_video) then raise exception 'البث غير موجود'; end if;
  update lectures set youtube_id = '', updated_at = now() where youtube_id = p_video;
  update yt_videos set lecture_id = null where video_id = p_video;
  if p_lecture is not null then
    update lectures set youtube_id = p_video, updated_at = now() where id = p_lecture and status <> 'cancelled';
    if not found then raise exception 'المحاضرة غير موجودة أو ملغاة'; end if;
    update yt_videos set lecture_id = p_lecture where video_id = p_video;
  end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function admin_studio_data() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
    'linked', (select refresh_token is not null from yt_auth where id = 1), 'linked_at', (select linked_at from yt_auth where id = 1),
    'channel_id', (select yt_channel_id from settings where id = 1), 'channel_title', (select yt_channel_title from settings where id = 1), 'synced_at', (select yt_synced_at from settings where id = 1),
    'slots', coalesce((select jsonb_agg(to_jsonb(s) order by s.active desc, s.start_time) from lecture_slots s), '[]'),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'full_name', t.full_name, 'section', t.section, 'subjects', t.subjects, 'zoom_url', t.zoom_url, 'yt_tag', t.yt_tag) order by t.full_name) from teachers t where t.active), '[]'),
    'cohorts', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'teacher_id', c.teacher_id, 'number', c.number, 'program', p.name)) from cohorts c join programs p on p.id = c.program_id where c.archived_at is null and c.teacher_id is not null), '[]'),
    'videos', coalesce((select jsonb_agg(to_jsonb(v) order by coalesce(v.actual_start, v.scheduled_start) desc nulls last) from (select * from yt_videos order by coalesce(actual_start, scheduled_start) desc nulls last limit 200) v), '[]'));
end $$;
create or replace function admin_set_channel(p_channel text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_full_admin() then raise exception 'لمدير النظام فقط'; end if;
  if coalesce(p_channel,'') <> '' and p_channel !~ '^UC[A-Za-z0-9_-]{22}$' then raise exception 'معرّف القناة يبدأ بـ UC ويتكون من 24 حرفًا'; end if;
  update settings set yt_channel_id = coalesce(p_channel,'') where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- البوابات: المدرب يرى قاعته وجدوله؛ المتدرب يرى معرّف القناة (للبث الجاري قبل إسناده) ولا يرى قاعات Zoom
alter function portal_data(text) rename to portal_data_channel;
revoke execute on function portal_data_channel(text) from public, anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_channel(p_role); me teachers;
begin
  if base is null then return base; end if;
  if p_role = 'teacher' then
    me := me_teacher();
    return base || jsonb_build_object('zoom_url', me.zoom_url, 'slots', coalesce((select jsonb_agg(to_jsonb(s) order by s.start_time) from lecture_slots s where s.teacher_id = me.id and s.active), '[]'));
  elsif p_role in ('student','guardian') then
    return base || jsonb_build_object('yt_channel', (select yt_channel_id from settings where id = 1))
      || case when jsonb_typeof(base->'teachers') = 'array' then jsonb_build_object('teachers', coalesce((select jsonb_agg(x - 'zoom_url' - 'yt_tag') from jsonb_array_elements(base->'teachers') x), '[]')) else '{}'::jsonb end;
  end if;
  return base;
end $$;

revoke execute on function ensure_lectures(date, int), yt_assign(), yt_upsert_videos(jsonb, text, text), yt_sync_due(boolean) from public, anon, authenticated;
revoke execute on function yt_begin_link(text), yt_unlink(), admin_save_slot(jsonb), admin_set_teacher_studio(uuid, text, text), admin_assign_video(text, uuid), admin_studio_data(), admin_set_channel(text), portal_data(text) from public, anon;
grant execute on function yt_begin_link(text), yt_unlink(), admin_save_slot(jsonb), admin_set_teacher_studio(uuid, text, text), admin_assign_video(text, uuid), admin_studio_data(), admin_set_channel(text), portal_data(text) to authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function yt_upsert_videos(jsonb, text, text), yt_sync_due(boolean), ensure_lectures(date, int) to service_role;
    grant select, update on yt_auth to service_role;
  end if;
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sama-ensure-lectures', '7 * * * *', 'select public.ensure_lectures(null, 8)');
  end if;
end $$;
