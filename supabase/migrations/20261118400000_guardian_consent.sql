-- الخطوة BG (طلب المالك 18 نوفمبر، نظام حماية البيانات الشخصية): موافقة ولي الأمر عند تسجيل من هم دون 18 سنة.
-- الباقات: سؤال «دون 18؟» (`minor`) يُلزم جوال ولي الأمر وإقراره؛ برامج الأطفال: من تاريخ الميلاد (دون 19 كما في reg_guardian).
-- العميل القديم الذي لا يرسل `minor` لا يُلزم (لا تعطيل لصفحات محفوظة في الأجهزة). ↔ checkMinorConsent في src/identity_logic.js
alter table trainees add column if not exists guardian_consent_at timestamptz;

create or replace function reg_minor_consent(p jsonb) returns boolean language plpgsql stable set search_path = public, extensions as $$
declare needs boolean; b date; c boolean;
  g text := translate(trim(coalesce(p->>'guardian_phone','')), '٠١٢٣٤٥٦٧٨٩', '0123456789');
begin
  if not (p ? 'minor') then return false; end if;
  needs := coalesce(p->>'minor', '') = 'yes';
  begin b := nullif(p->>'birth_date','')::date; exception when others then b := null; end;
  if b is not null and age_on(b) < 19 then needs := true; end if;
  if not needs then return false; end if;
  if g = '' and b is not null and age_on(b) < 13 then g := translate(trim(coalesce(p->>'phone','')), '٠١٢٣٤٥٦٧٨٩', '0123456789'); end if;
  if g !~ '^05[0-9]{8}$' then raise exception 'جوال ولي الأمر مطلوب لمن هم دون 18 سنة (10 أرقام تبدأ بـ 05)'; end if;
  begin c := (p->>'guardian_consent')::boolean; exception when others then c := false; end;
  if coalesce(c, false) is not true then raise exception 'يلزم إقرار موافقة ولي الأمر عند تسجيل من هم دون 18 سنة'; end if;
  return true;
end $$;

alter function register_trainee(jsonb) rename to register_trainee_noconsent;
create or replace function register_trainee(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare v boolean := reg_minor_consent(p); r jsonb;
begin
  r := register_trainee_noconsent(p);
  if v then update trainees set guardian_consent_at = coalesce(guardian_consent_at, now())
            where national_id = translate(trim(coalesce(p->>'national_id','')), '٠١٢٣٤٥٦٧٨٩', '0123456789'); end if;
  return r;
end $$;

alter function register_subscription(jsonb) rename to register_subscription_noconsent;
create or replace function register_subscription(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public, extensions as $$
declare v boolean := reg_minor_consent(p); r jsonb;
begin
  r := register_subscription_noconsent(p);
  if v then update trainees set guardian_consent_at = coalesce(guardian_consent_at, now())
            where national_id = translate(trim(coalesce(p->>'national_id','')), '٠١٢٣٤٥٦٧٨٩', '0123456789'); end if;
  return r;
end $$;

revoke execute on function register_trainee_noconsent(jsonb), register_subscription_noconsent(jsonb), reg_minor_consent(jsonb) from public, anon, authenticated;
grant execute on function register_trainee(jsonb), register_subscription(jsonb) to anon, authenticated;
