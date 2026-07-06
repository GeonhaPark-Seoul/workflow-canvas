-- Run this in Supabase Dashboard → SQL Editor.
-- Enables live sync: the browser subscribes to changes on `canvases` so
-- MCP(AI) writes appear on screen within seconds, without a tab switch.

-- DELETE events only carry replica-identity columns, and realtime filters
-- (user_id=eq...) need the old record too — so use FULL identity.
alter table canvases replica identity full;

-- postgres_changes is off by default; add the table to the publication.
alter publication supabase_realtime add table canvases;
