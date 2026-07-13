-- Run once in Supabase Dashboard -> SQL Editor before deploying this release.
-- Independent note documents live with their canvas but are not React Flow nodes.

alter table public.canvases
  add column if not exists notes jsonb not null default '[]'::jsonb;
