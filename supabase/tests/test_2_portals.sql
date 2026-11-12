-- اختبارات البوابات: الأدوار من الجوال الموثّق، وحصر البيانات، وإشعارات المدرب
\set ON_ERROR_STOP on
do $$
declare r jsonb; ok boolean; v_t uuid; v_g uuid; v_other uuid; d date := riyadh_now()::date;
begin
  -- متدرب البنين المشترك من test_qudurat (1000000008) وجواله 0551112233
  select id into v_t from trainees where national_id = '1000000008';
  insert into teachers(full_name, phone, section, subjects) values ('خالد يحيى الحكمي', '0501000003', 'boys', '{كمي}'), ('هدى النعمي', '0501000001', 'girls', '{كمي}');
  select id into v_other from trainees where national_id = '1000000016';   -- طالبة في قسم البنات

  -- بلا هوية: لا أدوار ولا بيانات
  perform set_config('app.phone', '', true);
  begin perform portal_data('student'); ok := false; exception when others then ok := true; end; assert ok, 'لا بيانات بلا هوية';

  -- المتدرب يرى نفسه فقط
  perform set_config('app.phone', '+966551112233', true);
  assert 'student' = any(portal_roles()), 'دور المتدرب من الجوال';
  r := portal_data('student');
  assert jsonb_array_length(r->'trainees') = 1 and (r->'trainees'->0->>'id')::uuid = v_t, 'المتدرب يرى سجله فقط';
  assert not (r->'trainees'->0 ? 'national_id') and not (r->'trainees'->0 ? 'phone'), 'لا يُعاد السجل المدني أو الجوال';
  begin perform portal_data('teacher'); ok := false; exception when others then ok := true; end; assert ok, 'المتدرب لا يدخل بوابة المدرب';

  -- المدرب: قسمه ومقرره فقط
  perform set_config('app.phone', '0501000003', true);
  r := portal_data('teacher');
  assert exists (select 1 from jsonb_array_elements(r->'trainees') x where (x->>'id')::uuid = v_t), 'مدرب البنين يرى طالبه';
  assert not exists (select 1 from jsonb_array_elements(r->'trainees') x where (x->>'id')::uuid = v_other), 'مدرب البنين لا يرى طالبات البنات';
  begin perform teacher_notify(jsonb_build_object('trainee_id', v_other, 'to', 'student', 'kind', 'reminder')); ok := false; exception when others then ok := sqlerrm like '%ليس ضمن متدربيك%'; end;
  assert ok, 'المدرب لا يراسل طالبًا خارج نطاقه';
  begin perform teacher_notify(jsonb_build_object('trainee_id', v_t, 'to', 'guardian', 'kind', 'absence')); ok := false; exception when others then ok := sqlerrm like '%ولي أمر موثّق%'; end;
  assert ok, 'لا إشعار لولي أمر غير موثّق';
  r := teacher_notify(jsonb_build_object('trainee_id', v_t, 'to', 'student', 'kind', 'reminder'));
  r := teacher_notify(jsonb_build_object('trainee_id', v_t, 'to', 'student', 'kind', 'reminder'));
  assert (r->>'duplicate')::boolean and (select count(*) from notifications where trainee_id = v_t and kind = 'reminder') = 1, 'لا تكرار للتذكير في اليوم';

  -- ولي الأمر: علاقة موثّقة فقط
  perform set_config('app.phone', '0507776655', true);
  begin perform portal_data('guardian'); ok := false; exception when others then ok := true; end; assert ok, 'لا وصول لولي أمر بلا رابط';
  insert into guardian_links(guardian_name, guardian_phone, trainee_id, relation) values ('أحمد الشهري', '0507776655', v_t, 'الأب');
  r := portal_data('guardian');
  assert jsonb_array_length(r->'trainees') = 1 and (r->'trainees'->0->>'id')::uuid = v_t, 'ولي الأمر يرى ابنه فقط';
  update guardian_links set status = 'revoked' where guardian_phone = '0507776655';
  begin perform portal_data('guardian'); ok := false; exception when others then ok := true; end; assert ok, 'إلغاء الرابط يمنع الوصول فورًا';
  perform set_config('app.phone', '', true);
end $$;
