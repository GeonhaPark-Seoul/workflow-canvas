-- Small canvas-list projection for server-side MCP/API callers.
-- Node and edge JSON stay in Postgres; only counts and tab metadata leave.
create or replace function public.get_canvas_summaries(
  p_user_id uuid,
  p_canvas_ids text[] default null
)
returns table (
  canvas_id text,
  name text,
  node_count integer,
  edge_count integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.canvas_id,
    c.name,
    jsonb_array_length(c.nodes)::integer,
    jsonb_array_length(c.edges)::integer,
    c.updated_at
  from public.canvases c
  where c.user_id = p_user_id
    and (p_canvas_ids is null or c.canvas_id = any(p_canvas_ids))
  order by c.updated_at asc;
$$;

revoke execute on function public.get_canvas_summaries(uuid, text[]) from PUBLIC, anon, authenticated;
grant execute on function public.get_canvas_summaries(uuid, text[]) to service_role;
notify pgrst, 'reload schema';
