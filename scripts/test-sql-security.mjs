import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const read = (name) => readFile(new URL(`../${name}`, import.meta.url), 'utf8')
const [shares, profiles, profilePrivacy, images, tokens, notes] = await Promise.all([
  read('supabase-shares.sql'),
  read('supabase-profiles.sql'),
  read('supabase-profile-privacy.sql'),
  read('supabase-canvas-images.sql'),
  read('supabase-mcp-schema.sql'),
  read('supabase-canvas-notes.sql'),
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

console.log('SQL security checks passed')
