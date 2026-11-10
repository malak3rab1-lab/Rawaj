-- =====================================================================
-- رواج · Rawaj — قاعدة بيانات الإنتاج (PostgreSQL / Supabase)
-- الدورة 1 · 2026-11-10
-- مطابقة لنموذج البيانات في التطبيق الحي (https://claude.ai/artifact/DHCRms1zzJ5Lxqc7FUxZoG)
-- وللقرارات المعتمدة في المخطط التقني (https://claude.ai/artifact/SwAbhdD8sTFkf3TBR5gbgA).
--
-- مبادئ:
--   * كل المبالغ بالهللة (integer). 1 ر.س = 100 هللة.
--   * تغيير حالة الصفقة والمال يتم فقط عبر دوال (RPC) على الخادم، وليس بتعديل مباشر من التطبيق.
--   * سجل مالي (ledger) لا يُعدَّل ولا يُحذف.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- الأنواع ----------
create type user_role     as enum ('brand', 'marketer');
create type verif_status  as enum ('pending', 'verified', 'rejected', 'suspended');
create type offer_status  as enum ('open', 'closed');
create type deal_status   as enum ('proposed', 'agreed', 'funded', 'delivered', 'completed', 'disputed', 'rejected', 'cancelled', 'refunded');
create type deal_side     as enum ('brand', 'marketer');
create type payout_status as enum ('pending', 'paid', 'rejected');
create type ledger_type   as enum ('charge', 'brand_fee', 'vat', 'hold', 'release', 'commission', 'refund', 'payout');

-- ---------- الإعدادات المعتمدة (M.A · 2026-11-10) ----------
create table platform_settings (
  key   text primary key,
  value numeric not null,
  note  text
);
insert into platform_settings (key, value, note) values
  ('brand_fee_bps',        500, 'رسوم البراند 5٪'),
  ('creator_fee_bps',     1000, 'عمولة المسوق 10٪ للجميع، المشاهير ضمناً'),
  ('min_fee_halalas',     2500, 'أقل رسوم إجمالية للصفقة 25 ر.س (تُكمَّل من جهة المسوق)'),
  ('first_deal_off_bps',  5000, 'خصم أول صفقة للبراند 50٪ من رسوم البراند فقط، ولا تكون صفراً أبداً'),
  ('vat_bps',             1500, 'ضريبة القيمة المضافة 15٪ على رسوم المنصة'),
  ('auto_release_hours',    72, 'تحرير تلقائي بعد 72 ساعة من التسليم بدون اعتراض'),
  ('min_budget_halalas', 10000, 'أقل ميزانية للحملة 100 ر.س'),
  ('min_withdraw_halalas', 5000, 'أقل مبلغ سحب 50 ر.س');

create or replace function setting(k text) returns numeric
language sql stable as $$ select value from platform_settings where key = k $$;

-- ---------- الحسابات ----------
create table profiles (
  id               uuid primary key references auth.users on delete cascade,
  role             user_role not null,
  display_name     text not null check (length(display_name) between 2 and 60),
  niche            text,
  city             text,
  bio              text check (length(bio) <= 400),
  cr_number        text check (cr_number ~ '^\d{10}$'),                 -- السجل التجاري (براند)
  mawthooq_license text check (length(mawthooq_license) between 4 and 20), -- رخصة موثوق (مسوق)
  followers_range  text,
  handles          jsonb not null default '{}'::jsonb,                 -- {"snapchat":"..","instagram":"..","tiktok":".."}
  verif            verif_status not null default 'pending',
  verif_note       text,
  verif_at         timestamptz,
  is_admin         boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint brand_has_cr        check (role <> 'brand'    or cr_number is not null),
  constraint marketer_has_license check (role <> 'marketer' or mawthooq_license is not null)
);

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from profiles where id = auth.uid()), false)
$$;

-- المستخدم ما يقدر يوثّق نفسه أو يرفع صلاحيته؛ وتعديل رقم السجل/الرخصة بعد الرفض يرجّع الحالة "قيد المراجعة"
-- security invoker عمداً: current_user هنا هو دور المستدعي (authenticated) وليس مالك الدالة
create or replace function profiles_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user = 'authenticated' and not is_admin() then
    if tg_op = 'INSERT' then
      new.verif := 'pending'; new.is_admin := false; new.verif_note := null; new.verif_at := null;
    else
      new.verif := old.verif; new.is_admin := old.is_admin; new.verif_note := old.verif_note; new.verif_at := old.verif_at; new.role := old.role;
      if old.verif = 'rejected' and (new.cr_number is distinct from old.cr_number or new.mawthooq_license is distinct from old.mawthooq_license) then
        new.verif := 'pending';
      end if;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_guard before insert or update on profiles for each row execute function profiles_guard();

-- ---------- الحملات ----------
create table offers (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references profiles(id),
  title         text not null check (length(title) between 4 and 80),
  description   text not null check (length(description) between 10 and 1500),
  platforms     text[] not null check (cardinality(platforms) > 0 and platforms <@ array['snapchat','instagram','tiktok']),
  content_types text[] not null default '{}',
  budget        integer not null,                       -- لكل مسوق، بالهللة
  slots         integer not null default 1 check (slots between 1 and 50),
  days          integer not null default 7 check (days between 1 and 60),
  status        offer_status not null default 'open',
  created_at    timestamptz not null default now()
);
create index offers_open_idx on offers (status, created_at desc);

create or replace function offers_guard() returns trigger
language plpgsql as $$
begin
  if new.budget < setting('min_budget_halalas') then raise exception 'budget_below_minimum'; end if;
  if tg_op = 'UPDATE' and new.brand_id <> old.brand_id then raise exception 'brand_immutable'; end if;
  return new;
end $$;
create trigger offers_guard before insert or update on offers for each row execute function offers_guard();

-- ---------- الصفقات ----------
create table deals (
  id             uuid primary key default gen_random_uuid(),
  offer_id       uuid not null references offers(id),
  brand_id       uuid not null references profiles(id),
  marketer_id    uuid not null references profiles(id),
  price          integer not null check (price > 0),
  status         deal_status not null default 'proposed',
  turn           deal_side not null default 'brand',      -- على من الدور في التفاوض
  last_note      text,
  -- تُثبَّت عند الدفع
  brand_fee      integer, vat integer, total integer, first_deal boolean, payment_ref text, sandbox boolean,
  -- تُثبَّت عند التحرير / الاسترداد
  commission     integer, payout integer, refund integer, auto_released boolean not null default false,
  proof_url      text, proof_note text,
  dispute_by     uuid references profiles(id), dispute_reason text, resolved_by uuid references profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  agreed_at timestamptz, funded_at timestamptz, delivered_at timestamptz, completed_at timestamptz, refunded_at timestamptz, disputed_at timestamptz,
  check (brand_id <> marketer_id)
);
-- طلب واحد جارٍ لكل مسوق على نفس الحملة (بعد اكتمال الصفقة يقدر يقدم مرة ثانية)
create unique index deals_one_active on deals (offer_id, marketer_id) where status in ('proposed', 'agreed', 'funded', 'delivered', 'disputed');
create index deals_brand_idx on deals (brand_id, updated_at desc);
create index deals_marketer_idx on deals (marketer_id, updated_at desc);
create index deals_release_idx on deals (delivered_at) where status = 'delivered';

create table deal_events (
  id        bigserial primary key,
  deal_id   uuid not null references deals(id) on delete cascade,
  actor_id  uuid references profiles(id),                -- null = النظام
  action    text not null,
  amount    integer,
  note      text,
  at        timestamptz not null default now()
);

create table messages (
  id        bigserial primary key,
  deal_id   uuid not null references deals(id) on delete cascade,
  sender_id uuid references profiles(id),                -- null = رسالة نظام
  body      text not null check (length(body) between 1 and 1000),
  masked    boolean not null default false,
  at        timestamptz not null default now()
);
create index messages_deal_idx on messages (deal_id, at);

-- ---------- المال ----------
create table ledger (
  id          bigserial primary key,
  deal_id     uuid references deals(id),
  user_id     uuid references profiles(id),              -- null = حساب المنصة
  type        ledger_type not null,
  amount      integer not null,
  provider_ref text,
  at          timestamptz not null default now()
);
create or replace function ledger_immutable() returns trigger language plpgsql as $$
begin raise exception 'ledger_is_append_only'; end $$;
create trigger ledger_no_update before update or delete on ledger for each row execute function ledger_immutable();

create table payout_requests (
  id          uuid primary key default gen_random_uuid(),
  marketer_id uuid not null references profiles(id),
  amount      integer not null check (amount > 0),
  iban        text not null check (iban ~ '^SA\d{22}$'),
  holder      text not null check (length(holder) >= 3),
  status      payout_status not null default 'pending',
  bank_ref    text,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);

-- =====================================================================
-- حساب الرسوم (نفس منطق التطبيق الحي)
-- =====================================================================
create or replace function brand_fees(p_price integer, p_first boolean,
  out full_fee integer, out fee integer, out vat integer, out total integer)
language plpgsql stable as $$
begin
  full_fee := round(p_price * setting('brand_fee_bps') / 10000.0);
  fee      := case when p_first then round(full_fee * (10000 - setting('first_deal_off_bps')) / 10000.0) else full_fee end;
  if p_price > 0 and fee < 1 then fee := 1; end if;     -- لا رسوم صفرية أبداً
  vat      := round(fee * setting('vat_bps') / 10000.0);
  total    := p_price + fee + vat;
end $$;

create or replace function creator_cut(p_price integer, p_brand_fee integer,
  out commission integer, out payout integer)
language plpgsql stable as $$
begin
  commission := round(p_price * setting('creator_fee_bps') / 10000.0);
  if p_price > 0 and commission + coalesce(p_brand_fee, 0) < setting('min_fee_halalas') then
    commission := least(p_price, setting('min_fee_halalas')::integer - coalesce(p_brand_fee, 0));
  end if;
  payout := p_price - commission;
end $$;

create or replace function is_first_deal(p_brand uuid) returns boolean
language sql stable as $$ select not exists (select 1 from deals where brand_id = p_brand and funded_at is not null) $$;

-- =====================================================================
-- انتقالات الصفقة (RPC) — التطبيق يستدعي هذه الدوال فقط
-- =====================================================================
create or replace function _deal_for_update(p_deal uuid) returns deals
language plpgsql security definer set search_path = public as $$
declare d deals;
begin
  select * into d from deals where id = p_deal for update;
  if not found then raise exception 'deal_not_found'; end if;
  return d;
end $$;

create or replace function _side(d deals) returns deal_side
language sql stable as $$
  select case when auth.uid() = d.brand_id then 'brand'::deal_side when auth.uid() = d.marketer_id then 'marketer'::deal_side end
$$;

create or replace function _log(p_deal uuid, p_action text, p_amount integer default null, p_note text default null, p_actor uuid default auth.uid())
returns void language sql security definer set search_path = public as $$
  insert into deal_events (deal_id, actor_id, action, amount, note) values (p_deal, p_actor, p_action, p_amount, p_note);
$$;

create or replace function _sys(p_deal uuid, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into messages (deal_id, sender_id, body) values (p_deal, null, p_body);
$$;

-- المسوق يقدم على حملة (بالميزانية أو بسعر مقترح)
create or replace function apply_to_offer(p_offer uuid, p_price integer default null, p_note text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare o offers; p profiles; v_price integer; v_id uuid;
begin
  select * into p from profiles where id = auth.uid();
  if p.role is distinct from 'marketer' then raise exception 'marketers_only'; end if;
  if p.verif = 'suspended' then raise exception 'account_suspended'; end if;
  select * into o from offers where id = p_offer;
  if not found or o.status <> 'open' then raise exception 'offer_not_open'; end if;
  v_price := coalesce(p_price, o.budget);
  if v_price < setting('min_budget_halalas') then raise exception 'price_below_minimum'; end if;
  insert into deals (offer_id, brand_id, marketer_id, price, turn, last_note)
  values (o.id, o.brand_id, auth.uid(), v_price, 'brand', p_note) returning id into v_id;
  perform _log(v_id, case when p_price is null or p_price = o.budget then 'قبول الميزانية' else 'تقديم بسعر مقترح' end, v_price, p_note);
  return v_id;
end $$;

-- عرض مضاد من الطرف اللي عليه الدور
create or replace function counter_offer(p_deal uuid, p_price integer, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d deals := _deal_for_update(p_deal); s deal_side := _side(d);
begin
  if d.status <> 'proposed' or s is distinct from d.turn then raise exception 'not_your_turn'; end if;
  if p_price < setting('min_budget_halalas') then raise exception 'price_below_minimum'; end if;
  update deals set price = p_price, last_note = p_note, turn = case when s = 'brand' then 'marketer'::deal_side else 'brand'::deal_side end, updated_at = now() where id = p_deal;
  perform _log(p_deal, 'عرض مضاد', p_price, p_note);
end $$;

create or replace function accept_deal(p_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d deals := _deal_for_update(p_deal);
begin
  if d.status <> 'proposed' or _side(d) is distinct from d.turn then raise exception 'not_your_turn'; end if;
  update deals set status = 'agreed', agreed_at = now(), last_note = null, updated_at = now() where id = p_deal;
  perform _log(p_deal, 'تم الاتفاق', d.price);
  perform _sys(p_deal, 'تم الاتفاق. الخطوة الجاية: دفع البراند.');
end $$;

create or replace function reject_deal(p_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d deals := _deal_for_update(p_deal);
begin
  if d.status <> 'proposed' or _side(d) is distinct from d.turn then raise exception 'not_your_turn'; end if;
  update deals set status = 'rejected', updated_at = now() where id = p_deal;
  perform _log(p_deal, 'رفض العرض');
end $$;

create or replace function withdraw_deal(p_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d deals := _deal_for_update(p_deal);
begin
  if d.status <> 'proposed' or _side(d) is null or _side(d) = d.turn then raise exception 'cannot_withdraw'; end if;
  update deals set status = 'cancelled', updated_at = now() where id = p_deal;
  perform _log(p_deal, 'سحب العرض');
end $$;

-- تثبيت الدفع في الضمان. في الإنتاج يستدعيها webhook بوابة الدفع (Tap) بصلاحية service_role.
-- p_sandbox = true يسمح للبراند نفسه بالدفع التجريبي لين تتفعل البوابة.
create or replace function fund_deal(p_deal uuid, p_payment_ref text default null, p_sandbox boolean default true)
returns void language plpgsql security definer set search_path = public as $$
declare d deals := _deal_for_update(p_deal); f record; first boolean; is_service boolean := auth.uid() is null;  -- webhook بوابة الدفع يتصل بمفتاح service_role بدون مستخدم
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

create or replace function deliver_deal(p_deal uuid, p_url text, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare d deals := _deal_for_update(p_deal);
begin
  if d.status <> 'funded' or auth.uid() is distinct from d.marketer_id then raise exception 'not_allowed'; end if;
  if p_url !~ '^https?://\S+\.\S+' then raise exception 'invalid_url'; end if;
  update deals set status = 'delivered', delivered_at = now(), proof_url = p_url, proof_note = p_note, updated_at = now() where id = p_deal;
  perform _log(p_deal, 'تسليم المحتوى', null, p_note);
  perform _sys(p_deal, 'سلّم المسوق المحتوى. عند البراند 72 ساعة للاعتماد أو الاعتراض.');
end $$;

-- تحرير المبلغ للمسوق (اعتماد البراند، أو قرار الإدارة، أو تلقائي)
create or replace function _release(d deals, p_action text, p_auto boolean, p_actor uuid) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  c := creator_cut(d.price, d.brand_fee);
  update deals set status = 'completed', completed_at = now(), commission = c.commission, payout = c.payout,
    auto_released = p_auto, resolved_by = case when p_action like 'قرار الإدارة%' then p_actor end, updated_at = now() where id = d.id;
  insert into ledger (deal_id, user_id, type, amount) values
    (d.id, d.marketer_id, 'release', c.payout),
    (d.id, null, 'commission', c.commission);
  perform _log(d.id, p_action, c.payout, null, p_actor);
  perform _sys(d.id, 'تحرر المبلغ لمحفظة المسوق.');
end $$;

create or replace function approve_deal(p_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d deals := _deal_for_update(p_deal);
begin
  if d.status <> 'delivered' or auth.uid() is distinct from d.brand_id then raise exception 'not_allowed'; end if;
  perform _release(d, 'اعتماد وتحرير المبلغ', false, auth.uid());
end $$;

create or replace function open_dispute(p_deal uuid, p_reason text) returns void
language plpgsql security definer set search_path = public as $$
declare d deals := _deal_for_update(p_deal);
begin
  if d.status not in ('funded', 'delivered') or _side(d) is null then raise exception 'not_allowed'; end if;
  if length(coalesce(p_reason, '')) < 5 then raise exception 'reason_required'; end if;
  update deals set status = 'disputed', dispute_by = auth.uid(), dispute_reason = p_reason, disputed_at = now(), updated_at = now() where id = p_deal;
  perform _log(p_deal, 'فتح نزاع', null, p_reason);
  perform _sys(p_deal, 'انفتح نزاع. المبلغ موقوف لين تراجع الإدارة.');
end $$;

-- قرار الإدارة: release = للمسوق، refund = استرداد كامل للبراند
create or replace function admin_resolve(p_deal uuid, p_decision text) returns void
language plpgsql security definer set search_path = public as $$
declare d deals := _deal_for_update(p_deal);
begin
  if not is_admin() then raise exception 'admins_only'; end if;
  if d.status not in ('funded', 'delivered', 'disputed') then raise exception 'not_in_escrow'; end if;
  if p_decision = 'release' then
    perform _release(d, 'قرار الإدارة: تحرير للمسوق', false, auth.uid());
  elsif p_decision = 'refund' then
    update deals set status = 'refunded', refunded_at = now(), refund = d.total, resolved_by = auth.uid(), updated_at = now() where id = p_deal;
    insert into ledger (deal_id, user_id, type, amount) values (p_deal, d.brand_id, 'refund', d.total);
    perform _log(p_deal, 'قرار الإدارة: استرداد للبراند', d.total);
    perform _sys(p_deal, 'قررت إدارة رواج استرداد المبلغ للبراند.');
  else raise exception 'invalid_decision'; end if;
end $$;

create or replace function admin_cancel(p_deal uuid) returns void
language plpgsql security definer set search_path = public as $$
declare d deals := _deal_for_update(p_deal);
begin
  if not is_admin() then raise exception 'admins_only'; end if;
  if d.status not in ('proposed', 'agreed') then raise exception 'not_cancellable'; end if;
  update deals set status = 'cancelled', updated_at = now() where id = p_deal;
  perform _log(p_deal, 'ألغتها الإدارة');
end $$;

-- تحرير تلقائي: تُجدول كل 15 دقيقة (pg_cron أو Supabase Scheduled Function)
create or replace function auto_release_due(p_now timestamptz default now()) returns integer
language plpgsql security definer set search_path = public as $$
declare d deals; n integer := 0;
begin
  for d in select * from deals where status = 'delivered'
           and delivered_at + make_interval(hours => setting('auto_release_hours')::integer) <= p_now
           for update skip locked loop
    perform _release(d, 'تحرير تلقائي بعد 72 ساعة من التسليم', true, null);
    n := n + 1;
  end loop;
  return n;
end $$;

-- =====================================================================
-- المحفظة والسحب
-- =====================================================================
create or replace view marketer_wallet with (security_invoker = true) as
select p.id as marketer_id,
  coalesce((select sum(payout) from deals where marketer_id = p.id and status = 'completed'), 0)::integer as earned,
  coalesce((select sum(amount) from payout_requests where marketer_id = p.id and status <> 'rejected'), 0)::integer as withdrawn,
  (coalesce((select sum(payout) from deals where marketer_id = p.id and status = 'completed'), 0)
   - coalesce((select sum(amount) from payout_requests where marketer_id = p.id and status <> 'rejected'), 0))::integer as available
from profiles p where p.role = 'marketer';

create or replace function request_payout(p_amount integer, p_iban text, p_holder text) returns uuid
language plpgsql security definer set search_path = public as $$
declare avail integer; v_id uuid;
begin
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));   -- يمنع طلبين متزامنين يتجاوزون الرصيد
  select available into avail from marketer_wallet where marketer_id = auth.uid();
  if avail is null then raise exception 'marketers_only'; end if;
  if p_amount < setting('min_withdraw_halalas') or p_amount > avail then raise exception 'invalid_amount'; end if;
  insert into payout_requests (marketer_id, amount, iban, holder) values (auth.uid(), p_amount, upper(replace(p_iban, ' ', '')), p_holder) returning id into v_id;
  return v_id;
end $$;

create or replace function admin_set_payout(p_id uuid, p_status payout_status, p_bank_ref text default null) returns void
language plpgsql security definer set search_path = public as $$
declare r payout_requests;
begin
  if not is_admin() then raise exception 'admins_only'; end if;
  select * into r from payout_requests where id = p_id for update;
  if r.status <> 'pending' then raise exception 'already_done'; end if;
  update payout_requests set status = p_status, bank_ref = p_bank_ref, done_at = now() where id = p_id;
  if p_status = 'paid' then insert into ledger (user_id, type, amount, provider_ref) values (r.marketer_id, 'payout', r.amount, p_bank_ref); end if;
end $$;

create or replace function admin_verify(p_user uuid, p_status verif_status, p_note text default null) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'admins_only'; end if;
  update profiles set verif = p_status, verif_note = p_note, verif_at = now() where id = p_user;
end $$;

-- =====================================================================
-- إخفاء بيانات التواصل في المحادثة (جوال، إيميل، واتساب/تيليجرام)
-- =====================================================================
create or replace function messages_mask() returns trigger language plpgsql as $$
declare b text := new.body;
begin
  if new.sender_id is null then return new; end if;
  b := regexp_replace(b, '[[:alnum:]._%+-]+@[[:alnum:]-]+\.[[:alnum:].]+', '•••', 'g');
  b := regexp_replace(b, '(https?://)?(wa\.me|t\.me|api\.whatsapp\.com|chat\.whatsapp\.com)/\S*', '•••', 'gi');
  b := regexp_replace(b, '(\+|00)?[0-9٠-٩][0-9٠-٩ -]{7,}[0-9٠-٩]', '•••', 'g');
  new.masked := b <> new.body;
  new.body := b;
  return new;
end $$;
create trigger messages_mask before insert on messages for each row execute function messages_mask();

-- =====================================================================
-- صلاحيات الصفوف (RLS)
-- =====================================================================
alter table profiles        enable row level security;
alter table offers          enable row level security;
alter table deals           enable row level security;
alter table deal_events     enable row level security;
alter table messages        enable row level security;
alter table ledger          enable row level security;
alter table payout_requests enable row level security;
alter table platform_settings enable row level security;

create policy settings_read on platform_settings for select to authenticated using (true);

create policy profiles_read   on profiles for select to authenticated using (true);
create policy profiles_insert on profiles for insert to authenticated with check (id = auth.uid());
create policy profiles_update on profiles for update to authenticated using (id = auth.uid() or is_admin());

create policy offers_read   on offers for select to authenticated using (status = 'open' or brand_id = auth.uid() or is_admin());
create policy offers_insert on offers for insert to authenticated with check (
  brand_id = auth.uid() and exists (select 1 from profiles where id = auth.uid() and role = 'brand' and verif <> 'suspended'));
create policy offers_update on offers for update to authenticated using (brand_id = auth.uid() or is_admin());

-- الصفقات: قراءة فقط للطرفين والإدارة؛ أي تغيير عبر الدوال أعلاه
create policy deals_read  on deals       for select to authenticated using (auth.uid() in (brand_id, marketer_id) or is_admin());
create policy events_read on deal_events for select to authenticated using (
  exists (select 1 from deals d where d.id = deal_id and (auth.uid() in (d.brand_id, d.marketer_id) or is_admin())));

create policy messages_read on messages for select to authenticated using (
  exists (select 1 from deals d where d.id = deal_id and (auth.uid() in (d.brand_id, d.marketer_id) or is_admin())));
create policy messages_insert on messages for insert to authenticated with check (
  sender_id = auth.uid() and exists (select 1 from deals d where d.id = deal_id and (auth.uid() in (d.brand_id, d.marketer_id) or is_admin())));

create policy ledger_read  on ledger          for select to authenticated using (user_id = auth.uid() or is_admin());
create policy payouts_read on payout_requests for select to authenticated using (marketer_id = auth.uid() or is_admin());

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on profiles, offers to authenticated;
grant insert on messages to authenticated;
grant usage on all sequences in schema public to authenticated;
revoke execute on all functions in schema public from public;
grant execute on function
  apply_to_offer(uuid, integer, text), counter_offer(uuid, integer, text), accept_deal(uuid), reject_deal(uuid),
  withdraw_deal(uuid), fund_deal(uuid, text, boolean), deliver_deal(uuid, text, text), approve_deal(uuid),
  open_dispute(uuid, text), admin_resolve(uuid, text), admin_cancel(uuid), request_payout(integer, text, text),
  admin_set_payout(uuid, payout_status, text), admin_verify(uuid, verif_status, text),
  brand_fees(integer, boolean), creator_cut(integer, integer), is_admin(), setting(text), is_first_deal(uuid)
to authenticated;
-- تحتاجها السياسات والمشغلات بصلاحية المستخدم
grant execute on function _side(deals), profiles_guard(), offers_guard(), messages_mask(), ledger_immutable() to authenticated;
