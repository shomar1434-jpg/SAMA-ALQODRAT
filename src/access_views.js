/* =====================================================================
   الإدارة: «تفعيل الأجهزة» (#admin-access) — الخطوة AT (قرار المالك): المسؤول يضغط «تفعيل» فتُفتح مهلة لجهاز واحد،
   ويرسل رابط البوابة عبر واتساب (بلا رمز)؛ صاحب الحساب يكتب هويته على جهازه فيظهر له الرمز وحده. تظهر للإدارة
   الحالة فقط: لم يُفعَّل، بانتظار التفعيل، تم التفعيل — بلا رموز ولا أنواع أجهزة.
   ===================================================================== */
import { $, $$, esc, fmtNum, matchQ } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { titleBar } from './views2_main.js';
import { confirmBox } from './views2_programs.js';
import { AD } from './views2_admin.js';
import { setBusy } from './features.js';
import { docShell, printDocs } from './print.js';
import { publicBase } from './config.js';
import { ROLE_TXT } from './portal_logic.js';
import { subStatus } from './qudurat.js';
import { WINDOW_MINUTES, ACT_STATE, windowLive, actMessage } from './device_logic.js';
import { waTo } from './absence_notify.js';

let aRole = 'student', aQ = '', aOnly = 'all', aMin = 15, X = { devices:[], windows:[], requests:[] };
const PATH = { student:'student/', guardian:'guardian/', teacher:'teacher/' };
/* أصحاب الحسابات لكل دور: الجوال هو المفتاح */
function people(role){
  const m = new Map(), add = (phone, name, extra) => { if(!/^05\d{8}$/.test(phone || '')) return; const p = m.get(phone); p ? p.names.push(name) : m.set(phone, { phone, names:[name], extra }); };
  if(role === 'teacher') (AD.teachers || []).filter(t => t.active !== false).forEach(t => add(t.phone, t.full_name, (t.subjects || []).join('، ')));
  else if(role === 'student') (AD.trainees || []).forEach(t => { const subs = (AD.subscriptions || []).filter(s => s.trainee_id === t.id), live = subs.some(s => ['pending', 'active'].includes(subStatus(s)));
    if(subs.length || (AD.enrollments || []).some(e => e.trainee_id === t.id && e.status !== 'ملغى')) add(t.phone, t.full_name, live ? 'اشتراك سارٍ' : subs.length ? 'اشتراك منتهٍ' : 'برنامج'); });
  else (AD.trainees || []).forEach(t => { if(t.guardian_phone && t.guardian_phone !== t.phone) add(t.guardian_phone, 'ولي أمر ' + t.full_name, ''); });
  return [...m.values()].map(p => ({ ...p, name:p.names.join('، ') })).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}
const left = iso => { const m = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000)); return m >= 1440 ? `${fmtNum(Math.round(m / 1440))} يوم` : m >= 60 ? `${fmtNum(Math.round(m / 60))} ساعة` : `${fmtNum(m)} دقيقة`; };
const stateOf = p => { const dev = X.devices.filter(d => d.phone === p.phone && d.role === aRole && !d.revoked_at).length, w = X.windows.find(x => x.phone === p.phone && x.role === aRole);
  return { dev, st:windowLive(w) ? 'wait' : dev ? 'on' : 'none', w }; };
const waOf = p => waTo(p.phone, actMessage(p.names?.[0] || p.name, publicBase() + PATH[aRole]));

export async function pageAccess(){
  $('#main').innerHTML = titleBar(`${ic('lock')}تفعيل الأجهزة`, 'تفعيل <em>الأجهزة</em>', 'اضغط «تفعيل» أمام الاسم فيُفتح التفعيل لجهاز واحد خلال المدة المختارة، ثم أرسل له رابط بوابته بواتساب. يكتب رقم هويته على جهازه ويضغط «رمز التحقق» فيظهر الرمز عنده وحده. لا تظهر الرموز ولا الأجهزة هنا.') + '<div id="acBody" aria-busy="true"></div>';
  try { X = await Store.accessData(); } catch(_){ X = { devices:[], windows:[], requests:[] }; }
  draw();
}
function draw(){
  const all = people(aRole).map(p => ({ ...p, ...stateOf(p) })), list = all.filter(p => matchQ(aQ, p.name, p.phone) && (aOnly === 'all' || p.st === aOnly)), n = k => all.filter(p => p.st === k).length;
  $('#acBody').removeAttribute('aria-busy');
  const RQ = X.requests || [];
  $('#acBody').innerHTML = `${RQ.length ? `<div class="card pad rv" id="acReq" style="margin-bottom:14px"><h3 class="ctitle">${ic('bell')}طلبات دخول من أجهزة جديدة (${fmtNum(RQ.length)})</h3><p class="hint" style="margin:-4px 0 10px">حاول صاحب الحساب الدخول ولا يوجد تفعيل مفتوح له. تأكد أنه هو، ثم اضغط «تفعيل» واطلب منه الضغط على «رمز التحقق» مرة أخرى.</p>
      <div class="tblwrap"><table class="tb"><thead><tr><th>الاسم</th><th>الدور</th><th>الوقت</th><th></th></tr></thead><tbody>${RQ.map(r => `<tr><td>${esc(r.name || '—')}</td><td>${ROLE_TXT[r.role] || ''}</td><td class="num">${esc(String(r.created_at).slice(11, 16))}</td>
        <td style="white-space:nowrap"><button class="btn sm pri" data-rq="${esc(r.phone)}|${esc(r.role)}">${ic('lock')} تفعيل 15 دقيقة</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}<div class="tabs" style="margin-bottom:12px">${Object.entries({ student:'المتدربون', guardian:'أولياء الأمور', teacher:'المدربون' }).map(([k, v]) => `<button class="tab" data-ar="${k}" aria-selected="${aRole === k}">${v}</button>`).join('')}</div>
    <div class="ord-amt" style="margin:0 0 12px"><span>الحسابات <b>${fmtNum(all.length)}</b></span><span>${ACT_STATE.on} <b>${fmtNum(n('on'))}</b></span><span>${ACT_STATE.wait} <b>${fmtNum(n('wait'))}</b></span><span>${ACT_STATE.none} <b>${fmtNum(n('none'))}</b></span></div>
    <div class="filters"><label class="sr-only" for="ac-q">بحث</label><input class="inp" id="ac-q" type="search" placeholder="الاسم أو الجوال" value="${esc(aQ)}" style="flex:1;min-width:200px">
      <label class="sr-only" for="ac-o">الحالة</label><select class="inp" id="ac-o">${[['all', 'الكل'], ['none', ACT_STATE.none], ['wait', ACT_STATE.wait], ['on', ACT_STATE.on]].map(([k, v]) => `<option value="${k}" ${aOnly === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <label class="sr-only" for="ac-m">مدة التفعيل</label><select class="inp" id="ac-m" title="مدة بقاء التفعيل مفتوحًا">${WINDOW_MINUTES.map(([m, t]) => `<option value="${m}" ${aMin === m ? 'selected' : ''}>مفتوح ${t}</option>`).join('')}</select>
      <button class="btn pri sm" id="acBulk" ${list.some(p => p.st === 'none') ? '' : 'disabled'}>${ic('lock')} تفعيل المعروضين غير المفعَّلين</button>
      <button class="btn sm" id="acPrint" ${list.some(p => p.st === 'wait') ? '' : 'disabled'}>${ic('form')} كشف بانتظار التفعيل</button></div>
    ${list.length ? `<div class="card rv" id="acList"><div class="tblwrap"><table class="tb"><thead><tr><th>الاسم</th><th>الجوال</th><th>الحالة</th><th></th></tr></thead><tbody>${list.slice(0, 400).map(p => `<tr><td>${esc(p.name)}${p.extra ? `<div class="hint">${esc(p.extra)}</div>` : ''}</td><td class="num" dir="ltr">${esc(p.phone)}</td>
        <td>${p.st === 'on' ? `<span class="pill dot ok">${ACT_STATE.on}</span>` : p.st === 'wait' ? `<span class="pill dot warn">${ACT_STATE.wait}</span><div class="hint">يُغلق بعد ${left(p.w.expires_at)}${p.dev ? ' · لديه جهاز مفعَّل' : ''}</div>` : `<span class="pill dot g">${ACT_STATE.none}</span>`}</td>
        <td style="white-space:nowrap">${p.st === 'wait' ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(waOf(p))}">${ic('send')} واتساب الرابط</a> <button class="btn sm" data-ax="${p.phone}">إيقاف</button>`
          : `<button class="btn sm pri" data-ai="${p.phone}">${p.st === 'on' ? 'تفعيل جهاز آخر' : 'تفعيل'}</button>`}${p.dev ? ` <button class="btn sm danger soft" data-av="${p.phone}">إلغاء الأجهزة</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : emptyBox('لا حسابات بهذه التصفية')}`;
  $$('[data-ar]').forEach(b => b.onclick = () => { aRole = b.dataset.ar; aOnly = 'all'; draw(); });
  $('#ac-q').oninput = e => { aQ = e.target.value; clearTimeout(draw.t); draw.t = setTimeout(() => { draw(); const i = $('#ac-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  $('#ac-o').onchange = e => { aOnly = e.target.value; draw(); };
  $('#ac-m').onchange = e => { aMin = +e.target.value; };
  const nameOf = ph => all.find(p => p.phone === ph)?.name || '', reload = async () => { X = await Store.accessData(); draw(); };
  $$('[data-ai]').forEach(b => b.onclick = async () => { setBusy(b, true, '…'); try { await Store.openActivation(b.dataset.ai, aRole, aMin); await reload(); toast('فُتح التفعيل. أرسل له الرابط بواتساب.'); } catch(x){ setBusy(b, false); toast(x.message); } });
  $$('[data-rq]').forEach(b => b.onclick = async () => { const [ph, role] = b.dataset.rq.split('|'); setBusy(b, true, '…'); try { await Store.openActivation(ph, role, 15); await reload(); toast('فُتح التفعيل 15 دقيقة. اطلب منه الضغط على «رمز التحقق» مرة أخرى.'); } catch(x){ setBusy(b, false); toast(x.message); } });
  $$('[data-ax]').forEach(b => b.onclick = async () => { setBusy(b, true, '…'); try { await Store.closeActivation(b.dataset.ax, aRole); await reload(); toast('أُوقف التفعيل'); } catch(x){ setBusy(b, false); toast(x.message); } });
  $$('[data-av]').forEach(b => b.onclick = () => confirmBox('إلغاء الأجهزة المفعَّلة', `يخرج ${nameOf(b.dataset.av)} من كل أجهزته ويحتاج تفعيلًا جديدًا للدخول.`, async () => { await Store.revokeDevices(b.dataset.av, aRole); await reload(); toast('أُلغيت الأجهزة'); }, 'إلغاء الأجهزة'));
  $('#acBulk').onclick = () => { const t = list.filter(p => p.st === 'none'), mt = WINDOW_MINUTES.find(([m]) => m === aMin)[1];
    confirmBox('تفعيل جماعي', `سيُفتح التفعيل ${mt} لـ ${fmtNum(t.length)} حسابًا، لجهاز واحد لكل حساب. أرسل بعدها رابط البوابة لكل واحد من زر واتساب أو اطبع الكشف. لا تظهر أي رموز.`, async () => {
      const r = await Store.openActivationBulk(aRole, t.map(p => p.phone), aMin); await reload(); toast(`فُتح التفعيل لـ ${fmtNum(r.filter(x => !x.error).length)} حسابًا`); }, 'فتح التفعيل'); };
  $('#acPrint').onclick = () => { const w = list.filter(p => p.st === 'wait');
    printDocs([docShell({ docNo:'ACT-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''), title:'كشف تفعيل الحسابات', sub:`${ROLE_TXT[aRole]} · بانتظار التفعيل`,
      body:`<table class="inv-t"><thead><tr><th>م</th><th>الاسم</th><th>الجوال</th><th>يُغلق التفعيل</th><th>التوقيع</th></tr></thead><tbody>${w.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td dir="ltr">${x.phone}</td><td>${left(x.w.expires_at)}</td><td></td></tr>`).join('')}</tbody></table>`,
      note:`الدخول من ${publicBase() + PATH[aRole]}: يكتب صاحب الحساب رقم هويته ثم يضغط «رمز التحقق» فيظهر الرمز على جهازه وحده. لا يحتوي هذا الكشف على أي رمز.` })], 'كشف التفعيل'); };
}
