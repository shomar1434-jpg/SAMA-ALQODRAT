# منصة سما القدرات — دليل العمل لـ Claude Code

منصة تسجيل وحضور المتدربين لـ «مركز سما القدرات للتدريب» (جازان). واجهة عربية RTL في ملف HTML واحد، وبيانات على Supabase.

## البنية
- `src/` ملفات المصدر. **لا تعدّل `index.html` مباشرة** — عدّل `src/` ثم ابنِ.
- `build.py` يدمج `src/style.css` داخل `<style>`، ويدمج ملفات JS بعد سطر `const LOGO = "...";` في `index.html` (الملف نفسه هو القالب).
  - ترتيب الدمج مهم: utils, catalog, logos, partners, data2, views2_head, views2_main, landing, features, views2_admin, print, views2_programs, views2_settings.
  - `partners.js` قبل `data2.js` لأن `LocalStore.load()` يُستدعى عند التحميل ويحتاج `DEFAULT_ABOUT` و`defaultPartners`.
- `supabase/migrations/` تعديلات قاعدة البيانات مرقّمة بالتاريخ. `supabase/seed.sql` الـ 73 برنامجًا المعتمدة.
- `certificate/` تصميم الشهادة المرجعي.
- `tests/smoke.mjs` اختبار Playwright سريع.

## الأوامر
```
python build.py          # بناء index.html من src/
npm test                 # اختبار التشغيل (يحتاج: npm i)
```

## طبقة البيانات (`src/data2.js`)
- `LocalStore`: وضع تجريبي على localStorage (المفتاح `sama_qudrat_v4`، رمز الإدارة 1234).
- `CloudStore`: Supabase عبر supabase-js. يُفعَّل عند تعبئة `SUPABASE_URL` و`SUPABASE_ANON_KEY` أعلى السكربت في `index.html`.
- **أي دالة تُضاف لأحدهما تُضاف للآخر بنفس التوقيع.**
- منطق الحسابات مشترك ومكرر في SQL: `enrollmentStats` ↔ `enr_stats`، `attendanceLevel` ↔ `att_level`، `checkinLogic` ↔ `checkin`، `myAttendanceLogic` ↔ `my_attendance`. أي تعديل في أحدهما يُعدَّل في الآخر.

## النموذج
برامج ← دفعات (دفعة نشطة واحدة لكل برنامج، والبقية مؤرشفة) ← تسجيلات (كشف الدفعة) ← حضور. المتدرب فريد برقم السجل المدني. الشهادات تُصدر عند أرشفة الدفعة لمن بلغ حد الحضور.

## قواعد لا تُكسر
- **الأمان:** كل الجداول عليها RLS للمسؤول فقط. الوصول العام فقط عبر دوال `SECURITY DEFINER` (public_catalog, public_program, register_trainee, checkin, my_attendance, verify_certificate, public_site, public_settings).
- **الخصوصية:** رسائل الرفض في التحضير لا تكشف اسم المتدرب (`not_in_cohort` موحّد). صفحة «حضوري» تعيد النسبة ورسالة التنبيه فقط. التحقق من الشهادة يعرض اسمًا مقنّعًا.
- **الوقت:** توقيت الرياض دائمًا (`riyadhNow` / `riyadh_now()`)، والمقارنات بالثواني منذ epoch.
- **الإدخال:** الاسم حروف فقط، والسجل والجوال أرقام فقط (تحويل الأرقام العربية)، والبريد بعلامة @.
- **الوصول:** ملخص أخطاء النماذج، `aria-invalid`، `aria-busy` للأزرار، احترام `prefers-reduced-motion`، خط 16px في المدخلات على الجوال.
- **الطباعة:** A4 عبر `#printRoot`، والاعتماد بتوقيع مدير المركز والختم فقط.
- **التصميم:** نظام «سِجِل»: Readex Pro، اللون الأساسي teal، والفاتح والداكن.

## قبل كل تسليم
1. `python build.py`
2. `npm test` بلا أخطاء صفحة.
3. أي تعديل SQL يُكتب في ملف migration جديد، ولا يُعدَّل ملف قديم طُبّق.
