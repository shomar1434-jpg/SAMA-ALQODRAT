/* =====================================================================
   واجهات الجانب التعليمي داخل البوابات: الواجبات، وقياس المستوى وبنك الأسئلة،
   والمراسلة، وتقييم المدرب بالنجوم.
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort, riyadhNow, addDays } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { modal, closeModal } from './views2_programs.js';
import { setBusy } from './features.js';
import { SECTIONS } from './qudurat.js';
import { assignmentsFor, SUB_TXT, RATE_ITEMS, canRate, threadFor, period, MIN_ATTEND_TO_RATE } from './learning_logic.js';

const STATE_TXT = { new:'جديد', draft:'قيد الحل', submitted:'مُرسل', needs_revision:'يحتاج تعديلًا', graded:'مصحح', late:'متأخر' };
const STATE_TONE = { new:'info', draft:'o', submitted:'ok', needs_revision:'warn', graded:'ok', late:'bad' };
const secOf = t => Object.keys(SECTIONS).find(k => k === t?.section) || t?.section;

/* ======================= المتدرب ======================= */
export function studentHomework(D, tr, reload){
  const list = assignmentsFor(D, tr.id), counts = {};
  list.forEach(a => counts[a.state] = (counts[a.state] || 0) + 1);
  return { html:`<div class="card pad rv"><div class="hw-counts">${Object.keys(STATE_TXT).map(k => `<span class="pill ${STATE_TONE[k]}">${STATE_TXT[k]}: ${fmtNum(counts[k] || 0)}</span>`).join('')}</div>
    ${list.length ? `<div class="hw-list">${list.map(a => `<article class="hw"><div class="hw-h"><b>${esc(a.title)}</b><span class="pill dot ${STATE_TONE[a.state]}">${STATE_TXT[a.state]}</span></div>
      <div class="hint">${esc(a.subject)} · نُشر ${fmtShort(a.publish_date)} · يُستحق ${fmtShort(a.due_date)}${a.submission?.late ? ' · سُلّم متأخرًا' : ''}</div>
      ${a.body ? `<p>${esc(a.body)}</p>` : ''}
      ${a.submission?.status === 'graded' || a.submission?.status === 'needs_revision' ? `<div class="hw-fb"><b>${a.submission.score != null ? `الدرجة ${fmtNum(a.submission.score)} من ${fmtNum(a.max_score)}` : 'ملاحظات المدرب'}</b>${a.submission.feedback ? `<p>${esc(a.submission.feedback)}</p>` : ''}</div>` : ''}
      ${a.submission?.status !== 'graded' ? `<form class="hw-f" data-hw="${a.id}"><label class="sr-only" for="hw-${a.id}">إجابتك</label><textarea class="inp" id="hw-${a.id}" rows="3" maxlength="6000" placeholder="اكتب إجابتك هنا" style="padding:10px 14px;line-height:1.8">${esc(a.submission?.answer || '')}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn sm" data-draft>حفظ مسودة</button><button class="btn pri sm">${ic('check')} إرسال</button></div></form>` : ''}
    </article>`).join('')}</div>` : emptyBox('لا توجد واجبات منشورة لك بعد')}</div>`,
  bind(){ $$('[data-hw]').forEach(f => { const send = async draft => { const b = draft ? $('[data-draft]', f) : $('button.pri', f); setBusy(b, true, draft ? 'جارٍ الحفظ' : 'جارٍ الإرسال');
      try { await Store.submitAssignment({ trainee_id:tr.id, assignment_id:f.dataset.hw, answer:$('textarea', f).value, draft }); toast(draft ? 'حُفظت المسودة' : 'أُرسلت إجابتك'); reload(); } catch(x){ setBusy(b, false); toast(x.message); } };
    f.onsubmit = e => { e.preventDefault(); send(false); }; $('[data-draft]', f).onclick = () => send(true); }); } };
}

export function studentLevel(D, tr, it, reload){
  const subs = (D.subscriptions || []).filter(s => s.trainee_id === tr.id);
  const units = (D.bank_units || []).filter(u => subs.some(s => s.section === u.section && (s.subjects || []).includes(u.subject)));
  const past = (D.attempts || []).filter(a => a.trainee_id === tr.id && a.submitted_at).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  return { html:`<div class="grid g2" style="align-items:start"><div class="card pad rv"><h3 class="ctitle">${ic('spark')}قياس مستواي</h3>
      ${units.length ? `<form id="lvF" class="grid" novalidate>
        <div class="field"><label for="lv-u">المقرر والوحدة</label><select class="inp" id="lv-u">${units.map((u, i) => `<option value="${i}">${esc(u.subject)} · ${esc(u.unit)} (${fmtNum(u.count)} سؤالًا)</option>`).join('')}</select></div>
        <div class="field"><label for="lv-n">عدد الأسئلة</label><select class="inp" id="lv-n">${[5, 10, 20].map(n => `<option>${n}</option>`).join('')}</select></div>
        <button class="btn pri" id="lvGo">${ic('timer')} ابدأ الاختبار</button>
        <p class="hint" style="margin:0">أسئلة من بنك قسمك ومقررك فقط. لا تظهر الإجابات الصحيحة قبل التسليم.</p></form>` : emptyBox('لا توجد أسئلة منشورة لمقرراتك بعد')}</div>
    <div class="card pad rv"><h3 class="ctitle">${ic('chart')}محاولاتي</h3>${past.length ? `<ul class="ses-list">${past.map(a => `<li><b>${esc(a.subject)}</b><span>${esc(a.unit || '')}</span><span class="pill ${a.score / a.total >= .7 ? 'ok' : 'warn'}">${fmtNum(a.score)} / ${fmtNum(a.total)}</span><span class="hint">${fmtShort(a.submitted_at.slice(0, 10))}</span></li>`).join('')}</ul>` : '<p class="hint">لا توجد محاولات بعد.</p>'}</div></div>`,
  bind(){ if(!$('#lvF')) return; $('#lvF').onsubmit = async e => { e.preventDefault(); const u = units[+$('#lv-u').value], b = $('#lvGo'); setBusy(b, true, 'جارٍ تجهيز الأسئلة');
      try { const at = await Store.startAttempt({ trainee_id:tr.id, section:u.section, subject:u.subject, unit:u.unit, count:+$('#lv-n').value }); runAttempt(at, reload); } catch(x){ setBusy(b, false); toast(x.message); } }; } };
}
function runAttempt(at, reload){
  const ans = {}, end = Date.now() + at.minutes * 60000;
  modal(`<h3>قياس المستوى · ${esc(at.subject)}</h3><div class="hint" style="margin:-4px 0 10px">الوقت المتبقي: <b id="atT" class="num"></b></div>
    <form id="atF">${at.snapshot.map((q, i) => `<fieldset class="q"><legend><b>${fmtNum(i + 1)}.</b> ${esc(q.text)}</legend>
      ${q.options.map((o, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}" data-q="${q.id}"> ${esc(o)}</label>`).join('')}</fieldset>`).join('')}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn pri" id="atS">${ic('check')} تسليم</button></div></form>`);
  $$('#atF input').forEach(r => r.onchange = () => { ans[r.dataset.q] = +r.value; });
  const tick = setInterval(() => { const left = Math.max(0, end - Date.now()), el = $('#atT'); if(!el){ clearInterval(tick); return; }
    el.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`; if(!left){ clearInterval(tick); finish(); } }, 500);
  const finish = async () => { clearInterval(tick); const r = await Store.finishAttempt({ attempt_id:at.id, answers:ans });
    modal(`<h3>النتيجة: ${fmtNum(r.score)} من ${fmtNum(r.total)}</h3>
      ${r.skills ? `<div class="skills">${Object.entries(r.skills).map(([k, v]) => `<div><span>${esc(k)}</span><div class="tbar"><i style="width:${Math.round(v.right / v.total * 100)}%"></i></div><b class="num">${fmtNum(v.right)}/${fmtNum(v.total)}</b></div>`).join('')}</div>` : ''}
      <ol class="qres">${r.snapshot.map(q => `<li class="${r.answers[q.id] === q.correct ? 'ok' : 'bad'}"><p>${esc(q.text)}</p><p><b>الصحيح:</b> ${esc(q.options[q.correct])}${r.answers[q.id] != null && r.answers[q.id] !== q.correct ? ` · <b>إجابتك:</b> ${esc(q.options[r.answers[q.id]])}` : ''}</p>${q.explanation ? `<p class="hint">${esc(q.explanation)}</p>` : ''}</li>`).join('')}</ol>
      <div style="text-align:end"><button class="btn pri" id="atX">إغلاق</button></div>`); $('#atX').onclick = () => { closeModal(); reload(); }; };
  $('#atF').onsubmit = e => { e.preventDefault(); finish(); };
}

export function studentMessages(D, tr, reload, role = 'student'){
  const tutors = (D.teachers || []).filter(t => (D.subscriptions || []).some(s => s.trainee_id === tr.id && s.section === t.section && (s.subjects || []).some(x => (t.subjects || []).includes(x))));
  return threadUi(D, tutors.map(t => ({ trainee_id:tr.id, teacher_id:t.id, title:`${t.full_name} · ${t.subjects.join('، ')}` })), role, reload);
}
export function threadUi(D, threads, role, reload){
  return { html:`<div class="card pad rv">${threads.length ? `<div class="msg-wrap"><div class="msg-list">${threads.map((th, i) => { const unread = threadFor(D, th.trainee_id, th.teacher_id).filter(m => m.from !== role && !m.read_at).length;
      return `<button class="msg-th ${i === 0 ? 'on' : ''}" data-th="${i}">${esc(th.title)}${unread ? ` <span class="badge-n">${fmtNum(unread)}</span>` : ''}</button>`; }).join('')}</div><div class="msg-pane" id="msgPane"></div></div>`
      : emptyBox(role === 'teacher' ? 'لا يوجد متدربون لمراسلتهم' : 'لا يوجد مدرب مسند لاشتراكك')}</div>`,
  bind(){ if(!threads.length) return; const open = i => { const th = threads[i]; $$('.msg-th').forEach((b, j) => b.classList.toggle('on', j === i));
      const ms = threadFor(D, th.trainee_id, th.teacher_id);
      $('#msgPane').innerHTML = `<div class="msgs" id="msgs" aria-live="polite">${ms.length ? ms.map(m => `<div class="msg ${m.from === role ? 'me' : ''}"><p>${esc(m.text)}</p><span>${fmtShort(m.at.slice(0, 10))} ${new Date(m.at).toLocaleTimeString('ar-SA', { timeZone:'Asia/Riyadh', hour:'numeric', minute:'2-digit' })}${m.from === role && m.read_at ? ' · قُرئت' : ''}</span></div>`).join('') : '<p class="hint">ابدأ المحادثة.</p>'}</div>
        <form id="msgF" class="msg-f"><label class="sr-only" for="msgT">رسالتك</label><textarea class="inp" id="msgT" rows="2" maxlength="1000" placeholder="اكتب رسالتك"></textarea><button class="btn pri">${ic('next')} إرسال</button></form>`;
      const box = $('#msgs'); box.scrollTop = box.scrollHeight;
      if(ms.some(m => m.from !== role && !m.read_at)) Store.markThreadRead(th, role);
      $('#msgF').onsubmit = async e => { e.preventDefault(); const b = $('#msgF button'); setBusy(b, true, '');
        try { await Store.sendMessage({ trainee_id:th.trainee_id, teacher_id:th.teacher_id, text:$('#msgT').value }, role); try { sessionStorage.setItem('sama_th', String(i)); } catch(_){} await reload(); } catch(x){ setBusy(b, false); toast(x.message); } }; };
    $$('[data-th]').forEach(b => b.onclick = () => open(+b.dataset.th)); open(Math.min(threads.length - 1, +(sessionStorage.getItem('sama_th') || 0)) || 0); } };
}

export function studentRating(D, tr, reload){
  const tutors = (D.teachers || []).filter(t => (D.subscriptions || []).some(s => s.trainee_id === tr.id && s.section === t.section && (s.subjects || []).some(x => (t.subjects || []).includes(x))));
  const per = period();
  return { html:`<div class="grid g2" style="align-items:start">${tutors.length ? tutors.map(t => { const c = canRate(D, tr.id, t), r = (D.ratings || []).find(x => x.trainee_id === tr.id && x.teacher_id === t.id && x.period === per);
      return `<form class="card pad rv rate-f" data-rt="${t.id}"><h3 class="ctitle">${ic('award')}${esc(t.full_name)}</h3><p class="hint" style="margin:-4px 0 10px">${esc(t.subjects.join('، '))}${r ? ' · قيّمته هذا الشهر، ويمكنك تعديل تقييمك' : ''}</p>
        ${c.ok ? `<fieldset class="stars" aria-label="التقييم العام"><legend class="sr-only">التقييم العام</legend>${[5, 4, 3, 2, 1].map(v => `<input type="radio" id="s-${t.id}-${v}" name="stars" value="${v}" ${r?.stars === v ? 'checked' : ''}><label for="s-${t.id}-${v}" title="${v} نجوم">★</label>`).join('')}</fieldset>
          <div class="grid" style="gap:6px;margin-top:8px">${Object.entries(RATE_ITEMS).map(([k, l]) => `<label class="rate-it"><span>${l}</span><select class="inp" name="${k}">${[5, 4, 3, 2, 1].map(v => `<option value="${v}" ${(r?.items?.[k] ?? 5) === v ? 'selected' : ''}>${'★'.repeat(v)}</option>`).join('')}</select></label>`).join('')}</div>
          <label class="sr-only" for="rc-${t.id}">تعليق</label><textarea class="inp" id="rc-${t.id}" name="comment" rows="2" maxlength="500" placeholder="تعليق اختياري" style="margin-top:8px;padding:10px 14px">${esc(r?.comment || '')}</textarea>
          <button class="btn pri sm" style="margin-top:8px">${ic('check')} ${r ? 'تحديث التقييم' : 'إرسال التقييم'}</button>
          <p class="hint" style="margin:6px 0 0">يرى المدرب نتائج مجمّعة دون اسمك.</p>` : `<p class="hint">${esc(c.why)}</p>`}</form>`; }).join('') : `<div class="card pad">${emptyBox('لا يوجد مدرب لتقييمه')}</div>`}</div>`,
  bind(){ $$('[data-rt]').forEach(f => f.onsubmit = async e => { e.preventDefault(); const fd = new FormData(f); if(!fd.get('stars')) return toast('اختر عدد النجوم');
      const b = $('button', f); setBusy(b, true, 'جارٍ الإرسال');
      try { const r = await Store.rateTeacher({ trainee_id:tr.id, teacher_id:f.dataset.rt, stars:+fd.get('stars'), items:Object.fromEntries(Object.keys(RATE_ITEMS).map(k => [k, +fd.get(k)])), comment:fd.get('comment') });
        toast(r.updated ? 'حُدّث تقييمك' : 'شكرًا لتقييمك'); reload(); } catch(x){ setBusy(b, false); toast(x.message); } }); } };
}

/* ======================= المدرب ======================= */
export function teacherHomework(D, reload){
  const me = D.me, list = (D.assignments || []).slice().sort((a, b) => b.publish_date.localeCompare(a.publish_date));
  const students = (D.trainees || []).length;
  return { html:`<div class="card pad rv"><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:10px"><h3 class="ctitle">${ic('form')}واجباتي</h3><button class="btn pri sm" id="hwAdd">${ic('plus')} واجب</button></div>
    ${list.length ? list.map(a => { const subs = (D.submissions || []).filter(s => s.assignment_id === a.id), done = subs.filter(s => ['submitted', 'graded', 'needs_revision'].includes(s.status));
      return `<details class="hw" ${a.due_date >= riyadhNow().date ? 'open' : ''}><summary><b>${esc(a.title)}</b> <span class="hint">${esc(a.subject)} · يُستحق ${fmtShort(a.due_date)} · سلّم ${fmtNum(done.length)} من ${fmtNum(students)}</span></summary>
        ${subs.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>المتدرب</th><th>الحالة</th><th>الإجابة</th><th>التصحيح</th></tr></thead><tbody>${subs.map(s => `<tr><td>${esc(D.trainees.find(t => t.id === s.trainee_id)?.full_name || '')}</td>
          <td><span class="pill dot ${STATE_TONE[s.status]}">${SUB_TXT[s.status]}</span>${s.late ? ' <span class="hint">متأخر</span>' : ''}</td><td style="max-width:320px">${esc(s.answer || '')}</td>
          <td>${['submitted', 'needs_revision', 'graded'].includes(s.status) ? `<button class="btn sm" data-gr="${s.id}">${ic('edit')} ${s.status === 'graded' ? fmtNum(s.score ?? 0) + '/' + fmtNum(a.max_score) : 'تصحيح'}</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">لا تسليمات بعد.</p>'}</details>`; }).join('') : emptyBox('لم تنشر واجبات بعد')}</div>`,
  bind(){ $('#hwAdd').onclick = () => { const n = riyadhNow();
      modal(`<h3>واجب جديد</h3><form id="hf" class="grid g2" novalidate>
        <div class="field" style="grid-column:1/-1"><label for="hf-t">العنوان</label><input class="inp" id="hf-t" name="title" maxlength="120"></div>
        <div class="field"><label for="hf-s">المقرر</label><select class="inp" id="hf-s" name="subject">${me.subjects.map(s => `<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label for="hf-m">الدرجة العظمى</label><input class="inp num" id="hf-m" name="max_score" type="number" min="1" value="10"></div>
        <div class="field"><label for="hf-p">تاريخ النشر</label><input class="inp" type="date" id="hf-p" name="publish_date" value="${n.date}"></div>
        <div class="field"><label for="hf-d">تاريخ الاستحقاق</label><input class="inp" type="date" id="hf-d" name="due_date" value="${addDays(n.date, 3)}"></div>
        <div class="field" style="grid-column:1/-1"><label for="hf-b">التعليمات</label><textarea class="inp" id="hf-b" name="body" rows="4" style="padding:10px 14px;line-height:1.8"></textarea></div>
        <p class="hint" style="grid-column:1/-1;margin:0">يصل الواجب إلى متدربي قسم ${SECTIONS[secOf(me)]} المشتركين في المقرر فقط.</p>
        <div class="errtxt" id="hfE" style="grid-column:1/-1"></div>
        <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="hfC">إلغاء</button><button class="btn pri" id="hfS">${ic('check')} نشر</button></div></form>`);
      $('#hfC').onclick = closeModal;
      $('#hf').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), b = $('#hfS'); setBusy(b, true, 'جارٍ النشر');
        try { await Store.saveAssignment(f); closeModal(); toast('نُشر الواجب'); reload(); } catch(x){ setBusy(b, false); $('#hfE').textContent = x.message; } }; };
    $$('[data-gr]').forEach(b => b.onclick = () => { const s = D.submissions.find(x => x.id === b.dataset.gr), a = D.assignments.find(x => x.id === s.assignment_id);
      modal(`<h3>تصحيح: ${esc(D.trainees.find(t => t.id === s.trainee_id)?.full_name || '')}</h3><p class="hw-ans">${esc(s.answer || '')}</p><form id="gf2" class="grid g2" novalidate>
        <div class="field"><label for="g-s">الدرجة من ${fmtNum(a.max_score)}</label><input class="inp num" id="g-s" name="score" type="number" min="0" max="${a.max_score}" value="${s.score ?? ''}"></div>
        <div class="field"><label for="g-st">النتيجة</label><select class="inp" id="g-st" name="status"><option value="graded">مكتمل ومصحح</option><option value="needs_revision" ${s.status === 'needs_revision' ? 'selected' : ''}>يحتاج تعديلًا</option></select></div>
        <div class="field" style="grid-column:1/-1"><label for="g-f">ملاحظات للمتدرب</label><textarea class="inp" id="g-f" name="feedback" rows="3" style="padding:10px 14px">${esc(s.feedback || '')}</textarea></div>
        <div class="errtxt" id="gE" style="grid-column:1/-1"></div><div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="gC">إلغاء</button><button class="btn pri" id="gS">${ic('check')} حفظ</button></div></form>`);
      $('#gC').onclick = closeModal; $('#gf2').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), bb = $('#gS'); setBusy(bb, true, 'جارٍ الحفظ');
        try { await Store.gradeSubmission(s.id, f); closeModal(); toast('حُفظ التصحيح'); reload(); } catch(x){ setBusy(bb, false); $('#gE').textContent = x.message; } }; }); } };
}

export function teacherBank(D, reload){
  const me = D.me, qs = (D.questions || []).slice().sort((a, b) => (a.subject + a.unit).localeCompare(b.subject + b.unit, 'ar'));
  const att = (D.attempts || []).slice().sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).slice(0, 30);
  return { html:`<div class="card pad rv"><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:10px"><h3 class="ctitle">${ic('database')}بنك أسئلة ${SECTIONS[secOf(me)]} · ${esc(me.subjects.join('، '))}</h3><button class="btn pri sm" id="qAdd2">${ic('plus')} سؤال</button></div>
      ${qs.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>المقرر</th><th>الوحدة</th><th>السؤال</th><th>الحالة</th><th></th></tr></thead><tbody>${qs.map(q => `<tr><td>${esc(q.subject)}</td><td>${esc(q.unit)}</td><td style="max-width:380px">${esc(q.text)}</td>
        <td><span class="pill dot ${q.status === 'published' ? 'ok' : 'g'}">${q.status === 'published' ? 'منشور' : 'مسودة'}</span></td><td style="white-space:nowrap"><button class="btn sm" data-qe="${q.id}" aria-label="تعديل">${ic('edit')}</button> <button class="btn sm" data-qp="${q.id}">${q.status === 'published' ? 'إيقاف' : 'نشر'}</button></td></tr>`).join('')}</tbody></table></div>` : emptyBox('البنك فارغ')}</div>
    <div class="card pad rv" style="margin-top:16px"><h3 class="ctitle">${ic('chart')}نتائج قياس المستوى لمتدربيّ</h3>${att.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>المتدرب</th><th>المقرر</th><th>الوحدة</th><th>الدرجة</th><th>التاريخ</th></tr></thead><tbody>${att.map(a => `<tr><td>${esc(D.trainees.find(t => t.id === a.trainee_id)?.full_name || '')}</td><td>${esc(a.subject)}</td><td>${esc(a.unit || '')}</td><td class="num">${fmtNum(a.score)} / ${fmtNum(a.total)}</td><td>${fmtShort(a.submitted_at.slice(0, 10))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">لا توجد محاولات بعد.</p>'}</div>`,
  bind(){ const edit = q => { modal(`<h3>${q ? 'تعديل سؤال' : 'سؤال جديد'}</h3><form id="qf" class="grid g2" novalidate>
        <div class="field"><label for="qf-s">المقرر</label><select class="inp" id="qf-s" name="subject">${me.subjects.map(s => `<option ${q?.subject === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label for="qf-u">الوحدة</label><input class="inp" id="qf-u" name="unit" value="${esc(q?.unit || '')}"></div>
        <div class="field" style="grid-column:1/-1"><label for="qf-t">نص السؤال</label><textarea class="inp" id="qf-t" name="text" rows="2" style="padding:10px 14px">${esc(q?.text || '')}</textarea></div>
        ${[0, 1, 2, 3].map(i => `<div class="field"><label class="opt"><input type="radio" name="correct" value="${i}" ${q?.correct === i ? 'checked' : ''}> الخيار ${fmtNum(i + 1)} (الصحيح)</label><input class="inp" name="o${i}" value="${esc(q?.options?.[i] || '')}" aria-label="الخيار ${i + 1}"></div>`).join('')}
        <div class="field"><label for="qf-k">المهارة</label><input class="inp" id="qf-k" name="skill" value="${esc(q?.skill || '')}"></div>
        <div class="field"><label for="qf-st">الحالة</label><select class="inp" id="qf-st" name="status"><option value="published">منشور</option><option value="draft" ${q?.status === 'draft' ? 'selected' : ''}>مسودة</option></select></div>
        <div class="field" style="grid-column:1/-1"><label for="qf-e">التفسير (يظهر بعد التسليم)</label><input class="inp" id="qf-e" name="explanation" value="${esc(q?.explanation || '')}"></div>
        <p class="hint" style="grid-column:1/-1;margin:0">تعديل سؤال لا يغيّر نتائج محاولات سابقة؛ كل محاولة تحفظ نسخة أسئلتها.</p>
        <div class="errtxt" id="qfE" style="grid-column:1/-1"></div><div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="qfC">إلغاء</button><button class="btn pri" id="qfS">${ic('check')} حفظ</button></div></form>`);
      $('#qfC').onclick = closeModal; $('#qf').onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target), b = $('#qfS');
        const o = { id:q?.id, subject:fd.get('subject'), unit:fd.get('unit'), text:fd.get('text'), options:[0, 1, 2, 3].map(i => fd.get('o' + i)), correct:fd.get('correct') == null ? -1 : +fd.get('correct'), skill:fd.get('skill'), status:fd.get('status'), explanation:fd.get('explanation') };
        setBusy(b, true, 'جارٍ الحفظ'); try { await Store.saveQuestion(o); closeModal(); toast('حُفظ السؤال'); reload(); } catch(x){ setBusy(b, false); $('#qfE').textContent = x.message; } }; };
    $('#qAdd2').onclick = () => edit(null);
    $$('[data-qe]').forEach(b => b.onclick = () => edit(D.questions.find(q => q.id === b.dataset.qe)));
    $$('[data-qp]').forEach(b => b.onclick = async () => { const q = D.questions.find(x => x.id === b.dataset.qp); await Store.setQuestionStatus(q.id, q.status === 'published' ? 'draft' : 'published'); reload(); }); } };
}

export function teacherMessages(D, reload){
  const ths = (D.trainees || []).map(t => ({ trainee_id:t.id, teacher_id:D.me.id, title:t.full_name, last:threadFor(D, t.id, D.me.id).slice(-1)[0]?.at || '' }))
    .sort((a, b) => b.last.localeCompare(a.last) || a.title.localeCompare(b.title, 'ar'));
  return threadUi(D, ths, 'teacher', reload);
}
export function teacherRatings(D){
  const r = D.rating_summary || { count:0, items:{}, comments:[] };
  return { html:`<div class="card pad rv"><h3 class="ctitle">${ic('award')}تقييمات المتدربين (مجمّعة دون أسماء)</h3>
    ${r.count ? `<div class="rate-sum"><div><b class="num">${fmtNum(r.stars)}</b><span>من 5 · ${fmtNum(r.count)} تقييم</span></div>${Object.entries(RATE_ITEMS).map(([k, l]) => `<div><span>${l}</span><div class="tbar"><i style="width:${(r.items[k] || 0) * 20}%"></i></div><b class="num">${fmtNum(r.items[k] || 0)}</b></div>`).join('')}</div>
      ${r.comments.length ? `<ul class="ntf" style="margin-top:12px">${r.comments.map(c => `<li><span class="pill g">${esc(c.period)}</span><p>${esc(c.text)}</p><span></span></li>`).join('')}</ul>` : ''}`
      : `<p class="hint">لا توجد تقييمات بعد. يُتاح التقييم للمتدرب بعد حضور ${MIN_ATTEND_TO_RATE} أيام.</p>`}</div>`, bind(){} };
}
