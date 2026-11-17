-- تفعيل الجهاز (الخطوة AT): المسؤول يفتح مهلة لجهاز واحد؛ الرمز يصدر لجهاز صاحب الحساب ويظهر له وحده؛ الإدارة لا ترى رموزًا ولا أجهزة
\set ON_ERROR_STOP on
do $$
declare v_admin uuid := gen_random_uuid(); u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); r jsonb; c text; ok boolean; i int; ph text; nid text;
begin
  select phone, national_id into ph, nid from trainees t where exists (select 1 from subscriptions s where s.trainee_id = t.id) and phone ~ '^05[0-9]{8}$' and national_id ~ '^[12][0-9]{9}$'
     and not exists (select 1 from trainees x where x.phone = t.phone and x.id <> t.id) order by t.id limit 1;
  begin perform admin_open_activation(ph, 'student', 15); ok := false; exception when others then ok := true; end;
  assert ok, 'فتح التفعيل للمسؤول فقط';
  -- قبل فتح المهلة: لا رمز لأحد، والطلب يظهر للإدارة بالاسم فقط
  perform set_config('app.uid', u1::text, true);
  assert my_phone() is null and cardinality(portal_roles()) = 0, 'قبل التفعيل لا جوال ولا صلاحية';
  r := request_login(nid, 'student');
  assert (r->>'ok')::boolean and not (r->>'open')::boolean and not (r ? 'code'), 'بلا مهلة مفتوحة لا يصدر رمز';
  r := request_login('1000000000', 'student');
  assert not (r->>'open')::boolean and not (r ? 'code'), 'هوية غير مسجّلة: الرد نفسه';
  insert into auth.users(id, email) values (v_admin, 'act-admin@test'); insert into admins(user_id, role) values (v_admin, 'staff');
  perform set_config('app.uid', v_admin::text, true);
  r := admin_login_requests();
  assert exists (select 1 from jsonb_array_elements(r) x where x->>'phone' = ph) and not exists (select 1 from jsonb_array_elements(r) x where x ? 'code' or x ? 'device'), 'طلب الدخول يظهر للإدارة بلا رمز ولا جهاز';
  begin perform admin_open_activation('0599999990', 'student', 15); ok := false; exception when others then ok := true; end;
  assert ok, 'رقم بلا حساب لا تُفتح له مهلة';
  begin perform admin_open_activation(ph, 'student', 7); ok := false; exception when others then ok := true; end;
  assert ok, 'مدد محددة فقط';
  r := admin_open_activation(ph, 'student', 15);
  assert not (r ? 'code') and r->>'expires_at' is not null, 'فتح التفعيل لا يعيد أي رمز للإدارة';
  assert not exists (select 1 from jsonb_array_elements(admin_access_status()->'devices') x where x ? 'label'), 'الحالة بلا وصف جهاز';
  -- صاحب الحساب على جهازه: يصدر له الرمز ويعود إليه وحده
  perform set_config('app.uid', u1::text, true);
  r := request_login(nid, 'student');
  c := r->>'code';
  assert (r->>'open')::boolean and c ~ '^[0-9]{6}$', 'مع المهلة يظهر الرمز لهذا الجهاز';
  assert not exists (select 1 from login_requests where code <> '') and exists (select 1 from login_requests where uid = u1 and code_hash = act_hash(ph, c)), 'الرمز مجزّأ لا نصًّا';
  perform set_config('app.uid', u2::text, true);
  assert ((activate_device(nid, c, 'student'))->>'ok')::boolean = false, 'الرمز لجهازه فقط';
  perform set_config('app.uid', u1::text, true);
  assert ((activate_device(nid, '000000', 'student'))->>'ok')::boolean = false, 'رمز خاطئ يُرفض';
  r := activate_device(nid, c, 'student', 'iPhone Safari');
  assert (r->>'ok')::boolean and my_phone() = ph and 'student' = any(portal_roles()), 'التفعيل يربط الجهاز بالحساب';
  assert (select label from device_sessions where uid = u1) = '', 'لا يُحفظ نوع الجهاز';
  assert portal_data('student') is not null, 'البوابة تعمل بالجهاز المفعَّل';
  -- المهلة لجهاز واحد: جهاز ثانٍ لا يحصل على رمز
  perform set_config('app.uid', u2::text, true);
  r := request_login(nid, 'student');
  assert not (r->>'open')::boolean and not (r ? 'code'), 'المهلة تُغلق بأول جهاز';
  -- قفل بعد 5 محاولات خاطئة
  perform set_config('app.uid', u3::text, true);
  for i in 1..5 loop perform activate_device('0599999991', '111111', 'student'); end loop;
  begin perform activate_device('0599999991', '111111', 'student'); ok := false; exception when others then ok := true; end;
  assert ok, 'قفل بعد خمس محاولات خاطئة';
  -- مهلة منتهية لا تعطي رمزًا، والإيقاف يغلقها، والإلغاء يخرج الأجهزة
  perform set_config('app.uid', v_admin::text, true);
  perform admin_open_activation(ph, 'student', 15);
  update activation_windows set expires_at = now() - interval '1 minute' where phone = ph and role = 'student' and used_at is null and not revoked;
  perform set_config('app.uid', u2::text, true);
  assert not (request_login(nid, 'student')->>'open')::boolean, 'المهلة المنتهية لا تعطي رمزًا';
  perform set_config('app.uid', v_admin::text, true);
  perform admin_open_activation(ph, 'student', 60); perform admin_close_activation(ph, 'student');
  perform set_config('app.uid', u2::text, true);
  assert not (request_login(nid, 'student')->>'open')::boolean, 'إيقاف التفعيل يغلق المهلة';
  perform set_config('app.uid', v_admin::text, true);
  r := admin_open_activation_bulk('student', array[ph, '0599999990'], 1440);
  assert jsonb_array_length(r) = 2 and r->1 ? 'error' and not exists (select 1 from jsonb_array_elements(r) x where x ? 'code'), 'الفتح الجماعي بلا رموز';
  assert not ((admin_issue_activation(ph, 'student')) ? 'code'), 'الإصدار القديم لا يعيد رمزًا';
  perform admin_revoke_devices(ph, 'student');
  perform set_config('app.uid', u1::text, true);
  assert my_phone() is null, 'إلغاء الأجهزة يخرجها';
  perform set_config('app.uid', '', true);
  delete from admins where user_id = v_admin; delete from auth.users where id = v_admin;
end $$;
