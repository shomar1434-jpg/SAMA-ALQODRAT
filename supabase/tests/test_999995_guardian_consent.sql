-- الخطوة BG: موافقة ولي الأمر عند تسجيل من هم دون 18 سنة، ومسودتا الخصوصية والشروط
\set ON_ERROR_STOP on
do $$
declare v_plan uuid := (select id from plans where tier = 'silver' and mode = 'in_person'); ids text[] := '{}'; c text; r jsonb; ok boolean; i int := 0;
  acc jsonb := coalesce((select jsonb_agg(id) from current_policies(riyadh_now()::date) where requires_acceptance), '[]');   -- ما قد تتركه اختبارات السياسات السابقة
begin
  while coalesce(array_length(ids, 1), 0) < 3 loop
    i := i + 1; c := '1' || lpad((700000000 + i)::text, 9, '0');
    if saudi_id_valid(c) and not exists (select 1 from trainees where national_id = c) then ids := ids || c; end if;
  end loop;
  -- العميل القديم بلا سؤال العمر: لا إلزام (لا تعطيل للصفحات المحفوظة)
  r := register_subscription(jsonb_build_object('national_id', ids[1], 'full_name', 'سعد علي محمد الحربي', 'phone', '0557771001', 'gender', 'ذكر', 'plan_id', v_plan, 'accepted_policies', acc));
  assert (r->>'ok')::boolean and (select guardian_consent_at from trainees where national_id = ids[1]) is null, 'العميل القديم يسجّل كما كان';
  -- دون 18 بلا إقرار أو بلا جوال ولي الأمر: مرفوض
  begin perform register_subscription(jsonb_build_object('national_id', ids[2], 'full_name', 'فهد علي محمد الحربي', 'phone', '0557771002', 'gender', 'ذكر', 'plan_id', v_plan, 'accepted_policies', acc,
    'minor', 'yes', 'guardian_phone', '0509991002')); ok := false; exception when others then ok := sqlerrm like '%إقرار موافقة ولي الأمر%'; end;
  assert ok, 'دون 18 بلا إقرار مرفوض';
  begin perform register_subscription(jsonb_build_object('national_id', ids[2], 'full_name', 'فهد علي محمد الحربي', 'phone', '0557771002', 'gender', 'ذكر', 'plan_id', v_plan, 'accepted_policies', acc,
    'minor', 'yes', 'guardian_consent', true)); ok := false; exception when others then ok := sqlerrm like '%جوال ولي الأمر%'; end;
  assert ok, 'دون 18 بلا جوال ولي الأمر مرفوض';
  assert not exists (select 1 from trainees where national_id = ids[2]), 'الرفض لا يترك سجلًا';
  r := register_subscription(jsonb_build_object('national_id', ids[2], 'full_name', 'فهد علي محمد الحربي', 'phone', '0557771002', 'gender', 'ذكر', 'plan_id', v_plan, 'accepted_policies', acc,
    'minor', 'yes', 'guardian_phone', '0509991002', 'guardian_consent', true));
  assert (r->>'ok')::boolean and (select guardian_consent_at is not null and guardian_phone = '0509991002' from trainees where national_id = ids[2]), 'القاصر بالجوال والإقرار: محفوظ بوقت الإقرار';
  -- البالغ
  r := register_subscription(jsonb_build_object('national_id', ids[3], 'full_name', 'ماجد علي محمد الحربي', 'phone', '0557771003', 'gender', 'ذكر', 'plan_id', v_plan, 'accepted_policies', acc, 'minor', 'no'));
  assert (r->>'ok')::boolean and (select guardian_consent_at from trainees where national_id = ids[3]) is null, 'البالغ بلا إقرار';
  -- الصلاحيات
  assert not has_function_privilege('anon', 'register_subscription_noconsent(jsonb)', 'execute') and not has_function_privilege('anon', 'reg_minor_consent(jsonb)', 'execute')
     and has_function_privilege('anon', 'register_subscription(jsonb)', 'execute') and has_function_privilege('anon', 'register_trainee(jsonb)', 'execute'), 'الداخلية مغلقة والعامة باقية';
  -- المسودات: لا تظهر للعامة، والشروط لا تُنشر قبل الاستكمال
  assert not exists (select 1 from jsonb_array_elements(public_policies()) e where e->>'status' = 'draft'), 'المسودات لا تظهر للعامة';
  assert (select position('يُكمل من الإدارة' in body) > 0 from policies where slug = 'terms' and status = 'draft'), 'الشروط تنتظر الاسترداد والرقم الضريبي';
end $$;
\echo 'PASS guardian consent'
