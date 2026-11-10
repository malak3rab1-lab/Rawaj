-- للاختبار المحلي فقط: يحاكي ما يوفره Supabase. لا يُشغَّل على Supabase.
-- يشمل الصلاحيات الافتراضية في Supabase (anon/authenticated يأخذون كل شي على أي جدول أو دالة جديدة)
-- عشان نتأكد إن 0002 يسحبها فعلاً.
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key, phone text, aud text, role text);
-- محاكاة جدول وظائف pg_cron (على Supabase يوفّره الامتداد)
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text, schedule text, command text);
create or replace function auth.uid() returns uuid language sql stable as
  $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema auth to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
