-- الخطوة BP (قرار المالك 19 نوفمبر): التسجيل العام مرة واحدة في اليوم من الجوال نفسه أو الجهاز نفسه
-- يمنع الإغراق بتسجيلات وطلبات وهمية. يشمل: التسجيل في البرامج (والمبدئي)، والباقات، وطلب «خصصناها لك» — بعدّاد واحد.
--   • الجوال: جوال المتدرب في الطلب (مجزّأ). • الجهاز: رمز عشوائي يحفظه المتصفح (`_device`، مجزّأ).
--   • عنوان الشبكة: حد أوسع (15) لأن شبكات الجوال يتشارك فيها كثيرون العنوان نفسه؛ يوقف الإغراق الآلي من مصدر واحد.
-- المسؤول غير مقيّد، والاستدعاء المباشر من قاعدة البيانات (بلا ترويسات الطلب) لا يمر بالحد.
alter table settings add column if not exists reg_per_phone int not null default 1 check (reg_per_phone between 1 and 1000);
alter table settings add column if not exists reg_per_device int not null default 1 check (reg_per_device between 1 and 1000);
alter table settings add column if not exists reg_per_ip int not null default 15 check (reg_per_ip between 1 and 10000);

create table if not exists reg_limits_log (
  id bigserial primary key,
  day date not null,
  kind text not null,
  phone_hash text,
  device_hash text,
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists reg_limits_log_day on reg_limits_log(day);
alter table reg_limits_log enable row level security;
revoke all on reg_limits_log from anon, authenticated;

create or replace function reg_rate_gate(p jsonb, p_kind text) returns void
language plpgsql volatile security definer set search_path = public, extensions as $$
declare s settings%rowtype; d date := riyadh_now()::date; ph text; dv text; ip text; h_ph text; h_dv text; n_ph int; n_dv int; n_ip int;
begin
  if current_setting('request.headers', true) is null or current_setting('request.headers', true) = '' then return; end if;
  if is_admin() then return; end if;
  select * into s from settings where id = 1;
  ph := regexp_replace(translate(coalesce(p->>'phone', ''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\D', '', 'g');
  if ph ~ '^9665[0-9]{8}$' then ph := '0' || substr(ph, 4); elsif ph ~ '^5[0-9]{8}$' then ph := '0' || ph; end if;
  dv := left(regexp_replace(coalesce(p->>'_device', ''), '[^A-Za-z0-9_-]', '', 'g'), 64);
  ip := nullif(pl_ip_hash(), '');
  h_ph := case when ph <> '' then encode(sha256(convert_to('sama-reg:' || coalesce(s.daily_secret, '') || ':p:' || ph, 'utf8')), 'hex') end;
  h_dv := case when length(dv) >= 16 then encode(sha256(convert_to('sama-reg:' || coalesce(s.daily_secret, '') || ':d:' || dv, 'utf8')), 'hex') end;
  perform pg_advisory_xact_lock(hashtext('reg_gate:' || coalesce(h_ph, '') || ':' || coalesce(h_dv, '')));
  delete from reg_limits_log where day < d - 1;
  select count(*) filter (where h_ph is not null and phone_hash = h_ph),
         count(*) filter (where h_dv is not null and device_hash = h_dv),
         count(*) filter (where ip is not null and ip_hash = ip)
    into n_ph, n_dv, n_ip from reg_limits_log where day = d;
  if n_ph >= s.reg_per_phone or n_dv >= s.reg_per_device or n_ip >= s.reg_per_ip then
    raise exception 'سُجّل طلب من هذا الجوال أو هذا الجهاز اليوم. للتسجيل مرة أخرى تواصل مع المركز عبر واتساب.' using errcode = 'SAM02';
  end if;
  insert into reg_limits_log(day, kind, phone_hash, device_hash, ip_hash) values (d, p_kind, h_ph, h_dv, ip);
end $$;
revoke execute on function reg_rate_gate(jsonb, text) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.register_trainee(p jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare v boolean := reg_minor_consent(p); r jsonb;
begin
  perform reg_rate_gate(p, 'program');
  r := register_trainee_noconsent(p);
  if v then update trainees set guardian_consent_at = coalesce(guardian_consent_at, now())
            where national_id = translate(trim(coalesce(p->>'national_id','')), '٠١٢٣٤٥٦٧٨٩', '0123456789'); end if;
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.register_subscription(p jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
declare v boolean := reg_minor_consent(p); r jsonb;
begin
  perform reg_rate_gate(p, 'plan');
  r := register_subscription_noconsent(p);
  if v then update trainees set guardian_consent_at = coalesce(guardian_consent_at, now())
            where national_id = translate(trim(coalesce(p->>'national_id','')), '٠١٢٣٤٥٦٧٨٩', '0123456789'); end if;
  perform pl_link(p);
  return r;
end $function$;

CREATE OR REPLACE FUNCTION public.request_custom_plan(p jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if coalesce(p->>'phone','') !~ '^05[0-9]{8}$' then raise exception 'رقم الجوال غير صحيح'; end if;
  perform reg_rate_gate(p, 'custom');
  insert into custom_requests(name, phone, program, section, mode, notes) values (left(p->>'name',80), p->>'phone', p->>'program', p->>'section', p->>'mode', left(p->>'notes',600));
  return jsonb_build_object('ok',true);
end $function$;
