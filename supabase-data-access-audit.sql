-- Server-side canvas-content access audit. Safe to re-run.
-- This records application service-role paths; it cannot make a Supabase
-- project owner blind to plaintext or detect SQL run directly by that owner.

create table if not exists public.server_data_access_audit (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid not null,
  owner_user_id uuid not null,
  canvas_id text not null,
  source text not null check (source in ('shared_canvas_api', 'mcp', 'system_runtime')),
  purpose text not null check (purpose in (
    'collaborator_canvas_read', 'collaborator_canvas_write',
    'mcp_canvas_operation', 'system_map_runtime'
  )),
  operation text not null check (operation in ('read', 'write', 'read_for_write')),
  outcome text not null check (outcome in ('allowed', 'denied'))
);

create index if not exists server_data_access_audit_owner_canvas_time_idx
  on public.server_data_access_audit (owner_user_id, canvas_id, occurred_at desc);

alter table public.server_data_access_audit enable row level security;
revoke all on table public.server_data_access_audit from public, anon, authenticated;
grant select, insert on table public.server_data_access_audit to service_role;
grant usage, select on sequence public.server_data_access_audit_id_seq to service_role;

create or replace function public.reject_server_data_access_audit_mutation()
  returns trigger language plpgsql set search_path = public as $$
begin
  raise exception 'server_data_access_audit is append-only';
end;
$$;

drop trigger if exists protect_server_data_access_audit_history on public.server_data_access_audit;
create trigger protect_server_data_access_audit_history
before update or delete on public.server_data_access_audit
for each row execute function public.reject_server_data_access_audit_mutation();

create or replace function public.get_my_canvas_data_access_audit(
  p_canvas_id text default null,
  p_limit integer default 100
)
returns table (
  occurred_at timestamptz,
  actor_user_id uuid,
  canvas_id text,
  source text,
  purpose text,
  operation text,
  outcome text
)
language sql security definer stable set search_path = public as $$
  select audit.occurred_at, audit.actor_user_id, audit.canvas_id,
         audit.source, audit.purpose, audit.operation, audit.outcome
  from public.server_data_access_audit audit
  where audit.owner_user_id = auth.uid()
    and (p_canvas_id is null or audit.canvas_id = p_canvas_id)
  order by audit.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

revoke execute on function public.get_my_canvas_data_access_audit(text, integer) from public, anon;
grant execute on function public.get_my_canvas_data_access_audit(text, integer) to authenticated;
