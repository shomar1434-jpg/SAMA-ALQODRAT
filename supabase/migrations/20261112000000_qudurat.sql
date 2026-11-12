-- =====================================================================
-- الخطوات 2 و4 و5: أساس البيانات، وباقات القدرات والتحصيلي، والباركود الموحد
-- المنطق مطابق لـ src/qudurat.js و unifiedCheckin في src/data2.js
-- =====================================================================

-- ---------- 1) لا حذف متسلسل لسجلات تاريخية: الحذف يُرفض إن وُجد حضور أو شهادة ----------
alter table enrollments  drop constraint if exists enrollments_cohort_id_fkey,  add constraint enrollments_cohort_id_fkey  foreign key (cohort_id)  references cohorts(id)  on delete restrict;
alter table enrollments  drop constraint if exists enrollments_program_id_fkey, add constraint enrollments_program_id_fkey foreign key (program_id) references programs(id) on delete restrict;
alter table enrollments  drop constraint if exists enrollments_trainee_id_fkey, add constraint enrollments_trainee_id_fkey foreign key (trainee_id) references trainees(id) on delete restrict;
alter table attendance   drop constraint if exists attendance_enrollment_id_fkey, add constraint attendance_enrollment_id_fkey foreign key (enrollment_id) references enrollments(id) on delete restrict;
alter table attendance   drop constraint if exists attendance_cohort_id_fkey,   add constraint attendance_cohort_id_fkey   foreign key (cohort_id)   references cohorts(id)   on delete restrict;
alter table attendance   drop constraint if exists attendance_program_id_fkey,  add constraint attendance_program_id_fkey  foreign key (program_id)  references programs(id)  on delete restrict;
alter table attendance   drop constraint if exists attendance_trainee_id_fkey,  add constraint attendance_trainee_id_fkey  foreign key (trainee_id)  references trainees(id)  on delete restrict;
alter table certificates drop constraint if exists certificates_enrollment_id_fkey, add constraint certificates_enrollment_id_fkey foreign key (enrollment_id) references enrollments(id) on delete restrict;
alter table certificates drop constraint if exists certificates_cohort_id_fkey,  add constraint certificates_cohort_id_fkey  foreign key (cohort_id)  references cohorts(id)  on delete restrict;
alter table certificates drop constraint if exists certificates_program_id_fkey, add constraint certificates_program_id_fkey foreign key (program_id) references programs(id) on delete restrict;
alter table certificates drop constraint if exists certificates_trainee_id_fkey, add constraint certificates_trainee_id_fkey foreign key (trainee_id) references trainees(id) on delete restrict;

-- ---------- 2) الباقات ----------
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  tier text not null check (tier in ('basic','silver','gold','diamond','custom')),
  mode text not null check (mode in ('in_person','remote')),
  program text not null default 'qudurat',
  name text not null,
  status text not null default 'open' check (status in ('open','closed','coming_soon')),
  duration_unit text not null check (duration_unit in ('week','month','year')),
  duration_value int not null check (duration_value > 0),
  hours int, reg_fee numeric(10,2) not null default 0, installments int not null default 0, installment_amount numeric(10,2) not null default 0,
  summary text, features text[] not null default '{}', audience text, subjects text[] not null default '{}', image text,
  sort int not null default 0, active boolean not null default true, created_at timestamptz not null default now(),
  constraint remote_is_coming_soon check (mode <> 'remote' or status = 'coming_soon')          -- D-07
);

-- ---------- 3) الجداول والاستثناءات ----------
create table if not exists schedule_templates (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in ('girls','boys')),
  dow int not null check (dow between 0 and 6),
  start_time time not null, end_time time not null check (end_time > start_time),
  unique (section, dow)
);
create table if not exists schedule_exceptions (
  id uuid primary key default gen_random_uuid(),
  date date not null, section text not null check (section in ('girls','boys')),
  type text not null check (type in ('cancel','makeup','move')),
  start_time time, end_time time, note text, created_at timestamptz not null default now(),
  check (type = 'cancel' or (start_time is not null and end_time > start_time))
);
create index if not exists schedule_exceptions_date on schedule_exceptions(date, section);

-- ---------- 4) الاشتراكات وحضورها ----------
create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null,
  trainee_id uuid not null references trainees(id) on delete restrict,
  plan_id uuid not null references plans(id) on delete restrict,
  section text not null check (section in ('girls','boys')),
  subjects text[] not null default '{}',
  status text not null default 'pending' check (status in ('pending','active','ended','cancelled')),
  start_date date, end_date date, start_manual boolean not null default false,
  created_at timestamptz not null default now(),
  check (end_date is null or start_date is not null)
);
-- اشتراك قائم واحد للمتدرب في الباقة نفسها
create unique index if not exists subscriptions_one_live on subscriptions(trainee_id, plan_id) where status in ('pending','active');
create table if not exists sub_attendance (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete restrict,
  trainee_id uuid not null references trainees(id) on delete restrict,
  att_date date not null,
  status text not null check (status in ('حاضر','متأخر')),
  manual boolean not null default false,
  checkin_at timestamptz not null default now(),
  unique (subscription_id, att_date)                                                       -- يوم حضور واحد مهما تكرر المسح
);
create index if not exists sub_attendance_date on sub_attendance(att_date);

-- ---------- 5) محاولات التحضير، وسجل التدقيق، وطلبات الباقة المخصصة ----------
create table if not exists checkin_attempts (
  id bigserial primary key, at timestamptz not null default now(), date date not null,
  nid_hash text not null, device text, result text not null, kind text, trainee_hint uuid
);
create index if not exists checkin_attempts_date on checkin_attempts(date);
create table if not exists audit_logs (
  id bigserial primary key, at timestamptz not null default now(), actor uuid, action text not null, entity text, detail jsonb
);
create table if not exists custom_requests (
  id uuid primary key default gen_random_uuid(), name text not null, phone text not null, program text, section text, mode text, notes text,
  status text not null default 'new' check (status in ('new','contacted','closed')), created_at timestamptz not null default now()
);

alter table plans enable row level security;            alter table schedule_templates enable row level security;
alter table schedule_exceptions enable row level security; alter table subscriptions enable row level security;
alter table sub_attendance enable row level security;   alter table checkin_attempts enable row level security;
alter table audit_logs enable row level security;       alter table custom_requests enable row level security;
do $$ declare t text; begin
  foreach t in array array['plans','schedule_templates','schedule_exceptions','subscriptions','sub_attendance','checkin_attempts','audit_logs','custom_requests'] loop
    execute format('drop policy if exists %I_admin on %I', t, t);
    execute format('create policy %I_admin on %I for all using (is_admin()) with check (is_admin())', t, t);
  end loop; end $$;

-- تدقيق تلقائي لكل تغيير في الجداول الحساسة (من نفّذه ومتى وما تغيّر)
create or replace function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_logs(actor, action, entity, detail) values (auth.uid(), lower(tg_table_name) || '.' || lower(tg_op),
    coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, ''),
    jsonb_build_object('before', case when tg_op <> 'INSERT' then to_jsonb(old) end, 'after', case when tg_op <> 'DELETE' then to_jsonb(new) end));
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['plans','schedule_templates','schedule_exceptions','subscriptions','sub_attendance','attendance','certificates','enrollments'] loop
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function audit_row()', t, t);
  end loop; end $$;

-- ---------- 6) دوال الحساب ----------
-- نهاية الاشتراك: يوم قبل مرور المدة من البداية (D-09)
create or replace function sub_end(p_plan uuid, p_start date) returns date language sql stable set search_path = public as $$
  select case when p_start is null then null else (p_start + case pl.duration_unit when 'week' then make_interval(weeks => pl.duration_value)
         when 'month' then make_interval(months => pl.duration_value) else make_interval(years => pl.duration_value) end)::date - 1 end
  from plans pl where pl.id = p_plan;
$$;
-- جلسة القسم في يوم معيّن بعد الاستثناءات
create or replace function session_on(p_section text, p_date date, out start_time time, out end_time time) language plpgsql stable set search_path = public as $$
begin
  if exists (select 1 from schedule_exceptions where section = p_section and date = p_date and type = 'cancel') then return; end if;
  select x.start_time, x.end_time into start_time, end_time from schedule_exceptions x where x.section = p_section and x.date = p_date and x.type in ('makeup','move') order by x.created_at desc limit 1;
  if found then return; end if;
  select t.start_time, t.end_time into start_time, end_time from schedule_templates t where t.section = p_section and t.dow = extract(dow from p_date)::int;
end $$;
create or replace function sub_live(s subscriptions, d date) returns boolean language sql immutable as $$
  select s.status in ('pending','active') and (s.end_date is null or s.end_date >= d);
$$;

-- إحصاء الاشتراك (مطابق لـ subStats)
create or replace function sub_stats(p_sub uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s subscriptions%rowtype; st settings%rowtype; n timestamp := riyadh_now(); d date := n::date; sec int := extract(epoch from n::time)::int;
  v_end date; v_total int := 0; v_held int := 0; v_att int; v_late int; v_score numeric; v_req int; v_need int; v_consec int := 0; g date; ses record; v_has boolean; v_span numeric; v_passed numeric; v_rate int;
begin
  select * into s from subscriptions where id = p_sub; select * into st from settings where id = 1;
  if s.start_date is null then return jsonb_build_object('status', s.status, 'total',0,'held',0,'attended',0,'late',0,'absent',0,'remaining',0,'rate',null,'finalRate',0,'required',0,'needed',0,'reachable',true,'consec',0,'timePct',0,'daysLeft',null); end if;
  v_end := coalesce(s.end_date, sub_end(s.plan_id, s.start_date));
  for g in select x::date from generate_series(s.start_date, v_end, interval '1 day') x loop
    select * into ses from session_on(s.section, g);
    if ses.start_time is null then continue; end if;
    v_total := v_total + 1;
    v_has := exists (select 1 from sub_attendance a where a.subscription_id = s.id and a.att_date = g);
    if g < d or (g = d and sec >= extract(epoch from ses.end_time)::int) or v_has then
      v_held := v_held + 1;
      if v_has then v_consec := 0; else v_consec := v_consec + 1; end if;
    end if;
  end loop;
  select count(distinct att_date), count(*) filter (where status = 'متأخر') into v_att, v_late from sub_attendance where subscription_id = s.id;
  v_score := v_att - v_late * (1 - coalesce(st.late_weight, 1));
  v_req := ceil(v_total * st.cert_threshold / 100.0); v_need := greatest(0, ceil(v_req - v_score - 1e-9)::int);
  v_rate := case when v_held > 0 then round(v_score * 100.0 / v_held) end;
  v_span := greatest(1, v_end - s.start_date + 1); v_passed := least(v_span, greatest(0, d - s.start_date + 1));
  return jsonb_build_object('status', case when s.status = 'cancelled' then 'cancelled' when v_end < d then 'ended' else 'active' end,
    'end', v_end, 'total', v_total, 'held', v_held, 'attended', v_att, 'late', v_late, 'score', v_score, 'absent', greatest(0, v_held - v_att),
    'remaining', greatest(0, v_total - v_held), 'rate', v_rate, 'finalRate', coalesce(v_rate, 0), 'required', v_req, 'needed', v_need,
    'reachable', v_need <= greatest(0, v_total - v_held), 'consec', v_consec, 'timePct', round(v_passed / v_span * 100), 'daysLeft', round(v_span - v_passed));
end $$;

-- رسالة التنبيه حسب الحالة (مستخلصة لتُستخدم للدفعات والاشتراكات)
create or replace function level_message(p_lv text, s jsonb, st settings, p_first text, p_prog text, p_start date, p_rate int) returns text language plpgsql immutable as $$
declare v text;
begin
  v := case p_lv
    when 'ok' then coalesce(nullif(st.msg_ok,''),'نسبة حضورك {النسبة}٪ وأنت على المسار الصحيح للحصول على الشهادة. واصل الحضور.')
    when 'low' then coalesce(nullif(st.msg_low,''),'تنبيه: نسبة حضورك {النسبة}٪ دون حد الشهادة {الحد}٪. احرص على حضور المحاضرات القادمة.')
    when 'consec' then coalesce(nullif(st.msg_consec,''),'تنبيه غياب: غبت {المتتالي} محاضرات متتالية. انتظم في الحضور حتى لا تفقد أهلية الشهادة.')
    when 'last' then coalesce(nullif(st.msg_last,''),'تنبيه أخير: لا مجال لغياب آخر. يلزمك حضور {المطلوب} من {المتبقي} محاضرة متبقية للحصول على الشهادة.')
    when 'lost' then coalesce(nullif(st.msg_lost,''),'لم يعد بالإمكان بلوغ حد الشهادة {الحد}٪ في هذه الدفعة. يُرجى مراجعة إدارة المركز.')
    when 'done' then coalesce(nullif(st.msg_done,''),'أتممت البرنامج بنسبة حضور {النسبة}٪.')
    when 'below' then coalesce(nullif(st.msg_below,''),'انتهت الدفعة بنسبة حضور {النسبة}٪، وهي دون حد الشهادة {الحد}٪.')
    when 'upcoming' then coalesce(nullif(st.msg_upcoming,''),'تبدأ دفعتك {البداية}. احرص على حضور أول محاضرة.')
    else 'لم تنعقد محاضرات بعد.' end;
  return replace(replace(replace(replace(replace(replace(replace(replace(replace(v,
    '{النسبة}', ar_num(coalesce(p_rate,0))), '{الحد}', ar_num(st.cert_threshold)), '{المتتالي}', ar_num((s->>'consec')::int)),
    '{المطلوب}', ar_num((s->>'needed')::int)), '{المتبقي}', ar_num((s->>'remaining')::int)), '{الغياب}', ar_num((s->>'absent')::int)),
    '{الاسم}', coalesce(p_first,'')), '{البرنامج}', coalesce(p_prog,'')), '{البداية}', coalesce(to_char(p_start,'YYYY-MM-DD'),''));
end $$;

create or replace function plan_label(p plans) returns text language sql immutable as $$
  select case p.tier when 'basic' then 'الأساسية' when 'silver' then 'الفضية' when 'gold' then 'الذهبية' when 'diamond' then 'الماسية' else 'المخصصة' end
    || case when p.mode = 'remote' then ' — عن بُعد' else '' end;
$$;
create or replace function section_days_txt(p_section text) returns text language sql stable set search_path = public as $$
  select string_agg((array['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'])[dow+1] || ' من ' || to_char(start_time,'HH24:MI') || ' إلى ' || to_char(end_time,'HH24:MI'), '، ' order by (dow+1)%7)
  from schedule_templates where section = p_section;
$$;

-- ---------- 7) الدوال العامة ----------
create or replace function public_plans() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'plans', coalesce((select jsonb_agg(to_jsonb(p) - 'created_at' order by p.sort) from plans p where p.active), '[]'::jsonb),
    'schedule', coalesce((select jsonb_agg(jsonb_build_object('section',section,'dow',dow,'start',to_char(start_time,'HH24:MI'),'end',to_char(end_time,'HH24:MI'))) from schedule_templates), '[]'::jsonb));
$$;

create or replace function register_subscription(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare pl plans%rowtype; t trainees%rowtype; v_ref text; v_sec text;
begin
  if coalesce(p->>'national_id','') !~ '^[12][0-9]{9}$' then raise exception 'رقم السجل المدني غير صحيح'; end if;
  select * into pl from plans where id = (p->>'plan_id')::uuid;
  if not found or not pl.active or pl.mode = 'remote' or pl.status <> 'open' then raise exception 'التسجيل في هذه الباقة غير متاح حاليًا'; end if;
  insert into trainees(national_id, full_name, phone, email, gender, birth_date, city, education, employer)
  values (p->>'national_id', p->>'full_name', p->>'phone', coalesce(p->>'email',''), p->>'gender', nullif(p->>'birth_date','')::date, p->>'city', p->>'education', coalesce(p->>'employer',''))
  on conflict (national_id) do update set full_name = excluded.full_name, phone = excluded.phone, email = excluded.email, gender = excluded.gender, city = excluded.city, education = excluded.education
  returning * into t;
  if exists (select 1 from subscriptions s where s.trainee_id = t.id and s.plan_id = pl.id and sub_live(s, riyadh_now()::date)) then raise exception 'هذا السجل المدني مشترك مسبقًا في %', plan_label(pl); end if;
  v_sec := case when t.gender = 'أنثى' then 'girls' else 'boys' end;
  v_ref := 'SQ-' || (100000 + floor(random()*900000))::int;
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects) values (v_ref, t.id, pl.id, v_sec, pl.subjects);
  return jsonb_build_object('ok',true,'subscription',true,'ref',v_ref,'plan',plan_label(pl),'section',case v_sec when 'girls' then 'البنات' else 'البنون' end,'schedule',section_days_txt(v_sec));
end $$;

create or replace function request_custom_plan(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if coalesce(p->>'phone','') !~ '^05[0-9]{8}$' then raise exception 'رقم الجوال غير صحيح'; end if;
  insert into custom_requests(name, phone, program, section, mode, notes) values (left(p->>'name',80), p->>'phone', p->>'program', p->>'section', p->>'mode', left(p->>'notes',600));
  return jsonb_build_object('ok',true);
end $$;

-- ---------- 8) التحضير الموحد (D-03) ----------
alter function checkin(text, text, text) rename to checkin_cohort;
revoke execute on function checkin_cohort(text, text, text) from anon, authenticated;

create or replace function checkin(p_nid text, p_code text default null, p_program text default null, p_device text default '', p_choice text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare st settings%rowtype; t trainees%rowtype; n timestamp := riyadh_now(); d date := n::date; sec int := extract(epoch from n::time)::int;
  r jsonb; opts jsonb := '[]'; v_coh record; v_sub record; v_pick text; v_cnt int; a sub_attendance%rowtype; pl plans%rowtype; v_status text; v_started boolean := false; v_next jsonb; g date; ses record;
begin
  select * into st from settings where id = 1;
  if p_program is not null then r := checkin_cohort(p_nid, p_code, p_program);
  else
    if st.require_code and coalesce(p_code,'') <> code_for(d) then r := jsonb_build_object('ok',false,'reason','bad_code');
    else
      select * into t from trainees where national_id = p_nid;
      if t.id is null then r := jsonb_build_object('ok',false,'reason','not_in_cohort');
      else
        -- الاشتراكات التي لها جلسة الآن
        for v_sub in select s.*, x.start_time, x.end_time from subscriptions s cross join lateral session_on(s.section, d) x
                     where s.trainee_id = t.id and sub_live(s, d) and x.start_time is not null
                       and sec between extract(epoch from x.start_time)::int - st.early_minutes*60 and extract(epoch from x.end_time)::int loop
          select * into pl from plans where id = v_sub.plan_id;
          opts := opts || jsonb_build_object('id','s:'||v_sub.id,'label',plan_label(pl));
        end loop;
        -- دفعة لها محاضرة الآن
        select c.id, p.name into v_coh from cohorts c join enrollments e on e.cohort_id = c.id and e.trainee_id = t.id and e.status <> 'ملغى' join programs p on p.id = c.program_id
         where c.archived_at is null and c.start_date <= d and c.end_date >= d and extract(dow from n)::int = any(c.days)
           and sec between extract(epoch from c.start_time)::int - st.early_minutes*60 and extract(epoch from c.end_time)::int limit 1;
        if v_coh.id is not null then opts := opts || jsonb_build_object('id','c:'||v_coh.id,'label',v_coh.name); end if;
        v_cnt := jsonb_array_length(opts);
        if v_cnt = 0 then
          if exists (select 1 from subscriptions s where s.trainee_id = t.id and sub_live(s, d)) then
            for g in select x::date from generate_series(d, d + 21, interval '1 day') x loop
              for ses in select s.section, x.start_time from subscriptions s cross join lateral session_on(s.section, g) x where s.trainee_id = t.id and sub_live(s, d) and x.start_time is not null loop
                if g > d or sec < extract(epoch from ses.start_time)::int - st.early_minutes*60 then v_next := jsonb_build_object('date',g,'time',to_char(ses.start_time,'HH24:MI')); exit; end if;
              end loop; exit when v_next is not null;
            end loop;
            select * into pl from plans where id = (select plan_id from subscriptions s where s.trainee_id = t.id and sub_live(s, d) limit 1);
            r := jsonb_build_object('ok',false,'reason','no_session','name',t.full_name,'program',plan_label(pl),'next',v_next);
          else r := checkin_cohort(p_nid, p_code, null); end if;
        elsif v_cnt > 1 and (p_choice is null or not exists (select 1 from jsonb_array_elements(opts) o where o->>'id' = p_choice)) then
          return jsonb_build_object('ok',false,'reason','choose','name',t.full_name,'options',opts);
        else
          v_pick := case when v_cnt = 1 then opts->0->>'id' else p_choice end;
          if v_pick like 'c:%' then r := checkin_cohort(p_nid, p_code, null);
          else
            select s.*, x.start_time, x.end_time into v_sub from subscriptions s cross join lateral session_on(s.section, d) x where s.id = substr(v_pick,3)::uuid;
            select * into pl from plans where id = v_sub.plan_id;
            select * into a from sub_attendance where subscription_id = v_sub.id and att_date = d;
            if found then
              r := jsonb_build_object('ok',true,'already',true,'kind','subscription','name',t.full_name,'program',plan_label(pl),'section',case v_sub.section when 'girls' then 'البنات' else 'البنون' end,
                'status',a.status,'time',to_char(a.checkin_at at time zone 'Asia/Riyadh','HH24:MI'),'date',d);
            else
              v_status := case when sec > extract(epoch from v_sub.start_time)::int + st.late_minutes*60 then 'متأخر' else 'حاضر' end;
              insert into sub_attendance(subscription_id, trainee_id, att_date, status) values (v_sub.id, t.id, d, v_status) on conflict do nothing;
              if v_sub.start_date is null then                                           -- أول حضور يبدأ الاشتراك (D-08)
                update subscriptions set start_date = d, end_date = sub_end(plan_id, d), status = 'active' where id = v_sub.id; v_started := true;
              end if;
              r := jsonb_build_object('ok',true,'already',false,'kind','subscription','started',v_started,'name',t.full_name,'program',plan_label(pl),
                'section',case v_sub.section when 'girls' then 'البنات' else 'البنون' end,'status',v_status,'time',to_char(n,'HH24:MI'),'date',d);
            end if;
          end if;
        end if;
      end if;
    end if;
  end if;
  insert into checkin_attempts(date, nid_hash, device, result, kind, trainee_hint)
  values (d, md5('sama:' || coalesce(p_nid,'')), left(coalesce(p_device,''),64),
          case when (r->>'ok')::boolean then case when (r->>'already')::boolean then 'already' else 'ok' end else coalesce(r->>'reason','error') end,
          coalesce(r->>'kind','cohort'), case when (r->>'ok')::boolean then (select id from trainees where national_id = p_nid) end);
  return r;
end $$;
grant execute on function checkin(text, text, text, text, text) to anon, authenticated;

-- ---------- 9) دوال الإدارة ----------
create or replace function admin_save_subscription(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare pl plans%rowtype; t trainees%rowtype; s subscriptions%rowtype; v_start date := nullif(p->>'start_date','')::date;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into pl from plans where id = (p->>'plan_id')::uuid; if not found then raise exception 'اختر الباقة'; end if;
  if v_start > riyadh_now()::date then raise exception 'تاريخ البداية في المستقبل'; end if;
  if nullif(p->>'id','') is not null then
    update subscriptions set plan_id = pl.id, section = coalesce(p->>'section', section), start_date = v_start, end_date = sub_end(pl.id, v_start),
      status = case when status = 'cancelled' then status when v_start is null then 'pending' else 'active' end, start_manual = v_start is not null
    where id = (p->>'id')::uuid returning * into s;
    return to_jsonb(s);
  end if;
  if nullif(p->>'trainee_id','') is not null then select * into t from trainees where id = (p->>'trainee_id')::uuid;
  else select * into t from trainees where national_id = p->>'national_id'; end if;
  if t.id is null then
    if coalesce(p->>'national_id','') !~ '^[12][0-9]{9}$' then raise exception 'رقم السجل المدني غير صحيح'; end if;
    insert into trainees(national_id, full_name, phone, email, gender, city, education, employer)
    values (p->>'national_id', p->>'full_name', coalesce(p->>'phone',''), '', coalesce(p->>'gender','ذكر'), 'جازان', 'ثانوي', '') returning * into t;
  end if;
  if exists (select 1 from subscriptions x where x.trainee_id = t.id and x.plan_id = pl.id and sub_live(x, riyadh_now()::date)) then raise exception '% مشترك مسبقًا في %', t.full_name, plan_label(pl); end if;
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects, status, start_date, end_date, start_manual)
  values ('SQ-' || (100000 + floor(random()*900000))::int, t.id, pl.id, coalesce(nullif(p->>'section',''), case when t.gender = 'أنثى' then 'girls' else 'boys' end), pl.subjects,
          case when v_start is null then 'pending' else 'active' end, v_start, sub_end(pl.id, v_start), v_start is not null)
  returning * into s;
  return to_jsonb(s);
end $$;

create or replace function set_sub_attendance(p_sub uuid, p_date date, p_status text) returns void language plpgsql volatile security definer set search_path = public as $$
declare s subscriptions%rowtype;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into s from subscriptions where id = p_sub; if not found then return; end if;
  if p_status is null then delete from sub_attendance where subscription_id = p_sub and att_date = p_date; return; end if;
  insert into sub_attendance(subscription_id, trainee_id, att_date, status, manual) values (p_sub, s.trainee_id, p_date, p_status, true)
  on conflict (subscription_id, att_date) do update set status = excluded.status, manual = true;
  if s.start_date is null then update subscriptions set start_date = p_date, end_date = sub_end(plan_id, p_date), status = 'active' where id = p_sub; end if;
end $$;

create or replace function save_templates(p_section text, p_rows jsonb) returns void language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  delete from schedule_templates where section = p_section;
  insert into schedule_templates(section, dow, start_time, end_time)
  select p_section, (r->>'dow')::int, (r->>'start')::time, (r->>'end')::time from jsonb_array_elements(p_rows) r;
end $$;
revoke execute on function admin_save_subscription(jsonb), set_sub_attendance(uuid, date, text), save_templates(text, jsonb) from anon;
grant execute on function public_plans(), register_subscription(jsonb), request_custom_plan(jsonb) to anon, authenticated;

-- ---------- 10) «حضوري» يشمل اشتراكات الباقات ----------
create or replace function my_attendance(p_nid text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t trainees%rowtype; st settings%rowtype; v_items jsonb := '[]'; e record; s jsonb; d date := riyadh_now()::date; v_state text; v_lv text; v_rate int; pl plans%rowtype;
begin
  select * into t from trainees where national_id = p_nid;
  if not found then return jsonb_build_object('ok',false,'reason','no_match'); end if;
  select * into st from settings where id = 1;
  for e in select en.id, c.*, p.name pname from enrollments en join cohorts c on c.id=en.cohort_id join programs p on p.id=en.program_id
           where en.trainee_id = t.id and en.status <> 'ملغى' order by c.start_date desc loop
    s := enr_stats(e.id);
    v_state := case when e.archived_at is not null or e.end_date < d then 'archived' when e.start_date <= d then 'running' else 'upcoming' end;
    v_lv := att_level(s, v_state, st.cert_threshold, st.warn_consec);
    v_rate := case when v_state='archived' then (s->>'finalRate')::int when v_state='upcoming' then null else (s->>'rate')::int end;
    v_items := v_items || jsonb_build_object('kind','cohort','program',e.pname,'number',e.number,'state',v_state,'start_date',e.start_date,'end_date',e.end_date,'rate',v_rate,'level',v_lv,
      'message', level_message(v_lv, s, st, split_part(t.full_name,' ',1), e.pname, e.start_date, v_rate));
  end loop;
  for e in select x.* from subscriptions x where x.trainee_id = t.id and x.status <> 'cancelled' order by x.created_at desc loop
    select * into pl from plans where id = e.plan_id;
    s := sub_stats(e.id);
    v_state := case when e.start_date is null then 'upcoming' when s->>'status' = 'ended' then 'archived' else 'running' end;
    v_lv := case when e.start_date is null then 'none' else att_level(s, v_state, st.cert_threshold, st.warn_consec) end;
    v_rate := case when v_state='upcoming' then null when v_state='archived' then (s->>'finalRate')::int else (s->>'rate')::int end;
    v_items := v_items || jsonb_build_object('kind','subscription','program',plan_label(pl),'section',case e.section when 'girls' then 'البنات' else 'البنون' end,'number',null,
      'state',v_state,'start_date',e.start_date,'end_date',s->>'end','rate',v_rate,'level',v_lv,
      'message', case when e.start_date is null then 'اشتراكك في ' || plan_label(pl) || ' يبدأ من أول يوم تحضر فيه. مواعيد ' || case e.section when 'girls' then 'البنات' else 'البنون' end || ': ' || coalesce(section_days_txt(e.section),'') || '.'
                      else level_message(v_lv, s, st, split_part(t.full_name,' ',1), plan_label(pl), e.start_date, v_rate) end);
  end loop;
  return jsonb_build_object('ok',true,'first_name',split_part(t.full_name,' ',1),'items',v_items);
end $$;

-- باقة واحدة لكل مستوى ونوع حضور (البيانات الأولية في seed.sql)
create unique index if not exists plans_tier_mode on plans(tier, mode) where tier <> 'custom';
