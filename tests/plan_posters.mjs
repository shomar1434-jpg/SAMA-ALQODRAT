// التصاميم التعريفية للباقات الخمس ونموذجا المقارنة، وباقة «خصصناها لك»
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const loaded = sel => p.$eval(sel, i => i.complete && i.naturalWidth > 500);

await p.goto(U); await p.waitForSelector('#plMq .pl-card');
const D = await data(), inP = D.plans.filter(x => x.mode === 'in_person' && x.active !== false);
ok(inP.length === 5 && ['basic', 'silver', 'gold', 'diamond', 'custom'].every(t => inP.some(x => x.tier === t)), 'خمس باقات حضورية: الأساسية والفضية والذهبية والماسية وخصصناها لك');
const cu = inP.find(x => x.tier === 'custom');
ok(cu.name === 'خصصناها لك' && cu.reg_fee + cu.installments * cu.installment_amount === 800 && cu.duration_unit === 'week' && cu.duration_value === 8, 'خصصناها لك: 8 أسابيع و800 ريال على دفعتين');
ok(D.plans.find(x => x.tier === 'custom' && x.mode === 'remote').status === 'coming_soon', 'خصصناها لك عن بُعد: قريبًا');
ok(/خصصناها لك/.test(await text('#plMq')) && !/اطلب عرضًا/.test(await text('#plMq')), 'تظهر في شريط الباقات بدل بطاقة «اطلب عرضًا»');

// الشريط يبقى متحركًا بعد إعادة الرسم الهادئة للتحديث الحي (live-redraw)
await p.evaluate(() => { document.documentElement.classList.add('live-redraw'); window.dispatchEvent(new HashChangeEvent('hashchange')); });
await p.waitForTimeout(600); await p.evaluate(() => document.documentElement.classList.remove('live-redraw'));
await p.waitForSelector('#plMq .pl-card');
const tx = () => p.$eval('#plMq .mq-track', t => t.style.transform);
const t1 = await tx(); await p.waitForTimeout(800); const t2 = await tx();
ok(t1 !== t2 && !(await p.$eval('#plMq [data-mq=toggle]', b => b.hidden)), 'شريط الباقات يتحرك بعد التحديث الحي الهادئ وزر الإيقاف ظاهر');

// التصميم التعريفي في صفحة كل باقة
let all = true; const srcs = new Set();
for (const pl of inP) { await p.goto(U + '#plan-' + pl.id); await p.waitForSelector('#plPoster img'); await p.waitForFunction(() => document.querySelector('#plPoster img').complete);
  if (!(await loaded('#plPoster img'))) all = false; srcs.add(await p.getAttribute('#plPoster img', 'src')); if (!(await p.getAttribute('#plPoster img', 'alt')).includes(pl.name)) all = false; }
ok(all && srcs.size === 5, 'لكل باقة تصميمها التعريفي في صفحتها (خمس صور مختلفة بوصف نصي)');
await p.click('#plPoster'); await p.waitForSelector('.pl-zoom img');
ok(await loaded('.pl-zoom img') && /خصصناها لك/.test(await text('.modal h3')), 'تكبير التصميم في نافذة');
await p.click('#pzX');
ok(/على دفعتين/.test(await text('.pl-hero')) && await p.$('#rf'), 'صفحة «خصصناها لك»: الرسوم على دفعتين ونموذج الاشتراك');

// نموذج المقارنة
await p.click('#plCompare'); await p.waitForSelector('#cmImg'); await p.waitForFunction(() => document.querySelector('#cmImg').complete);
const a = await p.getAttribute('#cmImg', 'src');
await p.click('[data-cm="remote"]'); await p.waitForFunction(s => { const i = document.querySelector('#cmImg'); return i.getAttribute('src') !== s && i.complete; }, a);
ok(await loaded('#cmImg') && (await p.getAttribute('#cmImg', 'src')) !== a, 'نموذج المقارنة بتبويبي الحضوري وعن بُعد');
await p.click('#pzX');
await p.goto(U + '#home'); await p.reload(); await p.waitForSelector('#plCompare'); await p.click('#plCompare'); await p.waitForSelector('#cmImg');
ok(await p.$('#cmImg'), 'زر «قارن بين الباقات» في الرئيسية');

ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
