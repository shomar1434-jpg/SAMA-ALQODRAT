// الخطوة BR: إلغاء جلسات الباقات لفترة من شاشة محاضرات اليوم، مع تعويض تلقائي وتراجع
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const admin = async r => { await p.goto(U + 'admin/#' + r); await p.reload(); await p.waitForTimeout(500);
  if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); } await p.waitForSelector('#main'); };

await admin('admin'); await p.goto(U + 'admin/#display'); await p.waitForSelector('#bkF');
const today = await p.evaluate(() => window.__SAMA__.riyadhNow().date);
const plus = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
let D = await data();
const before = Object.fromEntries(D.subscriptions.map(s => [s.id, s.end_date]));
ok(/إلغاء جلسات الباقات/.test(await text('#brkCard')), 'قسم «إلغاء جلسات الباقات» أسفل شاشة محاضرات اليوم');

// «أخرى» تتطلب سببًا مكتوبًا، والمعاينة لا تحفظ شيئًا
await p.fill('#bkFrom', today); await p.fill('#bkTo', plus(today, 6));
await p.selectOption('#bkReason', 'other'); ok(await p.isVisible('#bkNote'), 'خانة السبب تظهر مع «أخرى»');
await p.click('#bkPrev'); await p.waitForTimeout(300);
ok(/اكتب سبب الإلغاء/.test(await text('#bkE')), '«أخرى» بلا سبب مرفوضة');
await p.selectOption('#bkReason', 'official'); await p.click('#bkPrev'); await p.waitForSelector('[data-bkprev]');
const prev = await text('[data-bkprev]');
ok(/جلسة ملغاة/.test(prev) && /إجازة رسمية/.test(prev) && /البنون/.test(prev) && /البنات/.test(prev), 'المعاينة: الجلسات للقسمين والسبب');
D = await data(); ok(!(D.session_breaks || []).length && !D.schedule_exceptions.some(x => x.break_id), 'المعاينة لا تحفظ شيئًا');

await p.click('#bkGo'); await p.click('#mo'); await p.waitForTimeout(900);
D = await data();
const br = D.session_breaks?.[0], comps = D.break_compensations || [];
ok(br && br.reason === 'official' && br.sections.length === 2 && D.schedule_exceptions.filter(x => x.break_id === br.id).length === br.sessions.length, 'حُفظ الإلغاء واستثناءاته');
ok(comps.length > 0 && comps.length === br.affected, 'عُوّض كل اشتراك متأثر');
const good = await p.evaluate(br => { /* التحقق بمنطق الحضور نفسه: الجلسات بين النهايتين = الجلسات المفقودة */
  const D = JSON.parse(localStorage.getItem('sama_qudrat_v4'));
  return D.break_compensations.filter(c => c.break_id === br).every(c => { const s = D.subscriptions.find(x => x.id === c.subscription_id);
    let n = 0; for (let d = c.old_end; d < c.new_end;) { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + 1); d = x.toISOString().slice(0, 10);
      const ex = D.schedule_exceptions.filter(e => e.section === s.section && e.date === d); if (ex.some(e => e.type === 'cancel')) continue;
      if (ex.some(e => e.type !== 'cancel') || D.schedule_templates.some(t => t.section === s.section && t.dow === new Date(d + 'T12:00:00Z').getUTCDay())) n++; }
    return s.end_date === c.new_end && n === c.sessions; }); }, br.id);
ok(good, 'كل اشتراك مُدّد بعدد الجلسات التي فقدها بالضبط');
ok(D.notifications.some(n => n.kind === 'session_cancel' && /عُوّضت بتمديد باقتك/.test(n.text)), 'إشعار المتدرب بالإلغاء والتعويض');
ok(/ملغاة ومعوَّضة/.test(await text('#bkList')), 'يظهر في «الإلغاءات السابقة»');

// يوم من الإلغاء لا يُحذف منفردًا من «الجدول»
await admin('admin-qudurat'); await p.click('[data-qt=schedule]'); await p.waitForTimeout(600);
const exRow = await p.$('a.pill[href="#display"]');
ok(exRow, 'أيام الإلغاء لفترة موسومة في الاستثناءات بلا زر حذف');
const delErr = await p.evaluate(async id => { try { await window.__SAMA__.LocalStore.deleteException(id); return 'ok'; } catch (e) { return e.message; } }, D.schedule_exceptions.find(x => x.break_id).id);
ok(/ضمن إلغاء جلسات/.test(delErr), 'حماية الاستثناء في المخزن');

// التراجع
await p.goto(U + 'admin/#display'); await p.waitForSelector('[data-bkr]'); await p.click('[data-bkr]'); await p.click('#mo'); await p.waitForTimeout(900);
D = await data();
ok(D.subscriptions.every(s => s.end_date === before[s.id]) && !D.schedule_exceptions.some(x => x.break_id) && D.session_breaks[0].revoked_at, 'التراجع يعيد النهايات والجدول');
ok(/تم التراجع/.test(await text('#bkList')), 'الحالة «تم التراجع»');
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
