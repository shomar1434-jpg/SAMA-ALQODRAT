/* =====================================================================
   واجهات بوابة المدرب: ملخص عمل اليوم، المجموعات الذكية وتجهيز الواجب العلاجي، وملف المدرب؛
   وبطاقة «مدربو مقرراتي» في بوابة المتدرب (النبذة ورابط قناة المدرب لمتدربيه فقط).
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort, riyadhNow, t12 } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { modal, closeModal } from './views2_programs.js';
import { docShell, printDocs, fmtGreg, fmtHijri } from './print.js';
import { Store } from './data2.js';
import { teacherDashboard } from './portal_logic.js';
import { teacherTeaches } from './learning_logic.js';
import { setHwPreset } from './learning_views.js';
import { setBusy } from './features.js';
import { SECTIONS } from './qudurat.js';
import { analysisHtml } from './analysis_views.js';
import { smartGroups, daySummary, BIO_MAX, CV_MAX, AVATAR_MAX, GROUP_NAME_MAX, PEOPLE_FLAGS, peopleRows, peopleFilter, traineeCard } from './trainer_logic.js';

const avatarHtml = (t, big) => t.avatar ? `<img class="avt ${big ? 'lg' : ''}" src="${esc(t.avatar)}" alt="صورة ${esc(t.full_name)}">` : `<span class="avt ph ${big ? 'lg' : ''}" aria-hidden="true">${esc((t.full_name || '؟').trim()[0])}</span>`;
/* صورة المدرب: تُقص مربعًا وتُصغَّر في المتصفح قبل الحفظ */
function squareAvatar(file){
  return new Promise((res, rej) => { if(!/^image\/(jpeg|png|webp)$/.test(file?.type || '')) return rej(new Error('اختر صورة JPG أو PNG أو WebP'));
    const r = new FileReader(); r.onerror = () => rej(new Error('تعذّرت قراءة الصورة'));
    r.onload = () => { const im = new Image(); im.onerror = () => rej(new Error('تعذّرت قراءة الصورة'));
      im.onload = () => { const side = Math.min(im.width, im.height); let out = '';
        for(const [px, q] of [[240, .8], [200, .72], [160, .64], [120, .56]]){ const c = document.createElement('canvas'); c.width = c.height = px; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, px, px);
          x.drawImage(im, (im.width - side) / 2, (im.height - side) / 2, side, side, 0, 0, px, px); out = c.toDataURL('image/jpeg', q); if(out.length <= AVATAR_MAX) break; }
        out.length <= AVATAR_MAX ? res(out) : rej(new Error('الصورة كبيرة جدًا')); };
      im.src = r.result; };
    r.readAsDataURL(file); });
}

export function daySummaryHtml(D, dash){
  const s = daySummary(D, D.me, dash), cell = (l, v, c) => `<span>${l} <b class="${c || ''}">${fmtNum(v)}</b></span>`;
  return `<div class="card pad rv day-sum" id="daySum" style="margin-top:16px"><div class="ord-amt" style="margin:0">${cell('المتدربون النشطون', s.total)}${cell('حاضر', s.present)}${cell('متأخر', s.late)}${cell('غائب', s.absent)}${cell('لم يسجل بعد', s.pending)}${cell('واجبات تنتظر التصحيح', s.to_grade)}</div>
    <p class="hint" style="margin:8px 0 0">من سجلات الحضور والواجبات الفعلية · آخر تحديث ${t12(riyadhNow().hm)}</p></div>`;
}
export function teacherGroups(D, reload, go){
  const n = riyadhNow(), G = smartGroups(D, D.me, teacherDashboard(D, D.me, n), n.date);
  const saved = D.groups || [], nameOf = id => (D.trainees || []).find(t => t.id === id)?.full_name || '';
  return { html:`<div class="card pad rv" id="myGroups" style="margin-bottom:16px"><h3 class="ctitle">${ic('users')}مجموعاتي المحفوظة</h3>
      <p class="hint" style="margin:-4px 0 12px">قوائم تسمّيها أنت من متدربيك وتبقى محفوظة. تُنشأ من تبويب «متدربيّ» بتحديد الأسماء ثم «حفظ كمجموعة»، وتُختار هدفًا عند نشر واجب.</p>
      ${saved.length ? saved.map(g => `<details class="hw sg"><summary><b>${esc(g.name)}</b> <span class="pill g">${fmtNum(g.trainee_ids.length)}</span></summary>
        <ul class="iss" style="margin:8px 0">${g.trainee_ids.map(id => `<li>${esc(nameOf(id))}</li>`).join('')}</ul>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn pri sm" data-gh="${g.id}">${ic('form')} تجهيز واجب لهم</button><button class="btn sm" data-gd="${g.id}">${ic('trash')} حذف المجموعة</button></div></details>`).join('') : '<p class="hint">لا مجموعات محفوظة بعد.</p>'}</div>
    <div class="card pad rv"><h3 class="ctitle">${ic('users')}المجموعات الذكية</h3>
      <p class="hint" style="margin:-4px 0 12px">تُحسب الآن من الحضور والواجبات الفعلية، وعتباتها من إعدادات المركز. لا يُرسل شيء تلقائيًا: «تجهيز واجب علاجي» يفتح نموذج الواجب بقائمة المجموعة لتراجعه وتنشره أنت.</p>
      ${G.length ? G.map((g, i) => `<details class="hw sg" ${i === 0 ? 'open' : ''}><summary><b>${esc(g.title)}</b> <span class="pill ${g.key.startsWith('plan:') ? 'g' : 'warn'}">${fmtNum(g.members.length)}</span> <span class="hint">${esc(g.why)}</span></summary>
        <ul class="iss" style="margin:8px 0">${g.members.map(m => `<li>${esc(m.name)}${m.note ? ` <span class="hint">· ${esc(m.note)}</span>` : ''}</li>`).join('')}</ul>
        <button class="btn pri sm" data-sg="${esc(g.key)}">${ic('form')} تجهيز واجب علاجي لهم</button></details>`).join('') : emptyBox('لا مجموعات الآن', 'لا متدربين متأخرين أو متعثرين وفق العتبات الحالية.')}</div>`,
    bind(){ $$('[data-gh]').forEach(b => b.onclick = () => { const g = saved.find(x => x.id === b.dataset.gh); setHwPreset({ ids:g.trainee_ids.slice(), title:`واجب — ${g.name}` }); go('hw'); });
      $$('[data-gd]').forEach(b => b.onclick = () => { const g = saved.find(x => x.id === b.dataset.gd);
        modal(`<h3>حذف المجموعة</h3><p>تُحذف قائمة «${esc(g.name)}» فقط؛ لا يتأثر المتدربون ولا الواجبات المنشورة.</p><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" id="gdNo">إلغاء</button><button class="btn pri" id="gdGo">حذف</button></div>`);
        $('#gdNo').onclick = closeModal; $('#gdGo').onclick = async e => { setBusy(e.currentTarget, true, 'جارٍ الحذف'); try { await Store.deleteGroup(g.id); closeModal(); toast('حُذفت المجموعة'); reload(); } catch(x){ closeModal(); toast(x.message); } }; });
      $$('[data-sg]').forEach(b => b.onclick = () => { const g = G.find(x => x.key === b.dataset.sg); setHwPreset({ ids:g.members.map(m => m.trainee_id), title:`تدريب علاجي — ${g.title}` }); go('hw'); }); } };
}
export function teacherProfile(D, reload){
  const me = D.me;
  return { html:`<form class="card pad rv" id="tpF" novalidate><h3 class="ctitle">${ic('id')}ملفي التعريفي</h3>
      <p class="hint" style="margin:-4px 0 12px">يظهر اسمك ونبذتك لمتدربي مقرراتك، ورابط قناتك لهم وحدهم. لا يُعرض جوالك ولا هويتك.</p>
      <dl class="ord-dl" style="margin-bottom:12px"><dt>الاسم</dt><dd>${esc(me.full_name)}</dd><dt>القسم</dt><dd>${me.section ? SECTIONS[me.section] : '—'}</dd><dt>المقررات</dt><dd>${esc((me.subjects || []).join('، ') || 'مدرب برامج')}</dd></dl>
      <div class="field"><span class="lbl" id="tpAvL">الصورة الشخصية (اختيارية)</span><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span id="tpAv">${avatarHtml(me, true)}</span>
        <label class="btn sm" for="tp-av">${ic('plus')} اختيار صورة</label><input type="file" id="tp-av" accept="image/jpeg,image/png,image/webp" class="sr-only" aria-labelledby="tpAvL"><button type="button" class="btn sm" id="tpAvX" ${me.avatar ? '' : 'hidden'}>إزالة الصورة</button></div>
        <p class="hint" style="margin:6px 0 0">تُقص مربعة وتُصغَّر تلقائيًا، وتظهر لمتدربي مقرراتك.</p></div>
      <div class="field"><label for="tp-bio">نبذة مهنية مختصرة (حتى ${fmtNum(BIO_MAX)} حرف)</label><textarea class="inp" id="tp-bio" rows="4" maxlength="${BIO_MAX}" style="padding:10px 14px;line-height:1.8">${esc(me.bio || '')}</textarea></div>
      <div class="field"><label for="tp-cv">السيرة المهنية: المؤهلات والخبرات والدورات (حتى ${fmtNum(CV_MAX)} حرف)</label><textarea class="inp" id="tp-cv" rows="7" maxlength="${CV_MAX}" style="padding:10px 14px;line-height:1.8">${esc(me.cv || '')}</textarea></div>
      <div class="field"><label for="tp-tg">رابط قناة تيليجرام للشروحات (اختياري)</label><input class="inp" id="tp-tg" dir="ltr" placeholder="https://t.me/…" value="${esc(me.telegram || '')}"></div>
      <div class="errtxt" id="tpE" role="alert"></div><div style="text-align:end"><button class="btn pri" id="tpS">${ic('check')} حفظ</button></div></form>`,
    bind(){ let av = me.avatar || '';
      const draw = () => { $('#tpAv').innerHTML = avatarHtml({ ...me, avatar:av }, true); $('#tpAvX').hidden = !av; };
      $('#tp-av').onchange = async e => { $('#tpE').textContent = ''; try { av = await squareAvatar(e.target.files[0]); draw(); } catch(x){ $('#tpE').textContent = x.message; } e.target.value = ''; };
      $('#tpAvX').onclick = () => { av = ''; draw(); };
      $('#tpF').onsubmit = async e => { e.preventDefault(); const b = $('#tpS'); $('#tpE').textContent = ''; setBusy(b, true, 'جارٍ الحفظ');
      try { await Store.saveMyProfile({ bio:$('#tp-bio').value, telegram:$('#tp-tg').value.trim(), avatar:av, cv:$('#tp-cv').value }); toast('حُفظ ملفك'); reload(); } catch(x){ setBusy(b, false); $('#tpE').textContent = x.message; } }; } };
}
/* بوابة المتدرب: مدربو مقرراته */
export function trainersCardHtml(D, trainee_id){
  const ts = (D.teachers || []).filter(t => teacherTeaches(D, t, trainee_id));
  return ts.length ? `<section class="card pad rv" id="myTrainers" style="margin-top:14px"><h3 class="ctitle">${ic('users')}مدربو مقرراتي</h3>${ts.map(t => `<div class="trn">${avatarHtml(t)}<div><b>${esc(t.full_name)}</b> <span class="hint">${esc((t.subjects || []).join('، '))}</span>${t.bio ? `<p>${esc(t.bio)}</p>` : ''}${t.cv ? `<details class="cv"><summary>السيرة المهنية</summary><p>${esc(t.cv)}</p></details>` : ''}</div>
      ${t.telegram ? `<a class="btn sm" href="${esc(t.telegram)}" target="_blank" rel="noopener">${ic('activity')} قناة الشروحات</a>` : ''}</div>`).join('')}</section>` : '';
}

/* ---------- متدربيّ: قائمة بفلاتر، بطاقة تفصيلية لكل متدرب، وحفظ المحدَّدين مجموعةً ---------- */
let PF = { q:'', plan:'', flag:'all' };
const pct = v => v == null ? '—' : fmtNum(v) + '٪';
export function cardHtml(c){
  const SUB = { submitted:'بانتظار التصحيح', graded:'مصحَّح', needs_revision:'يحتاج تعديلًا' };
  return `<div class="tcard"><h3>${esc(c.name)}</h3><p class="hint" style="margin:0 0 10px">${esc(c.plan || '')}${c.end ? ` · ينتهي الاشتراك ${fmtShort(c.end)}${c.days_left != null && c.days_left >= 0 ? ` (بعد ${fmtNum(c.days_left)} يومًا)` : ''}` : ''}</p>
    ${c.flags.length ? `<p style="margin:0 0 10px">${c.flags.map(f => `<span class="pill warn">${PEOPLE_FLAGS[f]}</span>`).join(' ')}</p>` : ''}
    <div class="ord-amt" style="margin:0 0 12px"><span>نسبة الحضور <b>${pct(c.rate)}</b></span><span>الإنجاز <b>${pct(c.achievement)}</b></span><span>غياب متتالٍ <b>${fmtNum(c.consec)}</b></span><span>متوسط درجاته <b>${pct(c.hw.avg)}</b></span></div>
    <dl class="ord-dl"><dt>واجباتي المرسلة له</dt><dd>${fmtNum(c.hw.assigned)}</dd><dt>سلّم منها</dt><dd>${fmtNum(c.hw.done)}${c.hw.late ? ` <span class="hint">(${fmtNum(c.hw.late)} بعد الموعد)</span>` : ''}</dd><dt>متأخرة لم تُسلَّم</dt><dd>${fmtNum(c.hw.overdue)}</dd></dl>
    <h4 style="margin:14px 0 6px;font-size:14px">آخر التسليمات</h4>${c.recent.length ? `<ul class="ses-list">${c.recent.map(r => `<li><b>${esc(r.title)}</b><span>${SUB[r.status] || ''}${r.late ? ' · متأخر' : ''}</span><span class="pill ${r.score == null ? 'g' : r.score / r.max >= .7 ? 'ok' : 'warn'}">${r.score == null ? '—' : fmtNum(r.score) + ' / ' + fmtNum(r.max)}</span><span class="hint">${r.at ? fmtShort(r.at) : ''}</span></li>`).join('')}</ul>` : '<p class="hint">لا تسليمات بعد.</p>'}
    <p class="hint" style="margin:10px 0 0">من سجلات الحضور وواجباتك أنت فقط. لا تظهر هنا بيانات اتصال المتدرب ولا هويته.</p></div>`;
}
export function teacherPeople(D, reload, go){
  const n = riyadhNow(), all = peopleRows(D, D.me, teacherDashboard(D, D.me, n), n.date), plans = [...new Set(all.map(r => r.plan))], picked = new Set();
  const rowsHtml = () => { const L = peopleFilter(all, PF);
    return L.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th><span class="sr-only">تحديد</span></th><th>المتدرب</th><th>الباقة</th><th>الحضور</th><th>الإنجاز</th><th>واجبات متأخرة</th><th>ملاحظات</th></tr></thead><tbody>${L.map(r => `<tr>
        <td><input type="checkbox" data-pk="${r.trainee_id}" ${picked.has(r.trainee_id) ? 'checked' : ''} aria-label="تحديد ${esc(r.name)}"></td>
        <td><button class="linkbtn" data-pc="${r.trainee_id}">${esc(r.name)}</button></td><td>${esc(r.plan)}</td><td class="num">${pct(r.rate)}</td><td class="num">${pct(r.achievement?.overall)}</td>
        <td class="num">${r.overdue ? `<span class="pill warn">${fmtNum(r.overdue)}</span>` : '—'}</td><td>${r.flags.filter(f => f !== 'hw_late').map(f => `<span class="pill g">${PEOPLE_FLAGS[f]}</span>`).join(' ') || '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint" id="ppN" style="margin:8px 0 0">${fmtNum(L.length)} من ${fmtNum(all.length)} متدربًا</p>` : emptyBox('لا متدربين بهذه التصفية'); };
  return { html:`<div class="card pad rv" id="people"><h3 class="ctitle">${ic('user')}متدربيّ</h3>
      <div class="grid g3" style="margin-bottom:12px"><div class="field"><label for="pp-q">بحث بالاسم</label><input class="inp" id="pp-q" value="${esc(PF.q)}" autocomplete="off"></div>
        <div class="field"><label for="pp-p">الباقة</label><select class="inp" id="pp-p"><option value="">كل الباقات</option>${plans.map(p => `<option ${PF.plan === p ? 'selected' : ''}>${esc(p)}</option>`).join('')}</select></div>
        <div class="field"><label for="pp-f">الحالة</label><select class="inp" id="pp-f">${Object.entries(PEOPLE_FLAGS).map(([k, v]) => `<option value="${k}" ${PF.flag === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
      <div id="ppList">${rowsHtml()}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:12px"><button class="btn sm" id="ppAll">تحديد المعروضين</button><button class="btn pri sm" id="ppSave">${ic('plus')} حفظ المحدَّدين كمجموعة</button><span class="hint" id="ppSel"></span></div></div>`,
    bind(){ const sel = () => { $('#ppSel').textContent = picked.size ? `المحدَّد: ${fmtNum(picked.size)}` : ''; };
      const wire = () => { $$('[data-pk]').forEach(c => c.onchange = () => { c.checked ? picked.add(c.dataset.pk) : picked.delete(c.dataset.pk); sel(); });
        $$('[data-pc]').forEach(b => b.onclick = () => { const r = all.find(x => x.trainee_id === b.dataset.pc);
          modal(`${cardHtml(traineeCard(D, D.me, r, n.date))}<div class="an-in-modal">${analysisHtml(D, r.trainee_id, { role:'teacher', subjects:D.me.subjects, name:String(r.name || '').split(' ')[0] })}</div><div style="text-align:end;margin-top:12px"><button class="btn pri" id="pcX">إغلاق</button></div>`); $('#pcX').onclick = closeModal; }); };
      const draw = () => { $('#ppList').innerHTML = rowsHtml(); wire(); };
      $('#pp-q').oninput = e => { PF.q = e.target.value; draw(); }; $('#pp-p').onchange = e => { PF.plan = e.target.value; draw(); }; $('#pp-f').onchange = e => { PF.flag = e.target.value; draw(); };
      $('#ppAll').onclick = () => { peopleFilter(all, PF).forEach(r => picked.add(r.trainee_id)); draw(); sel(); };
      $('#ppSave').onclick = () => { if(!picked.size) return toast('حدّد متدربًا واحدًا على الأقل');
        modal(`<h3>حفظ مجموعة</h3><form id="gsF" class="grid" novalidate><div class="field"><label for="gs-n">اسم المجموعة</label><input class="inp" id="gs-n" maxlength="${GROUP_NAME_MAX}" autocomplete="off"></div>
          <p class="hint" style="margin:0">${fmtNum(picked.size)} متدربًا. تجدها في تبويب «المجموعات» وعند اختيار المستهدفين لواجب.</p><div class="errtxt" id="gsE" role="alert"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="gsC">إلغاء</button><button class="btn pri" id="gsS">${ic('check')} حفظ</button></div></form>`);
        $('#gsC').onclick = closeModal; $('#gsF').onsubmit = async e => { e.preventDefault(); const b = $('#gsS'); setBusy(b, true, 'جارٍ الحفظ');
          try { await Store.saveGroup({ name:$('#gs-n').value, trainee_ids:[...picked] }); closeModal(); toast('حُفظت المجموعة'); go('groups'); reload(); } catch(x){ setBusy(b, false); $('#gsE').textContent = x.message; } }; };
      wire(); sel(); } };
}

/* ---------- طباعة كشف الحضور والغياب اليومي للمدرب (A4): الغائبون ومن لم يسجل أولًا ---------- */
export function daySheetDoc(dash, n){
  const ORD = { 'غائب':0, 'لم يسجل بعد':1, 'متأخر':2, 'حاضر':3 }, rows = dash.rows.slice().sort((a, b) => (ORD[a.today] ?? 4) - (ORD[b.today] ?? 4) || a.name.localeCompare(b.name, 'ar'));
  const c = k => rows.filter(r => r.today === k).length;
  return docShell({ docNo:`DAY-${n.date.replace(/-/g, '')}`, title:'كشف الحضور والغياب اليومي', sub:`${fmtGreg(n.date)} · ${fmtHijri(n.date)}`,
    info:[['المدرب', dash.teacher.name, 'wide'], ['القسم', dash.teacher.section], ['المقررات', dash.teacher.subjects.join('، ')], ['وقت الجلسة', dash.session ? `${t12(dash.session.start)} – ${t12(dash.session.end)}` : 'لا جلسة اليوم']],
    stats:[['المتدربون', fmtNum(rows.length)], ['حاضر', fmtNum(c('حاضر')), 'ok'], ['متأخر', fmtNum(c('متأخر')), 'warn'], ['غائب', fmtNum(c('غائب')), 'bad'], ['لم يسجل بعد', fmtNum(c('لم يسجل بعد'))]],
    body:`<table class="ptab"><thead><tr><th>م</th><th>المتدرب</th><th>الباقة</th><th>حالة اليوم</th><th>وقت التسجيل</th><th>نسبة الحضور</th><th>غياب متتالٍ</th><th>ملاحظات</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td>${fmtNum(i + 1)}</td><td>${esc(r.name)}</td><td>${esc(r.plan)}</td><td><b>${esc(r.today)}</b></td><td>${r.time ? t12(r.time) : '—'}</td><td>${r.rate == null ? '—' : fmtNum(r.rate) + '٪'}</td><td>${r.consec ? fmtNum(r.consec) : '—'}</td><td></td></tr>`).join('') || '<tr><td colspan="8">لا متدربين في نطاق المدرب</td></tr>'}</tbody></table>`,
    note:'الحالة من سجل مسح الحضور وقت الطباعة؛ «لم يسجل بعد» تصبح «غائب» بعد انتهاء الجلسة.' });
}
export const printDaySheet = (dash, n) => printDocs([daySheetDoc(dash, n)], 'كشف الحضور والغياب اليومي');
