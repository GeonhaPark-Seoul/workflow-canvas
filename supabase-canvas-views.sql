-- Run this in Supabase Dashboard -> SQL Editor for databases created before
-- saved canvas views were added to the browser app.
-- Safe to run more than once; existing non-null view data is preserved.

alter table canvases add column if not exists views jsonb;
alter table canvases alter column views set default '[]'::jsonb;
update canvases set views = '[]'::jsonb where views is null;
alter table canvases alter column views set not null;
