import { LOGO } from './assets/logo.js';
import { CENTER } from './catalog.js';
import { CALC_DEFAULTS, LEVEL_TONE, LEVEL_TXT, Store, attendanceLevel, calcSet, cohortArchived, cohortState, enrollmentStats, enrollsOf, levelMessage, sessionDays, traineeAttendanceLogic } from './data2.js';
import { siteFooter } from './landing.js';
import { LOGOS } from './logos.js';
import { exportCSV, fmtGreg, printDocs } from './print.js';
import { $, $$, esc, fmtDate, fmtNum, fmtShort, riyadhNow, t12, validSaudiId } from './utils.js';
import { AD, progName, progOf, reloadAD } from './views2_admin.js';
import { countUp, emptyBox, ic, reduceMotion, ringSvg, skeleton, toast } from './views2_head.js';
import { baseUrl, cohortLabel, copyText, kpiCard, makeQR, short, titleBar } from './views2_main.js';

/* =====================================================================
   حالة الانتظار في الأزرار + إعلان قارئ الشاشة
   ===================================================================== */
export function liveSay(t){ const l=$('#live'); if(!l) return; l.textContent=''; setTimeout(()=>{ l.textContent=t; },40); }
export function setBusy(b, on, txt){
  if(!b) return;
  if(on){ if(b.getAttribute('aria-busy')==='true') return; b._html=b.innerHTML; b.disabled=true; b.setAttribute('aria-busy','true'); b.innerHTML=`<span class="spin" aria-hidden="true"></span><span>${txt||'جارٍ التنفيذ'}</span>`; liveSay(txt||'جارٍ التنفيذ'); }
  else { b.disabled=false; b.removeAttribute('aria-busy'); if(b._html!=null){ b.innerHTML=b._html; b._html=null; } }
}
/* ملخص أخطاء النموذج: أعلى النموذج، يستقبل التركيز، وكل بند يقود إلى حقله */
export function showErrorSummary(box, errs){
  if(!errs.length){ box.hidden=true; box.innerHTML=''; return; }
  box.innerHTML = `<h3 id="${box.id}-h">${errs.length===1?'يوجد خطأ واحد يحتاج تصحيحًا':`يوجد ${fmtNum(errs.length)} أخطاء تحتاج تصحيحًا`}</h3><ul>${errs.map(e=>`<li><a href="#" data-fid="${e.id}">${esc(e.label)}: ${esc(e.msg)}</a></li>`).join('')}</ul>`;
  box.hidden=false; box.setAttribute('aria-labelledby', box.id+'-h');
  $$('a[data-fid]',box).forEach(a=>a.onclick=ev=>{ ev.preventDefault(); const el=document.getElementById(a.dataset.fid); if(el){ el.focus(); el.scrollIntoView({block:'center',behavior:reduceMotion()?'auto':'smooth'}); } });
  box.focus(); box.scrollIntoView({block:'start',behavior:reduceMotion()?'auto':'smooth'});
}
/* يربط كل حقل بتسميته ورسالة خطئه (for / aria-describedby) */
export function wireFormA11y(f, prefix){
  $$('.field',f).forEach(fl=>{ const inp=$('input,select,textarea',fl), lab=$('label',fl), er=$('.errtxt',fl); if(!inp) return;
    const n=inp.name||inp.id; inp.id = inp.id || `${prefix}-${n}`; if(lab) lab.htmlFor=inp.id;
    if(er){ er.id=`${inp.id}-err`; er.setAttribute('aria-live','polite'); inp.setAttribute('aria-describedby', er.id); }
    if(lab && lab.querySelector('i')) inp.setAttribute('aria-required','true'); });
}

/* =====================================================================
   الشهادة — قالب «السجل المضيء»
   ===================================================================== */
export function certSealSvg(att, total){
  let h=`<circle cx="50" cy="50" r="46" fill="none" stroke="#1A746B" stroke-width="0.6"/><circle cx="50" cy="50" r="43.6" fill="none" stroke="#1A746B" stroke-width="0.25"/>`;
  const n=Math.max(1,total);
  for(let i=0;i<n;i++){ const a=-Math.PI/2+i*2*Math.PI/n, x=50+Math.cos(a)*37.5, y=50+Math.sin(a)*37.5, r=n>40?1.4:n>24?2.0:2.4;
    h+= att[i] ? `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" fill="#1A746B"/>` : `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(r*.88).toFixed(2)}" fill="none" stroke="#1A746B" stroke-width="0.45"/>`; }
  for(let i=0;i<60;i++){ const a=i*2*Math.PI/60, r1=26, r2=i%5===0?31.5:29.2; h+=`<line x1="${(50+Math.cos(a)*r1).toFixed(2)}" y1="${(50+Math.sin(a)*r1).toFixed(2)}" x2="${(50+Math.cos(a)*r2).toFixed(2)}" y2="${(50+Math.sin(a)*r2).toFixed(2)}" stroke="#C9A24A" stroke-width="${i%5===0?0.55:0.3}"/>`; }
  const k=att.filter(Boolean).length;
  return h+`<circle cx="50" cy="50" r="20.5" fill="#FBF6E8"/><circle cx="50" cy="50" r="20.5" fill="none" stroke="#C9A24A" stroke-width="0.4"/><text x="50" y="49" text-anchor="middle" font-family="Readex Pro" font-weight="500" font-size="11" fill="#14524c">${fmtNum(Math.round(k/n*100))}٪</text><text x="50" y="58.5" text-anchor="middle" font-family="Readex Pro" font-weight="300" font-size="4.1" fill="#7a8d8f">${fmtNum(k)} من ${fmtNum(n)} يومًا</text>`;
}
export function certFieldSvg(){
  let g=''; const W=279,H=192,cx=W/2,cy=H/2+4,step=3.6;
  for(let y=8;y<=H-8;y+=step) for(let x=8;x<=W-8;x+=step){ const dx=(x-cx)/(W*.5), dy=(y-cy)/(H*.5), d=Math.sqrt(dx*dx*.9+dy*dy*1.25); if(d<.86) continue; const k=Math.min(1,(d-.86)/.5);
    g+=`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(.18+.32*k).toFixed(2)}" fill="#59A598" opacity="${(.16+.3*k).toFixed(2)}"/>`; }
  for(let i=0;i<21;i++){ const a=Math.PI*(1.08+.84*i/20), r1=84, r2=r1+(i%2===0?7:3.6); g+=`<line x1="${(cx+Math.cos(a)*r1).toFixed(1)}" y1="${(cy+22+Math.sin(a)*r1*.58).toFixed(1)}" x2="${(cx+Math.cos(a)*r2).toFixed(1)}" y2="${(cy+22+Math.sin(a)*r2*.58).toFixed(1)}" stroke="#C9A24A" stroke-width=".2" opacity=".5"/>`; }
  const star=(t,s,c)=>`<path transform="translate(${t}) scale(${s})" d="M50 0C54 34 66 46 100 50 66 54 54 66 50 100 46 66 34 54 0 50 34 46 46 34 50 0z" fill="${c}"/>`;
  return g+star('22 22',.13,'#8FCBBE')+star('250 15',.07,'#C9A24A');
}
export function certificateHtml(cert){
  const t=AD.trainees.find(x=>x.id===cert.trainee_id), p=progOf(cert.program_id), c=AD.cohorts.find(x=>x.id===cert.cohort_id), e=AD.enrollments.find(x=>x.id===cert.enrollment_id);
  const days=sessionDays(c).filter(d=>d>=e.created_at.slice(0,10)), att=days.map(d=>AD.attendance.some(a=>a.enrollment_id===e.id&&a.att_date===d));
  const fem=t.gender==='أنثى', ord=['','الأولى','الثانية','الثالثة','الرابعة','الخامسة','السادسة','السابعة','الثامنة','التاسعة','العاشرة'][c.number]||fmtNum(c.number);
  return `<div class="pdoc land cert"><div class="cz-frame"><div class="cz-card">
    <svg class="cz-field" viewBox="0 0 279 192" preserveAspectRatio="none" aria-hidden="true">${certFieldSvg()}</svg><div class="cz-hair"></div><div class="cz-hair2"></div>
    <div class="cz-logos"><span><img src="${LOGOS.tvtc}" alt=""></span><span><img src="${LOGOS.nelc}" alt=""></span><span class="m"><img src="${LOGOS.sama}" alt=""></span></div>
    <div class="cz-body">
      <div class="cz-kick">برنامج تدريبي معتمد${p.accreditation_no?` · رقم الاعتماد ${esc(p.accreditation_no)}`:''}</div>
      <div class="cz-title">إفادة حضور</div><div class="cz-note" style="font-size:11px;opacity:.8;margin-top:2px">إفادة صادرة من المركز · الشهادة المعتمدة تصدر عبر منصة منار mnar.sa</div>
      <div class="cz-lead">يشهد ${CENTER.name} بأن ${fem?'المتدربة':'المتدرب'}</div>
      <div class="cz-name">${esc(t.full_name)}</div><div class="cz-gold"></div>
      <div class="cz-lead2">${fem?'أتمّت':'أتمّ'} بنجاح متطلبات البرنامج التدريبي</div>
      <div class="cz-prog">${esc(p.name)}</div>
      <div class="cz-facts"><div><span>الساعات التدريبية</span><b>${p.hours==null?'—':fmtNum(p.hours)+' ساعة'}</b></div><div><span>الدفعة</span><b>${ord}</b></div><div><span>مدة البرنامج</span><b>${fmtShort(c.start_date)} – ${fmtGreg(c.end_date)}</b></div><div><span>نسبة الحضور</span><b>${fmtNum(cert.rate)}٪</b></div></div>
    </div>
    <div class="cz-foot">
      <div class="cz-seal"><svg viewBox="0 0 100 100">${certSealSvg(att, days.length)}</svg></div>
      <div class="cz-sign"><i></i><span>مدير المركز</span><small>التوقيع والختم</small></div>
      <div class="cz-qr"><div><small>رقم الإفادة</small><b>${esc(cert.serial)}</b><small>صدرت ${fmtGreg(cert.issued_at.slice(0,10))}</small></div></div>
    </div>
    <div class="cz-note">${CENTER.name} · ${CENTER.address} · ${CENTER.phones.join(' · ')}</div>
  </div></div></div>`;
}
export function printCertificates(certs, title){
  if(!certs.length) return toast('لا توجد إفادات صادرة للطباعة');
  printDocs(certs.map(certificateHtml), title);
  $$('#printRoot [data-qr]').forEach(el=>makeQR(el, el.dataset.qr, 240));
}

/* =====================================================================
   صفحة التحقق من إفادة الحضور (عامة)
   ===================================================================== */
export async function viewVerify(serial){
  const app=$('#app'); app.innerHTML=`<div class="wrap">${skeleton()}</div>`;
  let r=null; if(serial){ try{ r=await Store.verifyCertificate(serial); }catch(e){ r={error:e.message}; } }
  const ok = r && !r.error && !r.revoked;
  app.innerHTML = `<div class="wrap"><div class="card verify rv">
      <div class="checkin"><div class="head" style="padding-bottom:26px"><img src="${LOGO}" alt="شعار مركز سما القدرات"><h2>التحقق من إفادة حضور</h2><p class="hint" style="margin:6px 0 0">إفادة الحضور يصدرها المركز. الشهادة المعتمدة تصدر عبر <a href="https://mnar.sa" target="_blank" rel="noopener" style="color:var(--brand)">منصة منار</a>.</p><div class="hint">إفادات حضور البرامج المعتمدة في ${CENTER.name}</div></div></div>
      <div class="pad">
        ${serial ? (ok ? `<div style="text-align:center" class="rv"><div class="bigcheck">${ic('check')}</div><h2 style="font-size:22px;font-weight:700">إفادة حضور صحيحة وصادرة من المركز</h2></div>
            <div class="result-card rv" style="--i:2">
              <div class="r"><span>${ic('id')}الرقم التسلسلي</span><b dir="ltr">${esc(r.serial)}</b></div>
              <div class="r"><span>${ic('user')}${r.gender==='أنثى'?'المتدربة':'المتدرب'}</span><b>${esc(r.name_masked)}</b></div>
              <div class="r"><span>${ic('book')}البرنامج</span><b>${esc(r.program)}</b></div>
              ${r.accreditation_no?`<div class="r"><span>${ic('award')}رقم الاعتماد</span><b>${esc(r.accreditation_no)}</b></div>`:''}
              <div class="r"><span>${ic('users')}الدفعة</span><b>${cohortLabel(r)}</b></div>
              <div class="r"><span>${ic('calendar')}مدة البرنامج</span><b>${fmtShort(r.start_date)} – ${fmtGreg(r.end_date)}</b></div>
              ${r.hours!=null?`<div class="r"><span>${ic('hourglass')}الساعات التدريبية</span><b>${fmtNum(r.hours)} ساعة</b></div>`:''}
              <div class="r"><span>${ic('activity')}نسبة الحضور</span><b>${fmtNum(r.rate)}٪</b></div>
              <div class="r"><span>${ic('form')}تاريخ الإصدار</span><b>${fmtGreg(String(r.issued_at).slice(0,10))}</b></div>
            </div><p class="hint" style="text-align:center;margin-top:12px">يظهر الاسم مختصرًا حفاظًا على خصوصية المتدرب. طابِقه مع الاسم المكتوب في الشهادة.</p>`
          : `<div style="text-align:center" class="rv"><div class="bigcheck bad">${ic('x')}</div><h2 style="font-size:21px;font-weight:700">${r&&r.revoked?'هذه الإفادة ملغاة':'لم نعثر على إفادة بهذا الرقم'}</h2>
             <p class="hint">${r&&r.revoked?'ألغى المركز هذه الإفادة ولم تعد معتمدة. للاستفسار تواصل مع المركز.':'تأكد من الرقم التسلسلي المكتوب على الإفادة وأعد المحاولة، أو تواصل مع المركز.'}</p></div>`) : ''}
        <form id="vf" class="grid" style="margin-top:${serial?'18px':'0'}" novalidate><div class="field"><label for="vs">الرقم التسلسلي للإفادة</label><input class="inp num" id="vs" dir="ltr" placeholder="SQ-25157-2-014" value="${esc(serial||'')}" autocomplete="off"></div>
          <button class="btn pri">${ic('search')} تحقّق</button></form>
      </div></div></div>${siteFooter()}`;
  $('#vf').onsubmit=e=>{ e.preventDefault(); const v=$('#vs').value.trim().toUpperCase().replace(/[^A-Z0-9-]/g,''); if(!v) return; location.hash='#v-'+v; };
}

/* =====================================================================
   صفحة «حضوري» للمتدرب
   ===================================================================== */
export const toLatin = v => String(v||'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
export async function viewMe(){
  const app=$('#app');
  app.innerHTML = `<div class="wrap"><div class="card checkin rv" style="max-width:560px;margin:0 auto" id="meCard">
      <div class="head" style="padding-bottom:24px"><img src="${LOGO}" alt="شعار مركز سما القدرات"><h2>حضوري</h2><div class="hint">نسبة حضورك في برامجك، وتنبيهات الغياب</div></div>
      <form id="mf" class="pad grid" novalidate>
        <div class="errsum" id="mfSum" tabindex="-1" role="alert" hidden></div>
        <div class="field"><label>رقم السجل المدني أو الإقامة <i>*</i></label><input class="inp num" name="nid" inputmode="numeric" pattern="[0-9]*" maxlength="10" dir="ltr" placeholder="1XXXXXXXXX" autocomplete="off"><div class="errtxt"></div></div>
        <button class="btn pri lg" id="mGo">${ic('search')} عرض نسبة حضوري</button>
      </form><div id="mRes"></div></div></div>${siteFooter()}`;
  const f=$('#mf'); wireFormA11y(f,'me');
  $$('input',f).forEach(i=>i.addEventListener('input',()=>{ i.value=toLatin(i.value).replace(/\D/g,''); i.classList.remove('err'); i.removeAttribute('aria-invalid'); }));
  f.onsubmit=async e=>{ e.preventDefault(); const nid=f.nid.value.trim(), errs=[];
    $$('.errtxt',f).forEach(x=>x.textContent='');
    if(!validSaudiId(nid)){ const el=f.nid, msg='الرقم غير صحيح. يتكون من 10 أرقام ويبدأ بـ 1 أو 2.'; el.classList.add('err'); el.setAttribute('aria-invalid','true'); $('#'+el.id+'-err').textContent=msg; errs.push({id:el.id,label:'رقم السجل المدني',msg}); }
    showErrorSummary($('#mfSum'), errs); if(errs.length) return;
    const b=$('#mGo'); setBusy(b,true,'جارٍ البحث');
    let r; try{ r=await Store.myAttendance(nid); }catch(x){ r={ok:false,reason:'error',msg:x.message}; }
    setBusy(b,false); renderMe(r);
  };
}
export function renderMe(r){
  const box=$('#mRes');
  if(!r.ok){ box.innerHTML=`<div class="pad" style="padding-top:0">${emptyBox(r.reason==='error'?'تعذّر الاتصال':'لم نعثر على تسجيل بهذا الرقم', r.reason==='error'?esc(r.msg||''):'تأكد من رقم السجل المدني الذي سجّلت به في البرنامج.')}</div>`; liveSay('لم نعثر على تسجيل بهذا الرقم'); return; }
  box.innerHTML = `<div class="pad" style="padding-top:0"><h3 class="ctitle" style="margin-bottom:12px">${ic('user')}أهلًا ${esc(r.first_name)}</h3>
    ${r.items.length ? r.items.map((x,i)=>{ const tone=LEVEL_TONE[x.level]||'info', alert=['low','consec','last','lost'].includes(x.level);
      return `<div class="mecard rv lv-${tone}" style="--i:${i}"><div class="me-top">${ringSvg(x.rate??0,72,7,tone==='bad'?'danger':tone==='warn'?'warning':'success')}
        <div style="flex:1;min-width:0"><b class="me-p">${esc(x.program)}</b><div class="hint">${cohortLabel(x)}${x.start_date?` · ${fmtShort(x.start_date)} – ${fmtShort(x.end_date)}`:' · لم يبدأ بعد'}</div>
          <div class="me-rate">${x.rate==null?'—':fmtNum(x.rate)+'٪'}<span>نسبة الحضور</span></div></div></div>
        <div class="me-alert ${tone}" ${alert?'role="alert"':''}>${ic(alert?'alert':tone==='ok'?'check':'clock')}<p>${esc(x.message)}</p></div>
      </div>`; }).join('') : emptyBox('لا توجد تسجيلات','سجّل في برنامج من دليل البرامج.')}
    <button class="btn" style="width:100%;margin-top:6px" id="meAgain">${ic('prev')} بحث آخر</button></div>`;
  $('#mf').classList.add('hidden'); liveSay(`وُجد ${r.items.length} تسجيل`); box.querySelector('h3')?.setAttribute('tabindex','-1'); box.querySelector('h3')?.focus();
  $('#meAgain').onclick=()=>{ $('#mf').classList.remove('hidden'); box.innerHTML=''; $('#mf').reset(); $('#mf [name=nid]').focus(); };
}

/* =====================================================================
   لوحة الإدارة: آلية احتساب الحضور ورسائل التنبيه + سجل حضور متدرب
   ===================================================================== */
export const MSG_FIELDS = [['msg_ok','منتظم','ok'],['msg_low','نسبة دون الحد','warn'],['msg_consec','غياب متتالٍ','warn'],['msg_last','لا مجال لغياب آخر','bad'],['msg_lost','لا يمكن بلوغ الحد','bad'],['msg_upcoming','دفعة لم تبدأ','info'],['msg_done','أتمّ البرنامج','ok'],['msg_below','انتهت دون الحد','g']];
export const PLACEHOLDERS = ['الاسم','البرنامج','النسبة','الحد','الغياب','المتتالي','المطلوب','المتبقي','البداية'];
export function pageRules(){
  const m=$('#main'), C=calcSet(AD.settings);
  m.innerHTML = titleBar(`${ic('settings')}آلية الاحتساب`, 'احتساب الحضور <em>ورسائل التنبيه</em>', 'تحدد هنا كيف تُحسب نسبة الحضور ومتى يُنبَّه المتدرب. لا يرى المتدرب في صفحة «حضوري» إلا نسبته ورسالة التنبيه الخاصة بحالته.', '')+
  `<div class="grid g2" style="align-items:start">
   <form class="card pad grid rv" id="rlF" style="--i:1" novalidate><h3 class="ctitle">${ic('pie')}قواعد الاحتساب</h3>
    <div class="field"><label for="rl-thr">حد الحضور لاستحقاق الشهادة (٪)</label><input class="inp num" id="rl-thr" name="cert_threshold" type="number" min="1" max="100" value="${C.cert_threshold}"><span class="hint">تُصدر الشهادة عند أرشفة الدفعة لمن بلغ هذه النسبة.</span></div>
    <div class="field"><label for="rl-lw">احتساب الحضور المتأخر</label><select class="inp" id="rl-lw" name="late_weight">${[[1,'حضور كامل'],[0.75,'ثلاثة أرباع حضور'],[0.5,'نصف حضور'],[0,'لا يُحتسب حضورًا']].map(([v,l])=>`<option value="${v}" ${+C.late_weight===v?'selected':''}>${l}</option>`).join('')}</select><span class="hint">المتأخر من سجّل بعد مهلة التأخر (${fmtNum(AD.settings.late_minutes)} دقيقة)، وتُضبط المهلة في الإعدادات.</span></div>
    <div class="field"><label for="rl-wc">تنبيه الغياب المتتالي بعد</label><select class="inp" id="rl-wc" name="warn_consec">${[1,2,3,4,5].map(v=>`<option value="${v}" ${+C.warn_consec===v?'selected':''}>${fmtNum(v)} ${v===1?'محاضرة':'محاضرات'}</option>`).join('')}</select></div>
    <div class="rule-box"><b>طريقة الحساب</b><span>نسبة الحضور = (أيام الحضور + أيام التأخر × وزن التأخر) ÷ المحاضرات المنعقدة منذ تسجيل المتدرب.</span><span>ترتيب الحالات: لا يمكن بلوغ الحد ← لا مجال لغياب آخر ← غياب متتالٍ ← نسبة دون الحد ← منتظم.</span></div>
    <h3 class="ctitle" style="margin-top:8px">${ic('alert')}رسائل التنبيه للمتدرب</h3>
    <p class="hint" style="margin:-6px 0 0">اضغط على متغير لإدراجه في الرسالة المحددة: ${PLACEHOLDERS.map(k=>`<button type="button" class="chip-v" data-ph="${k}">{${k}}</button>`).join(' ')}</p>
    ${MSG_FIELDS.map(([k,l,t])=>`<div class="field"><label for="rl-${k}"><span class="pill dot ${t}" style="margin-inline-end:6px">${l}</span></label><textarea class="inp" id="rl-${k}" name="${k}" rows="2" style="padding:10px 14px;line-height:1.8;resize:vertical">${esc(C[k])}</textarea></div>`).join('')}
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri" id="rlS">${ic('check')} حفظ الآلية</button><button type="button" class="btn" id="rlD">${ic('refresh')} القيم الافتراضية</button></div>
   </form>
   <div class="grid" style="gap:16px">
    <div class="card pad rv" style="--i:2"><h3 class="ctitle">${ic('id')}سجل حضور متدرب</h3><p class="hint" style="margin:0 0 10px">التفاصيل الكاملة للإدارة: الحضور والغياب والتأخر والمتبقي والمحاضرة القادمة والشهادة.</p>
      <form id="rlQ" style="display:flex;gap:8px" novalidate><input class="inp num" id="rlN" inputmode="numeric" maxlength="10" dir="ltr" placeholder="رقم السجل المدني" aria-label="رقم السجل المدني" style="flex:1"><button class="btn pri">${ic('search')} عرض</button></form>
      <div id="rlR" style="margin-top:12px"></div></div>
    <div class="card pad rv" style="--i:3"><h3 class="ctitle">${ic('tv')}معاينة ما يراه المتدرب</h3><div id="rlP"></div></div>
   </div></div>`;
  const f=$('#rlF'); let lastTA=$('#rl-msg_low');
  $$('textarea',f).forEach(t=>{ t.addEventListener('focus',()=>lastTA=t); t.addEventListener('input',preview); });
  $$('[data-ph]',f).forEach(b=>b.onclick=()=>{ const t=lastTA, v=`{${b.dataset.ph}}`, a=t.selectionStart??t.value.length; t.value=t.value.slice(0,a)+v+t.value.slice(t.selectionEnd??a); t.focus(); t.selectionStart=t.selectionEnd=a+v.length; preview(); });
  $$('select,input',f).forEach(x=>x.addEventListener('input',preview));
  function read(){ const fd=new FormData(f), o={ cert_threshold:Math.min(100,Math.max(1,+fd.get('cert_threshold')||75)), late_weight:+fd.get('late_weight'), warn_consec:+fd.get('warn_consec') }; MSG_FIELDS.forEach(([k])=>o[k]=fd.get(k).trim()||CALC_DEFAULTS[k]); return o; }
  function preview(){ const st=read(), sample={rate:62,finalRate:62,consec:2,needed:3,remaining:4,absent:3,held:8};
    $('#rlP').innerHTML = ['ok','consec','last'].map(lv=>{ const tone=LEVEL_TONE[lv], rate=lv==='ok'?88:62;
      return `<div class="mecard lv-${tone}" style="margin-bottom:10px"><div class="me-top">${ringSvg(rate,56,6,tone==='bad'?'danger':tone==='warn'?'warning':'success')}<div><b class="me-p">برنامج تجريبي</b><div class="me-rate">${fmtNum(rate)}٪<span>نسبة الحضور</span></div></div></div>
        <div class="me-alert ${tone}">${ic(tone==='ok'?'check':'alert')}<p>${esc(levelMessage(lv,{...sample,rate},st,{'الاسم':'محمد','البرنامج':'برنامج تجريبي','البداية':fmtDate(riyadhNow().date)}))}</p></div></div>`; }).join(''); }
  preview();
  $('#rlD').onclick=()=>{ for(const k in CALC_DEFAULTS){ const el=f.elements[k]; if(el) el.value=CALC_DEFAULTS[k]; } preview(); };
  f.onsubmit=async e=>{ e.preventDefault(); const b=$('#rlS'); setBusy(b,true,'جارٍ الحفظ'); try{ await Store.saveSettings(read()); await reloadAD(); toast('حُفظت آلية الاحتساب'); }catch(x){ toast(x.message); } setBusy(b,false); };
  $('#rlN').addEventListener('input',e=>e.target.value=toLatin(e.target.value).replace(/\D/g,''));
  $('#rlQ').onsubmit=e=>{ e.preventDefault(); const nid=$('#rlN').value; const box=$('#rlR');
    if(!validSaudiId(nid)){ box.innerHTML=`<div class="errtxt">الرقم غير صحيح. يتكون من 10 أرقام ويبدأ بـ 1 أو 2.</div>`; return; }
    const r=traineeAttendanceLogic(AD,nid); box.innerHTML = r.ok ? traineeDetailHtml(r) : emptyBox('لا يوجد متدرب بهذا الرقم','تأكد من الرقم أو ابحث في صفحة المتدربين.'); };
}
export function traineeDetailHtml(r){
  const thr=r.threshold;
  return `<div style="margin-bottom:10px"><b>${esc(r.trainee.full_name)}</b><div class="hint" dir="ltr" style="text-align:right">${esc(r.trainee.phone||'')}</div></div>`+
   (r.items.length ? r.items.map(x=>{ const tone=LEVEL_TONE[x.level], rr=x.state==='archived'?x.finalRate:(x.rate??0);
    return `<div class="mecard lv-${tone}"><div class="me-top">${ringSvg(x.state==='upcoming'?0:rr,64,6,tone==='bad'?'danger':tone==='warn'?'warning':'success')}
      <div style="flex:1;min-width:0"><b class="me-p">${esc(x.program)}</b><div class="hint">${cohortLabel(x)}${x.start_date?` · ${fmtShort(x.start_date)} – ${fmtShort(x.end_date)}`:' · لم يبدأ بعد'}</div><span class="pill dot ${tone}" style="margin-top:6px">${LEVEL_TXT[x.level]}</span></div></div>
      ${x.state!=='upcoming'?`<div class="me-grid"><div><b>${fmtNum(x.attended)}</b><span>حضور</span></div><div><b>${fmtNum(x.absent)}</b><span>غياب</span></div><div><b>${fmtNum(x.late)}</b><span>تأخر</span></div><div><b>${fmtNum(x.remaining)}</b><span>متبقية</span></div></div>
        <div class="me-bar" role="img" aria-label="الحضور ${fmtNum(x.attended)} من ${fmtNum(x.total)}، وحد الشهادة ${fmtNum(x.required)}"><i style="width:${Math.min(100,x.score/Math.max(1,x.total)*100)}%"></i><em style="inset-inline-start:${thr}%"></em></div>
        <div class="hint" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap"><span>المحتسب ${fmtNum(+x.score.toFixed(2))} من ${fmtNum(x.total)} محاضرة</span><span>حد الشهادة ${fmtNum(x.required)} (${fmtNum(thr)}٪) · يلزمه ${fmtNum(x.needed)}</span></div>`:''}
      <div class="me-alert ${tone}" style="margin-top:10px">${ic('tv')}<p><span class="hint" style="display:block">الرسالة الظاهرة للمتدرب:</span>${esc(x.message)}</p></div>
      ${x.next?`<div class="me-next">${ic('calendar')}المحاضرة القادمة: ${fmtDate(x.next)} الساعة ${t12(x.start_time)}</div>`:''}
      ${x.cert?`<p class="hint" style="margin-top:8px">${ic('award')} إفادة الحضور <b dir="ltr">${esc(x.cert)}</b></p>`:''}</div>`; }).join('') : emptyBox('لا توجد تسجيلات',''));
}

/* =====================================================================
   قائمة المتابعة (المدير): المتدربون الأقرب إلى فقدان الشهادة
   ===================================================================== */
export const waLink = (phone, text) => { const p=String(phone||'').replace(/\D/g,''); const intl = p.startsWith('05') ? '966'+p.slice(1) : p.startsWith('5') ? '966'+p : p; return `https://wa.me/${intl}?text=${encodeURIComponent(text)}`; };
export function followupRows(){
  const today=riyadhNow().date, thr=AD.settings.cert_threshold ?? 75;
  return AD.cohorts.filter(c=>!cohortArchived(c,today) && c.start_date<=today).flatMap(c=>enrollsOf(AD,c.id).map(e=>{ const s=enrollmentStats(AD,e,c), t=AD.trainees.find(x=>x.id===e.trainee_id); if(!t||!s.held) return null;
    const lv=attendanceLevel(s,'running',AD.settings); if(!['low','consec','last','lost'].includes(lv)) return null;
    const level=LEVEL_TONE[lv], C=calcSet(AD.settings);
    const why = lv==='lost'?`لا يمكن بلوغ الحد: يحتاج ${fmtNum(s.needed)} ولم يتبقَّ ${fmtNum(s.remaining)}` : lv==='last'?`لا مجال لغياب آخر: يحتاج ${fmtNum(s.needed)} من ${fmtNum(s.remaining)}` : lv==='consec'?`غاب ${fmtNum(s.consec)} محاضرات متتالية` : `نسبته ${fmtNum(s.rate)}٪ دون ${fmtNum(C.cert_threshold)}٪`;
    const msg = levelMessage(lv,s,AD.settings,{'الاسم':t.full_name.split(' ')[0],'البرنامج':progName(c.program_id),'البداية':fmtDate(c.start_date)});
    return {c,e,t,s,level,why,msg}; }).filter(Boolean)).sort((a,b)=>(a.level==='bad'?0:1)-(b.level==='bad'?0:1)||(a.s.rate??0)-(b.s.rate??0));
}
export let fuP='all', fuL='all';
export function pageFollowup(){
  const m=$('#main'), all=followupRows(), thr=AD.settings.cert_threshold ?? 75;
  const list=all.filter(x=>(fuP==='all'||x.c.program_id===fuP)&&(fuL==='all'||x.level===fuL));
  const progs=[...new Set(all.map(x=>x.c.program_id))];
  m.innerHTML = titleBar(`${ic('alert')}المتابعة`, `${fmtNum(all.length)} متدربًا <em>يحتاجون متابعة</em>`, `من الدفعات المنعقدة الآن، وفق «آلية الاحتساب»: من لا يستطيع بلوغ حد الشهادة (${fmtNum(thr)}٪)، ومن لا مجال له لغياب آخر، ومن تجاوز حد الغياب المتتالي أو نسبته دون الحد. رسالة واتساب هي رسالة التنبيه نفسها.`, `<button class="btn sm" id="fuX">${ic('database')} تصدير Excel</button>`)+
   `<div class="kpis" style="grid-template-columns:repeat(3,1fr)">${kpiCard(0,'x','danger','حرج',all.filter(x=>x.level==='bad').length,'','لا يبلغ الحد أو لا مجال للغياب')}${kpiCard(1,'alert','warning','تنبيه',all.filter(x=>x.level==='warn').length,'','غياب متتالٍ أو نسبة منخفضة')}${kpiCard(2,'layers','info','دفعات منعقدة',AD.cohorts.filter(c=>cohortState(c)==='running').length,'','تشملها المتابعة')}</div>
   <div class="filters rv" style="--i:1"><select class="inp" id="fuP"><option value="all">كل البرامج</option>${progs.map(id=>`<option value="${id}" ${fuP===id?'selected':''}>${esc(progName(id))}</option>`).join('')}</select>
     <div class="seg" style="margin:0">${[['all','الكل'],['bad','حرج'],['warn','تنبيه']].map(([v,l])=>`<button data-fl="${v}" class="${fuL===v?'on':''}">${l}</button>`).join('')}</div></div>
   ${list.length?`<div class="tbw rv" style="--i:2"><table class="tb"><thead><tr><th>المتدرب</th><th>البرنامج والدفعة</th><th>الحضور</th><th>غياب متتالٍ</th><th>آخر حضور</th><th>السبب</th><th>تواصل</th></tr></thead><tbody>
   ${list.map(x=>{ const msg=`السلام عليكم ${x.t.full_name.split(' ')[0]}، معك ${CENTER.name}. ${x.msg} المحاضرة القادمة الساعة ${t12(x.c.start_time)}.`;
     return `<tr><td><div class="who"><span class="avatar ${x.t.gender==='أنثى'?'f':''}">${esc(x.t.full_name[0])}</span><div><b style="font-weight:500">${esc(x.t.full_name)}</b><div class="hint num" dir="ltr" style="text-align:right">${esc(x.t.phone)}</div></div></div></td>
       <td><b style="font-weight:500">${esc(short(progName(x.c.program_id)))}</b><div class="hint">${cohortLabel(x.c)}</div></td>
       <td style="min-width:120px"><div class="bar"><i class="${x.level==='bad'?'bad':'hot'}" style="width:${x.s.rate??0}%"></i></div><span class="hint">${fmtNum(x.s.attended)} من ${fmtNum(x.s.held)} · ${fmtNum(x.s.rate??0)}٪</span></td>
       <td>${x.s.consec?`<span class="pill dot ${x.s.consec>=2?'warn':'g'}">${fmtNum(x.s.consec)}</span>`:'—'}</td><td class="num">${x.s.lastAtt?fmtShort(x.s.lastAtt):'لم يحضر'}</td>
       <td style="min-width:210px"><div><span class="pill dot ${x.level}">${x.level==='bad'?'حرج':'تنبيه'}</span></div><div class="hint" style="margin-top:4px;line-height:20px">${x.why}</div></td>
       <td style="white-space:nowrap"><a class="btn sm" href="${waLink(x.t.phone,msg)}" target="_blank" rel="noopener" aria-label="مراسلة ${esc(x.t.full_name)} عبر واتساب">${ic('activity')} واتساب</a> <button class="btn sm" data-cpm="${esc(msg)}" title="نسخ الرسالة">${ic('copy')}</button></td></tr>`; }).join('')}
   </tbody></table></div><p class="hint">زر واتساب يفتح محادثة برسالة جاهزة تراجعها قبل الإرسال. الرقم ${CENTER.phones[0]} يظهر للمتدرب إن أرسلت من جوال المركز.</p>`
   : emptyBox('لا يوجد متدربون يحتاجون متابعة الآن','كل المتدربين في الدفعات المنعقدة على المسار الصحيح.')}`;
  countUp(m);
  $('#fuP').onchange=e=>{ fuP=e.target.value; pageFollowup(); };
  $$('[data-fl]').forEach(b=>b.onclick=()=>{ fuL=b.dataset.fl; pageFollowup(); });
  $$('[data-cpm]').forEach(b=>b.onclick=()=>copyText(b.dataset.cpm,'نُسخت الرسالة'));
  $('#fuX').onclick=()=>exportCSV('قائمة-المتابعة',[['الاسم','الجوال','البرنامج','الدفعة','حضر','من','النسبة','غياب متتال','آخر حضور','المستوى','السبب'],...all.map(x=>[x.t.full_name,x.t.phone,progName(x.c.program_id),x.c.number,x.s.attended,x.s.held,(x.s.rate??0)+'%',x.s.consec,x.s.lastAtt||'',x.level==='bad'?'حرج':'تنبيه',x.why])]);
}

/* =====================================================================
   الإفادات داخل كشف الدفعة
   ===================================================================== */
export function certSectionHtml(c){
  const certs=(AD.certificates||[]).filter(x=>x.cohort_id===c.id), thr=AD.settings.cert_threshold ?? 75, arch=cohortArchived(c);
  const elig=enrollsOf(AD,c.id).filter(e=>enrollmentStats(AD,e,c).finalRate>=thr).length;
  return `<div class="card pad rv" style="--i:6;margin-top:16px"><div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap"><span class="kic-lg t-gold">${ic('award')}</span>
    <div style="flex:1;min-width:220px"><h3 class="ctitle">إفادات الحضور</h3><div class="hint">${arch?`صدرت ${fmtNum(certs.filter(x=>!x.revoked).length)} إفادة لمن بلغت نسبة حضوره ${fmtNum(thr)}٪ فأكثر من أيام الدفعة كاملة.`:`تُصدر تلقائيًا عند أرشفة الدفعة لمن يبلغ ${fmtNum(thr)}٪ من أيامها. يستحقها حاليًا ${fmtNum(elig)} متدربًا.`}</div></div>
    ${arch?`<button class="btn sm" id="ciss">${ic('refresh')} إصدار المستحقة</button><button class="btn pri sm" id="cprt" ${certs.some(x=>!x.revoked)?'':'disabled'}>${ic('form')} طباعة الشهادات</button>`:''}</div>
    ${certs.length?`<div style="overflow:auto;margin-top:12px"><table class="tb"><thead><tr><th>الرقم التسلسلي</th><th>المتدرب</th><th>نسبة الحضور</th><th>الحالة</th><th></th></tr></thead><tbody>${certs.map(x=>{ const t=AD.trainees.find(y=>y.id===x.trainee_id); return `<tr><td dir="ltr" style="text-align:right" class="num">${esc(x.serial)}</td><td>${esc(t?.full_name||'')}</td><td>${fmtNum(x.rate)}٪</td><td><span class="pill dot ${x.revoked?'bad':'ok'}">${x.revoked?'ملغاة':'صالحة'}</span></td>
      <td style="white-space:nowrap"><button class="btn sm" data-c1="${x.id}" ${x.revoked?'disabled':''}>${ic('form')} طباعة</button> <button class="btn sm ${x.revoked?'':'danger soft'}" data-rv="${x.id}">${x.revoked?'إعادة تفعيل':'إلغاء'}</button></td></tr>`; }).join('')}</tbody></table></div>`:''}
  </div>`;
}
export function bindCertSection(c, back){
  const certs=()=>(AD.certificates||[]).filter(x=>x.cohort_id===c.id&&!x.revoked), t=`شهادات ${progName(c.program_id)} · ${cohortLabel(c)}`;
  if($('#ciss')) $('#ciss').onclick=async e=>{ const b=e.currentTarget; setBusy(b,true,'جارٍ الإصدار'); try{ const n=await Store.issueCertificates(c.id); await reloadAD(); toast(n?`صدرت ${fmtNum(n)} إفادة جديدة`:'لا توجد إفادات جديدة مستحقة'); back(); }catch(x){ setBusy(b,false); toast(x.message); } };
  if($('#cprt')) $('#cprt').onclick=()=>printCertificates(certs(), t);
  $$('[data-c1]').forEach(b=>b.onclick=()=>printCertificates([(AD.certificates||[]).find(x=>x.id===b.dataset.c1)], t));
  $$('[data-rv]').forEach(b=>b.onclick=async()=>{ const x=AD.certificates.find(y=>y.id===b.dataset.rv); setBusy(b,true,'جارٍ الحفظ'); await Store.revokeCertificate(x.id,!x.revoked); await reloadAD(); toast(x.revoked?'أُعيد تفعيل الشهادة':'أُلغيت الشهادة'); back(); });
}
