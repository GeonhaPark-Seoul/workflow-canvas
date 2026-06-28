-- Run this in Supabase Dashboard → SQL Editor (after supabase-schema.sql).
-- Adds personal access tokens used by the MCP server to authenticate a user.

create table if not exists mcp_tokens (
  token       text        primary key,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  label       text,
  created_at  timestamptz default now()
);

-- RLS on, no policies: only the service role (the MCP server) can read tokens.
alter table mcp_tokens enable row level security;

-- ── Issue a token for yourself ───────────────────────────────────────────────
-- 1) Find your user id:
--      select id, email from auth.users;
--
-- 2) Insert a token. Use any long random secret as the token value:
--      insert into mcp_tokens (token, user_id, label)
--      values (encode(gen_random_bytes(24), 'hex'), '<YOUR-USER-ID>', 'claude');
--
-- 3) Read it back to copy into your MCP client config:
--      select token from mcp_tokens where user_id = '<YOUR-USER-ID>';
