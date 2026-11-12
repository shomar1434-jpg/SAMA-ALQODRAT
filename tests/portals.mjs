// البوابات: المتدرب، والمدرب، وولي الأمر — الدخول بالدور، وحصر البيانات، والإشعارات، وتنبيه ما قبل النهاية.
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 900 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const KEY = 'sama_qudrat_v4';
const data = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const edit = async fn => { await p.evaluate(([k, src]) => { const D = JSON.parse(localStorage.getItem(k)); (new Function('D', src))(D); localStorage.setItem(k, JSON.stringify(D)); }, [KEY, fn]); };
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();
const login = async (role, phone, code = '1234') => {
  await p.goto(U + role + '/'); await p.waitForTimeout(700);
  if (await p.$('#logoutBtn:not([hidden])')) { await p.click('#logoutBtn'); await p.waitForTimeout(500); }
  await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300);
  await p.fill('#pl-code', code); await p.click('#plB'); await p.waitForTimeout(900);
};

await p.goto(U + '#portals'); await p.waitForTimeout(900);
ok(await p.$$eval('.portal-card', x => x.length) === 3, 'صفحة اختيار البوابات');

// جلسة بنين جارية تنتهي بعد 10 دقائق (لتنبيه ما قبل النهاية)
await edit(`const n=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Riyadh'})); const m=n.getHours()*60+n.getMinutes(); const f=x=>String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0');
  D.schedule_templates=D.schedule_templates.filter(x=>!(x.section==='boys'&&x.dow===n.getDay())); D.schedule_templates.push({id:'tl',section:'boys',dow:n.getDay(),start:f(Math.max(0,m-60)),end:f(Math.min(1439,m+10))});`);

// ---------- المدرب ----------
await login('teacher', '0501000003', '0000');
ok(/غير صحيح/.test(await text('#plE')), 'رفض رمز تحقق خاطئ');
await login('teacher', '0559999999');
ok(/غير مرتبط بحساب مدرب/.test(await text('#plE')), 'رفض رقم غير مرتبط بدور المدرب');
await login('teacher', '0501000003');
const D0 = await data(), teacher = D0.teachers.find(t => t.phone === '0501000003');
const expected = D0.subscriptions.filter(s => s.section === teacher.section && ['pending', 'active'].includes(s.status) && s.subjects.some(x => teacher.subjects.includes(x))).length;
const rows = await p.$$eval('#tSheet tbody tr', x => x.length);
ok(rows > 0 && rows <= expected, `المدرب يرى متدربي قسمه ومقرره فقط (${rows})`);
const leak = await p.evaluate(() => [...document.querySelectorAll('#tSheet tbody tr td:first-child')].map(td => td.textContent));
const girls = D0.subscriptions.filter(s => s.section === 'girls').map(s => D0.trainees.find(t => t.id === s.trainee_id).full_name);
ok(!leak.some(n => girls.includes(n.trim())), 'لا يظهر متدربي قسم البنات لمدرب البنين');
ok(/أقل من/.test(await text('.alert')), 'تنبيه ما قبل نهاية الجلسة بمن لم يسجل');
await p.click('#tRemind'); await p.waitForTimeout(900);
const reminders = (await data()).notifications.filter(x => x.kind === 'reminder').length;
ok(reminders > 0, 'إرسال تذكير للمتدربين غير المحضَّرين');
await p.reload(); await p.waitForTimeout(900);
if (await p.$('#tRemind')) { await p.click('#tRemind'); await p.waitForTimeout(900); }
ok((await data()).notifications.filter(x => x.kind === 'reminder').length === reminders, 'لا يتكرر التذكير في اليوم نفسه');

// إشعار ولي الأمر
const withG = await p.$('[data-tn]:not([disabled])');
let guardianPhone = null;
if (withG) {
  const tid = await withG.getAttribute('data-tn'); guardianPhone = D0.guardian_links.find(l => l.trainee_id === tid)?.guardian_phone;
  await withG.click(); await p.waitForTimeout(300); await p.selectOption('#nf-kind', 'absence'); await p.fill('#nf-note', 'نرجو التواصل'); await p.click('#nfS'); await p.waitForTimeout(700);
  ok((await data()).notifications.some(x => x.to === 'guardian' && x.trainee_id === tid && x.kind === 'absence'), 'المدرب يرسل إشعار غياب لولي الأمر الموثّق');
} else {
  // ربط ولي أمر لطالب من متدربي هذا المدرب ثم الإرسال
  const s = D0.subscriptions.find(s => s.section === teacher.section && s.subjects.some(x => teacher.subjects.includes(x)));
  guardianPhone = '0508887766';
  await edit(`D.guardian_links.push({id:'gx',guardian_name:'ولي أمر',guardian_phone:'0508887766',trainee_id:'${s.trainee_id}',relation:'الأب',status:'verified',created_at:new Date().toISOString()});`);
  await p.reload(); await p.waitForTimeout(900); await p.click(`[data-tn="${s.trainee_id}"]`); await p.waitForTimeout(300); await p.click('#nfS'); await p.waitForTimeout(700);
  ok((await data()).notifications.some(x => x.to === 'guardian' && x.trainee_id === s.trainee_id), 'المدرب يرسل إشعارًا لولي الأمر الموثّق');
}

// ---------- ولي الأمر ----------
await login('guardian', guardianPhone);
ok(await p.$('.ind3') && /متابعة/.test(await text('#app')), 'ولي الأمر يرى لوحة ابنه بالمؤشرات الثلاثة');
ok(await p.$('.ntf li'), 'ولي الأمر يرى إشعارات المدرب');
await login('guardian', '0559999998');
ok(/غير مرتبط بحساب ولي أمر/.test(await text('#plE')), 'لا وصول لولي أمر دون رابط موثّق');

// ---------- المتدرب ----------
const D1 = await data(), stSub = D1.subscriptions.find(s => s.start_date), st = D1.trainees.find(t => t.id === stSub.trainee_id);
await login('student', st.phone);
const cards = await p.$$eval('.ind3 .ind', x => x.length);
ok(cards === 3, 'لوحة المتدرب: ثلاث بطاقات مستقلة');
ok(/لا توجد واجبات مستحقة بعد/.test(await text('.ind3')), 'الواجبات بلا مستحقات لا تظهر 0٪');
ok(/يومًا متبقية/.test(await text('.ind3')), 'المؤقت الزمني للباقة');
ok(await p.$('.ses-list li'), 'الجلسات القادمة');

// ---------- الإدارة: المدربون وأولياء الأمور ----------
await p.goto(U + 'admin/#admin'); await p.waitForTimeout(800); await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1000);
await p.evaluate(() => { location.hash = '#admin-users'; }); await p.waitForTimeout(900);
await p.click('#tAdd'); await p.waitForTimeout(300); await p.fill('#tf-name', 'سعيد علي الفيفي'); await p.fill('#tf-phone', '0501000099'); await p.check('#tf input[value=كمي]'); await p.click('#tfS'); await p.waitForTimeout(700);
ok((await data()).teachers.some(t => t.phone === '0501000099'), 'إضافة مدرب');
await p.click('[data-ut=guardians]'); await p.waitForTimeout(400); await p.click('#gAdd'); await p.waitForTimeout(300);
await p.fill('#gf-nid', st.national_id); await p.fill('#gf-name', 'محمد علي'); await p.fill('#gf-phone', '0507776655'); await p.click('#gfS'); await p.waitForTimeout(400);
ok(/أكّد التحقق/.test(await text('#gfE')), 'الربط يتطلب تأكيد التحقق من الصلة');
await p.check('#gf input[name=verified]'); await p.click('#gfS'); await p.waitForTimeout(700);
ok((await data()).guardian_links.some(l => l.guardian_phone === '0507776655' && l.status === 'verified'), 'ربط ولي أمر موثّق');

ok(errs.length === 0, 'لا أخطاء في الصفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
