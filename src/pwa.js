/* =====================================================================
   التطبيق القابل للتثبيت (PWA): تسجيل عامل الخدمة، وزر التثبيت وإرشاده (أندرويد، ويندوز، ماك، آيفون)،
   وإشعار «يتوفر تحديث»، وإشعارات الجهاز حين تكون المنصة في الخلفية.
   لا شيء يُنفَّذ عند التحميل: تُستدعى initPwa من boot() و bootPortal().
   ===================================================================== */
import { $ } from './utils.js';
import { ic, toast } from './views2_head.js';
import { publicBase } from './config.js';
import { modal, closeModal } from './views2_programs.js';

let reg = null, deferred = null, reloading = false;
const DL = '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4M5 21h14"/></svg>';
export const isStandalone = () => (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
/* نوع الجهاز لإرشاد التثبيت */
export function platformOf(ua = navigator.userAgent, touch = navigator.maxTouchPoints || 0){
  if(/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touch > 1)) return 'ios';
  if(/Android/.test(ua)) return 'android';
  if(/Macintosh/.test(ua)) return /Safari/.test(ua) && !/Chrome|Chromium|Edg/.test(ua) ? 'mac-safari' : 'desktop';
  return 'desktop';
}
export const INSTALL_STEPS = {
  ios:['افتح الموقع في متصفح Safari.', 'اضغط زر المشاركة (المربع الذي يخرج منه سهم) في شريط المتصفح.', 'اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة».', 'افتح الموقع من أيقونتها الجديدة، ثم فعّل الإشعارات من جرس الإشعارات.'],
  android:['افتح قائمة المتصفح (النقاط الثلاث أعلى الشاشة).', 'اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».', 'أكّد بالضغط على «تثبيت».'],
  'mac-safari':['من شريط القوائم اختر «ملف».', 'اختر «إضافة إلى Dock».', 'افتح الموقع من أيقونتها في Dock.'],
  desktop:['في متصفح Chrome أو Edge اضغط أيقونة التثبيت في شريط العنوان (شاشة عليها سهم).', 'أو من قائمة المتصفح اختر «تثبيت مركز سما القدرات».', 'يُفتح الموقع بعدها في نافذة مستقلة، ولها أيقونة على سطح المكتب.']
};
const PLAT_TXT = { ios:'آيفون وآيباد', android:'أندرويد', 'mac-safari':'ماك (Safari)', desktop:'الكمبيوتر (ويندوز وماك)' };

function installModal(){
  const pf = platformOf();
  modal(`<h3>${DL} تثبيت الموقع كتطبيق</h3><p class="hint" style="margin:-4px 0 12px">تفتح بضغطة من الشاشة الرئيسية، وتعمل بملء الشاشة، وتصلك إشعاراتها على الجهاز.</p>
    ${deferred ? `<button class="btn pri lg" id="pwaGo" style="width:100%">${DL} تثبيت الآن</button><p class="hint" style="text-align:center;margin:10px 0 0">أو يدويًا:</p>` : ''}
    <h4 style="margin:12px 0 6px;font-size:15px">${PLAT_TXT[pf]}</h4><ol class="pwa-steps">${INSTALL_STEPS[pf].map(x => `<li>${x}</li>`).join('')}</ol>
    <details class="pwa-more"><summary>أجهزة أخرى</summary>${Object.keys(INSTALL_STEPS).filter(k => k !== pf).map(k => `<h4 style="margin:10px 0 4px;font-size:14px">${PLAT_TXT[k]}</h4><ol class="pwa-steps">${INSTALL_STEPS[k].map(x => `<li>${x}</li>`).join('')}</ol>`).join('')}</details>
    <div style="text-align:end;margin-top:12px"><button class="btn" id="pwaX">إغلاق</button></div>`);
  $('#pwaX').onclick = closeModal;
  if($('#pwaGo')) $('#pwaGo').onclick = async () => { const d = deferred; deferred = null; closeModal(); try { d.prompt(); const r = await d.userChoice; if(r.outcome === 'accepted') toast('جارٍ تثبيت الموقع'); } catch(_){} };
}
function mountInstallBtn(){
  if(isStandalone() || $('#installBtn') || !$('#themeBtn')) return;
  const b = document.createElement('button'); b.id = 'installBtn'; b.type = 'button'; b.className = 'themebtn'; b.setAttribute('aria-label', 'تثبيت الموقع كتطبيق'); b.title = 'تثبيت الموقع كتطبيق'; b.innerHTML = DL;
  $('#themeBtn').before(b); b.onclick = installModal;
}

/* إشعار «يتوفر تحديث»: يُفعَّل الإصدار الجديد عند طلب المستخدم ثم تُعاد الصفحة */
function showUpdate(worker){
  if($('#pwaUpdate')) return;
  const box = document.createElement('div'); box.id = 'pwaUpdate'; box.setAttribute('role', 'status');
  box.innerHTML = `<span>${ic('refresh')} يتوفر تحديث للموقع</span><button class="btn pri sm" id="pwaUp">تحديث الآن</button><button class="btn sm ghost" id="pwaLater" aria-label="لاحقًا">لاحقًا</button>`;
  document.body.appendChild(box);
  $('#pwaLater').onclick = () => box.remove();
  $('#pwaUp').onclick = () => { reloading = true; $('#pwaUp').disabled = true; worker.postMessage('SKIP_WAITING'); setTimeout(() => location.reload(), 4000); };
}
export async function initPwa(){
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; });
  window.addEventListener('appinstalled', () => { deferred = null; $('#installBtn')?.remove(); });
  mountInstallBtn();
  if(!('serviceWorker' in navigator) || !/^https?:$/.test(location.protocol) || import.meta.env.DEV) return;
  try {
    reg = await navigator.serviceWorker.register(new URL('sw.js', publicBase()).href);
    const watch = w => w && w.addEventListener('statechange', () => { if(w.state === 'installed' && navigator.serviceWorker.controller) showUpdate(w); });
    if(reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
    watch(reg.installing); reg.addEventListener('updatefound', () => watch(reg.installing));
    navigator.serviceWorker.addEventListener('controllerchange', () => { if(reloading) location.reload(); });
    document.addEventListener('visibilitychange', () => { if(!document.hidden) reg.update().catch(() => {}); });
  } catch(_){ reg = null; }                // بيئات تمنع عامل الخدمة (معاينة داخل إطار، وضع خاص): تعمل المنصة دونه
}

/* ---------- إشعارات الجهاز ---------- */
export const notifyState = () => !('Notification' in window) ? 'unsupported' : Notification.permission;      // default | granted | denied | unsupported
export async function askNotify(){ if(!('Notification' in window)) return 'unsupported'; try { return await Notification.requestPermission(); } catch(_){ return Notification.permission; } }
/* يُظهر إشعارًا على الجهاز إن أُذن بذلك؛ عبر عامل الخدمة (يلزم على الجوال) وإلا مباشرة */
export async function deviceNotify(title, body, tag){
  if(notifyState() !== 'granted') return false;
  const opt = { body, tag, dir:'rtl', lang:'ar', icon:new URL('pwa/icon-192.png', publicBase()).href, badge:new URL('pwa/badge-96.png', publicBase()).href, data:{ url:location.href } };
  try { if(reg){ await reg.showNotification(title, opt); return true; } } catch(_){}
  try { const n = new Notification(title, opt); n.onclick = () => { window.focus(); n.close(); }; return true; } catch(_){ return false; }
}
