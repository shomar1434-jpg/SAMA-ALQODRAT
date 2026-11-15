// الخطوة AS: تقرير ولي الأمر الأسبوعي (البوابة والإدارة) والإشعار الأسبوعي
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
import { weekOf, weeklyNotes, weeklyReport, weeklyText } from '../src/weekly_logic.js';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();

// منطق خالص
const D0 = { trainees:[{ id:'t', full_name:'سعد علي الحربي' }], guardian_links:[{ status:'verified', trainee_id:'t' }], subscriptions:[{ id:'s', trainee_id:'t', status:'active', section:'boys', subjects:['كمي'], plan_id:'p' }],
  plans:[{ id:'p', tier:'silver', name:'فضية' }], schedule_templates:[0, 1, 2, 3, 4].map(dow => ({ section:'boys', dow, start:'16:00', end:'18:00' })), sub_attendance:[{ subscription_id:'s', trainee_id:'t', att_date:'2026-11-15', status:'حاضر' }, { subscription_id:'s', trainee_id:'t', att_date:'2026-11-16', status:'متأخر' }] };
ok(weekOf('2026-11-18').from === '2026-11-15' && weekOf('2026-11-21').to === '2026-11-21', 'الأسبوع من الأحد إلى السبت');
ok(weeklyNotes(D0, { date:'2026-11-19', hm:'18:05' }).length === 1 && !weeklyNotes(D0, { date:'2026-11-19', hm:'17:59' }).length && !weeklyNotes(D0, { date:'2026-11-18', hm:'20:00' }).length, 'الإشعار الأسبوعي يوم الخميس بعد السادسة');
const r0 = weeklyReport(D0, 't', '2026-11-15', { date:'2026-11-17', hm:'19:00' });
ok(r0.attendance.held === 3 && r0.attendance.present === 2 && r0.attendance.late === 1 && r0.attendance.absent[0] === '2026-11-17', 'الحضور: الجلسات المنعقدة والحاضر والمتأخر والغائب');
ok(/حضر سعد ٢ من ٣ جلسات، منها ١ بتأخر/.test(r0.summary.lines[0]) && r0.summary.tips.some(x => /الانتظام/.test(x)), 'الملخص والنصائح');
ok(weeklyReport(D0, 't', '2026-11-15', { date:'2026-11-17', hm:'17:00' }).attendance.held === 2, 'جلسة اليوم لا تُحتسب قبل انتهائها');
ok(/^تقرير الأسبوع/.test(weeklyText(r0)) && /مركز سما القدرات/.test(weeklyText(r0)), 'نص الواتساب');

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const KEY = 'sama_qudrat_v4';
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();
await p.goto(U); await p.waitForTimeout(900);
const D = await p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const link = D.guardian_links.find(l => l.status === 'verified' && D.subscriptions.some(s => s.trainee_id === l.trainee_id));
const st = D.trainees.find(t => t.id === link.trainee_id);

// ---------- بوابة ولي الأمر ----------
await p.goto(U + 'guardian/'); await p.waitForTimeout(700);
await p.fill('#pl-phone', link.guardian_phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(1000);
ok(await p.isVisible('#wkCard') && /تقرير الأسبوع/.test(await text('#wkCard')) && /هذا الأسبوع/.test(await text('#wkCard .wk-nav')), 'بطاقة تقرير الأسبوع في لوحة ولي الأمر');
ok(await p.isDisabled('#wkNext') && (await p.$$('#wkCard .wk-sum p')).length >= 2, 'ملخص الأسبوع ولا أسبوع بعد الحالي');
const w1 = await text('#wkCard .wk-nav b');
await p.click('#wkPrev'); await p.waitForTimeout(300);
ok((await text('#wkCard .wk-nav b')) !== w1 && !(await p.isDisabled('#wkNext')), 'التنقل إلى الأسبوع السابق');
await p.click('#wkPrint'); await p.waitForTimeout(400);
ok(await p.isVisible('#printRoot.on') && /تقرير الأسبوع للمتدرب/.test(await text('#printRoot')) && /مدير المركز/.test(await text('#printRoot')), 'طباعة A4 بترويسة المركز');
await p.click('#pbBack'); await p.waitForTimeout(300);

// ---------- الإدارة ----------
await p.goto(U + 'admin/#admin-trainees'); await p.waitForTimeout(700);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
await p.fill('#tq', st.national_id); await p.waitForTimeout(600);
await p.click(`[data-twr="${st.id}"]`); await p.waitForTimeout(600);
ok(/تقرير الأسبوع · /.test(await text('.modal h3')) && await p.isVisible('.modal .wk-sum'), 'نافذة تقرير الأسبوع في الإدارة');
const wa = await p.getAttribute('#awWa', 'href').catch(() => null);
ok(!st.guardian_phone || (wa && wa.startsWith('https://wa.me/966') && decodeURIComponent(wa).includes('تقرير الأسبوع')), 'زر واتساب برسالة جاهزة (يرسلها المسؤول بنفسه)');

ok(!errs.length, 'لا أخطاء في الصفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
