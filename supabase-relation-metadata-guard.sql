-- Run this in Supabase Dashboard -> SQL Editor after supabase-schema.sql.
-- Safe to re-run. Protects typed relation metadata from stale clients that
-- keep the edge itself but drop its entire relation data envelope.

create or replace function public.prevent_canvas_relation_metadata_loss()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  relation_keys constant text[] := array[
    'relationType',
    'relationLabel',
    'relationExplicit',
    'relationSourceKind',
    'relationConfidence',
    'relationEvidence',
    'relationEvidenceRef',
    'relationRuntime'
  ];
begin
  if new.edges is not distinct from old.edges then
    return new;
  end if;

  -- Existing malformed legacy rows are outside this narrow migration. Once an
  -- edge array contains typed relation metadata, however, a non-array rewrite
  -- must not be allowed to erase it.
  if jsonb_typeof(old.edges) is distinct from 'array' then
    return new;
  end if;

  if jsonb_typeof(new.edges) is distinct from 'array' then
    if exists (
      select 1
      from jsonb_array_elements(old.edges) as old_item(edge)
      where jsonb_typeof(old_item.edge -> 'data') = 'object'
        and (old_item.edge -> 'data') ?| relation_keys
    ) then
      raise exception using
        errcode = 'P0001',
        message = '[workflow_canvas_relation_metadata_guard] 관계 메타데이터 손실이 감지되어 저장을 중단했습니다. 열린 Workflow Canvas 탭을 모두 닫고 최신 앱을 다시 여세요.';
    end if;
    return new;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(old.edges) as old_item(edge)
    join jsonb_array_elements(new.edges) as new_item(edge)
      on new_item.edge ->> 'id' = old_item.edge ->> 'id'
    where jsonb_typeof(old_item.edge -> 'data') = 'object'
      and (old_item.edge -> 'data') ?| relation_keys
      and (
        jsonb_typeof(new_item.edge -> 'data') is distinct from 'object'
        or not ((new_item.edge -> 'data') ?| relation_keys)
      )
  ) then
    raise exception using
      errcode = 'P0001',
      message = '[workflow_canvas_relation_metadata_guard] 관계 메타데이터 손실이 감지되어 저장을 중단했습니다. 열린 Workflow Canvas 탭을 모두 닫고 최신 앱을 다시 여세요.';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_canvas_relation_metadata on public.canvases;
create trigger protect_canvas_relation_metadata
before update of edges on public.canvases
for each row
execute function public.prevent_canvas_relation_metadata_loss();

-- Server-side repair checks this before writing so recovery cannot run before
-- the protection trigger is installed and enabled.
create or replace function public.canvas_relation_metadata_guard_ready()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'canvases'
      and trigger_row.tgname = 'protect_canvas_relation_metadata'
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
  );
$$;

revoke execute on function public.canvas_relation_metadata_guard_ready() from PUBLIC, anon, authenticated;
grant execute on function public.canvas_relation_metadata_guard_ready() to service_role;
