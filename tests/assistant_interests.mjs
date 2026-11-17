// الخطوة BE: «أبلغوني» بالموافقة، وعدّ الاستفسارات، وتنبيه «مجال للتسجيل» بعد 10 دون فتح آلي، وحملات الإرسال شبه الآلي
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
import { matchProduct, checkInterest, campaignText, campaignTargets, demandRows } from '../src/interest_logic.js';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();

// منطق خالص
const P = [{ kind: 'plan', id: 'g', name: 'الذهبية', tier: 'gold', mode: 'in_person' }, { kind: 'program', id: 'r', name: 'برنامج مهارات القراءة والكتابة للأطفال' }];
ok(matchProduct('كم سعر الباقة الذهبية؟', P)?.id === 'g' && matchProduct('متى يبدأ برنامج القراءة والكتابة', P)?.id === 'r' && matchProduct('السلام عليكم', P) === null, 'تحديد المنتج من السؤال');
let e = ''; try { checkInterest({ full_name: 'سارة', phone: '0551112233', kind: 'plan', ref_id: 'g' }); } catch (x) { e = x.message; }
ok(/وافق/.test(e), 'الموافقة إلزامية');
ok(checkInterest({ full_name: ' سارة  علي ', phone: '٠٥٥١١١٢٢٣٣', kind: 'plan', ref_id: 'g', consent: true }).phone === '0551112233', 'الأرقام العربية تُحوَّل');
ok(/مجالًا للتسجيل في «الذهبية»/.test(campaignText({ kind: 'availability' }, { full_name: 'سارة علي' }, 'الذهبية')) && /إيقاف/.test(campaignText({ kind: 'offer', title: 'خصم', message: 'تفاصيل' }, { full_name: 'س' }, '')), 'نص الرسائل وخيار الإيقاف');
const I = [{ id: 'a', kind: 'plan', ref_id: 'g', active: true }, { id: 'b', kind: 'plan', ref_id: 'g', active: false }, { id: 'c', kind: 'program', ref_id: 'r', active: true }];
ok(campaignTargets({ id: 'k', product_kind: 'plan', ref_id: 'g' }, I, [{ campaign_id: 'k', interest_id: 'a' }]).left.length === 0 && campaignTargets({ id: 'z', ref_id: null }, I, []).rows.length === 2, 'المستهدفون: النشطون فقط، والمرسل لا يتكرر');
ok(demandRows(P, Array.from({ length: 11 }, () => ({ kind: 'plan', ref_id: 'g', created_at: '2026-11-17' })), I, [], 10)[0].high, 'الحادي عشر = إقبال مرتفع');

const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => { window.__opened = []; window.open = u => { window.__opened.push(String(u)); return null; }; });
let p = await ctx.newPage();
const errs = []; p.on('pageerror', x => errs.push(x.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
await p.goto(U + '#home'); await p.waitForSelector('#assistantToggle');
let D = await data();
const prog = D.programs.find(x => x.active !== false && x.name.split(' ').length >= 3);
const openReg = (D.cohorts || []).filter(c => c.program_id === prog.id).map(c => c.reg_open);
const ask = async q => { await p.fill('#assistantQuestion', q); await p.click('#assistantAsk button'); await p.waitForFunction(() => document.querySelector('#assistantToggle').dataset.state === 'done'); await p.waitForTimeout(300); };
await p.click('#assistantToggle'); await p.waitForSelector('#assistantPanel:not([hidden])');
await ask('متى يبدأ ' + prog.name + '؟');
ok(await p.locator('[data-as="notify"]').count() === 1 && (await p.textContent('[data-as="notify"]')).includes(prog.name), 'زر «أبلغوني» للبرنامج المسؤول عنه');
D = await data();
ok((D.assistant_inquiries || []).filter(x => x.ref_id === prog.id).length === 1, 'الاستفسار يُعدّ بلا رقم');
await ask('متى يبدأ ' + prog.name + '؟');
ok((await data()).assistant_inquiries.filter(x => x.ref_id === prog.id).length === 1, 'المحادثة نفسها لا تُحتسب مرتين');
await p.click('[data-as="notify"] >> nth=-1'); await p.waitForSelector('.as-form');
await p.fill('#asiN', 'سارة علي القحطاني'); await p.fill('#asiM', '0551112233'); await p.click('#asiS'); await p.waitForTimeout(200);
ok(/وافق/.test(await p.textContent('#asiE')), 'لا يُحفظ دون موافقة');
await p.check('#asiC'); await p.click('#asiS'); await p.waitForTimeout(400);
D = await data();
ok(D.assistant_interests.length === 1 && D.assistant_interests[0].phone === '0551112233' && D.assistant_interests[0].ref_id === prog.id && /سجّلنا اهتمامك/.test(await p.textContent('#assistantMessages')), 'حُفظ المهتم بالبرنامج الذي سأل عنه');
// عشرة استفسارات أخرى ثم محادثة جديدة
await p.evaluate(id => { const d = JSON.parse(localStorage.getItem('sama_qudrat_v4')); for (let i = 0; i < 10; i++) d.assistant_inquiries.push({ id: 'x' + i, session_id: 'other-session-' + i, kind: 'program', ref_id: id, created_at: new Date().toISOString() }); localStorage.setItem('sama_qudrat_v4', JSON.stringify(d)); sessionStorage.removeItem('sama_as_sid'); }, prog.id);
await p.reload(); await p.waitForSelector('#assistantToggle'); await p.click('#assistantToggle'); await p.waitForSelector('#assistantPanel:not([hidden])');
await ask('أرغب في ' + prog.name);
await p.waitForTimeout(400);
ok(/مجال للتسجيل/.test(await p.textContent('#assistantMessages')) && /966561606878/.test(await p.getAttribute('[data-as="wa"]', 'href')), 'بعد العاشر: إخبار السائل بأن هناك مجالًا للتسجيل مع واتساب المركز');
D = await data();
ok(JSON.stringify((D.cohorts || []).filter(c => c.program_id === prog.id).map(c => c.reg_open)) === JSON.stringify(openReg), 'لا يُفتح التسجيل آليًا');
ok(D.assistant_demand.find(x => x.ref_id === prog.id).alerted_at, 'تنبيه الإدارة مسجّل');

// الإدارة
await p.goto(U + 'admin/#admin-assistant'); await p.reload(); await p.waitForTimeout(600);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
await p.waitForTimeout(500);
ok(await p.locator('.side a[href="#admin-assistant"] .badge-n').count() === 1, 'شارة تنبيه «إقبال مرتفع» في القائمة');
await p.click('[data-ast="int"]'); await p.waitForSelector('#dmT');
ok(/إقبال مرتفع/.test(await p.textContent('#dmT')) && (await p.textContent('#inT')).includes('0551112233'), 'الطلب والمهتمون في «المهتمون والطلب»');
await p.click(`[data-av="program:${prog.id}"]`); await p.waitForSelector('#cpNext');
await p.click('#cpNext'); await p.waitForTimeout(400);
const opened = await p.evaluate(() => window.__opened);
ok(opened.length === 1 && /wa\.me\/966551112233/.test(opened[0]) && /مجالًا للتسجيل/.test(decodeURIComponent(opened[0])), 'زر الإرسال يفتح واتساب برسالة الإتاحة الجاهزة');
D = await data();
ok(D.assistant_sends.length === 1 && !(await p.$('#cpNext')), 'المرسَل يُعلَّم ولا يتكرر');
await p.click('#cpX'); await p.waitForSelector('#ofNew');
await p.click('#ofNew'); await p.fill('#of-t', 'خصم نهاية العام'); await p.fill('#of-m', 'خصم 15٪ حتى نهاية ديسمبر'); await p.click('#ofS'); await p.waitForSelector('#cpX');
ok((await data()).assistant_campaigns.some(c => c.kind === 'offer' && c.title === 'خصم نهاية العام'), 'إنشاء حملة عرض');
await p.click('#cpX'); await p.waitForSelector('#inT');
await p.click('[data-ia$=":0"]'); await p.waitForTimeout(500);
ok((await data()).assistant_interests[0].active === false, 'إيقاف الرسائل للمهتم');
ok(!errs.length, 'لا أخطاء' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
