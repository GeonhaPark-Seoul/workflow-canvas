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
