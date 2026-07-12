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

-- A profile is visible to its owner, a canvas owner who invited that user, or
-- an accepted invitee viewing the owner. Pending email invites do not grant
-- profile access because they are not an established user-to-user relationship.
create or replace function can_view_profile(p_viewer uuid, p_target uuid)
  returns boolean language sql security definer stable set search_path = public as $$
  select p_viewer = p_target or exists (
    select 1 from canvas_shares s
    where (s.owner_id = p_viewer and exists (
             select 1 from share_members m where m.share_id = s.id and m.user_id = p_target
           ))
       or (s.owner_id = p_target and exists (
             select 1 from share_members m where m.share_id = s.id and m.user_id = p_viewer
           ))
  );
$$;

grant execute on function can_view_profile(uuid, uuid) to authenticated;
drop policy if exists "profiles readable by signed-in users" on profiles;
drop policy if exists "profiles readable by canvas participants" on profiles;
create policy "profiles readable by canvas participants" on profiles
  for select using (can_view_profile(auth.uid(), profiles.user_id));
