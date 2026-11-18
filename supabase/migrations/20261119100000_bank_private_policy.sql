-- الخطوة BO (قرار المالك 19 نوفمبر): صور بنك الأسئلة خاصة
-- كانت حاوية «bank» عامة بمسارات متسلسلة يسهل تخمينها، فيُنزَّل البنك كاملًا دون دخول.
-- الآن تُقرأ الصور بروابط موقّعة قصيرة الأجل (createSignedUrls) لا يصدرها التخزين إلا لمن تسمح له هذه الدالة:
--   • مسؤول، • حساب بوابة مفعَّل (جلسة جهاز قائمة: متدرب أو مدرب أو ولي أمر)،
--   • زائر اختبار تحديد المستوى: صور أسئلة محاولة بدأت في آخر 3 ساعات فقط.
-- جلسة مجهولة بلا تفعيل (ينشئها أي زائر) لا تكفي.
create or replace function public.bank_object_ok(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(p_name, '') <> '' and (
    is_admin()
    or exists (select 1 from device_sessions d where d.uid = auth.uid() and auth.uid() is not null and d.revoked_at is null)
    or exists (
      select 1 from placement_attempts a
        cross join lateral jsonb_array_elements(coalesce(a.snapshot, '[]'::jsonb)) x
        join questions q on q.id = (x->>'id')::uuid
       where a.started_at > now() - interval '3 hours' and (q.image = p_name or q.page_image = p_name))
  );
$$;
revoke execute on function public.bank_object_ok(text) from public;
grant execute on function public.bank_object_ok(text) to anon, authenticated;

do $$ begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists bank_signed_read on storage.objects;
    create policy bank_signed_read on storage.objects for select to anon, authenticated
      using (bucket_id = 'bank' and public.bank_object_ok(name));
  end if;
end $$;
