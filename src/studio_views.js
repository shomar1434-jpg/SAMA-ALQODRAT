/* =====================================================================
   استوديو سما للبث (الخطوة AZ): تبويب «البث المباشر» للمدرب (جدولة المحاضرات وربط بث يوتيوب من قاعة Zoom)،
   وللمتدرب (مشغّل مضمَّن بملء الشاشة، والقادمة، ومكتبة التسجيلات)، وصفحة الإدارة «استوديو البث» (#admin-studio).
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort, t12, matchQ } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { setBusy } from './features.js';
import { SECTIONS } from './qudurat.js';
import { LEC_STATE, LEC_TONE, LEC_MIN, LIVE_EARLY_MIN, embedUrl, lectureState, ytId, DOW_TXT, channelLiveEmbed } from './studio_logic.js';

/* توقيت الرياض: الإدخال datetime-local يُفهم بتوقيت الرياض، والعرض كذلك */
const riyadhParts = iso => { const r = new Date(Date.parse(iso) + 3 * 3600e3).toISOString(); return { date:r.slice(0, 10), hm:r.slice(11, 16) }; };
const toLocalInput = iso => { const p = riyadhParts(iso); return `${p.date}T${p.hm}`; };
const fromLocalInput = v => new Date(v + ':00+03:00').toISOString();
const when = l => { const p = riyadhParts(l.starts_at); return `${fmtShort(p.date)} · ${t12(p.hm)} · ${fmtNum(l.minutes)} دقيقة`; };
const scopeOf = (D, l) => l.cohort_id ? (D.programs || []).find(p => p.id === (D.cohorts || []).find(c => c.id === l.cohort_id)?.program_id)?.name || 'دفعة برنامج' : l.subject;
const chPlayer = (l, ch) => `<div class="lv-player big" data-lvp="${l.id}"><iframe src="${channelLiveEmbed(ch)}" title="${esc(l.title)}" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>
  <div class="lv-acts"><button type="button" class="btn sm" data-lvfs="${l.id}">${ic('expand')} ملء الشاشة</button></div>`;
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
  const form = (l = {}) => `<form class="card pad rv" id="lvF" novalidate><h3 class="ctitle">${ic('tv')}${l.id ? 'تعديل محاضرة' : 'محاضرة إضافية خارج الجدول'}</h3>
      <div class="grid g2"><div class="field" style="grid-column:1/-1"><label for="lv-t">عنوان المحاضرة</label><input class="inp" id="lv-t" maxlength="120" value="${esc(l.title || '')}"></div>
      <div class="field"><label for="lv-s">المقرر أو الدفعة</label><select class="inp" id="lv-s">${scopes.map(([k, v]) => `<option value="${k}" ${(l.cohort_id ? `c:${l.cohort_id}` : `s:${l.subject}`) === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></div>
      <div class="field"><label for="lv-d">الموعد (توقيت الرياض)</label><input class="inp" type="datetime-local" id="lv-d" value="${l.starts_at ? toLocalInput(l.starts_at) : ''}"></div>
      <div class="field"><label for="lv-m">المدة بالدقائق</label><input class="inp num" type="number" id="lv-m" min="${LEC_MIN[0]}" max="${LEC_MIN[1]}" value="${l.minutes || 60}" inputmode="numeric"></div>
      <div class="field"><label for="lv-y">رابط البث على يوتيوب</label><input class="inp" id="lv-y" dir="ltr" placeholder="https://youtube.com/live/…" value="${l.youtube_id ? 'https://youtube.com/live/' + l.youtube_id : ''}"><span class="hint">يمكن إضافته لاحقًا قبل البث.</span></div>
      <label class="check" style="grid-column:1/-1"><input type="checkbox" id="lv-r" ${l.recording === false ? '' : 'checked'}><span>إتاحة التسجيل لمتدربيك بعد انتهاء البث (مكتبة المحاضرات)</span></label></div>
      <div class="errtxt" id="lvE" role="alert"></div>
      <div class="row-actions">${l.id ? `<button type="button" class="btn" id="lvX">إلغاء التعديل</button>` : '<span></span>'}<button class="btn pri" id="lvS" data-id="${l.id || ''}">${ic('check')} حفظ</button></div></form>`;
  const SL = D.slots || [];
  const room = `<div class="card pad rv lv-room"><h3 class="ctitle">${ic('monitor')}قاعتي الثابتة على Zoom</h3>
      ${D.zoom_url ? `<p class="hint" style="margin:0 0 10px">ادخل منها كل يوم في موعدك، ثم ابدأ البث إلى قناة يوتيوب المركز (المزيد ← البث المباشر). يُسند البث إلى محاضرتك آليًا ويظهر لمتدربيك.</p>
        <a class="btn pri" id="lvZoom" href="${esc(D.zoom_url)}" target="_blank" rel="noopener">${ic('monitor')} دخول قاعة Zoom</a>` : `<p class="hint" style="margin:0">لم تُضف إدارة المركز رابط قاعتك بعد.</p>`}
      ${SL.length ? `<h4 class="lv-h">جدولي الثابت</h4><ul class="lv-list">${SL.map(x => `<li class="lv-row"><div><b>${esc(x.title)}</b><div class="hint">${esc(x.cohort_id ? scopeOf(D, x) : x.subject)} · ${x.dow.map(i => DOW_TXT[i]).join('، ')} · ${t12(String(x.start_time).slice(0, 5))} · ${fmtNum(x.minutes)} دقيقة</div></div></li>`).join('')}</ul>` : ''}</div>`;
  const html = `${room}${scopes.length ? form() : emptyBox('لا مقررات ولا دفعات مسندة إليك', 'تُجدول المحاضرات لمقرراتك أو لدفعات البرامج المسندة إليك.')}
    <details class="card pad rv lv-how" style="margin-top:14px"><summary><b>${ic('alert')} طريقة البث اليومي من قاعة Zoom إلى يوتيوب</b></summary><ol>
      <li>ادخل قاعتك الثابتة من زر «دخول قاعة Zoom» في موعدك.</li>
      <li>من «المزيد» ← «البث المباشر على YouTube» اختر قناة المركز، واجعل الخصوصية «غير مدرج»، واكتب في العنوان وسمك إن أعطته لك الإدارة.</li>
      <li>يظهر البث لمتدربيك في تبويب «البث المباشر» في موعد المحاضرة، ويُسند آليًا إلى محاضرة اليوم.</li>
      <li>بعد انتهاء البث يبقى التسجيل على الرابط نفسه، ويظهر في مكتبة متدربيك وفي «محاضراتي» هنا، ويبدأ بث جديد في اليوم التالي.</li></ol>
      <p class="hint">إن لم يُسند البث آليًا (مثل بثين في الوقت نفسه بلا وسم) فالصق رابطه في «تعديل» المحاضرة، أو تسنده الإدارة من «استوديو البث».</p></details>
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
  const groups = Object.entries(lib.reduce((a, l) => { const k = scopeOf(D, l) || 'محاضرات'; (a[k] = a[k] || []).push(l); return a; }, {}));
  const chLive = !cur && D.yt_channel && live.length ? live[0] : null;   // بث جارٍ لم يُسند بعد: رابط القناة الثابت
  const meta = l => `${esc(scopeOf(D, l))}${tn(l.teacher_id) ? ' · ' + esc(tn(l.teacher_id)) : ''} · ${when(l)}`;
  const html = `<div class="card pad rv lv-now">${cur ? `<div class="lv-head"><span class="pill dot ${LEC_TONE[lectureState(cur, now)]}">${lectureState(cur, now) === 'live' ? 'مباشر الآن' : 'يبدأ قريبًا'}</span><h3 style="margin:6px 0 2px">${esc(cur.title)}</h3><p class="hint" style="margin:0 0 10px">${meta(cur)}</p></div>${player(cur, true)}`
      : chLive ? `<div class="lv-head"><span class="pill dot bad">مباشر الآن</span><h3 style="margin:6px 0 2px">${esc(chLive.title)}</h3><p class="hint" style="margin:0 0 10px">${meta(chLive)}</p></div>${chPlayer(chLive, D.yt_channel)}`
      : live.length ? `<p class="alert t-info" style="margin:0"><span class="aic">${ic('tv')}</span><span>المحاضرة «${esc(live[0].title)}» جارية الآن، وسيظهر البث فور إضافة المدرب رابطه.</span></p>`
      : emptyBox('لا يوجد بث مباشر الآن', soon.length ? `المحاضرة القادمة: ${esc(soon[0].title)} · ${when(soon[0])}` : 'تظهر هنا محاضرات مدربيك المباشرة قبل موعدها بـ' + fmtNum(LIVE_EARLY_MIN) + ' دقيقة.')}</div>
    ${soon.length ? `<div class="card pad rv" style="margin-top:14px"><h3 class="ctitle">${ic('calendar')}المحاضرات القادمة</h3><ul class="lv-list">${soon.map(l => `<li class="lv-row"><div><b>${esc(l.title)}</b><div class="hint">${meta(l)}</div></div></li>`).join('')}</ul></div>` : ''}
    <div class="card pad rv" style="margin-top:14px" id="lvLib"><h3 class="ctitle">${ic('book')}مكتبة المحاضرات المسجلة</h3>
      ${pick ? `<div style="margin-bottom:12px"><h4 style="margin:0 0 4px">${esc(pick.title)}</h4><p class="hint" style="margin:0 0 8px">${meta(pick)}</p>${player(pick)}</div>` : ''}
      ${lib.length ? groups.map(([g, ls], gi) => `<details class="lv-grp" ${gi === 0 || ls.some(l => l.id === pick?.id) ? 'open' : ''}><summary><b>${esc(g)}</b> <span class="hint">(${fmtNum(ls.length)})</span></summary><ul class="lv-list">${ls.map(l => `<li class="lv-row ${pick?.id === l.id ? 'on' : ''}"><div style="flex:1;min-width:0"><b>${esc(l.title)}</b><div class="hint">${meta(l)}</div></div><button class="btn sm ${pick?.id === l.id ? 'pri' : ''}" data-lvw="${l.id}">${ic('tv')} مشاهدة</button></li>`).join('')}</ul></details>`).join('') : emptyBox('لا تسجيلات متاحة بعد')}</div>`;
  const bind = (rerender, refetch) => { bindFullscreen();
    if(refetch && L.some(l => !l.youtube_id && ['live', 'ended'].includes(lectureState(l, now)) && now - Date.parse(l.starts_at) < 86400e3) && Date.now() - (window.__ytSyncAt || 0) > 60000){
      window.__ytSyncAt = Date.now(); Store.ytSync().then(r => { if(r && r.assigned > 0) refetch(); }).catch(() => {}); } $$('[data-lvw]').forEach(b => b.onclick = () => { lvPick = b.dataset.lvw; rerender(); $('#lvLib')?.scrollIntoView({ behavior:'smooth', block:'start' }); }); };
  return { html, bind, liveCount:live.length };
}

/* ======================= الإدارة ======================= */
let aQ = '', aSt = 'all', sTab = 'lec';
export async function pageStudio(titleBar){
  const m = $('#main'); let L = [];
  try { L = await Store.adminLectures(); } catch(e){ m.innerHTML = emptyBox('تعذّر تحميل المحاضرات', esc(e.message)); return; }
  const head = () => titleBar(`${ic('tv')}استوديو البث`, 'محاضرات المدربين <em>المباشرة والمسجلة</em>', 'لكل مدرب قاعة Zoom ثابتة وجدول أسبوعي ثابت تُولَّد منه محاضرات كل يوم، ويُبث الشرح إلى قناة يوتيوب المركز ويظهر في بوابة المتدرب لمتدربي المدرب وحدهم.') +
    `<div class="tabs" role="tablist" style="margin:0 0 14px">${[['lec', 'tv', 'المحاضرات'], ['slots', 'calendar', 'الجدول الثابت وقاعات Zoom'], ['yt', 'send', 'قناة يوتيوب']].map(([k, i, t]) => `<button class="tab" role="tab" data-stt="${k}" aria-selected="${sTab === k}">${ic(i)}${t}</button>`).join('')}</div>`;
  const tabs = () => $$('[data-stt]').forEach(b => b.onclick = () => { sTab = b.dataset.stt; draw(); });
  const draw = () => { if(sTab !== 'lec'){ (sTab === 'slots' ? drawSlots : drawChannel)(m, head, tabs, draw); return; }
    const now = Date.now(), list = L.filter(l => (aSt === 'all' || lectureState(l, now) === aSt) && matchQ(aQ, l.title, l.teacher_name, l.subject, l.program_name));
    const n = k => L.filter(l => lectureState(l, now) === k).length;
    m.innerHTML = head() +
      `<div class="grid g4" style="margin-bottom:14px">${[['مباشر الآن', n('live'), 'bad'], ['القادمة', n('upcoming'), 'info'], ['المنتهية', n('ended'), 'g'], ['بلا رابط يوتيوب', L.filter(l => !l.youtube_id && ['live', 'upcoming'].includes(lectureState(l, now))).length, 'warn']].map(([k, v, c]) => `<div class="card pad ostat"><span class="hint"><span class="pill dot ${c}" aria-hidden="true" style="padding:0;background:none"></span>${k}</span><b class="num">${fmtNum(v)}</b></div>`).join('')}</div>
      <div class="filters"><select class="inp" id="st-s" aria-label="الحالة" style="width:auto">${[['all', 'كل الحالات'], ...Object.entries(LEC_STATE)].map(([k, v]) => `<option value="${k}" ${aSt === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
        <input class="inp" id="st-q" type="search" placeholder="العنوان أو المدرب أو المقرر" value="${esc(aQ)}" style="flex:1;min-width:200px"></div>
      ${list.length ? `<div class="card rv"><div class="tblwrap"><table class="tb" id="stT"><thead><tr><th>المحاضرة</th><th>المدرب</th><th>المقرر أو الدفعة</th><th>الموعد</th><th>الحالة</th><th>يوتيوب</th><th></th></tr></thead><tbody>${list.map(l => { const st = lectureState(l, now);
        return `<tr><td>${esc(l.title)}</td><td>${esc(l.teacher_name)}</td><td>${esc(l.program_name || l.subject || '')}${l.section && l.section !== 'all' ? `<div class="hint">قسم ${SECTIONS[l.section]}</div>` : ''}</td><td class="num">${when(l)}</td>
          <td><span class="pill dot ${LEC_TONE[st]}">${LEC_STATE[st]}</span></td><td>${l.youtube_id ? `<a class="linkbtn" href="https://youtube.com/watch?v=${esc(l.youtube_id)}" target="_blank" rel="noopener">فتح</a>` : '—'}</td>
          <td>${['live', 'upcoming'].includes(st) ? `<button class="btn sm danger soft" data-sx="${l.id}:${st === 'live' ? 'ended' : 'cancelled'}">${st === 'live' ? 'إنهاء' : 'إلغاء'}</button>` : ''}</td></tr>`; }).join('')}</tbody></table></div></div>` : emptyBox(L.length ? 'لا نتائج بهذه التصفية' : 'لا محاضرات بعد', 'يجدول المدربون محاضراتهم من بواباتهم.')}`;
    tabs(); $('#st-s').onchange = e => { aSt = e.target.value; draw(); };
    let t; $('#st-q').oninput = e => { aQ = e.target.value; clearTimeout(t); t = setTimeout(() => { draw(); const el = $('#st-q'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }, 250); };
    $$('[data-sx]').forEach(b => b.onclick = async () => { const [id, st] = b.dataset.sx.split(':'); setBusy(b, true, '…');
      try { await Store.setLectureStatus(id, st); L = await Store.adminLectures(); toast('حُدّثت المحاضرة'); draw(); } catch(x){ setBusy(b, false); toast(x.message); } }); };
  draw();
}

/* ======================= الإدارة: الجدول الثابت وقاعات Zoom (الخطوة BC) ======================= */
let slotEdit = null;
async function drawSlots(m, head, tabs, back){
  let S; try { S = await Store.adminStudio(); } catch(x){ m.innerHTML = head() + emptyBox('تعذّر التحميل', esc(x.message)); tabs(); return; }
  const T = S.teachers || [], tn = id => T.find(t => t.id === id)?.full_name || '—';
  const scopeTxt = s => s.cohort_id ? (() => { const c = (S.cohorts || []).find(x => x.id === s.cohort_id); return c ? `${c.program} · الدفعة ${fmtNum(c.number)}` : 'دفعة برنامج'; })() : `${s.subject} · قسم ${SECTIONS[s.section] || ''}`;
  const e = slotEdit || {}, te = T.find(t => t.id === (e.teacher_id || T[0]?.id));
  const scopes = te ? [...(te.subjects || []).map(x => [`s:${x}`, `${x} · قسم ${SECTIONS[te.section] || ''}`]), ...(S.cohorts || []).filter(c => c.teacher_id === te.id).map(c => [`c:${c.id}`, `${c.program} · الدفعة ${fmtNum(c.number)}`])] : [];
  m.innerHTML = head() + `<div class="card pad rv"><h3 class="ctitle">${ic('monitor')}قاعات Zoom الثابتة للمدربين</h3>
      <p class="hint">رابط القاعة يراه المدرب وحده في بوابته ليبدأ منه اجتماعه اليومي، ولا يصل إلى المتدربين (يشاهدون البث على يوتيوب). «وسم البث» كلمة يضعها المدرب في عنوان بثه على يوتيوب (مثل اسمه) ليُسند البث إلى محاضرته آليًا حين تتزامن محاضرتان.</p>
      ${T.length ? `<div class="tblwrap"><table class="tb" id="zmT"><thead><tr><th>المدرب</th><th>رابط قاعة Zoom</th><th>وسم البث</th><th></th></tr></thead><tbody>${T.map(t => `<tr><td>${esc(t.full_name)}<div class="hint">${esc((t.subjects || []).join('، '))}${t.section ? ' · ' + (SECTIONS[t.section] || '') : ''}</div></td>
        <td><input class="inp" dir="ltr" id="zm-${t.id}" value="${esc(t.zoom_url || '')}" placeholder="https://us06web.zoom.us/j/…" aria-label="قاعة ${esc(t.full_name)}"></td>
        <td><input class="inp" id="tg-${t.id}" value="${esc(t.yt_tag || '')}" maxlength="60" style="max-width:160px" aria-label="وسم بث ${esc(t.full_name)}"></td>
        <td><button class="btn sm" data-zms="${t.id}">${ic('check')} حفظ</button></td></tr>`).join('')}</tbody></table></div>` : emptyBox('لا مدربين', 'أضف المدربين من «المدربون وأولياء الأمور».')}</div>
    ${T.length ? `<form class="card pad rv" id="slF" style="margin-top:14px" novalidate><h3 class="ctitle">${ic('calendar')}${e.id ? 'تعديل موعد ثابت' : 'موعد ثابت جديد'}</h3>
      <div class="grid g2"><div class="field"><label for="sl-t">المدرب</label><select class="inp" id="sl-t">${T.map(t => `<option value="${t.id}" ${te?.id === t.id ? 'selected' : ''}>${esc(t.full_name)}</option>`).join('')}</select></div>
      <div class="field"><label for="sl-s">المقرر أو الدفعة</label><select class="inp" id="sl-s">${scopes.map(([k, v]) => `<option value="${k}" ${(e.cohort_id ? `c:${e.cohort_id}` : `s:${e.subject}`) === k ? 'selected' : ''}>${esc(v)}</option>`).join('') || '<option value="">لا مقررات لهذا المدرب</option>'}</select></div>
      <div class="field" style="grid-column:1/-1"><label for="sl-n">عنوان المحاضرة</label><input class="inp" id="sl-n" maxlength="120" value="${esc(e.title || '')}" placeholder="مثل: شرح الكمي اليومي"></div>
      <fieldset class="field" style="grid-column:1/-1;border:0;padding:0;margin:0"><legend>الأيام</legend><div style="display:flex;gap:8px;flex-wrap:wrap">${DOW_TXT.map((d, i) => `<label class="check"><input type="checkbox" data-sld="${i}" ${(e.dow || []).includes(i) ? 'checked' : ''}><span>${d}</span></label>`).join('')}</div></fieldset>
      <div class="field"><label for="sl-h">وقت البداية (توقيت الرياض)</label><input class="inp" type="time" id="sl-h" value="${esc(String(e.start_time || '').slice(0, 5))}"></div>
      <div class="field"><label for="sl-m">المدة بالدقائق</label><input class="inp num" type="number" id="sl-m" min="${LEC_MIN[0]}" max="${LEC_MIN[1]}" value="${e.minutes || 60}" inputmode="numeric"></div>
      <label class="check" style="grid-column:1/-1"><input type="checkbox" id="sl-r" ${e.recording === false ? '' : 'checked'}><span>إتاحة التسجيل للمتدربين بعد انتهاء البث</span></label></div>
      <p class="hint">تُنشأ محاضرة لكل يوم مختار تلقائيًا (اليوم والأسبوع القادم)، وتُتخطى أيام القسم التي لا جلسة فيها (العطل).</p>
      <div class="errtxt" id="slE" role="alert"></div>
      <div class="row-actions">${e.id ? '<button type="button" class="btn" id="slX">إلغاء التعديل</button>' : '<span></span>'}<button class="btn pri" id="slS">${ic('check')} حفظ الموعد</button></div></form>` : ''}
    <div class="card pad rv" style="margin-top:14px"><h3 class="ctitle">${ic('clock')}المواعيد الثابتة</h3>
      ${(S.slots || []).length ? `<div class="tblwrap"><table class="tb" id="slT"><thead><tr><th>المحاضرة</th><th>المدرب</th><th>المقرر أو الدفعة</th><th>الأيام والوقت</th><th></th></tr></thead><tbody>${S.slots.map(s => `<tr class="${s.active ? '' : 'muted'}"><td>${esc(s.title)}${s.active ? '' : ' <span class="pill g">موقوف</span>'}</td><td>${esc(tn(s.teacher_id))}</td><td>${esc(scopeTxt(s))}</td>
        <td>${s.dow.map(i => DOW_TXT[i]).join('، ')}<div class="hint num">${t12(String(s.start_time).slice(0, 5))} · ${fmtNum(s.minutes)} دقيقة</div></td>
        <td style="white-space:nowrap"><button class="btn sm" data-sle="${s.id}">${ic('edit')}</button> <button class="btn sm ${s.active ? 'danger soft' : ''}" data-sla="${s.id}">${s.active ? 'إيقاف' : 'تفعيل'}</button></td></tr>`).join('')}</tbody></table></div>` : emptyBox('لا مواعيد ثابتة بعد', 'أضف موعدًا لكل مدرب بحسب جدول الدورات اليومية.')}</div>`;
  tabs();
  $$('[data-zms]').forEach(b => b.onclick = async () => { const id = b.dataset.zms; setBusy(b, true, '…');
    try { await Store.setTeacherStudio(id, $(`#zm-${id}`).value, $(`#tg-${id}`).value); toast('حُفظت قاعة المدرب'); setBusy(b, false); } catch(x){ setBusy(b, false); toast(x.message); } });
  if($('#sl-t')) $('#sl-t').onchange = ev => { slotEdit = { ...(slotEdit || {}), teacher_id: ev.target.value, subject: null, cohort_id: null }; back(); };
  if($('#slX')) $('#slX').onclick = () => { slotEdit = null; back(); };
  if($('#slF')) $('#slF').onsubmit = async ev => { ev.preventDefault(); const b = $('#slS'), sc = $('#sl-s').value; $('#slE').textContent = ''; setBusy(b, true, 'جارٍ الحفظ');
    try { await Store.saveSlot({ id: e.id || null, teacher_id: $('#sl-t').value, title: $('#sl-n').value, subject: sc.startsWith('s:') ? sc.slice(2) : null, cohort_id: sc.startsWith('c:') ? sc.slice(2) : null,
        dow: $$('[data-sld]').filter(x => x.checked).map(x => +x.dataset.sld), start_time: $('#sl-h').value, minutes: $('#sl-m').value, recording: $('#sl-r').checked, active: e.id ? e.active !== false : true });
      slotEdit = null; toast('حُفظ الموعد وأُنشئت محاضراته'); back(); } catch(x){ setBusy(b, false); $('#slE').textContent = x.message; } };
  $$('[data-sle]').forEach(b => b.onclick = () => { slotEdit = S.slots.find(s => s.id === b.dataset.sle); back(); });
  $$('[data-sla]').forEach(b => b.onclick = async () => { const s = S.slots.find(x => x.id === b.dataset.sla); setBusy(b, true, '…');
    try { await Store.saveSlot({ ...s, start_time: String(s.start_time).slice(0, 5), active: !s.active }); toast(s.active ? 'أُوقف الموعد' : 'فُعّل الموعد'); back(); } catch(x){ setBusy(b, false); toast(x.message); } });
}

/* ======================= الإدارة: قناة يوتيوب (الخطوة BC) ======================= */
async function drawChannel(m, head, tabs, back){
  let S, L = []; try { [S, L] = await Promise.all([Store.adminStudio(), Store.adminLectures()]); } catch(x){ m.innerHTML = head() + emptyBox('تعذّر التحميل', esc(x.message)); tabs(); return; }
  const V = S.videos || [], byId = id => L.find(l => l.id === id), open = L.filter(l => l.status !== 'cancelled').sort((a, b) => b.starts_at.localeCompare(a.starts_at)).slice(0, 120);
  const lecTxt = l => `${l.title} · ${l.teacher_name || ''} · ${when(l)}`;
  m.innerHTML = head() + `<div class="card pad rv"><h3 class="ctitle">${ic('send')}قناة يوتيوب المركز</h3>
      ${S.linked ? `<p><span class="pill ok dot">مربوطة</span> ${esc(S.channel_title || '')} <span class="hint">${S.synced_at ? '· آخر مزامنة ' + esc(new Date(S.synced_at).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh' })) : ''}</span></p>
        <p class="hint">تُجلب البثوث (ومنها غير المدرجة) آليًا كلما فتح المتدرب أو المدرب تبويب البث، وتُسند إلى المحاضرة التي بدأ البث في موعدها.</p>
        <div class="row-actions" style="justify-content:flex-start"><button class="btn pri" id="ytSync">${ic('refresh')} مزامنة الآن</button><button class="btn danger soft" id="ytUn">فك الربط</button></div>`
      : `<p class="hint">اربط القناة مرة واحدة بحساب Google المالك لها (صلاحية قراءة فقط)، فتظهر البثوث غير المدرجة في بوابات المتدربين والمدربين دون لصق الروابط. الربط للمالك الأساسي وحده.</p>
        <div class="row-actions" style="justify-content:flex-start"><button class="btn pri" id="ytLink">${ic('send')} ربط قناة يوتيوب</button></div>
        <details style="margin-top:10px"><summary class="hint">قبل الربط (مرة واحدة)</summary><ol class="hint">
          <li>في Google Cloud Console: أنشئ مشروعًا وفعّل «YouTube Data API v3».</li>
          <li>شاشة الموافقة OAuth: نوع External، أضف النطاق youtube.readonly، وانقلها إلى «In production».</li>
          <li>أنشئ «OAuth client ID» من نوع Web application، وأضف عنوان إعادة التوجيه: <code dir="ltr">…supabase.co/functions/v1/youtube</code></li>
          <li>في Supabase ← Edge Functions ← Secrets: أضف GOOGLE_CLIENT_ID وGOOGLE_CLIENT_SECRET.</li></ol></details>`}
      <div class="field" style="margin-top:12px;max-width:480px"><label for="yt-ch">معرّف القناة (للبث الجاري قبل إسناده)</label><div style="display:flex;gap:8px"><input class="inp" id="yt-ch" dir="ltr" value="${esc(S.channel_id || '')}" placeholder="UC…"><button class="btn" id="ytCh">حفظ</button></div>
        <span class="hint">يُملأ آليًا عند الربط. إن كان البث «عامًا» يظهر للمتدرب من رابط القناة الثابت فور بدئه.</span></div></div>
    <div class="card pad rv" style="margin-top:14px"><h3 class="ctitle">${ic('tv')}بثوث القناة</h3>
      ${V.length ? `<div class="tblwrap"><table class="tb" id="ytT"><thead><tr><th>البث</th><th>بدأ</th><th>الحالة</th><th>المحاضرة</th></tr></thead><tbody>${V.map(v => `<tr><td>${esc(v.title || v.video_id)}<div class="hint" dir="ltr" style="text-align:right">${esc(v.video_id)} · ${esc(v.privacy || '')}</div></td>
        <td class="num">${v.actual_start ? esc(new Date(v.actual_start).toLocaleString('ar-SA', { timeZone: 'Asia/Riyadh', dateStyle: 'short', timeStyle: 'short' })) : '—'}</td><td>${esc(v.life_cycle || '')}</td>
        <td><select class="inp" data-ytv="${esc(v.video_id)}" aria-label="محاضرة البث" style="max-width:320px"><option value="">— غير مسند —</option>${(v.lecture_id && !open.some(l => l.id === v.lecture_id) && byId(v.lecture_id) ? [byId(v.lecture_id)] : []).concat(open).map(l => `<option value="${l.id}" ${v.lecture_id === l.id ? 'selected' : ''}>${esc(lecTxt(l))}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>`
        : emptyBox('لا بثوث بعد', S.linked ? 'اضغط «مزامنة الآن» بعد أول بث.' : 'اربط القناة لتظهر بثوثها هنا.')}</div>`;
  tabs();
  if($('#ytLink')) $('#ytLink').onclick = async ev => { const b = ev.currentTarget; setBusy(b, true, 'جارٍ التحويل');
    try { location.href = await Store.ytLink(); } catch(x){ setBusy(b, false); toast(x.message); } };
  if($('#ytUn')) $('#ytUn').onclick = async ev => { const b = ev.currentTarget; setBusy(b, true, '…'); try { await Store.ytUnlink(); toast('فُكّ ربط القناة'); back(); } catch(x){ setBusy(b, false); toast(x.message); } };
  if($('#ytSync')) $('#ytSync').onclick = async ev => { const b = ev.currentTarget; setBusy(b, true, 'جارٍ المزامنة');
    try { const r = await Store.ytSync(true); toast(r?.videos !== undefined ? `جُلب ${fmtNum(r.videos)} بثًا وأُسند ${fmtNum(r.assigned || 0)}` : 'تمت المزامنة'); back(); } catch(x){ setBusy(b, false); toast(x.message); } };
  $('#ytCh').onclick = async ev => { const b = ev.currentTarget; setBusy(b, true, '…'); try { await Store.setChannel($('#yt-ch').value); toast('حُفظ معرّف القناة'); setBusy(b, false); } catch(x){ setBusy(b, false); toast(x.message); } };
  $$('[data-ytv]').forEach(sel => sel.onchange = async () => { try { await Store.assignVideo(sel.dataset.ytv, sel.value || null); toast(sel.value ? 'أُسند البث إلى المحاضرة' : 'فُكّ الإسناد'); } catch(x){ toast(x.message); back(); } });
}
