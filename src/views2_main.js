import { PORTAL_ART } from './portal_art.js';
import { LOGO } from './assets/logo.js';
import { CATEGORIES, CAT_ICON, CENTER, catPill } from './catalog.js';
import { PAGE, adminBase, publicBase, portalBase } from './config.js';
import { STATE_TXT, Store, activeCohortOf, cohortArchived, cohortState, isSessionDay, priceTxt, progCode, takenOf } from './data2.js';
import { liveSay, setBusy, showErrorSummary, toLatin, wireFormA11y } from './features.js';
import { siteFooter, viewHome } from './landing.js';
import { closePrint } from './print.js';
import { $, $$, CITIES, DAYS, EDU, esc, fmtDate, fmtMoney, fmtNum, fmtShort, riyadhNow, t12, toMin, uid, validSaudiId, matchQ } from './utils.js';
import { viewAdmin } from './views2_admin.js';
import { countUp, emptyBox, ic, skeleton, toast } from './views2_head.js';
import { closeModal } from './views2_programs.js';
import { viewPlanPage } from './qudurat_views.js';
import { planOpen, sessionOn, SECTIONS, subStatus } from './qudurat.js';
import { ageOn, isMinor, isChild, MIN_AGE, isKidsProgram } from './identity_logic.js';
import { waLink, WA_LOGO, viewContact, viewManarGuide } from './landing.js';
import { orderPanelHtml, bindOrderPanel } from './order_panel.js';
import { viewPolicies, viewPolicy, bindPolicyConsent } from './policy_views.js';

/* =====================================================================
   أدوات العرض المشتركة
   ===================================================================== */
export const daysTxt = n => n==null ? '—' : n===1 ? 'يوم واحد' : n===2 ? 'يومان' : n<=10 ? `${fmtNum(n)} أيام` : `${fmtNum(n)} يومًا`;
export const hoursTxt = n => n==null ? '—' : n<=10 && n>2 ? `${fmtNum(n)} ساعات` : `${fmtNum(n)} ساعة`;
export const catSort = (a,b) => { const ia=CATEGORIES.indexOf(a), ib=CATEGORIES.indexOf(b); return (ia<0?99:ia)-(ib<0?99:ib) || a.localeCompare(b,'ar'); };
export const daysList = c => (c.days||[]).map(d=>DAYS[d]).join('، ');
export const baseUrl = s => ((s && s.checkin_url || '').trim().replace(/#.*$/,'')) || publicBase();
export const programUrl = (p, s) => baseUrl(s) + '#' + progCode(p);
export const fld = (n,l,req,html,hint='')=>`<div class="field"><label>${l} ${req?'<i>*</i>':''}</label>${html}${hint?`<span class="hint fh" data-h="${n}">${hint}</span>`:''}<div class="errtxt" data-e="${n}"></div></div>`;
export const rv = (l,v)=>`<div><span>${l}</span><b>${esc(v)}</b></div>`;
export const titleBar = (pill, title, p, extra='') => `<div class="ptitle rv"><div><span class="hero-pill">${pill}</span><h2>${title}</h2><p>${p}</p></div><div style="display:flex;gap:8px;flex-wrap:wrap">${extra}</div></div>`;
export const kpiCard = (i, icon, tone, label, val, suf, sub) => `<div class="kpi rv t-${tone}" style="--i:${i}"><span class="kic">${ic(icon)}</span><span>${label}</span><b class="num" data-count="${val}" data-suf="${suf||''}">0</b><small>${sub}</small></div>`;
export const short = s => s.length>24 ? s.slice(0,23)+'…' : s;
export const cohortLabel = c => c.number==null ? (c.section ? `قسم ${c.section}` : 'اشتراك باقة') : `الدفعة ${fmtNum(c.number)}`;
export function makeQR(el, text, size=300){ try{ el.innerHTML=''; new QRCode(el,{text, width:size, height:size, colorDark:'#0D2F33', colorLight:'#ffffff', correctLevel:QRCode.CorrectLevel.M}); }catch(e){ el.innerHTML=`<div class="hint" style="max-width:260px;word-break:break-all;color:#0F2628">${esc(text)}</div>`; } }
export async function copyText(t, msg){ try{ await navigator.clipboard.writeText(t); toast(msg||'نُسخ'); }catch(e){ toast('تعذّر النسخ في هذا المتصفح'); } }
export function centerFooter(){
  return `<footer class="cfoot rv"><div class="cf-brand"><img src="${LOGO}" alt=""><div><b>${CENTER.name}</b><span class="hint">سجل تجاري ${CENTER.cr} · برامج معتمدة من ${CENTER.accreditor}</span></div></div>
    <div class="cf-items"><span>${ic('pin')}${CENTER.address} · ص.ب ${CENTER.pobox}</span><span dir="ltr">${ic('phone')}${CENTER.phones.join('  ·  ')}</span><span dir="ltr">${ic('mail')}${CENTER.email}</span></div></footer>`;
}
/* حالة الدفعة كما يراها المتدرب */
export function cohortPublicState(c, today=riyadhNow().date){
  if(!c) return {k:'none', pill:'info', txt:'التسجيل المبدئي متاح'};
  const full = (c.taken||0) >= c.seats;
  if(c.reg_open && !full) return {k:'open', pill:'ok', txt:`التسجيل مفتوح · ${cohortLabel(c)}`};
  if(c.start_date<=today) return {k:'running', pill:'info', txt:`${cohortLabel(c)} منعقدة`};
  return {k:'closed', pill:'warn', txt: full?`اكتملت مقاعد ${cohortLabel(c)}`:`التسجيل مغلق · ${cohortLabel(c)}`};
}

/* =====================================================================
   التوجيه
   ===================================================================== */
export const ROUTES = ['admin-assistant','admin-join','admin-audit','admin-admins','home','register','enroll','contact','me','manar-guide','checkin','portals','policies','display','admin','admin-attendance','admin-studio','admin-archive','admin-cohorts','admin-followup','admin-rules','admin-qudurat','admin-users','admin-bank','admin-orders','admin-invoices','admin-data','admin-access','admin-daily','admin-policies','admin-notify','admin-trainees','admin-programs','admin-reports','admin-partners','admin-settings'];
export let charts = [], timers = [];
export function cleanup(){ charts.forEach(c=>c.destroy()); charts=[]; timers.forEach(clearInterval); timers=[]; }
/* حالة قاعدة البيانات: أيقونة خضراء متصلة، حمراء غير متصلة (لا شبكة)، ذهبية للبيانات التجريبية */
export function syncDb(){
  const el = $('#modeTag'); if(!el) return;
  const k = Store.mode !== 'cloud' ? 'demo' : navigator.onLine === false ? 'off' : 'on';
  const t = { on:'متصل بقاعدة البيانات', off:'غير متصل بقاعدة البيانات — تحقق من الإنترنت', demo:'بيانات تجريبية (غير متصل بقاعدة البيانات)' }[k];
  el.className = 'dbst ' + k; el.setAttribute('aria-label', t); el.title = t;
  if(!syncDb.bound){ syncDb.bound = true; window.addEventListener('online', syncDb); window.addEventListener('offline', syncDb); }
}
let routing = null, routePending = false;
export function route(){
  routePending = true;
  if(!routing) routing = (async () => {
    try { while(routePending){ routePending=false; await renderRoute(); } }
    finally { routing=null; }
  })();
  return routing;
}
async function renderRoute(){
  cleanup(); closeModal(); closePrint();
  // عائد من رابط بريد Supabase (دعوة مسؤول، تأكيد، استعادة كلمة المرور): تُعتمد الجلسة ثم يختار كلمة مروره
  if(PAGE==='admin' && Store.authEvent){ const ev=Store.authEvent; Store.authEvent=null; history.replaceState(null,'',location.pathname+location.search+'#admin');
    if(ev.error) return viewLogin('', 'انتهت صلاحية الرابط أو استُخدم من قبل. اطلب من مدير النظام إعادة إرسال الدعوة.');
    const ok=await Store.authReady(); if(ok && ['invite','recovery'].includes(ev.type)) return viewSetPassword(ev.type); }
  let h = (location.hash||'').slice(1);
  // كل صفحة تخدم مساراتها فقط: مسارات الإدارة في /admin/ وبقية المسارات في الصفحة العامة
  const adminRoute = h.startsWith('admin')||h==='display'||h.startsWith('qr-');
  if(PAGE==='public' && adminRoute){ location.replace(adminBase()+'#'+h); return; }
  if(PAGE==='admin' && h && !adminRoute){ location.replace(publicBase()+'#'+h); return; }
  if(PAGE==='admin' && !h) h='admin';
  const navKey = h.startsWith('admin')||h==='display'||h.startsWith('qr-') ? 'admin' : h==='checkin' ? 'checkin' : h==='me' ? 'me' : h==='portals' ? 'portals' : ['contact','manar-guide'].includes(h) ? '' : (!h||h==='home'||h==='policies'||h.startsWith('policy-')) ? 'home' : 'register';
  $$('#nav a').forEach(a=>a.classList.toggle('on', a.dataset.r===navKey));
  syncDb();
  window.scrollTo(0,0);
  /* صفحة التحقق العامة أُلغيت (البند 8): المسارات القديمة تُحال إلى الرئيسية دون عرض أي بيانات إفادة */
  if(h==='verify' || /^v-/.test(h)){ history.replaceState(null,'','#home'); return viewHome(); }
  if(h==='manar-guide') return viewManarGuide();
  if(h==='me'){ history.replaceState(null,'','#portals'); return viewPortals(); }   // «حضوري» انتقلت إلى بوابة المتدرب
  if(h.startsWith('plan-')) return viewPlanPage(h.slice(5));
  if(h==='enroll' || h.startsWith('enroll-')) return viewEnroll(h.slice(7));
  if(h==='contact') return viewContact();
  if(h.startsWith('policy-')) return viewPolicy(h.slice(7));
  if(/^p[a-z0-9]+$/i.test(h) && !ROUTES.includes(h)) return viewProgramPage(h);
  if(h.startsWith('qr-')){ if(!(await Store.isAdmin())) return viewLogin(); return h==='qr-checkin' ? viewQRCheckin() : viewQR(h.slice(3)); }
  const r = ROUTES.includes(h) ? h : 'home';
  if(r==='home') return viewHome();
  if(r==='register') return viewCatalog();
  if(r==='checkin') return viewGeneralCheckin();
  if(r==='portals') return viewPortals();
  if(r==='policies') return viewPolicies();
  if(r==='admin-join'){ if(await Store.isAdmin()){ location.replace('#admin'); return; } return viewLogin('join'); }
  if(!(await Store.isAdmin())) return viewLogin(r);
  if(await Store.mustChangePassword()) return viewSetPassword('first');
  if(r==='display') return viewDisplay();
  return viewAdmin(r);
}

/* =====================================================================
   1) دليل البرامج (صفحة التسجيل الرئيسية)
   ===================================================================== */
export const cat = { kind:'program', cf:'all', q:'', open:false, data:null, pkg:null };
export async function viewCatalog(){
  const app=$('#app'); app.innerHTML = `<div class="wrap">${skeleton()}</div>`;
  try{ cat.data = await Store.catalog(); }catch(e){ app.innerHTML=`<div class="wrap">${emptyBox('تعذّر تحميل البرامج', esc(e.message)+'. أعد تحميل الصفحة بعد قليل.')}</div>`; return; }
  const {programs} = cat.data; const nOpen=programs.filter(p=>cohortPublicState(p.cohort).k==='open').length, nCats=new Set(programs.map(p=>p.category)).size;
  const cats=[...new Set(programs.map(p=>p.category))].sort(catSort);
  app.innerHTML = `<div class="wrap">
    <section class="hero rv"><div class="logo"><img src="${LOGO}" alt="شعار مركز سما القدرات"></div><div>
      <span class="hero-pill">${ic('award')}برامج معتمدة من ${CENTER.accreditor}</span>
      <h1>سجّل في برامج مركز سما القدرات، <em>وابدأ مسارك المهني</em></h1>
      <p>${CENTER.vision}.</p>
      <ul class="stats"><li>${ic('book')}<b data-count="${programs.length}">0</b><span>برنامجًا معتمدًا</span></li><li>${ic('grid')}<b data-count="${nCats}">0</b><span>مجالات تدريبية</span></li><li>${ic('form')}<b data-count="${programs.length}">0</b><span>برنامجًا متاحًا للتسجيل</span></li></ul></div></section>
    <div style="height:18px"></div>
    <div class="card pad rv"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px"><h2 class="sec-title" style="margin:0">اختر البرنامج للتسجيل في دفعته</h2>
      <div class="seg" style="margin:0"><button data-k="program" class="${cat.kind==='program'?'on':''}">${ic('book')}البرامج</button><button data-k="package" class="${cat.kind==='package'?'on':''}">${ic('layers')}الباقات</button></div></div>
      ${cat.kind==='program'?`<div class="cats" id="cats"><button data-c="all" class="${cat.cf==='all'?'on':''}">الكل <i>${fmtNum(programs.length)}</i></button>${cats.map(c=>`<button data-c="${esc(c)}" class="${cat.cf===c?'on':''}">${ic(CAT_ICON[c]||'book')}${esc(c)} <i>${fmtNum(programs.filter(p=>p.category===c).length)}</i></button>`).join('')}</div>
      <div class="filters" style="box-shadow:none;margin:12px 0 16px"><span class="lbl">${ic('search')}</span><input class="inp" id="rq" placeholder="ابحث باسم البرنامج أو رقم الاعتماد" value="${esc(cat.q)}" style="flex:1;min-width:200px">
        <label class="sw" style="min-height:38px;gap:10px"><span class="hint" style="font-size:14px">المفتوح للتسجيل فقط</span><input type="checkbox" id="ro" ${cat.open?'checked':''}><i></i></label><span class="pill g" id="resCount"></span></div>`:''}
      <div class="grid g3" id="choices"></div><div id="pkgForm"></div></div>
    </div>${siteFooter()}`;
  countUp(app);
  $$('.seg button').forEach(b=>b.onclick=()=>{ cat.kind=b.dataset.k; cat.pkg=null; viewCatalog(); });
  $$('#cats button').forEach(b=>b.onclick=()=>{ cat.cf=b.dataset.c; $$('#cats button').forEach(x=>x.classList.toggle('on',x===b)); renderCatalogCards(); });
  if($('#rq')) $('#rq').oninput=e=>{ cat.q=e.target.value; clearTimeout(window._rq); window._rq=setTimeout(renderCatalogCards,200); };
  if($('#ro')) $('#ro').onchange=e=>{ cat.open=e.target.checked; renderCatalogCards(); };
  renderCatalogCards();
}
export function programCard(p, i){
  const c=p.cohort, st=cohortPublicState(c), left=c?c.seats-(c.taken||0):0, pc=c?Math.min(100,Math.round((c.taken||0)/c.seats*100)):0;
  return `<a class="choice rv" href="#${p.code}" style="--i:${Math.min(i,12)};text-decoration:none;color:inherit">
    <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pill dot ${catPill(p.category)}">${esc(p.category)}</span><span class="pill dot ${st.pill}">${st.txt}</span></div>
    <h3>${esc(p.name)}</h3>
    <div class="meta"><span>${ic('hourglass')}${hoursTxt(p.hours)}</span><span>${ic('calendar')}${daysTxt(p.duration_days)}</span>${p.accreditation_no?`<span>${ic('award')}اعتماد ${esc(p.accreditation_no)}</span>`:''}</div>
    ${c?`<div class="meta"><span>${ic('calendar')}${fmtShort(c.start_date)} – ${fmtShort(c.end_date)}</span><span>${ic('clock')}${t12(c.start_time)}</span></div>`:'<div class="hint">يُعلن عن الدفعة القادمة قريبًا.</div>'}
    <div class="price ${priceTxt(p.price)==='السعر عند التواصل'?'tbd':''}" style="margin-top:auto">${priceTxt(p.price)}</div>
    ${st.k==='open'?`<div class="bar"><i class="${pc>80?'hot':''}" style="width:${pc}%"></i></div><div class="hint" style="display:flex;justify-content:space-between"><span>متبقٍ ${fmtNum(left)} مقعد</span><span style="color:var(--brand);font-weight:500">التسجيل ${ic('next')}</span></div>`:`<div class="hint" style="text-align:left;color:var(--brand);font-weight:500">${st.k==='running'?'صفحة البرنامج':'تسجيل مبدئي'} ${ic('next')}</div>`}</a>`;
}
export function renderCatalogCards(){
  const {programs, packages} = cat.data; const box=$('#choices'); if(!box) return;
  if(cat.kind==='package'){
    box.innerHTML = packages.length ? packages.map((k,i)=>{ const ps=programs.filter(p=>k.program_ids.includes(p.id)), sum=ps.reduce((s,p)=>s+Number(p.price||0),0), hrs=ps.reduce((s,p)=>s+(p.hours||0),0);
        const ready = ps.length && ps.every(p=>cohortPublicState(p.cohort).k==='open');
        return `<div class="choice rv ${cat.pkg===k.id?'sel':''}" style="--i:${i}"><span class="pill dot ${ready?'ok':'g'}" style="align-self:flex-start">${ready?'التسجيل مفتوح':'التسجيل غير متاح حاليًا'} · ${fmtNum(ps.length)} برامج</span>
          <h3>${esc(k.name)}</h3>${k.description?`<div class="hint">${esc(k.description)}</div>`:''}
          <div class="meta">${ps.map(p=>`<span>${ic('book')}${esc(p.name)}${p.cohort?` · ${cohortLabel(p.cohort)}`:''}</span>`).join('')}</div><div class="hint">${hoursTxt(hrs)} تدريبية</div>
          <div class="price" style="margin-top:auto">${priceTxt(k.price)} ${sum>Number(k.price||0)&&k.price?`<small><s>${fmtMoney(sum)}</s> · توفير ${fmtNum(Math.round((1-k.price/sum)*100))}٪</small>`:''}</div>
          ${ready?`<button class="btn pri" data-pk="${k.id}">${ic('form')} التسجيل في الباقة</button>`:'<div class="hint">تُفتح الباقة حين تُفتح دفعات كل برامجها.</div>'}</div>`; }).join('')
      : `<div style="grid-column:1/-1">${emptyBox('لا توجد باقات متاحة الآن','يضيف المركز الباقات وأسعارها قريبًا. يمكنك التسجيل في برنامج منفرد.')}</div>`;
    $$('[data-pk]').forEach(b=>b.onclick=()=>{ cat.pkg=b.dataset.pk; const k=packages.find(x=>x.id===cat.pkg); renderCatalogCards();
      const ps=programs.filter(p=>k.program_ids.includes(p.id));
      $('#pkgForm').innerHTML=`<div style="height:18px"></div>`+regFormHtml(`التسجيل في ${esc(k.name)}`, ps.map(p=>`${p.name} (${cohortLabel(p.cohort)})`).join('، '));
      bindRegForm({package_id:k.id}, ()=>ps.map(p=>p.cohort)); $('#pkgForm').scrollIntoView({behavior:'smooth'}); });
    return;
  }
  const rank={open:0,running:1,closed:2,none:3};
  const list = programs.filter(p=>(cat.cf==='all'||p.category===cat.cf) && matchQ(cat.q,p.name,p.accreditation_no,p.category) && (!cat.open||cohortPublicState(p.cohort).k==='open'))
    .sort((a,b)=>rank[cohortPublicState(a.cohort).k]-rank[cohortPublicState(b.cohort).k] || catSort(a.category,b.category));
  $('#resCount').textContent = `${fmtNum(list.length)} برنامج`;
  box.innerHTML = list.length ? list.map(programCard).join('') : `<div style="grid-column:1/-1">${emptyBox('لا توجد برامج مطابقة','غيّر المجال أو كلمة البحث.')}</div>`;
}

/* نموذج التسجيل الموحّد (#enroll، #enroll-p-<رمز البرنامج>، #enroll-q-<معرّف الباقة>):
   يختار المتدرب «برنامج تدريبي» أو «باقات القدرات والتحصيلي» ثم العنصر من قائمة ما هو مفتوح للتسجيل الآن */
export async function viewEnroll(pre=''){
  const app=$('#app'); app.innerHTML=`<div class="wrap">${skeleton()}</div>`; let cd, pd;
  try{ [cd, pd] = await Promise.all([Store.catalog(), Store.publicPlans()]); }catch(e){ app.innerHTML=`<div class="wrap">${emptyBox('تعذّر تحميل نموذج التسجيل', esc(e.message))}</div>`; return; }
  const isOpen=p=>cohortPublicState(p.cohort).k==='open';   // كل البرامج النشطة متاحة: المفتوحة دفعتها تسجيل مباشر، والبقية تسجيل مبدئي
  const progs=[...cd.programs].sort((a,b)=>(isOpen(b)-isOpen(a))||catSort(a.category,b.category)||a.name.localeCompare(b.name,'ar'));
  const plans=pd.plans.filter(p=>p.mode!=='remote' && p.status!=='coming_soon' && planOpen(p));
  let kind = pre.startsWith('q-') ? 'plan' : pre.startsWith('p-') ? 'program' : (progs.length ? 'program' : 'plan');
  let item = pre.startsWith('q-') ? pre.slice(2) : pre.startsWith('p-') ? (progs.find(p=>p.code===pre.slice(2))?.id||'') : '';
  const opts=()=> kind==='program'
    ? `<option value="">اختر البرنامج</option>`+progs.map(p=>`<option value="${p.id}" ${item===p.id?'selected':''}>${esc(p.name)} · ${isOpen(p)?`${cohortLabel(p.cohort)} · تبدأ ${fmtShort(p.cohort.start_date)}`:'تسجيل مبدئي'}</option>`).join('')
    : `<option value="">اختر الباقة</option>`+plans.map(p=>`<option value="${p.id}" ${item===p.id?'selected':''}>${esc(p.name)}</option>`).join('');
  const chooser=`<fieldset class="en-kind" style="grid-column:1/-1"><legend>أريد التسجيل في <i>*</i></legend>
      <label class="en-opt"><input type="radio" name="en_kind" id="en-kind-program" value="program" ${kind==='program'?'checked':''}><span>${ic('book')}<b>برنامج تدريبي</b><small>${fmtNum(progs.length)} برنامجًا متاحًا</small></span></label>
      <label class="en-opt"><input type="radio" name="en_kind" id="en-kind-plan" value="plan" ${kind==='plan'?'checked':''}><span>${ic('award')}<b>باقات القدرات والتحصيلي</b><small>${fmtNum(plans.length)} باقات حضورية</small></span></label></fieldset>
    <div class="field" style="grid-column:1/-1"><label for="en-item" id="en-lbl">${kind==='program'?'البرنامج التدريبي':'الباقة'} <i>*</i></label><select class="inp" id="en-item" name="en_item">${opts()}</select>
      <span class="hint" id="en-info"></span><div class="errtxt" data-e="en_item"></div></div>`;
  app.innerHTML=`<div class="wrap" style="max-width:920px">${regFormHtml('التسجيل في مركز سما القدرات','نموذج واحد للبرامج التدريبية وباقات القدرات والتحصيلي', chooser)}
    <p class="hint" style="text-align:center;margin-top:12px">تريد التفاصيل أولًا؟ <a href="#register" style="color:var(--brand);font-weight:500">دليل البرامج</a> · <a href="#home" style="color:var(--brand);font-weight:500">الباقات</a></p></div>${siteFooter()}`;
  const sel=$('#en-item'), info=()=>{ const x=kind==='program'?progs.find(p=>p.id===item):plans.find(p=>p.id===item);
    $('#en-info').innerHTML = !x ? (kind==='program'&&!progs.length ? 'لا توجد برامج متاحة الآن.' : kind==='plan'&&!plans.length ? 'لا توجد باقات متاحة الآن.' : '')
      : kind==='program' && !isOpen(x) ? `لا توجد دفعة مفتوحة الآن: سجّل مبدئيًا ويتواصل معك المركز عند فتح الدفعة، ولا يُطلب منك سداد قبل ذلك · ${priceTxt(x.price)} · <a href="#${x.code}" style="color:var(--brand)">صفحة البرنامج</a>`
      : kind==='program' ? `${fmtShort(x.cohort.start_date)} – ${fmtShort(x.cohort.end_date)} · ${t12(x.cohort.start_time)} · ${priceTxt(x.price)} · <a href="#${x.code}" style="color:var(--brand)">صفحة البرنامج</a>`
      : `يبدأ اشتراكك من أول يوم تحضر فيه · <a href="#plan-${x.id}" style="color:var(--brand)">صفحة الباقة</a>`; };
  $$('[name=en_kind]').forEach(r=>r.onchange=()=>{ kind=r.value; item=''; sel.innerHTML=opts(); $('#en-lbl').innerHTML=`${kind==='program'?'البرنامج التدريبي':'الباقة'} <i>*</i>`; info(); $('#rf').applyMode?.(); });
  sel.onchange=()=>{ item=sel.value; $('[data-e=en_item]').textContent=''; info(); $('#rf').applyMode?.(); }; info();
  bindRegForm(()=> !item ? null : kind==='program' ? {program_id:item, _mode:isKidsProgram(progs.find(x=>x.id===item))?'kids':'program'} : {plan_id:item}, ()=>{ const p=progs.find(x=>x.id===item); return p&&isOpen(p)?[p.cohort]:[]; });
}

/* =====================================================================
   2) صفحة البرنامج: نموذج تسجيل الدفعة + تحقق الحضور (هدف الباركود)
   ===================================================================== */
/* شاشة التعليمات الإلزامية قبل أي نموذج تسجيل (البند 17): لا تجمع بيانات، و«قرأت التعليمات وأرغب بالمتابعة» يُظهر النموذج نفسه دون فقد الخدمة المختارة.
   في الوضع التجريبي فقط يتخطاها مفتاح الاختبارات sama_skip_reg_intro */
export const regIntroHtml = () => `<div class="card pad rv reg-intro" id="regIntro" role="region" aria-labelledby="regIntroT"><h2 class="sec-title" id="regIntroT">${ic('alert')} تنبيه مهم قبل التسجيل</h2>
  <p>عزيزي المتدرب / عزيزتي المتدربة، يرجى التأكد من صحة بياناتك عند التسجيل في مركز سما القدرات للتدريب، لأن البيانات المسجلة تُستخدم في إجراءات البرامج والشهادات لدى الجهات المختصة، وفي إشعارات المركز ومراسلاته عبر رقم الجوال والبريد الإلكتروني المسجلين.</p>
  <ul class="reg-intro-l"><li><b>الاسم الرباعي</b> كما في الهوية.</li><li><b>رقم الهوية / السجل المدني</b>.</li><li><b>رقم الجوال</b> و<b>البريد الإلكتروني</b> الصحيحان.</li><li><b>تاريخ الميلاد</b> إن كان مطلوبًا لبرنامجك.</li><li><b>جوال ولي الأمر</b> في خانته المستقلة إن طُلب، ولا يُنسخ من جوال المتدرب.</li><li>راجع جميع البيانات الأخرى قبل الإرسال.</li></ul>
  <p class="hint">يتحمل صاحب التسجيل مسؤولية دقة البيانات المقدمة، ويمكنه التواصل مع المركز لتصحيحها وفق الإجراءات المعتمدة. البيانات الوهمية مسموحة في بيئة الاختبار فقط.</p>
  <div class="row-actions"><span></span><button type="button" class="btn pri lg" id="regAck">${ic('check')} قرأت التعليمات وأرغب بالمتابعة</button></div></div>`;
const skipIntro = () => { try { return Store.mode!=='cloud' && localStorage.getItem('sama_skip_reg_intro')==='1'; } catch(_){ return false; } };
export function regFormHtml(title, sub, chooser=''){
  return `${skipIntro()?'':regIntroHtml()}<div class="card pad rv" id="regCard" ${skipIntro()?'':'hidden'}><h2 class="sec-title">${title}</h2><p class="hint" style="margin:0 0 18px">${sub?esc(sub)+'. ':''}الحقول المعلّمة بـ <span style="color:var(--danger-ink)">*</span> مطلوبة. رقم السجل المدني هو ما يُحضَّر به المتدرب يوميًا في هذه الدفعة.</p>
    <div class="errsum" id="rfSum" tabindex="-1" role="alert" hidden></div>
    <form id="rf" class="grid g2" novalidate>${chooser}
      ${fld('full_name','الاسم الرباعي',true,`<input class="inp" name="full_name" type="text" maxlength="80" placeholder="محمد علي أحمد الحكمي" autocomplete="name" spellcheck="false">`,'حروف فقط، عربية أو إنجليزية، ثلاثة مقاطع على الأقل.')}
      ${fld('national_id','رقم السجل المدني أو الإقامة',true,`<input class="inp num" name="national_id" type="text" inputmode="numeric" pattern="[0-9]*" maxlength="10" dir="ltr" style="text-align:right" placeholder="1XXXXXXXXX" autocomplete="off">`,'أرقام فقط: 10 أرقام تبدأ بـ 1 للمواطن أو 2 للمقيم.')}
      ${fld('phone','رقم الجوال',true,`<input class="inp num" name="phone" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="10" dir="ltr" style="text-align:right" placeholder="05XXXXXXXX" autocomplete="tel-national">`,'أرقام فقط: 10 أرقام تبدأ بـ 05.')}
      ${fld('email','البريد الإلكتروني',false,`<input class="inp" name="email" type="email" inputmode="email" maxlength="100" dir="ltr" style="text-align:right" placeholder="name@example.com" autocomplete="email" autocapitalize="off" spellcheck="false">`,'يجب أن يحوي علامة @ ونطاقًا، مثل name@gmail.com')}
      ${fld('gender','الجنس',true,`<select class="inp" name="gender"><option value="">اختر</option><option>ذكر</option><option>أنثى</option></select>`)}
      ${fld('birth_date','تاريخ الميلاد',true,`<input class="inp" name="birth_date" type="date" min="1930-01-01" max="${riyadhNow().date}" autocomplete="bday">`,'لمن هم دون 19 سنة يُطلب جوال ولي الأمر.')}
      <p id="rfChild" class="alert t-info" style="grid-column:1/-1;margin:0" hidden><span class="aic">${ic('users')}</span><span>تسجيل طفل دون 13 سنة: اكتب <b>جوال ولي الأمر</b> في خانة «رقم الجوال». به يدخل ولي الأمر بوابته ويتابع حضور الطفل وتقدّمه.</span></p>
      <div id="rfGuard" style="grid-column:1/-1" hidden>${fld('guardian_phone','جوال ولي الأمر',true,`<input class="inp num" name="guardian_phone" type="tel" inputmode="numeric" pattern="[0-9]*" maxlength="10" dir="ltr" style="text-align:right" placeholder="05XXXXXXXX" autocomplete="off">`,'يدخل به ولي الأمر بوابته لمتابعة حضورك وتقدّمك، بعد تأكيده برمز تحقق وبرقم سجلك المدني.')}</div>
      ${fld('city','المدينة أو المحافظة',true,`<select class="inp" name="city"><option value="">اختر</option>${CITIES.map(x=>`<option>${x}</option>`).join('')}</select>`)}
      ${fld('education','المؤهل العلمي',true,`<select class="inp" name="education"><option value="">اختر المؤهل</option>${EDU.map(x=>`<option>${x}</option>`).join('')}</select>`)}
      ${fld('employer','جهة العمل',false,`<select class="inp" name="employer"><option value="">اختر</option>${['قطاع حكومي','قطاع خاص','متدرب','باحث عن عمل','عمل حر'].map(x=>`<option>${x}</option>`).join('')}</select>`)}
      <div id="rfPol" style="grid-column:1/-1" hidden></div>
      <label class="check" style="grid-column:1/-1;margin-top:4px"><input type="checkbox" name="agree" id="rf-agree" aria-describedby="rfE"><span>أقر بصحة البيانات أعلاه</span></label>
    </form>
    <div class="errtxt" id="rfE" style="margin-top:8px" aria-live="polite"></div>
    <div class="row-actions"><span></span><button class="btn acc lg" id="rfGo">${ic('check')} تأكيد التسجيل</button></div></div>`;
}
export function bindRegForm(target, cohortsFn){
  if($('#regAck')) $('#regAck').onclick=()=>{ $('#regIntro').remove(); const c=$('#regCard'); c.hidden=false; c.scrollIntoView({behavior:'smooth', block:'start'}); $('input,select',c)?.focus({preventScroll:true}); };
  const f=$('#rf'); wireFormA11y(f,'rf'); bindPolicyConsent($('#rfPol',f));
  const bd=$('[name=birth_date]',f), minor=()=>isMinor(bd.value, riyadhNow().date);
  const birthMsg=v=>{ const a=ageOn(v, riyadhNow().date); return !v ? 'اختر تاريخ الميلاد.' : a==null||v>riyadhNow().date||a<MIN_AGE||a>100 ? 'تاريخ الميلاد غير صحيح.' : ''; };
  const child=()=>isChild(bd.value, riyadhNow().date);
  /* الحقول بحسب الخدمة (البند 1): الباقات بلا مدينة ولا مؤهل ولا تاريخ ميلاد، وجوال ولي الأمر مستقل اختياري؛
     وتاريخ الميلاد لبرامج الأطفال فقط؛ ولا يُنسخ جوال المتدرب إلى ولي الأمر */
  const tgOf=()=> typeof target==='function' ? target() : target;
  const modeOf=()=>{ const t=tgOf(); return t?._mode || (t?.plan_id ? 'plan' : 'program'); };
  const fieldOf=n=>$(`[name=${n}]`,f)?.closest('.field');
  const gLabel=$('label',fieldOf('guardian_phone'));
  const applyMode=()=>{ const m=modeOf();
    fieldOf('birth_date').hidden = m!=='kids'; if(m!=='kids'){ bd.value=''; bd.classList.remove('err'); bd.removeAttribute('aria-invalid'); $('[data-e=birth_date]',f).textContent=''; }
    ['city','education','employer'].forEach(n=>{ const x=fieldOf(n); if(x) x.hidden = m==='plan'; });
    if(m==='plan'){ $('#rfGuard',f).hidden=false; $('#rfChild',f).hidden=true; gLabel.innerHTML='جوال ولي الأمر <small class="hint">(اختياري؛ مستقل عن جوال المتدرب)</small>'; }
    else { gLabel.innerHTML='جوال ولي الأمر <i>*</i>'; syncGuard(); } };
  const syncGuard=()=>{ if(modeOf()==='plan') return; const m=minor()&&!child(); $('#rfGuard',f).hidden=!m; $('#rfChild',f).hidden=!child(); if(!m){ const g=$('[name=guardian_phone]',f); g.value=''; g.classList.remove('err','ok'); g.removeAttribute('aria-invalid'); $('[data-e=guardian_phone]',f).textContent=''; } };
  bd.addEventListener('change',()=>{ const m=birthMsg(bd.value); $('[data-e=birth_date]',f).textContent=m; bd.classList.toggle('err',!!m); m?bd.setAttribute('aria-invalid','true'):bd.removeAttribute('aria-invalid'); syncGuard(); }); bd.addEventListener('input',syncGuard);
  /* التحقق من نوع المحتوى في كل خانة: تصفية فورية أثناء الكتابة + تحقق عند مغادرة الخانة + تحقق شامل عند الإرسال */
  const NAME_RX=/[^\u0621-\u063A\u0641-\u064A\u064B-\u0652\u0670\u0671\u067E\u0686\u06A4\u06AF\u06CCa-zA-Z\s]/g;
  const filters = {
    full_name: v => v.replace(/\u0640/g,'').replace(NAME_RX,'').replace(/\s{2,}/g,' ').replace(/^\s+/,''),
    national_id: v => toLatin(v).replace(/\D/g,'').slice(0,10),
    phone: v => toLatin(v).replace(/\D/g,'').slice(0,10),
    guardian_phone: v => toLatin(v).replace(/\D/g,'').slice(0,10),
    email: v => toLatin(v).replace(/[\s\u0600-\u06FF]/g,'').toLowerCase()
  };
  const blocked = { full_name:'تُقبل الحروف فقط في الاسم، دون أرقام أو رموز.', national_id:'تُقبل الأرقام فقط في السجل المدني.', phone:'تُقبل الأرقام فقط في رقم الجوال.', guardian_phone:'تُقبل الأرقام فقط في رقم الجوال.', email:'لا تُقبل المسافات أو الحروف العربية في البريد.' };
  const checks = {
    full_name: v => { const parts=v.trim().split(/\s+/).filter(Boolean); if(!v.trim()) return 'اكتب اسمك الرباعي.'; if(/[^\p{L}\p{M}\s]/u.test(v)) return blocked.full_name;
      if(/[a-zA-Z]/.test(v) && /[\u0621-\u06FF]/.test(v)) return 'اكتب الاسم بلغة واحدة: العربية أو الإنجليزية.'; if(parts.length<3) return 'اكتب الاسم الثلاثي على الأقل.'; if(parts.some(x=>x.replace(/[\u064B-\u0652]/g,'').length<2)) return 'كل مقطع في الاسم حرفان على الأقل.'; return ''; },
    national_id: v => !v ? 'اكتب رقم السجل المدني.' : !/^\d+$/.test(v) ? blocked.national_id : v.length!==10 ? `الرقم ${fmtNum(v.length)} من 10 أرقام.` : !/^[12]/.test(v) ? 'يبدأ رقم السجل بـ 1 أو 2.' : !validSaudiId(v) ? 'رقم السجل غير صحيح. تحقق من الأرقام.' : '',
    phone: v => !v ? 'اكتب رقم الجوال.' : !/^\d+$/.test(v) ? blocked.phone : !/^05/.test(v) ? 'يبدأ رقم الجوال بـ 05.' : v.length!==10 ? `الرقم ${fmtNum(v.length)} من 10 أرقام.` : '',
    guardian_phone: v => modeOf()==='plan' ? (!v ? '' : !/^05/.test(v) ? 'يبدأ رقم الجوال بـ 05.' : v.length!==10 ? `الرقم ${fmtNum(v.length)} من 10 أرقام.` : '') : !minor()||child() ? '' : !v ? 'اكتب جوال ولي الأمر.' : !/^05/.test(v) ? 'يبدأ رقم الجوال بـ 05.' : v.length!==10 ? `الرقم ${fmtNum(v.length)} من 10 أرقام.` : '',
    email: v => !v ? '' : !v.includes('@') ? 'البريد يجب أن يحوي علامة @' : (v.match(/@/g)||[]).length>1 ? 'البريد يحوي علامة @ واحدة فقط.' : !/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(v) ? 'صيغة البريد غير صحيحة، مثل name@gmail.com' : ''
  };
  const setState=(el,msg)=>{ const n=el.name, e=$(`[data-e=${n}]`,f); e.textContent=msg; el.classList.toggle('err',!!msg); el.classList.toggle('ok',!msg && !!el.value); msg?el.setAttribute('aria-invalid','true'):el.removeAttribute('aria-invalid'); };
  Object.keys(filters).forEach(n=>{ const el=$(`[name=${n}]`,f); let t=0;
    el.addEventListener('input',()=>{ const before=el.value, after=filters[n](before);
      if(after!==before){ const pos=Math.max(0,(el.selectionStart||after.length)-(before.length-after.length)); el.value=after; try{ el.setSelectionRange(pos,pos); }catch(_){}
        if(n!=='email'||/[\s\u0600-\u06FF]/.test(before)){ setState(el,blocked[n]); el.classList.add('shake'); clearTimeout(t); t=setTimeout(()=>{ el.classList.remove('shake'); if(el.dataset.touched) setState(el,checks[n](el.value)); else { $(`[data-e=${n}]`,f).textContent=''; el.classList.remove('err'); el.removeAttribute('aria-invalid'); } },1400); return; } }
      if(el.dataset.touched) setState(el,checks[n](el.value)); else { el.classList.remove('err'); el.removeAttribute('aria-invalid'); } });
    el.addEventListener('paste',()=>setTimeout(()=>el.dispatchEvent(new Event('input')),0));
    el.addEventListener('blur',()=>{ if(n==='full_name') el.value=el.value.trim(); if(!el.value && !el.dataset.touched) return; el.dataset.touched='1'; setState(el,checks[n](el.value)); }); });
  $$('select.inp',f).forEach(i=>i.addEventListener('change',()=>{ i.classList.remove('err'); i.removeAttribute('aria-invalid'); $(`[data-e=${i.name}]`,f).textContent=''; }));
  applyMode(); f.applyMode=applyMode;
  $('#rfGo').onclick = async e=>{
    const b=e.currentTarget, F=Object.fromEntries(new FormData(f)); let ok=true; const errs=[];
    const err=(n,m)=>{ ok=false; const el=$(`[name=${n}]`,f); $(`[data-e=${n}]`,f).textContent=m; el.classList.add('err'); el.setAttribute('aria-invalid','true'); errs.push({id:el.id,label:$(`label[for="${el.id}"]`,f)?.textContent.replace('*','').trim()||n,msg:m}); };
    $$('.errtxt',f).forEach(x=>x.textContent=''); $$('.inp',f).forEach(x=>{ x.classList.remove('err'); x.removeAttribute('aria-invalid'); }); $('#rfE').textContent='';
    Object.keys(checks).forEach(n=>{ F[n]=filters[n](F[n]||'').trim(); $(`[name=${n}]`,f).dataset.touched='1'; const m=checks[n](F[n]); if(m) err(n,m); else if(F[n]) $(`[name=${n}]`,f).classList.add('ok'); });
    const md=modeOf(); (md==='plan'?['gender']:['gender','city','education']).forEach(k=>{ if(!F[k]) err(k,'اختر قيمة لهذا الحقل.'); });
    if(md==='plan'){ delete F.birth_date; delete F.city; delete F.education; delete F.employer; if(!F.guardian_phone) delete F.guardian_phone; }
    else if(md==='kids'){ const m=birthMsg(F.birth_date||''); if(m) err('birth_date',m); if(!minor()||child()) delete F.guardian_phone; if(child()) F.guardian_phone=F.phone; }
    else { delete F.birth_date; delete F.guardian_phone; }
    let tg = tgOf(); if(tg){ tg={...tg}; delete tg._mode; }
    if(!tg){ ok=false; const el=$('#en-item',f)||$('#en-kind-program',f); errs.push({id:el?.id||'rf-full_name',label:'البرنامج أو الباقة',msg:'اختر ما تريد التسجيل فيه.'}); const e2=$('[data-e=en_item]',f); if(e2) e2.textContent='اختر ما تريد التسجيل فيه.'; }
    if($('#rf-pol',f) && !F.policies){ ok=false; errs.push({id:'rf-pol',label:'السياسات',msg:'اقرأ السياسات ووافق عليها للمتابعة.'}); $('#rfE').textContent='اقرأ السياسات ووافق عليها للمتابعة.'; }
    if(!F.agree){ ok=false; errs.push({id:'rf-agree',label:'الإقرار',msg:'أكّد صحة البيانات للمتابعة.'}); $('#rfE').textContent='أكّد صحة البيانات للمتابعة.'; }
    showErrorSummary($('#rfSum'), errs);
    if(!ok) return;
    F.accepted_policies = F.policies ? F.policies.split(',') : []; delete F.policies;
    delete F.agree; F.full_name=F.full_name.trim().replace(/\s+/g,' ');
    setBusy(b,true,'جارٍ حفظ التسجيل');
    try{
      delete F.en_kind; delete F.en_item;
      const waBtn = (ref, what) => `<p style="margin:14px 0 0"><a class="btn sm" target="_blank" rel="noopener" href="${waLink(`السلام عليكم، سجّلت في ${what} عبر المنصة.\nرقم المرجع: ${ref}\nالاسم: ${F.full_name}`)}">${WA_LOGO} تواصل مع المركز عبر واتساب</a></p>`;
      const manarNote = `<p class="hint" style="max-width:480px;margin:10px auto 0">${ic('award')} شهادتك المعتمدة تصدر عبر <a href="${CENTER.manar}" target="_blank" rel="noopener" style="color:var(--brand);font-weight:500">منصة منار</a> التابعة للمؤسسة العامة للتدريب التقني والمهني. أنشئ حسابك فيها بنفس بياناتك.</p>`;
      const gNote = F.guardian_phone ? `<p class="hint" style="max-width:480px;margin:10px auto 0">${ic('users')} لمتابعة ولي الأمر: يدخل «بوابة ولي الأمر» بجواله ${esc(F.guardian_phone)}، ثم يكتب رقم سجلك المدني مرة واحدة.</p>` : '';
      if(tg.plan_id){
        const r = await Store.registerSubscription({...F, ...tg});
        $('#regCard').outerHTML = `<div class="card success rv" id="regCard"><div class="bigcheck">${ic('check')}</div><h2 style="font-size:24px;font-weight:700">اكتمل اشتراكك</h2>
          <p class="hint" style="margin:8px 0 0;font-size:15px">أهلًا ${esc(F.full_name.split(' ')[0])}. رقم تسجيلك:</p><div class="refbox">${esc(r.ref)}</div>
          <div class="grid" style="gap:6px;max-width:480px;margin:0 auto 12px"><div class="pill info" style="justify-content:center;padding:6px 12px">${esc(r.plan)} · ${esc(r.section)}</div>
            <div class="pill g" style="justify-content:center;padding:6px 12px;white-space:normal">مواعيدك: ${esc(r.schedule)}</div></div>
          <p class="hint" style="max-width:480px;margin:0 auto">يبدأ اشتراكك من أول يوم تحضر فيه: امسح باركود الحضور في المعهد وأدخل رقم سجلك المدني.</p>${gNote}${manarNote}${r.order?'':waBtn(r.ref, 'باقة '+r.plan)}<div id="ordBox" style="text-align:start;max-width:520px;margin:16px auto 0">${orderPanelHtml(r.order, F.full_name)}</div></div>`;
        { const rebind=o=>{ $('#ordBox').innerHTML=orderPanelHtml(o, F.full_name); bindOrderPanel($('#ordBox'), o, {national_id:F.national_id}, rebind); }; if(r.order) bindOrderPanel($('#ordBox'), r.order, {national_id:F.national_id}, rebind); }
        liveSay('اكتمل اشتراكك. رقم تسجيلك '+r.ref+(r.order?'، ورقم طلب الشراء '+r.order.number:'')); return;
      }
      const r = await Store.register({...F, ...tg});
      if(r.request){
        $('#regCard').outerHTML = `<div class="card success rv" id="regCard"><div class="bigcheck">${ic('check')}</div><h2 style="font-size:24px;font-weight:700">اكتمل تسجيلك المبدئي</h2>
          <p class="hint" style="margin:8px 0 0;font-size:15px">أهلًا ${esc(F.full_name.split(' ')[0])}. رقم طلبك:</p><div class="refbox">${esc(r.ref)}</div>
          <div class="pill info" style="justify-content:center;padding:6px 12px;max-width:460px;margin:0 auto 12px">${esc(r.program)}</div>
          <p class="hint" style="max-width:480px;margin:0 auto">لا توجد دفعة مفتوحة الآن. حين يفتح المركز الدفعة القادمة يُنقل طلبك إليها ويصلك رقم طلب الشراء وموعد البدء، ولا يُطلب منك سداد قبل ذلك.</p>${gNote}${manarNote}${waBtn(r.ref, 'برنامج '+r.program+' (تسجيل مبدئي)')}</div>`;
        liveSay('اكتمل تسجيلك المبدئي. رقم طلبك '+r.ref); return;
      }
      const cs = r.cohorts || cohortsFn().map(c=>({number:c.number, start:c.start_date}));
      $('#regCard').outerHTML = `<div class="card success rv" id="regCard"><div class="bigcheck">${ic('check')}</div><h2 style="font-size:24px;font-weight:700">اكتمل تسجيلك</h2>
        <p class="hint" style="margin:8px 0 0;font-size:15px">أهلًا ${esc(F.full_name.split(' ')[0])}. رقم تسجيلك:</p><div class="refbox">${esc(r.ref)}</div>
        <div class="grid" style="gap:6px;max-width:460px;margin:0 auto 12px">${cs.map(c=>`<div class="pill info" style="justify-content:center;padding:6px 12px">${c.program?esc(c.program)+' · ':''}${cohortLabel(c)} · تبدأ ${fmtShort(c.start)}</div>`).join('')}</div>
        <p class="hint" style="max-width:480px;margin:0 auto">في أيام التدريب امسح باركود المركز الموحد المعلّق في القاعة، ثم أدخل رقم سجلك المدني لتسجيل حضورك.</p>${gNote}${manarNote}${r.order?'':waBtn(r.ref, 'برنامج '+((r.cohorts||[]).map(x=>x.program).join('، ')))}<div id="ordBox" style="text-align:start;max-width:520px;margin:16px auto 0">${orderPanelHtml(r.order, F.full_name)}</div></div>`;
      { const rebind=o=>{ $('#ordBox').innerHTML=orderPanelHtml(o, F.full_name); bindOrderPanel($('#ordBox'), o, {national_id:F.national_id}, rebind); }; if(r.order) bindOrderPanel($('#ordBox'), r.order, {national_id:F.national_id}, rebind); }
      liveSay('اكتمل تسجيلك. رقم تسجيلك '+r.ref+(r.order?'، ورقم طلب الشراء '+r.order.number:''));
    }catch(er){ setBusy(b,false); showErrorSummary($('#rfSum'), [{id:'rf-full_name',label:'تعذّر التسجيل',msg:er.message}]); $('#rfE').textContent=er.message; }
  };
}
export function attendanceBoxHtml(st){
  return `<div class="card checkin rv" style="max-width:520px;margin:0 auto" id="attCard">
    <div class="head"><h2 style="margin-top:0">تحقق الحضور اليومي</h2><div class="hint" id="cDate"></div><div class="clock" id="cClock" dir="ltr"></div></div>
    <form id="cf" class="pad" novalidate>
      <div class="field"><label>رقم السجل المدني أو الإقامة</label><input class="inp nidinp num" id="nid" inputmode="numeric" maxlength="10" dir="ltr" placeholder="1XXXXXXXXX" autocomplete="off"></div>
      ${st.require_code?`<div class="field" style="margin-top:16px"><label style="text-align:center">رمز اليوم الظاهر على شاشة القاعة</label><div class="codebox">${[0,1,2,3].map(i=>`<input maxlength="1" inputmode="numeric" aria-label="الرقم ${i+1}">`).join('')}</div></div>`:''}
      <div class="errtxt" id="cErr" style="text-align:center;margin-top:10px"></div>
      <button class="btn pri lg" style="width:100%;margin-top:12px" id="cBtn">${ic('check')} تسجيل الحضور</button>
    </form><div id="cRes" class="pad hidden" aria-live="polite"></div><div class="pad" style="padding-top:0;text-align:center"><a href="#portals" class="hint" style="color:var(--brand);font-weight:500">${ic('activity')} تابع حضورك وتقدّمك من بوابة المتدرب</a></div></div>`;
}
export function bindAttendance(st, programCode, onBack){
  const tick=()=>{ const n=riyadhNow(); if(!$('#cClock')) return; $('#cClock').textContent=t12(n.hm).replace(' ص',' AM').replace(' م',' PM'); $('#cDate').textContent=fmtDate(n.date); };
  tick(); timers.push(setInterval(tick,1000));
  const nid=$('#nid'); nid.addEventListener('input',()=>{ nid.value=toLatin(nid.value).replace(/\D/g,''); nid.classList.remove('err'); if(nid.value.length===10) $('.codebox input')?.focus(); });
  $$('.codebox input').forEach((inp,i,all)=>{
    inp.addEventListener('input',()=>{ inp.value=toLatin(inp.value).replace(/\D/g,'').slice(-1); if(inp.value && all[i+1]) all[i+1].focus(); });
    inp.addEventListener('keydown',e=>{ if(e.key==='Backspace' && !inp.value && all[i-1]) all[i-1].focus(); });
    inp.addEventListener('paste',e=>{ const t=(e.clipboardData.getData('text')||'').replace(/\D/g,'').slice(0,4); if(t.length){ e.preventDefault(); all.forEach((x,j)=>x.value=t[j]||''); all[Math.min(t.length,3)].focus(); } });
  });
  $('#cf').onsubmit = async e=>{
    e.preventDefault(); const er=$('#cErr'); er.textContent='';
    const id=nid.value.trim(), code=$$('.codebox input').map(x=>x.value).join('');
    if(!validSaudiId(id)){ er.textContent='رقم السجل غير صحيح. يتكون من 10 أرقام ويبدأ بـ 1 أو 2.'; nid.classList.add('err'); return; }
    if(st.require_code && code.length!==4){ er.textContent='اكتب رمز اليوم المكوّن من 4 أرقام.'; return; }
    const b=$('#cBtn'); setBusy(b,true,'جارٍ التحقق من السجل');
    const send = async choice => { let r; try{ r = await Store.checkin(id, code, programCode, {device:deviceId(), choice}); }catch(x){ r={ok:false,reason:'error',msg:x.message}; }
      setBusy(b,false); liveSay(r.ok?'سُجّل حضورك':r.reason==='choose'?'اختر البرنامج':'تعذّر تسجيل الحضور');
      if(r.reason==='choose') return showChoice(r, send, onBack);
      showCheckinResult(r, onBack); };
    await send();
  };
}
/* معرّف عشوائي لهذا المتصفح، لكشف تحضير أكثر من متدرب من جهاز واحد (لا يحوي بيانات شخصية) */
export function deviceId(){ try{ let d=localStorage.getItem('sama_device'); if(!d){ d=uid(); localStorage.setItem('sama_device',d); } return d; }catch(e){ return ''; } }
/* عند وجود أكثر من تسجيل له جلسة الآن: يختار المتدرب برنامجه */
export function showChoice(r, send, onBack){
  const box=$('#cRes'); $('#cf').classList.add('hidden'); box.classList.remove('hidden');
  box.innerHTML = `<div style="text-align:center" class="rv"><h2 style="font-size:21px;font-weight:700">أهلًا ${esc(r.name.split(' ')[0])}، اختر برنامج جلستك الآن</h2>
    <p class="hint">لديك أكثر من تسجيل في هذا الوقت.</p></div>
    <div class="grid" style="gap:8px;margin-top:12px">${r.options.map(o=>`<button class="btn lg" data-ch="${esc(o.id)}" style="width:100%">${ic('book')} ${esc(o.label)}</button>`).join('')}</div>
    <button class="btn" style="width:100%;margin-top:12px" id="cAgain">${ic('prev')} رجوع</button>`;
  $$('[data-ch]').forEach(b=>b.onclick=async()=>{ setBusy(b,true,'جارٍ التسجيل'); await send(b.dataset.ch); });
  $('#cAgain').onclick = onBack; $('[data-ch]')?.focus();
}
/* عنوان رسالة رفض التحضير ونصها ونبرتها وأيقونتها (صفحة التحضير وشاشة الترحيب في البوابة) */
export function checkinMsg(r){
    const first = r.name ? `أهلًا ${esc(r.name.split(' ')[0])}. ` : '';
    return {
      bad_code:['رمز اليوم غير صحيح','اكتب الرمز الظاهر على شاشة القاعة.','bad','x'],
      not_found:['السجل المدني غير موجود في كشف الدفعة', `لا يوجد تسجيل بهذا الرقم${r.program?` في ${cohortLabel(r)} من «${esc(r.program)}»`:''}. تأكد من الرقم أو راجع الاستقبال.`,'bad','x'],
      not_in_cohort:['السجل المدني غير موجود في كشف الدفعة', `هذا الرقم غير مسجّل في ${r.number?cohortLabel(r):'الدفعات المنعقدة اليوم'}${r.program?` من «${esc(r.program)}»`:''}. تأكد من الرقم أو راجع الاستقبال.`,'bad','x'],
      no_cohort:['لا توجد دفعة منعقدة', r.upcoming?`تبدأ ${cohortLabel(r.upcoming)} من «${esc(r.program)}» في ${fmtShort(r.upcoming.start)}.`:`لا توجد دفعة منعقدة حاليًا${r.program?` في «${esc(r.program)}»`:''}.`,'warn','calendar'],
      order_pending:['طلبك لم يُعتمد بعد','لا يُسجَّل الحضور قبل اعتماد طلب التسجيل وتأكيد السداد. راجع إدارة المعهد أو تابع طلبك من بوابتك.','warn','timer'],
      no_program:['البرنامج غير موجود','الباركود لا يطابق أي برنامج. راجع الاستقبال.','bad','x'],
      no_session:['لا توجد محاضرة الآن', `${first}${r.next?`المحاضرة القادمة ${fmtDate(r.next.date)} الساعة ${t12(r.next.time)}.`:'لا توجد محاضرات قادمة في دفعتك.'}`,'warn','timer'],
      error:['تعذّر الاتصال', esc(r.msg||'')+' حاول مرة أخرى بعد قليل.','bad','alert'] }[r.reason] || ['تعذّر التسجيل','','bad','alert'];
}
export function showCheckinResult(r, onBack){
  const box=$('#cRes'); $('#cf').classList.add('hidden'); box.classList.remove('hidden');
  const again = `<button class="btn" style="width:100%;margin-top:16px" id="cAgain">${ic('prev')} رجوع</button>`;
  if(r.ok){
    const late = r.status==='متأخر';
    box.innerHTML = `<div style="text-align:center" class="rv"><div class="bigcheck ${late?'warn':''}">${ic(late?'timer':'check')}</div>
      <h2 style="font-size:22px;font-weight:700">${r.already?'حضورك مسجّل مسبقًا اليوم':'سُجّل حضورك'}</h2>
      <p class="hint" style="margin:4px 0 14px">أهلًا ${esc(r.name.split(' ')[0])}، يومًا تدريبيًا موفقًا.</p>${r.started?`<p class="pill ok" style="justify-content:center;margin:0 auto 12px;width:fit-content">بدأ اشتراكك اليوم</p>`:''}</div>
      <div class="result-card rv" style="--i:2">
        <div class="r"><span>${ic('user')}المتدرب</span><b>${esc(r.name)}</b></div>
        <div class="r"><span>${ic('book')}البرنامج</span><b>${esc(r.program)}</b></div>
        ${r.kind==='subscription' ? `<div class="r"><span>${ic('users')}القسم</span><b>${esc(r.section)}</b></div>` : `<div class="r"><span>${ic('users')}الدفعة</span><b>${cohortLabel(r)}</b></div>`}
        ${r.package?`<div class="r"><span>${ic('layers')}الباقة</span><b>${esc(r.package)}</b></div>`:''}
        ${r.hall?`<div class="r"><span>${ic('pin')}القاعة</span><b>${esc(r.hall)}</b></div>`:''}
        <div class="r"><span>${ic('clock')}وقت الحضور</span><b class="num">${t12(r.time)}</b></div>
        <div class="r"><span>${ic('activity')}الحالة</span><b><span class="pill dot ${late?'warn':'ok'}">${late?'متأخر':'في الوقت'}</span></b></div>
      </div>${again}`;
  } else {
    const M = checkinMsg(r);
    box.innerHTML = `<div style="text-align:center" class="rv"><div class="bigcheck ${M[2]}">${ic(M[3])}</div>
      <h2 style="font-size:21px;font-weight:700">${M[0]}</h2><p class="hint" style="font-size:14px">${M[1]}</p></div>${again}`;
  }
  $('#cAgain').onclick = onBack;
}
export async function viewProgramPage(code, tab){
  const app=$('#app'); app.innerHTML=`<div class="wrap">${skeleton()}</div>`;
  let p, st={require_code:false};
  try{ [p, st] = await Promise.all([Store.publicProgram(code), Store.publicSettings()]); }catch(e){ app.innerHTML=`<div class="wrap">${emptyBox('تعذّر تحميل البرنامج', esc(e.message))}</div>`; return; }
  if(!p){ app.innerHTML=`<div class="wrap">${emptyBox('البرنامج غير موجود','تحقق من الرابط أو الباركود.')}<div style="text-align:center;margin-top:14px"><a class="btn pri" href="#register">${ic('book')} دليل البرامج</a></div></div>${siteFooter()}`; return; }
  const c=p.cohort, today=riyadhNow().date, ps=cohortPublicState(c,today), sessionToday = c && isSessionDay(c,today);
  tab = tab || (sessionToday || (c && c.start_date<=today && !c.reg_open) ? 'att' : 'reg');
  app.innerHTML = `<div class="wrap">
    <section class="hero rv" style="align-items:flex-start"><div class="logo"><img src="${LOGO}" alt="" style="height:96px"></div><div style="flex:1;min-width:0">
      <span class="hero-pill">${ic(CAT_ICON[p.category]||'book')}${esc(p.category)}${p.accreditation_no?` · رقم الاعتماد ${esc(p.accreditation_no)}`:''}</span>
      <h1>${esc(p.name)}</h1>
      ${p.description?`<p>${esc(p.description)}</p>`:''}
      <p class="hero-note">${ic('award')} الشهادة المعتمدة تصدر عبر <a href="${CENTER.manar}" target="_blank" rel="noopener">منصة منار</a> (المؤسسة العامة للتدريب التقني والمهني)؛ يلزم المتدرب إنشاء حساب فيها.</p>
      <ul class="stats" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
        <li>${ic('hourglass')}<b>${p.hours==null?'—':fmtNum(p.hours)}</b><span>ساعة تدريبية</span></li>
        <li>${ic('calendar')}<b>${p.duration_days==null?'—':fmtNum(p.duration_days)}</b><span>أيام</span></li>
        <li>${ic('wallet')}<b style="font-size:${Number(p.price)>0?24:16}px">${Number(p.price)>0?fmtNum(p.price):'عند التواصل'}</b><span>${Number(p.price)>0?'ريال سعودي':'السعر'}</span></li>
        ${c?`<li>${ic('users')}<b>${fmtNum(Math.max(0,c.seats-(c.taken||0)))}</b><span>مقعدًا متبقيًا في ${cohortLabel(c)}</span></li>`:''}
      </ul>
      ${c?`<div class="cohort-strip"><span class="pill dot ${ps.pill}" style="background:rgba(255,255,255,.12);color:#fff">${ps.txt}</span><span>${ic('calendar')}${fmtShort(c.start_date)} – ${fmtShort(c.end_date)}</span><span>${ic('clock')}${t12(c.start_time)} – ${t12(c.end_time)}</span><span>${ic('grid')}${daysList(c)}</span>${c.hall?`<span>${ic('pin')}${esc(c.hall)}</span>`:''}</div>`:''}
    </div></section>
    <div class="tabs rv" style="--i:1;margin:18px 0" role="tablist"><button class="tab" role="tab" data-t="reg" aria-selected="${tab==='reg'}">${ic('form')}التسجيل في الدفعة</button><button class="tab" role="tab" data-t="att" aria-selected="${tab==='att'}">${ic('qr')}تسجيل الحضور</button></div>
    <div id="pBody"></div></div>${siteFooter()}`;
  $$('.tabs .tab').forEach(b=>b.onclick=()=>{ cleanup(); viewProgramPage(code, b.dataset.t); });
  const body=$('#pBody');
  if(tab==='att'){ body.innerHTML=attendanceBoxHtml(st); bindAttendance(st, code, ()=>viewProgramPage(code,'att')); return; }
  if(ps.k==='open'){ body.innerHTML=regFormHtml(`التسجيل في ${cohortLabel(c)}`, `تبدأ ${fmtDate(c.start_date)}`); bindRegForm({program_id:p.id, _mode:isKidsProgram(p)?'kids':'program'}, ()=>[c]); }
  else { body.innerHTML = regFormHtml('التسجيل المبدئي في البرنامج', ps.k==='running'?`${cohortLabel(c)} منعقدة الآن؛ سجّل مبدئيًا للدفعة القادمة ويتواصل معك المركز عند فتحها`:'لا توجد دفعة مفتوحة الآن؛ سجّل مبدئيًا ويتواصل معك المركز عند فتح الدفعة، ولا يُطلب منك سداد قبل ذلك'); bindRegForm({program_id:p.id, _mode:isKidsProgram(p)?'kids':'program'}, ()=>[]); }
}
export async function viewGeneralCheckin(){
  const app=$('#app'); let st={require_code:false}; try{ st=await Store.publicSettings(); }catch(e){}
  app.innerHTML=`<div class="wrap"><div style="text-align:center;margin-bottom:16px" class="rv"><img src="${LOGO}" alt="" style="height:84px;background:#fff;border-radius:20px;padding:8px;box-shadow:var(--shadow-card)"></div>${attendanceBoxHtml(st)}
    <p class="hint" style="text-align:center;margin-top:14px">باركود الحضور الموحد: يتعرف النظام من سجلك المدني على باقتك أو دفعتك وجلستك الحالية.</p></div>${siteFooter()}`;
  bindAttendance(st, null, viewGeneralCheckin);
}

/* =====================================================================
   3) شاشة باركود البرنامج (ثابت لكل برنامج، يخدم كل دفعاته)
   ===================================================================== */
/* اختيار البوابة: المتدرب، وولي الأمر، والمدرب (لكل منها صفحة ودور) */
export function viewPortals(){
  const C=[['student','بوابة المتدرب','للمتدربين والمتدربات','حضورك ونسبة إنجازك في باقتك أو برنامجك، وواجباتك واختباراتك ومواعيدك القادمة، وتسجيل الحضور من جوالك.','s'],
    ['guardian','بوابة ولي الأمر','لأولياء الأمور','متابعة حضور ابنك أو ابنتك وتقدّمه، والتنبيهات والرسائل. الدخول برقم هوية الابن أو الابنة.','g'],
    ['teacher','بوابة المدرب','للمدربين والمدربات','كشف حضور متدربيك اليومي، والواجبات والاختبارات، والمجموعات الذكية، والتواصل.','t']];
  $('#app').innerHTML = `<section class="portals-page"><div class="wrap">
    <div class="sec-head rv portals-head"><span class="kicker">البوابات</span><h2>اختر <em>بوابتك</em></h2><p class="hint">الدخول برقم الهوية، وفي المرة الأولى برمز التفعيل من إدارة المركز.</p></div>
    <div class="portals-grid">${C.map(([k,t,who,d,c],n)=>`<a class="portal-card pc-${c} rv" style="--i:${n}" href="${portalBase(k)}">
      <span class="pc-art">${PORTAL_ART[k]}</span><span class="pc-who">${who}</span><b>${t}</b><span class="hint">${d}</span><span class="pl-cta">دخول ${ic('next')}</span></a>`).join('')}</div></div></section>${siteFooter()}`;
}
/* الباركود الموحد لكل البرامج والباقات (D-03): يُطبع ويُعلَّق في المعهد ولا يتغير */
export async function viewQRCheckin(){
  const app=$('#app'), D=await Store.adminData(), url=baseUrl(D.settings)+'#checkin', n=riyadhNow();
  app.innerHTML = `<div class="display">
    <div class="qrpanel rv"><img src="${LOGO}" alt="" style="height:72px;background:#fff;border-radius:16px;padding:6px;margin-bottom:14px">
      <span class="hero-pill">${ic('qr')}باركود الحضور الموحد</span><h2>تسجيل الحضور اليومي</h2>
      <p style="color:var(--hero-muted);margin:4px 0 18px">امسح الباركود، ثم أدخل رقم سجلك المدني</p>
      <div class="qrbox"><div id="qr"></div><div class="beam"></div></div></div>
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card pad rv" style="--i:1;text-align:center"><div class="clock" id="dClock" dir="ltr" style="font-size:46px;color:var(--ink)"></div><div class="hint" style="font-size:15px;margin-top:6px">${fmtDate(n.date)}</div></div>
      <div class="card pad rv" style="--i:2"><h3 class="ctitle">${ic('activity')}حضور اليوم</h3><div class="livefeed" id="feed"></div></div>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><a class="btn sm" href="#admin-qudurat">${ic('prev')} القدرات والتحصيلي</a><button class="btn sm" id="cp">${ic('copy')} نسخ الرابط</button><button class="btn sm" id="pr">${ic('form')} طباعة</button></div>
      <div class="hint" style="text-align:center;word-break:break-all" dir="ltr">${esc(url)}</div></div></div>`;
  makeQR($('#qr'), url, 320);
  $('#cp').onclick=()=>copyText(url,'نُسخ رابط التحضير'); $('#pr').onclick=()=>window.print();
  const tick=()=>{ const el=$('#dClock'); if(el) el.textContent=t12(riyadhNow().hm).replace(' ص',' AM').replace(' م',' PM'); }; tick(); timers.push(setInterval(tick,1000));
  const feed=async()=>{ const d=await Store.adminData(), td=riyadhNow().date;
    const rows=[...(d.sub_attendance||[]).filter(a=>a.att_date===td).map(a=>({t:a.time, who:a.trainee_id, st:a.status})), ...d.attendance.filter(a=>a.att_date===td).map(a=>({t:a.time, who:a.trainee_id, st:a.status}))].sort((a,b)=>b.t.localeCompare(a.t)).slice(0,8);
    const el=$('#feed'); if(!el) return;
    el.innerHTML = rows.length ? rows.map(r=>`<div class="fi"><span class="pill dot ${r.st==='متأخر'?'warn':'ok'}">${esc(r.st)}</span><b>${esc((d.trainees.find(t=>t.id===r.who)?.full_name||'').split(' ').slice(0,2).join(' '))}</b><span class="num hint">${t12(r.t.slice(0,5))}</span></div>`).join('') : `<p class="hint">لم يُسجَّل حضور بعد اليوم.</p>`; };
  feed(); timers.push(setInterval(feed, 8000));
}
export async function viewQR(code){
  const app=$('#app'); const D=await Store.adminData(); const p=D.programs.find(x=>progCode(x)===code);
  if(!p){ app.innerHTML=`<div class="wrap">${emptyBox('البرنامج غير موجود')}</div>`; return; }
  const st=D.settings, url=programUrl(p,st), today=riyadhNow().date, c=activeCohortOf(D,p.id,today);
  app.innerHTML = `<div class="display">
    <div class="qrpanel rv"><img src="${LOGO}" alt="" style="height:72px;background:#fff;border-radius:16px;padding:6px;margin-bottom:14px">
      <span class="hero-pill">${ic('qr')}${c?`${cohortLabel(c)} · ${STATE_TXT[cohortState(c,today)]}`:'لا توجد دفعة نشطة'}</span>
      <h2>${esc(p.name)}</h2>
      <p style="color:var(--hero-muted);margin:4px 0 18px">امسح الباركود للتسجيل في الدفعة أو لتسجيل حضورك اليومي</p>
      <div class="qrbox"><div id="qr"></div><div class="beam"></div></div>
      ${st.require_code?`<div class="daycode"><span>رمز اليوم</span><b id="dCode">····</b></div>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:16px">
      <div class="card pad rv" style="--i:1;text-align:center"><div class="clock" id="dClock" dir="ltr" style="font-size:46px;color:var(--ink)"></div><div class="hint" style="font-size:15px;margin-top:6px">${fmtDate(today)}</div></div>
      ${c?`<div class="card pad rv" style="--i:2"><h3 class="ctitle" style="margin-bottom:10px">${ic('users')}${cohortLabel(c)}</h3>
        <div class="grid g2" style="gap:10px">${kpiCard(0,'users','info','المسجلون',takenOf(D,c.id),'',`من ${fmtNum(c.seats)} مقعد`)}${kpiCard(1,'check','success','حضور اليوم',0,'',isSessionDay(c,today)?`${t12(c.start_time)} – ${t12(c.end_time)}`:'لا محاضرة اليوم')}</div></div>
      <div class="card pad rv" style="--i:3"><div style="display:flex;justify-content:space-between;align-items:center"><h3 class="ctitle">${ic('activity')}آخر الحضور</h3></div><div class="livefeed" id="feed"></div></div>`
      : `<div class="rv">${emptyBox('لا توجد دفعة نشطة','افتح دفعة جديدة من صفحة الدفعات، ويبقى هذا الباركود نفسه.')}</div>`}
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><a class="btn sm" href="#admin-cohorts">${ic('prev')} الدفعات</a><button class="btn sm" id="cp">${ic('copy')} نسخ الرابط</button><button class="btn sm" id="fs">${ic('expand')} ملء الشاشة</button></div>
      <div class="hint" style="text-align:center;word-break:break-all" dir="ltr">${esc(url)}</div>
    </div></div>`;
  makeQR($('#qr'), url, 320); countUp(app);
  $('#cp').onclick=()=>copyText(url,'نُسخ رابط البرنامج');
  $('#fs').onclick=()=>{ (document.documentElement.requestFullscreen?.()||Promise.reject()).catch(()=>toast('ملء الشاشة غير متاح في هذا العرض')); };
  const tick=()=>{ const el=$('#dClock'); if(el) el.textContent=t12(riyadhNow().hm).replace(' ص',' AM').replace(' م',' PM'); }; tick(); timers.push(setInterval(tick,1000));
  if(st.require_code) Store.todayCode().then(x=>{ if($('#dCode')) $('#dCode').textContent=x; }).catch(()=>{});
  if(!c) return;
  let last=null;
  const refresh=async()=>{ const d=await Store.adminData(); const td=riyadhNow().date; const att=d.attendance.filter(a=>a.cohort_id===c.id&&a.att_date===td).sort((a,b)=>b.time.localeCompare(a.time));
    const k=$$('.kpi b')[1]; if(k) k.textContent=fmtNum(att.length);
    const ids=att.slice(0,8).map(a=>a.id).join(); if(ids===last) return; last=ids;
    $('#feed').innerHTML = att.slice(0,8).map((a,i)=>{ const t=d.trainees.find(x=>x.id===a.trainee_id); return `<div class="f" style="animation-delay:${i*60}ms"><b style="font-weight:600">${esc(t?.full_name.split(' ').slice(0,2).join(' ')||'—')}</b><span class="pill dot ${a.status==='متأخر'?'warn':'ok'} num">${t12(a.time.slice(0,5))}</span></div>`; }).join('') || emptyBox('لم يُسجَّل حضور اليوم بعد'); };
  refresh(); timers.push(setInterval(refresh,8000));
}
/* جلسات اليوم: باقات القدرات والتحصيلي (لكل قسم جلسته من الجدول بعد الاستثناءات) ثم دفعات البرامج */
export function todaySessions(D, today=riyadhNow().date){
  const subs = D.subscriptions||[], sa = (D.sub_attendance||[]).filter(a=>a.att_date===today);
  const pk = Object.keys(SECTIONS).map(sec=>{ const ses=sessionOn(D, sec, today); if(!ses) return null;
    const live = subs.filter(x=>x.section===sec && ['active','pending'].includes(subStatus(x, today)));
    const ids = new Set(live.map(x=>x.id)), subj=[...new Set(live.flatMap(x=>x.subjects||[]))];
    return {kind:'pkg', key:sec, start:ses.start, end:ses.end, title:`القدرات والتحصيلي · ${SECTIONS[sec]}`, sub:subj.join(' · '), note:ses.kind==='regular'?'':(ses.kind==='makeup'?'جلسة تعويضية':'تغيير وقت'), expected:live.length, present:sa.filter(a=>ids.has(a.subscription_id)).length}; }).filter(Boolean);
  const co = D.cohorts.filter(c=>!cohortArchived(c,today) && isSessionDay(c,today)).map(c=>{ const p=D.programs.find(x=>x.id===c.program_id);
    return {kind:'cohort', key:c.id, start:String(c.start_time).slice(0,5), end:String(c.end_time).slice(0,5), title:p?.name||'', sub:`${cohortLabel(c)}${c.hall?` · ${c.hall}`:''}`, cat:p?.category, code:p?progCode(p):'', expected:takenOf(D,c.id), present:D.attendance.filter(a=>a.cohort_id===c.id&&a.att_date===today).length}; });
  return [...pk, ...co].sort((a,b)=>toMin(a.start)-toMin(b.start));
}
/* شاشة محاضرات اليوم: الباركود الموحد (للباقات والدورات معًا) وقائمة جلسات اليوم */
export async function viewDisplay(){
  const app=$('#app'); const D=await Store.adminData(); const today=riyadhNow().date, url=baseUrl(D.settings)+'#checkin';
  const L=todaySessions(D, today), now=toMin(riyadhNow().hm);
  app.innerHTML = `<div class="wrap">${titleBar(`${ic('calendar')}${fmtDate(today)}`,'محاضرات اليوم، <em>بباركود حضور واحد</em>','باركود واحد ثابت لكل الدورات وباقات القدرات والتحصيلي: يفتح صفحة «تسجيل الحضور»، ويتعرف النظام من السجل المدني على جلسة المتدرب الآن. اطبعه مرة واحدة وعلّقه، أو اعرضه على شاشة القاعة.',`<a class="btn sm" href="#admin-attendance">${ic('prev')} الحضور اليومي</a>`)}
    <div class="card pad rv" style="--i:1;display:flex;gap:18px;align-items:center;flex-wrap:wrap;justify-content:center;margin-bottom:16px">
      <div class="qrmini" id="uQR"></div>
      <div style="flex:1;min-width:220px;display:grid;gap:8px"><span class="hero-pill" style="justify-self:start;color:var(--brand)">${ic('qr')}باركود الحضور الموحد</span>
        <p class="hint" style="margin:0">امسح الباركود ثم أدخل رقم السجل المدني. إن كان للمتدرب أكثر من جلسة الآن يُطلب منه الاختيار.</p>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><a class="btn pri sm" href="#qr-checkin">${ic('expand')} عرض على الشاشة</a><button class="btn sm" id="uCp">${ic('copy')} نسخ الرابط</button></div>
        <div class="hint" dir="ltr" style="word-break:break-all">${esc(url)}</div></div></div>
    <h2 class="sec-title rv" style="--i:2">جلسات اليوم <span class="pill g">${fmtNum(L.length)}</span></h2>
    <div class="grid g3">${L.map((x,i)=>{ const live=toMin(x.start)<=now && now<toMin(x.end), done=now>=toMin(x.end);
      return `<div class="card pad rv" style="--i:${i+3};display:flex;flex-direction:column;gap:8px">
        <div style="display:flex;gap:6px;flex-wrap:wrap"><span class="pill dot ${x.kind==='pkg'?'info':catPill(x.cat)}">${x.kind==='pkg'?'باقات':esc(x.cat||'')}</span><span class="pill dot ${live?'ok':done?'g':'warn'}">${live?'منعقدة الآن':done?'انتهت':'لم تبدأ'}</span>${x.note?`<span class="pill dot warn">${x.note}</span>`:''}</div>
        <h3 style="font-size:17px;font-weight:600">${esc(x.title)}</h3>
        <div class="hint">${t12(x.start)} – ${t12(x.end)}${x.sub?` · ${esc(x.sub)}`:''}</div>
        <span class="pill dot ok" style="align-self:flex-start">${fmtNum(x.present)} من ${fmtNum(x.expected)} حاضر</span>
        <div style="display:grid;gap:6px;margin-top:auto"><button class="btn pri sm" data-sheet="${x.kind}:${x.key}">${ic('form')} كشف حضور اليوم وطباعته</button>
        ${live||done?`<button class="btn sm" data-abs="${x.kind}:${x.key}:${done?1:0}">${ic('send')} الغائبون وإبلاغ أولياء الأمور</button>`:''}</div></div>`; }).join('') || `<div style="grid-column:1/-1">${emptyBox('لا توجد جلسات اليوم','تظهر هنا جلسات باقات القدرات والتحصيلي حسب جدول كل قسم، ودفعات البرامج في أيام محاضراتها.')}</div>`}</div></div>`;
  makeQR($('#uQR'), url, 200); $('#uCp').onclick=()=>copyText(url,'نُسخ رابط التحضير');
  // كشف حضور الجلسة لليوم: معاينة A4 ثم طباعة أو حفظ PDF للاحتفاظ به مرجعًا للمعهد
  $$('[data-abs]').forEach(b=>b.onclick=async()=>{ const [k,id,e]=b.dataset.abs.split(':'); const {absenceModal}=await import('./absence_notify.js'); absenceModal(D, k, id, today, e==='1'); });
  $$('[data-sheet]').forEach(b=>b.onclick=async()=>{ const [k,id]=b.dataset.sheet.split(':'); const [P,A]=await Promise.all([import('./print.js'), import('./views2_admin.js')]); A.setAD(D);
    P.printDocs([k==='pkg'?P.sectionSheetHtml(id, today):P.sheetHtml(D.cohorts.find(c=>c.id===id), today)], `كشف حضور ${fmtDate(today)}`); });
}

/* =====================================================================
   4) دخول المدير
   ===================================================================== */
/* اختيار كلمة المرور: للمدعوّ برابط البريد، ولمن أُنشئ حسابه بكلمة مؤقتة (أول دخول)، ولاستعادة كلمة المرور */
export function viewSetPassword(kind){
  const T={invite:['مرحبًا بك مسؤولًا في المنصة','اختر كلمة مرور لحسابك، ثم تدخل لوحة الإدارة بالدور الذي حدده لك مدير النظام.'],
    first:['غيّر كلمة المرور المؤقتة','دخلت بكلمة مرور مؤقتة. اختر كلمة مرور خاصة بك قبل المتابعة.'],
    recovery:['كلمة مرور جديدة','اختر كلمة مرور جديدة لحسابك.']}[kind]||['كلمة مرور جديدة',''];
  $('#app').innerHTML = `<div class="wrap"><div class="login card rv">
    <div class="checkin" style="max-width:none"><div class="head"><img src="${LOGO}" alt=""><h2>${T[0]}</h2><div class="hint">${T[1]}</div></div></div>
    <form id="spF" class="grid pad" novalidate>
      <div class="field"><label for="sp-a">كلمة المرور (8 أحرف على الأقل)</label><input class="inp" id="sp-a" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="sp-b">أعد كتابتها</label><input class="inp" id="sp-b" type="password" autocomplete="new-password"></div>
      <div class="errtxt" id="spE" role="alert"></div>
      <button class="btn pri" id="spGo">${ic('lock')} حفظ والمتابعة</button></form></div></div>`;
  $('#spF').onsubmit = async e=>{ e.preventDefault(); const a=$('#sp-a').value, b=$('#sp-b').value, er=$('#spE'), btn=$('#spGo'); er.textContent='';
    if(a.length<8){ er.textContent='كلمة المرور 8 أحرف على الأقل'; return; } if(a!==b){ er.textContent='الكلمتان غير متطابقتين'; return; }
    setBusy(btn,true,'جارٍ الحفظ'); try{ await Store.setPassword(a); location.replace(location.pathname+location.search+'#admin'); route(); }catch(x){ setBusy(btn,false); er.textContent=x.message; } };
}
export function viewLogin(mode, note){
  const cloud = Store.mode==='cloud', join = cloud && mode==='join';
  $('#app').innerHTML = `<div class="wrap"><div class="login card rv">
    <div class="checkin" style="max-width:none"><div class="head"><img src="${LOGO}" alt=""><h2>${join?'تفعيل حساب مسؤول مدعوّ':'دخول مدير النظام'}</h2><div class="hint">${join?'لمن وصله رابط دعوة من مدير النظام':'الدفعات والحضور والتحليلات وإدارة البرامج'}</div></div></div>
    <form id="lf" class="grid pad" novalidate>
      ${join?`<p class="hint" style="margin:0">اكتب البريد الذي دعاك به مدير النظام، واختر كلمة مرور من 8 أحرف على الأقل. تصلك رسالة تأكيد على بريدك؛ افتح الرابط فيها ثم ادخل من صفحة الدخول. البريد غير المدعوّ لا يحصل على أي صلاحية.</p>`:''}
      ${cloud?`<div class="field"><label for="lf-u">البريد الإلكتروني</label><input class="inp" id="lf-u" name="u" type="email" dir="ltr" autocomplete="username" required></div>`:''}
      <div class="field"><label for="lf-p">${cloud?(join?'كلمة مرور جديدة':'كلمة المرور'):'رمز الدخول'}</label><input class="inp" id="lf-p" name="p" type="password" ${cloud?`autocomplete="${join?'new-password':'current-password'}"`:'inputmode="numeric"'} required></div>
      <div class="errtxt" id="lErr" role="alert">${note?esc(note):''}</div>
      <button class="btn pri" id="lfGo">${ic('lock')} ${join?'تفعيل الحساب':'دخول'}</button>
      ${join?`<a class="btn" href="#admin">العودة إلى الدخول</a>`:''}
      ${cloud&&!join?`<button type="button" class="linkbtn" id="lfForgot" style="justify-self:center;min-height:44px">نسيت كلمة المرور؟</button>`:''}
      ${cloud?'':`<div class="alert t-gold"><span class="aic">${ic('alert')}</span><span>البيانات تجريبية. رمز الدخول الافتراضي <b>1234</b>، وتغيّره من الإعدادات.</span></div>`}
    </form></div></div>`;
  $('#lf').onsubmit = async e=>{ e.preventDefault(); const F=Object.fromEntries(new FormData(e.target)), b=$('#lfGo'); $('#lErr').textContent='';
    if(join){ const u=String(F.u||'').trim().toLowerCase();
      if(!/^\S+@\S+\.\S+$/.test(u) || String(F.p||'').length<8){ $('#lErr').textContent='اكتب بريدك وكلمة مرور من 8 أحرف على الأقل'; return; }
      setBusy(b,true,'جارٍ التفعيل'); try{ const r=await Store.adminSignup(u, F.p); setBusy(b,false); if(r.confirm){ $('#lErr').textContent='أُرسلت رسالة تأكيد إلى بريدك. افتح الرابط فيها ثم ادخل من صفحة الدخول ببريدك وكلمة مرورك.'; return; } location.replace('#admin'); route(); }catch(x){ setBusy(b,false); $('#lErr').textContent=x.message; } return; }
    setBusy(b,true,'جارٍ الدخول'); try{ await Store.login(F.u, F.p); route(); }catch(x){ setBusy(b,false); $('#lErr').textContent=x.message; } };
  if($('#lfForgot')) $('#lfForgot').onclick=async()=>{ const u=$('#lf-u').value.trim(), er=$('#lErr');
    if(!/^\S+@\S+\.\S+$/.test(u)){ er.textContent='اكتب بريدك الإلكتروني في الخانة أعلاه ثم اضغط «نسيت كلمة المرور؟»'; $('#lf-u').focus(); return; }
    const b=$('#lfForgot'); setBusy(b,true,'جارٍ الإرسال');
    try{ await Store.requestPasswordReset(u); er.textContent='إن كان هذا البريد لحساب مسؤول فسيصله رابط لاختيار كلمة مرور جديدة. إن لم يصل خلال دقائق فاطلب من المالك «كلمة مرور مؤقتة».'; }catch(x){ er.textContent=x.message; } setBusy(b,false); };
}
