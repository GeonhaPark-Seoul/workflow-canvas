-- Read-only, application-wide operational aggregates for the internal system map.
-- Run in Supabase Dashboard -> SQL Editor after supabase-schema.sql.

drop function if exists public.get_own_canvas_summaries(integer);
drop function if exists public.get_workflow_system_operational_snapshot();

create or replace function public.get_workflow_system_operational_snapshot()
returns table (
  account_count bigint,
  canvas_count bigint,
  node_count bigint,
  edge_count bigint,
  note_count bigint,
  canvases_updated_24h bigint,
  accounts_updated_24h bigint,
  canvases_updated_7d bigint,
  accounts_updated_7d bigint,
  invalid_document_count bigint,
  active_invitation_count bigint,
  active_email_invitation_count bigint,
  active_link_invitation_count bigint,
  active_membership_count bigint,
  revoked_membership_count bigint,
  canvas_scope_share_count bigint,
  group_scope_share_count bigint,
  node_scope_share_count bigint,
  latest_canvas_update timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  with canvas_stats as (
    select
      count(distinct c.user_id)::bigint as account_count,
      count(*)::bigint as canvas_count,
      coalesce(sum(case when jsonb_typeof(c.nodes) = 'array' then jsonb_array_length(c.nodes) else 0 end), 0)::bigint as node_count,
      coalesce(sum(case when jsonb_typeof(c.edges) = 'array' then jsonb_array_length(c.edges) else 0 end), 0)::bigint as edge_count,
      coalesce(sum(case when jsonb_typeof(c.notes) = 'array' then jsonb_array_length(c.notes) else 0 end), 0)::bigint as note_count,
      count(*) filter (where c.updated_at >= now() - interval '24 hours')::bigint as canvases_updated_24h,
      count(distinct c.user_id) filter (where c.updated_at >= now() - interval '24 hours')::bigint as accounts_updated_24h,
      count(*) filter (where c.updated_at >= now() - interval '7 days')::bigint as canvases_updated_7d,
      count(distinct c.user_id) filter (where c.updated_at >= now() - interval '7 days')::bigint as accounts_updated_7d,
      count(*) filter (
        where jsonb_typeof(c.nodes) <> 'array'
           or jsonb_typeof(c.edges) <> 'array'
           or jsonb_typeof(c.notes) <> 'array'
      )::bigint as invalid_document_count,
      max(c.updated_at) as latest_canvas_update
    from public.canvases c
  ),
  share_stats as (
    select
      count(*) filter (where s.invitation_active)::bigint as active_invitation_count,
      count(*) filter (where s.invitation_active and s.invitee_email is not null)::bigint as active_email_invitation_count,
      count(*) filter (where s.invitation_active and s.link_token is not null)::bigint as active_link_invitation_count,
      count(*) filter (where s.scope = 'canvas')::bigint as canvas_scope_share_count,
      count(*) filter (where s.scope = 'group')::bigint as group_scope_share_count,
      count(*) filter (where s.scope = 'node')::bigint as node_scope_share_count
    from public.canvas_shares s
  ),
  membership_stats as (
    select count(*)::bigint as active_membership_count from public.share_members
  ),
  revocation_stats as (
    select count(*)::bigint as revoked_membership_count from public.share_revocations
  )
  select
    c.account_count,
    c.canvas_count,
    c.node_count,
    c.edge_count,
    c.note_count,
    c.canvases_updated_24h,
    c.accounts_updated_24h,
    c.canvases_updated_7d,
    c.accounts_updated_7d,
    c.invalid_document_count,
    s.active_invitation_count,
    s.active_email_invitation_count,
    s.active_link_invitation_count,
    m.active_membership_count,
    r.revoked_membership_count,
    s.canvas_scope_share_count,
    s.group_scope_share_count,
    s.node_scope_share_count,
    c.latest_canvas_update
  from canvas_stats c
  cross join share_stats s
  cross join membership_stats m
  cross join revocation_stats r;
$$;

revoke execute on function public.get_workflow_system_operational_snapshot() from PUBLIC, anon, authenticated;
grant execute on function public.get_workflow_system_operational_snapshot() to service_role;

notify pgrst, 'reload schema';
