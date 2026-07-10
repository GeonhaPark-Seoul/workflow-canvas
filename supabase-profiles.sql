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
create policy "profiles readable by signed-in users" on profiles for select using (auth.role() = 'authenticated');
create policy "user manages own profile" on profiles for insert with check (user_id = auth.uid());
create policy "user updates own profile" on profiles for update using (user_id = auth.uid());
-- CRITICAL (lesson from canvas_shares): table-level grants are NOT automatic here
grant select, insert, update on profiles to authenticated;
grant all on profiles to service_role;
