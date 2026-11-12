-- اختبارات تقرير اليوم: لقطة واحدة لكل تاريخ، ومراجعات مرقّمة، والصلاحيات
\set ON_ERROR_STOP on
do $$
declare r jsonb; ok boolean; d date := riyadh_now()::date; v_admin uuid;
begin
  begin perform generate_daily_report(d, 'snapshot'); ok := false; exception when others then ok := sqlerrm like '%غير مصرح%'; end;
  assert ok, 'التوليد اليدوي للمسؤول فقط';
  r := generate_daily_report(d, 'snapshot', '', true);                                   -- كما تشغّله المهمة المجدولة
  assert not (r->>'existing')::boolean and (r->'report'->>'version')::int = 1, 'اللقطة الأولى';
  assert (r->'report'->'data'->'summary'->>'expected')::int >= 1, 'التقرير يحوي متدربي جلسة اليوم: ' || (r->'report'->'data'->'summary')::text;
  r := generate_daily_report(d, 'snapshot', '', true);
  assert (r->>'existing')::boolean and (select count(*) from daily_reports where date = d) = 1, 'إعادة التشغيل لا تكرر اللقطة';
  perform run_daily_report_job('snapshot');
  assert (select count(*) from daily_reports where date = d) = 1, 'المهمة المجدولة آمنة عند التكرار';
  r := generate_daily_report(d, 'revision', '', true);
  assert (r->'report'->>'version')::int = 2 and r->'report'->>'kind' = 'revision', 'مراجعة مرقّمة';
  assert (select data from daily_reports where date = d and version = 1) is not null, 'اللقطة الأولى باقية دون تعديل';
  select user_id into v_admin from admins limit 1; perform set_config('app.uid', v_admin::text, true);
  perform set_report_note((select id from daily_reports where date = d and version = 1), 'ملاحظة المشرف');
  assert (select note from daily_reports where date = d and version = 1) = 'ملاحظة المشرف', 'ملاحظة الإدارة';
  perform set_config('app.uid', '', true);
end $$;
