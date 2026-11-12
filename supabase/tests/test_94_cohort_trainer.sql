-- الخطوة P: مدرب الدفعة يرى كشفها وحضورها (أسماء فقط)، وغيره لا يراها، ويصله تنبيه بدء المحاضرة مرة واحدة
\set ON_ERROR_STOP on
do $$
declare d date := riyadh_now()::date; st time := (riyadh_now() + interval '5 minutes')::time; r jsonb; t1 uuid; t2 uuid; c cohorts%rowtype; n int; v_tr uuid; v_e uuid;
begin
  if st < '00:10' then return; end if;
  insert into teachers(full_name, phone, section, subjects) values ('مدرب البرنامج', '0501007771', 'boys', '{}') returning id into t1;
  insert into teachers(full_name, phone, section, subjects) values ('مدرب آخر', '0501007772', 'boys', '{}') returning id into t2;
  select * into c from cohorts where archived_at is null order by start_date limit 1;
  insert into trainees(national_id, full_name, phone, gender) values ('1999999954', 'هاني وليد علي الغامدي', '0557770054', 'ذكر') returning id into v_tr;
  insert into enrollments(trainee_id, cohort_id, program_id, ref) values (v_tr, c.id, c.program_id, 'T-P-54') returning id into v_e;
  update cohorts set teacher_id = t1, start_date = d - 1, end_date = d + 5, days = '{0,1,2,3,4,5,6}', start_time = st, end_time = st + interval '1 hour' where id = c.id;
  update settings set soon_minutes = 10 where id = 1;

  perform set_config('app.phone', '0501007771', true);
  r := portal_data('teacher');
  assert jsonb_array_length(r->'cohorts') = 1 and (r->'cohorts'->0->>'id')::uuid = c.id, 'المدرب يرى دفعته';
  assert exists (select 1 from jsonb_array_elements(r->'cohort_trainees') x where x->>'full_name' = 'هاني وليد علي الغامدي'), 'كشف الدفعة';
  assert position('1999999954' in (r->'cohort_trainees')::text) = 0 and position('0557770054' in (r->'cohort_trainees')::text) = 0, 'أسماء فقط دون السجل المدني والجوال';
  perform set_config('app.phone', '0501007772', true);
  r := portal_data('teacher');
  assert jsonb_array_length(r->'cohorts') = 0 and jsonb_array_length(r->'cohort_trainees') = 0, 'مدرب آخر لا يرى الدفعة';
  perform set_config('app.phone', '', true);

  perform run_session_reminders();
  select count(*) into n from notifications where "to" = 'teacher' and teacher_id = t1 and kind = 'session_soon';
  assert n = 1, 'تنبيه بدء المحاضرة لمدرب الدفعة';
  perform run_session_reminders();
  assert (select count(*) from notifications where "to" = 'teacher' and teacher_id = t1 and kind = 'session_soon') = 1, 'دون تكرار';

  -- إعادة الحال
  delete from notifications where teacher_id in (t1, t2) or trainee_id = v_tr or dedupe_key like '%:c:' || c.id;
  delete from enrollments where id = v_e; delete from trainees where id = v_tr;
  update cohorts set teacher_id = null, start_date = c.start_date, end_date = c.end_date, days = c.days, start_time = c.start_time, end_time = c.end_time where id = c.id;
  delete from teachers where id in (t1, t2);
end $$;
