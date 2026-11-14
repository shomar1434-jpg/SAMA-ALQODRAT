-- الخطوة O: استيراد المسجّلين سابقًا، طرق السداد والدفعات الإضافية، واستكمال بيانات المتدرب
\set ON_ERROR_STOP on
do $$
declare r jsonb; t trainees; s subscriptions; o orders; pl plans; v_admin uuid; ok boolean; d date := riyadh_now()::date; st jsonb; rows jsonb;
begin
  select * into pl from plans where tier = 'gold' and mode = 'in_person';
  rows := jsonb_build_array(
    jsonb_build_object('full_name','زياد عمر علي الشهري','national_id','1999999981','phone','0557770081','guardian_phone','0557770082','email','','gender','ذكر','birth_date','','plan_id',pl.id,'start_date',d - 60,
      'total',1440,'discount_note','عرض اليوم الوطني','payments',jsonb_build_array(jsonb_build_object('amount',690,'method','pos','label','رسوم التسجيل'), jsonb_build_object('amount',250,'method','transfer','label','الدفعة 1')),
      'notes',jsonb_build_array('تاريخ الميلاد غير مسجّل','رسوم مخفّضة (1440 بدل 1690): عرض اليوم الوطني'),'errors','[]'::jsonb),
    jsonb_build_object('full_name','صف مرفوض','national_id','1999999982','phone','0557770083','plan_id',pl.id,'start_date',d,'errors',jsonb_build_array('رقم الجوال غير صحيح')));
  begin perform admin_import_legacy(rows); ok := false; exception when others then ok := true; end;
  assert ok, 'الاستيراد للمسؤول فقط';
  v_admin := gen_random_uuid(); insert into auth.users(id, email) values (v_admin, 'import-admin@test'); insert into admins(user_id, role) values (v_admin, 'full');
  perform set_config('app.uid', v_admin::text, true);
  r := admin_import_legacy(rows);
  assert (r->>'added')::int = 1 and jsonb_array_length(r->'skipped') = 1, 'يُستورد الجاهز ويُترك المرفوض';
  select * into t from trainees where national_id = '1999999981';
  assert t.imported and t.guardian_phone = '0557770082' and t.birth_date is null and jsonb_array_length(t.import_notes) = 1 and t.import_notes->0->>'text' like 'رسوم مخفّضة%', 'ملف المتدرب وملاحظة الكشف (الناقص يُكتشف من البيانات)';
  select * into s from subscriptions where trainee_id = t.id;
  assert s.start_date = d - 60 and s.status = 'active' and s.track_from = d and s.start_manual, 'الاشتراك بتاريخه الفعلي والمتابعة من اليوم';
  st := sub_stats(s.id);
  assert (st->>'absent')::int = 0, 'الجلسات السابقة لا تُحسب غيابًا';
  select * into o from orders where subscription_id = s.id;
  assert o.approval = 'approved' and o.payment = 'confirmed' and o.total = 1440 and o.paid_amount = 940 and o.discount_note = 'عرض اليوم الوطني' and (o.opening->>'paid')::numeric = 940, 'الطلب برصيده المرحَّل';
  assert (select count(*) from invoices where order_id = o.id) = 0, 'لا فواتير للدفعات السابقة';
  r := admin_import_legacy(rows);
  assert (r->>'added')::int = 0, 'إعادة الاستيراد لا تكرر';
  -- دفعة إضافية بطريقة سداد، وفاتورة مستقلة
  begin perform admin_add_payment(o.id, '{"amount":600,"method":"cash"}'); ok := false; exception when others then ok := true; end;
  assert ok, 'دفعة أكبر من المتبقي تُرفض';
  begin perform admin_add_payment(o.id, '{"amount":250,"method":"bitcoin"}'); ok := false; exception when others then ok := true; end;
  assert ok, 'طريقة سداد غير معروفة تُرفض';
  r := admin_add_payment(o.id, '{"amount":250,"method":"pos","reference":"POS-77"}');
  assert (select paid_amount from orders where id = o.id) = 1190 and exists (select 1 from invoices where number = r->>'invoice' and method = 'شبكة' and paid = 250 and remaining = 250 and transfer_ref = 'POS-77'), 'فاتورة الدفعة بطريقتها والمتبقي بعدها';
  r := admin_add_payment(o.id, '{"amount":250,"method":"cash"}');
  assert (select count(*) from invoices where order_id = o.id and status = 'issued') = 2 and (select remaining from invoices where number = r->>'invoice') = 0, 'فاتورتان ساريتان لطلب واحد';
  perform admin_confirm_payment(o.id, 0, false, 'خطأ إدخال');
  assert (select paid_amount from orders where id = o.id) = 940 and (select payment from orders where id = o.id) = 'confirmed' and (select count(*) from invoices where order_id = o.id and status = 'void') = 2, 'الإلغاء يعيد الرصيد المرحَّل ويلغي فواتير النظام';
  -- استكمال البيانات
  begin perform admin_save_trainee(t.id, '{"phone":"123"}'); ok := false; exception when others then ok := true; end;
  assert ok, 'جوال غير صحيح يُرفض';
  perform admin_save_trainee(t.id, '{"birth_date":"2009-03-01","email":"z@example.com","city":"جازان"}');
  select * into t from trainees where id = t.id;
  assert t.birth_date = '2009-03-01' and t.email = 'z@example.com' and t.city = 'جازان' and t.full_name = 'زياد عمر علي الشهري', 'استكمال الحقول الناقصة دون مس غيرها';
  perform admin_resolve_import_note(t.id, 0);
  assert (select (import_notes->0->>'done')::boolean from trainees where id = t.id), 'تعليم الملاحظة معالَجة';
  perform admin_save_order_meta(o.id, '{"total":1690,"discount_note":""}');
  assert (select total from orders where id = o.id) = 1690, 'تصحيح الرسوم';
  begin perform admin_save_order_meta(o.id, '{"total":500}'); ok := false; exception when others then ok := true; end;
  assert ok, 'الإجمالي لا ينزل دون المدفوع';
  perform set_config('app.uid', '', true);
  delete from admins where user_id = v_admin; delete from auth.users where id = v_admin;
end $$;
