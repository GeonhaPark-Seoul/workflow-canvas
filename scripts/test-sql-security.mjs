import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8')
const [shares, profiles, profilePrivacy, images, tokens, notes, relationGuard, runtimeRead, runtimeObservations, dataAccessAudit, sourceTwinHistory, localConnectors, canvasSummaries, securityHardening, workshop] = await Promise.all([
  read('supabase-shares.sql'),
  read('supabase-profiles.sql'),
  read('supabase-profile-privacy.sql'),
  read('supabase-canvas-images.sql'),
  read('supabase-mcp-schema.sql'),
  read('supabase-canvas-notes.sql'),
  read('supabase-relation-metadata-guard.sql'),
  read('supabase-runtime-read.sql'),
  read('supabase-runtime-observations.sql'),
  read('supabase-data-access-audit.sql'),
  read('supabase-source-twin-history.sql'),
  read('supabase-local-connectors.sql'),
  read('supabase-canvas-summaries.sql'),
  read('supabase-security-hardening.sql'),
  read('supabase-workshop.sql'),
])

const restrictedFunctions = [
  'claim_share(text)',
  'claim_email_invites()',
  'list_pending_email_invites()',
  'claim_email_invite(uuid)',
  'disable_share_invitation(uuid)',
  'revoke_canvas_member(text, uuid)',
  'leave_shared_canvas(uuid, text)',
  'revoke_share_member(uuid, uuid)',
  'is_share_member(uuid, uuid)',
  'owns_share(uuid, uuid)',
  'list_my_friendships()',
  'send_friend_request(text)',
  'respond_friend_request(uuid, boolean)',
  'remove_friendship(uuid)',
]

for (const signature of restrictedFunctions) {
  assert.match(
    shares,
    new RegExp(`revoke execute on function ${signature.replace(/[()]/g, '\\$&')} from PUBLIC, anon;`, 'i'),
    `${signature} must revoke PUBLIC and anon execution`,
  )
}

for (const signature of ['share_link_is_active(text)', 'share_link_preview(text)']) {
  assert.match(shares, new RegExp(`revoke execute on function ${signature.replace(/[()]/g, '\\$&')} from PUBLIC;`, 'i'))
  assert.match(shares, new RegExp(`grant execute on function ${signature.replace(/[()]/g, '\\$&')} to anon, authenticated;`, 'i'))
}

for (const sql of [profiles, profilePrivacy]) {
  assert.match(sql, /drop function if exists can_view_profile\(uuid, uuid\);/i)
  assert.match(sql, /revoke execute on function can_view_profile\(uuid\) from PUBLIC, anon;/i)
  assert.match(sql, /viewer_member\.user_id\s*=\s*auth\.uid\(\)/i, 'profile access must bind the viewer to the current caller')
  assert.match(sql, /target_member\.user_id\s*=\s*p_target/i, 'profile access must recognize accepted teammate membership')
  assert.doesNotMatch(sql, /can_view_profile\(auth\.uid\(\),/i, 'callers must not supply a forged viewer id')
}
assert.match(profiles, /create or replace function upsert_my_profile\(p_nickname text, p_glyph text, p_color text\)/i)
assert.match(profiles, /select email into trusted_email from auth\.users where id = auth\.uid\(\)/i)
assert.match(profiles, /create or replace function touch_my_profile\(\)/i)
assert.match(profiles, /revoke insert, update on profiles from authenticated;/i)
assert.match(securityHardening, /with check \(auth\.uid\(\) = user_id\)/i, 'owner RLS must constrain inserted and updated ownership')
assert.match(securityHardening, /constraint canvases_payload_item_limits/i)

assert.match(images, /values\s*\(\s*'canvas-images'[\s\S]*?false,/i, 'canvas image bucket must stay private')
assert.match(images, /revoke execute on function can_access_canvas_image\(text, boolean\) from PUBLIC, anon;/i)
assert.match(images, /coalesce\(m\.restrict_view_override,\s*s\.restrict_view\)/i, 'image reads must honor per-member view restriction overrides')
assert.match(shares, /share_members add column if not exists restrict_view_override boolean/i)
assert.match(shares, /share_members add column if not exists can_invite boolean not null default false/i)
assert.match(shares, /canvas_shares add column if not exists default_can_edit boolean not null default true/i)
assert.match(shares, /canvas_shares add column if not exists invited_by_user_id uuid references auth\.users\(id\) on delete set null/i)
assert.match(shares, /canvas_shares_inviter_created_idx/i)
assert.match(shares, /canvas_shares_invitee_active_idx[\s\S]*?lower\(invitee_email\)[\s\S]*?where invitation_active/i)
assert.match(shares, /insert into share_members \(share_id, user_id, can_edit\)[\s\S]*?found_share\.default_can_edit/i, 'accepted link members must inherit bounded edit permission')
assert.match(shares, /create unique index if not exists friendships_pair_unique_idx/i)
assert.match(shares, /friendships_requester_status_idx/i)
assert.match(shares, /alter table friendships enable row level security/i)
assert.match(shares, /revoke all on friendships from PUBLIC, anon, authenticated/i)
assert.match(shares, /create policy "friends select own relationships"[\s\S]*?requester_id = auth\.uid\(\) or addressee_id = auth\.uid\(\)/i)
assert.match(
  shares,
  /create or replace function send_friend_request\(p_email text\)[\s\S]*?from canvases c[\s\S]*?mine_member\.user_id = auth\.uid\(\)[\s\S]*?target_member\.user_id = target_user/i,
  'friend requests must be limited to users who already share an accepted canvas',
)
assert.match(shares, /select u\.id into target_user[\s\S]*?from auth\.users u[\s\S]*?lower\(u\.email\)/i, 'friend lookup must trust auth email, not editable profile data')

assert.match(canvasSummaries, /jsonb_array_length\(c\.nodes\)/i)
assert.match(canvasSummaries, /jsonb_array_length\(c\.edges\)/i)
assert.match(canvasSummaries, /revoke execute on function public\.get_canvas_summaries\(uuid, text\[\]\) from PUBLIC, anon, authenticated;/i)
assert.match(canvasSummaries, /grant execute on function public\.get_canvas_summaries\(uuid, text\[\]\) to service_role;/i)
assert.match(tokens, /token\s*=\s*encode\(digest\(token, 'sha256'\), 'hex'\)/i, 'legacy MCP tokens must be hashed in place')
assert.doesNotMatch(tokens, /select token from mcp_tokens/i, 'raw MCP secrets must not be documented as recoverable')
assert.match(notes, /add column if not exists notes jsonb not null default '\[\]'::jsonb/i, 'canvas notes migration must be idempotent')

assert.match(relationGuard, /create or replace function public\.prevent_canvas_relation_metadata_loss\(\)/i)
assert.match(relationGuard, /before update of edges on public\.canvases/i)
assert.match(relationGuard, /drop trigger if exists protect_canvas_relation_metadata on public\.canvases/i, 'guard migration must be idempotent')
assert.match(
  relationGuard,
  /join jsonb_array_elements\(new\.edges\)[\s\S]*?new_item\.edge ->> 'id'\s*=\s*old_item\.edge ->> 'id'/i,
  'guard must compare the same surviving edge id so intentional edge deletion remains allowed',
)
assert.match(relationGuard, /old_item\.edge -> 'data'\) \?\| relation_keys/i, 'guard must require old relation metadata')
assert.match(relationGuard, /not \(\(new_item\.edge -> 'data'\) \?\| relation_keys\)/i, 'guard must detect complete metadata-envelope loss')
assert.match(relationGuard, /workflow_canvas_relation_metadata_guard/i, 'guard error must have a stable client marker')
assert.match(relationGuard, /create or replace function public\.canvas_relation_metadata_guard_ready\(\)/i)
assert.match(relationGuard, /trigger_row\.tgenabled <> 'D'/i, 'repair readiness must require an enabled trigger')
assert.match(
  relationGuard,
  /revoke execute on function public\.canvas_relation_metadata_guard_ready\(\) from PUBLIC, anon, authenticated;/i,
)
assert.match(relationGuard, /grant execute on function public\.canvas_relation_metadata_guard_ready\(\) to service_role;/i)
for (const key of ['relationType', 'relationEvidence', 'relationEvidenceRef', 'relationRuntime']) {
  assert.ok(relationGuard.includes(`'${key}'`), `relation guard key missing: ${key}`)
}

assert.match(runtimeRead, /drop function if exists public\.get_own_canvas_summaries\(integer\)/i, 'retired account summary RPC must be removed')
assert.match(runtimeRead, /drop function if exists public\.get_workflow_system_operational_snapshot\(\)/i)
assert.match(runtimeRead, /create or replace function public\.get_workflow_system_operational_snapshot\(\)/i)
assert.match(runtimeRead, /stable\s+security invoker/i, 'runtime operations function must remain read-only and use caller permissions')
assert.doesNotMatch(runtimeRead, /auth\.uid\(\)/i, 'application aggregate must not pretend the operator account represents the product')
assert.match(runtimeRead, /count\(distinct c\.user_id\).*?account_count/is)
assert.match(runtimeRead, /filter \(where c\.updated_at >= now\(\) - interval '24 hours'\)/i)
assert.match(runtimeRead, /filter \(where c\.updated_at >= now\(\) - interval '7 days'\)/i)
assert.match(runtimeRead, /jsonb_array_length\(c\.nodes\).*?node_count/is)
assert.match(runtimeRead, /jsonb_array_length\(c\.edges\).*?edge_count/is)
assert.match(runtimeRead, /jsonb_array_length\(c\.notes\).*?note_count/is)
assert.match(runtimeRead, /count\(\*\) filter \(where s\.invitation_active\).*?active_invitation_count/is)
assert.match(runtimeRead, /count\(\*\).*?active_membership_count from public\.share_members/is)
assert.match(runtimeRead, /count\(\*\).*?revoked_membership_count from public\.share_revocations/is)
for (const scope of ['canvas', 'group', 'node']) {
  assert.match(runtimeRead, new RegExp(`s\\.scope = '${scope}'`, 'i'), `missing ${scope} share aggregate`)
}
assert.match(
  runtimeRead,
  /revoke execute on function public\.get_workflow_system_operational_snapshot\(\) from PUBLIC, anon, authenticated;/i,
)
assert.match(
  runtimeRead,
  /grant execute on function public\.get_workflow_system_operational_snapshot\(\) to service_role;/i,
)
assert.match(runtimeRead, /notify pgrst, 'reload schema';/i, 'runtime RPC must refresh the PostgREST schema cache')

assert.match(runtimeObservations, /create table if not exists public\.system_runtime_observations/i)
assert.match(runtimeObservations, /alter table public\.system_runtime_observations enable row level security;/i)
assert.match(runtimeObservations, /revoke all on table public\.system_runtime_observations from PUBLIC, anon, authenticated;/i)
assert.match(runtimeObservations, /grant select, insert, delete on table public\.system_runtime_observations to service_role;/i)
assert.doesNotMatch(runtimeObservations, /grant [^;]*update[^;]*system_runtime_observations/i, 'runtime evidence must stay append-only')
assert.doesNotMatch(runtimeObservations, /grant [^;]*system_runtime_observations to (?:anon|authenticated)/i)
assert.match(runtimeObservations, /octet_length\(result::text\) <= 100000/i, 'runtime evidence payloads must remain bounded')

assert.match(dataAccessAudit, /create table if not exists public\.server_data_access_audit/i)
assert.match(dataAccessAudit, /alter table public\.server_data_access_audit enable row level security;/i)
assert.match(dataAccessAudit, /revoke all on table public\.server_data_access_audit from public, anon, authenticated;/i)
assert.match(dataAccessAudit, /grant select, insert on table public\.server_data_access_audit to service_role;/i)
assert.doesNotMatch(dataAccessAudit, /grant [^;]*(?:update|delete)[^;]*server_data_access_audit/i)
assert.match(dataAccessAudit, /before update or delete on public\.server_data_access_audit/i)
assert.match(dataAccessAudit, /raise exception 'server_data_access_audit is append-only'/i)
assert.match(dataAccessAudit, /security definer stable set search_path = public/i)
assert.match(dataAccessAudit, /where audit\.owner_user_id = auth\.uid\(\)/i)
assert.match(dataAccessAudit, /revoke execute on function public\.get_my_canvas_data_access_audit\(text, integer\) from public, anon;/i)
assert.match(dataAccessAudit, /grant execute on function public\.get_my_canvas_data_access_audit\(text, integer\) to authenticated;/i)

for (const table of ['source_twin_snapshots', 'source_twin_events', 'system_operation_audit']) {
  assert.match(sourceTwinHistory, new RegExp(`create table if not exists public\\.${table}`, 'i'))
  assert.match(sourceTwinHistory, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
}
assert.match(sourceTwinHistory, /revoke all on table public\.source_twin_snapshots, public\.source_twin_events from public, anon, authenticated;/i)
assert.match(sourceTwinHistory, /grant select, insert on table public\.source_twin_snapshots, public\.source_twin_events to service_role;/i)
assert.doesNotMatch(sourceTwinHistory, /grant [^;]*(?:update|delete)[^;]*source_twin_(?:snapshots|events)/i)
assert.match(sourceTwinHistory, /before update or delete on public\.source_twin_snapshots/i)
assert.match(sourceTwinHistory, /before update or delete on public\.source_twin_events/i)
assert.match(sourceTwinHistory, /raise exception 'source twin history is append-only'/i)
assert.match(sourceTwinHistory, /revoke execute on function public\.reject_source_twin_history_mutation\(\) from public, anon, authenticated;/i)
assert.match(sourceTwinHistory, /revoke all on table public\.system_operation_audit from public, anon, authenticated;/i)
assert.match(sourceTwinHistory, /grant select, insert on table public\.system_operation_audit to service_role;/i)
assert.doesNotMatch(sourceTwinHistory, /grant [^;]*(?:update|delete)[^;]*system_operation_audit/i)
assert.match(sourceTwinHistory, /before update or delete on public\.system_operation_audit/i)
assert.match(sourceTwinHistory, /raise exception 'system operation audit is append-only'/i)
assert.match(sourceTwinHistory, /octet_length\(result::text\) <= 50000/i)
assert.match(sourceTwinHistory, /create or replace function public\.apply_source_twin_snapshot_operation\(/i)
assert.match(sourceTwinHistory, /language plpgsql\s+security invoker/i)
assert.match(sourceTwinHistory, /p_operation_type <> 'source-twin\.snapshot\.create'/i)
assert.match(sourceTwinHistory, /p_snapshot ->> 'operationId' is distinct from p_operation_id/i)
assert.match(sourceTwinHistory, /p_snapshot ->> 'snapshotKey' is distinct from p_snapshot_key/i)
assert.match(sourceTwinHistory, /p_audit_result ->> 'snapshotId' is distinct from p_snapshot_id/i)
assert.match(sourceTwinHistory, /insert into public\.system_operation_audit[\s\S]*insert into public\.source_twin_snapshots/i)
assert.match(sourceTwinHistory, /revoke execute on function public\.apply_source_twin_snapshot_operation\([\s\S]*\) from public, anon, authenticated;/i)
assert.match(sourceTwinHistory, /grant execute on function public\.apply_source_twin_snapshot_operation\([\s\S]*\) to service_role;/i)

for (const table of ['local_connectors', 'local_connector_operations', 'local_connector_operation_events']) {
  assert.match(localConnectors, new RegExp(`create table if not exists public\\.${table}`, 'i'))
  assert.match(localConnectors, new RegExp(`alter table public\\.${table} enable row level security`, 'i'))
  assert.match(localConnectors, new RegExp(`revoke all on table public\\.${table} from public, anon, authenticated`, 'i'))
  assert.match(localConnectors, new RegExp(`grant all on table public\\.${table} to service_role`, 'i'))
}
assert.match(localConnectors, /token_hash text not null unique check \(token_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/i)
assert.match(localConnectors, /octet_length\(manifest::text\) <= 2500000/i)
assert.match(localConnectors, /action in \('push', 'pull_ff_only', 'source_edit', 'source_edit_rollback'\)/i)
assert.match(localConnectors, /create unique index if not exists local_connector_one_active_operation_idx[\s\S]*where status in \('queued', 'running'\)/i)
assert.doesNotMatch(localConnectors, /force.push|reset --hard|automatic.commit/i)
assert.match(localConnectors, /before update or delete on public\.local_connector_operation_events/i)
assert.match(localConnectors, /raise exception 'local connector operation events are append-only'/i)

const workshopTables = [
  'workshop_stage_contracts',
  'workshop_goals',
  'workshop_tasks',
  'workshop_threads',
  'workshop_messages',
  'workshop_artifacts',
  'workshop_gate_events',
]
for (const table of workshopTables) {
  assert.match(workshop, new RegExp(`create table if not exists public\\.${table}`, 'i'), `${table} table is required`)
  assert.match(workshop, new RegExp(`alter table public\\.${table} enable row level security`, 'i'), `${table} must enable RLS`)
  assert.match(workshop, new RegExp(`revoke all on table public\\.${table}[\\s\\S]*?from public, anon, authenticated, service_role`, 'i'), `${table} must start from explicit least privilege`)
}

assert.match(
  workshop,
  /create or replace function private\.workshop_canvas_participant_for_user\([\s\S]*?join public\.share_members member on member\.share_id = share\.id[\s\S]*?member\.user_id = p_user/i,
  'Workshop access must require an accepted share_members row',
)
assert.doesNotMatch(
  workshop.match(/create or replace function private\.workshop_canvas_participant_for_user\([\s\S]*?\$\$;/i)?.[0] ?? '',
  /invitee_email|auth\.email/i,
  'pending email invitations must never authorize Workshop access',
)
assert.match(
  workshop,
  /create or replace function private\.workshop_canvas_participant\([\s\S]*?\(select auth\.uid\(\)\)/i,
  'the RLS helper must bind the caller instead of accepting a forgeable user id',
)
for (const signature of [
  'private.workshop_canvas_participant_for_user\\(uuid, text, uuid\\)',
  'private.workshop_canvas_participant\\(uuid, text\\)',
]) {
  assert.match(workshop, new RegExp(`revoke execute on function ${signature}[\\s\\S]*?from public, anon`, 'i'))
}
assert.match(workshop, /security definer[\s\S]*?set search_path = ''/i, 'privileged Workshop helpers need a fixed empty search_path')

assert.match(
  workshop,
  /create policy "workshop participants insert goals"[\s\S]*?with check \([\s\S]*?created_by = \(select auth\.uid\(\)\)[\s\S]*?stage = 'backlog'[\s\S]*?status = 'active'/i,
  'browser goal inserts must be caller-bound and pinned to backlog/active',
)
assert.match(workshop, /create or replace function public\.pin_workshop_goal_initial_state\(\)[\s\S]*?new\.stage := 'backlog'[\s\S]*?new\.status := 'active'/i)
assert.match(workshop, /create trigger workshop_goals_pin_initial_state[\s\S]*?before insert on public\.workshop_goals/i)
assert.match(
  workshop,
  /grant update \(title, reason, terminal_stage\)[\s\S]*?on table public\.workshop_goals to authenticated/i,
  'authenticated callers must not update goal stage/status directly',
)
const goalUpdateGrant = workshop.match(
  /grant update \(([^)]*)\)[\s\S]*?on table public\.workshop_goals to authenticated/i,
)
assert.ok(goalUpdateGrant, 'goal column-level UPDATE grant is required')
const goalUpdateColumns = goalUpdateGrant[1].split(',').map((value) => value.trim())
for (const forbidden of ['stage', 'status', 'created_by', 'canvas_owner_id', 'canvas_id']) {
  assert.equal(goalUpdateColumns.includes(forbidden), false, `goal ${forbidden} must stay RPC-only`)
}
assert.doesNotMatch(
  workshop,
  /grant [^;]*insert[^;]*workshop_gate_events[^;]*to authenticated/i,
  'gate history inserts must stay behind the atomic human RPC',
)
assert.match(workshop, /grant select on table public\.workshop_gate_events to authenticated/i)

for (const table of ['goals', 'tasks', 'threads']) {
  assert.match(
    workshop,
    new RegExp(`create policy "workshop participants update ${table}"[\\s\\S]*?using \\([\\s\\S]*?\\)[\\s\\S]*?with check \\(`, 'i'),
    `${table} UPDATE policy requires USING and WITH CHECK`,
  )
}
for (const table of ['goals', 'tasks', 'threads', 'messages', 'artifacts', 'gate events']) {
  assert.match(
    workshop,
    new RegExp(`create policy "workshop participants insert ${table}"[\\s\\S]*?with check \\(`, 'i'),
    `${table} INSERT policy requires WITH CHECK`,
  )
}

assert.match(workshop, /create or replace function public\.validate_workshop_task_links\(\)/i)
assert.match(workshop, /referenced_goal <> new\.goal_id/i, 'task parent/spawn links must remain inside one goal')
assert.match(workshop, /raise exception 'workshop_task_parent_cycle'/i)
assert.match(workshop, /raise exception 'workshop_task_spawn_cycle'/i)
assert.match(
  workshop,
  /create or replace function public\.validate_workshop_task_links\(\)[\s\S]*?from public\.workshop_goals goal[\s\S]*?where goal\.id = new\.goal_id[\s\S]*?for update;/i,
  'task link validation must serialize concurrent mutations on the goal row',
)
assert.match(workshop, /create trigger workshop_threads_validate_task_goal/i)
assert.match(workshop, /create trigger workshop_artifacts_validate_task_goal/i)
assert.match(workshop, /create trigger workshop_gate_events_validate_task_goal/i)
assert.match(
  workshop,
  /create table if not exists public\.workshop_threads[\s\S]*?task_id uuid references public\.workshop_tasks\(id\) on delete cascade/i,
  'task-scoped threads must cascade rather than collide with the unique goal thread',
)
assert.match(
  workshop,
  /create or replace function public\.validate_workshop_message_author\(\)[\s\S]*?parent\.thread_id = new\.thread_id/i,
  'message parent must belong to the same thread',
)
assert.match(workshop, /create trigger workshop_messages_append_only[\s\S]*?before update or delete/i)
assert.match(workshop, /create trigger workshop_gate_events_append_only[\s\S]*?before update or delete/i)
assert.match(workshop, /create trigger workshop_artifacts_append_only[\s\S]*?before update or delete/i)
assert.match(workshop, /raise exception '% is append-only', tg_table_name/i)
assert.match(
  workshop,
  /create or replace function public\.reject_workshop_append_only_mutation\(\)[\s\S]*?if pg_trigger_depth\(\) > 1 then[\s\S]*?if tg_op = 'DELETE' then return old;/i,
  'append-only records must still permit FK cascades initiated by a parent mutation',
)
for (const table of ['goals', 'tasks', 'threads', 'artifacts']) {
  assert.match(workshop, new RegExp(`create trigger workshop_${table}_protect_identity`, 'i'), `${table} identity must be immutable`)
}

assert.match(workshop, /constraint workshop_artifacts_secret_boundary/i)
assert.match(workshop, /create or replace function public\.workshop_external_ref_is_safe\(value text\)/i)
assert.match(
  workshop,
  /create or replace function public\.workshop_decode_ascii_percent\(value text\)[\s\S]*?regexp_match\(decoded, '%\(\[0-7\]\[0-9A-Fa-f\]\)'[\s\S]*?overlay\(decoded placing chr\(byte_value\)/i,
  'SQL must recursively reveal percent-encoded ASCII without rejecting benign encoded URLs',
)
assert.match(workshop, /\^\(javascript\|data\|vbscript\)/i)
assert.ok(workshop.includes('x-(amz|goog)-'), 'signed cloud query keys must be blocked')
assert.match(
  workshop,
  /candidate\.decoded !~\* '\^\[a-z\]\[a-z0-9\+\.\-\]\*:'[\s\S]*?candidate\.decoded ~\* '\^https\?:\/\//i,
  'decoded secret paths and non-http URL schemes must be rejected at the SQL boundary',
)
assert.match(workshop, /select public\.workshop_decode_ascii_percent\(value\) as decoded/i)
assert.doesNotMatch(workshop, /candidate\.decoded !~\* '%\[0-9a-f\]\{2\}'/i)
assert.ok(
  workshop.includes('^https?://hooks\\.slack\\.com/services/[^/?#]+'),
  'Slack webhook secret prefixes must be blocked without assuming three path segments',
)
assert.ok(workshop.includes('discord(app)?'), 'Discord webhook paths must be blocked')
assert.ok(workshop.includes('api\\.telegram\\.org/bot'), 'Telegram bot-token paths must be blocked')
assert.match(
  workshop,
  /\/\(webhooks\?\|hooks\?\|tokens\?\|secrets\?\|credentials\?\|authorization\)\(\/\|=\)\[\^\/\?#\[:space:\]\]\{12,\}/i,
  'generic secret-bearing webhook/hook/token/secret/credential/authorization paths must be blocked',
)

for (const table of ['goals', 'tasks', 'threads', 'artifacts']) {
  assert.doesNotMatch(
    workshop,
    new RegExp(`grant[^;]*delete[^;]*on table public\\.workshop_${table} to authenticated`, 'i'),
    `authenticated callers must not receive direct DELETE on workshop_${table}`,
  )
  assert.doesNotMatch(
    workshop,
    new RegExp(`create policy "workshop participants delete ${table}"`, 'i'),
    `workshop_${table} must not retain a direct DELETE policy`,
  )
}
assert.doesNotMatch(
  workshop,
  /grant[^;]*update[^;]*on table public\.workshop_artifacts to authenticated/i,
  'authenticated callers must not receive direct artifact UPDATE',
)
assert.doesNotMatch(
  workshop,
  /create policy "workshop participants update artifacts"/i,
  'artifacts must not retain a direct UPDATE policy',
)
assert.doesNotMatch(workshop, /grant all on table[\s\S]*?to service_role/i)
assert.doesNotMatch(workshop, /grant[^;]*(truncate|delete|update)[^;]*to service_role/i)
assert.match(workshop, /grant select on table public\.workshop_stage_contracts to service_role/i)
assert.match(
  workshop,
  /grant select, insert on table[\s\S]*?public\.workshop_goals,[\s\S]*?public\.workshop_tasks,[\s\S]*?public\.workshop_threads,[\s\S]*?public\.workshop_messages,[\s\S]*?public\.workshop_artifacts[\s\S]*?to service_role/i,
)
assert.match(workshop, /grant select on table public\.workshop_gate_events to service_role/i)

for (const index of [
  ['workshop_tasks_created_by_idx', 'workshop_tasks', 'created_by'],
  ['workshop_threads_task_idx', 'workshop_threads', 'task_id'],
  ['workshop_threads_created_by_idx', 'workshop_threads', 'created_by'],
  ['workshop_messages_author_user_idx', 'workshop_messages', 'author_user_id'],
  ['workshop_messages_created_by_idx', 'workshop_messages', 'created_by'],
  ['workshop_artifacts_created_by_idx', 'workshop_artifacts', 'created_by'],
  ['workshop_gate_events_approved_by_idx', 'workshop_gate_events', 'approved_by'],
]) {
  const [name, table, column] = index
  assert.match(
    workshop,
    new RegExp(`create index if not exists ${name}[\\s\\S]*?on public\\.${table} \\(${column}\\)`, 'i'),
    `${table}.${column} needs a leading foreign-key index`,
  )
}

assert.match(
  workshop,
  /create or replace function private\.advance_workshop_goal_internal\([\s\S]*?for update;/i,
  'gate approval must lock the goal row',
)
assert.match(workshop, /from unnest\(contract\.recommended_artifact_kinds\) required_kind/i)
assert.match(workshop, /computed_forced := cardinality\(missing\) > 0/i)
assert.match(workshop, /if computed_forced and not coalesce\(p_forced, false\)/i)
assert.match(
  workshop,
  /values \([\s\S]*?current_goal\.id,[\s\S]*?current_goal\.stage,[\s\S]*?destination,[\s\S]*?actor,[\s\S]*?computed_forced,[\s\S]*?missing[\s\S]*?\)/i,
  'gate audit forced value must come from server-side evidence',
)
assert.match(workshop, /when destination = 'done' then 'done'/i)
assert.match(workshop, /revoke execute on function public\.advance_workshop_goal\(uuid, boolean\)[\s\S]*?from public, anon, service_role/i)
assert.match(workshop, /grant execute on function public\.advance_workshop_goal\(uuid, boolean\)[\s\S]*?to authenticated/i)

assert.match(workshop, /create unique index if not exists workshop_threads_goal_default_unique_idx[\s\S]*?where task_id is null/i)
assert.match(workshop, /create unique index if not exists workshop_threads_goal_task_unique_idx[\s\S]*?where task_id is not null/i)
assert.match(
  workshop,
  /create or replace function public\.ensure_workshop_thread\([\s\S]*?p_created_by uuid default null[\s\S]*?returns public\.workshop_threads/i,
)
assert.match(workshop, /caller <> p_created_by[\s\S]*?raise exception 'workshop_actor_mismatch'/i)
assert.match(workshop, /insert into public\.workshop_threads[\s\S]*?on conflict do nothing/i)
assert.match(workshop, /grant execute on function public\.ensure_workshop_thread\(uuid, uuid, uuid\)[\s\S]*?to authenticated, service_role/i)

for (const table of ['workshop_goals', 'workshop_tasks', 'workshop_threads', 'workshop_messages', 'workshop_artifacts', 'workshop_gate_events']) {
  assert.match(workshop, new RegExp(`alter table public\\.${table} replica identity full`, 'i'))
  assert.match(
    workshop,
    new RegExp(`alter publication supabase_realtime add table public\\.${table}`, 'i'),
    `${table} must be published to Realtime`,
  )
}
assert.match(workshop, /pg_publication_tables/i, 'Realtime publication changes must be idempotent')
assert.match(workshop, /notify pgrst, 'reload schema';/i)

console.log('SQL security checks passed')
