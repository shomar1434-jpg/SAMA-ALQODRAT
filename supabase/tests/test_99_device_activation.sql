-- الخطوة S: تفعيل الجهاز — رمز لمرة واحدة من الإدارة يربط الجلسة بالجوال؛ قفل المحاولات؛ الإلغاء
\set ON_ERROR_STOP on
do $$
declare v_admin uuid := gen_random_uuid(); u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); r jsonb; c text; ok boolean; i int; ph text;
begin
  select phone into ph from trainees t where exists (select 1 from subscriptions s where s.trainee_id = t.id) and phone ~ '^05[0-9]{8}$' and not exists (select 1 from trainees x where x.phone = t.phone and x.id <> t.id) limit 1;
  begin perform admin_issue_activation(ph, 'student'); ok := false; exception when others then ok := true; end;
  assert ok, 'الإصدار للمسؤول فقط';
  insert into auth.users(id, email) values (v_admin, 'act-admin@test'); insert into admins(user_id) values (v_admin);
  perform set_config('app.uid', v_admin::text, true);
  begin perform admin_issue_activation('0599999990', 'student'); ok := false; exception when others then ok := true; end;
  assert ok, 'رقم بلا حساب لا يُصدر له رمز';
  r := admin_issue_activation(ph, 'student'); c := r->>'code';
  assert c ~ '^[0-9]{6}$' and not exists (select 1 from activation_codes where code_hash = c), 'رمز من 6 أرقام ولا يُحفظ نصًّا';
  -- جلسة جهاز المتدرب (مجهولة) قبل التفعيل: بلا جوال
  perform set_config('app.uid', u1::text, true);
  assert my_phone() is null and cardinality(portal_roles()) = 0, 'قبل التفعيل لا جوال ولا صلاحية (حتى لو وُجد سجل جواله فارغ)';
  begin ok := portal_data('student') is null; exception when others then ok := true; end;
  assert ok, 'قبل التفعيل لا بيانات';
  r := activate_device(ph, '000000', 'student');
  assert (r->>'ok')::boolean = false, 'رمز خاطئ يُرفض';
  r := activate_device(ph, c, 'guardian');
  assert (r->>'ok')::boolean = false, 'الرمز لدوره فقط';
  r := activate_device(ph, c, 'student', 'جهاز الاختبار');
  assert (r->>'ok')::boolean and my_phone() = ph and 'student' = any(portal_roles()), 'التفعيل يربط الجلسة بالجوال ويمنح الدور';
  assert portal_data('student') is not null, 'بوابة المتدرب تعمل بالجهاز المفعَّل';
  -- الرمز لمرة واحدة
  perform set_config('app.uid', u2::text, true);
  r := activate_device(ph, c, 'student');
  assert (r->>'ok')::boolean = false and my_phone() is null, 'الرمز لا يُستخدم مرتين';
  -- قفل بعد 5 محاولات خاطئة
  perform set_config('app.uid', u3::text, true);
  for i in 1..5 loop perform activate_device('0599999991', '111111', 'student'); end loop;
  begin perform activate_device('0599999991', '111111', 'student'); ok := false; exception when others then ok := true; end;
  assert ok, 'قفل بعد خمس محاولات خاطئة';
  -- رمز جديد يلغي السابق، والإلغاء يخرج الأجهزة
  perform set_config('app.uid', v_admin::text, true);
  r := admin_issue_activation(ph, 'student'); c := r->>'code';
  r := admin_issue_activation(ph, 'student');
  perform set_config('app.uid', u2::text, true);
  assert ((activate_device(ph, c, 'student'))->>'ok')::boolean = false, 'الرمز الأحدث يلغي السابق';
  assert ((activate_device(ph, r->>'code', 'student'))->>'ok')::boolean, 'الرمز الأحدث يعمل على جهاز ثانٍ';
  perform set_config('app.uid', v_admin::text, true); perform admin_revoke_devices(ph, 'student');
  perform set_config('app.uid', u1::text, true);
  assert my_phone() is null, 'إلغاء الأجهزة يخرجها';
  perform set_config('app.uid', u2::text, true); perform device_logout();
  perform set_config('app.uid', '', true);
  delete from admins where user_id = v_admin; delete from auth.users where id = v_admin;
end $$;
