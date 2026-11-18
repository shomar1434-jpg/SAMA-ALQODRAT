-- الخطوة BN: إصلاحات الفحص الأمني
\set ON_ERROR_STOP on
do $$
declare v_anon uuid := gen_random_uuid(); v_adm uuid := gen_random_uuid(); ok boolean; r jsonb; d date := riyadh_now()::date;
begin
  -- جلسة مسجّلة غير مسؤولة (مثل جلسة جهاز مجهولة) لا تولّد تقرير اليوم ولو مرّرت p_auto
  perform set_config('app.uid', v_anon::text, true);
  ok := false; begin perform generate_daily_report(d, 'snapshot', '', true); exception when others then ok := true; end;
  assert ok, 'p_auto لا يتجاوز الحارس لجلسة غير مسؤولة';
  ok := false; begin perform generate_daily_report(d, 'snapshot', '', false); exception when others then ok := true; end;
  assert ok, 'غير المسؤول مرفوض';
  -- المهمة المجدولة (بلا هوية متصل) تعمل
  perform set_config('app.uid', '', true);
  r := generate_daily_report(d, 'snapshot', '', true);
  assert r ? 'report', 'التوليد الآلي من pg_cron يعمل';
  -- المسؤول يولّد
  insert into auth.users(id, email) values (v_adm, 'sec-fix@test'); insert into admins(user_id, role, name) values (v_adm, 'staff', 'موظف');
  perform set_config('app.uid', v_adm::text, true);
  r := generate_daily_report(d, 'revision', '', false);
  assert r ? 'report', 'المسؤول يولّد مراجعة';
  perform set_config('app.uid', '', true);
  -- رفض التحضير لا يكشف الاسم
  r := checkin('1000000009', null, null, 'x', null);
  assert not coalesce((r->>'ok')::boolean, false) and not (r ? 'name'), 'رفض التحضير بلا اسم';
end $$;
\echo 'PASS security fixes'
