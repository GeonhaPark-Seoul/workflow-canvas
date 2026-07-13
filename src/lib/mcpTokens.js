import { supabase } from './supabase'

// Personal access tokens for the MCP server (Claude etc. reading/editing a
// user's canvas). cloudStorage.js's error-log-then-throw style. Requires
// supabase-mcp-schema.sql's self-service policies to have been run.

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) { console.error('[mcpTokens] getUser:', error.message); throw new Error('getUser: ' + error.message) }
  return data.user?.id
}

export async function listMyTokens() {
  const { data, error } = await supabase
    .from('mcp_tokens')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) { console.error('[mcpTokens] listMyTokens:', error.message); throw new Error('listMyTokens: ' + error.message) }
  return (data ?? []).map((row) => ({
    tokenId: row.token,
    prefix: row.token_prefix ?? row.token.slice(0, 6),
    label: row.label,
    created_at: row.created_at,
  }))
}

async function sha256(value) {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function createToken(label) {
  const userId = await currentUserId()
  const secret = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, '0')).join('')
  const token = await sha256(secret)
  const { data, error } = await supabase
    .from('mcp_tokens')
    .insert({ token, token_prefix: secret.slice(0, 6), token_version: 2, user_id: userId, label })
    .select()
    .single()
  if (error) { console.error('[mcpTokens] createToken:', error.message); throw new Error('createToken: ' + error.message) }
  return {
    tokenId: data.token,
    prefix: data.token_prefix,
    label: data.label,
    created_at: data.created_at,
    secret,
  }
}

export async function deleteToken(tokenId) {
  const { error } = await supabase.from('mcp_tokens').delete().eq('token', tokenId)
  if (error) { console.error('[mcpTokens] deleteToken:', error.message); throw new Error('deleteToken: ' + error.message) }
}
