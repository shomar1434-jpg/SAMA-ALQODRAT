# منصة سما القدرات — دليل العمل لـ Claude Code

«منصة مركز سما القدرات للتدريب» (جازان): تسجيل وحضور ومتابعة المتدربين. المصطلحات: «المتدرب» و«المدرب» (لا طالب ولا معلم) في كل الواجهات، عدا أسماء البرامج والنصوص الرسمية المنقولة. واجهة عربية RTL متعددة الصفحات (Vite + JavaScript وحدات ES)، وبيانات على Supabase.

**ابدأ كل جلسة بقراءة:** `docs/STATUS.md` (أين وصلنا) و`docs/EXECUTION_PLAN.md` (الخطوات والقرارات).

## البنية
- `index.html` الصفحة العامة: الرئيسية، دليل البرامج، صفحة البرنامج والتسجيل، التحضير، التحقق من الشهادة، السياسات. («حضوري» أُلغيت من الواجهة: `#me` يحوّل إلى `#portals`.)
- `admin/index.html` لوحة الإدارة: كل مسارات `#admin*`، و`#qr-…`، و`#display`.
- `student/` و`teacher/` و`guardian/` البوابات (`src/portals.js`): دخول برقم الجوال ورمز تحقق. المتدرب = مشترك في باقة **أو** مسجّل في برنامج؛ «لوحتي» تجمع الباقات والبرامج (`cohortItemsOf` في `src/data2.js`، و`programPanelHtml`)، وبيانات محصورة بالدور من `portalData(role)` (محليًا `scopeData`، وسحابيًا `portal_data()`)، والحساب في `src/portal_logic.js` (ومنه `progressGauge`: عداد الأداء العام في «لوحتي» للطالب وولي الأمر = متوسط الحضور ونجاح الواجبات والمؤقت الزمني؛ أحمر دون 50، أصفر حتى حد الشهادة، أخضر بعده).
- كل صفحة تخدم مساراتها فقط؛ `route()` في `src/views2_main.js` يحوّل المسار إلى صفحته الصحيحة.
- `src/entries/*.js` نقطة دخول كل صفحة ← `src/boot.js` (تهيئة المخزن، السمة، التوجيه).
- `src/config.js` مفاتيح Supabase من متغيرات البيئة، والصفحة الحالية (`PAGE`)، و`publicBase()`/`adminBase()`.
- الروابط الموجّهة للعامة (الباركود، رابط الشهادة) تُبنى دائمًا من `publicBase()`، لا من `location`.
- `src/*.js` وحدات ES. **لا شيفرة تُنفَّذ عند التحميل** خارج `boot()`؛ التعريفات فقط، تجنبًا لمشكلات ترتيب الاستيراد الدائري.
- `src/qudurat.js` منطق باقات القدرات والتحصيلي (الباقات، جداول البنين والبنات، الاشتراكات، الإحصاء) ↔ `supabase/migrations/…_qudurat.sql` (`sub_end`، `session_on`، `sub_stats`، `checkin`).
- `src/learning_logic.js` منطق الواجبات وبنك الأسئلة والمحاولات والتقييم والمراسلة ↔ `supabase/migrations/…_learning.sql`؛ وواجهاتها في `src/learning_views.js` (تبويبات بوابتي الطالب والمعلم).
- `src/policy_logic.js` ↔ `supabase/migrations/…_policies.sql` مركز السياسات (`currentPolicies` ↔ `current_policies`، `checkAcceptance` ↔ `check_policy_acceptance`)؛ وواجهاته في `src/policy_views.js` (`#policies`، `#policy-<slug>[~<إصدار>]`، `#admin-policies`، وخانة القبول في نموذج التسجيل).
- `src/plan_art.js` + `src/assets/plans/*.webp` التصاميم التعريفية الرسمية للباقات الخمس ونموذجا المقارنة (`planPoster(tier)`، `COMPARE_ART`). الباقات خمس: أساسية، فضية، ذهبية، ماسية، و«خصصناها لك» (`tier='custom'`، `customPlans()`).
- `src/qudurat_views.js` شريط الباقات، وصفحة الباقة، وصفحة الإدارة `#admin-qudurat`. `src/marquee.js` الشريط المنزلق العام.
- `supabase/migrations/` ترحيلات مرقّمة بالتاريخ. `supabase/seed.sql` البرامج الـ 73 والباقات وقالب الجداول. `supabase/seed_site.sql` السياسات الست والشركاء، مولَّد من `src/policy_texts.js` و`src/site_partners.js` بـ `npm run seed:site` (لا يُعدَّل يدويًا). `supabase/tests/` اختبارات SQL (`npm run test:sql`، يحتاج PostgreSQL محليًا).
- `docs/` الخطة، والحالة، وبيانات الباقات.

## الأوامر
```
npm install
npm run dev      # خادم تطوير
npm run check    # فحص ثابت + بناء + اختبارات (شغّله قبل كل تسليم)
```
الاختبارات تعمل على `dist/` بعد البناء: `smoke` و`e2e` و`qudurat` و`portals` و`daily` و`learning` و`policies` و`gauge` و`program_portal` و`identity` و`inbox` و`question_banks` و`registration` و`guardian_link` و`cohort_trainer` و`pwa` و`center_links` و`plan_posters` و`orders` و`invoices` و`legacy_import` و`compat` (التوافقية: `BROWSER=firefox|webkit` في CI) في `tests/`، واختبارات SQL في `supabase/tests/` (`npm run test:sql`).
في الوضع التجريبي فقط تُتاح `window.__SAMA__` للاختبارات.

## طبقة البيانات (`src/data2.js`)
- `LocalStore`: وضع تجريبي على localStorage (المفتاح `sama_qudrat_v4`، رمز الإدارة 1234). مشترك بين الصفحات (نفس الأصل).
- `CloudStore`: Supabase. يُفعَّل عند وجود `VITE_SUPABASE_URL` و`VITE_SUPABASE_ANON_KEY`.
- **أي دالة تُضاف لأحدهما تُضاف للآخر بنفس التوقيع.**
- منطق الحسابات مكرر في SQL: `enrollmentStats` ↔ `enr_stats`، `attendanceLevel` ↔ `att_level`، `checkinLogic` ↔ `checkin`، `myAttendanceLogic` ↔ `my_attendance`. أي تعديل في أحدهما يُعدَّل في الآخر.
- المتغيرات المشتركة القابلة للتغيير تُعدَّل من وحدتها فقط عبر دوال (`setAD`، `setCohortView`، `setPage`).

## النموذج
برامج ← دفعات (دفعة نشطة واحدة لكل برنامج، والبقية مؤرشفة) ← تسجيلات ← حضور. المتدرب فريد برقم السجل المدني. الشهادات تُصدر عند أرشفة الدفعة لمن بلغ حد الحضور.
قيد الحضور: `unique (enrollment_id, att_date)` — المسح المكرر في اليوم نفسه لا يُحتسب مرتين.
الباقات: باقة ← اشتراك (`pending` حتى أول حضور، ثم `active` بنهاية محسوبة) ← `sub_attendance` بقيد `unique (subscription_id, att_date)`. القسم (بنون/بنات) من جنس الطالب.
التحضير الموحد: `#checkin` = باركود واحد ثابت. يبحث في اشتراكات لها جلسة الآن ثم الدفعات، ويطلب الاختيار عند التعدد، ويسجّل كل محاولة في `checkin_attempts` (السجل المدني مجزّأ).
تقرير اليوم: `src/report_logic.js` ↔ `build_daily_report()`؛ لقطة واحدة لكل تاريخ ثم مراجعات مرقّمة (`daily_reports`)، وتُجدول عند 17:30 UTC = 20:30 الرياض.
التعليم: النطاق = القسم × المقرر من اشتراك قائم. لكل مدرب بنك أسئلة مستقل (`questions.teacher_id`) تديره الإدارة من `#admin-bank` (`src/admin_bank.js`، `admin_save_question`/`admin_import_questions`) والمدرب لبنكه فقط؛ الاستيراد `parseBank` (لصق من Excel/CSV). واجب `kind='quiz'` يحفظ نسخة الأسئلة ويُصحَّح آليًا (`gradeQuiz` ↔ `student_submit`)، والإجابات تُحذف من بيانات المتدرب قبل التسليم (`quizPublic` ↔ `portal_data`). محاولة الاختبار تحفظ نسخة الأسئلة (`snapshot`)، ولا تُرسل الإجابة الصحيحة قبل التسليم. تقييم واحد لكل (طالب، معلم، شهر).
السياسات: مسودة ← نشر بإصدار (يلزم جهة اعتماد ونص مكتمل)، والمنشور ثابت. السياسات للاطلاع ولا تُلزم عند التسجيل (قرار المالك)؛ آلية القبول (`requires_acceptance`، `policy_acceptances`) باقية في الخادم معطّلة.
نسبة الإنجاز: `achievementOf` في `src/portal_logic.js` = متوسط (أيام الحضور ÷ جلسات الباقة) و(الواجبات المحلولة ÷ المرسلة). يراها المتدرب وولي أمره، ويراها المدرب مرآةً في كشفه عبر `hw_assignments`/`hw_submissions` (`…_trainer_mirror.sql`).
حماية الهوية: إعادة التسجيل بسجل مدني موجود تضيف التسجيل للملف نفسه ولا تغيّر الاسم أو الجوال المعتمد (الجوال مفتاح البوابة)؛ تُكمَّل الحقول الفارغة فقط، والفروق تصبح `profile_change_requests` تبت فيها الإدارة (`mergeOnRegister` ↔ `trainees_register_guard`).
التسجيل الموحّد: `#enroll` (`viewEnroll`) نموذج واحد للبرامج والباقات؛ تاريخ الميلاد إلزامي، وجوال ولي الأمر إلزامي دون 19 سنة (`src/identity_logic.js` `checkBirthGuardian` ↔ `reg_guardian`)، ويُحفظ في `trainees.guardian_phone` عند أول تسجيل فقط؛ في إعادة التسجيل لا يُكمَّل ولا يُستبدل بل يصبح طلب تحديث.
ربط ولي الأمر الذاتي: `selfLinkLogic` ↔ `guardian_self_link` — يشترط معًا: جوال مصرَّح به في `trainees.guardian_phone`، وجلسة برمز تحقق، وسجل مدني صحيح؛ رفض برسالة واحدة (`LINK_FAIL`)، و5 محاولات فاشلة/ساعة (`guardian_link_attempts`، السجل مجزّأ)، والملغى لا يُعاد ذاتيًا (`guardian_links.source`).
مدرب الدفعة: `cohorts.teacher_id` يربط الدفعة بحساب مدرب (والنص `trainer` يبقى للكشوف)؛ بيانات دفعاته في `scopeData`/`portal_data` للمدرب (`cohorts`، `enrollments`، `attendance`، `cohort_trainees` بالأسماء فقط)، وتبويب «دفعات البرامج» (`teacherCohorts`). مدرب البرامج بلا مقررات يرى الدفعات فقط (`tTabsOf`).
التطبيق (PWA): `src/pwa.js` (`initPwa` من `boot`/`bootPortal`: تسجيل عامل الخدمة، زر التثبيت `#installBtn` وإرشاده، `#pwaUpdate`، `deviceNotify`). `dist/sw.js` يولّده `swPlugin` في `vite.config.js` من `scripts/sw.template.js` (لا يُعدَّل في dist). ملفات التعريف والأيقونات في `public/` (واحد لكل صفحة، روابط نسبية). لا تُحفظ طلبات البيانات ولا `/admin/`.
قنوات المركز: كلها في `CENTER` (`src/catalog.js`: واتساب، الخريطة، المنصات، تيليجرام، منار) وتُعرض من `#contact` (`viewContact`) والتذييل؛ `waLink(text)` يفتح واتساب برسالة مجهزة يرسلها المستخدم (لا إرسال آلي). **منار (mnar.sa) هي المخوّلة بإصدار الشهادات المعتمدة**، ويُذكَّر المتدرب بإنشاء حسابه فيها. برامج الأطفال `KIDS_PROGRAMS` (اعتماد 25194): العمر من 3 سنوات (`MIN_AGE`)، ودون 13 (`CHILD_AGE`) جوال التواصل هو جوال ولي الأمر.
المدفوعات: المرجع `docs/payments/SPEC_v1_4.md` (وثيقة المالك) ومراجعتها `docs/payments/REVIEW.md`؛ لا يُبنى شيء مالي خارجها، ولا مال حقيقي في الوضع التجريبي.
طلبات الشراء (المرحلة 1): `src/order_logic.js` ↔ `…_orders.sql`. لكل تسجيل طلب برقم `SAMA-السنة-000001` (`register`/`registerSubscription` يعيدان `order`) ومحوران مستقلان: `approval` (مراجعة المسؤول) و`payment` (`unpaid`→`claimed` بإبلاغ العميل→`confirmed` بتأكيد الإدارة بعد مطابقة كشف البنك). الموافقة لا تثبت السداد، والإبلاغ لا يؤكده. الحساب البنكي في `settings.bank` ولا يُعرض حتى `enabled`. `settings.require_order_approval` (معطّل افتراضيًا) يمنع مسح الحضور لطلب غير مستوفٍ (`orderReady`) إلا بـ«قبول مؤقت». لوحة صاحب الطلب `src/order_panel.js` (بعد التسجيل وفي البوابات)، والإدارة `src/order_views.js` (`#admin-orders`). الطلبات وسجلها لا تُحذف. وثيقة المنصة «إفادة حضور»، والشهادة المعتمدة من منار.
الفواتير الداخلية: `src/invoice_logic.js` ↔ `…_invoices.sql`. تصدر فاتورة `INV-السنة-000001` تلقائيًا عند `confirmOrderPayment` (↔ `admin_confirm_payment`) بنسخة ثابتة (`buildInvoice`) من اسم صاحب الخدمة ونوعها وتاريخ الشراء والمبالغ ومرجع التحويل؛ فاتورة سارية واحدة لكل طلب. لا تُحذف ولا تُعدَّل؛ تُلغى بسبب مكتوب مع إلغاء تأكيد السداد. صورة الإيصال يرفقها المسؤول (`attachReceipt`، مضغوطة في المتصفح، للمسؤول فقط) ولا يُستنتج منها السداد. الصفحة `#admin-invoices` (`src/invoice_views.js`): تصفية وإجماليات، طباعة A4 (`invoiceHtml`)، كشف الفترة، وCSV. **مستند داخلي وليس فاتورة ضريبية**؛ الفوترة الإلكترونية (هيئة الزكاة والضريبة) في المرحلة 6.
طرق السداد والدفعات: `PAY_METHODS` (تحويل، شبكة، نقدًا، أخرى) تُختار عند تأكيد السداد؛ `addOrderPayment` ↔ `admin_add_payment` يسجّل دفعة إضافية على طلب مؤكد ويصدر لها فاتورة مستقلة (أكثر من فاتورة سارية للطلب)، ولا تتجاوز المتبقي (`orderRemaining`). إلغاء التأكيد يلغي فواتير النظام ويعيد `paid_amount` إلى الرصيد المرحَّل.
المسجّلون سابقًا ومراجعة البيانات: `src/import_logic.js` ↔ `…_legacy_import.sql`. `parseLegacy` يقرأ كشف المركز (لصق من Excel أو CSV، الأعمدة بالعناوين) ويستخرج ملاحظات كل صف؛ `importLegacy` ↔ `admin_import_legacy` ينشئ المتدرب (`imported`، `import_notes`)، واشتراكًا بتاريخه الفعلي (`track_from` = يوم الإدخال، فلا تُحسب الجلسات السابقة غيابًا في `subStats`/`sub_stats`)، وطلبًا موافقًا عليه برصيد مرحَّل (`orders.opening`، `discount_note`) **بلا فواتير للسابق**. `dataIssues(D)` يفحص القاعدة كلها ويستخرج الناقص، ويكمله المسؤول من `#admin-data` (`src/import_views.js`) عبر `saveTrainee` ↔ `admin_save_trainee` و`saveOrderMeta` و`resolveImportNote`. **بيانات المتدربين الحقيقية لا توضع في المستودع ولا في البذور.**
صندوق الوارد: `src/inbox_logic.js` ↔ `…_inbox.sql` (`sessionReminders` ↔ `run_session_reminders` كل دقيقة عبر pg_cron، `inboxOf` ↔ `portal_inbox`، `adminRecipients` ↔ `admin_notify`). كل إشعار تلقائي له `dedupe_key` فريد. الواجهة `src/inbox_ui.js`: جرس، لائحة، لافتة، صوت المعهد (Web Audio، يُفتح بعد أول لمسة)، إيقاف الصوت (`sama_sound`)، وما رُئي يُحفظ في الجهاز (`sama_seen_<role>_<phone>`) فلا يتكرر التنبيه.
لا حذف لسجل تاريخي: الحذف يُرفض إن وُجد حضور أو شهادة (`on delete restrict`)، والبديل الإلغاء أو الأرشفة.

## قواعد لا تُكسر
- **الأمان:** RLS على كل الجداول؛ الوصول العام فقط عبر دوال `SECURITY DEFINER`. كل بوابة لها دور، ويُتحقق منه على الخادم لا في الواجهة.
- **الخصوصية:** رسائل رفض التحضير لا تكشف اسم المتدرب. بوابة المتدرب لا تُظهر إلا بياناته (لا أسماء زملاء الدفعة). التحقق من الشهادة باسم مقنّع.
- **الوقت:** توقيت الرياض دائمًا (`riyadhNow` / `riyadh_now()`).
- **الإدخال:** الاسم حروف فقط، والسجل والجوال أرقام فقط (تحويل الأرقام العربية)، والبريد بعلامة @.
- **التوافقية:** لا تمرير أفقي في أي صفحة من 320px؛ أهداف اللمس 44px وخط الحقول 16px على اللمس؛ الحواف الآمنة `env(safe-area-inset-*)`؛ أي صفحة جديدة تُضاف إلى `tests/compat.mjs`.
- **الوصول:** ملخص أخطاء النماذج، `aria-invalid`، `aria-busy`، احترام `prefers-reduced-motion`، خط 16px للمدخلات على الجوال.
- **الطباعة:** A4 عبر `#printRoot`، والاعتماد بتوقيع مدير المركز والختم فقط.
- **التصميم:** نظام «سِجِل»: Readex Pro، اللون الأساسي teal، والفاتح والداكن.
- **الباقات عن بُعد:** تظهر «قريبًا» ولا تُفتح ولا يُسجَّل فيها.
- **المحتوى من الموقع الرسمي:** السياسات والشركاء والباقات تُنقل من smaalgodrat.com كما هي، لا تُكتب من عندنا.

## طريقة العمل
- كل خطوة من الخطة في فرع `step-N-…`، ثم طلب دمج يراجعه المالك.
- أي تعديل SQL في ملف ترحيل جديد، ويُختبر على PostgreSQL محلي. لا يُعدَّل ترحيل طُبّق.
- حدّث `docs/STATUS.md` في نهاية كل خطوة.
