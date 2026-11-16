// الخطوة M: طلبات الشراء — رقم الطلب، الإبلاغ بالتحويل، مراجعة الإدارة وتأكيد السداد، الحساب البنكي، ومنع الحضور الاختياري
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
const person = async (name, nid, phone, kind) => {
  await p.fill('[name=full_name]', name); await p.fill('[name=national_id]', nid); await p.fill('[name=phone]', phone);
  await p.selectOption('[name=gender]', 'ذكر');
  if(kind==='plan'){
    ok(await p.evaluate(() => ['birth_date','city','education'].every(n => !document.querySelector(`#rf [name="${n}"]`))), 'نموذج الباقة لا يطلب الميلاد أو المدينة أو المؤهل');
    await p.fill('[name=guardian_phone]', '0509000099');
  } else {
    ok(await p.evaluate(() => ['birth_date','city','education'].every(n => !!document.querySelector(`#rf [name="${n}"]`))), 'نموذج البرنامج يحتوي على حقول العمر والمدينة والمؤهل');
    await p.fill('[name=birth_date]', years(25)); await p.dispatchEvent('[name=birth_date]', 'change');
    await p.selectOption('[name=city]', { index:1 }); await p.selectOption('[name=education]', { index:1 });
  }
  await p.check('[name=agree]');
};
const admin = async r => { await p.goto(U + 'admin/#' + r); await p.reload(); await p.waitForTimeout(500);
  if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); } await p.waitForSelector('#main'); };

// تسجيل في باقة: طلب برقم فريد، والحساب البنكي مخفي
await p.goto(U + '#enroll'); await p.waitForSelector('#en-item'); await p.check('#en-kind-plan', { force: true }); await p.waitForTimeout(200);
await p.selectOption('#en-item', { index: 1 }); await person('فهد خالد علي العتيبي', '1000000511', '0556661001', 'plan'); await p.click('#rfGo'); await p.waitForSelector('.ord');
let D = await data(); const t = D.trainees.find(x => x.national_id === '1000000511'); let o = D.orders.find(x => x.trainee_id === t.id);
const plan = D.plans.find(x => x.id === D.subscriptions.find(s => s.id === o.subscription_id).plan_id);
ok(o && /^SAMA-\d{4}-\d{6}$/.test(o.number) && (await text('.ord-no')) === o.number, 'يُنشأ مع التسجيل طلب برقم فريد يظهر لصاحبه');
ok(o.due_now === +plan.reg_fee && o.total === +plan.reg_fee + plan.installments * plan.installment_amount && o.approval === 'pending_review' && o.payment === 'unpaid', 'المطلوب الآن رسوم التسجيل بأسعار المنصة، والحالتان ابتدائيتان');
ok(!(await p.$('.ord-bank')) && !/SA12/.test(await text('#ordBox')), 'الحساب البنكي لا يظهر قبل تفعيله من الإدارة');
const wa = await p.getAttribute('[data-wa]', 'href');
ok(/wa\.me\/966561606878/.test(wa) && decodeURIComponent(wa).includes(o.number), 'زر واتساب برسالة مجهزة فيها رقم الطلب (يرسلها المستخدم)');
await p.fill('.ord-f [name=amount]', '٦٩٠'); await p.fill('.ord-f [name=reference]', 'TRX-77'); await p.click('.ord-f button'); await p.waitForTimeout(400);
D = await data(); o = D.orders.find(x => x.id === o.id);
ok(o.payment === 'claimed' && o.claim.amount === 690 && o.approval === 'pending_review' && /تحويل قيد المطابقة/.test(await text('#ordBox')), 'الإبلاغ بالتحويل لا يؤكد السداد ولا يغيّر المراجعة');
const denied = await p.evaluate(async n => { try { await window.__SAMA__.LocalStore.orderReportTransfer({ number: n, amount: 5, date: '2026-01-01' }); return 'allowed'; } catch (e) { return e.message; } }, o.number);
ok(/تعذّر العثور على الطلب/.test(denied), 'رقم الطلب وحده لا يمنح وصولًا');

// الإدارة: القائمة والمراجعة والسداد قراران مستقلان
await admin('admin-orders');
ok((await text('#main')).includes(o.number) && /فهد خالد/.test(await text('#main')), 'صفحة طلبات الشراء تعرض الطلب');
await p.click(`[data-oo="${o.id}"]`); await p.waitForSelector('#om-r');
await p.click('[data-od=rejected]'); await p.waitForTimeout(300);
ok(/سبب/.test(await text('#omE')), 'الرفض يحتاج سببًا');
await p.click('[data-od=approved]'); await p.waitForTimeout(600);
D = await data(); o = D.orders.find(x => x.id === o.id);
ok(o.approval === 'approved' && o.payment === 'claimed', 'الموافقة لا تثبت وصول التحويل');
await p.click(`[data-oo="${o.id}"]`); await p.waitForSelector('#opl-a0'); await p.fill('#opl-a0', '100'); await p.click('#om-recv'); await p.waitForTimeout(300);
ok(/أقل من المطلوب/.test(await text('#omE')), 'مبلغ أقل من المطلوب لا يُعد سدادًا');
await p.fill('#opl-a0', '690'); await p.click('#om-recv'); await p.waitForTimeout(600);
D = await data(); o = D.orders.find(x => x.id === o.id);
ok(o.payment === 'confirmed' && o.paid_amount === 690 && o.events.length >= 4, 'تأكيد السداد بعد المطابقة، وكل قرار في سجل الطلب');

// الحساب البنكي: آيبان خاطئ يُرفض، وبعد التفعيل يظهر للمسجّل
await p.fill('#bk-i', 'SA1210000001400012583009'); await p.check('#bankF [name=enabled]'); await p.click('#bankF button'); await p.waitForTimeout(300);
ok(/الآيبان/.test(await text('#bkE')), 'آيبان خاطئ يُرفض');
await p.fill('#bk-i', 'SA1210000001400012583008'); await p.click('#bankF button'); await p.waitForTimeout(600);
ok((await data()).settings.bank.enabled === true, 'تفعيل عرض الحساب البنكي');

// برنامج تدريبي: طلب ثانٍ برقم جديد، والحساب ظاهر الآن
await p.goto(U + '#enroll'); await p.reload(); await p.waitForSelector('#en-item'); await p.check('#en-kind-program', { force: true }); await p.selectOption('#en-item', { index: 1 });
await person('فهد خالد علي العتيبي', '1000000511', '0556661001', 'program'); await p.click('#rfGo'); await p.waitForSelector('.ord');
D = await data(); const o2 = D.orders.find(x => x.trainee_id === t.id && x.kind === 'program');
ok(o2 && o2.number !== o.number && o2.enrollment_ids.length >= 1 && /SA1210000001400012583008/.test(await text('.ord-bank')), 'طلب مستقل للبرنامج، وبيانات التحويل تظهر بعد التفعيل');

// منع الحضور: معطّل افتراضيًا، وعند تفعيله يُمنع غير المستوفي إلا بقبول مؤقت
const blocked = () => p.evaluate(async id => { const m = window.__SAMA__; const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); const o = D.orders.find(x => x.id === id);
  return { req: D.settings.require_order_approval, ready: o.provisional || (o.approval === 'approved' && o.payment === 'confirmed') }; }, o2.id);
ok((await blocked()).req === false, 'منع الحضور قبل الاعتماد معطّل افتراضيًا');
await admin('admin-orders'); await p.check('#reqAp'); await p.waitForTimeout(500);
ok((await data()).settings.require_order_approval === true, 'الإدارة تفعّل منع الحضور قبل الاعتماد');
await p.selectOption('#of-st', 'all'); await p.click(`[data-oo="${o2.id}"]`); await p.waitForSelector('#om-prov'); await p.click('#om-prov'); await p.waitForTimeout(300);
ok(/سبب/.test(await text('#omE')), 'القبول المؤقت يحتاج سببًا');
await p.fill('#om-r', 'وعد بالسداد نهاية الأسبوع'); await p.click('#om-prov'); await p.waitForTimeout(600);
ok((await blocked()).ready === true, 'القبول المؤقت يسمح بالحضور');

// البوابة: المتدرب يرى طلباته
await p.goto(U + 'student/'); await p.waitForSelector('#pl-phone'); await p.fill('#pl-phone', '0556661001'); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForSelector('#myOrders');
const mine = await text('#myOrders');
ok(mine.includes(o.number) && mine.includes(o2.number) && /قبول مؤقت/.test(mine) && /تم تأكيد السداد/.test(mine), 'بطاقة «طلباتي والسداد» في بوابة المتدرب');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'لا تمرير أفقي');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
