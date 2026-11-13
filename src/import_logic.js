/* =====================================================================
   استيراد المسجّلين سابقًا (قبل تشغيل المنصة) ومراجعة بيانات المتدربين.
   parseLegacy: يقرأ جدولًا ملصوقًا من Excel أو ملف CSV بأعمدة كشف المركز، ويستخرج لكل صف ملاحظاته.
   dataIssues: يفحص قاعدة المتدربين ويستخرج ما ينقص أو يحتاج مراجعة ليكمله مدير النظام.
   مطابق لـ admin_import_legacy في supabase/migrations/…_legacy_import.sql.
   ===================================================================== */
import { validSaudiId } from './utils.js';
import { subEnd, planTotal } from './qudurat.js';

const AR = '٠١٢٣٤٥٦٧٨٩', lat = v => String(v ?? '').replace(/[٠-٩]/g, d => AR.indexOf(d)).trim();
export const TIER_KEYS = [['custom', /خصص/], ['diamond', /ماسي/], ['gold', /ذهبي/], ['silver', /فضي/], ['basic', /[أا]ساسي/]];
export const METHOD_OF = s => { const v = String(s || ''); return /شبك/.test(v) && /كاش|نقد/.test(v) ? 'other' : /شبك/.test(v) ? 'pos' : /تحويل/.test(v) ? 'transfer' : /نقد|كاش/.test(v) ? 'cash' : v.trim() ? 'other' : ''; };
export const normPhone9 = v => { const d = lat(v).replace(/\D/g, ''); return /^5\d{8}$/.test(d) ? '0' + d : /^05\d{8}$/.test(d) ? d : /^9665\d{8}$/.test(d) ? '0' + d.slice(3) : ''; };
/* تاريخ: ISO أو يوم/شهر/سنة */
export const parseDate = v => { const s = lat(v); let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if(!m){ const x = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/); if(x) m = [0, x[3], x[2], x[1]]; }
  if(!m) return ''; const iso = `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`, d = new Date(iso + 'T12:00:00Z'); return !isNaN(d) && d.toISOString().slice(0, 10) === iso ? iso : ''; };
const numOf = v => { const m = lat(v).replace(/,/g, '').match(/\d+(\.\d+)?/g); return m ? Math.max(...m.map(Number)) : 0; };   // أكبر رقم في الخانة: «(خصم 25%) 600» = 600
const extra = v => lat(v).replace(/[\d.,٪%]+/g, ' ').replace(/[()\-–]/g, ' ').replace(/\s+/g, ' ').trim();
export function splitTable(text){
  const t = String(text || '').replace(/^﻿/, '').replace(/\r\n?/g, '\n'), sep = t.split('\n')[0].includes('\t') ? '\t' : ',';
  const rows = []; let row = [], cur = '', q = false;
  for(let i = 0; i < t.length; i++){ const c = t[i];
    if(q){ if(c === '"' && t[i + 1] === '"'){ cur += '"'; i++; } else if(c === '"') q = false; else cur += c; }
    else if(c === '"') q = true; else if(c === sep){ row.push(cur); cur = ''; } else if(c === '\n'){ row.push(cur); rows.push(row); row = []; cur = ''; } else cur += c; }
  if(cur || row.length){ row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}
/* مواضع الأعمدة من العناوين (ترتيب كشف المركز، أو أي ترتيب بعناوين مفهومة) */
function mapHeader(h){
  const H = h.map(x => lat(x)), find = re => H.findIndex(x => re.test(x)), M = { name:find(/اسم/), email:find(/بريد/), nid:find(/هوي|سجل/), gphone:find(/ولي/), plan:find(/برنامج|باق[ةه]$|^الباقة$/), date:find(/تاريخ/), fee:find(/رسوم الباق/), reg:find(/رسوم التسجيل/), gender:find(/جنس/), birth:find(/ميلاد/), pays:[] };
  M.phone = H.findIndex((x, i) => /جوال/.test(x) && i !== M.gphone);
  if(M.plan < 0) M.plan = find(/باق/);
  const meth = i => (i >= 0 && /طريق/.test(H[i + 1] || '')) ? i + 1 : -1;
  M.regMeth = meth(M.reg);
  H.forEach((x, i) => { if(/دفع[ةه]\s*\d/.test(x)) M.pays.push([i, meth(i)]); });
  return M;
}
/* ناتج: rows جاهزة للاستيراد، وكل صف يحمل notes (ما يحتاج مراجعة) و errors (ما يمنع استيراده) */
export function parseLegacy(text, gender, plans, today){
  const T = splitTable(text); if(T.length < 2) throw new Error('الصق الجدول مع صف العناوين');
  const M = mapHeader(T[0]); for(const [k, l] of [['name', 'اسم المتدرب'], ['nid', 'رقم الهوية'], ['phone', 'رقم الجوال'], ['plan', 'الباقة'], ['date', 'تاريخ التسجيل']]) if(M[k] < 0) throw new Error(`عمود «${l}» غير موجود في العناوين`);
  const seen = new Set(), out = [];
  for(const r of T.slice(1)){
    const g = i => i >= 0 ? String(r[i] ?? '').trim() : '', name = g(M.name).replace(/\s+/g, ' '), nid = lat(g(M.nid)).replace(/\D/g, '');
    if(!nid && name.replace(/[.\-ـ]/g, '').length < 2) continue;   // صف فارغ
    const notes = [], errors = [], planTxt = g(M.plan), cut = planTxt.search(/حضوري\s*\)?/), head = cut >= 0 ? planTxt.slice(0, cut) : planTxt, tail = cut >= 0 ? planTxt.slice(cut).replace(/^حضوري\s*\)?/, '').trim() : '';
    let tier = (TIER_KEYS.find(([, re]) => re.test(head)) || [])[0];
    const moved = tail && /حو[ّ]?ل|كمل|ترقي/.test(tail) && (TIER_KEYS.find(([, re]) => re.test(tail)) || [])[0];
    if(moved && moved !== tier){ notes.push(`تحويل بين الباقات: ${planTxt}`); tier = moved; } else if(tail) notes.push(`ملاحظة الباقة: ${tail}`);
    const plan = plans.find(p => p.tier === tier && p.mode === 'in_person');
    if(!plan) errors.push(`الباقة غير معروفة: ${planTxt || '—'}`);
    if(!/^[12]\d{9}$/.test(nid)) errors.push('رقم الهوية غير صحيح'); else if(seen.has(nid)) errors.push('رقم الهوية مكرر في الملف'); else { seen.add(nid); if(!validSaudiId(nid)) notes.push('رقم الهوية لا يجتاز فحص الصحة؛ تأكد منه'); }
    if(name.length < 3) errors.push('الاسم ناقص'); else if(name.split(' ').length < 3) notes.push('الاسم غير ثلاثي');
    const phone = normPhone9(g(M.phone)); if(!phone) errors.push('رقم الجوال غير صحيح');
    const gp = normPhone9(g(M.gphone)); if(!gp) notes.push(g(M.gphone) ? `جوال ولي الأمر ناقص أو غير صحيح: ${g(M.gphone)}` : 'جوال ولي الأمر غير مسجّل'); else if(gp === phone) notes.push('جوال ولي الأمر هو جوال المتدرب نفسه');
    const emailRaw = g(M.email), email = /^\S+@\S+\.\S+$/.test(emailRaw) ? emailRaw : ''; if(!email) notes.push('البريد الإلكتروني غير مسجّل');
    const start = parseDate(g(M.date)); if(!start) errors.push('تاريخ التسجيل غير مفهوم (اكتبه 2026-08-10 أو 10/08/2026)'); else if(start > today) errors.push('تاريخ التسجيل في المستقبل');
    const birth = parseDate(g(M.birth)); if(!birth) notes.push('تاريخ الميلاد غير مسجّل');
    const std = plan ? planTotal(plan) : 0, feeTxt = g(M.fee), total = numOf(feeTxt) || std, payments = [];
    let discount = extra(feeTxt);
    const pay = (ai, mi, label) => { const raw = g(ai); if(!raw || !numOf(raw)) return; const m = METHOD_OF(g(mi)), ex = [extra(raw), m === 'other' ? g(mi) : extra(g(mi)).replace(/شبكة|تحويل|نقدا|نقدًا|كاش/g, '').trim()].filter(Boolean).join(' · ');
      payments.push({ amount:numOf(raw), method:m || 'other', label, note:ex }); if(ex) notes.push(`${label}: ${ex}`); if(!m) notes.push(`${label}: طريقة السداد غير مسجّلة`); };
    pay(M.reg, M.regMeth, 'رسوم التسجيل'); M.pays.forEach(([a, b], i) => pay(a, b, `الدفعة ${i + 1}`));
    const paid = Math.round(payments.reduce((a, p) => a + p.amount, 0) * 100) / 100;
    if(plan && total !== std){ if(discount) notes.push(`رسوم مخفّضة (${total} بدل ${std}): ${discount}`); else { notes.push(`الرسوم ${total} تخالف سعر الباقة ${std} دون سبب مكتوب`); discount = ''; } }
    if(!paid) notes.push('لا دفعات مسجّلة'); else if(paid > total) notes.push(`المدفوع ${paid} أكثر من الرسوم ${total}`);
    const end = plan && start ? subEnd(plan, start) : '';
    if(end && end < today) notes.push('انتهت مدة الاشتراك');
    out.push({ full_name:name, national_id:nid, phone, guardian_phone:gp, email, gender:g(M.gender) && /أنث|بنت|طالبة/.test(g(M.gender)) ? 'أنثى' : g(M.gender) && /ذكر|طالب/.test(g(M.gender)) ? 'ذكر' : gender, birth_date:birth,
      plan_id:plan?.id || null, tier:tier || '', start_date:start, end_date:end, total, paid, remaining:Math.max(0, Math.round((total - paid) * 100) / 100), payments, discount_note:discount, notes, errors });
  }
  return out;
}
export const legacySummary = rows => ({ count:rows.length, ok:rows.filter(r => !r.errors.length).length, bad:rows.filter(r => r.errors.length).length, noted:rows.filter(r => !r.errors.length && r.notes.length).length,
  total:rows.reduce((a, r) => a + (r.errors.length ? 0 : r.total), 0), paid:rows.reduce((a, r) => a + (r.errors.length ? 0 : r.paid), 0) });

/* مراجعة البيانات: ما ينقص أو يحتاج نظرًا في قاعدة المتدربين. لكل متدرب قائمة ملاحظات؛ field يدل على الحقل الذي يكمله المسؤول */
export function dataIssues(D){
  const byPhone = {}; (D.trainees || []).forEach(t => { if(t.phone) (byPhone[t.phone] = byPhone[t.phone] || []).push(t.id); });
  const out = [];
  for(const t of D.trainees || []){
    const I = [], add = (text, field) => I.push({ text, field });
    if(!t.birth_date) add('تاريخ الميلاد غير مسجّل', 'birth_date');
    if(!t.email) add('البريد الإلكتروني غير مسجّل', 'email');
    if(!t.guardian_phone) add('جوال ولي الأمر غير مسجّل', 'guardian_phone'); else if(t.guardian_phone === t.phone) add('جوال ولي الأمر هو جوال المتدرب نفسه', 'guardian_phone');
    if(!/^05\d{8}$/.test(t.phone || '')) add('رقم الجوال غير صحيح', 'phone');
    if((t.full_name || '').trim().split(/\s+/).length < 3) add('الاسم غير ثلاثي', 'full_name');
    if(!validSaudiId(t.national_id || '')) add('رقم الهوية لا يجتاز فحص الصحة', 'national_id');
    if(!t.city) add('المدينة غير مسجّلة', 'city');
    if((byPhone[t.phone] || []).length > 1) add('الجوال مشترك مع متدرب آخر (يدخلان من الجوال نفسه)', null);
    for(const o of (D.orders || []).filter(x => x.trainee_id === t.id && x.approval !== 'rejected')){
      const sub = o.subscription_id && (D.subscriptions || []).find(s => s.id === o.subscription_id), plan = sub && (D.plans || []).find(p => p.id === sub.plan_id);
      if(plan && +o.total !== planTotal(plan) && !o.discount_note) add(`الطلب ${o.number}: الرسوم ${o.total} تخالف سعر الباقة ${planTotal(plan)} دون سبب مكتوب`, 'order:' + o.id);
      if(o.opening && !(+o.paid_amount > 0)) add(`الطلب ${o.number}: لا دفعات مسجّلة`, 'order:' + o.id);
      if(+o.paid_amount > +o.total) add(`الطلب ${o.number}: المدفوع ${o.paid_amount} أكثر من الرسوم ${o.total}`, 'order:' + o.id);
    }
    (t.import_notes || []).forEach((n, i) => { if(!n.done) I.push({ text:n.text, field:null, note:i }); });
    if(I.length) out.push({ trainee:t, issues:I });
  }
  return out.sort((a, b) => b.issues.length - a.issues.length || a.trainee.full_name.localeCompare(b.trainee.full_name, 'ar'));
}
/* ملاحظات الاستيراد التي تبقى مع المتدرب (ما لا يُكتشف من البيانات نفسها) */
export const keepNote = n => !/غير مسجّل|غير ثلاثي|جوال ولي الأمر هو|لا دفعات|أكثر من الرسوم|دون سبب مكتوب|لا يجتاز|انتهت مدة/.test(n);
