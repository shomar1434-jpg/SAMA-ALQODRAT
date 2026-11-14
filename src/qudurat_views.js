/* =====================================================================
   واجهات باقات القدرات والتحصيلي: الشريط العام، صفحة الباقة، ولوحة الإدارة.
   ===================================================================== */
import { planPoster, COMPARE_ART } from './plan_art.js';
import { $, $$, esc, fmtNum, fmtDate, fmtShort, riyadhNow, t12, addDays, validSaudiId, DAYS, matchQ } from './utils.js';
import { ic, emptyBox, ringSvg, toast, countUp } from './views2_head.js';
import { Store } from './data2.js';
import { sectionDaysTxt } from './data2.js';
import { TIERS, MODES, DURATION_TXT, planTotal, planName, planOpen, SECTIONS, SUB_STATUS, SUB_TONE, EXC_TXT, subStats, subStatus, sessionOn, sessionsBetween, sectionOfGender, priorSessions } from './qudurat.js';
import { initMarquee } from './marquee.js';
import { regFormHtml, bindRegForm, titleBar, kpiCard } from './views2_main.js';
import { siteFooter } from './landing.js';
import { modal, closeModal, confirmBox } from './views2_programs.js';
import { receiveModal } from './billing_views.js';
import { AD, reloadAD } from './views2_admin.js';
import { setBusy, toLatin } from './features.js';
import { shrinkImage } from './partners.js';
import { exportCSV } from './print.js';
import { absenceModal } from './absence_notify.js';

const TIER_TONE = { basic:'basic', silver:'silver', gold:'gold', diamond:'diamond', custom:'custom' };
const priceLine = p => p.tier === 'custom' && p.installments === 1 ? `على دفعتين: ${fmtNum(p.reg_fee)} ريال كل شهر` : p.installments ? `${fmtNum(p.reg_fee)} تسجيل + ${fmtNum(p.installments)} ${p.installments === 2 ? 'قسطان' : 'أقساط'} × ${fmtNum(p.installment_amount)}` : `${fmtNum(p.reg_fee)} ريال`;
const planHref = p => `#plan-${p.id}`;

/* =====================================================================
   1) الصفحة الرئيسية: شريط الباقات المتحرك (D-07: عن بُعد = «قريبًا»)
   ===================================================================== */
export function plansSectionHtml(plans){
  if(!plans?.length) return '';
  return `<section class="plans" aria-labelledby="plTitle" id="plans">
    <div class="sec-head" data-reveal><span class="kicker">القدرات والتحصيلي</span><h2 id="plTitle">باقات <em>القدرات والتحصيلي</em></h2>
      <p class="hint" style="margin:8px 0 0">اسحب الشريط أو استخدم الأزرار. الاشتراك يبدأ من أول يوم تحضر فيه.</p>
      <p style="margin:12px 0 0"><button class="btn sm" id="plCompare">${ic('grid')} قارن بين الباقات</button></p></div>
    <div class="pl-filter" role="group" aria-label="نوع الحضور" data-reveal>
      <button class="chip on" data-mode="in_person" aria-pressed="true">${ic('users')} حضوري</button>
      <button class="chip" data-mode="remote" aria-pressed="false">${ic('tv')} عن بُعد <span class="soon-tag">قريبًا</span></button></div>
    <div data-reveal><div class="mq" id="plMq">
      <button class="pt-nav" data-mq="prev" aria-label="الباقة السابقة">${ic('prev')}</button>
      <div class="mq-view" role="region" aria-roledescription="شريط منزلق" aria-label="باقات القدرات والتحصيلي" tabindex="0"><div class="mq-track"></div></div>
      <button class="pt-nav" data-mq="next" aria-label="الباقة التالية">${ic('next')}</button>
      <button class="mq-toggle" data-mq="toggle" aria-pressed="false" aria-label="إيقاف الحركة"><span class="i-pause">${PAUSE}</span><span class="i-play">${PLAY}</span></button>
    </div></div></section>`;
}
const PAUSE = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';

export function planCard(p, clone){
  const soon = p.mode === 'remote' || p.status === 'coming_soon', closed = !soon && !planOpen(p) && p.id !== 'custom';
  const hide = clone ? 'aria-hidden="true" tabindex="-1"' : '';
  if(p.id === 'custom') return `<button class="pl-card t-custom" data-mq-id="${p.id}" ${hide} aria-label="الباقة المخصصة: اطلب عرضًا">
    <span class="pl-tier">${ic('spark')} المخصصة</span><b class="pl-name">باقة مخصصة</b><p class="pl-sum">حدد احتياجك: البرنامج والمستوى والمقررات والأوقات، ونرسل لك عرضًا من إدارة المعهد.</p>
    <span class="pl-cta">اطلب عرضًا ${ic('next')}</span></button>`;
  return `<button class="pl-card t-${TIER_TONE[p.tier]}${soon ? ' soon' : ''}" data-mq-id="${p.id}" ${hide} ${soon ? 'aria-disabled="true"' : ''} aria-label="${esc(planName(p))}${soon ? '، قريبًا' : ''}">
    ${soon ? '<span class="soon-ribbon">قريبًا</span>' : ''}
    ${p.image ? `<span class="pl-img"><img src="${p.image}" alt="" draggable="false"></span>` : ''}
    <span class="pl-tier">${ic('award')} ${esc(TIERS[p.tier])} · ${esc(MODES[p.mode])}</span>
    <b class="pl-name">${esc(p.name)}</b>
    <span class="pl-meta"><span>${ic('calendar')}${DURATION_TXT(p)}</span><span>${ic('hourglass')}${fmtNum(p.hours)} ساعة</span></span>
    <p class="pl-sum">${esc(p.summary || '')}</p>
    <span class="pl-price"><b>${fmtNum(planTotal(p))}</b> ريال <small>${priceLine(p)}</small></span>
    <span class="pl-cta">${soon ? 'تُتاح قريبًا' : closed ? 'التسجيل مغلق' : 'التفاصيل والتسجيل'} ${soon ? '' : ic('next')}</span></button>`;
}

export function initPlansMarquee(plans){
  if(!$('#plMq')) return;
  const custom = { id:'custom', tier:'custom', name:'المخصصة' };
  if($('#plCompare')) $('#plCompare').onclick = () => compareModal($('.pl-filter .chip.on')?.dataset.mode || 'in_person');
  const render = mode => {
    const list = plans.filter(p => p.mode === mode && p.active !== false).sort((a, b) => a.sort - b.sort).concat(mode === 'in_person' && !plans.some(p => p.tier === 'custom' && p.mode === mode && p.active !== false) ? [custom] : []);
    const old = $('#plMq'), fresh = old.cloneNode(true); old.replaceWith(fresh);      // تصفير مستمعي الشريط السابق
    initMarquee(fresh, list, planCard, (p, el) => {
      if(!p) return;
      if(p.id === 'custom') return customRequestModal();
      if(p.mode === 'remote' || p.status === 'coming_soon'){ toast('هذه الباقة تُتاح قريبًا'); el?.animate?.([{ transform:'translateX(0)' }, { transform:'translateX(-6px)' }, { transform:'translateX(6px)' }, { transform:'translateX(0)' }], { duration:300 }); return; }
      location.hash = planHref(p);
    });
  };
  render('in_person');
  $$('.pl-filter .chip').forEach(b => b.onclick = () => { $$('.pl-filter .chip').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); }); render(b.dataset.mode); });
}

/* طلب باقة مخصصة: يُرسل للمراجعة ولا يُعتمد سعر أو موعد قبل موافقة الإدارة */
/* التصاميم التعريفية للباقات ونموذجا المقارنة (من مطويات المركز): تكبير في نافذة */
export function posterModal(src, title){
  modal(`<h3>${esc(title)}</h3><div class="pl-zoom"><img src="${src}" alt="${esc(title)}"></div><div style="text-align:end;margin-top:12px"><a class="btn sm" href="${src}" target="_blank" rel="noopener">${ic('search')} فتح بالحجم الكامل</a> <button class="btn" id="pzX">إغلاق</button></div>`);
  $('#pzX').onclick = closeModal;
}
export function compareModal(mode = 'in_person'){
  const tab = m => `<button class="tab" role="tab" data-cm="${m}" aria-selected="${m === mode}">${ic(m === 'remote' ? 'tv' : 'users')}${m === 'remote' ? 'عن بُعد' : 'حضوري'}</button>`;
  modal(`<h3>مقارنة بين الباقات</h3><p class="hint" style="margin:-4px 0 10px">نموذج توضيحي من مركز سما القدرات لما تشمله كل باقة ورسومها. باقة «خصصناها لك» لها تصميمها المستقل.</p>
    <div class="tabs" role="tablist" style="margin-bottom:10px">${tab('in_person')}${tab('remote')}</div>
    <div class="pl-zoom"><img id="cmImg" src="${COMPARE_ART[mode]}" alt="جدول مقارنة الباقات الأساسية والفضية والذهبية والماسية (${mode === 'remote' ? 'عن بُعد' : 'حضوري'})"></div>
    <div style="text-align:end;margin-top:12px"><button class="btn" id="pzX">إغلاق</button></div>`);
  $('#pzX').onclick = closeModal;
  $$('[data-cm]').forEach(b => b.onclick = () => { $$('[data-cm]').forEach(x => x.setAttribute('aria-selected', x === b)); $('#cmImg').src = COMPARE_ART[b.dataset.cm]; });
}

export function customRequestModal(){
  modal(`<h3>طلب باقة مخصصة</h3><p class="hint" style="margin:-4px 0 14px">نراجع طلبك ونتواصل معك بعرض مناسب. لا يُعتمد السعر أو الموعد قبل موافقة إدارة المعهد.</p>
    <form id="crF" class="grid g2" novalidate>
      <div class="field" style="grid-column:1/-1"><label for="cr-name">الاسم <i>*</i></label><input class="inp" id="cr-name" name="name" maxlength="80"></div>
      <div class="field"><label for="cr-phone">الجوال <i>*</i></label><input class="inp num" id="cr-phone" name="phone" inputmode="numeric" maxlength="10" dir="ltr" placeholder="05XXXXXXXX"></div>
      <div class="field"><label for="cr-program">البرنامج</label><select class="inp" id="cr-program" name="program"><option>القدرات</option><option>التحصيلي</option><option>القدرات والتحصيلي</option></select></div>
      <div class="field"><label for="cr-section">القسم</label><select class="inp" id="cr-section" name="section"><option value="boys">البنون</option><option value="girls">البنات</option></select></div>
      <div class="field"><label for="cr-mode">نوع الحضور</label><select class="inp" id="cr-mode" name="mode"><option value="in_person">حضوري</option><option value="remote">عن بُعد</option></select></div>
      <div class="field" style="grid-column:1/-1"><label for="cr-notes">الاحتياج: المقررات، والمستوى، والأوقات المفضلة، والمدة</label><textarea class="inp" id="cr-notes" name="notes" rows="3" maxlength="600" style="padding:10px 14px;line-height:1.8"></textarea></div>
      <div class="errtxt" id="crE" style="grid-column:1/-1"></div>
      <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="crC">إلغاء</button><button class="btn pri" id="crS">${ic('check')} إرسال الطلب</button></div></form>`);
  $('#crC').onclick = closeModal;
  $('#cr-phone').addEventListener('input', e => e.target.value = toLatin(e.target.value).replace(/\D/g, ''));
  $('#crF').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    if(f.name.trim().split(/\s+/).length < 2) return $('#crE').textContent = 'اكتب الاسم الثنائي على الأقل.';
    if(!/^05\d{8}$/.test(f.phone)) return $('#crE').textContent = 'رقم الجوال 10 أرقام يبدأ بـ 05.';
    const b = $('#crS'); setBusy(b, true, 'جارٍ الإرسال');
    try { await Store.requestCustomPlan(f); closeModal(); toast('وصل طلبك، وسنتواصل معك قريبًا'); } catch(x){ setBusy(b, false); $('#crE').textContent = x.message; } };
}

/* =====================================================================
   2) صفحة الباقة والتسجيل
   ===================================================================== */
export async function viewPlanPage(id){
  const app = $('#app'); let data;
  try { data = await Store.publicPlans(); } catch(e){ app.innerHTML = `<div class="wrap">${emptyBox('تعذّر تحميل الباقة', esc(e.message))}</div>`; return; }
  const p = data.plans.find(x => x.id === id);
  if(!p){ app.innerHTML = `<div class="wrap">${emptyBox('الباقة غير موجودة', 'تحقق من الرابط.')}<div style="text-align:center;margin-top:14px"><a class="btn pri" href="#home">${ic('book')} الباقات</a></div></div>${siteFooter()}`; return; }
  const soon = p.mode === 'remote' || p.status === 'coming_soon', D = { schedule_templates:data.schedule };
  const sched = s => `<div class="pl-sched"><b>${SECTIONS[s]}</b><span>${esc(sectionDaysTxt(D, s))}</span></div>`;
  app.innerHTML = `<div class="wrap">
    <section class="hero pl-hero t-${TIER_TONE[p.tier]} rv"><div style="flex:1;min-width:0">
      <span class="hero-pill">${ic('award')}${esc(TIERS[p.tier])} · ${esc(MODES[p.mode])}${soon ? ' · قريبًا' : ''}</span>
      <h1>${esc(p.name)}</h1><p>${esc(p.summary || '')}${p.audience ? ` ${esc(p.audience)}.` : ''}</p>
      <ul class="stats" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
        <li>${ic('calendar')}<b style="font-size:20px">${DURATION_TXT(p)}</b><span>من أول يوم حضور</span></li>
        <li>${ic('hourglass')}<b>${fmtNum(p.hours)}</b><span>ساعة تدريبية</span></li>
        <li>${ic('wallet')}<b>${fmtNum(planTotal(p))}</b><span>${priceLine(p)}</span></li>
        <li>${ic('grid')}<b style="font-size:20px">${fmtNum(3)} أيام</b><span>أسبوعيًا · ساعتان للجلسة</span></li></ul></div>
      ${p.image ? `<div class="pl-hero-img"><img src="${p.image}" alt="${esc(p.name)}"></div>` : ''}</section>
    ${planPoster(p.tier) ? `<div class="card pad rv pl-art" style="margin-top:18px"><div><h3 class="ctitle">${ic('award')}تعريف الباقة</h3>
        <p class="hint" style="margin:0 0 12px">التصميم التعريفي للباقة من مركز سما القدرات: المدة والرسوم والأقساط وما تشمله. اضغط الصورة لتكبيرها.</p>
        <p style="margin:0;display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm" id="plZoom">${ic('search')} تكبير التصميم</button><button class="btn sm" id="plCompare">${ic('grid')} قارن بين الباقات</button></p></div>
      <button class="pl-poster" id="plPoster" aria-label="تكبير التصميم التعريفي لباقة ${esc(p.name)}"><img src="${planPoster(p.tier)}" alt="التصميم التعريفي لباقة ${esc(p.name)}: ${esc(DURATION_TXT(p))}، ${fmtNum(planTotal(p))} ريال ${esc(priceLine(p))}" loading="lazy" width="1024" height="1536"></button></div>` : ''}
    <div class="grid g2" style="margin-top:18px;align-items:start">
      <div class="card pad rv" style="--i:1"><h3 class="ctitle">${ic('check')}مزايا الباقة</h3><ul class="pl-feats">${(p.features || []).map(f => `<li>${ic('check')}${esc(f)}</li>`).join('')}</ul></div>
      <div class="card pad rv" style="--i:2"><h3 class="ctitle">${ic('clock')}المواعيد</h3>${sched('girls')}${sched('boys')}
        <p class="hint" style="margin:10px 0 0">تُحدَّد مواعيدك حسب القسم (بنين أو بنات) من بيانات تسجيلك. يبدأ اشتراكك من أول يوم تحضر فيه بالباركود، وأيام الغياب تُحتسب من مدة الباقة.</p></div></div>
    <div id="plReg" style="margin-top:18px"></div></div>${siteFooter()}`;
  if($('#plPoster')){ const z = () => posterModal(planPoster(p.tier), 'باقة ' + p.name); $('#plPoster').onclick = z; $('#plZoom').onclick = z; $('#plCompare').onclick = () => compareModal(p.mode); }
  const box = $('#plReg');
  if(soon){ box.innerHTML = `<div class="card pad rv" style="text-align:center">${emptyBox('تُتاح قريبًا', 'التسجيل في باقات الحضور عن بُعد سيُفتح قريبًا. يمكنك التسجيل الآن في الباقة الحضورية المماثلة.')}</div>`; return; }
  if(!planOpen(p)){ box.innerHTML = emptyBox('التسجيل مغلق حاليًا', 'تواصل مع المركز لمعرفة موعد فتح التسجيل.'); return; }
  box.innerHTML = regFormHtml(`الاشتراك في ${p.name}`, 'يبدأ اشتراكك من أول يوم تحضر فيه');
  bindRegForm({ plan_id:p.id }, () => []);
}

/* =====================================================================
   3) لوحة الإدارة: الاشتراكات، والباقات، والجدول، والطلبات
   ===================================================================== */
let qTab = 'subs', qf = { plan:'all', section:'all', status:'live', q:'' };
export function pageQudurat(){
  const m = $('#main'), D = AD, n = riyadhNow();
  const subs = D.subscriptions || [], live = subs.filter(s => ['pending', 'active'].includes(subStatus(s, n.date)));
  const todayAtt = (D.sub_attendance || []).filter(a => a.att_date === n.date);
  const ending = live.filter(s => s.end_date && s.end_date <= addDays(n.date, 7));
  const tabs = [['subs', 'users', 'المشتركون'], ['today', 'calendar', 'حضور اليوم'], ['plans', 'award', 'الباقات'], ['schedule', 'clock', 'الجدول والاستثناءات'], ['requests', 'form', 'طلبات مخصصة']];
  m.innerHTML = titleBar(`${ic('award')}القدرات والتحصيلي`, 'باقات <em>القدرات والتحصيلي</em>', 'الاشتراكات تبدأ من أول حضور بالباركود. أضف المتدربين الحاليين بتاريخ بدايتهم الفعلي.',
    `<button class="btn pri sm" id="qAdd">${ic('plus')} مشترك</button><button class="btn sm" id="qImp">${ic('copy')} استيراد قائمة</button><a class="btn sm" href="#qr-checkin">${ic('qr')} الباركود الموحد</a>`) +
    `<div class="kpis" style="grid-template-columns:repeat(4,1fr)">
      ${kpiCard(0, 'users', 'info', 'اشتراكات قائمة', live.length, '', `${fmtNum(live.filter(s => !s.start_date).length)} بانتظار أول حضور`)}
      ${kpiCard(1, 'check', 'success', 'حضور اليوم', new Set(todayAtt.map(a => a.subscription_id)).size, '', fmtDate(n.date))}
      ${kpiCard(2, 'timer', 'gold', 'تنتهي خلال 7 أيام', ending.length, '', 'اشتراكات قاربت نهايتها')}
      ${kpiCard(3, 'award', 'early', 'الباقات المتاحة', (D.plans || []).filter(planOpen).length, '', `من ${fmtNum((D.plans || []).length)} باقة`)}</div>
    ${deviceAlerts(D, n)}
    <div class="tabs" role="tablist" style="margin:16px 0">${tabs.map(([k, i, l]) => `<button class="tab" role="tab" data-qt="${k}" aria-selected="${qTab === k}">${ic(i)}${l}${k === 'requests' && (D.custom_requests || []).filter(r => r.status === 'new').length ? ` <span class="badge-n">${fmtNum((D.custom_requests || []).filter(r => r.status === 'new').length)}</span>` : ''}</button>`).join('')}</div>
    <div id="qBody"></div>`;
  countUp(m);
  $$('[data-qt]').forEach(b => b.onclick = () => { qTab = b.dataset.qt; pageQudurat(); });
  $('#qAdd').onclick = () => subModal();
  $('#qImp').onclick = importModal;
  ({ subs:tabSubs, today:tabToday, plans:tabPlans, schedule:tabSchedule, requests:tabRequests })[qTab]();
}

/* تنبيه التحضير بالنيابة: أكثر من متدرب من الجهاز نفسه اليوم */
function deviceAlerts(D, n){
  const ok = (D.checkin_attempts || []).filter(a => a.date === n.date && ['ok', 'already'].includes(a.result) && a.device && a.trainee_hint);
  const by = {}; ok.forEach(a => { (by[a.device] = by[a.device] || new Set()).add(a.trainee_hint); });
  const sus = Object.entries(by).filter(([, s]) => s.size > 1);
  if(!sus.length) return '';
  const names = id => D.trainees.find(t => t.id === id)?.full_name || '—';
  return `<div class="alert t-warning rv" style="margin-top:14px"><span class="aic">${ic('alert')}</span><div><b style="font-weight:600">تحضير متعدد من جهاز واحد اليوم</b>
    <p style="margin:4px 0 0">${sus.map(([d, s]) => `جهاز …${esc(d.slice(-4))}: ${[...s].map(id => esc(names(id))).join('، ')}`).join('<br>')}</p>
    <p class="hint" style="margin:4px 0 0">قد يكون متدرب حضّر عن زملائه. راجع الحضور الفعلي في القاعة.</p></div></div>`;
}

function filteredSubs(D, n){
  const q = qf.q.trim();
  return (D.subscriptions || []).filter(s => {
    const st = subStatus(s, n.date), t = D.trainees.find(x => x.id === s.trainee_id);
    if(qf.plan !== 'all' && s.plan_id !== qf.plan) return false;
    if(qf.section !== 'all' && s.section !== qf.section) return false;
    if(qf.status === 'live' && !['pending', 'active'].includes(st)) return false;
    if(!['all', 'live'].includes(qf.status) && st !== qf.status) return false;
    if(!matchQ(q, t?.full_name, t?.national_id, t?.phone, s.ref)) return false;
    return true;
  });
}
function tabSubs(){
  const D = AD, n = riyadhNow(), body = $('#qBody');
  const rows = filteredSubs(D, n).map(s => ({ s, t:D.trainees.find(x => x.id === s.trainee_id), st:subStats(D, s, n) }))
    .sort((a, b) => (a.t?.full_name || '').localeCompare(b.t?.full_name || '', 'ar'));
  body.innerHTML = `<div class="card pad rv"><div class="filters" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
      <input class="inp" id="qq" placeholder="بحث بالاسم أو السجل أو الجوال" value="${esc(qf.q)}" style="flex:1;min-width:200px" aria-label="بحث">
      <select class="inp" id="qp" aria-label="الباقة" style="width:auto"><option value="all">كل الباقات</option>${(D.plans || []).map(p => `<option value="${p.id}" ${qf.plan === p.id ? 'selected' : ''}>${esc(planName(p))}</option>`).join('')}</select>
      <select class="inp" id="qs" aria-label="القسم" style="width:auto"><option value="all">البنون والبنات</option>${Object.entries(SECTIONS).map(([k, v]) => `<option value="${k}" ${qf.section === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select class="inp" id="qst" aria-label="الحالة" style="width:auto">${[['live', 'القائمة'], ['all', 'الكل'], ...Object.entries(SUB_STATUS)].map(([k, v]) => `<option value="${k}" ${qf.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="btn sm" id="qx">${ic('copy')} Excel</button></div>
    ${rows.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>المتدرب</th><th>الباقة</th><th>القسم</th><th>الحالة</th><th>البداية – النهاية</th><th>الحضور</th><th>المدة</th><th></th></tr></thead><tbody>
      ${rows.map(({ s, t, st }) => `<tr><td><b style="font-weight:500">${esc(t?.full_name || '—')}</b><div class="hint" dir="ltr" style="text-align:right">${esc(t?.national_id || '')}</div></td>
        <td>${esc(planName(st.plan))}</td><td>${SECTIONS[s.section]}</td><td><span class="pill dot ${SUB_TONE[st.status]}">${SUB_STATUS[st.status]}</span>${s.start_manual ? '<div class="hint">بداية يدوية</div>' : ''}</td>
        <td class="num">${s.start_date ? `${fmtShort(s.start_date)} – ${fmtShort(st.end)}` : '—'}</td>
        <td>${st.rate == null ? '<span class="hint">—</span>' : `<b class="num">${fmtNum(st.rate)}٪</b><div class="hint">${fmtNum(st.attended)} من ${fmtNum(st.held)}</div>`}</td>
        <td style="min-width:110px">${s.start_date ? `<div class="tbar" role="img" aria-label="مضى ${fmtNum(st.timePct)}٪ من المدة"><i style="width:${st.timePct}%"></i></div><div class="hint">${fmtNum(st.daysLeft)} يومًا متبقية</div>` : '<span class="hint">لم تبدأ</span>'}</td>
        <td style="white-space:nowrap"><button class="btn sm" data-sv="${s.id}" title="سجل الحضور" aria-label="سجل حضور ${esc(t?.full_name || '')}">${ic('calendar')} السجل</button> <button class="btn sm" data-se="${s.id}" title="تعديل الاشتراك" aria-label="تعديل اشتراك ${esc(t?.full_name || '')}">${ic('edit')} تعديل</button></td></tr>`).join('')}
      </tbody></table></div>` : emptyBox('لا توجد اشتراكات مطابقة', 'غيّر عوامل التصفية أو أضف مشتركًا.')}</div>`;
  let tmr; $('#qq').oninput = e => { qf.q = e.target.value; clearTimeout(tmr); tmr = setTimeout(() => { tabSubs(); const el = $('#qq'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
  $('#qp').onchange = e => { qf.plan = e.target.value; tabSubs(); };
  $('#qs').onchange = e => { qf.section = e.target.value; tabSubs(); };
  $('#qst').onchange = e => { qf.status = e.target.value; tabSubs(); };
  $('#qx').onclick = () => exportCSV('مشتركو-الباقات', [['الاسم', 'السجل المدني', 'الجوال', 'الباقة', 'القسم', 'الحالة', 'البداية', 'النهاية', 'الجلسات المنعقدة', 'الحضور', 'التأخر', 'الغياب', 'نسبة الحضور', 'الأيام المتبقية'],
    ...rows.map(({ s, t, st }) => [t?.full_name, t?.national_id, t?.phone, planName(st.plan), SECTIONS[s.section], SUB_STATUS[st.status], s.start_date || '', st.end || '', st.held, st.attended, st.late, st.absent, st.rate ?? '', st.daysLeft ?? ''])]);
  $$('[data-sv]').forEach(b => b.onclick = () => subDetail(b.dataset.sv));
  $$('[data-se]').forEach(b => b.onclick = () => subModal((AD.subscriptions || []).find(s => s.id === b.dataset.se)));
}

/* كشف اليوم لكل قسم: من حضر، ومن تأخر، ومن لم يسجل بعد */
let tdQ = '', tdSt = 'all';   // بحث وتصفية «حضور اليوم»
function tabToday(){
  const D = AD, n = riyadhNow(), body = $('#qBody');
  const pass = (t, a) => matchQ(tdQ, t?.full_name, t?.national_id, t?.phone) && (tdSt === 'all' || (tdSt === 'present' ? !!a : !a));
  body.innerHTML = `<div class="filters" style="margin-bottom:12px"><label class="sr-only" for="tdq">بحث</label><input class="inp" id="tdq" type="search" placeholder="بحث بالاسم أو السجل المدني أو الجوال" value="${esc(tdQ)}" style="flex:1;min-width:200px" autocomplete="off">
    <label class="sr-only" for="tds">الحالة</label><select class="inp" id="tds">${[['all', 'الكل'], ['present', 'الحاضرون'], ['absent', 'لم يحضروا']].map(([k, v]) => `<option value="${k}" ${tdSt === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>` + Object.keys(SECTIONS).map((sec, i) => {
    const ses = sessionOn(D, sec, n.date);
    const list = (D.subscriptions || []).filter(s => s.section === sec && ['pending', 'active'].includes(subStatus(s, n.date)))
      .map(s => ({ s, t:D.trainees.find(x => x.id === s.trainee_id), a:(D.sub_attendance || []).find(a => a.subscription_id === s.id && a.att_date === n.date) }));
    const shown = list.filter(x => pass(x.t, x.a)), done = ses && n.hm >= ses.end;
    return `<div class="card pad rv" style="--i:${i};margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <h3 class="ctitle">${ic('users')}${SECTIONS[sec]}</h3><span style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="pill ${ses ? 'info' : 'g'}">${ses ? `جلسة اليوم ${t12(ses.start)} – ${t12(ses.end)}` : 'لا توجد جلسة اليوم'}</span>${ses && n.hm >= ses.start ? `<button class="btn sm" data-abs="${sec}:${done ? 1 : 0}">${ic('send')} إبلاغ أولياء أمور الغائبين</button>` : ''}</span></div>
      ${!ses ? '' : list.length ? `${shown.length !== list.length ? `<p class="hint" style="margin:0 0 8px">${fmtNum(shown.length)} من ${fmtNum(list.length)} حسب البحث</p>` : ''}<div class="tblwrap"><table class="tb"><thead><tr><th>المتدرب</th><th>الباقة</th><th>الحالة</th><th>وقت الحضور</th><th>تعديل</th></tr></thead><tbody>
        ${shown.sort((a, b) => (a.t?.full_name || '').localeCompare(b.t?.full_name || '', 'ar')).map(({ s, t, a }) => `<tr><td>${esc(t?.full_name || '—')}</td><td>${esc(planName(D.plans.find(p => p.id === s.plan_id)))}</td>
          <td>${a ? `<span class="pill dot ${a.status === 'متأخر' ? 'warn' : 'ok'}">${a.status}</span>${a.manual ? ' <span class="hint">يدوي</span>' : ''}` : `<span class="pill dot ${done ? 'bad' : 'g'}">${done ? 'غائب' : 'لم يسجل بعد'}</span>`}</td>
          <td class="num">${a ? t12(a.time.slice(0, 5)) : '—'}</td>
          <td style="white-space:nowrap"><button class="btn sm" data-mk="${s.id}" data-st="حاضر">حاضر</button> <button class="btn sm" data-mk="${s.id}" data-st="متأخر">متأخر</button>${a ? ` <button class="btn sm danger soft" data-mk="${s.id}" data-st="">إلغاء</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>` : emptyBox('لا يوجد مشتركون في هذا القسم')}</div>`; }).join('');
  let tdT; $('#tdq').oninput = e => { tdQ = e.target.value; clearTimeout(tdT); tdT = setTimeout(() => { tabToday(); const el = $('#tdq'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
  $('#tds').onchange = e => { tdSt = e.target.value; tabToday(); };
  $$('[data-abs]').forEach(b => b.onclick = () => { const [sec, e] = b.dataset.abs.split(':'); absenceModal(AD, 'pkg', sec, riyadhNow().date, e === '1'); });
  $$('[data-mk]').forEach(b => b.onclick = async () => { await Store.setSubAttendance(b.dataset.mk, riyadhNow().date, b.dataset.st || null); await reloadAD(); toast('حُدّث الحضور'); tabToday(); });
}

/* سجل اشتراك: الأيام المنعقدة مع الحضور، وتعديل يدوي موثّق */
function subDetail(id){
  const D = AD, n = riyadhNow(), s = (D.subscriptions || []).find(x => x.id === id); if(!s) return;
  const t = D.trainees.find(x => x.id === s.trainee_id), st = subStats(D, s, n);
  const days = s.start_date ? sessionsBetween(D, s.section, s.start_date, st.end) : [];
  modal(`<h3>${esc(t?.full_name || '')}</h3><p class="hint" style="margin:-4px 0 12px">${esc(planName(st.plan))} · ${SECTIONS[s.section]} · <span class="pill dot ${SUB_TONE[st.status]}">${SUB_STATUS[st.status]}</span></p>
    ${s.start_date ? `<div class="sub-kpis">
      <div>${ringSvg(st.rate ?? 0, 64, 6, (st.rate ?? 100) < 75 ? 'warning' : 'success')}<span>الحضور</span></div>
      <div><b class="num">${fmtNum(st.attended)}</b><span>حضور</span></div><div><b class="num">${fmtNum(st.late)}</b><span>تأخر</span></div><div><b class="num">${fmtNum(st.absent)}</b><span>غياب</span></div>
      <div><b class="num">${fmtNum(st.remaining)}</b><span>جلسة متبقية</span></div><div><b class="num">${fmtNum(st.daysLeft)}</b><span>يومًا للنهاية</span></div></div>
      <div class="tbar big" role="img" aria-label="مضى ${fmtNum(st.timePct)}٪ من مدة الباقة"><i style="width:${st.timePct}%"></i></div>
      <p class="hint" style="margin:6px 0 12px">من ${fmtDate(s.start_date)} إلى ${fmtDate(st.end)}${s.start_manual ? ' (تاريخ بداية أدخلته الإدارة)' : ''}</p>
      <div class="daygrid">${days.map(d => { const a = st.att.find(x => x.att_date === d.date), fut = d.date > n.date;
        const pre = !a && s.track_from && d.date < s.track_from, cls = a ? (a.status === 'متأخر' ? 'late' : 'ok') : pre ? 'pre' : fut ? 'fut' : 'abs', lbl = a ? a.status : pre ? 'قبل المنصة (من الكشف اليدوي)' : fut ? 'قادمة' : 'غائب';
        return `<button class="dg ${cls}" ${fut ? 'disabled' : ''} data-dd="${d.date}" title="${fmtDate(d.date)} · ${lbl}" aria-label="${fmtDate(d.date)}: ${lbl}"><span>${fmtShort(d.date)}</span></button>`; }).join('')}</div>
      <p class="hint" style="margin:8px 0 0">اضغط يومًا منعقدًا للتبديل بين: حاضر ← متأخر ← غائب. كل تعديل يُسجَّل في سجل التدقيق.${st.prior ? ` الأيام المنقطة قبل التسجيل في المنصة (${fmtNum(st.prior)} جلسة) تُحتسب حضورًا عدا ${fmtNum(st.priorAbsences)} يوم غياب من الكشوف اليدوية، وتعدّلها من «تعديل».` : ''}</p>`
    : emptyBox('لم يبدأ الاشتراك بعد', 'يبدأ تلقائيًا من أول حضور بالباركود، أو حدّد تاريخ البداية من «تعديل».')}
    <div style="display:flex;gap:8px;justify-content:space-between;margin-top:14px;flex-wrap:wrap">
      <button class="btn sm danger soft" id="sdC">${s.status === 'cancelled' ? 'استعادة الاشتراك' : 'إلغاء الاشتراك'}</button>
      <div style="display:flex;gap:8px"><button class="btn sm" id="sdE">${ic('edit')} تعديل</button><button class="btn pri sm" id="sdX">إغلاق</button></div></div>`);
  $('#sdX').onclick = closeModal;
  $('#sdE').onclick = () => subModal(s);
  $('#sdC').onclick = () => { const on = s.status !== 'cancelled'; (on ? (fn => confirmBox('إلغاء الاشتراك', 'يبقى سجل الحضور محفوظًا، ويمكن استعادة الاشتراك لاحقًا.', fn, 'إلغاء الاشتراك')) : (fn => fn()))(async () => { await Store.cancelSubscription(s.id, on); await reloadAD(); toast(on ? 'أُلغي الاشتراك' : 'استُعيد الاشتراك'); closeModal(); pageQudurat(); }); };
  $$('[data-dd]').forEach(b => b.onclick = async () => { const a = st.att.find(x => x.att_date === b.dataset.dd);
    const next = !a ? 'حاضر' : a.status === 'حاضر' ? 'متأخر' : null;
    await Store.setSubAttendance(s.id, b.dataset.dd, next); await reloadAD(); subDetail(s.id); });
}

/* إضافة أو تعديل مشترك، ومنهم المتدربون الحاليون بتاريخ بداية فعلي (D-10) */
function subModal(s){
  const D = AD, t = s ? D.trainees.find(x => x.id === s.trainee_id) : null, plans = (D.plans || []).filter(p => p.active !== false);
  modal(`<h3>${s ? 'تعديل الاشتراك' : 'إضافة مشترك'}</h3>
    <form id="smF" class="grid g2" novalidate>
      ${s ? `<div class="field" style="grid-column:1/-1"><label>المتدرب</label><div class="inp" style="display:flex;align-items:center;background:var(--surface-sunken)">${esc(t?.full_name || '')} · <span dir="ltr">${esc(t?.national_id || '')}</span></div></div>`
        : `<div class="field"><label for="sm-nid">السجل المدني <i>*</i></label><input class="inp num" id="sm-nid" name="national_id" inputmode="numeric" maxlength="10" dir="ltr"><span class="hint" id="smFound"></span></div>
           <div class="field"><label for="sm-name">الاسم الرباعي <i>*</i></label><input class="inp" id="sm-name" name="full_name" maxlength="80"></div>
           <div class="field"><label for="sm-phone">الجوال</label><input class="inp num" id="sm-phone" name="phone" inputmode="numeric" maxlength="10" dir="ltr"></div>
           <div class="field"><label for="sm-gender">الجنس</label><select class="inp" id="sm-gender" name="gender"><option>ذكر</option><option>أنثى</option></select></div>`}
      <div class="field"><label for="sm-plan">الباقة <i>*</i></label><select class="inp" id="sm-plan" name="plan_id">${plans.map(p => `<option value="${p.id}" ${s?.plan_id === p.id ? 'selected' : ''}>${esc(planName(p))}${p.mode === 'remote' ? ' (قريبًا)' : ''}</option>`).join('')}</select></div>
      <div class="field"><label for="sm-sec">القسم</label><select class="inp" id="sm-sec" name="section">${Object.entries(SECTIONS).map(([k, v]) => `<option value="${k}" ${(s?.section || 'boys') === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field" style="grid-column:1/-1"><label for="sm-start">تاريخ البداية الفعلي</label><input class="inp" type="date" id="sm-start" name="start_date" value="${s?.start_date || ''}" max="${riyadhNow().date}">
        <span class="hint">اتركه فارغًا ليبدأ الاشتراك تلقائيًا من أول حضور بالباركود. للمتدربين الذين بدؤوا قبل المنصة اكتب تاريخ أول يوم حضروه.</span></div>
      ${s && priorSessions(D, s).length ? `<div class="field" style="grid-column:1/-1"><label for="sm-pa">أيام الغياب قبل التسجيل في المنصة (من الكشوف اليدوية)</label>
        <input class="inp num" id="sm-pa" name="prior_absences" type="number" inputmode="numeric" min="0" max="${priorSessions(D, s).length}" value="${Number(s.prior_absences) || 0}" style="max-width:140px">
        <span class="hint">من ${fmtDate(s.start_date)} حتى ${fmtDate(addDays(s.track_from, -1))}: ${fmtNum(priorSessions(D, s).length)} جلسة بلا سجل في المنصة، وتُحتسب حضورًا عدا العدد الذي تكتبه هنا.</span></div>` : ''}
      <div class="errtxt" id="smE" style="grid-column:1/-1"></div>
      <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="smC">إلغاء</button><button class="btn pri" id="smS">${ic('check')} حفظ</button></div></form>`);
  $('#smC').onclick = closeModal;
  const nid = $('#sm-nid');
  if(nid){ nid.addEventListener('input', () => { nid.value = toLatin(nid.value).replace(/\D/g, ''); const x = nid.value.length === 10 && D.trainees.find(y => y.national_id === nid.value);
      $('#smFound').textContent = x ? `متدرب مسجّل: ${x.full_name}` : ''; if(x){ $('#sm-name').value = x.full_name; $('#sm-phone').value = x.phone || ''; $('#sm-gender').value = x.gender; $('#sm-sec').value = sectionOfGender(x.gender); } });
    $('#sm-gender').onchange = e => { $('#sm-sec').value = sectionOfGender(e.target.value); };
    $('#sm-phone').addEventListener('input', e => e.target.value = toLatin(e.target.value).replace(/\D/g, '')); }
  $('#smF').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)); $('#smE').textContent = '';
    if(!s){ if(!validSaudiId(f.national_id)) return $('#smE').textContent = 'رقم السجل المدني غير صحيح.'; if(f.full_name.trim().split(/\s+/).length < 3) return $('#smE').textContent = 'اكتب الاسم الثلاثي على الأقل.'; }
    const b = $('#smS'); setBusy(b, true, 'جارٍ الحفظ');
    try { const r = await Store.saveSubscription({ ...f, id:s?.id, trainee_id:s?.trainee_id, start_date:f.start_date || null }); await reloadAD(); closeModal(); toast(s ? 'حُفظ الاشتراك' : 'أُضيف المشترك'); pageQudurat(); if(!s && r?.order_id) receiveModal(r.order_id, () => pageQudurat()); }
    catch(x){ setBusy(b, false); $('#smE').textContent = x.message; } };
}

/* استيراد قائمة المتدربين الحاليين بلصقها من Excel */
function importModal(){
  const D = AD, tiers = Object.entries(TIERS).filter(([k]) => k !== 'custom');
  modal(`<h3>استيراد المتدربين الحاليين</h3>
    <p class="hint" style="margin:-4px 0 10px">انسخ الأعمدة من Excel بهذا الترتيب والصقها: <b>السجل المدني، الاسم، الجوال، الجنس (ذكر/أنثى)، الباقة (${tiers.map(([, v]) => v).join(' / ')})، تاريخ البداية (اختياري، مثل 2026-10-20)</b>. الباقات حضورية.</p>
    <textarea class="inp" id="imT" rows="8" dir="auto" style="padding:10px 14px;line-height:1.8;font-family:monospace" placeholder="1012345678	محمد علي أحمد الحكمي	0551234567	ذكر	الفضية	2026-10-20"></textarea>
    <div id="imP" style="margin-top:10px"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" id="imC">إلغاء</button><button class="btn" id="imV">${ic('search')} معاينة</button><button class="btn pri" id="imS" disabled>${ic('check')} استيراد</button></div>`);
  $('#imC').onclick = closeModal;
  let parsed = [];
  const parse = () => {
    parsed = $('#imT').value.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map((l, i) => {
      const c = l.split(/\t|,|؛|;/).map(x => toLatin(x.trim()));
      const [nid, name, phone, gender, tierTxt, start] = c, errs = [];
      const tier = tiers.find(([, v]) => tierTxt && (v === tierTxt || v.replace('ال', '') === tierTxt.replace('ال', '')))?.[0];
      const plan = (D.plans || []).find(p => p.tier === tier && p.mode === 'in_person');
      if(!validSaudiId(nid || '')) errs.push('السجل غير صحيح');
      if(!name || name.split(/\s+/).length < 3) errs.push('الاسم ناقص');
      if(phone && !/^05\d{8}$/.test(phone)) errs.push('الجوال غير صحيح');
      if(!['ذكر', 'أنثى'].includes(gender)) errs.push('الجنس: ذكر أو أنثى');
      if(!plan) errs.push('الباقة غير معروفة');
      if(start && (!/^\d{4}-\d{2}-\d{2}$/.test(start) || start > riyadhNow().date)) errs.push('تاريخ البداية غير صحيح');
      return { line:i + 1, national_id:nid, full_name:name, phone, gender, plan_id:plan?.id, plan, section:sectionOfGender(gender), start_date:start || null, errs };
    });
    const bad = parsed.filter(r => r.errs.length);
    $('#imP').innerHTML = parsed.length ? `<p><b>${fmtNum(parsed.length - bad.length)}</b> صفًا سليمًا${bad.length ? `، و<b style="color:var(--danger-ink)">${fmtNum(bad.length)}</b> صفًا فيه أخطاء لن يُستورد:` : '.'}</p>
      ${bad.length ? `<ul class="hint" style="margin:0;padding-inline-start:18px">${bad.slice(0, 12).map(r => `<li>السطر ${fmtNum(r.line)}: ${r.errs.join('، ')}</li>`).join('')}</ul>` : ''}` : emptyBox('لا توجد صفوف');
    $('#imS').disabled = !(parsed.length - bad.length);
  };
  $('#imV').onclick = parse;
  $('#imS').onclick = async () => { const b = $('#imS'); setBusy(b, true, 'جارٍ الاستيراد'); let ok = 0; const fails = [];
    for(const r of parsed.filter(r => !r.errs.length)){ try { await Store.saveSubscription(r); ok++; } catch(x){ fails.push(`السطر ${fmtNum(r.line)}: ${x.message}`); } }
    await reloadAD(); closeModal(); toast(`استُورد ${fmtNum(ok)} مشترك${fails.length ? `، وتعذّر ${fmtNum(fails.length)}` : ''}`); pageQudurat();
    if(fails.length) modal(`<h3>صفوف لم تُستورد</h3><ul>${fails.map(f => `<li>${esc(f)}</li>`).join('')}</ul><div style="text-align:end"><button class="btn pri" id="fx">حسنًا</button></div>`), $('#fx').onclick = closeModal; };
}

/* ---------- الباقات ---------- */
function tabPlans(){
  const D = AD, body = $('#qBody'), plans = (D.plans || []).slice().sort((a, b) => a.sort - b.sort);
  body.innerHTML = `<div class="grid g3">${plans.map((p, i) => { const subs = (D.subscriptions || []).filter(s => s.plan_id === p.id && ['pending', 'active'].includes(subStatus(s))).length;
    return `<div class="card pad rv pl-admin t-${TIER_TONE[p.tier]}" style="--i:${i}">
      <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><span class="pl-tier">${esc(TIERS[p.tier])} · ${esc(MODES[p.mode])}</span><h3 class="ctitle" style="margin-top:6px">${esc(p.name)}</h3></div>
        <span class="pill dot ${p.mode === 'remote' || p.status === 'coming_soon' ? 'info' : planOpen(p) ? 'ok' : 'g'}">${p.mode === 'remote' || p.status === 'coming_soon' ? 'قريبًا' : planOpen(p) ? 'متاحة' : 'مغلقة'}</span></div>
      <div class="hint" style="margin:6px 0">${DURATION_TXT(p)} · ${fmtNum(p.hours)} ساعة · ${fmtNum(planTotal(p))} ريال</div>
      <div class="hint">${priceLine(p)}</div><div style="margin:8px 0"><b class="num">${fmtNum(subs)}</b> <span class="hint">مشترك قائم</span></div>
      <button class="btn sm" data-pe="${p.id}">${ic('edit')} تعديل</button></div>`; }).join('')}</div>`;
  $$('[data-pe]').forEach(b => b.onclick = () => planModal(D.plans.find(p => p.id === b.dataset.pe)));
}
function planModal(p){
  let image = p.image || '';
  modal(`<h3>تعديل ${esc(planName(p))}</h3><form id="pmF" class="grid g2" novalidate>
    <div class="field" style="grid-column:1/-1"><label for="pm-name">اسم الباقة</label><input class="inp" id="pm-name" name="name" value="${esc(p.name)}"></div>
    <div class="field"><label for="pm-status">الحالة</label><select class="inp" id="pm-status" name="status" ${p.mode === 'remote' ? 'disabled' : ''}>${[['open', 'متاحة للتسجيل'], ['closed', 'مغلقة'], ['coming_soon', 'قريبًا']].map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select>${p.mode === 'remote' ? '<span class="hint">باقات عن بُعد تبقى «قريبًا» (D-07).</span>' : ''}</div>
    <div class="field"><label for="pm-hours">الساعات</label><input class="inp num" id="pm-hours" name="hours" type="number" min="1" value="${p.hours}"></div>
    <div class="field"><label for="pm-reg">رسوم التسجيل (ريال)</label><input class="inp num" id="pm-reg" name="reg_fee" type="number" min="0" value="${p.reg_fee}"></div>
    <div class="field"><label for="pm-n">عدد الأقساط الشهرية</label><input class="inp num" id="pm-n" name="installments" type="number" min="0" value="${p.installments}"></div>
    <div class="field"><label for="pm-amt">قيمة القسط (ريال)</label><input class="inp num" id="pm-amt" name="installment_amount" type="number" min="0" value="${p.installment_amount}"></div>
    <div class="field" style="grid-column:1/-1"><label for="pm-sum">النبذة</label><input class="inp" id="pm-sum" name="summary" value="${esc(p.summary || '')}"></div>
    <div class="field" style="grid-column:1/-1"><label for="pm-feat">المزايا (ميزة في كل سطر)</label><textarea class="inp" id="pm-feat" name="features" rows="6" style="padding:10px 14px;line-height:1.8">${esc((p.features || []).join('\n'))}</textarea></div>
    <div class="field" style="grid-column:1/-1"><label>صورة الباقة</label><div class="pt-up"><span class="pt-logo"><img id="pmPrev" src="${image}" alt="" style="${image ? '' : 'opacity:.2'}"></span>
      <label class="btn sm" style="cursor:pointer">${ic('plus')} رفع صورة<input type="file" id="pmFile" accept="image/*" class="sr-only"></label>${image ? '<button type="button" class="btn sm" id="pmRm">إزالة</button>' : ''}</div></div>
    <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="pmC">إلغاء</button><button class="btn pri" id="pmS">${ic('check')} حفظ</button></div></form>`);
  $('#pmC').onclick = closeModal;
  $('#pmFile').onchange = async e => { const f = e.target.files[0]; if(!f) return; try { image = await shrinkImage(f, 900); $('#pmPrev').src = image; $('#pmPrev').style.opacity = 1; } catch(_){ toast('تعذّرت قراءة الصورة'); } };
  if($('#pmRm')) $('#pmRm').onclick = () => { image = ''; $('#pmPrev').src = ''; $('#pmPrev').style.opacity = .2; };
  $('#pmF').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    const o = { ...p, name:f.name.trim() || p.name, status: p.mode === 'remote' ? 'coming_soon' : f.status, hours:+f.hours || p.hours, reg_fee:+f.reg_fee || 0, installments:+f.installments || 0, installment_amount:+f.installment_amount || 0,
      summary:f.summary.trim(), features:f.features.split(/\n+/).map(x => x.trim()).filter(Boolean), image };
    const b = $('#pmS'); setBusy(b, true, 'جارٍ الحفظ');
    try { await Store.savePlan(o); await reloadAD(); closeModal(); toast('حُفظت الباقة'); pageQudurat(); } catch(x){ setBusy(b, false); toast(x.message); } };
}

/* ---------- الجدول والاستثناءات ---------- */
function tabSchedule(){
  const D = AD, body = $('#qBody'), n = riyadhNow();
  const ex = (D.schedule_exceptions || []).slice().sort((a, b) => b.date.localeCompare(a.date));
  body.innerHTML = `<div class="grid g2" style="align-items:start">${Object.entries(SECTIONS).map(([sec, label], i) => {
      const rows = (D.schedule_templates || []).filter(x => x.section === sec).sort((a, b) => ((a.dow + 1) % 7) - ((b.dow + 1) % 7));
      return `<form class="card pad rv" style="--i:${i}" data-tf="${sec}"><h3 class="ctitle">${ic('clock')}جدول ${label}</h3>
        <div class="tpl-rows">${rows.map(r => tplRow(r)).join('')}</div>
        <div style="display:flex;gap:8px;margin-top:10px"><button type="button" class="btn sm" data-ta="${sec}">${ic('plus')} يوم</button><button class="btn pri sm">${ic('check')} حفظ الجدول</button></div>
        <p class="hint" style="margin:8px 0 0">تغيير القالب ينطبق على الجلسات القادمة والماضية في الحساب. لتعطيل يوم بعينه استخدم «الاستثناءات».</p></form>`; }).join('')}</div>
    <div class="card pad rv" style="margin-top:16px"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap"><h3 class="ctitle">${ic('calendar')}الاستثناءات: إجازة، أو تعويض، أو تغيير وقت</h3><button class="btn pri sm" id="exAdd">${ic('plus')} استثناء</button></div>
      ${ex.length ? `<div class="tblwrap" style="margin-top:10px"><table class="tb"><thead><tr><th>التاريخ</th><th>القسم</th><th>النوع</th><th>الوقت</th><th>ملاحظة</th><th></th></tr></thead><tbody>
        ${ex.map(x => `<tr class="${x.date < n.date ? 'muted' : ''}"><td>${fmtDate(x.date)}</td><td>${SECTIONS[x.section]}</td><td><span class="pill ${x.type === 'cancel' ? 'bad' : 'info'}">${EXC_TXT[x.type]}</span></td><td class="num">${x.type === 'cancel' ? '—' : `${t12(x.start)} – ${t12(x.end)}`}</td><td>${esc(x.note || '')}</td>
          <td><button class="btn sm danger soft" data-xd="${x.id}" aria-label="حذف">${ic('trash')}</button></td></tr>`).join('')}</tbody></table></div>` : `<p class="hint">لا توجد استثناءات. أضف الإجازات الرسمية والجلسات التعويضية هنا.</p>`}</div>`;
  $$('[data-ta]').forEach(b => b.onclick = () => b.closest('form').querySelector('.tpl-rows').insertAdjacentHTML('beforeend', tplRow({ dow:4, start:'18:00', end:'20:00' })));
  body.addEventListener('click', e => { const r = e.target.closest('[data-tr]'); if(r) r.closest('.tpl-row').remove(); });
  $$('[data-tf]').forEach(f => f.onsubmit = async e => { e.preventDefault(); const rows = $$('.tpl-row', f).map(r => ({ dow:+$('select', r).value, start:$('[name=start]', r).value, end:$('[name=end]', r).value }));
    if(rows.some(r => !r.start || !r.end || r.end <= r.start)) return toast('وقت النهاية يجب أن يكون بعد البداية');
    if(new Set(rows.map(r => r.dow)).size !== rows.length) return toast('لكل يوم جلسة واحدة في القالب');
    await Store.saveTemplates(f.dataset.tf, rows); await reloadAD(); toast('حُفظ الجدول'); tabSchedule(); });
  $('#exAdd').onclick = exceptionModal;
  $$('[data-xd]').forEach(b => b.onclick = () => confirmBox('حذف الاستثناء', 'تعود جلسة ذلك اليوم إلى القالب الأصلي.', async () => { await Store.deleteException(b.dataset.xd); await reloadAD(); toast('حُذف الاستثناء'); tabSchedule(); }));
}
const tplRow = r => `<div class="tpl-row"><select class="inp" aria-label="اليوم">${[6, 0, 1, 2, 3, 4, 5].map(d => `<option value="${d}" ${r.dow === d ? 'selected' : ''}>${DAYS[d]}</option>`).join('')}</select>
  <input class="inp" type="time" name="start" value="${r.start}" aria-label="البداية"><input class="inp" type="time" name="end" value="${r.end}" aria-label="النهاية"><button type="button" class="btn sm danger soft" data-tr aria-label="حذف اليوم">${ic('x')}</button></div>`;
function exceptionModal(){
  modal(`<h3>استثناء في الجدول</h3><form id="exF" class="grid g2" novalidate>
    <div class="field"><label for="ex-date">التاريخ</label><input class="inp" type="date" id="ex-date" name="date" value="${riyadhNow().date}"></div>
    <div class="field"><label for="ex-sec">القسم</label><select class="inp" id="ex-sec" name="section"><option value="both">البنون والبنات</option>${Object.entries(SECTIONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="field"><label for="ex-type">النوع</label><select class="inp" id="ex-type" name="type">${Object.entries(EXC_TXT).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
    <div class="field ex-time"><label>الوقت</label><div style="display:flex;gap:6px"><input class="inp" type="time" name="start" value="18:00" aria-label="البداية"><input class="inp" type="time" name="end" value="20:00" aria-label="النهاية"></div></div>
    <div class="field" style="grid-column:1/-1"><label for="ex-note">ملاحظة</label><input class="inp" id="ex-note" name="note" placeholder="مثل: إجازة اليوم الوطني"></div>
    <p class="hint" style="grid-column:1/-1;margin:0">الإلغاء لا يمدد نهاية الباقة. الجلسات الملغاة لا تُحتسب غيابًا.</p>
    <div class="errtxt" id="exE" style="grid-column:1/-1"></div>
    <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="exC">إلغاء</button><button class="btn pri">${ic('check')} حفظ</button></div></form>`);
  const sync = () => { $('.ex-time').style.display = $('#ex-type').value === 'cancel' ? 'none' : ''; }; sync(); $('#ex-type').onchange = sync;
  $('#exC').onclick = closeModal;
  $('#exF').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    if(!f.date) return $('#exE').textContent = 'اختر التاريخ.';
    if(f.type !== 'cancel' && (!f.start || !f.end || f.end <= f.start)) return $('#exE').textContent = 'وقت النهاية يجب أن يكون بعد البداية.';
    for(const sec of f.section === 'both' ? Object.keys(SECTIONS) : [f.section]) await Store.saveException({ date:f.date, section:sec, type:f.type, start:f.type === 'cancel' ? null : f.start, end:f.type === 'cancel' ? null : f.end, note:f.note.trim() });
    await reloadAD(); closeModal(); toast('حُفظ الاستثناء'); tabSchedule(); };
}

/* ---------- طلبات الباقة المخصصة ---------- */
function tabRequests(){
  const D = AD, body = $('#qBody'), list = (D.custom_requests || []).slice().sort((a, b) => b.created_at.localeCompare(a.created_at));
  body.innerHTML = `<div class="card pad rv">${list.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>التاريخ</th><th>الاسم</th><th>الجوال</th><th>البرنامج</th><th>القسم</th><th>الحضور</th><th>الاحتياج</th><th>الحالة</th></tr></thead><tbody>
    ${list.map(r => `<tr><td>${fmtShort(r.created_at.slice(0, 10))}</td><td>${esc(r.name)}</td><td dir="ltr"><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></td><td>${esc(r.program)}</td><td>${SECTIONS[r.section] || ''}</td><td>${esc(MODES[r.mode] || '')}</td><td style="max-width:260px">${esc(r.notes || '')}</td>
      <td><select class="inp" data-rq="${r.id}" style="width:auto">${[['new', 'جديد'], ['contacted', 'تم التواصل'], ['closed', 'مغلق']].map(([k, v]) => `<option value="${k}" ${r.status === k ? 'selected' : ''}>${v}</option>`).join('')}</select></td></tr>`).join('')}
    </tbody></table></div>` : emptyBox('لا توجد طلبات', 'تظهر هنا طلبات «الباقة المخصصة» من الصفحة الرئيسية.')}</div>`;
  $$('[data-rq]').forEach(s => s.onchange = async () => { await Store.setCustomRequestStatus(s.dataset.rq, s.value); await reloadAD(); toast('حُدّثت الحالة'); });
}
