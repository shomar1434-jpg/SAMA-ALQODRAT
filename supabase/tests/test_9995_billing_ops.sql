-- الخطوة AH: الدفع المتعدد، تغيير الباقة، الإلغاء والاسترداد بإشعار، وطلب المشترك المضاف من الإدارة
\set ON_ERROR_STOP on
do $$
declare v_own uuid; v_full uuid := gen_random_uuid(); v_t uuid; v_s uuid; v_o uuid; o orders; r jsonb; i invoices; ok boolean; d date := riyadh_now()::date;
  v_basic uuid; v_gold uuid; v_silver uuid; v_start date := d - 20;
begin
  select user_id into v_own from admins where role = 'owner' limit 1;
  if v_own is null then v_own := gen_random_uuid(); insert into auth.users(id, email) values (v_own, 'bo-owner@test'); insert into admins(user_id, role, name) values (v_own, 'owner', 'المالك'); end if;
  insert into auth.users(id, email) values (v_full, 'bo-full@test'); insert into admins(user_id, role, name) values (v_full, 'full', 'مدير');
  select id into v_basic from plans where tier = 'basic' and mode = 'in_person'; select id into v_gold from plans where tier = 'gold' and mode = 'in_person'; select id into v_silver from plans where tier = 'silver' and mode = 'in_person';

  -- مشترك تضيفه الإدارة: طلب موافق عليه
  perform set_config('app.uid', v_full::text, true);
  r := admin_save_subscription(jsonb_build_object('national_id', '1999999973', 'full_name', 'فهد سعيد علي الشهري', 'phone', '0557779973', 'gender', 'ذكر', 'plan_id', v_basic, 'section', 'boys', 'start_date', v_start));
  v_s := (r->>'id')::uuid; v_o := (r->>'order_id')::uuid;
  select * into o from orders where id = v_o;
  assert o.subscription_id = v_s and o.approval = 'approved' and o.total = 690 and o.due_now = 690, 'طلب موافق عليه للمشترك المضاف';

  -- استلام بطريقتين: فاتورة واحدة بسطرين
  r := admin_receive_payment(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','cash','amount',300,'reference','سند 1'), jsonb_build_object('method','pos','amount','390','reference','845201'))));
  select * into i from invoices where number = r->>'invoice';
  assert i.paid = 690 and i.method = 'متعددة' and jsonb_array_length(i.lines) = 2 and i.remaining = 0 and i.doc_type = 'invoice', 'فاتورة واحدة بطريقتين';
  assert (select payment = 'confirmed' and paid_amount = 690 from orders where id = v_o), 'تأكد السداد';
  begin perform admin_receive_payment(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','cash','amount',1)))); ok := false; exception when others then ok := true; end;
  assert ok, 'لا يتجاوز المتبقي';
  begin perform admin_receive_payment(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','btc','amount',1)))); ok := false; exception when others then ok := true; end;
  assert ok, 'طريقة غير معروفة مرفوضة';

  -- تغيير الباقة للمالك وحده
  begin perform admin_change_plan(v_o, jsonb_build_object('plan_id', v_gold, 'reason', 'ترقية')); ok := false; exception when others then ok := true; end;
  assert ok, 'الترقية يعتمدها المالك';
  perform set_config('app.uid', v_own::text, true);
  r := admin_change_plan(v_o, jsonb_build_object('plan_id', v_gold, 'reason', 'ترقية بطلب ولي الأمر'));
  select * into o from orders where id = v_o;
  assert o.total = 1690 and o.title = 'باقة ذهبية' and (r->>'surplus')::numeric = 0, 'الإجمالي الجديد';
  assert (select plan_id = v_gold and start_date = v_start and end_date = sub_end(v_gold, v_start) from subscriptions where id = v_s), 'البداية كما هي والنهاية للباقة الجديدة';
  begin perform admin_refund(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','cash','amount',10)), 'reason', 'تجربة')); ok := false; exception when others then ok := true; end;
  assert ok, 'لا استرداد بلا فائض أو إلغاء';
  perform set_config('app.uid', v_full::text, true);
  perform admin_receive_payment(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','transfer','amount',500,'reference','TR9'))));
  -- تخفيض إلى الفضية (1190) والمدفوع 1190 ثم إلى الأساسية: فائض 500
  perform set_config('app.uid', v_own::text, true);
  r := admin_change_plan(v_o, jsonb_build_object('plan_id', v_basic, 'reason', 'تخفيض'));
  assert (r->>'surplus')::numeric = 500, 'الفائض بعد التخفيض';
  r := admin_refund(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','transfer','amount',300), jsonb_build_object('method','cash','amount',200)), 'reason', 'رد الفائض'));
  select * into i from invoices where number = r->>'number';
  assert i.doc_type = 'refund' and i.number like 'RF-%' and i.paid = 500 and i.ref_invoice like 'INV-%', 'إشعار استرداد مرتبط بالفاتورة';
  assert (select paid_amount = 690 and refunded = 500 from orders where id = v_o), 'المدفوع بعد الاسترداد';
  begin perform admin_confirm_payment(v_o, 0, false, 'خطأ في الإدخال'); ok := false; exception when others then ok := true; end;
  assert ok, 'لا إلغاء لتأكيد السداد مع استرداد ساري';
  perform admin_void_refund(i.id, 'صدر خطأ');
  assert (select paid_amount = 1190 and refunded = 0 from orders where id = v_o), 'إلغاء الإشعار يعيد المبلغ';
  perform admin_refund(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','cash','amount',500)), 'reason', 'رد الفائض نقدًا'));

  -- إلغاء وانسحاب ثم استرداد جزئي
  perform admin_cancel_order(v_o, 'انسحاب بعذر مقبول');
  assert (select status = 'cancelled' from subscriptions where id = v_s), 'الاشتراك ملغى';
  begin perform admin_refund(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','cash','amount',700)), 'reason', 'رد')); ok := false; exception when others then ok := true; end;
  assert ok, 'لا يتجاوز المدفوع';
  perform admin_refund(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','pos','amount',345)), 'reason', 'استرداد جزئي بعد البدء'));
  assert (select paid_amount = 345 and refunded = 845 from orders where id = v_o), 'الاسترداد الجزئي';
  begin perform admin_receive_payment(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','cash','amount',10)))); ok := false; exception when others then ok := true; end;
  assert ok, 'لا استلام على طلب ملغى';
  begin delete from invoices where order_id = v_o; ok := false; exception when others then ok := true; end;
  assert ok, 'المستندات لا تُحذف';
  perform set_config('app.uid', '', true);
end $$;
