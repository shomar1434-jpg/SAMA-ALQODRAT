// الخطوة AD: لوحة التحليلات تحلّل حضور باقات القدرات والتحصيلي لكل قسم (البنون والبنات)
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
import { quduratAnalytics } from '../src/qudurat.js';
const { ok, failed } = reporter();

// منطق الحساب (بلا متصفح)
const n = { date:'2026-11-14', hm:'19:00' };
const D = { schedule_exceptions:[], schedule_templates:[{ section:'boys', dow:6, start:'16:30', end:'18:30' }, { section:'girls', dow:6, start:'18:30', end:'20:30' }, { section:'boys', dow:1, start:'18:00', end:'20:00' }],
  subscriptions:[{ id:'b1', section:'boys', plan_id:'p1', status:'active', start_date:'2026-11-01' }, { id:'b2', section:'boys', plan_id:'p1', status:'active', start_date:'2026-11-01', track_from:'2026-11-10' },
    { id:'b3', section:'boys', plan_id:'p2', status:'pending', start_date:null }, { id:'g1', section:'girls', plan_id:'p2', status:'active', start_date:'2026-11-01' }],
  sub_attendance:[{ subscription_id:'b1', att_date:'2026-11-07', status:'حاضر' }, { subscription_id:'b1', att_date:'2026-11-09', status:'متأخر' }, { subscription_id:'b1', att_date:'2026-11-14', status:'حاضر' },
    { subscription_id:'b2', att_date:'2026-11-14', status:'حاضر' }, { subscription_id:'g1', att_date:'2026-11-14', status:'حاضر' }] };
const Q = quduratAnalytics(D, '2026-11-07', '2026-11-14', n);
ok(Q.boys.sessions === 3 && Q.boys.expected === 1 + 1 + 2, 'البنون: 3 جلسات، والمتابَع من تاريخه فقط يُحتسب بعده (المتوقع 4)');
ok(Q.boys.present === 4 && Q.boys.rate === 100 && Q.boys.late === 1 && Q.boys.lateRate === 25, 'نسبة الحضور والتأخر للبنين');
ok(Q.girls.sessions === 2 && Q.girls.expected === 2 && Q.girls.present === 1 && Q.girls.rate === 50, 'البنات: جلسة اليوم الجارية تُحتسب بعد بدايتها');
ok(Q.boys.active === 2 && Q.boys.pending === 1 && Q.boys.today.present === 2 && Q.boys.today.expected === 2, 'النشطون وبانتظار أول حضور، وحضور اليوم');
ok(Q.boys.byPlan.p1.expected === 4 && Q.boys.byPlan.p1.present === 4, 'التوزيع حسب الباقة');
const Q2 = quduratAnalytics(D, '2026-11-14', '2026-11-14', { date:'2026-11-14', hm:'17:00' });
ok(Q2.girls.sessions === 0 && Q2.boys.sessions === 1, 'الجلسة التي لم تبدأ لا تُحتسب');

// الواجهة
const { server, origin: U } = serveDist();
const b = await chromium.launch(); const p = await (await b.newContext({ viewport:{ width:1280, height:900 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(U + 'admin/#admin'); await p.waitForSelector('#lf'); await p.fill('[name=p]', '1234'); await p.click('#lfGo'); await p.waitForTimeout(1500);
const txt = (await p.textContent('#main')) || '';
ok(/باقات القدرات والتحصيلي/.test(txt) && /قسم البنون/.test(txt) && /قسم البنات/.test(txt), 'لوحة التحليلات فيها قسم الباقات للبنين والبنات');
ok(/نسبة الحضور في الفترة/.test(txt) && /المشتركون النشطون/.test(txt) && /حضور الباقات اليومي/.test(txt) && /نسبة الحضور حسب الباقة/.test(txt), 'مؤشرات الحضور ورسما الباقات');
ok(/الدورات والبرامج/.test(txt) && !!(await p.$('#kpis')), 'قسم الدورات باقٍ');
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs[0] : ''));
await b.close(); server.close(); process.exit(failed() ? 1 : 0);
