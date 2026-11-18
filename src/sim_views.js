/* =====================================================================
   محاكي الاختبار (الخطوة AQ): بطاقة البدء في «قياس مستواي»، وشاشة الاختبار
   الكاملة (سؤال في كل صفحة، خريطة الأسئلة، تعليم للمراجعة، حفظ أولًا بأول)،
   ونافذة النتيجة (مؤشر الجاهزية، الأقسام، المهارات، المراجعة).
   ===================================================================== */
import { $, $$, esc, fmtNum, fmtShort } from './utils.js';
import { ic, toast, ringSvg } from './views2_head.js';
import { Store } from './data2.js';
import { modal, closeModal } from './views2_programs.js';
import { setBusy } from './features.js';
import { assetUrl } from './learning_logic.js';
import { bankAttr } from './bank_media.js';
import { qStem, getBankAssets } from './learning_views.js';
import { simSubjects, simOpen, simExpired, simSet, simMinutes, simsToday, SIM_DAILY_MAX, pct, readyOf, sortSubjects, SIM_GRACE_SEC, UNCAT } from './sim_logic.js';
import { liveSubsOf } from './learning_logic.js';

const LET = ['أ', 'ب', 'ج', 'د'];
const toneVar = t => ({ ok:'success', info:'info', warn:'warning', bad:'danger' })[t] || 'brand';
const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/* بطاقة المحاكي */
export function simCard(D, tr){
  const subs = liveSubsOf(D, tr.id), list = simSubjects(D, tr.id, subs), S = simSet(D.settings);
  const open = (D.attempts || []).find(a => a.trainee_id === tr.id && a.kind === 'sim' && !a.submitted_at), used = simsToday(D, tr.id);
  const avail = list.filter(x => x.ok);
  let body;
  if(open && simOpen(open)) body = `<div class="alert t-gold"><span class="aic">${ic('timer')}</span><div><b>لديك محاكٍ لم يُسلَّم</b><div class="hint">${esc(open.focus || '')} · يتبقى <b class="num" data-simleft="${esc(open.deadline)}">${clock(Date.parse(open.deadline) - Date.now())}</b> · إجاباتك محفوظة</div></div></div>
      <button class="btn pri" id="simResume" data-sim="${open.id}">${ic('next')} أكمل المحاكي</button>`;
  else if(!avail.length) body = `<p class="hint">${subs.length ? 'لا توجد أسئلة كافية في بنك مقرراتك للمحاكي بعد.' : 'يُتاح المحاكي لمشتركي باقات القدرات والتحصيلي.'}</p>`;
  else body = `<form id="simF" novalidate><fieldset class="sim-pick"><legend class="hint">اختر أقسام المحاكي</legend>
      ${avail.map(x => `<label class="chk sim-sub"><input type="checkbox" name="sub" value="${esc(x.subject)}" checked><span><b>${esc(x.subject)}</b><small>${fmtNum(Math.min(S.sim_per_subject, x.count))} سؤالًا</small></span></label>`).join('')}</fieldset>
      <p class="sim-meta" id="simMeta" aria-live="polite"></p>
      <button class="btn pri" id="simGo" ${used >= SIM_DAILY_MAX ? 'disabled' : ''}>${ic('timer')} ابدأ المحاكي</button>
      <p class="hint" style="margin:8px 0 0">${used >= SIM_DAILY_MAX ? `وصلت الحد اليومي (${fmtNum(SIM_DAILY_MAX)} محاولات). عد غدًا.` : `يبدأ الوقت عند الضغط ولا يتوقف إن خرجت، وعند انتهائه يُسلَّم ما أجبت عنه. تُقدَّم لك أسئلة لم تحلها من قبل أولًا. بقي لك اليوم ${fmtNum(SIM_DAILY_MAX - used)}.`}</p></form>`;
  return `<div class="card pad rv sim-card"><div class="sim-card-h"><span class="sim-badge">${ic('timer')}</span><div><h3 class="ctitle" style="margin:0">محاكي الاختبار</h3>
      <p class="hint" style="margin:2px 0 0">اختبار كامل موقوت بأقسام القدرات، يُصحَّح فورًا ويعطيك مؤشر جاهزيتك ونقاط ضعفك.</p></div></div>${body}</div>`;
}
export function bindSimCard(D, tr, reload){
  const S = simSet(D.settings), meta = () => { const n = $$('#simF [name=sub]:checked').map(x => Math.min(S.sim_per_subject, simSubjects(D, tr.id, liveSubsOf(D, tr.id)).find(y => y.subject === x.value)?.count || 0)).reduce((a, b) => a + b, 0);
    const m = $('#simMeta'); if(m) m.innerHTML = n ? `<b class="num">${fmtNum(n)}</b> سؤالًا · <b class="num">${fmtNum(simMinutes(n, D.settings))}</b> دقيقة` : 'اختر قسمًا واحدًا على الأقل'; const g = $('#simGo'); if(g && !g.dataset.lock) g.disabled = !n; };
  if($('#simF')){ if($('#simGo').disabled) $('#simGo').dataset.lock = '1'; meta(); $$('#simF [name=sub]').forEach(x => x.onchange = meta);
    $('#simF').onsubmit = e => { e.preventDefault(); const subjects = $$('#simF [name=sub]:checked').map(x => x.value); if(!subjects.length) return;
      const n = $('#simMeta').textContent;
      modal(`<h3>بدء المحاكي</h3><p>${esc(sortSubjects(subjects).join(' ثم '))} · ${esc(n)}</p>
        <ul class="hint sim-rules"><li>يبدأ الوقت الآن ولا يتوقف حتى لو أغلقت الصفحة.</li><li>تُحفظ إجاباتك أولًا بأول، ويمكنك العودة لأي سؤال قبل التسليم.</li><li>عند انتهاء الوقت يُسلَّم ما أجبت عنه تلقائيًا.</li></ul>
        <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="smC">ليس الآن</button><button class="btn pri" id="smGo">${ic('timer')} ابدأ</button></div>`);
      $('#smC').onclick = closeModal;
      $('#smGo').onclick = async ev => { setBusy(ev.currentTarget, true, 'جارٍ تجهيز الأسئلة');
        try { const at = await Store.startSim({ trainee_id:tr.id, subjects }); closeModal(); runSim(at, reload); } catch(x){ closeModal(); toast(x.message); } }; }; }
  const r = $('#simResume'); if(r) r.onclick = async () => { setBusy(r, true, ''); try { runSim(await Store.startSim({ trainee_id:tr.id, subjects:[] }), reload); } catch(x){ setBusy(r, false); toast(x.message); } };
  const left = $('[data-simleft]'); if(left){ const t = setInterval(() => { if(!document.body.contains(left)){ clearInterval(t); return; } const ms = Date.parse(left.dataset.simleft) - Date.now(); left.textContent = clock(ms); if(ms < -SIM_GRACE_SEC * 1000){ clearInterval(t); reload(); } }, 1000); }
  // محاكٍ انتهى وقته ولم يُسلَّم: يُصحَّح بما حُفظ
  const exp = (D.attempts || []).find(a => a.trainee_id === tr.id && simExpired(a));
  if(exp) Store.finishAttempt({ attempt_id:exp.id, answers:{} }).then(() => reload()).catch(() => {});
}

/* شاشة الاختبار */
export function runSim(at, reload){
  const key = 'sama_sim_' + at.id, qs = at.snapshot, N = qs.length;
  let local = {}; try { local = JSON.parse(localStorage.getItem(key) || '{}'); } catch(_){}
  const ans = { ...(at.answers || {}), ...(local.ans || {}) }, flags = new Set(local.flags || []);
  let i = Math.min(N - 1, Math.max(0, local.i || 0)), dirty = {}, saveT = null, done = false;
  const secs = sortSubjects(qs.map(q => q.subject)), secOf = k => secs.indexOf(qs[k].subject);
  document.getElementById('simRoot')?.remove();
  const root = document.createElement('div'); root.id = 'simRoot'; root.className = 'sim'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'محاكي الاختبار');
  document.body.appendChild(root); document.body.classList.add('sim-on');
  const persist = () => { try { localStorage.setItem(key, JSON.stringify({ ans, flags:[...flags], i })); } catch(_){} };
  const flush = async () => { clearTimeout(saveT); const d = dirty; dirty = {}; if(!Object.keys(d).length) return;
    try { await Store.saveAttemptAnswers({ attempt_id:at.id, answers:d }); $('#simSave') && ($('#simSave').textContent = 'محفوظ'); }
    catch(x){ Object.assign(dirty, d, dirty); const s = $('#simSave'); if(s) s.textContent = /انتهى|سُلّمت/.test(x.message) ? x.message : 'تعذّر الحفظ، سيُعاد'; } };
  const queue = () => { const s = $('#simSave'); if(s) s.textContent = 'جارٍ الحفظ…'; clearTimeout(saveT); saveT = setTimeout(flush, 700); };
  const answered = () => qs.filter(q => ans[q.id] != null).length;
  const stem = q => { const pg = q.page_image ? assetUrl(q.page_image, getBankAssets()) : '';
    return `${pg ? `<details class="sim-pg" open><summary>${ic('book')} نص القطعة</summary><img ${bankAttr(q.page_image, getBankAssets())} alt="صفحة القطعة" loading="lazy"></details>` : ''}${q.image ? qStem({ ...q, page_image:'' }) : `<p class="sim-text">${esc(q.text)}</p>`}`; };
  const paint = () => {
    const q = qs[i], s = secOf(i), inSec = qs.filter(x => x.subject === q.subject), k = inSec.indexOf(q) + 1;
    root.innerHTML = `<header class="sim-h"><div class="sim-h-a"><b>محاكي الاختبار</b><span class="pill info">${esc(q.subject)} · القسم ${fmtNum(s + 1)} من ${fmtNum(secs.length)}</span></div>
        <div class="sim-h-b"><span class="sim-t" role="timer" aria-live="off">${ic('timer')} <b id="simT" class="num">—</b></span><span class="hint" id="simSave" aria-live="polite">${Object.keys(dirty).length ? 'جارٍ الحفظ…' : 'محفوظ'}</span>
        <button class="btn sm" id="simMapB" aria-expanded="false">${ic('grid')} الأسئلة <span class="num">${fmtNum(answered())}/${fmtNum(N)}</span></button><button class="btn sm" id="simOut">خروج مؤقت</button></div></header>
      <div class="sim-prog" aria-hidden="true"><i style="width:${pct(answered(), N)}%"></i></div>
      <main class="sim-b"><div class="sim-q"><div class="sim-qh"><b>السؤال ${fmtNum(k)} من ${fmtNum(inSec.length)}</b><span class="hint">${fmtNum(i + 1)} / ${fmtNum(N)}</span>
          <button class="btn sm ${flags.has(q.id) ? 'warn' : ''}" id="simFlag" aria-pressed="${flags.has(q.id)}">${ic('flag')} ${flags.has(q.id) ? 'معلَّم للمراجعة' : 'علّم للمراجعة'}</button></div>
        <div class="sim-stem">${stem(q)}</div>
        <div class="sim-opts" role="radiogroup" aria-label="الخيارات">${q.options.map((o, j) => `<label class="sim-opt ${ans[q.id] === j ? 'on' : ''}"><input type="radio" name="simo" value="${j}" ${ans[q.id] === j ? 'checked' : ''}><b>${LET[j]}</b><span>${q.image && o === LET[j] ? '' : esc(o)}</span></label>`).join('')}</div>
        ${ans[q.id] != null ? `<button class="linkbtn" id="simClr">مسح الإجابة</button>` : ''}</div></main>
      <footer class="sim-f"><button class="btn" id="simPrev" ${i === 0 ? 'disabled' : ''}>${ic('prev')} السابق</button>
        ${i < N - 1 ? `<button class="btn pri" id="simNext">التالي ${ic('next')}</button>` : `<button class="btn pri" id="simEnd">${ic('check')} تسليم المحاكي</button>`}</footer>
      <aside class="sim-map" id="simMap" hidden><div class="sim-map-h"><b>خريطة الأسئلة</b><button class="btn sm" id="simMapX" aria-label="إغلاق">×</button></div>
        ${secs.map(sub => `<div class="sim-map-s"><h4>${esc(sub)}</h4><div class="sim-grid">${qs.map((x, j) => x.subject !== sub ? '' : `<button class="sim-n ${ans[x.id] != null ? 'a' : ''} ${flags.has(x.id) ? 'f' : ''} ${j === i ? 'c' : ''}" data-go="${j}" aria-label="السؤال ${j + 1}${ans[x.id] != null ? '، مُجاب' : ''}${flags.has(x.id) ? '، معلَّم' : ''}">${fmtNum(qs.filter(y => y.subject === sub).indexOf(x) + 1)}</button>`).join('')}</div></div>`).join('')}
        <p class="hint sim-legend"><span class="sim-n a">١</span> مُجاب <span class="sim-n f">١</span> معلَّم <span class="sim-n">١</span> لم يُجب</p>
        <button class="btn pri" id="simEnd2" style="width:100%">${ic('check')} تسليم المحاكي</button></aside>`;
    $$('#simRoot [name=simo]').forEach(r => r.onchange = () => { ans[q.id] = +r.value; dirty[q.id] = +r.value; persist(); queue(); paint(); });
    $('#simClr') && ($('#simClr').onclick = () => { ans[q.id] = null; dirty[q.id] = null; persist(); queue(); paint(); });
    $('#simFlag').onclick = () => { flags.has(q.id) ? flags.delete(q.id) : flags.add(q.id); persist(); paint(); };
    $('#simPrev').onclick = () => go(i - 1); $('#simNext') && ($('#simNext').onclick = () => go(i + 1));
    const map = $('#simMap'), mb = $('#simMapB'); mb.onclick = () => { map.hidden = !map.hidden; mb.setAttribute('aria-expanded', String(!map.hidden)); }; $('#simMapX').onclick = () => { map.hidden = true; mb.setAttribute('aria-expanded', 'false'); };
    $$('#simRoot [data-go]').forEach(b => b.onclick = () => go(+b.dataset.go));
    [$('#simEnd'), $('#simEnd2')].forEach(b => b && (b.onclick = confirmEnd));
    $('#simOut').onclick = async () => { await flush(); close(); toast('خرجت مؤقتًا، والوقت مستمر. ارجع من «قياس مستواي».'); reload(); };
    tickNow(); };
  const go = k => { i = Math.max(0, Math.min(N - 1, k)); persist(); paint(); root.querySelector('.sim-b')?.scrollTo?.(0, 0); };
  const close = () => { clearInterval(tick); root.remove(); document.body.classList.remove('sim-on'); };
  const finish = async () => { if(done) return; done = true; clearInterval(tick); await flush().catch(() => {});
    try { const r = await Store.finishAttempt({ attempt_id:at.id, answers:ans }); try { localStorage.removeItem(key); } catch(_){} close(); simResult(r, reload); }
    catch(x){ done = false; toast(x.message); } };
  const confirmEnd = () => { const left = N - answered(), fl = qs.filter(q => flags.has(q.id)).length;
    modal(`<h3>تسليم المحاكي</h3><p>أجبت عن <b class="num">${fmtNum(answered())}</b> من <b class="num">${fmtNum(N)}</b>.${left ? ` بقي <b class="num">${fmtNum(left)}</b> بلا إجابة.` : ''}${fl ? ` ولديك <b class="num">${fmtNum(fl)}</b> معلَّمة للمراجعة.` : ''}</p>
      <p class="hint">بعد التسليم تظهر النتيجة والإجابات الصحيحة ولا يمكن التعديل.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="seC">متابعة الحل</button><button class="btn pri" id="seGo">${ic('check')} سلّم الآن</button></div>`);
    $('#seC').onclick = closeModal; $('#seGo').onclick = ev => { setBusy(ev.currentTarget, true, 'جارٍ التصحيح'); closeModal(); finish(); }; };
  const tickNow = () => { const el = $('#simT'); if(!el) return; const ms = Date.parse(at.deadline) - Date.now(); el.textContent = clock(ms);
    el.parentElement.classList.toggle('low', ms < 5 * 60000); if(ms <= 0) finish(); };
  const tick = setInterval(tickNow, 1000);
  paint();
}

/* نافذة النتيجة */
export function simResult(r, reload){
  const p = pct(r.score, r.total), [, tone, label] = readyOf(p), isSim = r.kind === 'sim';
  const bars = o => Object.entries(o || {}).sort((a, b) => pct(a[1].right, a[1].total) - pct(b[1].right, b[1].total))
    .map(([k, v]) => `<div><span>${esc(k)}</span><div class="tbar"><i style="width:${pct(v.right, v.total)}%"></i></div><b class="num">${fmtNum(pct(v.right, v.total))}٪</b></div>`).join('');
  modal(`<div class="sim-res"><div class="sim-res-h">${ringSvg(p, 96, 9, toneVar(tone))}<div><span class="hint">${isSim ? 'مؤشر الجاهزية' : `${fmtNum(p)}٪ · ${esc(label)}`}</span><h3 style="margin:0">${isSim ? `${fmtNum(p)}٪ · ${esc(label)}` : `النتيجة: ${fmtNum(r.score)} من ${fmtNum(r.total)}`}</h3>
      <p class="hint" style="margin:2px 0 0">${fmtNum(r.score)} إجابة صحيحة من ${fmtNum(r.total)}${r.focus ? ` · ${esc(r.focus)}` : ''} · ${fmtShort(String(r.submitted_at).slice(0, 10))}</p></div></div>
    ${isSim ? '<p class="hint sim-note">مؤشر تدريبي من بنك المركز وليس درجة قياس الرسمية.</p>' : ''}
    ${r.parts && Object.keys(r.parts).length > 1 ? `<h4 class="sim-h4">الأقسام</h4><div class="skills">${bars(r.parts)}</div>` : ''}
    ${r.skills ? `<h4 class="sim-h4">المهارات (من الأضعف)</h4><div class="skills">${bars(r.skills)}</div>${r.skills[UNCAT] ? '<p class="hint">«غير مصنّف»: أسئلة لم تُصنَّف مهارتها في البنك بعد.</p>' : ''}` : ''}
    <details class="sim-rev" ${isSim ? '' : 'open'}><summary>مراجعة الإجابات (${fmtNum(r.total)})</summary><ol class="qres">${r.snapshot.map(q => { const a = r.answers?.[q.id];
      return `<li class="${a === q.correct ? 'ok' : 'bad'}"><span class="hint">${esc(q.subject || '')}${q.category ? ' · ' + esc(q.category) : ''}</span>${qStem(q)}<p><b>الصحيح:</b> ${LET[q.correct]}${q.options[q.correct] !== LET[q.correct] ? ' ' + esc(q.options[q.correct]) : ''}${a == null ? ' · <b>لم تُجب</b>' : a !== q.correct ? ` · <b>إجابتك:</b> ${LET[a]}` : ''}</p>${q.explanation ? `<p class="hint">${esc(q.explanation)}</p>` : ''}</li>`; }).join('')}</ol></details>
    <div style="text-align:end;margin-top:12px"><button class="btn pri" id="${isSim ? 'srX' : 'atX'}">إغلاق</button></div></div>`);
  $(isSim ? '#srX' : '#atX').onclick = () => { closeModal(); reload && reload(); };
}
