-- صلاحيات الدوال: الداخلي مغلق عن anon و authenticated، وما تستدعيه الواجهة متاح.
do $$
begin
  assert not has_function_privilege('anon', 'code_for(date)', 'execute'), 'code_for مغلقة عن الزائر';
  assert not has_function_privilege('authenticated', 'code_for(date)', 'execute'), 'code_for مغلقة عن الداخل';
  assert not has_function_privilege('anon', '_issue_certificates(uuid)', 'execute'), 'الإصدار الداخلي مغلق';
  assert not has_function_privilege('authenticated', 'register_trainee_noorder(jsonb)', 'execute'), 'النسخ القديمة مغلقة';
  assert not has_function_privilege('anon', 'register_trainee_direct(jsonb)', 'execute'), 'التسجيل المباشر داخلي';
  assert not has_function_privilege('anon', 'admin_add(text,text,text)', 'execute'), 'دوال الإدارة ليست للزائر';
  assert has_function_privilege('authenticated', 'admin_add(text,text,text)', 'execute'), 'دوال الإدارة للداخل';
  assert has_function_privilege('anon', 'public_catalog()', 'execute'), 'الدليل العام متاح';
  assert has_function_privilege('anon', 'register_trainee(jsonb)', 'execute'), 'التسجيل متاح';
  assert has_function_privilege('anon', 'checkin(text,text,text,text,text)', 'execute'), 'التحضير متاح';
  assert has_function_privilege('authenticated', 'is_admin()', 'execute'), 'دوال السياسات متاحة';
  assert has_function_privilege('authenticated', 'student_start_quiz(jsonb)', 'execute'), 'دوال المتدرب متاحة';
  assert not exists (select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.prosecdef
    and has_function_privilege('anon', p.oid, 'execute') and p.proname ~ '_(untargeted|noorder|base)$'), 'لا نسخة قديمة مكشوفة';
end $$;
