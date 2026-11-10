-- اختبار الدورة الكاملة: مالكة (أدمن) + براند + مسوق. يفشل عند أي خطأ.
\set ON_ERROR_STOP on
\set A '''aaaaaaaa-0000-0000-0000-000000000001'''
\set B '''bbbbbbbb-0000-0000-0000-000000000002'''
\set C '''cccccccc-0000-0000-0000-000000000003'''
insert into auth.users (id, phone) values (:A, '966500000001'), (:B, '966500000002'), (:C, '966500000003');

-- التسجيل (كل مستخدم بحسابه)
set role authenticated;
select set_config('request.jwt.claim.sub', :A, false);
insert into profiles (id, role, display_name, cr_number) values (:A, 'brand', 'إدارة رواج', '1010000000');
select set_config('request.jwt.claim.sub', :B, false);
insert into profiles (id, role, display_name, cr_number, niche, is_admin, verif) values (:B, 'brand', 'متجر نخبة', '1010123456', 'تجميل', true, 'verified');
select set_config('request.jwt.claim.sub', :C, false);
insert into profiles (id, role, display_name, mawthooq_license, handles) values (:C, 'marketer', 'سارة', 'MW12345', '{"snapchat":"sara"}');
reset role;
-- المشرف يتعيّن يدوياً من Supabase (لا يقدر أحد يرفع نفسه)
update profiles set is_admin = true where id = :A;
do $$ begin assert (select not is_admin and verif = 'pending' from profiles where id = 'bbbbbbbb-0000-0000-0000-000000000002'), 'self-escalation blocked'; end $$;

-- البراند تنشر حملة 1000 ر.س
set role authenticated;
select set_config('request.jwt.claim.sub', :B, false);
insert into offers (brand_id, title, description, platforms, budget) values (:B, 'إطلاق عطر الشتاء', 'نبي ستوري سناب يعرض العطر مع كود خصم', '{snapchat,tiktok}', 100000);
-- المسوق يقترح 1200 ثم البراند 1100 ثم المسوق يقبل
select set_config('request.jwt.claim.sub', :C, false);
select apply_to_offer((select id from offers limit 1), 120000, 'يشمل 3 ستوريات') as deal_id \gset
select set_config('request.jwt.claim.sub', :B, false);
select counter_offer(:'deal_id', 110000, null);
select set_config('request.jwt.claim.sub', :C, false);
select accept_deal(:'deal_id');
insert into messages (deal_id, sender_id, body) values (:'deal_id', :C, 'كلمني على 0551234567');
-- الدفع ممنوع قبل التوثيق
select set_config('request.jwt.claim.sub', :B, false);
do $$ begin perform fund_deal((select id from deals limit 1)); raise exception 'should fail'; exception when others then assert sqlerrm = 'brand_not_verified', sqlerrm; end $$;
-- الأدمن يوثّق
select set_config('request.jwt.claim.sub', :A, false);
select admin_verify(:B, 'verified'), admin_verify(:C, 'verified');
-- دفع تجريبي، تسليم، اعتماد
select set_config('request.jwt.claim.sub', :B, false);
select fund_deal(:'deal_id');
select set_config('request.jwt.claim.sub', :C, false);
select deliver_deal(:'deal_id', 'https://snapchat.com/t/abc');
select set_config('request.jwt.claim.sub', :B, false);
select approve_deal(:'deal_id');
-- السحب
select set_config('request.jwt.claim.sub', :C, false);
do $$ begin perform request_payout(100000, 'SA0380000000608010167519', 'سارة'); raise exception 'should fail'; exception when others then assert sqlerrm = 'invalid_amount', sqlerrm; end $$;
select request_payout(99000, 'SA03 8000 0000 6080 1016 7519', 'سارة محمد') as pid \gset
select set_config('request.jwt.claim.sub', :A, false);
select admin_set_payout(:'pid', 'paid', 'TRX-1');
-- المسوق ما يشوف صفقات غيره؛ والبراند ما تقدر تعدل الصفقة مباشرة
select set_config('request.jwt.claim.sub', :B, false);
do $$ begin update deals set price = 1; raise exception 'should fail'; exception when insufficient_privilege then null; end $$;
reset role;

-- النتائج
select status, price, brand_fee, vat, total, first_deal, commission, payout from deals;
select body, masked from messages where sender_id is not null;
select type, amount from ledger order by id;
select * from marketer_wallet;
do $$ declare d deals; begin
  select * into d from deals limit 1;
  assert d.status = 'completed' and d.price = 110000 and d.brand_fee = 2750 and d.vat = 413 and d.total = 113163 and d.commission = 11000 and d.payout = 99000, 'fees mismatch';
  assert (select available from marketer_wallet) = 0, 'wallet';
  assert (select body from messages where sender_id is not null) = 'كلمني على •••', 'mask';
end $$;
-- التحرير التلقائي + الحد الأدنى للرسوم (صفقة 150 ر.س ثانية للبراند: 7.5 + 15 < 25 → عمولة المسوق 17.5)
set role authenticated;
select set_config('request.jwt.claim.sub', :C, false);
select apply_to_offer((select id from offers limit 1), 15000, null) is null;  -- الطلب الأول مكتمل فما يتعارض مع الفهرس
reset role;
select 'unique-active blocks duplicate only for active deals' as note;
do $$ declare id2 uuid; begin
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  select id into id2 from deals where status = 'proposed';
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  perform accept_deal(id2);
  perform fund_deal(id2);
  perform set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', true);
  perform deliver_deal(id2, 'https://tiktok.com/@sara/1');
  assert auto_release_due(now() + interval '71 hours') = 0, 'too early';
  assert auto_release_due(now() + interval '73 hours') = 1, 'auto release';
  assert (select brand_fee = 750 and commission = 1750 and payout = 13250 and auto_released from deals where id = id2), 'min fee';
end $$;
select 'ALL TESTS PASSED' as result;
