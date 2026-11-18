-- الخطوة BO: من يحق له توقيع روابط صور البنك
\set ON_ERROR_STOP on
do $$
declare v_adm uuid := gen_random_uuid(); v_dev uuid := gen_random_uuid(); v_anon uuid := gen_random_uuid(); v_q uuid; v_pa uuid;
begin
  insert into questions(id, subject, unit, text, options, correct, status, shared, section, image, code)
    values (gen_random_uuid(), 'كمي', 'اختبار', '', array['أ','ب','ج','د'], 0, 'published', true, 'all', 'quant/TEST-01.webp', 'TST-01') returning id into v_q;
  perform set_config('app.uid', '', true);
  assert not bank_object_ok('quant/TEST-01.webp'), 'الزائر بلا جلسة لا يوقّع';
  perform set_config('app.uid', v_anon::text, true);
  assert not bank_object_ok('quant/TEST-01.webp'), 'جلسة مجهولة بلا تفعيل لا توقّع';
  insert into device_sessions(uid, phone, role) values (v_dev, '0550000999', 'student');
  perform set_config('app.uid', v_dev::text, true);
  assert bank_object_ok('quant/TEST-01.webp'), 'حساب بوابة مفعَّل يوقّع';
  update device_sessions set revoked_at = now() where uid = v_dev;
  assert not bank_object_ok('quant/TEST-01.webp'), 'الجهاز المُخرَج لا يوقّع';
  insert into auth.users(id, email) values (v_adm, 'bank-adm@test'); insert into admins(user_id, role, name) values (v_adm, 'staff', 'موظف');
  perform set_config('app.uid', v_adm::text, true);
  assert bank_object_ok('quant/TEST-01.webp'), 'المسؤول يوقّع';
  -- زائر اختبار تحديد المستوى: صور محاولته الحديثة فقط
  perform set_config('app.uid', '', true);
  insert into placement_attempts(kind, session_id, ip_hash, day, snapshot, started_at, deadline)
    values ('qudurat', 'testsession01', 'x', riyadh_now()::date, jsonb_build_array(jsonb_build_object('id', v_q)), now(), now() + interval '10 minutes') returning id into v_pa;
  assert bank_object_ok('quant/TEST-01.webp'), 'صورة سؤال في محاولة حديثة';
  assert not bank_object_ok('quant/OTHER.webp'), 'غير أسئلة المحاولة مرفوض';
  update placement_attempts set started_at = now() - interval '4 hours' where id = v_pa;
  assert not bank_object_ok('quant/TEST-01.webp'), 'المحاولة القديمة لا تفتح الصور';
  delete from placement_attempts where id = v_pa; delete from questions where id = v_q;
end $$;
\echo 'PASS bank private'
