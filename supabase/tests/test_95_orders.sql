-- الخطوة M: لكل تسجيل طلب برقم فريد؛ المراجعة والسداد محوران مستقلان؛ الحساب البنكي لا يُعرض قبل تفعيله؛ ومنع الحضور خيار معطّل افتراضيًا
\set ON_ERROR_STOP on
do $$
declare r jsonb; r2 jsonb; o orders; pl plans; v_admin uuid; ok boolean; n int; d date := riyadh_now()::date; v_code text;
  p jsonb := '{"national_id":"1999999961","full_name":"سالم ناصر علي القحطاني","phone":"0557770061","gender":"ذكر","birth_date":"1995-01-01","city":"جازان","education":"جامعي"}';
begin
  p := p || jsonb_build_object('accepted_policies', (select coalesce(jsonb_agg(id), '[]') from current_policies(riyadh_now()::date) where requires_acceptance));   -- سياسة إلزامية من اختبار سابق
  select * into pl from plans where tier = 'basic' and mode = 'in_person';
  r := register_subscription(p || jsonb_build_object('plan_id', pl.id));
  assert r->'order'->>'number' ~ '^SAMA-[0-9]{4}-[0-9]{6}$', 'رقم الطلب بالصيغة المعتمدة';
  assert (r->'order'->>'due_now')::numeric = pl.reg_fee and (r->'order'->>'total')::numeric = pl.reg_fee + pl.installments * pl.installment_amount, 'المطلوب الآن = رسوم التسجيل، والإجمالي = الرسوم + الأقساط';
  assert r->'order'->>'approval' = 'pending_review' and r->'order'->>'payment' = 'unpaid', 'الحالتان الابتدائيتان';
  assert r->'order'->'bank' = 'null'::jsonb, 'الحساب البنكي لا يُعرض قبل تفعيله';
  select * into o from orders where number = r->'order'->>'number';
  assert (select count(*) from order_events where order_id = o.id and action = 'created') = 1, 'حدث الإنشاء';

  -- الإبلاغ بالتحويل: رقم الطلب وحده لا يكفي
  begin perform order_report_transfer(jsonb_build_object('number', o.number, 'amount', 690, 'date', d)); ok := false; exception when others then ok := true; end;
  assert ok, 'رقم الطلب وحده لا يمنح وصولًا';
  begin perform order_report_transfer(jsonb_build_object('number', o.number, 'national_id', '1999999999', 'amount', 690, 'date', d)); ok := false; exception when others then ok := true; end;
  assert ok, 'سجل مدني خاطئ يُرفض';
  begin perform order_report_transfer(jsonb_build_object('number', o.number, 'national_id', '1999999961', 'amount', 690, 'date', d + 1)); ok := false; exception when others then ok := true; end;
  assert ok, 'تاريخ مستقبلي يُرفض';
  r2 := order_report_transfer(jsonb_build_object('number', o.number, 'national_id', '1999999961', 'amount', pl.reg_fee, 'date', d, 'reference', 'TRX-1'));
  assert r2->>'payment' = 'claimed' and r2->>'approval' = 'pending_review', 'الإبلاغ لا يؤكد السداد ولا يغيّر المراجعة';

  -- غير المسؤول لا يقرر
  begin perform admin_review_order(o.id, 'approved'); ok := false; exception when others then ok := true; end;
  assert ok, 'المراجعة للمسؤول فقط';
  begin perform admin_confirm_payment(o.id, 690); ok := false; exception when others then ok := true; end;
  assert ok, 'تأكيد السداد للمسؤول فقط';

  v_admin := gen_random_uuid(); insert into auth.users(id, email) values (v_admin, 'orders-admin@test'); insert into admins(user_id, role) values (v_admin, 'full');
  perform set_config('app.uid', v_admin::text, true);
  begin perform admin_review_order(o.id, 'rejected', ''); ok := false; exception when others then ok := true; end;
  assert ok, 'الرفض يحتاج سببًا';
  begin perform admin_review_order(o.id, 'approved', '', 1); ok := false; exception when others then ok := true; end;
  assert ok, 'إصدار قديم يُرفض (تغيّر الطلب بعد الإبلاغ)';
  perform admin_review_order(o.id, 'approved', '', (select version from orders where id = o.id));
  select * into o from orders where id = o.id;
  assert o.approval = 'approved' and o.payment = 'claimed' and not order_ready(o), 'الموافقة لا تثبت وصول التحويل';
  begin perform admin_confirm_payment(o.id, pl.reg_fee - 1); ok := false; exception when others then ok := true; end;
  assert ok, 'مبلغ أقل من المطلوب لا يُعد سدادًا';
  perform admin_confirm_payment(o.id, pl.reg_fee);
  select * into o from orders where id = o.id;
  assert o.payment = 'confirmed' and order_ready(o), 'موافقة + سداد مؤكد = مستوفٍ';
  perform admin_confirm_payment(o.id, 0, false, 'خطأ في المطابقة');
  assert (select payment from orders where id = o.id) = 'claimed', 'إلغاء التأكيد يعيد حالة التحويل';

  -- الحساب البنكي
  begin perform admin_save_bank('{"bank":"البنك الأهلي","beneficiary":"مركز سما القدرات","iban":"SA1210000001400012583009","enabled":true}'); ok := false; exception when others then ok := true; end;
  assert ok, 'آيبان خاطئ يُرفض';
  perform admin_save_bank('{"bank":"البنك الأهلي","beneficiary":"مركز سما القدرات","iban":"SA12 1000 0001 4000 1258 3008","account":"01400012583008","enabled":true}');
  select * into o from orders where id = o.id;
  assert order_public(o)->'bank'->>'iban' = 'SA1210000001400012583008' and order_public(o)->'bank' ? 'enabled' = false, 'يظهر الحساب بعد التفعيل';

  -- السجلات المالية لا تُحذف
  begin delete from orders where id = o.id; ok := false; exception when others then ok := true; end;
  assert ok, 'لا حذف لطلب';
  begin delete from order_events where order_id = o.id; ok := false; exception when others then ok := true; end;
  assert ok, 'لا حذف لسجل الطلب';

  -- بوابة الحضور: معطّلة افتراضيًا، وعند تفعيلها يُمنع غير المستوفي إلا بقبول مؤقت
  assert (select require_order_approval from settings where id = 1) = false, 'المنع معطّل افتراضيًا';
  update settings set require_order_approval = true where id = 1;
  perform set_config('sama.checkin', 'on', true);
  begin insert into sub_attendance(subscription_id, trainee_id, att_date, status) values (o.subscription_id, o.trainee_id, d, 'حاضر'); ok := false;
  exception when sqlstate 'SAM01' then ok := true; end;
  assert ok, 'يُمنع حضور طلب غير مستوفٍ عند تفعيل الخيار';
  perform admin_order_provisional(o.id, true, 'وعد بالسداد نهاية الأسبوع');
  insert into sub_attendance(subscription_id, trainee_id, att_date, status) values (o.subscription_id, o.trainee_id, d, 'حاضر');
  delete from sub_attendance where subscription_id = o.subscription_id and att_date = d;
  perform set_config('sama.checkin', '', true);
  insert into sub_attendance(subscription_id, trainee_id, att_date, status) values (o.subscription_id, o.trainee_id, d - 1, 'حاضر');   -- خارج المسح (يدوي) لا يُمنع
  delete from sub_attendance where subscription_id = o.subscription_id and att_date = d - 1;
  update settings set require_order_approval = false where id = 1;

  -- البوابة: المتدرب يرى طلبه دون هوية المراجع
  perform set_config('app.uid', '', true); perform set_config('app.phone', '0557770061', true);
  r := portal_data('student');
  assert jsonb_array_length(r->'orders') = 1 and r->'orders'->0->>'number' = o.number, 'طلب المتدرب في بوابته';
  assert position(v_admin::text in (r->'orders')::text) = 0, 'بلا هوية المراجع';
  r2 := order_report_transfer(jsonb_build_object('order_id', o.id, 'amount', pl.reg_fee, 'date', d));
  assert r2->>'payment' = 'claimed', 'الإبلاغ من جلسة البوابة';
  perform set_config('app.phone', '0557770099', true);
  begin perform order_report_transfer(jsonb_build_object('order_id', o.id, 'amount', 1, 'date', d)); ok := false; exception when others then ok := true; end;
  assert ok, 'جوال آخر لا يصل إلى الطلب';
  perform set_config('app.phone', '', true);

  -- تسجيل برنامج: طلب واحد يضم تسجيلاته
  r := register_trainee(p || jsonb_build_object('program_id', (select program_id from cohorts where archived_at is null order by start_date limit 1)));
  assert (r->>'ok')::boolean, 'تسجيل البرنامج';
  if true then
    assert r->'order'->>'number' <> o.number and r->'order'->>'kind' = 'program', 'طلب مستقل برقم جديد';
    assert (select cardinality(enrollment_ids) from orders where number = r->'order'->>'number') >= 1, 'الطلب مربوط بتسجيلاته';
  end if;
  delete from admins where user_id = v_admin; delete from auth.users where id = v_admin;
end $$;
