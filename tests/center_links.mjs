// قنوات المركز: صفحة تواصل معنا، واتساب، منصات التواصل، منار، برامج الأطفال وتسجيل طفل بجوال ولي أمره، وقناة تيليجرام للمشتركين
import { chromium } from 'playwright';
import { serveDist, reporter, autoConsent } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.addInitScript(() => { try { localStorage.setItem('sama_skip_reg_intro', '1'); } catch {} });   // شاشة التعليمات تُختبر في home_courses
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const hrefs = s => p.$$eval(s, a => a.map(x => x.href));
const years = n => { const d = new Date(Date.now() + 3 * 3600e3); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10); };

await p.goto(U + '#contact'); await p.waitForSelector('.ct-card');
let L = await hrefs('.ct-card');
ok(['wa.me/966561606878', 'share.google/PhsXYhqsEzgXpO8Rf', 'snapchat.com/add/samagodrat.sa', 'tiktok.com/@samagodrat.sa', 'instagram.com/samagodrat.sa', 't.me/+PSnecqWQioc3M2Vk', 'mnar.sa', 'tel:0561606878'].every(x => L.some(h => h.includes(x))), 'صفحة «تواصل معنا» تجمع كل قنوات المركز');
L = await hrefs('.sfoot a');
ok(L.some(h => h.includes('wa.me')) && L.some(h => h.includes('mnar.sa')) && L.some(h => h.includes('snapchat')) && L.some(h => h.endsWith('#contact')), 'التذييل: واتساب ومنصات التواصل ومنار ورابط تواصل معنا');
ok(!(await p.content()).includes('x.com/') && !/إكس/.test(await text('#app')) && L.some(h => h.includes('t.me/')), 'لا رابط لمنصة إكس، وقناة تيليجرام بين منصات التواصل في التذييل');
ok((await p.$$eval('.ct-card[target=_blank]', a => a.every(x => x.rel.includes('noopener')))), 'الروابط الخارجية تفتح بأمان');

// برامج الأطفال في الرئيسية
await p.goto(U + '#home'); await p.reload(); await p.waitForSelector('#kids .kid');
ok((await p.$$('#kids .kid')).length === 3 && /من 3 إلى 12 سنة/.test(await text('#kids')) && /900 ريال/.test(await text('#kids')) && /25194/.test(await text('#kids')), 'قسم برامج الأطفال بثلاثة برامج كما في مطويات المركز');
const kidHref = await p.getAttribute('#kids .kid a.btn.pri', 'href');
await p.click('#kids .kid a.btn.pri'); await p.waitForSelector('.hero-note');
ok(/منصة منار/.test(await text('.hero-note')) && /القراءة والكتابة/.test(await text('h1')), `صفحة البرنامج تشرح أن الشهادة تصدر عبر منار (${kidHref})`);

// تسجيل طفل عمره 5 سنوات في برنامج الأطفال بجوال ولي أمره (تاريخ الميلاد لبرامج الأطفال وحدها)
const kidsId = (await data()).programs.find(x => x.accreditation_no === '25194').id;
await p.goto(U + '#enroll'); await p.reload(); await p.waitForSelector('#en-item'); await p.check('#en-kind-program', { force: true }); await p.selectOption('#en-item', kidsId); await p.waitForTimeout(150);
await p.fill('[name=full_name]', 'يوسف خالد علي النعمي'); await p.fill('[name=national_id]', '1000000511'); await p.fill('[name=phone]', '0556660011');
await p.selectOption('[name=gender]', 'ذكر'); await p.fill('[name=birth_date]', years(5)); await p.dispatchEvent('[name=birth_date]', 'change'); await p.waitForTimeout(150);
ok(!(await p.$eval('#rfChild', e => e.hidden)) && await p.$eval('#rfGuard', e => e.hidden), 'للطفل: تنبيه «اكتب جوال ولي الأمر» دون حقل ثانٍ');
await p.selectOption('[name=city]', { index: 1 }); await p.selectOption('[name=education]', { index: 1 }); await p.check('[name=agree]'); await autoConsent(p); await p.click('#rfGo'); await p.waitForSelector('.refbox');
let D = await data(); const kid = D.trainees.find(t => t.national_id === '1000000511');
ok(kid && kid.guardian_phone === '0556660011' && kid.phone === '0556660011', 'جوال التواصل للطفل هو جوال ولي الأمر');
ok(/منصة منار/.test(await text('#regCard')), 'رسالة النجاح تذكّر بمنصة منار');

// اشتراك في باقة: زر واتساب برسالة مجهزة فيها رقم طلب الشراء
await p.goto(U + '#enroll'); await p.reload(); await p.waitForSelector('#en-item'); await p.check('#en-kind-plan', { force: true }); await p.selectOption('#en-item', { index: 1 });
await p.fill('[name=full_name]', 'خالد يوسف علي النعمي'); await p.fill('[name=national_id]', '1000000529'); await p.fill('[name=phone]', '0556660012'); await p.selectOption('[name=gender]', 'ذكر'); await p.check('[name=agree]'); await autoConsent(p); await p.click('#rfGo'); await p.waitForSelector('.refbox');
const card = await text('#regCard'), wa = await p.getAttribute('#regCard a[href*="wa.me"]', 'href');
ok(/منصة منار/.test(card) && wa && /طلب الشراء رقم SAMA-\d{4}-\d{6}/.test(decodeURIComponent(wa)), 'رسالة النجاح: خطوة منار وزر واتساب برسالة مجهزة فيها رقم طلب الشراء');

// دون 3 سنوات يُرفض (في برنامج الأطفال)
await p.goto(U + '#enroll'); await p.reload(); await p.waitForSelector('#en-item'); await p.check('#en-kind-program', { force: true }); await p.selectOption('#en-item', kidsId); await p.waitForTimeout(150);
await p.fill('[name=birth_date]', years(2)); await p.dispatchEvent('[name=birth_date]', 'change');
ok(/غير صحيح/.test(await text('[data-e=birth_date]')), 'دون 3 سنوات: تاريخ الميلاد مرفوض');

// بوابة المتدرب: قناة تيليجرام ومساعدة واتساب
await p.goto(U + 'student/'); await p.waitForSelector('#pl-phone'); await p.fill('#pl-phone', '0550000001'); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForSelector('.tg-card');
ok((await p.getAttribute('.tg-card', 'href')).includes('t.me/') && (await p.getAttribute('.p-help a', 'href')).includes('wa.me/966561606878'), 'بوابة المتدرب: قناة تيليجرام لمشتركي الباقات ومساعدة واتساب');

ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
