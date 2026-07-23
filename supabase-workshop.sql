-- Run in Supabase Dashboard -> SQL Editor after supabase-schema.sql and
-- supabase-shares.sql. Workshop records are independent from canvas JSON, but
-- every row remains anchored to an owner-scoped canvas.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Shared CHECK helpers are SECURITY INVOKER and reveal no database content.
create or replace function public.workshop_stage_rank(value text)
returns smallint
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select case value
    when 'backlog' then 0
    when 'A' then 1
    when 'B' then 2
    when 'C' then 3
    when 'D' then 4
    when 'E' then 5
    when 'F' then 6
    when 'G' then 7
    when 'H' then 8
    else -1
  end::smallint;
$$;

create or replace function public.workshop_contains_secret_value(value text)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select
    value ~ 'eyJ[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{8,}'
    or value ~* '(^|[^A-Za-z0-9_])(sk|pk|ghp|github_pat|xox[baprs])[-_][A-Za-z0-9_-]{12,}'
    or value ~* '(^|[^A-Za-z0-9_])sb_(publishable|secret)_[A-Za-z0-9_-]{12,}'
    or value ~ '(^|[^A-Z0-9])(AKIA|ASIA)[A-Z0-9]{16}([^A-Z0-9]|$)'
    or value ~ '(^|[^A-Za-z0-9_-])AIza[A-Za-z0-9_-]{20,}'
    or value ~* '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----'
    or value ~* '(api[_ -]?key|access[_ -]?key|service[_ -]?key|token|secret|password|credential)[[:space:]]*(=|:)[[:space:]]*[''"]?[A-Za-z0-9_./+=-]{12,}'
    or value ~* '(^|[^A-Za-z0-9_])(bearer|basic)[[:space:]]+[A-Za-z0-9._~+/=-]{16,}'
    or value ~* '(^|[^a-z0-9+.-])[a-z][a-z0-9+.-]*://[^/[:space:]]+@';
$$;

-- PostgreSQL has no built-in URL decoder. Decode only percent-encoded ASCII
-- bytes, recursively, which is enough to reveal URL syntax and credential-key
-- names while preserving ordinary UTF-8 URL encodings for storage.
create or replace function public.workshop_decode_ascii_percent(value text)
returns text
language plpgsql
immutable
strict
security invoker
set search_path = ''
as $$
declare
  decoded text := value;
  matched text[];
  matched_at integer;
  byte_value integer;
begin
  loop
    matched := regexp_match(decoded, '%([0-7][0-9A-Fa-f])');
    exit when matched is null;
    byte_value := get_byte(decode(matched[1], 'hex'), 0);
    -- PostgreSQL text cannot contain NUL. Leave it encoded so the safety
    -- predicate below can reject it without raising from this helper.
    if byte_value = 0 then return decoded; end if;
    matched_at := strpos(lower(decoded), lower('%' || matched[1]));
    decoded := overlay(decoded placing chr(byte_value) from matched_at for 3);
  end loop;
  return decoded;
end;
$$;

create or replace function public.workshop_external_ref_is_safe(value text)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $$
  select
    not public.workshop_contains_secret_value(candidate.decoded)
    and candidate.decoded !~ '[[:cntrl:]]'
    and candidate.decoded !~* '%00'
    and candidate.decoded !~* '^(javascript|data|vbscript):'
    and candidate.decoded !~* '[?&](x-(amz|goog)-)?(access[_-]?token|api[_-]?key|service[_-]?key|auth(orization)?|code|credential|key|passw(or)?d|secret|sig|signature|token)='
    and candidate.decoded !~* '[#&?](x-(amz|goog)-)?(access[_-]?token|api[_-]?key|service[_-]?key|auth(orization)?|code|credential|key|passw(or)?d|secret|sig|signature|token)='
    and (
      candidate.decoded ~ '^[A-Za-z]:[\\/]'
      or candidate.decoded !~* '^[a-z][a-z0-9+.-]*:'
      or candidate.decoded ~* '^https?://'
    )
    and candidate.decoded !~* '^https?://hooks\.slack\.com/services/[^/?#]+'
    and candidate.decoded !~* '^https://(canary\.|ptb\.)?discord(app)?\.com/api(/v[0-9]+)?/webhooks/[^/]+/[^/?#]+'
    and candidate.decoded !~* '^https?://api\.telegram\.org/bot[^/?#[:space:]]{12,}/'
    and candidate.decoded !~* '/(webhooks?|hooks?|tokens?|secrets?|credentials?|authorization)(/|=)[^/?#[:space:]]{12,}'
  from (
    select public.workshop_decode_ascii_percent(value) as decoded
  ) candidate;
$$;

revoke execute on function public.workshop_stage_rank(text) from public, anon;
revoke execute on function public.workshop_contains_secret_value(text) from public, anon;
revoke execute on function public.workshop_decode_ascii_percent(text) from public, anon;
revoke execute on function public.workshop_external_ref_is_safe(text) from public, anon;
grant execute on function public.workshop_stage_rank(text) to authenticated, service_role;
grant execute on function public.workshop_contains_secret_value(text) to authenticated, service_role;
grant execute on function public.workshop_decode_ascii_percent(text) to authenticated, service_role;
grant execute on function public.workshop_external_ref_is_safe(text) to authenticated, service_role;

-- This explicit-user helper is private and is not executable by API roles.
-- Bound callers below prevent authenticated users from forging another user id.
create or replace function private.workshop_canvas_participant_for_user(
  p_owner uuid,
  p_canvas text,
  p_user uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null and (
    p_user = p_owner
    or exists (
      select 1
      from public.canvas_shares share
      join public.share_members member on member.share_id = share.id
      where share.owner_id = p_owner
        and share.canvas_id = p_canvas
        and member.user_id = p_user
    )
  );
$$;

create or replace function private.workshop_canvas_participant(
  p_owner uuid,
  p_canvas text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.workshop_canvas_participant_for_user(
    p_owner,
    p_canvas,
    (select auth.uid())
  );
$$;

revoke execute on function private.workshop_canvas_participant_for_user(uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function private.workshop_canvas_participant(uuid, text)
  from public, anon, service_role;
grant execute on function private.workshop_canvas_participant(uuid, text)
  to authenticated;

-- Fixed backlog plus the eight A-H stage contracts.
create table if not exists public.workshop_stage_contracts (
  stage text primary key
    check (stage in ('backlog', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  position smallint not null unique
    check (position between 0 and 8),
  recommended_artifact_kinds text[] not null default '{}'::text[]
    check (
      cardinality(recommended_artifact_kinds) <= 16
      and array_position(recommended_artifact_kinds, null) is null
    ),
  gate_guidance text not null
    check (
      btrim(gate_guidance) <> ''
      and octet_length(gate_guidance) <= 4000
    )
);

insert into public.workshop_stage_contracts (
  stage,
  position,
  recommended_artifact_kinds,
  gate_guidance
)
values
  (
    'backlog',
    0,
    '{}'::text[],
    '한 줄 설명과 이 일을 하는 이유를 확인한 뒤 기획으로 보냅니다.'
  ),
  (
    'A',
    1,
    array['design-brief'],
    '범위·성공 기준·구현 지시가 담긴 기획서 또는 설계의뢰서를 확인합니다.'
  ),
  (
    'B',
    2,
    array['patch', 'base-commit', 'sha256', 'verification'],
    'patch, 기준 커밋, SHA-256, 검증 결과를 확인합니다.'
  ),
  (
    'C',
    3,
    array['deployment-record', 'post-deploy-e2e'],
    '배포 기록과 배포 후 사용자 실제 확인 결과를 확인합니다.'
  ),
  (
    'D',
    4,
    array['observation-link', 'status-record'],
    '운영에 상주할 수 있습니다. 다음 단계로 갈 때는 관측 연결과 상태 기록을 확인합니다.'
  ),
  ('E', 5, '{}'::text[], 'Connector가 연결되기 전까지 자유 형식 기록을 확인하고 수동으로 승인합니다.'),
  ('F', 6, '{}'::text[], 'Connector가 연결되기 전까지 자유 형식 기록을 확인하고 수동으로 승인합니다.'),
  ('G', 7, '{}'::text[], 'Connector가 연결되기 전까지 자유 형식 기록을 확인하고 수동으로 승인합니다.'),
  ('H', 8, '{}'::text[], 'Connector가 연결되기 전까지 자유 형식 기록을 확인하고 수동으로 승인합니다.')
on conflict (stage) do update set
  position = excluded.position,
  recommended_artifact_kinds = excluded.recommended_artifact_kinds,
  gate_guidance = excluded.gate_guidance;

create table if not exists public.workshop_goals (
  id uuid primary key default gen_random_uuid(),
  canvas_owner_id uuid not null,
  canvas_id text not null,
  title text not null
    check (
      btrim(title) <> ''
      and char_length(title) <= 240
      and title !~ '[[:cntrl:]]'
    ),
  reason text not null
    check (
      btrim(reason) <> ''
      and char_length(reason) <= 5000
      and position(chr(127) in reason) = 0
    ),
  stage text not null default 'backlog'
    check (stage in ('backlog', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  terminal_stage text not null
    check (terminal_stage in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  status text not null default 'active'
    check (status in ('active', 'done', 'archived')),
  created_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workshop_goals_canvas_fk
    foreign key (canvas_owner_id, canvas_id)
    references public.canvases(user_id, canvas_id)
    on delete cascade,
  constraint workshop_goals_stage_not_past_terminal
    check (
      status <> 'active'
      or public.workshop_stage_rank(stage) <= public.workshop_stage_rank(terminal_stage)
    ),
  constraint workshop_goals_terminal_status
    check (status = 'active' or stage = terminal_stage),
  constraint workshop_goals_secret_boundary
    check (not public.workshop_contains_secret_value(title || E'\n' || reason))
);

create table if not exists public.workshop_tasks (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.workshop_goals(id) on delete cascade,
  parent_task_id uuid references public.workshop_tasks(id) on delete cascade,
  spawned_from_task_id uuid references public.workshop_tasks(id) on delete set null,
  title text not null
    check (
      btrim(title) <> ''
      and char_length(title) <= 240
      and title !~ '[[:cntrl:]]'
    ),
  stage text not null default 'backlog'
    check (stage in ('backlog', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  assignee_kind text not null default 'manual'
    check (assignee_kind in ('manual', 'yescode', 'nocode')),
  assignee_label text
    check (
      assignee_label is null
      or (
        btrim(assignee_label) <> ''
        and char_length(assignee_label) <= 160
        and assignee_label !~ '[[:cntrl:]]'
      )
    ),
  status text not null default 'active'
    check (status in ('active', 'done', 'archived')),
  created_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workshop_tasks_not_own_parent
    check (parent_task_id is null or parent_task_id <> id),
  constraint workshop_tasks_not_own_spawn
    check (spawned_from_task_id is null or spawned_from_task_id <> id),
  constraint workshop_tasks_secret_boundary
    check (
      not public.workshop_contains_secret_value(
        title || E'\n' || coalesce(assignee_label, '')
      )
    )
);

create table if not exists public.workshop_threads (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.workshop_goals(id) on delete cascade,
  task_id uuid references public.workshop_tasks(id) on delete cascade,
  title text
    check (
      title is null
      or (
        char_length(title) <= 240
        and title !~ '[[:cntrl:]]'
        and not public.workshop_contains_secret_value(title)
      )
    ),
  created_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workshop_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.workshop_threads(id) on delete cascade,
  parent_message_id uuid references public.workshop_messages(id) on delete set null,
  author_user_id uuid references auth.users(id) on delete set null,
  author_label text
    check (
      author_label is null
      or (
        btrim(author_label) <> ''
        and char_length(author_label) <= 160
        and author_label !~ '[[:cntrl:]]'
      )
    ),
  body text not null
    check (
      btrim(body) <> ''
      and char_length(body) <= 100000
      and position(chr(127) in body) = 0
      and not public.workshop_contains_secret_value(body)
    ),
  created_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at timestamptz not null default now(),
  constraint workshop_messages_not_own_parent
    check (parent_message_id is null or parent_message_id <> id)
);

create table if not exists public.workshop_artifacts (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.workshop_goals(id) on delete cascade,
  task_id uuid references public.workshop_tasks(id) on delete set null,
  stage text not null
    check (stage in ('backlog', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  kind text not null
    check (btrim(kind) <> '' and char_length(kind) <= 120),
  title text not null
    check (
      btrim(title) <> ''
      and char_length(title) <= 240
      and title !~ '[[:cntrl:]]'
    ),
  body text
    check (
      body is null
      or (
        char_length(body) <= 100000
        and position(chr(127) in body) = 0
      )
    ),
  external_ref text
    check (
      external_ref is null
      or (
        char_length(external_ref) <= 2000
        and external_ref !~ '[[:cntrl:]]'
        and public.workshop_external_ref_is_safe(external_ref)
      )
    ),
  created_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workshop_artifacts_content_required
    check (
      nullif(btrim(coalesce(body, '')), '') is not null
      or nullif(btrim(coalesce(external_ref, '')), '') is not null
    ),
  constraint workshop_artifacts_secret_boundary
    check (
      not public.workshop_contains_secret_value(
        kind || E'\n'
        || title || E'\n'
        || coalesce(body, '') || E'\n'
        || coalesce(external_ref, '')
      )
    )
);

create table if not exists public.workshop_gate_events (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.workshop_goals(id) on delete cascade,
  task_id uuid references public.workshop_tasks(id) on delete set null,
  from_stage text not null
    check (from_stage in ('backlog', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H')),
  to_stage text not null
    check (to_stage in ('A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'done')),
  approved_by uuid references auth.users(id) on delete set null
    default auth.uid(),
  forced boolean not null default false,
  missing_artifact_kinds text[] not null default '{}'::text[]
    check (
      cardinality(missing_artifact_kinds) <= 16
      and array_position(missing_artifact_kinds, null) is null
    ),
  created_at timestamptz not null default now()
);

-- Index every foreign key / policy predicate used by board loads and Realtime
-- authorization. Partial indexes keep sparse tree pointers compact.
create index if not exists workshop_goals_canvas_status_stage_idx
  on public.workshop_goals (canvas_owner_id, canvas_id, status, stage, created_at);
create index if not exists workshop_goals_creator_idx
  on public.workshop_goals (created_by, created_at desc);
create index if not exists workshop_tasks_goal_stage_status_idx
  on public.workshop_tasks (goal_id, stage, status, created_at);
create index if not exists workshop_tasks_created_by_idx
  on public.workshop_tasks (created_by)
  where created_by is not null;
create index if not exists workshop_tasks_parent_idx
  on public.workshop_tasks (parent_task_id)
  where parent_task_id is not null;
create index if not exists workshop_tasks_spawned_from_idx
  on public.workshop_tasks (spawned_from_task_id)
  where spawned_from_task_id is not null;
create index if not exists workshop_threads_goal_task_idx
  on public.workshop_threads (goal_id, task_id, created_at);
create index if not exists workshop_threads_task_idx
  on public.workshop_threads (task_id)
  where task_id is not null;
create index if not exists workshop_threads_created_by_idx
  on public.workshop_threads (created_by)
  where created_by is not null;
create unique index if not exists workshop_threads_goal_default_unique_idx
  on public.workshop_threads (goal_id)
  where task_id is null;
create unique index if not exists workshop_threads_goal_task_unique_idx
  on public.workshop_threads (goal_id, task_id)
  where task_id is not null;
create index if not exists workshop_messages_thread_created_idx
  on public.workshop_messages (thread_id, created_at, id);
create index if not exists workshop_messages_parent_idx
  on public.workshop_messages (parent_message_id)
  where parent_message_id is not null;
create index if not exists workshop_messages_author_user_idx
  on public.workshop_messages (author_user_id)
  where author_user_id is not null;
create index if not exists workshop_messages_created_by_idx
  on public.workshop_messages (created_by)
  where created_by is not null;
create index if not exists workshop_artifacts_goal_stage_created_idx
  on public.workshop_artifacts (goal_id, stage, created_at);
create index if not exists workshop_artifacts_task_idx
  on public.workshop_artifacts (task_id, created_at)
  where task_id is not null;
create index if not exists workshop_artifacts_created_by_idx
  on public.workshop_artifacts (created_by)
  where created_by is not null;
create index if not exists workshop_gate_events_goal_created_idx
  on public.workshop_gate_events (goal_id, created_at desc);
create index if not exists workshop_gate_events_task_idx
  on public.workshop_gate_events (task_id, created_at desc)
  where task_id is not null;
create index if not exists workshop_gate_events_approved_by_idx
  on public.workshop_gate_events (approved_by)
  where approved_by is not null;

create or replace function public.set_workshop_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.pin_workshop_goal_initial_state()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.stage := 'backlog';
  new.status := 'active';
  if (select auth.uid()) is not null then
    new.created_by := (select auth.uid());
  end if;
  return new;
end;
$$;

create or replace function public.validate_workshop_task_links()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  referenced_goal uuid;
begin
  -- Serialize every link mutation for one goal before reading its task graph.
  -- This prevents concurrent parent/spawn writes from each observing a
  -- cycle-free snapshot and committing a cycle together.
  perform goal.id
    from public.workshop_goals goal
    where goal.id = new.goal_id
    for update;
  if not found then
    raise exception 'workshop_task_goal_not_found';
  end if;

  if new.parent_task_id is not null then
    select task.goal_id
      into referenced_goal
      from public.workshop_tasks task
      where task.id = new.parent_task_id;
    if referenced_goal is null or referenced_goal <> new.goal_id then
      raise exception 'workshop_parent_task_goal_mismatch';
    end if;
    if exists (
      with recursive chain(id, parent_task_id, path) as (
        select task.id, task.parent_task_id, array[task.id]
        from public.workshop_tasks task
        where task.id = new.parent_task_id
        union all
        select task.id, task.parent_task_id, chain.path || task.id
        from public.workshop_tasks task
        join chain on task.id = chain.parent_task_id
        where not task.id = any(chain.path)
      )
      select 1 from chain where id = new.id
    ) then
      raise exception 'workshop_task_parent_cycle';
    end if;
  end if;

  referenced_goal := null;
  if new.spawned_from_task_id is not null then
    select task.goal_id
      into referenced_goal
      from public.workshop_tasks task
      where task.id = new.spawned_from_task_id;
    if referenced_goal is null or referenced_goal <> new.goal_id then
      raise exception 'workshop_spawn_task_goal_mismatch';
    end if;
    if exists (
      with recursive chain(id, spawned_from_task_id, path) as (
        select task.id, task.spawned_from_task_id, array[task.id]
        from public.workshop_tasks task
        where task.id = new.spawned_from_task_id
        union all
        select task.id, task.spawned_from_task_id, chain.path || task.id
        from public.workshop_tasks task
        join chain on task.id = chain.spawned_from_task_id
        where not task.id = any(chain.path)
      )
      select 1 from chain where id = new.id
    ) then
      raise exception 'workshop_task_spawn_cycle';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.validate_workshop_task_goal()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.task_id is not null and not exists (
    select 1
    from public.workshop_tasks task
    where task.id = new.task_id
      and task.goal_id = new.goal_id
  ) then
    raise exception 'workshop_task_goal_mismatch';
  end if;
  return new;
end;
$$;

create or replace function public.validate_workshop_message_author()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if num_nonnulls(new.author_user_id, nullif(btrim(new.author_label), '')) <> 1 then
    raise exception 'workshop_message_author_required';
  end if;
  if new.parent_message_id is not null and not exists (
    select 1
    from public.workshop_messages parent
    where parent.id = new.parent_message_id
      and parent.thread_id = new.thread_id
  ) then
    raise exception 'workshop_message_parent_thread_mismatch';
  end if;
  return new;
end;
$$;

create or replace function public.reject_workshop_identity_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Allow referential actions (ON DELETE SET NULL/CASCADE) initiated by a
  -- parent-table trigger while rejecting direct identity rewrites.
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  raise exception 'workshop_record_identity_is_immutable';
end;
$$;

create or replace function public.reject_workshop_append_only_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Root-record deletion may cascade through its owned append-only history.
  -- Direct edits/deletes of an individual history row remain impossible.
  if pg_trigger_depth() > 1 then
    if tg_op = 'DELETE' then return old; end if;
    return new;
  end if;
  raise exception '% is append-only', tg_table_name;
end;
$$;

revoke execute on function public.set_workshop_updated_at()
  from public, anon, authenticated, service_role;
revoke execute on function public.pin_workshop_goal_initial_state()
  from public, anon, authenticated, service_role;
revoke execute on function public.validate_workshop_task_links()
  from public, anon, authenticated, service_role;
revoke execute on function public.validate_workshop_task_goal()
  from public, anon, authenticated, service_role;
revoke execute on function public.validate_workshop_message_author()
  from public, anon, authenticated, service_role;
revoke execute on function public.reject_workshop_identity_mutation()
  from public, anon, authenticated, service_role;
revoke execute on function public.reject_workshop_append_only_mutation()
  from public, anon, authenticated, service_role;

drop trigger if exists workshop_goals_set_updated_at on public.workshop_goals;
create trigger workshop_goals_set_updated_at
before update on public.workshop_goals
for each row execute function public.set_workshop_updated_at();

drop trigger if exists workshop_goals_pin_initial_state on public.workshop_goals;
create trigger workshop_goals_pin_initial_state
before insert on public.workshop_goals
for each row execute function public.pin_workshop_goal_initial_state();

drop trigger if exists workshop_tasks_set_updated_at on public.workshop_tasks;
create trigger workshop_tasks_set_updated_at
before update on public.workshop_tasks
for each row execute function public.set_workshop_updated_at();

drop trigger if exists workshop_threads_set_updated_at on public.workshop_threads;
create trigger workshop_threads_set_updated_at
before update on public.workshop_threads
for each row execute function public.set_workshop_updated_at();

drop trigger if exists workshop_artifacts_set_updated_at on public.workshop_artifacts;
create trigger workshop_artifacts_set_updated_at
before update on public.workshop_artifacts
for each row execute function public.set_workshop_updated_at();

drop trigger if exists workshop_tasks_validate_links on public.workshop_tasks;
create trigger workshop_tasks_validate_links
before insert or update of goal_id, parent_task_id, spawned_from_task_id
on public.workshop_tasks
for each row execute function public.validate_workshop_task_links();

drop trigger if exists workshop_threads_validate_task_goal on public.workshop_threads;
create trigger workshop_threads_validate_task_goal
before insert or update of goal_id, task_id
on public.workshop_threads
for each row execute function public.validate_workshop_task_goal();

drop trigger if exists workshop_artifacts_validate_task_goal on public.workshop_artifacts;
create trigger workshop_artifacts_validate_task_goal
before insert or update of goal_id, task_id
on public.workshop_artifacts
for each row execute function public.validate_workshop_task_goal();

drop trigger if exists workshop_gate_events_validate_task_goal on public.workshop_gate_events;
create trigger workshop_gate_events_validate_task_goal
before insert or update of goal_id, task_id
on public.workshop_gate_events
for each row execute function public.validate_workshop_task_goal();

drop trigger if exists workshop_messages_validate_author on public.workshop_messages;
create trigger workshop_messages_validate_author
before insert on public.workshop_messages
for each row execute function public.validate_workshop_message_author();

drop trigger if exists workshop_goals_protect_identity on public.workshop_goals;
create trigger workshop_goals_protect_identity
before update of id, canvas_owner_id, canvas_id, created_by, created_at
on public.workshop_goals
for each row execute function public.reject_workshop_identity_mutation();

drop trigger if exists workshop_tasks_protect_identity on public.workshop_tasks;
create trigger workshop_tasks_protect_identity
before update of id, goal_id, created_by, created_at
on public.workshop_tasks
for each row execute function public.reject_workshop_identity_mutation();

drop trigger if exists workshop_threads_protect_identity on public.workshop_threads;
create trigger workshop_threads_protect_identity
before update of id, goal_id, task_id, created_by, created_at
on public.workshop_threads
for each row execute function public.reject_workshop_identity_mutation();

drop trigger if exists workshop_artifacts_protect_identity on public.workshop_artifacts;
create trigger workshop_artifacts_protect_identity
before update of id, goal_id, created_by, created_at
on public.workshop_artifacts
for each row execute function public.reject_workshop_identity_mutation();

drop trigger if exists workshop_messages_append_only on public.workshop_messages;
create trigger workshop_messages_append_only
before update or delete on public.workshop_messages
for each row execute function public.reject_workshop_append_only_mutation();

drop trigger if exists workshop_gate_events_append_only on public.workshop_gate_events;
create trigger workshop_gate_events_append_only
before update or delete on public.workshop_gate_events
for each row execute function public.reject_workshop_append_only_mutation();

drop trigger if exists workshop_artifacts_append_only on public.workshop_artifacts;
create trigger workshop_artifacts_append_only
before update or delete on public.workshop_artifacts
for each row execute function public.reject_workshop_append_only_mutation();

-- RLS: every accepted share_members row gets the same Workshop data access as
-- the canvas owner. Pending email/link invitations do not qualify.
alter table public.workshop_stage_contracts enable row level security;
alter table public.workshop_goals enable row level security;
alter table public.workshop_tasks enable row level security;
alter table public.workshop_threads enable row level security;
alter table public.workshop_messages enable row level security;
alter table public.workshop_artifacts enable row level security;
alter table public.workshop_gate_events enable row level security;

drop policy if exists "workshop contracts readable by authenticated users"
  on public.workshop_stage_contracts;
create policy "workshop contracts readable by authenticated users"
on public.workshop_stage_contracts
for select
to authenticated
using (true);

drop policy if exists "workshop participants select goals"
  on public.workshop_goals;
create policy "workshop participants select goals"
on public.workshop_goals
for select
to authenticated
using (
  private.workshop_canvas_participant(canvas_owner_id, canvas_id)
);

drop policy if exists "workshop participants insert goals"
  on public.workshop_goals;
create policy "workshop participants insert goals"
on public.workshop_goals
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and stage = 'backlog'
  and status = 'active'
  and private.workshop_canvas_participant(canvas_owner_id, canvas_id)
);

drop policy if exists "workshop participants update goals"
  on public.workshop_goals;
create policy "workshop participants update goals"
on public.workshop_goals
for update
to authenticated
using (
  private.workshop_canvas_participant(canvas_owner_id, canvas_id)
)
with check (
  private.workshop_canvas_participant(canvas_owner_id, canvas_id)
);

drop policy if exists "workshop participants delete goals"
  on public.workshop_goals;

drop policy if exists "workshop participants select tasks"
  on public.workshop_tasks;
create policy "workshop participants select tasks"
on public.workshop_tasks
for select
to authenticated
using (
  exists (
    select 1 from public.workshop_goals goal
    where goal.id = workshop_tasks.goal_id
  )
);

drop policy if exists "workshop participants insert tasks"
  on public.workshop_tasks;
create policy "workshop participants insert tasks"
on public.workshop_tasks
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.workshop_goals goal
    where goal.id = workshop_tasks.goal_id
  )
);

drop policy if exists "workshop participants update tasks"
  on public.workshop_tasks;
create policy "workshop participants update tasks"
on public.workshop_tasks
for update
to authenticated
using (
  exists (
    select 1 from public.workshop_goals goal
    where goal.id = workshop_tasks.goal_id
  )
)
with check (
  exists (
    select 1 from public.workshop_goals goal
    where goal.id = workshop_tasks.goal_id
  )
);

drop policy if exists "workshop participants delete tasks"
  on public.workshop_tasks;

drop policy if exists "workshop participants select threads"
  on public.workshop_threads;
create policy "workshop participants select threads"
on public.workshop_threads
for select
to authenticated
using (
  exists (
    select 1 from public.workshop_goals goal
    where goal.id = workshop_threads.goal_id
  )
);

drop policy if exists "workshop participants insert threads"
  on public.workshop_threads;
create policy "workshop participants insert threads"
on public.workshop_threads
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.workshop_goals goal
    where goal.id = workshop_threads.goal_id
  )
);

drop policy if exists "workshop participants update threads"
  on public.workshop_threads;
create policy "workshop participants update threads"
on public.workshop_threads
for update
to authenticated
using (
  exists (
    select 1 from public.workshop_goals goal
    where goal.id = workshop_threads.goal_id
  )
)
with check (
  exists (
    select 1 from public.workshop_goals goal
    where goal.id = workshop_threads.goal_id
  )
);

drop policy if exists "workshop participants delete threads"
  on public.workshop_threads;

drop policy if exists "workshop participants select messages"
  on public.workshop_messages;
create policy "workshop participants select messages"
on public.workshop_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.workshop_threads thread
    where thread.id = workshop_messages.thread_id
  )
);

drop policy if exists "workshop participants insert messages"
  on public.workshop_messages;
create policy "workshop participants insert messages"
on public.workshop_messages
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and (
    author_user_id is null
    or author_user_id = (select auth.uid())
  )
  and exists (
    select 1
    from public.workshop_threads thread
    where thread.id = workshop_messages.thread_id
  )
);

drop policy if exists "workshop participants select artifacts"
  on public.workshop_artifacts;
create policy "workshop participants select artifacts"
on public.workshop_artifacts
for select
to authenticated
using (
  exists (
    select 1 from public.workshop_goals goal
    where goal.id = workshop_artifacts.goal_id
  )
);

drop policy if exists "workshop participants insert artifacts"
  on public.workshop_artifacts;
create policy "workshop participants insert artifacts"
on public.workshop_artifacts
for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.workshop_goals goal
    where goal.id = workshop_artifacts.goal_id
  )
);

drop policy if exists "workshop participants update artifacts"
  on public.workshop_artifacts;

drop policy if exists "workshop participants delete artifacts"
  on public.workshop_artifacts;

drop policy if exists "workshop participants select gate events"
  on public.workshop_gate_events;
create policy "workshop participants select gate events"
on public.workshop_gate_events
for select
to authenticated
using (
  exists (
    select 1 from public.workshop_goals goal
    where goal.id = workshop_gate_events.goal_id
  )
);

-- No table INSERT grant is given for gate events. The WITH CHECK policy is
-- defense in depth; browser gate writes go through the atomic RPC below.
drop policy if exists "workshop participants insert gate events"
  on public.workshop_gate_events;
create policy "workshop participants insert gate events"
on public.workshop_gate_events
for insert
to authenticated
with check (
  approved_by = (select auth.uid())
  and exists (
    select 1 from public.workshop_goals goal
    where goal.id = workshop_gate_events.goal_id
  )
);

-- The internal implementation recalculates missing artifacts while holding a
-- row lock. p_forced is only a human confirmation; it is never persisted as
-- truth without server-side evidence of missing recommended kinds.
create or replace function private.advance_workshop_goal_internal(
  p_goal_id uuid,
  p_forced boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  current_goal public.workshop_goals%rowtype;
  updated_goal public.workshop_goals%rowtype;
  contract public.workshop_stage_contracts%rowtype;
  gate_event public.workshop_gate_events%rowtype;
  missing text[] := '{}'::text[];
  destination text;
  computed_forced boolean;
begin
  if actor is null then
    raise exception 'workshop_human_auth_required';
  end if;

  select goal.*
    into current_goal
    from public.workshop_goals goal
    where goal.id = p_goal_id
    for update;
  if not found then
    raise exception 'workshop_goal_not_found';
  end if;
  if not private.workshop_canvas_participant_for_user(
    current_goal.canvas_owner_id,
    current_goal.canvas_id,
    actor
  ) then
    raise exception 'workshop_canvas_access_denied';
  end if;
  if current_goal.status <> 'active' then
    raise exception 'workshop_goal_not_active';
  end if;

  select stage_contract.*
    into contract
    from public.workshop_stage_contracts stage_contract
    where stage_contract.stage = current_goal.stage;
  if not found then
    raise exception 'workshop_stage_contract_missing';
  end if;

  select coalesce(array_agg(required_kind order by required_kind), '{}'::text[])
    into missing
    from unnest(contract.recommended_artifact_kinds) required_kind
    where not exists (
      select 1
      from public.workshop_artifacts artifact
      where artifact.goal_id = current_goal.id
        and artifact.stage = current_goal.stage
        and artifact.kind = required_kind
    );

  computed_forced := cardinality(missing) > 0;
  if computed_forced and not coalesce(p_forced, false) then
    raise exception 'workshop_gate_artifacts_missing'
      using detail = array_to_string(missing, ',');
  end if;

  if current_goal.stage = current_goal.terminal_stage then
    destination := 'done';
  else
    destination := case current_goal.stage
      when 'backlog' then 'A'
      when 'A' then 'B'
      when 'B' then 'C'
      when 'C' then 'D'
      when 'D' then 'E'
      when 'E' then 'F'
      when 'F' then 'G'
      when 'G' then 'H'
      else null
    end;
  end if;
  if destination is null then
    raise exception 'workshop_gate_destination_missing';
  end if;

  update public.workshop_goals goal
  set
    stage = case when destination = 'done' then goal.stage else destination end,
    status = case when destination = 'done' then 'done' else goal.status end
  where goal.id = current_goal.id
  returning goal.* into updated_goal;

  insert into public.workshop_gate_events (
    goal_id,
    from_stage,
    to_stage,
    approved_by,
    forced,
    missing_artifact_kinds
  )
  values (
    current_goal.id,
    current_goal.stage,
    destination,
    actor,
    computed_forced,
    missing
  )
  returning * into gate_event;

  return jsonb_build_object(
    'goal', to_jsonb(updated_goal),
    'gateEvent', to_jsonb(gate_event),
    'missingArtifactKinds', to_jsonb(missing)
  );
end;
$$;

create or replace function public.advance_workshop_goal(
  p_goal_id uuid,
  p_forced boolean default false
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.advance_workshop_goal_internal(p_goal_id, p_forced);
$$;

revoke execute on function private.advance_workshop_goal_internal(uuid, boolean)
  from public, anon, service_role;
revoke execute on function public.advance_workshop_goal(uuid, boolean)
  from public, anon, service_role;
grant execute on function private.advance_workshop_goal_internal(uuid, boolean)
  to authenticated;
grant execute on function public.advance_workshop_goal(uuid, boolean)
  to authenticated;

create or replace function private.ensure_workshop_thread_internal(
  p_goal_id uuid,
  p_task_id uuid default null,
  p_created_by uuid default null
)
returns public.workshop_threads
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  actor uuid;
  goal public.workshop_goals%rowtype;
  result public.workshop_threads%rowtype;
  thread_title text;
begin
  if caller is not null and p_created_by is not null and caller <> p_created_by then
    raise exception 'workshop_actor_mismatch';
  end if;
  actor := coalesce(caller, p_created_by);
  if actor is null then
    raise exception 'workshop_actor_required';
  end if;

  select item.* into goal
  from public.workshop_goals item
  where item.id = p_goal_id;
  if not found then
    raise exception 'workshop_goal_not_found';
  end if;
  if not private.workshop_canvas_participant_for_user(
    goal.canvas_owner_id,
    goal.canvas_id,
    actor
  ) then
    raise exception 'workshop_canvas_access_denied';
  end if;
  if p_task_id is not null and not exists (
    select 1 from public.workshop_tasks task
    where task.id = p_task_id and task.goal_id = p_goal_id
  ) then
    raise exception 'workshop_task_goal_mismatch';
  end if;
  if p_task_id is null then
    thread_title := goal.title;
  else
    select task.title into thread_title
    from public.workshop_tasks task
    where task.id = p_task_id;
  end if;

  select thread.* into result
  from public.workshop_threads thread
  where thread.goal_id = p_goal_id
    and thread.task_id is not distinct from p_task_id
  order by thread.created_at
  limit 1;
  if found then return result; end if;

  insert into public.workshop_threads (goal_id, task_id, title, created_by)
  values (p_goal_id, p_task_id, thread_title, actor)
  on conflict do nothing
  returning * into result;
  if found then return result; end if;

  select thread.* into result
  from public.workshop_threads thread
  where thread.goal_id = p_goal_id
    and thread.task_id is not distinct from p_task_id
  order by thread.created_at
  limit 1;
  return result;
end;
$$;

create or replace function public.ensure_workshop_thread(
  p_goal_id uuid,
  p_task_id uuid default null,
  p_created_by uuid default null
)
returns public.workshop_threads
language sql
security invoker
set search_path = ''
as $$
  select private.ensure_workshop_thread_internal(
    p_goal_id,
    p_task_id,
    p_created_by
  );
$$;

revoke execute on function private.ensure_workshop_thread_internal(uuid, uuid, uuid)
  from public, anon;
revoke execute on function public.ensure_workshop_thread(uuid, uuid, uuid)
  from public, anon;
grant execute on function private.ensure_workshop_thread_internal(uuid, uuid, uuid)
  to authenticated, service_role;
grant execute on function public.ensure_workshop_thread(uuid, uuid, uuid)
  to authenticated, service_role;

create or replace function private.set_workshop_goal_archived_internal(
  p_goal_id uuid,
  p_archived boolean default true
)
returns public.workshop_goals
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  current_goal public.workshop_goals%rowtype;
  result public.workshop_goals%rowtype;
begin
  if actor is null then raise exception 'workshop_human_auth_required'; end if;
  select goal.* into current_goal
  from public.workshop_goals goal
  where goal.id = p_goal_id
  for update;
  if not found then raise exception 'workshop_goal_not_found'; end if;
  if not private.workshop_canvas_participant_for_user(
    current_goal.canvas_owner_id,
    current_goal.canvas_id,
    actor
  ) then
    raise exception 'workshop_canvas_access_denied';
  end if;
  if coalesce(p_archived, true) and current_goal.status <> 'done' then
    raise exception 'workshop_goal_not_done';
  end if;
  if not coalesce(p_archived, true) and current_goal.status <> 'archived' then
    raise exception 'workshop_goal_not_archived';
  end if;
  update public.workshop_goals goal
  set status = case when coalesce(p_archived, true) then 'archived' else 'done' end
  where goal.id = p_goal_id
  returning goal.* into result;
  return result;
end;
$$;

create or replace function public.set_workshop_goal_archived(
  p_goal_id uuid,
  p_archived boolean default true
)
returns public.workshop_goals
language sql
security invoker
set search_path = ''
as $$
  select private.set_workshop_goal_archived_internal(p_goal_id, p_archived);
$$;

revoke execute on function private.set_workshop_goal_archived_internal(uuid, boolean)
  from public, anon, service_role;
revoke execute on function public.set_workshop_goal_archived(uuid, boolean)
  from public, anon, service_role;
grant execute on function private.set_workshop_goal_archived_internal(uuid, boolean)
  to authenticated;
grant execute on function public.set_workshop_goal_archived(uuid, boolean)
  to authenticated;

-- Explicit Data API grants. Table grants and RLS are separate controls.
revoke all on table public.workshop_stage_contracts
  from public, anon, authenticated, service_role;
revoke all on table public.workshop_goals
  from public, anon, authenticated, service_role;
revoke all on table public.workshop_tasks
  from public, anon, authenticated, service_role;
revoke all on table public.workshop_threads
  from public, anon, authenticated, service_role;
revoke all on table public.workshop_messages
  from public, anon, authenticated, service_role;
revoke all on table public.workshop_artifacts
  from public, anon, authenticated, service_role;
revoke all on table public.workshop_gate_events
  from public, anon, authenticated, service_role;

grant select on table public.workshop_stage_contracts to authenticated;
grant select, insert on table public.workshop_goals to authenticated;
grant update (title, reason, terminal_stage)
  on table public.workshop_goals to authenticated;
grant select, insert on table public.workshop_tasks to authenticated;
grant update (
  parent_task_id,
  spawned_from_task_id,
  title,
  stage,
  assignee_kind,
  assignee_label,
  status
) on table public.workshop_tasks to authenticated;
grant select, insert on table public.workshop_threads to authenticated;
grant update (title) on table public.workshop_threads to authenticated;
grant select, insert on table public.workshop_messages to authenticated;
grant select, insert on table public.workshop_artifacts to authenticated;
grant select on table public.workshop_gate_events to authenticated;

grant select on table public.workshop_stage_contracts to service_role;
grant select, insert on table
  public.workshop_goals,
  public.workshop_tasks,
  public.workshop_threads,
  public.workshop_messages,
  public.workshop_artifacts
to service_role;
grant select on table public.workshop_gate_events to service_role;

-- Realtime Postgres Changes applies each table's RLS policy to subscribers.
-- FULL identity preserves enough old-row information for DELETE refreshes.
alter table public.workshop_goals replica identity full;
alter table public.workshop_tasks replica identity full;
alter table public.workshop_threads replica identity full;
alter table public.workshop_messages replica identity full;
alter table public.workshop_artifacts replica identity full;
alter table public.workshop_gate_events replica identity full;

do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'workshop_goals'
    ) then execute 'alter publication supabase_realtime add table public.workshop_goals'; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'workshop_tasks'
    ) then execute 'alter publication supabase_realtime add table public.workshop_tasks'; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'workshop_threads'
    ) then execute 'alter publication supabase_realtime add table public.workshop_threads'; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'workshop_messages'
    ) then execute 'alter publication supabase_realtime add table public.workshop_messages'; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'workshop_artifacts'
    ) then execute 'alter publication supabase_realtime add table public.workshop_artifacts'; end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'workshop_gate_events'
    ) then execute 'alter publication supabase_realtime add table public.workshop_gate_events'; end if;
  end if;
end $$;

notify pgrst, 'reload schema';
