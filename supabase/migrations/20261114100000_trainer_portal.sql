-- =====================================================================
-- الخطوة U — ملف المدرب: نبذة ورابط قناة تيليجرام وصورة صغيرة؛ يعدّلها المدرب لنفسه فقط.
-- النبذة تظهر لمتدربيه، ورابط القناة لمتدربي مقرراته وحدهم. مطابق لـ src/trainer_logic.js.
-- =====================================================================
alter table teachers add column if not exists bio text not null default '' check (length(bio) <= 600);
alter table teachers add column if not exists telegram text not null default '' check (telegram = '' or telegram ~ '^https://t\.me/[A-Za-z0-9_+/-]{3,80}$');
alter table teachers add column if not exists avatar text not null default '' check (avatar = '' or (length(avatar) <= 90000 and avatar ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$'));

create or replace function teacher_save_profile(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare me teachers := me_teacher();
begin
  if me.id is null then raise exception 'غير مصرح'; end if;
  if length(btrim(coalesce(p->>'bio',''))) > 600 then raise exception 'النبذة أطول من 600 حرف'; end if;
  if coalesce(p->>'telegram','') <> '' and p->>'telegram' !~ '^https://t\.me/[A-Za-z0-9_+/-]{3,80}$' then raise exception 'رابط تيليجرام يبدأ بـ https://t.me/'; end if;
  update teachers set bio = btrim(coalesce(p->>'bio','')), telegram = btrim(coalesce(p->>'telegram','')), avatar = coalesce(p->>'avatar','') where id = me.id;
  return jsonb_build_object('ok', true);
end $$;
revoke execute on function teacher_save_profile(jsonb) from public, anon;
grant execute on function teacher_save_profile(jsonb) to authenticated;

alter function portal_data(text) rename to portal_data_editor;
revoke execute on function portal_data_editor(text) from public, anon, authenticated;
create or replace function portal_data(p_role text) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare base jsonb := portal_data_editor(p_role); ph text := my_phone(); ids uuid[];
begin
  if base is null or p_role not in ('student','guardian') or jsonb_typeof(base->'teachers') <> 'array' then return base; end if;
  if p_role = 'student' then select coalesce(array_agg(id), '{}') into ids from trainees where phone = ph;
  else select coalesce(array_agg(trainee_id), '{}') into ids from guardian_links where guardian_phone = ph and status = 'verified'; end if;
  return base || jsonb_build_object('teachers', coalesce((select jsonb_agg((x - 'phone' - 'telegram') || jsonb_build_object('bio', t.bio, 'avatar', t.avatar)
      || case when t.telegram <> '' and exists (select 1 from subscriptions s where s.trainee_id = any(ids) and s.status in ('pending','active') and s.section = t.section and s.subjects && t.subjects)
           then jsonb_build_object('telegram', t.telegram) else '{}'::jsonb end)
    from jsonb_array_elements(base->'teachers') x join teachers t on t.id = (x->>'id')::uuid), '[]'));
end $$;
revoke execute on function portal_data(text) from public, anon;
grant execute on function portal_data(text) to authenticated;
