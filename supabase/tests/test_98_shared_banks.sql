-- الخطوة R: بنك مشترك مصوَّر لكل مقرر يراه مدربا المقرر (بنين وبنات)، والواجبات لكل مدرب؛ انتقاء أسئلة؛ لا مفاتيح للمتدرب
\set ON_ERROR_STOP on
do $$
declare tb uuid; tg uuid; tv uuid; v_admin uuid; r jsonb; ok boolean; d date := riyadh_now()::date; ids jsonb; a assignments; pd jsonb; b jsonb;
begin
  insert into teachers(full_name, phone, section, subjects) values ('مدرب كمي بنين', '0501009801', 'boys', '{كمي}') returning id into tb;
  insert into teachers(full_name, phone, section, subjects) values ('مدربة كمي بنات', '0501009802', 'girls', '{كمي}') returning id into tg;
  insert into teachers(full_name, phone, section, subjects) values ('مدرب لفظي بنين', '0501009803', 'boys', '{لفظي}') returning id into tv;
  b := jsonb_build_object('subject','كمي','questions', jsonb_build_array(
    jsonb_build_object('code','KT-01','unit','واجب 1','skill','هندسة','order',1,'image','quant/KT-01.webp','correct',1,'key_status','unverified','key_source','تظليل','status','published'),
    jsonb_build_object('code','KT-02','unit','واجب 1','skill','جبر','order',2,'image','quant/KT-02.webp','correct',2,'status','published'),
    jsonb_build_object('code','KT-03','unit','واجب 2','order',3,'image','quant/KT-03.webp','correct',0,'status','draft')));
  begin perform admin_import_shared_bank(b); ok := false; exception when others then ok := true; end;
  assert ok, 'الاستيراد للمسؤول فقط';
  v_admin := gen_random_uuid(); insert into auth.users(id, email) values (v_admin, 'bank-admin@test'); insert into admins(user_id) values (v_admin);
  perform set_config('app.uid', v_admin::text, true);
  r := admin_import_shared_bank(b);
  assert (r->>'added')::int = 3 and (r->>'updated')::int = 0, 'استيراد الحزمة';
  r := admin_import_shared_bank(jsonb_set(b, '{questions,0,correct}', '3'));
  assert (r->>'added')::int = 0 and (r->>'updated')::int = 3 and (select version from questions where code = 'KT-01') = 2 and (select correct from questions where code = 'KT-01') = 3, 'إعادة الاستيراد تحدّث ولا تكرر، وتغيّر المفتاح يرفع الإصدار';
  begin insert into questions(shared, section, subject, text, options, correct, code) values (true, 'boys', 'كمي', 'x', '{أ,ب,ج,د}', 0, 'KT-09'); ok := false; exception when others then ok := true; end;
  assert ok, 'السؤال المشترك بلا قسم ولا مدرب';
  perform set_config('app.uid', '', true);

  -- المدربان يريان البنك نفسه، ومدرب اللفظي لا يراه
  perform set_config('app.phone', '0501009801', true); pd := portal_data('teacher');
  assert (select count(*) from jsonb_array_elements(pd->'questions') q where (q->>'shared')::boolean) = 3 and pd ? 'bank_assets', 'مدرب الكمي بنين يرى البنك المشترك';
  perform set_config('app.phone', '0501009802', true); pd := portal_data('teacher');
  assert (select count(*) from jsonb_array_elements(pd->'questions') q where (q->>'shared')::boolean) = 3, 'مدربة الكمي بنات ترى البنك نفسه';
  perform set_config('app.phone', '0501009803', true); pd := portal_data('teacher');
  assert (select count(*) from jsonb_array_elements(pd->'questions') q where (q->>'shared')::boolean) = 0, 'مدرب اللفظي لا يرى بنك الكمي';

  -- انتقاء أسئلة بعينها بترتيب المدرب
  perform set_config('app.phone', '0501009802', true);
  select jsonb_agg(id order by code desc) into ids from questions where code in ('KT-01','KT-02');
  perform teacher_save_assignment(jsonb_build_object('kind','quiz','subject','كمي','title','واجب منتقى','publish_date',d,'due_date',d + 3,'question_ids',ids));
  select * into a from assignments where teacher_id = tg and title = 'واجب منتقى';
  assert a.section = 'girls' and jsonb_array_length(a.quiz) = 2 and a.quiz->0->>'code' = 'KT-02' and a.quiz->0->>'image' = 'quant/KT-02.webp' and a.quiz->1->>'code' = 'KT-01', 'الواجب لقسم المدربة بأسئلتها المنتقاة وترتيبها وصورها';
  begin perform teacher_save_assignment(jsonb_build_object('kind','quiz','subject','كمي','title','مسودة لا تُنتقى','publish_date',d,'due_date',d,'question_ids',(select jsonb_agg(id) from questions where code = 'KT-03'))); ok := false; exception when others then ok := true; end;
  assert ok, 'سؤال غير منشور لا يُنتقى';
  perform set_config('app.phone', '0501009803', true);
  begin perform teacher_save_assignment(jsonb_build_object('kind','quiz','subject','كمي','title','خارج النطاق','publish_date',d,'due_date',d,'question_ids',ids)); ok := false; exception when others then ok := true; end;
  assert ok, 'مدرب مقرر آخر لا يستخدم البنك';
  perform set_config('app.phone', '0501009801', true);
  perform teacher_save_assignment(jsonb_build_object('kind','quiz','subject','كمي','title','عشوائي من المشترك','publish_date',d,'due_date',d + 3,'count',5));
  assert (select jsonb_array_length(quiz) from assignments where teacher_id = tb and title = 'عشوائي من المشترك') = 2, 'العشوائي من المنشور فقط';
  assert (select count(*) from assignments where title in ('واجب منتقى','عشوائي من المشترك')) = 2 and (select count(distinct teacher_id) from assignments where title in ('واجب منتقى','عشوائي من المشترك')) = 2, 'الواجبات منفصلة لكل مدرب';
  perform set_config('app.phone', '', true);
  delete from admins where user_id = v_admin; delete from auth.users where id = v_admin;
end $$;
