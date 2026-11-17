// الخطوة C: ربط ولي الأمر الذاتي بالسجل المدني — الشروط الثلاثة، والرسالة الموحدة، والقفل، ومنع إعادة الملغى
import { chromium } from 'playwright';
import { serveDist, reporter, autoConsent } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.addInitScript(() => { try { localStorage.setItem('sama_skip_reg_intro', '1'); } catch {} });   // شاشة التعليمات تُختبر في home_courses
const errs = []; p.on('pageerror', e => errs.push(e.message));
const KEY = 'sama_qudrat_v4';
const data = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const years = n => { const d = new Date(Date.now() + 3 * 3600e3); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10); };
const login = async phone => { await p.goto(U + 'guardian/'); await p.waitForTimeout(700);
  if (await p.$('#logoutBtn:not([hidden])')) { await p.click('#logoutBtn'); await p.waitForTimeout(400); }
  await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); if (await p.$('#otpF:not([hidden])')) { await p.fill('#pl-code', '1234'); await p.click('#plB'); } await p.waitForTimeout(900); };

// تسجيل قاصر بجوال ولي أمره
await p.goto(U + '#enroll'); await p.waitForSelector('#en-item'); await p.check('#en-kind-plan', { force: true }); await p.selectOption('#en-item', { index: 1 });
await p.fill('[name=full_name]', 'زياد عمر علي الشهري'); await p.fill('[name=national_id]', '1000000503'); await p.fill('[name=phone]', '0556660003');
await p.selectOption('[name=gender]', 'ذكر'); await p.fill('[name=birth_date]', years(15), { timeout: 400 }).catch(() => {}); await p.dispatchEvent('[name=birth_date]', 'change');
await p.selectOption('[name=city]', { index: 1 }, { timeout: 400 }).catch(() => {}); await p.selectOption('[name=education]', { index: 1 }, { timeout: 400 }).catch(() => {}); await p.fill('[name=guardian_phone]', '0508880003'); await p.check('[name=agree]');
await autoConsent(p); await p.click('#rfGo'); await p.waitForSelector('.refbox');
let D = await data(); const kid = D.trainees.find(t => t.national_id === '1000000503'), otherNid = D.trainees.find(t => t.id !== kid.id).national_id;

// جوال غير مصرَّح به لا يدخل البوابة أصلًا
await login('0508887777');
ok(await p.$('#pl-phone') && (await text('#plE')).length > 0, 'جوال غير مصرَّح به لا يدخل بوابة ولي الأمر');

// الجوال المصرَّح به يدخل ويرى نموذج الربط فقط
await login('0508880003');
ok(await p.$('#gl-nid') && !/زياد/.test(await text('#app')), 'ولي الأمر يدخل ويرى نموذج الربط دون أي بيانات');
await p.fill('#gl-nid', otherNid); await p.click('#glB'); await p.waitForTimeout(500);
const m1 = await text('#glE');
await p.fill('#gl-nid', '1000000511'); await p.click('#glB'); await p.waitForTimeout(500);
ok(/تعذّر الربط/.test(m1) && m1 === await text('#glE'), 'رسالة رفض واحدة لسجل متدرب آخر ولسجل غير موجود');
await p.fill('#gl-nid', '1000000503'); await p.click('#glB'); await p.waitForTimeout(1200);
D = await data();
ok(D.guardian_links.some(l => l.trainee_id === kid.id && l.guardian_phone === '0508880003' && l.status === 'verified' && l.source === 'self'), 'الربط الذاتي بالسجل المدني الصحيح');
ok(/متابعة زياد/.test(await text('#app')) && await p.$('#gLink'), 'يرى لوحة ابنه بعد الربط، وزر ربط ابن آخر');
ok(D.guardian_link_attempts.length === 3 && !JSON.stringify(D.guardian_link_attempts).includes('1000000503'), 'المحاولات مسجّلة دون السجل المدني');

// الإدارة تلغي الرابط: لا يُعاد ذاتيًا
await p.goto(U + 'admin/#admin-users'); await p.waitForTimeout(900);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
await p.click('[data-ut="guardians"]'); await p.waitForTimeout(400);
ok(/ربط ذاتي/.test(await text('#uBody')), 'الإدارة ترى الرابط الذاتي مميَّزًا');
const lid = D.guardian_links.find(l => l.trainee_id === kid.id).id;
await p.click(`[data-gr="${lid}"]`); await p.waitForTimeout(300); await p.click('#mo'); await p.waitForTimeout(700);
await login('0508880003');
await p.fill('#gl-nid', '1000000503'); await p.click('#glB'); await p.waitForTimeout(600);
D = await data();
ok(/تعذّر الربط/.test(await text('#glE')) && !D.guardian_links.some(l => l.trainee_id === kid.id && l.status === 'verified'), 'الرابط الذي ألغته الإدارة لا يُعاد ذاتيًا');

// القفل بعد 5 محاولات فاشلة
for (let i = 0; i < 4; i++) { await p.fill('#gl-nid', '1000000511'); await p.click('#glB'); await p.waitForTimeout(350); }
await p.fill('#gl-nid', '1000000503'); await p.click('#glB'); await p.waitForTimeout(400);
ok(/تجاوزت عدد المحاولات/.test(await text('#glE')), 'قفل بعد 5 محاولات فاشلة في الساعة');

ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
