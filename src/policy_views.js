/* مركز السياسات: الصفحة العامة (#policies، #policy-<slug>[~<version>])، وصفحة الإدارة (#admin-policies)، وخانة القبول في نموذج التسجيل */
import { $, $$, esc, fmtDate, fmtNum, riyadhNow } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { titleBar } from './views2_main.js';
import { modal, closeModal, confirmBox } from './views2_programs.js';
import { AD, reloadAD } from './views2_admin.js';
import { setBusy } from './features.js';
import { siteFooter } from './landing.js';
import { POLICY_KINDS, POLICY_STATUS, currentPolicies, upcomingPolicies, requiredPolicies, historyOf, renderPolicyBody, kindOf } from './policy_logic.js';

const meta = p => `<span class="pill info">الإصدار ${fmtNum(p.version)}</span><span class="pill g">يسري من ${fmtDate(p.effective_date)}</span><span class="pill g">اعتماد: ${esc(p.approved_by)}</span>`;

/* ---------- العامة ---------- */
export async function viewPolicies(){
  const app = $('#app'), all = await Store.publicPolicies(), today = riyadhNow().date, cur = currentPolicies(all, today), up = upcomingPolicies(all, today);
  app.innerHTML = `<div class="wrap"><div class="sec-head rv" style="margin-bottom:18px"><span class="kicker">مركز السياسات</span><h2>سياسات <em>المعهد</em></h2>
      <p class="hint" style="margin:8px 0 0">لكل سياسة رقم إصدار وتاريخ سريان وجهة اعتماد. نحتفظ بالإصدارات السابقة للرجوع إليها.</p></div>
    ${cur.length ? `<div class="grid g3 pol-grid">${cur.map((p, i) => `<a class="card pad pol-card rv" style="--i:${i}" href="#policy-${p.slug}"><span class="kic-lg t-info">${ic('form')}</span><b>${esc(p.title)}</b>
        <span class="hint">الإصدار ${fmtNum(p.version)} · يسري من ${fmtDate(p.effective_date)}</span></a>`).join('')}</div>`
      : emptyBox('لم تُنشر السياسات بعد', 'تعمل إدارة المعهد على اعتماد نصوص السياسات، وتظهر هنا فور نشرها.')}
    ${up.length ? `<div class="card pad rv" style="margin-top:16px"><h3 class="ctitle">${ic('calendar')}إصدارات قادمة</h3><ul class="pol-hist">${up.map(p => `<li><a href="#policy-${p.slug}~${p.version}">${esc(p.title)} — الإصدار ${fmtNum(p.version)}</a><span class="hint">يسري من ${fmtDate(p.effective_date)}</span></li>`).join('')}</ul></div>` : ''}
  </div>${siteFooter()}`;
}
export async function viewPolicy(arg){
  const [slug, ver] = arg.split('~'), all = await Store.publicPolicies(), today = riyadhNow().date, hist = historyOf(all, slug);
  const cur = currentPolicies(all, today).find(p => p.slug === slug), p = ver ? hist.find(x => x.version === +ver) : cur;
  const app = $('#app');
  if(!p){ app.innerHTML = `<div class="wrap">${emptyBox('السياسة غير منشورة', 'لم يُنشر هذا الإصدار بعد.')}<p style="text-align:center"><a class="btn" href="#policies">${ic('next')} مركز السياسات</a></p></div>`; return; }
  const old = cur && p.id !== cur.id;
  app.innerHTML = `<div class="wrap pol-wrap"><a class="hint" href="#policies">${ic('next')} مركز السياسات</a>
    <article class="card pad rv pol-doc" aria-labelledby="polT"><h2 id="polT">${esc(p.title)}</h2><div class="pol-meta">${meta(p)}</div>
      ${old ? `<div class="alert t-warning" role="note"><span class="aic">${ic('alert')}</span><div>${p.effective_date > today ? 'هذا إصدار قادم لم يسرِ بعد.' : 'هذا إصدار سابق.'} <a href="#policy-${slug}">اعرض الإصدار الساري</a></div></div>` : ''}
      <div class="pol-body">${renderPolicyBody(p.body)}</div></article>
    ${hist.length > 1 ? `<div class="card pad rv" style="margin-top:14px"><h3 class="ctitle">${ic('clock')}سجل الإصدارات</h3><ul class="pol-hist">${hist.map(x => `<li>${x.id === p.id ? `<b>الإصدار ${fmtNum(x.version)}</b>` : `<a href="#policy-${slug}~${x.version}">الإصدار ${fmtNum(x.version)}</a>`}<span class="hint">يسري من ${fmtDate(x.effective_date)}${cur && x.id === cur.id ? ' · الساري' : ''}</span></li>`).join('')}</ul></div>` : ''}
  </div>${siteFooter()}`;
}

/* ---------- نموذج التسجيل: قبول السياسات السارية الواجبة ---------- */
export async function bindPolicyConsent(box){
  if(!box) return [];
  let req = [];
  try { req = requiredPolicies(await Store.publicPolicies(), riyadhNow().date); } catch(_) { req = []; }
  if(!req.length){ box.hidden = false; box.innerHTML = `<p class="hint pol-note">${ic('form')} للاطلاع: <a href="#policies" target="_blank" rel="noopener">سياسات المنصة</a> (الخصوصية، والحضور والانضباط، والنزاهة الأكاديمية وغيرها).</p>`; return []; }
  box.hidden = false;
  box.innerHTML = `<label class="check"><input type="checkbox" name="policies" id="rf-pol" value="${req.map(p => p.id).join(',')}" aria-describedby="rfE"><span>قرأت وأوافق على: ${req.map(p => `<a href="#policy-${p.slug}" target="_blank" rel="noopener">${esc(p.title)}</a> (الإصدار ${fmtNum(p.version)})`).join('، ')}</span></label>`;
  return req;
}

/* ---------- الإدارة ---------- */
export function pagePolicies(){
  const m = $('#main'), L = AD.policies || [], today = riyadhNow().date;
  const cur = Object.fromEntries(currentPolicies(L, today).map(p => [p.slug, p]));
  m.innerHTML = titleBar(`${ic('form')}مركز السياسات`, 'السياسات <em>وإصداراتها</em>',
      'اكتب النص المعتمد في المسودة ثم انشره. النسخة المنشورة لا تُعدَّل: أي تعديل يصبح إصدارًا جديدًا بتاريخ سريان. السياسات للاطلاع، ولا يُطلب من المتدرب الموافقة عليها عند التسجيل.',
      `<a class="btn sm" href="${'../#policies'}" target="_blank" rel="noopener">${ic('expand')} الصفحة العامة</a>`) +
    `<div class="card pad rv"><div class="tblwrap"><table class="tb"><thead><tr><th>السياسة</th><th>الساري</th><th>المسودة</th><th></th></tr></thead><tbody>
      ${POLICY_KINDS.map(k => { const c = cur[k.slug], d = L.find(p => p.slug === k.slug && p.status === 'draft'), hist = historyOf(L, k.slug);
        return `<tr data-slug="${k.slug}"><td><b>${esc(c?.title || d?.title || k.title)}</b></td>
          <td>${c ? `الإصدار ${fmtNum(c.version)}<div class="hint">من ${fmtDate(c.effective_date)}${hist.length > 1 ? ` · ${fmtNum(hist.length)} إصدارات` : ''}</div>` : hist.length ? '<span class="hint">إصدار قادم</span>' : '<span class="pill g">لم تُنشر</span>'}</td>
          <td>${d ? `<span class="pill info">${POLICY_STATUS.draft}</span><div class="hint">يسري من ${fmtDate(d.effective_date)}</div>` : '—'}</td>
          <td class="row-actions" style="justify-content:flex-end">${d ? `<button class="btn sm" data-pe="${d.id}">${ic('edit')} تحرير</button><button class="btn pri sm" data-pp="${d.id}">${ic('check')} نشر</button><button class="btn sm ghost" data-pd="${d.id}" aria-label="حذف المسودة">${ic('trash')}</button>`
            : `<button class="btn sm" data-pn="${k.slug}">${ic('plus')} ${c || hist.length ? 'إصدار جديد' : 'مسودة'}</button>`}</td></tr>`; }).join('')}
    </tbody></table></div></div>`;
  $$('[data-pe]').forEach(b => b.onclick = () => policyModal(L.find(p => p.id === b.dataset.pe)));
  $$('[data-pn]').forEach(b => b.onclick = () => { const base = historyOf(L, b.dataset.pn)[0], k = kindOf(b.dataset.pn);
    policyModal({ slug:k.slug, title:base?.title || k.title, body:base?.body || '', requires_acceptance:false, approved_by:base?.approved_by || '', effective_date:today }); });
  $$('[data-pp]').forEach(b => b.onclick = () => { const p = L.find(x => x.id === b.dataset.pp);
    confirmBox('نشر السياسة', `سيُنشر «${p.title}» إصدارًا جديدًا يسري من ${fmtDate(p.effective_date)}، ولا يمكن تعديله بعد النشر.`, async () => {
      try { const r = await Store.publishPolicy(p.id); toast(`نُشر الإصدار ${fmtNum(r.version)}`); await reloadAD(); pagePolicies(); } catch(e){ toast(e.message); } }, 'نشر'); });
  $$('[data-pd]').forEach(b => b.onclick = () => confirmBox('حذف المسودة', 'ستُحذف المسودة غير المنشورة فقط.', async () => {
    try { await Store.deletePolicyDraft(b.dataset.pd); await reloadAD(); pagePolicies(); } catch(e){ toast(e.message); } }, 'حذف'));
}
function policyModal(p){
  modal(`<h3>${p.id ? 'تحرير المسودة' : 'مسودة جديدة'}: ${esc(kindOf(p.slug).title)}</h3><form id="pf" class="grid g2" novalidate>
    <div class="field" style="grid-column:1/-1"><label for="pf-t">العنوان <i>*</i></label><input class="inp" id="pf-t" name="title" maxlength="120" value="${esc(p.title || '')}"></div>
    <div class="field"><label for="pf-d">تاريخ السريان <i>*</i></label><input class="inp" id="pf-d" name="effective_date" type="date" value="${esc(p.effective_date || '')}"></div>
    <div class="field"><label for="pf-a">جهة الاعتماد (تلزم للنشر)</label><input class="inp" id="pf-a" name="approved_by" maxlength="120" placeholder="مدير المركز" value="${esc(p.approved_by || '')}"></div>
    <div class="field" style="grid-column:1/-1"><label for="pf-b">النص <i>*</i></label><textarea class="inp" id="pf-b" name="body" rows="14" aria-describedby="pf-h">${esc(p.body || '')}</textarea>
      <div class="hint" id="pf-h">سطر يبدأ بـ «## » عنوان قسم، وسطر يبدأ بـ «- » بند، وسطر فارغ يفصل الفقرات.</div></div>
    <div class="errtxt" id="pfE" style="grid-column:1/-1" aria-live="polite"></div>
    <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="pfC">إلغاء</button><button class="btn pri" id="pfS">${ic('check')} حفظ المسودة</button></div></form>`);
  $('#pfC').onclick = closeModal;
  $('#pf').onsubmit = async e => { e.preventDefault(); const f = e.target, b = $('#pfS');
    const o = { id:p.id, slug:p.slug, title:f.elements.title.value, body:f.elements.body.value, effective_date:f.elements.effective_date.value, approved_by:f.elements.approved_by.value, requires_acceptance:false };
    setBusy(b, true, 'جارٍ الحفظ');
    try { await Store.savePolicy(o); closeModal(); toast('حُفظت المسودة'); await reloadAD(); pagePolicies(); }
    catch(err){ $('#pfE').textContent = err.message; } finally { setBusy(b, false); } };
}
