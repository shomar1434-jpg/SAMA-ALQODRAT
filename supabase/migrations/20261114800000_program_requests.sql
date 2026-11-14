-- الخطوة AA: كل البرامج النشطة متاحة للتسجيل (قرار المالك)
-- البرنامج الذي له دفعة مفتوحة: تسجيل مباشر كما هو. والبرنامج بلا دفعة مفتوحة (أو اكتملت مقاعدها): «تسجيل مبدئي»
-- يُحفظ في program_requests، وتنقله الإدارة إلى الدفعة عند فتحها فيُنشأ التسجيل وطلب الشراء حينها (لا يُطلب سداد قبل تحديد الدفعة).

create table if not exists program_requests (
  id          uuid primary key default gen_random_uuid(),
  ref         text not null,
  program_id  uuid not null references programs(id) on delete restrict,
  trainee_id  uuid not null references trainees(id) on delete restrict,
  status      text not null default 'pending' check (status in ('pending','placed','cancelled')),
  cohort_id   uuid references cohorts(id) on delete restrict,
  enrollment_id uuid references enrollments(id) on delete restrict,
  note        text not null default '',
  created_at  timestamptz not null default now(),
  decided_at  timestamptz,
  decided_by  uuid
);
create unique index if not exists program_requests_one_pending on program_requests(program_id, trainee_id) where status = 'pending';
create index if not exists program_requests_program on program_requests(program_id, status);
alter table program_requests enable row level security;
drop policy if exists program_requests_admin on program_requests;
create policy program_requests_admin on program_requests for all using (is_admin()) with check (is_admin());
drop trigger if exists program_requests_audit on program_requests;
create trigger program_requests_audit after insert or update or delete on program_requests for each row execute function audit_row();

-- هل في البرنامج دفعة يُسجَّل فيها الآن؟
create or replace function program_open_cohort(p_program uuid) returns cohorts language plpgsql stable security definer set search_path = public as $$
declare c cohorts := active_cohort(p_program);
begin
  if c.id is null or not c.reg_open or (select count(*) from enrollments where cohort_id = c.id and status <> 'ملغى') >= c.seats then return null; end if;
  return c;
end $$;

-- التسجيل المبدئي: نفس ضوابط التسجيل (السجل، الاسم، الجوال، ولي الأمر، حماية الهوية) بلا دفعة ولا طلب شراء
create or replace function register_program_request(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare pr programs; g text; ids uuid[]; v_ex boolean; v_t uuid; v_ref text := 'SR-' || lpad((floor(random()*900000)+100000)::text, 6, '0');
begin
  if coalesce(p->>'national_id','') !~ '^[12][0-9]{9}$' then raise exception 'رقم السجل المدني غير صحيح'; end if;
  if coalesce(p->>'phone','') !~ '^05[0-9]{8}$' then raise exception 'رقم الجوال غير صحيح'; end if;
  if length(btrim(coalesce(p->>'full_name',''))) < 3 then raise exception 'اكتب الاسم الرباعي'; end if;
  select * into pr from programs where id = (p->>'program_id')::uuid and active;
  if pr.id is null then raise exception 'البرنامج غير متاح'; end if;
  g := reg_guardian(p); ids := check_policy_acceptance(p);
  v_ex := exists (select 1 from trainees where national_id = p->>'national_id');
  if exists (select 1 from program_requests r join trainees t on t.id = r.trainee_id where r.program_id = pr.id and r.status = 'pending' and t.national_id = p->>'national_id') then
    raise exception 'سبق تسجيلك المبدئي في «%»؛ يتواصل معك المركز عند فتح الدفعة', pr.name; end if;
  perform set_config('sama.registering', 'on', true);
  insert into trainees(national_id, full_name, phone, email, gender, birth_date, city, education, employer)
  values (p->>'national_id', btrim(p->>'full_name'), p->>'phone', nullif(p->>'email',''), nullif(p->>'gender',''), nullif(p->>'birth_date','')::date,
          nullif(p->>'city',''), nullif(p->>'education',''), nullif(p->>'employer',''))
  on conflict (national_id) do update set full_name=excluded.full_name, phone=excluded.phone, email=coalesce(excluded.email,trainees.email),
     gender=coalesce(excluded.gender,trainees.gender), birth_date=coalesce(excluded.birth_date,trainees.birth_date), city=coalesce(excluded.city,trainees.city),
     education=coalesce(excluded.education,trainees.education), employer=coalesce(excluded.employer,trainees.employer)
  returning id into v_t;
  perform set_config('sama.registering', '', true);
  perform reg_apply_guardian(p->>'national_id', v_ex, g);
  perform record_policy_acceptance(ids, p->>'national_id', 'registration');
  insert into program_requests(ref, program_id, trainee_id) values (v_ref, pr.id, v_t);
  return jsonb_build_object('ok', true, 'ref', v_ref, 'request', true, 'program', pr.name, 'cohorts', '[]'::jsonb);
end $$;

-- التسجيل العام: برنامج بلا دفعة مفتوحة ← تسجيل مبدئي، وما عداه كما كان
alter function register_trainee(jsonb) rename to register_trainee_direct;
create or replace function register_trainee(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_pid uuid;
begin
  perform archive_ended_cohorts();
  begin v_pid := nullif(p->>'program_id','')::uuid; exception when others then v_pid := null; end;
  if nullif(p->>'package_id','') is null and v_pid is not null and (program_open_cohort(v_pid)).id is null then
    return register_program_request(p);
  end if;
  return register_trainee_direct(p);
end $$;
revoke execute on function register_trainee_direct(jsonb), register_program_request(jsonb), program_open_cohort(uuid) from public, anon, authenticated;
grant execute on function register_trainee(jsonb) to anon, authenticated;

-- الإدارة: نقل طلبات مبدئية إلى الدفعة المفتوحة للبرنامج (تسجيل + طلب شراء لكل متدرب)
create or replace function admin_place_requests(p_ids uuid[]) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r program_requests; c cohorts; pr programs; v_e uuid; v_ref text; n int := 0; v_full int := 0;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  for r in select * from program_requests where id = any(p_ids) and status = 'pending' order by created_at for update loop
    c := program_open_cohort(r.program_id);
    select * into pr from programs where id = r.program_id;
    if c.id is null then
      if n = 0 and v_full = 0 then raise exception 'لا توجد دفعة مفتوحة للتسجيل في «%»؛ افتح دفعة أولًا', pr.name; end if;
      v_full := v_full + 1; continue;
    end if;
    v_ref := 'SQ-' || lpad((floor(random()*900000)+100000)::text, 6, '0');
    insert into enrollments(ref, cohort_id, program_id, trainee_id) values (v_ref, c.id, r.program_id, r.trainee_id)
      on conflict (cohort_id, trainee_id) do update set status = 'مسجل' returning id into v_e;
    if not exists (select 1 from orders where enrollment_ids @> array[v_e]) then
      perform new_order(r.trainee_id, 'program', null, array[v_e], pr.name, coalesce(pr.price, 0), coalesce(pr.price, 0));
    end if;
    update program_requests set status = 'placed', cohort_id = c.id, enrollment_id = v_e, decided_at = now(), decided_by = auth.uid() where id = r.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('ok', true, 'placed', n, 'skipped', v_full);
end $$;
create or replace function admin_cancel_request(p_id uuid, p_reason text) returns jsonb language plpgsql volatile security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'اكتب سبب الإلغاء'; end if;
  update program_requests set status = 'cancelled', note = left(btrim(p_reason), 300), decided_at = now(), decided_by = auth.uid() where id = p_id and status = 'pending';
  if not found then raise exception 'الطلب غير موجود أو سبق البت فيه'; end if;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function admin_place_requests(uuid[]), admin_cancel_request(uuid, text) from public, anon;
grant execute on function admin_place_requests(uuid[]), admin_cancel_request(uuid, text) to authenticated;
