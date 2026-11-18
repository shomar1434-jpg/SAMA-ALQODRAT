-- الخطوة BN: إصلاحات الفحص الأمني (19 نوفمبر 2026)
-- 1) generate_daily_report: كان الحارس «not p_auto and not is_admin()» يسمح لأي جلسة مسجّلة (ومنها جلسات الأجهزة المجهولة
--    التي ينشئها أي زائر) بتمرير p_auto=true فتُعاد له أسماء كل المتدربين وباقاتهم وحضورهم لأي تاريخ، وتُكتب مراجعات وهمية.
--    الآن: التوليد الآلي لا يُقبل إلا بلا هوية متصل (مهام pg_cron)، وكل متصل عبر الواجهة يلزمه أن يكون مسؤولًا.
CREATE OR REPLACE FUNCTION public.generate_daily_report(p_date date DEFAULT NULL::date, p_kind text DEFAULT 'snapshot'::text, p_note text DEFAULT ''::text, p_auto boolean DEFAULT false)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare d date := coalesce(p_date, riyadh_now()::date); prev daily_reports%rowtype; v_data jsonb; v_changes text[] := '{}'; r daily_reports%rowtype; k text;
begin
  if not is_admin() and (not coalesce(p_auto, false) or auth.uid() is not null) then raise exception 'غير مصرح'; end if;
  perform pg_advisory_xact_lock(hashtext('daily_report:' || d));                                    -- يمنع التوليد المتزامن
  select * into prev from daily_reports where date = d order by version desc limit 1;
  if p_kind = 'snapshot' and prev.id is not null then
    select * into r from daily_reports where date = d and version = 1; return jsonb_build_object('existing', true, 'report', to_jsonb(r));
  end if;
  v_data := build_daily_report(d);
  if prev.id is not null then
    foreach k in array array['present','late','absent','pending','expected'] loop
      if (prev.data->'summary'->>k) is distinct from (v_data->'summary'->>k) then
        v_changes := v_changes || (case k when 'present' then 'الحاضرون' when 'late' then 'المتأخرون' when 'absent' then 'الغائبون' when 'pending' then 'لم يسجلوا' else 'المتوقعون' end || ': ' || (prev.data->'summary'->>k) || ' ← ' || (v_data->'summary'->>k));
      end if;
    end loop;
  end if;
  insert into daily_reports(date, version, kind, data, note, changes, auto, generated_by)
  values (d, coalesce(prev.version, 0) + 1, case when prev.id is null then 'snapshot' else 'revision' end, v_data, coalesce(p_note,''), v_changes, p_auto, auth.uid())
  returning * into r;
  insert into daily_report_runs(date, kind, status) values (d, r.kind, 'success');
  return jsonb_build_object('existing', false, 'report', to_jsonb(r));
end $function$;

-- 2) checkin (عام بلا تسجيل دخول): رسائل الرفض كانت تعيد الاسم الكامل لصاحب رقم الهوية (no_session/choose)،
--    فيعرف أي شخص اسم صاحب أي هوية واشتراكه وموعد جلسته. قاعدة المنصة: رفض التحضير لا يكشف الاسم.
CREATE OR REPLACE FUNCTION public.checkin(p_nid text, p_code text DEFAULT NULL::text, p_program text DEFAULT NULL::text, p_device text DEFAULT ''::text, p_choice text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare r jsonb;
begin
  perform set_config('sama.checkin', 'on', true);
  begin
    r := checkin_noorder(p_nid, p_code, p_program, p_device, p_choice);
  exception when sqlstate 'SAM01' then
    r := jsonb_build_object('ok', false, 'reason', 'order_pending');
    insert into checkin_attempts(date, nid_hash, device, result, kind, trainee_hint)
    values (riyadh_now()::date, md5('sama:' || coalesce(p_nid,'')), left(coalesce(p_device,''),64), 'order_pending', 'order', null);
  end;
  perform set_config('sama.checkin', '', true);
  if not coalesce((r->>'ok')::boolean, false) then r := r - 'name'; end if;
  return r;
end $function$;
