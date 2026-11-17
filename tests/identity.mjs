// الخطوة A: إعادة التسجيل بسجل مدني موجود لا تستولي على ملف المتدرب ولا بوابته
import { chromium } from 'playwright';
import { serveDist, reporter, autoConsent } from './_server.mjs';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1366, height: 900 } })).newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.addInitScript(() => { try { localStorage.setItem('sama_skip_reg_intro', '1'); } catch {} });   // شاشة التعليمات تُختبر في home_courses
const S = (fn, a) => p.evaluate(fn, a);
const go = async (h, w = 900) => { await p.evaluate(() => { location.hash = '#zz'; }); await p.waitForTimeout(150); await p.evaluate(x => { location.hash = '#' + x; }, h); await p.waitForTimeout(w); };
await p.goto(U); await p.waitForTimeout(1000);
const ctx = await S(() => { const { LocalStore, cohortArchived, progCode, takenOf } = window.__SAMA__, D = LocalStore.data, t = D.trainees.find(x => x.phone === '0550000001');
  const c = D.cohorts.find(c => !cohortArchived(c) && c.reg_open && takenOf(D, c.id) < c.seats && !D.enrollments.some(e => e.cohort_id === c.id && e.trainee_id === t.id));
  return { nid:t.national_id, name:t.full_name, code:progCode(D.programs.find(x => x.id === c.program_id)), n0:D.trainees.length }; });

// شخص آخر يعرف السجل المدني يسجّل بجواله واسمه
await go(ctx.code, 800); await p.waitForSelector('.tab[data-t=reg]', { timeout:10000 }); await p.click('.tab[data-t=reg]'); await p.waitForSelector('[name=full_name]');
await p.fill('[name=full_name]', 'منتحل الشخصية الكامل'); await p.fill('[name=national_id]', ctx.nid); await p.fill('[name=phone]', '0559990000');
await p.selectOption('[name=gender]', 'ذكر'); await p.fill('[name=birth_date]', '1995-01-01', { timeout: 400 }).catch(() => {}); await p.selectOption('[name=city]', { index: 1 }, { timeout: 400 }).catch(() => {}); await p.selectOption('[name=education]', { index: 1 }, { timeout: 400 }).catch(() => {}); await p.check('[name=agree]');
await autoConsent(p); await p.click('#rfGo'); await p.waitForTimeout(800);
const st = await S(n => { const D = window.__SAMA__.LocalStore.data, t = D.trainees.find(x => x.national_id === n);
  return { phone:t.phone, name:t.full_name, count:D.trainees.filter(x => x.national_id === n).length, total:D.trainees.length, req:(D.profile_change_requests || []).filter(r => r.trainee_id === t.id && r.status === 'pending') }; }, ctx.nid);
ok(await p.$('.refbox'), 'التسجيل الإضافي يُقبل في الملف نفسه');
ok(st.phone === '0550000001' && st.name === ctx.name, 'الجوال والاسم المعتمدان لم يتغيرا');
ok(st.count === 1 && st.total === ctx.n0, 'لا ملف متدرب مكرر');
ok(st.req.length === 1 && st.req[0].changes.phone?.new === '0559990000' && st.req[0].changes.full_name, 'طلب تحديث بيانات بالفروق');

// الجوال الجديد لا يفتح بوابة المتدرب
await p.goto(U + 'student/'); await p.waitForTimeout(700); await p.fill('#pl-phone', '0559990000'); await p.click('#plB'); await p.waitForTimeout(400);
await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(800);
ok(/غير مرتبط/.test(await p.innerText('#app')) && !(await p.$('#logoutBtn:not([hidden])') && await p.$('.portal-hero')), 'الجوال غير المعتمد لا يدخل البوابة');

// الإدارة تبت في الطلب
await p.goto(U + 'admin/#admin-trainees'); await p.waitForTimeout(900);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
ok(await p.$('.pcr') && (await p.innerText('.pcr')).includes('0559990000'), 'الطلب ظاهر في صفحة المتدربين');
await p.click('[data-pcr][data-ok="0"]'); await p.waitForTimeout(300); await p.click('.modal button:has-text("رفض")'); await p.waitForTimeout(800);
const after = await S(n => { const D = window.__SAMA__?.LocalStore?.data || JSON.parse(localStorage.getItem('sama_qudrat_v4')), t = D.trainees.find(x => x.national_id === n);
  return { phone:t.phone, st:(D.profile_change_requests || []).find(r => r.trainee_id === t.id)?.status }; }, ctx.nid);
ok(after.phone === '0550000001' && after.st === 'rejected' && !(await p.$('.pcr')), 'الرفض يُبقي الملف ويخفي الطلب');
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
