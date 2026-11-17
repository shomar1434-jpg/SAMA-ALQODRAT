// لقطات دليل الاستخدام من النسخة التجريبية (بيانات وهمية): npm run build ثم node scripts/guide_shots.mjs <مجلد> ثم node scripts/build_guide.mjs <مجلد>
import { chromium } from 'playwright';
import { serveDist } from '../tests/_server.mjs';
const OUT = (process.argv[2] || 'guide-shots') + '/'; (await import('node:fs')).mkdirSync(OUT, { recursive: true });
const { server, origin: U } = serveDist();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 860 }, deviceScaleFactor: 1.5, locale: 'ar-SA' });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const W = ms => p.waitForTimeout(ms);
const S = (fn, a) => p.evaluate(fn, a);
const done = [];
const shot = async (name, opt = {}) => { try { await W(opt.wait ?? 500); await p.screenshot({ path: OUT + name + '.png', ...opt.sel ? {} : {}, fullPage: !!opt.full });
  if (opt.sel) await p.locator(opt.sel).first().screenshot({ path: OUT + name + '.png' }); done.push(name); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); } };
const step = async (name, fn) => { try { await fn(); } catch (e) { console.log('STEPFAIL', name, e.message.split('\n')[0]); } };
const admin = async r => { await p.goto(U + 'admin/#' + r); await W(900);
  if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await W(1200); } await p.waitForSelector('#main'); await W(500); };
const closeM = async () => { await p.evaluate(() => { const r = document.querySelector('#modalRoot'); if (r) r.innerHTML = ''; }); await W(300); };

await p.goto(U); await W(1500);

// ===== المالك ومدير النظام =====
await step('login', async () => { await p.goto(U + 'admin/'); await W(1200); await shot('a01_login'); });
await admin('admin');
await shot('a02_dashboard');
await step('qudurat', async () => { await admin('admin-qudurat'); await shot('a03_qudurat_subs'); });
let newOrder;
await step('newsub', async () => {
  const nid = await S(() => window.__SAMA__.makeSaudiId('1'));
  await p.click('#qAdd'); await W(400);
  await p.fill('#sm-nid', nid); await p.fill('#sm-name', 'ماجد سعيد علي العتيبي'); await p.fill('#sm-phone', '0557771234'); await p.selectOption('#sm-gender', 'ذكر');
  await p.selectOption('#sm-plan', { label: 'الذهبية' }); await shot('a04_new_sub');
  await p.click('#smS'); await p.waitForSelector('#om-recv'); await W(300);
  await p.fill('#opl-a0', '400'); await p.selectOption('#opl-m0', 'cash'); await p.fill('#opl-r0', 'سند 112');
  await p.click('#opl-add'); await W(200);
  const rows = await p.$$('#opl .pl-row'); await (await rows[1].$('[data-k=amount]')).fill('290'); await (await rows[1].$('[data-k=method]')).selectOption('pos'); await (await rows[1].$('[data-k=reference]')).fill('845201');
  await shot('a05_receive_payment');
  await p.click('#om-recv'); await W(900);
  newOrder = await S(() => { const D = window.__SAMA__.LocalStore.data; return D.orders[D.orders.length - 1].id; });
});
await step('today', async () => { await admin('admin-qudurat'); await p.click('[data-qt=today]'); await shot('a06_qudurat_today'); });
await step('plans', async () => { await p.click('[data-qt=plans]'); await shot('a07_qudurat_plans'); await p.click('[data-qt=schedule]'); await shot('a08_qudurat_schedule'); });
await step('display', async () => { await admin('admin'); await p.goto(U + 'admin/#display'); await p.waitForSelector('#app .wrap'); await shot('a09_display', { wait: 1200 });
  const ab = await p.$('[data-abs]'); if (ab) { await ab.click(); await shot('a10_absence_wa'); await closeM(); } });

// طلبات شراء متنوعة لعرض الصفحة
await step('seed orders', async () => { await S(async () => { const L = window.__SAMA__.LocalStore, D = L.data;
  const pl = D.plans.find(x => x.tier === 'silver' && x.mode === 'in_person');
  for (const [nm, ph, g] of [['ريم خالد أحمد الشهري', '0551112233', 'أنثى'], ['سلطان محمد يحيى القحطاني', '0552223344', 'ذكر']]) {
    try { const r = await L.registerSubscription({ national_id: window.__SAMA__.makeSaudiId('1'), full_name: nm, phone: ph, gender: g, birth_date: '2009-03-01', guardian_phone: '0559990000', city: D.trainees[0]?.city || 'جازان', education: 'ثانوي', plan_id: pl.id });
      if (r?.order && ph === '0551112233') await L.claimOrderPayment?.(r.order.id, { amount: 250, reference: 'TRX-4411', date: new Date().toISOString().slice(0, 10) }); } catch (e) { console.log(e.message); } } }); });
await step('orders', async () => { await admin('admin-orders'); await shot('a11_orders'); });
await step('order modal', async () => { await admin('admin-orders'); await p.selectOption('#of-st', 'all'); await W(300); await p.click(`[data-oo="${newOrder}"]`); await p.waitForSelector('.modal'); await shot('a12_order_modal');
  await p.selectOption('#om-pl', { index: 1 }); await p.fill('#om-pr', 'ترقية بطلب ولي الأمر');
  await p.locator('#om-pl').scrollIntoViewIfNeeded(); await shot('a13_order_plan_change');
  await p.locator('#om-cancel').scrollIntoViewIfNeeded(); await shot('a14_order_cancel'); await closeM(); });
await step('invoices', async () => { await admin('admin-invoices'); await shot('a15b_pay_summary'); await p.click('[data-it=list]').catch(() => {}); await p.waitForTimeout(400); await shot('a15_invoices');
  const io = await p.$('[data-io]'); if (io) { await io.click(); await p.waitForSelector('.modal'); await shot('a16_invoice_modal'); await closeM(); }
  await p.click('[data-it=cash]'); await shot('a17_cash_close'); });
await step('statement', async () => { await admin('admin-trainees'); await p.fill('#tq', 'ماجد سعيد'); await W(800);
  const tid = await S(() => window.__SAMA__.LocalStore.data.trainees.find(t => t.full_name === 'ماجد سعيد علي العتيبي')?.id);
  await p.click(`[data-tst="${tid}"]`); await p.waitForSelector('.modal'); await shot('a36_statement'); await closeM();
  await p.click(`[data-ted="${tid}"]`); await p.waitForSelector('#fxF'); await shot('a37_edit_trainee'); await closeM(); });
await step('weekly', async () => { await admin('admin-trainees'); await p.fill('#tq', 'ماجد سعيد'); await W(800);
  const tid = await S(() => window.__SAMA__.LocalStore.data.trainees.find(t => t.full_name === 'ماجد سعيد علي العتيبي')?.id);
  await p.click(`[data-twr="${tid}"]`); await p.waitForSelector('.modal .wk'); await shot('a38_weekly'); await closeM(); });
const pages = [['admin-attendance', 'a18_attendance'], ['admin-cohorts', 'a19_cohorts'], ['admin-followup', 'a20_followup'], ['admin-rules', 'a21_rules'], ['admin-users', 'a22_users'], ['admin-bank', 'a23_bank'], ['admin-data', 'a24_data'], ['admin-access', 'a25_access'], ['admin-daily', 'a26_daily'], ['admin-policies', 'a27_policies'], ['admin-notify', 'a28_notify'], ['admin-programs', 'a29_programs'], ['admin-trainees', 'a30_trainees'], ['admin-reports', 'a31_reports'], ['admin-partners', 'a32_partners'], ['admin-admins', 'a33_admins'], ['admin-audit', 'a34_audit'], ['admin-settings', 'a35_settings']];
for (const [r, n] of pages) await step(r, async () => { await admin(r); await shot(n, { wait: 900 }); });
await step('access issue', async () => { await admin('admin-access'); });

// ===== المدرب (جوال) =====
const mob = await b.newContext({ viewport: { width: 412, height: 900 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'ar-SA' });
const m = await mob.newPage(); m.on('pageerror', e => errs.push(e.message));
const mshot = async (name, wait = 600) => { try { await m.waitForTimeout(wait); await m.screenshot({ path: OUT + name + '.png' }); done.push(name); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); } };
await m.goto(U); await m.waitForTimeout(1500);
const T = await m.evaluate(() => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); return D.teachers.find(t => t.section === 'boys' && t.subjects.includes('كمي')); });
const login = async (role, phone, pre) => { await m.goto(U + role + '/'); await m.waitForTimeout(900);
  if (await m.$('#logoutBtn:not([hidden])')) { await m.click('#logoutBtn'); await m.waitForTimeout(500); }
  await m.evaluate(([ph, role]) => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); D.act_windows = (D.act_windows || []).concat([{ id: 'g-' + role, phone: ph, role, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 9e5).toISOString(), used_at: null, revoked: false }]); localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); }, [phone, role]);
  await m.fill('#pl-phone', phone); if (pre) await mshot(pre); await m.click('#plB'); await m.waitForTimeout(500); const shown = ((await m.textContent('#otpShow b').catch(() => '')) || '').trim();
  await m.fill('#pl-code', /^\d{6}$/.test(shown) ? shown : '1234'); if (pre) await mshot(pre + '_code'); await m.click('#plB'); await m.waitForTimeout(1200); };
const mtab = async (attr, k) => { try { await m.click(`[${attr}="${k}"]`); await m.waitForTimeout(700); } catch (e) { console.log('TABFAIL', k); } };
await login('teacher', T.phone, 't01_login');
await mshot('t02_today'); await m.evaluate(() => scrollTo(0, 700)); await mshot('t03_today_sheet');
await mtab('data-tt', 'people'); await mshot('t04_people');
try { await m.click('[data-pc]'); await mshot('t05_trainee_card'); await m.evaluate(() => { const r = document.querySelector('#modalRoot'); if (r) r.innerHTML = ''; }); } catch { try { const c = await m.$('#tBody .card button, #tBody [data-tc]'); if (c) { await c.click(); await mshot('t05_trainee_card'); await m.evaluate(() => { const r = document.querySelector('#modalRoot'); if (r) r.innerHTML = ''; }); } } catch {} }
await mtab('data-tt', 'groups'); await mshot('t06_groups');
await mtab('data-tt', 'hw'); await mshot('t07_hw');
try { const n = await m.$('#hwAdd'); if (n) { await n.click(); await m.waitForTimeout(300); try { await m.check('#hf [name=kind][value=quiz]'); for (const c of await m.$$('#hfUnits input')) await c.check(); await m.fill('#hf-n', '4'); await m.click('#hfDraw'); await m.click('#hfPv'); await m.waitForTimeout(300); } catch {} await mshot('t08_hw_editor', 1800); await m.evaluate(() => { const r = document.querySelector('#modalRoot'); if (r) r.innerHTML = ''; }); await m.waitForTimeout(300); } } catch {}
await mtab('data-tt', 'bank'); await mshot('t09_bank');
await mtab('data-tt', 'msg'); await mshot('t10_msg');
await mtab('data-tt', 'rate'); await mshot('t11_rate');
await mtab('data-tt', 'profile'); await mshot('t12_profile');

// ===== المتدرب (جوال) =====
const Sx = await m.evaluate(() => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4'));
  const s = D.subscriptions.find(s => s.section === 'boys' && s.status === 'active' && (s.subjects || []).includes('كمي')) || D.subscriptions.find(s => s.status === 'active');
  return D.trainees.find(t => t.id === s.trainee_id); });
await m.evaluate(sx => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); const s = D.subscriptions.find(x => x.trainee_id === sx.id);
  const n = new Date(Date.now() + 3 * 3600e3), date = n.toISOString().slice(0, 10), mm = n.getUTCHours() * 60 + n.getUTCMinutes(), at = v => { const t = Math.max(0, Math.min(1439, mm + v)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  D.schedule_exceptions = (D.schedule_exceptions || []).filter(x => !(x.section === s.section && x.date === date)); D.schedule_exceptions.push({ id: 'guide', section: s.section, date, type: 'makeup', start: at(-10), end: at(80), note: '' });
  D.sub_attendance = D.sub_attendance.filter(a => !(a.subscription_id === s.id && a.att_date === date)); localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); localStorage.setItem('sama_welcome_force', '1'); }, Sx);
await login('student', Sx.phone, 's01_login');
await mshot('s00_welcome', 900); try { await m.click('#wlGo'); await mshot('s00_welcome_done', 900); await m.click('#wlSkip'); await m.waitForTimeout(600); } catch (e) { console.log('WLFAIL', e.message.split('\n')[0]); }
await mshot('s02_dash'); await m.evaluate(() => scrollTo(0, 800)); await mshot('s03_dash_more');
await mtab('data-st', 'hw'); await mshot('s04_hw');
try { const q = await m.$('[data-qs]'); if (q) { await q.click(); await mshot('s05_quiz_start'); await m.evaluate(() => { const r = document.querySelector('#modalRoot'); if (r) r.innerHTML = ''; }); } } catch {}
// محاولات تدريب سابقة ليظهر التحليل
await m.evaluate(sx => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')), s = D.subscriptions.find(x => x.trainee_id === sx.id);
  const snap = q => ({ id:q.id, text:q.text, options:q.options, correct:q.correct, explanation:q.explanation || '', subject:q.subject, unit:q.unit, category:q.category || '' });
  ['كمي', 'لفظي', 'كمي'].forEach((sub, i) => { const qs = D.questions.filter(q => q.section === s.section && q.subject === sub && q.status === 'published'), ans = {};
    qs.forEach((q, j) => { ans[q.id] = (q.category === 'الجبر' || (sub === 'لفظي' && j % 3 === 0)) ? (q.correct + 1) % 4 : q.correct; });
    const t = new Date(Date.now() - (4 - i) * 86400000).toISOString();
    D.attempts.push({ id:'g-at' + i, kind:'practice', trainee_id:sx.id, section:s.section, subject:sub, unit:null, started_at:t, submitted_at:t, minutes:10, snapshot:qs.map(snap), answers:ans, score:qs.filter(q => ans[q.id] === q.correct).length, total:qs.length }); });
  localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); }, Sx);
await m.reload(); await m.waitForTimeout(1200); await m.evaluate(() => { const r = document.querySelector('.wl'); if (r) document.querySelector('#wlSkip')?.click(); });
await mtab('data-st', 'level'); await mshot('s06_level');
try { await m.click('#simGo'); await m.click('#smGo'); await m.waitForTimeout(900);
  for (let i = 0; i < 3; i++) { await m.click(`.sim-opt >> nth=${i % 4}`); await m.click('#simNext'); await m.waitForTimeout(200); }
  await m.click('.sim-opt >> nth=1'); await m.click('#simFlag'); await mshot('s06b_sim');
  await m.click('#simMapB'); await m.click('#simEnd2'); await m.click('#seGo'); await m.waitForTimeout(1200); await mshot('s06c_sim_result');
  await m.evaluate(() => { const r = document.querySelector('#modalRoot'); if (r) r.innerHTML = ''; }); } catch (e) { console.log('SIMFAIL', e.message.split('\n')[0]); }
await mtab('data-st', 'msg'); await mshot('s07_msg');
await mtab('data-st', 'rate'); await mshot('s08_rate');
await m.goto(U + '#checkin'); await m.waitForTimeout(1200); await mshot('s09_checkin');
await m.goto(U + '#portals'); await m.waitForTimeout(1000); await mshot('s10_portals');

console.log('DONE', done.length, done.join(' '));
if (errs.length) console.log('PAGEERRORS', [...new Set(errs)].slice(0, 5).join(' | '));
await b.close(); server.close();
