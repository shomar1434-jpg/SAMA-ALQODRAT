-- Shared assistant library and a payload-free signal for page invalidation.
create table public.assistant_responses (
  id text primary key check (length(id) between 1 and 100),
  title text not null check (length(btrim(title)) between 1 and 120),
  category text not null check (length(btrim(category)) between 1 and 80),
  keywords text[] not null default '{}' check (cardinality(keywords) <= 100),
  answer text not null check (length(btrim(answer)) between 1 and 8000),
  actions text[] not null default '{}' check (cardinality(actions) <= 100),
  active boolean not null default true,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assistant_responses enable row level security;
revoke all on public.assistant_responses from anon, authenticated;
grant select on public.assistant_responses to anon, authenticated;
grant insert, update, delete on public.assistant_responses to authenticated;
create policy assistant_read on public.assistant_responses for select to anon, authenticated
  using (active or (select public.is_admin()));
create policy assistant_add on public.assistant_responses for insert to authenticated
  with check ((select public.is_admin()));
create policy assistant_edit on public.assistant_responses for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy assistant_delete on public.assistant_responses for delete to authenticated
  using ((select public.is_admin()));

create schema if not exists sama_internal;
revoke all on schema sama_internal from public, anon, authenticated;
create function sama_internal.assistant_version() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  new.version := old.version + 1;
  new.updated_at := clock_timestamp();
  new.created_at := old.created_at;
  return new;
end $$;
revoke all on function sama_internal.assistant_version() from public, anon, authenticated;
create trigger assistant_version before update on public.assistant_responses
  for each row execute function sama_internal.assistant_version();
create trigger assistant_responses_audit after insert or update or delete on public.assistant_responses
  for each row execute function public.audit_row();

-- Clients can read this number, but cannot write it. No changed rows or identifiers are exposed.
create table public.app_data_revision (
  id integer primary key check (id = 1),
  version bigint not null default 1
);
insert into public.app_data_revision(id) values (1);
alter table public.app_data_revision enable row level security;
revoke all on public.app_data_revision from anon, authenticated;
grant select on public.app_data_revision to anon, authenticated;
create policy revision_read on public.app_data_revision for select to anon, authenticated using (true);

-- Trigger-only privilege is required to update the read-only signal after portal RPC writes.
create function sama_internal.signal_data_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and new is not distinct from old then return null; end if;
  if current_setting('sama.revision_bumped', true) = '1' then return null; end if;
  perform set_config('sama.revision_bumped', '1', true);
  update public.app_data_revision set version = version + 1 where id = 1;
  return null;
end $$;
revoke all on function sama_internal.signal_data_change() from public, anon, authenticated;

do $$ declare target text; begin
  foreach target in array array[
    'programs','packages','plans','cohorts','enrollments','trainees','attendance','certificates',
    'settings','partners','subscriptions','sub_attendance','schedule_templates','schedule_exceptions',
    'teachers','guardian_links','notifications','messages','assignments','submissions','questions',
    'orders','order_events','invoices','invoice_receipts','program_requests','custom_requests',
    'policies','policy_acceptances','profile_change_requests','daily_reports','lectures','trainer_groups',
    'admins','admin_invites','activation_codes','activation_windows','device_sessions','assistant_responses'
  ] loop
    if to_regclass(format('public.%I', target)) is not null then
      execute format('create trigger signal_data_change after insert or update or delete on public.%I for each row execute function sama_internal.signal_data_change()', target);
    end if;
  end loop;
  if exists(select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.app_data_revision;
  end if;
end $$;

insert into public.assistant_responses(id,title,category,keywords,answer,actions) values
('hello','الترحيب والتعريف بالمركز','عام',array['السلام عليكم','مرحبا','اهلا','صباح الخير','مساء الخير','من انت','من أنتم','ما هو مركز سما']::text[],'وعليكم السلام ورحمة الله وبركاته، أهلًا بك في مركز سما القدرات للتدريب 🌟 أنا مساعد سما الذكي. أساعدك في التعرف على الباقات والبرامج، وخطوات التسجيل والحضور والدعم الفني. ما الخدمة التي تبحث عنها؟',array['ما الباقات المتاحة؟','كيف أسجل؟','كيف أتواصل مع المركز؟']::text[]),
('plans','الباقات الموجودة','الباقات',array['باقات','الباقات','القدرات','تحصيلي','الأساسية','الفضية','الذهبية','الماسية','خصصناها لك','ماهي الباقات']::text[],'بحسب قراءة عامة من قاعدة بيانات المركز بتاريخ 17 نوفمبر 2026، توجد باقات بأسماء: الأساسية، الفضية، الذهبية، الماسية، و«خصصناها لك». وتوجد سجلات معروضة للتسجيل وسجلات موسومة «قريبًا». حالة الطرح قد تتغير؛ راجع دليل الباقات المباشر عند الشراء. يمكنني توضيح خطوات التسجيل أو طريقة التواصل للاستفسار عن باقة معينة.',array['كم سعر الباقة الفضية؟','كيف أسجل في باقة؟','ما الفرق بين الباقات؟']::text[]),
('prices','الأسعار والرسوم','الباقات',array['السعر','اسعار','أسعار','كم سعر','كم رسوم','التكلفة','بكم','الرسوم','كم قيمة','سعر الفضية','سعر الأساسية']::text[],'تختلف رسوم الباقات حسب البرنامج وطريقة الدراسة والعرض الفعّال. لا أعرض رقمًا نهائيًا قبل التحقق من سعر البيع المنشور فعليًا؛ لأن بعض حقول قاعدة البيانات تمثل رسوم تسجيل فقط، وليست إجمالي سعر الباقة. اختر الباقة من دليل البرامج أو تواصل مع المركز للحصول على السعر المؤكد.',array['ما الباقات المتاحة؟','واتساب المركز','كيف أطلب التسجيل؟']::text[]),
('compare','المقارنة بين الباقات','الباقات',array['الفرق بين','الفرق','قارن','مقارنة','مميزات','مزايا','الفضية والذهبية']::text[],'للمقارنة بين الباقات، راجع محتوى التدريب والمدة والمحاضرات والخدمات والرسوم في تفاصيل كل باقة. حدد الباقتين اللتين ترغب في المقارنة بينهما، ويمكنك التواصل مع المركز للحصول على تفاصيلهما المعتمدة.',array['الفضية والذهبية','كيف أسجل؟']::text[]),
('registration','خطوات التسجيل','التسجيل',array['كيف اسجل','كيف أسجل','التسجيل','ارغب بالتسجيل','اشترك','تسجيل','اشتراك','ابي اسجل','أريد التسجيل','رابط التسجيل']::text[],'للتسجيل، اختر البرنامج أو الباقة من دليل المركز، ثم اتبع تعليمات التسجيل الموضحة في صفحة الخدمة وأكمل البيانات المطلوبة بدقة. إذا احتاج الطلب إلى مراجعة أو تحقق من السداد، يُستكمل تفعيله بعد اعتماد المسؤول. للاستفسار عن خطوات برنامج معين، تواصل مع المركز.',array['ما البيانات المطلوبة؟','كيف أدفع؟','كيف أتابع طلبي؟']::text[]),
('data','صحة بيانات التسجيل','التسجيل',array['بيانات التسجيل','الاسم الرباعي','السجل المدني','تاريخ الميلاد','رقم الجوال','البريد الإلكتروني','وش اكتب','ما البيانات المطلوبة']::text[],'يرجى كتابة الاسم الرباعي، ورقم السجل المدني، ورقم الجوال، والبريد الإلكتروني بدقة، مع إدخال أي بيانات إضافية مطلوبة في النموذج. تاريخ الميلاد يُطلب عندما يكون من متطلبات البرنامج، مثل بعض برامج الأطفال. صحة البيانات مهمة للتواصل وإصدار الإفادات والشهادات الرسمية. أدخل بياناتك الشخصية في نموذج التسجيل المخصص، واحرص على خصوصيتها داخل المحادثة.',array['كيف أسجل؟','تسجيل الأطفال']::text[]),
('children','برامج الأطفال','التسجيل',array['الأطفال','طفل','اطفال','الصغار','القراءة والكتابة','روضة']::text[],'لدى المركز برامج مخصصة لتنمية مهارات الأطفال، ومنها القراءة والكتابة. قد يتطلب تسجيل الطفل تاريخ الميلاد وبيانات ولي الأمر. يُرجى اختيار برنامج الأطفال المحدد من الدليل، لأن الشروط والمواعيد تتفاوت بين البرامج.',array['كيف أسجل؟','كيف أتواصل؟']::text[]),
('pay','الدفع وإيصال التحويل','المدفوعات',array['ادفع','سداد','الدفع','تحويل','الايداع','الإيصال','ايصال','كيف ادفع','كيفية الدفع','حساب البنك','بنكي']::text[],'تستطيع تقديم طلب شراء ثم إرسال إيصال السداد عبر القناة المعتمدة لدى المركز مع رقم الطلب. **إرسال الإيصال لا يعني اعتماد الدفع تلقائيًا**؛ يراجع المسؤول العملية قبل تأكيدها وربط الاشتراك. للحصول على التعليمات الحالية تواصل مع واتساب المركز الرسمي.',array['واتساب المركز','كيف أتابع طلبي؟','هل يمكن الدفع بالأقساط؟']::text[]),
('instalments','الأقساط والدفعات','المدفوعات',array['أقساط','اقساط','تقسيط','دفعة','دفعات','المبلغ المتبقي','باقي علي','سداد جزئي']::text[],'يمكن أن تكون لبعض الباقات خطة أقساط. لمعرفة الدفعات المعتمدة والمبلغ المتبقي على طلبك، راجع بوابتك بعد تسجيل الدخول أو تواصل مع قسم المدفوعات عبر القناة الرسمية للمركز.',array['كيف أتابع اشتراكي؟','واتساب المركز']::text[]),
('purchase_status','متابعة الطلب','الطلبات',array['طلبي','حالة الطلب','رقم الطلب','مراجعة الطلب','الموافقة على الطلب','طلب الشراء','وين وصل طلبي']::text[],'لمتابعة طلب الشراء، سجّل الدخول إلى حسابك وراجع تفاصيل الطلب المتاحة في بوابتك، أو تواصل مع المركز مع ذكر رقم الطلب. احتفظ برموز التحقق وكلمات المرور لنفسك.',array['كيف أسجل؟','واتساب المركز']::text[]),
('subscriptions','مدة الاشتراك وتاريخ الانتهاء','الاشتراكات',array['اشتراكي','اشتراكي متى ينتهي','تاريخ انتهاء','صلاحية','مدة الباقة','انتهاء الباقة','باقتي','متى ينتهي']::text[],'لمعرفة مدة اشتراكك وتاريخ انتهائه، سجّل الدخول إلى بوابتك وراجع تفاصيل الباقة المرتبطة بحسابك، أو تواصل مع المركز للتحقق من تاريخ الانتهاء المعتمد لاشتراكك.',array['كيف أتابع طلبي؟','واتساب المركز']::text[]),
('attendance','تسجيل الحضور','الحضور',array['الحضور','أحضر','حضوري','الباركود','باركود','غياب','تأخر','سجل حضور']::text[],'يستخدم المركز نظام حضور مرتبطًا بالبرنامج أو الباقة. اتبع تعليمات باركود الحضور المعتمد عند بدء الجلسة. أما سجلك الشخصي للغياب أو عدد مرات حضورك فيتطلب تسجيل دخول والتحقق من هويتك، فلا يمكنني إظهاره في محادثة عامة.',array['متى محاضرتي؟','كيف أتابع اشتراكي؟']::text[]),
('schedule','مواعيد المحاضرات','الجداول',array['موعد','جدول','محاضرة','المحاضرة القادمة','متى المحاضرة','الوقت','متى تبدأ','مواعيد']::text[],'تختلف مواعيد المحاضرات حسب الدفعة والبرنامج والمدرب. لمعرفة موعد محاضرتك، راجع جدولك في بوابة المتدرب أو تواصل مع المركز. وتجد المواعيد العامة المعلنة ضمن تفاصيل البرامج.',array['كيف أسجل؟','الحضور بالباركود']::text[]),
('zoom','التدريب عن بعد وZoom','الجداول',array['زوم','زووم','zoom','بث','رابط المحاضرة','اونلاين','عن بعد','مباشر']::text[],'للاستفسار عن التدريب عن بُعد وروابط محاضرات Zoom، راجع تعليمات البرنامج الذي سجلت فيه أو تواصل مع المركز لمعرفة طريقة الدخول والموعد المعتمد.',array['متى محاضرتي؟','واتساب المركز']::text[]),
('certificates','إفادات وشهادات التدريب','الشهادات',array['شهادة','شهادات','شهادتي','افادة','إفادة','كيف اطلع شهادة','استخراج الشهادة','التحقق من الشهادة']::text[],'تتعلق إفادات الحضور والشهادات بضوابط الحضور والبرنامج المعتمد وصحة بيانات التسجيل. للحصول على إفادة أو شهادة، أو للاستفسار عن التحقق منها، تواصل مع المركز أو الجهة المصدرة عبر القناة الرسمية.',array['كيف أسجل بياناتي صحيحة؟','واتساب المركز']::text[]),
('manar','التسجيل في منار','الشهادات',array['منار','mnar','كيف اسجل في منار','طريقة التسجيل في منار']::text[],'يمكنك زيارة موقع منار الرسمي للاطلاع على خطوات إنشاء الحساب ومتطلبات إصدار الشهادات. ننصح بالتحقق من التعليمات المباشرة لدى منار؛ إذ قد تختلف خطوات التسجيل حسب نوع الحساب. الرابط: https://mnar.sa. ولا يعني فتح هذا الرابط أن حسابك أُنشئ تلقائيًا.',array['كيف أتواصل مع المركز؟']::text[]),
('assignments','الواجبات والاختبارات','التعلم',array['واجب','واجباتي','واجب الكمي','اختبار','الاختبارات','نتائجي','الدرجة','درجاتي','تقدم التعلم']::text[],'للاطلاع على واجباتك ونتائجك المصرّح بها، سجّل الدخول إلى بوابتك. ويمكن لولي الأمر متابعة بيانات ابنه بعد توثيق الحساب واعتماد ارتباطه بالمتدرب. للاستفسار عن واجب أو نتيجة معينة، تواصل مع المدرب أو المركز.',array['متى محاضرتي؟','كيف أتابع اشتراكي؟']::text[]),
('trainer','قنوات المدربين','التعلم',array['قنوات المدربين','قناة المعلم','المدرب','قناة المدرب','مكتبة التسجيلات','تسجيل المحاضرات']::text[],'للاستفسار عن قنوات المدربين وتسجيلات المحاضرات، راجع الخدمات المتاحة لدفعتك واشتراكك في بوابة المتدرب، أو تواصل مع المركز لمعرفة وسيلة الوصول المعتمدة.',array['التدريب عن بعد','متى محاضرتي؟']::text[]),
('guardian','دخول ولي الأمر','الحسابات',array['ولي الأمر','ابني','ابنتي','ولدي','بناتي','طفلي','الوالد','بوابة ولي الامر']::text[],'متابعة بيانات الابن تحتاج إلى حساب ولي أمر موثق ورابط معتمد بين ولي الأمر والمتدرب. رقم الجوال وحده غير كافٍ للكشف عن الحضور أو الدرجات. يرجى استخدام بوابة ولي الأمر الرسمية للتحقق.',array['الواجبات والاختبارات','الحضور بالباركود']::text[]),
('contact','التواصل مع المركز','التواصل',array['اتواصل','واتساب','رقمكم','رقم المركز','التواصل','الدعم الفني','شكوى','مساعدة','تواصل','اتصال']::text[],'يمكنك التواصل مع مركز سما القدرات للتدريب عبر واتساب الأعمال على 0561606878. رابط المحادثة: https://api.whatsapp.com/send?phone=966561606878&text= . إذا احتجت إلى متابعة طلب، احتفظ برقم الطلب وقدمه للموظف عبر القناة المعتمدة.',array['كيف أسجل؟','ما الباقات المتاحة؟']::text[]),
('unknown','رد عدم المعرفة والتحويل لموظف','عام',array[]::text[],'لا تتوفر لديّ حاليًا معلومة مؤكدة عن هذا السؤال. يمكنني مساعدتك في الباقات أو التسجيل أو الحضور أو التواصل. وللحصول على إجابة تفصيلية، تواصل مع موظف المركز عبر واتساب الأعمال.',array['ما الباقات المتاحة؟','كيف أسجل؟','واتساب المركز']::text[]);
