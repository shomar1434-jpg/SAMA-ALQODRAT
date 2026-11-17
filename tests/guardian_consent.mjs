// الخطوة BG: موافقة ولي الأمر لمن هم دون 18 سنة (الباقات بسؤال «دون 18؟»، وبرامج الأطفال من تاريخ الميلاد)، ومسودتا الخصوصية والشروط، وسند الاستلام
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
import { POLICY_DRAFTS } from '../src/policy_drafts.js';
import { validatePolicy, PLACEHOLDER } from '../src/policy_logic.js';
import { checkMinorConsent } from '../src/identity_logic.js';
const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const today = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
const years = n => { const d = new Date(Date.now() + 3 * 3600e3); d.setUTCFullYear(d.getUTCFullYear() - n); return d.toISOString().slice(0, 10); };

// المنطق
ok(checkMinorConsent({}, today) === false, 'العميل القديم بلا سؤال العمر لا يُلزم');
ok(checkMinorConsent({ minor:'no' }, today) === false, 'البالغ لا يُلزم');
let m = ''; try { checkMinorConsent({ minor:'yes', guardian_phone:'0501112233' }, today); } catch (e) { m = e.message; }
ok(/إقرار موافقة ولي الأمر/.test(m), 'دون 18 بلا إقرار: مرفوض');
m = ''; try { checkMinorConsent({ minor:'yes', guardian_consent:true }, today); } catch (e) { m = e.message; }
ok(/جوال ولي الأمر/.test(m), 'دون 18 بلا جوال ولي الأمر: مرفوض');
ok(checkMinorConsent({ minor:'yes', guardian_phone:'0501112233', guardian_consent:true }, today) === true, 'دون 18 بالجوال والإقرار: مقبول');
ok(checkMinorConsent({ minor:'no', birth_date:years(8), phone:'0501112233', guardian_consent:true }, today) === true, 'برنامج الأطفال: العمر من تاريخ الميلاد يتقدم على الإجابة، والطفل جوال تواصله لولي أمره');

// المسودات
for (const [slug, d] of Object.entries(POLICY_DRAFTS)) { let e = ''; try { validatePolicy({ slug, ...d, effective_date:today }); } catch (x) { e = x.message; } ok(!e, `مسودة ${slug} صالحة للحفظ`); }
const pv = POLICY_DRAFTS.privacy.body, tm = POLICY_DRAFTS.terms.body;
ok(/فرانكفورت/.test(pv) && /72 ساعة/.test(pv) && /30 يومًا/.test(pv) && /ولي الأمر/.test(pv) && /سدايا/.test(pv) && !pv.includes(PLACEHOLDER), 'الخصوصية: مكان الحفظ، والتسرب، ومدة الرد، والقصّر، والشكوى، ومكتملة للنشر');
ok(tm.includes(PLACEHOLDER) && /سند استلام/.test(tm) && /أنظمة المملكة العربية السعودية/.test(tm), 'الشروط: سند الاستلام والنظام المطبّق، والاسترداد والرقم الضريبي ينتظران الإدارة فلا تُنشر قبل الاستكمال');

// الواجهة
const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
await p.addInitScript(() => { try { localStorage.setItem('sama_skip_reg_intro', '1'); } catch {} });
const errs = []; p.on('pageerror', e => errs.push(e.message));
const data = () => p.evaluate(() => JSON.parse(localStorage.getItem('sama_qudrat_v4')));
const text = async s => ((await p.textContent(s).catch(() => '')) || '').trim();
const nid = async () => p.evaluate(() => window.__SAMA__.makeSaudiId('1'));
const base = async (name, id, phone) => { await p.fill('[name=full_name]', name); await p.fill('[name=national_id]', id); await p.fill('[name=phone]', phone); await p.selectOption('[name=gender]', 'ذكر'); await p.check('[name=agree]'); };

await p.goto(U + '#enroll'); await p.waitForSelector('#en-item');
await p.check('#en-kind-plan', { force: true }); await p.selectOption('#en-item', { index: 1 }); await p.waitForTimeout(150);
ok(await p.isVisible('#rfMinor') && await p.isHidden('#rfConsentL'), 'الباقة تسأل «دون 18؟» والإقرار مخفي حتى الإجابة');
const n1 = await nid(); await base('سلمان فهد علي الشهري', n1, '0557770001');
await p.click('#rfGo'); await p.waitForTimeout(300);
ok(/نعم أو لا/.test(await text('#rfSum')), 'السؤال إلزامي');
await p.check('#rf-minor-yes'); await p.waitForTimeout(100);
ok(await p.isVisible('#rfConsentL') && /<i>\*<\/i>/.test(await p.innerHTML('#rfGuard label')), '«نعم» تُظهر الإقرار وتجعل جوال ولي الأمر إلزاميًا');
await p.click('#rfGo'); await p.waitForTimeout(300);
ok(/جوال ولي الأمر/.test(await text('#rfSum')) && /موافقة ولي الأمر/.test(await text('#rfSum')), 'بلا جوال ولي الأمر ولا إقرار: لا تسجيل');
await p.fill('[name=guardian_phone]', '0509998877'); await p.check('#rf-guardian_consent'); await p.click('#rfGo'); await p.waitForSelector('.refbox');
let D = await data(); let t = D.trainees.find(x => x.national_id === n1);
ok(t && t.guardian_phone === '0509998877' && t.guardian_consent_at, 'اشتراك القاصر محفوظ بجوال ولي الأمر ووقت إقراره');

await p.goto(U + '#enroll'); await p.reload(); await p.waitForSelector('#en-item');
await p.check('#en-kind-plan', { force: true }); await p.selectOption('#en-item', { index: 1 }); await p.waitForTimeout(150);
const n2 = await nid(); await base('ماجد سعد علي الغامدي', n2, '0557770002'); await p.check('#rf-minor-no'); await p.click('#rfGo'); await p.waitForSelector('.refbox');
D = await data(); t = D.trainees.find(x => x.national_id === n2);
ok(t && !t.guardian_consent_at && !t.guardian_phone, 'البالغ يشترك دون جوال ولي الأمر ولا إقرار');

// برنامج أطفال: الإقرار من تاريخ الميلاد
const kid = await p.evaluate(() => window.__SAMA__.LocalStore.data.programs.find(x => String(x.accreditation_no) === '25194')?.id);
if (kid) {
  await p.goto(U + '#enroll'); await p.reload(); await p.waitForSelector('#en-item'); await p.check('#en-kind-program', { force: true });
  await p.selectOption('#en-item', kid).catch(() => {}); await p.waitForTimeout(150);
  if (await p.isVisible('[name=birth_date]')) {
    const n3 = await nid(); await base('ريان خالد علي الزهراني', n3, '0557770003');
    await p.fill('[name=birth_date]', years(8)); await p.dispatchEvent('[name=birth_date]', 'change');
    await p.selectOption('[name=city]', { index: 1 }); await p.selectOption('[name=education]', { index: 1 }); await p.waitForTimeout(100);
    ok(await p.isVisible('#rfConsentL') && await p.isHidden('#rfMinor'), 'برنامج الأطفال: الإقرار يظهر من تاريخ الميلاد دون سؤال العمر');
    await p.click('#rfGo'); await p.waitForTimeout(300);
    ok(/موافقة ولي الأمر/.test(await text('#rfSum')), 'برنامج الأطفال بلا إقرار: لا تسجيل');
    await p.check('#rf-guardian_consent'); await p.click('#rfGo'); await p.waitForTimeout(900);
    D = await data(); t = D.trainees.find(x => x.national_id === n3);
    ok(t && t.guardian_consent_at, 'تسجيل الطفل بإقرار ولي الأمر محفوظ');
  }
}
ok(!errs.length, 'لا أخطاء في الصفحات' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
console.log('PASS guardian_consent');
