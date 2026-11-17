-- الخطوة BC: الجدول الثابت يولّد المحاضرات، وبثوث القناة تُسند بالموعد ووسم المدرب، والمتدرب لا يرى قاعة Zoom
\set ON_ERROR_STOP on
do $$
declare v_adm uuid := gen_random_uuid(); t1 uuid; t2 uuid; s1 uuid; r jsonb; d date := riyadh_now()::date; n int; l1 uuid; l2 uuid; ok boolean; x jsonb;
begin
  insert into auth.users(id, email) values (v_adm, 'bc-full@test'); insert into admins(user_id, role, name) values (v_adm, 'full', 'مدير');
  insert into teachers(full_name, phone, section, subjects) values ('مدرب القناة', '0501008881', 'boys', '{كمي}') returning id into t1;
  insert into teachers(full_name, phone, section, subjects) values ('مدرب ثان', '0501008882', 'boys', '{كمي}') returning id into t2;
  perform set_config('app.uid', v_adm::text, true);
  begin perform admin_set_teacher_studio(t1, 'https://evil.example/j/1', ''); ok := false; exception when others then ok := sqlerrm like '%Zoom%'; end;
  assert ok, 'رابط Zoom غير صحيح مرفوض';
  perform admin_set_teacher_studio(t1, 'https://us06web.zoom.us/j/81234567890?pwd=abc', 'أ. القناة');
  begin perform admin_save_slot(jsonb_build_object('teacher_id', t1, 'title', 'لفظي خارج النطاق', 'subject', 'لفظي', 'dow', '[0,1,2,3,4,5,6]'::jsonb, 'start_time', '10:00', 'minutes', 60)); ok := false;
  exception when others then ok := sqlerrm like '%خارج نطاق%'; end;
  assert ok, 'مقرر خارج نطاق المدرب مرفوض';
  -- أيام بلا جلسة للقسم تُتخطى: نجعل كل الأيام أيام جلسة في القالب للاختبار
  insert into schedule_templates(section, dow, start_time, end_time) select 'boys', g, '09:00', '13:00' from generate_series(0,6) g where not exists (select 1 from schedule_templates where section = 'boys' and dow = g);
  delete from schedule_exceptions where section in ('boys','all') and date between d and d + 8;
  s1 := (admin_save_slot(jsonb_build_object('teacher_id', t1, 'title', 'شرح الكمي اليومي', 'subject', 'كمي', 'dow', '[0,1,2,3,4,5,6]'::jsonb, 'start_time', '10:00', 'minutes', 60))->>'id')::uuid;
  perform admin_save_slot(jsonb_build_object('teacher_id', t2, 'title', 'مراجعة الكمي', 'subject', 'كمي', 'dow', '[0,1,2,3,4,5,6]'::jsonb, 'start_time', '10:00', 'minutes', 60));
  select count(*) into n from lectures where slot_id = s1;
  assert n between 1 and 8, 'وُلّدت محاضرات الجدول: ' || n;
  assert ensure_lectures(d, 8) = 0, 'لا تكرار عند إعادة التوليد';
  select id into l1 from lectures where slot_id = s1 order by starts_at limit 1;
  select l.id into l2 from lectures l join lecture_slots s on s.id = l.slot_id where s.teacher_id = t2 and l.starts_at = (select starts_at from lectures where id = l1);
  -- بثان في الوقت نفسه: يُسند الموسوم لمدربه، والآخر يبقى للإسناد اليدوي (مرشحان بلا وسم)
  r := yt_upsert_videos(jsonb_build_array(
    jsonb_build_object('video_id', 'AAAAAAAAAA1', 'title', 'بث أ. القناة', 'privacy', 'unlisted', 'life_cycle', 'live', 'actual_start', (select starts_at + interval '2 minutes' from lectures where id = l1)),
    jsonb_build_object('video_id', 'BBBBBBBBBB2', 'title', 'بث آخر', 'privacy', 'unlisted', 'life_cycle', 'live', 'actual_start', (select starts_at + interval '3 minutes' from lectures where id = l1)),
    jsonb_build_object('video_id', 'bad'), jsonb_build_object('video_id', 'CCCCCCCCCC3', 'title', 'قديم', 'actual_start', now() - interval '30 days')), 'UCabcdefghijklmnopqrstuv', 'قناة المركز');
  assert (r->>'videos')::int = 3, 'المعرّف غير الصالح يُتجاهل';
  assert (select youtube_id from lectures where id = l1) = 'AAAAAAAAAA1', 'البث الموسوم أُسند لمحاضرة مدربه';
  assert (select youtube_id from lectures where id = l2) = 'BBBBBBBBBB2', 'البث الآخر أُسند للمحاضرة الباقية الوحيدة';
  assert (select yt_channel_id from settings where id = 1) = 'UCabcdefghijklmnopqrstuv', 'معرّف القناة محفوظ';
  perform admin_assign_video('BBBBBBBBBB2', null);
  assert (select youtube_id from lectures where id = l2) = '' and (select lecture_id from yt_videos where video_id = 'BBBBBBBBBB2') is null, 'فك الإسناد يدويًا';
  perform admin_assign_video('CCCCCCCCCC3', l2);
  assert (select youtube_id from lectures where id = l2) = 'CCCCCCCCCC3', 'إسناد يدوي';
  x := admin_studio_data();
  assert jsonb_array_length(x->'slots') = 2 and jsonb_array_length(x->'videos') = 3 and (x->>'linked')::boolean = false, 'بيانات صفحة الاستوديو';
  -- البوابات
  perform set_config('app.uid', '', true); perform set_config('app.phone', '0501008881', true);
  x := portal_data('teacher');
  assert x->>'zoom_url' like 'https://us06web.zoom.us/%' and jsonb_array_length(x->'slots') = 1, 'المدرب يرى قاعته وجدوله';
  perform register_subscription(jsonb_build_object('national_id','1904761325','full_name','بدر سعد علي القرني','phone','0557776661','gender','ذكر','plan_id',(select id from plans where tier='basic' and mode='in_person'),'accepted_policies',(select coalesce(jsonb_agg(id), '[]') from current_policies(d) where requires_acceptance)));
  update subscriptions set subjects = '{كمي,لفظي}', status = 'active' where trainee_id = (select id from trainees where national_id = '1904761325');
  perform set_config('app.phone', '0557776661', true);
  x := portal_data('student');
  assert x->>'yt_channel' = 'UCabcdefghijklmnopqrstuv', 'المتدرب يرى معرّف القناة';
  assert x::text not like '%zoom.us%', 'المتدرب لا يرى قاعة Zoom';
  assert jsonb_array_length(x->'lectures') >= 2, 'المتدرب يرى محاضرات الجدول';
  -- ربط القناة للمالك وحده
  perform set_config('app.phone', '', true); perform set_config('app.uid', v_adm::text, true);
  begin perform yt_begin_link('https://example.com/admin/'); ok := false; exception when others then ok := sqlerrm like '%للمالك%'; end;
  assert ok, 'مدير النظام لا يربط القناة';
  perform set_config('app.uid', '', true);
end $$;
