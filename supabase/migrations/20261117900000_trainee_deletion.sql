-- الخطوة BB (قرار المالك 17 نوفمبر): حذف المتدرب حذفًا كاملًا يدويًا (المالك ومدير النظام) و«بيانات مؤرشفة»:
-- من انتهت خدماته كلها تبقى بياناته 3 أشهر (settings.archive_retention_days) ثم تُحذف آليًا. الحذف كامل يشمل السجلات المالية
-- وما يخصه في سجل الحركات وتقارير اليوم المحفوظة، ويُسجَّل حدث واحد بلا بيانات شخصية.
alter table settings add column if not exists archive_retention_days int not null default 90 check (archive_retention_days between 30 and 3650);

-- السجلات المالية لا تُحذف إلا داخل حذف المتدرب المعتمد
create or replace function orders_no_delete() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' and current_setting('app.trainee_purge', true) = 'on' then return old; end if;
  raise exception 'السجلات المالية لا تُحذف';
end $$;

-- حالة خدمات المتدرب: active (له خدمة قائمة) / completed (انتهت كلها وإحداها اكتملت) / withdrawn (كلها ملغاة) / none
create or replace function trainee_service_state(p_id uuid, out state text, out completed_on date, out remaining numeric)
language plpgsql stable security definer set search_path = public as $$
declare d date := riyadh_now()::date; v_live boolean; v_done date; v_any boolean;
begin
  select exists (select 1 from subscriptions s where s.trainee_id = p_id and s.status <> 'cancelled' and (s.status = 'pending' or s.end_date is null or s.end_date >= d))
      or exists (select 1 from enrollments e join cohorts c on c.id = e.cohort_id where e.trainee_id = p_id and e.status <> 'ملغى' and c.archived_at is null and c.end_date >= d)
      or exists (select 1 from program_requests r where r.trainee_id = p_id and r.status = 'pending')
    into v_live;
  select greatest((select max(s.end_date) from subscriptions s where s.trainee_id = p_id and s.status <> 'cancelled'),
                  (select max(least(c.end_date, coalesce(c.archived_at::date, c.end_date))) from enrollments e join cohorts c on c.id = e.cohort_id where e.trainee_id = p_id and e.status <> 'ملغى'))
    into v_done;
  v_any := exists (select 1 from subscriptions where trainee_id = p_id) or exists (select 1 from enrollments where trainee_id = p_id);
  remaining := coalesce((select sum(greatest(0, o.total - o.paid_amount)) from orders o where o.trainee_id = p_id and o.cancelled_at is null and o.approval <> 'rejected'), 0);
  state := case when v_live then 'active' when v_done is not null then 'completed' when v_any then 'withdrawn' else 'none' end;
  completed_on := case when state = 'completed' then v_done end;
end $$;

-- الحذف الكامل (داخلية، بلا منح)
create or replace function trainee_purge(p_id uuid, p_mode text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare t trainees; ids text[]; v_subs uuid[]; v_ords uuid[]; v_invs uuid[]; v_enrs uuid[]; n int;
begin
  select * into t from trainees where id = p_id for update;
  if t.id is null then raise exception 'المتدرب غير موجود'; end if;
  perform set_config('app.trainee_purge', 'on', true);
  v_subs := array(select id from subscriptions where trainee_id = p_id);
  v_enrs := array(select id from enrollments where trainee_id = p_id);
  v_ords := array(select id from orders where trainee_id = p_id or subscription_id = any(v_subs));
  v_invs := array(select id from invoices where trainee_id = p_id or order_id = any(v_ords));
  ids := array[p_id::text] || v_subs::text[] || v_enrs::text[] || v_ords::text[] || v_invs::text[]
      || array(select id::text from sub_attendance where trainee_id = p_id or subscription_id = any(v_subs))
      || array(select id::text from attendance where trainee_id = p_id or enrollment_id = any(v_enrs))
      || array(select id::text from certificates where trainee_id = p_id or enrollment_id = any(v_enrs))
      || array(select id::text from submissions where trainee_id = p_id) || array(select id::text from attempts where trainee_id = p_id)
      || array(select id::text from notifications where trainee_id = p_id) || array(select id::text from guardian_links where trainee_id = p_id)
      || array(select id::text from profile_change_requests where trainee_id = p_id) || array(select id::text from program_requests where trainee_id = p_id);
  delete from invoice_receipts where invoice_id = any(v_invs);
  delete from order_events where order_id = any(v_ords);
  delete from invoices where id = any(v_invs);
  delete from orders where id = any(v_ords);
  delete from sub_attendance where trainee_id = p_id or subscription_id = any(v_subs);
  delete from attendance where trainee_id = p_id or enrollment_id = any(v_enrs);
  delete from certificates where trainee_id = p_id or enrollment_id = any(v_enrs);
  delete from program_requests where trainee_id = p_id or enrollment_id = any(v_enrs);
  delete from enrollments where id = any(v_enrs);
  delete from subscriptions where id = any(v_subs);
  delete from submissions where trainee_id = p_id; delete from attempts where trainee_id = p_id; delete from messages where trainee_id = p_id;
  delete from ratings where trainee_id = p_id; delete from notifications where trainee_id = p_id; delete from guardian_links where trainee_id = p_id;
  delete from profile_change_requests where trainee_id = p_id; delete from policy_acceptances where trainee_id = p_id;
  update trainer_groups set trainee_ids = array_remove(trainee_ids, p_id) where p_id = any(trainee_ids);
  update assignments set targets = array_remove(targets, p_id) where p_id = any(targets);
  if not exists (select 1 from trainees x where x.id <> p_id and (x.phone = t.phone or x.guardian_phone = t.phone)) and not exists (select 1 from teachers where phone = t.phone) then
    delete from device_sessions where phone = t.phone; delete from activation_windows where phone = t.phone; delete from login_requests where phone = t.phone;
    delete from activation_attempts where phone = t.phone; delete from custom_requests where phone = t.phone;
  end if;
  delete from trainees where id = p_id;
  -- تقارير اليوم المحفوظة: الاسم يُستبدل
  update daily_reports r set data = jsonb_set(r.data, '{groups}', coalesce((select jsonb_agg(jsonb_set(g, '{rows}', coalesce((select jsonb_agg(case when x->>'name' = t.full_name then jsonb_set(x, '{name}', '"متدرب محذوف"') else x end) from jsonb_array_elements(g->'rows') x), '[]'))) from jsonb_array_elements(r.data->'groups') g), '[]'))
   where r.data::text like '%' || t.full_name || '%';
  -- سجل الحركات: يُحذف ما يخصه (بما فيه حركات الحذف نفسها) ويُسجَّل حدث واحد بلا بيانات شخصية
  perform set_config('app.audit_purge', 'on', true);
  delete from audit_logs where entity = any(ids) or detail::text like '%' || p_id::text || '%' or (t.national_id <> '' and detail::text like '%' || t.national_id || '%');
  get diagnostics n = row_count;
  perform set_config('app.audit_purge', 'off', true);
  perform set_config('app.trainee_purge', 'off', true);
  insert into audit_logs(actor, actor_role, actor_name, action, entity, detail)
  values (auth.uid(), coalesce((select role from admins where user_id = auth.uid()), 'system'), (select name from admins where user_id = auth.uid()), 'trainees.purge', null,
          jsonb_build_object('mode', p_mode, 'reason', left(coalesce(p_reason, ''), 200), 'subscriptions', cardinality(v_subs), 'enrollments', cardinality(v_enrs), 'orders', cardinality(v_ords), 'invoices', cardinality(v_invs), 'audit_rows', n));
  return jsonb_build_object('ok', true);
end $$;

-- الحذف اليدوي: المالك ومدير النظام، بإعادة إدخال كلمة المرور وكتابة الاسم
create or replace function admin_delete_trainee(p_id uuid, p_confirm text, p_reason text) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare t trainees;
begin
  if not is_full_admin() then raise exception 'حذف المتدربين للمالك ومدير النظام فقط'; end if;
  if not recent_password_auth() then raise exception 'أعد إدخال كلمة المرور لتأكيد الحذف'; end if;
  select * into t from trainees where id = p_id;
  if t.id is null then raise exception 'المتدرب غير موجود'; end if;
  if regexp_replace(btrim(coalesce(p_confirm, '')), '\s+', ' ', 'g') <> regexp_replace(btrim(t.full_name), '\s+', ' ', 'g') then raise exception 'اكتب اسم المتدرب كما هو لتأكيد الحذف'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then raise exception 'اكتب سبب الحذف'; end if;
  return trainee_purge(p_id, 'manual', p_reason);
end $$;

-- «بيانات مؤرشفة»: من انتهت خدماته (والمنسحبون) مع موعد الحذف الآلي
create or replace function admin_archived_trainees() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_days int := (select archive_retention_days from settings where id = 1);
begin
  if not is_full_admin() then raise exception 'للمالك ومدير النظام فقط'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'full_name', t.full_name, 'national_id', t.national_id, 'phone', t.phone, 'is_test', t.is_test,
            'state', s.state, 'completed_on', s.completed_on, 'remaining', s.remaining, 'purge_on', case when s.state = 'completed' then s.completed_on + v_days end) order by s.completed_on nulls last, t.full_name)
    from trainees t cross join lateral trainee_service_state(t.id) s where s.state in ('completed', 'withdrawn')), '[]');
end $$;

-- الحذف الآلي اليومي: المكتملة خدماتهم منذ مدة الحفظ، بلا متبقٍ عليهم
create or replace function purge_archived_trainees() returns int
language plpgsql volatile security definer set search_path = public as $$
declare v_days int := (select archive_retention_days from settings where id = 1); r record; n int := 0;
begin
  for r in select t.id from trainees t cross join lateral trainee_service_state(t.id) s
           where s.state = 'completed' and s.completed_on + v_days <= riyadh_now()::date and s.remaining = 0 loop
    perform trainee_purge(r.id, 'auto', 'انقضت مدة الحفظ بعد انتهاء الخدمة'); n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function trainee_service_state(uuid), trainee_purge(uuid, text, text), purge_archived_trainees() from public, anon, authenticated;
revoke execute on function admin_delete_trainee(uuid, text, text), admin_archived_trainees() from public, anon;
grant execute on function admin_delete_trainee(uuid, text, text), admin_archived_trainees() to authenticated;
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sama-archive-purge', '40 0 * * *', 'select public.purge_archived_trainees()');
  end if;
end $$;
