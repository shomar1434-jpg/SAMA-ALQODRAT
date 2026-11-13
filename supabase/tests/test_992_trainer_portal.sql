-- الخطوة U: ملف المدرب — يعدّله لنفسه فقط؛ النبذة لمتدربيه، ورابط القناة لمتدربي مقرراته وحدهم
\set ON_ERROR_STOP on
do $$
declare pd jsonb; ok boolean; pb text; pg text; x jsonb; tid uuid;
begin
  select t.phone into pb from trainees t join subscriptions s on s.trainee_id = t.id where s.section = 'boys' and 'كمي' = any(s.subjects) and s.status in ('pending','active') and t.phone ~ '^05' limit 1;
  pg := '0557770992';
  insert into trainees(national_id, full_name, phone, gender) values ('1999999939', 'متدربة اختبار الملف', pg, 'أنثى') returning id into tid;
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects, status, start_date, end_date) select 'SQ-TU992', tid, id, 'girls', subjects, 'active', riyadh_now()::date, riyadh_now()::date + 30 from plans where mode = 'in_person' limit 1;
  begin perform teacher_save_profile('{"bio":"x"}'); ok := false; exception when others then ok := true; end;
  assert ok, 'غير المدرب لا يحفظ ملفًا';
  perform set_config('app.phone', '0501009801', true);
  begin perform teacher_save_profile('{"bio":"نبذة","telegram":"http://evil.example/x"}'); ok := false; exception when others then ok := true; end;
  assert ok, 'رابط غير تيليجرام يُرفض';
  perform teacher_save_profile('{"bio":"مدرب كمي بخبرة عشر سنوات","telegram":"https://t.me/sama_quant_boys"}');
  assert (select bio from teachers where phone = '0501009801') = 'مدرب كمي بخبرة عشر سنوات', 'يُحفظ الملف';
  perform set_config('app.phone', pb, true); pd := portal_data('student');
  select y into x from jsonb_array_elements(pd->'teachers') y where y->>'full_name' = 'مدرب كمي بنين';
  assert x->>'bio' = 'مدرب كمي بخبرة عشر سنوات' and x->>'telegram' = 'https://t.me/sama_quant_boys' and not (x ? 'phone'), 'متدرب المقرر يرى النبذة ورابط القناة دون الجوال';
  perform set_config('app.phone', pg, true); pd := portal_data('student');
  assert not exists (select 1 from jsonb_array_elements(pd->'teachers') y where y ? 'telegram' and y->>'full_name' = 'مدرب كمي بنين'), 'رابط القناة لا يظهر لغير متدربي المدرب';
  perform set_config('app.phone', '', true);
end $$;
