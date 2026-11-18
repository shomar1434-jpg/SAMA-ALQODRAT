-- الخطوة BH: اختبار تحديد المستوى (قرار المالك 18 نوفمبر) ↔ src/placement_logic.js
-- 20 سؤالًا للزائر بلا تسجيل ولا بيانات شخصية، من البنك المشترك المنشور ذي المفاتيح المعتمدة فقط.
-- الإجابات الصحيحة لا تغادر الخادم؛ التصحيح والاقتراح هنا. الحدود: دون 40٪ الماسية والذهبية، 40–65٪ الفضية، فوقها الأساسية،
-- والضعف في مهارة أو مهارتين (مصنّفة، سؤالان فأكثر، دون 50٪) يضيف «خصصناها لك» أولًا.

alter table settings add column if not exists placement_enabled boolean not null default true;
alter table settings add column if not exists placement_sec_per_q int not null default 60;
alter table settings add column if not exists placement_low int not null default 40;
alter table settings add column if not exists placement_high int not null default 65;
alter table settings add column if not exists placement_daily_max int not null default 3;
alter table settings drop constraint if exists settings_placement_check;
alter table settings add constraint settings_placement_check check (
  placement_sec_per_q between 20 and 300 and placement_low between 1 and 99 and placement_high between 1 and 99
  and placement_low < placement_high and placement_daily_max between 1 and 20);

create table if not exists placement_attempts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('qudurat','tahsili')),
  session_id text not null,                 -- رمز عشوائي من متصفح الزائر (ليس بيانات شخصية)
  ip_hash text not null default '',         -- مجزّأ بسر المركز ويومه؛ للحد من الإساءة فقط
  day date not null,
  snapshot jsonb not null,                  -- [{id, subject, category, correct}] لا يُرسل للزائر
  started_at timestamptz not null default now(),
  deadline timestamptz not null,
  submitted_at timestamptz,
  result jsonb
);
create index if not exists placement_attempts_day on placement_attempts(day);
create index if not exists placement_attempts_session on placement_attempts(session_id, day);
alter table placement_attempts enable row level security;
drop policy if exists placement_admin_read on placement_attempts;
create policy placement_admin_read on placement_attempts for select to authenticated using (is_admin());
revoke all on placement_attempts from anon;

-- الأقسام لكل نوع (يطابق PL_KINDS)
create or replace function pl_parts(p_kind text) returns jsonb language sql immutable set search_path = public, extensions as $$
  select case p_kind when 'qudurat' then '[["لفظي",10],["كمي",10]]'::jsonb when 'tahsili' then '[["تحصيلي",20]]'::jsonb end $$;

create or replace function pl_pool_count(p_subject text) returns int language sql stable security definer set search_path = public, extensions as $$
  select count(*)::int from questions where shared and status = 'published' and key_status = 'approved' and subject = p_subject $$;

create or replace function pl_available(p_kind text) returns boolean language sql stable security definer set search_path = public, extensions as $$
  select coalesce(bool_and(pl_pool_count(e->>0) >= (e->>1)::int), false) from jsonb_array_elements(pl_parts(p_kind)) e $$;

create or replace function pl_minutes(p_kind text) returns int language sql stable security definer set search_path = public, extensions as $$
  select greatest(1, ceil((select sum((e->>1)::int) from jsonb_array_elements(pl_parts(p_kind)) e) * coalesce(placement_sec_per_q, 60) / 60.0)::int)
    from settings where id = 1 $$;

-- المهارات الضعيفة (plWeak) والدرجات (plTiers) والباقات (plPlans)
create or replace function pl_tiers(p_pct int, p_weak int) returns text[] language sql stable security definer set search_path = public, extensions as $$
  select case when p_pct >= s.placement_low and p_weak between 1 and 2 then array['custom'] else '{}'::text[] end
      || case when p_pct < s.placement_low then array['diamond','gold'] when p_pct <= s.placement_high then array['silver'] else array['basic'] end
    from settings s where s.id = 1 $$;

create or replace function pl_plans(p_kind text, p_tiers text[]) returns jsonb language sql stable security definer set search_path = public, extensions as $$
  with subs as (select array_agg(e->>0) a from jsonb_array_elements(pl_parts(p_kind)) e),
       ok as (select p.*, row_number() over (order by p.sort, p.name, p.id) rn from plans p, subs
               where p.mode = 'in_person' and p.status = 'open' and p.active and subs.a <@ p.subjects),
       hit as (select distinct on (t.t) t.o, ok.id, ok.tier, ok.name from unnest(p_tiers) with ordinality t(t, o) join ok on ok.tier = t.t order by t.t, ok.rn)
  select coalesce(
    (select jsonb_agg(jsonb_build_object('id', id, 'tier', tier, 'name', name) order by o) from hit),
    (select jsonb_agg(jsonb_build_object('id', id, 'tier', tier, 'name', name)) from (select * from ok order by rn limit 1) f),
    '[]'::jsonb) $$;

create or replace function placement_status() returns jsonb language sql stable security definer set search_path = public, extensions as $$
  select jsonb_build_object('enabled', placement_enabled, 'qudurat', pl_available('qudurat'), 'tahsili', pl_available('tahsili'),
    'minutes', jsonb_build_object('qudurat', pl_minutes('qudurat'), 'tahsili', pl_minutes('tahsili')), 'assets', bank_assets)
  from settings where id = 1 $$;

create or replace function pl_ip_hash() returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare v_ip text;
begin
  begin v_ip := split_part(coalesce(current_setting('request.headers', true)::json->>'x-forwarded-for', ''), ',', 1);
  exception when others then v_ip := ''; end;
  v_ip := btrim(coalesce(v_ip, ''));
  if v_ip = '' then return ''; end if;
  return encode(sha256(convert_to('sama-pl:' || (select coalesce(daily_secret::text, '') from settings where id = 1) || ':' || riyadh_now()::date || ':' || v_ip, 'utf8')), 'hex');
end $$;

create or replace function placement_start(p_kind text, p_session text) returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare s settings%rowtype; v_today date := riyadh_now()::date; v_ip text := pl_ip_hash(); e jsonb; v_part jsonb; v_snap jsonb := '[]'; v_pub jsonb := '[]';
        v_min int; at placement_attempts%rowtype;
begin
  select * into s from settings where id = 1;
  if not coalesce(s.placement_enabled, true) then raise exception 'اختبار تحديد المستوى متوقف حاليًا'; end if;
  if pl_parts(p_kind) is null then raise exception 'اختر نوع الاختبار'; end if;
  if coalesce(p_session, '') !~ '^[A-Za-z0-9_-]{8,64}$' then raise exception 'أعد تحميل الصفحة ثم حاول مجددًا'; end if;
  if (select count(*) from placement_attempts where session_id = p_session and day = v_today) >= s.placement_daily_max
     or (v_ip <> '' and (select count(*) from placement_attempts where ip_hash = v_ip and day = v_today) >= s.placement_daily_max * 4)
    then raise exception 'وصلت إلى حد محاولات اليوم؛ حاول غدًا أو تواصل مع المركز'; end if;
  if (select count(*) from placement_attempts where day = v_today) >= 3000 then raise exception 'الاختبار مزدحم الآن؛ حاول لاحقًا'; end if;
  for e in select * from jsonb_array_elements(pl_parts(p_kind)) loop
    with pool as (select q.id, q."order", coalesce(nullif(q.page_image,''), q.id::text) gk from questions q
                   where q.shared and q.status = 'published' and q.key_status = 'approved' and q.subject = e->>0),
         grp as (select gk, random() r from pool group by gk),
         ord as (select p.id, row_number() over (order by g.r, p."order", p.id) rn from pool p join grp g using (gk))
    select jsonb_agg(jsonb_build_object('id', q.id, 'subject', e->>0, 'category', coalesce(q.category, ''), 'correct', q.correct,
             'pub', jsonb_build_object('id', q.id, 'subject', e->>0, 'text', coalesce(q.text,''), 'options', to_jsonb(q.options), 'image', coalesce(q.image,''),
                                       'page_image', coalesce(q.page_image,''), 'code', coalesce(q.code,''))) order by o.rn)
      into v_part from ord o join questions q on q.id = o.id where o.rn <= (e->>1)::int;
    if coalesce(jsonb_array_length(v_part), 0) < (e->>1)::int then raise exception 'الاختبار غير متاح حاليًا'; end if;
    v_snap := v_snap || (select jsonb_agg(x - 'pub') from jsonb_array_elements(v_part) x);
    v_pub := v_pub || (select jsonb_agg(x->'pub') from jsonb_array_elements(v_part) x);
  end loop;
  v_min := pl_minutes(p_kind);
  insert into placement_attempts(kind, session_id, ip_hash, day, snapshot, deadline)
  values (p_kind, p_session, v_ip, v_today, v_snap, now() + make_interval(mins => v_min)) returning * into at;
  return jsonb_build_object('id', at.id, 'kind', p_kind, 'minutes', v_min, 'deadline', at.deadline, 'assets', s.bank_assets, 'questions', v_pub);
end $$;

-- التصحيح (plGrade): الإجابة 0..3 وإلا فارغة؛ المهارة بالتصنيف المعتمد وإلا «غير مصنّف»
create or replace function placement_finish(p_id uuid, p_session text, p_answers jsonb) returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare at placement_attempts%rowtype; q jsonb; v text; a int; k text; ok boolean; v_score int := 0; v_total int; v_pct int;
        v_parts jsonb := '{}'; v_skills jsonb := '{}'; v_weak text[]; v_tiers text[]; r jsonb;
begin
  select * into at from placement_attempts where id = p_id and session_id = coalesce(p_session, '') for update;
  if at.id is null then raise exception 'المحاولة غير موجودة'; end if;
  if at.submitted_at is not null then return at.result; end if;
  if now() > at.deadline + interval '120 seconds' then raise exception 'انتهى وقت الاختبار'; end if;
  for q in select * from jsonb_array_elements(at.snapshot) loop
    v := case when jsonb_typeof(p_answers) = 'object' then p_answers->>(q->>'id') end;
    a := case when v ~ '^[0-3]$' then v::int end;
    ok := a is not null and a = (q->>'correct')::int;
    k := case when coalesce(q->>'category','') <> '' and cat_ok(q->>'subject', q->>'category') then q->>'category' else 'غير مصنّف' end;
    v_parts := jsonb_set(v_parts, array[q->>'subject'], jsonb_build_object(
      'right', coalesce((v_parts->(q->>'subject')->>'right')::int, 0) + ok::int, 'total', coalesce((v_parts->(q->>'subject')->>'total')::int, 0) + 1));
    v_skills := jsonb_set(v_skills, array[k], jsonb_build_object(
      'right', coalesce((v_skills->k->>'right')::int, 0) + ok::int, 'total', coalesce((v_skills->k->>'total')::int, 0) + 1));
    if ok then v_score := v_score + 1; end if;
  end loop;
  v_total := jsonb_array_length(at.snapshot);
  v_pct := case when v_total > 0 then round(v_score * 100.0 / v_total)::int else 0 end;
  select coalesce(array_agg(key order by key), '{}') into v_weak from jsonb_each(v_skills)
   where key <> 'غير مصنّف' and (value->>'total')::int >= 2 and round((value->>'right')::int * 100.0 / (value->>'total')::int) < 50;
  v_tiers := pl_tiers(v_pct, coalesce(array_length(v_weak, 1), 0));
  r := jsonb_build_object('score', v_score, 'total', v_total, 'pct', v_pct, 'parts', v_parts, 'skills', v_skills,
                          'weak', to_jsonb(v_weak), 'tiers', to_jsonb(v_tiers), 'plans', pl_plans(at.kind, v_tiers));
  update placement_attempts set submitted_at = now(), result = r where id = at.id;
  return r;
end $$;

create or replace function admin_placement_data() returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
    'settings', (select jsonb_build_object('placement_enabled', placement_enabled, 'placement_sec_per_q', placement_sec_per_q, 'placement_low', placement_low,
                   'placement_high', placement_high, 'placement_daily_max', placement_daily_max) from settings where id = 1),
    'status', placement_status(),
    'attempts', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'day', day, 'submitted', submitted_at is not null,
                   'pct', (result->>'pct')::int, 'tier', result->'tiers'->>0) order by started_at desc)
                 from placement_attempts where started_at > now() - interval '400 days'), '[]'));
end $$;

create or replace function admin_placement_settings(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_low int := (p->>'placement_low')::int; v_high int := (p->>'placement_high')::int; v_sec int := (p->>'placement_sec_per_q')::int; v_max int := (p->>'placement_daily_max')::int;
begin
  if not is_full_admin() then raise exception 'غير مصرح'; end if;
  if not (v_low >= 1 and v_high <= 99 and v_low < v_high) then raise exception 'الحدان بين 1 و99، والأدنى أصغر من الأعلى'; end if;
  if not (v_sec between 20 and 300) then raise exception 'وقت السؤال بين 20 و300 ثانية'; end if;
  if not (v_max between 1 and 20) then raise exception 'المحاولات اليومية بين 1 و20'; end if;
  update settings set placement_enabled = coalesce((p->>'placement_enabled')::boolean, true), placement_low = v_low, placement_high = v_high,
         placement_sec_per_q = v_sec, placement_daily_max = v_max where id = 1;
  return (select jsonb_build_object('placement_enabled', placement_enabled, 'placement_low', placement_low, 'placement_high', placement_high,
                 'placement_sec_per_q', placement_sec_per_q, 'placement_daily_max', placement_daily_max) from settings where id = 1);
end $$;

create or replace function placement_purge() returns int language plpgsql volatile security definer set search_path = public, extensions as $$
declare n int;
begin
  delete from placement_attempts where started_at < now() - interval '400 days';
  get diagnostics n = row_count; return n;
end $$;

revoke execute on function pl_parts(text), pl_pool_count(text), pl_available(text), pl_minutes(text), pl_tiers(int, int), pl_plans(text, text[]), pl_ip_hash(), placement_purge()
  from public, anon, authenticated;
revoke execute on function placement_status(), placement_start(text, text), placement_finish(uuid, text, jsonb), admin_placement_data(), admin_placement_settings(jsonb) from public;
grant execute on function placement_status(), placement_start(text, text), placement_finish(uuid, text, jsonb) to anon, authenticated;
grant execute on function admin_placement_data(), admin_placement_settings(jsonb) to authenticated;
revoke execute on function admin_placement_data(), admin_placement_settings(jsonb) from anon;

do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sama-placement-purge', '55 0 * * *', 'select public.placement_purge()');
  end if;
end $$;
