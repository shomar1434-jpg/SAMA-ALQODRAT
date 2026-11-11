/* مركز السياسات: إصدارات مرقّمة بتاريخ سريان وجهة اعتماد، وإقرار قبول عند التسجيل.
   مطابق لـ supabase/migrations/…_policies.sql (current_policies، check_policy_acceptance). */
import { esc } from './utils.js';

export const POLICY_KINDS = [
  { slug:'terms',      title:'شروط الاستخدام',                 acceptance:true },
  { slug:'privacy',    title:'سياسة الخصوصية وحماية البيانات',  acceptance:true },
  { slug:'admission',  title:'آلية التسجيل والقبول',            acceptance:false },
  { slug:'attendance', title:'الحضور والتأخر والغياب',          acceptance:false },
  { slug:'assessment', title:'الواجبات والاختبارات',            acceptance:false },
  { slug:'certificates', title:'سياسة الشهادات',                acceptance:false },
  { slug:'fees',       title:'الرسوم والدفع والاسترداد',        acceptance:true },
  { slug:'conduct',    title:'مدونة السلوك',                    acceptance:true },
  { slug:'complaints', title:'الشكاوى والمقترحات',              acceptance:false },
  { slug:'rights',     title:'حقوق المتدرب وولي الأمر',         acceptance:false }
];
export const PLACEHOLDER = 'يُكمل من الإدارة';
export const POLICY_STATUS = { draft:'مسودة', published:'منشورة' };
export const kindOf = slug => POLICY_KINDS.find(k => k.slug === slug);

/* أحدث إصدار منشور ساري لكل سياسة في التاريخ المعطى */
export function currentPolicies(list, date){
  const out = {};
  (list || []).filter(p => p.status === 'published' && p.effective_date <= date)
    .forEach(p => { if(!out[p.slug] || p.version > out[p.slug].version) out[p.slug] = p; });
  return POLICY_KINDS.map(k => out[k.slug]).filter(Boolean);
}
/* إصدارات منشورة لم يحن سريانها بعد */
export const upcomingPolicies = (list, date) => (list || []).filter(p => p.status === 'published' && p.effective_date > date)
  .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
export const requiredPolicies = (list, date) => currentPolicies(list, date).filter(p => p.requires_acceptance);
export const historyOf = (list, slug) => (list || []).filter(p => p.slug === slug && p.status === 'published').sort((a, b) => b.version - a.version);
export const nextVersion = (list, slug) => Math.max(0, ...(list || []).filter(p => p.slug === slug && p.status === 'published').map(p => p.version)) + 1;

/* يُرمى خطأ إن لم تُقبل كل السياسات الواجب قبولها (الإصدار الساري نفسه) */
export function checkAcceptance(list, date, ids){
  const got = new Set(ids || []), miss = requiredPolicies(list, date).filter(p => !got.has(p.id));
  if(miss.length) throw new Error('يلزم قبول: ' + miss.map(p => p.title).join('، '));
  return requiredPolicies(list, date).map(p => p.id);
}

export function validatePolicy(p, publishing){
  if(!kindOf(p.slug)) throw new Error('نوع السياسة غير معروف');
  if(String(p.title || '').trim().length < 3) throw new Error('اكتب عنوان السياسة');
  if(String(p.body || '').trim().length < 20) throw new Error('نص السياسة قصير جدًا');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(p.effective_date || '')) throw new Error('حدد تاريخ السريان');
  if(publishing && String(p.approved_by || '').trim().length < 3) throw new Error('اكتب جهة الاعتماد قبل النشر');
  if(publishing && String(p.body).includes(PLACEHOLDER)) throw new Error('أكمل الأقسام المعلّمة «يُكمل من الإدارة» قبل النشر');
}

/* نص بسيط: «## » عنوان، «- » بند، وسطر فارغ يفصل الفقرات. يُهرَّب كل النص. */
export function renderPolicyBody(text){
  const out = []; let ul = null;
  const flush = () => { if(ul){ out.push(`<ul>${ul.join('')}</ul>`); ul = null; } };
  String(text || '').split(/\r?\n/).forEach(line => { const l = line.trim();
    if(!l){ flush(); return; }
    if(l.startsWith('## ')){ flush(); out.push(`<h3>${esc(l.slice(3))}</h3>`); return; }
    if(/^[-•]\s/.test(l)){ (ul = ul || []).push(`<li>${esc(l.slice(2))}</li>`); return; }
    flush(); out.push(`<p>${esc(l)}</p>`); });
  flush(); return out.join('');
}

/* مسودات أولية بهيكل مقترح فقط — لا تُنشر حتى تكتب الإدارة النص المعتمد */
export function demoPolicies(today){
  const outline = {
    terms:['نطاق الخدمة','حساب المتدرب ومسؤولية صحة البيانات','الاستخدام المقبول للمنصة','التعديل على الشروط'],
    privacy:['البيانات التي نجمعها (الاسم، السجل المدني، الجوال، البريد، الحضور)','الغرض من المعالجة','من يطّلع على البيانات','مدة الاحتفاظ والإتلاف','حقوق صاحب البيانات وفق نظام حماية البيانات الشخصية','موافقة ولي الأمر لمن هم دون 18 سنة','التواصل بشأن الخصوصية'],
    admission:['شروط القبول','خطوات التسجيل','تأكيد المقعد'], attendance:['تسجيل الحضور بالباركود','التأخر والانصراف المبكر','احتساب الغياب ونسبة الحضور','الأعذار'],
    assessment:['الواجبات ومواعيد التسليم','اختبارات قياس المستوى','النزاهة الأكاديمية'], certificates:['شروط استحقاق الشهادة','التحقق من الشهادة'],
    fees:['الرسوم والأقساط','طرق الدفع','الاسترداد والإلغاء'], conduct:['الالتزام داخل القاعة','التعامل مع المعلمين والزملاء','المخالفات وإجراءاتها'],
    complaints:['قنوات تقديم الشكوى','مدة المعالجة','التصعيد'], rights:['حقوق المتدرب','حقوق ولي الأمر','الاطلاع على السجلات']
  };
  return POLICY_KINDS.map((k, i) => ({ id:'pol-' + k.slug, slug:k.slug, title:k.title, version:0, status:'draft', requires_acceptance:k.acceptance,
    effective_date:today, approved_by:'', sort:i, created_at:new Date().toISOString(),
    body:'مسودة بهيكل مقترح. اكتب النص المعتمد في كل قسم ثم انشر.\n\n' + outline[k.slug].map(h => `## ${h}\n- ${PLACEHOLDER}`).join('\n\n') }));
}
