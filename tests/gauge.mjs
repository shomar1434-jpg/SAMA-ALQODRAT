// منطق عداد الأداء العام (دون متصفح) + ظهوره في بوابتي الطالب وولي الأمر
import { progressGauge } from '../src/portal_logic.js';
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { ok, failed } = reporter();
const it = (att, hw, reach, thr = 75) => ({ threshold:thr, attendance:{ held: att == null ? 0 : 10, rate:att, attended:0 }, homework:{ due: hw == null ? 0 : 4, done:0, success:hw }, time:{ reach, daysLeft:30 } });
let g = progressGauge(it(90, 80, 100)); ok(g.score === 90 && g.zone === 'green', 'أخضر: متوسط المحاور الثلاثة ≥ حد الشهادة');
g = progressGauge(it(60, 50, 90)); ok(g.score === 67 && g.zone === 'yellow', 'أصفر: بين 50 وحد الشهادة');
g = progressGauge(it(30, 20, 60)); ok(g.score === 37 && g.zone === 'red', 'أحمر: دون 50');
g = progressGauge(it(80, null, 70)); ok(g.score === 75 && g.zone === 'green' && g.axes[1].value === null, 'المحور غير المتاح لا يُحتسب');
g = progressGauge(it(null, null, null)); ok(g.score === null && g.zone === null && /أول يوم حضور/.test(g.label), 'لا قياس قبل أول حضور');
g = progressGauge(it(70, 70, 70, 60)); ok(g.zone === 'green', 'الأخضر يتبع حد الشهادة في الإعدادات');

const { server, origin: U } = serveDist();
const b = await chromium.launch();
for (const [role, ph] of [['student', '0550000001'], ['guardian', '0509000010']]) {
  const p = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(U); await p.waitForTimeout(900);
  await p.goto(U + role + '/'); await p.waitForTimeout(700); await p.fill('#pl-phone', ph); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(1800);
  const lbl = await p.getAttribute('.gauge-card svg.gg', 'aria-label').catch(() => null);
  ok(lbl && /مؤشر الأداء العام \d+ من 100/.test(lbl) && (await p.$$('.gauge-axes li')).length === 3, `العداد ومحاوره الثلاثة في بوابة ${role === 'student' ? 'الطالب' : 'ولي الأمر'}`);
  ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
}
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
