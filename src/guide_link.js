/* زر «دليل الاستخدام» العائم أسفل يسار الشاشة: يفتح دليل القسم المصوّر (public/guide/*.html) في نافذة جديدة */
import { ic } from './views2_head.js';

export const GUIDES = { admin:'admin', teacher:'trainer', student:'trainee' };
export function mountGuide(kind){
  const g = GUIDES[kind]; if(!g || document.getElementById('guideFab')) return;
  const a = document.createElement('a');
  a.id = 'guideFab'; a.className = 'guide-fab'; a.href = `../guide/${g}.html`; a.target = '_blank'; a.rel = 'noopener';
  a.setAttribute('aria-label', 'دليل الاستخدام (يفتح في نافذة جديدة)');
  a.innerHTML = `${ic('book')}<span>دليل الاستخدام</span>`;
  document.body.appendChild(a); document.body.classList.add('has-guide');
  /* شاشة القاعة والباركود تُعرض للعامة: لا زر فيها */
  const sync = () => { a.hidden = /^#(display|qr-)/.test(location.hash); }; sync(); window.addEventListener('hashchange', sync);
}
