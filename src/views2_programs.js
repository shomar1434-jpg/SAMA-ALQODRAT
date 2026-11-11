/* ---------- البرامج والباقات ---------- */
let pgQ='', pgC='all', pgS='all';
function pagePrograms(){
  const m=$('#main'); const {programs,packages,enrollments}=AD, today=riyadhNow().date;
  const act=p=>activeCohortOf(AD,p.id,today);
  const nAct=programs.filter(act).length, nPriced=programs.filter(p=>Number(p.price)>0).length;
  m.innerHTML = titleBar(`${ic('book')}البرامج والباقات`, `${fmtNum(programs.length)} برنامجًا معتمدًا، <em>في ${fmtNum(new Set(programs.map(p=>p.category)).size)} مجالات</em>`, 'لكل برنامج نموذج تسجيل وباركود خاص به. افتح التسجيل لبرنامج فتُنشأ دفعة جديدة يُعتمد كشفها في التحضير اليومي.',
      `<button class="btn pri sm" id="addP">${ic('plus')} برنامج</button><button class="btn sm" id="impP">${ic('copy')} استيراد برامج</button><button class="btn sm" id="addK">${ic('layers')} باقة</button><button class="btn sm" id="prCat">${ic('form')} طباعة الدليل</button>`)+
    `<div class="kpis" style="grid-template-columns:repeat(4,1fr)">
      ${kpiCard(0,'book','info','البرامج المعتمدة',programs.length,'','في دليل المركز')}
      ${kpiCard(1,'users','success','لها دفعة نشطة',nAct,'',`${fmtNum(programs.length-nAct)} بلا دفعة حاليًا`)}
      ${kpiCard(2,'wallet','gold','المسعّرة',nPriced,'',`${fmtNum(programs.length-nPriced)} بلا سعر بعد`)}
      ${kpiCard(3,'layers','early','الباقات',packages.length,'',packages.length?'متاحة للتسجيل':'أضف أول باقة')}</div>
    <div class="filters rv" style="--i:2"><span class="lbl">${ic('search')}</span><input class="inp" id="pq" placeholder="اسم البرنامج أو رقم الاعتماد" value="${esc(pgQ)}" style="flex:1;min-width:220px">
      <select class="inp" id="pc"><option value="all">كل المجالات</option>${allCats().map(c=>`<option ${pgC===c?'selected':''}>${esc(c)}</option>`).join('')}</select>
      <select class="inp" id="ps">${[['all','كل الحالات'],['open','التسجيل مفتوح'],['active','لها دفعة نشطة'],['none','بلا دفعة'],['noprice','بلا سعر'],['off','موقوف']].map(([v,l])=>`<option value="${v}" ${pgS===v?'selected':''}>${l}</option>`).join('')}</select></div>
    <div id="pgList"></div>
    <h3 class="ctitle" style="margin:26px 0 12px">${ic('layers')}الباقات التدريبية وأسعارها</h3>
    <div class="grid g3">${packages.map((k,i)=>{ const ps=programs.filter(p=>k.program_ids.includes(p.id)), sum=ps.reduce((s,p)=>s+Number(p.price||0),0), hrs=ps.reduce((s,p)=>s+(p.hours||0),0), ready=ps.every(p=>{const c=act(p); return c&&c.reg_open;});
      return `<div class="card pad rv" style="--i:${i+3};display:flex;flex-direction:column;gap:8px">
      <div style="display:flex;justify-content:space-between;gap:6px;flex-wrap:wrap"><span class="pill dot o">${fmtNum(ps.length)} برامج · ${hoursTxt(hrs)}</span>${!k.active?'<span class="pill dot g">موقوفة</span>':ready?'<span class="pill dot ok">التسجيل مفتوح</span>':'<span class="pill dot warn">بانتظار فتح دفعات برامجها</span>'}</div>
      <h3 style="font-size:17px;font-weight:600">${esc(k.name)}</h3>${k.description?`<div class="hint">${esc(k.description)}</div>`:''}
      <div style="display:flex;flex-wrap:wrap;gap:4px">${ps.map(p=>`<span class="pill ${act(p)?.reg_open?'ok':'g'}">${esc(short(p.name))}</span>`).join('')}</div>
      <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap"><b class="num" style="font-weight:700;color:var(--brand-strong);font-size:20px">${priceTxt(k.price)}</b>${sum>Number(k.price||0)&&k.price?`<span class="hint"><s>${fmtMoney(sum)}</s> · توفير ${fmtNum(Math.round((1-k.price/sum)*100))}٪</span>`:''}</div>
      <div class="hint">${fmtNum(new Set(enrollments.filter(e=>e.package_id===k.id).map(e=>e.ref)).size)} اشتراك</div>
      <div style="display:flex;gap:6px;margin-top:auto;padding-top:6px"><button class="btn sm" data-ek="${k.id}">${ic('edit')} تعديل</button><button class="btn sm danger soft" data-dk="${k.id}">${ic('trash')} حذف</button></div></div>`; }).join('') || `<div style="grid-column:1/-1">${emptyBox('لا توجد باقات بعد','اجمع برنامجين أو أكثر في باقة، وحدّد سعرها الخاص.')}<div style="text-align:center;margin-top:12px"><button class="btn pri" id="addK2">${ic('layers')} إنشاء باقة</button></div></div>`}</div>`;
  countUp(m);
  renderProgramList();
  $('#pq').oninput=e=>{ pgQ=e.target.value.trim(); clearTimeout(window._pq); window._pq=setTimeout(renderProgramList,200); };
  $('#pc').onchange=e=>{ pgC=e.target.value; renderProgramList(); }; $('#ps').onchange=e=>{ pgS=e.target.value; renderProgramList(); };
  $('#prCat').onclick=()=>printDocs([catalogHtml()],'دليل البرامج المعتمدة');
  $('#addP').onclick=()=>programModal(); $('#impP').onclick=importModal; $('#addK').onclick=()=>packageModal(); $('#addK2')&&($('#addK2').onclick=()=>packageModal());
  $$('[data-ek]').forEach(b=>b.onclick=()=>packageModal(packages.find(p=>p.id===b.dataset.ek)));
  $$('[data-dk]').forEach(b=>b.onclick=()=>confirmBox('حذف الباقة','تُحذف الباقة، ويبقى المشتركون فيها في كشوف الدفعات.', async()=>{ await Store.deletePackage(b.dataset.dk); await reloadAD(); toast('حُذفت الباقة'); pagePrograms(); }));
}
function renderProgramList(){
  const {programs}=AD, today=riyadhNow().date, act=p=>activeCohortOf(AD,p.id,today);
  const list = programs.filter(p=>(pgC==='all'||p.category===pgC) && (!pgQ||p.name.includes(pgQ)||(p.accreditation_no||'').includes(pgQ))
    && (pgS==='all' || (pgS==='open'&&act(p)?.reg_open) || (pgS==='active'&&act(p)) || (pgS==='none'&&!act(p)) || (pgS==='noprice'&&!(Number(p.price)>0)) || (pgS==='off'&&!p.active)));
  const groups = [...new Set(list.map(p=>p.category))].sort(catSort);
  $('#pgList').innerHTML = groups.length ? groups.map((c,gi)=>{ const ps=list.filter(p=>p.category===c); const tone=CAT_TONE[c]||'brand';
    return `<div class="card prog-sec rv" style="--i:${gi+3}"><div class="hd"><span class="kic-lg t-${tone==='brand'?'info':tone}">${ic(CAT_ICON[c]||'book')}</span><div style="flex:1"><h3>${esc(c)}</h3><div class="hint">${fmtNum(ps.length)} برنامج · ${fmtNum(ps.filter(act).length)} لها دفعة نشطة</div></div>
      <button class="btn sm" data-addc="${esc(c)}">${ic('plus')} برنامج في هذا المجال</button></div>
      <div style="overflow:auto"><table class="tb"><thead><tr><th>البرنامج</th><th>الساعات</th><th>الأيام</th><th>السعر</th><th>الدفعة الحالية</th><th>الدفعات السابقة</th><th></th></tr></thead><tbody>
      ${ps.map(p=>{ const a=act(p), past=cohortsOfProgram(AD,p.id).filter(x=>x!==a).length;
        return `<tr><td style="min-width:230px"><b style="font-weight:500">${esc(p.name)}</b><div class="hint">${p.accreditation_no?`رقم الاعتماد ${esc(p.accreditation_no)}`:'بلا رقم اعتماد'}${p.active?'':' · <span style="color:var(--danger-ink)">موقوف</span>'}</div></td>
          <td class="num">${p.hours==null?'—':fmtNum(p.hours)}</td><td>${daysTxt(p.duration_days)}</td>
          <td>${Number(p.price)>0?`<b class="num" style="font-weight:600">${fmtMoney(p.price)}</b>`:'<span class="pill o">بلا سعر</span>'}</td>
          <td style="min-width:190px">${a?`<button class="enr" data-cv="${a.id}"><span class="pill dot ${a.reg_open?'ok':STATE_PILL[cohortState(a)]}">${a.reg_open?'التسجيل مفتوح':STATE_TXT[cohortState(a)]}</span><span style="flex:1;text-align:right">${cohortLabel(a)} · ${fmtNum(takenOf(AD,a.id))}/${fmtNum(a.seats)}</span></button><div class="hint" style="margin-top:2px">${fmtShort(a.start_date)} – ${fmtShort(a.end_date)}</div>`
             :`<button class="btn sm pri" data-open="${p.id}" ${p.active?'':'disabled'}>${ic('form')} فتح التسجيل</button>`}</td>
          <td>${past?`<span class="pill g">${fmtNum(past)} مؤرشفة</span>`:'<span class="hint">—</span>'}</td>
          <td style="white-space:nowrap"><a class="btn sm" href="#qr-${progCode(p)}" title="الباركود">${ic('qr')}</a> <button class="btn sm" data-cp="${progCode(p)}" title="نسخ رابط النموذج">${ic('copy')}</button> <button class="btn sm" data-ep="${p.id}" title="تعديل">${ic('edit')}</button> <button class="btn sm danger soft" data-dp="${p.id}" title="حذف">${ic('trash')}</button></td></tr>`; }).join('')}
      </tbody></table></div></div>`; }).join('') : emptyBox('لا توجد برامج مطابقة','غيّر البحث أو المرشحات، أو أضف برنامجًا جديدًا.');
  $$('[data-ep]').forEach(b=>b.onclick=()=>programModal(AD.programs.find(p=>p.id===b.dataset.ep)));
  $$('[data-addc]').forEach(b=>b.onclick=()=>programModal(null,b.dataset.addc));
  $$('[data-open]').forEach(b=>b.onclick=()=>cohortModal(AD.programs.find(p=>p.id===b.dataset.open), null, pagePrograms));
  bindCohortActions(()=>{ location.hash='#admin-cohorts'; });
  $$('#pgList [data-cv]').forEach(b=>b.onclick=()=>{ cohortView=b.dataset.cv; location.hash='#admin-cohorts'; });
  $$('[data-dp]').forEach(b=>b.onclick=()=>confirmBox('حذف البرنامج','يُحذف البرنامج مع كل دفعاته وكشوفها وسجلات حضورها، ويُزال من الباقات.', async()=>{ await Store.deleteProgram(b.dataset.dp); await reloadAD(); toast('حُذف البرنامج'); pagePrograms(); }));
}
const swRow = (name, label, on, hint='') => `<label class="sw"><span><span style="font-weight:500">${label}</span>${hint?`<span class="hint" style="display:block">${hint}</span>`:''}</span><input type="checkbox" name="${name}" ${on?'checked':''}><i></i></label>`;
function programModal(p, presetCat){
  const isNew=!p; p = p || {name:'',category:presetCat||CATEGORIES[0],accreditation_no:'',hours:15,duration_days:3,description:'',price:null,active:true};
  modal(`<h3>${isNew?'برنامج تدريبي جديد':'تعديل البرنامج'}</h3><form id="pm" class="grid g2" novalidate>
    <div class="field" style="grid-column:1/-1"><label>اسم البرنامج <i>*</i></label><input class="inp" name="name" value="${esc(p.name)}"></div>
    <div class="field"><label>المجال <i>*</i></label><input class="inp" name="category" list="catList" value="${esc(p.category)}" placeholder="اختر أو اكتب مجالًا جديدًا"><datalist id="catList">${allCats().map(c=>`<option value="${esc(c)}">`).join('')}</datalist></div>
    <div class="field"><label>رقم الاعتماد</label><input class="inp num" name="accreditation_no" dir="ltr" style="text-align:right" value="${esc(p.accreditation_no||'')}" placeholder="مثل 25212"><span class="hint">يُبنى منه رابط البرنامج وباركوده، فلا يتغير بعد فتح الدفعات.</span></div>
    <div class="field"><label>عدد الساعات</label><input class="inp" name="hours" type="number" min="0" value="${p.hours??''}"></div>
    <div class="field"><label>عدد الأيام</label><input class="inp" name="duration_days" type="number" min="1" value="${p.duration_days??''}"></div>
    <div class="field"><label>رسوم البرنامج (ر.س)</label><input class="inp" name="price" type="number" min="0" value="${Number(p.price)>0?p.price:''}" placeholder="فارغ = السعر عند التواصل"></div>
    <div class="field" style="grid-column:1/-1"><label>وصف مختصر</label><input class="inp" name="description" value="${esc(p.description||'')}" placeholder="يظهر للمتدرب في صفحة البرنامج"></div>
    <div style="grid-column:1/-1">${swRow('active','متاح في دليل البرامج',p.active)}</div>
    <p class="hint" style="grid-column:1/-1;margin:0">مواعيد الانعقاد والمقاعد والقاعة تُحدَّد لكل دفعة عند فتح التسجيل.</p>
    <div class="errtxt" id="pmE" style="grid-column:1/-1"></div>
    <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="pmC">إلغاء</button><button class="btn pri">${ic('check')} حفظ البرنامج</button></div></form>`);
  const f=$('#pm'); if(!isNew && cohortsOfProgram(AD,p.id).length) f.accreditation_no.readOnly=true;
  $('#pmC').onclick=closeModal;
  f.onsubmit=async e=>{ e.preventDefault(); const fd=new FormData(f); const num=v=>v===''||v==null?null:Number(v), E=m=>$('#pmE').textContent=m;
    const o={...p, name:fd.get('name').trim(), category:fd.get('category').trim(), accreditation_no:fd.get('accreditation_no').trim().replace(/\D/g,''), hours:num(fd.get('hours')), duration_days:num(fd.get('duration_days')),
      description:fd.get('description').trim(), price:num(fd.get('price')), active:!!fd.get('active')};
    delete o.cohort; if(isNew) delete o.code;
    if(!o.name) return E('اكتب اسم البرنامج.');
    if(!o.category) return E('اختر المجال أو اكتب مجالًا جديدًا.');
    if(o.accreditation_no && AD.programs.some(x=>x.id!==p.id && x.accreditation_no===o.accreditation_no)) return E('رقم الاعتماد مستخدم لبرنامج آخر. تحقق منه.');
    const sb=$('#pm button.pri'); setBusy(sb,true,'جارٍ الحفظ');
    try{ await Store.saveProgram(o); await reloadAD(); closeModal(); toast(isNew?'أُضيف البرنامج':'حُفظ البرنامج'); pagePrograms(); }catch(x){ setBusy(sb,false); E(x.message); } };
}
function modal(html){ $('#modalRoot').innerHTML=`<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`; $('.modal-bg').onclick=e=>{ if(e.target.classList.contains('modal-bg')) closeModal(); }; }
function closeModal(){ $('#modalRoot').innerHTML=''; }
function confirmBox(title, msg, fn, label){ modal(`<div class="alert t-danger"><span class="aic">${ic('alert')}</span><div><b style="font-weight:600;font-size:16px">${esc(title)}</b><div class="hint">${esc(msg)}</div></div></div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:18px"><button class="btn" id="mc">إلغاء</button><button class="btn danger" id="mo">${ic(label?'x':'trash')} ${label||'حذف'}</button></div>`);
  $('#mc').onclick=closeModal; $('#mo').onclick=async ev=>{ setBusy(ev.currentTarget,true,'جارٍ التنفيذ'); try{ await fn(); }catch(e){ toast(e.message); } closeModal(); }; }
const secHead = (icon, t) => `<div class="ctitle" style="grid-column:1/-1;font-size:15px;margin-top:6px;padding-top:12px;border-top:1px solid var(--border)">${ic(icon)}${t}</div>`;

/* استيراد عدة برامج دفعة واحدة: سطر لكل برنامج، الحقول مفصولة بـ | أو Tab (من Excel) */
function parseImport(txt){
  const rows=[], bad=[];
  txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).forEach((line,i)=>{
    const c=line.split(/\t|\|/).map(s=>s.trim());
    if(/^(الاسم|اسم البرنامج)$/.test(c[0])) return;
    const n=v=>{ const x=(v||'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[^\d.]/g,''); return x===''?null:Number(x); };
    if(!c[0]) { bad.push(i+1); return; }
    rows.push({ name:c[0], category:c[1]||'برامج أخرى', hours:n(c[2]), duration_days:n(c[3]), accreditation_no:(c[4]||'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g,''), price:n(c[5]) });
  });
  return {rows,bad};
}
function importModal(){
  modal(`<h3>استيراد برامج تدريبية</h3>
    <p class="hint" style="margin:-8px 0 12px">الصق سطرًا لكل برنامج، والحقول مفصولة بالرمز | أو منسوخة مباشرة من أعمدة Excel بالترتيب:<br><b>الاسم | المجال | الساعات | الأيام | رقم الاعتماد | السعر</b> — الحقول بعد الاسم اختيارية.</p>
    <textarea class="inp" id="impT" rows="8" style="padding:12px 14px;line-height:24px;resize:vertical" placeholder="مهارات العرض والتقديم | الإدارة والأعمال | 15 | 3 | 25300 | 950&#10;أساسيات البرمجة بلغة بايثون | الحاسب والتقنية | 30 | 5"></textarea>
    <div id="impP" class="hint" style="margin-top:10px"></div>
    <div class="errtxt" id="impE"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" id="impC">إلغاء</button><button class="btn pri" id="impGo" disabled>${ic('plus')} إضافة البرامج</button></div>`);
  const T=$('#impT'); let parsed={rows:[],bad:[]};
  const preview=()=>{ parsed=parseImport(T.value); const dup=parsed.rows.filter(r=>AD.programs.some(p=>p.name===r.name || (r.accreditation_no && p.accreditation_no===r.accreditation_no)));
    const fresh=parsed.rows.length-dup.length;
    $('#impP').innerHTML = parsed.rows.length ? `<div class="grid" style="gap:6px;max-height:220px;overflow:auto">${parsed.rows.map(r=>{ const d=dup.includes(r); return `<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;border:1px solid var(--border);border-radius:var(--radius-md);padding:8px 12px"><span><b style="font-weight:500">${esc(r.name)}</b> <span class="hint">· ${esc(r.category)}${r.hours?` · ${hoursTxt(r.hours)}`:''}${r.duration_days?` · ${daysTxt(r.duration_days)}`:''}${r.accreditation_no?` · ${r.accreditation_no}`:''}</span></span><span class="pill dot ${d?'warn':'ok'}">${d?'موجود مسبقًا':(r.price?fmtMoney(r.price):'جديد')}</span></div>`; }).join('')}</div><p style="margin:8px 0 0">${fmtNum(fresh)} برنامج جديد${dup.length?`، ويُتجاوز ${fmtNum(dup.length)} موجود مسبقًا`:''}.</p>` : '';
    $('#impGo').disabled = fresh<=0; };
  T.oninput=preview; $('#impC').onclick=closeModal;
  $('#impGo').onclick=async e=>{ const b=e.currentTarget; setBusy(b,true,'جارٍ إضافة البرامج');
    const fresh=parsed.rows.filter(r=>!AD.programs.some(p=>p.name===r.name || (r.accreditation_no && p.accreditation_no===r.accreditation_no)));
    try{ for(const r of fresh){ await Store.saveProgram({ ...r, description:'', active:true }); }
      AD=await Store.adminData(); closeModal(); toast(`أُضيف ${fmtNum(fresh.length)} برنامج`); pagePrograms(); }catch(x){ $('#impE').textContent=x.message; setBusy(b,false); } };
}

function packageModal(k){
  const isNew=!k; k = k || {name:'',description:'',price:'',program_ids:[],active:true};
  let sel=new Set(k.program_ids), mq='', mc='all';
  modal(`<h3>${isNew?'باقة تدريبية جديدة':'تعديل الباقة'}</h3><form id="km" class="grid" novalidate>
    <div class="field"><label>اسم الباقة <i>*</i></label><input class="inp" name="name" value="${esc(k.name)}" placeholder="مثل: باقة القيادة الإدارية"></div>
    <div class="field"><label>الوصف</label><input class="inp" name="description" value="${esc(k.description||'')}" placeholder="يظهر للمتدرب في بطاقة الباقة"></div>
    <div class="field"><label>سعر الباقة (ر.س) <i>*</i></label><input class="inp" name="price" type="number" min="1" value="${k.price??''}"></div>
    <div class="field"><label>البرامج المشمولة <i>*</i></label>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><input class="inp" id="kq" placeholder="ابحث عن برنامج" style="flex:1;min-width:160px"><select class="inp" id="kc" style="width:auto"><option value="all">كل المجالات</option>${allCats().map(c=>`<option>${esc(c)}</option>`).join('')}</select></div>
      <div id="kList" class="grid" style="gap:6px;max-height:260px;overflow:auto;padding:2px"></div>
      <div class="alert t-info" id="kSum" style="margin-top:6px"></div></div>
    ${swRow('active','متاحة للتسجيل',k.active)}
    <div class="errtxt" id="kmE"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="kmC">إلغاء</button><button class="btn pri">${ic('check')} حفظ الباقة</button></div></form>`);
  const f=$('#km');
  const summary=()=>{ const ps=AD.programs.filter(p=>sel.has(p.id)), sum=ps.reduce((s,p)=>s+Number(p.price||0),0), hrs=ps.reduce((s,p)=>s+(p.hours||0),0), price=+f.price.value||0, unpriced=ps.filter(p=>!(Number(p.price)>0)).length;
    $('#kSum').innerHTML=`<span class="aic">${ic('layers')}</span><span><b>${fmtNum(ps.length)}</b> برامج مختارة · ${hoursTxt(hrs)}${sum?` · مجموع أسعارها منفردة ${fmtMoney(sum)}`:''}${sum&&price&&price<sum?` · <b>توفير ${fmtNum(Math.round((1-price/sum)*100))}٪</b> للمتدرب`:''}${unpriced?`<span class="hint" style="display:block">${fmtNum(unpriced)} منها بلا سعر منفرد، فلا تدخل في حساب التوفير.</span>`:''}</span>`; };
  const list=()=>{ const ps=AD.programs.filter(p=>(mc==='all'||p.category===mc)&&(!mq||p.name.includes(mq))).sort((a,b)=>(sel.has(b.id)-sel.has(a.id))||catSort(a.category,b.category));
    $('#kList').innerHTML=ps.map(p=>`<label class="check" style="margin:0;border:1px solid ${sel.has(p.id)?'var(--brand)':'var(--border)'};background:${sel.has(p.id)?'var(--brand-tint)':'transparent'};border-radius:var(--radius-md);padding:8px 12px;align-items:center"><input type="checkbox" value="${p.id}" ${sel.has(p.id)?'checked':''} style="margin:0"><span style="flex:1;min-width:0">${esc(p.name)}<span class="hint" style="display:block">${esc(p.category)} · ${hoursTxt(p.hours)}</span></span><span class="hint">${Number(p.price)>0?fmtMoney(p.price):'بلا سعر'}</span></label>`).join('')||'<div class="hint" style="padding:10px">لا نتائج</div>';
    $$('#kList input').forEach(x=>x.onchange=()=>{ x.checked?sel.add(x.value):sel.delete(x.value); list(); summary(); }); };
  $('#kq').oninput=e=>{ mq=e.target.value.trim(); list(); }; $('#kc').onchange=e=>{ mc=e.target.value; list(); }; f.price.oninput=summary;
  list(); summary(); $('#kmC').onclick=closeModal;
  f.onsubmit=async e=>{ e.preventDefault(); const fd=new FormData(f);
    const o={...k, name:fd.get('name').trim(), description:fd.get('description').trim(), price:+fd.get('price')||0, program_ids:[...sel], active:!!fd.get('active')};
    const E=m=>$('#kmE').textContent=m;
    if(!o.name) return E('اكتب اسم الباقة.');
    if(!(o.price>0)) return E('حدّد سعر الباقة بالريال.');
    if(o.program_ids.length<2) return E('الباقة تضم برنامجين على الأقل.');
    const sb=$('#km button.pri'); setBusy(sb,true,'جارٍ الحفظ');
    try{ await Store.savePackage(o); await reloadAD(); closeModal(); toast(isNew?'أُنشئت الباقة':'حُفظت الباقة'); pagePrograms(); }catch(x){ setBusy(sb,false); E(x.message); } };
}

