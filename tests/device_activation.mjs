// الخطوة S: تفعيل الجهاز — رمز لمرة واحدة من الإدارة، بقاء الدخول على الجهاز، القفل، والإلغاء
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const admin = async () => { await p.goto(U + 'admin/#admin-access'); await p.reload(); await p.waitForTimeout(500);
  if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); } await p.waitForSelector('#ac-q'); };
const tryLogin = async (role, phone, code) => { await p.goto(U + role + '/'); await p.waitForSelector('#pl-phone'); await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', code); await p.click('#plB'); await p.waitForTimeout(800); };

await admin();
let D = await data();
const sub = D.subscriptions.find(s => ['pending', 'active'].includes(s.status) && D.trainees.filter(t => t.phone === D.trainees.find(x => x.id === s.trainee_id).phone).length === 1);
const st = D.trainees.find(t => t.id === sub.trainee_id);
ok(/الحسابات/.test(await text('#acBody')) && (await p.$$('[data-ai]')).length > 0, 'صفحة تفعيل الأجهزة تعرض حسابات المتدربين');
await p.fill('#ac-q', st.phone); await p.waitForTimeout(600);
await p.click(`[data-ai="${st.phone}"]`); await p.waitForSelector('#acIssued');
const code1 = await text('#acIssued .ac-code');
D = await data();
ok(/^\d{6}$/.test(code1) && D.activations.some(a => a.phone === st.phone && a.role === 'student' && !a.used_at) && /wa\.me\/966/.test(await p.getAttribute('#acIssued a', 'href')), 'يصدر رمز من 6 أرقام يظهر مرة واحدة مع رسالة واتساب مجهزة');
const acc = await p.evaluate(async () => JSON.stringify(await window.__SAMA__.LocalStore.accessData()));
ok(!acc.includes(code1), 'قائمة الرموز للإدارة لا تحمل نص الرمز');
await p.click(`[data-ai="${st.phone}"]`); await p.waitForTimeout(500);
const code2 = await text('#acIssued .ac-code');
D = await data();
ok(D.activations.filter(a => a.phone === st.phone && a.revoked).length === 1 && D.activations.filter(a => a.phone === st.phone && !a.revoked).length === 1, 'الرمز الجديد يلغي السابق غير المستخدم');

// الدخول: الرمز القديم ملغى، والخاطئ مرفوض برسالة واحدة، والصحيح يفعّل الجهاز
await tryLogin('student', st.phone, code1 === code2 ? '000000' : code1);
ok(/غير صحيح أو منتهٍ/.test(await text('#plE')), 'الرمز الملغى (أو الخاطئ) يُرفض');
ok(/رمز التفعيل/.test(await text('#otpF')), 'صفحة الدخول تشرح رمز التفعيل');
await p.fill('#pl-code', code2); await p.click('#plB'); await p.waitForSelector('#sBody');
D = await data();
ok(D.devices.some(d => d.phone === st.phone && d.role === 'student' && !d.revoked_at) && D.activations.find(a => a.phone === st.phone && !a.revoked).used_at, 'الرمز الصحيح يفعّل الجهاز ويُستهلك');
// يبقى داخلًا بعد إغلاق التبويب (جلسة جديدة)
const p2 = await ctx.newPage(); await p2.goto(U + 'student/'); await p2.waitForTimeout(1200);
ok(!!(await p2.$('#sBody')) && !(await p2.$('#pl-phone')), 'الجهاز المفعَّل يبقى داخلًا في تبويب جديد دون رمز');
await p2.close();
// الرمز لا يُستخدم مرتين (متصفح آخر)
const ctx2 = await b.newContext(); const q = await ctx2.newPage();
await q.goto(U + 'student/'); await q.evaluate(d => localStorage.setItem('sama_qudrat_v4', d), JSON.stringify(D)); await q.reload(); await q.waitForSelector('#pl-phone');
await q.fill('#pl-phone', st.phone); await q.click('#plB'); await q.waitForTimeout(300); await q.fill('#pl-code', code2); await q.click('#plB'); await q.waitForTimeout(700);
ok(/غير صحيح أو منتهٍ/.test((await q.textContent('#plE')) || ''), 'الرمز لا يُستخدم مرتين على جهاز آخر');
for (let i = 0; i < 5; i++) { await q.fill('#pl-code', '11111' + i); await q.click('#plB'); await q.waitForTimeout(250); }
ok(/محاولات كثيرة/.test((await q.textContent('#plE')) || ''), 'قفل بعد خمس محاولات خاطئة');
await ctx2.close();

// الإلغاء من الإدارة يخرج الجهاز
await admin(); await p.fill('#ac-q', st.phone); await p.waitForTimeout(600);
ok(/\d جهاز مفعَّل|١ جهاز مفعَّل/.test(await text('#acBody')), 'الإدارة ترى الجهاز المفعَّل');
await p.click(`[data-av="${st.phone}"]`); await p.waitForTimeout(300); await p.click('.modal .btn.danger, .modal .btn.pri'); await p.waitForTimeout(700);
D = await data();
ok(D.devices.every(d => d.phone !== st.phone || d.revoked_at), 'إلغاء الأجهزة من الإدارة');
await p.evaluate(() => sessionStorage.clear()); await p.goto(U + 'student/'); await p.waitForTimeout(1000);
ok(!!(await p.$('#pl-phone')), 'الجهاز الملغى يعود لصفحة الدخول');

// الإصدار الجماعي والكشف
await admin(); await p.selectOption('#ac-o', 'none'); await p.waitForTimeout(300); await p.click('#acBulk'); await p.waitForTimeout(300); await p.click('.modal .btn.danger, .modal .btn.pri'); await p.waitForSelector('#acIssued');
const n = (await p.$$('#acIssued tbody tr')).length;
ok(n > 3 && (await p.$$eval('#acIssued .ac-code', a => a.every(x => /^\d{6}$/.test(x.textContent.trim())))), `إصدار جماعي لغير المفعَّلين (${n})`);
await p.click('#acPrint'); await p.waitForSelector('#printRoot.on .pdoc');
ok(/كشف رموز التفعيل/.test(await text('#printRoot .ppages')) && /التوقيع بالاستلام/.test(await text('#printRoot .ppages')), 'كشف الرموز قابل للطباعة');
await p.click('#pbBack');
ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'لا تمرير أفقي');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
