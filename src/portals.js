/* =====================================================================
   البوابات: الطالب، والمعلم، وولي الأمر. لكل بوابة صفحة مستقلة ودور محدد،
   والبيانات محصورة بالدور من الخادم (portalData). الحساب من portal_logic.js.
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtDate, fmtShort, riyadhNow, t12, DAYS } from './utils.js';
import { ic, emptyBox, ringSvg, toast, statusPill, applyTheme, getTheme, setTheme } from './views2_head.js';
import { Store, initStore } from './data2.js';
import { setPage, publicBase } from './config.js';
import { LOGO } from './assets/logo.js';
import { studentDashboard, teacherDashboard, guardianDashboard, ROLE_TXT, NOTIFY_TPL, normPhone } from './portal_logic.js';
import { modal, closeModal } from './views2_programs.js';
import { setBusy, toLatin, liveSay } from './features.js';

const TITLES = { student:'بوابة الطالب', teacher:'بوابة المعلم', guardian:'بوابة ولي الأمر' };
const KIND_TXT = { absence:'غياب', late:'تأخر', reminder:'تذكير بالحضور', homework:'واجب', general:'رسالة' };
let ROLE = 'student', timer = null;

export function bootPortal(role){
  ROLE = role; setPage('portal'); initStore(); applyTheme(getTheme());
  $('#themeBtn').onclick = () => { setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'); };
  $('#portalTitle').textContent = TITLES[role];
  $('#homeLink').href = publicBase() + '#home';
  window.addEventListener('hashchange', render);
  render();
}

async function render(){
  clearInterval(timer);
  const s = await Store.portalSession(ROLE);
  $('#logoutBtn').hidden = !s;
  if(!s) return viewLogin();
  $('#logoutBtn').onclick = async () => { await Store.portalLogout(ROLE); location.hash = ''; render(); };
  try {
    const D = await Store.portalData(ROLE);
    if(ROLE === 'student') return viewStudent(D);
    if(ROLE === 'teacher'){ viewTeacher(D); timer = setInterval(async () => { if(!$('#tSheet') || $('.modal-bg')) return; try { viewTeacher(await Store.portalData('teacher'), true); } catch(_){} }, 30000); return; }
    return viewGuardian(D, s);
  } catch(e){ $('#app').innerHTML = `<div class="wrap">${emptyBox('تعذّر تحميل البيانات', esc(e.message))}</div>`; }
}

/* ---------- الدخول برقم الجوال ورمز التحقق ---------- */
function viewLogin(){
  const demo = Store.mode !== 'cloud';
  $('#app').innerHTML = `<div class="wrap"><div class="login card rv">
    <div class="checkin" style="max-width:none"><div class="head"><img src="${LOGO}" alt=""><h2>${TITLES[ROLE]}</h2><div class="hint">ادخل برقم جوالك المسجّل في المعهد</div></div></div>
    <form id="pl" class="grid pad" novalidate>
      <div class="field"><label for="pl-phone">رقم الجوال</label><input class="inp num" id="pl-phone" name="phone" inputmode="numeric" maxlength="10" dir="ltr" placeholder="05XXXXXXXX" autocomplete="tel-national"></div>
      <div class="field" id="otpF" hidden><label for="pl-code">رمز التحقق المرسل إلى جوالك</label><input class="inp num" id="pl-code" name="code" inputmode="numeric" maxlength="6" dir="ltr" autocomplete="one-time-code"></div>
      <div class="errtxt" id="plE" role="alert"></div>
      <button class="btn pri" id="plB">${ic('lock')} إرسال رمز التحقق</button>
      ${demo ? `<div class="alert t-gold"><span class="aic">${ic('alert')}</span><span>بيانات تجريبية: رمز التحقق <b>1234</b>.${ROLE === 'teacher' ? ' جرّب رقم المعلم <b dir="ltr">0501000003</b>.' : ROLE === 'guardian' ? ' جرّب رقم ولي الأمر <b dir="ltr">0509000010</b>.' : ' استخدم رقم جوال طالب مشترك من لوحة الإدارة.'}</span></div>` : ''}
    </form></div></div>`;
  const ph = $('#pl-phone'), code = $('#pl-code');
  [ph, code].forEach(i => i.addEventListener('input', () => { i.value = toLatin(i.value).replace(/\D/g, ''); }));
  let step = 1;
  $('#pl').onsubmit = async e => { e.preventDefault(); const b = $('#plB'); $('#plE').textContent = '';
    try {
      if(step === 1){ if(!/^05\d{8}$/.test(normPhone(ph.value))) throw new Error('رقم الجوال 10 أرقام يبدأ بـ 05');
        setBusy(b, true, 'جارٍ الإرسال'); await Store.requestOtp(ph.value); setBusy(b, false);
        step = 2; $('#otpF').hidden = false; ph.readOnly = true; b.innerHTML = `${ic('check')} دخول`; code.focus(); liveSay('أُرسل رمز التحقق'); return; }
      if(!/^\d{4,6}$/.test(code.value)) throw new Error('اكتب رمز التحقق');
      setBusy(b, true, 'جارٍ التحقق'); await Store.portalLogin(ph.value, code.value, ROLE); render();
    } catch(x){ setBusy(b, false); if(step === 2) b.innerHTML = `${ic('check')} دخول`; $('#plE').textContent = x.message; } };
}

/* ---------- بطاقات الطالب الثلاث (تُستخدم لولي الأمر أيضًا) ---------- */
export function studentPanelHtml(it){
  const a = it.attendance, hw = it.homework, tm = it.time;
  const tone = a.rate == null ? 'success' : a.rate < 75 ? 'warning' : 'success';
  return `<div class="ind3">
    <div class="card pad ind rv" style="--i:1"><div class="ind-h">${ic('check')}<b>الحضور</b></div>
      ${a.held ? `<div class="ind-ring">${ringSvg(a.rate ?? 0, 92, 9, tone)}</div><div class="ind-nums"><span><b>${fmtNum(a.attended)}</b>حضور</span><span><b>${fmtNum(a.late)}</b>تأخر</span><span><b>${fmtNum(a.absent)}</b>غياب</span></div>
        <p class="hint">من ${fmtNum(a.held)} جلسة منعقدة، ويتبقى ${fmtNum(a.remaining)} جلسة.</p>` : `<p class="ind-empty">${it.start_date ? 'لا توجد جلسات منعقدة بعد' : 'يبدأ الاشتراك من أول يوم تحضر فيه'}</p>`}</div>
    <div class="card pad ind rv" style="--i:2"><div class="ind-h">${ic('form')}<b>أداء الواجبات</b></div>
      ${hw.due ? `<div class="ind-ring">${ringSvg(hw.pct, 92, 9, hw.pct < 75 ? 'warning' : 'success')}</div><p class="hint">سلّمت ${fmtNum(hw.done)} من ${fmtNum(hw.due)} واجبًا مستحقًا.</p>`
        : `<p class="ind-empty">لا توجد واجبات مستحقة بعد</p>`}${hw.pending ? `<span class="pill o">${fmtNum(hw.pending)} واجب ينتظر التسليم</span>` : ''}</div>
    <div class="card pad ind rv" style="--i:3"><div class="ind-h">${ic('hourglass')}<b>المؤقت الزمني للباقة</b></div>
      ${tm.pct == null ? `<p class="ind-empty">يبدأ العدّ من أول يوم حضور</p>` : `<div class="ind-big"><b>${fmtNum(tm.daysLeft)}</b> يومًا متبقية</div>
        <div class="tbar big" role="img" aria-label="مضى ${fmtNum(tm.pct)}٪ من مدة الباقة"><i style="width:${tm.pct}%"></i></div>
        <p class="hint">من ${fmtShort(it.start_date)} إلى ${fmtShort(it.end_date)} · مضى ${fmtNum(tm.pct)}٪. مرور الوقت لا يعني إتقان المحتوى.</p>`}</div>
  </div>`;
}
function studentDetailHtml(it, notifications){
  return `<div class="grid g2" style="margin-top:16px;align-items:start">
    <div class="card pad rv"><h3 class="ctitle">${ic('calendar')}جلساتي القادمة</h3>
      ${it.upcoming.length ? `<ul class="ses-list">${it.upcoming.map(s => `<li><b>${DAYS[new Date(s.date + 'T12:00:00Z').getUTCDay()]}</b><span>${fmtShort(s.date)}</span><span class="num">${t12(s.start)} – ${t12(s.end)}</span>${s.kind !== 'regular' ? `<span class="pill info">${s.kind === 'makeup' ? 'تعويضية' : 'وقت معدّل'}</span>` : ''}</li>`).join('')}</ul>` : `<p class="hint">لا توجد جلسات قادمة.</p>`}
      ${it.teachers.length ? `<h3 class="ctitle" style="margin-top:14px">${ic('users')}معلمو المقررات</h3><ul class="ses-list">${it.teachers.map(t => `<li><b>${esc(t.name)}</b><span>${esc(t.subjects.join('، '))}</span></li>`).join('')}</ul>` : ''}</div>
    <div class="card pad rv"><h3 class="ctitle">${ic('activity')}سجل الحضور اليومي</h3>
      ${it.log.length ? `<div class="tblwrap" style="max-height:340px"><table class="tb"><thead><tr><th>التاريخ</th><th>الحالة</th><th>أول تسجيل</th></tr></thead><tbody>
        ${it.log.map(l => `<tr><td>${fmtDate(l.date)}</td><td><span class="pill dot ${statusPill(l.status)}">${l.status}</span>${l.manual ? ' <span class="hint">معتمد إداريًا</span>' : ''}</td><td class="num">${l.time ? t12(l.time) : '—'}</td></tr>`).join('')}</tbody></table></div>` : `<p class="hint">لا يوجد سجل بعد.</p>`}</div>
    ${notifications?.length ? `<div class="card pad rv" style="grid-column:1/-1"><h3 class="ctitle">${ic('alert')}الإشعارات</h3><ul class="ntf">${notifications.map(x => `<li class="${x.read_at ? '' : 'new'}"><span class="pill ${x.kind === 'absence' ? 'bad' : x.kind === 'late' ? 'warn' : 'info'}">${KIND_TXT[x.kind] || 'رسالة'}</span><p>${esc(x.text)}</p><span class="hint">${fmtShort(x.at.slice(0, 10))}</span></li>`).join('')}</ul></div>` : ''}
  </div>`;
}
function subTabs(items, cur){
  return items.length > 1 ? `<div class="tabs" role="tablist" style="margin:14px 0">${items.map((x, i) => `<button class="tab" role="tab" data-si="${i}" aria-selected="${i === cur}">${ic('award')}${esc(x.plan)}</button>`).join('')}</div>` : '';
}

/* ---------- الطالب ---------- */
let sIdx = 0, pIdx = 0;
function viewStudent(D){
  const profiles = D.trainees.map(t => studentDashboard(D, t));
  const pr = profiles[Math.min(pIdx, profiles.length - 1)];
  if(!pr) return ($('#app').innerHTML = `<div class="wrap">${emptyBox('لا يوجد اشتراك مرتبط بهذا الرقم', 'راجع إدارة المعهد.')}</div>`);
  const it = pr.items[Math.min(sIdx, pr.items.length - 1)];
  $('#app').innerHTML = `<div class="wrap">
    ${profiles.length > 1 ? `<div class="tabs" style="margin-bottom:12px">${profiles.map((x, i) => `<button class="tab" data-pi="${i}" aria-selected="${i === pIdx}">${ic('user')}${esc(x.trainee.first_name)}</button>`).join('')}</div>` : ''}
    <section class="hero portal-hero rv"><div><span class="hero-pill">${ic('user')}${TITLES.student}</span><h1>أهلًا ${esc(pr.trainee.first_name)}</h1>
      ${it ? `<p>${esc(it.plan)} · قسم ${esc(it.section)}${it.subjects.length ? ' · ' + esc(it.subjects.join('، ')) : ''}</p>` : ''}</div>
      ${it?.upcoming[0] ? `<div class="next-ses"><span>جلستي القادمة</span><b>${DAYS[new Date(it.upcoming[0].date + 'T12:00:00Z').getUTCDay()]} ${fmtShort(it.upcoming[0].date)}</b><span class="num">${t12(it.upcoming[0].start)}</span></div>` : ''}</section>
    ${it ? subTabs(pr.items, sIdx) + studentPanelHtml(it) + studentDetailHtml(it, pr.notifications) : emptyBox('لا توجد اشتراكات')}</div>`;
  $$('[data-si]').forEach(b => b.onclick = () => { sIdx = +b.dataset.si; viewStudent(D); });
  $$('[data-pi]').forEach(b => b.onclick = () => { pIdx = +b.dataset.pi; sIdx = 0; viewStudent(D); });
  if(pr.notifications.some(x => !x.read_at)) Store.markRead('student');
}

/* ---------- ولي الأمر ---------- */
let gIdx = 0;
function viewGuardian(D, s){
  const g = guardianDashboard(D, s.phone), ch = g.children[Math.min(gIdx, g.children.length - 1)];
  if(!ch) return ($('#app').innerHTML = `<div class="wrap">${emptyBox('لا يوجد أبناء مرتبطون بهذا الرقم', 'يربط المعهد ولي الأمر بأبنائه بعد التحقق. راجع إدارة المعهد.')}</div>`);
  const it = ch.items[Math.min(sIdx, ch.items.length - 1)];
  $('#app').innerHTML = `<div class="wrap">
    <section class="hero portal-hero rv"><div><span class="hero-pill">${ic('users')}${TITLES.guardian}</span><h1>متابعة ${esc(ch.trainee.first_name)}</h1>
      <p>${esc(ch.relation || '')}${it ? ' · ' + esc(it.plan) + ' · قسم ' + esc(it.section) : ''}</p></div></section>
    ${g.children.length > 1 ? `<div class="tabs" style="margin:14px 0">${g.children.map((c, i) => `<button class="tab" data-gi="${i}" aria-selected="${i === gIdx}">${ic('user')}${esc(c.trainee.first_name)}</button>`).join('')}</div>` : ''}
    ${it ? subTabs(ch.items, sIdx) + studentPanelHtml(it) + studentDetailHtml(it, ch.notifications) : emptyBox('لا توجد اشتراكات')}</div>`;
  $$('[data-gi]').forEach(b => b.onclick = () => { gIdx = +b.dataset.gi; sIdx = 0; viewGuardian(D, s); });
  $$('[data-si]').forEach(b => b.onclick = () => { sIdx = +b.dataset.si; viewGuardian(D, s); });
  if(ch.notifications.some(x => !x.read_at)) Store.markRead('guardian');
}

/* ---------- المعلم ---------- */
function viewTeacher(D, quiet){
  const t = teacherDashboard(D, D.me), n = riyadhNow();
  const PH = { none:'لا توجد جلسة اليوم', before:'الجلسة لم تبدأ', live:'الجلسة جارية', after:'انتهت جلسة اليوم' };
  $('#app').innerHTML = `<div class="wrap">
    <section class="hero portal-hero rv"><div><span class="hero-pill">${ic('book')}${TITLES.teacher}</span><h1>${esc(t.teacher.name)}</h1>
      <p>قسم ${esc(t.teacher.section)} · ${esc(t.teacher.subjects.join('، '))} · ${fmtNum(t.rows.length)} طالب</p></div>
      <div class="next-ses"><span>${PH[t.phase]}</span><b>${t.session ? `${t12(t.session.start)} – ${t12(t.session.end)}` : fmtShort(n.date)}</b><span class="hint" style="color:inherit">آخر تحديث ${t12(n.hm)}</span></div></section>
    ${t.reminder ? `<div class="alert t-warning rv" role="alert" style="margin-top:14px"><span class="aic">${ic('timer')}</span><div style="flex:1"><b style="font-weight:600">باقي أقل من ${fmtNum(t.remind)} دقيقة على نهاية الجلسة، و${fmtNum(t.missing.length)} طالب لم يُسجَّل حضوره</b>
      <p style="margin:4px 0 8px">${t.missing.map(m => esc(m.name.split(' ').slice(0, 2).join(' '))).join('، ')}</p>
      <button class="btn sm pri" id="tRemind">${ic('alert')} إرسال تذكير لهم</button> <span class="hint">التذكير يطلب المسح إن كانوا حاضرين، أو إبلاغك بالعذر.</span></div></div>` : ''}
    <div class="card pad rv" style="margin-top:16px" id="tSheet"><div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px">
      <h3 class="ctitle">${ic('calendar')}كشف اليوم · ${fmtDate(n.date)}</h3>
      <div class="hint">${fmtNum(t.rows.filter(r => ['حاضر', 'متأخر'].includes(r.today)).length)} حاضر · ${fmtNum(t.missing.length)} لم يسجل · تحديث تلقائي كل 30 ثانية</div></div>
      ${t.rows.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>الطالب</th><th>الباقة</th><th>اليوم</th><th>الوقت</th><th>نسبة الحضور</th><th>غياب متتالٍ</th><th></th></tr></thead><tbody>
        ${t.rows.map(r => `<tr><td><b style="font-weight:500">${esc(r.name)}</b></td><td>${esc(r.plan)}</td>
          <td><span class="pill dot ${['لم يسجل بعد','لا جلسة'].includes(r.today) ? 'g' : statusPill(r.today)}">${r.today}</span></td><td class="num">${r.time ? t12(r.time) : '—'}</td>
          <td class="num">${r.rate == null ? '—' : fmtNum(r.rate) + '٪'}</td><td class="num">${r.consec ? `<span class="pill ${r.consec >= 2 ? 'bad' : 'warn'}">${fmtNum(r.consec)}</span>` : '—'}</td>
          <td style="white-space:nowrap"><button class="btn sm" data-tv="${r.trainee_id}" aria-label="تقدم ${esc(r.name)}">${ic('chart')}</button>
            <button class="btn sm" data-tn="${r.trainee_id}" ${r.has_guardian ? '' : 'disabled title="لا يوجد ولي أمر موثّق"'} aria-label="إشعار ولي أمر ${esc(r.name)}">${ic('users')} ولي الأمر</button></td></tr>`).join('')}
      </tbody></table></div>` : emptyBox('لا يوجد طلاب في نطاقك', 'يُسند المعهد الطلاب حسب القسم والمقرر.')}</div>
    ${t.sent.length ? `<div class="card pad rv" style="margin-top:16px"><h3 class="ctitle">${ic('alert')}ما أرسلته اليوم</h3><ul class="ntf">${t.sent.slice().reverse().map(x => `<li><span class="pill info">${KIND_TXT[x.kind]} · ${x.to === 'guardian' ? 'ولي الأمر' : 'الطالب'}</span><p>${esc(D.trainees.find(y => y.id === x.trainee_id)?.full_name || '')}: ${esc(x.text)}</p><span class="hint">${t12(new Date(x.at).toLocaleTimeString('en-GB', { timeZone:'Asia/Riyadh', hour12:false }).slice(0, 5))}</span></li>`).join('')}</ul></div>` : ''}
  </div>`;
  if(!quiet) liveSay(PH[t.phase]);
  if($('#tRemind')) $('#tRemind').onclick = async e => { setBusy(e.currentTarget, true, 'جارٍ الإرسال'); let ok = 0;
    for(const m of t.missing){ try { const r = await Store.teacherNotify({ trainee_id:m.trainee_id, to:'student', kind:'reminder' }); if(!r.duplicate) ok++; } catch(_){} }
    toast(ok ? `أُرسل التذكير إلى ${fmtNum(ok)} طالب` : 'أُرسل التذكير سابقًا اليوم'); viewTeacher(await Store.portalData('teacher')); };
  $$('[data-tv]').forEach(b => b.onclick = () => { const tr = D.trainees.find(x => x.id === b.dataset.tv), dash = studentDashboard(D, tr), it = dash.items[0];
    modal(`<h3>${esc(tr.full_name)}</h3>${it ? studentPanelHtml(it) : emptyBox('لا يوجد اشتراك')}<div style="text-align:end;margin-top:12px"><button class="btn pri" id="tvX">إغلاق</button></div>`); $('#tvX').onclick = closeModal; });
  $$('[data-tn]').forEach(b => b.onclick = () => notifyModal(D, b.dataset.tn));
}
function notifyModal(D, trainee_id){
  const tr = D.trainees.find(x => x.id === trainee_id);
  modal(`<h3>إشعار ولي أمر ${esc(tr.full_name.split(' ')[0])}</h3><form id="nf" class="grid" novalidate>
    <div class="field"><label for="nf-kind">نوع الإشعار</label><select class="inp" id="nf-kind" name="kind">${['absence', 'late', 'homework', 'general'].map(k => `<option value="${k}">${KIND_TXT[k]}</option>`).join('')}</select></div>
    <p class="hint" id="nfTpl" style="margin:0"></p>
    <div class="field"><label for="nf-note">ملاحظة المعلم (اختيارية)</label><textarea class="inp" id="nf-note" name="note" rows="3" maxlength="300" style="padding:10px 14px;line-height:1.8"></textarea></div>
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
