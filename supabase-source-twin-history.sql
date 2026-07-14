-- Workflow Canvas source twin history and signed GitHub push events. Safe to re-run.
-- These rows are operational evidence inside the project database, not an external
-- immutable transparency log. Source contents and credential values are never stored.

create table if not exists public.source_twin_snapshots (
  id bigint generated always as identity primary key,
  source_id text not null,
  snapshot_id text not null unique,
  snapshot_key text not null,
  manifest_id text not null,
  commit_sha text,
  captured_at timestamptz not null default now(),
  reason text not null check (reason in ('deployment', 'manual')),
  snapshot jsonb not null,
  unique (source_id, snapshot_key)
);

create index if not exists source_twin_snapshots_source_time_idx
  on public.source_twin_snapshots (source_id, captured_at desc);

create table if not exists public.source_twin_events (
  id bigint generated always as identity primary key,
  source_id text not null,
  delivery_id text not null unique,
  event_type text not null check (event_type = 'push'),
  ref text not null,
  before_sha text,
  after_sha text,
  repository text not null,
  changed_paths jsonb not null default '[]',
  commits jsonb not null default '[]',
  received_at timestamptz not null default now()
);

create index if not exists source_twin_events_source_time_idx
  on public.source_twin_events (source_id, received_at desc);

alter table public.source_twin_snapshots enable row level security;
alter table public.source_twin_events enable row level security;

revoke all on table public.source_twin_snapshots, public.source_twin_events from public, anon, authenticated;
grant select, insert on table public.source_twin_snapshots, public.source_twin_events to service_role;
grant usage, select on sequence public.source_twin_snapshots_id_seq, public.source_twin_events_id_seq to service_role;

create or replace function public.reject_source_twin_history_mutation()
  returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'source twin history is append-only';
end;
$$;

revoke execute on function public.reject_source_twin_history_mutation() from public, anon, authenticated;
grant execute on function public.reject_source_twin_history_mutation() to service_role;

drop trigger if exists protect_source_twin_snapshots_history on public.source_twin_snapshots;
create trigger protect_source_twin_snapshots_history
before update or delete on public.source_twin_snapshots
for each row execute function public.reject_source_twin_history_mutation();

drop trigger if exists protect_source_twin_events_history on public.source_twin_events;
create trigger protect_source_twin_events_history
before update or delete on public.source_twin_events
for each row execute function public.reject_source_twin_history_mutation();
