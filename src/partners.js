import { CENTER } from './catalog.js';
import { Store } from './data2.js';
import { setBusy, showErrorSummary, wireFormA11y } from './features.js';
import { LOGOS } from './logos.js';
import { $, $$, esc, fmtNum, uid } from './utils.js';
import { AD, reloadAD } from './views2_admin.js';
import { emptyBox, ic, reduceMotion, toast } from './views2_head.js';
import { titleBar } from './views2_main.js';
import { closeModal, confirmBox, modal, swRow } from './views2_programs.js';

/* =====================================================================
   النبذة التعريفية + شركاء النجاح (شريط منزلق قابل للسحب، وتكبير الشريك)
   ===================================================================== */
export const PARTNER_TYPES = ['جهة اعتماد','شريك نجاح','جهة حكومية','جهة تعليمية','قطاع خاص','جهة مجتمعية'];
export const DEFAULT_ABOUT = `مركز سما القدرات للتدريب مركز تدريب في منطقة جازان، يقدّم ${'٧٣'} برنامجًا تدريبيًا معتمدًا من المؤسسة العامة للتدريب التقني والمهني في ستة مجالات: الإدارة والأعمال، والتربية والمجتمع، والحاسب والتقنية، والفنون والمهارات، والتهيئة لاختبارات قياس، والشريعة والقانون.\nيعمل المركز على أن يكون بيت الخبرة الأول في المنطقة، بتدريب بنّاء يقدّمه مدربون متخصصون، وبمتابعة منتظمة لحضور كل متدرب من التسجيل في دفعته حتى إتمام برنامجه وحصوله على شهادته.`;
import { SITE_PARTNERS, defaultPartners as basePartners } from './site_partners.js';
export { SITE_PARTNERS };
/* شعارات الشركاء من ملفات المنصة نفسها (src/assets/partners/) حتى لا تعتمد على موقع خارجي */
const PARTNER_FILES = import.meta.glob('./assets/partners/*', { eager:true, query:'?url', import:'default' });
export const defaultPartners = () => basePartners(Object.fromEntries(Object.entries(PARTNER_FILES).map(([k, v]) => [k.split('/').pop(), v])));

/* ---------- أقسام الصفحة الرئيسية ---------- */
export function aboutSectionHtml(about, P){
  const paras = String(about||DEFAULT_ABOUT).split(/\n+/).filter(Boolean);
  const cats = new Set(P.map(p=>p.category)).size;
  return `<section class="intro">
    <div class="intro-grid">
      <div class="intro-text" data-reveal><span class="kicker">نبذة تعريفية</span><h2>${CENTER.name}</h2>${paras.map(p=>`<p>${esc(p)}</p>`).join('')}
        <div class="intro-cta"><a class="btn pri" href="#home" data-go-crs="now">${ic('check')} دورات متاحة حاليا</a><a class="btn" href="#home" data-go-crs="soon">${ic('clock')} دورات متاحة قريبا</a></div></div>
      <ul class="intro-facts">
        <li data-reveal style="--i:1"><span class="kic-lg t-info">${ic('pin')}</span><div><span>الموقع</span><b>جازان · حي الصفا</b></div></li>
        <li data-reveal style="--i:2"><span class="kic-lg t-success">${ic('book')}</span><div><span>برامج معتمدة</span><b data-count="${P.length}">0</b></div></li>
        <li data-reveal style="--i:3"><span class="kic-lg t-gold">${ic('grid')}</span><div><span>مجالات تدريبية</span><b data-count="${cats}">0</b></div></li>
        <li data-reveal style="--i:4"><span class="kic-lg t-early">${ic('award')}</span><div><span>جهة الاعتماد</span><b style="font-size:15px;line-height:1.5">${CENTER.accreditor}</b></div></li>
      </ul>
    </div></section>`;
}
export function partnersSectionHtml(list){
  const ps = (list||[]).filter(p=>p.active!==false).sort((a,b)=>(a.order||0)-(b.order||0));
  if(!ps.length) return '';
  return `<section class="partners" aria-labelledby="ptTitle">
    <div class="sec-head" data-reveal><span class="kicker">شركاء النجاح</span><h2 id="ptTitle">نفخر بثقة <em>شركائنا</em></h2><p class="hint" style="margin:8px 0 0">نفتخر بشراكاتنا مع العديد من الجهات والمؤسسات التي تشاركنا رؤية التطوير والتميز، ونسعى دائمًا لبناء علاقات استراتيجية تحقق النجاح المستدام للجميع.</p></div>
    <div class="pt-wrap" data-reveal>
      <button class="pt-nav prev" aria-label="الشريك السابق">${ic('prev')}</button>
      <div class="pt-viewport" id="ptView" role="region" aria-roledescription="شريط منزلق" aria-label="شركاء النجاح" tabindex="0"><div class="pt-track" id="ptTrack"></div></div>
      <button class="pt-nav next" aria-label="الشريك التالي">${ic('next')}</button>
    </div></section>`;
}
export const partnerCard = (p, clone) => `<button class="pt-card" data-pid="${p.id}" ${clone?'aria-hidden="true" tabindex="-1"':''} aria-label="${esc(p.name)}${p.type?'، '+esc(p.type):''}"><span class="pt-logo"><img src="${p.logo||LOGOS.sama}" alt="" draggable="false" loading="eager" referrerpolicy="no-referrer"></span>${p.name==='شريك نجاح'?'':`<b>${esc(p.name)}</b>`}${p.type?`<span class="pill dot ${p.type==='جهة اعتماد'?'':'o'}">${esc(p.type)}</span>`:''}</button>`;

/* ---------- محرّك الشريط: انزلاق تلقائي + سحب باللمس + قصور ذاتي ---------- */
export function initPartnerMarquee(list){
  const view=$('#ptView'), track=$('#ptTrack'); if(!view||!track) return;
  const ps=list.filter(p=>p.active!==false).sort((a,b)=>(a.order||0)-(b.order||0));
  // كرّر المجموعة حتى تملأ عرض الشاشة، ثم ضاعفها للحلقة اللانهائية
  track.innerHTML = ps.map(p=>partnerCard(p,false)).join('');
  const fix = img => { if(img.dataset.fb) return; img.dataset.fb='1'; img.src=LOGOS.sama; img.closest('.pt-card')?.classList.add('no-logo'); };
  const setW = () => track.scrollWidth;
  let reps=1; while(setW() < view.clientWidth*1.2 && reps<12){ track.insertAdjacentHTML('beforeend', ps.map(p=>partnerCard(p,true)).join('')); reps++; }
  const unit = setW()+16;                                   // عرض مجموعة واحدة كاملة (مع التكرار)
  track.insertAdjacentHTML('beforeend', track.innerHTML.replace(/<button class="pt-card" data-pid="([^"]+)" (?!aria-hidden)/g,'<button class="pt-card" data-pid="$1" aria-hidden="true" tabindex="-1" '));
  $$('img',track).forEach(img=>{ img.addEventListener('error',()=>fix(img)); if(img.complete && !img.naturalWidth && img.src) fix(img); });
  const still = reduceMotion();
  let x=-1, v=0, last=performance.now(), drag=null, hover=false, raf=0, idleUntil=0;
  const speed = still ? 0 : 0.035;                       // بكسل لكل ملّي ثانية
  const wrap = () => { while(x > 0) x -= unit; while(x <= -unit) x += unit; };
  const paint = () => { track.style.transform = `translate3d(${x}px,0,0)`; };  // الانسياب نحو اليمين: يدخل الشريك من اليسار كما في القراءة العربية
  const tick = t => { if(!view.isConnected) return; const dt=Math.min(50,t-last); last=t;
    if(!drag){ if(Math.abs(v)>0.01){ x+=v*dt; v*=Math.pow(0.94,dt/16); } else if(!hover && t>idleUntil) x+=speed*dt; wrap(); paint(); }
    raf=requestAnimationFrame(tick); };
  raf=requestAnimationFrame(tick);
  // السحب
  view.addEventListener('pointerdown', e=>{ if(e.button!==0) return; drag={x0:e.clientX, xs:x, t:performance.now(), moved:0, hist:[[e.clientX,performance.now()]]}; v=0; view.setPointerCapture(e.pointerId); view.classList.add('dragging'); });
  view.addEventListener('pointermove', e=>{ if(!drag) return; const dx=e.clientX-drag.x0; drag.moved=Math.max(drag.moved,Math.abs(dx)); x=drag.xs + dx; wrap(); paint(); drag.hist.push([e.clientX,performance.now()]); if(drag.hist.length>6) drag.hist.shift(); });
  const end = e=>{ if(!drag) return; const h=drag.hist, a=h[0], b=h[h.length-1], dt=Math.max(1,b[1]-a[1]);
    v = (b[0]-a[0])/dt * (still?0:1); idleUntil=performance.now()+1800; view.classList.remove('dragging');
    const click = drag.moved<6; drag=null;
    if(click){ const card=document.elementsFromPoint(e.clientX,e.clientY).find(el=>el.classList?.contains('pt-card')); if(card) openPartner(list.find(p=>p.id===card.dataset.pid), card); } };
  view.addEventListener('pointerup', end); view.addEventListener('pointercancel', ()=>{ drag=null; view.classList.remove('dragging'); });
  view.addEventListener('mouseenter', ()=>hover=true); view.addEventListener('mouseleave', ()=>hover=false);
  view.addEventListener('focusin', ()=>hover=true); view.addEventListener('focusout', ()=>hover=false);
  // لوحة المفاتيح وأزرار التنقل
  const cardW = () => (track.querySelector('.pt-card')?.offsetWidth||220)+16;
  const nudge = dir => { v = 0; const target=x+dir*cardW(); const s=x, t0=performance.now(); idleUntil=t0+2500;
    const step=t=>{ const k=Math.min(1,(t-t0)/450), e=1-Math.pow(1-k,3); x=s+(target-s)*e; wrap(); paint(); if(k<1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  $('.pt-nav.prev').onclick=()=>nudge(-1); $('.pt-nav.next').onclick=()=>nudge(1);
  view.addEventListener('keydown', e=>{ if(e.key==='ArrowLeft'){ e.preventDefault(); nudge(1); } if(e.key==='ArrowRight'){ e.preventDefault(); nudge(-1); } });
  $$('.pt-card:not([aria-hidden])',track).forEach(c=>c.addEventListener('keydown',e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openPartner(list.find(p=>p.id===c.dataset.pid), c); } }));
  $$('.pt-card',track).forEach(c=>c.addEventListener('click',e=>{ if(e.detail===0) return; e.preventDefault(); }));  // النقر يُعالج في pointerup
}

/* ---------- تكبير الشريك من مكانه (FLIP) وعرض بياناته ---------- */
export function openPartner(p, card){
  if(!p) return;
  const root=$('#modalRoot');
  root.innerHTML = `<div class="modal-bg pt-bg" id="ptBg"><div class="modal pt-modal" role="dialog" aria-modal="true" aria-labelledby="ptName">
    <button class="pt-close" id="ptX" aria-label="إغلاق">${ic('x')}</button>
    <div class="pt-hero"><span class="pt-big" id="ptBig"><img src="${p.logo||LOGOS.sama}" alt="شعار ${esc(p.name)}"></span></div>
    <div class="pt-info">
      ${p.type?`<span class="pill dot ${p.type==='جهة اعتماد'?'':'o'}">${esc(p.type)}</span>`:''}
      <h3 id="ptName">${esc(p.name)}</h3>${p.name_en?`<div class="hint" dir="ltr" style="text-align:right">${esc(p.name_en)}</div>`:''}
      ${p.description?`<p>${esc(p.description)}</p>`:''}
      <div class="pt-meta">${p.since?`<span>${ic('calendar')}شريك منذ ${esc(p.since)}</span>`:''}${p.website?`<a href="${esc(p.website)}" target="_blank" rel="noopener" dir="ltr">${ic('next')}${esc(p.website.replace(/^https?:\/\//,'').replace(/\/$/,''))}</a>`:''}</div>
    </div></div></div>`;
  const big=$('#ptBig'), bg=$('#ptBg'), modal=$('.pt-modal');
  if(card && !reduceMotion() && big.animate){
    const a=card.querySelector('.pt-logo').getBoundingClientRect(), b=big.getBoundingClientRect();
    const dx=(a.left+a.width/2)-(b.left+b.width/2), dy=(a.top+a.height/2)-(b.top+b.height/2), s=a.width/b.width;
    big.animate([{transform:`translate(${dx}px,${dy}px) scale(${s})`},{transform:'none'}],{duration:520,easing:'cubic-bezier(0.2,0.8,0.2,1)'});
    modal.animate([{opacity:0,transform:'scale(.96)'},{opacity:1,transform:'none'}],{duration:380,easing:'cubic-bezier(0.2,0.8,0.2,1)'});
    $$('.pt-info>*',modal).forEach((el,i)=>el.animate([{opacity:0,transform:'translateY(10px)'},{opacity:1,transform:'none'}],{duration:450,delay:180+i*60,easing:'cubic-bezier(0.2,0.8,0.2,1)',fill:'backwards'}));
  }
  const close=()=>{ const done=()=>{ root.innerHTML=''; card?.focus?.(); };
    if(card && !reduceMotion() && big.animate){ const a=card.querySelector('.pt-logo').getBoundingClientRect(), b=big.getBoundingClientRect();
      const dx=(a.left+a.width/2)-(b.left+b.width/2), dy=(a.top+a.height/2)-(b.top+b.height/2), s=a.width/b.width;
      big.animate([{transform:'none'},{transform:`translate(${dx}px,${dy}px) scale(${s})`}],{duration:320,easing:'cubic-bezier(0.4,0,1,1)',fill:'forwards'});
      bg.animate([{opacity:1},{opacity:0}],{duration:320,fill:'forwards'}).onfinish=done; } else done(); };
  $('#ptX').onclick=close; bg.onclick=e=>{ if(e.target===bg) close(); };
  const esc_=e=>{ if(e.key==='Escape'){ close(); document.removeEventListener('keydown',esc_); } }; document.addEventListener('keydown',esc_);
  $('#ptX').focus();
}

/* ---------- لوحة الإدارة: النبذة والشركاء ---------- */
export async function shrinkImage(file, max=360){
  const url=URL.createObjectURL(file); const img=new Image(); img.src=url; await img.decode();
  const k=Math.min(1,max/Math.max(img.width,img.height)), c=document.createElement('canvas'); c.width=Math.round(img.width*k); c.height=Math.round(img.height*k);
  c.getContext('2d').drawImage(img,0,0,c.width,c.height); URL.revokeObjectURL(url);
  let d=c.toDataURL('image/webp',0.9); if(!d.startsWith('data:image/webp')) d=c.toDataURL('image/png'); return d;
}
export function pagePartners(){
  const m=$('#main'), list=(AD.partners||[]).slice().sort((a,b)=>(a.order||0)-(b.order||0));
  m.innerHTML = titleBar(`${ic('award')}المحتوى التعريفي`, 'النبذة التعريفية <em>وشركاء النجاح</em>', 'ما يظهر للزوار في الصفحة الرئيسية: نص التعريف بالمركز، وشريط شركاء النجاح المنزلق.', `<a class="btn sm" href="#home">${ic('expand')} معاينة الرئيسية</a>`)+
    `<div class="grid g2" style="align-items:start">
      <form class="card pad grid rv" id="abF" style="--i:1"><h3 class="ctitle">${ic('form')}النبذة التعريفية</h3>
        <div class="field"><label for="abT">نص النبذة</label><textarea class="inp" id="abT" rows="9" style="padding:12px 14px;line-height:1.9;resize:vertical">${esc(AD.settings.about||DEFAULT_ABOUT)}</textarea><span class="hint">كل سطر فارغ يبدأ فقرة جديدة. يُفضَّل فقرتان أو ثلاث.</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="abS">${ic('check')} حفظ النبذة</button><button type="button" class="btn" id="abR">${ic('refresh')} النص المقترح</button></div></form>
      <div class="card pad rv" style="--i:2"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:12px"><h3 class="ctitle">${ic('users')}شركاء النجاح <span class="pill g">${fmtNum(list.length)}</span></h3><button class="btn pri sm" id="ptAdd">${ic('plus')} شريك</button></div>
        ${list.length?`<div class="grid" style="gap:8px">${list.map((p,i)=>`<div class="pt-row ${p.active===false?'off':''}"><span class="pt-logo sm"><img src="${p.logo||LOGOS.sama}" alt=""></span>
          <div style="flex:1;min-width:0"><b style="font-weight:500">${esc(p.name)}</b><div class="hint">${esc(p.type||'')}${p.active===false?' · مخفي':''}</div></div>
          <button class="btn sm" data-up="${p.id}" ${i===0?'disabled':''} aria-label="رفع ${esc(p.name)}">${ic('prev')}</button><button class="btn sm" data-dn="${p.id}" ${i===list.length-1?'disabled':''} aria-label="خفض ${esc(p.name)}">${ic('next')}</button>
          <button class="btn sm" data-ep="${p.id}" aria-label="تعديل ${esc(p.name)}">${ic('edit')}</button><button class="btn sm danger soft" data-dp="${p.id}" aria-label="حذف ${esc(p.name)}">${ic('trash')}</button></div>`).join('')}</div>`
          : emptyBox('لا يوجد شركاء بعد','أضف أول شريك بشعاره ووصفه.')}
        <p class="hint" style="margin:10px 0 0">الترتيب هنا هو ترتيب الظهور في الشريط. الشعار يُصغَّر تلقائيًا عند الرفع.</p></div></div>`;
  $('#abR').onclick=()=>{ $('#abT').value=DEFAULT_ABOUT; };
  $('#abF').onsubmit=async e=>{ e.preventDefault(); const b=$('#abS'); setBusy(b,true,'جارٍ الحفظ'); try{ await Store.saveSettings({about:$('#abT').value.trim()}); await reloadAD(); toast('حُفظت النبذة'); }catch(x){ toast(x.message); } setBusy(b,false); };
  $('#ptAdd').onclick=()=>partnerModal();
  $$('[data-ep]').forEach(b=>b.onclick=()=>partnerModal(list.find(p=>p.id===b.dataset.ep)));
  $$('[data-dp]').forEach(b=>b.onclick=()=>confirmBox('حذف الشريك','يُحذف الشريك من شريط شركاء النجاح.', async()=>{ await Store.deletePartner(b.dataset.dp); await reloadAD(); toast('حُذف الشريك'); pagePartners(); }));
  const move=async(id,dir)=>{ const i=list.findIndex(p=>p.id===id), j=i+dir; if(j<0||j>=list.length) return; const a=list[i], c=list[j]; [a.order,c.order]=[j+1,i+1]; list.forEach((p,k)=>{ if(p!==a&&p!==c) p.order=k+1; });
    for(const p of list) await Store.savePartner(p); await reloadAD(); pagePartners(); };
  $$('[data-up]').forEach(b=>b.onclick=()=>move(b.dataset.up,-1)); $$('[data-dn]').forEach(b=>b.onclick=()=>move(b.dataset.dn,1));
}
export function partnerModal(p){
  const isNew=!p; p = p || {name:'',name_en:'',type:'شريك نجاح',logo:'',description:'',website:'',since:'',order:(AD.partners||[]).length+1,active:true};
  let logo=p.logo;
  modal(`<h3>${isNew?'شريك جديد':'تعديل الشريك'}</h3><form id="ptF" class="grid g2" novalidate>
    <div class="errsum" id="ptSum" tabindex="-1" role="alert" hidden style="grid-column:1/-1"></div>
    <div class="field" style="grid-column:1/-1"><label>الشعار <i>*</i></label><div class="pt-up"><span class="pt-logo"><img id="ptPrev" src="${logo||LOGOS.sama}" alt="" style="${logo?'':'opacity:.25'}"></span>
      <label class="btn sm" style="cursor:pointer">${ic('plus')} رفع صورة<input type="file" id="ptFile" accept="image/*" class="sr-only"></label><span class="hint">PNG أو JPG أو WebP، ويفضَّل بخلفية شفافة.</span></div><div class="errtxt"></div></div>
    <div class="field" style="grid-column:1/-1"><label>اسم الجهة <i>*</i></label><input class="inp" name="name" value="${esc(p.name)}"><div class="errtxt"></div></div>
    <div class="field"><label>الاسم بالإنجليزية</label><input class="inp" name="name_en" dir="ltr" value="${esc(p.name_en||'')}"><div class="errtxt"></div></div>
    <div class="field"><label>نوع الشراكة</label><select class="inp" name="type">${PARTNER_TYPES.map(t=>`<option ${p.type===t?'selected':''}>${t}</option>`).join('')}</select><div class="errtxt"></div></div>
    <div class="field" style="grid-column:1/-1"><label>نبذة عن الشريك</label><textarea class="inp" name="description" rows="3" style="padding:10px 14px;line-height:1.8">${esc(p.description||'')}</textarea><div class="errtxt"></div></div>
    <div class="field"><label>الموقع الإلكتروني</label><input class="inp" name="website" dir="ltr" placeholder="https://" value="${esc(p.website||'')}"><div class="errtxt"></div></div>
    <div class="field"><label>شريك منذ (سنة)</label><input class="inp" name="since" inputmode="numeric" value="${esc(p.since||'')}" placeholder="مثل ١٤٤٥هـ أو 2024"><div class="errtxt"></div></div>
    <div style="grid-column:1/-1">${swRow('active','يظهر في الشريط',p.active!==false)}</div>
    <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="ptC">إلغاء</button><button class="btn pri">${ic('check')} حفظ</button></div></form>`);
  const f=$('#ptF'); wireFormA11y(f,'pt');
  $('#ptC').onclick=closeModal;
  $('#ptFile').onchange=async e=>{ const file=e.target.files[0]; if(!file) return; if(!file.type.startsWith('image/')){ $('#ptFile-err').textContent='اختر ملف صورة.'; return; }
    try{ logo=await shrinkImage(file); $('#ptPrev').src=logo; $('#ptPrev').style.opacity=1; $('#ptFile-err').textContent=''; }catch(x){ $('#ptFile-err').textContent='تعذّرت قراءة الصورة. جرّب ملفًا آخر.'; } };
  f.onsubmit=async e=>{ e.preventDefault(); const fd=new FormData(f), errs=[];
    const o={...p, name:fd.get('name').trim(), name_en:fd.get('name_en').trim(), type:fd.get('type'), description:fd.get('description').trim(), website:fd.get('website').trim(), since:fd.get('since').trim(), active:!!fd.get('active'), logo};
    $$('.errtxt',f).forEach(x=>x.textContent=''); $$('[aria-invalid]',f).forEach(x=>x.removeAttribute('aria-invalid'));
    if(!o.name){ f.elements.name.setAttribute('aria-invalid','true'); $('#'+f.elements.name.id+'-err').textContent='اكتب اسم الجهة.'; errs.push({id:f.elements.name.id,label:'اسم الجهة',msg:'اكتب اسم الجهة.'}); }
    if(o.website && !/^https?:\/\/[^\s.]+\.[^\s]+$/.test(o.website)){ f.elements.website.setAttribute('aria-invalid','true'); $('#'+f.elements.website.id+'-err').textContent='اكتب رابطًا كاملًا يبدأ بـ https://'; errs.push({id:f.elements.website.id,label:'الموقع الإلكتروني',msg:'اكتب رابطًا كاملًا يبدأ بـ https://'}); }
    if(!o.logo){ $('#ptFile-err').textContent='ارفع شعار الجهة.'; errs.push({id:'ptFile',label:'الشعار',msg:'ارفع شعار الجهة.'}); }
    showErrorSummary($('#ptSum'), errs); if(errs.length) return;
    const sb=$('#ptF button.pri'); setBusy(sb,true,'جارٍ الحفظ');
    try{ await Store.savePartner(o); await reloadAD(); closeModal(); toast(isNew?'أُضيف الشريك':'حُفظ الشريك'); pagePartners(); }catch(x){ setBusy(sb,false); toast(x.message); } };
}
