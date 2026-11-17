-- الخطوة BE: «أبلغوني» بالموافقة، وعدّ الاستفسارات بلا أرقام، والتنبيه بعد 10 دون فتح التسجيل، والحملات بلا تكرار
\set ON_ERROR_STOP on
do $$
declare v_adm uuid := gen_random_uuid(); v_prog uuid; r jsonb; ok boolean; v_c uuid; v_i uuid; v_open boolean;
begin
  select id into v_prog from programs where active limit 1;
  select coalesce(bool_or(reg_open), false) into v_open from cohorts where program_id = v_prog;
  -- بلا موافقة أو برقم خاطئ: مرفوض
  begin perform assistant_register_interest(jsonb_build_object('full_name','سارة علي','phone','0551112233','kind','program','ref_id',v_prog)); ok := false; exception when others then ok := sqlerrm like '%وافق%'; end;
  assert ok, 'الموافقة إلزامية';
  begin perform assistant_register_interest(jsonb_build_object('full_name','سارة علي','phone','12345','kind','program','ref_id',v_prog,'consent',true)); ok := false; exception when others then ok := sqlerrm like '%واتساب%'; end;
  assert ok, 'رقم واتساب صحيح';
  perform assistant_register_interest(jsonb_build_object('full_name','سارة علي القحطاني','phone','٠٥٥١١١٢٢٣٣','kind','program','ref_id',v_prog,'consent',true));
  perform assistant_register_interest(jsonb_build_object('full_name','سارة علي','phone','0551112233','kind','program','ref_id',v_prog,'consent',true));
  assert (select count(*) from assistant_interests where phone = '0551112233') = 1, 'لا تكرار للمهتم نفسه بالمنتج نفسه، والأرقام العربية تُحوَّل';
  -- الاستفسارات: محادثة واحدة = استفسار واحد، والتنبيه عند الحادي عشر
  for i in 1..10 loop r := assistant_note_inquiry('sess-' || lpad(i::text, 6, '0'), 'program', v_prog); end loop;
  r := assistant_note_inquiry('sess-000001', 'program', v_prog);
  assert (r->>'demand')::boolean = false and (select count(*) from assistant_inquiries where ref_id = v_prog) = 10, 'عشرة استفسارات لا تكفي، والتكرار من المحادثة نفسها لا يُحتسب';
  r := assistant_note_inquiry('sess-000011', 'program', v_prog);
  assert (r->>'demand')::boolean and (select alerted_at from assistant_demand where ref_id = v_prog) is not null, 'الحادي عشر ينبّه';
  assert coalesce((select bool_or(reg_open) from cohorts where program_id = v_prog), false) = v_open, 'لا يُفتح التسجيل آليًا';
  assert (assistant_note_inquiry('bad session!', 'program', v_prog)->>'ok')::boolean = false, 'معرّف محادثة غير صالح يُتجاهل';
  -- الإدارة
  begin perform admin_assistant_interests(); ok := false; exception when others then ok := true; end;
  assert ok, 'الزائر لا يرى المهتمين';
  insert into auth.users(id, email) values (v_adm, 'be-adm@test'); insert into admins(user_id, role, name) values (v_adm, 'staff', 'موظف');
  perform set_config('app.uid', v_adm::text, true);
  r := admin_assistant_interests();
  assert jsonb_array_length(r->'interests') = 1 and (r->'interests'->0->>'name') is not null, 'المسؤول يرى المهتم واسم البرنامج';
  v_c := (admin_assistant_campaign(jsonb_build_object('kind','availability','product_kind','program','ref_id',v_prog))->>'id')::uuid;
  assert (select handled_at from assistant_demand where ref_id = v_prog) is not null, 'الحملة تعالج التنبيه';
  select id into v_i from assistant_interests where phone = '0551112233';
  perform admin_assistant_mark_sent(v_c, v_i); perform admin_assistant_mark_sent(v_c, v_i);
  assert (select count(*) from assistant_sends where campaign_id = v_c) = 1, 'الإرسال يُسجَّل مرة واحدة';
  perform admin_assistant_new_cycle('program', v_prog);
  assert (assistant_note_inquiry('sess-000099', 'program', v_prog)->>'demand')::boolean = false, 'الدورة الجديدة تبدأ العد من جديد';
  perform admin_assistant_interest_set(v_i, false);
  assert not (select active from assistant_interests where id = v_i), 'إيقاف الرسائل للمهتم';
  perform set_config('app.uid', '', true);
end $$;
