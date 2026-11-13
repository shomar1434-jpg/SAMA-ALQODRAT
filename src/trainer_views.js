/* =====================================================================
   واجهات بوابة المدرب: ملخص عمل اليوم، المجموعات الذكية وتجهيز الواجب العلاجي، وملف المدرب؛
   وبطاقة «مدربو مقرراتي» في بوابة المتدرب (النبذة ورابط قناة المدرب لمتدربيه فقط).
   ===================================================================== */
import { $, $$, esc, fmtNum, riyadhNow, t12 } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { teacherDashboard } from './portal_logic.js';
import { teacherTeaches } from './learning_logic.js';
import { setHwPreset } from './learning_views.js';
import { setBusy } from './features.js';
import { SECTIONS } from './qudurat.js';
import { smartGroups, daySummary, BIO_MAX } from './trainer_logic.js';

export function daySummaryHtml(D, dash){
  const s = daySummary(D, D.me, dash), cell = (l, v, c) => `<span>${l} <b class="${c || ''}">${fmtNum(v)}</b></span>`;
  return `<div class="card pad rv day-sum" id="daySum" style="margin-top:16px"><div class="ord-amt" style="margin:0">${cell('المتدربون النشطون', s.total)}${cell('حاضر', s.present)}${cell('متأخر', s.late)}${cell('غائب', s.absent)}${cell('لم يسجل بعد', s.pending)}${cell('واجبات تنتظر التصحيح', s.to_grade)}</div>
    <p class="hint" style="margin:8px 0 0">من سجلات الحضور والواجبات الفعلية · آخر تحديث ${t12(riyadhNow().hm)}</p></div>`;
}
export function teacherGroups(D, reload, go){
  const n = riyadhNow(), G = smartGroups(D, D.me, teacherDashboard(D, D.me, n), n.date);
  return { html:`<div class="card pad rv"><h3 class="ctitle">${ic('users')}المجموعات الذكية</h3>
      <p class="hint" style="margin:-4px 0 12px">تُحسب الآن من الحضور والواجبات الفعلية، وعتباتها من إعدادات المركز. لا يُرسل شيء تلقائيًا: «تجهيز واجب علاجي» يفتح نموذج الواجب بقائمة المجموعة لتراجعه وتنشره أنت.</p>
      ${G.length ? G.map((g, i) => `<details class="hw sg" ${i === 0 ? 'open' : ''}><summary><b>${esc(g.title)}</b> <span class="pill ${g.key.startsWith('plan:') ? 'g' : 'warn'}">${fmtNum(g.members.length)}</span> <span class="hint">${esc(g.why)}</span></summary>
        <ul class="iss" style="margin:8px 0">${g.members.map(m => `<li>${esc(m.name)}${m.note ? ` <span class="hint">· ${esc(m.note)}</span>` : ''}</li>`).join('')}</ul>
        <button class="btn pri sm" data-sg="${esc(g.key)}">${ic('form')} تجهيز واجب علاجي لهم</button></details>`).join('') : emptyBox('لا مجموعات الآن', 'لا متدربين متأخرين أو متعثرين وفق العتبات الحالية.')}</div>`,
    bind(){ $$('[data-sg]').forEach(b => b.onclick = () => { const g = G.find(x => x.key === b.dataset.sg); setHwPreset({ ids:g.members.map(m => m.trainee_id), title:`تدريب علاجي — ${g.title}` }); go('hw'); }); } };
}
export function teacherProfile(D, reload){
  const me = D.me;
  return { html:`<form class="card pad rv" id="tpF" novalidate><h3 class="ctitle">${ic('id')}ملفي التعريفي</h3>
      <p class="hint" style="margin:-4px 0 12px">يظهر اسمك ونبذتك لمتدربي مقرراتك، ورابط قناتك لهم وحدهم. لا يُعرض جوالك ولا هويتك.</p>
      <dl class="ord-dl" style="margin-bottom:12px"><dt>الاسم</dt><dd>${esc(me.full_name)}</dd><dt>القسم</dt><dd>${me.section ? SECTIONS[me.section] : '—'}</dd><dt>المقررات</dt><dd>${esc((me.subjects || []).join('، ') || 'مدرب برامج')}</dd></dl>
      <div class="field"><label for="tp-bio">نبذة مهنية مختصرة (حتى ${fmtNum(BIO_MAX)} حرف)</label><textarea class="inp" id="tp-bio" rows="4" maxlength="${BIO_MAX}" style="padding:10px 14px;line-height:1.8">${esc(me.bio || '')}</textarea></div>
      <div class="field"><label for="tp-tg">رابط قناة تيليجرام للشروحات (اختياري)</label><input class="inp" id="tp-tg" dir="ltr" placeholder="https://t.me/…" value="${esc(me.telegram || '')}"></div>
      <div class="errtxt" id="tpE" role="alert"></div><div style="text-align:end"><button class="btn pri" id="tpS">${ic('check')} حفظ</button></div></form>`,
    bind(){ $('#tpF').onsubmit = async e => { e.preventDefault(); const b = $('#tpS'); $('#tpE').textContent = ''; setBusy(b, true, 'جارٍ الحفظ');
      try { await Store.saveMyProfile({ bio:$('#tp-bio').value, telegram:$('#tp-tg').value.trim(), avatar:me.avatar || '' }); toast('حُفظ ملفك'); reload(); } catch(x){ setBusy(b, false); $('#tpE').textContent = x.message; } }; } };
}
/* بوابة المتدرب: مدربو مقرراته */
export function trainersCardHtml(D, trainee_id){
  const ts = (D.teachers || []).filter(t => teacherTeaches(D, t, trainee_id));
  return ts.length ? `<section class="card pad rv" id="myTrainers" style="margin-top:14px"><h3 class="ctitle">${ic('users')}مدربو مقرراتي</h3>${ts.map(t => `<div class="trn"><div><b>${esc(t.full_name)}</b> <span class="hint">${esc((t.subjects || []).join('، '))}</span>${t.bio ? `<p>${esc(t.bio)}</p>` : ''}</div>
      ${t.telegram ? `<a class="btn sm" href="${esc(t.telegram)}" target="_blank" rel="noopener">${ic('activity')} قناة الشروحات</a>` : ''}</div>`).join('')}</section>` : '';
}
