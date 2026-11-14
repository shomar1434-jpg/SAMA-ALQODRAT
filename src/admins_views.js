/* =====================================================================
   الإدارة: «إدارة المسؤولين» (#admin-admins، للمالك والمدير الكامل) و«أرشيف الحركات» (#admin-audit، للمالك وحده)
   القواعد نفسها في الخادم (…_admin_roles_audit.sql)؛ الواجهة تخفي ما لا يحق للدور فقط.
   ===================================================================== */
import { $, $$, esc, fmtNum } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { titleBar } from './views2_main.js';
import { modal, closeModal, confirmBox } from './views2_programs.js';
import { setBusy } from './features.js';
import { exportCSV, fmtHijri } from './print.js';
import { adminBase } from './config.js';
import { ADMIN_ROLES, ROLE_HINT, adminRules, isOwner, isFull, AUDIT_SECTIONS, AUDIT_OPS, auditSection, auditOp, auditChanges } from './admin_logic.js';

const fmtAt = at => { try { return new Date(at).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { timeZone:'Asia/Riyadh', year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit' }); } catch(e){ return String(at || ''); } };
const rolePill = (r, active = true) => `<span class="pill ${!active ? 'g' : r === 'owner' ? 'ok' : r === 'full' ? 'info' : 'g'}">${ADMIN_ROLES[r] || r}${active ? '' : ' · معطَّل'}</span>`;
export const joinLink = () => adminBase() + '#admin-join';
/* نتيجة الدعوة: بريد أُرسل، أو كلمة مرور مؤقتة تظهر مرة واحدة */
function inviteResult(r, email){
  if(r?.mode === 'password') {
    modal(`<h3>${r.reset ? 'كلمة مرور مؤقتة جديدة' : 'أُنشئ حساب المسؤول'}</h3><div class="alert t-gold"><span class="aic">${ic('alert')}</span><div>${r.reset ? `أُلغيت كلمة مرور ${esc(email)} السابقة وخرج من أجهزته.` : `تعذّر إرسال البريد إلى ${esc(email)}، فأُنشئ الحساب بكلمة مرور مؤقتة.`} <b>تظهر هنا مرة واحدة فقط</b>؛ سلّمها لصاحبها بنفسك، وسيُطلب منه تغييرها عند أول دخول.</div></div>
      <div class="field" style="margin-top:12px"><span class="lbl">كلمة المرور المؤقتة</span><code id="tmpP" dir="ltr" style="font-size:20px;letter-spacing:2px;display:block;padding:10px;border:1px solid var(--border);border-radius:10px;text-align:center">${esc(r.temp_password)}</code></div>
      <p class="hint">يدخل من صفحة دخول الإدارة ببريده (${esc(email)}) وهذه الكلمة.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="tmpC">${ic('copy')} نسخ</button><button class="btn pri" id="tmpX">تم التسليم</button></div>`);
    $('#tmpC').onclick = async () => { try { await navigator.clipboard.writeText(r.temp_password); toast('نُسخت'); } catch(e){ toast('انسخها يدويًا'); } };
    $('#tmpX').onclick = () => { closeModal(); pageAdmins(); };
    return;
  }
  toast(r?.mode === 'existing' ? 'أصبح الحساب مسؤولًا' : r?.mode === 'email' ? `أُرسلت الدعوة إلى بريد ${email}` : 'أضيفت الدعوة'); pageAdmins();
}

/* إعادة التحقق بكلمة المرور قبل منح الصلاحيات الكاملة */
function reauth(then){
  modal(`<h3>تأكيد هويتك</h3><p class="hint">منح «مدير نظام كامل» يحتاج إعادة إدخال كلمة مرورك.</p>
    <form id="raF" class="grid" novalidate><div class="field"><label for="ra-p">كلمة المرور</label><input class="inp" id="ra-p" type="password" autocomplete="current-password"></div>
    <div class="errtxt" id="raE" role="alert"></div><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="raC">إلغاء</button><button class="btn pri" id="raS">${ic('lock')} تأكيد</button></div></form>`);
  $('#raC').onclick = closeModal;
  $('#raF').onsubmit = async e => { e.preventDefault(); const b = $('#raS'); setBusy(b, true, 'جارٍ التحقق');
    try { await Store.reauth($('#ra-p').value); closeModal(); await then(); } catch(x){ setBusy(b, false); $('#raE').textContent = x.message; } };
}

export async function pageAdmins(){
  const me = await Store.adminMe(), main = $('#main');
  if(!isFull(me?.role)){ main.innerHTML = emptyBox('هذه الصفحة لمدير النظام', 'إدارة المسؤولين للمالك الأساسي ومدير النظام الكامل.'); return; }
  let L = []; try { L = await Store.listAdmins(); } catch(x){ main.innerHTML = emptyBox('تعذّر تحميل المسؤولين', esc(x.message)); return; }
  const cur = L.filter(a => !a.removed), gone = L.filter(a => a.removed);
  const rowsHtml = cur.map(a => { const R = adminRules(me, a);
    return `<tr><td><b>${esc(a.name || '—')}</b>${a.self ? ' <span class="hint">(أنت)</span>' : ''}${a.created_by ? `<div class="hint">أضافه: ${esc(a.created_by)}</div>` : ''}</td>
      <td dir="ltr" style="text-align:right">${esc(a.email || '')}</td><td>${rolePill(a.role, a.active !== false)}</td>
      <td>${a.pending ? '<span class="pill dot warn">مدعوّ لم يفعّل حسابه</span>' : a.active !== false ? '<span class="pill dot ok">فعّال</span>' : '<span class="pill dot g">معطَّل</span>'}</td>
      <td style="white-space:nowrap">${R.canSetRole ? `<button class="btn sm" data-ar="${a.id}">${ic('edit')} الدور</button> ` : ''}${R.canToggle ? `<button class="btn sm ${a.active !== false ? 'danger soft' : ''}" data-aa="${a.id}">${a.active !== false ? 'تعطيل' : 'تفعيل'}</button>` : ''}${R.canResetPassword ? ` <button class="btn sm" data-ap="${a.id}">${ic('lock')} كلمة مرور مؤقتة</button>` : ''}${R.canToggle ? ` <button class="btn sm danger soft" data-ax="${a.id}">إزالة</button>` : ''}${R.canCancelInvite ? `<button class="btn sm" data-ars="${a.id}">إعادة الإرسال</button> <button class="btn sm danger soft" data-ai="${a.id}">إلغاء الدعوة</button>` : ''}</td></tr>`; }).join('');
  const goneHtml = gone.length ? `<details class="card pad rv" id="adGone" style="margin-top:18px"><summary style="cursor:pointer;min-height:44px;display:flex;align-items:center;gap:8px">${ic('users')}<b style="font-weight:600">المسؤولون السابقون</b><span class="pill g">${gone.length}</span></summary>
    <p class="hint">أُزيلوا من القائمة ولا يستطيعون الدخول. تبقى عملياتهم السابقة في أرشيف الحركات بأسمائهم، ويمكن إعادتهم.</p>
    <div class="tblwrap"><table class="tb"><tbody>${gone.map(a => `<tr><td><b>${esc(a.name || '—')}</b></td><td dir="ltr" style="text-align:right">${esc(a.email || '')}</td><td>${rolePill(a.role, false)}</td><td>${adminRules(me, { ...a, active: true }).canToggle ? `<button class="btn sm" data-aa="${a.id}">إعادة</button>` : ''}</td></tr>`).join('')}</tbody></table></div></details>` : '';
  main.innerHTML = titleBar(`${ic('lock')}${ADMIN_ROLES[me.role]}`, 'إدارة <em>المسؤولين</em>', 'دعوة المسؤولين وتحديد أدوارهم وتعطيلهم. الحذف تعطيل يحفظ هوية المنفّذ في السجلات، ولا أحد يغيّر دوره بنفسه، والمالك الأساسي لا يُعدَّل.') + `
    <div class="card pad rv"><h3 class="ctitle">${ic('users')}المسؤولون</h3>
      <div class="tblwrap"><table class="tb" id="adList"><thead><tr><th>الاسم</th><th>البريد</th><th>الدور</th><th>الحالة</th><th></th></tr></thead><tbody>${rowsHtml}</tbody></table></div></div>${goneHtml}
    <div class="card pad rv" style="margin-top:18px"><h3 class="ctitle">${ic('plus')}دعوة مسؤول</h3>
      <form id="adF" class="grid g3" novalidate>
        <div class="field"><label for="ad-n">اسم المسؤول</label><input class="inp" id="ad-n" maxlength="80"></div>
        <div class="field"><label for="ad-e">البريد الإلكتروني (وسيلة الدخول)</label><input class="inp" id="ad-e" type="email" dir="ltr"></div>
        <div class="field"><label for="ad-r">الدور</label><select class="inp" id="ad-r"><option value="staff">${ADMIN_ROLES.staff}</option>${isOwner(me.role) ? `<option value="full">${ADMIN_ROLES.full}</option>` : ''}</select></div>
        <p class="hint" id="adH" style="grid-column:1/-1;margin:0">${ROLE_HINT.staff}</p>
        <div class="errtxt" id="adE" role="alert" style="grid-column:1/-1"></div>
        <div style="grid-column:1/-1"><button class="btn pri" id="adS">${ic('plus')} إضافة الدعوة</button></div></form>
      <p class="hint" style="margin:12px 0 0">يصل المدعوّ بريد من المنصة فيه رابط يختار منه كلمة مروره. إن تعذّر إرسال البريد تُنشأ له كلمة مرور مؤقتة تظهر لك مرة واحدة، فتسلّمها له، ويغيّرها عند أول دخول.</p></div>`;
  $('#ad-r').onchange = e => { $('#adH').textContent = ROLE_HINT[e.target.value]; };
  const add = async () => { const b = $('#adS'); setBusy(b, true, 'جارٍ الإضافة');
    try { const r = await Store.addAdmin($('#ad-e').value, $('#ad-n').value, $('#ad-r').value); inviteResult(r, $('#ad-e').value.trim().toLowerCase()); }
    catch(x){ setBusy(b, false); if(/أعد إدخال كلمة المرور/.test(x.message)) reauth(add); else $('#adE').textContent = x.message; } };
  $('#adF').onsubmit = e => { e.preventDefault(); $('#adE').textContent = ''; add(); };
  $$('[data-ars]').forEach(b => b.onclick = async () => { const a = L.find(x => x.id === b.dataset.ars); setBusy(b, true, 'جارٍ الإرسال');
    const go = async () => { try { inviteResult(await Store.addAdmin(a.email, a.name, a.role), a.email); } catch(x){ setBusy(b, false); if(/أعد إدخال كلمة المرور/.test(x.message)) reauth(go); else toast(x.message); } }; go(); });
  $$('[data-ai]').forEach(b => b.onclick = () => confirmBox('إلغاء الدعوة', 'تُلغى الدعوة ولا يستطيع صاحبها تفعيل حساب مسؤول.', async () => { try { await Store.removeAdmin(b.dataset.ai); toast('أُلغيت الدعوة'); pageAdmins(); } catch(x){ toast(x.message); } }, 'إلغاء الدعوة'));
  $$('[data-ax]').forEach(b => b.onclick = () => { const a = L.find(x => x.id === b.dataset.ax);
    confirmBox(`إزالة ${a.name || a.email}`, 'يفقد صلاحية لوحة الإدارة فورًا ويُنقل إلى «المسؤولين السابقين». لا يُحذف حسابه حتى تبقى عملياته في أرشيف الحركات باسمه، ويمكنك إعادته لاحقًا.',
      async () => { try { await Store.removeAdmin(a.id); toast('أُزيل من قائمة المسؤولين'); pageAdmins(); } catch(x){ toast(x.message); } }, 'إزالة'); });
  $$('[data-ap]').forEach(b => b.onclick = () => { const a = L.find(x => x.id === b.dataset.ap);
    confirmBox(`كلمة مرور مؤقتة لـ ${a.name || a.email}`, 'تُلغى كلمة مروره الحالية ويخرج من كل أجهزته، وتظهر لك كلمة مؤقتة مرة واحدة تسلّمها له، ويغيّرها عند أول دخول.',
      async () => { try { const r = await Store.resetAdminPassword(a.id); setTimeout(() => inviteResult({ ...r, reset: true }, a.email), 60); } catch(x){ toast(x.message); } }, 'إنشاء كلمة مؤقتة'); });
  $$('[data-aa]').forEach(b => b.onclick = () => { const a = L.find(x => x.id === b.dataset.aa), on = a.active === false;
    modal(`<h3>${on ? 'تفعيل' : 'تعطيل'} ${esc(a.name)}</h3><p class="hint">${on ? 'يستعيد صلاحية لوحة الإدارة بدوره الحالي.' : 'يفقد صلاحية لوحة الإدارة فورًا، وتبقى عملياته السابقة في السجل باسمه.'}</p>
      <form id="aaF" class="grid" novalidate><div class="field"><label for="aa-r">السبب</label><input class="inp" id="aa-r" maxlength="200"></div><div class="errtxt" id="aaE" role="alert"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="aaC">رجوع</button><button class="btn pri" id="aaS">${on ? 'تفعيل' : 'تعطيل'}</button></div></form>`);
    $('#aaC').onclick = closeModal;
    $('#aaF').onsubmit = async e => { e.preventDefault(); const s = $('#aaS'); setBusy(s, true, 'جارٍ الحفظ');
      try { await Store.setAdminActive(a.id, on, $('#aa-r').value.trim()); closeModal(); toast(on ? 'فُعّل الحساب' : 'عُطّل الحساب'); pageAdmins(); } catch(x){ setBusy(s, false); $('#aaE').textContent = x.message; } }; });
  $$('[data-ar]').forEach(b => b.onclick = () => { const a = L.find(x => x.id === b.dataset.ar);
    modal(`<h3>دور ${esc(a.name)}</h3><form id="arF" class="grid" novalidate>
      <div class="field"><label for="ar-r">الدور</label><select class="inp" id="ar-r">${['staff', 'full'].map(r => `<option value="${r}" ${a.role === r ? 'selected' : ''}>${ADMIN_ROLES[r]}</option>`).join('')}</select></div>
      <p class="hint" id="arH" style="margin:0">${ROLE_HINT[a.role] || ''}</p>
      <div class="field"><label for="ar-why">سبب التغيير</label><input class="inp" id="ar-why" maxlength="200"></div><div class="errtxt" id="arE" role="alert"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="arC">رجوع</button><button class="btn pri" id="arS">${ic('check')} حفظ</button></div></form>`);
    $('#ar-r').onchange = e => { $('#arH').textContent = ROLE_HINT[e.target.value]; };
    $('#arC').onclick = closeModal;
    const save = async () => { const s = $('#arS'); if(s) setBusy(s, true, 'جارٍ الحفظ'); const role = $('#ar-r')?.value ?? save.role, why = $('#ar-why')?.value ?? save.why;
      save.role = role; save.why = why;
      try { await Store.setAdminRole(a.id, role, why); closeModal(); toast('حُفظ الدور'); pageAdmins(); }
      catch(x){ if(/أعد إدخال كلمة المرور/.test(x.message)){ reauth(save); return; } if(s) setBusy(s, false); if($('#arE')) $('#arE').textContent = x.message; else toast(x.message); } };
    $('#arF').onsubmit = e => { e.preventDefault(); $('#arE').textContent = ''; save(); }; });
}

/* ---------- أرشيف الحركات (المالك وحده) ---------- */
let AF = { from:'', to:'', actor:'', section:'', op:'', q:'' };
const changeTxt = v => v == null ? '—' : typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : String(v).slice(0, 120);
export async function pageAudit(){
  const me = await Store.adminMe(), main = $('#main');
  if(!isOwner(me?.role)){ main.innerHTML = emptyBox('أرشيف الحركات للمالك الأساسي وحده', ''); return; }
  main.innerHTML = titleBar(`${ic('form')}للمالك الأساسي`, 'أرشيف <em>الحركات</em>', 'كل عملية حساسة يسجّلها الخادم آليًا: من نفّذها ودوره ومتى وعلى أي سجل، والقيم قبل التعديل وبعده (عدا الرموز والأسرار). لا يُعدَّل ولا يُحذف، ويُحتفظ به سنتين.',
    `<button class="btn sm" id="auCsv">${ic('copy')} تصدير Excel</button>`) + `
    <div class="card pad rv"><form id="auF" class="grid g3" novalidate>
      <div class="field"><label for="au-from">من تاريخ</label><input class="inp" id="au-from" type="date" value="${AF.from}"></div>
      <div class="field"><label for="au-to">إلى تاريخ</label><input class="inp" id="au-to" type="date" value="${AF.to}"></div>
      <div class="field"><label for="au-a">المنفّذ</label><select class="inp" id="au-a"><option value="">الكل</option><option value="system" ${AF.actor === 'system' ? 'selected' : ''}>النظام (مهام آلية وزوار)</option></select></div>
      <div class="field"><label for="au-s">القسم</label><select class="inp" id="au-s"><option value="">كل الأقسام</option>${Object.entries(AUDIT_SECTIONS).map(([k, v]) => `<option value="${k}" ${AF.section === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label for="au-o">العملية</label><select class="inp" id="au-o"><option value="">الكل</option>${Object.entries(AUDIT_OPS).map(([k, v]) => `<option value="${k}" ${AF.op === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
      <div class="field"><label for="au-q">بحث في السجل</label><input class="inp" id="au-q" value="${esc(AF.q)}" placeholder="رقم طلب، اسم، معرّف…"></div>
      <div style="grid-column:1/-1"><button class="btn pri sm" id="auGo">${ic('search')} عرض</button></div></form></div>
    <div class="card pad rv" style="margin-top:16px" id="auList" aria-live="polite">${emptyBox('جارٍ التحميل', '')}</div>`;
  const read = () => ({ from:$('#au-from').value, to:$('#au-to').value, actor:$('#au-a').value, section:$('#au-s').value, op:$('#au-o').value, q:$('#au-q').value.trim() });
  const load = async () => { AF = read(); const box = $('#auList'); box.setAttribute('aria-busy', 'true');
    try { const r = await Store.adminAudit({ ...AF, limit:300 });
      const sel = $('#au-a'), cur = AF.actor; sel.innerHTML = `<option value="">الكل</option><option value="system">النظام (مهام آلية وزوار)</option>${(r.actors || []).map(a => `<option value="${a.id}">${esc(a.name || '—')} · ${ADMIN_ROLES[a.role] || ''}</option>`).join('')}`; sel.value = cur;
      box.innerHTML = r.rows.length ? `<p class="hint" style="margin:0 0 8px">${fmtNum(r.total)} حركة${r.total > r.rows.length ? `، يُعرض أحدث ${fmtNum(r.rows.length)}؛ ضيّق التصفية أو صدّر الكل` : ''}</p>
        <div class="tblwrap"><table class="tb"><thead><tr><th>الوقت (الرياض)</th><th>المنفّذ</th><th>القسم</th><th>العملية</th><th>السجل</th><th>التغييرات</th></tr></thead><tbody>${r.rows.map(x => { const ch = auditChanges(x.detail);
          return `<tr><td class="num" title="${esc(fmtHijri(String(x.at).slice(0, 10)))}">${esc(fmtAt(x.at))}</td><td>${esc(x.actor_name || (x.actor ? '—' : 'النظام'))}${x.actor_role ? `<div class="hint">${ADMIN_ROLES[x.actor_role] || (x.actor_role === 'system' ? 'آلي' : 'مستخدم')}</div>` : ''}</td>
            <td>${esc(auditSection(x.action))}</td><td>${esc(auditOp(x.action))}</td><td dir="ltr" style="text-align:right;font-size:12px">${esc(String(x.entity || '').slice(0, 40))}</td>
            <td style="font-size:12.5px;max-width:420px">${ch.length ? ch.slice(0, 4).map(c => `<div><b>${esc(c.field)}</b>: ${esc(changeTxt(c.before))} ← ${esc(changeTxt(c.after))}</div>`).join('') + (ch.length > 4 ? `<div class="hint">و${fmtNum(ch.length - 4)} حقول أخرى</div>` : '') : '—'}</td></tr>`; }).join('')}</tbody></table></div>`
        : emptyBox('لا توجد حركات مسجّلة بهذه التصفية', '');
    } catch(x){ box.innerHTML = emptyBox('تعذّر تحميل السجل', esc(x.message)); }
    box.removeAttribute('aria-busy'); };
  $('#auF').onsubmit = e => { e.preventDefault(); load(); };
  $('#auCsv').onclick = async e => { const b = e.currentTarget; setBusy(b, true, 'جارٍ التصدير');
    try { const r = await Store.adminAudit({ ...read(), export:true });
      await exportCSV(`أرشيف-الحركات-${new Date().toISOString().slice(0, 10)}`, [['الوقت', 'المنفّذ', 'الدور', 'القسم', 'العملية', 'السجل', 'التغييرات'],
        ...r.rows.map(x => [fmtAt(x.at), x.actor_name || (x.actor ? '' : 'النظام'), ADMIN_ROLES[x.actor_role] || x.actor_role || '', auditSection(x.action), auditOp(x.action), x.entity || '',
          auditChanges(x.detail).map(c => `${c.field}: ${changeTxt(c.before)} ← ${changeTxt(c.after)}`).join(' | ')])]);
      toast(`صُدّرت ${fmtNum(r.rows.length)} حركة، وسُجّل التصدير في الأرشيف`); }
    catch(x){ toast(x.message); } setBusy(b, false); };
  load();
}

/* تغيير كلمة مرور المسؤول الحالي: الكلمة الحالية أولًا ثم الجديدة مرتين */
export function changePasswordModal(){
  modal(`<h3>تغيير كلمة المرور</h3><form id="cpF" class="grid" novalidate>
    <div class="field"><label for="cp-o">كلمة المرور الحالية</label><input class="inp" id="cp-o" type="password" autocomplete="current-password"></div>
    <div class="field"><label for="cp-a">كلمة المرور الجديدة (8 أحرف على الأقل)</label><input class="inp" id="cp-a" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="cp-b">أعد كتابة الجديدة</label><input class="inp" id="cp-b" type="password" autocomplete="new-password"></div>
    <div class="errtxt" id="cpE" role="alert"></div>
    <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="cpC">إلغاء</button><button class="btn pri" id="cpS">${ic('lock')} حفظ</button></div></form>`);
  $('#cpC').onclick = closeModal;
  $('#cpF').onsubmit = async e => { e.preventDefault(); const er = $('#cpE'), b = $('#cpS'), n = $('#cp-a').value; er.textContent = '';
    if(n.length < 8){ er.textContent = 'كلمة المرور الجديدة 8 أحرف على الأقل'; return; } if(n !== $('#cp-b').value){ er.textContent = 'الكلمتان الجديدتان غير متطابقتين'; return; }
    setBusy(b, true, 'جارٍ الحفظ'); try { await Store.changePassword($('#cp-o').value, n); closeModal(); toast('غُيّرت كلمة المرور'); } catch(x){ setBusy(b, false); er.textContent = x.message; } };
}
/* الخروج من كل الأجهزة: لمن فقد جهازًا أو شكّ أن غيره دخل بحسابه */
export function logoutAllBox(after){
  confirmBox('الخروج من كل الأجهزة', 'تنتهي جلسات حسابك على كل الأجهزة، بما فيها هذا الجهاز، وتحتاج الدخول بكلمة مرورك من جديد.', async () => { await Store.logoutAll(); after(); }, 'خروج من الكل');
}
