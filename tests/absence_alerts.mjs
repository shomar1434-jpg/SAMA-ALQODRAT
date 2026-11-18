// الخطوة BM: تنبيه غياب باقات القدرات والتحصيلي (من الغياب الرابع)، وترتيب الأسماء هجائيًا
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { ok, failed } = reporter();
const { server, origin: U } = serveDist();
const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{ width:1280, height:900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { window.__opened = []; window.open = u => { window.__opened.push(u); return null; }; localStorage.setItem('sama_absalert_force', '1'); });
await p.goto(U + 'admin/#admin-qudurat'); await p.waitForSelector('#lf'); await p.fill('[name=p]', '1234'); await p.click('#lfGo'); await p.waitForTimeout(1200);
const KEY = 'sama_qudrat_v4';
// كل أيام الأسبوع جلسات منتهية للقسمين؛ اشتراكات البنين بدأت قبل 10 أيام بلا حضور (غياب كثير)، وأحدهم بحضور يجعل غيابه 3 فقط
const setup = await p.evaluate(k => { const D = JSON.parse(localStorage.getItem(k));
  D.schedule_exceptions = []; D.schedule_templates = [0,1,2,3,4,5,6].flatMap(dow => [{ id:'b' + dow, section:'boys', dow, start:'00:00', end:'00:01' }, { id:'g' + dow, section:'girls', dow, start:'00:00', end:'00:01' }]);
  const day = d => new Date(Date.now() + 3 * 3600e3 - d * 864e5).toISOString().slice(0, 10);
  D.absence_alerts = []; D.sub_attendance = [];
  const live = D.subscriptions.filter(s => s.status !== 'cancelled' && !D.trainees.find(t => t.id === s.trainee_id)?.is_test);
  live.forEach(s => { s.start_date = day(6); s.track_from = null; s.end_date = null; s.status = 'active'; s.prior_absences = 0; });
  const few = live[0];   // 7 جلسات منها 4 حضور = 3 غياب: لا تنبيه
  [0, 1, 2, 3].forEach(d => D.sub_attendance.push({ id:'sa' + d, subscription_id:few.id, trainee_id:few.trainee_id, att_date:day(d), status:'حاضر', time:'08:00:00' }));
  const g = D.trainees.find(t => t.id === live[1].trainee_id); g.guardian_phone = '0551112222';
  localStorage.setItem(k, JSON.stringify(D)); sessionStorage.removeItem('sama_absalert_shown');
  return { few:few.id, many:live.slice(1).map(s => s.id), guardianSub:live[1].id, name:g.full_name }; }, KEY);
await p.reload(); await p.waitForTimeout(1200);
ok(await p.isVisible('.modal') && /تنبيه غياب/.test(await p.textContent('.modal')), 'تظهر نافذة تنبيه الغياب للمسؤول تلقائيًا');
ok(await p.isVisible('[data-absalert]'), 'شريط تنبيه الغياب في صفحة القدرات والتحصيلي');
const count = async () => p.evaluate(() => (document.querySelector('.modal .hint')?.textContent || '').match(/من\s*(\S+)/)?.[1]);
const modalTxt = await p.textContent('.modal');
ok(/زاد الغياب عن ٣ مرات|زاد الغياب عن 3 مرات/.test(modalTxt) && /الغياب\s*[٧7]/.test(modalTxt), 'التنبيه بعدد الغياب (7) بعد تجاوز 3');
// الوصول إلى تنبيه صاحب جوال ولي الأمر
for (let i = 0; i < 40 && !(await p.textContent('.modal')).includes(setup.name); i++) { await p.click('#abaNext'); await p.waitForTimeout(80); }
const txt = await p.inputValue('#abaText');
ok(/ولي أمر/.test(txt) && /نفيدكم بأن غياب/.test(txt) && /بلغ/.test(txt) && /مركز سما القدرات/.test(txt), 'الرسالة الجاهزة لولي الأمر');
ok(/إرسال لولي الأمر/.test(await p.textContent('#abaSend')) && await p.isVisible('#abaCancel'), 'زرّا «إرسال لولي الأمر» و«إلغاء الرسالة»');
await p.fill('#abaText', txt + '\nملاحظة من المسؤول'); await p.click('#abaSend'); await p.waitForTimeout(500);
const opened = await p.evaluate(() => window.__opened);
ok(/^https:\/\/wa\.me\/966551112222\?text=/.test(opened[0] || '') && decodeURIComponent(opened[0]).includes('ملاحظة من المسؤول'), 'الإرسال يفتح واتساب ولي الأمر بالرسالة المعدّلة (لا إرسال آلي)');
let D = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
ok(D.absence_alerts.some(a => a.subscription_id === setup.guardianSub && a.action === 'sent' && a.level === 7), 'يُحفظ قرار الإرسال عند هذا العدد');
// إلغاء الرسالة للبقية
const left = setup.many.length - 1;
for (let i = 0; i < left; i++) { if (!(await p.$('#abaCancel'))) break; await p.click('#abaCancel'); await p.waitForTimeout(250); }
D = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
ok(!D.absence_alerts.some(a => a.subscription_id === setup.few), 'من غيابه 3 فقط لا يُنبَّه');
ok(D.absence_alerts.filter(a => a.action === 'dismissed').length === left && !(await p.$('#abaSend')), '«إلغاء الرسالة» يُخفي التنبيه دون إرسال');
await p.reload(); await p.waitForTimeout(900);
ok(!(await p.$('[data-absalert]')), 'لا تنبيه بعد البت فيها');
// غياب جديد يعيد التنبيه
await p.evaluate(([k, id]) => { const D = JSON.parse(localStorage.getItem(k)); D.subscriptions.find(s => s.id === id).start_date = new Date(Date.now() + 3 * 3600e3 - 7 * 864e5).toISOString().slice(0, 10); localStorage.setItem(k, JSON.stringify(D)); }, [KEY, setup.guardianSub]);
await p.reload(); await p.waitForTimeout(900);
ok(await p.isVisible('[data-absalert]') && /١|1/.test(await p.textContent('[data-absalert]')), 'غياب جديد بعد القرار يُعيد التنبيه');

// الترتيب الهجائي: المتدربون وحضور اليوم والمشتركون
const sorted = a => a.every((x, i) => i === 0 || new Intl.Collator('ar', { sensitivity:'base', ignorePunctuation:true }).compare(a[i - 1], x) <= 0);
await p.goto(U + 'admin/#admin-trainees'); await p.waitForTimeout(900); if (await p.$('#abaLater')) await p.click('#abaLater');
const names = await p.$$eval('.tb tbody tr b', els => els.map(e => e.textContent.trim()));
ok(names.length > 2 && sorted(names), 'المتدربون مرتبون هجائيًا');
await p.goto(U + 'admin/#admin-qudurat'); await p.waitForTimeout(900); if (await p.$('#abaLater')) await p.click('#abaLater');
const subNames = await p.$$eval('#qBody .tb tbody tr td:first-child b, #qBody .tb tbody tr td:first-child .who b', els => els.map(e => e.textContent.trim()));
ok(subNames.length > 1 && sorted(subNames), 'المشتركون مرتبون هجائيًا');

ok(!errs.length, 'بلا أخطاء صفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
