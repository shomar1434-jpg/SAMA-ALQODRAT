// الخطوة BV: حارس أحجام صور البرامج — يوقف الفحص (والنشر) إن أُضيفت صورة أثقل من 150KB أو أعرض من 1200px،
// ويتأكد أن لكل رمز في programImg صورة، ولا صورة بلا رمز.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { reporter } from './_server.mjs';
const { ok, failed } = reporter();
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dir = path.join(root, 'public', 'programs');
const MAX_KB = 150, MAX_W = 1200;
/* أبعاد WebP من رأس الملف (VP8 / VP8L / VP8X) */
function webpSize(b){
  if(b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const c = b.toString('ascii', 12, 16);
  if(c === 'VP8 ') return { w: b.readUInt16LE(26) & 0x3fff, h: b.readUInt16LE(28) & 0x3fff };
  if(c === 'VP8L'){ const v = b.readUInt32LE(21); return { w: (v & 0x3fff) + 1, h: ((v >> 14) & 0x3fff) + 1 }; }
  if(c === 'VP8X') return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
  return null;
}
const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
const heavy = [], wide = [], bad = [];
for(const f of files){
  const b = fs.readFileSync(path.join(dir, f));
  if(!f.endsWith('.webp')){ bad.push(f); continue; }
  const d = webpSize(b);
  if(!d) bad.push(f); else if(d.w > MAX_W) wide.push(`${f} ${d.w}px`);
  if(b.length > MAX_KB * 1024) heavy.push(`${f} ${Math.round(b.length / 1024)}KB`);
}
ok(!bad.length, 'صور البرامج كلها WebP صالحة' + (bad.length ? ': ' + bad.join('، ') : ''));
ok(!heavy.length, `لا صورة برنامج أثقل من ${MAX_KB}KB` + (heavy.length ? ': ' + heavy.join('، ') : ''));
ok(!wide.length, `لا صورة برنامج أعرض من ${MAX_W}px` + (wide.length ? ': ' + wide.join('، ') : ''));
const src = fs.readFileSync(path.join(root, 'src', 'program_showcase.js'), 'utf8');
const codes = [...(src.match(/const ART = new Set\(\[([^\]]*)\]/)?.[1] || '').matchAll(/'(p\d+)'/g)].map(m => m[1]);
const names = new Set(files.map(f => f.replace(/\.webp$/, '')));
const missing = codes.filter(c => !names.has(c)), orphan = [...names].filter(n => !codes.includes(n));
ok(codes.length > 0 && !missing.length, 'لكل رمز في programImg صورة' + (missing.length ? ': ' + missing.join('، ') : ''));
ok(!orphan.length, 'لا صورة بلا رمز في programImg' + (orphan.length ? ': ' + orphan.join('، ') : ''));
const total = files.reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0);
console.log(`صور البرامج: ${files.length} ملفًا، ${(total / 1048576).toFixed(1)}MB`);
if(failed()) process.exit(1);
