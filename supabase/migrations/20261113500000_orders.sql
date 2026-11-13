-- =====================================================================
-- الخطوة M — طلبات الشراء (المرحلة 1 من docs/payments/SPEC_v1_4.md):
-- لكل تسجيل طلب برقم فريد دائم، ومحوران مستقلان: مراجعة المسؤول، والسداد (تحويل بنكي يؤكده المحاسب).
-- التسجيل يبقى كما هو (فوري)، ومنع الحضور قبل الاعتماد خيار في الإعدادات (معطّل افتراضيًا).
-- مطابق لـ src/order_logic.js ودوال الطلبات في src/data2.js.
-- =====================================================================
create sequence if not exists order_number_seq;
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  trainee_id uuid not null references trainees(id) on delete restrict,
  kind text not null check (kind in ('program','plan')),
  subscription_id uuid references subscriptions(id) on delete restrict,
  enrollment_ids uuid[] not null default '{}',
  title text not null,
  total numeric(10,2) not null default 0 check (total >= 0),
  due_now numeric(10,2) not null default 0 check (due_now >= 0),
  approval text not null default 'pending_review' check (approval in ('pending_review','needs_information','approved','rejected')),
  payment text not null default 'unpaid' check (payment in ('unpaid','claimed','confirmed')),
  provisional boolean not null default false,
  paid_amount numeric(10,2) not null default 0,
  claim jsonb,
  note text not null default '',
  version int not null default 1,
  created_at timestamptz not null default now()
);
create index if not exists orders_trainee on orders(trainee_id);
create unique index if not exists orders_subscription on orders(subscription_id) where subscription_id is not null;
create index if not exists orders_enrollments on orders using gin (enrollment_ids);
create table if not exists order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders(id) on delete restrict,
  action text not null, by text not null, reason text not null default '', at timestamptz not null default now()
);
create index if not exists order_events_order on order_events(order_id);
alter table orders enable row level security; alter table order_events enable row level security;
-- السجلات المالية لا تُحذف: الإدارة تقرأ فقط، والتغيير عبر الدوال
drop policy if exists orders_admin on orders; create policy orders_admin on orders for select using (is_admin());
drop policy if exists order_events_admin on order_events; create policy order_events_admin on order_events for select using (is_admin());
create or replace function orders_no_delete() returns trigger language plpgsql as $$ begin raise exception 'السجلات المالية لا تُحذف'; end $$;
drop trigger if exists orders_no_delete on orders; create trigger orders_no_delete before delete on orders for each row execute function orders_no_delete();
drop trigger if exists order_events_no_change on order_events; create trigger order_events_no_change before delete or update on order_events for each row execute function orders_no_delete();

-- بيانات الحساب البنكي المقدمة من المالك؛ لا تُعرض للمسجّلين حتى يفعّلها المسؤول
alter table settings add column if not exists bank jsonb not null default '{"enabled":false,"bank":"البنك الأهلي","beneficiary":"مركز سما القدرات","iban":"SA1210000001400012583008","account":"01400012583008"}';
alter table settings add column if not exists require_order_approval boolean not null default false;

create or replace function order_ready(o orders) returns boolean language sql immutable as $$
  select o.provisional or (o.approval = 'approved' and o.payment = 'confirmed') $$;
create or replace function order_public(o orders) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'number', o.number, 'title', o.title, 'kind', o.kind, 'total', o.total, 'due_now', o.due_now, 'approval', o.approval, 'payment', o.payment,
    'provisional', o.provisional, 'note', o.note, 'paid_amount', o.paid_amount,
    'claim', case when o.claim is null then null else jsonb_build_object('amount', o.claim->'amount', 'reference', o.claim->>'reference', 'date', o.claim->>'date') end,
    'created_at', o.created_at, 'trainee_id', o.trainee_id,
    'bank', (select case when coalesce((s.bank->>'enabled')::boolean, false) then s.bank - 'enabled' end from settings s where s.id = 1)) $$;
revoke execute on function order_public(orders) from public, anon, authenticated;

create or replace function order_event(p_order uuid, p_action text, p_by text, p_reason text) returns void language sql volatile security definer set search_path = public as $$
  insert into order_events(order_id, action, by, reason) values (p_order, p_action, p_by, left(coalesce(p_reason,''), 300));
  update orders set version = version + 1 where id = p_order; $$;
revoke execute on function order_event(uuid, text, text, text) from public, anon, authenticated;

create or replace function new_order(p_trainee uuid, p_kind text, p_sub uuid, p_enr uuid[], p_title text, p_total numeric, p_due numeric) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare o orders;
begin
  insert into orders(number, trainee_id, kind, subscription_id, enrollment_ids, title, total, due_now)
  values ('SAMA-' || to_char(riyadh_now(), 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0'), p_trainee, p_kind, p_sub, coalesce(p_enr, '{}'), p_title, coalesce(p_total, 0), coalesce(p_due, 0))
  returning * into o;
  insert into order_events(order_id, action, by) values (o.id, 'created', 'trainee');
  return order_public(o);
end $$;
revoke execute on function new_order(uuid, text, uuid, uuid[], text, numeric, numeric) from public, anon, authenticated;

-- التسجيل كما هو، ويُنشأ معه الطلب
alter function register_trainee(jsonb) rename to register_trainee_noorder;
alter function register_subscription(jsonb) rename to register_subscription_noorder;
revoke execute on function register_trainee_noorder(jsonb), register_subscription_noorder(jsonb) from public, anon, authenticated;
create or replace function register_trainee(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb := register_trainee_noorder(p); v_t uuid; v_ids uuid[]; v_title text; v_total numeric;
begin
  select e.trainee_id, array_agg(e.id order by e.created_at), string_agg(pr.name, '، ' order by e.created_at), coalesce(sum(pr.price), 0)
    into v_t, v_ids, v_title, v_total
  from enrollments e join programs pr on pr.id = e.program_id where e.ref = r->>'ref' group by e.trainee_id;
  if v_t is null then return r; end if;
  return r || jsonb_build_object('order', new_order(v_t, 'program', null, v_ids, v_title, v_total, v_total));
end $$;
create or replace function register_subscription(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb := register_subscription_noorder(p); s subscriptions; pl plans;
begin
  select * into s from subscriptions where ref = r->>'ref';
  if s.id is null or exists (select 1 from orders where subscription_id = s.id) then return r; end if;
  select * into pl from plans where id = s.plan_id;
  return r || jsonb_build_object('order', new_order(s.trainee_id, 'plan', s.id, '{}',
    'باقة ' || case pl.tier when 'basic' then 'أساسية' when 'silver' then 'فضية' when 'gold' then 'ذهبية' when 'diamond' then 'ماسية' when 'custom' then 'خصصناها لك' else pl.name end
      || case when pl.mode = 'remote' then ' — عن بُعد' else '' end,
    pl.reg_fee + pl.installments * pl.installment_amount, pl.reg_fee));
end $$;
grant execute on function register_trainee(jsonb), register_subscription(jsonb) to anon, authenticated;

-- إبلاغ صاحب الطلب بتحويل: برقم الطلب والسجل المدني معًا، أو من جلسة بوابته. لا يعني تأكيد وصول المال.
create or replace function order_report_transfer(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare o orders; t trainees; ph text := my_phone(); v_amount numeric; v_date date; v_ref text := left(btrim(coalesce(p->>'reference','')), 60); ok boolean;
begin
  select * into o from orders where number = btrim(coalesce(p->>'number','')) or id::text = coalesce(p->>'order_id','') limit 1;
  if o.id is not null then select * into t from trainees where id = o.trainee_id; end if;
  ok := t.id is not null and coalesce(p->>'national_id','') <> '' and t.national_id = btrim(p->>'national_id');
  if not ok and t.id is not null and ph <> '' then
    ok := t.phone = ph or exists (select 1 from guardian_links g where g.trainee_id = t.id and g.guardian_phone = ph and g.status = 'verified');
  end if;
  if not coalesce(ok, false) then raise exception 'تعذّر العثور على الطلب. تأكد من رقم الطلب والسجل المدني.'; end if;
  if o.approval = 'rejected' then raise exception 'هذا الطلب مرفوض؛ راجع إدارة المعهد.'; end if;
  if o.payment = 'confirmed' then raise exception 'سبق تأكيد سداد هذا الطلب.'; end if;
  begin v_amount := round((p->>'amount')::numeric, 2); exception when others then v_amount := null; end;
  if v_amount is null or v_amount <= 0 or v_amount > 100000 then raise exception 'اكتب المبلغ المحوَّل بالريال'; end if;
  begin v_date := (p->>'date')::date; exception when others then v_date := null; end;
  if v_date is null or v_date > riyadh_now()::date then raise exception 'اختر تاريخ التحويل'; end if;
  update orders set claim = jsonb_build_object('amount', v_amount, 'date', v_date, 'reference', v_ref, 'at', now()), payment = 'claimed' where id = o.id;
  perform order_event(o.id, 'transfer_reported', 'trainee', v_amount::text || ' ريال' || case when v_ref <> '' then ' · مرجع ' || v_ref else '' end);
  select * into o from orders where id = o.id;
  return order_public(o);
end $$;
grant execute on function order_report_transfer(jsonb) to anon, authenticated;

create or replace function admin_review_order(p_id uuid, p_decision text, p_reason text default '', p_version int default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare o orders;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'الطلب غير موجود'; end if;
  if p_decision not in ('approved','needs_information','rejected') then raise exception 'قرار غير صالح'; end if;
  if p_version is not null and p_version <> o.version then raise exception 'تغيّر الطلب أثناء المراجعة؛ أعد فتحه ثم قرّر.'; end if;
  if p_decision <> 'approved' and length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'اكتب سبب القرار'; end if;
  update orders set approval = p_decision, note = case when p_decision = 'approved' then '' else left(btrim(p_reason), 300) end,
    provisional = case when p_decision = 'rejected' then false else provisional end where id = p_id;
  perform order_event(p_id, p_decision, auth.uid()::text, p_reason);
  return jsonb_build_object('ok', true);
end $$;
create or replace function admin_confirm_payment(p_id uuid, p_amount numeric, p_confirmed boolean default true) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare o orders; a numeric := round(coalesce(p_amount, 0), 2);
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'الطلب غير موجود'; end if;
  if p_confirmed then
    if a <= 0 then raise exception 'اكتب المبلغ الواصل فعليًا'; end if;
    if a < o.due_now then raise exception 'المبلغ أقل من المطلوب الآن (% ريال)؛ لا يُعد السداد مستوفيًا', trim_scale(o.due_now); end if;
    update orders set paid_amount = a, payment = 'confirmed' where id = p_id;
    perform order_event(p_id, 'payment_confirmed', auth.uid()::text, a::text || ' ريال');
  else
    update orders set paid_amount = 0, payment = case when claim is null then 'unpaid' else 'claimed' end where id = p_id;
    perform order_event(p_id, 'payment_unconfirmed', auth.uid()::text, '');
  end if;
  return jsonb_build_object('ok', true);
end $$;
create or replace function admin_order_provisional(p_id uuid, p_on boolean, p_reason text default '') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare o orders;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'الطلب غير موجود'; end if;
  if p_on and o.approval = 'rejected' then raise exception 'الطلب مرفوض'; end if;
  if p_on and length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'اكتب سبب القبول المؤقت'; end if;
  update orders set provisional = coalesce(p_on, false) where id = p_id;
  perform order_event(p_id, case when p_on then 'provisional_on' else 'provisional_off' end, auth.uid()::text, p_reason);
  return jsonb_build_object('ok', true);
end $$;
create or replace function valid_iban(v text) returns boolean language sql immutable as $$
  select s ~ '^SA[0-9]{22}$' and (substr(s, 5) || '2810' || substr(s, 3, 2))::numeric % 97 = 1
  from (select upper(regexp_replace(coalesce(v,''), '\s', '', 'g')) as s) x $$;
create or replace function admin_save_bank(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if not valid_iban(p->>'iban') then raise exception 'رقم الآيبان غير صحيح'; end if;
  if btrim(coalesce(p->>'beneficiary','')) = '' or btrim(coalesce(p->>'bank','')) = '' then raise exception 'اكتب اسم البنك واسم المستفيد'; end if;
  update settings set bank = jsonb_build_object('enabled', coalesce((p->>'enabled')::boolean, false), 'bank', btrim(p->>'bank'), 'beneficiary', btrim(p->>'beneficiary'),
    'iban', upper(regexp_replace(p->>'iban', '\s', '', 'g')), 'account', btrim(coalesce(p->>'account',''))) where id = 1;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function admin_review_order(uuid, text, text, int), admin_confirm_payment(uuid, numeric, boolean), admin_order_provisional(uuid, boolean, text), admin_save_bank(jsonb) from public, anon;
grant execute on function admin_review_order(uuid, text, text, int), admin_confirm_payment(uuid, numeric, boolean), admin_order_provisional(uuid, boolean, text), admin_save_bank(jsonb) to authenticated;

-- بوابة الحضور: عند تفعيل الخيار يُرفض مسح الباركود لمن طلبه غير مستوفٍ (التسجيلات السابقة بلا طلب لا تُمنع، والتحضير اليدوي من الإدارة لا يُمنع)
create or replace function order_attendance_gate() returns trigger language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  if coalesce(current_setting('sama.checkin', true), '') <> 'on' or not (select require_order_approval from settings where id = 1) then return new; end if;
  if tg_table_name = 'sub_attendance' then select * into o from orders where subscription_id = new.subscription_id;
  else select * into o from orders where enrollment_ids @> array[new.enrollment_id] limit 1; end if;
  if o.id is not null and not order_ready(o) then raise exception 'order_pending' using errcode = 'SAM01'; end if;
  return new;
end $$;
drop trigger if exists order_gate on attendance; create trigger order_gate before insert on attendance for each row execute function order_attendance_gate();
drop trigger if exists order_gate on sub_attendance; create trigger order_gate before insert on sub_attendance for each row execute function order_attendance_gate();

alter function checkin(text, text, text, text, text) rename to checkin_noorder;
revoke execute on function checkin_noorder(text, text, text, text, text) from public, anon, authenticated;
create or replace function checkin(p_nid text, p_code text default null, p_program text default null, p_device text default '', p_choice text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare r jsonb;
begin
  perform set_config('sama.checkin', 'on', true);
  begin
    r := checkin_noorder(p_nid, p_code, p_program, p_device, p_choice);
  exception when sqlstate 'SAM01' then
    r := jsonb_build_object('ok', false, 'reason', 'order_pending');
    insert into checkin_attempts(date, nid_hash, device, result, kind, trainee_hint)
    values (riyadh_now()::date, md5('sama:' || coalesce(p_nid,'')), left(coalesce(p_device,''),64), 'order_pending', 'order', null);
  end;
  perform set_config('sama.checkin', '', true);
  return r;
end $$;
grant execute on function checkin(text, text, text, text, text) to anon, authenticated;

-- طلبات المتدرب في بوابته وبوابة ولي أمره
alter function portal_data(text) rename to portal_data_cohort;
revoke execute on function portal_data_cohort(text) from public, anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_cohort(p_role); ph text := my_phone(); ids uuid[];
begin
  if base is null or p_role not in ('student','guardian') then return base; end if;
  if p_role = 'student' then select coalesce(array_agg(id), '{}') into ids from trainees where phone = ph;
  else select coalesce(array_agg(trainee_id), '{}') into ids from guardian_links where guardian_phone = ph and status = 'verified'; end if;
  return base || jsonb_build_object('orders', coalesce((select jsonb_agg(order_public(o) order by o.created_at) from orders o where o.trainee_id = any(ids)), '[]'));
end $$;
revoke execute on function portal_data(text) from public, anon;
grant execute on function portal_data(text) to authenticated;
