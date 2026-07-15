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

create table if not exists public.system_operation_audit (
  id bigint generated always as identity primary key,
  operation_id text not null unique check (operation_id ~ '^op-[a-f0-9]{64}$'),
  actor_user_id uuid not null,
  operation_type text not null,
  target_key text not null,
  state_fingerprint text not null check (state_fingerprint ~ '^[a-f0-9]{8,128}$'),
  outcome text not null check (outcome in ('applied')),
  result jsonb not null,
  created_at timestamptz not null default now(),
  check (octet_length(result::text) <= 50000)
);

create index if not exists system_operation_audit_target_time_idx
  on public.system_operation_audit (target_key, created_at desc);

alter table public.source_twin_snapshots enable row level security;
alter table public.source_twin_events enable row level security;
alter table public.system_operation_audit enable row level security;

revoke all on table public.source_twin_snapshots, public.source_twin_events from public, anon, authenticated;
grant select, insert on table public.source_twin_snapshots, public.source_twin_events to service_role;
grant usage, select on sequence public.source_twin_snapshots_id_seq, public.source_twin_events_id_seq to service_role;

revoke all on table public.system_operation_audit from public, anon, authenticated;
grant select, insert on table public.system_operation_audit to service_role;
grant usage, select on sequence public.system_operation_audit_id_seq to service_role;

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

create or replace function public.reject_system_operation_audit_mutation()
  returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'system operation audit is append-only';
end;
$$;

revoke execute on function public.reject_system_operation_audit_mutation() from public, anon, authenticated;
grant execute on function public.reject_system_operation_audit_mutation() to service_role;

drop trigger if exists protect_system_operation_audit on public.system_operation_audit;
create trigger protect_system_operation_audit
before update or delete on public.system_operation_audit
for each row execute function public.reject_system_operation_audit_mutation();

create or replace function public.apply_source_twin_snapshot_operation(
  p_operation_id text,
  p_actor_user_id uuid,
  p_operation_type text,
  p_target_key text,
  p_state_fingerprint text,
  p_source_id text,
  p_snapshot_id text,
  p_snapshot_key text,
  p_manifest_id text,
  p_commit_sha text,
  p_captured_at timestamptz,
  p_reason text,
  p_snapshot jsonb,
  p_audit_result jsonb
)
returns table (
  result_created boolean,
  result_snapshot_id text,
  result_manifest_id text,
  result_commit_sha text,
  result_captured_at timestamptz,
  result_reason text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_created boolean := false;
  v_snapshot_id text;
  v_manifest_id text;
  v_commit_sha text;
  v_captured_at timestamptz;
  v_reason text;
begin
  if p_operation_id !~ '^op-[a-f0-9]{64}$'
    or p_state_fingerprint !~ '^[a-f0-9]{8,128}$'
    or p_operation_type <> 'source-twin.snapshot.create'
    or p_target_key <> 'workflow-canvas:self-source'
    or p_source_id <> 'workflow-canvas:self-source'
    or p_reason <> 'manual'
    or p_actor_user_id is null
    or jsonb_typeof(p_snapshot) is distinct from 'object'
    or jsonb_typeof(p_audit_result) is distinct from 'object'
    or p_snapshot ->> 'operationId' is distinct from p_operation_id
    or p_snapshot ->> 'id' is distinct from p_snapshot_id
    or p_snapshot ->> 'snapshotKey' is distinct from p_snapshot_key
    or p_snapshot ->> 'sourceId' is distinct from p_source_id
    or p_snapshot ->> 'manifestId' is distinct from p_manifest_id
    or p_snapshot ->> 'reason' is distinct from p_reason
    or p_audit_result ->> 'snapshotId' is distinct from p_snapshot_id
    or p_audit_result ->> 'manifestId' is distinct from p_manifest_id
  then
    raise exception 'invalid source twin operation payload';
  end if;

  insert into public.system_operation_audit (
    operation_id, actor_user_id, operation_type, target_key,
    state_fingerprint, outcome, result
  ) values (
    p_operation_id, p_actor_user_id, p_operation_type, p_target_key,
    p_state_fingerprint, 'applied', p_audit_result
  );

  insert into public.source_twin_snapshots (
    source_id, snapshot_id, snapshot_key, manifest_id,
    commit_sha, captured_at, reason, snapshot
  ) values (
    p_source_id, p_snapshot_id, p_snapshot_key, p_manifest_id,
    nullif(p_commit_sha, ''), p_captured_at, p_reason, p_snapshot
  )
  on conflict (source_id, snapshot_key) do nothing
  returning true, snapshot_id, manifest_id, commit_sha, captured_at, reason
    into v_created, v_snapshot_id, v_manifest_id, v_commit_sha, v_captured_at, v_reason;

  if not found then
    select false, snapshot_id, manifest_id, commit_sha, captured_at, reason
      into v_created, v_snapshot_id, v_manifest_id, v_commit_sha, v_captured_at, v_reason
    from public.source_twin_snapshots
    where source_id = p_source_id and snapshot_key = p_snapshot_key;
  end if;

  return query select v_created, v_snapshot_id, v_manifest_id, v_commit_sha, v_captured_at, v_reason;
end;
$$;

revoke execute on function public.apply_source_twin_snapshot_operation(
  text, uuid, text, text, text, text, text, text, text, text,
  timestamptz, text, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_source_twin_snapshot_operation(
  text, uuid, text, text, text, text, text, text, text, text,
  timestamptz, text, jsonb, jsonb
) to service_role;

notify pgrst, 'reload schema';
