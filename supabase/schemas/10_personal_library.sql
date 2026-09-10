-- Fresh-project bootstrap. Run the entire file once in the Supabase SQL Editor.
-- No existing tables or user data are modified. All statements are transactional.
begin;
create table public.dotodo_records (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 200000),
  created_at timestamptz not null default now()
);
create index dotodo_records_owner_created on public.dotodo_records(owner_id, created_at desc);
alter table public.dotodo_records enable row level security;
revoke all on public.dotodo_records from anon, authenticated;
grant select, insert, delete on public.dotodo_records to authenticated;
create policy records_read on public.dotodo_records for select to authenticated using ((select auth.uid()) = owner_id);
create policy records_add on public.dotodo_records for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy records_remove on public.dotodo_records for delete to authenticated using ((select auth.uid()) = owner_id);

create table public.dotodo_shares (
  id uuid primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 200000),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at <= created_at + interval '30 days'),
  revoked_at timestamptz
);
create index dotodo_shares_owner_created on public.dotodo_shares(owner_id, created_at desc);
alter table public.dotodo_shares enable row level security;
revoke all on public.dotodo_shares from anon, authenticated;
grant select, insert on public.dotodo_shares to authenticated;
grant update(revoked_at) on public.dotodo_shares to authenticated;
grant select on public.dotodo_shares to service_role;
create policy shares_read on public.dotodo_shares for select to authenticated using ((select auth.uid()) = owner_id);
create policy shares_add on public.dotodo_shares for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy shares_revoke on public.dotodo_shares for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id and revoked_at is not null);
commit;
