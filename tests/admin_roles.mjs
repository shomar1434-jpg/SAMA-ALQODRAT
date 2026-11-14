// الخطوة Z: أدوار المسؤولين (مالك، مدير كامل، مسؤول عادي)، إزالة الإنشاء العام من صفحة الدخول، أرشيف الحركات، ونوع المدرب عند إضافته
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const put = fn => p.evaluate(src => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); (0, eval)(src)(D); localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); }, fn.toString()).then(() => p.reload());
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const go = async h => { await p.goto(U + 'admin/#' + h); await p.reload(); await p.waitForTimeout(700); };

// ---- صفحة الدخول: لا إنشاء حساب مسؤول ----
await go('admin');
ok(!!(await p.$('#lf')) && !(await p.$('#lfNew')) && !/إنشاء حساب مسؤول/.test(await text('#app')), 'صفحة الدخول للمصادقة فقط، بلا خيار إنشاء مسؤول');
await go('admin-join');
ok(!!(await p.$('#lf')) && !/تفعيل حساب مسؤول مدعوّ/.test(await text('#app')), 'رابط التفعيل لا يعمل في الوضع التجريبي');
await p.fill('[name=p]', '1234'); await p.click('#lfGo'); await p.waitForTimeout(1200);

// ---- المالك: يرى إدارة المسؤولين وأرشيف الحركات ----
await go('admin');
const nav = await text('.side');
ok(/إدارة المسؤولين/.test(nav) && /أرشيف الحركات/.test(nav) && /الإعدادات/.test(nav) && /المالك الأساسي/.test(nav), 'المالك يرى إدارة المسؤولين والأرشيف ودوره');
await go('admin-admins');
ok(/المالك الأساسي/.test(await text('#adList')) && !(await p.$('#adList [data-aa]')) && !(await p.$('#adList [data-ar]')), 'المالك لا يُعطَّل ولا يُغيَّر دوره');
ok(/بريد من المنصة/.test(await text('#main')) && !(await p.$('#adLink')), 'شرح الدعوة بالبريد بدل رابط يُنسخ');

// دعوة «مدير كامل» تحتاج إعادة التحقق
await p.fill('#ad-n', 'مدير المركز الثاني'); await p.fill('#ad-e', 'full@center.sa'); await p.selectOption('#ad-r', 'full'); await p.click('#adS'); await p.waitForSelector('#raF');
await p.fill('#ra-p', '9999'); await p.click('#raS'); await p.waitForTimeout(300);
ok(/كلمة المرور غير صحيحة/.test(await text('#raE')), 'إعادة التحقق بكلمة خاطئة تُرفض');
await p.fill('#ra-p', '1234'); await p.click('#raS'); await p.waitForTimeout(900);
let D = await data();
ok(D.admins.some(a => a.email === 'full@center.sa' && a.role === 'full' && a.pending), 'المالك يدعو مديرًا كاملًا بعد إعادة التحقق');

// مسؤول قائم: تغيير الدور بسبب، والتعطيل
await put(D => { D.admins.push({ id:'staff-1', email:'staff@center.sa', name:'مسؤول الحضور', role:'staff', active:true, pending:false }); });
await go('admin-admins');
await p.click('[data-ar="staff-1"]'); await p.waitForSelector('#arF'); await p.selectOption('#ar-r', 'full'); await p.click('#arS'); await p.waitForTimeout(300);
ok(/سبب/.test(await text('#arE')) || !!(await p.$('#raF')), 'تغيير الدور يحتاج سببًا أو تحققًا');
if (await p.$('#raF')) { await p.click('#raC'); await p.waitForTimeout(200); await p.click('[data-ar="staff-1"]'); await p.waitForSelector('#arF'); await p.selectOption('#ar-r', 'full'); }
await p.fill('#ar-why', 'تكليف بإدارة الفرع'); await p.click('#arS'); await p.waitForTimeout(500);
if (await p.$('#raF')) { await p.fill('#ra-p', '1234'); await p.click('#raS'); await p.waitForTimeout(900); }
D = await data();
ok(D.admins.find(a => a.id === 'staff-1').role === 'full', 'المالك يرقّي بسبب مكتوب');
await go('admin-admins');
await p.click('[data-aa="staff-1"]'); await p.waitForSelector('#aaF'); await p.fill('#aa-r', 'انتهاء التكليف'); await p.click('#aaS'); await p.waitForTimeout(800);
D = await data();
ok(D.admins.find(a => a.id === 'staff-1').active === false && D.admins.some(a => a.id === 'staff-1'), 'التعطيل لا يحذف الحساب');

// ---- أرشيف الحركات ----
await go('admin-audit'); await p.waitForSelector('#auList table');
ok(/المسؤولون/.test(await text('#auList')) && /مدير النظام/.test(await text('#auList')), 'الأرشيف يعرض المنفّذ والقسم');
await p.selectOption('#au-s', 'admins'); await p.click('#auGo'); await p.waitForTimeout(500);
ok(/role/.test(await text('#auList')) && /تكليف بإدارة الفرع/.test(await text('#auList')), 'التصفية بالقسم وتظهر القيم قبل وبعد مع السبب');
const n0 = (await data()).audit_logs.length;
await p.click('#auCsv'); await p.waitForTimeout(1800);
D = await data();
ok(D.audit_logs.length === n0 + 1 && D.audit_logs.at(-1).action === 'audit.export', 'التصدير يُسجَّل في الأرشيف');

// ---- نوع المدرب عند الإضافة ----
await go('admin-users'); await p.click('#tAdd'); await p.waitForSelector('#tf');
ok(/متدربي/.test(await text('#tfLink')) || /اختر مقررًا/.test(await text('#tfLink')), 'بيان ما سيرتبط به المدرب');
await p.check('#tf [name=subjects][value="كمي"]'); await p.waitForTimeout(150);
ok(/البنك المشترك/.test(await text('#tfLink')) && /كمي/.test(await text('#tfLink')), 'مدرب الباقات يُربط بمتدربي قسمه والبنك المشترك لمقرره');
await p.check('#tf [name=kind][value=programs]'); await p.waitForTimeout(150);
ok(await p.$eval('#tfSubj', e => e.hidden) && /دفعات البرامج/.test(await text('#tfLink')), 'مدرب البرامج: تختفي المقررات ويُرشد لربط الدفعة');
await p.check('#tf [name=kind][value=qudurat]'); await p.uncheck('#tf [name=subjects][value="كمي"]');
await p.fill('#tf-name', 'مدرب تجريبي جديد'); await p.fill('#tf-phone', '0559991234'); await p.click('#tfS'); await p.waitForTimeout(300);
ok(/مقررًا واحدًا/.test(await text('#tfE')), 'مدرب الباقات بلا مقرر يُرفض');
await p.check('#tf [name=kind][value=programs]'); await p.click('#tfS'); await p.waitForTimeout(800);
D = await data();
ok(D.teachers.some(t => t.full_name === 'مدرب تجريبي جديد' && !(t.subjects || []).length), 'يُحفظ مدرب البرامج بلا مقررات');

// ---- المسؤول العادي: تشغيل يومي فقط ----
await put(D => { D.admins.find(a => a.id === 'demo-admin').role = 'staff'; });
await go('admin');
const nav2 = await text('.side');
ok(!/إدارة المسؤولين/.test(nav2) && !/أرشيف الحركات/.test(nav2) && !/الإعدادات/.test(nav2) && /الحضور اليومي/.test(nav2) && /مسؤول عادي/.test(nav2), 'المسؤول العادي لا يرى الإدارة والأرشيف والإعدادات');
for (const h of ['admin-settings', 'admin-admins', 'admin-audit']) { await go(h); ok(/لمدير النظام|للمالك/.test(await text('#main')) && !(await p.$('#adF')) && !(await p.$('#auF')), `الرابط المباشر ${h} مرفوض للمسؤول العادي`); }

ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
