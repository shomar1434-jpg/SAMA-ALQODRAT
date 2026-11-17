-- قرار المالك (17 نوفمبر): مدير النظام يعدّل بداية الباقة ونهايتها لكل مشترك في القدرات والتحصيلي.
-- end_date اختياري عند تعديل اشتراك قائم: إن وُجد يُخزَّن كما هو (استثناء)، وإلا تُحسب النهاية للباقة كما كانت.
-- الاشتراك الجديد يبقى «بانتظار أول حضور» وتبدأ الباقة من أول تحضير بالباركود. كل تغيير يسجّله audit_row على subscriptions.
alter function admin_save_subscription(jsonb) rename to admin_save_subscription_noend;
create or replace function admin_save_subscription(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; s subscriptions; v_end date := nullif(p->>'end_date','')::date;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if v_end is not null then
    if nullif(p->>'id','') is null then raise exception 'تاريخ النهاية يُعدَّل لاشتراك قائم فقط'; end if;
    if nullif(p->>'start_date','') is null then raise exception 'حدّد تاريخ البداية قبل النهاية'; end if;
    if v_end < (p->>'start_date')::date then raise exception 'تاريخ النهاية قبل تاريخ البداية'; end if;
    if v_end > (p->>'start_date')::date + 400 then raise exception 'تاريخ النهاية بعيد جدًا عن البداية'; end if;
  end if;
  r := admin_save_subscription_noend(p);
  if v_end is not null then
    update subscriptions set end_date = v_end where id = (p->>'id')::uuid returning * into s;
    r := r || jsonb_build_object('end_date', s.end_date);
  end if;
  return r;
end $$;
revoke execute on function admin_save_subscription_noend(jsonb) from public, anon, authenticated;
revoke execute on function admin_save_subscription(jsonb) from public, anon;
grant execute on function admin_save_subscription(jsonb) to authenticated;
