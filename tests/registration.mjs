// الخطوة B: نموذج التسجيل الموحّد (#enroll)، وتاريخ الميلاد الإلزامي، وجوال ولي الأمر لمن هم دون 19 سنة
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.addInitScript(() => { try { localStorage.setItem('sama_skip_reg_intro', '1'); } catch {} });   // شاشة التعليمات تُختبر في home_courses
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const years = n => { const d = new Date(Date.now() + 3 * 3600e3); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10); };
const person = async (name, nid, phone, birth) => { await p.fill('[name=full_name]', name); await p.fill('[name=national_id]', nid); await p.fill('[name=phone]', phone);
  await p.selectOption('[name=gender]', 'ذكر'); await p.fill('[name=birth_date]', birth, { timeout: 400 }).catch(() => {}); await p.dispatchEvent('[name=birth_date]', 'change');
  await p.selectOption('[name=city]', { index: 1 }, { timeout: 400 }).catch(() => {}); await p.selectOption('[name=education]', { index: 1 }, { timeout: 400 }).catch(() => {}); await p.check('[name=agree]'); };

await p.goto(U); await p.waitForSelector('#ctaEnroll');
await p.click('#ctaEnroll'); await p.waitForTimeout(400);
ok(!/enroll/.test(p.url()) && await p.isVisible('#coursesSec [data-crp=now]'), '«أرغب بالتسجيل» ينقل إلى «دورات متاحة حاليا» دون نموذج بلا سياق');
await p.goto(U + '#enroll'); await p.waitForSelector('#en-item');
ok(await p.$('#en-kind-program') && await p.$('#en-kind-plan'), 'نموذج التسجيل يطلب اختيار البرنامج أو الباقة أولًا');
const nProg = (await p.$$('#en-item option')).length;
await p.check('#en-kind-plan', { force: true }); await p.waitForTimeout(200);
const planOpts = await p.$$eval('#en-item option', o => o.map(x => x.textContent));
ok(nProg > 1 && planOpts.length > 1 && /الباقة/.test(await text('#en-lbl')) && !planOpts.some(x => /عن بُعد|عن بعد/.test(x)), 'القائمة تتبدل حسب النوع، وبلا باقات عن بُعد');

// دون اختيار عنصر
await p.fill('[name=full_name]', 'أنس محمد علي الفيفي'); await p.fill('[name=national_id]', '1000000487'); await p.fill('[name=phone]', '0556660001');
await p.selectOption('[name=gender]', 'ذكر'); await p.check('[name=agree]');
await p.click('#rfGo'); await p.waitForTimeout(300);
ok(/اختر ما تريد التسجيل فيه/.test(await text('#rfSum')), 'يُطلب اختيار العنصر');

// الباقات (البند 1): بلا مدينة ولا مؤهل ولا تاريخ ميلاد، وجوال ولي الأمر مستقل لا يُنسخ من جوال المتدرب
await p.selectOption('#en-item', { index: 1 }); await p.waitForTimeout(150);
const hid = async n => p.$eval(`[name=${n}]`, e => !!e.closest('.field')?.hidden || !!e.closest('[hidden]'));
ok(await hid('birth_date') && await hid('city') && await hid('education') && !(await hid('guardian_phone')), 'نموذج الباقة: لا مدينة ولا مؤهل ولا تاريخ ميلاد، وجوال ولي الأمر ظاهر');
await p.fill('[name=phone]', '0556660009'); await p.waitForTimeout(100);
ok((await p.inputValue('[name=guardian_phone]')) === '', 'كتابة جوال المتدرب لا تملأ جوال ولي الأمر');
await p.fill('[name=phone]', '0556660001'); await p.fill('[name=guardian_phone]', '٠٥٠٩٩٩٠٠٠٧'); await p.click('#rfGo'); await p.waitForSelector('.refbox');
let D = await data(); const t = D.trainees.find(x => x.national_id === '1000000487');
ok(t && t.guardian_phone === '0509990007' && t.phone === '0556660001' && !t.birth_date && D.subscriptions.some(s => s.trainee_id === t.id), 'اشتراك محفوظ بجوالين مستقلين وبلا تاريخ ميلاد (أرقام عربية تُحوَّل)');
ok(/بوابة ولي الأمر/.test(await text('#regCard')), 'رسالة النجاح تشرح دخول ولي الأمر');

// برنامج تدريبي عام: بلا تاريخ ميلاد ولا جوال ولي أمر، والمدينة والمؤهل باقيان
await p.goto(U + '#enroll'); await p.reload(); await p.waitForSelector('#en-item'); await p.check('#en-kind-program', { force: true });
const kidsIdx = await p.$$eval('#en-item option', (o, ids) => o.findIndex(x => ids.includes(x.value)), (await data()).programs.filter(x => x.accreditation_no === '25194').map(x => x.id));
const adultIdx = kidsIdx === 1 ? 2 : 1;
await p.selectOption('#en-item', { index: adultIdx }); await p.waitForTimeout(150);
ok(await hid('birth_date') && await hid('guardian_phone') && !(await hid('city')) && !(await hid('education')), 'برنامج عام: لا تاريخ ميلاد ولا جوال ولي أمر');
await person('ماهر سعيد علي الزهراني', '1000000495', '0556660002', years(25)); await p.waitForTimeout(150);
await p.click('#rfGo'); await p.waitForSelector('.refbox');
D = await data(); const t2 = D.trainees.find(x => x.national_id === '1000000495');
ok(t2 && !t2.guardian_phone && D.enrollments.some(e => e.trainee_id === t2.id), 'تسجيل في برنامج تدريبي من النموذج نفسه');

// برنامج الأطفال: تاريخ الميلاد مطلوب فيه وحده
if (kidsIdx > 0) { await p.goto(U + '#enroll'); await p.reload(); await p.waitForSelector('#en-item'); await p.check('#en-kind-program', { force: true });
  await p.selectOption('#en-item', { index: kidsIdx }); await p.waitForTimeout(150);
  ok(!(await hid('birth_date')), 'برنامج الأطفال يطلب تاريخ الميلاد');
  await p.fill('[name=full_name]', 'ريم سعيد علي الزهراني'); await p.fill('[name=national_id]', '1000000503'); await p.fill('[name=phone]', '0556660004'); await p.selectOption('[name=gender]', 'أنثى');
  await p.selectOption('[name=city]', { index: 1 }); await p.selectOption('[name=education]', { index: 1 }); await p.check('[name=agree]'); await p.click('#rfGo'); await p.waitForTimeout(300);
  ok(/تاريخ الميلاد/.test(await text('#rfSum')), 'تاريخ الميلاد إلزامي لبرامج الأطفال'); }
else ok(true, 'لا برنامج أطفال في البيانات التجريبية');

// إعادة التسجيل بجوال ولي أمر آخر: لا يُستبدل، ويصبح طلب تحديث
await p.goto(U + '#enroll'); await p.reload(); await p.waitForSelector('#en-item'); await p.check('#en-kind-plan', { force: true }); await p.selectOption('#en-item', { index: 2 });
await person('أنس محمد علي الفيفي', '1000000487', '0556660001', ''); await p.fill('[name=guardian_phone]', '0509996666'); await p.click('#rfGo'); await p.waitForSelector('.refbox');
D = await data();
ok(D.trainees.find(x => x.national_id === '1000000487').guardian_phone === '0509990007' && D.profile_change_requests.some(r => r.trainee_id === t.id && r.status === 'pending' && r.changes.guardian_phone?.new === '0509996666'), 'جوال ولي الأمر لا يُستبدل بإعادة التسجيل، ويصبح طلب تحديث');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
