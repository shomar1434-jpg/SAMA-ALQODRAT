import { editTraineeModal } from './import_views.js';
import { statementModal } from './statement_views.js';
import { adminWeeklyModal } from './weekly_views.js';
import { LOGO } from './assets/logo.js';
import { pageAdmins, pageAudit, changePasswordModal, logoutAllBox } from './admins_views.js';
import { canSeePage, ADMIN_ROLES } from './admin_logic.js';
import { CATEGORIES, catPill, computeEnd } from './catalog.js';
import { PROFILE_FIELDS, STATE_PILL, STATE_TXT, Store, activeCohortOf, cohortArchived, cohortState, enrollsOf, isSessionDay, progCode, sessionDays, takenOf } from './data2.js';
import { bindCertSection, certSectionHtml, followupRows, pageFollowup, pageRules, setBusy } from './features.js';
import { pagePartners } from './partners.js';
import { exportCSV, pageReports, printDayModal, printSheets, traineesRows } from './print.js';
import { $, $$, DAYS, EDU, addDays, dowOf, esc, fmtDate, fmtNum, fmtShort, riyadhNow, t12, toMin, matchQ, matchPerson, scopeSelect } from './utils.js';
import { countUp, emptyBox, ic, reduceMotion, ringSvg, skeleton, statusPill, toast } from './views2_head.js';
import { catSort, charts, cleanup, cohortLabel, copyText, daysList, daysTxt, hoursTxt, kpiCard, makeQR, programUrl, route, short, titleBar } from './views2_main.js';
import { closeModal, confirmBox, modal, pagePrograms, swRow } from './views2_programs.js';
import { pageSettings } from './views2_settings.js';
import { pageQudurat } from './qudurat_views.js';
import { quduratAnalytics, SECTIONS, planName } from './qudurat.js';
import { pageUsers } from './admin_users.js';
import { pageDaily } from './report_views.js';
import { pagePolicies } from './policy_views.js';
import { pageNotify } from './admin_notify.js';
import { pageBank } from './admin_bank.js';
import { pageOrders, openOrdersCount } from './order_views.js';
import { pageInvoices } from './invoice_views.js';
import { pageData } from './import_views.js';
import { pageAccess } from './access_views.js';
import { requestsHtml, bindRequests } from './request_views.js';
import { PUB_STATES, PUB_TONE, pubState } from './courses.js';

/* =====================================================================
   5) لوحة الإدارة
   ===================================================================== */
export let AD=null; export function setAD(v){ AD=v; }
export let ME=null; export function setMe(v){ ME=v; }
export const flt={ from:null, to:null, prog:'all', cat:'all' };
export const progOf = id => AD.programs.find(p=>p.id===id);
export const progName = id => progOf(id)?.name || '—';
export const allCats = () => [...new Set([...CATEGORIES, ...AD.programs.map(p=>p.category).filter(Boolean)])].sort(catSort);
export async function viewAdmin(r){
  const app=$('#app');
  const me=await Store.adminMe(); setMe(me); /* القائمة الجانبية مجمّعة في أقسام، ولكل صفحة أيقونة تخصها */
  const GROUPS=[['التشغيل اليومي',[['display','qr','باركود محاضرات اليوم'],['admin','chart','لوحة التحليلات'],['admin-attendance','calendar','حضور البرامج التدريبية'],['admin-qudurat','award','القدرات والتحصيلي'],['admin-cohorts','users','الدفعات والكشوف'],['admin-followup','alert','المتابعة'],['admin-daily','clipboard','تقرير اليوم']]],
    ['المتدربون والتعليم',[['admin-trainees','id','المتدربون'],['admin-data','search','مراجعة البيانات'],['admin-users','user','المدربون وأولياء الأمور'],['admin-bank','database','بنوك الأسئلة'],['admin-access','key','تفعيل الأجهزة'],['admin-notify','bell','الإشعارات والرسائل']]],
    ['المالية',[['admin-orders','wallet','طلبات الشراء'],['admin-invoices','receipt','الفوترة والمدفوعات']]],
    ['المحتوى والتقارير',[['admin-programs','book','البرامج والباقات'],['admin-reports','printer','التقارير والطباعة'],['admin-policies','shield','مركز السياسات'],['admin-partners','handshake','النبذة والشركاء']]],
    ['الضبط والحوكمة',[['admin-rules','pie','آلية الاحتساب'],['admin-admins','lock','إدارة المسؤولين'],['admin-audit','history','أرشيف الحركات'],['admin-settings','settings','الإعدادات']]]]
    .map(([g,ps])=>[g,ps.filter(([h])=>canSeePage(me?.role, h))]).filter(([,ps])=>ps.length);
  app.innerHTML = `<div class="admin"><aside class="side">
      <div class="ws"><img src="${LOGO}" alt=""><b>مركز سما القدرات<br><span style="color:var(--hero-muted);font-weight:400;font-size:12.5px">لوحة الإدارة${me?.role?` · ${ADMIN_ROLES[me.role]}`:''}</span></b></div>
      ${GROUPS.map(([g,ps])=>`<div class="sec">${g}</div>${ps.map(([h,i,t])=>`<a href="#${h}" class="${r===h?'on':''}">${ic(i)}${t}</a>`).join('')}`).join('')}
      <div class="sec">أدوات</div>
      <a href="#register">${ic('book')}دليل البرامج</a>
      ${Store.mode==='cloud'?`<a href="#" id="chPass">${ic('key')}تغيير كلمة المرور</a>`:''}
      <a href="#" id="logout">${ic('logout')}خروج</a>
      ${Store.mode==='cloud'?`<a href="#" id="logoutAll">${ic('logout')}الخروج من كل الأجهزة</a>`:''}
    </aside><section class="main" id="main">${skeleton()}</section></div>`;
  $('#logout').onclick=async e=>{ e.preventDefault(); await Store.logout(); location.hash='#register'; };
  if($('#chPass')) $('#chPass').onclick=e=>{ e.preventDefault(); changePasswordModal(); };
  if($('#logoutAll')) $('#logoutAll').onclick=e=>{ e.preventDefault(); logoutAllBox(()=>{ location.hash='#register'; }); };
  if(!canSeePage(me?.role, r)){ $('#main').innerHTML=emptyBox('هذه الصفحة لمدير النظام', 'دورك الحالي: '+(ADMIN_ROLES[me?.role]||'')+'. اطلب من مدير النظام إن احتجت إليها.'); return; }
  try{ AD = await Store.adminData(); }catch(e){ $('#main').innerHTML=emptyBox('تعذّر تحميل البيانات', esc(e.message)); return; }
  if(!flt.to){ flt.to=riyadhNow().date; flt.from=addDays(flt.to,-29); }
  const fu=$('.side a[href="#admin-followup"]'); if(fu){ const n=followupRows().filter(x=>x.level==='bad').length; if(n) fu.insertAdjacentHTML('beforeend',`<span class="badge-n" aria-label="${n} حالة حرجة">${fmtNum(n)}</span>`); }
  { const oa=$('.side a[href="#admin-orders"]'), n=openOrdersCount(AD); if(oa && n) oa.insertAdjacentHTML('beforeend',`<span class="badge-n" aria-label="${n} طلبًا يحتاج إجراء">${fmtNum(n)}</span>`); }
  ({ 'admin-followup':pageFollowup, 'admin-rules':pageRules, 'admin-qudurat':pageQudurat, 'admin-users':pageUsers, 'admin-daily':pageDaily, 'admin-policies':pagePolicies, 'admin-notify':pageNotify, 'admin-bank':pageBank, 'admin-orders':pageOrders, 'admin-invoices':pageInvoices, 'admin-data':pageData, 'admin-access':pageAccess, 'admin':pageDashboard, 'admin-attendance':pageAttendance, 'admin-cohorts':pageCohorts, 'admin-trainees':pageTrainees, 'admin-programs':pagePrograms, 'admin-reports':pageReports, 'admin-partners':pagePartners, 'admin-settings':pageSettings, 'admin-admins':pageAdmins, 'admin-audit':pageAudit })[r]();
}
export async function reloadAD(){ AD = await Store.adminData(); }

/* ---------- لوحة التحليلات ---------- */
export const cssv = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
export function chartTheme(){
  if(!window.Chart) return;
  Chart.defaults.font.family='"Readex Pro","IBM Plex Sans Arabic",Tahoma,sans-serif'; Chart.defaults.font.size=12; Chart.defaults.color=cssv('--ink-muted');
  Chart.defaults.plugins.legend.labels.usePointStyle=true; Chart.defaults.plugins.legend.labels.boxWidth=8;
  Chart.defaults.plugins.tooltip.rtl=true; Chart.defaults.plugins.tooltip.backgroundColor='#0D2F33'; Chart.defaults.plugins.tooltip.titleColor='#fff'; Chart.defaults.plugins.tooltip.bodyColor='#EAF6F4';
  Chart.defaults.plugins.tooltip.padding=10; Chart.defaults.plugins.tooltip.cornerRadius=12;
  Chart.defaults.animation = reduceMotion() ? false : {duration:1000,easing:'easeOutCubic'};
}
export const pal = () => ['--brand','--grad-start','--success','--gold','--early','--warning','--info','--ink-subtle'].map(cssv);
export function mk(id,cfg){ if(!window.Chart||!$('#'+id)) return null; const c=new Chart($('#'+id),cfg); charts.push(c); return c; }
export const gridOpt = () => ({ grid:{color:cssv('--border')}, border:{display:false} });
export const cLabel = c => `${short(progName(c.program_id))} · د${fmtNum(c.number)}`;
/* الحضور المتوقع لدفعة في فترة: عدد المسجلين قبل كل يوم محاضرة */
export function expectedOf(c, from, to){ const today=riyadhNow().date, es=enrollsOf(AD,c.id); let e=0;
  sessionDays(c, today).forEach(d=>{ if(d<from||d>to) return; if(d===today && toMin(riyadhNow().hm)<toMin(c.start_time)) return; e+=es.filter(x=>x.created_at.slice(0,10)<=d).length; }); return e; }

export function pageDashboard(){
  const m=$('#main'); const {programs}=AD;
  m.innerHTML = titleBar(`${ic('chart')}التحليلات`, 'التسجيل والحضور، <em>للدورات والباقات</em>', 'غيّر الفترة فتتحدث المؤشرات والرسوم. قسم «باقات القدرات والتحصيلي» يحلّل حضور البنين والبنات في الفترة، وقسم الدورات يتبع المجال والبرنامج المختارين.', `<button class="btn sm" id="rf">${ic('refresh')} تحديث</button>`)+
    `<div class="filters rv" style="--i:1"><span class="lbl">${ic('calendar')}الفترة</span><input type="date" class="inp" id="fFrom" value="${flt.from}"><span class="lbl">إلى</span><input type="date" class="inp" id="fTo" value="${flt.to}">
      <span class="lbl">${ic('grid')}المجال</span><select class="inp" id="fCat"><option value="all">كل المجالات</option>${allCats().map(c=>`<option ${flt.cat===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
      <span class="lbl">${ic('book')}البرنامج</span><select class="inp" id="fProg" style="max-width:260px"><option value="all">جميع البرامج</option>${allCats().map(c=>{ const ps=programs.filter(p=>p.category===c&&(flt.cat==='all'||flt.cat===c)); return ps.length?`<optgroup label="${esc(c)}">${ps.map(p=>`<option value="${p.id}" ${flt.prog===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</optgroup>`:''; }).join('')}</select>
      <span style="flex:1"></span><div class="seg" style="margin:0">${[7,30,90].map(d=>`<button data-q="${d}">آخر ${fmtNum(d)} يومًا</button>`).join('')}</div></div>
    <h2 class="sec-title rv" style="--i:1;margin-top:6px">${ic('award')}باقات القدرات والتحصيلي <span class="hint" style="font-size:13px;font-weight:400">البنون والبنات · حسب الفترة المختارة</span></h2>
    <div class="grid g2" id="qSec" style="margin-bottom:14px"></div>
    <div class="charts" style="margin-bottom:18px">
      <div class="ch c8 rv" style="--i:2"><h3>${ic('activity')}حضور الباقات اليومي</h3><p>عدد الحاضرين في كل جلسة: البنون والبنات</p><div class="cv"><canvas id="cQTrend"></canvas></div></div>
      <div class="ch c4 rv" style="--i:3"><h3>${ic('award')}نسبة الحضور حسب الباقة</h3><p>الحضور ÷ المتوقع في جلسات الفترة</p><div class="cv"><canvas id="cQPlan"></canvas></div></div>
    </div>
    <h2 class="sec-title rv" style="--i:4">${ic('book')}الدورات والبرامج <span class="hint" style="font-size:13px;font-weight:400">حسب المجال والبرنامج المختارين</span></h2>
    <div class="kpis" id="kpis"></div>
    <div class="charts">
      <div class="ch c8 rv" style="--i:2"><h3>${ic('activity')}اتجاه الحضور اليومي</h3><p>عدد الحاضرين في الوقت والمتأخرين لكل يوم</p><div class="cv"><canvas id="cTrend"></canvas></div></div>
      <div class="ch c4 rv" style="--i:3"><h3>${ic('pie')}التسجيلات حسب المجال</h3><p>توزيع تسجيلات الدفعات على مجالات البرامج</p><div class="cv"><canvas id="cCat"></canvas></div></div>
      <div class="ch c7 rv" style="--i:4"><h3>${ic('seat')}المسجلون والسعة لكل دفعة</h3><p>أعلى ١٠ دفعات تسجيلًا في الفترة</p><div class="cv" style="height:300px"><canvas id="cProg"></canvas></div></div>
      <div class="ch c5 rv" style="--i:5"><h3>${ic('award')}نسبة الحضور لكل دفعة</h3><p>الحضور الفعلي ÷ المتوقع حسب كشف الدفعة</p><div class="cv" style="height:300px"><canvas id="cRate"></canvas></div></div>
      <div class="ch c6 rv" style="--i:6"><h3>${ic('trend')}نمو التسجيلات</h3><p>التسجيلات اليومية والمجموع التراكمي</p><div class="cv"><canvas id="cGrowth"></canvas></div></div>
      <div class="ch c6 rv" style="--i:7"><h3>${ic('grid')}خريطة الحضور الحرارية</h3><p>نسبة الحضور حسب الدفعة ويوم الأسبوع</p><div id="heat" class="heat"></div></div>
      <div class="ch c4 rv" style="--i:8"><h3>${ic('users')}الجنس</h3><p>توزيع المتدربين</p><div class="cv" style="height:220px"><canvas id="cGender"></canvas></div></div>
      <div class="ch c4 rv" style="--i:9"><h3>${ic('grad')}المؤهل العلمي</h3><p>المستوى التعليمي للمسجلين</p><div class="cv" style="height:220px"><canvas id="cEdu"></canvas></div></div>
      <div class="ch c4 rv" style="--i:10"><h3>${ic('city')}المدن والمحافظات</h3><p>أعلى المدن تسجيلًا</p><div class="cv" style="height:220px"><canvas id="cCity"></canvas></div></div>
      <div class="ch c12 rv" style="--i:11"><h3>${ic('award')}ترتيب الدفعات</h3><p>الدفعات المنعقدة في الفترة، مرتبة بنسبة الحضور</p><div style="overflow:auto" id="rank"></div></div>
    </div>`;
  const apply=()=>{ flt.from=$('#fFrom').value; flt.to=$('#fTo').value; flt.prog=$('#fProg').value; cleanup(); drawDashboard(); };
  ['fFrom','fTo','fProg'].forEach(i=>$('#'+i).onchange=apply);
  $('#fCat').onchange=e=>{ flt.cat=e.target.value; flt.prog='all'; cleanup(); pageDashboard(); };
  $$('[data-q]').forEach(b=>b.onclick=()=>{ $('#fTo').value=riyadhNow().date; $('#fFrom').value=addDays(riyadhNow().date,-(+b.dataset.q-1)); apply(); });
  $('#rf').onclick=()=>route();
  drawDashboard();
}
/* باقات القدرات والتحصيلي في لوحة التحليلات: بطاقة لكل قسم، ورسم الحضور اليومي، ونسبة كل باقة */
function drawQudurat(from, to){
  const Q=quduratAnalytics(AD, from, to), G=gridOpt(), tone=r=>r>=85?'ok':r>=70?'info':r>=50?'warn':'bad';
  $('#qSec').innerHTML = ['boys','girls'].map((sec,i)=>{ const q=Q[sec], t=q.today;
    return `<div class="card pad rv" style="--i:${i+2}"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h3 class="ctitle" style="margin:0">${ic('users')}قسم ${SECTIONS[sec]}</h3>
        ${t?`<span class="pill dot ${toMin(riyadhNow().hm)>=toMin(t.end)?'g':toMin(riyadhNow().hm)>=toMin(t.start)?'ok':'warn'}">جلسة اليوم ${t12(t.start)} – ${t12(t.end)}</span>`:'<span class="pill g">لا جلسة اليوم</span>'}</div>
      <div class="qstats" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:12px">
        ${[['المشتركون النشطون',fmtNum(q.active),q.pending?`و${fmtNum(q.pending)} بانتظار أول حضور`:''],['حضور اليوم',t?`${fmtNum(t.present)} من ${fmtNum(t.expected)}`:'—',''],
           ['نسبة الحضور في الفترة',q.expected?fmtNum(q.rate)+'٪':'—',`${fmtNum(q.present)} من ${fmtNum(q.expected)} · ${fmtNum(q.sessions)} جلسة`],['نسبة التأخر',q.present?fmtNum(q.lateRate)+'٪':'—','من الحاضرين']]
          .map(([k,v,h],j)=>`<div style="background:var(--surface-sunken);border-radius:12px;padding:10px"><div class="hint" style="font-size:12px">${k}</div><b style="font-size:20px;font-weight:700;display:block" style="${j===2&&q.expected?`color:var(--${({ok:'success',info:'brand',warn:'warning',bad:'danger'})[tone(q.rate)]})`:''}">${v}</b>${h?`<div class="hint" style="font-size:11.5px">${h}</div>`:''}</div>`).join('')}</div></div>`; }).join('');
  if(!window.Chart) return;
  const dates=[...new Set(Object.values(Q).flatMap(q=>q.days.map(d=>d.date)))].sort();
  const col={boys:cssv('--brand'), girls:cssv('--gold')};
  mk('cQTrend',{type:'bar',data:{labels:dates.map(fmtShort),datasets:['boys','girls'].map(sec=>({label:SECTIONS[sec],data:dates.map(d=>Q[sec].days.find(x=>x.date===d)?.present ?? null),backgroundColor:col[sec],borderRadius:6}))},
    options:{maintainAspectRatio:false,plugins:{legend:{position:'top',align:'end'},tooltip:{callbacks:{afterLabel:c=>{ const sec=['boys','girls'][c.datasetIndex], d=Q[sec].days.find(x=>x.date===dates[c.dataIndex]); return d?`من ${d.expected} متوقع · متأخر ${d.late}`:''; }}}},
      scales:{x:{...G,grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:10}},y:{...G,beginAtZero:true,ticks:{precision:0}}}}});
  const plans=(AD.plans||[]).filter(p=>Object.values(Q).some(q=>q.byPlan[p.id]?.expected));
  mk('cQPlan',{type:'bar',data:{labels:plans.map(p=>planName(p)),datasets:['boys','girls'].map(sec=>({label:SECTIONS[sec],data:plans.map(p=>{ const b=Q[sec].byPlan[p.id]; return b?.expected?Math.round(b.present/b.expected*100):null; }),backgroundColor:col[sec],borderRadius:999,barPercentage:.7}))},
    options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{position:'top',align:'end'},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw}٪`}}},scales:{x:{...G,beginAtZero:true,max:100,ticks:{callback:v=>v+'٪'}},y:{grid:{display:false},border:{display:false}}}}});
}
export function drawDashboard(){
  chartTheme(); const P=pal(), G=gridOpt();
  const {programs,trainees,attendance,cohorts,enrollments}=AD; const {from,to,prog}=flt; const today=riyadhNow().date;
  const scopeIds=new Set(programs.filter(p=>(flt.cat==='all'||p.category===flt.cat)&&(prog==='all'||p.id===prog)).map(p=>p.id));
  const coh = cohorts.filter(c=>scopeIds.has(c.program_id) && c.start_date<=to && c.end_date>=from);
  const cohIds = new Set(coh.map(c=>c.id));
  const ens = enrollments.filter(e=>cohIds.has(e.cohort_id) && e.status!=='ملغى');
  const people = [...new Set(ens.map(e=>e.trainee_id))].map(id=>trainees.find(t=>t.id===id)).filter(Boolean);
  const att = attendance.filter(a=>a.att_date>=from && a.att_date<=to && cohIds.has(a.cohort_id));
  const expMap = Object.fromEntries(coh.map(c=>[c.id, expectedOf(c,from,to)]));
  const exp = Object.values(expMap).reduce((s,v)=>s+v,0);
  const rate = exp? Math.round(att.length/exp*100):0;
  const lateR = att.length? Math.round(att.filter(a=>a.status==='متأخر').length/att.length*100):0;
  const todayAtt = attendance.filter(a=>a.att_date===today && scopeIds.has(a.program_id)).length;
  const activeN = cohorts.filter(c=>scopeIds.has(c.program_id)&&!cohortArchived(c,today)).length;
  const revenue = ens.reduce((s,e)=>s+Number(progOf(e.program_id)?.price||0),0);
  const newIn = ens.filter(e=>e.created_at.slice(0,10)>=from && e.created_at.slice(0,10)<=to).length;
  $('#kpis').innerHTML = [
    kpiCard(0,'users','info','تسجيلات الدفعات',ens.length,'',`${fmtNum(people.length)} متدرب · ${fmtNum(newIn)} جديد`),
    kpiCard(1,'check','success','حضور اليوم',todayAtt,'',fmtDate(today).split('،')[0]),
    kpiCard(2,'award','success','نسبة الحضور',rate,'٪',`${fmtNum(att.length)} من ${fmtNum(exp)} متوقع`),
    kpiCard(3,'timer','warning','نسبة التأخر',lateR,'٪','من إجمالي الحضور'),
    kpiCard(4,'layers','gold','الدفعات النشطة',activeN,'',`${fmtNum(coh.length)} دفعة في الفترة`),
    kpiCard(5,'wallet','early','الإيرادات المتوقعة',Math.round(revenue/1000),' ألف',revenue?'ريال، للبرامج المسعّرة':'حدّد الأسعار لتظهر الإيرادات')
  ].join('');
  countUp($('#kpis'));
  drawQudurat(from, to);
  if(!window.Chart){ $$('.cv').forEach(c=>c.innerHTML=emptyBox('تعذّر تحميل مكتبة الرسوم','تحقق من الاتصال ثم اضغط تحديث.')); }
  const days=[]; for(let d=from; d<=to; d=addDays(d,1)) days.push(d);
  mk('cTrend',{type:'bar',data:{labels:days.map(fmtShort),datasets:[
    {label:'في الوقت',data:days.map(d=>att.filter(a=>a.att_date===d&&a.status!=='متأخر').length),backgroundColor:cssv('--success'),borderRadius:6,stack:'s'},
    {label:'متأخر',data:days.map(d=>att.filter(a=>a.att_date===d&&a.status==='متأخر').length),backgroundColor:cssv('--warning'),borderRadius:6,stack:'s'}]},
    options:{maintainAspectRatio:false,plugins:{legend:{position:'top',align:'end'}},scales:{x:{...G,grid:{display:false},stacked:true,ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:10}},y:{...G,stacked:true,beginAtZero:true,ticks:{precision:0}}}}});
  const byCat=[...new Set(ens.map(e=>progOf(e.program_id)?.category))].filter(Boolean).sort(catSort).map(c=>[c,ens.filter(e=>progOf(e.program_id)?.category===c).length]);
  mk('cCat',{type:'doughnut',data:{labels:byCat.map(x=>x[0]),datasets:[{data:byCat.map(x=>x[1]),backgroundColor:P,borderWidth:3,borderColor:cssv('--surface-card')}]},options:{maintainAspectRatio:false,cutout:'66%',plugins:{legend:{position:'bottom'}}}});
  const top=[...coh].sort((a,b)=>takenOf(AD,b.id)-takenOf(AD,a.id)).slice(0,10);
  mk('cProg',{type:'bar',data:{labels:top.map(cLabel),datasets:[
    {label:'مسجل',data:top.map(c=>takenOf(AD,c.id)),backgroundColor:cssv('--brand'),borderRadius:999,barPercentage:.62},
    {label:'السعة',data:top.map(c=>c.seats),backgroundColor:cssv('--surface-track'),borderRadius:999,barPercentage:.62}]},
    options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{position:'top',align:'end'}},scales:{x:{...G,beginAtZero:true,ticks:{precision:0}},y:{grid:{display:false},border:{display:false}}}}});
  const rateC=coh.filter(c=>expMap[c.id]>0).map(c=>({c,r:Math.round(att.filter(a=>a.cohort_id===c.id).length/expMap[c.id]*100)})).sort((a,b)=>b.r-a.r).slice(0,10);
  mk('cRate',{type:'bar',data:{labels:rateC.map(x=>cLabel(x.c)),datasets:[{label:'نسبة الحضور',data:rateC.map(x=>x.r),backgroundColor:rateC.map(x=>x.r>=85?cssv('--success'):x.r>=70?cssv('--brand'):cssv('--warning')),borderRadius:999,barPercentage:.62}]},
    options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.raw+'٪'}}},scales:{x:{...G,beginAtZero:true,max:100,ticks:{callback:v=>v+'٪'}},y:{grid:{display:false},border:{display:false}}}}});
  const allEns=enrollments.filter(e=>scopeIds.has(e.program_id)&&e.status!=='ملغى');
  let cum=allEns.filter(e=>e.created_at.slice(0,10)<from).length; const daily=days.map(d=>allEns.filter(e=>e.created_at.slice(0,10)===d).length);
  mk('cGrowth',{data:{labels:days.map(fmtShort),datasets:[
    {type:'line',label:'تراكمي',data:daily.map(v=>cum+=v),borderColor:cssv('--grad-start'),backgroundColor:'rgba(31,111,166,.12)',fill:true,tension:.35,pointRadius:0,borderWidth:2.5,yAxisID:'y1'},
    {type:'bar',label:'تسجيلات اليوم',data:daily,backgroundColor:cssv('--gold'),borderRadius:5,yAxisID:'y'}]},
    options:{maintainAspectRatio:false,plugins:{legend:{position:'top',align:'end'}},scales:{x:{grid:{display:false},ticks:{maxRotation:0,autoSkip:true,maxTicksLimit:8}},y:{...G,beginAtZero:true,position:'left',ticks:{precision:0}},y1:{...G,grid:{display:false},position:'right',ticks:{precision:0}}}}});
  const wd=[6,0,1,2,3,4,5], dark=document.documentElement.dataset.theme==='dark';
  let html=`<div class="heat" style="grid-template-columns:170px repeat(7,1fr)"><div></div>${wd.map(d=>`<div class="hl" style="justify-content:center">${DAYS[d]}</div>`).join('')}`;
  const heatC=rateC.map(x=>x.c).slice(0,8);
  if(!heatC.length) html+=`<div style="grid-column:1/-1">${emptyBox('لا توجد دفعات منعقدة في الفترة')}</div>`;
  heatC.forEach(c=>{ html+=`<div class="hl">${esc(cLabel(c))}</div>`; const es=enrollsOf(AD,c.id);
    wd.forEach(w=>{ let e=0,a=0; sessionDays(c,today).forEach(d=>{ if(d<from||d>to||dowOf(d)!==w) return; e+=es.filter(x=>x.created_at.slice(0,10)<=d).length; a+=att.filter(x=>x.cohort_id===c.id&&x.att_date===d).length; });
      if(!e){ html+=`<div class="h" style="background:var(--surface-sunken);color:var(--ink-subtle)">—</div>`; return; }
      const v=Math.round(a/e*100), al=.14+.86*Math.max(0,(v-40)/60);
      html+=`<div class="h" title="${v}٪" style="background:rgba(${dark?'63,180,174':'17,122,126'},${al.toFixed(2)});color:${al>.55?(dark?'#04201F':'#fff'):'var(--ink)'}">${fmtNum(v)}٪</div>`; }); });
  $('#heat').outerHTML = html+'</div>';
  const cnt=(key,vals)=>vals.map(v=>people.filter(t=>t[key]===v).length);
  mk('cGender',{type:'doughnut',data:{labels:['ذكر','أنثى'],datasets:[{data:cnt('gender',['ذكر','أنثى']),backgroundColor:[cssv('--brand'),cssv('--gold')],borderWidth:3,borderColor:cssv('--surface-card')}]},options:{maintainAspectRatio:false,cutout:'64%',plugins:{legend:{position:'bottom'}}}});
  mk('cEdu',{type:'bar',data:{labels:EDU,datasets:[{data:cnt('education',EDU),backgroundColor:cssv('--grad-start'),borderRadius:8}]},options:{maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{...G,beginAtZero:true,ticks:{precision:0}}}}});
  const cities=[...new Set(people.map(t=>t.city))].map(c=>[c,people.filter(t=>t.city===c).length]).sort((a,b)=>b[1]-a[1]).slice(0,6);
  mk('cCity',{type:'bar',data:{labels:cities.map(c=>c[0]),datasets:[{data:cities.map(c=>c[1]),backgroundColor:cssv('--success'),borderRadius:999,barPercentage:.62}]},options:{indexAxis:'y',maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{x:{...G,beginAtZero:true,ticks:{precision:0}},y:{grid:{display:false},border:{display:false}}}}});
  const rows = coh.filter(c=>expMap[c.id]>0).map(c=>{ const a=att.filter(x=>x.cohort_id===c.id), en=takenOf(AD,c.id);
    return {c, en, a:a.length, late:a.filter(x=>x.status==='متأخر').length, r:Math.round(a.length/expMap[c.id]*100), occ:Math.round(en/c.seats*100)}; }).sort((x,y)=>y.r-x.r);
  $('#rank').innerHTML = rows.length? `<table class="tb"><thead><tr><th>#</th><th>البرنامج والدفعة</th><th>الحالة</th><th>المسجلون</th><th>الإشغال</th><th>مرات الحضور</th><th>التأخر</th><th>نسبة الحضور</th><th></th></tr></thead><tbody>${rows.map((x,i)=>`<tr>
    <td><b>${fmtNum(i+1)}</b></td><td><b style="font-weight:600">${esc(progName(x.c.program_id))}</b><div class="hint">${cohortLabel(x.c)} · ${fmtShort(x.c.start_date)} – ${fmtShort(x.c.end_date)}</div></td>
    <td><span class="pill dot ${STATE_PILL[cohortState(x.c)]}">${STATE_TXT[cohortState(x.c)]}</span></td><td>${fmtNum(x.en)}</td>
    <td style="min-width:120px"><div class="bar"><i class="${x.occ>=100?'bad':x.occ>85?'hot':''}" style="width:${Math.min(100,x.occ)}%"></i></div><span class="hint">${fmtNum(x.occ)}٪</span></td>
    <td>${fmtNum(x.a)}</td><td>${fmtNum(x.late)}</td><td>${ringSvg(x.r,46,5,x.r>=85?'success':x.r>=70?'brand':'warning')}</td>
    <td><button class="btn sm" data-cv="${x.c.id}">${ic('form')} الكشف</button></td></tr>`).join('')}</tbody></table>` : emptyBox('لم تنعقد أي دفعة في هذه الفترة','وسّع الفترة أو اختر مجالًا آخر.');
  $$('[data-cv]').forEach(b=>b.onclick=()=>{ cohortView=b.dataset.cv; location.hash='#admin-cohorts'; });
}

/* ---------- الحضور اليومي ---------- */
export let attDate=null, attQ='';
export function pageAttendance(){
  const m=$('#main'); attDate = attDate || riyadhNow().date;
  const {trainees,attendance,cohorts}=AD; const today=riyadhNow().date, future=attDate>today;
  const sess = cohorts.filter(c=>isSessionDay(c,attDate)).sort((a,b)=>toMin(a.start_time)-toMin(b.start_time));
  const dayAtt = attendance.filter(a=>a.att_date===attDate);
  const rosterOf = c => enrollsOf(AD,c.id).filter(e=>e.created_at.slice(0,10)<=attDate);
  const totalExp = sess.reduce((s,c)=>s+rosterOf(c).length,0);
  const late = dayAtt.filter(a=>a.status==='متأخر').length;
  m.innerHTML = titleBar(`${ic('calendar')}حضور البرامج التدريبية · ${fmtDate(attDate)}`, `حضور اليوم، <em>${fmtNum(dayAtt.length)} من ${fmtNum(totalExp)}</em>`, 'لكل دفعة منعقدة كشفها: الحاضرون أولًا بترتيب وقت الدخول، ثم الغائبون. يمكنك التحضير اليدوي وطباعة الكشوف كنماذج إثبات.', `${sess.length&&!future?`<button class="btn pri sm" id="prAll">${ic('form')} طباعة كشوف اليوم</button>`:''}<a class="btn sm" href="#display">${ic('qr')} باركود محاضرات اليوم</a>`)+
    `<div class="filters rv" style="--i:1"><button class="btn sm" id="pd">${ic('prev')} السابق</button><input type="date" class="inp" id="ad" value="${attDate}"><button class="btn sm" id="nd">التالي ${ic('next')}</button>
      <button class="btn sm" id="td">اليوم</button><span style="flex:1"></span><input class="inp" id="aq" placeholder="بحث بالاسم أو السجل المدني" value="${esc(attQ)}" style="min-width:230px"></div>
    <div class="kpis" style="grid-template-columns:repeat(4,1fr)">
      ${kpiCard(0,'layers','info','دفعات اليوم',sess.length,'','دفعة لها محاضرة')}
      ${kpiCard(1,'check','success','الحاضرون',dayAtt.length,'',`من ${fmtNum(totalExp)} في الكشوف`)}
      ${kpiCard(2,'timer','warning','المتأخرون',late,'','بعد مهلة التأخر')}
      ${kpiCard(3,'x','danger','الغائبون',future?0:Math.max(0,totalExp-dayAtt.length),'',future?'يوم قادم':'حتى الآن')}</div>
    <div id="sessList">${sess.length?'':emptyBox('لا توجد محاضرات في هذا اليوم','اختر يومًا آخر من الشريط أعلاه.')}</div>`;
  countUp(m);
  const match=t=>matchQ(attQ,t.full_name,t.national_id,t.phone);
  $('#sessList').innerHTML += sess.map((c,si)=>{
    const roster=rosterOf(c), present=dayAtt.filter(a=>a.cohort_id===c.id), pct=roster.length?Math.round(present.length/roster.length*100):0;
    const rows=roster.map(e=>({e,t:trainees.find(x=>x.id===e.trainee_id),a:present.find(x=>x.enrollment_id===e.id)})).filter(x=>x.t&&match(x.t)).sort((x,y)=>(x.a?0:1)-(y.a?0:1)||(x.a&&y.a?x.a.time.localeCompare(y.a.time):0));
    return `<div class="card prog-sec rv" style="--i:${si+4}"><div class="hd">${ringSvg(pct,58,6,pct>=85?'success':pct>=70?'brand':'warning')}
      <div style="flex:1;min-width:200px"><h3>${esc(progName(c.program_id))} · ${cohortLabel(c)}</h3><div class="hint" style="display:flex;gap:12px;flex-wrap:wrap"><span>${ic('clock')} ${t12(c.start_time)} – ${t12(c.end_time)}</span>${c.hall?`<span>${ic('pin')} ${esc(c.hall)}</span>`:''}<span class="pill dot ${STATE_PILL[cohortState(c)]}">${STATE_TXT[cohortState(c)]}</span></div></div>
      <span class="pill dot ok">${fmtNum(present.length)} حاضر</span><span class="pill dot bad">${fmtNum(roster.length-present.length)} غائب</span>${future?'':`<button class="btn sm" data-pr="${c.id}">${ic('form')} طباعة</button>`}<button class="btn sm" data-cv="${c.id}">${ic('users')} كشف الدفعة</button></div>
      <div style="overflow:auto"><table class="tb"><thead><tr><th>المتدرب</th><th>السجل المدني</th><th>وقت الحضور</th><th>الحالة</th><th></th></tr></thead><tbody>
      ${rows.map(({e,t,a})=>`<tr><td><div class="who"><span class="avatar ${t.gender==='أنثى'?'f':''}">${esc(t.full_name[0])}</span><b style="font-weight:500">${esc(t.full_name)}</b></div></td>
        <td dir="ltr" style="text-align:right">${esc(t.national_id)}</td><td dir="ltr" style="text-align:right">${a?t12(a.time.slice(0,5)):'—'}${a?.manual?' <span class="pill g">يدوي</span>':''}</td>
        <td>${a?`<span class="pill dot ${statusPill(a.status)}">${a.status==='متأخر'?'متأخر':'في الوقت'}</span>`:`<span class="pill dot ${future?'g':'bad'}">${future?'لم يبدأ':'غائب'}</span>`}</td>
        <td style="white-space:nowrap">${future?'':a?`<button class="btn sm danger soft" data-un="${e.id}">${ic('x')} إلغاء التحضير</button>`:`<button class="btn sm" data-mk="${e.id}">${ic('check')} تحضير يدوي</button>`}</td></tr>`).join('') || '<tr><td colspan="5" class="hint" style="text-align:center;padding:20px">لا نتائج</td></tr>'}
      </tbody></table></div></div>`; }).join('');
  const go=d=>{ attDate=d; pageAttendance(); };
  $('#ad').onchange=e=>go(e.target.value); $('#pd').onclick=()=>go(addDays(attDate,-1)); $('#nd').onclick=()=>go(addDays(attDate,1)); $('#td').onclick=()=>go(today);
  $('#aq').oninput=e=>{ attQ=e.target.value; clearTimeout(window._aq); window._aq=setTimeout(()=>{ pageAttendance(); const el=$('#aq'); el.focus(); el.setSelectionRange(el.value.length,el.value.length); },300); };
  if($('#prAll')) $('#prAll').onclick=()=>printSheets(sess.map(c=>({c,date:attDate})), `كشوف حضور ${fmtDate(attDate)}`);
  $$('[data-pr]').forEach(b=>b.onclick=()=>{ const c=AD.cohorts.find(x=>x.id===b.dataset.pr); printSheets([{c,date:attDate}], `${progName(c.program_id)} · ${cohortLabel(c)}`); });
  $$('[data-mk]').forEach(b=>b.onclick=async()=>{ await Store.setAttendance(b.dataset.mk, attDate, 'حاضر'); await reloadAD(); toast('سُجّل الحضور يدويًا'); pageAttendance(); });
  $$('[data-un]').forEach(b=>b.onclick=async()=>{ await Store.setAttendance(b.dataset.un, attDate, null); await reloadAD(); toast('أُلغي التحضير'); pageAttendance(); });
  $$('[data-cv]').forEach(b=>b.onclick=()=>{ cohortView=b.dataset.cv; location.hash='#admin-cohorts'; });
}

/* ---------- الدفعات: النشطة والمؤرشفة، وكشف كل دفعة ---------- */
export let cohortView=null, cohTab='active', cohQ='';
export function setCohortView(v){ cohortView=v; }
export function pageCohorts(){
  if(cohortView && AD.cohorts.some(c=>c.id===cohortView)) return pageCohortDetail(cohortView);
  cohortView=null;
  const m=$('#main'), today=riyadhNow().date;
  const act=AD.cohorts.filter(c=>!cohortArchived(c,today)).sort((a,b)=>a.start_date.localeCompare(b.start_date));
  const arc=AD.cohorts.filter(c=>cohortArchived(c,today)).sort((a,b)=>b.end_date.localeCompare(a.end_date));
  const mt=c=>matchQ(cohQ,progName(c.program_id),c.trainer,c.hall);
  m.innerHTML = titleBar(`${ic('users')}الدفعات والكشوف`, `${fmtNum(act.length)} دفعة نشطة، <em>و${fmtNum(arc.length)} في الأرشيف</em>`, 'لكل برنامج دفعة نشطة واحدة بكشف تسجيلها، وهو ما يعتمد عليه التحضير اليومي. تُؤرشف الدفعة تلقائيًا بعد انتهاء مدتها. والتحضير اليومي بباركود المركز الموحد في «باركود محاضرات اليوم»، ولكل برنامج باركود تسجيل خاص به.',
      `<a class="btn pri sm" href="#admin-programs">${ic('plus')} فتح دفعة لبرنامج</a>`)+
    requestsHtml(AD)+`<div class="filters rv" style="--i:1"><div class="seg" style="margin:0"><button data-ct="active" class="${cohTab==='active'?'on':''}">${ic('activity')}النشطة <span class="pill g">${fmtNum(act.length)}</span></button><button data-ct="archived" class="${cohTab==='archived'?'on':''}">${ic('database')}الأرشيف <span class="pill g">${fmtNum(arc.length)}</span></button><button data-ct="pub" class="${cohTab==='pub'?'on':''}">${ic('monitor')}العرض في الرئيسية</button></div>
      <span style="flex:1"></span><input class="inp" id="cq" placeholder="بحث باسم البرنامج" value="${esc(cohQ)}" style="min-width:220px"></div>
    <div id="cohList"></div>`;
  if(cohTab==='pub'){ pubTab(); $$('[data-ct]').forEach(b=>b.onclick=()=>{ cohTab=b.dataset.ct; pageCohorts(); }); $('#cq').oninput=e=>{ cohQ=e.target.value; clearTimeout(window._cq); window._cq=setTimeout(()=>{ pageCohorts(); const el=$('#cq'); el.focus(); el.setSelectionRange(el.value.length,el.value.length); },300); }; return; }
  const list=(cohTab==='active'?act:arc).filter(mt);
  $('#cohList').innerHTML = cohTab==='active'
    ? (list.length ? `<div class="grid g2">${list.map((c,i)=>{ const p=progOf(c.program_id), st=cohortState(c,today), tk=takenOf(AD,c.id), pc=Math.min(100,Math.round(tk/c.seats*100));
        const done=sessionDays(c,today).length, all=sessionDays(c).length, exp=expectedOf(c,c.start_date,today), at=AD.attendance.filter(a=>a.cohort_id===c.id).length, r=exp?Math.round(at/exp*100):0;
        return `<div class="card pad rv" style="--i:${i+2};display:flex;flex-direction:column;gap:10px">
          <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="pill dot ${catPill(p?.category)}">${esc(p?.category||'')}</span><span style="display:flex;gap:6px"><span class="pill dot ${STATE_PILL[st]}">${STATE_TXT[st]}</span><span class="pill dot ${c.reg_open?'ok':'g'}">${c.reg_open?'التسجيل مفتوح':'التسجيل مغلق'}</span></span></div>
          <div style="display:flex;gap:14px;align-items:center">${ringSvg(st==='upcoming'?0:r,62,6,r>=85?'success':r>=70?'brand':'warning')}<div style="min-width:0"><h3 style="font-size:17px;font-weight:600">${esc(p?.name||'')}</h3><div class="hint">${cohortLabel(c)} · ${fmtShort(c.start_date)} – ${fmtShort(c.end_date)} · ${t12(c.start_time)}</div><div class="hint">${st==='upcoming'?`تبدأ بعد ${fmtNum(Math.round((new Date(c.start_date)-new Date(today))/864e5))} يومًا`:`أُنجز ${fmtNum(done)} من ${fmtNum(all)} أيام · نسبة الحضور ${fmtNum(r)}٪`}</div></div></div>
          <div class="bar"><i class="${pc>=100?'bad':pc>85?'hot':''}" style="width:${pc}%"></i></div><div class="hint">${fmtNum(tk)} مسجّل من ${fmtNum(c.seats)} مقعد</div>
          <label class="sw" style="min-height:36px"><span class="hint" style="font-size:14px">استقبال التسجيل في نموذج البرنامج</span><input type="checkbox" data-ro="${c.id}" ${c.reg_open?'checked':''}><i></i></label>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:auto"><button class="btn pri sm" data-cv="${c.id}">${ic('form')} كشف الدفعة</button><a class="btn sm" href="#qr-${progCode(p)}">${ic('qr')} الباركود</a><button class="btn sm" data-cp="${progCode(p)}">${ic('copy')} رابط التسجيل</button><button class="btn sm" data-ec="${c.id}">${ic('edit')}</button><button class="btn sm danger soft" data-ar="${c.id}">${ic('database')} أرشفة</button></div></div>`; }).join('')}</div>`
        : emptyBox('لا توجد دفعات نشطة','افتح دفعة لأي برنامج من صفحة البرامج، فيُنشأ نموذج تسجيلها وباركودها.'))
    : (list.length ? `<div class="tbw rv" style="--i:2"><table class="tb"><thead><tr><th>البرنامج والدفعة</th><th>المدة</th><th>المسجلون</th><th>نسبة الحضور</th><th>أتمّوا ٧٥٪ فأكثر</th><th>الأرشفة</th><th></th></tr></thead><tbody>${list.map(c=>{ const s=cohortSummary(c);
        return `<tr><td><b style="font-weight:500">${esc(progName(c.program_id))}</b><div class="hint">${cohortLabel(c)}</div></td><td class="num">${fmtShort(c.start_date)} – ${fmtShort(c.end_date)}</td><td>${fmtNum(s.n)}</td>
          <td>${ringSvg(s.rate,44,5,s.rate>=85?'success':s.rate>=70?'brand':'warning')}</td><td>${fmtNum(s.done75)} من ${fmtNum(s.n)}</td>
          <td><span class="pill ${c.archived_auto?'g':'o'}">${c.archived_auto?'تلقائية بعد الانتهاء':'يدوية'}</span><div class="hint">${fmtShort((c.archived_at||c.end_date).slice(0,10))}</div></td>
          <td><button class="btn sm" data-cv="${c.id}">${ic('form')} السجل</button></td></tr>`; }).join('')}</tbody></table></div>` : emptyBox('الأرشيف فارغ','تُنقل الدفعات إلى هنا تلقائيًا بعد انتهاء مدتها، بكشوفها وسجل حضورها كاملًا.'));
  $$('[data-ct]').forEach(b=>b.onclick=()=>{ cohTab=b.dataset.ct; pageCohorts(); });
  $('#cq').oninput=e=>{ cohQ=e.target.value; clearTimeout(window._cq); window._cq=setTimeout(()=>{ pageCohorts(); const el=$('#cq'); el.focus(); el.setSelectionRange(el.value.length,el.value.length); },300); };
  bindCohortActions(pageCohorts);
}
/* حالة عرض البرامج في الرئيسية (البند 14): تلقائي، غير منشور، قريبًا، مفتوح (يشترط دفعة مفتوحة)، مغلق، مؤرشف */
function pubTab(){ const today=riyadhNow().date;
  const rows=AD.programs.filter(p=>p.active!==false && matchQ(cohQ,p.name,p.category)).map(p=>{ const c=activeCohortOf(AD,p.id,today); return {p, pub:{...p, cohort:c?{...c, taken:takenOf(AD,c.id)}:null}}; })
    .sort((a,b)=>(pubState(b.pub)==='open_for_registration')-(pubState(a.pub)==='open_for_registration')||a.p.name.localeCompare(b.p.name,'ar'));
  const eff=x=>{ const k=pubState(x.pub); return k ? `<span class="pill dot ${PUB_TONE[k]}">${k==='open_for_registration'?'في «دورات متاحة حاليا»':k==='coming_soon'?'في «دورات متاحة قريبا»':PUB_STATES[k]}</span>` : '<span class="pill g">لا يظهر في الرئيسية</span>'; };
  $('#cohList').innerHTML = `<p class="hint rv">تحدد هنا ظهور كل برنامج في قسمي «دورات متاحة حاليا» و«دورات متاحة قريبا». المفتوح للتسجيل يشترط دفعة نشطة مفتوحة التسجيل، وينتقل البرنامج إليه تلقائيًا عند فتحها. «قريبًا» إعلان مع تسجيل اهتمام فقط، وغير المنشور والمغلق والمؤرشف لا يقبل التسجيل. كل تغيير يُسجَّل في أرشيف الحركات.</p>
    <div class="tbw rv"><table class="tb" id="pubT"><thead><tr><th>البرنامج</th><th>الدفعة</th><th>حالة العرض</th><th>الموعد المتوقع</th><th>الظهور الآن</th><th></th></tr></thead><tbody>${rows.map(x=>`<tr data-pr="${x.p.id}"><td><b style="font-weight:500">${esc(x.p.name)}</b><div class="hint">${esc(x.p.category||'')}</div></td>
      <td>${x.pub.cohort?`${cohortLabel(x.pub.cohort)}<div class="hint">${x.pub.cohort.reg_open?'التسجيل مفتوح':'التسجيل مغلق'}</div>`:'<span class="hint">لا دفعة نشطة</span>'}</td>
      <td><select class="inp" data-ps aria-label="حالة عرض ${esc(x.p.name)}"><option value="">تلقائي</option>${Object.entries(PUB_STATES).map(([k,v])=>`<option value="${k}" ${x.p.publish_state===k?'selected':''}>${v}</option>`).join('')}</select></td>
      <td><input class="inp" type="date" data-pe value="${x.p.expected_start||''}" aria-label="الموعد المتوقع"></td><td>${eff(x)}</td><td><button class="btn sm pri" data-psv>${ic('check')} حفظ</button></td></tr>`).join('')}</tbody></table></div>`;
  $$('#pubT [data-psv]').forEach(b=>b.onclick=async()=>{ const tr=b.closest('tr'); setBusy(b,true,'جارٍ الحفظ');
    try{ await Store.setPublish(tr.dataset.pr, $('[data-ps]',tr).value, $('[data-pe]',tr).value); await reloadAD(); toast('حُفظت حالة العرض'); pageCohorts(); }catch(x){ setBusy(b,false); toast(x.message); } });
}
export function cohortSummary(c){ const today=riyadhNow().date, es=enrollsOf(AD,c.id), ds=sessionDays(c,today), at=AD.attendance.filter(a=>a.cohort_id===c.id);
  const exp=expectedOf(c,c.start_date,c.end_date), rate=exp?Math.round(at.length/exp*100):0;
  const per=es.map(e=>{ const myDays=ds.filter(d=>d>=e.created_at.slice(0,10)); const n=at.filter(a=>a.enrollment_id===e.id).length; return {e, n, of:myDays.length, r:myDays.length?Math.round(n/myDays.length*100):0}; });
  return {n:es.length, rate, per, done75:per.filter(x=>x.of&&x.r>=75).length, days:ds}; }
export function bindCohortActions(back){
  $$('[data-cv]').forEach(b=>b.onclick=()=>{ cohortView=b.dataset.cv; pageCohorts(); window.scrollTo(0,0); });
  $$('[data-cp]').forEach(b=>b.onclick=()=>{ const p=AD.programs.find(x=>progCode(x)===b.dataset.cp); copyText(programUrl(p,AD.settings),'نُسخ رابط نموذج التسجيل'); });
  bindRequests(AD, async()=>{ await reloadAD(); pageCohorts(); });
  $$('[data-ro]').forEach(x=>x.onchange=async()=>{ const c=AD.cohorts.find(y=>y.id===x.dataset.ro); await Store.saveCohort({...c, reg_open:x.checked}); await reloadAD(); toast(x.checked?'فُتح التسجيل في الدفعة':'أُغلق التسجيل في الدفعة'); back(); });
  $$('[data-ec]').forEach(b=>b.onclick=()=>{ const c=AD.cohorts.find(y=>y.id===b.dataset.ec); cohortModal(progOf(c.program_id), c, back); });
  $$('[data-ar]').forEach(b=>b.onclick=()=>{ const c=AD.cohorts.find(y=>y.id===b.dataset.ar);
    modal(`<div class="alert t-warning"><span class="aic">${ic('database')}</span><div><b style="font-weight:600;font-size:16px">أرشفة ${cohortLabel(c)} من «${esc(progName(c.program_id))}»</b><div class="hint">يُغلق التسجيل والتحضير في هذه الدفعة، ويُحفظ كشفها وسجل حضورها في الأرشيف. بعدها يمكنك فتح دفعة جديدة على الباركود نفسه.${c.end_date>riyadhNow().date?' لم تنتهِ مدة الدفعة بعد.':''}</div></div></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn" id="mc">إلغاء</button><button class="btn pri" id="mo">${ic('database')} أرشفة الدفعة</button></div>`);
    $('#mc').onclick=closeModal; $('#mo').onclick=async e=>{ setBusy(e.currentTarget,true,'جارٍ الأرشفة وإصدار الشهادات'); await Store.archiveCohort(c.id); await reloadAD(); closeModal(); const n=(AD.certificates||[]).filter(x=>x.cohort_id===c.id).length; toast(`أُرشفت الدفعة${n?` وصدرت ${fmtNum(n)} شهادة`:''}`); cohortView=null; back(); }; });
}
export function pageCohortDetail(id){
  const m=$('#main'), today=riyadhNow().date, c=AD.cohorts.find(x=>x.id===id), p=progOf(c.program_id), st=cohortState(c,today), arch=st==='archived';
  const s=cohortSummary(c), allDays=sessionDays(c), attOf=(eid,d)=>AD.attendance.find(a=>a.enrollment_id===eid&&a.att_date===d);
  const rows=s.per.map(x=>({...x,t:AD.trainees.find(t=>t.id===x.e.trainee_id)})).filter(x=>x.t).sort((a,b)=>a.t.full_name.localeCompare(b.t.full_name,'ar'));
  const cancelled=enrollsOf(AD,c.id,true).filter(e=>e.status==='ملغى');
  m.innerHTML = titleBar(`${ic(arch?'database':'users')}${cohortLabel(c)} · ${STATE_TXT[st]}`, `${esc(p.name)}`, `${fmtDate(c.start_date)} إلى ${fmtDate(c.end_date)} · ${daysList(c)} · ${t12(c.start_time)} – ${t12(c.end_time)}${c.hall?` · ${esc(c.hall)}`:''}`,
      `<button class="btn sm" id="bk">${ic('prev')} الدفعات</button>${arch?'':`<a class="btn pri sm" href="#qr-${progCode(p)}">${ic('qr')} الباركود</a><button class="btn sm" data-ec="${c.id}">${ic('edit')} تعديل</button><button class="btn sm" data-ar="${c.id}">${ic('database')} أرشفة</button>`}<button class="btn sm" id="prD">${ic('form')} طباعة وتصدير</button><button class="btn sm" id="cpy">${ic('copy')} نسخ الكشف</button>`)+
    `<div class="kpis" style="grid-template-columns:repeat(4,1fr)">
      ${kpiCard(0,'users','info','المسجلون في الكشف',s.n,'',`من ${fmtNum(c.seats)} مقعد${cancelled.length?` · ${fmtNum(cancelled.length)} ملغى`:''}`)}
      ${kpiCard(1,'calendar','gold','أيام المحاضرات',s.days.length,'',`من ${fmtNum(allDays.length)} يوم`)}
      ${kpiCard(2,'award','success','نسبة الحضور',s.rate,'٪','للدفعة كاملة')}
      ${kpiCard(3,'check','early','أتمّوا ٧٥٪ فأكثر',s.done75,'',`من ${fmtNum(s.n)} متدرب`)}</div>
    ${arch?`<div class="alert t-gold rv" style="margin-bottom:16px"><span class="aic">${ic('database')}</span><span>دفعة مؤرشفة ${c.archived_auto?'تلقائيًا بعد انتهاء مدتها':'يدويًا'}. الكشف وسجل الحضور للاطلاع فقط.</span></div>`:''}
    <div class="card rv" style="--i:5;overflow:hidden"><div class="hd" style="display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid var(--border);flex-wrap:wrap"><h3 class="ctitle" style="flex:1">${ic('form')}كشف التحضير</h3>
      <span class="legend"><i class="sc ok"></i>في الوقت <i class="sc warn"></i>متأخر <i class="sc bad"></i>غائب <i class="sc"></i>لم يحن</span></div>
      ${rows.length?`<div style="overflow:auto;max-height:640px"><table class="tb sheet"><thead><tr><th style="position:sticky;right:0;z-index:2;background:var(--surface-sunken)">المتدرب</th>${allDays.map(d=>`<th class="dcol" title="${fmtDate(d)}">${DAYS[dowOf(d)].replace('ال','').slice(0,3)}<br><span class="num">${fmtShort(d)}</span></th>`).join('')}<th>الحضور</th>${arch?'':'<th></th>'}</tr></thead><tbody>
      ${rows.map(x=>`<tr><td style="position:sticky;right:0;background:var(--surface-card);z-index:1;min-width:220px"><div class="who"><span class="avatar ${x.t.gender==='أنثى'?'f':''}">${esc(x.t.full_name[0])}</span><div><b style="font-weight:500">${esc(x.t.full_name)}</b><div class="hint num" dir="ltr" style="text-align:right">${esc(x.t.national_id)} · ${esc(x.t.phone)}</div></div></div></td>
        ${allDays.map(d=>{ const a=attOf(x.e.id,d), before=d<x.e.created_at.slice(0,10), fut=d>today||(d===today&&!a);
          const cls=a?(a.status==='متأخر'?'warn':'ok'):(fut||before?'':'bad');
          return `<td class="dcol"><button class="sc ${cls}" ${arch||d>today?'disabled':''} data-tg="${x.e.id}|${d}" title="${a?`${a.status} ${t12(a.time.slice(0,5))}${a.manual?' (يدوي)':''}`:before?'قبل تسجيله':fut?'لم يحن':'غائب'}">${a?(a.status==='متأخر'?ic('timer'):ic('check')):(cls==='bad'?ic('x'):'')}</button></td>`; }).join('')}
        <td style="min-width:120px"><div class="bar"><i class="${x.r<60?'bad':x.r<75?'hot':''}" style="width:${x.r}%"></i></div><span class="hint">${fmtNum(x.n)} من ${fmtNum(x.of)} · ${fmtNum(x.r)}٪</span></td>
        ${arch?'':`<td style="white-space:nowrap"><button class="btn sm danger soft" data-cx="${x.e.id}" title="إلغاء التسجيل">${ic('x')}</button></td>`}</tr>`).join('')}
      </tbody></table></div>`:emptyBox('لا يوجد مسجلون في هذه الدفعة بعد', arch?'':'شارك رابط التسجيل أو الباركود مع المتدربين.')}</div>
    ${arch?'':`<p class="hint" style="margin-top:10px">اضغط خانة يوم سابق للتحضير اليدوي أو إلغائه.</p>`}${certSectionHtml(c)}`;
  countUp(m);
  $('#bk').onclick=()=>{ cohortView=null; pageCohorts(); };
  $('#prD').onclick=()=>printDayModal(c);
  bindCertSection(c, ()=>pageCohortDetail(id));
  bindCohortActions(()=>pageCohorts());
  $$('[data-tg]').forEach(b=>b.onclick=async()=>{ const [eid,d]=b.dataset.tg.split('|'); const a=attOf(eid,d); await Store.setAttendance(eid,d,a?null:'حاضر'); await reloadAD(); pageCohortDetail(id); });
  $$('[data-cx]').forEach(b=>b.onclick=()=>confirmBox('إلغاء تسجيل المتدرب','يُزال من كشف الدفعة ولا يُحضَّر فيها، ويبقى سجله السابق.', async()=>{ await Store.setEnrollmentStatus(b.dataset.cx,'ملغى'); await reloadAD(); toast('أُلغي التسجيل'); pageCohortDetail(id); }, 'إلغاء التسجيل'));
  $('#cpy').onclick=()=>{ const head=['الاسم','السجل المدني','الجوال','المدينة',...allDays.map(d=>d),'أيام الحضور','النسبة'];
    const body=rows.map(x=>[x.t.full_name,x.t.national_id,x.t.phone,x.t.city,...allDays.map(d=>{ const a=attOf(x.e.id,d); return a?(a.status==='متأخر'?'متأخر':'حاضر'):(d>today?'':'غائب'); }),x.n,x.r+'%']);
    copyText([[`${p.name} — ${cohortLabel(c)}`],head,...body].map(r=>r.join('\t')).join('\n'),'نُسخ الكشف، الصقه في Excel'); };
}

/* ---------- فتح دفعة / تعديلها ---------- */
export function cohortModal(p, c, back){
  const isNew=!c, today=riyadhNow().date, nextNum=Math.max(0,...AD.cohorts.filter(x=>x.program_id===p.id).map(x=>x.number))+1;
  c = c || {program_id:p.id, start_date:addDays(today,7), end_date:'', days:[0,1,2,3,4], start_time:'16:00', end_time:'19:00', seats:25, hall:'', trainer:'', reg_open:true};
  modal(`<h3>${isNew?`فتح التسجيل: الدفعة ${fmtNum(nextNum)}`:`تعديل ${cohortLabel(c)}`}</h3>
    <div class="alert t-info" style="margin:-6px 0 14px"><span class="aic">${ic('book')}</span><span><b style="font-weight:600">${esc(p.name)}</b><span class="hint" style="display:block">${hoursTxt(p.hours)} · ${daysTxt(p.duration_days)}${p.accreditation_no?` · اعتماد ${esc(p.accreditation_no)}`:''}</span></span></div>
    <form id="cm" class="grid g2" novalidate>
      <div class="field" style="grid-column:1/-1"><label>أيام المحاضرات</label><div class="daychips">${DAYS.map((d,i)=>`<label><input type="checkbox" name="d" value="${i}" ${(c.days||[]).includes(i)?'checked':''}><span>${d}</span></label>`).join('')}</div></div>
      <div class="field"><label>تاريخ البداية</label><input class="inp" name="start_date" type="date" value="${c.start_date}"></div>
      <div class="field"><label>تاريخ النهاية</label><input class="inp" name="end_date" type="date" value="${c.end_date||''}"><span class="hint">يُحسب من عدد أيام البرنامج وأيام المحاضرات، ويمكنك تعديله.</span></div>
      <div class="field"><label>وقت البداية</label><input class="inp" name="start_time" type="time" value="${String(c.start_time).slice(0,5)}"></div>
      <div class="field"><label>وقت النهاية</label><input class="inp" name="end_time" type="time" value="${String(c.end_time).slice(0,5)}"></div>
      <div class="field"><label>عدد المقاعد</label><input class="inp" name="seats" type="number" min="1" value="${c.seats}"></div>
      <div class="field"><label>القاعة</label><input class="inp" name="hall" value="${esc(c.hall||'')}"></div>
      <div class="field"><label>المدرب (حساب مسجّل)</label><select class="inp" name="teacher_id"><option value="">غير مرتبط بحساب</option>${(AD.teachers||[]).filter(t=>t.active!==false||t.id===c.teacher_id).sort((a,b)=>a.full_name.localeCompare(b.full_name,'ar')).map(t=>`<option value="${t.id}" ${c.teacher_id===t.id?'selected':''}>${esc(t.full_name)}</option>`).join('')}</select><span class="hint">المدرب المرتبط يرى كشف الدفعة وحضورها في بوابته. أضف المدربين من «المدربون وأولياء الأمور».</span></div>
      <div class="field"><label>اسم المدرب في الكشوف</label><input class="inp" name="trainer" value="${esc(c.trainer||'')}"></div>
      <div style="grid-column:1/-1">${swRow('reg_open','استقبال التسجيل الآن',c.reg_open,'يظهر نموذج التسجيل في صفحة البرنامج وعند مسح الباركود.')}</div>
      <div class="errtxt" id="cmE" style="grid-column:1/-1"></div>
      <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="cmC">إلغاء</button><button class="btn pri">${ic('check')} ${isNew?'فتح الدفعة':'حفظ'}</button></div></form>`);
  const f=$('#cm'); let touched=!!c.end_date;
  const auto=()=>{ if(touched) return; const days=$$('[name=d]:checked',f).map(x=>+x.value); if(f.start_date.value&&p.duration_days&&days.length) f.end_date.value=computeEnd(f.start_date.value,p.duration_days,days); };
  f.end_date.oninput=()=>touched=true; f.start_date.onchange=()=>{ touched=false; auto(); }; $$('[name=d]',f).forEach(x=>x.onchange=()=>{ touched=false; auto(); }); auto();
  $('#cmC').onclick=closeModal;
  f.teacher_id.onchange=()=>{ const t=(AD.teachers||[]).find(x=>x.id===f.teacher_id.value); if(t) f.trainer.value=t.full_name; };
  f.onsubmit=async e=>{ e.preventDefault(); const fd=new FormData(f), E=t=>$('#cmE').textContent=t;
    const o={...c, days:fd.getAll('d').map(Number), start_date:fd.get('start_date'), end_date:fd.get('end_date'), start_time:fd.get('start_time'), end_time:fd.get('end_time'), seats:+fd.get('seats')||25, hall:fd.get('hall').trim(), teacher_id:fd.get('teacher_id')||null, trainer:fd.get('trainer').trim()||((AD.teachers||[]).find(x=>x.id===fd.get('teacher_id'))?.full_name||''), reg_open:!!fd.get('reg_open')};
    if(!o.days.length) return E('اختر يومًا واحدًا على الأقل للمحاضرات.');
    if(!o.start_date||!o.end_date) return E('حدّد تاريخ البداية والنهاية.');
    if(o.end_date<o.start_date) return E('تاريخ النهاية قبل تاريخ البداية. صحّح أحدهما.');
    if(isNew && o.end_date<today) return E('تاريخ النهاية مضى. الدفعة الجديدة يجب أن تنتهي اليوم أو بعده.');
    if(toMin(o.end_time)<=toMin(o.start_time)) return E('وقت النهاية يجب أن يأتي بعد وقت البداية.');
    if(!isNew && o.seats<takenOf(AD,c.id)) return E(`في الكشف ${fmtNum(takenOf(AD,c.id))} مسجّلًا، فلا تقلّ المقاعد عن ذلك.`);
    const sb=$('#cm button.pri'); setBusy(sb,true,isNew?'جارٍ فتح الدفعة':'جارٍ الحفظ');
    try{ await Store.saveCohort(o); await reloadAD(); if(isNew) cohortOpened(p); else { closeModal(); toast('حُفظت الدفعة'); (back||pageCohorts)(); } }catch(x){ setBusy(sb,false); E(x.message); } };
}
export function cohortOpened(p){
  const url=programUrl(p,AD.settings), c=activeCohortOf(AD,p.id);
  modal(`<div style="text-align:center"><div class="bigcheck">${ic('check')}</div><h3 style="margin-bottom:4px">فُتحت ${cohortLabel(c)}</h3><p class="hint" style="margin:0 0 14px">${esc(p.name)} · تبدأ ${fmtDate(c.start_date)}</p>
    <div class="qrbox" style="display:inline-block;box-shadow:var(--shadow-card);border:1px solid var(--border)"><div id="qrM"></div></div>
    <p class="hint" style="margin:12px 0 4px">هذا باركود البرنامج الثابت: يفتح نموذج التسجيل في دفعته. والتحضير اليومي بباركود المركز الموحد.</p>
    <div class="hint" dir="ltr" style="word-break:break-all;margin-bottom:14px">${esc(url)}</div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button class="btn" id="mcp">${ic('copy')} نسخ رابط التسجيل</button><a class="btn" href="#qr-${progCode(p)}">${ic('expand')} عرض الباركود</a><button class="btn pri" id="mok">${ic('form')} كشف الدفعة</button></div></div>`);
  makeQR($('#qrM'), url, 200);
  $('#mcp').onclick=()=>copyText(url,'نُسخ رابط التسجيل');
  $('#mok').onclick=()=>{ closeModal(); cohortView=c.id; if(location.hash==='#admin-cohorts') pageCohorts(); else location.hash='#admin-cohorts'; };
}

/* ---------- المتدربون ---------- */
export let trQ='', trP='all', trSc='all';
/* طلبات تحديث البيانات (الخطوة A): فروق أدخلها شخص أعاد التسجيل بسجل مدني موجود، ولا تُطبَّق إلا بقرار الإدارة */
function changeReqHtml(){
  const R=(AD.profile_change_requests||[]).filter(r=>r.status==='pending'); if(!R.length) return '';
  return `<div class="card pad rv pcr" style="margin-bottom:14px"><h3 class="ctitle">${ic('alert')}طلبات تحديث البيانات <span class="pill warn">${fmtNum(R.length)}</span></h3>
    <p class="hint" style="margin:-4px 0 10px">أُرسلت عند إعادة التسجيل بسجل مدني موجود. لا يتغير ملف المتدرب ولا جواله (مفتاح دخوله للبوابة) إلا إذا قبلتَ الطلب بعد التحقق من صاحبه.</p>
    <div class="tblwrap"><table class="tb"><thead><tr><th>المتدرب</th><th>التغيير المطلوب</th><th>التاريخ</th><th></th></tr></thead><tbody>
    ${R.map(r=>{ const t=AD.trainees.find(x=>x.id===r.trainee_id); return `<tr><td><b style="font-weight:500">${esc(t?.full_name||'—')}</b><div class="hint" dir="ltr" style="text-align:right">${esc(t?.national_id||'')}</div></td>
      <td>${Object.entries(r.changes).map(([f,v])=>`<div><span class="hint">${PROFILE_FIELDS[f]||f}:</span> <s>${esc(v.old)}</s> ← <b>${esc(v.new)}</b></div>`).join('')}</td>
      <td class="num">${fmtShort(r.created_at.slice(0,10))}</td>
      <td style="white-space:nowrap"><button class="btn sm pri" data-pcr="${r.id}" data-ok="1">${ic('check')} قبول</button> <button class="btn sm" data-pcr="${r.id}" data-ok="0">رفض</button></td></tr>`; }).join('')}
    </tbody></table></div></div>`;
}
function bindChangeReq(){
  $$('[data-pcr]').forEach(b=>b.onclick=()=>{ const ok=b.dataset.ok==='1';
    confirmBox(ok?'قبول تحديث البيانات':'رفض الطلب', ok?'سيُطبَّق التغيير على ملف المتدرب. إن كان فيه رقم جوال جديد فسيصبح هو مفتاح دخوله للبوابة. تأكد من هوية صاحب الطلب أولًا.':'يبقى ملف المتدرب كما هو.', async()=>{
      await Store.resolveProfileChange(b.dataset.pcr, ok); await reloadAD(); toast(ok?'طُبّق التحديث':'رُفض الطلب'); pageTrainees(); }, ok?'قبول':'رفض'); });
}
export function pageTrainees(){
  const m=$('#main'); queueMicrotask(bindChangeReq); const {programs,trainees,enrollments,attendance}=AD;
  const ensOf = t => enrollments.filter(e=>e.trainee_id===t.id);
  const list = trainees.filter(t=>matchPerson(trSc,trQ,t,...ensOf(t).map(e=>e.ref)) && (trP==='all'||ensOf(t).some(e=>e.program_id===trP)))
    .sort((a,b)=>(ensOf(b).map(e=>e.created_at).sort().pop()||'').localeCompare(ensOf(a).map(e=>e.created_at).sort().pop()||''));
  m.innerHTML = titleBar(`${ic('id')}المتدربون`, `سجل المتدربين، <em>${fmtNum(list.length)} متدرب</em>`, 'كل متدرب بسجله المدني مرة واحدة، مع كل الدفعات التي سجّل فيها ونسبة حضوره في كل منها.', `<button class="btn sm" id="csvx">${ic('database')} تصدير Excel</button><button class="btn sm" id="csv">${ic('copy')} نسخ كجدول</button>`)+
   `${changeReqHtml()}<div class="filters rv" style="--i:1"><span class="lbl">${ic('search')}</span><input class="inp" id="tq" placeholder="أي جزء من الاسم، السجل المدني، الجوال، رقم الطلب" value="${esc(trQ)}" style="min-width:260px;flex:1">${scopeSelect('tsc',trSc)}
     <select class="inp" id="tp" style="max-width:280px"><option value="all">كل البرامج</option>${allCats().map(c=>{ const ps=programs.filter(p=>p.category===c&&enrollments.some(e=>e.program_id===p.id)); return ps.length?`<optgroup label="${esc(c)}">${ps.map(p=>`<option value="${p.id}" ${trP===p.id?'selected':''}>${esc(p.name)}</option>`).join('')}</optgroup>`:''; }).join('')}</select></div>
   ${list.length?`<div class="tbw rv" style="--i:2"><table class="tb"><thead><tr><th>المتدرب</th><th>السجل المدني</th><th>الجوال</th><th>المدينة</th><th>الدفعات</th><th></th></tr></thead><tbody>
   ${list.slice(0,400).map(t=>`<tr><td><div class="who"><span class="avatar ${t.gender==='أنثى'?'f':''}">${esc(t.full_name[0])}</span><div><b style="font-weight:500">${esc(t.full_name)}</b><div class="hint">${esc(t.education||'')}${t.employer?` · ${esc(t.employer)}`:''}</div></div></div></td>
     <td dir="ltr" style="text-align:right">${esc(t.national_id)}</td><td dir="ltr" style="text-align:right">${esc(t.phone)}</td><td>${esc(t.city||'')}</td>
     <td style="min-width:260px"><div style="display:flex;flex-direction:column;gap:4px">${ensOf(t).map(e=>{ const c=AD.cohorts.find(x=>x.id===e.cohort_id); if(!c) return ''; const ds=sessionDays(c,riyadhNow().date).filter(d=>d>=e.created_at.slice(0,10)), n=attendance.filter(a=>a.enrollment_id===e.id).length, r=ds.length?Math.round(n/ds.length*100):null;
       return `<button class="enr" data-cv="${c.id}"><span class="pill dot ${e.status==='ملغى'?'bad':STATE_PILL[cohortState(c)]}">${e.status==='ملغى'?'ملغى':STATE_TXT[cohortState(c)]}</span><span style="flex:1;text-align:right">${esc(short(progName(e.program_id)))} · د${fmtNum(c.number)}</span><span class="hint num">${r===null?'—':fmtNum(r)+'٪'}</span></button>`; }).join('')}</div></td>
     <td style="white-space:nowrap"><button class="btn sm" data-ted="${t.id}" title="تعديل بيانات المتدرب" aria-label="تعديل بيانات ${esc(t.full_name)}">${ic('edit')}</button> <button class="btn sm" data-tst="${t.id}" title="كشف الحساب" aria-label="كشف حساب ${esc(t.full_name)}">${ic('receipt')}</button> <button class="btn sm" data-twr="${t.id}" title="تقرير الأسبوع" aria-label="تقرير أسبوع ${esc(t.full_name)}">${ic('calendar')}</button> <button class="btn sm danger soft" data-del="${t.id}" title="حذف المتدرب" aria-label="حذف ${esc(t.full_name)}">${ic('trash')}</button></td></tr>`).join('')}
   </tbody></table></div>${list.length>400?`<p class="hint">تظهر أول ٤٠٠ نتيجة. استخدم البحث لتضييق القائمة.</p>`:''}` : emptyBox('لا يوجد متدربون مطابقون','غيّر البحث أو المرشح.')}`;
  $('#tsc').onchange=e=>{ trSc=e.target.value; pageTrainees(); };
  $('#tq').oninput=e=>{ trQ=e.target.value; clearTimeout(window._tq); window._tq=setTimeout(()=>{ pageTrainees(); const el=$('#tq'); el.focus(); el.setSelectionRange(el.value.length,el.value.length); },300); };
  $('#tp').onchange=e=>{ trP=e.target.value; pageTrainees(); };
  $('#csvx').onclick=()=>exportCSV('المتدربون-وتسجيلاتهم', traineesRows());
  $$('[data-cv]').forEach(b=>b.onclick=()=>{ cohortView=b.dataset.cv; location.hash='#admin-cohorts'; });
  $$('[data-ted]').forEach(b=>b.onclick=()=>editTraineeModal(b.dataset.ted, pageTrainees));
  $$('[data-tst]').forEach(b=>b.onclick=()=>statementModal(b.dataset.tst));
  $$('[data-twr]').forEach(b=>b.onclick=()=>adminWeeklyModal(AD, b.dataset.twr, id=>Store.traineeLearning(id)));
  $$('[data-del]').forEach(b=>b.onclick=()=>confirmBox('حذف المتدرب','يُحذف المتدرب إذا لم يكن له حضور أو شهادات. من له سجلات يُلغى تسجيله ولا يُحذف حفاظًا على التاريخ.', async()=>{ await Store.deleteTrainee(b.dataset.del); await reloadAD(); toast('حُذف المتدرب'); pageTrainees(); }));
  $('#csv').onclick=()=>{ const head=['الاسم','السجل المدني','الجوال','البريد','الجنس','المدينة','المؤهل','جهة العمل','البرنامج','الدفعة','رقم الطلب','حالة التسجيل'];
    const rows=list.flatMap(t=>ensOf(t).map(e=>{ const c=AD.cohorts.find(x=>x.id===e.cohort_id); return [t.full_name,t.national_id,t.phone,t.email,t.gender,t.city,t.education,t.employer,progName(e.program_id),c?c.number:'',e.ref,e.status]; }));
    copyText([head,...rows].map(r=>r.join('\t')).join('\n'),'نُسخ '+fmtNum(rows.length)+' صفًا، الصقها في Excel'); };
}
