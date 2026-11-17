-- الخطوة BD: مكتبة ردود المساعد — رقم الإصدار يزيد مع كل تعديل، وإشارة التحديث تزيد مرة واحدة لكل معاملة، والتصحيحات مطبّقة
\set ON_ERROR_STOP on
do $$
declare v int; r0 bigint; r1 bigint;
begin
  assert (select count(*) from assistant_responses) = 21, 'المكتبة مزروعة بـ21 ردًا';
  assert (select answer from assistant_responses where id = 'certificates') like '%منار%', 'رد الشهادات يذكر منار';
  assert (select answer from assistant_responses where id = 'zoom') like '%البث المباشر%', 'رد البث يذكر تبويب البث المباشر';
  select version into v from assistant_responses where id = 'hello';
  select version into r0 from app_data_revision where id = 1;
  update assistant_responses set title = title || ' ' where id = 'hello';
  update assistant_responses set title = btrim(title) where id = 'hello';
  assert (select version from assistant_responses where id = 'hello') = v + 2, 'كل تعديل يرفع رقم الإصدار';
  select version into r1 from app_data_revision where id = 1;
  assert r1 = r0 + 1, 'إشارة التحديث تزيد مرة واحدة في المعاملة الواحدة';
  assert exists (select 1 from pg_trigger where tgname = 'signal_data_change' and tgrelid = 'public.lectures'::regclass), 'المحاضرات تُنبّه الواجهات';
end $$;
