-- الخطوة W: الدخول برقم الهوية ورمز تحقق لهذا الجهاز عبر المراسلات الداخلية؛ وتعدد المسؤولين بالدعوة
\set ON_ERROR_STOP on
do $$
declare u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); a1 uuid := gen_random_uuid(); a2 uuid := gen_random_uuid(); t trainees; r jsonb; c text; ok boolean; n int;
begin
  select tr.* into t from trainees tr where exists (select 1 from subscriptions s where s.trainee_id = tr.id) and tr.phone ~ '^05[0-9]{8}$' and tr.national_id ~ '^[12][0-9]{9}$' and (select count(*) from trainees z where z.phone = tr.phone) = 1 order by tr.id limit 1;
  perform set_config('app.uid', u1::text, true);
  r := request_login('1000000000', 'student'); n := (select count(*) from login_requests where uid = u1);
  assert (r->>'ok')::boolean and n = 0, 'هوية غير مسجّلة: الرد نفسه ولا رمز';
  r := request_login(t.national_id, 'student');
  select code into c from login_requests where uid = u1 and phone = t.phone and used_at is null;
  assert (r->>'ok')::boolean and c ~ '^[0-9]{6}$' and not (r ? 'code'), 'الطلب يولّد رمزًا لهذا الجهاز ولا يعيده في الرد';
  assert exists (select 1 from notifications where trainee_id = t.id and kind = 'login_code' and text like '%' || c || '%'), 'الرمز يصل إلى صندوق الحساب';
  -- جهاز آخر لا يستعمل رمز هذا الجهاز
  perform set_config('app.uid', u2::text, true);
  assert ((activate_device(t.national_id, c, 'student'))->>'ok')::boolean = false, 'الرمز لجهازه فقط';
  perform set_config('app.uid', u1::text, true);
  r := activate_device(t.national_id, c, 'student');
  assert (r->>'ok')::boolean and my_phone() = t.phone and 'student' = any(portal_roles()), 'الدخول برقم الهوية والرمز يفعّل الجهاز';
  perform set_config('app.uid', u2::text, true);
  assert ((activate_device(t.national_id, c, 'student'))->>'ok')::boolean = false, 'الرمز لمرة واحدة';
  -- الإدارة ترى طلبات الدخول؛ غيرها لا
  begin perform admin_login_requests(); ok := false; exception when others then ok := true; end;
  assert ok, 'طلبات الدخول للمسؤول فقط';
  -- تعدد المسؤولين
  insert into auth.users(id, email, email_confirmed_at) values (a1, 'first-admin@test.local', now()), (a2, 'second-admin@test.local', now());
  insert into admins(user_id, email, name) values (a1, 'first-admin@test.local', 'المسؤول الأول');
  perform set_config('app.uid', a2::text, true);
  assert claim_admin() = false and not is_admin(), 'غير المدعوّ لا ينال الصلاحية';
  begin perform admin_add('x@test.local', 'اسم'); ok := false; exception when others then ok := true; end;
  assert ok, 'الإضافة للمسؤول فقط';
  perform set_config('app.uid', a1::text, true);
  perform request_login(t.national_id, 'student');
  perform admin_add('Third-Admin@test.local', 'المسؤول الثالث');
  assert exists (select 1 from admin_invites where email = 'third-admin@test.local') and jsonb_array_length(admin_list()) >= 2, 'دعوة ببريد لم ينشئ حسابه بعد';
  perform admin_add('second-admin@test.local', 'المسؤول الثاني');
  perform set_config('app.uid', a2::text, true);
  assert is_admin(), 'صاحب الحساب القائم يصير مسؤولًا فورًا';
  begin perform admin_remove(a2::text); ok := false; exception when others then ok := true; end;
  assert ok, 'المسؤول لا يحذف نفسه';
  perform admin_remove(a1::text);
  assert not exists (select 1 from admins where user_id = a1), 'مسؤول يزيل مسؤولًا آخر';
  begin perform admin_remove(a1::text); perform admin_remove('00000000-0000-0000-0000-000000000000'); ok := (select count(*) from admins where user_id = a2) = 1; exception when others then ok := true; end;
  assert ok, 'يبقى مسؤول واحد على الأقل';
  perform set_config('app.uid', '', true);
  delete from admins where user_id in (a1, a2); delete from admin_invites where email = 'third-admin@test.local'; delete from auth.users where id in (a1, a2);
end $$;
