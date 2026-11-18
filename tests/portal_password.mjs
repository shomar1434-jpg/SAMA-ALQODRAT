// الخطوة BJ: كلمة مرور البوابات (أول دخول برمز التحقق ثم كلمة مرور، والدخول من أي جهاز، ونسيت كلمة المرور، والخروج من الأجهزة الأخرى)
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';
import { pwOk, checkPassword } from '../src/device_logic.js';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
ok(!pwOk('short1') && !pwOk('abcdefgh') && !pwOk('12345678') && pwOk('Sama2026x'), 'قاعدة كلمة المرور: 8 أحرف فأكثر، حرف ورقم');
let m = ''; try { checkPassword('Sama2026x', 'Sama2026y'); } catch (e) { m = e.message; } ok(/غير متطابقتين/.test(m), 'التأكيد يطابق');

const b = await chromium.launch();
const p = await (await b.newContext({ viewport: { width: 1280, height: 860 } })).newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('dialog', d => d.accept());
const KEY = 'sama_qudrat_v4';
const data = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();
const active = async ph => (await data()).devices.filter(d => d.phone === ph && d.role === 'student' && !d.revoked_at).length;
const newDevice = async () => { await p.evaluate(k => { localStorage.removeItem(k + '_dev_student'); localStorage.removeItem('sama_pw_known_student'); sessionStorage.removeItem(k + '_p_student'); }, KEY); await p.reload(); await p.waitForSelector('#pl-phone'); };
const openWindow = async ph => { await p.evaluate(([k, x]) => { const D = JSON.parse(localStorage.getItem(k)); D.act_windows = D.act_windows || [];
  D.act_windows.push({ id:'w' + Date.now(), phone:x, role:'student', created_at:new Date().toISOString(), expires_at:new Date(Date.now() + 900000).toISOString(), used_at:null, revoked:false });
  localStorage.setItem(k, JSON.stringify(D)); }, [KEY, ph]); await p.reload(); await p.waitForSelector('#pl-phone'); };
const codeLogin = async nid => { await p.fill('#pl-phone', nid); await p.click('#plB'); await p.waitForSelector('#otpF:not([hidden])');
  const c = (await text('#otpShow b')).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)); await p.fill('#pl-code', c); await p.click('#plB'); };

await p.goto(U); await p.waitForTimeout(800);
const D = await data();
const st = D.trainees.find(t => D.subscriptions.some(s => s.trainee_id === t.id && ['pending', 'active'].includes(s.status)) && D.trainees.filter(x => x.phone === t.phone).length === 1);

// أول دخول: تفعيل الإدارة ← رمز ← تعيين كلمة المرور إلزاميًا
await p.goto(U + 'student/'); await p.waitForSelector('#pl-phone');
ok(await p.isVisible('#plPw') && !(await p.$('#plLinkT')), 'شاشة الدخول: رمز التحقق والانتقال لكلمة المرور (بلا رمز الربط)');
await openWindow(st.phone); await codeLogin(st.national_id);
await p.waitForSelector('#ps-new');
ok(await p.isHidden('#logoutBtn') || !(await p.$('#sBody')), 'لا بوابة قبل تعيين كلمة المرور');
await p.fill('#ps-new', 'Sama2026x'); await p.fill('#ps-conf', 'Sama2026y'); await p.click('#psGo'); await p.waitForTimeout(200);
ok(/غير متطابقتين/.test(await text('#psE')), 'عدم التطابق مرفوض');
await p.fill('#ps-new', 'abcdefgh'); await p.fill('#ps-conf', 'abcdefgh'); await p.click('#psGo'); await p.waitForTimeout(200);
ok(/حرف ورقم/.test(await text('#psE')) && await p.getAttribute('#ps-new', 'aria-invalid') === 'true', 'كلمة ضعيفة مرفوضة');
await p.click('[data-eye="ps-new"]'); ok(await p.getAttribute('#ps-new', 'type') === 'text', 'إظهار كلمة المرور');
await p.fill('#ps-new', 'Sama2026x'); await p.fill('#ps-conf', 'Sama2026x'); await p.click('#psGo');
await p.waitForSelector('#logoutBtn:not([hidden])'); await p.waitForSelector('#devBtn:not([hidden])');
ok(!JSON.stringify((await data()).portal_passwords).includes('Sama2026x'), 'كلمة المرور مجزّأة');

// جهاز آخر بالهوية وكلمة المرور
await newDevice();
await p.click('#plPw'); await p.waitForSelector('#pl-pass');
ok(await p.isVisible('#plFirst') && await p.isVisible('#plForgot'), '«أول دخول برمز التحقق» و«نسيت كلمة المرور»');
await p.fill('#pl-phone', st.national_id); await p.fill('#pl-pass', 'Wrong2026x'); await p.click('#plB'); await p.waitForTimeout(300);
ok(/غير صحيحة/.test(await text('#plE')) && await p.isHidden('#logoutBtn'), 'كلمة خاطئة لا تدخل');
await p.fill('#pl-pass', 'Sama2026x'); await p.click('#plB'); await p.waitForSelector('#logoutBtn:not([hidden])');
ok(await active(st.phone) === 2 && !(await p.$('#ps-new')), 'الدخول من جهاز آخر بالهوية وكلمة المرور');

// تغيير كلمة المرور يلزم الحالية
await p.click('#devBtn'); await p.waitForSelector('#cp-cur');
await p.fill('#cp-cur', 'Bad2026xx'); await p.fill('#cp-new', 'Next2026x'); await p.fill('#cp-conf', 'Next2026x'); await p.click('#cpGo'); await p.waitForTimeout(300);
ok(/الحالية غير صحيحة/.test(await text('#cpE')), 'التغيير يلزم الحالية');
await p.click('#dvX');

// نسيت كلمة المرور: تفعيل جديد ← رمز ← كلمة جديدة ← تخرج الأجهزة الأخرى
await newDevice(); await p.click('#plPw'); await p.waitForSelector('#plForgot'); await p.click('#plForgot');
ok(/نسيت كلمة المرور/.test(await text('#plModeH')), 'شرح «نسيت كلمة المرور»');
await openWindow(st.phone); await codeLogin(st.national_id); await p.waitForSelector('#ps-new');
ok(/جديدة/.test(await text('.login h2')), 'بعد التفعيل الجديد تُطلب كلمة جديدة');
await p.fill('#ps-new', 'New2026pass'); await p.fill('#ps-conf', 'New2026pass'); await p.click('#psGo'); await p.waitForSelector('#logoutBtn:not([hidden])');
ok(await active(st.phone) === 1, 'الكلمة الجديدة تُلغي التفعيل السابق (يبقى هذا الجهاز)');
await newDevice(); await p.click('#plPw'); await p.fill('#pl-phone', st.national_id); await p.fill('#pl-pass', 'Sama2026x'); await p.click('#plB'); await p.waitForTimeout(300);
ok(/غير صحيحة/.test(await text('#plE')), 'الكلمة القديمة لم تعد تعمل');
await p.fill('#pl-pass', 'New2026pass'); await p.click('#plB'); await p.waitForSelector('#logoutBtn:not([hidden])');

// الخروج من الأجهزة الأخرى
await newDevice(); await p.click('#plPw'); await p.fill('#pl-phone', st.national_id); await p.fill('#pl-pass', 'New2026pass'); await p.click('#plB'); await p.waitForSelector('#logoutBtn:not([hidden])');
ok(await active(st.phone) === 3, 'ثلاثة أجهزة');
await p.click('#devBtn'); await p.waitForSelector('#dvOthers:not([disabled])'); await p.click('#dvOthers'); await p.waitForTimeout(500);
ok(await active(st.phone) === 1 && await p.isVisible('#logoutBtn'), 'الخروج من الأجهزة الأخرى ويبقى هذا الجهاز');

// قرار المالك: بعد أول دخول تعرض الشاشة على هذا الجهاز الهوية وكلمة المرور فقط
await p.click('#logoutBtn'); await p.waitForSelector('#pl-phone');
ok(await p.isVisible('#pl-pass') && !(await p.$('#plFirst')) && await p.isVisible('#plForgot'), 'جهاز دخل من قبل: الهوية وكلمة المرور، بلا «أول دخول برمز التحقق»');
await newDevice(); await p.click('#plPw'); await p.waitForSelector('#pl-pass');
ok(await p.isVisible('#plFirst'), 'الجهاز الجديد يعرض «أول دخول برمز التحقق»');

ok(!errs.length, 'بلا أخطاء صفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
