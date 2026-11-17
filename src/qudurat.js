/* =====================================================================
   باقات القدرات والتحصيلي: الباقات، وجداول البنين والبنات، والاشتراكات،
   وحساب الحضور والمدة. منطق خالص بلا واجهة، يعمل على كائن البيانات D.
   مكرر في SQL (supabase/migrations/…_qudurat.sql) — أي تعديل هنا يُعدَّل هناك.
   ===================================================================== */
import { addDays, dowOf, toMin, riyadhNow, uid, fmtNum } from './utils.js';

/* ---------- الباقات ---------- */
export const TIERS = { basic:'الأساسية', silver:'الفضية', gold:'الذهبية', diamond:'الماسية', custom:'خصصناها لك' };
export const TIER_ORDER = ['basic', 'silver', 'gold', 'diamond', 'custom'];
export const MODES = { in_person:'حضوري', remote:'عن بُعد' };
/* المدة: وحدة وعدد. الأساسية 5 أسابيع، الفضية 3 أشهر، الذهبية والماسية سنة من أول حضور (D-09) */
export const DURATION_TXT = p => p.duration_unit === 'week' ? `${fmtNum(p.duration_value)} أسابيع` : p.duration_unit === 'month' ? `${fmtNum(p.duration_value)} أشهر` : +p.duration_value === 1 ? 'سنة كاملة' : `${fmtNum(p.duration_value)} سنوات`;
export const planTotal = p => (+p.reg_fee || 0) + (+p.installments || 0) * (+p.installment_amount || 0);
export const planName = p => p ? `${TIERS[p.tier] || p.name}${p.mode === 'remote' ? ' — عن بُعد' : ''}` : '';

const BASE_FEATURES = ['تأسيس في القسمين الكمي واللفظي', 'شرح المهارات والقواعد الأساسية', 'شرح وافٍ لأقسام الجزء الكمي واللفظي', 'شهادة معتمدة بنهاية الباقة'];
const ADV_FEATURES = ['تتضمن باقة التأسيس واستراتيجيات الحل السريع', 'تدريبات مكثفة على أهم النماذج وأحدث التجميعات', 'اختبار قبلي لتحديد مستوى المتدرب واحتياجاته', 'اختبارات تجريبية محاكية لاختبار قياس', 'تقارير دورية توضح مستوى التقدم والتحسن', 'المساعدة في اختيار الموعد المناسب للاختبار', 'شهادة معتمدة عند إتمام الباقة'];

/* البيانات المعتمدة من موقع المعهد (docs/PACKAGES.md) */
export function defaultPlans(){
  const mk = (tier, mode, o) => ({ id:uid(), tier, mode, program:o.program || 'qudurat', name:TIERS[tier], status: mode === 'remote' ? 'coming_soon' : 'open',
    duration_unit:o.unit, duration_value:o.value, hours:o.hours, reg_fee:o.reg, installments:o.n || 0, installment_amount:o.amt || 0,
    summary:o.summary, features:o.features, audience:o.audience || '', subjects:o.subjects || ['كمي', 'لفظي'], image:'', sort: TIER_ORDER.indexOf(tier) + (mode === 'remote' ? 10 : 0), active:true });
  const P = [];
  for (const [mode, reg, amt] of [['in_person', 690, 250], ['remote', 490, 150]]) {
    P.push(mk('basic', mode, { unit:'week', value:5, hours:30, reg: mode === 'in_person' ? 690 : 490, summary:'بداية قوية وتأسيس متكامل لاختبار القدرات.', features:BASE_FEATURES }));
    P.push(mk('silver', mode, { unit:'month', value:3, hours:72, reg, n:2, amt, summary:'إعداد متقدم لاختبار القدرات بقسميه الكمي واللفظي.', features:ADV_FEATURES }));
    P.push(mk('gold', mode, { unit:'year', value:1, hours:192, reg, n:4, amt, summary:'أقوى الباقات للإعداد المميز لاختبار القدرات بقسميه.', features:ADV_FEATURES }));
    P.push(mk('diamond', mode, { unit:'year', value:1, hours:256, reg, n:6, amt, program:'qudurat_tahsili', audience:'مخصصة لطلاب الصف الثالث الثانوي',
      summary:'أقوى باقاتنا: القدرات بقسميه مع التهيئة للاختبار التحصيلي.', features:[...ADV_FEATURES.slice(0, 1), 'تتضمن برنامج التهيئة للاختبار التحصيلي', ...ADV_FEATURES.slice(1)], subjects:['كمي', 'لفظي', 'تحصيلي'] }));
  }
  P.push(...customPlans(mk));
  return P;
}
/* باقة «خصصناها لك» (من مطوية المركز): 8 أسابيع، 3 حصص أسبوعيًا، 125 قسمًا؛ حضوري 800 على دفعتين، وعن بُعد 600 على دفعتين */
const CUSTOM_FEATURES = ['تأسيس وتدريب محاكٍ تمامًا لاختبار قياس', '125 قسمًا', '3 حصص أسبوعيًا لمدة 8 أسابيع', 'شهادة معتمدة', 'برنامج استراتيجيات الحل', 'الاختبار القبلي', 'المساعدة في اختيار الموعد المناسب', 'تقارير دورية'];
export function customPlans(mk){
  mk = mk || ((tier, mode, o) => ({ id:uid(), tier, mode, program:'qudurat', name:TIERS[tier], status: mode === 'remote' ? 'coming_soon' : 'open', duration_unit:o.unit, duration_value:o.value, hours:o.hours,
    reg_fee:o.reg, installments:o.n || 0, installment_amount:o.amt || 0, summary:o.summary, features:o.features, audience:'', subjects:['كمي', 'لفظي'], image:'', sort: TIER_ORDER.indexOf(tier) + (mode === 'remote' ? 10 : 0), active:true }));
  return [['in_person', 400], ['remote', 300]].map(([mode, half]) => mk('custom', mode, { unit:'week', value:8, hours:48, reg:half, n:1, amt:half, summary:'للاستعداد لاختبار القدرات: تأسيس وتدريب محاكٍ تمامًا لاختبار قياس.', features:CUSTOM_FEATURES }));
}
export const planOpen = p => p && p.active !== false && p.mode !== 'remote' && p.status === 'open';

/* ---------- الجداول: قالب البنات والبنين (D: وثيقة التطوير 3-أ-3) ---------- */
export const SECTIONS = { girls:'البنات', boys:'البنون' };
export const sectionOfGender = g => g === 'أنثى' ? 'girls' : 'boys';
export function defaultTemplates(){
  return [
    { section:'girls', dow:6, start:'18:30', end:'20:30' }, { section:'girls', dow:0, start:'18:00', end:'20:00' }, { section:'girls', dow:2, start:'18:00', end:'20:00' },
    { section:'boys',  dow:6, start:'16:30', end:'18:30' }, { section:'boys',  dow:1, start:'18:00', end:'20:00' }, { section:'boys',  dow:3, start:'18:00', end:'20:00' },
  ].map(t => ({ id:uid(), ...t }));
}
/* الاستثناءات: cancel (إلغاء جلسة يوم) أو makeup (جلسة تعويضية) أو move (تغيير وقت جلسة اليوم) */
export const EXC_TXT = { cancel:'إلغاء', makeup:'تعويضية', move:'تغيير وقت' };

/* جلسة القسم في يوم معيّن بعد تطبيق الاستثناءات، أو null */
export function sessionOn(D, section, date){
  const ex = (D.schedule_exceptions || []).filter(x => x.section === section && x.date === date);
  if (ex.some(x => x.type === 'cancel')) return null;
  const mv = ex.find(x => x.type === 'makeup' || x.type === 'move');
  if (mv) return { date, start:mv.start, end:mv.end, kind:mv.type, note:mv.note || '' };
  const t = (D.schedule_templates || []).find(x => x.section === section && x.dow === dowOf(date));
  return t ? { date, start:t.start, end:t.end, kind:'regular' } : null;
}
export function sessionsBetween(D, section, from, to){
  const out = []; if (!from || !to) return out;
  for (let d = from; d <= to; d = addDays(d, 1)) { const s = sessionOn(D, section, d); if (s) out.push(s); }
  return out;
}
/* هل انتهت الجلسة (أو انعقدت حتى الآن) */
const sessionDone = (s, n) => s.date < n.date || (s.date === n.date && toMin(n.hm) >= toMin(s.end));

/* ---------- الاشتراكات ---------- */
export const SUB_STATUS = { pending:'بانتظار أول حضور', active:'نشط', ended:'منتهٍ', cancelled:'ملغى' };
export const SUB_TONE = { pending:'info', active:'ok', ended:'g', cancelled:'bad' };

/* نهاية الاشتراك من تاريخ البداية: يوم قبل مرور المدة (D-09) */
export function subEnd(plan, start){
  if (!plan || !start) return null;
  const d = new Date(start + 'T12:00:00Z'), v = +plan.duration_value || 1;
  if (plan.duration_unit === 'week') d.setUTCDate(d.getUTCDate() + 7 * v);
  else if (plan.duration_unit === 'month') d.setUTCMonth(d.getUTCMonth() + v);
  else d.setUTCFullYear(d.getUTCFullYear() + v);
  return addDays(d.toISOString().slice(0, 10), -1);
}
export const subStatus = (s, today = riyadhNow().date) => s.status === 'cancelled' ? 'cancelled' : !s.start_date ? 'pending' : (s.end_date && s.end_date < today) ? 'ended' : 'active';

/* جلسات ما قبل التتبع: من بداية الاشتراك حتى يوم إدخاله في المنصة (track_from). لا سجل حضور لها، فتُحتسب حضورًا
   إلا عدد أيام الغياب الذي تدخله الإدارة من الكشوف اليدوية (prior_absences) ↔ sub_stats */
export const priorSessions = (D, s) => { if(!(s.start_date && s.track_from && s.track_from > s.start_date)) return [];
  const last = addDays(s.track_from, -1); return sessionsBetween(D, s.section, s.start_date, s.end_date && s.end_date < last ? s.end_date : last); };
/* إحصاء الاشتراك: الجلسات من البداية حتى النهاية، والمنعقد منها، والحضور (يوم واحد لكل تاريخ) */
export function subStats(D, s, n = riyadhNow()){
  const att = (D.sub_attendance || []).filter(a => a.subscription_id === s.id);
  const plan = (D.plans || []).find(p => p.id === s.plan_id);
  const st = subStatus(s, n.date);
  if (!s.start_date) return { status:st, plan, total:0, held:0, attended:0, late:0, score:0, absent:0, remaining:0, rate:null, finalRate:0, required:0, needed:0, reachable:true, consec:0, lastAtt:null, timePct:0, daysLeft:null, next:null, att };
  const end = s.end_date || subEnd(plan, s.start_date);
  const prior = priorSessions(D, s), pa = Math.min(prior.length, Math.max(0, Number(s.prior_absences) || 0));
  const tracked = sessionsBetween(D, s.section, s.track_from && s.track_from > s.start_date ? s.track_from : s.start_date, end);   // المسجّلون سابقًا: التتبع الفعلي من تاريخ إدخالهم
  const all = [...prior, ...tracked];
  const heldT = tracked.filter(x => sessionDone(x, n) || att.some(a => a.att_date === x.date)), held = [...prior, ...heldT];
  const days = new Set(att.map(a => a.att_date));
  const attended = days.size + prior.length - pa, late = att.filter(a => a.status === 'متأخر').length;
  const lw = D.settings?.late_weight ?? 1, score = attended - late * (1 - lw);
  const span = Math.max(1, (Date.parse(end) - Date.parse(s.start_date)) / 864e5 + 1);
  const passed = Math.min(span, Math.max(0, (Date.parse(n.date) - Date.parse(s.start_date)) / 864e5 + 1));
  const remaining = Math.max(0, all.length - held.length);
  const thr = (D.settings?.cert_threshold ?? 75) / 100, required = Math.ceil(all.length * thr), needed = Math.max(0, Math.ceil(required - score - 1e-9));
  let consec = 0; for (let i = heldT.length - 1; i >= 0; i--) { if (days.has(heldT[i].date)) break; consec++; }
  const rate = held.length ? Math.round(score / held.length * 100) : null;
  return { status:st, plan, end, total:all.length, held:held.length, attended, late, score, absent:Math.max(0, held.length - attended), remaining, rate,
    finalRate: rate ?? 0, required, needed, reachable: needed <= remaining, consec, lastAtt: [...days].sort().pop() || null,
    timePct: Math.round(passed / span * 100), daysLeft: Math.max(0, Math.round(span - passed)), next: all.find(x => !sessionDone(x, n)) || null, att, prior:prior.length, priorAbsences:pa };
}

/* الاشتراكات التي لها جلسة الآن (مع مدة السماح قبل البداية) */
export function subsInSession(D, trainee, n = riyadhNow()){
  const early = D.settings?.early_minutes ?? 60, now = toMin(n.hm);
  return (D.subscriptions || []).filter(s => s.trainee_id === trainee.id && ['pending', 'active'].includes(subStatus(s, n.date)))
    .map(s => ({ s, ses: sessionOn(D, s.section, n.date) }))
    .filter(x => x.ses && now >= toMin(x.ses.start) - early && now <= toMin(x.ses.end));
}

/* تسجيل حضور اشتراك اليوم. أول حضور يبدأ الاشتراك (D-08). المسح المكرر لا ينشئ سجلًا ثانيًا. */
export function subCheckin(D, s, ses, n = riyadhNow()){
  const plan = (D.plans || []).find(p => p.id === s.plan_id);
  const ex = (D.sub_attendance || []).find(a => a.subscription_id === s.id && a.att_date === n.date);
  const base = { kind:'subscription', program: planName(plan), section: SECTIONS[s.section], date: n.date };
  if (ex) return { ok:true, already:true, ...base, status:ex.status, time:ex.time.slice(0, 5) };
  const late = toMin(n.hm) > toMin(ses.start) + (D.settings?.late_minutes ?? 15);
  const rec = { id:uid(), subscription_id:s.id, trainee_id:s.trainee_id, att_date:n.date, time:n.time, status: late ? 'متأخر' : 'حاضر', checkin_at:new Date().toISOString() };
  const started = !s.start_date;
  return { ok:true, already:false, ...base, status:rec.status, time:n.hm, started, _rec:rec,
    _start: started ? { start_date:n.date, end_date: subEnd(plan, n.date) } : null };
}

/* ---------- بيانات تجريبية: مشتركون في الباقات، بعضهم بدأ قبل 3 أسابيع ---------- */
export function demoQudurat(D, person, rnd){
  D.plans = defaultPlans(); D.schedule_templates = defaultTemplates(); D.schedule_exceptions = []; D.subscriptions = []; D.sub_attendance = [];
  const n = riyadhNow(), open = D.plans.filter(planOpen);
  for (let i = 0; i < 36; i++) {
    const t = person(); t.birth_date = `${2007 + rnd(0, 2)}-0${rnd(1, 9)}-1${rnd(0, 9)}`; t.education = 'ثانوي'; t.employer = '';
    D.trainees.push(t);
    const plan = open[i % open.length], section = sectionOfGender(t.gender);
    const s = { id:uid(), ref:'SQ-' + (200000 + i), trainee_id:t.id, plan_id:plan.id, section, subjects:[...plan.subjects], status:'pending', start_date:null, end_date:null, created_at:addDays(n.date, -30) + 'T09:00:00Z' };
    D.subscriptions.push(s);
    if (i % 6 === 5) continue;                                   // لم يحضر بعد
    let start = addDays(n.date, -rnd(5, 24));
    while (!sessionOn(D, section, start)) start = addDays(start, 1);
    s.start_date = start; s.end_date = subEnd(plan, start); s.status = 'active';
    for (const ses of sessionsBetween(D, section, start, n.date)) {
      if (!sessionDone(ses, n)) continue;
      if (ses.date !== start && Math.random() > 0.82) continue;   // غياب
      const late = Math.random() < 0.12, m = toMin(ses.start) + (late ? rnd(16, 40) : rnd(-20, 10));
      const tm = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
      D.sub_attendance.push({ id:uid(), subscription_id:s.id, trainee_id:t.id, att_date:ses.date, time:tm, status: late ? 'متأخر' : 'حاضر', checkin_at:ses.date + 'T' + tm });
    }
  }
}

/* ---------- تحليلات الباقات لكل قسم في فترة (لوحة التحليلات) ----------
   المتوقع في يوم جلسة = الاشتراكات القائمة فيه (بدأت قبله أو فيه، ولم تنتهِ، ومتابَعة منه)، والحضور يوم واحد لكل تاريخ.
   الجلسة الجارية اليوم تُحتسب بعد بدايتها فقط، والقادمة لا تُحتسب. */
export function quduratAnalytics(D, from, to, n = riyadhNow()){
  const testIds = new Set((D.trainees || []).filter(t => t.is_test).map(t => t.id));   // الحسابات التجريبية خارج الإحصاءات
  const subs = (D.subscriptions || []).filter(s => s.status !== 'cancelled' && s.start_date && !testIds.has(s.trainee_id));
  const att = (D.sub_attendance || []).filter(a => a.att_date >= from && a.att_date <= to);
  const last = to < n.date ? to : n.date;
  const live = (s, d) => s.start_date <= d && (!s.end_date || s.end_date >= d) && (!s.track_from || s.track_from <= d);
  const out = {};
  for (const sec of Object.keys(SECTIONS)) {
    const mine = subs.filter(s => s.section === sec), ids = new Set(mine.map(s => s.id));
    const days = sessionsBetween(D, sec, from, last).filter(s => s.date < n.date || toMin(n.hm) >= toMin(s.start)).map(s => {
      const exp = mine.filter(x => live(x, s.date)), a = att.filter(x => x.att_date === s.date && ids.has(x.subscription_id));
      return { date:s.date, expected:exp.length, present:a.length, late:a.filter(x => x.status === 'متأخر').length };
    });
    const e = days.reduce((t, x) => t + x.expected, 0), p = days.reduce((t, x) => t + x.present, 0), l = days.reduce((t, x) => t + x.late, 0);
    const active = (D.subscriptions || []).filter(s => s.section === sec && !testIds.has(s.trainee_id) && subStatus(s, n.date) === 'active').length;
    const pending = (D.subscriptions || []).filter(s => s.section === sec && !testIds.has(s.trainee_id) && subStatus(s, n.date) === 'pending').length;
    const todayS = sessionOn(D, sec, n.date);
    const byPlan = {};
    for (const s of mine) { const k = s.plan_id || '—'; byPlan[k] = byPlan[k] || { expected:0, present:0 };
      for (const d of days) if (live(s, d.date)) { byPlan[k].expected++; if (att.some(x => x.subscription_id === s.id && x.att_date === d.date)) byPlan[k].present++; } }
    out[sec] = { days, sessions:days.length, expected:e, present:p, late:l, rate:e ? Math.min(100, Math.round(p / e * 100)) : 0, lateRate:p ? Math.round(l / p * 100) : 0,
      active, pending, today: todayS ? { ...todayS, present: (D.sub_attendance || []).filter(x => x.att_date === n.date && ids.has(x.subscription_id)).length,
        expected: mine.filter(x => live(x, n.date)).length } : null, byPlan };
  }
  return out;
}
