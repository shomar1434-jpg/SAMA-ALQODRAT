// الخطوة BD: أيقونة مساعد سما بثلاث حالات (المصباح ← دوائر سما تكتب ← الشرارة ← المصباح) أسفل يمين الشاشة
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const errs = [];
for (const vp of [{ width: 1280, height: 800 }, { width: 360, height: 740 }]) {
  const p = await (await b.newContext({ viewport: vp })).newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(U + '#home'); await p.waitForSelector('#assistantToggle');
  const st = () => p.getAttribute('#assistantToggle', 'data-state');
  const box = await p.locator('#assistantToggle').boundingBox();
  ok(box.x + box.width > vp.width - 40 && box.y + box.height > vp.height - 40 && box.width >= 44, `الزر أسفل يمين الشاشة (${vp.width})`);
  ok(await st() === 'idle' && await p.locator('#assistantToggle .as-rays').count() === 1, 'الحالة الأولى: المصباح');
  await p.click('#assistantToggle'); await p.waitForSelector('#assistantPanel:not([hidden])');
  ok(await p.getAttribute('#assistantToggle', 'aria-expanded') === 'true' && /وعليكم السلام/.test(await p.textContent('#assistantMessages')), 'الفتح يعرض الترحيب');
  await p.fill('#assistantQuestion', 'كيف أسجل؟'); await p.click('#assistantAsk button');
  await p.waitForTimeout(150);
  ok(await st() === 'typing' && await p.locator('.as-head-ico .as-dot').count() === 3 && /يكتب/.test(await p.textContent('#assistantStatus')), 'أثناء تجهيز الرد: دوائر سما تتحرك');
  await p.waitForFunction(() => document.querySelector('#assistantToggle').dataset.state === 'done');
  ok(await p.locator('.as-head-ico .as-pop').count() >= 1 && /للتسجيل/.test(await p.textContent('#assistantMessages')), 'بعد الرد: الشرارة والإجابة');
  await p.waitForTimeout(2300);
  ok(await st() === 'idle', 'تعود إلى المصباح بعد ثانيتين والمحادثة مفتوحة');
  const scrollW = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(scrollW <= vp.width, `لا تمرير أفقي مع فتح المحادثة (${vp.width})`);
  // الرد والمحادثة مغلقة: تبقى الشرارة حتى الفتح
  await p.fill('#assistantQuestion', 'واتساب'); await p.click('#assistantAsk button');
  await p.click('#assistantClose');
  await p.waitForFunction(() => document.querySelector('#assistantToggle').dataset.state === 'done');
  await p.waitForTimeout(2300);
  ok(await st() === 'done' && await p.locator('#assistantToggle .as-pop').count() >= 1, 'المحادثة مغلقة: تبقى الشرارة على الزر');
  await p.click('#assistantToggle'); await p.waitForTimeout(100);
  ok(await st() === 'idle', 'فتحها يعيد المصباح');
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  ok(await p.getAttribute('#assistantToggle', 'aria-expanded') === 'false', 'Escape يغلق المحادثة');
}
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
