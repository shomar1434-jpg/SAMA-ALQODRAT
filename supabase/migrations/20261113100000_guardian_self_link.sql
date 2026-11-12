-- =====================================================================
-- الخطوة C — ربط ولي الأمر الذاتي بالسجل المدني للابن. ثلاثة شروط معًا:
-- (1) المتدرب صرّح بجوال ولي الأمر عند التسجيل، (2) ولي الأمر أثبت ملكية الجوال برمز التحقق (my_phone)،
-- (3) كتب السجل المدني الصحيح. الرفض برسالة واحدة لا تكشف السبب، و5 محاولات فاشلة في الساعة،
-- وما ألغته الإدارة لا يُعاد ذاتيًا. مطابق لـ selfLinkLogic في src/identity_logic.js.
-- =====================================================================
alter table guardian_links add column if not exists source text not null default 'admin' check (source in ('admin','self'));
create table if not exists guardian_link_attempts (
  id uuid primary key default gen_random_uuid(), phone text not null, nid_hash text not null,
  ok boolean not null, reason text, at timestamptz not null default now()
);
create index if not exists guardian_link_attempts_phone on guardian_link_attempts(phone, at);
alter table guardian_link_attempts enable row level security;
drop policy if exists guardian_link_attempts_admin on guardian_link_attempts;
create policy guardian_link_attempts_admin on guardian_link_attempts for select using (is_admin());

create or replace function portal_roles() returns text[] language sql stable security definer set search_path = public as $$
  select array_remove(array[
    case when exists (select 1 from teachers where active and phone = my_phone()) then 'teacher' end,
    case when exists (select 1 from trainees t where t.phone = my_phone() and (
           exists (select 1 from subscriptions s where s.trainee_id = t.id)
        or exists (select 1 from enrollments e where e.trainee_id = t.id and e.status <> 'ملغى'))) then 'student' end,
    case when exists (select 1 from guardian_links where status = 'verified' and guardian_phone = my_phone())
           or exists (select 1 from trainees where guardian_phone = my_phone()) then 'guardian' end,
    case when is_admin() then 'admin' end], null);
$$;

create or replace function guardian_self_link(p_nid text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare ph text := my_phone(); v_nid text := trim(coalesce(p_nid,'')); t trainees%rowtype; v_reason text; v_already boolean := false;
begin
  if ph is null or ph = '' then raise exception 'انتهت الجلسة، سجّل الدخول مجددًا'; end if;
  if (select count(*) from guardian_link_attempts where phone = ph and not ok and at > now() - interval '1 hour') >= 5 then
    raise exception 'تجاوزت عدد المحاولات. حاول بعد ساعة، أو راجع إدارة المعهد.'; end if;
  select * into t from trainees where national_id = v_nid and guardian_phone = ph;
  if t.id is null then v_reason := 'no_match';
  elsif exists (select 1 from guardian_links where trainee_id = t.id and guardian_phone = ph and status = 'verified') then v_already := true;
  elsif exists (select 1 from guardian_links where trainee_id = t.id and guardian_phone = ph and status = 'revoked') then v_reason := 'revoked';
  end if;
  insert into guardian_link_attempts(phone, nid_hash, ok, reason) values (ph, md5('sama:' || v_nid), v_reason is null, v_reason);
  if v_reason is not null then return jsonb_build_object('ok', false); end if;     -- الرسالة الموحدة من الواجهة؛ لا استثناء كي تُحفظ المحاولة
  if not v_already then
    insert into guardian_links(guardian_phone, trainee_id, relation, status, source) values (ph, t.id, 'ولي الأمر', 'verified', 'self');
  end if;
  return jsonb_build_object('ok', true, 'already', v_already);
end $$;
revoke execute on function guardian_self_link(text) from public, anon;
grant execute on function guardian_self_link(text) to authenticated;
