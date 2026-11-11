// تقرير اليوم: المعاينة، واللقطة الواحدة، والمراجعة المرقّمة، والطباعة، والملاحظة.
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1366, height: 900 } });
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();

await p.goto(U + 'admin/#admin'); await p.waitForTimeout(900); await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200);
// إزالة أي لقطة تلقائية لتجربة التوليد اليدوي من البداية
await p.evaluate(() => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); D.daily_reports = []; localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); });
await p.reload(); await p.waitForTimeout(900);
await p.evaluate(() => { location.hash = '#admin-daily'; }); await p.waitForTimeout(1200);
const today = await p.evaluate(() => window.__SAMA__.riyadhNow());
const past = today.hm >= '20:30';
ok(await p.$('#drBody .kpis'), 'تقرير اليوم: بطاقات الملخص');
if (past) ok((await data()).daily_reports.length === 1, 'بعد 20:30 تُولَّد لقطة اليوم تلقائيًا عند فتح الإدارة');
else ok(/معاينة مباشرة/.test(await text('#drBody')), 'قبل 20:30: معاينة مباشرة دون حفظ');
if (await p.$('#drGen')) { await p.click('#drGen'); await p.waitForTimeout(800); }
ok((await data()).daily_reports.filter(r => r.date === today.date).length === 1, 'لقطة واحدة لليوم');
await p.click('#drRev'); await p.waitForTimeout(800);
const reps = (await data()).daily_reports.filter(r => r.date === today.date);
ok(reps.length === 2 && reps.some(r => r.version === 2 && r.kind === 'revision'), 'إصدار مراجعة مرقّمة دون تعديل اللقطة');
await p.fill('#drNote', 'متابعة غياب البنات'); await p.click('#drNoteS'); await p.waitForTimeout(700);
ok((await data()).daily_reports.some(r => r.note === 'متابعة غياب البنات'), 'حفظ ملاحظة الإدارة');
await p.click('#drPrint'); await p.waitForTimeout(700);
ok(await p.$('#printRoot .pdoc') && /تقرير اليوم/.test(await text('#printRoot')), 'طباعة التقرير A4');
ok(errs.length === 0, 'لا أخطاء في الصفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
