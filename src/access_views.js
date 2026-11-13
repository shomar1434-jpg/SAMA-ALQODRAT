/* =====================================================================
   الإدارة: «تفعيل الأجهزة» (#admin-access) — إصدار رموز التفعيل للمتدربين وأولياء الأمور والمدربين (فرديًا أو جماعيًا)،
   وكشف قابل للطباعة والتصدير، وإلغاء الأجهزة المفعَّلة. الرمز يظهر مرة واحدة عند إصداره ولا يُحفظ نصًّا في الخادم.
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { titleBar } from './views2_main.js';
import { modal, closeModal, confirmBox } from './views2_programs.js';
import { AD } from './views2_admin.js';
import { setBusy } from './features.js';
import { docShell, printDocs, exportCSV } from './print.js';
import { publicBase } from './config.js';
import { ROLE_TXT } from './portal_logic.js';
import { subStatus } from './qudurat.js';
import { ACT_ST, ACT_TTL_DAYS, actStatus, actMessage } from './device_logic.js';

let aRole = 'student', aQ = '', aOnly = 'all', issued = [], X = { devices:[], activations:[] };
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
const stateOf = p => { const dev = X.devices.filter(d => d.phone === p.phone && d.role === aRole && !d.revoked_at).length, act = X.activations.filter(a => a.phone === p.phone && a.role === aRole).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return { dev, st:dev ? 'on' : act && actStatus(act) === 'active' ? 'wait' : 'none', act }; };

export async function pageAccess(){
  $('#main').innerHTML = titleBar(`${ic('lock')}تفعيل الأجهزة`, 'تفعيل الأجهزة <em>ورموز الدخول</em>', `يدخل المتدرب وولي الأمر والمدرب برقم الجوال ورمز تفعيل تصدره الإدارة. يُكتب الرمز مرة واحدة فيُعتمد الجهاز ويبقى صاحبه داخلًا. الرمز صالح ${fmtNum(ACT_TTL_DAYS)} أيام ولمرة واحدة، وجهاز جديد يحتاج رمزًا جديدًا.`) + '<div id="acBody" aria-busy="true"></div>';
  try { X = await Store.accessData(); } catch(_){ X = { devices:[], activations:[] }; }
  draw();
}
function draw(){
  const all = people(aRole).map(p => ({ ...p, ...stateOf(p) })), list = all.filter(p => (!aQ || p.name.includes(aQ) || p.phone.includes(aQ)) && (aOnly === 'all' || p.st === aOnly)), n = k => all.filter(p => p.st === k).length;
  $('#acBody').removeAttribute('aria-busy');
  $('#acBody').innerHTML = `<div class="tabs" style="margin-bottom:12px">${Object.entries({ student:'المتدربون', guardian:'أولياء الأمور', teacher:'المدربون' }).map(([k, v]) => `<button class="tab" data-ar="${k}" aria-selected="${aRole === k}">${v}</button>`).join('')}</div>
    <div class="ord-amt" style="margin:0 0 12px"><span>الحسابات <b>${fmtNum(all.length)}</b></span><span>جهاز مفعَّل <b>${fmtNum(n('on'))}</b></span><span>رمز بانتظار الاستخدام <b>${fmtNum(n('wait'))}</b></span><span>بلا رمز <b>${fmtNum(n('none'))}</b></span></div>
    <div class="filters"><label class="sr-only" for="ac-q">بحث</label><input class="inp" id="ac-q" type="search" placeholder="الاسم أو الجوال" value="${esc(aQ)}" style="flex:1;min-width:200px">
      <label class="sr-only" for="ac-o">الحالة</label><select class="inp" id="ac-o">${[['all', 'الكل'], ['none', 'بلا رمز'], ['wait', 'رمز بانتظار الاستخدام'], ['on', 'جهاز مفعَّل']].map(([k, v]) => `<option value="${k}" ${aOnly === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="btn pri sm" id="acBulk" ${list.some(p => p.st !== 'on') ? '' : 'disabled'}>${ic('plus')} إصدار رموز للمعروضين غير المفعَّلين</button></div>
    ${issued.length ? `<div class="card pad rv" id="acIssued" style="margin-bottom:14px"><h3 class="ctitle">${ic('check')}رموز صدرت الآن (${fmtNum(issued.length)})</h3><p class="hint" style="margin:-4px 0 10px">تظهر الرموز هنا مرة واحدة. اطبع الكشف أو صدّره الآن، ثم سلّم كل رمز لصاحبه.</p>
      <div class="tblwrap" style="max-height:300px;overflow:auto"><table class="tb"><thead><tr><th>الاسم</th><th>الجوال</th><th>رمز التفعيل</th><th></th></tr></thead><tbody>${issued.map(x => `<tr><td>${esc(x.name)}</td><td class="num" dir="ltr">${esc(x.phone)}</td><td class="num" dir="ltr"><b class="ac-code">${esc(x.code || '—')}</b>${x.error ? `<span class="hint">${esc(x.error)}</span>` : ''}</td>
        <td>${x.code ? `<a class="btn sm" target="_blank" rel="noopener" href="https://wa.me/966${x.phone.slice(1)}?text=${encodeURIComponent(actMessage(x.name, x.code, publicBase() + PATH[x.role]))}">واتساب</a>` : ''}</td></tr>`).join('')}</tbody></table></div>
      <div style="display:flex;gap:8px;justify-content:end;margin-top:10px;flex-wrap:wrap"><button class="btn sm" id="acHide">إخفاء الرموز</button><button class="btn sm" id="acCsv">${ic('copy')} تصدير CSV</button><button class="btn pri sm" id="acPrint">${ic('form')} طباعة الكشف</button></div></div>` : ''}
    ${list.length ? `<div class="card rv"><div class="tblwrap"><table class="tb"><thead><tr><th>الاسم</th><th>الجوال</th><th>الحالة</th><th></th></tr></thead><tbody>${list.slice(0, 400).map(p => `<tr><td>${esc(p.name)}${p.extra ? `<div class="hint">${esc(p.extra)}</div>` : ''}</td><td class="num" dir="ltr">${esc(p.phone)}</td>
        <td>${p.st === 'on' ? `<span class="pill dot ok">${fmtNum(p.dev)} جهاز مفعَّل</span>` : p.st === 'wait' ? `<span class="pill dot warn">${ACT_ST.active}</span><div class="hint">ينتهي ${fmtShort(p.act.expires_at.slice(0, 10))}</div>` : `<span class="pill dot g">${p.act ? ACT_ST[actStatus(p.act)] : 'بلا رمز'}</span>`}</td>
        <td style="white-space:nowrap"><button class="btn sm pri" data-ai="${p.phone}">${p.st === 'none' ? 'إصدار رمز' : 'رمز جديد'}</button>${p.dev ? ` <button class="btn sm danger soft" data-av="${p.phone}">إلغاء الأجهزة</button>` : ''}</td></tr>`).join('')}</tbody></table></div></div>` : emptyBox('لا حسابات بهذه التصفية')}`;
  $$('[data-ar]').forEach(b => b.onclick = () => { aRole = b.dataset.ar; aOnly = 'all'; draw(); });
  $('#ac-q').oninput = e => { aQ = e.target.value.trim(); clearTimeout(draw.t); draw.t = setTimeout(() => { draw(); const i = $('#ac-q'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  $('#ac-o').onchange = e => { aOnly = e.target.value; draw(); };
  const nameOf = ph => all.find(p => p.phone === ph)?.name || '', done = async rows => { issued = rows.map(r => ({ ...r, name:nameOf(r.phone) })); X = await Store.accessData(); draw(); };
  $$('[data-ai]').forEach(b => b.onclick = async () => { setBusy(b, true, '…'); try { await done([await Store.issueActivation(b.dataset.ai, aRole)]); toast('صدر رمز التفعيل'); } catch(x){ setBusy(b, false); toast(x.message); } });
  $$('[data-av]').forEach(b => b.onclick = () => confirmBox('إلغاء الأجهزة المفعَّلة', `يخرج ${nameOf(b.dataset.av)} من كل أجهزته ويحتاج رمزًا جديدًا للدخول.`, async () => { await Store.revokeDevices(b.dataset.av, aRole); X = await Store.accessData(); toast('أُلغيت الأجهزة'); draw(); }, 'إلغاء الأجهزة'));
  $('#acBulk').onclick = () => { const t = list.filter(p => p.st !== 'on');
    confirmBox('إصدار رموز جماعي', `سيصدر رمز جديد لـ ${fmtNum(t.length)} حسابًا، ويُلغى أي رمز سابق لم يُستخدم. تظهر الرموز مرة واحدة للطباعة والتصدير.`, async () => { await done(await Store.issueActivationBulk(aRole, t.map(p => p.phone))); toast(`صدر ${fmtNum(issued.filter(x => x.code).length)} رمزًا`); }, 'إصدار الرموز'); };
  if(issued.length){ const ok = issued.filter(x => x.code);
    $('#acHide').onclick = () => { issued = []; draw(); };
    $('#acCsv').onclick = () => exportCSV('رموز-التفعيل', [['الاسم', 'الجوال', 'الدور', 'رمز التفعيل', 'رابط الدخول'], ...ok.map(x => [x.name, x.phone, ROLE_TXT[x.role], x.code, publicBase() + PATH[x.role]])]);
    $('#acPrint').onclick = () => printDocs([docShell({ docNo:'ACT-' + new Date().toISOString().slice(0, 10).replace(/-/g, ''), title:'كشف رموز التفعيل', sub:`${ROLE_TXT[aRole]} · صالحة ${ACT_TTL_DAYS} أيام ولمرة واحدة`,
      body:`<table class="inv-t"><thead><tr><th>م</th><th>الاسم</th><th>الجوال</th><th>رمز التفعيل</th><th>التوقيع بالاستلام</th></tr></thead><tbody>${ok.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.name)}</td><td dir="ltr">${x.phone}</td><td dir="ltr" style="font-size:14px;font-weight:700;letter-spacing:2px">${x.code}</td><td></td></tr>`).join('')}</tbody></table>`,
      note:`الدخول من ${publicBase() + PATH[aRole]} برقم الجوال ثم الرمز. الكشف سري: يُسلَّم كل رمز لصاحبه فقط ثم يُتلف.` })], 'كشف رموز التفعيل'); }
}
