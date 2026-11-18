/* ---------------- أدوات عامة ---------------- */
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const DAYS = ['الأحد','الإثنين','الثلاثاء','الأربعاء','الخميس','الجمعة','السبت'];
export const CITIES = ['جازان','صبيا','أبو عريش','صامطة','بيش','أحد المسارحة','ضمد','الدرب','العارضة','الريث','الحرث','الطوال','فرسان','العيدابي','فيفاء','الدائر','هروب','مدينة أخرى'];
export const EDU = ['ثانوي','دبلوم','بكالوريوس','ماجستير','دكتوراه'];
export const PAL = ['#04A6B0','#F3A82D','#0B6E75','#F7C46C','#5CC6CD','#C77D12','#8FA3A6','#2F5D62'];
export const fmtNum = n => Number(n || 0).toLocaleString('ar-SA');
export const fmtMoney = n => Number(n || 0).toLocaleString('ar-SA') + ' ر.س';
export const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Math.random().toString(36).slice(2) + Date.now());

export function riyadhNow(){
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date()).map(p=>[p.type,p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const h = parts.hour === '24' ? '00' : parts.hour;
  return { date, time:`${h}:${parts.minute}:${parts.second}`, hm:`${h}:${parts.minute}`, dow:new Date(date+'T12:00:00Z').getUTCDay() };
}
export const addDays = (d, n) => { const x = new Date(d+'T12:00:00Z'); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10); };
export const dowOf = d => new Date(d+'T12:00:00Z').getUTCDay();
export const toMin = t => { const [h,m] = String(t).split(':').map(Number); return h*60+(m||0); };
export const fmtDate = d => new Date(d+'T12:00:00Z').toLocaleDateString('ar-SA-u-ca-gregory',{weekday:'long',day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
export const fmtShort = d => new Date(d+'T12:00:00Z').toLocaleDateString('ar-SA-u-ca-gregory',{day:'numeric',month:'short',timeZone:'UTC'});
export const t12 = t => { if(!t) return ''; let [h,m]=t.split(':').map(Number); const s=h>=12?'م':'ص'; h=h%12||12; return `${h}:${String(m).padStart(2,'0')} ${s}`; };

/* شكل رقم الهوية فقط (10 أرقام تبدأ بـ1 أو 2) — للبحث والتحضير، والخادم يتحقق من التسجيل؛ يقبل الحسابات التجريبية */
export const nidFormat = id => /^[12]\d{9}$/.test(String(id || ''));
export function validSaudiId(id){
  if(!/^[12]\d{9}$/.test(id)) return false;
  let s=0; for(let i=0;i<10;i++){ let d=+id[i]; if(i%2===0){ d*=2; if(d>9) d-=9; } s+=d; }
  return s%10===0;
}
export function makeSaudiId(prefix){
  let base = prefix + Array.from({length:8},()=>Math.floor(Math.random()*10)).join('');
  for(let c=0;c<10;c++){ if(validSaudiId(base+c)) return base+c; }
}
export function hash32(str){ let h=2166136261; for(let i=0;i<str.length;i++){ h^=str.charCodeAt(i); h=Math.imul(h,16777619);} return h>>>0; }

/* البحث: تطبيع عربي (الهمزات، التاء المربوطة، الألف المقصورة، التشكيل، الأرقام العربية) وكلمات متعددة بأي ترتيب.
   كل كلمة في نص البحث يجب أن تظهر في أحد الحقول؛ المسافات بين الكلمات مقبولة وتُطوى المكررة. */
export const normAr = s => String(s ?? '').toLowerCase().replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/[ً-ْـ]/g, '')
  .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/\s+/g, ' ').trim();
/* خيارات البحث عن شخص: كل الحقول، أو جزء محدد من الاسم، أو الهوية، أو الجوال */
export const SEARCH_SCOPES = { all:'كل الحقول', first:'الاسم الأول', father:'اسم الأب', family:'اسم العائلة', nid:'رقم الهوية', phone:'الجوال' };
export const scopeSelect = (id, val = 'all') => `<select class="inp" id="${id}" aria-label="البحث في" style="width:auto">${Object.entries(SEARCH_SCOPES).map(([k, v]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${k === 'all' ? 'البحث في: كل الحقول' : v}</option>`).join('')}</select>`;
export function matchPerson(scope, q, t, ...extra){
  if(!scope || scope === 'all') return matchQ(q, t?.full_name, t?.national_id, t?.phone, ...extra);
  const nq = normAr(q); if(!nq) return true;
  const parts = normAr(t?.full_name).split(' ').filter(Boolean), digits = v => String(v ?? '').replace(/\D/g, '');
  if(scope === 'first') return (parts[0] || '').startsWith(nq);
  if(scope === 'father') return (parts[1] || '').startsWith(nq);
  if(scope === 'family') return parts.length > 1 && (parts[parts.length - 1].startsWith(nq) || parts.slice(-2).join(' ').startsWith(nq) || parts.slice(2).join(' ').includes(nq));
  const dq = digits(normAr(q)); if(!dq) return false;
  if(scope === 'nid') return digits(t?.national_id).includes(dq);
  if(scope === 'phone') { const ph = digits(t?.phone), g = digits(t?.guardian_phone), d = dq.replace(/^(966|0)/, ''); return [ph, g].some(x => x && x.replace(/^(966|0)/, '').includes(d)); }
  return matchQ(q, t?.full_name);
}
export const matchQ = (q, ...fields) => { const toks = normAr(q).split(' ').filter(Boolean); if(!toks.length) return true;
  const hay = normAr(fields.filter(x => x != null && x !== '').join(' ')); return toks.every(t => hay.includes(t)); };
