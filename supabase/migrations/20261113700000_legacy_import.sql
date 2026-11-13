-- =====================================================================
-- الخطوة O — طرق السداد والدفعات المتعددة، واستيراد المسجّلين سابقًا، ومراجعة بيانات المتدربين.
-- مطابق لـ src/import_logic.js ودوالها في src/data2.js (importLegacy، saveTrainee، addOrderPayment…).
-- =====================================================================
alter table trainees add column if not exists imported boolean not null default false;
alter table trainees add column if not exists import_notes jsonb not null default '[]';
alter table subscriptions add column if not exists track_from date;
alter table subscriptions add column if not exists imported boolean not null default false;
alter table orders add column if not exists opening jsonb;
alter table orders add column if not exists discount_note text not null default '';
-- أكثر من فاتورة سارية للطلب (فاتورة لكل دفعة)
drop index if exists invoices_one_live;

create or replace function pay_method_txt(m text) returns text language sql immutable as $$
  select case m when 'transfer' then 'تحويل بنكي' when 'pos' then 'شبكة' when 'cash' then 'نقدًا' when 'other' then 'أخرى' end $$;

-- إحصاء الاشتراك: المسجّلون سابقًا تبدأ متابعة حضورهم من تاريخ إدخالهم (track_from)
create or replace function sub_stats(p_sub uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s subscriptions%rowtype; st settings%rowtype; n timestamp := riyadh_now(); d date := n::date; sec int := extract(epoch from n::time)::int;
  v_end date; v_total int := 0; v_held int := 0; v_att int; v_late int; v_score numeric; v_req int; v_need int; v_consec int := 0; g date; ses record; v_has boolean; v_span numeric; v_passed numeric; v_rate int;
begin
  select * into s from subscriptions where id = p_sub; select * into st from settings where id = 1;
  if s.start_date is null then return jsonb_build_object('status', s.status, 'total',0,'held',0,'attended',0,'late',0,'absent',0,'remaining',0,'rate',null,'finalRate',0,'required',0,'needed',0,'reachable',true,'consec',0,'timePct',0,'daysLeft',null); end if;
  v_end := coalesce(s.end_date, sub_end(s.plan_id, s.start_date));
  for g in select x::date from generate_series(greatest(s.start_date, coalesce(s.track_from, s.start_date)), v_end, interval '1 day') x loop
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

-- إصدار فاتورة لدفعة
create or replace function issue_invoice(o orders, a numeric, p_prior numeric, p_method text, p_date date, p_ref text) returns text
language plpgsql volatile security definer set search_path = public as $$
declare t trainees; d date := riyadh_now()::date; v_no text;
begin
  select * into t from trainees where id = o.trainee_id;
  v_no := 'INV-' || to_char(d, 'YYYY') || '-' || lpad(nextval('invoice_number_seq')::text, 6, '0');
  insert into invoices(number, order_id, order_number, trainee_id, customer_name, customer_nid, customer_phone, kind, service, purchase_date, total, paid, remaining, method, transfer_date, transfer_ref, issue_date, issued_by)
  values (v_no, o.id, o.number, o.trainee_id, t.full_name, coalesce(t.national_id,''), coalesce(t.phone,''), o.kind, o.title, (o.created_at at time zone 'Asia/Riyadh')::date,
    o.total, a, greatest(0, o.total - p_prior - a), pay_method_txt(p_method), coalesce(p_date, d), coalesce(p_ref,''), d, auth.uid());
  return v_no;
end $$;
revoke execute on function issue_invoice(orders, numeric, numeric, text, date, text) from public, anon, authenticated;

drop function if exists admin_confirm_payment(uuid, numeric, boolean, text);
create or replace function admin_confirm_payment(p_id uuid, p_amount numeric, p_confirmed boolean default true, p_reason text default '', p_method text default 'transfer') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare o orders; a numeric := round(coalesce(p_amount, 0), 2); v_no text; v_base numeric;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'الطلب غير موجود'; end if;
  if p_confirmed then
    if o.payment = 'confirmed' then raise exception 'سبق تأكيد سداد هذا الطلب.'; end if;
    if a <= 0 then raise exception 'اكتب المبلغ الواصل فعليًا'; end if;
    if a < o.due_now then raise exception 'المبلغ أقل من المطلوب الآن (% ريال)؛ لا يُعد السداد مستوفيًا', trim_scale(o.due_now); end if;
    if pay_method_txt(p_method) is null then raise exception 'اختر طريقة السداد'; end if;
    update orders set paid_amount = o.paid_amount + a, payment = 'confirmed' where id = p_id;
    v_no := issue_invoice(o, a, o.paid_amount, p_method, (o.claim->>'date')::date, o.claim->>'reference');
    perform order_event(p_id, 'payment_confirmed', auth.uid()::text, a::text || ' ريال · فاتورة ' || v_no);
    return jsonb_build_object('ok', true, 'invoice', v_no);
  else
    v_base := coalesce((o.opening->>'paid')::numeric, 0);
    if o.payment <> 'confirmed' or not exists (select 1 from invoices where order_id = p_id and status = 'issued') then raise exception 'لا دفعات مؤكدة داخل النظام لإلغائها'; end if;
    if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'اكتب سبب إلغاء تأكيد السداد'; end if;
    update invoices set status = 'void', void_reason = left(btrim(p_reason), 300), voided_at = now() where order_id = p_id and status = 'issued';
    update orders set paid_amount = v_base, payment = case when v_base > 0 then 'confirmed' when claim is null then 'unpaid' else 'claimed' end where id = p_id;
    perform order_event(p_id, 'payment_unconfirmed', auth.uid()::text, p_reason);
    return jsonb_build_object('ok', true);
  end if;
end $$;
-- دفعة إضافية على طلب مؤكد: فاتورة مستقلة
create or replace function admin_add_payment(p_id uuid, p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare o orders; a numeric := round(coalesce((p->>'amount')::numeric, 0), 2); d date := coalesce(nullif(p->>'date','')::date, riyadh_now()::date); v_no text;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'الطلب غير موجود'; end if;
  if o.approval = 'rejected' then raise exception 'الطلب مرفوض'; end if;
  if o.payment <> 'confirmed' then raise exception 'أكّد الدفعة الأولى أولًا'; end if;
  if a <= 0 then raise exception 'اكتب مبلغ الدفعة'; end if;
  if pay_method_txt(p->>'method') is null then raise exception 'اختر طريقة السداد'; end if;
  if a > o.total - o.paid_amount then raise exception 'المبلغ أكبر من المتبقي (% ريال)', trim_scale(greatest(0, o.total - o.paid_amount)); end if;
  if d > riyadh_now()::date then raise exception 'تاريخ الدفعة في المستقبل'; end if;
  update orders set paid_amount = o.paid_amount + a where id = p_id;
  v_no := issue_invoice(o, a, o.paid_amount, p->>'method', d, left(btrim(coalesce(p->>'reference','')), 60));
  perform order_event(p_id, 'payment_added', auth.uid()::text, a::text || ' ريال · ' || pay_method_txt(p->>'method') || ' · فاتورة ' || v_no);
  return jsonb_build_object('ok', true, 'invoice', v_no);
end $$;
create or replace function admin_save_order_meta(p_id uuid, p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare o orders; v_total numeric := round(coalesce((p->>'total')::numeric, 0), 2); v_note text := left(btrim(coalesce(p->>'discount_note','')), 200);
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'الطلب غير موجود'; end if;
  if v_total <= 0 then raise exception 'اكتب إجمالي الرسوم'; end if;
  if v_total < o.paid_amount then raise exception 'الإجمالي أقل من المدفوع'; end if;
  update orders set total = v_total, due_now = least(due_now, v_total), discount_note = v_note where id = p_id;
  perform order_event(p_id, 'edited', auth.uid()::text, v_total::text || ' ريال' || case when v_note <> '' then ' · ' || v_note else '' end);
  return jsonb_build_object('ok', true);
end $$;

-- استكمال بيانات المتدرب من الإدارة
create or replace function admin_save_trainee(p_id uuid, p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare t trainees;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into t from trainees where id = p_id for update;
  if t.id is null then raise exception 'المتدرب غير موجود'; end if;
  if p ? 'full_name' and length(btrim(p->>'full_name')) < 3 then raise exception 'اكتب الاسم'; end if;
  if p ? 'national_id' then
    if p->>'national_id' !~ '^[12][0-9]{9}$' then raise exception 'رقم الهوية 10 أرقام'; end if;
    if exists (select 1 from trainees where id <> p_id and national_id = p->>'national_id') then raise exception 'رقم الهوية مسجّل لمتدرب آخر'; end if;
  end if;
  if p ? 'phone' and p->>'phone' !~ '^05[0-9]{8}$' then raise exception 'رقم الجوال غير صحيح'; end if;
  if p ? 'guardian_phone' and coalesce(p->>'guardian_phone','') <> '' and p->>'guardian_phone' !~ '^05[0-9]{8}$' then raise exception 'جوال ولي الأمر غير صحيح'; end if;
  if p ? 'email' and coalesce(p->>'email','') <> '' and p->>'email' !~ '^\S+@\S+\.\S+$' then raise exception 'البريد غير صحيح'; end if;
  if p ? 'birth_date' and coalesce(p->>'birth_date','') <> '' and (p->>'birth_date')::date > riyadh_now()::date then raise exception 'تاريخ الميلاد غير صحيح'; end if;
  perform set_config('sama.registering', 'on', true);
  update trainees set
    full_name = case when p ? 'full_name' then regexp_replace(btrim(p->>'full_name'), '\s+', ' ', 'g') else full_name end,
    national_id = case when p ? 'national_id' then p->>'national_id' else national_id end,
    phone = case when p ? 'phone' then p->>'phone' else phone end,
    guardian_phone = case when p ? 'guardian_phone' then nullif(p->>'guardian_phone','') else guardian_phone end,
    email = case when p ? 'email' then nullif(p->>'email','') else email end,
    birth_date = case when p ? 'birth_date' then nullif(p->>'birth_date','')::date else birth_date end,
    city = case when p ? 'city' then nullif(p->>'city','') else city end,
    education = case when p ? 'education' then nullif(p->>'education','') else education end,
    gender = case when p ? 'gender' then nullif(p->>'gender','') else gender end
  where id = p_id;
  perform set_config('sama.registering', '', true);
  return jsonb_build_object('ok', true);
end $$;
create or replace function admin_resolve_import_note(p_id uuid, p_idx int, p_done boolean default true) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if (select import_notes->p_idx from trainees where id = p_id) is null then raise exception 'الملاحظة غير موجودة'; end if;
  perform set_config('sama.registering', 'on', true);
  update trainees set import_notes = jsonb_set(import_notes, array[p_idx::text, 'done'], to_jsonb(coalesce(p_done, true))) where id = p_id;
  perform set_config('sama.registering', '', true);
  return jsonb_build_object('ok', true);
end $$;

-- استيراد المسجّلين سابقًا: ملف المتدرب، اشتراك بتاريخه الفعلي، وطلب موافق عليه بدفعاته السابقة رصيدًا مرحَّلًا (بلا فواتير)
create or replace function admin_import_legacy(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; t trainees; pl plans; s subscriptions; o orders; d date := riyadh_now()::date; v_added int := 0; v_skip jsonb := '[]'; v_start date; v_end date; v_notes jsonb; v_total numeric; v_paid numeric; v_gp text; v_title text;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  perform set_config('sama.registering', 'on', true);
  for r in select * from jsonb_array_elements(coalesce(p, '[]')) loop
    if jsonb_array_length(coalesce(r->'errors', '[]')) > 0 then v_skip := v_skip || jsonb_build_object('name', r->>'full_name', 'why', r->'errors'->>0); continue; end if;
    select * into pl from plans where id = nullif(r->>'plan_id','')::uuid;
    v_start := nullif(r->>'start_date','')::date;
    if pl.id is null or pl.mode <> 'in_person' then v_skip := v_skip || jsonb_build_object('name', r->>'full_name', 'why', 'الباقة غير معروفة'); continue; end if;
    if r->>'national_id' !~ '^[12][0-9]{9}$' or r->>'phone' !~ '^05[0-9]{8}$' or v_start is null or v_start > d or length(btrim(coalesce(r->>'full_name',''))) < 3 then
      v_skip := v_skip || jsonb_build_object('name', r->>'full_name', 'why', 'بيانات أساسية ناقصة'); continue; end if;
    select * into t from trainees where national_id = r->>'national_id';
    if t.id is not null and exists (select 1 from subscriptions x where x.trainee_id = t.id and x.plan_id = pl.id and x.status <> 'cancelled') then
      v_skip := v_skip || jsonb_build_object('name', r->>'full_name', 'why', 'مسجّل مسبقًا في الباقة نفسها'); continue; end if;
    v_notes := coalesce((select jsonb_agg(jsonb_build_object('text', x, 'done', false)) from jsonb_array_elements_text(coalesce(r->'notes','[]')) x
      where x !~ 'غير مسجّل|غير ثلاثي|جوال ولي الأمر هو|لا دفعات|أكثر من الرسوم|دون سبب مكتوب|لا يجتاز|انتهت مدة'), '[]');
    v_gp := case when r->>'guardian_phone' ~ '^05[0-9]{8}$' then r->>'guardian_phone' end;
    if t.id is null then
      insert into trainees(national_id, full_name, phone, email, gender, birth_date, guardian_phone, imported, import_notes)
      values (r->>'national_id', regexp_replace(btrim(r->>'full_name'), '\s+', ' ', 'g'), r->>'phone', nullif(r->>'email',''), case when r->>'gender' = 'أنثى' then 'أنثى' else 'ذكر' end, nullif(r->>'birth_date','')::date, v_gp, true, v_notes)
      returning * into t;
    else
      update trainees set import_notes = import_notes || v_notes, guardian_phone = coalesce(guardian_phone, v_gp) where id = t.id;
    end if;
    v_end := sub_end(pl.id, v_start);
    insert into subscriptions(ref, trainee_id, plan_id, section, subjects, status, start_date, end_date, start_manual, track_from, imported, created_at)
    values ('SQ-' || lpad((floor(random()*900000)+100000)::text, 6, '0'), t.id, pl.id, case when t.gender = 'أنثى' then 'girls' else 'boys' end, pl.subjects, case when v_end < d then 'ended' else 'active' end, v_start, v_end, true, d, true, v_start + time '12:00')
    returning * into s;
    v_total := round(coalesce((r->>'total')::numeric, pl.reg_fee + pl.installments * pl.installment_amount), 2);
    v_paid := round(coalesce((select sum((x->>'amount')::numeric) from jsonb_array_elements(coalesce(r->'payments','[]')) x), 0), 2);
    v_title := 'باقة ' || case pl.tier when 'basic' then 'أساسية' when 'silver' then 'فضية' when 'gold' then 'ذهبية' when 'diamond' then 'ماسية' when 'custom' then 'خصصناها لك' else pl.name end;
    insert into orders(number, trainee_id, kind, subscription_id, title, total, due_now, approval, payment, paid_amount, discount_note, opening, created_at)
    values ('SAMA-' || to_char(d, 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 6, '0'), t.id, 'plan', s.id, v_title, v_total, least(pl.reg_fee, v_total), 'approved',
      case when v_paid > 0 then 'confirmed' else 'unpaid' end, v_paid, left(coalesce(r->>'discount_note',''), 200),
      jsonb_build_object('paid', v_paid, 'payments', coalesce((select jsonb_agg(jsonb_build_object('amount', (x->>'amount')::numeric, 'method', case when pay_method_txt(x->>'method') is null then 'other' else x->>'method' end, 'label', x->>'label', 'note', coalesce(x->>'note',''))) from jsonb_array_elements(coalesce(r->'payments','[]')) x), '[]')),
      v_start + time '12:00')
    returning * into o;
    insert into order_events(order_id, action, by, reason) values (o.id, 'imported', auth.uid()::text, 'مدفوع سابقًا ' || v_paid || ' من ' || v_total || ' ريال');
    v_added := v_added + 1;
  end loop;
  perform set_config('sama.registering', '', true);
  return jsonb_build_object('added', v_added, 'skipped', v_skip);
end $$;
revoke execute on function admin_confirm_payment(uuid, numeric, boolean, text, text), admin_add_payment(uuid, jsonb), admin_save_order_meta(uuid, jsonb), admin_save_trainee(uuid, jsonb), admin_resolve_import_note(uuid, int, boolean), admin_import_legacy(jsonb) from public, anon;
grant execute on function admin_confirm_payment(uuid, numeric, boolean, text, text), admin_add_payment(uuid, jsonb), admin_save_order_meta(uuid, jsonb), admin_save_trainee(uuid, jsonb), admin_resolve_import_note(uuid, int, boolean), admin_import_legacy(jsonb) to authenticated;

-- الطلب للمتدرب: مع سبب الخصم
create or replace function order_public(o orders) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', o.id, 'number', o.number, 'title', o.title, 'kind', o.kind, 'total', o.total, 'due_now', o.due_now, 'approval', o.approval, 'payment', o.payment,
    'provisional', o.provisional, 'note', o.note, 'paid_amount', o.paid_amount, 'discount_note', o.discount_note,
    'claim', case when o.claim is null then null else jsonb_build_object('amount', o.claim->'amount', 'reference', o.claim->>'reference', 'date', o.claim->>'date') end,
    'created_at', o.created_at, 'trainee_id', o.trainee_id,
    'bank', (select case when coalesce((s.bank->>'enabled')::boolean, false) then s.bank - 'enabled' end from settings s where s.id = 1)) $$;
