/* =====================================================================
   الخطوة BE (قرار المالك 17 نوفمبر): تذكّر من طلب الخدمة من مساعد سما، وقياس الطلب، والإرسال شبه الآلي.
   - لا يُحفظ رقم أي زائر إلا من ضغط «أبلغوني» وكتب اسمه وواتسابه ووافق، مرتبطًا بالبرنامج أو الباقة التي سأل عنها.
   - الاستفسارات تُعدّ بلا أرقام (محادثة واحدة = استفسار واحد لكل منتج في الدورة). تجاوز الحد (10) ينبّه الإدارة،
     ويخبر السائل بأن هناك مجالًا للتسجيل ليتواصل مع المركز؛ لا يُفتح التسجيل آليًا.
   - الإرسال من واتساب المركز بزر يضغطه المسؤول (رسالة جاهزة)، ويُسجَّل المرسَل فلا يتكرر في الحملة.
   ↔ supabase/migrations/…_assistant_interests.sql
   ===================================================================== */
import { normalizeQuestion } from './assistant_logic.js';

export const DEMAND_THRESHOLD = 10;          // «أكثر من 10 استفسارات» ← التنبيه عند الحادي عشر
export const INTEREST_DAYS = 365;            // مدة حفظ المهتم بعد آخر تحديث
export const CENTER_WA = '966561606878';
export const CAMPAIGN_KIND = { availability: 'إتاحة التسجيل', offer: 'عرض' };
const STOP = new Set(['برنامج', 'دوره', 'دورة', 'باقه', 'باقة', 'في', 'من', 'الي', 'علي', 'عن', 'و', 'مع', 'ال', 'مهارات', 'تدريب']);
const toks = s => normalizeQuestion(s).split(' ').filter(w => w.length > 2 && !STOP.has(w));
const TIER_WORDS = { basic: ['الاساسيه'], silver: ['الفضيه'], gold: ['الذهبيه'], diamond: ['الماسيه'], custom: ['خصصناها'] };

/* المنتجات القابلة للاهتمام: البرامج النشطة والباقات الحضورية المفتوحة أو القريبة */
export function productsOf(programs = [], plans = [], planName = p => p.name) {
  return [
    ...programs.filter(p => p.active !== false).map(p => ({ kind: 'program', id: p.id, name: p.name })),
    ...plans.filter(p => p.active !== false).map(p => ({ kind: 'plan', id: p.id, name: planName(p), tier: p.tier, mode: p.mode })),
  ];
}
/* أي منتج يقصده السؤال؟ الباقة باسم مستواها، والبرنامج باسمه كاملًا أو بكلمتين مميزتين منه على الأقل */
export function matchProduct(question, products) {
  const q = normalizeQuestion(question), qt = new Set(toks(question));
  if (!q) return null;
  let best = null, bestScore = 0;
  for (const p of products) {
    let score = 0;
    if (p.kind === 'plan') {
      const w = TIER_WORDS[p.tier] || toks(p.name);
      if (w.some(x => q.includes(x))) score = 50 + (p.mode === 'remote' ? (/(بعد|اونلاين|اون لاين)/.test(q) ? 5 : -5) : 0);
    } else {
      const n = normalizeQuestion(p.name);
      if (n.length >= 6 && q.includes(n)) score = 100 + n.length / 10;
      else { const pt = toks(p.name), hits = pt.filter(w => qt.has(w)).length; if (hits >= 2 || (hits === 1 && pt.length === 1)) score = hits * 10 + hits / pt.length; }
    }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return best ? { kind: best.kind, id: best.id, name: best.name } : null;
}
/* بيانات «أبلغوني»: الاسم حروف فقط، والجوال سعودي يبدأ بـ05، والموافقة إلزامية */
export function checkInterest(f) {
  const name = String(f.full_name || '').trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 80 || /[0-9٠-٩<>]/.test(name)) throw new Error('اكتب اسمك بالحروف');
  const phone = String(f.phone || '').trim().replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/\D/g, '');
  if (!/^05\d{8}$/.test(phone)) throw new Error('اكتب رقم واتساب صحيحًا يبدأ بـ05');
  if (!['program', 'plan'].includes(f.kind) || !f.ref_id) throw new Error('اختر البرنامج أو الباقة');
  if (f.consent !== true) throw new Error('وافق على استقبال رسائل المركز ليصلك الإشعار');
  return { full_name: name, phone, kind: f.kind, ref_id: f.ref_id };
}
/* نص الرسالة الجاهزة من واتساب المركز */
export function campaignText(c, interest, productName) {
  const hi = `مرحبًا ${String(interest.full_name || '').split(' ')[0]}،`;
  const stop = '\nلإيقاف هذه الرسائل أرسل «إيقاف».';
  if (c.kind === 'availability') return `${hi}\nيسرّ مركز سما القدرات للتدريب إبلاغك بأن هناك مجالًا للتسجيل في «${productName}» الذي استفسرت عنه.\nتواصل معنا لحجز مقعدك.${c.message ? '\n' + c.message : ''}${stop}`;
  return `${hi}\nيسرّ مركز سما القدرات للتدريب تقديم عرض «${c.title}»${productName ? ` على «${productName}»` : ''}.\n${c.message}\nللاستفسار والتسجيل تواصل معنا.${stop}`;
}
export const centerChat = text => `https://api.whatsapp.com/send?phone=${CENTER_WA}&text=${encodeURIComponent(text || '')}`;
/* المستهدفون في حملة: المهتمون النشطون بالمنتج (أو كل النشطين لعرض عام)، ومن لم يُرسل إليه بعد */
export function campaignTargets(c, interests, sends) {
  const done = new Set(sends.filter(s => s.campaign_id === c.id).map(s => s.interest_id));
  const rows = interests.filter(i => i.active !== false && (!c.ref_id || (i.kind === c.product_kind && i.ref_id === c.ref_id)));
  return { rows, left: rows.filter(i => !done.has(i.id)), done };
}
/* طلب كل منتج في دورته الحالية: الاستفسارات (محادثات مختلفة) والمهتمون، وتجاوز الحد */
export function demandRows(products, inquiries, interests, demand, threshold = DEMAND_THRESHOLD) {
  return products.map(p => {
    const d = demand.find(x => x.kind === p.kind && x.ref_id === p.id) || {}, since = d.cycle_started_at || '';
    const n = inquiries.filter(x => x.kind === p.kind && x.ref_id === p.id && (!since || x.created_at >= since)).length;
    const ints = interests.filter(x => x.kind === p.kind && x.ref_id === p.id && x.active !== false).length;
    return { ...p, inquiries: n, interests: ints, high: n > threshold, alerted_at: d.alerted_at || null, handled_at: d.handled_at || null, cycle_started_at: since || null };
  }).filter(r => r.inquiries || r.interests).sort((a, b) => (b.high - a.high) || (b.inquiries - a.inquiries) || (b.interests - a.interests));
}
