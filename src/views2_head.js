import { $, $$, esc, fmtNum } from './utils.js';

/* =====================================================================
   الأيقونات الخطية (سماكة 2) والعناصر الإيضاحية — من نظام تصميم سِجِل
   ===================================================================== */
export const IC = {
  phone:'<path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2Z"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  inbox:'<path d="M3 13h5l2 3h4l2-3h5"/><path d="M5 5h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6Z"/>',
  chat:'<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.2-4.4A8 8 0 1 1 21 12Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/>',
  monitor:'<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4M7 9l2 2-2 2M12 13h4"/>',
  palette:'<path d="M12 3a9 9 0 0 0 0 18c1.1 0 1.7-.9 1.4-1.8-.4-1.2.3-2.2 1.6-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10Z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  scale:'<path d="M12 3v18M7 21h10M5 7h14M12 5l-1-2h2Z"/><path d="M5 7 2 14a3 3 0 0 0 6 0Z"/><path d="m19 7-3 7a3 3 0 0 0 6 0Z"/>',
  receipt:'<path d="M5 3h14v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  printer:'<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7Z"/>',
  history:'<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 8v4l3 2"/>',
  key:'<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M14 9l2 2"/>',
  shield:'<path d="M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6Z"/><path d="m9 12 2 2 4-4"/>',
  handshake:'<path d="m11 17 2 2a1.4 1.4 0 0 0 2-2"/><path d="m14 14 2.5 2.5a1.4 1.4 0 0 0 2-2L15 11"/><path d="M2 12 6 8l4 1 3-2 3 1 6 5"/><path d="M2 12l7 6a1.4 1.4 0 0 0 2-2"/>',
  eye:'<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  flag:'<path d="M5 21V4h11l-2 4 2 4H5"/>',
  clipboard:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11l2 2 4-4M9 17h6"/>',
  smartphone:'<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  send:'<path d="M22 2 11 13"/><path d="M22 2 15 22l-4-9-9-4Z"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users:'<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0"/><path d="M16 4a4 4 0 0 1 0 8"/><path d="M22 21a7 7 0 0 0-5-6.7"/>',
  pin:'<path d="M12 21s7-6.2 7-12a7 7 0 1 0-14 0c0 5.8 7 12 7 12Z"/><circle cx="12" cy="9" r="2.5"/>',
  clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  book:'<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z"/><path d="M4 19V5"/><path d="M9 7h6"/>',
  settings:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M2 12h3M19 12h3M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  qr:'<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3M21 14v.01M14 21h3M21 17v4"/>',
  form:'<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 10h6M9 14h6M9 18h3"/>',
  logout:'<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="m14 17 5-5-5-5M19 12H8"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  copy:'<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  refresh:'<path d="M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5"/>',
  check:'<path d="m5 12 5 5 9-10"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  alert:'<circle cx="12" cy="12" r="9"/><path d="M12 7v6M12 16.5v.01"/>',
  bell:'<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  timer:'<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M9 2h6"/>',
  layers:'<path d="m12 3 9 5-9 5-9-5Z"/><path d="m3 13 9 5 9-5"/>',
  trend:'<path d="m3 17 6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
  wallet:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18M16 15h2"/>',
  seat:'<path d="M6 20v-4M18 20v-4M5 16h14M7 16V7a3 3 0 0 1 3-3h4a3 3 0 0 1 3 3v9"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  next:'<path d="M19 12H5M11 6l-6 6 6 6"/>',
  prev:'<path d="M5 12h14M13 6l6 6-6 6"/>',
  sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
  award:'<circle cx="12" cy="9" r="6"/><path d="m8.5 14-1.5 7 5-3 5 3-1.5-7"/>',
  tv:'<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  edit:'<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  expand:'<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  id:'<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><path d="M14 10h4M14 14h3"/>',
  lock:'<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  database:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
  grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  pie:'<path d="M21 12A9 9 0 1 1 12 3v9Z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15Z"/>',
  grad:'<path d="m2 9 10-5 10 5-10 5Z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/>',
  city:'<path d="M4 21V5l8-3v19M12 9h8v12M8 8v.01M8 12v.01M8 16v.01M16 13v.01M16 17v.01M2 21h20"/>',
  activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',
  spark:'<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/>',
  hourglass:'<path d="M6 2h12M6 22h12M7 2c0 5 10 5 10 10S7 17 7 22M17 2c0 5-10 5-10 10s10 5 10 10"/>'
};
export const ic = (n, cls='') => `<svg class="ic ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]||''}</svg>`;
export const EMPTY_ART = `<svg class="art" viewBox="0 0 120 96" aria-hidden="true"><rect x="18" y="20" width="84" height="62" rx="12" fill="var(--brand-tint)"/><rect x="30" y="34" width="44" height="7" rx="3.5" fill="var(--brand)" opacity=".55"/><rect x="30" y="49" width="60" height="7" rx="3.5" fill="var(--surface-track)"/><rect x="30" y="64" width="34" height="7" rx="3.5" fill="var(--surface-track)"/><circle cx="92" cy="22" r="12" fill="var(--gold-tint)"/><path d="M92 16v7l4 2" stroke="var(--gold)" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`;
export const emptyBox = (title, text='') => `<div class="empty box">${EMPTY_ART}<strong>${title}</strong>${text?`<span>${text}</span>`:''}</div>`;
// إعادة عرض هادئة من التحديث الحي: بلا هيكل تحميل ولا حركات ظهور (منعًا للومضات)
export const quiet = () => document.documentElement.classList.contains('live-redraw');
export const skeleton = () => `<div class="card skel"><i></i><i></i><i></i><i></i><i></i></div>`;
export function ringSvg(pct, size=58, sw=6, tone){
  const r=(size-sw)/2, c=2*Math.PI*r, off=c*(1-Math.max(0,Math.min(100,pct))/100);
  return `<div class="ring" style="width:${size}px;height:${size}px;${tone?`--c:var(--${tone})`:''}"><svg width="${size}" height="${size}"><circle class="bg" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke-width="${sw}"/><circle class="fg" cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke-width="${sw}" stroke-dasharray="${c}" stroke-dashoffset="${off}" style="--rc:${c}"/></svg><b>${fmtNum(pct)}٪</b></div>`;
}
export const reduceMotion = () => quiet() || !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
export function countUp(root=document){
  $$('[data-count]', root).forEach(el=>{
    const target=+el.dataset.count, suf=el.dataset.suf||'';
    if(reduceMotion()){ el.textContent=fmtNum(target)+suf; return; }
    const t0=performance.now(), d=1000;
    const step=t=>{ const k=Math.min(1,(t-t0)/d), e=1-Math.pow(1-k,3); el.textContent=fmtNum(Math.round(target*e))+suf; if(k<1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
export function toast(m){ const t=$('#toast'); t.innerHTML=`<span class="ti">${ic('check')}</span>${esc(m)}`; t.classList.add('on'); clearTimeout(t._h); t._h=setTimeout(()=>t.classList.remove('on'),2600); }
export const statusPill = s => ({'حاضر':'ok','متأخر':'warn','غائب':'bad','مسجل':'ok','ملغى':'bad'}[s]||'g');

/* ---------- السمة: فاتح / داكن / تلقائي ---------- */
export function getTheme(){ try{ return localStorage.getItem('sama_theme')||'auto'; }catch(e){ return 'auto'; } }
export function applyTheme(t){
  const dark = t==='dark' || (t==='auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const b=$('#themeBtn'); if(b){ b.innerHTML = ic(dark?'sun':'moon'); b.title = dark?'الوضع الفاتح':'الوضع الداكن'; }
}
export function setTheme(t){ try{ localStorage.setItem('sama_theme',t); }catch(e){} applyTheme(t); }

