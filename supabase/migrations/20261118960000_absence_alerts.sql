-- الخطوة BM (قرار المالك 18 نوفمبر): تنبيه غياب باقات القدرات والتحصيلي
-- إذا زاد غياب المتدرب عن 3 مرات (من الغياب الرابع ثم مع كل غياب بعده) يظهر للمسؤول تنبيه برسالة جاهزة لولي الأمر،
-- والمسؤول يختار «إرسال لولي الأمر» (يفتح واتساب على جهازه، لا إرسال آلي) أو «إلغاء الرسالة».
-- القائمة تُحسب في الواجهة من الحضور (subStats)، وهنا يُحفظ قرار المسؤول لكل (اشتراك، عدد غياب) فلا يتكرر التنبيه.
create table if not exists absence_alerts (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  level int not null check (level between 1 and 1000),
  action text not null check (action in ('sent', 'dismissed')),
  acted_at timestamptz not null default now(),
  acted_by uuid default auth.uid(),
  unique (subscription_id, level)
);
alter table absence_alerts enable row level security;
drop policy if exists absence_alerts_admin_read on absence_alerts;
create policy absence_alerts_admin_read on absence_alerts for select to authenticated using (is_admin());
revoke all on absence_alerts from anon;

create or replace function admin_absence_alert(p_sub uuid, p_level int, p_action text) returns void
language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if p_action is null or p_action not in ('sent', 'dismissed') then raise exception 'إجراء غير معروف'; end if;
  if p_level is null or p_level < 1 or p_level > 1000 then raise exception 'عدد الغياب غير صالح'; end if;
  if not exists (select 1 from subscriptions where id = p_sub) then raise exception 'الاشتراك غير موجود'; end if;
  insert into absence_alerts(subscription_id, level, action) values (p_sub, p_level, p_action)
    on conflict (subscription_id, level) do update set action = excluded.action, acted_at = now(), acted_by = auth.uid();
end $$;
revoke execute on function admin_absence_alert(uuid, int, text) from public, anon;
grant execute on function admin_absence_alert(uuid, int, text) to authenticated;

-- التحديث الحي: قرار مسؤول يُخفي التنبيه عند المسؤولين الآخرين
do $$ begin
  if to_regprocedure('sama_internal.signal_data_change()') is not null and not exists (select 1 from pg_trigger where tgname = 'signal_data_change' and tgrelid = 'public.absence_alerts'::regclass) then
    create trigger signal_data_change after insert or update or delete on public.absence_alerts for each row execute function sama_internal.signal_data_change();
  end if;
end $$;
