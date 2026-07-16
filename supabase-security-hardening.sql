-- Existing-deployment hardening. Run after schema, shares, and profiles SQL.

drop policy if exists "users manage own canvases" on public.canvases;
create policy "users manage own canvases" on public.canvases
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "users manage own prefs" on public.user_prefs;
create policy "users manage own prefs" on public.user_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create index if not exists canvases_user_updated_idx on public.canvases (user_id, updated_at asc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'canvases_payload_arrays') then
    alter table public.canvases add constraint canvases_payload_arrays check (
      jsonb_typeof(nodes) = 'array'
      and jsonb_typeof(edges) = 'array'
      and jsonb_typeof(notes) = 'array'
      and jsonb_typeof(views) = 'array'
      and (stage_types is null or jsonb_typeof(stage_types) = 'array')
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'canvases_payload_item_limits') then
    alter table public.canvases add constraint canvases_payload_item_limits check (
      jsonb_array_length(nodes) <= 10000
      and jsonb_array_length(edges) <= 20000
      and jsonb_array_length(notes) <= 10000
      and jsonb_array_length(views) <= 1000
      and (stage_types is null or jsonb_array_length(stage_types) <= 200)
    );
  end if;
end $$;

drop policy if exists "profiles readable by signed-in users" on public.profiles;
drop policy if exists "profiles readable by canvas participants" on public.profiles;
drop function if exists public.can_view_profile(uuid, uuid);

create or replace function public.can_view_profile(p_target uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select auth.uid() is not null and (auth.uid() = p_target or exists (
    select 1
    from public.canvas_shares workspace
    where (
      workspace.owner_id = auth.uid()
      or exists (
        select 1 from public.canvas_shares viewer_share
        join public.share_members viewer_member on viewer_member.share_id = viewer_share.id
        where viewer_share.owner_id = workspace.owner_id
          and viewer_share.canvas_id = workspace.canvas_id
          and viewer_member.user_id = auth.uid()
      )
    ) and (
      workspace.owner_id = p_target
      or exists (
        select 1 from public.canvas_shares target_share
        join public.share_members target_member on target_member.share_id = target_share.id
        where target_share.owner_id = workspace.owner_id
          and target_share.canvas_id = workspace.canvas_id
          and target_member.user_id = p_target
      )
    )
  ));
$$;

revoke execute on function public.can_view_profile(uuid) from PUBLIC, anon;
grant execute on function public.can_view_profile(uuid) to authenticated;
create policy "profiles readable by canvas participants" on public.profiles
  for select using (public.can_view_profile(profiles.user_id));

update public.profiles p
set email = u.email
from auth.users u
where p.user_id = u.id and p.email is distinct from u.email;

create or replace function public.upsert_my_profile(p_nickname text, p_glyph text, p_color text)
returns setof public.profiles language plpgsql security definer set search_path = public as $$
declare trusted_email text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if p_nickname is not null and char_length(p_nickname) > 80 then raise exception 'nickname too long'; end if;
  if p_glyph is not null and p_glyph !~ '^[A-Z0-9]$' then raise exception 'invalid glyph'; end if;
  if p_color is not null and p_color !~ '^#[0-9a-fA-F]{6}$' then raise exception 'invalid color'; end if;
  select email into trusted_email from auth.users where id = auth.uid();
  return query
    insert into public.profiles (user_id, nickname, glyph, color, email, updated_at, last_seen_at)
    values (auth.uid(), p_nickname, p_glyph, p_color, trusted_email, now(), now())
    on conflict (user_id) do update set
      nickname = excluded.nickname, glyph = excluded.glyph, color = excluded.color,
      email = excluded.email, updated_at = now(), last_seen_at = now()
    returning *;
end;
$$;

create or replace function public.touch_my_profile()
returns void language plpgsql security definer set search_path = public as $$
declare trusted_email text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select email into trusted_email from auth.users where id = auth.uid();
  insert into public.profiles (user_id, email, last_seen_at)
  values (auth.uid(), trusted_email, now())
  on conflict (user_id) do update set email = excluded.email, last_seen_at = excluded.last_seen_at;
end;
$$;

revoke insert, update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
revoke execute on function public.upsert_my_profile(text, text, text) from PUBLIC, anon;
revoke execute on function public.touch_my_profile() from PUBLIC, anon;
grant execute on function public.upsert_my_profile(text, text, text) to authenticated;
grant execute on function public.touch_my_profile() to authenticated;

-- Invitations and member administration now pass through authenticated server
-- endpoints or bounded security-definer RPCs. Browser table access is read-only.
revoke insert, update, delete on public.canvas_shares from authenticated;
revoke update, delete on public.share_members from authenticated;
grant select on public.canvas_shares, public.share_members, public.share_revocations to authenticated;

notify pgrst, 'reload schema';
