#!/usr/bin/env node
/* يحوّل حزمتَي بنك الكمي واللفظي (questions.json + صور) إلى حزمتَي استيراد للمنصة ومجلد صور جاهز للرفع إلى التخزين.
   الاستخدام: node scripts/build_bank_bundle.mjs <مجلد الكمي> <مجلد اللفظي> <مجلد الإخراج> [--draft=K3-09-01,K3-09-02]
   الناتج خارج المستودع: quant_bank.json، verbal_bank.json، assets/quant/*، assets/verbal/*. محتوى البنوك لا يوضع في المستودع. */
import fs from 'node:fs'; import path from 'node:path';
const [quantDir, verbalDir, outDir, ...rest] = process.argv.slice(2);
if(!quantDir || !verbalDir || !outDir){ console.error('الاستخدام: build_bank_bundle.mjs <quant> <verbal> <out> [--draft=codes]'); process.exit(1); }
const draft = new Set((rest.find(a => a.startsWith('--draft=')) || '').slice(8).split(',').filter(Boolean));
const copy = (from, to) => { fs.mkdirSync(path.dirname(to), { recursive:true }); fs.copyFileSync(from, to); };
const out = (name, obj) => fs.writeFileSync(path.join(outDir, name), JSON.stringify(obj));
fs.mkdirSync(outDir, { recursive:true });

const Q = JSON.parse(fs.readFileSync(path.join(quantDir, 'questions.json'), 'utf8')).questions;
const srcNo = {}; Q.forEach(q => { srcNo[q.source] = srcNo[q.source] || q.id.split('-')[0]; });
const quant = { subject:'كمي', title:'بنك الكمي المشترك', questions:Q.map((q, i) => { copy(path.join(quantDir, q.image), path.join(outDir, 'assets/quant', path.basename(q.image)));
  return { code:q.id, unit:q.unit, skill:`${q.source.replace(/\.pdf$/, '')} · صفحة ${q.page}`, order:i + 1, image:'quant/' + path.basename(q.image), correct:q.correct, key_status:'unverified',
    key_source:[q.keyMethod, q.keyReviewNote].filter(Boolean).join(' — ').slice(0, 160), active:q.active !== false && !draft.has(q.id), difficulty:q.difficulty === 'غير محدد' ? 'متوسط' : q.difficulty }; }) };
out('quant_bank.json', quant);

const V = JSON.parse(fs.readFileSync(path.join(verbalDir, 'questions.json'), 'utf8')), pages = new Set();
const verbal = { subject:'لفظي', title:'بنك اللفظي المشترك', questions:V.map(q => { const img = path.basename(q.image), pg = path.basename(q.page_image);
  if(fs.existsSync(path.join(verbalDir, q.image))) copy(path.join(verbalDir, q.image), path.join(outDir, 'assets/verbal', img));
  if(!pages.has(pg) && fs.existsSync(path.join(verbalDir, q.page_image))){ pages.add(pg); copy(path.join(verbalDir, q.page_image), path.join(outDir, 'assets/verbal', pg)); }
  return { code:q.id, unit:`النموذج ${q.model}`, skill:q.section, order:q.model * 1000 + q.n, image:'verbal/' + img, page_image:'verbal/' + pg, text:q.active === false ? (q.text || '') : '', correct:q.correct, key_status:'unverified',
    key_source:(q.answer_source === 'user_correction' ? 'تصحيح من إدارة المعهد' : 'جدول إجابات المصدر').slice(0, 160), active:q.active !== false && !draft.has(q.id) }; }) };
out('verbal_bank.json', verbal);
const n = b => `${b.questions.length} سؤالًا، منها ${b.questions.filter(q => q.active).length} منشور`;
console.log(`كمي: ${n(quant)} · لفظي: ${n(verbal)} · صفحات القطع: ${pages.size}`);
