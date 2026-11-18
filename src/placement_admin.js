/* اختبار تحديد المستوى — تبويب الإدارة داخل «المساعد الذكي» (الخطوة BH):
   الإحصاء (المحاولات، المكتملة، متوسط المؤشر، توزيع الباقات المقترحة) والإعدادات (لمدير النظام).
   ↔ admin_placement_data / admin_placement_settings */
import { Store } from './data2.js';
import { esc, fmtNum } from './utils.js';
import { ic, toast, emptyBox } from './views2_head.js';
import { PL_KINDS, PL_TIER_TXT } from './placement_logic.js';
import { isFull } from './admin_logic.js';

export async function placementTab(box, rerender){
  let d, me;
  try { [d, me] = await Promise.all([Store.adminPlacement(), Store.adminMe?.().catch(() => null)]); }
  catch(e){ box.innerHTML = emptyBox('تعذّر تحميل بيانات الاختبار', esc(e.message)); return; }
  if(!box.isConnected) return;
  const S = d.settings || {}, A = d.attempts || [], st = d.status || {}, canEdit = !me || isFull(me.role);
  const since = days => A.filter(a => Date.parse(a.day) >= Date.now() - days * 864e5);
  const stats = list => { const done = list.filter(a => a.submitted), avg = done.length ? Math.round(done.reduce((s, a) => s + (+a.pct || 0), 0) / done.length) : 0;
    return { n:list.length, done:done.length, avg, tiers:done.reduce((o, a) => (a.tier && (o[a.tier] = (o[a.tier] || 0) + 1), o), {}) }; };
  const all = stats(A), w = stats(since(7));
  const avail = k => st[k] ? '<span class="pill ok">متاح</span>' : '<span class="pill warn">قريبًا (البنك غير كافٍ)</span>';
  box.innerHTML = `<div class="grid g4" data-plstats>
      <div class="card pad"><span class="hint">محاولات آخر 7 أيام</span><b class="num" style="font-size:24px;display:block">${fmtNum(w.n)}</b></div>
      <div class="card pad"><span class="hint">مكتملة (الكل)</span><b class="num" style="font-size:24px;display:block">${fmtNum(all.done)} / ${fmtNum(all.n)}</b></div>
      <div class="card pad"><span class="hint">متوسط مؤشر الجاهزية</span><b class="num" style="font-size:24px;display:block">${fmtNum(all.avg)}٪</b></div>
      <div class="card pad"><span class="hint">الحالة</span><b style="display:block;margin-top:6px">${st.enabled ? 'مفعّل' : 'متوقف'}</b></div></div>
    <div class="grid g2" style="margin-top:16px">
      <section class="card pad"><h3 class="ctitle">${ic('target')}الأنواع والاقتراحات</h3>
        <p>${Object.entries(PL_KINDS).map(([k, K]) => `${esc(K.title)}: ${avail(k)}`).join(' · ')}</p>
        <p class="hint">الأسئلة من البنك المشترك المنشور ذي المفاتيح المعتمدة فقط؛ والتحليل بالمهارات يحتاج تصنيف الأسئلة.</p>
        <h4>الباقة الأولى المقترحة</h4>
        ${Object.keys(all.tiers).length ? `<ul>${Object.entries(all.tiers).sort((a, b) => b[1] - a[1]).map(([t, n]) => `<li>${esc(PL_TIER_TXT[t] || t)}: <b class="num">${fmtNum(n)}</b></li>`).join('')}</ul>` : '<p class="hint">لا محاولات مكتملة بعد.</p>'}
        <p class="hint">لا يُحفظ اسم الزائر ولا جواله؛ تُحذف المحاولات بعد 100 يوم. ومن سجّل في باقة من الجهاز نفسه تُربط نتيجته بملفه.</p></section>
      <section class="card pad"><h3 class="ctitle">${ic('settings')}الإعدادات</h3>
        <form id="plSet" class="stack">
          <label class="check"><input type="checkbox" id="pl-en" ${S.placement_enabled !== false ? 'checked' : ''} ${canEdit ? '' : 'disabled'}> الاختبار متاح للزوار</label>
          <div class="grid g2"><div class="field"><label for="pl-low">الحد الأدنى ٪ (دونه الماسية والذهبية)</label><input class="inp num" type="number" inputmode="numeric" id="pl-low" min="1" max="98" value="${esc(S.placement_low ?? 40)}" ${canEdit ? '' : 'disabled'}></div>
            <div class="field"><label for="pl-high">الحد الأعلى ٪ (فوقه الأساسية)</label><input class="inp num" type="number" inputmode="numeric" id="pl-high" min="2" max="99" value="${esc(S.placement_high ?? 65)}" ${canEdit ? '' : 'disabled'}></div>
            <div class="field"><label for="pl-sec">ثوانٍ لكل سؤال</label><input class="inp num" type="number" inputmode="numeric" id="pl-sec" min="20" max="300" value="${esc(S.placement_sec_per_q ?? 60)}" ${canEdit ? '' : 'disabled'}></div>
            <div class="field"><label for="pl-max">محاولات الزائر يوميًا</label><input class="inp num" type="number" inputmode="numeric" id="pl-max" min="1" max="20" value="${esc(S.placement_daily_max ?? 3)}" ${canEdit ? '' : 'disabled'}></div></div>
          <p class="hint">بين الحدين الفضية. والضعف في مهارة أو مهارتين (دون 50٪) يقترح «خصصناها لك» أولًا لمن بلغ الحد الأدنى.</p>
          ${canEdit ? `<button class="btn pri" type="submit">${ic('check')} حفظ</button>` : '<p class="hint">تعديل الإعدادات لمدير النظام.</p>'}
        </form></section></div>
    <section class="card pad" style="margin-top:16px" data-pllinked><h3 class="ctitle">${ic('users')}نتائج المتدربين المسجّلين بعد الاختبار</h3>
      ${(d.linked || []).length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>المتدرب</th><th>الاختبار</th><th>التاريخ</th><th>المؤشر</th><th>المقترح</th><th>مهارات ضعيفة</th></tr></thead><tbody>
        ${d.linked.map(x => `<tr><td>${esc(x.name)}</td><td>${esc(PL_KINDS[x.kind]?.title || x.kind)}</td><td class="num">${esc(x.day)}</td><td class="num">${fmtNum(x.pct)}٪</td>
          <td>${(x.tiers || []).map(t => esc(PL_TIER_TXT[t] || t)).join('، ')}</td><td>${(x.weak || []).map(esc).join('، ') || '—'}</td></tr>`).join('')}</tbody></table></div>`
        : '<p class="hint">لا نتائج مرتبطة بعد.</p>'}
      <p class="hint">تُحذف بعد 100 يوم من الاختبار، ومع حذف المتدرب.</p></section>`;
  const f = box.querySelector('#plSet');
  if(canEdit) f.onsubmit = async e => { e.preventDefault(); const b = f.querySelector('[type=submit]'); b.disabled = true; b.setAttribute('aria-busy', 'true');
    try { await Store.savePlacementSettings({ placement_enabled:f.querySelector('#pl-en').checked, placement_low:f.querySelector('#pl-low').value, placement_high:f.querySelector('#pl-high').value,
      placement_sec_per_q:f.querySelector('#pl-sec').value, placement_daily_max:f.querySelector('#pl-max').value }); toast('حُفظت إعدادات الاختبار'); rerender(); }
    catch(err){ toast(err.message); b.disabled = false; b.removeAttribute('aria-busy'); } };
}
