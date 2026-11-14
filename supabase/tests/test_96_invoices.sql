-- الخطوة N: فاتورة برقم تسلسلي عند تأكيد السداد، بنسخة ثابتة؛ لا حذف ولا تعديل؛ الإلغاء بسبب؛ صورة الإيصال للمسؤول فقط
\set ON_ERROR_STOP on
do $$
declare r jsonb; o orders; i invoices; pl plans; v_admin uuid; ok boolean; d date := riyadh_now()::date; img text := 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
  p jsonb := '{"national_id":"1999999971","full_name":"ماجد فيصل علي الحربي","phone":"0557770071","gender":"ذكر","birth_date":"1995-01-01","city":"جازان","education":"جامعي"}';
begin
  p := p || jsonb_build_object('accepted_policies', (select coalesce(jsonb_agg(id), '[]') from current_policies(d) where requires_acceptance));
  select * into pl from plans where tier = 'silver' and mode = 'in_person';
  r := register_subscription(p || jsonb_build_object('plan_id', pl.id));
  select * into o from orders where number = r->'order'->>'number';
  perform order_report_transfer(jsonb_build_object('number', o.number, 'national_id', '1999999971', 'amount', pl.reg_fee, 'date', d, 'reference', 'TRX-900'));
  v_admin := gen_random_uuid(); insert into auth.users(id, email) values (v_admin, 'inv-admin@test'); insert into admins(user_id, role) values (v_admin, 'full');
  perform set_config('app.uid', v_admin::text, true);
  assert (select count(*) from invoices where order_id = o.id) = 0, 'لا فاتورة قبل تأكيد السداد';
  r := admin_confirm_payment(o.id, pl.reg_fee);
  select * into i from invoices where order_id = o.id;
  assert i.number ~ '^INV-[0-9]{4}-[0-9]{6}$' and r->>'invoice' = i.number, 'رقم الفاتورة التسلسلي';
  assert i.customer_name = 'ماجد فيصل علي الحربي' and i.kind = 'plan' and i.service = o.title and i.purchase_date = d and i.order_number = o.number, 'اسم صاحب الخدمة ونوعها وتاريخ شرائها';
  assert i.total = o.total and i.paid = pl.reg_fee and i.remaining = o.total - pl.reg_fee and i.transfer_ref = 'TRX-900' and i.transfer_date = d, 'المبالغ ومرجع التحويل وتاريخه';
  begin perform admin_confirm_payment(o.id, pl.reg_fee); ok := false; exception when others then ok := true; end;
  assert ok, 'لا فاتورتان ساريتان لطلب واحد';
  -- النسخة ثابتة
  update trainees set full_name = 'اسم معدَّل لاحقًا' where id = o.trainee_id;
  assert (select customer_name from invoices where id = i.id) = 'ماجد فيصل علي الحربي', 'الفاتورة لا تتغير بتغيّر بيانات المتدرب';
  begin update invoices set paid = 1 where id = i.id; ok := false; exception when others then ok := true; end;
  assert ok, 'بيانات الفاتورة لا تُعدَّل';
  begin delete from invoices where id = i.id; ok := false; exception when others then ok := true; end;
  assert ok, 'الفاتورة لا تُحذف';
  -- صورة الإيصال
  begin perform admin_attach_receipt(i.id, 'javascript:alert(1)'); ok := false; exception when others then ok := true; end;
  assert ok, 'صورة غير صالحة تُرفض';
  perform admin_attach_receipt(i.id, img);
  assert (select has_receipt from invoices where id = i.id) and admin_invoice_receipt(i.id) = img, 'إرفاق صورة الإيصال';
  perform set_config('app.uid', '', true);
  begin perform admin_invoice_receipt(i.id); ok := false; exception when others then ok := true; end;
  assert ok, 'صورة الإيصال للمسؤول فقط';
  begin perform admin_attach_receipt(i.id, img); ok := false; exception when others then ok := true; end;
  assert ok, 'الإرفاق للمسؤول فقط';
  perform set_config('app.uid', v_admin::text, true);
  -- الإلغاء بسبب، ثم فاتورة جديدة برقم جديد
  begin perform admin_confirm_payment(o.id, 0, false, ''); ok := false; exception when others then ok := true; end;
  assert ok, 'الإلغاء يحتاج سببًا';
  perform admin_confirm_payment(o.id, 0, false, 'تحويل مرتجع من البنك');
  select * into i from invoices where id = i.id;
  assert i.status = 'void' and i.void_reason = 'تحويل مرتجع من البنك' and (select payment from orders where id = o.id) = 'claimed', 'تُلغى الفاتورة ويُلغى تأكيد السداد';
  begin update invoices set status = 'issued' where id = i.id; ok := false; exception when others then ok := true; end;
  assert ok, 'الملغاة لا تعود سارية';
  r := admin_confirm_payment(o.id, pl.reg_fee);
  assert r->>'invoice' <> i.number and (select count(*) from invoices where order_id = o.id) = 2, 'إعادة التأكيد تصدر فاتورة جديدة والقديمة باقية';
  perform set_config('app.uid', '', true);
  delete from admins where user_id = v_admin; delete from auth.users where id = v_admin;
end $$;
