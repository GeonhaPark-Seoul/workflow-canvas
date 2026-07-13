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
create policy "user manages own profile" on profiles for insert with check (user_id = auth.uid());
create policy "user updates own profile" on profiles for update using (user_id = auth.uid());
-- CRITICAL (lesson from canvas_shares): table-level grants are NOT automatic here
grant select, insert, update on profiles to authenticated;
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
create or replace function can_view_profile(p_viewer uuid, p_target uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select p_viewer = p_target or exists (
    select 1
    from (select distinct owner_id, canvas_id from canvas_shares) workspace
    where (
      workspace.owner_id = p_viewer
      or exists (
        select 1 from canvas_shares viewer_share
        join share_members viewer_member on viewer_member.share_id = viewer_share.id
        where viewer_share.owner_id = workspace.owner_id
          and viewer_share.canvas_id = workspace.canvas_id
          and viewer_member.user_id = p_viewer
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
  );
$$;

revoke execute on function can_view_profile(uuid, uuid) from PUBLIC, anon;
grant execute on function can_view_profile(uuid, uuid) to authenticated;
drop policy if exists "profiles readable by signed-in users" on profiles;
drop policy if exists "profiles readable by canvas participants" on profiles;
create policy "profiles readable by canvas participants" on profiles
  for select using (can_view_profile(auth.uid(), profiles.user_id));
