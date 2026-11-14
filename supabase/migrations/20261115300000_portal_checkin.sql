-- الخطوة AB: تسجيل الحضور من داخل البوابة (شاشة الترحيب)
-- المتدرب داخل بوابته بجهاز معتمد (my_phone)، فلا يكتب سجله المدني: يُختار ملفه بمعرّفه، ويُتحقق أنه لهذا الجوال،
-- ثم يمر بمسار التحضير نفسه (checkin): الوقت، ورمز اليوم إن كان مفعّلًا، والطلبات، وسجل المحاولات.
create or replace function portal_checkin(p_trainee uuid, p_code text default null, p_device text default '', p_choice text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare ph text := my_phone(); v_nid text;
begin
  if coalesce(ph, '') = '' then raise exception 'انتهت الجلسة، سجّل الدخول مجددًا'; end if;
  select national_id into v_nid from trainees where id = p_trainee and phone = ph;
  if v_nid is null then raise exception 'غير مصرح'; end if;
  return checkin(v_nid, p_code, null, left(coalesce(nullif(p_device, ''), 'portal'), 60), p_choice);
end $$;
revoke execute on function portal_checkin(uuid, text, text, text) from public, anon;
grant execute on function portal_checkin(uuid, text, text, text) to authenticated;
