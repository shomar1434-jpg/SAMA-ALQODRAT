-- قرار المالك: تعديل بداية الباقة ونهايتها لكل اشتراك، والنهاية الفارغة تُحسب للباقة، وكل تغيير في سجل الحركات
\set ON_ERROR_STOP on
do $$
declare v_t uuid; v_s uuid; v_pl uuid; v_admin uuid := gen_random_uuid(); d date := riyadh_now()::date; ok boolean; s subscriptions;
begin
  insert into trainees(national_id, full_name, phone, gender) values ('1999999993', 'نايف سالم علي الزهراني', '0557779944', 'ذكر') returning id into v_t;
  select id into v_pl from plans where tier = 'silver' and mode = 'in_person';
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects, status, start_date, end_date, start_manual)
    select 'SQ-SE99993', v_t, id, 'boys', subjects, 'active', d - 30, sub_end(id, d - 30), true from plans where id = v_pl returning id into v_s;
  insert into auth.users(id, email) values (v_admin, 'se-admin@test'); insert into admins(user_id, role) values (v_admin, 'staff');
  perform set_config('app.uid', v_admin::text, true);
  perform admin_save_subscription(jsonb_build_object('id', v_s, 'plan_id', v_pl, 'section', 'boys', 'start_date', d - 40, 'end_date', d + 20));
  select * into s from subscriptions where id = v_s;
  assert s.start_date = d - 40 and s.end_date = d + 20, 'تُحفظ البداية والنهاية المخصّصة';
  assert exists (select 1 from audit_logs where action = 'subscriptions.update' and entity = v_s::text and detail->'after'->>'end_date' = (d + 20)::text and detail->'before'->>'end_date' is not null), 'التعديل مسجّل بالقبل والبعد';
  perform admin_save_subscription(jsonb_build_object('id', v_s, 'plan_id', v_pl, 'section', 'boys', 'start_date', d - 40));
  assert (select end_date from subscriptions where id = v_s) = sub_end(v_pl, d - 40), 'النهاية الفارغة تُحسب للباقة';
  begin perform admin_save_subscription(jsonb_build_object('id', v_s, 'plan_id', v_pl, 'section', 'boys', 'start_date', d - 40, 'end_date', d - 41)); ok := false; exception when others then ok := true; end;
  assert ok, 'النهاية قبل البداية مرفوضة';
  begin perform admin_save_subscription(jsonb_build_object('plan_id', v_pl, 'national_id', '1999999993', 'section', 'boys', 'end_date', d + 5)); ok := false; exception when others then ok := true; end;
  assert ok, 'لا نهاية لاشتراك جديد';
end $$;
