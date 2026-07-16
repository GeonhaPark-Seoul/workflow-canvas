-- Run this in Supabase Dashboard → SQL Editor (after supabase-schema.sql / supabase-shares.sql)
-- User profile: nickname + avatar glyph/color shown in the shared-user avatar row
-- and the login button. Nothing in the app calls this unless this file has been run.

create table if not exists profiles (
  user_id  uuid references auth.users(id) on delete cascade primary key,
  nickname text,
  glyph    text,   -- single letter/digit shown in the avatar circle; null = default bust icon
  color    text,   -- hex for glyph + circle border; null = default gray
  updated_at timestamptz default now()
);
alter table profiles enable row level security;
drop policy if exists "user manages own profile" on profiles;
create policy "user manages own profile" on profiles for insert with check (user_id = auth.uid());
drop policy if exists "user updates own profile" on profiles;
create policy "user updates own profile" on profiles for update using (user_id = auth.uid()) with check (user_id = auth.uid());
-- CRITICAL (lesson from canvas_shares): table-level grants are NOT automatic here
grant select on profiles to authenticated;
grant all on profiles to service_role;

-- Avatar click → mini profile card (email + last-seen). Safe to re-run.
alter table profiles add column if not exists email text;
alter table profiles add column if not exists last_seen_at timestamptz;

-- Settings used to live on profiles. Move them to user_prefs, which already
-- has own-user-only RLS, before allowing shared collaborators to read profiles.
alter table user_prefs add column if not exists settings jsonb;
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'settings'
  ) then
    insert into user_prefs (user_id, settings)
    select user_id, settings from profiles where settings is not null
    on conflict (user_id) do update set settings = coalesce(user_prefs.settings, excluded.settings);
  end if;
end $$;
alter table profiles drop column if exists settings;

-- Profiles are team-visible: the owner and every accepted member of the same
-- canvas can see each other. Pending invitations do not establish membership.
drop policy if exists "profiles readable by signed-in users" on profiles;
drop policy if exists "profiles readable by canvas participants" on profiles;
drop function if exists can_view_profile(uuid, uuid);
create or replace function can_view_profile(p_target uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and (auth.uid() = p_target or exists (
    select 1
    from canvas_shares workspace
    where (
      workspace.owner_id = auth.uid()
      or exists (
        select 1 from canvas_shares viewer_share
        join share_members viewer_member on viewer_member.share_id = viewer_share.id
        where viewer_share.owner_id = workspace.owner_id
          and viewer_share.canvas_id = workspace.canvas_id
          and viewer_member.user_id = auth.uid()
      )
    ) and (
      workspace.owner_id = p_target
      or exists (
        select 1 from canvas_shares target_share
        join share_members target_member on target_member.share_id = target_share.id
        where target_share.owner_id = workspace.owner_id
          and target_share.canvas_id = workspace.canvas_id
          and target_member.user_id = p_target
      )
    )
  ));
$$;

revoke execute on function can_view_profile(uuid) from PUBLIC, anon;
grant execute on function can_view_profile(uuid) to authenticated;
create policy "profiles readable by canvas participants" on profiles
  for select using (can_view_profile(profiles.user_id));

create or replace function upsert_my_profile(p_nickname text, p_glyph text, p_color text)
returns setof profiles language plpgsql security definer set search_path = public as $$
declare trusted_email text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_nickname is not null and char_length(p_nickname) > 80 then raise exception 'nickname too long'; end if;
  if p_glyph is not null and p_glyph !~ '^[A-Z0-9]$' then raise exception 'invalid glyph'; end if;
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid color'; end if;
  select email into trusted_email from auth.users where id = auth.uid();
  return query
    insert into profiles (user_id, nickname, glyph, color, email, updated_at, last_seen_at)
    values (auth.uid(), p_nickname, p_glyph, p_color, trusted_email, now(), now())
    on conflict (user_id) do update set
      nickname = excluded.nickname, glyph = excluded.glyph, color = excluded.color,
      email = excluded.email, updated_at = now(), last_seen_at = now()
    returning *;
end;
$$;

create or replace function touch_my_profile()
returns void language plpgsql security definer set search_path = public as $$
declare trusted_email text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select email into trusted_email from auth.users where id = auth.uid();
  insert into profiles (user_id, email, last_seen_at)
  values (auth.uid(), trusted_email, now())
  on conflict (user_id) do update set email = excluded.email, last_seen_at = excluded.last_seen_at;
end;
$$;

revoke insert, update on profiles from authenticated;
revoke execute on function upsert_my_profile(text, text, text) from PUBLIC, anon;
revoke execute on function touch_my_profile() from PUBLIC, anon;
grant execute on function upsert_my_profile(text, text, text) to authenticated;
grant execute on function touch_my_profile() to authenticated;
