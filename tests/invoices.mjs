// الخطوة N: الفواتير الداخلية — تصدر عند تأكيد السداد، صفحة المسؤول، إرفاق الإيصال، طباعة A4 عربية، كشف الفترة، والإلغاء بسبب
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
const admin = async r => { await p.goto(U + 'admin/#' + r); await p.reload(); await p.waitForTimeout(500);
  if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); } await p.waitForSelector('#main'); };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC', 'base64');

await p.goto(U + '#enroll'); await p.waitForSelector('#en-item'); await p.check('#en-kind-plan', { force: true }); await p.waitForTimeout(200); await p.selectOption('#en-item', { index: 1 });
await p.fill('[name=full_name]', 'راشد سعد علي المالكي'); await p.fill('[name=national_id]', '1000000529'); await p.fill('[name=phone]', '0556662001'); await p.selectOption('[name=gender]', 'ذكر');
await p.fill('[name=birth_date]', years(25)); await p.dispatchEvent('[name=birth_date]', 'change'); await p.selectOption('[name=city]', { index: 1 }); await p.selectOption('[name=education]', { index: 1 }); await p.check('[name=agree]');
await p.click('#rfGo'); await p.waitForSelector('.ord');
await p.fill('.ord-f [name=reference]', 'TRX-4411'); await p.click('.ord-f button'); await p.waitForTimeout(400);
let D = await data(); const o = D.orders.find(x => x.claim?.reference === 'TRX-4411');
ok(o && !(D.invoices || []).length, 'لا فاتورة قبل تأكيد السداد');

await admin('admin-orders'); await p.click(`[data-oo="${o.id}"]`); await p.waitForSelector('#opl-a0'); await p.click('#om-recv'); await p.waitForTimeout(700);
D = await data(); let inv = D.invoices[0];
ok(D.invoices.length === 1 && /^INV-\d{4}-\d{6}$/.test(inv.number) && inv.order_number === o.number, 'تصدر فاتورة برقم تسلسلي عند تأكيد السداد');
ok(inv.customer_name === 'راشد سعد علي المالكي' && inv.kind === 'plan' && inv.service === o.title && inv.purchase_date === o.created_at.slice(0, 10), 'اسم صاحب الخدمة ونوع الخدمة وتاريخ شرائها');
ok(inv.total === o.total && inv.paid === o.due_now && inv.remaining === o.total - o.due_now && inv.transfer_ref === 'TRX-4411' && inv.method === 'تحويل بنكي', 'مبلغ الباقة والمدفوع والمتبقي ورقم التحويل');

await admin('admin-invoices');
const main = await text('#main');
ok(main.includes(inv.number) && /راشد سعد/.test(main) && /TRX-4411/.test(main) && /المحصَّل/.test(main), 'صفحة الفواتير تعرض الفاتورة والإجماليات');
await p.fill('#if-q', 'لا يوجد'); await p.waitForTimeout(600);
ok(!(await text('#main')).includes(inv.number), 'البحث يصفّي القائمة');
await p.fill('#if-q', 'TRX-4411'); await p.waitForTimeout(600);
ok((await text('#main')).includes(inv.number), 'البحث بمرجع التحويل');

// إرفاق صورة الإيصال ثم الطباعة
await p.click(`[data-io="${inv.id}"]`); await p.waitForSelector('#im-f');
await p.setInputFiles('#im-f', { name: 'receipt.png', mimeType: 'image/png', buffer: PNG }); await p.waitForSelector('.inv-thumb');
D = await data(); inv = D.invoices[0];
ok(inv.has_receipt && /^data:image\/jpeg;base64,/.test(D.invoice_receipts[inv.id]), 'إرفاق صورة الإيصال (مضغوطة) بالفاتورة');
await p.setInputFiles('#im-f', { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('x') }); await p.waitForTimeout(300);
ok(/صورة/.test(await text('#imE')), 'ملف غير صورة يُرفض');
await p.click('#im-p'); await p.waitForSelector('#printRoot.on .pdoc');
const doc = await text('#printRoot .ppages');
ok(/فاتورة/.test(doc) && doc.includes(inv.number) && /راشد سعد علي المالكي/.test(doc) && /باقة قدرات وتحصيلي/.test(doc) && /TRX-4411/.test(doc) && /مدير المركز/.test(doc) && /ليس فاتورة ضريبية/.test(doc), 'الفاتورة المطبوعة تحمل البيانات والاعتماد وتنويه المستند الداخلي');
const pr = await p.evaluate(() => { const d = document.querySelector('#printRoot .pdoc'), cs = getComputedStyle(d); return { dir: cs.direction, w: Math.round(d.getBoundingClientRect().width), pages: document.querySelectorAll('#printRoot .pdoc').length, img: !!document.querySelector('#printRoot .inv-rc img') }; });
ok(pr.dir === 'rtl' && Math.abs(pr.w - 794) < 6 && pr.pages === 2 && pr.img, 'صفحة A4 باتجاه RTL، وصورة الإيصال في صفحة ثانية');
await p.click('#pbBack');

// كشف الفترة
await p.click('#ifP'); await p.waitForSelector('#printRoot.on .pdoc');
ok(/كشف الفواتير/.test(await text('#printRoot .ppages')) && (await text('#printRoot .ppages')).includes(inv.number), 'كشف الفواتير للفترة قابل للطباعة');
await p.click('#pbBack');

// الإلغاء بسبب: لا حذف
await p.click(`[data-io="${inv.id}"]`); await p.waitForSelector('#im-v'); await p.click('#im-v'); await p.waitForTimeout(300);
ok(/سبب/.test(await text('#imE')), 'إلغاء الفاتورة يحتاج سببًا');
await p.fill('#im-r', 'تحويل مرتجع من البنك'); await p.click('#im-v'); await p.waitForTimeout(700);
D = await data(); inv = D.invoices[0];
ok(D.invoices.length === 1 && inv.status === 'void' && inv.void_reason === 'تحويل مرتجع من البنك' && D.orders.find(x => x.id === o.id).payment === 'claimed', 'الفاتورة تُلغى ولا تُحذف، ويُلغى معها تأكيد السداد');
await p.selectOption('#if-s', 'all'); await p.waitForTimeout(300);
ok(/ملغاة/.test(await text('#main')), 'الملغاة تبقى في السجل');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'لا تمرير أفقي');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await p.selectOption('#if-s', 'all'); await p.click(`[data-io="${inv.id}"]`); await p.waitForSelector('#im-p'); await p.click('#im-p'); await p.waitForSelector('#printRoot.on .pdoc'); await (await p.$('#printRoot .pdoc')).screenshot({ path: '/tmp/inv.png' });
await b.close(); server.close();
if (failed()) process.exit(1);
