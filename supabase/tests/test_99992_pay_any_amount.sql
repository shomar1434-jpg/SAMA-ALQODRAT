-- قرار المالك: أول استلام يقبل أي مبلغ موجب (لا حد أدنى «المطلوب الآن»)، ولا يتجاوز المتبقي
\set ON_ERROR_STOP on
do $$
declare v_full uuid := gen_random_uuid(); v_basic uuid; v_s uuid; v_o uuid; r jsonb; i invoices; o orders; ok boolean;
begin
  insert into auth.users(id, email) values (v_full, 'pa-full@test'); insert into admins(user_id, role, name) values (v_full, 'full', 'مدير');
  perform set_config('app.uid', v_full::text, true);
  select id into v_basic from plans where tier = 'basic' and mode = 'in_person';
  r := admin_save_subscription(jsonb_build_object('national_id', '1909576314', 'full_name', 'سالم ناصر علي القحطاني', 'phone', '0557779973', 'gender', 'ذكر', 'plan_id', v_basic, 'section', 'boys', 'start_date', riyadh_now()::date));
  v_o := (r->>'order_id')::uuid; select * into o from orders where id = v_o;
  assert o.due_now > 50, 'المقترح أكبر من المبلغ التجريبي';
  begin perform admin_receive_payment(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','cash','amount',0)))); ok := false; exception when others then ok := true; end;
  assert ok, 'مبلغ صفر لا يُقبل';
  r := admin_receive_payment(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','cash','amount',50))));
  select * into i from invoices where number = r->>'invoice'; select * into o from orders where id = v_o;
  assert o.payment = 'confirmed' and o.paid_amount = 50 and i.paid = 50 and i.remaining = o.total - 50, 'أول دفعة بأي مبلغ تُقبل وتصدر فاتورتها';
  begin perform admin_receive_payment(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','cash','amount', o.total)))); ok := false; exception when others then ok := true; end;
  assert ok, 'لا يتجاوز المتبقي';
end $$;
