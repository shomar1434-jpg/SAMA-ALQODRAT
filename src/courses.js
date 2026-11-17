/* =====================================================================
   «دورات متاحة حاليا» و«دورات متاحة قريبا» في الرئيسية (الخطوة AX، البند 14 من «طلبات نهائية»).
   حالة البرنامج: publish_state يحدده المدير من «الدفعات والكشوف» ↔ admin_set_publish (…_publish_state.sql).
   الفعلية: غير المنشور والمغلق والمؤرشف لا تظهر؛ المفتوح يشترط دفعة مفتوحة فينتقل تلقائيًا إلى «حاليا» عند فتحها؛
   و«قريبا» إعلان فقط (تسجيل اهتمام مبدئي بلا طلب شراء). الباقات: الحضورية النشطة «حاليا»، و«قريبًا» (ومنها عن بُعد) «قريبا».
   ===================================================================== */
import { $$, esc, fmtNum, fmtShort } from './utils.js';
import { ic } from './views2_head.js';

export const PUB_STATES = { draft:'غير منشور', coming_soon:'متاح قريبًا', open_for_registration:'مفتوح للتسجيل', closed:'مغلق', archived:'مؤرشف' };
export const PUB_TONE = { draft:'g', coming_soon:'info', open_for_registration:'ok', closed:'warn', archived:'g', '':'g' };
const cohortOpen = c => !!c && c.reg_open && (c.taken || 0) < c.seats;
/* الحالة الفعلية للعرض: '' = لا يظهر في قسمي الرئيسية */
export function pubState(p){
  const s = p.publish_state || '';
  if(['draft', 'closed', 'archived'].includes(s)) return s;
  if(cohortOpen(p.cohort)) return 'open_for_registration';
  return s === 'coming_soon' || s === 'open_for_registration' ? 'coming_soon' : '';
}
export function courseLists(programs, plans){
  const P = programs || [], L = (plans || []).filter(p => p.active !== false);
  const progNow = P.filter(p => pubState(p) === 'open_for_registration'), progSoon = P.filter(p => pubState(p) === 'coming_soon');
  const planNow = L.filter(p => p.mode !== 'remote' && p.status !== 'coming_soon'), planSoon = L.filter(p => p.mode === 'remote' || p.status === 'coming_soon');
  return { now:[...planNow.map(p => ({ kind:'plan', p })), ...progNow.map(p => ({ kind:'program', p }))], soon:[...planSoon.map(p => ({ kind:'plan', p })), ...progSoon.map(p => ({ kind:'program', p }))] };
}
const planLabel = p => `${p.name}${p.mode === 'remote' ? ' (عن بُعد)' : ''}`;
function cardHtml(x, soon){
  const p = x.p, isPlan = x.kind === 'plan';
  const date = isPlan ? '' : soon ? (p.expected_start ? `الموعد المتوقع ${fmtShort(p.expected_start)}` : 'يُعلن الموعد لاحقًا') : p.cohort?.start_date ? `تبدأ ${fmtShort(p.cohort.start_date)}` : '';
  const href = isPlan ? `#enroll-q-${p.id}` : `#enroll-p-${p.code}`;
  const btn = soon ? (isPlan ? '' : `<a class="btn sm" href="${href}">${ic('bell')} سجّل اهتمامك</a>`) : `<a class="btn pri sm" href="${href}">${ic('form')} أرغب بالتسجيل فيها</a>`;
  return `<article class="crs-card" data-crs="${esc(p.id)}"><div class="crs-top"><span class="pill dot ${soon ? 'info' : 'ok'}">${soon ? 'متاحة قريبًا' : 'متاحة الآن'}</span><span class="hint">${esc(isPlan ? 'باقات القدرات والتحصيلي' : p.category || '')}</span></div>
    <h3>${esc(isPlan ? 'باقة ' + planLabel(p) : p.name)}</h3>${date ? `<p class="hint">${ic('calendar')} ${date}</p>` : ''}${!isPlan && p.hours ? `<p class="hint">${fmtNum(p.hours)} ساعة تدريبية</p>` : ''}
    ${btn ? `<div class="crs-act">${btn}</div>` : ''}</article>`;
}
export function coursesSectionHtml(programs, plans){
  const L = courseLists(programs, plans), list = (arr, soon) => arr.length ? `<div class="crs-grid">${arr.map(x => cardHtml(x, soon)).join('')}</div>` : `<p class="crs-empty">${soon ? 'لا توجد دورات قادمة حاليًا.' : 'لا توجد دورات حاليًا.'}</p>`;
  return `<section class="courses" id="coursesSec">
    <div class="sec-head" data-reveal><span class="kicker">الدورات</span><h2>دورات <em>متاحة الآن وقريبًا</em></h2></div>
    <div class="seg crs-tabs" role="tablist"><button type="button" role="tab" class="on" aria-selected="true" data-crt="now">${ic('check')} دورات متاحة حاليا <span class="pill g">${fmtNum(L.now.length)}</span></button><button type="button" role="tab" aria-selected="false" data-crt="soon">${ic('clock')} دورات متاحة قريبا <span class="pill g">${fmtNum(L.soon.length)}</span></button></div>
    <div data-crp="now" role="tabpanel">${list(L.now, false)}</div><div data-crp="soon" role="tabpanel" hidden>${list(L.soon, true)}</div></section>`;
}
/* أزرار الانتقال إلى القسم (لا تغيّر عنوان الصفحة لأن التوجيه بالـhash) */
export function bindCourses(root = document){
  const show = k => { $$('[data-crt]', root).forEach(b => { const on = b.dataset.crt === k; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); $$('[data-crp]', root).forEach(p => p.hidden = p.dataset.crp !== k); };
  $$('[data-crt]', root).forEach(b => b.onclick = () => show(b.dataset.crt));
  $$('[data-go-crs]', root).forEach(b => b.onclick = e => { e.preventDefault(); show(b.dataset.goCrs); root.querySelector('#coursesSec')?.scrollIntoView({ behavior:'smooth', block:'start' }); });
}
