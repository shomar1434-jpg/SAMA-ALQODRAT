/* =====================================================================
   شاشة الترحيب في بوابة المتدرب (الخطوة AK): تُعرض عند فتح البوابة مرة في اليوم، وكلما كانت جلسته مفتوحة
   ولم يسجّل حضوره. فيها جلسة اليوم وحالتها، وزر «تسجيل الحضور» من داخل التطبيق دون كتابة السجل المدني:
   الجهاز المعتمد يعرّف صاحبه (portalCheckin ↔ portal_checkin)، ويمر الحضور بمسار التحضير نفسه.
   ===================================================================== */
import { $, $$, esc, fmtDate, fmtShort, t12, toMin, riyadhNow, DAYS } from './utils.js';
import { ic, toast } from './views2_head.js';
import { Store } from './data2.js';
import { setBusy, toLatin } from './features.js';
import { checkinMsg, deviceId } from './views2_main.js';
import { LOGO } from './assets/logo.js';

const dayName = d => DAYS[new Date(d + 'T12:00:00Z').getUTCDay()];
const seenKey = (id, date) => `sama_welcome_${id}_${date}`;

/* حالة جلسة اليوم لاشتراك: now (التسجيل مفتوح) · later (لم يُفتح بعد) · done (سُجّل) · none (لا جلسة اليوم) */
export function welcomeState(it, now, early = 60){
  if(!it) return { kind:'none', next:null };
  const ses = (it.upcoming || []).find(x => x.date === now.date), next = (it.upcoming || []).find(x => x.date > now.date) || null;
  if(it.last === now.date) return { kind:'done', ses, next };
  if(!ses) return { kind:'none', next:(it.upcoming || [])[0] || null };
  const m = toMin(now.hm);
  if(m < toMin(ses.start) - early) return { kind:'later', ses, next, opensAt:toMin(ses.start) - early };
  return { kind:'now', ses, next };
}
const hm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/* هل تُعرض تلقائيًا: أول فتح في اليوم، أو جلسة مفتوحة لم يُسجَّل حضورها */
export function shouldWelcome(traineeId, st){
  const d = riyadhNow().date; let seen = false; try { seen = !!localStorage.getItem(seenKey(traineeId, d));
    /* المتصفح الآلي (الاختبارات) لا تُفتح له تلقائيًا إلا بطلب صريح، كي لا تحجب بقية الاختبارات */
    if(navigator.webdriver && !localStorage.getItem('sama_welcome_force')) return false; } catch {}
  return !seen || st.kind === 'now';
}
const markSeen = id => { try { localStorage.setItem(seenKey(id, riyadhNow().date), '1'); } catch {} };

function sessionCard(st, it){
  const ses = st.ses, nx = st.next;
  const line = s => `${dayName(s.date)} ${fmtShort(s.date)} · <span class="num">${t12(s.start)} – ${t12(s.end)}</span>`;
  if(st.kind === 'done') return `<div class="wl-state ok">${ic('check')}<div><b>سُجّل حضورك اليوم</b><span>${ses ? line(ses) : ''}</span></div></div>
    ${nx ? `<p class="wl-next">جلستك القادمة: ${line(nx)}</p>` : ''}`;
  if(st.kind === 'now') return `<div class="wl-state now">${ic('clock')}<div><b>جلستك اليوم مفتوحة للتسجيل</b><span>${line(ses)}${it?.section ? ` · قسم ${esc(it.section)}` : ''}</span></div></div>`;
  if(st.kind === 'later') return `<div class="wl-state">${ic('calendar')}<div><b>جلستك اليوم</b><span>${line(ses)}</span></div></div>
    <p class="wl-next">${ic('timer')} يُفتح تسجيل الحضور الساعة <span class="num">${t12(hm(st.opensAt))}</span>.</p>`;
  return `<div class="wl-state">${ic('calendar')}<div><b>لا جلسة لك اليوم</b><span>${nx ? `جلستك القادمة: ${line(nx)}` : 'لا جلسات قادمة في جدولك.'}</span></div></div>`;
}

/* الشاشة كاملة. opts: { trainee, it (اشتراك أو null), prog (دفعة أو null), onClose } */
export async function showWelcome({ trainee, it, prog, onClose }){
  let set = {}; try { set = await Store.publicSettings(); } catch {}
  const now = riyadhNow(), st = welcomeState(it, now, set.early_minutes ?? 60);
  const canTry = st.kind === 'now' || (!it && prog);
  markSeen(trainee.id);
  let root = $('#welcome'); if(!root){ root = document.createElement('div'); root.id = 'welcome'; document.body.appendChild(root); }
  root.innerHTML = `<div class="wl" role="dialog" aria-modal="true" aria-labelledby="wlT"><div class="wl-card rv">
    <img class="wl-logo" src="${LOGO}" alt="">
    <p class="wl-date">${fmtDate(now.date)} · <span class="num" id="wlClock">${t12(now.hm)}</span></p>
    <h1 id="wlT">أهلًا ${esc(trainee.first_name)}</h1>
    <p class="wl-sub">${it ? `${esc(it.plan)}${it.subjects?.length ? ' · ' + esc(it.subjects.join('، ')) : ''}` : prog ? esc(prog.program) : ''}</p>
    <div id="wlBody">${sessionCard(st, it)}</div>
    ${canTry ? `${set.require_code ? `<div class="field wl-code"><label for="wlCode">رمز اليوم (على شاشة القاعة)</label><input class="inp num" id="wlCode" inputmode="numeric" maxlength="4" autocomplete="one-time-code" dir="ltr"></div>` : ''}
      <button class="btn pri lg wl-go" id="wlGo">${ic('check')} تسجيل الحضور</button>` : ''}
    <div class="errtxt" id="wlE" role="alert"></div>
    <button class="btn lg wl-skip" id="wlSkip">${ic('chart')} الدخول إلى لوحتي</button>
  </div></div>`;
  document.body.classList.add('wl-open');
  const close = changed => { root.innerHTML = ''; document.body.classList.remove('wl-open'); clearInterval(tm); onClose?.(changed); };
  const tm = setInterval(() => { const c = $('#wlClock'); if(c) c.textContent = t12(riyadhNow().hm); }, 15000);
  $('#wlSkip').onclick = () => close(false);
  root.querySelector('.wl').addEventListener('keydown', e => { if(e.key === 'Escape') close(false); });
  if($('#wlCode')) $('#wlCode').oninput = e => { e.target.value = toLatin(e.target.value).replace(/\D/g, '').slice(0, 4); };
  const go = $('#wlGo');
  if(go){
    const send = async choice => { $('#wlE').textContent = '';
      const code = $('#wlCode')?.value || '';
      if(set.require_code && code.length !== 4){ $('#wlE').textContent = 'اكتب رمز اليوم المكوّن من 4 أرقام.'; return; }
      setBusy(go, true, 'جارٍ تسجيل الحضور');
      let r; try { r = await Store.portalCheckin(trainee.id, code, { device:deviceId(), choice }); } catch(x){ r = { ok:false, reason:'error', msg:x.message }; }
      setBusy(go, false);
      if(r.reason === 'choose'){
        $('#wlBody').innerHTML = `<p class="wl-next">لديك أكثر من جلسة الآن، اختر جلستك:</p><div class="wl-choices">${r.options.map(o => `<button class="btn lg" data-wc="${esc(o.id)}">${ic('book')} ${esc(o.label)}</button>`).join('')}</div>`;
        go.hidden = true; $$('[data-wc]').forEach(b => b.onclick = async () => { setBusy(b, true, 'جارٍ التسجيل'); await send(b.dataset.wc); }); return;
      }
      if(r.ok){
        const late = r.status === 'متأخر';
        $('#wlBody').innerHTML = `<div class="wl-done"><div class="bigcheck ${late ? 'warn' : ''}">${ic(late ? 'timer' : 'check')}</div>
          <h2>${r.already ? 'حضورك مسجّل مسبقًا اليوم' : late ? 'سُجّل حضورك متأخرًا' : 'سُجّل حضورك'}</h2>
          <p class="wl-next">${esc(r.program || '')} · <span class="num">${t12(r.time)}</span></p></div>`;
        go.hidden = true; $('#wlCode')?.closest('.field')?.remove(); $('#wlSkip').classList.add('pri'); $('#wlSkip').focus();
        $('#wlSkip').onclick = () => close(true); toast(r.already ? 'حضورك مسجّل مسبقًا' : 'سُجّل حضورك');
        return;
      }
      const M = checkinMsg(r); $('#wlE').innerHTML = `<b>${M[0]}</b>${M[1] ? ` — ${M[1]}` : ''}`;
    };
    go.onclick = () => send();
    go.focus();
  } else $('#wlSkip').focus();
}
