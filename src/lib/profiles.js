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
    .select('user_id, nickname, glyph, color, email, last_seen_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) { console.error('[profiles] getMyProfile:', error.message); throw new Error('getMyProfile: ' + error.message) }
  return data
}

export async function upsertMyProfile({ nickname, glyph, color }) {
  const { data, error } = await supabase.rpc('upsert_my_profile', {
    p_nickname: nickname ?? null,
    p_glyph: sanitizeGlyph(glyph),
    p_color: color ?? null,
  })
  if (error) { console.error('[profiles] upsertMyProfile:', error.message); throw new Error('upsertMyProfile: ' + error.message) }
  return Array.isArray(data) ? data[0] ?? null : data
}

// Login-time: record my email + last_seen_at only — NOT via upsertMyProfile,
// which would null out nickname/glyph/color when they're omitted. Tries
// UPDATE first (the common case, profile row already exists); falls back to
// upsert (INSERT) only for a brand-new user with no profile row yet.
export async function upsertMyEmail(email) {
  if (!email) return
  const { error } = await supabase.rpc('touch_my_profile')
  if (error) { console.error('[profiles] upsertMyEmail:', error.message); throw new Error('upsertMyEmail: ' + error.message) }
}

// Returns profiles only when RLS confirms the caller shares a canvas with them.
export async function getProfiles(userIds) {
  const ids = Array.from(new Set(userIds ?? [])).filter(Boolean)
  const map = new Map()
  if (!ids.length) return map
  for (let offset = 0; offset < ids.length; offset += 200) {
    const { data, error } = await supabase
      .from('profiles')
      .select('user_id, nickname, glyph, color, email, last_seen_at')
      .in('user_id', ids.slice(offset, offset + 200))
    if (error) { console.error('[profiles] getProfiles:', error.message); throw new Error('getProfiles: ' + error.message) }
    ;(data ?? []).forEach((p) => map.set(p.user_id, { nickname: p.nickname, glyph: p.glyph, color: p.color, email: p.email, lastSeenAt: p.last_seen_at }))
  }
  return map
}

// Persist private UI settings to user_prefs, never the share-visible profile row.
export async function saveMySettings(settings) {
  const userId = await currentUserId()
  if (!userId) return
  const { error } = await supabase.from('user_prefs').upsert(
    { user_id: userId, settings }, { onConflict: 'user_id' },
  )
  if (error) { console.error('[profiles] saveMySettings:', error.message); throw new Error('saveMySettings: ' + error.message) }
}

export async function loadMySettings() {
  const userId = await currentUserId()
  if (!userId) return null
  const { data, error } = await supabase.from('user_prefs').select('settings').eq('user_id', userId).maybeSingle()
  if (error) { console.error('[profiles] loadMySettings:', error.message); throw new Error('loadMySettings: ' + error.message) }
  return data?.settings ?? null
}

// Heartbeat: bump my own last_seen_at so other participants' mini profile
// cards can show "방금 전 / N분 전 / ..." when I'm not currently online via
// presence. Called on canvas open + every 60s (see App.jsx).
export async function touchLastSeen() {
  const { error } = await supabase.rpc('touch_my_profile')
  if (error) { console.error('[profiles] touchLastSeen:', error.message); throw new Error('touchLastSeen: ' + error.message) }
}
