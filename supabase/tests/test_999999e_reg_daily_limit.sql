-- الخطوة BP: التسجيل مرة واحدة في اليوم من الجوال أو الجهاز
\set ON_ERROR_STOP on
do $$
declare ok boolean; adm uuid := gen_random_uuid();
begin
  perform set_config('app.uid', '', true);
  -- بلا ترويسات طلب (استدعاء مباشر): لا حد
  perform request_custom_plan('{"phone":"0551110001","name":"أ"}'); perform request_custom_plan('{"phone":"0551110001","name":"أ"}');
  -- عبر الواجهة (بترويسات)
  perform set_config('request.headers', '{"x-forwarded-for":"10.0.0.1"}', true);
  perform request_custom_plan('{"phone":"0551110002","name":"ب","_device":"devAAAAAAAAAAAAAAAA1"}');
  ok := false; begin perform request_custom_plan('{"phone":"0551110002","name":"ب","_device":"devBBBBBBBBBBBBBBBB2"}'); exception when others then ok := sqlerrm like '%هذا الجوال أو هذا الجهاز%'; end;
  assert ok, 'الجوال نفسه مرة واحدة في اليوم';
  ok := false; begin perform request_custom_plan('{"phone":"0551110003","name":"ج","_device":"devAAAAAAAAAAAAAAAA1"}'); exception when others then ok := true; end;
  assert ok, 'الجهاز نفسه مرة واحدة في اليوم';
  ok := false; begin perform request_custom_plan('{"phone":"+966551110002","name":"ب"}'); exception when others then ok := true; end;
  assert ok, 'صيغة دولية للجوال نفسه تُعدّ الجوال نفسه';
  perform request_custom_plan('{"phone":"0551110004","name":"د","_device":"devCCCCCCCCCCCCCCCC3"}');
  -- حد عنوان الشبكة
  update settings set reg_per_ip = 2 where id = 1;
  ok := false; begin perform request_custom_plan('{"phone":"0551110005","name":"ه","_device":"devDDDDDDDDDDDDDDDD4"}'); exception when others then ok := true; end;
  assert ok, 'حد عنوان الشبكة';
  update settings set reg_per_ip = 15 where id = 1;
  -- المسؤول غير مقيّد
  insert into auth.users(id, email) values (adm, 'reg-adm@test'); insert into admins(user_id, role, name) values (adm, 'staff', 'موظف');
  perform set_config('app.uid', adm::text, true);
  perform request_custom_plan('{"phone":"0551110002","name":"ب","_device":"devAAAAAAAAAAAAAAAA1"}');
  perform set_config('app.uid', '', true);
  assert not exists (select 1 from reg_limits_log where phone_hash like '0551%'), 'الجوال لا يُحفظ نصًا';
  assert has_function_privilege('anon', 'reg_rate_gate(jsonb,text)', 'execute') = false, 'دالة داخلية';
  perform set_config('request.headers', '', true);
  delete from reg_limits_log; delete from custom_requests where phone like '055111000%';
end $$;
\echo 'PASS reg daily limit'
