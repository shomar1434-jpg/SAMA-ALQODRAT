-- الخطوة BA (البند 13): حسابات تجريبية معزولة بوسم is_test. هوية اصطناعية لا تجتاز تحقق السجل المدني (فلا تطابق شخصًا حقيقيًا)،
-- وجوال اصطناعي غير مستخدم؛ تُستبعد من تقرير اليوم والإحصاءات والملخصات والإشعارات والشهادات والفوترة، وتُزال بأمان دون مساس بالحقيقية.
alter table trainees add column if not exists is_test boolean not null default false;
create index if not exists trainees_is_test on trainees(is_test) where is_test;

create or replace function saudi_id_valid(p text) returns boolean language plpgsql immutable as $$
declare s int := 0; d int;
begin
  if p !~ '^[12][0-9]{9}$' then return false; end if;
  for i in 1..10 loop d := substr(p, i, 1)::int; if i % 2 = 1 then d := d * 2; if d > 9 then d := d - 9; end if; end if; s := s + d; end loop;
  return s % 10 = 0;
end $$;

-- إنشاء حساب تجريبي (مدير النظام): متدرب is_test باشتراك قائم في باقة حضورية، بلا طلب شراء ولا فواتير
create or replace function admin_create_test_trainee(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare pl plans; v_nid text; v_phone text := translate(btrim(coalesce(p->>'phone','')), '٠١٢٣٤٥٦٧٨٩', '0123456789'); v_name text := btrim(coalesce(p->>'full_name',''));
  v_gender text := coalesce(nullif(p->>'gender',''), 'ذكر'); t trainees; s subscriptions;
begin
  if not is_full_admin() then raise exception 'إنشاء الحسابات التجريبية لمدير النظام فقط'; end if;
  if length(v_name) < 5 then v_name := 'متدرب تجريبي ' || to_char(now(), 'MIDDSS'); end if;
  if v_name not like '%تجريبي%' then v_name := v_name || ' (تجريبي)'; end if;
  select * into pl from plans where id = nullif(p->>'plan_id','')::uuid and active and mode = 'in_person';
  if pl.id is null then raise exception 'اختر باقة حضورية'; end if;
  loop v_nid := '1' || lpad((floor(random() * 1e9))::bigint::text, 9, '0'); exit when not saudi_id_valid(v_nid) and not exists (select 1 from trainees where national_id = v_nid); end loop;
  if v_phone = '' then
    loop v_phone := '05000' || lpad((floor(random() * 1e5))::int::text, 5, '0');
      exit when not exists (select 1 from trainees where phone = v_phone or guardian_phone = v_phone) and not exists (select 1 from teachers where phone = v_phone); end loop;
  elsif v_phone !~ '^05[0-9]{8}$' then raise exception 'رقم الجوال غير صحيح';
  elsif exists (select 1 from trainees where (phone = v_phone or guardian_phone = v_phone) and not is_test) or exists (select 1 from teachers where phone = v_phone) then raise exception 'هذا الجوال لحساب حقيقي؛ اختر جوالًا اصطناعيًا';
  end if;
  insert into trainees(national_id, full_name, phone, gender, is_test) values (v_nid, v_name, v_phone, v_gender, true) returning * into t;
  insert into subscriptions(ref, trainee_id, plan_id, section, subjects, status, start_date, end_date, start_manual)
  values ('SQ-T' || lpad((floor(random() * 1e6))::int::text, 6, '0'), t.id, pl.id, case when v_gender = 'أنثى' then 'girls' else 'boys' end, pl.subjects, 'active', riyadh_now()::date, sub_end(pl.id, riyadh_now()::date), true) returning * into s;
  return jsonb_build_object('ok', true, 'id', t.id, 'national_id', v_nid, 'phone', v_phone, 'full_name', v_name);
end $$;

-- إزالة آمنة: الحسابات التجريبية وحدها، وتُرفض إن كان لها طلب شراء أو فاتورة أو تسجيل في دفعة
create or replace function admin_purge_test_trainee(p_id uuid) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare t trainees;
begin
  if not is_full_admin() then raise exception 'لمدير النظام فقط'; end if;
  select * into t from trainees where id = p_id for update;
  if t.id is null or not t.is_test then raise exception 'تُزال الحسابات التجريبية وحدها'; end if;
  if exists (select 1 from orders where trainee_id = p_id) or exists (select 1 from invoices where trainee_id = p_id) or exists (select 1 from enrollments where trainee_id = p_id) then
    raise exception 'للحساب سجلات مالية أو تسجيل في دفعة؛ لا يُزال'; end if;
  delete from sub_attendance where subscription_id in (select id from subscriptions where trainee_id = p_id);
  delete from submissions where trainee_id = p_id; delete from attempts where trainee_id = p_id; delete from messages where trainee_id = p_id; delete from ratings where trainee_id = p_id;
  delete from notifications where trainee_id = p_id; delete from guardian_links where trainee_id = p_id; delete from profile_change_requests where trainee_id = p_id;
  delete from program_requests where trainee_id = p_id; delete from policy_acceptances where trainee_id = p_id;
  delete from subscriptions where trainee_id = p_id; delete from device_sessions where phone = t.phone and not exists (select 1 from trainees x where x.phone = t.phone and x.id <> p_id);
  delete from trainees where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

-- تقرير اليوم يستبعد الحسابات التجريبية
create or replace function build_daily_report(p_date date) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare n timestamp := riyadh_now(); groups jsonb := '[]'; g jsonb; sec text; ses record; c record; v_rows jsonb; v_done boolean; v_all jsonb := '[]';
begin
  foreach sec in array array['girls','boys'] loop
    select * into ses from session_on(sec, p_date);
    if ses.start_time is null then continue; end if;
    v_done := p_date < n::date or n::time > ses.end_time;
    select coalesce(jsonb_agg(jsonb_build_object('name', t.full_name, 'plan', plan_label(pl), 'status', coalesce(a.status, case when v_done then 'غائب' else 'لم يسجل بعد' end),
             'time', to_char(a.checkin_at at time zone 'Asia/Riyadh','HH24:MI'), 'manual', coalesce(a.manual,false)) order by t.full_name), '[]')
      into v_rows
      from subscriptions s join trainees t on t.id = s.trainee_id join plans pl on pl.id = s.plan_id
      left join sub_attendance a on a.subscription_id = s.id and a.att_date = p_date
     where s.section = sec and not t.is_test and s.status <> 'cancelled' and (s.start_date is null or s.start_date <= p_date) and (s.end_date is null or s.end_date >= p_date);
    groups := groups || jsonb_build_object('key', sec, 'label', case sec when 'girls' then 'البنات' else 'البنون' end, 'session', jsonb_build_object('start', to_char(ses.start_time,'HH24:MI'), 'end', to_char(ses.end_time,'HH24:MI')), 'rows', v_rows);
    v_all := v_all || v_rows;
  end loop;
  for c in select x.*, p.name pname from cohorts x join programs p on p.id = x.program_id
           where x.start_date <= p_date and x.end_date >= p_date and extract(dow from p_date)::int = any(x.days) and (x.archived_at is null or x.archived_at::date >= p_date) loop
    v_done := p_date < n::date or n::time > c.end_time;
    select coalesce(jsonb_agg(jsonb_build_object('name', t.full_name, 'status', coalesce(a.status, case when v_done then 'غائب' else 'لم يسجل بعد' end),
             'time', to_char(a.checkin_at at time zone 'Asia/Riyadh','HH24:MI'), 'manual', false) order by t.full_name), '[]')
      into v_rows from enrollments e join trainees t on t.id = e.trainee_id left join attendance a on a.enrollment_id = e.id and a.att_date = p_date
     where e.cohort_id = c.id and e.status <> 'ملغى' and not t.is_test;
    groups := groups || jsonb_build_object('key', c.id, 'label', c.pname || ' · الدفعة ' || c.number, 'session', jsonb_build_object('start', to_char(c.start_time,'HH24:MI'), 'end', to_char(c.end_time,'HH24:MI')), 'rows', v_rows);
    v_all := v_all || v_rows;
  end loop;
  return jsonb_build_object('date', p_date, 'closed', p_date < n::date or n::time >= time '20:30', 'generated_at', now(),
    'summary', jsonb_build_object('sessions_scheduled', jsonb_array_length(groups), 'expected', jsonb_array_length(v_all),
      'present', (select count(*) from jsonb_array_elements(v_all) x where x->>'status' = 'حاضر'), 'late', (select count(*) from jsonb_array_elements(v_all) x where x->>'status' = 'متأخر'),
      'absent', (select count(*) from jsonb_array_elements(v_all) x where x->>'status' = 'غائب'), 'pending', (select count(*) from jsonb_array_elements(v_all) x where x->>'status' = 'لم يسجل بعد'), 'excused', 0),
    'groups', groups,
    'incidents', coalesce((select jsonb_agg(jsonb_build_object('type', case when result = 'already' then 'duplicate' else 'checkin_fail' end,
        'text', case result when 'already' then 'مسح مكرر في اليوم نفسه (لم يُحتسب مرتين)' when 'not_in_cohort' then 'محاولات تحضير مرفوضة: رقم غير مسجّل' when 'no_session' then 'محاولات تحضير مرفوضة: خارج وقت الجلسة'
                     when 'bad_code' then 'محاولات تحضير مرفوضة: رمز يوم خاطئ' else 'محاولات تحضير مرفوضة: ' || result end, 'count', cnt))
        from (select result, count(*) cnt from checkin_attempts where date = p_date and result <> 'ok' group by result) q), '[]')
      || coalesce((select jsonb_agg(jsonb_build_object('type','device','text','تحضير أكثر من متدرب من جهاز واحد','count',k))
        from (select count(distinct trainee_hint) k from checkin_attempts where date = p_date and result in ('ok','already') and device <> '' and trainee_hint is not null group by device having count(distinct trainee_hint) > 1) q), '[]'),
    'teachers', coalesce((select jsonb_agg(jsonb_build_object('teacher', te.full_name, 'reminders', q.r, 'guardians', q.g))
        from (select sender, count(*) filter (where "to" = 'student') r, count(*) filter (where "to" = 'guardian') g from notifications where date = p_date and sender like 'teacher:%' group by sender) q
        join teachers te on 'teacher:' || te.id = q.sender), '[]'),
    'homework', '[]'::jsonb,
    'completeness', case when p_date < n::date or n::time >= time '20:30' then 'مكتملة حتى وقت التوليد' else 'جزئية: اليوم لم ينتهِ بعد' end);
end $$;
revoke execute on function saudi_id_valid(text) from public, anon, authenticated;
revoke execute on function admin_create_test_trainee(jsonb), admin_purge_test_trainee(uuid) from public, anon;
grant execute on function admin_create_test_trainee(jsonb), admin_purge_test_trainee(uuid) to authenticated;
