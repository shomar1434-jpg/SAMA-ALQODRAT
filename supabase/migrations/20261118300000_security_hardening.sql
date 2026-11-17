-- الخطوة BF (المراجعة الأمنية، 17 نوفمبر): إحكام دون تغيير ما يستعمله أحد.
-- 1) my_attendance(رقم الهوية) كانت مفتوحة للعامة وتكشف برامج المتدرب وحضوره لمن يعرف هويته؛ واجهتها («حضوري») أُلغيت،
--    فتُغلق أمام الجميع (تبقى للاستدعاء الداخلي واختبارات الخادم).
revoke execute on function my_attendance(text) from public, anon, authenticated;

-- 2) دوال إدارية محروسة من الداخل (is_admin…) كانت ممنوحة للزائر أيضًا؛ تُسحب منه طبقةً ثانية.
--    archive_ended_cohorts تُستدعى من لوحة الإدارة (مسجّل) ومن دوال الخادم والجدولة (بصلاحية المالك) فلا تتأثر.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prosecdef
             and p.proname in ('archive_ended_cohorts','daily_code','generate_daily_report','issue_certificates','open_cohort',
                               'publish_policy','resolve_profile_change','save_templates','set_attendance','set_report_note','set_sub_attendance') loop
    execute format('revoke execute on function %s from anon', r.sig);
  end loop;
end $$;

-- 3) تثبيت search_path للدوال التي بلا مسار (تحذير المستشار الأمني)، بالمسار الافتراضي نفسه (public ثم extensions) فلا يتغير سلوكها.
do $$
declare r record;
begin
  for r in select p.oid::regprocedure sig from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
             and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
             and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e') loop
    execute format('alter function %s set search_path = public, extensions', r.sig);
  end loop;
end $$;
