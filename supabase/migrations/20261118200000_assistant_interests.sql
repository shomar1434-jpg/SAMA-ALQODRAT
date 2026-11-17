-- الخطوة BE (قرار المالك 17 نوفمبر): تذكّر من طلب الخدمة من مساعد سما (باسمه وواتسابه وموافقته فقط)، وعدّ الاستفسارات بلا أرقام،
-- والتنبيه عند تجاوز 10 استفسارات (لا فتح آلي للتسجيل)، وحملات إرسال شبه آلية من واتساب المركز بزر يضغطه المسؤول. ↔ src/interest_logic.js
alter table settings add column if not exists assistant_demand_threshold int not null default 10 check (assistant_demand_threshold between 1 and 1000);
alter table settings add column if not exists assistant_interest_days int not null default 365 check (assistant_interest_days between 30 and 1825);

create table if not exists assistant_inquiries (
  id uuid primary key default gen_random_uuid(),
  session_id text not null check (session_id ~ '^[A-Za-z0-9_-]{8,64}$'),
  kind text not null check (kind in ('program','plan')), ref_id uuid not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists assistant_inquiries_ref on assistant_inquiries(kind, ref_id, created_at);
create index if not exists assistant_inquiries_session on assistant_inquiries(session_id, created_at);

create table if not exists assistant_demand (
  kind text not null check (kind in ('program','plan')), ref_id uuid not null,
  cycle_started_at timestamptz not null default now(), alerted_at timestamptz, handled_at timestamptz,
  primary key (kind, ref_id)
);

create table if not exists assistant_interests (
  id uuid primary key default gen_random_uuid(),
  full_name text not null check (length(full_name) between 3 and 80),
  phone text not null check (phone ~ '^05[0-9]{8}$'),
  kind text not null check (kind in ('program','plan')), ref_id uuid not null,
  active boolean not null default true, consent_at timestamptz not null default now(),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (phone, kind, ref_id)
);

create table if not exists assistant_campaigns (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('availability','offer')),
  product_kind text check (product_kind in ('program','plan')), ref_id uuid,
  title text not null default '' check (length(title) <= 120), message text not null default '' check (length(message) <= 1000),
  created_by uuid, created_at timestamptz not null default now(),
  check ((product_kind is null) = (ref_id is null)), check (kind = 'offer' or ref_id is not null)
);
create table if not exists assistant_sends (
  campaign_id uuid not null references assistant_campaigns(id) on delete cascade,
  interest_id uuid not null references assistant_interests(id) on delete cascade,
  sent_at timestamptz not null default now(), sent_by uuid,
  primary key (campaign_id, interest_id)
);
do $$ declare t text; begin
  foreach t in array array['assistant_inquiries','assistant_demand','assistant_interests','assistant_campaigns','assistant_sends'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_admin', t);
    execute format('create policy %I on %I for select using (is_admin())', t || '_admin', t);
  end loop;
end $$;
drop trigger if exists assistant_interests_audit on assistant_interests;
create trigger assistant_interests_audit after insert or update or delete on assistant_interests for each row execute function audit_row();
drop trigger if exists assistant_campaigns_audit on assistant_campaigns;
create trigger assistant_campaigns_audit after insert or update or delete on assistant_campaigns for each row execute function audit_row();

create or replace function assistant_product_name(p_kind text, p_ref uuid) returns text language sql stable security definer set search_path = public as $$
  select case p_kind when 'program' then (select name from programs where id = p_ref and active)
                     when 'plan' then (select coalesce(plan_label(p), name) from plans p where id = p_ref and active) end $$;

-- عامة: محادثة سألت عن منتج (مرة لكل محادثة ومنتج في الدورة). تعيد هل تجاوز الطلب الحد لتخبر السائل بأن هناك مجالًا للتسجيل.
create or replace function assistant_note_inquiry(p_session text, p_kind text, p_ref uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare d assistant_demand; n int; th int := (select assistant_demand_threshold from settings where id = 1);
begin
  if coalesce(p_session, '') !~ '^[A-Za-z0-9_-]{8,64}$' or p_kind not in ('program','plan') or assistant_product_name(p_kind, p_ref) is null then
    return jsonb_build_object('ok', false); end if;
  insert into assistant_demand(kind, ref_id) values (p_kind, p_ref) on conflict do nothing;
  select * into d from assistant_demand where kind = p_kind and ref_id = p_ref;
  if (select count(*) from assistant_inquiries where session_id = p_session and created_at > now() - interval '1 day') < 30
     and not exists (select 1 from assistant_inquiries where session_id = p_session and kind = p_kind and ref_id = p_ref and created_at >= d.cycle_started_at) then
    insert into assistant_inquiries(session_id, kind, ref_id) values (p_session, p_kind, p_ref);
  end if;
  select count(*) into n from assistant_inquiries where kind = p_kind and ref_id = p_ref and created_at >= d.cycle_started_at;
  if n > th and d.alerted_at is null then update assistant_demand set alerted_at = now(), handled_at = null where kind = p_kind and ref_id = p_ref; end if;
  return jsonb_build_object('ok', true, 'demand', n > th);
end $$;

-- عامة: «أبلغوني» بالاسم وواتساب والموافقة. الرد واحد، وحد 5 تسجيلات جديدة للجوال يوميًا.
create or replace function assistant_register_interest(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_name text := regexp_replace(btrim(coalesce(p->>'full_name','')), '\s+', ' ', 'g');
  v_phone text := regexp_replace(translate(coalesce(p->>'phone',''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g');
  v_kind text := p->>'kind'; v_ref uuid;
begin
  begin v_ref := nullif(p->>'ref_id','')::uuid; exception when others then v_ref := null; end;
  if length(v_name) < 3 or length(v_name) > 80 or v_name ~ '[0-9٠-٩<>]' then raise exception 'اكتب اسمك بالحروف'; end if;
  if v_phone !~ '^05[0-9]{8}$' then raise exception 'اكتب رقم واتساب صحيحًا يبدأ بـ05'; end if;
  if coalesce(v_kind,'') not in ('program','plan') or assistant_product_name(v_kind, v_ref) is null then raise exception 'اختر البرنامج أو الباقة'; end if;
  if coalesce((p->>'consent')::boolean, false) is not true then raise exception 'وافق على استقبال رسائل المركز ليصلك الإشعار'; end if;
  if (select count(*) from assistant_interests where phone = v_phone and created_at > now() - interval '1 day') >= 5
     and not exists (select 1 from assistant_interests where phone = v_phone and kind = v_kind and ref_id = v_ref) then
    raise exception 'تجاوزت عدد الطلبات المسموح اليوم؛ تواصل مع المركز'; end if;
  insert into assistant_interests(full_name, phone, kind, ref_id) values (v_name, v_phone, v_kind, v_ref)
  on conflict (phone, kind, ref_id) do update set full_name = excluded.full_name, active = true, consent_at = now(), updated_at = now();
  return jsonb_build_object('ok', true);
end $$;

-- الإدارة: الطلب والمهتمون والحملات
create or replace function admin_assistant_interests() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  return jsonb_build_object(
    'threshold', (select assistant_demand_threshold from settings where id = 1),
    'demand', coalesce((select jsonb_agg(to_jsonb(d) || jsonb_build_object('name', assistant_product_name(d.kind, d.ref_id))) from assistant_demand d), '[]'),
    'inquiries', coalesce((select jsonb_agg(jsonb_build_object('kind', q.kind, 'ref_id', q.ref_id, 'created_at', q.created_at)) from assistant_inquiries q where q.created_at > now() - interval '400 days'), '[]'),
    'interests', coalesce((select jsonb_agg(to_jsonb(i) || jsonb_build_object('name', assistant_product_name(i.kind, i.ref_id),
        'registered', exists (select 1 from trainees t where t.phone = i.phone or t.guardian_phone = i.phone)) order by i.created_at desc) from assistant_interests i), '[]'),
    'campaigns', coalesce((select jsonb_agg(to_jsonb(c) || jsonb_build_object('name', assistant_product_name(c.product_kind, c.ref_id)) order by c.created_at desc) from assistant_campaigns c), '[]'),
    'sends', coalesce((select jsonb_agg(to_jsonb(s)) from assistant_sends s), '[]'));
end $$;
create or replace function admin_assistant_campaign(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare c assistant_campaigns; v_kind text := p->>'kind'; v_pk text := nullif(p->>'product_kind',''); v_ref uuid := nullif(p->>'ref_id','')::uuid;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if v_kind not in ('availability','offer') then raise exception 'نوع غير صالح'; end if;
  if v_ref is not null and assistant_product_name(v_pk, v_ref) is null then raise exception 'البرنامج أو الباقة غير موجود'; end if;
  if v_kind = 'availability' and v_ref is null then raise exception 'اختر البرنامج أو الباقة'; end if;
  if v_kind = 'offer' and (length(btrim(coalesce(p->>'title',''))) < 3 or length(btrim(coalesce(p->>'message',''))) < 5) then raise exception 'اكتب عنوان العرض وتفاصيله'; end if;
  insert into assistant_campaigns(kind, product_kind, ref_id, title, message, created_by)
  values (v_kind, case when v_ref is null then null else v_pk end, v_ref, left(btrim(coalesce(p->>'title','')), 120), left(btrim(coalesce(p->>'message','')), 1000), auth.uid()) returning * into c;
  if v_ref is not null then update assistant_demand set handled_at = now() where kind = v_pk and ref_id = v_ref; end if;
  return jsonb_build_object('ok', true, 'id', c.id);
end $$;
create or replace function admin_assistant_mark_sent(p_campaign uuid, p_interest uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  insert into assistant_sends(campaign_id, interest_id, sent_by) values (p_campaign, p_interest, auth.uid()) on conflict do nothing;
  return jsonb_build_object('ok', true);
end $$;
create or replace function admin_assistant_interest_set(p_id uuid, p_active boolean) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  update assistant_interests set active = p_active, updated_at = now() where id = p_id;
  if not found then raise exception 'غير موجود'; end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function admin_assistant_new_cycle(p_kind text, p_ref uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  insert into assistant_demand(kind, ref_id) values (p_kind, p_ref)
  on conflict (kind, ref_id) do update set cycle_started_at = clock_timestamp(), alerted_at = null, handled_at = null;
  return jsonb_build_object('ok', true);
end $$;
-- التنظيف: المهتمون بعد مدة الحفظ من آخر تحديث، والاستفسارات بعد سنة
create or replace function assistant_purge() returns int language plpgsql volatile security definer set search_path = public as $$
declare n int;
begin
  delete from assistant_interests where updated_at < now() - make_interval(days => (select assistant_interest_days from settings where id = 1));
  get diagnostics n = row_count;
  delete from assistant_inquiries where created_at < now() - interval '400 days';
  return n;
end $$;

revoke execute on function assistant_product_name(text, uuid), assistant_purge() from public, anon, authenticated;
revoke execute on function assistant_note_inquiry(text, text, uuid), assistant_register_interest(jsonb), admin_assistant_interests(), admin_assistant_campaign(jsonb),
  admin_assistant_mark_sent(uuid, uuid), admin_assistant_interest_set(uuid, boolean), admin_assistant_new_cycle(text, uuid) from public;
grant execute on function assistant_note_inquiry(text, text, uuid), assistant_register_interest(jsonb) to anon, authenticated;
grant execute on function admin_assistant_interests(), admin_assistant_campaign(jsonb), admin_assistant_mark_sent(uuid, uuid), admin_assistant_interest_set(uuid, boolean), admin_assistant_new_cycle(text, uuid) to authenticated;
revoke execute on function admin_assistant_interests(), admin_assistant_campaign(jsonb), admin_assistant_mark_sent(uuid, uuid), admin_assistant_interest_set(uuid, boolean), admin_assistant_new_cycle(text, uuid) from anon;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sama-assistant-purge', '50 0 * * *', 'select public.assistant_purge()');
  end if;
end $$;
