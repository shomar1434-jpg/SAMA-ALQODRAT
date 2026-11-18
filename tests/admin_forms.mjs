// طلب المالك 18 نوفمبر: نموذج «إضافة مشترك» بعناصر نموذج التسجيل، وحساب تجريبي منه دون قيد الهوية، ونموذج الاستكمال بلا مدينة
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
import { dataIssues } from '../src/import_logic.js';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
ok(!dataIssues({ trainees:[{ id:'x', full_name:'أ ب ج', phone:'0551234567', national_id:'1000000016', email:'a@b.co', guardian_phone:'0559999999' }], orders:[], enrollments:[], cohorts:[], programs:[] }).length, 'لا شرط للمدينة ولا لتاريخ الميلاد للمشترك في الباقات');

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();

await p.goto(U + 'admin/#admin-qudurat'); await p.waitForTimeout(600);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
await p.waitForSelector('#qAdd'); await p.click('#qAdd'); await p.waitForSelector('#smF');
const order = await p.$$eval('#smF [name]', e => e.map(x => x.name).filter((n, i, a) => a.indexOf(n) === i));
ok(['full_name', 'national_id', 'phone', 'email', 'gender', 'minor', 'guardian_phone'].every((n, i, a) => order.indexOf(n) >= 0 && (i === 0 || order.indexOf(a[i - 1]) < order.indexOf(n))), 'عناصر «إضافة مشترك» بترتيب نموذج التسجيل: الاسم، الهوية، الجوال، البريد، الجنس، دون 18، جوال ولي الأمر');

// القاصر بلا جوال ولي الأمر مرفوض
const nid = await p.evaluate(() => { let s; do { s = '1' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0'); } while (!(() => { const d = s.split('').map(Number); let t = 0; d.forEach((x, i) => { if (i % 2 === 0) { const y = x * 2; t += y > 9 ? y - 9 : y; } else t += x; }); return t % 10 === 0; })()); return s; });
await p.fill('#sm-name', 'سالم فهد علي الشهري'); await p.fill('#sm-nid', nid); await p.fill('#sm-phone', '0557774001'); await p.check('[name=minor][value=yes]');
await p.click('#smS'); await p.waitForTimeout(300);
ok(/ولي الأمر إلزامي/.test(await text('#smE')), 'دون 18 بلا جوال ولي الأمر مرفوض كما في التسجيل');
await p.fill('#sm-gphone', '0557774002'); await p.fill('#sm-email', 'salem@example.com'); await p.click('#smS'); await p.waitForTimeout(900);
if (await p.$('#rcX')) await p.click('#rcX'); if (await p.$('.modal-bg button.btn:not(.pri)')) await p.click('.modal-bg button.btn:not(.pri)').catch(() => {});
let D = await data(); const t = D.trainees.find(x => x.national_id === nid);
ok(t && t.email === 'salem@example.com' && t.guardian_phone === '0557774002', 'البريد وجوال ولي الأمر يُحفظان مع المشترك المضاف');

// الحساب التجريبي من «إضافة مشترك» دون رقم هوية
await p.goto(U + 'admin/#admin-qudurat'); await p.reload(); await p.waitForSelector('#qAdd'); await p.click('#qAdd'); await p.waitForSelector('#smF');
await p.check('#sm-test'); ok(await p.isHidden('#smNidF') && await p.isHidden('#smMinor'), 'الحساب التجريبي يُخفي رقم الهوية وسؤال العمر');
await p.fill('#sm-name', 'متابع المركز'); await p.click('#smS'); await p.waitForTimeout(900);
D = await data(); const tt = D.trainees.find(x => x.is_test && /متابع المركز/.test(x.full_name));
ok(tt && /^\d{10}$/.test(tt.national_id) && D.subscriptions.some(s => s.trainee_id === tt.id), 'أُنشئ حساب تجريبي برقم هوية اصطناعي واشتراك');

// مراجعة البيانات: نموذج المشترك في الباقة بلا مدينة
await p.goto(U + 'admin/#admin-data'); await p.reload(); await p.waitForTimeout(800);
ok(!/المدينة غير مسجّلة/.test(await text('#main')), 'لا «المدينة غير مسجّلة» في مراجعة البيانات');

ok(!errs.length, 'بلا أخطاء صفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
