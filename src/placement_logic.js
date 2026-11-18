/* اختبار تحديد المستوى (الخطوة BH، قرار المالك 18 نوفمبر): 20 سؤالًا مجانيًا للزائر بلا تسجيل ولا بيانات شخصية،
   من البنك المشترك المنشور ذي المفاتيح المعتمدة فقط، يُصحَّح في الخادم ويقترح الباقة.
   ↔ supabase/migrations/…_placement.sql (placement_status/placement_start/placement_finish، pl_recommend). */
import { pickSim, UNCAT, catOf, pct } from './sim_logic.js';

export const PL_KINDS = {
  qudurat: { title:'القدرات العامة', parts:{ 'لفظي':10, 'كمي':10 } },
  tahsili: { title:'التحصيلي', parts:{ 'تحصيلي':20 } },
};
export const PL_DEFAULTS = { placement_enabled:true, placement_sec_per_q:60, placement_low:40, placement_high:65, placement_daily_max:3 };
export const PL_WEAK = 50, PL_MIN_SKILL = 2, PL_GRACE_SEC = 120;
export const PL_TIER_TXT = { diamond:'الماسية', gold:'الذهبية', silver:'الفضية', basic:'الأساسية', custom:'خصصناها لك' };

export const plSet = st => ({ ...PL_DEFAULTS, ...Object.fromEntries(Object.keys(PL_DEFAULTS).filter(k => st && st[k] !== undefined && st[k] !== null).map(k => [k, st[k]])) });
export const plCount = kind => Object.values(PL_KINDS[kind]?.parts || {}).reduce((a, b) => a + b, 0);
export const plMinutes = (kind, st) => Math.max(1, Math.ceil(plCount(kind) * plSet(st).placement_sec_per_q / 60));
/* الأسئلة الصالحة: مشتركة، منشورة، مفتاحها معتمد */
export const plPool = (questions, subject) => (questions || []).filter(q => q.shared && q.status === 'published' && q.key_status === 'approved' && q.subject === subject);
export const plAvailable = (questions, kind) => Object.entries(PL_KINDS[kind].parts).every(([s, n]) => plPool(questions, s).length >= n);

/* نسخة السؤال للزائر: بلا الإجابة ولا الشرح */
export const plPublicQ = q => ({ id:q.id, subject:q.subject, text:q.text || '', options:q.options || [], image:q.image || '', page_image:q.page_image || '', code:q.code || '' });

export function plCheckSettings(p){
  const low = Math.round(+p.placement_low), high = Math.round(+p.placement_high), sec = Math.round(+p.placement_sec_per_q), max = Math.round(+p.placement_daily_max);
  if(!(low >= 1 && high <= 99 && low < high)) throw new Error('الحدان بين 1 و99، والأدنى أصغر من الأعلى');
  if(!(sec >= 20 && sec <= 300)) throw new Error('وقت السؤال بين 20 و300 ثانية');
  if(!(max >= 1 && max <= 20)) throw new Error('المحاولات اليومية بين 1 و20');
  return { placement_enabled:p.placement_enabled !== false && p.placement_enabled !== 'false', placement_low:low, placement_high:high, placement_sec_per_q:sec, placement_daily_max:max };
}

/* البناء: لكل قسم عدده من المجموعات (صفحة القطعة معًا)، كما في المحاكي */
export function plBuild(questions, kind, rnd = Math.random){
  const K = PL_KINDS[kind]; if(!K) throw new Error('اختر نوع الاختبار');
  const snap = [];
  for(const [s, n] of Object.entries(K.parts)){ const qs = pickSim(plPool(questions, s), n, new Set(), rnd); if(qs.length < n) throw new Error('الاختبار غير متاح حاليًا');
    qs.forEach(q => snap.push({ id:q.id, subject:s, category:q.category || '', correct:q.correct })); }
  return snap;
}

/* المهارات الضعيفة: المصنّفة فقط، بسؤالين فأكثر، ودون 50٪ */
export const plWeak = skills => Object.entries(skills || {}).filter(([k, v]) => k !== UNCAT && v.total >= PL_MIN_SKILL && pct(v.right, v.total) < PL_WEAK).map(([k]) => k).sort();

/* قرار المالك: دون 40٪ الماسية والذهبية، 40–65٪ الفضية، فوق 65٪ الأساسية، والضعف في مهارة أو مهارتين «خصصناها لك» */
export function plTiers(p, weak, st){
  const S = plSet(st), band = p < S.placement_low ? ['diamond', 'gold'] : p <= S.placement_high ? ['silver'] : ['basic'];
  return p >= S.placement_low && weak.length >= 1 && weak.length <= 2 ? ['custom', ...band] : band;
}
/* الباقات المقترحة: الحضورية المفتوحة التي تغطي مواد الاختبار، بترتيب الدرجات؛ وإن لم تُغطَّ درجة فما يغطي المواد */
export function plPlans(plans, kind, tiers){
  const subs = Object.keys(PL_KINDS[kind].parts);
  const ok = (plans || []).filter(x => x.mode === 'in_person' && x.status === 'open' && x.active !== false && subs.every(s => (x.subjects || []).includes(s)));
  const hit = tiers.map(t => ok.find(x => x.tier === t)).filter(Boolean);
  return (hit.length ? hit : ok.slice(0, 1)).map(x => ({ id:x.id, tier:x.tier, name:x.name }));
}

export function plGrade(snapshot, answers, kind, plans, st){
  const parts = {}, skills = {}; let score = 0;
  for(const q of snapshot){ const v = answers?.[q.id], a = v !== null && v !== '' && v !== undefined && Number.isInteger(+v) && +v >= 0 && +v < 4 ? +v : null, ok = a === q.correct, k = catOf(q);
    parts[q.subject] = parts[q.subject] || { right:0, total:0 }; parts[q.subject].total++;
    skills[k] = skills[k] || { right:0, total:0 }; skills[k].total++;
    if(ok){ score++; parts[q.subject].right++; skills[k].right++; } }
  const total = snapshot.length, p = pct(score, total), weak = plWeak(skills), tiers = plTiers(p, weak, st);
  return { score, total, pct:p, parts, skills, weak, tiers, plans:plPlans(plans, kind, tiers) };
}

/* نص واتساب المركز بملخص النتيجة (يرسله الزائر بنفسه) */
export const plWaText = (kind, r) => `السلام عليكم، أجريت اختبار تحديد المستوى (${PL_KINDS[kind].title}) في موقع مركز سما القدرات، ومؤشر جاهزيتي ${r.pct}٪، والباقة المقترحة: ${(r.plans || []).map(x => x.name).join(' أو ') || '—'}. أرغب بمعرفة التفاصيل.`;
