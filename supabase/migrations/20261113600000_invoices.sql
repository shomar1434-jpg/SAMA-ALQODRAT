-- =====================================================================
-- الخطوة N — الفواتير الداخلية (مرجع المسؤول لمراجعة الحسابات):
-- تصدر فاتورة برقم تسلسلي عند تأكيد السداد، بنسخة ثابتة من بيانات العميل والخدمة والتحويل.
-- لا تُحذف ولا تُعدَّل بياناتها؛ تُلغى بسبب مكتوب مع إلغاء تأكيد السداد. مستند داخلي وليس فاتورة ضريبية.
-- مطابق لـ src/invoice_logic.js ودوال الفواتير في src/data2.js.
-- =====================================================================
create sequence if not exists invoice_number_seq;
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  number text unique not null,
  order_id uuid not null references orders(id) on delete restrict,
  order_number text not null,
  trainee_id uuid not null references trainees(id) on delete restrict,
  customer_name text not null, customer_nid text not null default '', customer_phone text not null default '',
  kind text not null, service text not null, purchase_date date not null,
  total numeric(10,2) not null, paid numeric(10,2) not null check (paid > 0), remaining numeric(10,2) not null default 0,
  method text not null default 'تحويل بنكي', transfer_date date not null, transfer_ref text not null default '',
  issue_date date not null, status text not null default 'issued' check (status in ('issued','void')),
  void_reason text not null default '', voided_at timestamptz, has_receipt boolean not null default false,
  issued_by uuid, created_at timestamptz not null default now()
);
create index if not exists invoices_order on invoices(order_id);
create index if not exists invoices_date on invoices(issue_date);
create unique index if not exists invoices_one_live on invoices(order_id) where status = 'issued';
create table if not exists invoice_receipts (
  invoice_id uuid primary key references invoices(id) on delete restrict,
  image text not null check (length(image) <= 900000 and image ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'),
  updated_at timestamptz not null default now()
);
alter table invoices enable row level security; alter table invoice_receipts enable row level security;
drop policy if exists invoices_admin on invoices; create policy invoices_admin on invoices for select using (is_admin());
-- صور الإيصالات لا تُقرأ إلا عبر الدالة
drop trigger if exists invoices_no_delete on invoices; create trigger invoices_no_delete before delete on invoices for each row execute function orders_no_delete();
drop trigger if exists invoice_receipts_no_delete on invoice_receipts; create trigger invoice_receipts_no_delete before delete on invoice_receipts for each row execute function orders_no_delete();
-- بيانات الفاتورة ثابتة بعد الإصدار: يُسمح فقط بالإلغاء وعلامة الإيصال
create or replace function invoices_freeze() returns trigger language plpgsql as $$
begin
  if (to_jsonb(new) - array['status','void_reason','voided_at','has_receipt']) <> (to_jsonb(old) - array['status','void_reason','voided_at','has_receipt'])
     or (old.status = 'void' and new.status <> 'void') then raise exception 'بيانات الفاتورة لا تُعدَّل بعد إصدارها'; end if;
  return new;
end $$;
drop trigger if exists invoices_freeze on invoices; create trigger invoices_freeze before update on invoices for each row execute function invoices_freeze();

drop function if exists admin_confirm_payment(uuid, numeric, boolean);
create or replace function admin_confirm_payment(p_id uuid, p_amount numeric, p_confirmed boolean default true, p_reason text default '') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare o orders; t trainees; a numeric := round(coalesce(p_amount, 0), 2); d date := riyadh_now()::date; v_no text;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'الطلب غير موجود'; end if;
  if p_confirmed then
    if o.payment = 'confirmed' then raise exception 'سبق تأكيد سداد هذا الطلب.'; end if;
    if a <= 0 then raise exception 'اكتب المبلغ الواصل فعليًا'; end if;
    if a < o.due_now then raise exception 'المبلغ أقل من المطلوب الآن (% ريال)؛ لا يُعد السداد مستوفيًا', trim_scale(o.due_now); end if;
    update orders set paid_amount = a, payment = 'confirmed' where id = p_id;
    select * into t from trainees where id = o.trainee_id;
    v_no := 'INV-' || to_char(d, 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0');
    insert into invoices(number, order_id, order_number, trainee_id, customer_name, customer_nid, customer_phone, kind, service, purchase_date, total, paid, remaining, transfer_date, transfer_ref, issue_date, issued_by)
    values (v_no, o.id, o.number, o.trainee_id, t.full_name, coalesce(t.national_id,''), coalesce(t.phone,''), o.kind, o.title, (o.created_at at time zone 'Asia/Riyadh')::date,
      o.total, a, greatest(0, o.total - a), coalesce((o.claim->>'date')::date, d), coalesce(o.claim->>'reference',''), d, auth.uid());
    perform order_event(p_id, 'payment_confirmed', auth.uid()::text, a::text || ' ريال · فاتورة ' || v_no);
    return jsonb_build_object('ok', true, 'invoice', v_no);
  else
    if o.payment <> 'confirmed' then raise exception 'السداد غير مؤكد'; end if;
    if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'اكتب سبب إلغاء تأكيد السداد'; end if;
    update invoices set status = 'void', void_reason = left(btrim(p_reason), 300), voided_at = now() where order_id = p_id and status = 'issued';
    update orders set paid_amount = 0, payment = case when claim is null then 'unpaid' else 'claimed' end where id = p_id;
    perform order_event(p_id, 'payment_unconfirmed', auth.uid()::text, p_reason);
    return jsonb_build_object('ok', true);
  end if;
end $$;
-- صورة الإيصال يرفقها المسؤول؛ لا يُستنتج منها السداد
create or replace function admin_attach_receipt(p_id uuid, p_image text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if not exists (select 1 from invoices where id = p_id) then raise exception 'الفاتورة غير موجودة'; end if;
  if p_image is null or length(p_image) > 900000 or p_image !~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' then raise exception 'صورة الإيصال غير صالحة أو كبيرة'; end if;
  insert into invoice_receipts(invoice_id, image) values (p_id, p_image) on conflict (invoice_id) do update set image = excluded.image, updated_at = now();
  update invoices set has_receipt = true where id = p_id;
  return jsonb_build_object('ok', true);
end $$;
create or replace function admin_invoice_receipt(p_id uuid) returns text language plpgsql stable security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  return (select image from invoice_receipts where invoice_id = p_id);
end $$;
revoke execute on function admin_confirm_payment(uuid, numeric, boolean, text), admin_attach_receipt(uuid, text), admin_invoice_receipt(uuid) from public, anon;
grant execute on function admin_confirm_payment(uuid, numeric, boolean, text), admin_attach_receipt(uuid, text), admin_invoice_receipt(uuid) to authenticated;
