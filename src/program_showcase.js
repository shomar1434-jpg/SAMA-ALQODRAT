/* =====================================================================
   عرض البرامج المتحرك في الرئيسية (الخطوة BU، طلب المالك 24 نوفمبر)
   برنامج واحد على «المنصة» في الوسط، والتالية تنتظر يسارًا في طابور يصغر ويضبب،
   وعند الانتقال يتقدم التالي إلى الوسط ويخرج الحالي، وتظهر التفاصيل تباعًا.
   الصور في public/programs/<رمز البرنامج>.webp (programImg)، والحالة من pubState:
   المفتوح للتسجيل أولًا ثم «قريبًا» ثم البقية. لا شيفرة عند التحميل: كل شيء داخل الدوال.
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort } from './utils.js';
import { ic, prefersReduced, quiet } from './views2_head.js';
import { pubState } from './courses.js';
import { progCode } from './data2.js';

/* رموز البرامج التي لها صورة تعريفية (73) */
const ART = new Set(['p118947','p119057','p119415','p119565','p119731','p120103','p120564','p120676','p121252','p122085','p124050','p125368','p125381','p125387','p125414','p125979','p125982','p126025','p126132','p126133','p126147','p126893','p129836','p132840','p132842','p25143','p25144','p25146','p25147','p25148','p25149','p25150','p25151','p25155','p25156','p25157','p25159','p25162','p25165','p25167','p25171','p25175','p25176','p25185','p25186','p25188','p25189','p25190','p25191','p25193','p25194','p25196','p25200','p25201','p25202','p25203','p25207','p25210','p25212','p25214','p25215','p25216','p25220','p25223','p25224','p25228','p25231','p25233','p25234','p25235','p25236','p25237','p99464']);
export const programImg = p => { const c = progCode(p); return ART.has(c) ? `programs/${c}.webp` : ''; };

const ORD = { open_for_registration:0, coming_soon:1 };
const ST_TXT = { open_for_registration:'متاحة الآن', coming_soon:'قريبًا' };
export const showcaseState = p => { const s = pubState(p); return s in ORD ? s : ''; };
export const stBadge = p => { const s = showcaseState(p); return s ? `<span class="ps-st ${s === 'coming_soon' ? 'soon' : 'open'}">${ST_TXT[s]}</span>` : ''; };
export function showcaseOrder(programs){
  return (programs || []).map((p, i) => ({ p, i, o: ORD[showcaseState(p)] ?? 2 })).sort((a, b) => a.o - b.o || a.i - b.i).map(x => x.p);
}
const daysWord = n => n > 2 && n < 11 ? 'أيام' : 'يومًا';
function whenTxt(p){
  const s = showcaseState(p);
  if(s === 'open_for_registration') return p.cohort?.start_date ? 'تبدأ الدفعة ' + fmtShort(p.cohort.start_date) : '';
  if(s === 'coming_soon') return p.expected_start ? 'الموعد المتوقع ' + fmtShort(p.expected_start) : 'يُعلن الموعد لاحقًا';
  return '';
}
function ctaHtml(p){
  const s = showcaseState(p), code = esc(progCode(p)), more = `<a class="btn" href="#${code}">تفاصيل البرنامج</a>`;
  if(s === 'open_for_registration') return `<a class="btn pri" href="#enroll-p-${code}">${ic('form')} أرغب بالتسجيل</a>${more}`;
  if(s === 'coming_soon') return `<a class="btn pri" href="#enroll-p-${code}">${ic('bell')} سجّل اهتمامك</a>${more}`;
  return `<a class="btn pri" href="#${code}">تفاصيل البرنامج ${ic('next')}</a>`;
}

/* الحالة تبقى بين إعادات العرض الهادئة (التحديث الحي) */
const SC = { cat:'الكل', code:'', run:null };

export function showcaseSectionHtml(programs){
  const P = programs || [];
  if(!P.length) return '';
  const cats = ['الكل', ...new Set(P.map(p => p.category))];
  return `<section class="pshow" id="progShow" aria-roledescription="عرض متحرك" aria-label="البرامج التدريبية">
    <div class="ps-in">
      <div class="ps-head">
        <div class="sec-head" data-reveal><span class="kicker">البرامج التدريبية</span><h2>${fmtNum(P.length)} برنامجًا <em>معتمدًا</em></h2></div>
        <div class="ps-tools"><div class="ps-chips" role="group" aria-label="تصفية حسب المجال">${cats.map(c => `<button type="button" class="ps-chip" data-psc="${esc(c)}" aria-pressed="false">${esc(c)}</button>`).join('')}</div>
          <a class="ps-all" href="#register">عرض كل البرامج ${ic('next')}</a></div>
      </div>
      <div class="ps-body">
        <div class="ps-info" id="psInfo" aria-live="polite"></div>
        <div class="ps-col">
          <div class="ps-stage" id="psStage"><div class="ps-floor"></div></div>
          <div class="ps-foot"><div class="ps-num" id="psNum" aria-hidden="true"></div>
            <div class="ps-nav"><button type="button" class="ps-btn" id="psPrev" aria-label="البرنامج السابق">${ARROW_R}</button><button type="button" class="ps-btn" id="psNext" aria-label="البرنامج التالي">${ARROW_L}</button></div></div>
        </div>
      </div>
    </div></section>`;
}
const ARROW_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';
const ARROW_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>';

export function bindShowcase(programs, root = document){
  const sec = $('#progShow', root), stage = $('#psStage', root), info = $('#psInfo', root), num = $('#psNum', root);
  if(!sec || !stage) return;
  if(SC.run) SC.run.stop();
  const ALL = showcaseOrder(programs);
  let list = [], idx = 0, geo = null, hold = 0, timer = null, ro = null, io = null, alive = true, near = false;
  const els = new Map();
  const RM = () => prefersReduced();

  function setCat(c, keep){
    SC.cat = c; list = c === 'الكل' ? ALL : ALL.filter(p => p.category === c);
    if(!list.length){ SC.cat = 'الكل'; list = ALL; }
    idx = keep ? Math.max(0, list.findIndex(p => progCode(p) === SC.code)) : 0;
    $$('[data-psc]', sec).forEach(b => b.setAttribute('aria-pressed', b.dataset.psc === SC.cat));
    for(const el of els.values()) el.remove(); els.clear();
    layout(); details(false);
  }

  function layout(){
    const W = stage.clientWidth; if(!W) return;
    const mob = W < 640;
    if(mob){
      const cw = W, ch = cw * 464 / 830, ts = Math.max(.27, 50 / ch), gap = 12, tw0 = cw * ts, fit = Math.max(1, Math.min(3, Math.floor((cw + 8) / (tw0 + 8))));
      stage.style.setProperty('--sh', (ch + ch * ts + gap + 4) + 'px');
      geo = { cw, slot(o){
        if(o === 0) return { x:0, y:0, s:1, b:0, a:1, z:20 };
        if(o < 0) return { x:cw * .2, y:-ch * .03, s:1.06, b:8, a:0, z:25 };
        const tw = cw * ts, k = Math.min(o, 4), x = cw - k * tw - (k - 1) * 8;
        return { x, y:ch + gap, s:ts, b:0, a:o > fit ? 0 : 1 - (k - 1) * .22, z:20 - k };
      } };
    } else {
      const cw = Math.min(W * .6, 680), ch = cw * 464 / 830, top = 10, scales = [1, .56, .44, .35, .28, .22, .18];
      stage.style.setProperty('--sh', (ch + top + 26) + 'px');
      geo = { cw, slot(o){
        const base = W - cw;
        if(o === 0) return { x:base, y:top, s:1, b:0, a:1, z:20 };
        if(o < 0) return { x:base + cw * .22, y:top - ch * .04, s:1.08, b:10, a:0, z:25 };
        const k = Math.min(o, 6), s = scales[k], w = cw * s, c = base * (1 - (k - .5) / 5);
        return { x:c - w / 2, y:top + ch - ch * s, s, b:1.4 * k, a:o > 5 ? 0 : Math.max(.2, .82 - (k - 1) * .15), z:20 - k };
      } };
    }
    stage.style.setProperty('--cw', geo.cw + 'px');
    if(near) place(false, 0);
  }

  function make(p, hi){
    const el = document.createElement('button');
    el.type = 'button'; el.className = 'ps-card still'; el.tabIndex = -1; el.dataset.code = progCode(p);
    const src = programImg(p);
    /* صورة الوسط أولًا، والطابور بأولوية منخفضة، وتظهر بتلاشٍ بعد اكتمالها */
    el.innerHTML = (src ? `<img alt="" decoding="async" fetchpriority="${hi ? 'high' : 'low'}" src="${esc(src)}">` : `<span class="ps-ph">${ic('book')}</span>`) + `<span class="ps-tag">${esc(ST_TXT[showcaseState(p)] || p.category || '')}</span>`;
    el.setAttribute('aria-label', p.name);
    const im = el.querySelector('img');
    if(im){ const done = () => el.classList.add('ld'); if(im.complete && im.naturalWidth) done(); else { im.addEventListener('load', done, { once:true }); im.addEventListener('error', done, { once:true }); } }
    stage.appendChild(el);
    return el;
  }
  function setSlot(el, o, fast){
    const g = geo.slot(o);
    el.classList.toggle('fast', !!fast);
    el.style.transform = `translate(${g.x}px,${g.y}px) scale(${g.s})`;
    el.style.filter = g.b ? `blur(${g.b}px)` : 'none';
    el.style.opacity = g.a; el.style.zIndex = g.z;
    /* المخفي (الخارج أو ما بعد الطابور) لا يبقى هدف لمس ولا تركيز */
    clearTimeout(el._vh);
    if(g.a) el.style.visibility = ''; else el._vh = setTimeout(() => { if(el.style.opacity === '0') el.style.visibility = 'hidden'; }, el.classList.contains('still') ? 0 : 820);
    el.classList.toggle('hero', o === 0);
    el.dataset.o = o;
    el.setAttribute('aria-hidden', o === 0 || (o > 0 && o < 4) ? 'false' : 'true');
  }
  const OFFS = [0, 1, 2, 3, 4, 5, -1, 6];
  const at = o => list[((idx + o) % list.length + list.length) % list.length];
  function place(animate, dir){
    if(!geo || !list.length || !near) return;
    const want = new Map();
    for(const o of OFFS){ const p = at(o); const c = progCode(p); if(!want.has(c)) want.set(c, { o, p }); }
    for(const [code, el] of els){
      if(want.has(code)) continue;
      if(animate){ setSlot(el, dir > 0 && el.dataset.o === '0' ? -1 : 7, true); setTimeout(() => { if(!want.has(code) && els.get(code) === el && !OFFS.some(o => progCode(at(o)) === code)){ el.remove(); els.delete(code); } }, 700); }
      else { el.remove(); els.delete(code); }
    }
    for(const [code, { o, p }] of want){
      let el = els.get(code);
      if(!el){ el = make(p, o === 0); els.set(code, el); setSlot(el, dir < 0 && o === 0 ? -1 : (o >= 5 ? 7 : o)); el.getBoundingClientRect(); el.classList.remove('still'); }
      if(!animate || RM()){ el.classList.add('still'); setSlot(el, o); el.getBoundingClientRect(); el.classList.remove('still'); }
      else setSlot(el, o, dir < 0 && o === -1);
    }
  }

  function details(anim = true){
    const p = list[idx]; if(!p) return; SC.code = progCode(p);
    const meta = [p.hours ? [fmtNum(p.hours), 'ساعة تدريبية'] : null, p.duration_days ? [fmtNum(p.duration_days), daysWord(p.duration_days)] : null, p.accreditation_no ? [esc(p.accreditation_no), 'رقم الاعتماد'] : null].filter(Boolean);
    const nxt = [1, 2, 3].filter(k => k < list.length).map(k => ({ k, p:at(k) }));
    const w = whenTxt(p), r = anim && !RM() && !quiet() ? 'ps-rise' : '', d = i => r ? `style="--d:${i * 70}ms"` : '';
    info.innerHTML = `<div class="ps-tags ${r}" ${d(0)}>${stBadge(p)}<span class="ps-cat">${esc(p.category || '')}</span></div>
      <h3 class="ps-name ${r}" ${d(1)}>${esc(p.name)}</h3>
      ${meta.length ? `<div class="ps-meta ${r}" ${d(2)} style="grid-template-columns:repeat(${meta.length},minmax(0,1fr))${r ? ';--d:140ms' : ''}">${meta.map(([v, l]) => `<div><b>${v}</b><span>${l}</span></div>`).join('')}</div>` : ''}
      ${w ? `<p class="ps-when ${r}" ${d(3)}>${ic('calendar')} ${esc(w)}</p>` : ''}
      <div class="ps-cta ${r}" ${d(3)}>${ctaHtml(p)}</div>
      ${nxt.length ? `<div class="ps-next ${r}" ${d(4)}><h4>التالي في القائمة</h4><ol>${nxt.map(({ k, p:q }) => `<li><button type="button" data-pss="${k}"><i>${fmtNum((idx + k) % list.length + 1)}</i>${esc(q.name)}</button></li>`).join('')}</ol></div>` : ''}`;
    num.innerHTML = `${fmtNum(idx + 1)}<small>من ${fmtNum(list.length)}</small>`;
    if(r){ num.classList.remove('ps-rise'); void num.offsetWidth; num.classList.add('ps-rise'); }
  }

  function go(step){
    if(list.length < 2 || !step) return;
    idx = ((idx + step) % list.length + list.length) % list.length;
    place(true, Math.sign(step)); details();
  }
  const pause = ms => { hold = Date.now() + ms; };
  const user = step => { pause(9000); go(step); };

  $$('[data-psc]', sec).forEach(b => b.onclick = () => { setCat(b.dataset.psc, false); pause(6000); });
  $('#psNext', sec).onclick = () => user(1);
  $('#psPrev', sec).onclick = () => user(-1);
  info.onclick = e => { const s = e.target.closest('[data-pss]'); if(s) user(+s.dataset.pss); };
  let sx = null, moved = false;
  stage.onpointerdown = e => { sx = e.clientX; moved = false; };
  stage.onpointermove = e => { if(sx !== null && Math.abs(e.clientX - sx) > 10) moved = true; };
  stage.onpointerup = e => { if(sx === null) return; const dx = e.clientX - sx; sx = null; if(Math.abs(dx) > 40) user(dx > 0 ? 1 : -1); setTimeout(() => moved = false, 0); };
  stage.onclick = e => { const c = e.target.closest('.ps-card'); if(!c || moved) return; const o = +c.dataset.o; if(o > 0) user(o); else if(o === 0) location.hash = '#' + c.dataset.code; };
  sec.addEventListener('keydown', e => { if(e.target.closest('input,textarea')) return; if(e.key === 'ArrowLeft'){ e.preventDefault(); user(1); } else if(e.key === 'ArrowRight'){ e.preventDefault(); user(-1); } });
  sec.addEventListener('pointerenter', e => { if(e.pointerType === 'mouse') pause(4000); });
  sec.addEventListener('pointermove', e => { if(e.pointerType === 'mouse') pause(3000); });
  sec.addEventListener('focusin', () => pause(9000));

  function stop(){ alive = false; clearInterval(timer); ro?.disconnect(); io?.disconnect(); }
  SC.run = { stop };
  let rt; ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(layout, 80); }); ro.observe(stage);
  timer = setInterval(() => {
    if(!alive) return;
    if(!sec.isConnected){ stop(); return; }
    if(Date.now() < hold || document.hidden || RM() || navigator.webdriver) return;
    const r = stage.getBoundingClientRect(); if(r.bottom < 0 || r.top > innerHeight) return;
    go(1);
  }, 5200);
  setCat(SC.cat, true);
  /* الصور لا تُطلب إلا حين يقترب القسم (شاشة واحدة قبل الوصول إليه)، فلا يبطئ أعلى الرئيسية */
  const wake = () => { if(near) return; near = true; io?.disconnect(); io = null; layout(); };
  if('IntersectionObserver' in window){ io = new IntersectionObserver(es => { if(es.some(e => e.isIntersecting)) wake(); }, { rootMargin:'100% 0px 100% 0px' }); io.observe(sec); }
  else wake();
}
