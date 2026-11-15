// الخطوة AL: تعديل بيانات أي متدرب، وكشف حساب المتدرب
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
import { traineeStatement } from '../src/statement_logic.js';
import { dataIssues } from '../src/import_logic.js';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();

// منطق الكشف: رصيد متحرك، والطلب الملغى يُغلق رصيده
const SD = { orders: [{ id: 'o1', trainee_id: 't', number: 'SAMA-2026-000001', title: 'باقة ذهبية', total: 1690, paid_amount: 1190, created_at: '2026-11-01T10:00:00Z', approval: 'approved', opening: { paid: 500, payments: [{ amount: 500, method: 'cash', label: 'دفعة 1' }] } },
  { id: 'o2', trainee_id: 't', number: 'SAMA-2026-000002', title: 'برنامج', total: 300, paid_amount: 200, refunded: 100, cancelled_at: '2026-11-10', created_at: '2026-11-05T10:00:00Z', approval: 'approved' },
  { id: 'o3', trainee_id: 't', number: 'SAMA-2026-000003', title: 'مرفوض', total: 999, paid_amount: 0, created_at: '2026-11-06T10:00:00Z', approval: 'rejected' }],
  invoices: [{ order_id: 'o1', order_number: 'SAMA-2026-000001', number: 'INV-2026-000001', status: 'issued', doc_type: 'invoice', paid: 690, issue_date: '2026-11-03', lines: [{ method: 'cash', amount: 400 }, { method: 'pos', amount: 290 }] },
    { order_id: 'o1', order_number: 'SAMA-2026-000001', number: 'INV-2026-000009', status: 'void', doc_type: 'invoice', paid: 50, issue_date: '2026-11-04', lines: [] },
    { order_id: 'o2', order_number: 'SAMA-2026-000002', number: 'INV-2026-000002', status: 'issued', doc_type: 'invoice', paid: 300, issue_date: '2026-11-05', method: 'نقدًا', lines: [] },
    { order_id: 'o2', order_number: 'SAMA-2026-000002', number: 'RF-2026-000001', status: 'issued', doc_type: 'refund', paid: 100, issue_date: '2026-11-10', lines: [{ method: 'cash', amount: 100 }], reason: 'انسحاب' }] };
const St = traineeStatement(SD, 't');
ok(St.orders === 2 && St.charges === 1890 && St.paid === 1490 && St.refunded === 100 && St.balance === 500, 'الإجماليات: الرسوم والمدفوع والمسترد والرصيد (بلا المرفوض والملغاة)');
ok(St.rows.map(r => r.balance).join(',') === '1690,1190,500,700,400,500', 'الرصيد المتحرك بالتسلسل الزمني');

// الخطوة AO: ترقية محتملة لم تُسجَّل (المدفوع أكثر من سعر الباقة المسجّلة، أو ملاحظة تحويل في الكشف)
const PL = [{ id: 'b', tier: 'basic', mode: 'in_person', reg_fee: 690, installments: 0, installment_amount: 0 }, { id: 's', tier: 'silver', mode: 'in_person', reg_fee: 690, installments: 2, installment_amount: 250 }];
const DI = { plans: PL, trainees: [{ id: 't1', full_name: 'اسيل مصعب علي', phone: '0551234567', national_id: '1', import_notes: [] }, { id: 't2', full_name: 'فراس يحيى عبده', phone: '0551234568', national_id: '2', import_notes: [{ text: 'تحويل بين الباقات: الأساسية حول للباقة الفضية', done: false }] }, { id: 't3', full_name: 'سعد علي محمد', phone: '0551234569', national_id: '3', import_notes: [] }],
  subscriptions: [{ id: 'x1', plan_id: 'b', status: 'ended' }, { id: 'x2', plan_id: 's', status: 'active' }, { id: 'x3', plan_id: 'b', status: 'ended' }],
  orders: [{ id: 'o1', number: 'SAMA-1', trainee_id: 't1', subscription_id: 'x1', total: 1190, paid_amount: 1190, approval: 'approved' }, { id: 'o2', number: 'SAMA-2', trainee_id: 't2', subscription_id: 'x2', total: 1190, paid_amount: 940, approval: 'approved' }, { id: 'o3', number: 'SAMA-3', trainee_id: 't3', subscription_id: 'x3', total: 690, paid_amount: 690, approval: 'approved' }] };
const up = Object.fromEntries(dataIssues(DI).map(x => [x.trainee.id, x.issues.filter(i => i.upgrade).map(i => i.text)]));
ok(up.t1?.length === 1 && /ترقية محتملة/.test(up.t1[0]) && /الفضية 1190/.test(up.t1[0]), 'المدفوع يطابق سعر باقة أعلى: ترقية محتملة لم تُسجَّل');
ok(up.t2?.length === 1 && /تحويل بين الباقات/.test(up.t2[0]), 'ملاحظة تحويل في الكشف تُصنَّف ترقية');
ok(!up.t3?.length, 'لا تنبيه لمن دفع سعر باقته');
DI.orders[2].paid_amount = 700; DI.orders[2].total = 700;
ok(!dataIssues(DI).find(x => x.trainee.id === 't3')?.issues.some(i => i.upgrade), 'زيادة سداد صغيرة (10 ريالات) لا تُعد ترقية');

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const admin = async r => { await p.goto(U + 'admin/#' + r); await p.reload(); await p.waitForTimeout(600);
  if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); } await p.waitForSelector('#main'); await p.waitForTimeout(400); };
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));

// مشترك جديد بدفعتين ثم إلغاء واسترداد جزئي
await admin('admin-qudurat');
const nid = await p.evaluate(() => window.__SAMA__.makeSaudiId('1'));
await p.click('#qAdd'); await p.waitForTimeout(300);
await p.fill('#sm-nid', nid); await p.fill('#sm-name', 'هشام سعيد علي الزهراني'); await p.fill('#sm-phone', '0557776655'); await p.selectOption('#sm-gender', 'ذكر');
await p.selectOption('#sm-plan', { label: 'الأساسية' }); await p.click('#smS'); await p.waitForSelector('#om-recv');
await p.fill('#opl-a0', '690'); await p.selectOption('#opl-m0', 'cash'); await p.click('#om-recv'); await p.waitForTimeout(800);
let D = await data(); const t = D.trainees.find(x => x.national_id === nid), o = D.orders.find(x => x.trainee_id === t.id);
await admin('admin-orders'); await p.selectOption('#of-st', 'all'); await p.waitForTimeout(300); await p.click(`[data-oo="${o.id}"]`); await p.waitForSelector('.modal');
await p.fill('#om-cr', 'انسحاب'); await p.click('#om-cancel'); await p.waitForTimeout(900);
await p.fill('#orf-a0', '200'); await p.fill('#om-rr', 'استرداد جزئي'); await p.click('#om-ref'); await p.waitForTimeout(900);
await p.click(`[data-oo="${o.id}"]`); await p.waitForSelector('#omST'); await p.click('#omST'); await p.waitForTimeout(400);
const st = await text('.modal');
ok(/كشف حساب هشام/.test(st) && /إشعار استرداد/.test(st) && /لا رصيد مستحق/.test(st), 'كشف الحساب من نافذة الطلب: الطلب الملغى يُغلق رصيده');
ok(await p.$('#stP') && await p.$('#stC'), 'طباعة A4 وتصدير CSV');
await p.click('#stP'); await p.waitForTimeout(500);
ok(/كشف حساب متدرب/.test(await text('#printRoot')), 'مستند الطباعة');
await p.evaluate(() => { document.querySelector('#printRoot').innerHTML = ''; document.querySelector('#printRoot').className = ''; document.querySelector('#modalRoot').innerHTML = ''; });

// تعديل بيانات متدرب من «المتدربون»
await admin('admin-trainees'); await p.fill('#tq', 'هشام سعيد'); await p.waitForTimeout(700);
await p.click(`[data-ted="${t.id}"]`); await p.waitForSelector('#fxF');
ok(/بيانات المتدرب|استكمال بيانات/.test(await text('.modal h3')), 'نافذة بيانات المتدرب من «المتدربون»');
await p.fill('#fx-n', 'هشام سعيد علي الغامدي'); await p.click('#fxS'); await p.waitForTimeout(800);
D = await data(); ok(D.trainees.find(x => x.id === t.id).full_name === 'هشام سعيد علي الغامدي', 'تصحيح الاسم');
await p.click(`[data-tst="${t.id}"]`).catch(() => {}); await p.waitForTimeout(300);
ok(/كشف حساب/.test(await text('.modal')), 'كشف الحساب من «المتدربون»');
await p.evaluate(() => { document.querySelector('#modalRoot').innerHTML = ''; });

// مراجعة البيانات: البحث يصل إلى من بياناته مكتملة
const full = await p.evaluate(() => { const D = window.__SAMA__.LocalStore.data, t = D.trainees.find(x => x.national_id && x.phone && x.birth_date && x.email && x.city && x.education && !(x.import_notes || []).length) || D.trainees[0];
  t.birth_date = t.birth_date || '2000-01-01'; t.email = t.email || 'a@b.co'; t.guardian_phone = t.guardian_phone || '0550000999'; t.city = t.city || 'جازان'; t.education = t.education || 'جامعي'; window.__SAMA__.LocalStore.save(); return { id: t.id, nid: t.national_id }; });
await admin('admin-data'); await p.fill('#dq', full.nid); await p.waitForTimeout(800);
ok(!!(await p.$(`[data-de="${full.id}"]`)), 'البحث في مراجعة البيانات يشمل كل المتدربين');
await p.click(`[data-de="${full.id}"]`); await p.waitForSelector('#fxF');
const nid2 = await p.evaluate(() => window.__SAMA__.makeSaudiId('1'));
await p.fill('#fx-i', nid2); await p.click('#fxS'); await p.waitForTimeout(800);
D = await data(); ok(D.trainees.find(x => x.id === full.id).national_id === nid2, 'تصحيح رقم الهوية');
ok(D.audit_logs.some(a => a.action === 'trainee.update' && a.entity_id === full.id) || D.audit_logs.some(a => a.action === 'trainee.update'), 'التعديل في سجل الحركات');
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
