-- الخطوة BJ: كلمة مرور البوابات، وكشف اليوم بلا «بانتظار أول حضور»
\set ON_ERROR_STOP on
do $$
declare v_admin uuid := gen_random_uuid(); u1 uuid := gen_random_uuid(); u2 uuid := gen_random_uuid(); u3 uuid := gen_random_uuid(); r jsonb; c text; ok boolean; ph text; nid text; i int;
begin
  select phone, national_id into ph, nid from trainees t where exists (select 1 from subscriptions s where s.trainee_id = t.id) and phone ~ '^05[0-9]{8}$' and national_id ~ '^[12][0-9]{9}$'
     and not exists (select 1 from trainees x where x.phone = t.phone and x.id <> t.id) order by t.id limit 1 offset 1;
  delete from device_sessions where phone = ph; delete from activation_attempts where phone = ph; delete from portal_passwords where phone = ph;
  insert into auth.users(id, email) values (v_admin, 'pw-admin@test'); insert into admins(user_id, role) values (v_admin, 'staff');
  -- أول دخول: تفعيل الإدارة ← رمز ← الجهاز ← يجب تعيين كلمة مرور
  perform set_config('app.uid', v_admin::text, true); perform admin_open_activation(ph, 'student', 15);
  perform set_config('app.uid', u1::text, true);
  r := request_login(nid, 'student'); c := r->>'code';
  assert (activate_device(nid, c, 'student')->>'ok')::boolean, 'التفعيل الأول';
  r := portal_password_status('student');
  assert not (r->>'has')::boolean and (r->>'must_set')::boolean, 'يُطلب تعيين كلمة مرور';
  begin perform portal_set_password('student', 'short1'); ok := false; exception when others then ok := sqlerrm like '%8 أحرف%'; end;
  assert ok, 'كلمة قصيرة مرفوضة';
  begin perform portal_set_password('student', 'abcdefgh'); ok := false; exception when others then ok := true; end;
  assert ok, 'تلزم حروف وأرقام';
  r := portal_set_password('student', 'Sama2026x');
  assert (r->>'ok')::boolean and not (portal_password_status('student')->>'must_set')::boolean, 'عُيّنت كلمة المرور';
  assert not exists (select 1 from portal_passwords where phone = ph and pass_hash like '%Sama2026x%'), 'مجزّأة';
  -- تغييرها لاحقًا يلزم الحالية
  begin perform portal_set_password('student', 'Other2026y'); ok := false; exception when others then ok := sqlerrm like '%الحالية%'; end;
  assert ok, 'التغيير يلزم الحالية';
  -- جهاز آخر بالهوية وكلمة المرور
  perform set_config('app.uid', u2::text, true);
  r := portal_password_login(nid, 'student', 'wrong123x');
  assert not (r->>'ok')::boolean and my_phone() is null, 'كلمة خاطئة لا تدخل';
  r := portal_password_login('1000000000', 'student', 'Sama2026x');
  assert not (r->>'ok')::boolean, 'هوية غير مسجّلة: الرد نفسه';
  r := portal_password_login(nid, 'student', 'Sama2026x');
  assert (r->>'ok')::boolean and my_phone() = ph and not (portal_password_status('student')->>'must_set')::boolean, 'الدخول من جهاز آخر بالهوية وكلمة المرور';
  assert (select count(*) from device_sessions where phone = ph and revoked_at is null) = 2, 'جهازان';
  update portal_passwords set set_at = set_at - interval '5 minutes' where phone = ph;   -- مرور الوقت (الاختبار في معاملة واحدة)
  update login_requests set used_at = used_at - interval '6 minutes' where phone = ph and used_at is not null;
  -- نسيت كلمة المرور: تفعيل جديد من الإدارة ← رمز ← كلمة جديدة دون الحالية ← تخرج الأجهزة الأخرى
  perform set_config('app.uid', v_admin::text, true); perform admin_open_activation(ph, 'student', 15);
  perform set_config('app.uid', u3::text, true);
  r := request_login(nid, 'student'); c := r->>'code';
  assert (activate_device(nid, c, 'student')->>'ok')::boolean, 'تفعيل جديد';
  assert (portal_password_status('student')->>'must_set')::boolean, 'بعد التفعيل الجديد تُطلب كلمة جديدة';
  r := portal_set_password('student', 'New2026pass');
  assert (r->>'revoked')::int = 2 and (select count(*) from device_sessions where phone = ph and revoked_at is null) = 1, 'الكلمة الجديدة تُلغي التفعيل السابق';
  perform set_config('app.uid', u2::text, true);
  assert my_phone() is null and not (portal_password_login(nid, 'student', 'Sama2026x')->>'ok')::boolean, 'الكلمة القديمة لم تعد تعمل';
  -- قفل بعد 5 محاولات
  for i in 1..5 loop begin perform portal_password_login(nid, 'student', 'bad' || i || 'xxxxx'); exception when others then null; end; end loop;
  begin perform portal_password_login(nid, 'student', 'New2026pass'); ok := false; exception when others then ok := sqlerrm like '%محاولات كثيرة%'; end;
  assert ok, 'قفل بعد 5 محاولات';
  -- الصلاحيات
  assert not has_function_privilege('anon', 'portal_password_login(text, text, text)', 'execute') and not has_function_privilege('authenticated', 'pw_fresh_activation(text, text, timestamptz)', 'execute')
     and has_function_privilege('authenticated', 'portal_set_password(text, text, text)', 'execute') and not has_table_privilege('authenticated', 'portal_passwords', 'select'), 'الصلاحيات';
  delete from device_sessions where phone = ph; delete from activation_attempts where phone = ph; delete from portal_passwords where phone = ph;
end $$;

-- كشف اليوم بلا من ينتظر أول حضور
do $$
declare v_sub uuid; r jsonb; v_name text; v_day date;
begin
  select d into v_day from generate_series(riyadh_now()::date - 6, riyadh_now()::date, interval '1 day') d where exists (select 1 from session_on('boys', d::date) x where x.start_time is not null) order by d desc limit 1;
  if v_day is null then return; end if;
  select s.id, t.full_name into v_sub, v_name from subscriptions s join trainees t on t.id = s.trainee_id where s.section = 'boys' and s.status <> 'cancelled' and not t.is_test limit 1;
  update subscriptions set start_date = null, end_date = null, status = 'pending' where id = v_sub;
  r := build_daily_report(v_day);
  assert not exists (select 1 from jsonb_array_elements(r->'groups') g, jsonb_array_elements(g->'rows') x where x->>'name' = v_name), 'بانتظار أول حضور لا يظهر في كشف اليوم';
  raise exception 'rollback-ok';
exception when others then if sqlerrm <> 'rollback-ok' then raise; end if;
end $$;
\echo 'PASS portal password'
