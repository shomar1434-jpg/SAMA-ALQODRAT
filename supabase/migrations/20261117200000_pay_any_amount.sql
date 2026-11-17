-- قرار المالك (17 نوفمبر): يُقبل أي مبلغ موجب في أول استلام؛ «المطلوب الآن» (due_now) اقتراح يُعرض فقط ولا يمنع السداد.
-- يبقى: المبلغ موجب، ولا يتجاوز المتبقي، والطريقة معروفة. يُعاد تعريف الدالتين بالجسم نفسه دون شرط الحد الأدنى.
create or replace function admin_confirm_payment_base(p_id uuid, p_amount numeric, p_confirmed boolean default true, p_reason text default '', p_method text default 'transfer') returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare o orders; a numeric := round(coalesce(p_amount, 0), 2); v_no text; v_base numeric;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'الطلب غير موجود'; end if;
  if p_confirmed then
    if o.payment = 'confirmed' then raise exception 'سبق تأكيد سداد هذا الطلب.'; end if;
    if a <= 0 then raise exception 'اكتب المبلغ الواصل فعليًا'; end if;
    if o.total > 0 and a > o.total - o.paid_amount then raise exception 'المبلغ أكبر من المتبقي (% ريال)', trim_scale(greatest(0, o.total - o.paid_amount)); end if;
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
  if o.total > 0 and a > o.total - o.paid_amount then raise exception 'المبلغ أكبر من المتبقي (% ريال)', trim_scale(greatest(0, o.total - o.paid_amount)); end if;
  v_ref := nullif(lines_ref(v_lines), ''); if v_ref is null and v_first then v_ref := coalesce(o.claim->>'reference', ''); end if;
  update orders set paid_amount = o.paid_amount + a, payment = 'confirmed' where id = p_id;
  r := issue_doc(o, 'invoice', a, o.total - o.paid_amount - a, v_lines, d, v_ref, '', '');
  perform order_event(p_id, case when v_first then 'payment_confirmed' else 'payment_added' end, auth.uid()::text, trim_scale(a)::text || ' ريال · ' || lines_text(v_lines) || ' · فاتورة ' || r.number);
  return jsonb_build_object('ok', true, 'invoice', r.number, 'id', r.id);
end $$;
revoke execute on function admin_confirm_payment_base(uuid, numeric, boolean, text, text) from public, anon, authenticated;
