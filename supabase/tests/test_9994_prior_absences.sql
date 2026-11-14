-- الخطوة AG: جلسات ما قبل المنصة تُحتسب حضورًا إلا أيام الغياب المدخلة من الكشوف اليدوية
\set ON_ERROR_STOP on
do $$
declare v_t uuid; v_s uuid; v_admin uuid := gen_random_uuid(); st jsonb; pr int; ok boolean; d date := riyadh_now()::date;
begin
  insert into trainees(national_id, full_name, phone, gender) values ('1999999944', 'سالم ناصر علي القحطاني', '0557779944', 'ذكر') returning id into v_t;
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects, status, start_date, end_date, track_from, start_manual)
    select 'SQ-PA9994', v_t, id, 'boys', subjects, 'active', d - 70, sub_end(id, d - 70), d, true from plans where tier = 'gold' and mode = 'in_person' returning id into v_s;
  pr := sub_prior_sessions(v_s);
  st := sub_stats(v_s);
  assert pr > 0 and (st->>'prior')::int = pr, 'جلسات ما قبل المنصة محسوبة';
  assert (st->>'attended')::int = pr and (st->>'absent')::int = 0 and (st->>'rate')::int = 100, 'تُحتسب حضورًا افتراضيًا';
  insert into auth.users(id, email) values (v_admin, 'pa-admin@test'); insert into admins(user_id, role) values (v_admin, 'staff');
  perform set_config('app.uid', v_admin::text, true);
  perform admin_save_subscription(jsonb_build_object('id', v_s, 'plan_id', (select plan_id from subscriptions where id = v_s), 'section', 'boys', 'start_date', d - 70, 'prior_absences', 3));
  st := sub_stats(v_s);
  assert (st->>'priorAbsences')::int = 3 and (st->>'attended')::int = pr - 3 and (st->>'absent')::int = 3, 'أيام الغياب السابقة تُخصم من الحضور';
  assert (select track_from from subscriptions where id = v_s) = d, 'تاريخ التتبع لم يتغير بالحفظ';
  begin perform admin_save_subscription(jsonb_build_object('id', v_s, 'plan_id', (select plan_id from subscriptions where id = v_s), 'section', 'boys', 'start_date', d - 70, 'prior_absences', pr + 1)); ok := false; exception when others then ok := true; end;
  assert ok, 'لا يتجاوز عدد جلسات الفترة';
  perform set_config('app.uid', '', true);
  begin perform admin_save_subscription(jsonb_build_object('id', v_s, 'prior_absences', 1)); ok := false; exception when others then ok := true; end;
  assert ok, 'للإدارة فقط';
end $$;
