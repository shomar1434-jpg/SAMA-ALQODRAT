import { catalogPrograms, computeEnd } from './catalog.js';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './config.js';
import { DEFAULT_ABOUT, defaultPartners } from './partners.js';
import { addDays, dowOf, fmtDate, fmtMoney, fmtNum, hash32, makeSaudiId, riyadhNow, toMin, uid, validSaudiId } from './utils.js';

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
export function traineeAttendanceLogic(D, nid){
  const t=D.trainees.find(x=>x.national_id===nid);
  if(!t) return {ok:false, reason:'no_match'};
  const list = D.enrollments.filter(e=>e.trainee_id===t.id && e.status!=='ملغى').map(e=>{ const c=D.cohorts.find(x=>x.id===e.cohort_id), p=D.programs.find(x=>x.id===e.program_id); if(!c||!p) return null;
    const s=enrollmentStats(D,e,c), n=riyadhNow(), state=cohortState(c); const next=sessionDays(c).find(d=>d>n.date||(d===n.date&&toMin(n.hm)<toMin(c.end_time)));
    const cert=(D.certificates||[]).find(x=>x.enrollment_id===e.id&&!x.revoked), level=attendanceLevel(s,state,D.settings);
    return {program:p.name, code:progCode(p), number:c.number, state, start_date:c.start_date, end_date:c.end_date, start_time:c.start_time, ...s, next: cohortArchived(c)?null:(next||null), cert: cert?cert.serial:null,
      level, message: levelMessage(level,s,D.settings,{'البرنامج':p.name,'الاسم':t.full_name.split(' ')[0],'البداية':fmtDate(c.start_date)})}; }).filter(Boolean)
    .sort((a,b)=>({running:0,upcoming:1,archived:2}[a.state]-{running:0,upcoming:1,archived:2}[b.state]) || b.start_date.localeCompare(a.start_date));
  return {ok:true, trainee:t, first_name:t.full_name.split(' ')[0], threshold:calcSet(D.settings).cert_threshold, items:list};
}
/* ما يراه المتدرب فقط: نسبة الحضور ورسالة التنبيه */
export function myAttendanceLogic(D, nid){
  const r=traineeAttendanceLogic(D,nid); if(!r.ok) return r;
  return {ok:true, first_name:r.first_name, items:r.items.map(x=>({program:x.program, number:x.number, state:x.state, start_date:x.start_date, end_date:x.end_date,
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

export const LocalStore = {
  key:'sama_qudrat_v4', mode:'local', data:null, admin:false,
  load(){
    try{ this.data = JSON.parse(localStorage.getItem(this.key)||'null'); }catch(e){ this.data=null; }
    if(!this.data){ this.data = makeDemo(); }
    this.data.certificates = this.data.certificates || []; if(this.data.settings.cert_threshold==null) this.data.settings.cert_threshold=75;
    if(!this.data.partners) this.data.partners = defaultPartners(); if(this.data.settings.about==null) this.data.settings.about = DEFAULT_ABOUT;
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
    let t = D.trainees.find(x=>x.national_id===f.national_id);
    for(const {p,c} of targets){ if(t && D.enrollments.some(e=>e.cohort_id===c.id && e.trainee_id===t.id && e.status!=='ملغى')) throw new Error(`هذا السجل المدني مسجّل مسبقًا في الدفعة ${c.number} من «${p.name}»`); }
    const person = {national_id:f.national_id, full_name:f.full_name, phone:f.phone, email:f.email||'', gender:f.gender, birth_date:f.birth_date||'', city:f.city, education:f.education, employer:f.employer||''};
    if(t) Object.assign(t, person); else { t={id:uid(), ...person, created_at:new Date().toISOString()}; D.trainees.push(t); }
    const ref = newRef();
    targets.forEach(({c})=>D.enrollments.push({id:uid(), ref, cohort_id:c.id, program_id:c.program_id, trainee_id:t.id, package_id:f.package_id||null, status:'مسجل', created_at:new Date().toISOString()}));
    this.save();
    return {ok:true, ref, cohorts:targets.map(({p,c})=>({program:p.name, number:c.number, start:c.start_date}))};
  },
  dayCode(date){ return String(hash32(this.data.settings.daily_secret + date) % 10000).padStart(4,'0'); },
  async todayCode(){ return this.dayCode(riyadhNow().date); },
  async checkin(nid, code, programCode){
    this.autoArchive();
    const r = checkinLogic(this.data, nid, code, programCode, this.dayCode(riyadhNow().date));
    if(r._rec){ this.data.attendance.push(r._rec); this.save(); delete r._rec; }
    return r;
  },
  async isAdmin(){ return this.admin; },
  async login(user, pass){ if(pass===this.data.settings.admin_pin){ this.admin=true; try{sessionStorage.setItem(this.key+'_adm','1');}catch(e){} return true; } throw new Error('رمز الدخول غير صحيح'); },
  async logout(){ this.admin=false; try{sessionStorage.removeItem(this.key+'_adm');}catch(e){} },
  async adminData(){ this.autoArchive(); this.save(); return JSON.parse(JSON.stringify(this.data)); },
  async saveProgram(p){ const a=this.data.programs, i=a.findIndex(x=>x.id===p.id); if(i>=0) a[i]={...a[i],...p}; else { const n={...p,id:uid(),created_at:new Date().toISOString()}; n.code=p.code||progCode(n); a.push(n); } this.save(); },
  async deleteProgram(id){ const D=this.data; const cids=D.cohorts.filter(c=>c.program_id===id).map(c=>c.id);
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
  async deleteCohort(id){ const D=this.data; D.cohorts=D.cohorts.filter(c=>c.id!==id); D.enrollments=D.enrollments.filter(e=>e.cohort_id!==id); D.attendance=D.attendance.filter(a=>a.cohort_id!==id); this.save(); },
  async setEnrollmentStatus(id, status){ const e=this.data.enrollments.find(x=>x.id===id); if(e){ e.status=status; this.save(); } },
  async deleteEnrollment(id){ const D=this.data; D.enrollments=D.enrollments.filter(x=>x.id!==id); D.attendance=D.attendance.filter(a=>a.enrollment_id!==id); this.save(); },
  async setAttendance(enrollment_id, date, status){ const D=this.data, e=D.enrollments.find(x=>x.id===enrollment_id); if(!e) return;
    const i=D.attendance.findIndex(a=>a.enrollment_id===enrollment_id && a.att_date===date);
    if(status===null){ if(i>=0) D.attendance.splice(i,1); }
    else if(i>=0) D.attendance[i].status=status;
    else { const c=D.cohorts.find(x=>x.id===e.cohort_id); D.attendance.push({id:uid(), enrollment_id, cohort_id:e.cohort_id, program_id:e.program_id, trainee_id:e.trainee_id, att_date:date, time:(c?.start_time||'00:00')+':00', checkin_at:new Date().toISOString(), status, manual:true}); }
    this.save(); },
  async deleteTrainee(id){ const D=this.data; D.trainees=D.trainees.filter(x=>x.id!==id); D.enrollments=D.enrollments.filter(e=>e.trainee_id!==id); D.attendance=D.attendance.filter(a=>a.trainee_id!==id); this.save(); },
  async saveSettings(s){ Object.assign(this.data.settings, s); this.save(); },
  async publicSite(){ const D=this.data; return { about:D.settings.about||DEFAULT_ABOUT, partners:(D.partners||[]).filter(p=>p.active!==false) }; },
  async savePartner(p){ const L=this.data.partners=this.data.partners||[]; if(p.id){ const i=L.findIndex(x=>x.id===p.id); if(i>=0) L[i]={...L[i],...p}; else L.push(p); } else L.push({...p,id:uid()}); this.save(); },
  async deletePartner(id){ this.data.partners=(this.data.partners||[]).filter(p=>p.id!==id); this.save(); },
  async resetDemo(){ this.data = makeDemo(); this.autoArchive(); this.save(); },
  async clearPeople(){ const D=this.data; D.trainees=[]; D.enrollments=[]; D.attendance=[]; D.cohorts=[]; D.certificates=[]; this.save(); }
};

/* ---------------- Supabase: نفس الواجهة عبر دوال آمنة وجداول محمية بالصلاحيات ---------------- */
export const CloudStore = {
  mode:'cloud', sb:null,
  init(){ this.sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY); },
  _e(r){ if(r.error) throw new Error(r.error.message); return r.data; },
  async catalog(){ const d=this._e(await this.sb.rpc('public_catalog')); return {programs:d.programs||[], packages:d.packages||[]}; },
  async publicProgram(code){ return this._e(await this.sb.rpc('public_program',{p_code:code})); },
  async publicSettings(){ return this._e(await this.sb.rpc('public_settings')) || {}; },
  async register(f){ return this._e(await this.sb.rpc('register_trainee',{p:f})); },
  async checkin(nid, code, programCode){ return this._e(await this.sb.rpc('checkin',{p_nid:nid, p_code:code||null, p_program:programCode||null})); },
  async todayCode(){ return this._e(await this.sb.rpc('daily_code')); },
  async isAdmin(){ const {data:{session}} = await this.sb.auth.getSession(); if(!session) return false; const r=await this.sb.from('admins').select('user_id').eq('user_id',session.user.id); return !!(r.data&&r.data.length); },
  async login(email, pass){ const r=await this.sb.auth.signInWithPassword({email,password:pass}); if(r.error) throw new Error('بيانات الدخول غير صحيحة'); if(!(await this.isAdmin())){ await this.sb.auth.signOut(); throw new Error('هذا الحساب ليس مديرًا للنظام'); } return true; },
  async logout(){ await this.sb.auth.signOut(); },
  async adminData(){
    await this.sb.rpc('archive_ended_cohorts');
    const since = addDays(riyadhNow().date,-400), q=(t,f)=>f(this.sb.from(t).select('*'));
    const [p,k,t,c,e,a,s,ce,pt] = await Promise.all([
      q('programs',x=>x.order('created_at')), q('packages',x=>x), q('trainees',x=>x.limit(10000)), q('cohorts',x=>x),
      q('enrollments',x=>x.limit(20000)), q('attendance',x=>x.gte('att_date',since).limit(50000)), this.sb.from('settings').select('*').eq('id',1).single(), q('certificates',x=>x.limit(20000)), q('partners',x=>x.order('sort_order'))]);
    const att=this._e(a).map(x=>({...x, time:new Date(x.checkin_at).toLocaleTimeString('en-GB',{timeZone:'Asia/Riyadh',hour12:false})}));
    return {programs:this._e(p), packages:this._e(k), trainees:this._e(t), cohorts:this._e(c), enrollments:this._e(e), attendance:att, settings:this._e(s), certificates:this._e(ce), partners:this._e(pt).map(x=>({...x, order:x.sort_order}))};
  },
  _strip(o, keys){ const r={...o}; keys.forEach(k=>delete r[k]); return r; },
  async saveProgram(p){ const row=this._strip(p,['id','created_at','cohort']); if(!row.code) row.code = p.accreditation_no ? 'p'+p.accreditation_no : 'px'+Math.random().toString(36).slice(2,8); this._e(p.id ? await this.sb.from('programs').update(row).eq('id',p.id) : await this.sb.from('programs').insert(row)); },
  async deleteProgram(id){ this._e(await this.sb.from('programs').delete().eq('id',id)); },
  async savePackage(p){ const row=this._strip(p,['id','created_at']); this._e(p.id ? await this.sb.from('packages').update(row).eq('id',p.id) : await this.sb.from('packages').insert(row)); },
  async deletePackage(id){ this._e(await this.sb.from('packages').delete().eq('id',id)); },
  async saveCohort(c){ const row=this._strip(c,['id','created_at','number','taken']); if(c.id){ this._e(await this.sb.from('cohorts').update(row).eq('id',c.id)); } else { this._e(await this.sb.rpc('open_cohort',{p:row})); } },
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
  async saveSettings(s){ const {admin_pin,...rest}=s; this._e(await this.sb.from('settings').update(rest).eq('id',1)); }
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
    education:pick(['ثانوي','دبلوم','بكالوريوس','بكالوريوس','بكالوريوس','ماجستير','دكتوراه']), employer:pick(['قطاع حكومي','قطاع خاص','قطاع خاص','طالب','باحث عن عمل','عمل حر']), created_at:addDays(today,-60)+'T08:00:00Z'}; };
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
  return D;
}

export let Store = LocalStore;
/* يُستدعى مرة واحدة من boot() بعد تحميل كل الوحدات */
export function initStore(){
  if(SUPABASE_URL && SUPABASE_ANON_KEY && window.supabase){ CloudStore.init(); Store = CloudStore; }
  else LocalStore.load();
}
