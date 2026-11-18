-- الخطوة BH: اختبار تحديد المستوى
\set ON_ERROR_STOP on
do $$
declare r jsonb; f jsonb; q jsonb; ans jsonb := '{}'; ok boolean; v_id uuid; i int; s text := 'plTestSession01';
  other uuid[] := (select coalesce(array_agg(id), '{}') from questions where shared and status = 'published');
begin
  update questions set status = 'draft' where id = any(other);   -- بنك الاختبار وحده (تُعاد في النهاية)
  -- بنك مشترك منشور معتمد: 12 لكل من اللفظي والكمي، والإجابة الصحيحة 2 دائمًا
  for i in 1..12 loop
    insert into questions(shared, teacher_id, section, subject, unit, "order", text, options, correct, key_status, status, category, code)
    values (true, null, 'all', 'لفظي', 'عام', i, 'سؤال لفظي ' || i, array['أ','ب','ج','د'], 2, 'approved', 'published', case when i <= 6 then 'التناظر اللفظي' else 'إكمال الجمل' end, 'PLV' || i),
           (true, null, 'all', 'كمي', 'عام', i, 'سؤال كمي ' || i, array['أ','ب','ج','د'], 2, 'approved', 'published', case when i <= 6 then 'الجبر' else '' end, 'PLQ' || i);
  end loop;
  -- غير المعتمد لا يدخل
  insert into questions(shared, teacher_id, section, subject, unit, text, options, correct, key_status, status, code) values (true, null, 'all', 'تحصيلي', 'عام', 'x', array['أ','ب','ج','د'], 0, 'unverified', 'published', 'PLT1');
  r := placement_status();
  assert (r->>'qudurat')::boolean and not (r->>'tahsili')::boolean and (r->'minutes'->>'qudurat')::int = 20, 'الحالة: القدرات متاح، التحصيلي قريبًا';

  begin perform placement_start('qudurat', 'bad'); ok := false; exception when others then ok := true; end;
  assert ok, 'رمز جلسة غير صالح مرفوض';
  begin perform placement_start('tahsili', s); ok := false; exception when others then ok := sqlerrm like '%غير متاح%'; end;
  assert ok, 'التحصيلي بلا بنك معتمد غير متاح';

  r := placement_start('qudurat', s);
  v_id := (r->>'id')::uuid;
  assert jsonb_array_length(r->'questions') = 20, '20 سؤالًا';
  assert not exists (select 1 from jsonb_array_elements(r->'questions') x where x ? 'correct' or x ? 'category'), 'لا إجابة صحيحة للزائر';
  assert (select count(*) from jsonb_array_elements(r->'questions') x where x->>'subject' = 'لفظي') = 10, '10 لفظي و10 كمي';

  -- جلسة أخرى لا تصحح محاولة غيرها
  begin perform placement_finish(v_id, 'otherSession99', '{}'); ok := false; exception when others then ok := true; end;
  assert ok, 'المحاولة لصاحب الجلسة فقط';

  -- كل الإجابات صحيحة = 100٪ ← الأساسية
  for q in select * from jsonb_array_elements(r->'questions') loop ans := ans || jsonb_build_object(q->>'id', 2); end loop;
  f := placement_finish(v_id, s, ans);
  assert (f->>'pct')::int = 100 and f->'tiers' = '["basic"]' and f->'plans'->0->>'tier' = 'basic', 'فوق 65٪ الأساسية';
  assert placement_finish(v_id, s, '{}') = f, 'التسليم مرة واحدة';

  -- لا إجابات = 0٪ ← الماسية والذهبية
  r := placement_start('qudurat', s);
  f := placement_finish((r->>'id')::uuid, s, '{}');
  assert (f->>'pct')::int = 0 and f->'tiers' = '["diamond","gold"]', 'دون 40٪ الماسية والذهبية';

  -- اللفظي صحيح والكمي خطأ = 50٪، والجبر ضعيف (مصنّف) وغير المصنّف لا يُحسب ← خصصناها لك ثم الفضية
  r := placement_start('qudurat', s); ans := '{}';
  for q in select * from jsonb_array_elements(r->'questions') loop ans := ans || jsonb_build_object(q->>'id', case when q->>'subject' = 'لفظي' then 2 else 0 end); end loop;
  f := placement_finish((r->>'id')::uuid, s, ans);
  assert (f->>'pct')::int = 50 and (f->'weak') ? 'الجبر' and not (f->'weak') ? 'غير مصنّف', 'المهارة الضعيفة المصنّفة فقط';
  assert f->'tiers' = '["custom","silver"]' and f->'plans'->0->>'tier' = 'custom', '40–65٪ مع ضعف مهارة: خصصناها لك ثم الفضية';

  -- الربط بملف المتدرب عند التسجيل في باقة بالجلسة نفسها
  declare nid text; i2 int := 0; rr jsonb; v_plan uuid := (select id from plans where tier = 'silver' and mode = 'in_person');
    acc jsonb := coalesce((select jsonb_agg(id) from current_policies(riyadh_now()::date) where requires_acceptance), '[]');
  begin
    loop i2 := i2 + 1; nid := '1' || lpad((800000000 + i2)::text, 9, '0'); exit when saudi_id_valid(nid) and not exists (select 1 from trainees where national_id = nid); end loop;
    rr := register_subscription(jsonb_build_object('national_id', nid, 'full_name', 'نايف علي محمد الحربي', 'phone', '0557772001', 'gender', 'ذكر', 'plan_id', v_plan, 'accepted_policies', acc,
      'placement_id', r->>'id', 'placement_session', 'wrongSession1'));
    assert (select trainee_id is null from placement_attempts where id = (r->>'id')::uuid), 'جلسة مختلفة لا تربط';
    rr := register_subscription(jsonb_build_object('national_id', nid, 'full_name', 'نايف علي محمد الحربي', 'phone', '0557772001', 'gender', 'ذكر', 'accepted_policies', acc,
      'plan_id', (select id from plans where tier = 'gold' and mode = 'in_person'), 'placement_id', r->>'id', 'placement_session', s));
    assert (select trainee_id = (select id from trainees where national_id = nid) from placement_attempts where id = (r->>'id')::uuid), 'تُربط النتيجة بملف المتدرب';
    assert jsonb_array_length((select jsonb_agg(1) from placement_attempts where trainee_id is not null)) = 1, 'ربط واحد';
  end;

  -- الحد اليومي (3) للجلسة
  begin perform placement_start('qudurat', s); ok := false; exception when others then ok := sqlerrm like '%حد محاولات اليوم%'; end;
  assert ok, 'الحد اليومي';

  -- الصلاحيات
  assert has_function_privilege('anon', 'placement_start(text, text)', 'execute') and has_function_privilege('anon', 'placement_finish(uuid, text, jsonb)', 'execute')
     and not has_function_privilege('anon', 'admin_placement_data()', 'execute') and not has_function_privilege('anon', 'pl_plans(text, text[])', 'execute')
     and not has_function_privilege('anon', 'placement_purge()', 'execute') and not has_function_privilege('anon', 'pl_link(jsonb)', 'execute'), 'الصلاحيات';
  assert not has_table_privilege('anon', 'placement_attempts', 'select'), 'الجدول مغلق';
  begin perform admin_placement_settings('{"placement_low":50,"placement_high":40,"placement_sec_per_q":60,"placement_daily_max":3}'); ok := false; exception when others then ok := true; end;
  assert ok, 'الإعدادات للمدير وحده وبحدود صحيحة';

  -- الحذف بعد 100 يوم
  update placement_attempts set started_at = now() - interval '101 days' where id = v_id;
  assert placement_purge() = 1, 'تُحذف بعد 100 يوم';
  assert not exists (select 1 from placement_attempts where id = v_id), 'المحذوفة لا تبقى';
  update questions set status = 'published' where id = any(other);
  delete from placement_attempts; delete from questions where code like 'PL%' or (subject = 'تحصيلي' and text = 'x');
end $$;
\echo 'PASS placement'
