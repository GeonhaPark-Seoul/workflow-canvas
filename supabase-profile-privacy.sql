-- Run this in Supabase Dashboard -> SQL Editor for an existing deployment.
-- Requires supabase-schema.sql and supabase-shares.sql to have already run.
-- Safe to re-run; keeps profile email/last_seen visible to the owner and every
-- accepted participant of the same canvas, never to pending invitees/outsiders.

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
