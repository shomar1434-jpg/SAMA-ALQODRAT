// اختبار تشغيل سريع: يفتح الصفحات الرئيسية في الوضع التجريبي ويتأكد من عدم وجود أخطاء.
import { chromium } from 'playwright';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const U = 'file:///' + path.join(root, 'index.html').replace(/\\/g, '/');
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
const go = async (h, w = 900) => { await p.evaluate(x => { location.hash = '#' + x; }, h); await p.waitForTimeout(w); };
let fail = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fail++; };

await p.goto(U + '#home'); await p.waitForTimeout(1500);
ok(await p.$('.pt-card'), 'شريط شركاء النجاح');
for (const r of ['register', 'checkin', 'me', 'verify']) { await go(r); ok(await p.$('#app *'), 'صفحة ' + r); }

await go('me'); await p.fill('[name=nid]', '123'); await p.click('#mGo'); await p.waitForTimeout(300);
ok(await p.$('#mfSum:not([hidden])'), 'حضوري يرفض رقمًا غير صحيح');

const code = await p.evaluate(() => { const D = LocalStore.data; const c = D.cohorts.find(c => !cohortArchived(c) && c.reg_open); return progCode(D.programs.find(x => x.id === c.program_id)); });
await go(code); await p.click('.tab[data-t=reg]').catch(() => {}); await p.waitForTimeout(300);
await p.type('[name=full_name]', 'Ali1 محمد!'); ok(!/[0-9!]/.test(await p.inputValue('[name=full_name]')), 'الاسم يقبل الحروف فقط');
await p.type('[name=phone]', '٠٥ab12'); ok(await p.inputValue('[name=phone]') === '0512', 'الجوال أرقام فقط مع تحويل العربية');

await go('admin', 500); await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200);
for (const r of ['admin', 'admin-attendance', 'admin-cohorts', 'admin-followup', 'admin-rules', 'admin-trainees', 'admin-programs', 'admin-reports', 'admin-partners', 'admin-settings']) {
  await go(r, 1000); ok(await p.$('#main *'), 'لوحة ' + r);
}
ok(errs.length === 0, 'لا أخطاء في الصفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); process.exit(fail ? 1 : 0);
