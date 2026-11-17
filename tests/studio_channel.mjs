// الخطوة BC: قاعة Zoom ثابتة لكل مدرب، وجدول أسبوعي ثابت يولّد المحاضرات، وإسناد بثوث قناة يوتيوب المركز، وعرض البث للمتدرب
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
import { zoomOk, channelOk, checkSlot, slotLectures, assignVideos, channelLiveEmbed, riyadhIso } from '../src/studio_logic.js';
import { riyadhNow, addDays } from '../src/utils.js';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();

// منطق خالص
ok(zoomOk('https://us06web.zoom.us/j/81234567890?pwd=abc') && zoomOk('') && !zoomOk('https://zoom.us.evil.com/j/1') && !zoomOk('http://zoom.us/j/1'), 'التحقق من رابط Zoom');
ok(channelOk('UCabcdefghijklmnopqrstuv') && !channelOk('UC123') && /live_stream\?channel=UCabcdefghijklmnopqrstuv/.test(channelLiveEmbed('UCabcdefghijklmnopqrstuv')), 'معرّف القناة ورابطها الثابت');
const te = { id: 't1', section: 'boys', subjects: ['كمي'] };
let err = ''; try { checkSlot({ title: 'خارج', subject: 'لفظي', dow: [0], start_time: '10:00', minutes: 60 }, te); } catch(e) { err = e.message; }
ok(/خارج نطاق/.test(err), 'مقرر خارج نطاق المدرب مرفوض');
const today = riyadhNow().date;
const Dl = { lecture_slots: [{ id: 's1', ...checkSlot({ title: 'شرح يومي', subject: 'كمي', dow: [0, 1, 2, 3, 4, 5, 6], start_time: '10:00', minutes: 60 }, te) }], lectures: [], cohorts: [] };
const gen = slotLectures(Dl, today, 8);
ok(gen.length === 8 && gen[0].starts_at === riyadhIso(today, '10:00') && gen.every(l => l.slot_id === 's1'), 'التوليد لكل يوم مختار');
const genH = slotLectures(Dl, today, 8, (D, sec, d) => d !== today ? { start: '09:00' } : null);
ok(genH.length === 7 && !genH.some(l => l.slot_date === today), 'يوم بلا جلسة (عطلة) يُتخطى');
Dl.lectures = gen.slice(0, 2).map((l, i) => ({ id: 'l' + i, ...l }));
ok(slotLectures(Dl, today, 8).length === 6, 'لا تكرار');
const st = Date.parse(gen[0].starts_at);
const lec = [{ id: 'a', teacher_id: 't1', starts_at: gen[0].starts_at, minutes: 60, youtube_id: '', status: 'scheduled' }, { id: 'b', teacher_id: 't2', starts_at: gen[0].starts_at, minutes: 60, youtube_id: '', status: 'scheduled' }];
const vids = [{ video_id: 'AAAAAAAAAA1', title: 'بث الأستاذ أحمد', actual_start: new Date(st + 120000).toISOString() }, { video_id: 'BBBBBBBBBB2', title: 'بث آخر', actual_start: new Date(st + 180000).toISOString() },
  { video_id: 'CCCCCCCCCC3', title: 'خارج الموعد', actual_start: new Date(st - 3 * 3600e3).toISOString() }];
const asg = assignVideos(lec, vids, [{ id: 't1', yt_tag: 'أحمد' }, { id: 't2', yt_tag: '' }]);
ok(JSON.stringify(asg) === JSON.stringify([{ video_id: 'AAAAAAAAAA1', lecture_id: 'a' }, { video_id: 'BBBBBBBBBB2', lecture_id: 'b' }]), 'الإسناد بالموعد ووسم المدرب، وخارج الموعد لا يُسند');
ok(assignVideos(lec, [vids[1]], []).length === 0, 'محاضرتان متزامنتان بلا وسم: يُترك للإسناد اليدوي');

// الواجهة
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } }); let p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const put = async f => { const D = await data(); f(D); await p.evaluate(d => localStorage.setItem('sama_qudrat_v4', JSON.stringify(d)), D); };
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const login = async (role, phone) => { await p.goto(U + role + '/'); await p.waitForTimeout(700);
  if (await p.$('#logoutBtn:not([hidden])')) { await p.click('#logoutBtn'); await p.waitForTimeout(400); }
  await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(900); };
await p.goto(U); await p.waitForTimeout(800);
// كل الأيام أيام جلسة للبنين، وموعد يبدأ قبل 5 دقائق ليكون «مباشرًا الآن»
const now = riyadhNow(), hm = new Date(Date.now() + 3 * 3600e3 - 5 * 60000).toISOString().slice(11, 16);
await put(D => { D.schedule_exceptions = (D.schedule_exceptions || []).filter(x => x.section !== 'boys'); for (let d = 0; d < 7; d++) if (!D.schedule_templates.some(x => x.section === 'boys' && x.dow === d)) D.schedule_templates.push({ id: 'tb' + d, section: 'boys', dow: d, start: '08:00', end: '23:00' }); });
let D = await data();
const T = D.teachers.find(t => t.section === 'boys' && t.subjects.includes('كمي'));
const one = s => D.trainees.filter(t => t.phone === D.trainees.find(x => x.id === s.trainee_id).phone).length === 1;
const sub = D.subscriptions.find(s => ['pending', 'active'].includes(s.status) && s.section === 'boys' && s.subjects.includes('كمي') && one(s));
const stu = D.trainees.find(t => t.id === sub.trainee_id);

await p.goto(U + 'admin/#admin-studio'); await p.waitForTimeout(600);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
await p.click('[data-stt="slots"]'); await p.waitForSelector('#zmT');
await p.fill(`#zm-${T.id}`, 'https://evil.example/j/1'); await p.click(`[data-zms="${T.id}"]`); await p.waitForTimeout(300);
ok(!(await data()).teachers.find(t => t.id === T.id).zoom_url, 'رابط Zoom خاطئ لا يُحفظ');
await p.fill(`#zm-${T.id}`, 'https://us06web.zoom.us/j/81234567890'); await p.fill(`#tg-${T.id}`, 'وسم-أ'); await p.click(`[data-zms="${T.id}"]`); await p.waitForTimeout(300);
ok((await data()).teachers.find(t => t.id === T.id).zoom_url === 'https://us06web.zoom.us/j/81234567890', 'حُفظت قاعة Zoom للمدرب');
await p.selectOption('#sl-t', T.id); await p.waitForTimeout(400);
await p.selectOption('#sl-s', 's:كمي'); await p.fill('#sl-n', 'شرح الكمي اليومي');
for (let i = 0; i < 7; i++) await p.check(`[data-sld="${i}"]`);
await p.fill('#sl-h', hm); await p.fill('#sl-m', '60'); await p.click('#slS'); await p.waitForTimeout(800);
D = await data();
const slot = D.lecture_slots.find(s => s.teacher_id === T.id);
const mine = D.lectures.filter(l => l.slot_id === slot?.id);
ok(slot && mine.length === 8 && mine.some(l => l.slot_date === now.date), 'الموعد الثابت ولّد محاضرات اليوم والأسبوع');
ok(/شرح الكمي اليومي/.test(await text('#slT')), 'المواعيد الثابتة في الجدول');

// القناة: معرّف ثابت، وبث يُسند يدويًا
await p.click('[data-stt="yt"]'); await p.waitForSelector('#yt-ch');
await p.fill('#yt-ch', 'UCabcdefghijklmnopqrstuv'); await p.click('#ytCh'); await p.waitForTimeout(300);
ok((await data()).settings.yt_channel_id === 'UCabcdefghijklmnopqrstuv', 'حُفظ معرّف القناة');

// المدرب يرى قاعته وجدوله، ومحاضرة اليوم مباشرة
await login('teacher', T.phone); await p.click('[data-tt="live"]'); await p.waitForSelector('.lv-room');
ok((await p.getAttribute('#lvZoom', 'href')) === 'https://us06web.zoom.us/j/81234567890' && /جدولي الثابت/.test(await text('.lv-room')), 'المدرب يرى قاعة Zoom وجدوله الثابت');
ok(/شرح الكمي اليومي/.test(await text('#tBody')) && /مباشر الآن/.test(await text('#tBody')), 'محاضرة اليوم في «محاضراتي»');

// المتدرب: بث جارٍ بلا إسناد ← رابط القناة الثابت، ولا يرى قاعة Zoom
await login('student', stu.phone); await p.click('[data-st="live"]'); await p.waitForSelector('.lv-now');
ok(/live_stream\?channel=UCabcdefghijklmnopqrstuv/.test(await p.getAttribute('.lv-now iframe', 'src') || ''), 'البث الجاري يظهر من رابط القناة الثابت');
ok(!(await p.content()).includes('zoom.us'), 'المتدرب لا يرى رابط قاعة Zoom');

// بث مُزامَن ← يُسند آليًا ويظهر بمعرّفه، ثم يبقى في المكتبة مجمّعًا بالمقرر
const today0 = mine.find(l => l.slot_date === now.date);
await put(D => { D.yt_videos = [{ video_id: 'LiveTodayAA', title: 'بث وسم-أ', privacy: 'unlisted', life_cycle: 'live', actual_start: new Date(Date.parse(today0.starts_at) + 60000).toISOString(), lecture_id: null }]; });
await p.evaluate(() => { window.__ytSyncAt = 0; }); await p.click('[data-st="home"]').catch(() => {}); await p.waitForTimeout(300);
await login('student', stu.phone); await p.click('[data-st="live"]'); await p.waitForTimeout(1200);
await p.click('[data-st="live"]').catch(() => {}); await p.waitForTimeout(600);
D = await data();
ok(D.lectures.find(l => l.id === today0.id).youtube_id === 'LiveTodayAA', 'البث المزامَن أُسند آليًا إلى محاضرة اليوم');
await put(D => { const l = D.lectures.find(x => x.id === today0.id); l.status = 'ended'; });
await login('student', stu.phone); await p.click('[data-st="live"]'); await p.waitForSelector('#lvLib');
ok(await p.$('#lvLib .lv-grp') && /كمي/.test(await text('#lvLib .lv-grp summary')), 'المكتبة مجمّعة بالمقرر كقوائم التشغيل');

// الإدارة: الإسناد اليدوي من قائمة بثوث القناة
await p.goto(U + 'admin/#admin-studio'); await p.waitForTimeout(800); await p.click('[data-stt="yt"]'); await p.waitForSelector('#ytT');
await p.selectOption('[data-ytv="LiveTodayAA"]', ''); await p.waitForTimeout(400);
ok((await data()).lectures.find(l => l.id === today0.id).youtube_id === '', 'فك الإسناد يدويًا من قائمة بثوث القناة');

ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
