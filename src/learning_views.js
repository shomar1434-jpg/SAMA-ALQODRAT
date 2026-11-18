/* =====================================================================
   واجهات الجانب التعليمي داخل البوابات: الواجبات، وقياس المستوى وبنك الأسئلة،
   والمراسلة، وتقييم المدرب بالنجوم.
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort, riyadhNow, addDays, matchQ } from './utils.js';
import { ic, emptyBox, toast } from './views2_head.js';
import { Store } from './data2.js';
import { modal, closeModal } from './views2_programs.js';
import { setBusy } from './features.js';
import { SECTIONS, subStatus, planName } from './qudurat.js';
import { simCard, bindSimCard, simResult } from './sim_views.js';
import { analysisHtml, bindAnalysis } from './analysis_views.js';
import { CATEGORIES } from './sim_logic.js';
import { assignmentsFor, SUB_TXT, RATE_ITEMS, canRate, threadFor, period, MIN_ATTEND_TO_RATE, assetUrl, KEY_ST, HW_TYPES, REVEAL, quizOpen, attemptsLeft, attemptsOf, MAX_ATTEMPTS } from './learning_logic.js';

const STATE_TXT = { new:'جديد', draft:'قيد الحل', submitted:'مُرسل', needs_revision:'يحتاج تعديلًا', graded:'مصحح', late:'متأخر' };
const STATE_TONE = { new:'info', draft:'o', submitted:'ok', needs_revision:'warn', graded:'ok', late:'bad' };
const secOf = t => Object.keys(SECTIONS).find(k => k === t?.section) || t?.section;

/* ======================= المتدرب ======================= */
/* نتائجي (طلب المالك 18 نوفمبر): لكل واجب أو اختبار مصحَّح نسبته وشرحها، والمتوسطات، ومراجعة الإجابات */
const pctOf = a => { const sb = a.submission; return sb && sb.score != null && a.max_score ? Math.round(sb.score / a.max_score * 100) : null; };
const VERDICTS = [[90, 'ممتاز', 'ok'], [75, 'جيد جدًا', 'ok'], [60, 'جيد', 'info'], [50, 'مقبول', 'warn'], [0, 'يحتاج مراجعة', 'bad']];
const verdictOf = p => VERDICTS.find(([m]) => p >= m);
/* تفصيل الاختبار: الصحيحة والخاطئة والمتروكة (الصحيحة من المراجعة إن أُتيحت، وإلا من الدرجة) */
export function quizCounts(a){
  const sb = a.submission, total = (a.quiz || []).length || a.quiz_count || 0, ans = sb?.answers || {};
  const answered = Object.values(ans).filter(v => v !== null && v !== undefined && v !== '').length;
  const rv = sb?.review ? Object.fromEntries(sb.review.map(x => [x.id, x.correct])) : null;
  const right = rv ? Object.entries(ans).filter(([k, v]) => v != null && rv[k] === v).length : Math.round((pctOf(a) ?? 0) / 100 * total);
  const blank = Math.max(0, total - answered);
  return { total, right, blank, wrong:Math.max(0, total - right - blank) };
}
function resultLine(a){
  const p = pctOf(a); if(p == null) return '';
  const [, label, tone] = verdictOf(p), q = a.kind === 'quiz' ? quizCounts(a) : null;
  return `<div class="hw-res" data-hwres="${a.id}"><div class="hw-res-h"><b class="num">${fmtNum(p)}٪</b><span class="pill ${tone}">${label}</span><span class="hint">الدرجة ${fmtNum(a.submission.score)} من ${fmtNum(a.max_score)}</span></div>
    <div class="tbar" role="img" aria-label="النسبة ${fmtNum(p)}٪"><i style="width:${p}%"></i></div>
    <p class="hint" style="margin:6px 0 0">${q ? `أجبت إجابة صحيحة عن ${fmtNum(q.right)} من ${fmtNum(q.total)} سؤالًا${q.wrong ? `، وأخطأت في ${fmtNum(q.wrong)}` : ''}${q.blank ? `، وتركت ${fmtNum(q.blank)} دون إجابة` : ''}. النسبة = الصحيحة ÷ عدد الأسئلة.` : 'النسبة = درجتك ÷ الدرجة الكاملة التي وضعها المدرب.'}${p < 60 ? ' راجع إجاباتك وملاحظات المدرب، وتدرّب على المهارات الأضعف من «قياس مستواي».' : ''}</p></div>`;
}
function resultsHtml(list){
  const done = list.filter(a => pctOf(a) != null);
  if(!done.length) return '';
  const avg = xs => xs.length ? Math.round(xs.reduce((s, a) => s + pctOf(a), 0) / xs.length) : null;
  const groups = [['all', 'كل المصحَّح', done], ...Object.entries(HW_TYPES).map(([k, t]) => [k, t, done.filter(a => (a.type || 'homework') === k)])].filter(g => g[2].length);
  return `<section class="card pad rv" style="margin-bottom:14px" data-results><h3 class="ctitle">${ic('chart')}نتائجي في الواجبات والاختبارات</h3>
    <div class="det-stats">${groups.map(([, t, xs]) => `<div><b class="num">${fmtNum(avg(xs))}٪</b><span>متوسط ${t} (${fmtNum(xs.length)})</span></div>`).join('')}</div>
    <div class="tblwrap"><table class="tb"><thead><tr><th>العنوان</th><th>النوع</th><th>المقرر</th><th>الدرجة</th><th>النسبة</th><th>التقدير</th></tr></thead><tbody>
      ${done.map(a => { const p = pctOf(a), [, label, tone] = verdictOf(p); return `<tr><td><button type="button" class="linkbtn" data-goto="${a.id}">${esc(a.title)}</button></td><td>${HW_TYPES[a.type || 'homework'] || 'واجب'}</td><td>${esc(a.subject)}</td><td class="num">${fmtNum(a.submission.score)} / ${fmtNum(a.max_score)}</td>
        <td><div class="tbar sm" style="min-width:70px"><i style="width:${p}%"></i></div><span class="num">${fmtNum(p)}٪</span></td><td><span class="pill ${tone}">${label}</span></td></tr>`; }).join('')}</tbody></table></div>
    <p class="hint" style="margin:8px 0 0">النسبة لكل واجب = درجتك ÷ الدرجة الكاملة، والتقدير: ممتاز 90٪ فأكثر، جيد جدًا 75٪، جيد 60٪، مقبول 50٪. اضغط العنوان لمراجعة إجاباتك.</p></section>`;
}
/* نافذة النتيجة بعد التسليم */
export function quizResultModal(a, onReview){
  modal(`<h3>${ic('check')} نتيجتك في «${esc(a.title)}»</h3>${resultLine(a)}
    <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px"><button class="btn" id="qrX">إغلاق</button><button class="btn pri" id="qrRev">${ic('eye')} مراجعة إجاباتي</button></div>`);
  $('#qrX').onclick = closeModal; $('#qrRev').onclick = () => { closeModal(); onReview?.(); };
}
/* مراجعة الإجابات: إجابتي دائمًا، والصحيحة والتفسير متى سمحت سياسة الاختبار */
function reviewHtml(a){
  const sb = a.submission; if(!sb || !a.quiz) return '';
  const rv = sb.review ? Object.fromEntries(sb.review.map(x => [x.id, x])) : null;
  const note = rv ? '' : `<p class="hint">${attemptsLeft(a, sb) ? 'تظهر الإجابات الصحيحة بعد آخر محاولة.' : a.reveal === 'after_due' ? `تظهر الإجابات الصحيحة بعد ${fmtShort(a.due_date)}.` : 'المدرب لم يُتح الإجابات الصحيحة لهذا الاختبار؛ تظهر هنا إجاباتك فقط.'}</p>`;
  return `<details class="qrev" data-rev="${a.id}"><summary>${ic('eye')} مراجعة إجاباتي</summary>${note}<ol class="qres">${a.quiz.map(q => { const mine = sb.answers?.[q.id], c = rv?.[q.id]?.correct;
    const cls = !rv ? (mine == null ? 'blank' : 'mine') : mine === c ? 'ok' : 'bad';
    return `<li class="${cls}">${qStem(q)}${q.image ? '' : ''}<p>${mine == null ? '<b>لم تُجب</b>' : `<b>إجابتك:</b> ${esc(q.options[mine] ?? '')}`}${rv ? ` · <b>الصحيح:</b> ${esc(q.options[c] ?? '')}` : ''}</p>${rv?.[q.id]?.explanation ? `<p class="hint">${esc(rv[q.id].explanation)}</p>` : ''}</li>`; }).join('')}</ol></details>`;
}
export function studentHomework(D, tr, reload){ setBankAssets(D.bank_assets);
  const list = assignmentsFor(D, tr.id), counts = {};
  list.forEach(a => counts[a.state] = (counts[a.state] || 0) + 1);
  return { html:`${resultsHtml(list)}<div class="card pad rv"><div class="hw-counts">${Object.keys(STATE_TXT).map(k => `<span class="pill ${STATE_TONE[k]}">${STATE_TXT[k]}: ${fmtNum(counts[k] || 0)}</span>`).join('')}</div>
    ${list.length ? `<div class="hw-list">${list.map(a => `<article class="hw" id="hw-a-${a.id}"><div class="hw-h"><b>${esc(a.title)}${a.type && a.type !== 'homework' ? ` <span class="pill ${a.type === 'exam' ? 'warn' : 'g'}">${HW_TYPES[a.type]}</span>` : ''}</b><span class="pill dot ${STATE_TONE[a.state]}">${STATE_TXT[a.state]}</span></div>
      <div class="hint">${esc(a.subject)} · نُشر ${fmtShort(a.publish_date)} · يُستحق ${fmtShort(a.due_date)}${a.submission?.late ? ' · سُلّم متأخرًا' : ''}</div>
      ${a.body ? `<p>${esc(a.body)}</p>` : ''}
      ${a.kind === 'quiz' ? quizHtml(a) : ''}
      ${a.kind !== 'quiz' && a.submission?.status === 'graded' ? resultLine(a) : ''}${a.submission?.status === 'graded' || a.submission?.status === 'needs_revision' ? `<div class="hw-fb"><b>${a.submission.score != null ? `الدرجة ${fmtNum(a.submission.score)} من ${fmtNum(a.max_score)}` : 'ملاحظات المدرب'}</b>${a.submission.feedback ? `<p>${esc(a.submission.feedback)}</p>` : ''}</div>` : ''}
      ${a.kind !== 'quiz' && a.submission?.status !== 'graded' ? `<form class="hw-f" data-hw="${a.id}"><label class="sr-only" for="hw-${a.id}">إجابتك</label><textarea class="inp" id="hw-${a.id}" rows="3" maxlength="6000" placeholder="اكتب إجابتك هنا" style="padding:10px 14px;line-height:1.8">${esc(a.submission?.answer || '')}</textarea>
        <div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn sm" data-draft>حفظ مسودة</button><button class="btn pri sm">${ic('check')} إرسال</button></div></form>` : ''}
    </article>`).join('')}</div>` : emptyBox('لا توجد واجبات منشورة لك بعد')}</div>`,
  bind(){ clearInterval(QZ_TICK);
    const openRev = id => { const d = $(`[data-rev="${id}"]`), el = $(`#hw-a-${id}`); if(d) d.open = true; el?.scrollIntoView({ block:'start', behavior:'smooth' }); };
    $$('[data-goto]').forEach(b => b.onclick = () => openRev(b.dataset.goto));
    if(RESULT_FOR){ const id = RESULT_FOR; RESULT_FOR = null; const a = list.find(x => x.id === id); if(a && pctOf(a) != null) quizResultModal(a, () => openRev(id)); }
    $$('[data-qs]').forEach(b => b.onclick = () => confirmStart(async () => { try { await Store.startQuiz({ trainee_id:tr.id, assignment_id:b.dataset.qs }); } catch(x){ toast(x.message); } reload(); }));
    $$('[data-qr]').forEach(b => b.onclick = () => confirmStart(async () => { try { await Store.startQuiz({ trainee_id:tr.id, assignment_id:b.dataset.qr, retry:true }); } catch(x){ toast(x.message); } reload(); }, true));
    if($('[data-qexp]')) setTimeout(async () => { for(const el of $$('[data-qexp]')){ try { await Store.submitAssignment({ trainee_id:tr.id, assignment_id:el.dataset.qexp, answers:{} }); } catch(_){} } reload(); }, 600);
    const forms = $$('[data-qz]'); forms.forEach(f => $$('input[type=radio]', f).forEach(r => r.onchange = () => Store.saveQuizAnswer({ trainee_id:tr.id, assignment_id:f.dataset.qz, question_id:r.dataset.q, value:+r.value }).catch(() => {})));
    if(forms.length){ const tick = () => { for(const f of forms){ if(!f.isConnected){ clearInterval(QZ_TICK); return; } const left = Math.max(0, Math.round((Date.parse(f.dataset.deadline) - Date.now()) / 1000)), el = $('[data-qt]', f);
          el.textContent = `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`; f.classList.toggle('low', left <= 60);
          if(left <= 0 && !f.dataset.auto){ f.dataset.auto = '1'; f.dataset.warned = '1'; clearInterval(QZ_TICK); toast('انتهى الوقت؛ يُسلَّم الاختبار الآن'); f.requestSubmit(); } } };
      tick(); QZ_TICK = setInterval(tick, 1000); }
    $$('[data-qz]').forEach(f => f.onsubmit = async e => { e.preventDefault(); const a = list.find(x => x.id === f.dataset.qz), ans = {};
      $$('input[type=radio]:checked', f).forEach(r => ans[r.dataset.q] = +r.value);
      const miss = a.quiz.length - Object.keys(ans).length, b = $('button.pri', f);
      const go = async () => { setBusy(b, true, 'جارٍ التصحيح'); try { const r = await Store.submitAssignment({ trainee_id:tr.id, assignment_id:a.id, answers:ans });
          RESULT_FOR = a.id; reload(); } catch(x){ setBusy(b, false); toast(x.message); } };
      if(miss > 0 && !f.dataset.warned){ f.dataset.warned = '1'; $('.qz-w', f).textContent = `لم تُجب عن ${fmtNum(miss)} من الأسئلة. التسليم نهائي ويُصحَّح فورًا؛ اضغط مرة أخرى للتسليم.`; b.lastChild.textContent = ' تسليم رغم ذلك'; return; }
      go(); });
    $$('[data-hw]').forEach(f => { const send = async draft => { const b = draft ? $('[data-draft]', f) : $('button.pri', f); setBusy(b, true, draft ? 'جارٍ الحفظ' : 'جارٍ الإرسال');
      try { await Store.submitAssignment({ trainee_id:tr.id, assignment_id:f.dataset.hw, answer:$('textarea', f).value, draft }); toast(draft ? 'حُفظت المسودة' : 'أُرسلت إجابتك'); reload(); } catch(x){ setBusy(b, false); toast(x.message); } };
    f.onsubmit = e => { e.preventDefault(); send(false); }; $('[data-draft]', f).onclick = () => send(true); }); } };
}

/* واجب اختبار من بنك المدرب: قبل التسليم أسئلة بلا إجابات، وبعده مراجعة بالإجابة الصحيحة والتفسير */
/* تجهيز واجب علاجي من مجموعة ذكية: يفتح نموذج الواجب بقائمة مستهدفين جاهزة، والنشر بيد المدرب */
let HW_PRESET = null, QZ_TICK = null, RESULT_FOR = null;
function confirmStart(fn, again){ modal(`<h3>${again ? 'محاولة جديدة' : 'بدء الاختبار'}</h3><p>${again ? 'تبدأ محاولة جديدة بوقت جديد، وتُحتسب أعلى درجة بين محاولاتك. يبدأ الوقت الآن ولا يتوقف. هل أنت مستعد؟' : 'يُفتح الاختبار مرة واحدة ويبدأ الوقت الآن ولا يتوقف. هل أنت مستعد؟'}</p><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px"><button class="btn" id="qsNo">ليس الآن</button><button class="btn pri" id="qsGo">${ic('timer')} ابدأ</button></div>`);
  $('#qsNo').onclick = closeModal; $('#qsGo').onclick = async e => { setBusy(e.currentTarget, true, 'جارٍ البدء'); closeModal(); await fn(); }; }
export const setHwPreset = p => { HW_PRESET = p; };
/* نص السؤال أو صورته (البنك المشترك مصوَّر)، ورابط صفحة القطعة عند وجودها. base يضبطه setBankAssets عند تحميل البوابة */
let ASSETS = '';
export const setBankAssets = b => { ASSETS = b || ''; };
export const getBankAssets = () => ASSETS;
export function qStem(q, thumb){
  const src = q.image ? assetUrl(q.image, ASSETS) : '', pg = q.page_image ? assetUrl(q.page_image, ASSETS) : '';
  return q.image ? `<span class="qimg ${thumb ? 'th' : ''}">${src ? `<img src="${esc(src)}" alt="سؤال مصوَّر ${esc(q.code || '')}" loading="lazy">` : `<span class="hint">صورة السؤال ${esc(q.code || '')} غير متاحة (لم يُضبط مسار تخزين صور البنك)</span>`}${!thumb && pg ? `<a class="linkbtn" href="${esc(pg)}" target="_blank" rel="noopener">عرض صفحة القطعة</a>` : ''}</span>${q.text ? `<p>${esc(q.text)}</p>` : ''}` : `<p>${esc(q.text)}</p>`;
}
/* ملاحظات المدرب بعد التسليم: العامة، ولكل سؤال برقمه */
const fbHtml = (a, sb) => { if(!sb || (!sb.teacher_note && !sb.comments)) return ''; const idx = Object.fromEntries((a.quiz || []).map((q, i) => [q.id, i + 1]));
  return `<div class="alert t-info fb-box" style="margin:8px 0 0"><span class="aic">${ic('chat')}</span><div style="flex:1"><b>ملاحظات المدرب</b>${sb.teacher_note ? `<p style="margin:4px 0">${esc(sb.teacher_note)}</p>` : ''}
    ${Object.entries(sb.comments || {}).sort((x, y) => (idx[x[0]] || 999) - (idx[y[0]] || 999)).map(([id, t]) => `<p class="fb-q">${idx[id] ? `السؤال ${fmtNum(idx[id])}: ` : ''}${esc(t)}</p>`).join('')}</div></div>`; };
function quizHtml(a){ const fb = fbHtml(a, a.submission); return fb + quizCore(a); }
function quizCore(a){
  const sb = a.submission, done = sb?.status === 'graded' && sb.review;
  const left = attemptsLeft(a, sb);
  if(left) return resultLine(a) + reviewHtml(a) + `<div class="alert t-info" style="margin:8px 0 0"><span class="aic">${ic('check')}</span><div style="flex:1"><span>سُلّم الاختبار: ${esc(sb.feedback || '')} · درجتك ${fmtNum(sb.score ?? 0)} من ${fmtNum(a.max_score)}.</span>
      <p style="margin:6px 0 8px">بقيت لك ${fmtNum(left)} ${left === 1 ? 'محاولة' : 'محاولتان'} من ${fmtNum(attemptsOf(a))}؛ تُحتسب أعلى درجة، وتظهر الإجابات الصحيحة بعد آخر محاولة.</p>
      <button type="button" class="btn sm" data-qr="${a.id}">${ic('timer')} محاولة جديدة</button></div></div>`;
  if(sb?.status === 'graded') return resultLine(a) + reviewHtml(a);
  if(!sb) return `<div class="qz-start" data-qsb="${a.id}"><p><b>${fmtNum(a.quiz_count || 0)} سؤالًا · المدة ${fmtNum(a.quiz_minutes || 0)} دقيقة</b> (دقيقتان لكل سؤال)</p>
      <p class="hint" style="margin:4px 0 10px">يُفتح مرة واحدة فقط: يبدأ الوقت عند الضغط ولا يتوقف إن أغلقت الصفحة، وعند انتهائه يُسلَّم ما أجبت عنه تلقائيًا ولا تُعاد المحاولة.</p>
      <button type="button" class="btn pri sm" data-qs="${a.id}">${ic('timer')} ابدأ الآن</button></div>`;
  if(!quizOpen(sb) || !a.quiz) return `<p class="alert t-info" data-qexp="${a.id}" style="margin:8px 0 0"><span class="aic">${ic('timer')}</span><span>انتهى وقت الاختبار، وجارٍ تصحيح ما أجبت عنه…</span></p>`;
  return `<form class="hw-quiz" data-qz="${a.id}" data-deadline="${esc(sb.deadline)}"><p class="qz-timer" role="timer" aria-live="off">الوقت المتبقي <b data-qt>—</b></p><p class="hint" style="margin:0 0 6px">${fmtNum(a.quiz.length)} أسئلة من بنك المدرب · تُحفظ إجاباتك أولًا بأول · يُصحَّح فورًا عند التسليم</p>
    ${a.quiz.map((q, i) => `<fieldset class="q ${q.image ? 'qi' : ''}"><legend><b>${fmtNum(i + 1)}.</b> ${q.image ? '' : esc(q.text)}</legend>${q.image ? qStem(q) : ''}${q.options.map((o, j) => `<label class="opt"><input type="radio" name="${a.id}-${i}" value="${j}" data-q="${q.id}" ${sb.answers?.[q.id] === j ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</fieldset>`).join('')}
    <div class="errtxt qz-w" aria-live="polite"></div><div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn pri sm">${ic('check')} تسليم الاختبار</button></div></form>`;
}

export function studentLevel(D, tr, it, reload){ setBankAssets(D.bank_assets);
  const subs = (D.subscriptions || []).filter(s => s.trainee_id === tr.id);
  const units = (D.bank_units || []).filter(u => subs.some(s => s.section === u.section && (s.subjects || []).includes(u.subject)));
  const past = (D.attempts || []).filter(a => a.trainee_id === tr.id && a.submitted_at).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
  const catOpts = sub => `<option value="">كل المهارات</option>${(CATEGORIES[sub] || []).map(c => `<option>${esc(c)}</option>`).join('')}`;
  return { html:`${analysisHtml(D, tr.id, { role:'student', practice:true })}${simCard(D, tr)}<div class="grid g2" style="align-items:start;margin-top:16px"><div class="card pad rv"><h3 class="ctitle">${ic('spark')}تدريب سريع</h3>
      ${units.length ? `<form id="lvF" class="grid" novalidate>
        <div class="field"><label for="lv-u">المقرر والوحدة وبنك المدرب</label><select class="inp" id="lv-u">${units.map((u, i) => `<option value="${i}">${esc(u.subject)} · ${esc(u.unit)}${u.teacher_name ? ` · ${esc(u.teacher_name)}` : ''} (${fmtNum(u.count)} سؤالًا)</option>`).join('')}</select></div>
        <div class="field"><label for="lv-c">المهارة</label><select class="inp" id="lv-c">${catOpts(units[0].subject)}</select><span class="hint">اختيار مهارة يجمع أسئلتها من كل الوحدات.</span></div>
        <div class="field"><label for="lv-n">عدد الأسئلة</label><select class="inp" id="lv-n">${[5, 10, 20].map(n => `<option>${n}</option>`).join('')}</select></div>
        <button class="btn pri" id="lvGo">${ic('timer')} ابدأ التدريب</button>
        <p class="hint" style="margin:0">أسئلة من بنك مقررك. لا تظهر الإجابات الصحيحة قبل التسليم.</p></form>` : emptyBox('لا توجد أسئلة منشورة لمقرراتك بعد')}</div>
    <div class="card pad rv"><h3 class="ctitle">${ic('chart')}محاولاتي</h3>${past.length ? `<ul class="ses-list at-list">${past.slice(0, 30).map(a => { const p = Math.round(a.score / a.total * 100);
        return `<li><button class="at-row" data-atv="${a.id}"><b>${a.kind === 'sim' ? `${ic('timer')} محاكي` : esc(a.subject)}</b><span>${esc(a.kind === 'sim' ? a.focus || '' : a.focus || a.unit || '')}</span><span class="pill ${p >= 70 ? 'ok' : p >= 45 ? 'warn' : 'bad'}">${a.kind === 'sim' ? fmtNum(p) + '٪' : `${fmtNum(a.score)} / ${fmtNum(a.total)}`}</span><span class="hint">${fmtShort(a.submitted_at.slice(0, 10))}</span></button></li>`; }).join('')}</ul>` : '<p class="hint">لا توجد محاولات بعد.</p>'}</div></div>`,
  bind(){ bindSimCard(D, tr, reload); bindAnalysis(D, tr, at => runAttempt(at, reload));
    $$('[data-atv]').forEach(b => b.onclick = () => simResult(past.find(a => a.id === b.dataset.atv)));
    if(!$('#lvF')) return;
    $('#lv-u').onchange = () => { $('#lv-c').innerHTML = catOpts(units[+$('#lv-u').value].subject); };
    $('#lvF').onsubmit = async e => { e.preventDefault(); const u = units[+$('#lv-u').value], b = $('#lvGo'), c = $('#lv-c').value; setBusy(b, true, 'جارٍ تجهيز الأسئلة');
      try { const at = await Store.startAttempt({ trainee_id:tr.id, section:u.section, subject:u.subject, unit:c ? null : u.unit, teacher_id:c ? null : u.teacher_id || null, category:c || null, count:+$('#lv-n').value }); runAttempt(at, reload); } catch(x){ setBusy(b, false); toast(x.message); } }; } };
}
function runAttempt(at, reload){
  const ans = {}, end = Date.now() + at.minutes * 60000;
  modal(`<h3>تدريب · ${esc(at.subject)}${at.focus ? ' · ' + esc(at.focus) : ''}</h3><div class="hint" style="margin:-4px 0 10px">الوقت المتبقي: <b id="atT" class="num"></b></div>
    <form id="atF">${at.snapshot.map((q, i) => `<fieldset class="q ${q.image ? 'qi' : ''}"><legend><b>${fmtNum(i + 1)}.</b> ${q.image ? '' : esc(q.text)}</legend>${q.image ? qStem(q) : ''}
      ${q.options.map((o, j) => `<label class="opt"><input type="radio" name="q${i}" value="${j}" data-q="${q.id}"> ${esc(o)}</label>`).join('')}</fieldset>`).join('')}
      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:10px"><button class="btn pri" id="atS">${ic('check')} تسليم</button></div></form>`);
  $$('#atF input').forEach(r => r.onchange = () => { ans[r.dataset.q] = +r.value; });
  const tick = setInterval(() => { const left = Math.max(0, end - Date.now()), el = $('#atT'); if(!el){ clearInterval(tick); return; }
    el.textContent = `${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`; if(!left){ clearInterval(tick); finish(); } }, 500);
  const finish = async () => { clearInterval(tick); const r = await Store.finishAttempt({ attempt_id:at.id, answers:ans });
    simResult(r, reload); };
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
export function teacherHomework(D, reload){ setBankAssets(D.bank_assets);
  const me = D.me, list = (D.assignments || []).slice().sort((a, b) => b.publish_date.localeCompare(a.publish_date));
  const students = (D.trainees || []).length;
  return { html:`<div class="card pad rv"><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:10px"><h3 class="ctitle">${ic('form')}واجباتي</h3><button class="btn pri sm" id="hwAdd">${ic('plus')} واجب</button></div>
    ${list.length ? list.map(a => { const subs = (D.submissions || []).filter(s => s.assignment_id === a.id), done = subs.filter(s => ['submitted', 'graded', 'needs_revision'].includes(s.status));
      return `<details class="hw" ${a.due_date >= riyadhNow().date ? 'open' : ''}><summary><b>${esc(a.title)}</b> ${a.type && a.type !== 'homework' ? `<span class="pill ${a.type === 'exam' ? 'warn' : 'g'}">${HW_TYPES[a.type]}</span> ` : ''}${a.kind === 'quiz' ? `<span class="pill info">اختبار · ${fmtNum(a.quiz?.length || 0)} أسئلة${attemptsOf(a) > 1 ? ` · ${fmtNum(attemptsOf(a))} محاولات` : ''}</span> ` : ''}${Array.isArray(a.targets) ? `<span class="pill g">${esc(a.target_label || '')}</span> ` : ''}<span class="hint">${esc(a.subject)} · يُستحق ${fmtShort(a.due_date)} · سلّم ${fmtNum(done.length)} من ${fmtNum(Array.isArray(a.targets) ? a.targets.length : students)}</span></summary>
        ${subs.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>المتدرب</th><th>الحالة</th><th>الإجابة</th><th>التصحيح</th></tr></thead><tbody>${subs.map(s => `<tr><td>${esc(D.trainees.find(t => t.id === s.trainee_id)?.full_name || '')}</td>
          <td><span class="pill dot ${STATE_TONE[s.status]}">${SUB_TXT[s.status]}</span>${s.late ? ' <span class="hint">متأخر</span>' : ''}</td><td style="max-width:320px">${a.kind === 'quiz' ? esc(s.feedback || '') : esc(s.answer || '')}</td>
          <td>${a.kind === 'quiz' ? `<b class="num">${fmtNum(s.score ?? 0)} / ${fmtNum(a.max_score)}</b> <span class="hint">آلي</span>${s.status !== 'draft' ? ` <button class="btn sm" data-fb="${s.id}">${ic('chat')} ${s.teacher_note || s.comments ? 'ملاحظاتك' : 'مراجعة وتغذية راجعة'}</button>` : ''}` : ['submitted', 'needs_revision', 'graded'].includes(s.status) ? `<button class="btn sm" data-gr="${s.id}">${ic('edit')} ${s.status === 'graded' ? fmtNum(s.score ?? 0) + '/' + fmtNum(a.max_score) : 'تصحيح'}</button>` : '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">لا تسليمات بعد.</p>'}</details>`; }).join('') : emptyBox('لم تنشر واجبات بعد')}</div>`,
  bind(){ if(HW_PRESET) queueMicrotask(() => $('#hwAdd')?.click());
    $('#hwAdd').onclick = () => { const n = riyadhNow();
      modal(`<h3>واجب جديد</h3><form id="hf" class="grid g2" novalidate>
        <div class="field" style="grid-column:1/-1"><label for="hf-t">العنوان</label><input class="inp" id="hf-t" name="title" maxlength="120"></div>
        <fieldset class="field" style="grid-column:1/-1;border:0;padding:0;margin:0"><legend style="font-weight:500;font-size:13.5px;margin-bottom:6px">نوع الواجب</legend><div style="display:flex;gap:14px;flex-wrap:wrap">
          <label class="chk"><input type="radio" name="kind" value="text" checked> واجب كتابي</label><label class="chk"><input type="radio" name="kind" value="quiz"> اختبار من بنك أسئلتي (يُصحَّح آليًا)</label></div></fieldset>
        <div class="field"><label for="hf-ty">النوع</label><select class="inp" id="hf-ty" name="type">${Object.entries(HW_TYPES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field"><label for="hf-tg">المستهدفون</label><select class="inp" id="hf-tg"><option value="all">كل متدربي المقرر</option><option value="plan">باقة معينة</option>${(D.groups || []).length ? '<option value="group">مجموعة محفوظة</option>' : ''}<option value="pick">أفراد بعينهم</option></select></div>
        <div data-tgp hidden style="grid-column:1/-1"><div class="field" id="hfTgPlanF" hidden><label for="hf-tp">الباقة</label><select class="inp" id="hf-tp"></select></div><div class="field" id="hfTgGrpF" hidden><label for="hf-gp">المجموعة</label><select class="inp" id="hf-gp">${(D.groups || []).map(g => `<option value="${g.id}">${esc(g.name)} (${fmtNum(g.trainee_ids.length)})</option>`).join('')}</select></div><div class="qb-row" id="hfTgTools" hidden><div class="field" style="margin:0"><label for="hfTgQ">بحث بالاسم</label><input class="inp" id="hfTgQ" type="search"></div><button type="button" class="btn sm" id="hfTgAll">تحديد الظاهرين</button><button type="button" class="btn sm" id="hfTgNone">إلغاء التحديد</button></div><div class="qpick" id="hfTgList" hidden></div><p class="hint" id="hfTgN" style="margin:6px 0 0"></p></div>
        <div class="field" data-qk hidden><label for="hf-rv">إظهار الإجابات الصحيحة للمتدرب</label><select class="inp" id="hf-rv" name="reveal">${Object.entries(REVEAL).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
        <div class="field" data-qk hidden><label for="hf-at">عدد المحاولات المسموحة</label><select class="inp" id="hf-at" name="max_attempts">${Array.from({ length:MAX_ATTEMPTS }, (_, i) => `<option value="${i + 1}">${i === 0 ? 'محاولة واحدة' : i === 1 ? 'محاولتان' : fmtNum(i + 1) + ' محاولات'}</option>`).join('')}</select></div>
        <div class="qb" data-qk hidden style="grid-column:1/-1">
          <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-weight:500;font-size:13.5px;margin-bottom:6px">الأقسام والنماذج (اختر قسمًا أو أكثر ليكون الاختبار شاملًا)</legend><div class="qb-units" id="hfUnits"></div></fieldset>
          <div class="qb-row"><div class="field" style="margin:0"><label for="hf-n">عدد الأسئلة</label><input class="inp num" id="hf-n" name="count" type="number" min="1" max="100" value="10" inputmode="numeric"></div>
            <button type="button" class="btn" id="hfDraw">${ic('refresh')} سحب عشوائي من الأقسام المحددة</button></div>
          <details class="qb-man"><summary>أو انتقِ الأسئلة بنفسك</summary>
            <div class="qb-row"><div class="field" style="margin:0"><label for="hf-k">المهارة داخل الأقسام</label><select class="inp" id="hf-k"></select></div><div class="field" style="margin:0"><label for="hf-q">بحث</label><input class="inp" id="hf-q" type="search" placeholder="رمز السؤال أو نصه"></div></div>
            <div class="qpick" id="hfPick"></div></details>
          <div class="qb-sel"><div class="qb-head"><b id="hfPn">لم تُختر أسئلة بعد</b><span style="flex:1"></span><button type="button" class="btn sm" id="hfClr">${ic('x')} تفريغ</button><button type="button" class="btn sm pri" id="hfPv">${ic('eye')} معاينة</button></div><ol class="qb-list" id="hfSel"></ol></div>
          <div class="qb-prev" id="hfPrev" hidden><div class="seg" role="tablist"><button type="button" role="tab" class="on" data-pv="t" aria-selected="true">كما يراه المدرب</button><button type="button" role="tab" data-pv="s" aria-selected="false">كما يراه المتدرب</button></div><div id="hfPrevB"></div></div>
          <p class="hint" style="margin:0">إن لم تختر أسئلة يُسحب العدد المحدد عشوائيًا عند النشر. الحد 100 سؤال.</p></div>
        <div class="field"><label for="hf-s">المقرر</label><select class="inp" id="hf-s" name="subject">${me.subjects.map(s => `<option>${s}</option>`).join('')}</select></div>
        <div class="field"><label for="hf-ms">الدرجة العظمى</label><input class="inp num" id="hf-ms" name="max_score" type="number" min="1" value="10"></div>
        <div class="field"><label for="hf-p">تاريخ النشر</label><input class="inp" type="date" id="hf-p" name="publish_date" value="${n.date}"></div>
        <div class="field"><label for="hf-d">تاريخ الاستحقاق</label><input class="inp" type="date" id="hf-d" name="due_date" value="${addDays(n.date, 3)}"></div>
        <div class="field" style="grid-column:1/-1"><label for="hf-b">التعليمات</label><textarea class="inp" id="hf-b" name="body" rows="4" style="padding:10px 14px;line-height:1.8"></textarea></div>
        <p class="hint" style="grid-column:1/-1;margin:0">يصل الواجب إلى متدربي قسم ${SECTIONS[secOf(me)]} المشتركين في المقرر فقط.</p>
        <div class="errtxt" id="hfE" style="grid-column:1/-1"></div>
        <div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="hfC">إلغاء</button><button class="btn pri" id="hfS">${ic('check')} نشر</button></div></form>`);
      $('#hfC').onclick = closeModal;
      const pub = (D.questions || []).filter(q => q.status === 'published');
      /* المستهدفون: قائمة ثابتة وقت الإرسال (باقة أو أفراد)، من متدربي القسم والمقرر باشتراك قائم */
      const tgPicked = new Set(), eligible = () => { const sub = $('#hf-s').value; return (D.trainees || []).map(t => ({ t, subs:(D.subscriptions || []).filter(s => s.trainee_id === t.id && (s.subjects || []).includes(sub) && ['pending', 'active'].includes(subStatus(s))) })).filter(x => x.subs.length); };
      const tgIds = () => { const m = $('#hf-tg').value; const gp = m === 'group' ? (D.groups || []).find(g => g.id === $('#hf-gp').value) : null; return m === 'all' ? null : m === 'group' ? eligible().filter(x => gp?.trainee_ids.includes(x.t.id)).map(x => x.t.id) : m === 'plan' ? eligible().filter(x => x.subs.some(s => s.plan_id === $('#hf-tp').value)).map(x => x.t.id) : eligible().filter(x => tgPicked.has(x.t.id)).map(x => x.t.id); };
      const tgDraw = () => { const m = $('#hf-tg').value, el = eligible(); $('[data-tgp]').hidden = m === 'all'; $('#hfTgPlanF').hidden = m !== 'plan'; $('#hfTgGrpF').hidden = m !== 'group'; $('#hfTgList').hidden = m !== 'pick'; $('#hfTgTools').hidden = m !== 'pick';
        if(m === 'plan'){ const ps = [...new Set(el.flatMap(x => x.subs.map(s => s.plan_id)))], cur = $('#hf-tp').value; $('#hf-tp').innerHTML = ps.map(id => { const p = (D.plans || []).find(y => y.id === id); return `<option value="${id}" ${id === cur ? 'selected' : ''}>${esc(p ? planName(p) : id)}</option>`; }).join(''); }
        if(m === 'pick'){ const tq = $('#hfTgQ').value; $('#hfTgList').innerHTML = el.filter(x => !tq.trim() || matchQ(tq, x.t.full_name)).map(x => `<label class="qp"><input type="checkbox" value="${x.t.id}" ${tgPicked.has(x.t.id) ? 'checked' : ''}><span>${esc(x.t.full_name)}</span></label>`).join('') || '<p class="hint">لا متدربين في هذا المقرر.</p>';
          $$('#hfTgList input').forEach(c => c.onchange = () => { c.checked ? tgPicked.add(c.value) : tgPicked.delete(c.value); tgN(); }); }
        tgN(); };
      const tgN = () => { const ids = tgIds(); $('#hfTgN').textContent = ids ? `سيُرسل إلى ${fmtNum(ids.length)} متدربًا، وتُثبَّت القائمة عند النشر.` : ''; };
      let tgT; $('#hfTgQ').oninput = () => { clearTimeout(tgT); tgT = setTimeout(tgDraw, 200); };
      $('#hfTgAll').onclick = () => { $$('#hfTgList input').forEach(c => tgPicked.add(c.value)); tgDraw(); }; $('#hfTgNone').onclick = () => { tgPicked.clear(); tgDraw(); };
      $('#hf-tg').onchange = tgDraw; $('#hf-tp').onchange = tgN; $('#hf-gp').onchange = tgN; $('#hf-s').addEventListener('change', tgDraw);
      if(HW_PRESET){ const P = HW_PRESET; HW_PRESET = null; $('#hf-t').value = P.title || ''; $('#hf-ty').value = 'practice'; $('#hf-tg').value = 'pick'; P.ids.forEach(id => tgPicked.add(id)); tgDraw(); }
      /* بنّاء الاختبار: أقسام متعددة، سحب عشوائي بعدد مفتوح أو انتقاء يدوي، وترتيب، ومعاينة قبل النشر */
      const chosen = [], qOf = id => pub.find(q => q.id === id), units = new Set();
      const subPool = () => pub.filter(q => q.subject === $('#hf-s').value).sort((a, b) => (a.unit || '').localeCompare(b.unit || '', 'ar') || (a.order || 0) - (b.order || 0));
      const pool = () => subPool().filter(q => !units.size || units.has(q.unit || ''));
      const drawUnits = () => { const us = {}; subPool().forEach(q => us[q.unit || ''] = (us[q.unit || ''] || 0) + 1); [...units].forEach(u => { if(!(u in us)) units.delete(u); });
        $('#hfUnits').innerHTML = Object.keys(us).length ? Object.entries(us).map(([u, n]) => `<label class="chk qb-u"><input type="checkbox" value="${esc(u)}" ${units.has(u) ? 'checked' : ''}> ${esc(u || 'بلا وحدة')} <span class="hint">(${fmtNum(n)})</span></label>`).join('') : '<p class="hint">لا توجد أسئلة منشورة في بنكك لهذا المقرر.</p>';
        $$('#hfUnits input').forEach(c => c.onchange = () => { c.checked ? units.add(c.value) : units.delete(c.value); skills(); }); skills(); };
      const skills = () => { const ks = [...new Set(pool().map(q => q.skill || '').filter(Boolean))], cur = $('#hf-k').value; $('#hf-k').innerHTML = `<option value="">كل المهارات</option>` + ks.map(k => `<option ${k === cur ? 'selected' : ''}>${esc(k)}</option>`).join(''); drawPick(); };
      const drawPick = () => { const k = $('#hf-k').value, qq = $('#hf-q').value, list = pool().filter(q => (!k || (q.skill || '') === k) && (!qq.trim() || matchQ(qq, q.code, q.text, q.unit, q.skill))).slice(0, 150);
        $('#hfPick').innerHTML = list.length ? list.map(q => `<label class="qp"><input type="checkbox" value="${q.id}" ${chosen.includes(q.id) ? 'checked' : ''}><span>${q.code ? `<b dir="ltr">${esc(q.code)}</b>` : ''}<b>${esc(q.unit || '')}${q.skill ? ' · ' + esc(q.skill) : ''}</b>${qStem(q, true)}</span></label>`).join('') : '<p class="hint">لا أسئلة مطابقة.</p>';
        $$('#hfPick input').forEach(c => c.onchange = () => { const i = chosen.indexOf(c.value); c.checked ? i < 0 && chosen.length < 100 && chosen.push(c.value) : i >= 0 && chosen.splice(i, 1); if(c.checked && !chosen.includes(c.value)){ c.checked = false; toast('الحد 100 سؤال'); } count(); }); };
      const short = q => esc((q.text || q.code || 'سؤال مصوَّر').slice(0, 90));
      const count = () => { const by = {}; chosen.forEach(id => { const u = qOf(id)?.unit || ''; by[u] = (by[u] || 0) + 1; });
        $('#hfPn').textContent = chosen.length ? `المختار: ${fmtNum(chosen.length)} سؤالًا من ${fmtNum(Object.keys(by).length)} ${Object.keys(by).length === 1 ? 'قسم' : 'أقسام'} (بهذا الترتيب)` : 'لم تُختر أسئلة بعد';
        $('#hfSel').innerHTML = chosen.map((id, i) => { const q = qOf(id); return `<li><span class="qb-t">${q?.code ? `<b dir="ltr">${esc(q.code)}</b> ` : ''}<span class="hint">${esc(q?.unit || '')}</span> ${q ? short(q) : ''}</span>
          <button type="button" class="btn sm ghost" data-mv="${i}:-1" aria-label="تقديم السؤال ${i + 1}" ${i ? '' : 'disabled'}>▲</button><button type="button" class="btn sm ghost" data-mv="${i}:1" aria-label="تأخير السؤال ${i + 1}" ${i < chosen.length - 1 ? '' : 'disabled'}>▼</button><button type="button" class="btn sm ghost" data-rm="${i}" aria-label="حذف السؤال ${i + 1}">${ic('x')}</button></li>`; }).join('');
        $$('#hfSel [data-mv]').forEach(b => b.onclick = () => { const [i, d] = b.dataset.mv.split(':').map(Number), j = i + d; [chosen[i], chosen[j]] = [chosen[j], chosen[i]]; count(); if(!$('#hfPrev').hidden) preview(); });
        $$('#hfSel [data-rm]').forEach(b => b.onclick = () => { chosen.splice(+b.dataset.rm, 1); count(); drawPick(); if(!$('#hfPrev').hidden) preview(); }); };
      const nWanted = () => { const n = Math.floor(+$('#hf-n').value); return n >= 1 && n <= 100 ? n : 0; };
      const draw = () => { const n = nWanted(); if(!n){ toast('عدد الأسئلة من 1 إلى 100'); return false; } const src = pool(); if(!src.length){ toast('لا توجد أسئلة منشورة في الأقسام المحددة'); return false; }
        /* توزيع متوازن على الأقسام المحددة ثم خلط داخل كل قسم */
        const by = {}; src.forEach(q => (by[q.unit || ''] = by[q.unit || ''] || []).push(q)); Object.values(by).forEach(l => l.sort(() => Math.random() - .5));
        const out = [], keys = Object.keys(by); while(out.length < Math.min(n, src.length)) for(const k of keys){ const q = by[k].shift(); if(q && out.length < n) out.push(q.id); }
        chosen.splice(0, chosen.length, ...out); count(); drawPick(); if(out.length < n) toast(`المتاح ${fmtNum(out.length)} سؤالًا فقط`); return true; };
      let pvMode = 't';
      const preview = () => { const qs = chosen.map(qOf).filter(Boolean);
        $('#hfPrevB').innerHTML = qs.length ? `<ol class="qres qb-pv">${qs.map(q => `<li>${pvMode === 't' ? `<p class="hint" style="margin:0 0 4px">${q.code ? `<span dir="ltr">${esc(q.code)}</span> · ` : ''}${esc(q.unit || '')}${q.skill ? ' · ' + esc(q.skill) : ''}</p>` : ''}${qStem(q)}
          <ul class="qb-opts">${(q.options || []).map((o, i) => `<li class="${pvMode === 't' && i === q.correct ? 'ok' : ''}">${pvMode === 't' && i === q.correct ? ic('check') : '<span class="qb-dot" aria-hidden="true"></span>'} ${esc(o)}</li>`).join('')}</ul>
          ${pvMode === 't' && q.explanation ? `<p class="hint">${esc(q.explanation)}</p>` : ''}</li>`).join('')}</ol>${pvMode === 's' ? `<p class="hint">يرى المتدرب الأسئلة بعد ضغط «ابدأ الآن» فقط، ومدته ${fmtNum(qs.length * 2)} دقيقة، دون الإجابات الصحيحة.</p>` : ''}` : '<p class="hint">اختر أسئلة أو اسحبها عشوائيًا أولًا.</p>'; };
      $('#hfPv').onclick = () => { if(!chosen.length && !draw()) return; $('#hfPrev').hidden = false; preview(); $('#hfPrev').scrollIntoView({ block:'nearest' }); };
      $$('#hfPrev [data-pv]').forEach(b => b.onclick = () => { pvMode = b.dataset.pv; $$('#hfPrev [data-pv]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); preview(); });
      $('#hfDraw').onclick = () => { if(draw() && !$('#hfPrev').hidden) preview(); };
      $('#hfClr').onclick = () => { chosen.length = 0; count(); drawPick(); $('#hfPrev').hidden = true; };
      $('#hf-k').onchange = drawPick; let qT; $('#hf-q').oninput = () => { clearTimeout(qT); qT = setTimeout(drawPick, 200); };
      const kind = () => { const q = $('#hf [name=kind]:checked').value === 'quiz'; $$('[data-qk]').forEach(x => x.hidden = !q); if(q) drawUnits(); };
      $$('#hf [name=kind]').forEach(r => r.onchange = kind); $('#hf-s').addEventListener('change', () => { chosen.length = 0; count(); if(!$('[data-qk]').hidden) drawUnits(); });
      $('#hf').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), b = $('#hfS'); { const ids = tgIds(); if(ids){ if(!ids.length){ $('#hfE').textContent = 'اختر متدربًا واحدًا على الأقل'; return; } f.targets = ids; f.target_label = $('#hf-tg').value === 'plan' ? $('#hf-tp').selectedOptions[0]?.textContent || '' : $('#hf-tg').value === 'group' ? 'مجموعة: ' + ((D.groups || []).find(g => g.id === $('#hf-gp').value)?.name || '') : `${fmtNum(ids.length)} متدربًا بعينهم`; } }
        if(f.kind === 'quiz'){ if(!chosen.length && !draw()){ $('#hfE').textContent = 'اختر الأسئلة أو حدّد عددًا صحيحًا من 1 إلى 100'; return; } f.question_ids = chosen.slice(); f.count = chosen.length; delete f.unit; } setBusy(b, true, 'جارٍ النشر');
        try { await Store.saveAssignment(f); closeModal(); toast('نُشر الواجب'); reload(); } catch(x){ setBusy(b, false); $('#hfE').textContent = x.message; } }; };
    /* مراجعة إجابات المتدرب في الاختبار: إجابته والصحيح لكل سؤال، وملاحظة لكل سؤال وملاحظة عامة (لا تغيّر الدرجة) */
    $$('[data-fb]').forEach(b => b.onclick = () => { const s = D.submissions.find(x => x.id === b.dataset.fb), a = D.assignments.find(x => x.id === s.assignment_id), cm = s.comments || {};
      const right = (a.quiz || []).filter(q => s.answers?.[q.id] === q.correct).length;
      modal(`<h3>مراجعة: ${esc(D.trainees.find(t => t.id === s.trainee_id)?.full_name || '')}</h3><p class="hint" style="margin:-4px 0 10px">${esc(a.title)} · صحيح ${fmtNum(right)} من ${fmtNum((a.quiz || []).length)} · الدرجة ${fmtNum(s.score ?? 0)} من ${fmtNum(a.max_score)}</p>
        <form id="fbf" novalidate><ol class="qres">${(a.quiz || []).map(q => { const mine = s.answers?.[q.id];
          return `<li class="${mine === q.correct ? 'ok' : 'bad'}">${qStem(q)}<p><b>إجابته:</b> ${mine == null ? 'لم يُجب' : esc(q.options[mine] ?? '')}${mine !== q.correct ? ` · <b>الصحيح:</b> ${esc(q.options[q.correct] ?? '')}` : ''}</p>
            <label class="hint" for="fbq-${q.id}">ملاحظتك على هذا السؤال</label><textarea class="inp fb-in" id="fbq-${q.id}" data-fq="${q.id}" rows="2" maxlength="500">${esc(cm[q.id] || '')}</textarea></li>`; }).join('')}</ol>
        <div class="field"><label for="fb-n">ملاحظة عامة للمتدرب</label><textarea class="inp" id="fb-n" rows="3" maxlength="1000" style="padding:10px 14px">${esc(s.teacher_note || '')}</textarea></div>
        <p class="hint">يرى المتدرب ملاحظاتك في واجبه. الدرجة الآلية لا تتغير.</p><div class="errtxt" id="fbE" role="alert"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="fbC">إلغاء</button><button class="btn pri" id="fbS">${ic('send')} حفظ وإرسال الملاحظات</button></div></form>`);
      $('#fbC').onclick = closeModal;
      $('#fbf').onsubmit = async e => { e.preventDefault(); const bb = $('#fbS'), comments = Object.fromEntries($$('#fbf [data-fq]').map(t => [t.dataset.fq, t.value]).filter(([, v]) => v.trim())); setBusy(bb, true, 'جارٍ الحفظ');
        try { await Store.commentSubmission(s.id, { note:$('#fb-n').value, comments }); closeModal(); toast('أُرسلت ملاحظاتك للمتدرب'); reload(); } catch(x){ setBusy(bb, false); $('#fbE').textContent = x.message; } }; });
    $$('[data-gr]').forEach(b => b.onclick = () => { const s = D.submissions.find(x => x.id === b.dataset.gr), a = D.assignments.find(x => x.id === s.assignment_id);
      modal(`<h3>تصحيح: ${esc(D.trainees.find(t => t.id === s.trainee_id)?.full_name || '')}</h3><p class="hw-ans">${esc(s.answer || '')}</p><form id="gf2" class="grid g2" novalidate>
        <div class="field"><label for="g-s">الدرجة من ${fmtNum(a.max_score)}</label><input class="inp num" id="g-s" name="score" type="number" min="0" max="${a.max_score}" value="${s.score ?? ''}"></div>
        <div class="field"><label for="g-st">النتيجة</label><select class="inp" id="g-st" name="status"><option value="graded">مكتمل ومصحح</option><option value="needs_revision" ${s.status === 'needs_revision' ? 'selected' : ''}>يحتاج تعديلًا</option></select></div>
        <div class="field" style="grid-column:1/-1"><label for="g-f">ملاحظات للمتدرب</label><textarea class="inp" id="g-f" name="feedback" rows="3" style="padding:10px 14px">${esc(s.feedback || '')}</textarea></div>
        <div class="errtxt" id="gE" style="grid-column:1/-1"></div><div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="gC">إلغاء</button><button class="btn pri" id="gS">${ic('check')} حفظ</button></div></form>`);
      $('#gC').onclick = closeModal; $('#gf2').onsubmit = async e => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.target)), bb = $('#gS'); setBusy(bb, true, 'جارٍ الحفظ');
        try { await Store.gradeSubmission(s.id, f); closeModal(); toast('حُفظ التصحيح'); reload(); } catch(x){ setBusy(bb, false); $('#gE').textContent = x.message; } }; }); } };
}

export function teacherBank(D, reload){ setBankAssets(D.bank_assets);
  const me = D.me, qsAll = (D.questions || []).slice().sort((a, b) => (a.subject + a.unit).localeCompare(b.subject + b.unit, 'ar') || (a.order || 0) - (b.order || 0)), qs = qsAll.slice(0, 150);
  const att = (D.attempts || []).slice().sort((a, b) => b.submitted_at.localeCompare(a.submitted_at)).slice(0, 30);
  return { html:`<div class="card pad rv"><div style="display:flex;justify-content:space-between;gap:8px;margin-bottom:10px"><h3 class="ctitle">${ic('database')}بنك أسئلتي <span class="pill g">${fmtNum(qs.length)}</span> <span class="hint">${SECTIONS[secOf(me)]} · ${esc(me.subjects.join('، '))}</span></h3><button class="btn pri sm" id="qAdd2">${ic('plus')} سؤال</button></div>
      ${qs.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>المقرر</th><th>الوحدة</th><th>السؤال</th><th>الحالة</th><th></th></tr></thead><tbody>${qs.map(q => `<tr><td>${esc(q.subject)}</td><td>${esc(q.unit)}</td><td style="max-width:380px">${qStem(q, true)}${q.shared ? ` <span class="pill info">بنك مشترك</span> <span class="pill ${q.key_status === 'approved' ? 'ok' : 'warn'}">${KEY_ST[q.key_status] || KEY_ST.unverified}</span>` : ''}</td>
        <td><span class="pill dot ${q.status === 'published' ? 'ok' : 'g'}">${q.status === 'published' ? 'منشور' : 'مسودة'}</span></td><td style="white-space:nowrap">${q.shared ? '<span class="hint">تديره الإدارة</span>' : `<button class="btn sm" data-qe="${q.id}" aria-label="تعديل">${ic('edit')}</button> <button class="btn sm" data-qp="${q.id}">${q.status === 'published' ? 'إيقاف' : 'نشر'}</button>`}</td></tr>`).join('')}</tbody></table></div>` : emptyBox('البنك فارغ')}</div>
    <div class="card pad rv" style="margin-top:16px"><h3 class="ctitle">${ic('chart')}نتائج قياس المستوى لمتدربيّ</h3>${att.length ? `<div class="tblwrap"><table class="tb"><thead><tr><th>المتدرب</th><th>المقرر</th><th>الوحدة</th><th>الدرجة</th><th>التاريخ</th></tr></thead><tbody>${att.map(a => `<tr><td>${esc(D.trainees.find(t => t.id === a.trainee_id)?.full_name || '')}</td><td>${esc(a.subject)}</td><td>${esc(a.unit || '')}</td><td class="num">${fmtNum(a.score)} / ${fmtNum(a.total)}</td><td>${fmtShort(a.submitted_at.slice(0, 10))}</td></tr>`).join('')}</tbody></table></div>` : '<p class="hint">لا توجد محاولات بعد.</p>'}</div>`,
  bind(){ const edit = q => questionModal({ q, subjects:me.subjects, save:o => Store.saveQuestion(o), done:reload });
    $('#qAdd2').onclick = () => edit(null);
    $$('[data-qe]').forEach(b => b.onclick = () => edit(D.questions.find(q => q.id === b.dataset.qe)));
    $$('[data-qp]').forEach(b => b.onclick = async () => { const q = D.questions.find(x => x.id === b.dataset.qp); await Store.setQuestionStatus(q.id, q.status === 'published' ? 'draft' : 'published'); reload(); }); } };
}

/* نموذج سؤال مشترك بين بنك المدرب وصفحة بنوك الأسئلة في الإدارة */
export function questionModal({ q, subjects, save, done, title }){
  modal(`<h3>${title || (q ? 'تعديل سؤال' : 'سؤال جديد')}</h3><form id="qf" class="grid g2" novalidate>
    <div class="field"><label for="qf-s">المقرر</label><select class="inp" id="qf-s" name="subject">${subjects.map(s => `<option ${q?.subject === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
    <div class="field"><label for="qf-u">الوحدة</label><input class="inp" id="qf-u" name="unit" value="${esc(q?.unit || '')}" placeholder="عام"></div>
    <div class="field" style="grid-column:1/-1"><label for="qf-t">نص السؤال</label><textarea class="inp" id="qf-t" name="text" rows="2" style="padding:10px 14px">${esc(q?.text || '')}</textarea></div>
    ${[0, 1, 2, 3].map(i => `<div class="field"><label class="opt"><input type="radio" name="correct" value="${i}" ${q?.correct === i ? 'checked' : ''}> الخيار ${'أبجد'[i]} (الصحيح)</label><input class="inp" name="o${i}" value="${esc(q?.options?.[i] || '')}" aria-label="الخيار ${'أبجد'[i]}"></div>`).join('')}
    <div class="field"><label for="qf-c">مهارة قياس</label><select class="inp" id="qf-c" name="category"></select></div>
    <div class="field"><label for="qf-k">الموضوع (اختياري)</label><input class="inp" id="qf-k" name="skill" value="${esc(q?.skill || '')}"></div>
    <div class="field"><label for="qf-d">الصعوبة</label><select class="inp" id="qf-d" name="difficulty">${['سهل', 'متوسط', 'صعب'].map(x => `<option ${(q?.difficulty || 'متوسط') === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div>
    <div class="field"><label for="qf-st">الحالة</label><select class="inp" id="qf-st" name="status"><option value="published">منشور</option><option value="draft" ${q?.status === 'draft' ? 'selected' : ''}>مسودة</option></select></div>
    <div class="field"><label for="qf-e">التفسير (يظهر بعد التسليم)</label><input class="inp" id="qf-e" name="explanation" value="${esc(q?.explanation || '')}"></div>
    <p class="hint" style="grid-column:1/-1;margin:0">تعديل سؤال لا يغيّر نتائج محاولات أو واجبات سابقة؛ كل منها يحفظ نسخة أسئلته.</p>
    <div class="errtxt" id="qfE" style="grid-column:1/-1" aria-live="polite"></div><div style="grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end"><button type="button" class="btn" id="qfC">إلغاء</button><button class="btn pri" id="qfS">${ic('check')} حفظ</button></div></form>`);
  const cats = () => { const sub = $('#qf-s').value, cur = $('#qf-c').value || q?.category || ''; $('#qf-c').innerHTML = `<option value="">غير مصنّف</option>${(CATEGORIES[sub] || []).map(c => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('')}`; };
  cats(); $('#qf-s').addEventListener('change', cats);
  $('#qfC').onclick = closeModal; $('#qf').onsubmit = async e => { e.preventDefault(); const fd = new FormData(e.target), b = $('#qfS');
    const o = { id:q?.id, subject:fd.get('subject'), unit:fd.get('unit'), text:fd.get('text'), options:[0, 1, 2, 3].map(i => fd.get('o' + i)), correct:fd.get('correct') == null ? -1 : +fd.get('correct'), skill:fd.get('skill'), category:fd.get('category') || '', difficulty:fd.get('difficulty'), status:fd.get('status'), explanation:fd.get('explanation') };
    setBusy(b, true, 'جارٍ الحفظ'); try { await save(o); closeModal(); toast('حُفظ السؤال'); done(); } catch(x){ setBusy(b, false); $('#qfE').textContent = x.message; } };
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
