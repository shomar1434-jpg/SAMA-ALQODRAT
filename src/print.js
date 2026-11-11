/* =====================================================================
   مركز التقارير والطباعة — نماذج رسمية بهوية المركز (A4)
   الترويسة (الشعارات) والتذييل (التواصل) يتكرران في كل صفحة مطبوعة
   ===================================================================== */
const fmtHijri = d => { try{ return new Date(d+'T12:00:00Z').toLocaleDateString('ar-SA-u-ca-islamic-umalqura',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}); }catch(e){ return ''; } };
const fmtGreg = d => new Date(d+'T12:00:00Z').toLocaleDateString('ar-SA-u-ca-gregory',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const fmtMonth = m => new Date(m+'-15T12:00:00Z').toLocaleDateString('ar-SA-u-ca-gregory',{month:'long',year:'numeric',timeZone:'UTC'});
const weekOf = d => { const s=addDays(d,-dowOf(d)); return {from:s, to:addDays(s,6)}; };            // الأسبوع من الأحد إلى السبت
const monthOf = m => { const [y,mm]=m.split('-').map(Number); const last=new Date(Date.UTC(y,mm,0)).getUTCDate(); return {from:`${m}-01`, to:`${m}-${String(last).padStart(2,'0')}`}; };
const gradeOf = r => r>=90?['ممتاز','ok']:r>=75?['جيد جدًا','ok']:r>=50?['يحتاج متابعة','warn']:['ضعيف','bad'];
const nowStamp = () => { const n=riyadhNow(); return `${fmtGreg(n.date)} الساعة ${t12(n.hm)}`; };

function docShell({docNo, title, sub, info, stats, body, note, land}){
  return `<div class="pdoc ${land?'land':''}"><table class="pframe"><thead><tr><td>
      <div class="ph-logos"><img src="${LOGOS.tvtc}" alt=""><img src="${LOGOS.nelc}" alt=""><img src="${LOGOS.sama}" alt=""></div>
      <div class="ph-title"><div><h1>${title}</h1><span>${sub}</span></div><div class="ph-no"><span>رقم المستند</span><b dir="ltr">${docNo}</b></div></div>
    </td></tr></thead>
    <tfoot><tr><td><div class="pf">
      <div class="pf-main"><b>${CENTER.name}</b><span>سجل تجاري ${CENTER.cr} · معتمد من ${CENTER.accreditor}</span></div>
      <div class="pf-items"><span>${ic('pin')}${CENTER.address} · ص.ب ${CENTER.pobox}</span><span dir="ltr">${ic('activity')}${CENTER.phones.join(' · ')}</span><span dir="ltr">${ic('form')}${CENTER.email}</span><span dir="ltr">${X_LOGO}@${CENTER.x}</span></div>
    </div></td></tr></tfoot>
    <tbody><tr><td>
      ${info?`<div class="pinfo">${info.map(([k,v,w])=>`<div class="${w||''}"><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>`:''}
      ${stats?`<div class="pstats" style="grid-template-columns:repeat(${stats.length},1fr)">${stats.map(([k,v,t])=>`<div class="${t||''}"><span>${k}</span><b>${v}</b></div>`).join('')}</div>`:''}
      ${body}
      ${note?`<div class="pnote">${note} حُرّر في ${nowStamp()}.</div>`:''}
      <div class="psign"><div><span>مدير المركز</span><i></i><small>الاسم والتوقيع</small></div><div class="stamp"><span>ختم المركز</span><i></i></div></div>
    </td></tr></tbody></table></div>`;
}
const cohortInfo = (c, extra=[]) => { const p=progOf(c.program_id); return [['البرنامج التدريبي',p.name,'wide'],['المجال',p.category],['رقم الاعتماد',p.accreditation_no||'—'],
  ['الدفعة',fmtNum(c.number)], ...extra, ['وقت المحاضرة',`${t12(c.start_time)} – ${t12(c.end_time)}`],['القاعة',c.hall||'—'],['المدرب',c.trainer||'—'],['مدة الدفعة',`${fmtShort(c.start_date)} – ${fmtShort(c.end_date)}`]]; };
const docCode = (c, tag, d) => `${tag}-${progCode(progOf(c.program_id)).toUpperCase()}-${c.number}-${d.replace(/-/g,'')}`;

/* ---------- 1) كشف الحضور اليومي ---------- */
function sheetHtml(c, date){
  const today=riyadhNow(), roster=enrollsOf(AD,c.id).filter(e=>e.created_at.slice(0,10)<=date);
  const rows=roster.map(e=>({e,t:AD.trainees.find(x=>x.id===e.trainee_id),a:AD.attendance.find(a=>a.enrollment_id===e.id&&a.att_date===date)})).filter(x=>x.t).sort((a,b)=>a.t.full_name.localeCompare(b.t.full_name,'ar'));
  const present=rows.filter(x=>x.a), late=present.filter(x=>x.a.status==='متأخر').length, pending=date===today.date && toMin(today.hm)<toMin(c.end_time);
  const allDays=sessionDays(c), dayNo=allDays.indexOf(date)+1;
  return docShell({ docNo:docCode(c,'ATT',date), title:'كشف الحضور اليومي', sub:'نموذج إثبات حضور المتدربين',
    info:cohortInfo(c,[['اليوم',`${DAYS[dowOf(date)]}${dayNo?` · ${fmtNum(dayNo)} من ${fmtNum(allDays.length)}`:''}`],['التاريخ الهجري',fmtHijri(date)],['التاريخ الميلادي',fmtGreg(date)]]),
    stats:[['عدد المسجلين',fmtNum(rows.length)],['الحاضرون',fmtNum(present.length),'ok'],['منهم متأخرون',fmtNum(late),'warn'],[pending?'لم يحضروا حتى الآن':'الغائبون',fmtNum(rows.length-present.length),'bad'],['نسبة الحضور',fmtNum(rows.length?Math.round(present.length/rows.length*100):0)+'٪']],
    body:`<table class="ptab"><thead><tr><th style="width:30px">م</th><th>اسم المتدرب</th><th style="width:92px">السجل المدني</th><th style="width:88px">الجوال</th><th style="width:76px">وقت الحضور</th><th style="width:62px">الحالة</th><th style="width:92px">التوقيع</th></tr></thead>
      <tbody>${rows.map((x,i)=>`<tr class="${x.a?'':'abs'}"><td>${fmtNum(i+1)}</td><td class="nm">${esc(x.t.full_name)}</td><td dir="ltr">${esc(x.t.national_id)}</td><td dir="ltr">${esc(x.t.phone)}</td><td dir="ltr">${x.a?t12(x.a.time.slice(0,5)):'—'}</td>
        <td><span class="pst ${x.a?(x.a.status==='متأخر'?'warn':'ok'):'bad'}">${x.a?(x.a.status==='متأخر'?'متأخر':'حاضر'):'غائب'}</span>${x.a?.manual?'<i class="pman">يدوي</i>':''}</td><td></td></tr>`).join('') || `<tr><td colspan="7" style="text-align:center;padding:18px">لا يوجد مسجلون في هذه الدفعة حتى هذا التاريخ</td></tr>`}</tbody></table>`,
    note:`سُجّل الحضور آليًا بمسح باركود البرنامج والتحقق برقم السجل المدني مقابل كشف الدفعة${rows.some(x=>x.a?.manual)?'، و«يدوي» تحضير أجراه مدير النظام':''}${pending?'، والكشف محرّر قبل انتهاء المحاضرة':''}.` });
}

/* ---------- 2) الملخص الأسبوعي / الشهري: نسبة حضور كل متدرب ---------- */
function periodStats(c, from, to){
  const today=riyadhNow(), upTo = to<today.date ? to : today.date;
  const days=sessionDays(c, upTo).filter(d=>d>=from && !(d===today.date && toMin(today.hm)<toMin(c.end_time)));
  const rows=enrollsOf(AD,c.id).map(e=>{ const t=AD.trainees.find(x=>x.id===e.trainee_id); const my=days.filter(d=>d>=e.created_at.slice(0,10));
    const at=AD.attendance.filter(a=>a.enrollment_id===e.id && my.includes(a.att_date)); const late=at.filter(a=>a.status==='متأخر').length;
    return {e,t,of:my.length,n:at.length,late,abs:my.length-at.length,r:my.length?Math.round(at.length/my.length*100):null}; }).filter(x=>x.t).sort((a,b)=>(b.r??-1)-(a.r??-1)||a.t.full_name.localeCompare(b.t.full_name,'ar'));
  return {days, rows};
}
function summaryHtml(c, from, to, kind){
  const {days, rows}=periodStats(c,from,to), rated=rows.filter(x=>x.r!==null);
  const avg=rated.length?Math.round(rated.reduce((s,x)=>s+x.r,0)/rated.length):0;
  const label = kind==='week' ? 'الملخص الأسبوعي للحضور' : kind==='month' ? 'الملخص الشهري للحضور' : 'ملخص حضور الدفعة';
  const per = kind==='month' ? fmtMonth(from.slice(0,7)) : `${fmtShort(from)} – ${fmtShort(to)}`;
  const daily = days.map(d=>{ const n=AD.attendance.filter(a=>a.cohort_id===c.id&&a.att_date===d).length, of=enrollsOf(AD,c.id).filter(e=>e.created_at.slice(0,10)<=d).length; return {d,n,of}; });
  return docShell({ docNo:docCode(c, kind==='week'?'WK':kind==='month'?'MO':'CO', from), title:label, sub:`نسبة حضور كل متدرب · ${per}`,
    info:cohortInfo(c,[['الفترة',per],['من (هجري)',fmtHijri(from)],['إلى (هجري)',fmtHijri(to)]]),
    stats:[['عدد المسجلين',fmtNum(rows.length)],['المحاضرات المنعقدة',fmtNum(days.length)],['متوسط نسبة الحضور',fmtNum(avg)+'٪','ok'],['٧٥٪ فأكثر',fmtNum(rated.filter(x=>x.r>=75).length),'ok'],['أقل من ٥٠٪',fmtNum(rated.filter(x=>x.r<50).length),'bad']],
    body: days.length ? `<table class="ptab"><thead><tr><th style="width:30px">م</th><th>اسم المتدرب</th><th style="width:92px">السجل المدني</th><th style="width:60px">الحضور</th><th style="width:46px">التأخر</th><th style="width:46px">الغياب</th><th style="width:150px">نسبة الحضور</th><th style="width:78px">التقدير</th></tr></thead>
      <tbody>${rows.map((x,i)=>{ const g=x.r===null?['—','']:gradeOf(x.r); return `<tr class="${x.r!==null&&x.r<50?'abs':''}"><td>${fmtNum(i+1)}</td><td class="nm">${esc(x.t.full_name)}</td><td dir="ltr">${esc(x.t.national_id)}</td>
        <td>${fmtNum(x.n)} / ${fmtNum(x.of)}</td><td>${fmtNum(x.late)}</td><td>${fmtNum(x.abs)}</td>
        <td>${x.r===null?'<span class="pman">لم يبدأ</span>':`<div class="pbarw"><i class="${g[1]}" style="width:${x.r}%"></i></div><b class="ppct">${fmtNum(x.r)}٪</b>`}</td><td>${x.r===null?'—':`<span class="pst ${g[1]}">${g[0]}</span>`}</td></tr>`; }).join('')}</tbody></table>
      <div class="pdaily"><span>الحضور اليومي في الفترة:</span>${daily.map(x=>`<em><small>${DAYS[dowOf(x.d)].replace('ال','').slice(0,3)} ${fmtShort(x.d)}</small>${fmtNum(x.n)}/${fmtNum(x.of)}</em>`).join('')}</div>`
      : `<div class="pempty">لم تنعقد محاضرات لهذه الدفعة في الفترة المحددة.</div>`,
    note:`النسبة = أيام حضور المتدرب ÷ المحاضرات المنعقدة منذ تسجيله في الفترة. التقدير: ممتاز ٩٠٪ فأكثر، جيد جدًا ٧٥٪ فأكثر، يحتاج متابعة ٥٠٪ فأكثر، ضعيف أقل من ٥٠٪.` });
}

/* ---------- 3) سجل الدفعة الكامل (أفقي) ---------- */
function fullSheetHtml(c){
  const today=riyadhNow().date, all=sessionDays(c), s=cohortSummary(c);
  const rows=s.per.map(x=>({...x,t:AD.trainees.find(t=>t.id===x.e.trainee_id)})).filter(x=>x.t).sort((a,b)=>a.t.full_name.localeCompare(b.t.full_name,'ar'));
  const cell=(e,d)=>{ if(d>today) return ''; if(d<e.created_at.slice(0,10)) return '·'; const a=AD.attendance.find(x=>x.enrollment_id===e.id&&x.att_date===d); return a?(a.status==='متأخر'?'<b class="cl w">م</b>':'<b class="cl o">✓</b>'):'<b class="cl x">غ</b>'; };
  return docShell({ land:true, docNo:docCode(c,'REG',c.start_date), title:'سجل حضور الدفعة', sub:`${STATE_TXT[cohortState(c)]} · ${fmtNum(all.length)} يوم تدريبي`,
    info:cohortInfo(c,[['الحالة',STATE_TXT[cohortState(c)]],['من',fmtGreg(c.start_date)],['إلى',fmtGreg(c.end_date)]]),
    stats:[['عدد المسجلين',fmtNum(s.n)],['المحاضرات المنعقدة',fmtNum(s.days.length)],['نسبة الحضور',fmtNum(s.rate)+'٪','ok'],['أتمّوا ٧٥٪ فأكثر',fmtNum(s.done75),'ok']],
    body:`<table class="ptab pgrid"><thead><tr><th style="width:22px">م</th><th style="min-width:120px">اسم المتدرب</th><th style="width:70px">السجل المدني</th>${all.map(d=>`<th class="dc">${fmtNum(+d.slice(8))}<br><small>${fmtNum(+d.slice(5,7))}</small></th>`).join('')}<th style="width:44px">النسبة</th></tr></thead>
      <tbody>${rows.map((x,i)=>`<tr><td>${fmtNum(i+1)}</td><td class="nm">${esc(x.t.full_name)}</td><td dir="ltr">${esc(x.t.national_id)}</td>${all.map(d=>`<td class="dc">${cell(x.e,d)}</td>`).join('')}<td><b>${fmtNum(x.r)}٪</b></td></tr>`).join('')}</tbody></table>
      <div class="plegend"><b class="cl o">✓</b> حاضر <b class="cl w">م</b> متأخر <b class="cl x">غ</b> غائب <span>·</span> قبل تسجيل المتدرب</div>`,
    note:'سجل رسمي لحضور الدفعة من كشف تسجيلها، يُحفظ مع أرشيف الدفعة.' });
}

/* ---------- 4) دليل البرامج المعتمدة ---------- */
function catalogHtml(){
  const today=riyadhNow().date, cats=[...new Set(AD.programs.filter(p=>p.active).map(p=>p.category))].sort(catSort);
  return docShell({ docNo:`CAT-${today.replace(/-/g,'')}`, title:'دليل البرامج التدريبية المعتمدة', sub:`${fmtNum(AD.programs.filter(p=>p.active).length)} برنامجًا في ${fmtNum(cats.length)} مجالات`,
    body: cats.map(cat=>{ const ps=AD.programs.filter(p=>p.active&&p.category===cat); return `<div class="pcat">${esc(cat)} <small>${fmtNum(ps.length)} برنامج</small></div>
      <table class="ptab"><thead><tr><th style="width:28px">م</th><th>البرنامج</th><th style="width:70px">رقم الاعتماد</th><th style="width:48px">الساعات</th><th style="width:52px">الأيام</th><th style="width:74px">الرسوم</th><th style="width:150px">الدفعة الحالية</th></tr></thead>
      <tbody>${ps.map((p,i)=>{ const c=activeCohortOf(AD,p.id,today); return `<tr><td>${fmtNum(i+1)}</td><td class="nm">${esc(p.name)}</td><td dir="ltr">${esc(p.accreditation_no||'—')}</td><td>${p.hours==null?'—':fmtNum(p.hours)}</td><td>${p.duration_days==null?'—':fmtNum(p.duration_days)}</td><td>${Number(p.price)>0?fmtMoney(p.price):'عند التواصل'}</td>
        <td>${c?`${cohortLabel(c)} · ${fmtShort(c.start_date)}${c.reg_open?' · التسجيل مفتوح':''}`:'—'}</td></tr>`; }).join('')}</tbody></table>`; }).join(''),
    note:'البرامج معتمدة من المؤسسة العامة للتدريب التقني والمهني. للتسجيل امسح باركود البرنامج أو زر دليل البرامج في منصة المركز.' });
}

/* ---------- المعاينة والطباعة ---------- */
function printDocs(docs, title){
  closeModal();
  const root=$('#printRoot');
  root.innerHTML = `<div class="pbar"><div><b>${esc(title)}</b><span class="hint" style="color:#cfe7e2">${fmtNum(docs.length)} ${docs.length===1?'مستند':'مستندات'} · A4 · احفظه PDF من نافذة الطباعة</span></div>
      <div style="display:flex;gap:8px"><button class="btn sm" id="pbBack">${ic('prev')} رجوع</button><button class="btn pri sm" id="pbGo">${ic('form')} طباعة</button></div></div>
    <p class="pwarn">إن لم تفتح نافذة الطباعة في نسخة العرض داخل Claude، فهي تعمل بعد رفع النظام على استضافة المركز.</p>
    <div class="ppages">${docs.join('')}</div>`;
  root.classList.add('on'); document.body.classList.add('printing'); root.scrollTop=0;
  $('#pbBack').onclick=closePrint;
  $('#pbGo').onclick=()=>{ try{ window.print(); }catch(e){ toast('الطباعة غير متاحة في هذا العرض'); } };
}
const printSheets = (items, title) => printDocs(items.map(({c,date})=>sheetHtml(c,date)), title);
function closePrint(){ const r=$('#printRoot'); if(!r) return; r.classList.remove('on'); r.innerHTML=''; document.body.classList.remove('printing'); }

/* ---------- التصدير إلى Excel (CSV بترميز يقرؤه Excel العربي) ---------- */
let _dlNs; const dlNs = () => _dlNs ?? (_dlNs = (window.claude && typeof window.claude.use==='function') ? window.claude.use('downloads').catch(()=>null) : Promise.resolve(null));
async function exportCSV(name, rows){
  const txt='\ufeff'+rows.map(r=>r.map(v=>{ const s=String(v??''); return /[",\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }).join(',')).join('\r\n');
  const msg=`صُدّر ${fmtNum(rows.length-1)} صفًا إلى ${name}.csv`;
  const dl = await Promise.race([dlNs(), new Promise(r=>setTimeout(()=>r(null),1500))]);
  if(dl){ try{ await dl.save({filename:name+'.csv', data:txt}); toast(msg); }catch(e){ toast(e?.code==='declined'?'أُلغي التنزيل':'تعذّر التنزيل هنا، استخدم زر النسخ'); } return; }
  try{ const url=URL.createObjectURL(new Blob([txt],{type:'text/csv;charset=utf-8'})); const a=document.createElement('a'); a.href=url; a.download=name+'.csv'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000); toast(msg); }
  catch(e){ toast('تعذّر التنزيل هنا، استخدم زر النسخ'); }
}
const traineesRows = () => [['الاسم','السجل المدني','الجوال','البريد','الجنس','المدينة','المؤهل','جهة العمل','البرنامج','الدفعة','رقم الطلب','حالة التسجيل','تاريخ التسجيل'],
  ...AD.enrollments.map(e=>{ const t=AD.trainees.find(x=>x.id===e.trainee_id), c=AD.cohorts.find(x=>x.id===e.cohort_id); return t?[t.full_name,t.national_id,t.phone,t.email,t.gender,t.city,t.education,t.employer,progName(e.program_id),c?.number,e.ref,e.status,e.created_at.slice(0,10)]:null; }).filter(Boolean)];
const cohortRows = c => { const all=sessionDays(c), today=riyadhNow().date, s=cohortSummary(c);
  return [['الاسم','السجل المدني','الجوال',...all,'أيام الحضور','النسبة'], ...s.per.map(x=>{ const t=AD.trainees.find(y=>y.id===x.e.trainee_id); return [t.full_name,t.national_id,t.phone,...all.map(d=>{ if(d>today) return ''; const a=AD.attendance.find(z=>z.enrollment_id===x.e.id&&z.att_date===d); return a?(a.status==='متأخر'?'متأخر':'حاضر'):(d<x.e.created_at.slice(0,10)?'':'غائب'); }),x.n,x.r+'%']; })]; };
const attendanceRows = (from,to) => [['التاريخ','اليوم','البرنامج','الدفعة','الاسم','السجل المدني','وقت الحضور','الحالة','طريقة التحضير'],
  ...AD.attendance.filter(a=>a.att_date>=from&&a.att_date<=to).sort((a,b)=>a.att_date.localeCompare(b.att_date)||a.time.localeCompare(b.time)).map(a=>{ const t=AD.trainees.find(x=>x.id===a.trainee_id), c=AD.cohorts.find(x=>x.id===a.cohort_id); return [a.att_date,DAYS[dowOf(a.att_date)],progName(a.program_id),c?.number,t?.full_name,t?.national_id,a.time.slice(0,5),a.status,a.manual?'يدوي':'باركود']; })];

/* ---------- نافذة طباعة سريعة من كشف الدفعة ---------- */
function printDayModal(c){
  const today=riyadhNow().date, ds=sessionDays(c,today).reverse();
  if(!ds.length) return toast('لم تبدأ محاضرات هذه الدفعة بعد');
  modal(`<h3>طباعة وتصدير ${cohortLabel(c)}</h3><p class="hint" style="margin:-8px 0 14px">${esc(progName(c.program_id))}</p>
    <div class="grid" style="gap:10px">
      <div class="field"><label>كشف حضور يوم</label><div style="display:flex;gap:8px"><select class="inp" id="pdS">${ds.map(d=>`<option value="${d}">${DAYS[dowOf(d)]} ${fmtGreg(d)}</option>`).join('')}</select><button class="btn pri" id="pdDay">${ic('form')} معاينة</button></div></div>
      <button class="btn" id="pdWeek">${ic('calendar')} الملخص الأسبوعي (الأسبوع الحالي)</button>
      <button class="btn" id="pdMonth">${ic('chart')} الملخص الشهري (الشهر الحالي)</button>
      <button class="btn" id="pdCoh">${ic('award')} ملخص الدفعة كاملة بنسب الحضور</button>
      <button class="btn" id="pdFull">${ic('grid')} سجل الحضور الكامل (صفحة أفقية)</button>
      <button class="btn" id="pdCsv">${ic('copy')} تصدير السجل إلى Excel</button></div>
    <div style="display:flex;justify-content:flex-end;margin-top:16px"><button class="btn" id="pdC">إغلاق</button></div>`);
  const t=`${progName(c.program_id)} · ${cohortLabel(c)}`, w=weekOf(today), m=monthOf(today.slice(0,7));
  $('#pdC').onclick=closeModal;
  $('#pdDay').onclick=()=>printDocs([sheetHtml(c,$('#pdS').value)],t);
  $('#pdWeek').onclick=()=>printDocs([summaryHtml(c,w.from,w.to,'week')],t);
  $('#pdMonth').onclick=()=>printDocs([summaryHtml(c,m.from,m.to,'month')],t);
  $('#pdCoh').onclick=()=>printDocs([summaryHtml(c,c.start_date,c.end_date,'cohort')],t);
  $('#pdFull').onclick=()=>printDocs([fullSheetHtml(c)],t);
  $('#pdCsv').onclick=()=>exportCSV(`سجل-${progCode(progOf(c.program_id))}-الدفعة${c.number}`, cohortRows(c));
}

/* ---------- صفحة «التقارير والطباعة» ---------- */
function pageReports(){
  const m=$('#main'), today=riyadhNow().date;
  const progsWithC = AD.programs.filter(p=>AD.cohorts.some(c=>c.program_id===p.id)).sort((a,b)=>catSort(a.category,b.category)||a.name.localeCompare(b.name,'ar'));
  const progOpts = progsWithC.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  const stOrd={running:0,archived:1,upcoming:2};
  const cohOpts = [...AD.cohorts].sort((a,b)=>stOrd[cohortState(a)]-stOrd[cohortState(b)]||b.start_date.localeCompare(a.start_date)).map(c=>`<option value="${c.id}">${esc(short(progName(c.program_id)))} · ${cohortLabel(c)} · ${STATE_TXT[cohortState(c)]}</option>`).join('');
  const months=[]; for(let i=0;i<12;i++){ const d=new Date(today+'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth()-i,15); months.push(d.toISOString().slice(0,7)); }
  const card=(i,icon,tone,title,desc,form,btns)=>`<div class="card pad rv rep" style="--i:${i}"><div class="rep-h"><span class="kic-lg t-${tone}">${ic(icon)}</span><div><h3>${title}</h3><p class="hint">${desc}</p></div></div><div class="rep-f">${form}</div><div class="rep-b">${btns}</div></div>`;
  m.innerHTML = titleBar(`${ic('form')}التقارير والطباعة`, 'كل ما يُطبع ويُصدَّر، <em>في مكان واحد</em>', 'نماذج رسمية بشعارات المركز وجهات الاعتماد، بختم وتوقيع مدير المركز. تُطبع أو تُحفظ PDF من نافذة الطباعة، وتُصدَّر البيانات إلى Excel.')+
  `<div class="grid g2">
    ${card(1,'calendar','success','كشف الحضور اليومي','نموذج إثبات لحضور يوم: بيانات البرنامج والدفعة، والمسجلون، ووقت حضور كل متدرب، وخانة توقيعه.',
      `<div class="field"><label>التاريخ</label><input type="date" class="inp" id="r1d" value="${today}"></div><div class="field"><label>الدفعة</label><select class="inp" id="r1c"></select></div>`,
      `<button class="btn pri" id="r1">${ic('form')} معاينة الطباعة</button>`)}
    ${card(2,'activity','info','الملخص الأسبوعي','نسبة حضور كل متدرب وتأخره وغيابه خلال الأسبوع (الأحد إلى السبت)، مع الحضور اليومي.',
      `<div class="field"><label>البرنامج</label><select class="inp" id="r2p">${progOpts}</select></div><div class="field"><label>أي يوم في الأسبوع</label><input type="date" class="inp" id="r2d" value="${today}"></div><div class="hint" id="r2h"></div>`,
      `<button class="btn pri" id="r2">${ic('form')} معاينة الطباعة</button><button class="btn" id="r2all">كل البرامج المنعقدة</button>`)}
    ${card(3,'chart','gold','الملخص الشهري','نسبة حضور كل متدرب خلال الشهر، مع تقدير الانتظام: ممتاز، جيد جدًا، يحتاج متابعة، ضعيف.',
      `<div class="field"><label>البرنامج</label><select class="inp" id="r3p">${progOpts}</select></div><div class="field"><label>الشهر</label><select class="inp" id="r3m">${months.map(x=>`<option value="${x}">${fmtMonth(x)}</option>`).join('')}</select></div>`,
      `<button class="btn pri" id="r3">${ic('form')} معاينة الطباعة</button><button class="btn" id="r3all">كل البرامج المنعقدة</button>`)}
    ${card(4,'grid','early','سجل الدفعة الكامل','جدول أفقي بكل أيام الدفعة وحالة كل متدرب في كل يوم ونسبته، مناسب للأرشفة بعد انتهاء الدفعة.',
      `<div class="field"><label>الدفعة</label><select class="inp" id="r4c">${cohOpts}</select></div>`,
      `<button class="btn pri" id="r4">${ic('form')} معاينة الطباعة</button><button class="btn" id="r4s">ملخص نسب الحضور</button><button class="btn" id="r4x">${ic('copy')} Excel</button>`)}
    ${card(5,'book','info','دليل البرامج المعتمدة','قائمة البرامج حسب المجال بأرقام الاعتماد والساعات والأيام والرسوم والدفعة الحالية.','',
      `<button class="btn pri" id="r5">${ic('form')} معاينة الطباعة</button>`)}
    ${card(7,'award','gold','شهادات الإتمام','الشهادات الصادرة للدفعات المؤرشفة، بخاتم الحضور وباركود التحقق.',
      `<div class="field"><label>الدفعة</label><select class="inp" id="r7c">${AD.cohorts.filter(c=>(AD.certificates||[]).some(x=>x.cohort_id===c.id&&!x.revoked)).map(c=>`<option value="${c.id}">${esc(short(progName(c.program_id)))} · ${cohortLabel(c)} · ${fmtNum((AD.certificates||[]).filter(x=>x.cohort_id===c.id&&!x.revoked).length)} شهادة</option>`).join('')||'<option value="">لا توجد شهادات صادرة بعد</option>'}</select></div>`,
      `<button class="btn pri" id="r7">${ic('form')} طباعة الشهادات</button>`)}
    ${card(6,'database','warning','تصدير البيانات إلى Excel','ملفات CSV تفتح في Excel مباشرة بالعربية.',
      `<div class="field"><label>سجل الحضور من</label><div style="display:flex;gap:8px"><input type="date" class="inp" id="r6f" value="${addDays(today,-29)}"><input type="date" class="inp" id="r6t" value="${today}"></div></div>`,
      `<button class="btn" id="r6a">${ic('copy')} سجل الحضور للفترة</button><button class="btn" id="r6b">${ic('users')} المتدربون وتسجيلاتهم</button>`)}
  </div>`;
  const fillDay=()=>{ const d=$('#r1d').value, cs=AD.cohorts.filter(c=>isSessionDay(c,d)&&d<=today);
    $('#r1c').innerHTML = cs.length ? `<option value="all">كل دفعات اليوم (${fmtNum(cs.length)})</option>`+cs.map(c=>`<option value="${c.id}">${esc(short(progName(c.program_id)))} · ${cohortLabel(c)}</option>`).join('') : '<option value="">لا توجد محاضرات في هذا اليوم</option>';
    $('#r1').disabled=!cs.length; };
  const wkTxt=()=>{ const w=weekOf($('#r2d').value); $('#r2h').textContent=`الأسبوع: ${fmtGreg(w.from)} – ${fmtGreg(w.to)}`; };
  $('#r1d').onchange=fillDay; fillDay(); $('#r2d').onchange=wkTxt; wkTxt();
  const overl=(pid,f,t)=>AD.cohorts.filter(c=>(!pid||c.program_id===pid)&&c.start_date<=t&&c.end_date>=f&&c.start_date<=today).sort((a,b)=>a.number-b.number);
  $('#r1').onclick=()=>{ const d=$('#r1d').value, v=$('#r1c').value, cs=v==='all'?AD.cohorts.filter(c=>isSessionDay(c,d)):[AD.cohorts.find(c=>c.id===v)]; printSheets(cs.map(c=>({c,date:d})), `كشوف حضور ${fmtDate(d)}`); };
  const sumRun=(pid,f,t,kind,title)=>{ const cs=overl(pid,f,t); if(!cs.length) return toast('لم تنعقد دفعات في هذه الفترة'); printDocs(cs.map(c=>summaryHtml(c,f,t,kind)), title); };
  $('#r2').onclick=()=>{ const w=weekOf($('#r2d').value); sumRun($('#r2p').value,w.from,w.to,'week',`الملخص الأسبوعي · ${progName($('#r2p').value)}`); };
  $('#r2all').onclick=()=>{ const w=weekOf($('#r2d').value); sumRun(null,w.from,w.to,'week',`الملخص الأسبوعي · كل البرامج`); };
  $('#r3').onclick=()=>{ const mm=monthOf($('#r3m').value); sumRun($('#r3p').value,mm.from,mm.to,'month',`الملخص الشهري · ${progName($('#r3p').value)}`); };
  $('#r3all').onclick=()=>{ const mm=monthOf($('#r3m').value); sumRun(null,mm.from,mm.to,'month',`الملخص الشهري · كل البرامج`); };
  const selC=()=>AD.cohorts.find(c=>c.id===$('#r4c').value);
  $('#r4').onclick=()=>{ const c=selC(); if(c) printDocs([fullSheetHtml(c)], `${progName(c.program_id)} · ${cohortLabel(c)}`); };
  $('#r4s').onclick=()=>{ const c=selC(); if(c) printDocs([summaryHtml(c,c.start_date,c.end_date,'cohort')], `${progName(c.program_id)} · ${cohortLabel(c)}`); };
  $('#r4x').onclick=()=>{ const c=selC(); if(c) exportCSV(`سجل-${progCode(progOf(c.program_id))}-الدفعة${c.number}`, cohortRows(c)); };
  $('#r5').onclick=()=>printDocs([catalogHtml()],'دليل البرامج المعتمدة');
  $('#r7').onclick=()=>{ const id=$('#r7c').value; if(!id) return toast('لا توجد شهادات صادرة بعد'); const c=AD.cohorts.find(x=>x.id===id); printCertificates((AD.certificates||[]).filter(x=>x.cohort_id===id&&!x.revoked), `شهادات ${progName(c.program_id)} · ${cohortLabel(c)}`); };
  $('#r6a').onclick=()=>exportCSV(`سجل-الحضور-${$('#r6f').value}-${$('#r6t').value}`, attendanceRows($('#r6f').value,$('#r6t').value));
  $('#r6b').onclick=()=>exportCSV('المتدربون-وتسجيلاتهم', traineesRows());
}
