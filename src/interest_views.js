/* الخطوة BE: تبويب «المهتمون والطلب» في «المساعد الذكي» — طلب كل برنامج وباقة، والمهتمون، وحملات الإرسال شبه الآلي من واتساب المركز */
import { Store } from './data2.js';
import { $, $$, esc, fmtNum, fmtDate, matchQ } from './utils.js';
import { ic, toast, emptyBox } from './views2_head.js';
import { modal, closeModal } from './views2_programs.js';
import { setBusy } from './features.js';
import { waTo } from './absence_notify.js';
import { demandRows, campaignTargets, campaignText, CAMPAIGN_KIND } from './interest_logic.js';

let iq = '';
export async function interestsTab(box, rerender) {
  let D;
  try { D = await Store.adminInterests(); } catch (x) { box.innerHTML = emptyBox('تعذّر تحميل المهتمين', esc(x.message)); return; }
  const prods = [...new Map([...(D.demand || []), ...(D.interests || []).map(i => ({ kind: i.kind, ref_id: i.ref_id, name: i.name }))]
    .filter(x => x.name).map(x => [x.kind + ':' + x.ref_id, { kind: x.kind, id: x.ref_id, name: x.name }])).values()];
  const rows = demandRows(prods, D.inquiries || [], D.interests || [], D.demand || [], D.threshold);
  const ints = (D.interests || []).filter(i => matchQ(iq, i.full_name, i.phone, i.name));
  box.innerHTML = `<div class="alert t-info" style="margin-bottom:14px"><span class="aic">${ic('alert')}</span><span>يُحفظ هنا من ضغط «أبلغوني» في المساعد وكتب اسمه وواتسابه ووافق. الاستفسارات تُعدّ بلا أرقام، وعند تجاوز ${fmtNum(D.threshold)} استفسارات عن برنامج أو باقة يظهر تنبيه «إقبال مرتفع» ويُخبر المساعد السائلين بأن هناك مجالًا للتسجيل ليتواصلوا مع المركز؛ لا يُفتح التسجيل آليًا.</span></div>
    <div class="card pad" style="margin-bottom:14px"><h3 class="ctitle">${ic('trend')}الطلب على البرامج والباقات</h3>
      ${rows.length ? `<div class="tblwrap"><table class="tb" id="dmT"><thead><tr><th>البرنامج أو الباقة</th><th>الاستفسارات في الدورة</th><th>المهتمون</th><th>الحالة</th><th></th></tr></thead><tbody>
        ${rows.map(r => `<tr><td>${esc(r.name)}<div class="hint">${r.kind === 'plan' ? 'باقة' : 'برنامج'}${r.cycle_started_at && !r.cycle_started_at.startsWith('1970') ? ' · منذ ' + fmtDate(r.cycle_started_at.slice(0, 10)) : ''}</div></td>
          <td class="num">${fmtNum(r.inquiries)}</td><td class="num">${fmtNum(r.interests)}</td>
          <td>${r.high ? `<span class="pill dot ${r.handled_at ? 'ok' : 'bad'}">${r.handled_at ? 'إقبال مرتفع · عولج' : 'إقبال مرتفع'}</span>` : '<span class="pill g">عادي</span>'}</td>
          <td style="white-space:nowrap"><button class="btn sm pri" data-av="${r.kind}:${r.id}" ${r.interests ? '' : 'disabled'}>${ic('send')} إبلاغ المهتمين بالإتاحة</button> <button class="btn sm" data-cy="${r.kind}:${r.id}" title="يبدأ عدّ الاستفسارات من جديد">دورة جديدة</button></td></tr>`).join('')}
      </tbody></table></div>` : emptyBox('لا استفسارات بعد', 'تظهر هنا البرامج والباقات التي سأل عنها الزوار في المساعد.')}</div>
    <div class="card pad" style="margin-bottom:14px"><h3 class="ctitle">${ic('flag')}الحملات</h3>
      <div class="row-actions" style="justify-content:flex-start;margin-bottom:10px"><button class="btn pri sm" id="ofNew">${ic('plus')} عرض جديد</button></div>
      ${(D.campaigns || []).length ? `<div class="tblwrap"><table class="tb" id="cpT"><thead><tr><th>الحملة</th><th>المستهدفون</th><th>أُرسل</th><th></th></tr></thead><tbody>
        ${D.campaigns.map(c => { const t = campaignTargets(c, D.interests || [], D.sends || []);
          return `<tr><td>${CAMPAIGN_KIND[c.kind]}${c.title ? ` «${esc(c.title)}»` : ''}<div class="hint">${esc(c.name || 'كل المهتمين')} · ${fmtDate(c.created_at.slice(0, 10))}</div></td><td class="num">${fmtNum(t.rows.length)}</td><td class="num">${fmtNum(t.rows.length - t.left.length)}</td>
            <td><button class="btn sm ${t.left.length ? 'pri' : ''}" data-cp="${c.id}">${t.left.length ? `${ic('send')} إرسال (${fmtNum(t.left.length)} متبقٍ)` : 'عرض'}</button></td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="hint">لا حملات بعد.</p>'}</div>
    <div class="card pad"><h3 class="ctitle">${ic('users')}المهتمون</h3>
      <div class="filters" style="box-shadow:none;padding:0;margin-bottom:10px"><label class="sr-only" for="inQ">بحث</label><input class="inp" type="search" id="inQ" placeholder="الاسم أو الجوال أو البرنامج" value="${esc(iq)}" style="flex:1;min-width:200px" autocomplete="off"></div>
      ${ints.length ? `<div class="tblwrap"><table class="tb" id="inT"><thead><tr><th>الاسم</th><th>واتساب</th><th>البرنامج أو الباقة</th><th>التاريخ</th><th></th></tr></thead><tbody>
        ${ints.map(i => `<tr class="${i.active ? '' : 'muted'}"><td>${esc(i.full_name)}${i.registered ? ' <span class="pill ok">مسجّل لدينا</span>' : ''}${i.active ? '' : ' <span class="pill g">أوقف الرسائل</span>'}</td><td class="num" dir="ltr">${esc(i.phone)}</td><td>${esc(i.name || '—')}</td><td class="num">${fmtDate(i.created_at.slice(0, 10))}</td>
          <td><button class="btn sm ${i.active ? 'danger soft' : ''}" data-ia="${i.id}:${i.active ? 0 : 1}">${i.active ? 'إيقاف الرسائل' : 'إعادة التفعيل'}</button></td></tr>`).join('')}
      </tbody></table></div>` : emptyBox('لا مهتمين', 'يظهر هنا من طلب الإشعار من المساعد.')}</div>`;
  const prodOf = v => { const [kind, id] = v.split(':'); return prods.find(p => p.kind === kind && p.id === id); };
  $$('[data-av]', box).forEach(b => b.onclick = async () => { const p = prodOf(b.dataset.av); setBusy(b, true, '…');
    try { const r = await Store.createCampaign({ kind: 'availability', product_kind: p.kind, ref_id: p.id }); const D2 = await Store.adminInterests(); sendModal(D2, r.id, rerender); } catch (x) { setBusy(b, false); toast(x.message); } });
  $$('[data-cy]', box).forEach(b => b.onclick = async () => { const p = prodOf(b.dataset.cy); setBusy(b, true, '…');
    try { await Store.newDemandCycle(p.kind, p.id); toast('بدأت دورة جديدة لعدّ الاستفسارات'); rerender(); } catch (x) { setBusy(b, false); toast(x.message); } });
  $$('[data-cp]', box).forEach(b => b.onclick = () => sendModal(D, b.dataset.cp, rerender));
  $$('[data-ia]', box).forEach(b => b.onclick = async () => { const [id, on] = b.dataset.ia.split(':'); try { await Store.setInterestActive(id, on === '1'); rerender(); } catch (x) { toast(x.message); } });
  let t; $('#inQ', box).oninput = e => { iq = e.target.value; clearTimeout(t); t = setTimeout(() => { rerender(); }, 250); };
  $('#ofNew', box).onclick = () => offerModal(prods, rerender);
}

function offerModal(prods, rerender) {
  modal(`<h3>${ic('flag')} عرض جديد</h3><form id="ofF" class="grid" novalidate>
    <div class="field"><label for="of-p">المستهدفون</label><select class="inp" id="of-p"><option value="">كل المهتمين</option>${prods.map(p => `<option value="${p.kind}:${p.id}">المهتمون بـ«${esc(p.name)}»</option>`).join('')}</select></div>
    <div class="field"><label for="of-t">عنوان العرض</label><input class="inp" id="of-t" maxlength="120"></div>
    <div class="field"><label for="of-m">تفاصيل العرض (السعر والمدة والشروط كما اعتمدها المركز)</label><textarea class="inp" id="of-m" rows="4" maxlength="1000"></textarea></div>
    <p class="errtxt" id="ofE" role="alert"></p><div class="row-actions"><button type="button" class="btn" id="ofX">إلغاء</button><button class="btn pri" id="ofS">إنشاء الحملة</button></div></form>`);
  $('#ofX').onclick = closeModal;
  $('#ofF').onsubmit = async e => { e.preventDefault(); const b = $('#ofS'); setBusy(b, true, '…'); const v = $('#of-p').value, [kind, id] = v ? v.split(':') : [null, null];
    try { const r = await Store.createCampaign({ kind: 'offer', product_kind: kind, ref_id: id, title: $('#of-t').value, message: $('#of-m').value }); const D = await Store.adminInterests(); sendModal(D, r.id, rerender); }
    catch (x) { setBusy(b, false); $('#ofE').textContent = x.message; } };
}

/* الإرسال شبه الآلي: كل زر يفتح واتساب على جهاز المسؤول برسالة جاهزة، ويُسجَّل المرسَل فلا يتكرر */
function sendModal(D, cid, rerender) {
  const c = (D.campaigns || []).find(x => x.id === cid); if (!c) return;
  const draw = () => {
    const t = campaignTargets(c, D.interests || [], D.sends || []), pname = i => c.name || i.name || '';
    modal(`<h3>${ic('send')} ${CAMPAIGN_KIND[c.kind]}${c.title ? ` «${esc(c.title)}»` : ''}</h3>
      <p class="hint" style="margin:-4px 0 10px">يفتح كل زر واتساب على جهازك برسالة جاهزة، فتضغط «إرسال». افتح واتساب الأعمال برقم المركز على هذا الجهاز. من أُرسل إليه يُعلَّم ولا يظهر في «إرسال للتالي».</p>
      ${t.rows.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><span class="pill dot ok">${fmtNum(t.rows.length - t.left.length)} أُرسل</span><span class="pill dot g">${fmtNum(t.left.length)} متبقٍ</span>
          ${t.left.length ? `<button class="btn pri sm" id="cpNext">${ic('next')} إرسال للتالي</button>` : ''}</div>
        <details style="margin-bottom:10px"><summary class="hint">نص الرسالة</summary><pre style="white-space:pre-wrap;font:inherit;font-size:14px;background:var(--surface-sunken);padding:10px;border-radius:12px">${esc(campaignText(c, t.rows[0], pname(t.rows[0])))}</pre></details>
        <div class="tblwrap" style="max-height:48vh;overflow:auto"><table class="tb"><thead><tr><th>المهتم</th><th>واتساب</th><th></th></tr></thead><tbody>
          ${t.rows.map(i => `<tr><td>${esc(i.full_name)}<div class="hint">${esc(pname(i))}</div></td><td class="num" dir="ltr">${esc(i.phone)}</td><td><button class="btn sm ${t.done.has(i.id) ? '' : 'pri'}" data-sw="${i.id}">${t.done.has(i.id) ? `${ic('check')} أُرسل · إعادة` : `${ic('send')} واتساب`}</button></td></tr>`).join('')}
        </tbody></table></div>` : '<div class="alert t-info"><span class="aic">' + ic('alert') + '</span><span>لا مهتمين نشطين لهذه الحملة.</span></div>'}
      <div class="row-actions" style="margin-top:12px"><button class="btn" id="cpX">إغلاق</button></div>`);
    const open = async i => { window.open(waTo(i.phone, campaignText(c, i, pname(i))), '_blank', 'noopener');
      try { await Store.markCampaignSent(c.id, i.id); D.sends = [...(D.sends || []), { campaign_id: c.id, interest_id: i.id }]; } catch (x) { toast(x.message); }
      toast('فُتح واتساب؛ اضغط «إرسال» هناك'); draw(); };
    $$('[data-sw]').forEach(b => b.onclick = () => open(t.rows.find(i => i.id === b.dataset.sw)));
    if ($('#cpNext')) $('#cpNext').onclick = () => open(t.left[0]);
    $('#cpX').onclick = () => { closeModal(); rerender(); };
  };
  draw();
}
