/* الخطوة BB: «بيانات مؤرشفة» وحذف المتدرب كاملًا (↔ trainee_service_state / admin_archived_trainees / trainee_purge / purge_archived_trainees)
   من انتهت خدماته كلها تبقى بياناته مدة الحفظ (settings.archive_retention_days، 90 يومًا افتراضيًا) ثم تُحذف آليًا إن لم يكن عليه متبقٍ. */
import { addDays } from './utils.js';

export const ARCHIVE_DAYS = 90;
export const ARCHIVE_STATE = { completed: 'انتهت خدماته', withdrawn: 'منسحب' };
const norm = s => String(s || '').trim().replace(/\s+/g, ' ');
export const confirmNameOk = (typed, name) => norm(typed) !== '' && norm(typed) === norm(name);

export function serviceState(D, id, today){
  const subs = (D.subscriptions || []).filter(s => s.trainee_id === id), ens = (D.enrollments || []).filter(e => e.trainee_id === id);
  const coh = e => (D.cohorts || []).find(c => c.id === e.cohort_id) || {};
  const live = subs.some(s => s.status !== 'cancelled' && (s.status === 'pending' || !s.end_date || s.end_date >= today))
    || ens.some(e => e.status !== 'ملغى' && !coh(e).archived_at && (coh(e).end_date || '') >= today)
    || (D.program_requests || []).some(r => r.trainee_id === id && r.status === 'pending');
  const ends = [...subs.filter(s => s.status !== 'cancelled').map(s => s.end_date),
    ...ens.filter(e => e.status !== 'ملغى').map(e => { const c = coh(e), a = c.archived_at ? c.archived_at.slice(0, 10) : c.end_date; return a && c.end_date && a < c.end_date ? a : c.end_date; })].filter(Boolean).sort();
  const done = ends.length ? ends[ends.length - 1] : null;
  const remaining = Math.round((D.orders || []).filter(o => o.trainee_id === id && !o.cancelled_at && o.approval !== 'rejected')
    .reduce((a, o) => a + Math.max(0, (+o.total || 0) - (+o.paid_amount || 0)), 0) * 100) / 100;
  const state = live ? 'active' : done ? 'completed' : (subs.length || ens.length) ? 'withdrawn' : 'none';
  return { state, completed_on: state === 'completed' ? done : null, remaining };
}

export function archiveList(D, today, days = ARCHIVE_DAYS){
  return (D.trainees || []).map(t => ({ t, s: serviceState(D, t.id, today) })).filter(x => ['completed', 'withdrawn'].includes(x.s.state))
    .map(({ t, s }) => ({ id: t.id, full_name: t.full_name, national_id: t.national_id, phone: t.phone, is_test: !!t.is_test, ...s,
      purge_on: s.state === 'completed' ? addDays(s.completed_on, days) : null }))
    .sort((a, b) => (a.completed_on || '9999').localeCompare(b.completed_on || '9999') || a.full_name.localeCompare(b.full_name, 'ar'));
}

/* من يُحذف آليًا اليوم: انتهت خدماته منذ مدة الحفظ ولا متبقٍ عليه */
export const dueForPurge = (D, today, days = ARCHIVE_DAYS) => archiveList(D, today, days).filter(x => x.state === 'completed' && x.purge_on <= today && x.remaining === 0).map(x => x.id);

/* الحذف الكامل من بيانات الوضع التجريبي (يغيّر D) */
export function purgeTraineeData(D, id){
  const t = (D.trainees || []).find(x => x.id === id); if(!t) throw new Error('المتدرب غير موجود');
  const subs = new Set((D.subscriptions || []).filter(s => s.trainee_id === id).map(s => s.id));
  const ens = new Set((D.enrollments || []).filter(e => e.trainee_id === id).map(e => e.id));
  const ords = new Set((D.orders || []).filter(o => o.trainee_id === id || subs.has(o.subscription_id)).map(o => o.id));
  const invs = new Set((D.invoices || []).filter(i => i.trainee_id === id || ords.has(i.order_id)).map(i => i.id));
  const ids = new Set([id, ...subs, ...ens, ...ords, ...invs]);
  const drop = (k, f) => { if(D[k]) D[k] = D[k].filter(x => !f(x)); };
  drop('invoice_receipts', r => invs.has(r.invoice_id)); drop('invoices', i => invs.has(i.id)); drop('orders', o => ords.has(o.id));
  drop('sub_attendance', a => a.trainee_id === id || subs.has(a.subscription_id)); drop('attendance', a => a.trainee_id === id || ens.has(a.enrollment_id));
  drop('certificates', c => c.trainee_id === id || ens.has(c.enrollment_id)); drop('program_requests', r => r.trainee_id === id || ens.has(r.enrollment_id));
  drop('enrollments', e => ens.has(e.id)); drop('subscriptions', s => subs.has(s.id));
  ['submissions', 'attempts', 'messages', 'ratings', 'notifications', 'guardian_links', 'profile_change_requests', 'policy_acceptances'].forEach(k => drop(k, x => x.trainee_id === id));
  (D.trainer_groups || []).forEach(g => { if(Array.isArray(g.trainee_ids)) g.trainee_ids = g.trainee_ids.filter(x => x !== id); });
  (D.assignments || []).forEach(a => { if(Array.isArray(a.targets)) a.targets = a.targets.filter(x => x !== id); });
  const phoneShared = (D.trainees || []).some(x => x.id !== id && (x.phone === t.phone || x.guardian_phone === t.phone)) || (D.teachers || []).some(x => x.phone === t.phone);
  if(!phoneShared) ['devices', 'act_windows', 'login_requests', 'activation_attempts', 'custom_requests'].forEach(k => drop(k, x => x.phone === t.phone));
  drop('trainees', x => x.id === id);
  (D.daily_reports || []).forEach(r => (r.data?.groups || r.groups || []).forEach(g => (g.rows || []).forEach(x => { if(x.name === t.full_name) x.name = 'متدرب محذوف'; })));
  const tid = t.national_id;
  drop('audit_logs', l => ids.has(l.entity) || JSON.stringify(l.detail || '').includes(id) || (tid && JSON.stringify(l.detail || '').includes(tid)));
  return { subscriptions: subs.size, enrollments: ens.size, orders: ords.size, invoices: invs.size };
}
