-- Persisted, append-only runtime evidence for the internal system map.
-- Contains sanitized operational results only; never canvas bodies or secrets.

create table if not exists public.system_runtime_observations (
  id             bigint generated always as identity primary key,
  system_id      text        not null check (char_length(system_id) between 1 and 160),
  canvas_id      text        not null check (char_length(canvas_id) between 1 and 240),
  node_id        text        not null check (char_length(node_id) between 1 and 240),
  part_id        text        not null check (char_length(part_id) between 1 and 240),
  capability_id  text        not null check (char_length(capability_id) between 1 and 240),
  resource_id    text        not null check (char_length(resource_id) between 1 and 240),
  status         text        not null check (status in ('healthy', 'degraded', 'unknown', 'failed')),
  verification   text        not null check (verification in ('verified', 'partial', 'unavailable', 'failed')),
  observed_at    timestamptz not null,
  result         jsonb       not null check (
    jsonb_typeof(result) = 'object'
    and octet_length(result::text) <= 100000
  ),
  created_at     timestamptz not null default now()
);

create index if not exists system_runtime_observations_latest_idx
  on public.system_runtime_observations (system_id, canvas_id, observed_at desc);

create index if not exists system_runtime_observations_target_idx
  on public.system_runtime_observations (system_id, canvas_id, node_id, part_id, observed_at desc);

alter table public.system_runtime_observations enable row level security;

revoke all on table public.system_runtime_observations from PUBLIC, anon, authenticated;
revoke all on sequence public.system_runtime_observations_id_seq from PUBLIC, anon, authenticated;

-- The server verifies WORKFLOW_CANVAS_OWNER_USER_ID before reading or writing.
-- No browser role receives direct access, so a canvas author cannot forge LIVE evidence.
grant select, insert, delete on table public.system_runtime_observations to service_role;
grant usage, select on sequence public.system_runtime_observations_id_seq to service_role;

notify pgrst, 'reload schema';
