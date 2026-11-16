// التسجيل الموحّد: باقات الثانوية بلا ميلاد أو مدينة أو مؤهل، وبرامج الأطفال تظل مرتبطة بالعمر
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const years = n => { const d = new Date(Date.now() + 3 * 3600e3); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10); };
const person = async (name, nid, phone, birth) => { await p.fill('[name=full_name]', name); await p.fill('[name=national_id]', nid); await p.fill('[name=phone]', phone);
  await p.selectOption('[name=gender]', 'ذكر'); await p.fill('[name=birth_date]', birth); await p.dispatchEvent('[name=birth_date]', 'change');
  await p.selectOption('[name=city]', { index: 1 }); await p.selectOption('[name=education]', { index: 1 }); await p.check('[name=agree]'); };

await p.goto(U); await p.waitForSelector('#ctaEnroll');
await p.click('#ctaEnroll'); await p.waitForSelector('#en-item');
ok(/enroll/.test(p.url()) && await p.$('#en-kind-program') && await p.$('#en-kind-plan'), '«سجّل الآن» يفتح النموذج الموحّد بخياري البرنامج والباقة');
const nProg = (await p.$$('#en-item option')).length;
await p.check('#en-kind-plan', { force: true }); await p.waitForTimeout(200);
const planOpts = await p.$$eval('#en-item option', o => o.map(x => x.textContent));
ok(nProg > 1 && planOpts.length > 1 && /الباقة/.test(await text('#en-lbl')) && !planOpts.some(x => /عن بُعد|عن بعد/.test(x)), 'القائمة تتبدل حسب النوع، وبلا باقات عن بُعد');

// الباقة لا تُنشئ أي عناصر حقول للمدينة أو المؤهل أو الميلاد في HTML/DOM، وليس مجرد إخفائها.
const absentPackageFields = () => p.evaluate(() => ['birth_date', 'city', 'education'].every(name => !document.querySelector(`#rf [name="${name}"]`)));
ok(await absentPackageFields() && await p.$('#rf [name=employer]'), 'نموذج الباقة يخلو من الميلاد والمدينة والمؤهل مع الإبقاء على جهة العمل');
await p.check('#en-kind-program', {force:true});
ok(await p.evaluate(() => ['birth_date','city','education','employer'].every(name => !!document.querySelector(`#rf [name="${name}"]`))), 'البرامج التدريبية تبني حقولها الخاصة عند اختيار البرنامج');
await p.check('#en-kind-plan', {force:true});
ok(await absentPackageFields() && await p.$('#rf [name=employer]'), 'العودة إلى الباقة تحذف حقول العمر والمدينة والمؤهل وتحافظ على جهة العمل');


// دون اختيار عنصر: لا يُطلب ميلاد للباقة، ولكن يلزم جوال ولي الأمر مستقلًا
await p.fill('[name=full_name]', 'أنس محمد علي الفيفي'); await p.fill('[name=national_id]', '1000000487'); await p.fill('[name=phone]', '0556660001');
await p.selectOption('[name=gender]', 'ذكر'); await p.check('[name=agree]');
await p.click('#rfGo'); await p.waitForTimeout(300);
ok(/اختر ما تريد التسجيل فيه/.test(await text('#rfSum')) && /جوال ولي الأمر/.test(await text('#rfSum')), 'الباقة تتطلب اختيارها ورقم ولي الأمر دون تاريخ ميلاد');

// الباقات الثانوية: جوال ولي الأمر ظاهر ومستقل دون استعمال الميلاد
await p.selectOption('#en-item', { index: 1 });
ok(!(await p.$eval('#rfGuard', e => e.hidden)), 'جوال ولي الأمر ظاهر للباقة دون اشتراط الميلاد');
ok(await absentPackageFields(), 'لا توجد حقول تاريخ الميلاد والمدينة والمؤهل في نموذج الباقة');
await p.click('#rfGo'); await p.waitForTimeout(300);
ok(/جوال ولي الأمر/.test(await text('#rfSum')), 'جوال ولي الأمر إلزامي للباقة');
await p.fill('[name=guardian_phone]', '٠٥٠٩٩٩٠٠٠٧'); await p.click('#rfGo'); await p.waitForSelector('.refbox');
let D = await data(); const t = D.trainees.find(x => x.national_id === '1000000487');
ok(t && t.guardian_phone === '0509990007' && D.subscriptions.some(s => s.trainee_id === t.id), 'اشتراك القاصر محفوظ مع جوال ولي الأمر (أرقام عربية تُحوَّل)');
ok(/بوابة ولي الأمر/.test(await text('#regCard')), 'رسالة النجاح تشرح دخول ولي الأمر');

// بالغ في برنامج تدريبي عبر الرابط المسبق الاختيار
await p.goto(U + '#enroll'); await p.reload(); await p.waitForSelector('#en-item'); await p.check('#en-kind-program', { force: true });
await p.selectOption('#en-item', { index: 1 });
await person('ماهر سعيد علي الزهراني', '1000000495', '0556660002', years(25)); await p.waitForTimeout(150);
ok(await p.$eval('#rfGuard', e => e.hidden), 'البالغ لا يُطلب منه جوال ولي الأمر');
await p.click('#rfGo'); await p.waitForSelector('.refbox');
D = await data(); const t2 = D.trainees.find(x => x.national_id === '1000000495');
ok(t2 && !t2.guardian_phone && D.enrollments.some(e => e.trainee_id === t2.id), 'تسجيل البالغ في برنامج تدريبي من النموذج نفسه');

// إعادة تسجيل القاصر بجوال ولي أمر آخر: لا يُستبدل، ويصبح طلب تحديث
await p.goto(U + '#enroll'); await p.reload(); await p.waitForSelector('#en-item'); await p.check('#en-kind-program', { force: true }); await p.selectOption('#en-item', { index: 1 });
await person('أنس محمد علي الفيفي', '1000000487', '0556660001', years(16)); await p.fill('[name=guardian_phone]', '0509996666'); await p.click('#rfGo'); await p.waitForSelector('.refbox');
D = await data();
ok(D.trainees.find(x => x.national_id === '1000000487').guardian_phone === '0509990007' && D.profile_change_requests.some(r => r.trainee_id === t.id && r.status === 'pending' && r.changes.guardian_phone?.new === '0509996666'), 'جوال ولي الأمر لا يُستبدل بإعادة التسجيل، ويصبح طلب تحديث');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
