-- قرار المالك 18 نوفمبر: الإجابة الصحيحة تظهر في المراجعة دائمًا
\set ON_ERROR_STOP on
do $$
declare a assignments;
begin
  select * into a from assignments limit 1;
  if a.id is null then return; end if;
  update assignments set reveal = 'never' where id = a.id;
  assert (select reveal from assignments where id = a.id) = 'after_submit', 'لا يُحجب المفتاح عن المراجعة';
  assert not exists (select 1 from assignments where reveal <> 'after_submit'), 'كل الواجبات بعد التسليم';
end $$;
\echo 'PASS reveal always'
