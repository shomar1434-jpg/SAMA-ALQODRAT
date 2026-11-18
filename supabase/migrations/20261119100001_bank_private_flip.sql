-- الخطوة BO: إغلاق الحاوية بعد نشر الواجهة التي تطلب روابط موقّعة (يُطبَّق بعد النشر)
do $$ begin
  if to_regclass('storage.buckets') is not null then update storage.buckets set public = false where id = 'bank'; end if;
end $$;
