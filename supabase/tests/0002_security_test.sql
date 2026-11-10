-- اختبار الدورة 2: الدخول بالجوال، تعيين المشرفة، وسد ثغرات الصلاحيات الافتراضية. يُشغَّل بعد 0001_flow_test.sql.
\set ON_ERROR_STOP on
-- دخول جديد برقم سعودي ينشئ accounts تلقائياً، والرقم غير السعودي يُرفض
insert into auth.users (id, phone) values ('dddddddd-0000-0000-0000-000000000004', '966551112233');
do $$ begin assert (select count(*) from accounts where phone = '966551112233') = 1, 'account auto-created'; end $$;
do $$ begin insert into auth.users (id, phone) values (gen_random_uuid(), '201001234567'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'saudi_mobile_only', sqlerrm; end $$;
-- تعيين المشرفة: يفشل قبل إكمال الملف، وينجح بعده ويُسجَّل في التدقيق
do $$ begin perform grant_admin('+966551112233'); raise exception 'should fail';
  exception when others then assert sqlerrm = 'profile_not_completed', sqlerrm; end $$;
set role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', false);
insert into profiles (id, role, display_name, cr_number) values ('dddddddd-0000-0000-0000-000000000004', 'brand', 'M.A', '1010999999');
-- المستخدم ما يقدر يعيّن نفسه مشرف لا بالتعديل ولا بالدالة
update profiles set is_admin = true, verif = 'verified' where id = 'dddddddd-0000-0000-0000-000000000004';
do $$ begin perform grant_admin('+966551112233'); raise exception 'should fail';
  exception when insufficient_privilege then null; end $$;
reset role;
do $$ begin assert (select not is_admin and verif = 'pending' from profiles where id = 'dddddddd-0000-0000-0000-000000000004'), 'no self-escalation'; end $$;
select grant_admin('+966551112233');
do $$ begin
  assert (select is_admin and verif = 'verified' from profiles where id = 'dddddddd-0000-0000-0000-000000000004'), 'admin granted';
  assert exists (select 1 from admin_audit where action = 'grant_admin'), 'audited';
end $$;
-- المستخدم المسجل ما يقدر يستدعي الدوال الداخلية ولا يقدّم موعد التحرير
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
do $$ begin perform auto_release_due(now() + interval '999 hours'); raise exception 'should fail'; exception when insufficient_privilege then null; end $$;
do $$ begin perform _release((select d from deals d limit 1), 'x', false, null); raise exception 'should fail'; exception when insufficient_privilege then null; end $$;
do $$ begin update ledger set amount = 0; raise exception 'should fail'; exception when insufficient_privilege then null; end $$;
do $$ begin delete from ledger; raise exception 'should fail'; exception when insufficient_privilege then null; end $$;
do $$ begin insert into payout_requests (marketer_id, amount, iban, holder) values (auth.uid(), 999999, 'SA0380000000608010167519', 'xxx'); raise exception 'should fail'; exception when insufficient_privilege then null; end $$;
-- الزائر (anon) ما يقرأ ولا ينفذ شي
set role anon;
select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin perform fund_deal(gen_random_uuid(), 'x', false); raise exception 'should fail'; exception when insufficient_privilege then null; end $$;
do $$ begin perform count(*) from profiles; raise exception 'should fail'; exception when insufficient_privilege then null; end $$;
reset role;
-- حتى لو انمنح anon التنفيذ بالغلط، fund_deal يرفض لأن دوره ليس service_role
select set_config('request.jwt.claims', '{"role":"anon"}', false);
do $$ begin assert not _is_service(), 'anon is not service'; end $$;
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
do $$ begin assert _is_service(), 'service_role recognized'; end $$;
select set_config('request.jwt.claims', '', false);
-- السجل المالي ما يتعدل حتى من الإدارة
do $$ begin update ledger set amount = 0; raise exception 'should fail'; exception when others then assert sqlerrm = 'ledger_is_append_only', sqlerrm; end $$;
select count(*) as audit_rows from admin_audit;
select 'CYCLE 2 SECURITY TESTS PASSED' as result;
