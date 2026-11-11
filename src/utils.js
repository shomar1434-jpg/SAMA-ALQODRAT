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
