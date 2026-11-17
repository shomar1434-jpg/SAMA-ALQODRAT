/* واجهة صندوق الوارد (الخطوة D): جرس وعدّاد، ولائحة الإشعارات والرسائل، ولافتة منبثقة، وصوت المعهد المخصص،
   ووميض عنوان التبويب في الخلفية، ورقم على أيقونة التطبيق المثبّت. لا يتكرر التنبيه للعنصر نفسه (يُحفظ ما رُئي في الجهاز). */
import { notifyState, askNotify, deviceNotify } from './pwa.js';
import { $, esc, fmtShort, t12 } from './utils.js';
import { ic } from './views2_head.js';
import { Store } from './data2.js';
import { KIND_TONE } from './inbox_logic.js';

const POLL_MS = 20000;
let st = null;   // { role, who, timer, items, seen, onOpen, onNew, flash, title }

/* ---------- الصوت ---------- */
let actx = null;
const soundOn = () => { try { return localStorage.getItem('sama_sound') !== 'off'; } catch(_) { return true; } };
const setSound = on => { try { localStorage.setItem('sama_sound', on ? 'on' : 'off'); } catch(_) {} };
function audio(){ try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); } catch(_) { actx = null; } return actx; }
function unlockAudio(){ const a = audio(); if(a && a.state === 'suspended') a.resume().catch(() => {}); }   // iOS: بعد أول لمسة فقط
/* نغمة المعهد: ثلاث نغمات صاعدة قصيرة (صول، سي، مي) */
export function chime(){
  if(!soundOn()) return false; const a = audio(); if(!a || a.state !== 'running') return false;
  const t0 = a.currentTime + .02;
  [[784, 0], [988, .13], [1319, .26]].forEach(([f, dt]) => { const o = a.createOscillator(), g = a.createGain();
    o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0, t0 + dt); g.gain.linearRampToValueAtTime(.22, t0 + dt + .015); g.gain.exponentialRampToValueAtTime(.001, t0 + dt + .42);
    o.connect(g).connect(a.destination); o.start(t0 + dt); o.stop(t0 + dt + .45); });
  return true;
}

/* ---------- العرض ---------- */
const when = at => { const d = new Date(at), r = new Date(d.getTime() + 3 * 3600e3).toISOString(); return `${fmtShort(r.slice(0, 10))} · ${t12(r.slice(11, 16))}`; };
const seenKey = () => `sama_seen_${st.role}_${st.who}`;
function loadSeen(){ try { const v = localStorage.getItem(seenKey()); return v ? new Set(JSON.parse(v)) : null; } catch(_) { return null; } }
function saveSeen(){ try { localStorage.setItem(seenKey(), JSON.stringify([...st.seen].slice(-300))); } catch(_) {} }

function badge(n){
  const b = $('#bellBtn'); if(!b) return;
  b.querySelector('.bdg').textContent = n > 99 ? '99+' : String(n); b.querySelector('.bdg').hidden = !n;
  b.setAttribute('aria-label', n ? `الإشعارات: ${n} غير مقروء` : 'الإشعارات');
  try { if('setAppBadge' in navigator) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch(_) {}
}
function flashTitle(n){
  if(!document.hidden || st.flash) return; st.title = document.title; let on = false;
  st.flash = setInterval(() => { on = !on; document.title = on ? `(${n}) ${n > 1 ? 'إشعارات جديدة' : 'إشعار جديد'}` : st.title; }, 1200);
}
function stopFlash(){ if(st?.flash){ clearInterval(st.flash); st.flash = null; document.title = st.title; } }

function toastItem(it, more){
  let box = $('#inboxToast'); if(!box){ box = document.createElement('div'); box.id = 'inboxToast'; box.setAttribute('role', 'status'); box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  box.innerHTML = `<button class="ibt-card" type="button"><span class="ibt-ic t-${KIND_TONE[it.kind] || 'info'}">${ic(it.action === 'msg' ? 'activity' : 'alert')}</span>
    <span class="ibt-body"><b>${esc(it.title)}</b><span>${esc(String(it.text).slice(0, 140))}</span>${more ? `<small>و${more} ${more > 1 ? 'إشعارات أخرى' : 'إشعار آخر'}</small>` : ''}</span></button>
    <button class="ibt-x" type="button" aria-label="إغلاق">×</button>`;
  box.classList.add('on'); clearTimeout(box._t); box._t = setTimeout(() => box.classList.remove('on'), 7000);
  box.querySelector('.ibt-card').onclick = () => { box.classList.remove('on'); openItem(it); };
  box.querySelector('.ibt-x').onclick = () => box.classList.remove('on');
}
function openItem(it){ closePanel(); st.onOpen?.(it); }

function panelHtml(){
  const L = st.items || [];
  return `<div class="ibp-head"><b>${ic('bell')} الإشعارات</b>
      <button class="btn sm ghost" id="ibSound" aria-pressed="${soundOn()}">${soundOn() ? '🔔 الصوت مفعّل' : '🔕 الصوت متوقف'}</button></div>
    ${(() => { const s = notifyState(); return s === 'unsupported' ? '' : `<div class="ibp-dev">${s === 'granted' ? `<span class="hint">${ic('check')} إشعارات الجهاز مفعّلة: تصلك حين تكون المنصة في الخلفية.</span>`
      : s === 'denied' ? '<span class="hint">إشعارات الجهاز محظورة. اسمح بها لهذا الموقع من إعدادات المتصفح.</span>'
      : `<button class="btn sm" id="ibDev">${ic('bell')} تفعيل إشعارات الجهاز</button><span class="hint">على الآيفون: ثبّت المنصة أولًا على الشاشة الرئيسية.</span>`}</div>`; })()}
    ${L.length ? `<ul class="ibp-list">${L.map((x, i) => `<li><button type="button" class="ibp-it ${x.read ? '' : 'new'}" data-ii="${i}">
        <span class="ibt-ic t-${KIND_TONE[x.kind] || 'info'}">${ic(x.action === 'msg' ? 'activity' : 'alert')}</span>
        <span class="ibt-body"><b>${esc(x.title)}</b><span>${esc(String(x.text).slice(0, 160))}</span><small>${when(x.at)}</small></span></button></li>`).join('')}</ul>`
      : '<p class="hint" style="padding:18px;text-align:center">لا توجد إشعارات بعد</p>'}`;
}
function openPanel(){
  let p = $('#inboxPanel'); if(p){ closePanel(); return; }
  p = document.createElement('div'); p.id = 'inboxPanel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-label', 'الإشعارات'); p.innerHTML = panelHtml(); document.body.appendChild(p);
  $('#bellBtn').setAttribute('aria-expanded', 'true');
  bindPanel(p); (p.querySelector('.ibp-it') || p.querySelector('#ibSound')).focus();
  setTimeout(() => document.addEventListener('pointerdown', outside), 0); document.addEventListener('keydown', esc_);
  if((st.items || []).some(x => x.action === 'notice' && !x.read)) Store.markRead(st.role).then(tick).catch(() => {});
}
function bindPanel(p){
  if(p.querySelector('#ibDev')) p.querySelector('#ibDev').onclick = async () => { const r = await askNotify(); if(r === 'granted') deviceNotify('مركز سما القدرات', 'فُعّلت إشعارات الجهاز.', 'sama-enabled'); p.innerHTML = panelHtml(); bindPanel(p); };
  p.querySelector('#ibSound').onclick = () => { setSound(!soundOn()); unlockAudio(); if(soundOn()) setTimeout(chime, 50); p.innerHTML = panelHtml(); bindPanel(p); };
  p.querySelectorAll('[data-ii]').forEach(b => b.onclick = () => openItem(st.items[+b.dataset.ii]));
}
const outside = e => { if(!e.target.closest('#inboxPanel,#bellBtn')) closePanel(); };
const esc_ = e => { if(e.key === 'Escape'){ closePanel(); $('#bellBtn')?.focus(); } };
function closePanel(){ $('#inboxPanel')?.remove(); $('#bellBtn')?.setAttribute('aria-expanded', 'false'); document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', esc_); }

/* ---------- الاستطلاع ---------- */
async function tick(){
  if(!st) return; let r; try { r = await Store.inboxState(st.role); } catch(_) { return; } if(!st) return;
  st.items = r.items || []; badge(r.unread || 0);
  if($('#inboxPanel')){ const p = $('#inboxPanel'); p.innerHTML = panelHtml(); bindPanel(p); }
  const fresh = st.items.filter(x => !x.read && !st.seen.has(x.id));
  if(st.first) st.first = false;   // أول تحميل في هذا الجهاز: لا صوت لما سبق
  else if(fresh.length){ chime(); toastItem(fresh[0], fresh.length - 1); flashTitle(r.unread); st.onNew?.(fresh);
    if(document.hidden) deviceNotify(fresh[0].title, String(fresh[0].text).slice(0, 160) + (fresh.length > 1 ? ` (+${fresh.length - 1})` : ''), 'sama-' + fresh[0].id); }
  st.items.forEach(x => st.seen.add(x.id)); saveSeen();
}
export function mountInbox(role, who, { onOpen, onNew } = {}){
  if(st && st.role === role && st.who === who){ st.onOpen = onOpen; st.onNew = onNew; return; }
  unmountInbox();
  const prev = loadSeenFor(role, who);
  st = { role, who, onOpen, onNew, items:[], seen: prev || new Set(), first: !prev };
  if(!$('#bellBtn')){
    const b = document.createElement('button'); b.id = 'bellBtn'; b.className = 'bell'; b.type = 'button'; b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-expanded', 'false');
    b.innerHTML = `${ic('bell')}<span class="bdg" hidden>0</span>`; $('#logoutBtn').before(b); b.onclick = () => { unlockAudio(); openPanel(); };
  }
  document.addEventListener('pointerdown', unlockAudio, { once:true }); document.addEventListener('keydown', unlockAudio, { once:true });
  document.addEventListener('visibilitychange', onVis);
  tick(); st.timer = setInterval(tick, POLL_MS);   // المتصفح يبطئه تلقائيًا في الخلفية
}
function loadSeenFor(role, who){ const tmp = st; st = { role, who }; const v = loadSeen(); st = tmp; return v; }
const onVis = () => { if(!document.hidden){ stopFlash(); tick(); } };
export function unmountInbox(){ if(!st) return; clearInterval(st.timer); stopFlash(); closePanel(); document.removeEventListener('visibilitychange', onVis); $('#bellBtn')?.remove(); $('#inboxToast')?.remove(); badge(0); st = null; }
export const inboxRefresh = () => tick();
