// الخطوة W: الدخول برقم الهوية ثم رمز تحقق لهذا الجهاز عبر المراسلات الداخلية؛ وتعدد المسؤولين
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
const ask = async (pg, role, ident) => { await pg.goto(U + role + '/'); await pg.waitForSelector('#pl-phone'); await pg.fill('#pl-phone', ident); await pg.click('#plB'); await pg.waitForTimeout(500); };

await p.goto(U); await p.waitForTimeout(800);
let D = await data();
const sub = D.subscriptions.find(s => ['pending', 'active'].includes(s.status) && D.trainees.filter(t => t.phone === D.trainees.find(x => x.id === s.trainee_id).phone).length === 1);
const st = D.trainees.find(t => t.id === sub.trainee_id);
await p.goto(U + 'student/'); await p.waitForSelector('#pl-phone');
ok(/رقم الهوية/.test(await text('label[for=pl-phone]')) && /برقم هويتك/.test(await text('.head .hint')), 'صفحة الدخول تطلب رقم الهوية');
await p.fill('#pl-phone', '123'); await p.click('#plB'); await p.waitForTimeout(200);
ok(/رقم الهوية 10 أرقام/.test(await text('#plE')), 'رقم هوية ناقص يُرفض');
// هوية غير مسجّلة: الرد نفسه ولا رمز
await ask(p, 'student', '1000000008');
D = await data();
ok(!(await p.$('#otpF[hidden]')) && /إن كان الرقم مسجّلًا/.test(await text('#otpF')) && !(D.login_requests || []).length, 'هوية غير مسجّلة: الرد نفسه دون كشف ولا رمز');
// هوية مسجّلة: رمز لهذا الجهاز يصل إلى صندوق الحساب وإلى طلبات الدخول عند الإدارة
await ask(p, 'student', st.national_id);
D = await data(); const rq = D.login_requests.find(r => r.phone === st.phone && !r.used_at);
const dev = await text('#plActH b');
ok(rq && /^\d{6}$/.test(rq.code) && dev.length === 4 && !(await p.content()).includes(rq.code), 'يصدر رمز لهذا الجهاز ولا يظهر في صفحة الدخول');
ok(D.notifications.some(n => n.trainee_id === st.id && n.kind === 'login_code' && n.text.includes(rq.code) && n.text.includes(dev)), 'الرمز يصل عبر المراسلات الداخلية مع رمز الجهاز');
// جهاز آخر لا يدخل برمز هذا الجهاز
const ctx2 = await b.newContext(); const q = await ctx2.newPage();
await q.goto(U + 'student/'); await q.evaluate(d => localStorage.setItem('sama_qudrat_v4', d), JSON.stringify(D)); await q.reload(); await q.waitForSelector('#pl-phone');
await q.evaluate(() => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); D.login_requests.forEach(r => { r.keep = true; }); localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); });
await q.fill('#pl-phone', st.national_id); await q.evaluate(() => { window.__skip = true; });
await q.click('#plB'); await q.waitForTimeout(400); await q.fill('#pl-code', rq.code); await q.click('#plB'); await q.waitForTimeout(600);
ok(/غير صحيح أو منتهٍ/.test(await text('#plE', q)), 'رمز الجهاز الأول لا يعمل على جهاز آخر');
await ctx2.close();
// الإدارة ترى الطلب برمز الجهاز والرمز
const a = await ctx.newPage(); await a.goto(U + 'admin/#admin-access'); await a.waitForTimeout(500);
if (await a.$('[name=p]')) { await a.fill('[name=p]', '1234'); await a.click('#lf button'); await a.waitForTimeout(1200); }
await a.waitForSelector('#acReq');
const req = await text('#acReq', a);
ok(req.includes(rq.code) && req.includes(dev) && req.includes(st.full_name), 'الإدارة ترى طلب الدخول باسم صاحبه ورمز جهازه ورمز التحقق');
// الدخول بالرمز
await p.fill('#pl-code', rq.code); await p.click('#plB'); await p.waitForSelector('#sBody');
D = await data();
ok(D.devices.some(d => d.phone === st.phone && !d.revoked_at) && D.login_requests.find(r => r.id === rq.id).used_at, 'الدخول برقم الهوية والرمز يعتمد الجهاز ويستهلك الرمز');
ok(/رمز الدخول لجهاز جديد/.test(JSON.stringify(D.notifications.filter(n => n.trainee_id === st.id))), 'الرسالة محفوظة في صندوق المتدرب');
// ولي الأمر بهوية ابنه، والمدرب بهويته
const kid = D.trainees.find(t => t.guardian_phone && /^[12]\d{9}$/.test(t.national_id) && D.guardian_links.some(l => l.trainee_id === t.id && l.guardian_phone === t.guardian_phone && l.status === 'verified')) || null;
if (kid) { await p.goto(U + 'guardian/'); await p.waitForTimeout(600); await ask(p, 'guardian', kid.national_id); D = await data();
  ok(D.login_requests.some(r => r.role === 'guardian' && r.phone === kid.guardian_phone && !r.used_at), 'ولي الأمر يطلب الدخول بهوية ابنه'); }
await a.evaluate(() => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); D.teachers[0].national_id = '1000000016'; localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); });
await ask(p, 'teacher', '1000000016'); D = await data();
const tr = D.login_requests.find(r => r.role === 'teacher' && !r.used_at);
ok(tr && tr.phone === D.teachers[0].phone, 'المدرب يطلب الدخول بهويته');
await p.fill('#pl-code', tr.code); await p.click('#plB'); await p.waitForTimeout(900);
ok(!!(await p.$('[data-tt]')), 'المدرب يدخل بوابته بالهوية والرمز');

// تعدد المسؤولين
await a.reload(); await a.waitForSelector('#acAdmins #adF');
await a.fill('#ad-n', 'مسؤول التسجيل'); await a.fill('#ad-e', 'bad'); await a.click('#adF button'); await a.waitForTimeout(300);
ok(/بريد/.test(await text('#adE', a)), 'بريد غير صحيح يُرفض');
await a.fill('#ad-e', 'Registrar@Example.com'); await a.click('#adF button'); await a.waitForTimeout(600);
D = await data(a);
ok(D.admins.length === 2 && D.admins.some(x => x.email === 'registrar@example.com' && x.active) && /مسؤول التسجيل/.test(await text('#acAdmins', a)), 'إضافة مسؤول ثانٍ للنظام');
await a.click('#acAdmins [data-adr]'); await a.waitForTimeout(300); await a.click('#mo'); await a.waitForTimeout(600);
D = await data(a);
ok(D.admins.filter(x => x.active).length === 1 && !(await a.$('#acAdmins [data-adr]')), 'إزالة مسؤول، ولا يُزال الحساب الحالي');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
