import { startLiveRefresh } from './live_refresh.js';
import { initBankMedia } from './bank_media.js';
import { mountAssistant } from './assistant_chat.js';
/* =====================================================================
   البوابات: المتدرب، والمدرب، وولي الأمر. لكل بوابة صفحة مستقلة ودور محدد،
   والبيانات محصورة بالدور من الخادم (portalData). الحساب من portal_logic.js.
   ===================================================================== */
import { mountGuide } from './guide_link.js';
import { showWelcome, shouldWelcome, welcomeState } from './welcome.js';
import { CENTER } from './catalog.js';
import { waLink, WA_LOGO } from './landing.js';
import { $, $$, esc, fmtNum, fmtDate, fmtShort, riyadhNow, t12, DAYS } from './utils.js';
import { ic, emptyBox, ringSvg, toast, statusPill, applyTheme, getTheme, setTheme } from './views2_head.js';
import { Store, initStore, cohortItemsOf, LEVEL_TXT, enrollmentStats, isSessionDay, cohortState } from './data2.js';
import { setPage, publicBase } from './config.js';
import { LOGO } from './assets/logo.js';
import { PORTAL_PHOTO } from './portal_art.js';
import { studentDashboard, teacherDashboard, guardianDashboard, ROLE_TXT, NOTIFY_TPL, normPhone, progressGauge, GAUGE_RED, mirrorData } from './portal_logic.js';
import { modal, closeModal } from './views2_programs.js';
import { setBusy, toLatin, liveSay } from './features.js';
import { studentHomework, studentLevel, studentMessages, studentRating, teacherHomework, teacherBank, teacherMessages, teacherRatings } from './learning_views.js';
import { assignmentsFor } from './learning_logic.js';
import { mountInbox, unmountInbox } from './inbox_ui.js';
import { NO_WINDOW, PW_RULE, pwOk, checkPassword } from './device_logic.js';
import { analysisHtml } from './analysis_views.js';
import { weeklyCard, bindWeeklyCard } from './weekly_views.js';
import { initPwa } from './pwa.js';
import { ordersCardHtml, bindOrdersCard } from './order_panel.js';
import { planOfOrder } from './order_logic.js';
import { teacherLive, studentLive } from './studio_views.js';
import { lectureState } from './studio_logic.js';
import { teacherGroups, teacherProfile, teacherPeople, daySummaryHtml, trainersCardHtml, printDaySheet } from './trainer_views.js';

const S_TABS = [['dash','chart','لوحتي'],['live','tv','البث المباشر'],['hw','form','واجباتي'],['level','spark','قياس مستواي'],['msg','chat','المراسلة'],['rate','award','تقييم المدرب']];
const T_TABS = [['today','calendar','كشف اليوم'],['people','user','متدربيّ'],['groups','users','المجموعات'],['cohorts','users','دفعات البرامج'],['hw','form','الواجبات'],['live','tv','البث المباشر'],['bank','database','بنك الأسئلة والنتائج'],['msg','chat','الرسائل'],['rate','award','تقييماتي'],['profile','id','ملفي']];
let sTab = 'dash', tTab = 'today', welcomed = false;
const tabBar = (tabs, cur, attr, badges = {}) => tabs.length < 2 ? '' : `<div class="tabs ptabs" role="tablist">${tabs.map(([k, i, l]) => `<button class="tab" role="tab" ${attr}="${k}" aria-selected="${cur === k}">${ic(i)}${l}${badges[k] ? ` <span class="badge-n">${fmtNum(badges[k])}</span>` : ''}</button>`).join('')}</div>`;

const TITLES = { student:'بوابة المتدرب', teacher:'بوابة المدرب', guardian:'بوابة ولي الأمر' };
const KIND_TXT = { absence:'غياب', late:'تأخر', reminder:'تذكير بالحضور', homework:'واجب', general:'رسالة' };
let ROLE = 'student', timer = null;

export function bootPortal(role){
  ROLE = role; setPage('portal'); initStore(); applyTheme(getTheme());
  $('#themeBtn').onclick = () => { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); };
  $('#portalTitle').textContent = TITLES[role];
  $('#homeLink').href = publicBase() + '#home';
  window.addEventListener('hashchange', render);
  render();
  startLiveRefresh(Store, render, { minGap: 5000 });
  mountAssistant(Store);
  initPwa(); initBankMedia();
  mountGuide(role);
}

let rendering = null, renderPending = false;
function render(){
  renderPending = true;
  if(!rendering) rendering = (async () => {
    try { while(renderPending){ renderPending=false; await renderPortal(); } }
    finally { rendering=null; }
  })();
  return rendering;
}
async function renderPortal(){
  clearInterval(timer);
  const s = await Store.portalSession(ROLE);
  $('#logoutBtn').hidden = !s;
  if(!s){ unmountInbox(); mountDevicesBtn(false); return viewLogin(); }
  $('#logoutBtn').onclick = async () => { unmountInbox(); await Store.portalLogout(ROLE); location.hash = ''; render(); };
  mountDevicesBtn(!!s);
  { let st = null; try { st = await Store.passwordStatus(ROLE); } catch(_){} if(st?.must_set){ unmountInbox(); return viewSetPassword(st); } }
  mountInbox(ROLE, s.phone, {
    onOpen: it => { if(it.action === 'msg'){ if(ROLE === 'student') sTab = 'msg'; if(ROLE === 'teacher') tTab = 'msg'; } else if(ROLE !== 'guardian'){ if(ROLE === 'student') sTab = 'dash'; } render(); },
    onNew: () => { if($('.modal-bg') || document.activeElement?.matches('input,textarea,select')) return; render(); } });
  try {
    const D = await Store.portalData(ROLE);
    if(ROLE === 'student') return viewStudent(D);
    if(ROLE === 'teacher'){ viewTeacher(D); timer = setInterval(async () => { if(!$('#tSheet') || $('.modal-bg')) return; try { viewTeacher(await Store.portalData('teacher'), true); } catch(_){} }, 30000); return; }
    return viewGuardian(D, s);
  } catch(e){ $('#app').innerHTML = `<div class="wrap">${emptyBox('تعذّر تحميل البيانات', esc(e.message))}</div>`; }
}

/* ---------- أجهزتي (الخطوة BI): إضافة جهاز آخر برمز ربط، والخروج من الأجهزة الأخرى ---------- */
function mountDevicesBtn(on){
  let b = $('#devBtn');
  if(!b){ const lo = $('#logoutBtn'); if(!lo) return; b = document.createElement('button'); b.className = 'btn sm'; b.id = 'devBtn'; b.innerHTML = `${ic('smartphone')} أجهزتي`; lo.before(b); b.onclick = devicesModal; }
  b.hidden = !on;
}
async function devicesModal(){
  let n = 0, st = { has:false }; try { n = (await Store.myDevices(ROLE))?.count || 0; st = await Store.passwordStatus(ROLE) || st; } catch(_){}
  modal(`<h3>${ic('smartphone')} أجهزتي وكلمة المرور</h3><p>الأجهزة الداخلة إلى حسابك الآن: <b class="num">${fmtNum(n)}</b></p>
    <section class="card pad" style="margin:0 0 12px"><h4 style="margin:0 0 6px">${st.has ? 'تغيير كلمة المرور' : 'تعيين كلمة مرور'}</h4>
      <p class="hint" style="margin:0 0 8px">تدخل بها من أي جهاز مع رقم هويتك. بعد الحفظ تخرج أجهزتك الأخرى. ${esc(PW_RULE)}.</p>
      <form id="cpF" class="grid" novalidate>
        ${st.has ? `<div class="field"><label for="cp-cur">كلمة المرور الحالية</label><div class="pw-wrap"><input class="inp" id="cp-cur" type="password" maxlength="72" dir="ltr" autocomplete="current-password">${PW_EYE('cp-cur')}</div></div>` : ''}
        <div class="field"><label for="cp-new">كلمة المرور الجديدة</label><div class="pw-wrap"><input class="inp" id="cp-new" type="password" maxlength="72" dir="ltr" autocomplete="new-password">${PW_EYE('cp-new')}</div></div>
        <div class="field"><label for="cp-conf">تأكيدها</label><div class="pw-wrap"><input class="inp" id="cp-conf" type="password" maxlength="72" dir="ltr" autocomplete="new-password">${PW_EYE('cp-conf')}</div></div>
        <div class="errtxt" id="cpE" role="alert"></div><button class="btn pri" id="cpGo">${ic('check')} حفظ</button></form></section>
    <section class="card pad" style="margin:0 0 12px"><h4 style="margin:0 0 6px">الخروج من جميع الأجهزة الأخرى</h4>
      <p class="hint" style="margin:0 0 8px">إن فقدت جهازًا أو دخل غيرك بكلمة مرورك: يبقى هذا الجهاز وحده، ويُنصح بتغيير كلمة المرور.</p>
      <button class="btn" id="dvOthers" ${n > 1 ? '' : 'disabled'}>${ic('logout')} الخروج من الأجهزة الأخرى</button></section>
    <div style="text-align:end"><button class="btn" id="dvX">إغلاق</button></div>`);
  bindEyes($('.modal')); $('#dvX').onclick = closeModal;
  $('#cpF').onsubmit = async e => { e.preventDefault(); const b = $('#cpGo'); $('#cpE').textContent = '';
    try { checkPassword($('#cp-new').value, $('#cp-conf').value); if(st.has && !$('#cp-cur').value) throw new Error('اكتب كلمة المرور الحالية');
      setBusy(b, true, 'جارٍ الحفظ'); const r = await Store.setPortalPassword(ROLE, $('#cp-new').value, st.has ? $('#cp-cur').value : null);
      toast(r?.revoked ? `حُفظت كلمة المرور، وخرج حسابك من ${fmtNum(r.revoked)} جهاز آخر` : 'حُفظت كلمة المرور'); closeModal(); }
    catch(x){ setBusy(b, false); $('#cpE').textContent = x.message; } };
  $('#dvOthers').onclick = async () => { if(!confirm('سيخرج حسابك من كل الأجهزة الأخرى. متابعة؟')) return; const b = $('#dvOthers'); setBusy(b, true, 'جارٍ الإخراج');
    try { const r = await Store.logoutOthers(ROLE); toast(`خرج حسابك من ${fmtNum(r?.revoked || 0)} جهاز`); closeModal(); } catch(e){ setBusy(b, false); toast(e.message); } };
}

/* الدخول (الخطوة BJ، قرار المالك): من أي جهاز برقم الهوية وكلمة المرور. أول مرة (أو «نسيت كلمة المرور»): رقم الهوية ← رمز التحقق
   بعد تفعيل الإدارة ← تعيين كلمة مرور. في الوضع التجريبي يبدأ برمز التحقق (1234) لتبقى اختبارات البوابات كما هي */
let loginMode = null;
/* قرار المالك 18 نوفمبر: الجهاز الذي عُيّنت فيه كلمة المرور أو دخل بها لا يعرض «أول دخول برمز التحقق»؛ تبقى «نسيت كلمة المرور» */
const PW_KNOWN = () => 'sama_pw_known_' + ROLE;
const pwKnown = () => { try { return localStorage.getItem(PW_KNOWN()) === '1'; } catch(_){ return false; } };
const markPwKnown = () => { try { localStorage.setItem(PW_KNOWN(), '1'); } catch(_){} };
const PW_EYE = id => `<button type="button" class="btn sm pw-eye" data-eye="${id}" aria-label="إظهار كلمة المرور" aria-pressed="false">${ic('eye')}</button>`;
function bindEyes(root = document){ $$('[data-eye]', root).forEach(b => b.onclick = () => { const i = $('#' + b.dataset.eye), on = i.type === 'password'; i.type = on ? 'text' : 'password'; b.setAttribute('aria-pressed', String(on)); }); }
function viewLogin(){
  const demo = Store.mode !== 'cloud';
  const mode = loginMode || (demo && !pwKnown() ? 'code' : 'pw'), forgot = mode === 'forgot', codeMode = mode !== 'pw';
  $('#app').innerHTML = `<div class="wrap"><div class="login card rv">
    <div class="checkin" style="max-width:none"><div class="head${PORTAL_PHOTO[ROLE] ? ' ph' : ''} pr-${ROLE}">${PORTAL_PHOTO[ROLE] ? `<img class="lg-photo" src="${PORTAL_PHOTO[ROLE]}" alt="">` : ''}<img src="${LOGO}" alt=""><h2>${TITLES[ROLE]}</h2><div class="hint">${ROLE === 'guardian' ? 'ادخل برقم هوية ابنك المسجّل في المعهد' : 'ادخل برقم هويتك المسجّل في المعهد'}</div></div></div>
    <form id="pl" class="grid pad" novalidate data-mode="${mode}">
      <div class="field"><label for="pl-phone">${ROLE === 'guardian' ? 'رقم هوية المتدرب (ابنك)' : 'رقم الهوية'}</label><input class="inp num" id="pl-phone" name="phone" inputmode="numeric" maxlength="10" dir="ltr" placeholder="10 أرقام" autocomplete="off"></div>
      ${codeMode ? `<p class="hint" style="margin:0" id="plModeH">${forgot ? 'نسيت كلمة المرور: اطلب من إدارة المركز «تفعيل» حسابك، ثم اكتب هويتك واضغط «رمز التحقق» فيظهر الرمز على هذا الجهاز، وبعد الدخول تختار كلمة مرور جديدة وتخرج أجهزتك الأخرى.' : 'أول دخول: بعد أن تفتح إدارة المركز «تفعيل» حسابك اضغط «رمز التحقق» فيظهر الرمز على هذا الجهاز، وبعد الدخول تختار كلمة مرورك.'}</p>
      <div class="otp-show" id="otpShow" hidden aria-live="polite"></div>
      <div class="field" id="otpF" hidden><label for="pl-code" id="plCodeL">رمز التحقق</label><input class="inp num" id="pl-code" name="code" inputmode="numeric" maxlength="6" dir="ltr" autocomplete="one-time-code"></div>`
      : `<div class="field"><label for="pl-pass">كلمة المرور</label><div class="pw-wrap"><input class="inp" id="pl-pass" name="password" type="password" maxlength="72" dir="ltr" autocomplete="current-password">${PW_EYE('pl-pass')}</div></div>`}
      <div class="errtxt" id="plE" role="alert"></div>
      <button class="btn pri" id="plB">${codeMode ? `${ic('lock')} رمز التحقق` : `${ic('check')} دخول`}</button>
      <div class="pl-links">${codeMode ? `<button type="button" class="btn sm" id="plPw">${ic('lock')} الدخول بكلمة المرور</button>`
        : `${pwKnown() ? '' : `<button type="button" class="btn sm" id="plFirst">${ic('key')} أول دخول برمز التحقق</button>`}<button type="button" class="btn sm" id="plForgot">نسيت كلمة المرور؟</button>`}</div>
      ${demo ? `<div class="alert t-gold"><span class="aic">${ic('alert')}</span><span>بيانات تجريبية: رمز التحقق <b>1234</b>.${ROLE === 'teacher' ? ' جرّب رقم المدرب <b dir="ltr">0501000003</b>.' : ROLE === 'guardian' ? ' جرّب رقم ولي الأمر <b dir="ltr">0509000010</b>.' : ' جرّب رقم المتدرب <b dir="ltr">0550000001</b> أو المتدربة <b dir="ltr">0550000002</b> (باقات)، أو <b dir="ltr">0550000003</b> (برنامج تدريبي).'}</span></div>` : ''}
    </form></div></div>`;
  const ph = $('#pl-phone'), code = $('#pl-code'), pass = $('#pl-pass');
  [ph, code].filter(Boolean).forEach(i => i.addEventListener('input', () => { i.value = toLatin(i.value).replace(/\D/g, ''); }));
  bindEyes();
  const go = m => { const v = ph.value; loginMode = m; viewLogin(); $('#pl-phone').value = v; };
  if($('#plPw')) $('#plPw').onclick = () => go('pw');
  if($('#plFirst')) $('#plFirst').onclick = () => go('code');
  if($('#plForgot')) $('#plForgot').onclick = () => go('forgot');
  let step = 1;
  $('#pl').onsubmit = async e => { e.preventDefault(); const b = $('#plB'); $('#plE').textContent = '';
    try {
      if(!/^([12]\d{9}|05\d{8})$/.test(ph.value)) throw new Error('رقم الهوية 10 أرقام');
      if(!codeMode){ if(!pass.value) throw new Error('اكتب كلمة المرور');
        setBusy(b, true, 'جارٍ الدخول'); await Store.passwordLogin(ph.value, ROLE, pass.value); markPwKnown(); loginMode = null; render(); return; }
      if(step === 1){
        setBusy(b, true, 'جارٍ التحقق'); const rq = await Store.requestOtp(ph.value, ROLE); setBusy(b, false);
        // الرمز يظهر على هذا الجهاز وحده عند فتح الإدارة «تفعيل» الحساب، ثم يختفي بعد الدخول
        if(!rq?.open && !demo){ $('#otpShow').hidden = true; throw new Error(NO_WINDOW); }
        $('#otpShow').hidden = false;
        $('#otpShow').innerHTML = rq?.code ? `<span>رمز التحقق لهذا الجهاز</span><b class="num" dir="ltr">${esc(rq.code)}</b><small>اكتبه في الخانة أدناه. لا تشاركه مع أحد.</small>`
          : `<span>الوضع التجريبي</span><b class="num" dir="ltr">1234</b><small>${esc(NO_WINDOW)}</small>`;
        step = 2; $('#otpF').hidden = false; ph.readOnly = true; b.innerHTML = `${ic('check')} دخول`; code.focus(); liveSay('ظهر رمز التحقق'); return; }
      if(!/^\d{4,6}$/.test(code.value)) throw new Error('اكتب رمز التحقق');
      setBusy(b, true, 'جارٍ التحقق'); await Store.portalLogin(ph.value, code.value, ROLE); loginMode = null; render();
    } catch(x){ setBusy(b, false); if(codeMode && step === 2) b.innerHTML = `${ic('check')} دخول`; $('#plE').textContent = x.message; } };
}

/* تعيين كلمة المرور بعد أول دخول أو بعد «نسيت كلمة المرور» (إلزامي قبل البوابة) */
function viewSetPassword(st){
  $('#app').innerHTML = `<div class="wrap"><div class="login card rv"><div class="pad">
    <h2 style="margin:0 0 6px">${ic('lock')} ${st.has ? 'اختر كلمة مرور جديدة' : 'اختر كلمة مرور لحسابك'}</h2>
    <p class="hint" style="margin:0 0 12px">ستدخل بعدها من أي جهاز برقم هويتك وهذه الكلمة. ${st.has ? 'تخرج أجهزتك الأخرى بعد الحفظ.' : ''} ${esc(PW_RULE)}.</p>
    <form id="psF" class="grid" novalidate>
      <div class="field"><label for="ps-new">كلمة المرور</label><div class="pw-wrap"><input class="inp" id="ps-new" type="password" maxlength="72" dir="ltr" autocomplete="new-password">${PW_EYE('ps-new')}</div></div>
      <div class="field"><label for="ps-conf">تأكيد كلمة المرور</label><div class="pw-wrap"><input class="inp" id="ps-conf" type="password" maxlength="72" dir="ltr" autocomplete="new-password">${PW_EYE('ps-conf')}</div></div>
      <div class="errtxt" id="psE" role="alert"></div>
      <button class="btn pri" id="psGo">${ic('check')} حفظ والمتابعة</button>
    </form></div></div></div>`;
  bindEyes(); $('#ps-new').focus();
  $('#psF').onsubmit = async e => { e.preventDefault(); const b = $('#psGo'), n = $('#ps-new'), c = $('#ps-conf'); $('#psE').textContent = ''; [n, c].forEach(x => x.removeAttribute('aria-invalid'));
    try { checkPassword(n.value, c.value); setBusy(b, true, 'جارٍ الحفظ'); await Store.setPortalPassword(ROLE, n.value); markPwKnown(); loginMode = null; toast('حُفظت كلمة المرور'); render(); }
    catch(x){ setBusy(b, false); $('#psE').textContent = x.message; (pwOk(n.value) ? c : n).setAttribute('aria-invalid', 'true'); } };
}

/* ---------- بطاقات المتدرب الثلاث (تُستخدم لولي الأمر أيضًا) ---------- */
/* عداد الأداء العام: نصف دائرة أحمر ← أصفر ← أخضر، وإبرة على المتوسط */
function gaugeSvg(g){
  const W = 240, cx = 120, cy = 120, r = 92, sw = 20;
  const pt = (v, rr = r) => { const t = Math.PI * (1 - v / 100); return [cx + rr * Math.cos(t), cy - rr * Math.sin(t)]; };
  const arc = (v1, v2, cls) => { const [x1, y1] = pt(v1), [x2, y2] = pt(v2); return `<path class="${cls}" d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}"/>`; };
  const tick = v => { const [x1, y1] = pt(v, r + sw / 2 + 2), [x2, y2] = pt(v, r + sw / 2 + 8), [tx, ty] = pt(v, r + sw / 2 + 18);
    return `<line class="gg-tick" x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/><text class="gg-num" x="${tx.toFixed(1)}" y="${(ty + 4).toFixed(1)}">${fmtNum(v)}</text>`; };
  const v = g.score ?? 0, deg = -90 + 180 * v / 100;
  return `<svg class="gg" viewBox="-18 -8 ${W + 36} 150" role="img" aria-label="${g.score == null ? 'مؤشر الأداء العام: يبدأ القياس من أول يوم حضور' : `مؤشر الأداء العام ${g.score} من 100: ${g.label}`}">
    ${arc(0, GAUGE_RED, 'gg-r')}${arc(GAUGE_RED, g.thr, 'gg-y')}${arc(g.thr, 100, 'gg-g')}
    ${[0, GAUGE_RED, g.thr, 100].map(tick).join('')}
    ${g.score == null ? '' : `<g class="gg-needle" style="--to:${deg.toFixed(1)}deg"><path d="M${cx - 5} ${cy} L${cx} ${cy - r + 6} L${cx + 5} ${cy} Z"/></g>`}
    <circle class="gg-hub" cx="${cx}" cy="${cy}" r="9"/>
  </svg>`;
}
const achTone = v => v == null ? 'g' : v < GAUGE_RED ? 'bad' : v < 75 ? 'warn' : 'ok';
export function achievementPill(a){ return a.overall == null ? '<span class="pill g">—</span>' : `<span class="pill ach ${achTone(a.overall)}">${fmtNum(a.overall)}٪</span>`; }
/* نسبة الإنجاز: نفس البطاقة للمتدرب وولي أمره وللمدرب (مرآة) */
export function achievementHtml(it){
  const a = it.achievement, row = (lbl, v, txt) => `<li data-zone="${v == null ? '' : v < GAUGE_RED ? 'red' : v < it.threshold ? 'yellow' : 'green'}"><span class="ga-l">${lbl}</span>
    <span class="ga-bar" role="img" aria-label="${lbl}: ${v == null ? 'غير متاح بعد' : v + '٪'}"><i style="width:${v ?? 0}%"></i></span><b class="num">${v == null ? '—' : fmtNum(v) + '٪'}</b><span class="hint">${txt}</span></li>`;
  return `<div class="card pad ach-card rv"><div class="ach-head"><div class="ind-h">${ic('flag')}<b>نسبة الإنجاز</b><span class="ind-sub">من مدة الباقة كاملة حتى نهايتها</span></div>
      <div class="ach-big num">${a.overall == null ? '—' : fmtNum(a.overall) + '٪'}</div></div>
    <ul class="gauge-axes">
      ${row('الحضور', a.attendance, a.total ? `أيام الحضور: ${fmtNum(a.attended)} من أصل ${fmtNum(a.total)} مقررة في الباقة` : 'يبدأ من أول يوم حضور')}
      ${row('الواجبات', a.homework, a.sent ? `الواجبات المحلولة: ${fmtNum(a.solved)} من أصل ${fmtNum(a.sent)} مرسلة` : 'لم يُرسل واجب بعد')}
    </ul>
    <p class="hint" style="margin:10px 0 0">الإنجاز = متوسط نسبة الحضور من مدة الباقة كاملة، ونسبة الواجبات المحلولة من المرسلة. وهي النسبة نفسها التي يراها المدرب.</p></div>`;
}
export function gaugeHtml(it){
  const g = progressGauge(it), zt = { red:'danger', yellow:'gy', green:'success' };
  return `<div class="card pad gauge-card rv" data-zone="${g.zone || 'none'}"><div class="ind-h">${ic('activity')}<b>مؤشر الأداء العام</b><span class="ind-sub">أداؤك حتى اليوم في الجلسات التي انعقدت</span></div>
    <div class="gauge-body"><div class="gauge-dial">${gaugeSvg(g)}<div class="gauge-val">${g.score == null ? '<span class="hint">—</span>' : `<b class="num">${fmtNum(g.score)}</b><span>من ١٠٠</span>`}</div>
      <span class="pill gauge-lbl ${g.zone ? zt[g.zone] : ''}">${g.label}</span></div>
      <ul class="gauge-axes">${g.axes.map(x => { const z = x.value == null ? '' : x.value < GAUGE_RED ? 'red' : x.value < g.thr ? 'yellow' : 'green';
        return `<li data-zone="${z}"><span class="ga-l">${x.label}</span><span class="ga-bar" role="img" aria-label="${x.label}: ${x.value == null ? 'غير متاح بعد' : x.value + '٪'}"><i style="width:${x.value ?? 0}%"></i></span><b class="num">${x.value == null ? '—' : fmtNum(x.value) + '٪'}</b><span class="hint">${esc(x.detail)}</span></li>`; }).join('')}</ul></div>
    <p class="hint" style="margin:10px 0 0">متوسط المحاور الثلاثة: الحضور، ونجاح أداء الواجبات، والمؤقت الزمني (أعلى نسبة حضور نهائية ما زالت ممكنة في المدة المتبقية). الأخضر يبدأ من ${fmtNum(g.thr)}٪ وهو حد استحقاق الشهادة.</p>
  </div>`;
}
export function studentPanelHtml(it, links = false){
  const a = it.attendance, hw = it.homework, tm = it.time;
  /* عناوين البطاقات تفتح تفاصيلها في بوابة المتدرب (طلب المالك 18 نوفمبر) */
  const head = (k, icon, title) => links ? `<button type="button" class="ind-h ind-link" data-ind="${k}" aria-label="${title}: عرض التفاصيل">${ic(icon)}<b>${title}</b><span class="ind-more">التفاصيل ${ic('prev')}</span></button>` : `<div class="ind-h">${ic(icon)}<b>${title}</b></div>`;
  const tone = a.rate == null ? 'success' : a.rate < 75 ? 'warning' : 'success';
  return `${gaugeHtml(it)}${achievementHtml(it)}<div class="ind3">
    <div class="card pad ind rv" style="--i:1">${head('att', 'check', 'الحضور والغياب')}
      ${a.held ? `<div class="ind-ring">${ringSvg(a.rate ?? 0, 92, 9, tone)}</div><div class="ind-nums"><span><b>${fmtNum(a.attended)}</b>حضور</span><span><b>${fmtNum(a.late)}</b>تأخر</span><span><b>${fmtNum(a.absent)}</b>غياب</span></div>
        <p class="hint">من ${fmtNum(a.held)} جلسة منعقدة، ويتبقى ${fmtNum(a.remaining)} جلسة.</p>` : `<p class="ind-empty">${it.start_date ? 'لا توجد جلسات منعقدة بعد' : 'يبدأ الاشتراك من أول يوم تحضر فيه'}</p>`}</div>
    <div class="card pad ind rv" style="--i:2">${head('hw', 'form', 'أداء الواجبات')}
      ${hw.due ? `<div class="ind-ring">${ringSvg(hw.pct, 92, 9, hw.pct < 75 ? 'warning' : 'success')}</div><p class="hint">سلّمت ${fmtNum(hw.done)} من ${fmtNum(hw.due)} واجبًا مستحقًا، ونسبة النجاح فيها ${fmtNum(hw.success)}٪.</p>`
        : `<p class="ind-empty">لا توجد واجبات مستحقة بعد</p>`}${hw.pending ? `<span class="pill o">${fmtNum(hw.pending)} واجب ينتظر التسليم</span>` : ''}</div>
    <div class="card pad ind rv" style="--i:3">${head('time', 'hourglass', 'المؤقت الزمني للباقة')}
      ${tm.pct == null ? `<p class="ind-empty">يبدأ العدّ من أول يوم حضور</p>` : `<div class="ind-big"><b>${fmtNum(tm.daysLeft)}</b> يومًا متبقية</div>
        <div class="tbar big" role="img" aria-label="مضى ${fmtNum(tm.pct)}٪ من مدة الباقة"><i style="width:${tm.pct}%"></i></div>
        <p class="hint">من ${fmtShort(it.start_date)} إلى ${fmtShort(it.end_date)} · مضى ${fmtNum(tm.pct)}٪. مرور الوقت لا يعني إتقان المحتوى.</p>`}</div>
  </div>`;
}
function studentDetailHtml(it, notifications){
  return `<div class="grid g2" style="margin-top:16px;align-items:start">
    <div class="card pad rv"><h3 class="ctitle">${ic('calendar')}جلساتي القادمة</h3>
      ${it.upcoming.length ? `<ul class="ses-list">${it.upcoming.map(s => `<li><b>${DAYS[new Date(s.date + 'T12:00:00Z').getUTCDay()]}</b><span>${fmtShort(s.date)}</span><span class="num">${t12(s.start)} – ${t12(s.end)}</span>${s.kind !== 'regular' ? `<span class="pill info">${s.kind === 'makeup' ? 'تعويضية' : 'وقت معدّل'}</span>` : ''}</li>`).join('')}</ul>` : `<p class="hint">لا توجد جلسات قادمة.</p>`}
      ${it.teachers.length ? `<h3 class="ctitle" style="margin-top:14px">${ic('users')}مدربو المقررات</h3><ul class="ses-list">${it.teachers.map(t => `<li><b>${esc(t.name)}</b><span>${esc(t.subjects.join('، '))}</span></li>`).join('')}</ul>` : ''}</div>
    <div class="card pad rv"><h3 class="ctitle">${ic('activity')}سجل الحضور اليومي</h3>
      ${it.log.length ? `<div class="tblwrap" style="max-height:340px"><table class="tb"><thead><tr><th>التاريخ</th><th>الحالة</th><th>أول تسجيل</th></tr></thead><tbody>
        ${it.log.map(l => `<tr><td>${fmtDate(l.date)}</td><td><span class="pill dot ${statusPill(l.status)}">${l.status}</span>${l.manual ? ' <span class="hint">معتمد إداريًا</span>' : ''}</td><td class="num">${l.time ? t12(l.time) : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<p class="hint">لا يوجد سجل بعد.</p>`}</div>
    ${notifications?.length ? `<div class="card pad rv" style="grid-column:1/-1"><h3 class="ctitle">${ic('alert')}الإشعارات</h3><ul class="ntf">${notifications.map(x => `<li class="${x.read_at ? '' : 'new'}"><span class="pill ${x.kind === 'absence' ? 'bad' : x.kind === 'late' ? 'warn' : 'info'}">${KIND_TXT[x.kind] || 'رسالة'}</span><p>${esc(x.text)}</p><span class="hint">${fmtShort(x.at.slice(0, 10))}</span></li>`).join('')}</ul></div>` : ''}
  </div>`;
}

/* ---------- تفاصيل بطاقات «لوحتي» (الحضور والغياب، المؤقت الزمني) ---------- */
let sDetail = null, attF = 'all';
const ATT_F = [['all', 'الكل'], ['حاضر', 'الحضور'], ['متأخر', 'التأخر'], ['غائب', 'الغياب']];
function attDetailHtml(it){
  const a = it.attendance, rows = it.log.filter(l => attF === 'all' || l.status === attF);
  return `<section class="card pad rv" data-detail="att"><div class="det-h"><button type="button" class="btn sm" data-ind-back>${ic('next')} لوحتي</button><h2 class="ctitle" style="margin:0">${ic('check')}الحضور والغياب</h2></div>
    ${a.held ? `<div class="det-stats"><div><b class="num">${fmtNum(a.rate ?? 0)}٪</b><span>نسبة الحضور</span></div><div><b class="num">${fmtNum(a.attended)}</b><span>حضور</span></div><div><b class="num">${fmtNum(a.late)}</b><span>تأخر</span></div><div><b class="num">${fmtNum(a.absent)}</b><span>غياب</span></div><div><b class="num">${fmtNum(a.held)}</b><span>جلسة منعقدة</span></div><div><b class="num">${fmtNum(a.remaining)}</b><span>جلسة متبقية</span></div></div>
      <p class="hint">نسبة الحضور = (أيام الحضور والتأخر) ÷ الجلسات المنعقدة منذ بداية باقتك. حد الإفادة ${fmtNum(it.threshold)}٪.${(a.rate ?? 0) < it.threshold ? ` تحتاج الحضور بانتظام لتبلغه.` : ' أنت فوق الحد، استمر.'}</p>
      <div class="tabs" role="tablist" style="margin:10px 0">${ATT_F.map(([k, t]) => `<button class="tab" role="tab" data-attf="${k}" aria-selected="${attF === k}">${t} (${fmtNum(k === 'all' ? it.log.length : it.log.filter(l => l.status === k).length)})</button>`).join('')}</div>
      ${rows.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>اليوم</th><th>التاريخ</th><th>الحالة</th><th>وقت التسجيل</th></tr></thead><tbody>${rows.map(l => `<tr><td>${DAYS[new Date(l.date + 'T12:00:00Z').getUTCDay()]}</td><td>${fmtDate(l.date)}</td><td><span class="pill dot ${statusPill(l.status)}">${l.status}</span>${l.manual ? ' <span class="hint">معتمد إداريًا</span>' : ''}</td><td class="num">${l.time ? t12(l.time) : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<p class="hint">لا أيام في هذا التصنيف.</p>`}`
    : `<p class="ind-empty">${it.start_date ? 'لا توجد جلسات منعقدة بعد' : 'يبدأ اشتراكك من أول يوم تحضر فيه، ويظهر هنا سجل حضورك وغيابك.'}</p>`}</section>`;
}
function timeDetailHtml(it){
  const tm = it.time, a = it.attendance, days = it.start_date && it.end_date ? Math.round((Date.parse(it.end_date) - Date.parse(it.start_date)) / 864e5) + 1 : null;
  return `<section class="card pad rv" data-detail="time"><div class="det-h"><button type="button" class="btn sm" data-ind-back>${ic('next')} لوحتي</button><h2 class="ctitle" style="margin:0">${ic('hourglass')}المؤقت الزمني للباقة</h2></div>
    ${tm.pct == null ? `<p class="ind-empty">يبدأ العدّ من أول يوم تحضر فيه بالباركود.</p>` : `<div class="det-stats"><div><b>${fmtShort(it.start_date)}</b><span>البداية</span></div><div><b>${fmtShort(it.end_date)}</b><span>النهاية</span></div><div><b class="num">${fmtNum(days)}</b><span>مدة الباقة (يوم)</span></div><div><b class="num">${fmtNum(Math.max(0, days - tm.daysLeft))}</b><span>يوم مضى</span></div><div><b class="num">${fmtNum(tm.daysLeft)}</b><span>يوم متبقٍ</span></div><div><b class="num">${fmtNum(a.remaining)}</b><span>جلسة متبقية</span></div></div>
      <div class="tbar big" role="img" aria-label="مضى ${fmtNum(tm.pct)}٪ من مدة الباقة"><i style="width:${tm.pct}%"></i></div>
      <p class="hint">مضى ${fmtNum(tm.pct)}٪ من مدة باقتك. ${tm.reach != null ? `إن حضرت كل الجلسات المتبقية تبلغ نسبة حضورك ${fmtNum(tm.reach)}٪.` : ''} مرور الوقت لا يعني إتقان المحتوى؛ تابع واجباتك وقياس مستواك.</p>`}
    <h3 class="ctitle" style="margin-top:14px">${ic('calendar')}جلساتي القادمة</h3>
    ${it.upcoming.length ? `<ul class="ses-list">${it.upcoming.map(x => `<li><b>${DAYS[new Date(x.date + 'T12:00:00Z').getUTCDay()]}</b><span>${fmtShort(x.date)}</span><span class="num">${t12(x.start)} – ${t12(x.end)}</span></li>`).join('')}</ul>` : '<p class="hint">لا جلسات قادمة ضمن مدة باقتك.</p>'}</section>`;
}

/* ---------- المتدرب ---------- */
let sIdx = 0, pIdx = 0;
/* بنود «لوحتي» الموحدة: اشتراكات الباقات ثم البرامج (الدفعات) */
const STATE_TXT = { running:'جارية', upcoming:'قادمة', archived:'منتهية' };
function unifiedItems(D, traineeId, subItems){
  const t = D.trainees.find(x => x.id === traineeId);
  const progs = t ? cohortItemsOf(D, t).sort((a, b) => ({ running:0, upcoming:1, archived:2 }[a.state] - { running:0, upcoming:1, archived:2 }[b.state])) : [];
  return [...subItems.map(it => ({ kind:'sub', label:it.plan, it })), ...progs.map(x => ({ kind:'prog', label:x.program, x }))];
}
const itemTabs = (list, cur) => list.length > 1 ? `<div class="tabs" role="tablist" style="margin:14px 0">${list.map((u, i) => `<button class="tab" role="tab" data-si="${i}" aria-selected="${i === cur}">${ic(u.kind === 'prog' ? 'book' : 'award')}${esc(u.label)}</button>`).join('')}</div>` : '';
/* لوحة برنامج (دفعة): الحضور ونسبة الإنجاز والشهادة ورسالة التنبيه */
export function programPanelHtml(x, threshold = 75){
  const ach = x.total ? Math.round(Math.min(1, x.attended / x.total) * 100) : null, rate = x.state === 'archived' ? x.finalRate : x.rate;
  const tone = rate == null ? 'success' : rate < threshold ? 'warning' : 'success';
  const zone = v => v == null ? '' : v < GAUGE_RED ? 'red' : v < threshold ? 'yellow' : 'green';
  return `<div class="card pad rv prog-head"><div><span class="pill ${x.state === 'running' ? 'ok' : x.state === 'upcoming' ? 'info' : 'g'}">${STATE_TXT[x.state]}</span>
      <h2>${esc(x.program)}</h2><p class="hint">الدفعة ${fmtNum(x.number)} · من ${fmtShort(x.start_date)} إلى ${fmtShort(x.end_date)}${x.hours ? ` · ${fmtNum(x.hours)} ساعة تدريبية` : ''}${x.trainer ? ` · المدرب: ${esc(x.trainer)}` : ''}${x.hall ? ` · ${esc(x.hall)}` : ''}</p></div>
      ${x.next ? `<p class="prog-next">${ic('calendar')} المحاضرة القادمة: <b>${DAYS[new Date(x.next + 'T12:00:00Z').getUTCDay()]} ${fmtShort(x.next)}</b> · <span class="num">${t12(String(x.start_time).slice(0, 5))}</span></p>` : ''}</div>
    ${x.message ? `<div class="alert t-${{ ok:'success', done:'success', low:'warning', consec:'warning', last:'danger', lost:'danger' }[x.level] || 'info'} rv" role="status" style="margin-top:12px"><span class="aic">${ic('alert')}</span><div><b>${LEVEL_TXT[x.level] || ''}</b><div>${esc(x.message)}</div></div></div>` : ''}
    <div class="card pad ach-card rv"><div class="ach-head"><div class="ind-h">${ic('award')}<b>نسبة الإنجاز في البرنامج</b></div><div class="ach-big num">${ach == null ? '—' : fmtNum(ach) + '٪'}</div></div>
      <ul class="gauge-axes"><li data-zone="${zone(ach)}"><span class="ga-l">الحضور</span><span class="ga-bar" role="img" aria-label="الإنجاز: ${ach ?? 0}٪"><i style="width:${ach ?? 0}%"></i></span><b class="num">${ach == null ? '—' : fmtNum(ach) + '٪'}</b>
        <span class="hint">${x.total ? `أيام الحضور: ${fmtNum(x.attended)} من أصل ${fmtNum(x.total)} مقررة في البرنامج` : 'لا محاضرات مقررة بعد'}</span></li></ul>
      <p class="hint" style="margin:10px 0 0">الإنجاز = أيام الحضور ÷ كل أيام البرنامج المقررة. ولا واجبات في البرامج التدريبية.</p></div>
    <div class="ind3">
      <div class="card pad ind rv" style="--i:1"><div class="ind-h">${ic('check')}<b>نسبة الحضور</b></div>
        ${x.held ? `<div class="ind-ring">${ringSvg(rate ?? 0, 92, 9, tone)}</div><div class="ind-nums"><span><b>${fmtNum(x.attended)}</b>حضور</span><span><b>${fmtNum(x.late)}</b>تأخر</span><span><b>${fmtNum(x.absent)}</b>غياب</span></div>
          <p class="hint">من ${fmtNum(x.held)} محاضرة منعقدة، ويتبقى ${fmtNum(x.remaining)} محاضرة.</p>` : `<p class="ind-empty">${x.state === 'upcoming' ? 'تبدأ الدفعة ' + fmtShort(x.start_date) : 'لا توجد محاضرات منعقدة بعد'}</p>`}</div>
      <div class="card pad ind rv" style="--i:2"><div class="ind-h">${ic('award')}<b>الشهادة</b></div>
        ${x.cert ? `<div class="ind-big"><b>${ic('check')}</b> صدرت إفادة حضورك</div><p class="hint">الرقم التسلسلي <b dir="ltr">${esc(x.cert)}</b></p>`
          : x.state === 'archived' ? `<p class="ind-empty">انتهت الدفعة دون بلوغ حد الشهادة ${fmtNum(threshold)}٪</p>`
          : `<p class="ind-big"><b>${fmtNum(threshold)}٪</b> حد الشهادة</p><p class="hint">الشهادة المعتمدة تصدر عبر <a href="${CENTER.manar}" target="_blank" rel="noopener" style="color:var(--brand);font-weight:500">منصة منار</a>؛ أنشئ حسابك فيها.</p><p class="hint">${x.needed ? `يلزمك حضور ${fmtNum(x.needed)} من ${fmtNum(x.remaining)} محاضرة متبقية.` : 'بلغت حد الشهادة، وتصدر عند انتهاء الدفعة.'}</p>`}</div>
      <div class="card pad ind rv" style="--i:3"><div class="ind-h">${ic('hourglass')}<b>مدة البرنامج</b></div>
        ${x.total ? `<div class="ind-big"><b>${fmtNum(x.remaining)}</b> محاضرة متبقية</div><div class="tbar big" role="img" aria-label="انعقد ${fmtNum(x.held)} من ${fmtNum(x.total)}"><i style="width:${Math.round(x.held / x.total * 100)}%"></i></div>
          <p class="hint">انعقد ${fmtNum(x.held)} من ${fmtNum(x.total)} محاضرة.</p>` : '<p class="ind-empty">—</p>'}</div>
    </div>`;
}

function viewStudent(D){
  const profiles = D.trainees.map(t => studentDashboard(D, t));
  const pr = profiles[Math.min(pIdx, profiles.length - 1)];
  if(!pr) return ($('#app').innerHTML = `<div class="wrap">${emptyBox('لا يوجد اشتراك مرتبط بهذا الرقم', 'راجع إدارة المعهد.')}</div>`);
  const U = unifiedItems(D, pr.trainee.id, pr.items), u = U[Math.min(sIdx, U.length - 1)], it = u?.kind === 'sub' ? u.it : null, px = u?.kind === 'prog' ? u.x : null;
  if(!pr.items.length && sTab !== 'dash') sTab = 'dash';
  const wst = welcomeState(it, riyadhNow(), D.settings?.early_minutes ?? 60), openWelcome = () => showWelcome({ trainee:pr.trainee, it, prog:px, onClose:async changed => { if(changed) viewStudent(await Store.portalData('student')); } });
  $('#app').innerHTML = `<div class="wrap">
    ${profiles.length > 1 ? `<div class="tabs" style="margin-bottom:12px">${profiles.map((x, i) => `<button class="tab" data-pi="${i}" aria-selected="${i === pIdx}">${ic('user')}${esc(x.trainee.first_name)}</button>`).join('')}</div>` : ''}
    <section class="hero portal-hero rv"><div><span class="hero-pill">${ic('user')}${TITLES.student}</span><h1>أهلًا ${esc(pr.trainee.first_name)}</h1>
      ${it ? `<p>${esc(it.plan)} · قسم ${esc(it.section)}${it.subjects.length ? ' · ' + esc(it.subjects.join('، ')) : ''}</p>` : px ? `<p>${esc(px.program)} · الدفعة ${fmtNum(px.number)}</p>` : ''}</div>
      ${wst.kind === 'now' || (!it && px) ? `<button class="btn pri hero-checkin" id="sCheckin">${ic('check')} تسجيل الحضور</button>` : ''}
      ${wst.kind === 'done' ? `<span class="hero-pill hero-done">${ic('check')} سُجّل حضورك اليوم</span>` : ''}
      ${it?.upcoming[0] ? `<div class="next-ses"><span>جلستي القادمة</span><b>${DAYS[new Date(it.upcoming[0].date + 'T12:00:00Z').getUTCDay()]} ${fmtShort(it.upcoming[0].date)}</b><span class="num">${t12(it.upcoming[0].start)}</span></div>` : ''}</section>
    ${tabBar(pr.items.length ? S_TABS : S_TABS.slice(0, 1), sTab, 'data-st', { hw:assignmentsFor(D, pr.trainee.id).filter(a => ['new', 'needs_revision'].includes(a.state)).length, msg:(D.messages || []).filter(m => m.trainee_id === pr.trainee.id && m.from === 'teacher' && !m.read_at).length, live:(D.lectures || []).filter(l => lectureState(l) === 'live').length })}
    <div id="sBody"></div></div>`;
  const tr = D.trainees.find(x => x.id === pr.trainee.id), reload = async () => viewStudent(await Store.portalData('student'));
  if(sTab === 'dash' && it && sDetail) $('#sBody').innerHTML = itemTabs(U, sIdx) + (sDetail === 'att' ? attDetailHtml(it) : timeDetailHtml(it));
  else if(sTab === 'dash') $('#sBody').innerHTML = !u ? emptyBox('لا توجد اشتراكات أو برامج') : itemTabs(U, sIdx) + (it ? studentPanelHtml(it, true) + studentDetailHtml(it, pr.notifications) + `<a class="card pad tg-card rv" href="${CENTER.telegram}" target="_blank" rel="noopener">${ic('book')}<span><b>قناة المركز على تيليجرام</b><small>مواد علمية خاصة بالقدرات ينشرها المركز لمشتركي الباقات</small></span>${ic('next')}</a>` : programPanelHtml(px, D.settings?.cert_threshold ?? 75)) + helpHtml();
  if(sTab === 'dash' && it && sDetail){ /* تفاصيل البطاقة مرسومة أعلاه */ }
  else if(sTab === 'dash'){ const mo = (D.orders || []).filter(o => o.trainee_id === pr.trainee.id); $('#sBody').insertAdjacentHTML('beforeend', ordersCardHtml(mo, pr.trainee.first_name, o => planOfOrder(D, o)) + trainersCardHtml(D, pr.trainee.id)); bindOrdersCard($('#sBody'), mo, reload); }
  else if(sTab === 'live'){ const v = studentLive(D); $('#sBody').innerHTML = v.html; v.bind(() => viewStudent(D), reload); }
  else { const v = ({ hw:() => studentHomework(D, tr, reload), level:() => studentLevel(D, tr, it, reload), msg:() => studentMessages(D, tr, reload), rate:() => studentRating(D, tr, reload) })[sTab](); $('#sBody').innerHTML = v.html; v.bind(); }
  $$('[data-st]').forEach(b => b.onclick = () => { sTab = b.dataset.st; sDetail = null; viewStudent(D); });
  $$('[data-ind]').forEach(b => b.onclick = () => { if(b.dataset.ind === 'hw'){ sTab = 'hw'; sDetail = null; } else sDetail = b.dataset.ind; attF = 'all'; viewStudent(D); scrollTo(0, ($('#sBody')?.offsetTop || 0) - 80); });
  $$('[data-ind-back]').forEach(b => b.onclick = () => { sDetail = null; viewStudent(D); });
  $$('[data-attf]').forEach(b => b.onclick = () => { attF = b.dataset.attf; viewStudent(D); });
  $$('[data-si]').forEach(b => b.onclick = () => { sIdx = +b.dataset.si; viewStudent(D); });
  $$('[data-pi]').forEach(b => b.onclick = () => { pIdx = +b.dataset.pi; sIdx = 0; viewStudent(D); });
  if(pr.notifications.some(x => !x.read_at)) Store.markRead('student');
  if($('#sCheckin')) $('#sCheckin').onclick = openWelcome;
  if(u && !welcomed && shouldWelcome(pr.trainee.id, wst)){ welcomed = true; openWelcome(); }
}

/* ---------- ولي الأمر ---------- */
let gIdx = 0;
function viewGuardian(D, s){
  const g = guardianDashboard(D, s.phone), ch = g.children[Math.min(gIdx, g.children.length - 1)];
  if(!ch){ $('#app').innerHTML = `<div class="wrap"><div class="card pad rv" style="max-width:520px;margin:0 auto">${linkFormHtml(true)}</div></div>`; return bindLinkForm(); }
  const U = unifiedItems(D, ch.trainee.id, ch.items), u = U[Math.min(sIdx, U.length - 1)], it = u?.kind === 'sub' ? u.it : null, px = u?.kind === 'prog' ? u.x : null;
  $('#app').innerHTML = `<div class="wrap">
    <section class="hero portal-hero rv"><div><span class="hero-pill">${ic('users')}${TITLES.guardian}</span><h1>متابعة ${esc(ch.trainee.first_name)}</h1>
      <p>${esc(ch.relation || '')}${it ? ' · ' + esc(it.plan) + ' · قسم ' + esc(it.section) : px ? ' · ' + esc(px.program) : ''}</p></div>
      <div><button class="btn sm ghost-t" id="gLink">${ic('plus')} ربط ابن أو ابنة</button></div></section>
    ${g.children.length > 1 ? `<div class="tabs" style="margin:14px 0">${g.children.map((c, i) => `<button class="tab" data-gi="${i}" aria-selected="${i === gIdx}">${ic('user')}${esc(c.trainee.first_name)}</button>`).join('')}</div>` : ''}
    ${!u ? emptyBox('لا توجد اشتراكات أو برامج') : itemTabs(U, sIdx) + (it ? studentPanelHtml(it) + studentDetailHtml(it, ch.notifications) : programPanelHtml(px, D.settings?.cert_threshold ?? 75))}<div style="margin-top:16px">${weeklyCard(D, ch.trainee.id)}${analysisHtml(D, ch.trainee.id, { role:'guardian', name:ch.trainee.first_name })}</div>${ordersCardHtml((D.orders || []).filter(o => o.trainee_id === ch.trainee.id), ch.trainee.first_name)}</div>`;
  bindOrdersCard($('#app'), (D.orders || []).filter(o => o.trainee_id === ch.trainee.id), async () => viewGuardian(await Store.portalData('guardian'), s));
  $('#gLink').onclick = () => { modal(linkFormHtml(false)); bindLinkForm(); };
  bindWeeklyCard(D, ch.trainee.id, () => { const y = scrollY; viewGuardian(D, s); scrollTo(0, y); });
  $$('[data-gi]').forEach(b => b.onclick = () => { gIdx = +b.dataset.gi; sIdx = 0; viewGuardian(D, s); });
  $$('[data-si]').forEach(b => b.onclick = () => { sIdx = +b.dataset.si; viewGuardian(D, s); });
  if(ch.notifications.some(x => !x.read_at)) Store.markRead('guardian');
}

/* دفعات البرامج المسندة للمدرب: كشف كل دفعة وحضور اليوم ونسبة كل متدرب */
function teacherCohorts(D){
  const n = riyadhNow(), cs = (D.cohorts || []).slice().sort((a, b) => a.start_date.localeCompare(b.start_date));
  return { html: cs.length ? cs.map(c => { const p = (D.programs || []).find(x => x.id === c.program_id), st = cohortState(c), today = st === 'running' && isSessionDay(c, n.date);
      const rows = (D.enrollments || []).filter(e => e.cohort_id === c.id).map(e => { const t = (D.cohort_trainees || []).find(x => x.id === e.trainee_id), s = enrollmentStats(D, e, c), a = (D.attendance || []).find(x => x.enrollment_id === e.id && x.att_date === n.date);
        return { name:t?.full_name || '—', s, a }; }).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
      const here = rows.filter(r => r.a).length;
      return `<div class="card pad rv co-card" data-co="${c.id}" style="margin-bottom:14px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:flex-start">
          <div><span class="pill ${st === 'running' ? 'ok' : st === 'upcoming' ? 'info' : 'g'}">${STATE_TXT[st] || st}</span><h3 class="ctitle" style="margin:6px 0 2px">${esc(p?.name || '')} · الدفعة ${fmtNum(c.number)}</h3>
            <p class="hint" style="margin:0">${fmtShort(c.start_date)} – ${fmtShort(c.end_date)} · ${(c.days || []).map(d => DAYS[d]).join('، ')} · ${t12(String(c.start_time).slice(0, 5))} – ${t12(String(c.end_time).slice(0, 5))}${c.hall ? ' · ' + esc(c.hall) : ''}</p></div>
          <div class="pill ${today ? 'info' : 'g'}" style="padding:6px 12px">${today ? `حضر اليوم ${fmtNum(here)} من ${fmtNum(rows.length)}` : `${fmtNum(rows.length)} متدربًا · لا محاضرة اليوم`}</div></div>
        ${rows.length ? `<div class="tblwrap" style="margin-top:10px"><table class="tb"><thead><tr><th>المتدرب</th><th>اليوم</th><th>الوقت</th><th>حضر</th><th>غاب</th><th>نسبة الحضور</th><th>غياب متتالٍ</th></tr></thead><tbody>
          ${rows.map(r => `<tr><td>${esc(r.name)}</td><td><span class="pill dot ${r.a ? statusPill(r.a.status) : 'g'}">${r.a ? r.a.status : today ? 'لم يسجل بعد' : '—'}</span></td><td class="num">${r.a?.time ? t12(String(r.a.time).slice(0, 5)) : '—'}</td>
            <td class="num">${fmtNum(r.s.attended)}</td><td class="num">${fmtNum(r.s.absent)}</td><td class="num">${r.s.rate == null ? '—' : fmtNum(r.s.rate) + '٪'}</td><td class="num">${r.s.consec ? `<span class="pill ${r.s.consec >= 2 ? 'bad' : 'warn'}">${fmtNum(r.s.consec)}</span>` : '—'}</td></tr>`).join('')}
        </tbody></table></div>` : `<p class="hint" style="margin:10px 0 0">لا يوجد مسجلون في هذه الدفعة بعد.</p>`}</div>`; }).join('')
    : `<div class="card pad">${emptyBox('لا توجد دفعات مسندة إليك', 'تُسند إدارة المعهد الدفعة للمدرب من صفحة «الدفعات والكشوف».')}</div>`, bind(){} };
}

/* ربط ولي الأمر بابنه: يكتب السجل المدني للمتدرب الذي صرّح بجوال ولي الأمر عند التسجيل */
function linkFormHtml(first){
  return `<h3 class="ctitle">${ic('users')}${first ? 'اربط حسابك بابنك أو ابنتك' : 'ربط ابن أو ابنة'}</h3>
    <p class="hint" style="margin:-4px 0 12px">اكتب رقم السجل المدني للمتدرب. يتم الربط إذا كان جوالك هذا هو جوال ولي الأمر المسجَّل في بياناته.</p>
    <form id="glF" class="grid" novalidate><div class="field"><label for="gl-nid">رقم السجل المدني أو الإقامة للمتدرب</label>
      <input class="inp num" id="gl-nid" inputmode="numeric" maxlength="10" dir="ltr" placeholder="1XXXXXXXXX" autocomplete="off" aria-describedby="glE"></div>
      <div class="errtxt" id="glE" role="alert"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end">${first ? '' : '<button type="button" class="btn" id="glC">إلغاء</button>'}<button class="btn pri" id="glB">${ic('check')} ربط</button></div>
      <p class="hint" style="margin:0">لم ينجح الربط؟ راجع إدارة المعهد لتحديث جوال ولي الأمر في بيانات المتدرب.</p></form>`;
}
function bindLinkForm(){
  const nid = $('#gl-nid'); nid.addEventListener('input', () => { nid.value = toLatin(nid.value).replace(/\D/g, ''); });
  if($('#glC')) $('#glC').onclick = closeModal;
  $('#glF').onsubmit = async e => { e.preventDefault(); const b = $('#glB'); $('#glE').textContent = '';
    if(!/^[12]\d{9}$/.test(nid.value)){ $('#glE').textContent = 'رقم السجل المدني 10 أرقام يبدأ بـ 1 أو 2.'; nid.setAttribute('aria-invalid', 'true'); return; }
    setBusy(b, true, 'جارٍ التحقق');
    try { const r = await Store.guardianSelfLink(nid.value); closeModal(); toast(r.already ? 'هذا المتدرب مرتبط بحسابك مسبقًا' : 'تم الربط'); gIdx = 0; render(); }
    catch(x){ setBusy(b, false); $('#glE').textContent = x.message; } };
}

/* ---------- المدرب ---------- */
/* مساعدة: واتساب المركز واتصال — في أسفل لوحات البوابات */
const helpHtml = () => `<p class="p-help">تحتاج مساعدة؟ <a href="${waLink('السلام عليكم، أحتاج مساعدة في بوابتي على مركز سما القدرات للتدريب.')}" target="_blank" rel="noopener">${WA_LOGO} واتساب المركز</a> · <a href="tel:${CENTER.phones[1]}" dir="ltr">${CENTER.phones[1]}</a></p>`;
/* تبويبات المدرب حسب ما أُسند إليه: مقررات الباقات، أو دفعات البرامج، أو كلاهما */
const tTabsOf = D => { const q = (D.me?.subjects || []).length > 0, c = (D.cohorts || []).length > 0; return T_TABS.filter(x => x[0] === 'profile' ? true : x[0] === 'live' ? q || c : x[0] === 'cohorts' ? c || !q : q || !c && x[0] === 'today'); };
function viewTeacher(D, quiet){
  { const TT = tTabsOf(D); if(!TT.some(x => x[0] === tTab)) tTab = TT[0][0]; }
  if(tTab !== 'today'){ if(quiet) return; const t = teacherDashboard(D, D.me), reload = async () => viewTeacher(await Store.portalData('teacher'));
    $('#app').innerHTML = `<div class="wrap"><section class="hero portal-hero rv"><div><span class="hero-pill">${ic('book')}${TITLES.teacher}</span><h1>${esc(t.teacher.name)}</h1><p>قسم ${esc(t.teacher.section)} · ${esc(t.teacher.subjects.join('، '))}</p></div></section>
      ${tabBar(tTabsOf(D), tTab, 'data-tt', { msg:(D.messages || []).filter(m => m.from === 'student' && !m.read_at).length })}<div id="tBody"></div></div>`;
    const v = ({ live:teacherLive, cohorts:teacherCohorts, hw:teacherHomework, bank:teacherBank, msg:teacherMessages, rate:teacherRatings, groups:teacherGroups, people:teacherPeople, profile:teacherProfile })[tTab](D, reload, k => { tTab = k; viewTeacher(D); }); $('#tBody').innerHTML = v.html; v.bind();
    $$('[data-tt]').forEach(b => b.onclick = () => { tTab = b.dataset.tt; viewTeacher(D); }); return; }
  const t = teacherDashboard(D, D.me), n = riyadhNow();
  const PH = { none:'لا توجد جلسة اليوم', before:'الجلسة لم تبدأ', live:'الجلسة جارية', after:'انتهت جلسة اليوم' };
  $('#app').innerHTML = `<div class="wrap">
    <section class="hero portal-hero rv"><div><span class="hero-pill">${ic('book')}${TITLES.teacher}</span><h1>${esc(t.teacher.name)}</h1>
      <p>قسم ${esc(t.teacher.section)} · ${esc(t.teacher.subjects.join('، '))} · ${fmtNum(t.rows.length)} متدرب</p></div>
      <div class="next-ses"><span>${PH[t.phase]}</span><b>${t.session ? `${t12(t.session.start)} – ${t12(t.session.end)}` : fmtShort(n.date)}</b><span class="hint" style="color:inherit">آخر تحديث ${t12(n.hm)}</span></div></section>
    ${tabBar(tTabsOf(D), tTab, 'data-tt', { msg:(D.messages || []).filter(m => m.from === 'student' && !m.read_at).length })}
    ${t.reminder ? `<div class="alert t-warning rv" role="alert" style="margin-top:14px"><span class="aic">${ic('timer')}</span><div style="flex:1"><b style="font-weight:600">باقي أقل من ${fmtNum(t.remind)} دقيقة على نهاية الجلسة، و${fmtNum(t.missing.length)} متدرب لم يُسجَّل حضوره</b>
      <p style="margin:4px 0 8px">${t.missing.map(m => esc(m.name.split(' ').slice(0, 2).join(' '))).join('، ')}</p>
      <button class="btn sm pri" id="tRemind">${ic('alert')} إرسال تذكير لهم</button> <span class="hint">التذكير يطلب المسح إن كانوا حاضرين، أو إبلاغك بالعذر.</span></div></div>` : ''}
    ${daySummaryHtml(D, t)}
    <div class="card pad rv" style="margin-top:16px" id="tSheet"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <h3 class="ctitle">${ic('calendar')}كشف اليوم · ${fmtDate(n.date)}</h3>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="hint">${fmtNum(t.rows.filter(r => ['حاضر', 'متأخر'].includes(r.today)).length)} حاضر · ${fmtNum(t.missing.length)} لم يسجل · تحديث تلقائي كل 30 ثانية</span><button class="btn sm" id="tPrint">${ic('form')} طباعة الكشف</button></div></div>
      ${t.rows.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>المتدرب</th><th>الباقة</th><th>اليوم</th><th>الوقت</th><th>نسبة الحضور</th><th>الإنجاز</th><th>غياب متتالٍ</th><th></th></tr></thead><tbody>
        ${t.rows.map(r => `<tr><td><button class="linkbtn" data-tv="${r.trainee_id}" aria-label="عرض تقدم ${esc(r.name)}">${esc(r.name)}</button></td><td>${esc(r.plan)}</td>
          <td><span class="pill dot ${['لم يسجل بعد','لا جلسة'].includes(r.today) ? 'g' : statusPill(r.today)}">${r.today}</span></td><td class="num">${r.time ? t12(r.time) : '—'}</td>
          <td class="num">${r.rate == null ? '—' : fmtNum(r.rate) + '٪'}</td><td class="num">${achievementPill(r.achievement)}</td><td class="num">${r.consec ? `<span class="pill ${r.consec >= 2 ? 'bad' : 'warn'}">${fmtNum(r.consec)}</span>` : '—'}</td>
          <td style="white-space:nowrap"><button class="btn sm" data-tv="${r.trainee_id}" aria-label="تقدم ${esc(r.name)}">${ic('chart')}</button>
            <button class="btn sm" data-tn="${r.trainee_id}" ${r.has_guardian ? '' : 'disabled title="لا يوجد ولي أمر موثّق"'} aria-label="إشعار ولي أمر ${esc(r.name)}">${ic('users')} ولي الأمر</button></td></tr>`).join('')}
      </tbody></table></div>` : emptyBox('لا يوجد متدربون في نطاقك', 'يُسند المعهد المتدربين حسب القسم والمقرر.')}</div>
    ${t.sent.length ? `<div class="card pad rv" style="margin-top:16px"><h3 class="ctitle">${ic('alert')}ما أرسلته اليوم</h3><ul class="ntf">${t.sent.slice().reverse().map(x => `<li><span class="pill info">${KIND_TXT[x.kind]} · ${x.to === 'guardian' ? 'ولي الأمر' : 'المتدرب'}</span><p>${esc(D.trainees.find(y => y.id === x.trainee_id)?.full_name || '')}: ${esc(x.text)}</p><span class="hint">${t12(new Date(x.at).toLocaleTimeString('en-GB', { timeZone:'Asia/Riyadh', hour12:false }).slice(0, 5))}</span></li>`).join('')}</ul></div>` : ''}
  </div>`;
  if(!quiet) liveSay(PH[t.phase]);
  $$('[data-tt]').forEach(b => b.onclick = () => { tTab = b.dataset.tt; viewTeacher(D); });
  if($('#tRemind')) $('#tRemind').onclick = async e => { setBusy(e.currentTarget, true, 'جارٍ الإرسال'); let ok = 0;
    for(const m of t.missing){ try { const r = await Store.teacherNotify({ trainee_id:m.trainee_id, to:'student', kind:'reminder' }); if(!r.duplicate) ok++; } catch(_){} }
    toast(ok ? `أُرسل التذكير إلى ${fmtNum(ok)} متدرب` : 'أُرسل التذكير سابقًا اليوم'); viewTeacher(await Store.portalData('teacher')); };
  $$('[data-tv]').forEach(b => b.onclick = () => { const tr = D.trainees.find(x => x.id === b.dataset.tv), dash = studentDashboard(mirrorData(D), tr), it = dash.items[0];
    modal(`<div class="mirror"><h3>${esc(tr.full_name)}</h3><p class="hint" style="margin:0 0 6px">${ic('chart')} مرآة لوحة المتدرب: ما تراه هنا هو ما يراه المتدرب وولي أمره.</p>${it ? studentPanelHtml(it) : emptyBox('لا يوجد اشتراك')}</div><div style="text-align:end;margin-top:12px"><button class="btn pri" id="tvX">إغلاق</button></div>`); $('#tvX').onclick = closeModal; });
  $$('[data-tn]').forEach(b => b.onclick = () => notifyModal(D, b.dataset.tn));
  if($('#tPrint')) $('#tPrint').onclick = () => printDaySheet(t, n);
}
function notifyModal(D, trainee_id){
  const tr = D.trainees.find(x => x.id === trainee_id);
  modal(`<h3>إشعار ولي أمر ${esc(tr.full_name.split(' ')[0])}</h3><form id="nf" class="grid" novalidate>
    <div class="field"><label for="nf-kind">نوع الإشعار</label><select class="inp" id="nf-kind" name="kind">${['absence', 'late', 'homework', 'general'].map(k => `<option value="${k}">${KIND_TXT[k]}</option>`).join('')}</select></div>
    <p class="hint" id="nfTpl" style="margin:0"></p>
    <div class="field"><label for="nf-note">ملاحظة المدرب (اختيارية)</label><textarea class="inp" id="nf-note" name="note" rows="3" maxlength="300" style="padding:10px 14px;line-height:1.8"></textarea></div>
    <div class="errtxt" id="nfE"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="nfC">إلغاء</button><button class="btn pri" id="nfS">${ic('check')} إرسال</button></div></form>`);
  const sync = () => { $('#nfTpl').textContent = (NOTIFY_TPL[$('#nf-kind').value] || '').replace('{الاسم}', tr.full_name.split(' ')[0]).replace('{التاريخ}', riyadhNow().date); };
  sync(); $('#nf-kind').onchange = sync; $('#nfC').onclick = closeModal;
  $('#nf').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    if(f.kind === 'general' && !f.note.trim()) return $('#nfE').textContent = 'اكتب نص الرسالة.';
    const b = $('#nfS'); setBusy(b, true, 'جارٍ الإرسال');
    try { const r = await Store.teacherNotify({ trainee_id, to:'guardian', kind:f.kind, note:f.note }); closeModal(); toast(r.duplicate ? 'أُرسل هذا الإشعار اليوم مسبقًا' : 'أُرسل الإشعار لولي الأمر'); viewTeacher(await Store.portalData('teacher')); }
    catch(x){ setBusy(b, false); $('#nfE').textContent = x.message; } };
}
export const ROLES = ROLE_TXT;
