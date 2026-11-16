-- الخطوة A: إعادة التسجيل بسجل مدني موجود لا تستبدل الاسم ولا الجوال؛ الاختلاف طلب تحديث تراجعه الإدارة
\set ON_ERROR_STOP on
do $$
declare v_t uuid; v_p uuid; r jsonb; ok boolean; v_req uuid; v_admin uuid; n int;
  acc jsonb := (select coalesce(jsonb_agg(id), '[]') from current_policies(riyadh_now()::date) where requires_acceptance);   -- سياسة إلزامية من اختبار سابق
begin
  perform register_subscription(jsonb_build_object('birth_date','1995-01-01','national_id','1999999995','full_name','عبدالله محمد علي الشهري','phone','0551110000','gender','ذكر',
     'plan_id',(select id from plans where tier='basic' and mode='in_person'),'accepted_policies',acc));
  select id into v_t from trainees where national_id = '1999999995';
  select program_id into v_p from cohorts where number = 99 and archived_at is null limit 1;

  -- شخص آخر يعرف السجل المدني يسجّل بجواله واسم مختلف وبريد جديد
  perform register_trainee(jsonb_build_object('birth_date','1995-01-01','national_id','1999999995','full_name','منتحل الشخصية','phone','0559990000','email','x@y.com','program_id',v_p,'accepted_policies',acc));
  assert (select phone from trainees where id = v_t) = '0551110000', 'الجوال المعتمد لم يتغير';
  assert (select full_name from trainees where id = v_t) = 'عبدالله محمد علي الشهري', 'الاسم المعتمد لم يتغير';
  assert (select email from trainees where id = v_t) = 'x@y.com', 'الحقل الفارغ سابقًا يُكمَّل';
  assert exists (select 1 from enrollments where trainee_id = v_t and program_id = v_p), 'التسجيل أُضيف إلى الملف نفسه';
  assert (select count(*) from trainees where national_id = '1999999995') = 1, 'لا ملف مكرر';
  select id into v_req from profile_change_requests where trainee_id = v_t and status = 'pending';
  assert v_req is not null and (select changes ? 'phone' and changes ? 'full_name' and not (changes ? 'email') from profile_change_requests where id = v_req), 'طلب تحديث بالفروق فقط';

  -- الجوال الجديد لا يفتح البوابة
  perform set_config('app.phone', '0559990000', true);
  assert not ('student' = any(portal_roles())), 'لا دور متدرب للجوال غير المعتمد';
  perform set_config('app.phone', '', true);

  -- الإدارة فقط تبت في الطلب
  perform set_config('app.uid', '', true);
  begin perform resolve_profile_change(v_req, true); ok := false; exception when others then ok := sqlerrm like '%غير مصرح%'; end;
  assert ok, 'البت للإدارة فقط';
  select user_id into v_admin from admins limit 1; perform set_config('app.uid', v_admin::text, true);
  perform resolve_profile_change(v_req, false);
  assert (select phone from trainees where id = v_t) = '0551110000' and (select status from profile_change_requests where id = v_req) = 'rejected', 'الرفض يُبقي الملف';

  -- طلب صادق: قبوله يطبّق الجوال الجديد، وتعديل الإدارة المباشر لا يمر بالحارس
  perform set_config('app.uid', '', true);
  perform register_subscription(jsonb_build_object('birth_date','1995-01-01','national_id','1999999995','full_name','عبدالله محمد علي الشهري','phone','0552220000','gender','ذكر','plan_id',(select id from plans where tier='silver' and mode='in_person'),'accepted_policies',acc));
  select count(*) into n from profile_change_requests where trainee_id = v_t and status = 'pending';
  assert n = 1, 'طلب جديد واحد';
  perform set_config('app.uid', v_admin::text, true);
  perform resolve_profile_change((select id from profile_change_requests where trainee_id = v_t and status = 'pending'), true);
  assert (select phone from trainees where id = v_t) = '0552220000', 'القبول يطبّق التغيير';
  update trainees set city = 'صبيا' where id = v_t;
  assert (select city from trainees where id = v_t) = 'صبيا', 'تعديل الإدارة المباشر يمر';
  perform set_config('app.uid', '', true);
end $$;

-- الخطوة B: باقات الثانوية دون تاريخ ميلاد، لكن جوال ولي الأمر إلزامي؛ برامج الأطفال تظل مرتبطة بالعمر
do $$
declare d date := riyadh_now()::date; ok boolean; v_t uuid; minor date := (riyadh_now()::date - interval '16 years')::date;
        base jsonb := jsonb_build_object('national_id','1999999970','full_name','ريان سعد علي القرني','phone','0553330001','gender','ذكر',
          'plan_id',(select id from plans where tier='basic' and mode='in_person'),
          'accepted_policies',(select coalesce(jsonb_agg(id), '[]') from current_policies(riyadh_now()::date) where requires_acceptance));
begin
  begin perform register_subscription(base); ok := false; exception when others then ok := sqlerrm like '%جوال ولي الأمر مطلوب%'; end;
  assert ok, 'باقات الثانوية تتطلب جوال ولي الأمر دون طلب تاريخ الميلاد';
  begin perform register_subscription(base || jsonb_build_object('birth_date', minor)); ok := false; exception when others then ok := sqlerrm like '%جوال ولي الأمر مطلوب%'; end;
  assert ok, 'جوال ولي الأمر إلزامي دون 19';
  assert age_on((d - interval '19 years')::date, d) = 19 and age_on((d - interval '19 years' + interval '1 day')::date, d) = 18, 'حد العمر 19';
  perform register_subscription(base || jsonb_build_object('birth_date', minor, 'guardian_phone', '0509990001'));
  select id into v_t from trainees where national_id = '1999999970';
  assert (select guardian_phone from trainees where id = v_t) = '0509990001', 'حفظ جوال ولي الأمر عند أول تسجيل';
  -- إعادة تسجيل بجوال ولي أمر آخر: لا يُستبدل، بل طلب تحديث
  perform register_trainee(base - 'plan_id' || jsonb_build_object('birth_date', minor, 'guardian_phone', '0509996666',
    'program_id', (select c.program_id from cohorts c where c.reg_open and c.archived_at is null and c.end_date >= d limit 1)));
  assert (select guardian_phone from trainees where id = v_t) = '0509990001', 'جوال ولي الأمر المعتمد لا يُستبدل';
  assert exists (select 1 from profile_change_requests where trainee_id = v_t and status = 'pending' and changes->'guardian_phone'->>'new' = '0509996666'), 'طلب تحديث لجوال ولي الأمر';
  -- بالغ بلا ولي أمر مسجّل سابقًا: لا يُكمَّل الحقل الفارغ تلقائيًا
  assert (select guardian_phone from trainees where national_id = '1999999995') is null, 'البالغ بلا جوال ولي أمر';
end $$;

-- برامج الأطفال: يُقبل عمر 3 سنوات، وجوال التواصل هو جوال ولي الأمر؛ ودون 3 يُرفض
do $$
declare d date := riyadh_now()::date; ok boolean;
begin
  assert reg_guardian(jsonb_build_object('birth_date', (d - interval '4 years')::date, 'phone', '0552220001')) = '0552220001', 'الطفل: جوال التواصل هو جوال ولي الأمر';
  assert reg_guardian(jsonb_build_object('birth_date', (d - interval '4 years')::date, 'phone', '0552220001', 'guardian_phone', '0552220002')) = '0552220002', 'جوال ولي أمر مستقل يُعتمد';
  begin perform reg_guardian(jsonb_build_object('birth_date', (d - interval '2 years')::date, 'phone', '0552220001')); ok := false; exception when others then ok := sqlerrm like '%غير صحيح%'; end;
  assert ok, 'دون 3 سنوات يُرفض';
  begin perform reg_guardian(jsonb_build_object('birth_date', (d - interval '15 years')::date, 'phone', '0552220001')); ok := false; exception when others then ok := sqlerrm like '%جوال ولي الأمر مطلوب%'; end;
  assert ok, 'من 13 إلى 18: جوال ولي الأمر يُكتب صراحة';
end $$;
