/* رسوم مجسّمة للبوابات الثلاث (الخطوة AP): تدرجات وإضاءة وظل تعطي إحساسًا ثلاثي الأبعاد، من ألوان المنصة */
const defs = p => `<defs>
  <radialGradient id="${p}sk" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#FFE3C7"/><stop offset=".65" stop-color="#F2B98C"/><stop offset="1" stop-color="#C98557"/></radialGradient>
  <linearGradient id="${p}tl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3FB4AE"/><stop offset="1" stop-color="#0B5A5E"/></linearGradient>
  <linearGradient id="${p}gd" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD36B"/><stop offset="1" stop-color="#D99A1E"/></linearGradient>
  <linearGradient id="${p}bl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7FB2F0"/><stop offset="1" stop-color="#2F5FA8"/></linearGradient>
  <radialGradient id="${p}gl" cx="50%" cy="20%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <radialGradient id="${p}sh" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#0B3B3E" stop-opacity=".35"/><stop offset="1" stop-color="#0B3B3E" stop-opacity="0"/></radialGradient>
</defs>`;
const bust = (p, x, y, s, body) => `<g transform="translate(${x} ${y}) scale(${s})">
  <path d="M-30 46c0-22 13-34 30-34s30 12 30 34z" fill="url(#${p}${body})"/><path d="M-30 46c0-22 13-34 30-34s30 12 30 34z" fill="url(#${p}gl)"/>
  <circle cx="0" cy="-4" r="17" fill="url(#${p}sk)"/><ellipse cx="-6" cy="-11" rx="6" ry="4" fill="#fff" opacity=".35"/></g>`;

export const PORTAL_ART = {
  student:`<svg viewBox="0 0 120 120" aria-hidden="true">${defs('ps')}
    <ellipse cx="60" cy="108" rx="38" ry="7" fill="url(#pssh)"/>
    ${bust('ps', 60, 62, 1, 'tl')}
    <g><path d="M44 44v6c0 3 7 6 16 6s16-3 16-6v-6l-16 6z" fill="#12474B"/>
      <path d="M60 26 28 38l32 12 32-12z" fill="#0B3B3E"/><path d="M60 26 28 38l32 12 32-12z" fill="url(#psgl)"/>
      <path d="M88 39v16" stroke="url(#psgd)" stroke-width="3" stroke-linecap="round"/><circle cx="88" cy="57" r="4" fill="url(#psgd)"/></g>
    <g transform="translate(80 78)"><rect x="0" y="0" width="22" height="16" rx="3" fill="url(#psgd)"/><path d="M4 5h14M4 10h9" stroke="#fff" stroke-width="2" stroke-linecap="round"/></g></svg>`,
  guardian:`<svg viewBox="0 0 120 120" aria-hidden="true">${defs('pg')}
    <ellipse cx="60" cy="108" rx="44" ry="7" fill="url(#pgsh)"/>
    ${bust('pg', 46, 56, 1.05, 'tl')}
    ${bust('pg', 82, 72, .72, 'bl')}
    <g transform="translate(82 26)"><path d="M0 8c-4-8-16-6-16 3 0 7 9 12 16 18 7-6 16-11 16-18 0-9-12-11-16-3z" fill="url(#pggd)"/><path d="M-9 4c3-2 6-1 7 2" stroke="#fff" stroke-width="2" stroke-linecap="round" fill="none" opacity=".8"/></g></svg>`,
  teacher:`<svg viewBox="0 0 120 120" aria-hidden="true">${defs('pt')}
    <ellipse cx="60" cy="108" rx="44" ry="7" fill="url(#ptsh)"/>
    <g><rect x="44" y="18" width="62" height="44" rx="6" fill="#fff" stroke="#0B5A5E" stroke-width="3"/><rect x="44" y="18" width="62" height="44" rx="6" fill="url(#ptgl)"/>
      <rect x="54" y="42" width="8" height="12" rx="2" fill="url(#ptbl)"/><rect x="67" y="34" width="8" height="20" rx="2" fill="url(#pttl)"/><rect x="80" y="27" width="8" height="27" rx="2" fill="url(#ptgd)"/>
      <path d="M75 62v30M64 92h22" stroke="#0B5A5E" stroke-width="3" stroke-linecap="round"/></g>
    ${bust('pt', 34, 64, 1, 'bl')}
    <path d="M48 70 66 46" stroke="url(#ptgd)" stroke-width="4" stroke-linecap="round"/><circle cx="66" cy="46" r="3.5" fill="#D99A1E"/></svg>`,
};

/* صور واقعية للبوابات الثلاث (الخطوة BW، طلب المالك 24 نوفمبر): قاعة التدريب للمتدرب، ومكتب المدرب، والأب والأم لولي الأمر */
const PHOTO = import.meta.glob('./assets/portals/*.webp', { eager:true, query:'?url', import:'default' });
export const PORTAL_PHOTO = { student:PHOTO['./assets/portals/student.webp'] || '', teacher:PHOTO['./assets/portals/teacher.webp'] || '', guardian:PHOTO['./assets/portals/guardian.webp'] || '' };
