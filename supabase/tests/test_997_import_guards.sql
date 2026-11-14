-- حواجز الاستيراد: كشف فارغ يُرفض، وإعادة لصق الأسئلة نفسها لا تكررها
\set ON_ERROR_STOP on
do $$
declare ok boolean; r jsonb; tid uuid; n0 int; rows jsonb;
begin
  perform set_config('app.uid', (select user_id::text from admins limit 1), true);
  begin perform admin_import_legacy(null); ok := false; exception when others then ok := true; end;
  assert ok, 'كشف فارغ (null) يُرفض';
  begin perform admin_import_legacy('[]'::jsonb); ok := false; exception when others then ok := true; end;
  assert ok, 'كشف بلا صفوف يُرفض';
  select id into tid from teachers where 'كمي' = any(subjects) and active limit 1;
  rows := jsonb_build_array(jsonb_build_object('subject','كمي','unit','تكرار','text','سؤال فريد لاختبار التكرار ١','options',jsonb_build_array('1','2','3','4'),'correct',0),
                            jsonb_build_object('subject','كمي','unit','تكرار','text','سؤال فريد لاختبار التكرار ٢','options',jsonb_build_array('1','2','3','4'),'correct',1));
  select count(*) into n0 from questions where teacher_id = tid;
  r := admin_import_questions(tid, rows, 'published');
  assert (r->>'count')::int = 2 and (r->>'skipped')::int = 0, 'الاستيراد الأول يضيف';
  r := admin_import_questions(tid, rows, 'published');
  assert (r->>'count')::int = 0 and (r->>'skipped')::int = 2 and (select count(*) from questions where teacher_id = tid) = n0 + 2, 'الإعادة لا تكرر';
  perform set_config('app.uid', '', true);
  assert not has_function_privilege('authenticated', 'admin_import_legacy_base(jsonb)', 'execute'), 'النسخة السابقة مغلقة';
end $$;
