-- جلسات ما قبل التتبع لا تتجاوز نهاية الاشتراك (الباقة الأساسية تنتهي قبل تاريخ الإدخال) ↔ priorSessions
create or replace function sub_prior_sessions(p_sub uuid) returns int language sql stable security definer set search_path = public as $$
  select coalesce((select count(*)::int from subscriptions s, generate_series(s.start_date, least(s.track_from - 1, coalesce(s.end_date, s.track_from - 1)), interval '1 day') g
    where s.id = p_sub and s.start_date is not null and s.track_from is not null and s.track_from > s.start_date and (session_on(s.section, g::date)).start_time is not null), 0);
$$;
revoke execute on function sub_prior_sessions(uuid) from public, anon, authenticated;
