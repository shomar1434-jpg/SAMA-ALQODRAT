// يبني supabase/seed_site.sql من المصادر الموحدة: نصوص السياسات (src/policy_texts.js) وشركاء النجاح (src/partners.js)
import { writeFileSync } from 'node:fs';
import { POLICY_KINDS } from '../src/policy_logic.js';
import { POLICY_TEXTS, POLICY_APPROVER, POLICY_EFFECTIVE, POLICY_SOURCE } from '../src/policy_texts.js';
import { defaultPartners } from '../src/site_partners.js';
const q = s => s == null ? 'null' : "'" + String(s).replace(/'/g, "''") + "'";
const pol = POLICY_KINDS.map(k => `insert into policies(slug, title, body, version, status, effective_date, approved_by, requires_acceptance, published_at)
select ${q(k.slug)}, ${q(k.title)}, ${q(POLICY_TEXTS[k.slug])}, 1, 'published', ${q(POLICY_EFFECTIVE)}, ${q(POLICY_APPROVER)}, ${k.acceptance}, now()
where not exists (select 1 from policies where slug = ${q(k.slug)});`);
const pts = defaultPartners().map(p => `(${q(p.name)}, ${q(p.name_en)}, ${q(p.type)}, ${q(p.logo)}, ${q(p.description)}, ${q(p.website)}, ${p.order})`);
writeFileSync(new URL('../supabase/seed_site.sql', import.meta.url),
  `-- مولَّد بـ npm run seed:site — لا تعدّله يدويًا.\n-- محتوى الموقع المنقول من ${POLICY_SOURCE}: السياسات المعتمدة (الإصدار الأول) وشركاء النجاح. آمن عند إعادة التشغيل.\n\n` +
  pol.join('\n\n') +
  `\n\ninsert into partners(name, name_en, type, logo, description, website, sort_order)\nselect * from (values\n  ${pts.join(',\n  ')}\n) v(name, name_en, type, logo, description, website, sort_order)\nwhere not exists (select 1 from partners);\n`);
console.log('seed_site.sql:', pol.length, 'policies,', pts.length, 'partners');
