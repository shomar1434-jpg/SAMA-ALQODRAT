// الخطوة AZ: استوديو البث — المدرب يجدول محاضرة برابط بث يوتيوب (من قاعة Zoom)، والمتدرب يشاهدها مضمَّنة بملء الشاشة، والمكتبة بعد الانتهاء، والإدارة تتابع
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
import { ytId, lectureState, canWatch, lecturesForTrainees } from '../src/studio_logic.js';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
ok(ytId('https://youtube.com/live/AbCdEfGhIjK?si=x') === 'AbCdEfGhIjK' && ytId('https://www.youtube.com/watch?v=AbCdEfGhIjK&t=3') === 'AbCdEfGhIjK' && ytId('https://youtu.be/AbCdEfGhIjK') === 'AbCdEfGhIjK' && ytId('nope') === null && ytId('') === '', 'قراءة روابط يوتيوب');
const T0 = Date.now(), L = (min, extra = {}) => ({ starts_at:new Date(T0 + min * 60000).toISOString(), minutes:60, youtube_id:'AbCdEfGhIjK', status:'scheduled', recording:true, ...extra });
ok(lectureState(L(-5), T0) === 'live' && lectureState(L(30), T0) === 'upcoming' && lectureState(L(-90), T0) === 'ended', 'الحالة من الموعد والمدة');
ok(canWatch(L(10), T0) && !canWatch(L(30), T0) && canWatch(L(-90), T0) && !canWatch(L(-90, { recording:false }), T0) && !canWatch(L(-5, { status:'cancelled' }), T0), 'المعرّف قبل البداية بـ15 دقيقة، والتسجيل بإتاحة المدرب');

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const login = async (role, phone) => { await p.goto(U + role + '/'); await p.waitForTimeout(700);
  if (await p.$('#logoutBtn:not([hidden])')) { await p.click('#logoutBtn'); await p.waitForTimeout(400); }
  await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(900); };
const riy = ms => new Date(ms + 3 * 3600e3).toISOString().slice(0, 16);
await p.goto(U); await p.waitForTimeout(800);
let D = await data();
const T = D.teachers.find(t => t.section === 'boys' && t.subjects.includes('كمي'));
const one = s => D.trainees.filter(t => t.phone === D.trainees.find(x => x.id === s.trainee_id).phone).length === 1;
const sub = D.subscriptions.find(s => ['pending', 'active'].includes(s.status) && s.section === 'boys' && s.subjects.includes('كمي') && one(s));
const subG = D.subscriptions.find(s => ['pending', 'active'].includes(s.status) && s.section === 'girls' && s.subjects.includes('كمي') && one(s));
const st = D.trainees.find(t => t.id === sub.trainee_id), stG = D.trainees.find(t => t.id === subG.trainee_id);

await login('teacher', T.phone); await p.click('[data-tt="live"]'); await p.waitForSelector('#lvF');
const sched = async (title, startMs, yt, rec = true) => { await p.fill('#lv-t', title); await p.selectOption('#lv-s', 's:كمي'); await p.fill('#lv-d', riy(startMs)); await p.fill('#lv-m', '60'); await p.fill('#lv-y', yt);
  if (!rec) await p.uncheck('#lv-r'); await p.click('#lvS'); await p.waitForTimeout(700); if (!(await p.$('#lvF'))) { await p.click('[data-tt="live"]'); await p.waitForSelector('#lvF'); } };
await p.fill('#lv-t', 'تجربة'); await p.fill('#lv-d', riy(T0)); await p.fill('#lv-y', 'رابط خاطئ'); await p.click('#lvS'); await p.waitForTimeout(200);
ok(/رابط يوتيوب غير صحيح/.test(await text('#lvE')), 'رابط يوتيوب خاطئ مرفوض');
await sched('حل مسائل النسبة مباشرة', T0 - 5 * 60000, 'https://youtube.com/live/AbCdEfGhIjK');
await sched('مراجعة الهندسة', T0 + 3 * 86400e3, 'https://youtu.be/ZyXwVuTsRqP');
await sched('مراجعة قديمة', T0 - 3 * 86400e3, 'https://youtu.be/OldRecordng', true);
await sched('محاضرة بلا تسجيل', T0 - 2 * 86400e3, 'https://youtu.be/NoRecording', false);
D = await data();
ok(D.lectures.length === 4 && D.lectures.every(l => l.teacher_id === T.id && l.section === 'boys' && l.subject === 'كمي'), 'جدولة أربع محاضرات في نطاق المدرب');
ok(/مباشر الآن/.test(await text('#tBody')) && /القادمة/.test(await text('#tBody')) && /المنتهية/.test(await text('#tBody')), 'قائمة المدرب بالحالات');

await login('student', st.phone); await p.click('[data-st="live"]'); await p.waitForSelector('.lv-now');
const src = await p.getAttribute('.lv-now iframe', 'src');
ok(/youtube-nocookie\.com\/embed\/AbCdEfGhIjK/.test(src) && (await p.getAttribute('.lv-now iframe', 'allowfullscreen')) !== null && await p.$('.lv-now [data-lvfs]'), 'المتدرب يشاهد البث المباشر مضمَّنًا مع ملء الشاشة');
ok(/مراجعة الهندسة/.test(await text('#sBody')), 'المحاضرة القادمة ظاهرة');
const pd = JSON.stringify(lecturesForTrainees(await data(), [st.id]));
ok(!pd.includes('ZyXwVuTsRqP') && !pd.includes('NoRecording') && pd.includes('OldRecordng'), 'لا يُرسل معرّف القادمة بعد ولا غير المتاح تسجيلها');
await p.click('[data-lvw]'); await p.waitForTimeout(400);
ok(/OldRecordng/.test(await p.getAttribute('#lvLib iframe', 'src')), 'مكتبة التسجيلات تشغّل المحاضرة المسجلة');

await login('student', stG.phone); await p.click('[data-st="live"]'); await p.waitForSelector('.lv-now');
ok(!(await p.$('.lv-now iframe')) && !/حل مسائل النسبة/.test(await text('#sBody')), 'متدربة قسم آخر لا ترى محاضرات مدرب البنين');

await login('teacher', T.phone); await p.click('[data-tt="live"]'); await p.waitForSelector('#lvF');
await p.click('[data-ls$=":ended"]'); await p.waitForTimeout(600);
ok((await data()).lectures.find(l => l.title === 'حل مسائل النسبة مباشرة').status === 'ended', 'المدرب ينهي البث');

await p.goto(U + 'admin/#admin-studio'); await p.waitForTimeout(600);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
await p.waitForSelector('#stT');
ok((await p.$$('#stT tbody tr')).length === 4 && new RegExp(T.full_name).test(await text('#stT')), 'صفحة «استوديو البث» تعرض محاضرات المدربين');
await p.click('#stT [data-sx$=":cancelled"]'); await p.waitForTimeout(600);
ok((await data()).lectures.find(l => l.title === 'مراجعة الهندسة').status === 'cancelled', 'الإدارة تلغي محاضرة قادمة');
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
