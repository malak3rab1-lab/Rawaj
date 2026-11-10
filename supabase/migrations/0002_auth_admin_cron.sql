-- =====================================================================
-- رواج · الدورة 2 · 2026-11-10
-- يُطبَّق بعد 0001_init.sql. ما يغيّر أي جدول أو رسوم في 0001، يضيف فقط:
--   1) جدول accounts ينشأ تلقائياً لكل مستخدم يدخل برقم الجوال (trigger على auth.users)
--   2) سجل تدقيق لعمليات الإدارة + دالة تعيين مشرف (من SQL Editor فقط)
--   3) جدولة التحرير التلقائي كل 15 دقيقة عبر pg_cron
--   4) تقوية الصلاحيات: Supabase يمنح anon/authenticated حق تنفيذ أي دالة جديدة افتراضياً،
--      فنسحبه من الدوال الداخلية ونقصر fund_deal(sandbox=false) على service_role فعلياً.
-- =====================================================================

-- ---------- 1) الحساب الأساسي عند أول دخول بالجوال ----------
-- profiles (في 0001) تتطلب الدور والاسم والسجل/الرخصة، فما تنشأ تلقائياً.
-- accounts تنشأ فوراً عند التحقق من OTP، والتطبيق يعرف منها إن المستخدم جديد (ما عنده profiles بعد).
create table if not exists accounts (
  id         uuid primary key references auth.users on delete cascade,
  phone      text unique check (phone ~ '^\+?9665\d{8}$'),
  created_at timestamptz not null default now(),
  last_seen  timestamptz
);
alter table accounts enable row level security;
drop policy if exists accounts_read_own on accounts;
create policy accounts_read_own on accounts for select to authenticated using (id = auth.uid() or is_admin());

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- رقم سعودي فقط (+9665XXXXXXXX). Supabase يخزن الرقم بدون + عادةً.
  if new.phone is null or new.phone !~ '^\+?9665\d{8}$' then
    raise exception 'saudi_mobile_only';
  end if;
  insert into accounts (id, phone) values (new.id, new.phone)
  on conflict (id) do update set last_seen = now();          -- مستخدم موجود مسبقاً
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();

-- ---------- 2) سجل التدقيق وتعيين المشرف ----------
create table if not exists admin_audit (
  id        bigserial primary key,
  actor     text not null,            -- من نفّذ: مستخدم الإدارة أو 'sql-editor'
  action    text not null,
  target    uuid,
  detail    jsonb,
  at        timestamptz not null default now()
);
alter table admin_audit enable row level security;
drop policy if exists audit_read on admin_audit;
create policy audit_read on admin_audit for select to authenticated using (is_admin());
create or replace function audit_immutable() returns trigger language plpgsql as $$
begin raise exception 'audit_is_append_only'; end $$;
drop trigger if exists audit_no_update on admin_audit;
create trigger audit_no_update before update or delete on admin_audit for each row execute function audit_immutable();

-- تعيين مشرف برقم الجوال. تُشغَّل من Supabase SQL Editor فقط (غير متاحة لأي مستخدم من التطبيق).
-- المستخدم لازم يكون دخل التطبيق مرة وأكمل ملفه (profiles) قبل التعيين.
create or replace function grant_admin(p_phone text, p_on boolean default true) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select a.id into v_id from accounts a where a.phone = regexp_replace(p_phone, '^\+', '') or a.phone = p_phone;
  if v_id is null then raise exception 'phone_not_registered'; end if;
  if not exists (select 1 from profiles where id = v_id) then raise exception 'profile_not_completed'; end if;
  update profiles set is_admin = p_on, verif = case when p_on then 'verified' else verif end, verif_at = now() where id = v_id;
  insert into admin_audit (actor, action, target, detail) values ('sql-editor', case when p_on then 'grant_admin' else 'revoke_admin' end, v_id, jsonb_build_object('phone', p_phone));
  return v_id;
end $$;

-- تسجيل قرارات الإدارة الحالية في سجل التدقيق (دالة لكل جدول لأن أعمدتها مختلفة)
create or replace function audit_profiles_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.verif is distinct from old.verif or new.is_admin is distinct from old.is_admin then
    insert into admin_audit (actor, action, target, detail)
    values (coalesce(auth.uid()::text, 'sql-editor'), 'verif_change', new.id, jsonb_build_object('from', old.verif, 'to', new.verif, 'is_admin', new.is_admin, 'note', new.verif_note));
  end if;
  return new;
end $$;
create or replace function audit_deals_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.resolved_by is not null and old.resolved_by is null then
    insert into admin_audit (actor, action, target, detail) values (new.resolved_by::text, 'deal_resolved', new.id, jsonb_build_object('status', new.status));
  end if;
  return new;
end $$;
create or replace function audit_payouts_fn() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into admin_audit (actor, action, target, detail) values (coalesce(auth.uid()::text, 'sql-editor'), 'payout_' || new.status, new.id, jsonb_build_object('amount', new.amount));
  end if;
  return new;
end $$;
drop trigger if exists audit_profiles on profiles;
create trigger audit_profiles after update on profiles for each row execute function audit_profiles_fn();
drop trigger if exists audit_deals on deals;
create trigger audit_deals after update on deals for each row execute function audit_deals_fn();
drop trigger if exists audit_payouts on payout_requests;
create trigger audit_payouts after update on payout_requests for each row execute function audit_payouts_fn();

-- ---------- 4) تقوية الصلاحيات ----------
-- fund_deal في 0001 يعتبر أي استدعاء بدون مستخدم = service. على Supabase الزائر (anon) ما عنده مستخدم،
-- فنتحقق من دور JWT صراحةً: service_role، أو اتصال مباشر بقاعدة البيانات بدون JWT (SQL Editor / pg_cron).
create or replace function _is_service() returns boolean
language sql stable as $$
  select auth.uid() is null
     and coalesce(nullif(current_setting('request.jwt.claims', true), '')::json->>'role', 'service_role') = 'service_role'
$$;

create or replace function fund_deal(p_deal uuid, p_payment_ref text default null, p_sandbox boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare d deals := _deal_for_update(p_deal); f record; first boolean; is_service boolean := _is_service();
begin
  if d.status <> 'agreed' then raise exception 'not_agreed'; end if;
  if not is_service and (not p_sandbox or auth.uid() is distinct from d.brand_id) then raise exception 'not_allowed'; end if;
  if (select verif from profiles where id = d.brand_id) <> 'verified' then raise exception 'brand_not_verified'; end if;
  if (select verif from profiles where id = d.marketer_id) <> 'verified' then raise exception 'marketer_not_verified'; end if;
  first := is_first_deal(d.brand_id);
  f := brand_fees(d.price, first);
  update deals set status = 'funded', funded_at = now(), brand_fee = f.fee, vat = f.vat, total = f.total, first_deal = first,
    payment_ref = p_payment_ref, sandbox = not is_service and p_sandbox, updated_at = now() where id = p_deal;
  insert into ledger (deal_id, user_id, type, amount, provider_ref) values
    (p_deal, d.brand_id, 'charge', f.total, p_payment_ref),
    (p_deal, null, 'hold', d.price, p_payment_ref),
    (p_deal, null, 'brand_fee', f.fee, p_payment_ref),
    (p_deal, null, 'vat', f.vat, p_payment_ref);
  perform _log(p_deal, 'دفع وإيداع في الضمان', f.total, null, coalesce(auth.uid(), d.brand_id));
  perform _sys(p_deal, 'انحجز المبلغ في الضمان. يقدر المسوق يبدأ التنفيذ.');
end $$;

-- الزائر غير المسجل ما ينفذ أي دالة
revoke execute on all functions in schema public from anon, public;
-- الدوال الداخلية ما تُستدعى من التطبيق أبداً (وإلا يقدر أحد يحرر صفقة مباشرة)
revoke execute on function
  _release(deals, text, boolean, uuid), _log(uuid, text, integer, text, uuid), _sys(uuid, text),
  _deal_for_update(uuid), auto_release_due(timestamptz), grant_admin(text, boolean), handle_new_user(),
  audit_profiles_fn(), audit_deals_fn(), audit_payouts_fn(), audit_immutable()
from authenticated;
-- المسموح للمستخدم المسجل فقط (نفس قائمة 0001)
grant execute on function
  apply_to_offer(uuid, integer, text), counter_offer(uuid, integer, text), accept_deal(uuid), reject_deal(uuid),
  withdraw_deal(uuid), fund_deal(uuid, text, boolean), deliver_deal(uuid, text, text), approve_deal(uuid),
  open_dispute(uuid, text), admin_resolve(uuid, text), admin_cancel(uuid), request_payout(integer, text, text),
  admin_set_payout(uuid, payout_status, text), admin_verify(uuid, verif_status, text),
  brand_fees(integer, boolean), creator_cut(integer, integer), is_admin(), setting(text), is_first_deal(uuid),
  _side(deals), _is_service()
to authenticated;
-- الجداول: الزائر ما يقرأ شي، والمستخدم ما يكتب مباشرة إلا في profiles/offers/messages (والباقي عبر RPC)
revoke all on all tables in schema public from anon;
revoke insert, update, delete, truncate on deals, deal_events, ledger, payout_requests, platform_settings, accounts, admin_audit from authenticated;
revoke delete, truncate on profiles, offers, messages from authenticated;
alter default privileges in schema public revoke execute on functions from anon, public;

-- ---------- 3) جدولة التحرير التلقائي ----------
-- على Supabase: فعّل pg_cron من Database → Extensions أولاً (أو السطر التالي يفعّله).
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'rawaj-auto-release';
    perform cron.schedule('rawaj-auto-release', '*/15 * * * *', 'select public.auto_release_due()');
  else
    raise notice 'pg_cron غير متوفر هنا (اختبار محلي) — الجدولة تُفعَّل على Supabase';
  end if;
end $$;
