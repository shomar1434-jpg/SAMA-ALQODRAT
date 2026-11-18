import { startLiveRefresh } from './live_refresh.js';
import { initBankMedia } from './bank_media.js';
import { mountAssistant } from './assistant_chat.js';
/* نقطة التشغيل المشتركة لكل الصفحات: تُستدعى بعد تحميل كل الوحدات */
import { setPage } from './config.js';
import { initStore, Store, LocalStore, cohortArchived, cohortState, progCode, enrollsOf, takenOf, activeCohortOf } from './data2.js';
import { applyTheme, getTheme, setTheme } from './views2_head.js';
import { route } from './views2_main.js';
import { initPwa } from './pwa.js';
import { mountGuide } from './guide_link.js';
import { $, makeSaudiId, riyadhNow } from './utils.js';

export function boot(page){
  setPage(page);
  initStore();
  // وضع البيانات التجريبية فقط: واجهة للاختبارات الآلية. لا تُعرض عند الاتصال بقاعدة البيانات.
  if(Store.mode === 'local') window.__SAMA__ = { LocalStore, cohortArchived, cohortState, progCode, enrollsOf, takenOf, activeCohortOf, makeSaudiId, riyadhNow };
  applyTheme(getTheme());
  /* تبديل السمة من الشريط العلوي، وإعادة رسم الرسوم بألوانها */
  $('#themeBtn').onclick = () => {
    const dark = document.documentElement.dataset.theme === 'dark';
    setTheme(dark ? 'light' : 'dark');
    if(page === 'admin') route();
  };
  if(window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if(getTheme() === 'auto') applyTheme('auto'); });
  window.addEventListener('hashchange', route);
  route();
  startLiveRefresh(Store, route, { minGap: page === 'admin' ? 20000 : 3000 });
  if(page === 'public') mountAssistant(Store);
  initPwa(); initBankMedia();
  if(page === 'admin') mountGuide('admin');
}
