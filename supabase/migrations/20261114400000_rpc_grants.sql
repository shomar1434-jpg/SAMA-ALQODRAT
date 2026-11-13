-- إحكام صلاحيات الدوال: في Supabase تُمنح الدوال الجديدة لـ anon و authenticated افتراضيًا،
-- فلا يكفي «revoke … from public». هنا تُسحب صلاحية تنفيذ كل دوال SECURITY DEFINER ثم تُمنح
-- فقط لما تستدعيه الواجهة (RPC) ولما تعتمد عليه سياسات RLS. أي دالة RPC جديدة تحتاج grant صريحًا.
do $$
declare r record;
  v_both text[] := array['activate_device','archive_ended_cohorts','checkin','claim_admin','daily_code','device_logout',
    'generate_daily_report','guardian_self_link','issue_certificates','mark_read','mark_thread_read','my_attendance','my_phone',
    'open_cohort','order_report_transfer','portal_data','portal_inbox','portal_roles','public_catalog','public_plans',
    'public_policies','public_program','public_settings','public_site','publish_policy','register_subscription',
    'register_trainee','request_custom_plan','request_login','resolve_profile_change','save_templates','send_message',
    'set_attendance','set_report_note','set_sub_attendance','verify_certificate'];
  v_pol text := coalesce((select string_agg(coalesce(qual,'') || ' ' || coalesce(with_check,''), ' ') from pg_policies where schemaname = 'public'), '');
begin
  for r in select p.oid::regprocedure as sig, p.proname from pg_proc p
           where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
    if r.proname = any(v_both) or v_pol ~ ('\m' || r.proname || '\(') then
      execute format('grant execute on function %s to anon, authenticated', r.sig);
    elsif r.proname ~ '^(admin|teacher|student)_' and r.proname !~ '_(untargeted|noorder|base|prev)$' then
      execute format('grant execute on function %s to authenticated', r.sig);
    end if;
  end loop;
end $$;
