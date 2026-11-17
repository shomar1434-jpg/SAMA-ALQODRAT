import { sessionReminders, inboxOf, adminRecipients } from './inbox_logic.js';
import { checkAcceptance, validatePolicy, nextVersion, demoPolicies } from './policy_logic.js';
import { catalogPrograms, computeEnd } from './catalog.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL, adminBase, PAGE } from './config.js';
import { DEFAULT_ABOUT, defaultPartners } from './partners.js';
import { defaultPlans, planTotal, customPlans, defaultTemplates, demoQudurat, planName, planOpen, sectionOfGender, SECTIONS, subCheckin, subEnd, subsInSession, subStats, subStatus, sessionOn, sessionsBetween, priorSessions } from './qudurat.js';
import { rolesOfPhone, normPhone, makeNotification, ROLE_TXT } from './portal_logic.js';
import { makeReport, isPastReportTime } from './report_logic.js';
import { buildInvoice, validReceipt } from './invoice_logic.js';
import { PUB_STATES } from './courses.js';
import { checkLecture, lecturesForTrainees, ytId } from './studio_logic.js';
import { checkLines, linesMethod, linesText, linesRef, refundable, refundNumber, r2 } from './billing_logic.js';
import { keepNote } from './import_logic.js';
import { newActCode, resolveIdent, reqLive, REQ_TTL_MIN, REQ_MAX_HOUR, ACT_FAIL, ACT_LOCKED, ACT_MAX_FAILS, WINDOW_MINUTES, windowLive, sha256 } from './device_logic.js';
import { checkProfile, checkGroup, GROUPS_MAX } from './trainer_logic.js';
import { PAY_METHODS, BANK_DEFAULT, orderRemaining, orderNumber, attendanceBlocked, orderPublic, checkTransfer, validIban } from './order_logic.js';
import { checkRole, auditFilter, auditRedact } from './admin_logic.js';
import { checkBirthGuardian, isKidsProgram, selfLinkLogic, LINK_FAIL, LINK_LOCKED } from './identity_logic.js';
import { weeklyNotes } from './weekly_logic.js';
import { catOk, simOpen, simExpired, simsToday, SIM_DAILY_MAX, sortSubjects, buildSim, cleanAnswers, CATEGORIES } from './sim_logic.js';
import { SUBJECTS, validateAssignment, validateQuestion, buildAttempt, attemptPublic, gradeAttempt, canRate, ratingSummary, validateMessage, teacherCovers, teacherTeaches, studentHasScope, bankFor, period, demoLearning, backfillCategories, bankUnitsOf, buildQuiz, quizPublic, gradeQuiz, teacherBank, normalizeBundle, LETTERS, isTargeted, assignmentPublic, submissionPublic, checkTargets, checkExamKeys, quizDeadline, quizOpen , attemptsLeft, attemptsOf, snapOf, liveSubsOf } from './learning_logic.js';
import { addDays, dowOf, fmtDate, fmtMoney, fmtNum, hash32, makeSaudiId, riyadhNow, t12, toMin, uid, validSaudiId } from './utils.js';

/* =====================================================================
   نموذج البيانات القائم على الدفعات
   البرنامج ← دفعة نشطة واحدة (مفتوحة أو منعقدة) + دفعات مؤرشفة
   الدفعة ← كشف المسجلين (enrollments) ← سجل الحضور اليومي
   المتدرب (trainee) شخص واحد بسجله المدني، يمكن أن يسجّل في دفعات عدة
   ===================================================================== */
export const progCode = p => p.code || ('p' + (p.accreditation_no || String(p.id).replace(/[^a-z0-9]/gi,'').slice(0,8)));
export const cohortArchived = (c, today=riyadhNow().date) => !!c.archived_at || (c.end_date && c.end_date < today);
export const cohortState = (c, today=riyadhNow().date) => cohortArchived(c,today) ? 'archived' : (c.start_date<=today ? 'running' : 'upcoming');
export const STATE_TXT = {archived:'مؤرشفة', running:'منعقدة', upcoming:'لم تبدأ'};
export const STATE_PILL = {archived:'g', running:'ok', upcoming:'info'};
export function isSessionDay(c, d){ return !!c && !!(c.start_date && c.end_date) && d>=c.start_date && d<=c.end_date && (c.days||[]).includes(dowOf(d)); }
export const activeCohortOf = (D, pid, today) => D.cohorts.filter(c=>c.program_id===pid && !cohortArchived(c,today)).sort((a,b)=>b.number-a.number)[0] || null;
/* دفعة يُسجَّل فيها الآن (↔ program_open_cohort) */
export const openCohortOf = (D, pid, today) => { const c=activeCohortOf(D, pid, today); return c && c.reg_open && takenOf(D, c.id) < c.seats ? c : null; };
export const cohortsOfProgram = (D, pid) => D.cohorts.filter(c=>c.program_id===pid).sort((a,b)=>b.number-a.number);
export const enrollsOf = (D, cid, all=false) => D.enrollments.filter(e=>e.cohort_id===cid && (all || e.status!=='ملغى'));
export const takenOf = (D, cid) => enrollsOf(D,cid).length;
export const sessionDays = (c, upTo) => { const out=[]; if(!c?.start_date) return out; for(let d=c.start_date; d<=c.end_date && (!upTo||d<=upTo); d=addDays(d,1)) if(isSessionDay(c,d)) out.push(d); return out; };
export const priceTxt = v => (v===null||v===undefined||v===''||Number(v)===0) ? 'السعر عند التواصل' : fmtMoney(v);
export const newRef = () => 'SQ-' + String(100000 + Math.floor(Math.random()*900000));
/* نسبة حضور تسجيل واحد: المحاضرات المنعقدة منذ تسجيله حتى اليوم */
export function enrollmentStats(D, e, c){
  c = c || D.cohorts.find(x=>x.id===e.cohort_id); const n=riyadhNow(), from=e.created_at.slice(0,10);
  // الدفعة المؤرشفة يدويًا قبل نهايتها: تُحسب أيامها حتى تاريخ الأرشفة فقط
  const cut = (c.archived_at && !c.archived_auto && c.archived_at.slice(0,10) < c.end_date) ? c.archived_at.slice(0,10) : c.end_date;
  const all = sessionDays(c).filter(d=>d>=from && d<=cut);
  const held = all.filter(d=> d<n.date || (d===n.date && toMin(n.hm)>=toMin(c.end_time)));
  const att = D.attendance.filter(a=>a.enrollment_id===e.id);
  const attended = att.length, late = att.filter(a=>a.status==='متأخر').length;
  const lw = D.settings.late_weight ?? 1, score = attended - late*(1-lw);          // وزن التأخر يحدده المسؤول
  const remaining = all.length - held.length - (att.some(a=>a.att_date===n.date) && !held.includes(n.date) ? 1 : 0);
  const thr = (D.settings.cert_threshold ?? 75)/100, required = Math.ceil(all.length*thr), needed = Math.max(0, Math.ceil(required-score-1e-9));
  let consec=0; for(let i=held.length-1;i>=0;i--){ if(att.some(a=>a.att_date===held[i])) break; consec++; }
  const lastAtt = att.map(a=>a.att_date).sort().pop() || null;
  return { total:all.length, held:held.length, attended, late, score, absent:Math.max(0,held.length-attended), remaining:Math.max(0,remaining), required, needed,
    rate: held.length ? Math.round(score/held.length*100) : null, finalRate: (cohortArchived(c) ? (held.length ? Math.round(score/held.length*100) : 0) : (all.length ? Math.round(score/all.length*100) : 0)), consec, lastAtt,
    reachable: needed <= Math.max(0,remaining) };
}
/* ===== آلية الاحتساب ورسائل التنبيه: يضبطها مسؤول النظام ===== */
/* التصنيف الحالي لأسئلة محاولات البوابة واختباراتها (↔ q_meta في portal_data) */
const qMetaOf=(D, sc)=>{ const ids=new Set([...(sc.attempts||[]).flatMap(a=>(a.snapshot||[]).map(q=>q.id)), ...(sc.assignments||[]).flatMap(a=>(a.quiz||[]).map(q=>q.id))]), o={};
  (D.questions||[]).forEach(q=>{ if(ids.has(q.id)) o[q.id]=[q.category||'', q.unit||'']; }); return o; };
const catGuard=(subject, c)=>{ if(c&&!catOk(subject, c)) throw new Error('التصنيف لا يناسب المقرر'); return c||''; };
export const CALC_DEFAULTS = { cert_threshold:75, late_weight:1, warn_consec:2,
  msg_ok:'نسبة حضورك {النسبة}٪ وأنت على المسار الصحيح للحصول على الشهادة. واصل الحضور.',
  msg_low:'تنبيه: نسبة حضورك {النسبة}٪ دون حد الشهادة {الحد}٪. احرص على حضور المحاضرات القادمة.',
  msg_consec:'تنبيه غياب: غبت {المتتالي} محاضرات متتالية. انتظم في الحضور حتى لا تفقد أهلية الشهادة.',
  msg_last:'تنبيه أخير: لا مجال لغياب آخر. يلزمك حضور {المطلوب} من {المتبقي} محاضرة متبقية للحصول على الشهادة.',
  msg_lost:'لم يعد بالإمكان بلوغ حد الشهادة {الحد}٪ في هذه الدفعة. يُرجى مراجعة إدارة المركز.',
  msg_done:'أتممت البرنامج بنسبة حضور {النسبة}٪.', msg_below:'انتهت الدفعة بنسبة حضور {النسبة}٪، وهي دون حد الشهادة {الحد}٪.',
  msg_upcoming:'تبدأ دفعتك {البداية}. احرص على حضور أول محاضرة.' };
export const calcSet = st => { const o={}; for(const k in CALC_DEFAULTS) o[k] = (st && st[k]!=null && st[k]!=='') ? st[k] : CALC_DEFAULTS[k]; return o; };
export const LEVEL_TXT = { ok:'منتظم', low:'نسبة منخفضة', consec:'غياب متتالٍ', last:'لا مجال للغياب', lost:'لا يبلغ الحد', done:'أتمّ البرنامج', below:'دون الحد', upcoming:'لم تبدأ', none:'لم تنعقد محاضرات' };
export const LEVEL_TONE = { ok:'ok', low:'warn', consec:'warn', last:'bad', lost:'bad', done:'ok', below:'g', upcoming:'info', none:'info' };
export function attendanceLevel(s, state, st){
  const C=calcSet(st), thr=+C.cert_threshold;
  if(state==='upcoming') return 'upcoming';
  if(state==='archived') return s.finalRate>=thr ? 'done' : 'below';
  if(!s.held) return 'none';
  if(!s.reachable) return 'lost';
  if(s.needed>0 && s.needed>=s.remaining-1) return 'last';
  if(s.consec>=+C.warn_consec) return 'consec';
  if(s.rate!==null && s.rate<thr) return 'low';
  return 'ok';
}
export function fillMsg(tpl, v){ return String(tpl||'').replace(/\{([^}]+)\}/g,(m,k)=> v[k]!=null ? v[k] : m); }
export function levelMessage(level, s, st, extra={}){
  const C=calcSet(st), key={ok:'msg_ok',low:'msg_low',consec:'msg_consec',last:'msg_last',lost:'msg_lost',done:'msg_done',below:'msg_below',upcoming:'msg_upcoming'}[level];
  if(!key) return 'لم تنعقد محاضرات دفعتك بعد.';
  const rate = level==='done'||level==='below' ? s.finalRate : (s.rate??0);
  return fillMsg(C[key], { 'النسبة':fmtNum(rate), 'الحد':fmtNum(C.cert_threshold), 'المتتالي':fmtNum(s.consec), 'المطلوب':fmtNum(s.needed), 'المتبقي':fmtNum(s.remaining), 'الغياب':fmtNum(s.absent), ...extra });
}
export const maskName = n => { const p=String(n||'').trim().split(/\s+/); return p.length<=2 ? p.join(' ') : `${p[0]} ${'•'.repeat(3)} ${p[p.length-1]}`; };
export function issueCertificatesLocal(D, c){
  D.certificates = D.certificates || []; const p=D.programs.find(x=>x.id===c.program_id); const thr=D.settings.cert_threshold ?? 75; let k=0;
  const seq0 = D.certificates.filter(x=>x.cohort_id===c.id).length;
  enrollsOf(D,c.id).forEach(e=>{ if(D.certificates.some(x=>x.enrollment_id===e.id)) return; const s=enrollmentStats(D,e,c); if(s.finalRate<thr) return;
    k++; D.certificates.push({id:uid(), serial:`SQ-${p?.accreditation_no||progCode(p).slice(1)}-${c.number}-${String(seq0+k).padStart(3,'0')}`, enrollment_id:e.id, cohort_id:c.id, program_id:c.program_id, trainee_id:e.trainee_id, rate:s.finalRate, issued_at:new Date().toISOString(), revoked:false}); });
  return k;
}
export function certPublic(D, cert){
  if(!cert) return null; const p=D.programs.find(x=>x.id===cert.program_id), c=D.cohorts.find(x=>x.id===cert.cohort_id), t=D.trainees.find(x=>x.id===cert.trainee_id);
  return {serial:cert.serial, revoked:cert.revoked, issued_at:cert.issued_at, rate:cert.rate, name_masked:maskName(t?.full_name), gender:t?.gender, program:p?.name, category:p?.category, accreditation_no:p?.accreditation_no, hours:p?.hours, number:c?.number, start_date:c?.start_date, end_date:c?.end_date};
}
/* بنود برامج (دفعات) المتدرب: الحضور والحالة والرسالة والشهادة — تستخدمها «حضوري» وبوابة المتدرب وولي الأمر */
export function cohortItemsOf(D, t){
  return (D.enrollments||[]).filter(e=>e.trainee_id===t.id && e.status!=='ملغى').map(e=>{ const c=D.cohorts.find(x=>x.id===e.cohort_id), p=D.programs.find(x=>x.id===e.program_id); if(!c||!p) return null;
    const s=enrollmentStats(D,e,c), n=riyadhNow(), state=cohortState(c); const next=sessionDays(c).find(d=>d>n.date||(d===n.date&&toMin(n.hm)<toMin(c.end_time)));
    const cert=(D.certificates||[]).find(x=>x.enrollment_id===e.id&&!x.revoked), level=attendanceLevel(s,state,D.settings);
    return {program:p.name, code:progCode(p), number:c.number, trainer:c.trainer||'', hall:c.hall||'', state, start_date:c.start_date, end_date:c.end_date, start_time:c.start_time, ...s, next: cohortArchived(c)?null:(next||null), cert: cert?cert.serial:null,
      enrollment_id:e.id, hours:p.hours||null, level, message: levelMessage(level,s,D.settings,{'البرنامج':p.name,'الاسم':t.full_name.split(' ')[0],'البداية':fmtDate(c.start_date)})}; }).filter(Boolean);
}
export function traineeAttendanceLogic(D, nid){
  const t=D.trainees.find(x=>x.national_id===nid);
  if(!t) return {ok:false, reason:'no_match'};
  const list = cohortItemsOf(D, t)
    .concat(subAttendanceItems(D,t))
    .sort((a,b)=>({running:0,upcoming:1,archived:2}[a.state]-{running:0,upcoming:1,archived:2}[b.state]) || String(b.start_date||'9').localeCompare(String(a.start_date||'9')));
  return {ok:true, trainee:t, first_name:t.full_name.split(' ')[0], threshold:calcSet(D.settings).cert_threshold, items:list};
}
/* ما يراه المتدرب فقط: نسبة الحضور ورسالة التنبيه */
export function myAttendanceLogic(D, nid){
  const r=traineeAttendanceLogic(D,nid); if(!r.ok) return r;
  return {ok:true, first_name:r.first_name, items:r.items.map(x=>({kind:x.kind||'cohort', program:x.program, section:x.section||null, number:x.number, state:x.state, start_date:x.start_date, end_date:x.end_date,
    rate: x.state==='archived' ? x.finalRate : x.state==='upcoming' ? null : x.rate, level:x.level, message:x.message}))};
}

/* منطق التحضير المشترك: يطابق السجل المدني مع كشف الدفعة المنعقدة اليوم */
export function checkinLogic(D, nid, code, programCode, dayCode){
  const st=D.settings, n=riyadhNow(), now=toMin(n.hm);
  if(st.require_code && code!==dayCode) return {ok:false, reason:'bad_code'};
  const t = D.trainees.find(x=>x.national_id===nid);
  let program=null, cohorts;
  if(programCode){
    program = D.programs.find(p=>progCode(p)===programCode);
    if(!program) return {ok:false, reason:'no_program'};
    const c = activeCohortOf(D, program.id, n.date);
    if(!c || c.start_date>n.date) return {ok:false, reason:'no_cohort', program:program.name, upcoming: c?{number:c.number,start:c.start_date}:null};
    cohorts=[c];
  } else {
    cohorts = D.cohorts.filter(c=>!cohortArchived(c,n.date) && c.start_date<=n.date);
  }
  const mine = t ? cohorts.map(c=>({c, e:D.enrollments.find(e=>e.cohort_id===c.id && e.trainee_id===t.id && e.status!=='ملغى')})).filter(x=>x.e) : [];
  if(!mine.length) return {ok:false, reason:'not_in_cohort', program:program?.name, number:cohorts[0]?.number};
  const today = mine.filter(x=>isSessionDay(x.c,n.date));
  const pick = today.find(x=>now>=toMin(x.c.start_time)-st.early_minutes && now<=toMin(x.c.end_time));
  const progName = c => D.programs.find(p=>p.id===c.program_id)?.name;
  if(!pick){
    const nxt = mine.map(x=>{ const ds=sessionDays(x.c).filter(d=>d>n.date || (d===n.date && now<toMin(x.c.start_time)-st.early_minutes)); return ds[0]?{d:ds[0],c:x.c}:null; }).filter(Boolean).sort((a,b)=>a.d.localeCompare(b.d))[0];
    return {ok:false, reason:'no_session', name:t.full_name, program:progName(mine[0].c), number:mine[0].c.number, next: nxt?{date:nxt.d, time:nxt.c.start_time}:null};
  }
  const {c,e}=pick;
  const pkg = e.package_id ? D.packages.find(k=>k.id===e.package_id)?.name : null;
  const base = {name:t.full_name, program:progName(c), number:c.number, hall:c.hall, package:pkg, date:n.date};
  const ex = D.attendance.find(a=>a.enrollment_id===e.id && a.att_date===n.date);
  if(ex) return {ok:true, already:true, ...base, status:ex.status, time:ex.time.slice(0,5)};
  const status = now > toMin(c.start_time)+st.late_minutes ? 'متأخر' : 'حاضر';
  const rec = { id:uid(), enrollment_id:e.id, cohort_id:c.id, program_id:c.program_id, trainee_id:t.id, att_date:n.date, time:n.time, checkin_at:new Date().toISOString(), status };
  return {ok:true, already:false, ...base, status, time:n.hm, _rec:rec};
}

/* =====================================================================
   التحضير الموحد (D-03): باركود ثابت واحد ← السجل المدني ← يتعرف النظام على
   اشتراك الباقة أو تسجيل الدفعة الذي له جلسة الآن. عند التعدد يختار المتدرب.
   ===================================================================== */
export function unifiedCheckin(D, nid, code, programCode, dayCode, choice){
  if(programCode) return checkinLogic(D, nid, code, programCode, dayCode);       // باركود برنامج محدد: السلوك السابق
  const n=riyadhNow(), t=D.trainees.find(x=>x.national_id===nid);
  if(D.settings.require_code && code!==dayCode) return {ok:false, reason:'bad_code'};
  if(!t) return {ok:false, reason:'not_in_cohort'};
  const subs = subsInSession(D, t, n).map(x=>({id:'s:'+x.s.id, label:planName(D.plans.find(p=>p.id===x.s.plan_id)), x}));
  const coh = checkinLogic(D, nid, code, null, dayCode);
  const opts = [...subs, ...(coh.ok ? [{id:'c:'+(coh._rec?.enrollment_id||coh.enrollment_id||'x'), label:coh.program, coh}] : [])];
  if(!opts.length){
    const mine=(D.subscriptions||[]).filter(s=>s.trainee_id===t.id && ['pending','active'].includes(subStatus(s,n.date)));
    if(mine.length){ let nx=null; for(const s of mine){ for(let d=n.date, i=0; i<21 && !nx; i++, d=addDays(d,1)){ const ses=sessionOn(D,s.section,d); if(ses && (d>n.date || toMin(n.hm)<toMin(ses.start)-(D.settings.early_minutes??60))) nx={date:d, time:ses.start}; } }
      return {ok:false, reason:'no_session', name:t.full_name, program:planName(D.plans.find(p=>p.id===mine[0].plan_id)), next:nx}; }
    return coh;
  }
  let pick = opts.length===1 ? opts[0] : opts.find(o=>o.id===choice);
  if(!pick) return {ok:false, reason:'choose', name:t.full_name, options:opts.map(o=>({id:o.id, label:o.label}))};
  if(pick.coh) return pick.coh;
  const r = subCheckin(D, pick.x.s, pick.x.ses, n);
  return {...r, name:t.full_name, _sub:pick.x.s.id};
}
/* اشتراكات الباقات ضمن «حضوري» وسجل المتدرب في الإدارة */
export function subAttendanceItems(D, t){
  const n=riyadhNow();
  return (D.subscriptions||[]).filter(s=>s.trainee_id===t.id && s.status!=='cancelled').map(s=>{
    const st=subStats(D,s,n), plan=st.plan, state = st.status==='ended'?'archived':st.status==='pending'?'upcoming':'running';
    const level = st.status==='pending' ? 'none' : attendanceLevel(st, state, D.settings);
    const message = st.status==='pending' ? `اشتراكك في ${planName(plan)} يبدأ من أول يوم تحضر فيه. مواعيد ${SECTIONS[s.section]}: ${sectionDaysTxt(D,s.section)}.`
      : levelMessage(level, st, D.settings, {'البرنامج':planName(plan),'الاسم':t.full_name.split(' ')[0],'البداية':s.start_date?fmtDate(s.start_date):''});
    return {kind:'subscription', id:s.id, program:planName(plan), section:SECTIONS[s.section], number:null, state, start_date:s.start_date, end_date:st.end||null, ...st, plan:undefined, att:undefined,
      level, message, timePct:st.timePct, daysLeft:st.daysLeft};
  });
}
export function sectionDaysTxt(D, section){
  const DN=['الأحد','الاثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
  return (D.schedule_templates||[]).filter(x=>x.section===section).sort((a,b)=>((a.dow+1)%7)-((b.dow+1)%7)).map(x=>`${DN[x.dow]} من ${t12(x.start)} إلى ${t12(x.end)}`).join('، ');
}
/* =====================================================================
   بيانات البوابة المحصورة بالدور (مصدر واحد للحساب: portal_logic.js).
   في السحابة تعيدها الدالة portal_data(role) من الخادم بعد التحقق من الهوية.
   ===================================================================== */
export function scopeData(D, role, phone){
  const ph=normPhone(phone), pick=(o,k)=>Object.fromEntries(k.map(x=>[x,o[x]]));
  const base={ plans:D.plans||[], schedule_templates:D.schedule_templates||[], schedule_exceptions:D.schedule_exceptions||[],
    settings:pick(D.settings||{},['late_minutes','early_minutes','late_weight','cert_threshold','warn_consec','remind_minutes','sim_per_subject','sim_sec_per_q',...Object.keys(CALC_DEFAULTS).filter(k=>k.startsWith('msg_'))]) };
  const tSafe=t=>({id:t.id, full_name:t.full_name, gender:t.gender});
  const ordersFor=ids=>(D.orders||[]).filter(o=>ids.includes(o.trainee_id)).map(o=>orderPublic(o, D.settings.bank));
  const teachersPub=(D.teachers||[]).filter(t=>t.active!==false).map(t=>({id:t.id, full_name:t.full_name, section:t.section, subjects:t.subjects, active:true, bio:t.bio||'', avatar:t.avatar||'', cv:t.cv||''}));
  const forTrainees=ids=>{ const subs=(D.subscriptions||[]).filter(s=>ids.includes(s.trainee_id)), sid=subs.map(s=>s.id);
    const scopes=subs.flatMap(s=>(s.subjects||[]).map(x=>s.section+':'+x));
    return { trainees:D.trainees.filter(t=>ids.includes(t.id)).map(tSafe), subscriptions:subs, sub_attendance:(D.sub_attendance||[]).filter(a=>sid.includes(a.subscription_id)),
      assignments:(D.assignments||[]).filter(a=>scopes.includes(a.section+':'+a.subject)&&ids.some(id=>isTargeted(a,id))).map(a=>assignmentPublic(a,ids,(D.submissions||[]).some(x=>x.assignment_id===a.id&&ids.includes(x.trainee_id)))), submissions:(D.submissions||[]).filter(x=>ids.includes(x.trainee_id)).map(x=>submissionPublic(x,(D.assignments||[]).find(a=>a.id===x.assignment_id),riyadhNow().date)),
      teachers:teachersPub.map(t=>{ const full=(D.teachers||[]).find(y=>y.id===t.id); return full?.telegram && ids.some(id=>teacherTeaches(D, full, id)) ? {...t, telegram:full.telegram} : t; }),   // رابط قناة المدرب لمتدربيه فقط
      bank_units:bankUnitsOf(D, subs, D.teachers),
      // البرامج: دفعات المتدرب وحضورها وشهاداتها (للبوابة بدل «حضوري»)
      ...(()=>{ const en=(D.enrollments||[]).filter(e=>ids.includes(e.trainee_id)), cids=en.map(e=>e.cohort_id), pids=en.map(e=>e.program_id), eids=en.map(e=>e.id);
        return { enrollments:en, cohorts:(D.cohorts||[]).filter(c=>cids.includes(c.id)), programs:(D.programs||[]).filter(p=>pids.includes(p.id)).map(p=>({id:p.id, code:p.code, name:p.name, category:p.category, accreditation_no:p.accreditation_no, hours:p.hours})),
          attendance:(D.attendance||[]).filter(a=>eids.includes(a.enrollment_id)), certificates:(D.certificates||[]).filter(x=>eids.includes(x.enrollment_id)).map(x=>({id:x.id, serial:x.serial, enrollment_id:x.enrollment_id, rate:x.rate, issued_at:x.issued_at, revoked:x.revoked})) }; })(),
      attempts:(D.attempts||[]).filter(a=>ids.includes(a.trainee_id)).map(attemptPublic), ratings:(D.ratings||[]).filter(r=>ids.includes(r.trainee_id)), messages:(D.messages||[]).filter(m=>ids.includes(m.trainee_id)) }; };
  if(role==='student'){ const ids=D.trainees.filter(t=>normPhone(t.phone)===ph).map(t=>t.id);
    return {...base, ...forTrainees(ids), lectures:lecturesForTrainees(D, ids), orders:ordersFor(ids), notifications:(D.notifications||[]).filter(x=>x.to==='student'&&ids.includes(x.trainee_id)), guardian_links:[]}; }
  if(role==='guardian'){ const links=(D.guardian_links||[]).filter(l=>l.status==='verified'&&normPhone(l.guardian_phone)===ph), ids=links.map(l=>l.trainee_id);
    return {...base, ...forTrainees(ids), orders:ordersFor(ids), guardian_links:links.map(l=>({...l, guardian_phone:ph})), notifications:(D.notifications||[]).filter(x=>x.to==='guardian'&&ids.includes(x.trainee_id))}; }
  if(role==='teacher'){ const me=(D.teachers||[]).find(t=>t.active!==false&&normPhone(t.phone)===ph); if(!me) return null;
    const subs=(D.subscriptions||[]).filter(s=>s.section===me.section&&(s.subjects||[]).some(x=>(me.subjects||[]).includes(x))), ids=[...new Set(subs.map(s=>s.trainee_id))];
    return {...base, me:{...me, phone:undefined}, teachers:[{...me}], trainees:D.trainees.filter(t=>ids.includes(t.id)).map(tSafe), subscriptions:subs,
      sub_attendance:(D.sub_attendance||[]).filter(a=>subs.some(s=>s.id===a.subscription_id)), guardian_links:(D.guardian_links||[]).filter(l=>l.status==='verified'&&ids.includes(l.trainee_id)).map(l=>({id:l.id, trainee_id:l.trainee_id, status:l.status, relation:l.relation})),
      assignments:(D.assignments||[]).filter(a=>a.teacher_id===me.id), submissions:(D.submissions||[]).filter(x=>ids.includes(x.trainee_id)&&(D.assignments||[]).some(a=>a.id===x.assignment_id&&a.teacher_id===me.id)),
      notifications:(D.notifications||[]).filter(x=>x.sender==='teacher:'+me.id), notifications_in:(D.notifications||[]).filter(x=>x.to==='teacher'&&x.teacher_id===me.id),
      questions:teacherBank(D, me), groups:(D.trainer_groups||[]).filter(g=>g.teacher_id===me.id).map(g=>({id:g.id, name:g.name, trainee_ids:g.trainee_ids.filter(id=>ids.includes(id)), created_at:g.created_at})),
      attempts:(D.attempts||[]).filter(a=>ids.includes(a.trainee_id)&&a.submitted_at&&(a.kind==='sim'||(a.teacher_id ? a.teacher_id===me.id : a.section===me.section&&(me.subjects||[]).includes(a.subject)))),
      rating_summary:ratingSummary(D, me.id), messages:(D.messages||[]).filter(m=>m.teacher_id===me.id), lectures:(D.lectures||[]).filter(l=>l.teacher_id===me.id).sort((a,b)=>b.starts_at.localeCompare(a.starts_at)),
      // دفعات البرامج المسندة إليه: كشفها وحضورها (أسماء المتدربين فقط)
      ...(()=>{ const cs=(D.cohorts||[]).filter(c=>c.teacher_id===me.id&&!cohortArchived(c)), cids=cs.map(c=>c.id), en=(D.enrollments||[]).filter(e=>cids.includes(e.cohort_id)&&e.status!=='ملغى'), eids=en.map(e=>e.id), tids=en.map(e=>e.trainee_id);
        return { cohorts:cs, programs:(D.programs||[]).filter(p=>cs.some(c=>c.program_id===p.id)).map(p=>({id:p.id, code:p.code, name:p.name, hours:p.hours})), enrollments:en,
          attendance:(D.attendance||[]).filter(a=>eids.includes(a.enrollment_id)), cohort_trainees:D.trainees.filter(t=>tids.includes(t.id)).map(tSafe) }; })(),
      // مرآة الإنجاز: واجبات كل مقررات متدربيه (حقول التوقيت فقط) وحالات تسليمها، دون نصوص الإجابات
      ...(()=>{ const sc=subs.flatMap(s=>(s.subjects||[]).map(x=>s.section+':'+x)), hw=(D.assignments||[]).filter(a=>sc.includes(a.section+':'+a.subject));
        return { hw_assignments:hw.map(a=>({id:a.id, section:a.section, subject:a.subject, publish_date:a.publish_date, due_date:a.due_date, max_score:a.max_score, ...(Array.isArray(a.targets)?{targets:a.targets}:{})})),
          hw_submissions:(D.submissions||[]).filter(x=>ids.includes(x.trainee_id)&&hw.some(a=>a.id===x.assignment_id)).map(x=>({assignment_id:x.assignment_id, trainee_id:x.trainee_id, status:x.status, score:x.score})) }; })()}; }
  return null;
}
/* متدرب برنامج تدريبي (دفعة جارية) بجوال 0550000003 وولي أمره 0509000099 — لعرض بوابة متدربي البرامج */
export function demoProgramTrainee(D){
  { const S=D.subscriptions||[]; const subT=new Set(S.map(x=>x.trainee_id)), ok=new Set((D.cohorts||[]).filter(c=>cohortState(c)==='running').map(c=>c.id));
    const e=(D.enrollments||[]).filter(x=>x.status!=='ملغى'&&ok.has(x.cohort_id)&&!subT.has(x.trainee_id)).sort((a,b)=>(D.attendance||[]).filter(t=>t.enrollment_id===b.id).length-(D.attendance||[]).filter(t=>t.enrollment_id===a.id).length)[0];
    const t=e&&D.trainees.find(y=>y.id===e.trainee_id);
    if(t){ t.phone='0550000003'; D.guardian_links.push({id:uid(), guardian_phone:'0509000099', guardian_name:'ولي أمر تجريبي', trainee_id:t.id, relation:'الأب', status:'verified', verified_at:new Date().toISOString(), created_at:new Date().toISOString()}); } }
}
/* بيانات تجريبية: مدربو المقررات وأولياء أمور لعدد من المتدربين */
export function demoPeople(D){
  const T=[['girls','كمي','هدى محمد علي النعمي','0501000001'],['girls','لفظي','منى أحمد حسن الصميلي','0501000002'],['boys','كمي','خالد يحيى محمد الحكمي','0501000003'],['boys','لفظي','فيصل علي أحمد المدخلي','0501000004'],['girls','تحصيلي','أمل حسن علي معافا','0501000005'],['boys','تحصيلي','ماجد موسى علي عريشي','0501000006']];
  D.teachers=T.map(([section,subject,full_name,phone])=>({id:uid(), full_name, phone, section, subjects:[subject], active:true, created_at:new Date().toISOString()}));
  // حسابات تجريبية ثابتة: متدرب بنين (كمي) بجوال 0550000001 وولي أمره 0509000010، ومتدربة بجوال 0550000002
  const S=D.subscriptions||[], days=id=>new Set((D.sub_attendance||[]).filter(a=>a.trainee_id===id).map(a=>a.att_date)).size;
  const pickSub=sec=>S.filter(x=>x.section===sec&&x.start_date&&x.status!=='cancelled').sort((a,b)=>days(b.trainee_id)-days(a.trainee_id)).find(x=>sec==='girls'||x.subjects.includes('كمي'));
  [['boys','0550000001'],['girls','0550000002']].forEach(([sec,ph])=>{ const x=pickSub(sec); if(!x) return; const t=D.trainees.find(y=>y.id===x.trainee_id); if(t) t.phone=ph; S.splice(S.indexOf(x),1); S.unshift(x); });
  if(S[1]?.section==='boys') S.unshift(S.splice(1,1)[0]);
  demoProgramTrainee(D);
  (D.subscriptions||[]).slice(0,12).forEach((s,i)=>{ const t=D.trainees.find(x=>x.id===s.trainee_id); if(!t) return;
    D.guardian_links.push({id:uid(), guardian_name:'ولي أمر '+t.full_name.split(' ').slice(1,2).join(''), guardian_phone:'05090000'+String(10+i).padStart(2,'0'), trainee_id:t.id, relation:i%3?'الأب':'الأم', status:'verified', created_at:new Date().toISOString()}); });
}

/* سجل محاولات التحضير: يُخزَّن رقم السجل مجزّأً (hash) لا الرقم نفسه */
export function attemptRecord(nid, device, r){
  return { id:uid(), at:new Date().toISOString(), date:riyadhNow().date, nid_hash:String(hash32('sama:'+nid)), device:device||'', result: r.ok ? (r.already?'already':'ok') : r.reason, kind:r.kind||'cohort', trainee_hint:r.ok?(r._trainee||null):null };
}

/* إقرار قبول السياسات السارية عند التسجيل (الإصدار نفسه، مع السياق) */
function acceptPolicies(D, f, trainee_id, context){
  const ids = checkAcceptance(D.policies, riyadhNow().date, f.accepted_policies);
  D.policy_acceptances = D.policy_acceptances || [];
  ids.forEach(pid => { if(!D.policy_acceptances.some(a => a.policy_id===pid && a.trainee_id===trainee_id && a.context===context))
    D.policy_acceptances.push({id:uid(), policy_id:pid, trainee_id, context, accepted_at:new Date().toISOString()}); });
}
/* حماية الهوية (الخطوة A) — مطابق لـ trainees_register_guard في SQL:
   إعادة التسجيل بسجل مدني موجود لا تغيّر البيانات المعتمدة؛ تُكمَّل الحقول الفارغة فقط، وأي اختلاف يصبح طلب تحديث تراجعه الإدارة */
export const PROFILE_FIELDS = { full_name:'الاسم', phone:'الجوال', email:'البريد', gender:'الجنس', birth_date:'تاريخ الميلاد', city:'المدينة', education:'المؤهل', employer:'جهة العمل', guardian_phone:'جوال ولي الأمر' };
export function mergeOnRegister(D, t, person, source='registration'){
  const ch={}, norm=v=>String(v??'').trim();
  for(const f of Object.keys(PROFILE_FIELDS)){
    const o=norm(t[f]), n=norm(person[f]);
    if(f==='guardian_phone'){ if(n && n!==o) ch[f]={old:o, new:n}; continue; }   // لا يُكمَّل تلقائيًا: يفتح بوابة ولي الأمر
    if(!o){ if(n) t[f]=person[f]; continue; }
    if(n && n!==o) ch[f]={old:o, new:n};
  }
  if(!Object.keys(ch).length) return null;
  D.profile_change_requests = D.profile_change_requests || [];
  const same=D.profile_change_requests.find(r=>r.trainee_id===t.id && r.status==='pending' && JSON.stringify(r.changes)===JSON.stringify(ch));
  if(same) return same;
  const r={id:uid(), trainee_id:t.id, changes:ch, source, status:'pending', created_at:new Date().toISOString()};
  D.profile_change_requests.push(r); return r;
}
export const LocalStore = {
  key:'sama_qudrat_v4', mode:'local', data:null, admin:false,
  load(){
    try{ this.data = JSON.parse(localStorage.getItem(this.key)||'null'); }catch(e){ this.data=null; }
    if(!this.data){ this.data = makeDemo(); }
    this.data.certificates = this.data.certificates || []; if(this.data.settings.cert_threshold==null) this.data.settings.cert_threshold=75;
    if(!this.data.partners || (this.data.partners.length<=2 && this.data.partners.every(x=>x.type==='جهة اعتماد'))) this.data.partners = defaultPartners(); if(this.data.settings.about==null) this.data.settings.about = DEFAULT_ABOUT;
    const D=this.data; if(!D.plans){ D.plans=defaultPlans(); D.schedule_templates=defaultTemplates(); D.schedule_exceptions=[]; D.subscriptions=[]; D.sub_attendance=[]; }
    D.orders=D.orders||[]; D.invoices=D.invoices||[]; (D.trainees||[]).forEach(t=>{ if(t.imported && !t.import_notes) t.import_notes=[]; }); if(!D.settings.bank) D.settings.bank={...BANK_DEFAULT}; if(D.settings.require_order_approval==null) D.settings.require_order_approval=false;
    if(!D.plans.some(p=>p.tier==='custom')) D.plans.push(...customPlans());       // باقة «خصصناها لك» للبيانات المحفوظة قبل إضافتها
    D.checkin_attempts = D.checkin_attempts || []; D.audit_logs = D.audit_logs || []; D.custom_requests = D.custom_requests || []; D.program_requests = D.program_requests || [];
    if(!D.teachers){ D.teachers=[]; D.guardian_links=[]; D.notifications=[]; demoPeople(D); } D.assignments=D.assignments||[]; D.submissions=D.submissions||[]; D.daily_reports=D.daily_reports||[]; if(!D.questions) demoLearning(D); backfillCategories(D); if(!D.policies || (D.policies.length && D.policies.every(x=>x.status==='draft'))){ D.policies=demoPolicies(); D.policy_acceptances=D.policy_acceptances||[]; } (D.policies||[]).forEach(x=>{ if(String(x.id).startsWith('pol-')) x.requires_acceptance=false; }); if(!D.trainees.some(t=>t.phone==='0550000003')) demoProgramTrainee(D);
    this.autoArchive(); this.save();
    try{ this.admin = sessionStorage.getItem(this.key+'_adm')==='1'; }catch(e){}
  },
  autoArchive(){ const today=riyadhNow().date; this.data.cohorts.forEach(c=>{ if(!c.archived_at && c.end_date<today){ c.archived_at=addDays(c.end_date,1)+'T00:00:00Z'; c.archived_auto=true; c.reg_open=false; issueCertificatesLocal(this.data,c); } }); },
  save(){ try{ localStorage.setItem(this.key, JSON.stringify(this.data)); }catch(e){} },
  _pub(p){ const D=this.data, c=activeCohortOf(D,p.id); return {...p, code:progCode(p), cohort: c?{...c, taken:takenOf(D,c.id)}:null}; },
  async catalog(){ const D=this.data; return { programs:D.programs.filter(p=>p.active).map(p=>this._pub(p)), packages:D.packages.filter(k=>k.active) }; },
  async publicProgram(code){ const p=this.data.programs.find(x=>progCode(x)===code); return p ? this._pub(p) : null; },
  /* حالة العرض في الرئيسية (البند 14) ↔ admin_set_publish */
  async setPublish(id, state, expected){ const D=this.data, p=D.programs.find(x=>x.id===id); if(!p) throw new Error('البرنامج غير موجود'); const v=state||null;
    if(v && !PUB_STATES[v]) throw new Error('حالة غير صالحة'); if(v==='open_for_registration' && !openCohortOf(D, id, riyadhNow().date)) throw new Error('افتح دفعة للبرنامج وفعّل استقبال التسجيل أولًا');
    const before={publish_state:p.publish_state||null, expected_start:p.expected_start||null}; p.publish_state=v; p.expected_start=expected||null; this.audit('programs.update', id, {before, after:{publish_state:v, expected_start:p.expected_start}}); this.save(); return {ok:true}; },
  async publicSettings(){ const s=this.data.settings; return {require_code:s.require_code, late_minutes:s.late_minutes, early_minutes:s.early_minutes, checkin_url:s.checkin_url}; },
  async register(f){
    const D=this.data, today=riyadhNow().date;
    if(!validSaudiId(f.national_id)) throw new Error('رقم السجل المدني غير صحيح');
    const pids = f.package_id ? (D.packages.find(k=>k.id===f.package_id)?.program_ids||[]) : [f.program_id];
    if(!f.package_id && ['draft','closed','archived'].includes(D.programs.find(x=>x.id===f.program_id)?.publish_state)) throw new Error('التسجيل في هذا البرنامج غير متاح حاليًا');   // ↔ register_trainee (…_publish_state.sql)
    if(!f.package_id && !openCohortOf(D, f.program_id, today)) return this._programRequest(f);   // لا دفعة مفتوحة: تسجيل مبدئي (↔ register_program_request)
    const targets = pids.map(pid=>({p:D.programs.find(x=>x.id===pid), c:activeCohortOf(D,pid,today)}));
    for(const {p,c} of targets){
      if(!p) throw new Error('البرنامج غير موجود');
      if(!c || !c.reg_open) throw new Error(`التسجيل غير مفتوح حاليًا في «${p.name}»`);
      if(takenOf(D,c.id)>=c.seats) throw new Error(`اكتملت مقاعد الدفعة ${c.number} من «${p.name}»`);
    }
    checkAcceptance(D.policies, today, f.accepted_policies);
    let t = D.trainees.find(x=>x.national_id===f.national_id);
    for(const {p,c} of targets){ if(t && D.enrollments.some(e=>e.cohort_id===c.id && e.trainee_id===t.id && e.status!=='ملغى')) throw new Error(`هذا السجل المدني مسجّل مسبقًا في الدفعة ${c.number} من «${p.name}»`); }
    const person = {national_id:f.national_id, full_name:f.full_name, phone:f.phone, email:f.email||'', gender:f.gender, birth_date:f.birth_date||'', city:f.city, education:f.education, employer:f.employer||'', guardian_phone:checkBirthGuardian(f, riyadhNow().date, targets.some(({p})=>isKidsProgram(p)))};
    if(t) mergeOnRegister(D, t, person); else { t={id:uid(), ...person, created_at:new Date().toISOString()}; D.trainees.push(t); }
    acceptPolicies(D, f, t.id, 'registration');
    const ref = newRef();
    targets.forEach(({c})=>D.enrollments.push({id:uid(), ref, cohort_id:c.id, program_id:c.program_id, trainee_id:t.id, package_id:f.package_id||null, status:'مسجل', created_at:new Date().toISOString()}));
    const total=targets.reduce((a,{p})=>a+(Number(p.price)||0),0);
    const order=this._newOrder({trainee_id:t.id, kind:'program', enrollment_ids:D.enrollments.filter(e=>e.ref===ref).map(e=>e.id), title:targets.map(({p})=>p.name).join('، '), total, due_now:total});
    this.save();
    return {ok:true, ref, order, cohorts:targets.map(({p,c})=>({program:p.name, number:c.number, start:c.start_date}))};
  },
  _programRequest(f){
    const D=this.data, today=riyadhNow().date, p=D.programs.find(x=>x.id===f.program_id && x.active!==false);
    if(!p) throw new Error('البرنامج غير متاح');
    if(!/^05\d{8}$/.test(f.phone||'')) throw new Error('رقم الجوال غير صحيح');
    checkAcceptance(D.policies, today, f.accepted_policies);
    let t = D.trainees.find(x=>x.national_id===f.national_id);
    if(t && D.program_requests.some(r=>r.program_id===p.id && r.trainee_id===t.id && r.status==='pending')) throw new Error(`سبق تسجيلك المبدئي في «${p.name}»؛ يتواصل معك المركز عند فتح الدفعة`);
    const person = {national_id:f.national_id, full_name:f.full_name, phone:f.phone, email:f.email||'', gender:f.gender, birth_date:f.birth_date||'', city:f.city, education:f.education, employer:f.employer||'', guardian_phone:checkBirthGuardian(f, today, isKidsProgram(p))};
    if(t) mergeOnRegister(D, t, person); else { t={id:uid(), ...person, created_at:new Date().toISOString()}; D.trainees.push(t); }
    acceptPolicies(D, f, t.id, 'registration');
    const ref = 'SR-'+String(Math.floor(Math.random()*900000)+100000);
    D.program_requests.push({id:uid(), ref, program_id:p.id, trainee_id:t.id, status:'pending', cohort_id:null, enrollment_id:null, note:'', created_at:new Date().toISOString()});
    this.save(); return {ok:true, ref, request:true, program:p.name, cohorts:[]};
  },
  async placeRequests(ids){
    const D=this.data, today=riyadhNow().date; let placed=0, skipped=0;
    for(const r of D.program_requests.filter(x=>ids.includes(x.id) && x.status==='pending').sort((a,b)=>a.created_at.localeCompare(b.created_at))){
      const p=D.programs.find(x=>x.id===r.program_id), c=openCohortOf(D, r.program_id, today);
      if(!c){ if(!placed && !skipped) throw new Error(`لا توجد دفعة مفتوحة للتسجيل في «${p?.name||''}»؛ افتح دفعة أولًا`); skipped++; continue; }
      let e=D.enrollments.find(x=>x.cohort_id===c.id && x.trainee_id===r.trainee_id);
      if(e) e.status='مسجل'; else { e={id:uid(), ref:'SQ-'+String(Math.floor(Math.random()*900000)+100000), cohort_id:c.id, program_id:r.program_id, trainee_id:r.trainee_id, package_id:null, status:'مسجل', created_at:new Date().toISOString()}; D.enrollments.push(e); }
      if(!(D.orders||[]).some(o=>(o.enrollment_ids||[]).includes(e.id))) this._newOrder({trainee_id:r.trainee_id, kind:'program', enrollment_ids:[e.id], title:p.name, total:Number(p.price)||0, due_now:Number(p.price)||0});
      Object.assign(r, {status:'placed', cohort_id:c.id, enrollment_id:e.id, decided_at:new Date().toISOString()}); this.audit('program_requests.update', r.id, {after:{status:'placed'}}); placed++;
    }
    this.save(); return {ok:true, placed, skipped};
  },
  async cancelRequest(id, reason){
    if(String(reason||'').trim().length<3) throw new Error('اكتب سبب الإلغاء');
    const r=this.data.program_requests.find(x=>x.id===id && x.status==='pending'); if(!r) throw new Error('الطلب غير موجود أو سبق البت فيه');
    Object.assign(r, {status:'cancelled', note:String(reason).trim().slice(0,300), decided_at:new Date().toISOString()}); this.audit('program_requests.update', id, {after:{status:'cancelled'}}); this.save(); return {ok:true};
  },
  dayCode(date){ return String(hash32(this.data.settings.daily_secret + date) % 10000).padStart(4,'0'); },
  async todayCode(){ return this.dayCode(riyadhNow().date); },
  async checkin(nid, code, programCode, opts={}){
    this.autoArchive(); const D=this.data;
    let r = unifiedCheckin(D, nid, code, programCode, this.dayCode(riyadhNow().date), opts.choice);
    if(r._rec && attendanceBlocked(D, r._sub ? {subscription_id:r._sub} : {enrollment_id:r._rec.enrollment_id})) r = {ok:false, reason:'order_pending'};   // خيار الإدارة: لا حضور قبل اعتماد الطلب وتأكيد السداد
    if(r._rec){
      if(r._sub){ D.sub_attendance.push(r._rec); const s=D.subscriptions.find(x=>x.id===r._sub); if(r._start && s && !s.start_date){ Object.assign(s, r._start, {status:'active'}); } r._trainee=r._rec.trainee_id; }
      else { D.attendance.push(r._rec); r._trainee=r._rec.trainee_id; }
    } else if(r.ok && r.already){ r._trainee = D.trainees.find(x=>x.national_id===nid)?.id; }
    if(r.reason!=='choose'){ D.checkin_attempts.push(attemptRecord(nid, opts.device, r)); if(D.checkin_attempts.length>5000) D.checkin_attempts.splice(0, D.checkin_attempts.length-5000); }
    this.save(); delete r._rec; delete r._sub; delete r._start; delete r._trainee;
    return r;
  },
  async isAdmin(){ return this.admin; },
  async login(user, pass){ if(pass===this.data.settings.admin_pin){ this.admin=true; try{sessionStorage.setItem(this.key+'_adm','1');}catch(e){} return true; } throw new Error('رمز الدخول غير صحيح'); },
  async logout(){ this.admin=false; try{sessionStorage.removeItem(this.key+'_adm');}catch(e){} },
  async logoutAll(){ return this.logout(); },
  async changePassword(){ throw new Error('تغيير كلمة المرور يعمل مع قاعدة البيانات؛ في التجربة غيّر رمز الدخول من الإعدادات'); },
  async requestPasswordReset(){ return {ok:true}; },
  async resetAdminPassword(id){ const me=await this.adminMe(); await this.listAdmins(); const a=this.data.admins.find(x=>x.id===id&&!x.pending);
    if(me?.role!=='owner') throw new Error('إعادة تعيين كلمات المرور للمالك الأساسي وحده'); if(!a) throw new Error('الحساب غير موجود');
    if(a.id===me.id) throw new Error('غيّر كلمة مرورك من «تغيير كلمة المرور»'); if(a.role==='owner') throw new Error('لا تُعاد كلمة مرور المالك الأساسي'); if(a.active===false) throw new Error('فعّل الحساب أولًا');
    this.audit('admins.password_reset', a.email); this.save(); return {ok:true, mode:'password', temp_password:'demo'+String(Math.floor(Math.random()*9e5)+1e5), email:a.email}; },
  async adminData(){ this.autoArchive(); this.autoReport(); this.save(); return JSON.parse(JSON.stringify(this.data)); },
  /* تقرير اليوم: محليًا يُولَّد عند أول فتح للإدارة بعد 20:30 (لا خادم مجدول في الوضع التجريبي). سحابيًا: pg_cron */
  autoReport(){ const n=riyadhNow(), D=this.data; D.daily_reports=D.daily_reports||[]; if(isPastReportTime(n) && !D.daily_reports.some(r=>r.date===n.date)){ const r=makeReport(D, n.date, 'snapshot', '', n); if(!r.existing){ r.report.auto=true; D.daily_reports.push(r.report); } } },
  async generateReport(date, kind='snapshot', note=''){ const D=this.data; D.daily_reports=D.daily_reports||[]; const r=makeReport(D, date, kind, note); if(!r.existing){ D.daily_reports.push(r.report); this.audit('daily_report.'+r.report.kind, date); this.save(); } return r; },
  async setReportNote(id, note){ const r=(this.data.daily_reports||[]).find(x=>x.id===id); if(r){ r.note=String(note||'').slice(0,1000); this.audit('daily_report.note', id); this.save(); } },
  async saveProgram(p){ const a=this.data.programs, i=a.findIndex(x=>x.id===p.id); if(i>=0) a[i]={...a[i],...p}; else { const n={...p,id:uid(),created_at:new Date().toISOString()}; n.code=p.code||progCode(n); a.push(n); } this.save(); },
  async deleteProgram(id){ const D=this.data; if(D.enrollments.some(e=>e.program_id===id)) throw new Error('لا يمكن حذف برنامج له متدربون مسجّلون. أوقفه (غير نشط) بدل حذفه.'); const cids=D.cohorts.filter(c=>c.program_id===id).map(c=>c.id);
    D.programs=D.programs.filter(x=>x.id!==id); D.cohorts=D.cohorts.filter(c=>c.program_id!==id); D.enrollments=D.enrollments.filter(e=>!cids.includes(e.cohort_id)); D.attendance=D.attendance.filter(a=>!cids.includes(a.cohort_id));
    D.packages.forEach(k=>k.program_ids=k.program_ids.filter(x=>x!==id)); this.save(); },
  async savePackage(p){ const a=this.data.packages, i=a.findIndex(x=>x.id===p.id); if(i>=0) a[i]=p; else a.push({...p,id:uid(),created_at:new Date().toISOString()}); this.save(); },
  async deletePackage(id){ this.data.packages=this.data.packages.filter(x=>x.id!==id); this.save(); },
  async saveCohort(c){ const D=this.data, a=D.cohorts, i=a.findIndex(x=>x.id===c.id);
    if(i>=0){ a[i]={...a[i],...c}; }
    else { if(activeCohortOf(D,c.program_id)) throw new Error('للبرنامج دفعة نشطة. أرشفها أولًا لفتح دفعة جديدة.');
      const num = Math.max(0,...a.filter(x=>x.program_id===c.program_id).map(x=>x.number))+1;
      a.push({...c, id:uid(), number:num, archived_at:null, created_at:new Date().toISOString()}); }
    this.save(); },
  async archiveCohort(id){ const c=this.data.cohorts.find(x=>x.id===id); if(c){ c.archived_at=new Date().toISOString(); c.archived_auto=false; c.reg_open=false; issueCertificatesLocal(this.data,c); this.save(); } },
  async issueCertificates(cid){ const c=this.data.cohorts.find(x=>x.id===cid); const n=c?issueCertificatesLocal(this.data,c):0; this.save(); return n; },
  async revokeCertificate(id, on=true){ const x=(this.data.certificates||[]).find(y=>y.id===id); if(x){ x.revoked=on; this.save(); } },
  async verifyCertificate(serial){ const D=this.data; return certPublic(D,(D.certificates||[]).find(x=>x.serial.toUpperCase()===String(serial).trim().toUpperCase())); },
  async myAttendance(nid){ this.autoArchive(); return myAttendanceLogic(this.data, nid); },
  async deleteCohort(id){ const D=this.data; if(D.attendance.some(a=>a.cohort_id===id)) throw new Error('لا يمكن حذف دفعة لها سجلات حضور. أرشفها بدل حذفها.'); D.cohorts=D.cohorts.filter(c=>c.id!==id); D.enrollments=D.enrollments.filter(e=>e.cohort_id!==id); D.attendance=D.attendance.filter(a=>a.cohort_id!==id); this.save(); },
  async setEnrollmentStatus(id, status){ const e=this.data.enrollments.find(x=>x.id===id); if(e){ e.status=status; this.save(); } },
  async deleteEnrollment(id){ const D=this.data; if(D.attendance.some(a=>a.enrollment_id===id)||(D.certificates||[]).some(c=>c.enrollment_id===id)) throw new Error('لا يمكن حذف تسجيل له حضور أو شهادة. غيّر حالته إلى «ملغى».'); D.enrollments=D.enrollments.filter(x=>x.id!==id); D.attendance=D.attendance.filter(a=>a.enrollment_id!==id); this.save(); },
  async setAttendance(enrollment_id, date, status){ const D=this.data, e=D.enrollments.find(x=>x.id===enrollment_id); if(!e) return;
    const i=D.attendance.findIndex(a=>a.enrollment_id===enrollment_id && a.att_date===date);
    if(status===null){ if(i>=0) D.attendance.splice(i,1); }
    else if(i>=0) D.attendance[i].status=status;
    else { const c=D.cohorts.find(x=>x.id===e.cohort_id); D.attendance.push({id:uid(), enrollment_id, cohort_id:e.cohort_id, program_id:e.program_id, trainee_id:e.trainee_id, att_date:date, time:(c?.start_time||'00:00')+':00', checkin_at:new Date().toISOString(), status, manual:true}); }
    this.save(); },
  async deleteTrainee(id){ const D=this.data; if(D.attendance.some(a=>a.trainee_id===id)||(D.certificates||[]).some(c=>c.trainee_id===id)||(D.sub_attendance||[]).some(a=>a.trainee_id===id)) throw new Error('لا يمكن حذف متدرب له سجلات حضور أو شهادات. ألغِ تسجيله بدل حذفه.'); D.subscriptions=(D.subscriptions||[]).filter(s=>s.trainee_id!==id); D.trainees=D.trainees.filter(x=>x.id!==id); D.enrollments=D.enrollments.filter(e=>e.trainee_id!==id); D.attendance=D.attendance.filter(a=>a.trainee_id!==id); this.save(); },
  async saveSettings(s){ Object.assign(this.data.settings, s); this.save(); },
  async publicSite(){ const D=this.data; return { about:D.settings.about||DEFAULT_ABOUT, partners:(D.partners||[]).filter(p=>p.active!==false) }; },
  async savePartner(p){ const L=this.data.partners=this.data.partners||[]; if(p.id){ const i=L.findIndex(x=>x.id===p.id); if(i>=0) L[i]={...L[i],...p}; else L.push(p); } else L.push({...p,id:uid()}); this.save(); },
  async deletePartner(id){ this.data.partners=(this.data.partners||[]).filter(p=>p.id!==id); this.save(); },
  /* ---- باقات القدرات والتحصيلي ---- */
  async publicPlans(){ const D=this.data; return { plans:(D.plans||[]).filter(p=>p.active!==false).sort((a,b)=>a.sort-b.sort), schedule:D.schedule_templates||[] }; },
  async registerSubscription(f){
    const D=this.data; if(!validSaudiId(f.national_id)) throw new Error('رقم السجل المدني غير صحيح');
    const plan=D.plans.find(p=>p.id===f.plan_id); if(!planOpen(plan)) throw new Error('التسجيل في هذه الباقة غير متاح حاليًا'); checkAcceptance(D.policies, riyadhNow().date, f.accepted_policies);
    let t=D.trainees.find(x=>x.national_id===f.national_id);
    if(t && D.subscriptions.some(s=>s.trainee_id===t.id && s.plan_id===plan.id && ['pending','active'].includes(subStatus(s)))) throw new Error(`هذا السجل المدني مشترك مسبقًا في ${planName(plan)}`);
    const person={national_id:f.national_id, full_name:f.full_name, phone:f.phone, email:f.email||'', gender:f.gender, birth_date:f.birth_date||'', city:f.city, education:f.education, employer:f.employer||'', guardian_phone:checkBirthGuardian(f, riyadhNow().date, false)};
    if(t) mergeOnRegister(D, t, person); else { t={id:uid(), ...person, created_at:new Date().toISOString()}; D.trainees.push(t); }
    acceptPolicies(D, f, t.id, 'subscription');
    const s={id:uid(), ref:newRef(), trainee_id:t.id, plan_id:plan.id, section:sectionOfGender(t.gender), subjects:[...(plan.subjects||[])], status:'pending', start_date:null, end_date:null, created_at:new Date().toISOString()};
    D.subscriptions.push(s);
    const order=this._newOrder({trainee_id:t.id, kind:'plan', subscription_id:s.id, title:'باقة '+planName(plan), total:planTotal(plan), due_now:+plan.reg_fee||0}); this.save();
    return {ok:true, subscription:true, ref:s.ref, order, plan:planName(plan), section:SECTIONS[s.section], schedule:sectionDaysTxt(D,s.section)};
  },
  async savePlan(p){ const a=this.data.plans, i=a.findIndex(x=>x.id===p.id); if(i>=0) a[i]={...a[i],...p}; else a.push({...p, id:uid(), sort:p.sort??a.length}); this.audit('plan.save', p.id||'new'); this.save(); },
  async saveTemplates(section, rows){ const D=this.data; D.schedule_templates=[...D.schedule_templates.filter(x=>x.section!==section), ...rows.map(r=>({id:uid(), section, ...r}))]; this.audit('schedule.save', section); this.save(); },
  async saveException(x){ const a=this.data.schedule_exceptions; const i=a.findIndex(y=>y.id===x.id); if(i>=0) a[i]={...a[i],...x}; else a.push({...x, id:uid(), created_at:new Date().toISOString()}); this.audit('exception.save', x.date); this.save(); },
  async deleteException(id){ this.data.schedule_exceptions=this.data.schedule_exceptions.filter(x=>x.id!==id); this.audit('exception.delete', id); this.save(); },
  /* إضافة/تعديل اشتراك من الإدارة، ومنها المتدربون الحاليون بتاريخ بداية فعلي (D-10) */
  async saveSubscription(f){
    const D=this.data, plan=D.plans.find(p=>p.id===f.plan_id); if(!plan) throw new Error('اختر الباقة');
    let t = f.trainee_id ? D.trainees.find(x=>x.id===f.trainee_id) : D.trainees.find(x=>x.national_id===f.national_id);
    if(!t){ if(!validSaudiId(f.national_id||'')) throw new Error('رقم السجل المدني غير صحيح'); if(!f.full_name) throw new Error('اكتب اسم المتدرب');
      t={id:uid(), national_id:f.national_id, full_name:f.full_name, phone:f.phone||'', email:'', gender:f.gender||'ذكر', birth_date:'', city:f.city||'جازان', education:'ثانوي', employer:'', created_at:new Date().toISOString()}; D.trainees.push(t); }
    else if(!f.id){ if(f.full_name) t.full_name=f.full_name; if(f.phone) t.phone=f.phone; if(f.gender) t.gender=f.gender; }
    const start=f.start_date||null, endX=f.end_date||null;
    /* نهاية مخصّصة لاشتراك قائم (قرار المالك) ↔ admin_save_subscription في …_sub_end_edit.sql */
    if(endX){ if(!f.id) throw new Error('تاريخ النهاية يُعدَّل لاشتراك قائم فقط'); if(!start) throw new Error('حدّد تاريخ البداية قبل النهاية'); if(endX<start) throw new Error('تاريخ النهاية قبل تاريخ البداية'); if(endX>addDays(start,400)) throw new Error('تاريخ النهاية بعيد جدًا عن البداية'); }
    if(f.id){ const s=D.subscriptions.find(x=>x.id===f.id); if(!s) throw new Error('الاشتراك غير موجود'); const before={start_date:s.start_date, end_date:s.end_date};
      Object.assign(s, {plan_id:plan.id, section:f.section||s.section, subjects:f.subjects||s.subjects, start_date:start, end_date:start?(endX||subEnd(plan,start)):null, status:start?'active':'pending', start_manual:!!start});
      if(f.prior_absences!=null && f.prior_absences!==''){ const pa=Number(f.prior_absences), mx=priorSessions(D,s).length; if(!Number.isInteger(pa)||pa<0||pa>mx) throw new Error(`أيام الغياب السابقة من 0 إلى ${mx}`); s.prior_absences=pa; }
      this.audit('subscription.update', s.id, {before, after:{start_date:s.start_date, end_date:s.end_date}}); this.save(); return s; }
    if(D.subscriptions.some(s=>s.trainee_id===t.id && s.plan_id===plan.id && ['pending','active'].includes(subStatus(s)))) throw new Error(`${t.full_name} مشترك مسبقًا في ${planName(plan)}`);
    const s={id:uid(), ref:newRef(), trainee_id:t.id, plan_id:plan.id, section:f.section||sectionOfGender(t.gender), subjects:f.subjects||[...(plan.subjects||[])], status:start?'active':'pending', start_date:start, end_date:start?subEnd(plan,start):null, start_manual:!!start, created_at:new Date().toISOString()};
    D.subscriptions.push(s); this.audit('subscription.create', s.id);
    /* المشترك الذي تضيفه الإدارة يُنشأ له طلب موافق عليه، فيُستلم مبلغه مباشرة («استلام المبلغ») ↔ admin_save_subscription */
    let oid=null; if(!(D.orders||[]).some(o=>o.subscription_id===s.id)){ const op=this._newOrder({trainee_id:t.id, kind:'plan', subscription_id:s.id, title:'باقة '+planName(plan), total:planTotal(plan), due_now:+plan.reg_fee||0}), o=D.orders.find(x=>x.id===op.id);
      o.approval='approved'; this._orderEvent(o,'approved','admin','إضافة من الإدارة'); oid=o.id; }
    this.save(); return {...s, order_id:oid};
  },
  async cancelSubscription(id, on=true){ const s=this.data.subscriptions.find(x=>x.id===id); if(s){ s.status = on ? 'cancelled' : (s.start_date?'active':'pending'); this.audit(on?'subscription.cancel':'subscription.restore', id); this.save(); } },
  async setSubAttendance(subscription_id, date, status){ const D=this.data, s=D.subscriptions.find(x=>x.id===subscription_id); if(!s) return;
    const i=D.sub_attendance.findIndex(a=>a.subscription_id===subscription_id && a.att_date===date);
    const before = i>=0 ? D.sub_attendance[i].status : null;
    if(status===null){ if(i>=0) D.sub_attendance.splice(i,1); }
    else if(i>=0) D.sub_attendance[i].status=status;
    else { const ses=sessionOn(D,s.section,date); D.sub_attendance.push({id:uid(), subscription_id, trainee_id:s.trainee_id, att_date:date, time:(ses?.start||'00:00')+':00', status, manual:true, checkin_at:new Date().toISOString()});
      if(!s.start_date){ const plan=D.plans.find(p=>p.id===s.plan_id); Object.assign(s,{start_date:date, end_date:subEnd(plan,date), status:'active'}); } }
    this.audit('attendance.manual', subscription_id, {date, before, after:status}); this.save(); },
  async requestCustomPlan(f){ (this.data.custom_requests=this.data.custom_requests||[]).push({id:uid(), name:String(f.name||'').trim().slice(0,80), phone:String(f.phone||''), program:f.program, section:f.section, mode:f.mode, notes:String(f.notes||'').slice(0,600), status:'new', created_at:new Date().toISOString()}); this.save(); return {ok:true}; },
  async setCustomRequestStatus(id, status){ const r=(this.data.custom_requests||[]).find(x=>x.id===id); if(r){ r.status=status; this.audit('custom_request.status', id, {status}); this.save(); } },
  /* مركز السياسات: المنشور لا يُعدَّل، والتعديل يكون بمسودة إصدار جديد */
  async publicPolicies(){ return (this.data.policies||[]).filter(p=>p.status==='published').map(p=>({...p})); },
  async savePolicy(p){ const L=this.data.policies; validatePolicy(p, false);
    const row={slug:p.slug, title:p.title.trim(), body:String(p.body).trim().slice(0,30000), effective_date:p.effective_date, approved_by:String(p.approved_by||'').trim().slice(0,120), requires_acceptance:!!p.requires_acceptance};
    if(p.id){ const x=L.find(y=>y.id===p.id); if(!x) throw new Error('السياسة غير موجودة'); if(x.status!=='draft') throw new Error('النسخة المنشورة لا تُعدَّل؛ أنشئ إصدارًا جديدًا'); Object.assign(x,row); this.audit('policy.save', x.id); this.save(); return {ok:true, id:x.id}; }
    if(L.some(y=>y.slug===p.slug&&y.status==='draft')) throw new Error('توجد مسودة لهذه السياسة؛ عدّلها بدل إنشاء أخرى');
    const n={id:uid(), ...row, version:0, status:'draft', created_at:new Date().toISOString()}; L.push(n); this.audit('policy.save', n.id); this.save(); return {ok:true, id:n.id}; },
  async publishPolicy(id){ const L=this.data.policies, x=L.find(y=>y.id===id); if(!x||x.status!=='draft') throw new Error('تُنشر المسودات فقط'); validatePolicy(x, true);
    Object.assign(x,{version:nextVersion(L,x.slug), status:'published', published_at:new Date().toISOString()}); this.audit('policy.publish', id, {version:x.version}); this.save(); return {ok:true, version:x.version}; },
  async deletePolicyDraft(id){ const L=this.data.policies, i=L.findIndex(y=>y.id===id&&y.status==='draft'); if(i<0) throw new Error('تُحذف المسودات فقط'); L.splice(i,1); this.save(); return {ok:true}; },
  async resolveProfileChange(id, approve){ const D=this.data, r=(D.profile_change_requests||[]).find(x=>x.id===id);
    if(!r||r.status!=='pending') throw new Error('الطلب غير موجود أو سبق البت فيه');
    if(approve){ const t=D.trainees.find(x=>x.id===r.trainee_id); for(const f in r.changes) t[f]=r.changes[f].new; }
    Object.assign(r,{status:approve?'approved':'rejected', decided_at:new Date().toISOString()}); this.audit('profile.'+(approve?'approve':'reject'), id); this.save(); return {ok:true}; },
  /* ---- البوابات: دخول بالجوال ورمز تحقق (تجريبيًا الرمز 1234) ---- */
  _deviceId(){ try{ let d=localStorage.getItem(this.key+'_devid'); if(!d){ d=uid(); localStorage.setItem(this.key+'_devid', d); } return d; }catch(e){ return 'nodevice'; } },
  /* طلب الدخول برقم الهوية (↔ request_login): إن فتح المسؤول «تفعيل» لهذا الحساب صدر رمز لهذا الجهاز وعاد إليه وحده؛
     وإلا يُسجَّل طلب تراه الإدارة بالاسم فقط. الرد واحد سواء وُجد الحساب أم لا */
  async requestOtp(ident, role){ const D=this.data, ph=resolveIdent(D, ident, role), dev=this._deviceId(), now=Date.now();
    if(!ph || !role || !rolesOfPhone(D, ph).includes(role)) return {demo:true, activation:true, open:false};
    D.login_requests=D.login_requests||[];
    if(D.login_requests.filter(r=>r.phone===ph && now-Date.parse(r.created_at)<3600e3).length>=REQ_MAX_HOUR) return {demo:true, activation:true, open:false};
    D.login_requests.forEach(r=>{ if(r.phone===ph && r.role===role && r.device===dev && !r.used_at) r.used_at='replaced'; });
    const tr=role==='teacher'?null:(D.trainees||[]).find(t=>role==='guardian'?t.guardian_phone===ph:t.phone===ph), name=role==='teacher'?(D.teachers.find(t=>t.phone===ph)?.full_name||''):(role==='guardian'?'ولي أمر ':'')+(tr?.full_name||'');
    const w=(D.act_windows||[]).filter(x=>x.phone===ph && x.role===role && windowLive(x, now)).sort((a,b)=>b.created_at.localeCompare(a.created_at))[0];
    const r={id:uid(), phone:ph, role, device:dev, name, window_id:w?.id||null, created_at:new Date(now).toISOString(), used_at:null,
      expires_at:new Date(w ? Math.min(Date.parse(w.expires_at), now+REQ_TTL_MIN*60000) : now+30*60000).toISOString()};
    const code=w ? newActCode() : null; if(code) r.code_hash=await sha256('sama-act:'+ph+':'+code);
    D.login_requests.push(r); this.save();
    return code ? {demo:true, activation:true, open:true, code} : {demo:true, activation:true, open:false}; },
  async portalLogin(phone, code, role){
    const D=this.data, ph=resolveIdent(D, phone, role)||normPhone(phone), dev=this._deviceId(), now=Date.now(); let ok=false;
    D.activation_attempts=D.activation_attempts||[];
    if(D.activation_attempts.filter(a=>a.phone===ph && !a.ok && now-Date.parse(a.at)<3600e3).length>=ACT_MAX_FAILS) throw new Error(ACT_LOCKED);
    const h=await sha256('sama-act:'+ph+':'+String(code));
    const lr=(D.login_requests||[]).find(r=>r.phone===ph && r.role===role && r.device===dev && reqLive(r) && r.code_hash && r.code_hash===h);
    const w=lr?.window_id ? (D.act_windows||[]).find(x=>x.id===lr.window_id) : null;
    if(lr && (!lr.window_id || (w && !w.used_at && !w.revoked))){ ok=true; const at=new Date().toISOString(); lr.used_at=at; if(w) w.used_at=at;
      (D.login_requests||[]).forEach(r=>{ if(r.phone===ph && r.role===role && !r.used_at) r.used_at=at; }); }
    else if(code==='1234'){ ok=true; }   // الرمز التجريبي 1234 في الوضع التجريبي فقط
    if(!ok){ D.activation_attempts.push({phone:ph, ok:false, at:new Date().toISOString()}); this.save(); throw new Error(ACT_FAIL); }
    if(!rolesOfPhone(D, ph).includes(role)) throw new Error(`هذا الرقم غير مرتبط بحساب ${ROLE_TXT[role]}. راجع إدارة المعهد.`);
    D.devices=D.devices||[]; const d={id:uid(), phone:ph, role, label:'', created_at:new Date().toISOString(), revoked_at:null}; D.devices.push(d); this.save();
    try{ localStorage.setItem(this.key+'_dev_'+role, JSON.stringify({phone:ph, id:d.id})); }catch(e){}
    try{ sessionStorage.setItem(this.key+'_p_'+role, ph); }catch(e){} return {ok:true};
  },
  /* فتح التفعيل (↔ admin_open_activation): مهلة لجهاز واحد، والأحدث يلغي السابق؛ لا رمز للإدارة */
  async openActivation(phone, role, minutes=15){ const ph=normPhone(phone), D=this.data; if(!WINDOW_MINUTES.some(([m])=>m===+minutes)) throw new Error('مدة غير صالحة');
    if(!rolesOfPhone(D, ph).includes(role)) throw new Error(`هذا الرقم غير مرتبط بحساب ${ROLE_TXT[role]}`);
    D.act_windows=D.act_windows||[]; D.act_windows.forEach(w=>{ if(w.phone===ph && w.role===role && !w.used_at) w.revoked=true; });
    const w={id:uid(), phone:ph, role, created_at:new Date().toISOString(), expires_at:new Date(Date.now()+minutes*60000).toISOString(), used_at:null, revoked:false}; D.act_windows.push(w);
    this.audit('activation.open', ph, {role, minutes}); this.save(); return {phone:ph, role, expires_at:w.expires_at}; },
  async openActivationBulk(role, phones, minutes=1440){ const out=[]; for(const p of [...new Set((phones||[]).map(normPhone))]){ try{ out.push(await this.openActivation(p, role, minutes)); }catch(e){ out.push({phone:p, role, error:e.message}); } } return out; },
  async closeActivation(phone, role){ const ph=normPhone(phone); (this.data.act_windows||[]).forEach(w=>{ if(w.phone===ph && w.role===role && !w.used_at) w.revoked=true; }); this.save(); return {ok:true}; },
  async revokeDevices(phone, role){ const ph=normPhone(phone), D=this.data, at=new Date().toISOString(); (D.devices||[]).forEach(d=>{ if(d.phone===ph && d.role===role && !d.revoked_at) d.revoked_at=at; });
    (D.act_windows||[]).forEach(w=>{ if(w.phone===ph && w.role===role && !w.used_at) w.revoked=true; }); this.audit('activation.revoke', ph, {role}); this.save(); return {ok:true}; },
  /* حالة التفعيل للإدارة (↔ admin_access_status): بلا رموز ولا أوصاف أجهزة */
  async accessData(){ const D=this.data, now=Date.now(), latest=new Map();
    (D.act_windows||[]).forEach(w=>{ const k=w.phone+'|'+w.role, o=latest.get(k); if(!o || o.created_at<w.created_at) latest.set(k, w); });
    const reqs=new Map(); (D.login_requests||[]).filter(r=>reqLive(r, now) && !r.window_id && !(D.devices||[]).some(d=>d.phone===r.phone && d.role===r.role && !d.revoked_at && d.created_at>r.created_at))
      .forEach(r=>{ const k=r.phone+'|'+r.role; if(!reqs.has(k) || reqs.get(k).created_at<r.created_at) reqs.set(k, r); });
    return JSON.parse(JSON.stringify({ devices:(D.devices||[]).map(({id, phone, role, created_at, revoked_at})=>({id, phone, role, created_at, revoked_at})),
      windows:[...latest.values()].map(({id, phone, role, created_at, expires_at, used_at, revoked})=>({id, phone, role, created_at, expires_at, used_at, revoked})),
      requests:[...reqs.values()].map(({id, name, role, phone, created_at})=>({id, name, role, phone, created_at})) })); },
  /* مسؤولو النظام (تجريبيًا: قائمة للعرض، والدخول بالرمز المشترك) */
  async listAdmins(){ const D=this.data; D.admins=D.admins||[{id:'demo-admin', email:'admin@demo.local', name:'مدير النظام', role:'owner', active:true, pending:false, self:true}];
    D.admins.forEach(a=>{ if(!a.role) a.role=a.id==='demo-admin'?'owner':'staff'; }); return JSON.parse(JSON.stringify(D.admins)); },
  async adminSignup(){ throw new Error('حسابات المسؤولين تعمل مع قاعدة البيانات فقط؛ ادخل هنا برمز الدخول التجريبي'); },
  async authReady(){ return false; }, async mustChangePassword(){ return false; }, async setPassword(){ return true; },
  async adminMe(){ if(!this.admin) return null; const a=(await this.listAdmins()).find(x=>x.id==='demo-admin'); return {id:a.id, email:a.email, name:a.name, role:a.role}; },
  async reauth(pass){ if(pass!==this.data.settings.admin_pin) throw new Error('كلمة المرور غير صحيحة'); this._reauthAt=Date.now(); return true; },
  _recent(){ return !!this._reauthAt && Date.now()-this._reauthAt < 600000; },
  async setAdminRole(id, role, reason){ const D=this.data, me=await this.adminMe(); await this.listAdmins(); const a=D.admins.find(x=>x.id===id&&!x.pending); if(!a) throw new Error('الحساب غير موجود');
    if(me.role!=='owner') throw new Error('تغيير الأدوار للمالك الأساسي وحده'); if(a.id===me.id||a.role==='owner') throw new Error('لا يُغيَّر دور المالك الأساسي');
    checkRole(me, role, reason, this._recent()); a.role=role; a.role_reason=String(reason).trim(); this.audit('admins.update', a.email, {before:{role:a.role}, after:{role, role_reason:a.role_reason}}); this.save(); return {ok:true}; },
  async setAdminActive(id, active, reason=''){ const D=this.data, me=await this.adminMe(); await this.listAdmins(); const a=D.admins.find(x=>x.id===id&&!x.pending); if(!a) throw new Error('الحساب غير موجود');
    if(!['owner','full'].includes(me.role)) throw new Error('إدارة المسؤولين لمدير النظام فقط'); if(a.id===me.id) throw new Error('لا تعطّل حسابك الحالي'); if(a.role==='owner') throw new Error('لا يُعطَّل المالك الأساسي');
    if(a.role==='full'&&me.role!=='owner') throw new Error('تعطيل مدير النظام الكامل للمالك الأساسي وحده'); a.active=!!active; if(active) a.removed=false; this.audit('admins.update', a.email, {after:{active:!!active, role_reason:reason}}); this.save(); return {ok:true}; },
  async adminAudit(f={}){ const me=await this.adminMe(); if(me?.role!=='owner') throw new Error('أرشيف الحركات للمالك الأساسي وحده'); const all=auditFilter(this.data.audit_logs||[], f), lim=f.export?20000:Math.min(500, f.limit||200);
    const rows=all.slice(f.offset||0, (f.offset||0)+lim); if(f.export){ this.audit('audit.export', '', {rows:rows.length}); this.save(); }
    return {total:all.length, rows:JSON.parse(JSON.stringify(rows)), actors:(await this.listAdmins()).filter(a=>!a.pending).map(a=>({id:a.id, name:a.name, role:a.role}))}; },
  async addAdmin(email, name, role='staff'){ const D=this.data, e=String(email||'').trim().toLowerCase(), me=await this.adminMe(); await this.listAdmins();
    if(!['owner','full'].includes(me?.role)) throw new Error('إدارة المسؤولين لمدير النظام فقط'); checkRole(me, role, null, this._recent());
    if(!/^\S+@\S+\.\S+$/.test(e)) throw new Error('اكتب بريدًا صحيحًا'); if(String(name||'').trim().length<3) throw new Error('اكتب اسم المسؤول');
    if(D.admins.some(a=>a.email===e)) throw new Error('هذا البريد له حساب مسؤول؛ فعّله أو عدّل دوره من القائمة'); D.admins.push({id:uid(), email:e, name:String(name).trim(), role, active:true, pending:true, created_by:me.name, created_at:new Date().toISOString()}); this.audit('admin_invites.insert', e, {after:{email:e, role}}); this.save(); return {ok:true, pending:true, mode:'local'}; },
  async removeAdmin(id){ const D=this.data; await this.listAdmins(); const a=D.admins.find(x=>x.id===id); if(!a) throw new Error('غير موجود');
    if(a.pending){ D.admins.splice(D.admins.indexOf(a),1); this.audit('admin_invites.delete', a.email); this.save(); return {ok:true}; } await this.setAdminActive(id, false, 'إزالة من قائمة المسؤولين'); a.removed=true; this.save(); return {ok:true}; },
  async portalSession(role){ let ph=null; try{ ph=sessionStorage.getItem(this.key+'_p_'+role);
      if(!ph){ const d=JSON.parse(localStorage.getItem(this.key+'_dev_'+role)||'null'); this.load(); if(d && (this.data.devices||[]).some(x=>x.id===d.id && x.phone===d.phone && x.role===role && !x.revoked_at)) ph=d.phone; else if(d) localStorage.removeItem(this.key+'_dev_'+role); } }catch(e){} return ph && rolesOfPhone(this.data, ph).includes(role) ? {phone:ph, role} : null; },
  async portalLogout(role){ try{ sessionStorage.removeItem(this.key+'_p_'+role); const d=JSON.parse(localStorage.getItem(this.key+'_dev_'+role)||'null'); localStorage.removeItem(this.key+'_dev_'+role);
      if(d){ const x=(this.data.devices||[]).find(y=>y.id===d.id); if(x && !x.revoked_at){ x.revoked_at=new Date().toISOString(); this.save(); } } }catch(e){} },
  /* تسجيل الحضور من داخل البوابة (شاشة الترحيب): ملف هذا الجوال فقط، بمسار التحضير نفسه ↔ portal_checkin */
  async portalCheckin(traineeId, code, opts={}){ const se=await this.portalSession('student'); if(!se) throw new Error('انتهت الجلسة، سجّل الدخول مجددًا');
    const t=this.data.trainees.find(x=>x.id===traineeId && normPhone(x.phone)===normPhone(se.phone)); if(!t) throw new Error('غير مصرح');
    return this.checkin(t.national_id, code, null, {device:opts.device||'portal', choice:opts.choice}); },
  async portalData(role){ const s=await this.portalSession(role); if(!s) throw new Error('انتهت الجلسة، سجّل الدخول مجددًا'); this.autoArchive(); this.runReminders(); this.finalizeExpiredQuizzes(); const out=JSON.parse(JSON.stringify(scopeData(this.data, role, s.phone))); out.bank_assets=this.data.settings?.bank_assets||''; if(out) out.q_meta=qMetaOf(this.data, out); return out; },
  /* صندوق الوارد (الخطوة D): تنبيهات بدء الجلسة تُنشأ عند الحاجة (في السحابة: pg_cron كل دقيقة)، ومفتاح منع التكرار */
  runReminders(){ const D=this.data; D.notifications=D.notifications||[]; const keys=new Set(D.notifications.map(x=>x.dedupe_key).filter(Boolean));
    const n=riyadhNow(), add=[...sessionReminders(D, n), ...weeklyNotes(D, n).map(x=>({id:uid(), at:new Date().toISOString(), read_at:null, ...x}))].filter(x=>!keys.has(x.dedupe_key)); if(add.length){ D.notifications.push(...add); this.save(); } return add.length; },
  async inboxState(role){ const s=await this.portalSession(role); if(!s) return {items:[], unread:0}; this.load(); this.runReminders(); const sc=scopeData(this.data, role, s.phone); return sc ? inboxOf(sc, role) : {items:[], unread:0}; },
  async adminNotify(f){ const D=this.data, text=String(f.text||'').trim(); if(text.length<3) throw new Error('اكتب نص الرسالة'); if(text.length>600) throw new Error('الرسالة أطول من 600 حرف');
    if(!['student','guardian','teacher'].includes(f.audience)) throw new Error('اختر الفئة المستهدفة');
    const R=adminRecipients(D, f, riyadhNow().date); if(!R.length) throw new Error('لا يوجد مستلمون في هذا النطاق');
    const at=new Date().toISOString(), date=riyadhNow().date, batch=uid();
    R.forEach(r=>D.notifications.push({id:uid(), at, date, sender:'admin', kind:'admin', text, read_at:null, batch, ...r}));
    this.audit('notify.admin', batch, {audience:f.audience, scope:f.scope||'all', count:R.length}); this.save(); return {ok:true, count:R.length}; },
  /* إشعار من المدرب: يُرفض إن لم يكن المتدرب في نطاقه أو لم يكن لولي الأمر رابط موثّق */
  async teacherNotify({trainee_id, to, kind, note}){
    const s=await this.portalSession('teacher'); if(!s) throw new Error('انتهت الجلسة'); const D=this.data, sc=scopeData(D,'teacher',s.phone);
    if(!sc.trainees.some(t=>t.id===trainee_id)) throw new Error('المتدرب ليس ضمن متدربيك');
    if(to==='guardian' && !sc.guardian_links.some(l=>l.trainee_id===trainee_id)) throw new Error('لا يوجد ولي أمر موثّق لهذا المتدرب');
    const today=riyadhNow().date, sender='teacher:'+sc.me.id;
    if(D.notifications.some(x=>x.sender===sender&&x.trainee_id===trainee_id&&x.to===to&&x.kind===kind&&(x.date||x.at.slice(0,10))===today)) return {ok:true, duplicate:true};
    D.notifications.push(makeNotification(D,{sender, to, trainee_id, kind, note})); this.save(); return {ok:true};
  },
  async markRead(role){ const s=await this.portalSession(role); if(!s) return; const sc=scopeData(this.data, role, s.phone); if(!sc) return; const ids=new Set((role==='teacher'?sc.notifications_in:sc.notifications).map(x=>x.id)); const now=new Date().toISOString(); this.data.notifications.forEach(x=>{ if(ids.has(x.id)&&!x.read_at) x.read_at=now; }); this.save(); },
  /* إدارة المدربين وأولياء الأمور */
  async saveTeacher(t){ const a=this.data.teachers; if(!/^05\d{8}$/.test(normPhone(t.phone))) throw new Error('رقم الجوال غير صحيح');
    if(a.some(x=>x.id!==t.id && x.active!==false && normPhone(x.phone)===normPhone(t.phone))) throw new Error('رقم الجوال مستخدم لمدرب آخر');
    if(t.national_id && !/^[12]\d{9}$/.test(t.national_id)) throw new Error('رقم الهوية 10 أرقام'); if(t.national_id && a.some(x=>x.id!==t.id && x.national_id===t.national_id)) throw new Error('رقم الهوية مستخدم لمدرب آخر');
    const i=a.findIndex(x=>x.id===t.id); if(i>=0) a[i]={...a[i],...t, phone:normPhone(t.phone)}; else a.push({...t, id:uid(), phone:normPhone(t.phone), active:true, created_at:new Date().toISOString()}); this.audit('teacher.save', t.id||'new'); this.save(); },
  /* ---------- طلبات الشراء (docs/payments، المرحلة 1) ---------- */
  _newOrder(o){ const D=this.data, n=riyadhNow(); D.orders=D.orders||[]; D.order_seq=(D.order_seq||0)+1;
    const row={id:uid(), number:orderNumber(D.order_seq, n.date.slice(0,4)), kind:o.kind, trainee_id:o.trainee_id, subscription_id:o.subscription_id||null, enrollment_ids:o.enrollment_ids||[], title:o.title, total:o.total, due_now:o.due_now,
      approval:'pending_review', payment:'unpaid', provisional:false, paid_amount:0, claim:null, note:'', version:1, events:[{at:new Date().toISOString(), action:'created', by:'trainee', reason:''}], created_at:new Date().toISOString()};
    D.orders.push(row); return orderPublic(row, D.settings.bank); },
  _orderEvent(o, action, by, reason){ o.events.push({at:new Date().toISOString(), action, by, reason:String(reason||'').slice(0,300)}); o.version++; },
  /* إبلاغ صاحب الطلب بتحويل: برقم الطلب والسجل المدني معًا (من صفحة التأكيد) أو من جلسة بوابته. لا يعني تأكيد وصول المال. */
  async orderReportTransfer(f){ const D=this.data, o=(D.orders||[]).find(x=>x.number===String(f.number||'').trim()||x.id===f.order_id), t=o&&D.trainees.find(x=>x.id===o.trainee_id);
    let allowed = !!t && !!f.national_id && t.national_id===String(f.national_id).trim();
    if(!allowed && t){ for(const role of ['student','guardian']){ const s=await this.portalSession(role); if(s && scopeData(D, role, s.phone)?.orders?.some(x=>x.id===o.id)) allowed=true; } }
    if(!allowed) throw new Error('تعذّر العثور على الطلب. تأكد من رقم الطلب والسجل المدني.');
    if(o.approval==='rejected') throw new Error('هذا الطلب مرفوض؛ راجع إدارة المعهد.'); if(o.payment==='confirmed') throw new Error('سبق تأكيد سداد هذا الطلب.');
    o.claim={...checkTransfer(f, riyadhNow().date), at:new Date().toISOString()}; o.payment='claimed'; this._orderEvent(o,'transfer_reported','trainee',`${o.claim.amount} ريال${o.claim.reference?' · مرجع '+o.claim.reference:''}`); this.save();
    return orderPublic(o, D.settings.bank); },
  async reviewOrder(id, decision, reason, expected_version){ const o=(this.data.orders||[]).find(x=>x.id===id); if(!o) throw new Error('الطلب غير موجود');
    if(!['approved','needs_information','rejected'].includes(decision)) throw new Error('قرار غير صالح');
    if(expected_version!=null && expected_version!==o.version) throw new Error('تغيّر الطلب أثناء المراجعة؛ أعد فتحه ثم قرّر.');
    if(decision!=='approved' && String(reason||'').trim().length<3) throw new Error('اكتب سبب القرار');
    o.approval=decision; o.note=decision==='approved'?'':String(reason).trim().slice(0,300); if(decision==='rejected') o.provisional=false;
    this._orderEvent(o, decision, 'admin', reason); this.audit('order.review', o.id, {decision}); this.save(); return {ok:true}; },
  async confirmOrderPayment(id, amount, confirmed=true, reason='', method='transfer'){ const D=this.data, o=(D.orders||[]).find(x=>x.id===id); if(!o) throw new Error('الطلب غير موجود'); D.invoices=D.invoices||[];
    if(confirmed && o.payment==='confirmed') throw new Error('سبق تأكيد سداد هذا الطلب.');
    if(confirmed){ const a=Math.round(+amount*100)/100; if(!(a>0)) throw new Error('اكتب المبلغ الواصل فعليًا'); if(o.total>0 && a>r2(o.total-(+o.paid_amount||0))) throw new Error(`المبلغ أكبر من المتبقي (${Math.max(0,r2(o.total-(+o.paid_amount||0)))} ريال)`);
      if(!PAY_METHODS[method]) throw new Error('اختر طريقة السداد'); const prior=+o.paid_amount||0;
      o.paid_amount=Math.round((prior+a)*100)/100; o.payment='confirmed'; D.invoice_seq=(D.invoice_seq||0)+1;
      const inv={id:uid(), ...buildInvoice(o, D.trainees.find(t=>t.id===o.trainee_id), {amount:a, seq:D.invoice_seq, date:riyadhNow().date, prior, method:PAY_METHODS[method]}), created_at:new Date().toISOString()}; D.invoices.push(inv);
      this._orderEvent(o,'payment_confirmed','admin',`${a} ريال · فاتورة ${inv.number}`); }
    else { if(D.invoices.some(i=>i.order_id===o.id&&i.doc_type==='refund'&&i.status==='issued')) throw new Error('للطلب إشعار استرداد ساري؛ ألغِه أولًا قبل إلغاء تأكيد السداد'); const base=+(o.opening?.paid)||0; if(o.payment!=='confirmed' || !D.invoices.some(i=>i.order_id===o.id && i.status==='issued')) throw new Error('لا دفعات مؤكدة داخل النظام لإلغائها'); if(String(reason||'').trim().length<3) throw new Error('اكتب سبب إلغاء تأكيد السداد');
      D.invoices.filter(i=>i.order_id===o.id && i.status==='issued').forEach(i=>{ i.status='void'; i.void_reason=String(reason).trim().slice(0,300); i.voided_at=new Date().toISOString(); });
      o.payment=base>0?'confirmed':o.claim?'claimed':'unpaid'; o.paid_amount=base; this._orderEvent(o,'payment_unconfirmed','admin',reason); }
    this.audit('order.payment', o.id, {confirmed}); this.save(); return {ok:true}; },
  async setOrderProvisional(id, on, reason){ const o=(this.data.orders||[]).find(x=>x.id===id); if(!o) throw new Error('الطلب غير موجود'); if(on && o.approval==='rejected') throw new Error('الطلب مرفوض');
    if(on && String(reason||'').trim().length<3) throw new Error('اكتب سبب القبول المؤقت'); o.provisional=!!on; this._orderEvent(o, on?'provisional_on':'provisional_off','admin',reason); this.audit('order.provisional', o.id, {on:!!on}); this.save(); return {ok:true}; },
  /* دفعة إضافية على طلب مؤكد (قسط أو باقي الرسوم): تصدر لها فاتورة مستقلة */
  async addOrderPayment(id, f){ const D=this.data, o=(D.orders||[]).find(x=>x.id===id); if(!o) throw new Error('الطلب غير موجود'); D.invoices=D.invoices||[];
    if(o.approval==='rejected') throw new Error('الطلب مرفوض'); if(o.payment!=='confirmed') throw new Error('أكّد الدفعة الأولى أولًا');
    const a=Math.round(+f.amount*100)/100, prior=+o.paid_amount||0, date=f.date||riyadhNow().date; if(!(a>0)) throw new Error('اكتب مبلغ الدفعة'); if(!PAY_METHODS[f.method]) throw new Error('اختر طريقة السداد');
    if(a>Math.round((o.total-prior)*100)/100) throw new Error(`المبلغ أكبر من المتبقي (${Math.max(0,o.total-prior)} ريال)`); if(date>riyadhNow().date) throw new Error('تاريخ الدفعة في المستقبل');
    o.paid_amount=Math.round((prior+a)*100)/100; D.invoice_seq=(D.invoice_seq||0)+1;
    const inv={id:uid(), ...buildInvoice(o, D.trainees.find(t=>t.id===o.trainee_id), {amount:a, seq:D.invoice_seq, date:riyadhNow().date, prior, method:PAY_METHODS[f.method], transfer_date:date, transfer_ref:String(f.reference||'').trim().slice(0,60)}), created_at:new Date().toISOString()}; D.invoices.push(inv);
    this._orderEvent(o,'payment_added','admin',`${a} ريال · ${PAY_METHODS[f.method]} · فاتورة ${inv.number}`); this.audit('order.payment_added', o.id); this.save(); return {ok:true, invoice:inv.number}; },
  /* ---- عمليات الفوترة (الخطوة AH) ↔ …_billing_ops.sql ---- */
  async _role(min){ const me=await this.adminMe(); if(min==='owner' ? me?.role!=='owner' : !['owner','full'].includes(me?.role)) throw new Error(min==='owner'?'هذه العملية يعتمدها المالك وحده':'تأكيد السداد لمدير النظام فقط'); },
  /* استلام مبلغ بطريقة أو أكثر: فاتورة واحدة تُفصَّل فيها الطرق؛ أول استلام يؤكد السداد ↔ admin_receive_payment */
  async receivePayment(id, f){ await this._role('full'); const D=this.data, o=(D.orders||[]).find(x=>x.id===id); if(!o) throw new Error('الطلب غير موجود'); D.invoices=D.invoices||[];
    if(o.approval==='rejected') throw new Error('الطلب مرفوض'); if(o.cancelled_at) throw new Error('الطلب ملغى');
    const {lines, sum}=checkLines(f.lines), today=riyadhNow().date, date=f.date||(o.payment!=='confirmed'&&o.claim?.date)||today, prior=+o.paid_amount||0, first=o.payment!=='confirmed';
    if(date>today) throw new Error('تاريخ السداد في المستقبل');
    /* قرار المالك: يُقبل أي مبلغ موجب؛ «المطلوب الآن» اقتراح لا حد أدنى ↔ …_pay_any_amount.sql */
    if(o.total>0 && sum>r2(o.total-prior)) throw new Error(`المبلغ أكبر من المتبقي (${Math.max(0,r2(o.total-prior))} ريال)`);
    o.paid_amount=r2(prior+sum); o.payment='confirmed'; D.invoice_seq=(D.invoice_seq||0)+1;
    const inv={id:uid(), ...buildInvoice(o, D.trainees.find(t=>t.id===o.trainee_id), {amount:sum, seq:D.invoice_seq, date:today, prior, method:linesMethod(lines), transfer_date:date, transfer_ref:linesRef(lines)||(first?o.claim?.reference||'':''), lines}), created_at:new Date().toISOString()}; D.invoices.push(inv);
    this._orderEvent(o, first?'payment_confirmed':'payment_added', 'admin', `${sum} ريال · ${linesText(lines)} · فاتورة ${inv.number}`); this.audit('order.receive', o.id); this.save(); return {ok:true, invoice:inv.number, id:inv.id}; },
  /* ترقية أو تخفيض الباقة: يبقى تاريخ البداية (قرار المالك) وتُحسب النهاية للباقة الجديدة ↔ admin_change_plan */
  async changePlan(id, f){ await this._role('owner'); const D=this.data, o=(D.orders||[]).find(x=>x.id===id); if(!o) throw new Error('الطلب غير موجود');
    if(o.kind!=='plan'||!o.subscription_id) throw new Error('تغيير الباقة لطلبات الباقات فقط'); if(o.cancelled_at) throw new Error('الطلب ملغى'); if(o.approval==='rejected') throw new Error('الطلب مرفوض');
    const s=D.subscriptions.find(x=>x.id===o.subscription_id), pl=D.plans.find(p=>p.id===f.plan_id), old=D.plans.find(p=>p.id===s?.plan_id);
    if(!s||s.status==='cancelled') throw new Error('الاشتراك ملغى'); if(!pl||pl.active===false) throw new Error('اختر الباقة'); if(pl.mode==='remote'||pl.status==='coming_soon') throw new Error('هذه الباقة غير متاحة بعد');
    if(pl.id===s.plan_id) throw new Error('هذه باقته الحالية'); if(String(f.reason||'').trim().length<3) throw new Error('اكتب سبب تغيير الباقة');
    if(D.subscriptions.some(x=>x.id!==s.id && x.trainee_id===s.trainee_id && x.plan_id===pl.id && ['pending','active'].includes(subStatus(x)))) throw new Error('للمتدرب اشتراك قائم في هذه الباقة');
    const total=f.total===''||f.total==null ? planTotal(pl) : r2(f.total); if(!(total>=0)) throw new Error('اكتب الإجمالي الجديد');
    s.plan_id=pl.id; s.subjects=[...(pl.subjects||[])]; s.end_date=s.start_date?subEnd(pl,s.start_date):null; s.status=!s.start_date?'pending':(s.end_date<riyadhNow().date?'ended':'active');
    o.title='باقة '+planName(pl); o.total=total; o.due_now=Math.min(o.due_now,total); const sur=Math.max(0,r2(o.paid_amount-total));
    this._orderEvent(o,'plan_changed','admin',`من باقة ${planName(old)} إلى باقة ${planName(pl)} · الإجمالي ${total} ريال${sur?` · فائض ${sur} ريال`:''} · ${String(f.reason).trim()}`); this.audit('order.plan_change', o.id); this.save(); return {ok:true, surplus:sur}; },
  /* إلغاء وانسحاب: يلغي الاشتراك أو التسجيل ويبقي الطلب وسجله؛ الاسترداد قرار مستقل ↔ admin_cancel_order */
  async cancelOrder(id, reason){ await this._role('owner'); const D=this.data, o=(D.orders||[]).find(x=>x.id===id); if(!o) throw new Error('الطلب غير موجود');
    if(o.cancelled_at) throw new Error('الطلب ملغى مسبقًا'); if(String(reason||'').trim().length<3) throw new Error('اكتب سبب الإلغاء');
    o.cancelled_at=new Date().toISOString(); o.cancel_reason=String(reason).trim().slice(0,300); o.provisional=false;
    if(o.subscription_id){ const s=D.subscriptions.find(x=>x.id===o.subscription_id); if(s) s.status='cancelled'; }
    D.enrollments.filter(e=>(o.enrollment_ids||[]).includes(e.id)).forEach(e=>{ e.status='ملغى'; });
    this._orderEvent(o,'cancelled','admin',reason); this.audit('order.cancel', o.id); this.save(); return {ok:true, refundable:refundable(o)}; },
  /* الاسترداد بأمر المالك: إشعار استرداد بطرق الرد، مرتبط بآخر فاتورة للطلب ↔ admin_refund */
  async refundOrder(id, f){ await this._role('owner'); const D=this.data, o=(D.orders||[]).find(x=>x.id===id); if(!o) throw new Error('الطلب غير موجود'); D.invoices=D.invoices||[];
    const max=refundable(o); if(!(max>0)) throw new Error('لا مبلغ قابل للاسترداد: يكون بعد إلغاء الطلب أو عند فائض بعد تخفيض الباقة');
    const {lines, sum}=checkLines(f.lines); if(sum>max) throw new Error(`المبلغ أكبر من القابل للاسترداد (${max} ريال)`); if(String(f.reason||'').trim().length<3) throw new Error('اكتب سبب الاسترداد');
    const today=riyadhNow().date, last=D.invoices.filter(i=>i.order_id===o.id&&i.status==='issued'&&i.doc_type!=='refund').sort((a,b)=>b.number.localeCompare(a.number))[0];
    D.refund_seq=(D.refund_seq||0)+1; const prior=+o.paid_amount||0; o.paid_amount=r2(prior-sum); o.refunded=r2((+o.refunded||0)+sum);
    const doc={id:uid(), ...buildInvoice(o, D.trainees.find(t=>t.id===o.trainee_id), {amount:sum, seq:0, date:today, prior:0, method:linesMethod(lines), transfer_date:today, transfer_ref:linesRef(lines), lines}),
      number:refundNumber(D.refund_seq, today.slice(0,4)), remaining:orderRemaining(o), doc_type:'refund', ref_invoice:last?.number||'', reason:String(f.reason).trim().slice(0,300), created_at:new Date().toISOString()}; D.invoices.push(doc);
    this._orderEvent(o,'refunded','admin',`${sum} ريال · ${linesText(lines)} · ${doc.number} · ${doc.reason}`); this.audit('order.refund', o.id); this.save(); return {ok:true, number:doc.number, id:doc.id}; },
  /* إلغاء إشعار استرداد صدر خطأً: يعيد المبلغ إلى المدفوع ↔ admin_void_refund */
  async voidRefund(id, reason){ await this._role('owner'); const D=this.data, i=(D.invoices||[]).find(x=>x.id===id); if(!i||i.doc_type!=='refund') throw new Error('الإشعار غير موجود'); if(i.status!=='issued') throw new Error('الإشعار ملغى مسبقًا');
    if(String(reason||'').trim().length<3) throw new Error('اكتب سبب الإلغاء'); const o=D.orders.find(x=>x.id===i.order_id);
    i.status='void'; i.void_reason=String(reason).trim().slice(0,300); i.voided_at=new Date().toISOString(); o.paid_amount=r2(o.paid_amount+i.paid); o.refunded=r2(o.refunded-i.paid);
    this._orderEvent(o,'refund_voided','admin',`${i.number} · ${reason}`); this.audit('order.refund_void', o.id); this.save(); return {ok:true}; },
  /* تصحيح رسوم الطلب وسبب الخصم (مراجعة البيانات) */
  async saveOrderMeta(id, f){ const o=(this.data.orders||[]).find(x=>x.id===id); if(!o) throw new Error('الطلب غير موجود'); const total=Math.round(+f.total*100)/100;
    if(!(total>0)) throw new Error('اكتب إجمالي الرسوم'); if(total<(+o.paid_amount||0)) throw new Error('الإجمالي أقل من المدفوع');
    o.total=total; o.due_now=Math.min(o.due_now,total); o.discount_note=String(f.discount_note||'').trim().slice(0,200); this._orderEvent(o,'edited','admin',`${total} ريال${o.discount_note?' · '+o.discount_note:''}`); this.save(); return {ok:true}; },
  /* تعديل بيانات المتدرب من الإدارة (استكمال الناقص) */
  async saveTrainee(id, f){ const D=this.data, t=D.trainees.find(x=>x.id===id); if(!t) throw new Error('المتدرب غير موجود'); const p={};
    if('full_name' in f){ if(String(f.full_name).trim().length<3) throw new Error('اكتب الاسم'); p.full_name=String(f.full_name).trim().replace(/\s+/g,' '); }
    if('national_id' in f){ if(!/^[12]\d{9}$/.test(f.national_id)) throw new Error('رقم الهوية 10 أرقام'); if(D.trainees.some(x=>x.id!==id&&x.national_id===f.national_id)) throw new Error('رقم الهوية مسجّل لمتدرب آخر'); p.national_id=f.national_id; }
    if('phone' in f){ if(!/^05\d{8}$/.test(f.phone)) throw new Error('رقم الجوال غير صحيح'); p.phone=f.phone; }
    if('guardian_phone' in f){ if(f.guardian_phone && !/^05\d{8}$/.test(f.guardian_phone)) throw new Error('جوال ولي الأمر غير صحيح'); p.guardian_phone=f.guardian_phone||''; }
    if('email' in f){ if(f.email && !/^\S+@\S+\.\S+$/.test(f.email)) throw new Error('البريد غير صحيح'); p.email=f.email||''; }
    if('birth_date' in f){ if(f.birth_date && (f.birth_date>riyadhNow().date || !/^\d{4}-\d{2}-\d{2}$/.test(f.birth_date))) throw new Error('تاريخ الميلاد غير صحيح'); p.birth_date=f.birth_date||''; }
    for(const k of ['city','education','gender']) if(k in f) p[k]=f[k]||'';
    Object.assign(t,p); this.audit('trainee.update', id, {fields:Object.keys(p)}); this.save(); return {ok:true}; },
  async resolveImportNote(id, idx, done=true){ const t=this.data.trainees.find(x=>x.id===id); if(!t?.import_notes?.[idx]) throw new Error('الملاحظة غير موجودة'); t.import_notes[idx].done=!!done; this.save(); return {ok:true}; },
  /* استيراد المسجّلين سابقًا: ملف المتدرب، اشتراكه بتاريخه الفعلي، وطلب شراء بدفعاته السابقة رصيدًا مرحَّلًا (بلا فواتير) */
  async importLegacy(rows){ if(!Array.isArray(rows)||!rows.length) throw new Error('لا صفوف للاستيراد؛ اختر الملف من جديد'); const D=this.data, today=riyadhNow().date, res={added:0, skipped:[]}; D.orders=D.orders||[];
    for(const r of rows){ if(r.errors?.length){ res.skipped.push({name:r.full_name, why:r.errors[0]}); continue; }
      const plan=D.plans.find(p=>p.id===r.plan_id); if(!plan){ res.skipped.push({name:r.full_name, why:'الباقة غير معروفة'}); continue; }
      let t=D.trainees.find(x=>x.national_id===r.national_id);
      if(t && D.subscriptions.some(s=>s.trainee_id===t.id && s.plan_id===plan.id && s.status!=='cancelled')){ res.skipped.push({name:r.full_name, why:'مسجّل مسبقًا في الباقة نفسها'}); continue; }
      const notes=(r.notes||[]).filter(keepNote).map(text=>({text, done:false}));
      if(!t){ t={id:uid(), national_id:r.national_id, full_name:r.full_name, phone:r.phone, email:r.email||'', gender:r.gender, birth_date:r.birth_date||'', city:'', education:'', employer:'', guardian_phone:r.guardian_phone||'', imported:true, import_notes:notes, created_at:new Date().toISOString()}; D.trainees.push(t); }
      else { t.import_notes=[...(t.import_notes||[]), ...notes]; if(!t.guardian_phone && r.guardian_phone) t.guardian_phone=r.guardian_phone; }
      const end=subEnd(plan, r.start_date), s={id:uid(), ref:newRef(), trainee_id:t.id, plan_id:plan.id, section:sectionOfGender(t.gender), subjects:[...(plan.subjects||[])], status:end<today?'ended':'active', start_date:r.start_date, end_date:end, start_manual:true, track_from:today, imported:true, created_at:r.start_date+'T09:00:00.000Z'};
      D.subscriptions.push(s);
      const pub=this._newOrder({trainee_id:t.id, kind:'plan', subscription_id:s.id, title:'باقة '+planName(plan), total:r.total, due_now:Math.min(+plan.reg_fee||0, r.total)}), o=D.orders.find(x=>x.id===pub.id);
      Object.assign(o, {approval:'approved', payment:r.paid>0?'confirmed':'unpaid', paid_amount:r.paid, discount_note:r.discount_note||'', created_at:r.start_date+'T09:00:00.000Z',
        opening:{paid:r.paid, payments:(r.payments||[]).map(p=>({amount:p.amount, method:p.method, label:p.label, note:p.note||''}))}});
      this._orderEvent(o,'imported','admin',`مدفوع سابقًا ${r.paid} من ${r.total} ريال`); res.added++; }
    this.audit('import.legacy','trainees',{added:res.added, skipped:res.skipped.length}); this.save(); return res; },
  /* صورة الإيصال يرفقها المسؤول بالفاتورة (تصله عبر واتساب)؛ لا يُستنتج منها السداد */
  async attachReceipt(id, image){ const D=this.data, i=(D.invoices||[]).find(x=>x.id===id); if(!i) throw new Error('الفاتورة غير موجودة'); if(!validReceipt(image)) throw new Error('صورة الإيصال غير صالحة أو كبيرة');
    D.invoice_receipts=D.invoice_receipts||{}; D.invoice_receipts[id]=image; i.has_receipt=true; this.audit('invoice.receipt', id); this.save(); return {ok:true}; },
  async invoiceReceipt(id){ return (this.data.invoice_receipts||{})[id]||null; },
  async saveBank(b){ if(!validIban(b.iban)) throw new Error('رقم الآيبان غير صحيح'); if(!String(b.beneficiary||'').trim()||!String(b.bank||'').trim()) throw new Error('اكتب اسم البنك واسم المستفيد');
    this.data.settings.bank={enabled:!!b.enabled, bank:b.bank.trim(), beneficiary:b.beneficiary.trim(), iban:String(b.iban).replace(/\s/g,'').toUpperCase(), account:String(b.account||'').trim()}; this.audit('settings.bank','bank',{enabled:!!b.enabled}); this.save(); return {ok:true}; },
  /* ربط ولي الأمر الذاتي بالسجل المدني للابن (بعد دخوله برمز التحقق) */
  async guardianSelfLink(national_id){ const s=await this.portalSession('guardian'); if(!s) throw new Error('انتهت الجلسة، سجّل الدخول مجددًا');
    const D=this.data, now=new Date().toISOString(), nid=String(national_id||'').trim(), r=selfLinkLogic(D, s.phone, nid, now);
    if(r.reason==='locked') throw new Error(LINK_LOCKED);
    (D.guardian_link_attempts=D.guardian_link_attempts||[]).push({id:uid(), phone:s.phone, nid_hash:'h'+nid.slice(-2), ok:r.ok, reason:r.reason||null, at:now}); if(D.guardian_link_attempts.length>2000) D.guardian_link_attempts.splice(0,500);
    if(!r.ok){ this.save(); throw new Error(LINK_FAIL); }
    if(!r.already){ D.guardian_links.push({id:uid(), guardian_name:'', guardian_phone:s.phone, trainee_id:r.trainee_id, relation:'ولي الأمر', status:'verified', verified_by:'self', source:'self', created_at:now}); this.audit('guardian_link.self', r.trainee_id); }
    this.save(); return {ok:true, already:!!r.already}; },
  async saveGuardianLink(l){ const D=this.data; if(!/^05\d{8}$/.test(normPhone(l.guardian_phone))) throw new Error('رقم جوال ولي الأمر غير صحيح');
    const t=D.trainees.find(x=>x.national_id===l.national_id||x.id===l.trainee_id); if(!t) throw new Error('لا يوجد متدرب بهذا السجل المدني');
    if(D.guardian_links.some(x=>x.status==='verified'&&x.trainee_id===t.id&&normPhone(x.guardian_phone)===normPhone(l.guardian_phone))) throw new Error('هذا الرابط موجود مسبقًا');
    D.guardian_links.push({id:uid(), guardian_name:l.guardian_name, guardian_phone:normPhone(l.guardian_phone), trainee_id:t.id, relation:l.relation||'ولي الأمر', status:'verified', verified_by:'admin', created_at:new Date().toISOString()});
    this.audit('guardian_link.create', t.id); this.save(); },
  /* ---- الجانب التعليمي: كل عملية تتحقق من الدور والنطاق ---- */
  async _me(){ const s=await this.portalSession('teacher'); const me=s&&this.data.teachers.find(t=>t.active!==false&&normPhone(t.phone)===s.phone); if(!me) throw new Error('انتهت الجلسة'); return me; },
  async _student(trainee_id){ const s=await this.portalSession('student'); const t=s&&this.data.trainees.find(x=>x.id===trainee_id&&normPhone(x.phone)===s.phone); if(!t) throw new Error('غير مصرح'); return t; },
  async saveAssignment(a){ const me=await this._me(); validateAssignment(a); if(!teacherCovers(me, me.section, a.subject)) throw new Error('المقرر خارج نطاقك');
    const L=this.data.assignments, row={title:a.title.trim(), body:String(a.body||'').slice(0,4000), subject:a.subject, section:me.section, publish_date:a.publish_date, due_date:a.due_date, max_score:+a.max_score||10};
    if(a.kind==='quiz'&&!a.id){ row.kind='quiz'; row.quiz=buildQuiz(this.data, me, a.subject, a.unit||null, a.count, a.question_ids); } else if(!a.id) row.kind='text';
    if(!a.id){ row.type=a.type||'homework'; row.reveal=a.reveal||'after_submit'; row.max_attempts=row.kind==='quiz'?attemptsOf(a):1; row.targets=checkTargets(this.data, me, a.subject, a.targets??null); row.target_label=row.targets?String(a.target_label||`${row.targets.length} متدربًا`).slice(0,80):''; if(row.type==='exam'&&row.kind==='quiz') checkExamKeys(this.data, row.quiz); }
    if(a.id){ const ex=L.find(y=>y.id===a.id&&y.teacher_id===me.id); if(ex?.kind==='quiz'){ delete row.subject; } }
    if(a.id){ const x=L.find(y=>y.id===a.id&&y.teacher_id===me.id); if(!x) throw new Error('غير مصرح'); Object.assign(x,row); } else L.push({id:uid(), teacher_id:me.id, ...row, created_at:new Date().toISOString()});
    this.save(); return {ok:true}; },
  async gradeSubmission(id, g){ const me=await this._me(), D=this.data, s=D.submissions.find(x=>x.id===id), a=s&&D.assignments.find(y=>y.id===s.assignment_id&&y.teacher_id===me.id); if(!a) throw new Error('غير مصرح');
    if(!['graded','needs_revision'].includes(g.status)) throw new Error('حالة غير صالحة'); const sc=g.score===''||g.score==null?null:+g.score; if(sc!=null&&(sc<0||sc>a.max_score)) throw new Error(`الدرجة من 0 إلى ${a.max_score}`);
    Object.assign(s,{status:g.status, score:sc, feedback:String(g.feedback||'').slice(0,1000), graded_at:new Date().toISOString()}); this.save(); return {ok:true}; },
  /* تغذية راجعة بعد التسليم: ملاحظة عامة ولكل سؤال، لا تغيّر الدرجة ↔ teacher_comment */
  async commentSubmission(id, f){ const me=await this._me(), D=this.data, s=D.submissions.find(x=>x.id===id), a=s&&D.assignments.find(y=>y.id===s.assignment_id&&y.teacher_id===me.id); if(!a) throw new Error('غير مصرح');
    if(s.status==='draft') throw new Error('لم يُسلِّم المتدرب بعد'); const c={};
    for(const [k,v] of Object.entries(f.comments||{})){ const t=String(v||'').trim(); if(!t) continue; if(a.kind!=='quiz'||!(a.quiz||[]).some(q=>q.id===k)) throw new Error('ملاحظة على سؤال خارج الاختبار'); c[k]=t.slice(0,500); }
    if(Object.keys(c).length>100) throw new Error('الحد 100 ملاحظة');
    s.teacher_note=String(f.note||'').trim().slice(0,1000)||null; s.comments=Object.keys(c).length?c:null; this.save(); return {ok:true}; },
  async submitAssignment({trainee_id, assignment_id, answer, answers, draft}){ await this._student(trainee_id); const D=this.data, a=D.assignments.find(x=>x.id===assignment_id);
    if(!a||!studentHasScope(D,trainee_id,a.section,a.subject)||a.publish_date>riyadhNow().date||(Array.isArray(a.targets)&&!a.targets.includes(trainee_id))) throw new Error('الواجب غير متاح لك');
    let s=D.submissions.find(x=>x.assignment_id===a.id&&x.trainee_id===trainee_id); if(s&&s.status==='graded') throw new Error('صُحّح الواجب ولا يمكن تعديله');
    if(a.kind==='quiz'){ // اختبار من البنك: يُفتح مرة واحدة، ويُصحَّح ما حُفظ داخل الوقت ولا يُعاد
      if(!s) throw new Error('ابدأ الاختبار أولًا');
      const g=this._gradeStarted(a, s, quizOpen(s)?answers:null); return {ok:true, right:g.right, total:g.total, score:g.score}; }
    const txt=String(answer||'').trim(); if(!draft&&!txt) throw new Error('اكتب إجابتك قبل الإرسال');
    const row={answer:txt.slice(0,6000), status:draft?'draft':'submitted', submitted_at:draft?null:new Date().toISOString(), late:!draft&&riyadhNow().date>a.due_date};
    if(s) Object.assign(s,row); else D.submissions.push({id:uid(), assignment_id:a.id, trainee_id, ...row}); this.save(); return {ok:true}; },
  _gradeStarted(a, s, extra){ const g=gradeQuiz(a, {...(s.answers||{}), ...(extra||{})}), now=new Date().toISOString();
    const n=s.attempt_no||1, best=s.best_score!=null&&s.best_score>g.score?s.best_score:g.score;
    Object.assign(s, {answer:'', answers:g.answers, review:g.review, status:'graded', score:best, feedback:`أجبت ${g.right} من ${g.total} إجابة صحيحة`+(n>1?` (المحاولة ${n}، وتُحتسب أعلى درجة)`:''), submitted_at:now, graded_at:now, late:riyadhNow().date>a.due_date}); this.save(); return g; },
  /* بدء الاختبار: مرة واحدة فقط؛ يبدأ العدّ من لحظة البدء (دقيقتان لكل سؤال) */
  async startQuiz({trainee_id, assignment_id, retry}){ await this._student(trainee_id); const D=this.data, a=D.assignments.find(x=>x.id===assignment_id);
    if(!a||a.kind!=='quiz'||!studentHasScope(D,trainee_id,a.section,a.subject)||a.publish_date>riyadhNow().date||(Array.isArray(a.targets)&&!a.targets.includes(trainee_id))) throw new Error('الواجب غير متاح لك');
    let s=D.submissions.find(x=>x.assignment_id===a.id&&x.trainee_id===trainee_id); if(s&&retry&&attemptsLeft(a,s)>0){ const at=new Date().toISOString(); // محاولة جديدة ضمن حد المدرب: تُحفظ أعلى درجة ويبدأ العدّ من جديد
      Object.assign(s,{best_score:Math.max(s.best_score??0, s.score??0), attempt_no:(s.attempt_no||1)+1, status:'draft', answers:{}, review:undefined, score:null, feedback:'', started_at:at, deadline:quizDeadline(at,a), submitted_at:null, graded_at:null}); this.save();
      return {started_at:s.started_at, deadline:s.deadline, status:'draft', attempt_no:s.attempt_no}; }
    if(s) return {started_at:s.started_at, deadline:s.deadline, status:s.status, again:true};
    const at=new Date().toISOString(); s={id:uid(), assignment_id:a.id, trainee_id, answer:'', answers:{}, status:'draft', started_at:at, deadline:quizDeadline(at, a), late:false}; D.submissions.push(s); this.save();
    return {started_at:s.started_at, deadline:s.deadline, status:'draft'}; },
  async saveQuizAnswer({trainee_id, assignment_id, question_id, value}){ await this._student(trainee_id); const D=this.data, a=D.assignments.find(x=>x.id===assignment_id), s=D.submissions.find(x=>x.assignment_id===assignment_id&&x.trainee_id===trainee_id);
    if(!a||!s||!quizOpen(s)) throw new Error('انتهى وقت الاختبار'); if(!a.quiz.some(q=>q.id===question_id)||![0,1,2,3].includes(+value)) throw new Error('إجابة غير صالحة');
    s.answers={...(s.answers||{}), [question_id]:+value}; this.save(); return {ok:true}; },
  /* تصحيح ما انتهى وقته ولم يُسلَّم (في السحابة: مهمة مجدولة كل دقيقة) */
  finalizeExpiredQuizzes(){ const D=this.data, now=Date.now(); let n=0; (D.submissions||[]).forEach(s=>{ if(s.status==='draft'&&s.deadline&&now>Date.parse(s.deadline)+20000){ const a=(D.assignments||[]).find(x=>x.id===s.assignment_id); if(a?.kind==='quiz'){ this._gradeStarted(a, s, null); n++; } } }); return n; },
  /* ملف المدرب: يعدّل نبذته ورابط قناته وصورته فقط */
  async saveMyProfile(p){ const me=await this._me(), x=checkProfile(p); Object.assign(me, x); this.audit('teacher.profile', me.id); this.save(); return {ok:true}; },
  /* مجموعات المدرب المحفوظة: من متدربيه فقط */
  /* الحسابات التجريبية (البند 13) ↔ admin_create_test_trainee / admin_purge_test_trainee */
  async createTestTrainee(f){ await this._role('full'); const D=this.data, pl=(D.plans||[]).find(p=>p.id===f.plan_id&&p.mode!=='remote'); if(!pl) throw new Error('اختر باقة حضورية');
    let nid; do { nid='1'+String(Math.floor(Math.random()*1e9)).padStart(9,'0'); } while(validSaudiId(nid)||D.trainees.some(t=>t.national_id===nid));
    let ph=String(f.phone||'').trim().replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)); const used=x=>D.trainees.some(t=>t.phone===x||t.guardian_phone===x)||(D.teachers||[]).some(t=>t.phone===x);
    if(!ph){ do { ph='05000'+String(Math.floor(Math.random()*1e5)).padStart(5,'0'); } while(used(ph)); }
    else if(!/^05\d{8}$/.test(ph)) throw new Error('رقم الجوال غير صحيح'); else if(D.trainees.some(t=>(t.phone===ph||t.guardian_phone===ph)&&!t.is_test)||(D.teachers||[]).some(t=>t.phone===ph)) throw new Error('هذا الجوال لحساب حقيقي؛ اختر جوالًا اصطناعيًا');
    let name=String(f.full_name||'').trim(); if(name.length<5) name='متدرب تجريبي '+Date.now().toString().slice(-4); if(!name.includes('تجريبي')) name+=' (تجريبي)';
    const g=f.gender==='أنثى'?'أنثى':'ذكر', today=riyadhNow().date, t={id:uid(), national_id:nid, full_name:name, phone:ph, gender:g, email:'', birth_date:'', city:'', education:'', employer:'', is_test:true, created_at:new Date().toISOString()};
    D.trainees.push(t); D.subscriptions.push({id:uid(), ref:'SQ-T'+String(Math.floor(Math.random()*1e6)).padStart(6,'0'), trainee_id:t.id, plan_id:pl.id, section:g==='أنثى'?'girls':'boys', subjects:[...(pl.subjects||[])], status:'active', start_date:today, end_date:subEnd(pl,today), start_manual:true, created_at:new Date().toISOString()});
    this.audit('trainees.insert', t.id, {after:{is_test:true}}); this.save(); return {ok:true, id:t.id, national_id:nid, phone:ph, full_name:name}; },
  async purgeTestTrainee(id){ await this._role('full'); const D=this.data, t=D.trainees.find(x=>x.id===id); if(!t||!t.is_test) throw new Error('تُزال الحسابات التجريبية وحدها');
    if((D.orders||[]).some(o=>o.trainee_id===id)||(D.invoices||[]).some(i=>i.trainee_id===id)||(D.enrollments||[]).some(e=>e.trainee_id===id)) throw new Error('للحساب سجلات مالية أو تسجيل في دفعة؛ لا يُزال');
    const sids=(D.subscriptions||[]).filter(s=>s.trainee_id===id).map(s=>s.id);
    D.sub_attendance=(D.sub_attendance||[]).filter(a=>!sids.includes(a.subscription_id)); ['submissions','attempts','messages','ratings','notifications','guardian_links','profile_change_requests','program_requests'].forEach(k=>{ if(D[k]) D[k]=D[k].filter(x=>x.trainee_id!==id); });
    D.subscriptions=D.subscriptions.filter(s=>s.trainee_id!==id); D.trainees=D.trainees.filter(x=>x.id!==id); this.audit('trainees.delete', id, {before:{is_test:true}}); this.save(); return {ok:true}; },
  /* استوديو البث (الخطوة AZ) ↔ teacher_save_lecture / teacher_set_lecture / admin_lectures */
  async saveLecture(f){ const me=await this._me(), D=this.data; D.lectures=D.lectures||[]; const mine=(D.cohorts||[]).filter(c=>c.teacher_id===me.id).map(c=>c.id), x=checkLecture(f, me, mine);
    if(f.id){ const l=D.lectures.find(y=>y.id===f.id&&y.teacher_id===me.id&&y.status!=='cancelled'); if(!l) throw new Error('المحاضرة غير موجودة أو ملغاة'); Object.assign(l, x, {section:x.cohort_id?'all':me.section, updated_at:new Date().toISOString()}); this.audit('lectures.update', l.id); this.save(); return {ok:true, id:l.id}; }
    const l={id:uid(), teacher_id:me.id, section:x.cohort_id?'all':me.section, ...x, status:'scheduled', created_at:new Date().toISOString()}; D.lectures.push(l); this.audit('lectures.insert', l.id); this.save(); return {ok:true, id:l.id}; },
  async setLectureStatus(id, status){ if(!['scheduled','ended','cancelled'].includes(status)) throw new Error('حالة غير صالحة'); const D=this.data, l=(D.lectures||[]).find(y=>y.id===id); if(!l) throw new Error('غير مصرح');
    let ok=await this.isAdmin().catch(()=>false); if(!ok){ const me=await this._me(); ok=l.teacher_id===me.id; } if(!ok) throw new Error('غير مصرح'); l.status=status; l.updated_at=new Date().toISOString(); this.audit('lectures.update', id, {after:{status}}); this.save(); return {ok:true}; },
  async adminLectures(){ const D=this.data; return (D.lectures||[]).map(l=>({...l, teacher_name:(D.teachers||[]).find(t=>t.id===l.teacher_id)?.full_name||'', program_name:(D.programs||[]).find(p=>p.id===(D.cohorts||[]).find(c=>c.id===l.cohort_id)?.program_id)?.name||null})).sort((a,b)=>b.starts_at.localeCompare(a.starts_at)); },
  async saveGroup(g){ const me=await this._me(), D=this.data, x=checkGroup(D, me, g); D.trainer_groups=D.trainer_groups||[];
    if(g.id){ const ex=D.trainer_groups.find(y=>y.id===g.id&&y.teacher_id===me.id); if(!ex) throw new Error('غير مصرح'); Object.assign(ex, x); }
    else { if(D.trainer_groups.filter(y=>y.teacher_id===me.id).length>=GROUPS_MAX) throw new Error(`الحد ${GROUPS_MAX} مجموعة`); D.trainer_groups.push({id:uid(), teacher_id:me.id, ...x, created_at:new Date().toISOString()}); }
    this.save(); return {ok:true}; },
  async deleteGroup(id){ const me=await this._me(), D=this.data, i=(D.trainer_groups||[]).findIndex(y=>y.id===id&&y.teacher_id===me.id); if(i<0) throw new Error('غير مصرح'); D.trainer_groups.splice(i,1); this.save(); return {ok:true}; },
  async saveQuestion(q){ const me=await this._me(); validateQuestion(q); if(!teacherCovers(me, me.section, q.subject)) throw new Error('المقرر خارج نطاقك');
    const L=this.data.questions, row={subject:q.subject, section:me.section, unit:String(q.unit||'').trim()||'عام', skill:String(q.skill||'').trim(), text:q.text.trim(), options:q.options.map(x=>String(x).trim()), correct:+q.correct, explanation:String(q.explanation||'').trim(), difficulty:q.difficulty||'متوسط', status:q.status==='published'?'published':'draft', category:catGuard(q.subject, q.category)};
    if(q.id){ const x=L.find(y=>y.id===q.id&&y.teacher_id===me.id); if(!x) throw new Error('غير مصرح'); Object.assign(x,row,{version:(x.version||1)+1}); }
    else L.push({id:uid(), teacher_id:me.id, version:1, created_at:new Date().toISOString(), ...row}); this.save(); return {ok:true}; },
  async setQuestionStatus(id, status){ const me=await this._me(), x=this.data.questions.find(y=>y.id===id&&y.teacher_id===me.id); if(!x) throw new Error('غير مصرح');
    if(!['draft','published','deleted'].includes(status)) throw new Error('حالة غير صالحة'); x.status=status; this.save(); return {ok:true}; },
  async startAttempt({trainee_id, section, subject, unit, count, teacher_id, category}){ await this._student(trainee_id); const D=this.data; if(!studentHasScope(D,trainee_id,section,subject)) throw new Error('هذا المقرر ليس ضمن اشتراكك');
    if(teacher_id&&!teacherCovers((D.teachers||[]).find(t=>t.id===teacher_id), section, subject)) throw new Error('هذا البنك ليس لمدرب مقررك');
    if(category&&!catOk(subject, category)) throw new Error('المهارة غير معروفة');
    const at=buildAttempt(D, trainee_id, section, subject, unit, count, teacher_id||null, category||''); (D.attempts=D.attempts||[]).push(at); this.save(); return attemptPublic(at); },
  /* المحاكي (↔ student_start_sim): محاكٍ مفتوح واحد يُستأنف، والمنتهي يُصحَّح بما حُفظ، وحد يومي */
  async startSim({trainee_id, subjects}){ await this._student(trainee_id); const D=this.data; D.attempts=D.attempts||[];
    const open=D.attempts.find(a=>a.trainee_id===trainee_id&&a.kind==='sim'&&!a.submitted_at);
    if(open){ if(simOpen(open)) return attemptPublic(open); Object.assign(open, gradeAttempt(open, open.answers)); }
    if(simsToday(D, trainee_id)>=SIM_DAILY_MAX) throw new Error(`وصلت الحد اليومي للمحاكي (${SIM_DAILY_MAX} محاولات)`);
    const subs=liveSubsOf(D, trainee_id), list=sortSubjects((subjects||[]).filter(Boolean)); if(!list.length) throw new Error('اختر مقررًا واحدًا على الأقل');
    const pools={}; let section=null;
    for(const s of list){ const sub=subs.find(x=>(x.subjects||[]).includes(s)); if(!sub) throw new Error('هذا المقرر ليس ضمن اشتراكك'); section=section||sub.section;
      pools[s]=(D.questions||[]).filter(q=>q.status==='published'&&q.subject===s&&(q.shared||(q.section===sub.section&&(D.teachers||[]).some(t=>t.id===q.teacher_id&&t.active!==false)))); }
    const at=buildSim(D, trainee_id, section, list, pools, D.settings, snapOf); D.attempts.push(at); this.save(); return attemptPublic(at); },
  async saveAttemptAnswers({attempt_id, answers}){ const D=this.data, at=(D.attempts||[]).find(x=>x.id===attempt_id); if(!at) throw new Error('المحاولة غير موجودة'); await this._student(at.trainee_id);
    if(at.submitted_at) throw new Error('سُلّمت المحاولة'); if(at.deadline&&!simOpen(at)) throw new Error('انتهى الوقت');
    at.answers={...(at.answers||{}), ...cleanAnswers(at, answers)}; this.save(); return {ok:true}; },
  async finishAttempt({attempt_id, answers}){ const D=this.data, at=(D.attempts||[]).find(x=>x.id===attempt_id); if(!at) throw new Error('المحاولة غير موجودة'); await this._student(at.trainee_id);
    if(at.submitted_at) return at; const late=at.deadline&&simExpired(at);   // بعد انتهاء الوقت يُصحَّح ما حُفظ فقط
    const g=gradeAttempt(at, {...(at.answers||{}), ...(late?{}:cleanAnswers(at, answers))}); Object.assign(at, g); this.save(); return at; },
  async rateTeacher({trainee_id, teacher_id, stars, items, comment}){ await this._student(trainee_id); const D=this.data, t=D.teachers.find(x=>x.id===teacher_id); const c=canRate(D, trainee_id, t); if(!c.ok) throw new Error(c.why);
    const st=Math.round(+stars); if(!(st>=1&&st<=5)) throw new Error('اختر من نجمة إلى خمس نجوم'); const per=period();
    const it=Object.fromEntries(Object.entries(items||{}).map(([k,v])=>[k, Math.min(5,Math.max(1,Math.round(+v)||st))]));
    const ex=(D.ratings=D.ratings||[]).find(r=>r.trainee_id===trainee_id&&r.teacher_id===teacher_id&&r.period===per);
    const row={stars:st, items:it, comment:String(comment||'').trim().slice(0,500), updated_at:new Date().toISOString()};
    if(ex) Object.assign(ex,row); else D.ratings.push({id:uid(), trainee_id, teacher_id, period:per, created_at:new Date().toISOString(), ...row}); this.save(); return {ok:true, updated:!!ex}; },
  async sendMessage({trainee_id, teacher_id, text}, role){ const D=this.data, body=validateMessage(text); let from;
    if(role==='teacher'){ const me=await this._me(); if(me.id!==teacher_id||!teacherTeaches(D,me,trainee_id)) throw new Error('المتدرب ليس ضمن متدربيك'); from='teacher'; }
    else { await this._student(trainee_id); const t=D.teachers.find(x=>x.id===teacher_id); if(!teacherTeaches(D,t,trainee_id)) throw new Error('المدرب لا يدرّسك'); from='student'; }
    (D.messages=D.messages||[]).push({id:uid(), trainee_id, teacher_id, from, text:body, at:new Date().toISOString(), read_at:null}); this.save(); return {ok:true}; },
  async markThreadRead({trainee_id, teacher_id}, role){ const s=await this.portalSession(role); if(!s) return; (this.data.messages||[]).forEach(m=>{ if(m.trainee_id===trainee_id&&m.teacher_id===teacher_id&&m.from!==role&&!m.read_at) m.read_at=new Date().toISOString(); }); this.save(); },
  async revokeGuardianLink(id){ const l=this.data.guardian_links.find(x=>x.id===id); if(l){ l.status='revoked'; l.revoked_at=new Date().toISOString(); this.audit('guardian_link.revoke', id); this.save(); } },
  /* بنوك أسئلة المدربين من الإدارة: إضافة وتعديل واستيراد لمدرب محدد، ضمن قسمه ومقرراته */
  _bankTeacher(id){ const t=(this.data.teachers||[]).find(x=>x.id===id); if(!t) throw new Error('اختر المدرب'); return t; },
  async adminSaveQuestion(q){ const t=this._bankTeacher(q.teacher_id); validateQuestion(q); if(!(t.subjects||[]).includes(q.subject)) throw new Error('المقرر ليس من مقررات المدرب');
    const L=(this.data.questions=this.data.questions||[]), row={teacher_id:t.id, section:t.section, subject:q.subject, unit:String(q.unit||'').trim()||'عام', skill:String(q.skill||'').trim(), text:q.text.trim(), options:q.options.map(x=>String(x).trim()), correct:+q.correct, explanation:String(q.explanation||'').trim(), difficulty:q.difficulty||'متوسط', status:q.status==='published'?'published':'draft', category:catGuard(q.subject, q.category)};
    if(q.id){ const x=L.find(y=>y.id===q.id); if(!x) throw new Error('السؤال غير موجود'); Object.assign(x,row,{version:(x.version||1)+1}); } else L.push({id:uid(), version:1, created_at:new Date().toISOString(), ...row});
    this.audit('question.save', q.id||'new', t.id); this.save(); return {ok:true}; },
  /* بيانات التعلم لمتدرب واحد (↔ admin_trainee_learning): للتقرير الأسبوعي في الإدارة */
  async traineeLearning(id){ const D=this.data, subs=(D.subscriptions||[]).filter(s=>s.trainee_id===id);
    const out={ attempts:(D.attempts||[]).filter(a=>a.trainee_id===id&&a.submitted_at), submissions:(D.submissions||[]).filter(x=>x.trainee_id===id),
      assignments:(D.assignments||[]).filter(a=>subs.some(s=>s.section===a.section&&(s.subjects||[]).includes(a.subject))) };
    return JSON.parse(JSON.stringify({ ...out, q_meta:qMetaOf(D, out) })); },
  /* تصنيف مهارة قياس لأسئلة مختارة (↔ admin_set_category) */
  async setQuestionCategory(ids, category){ const L=this.data.questions||[], c=category||''; const qs=L.filter(q=>(ids||[]).includes(q.id)&&q.status!=='deleted');
    if(!qs.length) throw new Error('اختر سؤالًا واحدًا على الأقل'); if(qs.some(q=>!catOk(q.subject, c))) throw new Error('التصنيف لا يناسب مقرر السؤال');
    qs.forEach(q=>{ q.category=c; }); this.audit('question.category', c||'-', String(qs.length)); this.save(); return {count:qs.length}; },
  /* استيراد بنك مشترك للمقرر (محتوى واحد يراه مدربا المقرر): يُضاف الجديد ويُحدَّث الموجود برمزه؛ تغيّر المفتاح يرفع الإصدار */
  /* اعتماد مفاتيح البنك المشترك (شرط الاختبار الرسمي): لمقرر كامل أو لوحدة منه */
  async approveKeys(subject, unit, approved=true){ const L=(this.data.questions||[]).filter(q=>q.shared&&q.subject===subject&&(!unit||q.unit===unit)&&q.status!=='deleted'); if(!L.length) throw new Error('لا أسئلة في هذا النطاق');
    const at=new Date().toISOString(); L.forEach(q=>{ q.key_status=approved?'approved':'unverified'; q.key_approved_at=approved?at:null; }); this.audit('bank.keys_'+(approved?'approved':'unapproved'), subject, {unit:unit||null, count:L.length}); this.save(); return {count:L.length}; },
  async importSharedBank(bundle){ const b=normalizeBundle(bundle), L=(this.data.questions=this.data.questions||[]), at=new Date().toISOString(); let added=0, updated=0;
    for(const q of b.questions){ const row={shared:true, teacher_id:null, section:'all', subject:b.subject, unit:q.unit, skill:q.skill, order:q.order, text:q.text, image:q.image, page_image:q.page_image, options:[...LETTERS], correct:q.correct, explanation:'', difficulty:q.difficulty, key_status:q.key_status, key_source:q.key_source, status:q.status};
      const x=L.find(y=>y.shared && y.code===q.code);
      if(x){ const v=(x.version||1)+(x.correct!==q.correct?1:0); Object.assign(x,row,{version:v}); updated++; } else { L.push({id:uid(), code:q.code, ...row, version:1, created_at:at}); added++; } }
    this.audit('bank.shared_import', b.subject, {added, updated}); this.save(); return {added, updated}; },
  async adminQuestionStatus(id, status){ const x=(this.data.questions||[]).find(y=>y.id===id); if(!x) throw new Error('السؤال غير موجود'); if(!['draft','published','deleted'].includes(status)) throw new Error('حالة غير صالحة'); x.status=status; this.audit('question.status', id, status); this.save(); return {ok:true}; },
  async adminImportQuestions(teacher_id, rows, status){ const t=this._bankTeacher(teacher_id); if(!Array.isArray(rows)||!rows.length) throw new Error('لا توجد أسئلة صالحة للاستيراد'); if(rows.length>2000) throw new Error('الحد 2000 سؤال في المرة الواحدة');
    rows.forEach((q,i)=>{ try { validateQuestion(q); } catch(e){ throw new Error(`السطر ${i+1}: ${e.message}`); } if(!(t.subjects||[]).includes(q.subject)) throw new Error(`السطر ${i+1}: المقرر ليس من مقررات المدرب`); });
    const L=(this.data.questions=this.data.questions||[]), at=new Date().toISOString(), st=status==='draft'?'draft':'published';
    const same=q=>L.some(x=>x.teacher_id===t.id&&x.status!=='deleted'&&x.subject===q.subject&&x.text.trim()===q.text.trim()), fresh=[];   // لا تكرار: السؤال الموجود بنصه في بنك المدرب نفسه يُتخطى
    rows.forEach(q=>{ if(!same(q)&&!fresh.some(y=>y.subject===q.subject&&y.text.trim()===q.text.trim())) fresh.push(q); }); const skipped=rows.length-fresh.length; rows=fresh;
    rows.forEach(q=>L.push({id:uid(), teacher_id:t.id, section:t.section, subject:q.subject, unit:String(q.unit||'').trim()||'عام', skill:String(q.skill||'').trim(), text:q.text.trim(), options:q.options.map(x=>String(x).trim()), correct:+q.correct, explanation:String(q.explanation||'').trim(), difficulty:q.difficulty||'متوسط', status:st, version:1, created_at:at}));
    this.audit('question.import', t.id, String(rows.length)); this.save(); return {count:rows.length, skipped}; },
  audit(action, entity, detail){ (this.data.audit_logs=this.data.audit_logs||[]).push({id:uid(), at:new Date().toISOString(), actor:'demo-admin', actor_role:'owner', actor_name:'مدير النظام', action, entity:String(entity), detail:detail&&typeof detail==='object'?{before:auditRedact(detail.before), after:auditRedact(detail.after??(detail.before?undefined:detail))}:detail||null}); if(this.data.audit_logs.length>5000) this.data.audit_logs.shift(); },
  async resetDemo(){ this.data = makeDemo(); this.autoArchive(); this.save(); },
  async clearPeople(){ const D=this.data; D.trainees=[]; D.enrollments=[]; D.attendance=[]; D.cohorts=[]; D.certificates=[]; D.subscriptions=[]; D.sub_attendance=[]; D.checkin_attempts=[]; this.save(); }
};

/* ---------------- Supabase: نفس الواجهة عبر دوال آمنة وجداول محمية بالصلاحيات ---------------- */
export const CloudStore = {
  mode:'cloud', sb:null,
  init(){ const h=location.hash||'';   // رابط من بريد Supabase (دعوة، تأكيد، استعادة) يحمل الجلسة في الجزء بعد #؛ يُلتقط قبل أن تقرأه المكتبة
    if(/access_token=|error_description=|[#&]type=(invite|recovery|signup|magiclink)/.test(h)){ const q=new URLSearchParams(h.replace(/^#/,'')); this.authEvent={type:q.get('type')||'', error:q.get('error_description')||''}; }
    // جلسة لوحة الإدارة محفوظة منفصلة عن جلسات البوابات في المتصفح نفسه، فلا تحلّ إحداهما محل الأخرى
    this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, PAGE==='admin' ? {auth:{storageKey:'sama-admin-auth'}} : undefined); },
  async authReady(){ const {data:{session}}=await this.sb.auth.getSession(); if(session) await this.sb.rpc('claim_admin'); return !!session; },
  async mustChangePassword(){ const {data:{session}}=await this.sb.auth.getSession(); return !!session?.user?.user_metadata?.must_change_password; },
  async setPassword(p){ if(String(p||'').length<8) throw new Error('كلمة المرور 8 أحرف على الأقل'); const r=await this.sb.auth.updateUser({password:p, data:{must_change_password:false}}); if(r.error) throw new Error(/same|different/i.test(r.error.message)?'اختر كلمة مرور مختلفة عن المؤقتة':'تعذّر حفظ كلمة المرور: '+r.error.message); await this.sb.rpc('claim_admin'); return true; },
  _e(r){ if(r.error){ const m=r.error.message||'', c=r.error.code||'';
      if(c==='23505'||/duplicate key/.test(m)) throw new Error(/teachers_phone/.test(m)?'رقم الجوال مستخدم لمدرب آخر':/teachers_national_id/.test(m)?'رقم الهوية مستخدم لمدرب آخر':/national_id/.test(m)?'رقم الهوية مسجّل مسبقًا':'هذا السجل موجود مسبقًا');
      if(c==='23514'||/check constraint/.test(m)) throw new Error('إحدى القيم المدخلة غير صالحة؛ راجع الجوال ورقم الهوية والحقول المطلوبة');
      if(/row-level security/.test(m)) throw new Error('غير مصرح بهذه العملية؛ سجّل الدخول كمسؤول');
      throw new Error(/foreign key/.test(m) ? 'لا يمكن الحذف: توجد سجلات حضور أو شهادات مرتبطة. استخدم الإلغاء أو الأرشفة.' : m); } return r.data; },
  async catalog(){ const d=this._e(await this.sb.rpc('public_catalog')); return {programs:d.programs||[], packages:d.packages||[]}; },
  async publicProgram(code){ return this._e(await this.sb.rpc('public_program',{p_code:code})); },
  async setPublish(id, state, expected){ return this._e(await this.sb.rpc('admin_set_publish',{p_program:id, p_state:state||null, p_expected:expected||null})); },
  async publicSettings(){ return this._e(await this.sb.rpc('public_settings')) || {}; },
  async register(f){ return this._e(await this.sb.rpc('register_trainee',{p:f})); },
  async placeRequests(ids){ return this._e(await this.sb.rpc('admin_place_requests',{p_ids:ids})); },
  async cancelRequest(id, reason){ return this._e(await this.sb.rpc('admin_cancel_request',{p_id:id, p_reason:reason})); },
  async checkin(nid, code, programCode, opts={}){ return this._e(await this.sb.rpc('checkin',{p_nid:nid, p_code:code||null, p_program:programCode||null, p_device:opts.device||'', p_choice:opts.choice||null})); },
  async todayCode(){ return this._e(await this.sb.rpc('daily_code')); },
  async isAdmin(){ const {data:{session}} = await this.sb.auth.getSession(); if(!session) return false; return !!(await this.adminMe()); },
  async adminMe(){ const r=await this.sb.rpc('admin_me'); return r.error?null:(r.data||null); },
  async reauth(pass){ const {data:{session}}=await this.sb.auth.getSession(); const r=await this.sb.auth.signInWithPassword({email:session?.user?.email||'', password:pass}); if(r.error) throw new Error('كلمة المرور غير صحيحة'); return true; },
  async setAdminRole(id, role, reason){ return this._e(await this.sb.rpc('admin_set_role',{p_id:id, p_role:role, p_reason:String(reason||'').trim()})); },
  async setAdminActive(id, active, reason=''){ return this._e(await this.sb.rpc('admin_set_active',{p_id:id, p_active:!!active, p_reason:reason})); },
  async adminAudit(f={}){ return this._e(await this.sb.rpc('admin_audit',{p:f})); },
  async login(email, pass){ const r=await this.sb.auth.signInWithPassword({email,password:pass}); if(r.error) throw new Error('بيانات الدخول غير صحيحة'); await this.sb.rpc('claim_admin'); if(!(await this.isAdmin())){ await this.sb.auth.signOut(); throw new Error('هذا الحساب ليس مديرًا للنظام'); } return true; },
  async logout(){ await this.sb.auth.signOut({scope:'local'}); },   // هذا الجهاز فقط
  async logoutAll(){ await this.sb.auth.signOut({scope:'global'}); },   // كل أجهزة الحساب (عند فقد جهاز)
  async changePassword(cur, next){ if(String(next||'').length<8) throw new Error('كلمة المرور الجديدة 8 أحرف على الأقل'); if(cur===next) throw new Error('اختر كلمة مرور مختلفة عن الحالية');
    await this.reauth(cur); return this.setPassword(next); },
  async requestPasswordReset(email){ const e=String(email||'').trim().toLowerCase(); if(!/^\S+@\S+\.\S+$/.test(e)) throw new Error('اكتب بريدك الإلكتروني');
    try{ await this.sb.auth.resetPasswordForEmail(e,{redirectTo:adminBase()}); }catch(x){} return {ok:true}; },   // رد واحد سواء وُجد الحساب أم لا
  async resetAdminPassword(id){ const {data, error}=await this.sb.functions.invoke('admin-invite',{body:{action:'reset_password', user_id:id}});
    if(error){ let m=''; try{ m=(await error.context.json()).error||''; }catch(e){} throw new Error(m||'تعذّرت إعادة التعيين؛ حاول مرة أخرى'); } return data; },
  async adminData(){
    await this.sb.rpc('archive_ended_cohorts');
    const since = addDays(riyadhNow().date,-400), q=(t,f)=>f(this.sb.from(t).select('*'));
    const [p,k,t,c,e,a,s,ce,pt,pl,tp,ex,su,sa,at,cr,te,gl,nt,dr,po,pa,pcr,qs,ord,oev,inv,prq] = await Promise.all([
      q('programs',x=>x.order('created_at')), q('packages',x=>x), q('trainees',x=>x.limit(10000)), q('cohorts',x=>x),
      q('enrollments',x=>x.limit(20000)), q('attendance',x=>x.gte('att_date',since).limit(50000)), this.sb.from('settings').select('*').eq('id',1).single(), q('certificates',x=>x.limit(20000)), q('partners',x=>x.order('sort_order')),
      q('plans',x=>x.order('sort')), q('schedule_templates',x=>x), q('schedule_exceptions',x=>x.gte('date',since)), q('subscriptions',x=>x.limit(20000)),
      q('sub_attendance',x=>x.gte('att_date',since).limit(100000)), q('checkin_attempts',x=>x.gte('date',addDays(riyadhNow().date,-30)).limit(20000)), q('custom_requests',x=>x.order('created_at',{ascending:false}).limit(500)),
      q('teachers',x=>x.order('full_name')), q('guardian_links',x=>x), q('notifications',x=>x.gte('date',addDays(riyadhNow().date,-30)).limit(5000)), q('daily_reports',x=>x.gte('date',addDays(riyadhNow().date,-60)).order('date',{ascending:false})), q('policies',x=>x.order('created_at')), q('policy_acceptances',x=>x.limit(50000)), q('profile_change_requests',x=>x.order('created_at',{ascending:false}).limit(500)), q('questions',x=>x.neq('status','deleted').limit(20000)), q('orders',x=>x.order('created_at',{ascending:false}).limit(5000)), q('order_events',x=>x.order('at').limit(50000)), q('invoices',x=>x.order('created_at',{ascending:false}).limit(20000)), q('program_requests',x=>x.order('created_at').limit(5000))]);
    const hm = v => String(v||'').slice(0,5), tm = r => ({...r, time:new Date(r.checkin_at).toLocaleTimeString('en-GB',{timeZone:'Asia/Riyadh',hour12:false})});
    const att=this._e(a).map(x=>({...x, time:new Date(x.checkin_at).toLocaleTimeString('en-GB',{timeZone:'Asia/Riyadh',hour12:false})}));
    return {programs:this._e(p), packages:this._e(k), trainees:this._e(t), cohorts:this._e(c), enrollments:this._e(e), attendance:att, settings:this._e(s), certificates:this._e(ce), partners:this._e(pt).map(x=>({...x, order:x.sort_order})),
      plans:this._e(pl), schedule_templates:this._e(tp).map(x=>({...x, start:hm(x.start_time), end:hm(x.end_time)})), schedule_exceptions:this._e(ex).map(x=>({...x, start:hm(x.start_time), end:hm(x.end_time)})),
      subscriptions:this._e(su), sub_attendance:this._e(sa).map(tm), checkin_attempts:this._e(at).map(x=>({...x, trainee_hint:x.trainee_hint})), custom_requests:this._e(cr), audit_logs:[], teachers:this._e(te), guardian_links:this._e(gl), notifications:this._e(nt), assignments:[], submissions:[], daily_reports:this._e(dr), policies:this._e(po), policy_acceptances:this._e(pa), profile_change_requests:this._e(pcr), questions:this._e(qs), orders:this._e(ord).map(o=>({...o, events:this._e(oev).filter(e=>e.order_id===o.id)})), invoices:this._e(inv).map(i=>({...i, total:+i.total, paid:+i.paid, remaining:+i.remaining, lines:(i.lines||[]).map(x=>({...x, amount:+x.amount}))})), program_requests:this._e(prq)};
  },
  _strip(o, keys){ const r={...o}; keys.forEach(k=>delete r[k]); return r; },
  async saveProgram(p){ const row=this._strip(p,['id','created_at','cohort']); if(!row.code) row.code = p.accreditation_no ? 'p'+p.accreditation_no : 'px'+Math.random().toString(36).slice(2,8); this._e(p.id ? await this.sb.from('programs').update(row).eq('id',p.id) : await this.sb.from('programs').insert(row)); },
  async deleteProgram(id){ this._e(await this.sb.from('programs').delete().eq('id',id)); },
  async savePackage(p){ const row=this._strip(p,['id','created_at']); this._e(p.id ? await this.sb.from('packages').update(row).eq('id',p.id) : await this.sb.from('packages').insert(row)); },
  async deletePackage(id){ this._e(await this.sb.from('packages').delete().eq('id',id)); },
  async saveCohort(c){ const row=this._strip(c,['id','created_at','number','taken']); if(c.id){ this._e(await this.sb.from('cohorts').update(row).eq('id',c.id)); } else { const r=this._e(await this.sb.rpc('open_cohort',{p:row})); if(c.teacher_id&&r?.id) this._e(await this.sb.from('cohorts').update({teacher_id:c.teacher_id}).eq('id',r.id)); } },
  async archiveCohort(id){ this._e(await this.sb.from('cohorts').update({archived_at:new Date().toISOString(), archived_auto:false, reg_open:false}).eq('id',id)); await this.sb.rpc('issue_certificates',{p_cohort:id}); },
  async issueCertificates(cid){ return this._e(await this.sb.rpc('issue_certificates',{p_cohort:cid})); },
  async revokeCertificate(id, on=true){ this._e(await this.sb.from('certificates').update({revoked:on}).eq('id',id)); },
  async verifyCertificate(serial){ return this._e(await this.sb.rpc('verify_certificate',{p_serial:serial})); },
  async myAttendance(nid){ return this._e(await this.sb.rpc('my_attendance',{p_nid:nid})); },
  async deleteCohort(id){ this._e(await this.sb.from('cohorts').delete().eq('id',id)); },
  async setEnrollmentStatus(id, status){ this._e(await this.sb.from('enrollments').update({status}).eq('id',id)); },
  async deleteEnrollment(id){ this._e(await this.sb.from('enrollments').delete().eq('id',id)); },
  async setAttendance(enrollment_id, date, status){ this._e(await this.sb.rpc('set_attendance',{p_enrollment:enrollment_id, p_date:date, p_status:status})); },
  async deleteTrainee(id){ this._e(await this.sb.from('trainees').delete().eq('id',id)); },
  async publicSite(){ const d=this._e(await this.sb.rpc('public_site'))||{}; return { about:d.about||DEFAULT_ABOUT, partners:(d.partners||[]).map(p=>({...p, order:p.sort_order})) }; },
  async savePartner(p){ const {id,order,created_at,...row}=p; row.sort_order=order||0; this._e(id ? await this.sb.from('partners').update(row).eq('id',id) : await this.sb.from('partners').insert(row)); },
  async deletePartner(id){ this._e(await this.sb.from('partners').delete().eq('id',id)); },
  async saveSettings(s){ const {admin_pin,...rest}=s; const d=this._e(await this.sb.from('settings').update(rest).eq('id',1).select('id')); if(!d||!d.length) throw new Error('تعديل الإعدادات لمدير النظام فقط'); },
  /* ---- باقات القدرات والتحصيلي ---- */
  async publicPlans(){ const d=this._e(await this.sb.rpc('public_plans'))||{}; return {plans:d.plans||[], schedule:d.schedule||[]}; },
  async registerSubscription(f){ return this._e(await this.sb.rpc('register_subscription',{p:f})); },
  async savePlan(p){ const row=this._strip(p,['id','created_at']); this._e(p.id ? await this.sb.from('plans').update(row).eq('id',p.id) : await this.sb.from('plans').insert(row)); },
  async saveTemplates(section, rows){ this._e(await this.sb.rpc('save_templates',{p_section:section, p_rows:rows})); },
  async saveException(x){ const row={date:x.date, section:x.section, type:x.type, start_time:x.start||null, end_time:x.end||null, note:x.note||''}; this._e(x.id ? await this.sb.from('schedule_exceptions').update(row).eq('id',x.id) : await this.sb.from('schedule_exceptions').insert(row)); },
  async deleteException(id){ this._e(await this.sb.from('schedule_exceptions').delete().eq('id',id)); },
  async saveSubscription(f){ return this._e(await this.sb.rpc('admin_save_subscription',{p:{...f, plan:undefined}})); },
  async cancelSubscription(id, on=true){ const s=this._e(await this.sb.from('subscriptions').select('start_date').eq('id',id).single()); this._e(await this.sb.from('subscriptions').update({status: on?'cancelled':(s.start_date?'active':'pending')}).eq('id',id)); },
  async setSubAttendance(subscription_id, date, status){ this._e(await this.sb.rpc('set_sub_attendance',{p_sub:subscription_id, p_date:date, p_status:status})); },
  async requestCustomPlan(f){ return this._e(await this.sb.rpc('request_custom_plan',{p:f})); },
  async setCustomRequestStatus(id, status){ this._e(await this.sb.from('custom_requests').update({status}).eq('id',id)); },
  /* ---- البوابات: Supabase Auth برقم الجوال ورمز SMS، والصلاحية من portal_roles() على الخادم ---- */
  _e164(phone){ return '+966' + normPhone(phone).slice(1); },
  async requestOtp(ident, role){ let {data:{session}}=await this.sb.auth.getSession(); if(!session){ const r=await this.sb.auth.signInAnonymously(); if(r.error) throw new Error('تعذّر بدء الجلسة. حاول بعد قليل.'); session=r.data.session; }
    const r=this._e(await this.sb.rpc('request_login',{p_ident:String(ident), p_role:role})) || {}; return {activation:true, open:!!r.open, code:r.code||null}; },   // الرمز يعود لهذه الجلسة وحدها عند فتح التفعيل
  async portalLogin(phone, code, role){
    { const r=this._e(await this.sb.rpc('activate_device',{p_phone:String(phone).replace(/\D/g,''), p_code:String(code), p_role:role})); if(r && r.ok===false) throw new Error(r.error||ACT_FAIL); }
    const roles=this._e(await this.sb.rpc('portal_roles'))||[]; if(!roles.includes(role)){ await this.sb.auth.signOut(); throw new Error(`هذا الرقم غير مرتبط بحساب ${ROLE_TXT[role]}. راجع إدارة المعهد.`); } return {ok:true};
  },
  async portalSession(role){ const {data:{session}}=await this.sb.auth.getSession(); if(!session) return null; const r=await this.sb.rpc('portal_roles'); if(!(r.data||[]).includes(role)) return null; const ph=await this.sb.rpc('my_phone'); return {phone:normPhone(ph.data||session.user.phone||''), role}; },
  async openActivation(phone, role, minutes=15){ return this._e(await this.sb.rpc('admin_open_activation',{p_phone:normPhone(phone), p_role:role, p_minutes:+minutes})); },
  async openActivationBulk(role, phones, minutes=1440){ return this._e(await this.sb.rpc('admin_open_activation_bulk',{p_role:role, p_phones:[...new Set((phones||[]).map(normPhone))], p_minutes:+minutes})); },
  async closeActivation(phone, role){ return this._e(await this.sb.rpc('admin_close_activation',{p_phone:normPhone(phone), p_role:role})); },
  async revokeDevices(phone, role){ return this._e(await this.sb.rpc('admin_revoke_devices',{p_phone:normPhone(phone), p_role:role})); },
  async accessData(){ const r=this._e(await this.sb.rpc('admin_access_status'))||{}; return {devices:r.devices||[], windows:r.windows||[], requests:r.requests||[]}; },
  async listAdmins(){ return this._e(await this.sb.rpc('admin_list')); },
  async addAdmin(email, name, role='staff'){   // دالة الخادم admin-invite: تسجّل الدعوة بصلاحيات المتصل ثم ترسل البريد أو تنشئ كلمة مرور مؤقتة
    const {data, error}=await this.sb.functions.invoke('admin-invite',{body:{email:String(email||'').trim().toLowerCase(), name:String(name||'').trim(), role, redirect:adminBase()}});
    if(error){ let m=''; try{ m=(await error.context.json()).error||''; }catch(e){} throw new Error(m||'تعذّر إرسال الدعوة؛ حاول مرة أخرى'); }
    return {...data, pending:data?.mode!=='existing'}; },
  async removeAdmin(id){ return this._e(await this.sb.rpc('admin_remove',{p_id:id})); },
  /* إنشاء حساب مسؤول مدعوّ: يسجّل ببريده وكلمة مرور يختارها، ثم يُمنح الصلاحية إن كان بريده في قائمة المدعوين */
  async adminSignup(email, pass){ const r=await this.sb.auth.signUp({email, password:pass, options:{emailRedirectTo:adminBase()+'#admin'}}); if(r.error) throw new Error(r.error.message.includes('registered')?'هذا البريد له حساب؛ ادخل بكلمة مرورك':'تعذّر إنشاء الحساب: '+r.error.message);
    if(!r.data.session) return {confirm:true}; const c=await this.sb.rpc('claim_admin'); if(c.error||!c.data) { await this.sb.auth.signOut(); throw new Error('هذا البريد غير مدعوّ كمسؤول. اطلب من مدير النظام إضافتك.'); } return {ok:true}; },
  async portalLogout(){ try{ await this.sb.rpc('device_logout'); }catch(e){} await this.sb.auth.signOut({scope:'local'}); },
  async portalData(role){ return this._e(await this.sb.rpc('portal_data',{p_role:role})); },
  async portalCheckin(traineeId, code, opts={}){ return this._e(await this.sb.rpc('portal_checkin',{p_trainee:traineeId, p_code:code||null, p_device:opts.device||'portal', p_choice:opts.choice||null})); },
  async teacherNotify(p){ return this._e(await this.sb.rpc('teacher_notify',{p})); },
  runReminders(){ return 0; },   // في السحابة: run_session_reminders() عبر pg_cron كل دقيقة
  async inboxState(role){ return this._e(await this.sb.rpc('portal_inbox',{p_role:role})) || {items:[], unread:0}; },
  async adminNotify(f){ return this._e(await this.sb.rpc('admin_notify',{p:f})); },
  async resolveProfileChange(id, approve){ return this._e(await this.sb.rpc('resolve_profile_change',{p_id:id, p_approve:!!approve})); },
  async publicPolicies(){ return this._e(await this.sb.rpc('public_policies'))||[]; },
  async savePolicy(p){ validatePolicy(p, false); const row={slug:p.slug, title:p.title.trim(), body:String(p.body).trim(), effective_date:p.effective_date, approved_by:String(p.approved_by||'').trim(), requires_acceptance:!!p.requires_acceptance};
    const r=this._e(p.id ? await this.sb.from('policies').update(row).eq('id',p.id).eq('status','draft').select('id') : await this.sb.from('policies').insert({...row, status:'draft', version:0}).select('id'));
    if(!r||!r.length) throw new Error('النسخة المنشورة لا تُعدَّل؛ أنشئ إصدارًا جديدًا'); return {ok:true, id:r[0].id}; },
  async publishPolicy(id){ return this._e(await this.sb.rpc('publish_policy',{p_id:id})); },
  async deletePolicyDraft(id){ this._e(await this.sb.from('policies').delete().eq('id',id).eq('status','draft')); return {ok:true}; },
  async markRead(role){ await this.sb.rpc('mark_read',{p_role:role}); },
  // التعليم: نفس توقيعات LocalStore، والتحقق من النطاق في دوال SQL
  async saveAssignment(a){ return this._e(await this.sb.rpc('teacher_save_assignment',{p:a})); },
  async gradeSubmission(id, g){ return this._e(await this.sb.rpc('teacher_grade',{p_id:id, p:g})); },
  async commentSubmission(id, f){ return this._e(await this.sb.rpc('teacher_comment',{p_id:id, p:f})); },
  async submitAssignment(p){ return this._e(await this.sb.rpc('student_submit',{p})); },
  async saveMyProfile(p){ return this._e(await this.sb.rpc('teacher_save_profile',{p:checkProfile(p)})); },
  async createTestTrainee(f){ return this._e(await this.sb.rpc('admin_create_test_trainee',{p:{full_name:f.full_name||'', gender:f.gender||'ذكر', plan_id:f.plan_id, phone:f.phone||''}})); },
  async purgeTestTrainee(id){ return this._e(await this.sb.rpc('admin_purge_test_trainee',{p_id:id})); },
  async saveLecture(f){ const {id, title, minutes, starts_at, youtube, subject, cohort_id, recording}=f; const yt=ytId(youtube); if(yt===null) throw new Error('رابط يوتيوب غير صحيح');
    return this._e(await this.sb.rpc('teacher_save_lecture',{p:{id:id||null, title, minutes:+minutes, starts_at:new Date(starts_at).toISOString(), youtube_id:yt||'', subject:cohort_id?null:subject, cohort_id:cohort_id||null, recording:recording!==false}})); },
  async setLectureStatus(id, status){ return this._e(await this.sb.rpc('teacher_set_lecture',{p_id:id, p_status:status})); },
  async adminLectures(){ return this._e(await this.sb.rpc('admin_lectures'))||[]; },
  async saveGroup(g){ return this._e(await this.sb.rpc('teacher_save_group',{p:{id:g.id||null, name:String(g.name||'').trim(), trainee_ids:g.trainee_ids||[]}})); },
  async deleteGroup(id){ return this._e(await this.sb.rpc('teacher_delete_group',{p_id:id})); },
  async startQuiz(f){ return this._e(await this.sb.rpc('student_start_quiz',{p:f})); },
  async saveQuizAnswer(f){ return this._e(await this.sb.rpc('student_save_quiz_answer',{p:f})); },
  async saveQuestion(q){ return this._e(await this.sb.rpc('teacher_save_question',{p:q})); },
  async adminSaveQuestion(q){ return this._e(await this.sb.rpc('admin_save_question',{p:q})); },
  async adminQuestionStatus(id, status){ this._e(await this.sb.rpc('admin_question_status',{p_id:id, p_status:status})); return {ok:true}; },
  async approveKeys(subject, unit, approved=true){ return this._e(await this.sb.rpc('admin_approve_keys',{p_subject:subject, p_unit:unit||null, p_approved:approved})); },
  async importSharedBank(bundle){ return this._e(await this.sb.rpc('admin_import_shared_bank',{p:normalizeBundle(bundle)})); },
  async adminImportQuestions(teacher_id, rows, status){ return this._e(await this.sb.rpc('admin_import_questions',{p_teacher:teacher_id, p_rows:rows, p_status:status==='draft'?'draft':'published'})); },
  async setQuestionStatus(id, status){ this._e(await this.sb.rpc('teacher_question_status',{p_id:id, p_status:status})); return {ok:true}; },
  async startAttempt(p){ return this._e(await this.sb.rpc('student_start_attempt',{p})); },
  async finishAttempt({attempt_id, answers}){ return this._e(await this.sb.rpc('student_finish_attempt',{p_id:attempt_id, p_answers:answers||{}})); },
  async startSim(p){ return this._e(await this.sb.rpc('student_start_sim',{p})); },
  async saveAttemptAnswers({attempt_id, answers}){ return this._e(await this.sb.rpc('student_save_attempt',{p_id:attempt_id, p_answers:answers||{}})); },
  async setQuestionCategory(ids, category){ return this._e(await this.sb.rpc('admin_set_category',{p_ids:ids, p_category:category||''})); },
  async traineeLearning(id){ return this._e(await this.sb.rpc('admin_trainee_learning',{p_trainee:id})); },
  async rateTeacher(p){ return this._e(await this.sb.rpc('student_rate',{p})); },
  async sendMessage(p, role){ return this._e(await this.sb.rpc('send_message',{p, p_role:role})); },
  async markThreadRead({trainee_id, teacher_id}, role){ await this.sb.rpc('mark_thread_read',{p_trainee:trainee_id, p_teacher:teacher_id, p_role:role}); },
  async saveTeacher(t){ if(!/^05\d{8}$/.test(normPhone(t.phone))) throw new Error('رقم الجوال غير صحيح'); if(t.national_id && !/^[12]\d{9}$/.test(t.national_id)) throw new Error('رقم الهوية 10 أرقام');
    const row={full_name:t.full_name, phone:normPhone(t.phone), national_id:t.national_id||null, section:t.section, subjects:t.subjects, active:t.active!==false}; this._e(t.id ? await this.sb.from('teachers').update(row).eq('id',t.id) : await this.sb.from('teachers').insert(row)); },
  async orderReportTransfer(f){ return this._e(await this.sb.rpc('order_report_transfer',{p:f})); },
  async reviewOrder(id, decision, reason, expected_version){ return this._e(await this.sb.rpc('admin_review_order',{p_id:id, p_decision:decision, p_reason:reason||'', p_version:expected_version??null})); },
  async confirmOrderPayment(id, amount, confirmed=true, reason='', method='transfer'){ return this._e(await this.sb.rpc('admin_confirm_payment',{p_id:id, p_amount:+amount||0, p_confirmed:confirmed, p_reason:reason||'', p_method:method})); },
  async addOrderPayment(id, f){ return this._e(await this.sb.rpc('admin_add_payment',{p_id:id, p:f})); },
  async receivePayment(id, f){ return this._e(await this.sb.rpc('admin_receive_payment',{p_id:id, p:f})); },
  async changePlan(id, f){ return this._e(await this.sb.rpc('admin_change_plan',{p_id:id, p:f})); },
  async cancelOrder(id, reason){ return this._e(await this.sb.rpc('admin_cancel_order',{p_id:id, p_reason:String(reason||'')})); },
  async refundOrder(id, f){ return this._e(await this.sb.rpc('admin_refund',{p_id:id, p:f})); },
  async voidRefund(id, reason){ return this._e(await this.sb.rpc('admin_void_refund',{p_id:id, p_reason:String(reason||'')})); },
  async saveOrderMeta(id, f){ return this._e(await this.sb.rpc('admin_save_order_meta',{p_id:id, p:f})); },
  async saveTrainee(id, f){ return this._e(await this.sb.rpc('admin_save_trainee',{p_id:id, p:f})); },
  async resolveImportNote(id, idx, done=true){ return this._e(await this.sb.rpc('admin_resolve_import_note',{p_id:id, p_idx:idx, p_done:done})); },
  async importLegacy(rows){ if(!Array.isArray(rows)||!rows.length) throw new Error('لا صفوف للاستيراد؛ اختر الملف من جديد'); return this._e(await this.sb.rpc('admin_import_legacy',{p:rows})); },
  async attachReceipt(id, image){ return this._e(await this.sb.rpc('admin_attach_receipt',{p_id:id, p_image:image})); },
  async invoiceReceipt(id){ return this._e(await this.sb.rpc('admin_invoice_receipt',{p_id:id})); },
  async setOrderProvisional(id, on, reason){ return this._e(await this.sb.rpc('admin_order_provisional',{p_id:id, p_on:!!on, p_reason:reason||''})); },
  async saveBank(b){ return this._e(await this.sb.rpc('admin_save_bank',{p:b})); },
  async guardianSelfLink(national_id){ const r=this._e(await this.sb.rpc('guardian_self_link',{p_nid:String(national_id||'').trim()})); if(!r?.ok) throw new Error(LINK_FAIL); return r; },
  async saveGuardianLink(l){ const t=this._e(await this.sb.from('trainees').select('id').eq('national_id',l.national_id).maybeSingle()); if(!t) throw new Error('لا يوجد متدرب بهذا السجل المدني');
    const {data:{session}}=await this.sb.auth.getSession(); this._e(await this.sb.from('guardian_links').insert({guardian_name:l.guardian_name, guardian_phone:normPhone(l.guardian_phone), trainee_id:t.id, relation:l.relation, verified_by:session?.user?.id||null})); },
  async revokeGuardianLink(id){ this._e(await this.sb.from('guardian_links').update({status:'revoked', revoked_at:new Date().toISOString()}).eq('id',id)); },
  /* تقرير اليوم: يولّده الخادم عند 20:30 (pg_cron)، ويمكن للمسؤول التوليد أو إصدار مراجعة */
  async generateReport(date, kind='snapshot', note=''){ return this._e(await this.sb.rpc('generate_daily_report',{p_date:date, p_kind:kind, p_note:note})); },
  async setReportNote(id, note){ this._e(await this.sb.rpc('set_report_note',{p_id:id, p_note:note})); }
};

/* ---------------- بيانات تجريبية: البرامج حقيقية من دليل المركز، والدفعات والمتدربون والحضور تجريبيون ---------------- */
export function makeDemo(){
  const today = riyadhNow().date, rnd=(a,b)=>a+Math.floor(Math.random()*(b-a+1)), pick=a=>a[Math.floor(Math.random()*a.length)];
  const programs = catalogPrograms(); programs.forEach(p=>p.code=progCode(p));
  const cohorts=[], trainees=[], enrollments=[], attendance=[];
  const mkCohort=(p, number, off, days, st, seats)=>{ let s=addDays(today,off); while(!days.includes(dowOf(s))) s=addDays(s,1);
    const perDay=Math.max(2,Math.min(5,Math.round((p.hours||15)/(p.duration_days||3)))), h=+st.slice(0,2);
    const c={id:uid(), program_id:p.id, number, start_date:s, end_date:computeEnd(s,p.duration_days||3,days), days, start_time:st, end_time:String(h+perDay).padStart(2,'0')+st.slice(2),
      seats, hall:pick(['القاعة 1','القاعة 2','القاعة 3','معمل الحاسب']), trainer:'', reg_open:off>-3, archived_at:null, created_at:addDays(s,-14)+'T08:00:00Z'};
    cohorts.push(c); return c; };
  const W=[0,1,2,3,4];
  const plan=[ // [اسم البرنامج, [[إزاحة البداية بالأيام, أيام الانعقاد, وقت البداية], ...]]
    ['إدارة المشاريع الاحترافية PMP',[[-52,W,'16:00'],[-8,W,'16:00']]],
    ['مهارات استخدام الحاسب الآلي في الأعمال المكتبية',[[-24,W,'09:00']]],
    ['مهارات وكفايات مديري المشاريع',[[-12,W,'17:00']]],
    ['التهيئة لاختبارات الرخصة المهنية',[[-45,W,'16:00'],[-9,W,'16:00']]],
    ['الإعداد للاختبارات التحصيلية',[[-6,W,'17:00']]],
    ['مهارات الخياطة والتطريز',[[-30,W,'09:00']]],
    ['أساسيات الأمن السيبراني',[[-40,[0,1,2],'16:30'],[-21,[0,1,2],'16:30']]],
    ['تدريب المدربين TOT',[[-17,W,'16:00']]],
    ['التميز في خدمة العملاء',[[-35,[1,2,3],'10:00'],[-3,[1,2,3],'10:00']]],
    ['استراتيجيات الدفاع والحماية في الأمن السيبراني',[[-5,W,'16:00']]],
    ['الإرشاد الأسري',[[-1,W,'17:00']]],
    ['مهارات صياغة العقود',[[5,[0,1,2],'17:00']]],
    ['تطبيقات الذكاء الاصطناعي',[[8,[0,1,2],'16:00']]],
    ['فن التصوير الفوتوغرافي',[[12,[0,1,2,3],'16:00']]]
  ];
  plan.forEach(([name,list])=>{ const p=programs.find(x=>x.name===name); if(!p) return; list.forEach(([off,days,st],i)=>mkCohort(p,i+1,off,days,st,pick([20,25,30]))); });
  const fM=['محمد','أحمد','عبدالله','علي','حسن','يحيى','إبراهيم','عمر','خالد','فيصل','ماجد','حسين','موسى','يوسف','سلطان'];
  const fF=['نورة','فاطمة','أمل','هدى','مريم','عائشة','ريم','سارة','خديجة','منى','أسماء','حنان','زينب','شهد','رهف'];
  const mid=['محمد','علي','أحمد','حسن','يحيى','إبراهيم','عبدالله','موسى','ناصر'];
  const fam=['المالكي','الحازمي','النعمي','الشهري','المدخلي','الصميلي','العطاس','الحكمي','القحطاني','عسيري','معافا','الفيفي','عريشي','صهلولي','مباركي'];
  const person=()=>{ const g=Math.random()<.5?'ذكر':'أنثى'; return {id:uid(), national_id:makeSaudiId(Math.random()<.9?'1':'2'), full_name:`${pick(g==='ذكر'?fM:fF)} ${pick(mid)} ${pick(mid)} ${pick(fam)}`,
    phone:'05'+String(rnd(10000000,99999999)), email:'', gender:g, birth_date:`${rnd(1975,2006)}-0${rnd(1,9)}-1${rnd(0,9)}`,
    city:pick(['جازان','جازان','جازان','صبيا','صبيا','أبو عريش','صامطة','بيش','أحد المسارحة','ضمد','الدرب']),
    education:pick(['ثانوي','دبلوم','بكالوريوس','بكالوريوس','بكالوريوس','ماجستير','دكتوراه']), employer:pick(['قطاع حكومي','قطاع خاص','قطاع خاص','متدرب','باحث عن عمل','عمل حر']), created_at:addDays(today,-60)+'T08:00:00Z'}; };
  cohorts.forEach(c=>{ const n=Math.round(c.seats*(c.start_date>today? .3+Math.random()*.3 : .65+Math.random()*.3));
    for(let i=0;i<n;i++){ const t = (trainees.length>30 && Math.random()<.12) ? pick(trainees) : (()=>{ const x=person(); trainees.push(x); return x; })();
      if(enrollments.some(e=>e.cohort_id===c.id&&e.trainee_id===t.id)) continue;
      let created=addDays(c.start_date,-rnd(1,12)); if(created>today) created=addDays(today,-rnd(0,3));
      enrollments.push({id:uid(), ref:newRef(), cohort_id:c.id, program_id:c.program_id, trainee_id:t.id, package_id:null, status:Math.random()<.03?'ملغى':'مسجل', created_at:created+'T0'+rnd(7,9)+':'+rnd(10,59)+':00Z'}); } });
  const nowMin=toMin(riyadhNow().hm);
  cohorts.forEach(c=>{ const rate=.72+Math.random()*.22;
    sessionDays(c,today).forEach(d=>{ if(d===today && nowMin<toMin(c.start_time)) return;
      enrollsOf({enrollments},c.id).forEach(e=>{ if(e.created_at.slice(0,10)>d || Math.random()>rate) return;
        const late=Math.random()<.15, m=toMin(c.start_time)+(late?rnd(16,45):rnd(-25,12));
        const tm=`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}:${String(rnd(0,59)).padStart(2,'0')}`;
        attendance.push({id:uid(), enrollment_id:e.id, cohort_id:c.id, program_id:c.program_id, trainee_id:e.trainee_id, att_date:d, time:tm, checkin_at:d+'T'+tm, status:late?'متأخر':'حاضر'}); }); }); });
  const D={ programs, packages:[], trainees, cohorts, enrollments, attendance, certificates:[],
    settings:{ daily_secret:Math.random().toString(36).slice(2)+Date.now(), require_code:false, late_minutes:15, early_minutes:60, admin_pin:'1234', checkin_url:'', cert_threshold:75, late_weight:1, warn_consec:2, about:DEFAULT_ABOUT }, partners:defaultPartners() };
  demoQudurat(D, person, rnd);
  D.teachers=[]; D.guardian_links=[]; D.notifications=[]; D.assignments=[]; D.submissions=[]; demoPeople(D); demoLearning(D);
  return D;
}

export let Store = LocalStore;
/* يُستدعى مرة واحدة من boot() بعد تحميل كل الوحدات */
export function initStore(){
  if(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase){ CloudStore.init(); Store = CloudStore; }
  else { LocalStore.load(); window.addEventListener('storage', e => { if(e.key === LocalStore.key && e.newValue) LocalStore.load(); }); }   // الوضع التجريبي: تحديث من الألسنة الأخرى
}
