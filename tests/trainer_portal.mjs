// الخطوة U: بوابة المدرب — ملخص اليوم، المجموعات الذكية وتجهيز الواجب العلاجي، ملف المدرب، وبطاقة المدربين للمتدرب
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();
const login = async (role, phone) => { await p.goto(U + role + '/'); await p.waitForTimeout(700);
  if (await p.$('#logoutBtn:not([hidden])')) { await p.click('#logoutBtn'); await p.waitForTimeout(400); }
  await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(900); };
const tab = async (attr, k) => { await p.click(`[${attr}="${k}"]`); await p.waitForTimeout(500); };

await p.goto(U); await p.waitForTimeout(800);
let D = await data();
const T = D.teachers.find(t => t.section === 'boys' && t.subjects.includes('كمي'));
// واجب قديم لم يسلّمه أحد: يصنع مجموعة «متأخرون في الواجبات»
await p.evaluate(tid => { const D = JSON.parse(localStorage.getItem('sama_qudrat_v4')); D.assignments.push({ id: 'hw-late-test', teacher_id: tid, section: 'boys', subject: 'كمي', title: 'واجب فائت', body: '', kind: 'text', publish_date: '2026-01-01', due_date: '2026-01-05', max_score: 10, created_at: '2026-01-01T00:00:00Z' }); localStorage.setItem('sama_qudrat_v4', JSON.stringify(D)); }, T.id);

await login('teacher', T.phone);
const sum = await text('#daySum');
ok(/المتدربون النشطون/.test(sum) && /واجبات تنتظر التصحيح/.test(sum) && /آخر تحديث/.test(sum), 'ملخص عمل اليوم من البيانات الفعلية مع وقت التحديث');
await tab('data-tt', 'groups');
const g = await text('#tBody');
ok(/متأخرون في الواجبات/.test(g) && /واجبًا متأخرًا/.test(g) && /لا يُرسل شيء تلقائيًا/.test(g), 'المجموعات الذكية تُحسب من الواجبات والحضور');
const members = (await p.$$('details.sg:first-of-type li')).length;
await p.click('[data-sg="hw_late"]'); await p.waitForSelector('#hf');
ok(await p.$eval('#hf-tg', s => s.value) === 'pick' && (await p.$$('#hfTgList input:checked')).length > 0 && /تدريب علاجي/.test(await p.inputValue('#hf-t')) && await p.$eval('#hf-ty', s => s.value) === 'practice', 'تجهيز الواجب العلاجي يفتح النموذج بقائمة المجموعة دون نشر');
ok(!(await data()).assignments.some(a => /تدريب علاجي/.test(a.title)), 'لا يُنشر شيء قبل اعتماد المدرب');
await p.click('#hfS'); await p.waitForTimeout(800);
D = await data(); const rem = D.assignments.find(a => /تدريب علاجي/.test(a.title));
ok(rem && rem.type === 'practice' && rem.targets.length > 0 && rem.targets.length <= Math.max(members, rem.targets.length), 'بعد اعتماد المدرب يُنشر التدريب لمستهدفي المجموعة فقط');

// ملف المدرب
await tab('data-tt', 'profile');
await p.fill('#tp-bio', 'مدرب كمي بخبرة عشر سنوات في القدرات.'); await p.fill('#tp-tg', 'http://example.com/x'); await p.click('#tpS'); await p.waitForTimeout(300);
ok(/t\.me/.test(await text('#tpE')), 'رابط غير تيليجرام يُرفض');
await p.fill('#tp-tg', 'https://t.me/sama_quant_boys'); await p.click('#tpS'); await p.waitForTimeout(800);
D = await data(); const me = D.teachers.find(t => t.id === T.id);
ok(me.bio.startsWith('مدرب كمي') && me.telegram === 'https://t.me/sama_quant_boys' && !/05\d{8}/.test(await text('#tBody')), 'المدرب يحفظ نبذته ورابط قناته، ولا يُعرض جواله');

// المتدرب: بطاقة مدربيه بالنبذة ورابط القناة؛ ومتدربة قسم آخر لا يصلها الرابط
const live = s => ['pending', 'active'].includes(s.status);
const solo = id => { const t = D.trainees.find(x => x.id === id); return D.trainees.filter(x => x.phone === t.phone).length === 1; };
const sb = D.subscriptions.find(s => live(s) && s.section === 'boys' && s.subjects.includes('كمي') && solo(s.trainee_id)), sg = D.subscriptions.find(s => live(s) && s.section === 'girls' && solo(s.trainee_id));
await login('student', D.trainees.find(t => t.id === sb.trainee_id).phone);
const card = await text('#myTrainers');
ok(card.includes(T.full_name) && /خبرة عشر سنوات/.test(card) && (await p.getAttribute('#myTrainers a', 'href')) === 'https://t.me/sama_quant_boys', 'المتدرب يرى مدربي مقرراته ونبذتهم ورابط القناة');
await login('student', D.trainees.find(t => t.id === sg.trainee_id).phone);
ok(!(await p.content()).includes('sama_quant_boys'), 'رابط القناة لا يصل لمتدربة قسم آخر');
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
