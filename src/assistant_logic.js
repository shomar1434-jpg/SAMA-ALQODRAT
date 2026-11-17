import { DEFAULT_RESPONSES } from './assistant_defaults.js';

export const defaultResponses = () => structuredClone(DEFAULT_RESPONSES);

export function validateResponse(row) {
  if (!String(row.id || '').trim() || String(row.id).length > 100) throw new Error('معرّف الرد غير صالح');
  if (!String(row.title || '').trim() || row.title.length > 120) throw new Error('اكتب عنوانًا للرد لا يتجاوز ١٢٠ حرفًا');
  if (!String(row.category || '').trim() || row.category.length > 80) throw new Error('اكتب تصنيفًا للرد لا يتجاوز ٨٠ حرفًا');
  if (!String(row.answer || '').trim() || row.answer.length > 8000) throw new Error('اكتب ردًا لا يتجاوز ٨٠٠٠ حرف');
  for (const key of ['keywords', 'actions']) {
    if (!Array.isArray(row[key]) || row[key].length > 100 || row[key].some(x => typeof x !== 'string' || x.length > 300)) throw new Error('راجع الكلمات المفتاحية وأسئلة المتابعة');
  }
  return { id: row.id, title: row.title.trim(), category: row.category.trim(), answer: row.answer.trim(), keywords: row.keywords, actions: row.actions, active: row.active !== false };
}

export function normalizeQuestion(value) {
  return String(value || '').toLowerCase().normalize('NFKC').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/ـ|[\u064b-\u065f]/g, '').replace(/[\p{P}\p{S}]/gu, ' ').replace(/\s+/g, ' ').trim();
}
const words = value => [...new Set(normalizeQuestion(value).split(' ').filter(x => x.length > 1 && !['من', 'الي', 'عن', 'في', 'علي', 'هل', 'كيف', 'ما', 'انا', 'ابي', 'اريد', 'وش', 'هذا', 'هذه', 'ال'].includes(x)))];

export function matchResponse(rows, question) {
  const available = rows.filter(row => row.active !== false), text = normalizeQuestion(question), tokens = words(question);
  if (!text) return null;
  let best = null, bestScore = 0;
  for (const row of available) {
    if (row.id === 'unknown') continue;
    let score = 0;
    for (const phrase of [row.title, ...(row.keywords || [])]) {
      const normalized = normalizeQuestion(phrase);
      if (!normalized) continue;
      if (text === normalized) score = Math.max(score, 100 + normalized.length / 4);
      else if (normalized.length >= 4 && text.includes(normalized)) score = Math.max(score, 14 + normalized.split(' ').length * 5 + normalized.length / 8);
      else {
        const parts = words(phrase), hits = parts.filter(word => tokens.includes(word)).length;
        score = Math.max(score, hits * 3 / Math.sqrt(Math.max(1, parts.length)));
      }
    }
    if (score > bestScore) { best = row; bestScore = score; }
  }
  return bestScore >= 2.5 ? best : available.find(row => row.id === 'unknown') || null;
}
