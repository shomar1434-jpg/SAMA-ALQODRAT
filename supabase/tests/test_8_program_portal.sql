-- بوابة متدربي البرامج: دور المتدرب لمن سُجّل في برنامج، وبياناته المحصورة به (الدفعة والحضور والشهادة)
\set ON_ERROR_STOP on
do $$
declare v_p uuid; v_c uuid; v_t uuid; v_o uuid; v_e uuid; r jsonb; d date := riyadh_now()::date;
begin
  select id into v_p from programs order by code limit 1;
  update cohorts set archived_at = now() where program_id = v_p and archived_at is null;
  insert into cohorts(program_id, number, start_date, end_date, days) values (v_p, 99, d - 10, d + 10, '{0,1,2,3,4,5,6}') returning id into v_c;
  insert into trainees(national_id, full_name, phone, gender) values ('1999999991', 'سالم أحمد علي البركاتي', '0557770001', 'ذكر') returning id into v_t;
  insert into trainees(national_id, full_name, phone, gender) values ('1999999992', 'متدرب آخر للاختبار', '0557770002', 'ذكر') returning id into v_o;
  insert into enrollments(ref, cohort_id, program_id, trainee_id) values ('T-1', v_c, v_p, v_t) returning id into v_e;
  insert into enrollments(ref, cohort_id, program_id, trainee_id) values ('T-2', v_c, v_p, v_o);
  insert into attendance(enrollment_id, cohort_id, program_id, trainee_id, att_date) select v_e, v_c, v_p, v_t, d - k from generate_series(1, 4) k;

  perform set_config('app.phone', '0557770001', true);
  assert 'student' = any(portal_roles()), 'متدرب البرنامج له دور المتدرب دون اشتراك باقة';
  r := portal_data('student');
  assert jsonb_array_length(r->'enrollments') = 1 and jsonb_array_length(r->'attendance') = 4, 'تسجيله وحضوره';
  assert jsonb_array_length(r->'cohorts') = 1 and (r->'programs'->0->>'name') is not null, 'دفعته وبرنامجه';
  assert r->'settings' ? 'msg_low' and not (r->'settings' ? 'daily_secret'), 'رسائل التنبيه دون الأسرار';
  assert position('1999999992' in r::text) = 0 and position('متدرب آخر' in r::text) = 0, 'لا بيانات لمتدرب آخر في الدفعة';

  update enrollments set status = 'ملغى' where id = v_e;
  assert not ('student' = any(portal_roles())), 'التسجيل الملغى لا يمنح الدور';
  perform set_config('app.phone', '', true);
end $$;
