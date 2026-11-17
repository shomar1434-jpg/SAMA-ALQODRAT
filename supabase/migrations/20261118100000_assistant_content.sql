-- الخطوة BD: تصحيح أربعة ردود في مكتبة المساعد لتطابق ما في المنصة الآن (منار مصدر الشهادات المعتمدة، والبث المباشر في البوابة، ودليل الباقات، وقنوات المدربين)
update public.assistant_responses set answer = 'باقات القدرات والتحصيلي في المركز: الأساسية، والفضية، والذهبية، والماسية، و«خصصناها لك». تجد مدة كل باقة ومحتواها ورسومها في دليل الباقات على الصفحة الرئيسية؛ المفتوح منها يقبل التسجيل الآن، والموسوم «قريبًا» لم يُفتح تسجيله بعد. يمكنني توضيح خطوات التسجيل أو طريقة التواصل للاستفسار عن باقة معينة.' where id = 'plans';
update public.assistant_responses set answer = 'يشرح المدرب محاضرته المباشرة في قاعة المركز، ويُبث الشرح في تبويب «البث المباشر» داخل بوابة المتدرب في موعده، مع إمكانية المشاهدة بملء الشاشة. وبعد انتهاء البث تبقى المحاضرة في «مكتبة المحاضرات المسجلة» إذا أتاحها المدرب. للاستفسار عن برنامج معين تواصل مع المركز.' where id = 'zoom';
update public.assistant_responses set answer = 'يُصدر المركز «إفادة حضور» لمن بلغ حد الحضور المطلوب في البرنامج. أما الشهادات المعتمدة فتصدر من منصة منار (mnar.sa)، لذا أنشئ حسابك فيها ببيانات مطابقة لبيانات تسجيلك في المركز. للاستفسار عن إفادة أو شهادة تواصل مع المركز.' where id = 'certificates';
update public.assistant_responses set answer = 'في بوابة المتدرب تجد «مدربو مقرراتي» ونبذة كل مدرب ورابط قناته، وتجد تسجيلات المحاضرات في «مكتبة المحاضرات المسجلة» ضمن تبويب «البث المباشر». للاستفسار عن وسيلة وصول أخرى تواصل مع المركز.' where id = 'trainer';
-- محاضرات البث تُنبّه الواجهات أيضًا (لم يكن جدولها موجودًا عند ترحيل المكتبة في البيئات الجديدة)
do $$ declare target text; begin
  foreach target in array array['lectures','lecture_slots'] loop
    if to_regclass(format('public.%I', target)) is not null and not exists (select 1 from pg_trigger where tgname = 'signal_data_change' and tgrelid = to_regclass(format('public.%I', target))) then
      execute format('create trigger signal_data_change after insert or update or delete on public.%I for each row execute function sama_internal.signal_data_change()', target);
    end if;
  end loop;
end $$;
