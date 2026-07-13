-- Run this in Supabase Dashboard → SQL Editor (after supabase-schema.sql).
-- Adds hashed personal access tokens used by the MCP server to authenticate a user.

create extension if not exists pgcrypto;

create table if not exists mcp_tokens (
  token       text        primary key, -- SHA-256 digest; the raw secret is never stored
  token_prefix text,
  token_version smallint not null default 2,
  user_id     uuid        references auth.users(id) on delete cascade not null,
  label       text,
  created_at  timestamptz default now()
);

-- Existing deployments stored the raw token in `token`. A nullable version
-- column distinguishes those rows on the first re-run, hashes them in place,
-- and preserves every currently configured connector secret.
alter table mcp_tokens add column if not exists token_prefix text;
alter table mcp_tokens add column if not exists token_version smallint;
update mcp_tokens
set token_prefix = coalesce(token_prefix, left(token, 6)),
    token = encode(digest(token, 'sha256'), 'hex'),
    token_version = 2
where token_version is null or token_version < 2;
alter table mcp_tokens alter column token_version set default 2;
alter table mcp_tokens alter column token_version set not null;

-- RLS on: by default only the service role (the MCP server) can read tokens.
-- The self-service policies below additionally let a logged-in user manage
-- their own tokens directly from the app UI.
alter table mcp_tokens enable row level security;

-- ── Self-service token management from the app (안전한 재실행 가능) ──────────
drop policy if exists "user reads own tokens" on mcp_tokens;
create policy "user reads own tokens" on mcp_tokens for select using (user_id = auth.uid());

drop policy if exists "user creates own tokens" on mcp_tokens;
create policy "user creates own tokens" on mcp_tokens for insert with check (user_id = auth.uid());

drop policy if exists "user deletes own tokens" on mcp_tokens;
create policy "user deletes own tokens" on mcp_tokens for delete using (user_id = auth.uid());

grant select, insert, delete on mcp_tokens to authenticated;
grant all on mcp_tokens to service_role;

-- ── Issue a token manually (alternative to the in-app "MCP 연결" UI) ─────────
-- 1) Find your user id:
--      select id, email from auth.users;
--
-- 2) Create a raw secret, but store only its digest:
--      with secret as (select encode(gen_random_bytes(24), 'hex') value)
--      insert into mcp_tokens (token, token_prefix, token_version, user_id, label)
--      select encode(digest(value, 'sha256'), 'hex'), left(value, 6), 2,
--             '<YOUR-USER-ID>', 'claude'
--      from secret
--      returning token_prefix;
--
-- The raw secret cannot be recovered after creation. Prefer the in-app UI,
-- which shows the connector URL once before discarding the secret.
