// الخطوة AK: شاشة الترحيب في بوابة المتدرب وتسجيل الحضور من داخل التطبيق
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const S = (fn, a) => p.evaluate(fn, a);
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const login = async phone => { await p.goto(U + 'student/'); await p.waitForTimeout(700);
  if (await p.$('#logoutBtn:not([hidden])')) { await p.click('#logoutBtn'); await p.waitForTimeout(400); }
  await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(1200); };
await p.goto(U); await p.waitForTimeout(1000);
// جلسة الآن لقسم المتدرب (تعويض اليوم يبدأ قبل 10 دقائق)
const T = await S(() => { const D = window.__SAMA__.LocalStore.data, n = window.__SAMA__.riyadhNow();
  const s = D.subscriptions.find(x => x.status === 'active' && x.start_date && !D.sub_attendance.some(a => a.subscription_id === x.id && a.att_date === n.date));
  const m = n.hm.split(':').map(Number), at = v => { const t = Math.max(0, Math.min(1439, m[0] * 60 + m[1] + v)); return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); };
  D.schedule_exceptions = (D.schedule_exceptions || []).filter(x => !(x.section === s.section && x.date === n.date));
  D.schedule_exceptions.push({ id: 'wl-test', section: s.section, date: n.date, type: 'makeup', start: at(-10), end: at(80), note: '' });
  D.settings.require_code = false; window.__SAMA__.LocalStore.save(); localStorage.setItem('sama_welcome_force', '1');
  const t = D.trainees.find(x => x.id === s.trainee_id); return { id: t.id, phone: t.phone, nid: t.national_id, sub: s.id, first: t.full_name.split(' ')[0] }; });
await p.reload(); await p.waitForTimeout(600);
await login(T.phone);
ok(await p.isVisible('.wl') && /أهلًا/.test(await text('.wl h1')) && /مفتوحة للتسجيل/.test(await text('.wl')), 'شاشة الترحيب تظهر بجلسة اليوم المفتوحة');
ok(!/\d{10}/.test(await text('.wl')), 'لا يُطلب ولا يظهر السجل المدني');
await p.click('#wlGo'); await p.waitForTimeout(800);
ok(/سُجّل حضورك/.test(await text('.wl')), 'تسجيل الحضور من داخل التطبيق');
const DB = () => S(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
let D = await DB(); const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const att = D.sub_attendance.filter(a => a.subscription_id === T.sub && a.att_date === today).length;
ok(att === 1, 'سُجّل في سجل الاشتراك مرة واحدة');
ok(D.checkin_attempts.length > 0, 'المحاولة في سجل التحضير');
await p.click('#wlSkip'); await p.waitForTimeout(800);
ok(!(await p.isVisible('.wl')) && /سُجّل حضورك اليوم/.test(await text('.portal-hero')), 'اللوحة تعرض أن الحضور سُجّل');
await p.reload(); await p.waitForTimeout(1200);
ok(!(await p.isVisible('.wl')), 'لا تتكرر الشاشة في اليوم نفسه بعد التسجيل');

// لا يمكن التحضير لملف جوال آخر
await p.goto(U); await p.waitForTimeout(800);
const other = await S(([ph]) => window.__SAMA__.LocalStore.data.trainees.find(t => t.phone !== ph)?.id, [T.phone]);
const r = await S(async id => { try { await window.__SAMA__.LocalStore.portalCheckin(id, ''); return 'ok'; } catch (e) { return e.message; } }, other);
ok(r === 'غير مصرح', 'لا تحضير لملف ليس لهذا الجوال');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'لا تمرير أفقي');
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
