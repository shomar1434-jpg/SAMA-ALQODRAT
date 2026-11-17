-- اختبارات مركز السياسات: النشر بإصدار، وثبات المنشور، وإلزام القبول عند التسجيل وتوثيقه
\set ON_ERROR_STOP on
do $$
declare v_admin uuid; v_d uuid; v_p1 uuid; v_p2 uuid; r jsonb; ok boolean; d date := riyadh_now()::date;
  v_nid text := '1000000099'; person jsonb;
begin
  assert (select count(*) from policies where status = 'draft' and slug in ('privacy','terms')) = 2, 'ترحيل BG: مسودتا الخصوصية والشروط';
  delete from policies where status = 'draft' and slug = 'privacy';   -- يبدأ الاختبار بلا مسودة للخصوصية
  -- لا نشر لغير الإدارة
  insert into policies(slug, title, body, effective_date, requires_acceptance) values ('privacy', 'سياسة الخصوصية', 'نص سياسة الخصوصية المعتمد للاختبار', d, true) returning id into v_d;
  perform set_config('app.uid', '', true);
  begin perform publish_policy(v_d); ok := false; exception when others then ok := sqlerrm like '%غير مصرح%'; end;
  assert ok, 'النشر للإدارة فقط';

  select user_id into v_admin from admins limit 1; perform set_config('app.uid', v_admin::text, true);
  begin perform publish_policy(v_d); ok := false; exception when others then ok := sqlerrm like '%جهة الاعتماد%'; end;
  assert ok, 'لا نشر دون جهة اعتماد';
  update policies set approved_by = 'مدير المركز', body = body || ' - يُكمل من الإدارة' where id = v_d;
  begin perform publish_policy(v_d); ok := false; exception when others then ok := sqlerrm like '%أكمل الأقسام%'; end;
  assert ok, 'لا نشر بنص ناقص';
  update policies set body = 'نص سياسة الخصوصية المعتمد للاختبار' where id = v_d;
  r := publish_policy(v_d); v_p1 := v_d;
  assert (r->>'version')::int = 1, 'الإصدار الأول';
  begin update policies set body = body || ' تعديل' where id = v_p1; ok := false; exception when others then ok := sqlerrm like '%لا تُعدَّل%'; end;
  assert ok, 'المنشور ثابت';
  begin delete from policies where id = v_p1; ok := false; exception when others then ok := true; end;
  assert ok, 'المنشور لا يُحذف';

  -- إصدار ثانٍ يسري غدًا: الساري اليوم يبقى الأول
  insert into policies(slug, title, body, effective_date, approved_by, requires_acceptance) values ('privacy', 'سياسة الخصوصية', 'نص الإصدار الثاني من سياسة الخصوصية', d + 1, 'مدير المركز', true) returning id into v_p2;
  assert (publish_policy(v_p2)->>'version')::int = 2, 'الإصدار الثاني';
  assert (select id from current_policies(d) where slug = 'privacy') = v_p1, 'الساري اليوم هو الأول';
  assert (select id from current_policies(d + 1) where slug = 'privacy') = v_p2, 'الثاني يسري من تاريخه';
  assert jsonb_array_length(public_policies()) = 2, 'السجل العام يعرض الإصدارات المنشورة';
  perform set_config('app.uid', '', true);

  -- التسجيل يلزمه قبول الإصدار الساري
  person := jsonb_build_object('birth_date','1995-01-01','national_id', v_nid, 'full_name', 'فهد سعد علي الزهراني', 'phone', '0559998877', 'gender', 'ذكر', 'city', 'جازان', 'education', 'ثانوي',
     'plan_id', (select id from plans where tier = 'basic' and mode = 'in_person'));
  begin perform register_subscription(person); ok := false; exception when others then ok := sqlerrm like '%يلزم قبول%'; end;
  assert ok, 'رفض التسجيل دون قبول';
  assert not exists (select 1 from trainees where national_id = v_nid), 'لا يُنشأ متدرب عند الرفض';
  begin perform register_subscription(person || jsonb_build_object('accepted_policies', jsonb_build_array(v_p2))); ok := false; exception when others then ok := true; end;
  assert ok, 'قبول إصدار غير ساري لا يكفي';
  r := register_subscription(person || jsonb_build_object('accepted_policies', jsonb_build_array(v_p1)));
  assert (r->>'ok')::boolean, 'التسجيل بعد القبول';
  assert exists (select 1 from policy_acceptances a join trainees t on t.id = a.trainee_id where t.national_id = v_nid and a.policy_id = v_p1 and a.context = 'subscription'), 'توثيق القبول';
end $$;
