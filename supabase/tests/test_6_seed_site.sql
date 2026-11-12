-- بذور السياسات المنقولة: ستّ سياسات منشورة، ولا تُكرَّر عند إعادة التشغيل
\set ON_ERROR_STOP on
\ir ../seed_site.sql
\ir ../seed_site.sql
do $$ begin
  assert (select count(distinct slug) from policies where status = 'published') = 6, 'ست سياسات منشورة';
  assert (select count(*) from current_policies(riyadh_now()::date) where requires_acceptance) = 3, 'ثلاث سياسات يلزم قبولها';
  assert (select count(*) from policies where slug = 'integrity') = 1, 'لا تكرار عند إعادة البذر';
  assert exists (select 1 from policies where slug = 'attendance' and body like '%75%%'), 'نص سياسة الحضور';
end $$;
do $$ begin
  assert (select count(*) from partners) = 17, 'سبعة عشر شريكًا (جهتا اعتماد و15 شريك نجاح)';
end $$;
