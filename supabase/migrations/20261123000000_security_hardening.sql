-- الخطوة BT (فحص أمني 23 نوفمبر، موافقة المالك): إحكام دون تغيير سلوك الاستخدام العادي.
-- 1) التحضير: حد للمحاولات الفاشلة (15 لكل جهاز و60 لكل عنوان شبكة في 10 دقائق؛ «سبق التحضير» لا يُحتسب)،
--    والنجاح يعيد الاسم الأول فقط (الواجهة لا تعرض غيره) فلا يصير التحضير وسيلة لمعرفة الاسم الكامل من الهوية.
-- 2) verify_certificate: صفحة التحقق العامة أُلغيت (البند 8)؛ الأرقام متسلسلة فتُغلق على غير المسؤولين.
-- 3) archive_ended_cohorts: للمسؤول وحده (تستدعيها لوحة الإدارة وفتح الدفعة).
-- 4) سحب TRUNCATE من anon/authenticated (لا يمر عبر RLS؛ والواجهة لا تستعمله).
alter table checkin_attempts add column if not exists ip_hash text;
create index if not exists checkin_attempts_at on checkin_attempts(at);

create or replace function checkin(p_nid text, p_code text default null, p_program text default null, p_device text default '', p_choice text default null)
returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; v_ip text := coalesce(pl_ip_hash(), ''); v_dev text := left(coalesce(p_device, ''), 64); v_from bigint;
begin
  if (v_dev <> '' and (select count(*) from checkin_attempts where at > now() - interval '10 minutes' and device = v_dev and result not in ('ok', 'already')) >= 15)
     or (v_ip <> '' and (select count(*) from checkin_attempts where at > now() - interval '10 minutes' and ip_hash = v_ip and result not in ('ok', 'already')) >= 60) then
    insert into checkin_attempts(date, nid_hash, device, result, kind, trainee_hint, ip_hash)
    values (riyadh_now()::date, md5('sama:' || coalesce(p_nid, '')), v_dev, 'rate_limited', 'limit', null, nullif(v_ip, ''));
    return jsonb_build_object('ok', false, 'reason', 'rate_limited');
  end if;
  select coalesce(max(id), 0) into v_from from checkin_attempts;
  perform set_config('sama.checkin', 'on', true);
  begin
    r := checkin_noorder(p_nid, p_code, p_program, p_device, p_choice);
  exception when sqlstate 'SAM01' then
    r := jsonb_build_object('ok', false, 'reason', 'order_pending');
    insert into checkin_attempts(date, nid_hash, device, result, kind, trainee_hint)
    values (riyadh_now()::date, md5('sama:' || coalesce(p_nid, '')), v_dev, 'order_pending', 'order', null);
  end;
  perform set_config('sama.checkin', '', true);
  if v_ip <> '' then update checkin_attempts set ip_hash = v_ip where id > v_from and ip_hash is null; end if;
  if not coalesce((r->>'ok')::boolean, false) then r := r - 'name';
  elsif r ? 'name' then r := r || jsonb_build_object('name', split_part(btrim(r->>'name'), ' ', 1)); end if;
  return r;
end $$;

create or replace function verify_certificate(p_serial text) returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('serial',x.serial,'revoked',x.revoked,'issued_at',x.issued_at,'rate',x.rate,
    'name_masked', case when array_length(regexp_split_to_array(trim(t.full_name),'\s+'),1) <= 2 then trim(t.full_name)
                        else split_part(trim(t.full_name),' ',1) || ' ••• ' || (regexp_split_to_array(trim(t.full_name),'\s+'))[array_length(regexp_split_to_array(trim(t.full_name),'\s+'),1)] end,
    'gender',t.gender,'program',p.name,'category',p.category,'accreditation_no',p.accreditation_no,'hours',p.hours,'number',c.number,'start_date',c.start_date,'end_date',c.end_date)
  from certificates x join trainees t on t.id=x.trainee_id join programs p on p.id=x.program_id join cohorts c on c.id=x.cohort_id
  where is_admin() and upper(x.serial) = upper(trim(p_serial));
$$;

create or replace function archive_ended_cohorts() returns int language plpgsql volatile security definer set search_path = public as $$
declare r record; n int := 0;
begin
  if not is_admin() then return 0; end if;
  for r in update cohorts set archived_at = now(), archived_auto = true, reg_open = false
           where archived_at is null and end_date < riyadh_now()::date returning id loop
    perform _issue_certificates(r.id); n := n + 1;
  end loop;
  return n;
end $$;

do $$ declare t record; begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind in ('r', 'p') loop
    execute format('revoke truncate on public.%I from anon, authenticated', t.relname);
  end loop;
end $$;
