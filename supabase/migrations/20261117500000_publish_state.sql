-- الخطوة AX (البند 14 من «طلبات نهائية»): حالة عرض البرنامج في الرئيسية يحددها المدير من «الدفعات والكشوف».
-- publish_state: null = تلقائي (مفتوح إن وُجدت دفعة مفتوحة التسجيل)، draft، coming_soon، open_for_registration، closed، archived.
-- المفتوح يشترط دفعة مفتوحة فعلًا؛ وغير المنشور والمغلق والمؤرشف لا يقبل تسجيلًا ولا تسجيلًا مبدئيًا. التغيير يسجّله audit_row (programs).
alter table programs add column if not exists publish_state text check (publish_state in ('draft','coming_soon','open_for_registration','closed','archived'));
alter table programs add column if not exists expected_start date;

create or replace function admin_set_publish(p_program uuid, p_state text, p_expected date default null) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v text := nullif(btrim(coalesce(p_state, '')), '');
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  if not exists (select 1 from programs where id = p_program) then raise exception 'البرنامج غير موجود'; end if;
  if v is not null and v not in ('draft','coming_soon','open_for_registration','closed','archived') then raise exception 'حالة غير صالحة'; end if;
  if v = 'open_for_registration' and (program_open_cohort(p_program)).id is null then raise exception 'افتح دفعة للبرنامج وفعّل استقبال التسجيل أولًا'; end if;
  update programs set publish_state = v, expected_start = p_expected where id = p_program;
  return jsonb_build_object('ok', true);
end $$;

alter function register_trainee(jsonb) rename to register_trainee_pub;
create or replace function register_trainee(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare v_pid uuid;
begin
  begin v_pid := nullif(p->>'program_id','')::uuid; exception when others then v_pid := null; end;
  if nullif(p->>'package_id','') is null and v_pid is not null and exists (select 1 from programs where id = v_pid and publish_state in ('draft','closed','archived')) then
    raise exception 'التسجيل في هذا البرنامج غير متاح حاليًا'; end if;
  return register_trainee_pub(p);
end $$;
revoke execute on function register_trainee_pub(jsonb) from public, anon, authenticated;
revoke execute on function admin_set_publish(uuid, text, date) from public, anon;
grant execute on function admin_set_publish(uuid, text, date) to authenticated;
grant execute on function register_trainee(jsonb) to anon, authenticated;
