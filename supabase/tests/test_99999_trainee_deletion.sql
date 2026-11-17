-- الخطوة BB: حذف المتدرب كاملًا (يدويًا بتأكيد مزدوج) و«بيانات مؤرشفة» مع الحذف الآلي بعد مدة الحفظ
\set ON_ERROR_STOP on
do $$
declare v_full uuid := gen_random_uuid(); v_staff uuid := gen_random_uuid(); v_basic uuid; r jsonb; v_a uuid; v_b uuid; v_c uuid; v_o uuid; v_inv text; ok boolean; d date := riyadh_now()::date;
  recent text := json_build_object('amr', json_build_array(json_build_object('method','password','timestamp', extract(epoch from now())::bigint)))::text;
begin
  insert into auth.users(id, email) values (v_full, 'del-full@test'), (v_staff, 'del-staff@test');
  insert into admins(user_id, role, name) values (v_full, 'full', 'مدير'), (v_staff, 'staff', 'موظف');
  perform set_config('app.uid', v_full::text, true);
  select id into v_basic from plans where tier = 'basic' and mode = 'in_person';
  -- أ: منسحب له طلب ومدفوعات وفاتورة وحضور
  r := admin_save_subscription(jsonb_build_object('national_id', '1991866573', 'full_name', 'فهد سعد علي الغامدي', 'phone', '0557770101', 'gender', 'ذكر', 'plan_id', v_basic, 'section', 'boys', 'start_date', d - 10));
  v_o := (r->>'order_id')::uuid; select trainee_id into v_a from orders where id = v_o;
  v_inv := admin_receive_payment(v_o, jsonb_build_object('lines', jsonb_build_array(jsonb_build_object('method','cash','amount',100))))->>'invoice';
  insert into sub_attendance(subscription_id, trainee_id, att_date, status) select id, v_a, d - 3, 'حاضر' from subscriptions where trainee_id = v_a;
  -- ب: انتهت باقته منذ 100 يوم بلا متبقٍ؛ ج: انتهت منذ 20 يومًا
  r := admin_save_subscription(jsonb_build_object('national_id', '1675775694', 'full_name', 'خالد سعد علي الغامدي', 'phone', '0557770102', 'gender', 'ذكر', 'plan_id', v_basic, 'section', 'boys', 'start_date', d - 200));
  select trainee_id into v_b from orders where id = (r->>'order_id')::uuid;
  update subscriptions set end_date = d - 100, status = 'active' where trainee_id = v_b;
  update orders set total = 0, due_now = 0 where trainee_id = v_b;
  r := admin_save_subscription(jsonb_build_object('national_id', '1324005980', 'full_name', 'ماجد سعد علي الغامدي', 'phone', '0557770103', 'gender', 'ذكر', 'plan_id', v_basic, 'section', 'boys', 'start_date', d - 120));
  select trainee_id into v_c from orders where id = (r->>'order_id')::uuid;
  update subscriptions set end_date = d - 20, status = 'active' where trainee_id = v_c;
  update orders set total = 0, due_now = 0 where trainee_id = v_c;

  -- الصلاحيات والتأكيد
  perform set_config('app.uid', v_staff::text, true);
  begin perform admin_delete_trainee(v_a, 'فهد سعد علي الغامدي', 'انسحاب'); ok := false; exception when others then ok := sqlerrm like '%للمالك ومدير النظام%'; end;
  assert ok, 'الموظف لا يحذف';
  begin perform admin_archived_trainees(); ok := false; exception when others then ok := true; end;
  assert ok, 'الموظف لا يرى الأرشيف';
  perform set_config('app.uid', v_full::text, true); perform set_config('request.jwt.claims', '', true);
  begin perform admin_delete_trainee(v_a, 'فهد سعد علي الغامدي', 'انسحاب'); ok := false; exception when others then ok := sqlerrm like '%كلمة المرور%'; end;
  assert ok, 'يلزم إعادة إدخال كلمة المرور';
  perform set_config('request.jwt.claims', recent, true);
  begin perform admin_delete_trainee(v_a, 'فهد', 'انسحاب'); ok := false; exception when others then ok := sqlerrm like '%اكتب اسم المتدرب%'; end;
  assert ok, 'يلزم كتابة الاسم كاملًا';

  -- الأرشيف
  r := admin_archived_trainees();
  assert exists (select 1 from jsonb_array_elements(r) x where x->>'id' = v_b::text and x->>'state' = 'completed' and (x->>'purge_on')::date = d - 10), 'ب في الأرشيف بموعد حذفه';
  assert exists (select 1 from jsonb_array_elements(r) x where x->>'id' = v_c::text and (x->>'purge_on')::date = d + 70), 'ج في الأرشيف';
  assert not exists (select 1 from jsonb_array_elements(r) x where x->>'id' = v_a::text), 'صاحب الباقة القائمة ليس في الأرشيف';

  -- الحذف اليدوي الكامل
  perform admin_delete_trainee(v_a, '  فهد سعد  علي الغامدي ', 'انسحاب من البرنامج');
  assert not exists (select 1 from trainees where id = v_a) and not exists (select 1 from subscriptions where trainee_id = v_a), 'حُذف المتدرب واشتراكه';
  assert not exists (select 1 from orders where id = v_o) and not exists (select 1 from invoices where number = v_inv), 'حُذفت سجلاته المالية';
  assert not exists (select 1 from sub_attendance where trainee_id = v_a), 'حُذف حضوره';
  assert not exists (select 1 from audit_logs where entity = v_a::text or detail::text like '%1991866573%' or detail::text like '%' || v_a::text || '%'), 'لا أثر له في سجل الحركات';
  assert exists (select 1 from audit_logs where action = 'trainees.purge' and detail->>'mode' = 'manual' and detail::text not like '%فهد%'), 'حدث حذف واحد بلا بيانات شخصية';
  begin delete from invoices where id = (select id from invoices limit 1); ok := (select count(*) from invoices) = 0; exception when others then ok := sqlerrm like '%لا تُحذف%'; end;
  assert ok, 'خارج الحذف المعتمد تبقى الفواتير محمية';

  -- الحذف الآلي: ب فقط
  assert purge_archived_trainees() >= 1, 'حذف آلي';
  assert not exists (select 1 from trainees where id = v_b), 'ب حُذف بعد انقضاء المدة';
  assert exists (select 1 from trainees where id = v_c), 'ج باقٍ حتى تنقضي المدة';
  assert exists (select 1 from audit_logs where action = 'trainees.purge' and detail->>'mode' = 'auto'), 'الحذف الآلي مسجّل';
  perform set_config('app.uid', '', true); perform set_config('request.jwt.claims', '', true);
end $$;
