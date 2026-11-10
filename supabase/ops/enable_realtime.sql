-- يُلصق مرة واحدة في SQL Editor. يفعّل التحديث اللحظي على الجداول اللي تحتاجه الواجهة فقط.
-- لا يغيّر المخطط ولا RLS: Realtime يحترم سياسات RLS، فكل مستخدم يستقبل تغييرات الصفوف اللي يقدر يقرأها فقط.
-- الجداول المالية (ledger) غير مضافة عمداً.
alter publication supabase_realtime add table public.deals, public.offers, public.profiles, public.payout_requests, public.messages, public.deal_events;
select tablename from pg_publication_tables where pubname = 'supabase_realtime' order by 1;
