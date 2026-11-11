// خادم ثابت صغير يخدم dist/ للاختبارات (الوحدات لا تعمل من file://)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import fs from 'node:fs';

export function serveDist() {
  const dist = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) { console.error('شغّل npm run build أولًا'); process.exit(1); }
  const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.svg': 'image/svg+xml' };
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
