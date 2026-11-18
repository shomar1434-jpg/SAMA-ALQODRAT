-- قرار المالك 18 نوفمبر: عند مراجعة المتدرب لإجاباته تظهر الإجابة الصحيحة مع إجابته دائمًا (بعد التسليم، وبعد آخر محاولة إن تعددت).
-- كل الواجبات تُضبط على «بعد التسليم مباشرة»، ومشغّل يُبقيها كذلك لكل حفظ لاحق ↔ canReveal في src/learning_logic.js
update assignments set reveal = 'after_submit' where reveal <> 'after_submit';
create or replace function assignments_reveal_always() returns trigger language plpgsql set search_path = public, extensions as $$
begin new.reveal := 'after_submit'; return new; end $$;
drop trigger if exists assignments_reveal_always on assignments;
create trigger assignments_reveal_always before insert or update of reveal on assignments for each row execute function assignments_reveal_always();
revoke execute on function assignments_reveal_always() from public, anon, authenticated;
