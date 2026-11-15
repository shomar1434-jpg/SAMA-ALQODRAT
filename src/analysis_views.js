/* =====================================================================
   تحليل نقاط الضعف (الخطوة AR): بطاقة واحدة تُعرض للمتدرب (في «قياس مستواي» مع
   زر «تدرّب على هذه»)، ولولي الأمر (في لوحته)، وللمدرب (في بطاقة المتدرب لمقرراته فقط).
   ===================================================================== */
import { $$, esc, fmtNum } from './utils.js';
import { ic, ringSvg, toast } from './views2_head.js';
import { Store } from './data2.js';
import { setBusy } from './features.js';
import { answerLog, analyze, LEVEL, MIN_ANSWERS, simHistory } from './analysis_logic.js';
import { UNCAT } from './sim_logic.js';

const TONE = { bad:'danger', warn:'warning', ok:'success' };
const trendIc = t => t > 0 ? `<span class="an-tr up" title="في تحسّن" aria-label="في تحسّن">▲</span>` : t < 0 ? `<span class="an-tr dn" title="في تراجع" aria-label="في تراجع">▼</span>` : '';

/* opts: { role:'student'|'guardian'|'teacher', subjects?:[...], name? , practice?:fn(subject, category) } */
export function analysisHtml(D, trainee_id, opts = {}){
  const an = analyze(answerLog(D, trainee_id), opts.subjects || null), me = opts.role === 'student';
  const title = me ? 'تحليل مستواي' : `تحليل مستوى ${esc(opts.name || 'المتدرب')}`;
  if(!an.total) return `<div class="card pad rv an-card"><h3 class="ctitle">${ic('target')}${title}</h3><p class="hint">${me ? 'حل تدريبًا سريعًا أو محاكيًا ليظهر تحليل مهاراتك ونقاط ضعفك.' : 'لم يحل المتدرب تدريبات أو اختبارات بعد.'}</p></div>`;
  const sims = simHistory(D, trainee_id), last = sims.slice(-1)[0];
  return `<div class="card pad rv an-card"><div class="an-h"><h3 class="ctitle" style="margin:0">${ic('target')}${title}</h3><span class="hint">بناءً على ${fmtNum(an.total)} إجابة${last ? ` · آخر محاكٍ ${fmtNum(last.pct)}٪` : ''}</span></div>
    ${an.weakest.length ? `<div class="an-weak"><b>${me ? 'ركّز على' : 'يحتاج تركيزًا في'}:</b> ${an.weakest.map(w => `<span class="pill ${LEVEL[w.level][0]}">${esc(w.category)} ${fmtNum(w.pct)}٪</span>`).join(' ')}</div>` : `<p class="an-good">${ic('check')} ${me ? 'لا مهارة ضعيفة في إجاباتك حتى الآن. واصل التدريب.' : 'لا مهارة ضعيفة حتى الآن.'}</p>`}
    <div class="an-subs">${an.subjects.map(s => `<section class="an-sub"><div class="an-sub-h">${ringSvg(s.pct, 64, 7, TONE[LEVEL[s.level][0]])}<div><b class="an-sn">${esc(s.subject)}</b> ${trendIc(s.trend)}<div class="hint">${fmtNum(s.right)} صحيحة من ${fmtNum(s.total)}</div></div></div>
      <ul class="an-skills">${s.skills.map(k => `<li class="${k.ranked ? '' : 'mute'}"><span class="an-k">${esc(k.category)} ${trendIc(k.trend)}</span><div class="tbar an-${LEVEL[k.level][0]}"><i style="width:${k.pct}%"></i></div><b class="num">${fmtNum(k.pct)}٪</b>
        <span class="hint an-n">${fmtNum(k.total)} سؤال${!k.ranked && k.category !== UNCAT ? ' · بيانات قليلة' : ''}</span>${me && opts.practice && k.category !== UNCAT && k.level !== 'strong' ? `<button class="btn sm" data-anp="${esc(s.subject)}|${esc(k.category)}">${ic('spark')} تدرّب على هذه</button>` : ''}</li>`).join('')}</ul></section>`).join('')}</div>
    <p class="hint an-foot">تُرتَّب المهارات من الأضعف بعد ${fmtNum(MIN_ANSWERS)} إجابات على الأقل. ▲ تحسّن و▼ تراجع في آخر الإجابات.${an.subjects.some(s => s.skills.some(k => k.category === UNCAT)) ? ' «غير مصنّف»: أسئلة لم تُحدَّد مهارتها في البنك بعد.' : ''}</p></div>`;
}

/* زر «تدرّب على هذه»: تدريب علاجي 10 أسئلة من المهارة */
export function bindAnalysis(D, tr, run){
  $$('[data-anp]').forEach(b => b.onclick = async () => { const [subject, category] = b.dataset.anp.split('|');
    const sub = (D.subscriptions || []).find(s => s.trainee_id === tr.id && (s.subjects || []).includes(subject)); if(!sub) return toast('هذا المقرر ليس ضمن اشتراكك');
    setBusy(b, true, '');
    try { run(await Store.startAttempt({ trainee_id:tr.id, section:sub.section, subject, unit:null, teacher_id:null, category, count:10 })); } catch(x){ setBusy(b, false); toast(x.message); } });
}
