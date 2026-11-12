// الخطوة D: الجرس واللافتة ومنع التكرار وإيقاف الصوت، ورسالة الإدارة، وتنبيه بدء الجلسة، وفتح الرسالة من الإشعار
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const main = await ctx.newPage(), p = await ctx.newPage(); const errs = []; [main, p].forEach(x => x.on('pageerror', e => errs.push(e.message)));
await main.goto(U); await main.waitForTimeout(1000);
const login = async (role, ph) => { await p.goto(U + role + '/'); await p.waitForTimeout(700); if (!(await p.$('#pl-phone'))) { await p.click('#logoutBtn'); await p.waitForTimeout(600); }
  await p.fill('#pl-phone', ph); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(1500); };
const tick = async () => { await p.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await p.waitForTimeout(600); };
const badge = async () => +(await p.$eval('#bellBtn .bdg', e => e.hidden ? '0' : e.textContent).catch(() => '0'));

// 1) رسالة الإدارة من لوحة الإدارة
await main.goto(U + 'admin/#admin-notify'); await main.waitForTimeout(900);
if (await main.$('[name=p]')) { await main.fill('[name=p]', '1234'); await main.click('#lf button'); await main.waitForTimeout(1200); }
await main.selectOption('#nf-aud', 'student'); await main.selectOption('#nf-scope', 'section'); await main.selectOption('#nf-sec', 'boys');
ok(/يصل إلى [١-٩0-9]/.test(await main.innerText('#nf-n')), 'عدد المستلمين يظهر قبل الإرسال');
await main.fill('#nf-text', 'اختبار تجريبي يوم الأحد لجميع متدربي قسم البنين'); await main.click('#nfGo'); await main.waitForTimeout(900);
ok(/قرأه/.test(await main.innerText('#main')), 'الرسالة في «آخر ما أُرسل»');

await login('student', '0550000001');
ok(await p.$('#bellBtn') && await badge() >= 1, 'الجرس وعدّاد غير المقروء');
ok(!(await p.$('#inboxToast.on')), 'لا لافتة ولا صوت لما وصل قبل أول دخول في هذا الجهاز');
await p.click('#bellBtn'); await p.waitForTimeout(500);
ok(/رسالة من إدارة المعهد/.test(await p.innerText('#inboxPanel')) && /اختبار تجريبي/.test(await p.innerText('#inboxPanel')), 'لائحة الإشعارات فيها رسالة الإدارة');
await p.click('#ibSound'); await p.waitForTimeout(200);
ok(await p.evaluate(() => localStorage.getItem('sama_sound')) === 'off' && /متوقف/.test(await p.innerText('#ibSound')), 'إيقاف الصوت');
await p.click('#ibSound'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
ok(!(await p.$('#inboxPanel')), 'Esc يغلق اللائحة');
await p.waitForTimeout(800); ok(await badge() === 0, 'فتح اللائحة يعلّم الإشعارات مقروءة');

// 2) تنبيه بدء الجلسة: جلسة تعويضية للبنين بعد 5 دقائق
await main.evaluate(() => { const S = window.__SAMA__.LocalStore, D = S.data, n = window.__SAMA__.riyadhNow(); const [h, m] = n.hm.split(':').map(Number), t = h * 60 + m + 5;
  const hm = x => String(Math.floor(x / 60) % 24).padStart(2, '0') + ':' + String(x % 60).padStart(2, '0');
  D.schedule_exceptions = (D.schedule_exceptions || []).filter(x => !(x.section === 'boys' && x.date === n.date));
  D.schedule_exceptions.push({ id:'xs', section:'boys', date:n.date, type:'makeup', start:hm(t), end:hm(t + 60), note:'' }); S.save(); });
await tick();
ok(await p.$('#inboxToast.on') && /تبدأ الجلسة قريبًا/.test(await p.innerText('#inboxToast')), 'لافتة «تبدأ الجلسة قريبًا» للمتدرب');
const nSoon = await main.evaluate(() => window.__SAMA__.LocalStore.data.notifications.filter(x => x.kind === 'session_soon').length);
await p.evaluate(() => document.querySelector('#inboxToast').classList.remove('on')); await tick();
ok(!(await p.$('#inboxToast.on')) && await main.evaluate(() => window.__SAMA__.LocalStore.data.notifications.filter(x => x.kind === 'session_soon').length) === nSoon, 'لا تكرار للتنبيه ولا للافتة');

// 3) رسالة من المدرب تفتح تبويب المراسلة
await main.evaluate(() => { const D = window.__SAMA__.LocalStore.data, t = D.trainees.find(x => x.phone === '0550000001'), te = D.teachers.find(x => x.phone === '0501000003');
  D.messages.push({ id:'mx', trainee_id:t.id, teacher_id:te.id, from:'teacher', text:'أحسنت في واجب اليوم', at:new Date().toISOString(), read_at:null }); window.__SAMA__.LocalStore.save(); });
await tick();
ok(/رسالة من/.test(await p.innerText('#inboxToast')), 'لافتة الرسالة الجديدة');
await p.click('#inboxToast .ibt-card'); await p.waitForTimeout(800);
ok(await p.$('[data-st="msg"][aria-selected="true"]'), 'الضغط على اللافتة يفتح المراسلة');

// 4) المدرب يستلم تنبيه بدء الجلسة
await login('teacher', '0501000003'); await tick();
await p.click('#bellBtn'); await p.waitForTimeout(600);
ok(/تبدأ الجلسة قريبًا/.test(await p.innerText('#inboxPanel')) && /قسم البنون/.test(await p.innerText('#inboxPanel')), 'المدرب يستلم تنبيه جلسة قسمه');
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
