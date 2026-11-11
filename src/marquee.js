/* =====================================================================
   شريط منزلق عام: انسياب تلقائي في خط مستقيم، سحب باللمس مع قصور ذاتي،
   أزرار سابق/تالٍ، إيقاف واستئناف، توقف عند التركيز أو المؤشر،
   واحترام prefers-reduced-motion (لا حركة تلقائية).
   ===================================================================== */
import { reduceMotion } from './views2_head.js';

/* root: عنصر يحوي .mq-view > .mq-track، وأزرار [data-mq=prev|next|toggle] اختيارية
   items: قائمة البيانات، card(item, clone) يعيد HTML البطاقة، onOpen(item, el) عند النقر */
export function initMarquee(root, items, card, onOpen, { speed = 0.035, gap = 16 } = {}){
  const view = root.querySelector('.mq-view'), track = root.querySelector('.mq-track');
  if(!view || !track || !items.length) return;
  track.innerHTML = items.map(x => card(x, false)).join('');
  let reps = 1; while(track.scrollWidth < view.clientWidth * 1.2 && reps < 12){ track.insertAdjacentHTML('beforeend', items.map(x => card(x, true)).join('')); reps++; }
  const unit = track.scrollWidth + gap;
  track.insertAdjacentHTML('beforeend', items.map(x => card(x, true)).join('').repeat(reps));
  const still = reduceMotion();
  let x = -1, v = 0, last = performance.now(), drag = null, hover = false, paused = still, idleUntil = 0;
  const wrap = () => { while(x > 0) x -= unit; while(x <= -unit) x += unit; };
  const paint = () => { track.style.transform = `translate3d(${x}px,0,0)`; };
  const tick = t => { if(!view.isConnected) return; const dt = Math.min(50, t - last); last = t;
    if(!drag){ if(Math.abs(v) > 0.01){ x += v * dt; v *= Math.pow(0.94, dt / 16); } else if(!hover && !paused && t > idleUntil) x += speed * dt; wrap(); paint(); }
    requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  const find = id => items.find(i => String(i.id) === String(id));
  view.addEventListener('pointerdown', e => { if(e.button !== 0) return; drag = { x0:e.clientX, xs:x, moved:0, hist:[[e.clientX, performance.now()]] }; v = 0; view.setPointerCapture(e.pointerId); view.classList.add('dragging'); });
  view.addEventListener('pointermove', e => { if(!drag) return; const dx = e.clientX - drag.x0; drag.moved = Math.max(drag.moved, Math.abs(dx)); x = drag.xs + dx; wrap(); paint(); drag.hist.push([e.clientX, performance.now()]); if(drag.hist.length > 6) drag.hist.shift(); });
  view.addEventListener('pointerup', e => { if(!drag) return; const h = drag.hist, a = h[0], b = h[h.length - 1];
    v = still ? 0 : (b[0] - a[0]) / Math.max(1, b[1] - a[1]); idleUntil = performance.now() + 1800; view.classList.remove('dragging');
    const click = drag.moved < 6; drag = null;
    if(click){ const el = document.elementsFromPoint(e.clientX, e.clientY).find(n => n.dataset?.mqId); if(el) onOpen?.(find(el.dataset.mqId), el); } });
  view.addEventListener('pointercancel', () => { drag = null; view.classList.remove('dragging'); });
  view.addEventListener('mouseenter', () => hover = true); view.addEventListener('mouseleave', () => hover = false);
  view.addEventListener('focusin', () => hover = true); view.addEventListener('focusout', () => hover = false);
  const cardW = () => (track.firstElementChild?.offsetWidth || 240) + gap;
  const nudge = dir => { v = 0; const s = x, target = x + dir * cardW(), t0 = performance.now(); idleUntil = t0 + 2500;
    const step = t => { const k = Math.min(1, (t - t0) / 450), ease = 1 - Math.pow(1 - k, 3); x = s + (target - s) * ease; wrap(); paint(); if(k < 1) requestAnimationFrame(step); }; requestAnimationFrame(step); };
  root.querySelector('[data-mq=prev]')?.addEventListener('click', () => nudge(-1));
  root.querySelector('[data-mq=next]')?.addEventListener('click', () => nudge(1));
  const tg = root.querySelector('[data-mq=toggle]');
  const syncToggle = () => { if(!tg) return; tg.setAttribute('aria-pressed', String(paused)); tg.setAttribute('aria-label', paused ? 'تشغيل الحركة' : 'إيقاف الحركة'); tg.dataset.state = paused ? 'paused' : 'playing'; };
  if(tg){ if(still) tg.hidden = true; tg.addEventListener('click', () => { paused = !paused; syncToggle(); }); syncToggle(); }
  view.addEventListener('keydown', e => { if(e.key === 'ArrowLeft'){ e.preventDefault(); nudge(1); } if(e.key === 'ArrowRight'){ e.preventDefault(); nudge(-1); } });
  track.querySelectorAll('[data-mq-id]:not([aria-hidden])').forEach(c => c.addEventListener('keydown', e => { if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); onOpen?.(find(c.dataset.mqId), c); } }));
  track.querySelectorAll('[data-mq-id]').forEach(c => c.addEventListener('click', e => { if(e.detail === 0) return; e.preventDefault(); }));
}
