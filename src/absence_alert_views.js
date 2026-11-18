/* نافذة تنبيهات الغياب للمسؤول (الخطوة BM): تنبيه واحد في كل مرة، برسالته الجاهزة، و«إرسال لولي الأمر» أو «إلغاء الرسالة» */
import { absenceAlerts, absAfter } from './absence_alerts.js';
import { Store } from './data2.js';
import { $, esc, fmtNum, riyadhNow } from './utils.js';
import { ic, toast } from './views2_head.js';
import { modal, closeModal } from './views2_programs.js';
import { AD, reloadAD } from './views2_admin.js';
import { setBusy } from './features.js';

export function absenceAlertModal(after){
  let i = 0;
  const draw = () => {
    const A = absenceAlerts(AD, riyadhNow());
    if(!A.length){ closeModal(); toast('لا تنبيهات غياب متبقية'); after?.(); return; }
    if(i >= A.length) i = 0;
    const x = A[i], toG = x.to === 'guardian';
    modal(`<h3>${ic('alert')} تنبيه غياب</h3>
      <p class="hint" style="margin:-4px 0 10px">${fmtNum(i + 1)} من ${fmtNum(A.length)} · زاد الغياب عن ${fmtNum(absAfter(AD))} مرات</p>
      <div class="card pad" style="margin-bottom:10px"><b>${esc(x.t.full_name)}</b>
        <div class="hint">${esc(x.planTxt)} · الغياب <b class="num">${fmtNum(x.absent)}</b>${x.rate != null ? ` · نسبة الحضور <span class="num">${fmtNum(x.rate)}٪</span>` : ''}${x.consec > 1 ? ` · ${fmtNum(x.consec)} متتالية` : ''}</div>
        <div class="hint">المستلم: ${toG ? 'ولي الأمر' : '<span class="pill warn">المتدرب نفسه (لا يوجد جوال ولي أمر)</span>'} <span class="num" dir="ltr">${esc(x.phone || '—')}</span></div></div>
      <label class="hint" for="abaText">الرسالة الجاهزة (يمكنك تعديلها قبل الإرسال)</label>
      <textarea class="inp" id="abaText" rows="8" style="width:100%;margin-top:4px">${esc(x.text)}</textarea>
      <div class="errtxt" id="abaE" role="alert"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;margin-top:12px">
        ${A.length > 1 ? `<button class="btn" id="abaNext">التالي</button>` : ''}
        <button class="btn" id="abaLater">لاحقًا</button>
        <button class="btn" id="abaCancel">${ic('x')} إلغاء الرسالة</button>
        <button class="btn pri" id="abaSend" ${x.link ? '' : 'disabled'}>${ic('send')} ${toG ? 'إرسال لولي الأمر' : 'إرسال للمتدرب'}</button></div>
      ${x.link ? '<p class="hint" style="margin-top:8px">يفتح واتساب على جهازك والرسالة مكتوبة، فتضغط «إرسال» هناك من رقم المركز.</p>' : '<p class="hint" style="margin-top:8px">لا يوجد جوال صحيح؛ أضفه من «مراجعة البيانات» أو ألغِ الرسالة.</p>'}`);
    const act = async (action, b) => { $('#abaE').textContent = ''; setBusy(b, true, 'جارٍ الحفظ');
      try { await Store.absenceAlertAct(x.sub_id, x.level, action); await reloadAD(); draw(); }
      catch(e){ setBusy(b, false); $('#abaE').textContent = e.message; } };
    $('#abaSend').onclick = e => { const text = $('#abaText').value.trim() || x.text, link = x.link && x.link.replace(/\?text=.*$/, '?text=' + encodeURIComponent(text));
      if(link) window.open(link, '_blank', 'noopener'); toast('فُتح واتساب؛ اضغط «إرسال» هناك'); act('sent', e.currentTarget); };
    $('#abaCancel').onclick = e => act('dismissed', e.currentTarget);
    $('#abaLater').onclick = () => { closeModal(); after?.(); };
    if($('#abaNext')) $('#abaNext').onclick = () => { i++; draw(); };
  };
  draw();
}

/* يربط زر الشريط، ويفتح النافذة تلقائيًا مرة واحدة في الجلسة (المتصفح الآلي لا تُفتح له إلا بـ sama_absalert_force) */
export function bindAbsenceAlerts(after){
  const b = $('#absAlertBtn'); if(!b) return;
  b.onclick = () => absenceAlertModal(after);
  let auto = true; try { auto = !sessionStorage.getItem('sama_absalert_shown') && (!navigator.webdriver || localStorage.getItem('sama_absalert_force') === '1'); } catch(_){}
  if(auto && !$('.modal-bg')){ try { sessionStorage.setItem('sama_absalert_shown', '1'); } catch(_){} absenceAlertModal(after); }
}
