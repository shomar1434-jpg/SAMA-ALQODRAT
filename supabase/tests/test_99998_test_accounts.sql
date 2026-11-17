-- الخطوة BA (البند 13): حسابات تجريبية معزولة — هوية اصطناعية، استبعاد من التقرير، إزالة آمنة للتجريبي وحده
\set ON_ERROR_STOP on
do $$
declare v_full uuid := gen_random_uuid(); v_staff uuid := gen_random_uuid(); r jsonb; v_id uuid; v_real uuid; ok boolean; v_plan uuid; v_rep jsonb;
begin
  insert into auth.users(id, email) values (v_full, 'ta-full@test'), (v_staff, 'ta-staff@test');
  insert into admins(user_id, role, name) values (v_full, 'full', 'مدير'), (v_staff, 'staff', 'موظف');
  select id into v_plan from plans where tier = 'basic' and mode = 'in_person' and active limit 1;
  perform register_subscription(jsonb_build_object('national_id','1757491186','full_name','حقيقي سعد علي الحارثي','phone','0557778881','gender','ذكر','plan_id',v_plan,
    'accepted_policies', (select coalesce(jsonb_agg(id), '[]') from current_policies(riyadh_now()::date) where requires_acceptance)));
  select id into v_real from trainees where national_id = '1757491186';

  perform set_config('app.uid', v_staff::text, true);
  begin perform admin_create_test_trainee(jsonb_build_object('plan_id', v_plan)); ok := false; exception when others then ok := sqlerrm like '%لمدير النظام%'; end;
  assert ok, 'الموظف لا ينشئ حسابًا تجريبيًا';

  perform set_config('app.uid', v_full::text, true);
  begin perform admin_create_test_trainee(jsonb_build_object('plan_id', v_plan, 'phone', '0557778881')); ok := false; exception when others then ok := sqlerrm like '%لحساب حقيقي%'; end;
  assert ok, 'لا يُستعمل جوال حساب حقيقي';
  r := admin_create_test_trainee(jsonb_build_object('plan_id', v_plan, 'full_name', 'تجربة العرض', 'gender', 'ذكر'));
  v_id := (r->>'id')::uuid;
  assert not saudi_id_valid(r->>'national_id'), 'الهوية الاصطناعية لا تجتاز تحقق السجل المدني';
  assert saudi_id_valid('1757491186'), 'دالة التحقق صحيحة للهوية السليمة';
  assert (select is_test and full_name like '%(تجريبي)%' from trainees where id = v_id), 'موسوم تجريبي';
  assert (select status from subscriptions where trainee_id = v_id) = 'active', 'اشتراك قائم للحساب التجريبي';
  assert not exists (select 1 from orders where trainee_id = v_id), 'بلا طلب شراء';

  v_rep := build_daily_report(riyadh_now()::date);
  assert v_rep::text not like '%تجربة العرض%', 'التقرير اليومي يستبعد التجريبي';

  begin perform admin_purge_test_trainee(v_real); ok := false; exception when others then ok := sqlerrm like '%التجريبية وحدها%'; end;
  assert ok, 'لا يُزال حساب حقيقي';
  perform admin_purge_test_trainee(v_id);
  assert not exists (select 1 from trainees where id = v_id) and not exists (select 1 from subscriptions where trainee_id = v_id), 'أُزيل التجريبي';
  assert exists (select 1 from trainees where id = v_real) and exists (select 1 from subscriptions where trainee_id = v_real), 'الحقيقي سليم';
  perform set_config('app.uid', '', true);
end $$;
