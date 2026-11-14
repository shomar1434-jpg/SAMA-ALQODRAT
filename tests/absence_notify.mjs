// الخطوة AE: إبلاغ أولياء أمور الغائبين عبر واتساب (رابط بنص جاهز، والإرسال بيد المسؤول)
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { ok, failed } = reporter();
const { server, origin: U } = serveDist();
const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{ width:1280, height:900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; });
await p.goto(U + 'admin/#admin'); await p.waitForSelector('#lf'); await p.fill('[name=p]', '1234'); await p.click('#lfGo'); await p.waitForTimeout(1200);
// جلسة البنين اليوم منتهية، وجوال ولي أمر لأحد الغائبين وأنثى بلا ولي أمر في البنات
await p.evaluate(() => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); const dow = new Date(Date.now() + 3 * 3600e3).getUTCDay();
  D.schedule_exceptions = []; D.schedule_templates = [{ id:'t1', section:'boys', dow, start:'00:00', end:'00:01' }, { id:'t2', section:'girls', dow, start:'00:00', end:'23:59' }];
  const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
  D.subscriptions.filter(s => s.section === 'boys').forEach(s => { const t = D.trainees.find(x => x.id === s.trainee_id); if (t) t.guardian_phone = '0551112222'; });
  localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); });
await p.reload(); await p.waitForTimeout(600); await p.goto(U + 'admin/#display'); await p.waitForTimeout(1000);
ok(!!(await p.$('[data-abs^="pkg:boys"]')), 'زر «الغائبون وإبلاغ أولياء الأمور» في جلسة اليوم');
await p.click('[data-abs^="pkg:boys"]'); await p.waitForSelector('.modal');
const name = await p.$eval('.modal tbody tr td', td => td.childNodes[0].textContent.trim());
const modalTxt = await p.textContent('.modal');
ok(/الغائبون اليوم/.test(modalTxt) && modalTxt.includes(name) && /ولي الأمر/.test(modalTxt) && /0551112222/.test(modalTxt), 'قائمة الغائبين مع جوال ولي الأمر');
const btn = await p.$$eval('.modal tr', (rows, n) => { const r = rows.find(x => x.textContent.includes(n)); return r?.querySelector('[data-wa]')?.dataset.wa; }, name);
await p.click(`[data-wa="${btn}"]`); await p.waitForTimeout(300);
const opened = await p.evaluate(() => window.__opened);
const u = decodeURIComponent(opened[0] || '');
ok(/^https:\/\/wa\.me\/966551112222\?text=/.test(opened[0] || '') && u.includes('ولي أمر') && u.includes('نفيدكم بغياب') && u.includes('مركز سما القدرات'), 'يفتح واتساب لرقم ولي الأمر الدولي برسالة الغياب جاهزة');
ok(/أُرسل/.test(await p.textContent(`[data-wa="${btn}"]`)), 'يُعلَّم أنه أُرسل على هذا الجهاز');
if (await p.$('#abNext')) { await p.click('#abNext'); await p.waitForTimeout(300); ok((await p.evaluate(() => window.__opened.length)) === 2, '«إرسال للتالي» يفتح الغائب التالي'); }
await p.click('#abX');
await p.goto(U + 'admin/#admin-qudurat'); await p.waitForTimeout(900);
const tabs = await p.$$('[data-qt]'); for (const t of tabs) { if (/حضور اليوم/.test(await t.textContent())) { await t.click(); break; } }
await p.waitForTimeout(500);
ok(!!(await p.$('[data-abs^="boys"]')), 'زر الإبلاغ في تبويب «حضور اليوم» بصفحة القدرات والتحصيلي');
// تذكير السداد من نافذة الطلب
await p.goto(U + 'admin/#admin-orders'); await p.waitForTimeout(900); await p.selectOption('#of-st', 'all'); await p.waitForTimeout(500);
const oid = await p.evaluate(() => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); const o = (D.orders || []).find(o => o.approval !== 'rejected' && (Number(o.total || 0) - Number(o.paid_amount || 0)) > 0); return o?.id; });
if (oid) { await p.click(`[data-oo="${oid}"]`); await p.waitForSelector('.modal');
  const href = await p.$eval('.modal a[href^="https://wa.me/"]', a => a.href).catch(() => '');
  ok(/^https:\/\/wa\.me\/9665\d{8}\?text=/.test(href) && decodeURIComponent(href).includes('نذكّركم بالمبلغ المتبقي'), 'تذكير بالسداد عبر واتساب برسالة جاهزة'); }
else ok(true, 'لا طلبات بمتبقٍ في البيانات التجريبية');
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs[0] : ''));
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
