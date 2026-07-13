-- Private image storage for photo content nodes.
-- Run after supabase-schema.sql and supabase-shares.sql. Safe to re-run.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'canvas-images',
  'canvas-images',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Object path: <canvas-owner-uuid>/<canvas-id>/<node-id>/<random>.jpg
create or replace function can_access_canvas_image(p_name text, p_write boolean default false)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_owner_text text := split_part(p_name, '/', 1);
  v_canvas_id text := split_part(p_name, '/', 2);
  v_node_id text := split_part(p_name, '/', 3);
  v_owner uuid;
begin
  if auth.uid() is null
     or v_owner_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     or v_canvas_id = ''
     or v_node_id = '' then
    return false;
  end if;
  v_owner := v_owner_text::uuid;

  if auth.uid() = v_owner then
    return exists (
      select 1 from canvases c
      where c.user_id = v_owner and c.canvas_id = v_canvas_id
    );
  end if;

  return exists (
    select 1
    from canvas_shares s
    join share_members m on m.share_id = s.id and m.user_id = auth.uid()
    where s.owner_id = v_owner
      and s.canvas_id = v_canvas_id
      and (not p_write or m.can_edit)
      and (
        -- An unrestricted-view invite may read the rest of the canvas, but
        -- writes always stay inside the explicitly delegated region.
        (not p_write and not coalesce(m.restrict_view_override, s.restrict_view))
        or s.scope = 'canvas'
        or (s.scope = 'node' and s.target_id = v_node_id)
        or (
          s.scope = 'group'
          and exists (
            select 1
            from canvases c
            cross join lateral jsonb_array_elements(c.nodes) n
            where c.user_id = v_owner
              and c.canvas_id = v_canvas_id
              and n->>'id' = v_node_id
              and n->>'parentId' = s.target_id
          )
        )
      )
  );
end;
$$;

revoke execute on function can_access_canvas_image(text, boolean) from PUBLIC, anon;
grant execute on function can_access_canvas_image(text, boolean) to authenticated;

drop policy if exists "canvas image participants read" on storage.objects;
create policy "canvas image participants read" on storage.objects
  for select using (
    bucket_id = 'canvas-images' and can_access_canvas_image(name, false)
  );

drop policy if exists "canvas image participants insert" on storage.objects;
create policy "canvas image participants insert" on storage.objects
  for insert with check (
    bucket_id = 'canvas-images' and can_access_canvas_image(name, true)
  );

drop policy if exists "canvas image participants update" on storage.objects;
create policy "canvas image participants update" on storage.objects
  for update using (
    bucket_id = 'canvas-images' and can_access_canvas_image(name, true)
  ) with check (
    bucket_id = 'canvas-images' and can_access_canvas_image(name, true)
  );

drop policy if exists "canvas image participants delete" on storage.objects;
create policy "canvas image participants delete" on storage.objects
  for delete using (
    bucket_id = 'canvas-images' and can_access_canvas_image(name, true)
  );
