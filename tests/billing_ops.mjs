// الخطوة AH: الدفع بأكثر من طريقة في فاتورة واحدة، تغيير الباقة، الإلغاء والاسترداد بإشعار، وإغلاق الصندوق
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const S = (fn, arg) => p.evaluate(fn, arg);
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const admin = async r => { await p.goto(U + 'admin/#' + r); await p.reload(); await p.waitForTimeout(500);
  if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); } await p.waitForSelector('#main'); };
const openOrder = async id => { await admin('admin-orders'); await p.selectOption('#of-st', 'all'); await p.waitForTimeout(300); await p.click(`[data-oo="${id}"]`); await p.waitForSelector('.modal'); };

// مشترك جديد من الإدارة ← نافذة استلام المبلغ ← نقدًا + شبكة في فاتورة واحدة
await admin('admin-qudurat');
const nid = await S(() => window.__SAMA__.makeSaudiId('1'));
await p.click('#qAdd'); await p.waitForTimeout(300);
await p.fill('#sm-nid', nid); await p.fill('#sm-name', 'ماجد سعيد علي العتيبي'); await p.fill('#sm-phone', '0557771234'); await p.selectOption('#sm-gender', 'ذكر');
await p.selectOption('#sm-plan', { label: 'الأساسية' }); await p.click('#smS'); await p.waitForSelector('#om-recv');
ok(/استلام المبلغ/.test(await text('.modal')) && (await p.inputValue('#opl-a0')) === '690', 'تفتح نافذة الاستلام بالمطلوب الآن');
await p.fill('#opl-a0', '300'); await p.selectOption('#opl-m0', 'cash'); await p.fill('#opl-r0', 'سند 12');
await p.click('#opl-add'); await p.waitForTimeout(150);
const rows = await p.$$('#opl .pl-row'); ok(rows.length === 2, 'إضافة طريقة سداد ثانية');
const sec = await rows[1].$('[data-k=amount]'); await sec.fill('390'); await (await rows[1].$('[data-k=method]')).selectOption('pos'); await (await rows[1].$('[data-k=reference]')).fill('845201');
await p.waitForTimeout(150); ok(/690|٦٩٠/.test(await text('#opl-sum')), 'المجموع يظهر مباشرة');
await p.click('#om-recv'); await p.waitForTimeout(800);
let D = await data(); const t = D.trainees.find(x => x.national_id === nid), s = D.subscriptions.find(x => x.trainee_id === t.id), o = D.orders.find(x => x.subscription_id === s.id);
let inv = D.invoices.find(i => i.order_id === o.id);
ok(o.payment === 'confirmed' && o.paid_amount === 690 && inv && inv.paid === 690 && inv.method === 'متعددة' && inv.lines.length === 2 && inv.lines[1].method === 'pos', 'فاتورة واحدة تُفصَّل فيها الطريقتان');
ok(D.invoices.filter(i => i.order_id === o.id).length === 1, 'لا فواتير منفصلة لكل طريقة');

// ترقية إلى الذهبية: البداية كما هي، والمتبقي يُستلم
const start = '2026-08-29';
await S(([id, st]) => { const D = window.__SAMA__.LocalStore.data, x = D.subscriptions.find(s => s.id === id); x.start_date = st; x.status = 'active'; window.__SAMA__.LocalStore.save(); }, [s.id, start]);
await p.reload(); await openOrder(o.id);
const gold = D.plans.find(x => x.tier === 'gold' && x.mode === 'in_person'), basic = D.plans.find(x => x.tier === 'basic' && x.mode === 'in_person');
ok(!(await p.$(`#om-pl option[value="${basic.id}"]`)) && !(await p.$$eval('#om-pl option', os => os.some(x => /عن بُعد/.test(x.textContent)))), 'الباقة الحالية والباقات عن بُعد خارج الاختيار');
await p.selectOption('#om-pl', gold.id); await p.waitForTimeout(150);
ok((await p.inputValue('#om-pt')) === '1690' && /المتبقي 1,?000|المتبقي ١٬?٠٠٠/.test(await text('#om-pv')), 'معاينة الإجمالي والمتبقي');
await p.click('#om-chg'); await p.waitForTimeout(300); ok(/سبب/.test(await text('#omE')), 'تغيير الباقة يحتاج سببًا');
await p.fill('#om-pr', 'ترقية بطلب ولي الأمر'); await p.click('#om-chg'); await p.waitForTimeout(800);
D = await data(); let o2 = D.orders.find(x => x.id === o.id), s2 = D.subscriptions.find(x => x.id === s.id);
ok(o2.total === 1690 && /ذهبية/.test(o2.title) && s2.plan_id === gold.id && s2.start_date === start && s2.end_date > start, 'الترقية: البداية 29 أغسطس كما هي والنهاية للذهبية');
ok(o2.events.some(e => e.action === 'plan_changed'), 'التغيير في سجل الطلب');
await p.fill('#opl-a0', '1000'); await p.selectOption('#opl-m0', 'transfer'); await p.fill('#opl-r0', 'TR-55'); await p.click('#om-recv'); await p.waitForTimeout(800);

// تخفيض إلى الأساسية: فائض 1000 ← استرداد بطريقتين
await openOrder(o.id); await p.selectOption('#om-pl', basic.id); await p.fill('#om-pr', 'تخفيض'); await p.click('#om-chg'); await p.waitForTimeout(900);
ok(/فائض بعد تخفيض الباقة/.test(await text('.modal')) && (await p.inputValue('#orf-a0')) === '1000', 'الفائض يظهر قابلًا للاسترداد');
await p.fill('#orf-a0', '700'); await p.selectOption('#orf-m0', 'transfer'); await p.click('#orf-add'); await p.waitForTimeout(100);
const rr = await p.$$('#orf .pl-row'); await (await rr[1].$('[data-k=amount]')).fill('400'); await (await rr[1].$('[data-k=method]')).selectOption('cash');
await p.fill('#om-rr', 'رد الفائض'); await p.click('#om-ref'); await p.waitForTimeout(300);
ok(/أكبر من القابل للاسترداد/.test(await text('#omE')), 'لا يتجاوز الفائض');
await (await rr[1].$('[data-k=amount]')).fill('300'); await p.click('#om-ref'); await p.waitForTimeout(800);
D = await data(); o2 = D.orders.find(x => x.id === o.id); const rf = D.invoices.find(i => i.doc_type === 'refund' && i.order_id === o.id);
ok(rf && /^RF-\d{4}-\d{6}$/.test(rf.number) && rf.paid === 1000 && rf.lines.length === 2 && /^INV-/.test(rf.ref_invoice) && o2.paid_amount === 690 && o2.refunded === 1000, 'إشعار استرداد بطريقتين مرتبط بالفاتورة، والمدفوع بعده');

// الإلغاء والانسحاب ثم استرداد جزئي
await openOrder(o.id); await p.fill('#om-cr', 'انسحاب بعذر مقبول'); await p.click('#om-cancel'); await p.waitForTimeout(900);
D = await data(); ok(D.subscriptions.find(x => x.id === s.id).status === 'cancelled' && D.orders.find(x => x.id === o.id).cancelled_at, 'الإلغاء يلغي الاشتراك ويبقي الطلب');
ok(/المدفوع القابل للاسترداد/.test(await text('.modal')) && !(await p.$('#om-recv')), 'بعد الإلغاء: استرداد فقط ولا استلام');
await p.fill('#orf-a0', '345'); await p.fill('#om-rr', 'استرداد جزئي بعد البدء'); await p.click('#om-ref'); await p.waitForTimeout(800);
D = await data(); o2 = D.orders.find(x => x.id === o.id);
ok(o2.paid_amount === 345 && o2.refunded === 1345, 'الاسترداد الجزئي');

// صفحة الفواتير: الإشعارات والصافي وإغلاق الصندوق
await admin('admin-invoices'); await p.click('[data-it=list]'); await p.waitForTimeout(300);
ok(/المسترد/.test(await text('#main')) && /الصافي/.test(await text('#main')), 'إجماليات المحصَّل والمسترد والصافي');
await p.selectOption('#if-s', 'refund'); await p.waitForTimeout(300);
ok((await p.$$('[data-io]')).length === 2, 'تصفية إشعارات الاسترداد');
await p.click('[data-io]'); await p.waitForSelector('.modal');
ok(/إشعار استرداد/.test(await text('.modal h3')) && /الفاتورة المرتبطة/.test(await text('.modal')), 'نافذة الإشعار وفاتورته المرتبطة');
await p.click('#im-x');
await p.click('[data-it=cash]'); await p.waitForSelector('#cc-d');
const today = await S(() => window.__SAMA__.riyadhNow ? window.__SAMA__.riyadhNow().date : new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10));
await p.fill('#cc-d', today); await p.dispatchEvent('#cc-d', 'change'); await p.waitForTimeout(300);
const cc = await text('#main');
ok(/نقدًا/.test(cc) && /شبكة/.test(cc) && /تحويل بنكي/.test(cc) && /المقبوض/.test(cc) && /المردود/.test(cc), 'إغلاق الصندوق: لكل طريقة مقبوض ومردود وصافٍ');
ok(/1,?345|١٬?٣٤٥/.test(cc), 'مردود اليوم 1345 من مقبوض 1690');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'لا تمرير أفقي');

// على الجوال: سطور السداد تتكدّس بلا تمرير أفقي
await p.setViewportSize({ width: 360, height: 780 }); await openOrder(D.orders.find(x => x.payment !== 'confirmed' && !x.cancelled_at && x.approval !== 'rejected')?.id || o.id);
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'لا تمرير أفقي على الجوال');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
