import { CAT_ICON, CAT_TONE, CENTER, KIDS_PROGRAMS, KIDS_ACCREDITATION } from './catalog.js';
import { Store } from './data2.js';
import { LOGOS } from './logos.js';
import { DEFAULT_ABOUT, aboutSectionHtml, initPartnerMarquee, partnersSectionHtml } from './partners.js';
import { $, $$, esc, fmtNum } from './utils.js';
import { countUp, ic, reduceMotion } from './views2_head.js';
import { cat, catSort, cohortPublicState } from './views2_main.js';
import { plansSectionHtml, initPlansMarquee } from './qudurat_views.js';

/* =====================================================================
   الصفحات الافتتاحية — مستوحاة من صفحتي الغلاف والرؤية في دليل برامج المركز
   ===================================================================== */
export const X_URL = 'https://x.com/' + CENTER.x;
export const MAP_URL = CENTER.map;
/* رابط واتساب المركز: برسالة مجهزة يرسلها المستخدم بنفسه (لا إرسال آلي) */
export const waLink = text => text ? `https://wa.me/${CENTER.whatsapp}?text=${encodeURIComponent(text)}` : CENTER.whatsappLink;
const svg = d => `<svg class="ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${d}</svg>`;
export const WA_LOGO = svg('<path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.4-2.9c-.3-.4.3-.4.7-1.3.1-.2 0-.3 0-.5l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.5.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.2.2 1.9 2.9 4.6 4 1.7.7 2.3.7 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/>');
const SOC = [
  ['snapchat', 'سناب شات', `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c3 0 5 2.2 5 5v3l2 1-2 1.2c.6 1.6 1.6 2.6 3 3.2-1 .8-2.2.8-3 1.2l-.5 1.4c-1.3-.2-2.2.2-3 .8-.8.5-2.2.5-3 0-.8-.6-1.7-1-3-.8L7 18.6c-.8-.4-2-.4-3-1.2 1.4-.6 2.4-1.6 3-3.2L5 12l2-1V8c0-2.800 2-5 5-5z"/></svg>`],
  ['tiktok', 'تيك توك', svg('<path d="M16.5 2c.3 2.300 1.600 3.800 3.900 4v3c-1.400.1-2.700-.3-3.900-1v6.200c0 3.200-2.300 5.800-5.600 5.800S5.500 17.600 5.500 14.600c0-3.300 2.800-5.800 6.300-5.300v3.100c-1.600-.4-3.200.5-3.200 2.200 0 1.400 1 2.400 2.400 2.400 1.500 0 2.400-1 2.400-2.800V2z"/>')],
  ['instagram', 'إنستقرام', `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg>`],
];
export const socialHtml = () => `<div class="soc">${SOC.map(([k, t, i]) => `<a href="${CENTER.social[k]}" target="_blank" rel="noopener" aria-label="${t}" title="${t}">${i}</a>`).join('')}<a href="${X_URL}" target="_blank" rel="noopener" aria-label="منصة إكس" title="إكس">${X_LOGO}</a></div>`;
/* المصباح المضيء بعلامة الصح (من غلاف الدليل) مرسومًا بالمتجهات ومتحركًا */
export const BULB_SVG = `<svg class="bulb-art" viewBox="0 0 320 340" aria-hidden="true">
  <defs><radialGradient id="bg1" cx="42%" cy="38%" r="70%"><stop offset="0" stop-color="#FFE27A"/><stop offset=".55" stop-color="#FCC23E"/><stop offset="1" stop-color="#E17D32"/></radialGradient>
  <radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FCD147" stop-opacity=".55"/><stop offset="1" stop-color="#FCD147" stop-opacity="0"/></radialGradient>
  <linearGradient id="base" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#3a3a3a"/><stop offset="1" stop-color="#151515"/></linearGradient></defs>
  <circle class="b-glow" cx="160" cy="140" r="150" fill="url(#glow)"/>
  <g class="b-rays" stroke="#FCC23E" stroke-width="12" stroke-linecap="round">
    <line style="--d:0" x1="160" y1="8" x2="160" y2="34"/><line style="--d:1" x1="236" y1="38" x2="220" y2="58"/><line style="--d:2" x1="84" y1="38" x2="100" y2="58"/>
    <line style="--d:3" x1="282" y1="140" x2="256" y2="140"/><line style="--d:4" x1="38" y1="140" x2="64" y2="140"/>
    <line style="--d:5" x1="252" y1="222" x2="232" y2="208"/><line style="--d:6" x1="68" y1="222" x2="88" y2="208"/></g>
  <g class="b-body"><path d="M160 58c-48 0-84 37-84 82 0 29 15 49 30 64 9 9 14 20 14 32v8h80v-8c0-12 5-23 14-32 15-15 30-35 30-64 0-45-36-82-84-82z" fill="url(#bg1)"/>
    <ellipse cx="128" cy="104" rx="20" ry="30" fill="#fff" opacity=".28" transform="rotate(-24 128 104)"/>
    <path class="b-check" d="M128 140l22 22 42-46" fill="none" stroke="#fff" stroke-width="20" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="118" y="252" width="84" height="18" rx="9" fill="url(#base)"/><rect x="122" y="274" width="76" height="16" rx="8" fill="url(#base)"/><path d="M134 294h52l-8 14h-36z" fill="#151515"/></g>
</svg>`;
export const STAR_SVG = (cls='') => `<svg class="star ${cls}" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#C1E1DC"/><stop offset="1" stop-color="#59A598"/></linearGradient></defs><path d="M50 0C54 34 66 46 100 50 66 54 54 66 50 100 46 66 34 54 0 50 34 46 46 34 50 0z" fill="url(#sg)"/></svg>`;
export const SCROLL_SVG = `<svg class="win-art" viewBox="0 0 120 110" aria-hidden="true"><rect x="34" y="14" width="74" height="84" rx="8" fill="#C1E1DC"/><path d="M108 22v-2a8 8 0 0 0-16 0v70" fill="none" stroke="#1A746B" stroke-width="5"/><rect x="48" y="34" width="44" height="5" rx="2.5" fill="#1A746B"/><rect x="48" y="48" width="36" height="5" rx="2.5" fill="#1A746B"/><rect x="48" y="62" width="40" height="5" rx="2.5" fill="#1A746B"/><path d="M30 98h70" stroke="#59A598" stroke-width="6" stroke-linecap="round"/><g class="medal"><path d="M18 52l-8 22 12-5 6 11 6-22zM46 52l8 22-12-5-6 11-6-22z" fill="#E17D32"/><circle cx="32" cy="40" r="20" fill="#FCD147" stroke="#E1A732" stroke-width="3"/><path d="M32 29l3.4 7 7.6 1.1-5.5 5.3 1.3 7.6-6.8-3.6-6.8 3.6 1.3-7.6-5.5-5.3 7.6-1.1z" fill="#fff"/></g></svg>`;
export const QUOTE_SVG = `<svg class="win-art" viewBox="0 0 120 110" aria-hidden="true"><circle cx="60" cy="55" r="46" fill="#C1E1DC"/><g class="medal" fill="#1A746B"><path d="M36 74V58c0-14 8-24 20-28l3 7c-7 3-10 8-10 14h10v23zM66 74V58c0-14 8-24 20-28l3 7c-7 3-10 8-10 14h10v23z"/></g><circle cx="96" cy="22" r="7" fill="#FCD147"/><circle cx="20" cy="88" r="5" fill="#59A598"/></svg>`;

export function siteFooter(){
  const ph = CENTER.phones;
  return `<footer class="sfoot">
    <div class="sfoot-in">
      <div class="sf-col sf-brand"><span class="sf-logo"><img src="${LOGOS.sama}" alt="شعار مركز سما القدرات للتدريب"></span>
        <p>${CENTER.mission}.</p><span class="sf-cr">سجل تجاري ${CENTER.cr}</span></div>
      <div class="sf-col"><h4>تواصل معنا</h4>
        ${ph.map(n=>`<a class="sf-item" href="tel:${n}" dir="ltr">${ic('activity')}<span>${n}</span></a>`).join('')}
        <a class="sf-item" href="mailto:${CENTER.email}" dir="ltr">${ic('form')}<span>${CENTER.email}</span></a>
        <a class="sf-item" href="${waLink()}" target="_blank" rel="noopener">${WA_LOGO}<span>واتساب المركز</span></a>
        ${socialHtml()}</div>
      <div class="sf-col"><h4>العنوان</h4>
        <a class="sf-item" href="${MAP_URL}" target="_blank" rel="noopener">${ic('pin')}<span>${CENTER.address}</span></a>
        <span class="sf-item">${ic('database')}<span>صندوق البريد ${CENTER.pobox}</span></span>
        <h4 style="margin-top:14px">روابط سريعة</h4>
        <div class="sf-links"><a href="#home">الرئيسية</a><a href="#register">دليل البرامج</a><a href="#checkin">تسجيل الحضور</a><a href="#portals">بوابة المتدرب</a><a href="#verify">التحقق من شهادة</a><a href="#policies">السياسات</a><a href="#contact">تواصل معنا</a></div></div>
      <div class="sf-col"><h4>معتمد من</h4>
        <div class="sf-acc"><span><img src="${LOGOS.tvtc}" alt="المؤسسة العامة للتدريب التقني والمهني"></span><span><img src="${LOGOS.nelc}" alt="المركز الوطني للتعليم الإلكتروني"></span></div>
        <a class="sf-item" href="${CENTER.manar}" target="_blank" rel="noopener" style="margin-top:10px">${ic('award')}<span>منصة منار: إصدار الشهادات المعتمدة</span></a></div>
    </div>
    <div class="sfoot-bar"><span>© ${new Date().getFullYear()} ${CENTER.name}. جميع الحقوق محفوظة.</span><span dir="ltr">${ph.join(' · ')} · ${CENTER.email}</span></div>
  </footer>`;
}
export const X_LOGO = `<svg class="ic" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.8 3h3.1l-6.8 7.7L22 21h-6.2l-4.8-6.3L5.4 21H2.3l7.2-8.3L2 3h6.3l4.4 5.8zm-1.1 16.2h1.7L7.4 4.7H5.6z"/></svg>`;

/* برامج الأطفال: قسم مستقل في الرئيسية، والتسجيل من صفحة البرنامج المعتمد */
function kidsSectionHtml(P){
  const prog = P.find(p => p.accreditation_no === KIDS_ACCREDITATION), href = prog ? '#' + (prog.code || 'p' + KIDS_ACCREDITATION) : '#register';
  return `<section class="kids" id="kids">
    <div class="sec-head" data-reveal><span class="kicker">برامج الأطفال</span><h2>تنمية مهارات <em>القراءة والكتابة</em></h2><p class="hint">برامج حضورية معتمدة (رقم الاعتماد ${KIDS_ACCREDITATION}). يسجّل ولي الأمر طفله بجواله ويتابع حضوره وتقدّمه من بوابته.</p></div>
    <div class="kids-grid">${KIDS_PROGRAMS.map((k, i) => `<article class="card pad kid" data-reveal style="--i:${i}"><span class="pill info">${esc(k.age)}</span><h3>${esc(k.title)}</h3><p>${esc(k.text)}</p>
      <ul>${k.points.map(x => `<li>${ic('check')}<span>${esc(x)}</span></li>`).join('')}</ul><p class="hint">${esc(k.by)}</p>
      <div class="kid-foot"><b>${esc(k.fee)}</b><span><a class="btn pri sm" href="${href}">${ic('form')} التفاصيل والتسجيل</a> <a class="btn sm" target="_blank" rel="noopener" href="${waLink('السلام عليكم، أستفسر عن: ' + k.title)}">${WA_LOGO} استفسار</a></span></div></article>`).join('')}</div>
  </section>`;
}

/* صفحة «تواصل معنا»: كل قنوات المركز في مكان واحد (بدل صفحة الروابط الخارجية) */
export function viewContact(){
  const card = (href, icon, title, sub, ext = true) => `<a class="card pad ct-card rv" href="${href}" ${ext ? 'target="_blank" rel="noopener"' : ''}><span class="kic-lg t-info">${icon}</span><b>${title}</b><span class="hint" ${/^[0-9+@a-z. ]+$/i.test(sub) ? 'dir="ltr"' : ''}>${sub}</span></a>`;
  $('#app').innerHTML = `<div class="wrap"><div class="sec-head rv" style="margin-bottom:18px"><span class="kicker">تواصل معنا</span><h2>قنوات <em>${esc(CENTER.name)}</em></h2><p class="hint">${esc(CENTER.address)}</p></div>
    <h3 class="ct-h">التواصل المباشر</h3><div class="ct-grid">
      ${card(waLink('السلام عليكم، لدي استفسار عن برامج مركز سما القدرات.'), WA_LOGO, 'واتساب المركز', 'للاستفسار والتسجيل ومتابعة السداد')}
      ${CENTER.phones.map(n => card('tel:' + n, ic('activity'), 'اتصال', n, false)).join('')}
      ${card('mailto:' + CENTER.email, ic('form'), 'البريد الإلكتروني', CENTER.email, false)}
      ${card(CENTER.map, ic('pin'), 'موقعنا على الخريطة', 'خرائط قوقل')}</div>
    <h3 class="ct-h">منصات التواصل الاجتماعي</h3><div class="ct-grid">
      ${card(CENTER.social.snapchat, SOC[0][2], 'سناب شات', 'samagodrat.sa')}${card(CENTER.social.tiktok, SOC[1][2], 'تيك توك', '@samagodrat.sa')}${card(CENTER.social.instagram, SOC[2][2], 'إنستقرام', 'samagodrat.sa')}${card(X_URL, X_LOGO, 'إكس', '@' + CENTER.x)}
      ${card(CENTER.telegram, ic('book'), 'قناة تيليجرام', 'مواد علمية خاصة بالقدرات')}</div>
    <h3 class="ct-h">البرامج والخدمات</h3><div class="ct-grid">
      ${card('#register', ic('book'), 'البرامج التدريبية', 'دليل البرامج المعتمدة والتسجيل', false)}${card('#home', ic('award'), 'باقات القدرات والتحصيلي', 'الباقات والأسعار والتسجيل', false)}${card('#enroll', ic('form'), 'سجّل الآن', 'نموذج التسجيل الموحّد', false)}
      ${card(CENTER.manar, ic('award'), 'منصة منار', 'إصدار الشهادات المعتمدة من المؤسسة العامة للتدريب التقني والمهني')}</div></div>${siteFooter()}`;
}

export async function viewHome(){
  const app=$('#app');
  let data={programs:[],packages:[]}, site={about:DEFAULT_ABOUT, partners:[]}, pl={plans:[]}; try{ [data, site, pl] = await Promise.all([Store.catalog(), Store.publicSite().catch(()=>site), Store.publicPlans().catch(()=>pl)]); }catch(e){}
  const P=data.programs, open=P.filter(p=>cohortPublicState(p.cohort).k==='open'), cats=[...new Set(P.map(p=>p.category))].sort(catSort);
  const hours=P.reduce((s,p)=>s+(p.hours||0),0);
  app.innerHTML = `<div class="home">
    <section class="cover">
      <div class="cover-card">
        <div class="cover-logos" data-reveal><span><img src="${LOGOS.tvtc}" alt="المؤسسة العامة للتدريب التقني والمهني"></span><span><img src="${LOGOS.nelc}" alt="المركز الوطني للتعليم الإلكتروني"></span><span class="main"><img src="${LOGOS.sama}" alt="مركز سما القدرات للتدريب"></span></div>
        <div class="cover-grid">
          <div class="cover-art" data-reveal style="--i:2">${BULB_SVG}<i class="dot d1"></i><i class="dot d2"></i><i class="dot d3"></i></div>
          <div class="cover-text">
            ${STAR_SVG('s1')}
            <h1 data-reveal style="--i:1"><span class="t1">منصة مركز سما القدرات للتدريب</span><span class="rule"></span><span class="t2">أهلًا بكم في المنصة الرقمية</span></h1>
            <p data-reveal style="--i:3">${fmtNum(P.length)} برنامجًا تدريبيًا معتمدًا في ${fmtNum(cats.length)} مجالات، بإشراف ${CENTER.accreditor}. سجّل في الدفعة المفتوحة، وتابع حضورك بباركود برنامجك.</p>
            <div class="cover-cta" data-reveal style="--i:4"><a class="btn pri lg" href="#enroll" id="ctaEnroll">${ic('form')} سجّل الآن</a><a class="btn lg ghost-t" href="#register">${ic('book')} استعرض البرامج</a><a class="btn lg ghost-t" href="#checkin">${ic('qr')} تسجيل الحضور</a></div>
          </div>
        </div>
        <ul class="cover-stats" data-reveal style="--i:5">
          <li><b data-count="${P.length}">0</b><span>برنامجًا معتمدًا</span></li>
          <li><b data-count="${cats.length}">0</b><span>مجالات تدريبية</span></li>
          <li><b data-count="${open.length}">0</b><span>دفعات مفتوحة الآن</span></li>
          <li><b data-count="${hours}">0</b><span>ساعة تدريبية</span></li>
        </ul>
        <svg class="chev" viewBox="0 0 260 300" aria-hidden="true"><path d="M260 0v300L120 220l70-70-70-70z" fill="#C1E1DC" opacity=".55"/><path d="M200 60l-80 90 80 90" fill="none" stroke="#59A598" stroke-width="34" stroke-linejoin="round" opacity=".5"/></svg>
      </div>
    </section>

    ${aboutSectionHtml(site.about, P)}

    <section class="about">
      <div class="sec-head" data-reveal><span class="kicker">من نحن</span><h2>بيت الخبرة الأول <em>في منطقة جازان</em></h2></div>
      <div class="windows">
        <article class="win" data-reveal style="--i:1"><div class="win-top"><div><h3>رؤيتنا</h3><span class="tag">OUR VISION</span></div>${SCROLL_SVG}</div>
          <p>${CENTER.vision}.</p><span class="win-mark">”</span></article>
        <article class="win alt" data-reveal style="--i:2"><div class="win-top"><div><h3>رسالتنا</h3><span class="tag">OUR MISSION</span></div>${QUOTE_SVG}</div>
          <p>${CENTER.mission}.</p><span class="win-mark">”</span></article>
      </div>
    </section>

    <section class="domains">
      <div class="sec-head" data-reveal><span class="kicker">مجالاتنا</span><h2>${fmtNum(cats.length)} مجالات تدريبية <em>معتمدة</em></h2></div>
      <div class="dom-grid">${cats.map((c,i)=>{ const n=P.filter(p=>p.category===c).length, o=P.filter(p=>p.category===c&&cohortPublicState(p.cohort).k==='open').length;
        return `<button class="dom t-${CAT_TONE[c]==='brand'?'info':CAT_TONE[c]||'info'}" data-cat="${esc(c)}" data-reveal style="--i:${i}"><span class="kic-lg">${ic(CAT_ICON[c]||'book')}</span><b>${esc(c)}</b><span>${fmtNum(n)} برنامج${o?` · <em>${fmtNum(o)} مفتوح</em>`:''}</span><i class="go">${ic('next')}</i></button>`; }).join('')}</div>
    </section>

    ${plansSectionHtml(pl.plans)}

    ${kidsSectionHtml(P)}

    ${partnersSectionHtml(site.partners)}

    <section class="steps3">
      <div class="sec-head" data-reveal><span class="kicker">كيف تبدأ</span><h2>ثلاث خطوات <em>من التسجيل إلى الشهادة</em></h2></div>
      <ol class="st-grid">
        <li data-reveal style="--i:0"><span class="n">١</span>${ic('form')}<b>سجّل في الدفعة</b><span>اختر البرنامج من الدليل، وأكمل نموذج دفعته المفتوحة برقم سجلك المدني.</span></li>
        <li data-reveal style="--i:1"><span class="n">٢</span>${ic('qr')}<b>امسح باركود البرنامج</b><span>في كل يوم تدريبي امسح الباركود الثابت للبرنامج في القاعة.</span></li>
        <li data-reveal style="--i:2"><span class="n">٣</span>${ic('award')}<b>احضر وأتمّ برنامجك</b><span>يُطابَق سجلك مع كشف الدفعة فيُسجَّل حضورك ووقته تلقائيًا.</span></li>
      </ol>
    </section>
    ${siteFooter()}
  </div>`;
  $$('.dom').forEach(b=>b.onclick=()=>{ cat.kind='program'; cat.cf=b.dataset.cat; location.hash='#register'; });
  revealOnScroll(app);
  initPartnerMarquee(site.partners||[]);
  initPlansMarquee(pl.plans||[]);
}
/* الكشف عند التمرير + عدّ الأرقام عند ظهورها */
export function revealOnScroll(root){
  const els=$$('[data-reveal]',root);
  if(reduceMotion() || !('IntersectionObserver' in window)){ els.forEach(e=>e.classList.add('in')); countUp(root); return; }
  const io=new IntersectionObserver(ents=>ents.forEach(en=>{ if(!en.isIntersecting) return; en.target.classList.add('in'); if(en.target.querySelector('[data-count]')) countUp(en.target); io.unobserve(en.target); }),{threshold:.15, rootMargin:'0px 0px -40px 0px'});
  els.forEach(e=>io.observe(e));
}
