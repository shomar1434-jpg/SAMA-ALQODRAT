-- =====================================================================
--  نظام مركز سما القدرات للتدريب — قاعدة البيانات (Supabase / PostgreSQL)
--  النموذج: برنامج ← دفعات (دفعة نشطة واحدة + أرشيف) ← كشف التسجيل ← الحضور اليومي
--  شغّل هذا الملف كاملًا من: Supabase → SQL Editor → New query → Run
--  ثم شغّل seed_programs.sql لتحميل دليل البرامج المعتمدة. التوقيت: Asia/Riyadh
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- الجداول ----------
create table if not exists programs (
  id               uuid primary key default gen_random_uuid(),
  code             text unique not null,                -- رمز الرابط والباركود الثابت، مثل p25157
  name             text not null,
  category         text not null,
  accreditation_no text,                                -- رقم الاعتماد من المؤسسة العامة للتدريب التقني والمهني
  hours            int,
  duration_days    int,
  description      text,
  price            numeric(10,2),                       -- فارغ = السعر عند التواصل
  active           boolean not null default true,
  created_at       timestamptz not null default now()
);
create unique index if not exists programs_accreditation_uq on programs(accreditation_no) where accreditation_no is not null and accreditation_no <> '';

create table if not exists packages (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  price       numeric(10,2) not null,
  program_ids uuid[] not null default '{}',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- الدفعة: يفتحها المدير لبرنامج، وكشف تسجيلها هو قاعدة التحضير اليومي
create table if not exists cohorts (
  id            uuid primary key default gen_random_uuid(),
  program_id    uuid not null references programs(id) on delete cascade,
  number        int  not null,
  start_date    date not null,
  end_date      date not null,
  days          int[] not null default '{0,1,2,3,4}',   -- 0=الأحد ... 6=السبت
  start_time    time not null default '16:00',
  end_time      time not null default '19:00',
  seats         int  not null default 25,
  hall          text,
  trainer       text,
  reg_open      boolean not null default true,
  archived_at   timestamptz,                             -- فارغ = نشطة
  archived_auto boolean not null default false,
  created_at    timestamptz not null default now(),
  unique (program_id, number),
  check (end_date >= start_date)
);
-- دفعة نشطة واحدة فقط لكل برنامج
create unique index if not exists cohorts_one_active on cohorts(program_id) where archived_at is null;

-- المتدرب: شخص واحد بسجله المدني، يسجّل في دفعات عدة
create table if not exists trainees (
  id          uuid primary key default gen_random_uuid(),
  national_id text unique not null check (national_id ~ '^[12][0-9]{9}$'),
  full_name   text not null,
  phone       text not null,
  email       text,
  gender      text check (gender in ('ذكر','أنثى')),
  birth_date  date,
  city        text,
  education   text,
  employer    text,
  created_at  timestamptz not null default now()
);

-- كشف الدفعة
create table if not exists enrollments (
  id          uuid primary key default gen_random_uuid(),
  ref         text not null,
  cohort_id   uuid not null references cohorts(id) on delete cascade,
  program_id  uuid not null references programs(id) on delete cascade,
  trainee_id  uuid not null references trainees(id) on delete cascade,
  package_id  uuid references packages(id) on delete set null,
  status      text not null default 'مسجل' check (status in ('مسجل','ملغى')),
  created_at  timestamptz not null default now(),
  unique (cohort_id, trainee_id)
);

create table if not exists attendance (
  id            uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references enrollments(id) on delete cascade,
  cohort_id     uuid not null references cohorts(id) on delete cascade,
  program_id    uuid not null references programs(id) on delete cascade,
  trainee_id    uuid not null references trainees(id) on delete cascade,
  att_date      date not null,
  checkin_at    timestamptz not null default now(),
  status        text not null default 'حاضر' check (status in ('حاضر','متأخر')),
  manual        boolean not null default false,
  unique (enrollment_id, att_date)
);
create index if not exists attendance_date_idx on attendance(att_date);
create index if not exists attendance_cohort_idx on attendance(cohort_id);

create table if not exists settings (
  id            int primary key default 1 check (id = 1),
  daily_secret  text not null default encode(gen_random_bytes(16),'hex'),
  require_code  boolean not null default false,
  late_minutes  int not null default 15,
  early_minutes int not null default 60,
  checkin_url   text,                                   -- الرابط الأساسي للنظام المنشور
  cert_threshold int not null default 75,               -- حد الحضور (٪) لاستحقاق شهادة الإتمام
  late_weight   numeric not null default 1,             -- وزن الحضور المتأخر: 1 كامل، 0.5 نصف، 0 لا يُحتسب
  warn_consec   int not null default 2,                 -- تنبيه الغياب المتتالي بعد عدد المحاضرات
  msg_ok text, msg_low text, msg_consec text, msg_last text, msg_lost text, msg_done text, msg_below text, msg_upcoming text, -- رسائل التنبيه (فارغة = النص الافتراضي)
  about text
);
alter table settings add column if not exists cert_threshold int not null default 75;
insert into settings(id) values (1) on conflict do nothing;

-- شهادات الإتمام: تُصدر عند أرشفة الدفعة لمن بلغ حد الحضور
create table if not exists certificates (
  id            uuid primary key default gen_random_uuid(),
  serial        text unique not null,
  enrollment_id uuid unique not null references enrollments(id) on delete cascade,
  cohort_id     uuid not null references cohorts(id) on delete cascade,
  program_id    uuid not null references programs(id) on delete cascade,
  trainee_id    uuid not null references trainees(id) on delete cascade,
  rate          int  not null,
  issued_at     timestamptz not null default now(),
  revoked       boolean not null default false
);

create table if not exists admins ( user_id uuid primary key references auth.users(id) on delete cascade );

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;

-- ---------- الصلاحيات (RLS): كل البيانات للمدير فقط، والعامة عبر الدوال أدناه ----------
do $$ declare t text; begin
  foreach t in array array['programs','packages','cohorts','trainees','enrollments','attendance','settings','certificates'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t||'_admin', t);
    execute format('create policy %I on %I for all using (is_admin()) with check (is_admin())', t||'_admin', t);
  end loop;
end $$;
alter table admins enable row level security;
drop policy if exists admins_self on admins;
create policy admins_self on admins for select using (user_id = auth.uid());

-- ---------- دوال مساعدة ----------
create or replace function riyadh_now() returns timestamp language sql stable as $$ select (now() at time zone 'Asia/Riyadh'); $$;

create or replace function code_for(d date) returns text language sql stable security definer set search_path = public as $$
  select lpad(((('x' || substr(encode(digest(daily_secret || d::text, 'sha256'), 'hex'),1,8))::bit(32)::bigint) % 10000)::text, 4, '0') from settings where id = 1;
$$;
revoke execute on function code_for(date) from public;

create or replace function daily_code() returns text language plpgsql stable security definer set search_path = public as $$
begin if not is_admin() then raise exception 'غير مصرح'; end if; return code_for(riyadh_now()::date); end $$;
grant execute on function daily_code() to authenticated;

create or replace function public_settings() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('require_code', require_code, 'late_minutes', late_minutes, 'early_minutes', early_minutes, 'checkin_url', checkin_url) from settings where id = 1;
$$;
grant execute on function public_settings() to anon, authenticated;

-- إحصاء تسجيل واحد: إجمالي أيام الدفعة منذ تسجيله، المنعقدة منها، الحضور، التأخر، المتبقي
create or replace function enr_stats(p_enr uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e enrollments%rowtype; c cohorts%rowtype; n timestamp := riyadh_now(); d date := n::date; sec int := extract(epoch from n::time)::int;
  v_from date; v_cut date; v_total int; v_held int; v_att int; v_late int; v_today_att boolean; v_rem int; v_req int; v_thr int; v_arch boolean; v_lw numeric; v_score numeric; v_need int; v_last date; v_consec int;
begin
  select * into e from enrollments where id = p_enr; select * into c from cohorts where id = e.cohort_id;
  select cert_threshold, late_weight into v_thr, v_lw from settings where id = 1;
  v_from := greatest(c.start_date, (e.created_at at time zone 'Asia/Riyadh')::date);
  v_cut  := case when c.archived_at is not null and not c.archived_auto and (c.archived_at at time zone 'Asia/Riyadh')::date < c.end_date then (c.archived_at at time zone 'Asia/Riyadh')::date else c.end_date end;
  v_arch := c.archived_at is not null or c.end_date < d;
  select count(*) into v_total from generate_series(v_from, v_cut, interval '1 day') g where extract(dow from g)::int = any(c.days);
  select count(*) into v_held from generate_series(v_from, v_cut, interval '1 day') g where extract(dow from g)::int = any(c.days)
     and (g::date < d or (g::date = d and sec >= extract(epoch from c.end_time)::int));
  select count(*), count(*) filter (where status='متأخر'), bool_or(att_date = d) into v_att, v_late, v_today_att from attendance where enrollment_id = p_enr;
  v_rem := greatest(0, v_total - v_held - case when coalesce(v_today_att,false) and not (d <= v_cut and sec >= extract(epoch from c.end_time)::int) and extract(dow from d)::int = any(c.days) then 1 else 0 end);
  v_req := ceil(v_total * v_thr / 100.0);
  v_score := v_att - v_late * (1 - coalesce(v_lw,1));
  v_need := greatest(0, ceil(v_req - v_score - 1e-9)::int);
  select max(att_date) into v_last from attendance where enrollment_id = p_enr;
  select count(*) into v_consec from generate_series(greatest(v_from, coalesce(v_last + 1, v_from)), v_cut, interval '1 day') g where extract(dow from g)::int = any(c.days)
     and (g::date < d or (g::date = d and sec >= extract(epoch from c.end_time)::int));
  return jsonb_build_object('total',v_total,'held',v_held,'attended',v_att,'late',v_late,'score',v_score,'absent',greatest(0,v_held-v_att),'remaining',v_rem,
    'required',v_req,'needed',v_need,'reachable',v_need <= v_rem,'consec',v_consec,
    'rate', case when v_held>0 then round(v_score*100.0/v_held) else null end,
    'finalRate', case when v_arch then (case when v_held>0 then round(v_score*100.0/v_held) else 0 end) else (case when v_total>0 then round(v_score*100.0/v_total) else 0 end) end);
end $$;

-- إصدار الشهادات لدفعة (داخلي)
create or replace function _issue_certificates(p_cohort uuid) returns int language plpgsql volatile security definer set search_path = public as $$
declare c cohorts%rowtype; p programs%rowtype; e record; v_thr int; v_seq int; v_rate int; k int := 0;
begin
  select * into c from cohorts where id = p_cohort; select * into p from programs where id = c.program_id; select cert_threshold into v_thr from settings where id = 1;
  select count(*) into v_seq from certificates where cohort_id = p_cohort;
  for e in select * from enrollments where cohort_id = p_cohort and status <> 'ملغى' and id not in (select enrollment_id from certificates) order by created_at loop
    v_rate := (enr_stats(e.id)->>'finalRate')::int;
    if v_rate >= v_thr then
      v_seq := v_seq + 1; k := k + 1;
      insert into certificates(serial, enrollment_id, cohort_id, program_id, trainee_id, rate)
      values ('SQ-' || coalesce(nullif(p.accreditation_no,''), substr(p.code,2)) || '-' || c.number || '-' || lpad(v_seq::text,3,'0'), e.id, c.id, c.program_id, e.trainee_id, v_rate);
    end if;
  end loop;
  return k;
end $$;
revoke execute on function _issue_certificates(uuid) from public;

create or replace function issue_certificates(p_cohort uuid) returns int language plpgsql volatile security definer set search_path = public as $$
begin if not is_admin() then raise exception 'غير مصرح'; end if; return _issue_certificates(p_cohort); end $$;
grant execute on function issue_certificates(uuid) to authenticated;

-- الأرشفة التلقائية: كل دفعة انتهت مدتها، مع إصدار شهاداتها
create or replace function archive_ended_cohorts() returns int language plpgsql volatile security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in update cohorts set archived_at = now(), archived_auto = true, reg_open = false
           where archived_at is null and end_date < riyadh_now()::date returning id loop
    perform _issue_certificates(r.id); n := n + 1;
  end loop;
  return n;
end $$;
grant execute on function archive_ended_cohorts() to anon, authenticated;
-- اختياري: جدولة يومية عبر pg_cron بعد تفعيله من Database → Extensions
-- select cron.schedule('archive-cohorts', '5 0 * * *', $$select archive_ended_cohorts()$$);

-- التحقق العام من شهادة: الاسم مختصر حفاظًا على الخصوصية
create or replace function verify_certificate(p_serial text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('serial',x.serial,'revoked',x.revoked,'issued_at',x.issued_at,'rate',x.rate,
    'name_masked', case when array_length(regexp_split_to_array(trim(t.full_name),'\s+'),1) <= 2 then trim(t.full_name)
                        else split_part(trim(t.full_name),' ',1) || ' ••• ' || (regexp_split_to_array(trim(t.full_name),'\s+'))[array_length(regexp_split_to_array(trim(t.full_name),'\s+'),1)] end,
    'gender',t.gender,'program',p.name,'category',p.category,'accreditation_no',p.accreditation_no,'hours',p.hours,'number',c.number,'start_date',c.start_date,'end_date',c.end_date)
  from certificates x join trainees t on t.id=x.trainee_id join programs p on p.id=x.program_id join cohorts c on c.id=x.cohort_id
  where upper(x.serial) = upper(trim(p_serial));
$$;
grant execute on function verify_certificate(text) to anon, authenticated;

-- صفحة «حضوري»: بالسجل المدني فقط، ولا يُعاد للمتدرب إلا نسبة حضوره ورسالة التنبيه
drop function if exists my_attendance(text, text);
create or replace function ar_num(x numeric) returns text language sql immutable as $$ select translate(coalesce(x,0)::text,'0123456789','٠١٢٣٤٥٦٧٨٩') $$;
create or replace function att_level(s jsonb, p_state text, p_thr int, p_consec int) returns text language sql immutable as $$
  select case when p_state='upcoming' then 'upcoming'
    when p_state='archived' then case when (s->>'finalRate')::int >= p_thr then 'done' else 'below' end
    when (s->>'held')::int = 0 then 'none'
    when not (s->>'reachable')::boolean then 'lost'
    when (s->>'needed')::int > 0 and (s->>'needed')::int >= (s->>'remaining')::int - 1 then 'last'
    when (s->>'consec')::int >= p_consec then 'consec'
    when (s->>'rate')::int < p_thr then 'low' else 'ok' end $$;
create or replace function my_attendance(p_nid text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare t trainees%rowtype; st settings%rowtype; v_items jsonb := '[]'; e record; s jsonb; d date := riyadh_now()::date; v_state text; v_lv text; v_tpl text; v_rate int;
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
    v_tpl := case v_lv
      when 'ok' then coalesce(nullif(st.msg_ok,''),'نسبة حضورك {النسبة}٪ وأنت على المسار الصحيح للحصول على الشهادة. واصل الحضور.')
      when 'low' then coalesce(nullif(st.msg_low,''),'تنبيه: نسبة حضورك {النسبة}٪ دون حد الشهادة {الحد}٪. احرص على حضور المحاضرات القادمة.')
      when 'consec' then coalesce(nullif(st.msg_consec,''),'تنبيه غياب: غبت {المتتالي} محاضرات متتالية. انتظم في الحضور حتى لا تفقد أهلية الشهادة.')
      when 'last' then coalesce(nullif(st.msg_last,''),'تنبيه أخير: لا مجال لغياب آخر. يلزمك حضور {المطلوب} من {المتبقي} محاضرة متبقية للحصول على الشهادة.')
      when 'lost' then coalesce(nullif(st.msg_lost,''),'لم يعد بالإمكان بلوغ حد الشهادة {الحد}٪ في هذه الدفعة. يُرجى مراجعة إدارة المركز.')
      when 'done' then coalesce(nullif(st.msg_done,''),'أتممت البرنامج بنسبة حضور {النسبة}٪.')
      when 'below' then coalesce(nullif(st.msg_below,''),'انتهت الدفعة بنسبة حضور {النسبة}٪، وهي دون حد الشهادة {الحد}٪.')
      when 'upcoming' then coalesce(nullif(st.msg_upcoming,''),'تبدأ دفعتك {البداية}. احرص على حضور أول محاضرة.')
      else 'لم تنعقد محاضرات دفعتك بعد.' end;
    v_tpl := replace(replace(replace(replace(replace(replace(replace(replace(replace(v_tpl,
      '{النسبة}', ar_num(coalesce(v_rate,0))), '{الحد}', ar_num(st.cert_threshold)), '{المتتالي}', ar_num((s->>'consec')::int)),
      '{المطلوب}', ar_num((s->>'needed')::int)), '{المتبقي}', ar_num((s->>'remaining')::int)), '{الغياب}', ar_num((s->>'absent')::int)),
      '{الاسم}', split_part(t.full_name,' ',1)), '{البرنامج}', e.pname), '{البداية}', to_char(e.start_date,'YYYY-MM-DD'));
    v_items := v_items || jsonb_build_object('program',e.pname,'number',e.number,'state',v_state,'start_date',e.start_date,'end_date',e.end_date,'rate',v_rate,'level',v_lv,'message',v_tpl);
  end loop;
  return jsonb_build_object('ok',true,'first_name',split_part(t.full_name,' ',1),'items',v_items);
end $$;
grant execute on function my_attendance(text) to anon, authenticated;

-- الدفعة النشطة للبرنامج (غير مؤرشفة ولم تنته)
create or replace function active_cohort(p_program uuid) returns cohorts language sql stable security definer set search_path = public as $$
  select * from cohorts where program_id = p_program and archived_at is null and end_date >= riyadh_now()::date order by number desc limit 1;
$$;

create or replace function cohort_public(c cohorts) returns jsonb language sql stable security definer set search_path = public as $$
  select case when c.id is null then null else jsonb_build_object('id',c.id,'number',c.number,'start_date',c.start_date,'end_date',c.end_date,'days',c.days,
    'start_time',to_char(c.start_time,'HH24:MI'),'end_time',to_char(c.end_time,'HH24:MI'),'seats',c.seats,'hall',c.hall,'reg_open',c.reg_open,
    'taken',(select count(*) from enrollments e where e.cohort_id=c.id and e.status<>'ملغى')) end;
$$;

-- دليل البرامج للعامة: البرامج المتاحة ودفعاتها النشطة والباقات
create or replace function public_catalog() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'programs', coalesce((select jsonb_agg(to_jsonb(p) || jsonb_build_object('cohort', cohort_public(active_cohort(p.id))) order by p.created_at) from programs p where p.active), '[]'),
    'packages', coalesce((select jsonb_agg(to_jsonb(k)) from packages k where k.active), '[]'));
$$;
grant execute on function public_catalog() to anon, authenticated;

create or replace function public_program(p_code text) returns jsonb language sql stable security definer set search_path = public as $$
  select to_jsonb(p) || jsonb_build_object('cohort', cohort_public(active_cohort(p.id))) from programs p where p.code = p_code;
$$;
grant execute on function public_program(text) to anon, authenticated;

-- فتح دفعة جديدة (المدير): يُرقّم تلقائيًا، ويمنع وجود دفعتين نشطتين
create or replace function open_cohort(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_prog uuid := (p->>'program_id')::uuid; v_num int; v_id uuid;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  perform archive_ended_cohorts();
  if exists (select 1 from cohorts where program_id = v_prog and archived_at is null) then
    raise exception 'للبرنامج دفعة نشطة. أرشفها أولًا لفتح دفعة جديدة.';
  end if;
  select coalesce(max(number),0)+1 into v_num from cohorts where program_id = v_prog;
  insert into cohorts(program_id, number, start_date, end_date, days, start_time, end_time, seats, hall, trainer, reg_open)
  values (v_prog, v_num, (p->>'start_date')::date, (p->>'end_date')::date,
          coalesce((select array_agg(x::int) from jsonb_array_elements_text(p->'days') x), '{0,1,2,3,4}'),
          coalesce((p->>'start_time')::time,'16:00'), coalesce((p->>'end_time')::time,'19:00'), coalesce((p->>'seats')::int,25),
          nullif(p->>'hall',''), nullif(p->>'trainer',''), coalesce((p->>'reg_open')::boolean,true))
  returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id,'number',v_num);
end $$;
grant execute on function open_cohort(jsonb) to authenticated;

-- ---------- التسجيل في دفعة برنامج (أو دفعات برامج الباقة) ----------
create or replace function register_trainee(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_t uuid; v_ref text := 'SQ-' || lpad((floor(random()*900000)+100000)::text,6,'0'); v_ids uuid[]; v_pid uuid; c cohorts; pr programs; v_out jsonb := '[]';
begin
  perform archive_ended_cohorts();
  if coalesce(p->>'national_id','') !~ '^[12][0-9]{9}$' then raise exception 'رقم السجل المدني غير صحيح'; end if;
  if nullif(p->>'package_id','') is not null then
    select program_ids into v_ids from packages where id = (p->>'package_id')::uuid and active;
    if v_ids is null then raise exception 'الباقة غير متاحة'; end if;
  else v_ids := array[(p->>'program_id')::uuid]; end if;

  foreach v_pid in array v_ids loop
    select * into pr from programs where id = v_pid and active;
    if not found then raise exception 'البرنامج غير متاح'; end if;
    c := active_cohort(v_pid);
    if c.id is null or not c.reg_open then raise exception 'التسجيل غير مفتوح حاليًا في «%»', pr.name; end if;
    if (select count(*) from enrollments where cohort_id=c.id and status<>'ملغى') >= c.seats then raise exception 'اكتملت مقاعد الدفعة % من «%»', c.number, pr.name; end if;
    if exists (select 1 from enrollments e join trainees t on t.id=e.trainee_id where e.cohort_id=c.id and t.national_id=p->>'national_id' and e.status<>'ملغى') then
      raise exception 'هذا السجل المدني مسجّل مسبقًا في الدفعة % من «%»', c.number, pr.name; end if;
  end loop;

  insert into trainees(national_id, full_name, phone, email, gender, birth_date, city, education, employer)
  values (p->>'national_id', p->>'full_name', p->>'phone', nullif(p->>'email',''), nullif(p->>'gender',''), nullif(p->>'birth_date','')::date,
          nullif(p->>'city',''), nullif(p->>'education',''), nullif(p->>'employer',''))
  on conflict (national_id) do update set full_name=excluded.full_name, phone=excluded.phone, email=coalesce(excluded.email,trainees.email),
     gender=coalesce(excluded.gender,trainees.gender), birth_date=coalesce(excluded.birth_date,trainees.birth_date), city=coalesce(excluded.city,trainees.city),
     education=coalesce(excluded.education,trainees.education), employer=coalesce(excluded.employer,trainees.employer)
  returning id into v_t;

  foreach v_pid in array v_ids loop
    c := active_cohort(v_pid); select * into pr from programs where id = v_pid;
    insert into enrollments(ref, cohort_id, program_id, trainee_id, package_id)
    values (v_ref, c.id, v_pid, v_t, nullif(p->>'package_id','')::uuid)
    on conflict (cohort_id, trainee_id) do update set status='مسجل', ref=excluded.ref;
    v_out := v_out || jsonb_build_object('program', pr.name, 'number', c.number, 'start', c.start_date);
  end loop;
  return jsonb_build_object('ok', true, 'ref', v_ref, 'cohorts', v_out);
end $$;
grant execute on function register_trainee(jsonb) to anon, authenticated;

-- ---------- التحضير: مطابقة السجل المدني مع كشف الدفعة المنعقدة ----------
-- p_program = رمز البرنامج من الباركود (مثل p25157)، أو فارغ للبحث في كل الدفعات المنعقدة
create or replace function checkin(p_nid text, p_code text default null, p_program text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  st settings%rowtype; t trainees%rowtype; pr programs%rowtype; c cohorts%rowtype; e enrollments%rowtype; a attendance%rowtype;
  n timestamp := riyadh_now(); d date := n::date; tm time := n::time; dow int := extract(dow from n)::int; sec int := extract(epoch from n::time)::int;
  v_status text; v_pkg text; v_next date; v_next_time time;
begin
  perform archive_ended_cohorts();
  select * into st from settings where id = 1;
  if st.require_code and coalesce(p_code,'') <> code_for(d) then return jsonb_build_object('ok',false,'reason','bad_code'); end if;
  select * into t from trainees where national_id = p_nid;

  if p_program is not null then
    select * into pr from programs where code = p_program;
    if not found then return jsonb_build_object('ok',false,'reason','no_program'); end if;
    c := active_cohort(pr.id);
    if c.id is null or c.start_date > d then
      return jsonb_build_object('ok',false,'reason','no_cohort','program',pr.name,
        'upcoming', case when c.id is null then null else jsonb_build_object('number',c.number,'start',c.start_date) end);
    end if;
    if t.id is null then return jsonb_build_object('ok',false,'reason','not_in_cohort','program',pr.name,'number',c.number); end if;
    select * into e from enrollments where cohort_id = c.id and trainee_id = t.id and status <> 'ملغى';
    if not found then return jsonb_build_object('ok',false,'reason','not_in_cohort','program',pr.name,'number',c.number); end if;
  else
    if t.id is null then return jsonb_build_object('ok',false,'reason','not_in_cohort'); end if;
    -- أقرب دفعة منعقدة لها محاضرة الآن
    select x.* into c from cohorts x join enrollments y on y.cohort_id = x.id and y.trainee_id = t.id and y.status <> 'ملغى'
     where x.archived_at is null and x.start_date <= d and x.end_date >= d and dow = any(x.days)
       and sec between extract(epoch from x.start_time)::int - st.early_minutes*60 and extract(epoch from x.end_time)::int
     order by x.start_time limit 1;
    if c.id is null then
      select x.* into c from cohorts x join enrollments y on y.cohort_id = x.id and y.trainee_id = t.id and y.status <> 'ملغى'
       where x.archived_at is null and x.start_date <= d and x.end_date >= d order by x.start_date desc limit 1;
      if c.id is null then return jsonb_build_object('ok',false,'reason','not_in_cohort'); end if;
    end if;
    select * into pr from programs where id = c.program_id;
    select * into e from enrollments where cohort_id = c.id and trainee_id = t.id;
  end if;

  if not (dow = any(c.days) and sec between extract(epoch from c.start_time)::int - st.early_minutes*60 and extract(epoch from c.end_time)::int) then
    select g::date into v_next from generate_series(d, c.end_date, interval '1 day') g
     where extract(dow from g)::int = any(c.days) and (g::date > d or sec < extract(epoch from c.start_time)::int - st.early_minutes*60) order by g limit 1;
    return jsonb_build_object('ok',false,'reason','no_session','name',t.full_name,'program',pr.name,'number',c.number,
      'next', case when v_next is null then null else jsonb_build_object('date',v_next,'time',to_char(c.start_time,'HH24:MI')) end);
  end if;

  select name into v_pkg from packages where id = e.package_id;
  select * into a from attendance where enrollment_id = e.id and att_date = d;
  if found then
    return jsonb_build_object('ok',true,'already',true,'name',t.full_name,'program',pr.name,'number',c.number,'hall',c.hall,'package',v_pkg,
      'status',a.status,'time',to_char(a.checkin_at at time zone 'Asia/Riyadh','HH24:MI'),'date',d);
  end if;
  v_status := case when sec > extract(epoch from c.start_time)::int + st.late_minutes*60 then 'متأخر' else 'حاضر' end;
  insert into attendance(enrollment_id, cohort_id, program_id, trainee_id, att_date, status) values (e.id, c.id, c.program_id, t.id, d, v_status);
  return jsonb_build_object('ok',true,'already',false,'name',t.full_name,'program',pr.name,'number',c.number,'hall',c.hall,'package',v_pkg,
    'status',v_status,'time',to_char(n,'HH24:MI'),'date',d);
end $$;
grant execute on function checkin(text, text, text) to anon, authenticated;

-- التحضير اليدوي من المدير (p_status فارغ = إلغاء التحضير)
create or replace function set_attendance(p_enrollment uuid, p_date date, p_status text) returns void
language plpgsql volatile security definer set search_path = public as $$
declare e enrollments%rowtype; c cohorts%rowtype;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into e from enrollments where id = p_enrollment; if not found then raise exception 'التسجيل غير موجود'; end if;
  select * into c from cohorts where id = e.cohort_id;
  if p_status is null then delete from attendance where enrollment_id = p_enrollment and att_date = p_date; return; end if;
  insert into attendance(enrollment_id, cohort_id, program_id, trainee_id, att_date, checkin_at, status, manual)
  values (e.id, e.cohort_id, e.program_id, e.trainee_id, p_date, ((p_date + c.start_time) at time zone 'Asia/Riyadh'), p_status, true)
  on conflict (enrollment_id, att_date) do update set status = excluded.status;
end $$;
grant execute on function set_attendance(uuid, date, text) to authenticated;

-- =====================================================================
--  بعد التشغيل: Authentication → Users → Add user (بريد + كلمة مرور للمدير)
--  ثم نفّذ:  insert into admins(user_id) select id from auth.users where email = 'بريد_المدير';
-- =====================================================================


-- ===================== المحتوى التعريفي: النبذة وشركاء النجاح =====================
alter table settings add column if not exists about text;
alter table settings add column if not exists late_weight numeric not null default 1;
alter table settings add column if not exists warn_consec int not null default 2;
alter table settings add column if not exists msg_ok text, add column if not exists msg_low text, add column if not exists msg_consec text, add column if not exists msg_last text, add column if not exists msg_lost text, add column if not exists msg_done text, add column if not exists msg_below text, add column if not exists msg_upcoming text;
create table if not exists partners (
  id uuid primary key default gen_random_uuid(),
  name text not null, name_en text, type text, logo text, description text, website text, since text,
  sort_order int not null default 0, active boolean not null default true, created_at timestamptz not null default now());
alter table partners enable row level security;
drop policy if exists partners_admin on partners;
create policy partners_admin on partners for all using (is_admin()) with check (is_admin());
create or replace function public_site() returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('about', (select about from settings where id = 1),
    'partners', coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'name_en',name_en,'type',type,'logo',logo,'description',description,'website',website,'since',since,'sort_order',sort_order) order by sort_order, created_at) from partners where active), '[]'::jsonb));
$$;
grant execute on function public_site() to anon, authenticated;
