// الخطوة BI: إضافة جهاز آخر من الجهاز المفعّل، والخروج من الأجهزة الأخرى
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('dialog', d => d.accept());
const KEY = 'sama_qudrat_v4';
const data = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();
const active = async ph => (await data()).devices.filter(d => d.phone === ph && d.role === 'student' && !d.revoked_at).length;
// جهاز جديد: يُنسى ربط هذا المتصفح دون إلغاء جلسته في الخادم
const newDevice = async () => { await p.evaluate(k => { localStorage.removeItem(k + '_dev_student'); sessionStorage.removeItem(k + '_p_student'); }, KEY); await p.reload(); await p.waitForSelector('#pl-phone'); };

await p.goto(U); await p.waitForTimeout(800);
const D = await data();
const live = s => ['pending', 'active'].includes(s.status);
const st = D.trainees.find(t => D.subscriptions.some(s => s.trainee_id === t.id && live(s)) && D.trainees.filter(x => x.phone === t.phone).length === 1);

await p.goto(U + 'student/'); await p.waitForSelector('#pl-phone');
ok(await p.isVisible('#plLinkT') && await p.isHidden('#plLinkF'), 'خيار «رمز ربط من جهازي المفعّل» في شاشة الدخول');
await p.fill('#pl-phone', st.phone); await p.click('#plB'); await p.waitForSelector('#otpF:not([hidden])'); await p.fill('#pl-code', '1234'); await p.click('#plB');
await p.waitForSelector('#logoutBtn:not([hidden])');
ok(await p.isVisible('#devBtn'), 'زر «أجهزتي» بعد الدخول');

await p.click('#devBtn'); await p.waitForSelector('#dvAdd');
ok(/المفعّلة على حسابك الآن: 1|١/.test(await text('.modal')), 'عدد الأجهزة المفعّلة');
ok(await p.isDisabled('#dvOthers'), 'لا خروج من أجهزة أخرى بجهاز واحد');
await p.click('#dvAdd'); await p.waitForSelector('#dvCode:not([hidden])');
const code = (await text('#dvCode b')).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
ok(/^\d{6}$/.test(code), 'رمز ربط من 6 أرقام يظهر في الجهاز المفعّل');
ok(!JSON.stringify((await data()).link_codes).includes(code), 'الرمز لا يُحفظ نصًّا');

await newDevice();
await p.fill('#pl-phone', st.national_id); await p.click('#plLinkT');
await p.fill('#pl-link', '000000'); await p.click('#plLinkGo'); await p.waitForTimeout(400);
ok(/غير صحيح أو منتهٍ/.test(await text('#plE')) && await p.isHidden('#logoutBtn'), 'رمز خاطئ لا يربط');
await p.fill('#pl-link', code); await p.click('#plLinkGo'); await p.waitForSelector('#logoutBtn:not([hidden])');
ok(await active(st.phone) === 2, 'الجهاز الثاني دخل برقم الهوية ورمز الربط دون الإدارة');

await newDevice();
await p.fill('#pl-phone', st.national_id); await p.click('#plLinkT'); await p.fill('#pl-link', code); await p.click('#plLinkGo'); await p.waitForTimeout(400);
ok(/غير صحيح أو منتهٍ/.test(await text('#plE')), 'الرمز لمرة واحدة');
await p.fill('#pl-phone', st.phone); await p.click('#plB'); await p.waitForSelector('#otpF:not([hidden])'); await p.fill('#pl-code', '1234'); await p.click('#plB');
await p.waitForSelector('#logoutBtn:not([hidden])');

// الخروج من الأجهزة الأخرى
ok(await active(st.phone) === 3, 'ثلاثة أجهزة مفعّلة');
await p.click('#devBtn'); await p.waitForSelector('#dvOthers:not([disabled])'); await p.click('#dvOthers'); await p.waitForTimeout(500);
ok(await active(st.phone) === 1 && await p.isVisible('#logoutBtn'), 'الخروج من الأجهزة الأخرى ويبقى هذا الجهاز');

// رمز مع «أخرج جميع الأجهزة الأخرى»
await p.click('#devBtn'); await p.waitForSelector('#dvAdd'); await p.check('#dvOut'); await p.click('#dvAdd'); await p.waitForSelector('#dvCode:not([hidden])');
const code2 = (await text('#dvCode b')).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
ok(/سيخرج هذا الجهاز/.test(await text('#dvCode')), 'تنبيه الخروج مع الرمز');
const before = (await data()).devices.filter(d => d.phone === st.phone && !d.revoked_at).map(d => d.id);
await newDevice();
await p.fill('#pl-phone', st.national_id); await p.click('#plLinkT'); await p.fill('#pl-link', code2); await p.click('#plLinkGo'); await p.waitForSelector('#logoutBtn:not([hidden])');
const after = (await data()).devices.filter(d => d.phone === st.phone && d.role === 'student' && !d.revoked_at);
ok(after.length === 1 && !before.includes(after[0].id), 'الربط مع الخروج: الجهاز الجديد وحده داخل الحساب');

ok(!errs.length, 'بلا أخطاء صفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
