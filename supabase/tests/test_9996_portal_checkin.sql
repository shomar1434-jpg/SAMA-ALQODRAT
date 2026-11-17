-- الخطوة AB: الحضور من البوابة لملف هذا الجوال فقط، وبمسار التحضير نفسه
\set ON_ERROR_STOP on
do $$
declare v_admin uuid := gen_random_uuid(); u1 uuid := gen_random_uuid(); r jsonb; c text; ok boolean; t1 uuid; t2 uuid; ph text := '0557779911';
begin
  insert into trainees(national_id, full_name, phone, gender) values ('1999999983', 'خالد ناصر علي الشهري', ph, 'ذكر') returning id into t1;
  insert into trainees(national_id, full_name, phone, gender) values ('1999999984', 'سعد ناصر علي الشهري', '0557779912', 'ذكر') returning id into t2;
  insert into trainees(national_id, full_name, phone, gender) values ('1999999985', 'ريم ناصر علي الشهري', ph, 'أنثى');   -- جوال مشترك لأخوين (ولا يلتقطه اختبار التفعيل)
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects, status) select 'SQ-PC9992', t1, id, 'boys', subjects, 'pending' from plans where mode = 'in_person' limit 1;
  begin perform portal_checkin(t1); ok := false; exception when others then ok := true; end;
  assert ok, 'دون جلسة جهاز لا تحضير';
  insert into auth.users(id, email) values (v_admin, 'pc-admin@test'); insert into admins(user_id, role) values (v_admin, 'full');
  perform set_config('app.uid', v_admin::text, true);
  perform admin_open_activation(ph, 'student', 15);
  perform set_config('app.uid', u1::text, true);
  c := request_login(ph, 'student')->>'code';
  r := activate_device(ph, c, 'student');
  assert (r->>'ok')::boolean, 'جهاز المتدرب مفعّل';
  begin perform portal_checkin(t2); ok := false; exception when others then ok := true; end;
  assert ok, 'لا تحضير لملف جوال آخر';
  r := portal_checkin(t1, null, 'dev-1');
  assert r ? 'ok' and (r->>'ok')::boolean = (r->>'reason' is null), 'يمر بمسار التحضير ويعيد نتيجته';
  assert exists (select 1 from checkin_attempts where device = 'dev-1'), 'المحاولة مسجّلة';
  assert not has_function_privilege('anon', 'portal_checkin(uuid,text,text,text)', 'execute'), 'ليست للزائر';
  perform set_config('app.uid', '', true);
end $$;
