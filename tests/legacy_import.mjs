// الخطوة O: استيراد المسجّلين سابقًا بمعاينة، مراجعة البيانات واستكمالها، طرق السداد والدفعات الإضافية
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const iso = n => new Date(Date.now() + 3 * 3600e3 - n * 864e5).toISOString().slice(0, 10);
const H = ['م', 'اسم الطالب', 'البريد الألكتروني', 'رقم الهوية', 'رقم الجوال', 'رقم جوال ولي الأمر', 'البرنامج التدريبي', 'تاريخ التسجيل', 'رسوم الباقة', 'رسوم التسجيل', 'طريقة السداد', 'الدفعة 1', 'طريقة السداد', 'الدفعة 2', 'طريقة السداد'];
const R = [
  [1, 'نواف سالم علي الغامدي', 'n@example.com', '1000000537', '556663001', '556663002', 'الباقة الذهبية (حضوري)', iso(70), 1690, 690, 'شبكة', 250, 'تحويل', '', ''],
  [2, 'بدر خالد', 'لم يتم الرد', '1000000545', '556663003', '55666300', 'الباقة الأساسية (حضوري) حول للباقة الفضية', iso(60), '1150عرض اليوم الوطني', 690, 'نقدا', '', '', '', ''],
  [3, 'ريان فهد علي العمري', '', '1000000552', '556663004', '556663005', 'الباقة الأساسية (حضوري)', iso(80), 690, 690, 'تحويل', '', '', '', ''],
  [4, 'صف خاطئ الهوية', '', '12345', '556663006', '', 'الباقة الفضية (حضوري)', iso(10), 1190, '', '', '', '', '', ''],
  ['', '.', '', '', '', '', '', '', '', '', '', '', '', '', '']];
const TSV = [H, ...R].map(r => r.join('\t')).join('\n');

await p.goto(U + 'admin/#admin-data'); await p.waitForTimeout(500);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
await p.waitForSelector('[data-dt=import]'); await p.click('[data-dt=import]'); await p.waitForSelector('#im-t');
const before = (await data()).trainees.length;
await p.fill('#im-t', 'كلام بلا جدول'); await p.click('#imGo'); await p.waitForTimeout(200);
ok(/العناوين|غير موجود/.test(await text('#imE2')), 'جدول بلا عناوين يُرفض برسالة واضحة');
await p.fill('#im-t', TSV); await p.click('#imGo'); await p.waitForSelector('#imOk');
await p.click('#imGo'); await p.waitForTimeout(200);   // ضغط «معاينة» ثانيةً والحقل فارغ لا يمسح المعاينة ولا يرسل استيرادًا فارغًا
ok(/المعاينة معروضة/.test(await text('#imE2')) && !!(await p.$('#imOk')), 'إعادة ضغط المعاينة بحقل فارغ تُبقي المعاينة صالحة للاستيراد');
const pv = await text('#dBody');
ok(/اعتماد استيراد ٣ متدرب/.test(await text('#imOk')) && /رقم الهوية غير صحيح/.test(pv) && (await p.$$('#dBody .row-bad')).length === 1, 'المعاينة: 3 جاهزة وصف مرفوض، والصف الفارغ يُتجاهل');
ok(/تحويل بين الباقات/.test(pv) && /رسوم مخفّضة \(1150 بدل 1190\)/.test(pv) && /جوال ولي الأمر ناقص/.test(pv) && /انتهت مدة الاشتراك/.test(pv), 'تُستخرج ملاحظات كل صف: تحويل الباقة، الخصم، الجوال الناقص، انتهاء المدة');
ok((await data()).trainees.length === before, 'لا يُحفظ شيء قبل الاعتماد');
await p.click('#imOk'); await p.waitForSelector('#skX'); const skipped = await text('.modal'); await p.click('#skX'); await p.waitForTimeout(300);
ok(/صف خاطئ الهوية/.test(skipped), 'تُعرض الصفوف التي لم تُستورد وسببها');
let D = await data(); const t1 = D.trainees.find(t => t.national_id === '1000000537'), t2 = D.trainees.find(t => t.national_id === '1000000545'), t3 = D.trainees.find(t => t.national_id === '1000000552');
const s1 = D.subscriptions.find(s => s.trainee_id === t1.id), o1 = D.orders.find(o => o.trainee_id === t1.id), s2 = D.subscriptions.find(s => s.trainee_id === t2.id), o2 = D.orders.find(o => o.trainee_id === t2.id), s3 = D.subscriptions.find(s => s.trainee_id === t3.id);
ok(D.trainees.length === before + 3 && t1.imported && t1.phone === '0556663001' && t1.guardian_phone === '0556663002' && !D.trainees.some(t => t.national_id === '12345'), 'تُنشأ ملفات المتدربين الجاهزين فقط');
ok(s1.start_date === iso(70) && s1.status === 'active' && s1.track_from === iso(0) && s3.status === 'ended', 'الاشتراك بتاريخه الفعلي، والمنتهي يُحفظ منتهيًا، والمتابعة من اليوم');
ok(o1.approval === 'approved' && o1.payment === 'confirmed' && o1.total === 1690 && o1.paid_amount === 940 && o1.opening.payments.length === 2 && o1.opening.payments[0].method === 'pos' && !(D.invoices || []).length, 'الطلب برصيده المرحَّل وطرق سداده، بلا فواتير للسابق');
ok(D.plans.find(x => x.id === s2.plan_id).tier === 'silver' && o2.total === 1150 && /عرض اليوم الوطني/.test(o2.discount_note) && o2.opening.payments[0].method === 'cash' && t2.guardian_phone === '', 'تحويل الباقة والخصم وطريقة السداد النقدية تُفهم من الكشف');

// مراجعة البيانات
ok(/ما يحتاج مراجعة/.test(await text('#main')) && (await text('#dBody')).includes('بدر خالد'), 'بعد الاستيراد تُعرض قائمة ما يحتاج مراجعة');
await p.fill('#dq', 'بدر خالد'); await p.waitForTimeout(600);
const row = await text('#dBody');
ok(/تاريخ الميلاد غير مسجّل/.test(row) && /البريد الإلكتروني غير مسجّل/.test(row) && /جوال ولي الأمر/.test(row) && /الاسم غير ثلاثي/.test(row) && /تحويل بين الباقات/.test(row), 'النظام يستخرج الناقص وملاحظات الكشف للمتدرب');
await p.click(`[data-de="${t2.id}"]`); await p.waitForSelector('#fxF');
ok((await p.$$('#fxF .field.need')).length >= 4, 'الحقول الناقصة مميَّزة في نموذج الاستكمال');
await p.fill('#fx-g', '123'); await p.click('#fxS'); await p.waitForTimeout(300);
ok(/جوال ولي الأمر/.test(await text('#fxE')), 'قيمة خاطئة تُرفض');
await p.fill('#fx-n', 'بدر خالد علي الحازمي'); await p.fill('#fx-b', '2009-05-01'); await p.fill('#fx-g', '٠٥٥٦٦٦٣٠٠٩'); await p.fill('#fx-e', 'badr@example.com'); await p.selectOption('#fx-c', 'جازان');
await p.check('[data-fn="0"]'); await p.click('#fxS'); await p.waitForTimeout(800);
D = await data(); const t2b = D.trainees.find(t => t.id === t2.id);
ok(t2b.full_name === 'بدر خالد علي الحازمي' && t2b.birth_date === '2009-05-01' && t2b.guardian_phone === '0556663009' && t2b.email === 'badr@example.com' && t2b.city === 'جازان' && t2b.import_notes[0].done, 'الاستكمال يُحفظ، والملاحظة تُعلَّم معالَجة');
await p.fill('#dq', 'بدر خالد'); await p.waitForTimeout(600);
ok(!/تاريخ الميلاد غير مسجّل/.test(await text('#dBody')), 'ما اكتمل يختفي من قائمة المراجعة');

// طرق السداد والدفعة الإضافية
await p.goto(U + 'admin/#admin-orders'); await p.reload(); await p.waitForSelector('#of-st'); await p.selectOption('#of-st', 'all'); await p.fill('#of-q', o1.number); await p.waitForTimeout(600);
await p.click(`[data-oo="${o1.id}"]`); await p.waitForSelector('#om-add');
ok(/مرحَّلة من قبل النظام/.test(await text('.modal')) && /رسوم التسجيل 690 \(شبكة\)|رسوم التسجيل ٦٩٠ \(شبكة\)/.test(await text('.modal')), 'الطلب يعرض الرصيد المرحَّل ودفعاته السابقة بطرقها');
await p.fill('#om-a2', '900'); await p.click('#om-add'); await p.waitForTimeout(300);
ok(/أكبر من المتبقي/.test(await text('#omE')), 'دفعة أكبر من المتبقي تُرفض');
await p.fill('#om-a2', '250'); await p.selectOption('#om-m2', 'cash'); await p.click('#om-add'); await p.waitForTimeout(700);
D = await data(); const inv = D.invoices[0];
ok(D.orders.find(o => o.id === o1.id).paid_amount === 1190 && inv && inv.method === 'نقدًا' && inv.paid === 250 && inv.remaining === 500, 'الدفعة الإضافية تصدر فاتورتها بطريقة السداد المختارة والمتبقي بعدها');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'لا تمرير أفقي');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
