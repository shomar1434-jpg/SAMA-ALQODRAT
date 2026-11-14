-- الخطوة AG: الحضور يُحسب من بداية الاشتراك (قرار المالك: 29 أغسطس للباقات)، وجلسات ما قبل التسجيل في المنصة (قبل track_from)
-- بلا سجلات حضور؛ تُحتسب حضورًا إلا عدد أيام الغياب الذي تدخله الإدارة من الكشوف اليدوية (subscriptions.prior_absences) ↔ subStats/priorSessions

alter table subscriptions add column if not exists prior_absences int not null default 0 check (prior_absences >= 0);

-- عدد جلسات ما قبل التتبع
create or replace function sub_prior_sessions(p_sub uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select count(*)::int from subscriptions s, generate_series(s.start_date, s.track_from - 1, interval '1 day') g
    where s.id = p_sub and s.start_date is not null and s.track_from is not null and s.track_from > s.start_date and (session_on(s.section, g::date)).start_time is not null), 0);
$$;

create or replace function sub_stats(p_sub uuid) returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s subscriptions%rowtype; st settings%rowtype; n timestamp := riyadh_now(); d date := n::date; sec int := extract(epoch from n::time)::int;
  v_end date; v_total int := 0; v_held int := 0; v_att int; v_late int; v_score numeric; v_req int; v_need int; v_consec int := 0; g date; ses record; v_has boolean; v_span numeric; v_passed numeric; v_rate int;
  v_prior int := 0; v_pa int; v_from date;
begin
  select * into s from subscriptions where id = p_sub; select * into st from settings where id = 1;
  if s.start_date is null then return jsonb_build_object('status', s.status, 'total',0,'held',0,'attended',0,'late',0,'absent',0,'remaining',0,'rate',null,'finalRate',0,'required',0,'needed',0,'reachable',true,'consec',0,'timePct',0,'daysLeft',null,'prior',0,'priorAbsences',0); end if;
  v_end := coalesce(s.end_date, sub_end(s.plan_id, s.start_date));
  v_from := greatest(s.start_date, coalesce(s.track_from, s.start_date));
  for g in select x::date from generate_series(s.start_date, v_end, interval '1 day') x loop
    select * into ses from session_on(s.section, g);
    if ses.start_time is null then continue; end if;
    v_total := v_total + 1;
    if g < v_from then v_prior := v_prior + 1; v_held := v_held + 1; continue; end if;   -- قبل المنصة: منعقدة بلا سجل
    v_has := exists (select 1 from sub_attendance a where a.subscription_id = s.id and a.att_date = g);
    if g < d or (g = d and sec >= extract(epoch from ses.end_time)::int) or v_has then
      v_held := v_held + 1;
      if v_has then v_consec := 0; else v_consec := v_consec + 1; end if;
    end if;
  end loop;
  v_pa := least(v_prior, greatest(0, coalesce(s.prior_absences, 0)));
  select count(distinct att_date), count(*) filter (where status = 'متأخر') into v_att, v_late from sub_attendance where subscription_id = s.id;
  v_att := v_att + v_prior - v_pa;
  v_score := v_att - v_late * (1 - coalesce(st.late_weight, 1));
  v_req := ceil(v_total * st.cert_threshold / 100.0); v_need := greatest(0, ceil(v_req - v_score - 1e-9)::int);
  v_rate := case when v_held > 0 then round(v_score * 100.0 / v_held) end;
  v_span := greatest(1, v_end - s.start_date + 1); v_passed := least(v_span, greatest(0, d - s.start_date + 1));
  return jsonb_build_object('status', case when s.status = 'cancelled' then 'cancelled' when v_end < d then 'ended' else 'active' end,
    'end', v_end, 'total', v_total, 'held', v_held, 'attended', v_att, 'late', v_late, 'score', v_score, 'absent', greatest(0, v_held - v_att),
    'remaining', greatest(0, v_total - v_held), 'rate', v_rate, 'finalRate', coalesce(v_rate, 0), 'required', v_req, 'needed', v_need,
    'reachable', v_need <= greatest(0, v_total - v_held), 'consec', v_consec, 'timePct', round(v_passed / v_span * 100), 'daysLeft', round(v_span - v_passed),
    'prior', v_prior, 'priorAbsences', v_pa);
end $$;

-- حفظ الاشتراك من الإدارة: يقبل أيام الغياب السابقة (0 إلى عدد جلسات ما قبل التتبع)
alter function admin_save_subscription(jsonb) rename to admin_save_subscription_base;
create or replace function admin_save_subscription(p jsonb) returns jsonb language plpgsql volatile security definer set search_path = public as $$
declare r jsonb; v_id uuid := nullif(p->>'id', '')::uuid; v_pa int; v_mx int;
begin
  if not is_admin() then raise exception 'غير مصرح'; end if;
  r := admin_save_subscription_base(p - 'prior_absences');
  if v_id is not null and nullif(p->>'prior_absences', '') is not null then
    v_pa := (p->>'prior_absences')::int; v_mx := sub_prior_sessions(v_id);
    if v_pa < 0 or v_pa > v_mx then raise exception 'أيام الغياب السابقة من 0 إلى %', v_mx; end if;
    update subscriptions set prior_absences = v_pa where id = v_id;
  end if;
  return r;
end $$;
revoke execute on function admin_save_subscription_base(jsonb), sub_prior_sessions(uuid) from public, anon, authenticated;
revoke execute on function admin_save_subscription(jsonb) from public, anon;
grant execute on function admin_save_subscription(jsonb) to authenticated;
