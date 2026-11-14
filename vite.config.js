import { defineConfig } from 'vite';
import { resolve, join, relative } from 'node:path';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

/* يولّد dist/sw.js بعد البناء: قائمة ملفات التطبيق للحفظ المسبق ورقم إصدار من محتواها */
function swPlugin(){
  let out = 'dist';
  return { name: 'sama-sw', apply: 'build', configResolved(c){ out = resolve(c.root, c.build.outDir); },
    closeBundle(){
      const files = []; const walk = d => readdirSync(d).forEach(f => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p); }); walk(out);
      const list = files.map(p => relative(out, p).split('\\').join('/')).filter(u => u !== 'sw.js' && !u.startsWith('admin/') && !u.startsWith('guide/') && /\.(html|js|css|webp|png|jpg|svg|webmanifest)$/.test(u)).sort();
      const h = createHash('sha256'); list.forEach(u => { h.update(u); h.update(readFileSync(join(out, u))); });
      const tpl = readFileSync(resolve(import.meta.dirname, 'scripts/sw.template.js'), 'utf8');
      writeFileSync(join(out, 'sw.js'), tpl.replace('__VERSION__', h.digest('hex').slice(0, 12)).replace('__PRECACHE__', JSON.stringify(list)));
    } };
}

// مشروع متعدد الصفحات: كل بوابة صفحة HTML مستقلة تشترك في وحدات src/
export default defineConfig({
  base: './',                       // روابط نسبية تعمل على GitHub Pages وأي مسار فرعي
  plugins: [swPlugin()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
        student: resolve(import.meta.dirname, 'student/index.html'),
        teacher: resolve(import.meta.dirname, 'teacher/index.html'),
        guardian: resolve(import.meta.dirname, 'guardian/index.html'),
      },
    },
  },
});
