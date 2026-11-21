-- الخطوة BR: إلغاء جلسات الباقات لفترة مع تعويض تلقائي
\set ON_ERROR_STOP on
do $$
declare r jsonb; d date := riyadh_now()::date; base date; full_adm uuid := gen_random_uuid(); staff uuid := gen_random_uuid();
  v_sub uuid; v_sub2 uuid; old_end date; new_end date; ok boolean; b1 uuid; b2 uuid; cnt int; lost int;
begin
  insert into auth.users(id, email) values (full_adm, 'brk-full@test'), (staff, 'brk-staff@test');
  insert into admins(user_id, role, name) values (full_adm, 'full', 'مدير'), (staff, 'staff', 'موظف');
  base := d + 21 + ((7 - extract(dow from d + 21)::int) % 7);   -- أحد بعد ثلاثة أسابيع
  insert into trainees(national_id, full_name, phone, gender) values ('1999999181', 'فهد سالم علي الحربي', '0557778181', 'ذكر'), ('1999999182', 'سعد سالم علي الحربي', '0557778182', 'ذكر');
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects, status, start_date, end_date)
    select 'SQ-BRK1', (select id from trainees where national_id = '1999999181'), id, 'boys', subjects, 'active', d, base + 30 from plans where tier = 'silver' and mode = 'in_person' returning id into v_sub;
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects, status)   -- بانتظار أول حضور: لا يتأثر
    select 'SQ-BRK2', (select id from trainees where national_id = '1999999182'), id, 'boys', subjects, 'pending' from plans where tier = 'basic' and mode = 'in_person' returning id into v_sub2;
  old_end := base + 30;
  select count(*) into lost from generate_series(base, base + 6, interval '1 day') g where (session_on('boys', g::date)).start_time is not null;

  -- الصلاحية
  perform set_config('app.uid', staff::text, true);
  ok := false; begin perform admin_cancel_sessions(jsonb_build_object('from', base, 'to', base + 6, 'reason', 'official')); exception when others then ok := sqlerrm like '%للمالك ومدير النظام%'; end;
  assert ok, 'الموظف لا يلغي الجلسات';
  perform set_config('app.uid', full_adm::text, true);
  ok := false; begin perform admin_cancel_sessions(jsonb_build_object('from', base, 'to', base + 6, 'reason', 'other', 'note', ' ')); exception when others then ok := sqlerrm like '%اكتب سبب%'; end;
  assert ok, '«أخرى» تتطلب سببًا مكتوبًا';
  ok := false; begin perform admin_cancel_sessions(jsonb_build_object('from', d - 20, 'to', d - 15, 'reason', 'official')); exception when others then ok := true; end;
  assert ok, 'لا إلغاء لما مضى عليه أكثر من 7 أيام';

  -- المعاينة لا تحفظ شيئًا
  r := admin_cancel_sessions(jsonb_build_object('from', base, 'to', base + 6, 'reason', 'official', 'preview', true));
  assert (r->>'preview')::boolean and (r->>'affected')::int >= 1 and jsonb_array_length(r->'sessions') >= lost, 'المعاينة: ' || r::text;
  assert not exists (select 1 from session_breaks) and not exists (select 1 from schedule_exceptions where break_id is not null)
     and (select end_date from subscriptions where id = v_sub) = old_end, 'المعاينة لا تغيّر البيانات';

  -- التنفيذ
  r := admin_cancel_sessions(jsonb_build_object('from', base, 'to', base + 6, 'reason', 'official', 'sections', jsonb_build_array('boys','girls')));
  b1 := (r->>'id')::uuid;
  assert lost > 0 and (select count(*) from schedule_exceptions where break_id = b1 and section = 'boys') = lost, 'كل جلسات البنين في الفترة ملغاة';
  assert not exists (select 1 from generate_series(base, base + 6, interval '1 day') g where (session_on('boys', g::date)).start_time is not null), 'لا جلسة في الفترة';
  select end_date into new_end from subscriptions where id = v_sub;
  select count(*) into cnt from generate_series(old_end + 1, new_end, interval '1 day') g where (session_on('boys', g::date)).start_time is not null;
  assert new_end > old_end and cnt = lost and (session_on('boys', new_end)).start_time is not null, format('التعويض بعدد الجلسات نفسه: %s→%s (%s/%s)', old_end, new_end, cnt, lost);
  assert (select sessions from break_compensations where break_id = b1 and subscription_id = v_sub) = lost, 'سجل التعويض';
  assert not exists (select 1 from break_compensations where subscription_id = v_sub2) and (select end_date from subscriptions where id = v_sub2) is null, 'الاشتراك المنتظر لا يتأثر';
  assert exists (select 1 from notifications where kind = 'session_cancel' and dedupe_key = 'brk:' || b1 || ':s:' || v_sub), 'إشعار المتدرب';
  assert exists (select 1 from audit_logs where action = 'session_breaks.insert'), 'في سجل الحركات';

  -- يوم من الإلغاء الجماعي لا يُحذف منفردًا
  ok := false; begin delete from schedule_exceptions where break_id = b1; exception when others then ok := sqlerrm like '%ضمن إلغاء جلسات%'; end;
  assert ok, 'حماية استثناءات الإلغاء الجماعي';

  -- إلغاء ثانٍ يمدد مرة أخرى، والتراجع بالترتيب (الأحدث أولًا)
  r := admin_cancel_sessions(jsonb_build_object('from', base + 7, 'to', base + 7, 'reason', 'other', 'note', 'صيانة القاعة', 'sections', jsonb_build_array('girls')));
  b2 := (r->>'id')::uuid;
  assert (select end_date from subscriptions where id = v_sub) = new_end, 'إلغاء قسم البنات لا يمس البنين';
  r := admin_cancel_sessions(jsonb_build_object('from', base + 8, 'to', base + 13, 'reason', 'center', 'sections', jsonb_build_array('boys')));
  ok := false; begin perform admin_revoke_session_break(b1); exception when others then ok := sqlerrm like '%الأحدث%'; end;
  assert ok, 'التراجع عن الأحدث أولًا';
  r := admin_revoke_session_break((r->>'id')::uuid);
  assert (r->>'restored')::int >= 1 and (r->>'conflicts')::int = 0 and (select end_date from subscriptions where id = v_sub) = new_end, 'التراجع يعيد النهاية: ' || r::text;
  perform admin_revoke_session_break(b2);
  r := admin_revoke_session_break(b1);
  assert (select end_date from subscriptions where id = v_sub) = old_end and not exists (select 1 from schedule_exceptions where break_id = b1), 'التراجع الكامل';
  assert (select revoked_at from session_breaks where id = b1) is not null, 'الإلغاء يبقى مؤرشفًا';
  ok := false; begin perform admin_revoke_session_break(b1); exception when others then ok := true; end;
  assert ok, 'لا تراجع مرتين';
  assert has_function_privilege('anon', 'admin_cancel_sessions(jsonb)', 'execute') = false, 'ليست للزائر';

  perform set_config('app.uid', '', true);
end $$;
\echo 'PASS session breaks'
