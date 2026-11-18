-- الخطوة BI: إضافة جهاز آخر من الجهاز المفعّل، والخروج من الأجهزة الأخرى
\set ON_ERROR_STOP on
do $$
declare u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); u4 uuid := gen_random_uuid(); r jsonb; c text; ok boolean; ph text; nid text; i int;
begin
  select phone, national_id into ph, nid from trainees t where exists (select 1 from subscriptions s where s.trainee_id = t.id) and phone ~ '^05[0-9]{8}$' and national_id ~ '^[12][0-9]{9}$'
     and not exists (select 1 from trainees x where x.phone = t.phone and x.id <> t.id) order by t.id desc limit 1;
  delete from device_sessions where phone = ph;
  -- جهاز غير مفعّل لا يطلب رمز ربط
  perform set_config('app.uid', u1::text, true);
  begin perform portal_device_link('student', false); ok := false; exception when others then ok := sqlerrm like '%جهازك المفعّل%'; end;
  assert ok, 'رمز الربط من جهاز مفعّل فقط';
  insert into device_sessions(uid, phone, role) values (u1, ph, 'student');
  r := portal_device_link('student', false); c := r->>'code';
  assert c ~ '^[0-9]{6}$' and not exists (select 1 from device_link_codes where code_hash like '%' || c || '%'), 'رمز من 6 أرقام مخزّن مجزّأً';
  -- الجهاز الجديد: هوية + رمز خاطئ ثم صحيح
  perform set_config('app.uid', u2::text, true);
  r := link_device(nid, 'student', '000000');
  assert not (r->>'ok')::boolean and my_phone() is null, 'رمز خاطئ لا يربط';
  r := link_device(nid, 'guardian', c);
  assert not (r->>'ok')::boolean, 'الرمز لدوره فقط';
  r := link_device(nid, 'student', c);
  assert (r->>'ok')::boolean and my_phone() = ph and 'student' = any(portal_roles()), 'الجهاز الثاني يدخل بالرمز';
  assert (portal_devices('student')->>'count')::int = 2, 'جهازان مفعّلان';
  perform set_config('app.uid', u3::text, true);
  r := link_device(nid, 'student', c);
  assert not (r->>'ok')::boolean, 'الرمز لمرة واحدة';
  -- رمز بخيار إخراج الأجهزة الأخرى
  perform set_config('app.uid', u2::text, true);
  r := portal_device_link('student', true); c := r->>'code';
  perform set_config('app.uid', u3::text, true);
  r := link_device(nid, 'student', c);
  assert (r->>'ok')::boolean and (portal_devices('student')->>'count')::int = 1, 'الربط مع الخروج يترك الجهاز الجديد وحده';
  perform set_config('app.uid', u1::text, true);
  assert my_phone() is null, 'الجهاز الأول خرج';
  -- الخروج من الأجهزة الأخرى من داخل الحساب
  insert into device_sessions(uid, phone, role) values (u4, ph, 'student');
  perform set_config('app.uid', u3::text, true);
  r := portal_logout_others('student');
  assert (r->>'revoked')::int = 1 and (portal_devices('student')->>'count')::int = 1 and my_phone() = ph, 'خروج الأجهزة الأخرى ويبقى هذا';
  -- قفل بعد 5 محاولات خاطئة
  perform set_config('app.uid', u4::text, true);
  for i in 1..5 loop begin perform link_device(nid, 'student', '111111'); exception when others then null; end; end loop;
  begin perform link_device(nid, 'student', '111111'); ok := false; exception when others then ok := sqlerrm like '%محاولات كثيرة%'; end;
  assert ok, 'قفل بعد 5 محاولات';
  -- الصلاحيات
  assert not has_function_privilege('anon', 'portal_device_link(text, boolean)', 'execute') and not has_function_privilege('anon', 'my_device(text)', 'execute')
     and not has_function_privilege('authenticated', 'my_device(text)', 'execute') and has_function_privilege('authenticated', 'link_device(text, text, text)', 'execute'), 'الصلاحيات';
  delete from device_sessions where phone = ph; delete from device_link_codes where phone = ph; delete from activation_attempts where phone = ph;
end $$;
\echo 'PASS device link'
