// الخطوة F: التوافقية — لا تمرير أفقي ولا عناصر لمس صغيرة ولا أخطاء، على مقاسات الجوال واللوحي والكمبيوتر،
// وعلى محركات المتصفحات الثلاثة (BROWSER=chromium|firefox|webkit؛ الافتراضي chromium).
import * as pw from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const engine = process.env.BROWSER || 'chromium';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await pw[engine].launch();
const SIZES = [['جوال صغير 320', 320, 568, true], ['جوال 360', 360, 740, true], ['آيفون 390', 390, 844, true], ['جوال كبير 430', 430, 932, true],
  ['لوحي طولي 768', 768, 1024, true], ['لوحي عرضي 1024', 1024, 768, false], ['لابتوب 1366', 1366, 768, false], ['شاشة 1920', 1920, 1080, false]];
const login = async (p, role, phone) => { await p.goto(U + role + '/'); await p.waitForSelector('#pl-phone'); await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForSelector('#otpF:not([hidden])');
  await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForSelector('#logoutBtn:not([hidden])'); await p.waitForTimeout(500); };
/* يفحص الصفحة الحالية: تمرير أفقي، وأهداف لمس أصغر من 44 (على شاشات اللمس)، ونص مدخلات أصغر من 16 (يسبب تكبير iOS) */
const audit = (p, touch) => p.evaluate(touch => {
  const de = document.documentElement, over = de.scrollWidth - de.clientWidth;
  const vis = el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('[hidden]'); };
  const lab = el => (el.id ? '#' + el.id : el.className ? '.' + String(el.className).split(' ')[0] : el.tagName.toLowerCase());
  const wide = []; if (over > 1) document.querySelectorAll('body *').forEach(el => { const r = el.getBoundingClientRect(); if (vis(el) && (r.right > de.clientWidth + 1 || r.left < -1) && !el.closest('.tblwrap,.mq,.cats,.tabs,[style*="overflow"]')) wide.push(lab(el)); });
  const small = [], tiny = [];
  if (touch) {
    document.querySelectorAll('button, a.btn, .tab, select, input:not([type=hidden]):not([type=radio]):not([type=checkbox]), textarea, summary').forEach(el => { if (!vis(el) || el.closest('.sr-only') || el.classList.contains('sr-only')) return;
      const r = el.getBoundingClientRect(); if (r.height < 43.5 || r.width < 43.5) small.push(lab(el) + ' ' + Math.round(r.width) + '×' + Math.round(r.height)); });
    document.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=file]), select, textarea').forEach(el => { if (vis(el) && parseFloat(getComputedStyle(el).fontSize) < 16) tiny.push(lab(el)); });
  }
  return { over, wide: [...new Set(wide)].slice(0, 6), small: [...new Set(small)].slice(0, 8), tiny: [...new Set(tiny)].slice(0, 6) };
}, touch);

for (const [name, w, h, touch] of SIZES) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, ...(touch && engine !== 'firefox' ? { hasTouch: true, isMobile: engine === 'chromium' } : {}) });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  const bad = [];
  const check = async label => { await p.waitForTimeout(180); const r = await audit(p, touch);
    if (r.over > 1) bad.push(`${label}: تمرير أفقي ${r.over}px [${r.wide.join(', ')}]`); if (r.small.length) bad.push(`${label}: أهداف لمس صغيرة [${r.small.join(', ')}]`); if (r.tiny.length) bad.push(`${label}: خط مدخلات دون 16 [${r.tiny.join(', ')}]`); };
  await p.goto(U); await p.waitForSelector('#ctaEnroll'); await check('الرئيسية');
  for (const [hash, sel, label] of [['#register', '#choices', 'دليل البرامج'], ['#enroll', '#en-item', 'التسجيل الموحّد'], ['#checkin', '#nid', 'التحضير'], ['#portals', '.wrap', 'البوابات'], ['#policies', '.wrap', 'السياسات'], ['#manar-guide', '#manarSteps', 'دليل منار'], ['#contact', '.ct-card', 'تواصل معنا']]) {
    await p.goto(U + hash); await p.waitForSelector(sel); await check(label); }
  await p.fill('[name=birth_date]', '2012-01-01').catch(() => {});
  await login(p, 'student', '0550000001'); await check('بوابة المتدرب');
  for (const t of ['hw', 'level', 'msg', 'rate']) { if (await p.$(`[data-st="${t}"]`)) { await p.click(`[data-st="${t}"]`); await check('المتدرب/' + t); } }
  await p.click('#bellBtn'); await check('لائحة الإشعارات'); await p.keyboard.press('Escape');
  await p.click('#installBtn'); await check('نافذة التثبيت'); await p.click('#pwaX');
  await login(p, 'guardian', '0509000010'); await check('بوابة ولي الأمر');
  await login(p, 'teacher', '0501000003'); await check('بوابة المدرب');
  for (const t of ['people', 'groups', 'hw', 'bank', 'msg', 'rate', 'profile']) { await p.click(`[data-tt="${t}"]`); await check('المدرب/' + t); }
  await p.goto(U + 'admin/'); await p.waitForSelector('[name=p]'); await check('دخول الإدارة');
  await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForSelector('#main');
  for (const r of ['admin', 'admin-attendance', 'admin-cohorts', 'admin-qudurat', 'admin-users', 'admin-bank', 'admin-orders', 'admin-invoices', 'admin-data', 'admin-access', 'admin-notify', 'admin-trainees', 'admin-settings', 'admin-admins', 'admin-audit']) { await p.goto(U + 'admin/#' + r); await p.waitForSelector('#main'); await check('الإدارة/' + r); }
  for (const g of ['admin', 'trainer', 'trainee']) { await p.goto(U + 'guide/' + g + '.html'); await p.waitForSelector('main'); await check('دليل الاستخدام/' + g); }
  ok(!bad.length && !errs.length, `${engine} · ${name} (${w}×${h})` + (bad.length ? '\n   - ' + bad.slice(0, 14).join('\n   - ') : '') + (errs.length ? '\n   أخطاء: ' + errs.slice(0, 3).join(' | ') : ''));
  await ctx.close();
}
await b.close(); server.close();
if (failed()) process.exit(1);
