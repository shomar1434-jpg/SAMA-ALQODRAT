-- =====================================================================
-- الخطوة 13: مركز السياسات — إصدارات مرقّمة بتاريخ سريان وجهة اعتماد، وإقرار قبول عند التسجيل.
-- مطابق لـ src/policy_logic.js (currentPolicies، checkAcceptance).
-- =====================================================================
create table if not exists policies (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug in ('integrity','privacy','attendance','copyright','support','communication')),
  title text not null check (length(trim(title)) >= 3), body text not null check (length(trim(body)) >= 20),
  version int not null default 0, status text not null default 'draft' check (status in ('draft','published')),
  effective_date date not null, approved_by text not null default '', requires_acceptance boolean not null default false,
  published_at timestamptz, created_at timestamptz not null default now(),
  check (status = 'draft' or (version >= 1 and length(trim(approved_by)) >= 3 and published_at is not null))
);
create unique index if not exists policies_version on policies(slug, version) where status = 'published';
create unique index if not exists policies_one_draft on policies(slug) where status = 'draft';
create table if not exists policy_acceptances (
  id uuid primary key default gen_random_uuid(),
  policy_id uuid not null references policies(id) on delete restrict,
  trainee_id uuid not null references trainees(id) on delete restrict,
  context text not null check (context in ('registration','subscription')), accepted_at timestamptz not null default now(),
  unique (policy_id, trainee_id, context)
);
alter table policies enable row level security; alter table policy_acceptances enable row level security;
drop policy if exists policies_admin on policies; create policy policies_admin on policies for all using (is_admin()) with check (is_admin());
drop policy if exists policy_acceptances_admin on policy_acceptances; create policy policy_acceptances_admin on policy_acceptances for select using (is_admin());
create trigger policies_audit after insert or update or delete on policies for each row execute function audit_row();

-- النسخة المنشورة ثابتة: لا تعديل ولا حذف
create or replace function policies_freeze() returns trigger language plpgsql as $$
begin
  if old.status = 'published' then raise exception 'النسخة المنشورة لا تُعدَّل؛ أنشئ إصدارًا جديدًا'; end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists policies_freeze on policies;
create trigger policies_freeze before update or delete on policies for each row execute function policies_freeze();

create or replace function current_policies(p_date date) returns setof policies language sql stable security definer set search_path = public as $$
  select distinct on (slug) * from policies where status = 'published' and effective_date <= p_date order by slug, version desc;
$$;
create or replace function public_policies() returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(p) order by p.slug, p.version), '[]') from policies p where p.status = 'published';
$$;
create or replace function publish_policy(p_id uuid) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare x policies%rowtype; v int;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into x from policies where id = p_id for update;
  if x.id is null or x.status <> 'draft' then raise exception 'تُنشر المسودات فقط'; end if;
  if length(trim(x.approved_by)) < 3 then raise exception 'اكتب جهة الاعتماد قبل النشر'; end if;
  if position('يُكمل من الإدارة' in x.body) > 0 then raise exception 'أكمل الأقسام المعلّمة «يُكمل من الإدارة» قبل النشر'; end if;
  perform pg_advisory_xact_lock(hashtext('policy:' || x.slug));
  select coalesce(max(version), 0) + 1 into v from policies where slug = x.slug and status = 'published';
  -- التحويل من مسودة إلى منشورة مسموح (المُجمِّد يمنع ما بعد النشر فقط)
  update policies set status = 'published', version = v, published_at = now() where id = p_id;
  return jsonb_build_object('ok', true, 'version', v);
end $$;

-- التحقق من القبول: كل سياسة سارية واجبة القبول يجب أن تكون في القائمة
create or replace function check_policy_acceptance(p jsonb) returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare req uuid[]; got uuid[] := coalesce(array(select (jsonb_array_elements_text(coalesce(p->'accepted_policies','[]'))) ::uuid), '{}'); miss text;
begin
  select coalesce(array_agg(id), '{}') into req from current_policies(riyadh_now()::date) where requires_acceptance;
  select string_agg(title, '، ') into miss from current_policies(riyadh_now()::date) where requires_acceptance and not (id = any(got));
  if miss is not null then raise exception 'يلزم قبول: %', miss; end if;
  return req;
end $$;
create or replace function record_policy_acceptance(p_ids uuid[], p_nid text, p_context text) returns void language sql volatile security definer set search_path = public as $$
  insert into policy_acceptances(policy_id, trainee_id, context)
  select pid, t.id, p_context from unnest(p_ids) pid, trainees t where t.national_id = p_nid
  on conflict (policy_id, trainee_id, context) do nothing;
$$;

-- غلاف دوال التسجيل: تحقق قبل التسجيل، ثم توثيق القبول
alter function register_trainee(jsonb) rename to register_trainee_base;
alter function register_subscription(jsonb) rename to register_subscription_base;
revoke execute on function register_trainee_base(jsonb), register_subscription_base(jsonb), current_policies(date), check_policy_acceptance(jsonb), record_policy_acceptance(uuid[], text, text) from public, anon, authenticated;
create or replace function register_trainee(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ids uuid[] := check_policy_acceptance(p); r jsonb;
begin
  r := register_trainee_base(p);
  perform record_policy_acceptance(ids, p->>'national_id', 'registration');
  return r;
end $$;
create or replace function register_subscription(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ids uuid[] := check_policy_acceptance(p); r jsonb;
begin
  r := register_subscription_base(p);
  perform record_policy_acceptance(ids, p->>'national_id', 'subscription');
  return r;
end $$;
grant execute on function register_trainee(jsonb), register_subscription(jsonb), public_policies() to anon, authenticated;
grant execute on function publish_policy(uuid) to authenticated;
