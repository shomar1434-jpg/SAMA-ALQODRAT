-- =====================================================================
-- الخطوات 3 و6 و7 و8: الأدوار والدخول بالجوال، وبوابات الطالب والمعلم وولي الأمر.
-- الهوية من Supabase Auth (رقم الجوال الموثّق برمز تحقق). الصلاحية تُحسم هنا على الخادم.
-- البيانات تُعاد محصورة بالدور (portal_data) والحساب في الواجهة من portal_logic.js.
-- =====================================================================
create table if not exists teachers (
  id uuid primary key default gen_random_uuid(),
  full_name text not null, phone text not null check (phone ~ '^05[0-9]{8}$'),
  section text not null check (section in ('girls','boys')), subjects text[] not null default '{}',
  active boolean not null default true, created_at timestamptz not null default now()
);
create unique index if not exists teachers_phone_active on teachers(phone) where active;
create table if not exists guardian_links (
  id uuid primary key default gen_random_uuid(),
  guardian_name text, guardian_phone text not null check (guardian_phone ~ '^05[0-9]{8}$'),
  trainee_id uuid not null references trainees(id) on delete restrict,
  relation text, status text not null default 'verified' check (status in ('verified','revoked')),
  verified_by uuid, created_at timestamptz not null default now(), revoked_at timestamptz
);
create unique index if not exists guardian_links_one on guardian_links(guardian_phone, trainee_id) where status = 'verified';
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(), at timestamptz not null default now(), date date not null,
  sender text not null, "to" text not null check ("to" in ('student','guardian')), trainee_id uuid not null references trainees(id) on delete restrict,
  kind text not null, text text not null, read_at timestamptz
);
create index if not exists notifications_trainee on notifications(trainee_id, date);
alter table settings add column if not exists remind_minutes int not null default 30;

alter table teachers enable row level security; alter table guardian_links enable row level security; alter table notifications enable row level security;
do $$ declare t text; begin
  foreach t in array array['teachers','guardian_links','notifications'] loop
    execute format('drop policy if exists %I_admin on %I', t, t);
    execute format('create policy %I_admin on %I for all using (is_admin()) with check (is_admin())', t, t);
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function audit_row()', t, t);
  end loop; end $$;

-- رقم جوال المستخدم الحالي بالصيغة المحلية 05XXXXXXXX (من رمز Supabase Auth الموثّق)
create or replace function my_phone() returns text language sql stable as $$
  select case when p ~ '^9665[0-9]{8}$' then '0' || substr(p, 4) when p ~ '^5[0-9]{8}$' then '0' || p else p end
  from (select regexp_replace(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'phone', current_setting('app.phone', true), ''), '\D', '', 'g') as p) x;
$$;

create or replace function portal_roles() returns text[] language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when exists (select 1 from teachers where active and phone = my_phone()) then 'teacher' end,
    case when exists (select 1 from trainees t join subscriptions s on s.trainee_id = t.id where t.phone = my_phone()) then 'student' end,
    case when exists (select 1 from guardian_links where status = 'verified' and guardian_phone = my_phone()) then 'guardian' end,
    case when is_admin() then 'admin' end], null);
$$;

-- البيانات المحصورة بالدور (مطابقة لـ scopeData في src/data2.js)
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare ph text := my_phone(); ids uuid[]; me teachers%rowtype; base jsonb; subs jsonb;
begin
  if ph = '' or not (p_role = any(portal_roles())) then raise exception 'غير مصرح'; end if;
  base := jsonb_build_object(
    'plans', coalesce((select jsonb_agg(to_jsonb(p)) from plans p), '[]'),
    'schedule_templates', coalesce((select jsonb_agg(jsonb_build_object('id',id,'section',section,'dow',dow,'start',to_char(start_time,'HH24:MI'),'end',to_char(end_time,'HH24:MI'))) from schedule_templates), '[]'),
    'schedule_exceptions', coalesce((select jsonb_agg(jsonb_build_object('id',id,'date',date,'section',section,'type',type,'start',to_char(start_time,'HH24:MI'),'end',to_char(end_time,'HH24:MI'),'note',note)) from schedule_exceptions where date >= riyadh_now()::date - 400), '[]'),
    'settings', (select jsonb_build_object('late_minutes',late_minutes,'early_minutes',early_minutes,'late_weight',late_weight,'cert_threshold',cert_threshold,'warn_consec',warn_consec,'remind_minutes',remind_minutes) from settings where id = 1),
    'assignments', '[]'::jsonb, 'submissions', '[]'::jsonb);
  if p_role = 'teacher' then
    select * into me from teachers where active and phone = ph;
    select coalesce(array_agg(distinct s.trainee_id), '{}') into ids from subscriptions s where s.section = me.section and s.subjects && me.subjects;
    return base || jsonb_build_object(
      'me', to_jsonb(me) - 'phone', 'teachers', jsonb_build_array(to_jsonb(me) - 'phone'),
      'trainees', coalesce((select jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'gender',gender)) from trainees where id = any(ids)), '[]'),
      'subscriptions', coalesce((select jsonb_agg(to_jsonb(s)) from subscriptions s where s.section = me.section and s.subjects && me.subjects), '[]'),
      'sub_attendance', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('time', to_char(a.checkin_at at time zone 'Asia/Riyadh','HH24:MI:SS')))
                                  from sub_attendance a join subscriptions s on s.id = a.subscription_id where s.section = me.section and s.subjects && me.subjects), '[]'),
      'guardian_links', coalesce((select jsonb_agg(jsonb_build_object('id',id,'trainee_id',trainee_id,'status',status,'relation',relation)) from guardian_links where status = 'verified' and trainee_id = any(ids)), '[]'),
      'notifications', coalesce((select jsonb_agg(to_jsonb(n)) from notifications n where sender = 'teacher:' || me.id and date >= riyadh_now()::date - 30), '[]'));
  end if;
  if p_role = 'student' then select coalesce(array_agg(id), '{}') into ids from trainees where phone = ph;
  else select coalesce(array_agg(trainee_id), '{}') into ids from guardian_links where status = 'verified' and guardian_phone = ph; end if;
  return base || jsonb_build_object(
    'trainees', coalesce((select jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'gender',gender)) from trainees where id = any(ids)), '[]'),
    'subscriptions', coalesce((select jsonb_agg(to_jsonb(s)) from subscriptions s where s.trainee_id = any(ids)), '[]'),
    'sub_attendance', coalesce((select jsonb_agg(to_jsonb(a) || jsonb_build_object('time', to_char(a.checkin_at at time zone 'Asia/Riyadh','HH24:MI:SS'))) from sub_attendance a where a.trainee_id = any(ids)), '[]'),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'section',section,'subjects',subjects,'active',active)) from teachers where active), '[]'),
    'guardian_links', case when p_role = 'guardian' then coalesce((select jsonb_agg(to_jsonb(l)) from guardian_links l where status = 'verified' and guardian_phone = ph), '[]') else '[]' end,
    'notifications', coalesce((select jsonb_agg(to_jsonb(n) order by n.at) from notifications n where n.trainee_id = any(ids) and n."to" = p_role and n.date >= riyadh_now()::date - 60), '[]'));
end $$;

-- إشعار من المعلم: الطالب في نطاقه، وولي الأمر موثّق، ولا تكرار لنفس الحدث في اليوم
create or replace function teacher_notify(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers%rowtype; t trainees%rowtype; d date := riyadh_now()::date; v_kind text := p->>'kind'; v_to text := p->>'to'; v_text text; v_end text;
begin
  select * into me from teachers where active and phone = my_phone();
  if me.id is null then raise exception 'غير مصرح'; end if;
  select * into t from trainees where id = (p->>'trainee_id')::uuid;
  if not exists (select 1 from subscriptions s where s.trainee_id = t.id and s.section = me.section and s.subjects && me.subjects) then raise exception 'الطالب ليس ضمن طلابك'; end if;
  if v_to = 'guardian' and not exists (select 1 from guardian_links where status = 'verified' and trainee_id = t.id) then raise exception 'لا يوجد ولي أمر موثّق لهذا الطالب'; end if;
  if v_to not in ('student','guardian') or v_kind not in ('absence','late','reminder','homework','general') then raise exception 'طلب غير صالح'; end if;
  if exists (select 1 from notifications where sender = 'teacher:' || me.id and trainee_id = t.id and "to" = v_to and kind = v_kind and date = d) then return jsonb_build_object('ok',true,'duplicate',true); end if;
  select to_char(end_time,'HH24:MI') into v_end from session_on(me.section, d);
  v_text := case v_kind
    when 'absence' then 'نفيدكم بغياب ' || split_part(t.full_name,' ',1) || ' عن جلسة اليوم (' || d || '). نأمل الحرص على الحضور.'
    when 'late' then 'نفيدكم بتأخر ' || split_part(t.full_name,' ',1) || ' عن جلسة اليوم (' || d || ').'
    when 'reminder' then 'تذكير: جلسة اليوم مستمرة حتى ' || coalesce(v_end,'') || '، ولم يُسجَّل حضورك بعد. إن كنت حاضرًا فامسح باركود الحضور، وإن تعذّر حضورك فأبلغ المعلم بعذرك.'
    when 'homework' then 'نفيدكم بأن لدى ' || split_part(t.full_name,' ',1) || ' واجبًا لم يُسلَّم بعد.'
    else '' end;
  v_text := trim(v_text || ' ' || left(coalesce(p->>'note',''), 300));
  if v_text = '' then raise exception 'اكتب نص الرسالة'; end if;
  insert into notifications(date, sender, "to", trainee_id, kind, text) values (d, 'teacher:' || me.id, v_to, t.id, v_kind, v_text);
  return jsonb_build_object('ok',true);
end $$;

create or replace function mark_read(p_role text) returns void language plpgsql volatile security definer set search_path = public as $$
declare ph text := my_phone();
begin
  if not (p_role = any(portal_roles())) then return; end if;
  update notifications set read_at = now() where read_at is null and "to" = p_role and trainee_id in (
    select id from trainees where p_role = 'student' and phone = ph union select trainee_id from guardian_links where p_role = 'guardian' and status = 'verified' and guardian_phone = ph);
end $$;

revoke execute on function portal_data(text), teacher_notify(jsonb), mark_read(text), portal_roles() from anon;
grant execute on function portal_data(text), teacher_notify(jsonb), mark_read(text), portal_roles() to authenticated;
