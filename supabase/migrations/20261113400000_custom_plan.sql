-- باقة «خصصناها لك» (الباقة الخامسة، من مطوية المركز): 8 أسابيع، 3 حصص أسبوعيًا، 125 قسمًا.
-- حضوري 800 ريال على دفعتين (400 كل شهر)، وعن بُعد 600 على دفعتين (300 كل شهر)؛ وعن بُعد «قريبًا» كبقية الباقات.
-- مطابق لـ customPlans() و TIERS.custom في src/qudurat.js.
create or replace function plan_label(p plans) returns text language sql immutable as $$
  select case p.tier when 'basic' then 'الأساسية' when 'silver' then 'الفضية' when 'gold' then 'الذهبية' when 'diamond' then 'الماسية' else 'خصصناها لك' end
    || case when p.mode = 'remote' then ' — عن بُعد' else '' end;
$$;
insert into plans (tier, mode, program, name, status, duration_unit, duration_value, hours, reg_fee, installments, installment_amount, summary, features, audience, subjects, sort)
select 'custom', m.mode, 'qudurat', 'خصصناها لك', case when m.mode = 'remote' then 'coming_soon' else 'open' end, 'week', 8, 48, m.half, 1, m.half,
       'للاستعداد لاختبار القدرات: تأسيس وتدريب محاكٍ تمامًا لاختبار قياس.',
       array['تأسيس وتدريب محاكٍ تمامًا لاختبار قياس','125 قسمًا','3 حصص أسبوعيًا لمدة 8 أسابيع','شهادة معتمدة','برنامج استراتيجيات الحل','الاختبار القبلي','المساعدة في اختيار الموعد المناسب','تقارير دورية'],
       '', array['كمي','لفظي'], 4 + case when m.mode = 'remote' then 10 else 0 end
from (values ('in_person', 400), ('remote', 300)) as m(mode, half)
where not exists (select 1 from plans p where p.tier = 'custom' and p.mode = m.mode);
