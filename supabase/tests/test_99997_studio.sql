-- الخطوة AZ: استوديو البث — نطاق المدرب، وإرسال معرّف يوتيوب للمتدرب في نافذته فقط، ولا يراه قسم آخر
\set ON_ERROR_STOP on
do $$
declare t1 uuid; t2 uuid; r jsonb; ok boolean; d date := riyadh_now()::date; v_live uuid; v_soon uuid; v_old uuid; v_norec uuid; x jsonb;
begin
  insert into teachers(full_name, phone, section, subjects) values ('مدرب البث', '0501007771', 'boys', '{كمي}') returning id into t1;
  insert into teachers(full_name, phone, section, subjects) values ('مدربة البث', '0501007772', 'girls', '{كمي}') returning id into t2;
  perform register_subscription(jsonb_build_object('national_id','1963316649','full_name','سلمان سعد علي الحارثي','phone','0557774441','gender','ذكر','plan_id',(select id from plans where tier='basic' and mode='in_person'),'accepted_policies',(select coalesce(jsonb_agg(id), '[]') from current_policies(d) where requires_acceptance)));
  perform register_subscription(jsonb_build_object('national_id','1948553324','full_name','هند سعد علي الحارثي','phone','0557774442','gender','أنثى','plan_id',(select id from plans where tier='basic' and mode='in_person'),'accepted_policies',(select coalesce(jsonb_agg(id), '[]') from current_policies(d) where requires_acceptance)));
  update subscriptions set subjects = '{كمي,لفظي}' where trainee_id in (select id from trainees where national_id in ('1963316649','1948553324'));
  perform set_config('app.phone', '0501007771', true);
  begin perform teacher_save_lecture(jsonb_build_object('title','خارج النطاق','subject','لفظي','starts_at',now(),'minutes',60)); ok := false; exception when others then ok := sqlerrm like '%خارج نطاقك%'; end;
  assert ok, 'لا محاضرة لمقرر خارج نطاق المدرب';
  begin perform teacher_save_lecture(jsonb_build_object('title','رابط خاطئ','subject','كمي','starts_at',now(),'minutes',60,'youtube_id','bad')); ok := false; exception when others then ok := sqlerrm like '%يوتيوب%'; end;
  assert ok, 'معرّف يوتيوب غير صالح مرفوض';
  v_live := (teacher_save_lecture(jsonb_build_object('title','مباشر الآن','subject','كمي','starts_at',now() - interval '5 minutes','minutes',60,'youtube_id','AbCdEfGhIjK'))->>'id')::uuid;
  v_soon := (teacher_save_lecture(jsonb_build_object('title','بعد يومين','subject','كمي','starts_at',now() + interval '2 days','minutes',60,'youtube_id','ZyXwVuTsRqP'))->>'id')::uuid;
  v_old := (teacher_save_lecture(jsonb_build_object('title','مسجلة','subject','كمي','starts_at',now() - interval '3 days','minutes',60,'youtube_id','OldRecordng'))->>'id')::uuid;
  v_norec := (teacher_save_lecture(jsonb_build_object('title','بلا تسجيل','subject','كمي','starts_at',now() - interval '2 days','minutes',60,'youtube_id','NoRecording','recording',false))->>'id')::uuid;
  assert jsonb_array_length(portal_data('teacher')->'lectures') = 4, 'المدرب يرى محاضراته';
  perform set_config('app.phone', '0557774441', true);
  x := portal_data('student')->'lectures';
  assert jsonb_array_length(x) = 4, 'المتدرب يرى محاضرات مقرره وقسمه';
  assert (select e->>'youtube_id' from jsonb_array_elements(x) e where e->>'id' = v_live::text) = 'AbCdEfGhIjK', 'معرّف البث المباشر يصل';
  assert (select e->>'youtube_id' from jsonb_array_elements(x) e where e->>'id' = v_soon::text) is null, 'لا معرّف للقادمة قبل نافذتها';
  assert (select e->>'youtube_id' from jsonb_array_elements(x) e where e->>'id' = v_old::text) = 'OldRecordng', 'التسجيل المتاح يصل';
  assert (select e->>'youtube_id' from jsonb_array_elements(x) e where e->>'id' = v_norec::text) is null, 'التسجيل غير المتاح لا يصل';
  perform set_config('app.phone', '0557774442', true);
  assert jsonb_array_length(coalesce(portal_data('student')->'lectures','[]')) = 0, 'قسم آخر لا يرى محاضرات مدرب البنين';
  perform set_config('app.phone', '0501007772', true);
  begin perform teacher_set_lecture(v_live, 'cancelled'); ok := false; exception when others then ok := sqlerrm like '%غير مصرح%'; end;
  assert ok, 'مدرب آخر لا يلغي';
  perform set_config('app.phone', '0501007771', true);
  perform teacher_set_lecture(v_live, 'ended');
  assert (select status from lectures where id = v_live) = 'ended' and exists (select 1 from audit_logs where action = 'lectures.update' and entity = v_live::text), 'الإنهاء مسجّل';
  perform set_config('app.phone', '', true);
end $$;
