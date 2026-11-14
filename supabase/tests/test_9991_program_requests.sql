-- الخطوة AA: البرنامج بلا دفعة مفتوحة يقبل تسجيلًا مبدئيًا بلا طلب شراء، والإدارة تنقله إلى الدفعة عند فتحها
\set ON_ERROR_STOP on
do $$
declare r jsonb; pr programs; v_admin uuid; ok boolean; q program_requests; d date := riyadh_now()::date;
  p jsonb := '{"national_id":"1999999971","full_name":"فهد سالم علي الزهراني","phone":"0557770071","gender":"ذكر","birth_date":"1995-01-01","city":"جازان","education":"جامعي"}';
begin
  p := p || jsonb_build_object('accepted_policies', (select coalesce(jsonb_agg(id), '[]') from current_policies(d) where requires_acceptance));
  select * into pr from programs where active and not exists (select 1 from cohorts c where c.program_id = programs.id and c.archived_at is null) limit 1;
  r := register_trainee(p || jsonb_build_object('program_id', pr.id));
  assert (r->>'request')::boolean and r->>'ref' ~ '^SR-', 'تسجيل مبدئي لبرنامج بلا دفعة';
  assert r->'order' is null, 'لا طلب شراء قبل تحديد الدفعة';
  select * into q from program_requests where ref = r->>'ref';
  assert q.status = 'pending' and (select national_id from trainees where id = q.trainee_id) = '1999999971', 'الطلب محفوظ للمتدرب';
  begin perform register_trainee(p || jsonb_build_object('program_id', pr.id)); ok := false; exception when others then ok := true; end;
  assert ok, 'لا تكرار للطلب المعلّق نفسه';
  begin perform register_trainee(p || jsonb_build_object('program_id', pr.id, 'phone', '123')); ok := false; exception when others then ok := true; end;
  assert ok, 'الجوال يُتحقق منه';
  assert not has_function_privilege('anon', 'register_program_request(jsonb)', 'execute') and not has_function_privilege('anon', 'register_trainee_direct(jsonb)', 'execute'), 'الداخلية مغلقة';

  -- الإدارة فقط تنقل، وبعد فتح دفعة
  begin perform admin_place_requests(array[q.id]); ok := false; exception when others then ok := true; end;
  assert ok, 'النقل للمسؤول فقط';
  v_admin := gen_random_uuid(); insert into auth.users(id, email) values (v_admin, 'req-admin@test'); insert into admins(user_id, role) values (v_admin, 'staff');
  perform set_config('app.uid', v_admin::text, true);
  begin perform admin_place_requests(array[q.id]); ok := false; exception when others then ok := true; end;
  assert ok, 'لا نقل دون دفعة مفتوحة';
  perform open_cohort(jsonb_build_object('program_id', pr.id, 'start_date', d + 3, 'end_date', d + 10, 'seats', 20));
  r := admin_place_requests(array[q.id]);
  assert (r->>'placed')::int = 1, 'نُقل الطلب';
  select * into q from program_requests where id = q.id;
  assert q.status = 'placed' and q.enrollment_id is not null, 'الطلب مرتبط بالتسجيل';
  assert exists (select 1 from orders where enrollment_ids @> array[q.enrollment_id]), 'طلب شراء عند النقل';
  -- بعد فتح الدفعة: التسجيل مباشر بطلب شراء
  r := register_trainee(p || jsonb_build_object('program_id', pr.id, 'national_id', '1999999972', 'phone', '0557770072'));
  assert r->'order' is not null and coalesce((r->>'request')::boolean, false) = false, 'الدفعة المفتوحة: تسجيل مباشر';
  -- الإلغاء بسبب
  r := register_trainee(p || jsonb_build_object('program_id', (select id from programs where active and id <> pr.id and not exists (select 1 from cohorts c where c.program_id = programs.id and c.archived_at is null) limit 1)));
  begin perform admin_cancel_request((select id from program_requests where ref = r->>'ref'), ''); ok := false; exception when others then ok := true; end;
  assert ok, 'الإلغاء يحتاج سببًا';
  perform admin_cancel_request((select id from program_requests where ref = r->>'ref'), 'لا رغبة');
  assert (select status from program_requests where ref = r->>'ref') = 'cancelled', 'أُلغي';
  perform set_config('app.uid', '', true);
end $$;
