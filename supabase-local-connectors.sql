-- Scoped local repository connectors and approval-gated Git synchronization.
-- Source bodies and credential values are never stored in these tables.

create table if not exists public.local_connectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  token_prefix text not null check (char_length(token_prefix) between 6 and 20),
  label text not null check (char_length(label) between 1 and 120),
  repository_label text not null default '',
  repository_url text not null default '',
  manifest jsonb,
  manifest_id text not null default '',
  git_state jsonb,
  state_fingerprint text not null default '',
  agent_version text not null default '',
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (manifest is null or octet_length(manifest::text) <= 2500000),
  check (git_state is null or octet_length(git_state::text) <= 100000),
  check (state_fingerprint = '' or state_fingerprint ~ '^[a-f0-9]{64}$')
);

create index if not exists local_connectors_user_created_idx
  on public.local_connectors (user_id, created_at desc);

create table if not exists public.local_connector_operations (
  operation_id text primary key check (operation_id ~ '^op-[a-f0-9]{64}$'),
  connector_id uuid not null references public.local_connectors(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('push', 'pull_ff_only')),
  status text not null check (status in ('queued', 'running', 'succeeded', 'failed')),
  state_fingerprint text not null check (state_fingerprint ~ '^[a-f0-9]{64}$'),
  expected_state jsonb not null,
  result jsonb,
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  check (octet_length(expected_state::text) <= 20000),
  check (result is null or octet_length(result::text) <= 20000)
);

create index if not exists local_connector_operations_queue_idx
  on public.local_connector_operations (connector_id, status, requested_at);

create unique index if not exists local_connector_one_active_operation_idx
  on public.local_connector_operations (connector_id)
  where status in ('queued', 'running');

create table if not exists public.local_connector_operation_events (
  id bigint generated always as identity primary key,
  operation_id text not null references public.local_connector_operations(operation_id) on delete restrict,
  connector_id uuid not null references public.local_connectors(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('queued', 'running', 'succeeded', 'failed')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (octet_length(detail::text) <= 20000)
);

create index if not exists local_connector_events_operation_idx
  on public.local_connector_operation_events (operation_id, created_at);

alter table public.local_connectors enable row level security;
alter table public.local_connector_operations enable row level security;
alter table public.local_connector_operation_events enable row level security;

revoke all on table public.local_connectors from public, anon, authenticated;
revoke all on table public.local_connector_operations from public, anon, authenticated;
revoke all on table public.local_connector_operation_events from public, anon, authenticated;
grant all on table public.local_connectors to service_role;
grant all on table public.local_connector_operations to service_role;
grant all on table public.local_connector_operation_events to service_role;
grant usage, select on sequence public.local_connector_operation_events_id_seq to service_role;

create or replace function public.reject_local_connector_event_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'local connector operation events are append-only';
end;
$$;

revoke execute on function public.reject_local_connector_event_mutation() from public, anon, authenticated;
grant execute on function public.reject_local_connector_event_mutation() to service_role;

drop trigger if exists protect_local_connector_operation_events on public.local_connector_operation_events;
create trigger protect_local_connector_operation_events
before update or delete on public.local_connector_operation_events
for each row execute function public.reject_local_connector_event_mutation();
