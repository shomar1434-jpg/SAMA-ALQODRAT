// خادم ثابت صغير يخدم dist/ للاختبارات (الوحدات لا تعمل من file://)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';

export function serveDist() {
  const dist = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('شغّل npm run build أولًا'); process.exit(1); }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webmanifest': 'application/manifest+json' };
  const server = http.createServer((req, res) => {
    let f = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
    if (req.url.split('?')[0].endsWith('/')) f = path.join(f, 'index.html');
    if (!f.startsWith(dist) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  return { server, origin: `http://127.0.0.1:${server.address().port}/` };
}

// أداة نتائج مشتركة
export function reporter() {
  let fail = 0;
  const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };
  return { ok, failed: () => fail };
}

// الخطوة BG: الإجابة الافتراضية لسؤال «دون 18؟» في الباقة («لا»)، وإقرار ولي الأمر متى ظهر — لاختبارات لا تخص موافقة ولي الأمر
export async function autoConsent(p) {
  await p.evaluate(() => {
    const m = document.querySelector('#rfMinor'); if (m && !m.hidden && !document.querySelector('[name=minor]:checked')) document.getElementById('rf-minor-no').checked = true;
    const c = document.querySelector('#rfConsentL'); if (c && !c.hidden) document.getElementById('rf-guardian_consent').checked = true;
  });
}
