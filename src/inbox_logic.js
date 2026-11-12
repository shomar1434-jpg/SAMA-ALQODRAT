/* صندوق الوارد والتنبيهات (الخطوة D) — دوال خالصة على كائن البيانات D.
   مطابق لـ supabase/migrations/…_inbox.sql (run_session_reminders، portal_inbox). */
import { uid, toMin, t12 } from './utils.js';
import { sessionOn, SECTIONS, planName } from './qudurat.js';

export const SOON_DEFAULT = 10;      // دقائق قبل بدء الجلسة (0 = معطّل)
export const KIND_TITLE = { session_soon:'تبدأ الجلسة قريبًا', absence:'غياب', late:'تأخر', reminder:'تذكير بالحضور', homework:'واجب', general:'إشعار', admin:'رسالة من إدارة المعهد', message:'رسالة جديدة' };
export const KIND_TONE = { session_soon:'info', absence:'bad', late:'warn', reminder:'warn', homework:'warn', general:'info', admin:'info', message:'ok' };
export const AUDIENCE_TXT = { student:'المتدربون', guardian:'أولياء الأمور', teacher:'المدربون' };

const isRunning = (c, d) => !c.archived_at && c.start_date <= d && c.end_date >= d;
const sessionDay = (c, d) => isRunning(c, d) && (c.days || []).includes(new Date(d + 'T12:00:00Z').getUTCDay());
const inWindow = (start, hm, mins) => { const s = toMin(String(start).slice(0, 5)), now = toMin(hm); return now >= s - mins && now < s; };
const note = (D, base) => ({ id:uid(), at:new Date().toISOString(), read_at:null, sender:'system', kind:'session_soon', ...base });

/* تنبيهات «تبدأ الجلسة بعد N دقائق»: للمتدرب وولي أمره الموثّق ومدربي القسم. مفتاح منع التكرار لكل مستلم وجلسة. */
export function sessionReminders(D, n){
  const mins = D.settings?.soon_minutes ?? SOON_DEFAULT; if(!mins) return [];
  const out = [], d = n.date, guardians = id => (D.guardian_links || []).filter(l => l.status === 'verified' && l.trainee_id === id);
  // الباقات: جلسة القسم اليوم
  for(const sec of Object.keys(SECTIONS)){
    const ses = sessionOn(D, sec, d); if(!ses || !inWindow(ses.start, n.hm, mins)) continue;
    const when = t12(String(ses.start).slice(0, 5)), key = `${d}:${sec}:${String(ses.start).slice(0, 5)}`;
    const subs = (D.subscriptions || []).filter(s => s.section === sec && ['pending', 'active'].includes(s.status) && (!s.end_date || s.end_date >= d));
    for(const s of subs){ const t = D.trainees.find(x => x.id === s.trainee_id); if(!t) continue; const pl = planName((D.plans || []).find(p => p.id === s.plan_id));
      out.push(note(D, { to:'student', trainee_id:t.id, date:d, dedupe_key:`soon:s:${t.id}:${key}`, text:`تبدأ جلستك في ${pl} الساعة ${when}، بعد ${mins} دقائق. لا تنسَ مسح باركود الحضور عند وصولك.` }));
      if(guardians(t.id).length) out.push(note(D, { to:'guardian', trainee_id:t.id, date:d, dedupe_key:`soon:g:${t.id}:${key}`, text:`تبدأ جلسة ${t.full_name.split(' ')[0]} في ${pl} الساعة ${when}، بعد ${mins} دقائق.` })); }
    const n2 = new Set(subs.map(s => s.trainee_id)).size;
    (D.teachers || []).filter(t => t.active !== false && t.section === sec).forEach(t => out.push(note(D, { to:'teacher', teacher_id:t.id, trainee_id:null, date:d, dedupe_key:`soon:t:${t.id}:${key}`,
      text:`تبدأ جلسة قسم ${SECTIONS[sec]} الساعة ${when}، بعد ${mins} دقائق. عدد المشتركين ${n2}.` })));
  }
  // البرامج: الدفعات المنعقدة اليوم
  for(const c of (D.cohorts || []).filter(c => sessionDay(c, d) && inWindow(c.start_time, n.hm, mins))){
    const p = (D.programs || []).find(x => x.id === c.program_id), when = t12(String(c.start_time).slice(0, 5)), key = `${d}:c:${c.id}`;
    (D.enrollments || []).filter(e => e.cohort_id === c.id && e.status !== 'ملغى').forEach(e => { const t = D.trainees.find(x => x.id === e.trainee_id); if(!t) return;
      out.push(note(D, { to:'student', trainee_id:t.id, date:d, dedupe_key:`soon:s:${t.id}:${key}`, text:`تبدأ محاضرة «${p?.name || 'برنامجك'}» الساعة ${when}، بعد ${mins} دقائق. لا تنسَ تسجيل حضورك.` }));
      if(guardians(t.id).length) out.push(note(D, { to:'guardian', trainee_id:t.id, date:d, dedupe_key:`soon:g:${t.id}:${key}`, text:`تبدأ محاضرة ${t.full_name.split(' ')[0]} في «${p?.name || 'البرنامج'}» الساعة ${when}، بعد ${mins} دقائق.` })); });
    const ct = c.teacher_id && (D.teachers || []).find(t => t.id === c.teacher_id && t.active !== false);
    if(ct) out.push(note(D, { to:'teacher', teacher_id:ct.id, trainee_id:null, date:d, dedupe_key:`soon:t:${ct.id}:${key}`, text:`تبدأ محاضرتك في «${p?.name || 'البرنامج'}» الساعة ${when}، بعد ${mins} دقائق.` }));
  }
  return out;
}

/* عناصر صندوق الوارد لدور معيّن من بياناته المحصورة: الإشعارات + الرسائل غير المقروءة من الطرف الآخر */
export function inboxOf(D, role){
  const notes = (role === 'teacher' ? D.notifications_in : D.notifications) || [];
  const other = role === 'teacher' ? 'student' : 'teacher';
  const msgs = role === 'guardian' ? [] : (D.messages || []).filter(m => m.from === other && !m.read_at);
  const name = id => role === 'teacher' ? (D.trainees || []).find(t => t.id === id)?.full_name : (D.teachers || []).find(t => t.id === id)?.full_name;
  const items = [
    ...notes.map(x => ({ id:'n:' + x.id, kind:x.kind, at:x.at, title:KIND_TITLE[x.kind] || 'إشعار', text:x.text, read:!!x.read_at, action:'notice' })),
    ...msgs.map(m => ({ id:'m:' + m.id, kind:'message', at:m.at, title:`رسالة من ${(name(role === 'teacher' ? m.trainee_id : m.teacher_id) || '').split(' ').slice(0, 2).join(' ') || (role === 'teacher' ? 'متدرب' : 'المدرب')}`,
      text:m.text, read:false, action:'msg', thread:{ trainee_id:m.trainee_id, teacher_id:m.teacher_id } }))
  ].sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 40);
  return { items, unread: items.filter(x => !x.read).length };
}

/* المستلمون لرسالة الإدارة (نطاق: الكل، أو قسم، أو برنامج، أو متدرب) */
export function adminRecipients(D, { audience, scope = 'all', section, program_id, trainee_id }, today){
  if(audience === 'teacher') return (D.teachers || []).filter(t => t.active !== false && (scope !== 'section' || t.section === section)).map(t => ({ to:'teacher', teacher_id:t.id, trainee_id:null }));
  const live = s => ['pending', 'active'].includes(s.status) && (!s.end_date || s.end_date >= today);
  let ids;
  if(scope === 'trainee') ids = [trainee_id];
  else if(scope === 'section') ids = (D.subscriptions || []).filter(s => s.section === section && live(s)).map(s => s.trainee_id);
  else if(scope === 'program') ids = (D.enrollments || []).filter(e => e.program_id === program_id && e.status !== 'ملغى' && (D.cohorts || []).some(c => c.id === e.cohort_id && !c.archived_at && c.end_date >= today)).map(e => e.trainee_id);
  else ids = [...(D.subscriptions || []).filter(live).map(s => s.trainee_id), ...(D.enrollments || []).filter(e => e.status !== 'ملغى' && (D.cohorts || []).some(c => c.id === e.cohort_id && !c.archived_at && c.end_date >= today)).map(e => e.trainee_id)];
  ids = [...new Set(ids.filter(Boolean))];
  if(audience === 'guardian') return ids.filter(id => (D.guardian_links || []).some(l => l.status === 'verified' && l.trainee_id === id)).map(id => ({ to:'guardian', trainee_id:id }));
  return ids.map(id => ({ to:'student', trainee_id:id }));
}
