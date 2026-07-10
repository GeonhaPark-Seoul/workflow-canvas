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
    .select('token, label, created_at')
    .order('created_at', { ascending: false })
  if (error) { console.error('[mcpTokens] listMyTokens:', error.message); throw new Error('listMyTokens: ' + error.message) }
  return data ?? []
}

export async function createToken(label) {
  const userId = await currentUserId()
  const token = Array.from(crypto.getRandomValues(new Uint8Array(24))).map((b) => b.toString(16).padStart(2, '0')).join('')
  const { data, error } = await supabase
    .from('mcp_tokens')
    .insert({ token, user_id: userId, label })
    .select()
    .single()
  if (error) { console.error('[mcpTokens] createToken:', error.message); throw new Error('createToken: ' + error.message) }
  return data
}

export async function deleteToken(token) {
  const { error } = await supabase.from('mcp_tokens').delete().eq('token', token)
  if (error) { console.error('[mcpTokens] deleteToken:', error.message); throw new Error('deleteToken: ' + error.message) }
}
