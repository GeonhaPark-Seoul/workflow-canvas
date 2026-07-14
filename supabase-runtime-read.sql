-- Read-only runtime summaries for authenticated Workflow Canvas users.
-- Run in Supabase Dashboard -> SQL Editor after supabase-schema.sql.

create or replace function public.get_own_canvas_summaries(max_rows integer default 50)
returns table (
  canvas_id text,
  name text,
  node_count integer,
  edge_count integer,
  note_count integer,
  updated_at timestamptz,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.canvas_id,
    c.name,
    case when jsonb_typeof(c.nodes) = 'array' then jsonb_array_length(c.nodes) else 0 end::integer as node_count,
    case when jsonb_typeof(c.edges) = 'array' then jsonb_array_length(c.edges) else 0 end::integer as edge_count,
    case when jsonb_typeof(c.notes) = 'array' then jsonb_array_length(c.notes) else 0 end::integer as note_count,
    c.updated_at,
    count(*) over () as total_count
  from public.canvases c
  where c.user_id = auth.uid()
  order by c.updated_at desc, c.canvas_id
  limit least(greatest(coalesce(max_rows, 50), 1), 50);
$$;

revoke execute on function public.get_own_canvas_summaries(integer) from PUBLIC, anon;
grant execute on function public.get_own_canvas_summaries(integer) to authenticated;

notify pgrst, 'reload schema';
