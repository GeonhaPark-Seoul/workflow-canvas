import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8')
const [shares, profiles, profilePrivacy, images, tokens, notes, relationGuard, runtimeRead] = await Promise.all([
  read('supabase-shares.sql'),
  read('supabase-profiles.sql'),
  read('supabase-profile-privacy.sql'),
  read('supabase-canvas-images.sql'),
  read('supabase-mcp-schema.sql'),
  read('supabase-canvas-notes.sql'),
  read('supabase-relation-metadata-guard.sql'),
  read('supabase-runtime-read.sql'),
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
  assert.match(sql, /revoke execute on function can_view_profile\(uuid, uuid\) from PUBLIC, anon;/i)
  assert.match(sql, /viewer_member\.user_id\s*=\s*p_viewer/i, 'profile access must recognize accepted viewer membership')
  assert.match(sql, /target_member\.user_id\s*=\s*p_target/i, 'profile access must recognize accepted teammate membership')
}

assert.match(images, /values\s*\(\s*'canvas-images'[\s\S]*?false,/i, 'canvas image bucket must stay private')
assert.match(images, /revoke execute on function can_access_canvas_image\(text, boolean\) from PUBLIC, anon;/i)
assert.match(images, /coalesce\(m\.restrict_view_override,\s*s\.restrict_view\)/i, 'image reads must honor per-member view restriction overrides')
assert.match(shares, /share_members add column if not exists restrict_view_override boolean/i)
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
assert.match(runtimeRead, /create or replace function public\.get_workflow_system_operational_snapshot\(\)/i)
assert.match(runtimeRead, /stable\s+security invoker/i, 'runtime operations function must remain read-only and use caller permissions')
assert.doesNotMatch(runtimeRead, /auth\.uid\(\)/i, 'application aggregate must not pretend the operator account represents the product')
assert.match(runtimeRead, /count\(distinct c\.user_id\).*?account_count/is)
assert.match(runtimeRead, /filter \(where c\.updated_at >= now\(\) - interval '24 hours'\)/i)
assert.match(runtimeRead, /filter \(where c\.updated_at >= now\(\) - interval '7 days'\)/i)
assert.match(runtimeRead, /jsonb_array_length\(c\.nodes\).*?node_count/is)
assert.match(runtimeRead, /jsonb_array_length\(c\.edges\).*?edge_count/is)
assert.match(runtimeRead, /jsonb_array_length\(c\.notes\).*?note_count/is)
assert.match(
  runtimeRead,
  /revoke execute on function public\.get_workflow_system_operational_snapshot\(\) from PUBLIC, anon, authenticated;/i,
)
assert.match(
  runtimeRead,
  /grant execute on function public\.get_workflow_system_operational_snapshot\(\) to service_role;/i,
)
assert.match(runtimeRead, /notify pgrst, 'reload schema';/i, 'runtime RPC must refresh the PostgREST schema cache')

console.log('SQL security checks passed')
