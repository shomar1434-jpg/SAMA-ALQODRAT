import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// مشروع متعدد الصفحات: كل بوابة صفحة HTML مستقلة تشترك في وحدات src/
export default defineConfig({
  base: './',                       // روابط نسبية تعمل على GitHub Pages وأي مسار فرعي
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        admin: resolve(import.meta.dirname, 'admin/index.html'),
      },
    },
  },
});
