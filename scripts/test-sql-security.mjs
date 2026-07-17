import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8')
const [shares, profiles, profilePrivacy, images, tokens, notes, relationGuard, runtimeRead, runtimeObservations, dataAccessAudit, sourceTwinHistory, localConnectors, canvasSummaries, securityHardening] = await Promise.all([
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

console.log('SQL security checks passed')
