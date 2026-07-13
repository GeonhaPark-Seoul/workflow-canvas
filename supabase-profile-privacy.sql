-- Run this in Supabase Dashboard -> SQL Editor for an existing deployment.
-- Requires supabase-schema.sql and supabase-shares.sql to have already run.
-- Safe to re-run; keeps profile email/last_seen visible only to canvas owners
-- and accepted invitees who share a canvas with each other.

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

revoke execute on function can_view_profile(uuid, uuid) from PUBLIC, anon;
grant execute on function can_view_profile(uuid, uuid) to authenticated;
drop policy if exists "profiles readable by signed-in users" on profiles;
drop policy if exists "profiles readable by canvas participants" on profiles;
create policy "profiles readable by canvas participants" on profiles
  for select using (can_view_profile(auth.uid(), profiles.user_id));
