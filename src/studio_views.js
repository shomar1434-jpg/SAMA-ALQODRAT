/* =====================================================================
   استوديو سما للبث (الخطوة AZ): تبويب «البث المباشر» للمدرب (جدولة المحاضرات وربط بث يوتيوب من قاعة Zoom)،
   وللمتدرب (مشغّل مضمَّن بملء الشاشة، والقادمة، ومكتبة التسجيلات)، وصفحة الإدارة «استوديو البث» (#admin-studio).
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort, t12, matchQ } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { setBusy } from './features.js';
import { SECTIONS } from './qudurat.js';
import { LEC_STATE, LEC_TONE, LEC_MIN, LIVE_EARLY_MIN, embedUrl, lectureState, ytId } from './studio_logic.js';

/* توقيت الرياض: الإدخال datetime-local يُفهم بتوقيت الرياض، والعرض كذلك */
const riyadhParts = iso => { const r = new Date(Date.parse(iso) + 3 * 3600e3).toISOString(); return { date:r.slice(0, 10), hm:r.slice(11, 16) }; };
const toLocalInput = iso => { const p = riyadhParts(iso); return `${p.date}T${p.hm}`; };
const fromLocalInput = v => new Date(v + ':00+03:00').toISOString();
const when = l => { const p = riyadhParts(l.starts_at); return `${fmtShort(p.date)} · ${t12(p.hm)} · ${fmtNum(l.minutes)} دقيقة`; };
const scopeOf = (D, l) => l.cohort_id ? (D.programs || []).find(p => p.id === (D.cohorts || []).find(c => c.id === l.cohort_id)?.program_id)?.name || 'دفعة برنامج' : l.subject;
const player = (l, big) => `<div class="lv-player ${big ? 'big' : ''}" data-lvp="${l.id}"><iframe src="${embedUrl(l.youtube_id)}" title="${esc(l.title)}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
  <div class="lv-acts"><button type="button" class="btn sm" data-lvfs="${l.id}">${ic('expand')} ملء الشاشة</button><span class="hint">على الجوال: أدر الجهاز أفقيًا أو استخدم زر ملء الشاشة في المشغّل.</span></div>`;
function bindFullscreen(root = document){
  $$('[data-lvfs]', root).forEach(b => b.onclick = () => { const box = $(`[data-lvp="${b.dataset.lvfs}"]`, root), f = $('iframe', box);
    const el = box.requestFullscreen ? box : f; (el.requestFullscreen || el.webkitRequestFullscreen || el.webkitEnterFullscreen)?.call(el); });
}

/* ======================= المدرب ======================= */
export function teacherLive(D, reload){
  const me = D.me, L = D.lectures || [], now = Date.now(), cohorts = D.cohorts || [];
  const scopes = [...(me.subjects || []).map(s => [`s:${s}`, `${s} · قسم ${SECTIONS[me.section] || ''}`]), ...cohorts.map(c => [`c:${c.id}`, `${(D.programs || []).find(p => p.id === c.program_id)?.name || 'برنامج'} · الدفعة ${fmtNum(c.number)}`])];
  const rows = st => L.filter(l => lectureState(l, now) === st);
  const row = l => { const st = lectureState(l, now);
    return `<li class="lv-row" data-lr="${l.id}"><div style="flex:1;min-width:0"><b>${esc(l.title)}</b> <span class="pill dot ${LEC_TONE[st]}">${LEC_STATE[st]}</span>${!l.youtube_id && st !== 'cancelled' ? ' <span class="pill warn">بلا رابط يوتيوب</span>' : ''}
      <div class="hint">${esc(scopeOf(D, l))} · ${when(l)}${st === 'ended' ? ` · ${l.recording ? 'التسجيل متاح لمتدربيك' : 'التسجيل غير متاح'}` : ''}</div></div>
      <div class="lv-btns">${st !== 'cancelled' ? `<button class="btn sm" data-le="${l.id}">${ic('edit')} تعديل</button>` : ''}${st === 'live' ? `<button class="btn sm" data-ls="${l.id}:ended">${ic('check')} إنهاء البث</button>` : ''}${st === 'upcoming' ? `<button class="btn sm danger soft" data-ls="${l.id}:cancelled">${ic('x')} إلغاء</button>` : ''}</div></li>`; };
  const form = (l = {}) => `<form class="card pad rv" id="lvF" novalidate><h3 class="ctitle">${ic('tv')}${l.id ? 'تعديل محاضرة' : 'جدولة محاضرة مباشرة'}</h3>
      <div class="grid g2"><div class="field" style="grid-column:1/-1"><label for="lv-t">عنوان المحاضرة</label><input class="inp" id="lv-t" maxlength="120" value="${esc(l.title || '')}"></div>
      <div class="field"><label for="lv-s">المقرر أو الدفعة</label><select class="inp" id="lv-s">${scopes.map(([k, v]) => `<option value="${k}" ${(l.cohort_id ? `c:${l.cohort_id}` : `s:${l.subject}`) === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
      <div class="field"><label for="lv-d">الموعد (توقيت الرياض)</label><input class="inp" type="datetime-local" id="lv-d" value="${l.starts_at ? toLocalInput(l.starts_at) : ''}"></div>
      <div class="field"><label for="lv-m">المدة بالدقائق</label><input class="inp num" type="number" id="lv-m" min="${LEC_MIN[0]}" max="${LEC_MIN[1]}" value="${l.minutes || 60}" inputmode="numeric"></div>
      <div class="field"><label for="lv-y">رابط البث على يوتيوب</label><input class="inp" id="lv-y" dir="ltr" placeholder="https://youtube.com/live/…" value="${l.youtube_id ? 'https://youtube.com/live/' + l.youtube_id : ''}"><span class="hint">يمكن إضافته لاحقًا قبل البث.</span></div>
      <label class="check" style="grid-column:1/-1"><input type="checkbox" id="lv-r" ${l.recording === false ? '' : 'checked'}><span>إتاحة التسجيل لمتدربيك بعد انتهاء البث (مكتبة المحاضرات)</span></label></div>
      <div class="errtxt" id="lvE" role="alert"></div>
      <div class="row-actions">${l.id ? `<button type="button" class="btn" id="lvX">إلغاء التعديل</button>` : '<span></span>'}<button class="btn pri" id="lvS" data-id="${l.id || ''}">${ic('check')} حفظ</button></div></form>`;
  const html = `${scopes.length ? form() : emptyBox('لا مقررات ولا دفعات مسندة إليك', 'تُجدول المحاضرات لمقرراتك أو لدفعات البرامج المسندة إليك.')}
    <details class="card pad rv lv-how" style="margin-top:14px"><summary><b>${ic('alert')} طريقة البث من قاعة Zoom إلى يوتيوب</b></summary><ol>
      <li>في يوتيوب: «إنشاء» ← «بث مباشر»، واختر الخصوصية «غير مدرج»، وانسخ <b>رابط البث</b> والصقه هنا قبل الموعد.</li>
      <li>في Zoom بحساب المركز: يجب تفعيل «البث المباشر للاجتماعات» على YouTube من إعدادات الحساب.</li>
      <li>ابدأ اجتماع Zoom، ثم «المزيد» ← «البث المباشر على YouTube» واختر البث نفسه.</li>
      <li>يرى متدربوك البث في تبويب «البث المباشر» من ${fmtNum(LIVE_EARLY_MIN)} دقيقة قبل الموعد، ويُسجَّل في يوتيوب تلقائيًا ليظهر في المكتبة إن أتحته.</li></ol>
      <p class="hint">رابط «غير مدرج» يشاهده من يملكه؛ يُرسل في البوابة لمتدربيك وحدهم، فلا تنشره خارجها.</p></details>
    <div class="card pad rv" style="margin-top:14px"><h3 class="ctitle">${ic('tv')}محاضراتي</h3>
      ${L.length ? [['live', 'مباشر الآن'], ['upcoming', 'القادمة'], ['ended', 'المنتهية'], ['cancelled', 'الملغاة']].map(([k, t]) => rows(k).length ? `<h4 class="lv-h">${t}</h4><ul class="lv-list">${rows(k).sort((a, b) => k === 'ended' ? b.starts_at.localeCompare(a.starts_at) : a.starts_at.localeCompare(b.starts_at)).map(row).join('')}</ul>` : '').join('') : emptyBox('لا محاضرات بعد')}</div>`;
  const bind = () => {
    const wire = () => {
      if(!$('#lvF')) return;
      if($('#lvX')) $('#lvX').onclick = () => { $('#lvF').outerHTML = form(); wire(); };
      $('#lvF').onsubmit = async e => { e.preventDefault(); const b = $('#lvS'), E = $('#lvE'); E.textContent = '';
        const sc = $('#lv-s').value, d = $('#lv-d').value, y = $('#lv-y').value.trim();
        if(!d){ E.textContent = 'حدّد موعد المحاضرة'; return; } if(y && !ytId(y)){ E.textContent = 'رابط يوتيوب غير صحيح'; return; }
        setBusy(b, true, 'جارٍ الحفظ');
        try { await Store.saveLecture({ id:b.dataset.id || null, title:$('#lv-t').value, minutes:$('#lv-m').value, starts_at:fromLocalInput(d), youtube:y,
            subject:sc.startsWith('s:') ? sc.slice(2) : null, cohort_id:sc.startsWith('c:') ? sc.slice(2) : null, recording:$('#lv-r').checked });
          toast('حُفظت المحاضرة'); reload(); } catch(x){ setBusy(b, false); E.textContent = x.message; } }; };
    wire();
    $$('[data-le]').forEach(b => b.onclick = () => { const l = L.find(x => x.id === b.dataset.le); $('#lvF').outerHTML = form(l); wire(); $('#lvF').scrollIntoView({ behavior:'smooth', block:'start' }); });
    $$('[data-ls]').forEach(b => b.onclick = async () => { const [id, st] = b.dataset.ls.split(':'); setBusy(b, true, '…');
      try { await Store.setLectureStatus(id, st); toast(st === 'ended' ? 'انتهى البث' : 'أُلغيت المحاضرة'); reload(); } catch(x){ setBusy(b, false); toast(x.message); } });
  };
  return { html, bind };
}

/* ======================= المتدرب ======================= */
let lvPick = null;
export function studentLive(D){
  const L = D.lectures || [], now = Date.now(), tn = id => (D.teachers || []).find(t => t.id === id)?.full_name || '';
  const live = L.filter(l => lectureState(l, now) === 'live'), soon = L.filter(l => lectureState(l, now) === 'upcoming').sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const lib = L.filter(l => lectureState(l, now) === 'ended' && l.youtube_id).sort((a, b) => b.starts_at.localeCompare(a.starts_at));
  const cur = live.find(l => l.youtube_id) || soon.find(l => l.youtube_id) || null, pick = lib.find(l => l.id === lvPick) || null;
  const meta = l => `${esc(scopeOf(D, l))}${tn(l.teacher_id) ? ' · ' + esc(tn(l.teacher_id)) : ''} · ${when(l)}`;
  const html = `<div class="card pad rv lv-now">${cur ? `<div class="lv-head"><span class="pill dot ${LEC_TONE[lectureState(cur, now)]}">${lectureState(cur, now) === 'live' ? 'مباشر الآن' : 'يبدأ قريبًا'}</span><h3 style="margin:6px 0 2px">${esc(cur.title)}</h3><p class="hint" style="margin:0 0 10px">${meta(cur)}</p></div>${player(cur, true)}`
      : live.length ? `<p class="alert t-info" style="margin:0"><span class="aic">${ic('tv')}</span><span>المحاضرة «${esc(live[0].title)}» جارية الآن، وسيظهر البث فور إضافة المدرب رابطه.</span></p>`
      : emptyBox('لا يوجد بث مباشر الآن', soon.length ? `المحاضرة القادمة: ${esc(soon[0].title)} · ${when(soon[0])}` : 'تظهر هنا محاضرات مدربيك المباشرة قبل موعدها بـ' + fmtNum(LIVE_EARLY_MIN) + ' دقيقة.')}</div>
    ${soon.length ? `<div class="card pad rv" style="margin-top:14px"><h3 class="ctitle">${ic('calendar')}المحاضرات القادمة</h3><ul class="lv-list">${soon.map(l => `<li class="lv-row"><div><b>${esc(l.title)}</b><div class="hint">${meta(l)}</div></div></li>`).join('')}</ul></div>` : ''}
    <div class="card pad rv" style="margin-top:14px" id="lvLib"><h3 class="ctitle">${ic('book')}مكتبة المحاضرات المسجلة</h3>
      ${pick ? `<div style="margin-bottom:12px"><h4 style="margin:0 0 4px">${esc(pick.title)}</h4><p class="hint" style="margin:0 0 8px">${meta(pick)}</p>${player(pick)}</div>` : ''}
      ${lib.length ? `<ul class="lv-list">${lib.map(l => `<li class="lv-row ${pick?.id === l.id ? 'on' : ''}"><div style="flex:1;min-width:0"><b>${esc(l.title)}</b><div class="hint">${meta(l)}</div></div><button class="btn sm ${pick?.id === l.id ? 'pri' : ''}" data-lvw="${l.id}">${ic('tv')} مشاهدة</button></li>`).join('')}</ul>` : emptyBox('لا تسجيلات متاحة بعد')}</div>`;
  const bind = rerender => { bindFullscreen(); $$('[data-lvw]').forEach(b => b.onclick = () => { lvPick = b.dataset.lvw; rerender(); $('#lvLib')?.scrollIntoView({ behavior:'smooth', block:'start' }); }); };
  return { html, bind, liveCount:live.length };
}

/* ======================= الإدارة ======================= */
let aQ = '', aSt = 'all';
export async function pageStudio(titleBar){
  const m = $('#main'); let L = [];
  try { L = await Store.adminLectures(); } catch(e){ m.innerHTML = emptyBox('تعذّر تحميل المحاضرات', esc(e.message)); return; }
  const draw = () => { const now = Date.now(), list = L.filter(l => (aSt === 'all' || lectureState(l, now) === aSt) && matchQ(aQ, l.title, l.teacher_name, l.subject, l.program_name));
    const n = k => L.filter(l => lectureState(l, now) === k).length;
    m.innerHTML = titleBar(`${ic('tv')}استوديو البث`, 'محاضرات المدربين <em>المباشرة والمسجلة</em>', 'الشرح في قاعة Zoom المركز ويُبث إلى يوتيوب، ويظهر في بوابة المتدرب لمتدربي المدرب وحدهم. يجدولها المدرب من تبويب «البث المباشر» في بوابته.') +
      `<div class="grid g4" style="margin-bottom:14px">${[['مباشر الآن', n('live'), 'bad'], ['القادمة', n('upcoming'), 'info'], ['المنتهية', n('ended'), 'g'], ['بلا رابط يوتيوب', L.filter(l => !l.youtube_id && ['live', 'upcoming'].includes(lectureState(l, now))).length, 'warn']].map(([k, v, c]) => `<div class="card pad ostat"><span class="hint"><span class="pill dot ${c}" aria-hidden="true" style="padding:0;background:none"></span>${k}</span><b class="num">${fmtNum(v)}</b></div>`).join('')}</div>
      <div class="filters"><select class="inp" id="st-s" aria-label="الحالة" style="width:auto">${[['all', 'كل الحالات'], ...Object.entries(LEC_STATE)].map(([k, v]) => `<option value="${k}" ${aSt === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input class="inp" id="st-q" type="search" placeholder="العنوان أو المدرب أو المقرر" value="${esc(aQ)}" style="flex:1;min-width:200px"></div>
      ${list.length ? `<div class="card rv"><div class="tblwrap"><table class="tb" id="stT"><thead><tr><th>المحاضرة</th><th>المدرب</th><th>المقرر أو الدفعة</th><th>الموعد</th><th>الحالة</th><th>يوتيوب</th><th></th></tr></thead><tbody>${list.map(l => { const st = lectureState(l, now);
        return `<tr><td>${esc(l.title)}</td><td>${esc(l.teacher_name)}</td><td>${esc(l.program_name || l.subject || '')}${l.section && l.section !== 'all' ? `<div class="hint">قسم ${SECTIONS[l.section]}</div>` : ''}</td><td class="num">${when(l)}</td>
          <td><span class="pill dot ${LEC_TONE[st]}">${LEC_STATE[st]}</span></td><td>${l.youtube_id ? `<a class="linkbtn" href="https://youtube.com/watch?v=${esc(l.youtube_id)}" target="_blank" rel="noopener">فتح</a>` : '—'}</td>
          <td>${['live', 'upcoming'].includes(st) ? `<button class="btn sm danger soft" data-sx="${l.id}:${st === 'live' ? 'ended' : 'cancelled'}">${st === 'live' ? 'إنهاء' : 'إلغاء'}</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>` : emptyBox(L.length ? 'لا نتائج بهذه التصفية' : 'لا محاضرات بعد', 'يجدول المدربون محاضراتهم من بواباتهم.')}`;
    $('#st-s').onchange = e => { aSt = e.target.value; draw(); };
    let t; $('#st-q').oninput = e => { aQ = e.target.value; clearTimeout(t); t = setTimeout(() => { draw(); const el = $('#st-q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
    $$('[data-sx]').forEach(b => b.onclick = async () => { const [id, st] = b.dataset.sx.split(':'); setBusy(b, true, '…');
      try { await Store.setLectureStatus(id, st); L = await Store.adminLectures(); toast('حُدّثت المحاضرة'); draw(); } catch(x){ setBusy(b, false); toast(x.message); } }); };
  draw();
}
