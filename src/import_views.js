/* =====================================================================
   الإدارة: «مراجعة البيانات» (#admin-data) — يقرأ قاعدة المتدربين ويستخرج ما ينقص أو يحتاج مراجعة ليكمله المسؤول،
   ومعه استيراد المسجّلين سابقًا من كشف Excel (لصق أو ملف CSV) بمعاينة قبل الاعتماد.
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort, riyadhNow, matchQ } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { titleBar } from './views2_main.js';
import { modal, closeModal } from './views2_programs.js';
import { AD, reloadAD } from './views2_admin.js';
import { setBusy, toLatin } from './features.js';
import { exportCSV } from './print.js';
import { TIERS } from './qudurat.js';
import { parseLegacy, legacySummary, dataIssues } from './import_logic.js';

let dTab = 'issues', dQ = '', dOnly = 'all', preview = null;
const CITIES = ['جازان', 'صبيا', 'أبو عريش', 'صامطة', 'بيش', 'أحد المسارحة', 'الدرب', 'ضمد', 'العارضة', 'فرسان', 'أخرى'], EDU = ['ابتدائي', 'متوسط', 'ثانوي', 'دبلوم', 'جامعي', 'دراسات عليا'];

export function pageData(){
  const all = dataIssues(AD), n = all.reduce((a, x) => a + x.issues.length, 0);
  $('#main').innerHTML = titleBar(`${ic('search')}مراجعة البيانات`, 'مراجعة البيانات <em>واستكمالها</em>', 'يقرأ النظام قاعدة المتدربين ويستخرج كل ما ينقص أو يحتاج نظرًا: بيانات ناقصة، ملاحظات من الكشوف السابقة، ورسوم تحتاج تصحيحًا. افتح المتدرب وأكمل ثم احفظ.') +
    `<div class="tabs" style="margin-bottom:14px"><button class="tab" data-dt="issues" aria-selected="${dTab === 'issues'}">${ic('alert')}ما يحتاج مراجعة <span class="badge-n">${fmtNum(all.length)}</span></button><button class="tab" data-dt="import" aria-selected="${dTab === 'import'}">${ic('plus')}استيراد مسجّلين سابقين</button></div><div id="dBody"></div>`;
  $$('[data-dt]').forEach(b => b.onclick = () => { dTab = b.dataset.dt; pageData(); });
  dTab === 'issues' ? issuesTab(all, n) : importTab();
}
function issuesTab(all, n){
  const kinds = [['all', 'كل الملاحظات'], ['birth_date', 'تاريخ الميلاد'], ['guardian_phone', 'جوال ولي الأمر'], ['email', 'البريد'], ['full_name', 'الاسم'], ['national_id', 'رقم الهوية'], ['order', 'الرسوم والدفعات'], ['note', 'ملاحظات الكشف السابق']];
  const hit = i => dOnly === 'all' || (dOnly === 'note' ? i.note != null : dOnly === 'order' ? String(i.field || '').startsWith('order:') : i.field === dOnly);
  const list = all.filter(x => matchQ(dQ, x.trainee.full_name, x.trainee.national_id, x.trainee.phone, x.trainee.guardian_phone) && x.issues.some(hit));
  $('#dBody').innerHTML = `<div class="filters"><label class="sr-only" for="dq">بحث</label><input class="inp" id="dq" type="search" placeholder="الاسم أو الهوية أو الجوال" value="${esc(dQ)}" style="flex:1;min-width:200px">
      <label class="sr-only" for="dk">نوع الملاحظة</label><select class="inp" id="dk">${kinds.map(([k, v]) => `<option value="${k}" ${dOnly === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <button class="btn sm" id="dX" ${list.length ? '' : 'disabled'}>${ic('copy')} تصدير CSV</button></div>
    <p class="hint" style="margin:0 0 10px">${fmtNum(all.length)} متدربًا عليهم ${fmtNum(n)} ملاحظة${list.length !== all.length ? ` · المعروض ${fmtNum(list.length)}` : ''}.</p>
    ${list.length ? `<div class="card rv"><div class="tblwrap"><table class="tb"><thead><tr><th>المتدرب</th><th>الملاحظات</th><th></th></tr></thead><tbody>${list.slice(0, 300).map(x => `<tr><td style="min-width:170px"><b style="font-weight:600">${esc(x.trainee.full_name)}</b><div class="hint num" dir="ltr">${esc(x.trainee.national_id)} · ${esc(x.trainee.phone || '')}</div>${x.trainee.imported ? '<span class="pill info">مسجّل سابقًا</span>' : ''}</td>
        <td><ul class="iss">${x.issues.filter(hit).map(i => `<li class="${i.note != null ? 'n' : ''}">${esc(i.text)}</li>`).join('')}</ul></td><td><button class="btn sm pri" data-de="${x.trainee.id}">${ic('edit')} استكمال</button></td></tr>`).join('')}</tbody></table></div></div>`
      : emptyBox(all.length ? 'لا نتائج بهذه التصفية' : 'البيانات مكتملة', all.length ? '' : 'لا ملاحظات على بيانات المتدربين.')}`;
  $('#dq').oninput = e => { dQ = e.target.value; clearTimeout(pageData.t); pageData.t = setTimeout(() => { pageData(); const i = $('#dq'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }, 300); };
  $('#dk').onchange = e => { dOnly = e.target.value; pageData(); };
  $('#dX').onclick = () => exportCSV('مراجعة-البيانات', [['الاسم', 'رقم الهوية', 'الجوال', 'الملاحظة'], ...list.flatMap(x => x.issues.filter(hit).map(i => [x.trainee.full_name, x.trainee.national_id, x.trainee.phone, i.text]))]);
  $$('[data-de]').forEach(b => b.onclick = () => fixModal(all.find(x => x.trainee.id === b.dataset.de)));
}
function fixModal(x){
  const t = x.trainee, miss = f => x.issues.some(i => i.field === f) ? ' class="field need"' : ' class="field"', orders = (AD.orders || []).filter(o => o.trainee_id === t.id && o.approval !== 'rejected');
  const sel = (id, name, list, v) => `<select class="inp" id="${id}" name="${name}"><option value="">—</option>${list.map(o => `<option ${o === v ? 'selected' : ''}>${o}</option>`).join('')}</select>`;
  modal(`<h3>استكمال بيانات ${esc(t.full_name)}</h3>
    <form id="fxF" novalidate><div class="grid g2">
      <div${miss('full_name')} style="grid-column:1/-1"><label for="fx-n">الاسم الكامل</label><input class="inp" id="fx-n" name="full_name" value="${esc(t.full_name)}"></div>
      <div${miss('national_id')}><label for="fx-i">رقم الهوية</label><input class="inp num" id="fx-i" name="national_id" dir="ltr" inputmode="numeric" maxlength="10" value="${esc(t.national_id)}"></div>
      <div${miss('birth_date')}><label for="fx-b">تاريخ الميلاد</label><input class="inp" id="fx-b" name="birth_date" type="date" max="${riyadhNow().date}" value="${esc(t.birth_date || '')}"></div>
      <div${miss('phone')}><label for="fx-p">الجوال (مفتاح دخول البوابة)</label><input class="inp num" id="fx-p" name="phone" dir="ltr" inputmode="numeric" maxlength="10" value="${esc(t.phone || '')}"></div>
      <div${miss('guardian_phone')}><label for="fx-g">جوال ولي الأمر</label><input class="inp num" id="fx-g" name="guardian_phone" dir="ltr" inputmode="numeric" maxlength="10" value="${esc(t.guardian_phone || '')}"></div>
      <div${miss('email')} style="grid-column:1/-1"><label for="fx-e">البريد الإلكتروني</label><input class="inp" id="fx-e" name="email" type="email" dir="ltr" value="${esc(t.email || '')}"></div>
      <div${miss('city')}><label for="fx-c">المدينة</label>${sel('fx-c', 'city', CITIES.includes(t.city) || !t.city ? CITIES : [t.city, ...CITIES], t.city)}</div>
      <div class="field"><label for="fx-d">المؤهل</label>${sel('fx-d', 'education', EDU.includes(t.education) || !t.education ? EDU : [t.education, ...EDU], t.education)}</div></div>
      ${orders.map(o => `<fieldset class="fx-o" data-fo="${o.id}"><legend>رسوم الطلب <span dir="ltr">${o.number}</span> — ${esc(o.title)}</legend><div class="grid g2"><div class="field"><label>إجمالي الرسوم (ريال) · المدفوع ${fmtNum(o.paid_amount || 0)}</label><input class="inp num" name="total" inputmode="decimal" value="${o.total}"></div><div class="field"><label>سبب الخصم أو الفرق</label><input class="inp" name="discount_note" maxlength="200" value="${esc(o.discount_note || '')}"></div></div></fieldset>`).join('')}
      ${(t.import_notes || []).length ? `<h4 class="ord-sec">ملاحظات الكشف السابق</h4>${t.import_notes.map((n, i) => `<label class="chk fx-note"><input type="checkbox" data-fn="${i}" ${n.done ? 'checked' : ''}> <span>${esc(n.text)}</span></label>`).join('')}<p class="hint" style="margin:4px 0 0">ضع علامة على ما عولج ليختفي من قائمة المراجعة.</p>` : ''}
      <div class="errtxt" id="fxE" role="alert"></div>
      <div style="display:flex;gap:8px;justify-content:end;margin-top:12px"><button type="button" class="btn" id="fxX">إغلاق</button><button class="btn pri" id="fxS">${ic('check')} حفظ</button></div></form>`);
  ['#fx-i', '#fx-p', '#fx-g'].forEach(s => $(s).addEventListener('input', e => { e.target.value = toLatin(e.target.value).replace(/\D/g, ''); }));
  $('#fxX').onclick = closeModal;
  $('#fxF').onsubmit = async e => { e.preventDefault(); const f = e.target, b = $('#fxS'); $('#fxE').textContent = ''; setBusy(b, true, 'جارٍ الحفظ');
    try {
      const p = {}; for(const k of ['full_name', 'national_id', 'birth_date', 'phone', 'guardian_phone', 'email', 'city', 'education']){ const v = f[k].value.trim(); if(v !== String(t[k] || '')) p[k] = v; }
      if(Object.keys(p).length) await Store.saveTrainee(t.id, p);
      for(const fs of $$('[data-fo]', f)){ const o = AD.orders.find(y => y.id === fs.dataset.fo), total = +toLatin(fs.querySelector('[name=total]').value), dn = fs.querySelector('[name=discount_note]').value.trim();
        if(total !== +o.total || dn !== (o.discount_note || '')) await Store.saveOrderMeta(o.id, { total, discount_note:dn }); }
      for(const c of $$('[data-fn]', f)){ const i = +c.dataset.fn; if(!!t.import_notes[i].done !== c.checked) await Store.resolveImportNote(t.id, i, c.checked); }
      await reloadAD(); closeModal(); toast('حُفظت البيانات'); pageData();
    } catch(x2){ setBusy(b, false); $('#fxE').textContent = x2.message; } };
}
function importTab(){
  const s = preview && legacySummary(preview);
  $('#dBody').innerHTML = `<div class="card pad rv"><h3 class="ctitle">${ic('plus')}استيراد المسجّلين قبل تشغيل المنصة</h3>
      <p class="hint" style="margin:-4px 0 10px">الصق الجدول من Excel مع صف العناوين، أو اختر ملف CSV. الأعمدة: اسم المتدرب، البريد، رقم الهوية، رقم الجوال، جوال ولي الأمر، الباقة، تاريخ التسجيل، رسوم الباقة، رسوم التسجيل وطريقة سدادها، ثم الدفعات وطرق سدادها. التاريخ بصيغة 2026-08-10 أو 10/08/2026.</p>
      <div class="grid g2"><div class="field"><label for="im-g">الجنس (إن لم يكن في الجدول عمود «الجنس»)</label><select class="inp" id="im-g"><option>ذكر</option><option>أنثى</option></select></div><div class="field"><label for="im-file">ملف CSV</label><input class="inp" type="file" id="im-file" accept=".csv,.tsv,.txt,text/csv"></div></div>
      <div class="field"><label for="im-t">أو الصق الجدول هنا</label><textarea class="inp" id="im-t" rows="5" dir="rtl" placeholder="م	اسم المتدرب	البريد	رقم الهوية	…"></textarea></div>
      <div class="errtxt" id="imE2" role="alert"></div><div style="text-align:end"><button class="btn pri sm" id="imGo">${ic('search')} معاينة قبل الاستيراد</button></div></div>
    ${preview ? `<div class="card pad rv" style="margin-top:14px"><h3 class="ctitle">${ic('form')}المعاينة</h3>
      <div class="ord-amt" style="margin:0 0 10px"><span>الصفوف <b>${fmtNum(s.count)}</b></span><span>جاهزة <b>${fmtNum(s.ok)}</b></span><span>عليها ملاحظات <b>${fmtNum(s.noted)}</b></span><span>مرفوضة <b>${fmtNum(s.bad)}</b></span><span>إجمالي الرسوم <b>${fmtNum(s.total)}</b></span><span>المدفوع سابقًا <b>${fmtNum(s.paid)}</b></span><span>المتبقي <b>${fmtNum(s.total - s.paid)}</b></span></div>
      <div class="tblwrap" style="max-height:420px;overflow:auto"><table class="tb"><thead><tr><th>#</th><th>المتدرب</th><th>الباقة</th><th>البداية ← النهاية</th><th>الرسوم</th><th>المدفوع</th><th>المتبقي</th><th>ملاحظات</th></tr></thead><tbody>${preview.map((r, i) => `<tr class="${r.errors.length ? 'row-bad' : ''}"><td class="num">${fmtNum(i + 1)}</td><td>${esc(r.full_name)}<div class="hint num" dir="ltr">${esc(r.national_id)} · ${esc(r.phone)}</div></td><td>${TIERS[r.tier] || '—'}<div class="hint">${r.gender === 'أنثى' ? 'بنات' : 'بنون'}</div></td>
        <td>${r.start_date ? fmtShort(r.start_date) : '—'} ← ${r.end_date ? fmtShort(r.end_date) : '—'}</td><td class="num">${fmtNum(r.total)}</td><td class="num">${fmtNum(r.paid)}</td><td class="num">${fmtNum(r.remaining)}</td>
        <td><ul class="iss">${r.errors.map(e => `<li class="e">${esc(e)}</li>`).join('')}${r.notes.map(e => `<li>${esc(e)}</li>`).join('')}</ul></td></tr>`).join('')}</tbody></table></div>
      <p class="hint" style="margin:10px 0">يُنشأ لكل صف جاهز: ملف المتدرب، اشتراكه بتاريخ تسجيله الفعلي، وطلب شراء «موافق عليه» بدفعاته السابقة رصيدًا مرحَّلًا دون فواتير. متابعة الحضور تبدأ من اليوم فلا تُحسب الجلسات السابقة غيابًا. الصفوف المرفوضة لا تُستورد، والملاحظات تنتقل إلى «ما يحتاج مراجعة».</p>
      <div style="display:flex;gap:8px;justify-content:end"><button class="btn" id="imNo">إلغاء</button><button class="btn pri" id="imOk" ${s.ok ? '' : 'disabled'}>${ic('check')} اعتماد استيراد ${fmtNum(s.ok)} متدربًا</button></div></div>` : ''}`;
  const run = text => { $('#imE2').textContent = ''; try { preview = parseLegacy(text, $('#im-g').value, AD.plans, riyadhNow().date); if(!preview.length) throw new Error('لا صفوف في الجدول'); pageData(); } catch(x){ preview = null; pageData(); $('#imE2').textContent = x.message; } };   // لا تبقى معاينة قديمة على الشاشة بعد فشل القراءة
  $('#imGo').onclick = () => { if(!$('#im-t').value.trim()){ $('#imE2').textContent = preview ? 'المعاينة معروضة أدناه. لاستبدالها اختر ملفًا آخر أو الصق جدولًا.' : 'اختر ملف CSV أو الصق الجدول أولًا'; return; } run($('#im-t').value); };
  $('#im-file').onchange = async e => { const f = e.target.files[0]; if(f) run(await f.text()); };
  if(preview){ $('#imNo').onclick = () => { preview = null; pageData(); };
    $('#imOk').onclick = async e => { const b = e.currentTarget; if(!preview?.length) return toast('لا بيانات للاستيراد؛ اختر الملف من جديد'); setBusy(b, true, 'جارٍ الاستيراد');
      try { const r = await Store.importLegacy(preview); await reloadAD(); preview = null; dTab = 'issues'; toast(`استُورد ${fmtNum(r.added)} متدربًا${r.skipped.length ? `، وتُرك ${fmtNum(r.skipped.length)}` : ''}`); pageData();
        if(r.skipped.length) (modal(`<h3>صفوف لم تُستورد (${fmtNum(r.skipped.length)})</h3><ul class="iss">${r.skipped.map(k => `<li>${esc(k.name)} — ${esc(k.why)}</li>`).join('')}</ul><div style="text-align:end;margin-top:12px"><button class="btn" id="skX">إغلاق</button></div>`), $('#skX').onclick = closeModal); }
      catch(x){ setBusy(b, false); toast(x.message); } }; }
}
