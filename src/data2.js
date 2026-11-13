import { sessionReminders, inboxOf, adminRecipients } from './inbox_logic.js';
import { checkAcceptance, validatePolicy, nextVersion, demoPolicies } from './policy_logic.js';
import { catalogPrograms, computeEnd } from './catalog.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';
import { DEFAULT_ABOUT, defaultPartners } from './partners.js';
import { defaultPlans, planTotal, customPlans, defaultTemplates, demoQudurat, planName, planOpen, sectionOfGender, SECTIONS, subCheckin, subEnd, subsInSession, subStats, subStatus, sessionOn, sessionsBetween } from './qudurat.js';
import { rolesOfPhone, normPhone, makeNotification, ROLE_TXT } from './portal_logic.js';
import { makeReport, isPastReportTime } from './report_logic.js';
import { buildInvoice, validReceipt } from './invoice_logic.js';
import { BANK_DEFAULT, orderNumber, attendanceBlocked, orderPublic, checkTransfer, validIban } from './order_logic.js';
import { checkBirthGuardian, selfLinkLogic, LINK_FAIL, LINK_LOCKED } from './identity_logic.js';
import { SUBJECTS, validateAssignment, validateQuestion, buildAttempt, attemptPublic, gradeAttempt, canRate, ratingSummary, validateMessage, teacherCovers, teacherTeaches, studentHasScope, bankFor, period, demoLearning, bankUnitsOf, buildQuiz, quizPublic, gradeQuiz } from './learning_logic.js';
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
    settings:pick(D.settings||{},['late_minutes','early_minutes','late_weight','cert_threshold','warn_consec','remind_minutes',...Object.keys(CALC_DEFAULTS).filter(k=>k.startsWith('msg_'))]) };
  const tSafe=t=>({id:t.id, full_name:t.full_name, gender:t.gender});
  const ordersFor=ids=>(D.orders||[]).filter(o=>ids.includes(o.trainee_id)).map(o=>orderPublic(o, D.settings.bank));
  const teachersPub=(D.teachers||[]).filter(t=>t.active!==false).map(t=>({id:t.id, full_name:t.full_name, section:t.section, subjects:t.subjects, active:true}));
  const forTrainees=ids=>{ const subs=(D.subscriptions||[]).filter(s=>ids.includes(s.trainee_id)), sid=subs.map(s=>s.id);
    const scopes=subs.flatMap(s=>(s.subjects||[]).map(x=>s.section+':'+x));
    return { trainees:D.trainees.filter(t=>ids.includes(t.id)).map(tSafe), subscriptions:subs, sub_attendance:(D.sub_attendance||[]).filter(a=>sid.includes(a.subscription_id)),
      assignments:(D.assignments||[]).filter(a=>scopes.includes(a.section+':'+a.subject)).map(quizPublic), submissions:(D.submissions||[]).filter(x=>ids.includes(x.trainee_id)), teachers:teachersPub,
      bank_units:bankUnitsOf(D, subs, D.teachers),
      // البرامج: دفعات المتدرب وحضورها وشهاداتها (للبوابة بدل «حضوري»)
      ...(()=>{ const en=(D.enrollments||[]).filter(e=>ids.includes(e.trainee_id)), cids=en.map(e=>e.cohort_id), pids=en.map(e=>e.program_id), eids=en.map(e=>e.id);
        return { enrollments:en, cohorts:(D.cohorts||[]).filter(c=>cids.includes(c.id)), programs:(D.programs||[]).filter(p=>pids.includes(p.id)).map(p=>({id:p.id, code:p.code, name:p.name, category:p.category, accreditation_no:p.accreditation_no, hours:p.hours})),
          attendance:(D.attendance||[]).filter(a=>eids.includes(a.enrollment_id)), certificates:(D.certificates||[]).filter(x=>eids.includes(x.enrollment_id)).map(x=>({id:x.id, serial:x.serial, enrollment_id:x.enrollment_id, rate:x.rate, issued_at:x.issued_at, revoked:x.revoked})) }; })(),
      attempts:(D.attempts||[]).filter(a=>ids.includes(a.trainee_id)).map(attemptPublic), ratings:(D.ratings||[]).filter(r=>ids.includes(r.trainee_id)), messages:(D.messages||[]).filter(m=>ids.includes(m.trainee_id)) }; };
  if(role==='student'){ const ids=D.trainees.filter(t=>normPhone(t.phone)===ph).map(t=>t.id);
    return {...base, ...forTrainees(ids), orders:ordersFor(ids), notifications:(D.notifications||[]).filter(x=>x.to==='student'&&ids.includes(x.trainee_id)), guardian_links:[]}; }
  if(role==='guardian'){ const links=(D.guardian_links||[]).filter(l=>l.status==='verified'&&normPhone(l.guardian_phone)===ph), ids=links.map(l=>l.trainee_id);
    return {...base, ...forTrainees(ids), orders:ordersFor(ids), guardian_links:links.map(l=>({...l, guardian_phone:ph})), notifications:(D.notifications||[]).filter(x=>x.to==='guardian'&&ids.includes(x.trainee_id))}; }
  if(role==='teacher'){ const me=(D.teachers||[]).find(t=>t.active!==false&&normPhone(t.phone)===ph); if(!me) return null;
    const subs=(D.subscriptions||[]).filter(s=>s.section===me.section&&(s.subjects||[]).some(x=>(me.subjects||[]).includes(x))), ids=[...new Set(subs.map(s=>s.trainee_id))];
    return {...base, me:{...me, phone:undefined}, teachers:[{...me}], trainees:D.trainees.filter(t=>ids.includes(t.id)).map(tSafe), subscriptions:subs,
      sub_attendance:(D.sub_attendance||[]).filter(a=>subs.some(s=>s.id===a.subscription_id)), guardian_links:(D.guardian_links||[]).filter(l=>l.status==='verified'&&ids.includes(l.trainee_id)).map(l=>({id:l.id, trainee_id:l.trainee_id, status:l.status, relation:l.relation})),
      assignments:(D.assignments||[]).filter(a=>a.teacher_id===me.id), submissions:(D.submissions||[]).filter(x=>ids.includes(x.trainee_id)&&(D.assignments||[]).some(a=>a.id===x.assignment_id&&a.teacher_id===me.id)),
      notifications:(D.notifications||[]).filter(x=>x.sender==='teacher:'+me.id), notifications_in:(D.notifications||[]).filter(x=>x.to==='teacher'&&x.teacher_id===me.id),
      questions:(D.questions||[]).filter(q=>q.teacher_id===me.id&&q.status!=='deleted'),
      attempts:(D.attempts||[]).filter(a=>ids.includes(a.trainee_id)&&a.submitted_at&&(a.teacher_id ? a.teacher_id===me.id : a.section===me.section&&(me.subjects||[]).includes(a.subject))),
      rating_summary:ratingSummary(D, me.id), messages:(D.messages||[]).filter(m=>m.teacher_id===me.id),
      // دفعات البرامج المسندة إليه: كشفها وحضورها (أسماء المتدربين فقط)
      ...(()=>{ const cs=(D.cohorts||[]).filter(c=>c.teacher_id===me.id&&!cohortArchived(c)), cids=cs.map(c=>c.id), en=(D.enrollments||[]).filter(e=>cids.includes(e.cohort_id)&&e.status!=='ملغى'), eids=en.map(e=>e.id), tids=en.map(e=>e.trainee_id);
        return { cohorts:cs, programs:(D.programs||[]).filter(p=>cs.some(c=>c.program_id===p.id)).map(p=>({id:p.id, code:p.code, name:p.name, hours:p.hours})), enrollments:en,
          attendance:(D.attendance||[]).filter(a=>eids.includes(a.enrollment_id)), cohort_trainees:D.trainees.filter(t=>tids.includes(t.id)).map(tSafe) }; })(),
      // مرآة الإنجاز: واجبات كل مقررات متدربيه (حقول التوقيت فقط) وحالات تسليمها، دون نصوص الإجابات
      ...(()=>{ const sc=subs.flatMap(s=>(s.subjects||[]).map(x=>s.section+':'+x)), hw=(D.assignments||[]).filter(a=>sc.includes(a.section+':'+a.subject));
        return { hw_assignments:hw.map(a=>({id:a.id, section:a.section, subject:a.subject, publish_date:a.publish_date, due_date:a.due_date, max_score:a.max_score})),
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
    D.orders=D.orders||[]; D.invoices=D.invoices||[]; if(!D.settings.bank) D.settings.bank={...BANK_DEFAULT}; if(D.settings.require_order_approval==null) D.settings.require_order_approval=false;
    if(!D.plans.some(p=>p.tier==='custom')) D.plans.push(...customPlans());       // باقة «خصصناها لك» للبيانات المحفوظة قبل إضافتها
    D.checkin_attempts = D.checkin_attempts || []; D.audit_logs = D.audit_logs || []; D.custom_requests = D.custom_requests || [];
    if(!D.teachers){ D.teachers=[]; D.guardian_links=[]; D.notifications=[]; demoPeople(D); } D.assignments=D.assignments||[]; D.submissions=D.submissions||[]; D.daily_reports=D.daily_reports||[]; if(!D.questions) demoLearning(D); if(!D.policies || (D.policies.length && D.policies.every(x=>x.status==='draft'))){ D.policies=demoPolicies(); D.policy_acceptances=D.policy_acceptances||[]; } (D.policies||[]).forEach(x=>{ if(String(x.id).startsWith('pol-')) x.requires_acceptance=false; }); if(!D.trainees.some(t=>t.phone==='0550000003')) demoProgramTrainee(D);
    this.autoArchive(); this.save();
    try{ this.admin = sessionStorage.getItem(this.key+'_adm')==='1'; }catch(e){}
  },
  autoArchive(){ const today=riyadhNow().date; this.data.cohorts.forEach(c=>{ if(!c.archived_at && c.end_date<today){ c.archived_at=addDays(c.end_date,1)+'T00:00:00Z'; c.archived_auto=true; c.reg_open=false; issueCertificatesLocal(this.data,c); } }); },
  save(){ try{ localStorage.setItem(this.key, JSON.stringify(this.data)); }catch(e){} },
  _pub(p){ const D=this.data, c=activeCohortOf(D,p.id); return {...p, code:progCode(p), cohort: c?{...c, taken:takenOf(D,c.id)}:null}; },
  async catalog(){ const D=this.data; return { programs:D.programs.filter(p=>p.active).map(p=>this._pub(p)), packages:D.packages.filter(k=>k.active) }; },
  async publicProgram(code){ const p=this.data.programs.find(x=>progCode(x)===code); return p ? this._pub(p) : null; },
  async publicSettings(){ const s=this.data.settings; return {require_code:s.require_code, late_minutes:s.late_minutes, early_minutes:s.early_minutes, checkin_url:s.checkin_url}; },
  async register(f){
    const D=this.data, today=riyadhNow().date;
    if(!validSaudiId(f.national_id)) throw new Error('رقم السجل المدني غير صحيح');
    const pids = f.package_id ? (D.packages.find(k=>k.id===f.package_id)?.program_ids||[]) : [f.program_id];
    const targets = pids.map(pid=>({p:D.programs.find(x=>x.id===pid), c:activeCohortOf(D,pid,today)}));
    for(const {p,c} of targets){
      if(!p) throw new Error('البرنامج غير موجود');
      if(!c || !c.reg_open) throw new Error(`التسجيل غير مفتوح حاليًا في «${p.name}»`);
      if(takenOf(D,c.id)>=c.seats) throw new Error(`اكتملت مقاعد الدفعة ${c.number} من «${p.name}»`);
    }
    checkAcceptance(D.policies, today, f.accepted_policies);
    let t = D.trainees.find(x=>x.national_id===f.national_id);
    for(const {p,c} of targets){ if(t && D.enrollments.some(e=>e.cohort_id===c.id && e.trainee_id===t.id && e.status!=='ملغى')) throw new Error(`هذا السجل المدني مسجّل مسبقًا في الدفعة ${c.number} من «${p.name}»`); }
    const person = {national_id:f.national_id, full_name:f.full_name, phone:f.phone, email:f.email||'', gender:f.gender, birth_date:f.birth_date||'', city:f.city, education:f.education, employer:f.employer||'', guardian_phone:checkBirthGuardian(f, riyadhNow().date)};
    if(t) mergeOnRegister(D, t, person); else { t={id:uid(), ...person, created_at:new Date().toISOString()}; D.trainees.push(t); }
    acceptPolicies(D, f, t.id, 'registration');
    const ref = newRef();
    targets.forEach(({c})=>D.enrollments.push({id:uid(), ref, cohort_id:c.id, program_id:c.program_id, trainee_id:t.id, package_id:f.package_id||null, status:'مسجل', created_at:new Date().toISOString()}));
    const total=targets.reduce((a,{p})=>a+(Number(p.price)||0),0);
    const order=this._newOrder({trainee_id:t.id, kind:'program', enrollment_ids:D.enrollments.filter(e=>e.ref===ref).map(e=>e.id), title:targets.map(({p})=>p.name).join('، '), total, due_now:total});
    this.save();
    return {ok:true, ref, order, cohorts:targets.map(({p,c})=>({program:p.name, number:c.number, start:c.start_date}))};
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
    const person={national_id:f.national_id, full_name:f.full_name, phone:f.phone, email:f.email||'', gender:f.gender, birth_date:f.birth_date||'', city:f.city, education:f.education, employer:f.employer||'', guardian_phone:checkBirthGuardian(f, riyadhNow().date)};
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
    const start=f.start_date||null;
    if(f.id){ const s=D.subscriptions.find(x=>x.id===f.id); if(!s) throw new Error('الاشتراك غير موجود');
      Object.assign(s, {plan_id:plan.id, section:f.section||s.section, subjects:f.subjects||s.subjects, start_date:start, end_date:start?subEnd(plan,start):null, status:start?'active':'pending', start_manual:!!start});
      this.audit('subscription.update', s.id); this.save(); return s; }
    if(D.subscriptions.some(s=>s.trainee_id===t.id && s.plan_id===plan.id && ['pending','active'].includes(subStatus(s)))) throw new Error(`${t.full_name} مشترك مسبقًا في ${planName(plan)}`);
    const s={id:uid(), ref:newRef(), trainee_id:t.id, plan_id:plan.id, section:f.section||sectionOfGender(t.gender), subjects:f.subjects||[...(plan.subjects||[])], status:start?'active':'pending', start_date:start, end_date:start?subEnd(plan,start):null, start_manual:!!start, created_at:new Date().toISOString()};
    D.subscriptions.push(s); this.audit('subscription.create', s.id); this.save(); return s;
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
  async requestOtp(phone){ if(!/^05\d{8}$/.test(normPhone(phone))) throw new Error('رقم الجوال 10 أرقام يبدأ بـ 05'); return {demo:true}; },
  async portalLogin(phone, code, role){
    const ph=normPhone(phone); if(code!=='1234') throw new Error('رمز التحقق غير صحيح');
    if(!rolesOfPhone(this.data, ph).includes(role)) throw new Error(`هذا الرقم غير مرتبط بحساب ${ROLE_TXT[role]}. راجع إدارة المعهد.`);
    try{ sessionStorage.setItem(this.key+'_p_'+role, ph); }catch(e){} return {ok:true};
  },
  async portalSession(role){ let ph=null; try{ ph=sessionStorage.getItem(this.key+'_p_'+role); }catch(e){} return ph && rolesOfPhone(this.data, ph).includes(role) ? {phone:ph, role} : null; },
  async portalLogout(role){ try{ sessionStorage.removeItem(this.key+'_p_'+role); }catch(e){} },
  async portalData(role){ const s=await this.portalSession(role); if(!s) throw new Error('انتهت الجلسة، سجّل الدخول مجددًا'); this.autoArchive(); this.runReminders(); return JSON.parse(JSON.stringify(scopeData(this.data, role, s.phone))); },
  /* صندوق الوارد (الخطوة D): تنبيهات بدء الجلسة تُنشأ عند الحاجة (في السحابة: pg_cron كل دقيقة)، ومفتاح منع التكرار */
  runReminders(){ const D=this.data; D.notifications=D.notifications||[]; const keys=new Set(D.notifications.map(x=>x.dedupe_key).filter(Boolean));
    const add=sessionReminders(D, riyadhNow()).filter(x=>!keys.has(x.dedupe_key)); if(add.length){ D.notifications.push(...add); this.save(); } return add.length; },
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
  async confirmOrderPayment(id, amount, confirmed=true, reason=''){ const D=this.data, o=(D.orders||[]).find(x=>x.id===id); if(!o) throw new Error('الطلب غير موجود'); D.invoices=D.invoices||[];
    if(confirmed && o.payment==='confirmed') throw new Error('سبق تأكيد سداد هذا الطلب.');
    if(confirmed){ const a=Math.round(+amount*100)/100; if(!(a>0)) throw new Error('اكتب المبلغ الواصل فعليًا'); if(a<o.due_now) throw new Error(`المبلغ أقل من المطلوب الآن (${o.due_now} ريال)؛ لا يُعد السداد مستوفيًا`);
      o.paid_amount=a; o.payment='confirmed'; D.invoice_seq=(D.invoice_seq||0)+1;
      const inv={id:uid(), ...buildInvoice(o, D.trainees.find(t=>t.id===o.trainee_id), {amount:a, seq:D.invoice_seq, date:riyadhNow().date}), created_at:new Date().toISOString()}; D.invoices.push(inv);
      this._orderEvent(o,'payment_confirmed','admin',`${a} ريال · فاتورة ${inv.number}`); }
    else { if(o.payment!=='confirmed') throw new Error('السداد غير مؤكد'); if(String(reason||'').trim().length<3) throw new Error('اكتب سبب إلغاء تأكيد السداد');
      D.invoices.filter(i=>i.order_id===o.id && i.status==='issued').forEach(i=>{ i.status='void'; i.void_reason=String(reason).trim().slice(0,300); i.voided_at=new Date().toISOString(); });
      o.payment=o.claim?'claimed':'unpaid'; o.paid_amount=0; this._orderEvent(o,'payment_unconfirmed','admin',reason); }
    this.audit('order.payment', o.id, {confirmed}); this.save(); return {ok:true}; },
  async setOrderProvisional(id, on, reason){ const o=(this.data.orders||[]).find(x=>x.id===id); if(!o) throw new Error('الطلب غير موجود'); if(on && o.approval==='rejected') throw new Error('الطلب مرفوض');
    if(on && String(reason||'').trim().length<3) throw new Error('اكتب سبب القبول المؤقت'); o.provisional=!!on; this._orderEvent(o, on?'provisional_on':'provisional_off','admin',reason); this.audit('order.provisional', o.id, {on:!!on}); this.save(); return {ok:true}; },
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
    if(a.kind==='quiz'&&!a.id){ row.kind='quiz'; row.quiz=buildQuiz(this.data, me, a.subject, a.unit||null, a.count); } else if(!a.id) row.kind='text';
    if(a.id){ const ex=L.find(y=>y.id===a.id&&y.teacher_id===me.id); if(ex?.kind==='quiz'){ delete row.subject; } }
    if(a.id){ const x=L.find(y=>y.id===a.id&&y.teacher_id===me.id); if(!x) throw new Error('غير مصرح'); Object.assign(x,row); } else L.push({id:uid(), teacher_id:me.id, ...row, created_at:new Date().toISOString()});
    this.save(); return {ok:true}; },
  async gradeSubmission(id, g){ const me=await this._me(), D=this.data, s=D.submissions.find(x=>x.id===id), a=s&&D.assignments.find(y=>y.id===s.assignment_id&&y.teacher_id===me.id); if(!a) throw new Error('غير مصرح');
    if(!['graded','needs_revision'].includes(g.status)) throw new Error('حالة غير صالحة'); const sc=g.score===''||g.score==null?null:+g.score; if(sc!=null&&(sc<0||sc>a.max_score)) throw new Error(`الدرجة من 0 إلى ${a.max_score}`);
    Object.assign(s,{status:g.status, score:sc, feedback:String(g.feedback||'').slice(0,1000), graded_at:new Date().toISOString()}); this.save(); return {ok:true}; },
  async submitAssignment({trainee_id, assignment_id, answer, answers, draft}){ await this._student(trainee_id); const D=this.data, a=D.assignments.find(x=>x.id===assignment_id);
    if(!a||!studentHasScope(D,trainee_id,a.section,a.subject)||a.publish_date>riyadhNow().date) throw new Error('الواجب غير متاح لك');
    let s=D.submissions.find(x=>x.assignment_id===a.id&&x.trainee_id===trainee_id); if(s&&s.status==='graded') throw new Error('صُحّح الواجب ولا يمكن تعديله');
    if(a.kind==='quiz'){ // اختبار من البنك: يُصحَّح فورًا ولا يُعاد
      const g=gradeQuiz(a, answers||{}), now=new Date().toISOString();
      const row={answer:'', answers:g.answers, review:g.review, status:'graded', score:g.score, feedback:`أجبت ${g.right} من ${g.total} إجابة صحيحة`, submitted_at:now, graded_at:now, late:riyadhNow().date>a.due_date};
      if(s) Object.assign(s,row); else D.submissions.push({id:uid(), assignment_id:a.id, trainee_id, ...row}); this.save(); return {ok:true, right:g.right, total:g.total, score:g.score}; }
    const txt=String(answer||'').trim(); if(!draft&&!txt) throw new Error('اكتب إجابتك قبل الإرسال');
    const row={answer:txt.slice(0,6000), status:draft?'draft':'submitted', submitted_at:draft?null:new Date().toISOString(), late:!draft&&riyadhNow().date>a.due_date};
    if(s) Object.assign(s,row); else D.submissions.push({id:uid(), assignment_id:a.id, trainee_id, ...row}); this.save(); return {ok:true}; },
  async saveQuestion(q){ const me=await this._me(); validateQuestion(q); if(!teacherCovers(me, me.section, q.subject)) throw new Error('المقرر خارج نطاقك');
    const L=this.data.questions, row={subject:q.subject, section:me.section, unit:String(q.unit||'').trim()||'عام', skill:String(q.skill||'').trim(), text:q.text.trim(), options:q.options.map(x=>String(x).trim()), correct:+q.correct, explanation:String(q.explanation||'').trim(), difficulty:q.difficulty||'متوسط', status:q.status==='published'?'published':'draft'};
    if(q.id){ const x=L.find(y=>y.id===q.id&&y.teacher_id===me.id); if(!x) throw new Error('غير مصرح'); Object.assign(x,row,{version:(x.version||1)+1}); }
    else L.push({id:uid(), teacher_id:me.id, version:1, created_at:new Date().toISOString(), ...row}); this.save(); return {ok:true}; },
  async setQuestionStatus(id, status){ const me=await this._me(), x=this.data.questions.find(y=>y.id===id&&y.teacher_id===me.id); if(!x) throw new Error('غير مصرح');
    if(!['draft','published','deleted'].includes(status)) throw new Error('حالة غير صالحة'); x.status=status; this.save(); return {ok:true}; },
  async startAttempt({trainee_id, section, subject, unit, count, teacher_id}){ await this._student(trainee_id); const D=this.data; if(!studentHasScope(D,trainee_id,section,subject)) throw new Error('هذا المقرر ليس ضمن اشتراكك');
    if(teacher_id&&!teacherCovers((D.teachers||[]).find(t=>t.id===teacher_id), section, subject)) throw new Error('هذا البنك ليس لمدرب مقررك');
    const at=buildAttempt(D, trainee_id, section, subject, unit, count, teacher_id||null); (D.attempts=D.attempts||[]).push(at); this.save(); return attemptPublic(at); },
  async finishAttempt({attempt_id, answers}){ const D=this.data, at=(D.attempts||[]).find(x=>x.id===attempt_id); if(!at) throw new Error('المحاولة غير موجودة'); await this._student(at.trainee_id);
    if(at.submitted_at) return at; const g=gradeAttempt(at, answers); Object.assign(at, g); this.save(); return at; },
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
    const L=(this.data.questions=this.data.questions||[]), row={teacher_id:t.id, section:t.section, subject:q.subject, unit:String(q.unit||'').trim()||'عام', skill:String(q.skill||'').trim(), text:q.text.trim(), options:q.options.map(x=>String(x).trim()), correct:+q.correct, explanation:String(q.explanation||'').trim(), difficulty:q.difficulty||'متوسط', status:q.status==='published'?'published':'draft'};
    if(q.id){ const x=L.find(y=>y.id===q.id); if(!x) throw new Error('السؤال غير موجود'); Object.assign(x,row,{version:(x.version||1)+1}); } else L.push({id:uid(), version:1, created_at:new Date().toISOString(), ...row});
    this.audit('question.save', q.id||'new', t.id); this.save(); return {ok:true}; },
  async adminQuestionStatus(id, status){ const x=(this.data.questions||[]).find(y=>y.id===id); if(!x) throw new Error('السؤال غير موجود'); if(!['draft','published','deleted'].includes(status)) throw new Error('حالة غير صالحة'); x.status=status; this.audit('question.status', id, status); this.save(); return {ok:true}; },
  async adminImportQuestions(teacher_id, rows, status){ const t=this._bankTeacher(teacher_id); if(!Array.isArray(rows)||!rows.length) throw new Error('لا توجد أسئلة صالحة للاستيراد'); if(rows.length>2000) throw new Error('الحد 2000 سؤال في المرة الواحدة');
    rows.forEach((q,i)=>{ try { validateQuestion(q); } catch(e){ throw new Error(`السطر ${i+1}: ${e.message}`); } if(!(t.subjects||[]).includes(q.subject)) throw new Error(`السطر ${i+1}: المقرر ليس من مقررات المدرب`); });
    const L=(this.data.questions=this.data.questions||[]), at=new Date().toISOString(), st=status==='draft'?'draft':'published';
    rows.forEach(q=>L.push({id:uid(), teacher_id:t.id, section:t.section, subject:q.subject, unit:String(q.unit||'').trim()||'عام', skill:String(q.skill||'').trim(), text:q.text.trim(), options:q.options.map(x=>String(x).trim()), correct:+q.correct, explanation:String(q.explanation||'').trim(), difficulty:q.difficulty||'متوسط', status:st, version:1, created_at:at}));
    this.audit('question.import', t.id, String(rows.length)); this.save(); return {count:rows.length}; },
  audit(action, entity, detail){ (this.data.audit_logs=this.data.audit_logs||[]).push({id:uid(), at:new Date().toISOString(), actor:'admin', action, entity:String(entity), detail:detail||null}); if(this.data.audit_logs.length>5000) this.data.audit_logs.shift(); },
  async resetDemo(){ this.data = makeDemo(); this.autoArchive(); this.save(); },
  async clearPeople(){ const D=this.data; D.trainees=[]; D.enrollments=[]; D.attendance=[]; D.cohorts=[]; D.certificates=[]; D.subscriptions=[]; D.sub_attendance=[]; D.checkin_attempts=[]; this.save(); }
};

/* ---------------- Supabase: نفس الواجهة عبر دوال آمنة وجداول محمية بالصلاحيات ---------------- */
export const CloudStore = {
  mode:'cloud', sb:null,
  init(){ this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); },
  _e(r){ if(r.error){ const m=r.error.message||''; throw new Error(/foreign key|violates/.test(m) ? 'لا يمكن الحذف: توجد سجلات حضور أو شهادات مرتبطة. استخدم الإلغاء أو الأرشفة.' : m); } return r.data; },
  async catalog(){ const d=this._e(await this.sb.rpc('public_catalog')); return {programs:d.programs||[], packages:d.packages||[]}; },
  async publicProgram(code){ return this._e(await this.sb.rpc('public_program',{p_code:code})); },
  async publicSettings(){ return this._e(await this.sb.rpc('public_settings')) || {}; },
  async register(f){ return this._e(await this.sb.rpc('register_trainee',{p:f})); },
  async checkin(nid, code, programCode, opts={}){ return this._e(await this.sb.rpc('checkin',{p_nid:nid, p_code:code||null, p_program:programCode||null, p_device:opts.device||'', p_choice:opts.choice||null})); },
  async todayCode(){ return this._e(await this.sb.rpc('daily_code')); },
  async isAdmin(){ const {data:{session}} = await this.sb.auth.getSession(); if(!session) return false; const r=await this.sb.from('admins').select('user_id').eq('user_id',session.user.id); return !!(r.data&&r.data.length); },
  async login(email, pass){ const r=await this.sb.auth.signInWithPassword({email,password:pass}); if(r.error) throw new Error('بيانات الدخول غير صحيحة'); if(!(await this.isAdmin())){ await this.sb.auth.signOut(); throw new Error('هذا الحساب ليس مديرًا للنظام'); } return true; },
  async logout(){ await this.sb.auth.signOut(); },
  async adminData(){
    await this.sb.rpc('archive_ended_cohorts');
    const since = addDays(riyadhNow().date,-400), q=(t,f)=>f(this.sb.from(t).select('*'));
    const [p,k,t,c,e,a,s,ce,pt,pl,tp,ex,su,sa,at,cr,te,gl,nt,dr,po,pa,pcr,qs,ord,oev,inv] = await Promise.all([
      q('programs',x=>x.order('created_at')), q('packages',x=>x), q('trainees',x=>x.limit(10000)), q('cohorts',x=>x),
      q('enrollments',x=>x.limit(20000)), q('attendance',x=>x.gte('att_date',since).limit(50000)), this.sb.from('settings').select('*').eq('id',1).single(), q('certificates',x=>x.limit(20000)), q('partners',x=>x.order('sort_order')),
      q('plans',x=>x.order('sort')), q('schedule_templates',x=>x), q('schedule_exceptions',x=>x.gte('date',since)), q('subscriptions',x=>x.limit(20000)),
      q('sub_attendance',x=>x.gte('att_date',since).limit(100000)), q('checkin_attempts',x=>x.gte('date',addDays(riyadhNow().date,-30)).limit(20000)), q('custom_requests',x=>x.order('created_at',{ascending:false}).limit(500)),
      q('teachers',x=>x.order('full_name')), q('guardian_links',x=>x), q('notifications',x=>x.gte('date',addDays(riyadhNow().date,-30)).limit(5000)), q('daily_reports',x=>x.gte('date',addDays(riyadhNow().date,-60)).order('date',{ascending:false})), q('policies',x=>x.order('created_at')), q('policy_acceptances',x=>x.limit(50000)), q('profile_change_requests',x=>x.order('created_at',{ascending:false}).limit(500)), q('questions',x=>x.neq('status','deleted').limit(20000)), q('orders',x=>x.order('created_at',{ascending:false}).limit(5000)), q('order_events',x=>x.order('at').limit(50000)), q('invoices',x=>x.order('created_at',{ascending:false}).limit(20000))]);
    const hm = v => String(v||'').slice(0,5), tm = r => ({...r, time:new Date(r.checkin_at).toLocaleTimeString('en-GB',{timeZone:'Asia/Riyadh',hour12:false})});
    const att=this._e(a).map(x=>({...x, time:new Date(x.checkin_at).toLocaleTimeString('en-GB',{timeZone:'Asia/Riyadh',hour12:false})}));
    return {programs:this._e(p), packages:this._e(k), trainees:this._e(t), cohorts:this._e(c), enrollments:this._e(e), attendance:att, settings:this._e(s), certificates:this._e(ce), partners:this._e(pt).map(x=>({...x, order:x.sort_order})),
      plans:this._e(pl), schedule_templates:this._e(tp).map(x=>({...x, start:hm(x.start_time), end:hm(x.end_time)})), schedule_exceptions:this._e(ex).map(x=>({...x, start:hm(x.start_time), end:hm(x.end_time)})),
      subscriptions:this._e(su), sub_attendance:this._e(sa).map(tm), checkin_attempts:this._e(at).map(x=>({...x, trainee_hint:x.trainee_hint})), custom_requests:this._e(cr), audit_logs:[], teachers:this._e(te), guardian_links:this._e(gl), notifications:this._e(nt), assignments:[], submissions:[], daily_reports:this._e(dr), policies:this._e(po), policy_acceptances:this._e(pa), profile_change_requests:this._e(pcr), questions:this._e(qs), orders:this._e(ord).map(o=>({...o, events:this._e(oev).filter(e=>e.order_id===o.id)})), invoices:this._e(inv).map(i=>({...i, total:+i.total, paid:+i.paid, remaining:+i.remaining}))};
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
  async saveSettings(s){ const {admin_pin,...rest}=s; this._e(await this.sb.from('settings').update(rest).eq('id',1)); },
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
  async requestOtp(phone){ if(!/^05\d{8}$/.test(normPhone(phone))) throw new Error('رقم الجوال 10 أرقام يبدأ بـ 05'); const r=await this.sb.auth.signInWithOtp({phone:this._e164(phone), options:{shouldCreateUser:true}}); if(r.error) throw new Error('تعذّر إرسال رمز التحقق. حاول بعد قليل.'); return {ok:true}; },
  async portalLogin(phone, code, role){
    const r=await this.sb.auth.verifyOtp({phone:this._e164(phone), token:code, type:'sms'}); if(r.error) throw new Error('رمز التحقق غير صحيح أو منتهٍ');
    const roles=this._e(await this.sb.rpc('portal_roles'))||[]; if(!roles.includes(role)){ await this.sb.auth.signOut(); throw new Error(`هذا الرقم غير مرتبط بحساب ${ROLE_TXT[role]}. راجع إدارة المعهد.`); } return {ok:true};
  },
  async portalSession(role){ const {data:{session}}=await this.sb.auth.getSession(); if(!session) return null; const r=await this.sb.rpc('portal_roles'); return (r.data||[]).includes(role) ? {phone:normPhone(session.user.phone), role} : null; },
  async portalLogout(){ await this.sb.auth.signOut(); },
  async portalData(role){ return this._e(await this.sb.rpc('portal_data',{p_role:role})); },
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
  async submitAssignment(p){ return this._e(await this.sb.rpc('student_submit',{p})); },
  async saveQuestion(q){ return this._e(await this.sb.rpc('teacher_save_question',{p:q})); },
  async adminSaveQuestion(q){ return this._e(await this.sb.rpc('admin_save_question',{p:q})); },
  async adminQuestionStatus(id, status){ this._e(await this.sb.rpc('admin_question_status',{p_id:id, p_status:status})); return {ok:true}; },
  async adminImportQuestions(teacher_id, rows, status){ return this._e(await this.sb.rpc('admin_import_questions',{p_teacher:teacher_id, p_rows:rows, p_status:status==='draft'?'draft':'published'})); },
  async setQuestionStatus(id, status){ this._e(await this.sb.rpc('teacher_question_status',{p_id:id, p_status:status})); return {ok:true}; },
  async startAttempt(p){ return this._e(await this.sb.rpc('student_start_attempt',{p})); },
  async finishAttempt({attempt_id, answers}){ return this._e(await this.sb.rpc('student_finish_attempt',{p_id:attempt_id, p_answers:answers||{}})); },
  async rateTeacher(p){ return this._e(await this.sb.rpc('student_rate',{p})); },
  async sendMessage(p, role){ return this._e(await this.sb.rpc('send_message',{p, p_role:role})); },
  async markThreadRead({trainee_id, teacher_id}, role){ await this.sb.rpc('mark_thread_read',{p_trainee:trainee_id, p_teacher:teacher_id, p_role:role}); },
  async saveTeacher(t){ const row={full_name:t.full_name, phone:normPhone(t.phone), section:t.section, subjects:t.subjects, active:t.active!==false}; this._e(t.id ? await this.sb.from('teachers').update(row).eq('id',t.id) : await this.sb.from('teachers').insert(row)); },
  async orderReportTransfer(f){ return this._e(await this.sb.rpc('order_report_transfer',{p:f})); },
  async reviewOrder(id, decision, reason, expected_version){ return this._e(await this.sb.rpc('admin_review_order',{p_id:id, p_decision:decision, p_reason:reason||'', p_version:expected_version??null})); },
  async confirmOrderPayment(id, amount, confirmed=true, reason=''){ return this._e(await this.sb.rpc('admin_confirm_payment',{p_id:id, p_amount:+amount||0, p_confirmed:confirmed, p_reason:reason||''})); },
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
