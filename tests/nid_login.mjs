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
const L = async (fn, ...a) => { await p.goto(U); await p.waitForTimeout(500); return p.evaluate(async ([f, args]) => await window.__SAMA__.LocalStore[f](...args), [fn, a]); };
let r = await L('requestOtp', '1000000008', 'student');
D = await data();
ok(r.open === false && !r.code && !(D.login_requests || []).length, 'هوية غير مسجّلة: الرد نفسه دون كشف ولا رمز');
// هوية مسجّلة بلا تفعيل مفتوح: لا رمز، وطلب تراه الإدارة بالاسم
r = await L('requestOtp', st.national_id, 'student');
ok(r.open === false && !r.code, 'بلا تفعيل مفتوح: لا رمز');
const a = await ctx.newPage(); await a.goto(U + 'admin/#admin-access'); await a.waitForTimeout(500);
if (await a.$('[name=p]')) { await a.fill('[name=p]', '1234'); await a.click('#lf button'); await a.waitForTimeout(1200); }
await a.waitForSelector('#acReq');
ok((await text('#acReq', a)).includes(st.full_name) && !/\b\d{6}\b/.test(await text('#acReq', a)), 'الإدارة ترى طلب الدخول باسم صاحبه فقط');
await a.click('#acReq [data-rq]'); await a.waitForTimeout(600);
// بعد التفعيل: الرمز يظهر على الجهاز وحده ويُدخل به
await ask(p, 'student', st.national_id);
const c1 = await text('#otpShow b');
ok(/^\d{6}$/.test(c1), 'الرمز يظهر على جهاز صاحب الحساب');
await p.fill('#pl-code', c1); await p.click('#plB'); await p.waitForSelector('#ps-new');   // الخطوة BJ: تعيين كلمة المرور بعد أول دخول
await p.fill('#ps-new', 'Sama2026x'); await p.fill('#ps-conf', 'Sama2026x'); await p.click('#psGo'); await p.waitForSelector('#sBody');
D = await data();
ok(D.devices.some(d => d.phone === st.phone && !d.revoked_at) && !(D.notifications || []).some(n => n.kind === 'login_code'), 'الدخول برقم الهوية والرمز، ولا رموز في المراسلات');
// ولي الأمر بهوية ابنه، والمدرب بهويته
const kid = D.trainees.find(t => t.guardian_phone && /^[12]\d{9}$/.test(t.national_id) && D.guardian_links.some(l => l.trainee_id === t.id && l.guardian_phone === t.guardian_phone && l.status === 'verified')) || null;
if (kid) { await L('openActivation', kid.guardian_phone, 'guardian', 15); r = await L('requestOtp', kid.national_id, 'guardian');
  ok(r.open === true && /^\d{6}$/.test(r.code), 'ولي الأمر يطلب الدخول بهوية ابنه'); }
await a.evaluate(() => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); D.teachers[0].national_id = '1000000016'; localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); });
D = await data();
await L('openActivation', D.teachers[0].phone, 'teacher', 15);
await ask(p, 'teacher', '1000000016');
const tc = await text('#otpShow b');
await p.fill('#pl-code', tc); await p.click('#plB'); await p.waitForSelector('#ps-new');
await p.fill('#ps-new', 'Sama2026x'); await p.fill('#ps-conf', 'Sama2026x'); await p.click('#psGo'); await p.waitForTimeout(900);
ok(/^\d{6}$/.test(tc) && !!(await p.$('[data-tt]')), 'المدرب يدخل بوابته بالهوية والرمز الظاهر على جهازه');

// تعدد المسؤولين: صفحة «إدارة المسؤولين»، والإزالة تعطيل
await a.goto(U + 'admin/#admin-admins'); await a.waitForSelector('#adF');
await a.fill('#ad-n', 'مسؤول التسجيل'); await a.fill('#ad-e', 'bad'); await a.click('#adS'); await a.waitForTimeout(300);
ok(/بريد/.test(await text('#adE', a)), 'بريد غير صحيح يُرفض');
await a.fill('#ad-e', 'Registrar@Example.com'); await a.click('#adS'); await a.waitForTimeout(700);
D = await data(a);
ok(D.admins.length === 2 && D.admins.some(x => x.email === 'registrar@example.com' && x.active && x.role === 'staff') && /مسؤول التسجيل/.test(await text('#adList', a)), 'دعوة مسؤول ثانٍ بدور «مسؤول عادي» افتراضيًا');
await a.click('#adList [data-ai]'); await a.waitForTimeout(300); await a.click('#mo'); await a.waitForTimeout(700);
D = await data(a);
ok(D.admins.length === 1 && !(await a.$('#adList [data-ai]')) && !(await a.$('#adList [data-aa]')), 'إلغاء الدعوة، ولا يُعطَّل الحساب الحالي ولا المالك');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
