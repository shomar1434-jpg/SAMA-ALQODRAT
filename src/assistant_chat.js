import { matchResponse } from './assistant_logic.js';

/* =====================================================================
   مساعد سما الذكي (الخطوة BD): زر عائم أسفل يمين الشاشة بأيقونة واحدة بثلاث حالات (تصميم المالك 17 نوفمبر):
   جاهز = المصباح · يكتب الرد = دوائر سما تتحرك · أجاب = الشرارة، ثم يعود إلى المصباح.
   الردود من مكتبة المركز المعتمدة (assistant_responses) بمطابقة الكلمات، لا نموذج لغوي ولا بيانات شخصية.
   ===================================================================== */
const BUBBLE = '<path d="M10 16c0-4.4 3.6-8 8-8h28c4.4 0 8 3.6 8 8v20c0 4.4-3.6 8-8 8H30l-10 9v-9h-2c-4.4 0-8-3.6-8-8z" stroke="#fff" stroke-width="3.6" stroke-linejoin="round"/>';
const ICONS = {
  idle: BUBBLE + '<circle cx="32" cy="23" r="7.5" fill="#F4A51C"/><rect x="28.5" y="30" width="7" height="5" rx="1.6" fill="#fff"/><path class="as-rays" d="M32 11.5v-2.5M22.5 15.5l-1.8-1.8M41.5 15.5l1.8-1.8M19 24h-2.5M45 24h2.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>',
  typing: BUBBLE + '<circle class="as-dot" cx="21" cy="26" r="3.4" fill="#F4A51C"/><circle class="as-dot as-d2" cx="31" cy="26" r="4.4" fill="#F4A51C"/><circle class="as-dot as-d3" cx="43" cy="26" r="5.6" fill="#F4A51C"/>',
  done: BUBBLE + '<path class="as-pop" d="M31 13c1.2 6.2 3.6 8.6 9.8 9.8-6.2 1.2-8.6 3.6-9.8 9.8-1.2-6.2-3.6-8.6-9.8-9.8 6.2-1.2 8.6-3.6 9.8-9.8z" fill="#F4A51C"/><path class="as-pop as-d3" d="M43 29.5c.5 2.6 1.5 3.6 4.1 4.1-2.6.5-3.6 1.5-4.1 4.1-.5-2.6-1.5-3.6-4.1-4.1 2.6-.5 3.6-1.5 4.1-4.1z" fill="#fff"/>',
};
export const ASSISTANT_STATES = Object.keys(ICONS);
export const TYPING_MIN_MS = 700, DONE_MS = 2000;
const icon = (s, size) => `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 64 64" fill="none">${ICONS[s]}</svg>`;
const CLOSE = '<svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>';
const LABEL = { idle: 'مساعد سما الذكي', typing: 'مساعد سما يكتب الرد', done: 'وصل رد مساعد سما' };

export function mountAssistant(store) {
  if (document.querySelector('.sama-assistant')) return;
  const host = document.createElement('aside');
  host.className = 'sama-assistant';
  host.innerHTML = '<button type="button" class="as-fab" id="assistantToggle" data-state="idle" aria-expanded="false" aria-controls="assistantPanel" aria-label="افتح مساعد سما الذكي"><span class="as-ico"></span><span class="as-on" aria-hidden="true"></span></button>' +
    '<section id="assistantPanel" class="as-panel" hidden aria-label="مساعد سما الذكي"><header><span class="as-head-ico"></span><span class="as-head-t"><b>مساعد سما الذكي</b><small id="assistantStatus" aria-live="polite">متاح الآن</small></span><button type="button" class="btn sm" id="assistantClose" aria-label="إغلاق المحادثة">×</button></header>' +
    '<div id="assistantMessages" role="log" aria-live="polite"></div><form id="assistantAsk"><label class="sr-only" for="assistantQuestion">سؤالك</label><input class="inp" id="assistantQuestion" placeholder="اكتب سؤالك…" maxlength="650" autocomplete="off" required><button class="btn pri">إرسال</button></form></section>';
  document.body.append(host);
  const find = id => host.querySelector('#' + id);
  const fab = find('assistantToggle'), panel = find('assistantPanel');
  let rows = [], loaded = false, sending = false, doneTimer = null, state = '';
  const setState = s => {
    if (s === state) return;
    state = s; clearTimeout(doneTimer);
    fab.dataset.state = s;
    host.querySelector('.as-ico').innerHTML = panel.hidden ? icon(s, 36) : CLOSE;
    host.querySelector('.as-head-ico').innerHTML = icon(s, 22);
    find('assistantStatus').textContent = s === 'typing' ? 'يكتب الرد…' : 'متاح الآن';
    fab.setAttribute('aria-label', panel.hidden ? 'افتح ' + LABEL[s] : 'أغلق مساعد سما الذكي');
    // الشرارة تبقى على الزر المغلق حتى يفتحه الزائر، وفي المحادثة المفتوحة تعود إلى المصباح بعد ثانيتين
    if (s === 'done' && !panel.hidden) doneTimer = setTimeout(() => setState('idle'), DONE_MS);
  };
  const paintFab = () => { const s = state; state = ''; setState(s || 'idle'); };
  const message = (who, text, actions = []) => {
    const bubble = document.createElement('div');
    bubble.className = 'assistant-message ' + (who === 'me' ? 'me' : 'bot');
    const body = document.createElement('p'); body.textContent = text;
    bubble.append(body);
    if (actions.length) {
      const acts = document.createElement('div'); acts.className = 'as-acts';
      for (const action of actions.slice(0, 4)) {
        const button = document.createElement('button');
        button.type = 'button'; button.className = 'btn sm'; button.textContent = action;
        button.onclick = () => send(action);
        acts.append(button);
      }
      bubble.append(acts);
    }
    find('assistantMessages').append(bubble);
    find('assistantMessages').scrollTop = find('assistantMessages').scrollHeight;
  };
  const load = async () => { rows = await store.assistantResponses(); loaded = true; };
  const send = async text => {
    const question = String(text || '').trim();
    if (!question || sending) return;
    sending = true;
    const button = find('assistantAsk').querySelector('button'); button.disabled = true;
    message('me', question);
    find('assistantAsk').reset();
    setState('typing');
    const t0 = Date.now();
    let reply = null, failed = false;
    try { await load(); reply = matchResponse(rows, question); } catch (_) { failed = true; }
    await new Promise(r => setTimeout(r, Math.max(0, TYPING_MIN_MS - (Date.now() - t0))));
    if (failed) message('bot', 'تعذّر تحميل الرد الآن. أعد المحاولة أو تواصل مع المركز على واتساب 0561606878.');
    else message('bot', reply?.answer || 'للاستفسار عن هذا الموضوع، تواصل مع مركز سما القدرات عبر واتساب 0561606878.', reply?.actions);
    setState('done');
    sending = false; button.disabled = false;
  };
  const open = async () => {
    panel.hidden = false; fab.setAttribute('aria-expanded', 'true'); host.classList.add('open');
    paintFab(); if (state === 'done') setState('idle');
    if (!loaded) {
      try {
        await load();
        const greeting = rows.find(row => row.id === 'hello' && row.active !== false);
        if (greeting) message('bot', greeting.answer, greeting.actions);
      } catch (_) { message('bot', 'أهلًا بك في مركز سما القدرات. يمكنك التواصل معنا على واتساب 0561606878.'); }
    }
    find('assistantQuestion').focus();
  };
  const close = () => { panel.hidden = true; fab.setAttribute('aria-expanded', 'false'); host.classList.remove('open'); paintFab(); fab.focus(); };
  fab.onclick = () => (panel.hidden ? open() : close());
  find('assistantClose').onclick = close;
  find('assistantAsk').onsubmit = event => { event.preventDefault(); send(find('assistantQuestion').value); };
  host.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) close(); });
  setState('idle');
}
