-- رواج · التحقق على Supabase الفعلي (الدورة 2)
-- يُلصق في SQL Editor بعد تطبيق 0001 و 0002. ينفّذ السيناريو المرجعي (صفقة 1,100 ر.س) بحسابات وهمية
-- ثم يتراجع عن كل شي تلقائياً، فما يبقى أي أثر في قاعدة البيانات أو السجل المالي.
-- النتيجة تظهر كرسالة: «VERIFY_PASSED ...» تعني نجاح كل الفحوص (تظهر بلون الخطأ لأنها هي اللي تلغي التغييرات).
do $$
declare
  a uuid := gen_random_uuid(); b uuid := gen_random_uuid(); c uuid := gen_random_uuid();
  o uuid := gen_random_uuid(); d uuid; p uuid; r deals; n_tables int; n_rls int; cron_ok boolean;
  bad boolean;
begin
  -- 1) الجداول و RLS
  select count(*), count(*) filter (where c2.relrowsecurity) into n_tables, n_rls
  from pg_class c2 join pg_namespace ns on ns.oid = c2.relnamespace
  where ns.nspname = 'public' and c2.relkind = 'r'
    and c2.relname in ('profiles','offers','deals','deal_events','messages','ledger','payout_requests','platform_settings','accounts','admin_audit');
  if n_tables <> 10 or n_rls <> 10 then raise exception 'VERIFY_FAILED tables=% rls=%', n_tables, n_rls; end if;
  select exists (select 1 from cron.job where jobname = 'rawaj-auto-release' and schedule = '*/15 * * * *') into cron_ok;

  -- 2) مستخدمين وهميين بالجوال (الـ trigger ينشئ accounts)
  insert into auth.users (id, phone, aud, role) values (a, '966500000901', 'authenticated', 'authenticated'), (b, '966500000902', 'authenticated', 'authenticated'), (c, '966500000903', 'authenticated', 'authenticated');
  if (select count(*) from accounts where id in (a, b, c)) <> 3 then raise exception 'VERIFY_FAILED accounts trigger'; end if;

  -- 3) التسجيل كمستخدمين عاديين + محاولة رفع الصلاحية
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  insert into profiles (id, role, display_name, cr_number, is_admin, verif) values (b, 'brand', 'براند اختبار', '1010123456', true, 'verified');
  insert into offers (id, brand_id, title, description, platforms, budget) values (o, b, 'حملة اختبار', 'اختبار التحقق على Supabase', '{snapchat}', 100000);
  perform set_config('request.jwt.claim.sub', c::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  insert into profiles (id, role, display_name, mawthooq_license) values (c, 'marketer', 'مسوق اختبار', 'MW00001');
  begin update ledger set amount = 0; bad := true; exception when others then bad := false; end;
  if bad then raise exception 'VERIFY_FAILED ledger writable'; end if;
  begin perform auto_release_due(now() + interval '999 hours'); bad := true; exception when others then bad := false; end;
  if bad then raise exception 'VERIFY_FAILED auto_release callable by user'; end if;
  d := apply_to_offer(o, 120000, null);
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform counter_offer(d, 110000, null);
  perform set_config('request.jwt.claim.sub', c::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform accept_deal(d);

  -- 4) الإدارة توثّق (كاتصال SQL Editor)
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  if (select is_admin or verif <> 'pending' from profiles where id = b) then raise exception 'VERIFY_FAILED self-escalation'; end if;
  update profiles set verif = 'verified' where id in (b, c);

  -- 5) دفع تجريبي، تسليم، اعتماد
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform fund_deal(d);
  perform set_config('request.jwt.claim.sub', c::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', c, 'role', 'authenticated')::text, true);
  perform deliver_deal(d, 'https://snapchat.com/t/test');
  perform set_config('request.jwt.claim.sub', b::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  perform approve_deal(d);
  perform set_config('role', 'postgres', true);

  select * into r from deals where id = d;
  if not (r.status = 'completed' and r.price = 110000 and r.brand_fee = 2750 and r.vat = 413 and r.total = 113163 and r.commission = 11000 and r.payout = 99000) then
    raise exception 'VERIFY_FAILED fees: % % % % % %', r.status, r.brand_fee, r.vat, r.total, r.commission, r.payout;
  end if;

  raise exception 'VERIFY_PASSED | tables=% rls=% | cron=% | deal=% | brand_paid=113163 (1,131.63 SAR) fee=2750 vat=413 | marketer_net=99000 (990 SAR) commission=11000 | ledger_rows=% | rolled back',
    n_tables, n_rls, cron_ok, d, (select count(*) from ledger where deal_id = d);
end $$;
