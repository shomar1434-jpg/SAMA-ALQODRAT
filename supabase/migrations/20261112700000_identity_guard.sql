-- =====================================================================
-- الخطوة A — حماية الهوية: إعادة التسجيل بسجل مدني موجود لا تغيّر بيانات المتدرب المعتمدة.
-- يُضاف التسجيل إلى الملف نفسه، وتُكمَّل الحقول الفارغة فقط، وأي اختلاف يصبح «طلب تحديث بيانات» تراجعه الإدارة.
-- مطابق لـ mergeOnRegister في src/data2.js.
-- =====================================================================
create table if not exists profile_change_requests (
  id uuid primary key default gen_random_uuid(),
  trainee_id uuid not null references trainees(id) on delete restrict,
  changes jsonb not null,                       -- {"phone": {"old": "...", "new": "..."}, ...}
  source text not null default 'registration',
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(), decided_at timestamptz, decided_by uuid
);
create index if not exists profile_change_requests_pending on profile_change_requests(trainee_id) where status = 'pending';
alter table profile_change_requests enable row level security;
drop policy if exists profile_change_requests_admin on profile_change_requests;
create policy profile_change_requests_admin on profile_change_requests for all using (is_admin()) with check (is_admin());
create trigger profile_change_requests_audit after insert or update or delete on profile_change_requests for each row execute function audit_row();

-- الحارس: يعمل فقط أثناء التسجيل العام (sama.registering = on)، فلا يمس تعديلات الإدارة
create or replace function trainees_register_guard() returns trigger language plpgsql security definer set search_path = public as $$
declare ch jsonb := '{}'; keep jsonb := '{}'; oj jsonb := to_jsonb(old); nj jsonb := to_jsonb(new); f text; o text; nw text;
begin
  if coalesce(current_setting('sama.registering', true), '') <> 'on' then return new; end if;
  foreach f in array array['full_name','phone','email','gender','birth_date','city','education','employer'] loop
    o := nullif(trim(coalesce(oj->>f, '')), ''); nw := nullif(trim(coalesce(nj->>f, '')), '');
    if o is null then continue; end if;                                   -- حقل فارغ سابقًا: يُكمَّل
    if nw is not null and nw <> o then ch := ch || jsonb_build_object(f, jsonb_build_object('old', o, 'new', nw)); end if;
    keep := keep || jsonb_build_object(f, oj->f);                         -- يبقى المعتمد
  end loop;
  new := jsonb_populate_record(new, keep);
  if ch <> '{}' and not exists (select 1 from profile_change_requests where trainee_id = old.id and status = 'pending' and changes = ch) then
    insert into profile_change_requests(trainee_id, changes) values (old.id, ch);
  end if;
  return new;
end $$;
drop trigger if exists trainees_register_guard on trainees;
create trigger trainees_register_guard before update on trainees for each row execute function trainees_register_guard();

-- أغلفة التسجيل: تفعيل الحارس طوال العملية
create or replace function register_trainee(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ids uuid[] := check_policy_acceptance(p); r jsonb;
begin
  perform set_config('sama.registering', 'on', true);
  r := register_trainee_base(p);
  perform set_config('sama.registering', '', true);
  perform record_policy_acceptance(ids, p->>'national_id', 'registration');
  return r;
end $$;
create or replace function register_subscription(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ids uuid[] := check_policy_acceptance(p); r jsonb;
begin
  perform set_config('sama.registering', 'on', true);
  r := register_subscription_base(p);
  perform set_config('sama.registering', '', true);
  perform record_policy_acceptance(ids, p->>'national_id', 'subscription');
  return r;
end $$;

-- قرار الإدارة: القبول يطبّق القيم الجديدة، والرفض يُبقي الملف كما هو
create or replace function resolve_profile_change(p_id uuid, p_approve boolean) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r profile_change_requests%rowtype; t trainees%rowtype;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into r from profile_change_requests where id = p_id for update;
  if r.id is null or r.status <> 'pending' then raise exception 'الطلب غير موجود أو سبق البت فيه'; end if;
  if p_approve then
    select * into t from trainees where id = r.trainee_id for update;
    t := jsonb_populate_record(t, (select jsonb_object_agg(k, v->'new') from jsonb_each(r.changes) x(k, v)));
    update trainees set full_name = t.full_name, phone = t.phone, email = t.email, gender = t.gender, birth_date = t.birth_date,
      city = t.city, education = t.education, employer = t.employer where id = r.trainee_id;
  end if;
  update profile_change_requests set status = case when p_approve then 'approved' else 'rejected' end, decided_at = now(), decided_by = auth.uid() where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function resolve_profile_change(uuid, boolean) from public, anon;
grant execute on function resolve_profile_change(uuid, boolean) to authenticated;
grant execute on function register_trainee(jsonb), register_subscription(jsonb) to anon, authenticated;
