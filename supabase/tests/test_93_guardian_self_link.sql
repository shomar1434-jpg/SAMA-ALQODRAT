-- الخطوة C: ربط ولي الأمر الذاتي — الشروط الثلاثة، والرسالة الموحدة، وحد المحاولات، ومنع إعادة الملغى
\set ON_ERROR_STOP on
do $$
declare d date := riyadh_now()::date; r jsonb; ok boolean; v_t uuid; i int;
begin
  perform register_subscription(jsonb_build_object('national_id','1999999962','full_name','تميم ناصر علي العتيبي','phone','0554440001','gender','ذكر',
    'birth_date', (d - interval '15 years')::date, 'guardian_phone','0508880001',
    'plan_id',(select id from plans where tier='basic' and mode='in_person'),
    'accepted_policies',(select coalesce(jsonb_agg(id), '[]') from current_policies(d) where requires_acceptance)));
  select id into v_t from trainees where national_id = '1999999962';

  -- جوال مصرَّح به يدخل بوابة ولي الأمر قبل الربط، ولا يرى بيانات
  perform set_config('app.phone', '0508880001', true);
  assert 'guardian' = any(portal_roles()), 'الجوال المصرَّح به يدخل بوابة ولي الأمر';
  assert jsonb_array_length(coalesce(portal_data('guardian')->'trainees','[]')) = 0, 'لا بيانات قبل الربط';
  r := guardian_self_link('1000000008');
  assert not (r->>'ok')::boolean, 'سجل مدني لمتدرب آخر: رفض';
  r := guardian_self_link('1999999962');
  assert (r->>'ok')::boolean and exists (select 1 from guardian_links where trainee_id = v_t and guardian_phone = '0508880001' and status = 'verified' and source = 'self'), 'الربط الذاتي';
  assert jsonb_array_length(portal_data('guardian')->'trainees') = 1, 'يرى ابنه بعد الربط';
  r := guardian_self_link('1999999962');
  assert (r->>'already')::boolean and (select count(*) from guardian_links where trainee_id = v_t) = 1, 'لا تكرار للرابط';

  -- جوال آخر يعرف السجل المدني: لا يكفي
  perform set_config('app.phone', '0508889999', true);
  r := guardian_self_link('1999999962');
  assert not (r->>'ok')::boolean and not exists (select 1 from guardian_links where guardian_phone = '0508889999'), 'معرفة السجل المدني وحدها لا تكفي';
  for i in 1..4 loop perform guardian_self_link('1999999962'); end loop;
  begin perform guardian_self_link('1999999962'); ok := false; exception when others then ok := sqlerrm like '%تجاوزت عدد المحاولات%'; end;
  assert ok, 'قفل بعد 5 محاولات فاشلة في الساعة';
  assert not exists (select 1 from guardian_link_attempts where nid_hash like '%1999999962%'), 'السجل المدني مجزّأ في سجل المحاولات';

  -- ما ألغته الإدارة لا يُعاد ذاتيًا
  update guardian_links set status = 'revoked', revoked_at = now() where trainee_id = v_t;
  perform set_config('app.phone', '0508880001', true);
  r := guardian_self_link('1999999962');
  assert not (r->>'ok')::boolean and not exists (select 1 from guardian_links where trainee_id = v_t and status = 'verified'), 'الرابط الملغى لا يُعاد ذاتيًا';
  perform set_config('app.phone', '', true);
end $$;
