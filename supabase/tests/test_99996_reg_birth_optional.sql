-- البند 1: الباقة بلا تاريخ ميلاد وبجوال ولي أمر مستقل، وبرنامج الأطفال يطلب تاريخ الميلاد
\set ON_ERROR_STOP on
do $$
declare d date := riyadh_now()::date; r jsonb; ok boolean; v_kids uuid;
begin
  r := register_subscription(jsonb_build_object('national_id','1926020783','full_name','فيصل سعد علي العمري','phone','0557771001','guardian_phone','0557771002','gender','ذكر',
    'plan_id',(select id from plans where tier='basic' and mode='in_person'),'accepted_policies',(select coalesce(jsonb_agg(id), '[]') from current_policies(d) where requires_acceptance)));
  assert (select phone = '0557771001' and guardian_phone = '0557771002' and birth_date is null from trainees where national_id = '1926020783'), 'باقة بلا تاريخ ميلاد وبجوالين مستقلين';
  begin perform register_subscription(jsonb_build_object('national_id','1988870356','full_name','نواف سعد علي العمري','phone','0557771003','guardian_phone','123','gender','ذكر',
    'plan_id',(select id from plans where tier='basic' and mode='in_person'),'accepted_policies','[]'::jsonb)); ok := false; exception when others then ok := sqlerrm like '%ولي الأمر%'; end;
  assert ok, 'جوال ولي أمر غير صحيح مرفوض';
  select id into v_kids from programs where accreditation_no = '25194';
  if v_kids is not null then
    begin perform register_trainee(jsonb_build_object('program_id',v_kids,'national_id','1988870356','full_name','نواف سعد علي العمري','phone','0557771003','gender','ذكر','accepted_policies','[]'::jsonb)); ok := false;
    exception when others then ok := sqlerrm like '%تاريخ الميلاد%'; end;
    assert ok, 'برنامج الأطفال يطلب تاريخ الميلاد';
  end if;
end $$;
