// الخطوة AQ: محاكي الاختبار، والتدريب بالمهارة، وتصنيف مهارات البنك
import { chromium } from 'playwright';
import { serveDist, reporter } from './_server.mjs';

const { server, origin: U } = serveDist();
const { ok, failed } = reporter();
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 860 } });
const p = await ctx.newPage();
const errs = []; p.on('pageerror', e => errs.push(e.message));
const KEY = 'sama_qudrat_v4';
const data = () => p.evaluate(k => JSON.parse(localStorage.getItem(k)), KEY);
const put = async fn => { await p.evaluate(([k, f]) => { const D = JSON.parse(localStorage.getItem(k)); new Function('D', f)(D); localStorage.setItem(k, JSON.stringify(D)); }, [KEY, `(${fn})(D)`]); };
const text = async sel => ((await p.textContent(sel).catch(() => '')) || '').trim();
const login = async (role, phone) => {
  await p.goto(U + role + '/'); await p.waitForTimeout(700);
  if (await p.$('#logoutBtn:not([hidden])')) { await p.click('#logoutBtn'); await p.waitForTimeout(400); }
  await p.fill('#pl-phone', phone); await p.click('#plB'); await p.waitForTimeout(300); await p.fill('#pl-code', '1234'); await p.click('#plB'); await p.waitForTimeout(900);
};
const level = async () => { await p.click('[data-st="level"]'); await p.waitForTimeout(600); };

await p.goto(U); await p.waitForTimeout(900);
let D = await data();
const live = s => ['pending', 'active'].includes(s.status) && (!s.end_date || s.end_date >= new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10));
const sub = D.subscriptions.find(s => s.section === 'boys' && live(s) && s.subjects.includes('كمي') && s.subjects.includes('لفظي') && D.trainees.filter(t => t.phone === D.trainees.find(x => x.id === s.trainee_id).phone).length === 1);
const st = D.trainees.find(t => t.id === sub.trainee_id);
ok(D.questions.some(q => q.category === 'الجبر') && D.questions.some(q => q.category === 'التناظر اللفظي'), 'أسئلة النسخة التجريبية مصنّفة بمهارات قياس');

// ---------- بدء المحاكي ----------
await login('student', st.phone); await level();
ok(await p.isVisible('.sim-card') && (await p.$$('#simF [name=sub]')).length === 2, 'بطاقة المحاكي بقسمي اللفظي والكمي');
ok(/سؤالًا · .*دقيقة/.test(await text('#simMeta')), 'عدد الأسئلة والوقت قبل البدء');
await p.click('#simGo'); await p.waitForTimeout(300);
ok(/يبدأ الوقت الآن/.test(await text('.modal')), 'تنبيه القواعد قبل البدء');
await p.click('#smGo'); await p.waitForTimeout(800);
ok(await p.isVisible('#simRoot') && /\d+:\d\d/.test(await text('#simT')), 'شاشة المحاكي بالوقت المتبقي');
D = await data();
let at = D.attempts.find(a => a.kind === 'sim' && a.trainee_id === st.id);
ok(at && at.deadline && at.total === at.snapshot.length && at.snapshot[0].subject === 'لفظي' && at.snapshot.slice(-1)[0].subject === 'كمي', 'محاولة محاكٍ بمهلة، اللفظي ثم الكمي');
const expl = at.snapshot.map(q => q.explanation).filter(Boolean);
ok(!expl.some(e => (p.content && false) || false) && !(await p.content()).includes(expl[0]), 'لا تفسير ولا مفتاح في الشاشة قبل التسليم');
ok(/القسم ١ من ٢/.test(await text('.sim-h')), 'القسم الحالي ظاهر');

// إجابة وحفظ أولًا بأول، وتعليم، وخريطة الأسئلة
await p.click('.sim-opt >> nth=1'); await p.waitForTimeout(1200);
D = await data(); at = D.attempts.find(a => a.id === at.id);
ok(at.answers[at.snapshot[0].id] === 1, 'تُحفظ الإجابة في الخادم أولًا بأول');
await p.click('#simFlag'); await p.waitForTimeout(150);
ok(/معلَّم للمراجعة/.test(await text('#simFlag')), 'تعليم السؤال للمراجعة');
await p.click('#simNext'); await p.waitForTimeout(150);
ok(/٢ \/ /.test(await text('.sim-qh')), 'التنقل للسؤال التالي');
await p.click('#simMapB'); await p.waitForTimeout(150);
ok(await p.isVisible('#simMap') && (await p.$$('#simMap .sim-grid .sim-n.a')).length === 1 && (await p.$$('#simMap .sim-grid .sim-n.f')).length === 1, 'الخريطة تعرض المُجاب والمعلَّم');
const lastIdx = at.snapshot.length - 1;
await p.click(`#simMap [data-go="${lastIdx}"]`); await p.waitForTimeout(200);
ok(await p.isVisible('#simEnd') && /القسم ٢ من ٢/.test(await text('.sim-h')), 'الانتقال من الخريطة إلى آخر سؤال في قسم الكمي');
const q = at.snapshot[lastIdx];
await p.click(`.sim-opt >> nth=${q.correct}`); await p.waitForTimeout(1100);

// خروج مؤقت ثم استئناف
await p.click('#simOut'); await p.waitForTimeout(900);
ok(!(await p.$('#simRoot')) && await p.isVisible('#simResume'), 'الخروج المؤقت يبقي المحاكي مفتوحًا للاستئناف');
await p.click('#simResume'); await p.waitForTimeout(700);
ok(await p.isVisible('#simRoot') && (await p.$$('.sim-opt.on')).length === 1, 'الاستئناف يعيد الإجابات والموضع');

// التسليم والنتيجة
await p.click('#simMapB'); await p.click('#simEnd2'); await p.waitForTimeout(200);
ok(/أجبت عن ٢ من/.test(await text('.modal')) && /معلَّمة/.test(await text('.modal')), 'تأكيد التسليم يذكر غير المُجاب والمعلَّم');
await p.click('#seGo'); await p.waitForTimeout(1000);
ok(!(await p.$('#simRoot')) && /مؤشر الجاهزية/.test(await text('.modal')) && /الأقسام/.test(await text('.modal')) && /المهارات/.test(await text('.modal')), 'نافذة النتيجة: الجاهزية والأقسام والمهارات');
ok(/ليس درجة قياس الرسمية/.test(await text('.modal')), 'توضيح أن المؤشر تدريبي');
D = await data(); at = D.attempts.find(a => a.id === at.id);
ok(at.submitted_at && at.parts['كمي'] && at.parts['لفظي'] && at.score >= 1 && Object.keys(at.skills).some(k => ['الجبر', 'الحساب', 'الهندسة', 'الإحصاء والاحتمالات'].includes(k)), 'التصحيح بالأقسام والمهارات');
await p.click('#srX'); await p.waitForTimeout(700);
ok(/محاكي/.test(await text('.at-list')), 'المحاكي في سجل محاولاتي');
await p.click('.at-list [data-atv]'); await p.waitForTimeout(300);
ok(/مؤشر الجاهزية/.test(await text('.modal')), 'فتح نتيجة محاولة سابقة');
await p.click('#srX'); await p.waitForTimeout(500);

// ---------- انتهاء الوقت دون تسليم: يُصحَّح بما حُفظ ----------
await p.click('#simGo'); await p.click('#smGo'); await p.waitForTimeout(700);
await p.click('.sim-opt >> nth=0'); await p.waitForTimeout(1100);
await p.click('#simOut'); await p.waitForTimeout(700);
await put(`D => { const a = D.attempts.find(x => x.kind === 'sim' && !x.submitted_at); a.deadline = new Date(Date.now() - 600000).toISOString(); }`);
await p.reload(); await p.waitForTimeout(900); await level(); await p.waitForTimeout(900);
D = await data();
const exp = D.attempts.filter(a => a.kind === 'sim' && a.trainee_id === st.id);
ok(exp.length === 2 && exp.every(a => a.submitted_at) && Object.values(exp[1].answers).filter(v => v !== null).length === 1, 'المنتهي يُصحَّح تلقائيًا بالمحفوظ');

// ---------- الحد اليومي ----------
await put(`D => { const a = D.attempts.find(x => x.kind === 'sim'); D.attempts.push({ ...a, id: 'sim-x3' }); }`);
await p.reload(); await p.waitForTimeout(900); await level();
ok(await p.isDisabled('#simGo') && /الحد اليومي/.test(await text('.sim-card')), 'حد يومي ثلاث محاولات');

// ---------- تدريب على مهارة ----------
await p.selectOption('#lv-u', { index: (await p.$$eval('#lv-u option', x => x.map(o => o.textContent))).findIndex(o => o.startsWith('كمي')) });
await p.selectOption('#lv-c', 'الجبر'); await p.click('#lvGo'); await p.waitForTimeout(600);
D = await data(); const pr = D.attempts.filter(a => a.kind === 'practice').slice(-1)[0];
ok(pr && pr.focus === 'الجبر' && pr.snapshot.every(x => x.category === 'الجبر'), 'التدريب العلاجي بمهارة واحدة من كل الوحدات');
await p.click('#atS'); await p.waitForTimeout(700);
ok(/النتيجة: /.test(await text('.modal')) && /الجبر/.test(await text('.modal .skills')), 'نتيجة التدريب بالمهارة');
await p.click('#atX'); await p.waitForTimeout(400);

// ---------- الجوال 320: بلا تمرير أفقي ----------
const m = await (await b.newContext({ viewport: { width: 320, height: 640 }, isMobile: true, hasTouch: true })).newPage();
await m.goto(U); await m.waitForTimeout(700);
await m.evaluate(([k, s]) => localStorage.setItem(k, s), [KEY, JSON.stringify(await data())]);
await m.goto(U + 'student/'); await m.waitForTimeout(700);
await m.fill('#pl-phone', st.phone); await m.click('#plB'); await m.waitForTimeout(300); await m.fill('#pl-code', '1234'); await m.click('#plB'); await m.waitForTimeout(900);
await m.click('[data-st="level"]'); await m.waitForTimeout(500);
await m.evaluate(k => { const D = JSON.parse(localStorage.getItem(k)); D.attempts = D.attempts.filter(a => a.kind !== 'sim'); localStorage.setItem(k, JSON.stringify(D)); }, KEY);
await m.reload(); await m.waitForTimeout(900); await m.click('[data-st="level"]'); await m.waitForTimeout(500);
await m.click('#simGo'); await m.click('#smGo'); await m.waitForTimeout(800);
ok(await m.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('#simRoot').scrollWidth <= innerWidth + 1), 'شاشة المحاكي بلا تمرير أفقي على 320');
const tgt = await m.$$eval('.sim-opt, .sim-f .btn', x => x.every(e => e.getBoundingClientRect().height >= 44));
ok(tgt, 'أهداف اللمس 44px');

// ---------- الإدارة: تصنيف البنك المشترك ----------
const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FAP5FDvcfRYWgAAAAAElFTkSuQmCC';
await put(`D => { for (let i = 1; i <= 3; i++) D.questions.push({ id: 'shq' + i, shared: true, section: 'all', teacher_id: null, subject: 'كمي', unit: 'نموذج التصنيف', skill: '', order: i, text: '', image: '${PX}', page_image: '', options: ['أ','ب','ج','د'], correct: 0, status: 'published', key_status: 'approved', code: 'CT-' + i, category: '', version: 1 }); }`);
await p.goto(U + 'admin/#admin-bank'); await p.waitForTimeout(700);
if (await p.$('[name=p]')) { await p.fill('[name=p]', '1234'); await p.click('#lf button'); await p.waitForTimeout(1200); }
await p.waitForSelector('#sharedBank');
ok(/مصنّفة المهارة/.test(await text('#sharedBank')) && /٠ من ٣/.test(await text('#sharedBank tbody')), 'عمود المصنّفة في البنوك المشتركة');
await p.click('[data-kc="كمي"]'); await p.waitForTimeout(400);
ok((await p.$$('.kc-grid .kc-q')).length === 3 && (await p.$$('.kc-grid img')).length === 3, 'نافذة التصنيف تعرض الأسئلة بصورها');
await p.click('.kc-q >> nth=0'); await p.click('.kc-q >> nth=1'); await p.selectOption('#kc-c', 'الهندسة'); await p.click('#kc-go'); await p.waitForTimeout(800);
D = await data();
ok(D.questions.filter(x => x.shared && x.category === 'الهندسة').length === 2 && (await p.$$('.kc-grid .kc-q')).length === 1, 'التصنيف الجماعي يُطبَّق ويخفي المصنّف');
await p.click('#kc-x'); await p.waitForTimeout(400);

// المدرب يصنّف سؤاله
const T = D.teachers.find(t => t.section === 'boys' && t.subjects.includes('كمي'));
await login('teacher', T.phone); await p.click('[data-tt="bank"]'); await p.waitForTimeout(500);
await p.click('#qAdd2'); await p.waitForTimeout(300);
ok((await p.$$eval('#qf-c option', x => x.map(o => o.textContent))).includes('المقارنات الكمية'), 'قائمة مهارات قياس حسب المقرر');
await p.fill('#qf-u', 'وحدة التصنيف'); await p.fill('#qf-t', 'قارن بين 2³ و 3²'); for (const [i, v] of ['الأولى أكبر', 'الثانية أكبر', 'متساويتان', 'المعطيات غير كافية'].entries()) await p.fill(`[name=o${i}]`, v);
await p.check('#qf input[name=correct][value="1"]'); await p.selectOption('#qf-c', 'المقارنات الكمية'); await p.click('#qfS'); await p.waitForTimeout(600);
D = await data();
ok(D.questions.find(x => x.text === 'قارن بين 2³ و 3²')?.category === 'المقارنات الكمية', 'حفظ مهارة السؤال');

ok(!errs.length, 'لا أخطاء في الصفحة' + (errs.length ? ': ' + errs.join(' | ') : ''));
await b.close(); server.close();
if (failed()) process.exit(1);
