import { supabase } from './supabase'

// Phase 1: client API for the sharing/invite feature. Mirrors cloudStorage.js's
// error-log-then-throw style. Nothing in the app calls this yet (phase 2 wires
// it up); requires supabase-shares.sql to have been run.

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) { console.error('[shares] getUser:', error.message); throw new Error('getUser: ' + error.message) }
  return data.user?.id
}

export async function createShare({ canvasId, scope, targetId, email, restrictView }) {
  const ownerId = await currentUserId()
  const { data, error } = await supabase.from('canvas_shares').insert({
    owner_id: ownerId,
    canvas_id: canvasId,
    scope,
    target_id: targetId ?? null,
    invitee_email: email.trim().toLowerCase(),
    restrict_view: !!restrictView,
  }).select().single()
  if (error) { console.error('[shares] createShare:', error.message); throw new Error('createShare: ' + error.message) }
  return data
}

export async function createLinkShare({ canvasId, scope, targetId, restrictView }) {
  const ownerId = await currentUserId()
  const token = crypto.randomUUID()
  const { data, error } = await supabase.from('canvas_shares').insert({
    owner_id: ownerId,
    canvas_id: canvasId,
    scope,
    target_id: targetId ?? null,
    link_token: token,
    restrict_view: !!restrictView,
  }).select().single()
  if (error) { console.error('[shares] createLinkShare:', error.message); throw new Error('createLinkShare: ' + error.message) }
  return { share: data, url: `${location.origin}/#share=${token}` }
}

export async function listShares(canvasId) {
  const ownerId = await currentUserId()
  const { data: shares, error } = await supabase
    .from('canvas_shares')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('canvas_id', canvasId)
    .order('created_at', { ascending: true })
  if (error) { console.error('[shares] listShares:', error.message); throw new Error('listShares: ' + error.message) }

  const shareIds = (shares ?? []).map((s) => s.id)
  let members = []
  if (shareIds.length) {
    const { data: memberRows, error: memberError } = await supabase
      .from('share_members')
      .select('share_id, user_id')
      .in('share_id', shareIds)
    if (memberError) { console.error('[shares] listShares (members):', memberError.message); throw new Error('listShares: ' + memberError.message) }
    members = memberRows ?? []
  }

  return (shares ?? []).map((s) => ({
    ...s,
    memberUserIds: members.filter((m) => m.share_id === s.id).map((m) => m.user_id),
  }))
}

export async function deleteShare(id) {
  const { error } = await supabase.from('canvas_shares').delete().eq('id', id)
  if (error) { console.error('[shares] deleteShare:', error.message); throw new Error('deleteShare: ' + error.message) }
}

export async function claimShareToken(token) {
  const { data, error } = await supabase.rpc('claim_share', { token })
  if (error) { console.error('[shares] claimShareToken:', error.message); throw new Error('claimShareToken: ' + error.message) }
  return Array.isArray(data) ? data[0] : data
}

export async function claimEmailInvites() {
  const { data, error } = await supabase.rpc('claim_email_invites')
  if (error) { console.error('[shares] claimEmailInvites:', error.message); throw new Error('claimEmailInvites: ' + error.message) }
  return data ?? []
}

// Shares where the current user is the invitee (not the owner), deduped by
// (owner, canvas, scope, target), resolved to the canvases they point at.
export async function listSharedWithMe() {
  const userId = await currentUserId()
  const { data: shares, error } = await supabase
    .from('canvas_shares')
    .select('*')
    .neq('owner_id', userId)
  if (error) { console.error('[shares] listSharedWithMe:', error.message); throw new Error('listSharedWithMe: ' + error.message) }

  const seen = new Set()
  const deduped = []
  for (const s of shares ?? []) {
    const key = `${s.owner_id}:${s.canvas_id}:${s.scope}:${s.target_id ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(s)
  }

  const results = []
  for (const s of deduped) {
    const { data: canvas, error: canvasError } = await supabase
      .from('canvases')
      .select('name')
      .eq('user_id', s.owner_id)
      .eq('canvas_id', s.canvas_id)
      .maybeSingle()
    if (canvasError) { console.error('[shares] listSharedWithMe (canvas):', canvasError.message); throw new Error('listSharedWithMe: ' + canvasError.message) }
    if (!canvas) continue
    results.push({
      ownerId: s.owner_id,
      canvasId: s.canvas_id,
      name: canvas.name,
      scope: s.scope,
      targetId: s.target_id,
      restrictView: s.restrict_view,
    })
  }
  return results
}
