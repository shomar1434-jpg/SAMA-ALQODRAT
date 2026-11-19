-- قرار المالك (19 نوفمبر): التسجيل العام مرتان في اليوم من الجوال نفسه أو الجهاز نفسه (بدل مرة)
alter table settings alter column reg_per_phone set default 2;
alter table settings alter column reg_per_device set default 2;
update settings set reg_per_phone = 2, reg_per_device = 2 where id = 1;
