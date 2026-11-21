-- الخطوة BR (طلب المالك 22 نوفمبر): إلغاء جلسات الباقات لفترة (من تاريخ إلى تاريخ) بسبب مكتوب، مع تعويض تلقائي.
--   • admin_cancel_sessions: يلغي كل جلسة في الفترة للقسم أو القسمين (استثناءات cancel مرتبطة بالإلغاء break_id)،
--     ثم يمدد كل اشتراك قائم فقدَ جلسات بعددها بالضبط: النهاية تنتقل إلى الجلسة رقم k بعد نهايته الحالية (تُتخطى الأيام الملغاة).
--     p_preview = true يعيد المعاينة دون حفظ شيء.
--   • admin_revoke_session_break: التراجع يعيد كل نهاية إلى ما كانت عليه ويحذف استثناءات الإلغاء (الأحدث أولًا).
--   • المالك ومدير النظام فقط (is_full_admin)؛ اليوم وما بعده، وما قبله حتى 7 أيام؛ الفترة 60 يومًا على الأكثر.
--   • مطابق لـ src/break_logic.js (planBreak) في الوضع التجريبي.
create table if not exists session_breaks (
  id uuid primary key default gen_random_uuid(), seq bigint generated always as identity,
  from_date date not null, to_date date not null check (to_date >= from_date and to_date - from_date <= 60),
  sections text[] not null check (sections <@ array['boys','girls'] and cardinality(sections) between 1 and 2),
  reason text not null check (reason in ('official','center','eid','other')),
  note text not null default '' check (length(note) <= 200),
  sessions jsonb not null default '[]',
  affected int not null default 0,
  created_at timestamptz not null default now(), created_by uuid default auth.uid(),
  revoked_at timestamptz, revoked_by uuid,
  check (reason <> 'other' or length(btrim(note)) > 0)
);
create table if not exists break_compensations (
  id uuid primary key default gen_random_uuid(),
  break_id uuid not null references session_breaks(id) on delete restrict,
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  old_end date not null, new_end date not null check (new_end > old_end), sessions int not null check (sessions > 0),
  restored_at timestamptz,
  unique (break_id, subscription_id)
);
create index if not exists break_comp_sub on break_compensations(subscription_id);
alter table schedule_exceptions add column if not exists break_id uuid references session_breaks(id) on delete restrict;
create index if not exists schedule_exceptions_break on schedule_exceptions(break_id) where break_id is not null;

alter table session_breaks enable row level security; alter table break_compensations enable row level security;
drop policy if exists session_breaks_admin_read on session_breaks;
create policy session_breaks_admin_read on session_breaks for select to authenticated using (is_admin());
drop policy if exists break_comp_admin_read on break_compensations;
create policy break_comp_admin_read on break_compensations for select to authenticated using (is_admin());
revoke all on session_breaks, break_compensations from anon;
revoke insert, update, delete, truncate on session_breaks, break_compensations from authenticated;

-- استثناءات الإلغاء الجماعي لا تُحذف ولا تُعدَّل منفردة (وإلا اختل حساب التعويض)؛ التراجع من الإلغاء نفسه
create or replace function schedule_exc_break_guard() returns trigger language plpgsql set search_path = public as $$
begin
  if old.break_id is not null and coalesce(current_setting('app.break_revoke', true), '') <> 'on' then
    raise exception 'هذا اليوم ضمن إلغاء جلسات لفترة؛ تراجع عنه من «إلغاء الجلسات» في شاشة محاضرات اليوم';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists schedule_exc_break_guard on schedule_exceptions;
create trigger schedule_exc_break_guard before update or delete on schedule_exceptions for each row execute function schedule_exc_break_guard();

create or replace function break_reason_text(p_reason text, p_note text) returns text language sql immutable set search_path = public as $$
  select case p_reason when 'official' then 'إجازة رسمية' when 'center' then 'عدم جاهزية المركز' when 'eid' then 'إجازة العيد' else btrim(coalesce(p_note, '')) end;
$$;

create or replace function admin_cancel_sessions(p jsonb) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  v_from date := nullif(p->>'from', '')::date; v_to date := nullif(p->>'to', '')::date;
  v_secs text[]; v_reason text := p->>'reason'; v_note text := btrim(coalesce(p->>'note', ''));
  v_preview boolean := coalesce((p->>'preview')::boolean, false);
  v_today date := riyadh_now()::date; v_id uuid := gen_random_uuid();
  sec text; d date; dates date[]; all_sessions jsonb := '[]'; s record; k int; e date; n date; c int;
  changes jsonb := '[]'; v_aff int := 0; result jsonb; v_label text;
begin
  if not is_full_admin() then raise exception 'إلغاء الجلسات للمالك ومدير النظام'; end if;
  if v_from is null or v_to is null then raise exception 'حدد تاريخ البداية والنهاية'; end if;
  if v_to < v_from then raise exception 'تاريخ النهاية قبل البداية'; end if;
  if v_to - v_from > 60 then raise exception 'الفترة 60 يومًا على الأكثر'; end if;
  if v_from < v_today - 7 then raise exception 'لا يُلغى ما مضى عليه أكثر من 7 أيام'; end if;
  if v_reason is null or v_reason not in ('official','center','eid','other') then raise exception 'اختر سبب الإلغاء'; end if;
  if v_reason = 'other' and v_note = '' then raise exception 'اكتب سبب الإلغاء'; end if;
  if length(v_note) > 200 then raise exception 'السبب طويل'; end if;
  select array_agg(distinct x) into v_secs from jsonb_array_elements_text(coalesce(p->'sections', '["boys","girls"]')) x;
  if v_secs is null or not (v_secs <@ array['boys','girls']) then raise exception 'القسم غير صالح'; end if;
  v_label := break_reason_text(v_reason, v_note);

  begin   -- كتلة فرعية: في المعاينة تُلغى كل التغييرات في آخرها
    insert into session_breaks(id, from_date, to_date, sections, reason, note) values (v_id, v_from, v_to, v_secs, v_reason, v_note);
    foreach sec in array v_secs loop
      dates := '{}';
      for d in select g::date from generate_series(v_from, v_to, interval '1 day') g loop
        if (session_on(sec, d)).start_time is not null then dates := dates || d; end if;
      end loop;
      if cardinality(dates) = 0 then continue; end if;
      all_sessions := all_sessions || (select jsonb_agg(jsonb_build_object('section', sec, 'date', x)) from unnest(dates) x);
      insert into schedule_exceptions(date, section, type, note, break_id) select x, sec, 'cancel', v_label, v_id from unnest(dates) x;
      for s in select x.id, x.trainee_id, x.start_date, coalesce(x.end_date, sub_end(x.plan_id, x.start_date)) as end_date
               from subscriptions x where x.section = sec and x.status <> 'cancelled' and x.start_date is not null loop
        select count(*) into k from unnest(dates) x where x between s.start_date and s.end_date;
        if k = 0 then continue; end if;
        e := s.end_date; n := e; c := 0;
        while c < k and n < e + 400 loop n := n + 1; if (session_on(sec, n)).start_time is not null then c := c + 1; end if; end loop;
        update subscriptions set end_date = n where id = s.id;
        insert into break_compensations(break_id, subscription_id, old_end, new_end, sessions) values (v_id, s.id, e, n, k);
        v_aff := v_aff + 1;
        if not v_preview then
          insert into notifications(date, sender, "to", trainee_id, kind, text, dedupe_key)
            values (v_today, 'system', 'student', s.trainee_id, 'session_cancel',
              'أُلغيت ' || k || ' من جلساتك بين ' || to_char(v_from, 'YYYY-MM-DD') || ' و' || to_char(v_to, 'YYYY-MM-DD') || ' (' || v_label || ')، وعُوّضت بتمديد باقتك حتى ' || to_char(n, 'YYYY-MM-DD') || '. لا تُحتسب غيابًا.',
              'brk:' || v_id || ':s:' || s.id) on conflict (dedupe_key) do nothing;
          insert into notifications(date, sender, "to", trainee_id, kind, text, dedupe_key)
            select v_today, 'system', 'guardian', s.trainee_id, 'session_cancel',
              'أُلغيت ' || k || ' من جلسات ' || split_part(t.full_name, ' ', 1) || ' بين ' || to_char(v_from, 'YYYY-MM-DD') || ' و' || to_char(v_to, 'YYYY-MM-DD') || ' (' || v_label || ')، وعُوّضت بتمديد الباقة حتى ' || to_char(n, 'YYYY-MM-DD') || '.',
              'brk:' || v_id || ':g:' || s.id
            from trainees t where t.id = s.trainee_id and exists (select 1 from guardian_links l where l.status = 'verified' and l.trainee_id = t.id)
            on conflict (dedupe_key) do nothing;
        end if;
      end loop;
    end loop;
    if jsonb_array_length(all_sessions) = 0 then raise exception 'لا توجد جلسات في هذه الفترة'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('section', g.section, 'old_end', g.old_end, 'new_end', g.new_end, 'sessions', g.sessions, 'n', g.n) order by g.section, g.old_end), '[]') into changes
      from (select x.section, bc.old_end, bc.new_end, bc.sessions, count(*) n from break_compensations bc join subscriptions x on x.id = bc.subscription_id
            where bc.break_id = v_id group by 1, 2, 3, 4) g;
    update session_breaks set sessions = all_sessions, affected = v_aff where id = v_id;
    result := jsonb_build_object('id', case when v_preview then null else v_id end, 'preview', v_preview, 'sessions', all_sessions, 'affected', v_aff, 'changes', changes, 'reason', v_label);
    if v_preview then raise exception using errcode = 'P0001', message = 'sama_preview_rollback'; end if;
  exception when raise_exception then
    if sqlerrm = 'sama_preview_rollback' then return result; end if;
    raise;
  end;
  return result;
end $$;
revoke execute on function admin_cancel_sessions(jsonb) from public, anon;
grant execute on function admin_cancel_sessions(jsonb) to authenticated;

create or replace function admin_revoke_session_break(p_id uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare b session_breaks; r record; restored int := 0; conflicts int := 0;
begin
  if not is_full_admin() then raise exception 'إلغاء الجلسات للمالك ومدير النظام'; end if;
  select * into b from session_breaks where id = p_id for update;
  if not found then raise exception 'الإلغاء غير موجود'; end if;
  if b.revoked_at is not null then raise exception 'سبق التراجع عن هذا الإلغاء'; end if;
  if exists (select 1 from break_compensations c join session_breaks o on o.id = c.break_id
             where o.revoked_at is null and o.seq > b.seq
               and c.subscription_id in (select subscription_id from break_compensations where break_id = p_id)) then
    raise exception 'تراجع أولًا عن الإلغاء الأحدث الذي مدّد الاشتراكات نفسها';
  end if;
  for r in select c.id, c.subscription_id, c.old_end, c.new_end from break_compensations c where c.break_id = p_id and c.restored_at is null loop
    update subscriptions set end_date = r.old_end where id = r.subscription_id and end_date = r.new_end;
    if found then restored := restored + 1; update break_compensations set restored_at = now() where id = r.id; else conflicts := conflicts + 1; end if;
  end loop;
  perform set_config('app.break_revoke', 'on', true);
  delete from schedule_exceptions where break_id = p_id;
  perform set_config('app.break_revoke', '', true);
  update session_breaks set revoked_at = now(), revoked_by = auth.uid() where id = p_id;
  return jsonb_build_object('restored', restored, 'conflicts', conflicts);
end $$;
revoke execute on function admin_revoke_session_break(uuid) from public, anon;
grant execute on function admin_revoke_session_break(uuid) to authenticated;
revoke execute on function schedule_exc_break_guard(), break_reason_text(text, text) from public, anon, authenticated;

-- سجل الحركات والتحديث الحي
do $$ declare t text; begin
  foreach t in array array['session_breaks','break_compensations'] loop
    execute format('drop trigger if exists %I_audit on %I', t, t);
    execute format('create trigger %I_audit after insert or update or delete on %I for each row execute function audit_row()', t, t);
    if to_regprocedure('sama_internal.signal_data_change()') is not null and not exists (select 1 from pg_trigger where tgname = 'signal_data_change' and tgrelid = ('public.' || t)::regclass) then
      execute format('create trigger signal_data_change after insert or update or delete on public.%I for each row execute function sama_internal.signal_data_change()', t);
    end if;
  end loop;
end $$;
