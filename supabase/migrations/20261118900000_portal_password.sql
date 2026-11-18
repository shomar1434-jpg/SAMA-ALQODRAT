-- الخطوة BJ (قرار المالك 18 نوفمبر):
-- 1) كلمة مرور البوابات: أول مرة رقم الهوية ← رمز التحقق (بتفعيل الإدارة) ← تعيين كلمة مرور وتأكيدها؛ بعدها الدخول من أي جهاز بالهوية وكلمة المرور.
--    «نسيت كلمة المرور» = طلب تفعيل جديد من الإدارة؛ وبعد الدخول بالرمز تُعيَّن كلمة جديدة وتخرج الأجهزة الأخرى (يُلغى التفعيل السابق).
--    لا تُمسح كلمة المرور بطلب مجهول (حتى لا يُغلق أحدٌ حساب غيره برقم هويته). التجزئة bcrypt، وقفل بعد 5 محاولات خاطئة/ساعة.
-- 2) كشف اليوم لا يضم من اشتراكه «بانتظار أول حضور» ↔ src/report_logic.js

create table if not exists portal_passwords (
  phone text not null, role text not null check (role in ('student','guardian','teacher')),
  pass_hash text not null, set_at timestamptz not null default now(),
  primary key (phone, role)
);
alter table portal_passwords enable row level security;
revoke all on portal_passwords from anon, authenticated;

-- قاعدة كلمة المرور (يطابق checkPassword): 8–72 حرفًا، فيها حرف ورقم
create or replace function pw_ok(p text) returns boolean language sql immutable set search_path = public, extensions as $$
  select length(coalesce(p,'')) between 8 and 72 and p ~ '[0-9]' and p ~ '[^0-9[:space:]]' $$;

-- الجهاز دخل للتو برمز تفعيل الإدارة (خلال 30 دقيقة): يعيّن كلمة جديدة دون الحالية
create or replace function pw_fresh_activation(p_phone text, p_role text, p_after timestamptz) returns boolean language sql stable security definer set search_path = public, extensions as $$
  select exists (select 1 from login_requests r where r.uid = auth.uid() and r.phone = p_phone and r.role = p_role and r.window_id is not null
                  and r.used_at is not null and r.used_at > greatest(now() - interval '30 minutes', coalesce(p_after, '-infinity'::timestamptz)) and r.code_hash is not null) $$;

create or replace function portal_password_status(p_role text) returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
declare d device_sessions := my_device(p_role); pw portal_passwords;
begin
  if d.uid is null then return jsonb_build_object('has', false, 'must_set', false); end if;
  select * into pw from portal_passwords where phone = d.phone and role = p_role;
  return jsonb_build_object('has', pw.phone is not null,
    'must_set', pw.phone is null or pw_fresh_activation(d.phone, p_role, pw.set_at));
end $$;

create or replace function portal_set_password(p_role text, p_new text, p_current text default null) returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare d device_sessions := my_device(p_role); pw portal_passwords; n int;
begin
  if d.uid is null or not phone_has_role(d.phone, p_role) then raise exception 'سجّل الدخول أولًا'; end if;
  if not pw_ok(p_new) then raise exception 'كلمة المرور 8 أحرف على الأقل، وفيها حرف ورقم'; end if;
  select * into pw from portal_passwords where phone = d.phone and role = p_role for update;
  if pw.phone is not null and not pw_fresh_activation(d.phone, p_role, pw.set_at) then
    if (select count(*) from activation_attempts where not ok and at > now() - interval '60 minutes' and (phone = d.phone or uid = d.uid)) >= 5 then
      raise exception 'محاولات كثيرة خاطئة. حاول بعد ساعة.'; end if;
    if p_current is null or pw.pass_hash <> crypt(p_current, pw.pass_hash) then
      insert into activation_attempts(phone, uid, ok) values (d.phone, d.uid, false);
      raise exception 'كلمة المرور الحالية غير صحيحة'; end if;
  end if;
  insert into portal_passwords(phone, role, pass_hash, set_at) values (d.phone, p_role, crypt(p_new, gen_salt('bf', 10)), clock_timestamp())
    on conflict (phone, role) do update set pass_hash = excluded.pass_hash, set_at = clock_timestamp();
  -- تعيين كلمة مرور يُخرج الأجهزة الأخرى (يُلغي التفعيل السابق)
  update device_sessions set revoked_at = now() where phone = d.phone and role = p_role and revoked_at is null and uid <> d.uid;
  get diagnostics n = row_count;
  return jsonb_build_object('ok', true, 'revoked', n);
end $$;

create or replace function portal_password_login(p_ident text, p_role text, p_pass text) returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare v_uid uuid := auth.uid(); ph text := resolve_ident(p_ident, p_role); pw portal_passwords;
        v_key text := left(coalesce(ph, regexp_replace(coalesce(p_ident,''), '[^0-9]', '', 'g')), 15);
begin
  if v_uid is null or p_role not in ('student','guardian','teacher') then raise exception 'ابدأ الدخول من جديد'; end if;
  if (select count(*) from activation_attempts where not ok and at > now() - interval '60 minutes' and (phone = v_key or uid = v_uid)) >= 5 then
    raise exception 'محاولات كثيرة خاطئة. حاول بعد ساعة، أو اضغط «نسيت كلمة المرور».'; end if;
  if ph is not null and phone_has_role(ph, p_role) then select * into pw from portal_passwords where phone = ph and role = p_role; end if;
  if pw.phone is null or pw.pass_hash <> crypt(coalesce(p_pass, ''), pw.pass_hash) then
    insert into activation_attempts(phone, uid, ok) values (v_key, v_uid, false);
    return jsonb_build_object('ok', false, 'error', 'رقم الهوية أو كلمة المرور غير صحيحة. إن كانت أول مرة فاختر «أول دخول برمز التحقق».');
  end if;
  insert into device_sessions(uid, phone, role, label) values (v_uid, ph, p_role, '')
    on conflict (uid) do update set phone = excluded.phone, role = excluded.role, label = '', created_at = now(), revoked_at = null;
  insert into activation_attempts(phone, uid, ok) values (ph, v_uid, true);
  return jsonb_build_object('ok', true);
end $$;

-- إخراج الإدارة لأجهزة الحساب لا يمس كلمة المرور؛ وإعادة الضبط تكون بتفعيل جديد ثم كلمة جديدة
-- حذف المتدرب يحذف كلمة مروره (وكلمة ولي أمره إن لم يبق له ابن آخر)
create or replace function trainee_pw_cleanup() returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from trainees x where x.phone = old.phone and x.id <> old.id) then delete from portal_passwords where phone = old.phone and role = 'student'; end if;
  if coalesce(old.guardian_phone, '') <> '' and not exists (select 1 from trainees x where x.guardian_phone = old.guardian_phone and x.id <> old.id)
     and not exists (select 1 from guardian_links l where l.guardian_phone = old.guardian_phone and l.trainee_id <> old.id and l.status = 'verified') then
    delete from portal_passwords where phone = old.guardian_phone and role = 'guardian'; end if;
  return old;
end $$;
drop trigger if exists trainees_pw_cleanup on trainees;
create trigger trainees_pw_cleanup after delete on trainees for each row execute function trainee_pw_cleanup();

-- كشف اليوم: المشتركون الذين بدأ اشتراكهم فقط (لا «بانتظار أول حضور»)
create or replace function build_daily_report(p_date date) returns jsonb language plpgsql stable security definer set search_path = public, extensions as $$
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
     where s.section = sec and not t.is_test and s.status <> 'cancelled' and s.start_date is not null and s.start_date <= p_date and (s.end_date is null or s.end_date >= p_date);
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

revoke execute on function pw_ok(text), pw_fresh_activation(text, text, timestamptz), trainee_pw_cleanup() from public, anon, authenticated;
revoke execute on function portal_password_status(text), portal_set_password(text, text, text), portal_password_login(text, text, text) from public, anon;
grant execute on function portal_password_status(text), portal_set_password(text, text, text), portal_password_login(text, text, text) to authenticated;
