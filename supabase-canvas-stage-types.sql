-- Run this in Supabase Dashboard → SQL Editor (after supabase-schema.sql).
-- Moves stage types from a single per-user setting to a per-canvas one, so
-- each canvas keeps its own independent set of stage-node categories and a
-- brand-new canvas always starts from the built-in defaults
-- (기획·개발·검토·배포·완료) instead of inheriting another canvas's edits.

alter table canvases add column if not exists stage_types jsonb;

-- Optional: carry each user's old global stage_types (from user_prefs) onto
-- their most-recently-updated canvas, so a prior customization isn't lost.
-- Every other canvas keeps stage_types = null and falls back to the defaults.
update canvases c
set stage_types = up.stage_types
from user_prefs up
where c.user_id = up.user_id
  and up.stage_types is not null
  and c.id = (
    select id from canvases c2
    where c2.user_id = up.user_id
    order by updated_at desc
    limit 1
  );

-- user_prefs.stage_types is no longer read or written; left in place (unused)
-- rather than dropped, so no data is destroyed by running this migration.
