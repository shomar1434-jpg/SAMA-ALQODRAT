-- الخطوة BF: حراس الصلاحيات (اختبار وقائي يمنع أي دالة جديدة من الإفلات)
\set ON_ERROR_STOP on
do $$
declare r record; bad text := '';
begin
  -- كل دالة admin_* بصلاحية المالك تتحقق من دور المسؤول داخلها (أو تفوّض دالة إدارية محروسة)، ولا ينفّذها الزائر
  for r in select p.oid, p.proname, p.prosrc def from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prokind = 'f' loop
    if r.proname ~ '^admin_' and r.def !~ '(is_admin|is_full_admin|is_owner|admin_role|auth\.uid|admin_[a-z_]+)\(' then bad := bad || ' ' || r.proname || '(بلا حارس)'; end if;
    if r.proname ~ '^(admin|teacher|student)_' and has_function_privilege('anon', r.oid, 'execute') then bad := bad || ' ' || r.proname || '(للزائر)'; end if;
    if r.proname ~ '^teacher_' and r.proname !~ '_(untargeted|noorder|base|prev)$' and r.proname <> 'teacher_teaches'
       and r.def !~ '(me_teacher|is_admin|my_phone)\(' then bad := bad || ' ' || r.proname || '(بلا تحقق المدرب)'; end if;
    if r.proname ~ '^student_' and r.proname !~ '_(untargeted|noorder|base|prev)$' and r.proname <> 'student_owns'
       and r.def !~ '(student_owns|my_phone|me_trainee|my_trainee|quiz_access|student_[a-z_]+\()' then bad := bad || ' ' || r.proname || '(بلا تحقق المتدرب)'; end if;
  end loop;
  assert bad = '', 'دوال تحتاج حارسًا:' || bad;
  -- الدالة القديمة لكشف الحضور برقم الهوية مغلقة
  assert not has_function_privilege('anon', 'my_attendance(text)', 'execute') and not has_function_privilege('authenticated', 'my_attendance(text)', 'execute'), 'my_attendance مغلقة';
  assert not has_function_privilege('anon', 'archive_ended_cohorts()', 'execute') and has_function_privilege('authenticated', 'archive_ended_cohorts()', 'execute'), 'الأرشفة للمسجّلين فقط';
  -- العام يبقى عامًا (لا تعطيل للتسجيل والتحضير والمساعد)
  assert has_function_privilege('anon', 'register_trainee(jsonb)', 'execute') and has_function_privilege('anon', 'public_catalog()', 'execute')
     and has_function_privilege('anon', 'assistant_register_interest(jsonb)', 'execute') and has_function_privilege('anon', 'is_admin()', 'execute'), 'الدوال العامة باقية';
  -- لا دالة في public بلا search_path ثابت
  assert not exists (select 1 from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
     and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')
     and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')), 'كل الدوال بمسار ثابت';
  -- الجداول كلها بـ RLS
  assert not exists (select 1 from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and not c.relrowsecurity), 'RLS على كل الجداول';
end $$;
\echo 'PASS security guards'
