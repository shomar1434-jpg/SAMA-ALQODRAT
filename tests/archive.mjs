// الخطوة BB: حذف المتدرب كاملًا (المالك ومدير النظام، بكلمة المرور والاسم) و«بيانات مؤرشفة» والحذف الآلي بعد مدة الحفظ
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
import { serviceState, archiveList, dueForPurge, confirmNameOk } from '../src/archive_logic.js';
import { addDays, riyadhNow } from '../src/utils.js';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const T = riyadhNow().date;

// منطق خالص
const D0 = { trainees: [{ id: 'a', full_name: 'أ' }, { id: 'b', full_name: 'ب' }, { id: 'c', full_name: 'ج' }, { id: 'd', full_name: 'د' }],
  subscriptions: [{ id: 's1', trainee_id: 'a', status: 'active', end_date: addDays(T, 5) }, { id: 's2', trainee_id: 'b', status: 'active', end_date: addDays(T, -95) },
    { id: 's3', trainee_id: 'c', status: 'cancelled', end_date: addDays(T, 30) }, { id: 's4', trainee_id: 'd', status: 'active', end_date: addDays(T, -120) }],
  orders: [{ trainee_id: 'd', total: 500, paid_amount: 200, approval: 'approved' }], enrollments: [], cohorts: [] };
ok(serviceState(D0, 'a', T).state === 'active' && serviceState(D0, 'b', T).state === 'completed' && serviceState(D0, 'c', T).state === 'withdrawn', 'حالة الخدمات');
const AL = archiveList(D0, T, 90);
ok(AL.length === 3 && AL.find(x => x.id === 'b').purge_on === addDays(T, -5), 'الأرشيف وموعد الحذف');
ok(JSON.stringify(dueForPurge(D0, T, 90)) === '["b"]', 'الحذف الآلي: المنتهي منذ المدة بلا متبقٍ وحده (لا المنسحب ولا من عليه متبقٍ)');
ok(confirmNameOk(' أحمد  علي ', 'أحمد علي') && !confirmNameOk('أحمد', 'أحمد علي') && !confirmNameOk('', ''), 'تأكيد الاسم');

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); let p = await ctx.newPage();
const errs = []; const watch = pg => pg.on('pageerror', e => errs.push(e.message)); watch(p);
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const setData = async D => { await p.close(); p = await ctx.newPage(); watch(p);
  await p.addInitScript(d => { if(!sessionStorage.getItem('seeded')){ localStorage.setItem('sama_qudrat_v4', d); sessionStorage.setItem('seeded', '1'); } }, JSON.stringify(D)); };
const admin = async r => { await p.goto(U + 'admin/#' + r); await p.reload(); await p.waitForTimeout(500);
  if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); } await p.waitForSelector('#main', {timeout:8000}); };

// مشترك بطلب وفاتورة
await admin('admin-qudurat');
const nid = await p.evaluate(() => window.__SAMA__.makeSaudiId('1'));
await p.click('#qAdd'); await p.waitForTimeout(300);
await p.fill('#sm-nid', nid); await p.fill('#sm-name', 'نايف سعيد علي الزهراني'); await p.check('[name=minor][value=no]'); await p.fill('#sm-phone', '0557771388'); await p.selectOption('#sm-gender', 'ذكر');
await p.selectOption('#sm-plan', { label: 'الذهبية' }); await p.click('#smS'); await p.waitForSelector('#om-recv');
await p.fill('#opl-a0', '500'); await p.click('#om-recv'); await p.waitForTimeout(800);
let D = await data(); const t = D.trainees.find(x => x.national_id === nid);
const ordIds = D.orders.filter(o => o.trainee_id === t.id).map(o => o.id);
ok(ordIds.length && D.invoices.some(i => ordIds.includes(i.order_id)), 'له طلب وفاتورة');

// الحذف اليدوي
await admin('admin-trainees'); await p.fill('#tq', 'نايف سعيد'); await p.waitForTimeout(600);
await p.click(`[data-del="${t.id}"]`); await p.waitForSelector('#dt-n');
ok(await p.isDisabled('#dtS'), 'زر الحذف معطّل قبل كتابة الاسم');
await p.fill('#dt-n', 'نايف'); ok(await p.isDisabled('#dtS'), 'الاسم الناقص لا يكفي');
await p.fill('#dt-n', 'نايف سعيد علي الزهراني'); await p.click('#dtS');
await p.waitForSelector('#ra-p'); ok(true, 'يطلب إعادة إدخال كلمة المرور');
await p.fill('#ra-p', '1234'); await p.click('#raS'); await p.waitForTimeout(900);
D = await data();
ok(!D.trainees.some(x => x.id === t.id) && !D.subscriptions.some(s => s.trainee_id === t.id), 'حُذف المتدرب واشتراكه');
ok(!D.orders.some(o => ordIds.includes(o.id)) && !D.invoices.some(i => ordIds.includes(i.order_id)), 'حُذفت طلباته وفواتيره');
ok(!(D.audit_logs || []).some(l => l.entity === t.id || JSON.stringify(l.detail || '').includes(nid)), 'لا أثر له في سجل الحركات');
ok((D.audit_logs || []).some(l => l.action === 'trainees.purge' && l.detail.mode === 'manual'), 'حدث حذف واحد مسجّل');

// الأرشيف والحذف الآلي
D = await data();
const [x1, x2] = D.subscriptions.filter(s => s.status !== 'cancelled' && !(D.orders || []).some(o => o.trainee_id === s.trainee_id && (+o.total || 0) > (+o.paid_amount || 0)) && D.subscriptions.filter(y => y.trainee_id === s.trainee_id).length === 1 && !(D.enrollments || []).some(e => e.trainee_id === s.trainee_id));
x1.end_date = addDays(T, -100); x1.start_date = addDays(T, -200); x1.status = 'active';
x2.end_date = addDays(T, -20); x2.start_date = addDays(T, -120); x2.status = 'active';
await setData(D);
await admin('admin-archive'); await p.waitForSelector('#arT');
D = await data();
ok(!D.trainees.some(x => x.id === x1.trainee_id), 'حُذف آليًا من انقضت مدة حفظه');
ok(D.trainees.some(x => x.id === x2.trainee_id) && (await p.textContent('#arT')).includes(D.trainees.find(x => x.id === x2.trainee_id).full_name), 'المنتهي حديثًا في «بيانات مؤرشفة»');
ok(/بعد (70|٧٠) يوم/.test(await p.textContent('#arT')), 'موعد الحذف الآلي ظاهر');
ok((D.audit_logs || []).some(l => l.action === 'trainees.purge' && l.detail.mode === 'auto'), 'الحذف الآلي مسجّل');

ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
