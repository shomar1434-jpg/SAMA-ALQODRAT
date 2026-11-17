// تفعيل الجهاز (الخطوة AT): المسؤول يفتح التفعيل؛ الرمز يظهر على جهاز صاحب الحساب وحده؛ الإدارة ترى الحالة فقط
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = (pg = p) => pg.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async (s, pg = p) => ((await pg.textContent(s).catch(() => '')) || '').trim();
const admin = async () => { await p.goto(U + 'admin/#admin-access'); await p.reload(); await p.waitForTimeout(500);
  if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); } await p.waitForSelector('#ac-q'); };
const SIX = /\b\d{6}\b/;

await admin();
let D = await data();
const sub = D.subscriptions.find(s => ['pending', 'active'].includes(s.status) && D.trainees.filter(t => t.phone === D.trainees.find(x => x.id === s.trainee_id).phone).length === 1);
const st = D.trainees.find(t => t.id === sub.trainee_id);
ok(/الحسابات/.test(await text('#acBody')) && /لم يُفعَّل/.test(await text('#acBody')) && (await p.$$('[data-ai]')).length > 0, 'الإدارة ترى الحالة: لم يُفعَّل');
await p.fill('#ac-q', st.phone); await p.waitForTimeout(600);
await p.click(`[data-ai="${st.phone}"]`); await p.waitForTimeout(600);
const row = await text('#acList tbody tr');
const wa = await p.getAttribute('#acList tbody tr a[href*="wa.me"]', 'href');
ok(/بانتظار التفعيل/.test(row) && !SIX.test(row), 'بعد «تفعيل»: بانتظار التفعيل، ولا رمز ظاهر');
ok(wa && /wa\.me\/966/.test(wa) && decodeURIComponent(wa).includes('student/') && !SIX.test(decodeURIComponent(wa).replace(/\d{9,}/g, '')), 'واتساب برابط البوابة فقط بلا رمز');
let acc = await p.evaluate(async () => JSON.stringify(await window.__SAMA__.LocalStore.accessData()));
ok(!/"code"|"label"|"device"/.test(acc), 'بيانات الإدارة بلا رموز ولا أجهزة');

// صاحب الحساب على جهازه: الرمز يظهر تحت الزر، يكتبه فيدخل
const ctxS = await b.newContext(); const s1 = await ctxS.newPage();
await s1.goto(U + 'student/'); await s1.evaluate(d => localStorage.setItem('sama_qudrat_v4', d), JSON.stringify(await data())); await s1.reload(); await s1.waitForSelector('#pl-phone');
ok(/رمز التحقق/.test(await text('#plB', s1)), 'زر «رمز التحقق»');
await s1.fill('#pl-phone', st.national_id); await s1.click('#plB'); await s1.waitForTimeout(500);
const shown = await text('#otpShow b', s1);
ok(/^\d{6}$/.test(shown) && await s1.isVisible('#otpShow'), 'الرمز يظهر على جهاز صاحب الحساب تحت الزر');
const L = await data(s1);
ok(!JSON.stringify(L.login_requests || []).includes(shown), 'الرمز محفوظ مجزّأً لا نصًّا');
await s1.fill('#pl-code', '000000'); await s1.click('#plB'); await s1.waitForTimeout(500);
ok(/غير صحيح أو منتهٍ/.test(await text('#plE', s1)), 'رمز خاطئ يُرفض');
await s1.fill('#pl-code', shown); await s1.click('#plB'); await s1.waitForSelector('#sBody');
const S = await data(s1);
ok(S.devices.some(d => d.phone === st.phone && !d.revoked_at && d.label === '') && S.act_windows.find(w => w.phone === st.phone && !w.revoked).used_at, 'الدخول يعتمد الجهاز ويُغلق التفعيل، ولا يُحفظ نوع الجهاز');
const s2 = await ctxS.newPage(); await s2.goto(U + 'student/'); await s2.waitForTimeout(1200);
ok(!!(await s2.$('#sBody')), 'الجهاز المفعَّل يبقى داخلًا');
await s2.close();

// جهاز ثانٍ بعد إغلاق التفعيل: لا رمز
const ctx2 = await b.newContext(); const q = await ctx2.newPage();
await q.goto(U); await q.evaluate(d => localStorage.setItem('sama_qudrat_v4', d), JSON.stringify(S)); await q.reload(); await q.waitForTimeout(800);
const r2 = await q.evaluate(async id => await window.__SAMA__.LocalStore.requestOtp(id, 'student'), st.national_id);
ok(r2.open === false && !r2.code, 'التفعيل لجهاز واحد: لا رمز لجهاز ثانٍ');
for (let i = 0; i < 6; i++) await q.evaluate(async ([ph, c]) => { try { await window.__SAMA__.LocalStore.portalLogin(ph, c, 'student'); } catch (e) { window.__e = e.message; } }, [st.national_id, '11111' + i]);
ok(/محاولات كثيرة/.test(await q.evaluate(() => window.__e)), 'قفل بعد خمس محاولات خاطئة');
const QD = await data(q);
await ctx2.close();

// الإدارة: «تم التفعيل»، وطلب الدخول من جهاز جديد يظهر بالاسم فقط
await p.evaluate(d => localStorage.setItem('sama_qudrat_v4', d), JSON.stringify(QD)); await admin();
await p.fill('#ac-q', st.phone); await p.waitForTimeout(600);
ok(/تم التفعيل/.test(await text('#acList tbody tr')), 'الإدارة ترى «تم التفعيل» فقط');
ok(await p.isVisible('#acReq') && (await text('#acReq')).includes(st.full_name) && !SIX.test(await text('#acReq')) && !/رمز الجهاز/.test(await text('#acReq')), 'طلب دخول من جهاز جديد بالاسم فقط');
await p.click('#acReq [data-rq]'); await p.waitForTimeout(600);
D = await data();
ok(D.act_windows.some(w => w.phone === st.phone && !w.used_at && !w.revoked), 'تفعيل من الطلب مباشرة (15 دقيقة)');
ok(!SIX.test((await text('#acBody')).replace(/\d{7,}/g, '')), 'لا رمز من 6 أرقام في صفحة الإدارة');

// إيقاف التفعيل، وإلغاء الأجهزة
await p.fill('#ac-q', st.phone); await p.waitForTimeout(600);
await p.click(`[data-ax="${st.phone}"]`); await p.waitForTimeout(500);
D = await data();
ok(!D.act_windows.some(w => w.phone === st.phone && !w.used_at && !w.revoked), 'إيقاف التفعيل');
await p.click(`[data-av="${st.phone}"]`); await p.waitForTimeout(300); await p.click('.modal .btn.danger, .modal .btn.pri'); await p.waitForTimeout(700);
D = await data();
ok(D.devices.every(d => d.phone !== st.phone || d.revoked_at), 'إلغاء الأجهزة من الإدارة');

// التفعيل الجماعي والكشف بلا رموز
await p.fill('#ac-q', ''); await p.waitForTimeout(500);
await p.selectOption('#ac-o', 'none'); await p.selectOption('#ac-m', '1440'); await p.waitForTimeout(300);
await p.click('#acBulk'); await p.waitForTimeout(300); await p.click('.modal .btn.danger, .modal .btn.pri'); await p.waitForTimeout(800);
D = await data();
const n = D.act_windows.filter(w => !w.used_at && !w.revoked && Date.parse(w.expires_at) - Date.now() > 23 * 3600e3).length;
ok(n > 3, `تفعيل جماعي 24 ساعة (${n})`);
await p.selectOption('#ac-o', 'wait'); await p.waitForTimeout(400);
await p.click('#acPrint'); await p.waitForSelector('#printRoot.on .pdoc');
ok(/كشف تفعيل الحسابات/.test(await text('#printRoot .ppages')) && !SIX.test((await text('#printRoot .ppages')).replace(/\d{7,}/g, '')), 'كشف التفعيل للطباعة بلا رموز');
await p.click('#pbBack');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'لا تمرير أفقي');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
