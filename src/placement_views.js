/* =====================================================================
   اختبار تحديد المستوى (الخطوة BH): صفحة #placement العامة — اختيار النوع،
   ثم الاختبار (سؤال في كل صفحة، مؤقت، يُستأنف بعد التحديث من sessionStorage)،
   ثم النتيجة: مؤشر الجاهزية، الأقسام، المهارات، والباقة المقترحة مع التسجيل.
   لا بيانات شخصية؛ الإجابات الصحيحة لا تصل إلى المتصفح، والتصحيح في الخادم.
   ===================================================================== */
import { $, $$, esc, fmtNum, uid } from './utils.js';
import { ic, toast, ringSvg, emptyBox } from './views2_head.js';
import { Store } from './data2.js';
import { modal, closeModal } from './views2_programs.js';
import { bankAttr } from './bank_media.js';
import { readyOf, pct, UNCAT } from './sim_logic.js';
import { PL_KINDS, PL_TIER_TXT, plCount, plWaText } from './placement_logic.js';
import { waLink } from './landing.js';

const LET = ['أ', 'ب', 'ج', 'د'];
const KEY = 'sama_pl_run', LAST = 'sama_pl_last';
/* آخر نتيجة على هذا الجهاز: تُرسل مع التسجيل في باقة لتُربط بملف المتدرب (100 يوم) */
export function plLinkFields(){ try { const x = JSON.parse(localStorage.getItem(LAST) || 'null'); return x && x.id && x.at > Date.now() - 100 * 864e5 ? { placement_id:x.id, placement_session:plSession() } : {}; } catch(_){ return {}; } }
export function plLinkDone(){ try { localStorage.removeItem(LAST); } catch(_){} }
const toneVar = t => ({ ok:'success', info:'info', warn:'warning', bad:'danger' })[t] || 'brand';
const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
export function plSession(){ try { let s = localStorage.getItem('sama_pl_sid'); if(!s){ s = uid().replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32) || String(Date.now()); localStorage.setItem('sama_pl_sid', s); } return s; } catch(_){ return 'pl' + Date.now(); } }
const readRun = () => { try { const r = JSON.parse(sessionStorage.getItem(KEY) || 'null'); return r && Date.parse(r.deadline) + 60000 > Date.now() ? r : null; } catch(_){ return null; } };
const saveRun = r => { try { r ? sessionStorage.setItem(KEY, JSON.stringify(r)) : sessionStorage.removeItem(KEY); } catch(_){} };

export async function viewPlacement(){
  const app = $('#app'), run = readRun();
  if(run) return runner(run);
  let st; try { st = await Store.placementStatus(); } catch(_){ st = { enabled:false }; }
  const card = k => { const K = PL_KINDS[k], ok = st.enabled && st[k];
    return `<div class="card pad pl-kind rv"><h3 class="ctitle">${ic(k === 'qudurat' ? 'target' : 'book')}${esc(K.title)}</h3>
      <p class="hint" style="margin:0 0 12px">${Object.entries(K.parts).map(([s, n]) => `${fmtNum(n)} ${esc(s)}`).join(' و')} · ${fmtNum(st.minutes?.[k] || plCount(k))} دقيقة</p>
      ${ok ? `<button class="btn pri" data-plgo="${k}">${ic('timer')} ابدأ الاختبار</button>` : `<span class="pill">قريبًا</span>`}</div>`; };
  app.innerHTML = `<div class="wrap"><section class="card pad rv" style="margin-bottom:16px"><span class="kicker">مجاني · بلا تسجيل</span>
      <h1 style="margin:6px 0 8px">اختبر مستواك</h1>
      <p style="margin:0 0 10px">${fmtNum(20)} سؤالًا من بنك أسئلة المركز تقيس مستواك الحالي، وتقترح لك الباقة المناسبة.</p>
      <ul class="pl-facts"><li>${ic('timer')} الوقت محدد: دقيقة لكل سؤال، ويُسلَّم الاختبار تلقائيًا عند انتهائه.</li>
        <li>${ic('lock')} لا نطلب اسمك ولا جوالك، ولا نحفظ أي بيانات شخصية.</li>
        <li>${ic('alert')} النتيجة «مؤشر جاهزية» تدريبي، وليست درجة اختبار قياس الرسمي.</li></ul></section>
    ${st.enabled ? `<div class="grid g2">${card('qudurat')}${card('tahsili')}</div>` : emptyBox('اختبار تحديد المستوى متوقف حاليًا', 'تواصل مع المركز لمعرفة الباقة المناسبة لك.')}
    <p style="margin-top:16px"><a class="btn" href="#home">${ic('prev')} الرئيسية</a></p></div>`;
  $$('[data-plgo]').forEach(b => b.onclick = async () => { b.disabled = true; b.setAttribute('aria-busy', 'true');
    try { const r = await Store.placementStart(b.dataset.plgo, plSession()); const x = { ...r, answers:{}, i:0 }; saveRun(x); runner(x); }
    catch(e){ toast(e.message); b.disabled = false; b.removeAttribute('aria-busy'); } });
}

function runner(run){
  const qs = run.questions, N = qs.length, ans = run.answers || {}; let i = Math.min(N - 1, run.i || 0), done = false;
  document.getElementById('plRoot')?.remove();
  const root = document.createElement('div'); root.id = 'plRoot'; root.className = 'sim'; root.dataset.liveBusy = '1';
  root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-label', 'اختبار تحديد المستوى');
  document.body.appendChild(root); document.body.classList.add('sim-on');
  const persist = () => saveRun({ ...run, answers:ans, i });
  const answered = () => qs.filter(q => ans[q.id] != null).length;
  const stem = q => `${q.page_image ? `<details class="sim-pg" open><summary>${ic('book')} نص القطعة</summary><img ${bankAttr(q.page_image, run.assets)} alt="صفحة القطعة" loading="lazy"></details>` : ''}
    ${q.image ? `<span class="qimg"><img ${bankAttr(q.image, run.assets)} alt="نص السؤال ${esc(q.code)}" loading="lazy"></span>` : ''}${q.text ? `<p class="sim-text">${esc(q.text)}</p>` : ''}`;
  const paint = () => { const q = qs[i];
    root.innerHTML = `<header class="sim-h"><div class="sim-h-a"><b>اختبار تحديد المستوى</b><span class="pill info">${esc(q.subject)}</span></div>
        <div class="sim-h-b"><span class="sim-t" role="timer" aria-live="off">${ic('timer')} <b id="plT" class="num">—</b></span><span class="hint num">${fmtNum(answered())}/${fmtNum(N)}</span></div></header>
      <div class="sim-prog" aria-hidden="true"><i style="width:${pct(answered(), N)}%"></i></div>
      <main class="sim-b"><div class="sim-q"><div class="sim-qh"><b>السؤال ${fmtNum(i + 1)} من ${fmtNum(N)}</b></div>
        <div class="sim-stem">${stem(q)}</div>
        <div class="sim-opts" role="radiogroup" aria-label="الخيارات">${(q.options || []).map((o, j) => `<label class="sim-opt ${ans[q.id] === j ? 'on' : ''}"><input type="radio" name="plo" value="${j}" ${ans[q.id] === j ? 'checked' : ''}><b>${LET[j]}</b><span>${q.image && o === LET[j] ? '' : esc(o)}</span></label>`).join('')}</div></div></main>
      <footer class="sim-f"><button class="btn" id="plPrev" ${i === 0 ? 'disabled' : ''}>${ic('prev')} السابق</button>
        ${i < N - 1 ? `<button class="btn pri" id="plNext">التالي ${ic('next')}</button>` : `<button class="btn pri" id="plEnd">${ic('check')} إنهاء وعرض النتيجة</button>`}</footer>`;
    $$('#plRoot [name=plo]').forEach(r => r.onchange = () => { ans[q.id] = +r.value; persist(); paint(); });
    $('#plPrev').onclick = () => go(i - 1); $('#plNext') && ($('#plNext').onclick = () => go(i + 1)); $('#plEnd') && ($('#plEnd').onclick = confirmEnd);
    tickNow(); };
  const go = k => { i = Math.max(0, Math.min(N - 1, k)); persist(); paint(); root.querySelector('.sim-b')?.scrollTo?.(0, 0); };
  const close = () => { clearInterval(tick); root.remove(); document.body.classList.remove('sim-on'); };
  const finish = async () => { if(done) return; done = true; clearInterval(tick);
    try { const r = await Store.placementFinish(run.id, plSession(), ans); saveRun(null); try { localStorage.setItem(LAST, JSON.stringify({ id:run.id, at:Date.now() })); } catch(_){} close(); result(run.kind, r); }
    catch(e){ done = false; toast(e.message); if(/انتهى|غير موجودة/.test(e.message)){ saveRun(null); close(); viewPlacement(); } } };
  const confirmEnd = () => { const left = N - answered();
    if(!left) return finish();
    modal(`<h3>إنهاء الاختبار</h3><p>بقي <b class="num">${fmtNum(left)}</b> سؤالًا بلا إجابة، وتُحسب خاطئة.</p>
      <div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" id="plC">متابعة الحل</button><button class="btn pri" id="plGo">${ic('check')} أنهِ الآن</button></div>`);
    $('#plC').onclick = closeModal; $('#plGo').onclick = () => { closeModal(); finish(); }; };
  const tickNow = () => { const el = $('#plT'); if(!el) return; const ms = Date.parse(run.deadline) - Date.now(); el.textContent = clock(ms);
    el.parentElement.classList.toggle('low', ms < 3 * 60000); if(ms <= 0) finish(); };
  const tick = setInterval(tickNow, 1000);
  paint();
}

function result(kind, r){
  const [, tone, label] = readyOf(r.pct);
  const bars = o => Object.entries(o || {}).filter(([k]) => k !== UNCAT).sort((a, b) => pct(a[1].right, a[1].total) - pct(b[1].right, b[1].total))
    .map(([k, v]) => `<div><span>${esc(k)}</span><div class="tbar"><i style="width:${pct(v.right, v.total)}%"></i></div><b class="num">${fmtNum(pct(v.right, v.total))}٪</b></div>`).join('');
  const skillsHtml = bars(r.skills), plans = r.plans || [];
  $('#app').innerHTML = `<div class="wrap"><section class="card pad rv pl-res" data-plres>
      <div class="sim-res-h">${ringSvg(r.pct, 96, 9, toneVar(tone))}<div><span class="hint">مؤشر الجاهزية · ${esc(PL_KINDS[kind].title)}</span>
        <h1 style="margin:0">${fmtNum(r.pct)}٪ · ${esc(label)}</h1><p class="hint" style="margin:2px 0 0">${fmtNum(r.score)} إجابة صحيحة من ${fmtNum(r.total)}</p></div></div>
      <p class="hint sim-note">مؤشر تدريبي من بنك المركز، وليس درجة اختبار قياس الرسمي.</p>
      ${Object.keys(r.parts || {}).length > 1 ? `<h3 class="sim-h4">الأقسام</h3><div class="skills">${bars(r.parts)}</div>` : ''}
      ${skillsHtml ? `<h3 class="sim-h4">المهارات (من الأضعف)</h3><div class="skills">${skillsHtml}</div>` : ''}
      ${r.weak?.length ? `<p class="hint">تحتاج تركيزًا في: <b>${r.weak.map(esc).join('، ')}</b></p>` : ''}</section>
    <section class="card pad rv" style="margin-top:16px" data-plrec><h2 class="ctitle">${ic('award')}الباقة المقترحة لك</h2>
      ${plans.length ? `<div class="grid g2">${plans.map((p, k) => `<div class="card pad pl-pick ${k === 0 ? 'best' : ''}" data-pltier="${esc(p.tier)}"><span class="pill ${k === 0 ? 'ok' : ''}">${k === 0 ? 'الأنسب لك' : 'خيار آخر'}</span>
          <h3 style="margin:8px 0">${esc(p.name || PL_TIER_TXT[p.tier] || '')}</h3><a class="btn pri" href="#enroll-q-${esc(p.id)}">${ic('form')} سجّل في هذه الباقة</a> <a class="btn sm" href="#plan-${esc(p.id)}">التفاصيل</a></div>`).join('')}</div>`
        : `<p class="hint">تواصل مع المركز ليقترح عليك الباقة المناسبة.</p>`}
      <p style="margin:14px 0 0;display:flex;gap:8px;flex-wrap:wrap"><a class="btn" href="${esc(waLink(plWaText(kind, r)))}" target="_blank" rel="noopener">${ic('chat')} اسأل المركز عن النتيجة</a>
        <a class="btn" href="#placement" id="plAgain">${ic('refresh')} اختبار آخر</a></p>
      <p class="hint" style="margin:12px 0 0" data-pllinknote>${ic('lock')} إن سجّلت في باقة من هذا الجهاز خلال 100 يوم تُحفظ نتيجتك في ملفك ليطّلع عليها المركز، وتُحذف النتيجة بعد 100 يوم.</p></section></div>`;
  $('#plAgain').onclick = e => { e.preventDefault(); viewPlacement(); window.scrollTo(0, 0); };
  window.scrollTo(0, 0);
}
