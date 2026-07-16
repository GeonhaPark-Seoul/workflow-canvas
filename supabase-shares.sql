-- Run this in Supabase Dashboard → SQL Editor (after supabase-schema.sql)
-- Sharing/invite tables, RLS, membership management, and claim RPCs.
-- Safe to re-run when deploying sharing changes.

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
  invitation_active boolean not null default true,
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
alter table canvas_shares add column if not exists invitation_active boolean not null default true;

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
    (invitation_active and lower(invitee_email) = lower(auth.email()))
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
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into found_share from canvas_shares cs where cs.link_token = token and cs.invitation_active;
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

revoke execute on function claim_share(text) from PUBLIC, anon;
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
  if auth.uid() is null or auth.email() is null then
    raise exception 'authentication required';
  end if;

  return query
    with claimed as (
      insert into share_members (share_id, user_id)
      select cs.id, auth.uid()
      from canvas_shares cs
      where cs.invitation_active and lower(cs.invitee_email) = lower(auth.email())
        and not exists (select 1 from share_revocations r where r.share_id = cs.id and r.user_id = auth.uid())
      on conflict do nothing
      returning share_id
    )
    select cs.* from canvas_shares cs join claimed c on c.share_id = cs.id;
end;
$$;

revoke execute on function claim_email_invites() from PUBLIC, anon;
grant execute on function claim_email_invites() to authenticated;

create or replace function list_pending_email_invites()
returns table (id uuid, owner_id uuid, canvas_id text, scope text, target_id text, restrict_view boolean, name text)
language sql security definer stable set search_path = public as $$
  select s.id, s.owner_id, s.canvas_id, s.scope, s.target_id, s.restrict_view, c.name
  from canvas_shares s join canvases c on c.user_id = s.owner_id and c.canvas_id = s.canvas_id
  where auth.uid() is not null and auth.email() is not null
    and s.invitation_active and lower(s.invitee_email) = lower(auth.email())
    and not exists (select 1 from share_members m where m.share_id = s.id and m.user_id = auth.uid())
    and not exists (select 1 from share_revocations r where r.share_id = s.id and r.user_id = auth.uid());
$$;
revoke execute on function list_pending_email_invites() from PUBLIC, anon;
grant execute on function list_pending_email_invites() to authenticated;

create or replace function claim_email_invite(p_share_id uuid)
returns canvas_shares language plpgsql security definer set search_path = public as $$
declare found_share canvas_shares%rowtype;
begin
  if auth.uid() is null or auth.email() is null then
    raise exception 'authentication required';
  end if;

  select * into found_share from canvas_shares where id = p_share_id and invitation_active and lower(invitee_email) = lower(auth.email());
  if not found or exists (select 1 from share_revocations r where r.share_id = p_share_id and r.user_id = auth.uid()) then
    raise exception 'invalid email invitation';
  end if;
  insert into share_members (share_id, user_id) values (p_share_id, auth.uid()) on conflict do nothing;
  return found_share;
end;
$$;
revoke execute on function claim_email_invite(uuid) from PUBLIC, anon;
grant execute on function claim_email_invite(uuid) to authenticated;

-- Used before opening a #share= link so deleted links receive a clear message.
create or replace function share_link_is_active(token text)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1
    from canvas_shares s
    where s.link_token = token
      and s.invitation_active
      and not exists (
        select 1 from share_revocations r
        where r.share_id = s.id and r.user_id = auth.uid()
      )
  );
$$;
revoke execute on function share_link_is_active(text) from PUBLIC;
grant execute on function share_link_is_active(text) to anon, authenticated;

create or replace function share_link_preview(token text)
returns table (id uuid, owner_id uuid, canvas_id text, scope text, target_id text, restrict_view boolean, name text)
language sql security definer stable set search_path = public as $$
  select s.id, s.owner_id, s.canvas_id, s.scope, s.target_id, s.restrict_view, c.name
  from canvas_shares s join canvases c on c.user_id = s.owner_id and c.canvas_id = s.canvas_id
  where s.link_token = token and s.invitation_active
    and not exists (
      select 1 from share_revocations r
      where r.share_id = s.id and r.user_id = auth.uid()
    );
$$;
revoke execute on function share_link_preview(text) from PUBLIC;
grant execute on function share_link_preview(text) to anon, authenticated;

-- Removing an invitation stops new joins but preserves accepted members.
-- If nobody accepted it yet, the now-useless row is removed completely.
create or replace function disable_share_invitation(p_share_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from canvas_shares s where s.id = p_share_id and s.owner_id = auth.uid()) then
    raise exception 'not allowed to remove this invitation';
  end if;
  update canvas_shares
  set invitation_active = false, invitee_email = null, link_token = null
  where id = p_share_id;
  if not exists (select 1 from share_members m where m.share_id = p_share_id) then
    delete from canvas_shares where id = p_share_id;
  end if;
end;
$$;
revoke execute on function disable_share_invitation(uuid) from PUBLIC, anon;
grant execute on function disable_share_invitation(uuid) to authenticated;

-- A canvas-level kick revokes every existing invitation path for that user.
-- The same person may have joined through multiple links or scoped invites;
-- deleting just one membership would leave another path active.
create or replace function revoke_canvas_member(p_canvas_id text, p_user_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  removed_count integer;
begin
  if auth.uid() is null or p_user_id = auth.uid() or not exists (
    select 1
    from canvas_shares s
    join share_members m on m.share_id = s.id
    where s.owner_id = auth.uid()
      and s.canvas_id = p_canvas_id
      and m.user_id = p_user_id
  ) then
    raise exception 'not allowed to revoke this canvas member';
  end if;

  insert into share_revocations (share_id, user_id)
  select s.id, p_user_id
  from canvas_shares s
  where s.owner_id = auth.uid() and s.canvas_id = p_canvas_id
  on conflict do nothing;

  -- An email invitation belongs to one recipient. Once that accepted member
  -- is explicitly kicked, keeping the invitation active would make them show
  -- up again as a misleading "pending" participant in the owner's UI.
  update canvas_shares s
  set invitation_active = false, invitee_email = null
  where s.owner_id = auth.uid()
    and s.canvas_id = p_canvas_id
    and s.invitee_email is not null
    and exists (
      select 1 from share_members m
      where m.share_id = s.id and m.user_id = p_user_id
    );

  delete from share_members m
  using canvas_shares s
  where m.share_id = s.id
    and s.owner_id = auth.uid()
    and s.canvas_id = p_canvas_id
    and m.user_id = p_user_id;
  get diagnostics removed_count = row_count;

  delete from canvas_shares s
  where s.owner_id = auth.uid()
    and s.canvas_id = p_canvas_id
    and not s.invitation_active
    and not exists (select 1 from share_members m where m.share_id = s.id);

  return removed_count;
end;
$$;
revoke execute on function revoke_canvas_member(text, uuid) from PUBLIC, anon;
grant execute on function revoke_canvas_member(text, uuid) to authenticated;

-- Leaving is canvas-wide too. Every currently issued path is revoked, so an
-- old live link cannot silently add the user back. A newly created invitation
-- has a new share id and can grant access again.
create or replace function leave_shared_canvas(p_owner_id uuid, p_canvas_id text)
returns integer language plpgsql security definer set search_path = public as $$
declare
  removed_count integer;
begin
  if auth.uid() is null or p_owner_id = auth.uid() then
    raise exception 'not allowed to leave this canvas';
  end if;

  insert into share_revocations (share_id, user_id)
  select s.id, auth.uid()
  from canvas_shares s
  where s.owner_id = p_owner_id and s.canvas_id = p_canvas_id
  on conflict do nothing;

  update canvas_shares s
  set invitation_active = false, invitee_email = null
  where s.owner_id = p_owner_id
    and s.canvas_id = p_canvas_id
    and s.invitee_email is not null
    and exists (
      select 1 from share_members m
      where m.share_id = s.id and m.user_id = auth.uid()
    );

  delete from share_members m
  using canvas_shares s
  where m.share_id = s.id
    and s.owner_id = p_owner_id
    and s.canvas_id = p_canvas_id
    and m.user_id = auth.uid();
  get diagnostics removed_count = row_count;

  if removed_count = 0 then
    raise exception 'shared canvas membership not found';
  end if;

  delete from canvas_shares s
  where s.owner_id = p_owner_id
    and s.canvas_id = p_canvas_id
    and not s.invitation_active
    and not exists (select 1 from share_members m where m.share_id = s.id);

  return removed_count;
end;
$$;
revoke execute on function leave_shared_canvas(uuid, text) from PUBLIC, anon;
grant execute on function leave_shared_canvas(uuid, text) to authenticated;

-- Owners can revoke a participant; a participant can revoke their own access.
create or replace function revoke_share_member(p_share_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'not allowed to revoke this share member';
  end if;
  if p_user_id <> auth.uid() and not exists (
    select 1 from canvas_shares s where s.id = p_share_id and s.owner_id = auth.uid()
  ) then
    raise exception 'not allowed to revoke this share member';
  end if;
  if p_user_id = auth.uid() and not exists (
    select 1
    from canvas_shares s
    where s.id = p_share_id
      and (
        (s.invitation_active and lower(s.invitee_email) = lower(auth.email()))
        or (s.invitation_active and s.link_token is not null)
        or exists (
          select 1 from share_members m
          where m.share_id = s.id and m.user_id = auth.uid()
        )
      )
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
  if exists (select 1 from canvas_shares s where s.id = p_share_id and not s.invitation_active)
     and not exists (select 1 from share_members m where m.share_id = p_share_id) then
    delete from canvas_shares where id = p_share_id;
  end if;
end;
$$;
revoke execute on function revoke_share_member(uuid, uuid) from PUBLIC, anon;
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
-- NULL follows the invitation's default. Owners can set FALSE for one accepted
-- member without changing what future users of the same link receive.
alter table share_members add column if not exists restrict_view_override boolean;

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

revoke execute on function is_share_member(uuid, uuid) from PUBLIC, anon;
revoke execute on function owns_share(uuid, uuid) from PUBLIC, anon;
revoke execute on function can_access_canvas(uuid, text, uuid, text) from PUBLIC, anon;
grant execute on function is_share_member(uuid, uuid) to authenticated;
grant execute on function owns_share(uuid, uuid) to authenticated;
grant execute on function can_access_canvas(uuid, text, uuid, text) to authenticated;

-- canvas_shares: invitee sees invites to their email or ones they've joined.
drop policy if exists "invitee selects own invites" on canvas_shares;
create policy "invitee selects own invites" on canvas_shares
  for select using (
    (invitation_active and lower(invitee_email) = lower(auth.email()))
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

-- The Phase 6 API gateway replaced this parameterized helper. Dropping it also
-- prevents authenticated callers from probing access with someone else's email.
drop function if exists can_access_canvas(uuid, text, uuid, text);

-- Phase 7: composed grants, delegated invitations, and mutual friends.
-- Accepted users may hold several group/node grants at once. Owner-managed
-- member flags are repeated on each membership row and composed by the API.
alter table share_members add column if not exists can_invite boolean not null default false;
alter table canvas_shares add column if not exists default_can_edit boolean not null default true;
alter table canvas_shares add column if not exists invited_by_user_id uuid references auth.users(id) on delete set null;

create index if not exists canvas_shares_owner_canvas_idx on canvas_shares (owner_id, canvas_id);
create index if not exists canvas_shares_inviter_created_idx on canvas_shares (invited_by_user_id, created_at desc);
create index if not exists canvas_shares_invitee_active_idx
  on canvas_shares (lower(invitee_email), created_at desc)
  where invitation_active and invitee_email is not null;
create index if not exists share_members_user_idx on share_members (user_id, share_id);
create index if not exists share_revocations_user_idx on share_revocations (user_id, share_id);

-- New memberships inherit the invitation's bounded edit permission. The API
-- computes that value from the inviter's own grants; clients cannot override it.
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
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into found_share from canvas_shares cs where cs.link_token = token and cs.invitation_active;
  if not found then
    raise exception 'invalid share link';
  end if;
  if exists (select 1 from share_revocations r where r.share_id = found_share.id and r.user_id = auth.uid()) then
    raise exception 'share access revoked';
  end if;

  insert into share_members (share_id, user_id, can_edit)
  values (found_share.id, auth.uid(), found_share.default_can_edit)
  on conflict do nothing;

  return query
    select found_share.id, found_share.owner_id, found_share.canvas_id,
           found_share.scope, found_share.target_id, found_share.restrict_view;
end;
$$;

create or replace function claim_email_invites()
returns setof canvas_shares
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or auth.email() is null then
    raise exception 'authentication required';
  end if;

  return query
    with claimed as (
      insert into share_members (share_id, user_id, can_edit)
      select cs.id, auth.uid(), cs.default_can_edit
      from canvas_shares cs
      where cs.invitation_active and lower(cs.invitee_email) = lower(auth.email())
        and not exists (select 1 from share_revocations r where r.share_id = cs.id and r.user_id = auth.uid())
      on conflict do nothing
      returning share_id
    )
    select cs.* from canvas_shares cs join claimed c on c.share_id = cs.id;
end;
$$;

create or replace function claim_email_invite(p_share_id uuid)
returns canvas_shares language plpgsql security definer set search_path = public as $$
declare found_share canvas_shares%rowtype;
begin
  if auth.uid() is null or auth.email() is null then
    raise exception 'authentication required';
  end if;

  select * into found_share from canvas_shares
  where id = p_share_id and invitation_active and lower(invitee_email) = lower(auth.email());
  if not found or exists (select 1 from share_revocations r where r.share_id = p_share_id and r.user_id = auth.uid()) then
    raise exception 'invalid email invitation';
  end if;
  insert into share_members (share_id, user_id, can_edit)
  values (p_share_id, auth.uid(), found_share.default_can_edit)
  on conflict do nothing;
  return found_share;
end;
$$;

revoke execute on function claim_share(text) from PUBLIC, anon;
revoke execute on function claim_email_invites() from PUBLIC, anon;
revoke execute on function claim_email_invite(uuid) from PUBLIC, anon;
grant execute on function claim_share(text) to authenticated;
grant execute on function claim_email_invites() to authenticated;
grant execute on function claim_email_invite(uuid) to authenticated;

create table if not exists friendships (
  id uuid default gen_random_uuid() primary key,
  requester_id uuid references auth.users(id) on delete cascade not null,
  addressee_id uuid references auth.users(id) on delete cascade not null,
  status text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  check (requester_id <> addressee_id)
);

create unique index if not exists friendships_pair_unique_idx
  on friendships (least(requester_id, addressee_id), greatest(requester_id, addressee_id));
create index if not exists friendships_addressee_status_idx on friendships (addressee_id, status);
create index if not exists friendships_requester_status_idx on friendships (requester_id, status);
alter table friendships enable row level security;

drop policy if exists "friends select own relationships" on friendships;
create policy "friends select own relationships" on friendships
  for select using (requester_id = auth.uid() or addressee_id = auth.uid());

revoke all on friendships from PUBLIC, anon, authenticated;
grant select on friendships to authenticated;
grant all on friendships to service_role;

create or replace function list_my_friendships()
returns table (
  id uuid,
  other_user_id uuid,
  status text,
  direction text,
  nickname text,
  glyph text,
  color text,
  email text,
  last_seen_at timestamptz
)
language sql security definer stable set search_path = public as $$
  select
    f.id,
    case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end,
    f.status,
    case when f.requester_id = auth.uid() then 'outgoing' else 'incoming' end,
    p.nickname,
    p.glyph,
    p.color,
    p.email,
    p.last_seen_at
  from friendships f
  join profiles p on p.user_id = case when f.requester_id = auth.uid() then f.addressee_id else f.requester_id end
  where auth.uid() is not null and (f.requester_id = auth.uid() or f.addressee_id = auth.uid())
  order by f.status, f.created_at;
$$;

create or replace function send_friend_request(p_email text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  target_user uuid;
  existing friendships%rowtype;
  result_id uuid;
begin
  if auth.uid() is null or nullif(trim(p_email), '') is null then
    raise exception 'friend request not allowed';
  end if;
  select u.id into target_user
  from auth.users u
  where lower(u.email) = lower(trim(p_email)) and u.id <> auth.uid()
  limit 1;
  if target_user is null then
    raise exception 'friend request not allowed';
  end if;

  -- Friendship starts from a real collaboration relationship. This prevents
  -- the email argument from becoming an authenticated account-discovery API.
  if not exists (
    select 1
    from canvases c
    where (
      c.user_id = auth.uid()
      or exists (
        select 1
        from canvas_shares mine_share
        join share_members mine_member on mine_member.share_id = mine_share.id
        where mine_share.owner_id = c.user_id
          and mine_share.canvas_id = c.canvas_id
          and mine_member.user_id = auth.uid()
      )
    )
    and (
      c.user_id = target_user
      or exists (
        select 1
        from canvas_shares target_share
        join share_members target_member on target_member.share_id = target_share.id
        where target_share.owner_id = c.user_id
          and target_share.canvas_id = c.canvas_id
          and target_member.user_id = target_user
      )
    )
  ) then
    raise exception 'friend request not allowed';
  end if;

  select * into existing from friendships f
  where (f.requester_id = auth.uid() and f.addressee_id = target_user)
     or (f.requester_id = target_user and f.addressee_id = auth.uid())
  limit 1;

  if found then
    if existing.status = 'pending' and existing.addressee_id = auth.uid() then
      update friendships set status = 'accepted', responded_at = now() where id = existing.id;
    end if;
    return existing.id;
  end if;

  insert into friendships (requester_id, addressee_id)
  values (auth.uid(), target_user)
  returning id into result_id;
  return result_id;
end;
$$;

create or replace function respond_friend_request(p_friendship_id uuid, p_accept boolean)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not exists (
    select 1 from friendships f
    where f.id = p_friendship_id and f.addressee_id = auth.uid() and f.status = 'pending'
  ) then
    raise exception 'friend response not allowed';
  end if;
  if p_accept then
    update friendships set status = 'accepted', responded_at = now() where id = p_friendship_id;
    return true;
  end if;
  delete from friendships where id = p_friendship_id;
  return false;
end;
$$;

create or replace function remove_friendship(p_friendship_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from friendships f
  where f.id = p_friendship_id and (f.requester_id = auth.uid() or f.addressee_id = auth.uid());
  if not found then raise exception 'friend removal not allowed'; end if;
end;
$$;

revoke execute on function list_my_friendships() from PUBLIC, anon;
revoke execute on function send_friend_request(text) from PUBLIC, anon;
revoke execute on function respond_friend_request(uuid, boolean) from PUBLIC, anon;
revoke execute on function remove_friendship(uuid) from PUBLIC, anon;
grant execute on function list_my_friendships() to authenticated;
grant execute on function send_friend_request(text) to authenticated;
grant execute on function respond_friend_request(uuid, boolean) to authenticated;
grant execute on function remove_friendship(uuid) to authenticated;
