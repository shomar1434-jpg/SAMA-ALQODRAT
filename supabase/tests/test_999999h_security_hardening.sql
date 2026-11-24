-- الخطوة BT: حد محاولات التحضير، والاسم الأول عند النجاح، وإغلاق التحقق والأرشفة على غير المسؤولين
\set ON_ERROR_STOP on
do $$
declare r jsonb; i int; staff uuid := gen_random_uuid();
begin
  perform set_config('app.uid', '', true);
  -- 15 محاولة فاشلة من جهاز واحد ثم يُرفض بلا تحقق
  for i in 1..15 loop r := checkin('1999999999', null, null, 'dev-brute', null); assert not (r->>'ok')::boolean, 'رقم غير موجود: ' || r::text; end loop;
  r := checkin('1999999999', null, null, 'dev-brute', null);
  assert r->>'reason' = 'rate_limited', 'الحد بعد 15 محاولة فاشلة: ' || r::text;
  assert (select count(*) from checkin_attempts where device = 'dev-brute' and result = 'rate_limited') = 1, 'تُسجَّل محاولة الحد';
  r := checkin('1999999999', null, null, 'dev-other', null);
  assert r->>'reason' is distinct from 'rate_limited', 'جهاز آخر غير متأثر';
  -- التحقق من الإفادة والأرشفة: لغير المسؤول لا شيء
  assert verify_certificate('SQ-X-1-001') is null, 'التحقق للمسؤول فقط';
  assert archive_ended_cohorts() = 0, 'الأرشفة لغير المسؤول لا تفعل شيئًا';
  assert not exists (select 1 from information_schema.role_table_grants where grantee in ('anon','authenticated') and table_schema = 'public' and privilege_type = 'TRUNCATE'), 'لا TRUNCATE للزائر والداخل';
end $$;
\echo 'PASS security hardening'
