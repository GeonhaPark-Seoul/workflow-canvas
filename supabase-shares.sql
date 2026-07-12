-- Run this in Supabase Dashboard → SQL Editor (after supabase-schema.sql)
-- Phase 1 of the sharing/invite feature: tables, RLS, and claim RPCs.
-- Nothing in the app calls this yet — phase 2 wires the client up to it.

-- ── Tables ───────────────────────────────────────────────────────────────────

-- One row per invite: an email invite (invitee_email set, link_token null)
-- or a share link (link_token set, invitee_email null). scope/target_id say
-- what part of the canvas the invite covers.
create table if not exists canvas_shares (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references auth.users(id) on delete cascade not null,
  canvas_id text not null,
  scope text not null check (scope in ('canvas','group','node')),
  target_id text,
  invitee_email text,          -- lowercase; null for link shares
  link_token text unique,      -- null for email invites
  restrict_view boolean not null default false,
  created_at timestamptz default now()
);

-- Users who claimed a link, or logged in with a matching email invite.
-- Presence/glow and canvas-access checks key off membership here.
create table if not exists share_members (
  share_id uuid references canvas_shares(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (share_id, user_id)
);

-- A revoked user cannot reclaim the same email/link invitation. Re-inviting
-- creates a new canvas_shares row, so the owner can explicitly grant access again.
create table if not exists share_revocations (
  share_id uuid references canvas_shares(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  revoked_at timestamptz default now(),
  primary key (share_id, user_id)
);

alter table canvas_shares enable row level security;
alter table share_members enable row level security;
alter table share_revocations enable row level security;

-- ── canvas_shares policies ──────────────────────────────────────────────────

-- Owner: full CRUD on their own shares.
drop policy if exists "owner manages own shares" on canvas_shares;
create policy "owner manages own shares" on canvas_shares
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Invitee: can see invites addressed to their email, or that they've already
-- claimed (membership row exists).
drop policy if exists "invitee selects own invites" on canvas_shares;
create policy "invitee selects own invites" on canvas_shares
  for select using (
    lower(invitee_email) = lower(auth.email())
    or exists (
      select 1 from share_members sm
      where sm.share_id = canvas_shares.id and sm.user_id = auth.uid()
    )
  );

-- ── share_members policies ──────────────────────────────────────────────────

-- Users can see their own membership rows. No insert policy here on purpose —
-- rows are only ever created by the security-definer RPCs below.
drop policy if exists "user selects own memberships" on share_members;
create policy "user selects own memberships" on share_members
  for select using (user_id = auth.uid());

-- ── canvases: add invitee access (existing owner policy is untouched) ──────

drop policy if exists "invitee selects shared canvases" on canvases;
create policy "invitee selects shared canvases" on canvases
  for select using (
    exists (
      select 1 from canvas_shares cs
      where cs.canvas_id = canvases.canvas_id
        and cs.owner_id = canvases.user_id
        and (
          lower(cs.invitee_email) = lower(auth.email())
          or exists (
            select 1 from share_members sm
            where sm.share_id = cs.id and sm.user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "invitee updates shared canvases" on canvases;
create policy "invitee updates shared canvases" on canvases
  for update using (
    exists (
      select 1 from canvas_shares cs
      where cs.canvas_id = canvases.canvas_id
        and cs.owner_id = canvases.user_id
        and (
          lower(cs.invitee_email) = lower(auth.email())
          or exists (
            select 1 from share_members sm
            where sm.share_id = cs.id and sm.user_id = auth.uid()
          )
        )
    )
  ) with check (
    exists (
      select 1 from canvas_shares cs
      where cs.canvas_id = canvases.canvas_id
        and cs.owner_id = canvases.user_id
        and (
          lower(cs.invitee_email) = lower(auth.email())
          or exists (
            select 1 from share_members sm
            where sm.share_id = cs.id and sm.user_id = auth.uid()
          )
        )
    )
  );
-- DELETE stays owner-only (covered by the existing "users manage own canvases" policy).

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Claim a share link: records membership for the current user and returns
-- the share so the client knows what canvas/scope/target to open.
create or replace function claim_share(token text)
returns table (
  id uuid,
  owner_id uuid,
  canvas_id text,
  scope text,
  target_id text,
  restrict_view boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  found_share canvas_shares%rowtype;
begin
  select * into found_share from canvas_shares cs where cs.link_token = token;
  if not found then
    raise exception 'invalid share link';
  end if;
  if exists (select 1 from share_revocations r where r.share_id = found_share.id and r.user_id = auth.uid()) then
    raise exception 'share access revoked';
  end if;

  insert into share_members (share_id, user_id)
  values (found_share.id, auth.uid())
  on conflict do nothing;

  return query
    select found_share.id, found_share.owner_id, found_share.canvas_id,
           found_share.scope, found_share.target_id, found_share.restrict_view;
end;
$$;

revoke execute on function claim_share(text) from anon;
grant execute on function claim_share(text) to authenticated;

-- Claim all pending email invites addressed to the current user's email:
-- inserts membership rows for each so presence/glow and canvas access can
-- key off share_members instead of re-checking invitee_email every time.
create or replace function claim_email_invites()
returns setof canvas_shares
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    with claimed as (
      insert into share_members (share_id, user_id)
      select cs.id, auth.uid()
      from canvas_shares cs
      where lower(cs.invitee_email) = lower(auth.email())
        and not exists (select 1 from share_revocations r where r.share_id = cs.id and r.user_id = auth.uid())
      on conflict do nothing
      returning share_id
    )
    select cs.* from canvas_shares cs join claimed c on c.share_id = cs.id;
end;
$$;

revoke execute on function claim_email_invites() from anon;
grant execute on function claim_email_invites() to authenticated;

create or replace function list_pending_email_invites()
returns table (id uuid, owner_id uuid, canvas_id text, scope text, target_id text, restrict_view boolean, name text)
language sql security definer stable set search_path = public as $$
  select s.id, s.owner_id, s.canvas_id, s.scope, s.target_id, s.restrict_view, c.name
  from canvas_shares s join canvases c on c.user_id = s.owner_id and c.canvas_id = s.canvas_id
  where lower(s.invitee_email) = lower(auth.email())
    and not exists (select 1 from share_members m where m.share_id = s.id and m.user_id = auth.uid())
    and not exists (select 1 from share_revocations r where r.share_id = s.id and r.user_id = auth.uid());
$$;
grant execute on function list_pending_email_invites() to authenticated;

create or replace function claim_email_invite(p_share_id uuid)
returns canvas_shares language plpgsql security definer set search_path = public as $$
declare found_share canvas_shares%rowtype;
begin
  select * into found_share from canvas_shares where id = p_share_id and lower(invitee_email) = lower(auth.email());
  if not found or exists (select 1 from share_revocations r where r.share_id = p_share_id and r.user_id = auth.uid()) then
    raise exception 'invalid email invitation';
  end if;
  insert into share_members (share_id, user_id) values (p_share_id, auth.uid()) on conflict do nothing;
  return found_share;
end;
$$;
grant execute on function claim_email_invite(uuid) to authenticated;

-- Used before opening a #share= link so deleted links receive a clear message.
create or replace function share_link_is_active(token text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from canvas_shares where link_token = token);
$$;
revoke execute on function share_link_is_active(text) from anon;
grant execute on function share_link_is_active(text) to anon, authenticated;

create or replace function share_link_preview(token text)
returns table (id uuid, owner_id uuid, canvas_id text, scope text, target_id text, restrict_view boolean, name text)
language sql security definer stable set search_path = public as $$
  select s.id, s.owner_id, s.canvas_id, s.scope, s.target_id, s.restrict_view, c.name
  from canvas_shares s join canvases c on c.user_id = s.owner_id and c.canvas_id = s.canvas_id
  where s.link_token = token;
$$;
grant execute on function share_link_preview(text) to anon, authenticated;

-- Owners can revoke a participant; a participant can revoke their own access.
create or replace function revoke_share_member(p_share_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_user_id <> auth.uid() and not exists (
    select 1 from canvas_shares s where s.id = p_share_id and s.owner_id = auth.uid()
  ) then
    raise exception 'not allowed to revoke this share member';
  end if;
  -- An email invite is one-person-only, so removing that row fully revokes it
  -- and keeps it out of the owner's pending-invite list. Link shares can have
  -- several people, so retain the link and revoke only this account.
  if exists (select 1 from canvas_shares s where s.id = p_share_id and s.invitee_email is not null) then
    delete from canvas_shares where id = p_share_id;
  else
    insert into share_revocations (share_id, user_id) values (p_share_id, p_user_id)
    on conflict do nothing;
    delete from share_members where share_id = p_share_id and user_id = p_user_id;
  end if;
end;
$$;
revoke execute on function revoke_share_member(uuid, uuid) from anon;
grant execute on function revoke_share_member(uuid, uuid) to authenticated;

-- ── Table grants ─────────────────────────────────────────────────────────────
-- RLS policies alone are not enough: the authenticated role also needs
-- table-level privileges (this project's default privileges don't cover
-- newly created tables). RLS still restricts which rows are reachable.
grant select, insert, update, delete on canvas_shares to authenticated;
grant select on share_members to authenticated;
grant select on share_revocations to authenticated;
grant all on canvas_shares, share_members, share_revocations to service_role;

-- ── Phase 4: per-member edit permission + owner/member management ──────────
-- Safe to re-run.

alter table share_members add column if not exists can_edit boolean not null default true;

-- Owner manages members of their shares (view/update/delete membership rows).
drop policy if exists "owner selects share members" on share_members;
create policy "owner selects share members" on share_members
  for select using (
    exists (select 1 from canvas_shares s where s.id = share_members.share_id and s.owner_id = auth.uid())
  );

drop policy if exists "owner updates share members" on share_members;
create policy "owner updates share members" on share_members
  for update using (
    exists (select 1 from canvas_shares s where s.id = share_members.share_id and s.owner_id = auth.uid())
  );

drop policy if exists "owner deletes share members" on share_members;
create policy "owner deletes share members" on share_members
  for delete using (
    exists (select 1 from canvas_shares s where s.id = share_members.share_id and s.owner_id = auth.uid())
  );

-- Invitee can leave a shared canvas (delete their own membership row).
drop policy if exists "member leaves share" on share_members;
create policy "member leaves share" on share_members
  for delete using (user_id = auth.uid());

grant update, delete on share_members to authenticated;

-- ── Phase 5: FIX infinite recursion between canvas_shares & share_members ─────
-- The invitee policy on canvas_shares selects from share_members, and the owner
-- policies on share_members select from canvas_shares → each policy re-triggers
-- the other's RLS → "infinite recursion detected in policy". SECURITY DEFINER
-- functions run with the definer's rights and BYPASS RLS, breaking the cycle.
-- Safe to re-run.

create or replace function is_share_member(p_share_id uuid, p_user uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from share_members m where m.share_id = p_share_id and m.user_id = p_user);
$$;

create or replace function owns_share(p_share_id uuid, p_user uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from canvas_shares s where s.id = p_share_id and s.owner_id = p_user);
$$;

-- Whether p_user may access (owner or invitee) the canvas (owner_user, canvas_id).
create or replace function can_access_canvas(p_owner uuid, p_canvas text, p_user uuid, p_email text)
  returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from canvas_shares s
    where s.canvas_id = p_canvas and s.owner_id = p_owner
      and (lower(s.invitee_email) = lower(p_email)
           or exists (select 1 from share_members m where m.share_id = s.id and m.user_id = p_user))
  );
$$;

grant execute on function is_share_member(uuid, uuid) to authenticated;
grant execute on function owns_share(uuid, uuid) to authenticated;
grant execute on function can_access_canvas(uuid, text, uuid, text) to authenticated;

-- canvas_shares: invitee sees invites to their email or ones they've joined.
drop policy if exists "invitee selects own invites" on canvas_shares;
create policy "invitee selects own invites" on canvas_shares
  for select using (
    lower(invitee_email) = lower(auth.email())
    or is_share_member(canvas_shares.id, auth.uid())
  );

-- share_members: owner management via SECURITY DEFINER (no direct canvas_shares read).
drop policy if exists "owner selects share members" on share_members;
create policy "owner selects share members" on share_members
  for select using (owns_share(share_members.share_id, auth.uid()));

drop policy if exists "owner updates share members" on share_members;
create policy "owner updates share members" on share_members
  for update using (owns_share(share_members.share_id, auth.uid()));

drop policy if exists "owner deletes share members" on share_members;
create policy "owner deletes share members" on share_members
  for delete using (owns_share(share_members.share_id, auth.uid()));

-- canvases: invitee read/update via the access helper (no inline cross-table RLS).
drop policy if exists "invitee selects shared canvases" on canvases;
create policy "invitee selects shared canvases" on canvases
  for select using (can_access_canvas(canvases.user_id, canvases.canvas_id, auth.uid(), auth.email()));

drop policy if exists "invitee updates shared canvases" on canvases;
create policy "invitee updates shared canvases" on canvases
  for update using (can_access_canvas(canvases.user_id, canvases.canvas_id, auth.uid(), auth.email()));

-- Phase 6: shared canvas rows must no longer be directly readable or writable
-- by invitees. The Vercel /api/shared-canvas endpoint now authenticates the
-- invitee, applies can_edit/scope/restrict_view server-side, and uses the
-- service role only after that check. Run this after deploying that endpoint.
drop policy if exists "invitee selects shared canvases" on canvases;
drop policy if exists "invitee updates shared canvases" on canvases;
