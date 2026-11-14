/* =====================================================================
   لوحة الإدارة: المستخدمون والأدوار — المدربون وأولياء الأمور وروابطهم الموثّقة.
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { titleBar } from './views2_main.js';
import { modal, closeModal, confirmBox } from './views2_programs.js';
import { AD, reloadAD } from './views2_admin.js';
import { setBusy, toLatin } from './features.js';
import { SECTIONS } from './qudurat.js';
import { portalBase } from './config.js';
import { openBank } from './admin_bank.js';

const SUBJECTS = ['كمي', 'لفظي', 'تحصيلي'];
let uTab = 'teachers';
export function pageUsers(){
  const m = $('#main'), D = AD;
  const teachers = (D.teachers || []).slice().sort((a, b) => (b.active !== false) - (a.active !== false) || a.full_name.localeCompare(b.full_name, 'ar'));
  const links = (D.guardian_links || []).filter(l => l.status === 'verified');
  m.innerHTML = titleBar(`${ic('users')}المستخدمون والأدوار`, 'المدربون <em>وأولياء الأمور</em>',
      'كل بوابة لها دور: المدرب يرى متدربي قسمه ومقرراته فقط، وولي الأمر يرى أبناءه المرتبطين بعلاقة موثّقة فقط. الدخول برقم الجوال ورمز تحقق.',
      `<a class="btn sm" href="${portalBase('teacher')}" target="_blank" rel="noopener">${ic('book')} بوابة المدرب</a><a class="btn sm" href="${portalBase('student')}" target="_blank" rel="noopener">${ic('user')} بوابة المتدرب</a><a class="btn sm" href="${portalBase('guardian')}" target="_blank" rel="noopener">${ic('users')} بوابة ولي الأمر</a>`) +
    `<div class="tabs" role="tablist" style="margin:16px 0">${[['teachers', 'book', `المدربون (${fmtNum(teachers.filter(t => t.active !== false).length)})`], ['guardians', 'users', `أولياء الأمور (${fmtNum(links.length)})`]].map(([k, i, l]) => `<button class="tab" role="tab" data-ut="${k}" aria-selected="${uTab === k}">${ic(i)}${l}</button>`).join('')}</div><div id="uBody"></div>`;
  $$('[data-ut]').forEach(b => b.onclick = () => { uTab = b.dataset.ut; pageUsers(); });
  const body = $('#uBody');
  if(uTab === 'teachers'){
    body.innerHTML = `<div class="card pad rv"><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:10px"><h3 class="ctitle">${ic('book')}المدربون</h3><button class="btn pri sm" id="tAdd">${ic('plus')} مدرب</button></div>
      ${teachers.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>المدرب</th><th>الجوال</th><th>القسم</th><th>المقررات</th><th>المتدربون</th><th>بنك الأسئلة</th><th>الحالة</th><th></th></tr></thead><tbody>
        ${teachers.map(t => { const n = (D.subscriptions || []).filter(s => s.section === t.section && ['pending', 'active'].includes(s.status) && (s.subjects || []).some(x => (t.subjects || []).includes(x))).length;
          return `<tr class="${t.active === false ? 'muted' : ''}"><td><b style="font-weight:500">${esc(t.full_name)}</b></td><td dir="ltr" style="text-align:right">${esc(t.phone)}</td><td>${SECTIONS[t.section]}</td><td>${esc((t.subjects || []).join('، ')) || '<span class="hint">برامج تدريبية</span>'}${(() => { const k = (D.cohorts || []).filter(c => c.teacher_id === t.id && !c.archived_at).length; return k ? ` <span class="pill info">${fmtNum(k)} دفعة</span>` : ''; })()}</td><td class="num">${fmtNum(n)}</td>
          <td><button class="btn sm" data-tb="${t.id}">${ic('database')} ${fmtNum((D.questions || []).filter(q => q.teacher_id === t.id && q.status === 'published').length)}</button>${(t.subjects || []).length ? `<div class="hint">مشترك: ${fmtNum((D.questions || []).filter(q => q.shared && (t.subjects || []).includes(q.subject) && q.status === 'published').length)}</div>` : ''}</td>
          <td><span class="pill dot ${t.active === false ? 'g' : 'ok'}">${t.active === false ? 'موقوف' : 'نشط'}</span></td><td><button class="btn sm" data-te="${t.id}" aria-label="تعديل ${esc(t.full_name)}">${ic('edit')}</button></td></tr>`; }).join('')}
      </tbody></table></div>` : emptyBox('لا يوجد مدربون', 'أضف مدربي المقررات ليصلوا إلى كشوف متدربيهم.')}</div>`;
    $('#tAdd').onclick = () => teacherModal();
    $$('[data-te]').forEach(b => b.onclick = () => teacherModal(teachers.find(t => t.id === b.dataset.te)));
    $$('[data-tb]').forEach(b => b.onclick = () => { openBank(b.dataset.tb); location.hash = '#admin-bank'; });
  } else {
    body.innerHTML = `<div class="card pad rv"><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:10px"><h3 class="ctitle">${ic('users')}روابط أولياء الأمور الموثّقة</h3><button class="btn pri sm" id="gAdd">${ic('plus')} ربط ولي أمر</button></div>
      <p class="hint" style="margin:-4px 0 10px">لا يُمنح ولي الأمر وصولًا بمجرد معرفة رقم هوية المتدرب. يرتبط ذاتيًا إذا اجتمعت ثلاثة: المتدرب صرّح بجواله عند التسجيل، وأثبت ملكية الجوال برمز التحقق، وكتب السجل المدني الصحيح. أو يربطه المعهد يدويًا. الرابط الملغى لا يُعاد ذاتيًا.${(() => { const w = (D.trainees || []).filter(t => t.guardian_phone && !(D.guardian_links || []).some(l => l.trainee_id === t.id && l.guardian_phone === t.guardian_phone)).length; return w ? ` <b>${fmtNum(w)}</b> متدربًا صرّحوا بجوال ولي أمر لم يُربط بعد.` : ''; })()}</p>
      ${links.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>ولي الأمر</th><th>الجوال</th><th>المتدرب</th><th>الصلة</th><th>منذ</th><th></th></tr></thead><tbody>
        ${links.map(l => { const t = D.trainees.find(x => x.id === l.trainee_id); return `<tr><td>${esc(l.guardian_name || '—')}</td><td dir="ltr" style="text-align:right">${esc(l.guardian_phone)}</td><td>${esc(t?.full_name || '—')}</td><td>${esc(l.relation || '')} ${l.source === 'self' ? '<span class="pill info" title="ربطه ولي الأمر بنفسه بجواله المصرَّح به وبالسجل المدني">ربط ذاتي</span>' : ''}</td><td>${fmtShort(l.created_at.slice(0, 10))}</td>
          <td><button class="btn sm danger soft" data-gr="${l.id}">إلغاء الرابط</button></td></tr>`; }).join('')}
      </tbody></table></div>` : emptyBox('لا توجد روابط', 'اربط ولي الأمر برقم جواله والسجل المدني للمتدرب.')}</div>`;
    $('#gAdd').onclick = guardianModal;
    $$('[data-gr]').forEach(b => b.onclick = () => confirmBox('إلغاء رابط ولي الأمر', 'يفقد ولي الأمر الوصول إلى بيانات هذا المتدرب فورًا. يبقى سجل الرابط محفوظًا.', async () => { await Store.revokeGuardianLink(b.dataset.gr); await reloadAD(); toast('أُلغي الرابط'); pageUsers(); }, 'إلغاء الرابط'));
  }
}

function teacherModal(t){
  modal(`<h3>${t ? 'تعديل المدرب' : 'مدرب جديد'}</h3><form id="tf" class="grid g2" novalidate>
    <div class="field" style="grid-column:1/-1"><label for="tf-name">الاسم <i>*</i></label><input class="inp" id="tf-name" name="full_name" value="${esc(t?.full_name || '')}" maxlength="80"></div>
    <div class="field"><label for="tf-nid">رقم الهوية (للدخول)</label><input class="inp num" id="tf-nid" name="national_id" inputmode="numeric" maxlength="10" dir="ltr" value="${esc(t?.national_id || '')}"></div>
    <div class="field"><label for="tf-phone">الجوال <i>*</i></label><input class="inp num" id="tf-phone" name="phone" inputmode="numeric" maxlength="10" dir="ltr" value="${esc(t?.phone || '')}" placeholder="05XXXXXXXX"></div>
    <fieldset class="field" style="grid-column:1/-1;border:0;padding:0;margin:0"><legend style="font-weight:500;font-size:13.5px;margin-bottom:6px">نوع المدرب</legend><div style="display:flex;gap:14px;flex-wrap:wrap">
      <label class="chk"><input type="radio" name="kind" value="qudurat" ${!t || (t.subjects || []).length ? 'checked' : ''}> مدرب باقات القدرات والتحصيلي</label>
      <label class="chk"><input type="radio" name="kind" value="programs" ${t && !(t.subjects || []).length ? 'checked' : ''}> مدرب برامج تدريبية</label></div></fieldset>
    <div class="field"><label for="tf-sec">القسم</label><select class="inp" id="tf-sec" name="section">${Object.entries(SECTIONS).map(([k, v]) => `<option value="${k}" ${t?.section === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div>
    <fieldset class="field" id="tfSubj" style="grid-column:1/-1;border:0;padding:0;margin:0"><legend style="font-weight:500;font-size:13.5px;margin-bottom:6px">مقررات باقات القدرات والتحصيلي</legend><div style="display:flex;gap:14px;flex-wrap:wrap">
      ${SUBJECTS.map(s => `<label class="chk"><input type="checkbox" name="subjects" value="${s}" ${(t?.subjects || []).includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}</div></fieldset>
    <div class="alert t-teal" id="tfLink" style="grid-column:1/-1;margin:0" aria-live="polite"></div>
    ${t ? `<label class="chk" style="grid-column:1/-1"><input type="checkbox" name="active" ${t.active !== false ? 'checked' : ''}> نشط (يستطيع الدخول)</label>` : ''}
    <div class="errtxt" id="tfE" style="grid-column:1/-1"></div>
    <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="tfC">إلغاء</button><button class="btn pri" id="tfS">${ic('check')} حفظ</button></div></form>`);
  $('#tfC').onclick = closeModal;
  /* ما سيرتبط به المدرب تلقائيًا، قبل الحفظ */
  const linkInfo = () => { const f = $('#tf'), kind = f.querySelector('[name=kind]:checked').value, sec = f.section.value, subs = [...f.querySelectorAll('[name=subjects]:checked')].map(x => x.value);
    $('#tfSubj').hidden = kind !== 'qudurat';
    const cohorts = t ? (AD.cohorts || []).filter(c => c.teacher_id === t.id && !c.archived_at).length : 0;
    if(kind === 'programs'){ $('#tfLink').innerHTML = `<span class="aic">${ic('alert')}</span><div>يرى في بوابته دفعات البرامج المربوطة به فقط${t ? ` (${fmtNum(cohorts)} دفعة الآن)` : ''}. اربطه بدفعته من «الدفعات والكشوف» ← تعديل الدفعة ← المدرب.</div>`; return; }
    const n = (AD.subscriptions || []).filter(s => s.section === sec && ['pending', 'active'].includes(s.status) && (s.subjects || []).some(x => subs.includes(x))).length;
    const shared = (AD.questions || []).filter(q => q.shared && subs.includes(q.subject) && q.status === 'published').length;
    $('#tfLink').innerHTML = `<span class="aic">${ic('check')}</span><div>${subs.length ? `سيرتبط تلقائيًا بـ: <b>متدربي ${SECTIONS[sec]}</b> المشتركين في <b>${esc(subs.join('، '))}</b> في كل الباقات (${fmtNum(n)} متدربًا الآن)، و<b>البنك المشترك</b> لمقرره (${fmtNum(shared)} سؤالًا منشورًا) مع بنك خاص به. أي مدرب آخر بالمقرر نفسه يرى البنك المشترك نفسه، والواجبات والنتائج لكلٍّ مستقلة.` : 'اختر مقررًا واحدًا على الأقل.'}${cohorts ? ` ومربوط أيضًا بـ ${fmtNum(cohorts)} دفعة برامج.` : ''}</div>`; };
  $$('#tf [name=kind], #tf [name=subjects], #tf [name=section]').forEach(x => x.addEventListener('change', linkInfo)); linkInfo();
  $('#tf-phone').addEventListener('input', e => e.target.value = toLatin(e.target.value).replace(/\D/g, ''));
  $('#tf').onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target);
    const o = { id:t?.id, full_name:fd.get('full_name').trim(), phone:fd.get('phone'), national_id:toLatin(fd.get('national_id') || '').replace(/\D/g, ''), section:fd.get('section'), subjects:fd.get('kind') === 'programs' ? [] : fd.getAll('subjects'), active: t ? !!fd.get('active') : true };
    if(fd.get('kind') === 'qudurat' && !o.subjects.length) return $('#tfE').textContent = 'اختر مقررًا واحدًا على الأقل لمدرب الباقات، أو اختر «مدرب برامج تدريبية».';
    if(o.full_name.split(/\s+/).length < 2) return $('#tfE').textContent = 'اكتب الاسم الثنائي على الأقل.';
    const b = $('#tfS'); setBusy(b, true, 'جارٍ الحفظ');
    try { await Store.saveTeacher(o); await reloadAD(); closeModal(); toast('حُفظ المدرب'); pageUsers(); } catch(x){ setBusy(b, false); $('#tfE').textContent = x.message; } };
}

function guardianModal(){
  const D = AD;
  modal(`<h3>ربط ولي أمر بمتدرب</h3><form id="gf" class="grid g2" novalidate>
    <div class="field" style="grid-column:1/-1"><label for="gf-nid">السجل المدني للمتدرب <i>*</i></label><input class="inp num" id="gf-nid" name="national_id" inputmode="numeric" maxlength="10" dir="ltr"><span class="hint" id="gfFound"></span></div>
    <div class="field"><label for="gf-name">اسم ولي الأمر <i>*</i></label><input class="inp" id="gf-name" name="guardian_name" maxlength="80"></div>
    <div class="field"><label for="gf-phone">جوال ولي الأمر (للدخول) <i>*</i></label><input class="inp num" id="gf-phone" name="guardian_phone" inputmode="numeric" maxlength="10" dir="ltr" placeholder="05XXXXXXXX"></div>
    <div class="field"><label for="gf-rel">الصلة</label><select class="inp" id="gf-rel" name="relation"><option>الأب</option><option>الأم</option><option>الأخ</option><option>الأخت</option><option>ولي الأمر</option></select></div>
    <label class="chk" style="grid-column:1/-1"><input type="checkbox" name="verified"> تحققتُ من صلة ولي الأمر بالمتدرب (مستند رسمي أو حضور شخصي)</label>
    <div class="errtxt" id="gfE" style="grid-column:1/-1"></div>
    <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="gfC">إلغاء</button><button class="btn pri" id="gfS">${ic('check')} ربط</button></div></form>`);
  $('#gfC').onclick = closeModal;
  ['#gf-nid', '#gf-phone'].forEach(s => $(s).addEventListener('input', e => { e.target.value = toLatin(e.target.value).replace(/\D/g, ''); }));
  $('#gf-nid').addEventListener('input', e => { const t = e.target.value.length === 10 && D.trainees.find(x => x.national_id === e.target.value); $('#gfFound').textContent = t ? `المتدرب: ${t.full_name}` : e.target.value.length === 10 ? 'لا يوجد متدرب بهذا الرقم' : ''; });
  $('#gf').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target));
    if(!f.verified) return $('#gfE').textContent = 'أكّد التحقق من صلة ولي الأمر قبل الربط.';
    if(f.guardian_name.trim().split(/\s+/).length < 2) return $('#gfE').textContent = 'اكتب اسم ولي الأمر الثنائي على الأقل.';
    const b = $('#gfS'); setBusy(b, true, 'جارٍ الربط');
    try { await Store.saveGuardianLink(f); await reloadAD(); closeModal(); toast('رُبط ولي الأمر'); pageUsers(); } catch(x){ setBusy(b, false); $('#gfE').textContent = x.message; } };
}
