/* صور بنك الأسئلة الخاصة (الخطوة BO، قرار المالك 19 نوفمبر)
   الحاوية «bank» خاصة: لا تُعرض الصورة برابط عام، بل برابط موقّع قصير الأجل يصدره التخزين لمن تسمح له
   سياسة `bank_signed_read` (↔ `bank_object_ok`: مسؤول، أو حساب بوابة مفعَّل، أو زائر اختبار تحديد المستوى لصور محاولته).
   العرض يكتب `data-bank="المسار"` بدل الرابط، ومراقب الصفحة يوقّع المسارات دفعةً ويضع الرابط. */
import { Store } from './data2.js';
import { assetUrl } from './learning_logic.js';
import { esc } from './utils.js';

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
const SIGNED_BASE = /\/storage\/v1\/object\/(public|sign|authenticated)\/bank\/?$/;
const cache = new Map();   // المسار ← { url, until }
const TTL = 5 * 3600e3;    // الرابط صالح 6 ساعات؛ يُجدَّد بعد 5

/* هل يلزم التوقيع؟ في السحابة حين يكون مسار الصور حاوية «bank» في Supabase */
export const needsSign = base => Store.mode === 'cloud' && SIGNED_BASE.test(String(base || '').trim());
const fresh = p => { const c = cache.get(p); return c && c.until > Date.now() ? c.url : ''; };

/* خاصية الصورة أو الرابط: src="…" أو href="…" مباشرة، أو data-bank للتوقيع */
export function bankAttr(path, base, attr = 'src'){
  if(!path) return `${attr}=""`;
  if(!needsSign(base) || /^(data:image\/|https?:\/\/)/.test(path)) return `${attr}="${esc(assetUrl(path, base))}"`;
  const u = fresh(path);
  return `data-bank="${esc(path)}" data-bank-attr="${attr}" ${attr}="${esc(u || (attr === 'src' ? PIXEL : '#'))}"${u ? ' data-bank-done="1"' : ''}`;
}

let pending = false;
export async function hydrateBank(root = document){
  const els = [...root.querySelectorAll('[data-bank]:not([data-bank-done])')]; if(!els.length) return;
  els.forEach(e => e.setAttribute('data-bank-done', '1'));
  const need = [...new Set(els.map(e => e.dataset.bank).filter(p => !fresh(p)))];
  for(let i = 0; i < need.length; i += 100){
    try { const m = await Store.signBankAssets(need.slice(i, i + 100)); Object.entries(m || {}).forEach(([p, url]) => url && cache.set(p, { url, until:Date.now() + TTL })); } catch(_){}
  }
  els.forEach(e => { const u = fresh(e.dataset.bank); if(u) e.setAttribute(e.dataset.bankAttr || 'src', u); else e.closest('.qimg')?.classList.add('img-missing'); });
}

/* يُستدعى من boot/bootPortal: كل ما يُرسم لاحقًا يُوقَّع تلقائيًا */
export function initBankMedia(){
  if(Store.mode !== 'cloud' || typeof MutationObserver === 'undefined') return;
  new MutationObserver(() => { if(pending) return; pending = true; requestAnimationFrame(() => { pending = false; hydrateBank(); }); })
    .observe(document.body, { childList:true, subtree:true });
  hydrateBank();
}
