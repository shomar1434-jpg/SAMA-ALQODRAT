/* إبلاغ أولياء الأمور بالغياب عبر واتساب الأعمال (الخطوة AE)
   لا إرسال آلي: الزر يفتح واتساب على جهاز المسؤول (التطبيق أو web.whatsapp.com برقم المركز) والرسالة مكتوبة،
   والمسؤول يضغط «إرسال». ما أُرسل يُعلَّم على هذا الجهاز لليوم فلا يتكرر. */
import { CENTER } from './catalog.js';
import { enrollsOf } from './data2.js';
import { SECTIONS, sessionOn, subStatus } from './qudurat.js';
import { $, $$, esc, fmtDate, fmtNum, riyadhNow, t12, toMin } from './utils.js';
import { ic, toast } from './views2_head.js';
import { modal, closeModal } from './views2_programs.js';

/* 05XXXXXXXX ← 9665XXXXXXXX (صيغة روابط واتساب الدولية) */
export const intlPhone = ph => { const d = String(ph || '').replace(/\D/g, ''); return /^05\d{8}$/.test(d) ? '966' + d.slice(1) : /^9665\d{8}$/.test(d) ? d : ''; };
export const waTo = (ph, text) => { const n = intlPhone(ph); return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : ''; };

/* نص رسالة الغياب: لولي الأمر بصيغة الابن أو الابنة، أو للمتدرب نفسه إن لم يُسجَّل جوال ولي أمر */
export function absenceText(t, toGuardian, what, date, time){
  const girl = t.gender === 'أنثى', first = String(t.full_name || '').trim();
  const head = toGuardian ? `السلام عليكم ورحمة الله وبركاته\nولي أمر ${girl ? 'المتدربة' : 'المتدرب'}: ${first}\nنفيدكم بغياب ${girl ? 'ابنتكم' : 'ابنكم'} اليوم ${fmtDate(date)} عن ${what}${time ? ` (${time})` : ''}.`
    : `السلام عليكم ورحمة الله وبركاته\n${girl ? 'المتدربة' : 'المتدرب'}: ${first}\nلم يُسجَّل حضورك اليوم ${fmtDate(date)} في ${what}${time ? ` (${time})` : ''}.`;
  return `${head}\nنأمل الحرص على الانتظام، وللاستفسار التواصل معنا عبر واتساب المركز:\n${CENTER.whatsappLink}\n${CENTER.name}`;
}

/* الغائبون في جلسة يوم: باقات قسم (kind='pkg', key=القسم) أو دفعة برنامج (kind='cohort', key=معرّفها) */
export function absentees(D, kind, key, date){
  let rows = [], what = '', time = '';
  if(kind === 'pkg'){
    const ses = sessionOn(D, key, date), att = (D.sub_attendance || []).filter(a => a.att_date === date);
    what = `جلسة القدرات والتحصيلي (قسم ${SECTIONS[key]})`; time = ses ? `${t12(ses.start)} – ${t12(ses.end)}` : '';
    rows = (D.subscriptions || []).filter(s => s.section === key && subStatus(s, date) === 'active' && (s.created_at || '').slice(0, 10) <= date && !att.some(a => a.subscription_id === s.id))
      .map(s => ({ id:s.id, t:D.trainees.find(x => x.id === s.trainee_id), note:subStatus(s, date) === 'pending' ? 'لم يبدأ اشتراكه بعد' : '' }));
  } else {
    const c = D.cohorts.find(x => x.id === key), p = c && D.programs.find(x => x.id === c.program_id);
    what = `برنامج «${p?.name || ''}»`; time = c ? `${t12(String(c.start_time).slice(0, 5))} – ${t12(String(c.end_time).slice(0, 5))}` : '';
    rows = c ? enrollsOf(D, c.id).filter(e => e.created_at.slice(0, 10) <= date && !D.attendance.some(a => a.enrollment_id === e.id && a.att_date === date))
      .map(e => ({ id:e.id, t:D.trainees.find(x => x.id === e.trainee_id), note:'' })) : [];
  }
  return { what, time, rows: rows.filter(r => r.t && !r.t.is_test).map(r => { const g = intlPhone(r.t.guardian_phone);
    return { ...r, to:g ? 'guardian' : 'trainee', phone:g ? r.t.guardian_phone : r.t.phone, link:waTo(g ? r.t.guardian_phone : r.t.phone, absenceText(r.t, !!g, what, date, time)) }; })
    .sort((a, b) => a.t.full_name.localeCompare(b.t.full_name, 'ar')) };
}

const sentKey = date => 'sama_wa_abs_' + date;
const sentSet = date => { try { return new Set(JSON.parse(localStorage.getItem(sentKey(date)) || '[]')); } catch(e){ return new Set(); } };
const markSent = (date, id) => { try { const s = sentSet(date); s.add(id); localStorage.setItem(sentKey(date), JSON.stringify([...s])); } catch(e){} };

/* نافذة الغائبين: زر واتساب لكل متدرب، و«التالي» يفتح أول من لم يُرسل له */
export function absenceModal(D, kind, key, date = riyadhNow().date, ended = true){
  const draw = () => {
    const A = absentees(D, kind, key, date), sent = sentSet(date), left = A.rows.filter(r => r.link && !sent.has(r.id));
    modal(`<h3>${ic('alert')} الغائبون اليوم وإبلاغ أولياء الأمور</h3>
      <p class="hint" style="margin:-4px 0 10px">${esc(A.what)}${A.time ? ` · ${A.time}` : ''} · ${fmtDate(date)}</p>
      ${ended ? '' : `<div class="alert t-gold" style="margin-bottom:10px"><span class="aic">${ic('alert')}</span><span>الجلسة لم تنتهِ بعد؛ القائمة لمن لم يسجّل حتى الآن. يُفضَّل الإبلاغ بعد نهايتها.</span></div>`}
      <p class="hint" style="margin:0 0 10px">يفتح كل زر واتساب على جهازك والرسالة مكتوبة، فتضغط «إرسال». افتح واتساب الأعمال برقم المركز على هذا الجهاز (التطبيق أو web.whatsapp.com) لتصل الرسالة من رقم المركز.</p>
      ${A.rows.length ? `<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px"><span class="pill dot bad">${fmtNum(A.rows.length)} غائب</span><span class="pill dot ok">${fmtNum(A.rows.length - left.length - A.rows.filter(r => !r.link).length)} أُبلغ</span>
          ${left.length ? `<button class="btn pri sm" id="abNext">${ic('next')} إرسال للتالي (${fmtNum(left.length)} متبقٍ)</button>` : ''}</div>
        <div class="tblwrap" style="max-height:52vh;overflow:auto"><table class="tb"><thead><tr><th>المتدرب</th><th>المستلم</th><th></th></tr></thead><tbody>
          ${A.rows.map(r => `<tr><td>${esc(r.t.full_name)}${r.note ? `<div class="hint">${r.note}</div>` : ''}</td>
            <td>${r.link ? `${r.to === 'guardian' ? 'ولي الأمر' : '<span class="pill warn">المتدرب نفسه</span>'} <span class="num hint" dir="ltr">${esc(r.phone)}</span>` : '<span class="hint">لا يوجد جوال صحيح</span>'}</td>
            <td style="white-space:nowrap">${r.link ? `<button class="btn sm ${sent.has(r.id) ? '' : 'pri'}" data-wa="${r.id}">${sent.has(r.id) ? `${ic('check')} أُرسل · إعادة` : `${ic('send')} واتساب`}</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div>
        ${A.rows.some(r => r.to === 'trainee') ? '<p class="hint" style="margin-top:8px">من لا يوجد له جوال ولي أمر تُرسل الرسالة إلى جواله هو. يمكن إضافة جوال ولي الأمر من «مراجعة البيانات».</p>' : ''}`
        : `<div class="alert t-ok"><span class="aic">${ic('check')}</span><span>لا غائبين في هذه الجلسة.</span></div>`}
      <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn" id="abX">إغلاق</button></div>`);
    const open = r => { window.open(r.link, '_blank', 'noopener'); markSent(date, r.id); toast('فُتح واتساب؛ اضغط «إرسال» هناك'); draw(); };
    $$('[data-wa]').forEach(b => b.onclick = () => open(A.rows.find(r => r.id === b.dataset.wa)));
    if($('#abNext')) $('#abNext').onclick = () => open(left[0]);
    $('#abX').onclick = closeModal;
  };
  draw();
}
/* هل بدأت الجلسة وهل انتهت (لإظهار الزر ونص التنبيه) */
export function sessionPhase(start, end, now = riyadhNow()){ const m = toMin(now.hm); return { started: m >= toMin(start), ended: m >= toMin(end) }; }
