-- =====================================================================
-- الخطوة AH — عمليات الفوترة داخل نظام الطلبات والفواتير الحالي:
--  • استلام مبلغ بأكثر من طريقة (نقدًا + شبكة + تحويل…) في فاتورة واحدة تُفصَّل فيها الطرق (admin_receive_payment).
--  • تغيير الباقة ترقيةً أو تخفيضًا مع إبقاء بداية الاشتراك (قرار المالك: 29 أغسطس) (admin_change_plan).
--  • الإلغاء والانسحاب (admin_cancel_order)، والاسترداد بأمر المالك بإشعار استرداد RF-… بطرق الرد،
--    مرتبط بالفاتورة الأصلية (admin_refund)، وإلغاء إشعار صدر خطأً (admin_void_refund).
--  • المشترك الذي تضيفه الإدارة يُنشأ له طلب موافق عليه ليُستلم مبلغه مباشرة.
-- المالك وحده يعتمد تغيير الباقة والإلغاء والاسترداد؛ استلام المبالغ كتأكيد السداد (المالك والمدير الكامل).
-- مطابق لـ src/billing_logic.js ودوال الفوترة في src/data2.js.
-- =====================================================================
alter table invoices add column if not exists doc_type text not null default 'invoice';
alter table invoices drop constraint if exists invoices_doc_type_check;
alter table invoices add constraint invoices_doc_type_check check (doc_type in ('invoice','refund'));
alter table invoices add column if not exists lines jsonb not null default '[]';
alter table invoices add column if not exists ref_invoice text not null default '';
alter table invoices add column if not exists reason text not null default '';
alter table orders add column if not exists refunded numeric(10,2) not null default 0;
alter table orders add column if not exists cancelled_at timestamptz;
alter table orders add column if not exists cancel_reason text not null default '';
create sequence if not exists refund_number_seq;

-- سطور السداد: [{method, amount, reference}] ↔ checkLines
create or replace function check_pay_lines(p_lines jsonb) returns jsonb language plpgsql immutable set search_path = public as $$
declare r jsonb := '[]'; x jsonb; a numeric;
begin
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'أضف مبلغًا وطريقة سداد'; end if;
  if jsonb_array_length(p_lines) > 6 then raise exception '6 طرق سداد على الأكثر'; end if;
  for x in select * from jsonb_array_elements(p_lines) loop
    begin a := round(coalesce(nullif(btrim(x->>'amount'), '')::numeric, 0), 2); exception when others then a := 0; end;
    if a <= 0 then raise exception 'اكتب مبلغ كل طريقة سداد'; end if;
    if pay_method_txt(x->>'method') is null then raise exception 'اختر طريقة السداد'; end if;
    r := r || jsonb_build_array(jsonb_build_object('method', x->>'method', 'amount', a, 'reference', left(btrim(coalesce(x->>'reference', '')), 60)));
  end loop;
  return r;
end $$;
create or replace function lines_sum(p jsonb) returns numeric language sql immutable as $$ select coalesce(sum((x->>'amount')::numeric), 0) from jsonb_array_elements(p) x $$;
create or replace function lines_method(p jsonb) returns text language sql immutable set search_path = public as $$
  select case when jsonb_array_length(p) = 1 then pay_method_txt(p->0->>'method') else 'متعددة' end $$;
create or replace function lines_text(p jsonb) returns text language sql immutable set search_path = public as $$
  select string_agg(pay_method_txt(x->>'method') || ' ' || trim_scale((x->>'amount')::numeric)::text, ' + ' order by n) from jsonb_array_elements(p) with ordinality t(x, n) $$;
create or replace function lines_ref(p jsonb) returns text language sql immutable as $$
  select left(coalesce(string_agg(x->>'reference', ' / ' order by n) filter (where x->>'reference' <> ''), ''), 60) from jsonb_array_elements(p) with ordinality t(x, n) $$;
-- القابل للاسترداد ↔ refundable
create or replace function order_refundable(o orders) returns numeric language sql immutable as $$
  select case when o.cancelled_at is not null then o.paid_amount else greatest(0, o.paid_amount - o.total) end $$;
create or replace function plan_title(pl plans) returns text language sql immutable as $$
  select 'باقة ' || case pl.tier when 'basic' then 'أساسية' when 'silver' then 'فضية' when 'gold' then 'ذهبية' when 'diamond' then 'ماسية' when 'custom' then 'خصصناها لك' else pl.name end
    || case when pl.mode = 'remote' then ' — عن بُعد' else '' end $$;

-- إصدار مستند (فاتورة أو إشعار استرداد) بنسخة ثابتة
create or replace function issue_doc(o orders, p_kind text, a numeric, p_remaining numeric, p_lines jsonb, p_date date, p_ref text, p_ref_invoice text, p_reason text) returns invoices
language plpgsql volatile security definer set search_path = public as $$
declare t trainees; d date := riyadh_now()::date; v_no text; r invoices;
begin
  select * into t from trainees where id = o.trainee_id;
  v_no := case when p_kind = 'refund' then 'RF-' || to_char(d, 'YYYY') || '-' || lpad(nextval('refund_number_seq')::text, 6, '0')
               else 'INV-' || to_char(d, 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0') end;
  insert into invoices(number, order_id, order_number, trainee_id, customer_name, customer_nid, customer_phone, kind, service, purchase_date, total, paid, remaining, method, transfer_date, transfer_ref, issue_date, issued_by, doc_type, lines, ref_invoice, reason)
  values (v_no, o.id, o.number, o.trainee_id, t.full_name, coalesce(t.national_id,''), coalesce(t.phone,''), o.kind, o.title, (o.created_at at time zone 'Asia/Riyadh')::date,
    o.total, a, greatest(0, p_remaining), lines_method(p_lines), coalesce(p_date, d), coalesce(p_ref,''), d, auth.uid(), p_kind, p_lines, coalesce(p_ref_invoice,''), coalesce(p_reason,''))
  returning * into r;
  return r;
end $$;

-- استلام مبلغ بطريقة أو أكثر: فاتورة واحدة؛ أول استلام يؤكد السداد ويشترط المطلوب الآن
create or replace function admin_receive_payment(p_id uuid, p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare o orders; v_lines jsonb; a numeric; v_first boolean; d date; v_today date := riyadh_now()::date; v_ref text; r invoices;
begin
  if not is_full_admin() then raise exception 'تأكيد السداد لمدير النظام فقط'; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'الطلب غير موجود'; end if;
  if o.approval = 'rejected' then raise exception 'الطلب مرفوض'; end if;
  if o.cancelled_at is not null then raise exception 'الطلب ملغى'; end if;
  v_lines := check_pay_lines(p->'lines'); a := lines_sum(v_lines); v_first := o.payment <> 'confirmed';
  d := coalesce(nullif(p->>'date','')::date, case when v_first then (o.claim->>'date')::date end, v_today);
  if d > v_today then raise exception 'تاريخ السداد في المستقبل'; end if;
  if v_first and a < o.due_now then raise exception 'المبلغ أقل من المطلوب الآن (% ريال)؛ لا يُعد السداد مستوفيًا', trim_scale(o.due_now); end if;
  if o.total > 0 and a > o.total - o.paid_amount then raise exception 'المبلغ أكبر من المتبقي (% ريال)', trim_scale(greatest(0, o.total - o.paid_amount)); end if;
  v_ref := nullif(lines_ref(v_lines), ''); if v_ref is null and v_first then v_ref := coalesce(o.claim->>'reference', ''); end if;
  update orders set paid_amount = o.paid_amount + a, payment = 'confirmed' where id = p_id;
  r := issue_doc(o, 'invoice', a, o.total - o.paid_amount - a, v_lines, d, v_ref, '', '');
  perform order_event(p_id, case when v_first then 'payment_confirmed' else 'payment_added' end, auth.uid()::text, trim_scale(a)::text || ' ريال · ' || lines_text(v_lines) || ' · فاتورة ' || r.number);
  return jsonb_build_object('ok', true, 'invoice', r.number, 'id', r.id);
end $$;

-- ترقية أو تخفيض الباقة: البداية كما هي، والنهاية تُحسب للباقة الجديدة؛ الفائض لا يُرد إلا بأمر المالك (admin_refund)
create or replace function admin_change_plan(p_id uuid, p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare o orders; s subscriptions; pl plans; old plans; v_total numeric; v_end date; v_sur numeric; v_reason text := btrim(coalesce(p->>'reason',''));
begin
  if not is_owner() then raise exception 'هذه العملية يعتمدها المالك وحده'; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'الطلب غير موجود'; end if;
  if o.kind <> 'plan' or o.subscription_id is null then raise exception 'تغيير الباقة لطلبات الباقات فقط'; end if;
  if o.cancelled_at is not null then raise exception 'الطلب ملغى'; end if;
  if o.approval = 'rejected' then raise exception 'الطلب مرفوض'; end if;
  select * into s from subscriptions where id = o.subscription_id for update;
  if s.id is null or s.status = 'cancelled' then raise exception 'الاشتراك ملغى'; end if;
  select * into pl from plans where id = nullif(p->>'plan_id','')::uuid and active;
  if pl.id is null then raise exception 'اختر الباقة'; end if;
  if pl.mode = 'remote' or pl.status = 'coming_soon' then raise exception 'هذه الباقة غير متاحة بعد'; end if;
  if pl.id = s.plan_id then raise exception 'هذه باقته الحالية'; end if;
  if length(v_reason) < 3 then raise exception 'اكتب سبب تغيير الباقة'; end if;
  if exists (select 1 from subscriptions x where x.id <> s.id and x.trainee_id = s.trainee_id and x.plan_id = pl.id and x.status in ('pending','active')) then raise exception 'للمتدرب اشتراك قائم في هذه الباقة'; end if;
  v_total := round(coalesce(nullif(p->>'total','')::numeric, pl.reg_fee + pl.installments * pl.installment_amount), 2);
  if v_total < 0 then raise exception 'اكتب الإجمالي الجديد'; end if;
  select * into old from plans where id = s.plan_id;
  v_end := case when s.start_date is null then null else sub_end(pl.id, s.start_date) end;
  update subscriptions set plan_id = pl.id, subjects = pl.subjects, end_date = v_end,
    status = case when s.start_date is null then 'pending' when v_end < riyadh_now()::date then 'ended' else 'active' end where id = s.id;
  update orders set title = plan_title(pl), total = v_total, due_now = least(due_now, v_total) where id = p_id;
  v_sur := greatest(0, o.paid_amount - v_total);
  perform order_event(p_id, 'plan_changed', auth.uid()::text, 'من ' || plan_title(old) || ' إلى ' || plan_title(pl) || ' · الإجمالي ' || trim_scale(v_total)::text || ' ريال'
    || case when v_sur > 0 then ' · فائض ' || trim_scale(v_sur)::text || ' ريال' else '' end || ' · ' || left(v_reason, 200));
  return jsonb_build_object('ok', true, 'surplus', v_sur);
end $$;

-- إلغاء وانسحاب: يلغي الاشتراك أو التسجيل، ويبقى الطلب وسجله والفواتير؛ الاسترداد قرار مستقل
create or replace function admin_cancel_order(p_id uuid, p_reason text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare o orders; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not is_owner() then raise exception 'هذه العملية يعتمدها المالك وحده'; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'الطلب غير موجود'; end if;
  if o.cancelled_at is not null then raise exception 'الطلب ملغى مسبقًا'; end if;
  if length(v_reason) < 3 then raise exception 'اكتب سبب الإلغاء'; end if;
  update orders set cancelled_at = now(), cancel_reason = left(v_reason, 300), provisional = false where id = p_id returning * into o;
  if o.subscription_id is not null then update subscriptions set status = 'cancelled' where id = o.subscription_id; end if;
  update enrollments set status = 'ملغى' where id = any(o.enrollment_ids);
  perform order_event(p_id, 'cancelled', auth.uid()::text, v_reason);
  return jsonb_build_object('ok', true, 'refundable', order_refundable(o));
end $$;

-- الاسترداد بأمر المالك: إشعار استرداد بطرق الرد، مرتبط بآخر فاتورة سارية للطلب
create or replace function admin_refund(p_id uuid, p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare o orders; v_lines jsonb; a numeric; v_max numeric; v_reason text := btrim(coalesce(p->>'reason','')); v_last text; r invoices;
begin
  if not is_owner() then raise exception 'هذه العملية يعتمدها المالك وحده'; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'الطلب غير موجود'; end if;
  v_max := order_refundable(o);
  if v_max <= 0 then raise exception 'لا مبلغ قابل للاسترداد: يكون بعد إلغاء الطلب أو عند فائض بعد تخفيض الباقة'; end if;
  v_lines := check_pay_lines(p->'lines'); a := lines_sum(v_lines);
  if a > v_max then raise exception 'المبلغ أكبر من القابل للاسترداد (% ريال)', trim_scale(v_max); end if;
  if length(v_reason) < 3 then raise exception 'اكتب سبب الاسترداد'; end if;
  select number into v_last from invoices where order_id = p_id and status = 'issued' and doc_type = 'invoice' order by number desc limit 1;
  update orders set paid_amount = o.paid_amount - a, refunded = o.refunded + a where id = p_id;
  r := issue_doc(o, 'refund', a, case when o.cancelled_at is not null then 0 else o.total - (o.paid_amount - a) end, v_lines, null, lines_ref(v_lines), v_last, left(v_reason, 300));
  perform order_event(p_id, 'refunded', auth.uid()::text, trim_scale(a)::text || ' ريال · ' || lines_text(v_lines) || ' · ' || r.number || ' · ' || left(v_reason, 200));
  return jsonb_build_object('ok', true, 'number', r.number, 'id', r.id);
end $$;

-- إلغاء إشعار استرداد صدر خطأً: يعود المبلغ إلى المدفوع
create or replace function admin_void_refund(p_id uuid, p_reason text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare i invoices; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not is_owner() then raise exception 'هذه العملية يعتمدها المالك وحده'; end if;
  select * into i from invoices where id = p_id for update;
  if i.id is null or i.doc_type <> 'refund' then raise exception 'الإشعار غير موجود'; end if;
  if i.status <> 'issued' then raise exception 'الإشعار ملغى مسبقًا'; end if;
  if length(v_reason) < 3 then raise exception 'اكتب سبب الإلغاء'; end if;
  update invoices set status = 'void', void_reason = left(v_reason, 300), voided_at = now() where id = p_id;
  update orders set paid_amount = paid_amount + i.paid, refunded = refunded - i.paid where id = i.order_id;
  perform order_event(i.order_id, 'refund_voided', auth.uid()::text, i.number || ' · ' || left(v_reason, 200));
  return jsonb_build_object('ok', true);
end $$;

-- إلغاء تأكيد السداد لا يجوز وللطلب إشعار استرداد ساري
alter function admin_confirm_payment(uuid, numeric, boolean, text, text) rename to admin_confirm_payment_roles;
create or replace function admin_confirm_payment(p_id uuid, p_amount numeric, p_confirmed boolean default true, p_reason text default '', p_method text default 'transfer') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
begin
  if not p_confirmed and exists (select 1 from invoices where order_id = p_id and doc_type = 'refund' and status = 'issued') then
    raise exception 'للطلب إشعار استرداد ساري؛ ألغِه أولًا قبل إلغاء تأكيد السداد'; end if;
  return admin_confirm_payment_roles(p_id, p_amount, p_confirmed, p_reason, p_method);
end $$;

-- المشترك الذي تضيفه الإدارة: طلب موافق عليه (بلا تكرار إن وُجد طلب للاشتراك)
alter function admin_save_subscription(jsonb) rename to admin_save_subscription_noorder;
create or replace function admin_save_subscription(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; s subscriptions; pl plans; o jsonb;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  r := admin_save_subscription_noorder(p);
  if nullif(p->>'id','') is null then
    select * into s from subscriptions where id = (r->>'id')::uuid;
    if s.id is not null and not exists (select 1 from orders where subscription_id = s.id) then
      select * into pl from plans where id = s.plan_id;
      o := new_order(s.trainee_id, 'plan', s.id, '{}', plan_title(pl), pl.reg_fee + pl.installments * pl.installment_amount, pl.reg_fee);
      update orders set approval = 'approved' where id = (o->>'id')::uuid;
      perform order_event((o->>'id')::uuid, 'approved', auth.uid()::text, 'إضافة من الإدارة');
      r := r || jsonb_build_object('order_id', o->>'id');
    end if;
  end if;
  return r;
end $$;

-- ما يراه صاحب الطلب: حالة الإلغاء والمسترد
create or replace function order_public(o orders) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'number', o.number, 'title', o.title, 'kind', o.kind, 'total', o.total, 'due_now', o.due_now, 'approval', o.approval, 'payment', o.payment,
    'provisional', o.provisional, 'note', o.note, 'paid_amount', o.paid_amount, 'discount_note', o.discount_note,
    'claim', case when o.claim is null then null else jsonb_build_object('amount', o.claim->'amount', 'reference', o.claim->>'reference', 'date', o.claim->>'date') end,
    'created_at', o.created_at, 'trainee_id', o.trainee_id, 'cancelled', o.cancelled_at is not null, 'refunded', o.refunded,
    'bank', (select case when coalesce((s.bank->>'enabled')::boolean, false) then s.bank - 'enabled' end from settings s where s.id = 1)) $$;

revoke execute on function check_pay_lines(jsonb), lines_sum(jsonb), lines_method(jsonb), lines_text(jsonb), lines_ref(jsonb), order_refundable(orders), plan_title(plans),
  issue_doc(orders, text, numeric, numeric, jsonb, date, text, text, text), admin_confirm_payment_roles(uuid, numeric, boolean, text, text), admin_save_subscription_noorder(jsonb) from public, anon, authenticated;
revoke execute on function admin_receive_payment(uuid, jsonb), admin_change_plan(uuid, jsonb), admin_cancel_order(uuid, text), admin_refund(uuid, jsonb), admin_void_refund(uuid, text),
  admin_confirm_payment(uuid, numeric, boolean, text, text), admin_save_subscription(jsonb) from public, anon;
grant execute on function admin_receive_payment(uuid, jsonb), admin_change_plan(uuid, jsonb), admin_cancel_order(uuid, text), admin_refund(uuid, jsonb), admin_void_refund(uuid, text),
  admin_confirm_payment(uuid, numeric, boolean, text, text), admin_save_subscription(jsonb) to authenticated;
