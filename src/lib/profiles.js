import { supabase } from './supabase'

// Profile system: nickname + avatar glyph/color, used by the shared-user
// avatar row and the login button. cloudStorage.js's error-log-then-throw
// style. Requires supabase-profiles.sql to have been run.

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) { console.error('[profiles] getUser:', error.message); throw new Error('getUser: ' + error.message) }
  return data.user?.id
}

// Single uppercase A-Z/0-9 char, or null (renders the default bust icon).
function sanitizeGlyph(glyph) {
  if (!glyph) return null
  const c = String(glyph).trim().slice(0, 1).toUpperCase()
  return /^[A-Z0-9]$/.test(c) ? c : null
}

export async function getMyProfile() {
  const userId = await currentUserId()
  if (!userId) return null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) { console.error('[profiles] getMyProfile:', error.message); throw new Error('getMyProfile: ' + error.message) }
  return data
}

export async function upsertMyProfile({ nickname, glyph, color }) {
  const userId = await currentUserId()
  const { data, error } = await supabase.from('profiles').upsert(
    { user_id: userId, nickname: nickname ?? null, glyph: sanitizeGlyph(glyph), color: color ?? null, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  ).select().single()
  if (error) { console.error('[profiles] upsertMyProfile:', error.message); throw new Error('upsertMyProfile: ' + error.message) }
  return data
}

// Returns Map(userId → { nickname, glyph, color }) for the given user ids.
export async function getProfiles(userIds) {
  const ids = Array.from(new Set(userIds ?? [])).filter(Boolean)
  const map = new Map()
  if (!ids.length) return map
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, nickname, glyph, color')
    .in('user_id', ids)
  if (error) { console.error('[profiles] getProfiles:', error.message); throw new Error('getProfiles: ' + error.message) }
  ;(data ?? []).forEach((p) => map.set(p.user_id, { nickname: p.nickname, glyph: p.glyph, color: p.color }))
  return map
}
