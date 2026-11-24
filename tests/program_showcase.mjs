// الخطوة BU: عرض البرامج المتحرك في الرئيسية، وبطاقات دليل البرامج المصوّرة، وصورة رأس صفحة البرنامج
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const SHOTS = process.env.SHOTS;
const b = await chromium.launch();
const errs = [];
const text = async (p, s) => ((await p.textContent(s).catch(() => '')) || '').trim();

for (const [w, h, tag] of [[1280, 900, 'حاسب'], [360, 780, 'جوال']]) {
  const p = await (await b.newContext({ viewport: { width: w, height: h } })).newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(U); await p.waitForSelector('#progShow #psInfo .ps-name');
  ok(!(await p.$('#progShow .ps-card')), `${tag}: لا تُطلب صور العرض قبل الاقتراب من القسم`);
  await p.$eval('#progShow', el => el.scrollIntoView()); await p.waitForSelector('#progShow .ps-card.hero.ld'); await p.waitForTimeout(900);
  ok(await p.getAttribute('#progShow .ps-card.hero img', 'fetchpriority') === 'high', `${tag}: صورة الوسط بأولوية عالية`);
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/home_${w}.png` });
  const n = await p.evaluate(() => document.querySelectorAll('#progShow .ps-card').length);
  ok(n >= 6 && n <= 9, `${tag}: المنصة تعرض نافذة محدودة من البطاقات (${n}) لا البرامج كلها`);
  const img = await p.$eval('#progShow .ps-card.hero img', i => i.complete && i.naturalWidth > 0 && i.getAttribute('src'));
  ok(img && /^programs\/p\d+\.webp$/.test(img), `${tag}: صورة البرنامج الحالي من public/programs تُحمَّل`);
  const first = await text(p, '#psInfo .ps-name');
  ok(first && /^١من/.test(await text(p, '#psNum')) && /من ٧٣/.test(await text(p, '#psNum')), `${tag}: الاسم والعداد «١ من ٧٣»`);
  ok(!(await p.$('#progShow .bar, #progShow progress')), `${tag}: لا شريط تعبئة، زرا تنقل فقط`);
  await p.click('#psNext'); await p.waitForTimeout(1100);
  const second = await text(p, '#psInfo .ps-name');
  const heroAlt = await p.getAttribute('#progShow .ps-card.hero', 'aria-label');
  ok(second && second !== first && heroAlt === second && /^٢من/.test(await text(p, '#psNum')), `${tag}: «التالي» يقدّم البرنامج التالي إلى الوسط مع تفاصيله`);
  await p.click('#psPrev'); await p.waitForTimeout(1100);
  ok(await text(p, '#psInfo .ps-name') === first, `${tag}: «السابق» يعيد البرنامج الأول`);
  await p.click('#psPrev'); await p.waitForTimeout(1100);
  ok(/٧٣/.test((await text(p, '#psNum')).split('من')[0]), `${tag}: السابق من الأول يدور إلى الأخير`);
  const cat = await p.$$eval('[data-psc]', l => l[2].dataset.psc);
  await p.click(`[data-psc="${cat}"]`); await p.waitForTimeout(700);
  ok(await text(p, '#psInfo .ps-cat') === cat && await p.getAttribute(`[data-psc="${cat}"]`, 'aria-pressed') === 'true', `${tag}: التصفية بالمجال`);
  const sw = await p.evaluate(() => document.documentElement.scrollWidth);
  ok(sw <= w, `${tag}: لا تمرير أفقي (${sw})`);
  if (tag === 'حاسب') {
    await p.focus('#psNext'); await p.keyboard.press('ArrowLeft'); await p.waitForTimeout(1000);
    ok(/^٢من/.test(await text(p, '#psNum')), 'سهم لوحة المفاتيح الأيسر = التالي');
    const before = await text(p, '#psInfo .ps-name');
    await p.$eval('#progShow .ps-card[data-o="2"]', el => el.click()); await p.waitForTimeout(1100);
    ok(await text(p, '#psInfo .ps-name') !== before && /^٤من/.test(await text(p, '#psNum')), 'الضغط على صورة في الطابور ينقلها إلى الوسط');
    const href = await p.getAttribute('#psInfo .ps-cta a', 'href');
    ok(/^#p\w+$|^#enroll-p-/.test(href || ''), 'زر التفاصيل أو التسجيل يشير إلى صفحة البرنامج أو نموذجه');
    // الحالة من «العرض في الرئيسية»: المنشور للتسجيل أولًا بشارة «متاحة الآن»
    await p.evaluate(() => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); const pr = D.programs[40]; pr.publish_state = 'coming_soon'; pr.expected_start = '2027-02-01'; localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); });
    await p.reload(); await p.waitForSelector('#progShow #psInfo'); await p.$eval('#progShow', el => el.scrollIntoView()); await p.waitForSelector('#progShow .ps-card.hero'); await p.click('[data-psc="الكل"]'); await p.waitForTimeout(600);
    let seen = [], st = '';
    for (let i = 0; i < 30; i++) { st = await text(p, '#psInfo .ps-st'); if (/قريبًا/.test(st)) break; seen.push(st); await p.click('#psNext'); await p.waitForTimeout(150); }
    await p.waitForTimeout(900);
    ok(/قريبًا/.test(st) && seen.every(x => /متاحة الآن/.test(x)) && /سجّل اهتمامك/.test(await text(p, '#psInfo .ps-cta')) && /الموعد المتوقع/.test(await text(p, '#psInfo .ps-when')), `الترتيب: المفتوح (${seen.length}) ثم «قريبًا» بشارته وموعده وزر «سجّل اهتمامك»`);
    await p.click('#progShow .ps-all'); await p.waitForSelector('#choices .pcard');
    if (SHOTS) { await p.waitForTimeout(800); await p.screenshot({ path: `${SHOTS}/catalog_${w}.png` }); }
    const cards = await p.$$('#choices .pcard .pc-img img');
    ok(cards.length >= 70, `دليل البرامج: بطاقات مصوّرة (${cards.length})`);
    const sh = await p.$eval('#choices .pcard', el => getComputedStyle(el).boxShadow);
    ok(sh && sh !== 'none', 'بطاقات الدليل بظل وحدود');
    ok((await p.$$eval('#choices .pcard .pc-img .ps-st', l => l.map(x => x.textContent))).some(t => /قريبًا/.test(t)), 'شارة «قريبًا» على صورة البطاقة');
  }
  await p.close();
}
// صفحة البرنامج: صورة الرأس (البيانات التجريبية بلا رمز؛ الرمز من رقم الاعتماد)
{
  const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(U + '#p25210'); await p.waitForTimeout(1500);
  const ban = await p.$('.pp-banner img');
  ok(!!ban && await ban.evaluate(i => i.getAttribute('src')) === 'programs/p25210.webp', 'صفحة البرنامج: صورته في الرأس');
  if (SHOTS) await p.screenshot({ path: `${SHOTS}/program_1280.png` });
  await p.close();
}
ok(!errs.length, 'لا أخطاء في الصفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
