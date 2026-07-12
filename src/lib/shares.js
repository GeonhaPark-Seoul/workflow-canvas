import { supabase } from './supabase'
import { getProfiles } from './profiles'

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

// Members (claimed users) across all of my shares for a canvas, resolved to
// their profiles. Used by InvitePopover to show avatars inline on each
// invite row.
export async function listShareMembers(canvasId) {
  const ownerId = await currentUserId()
  const { data: shares, error } = await supabase
    .from('canvas_shares')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('canvas_id', canvasId)
  if (error) { console.error('[shares] listShareMembers:', error.message); throw new Error('listShareMembers: ' + error.message) }

  const shareIds = (shares ?? []).map((s) => s.id)
  if (!shareIds.length) return []

  const { data: memberRows, error: memberError } = await supabase
    .from('share_members')
    .select('share_id, user_id, can_edit')
    .in('share_id', shareIds)
  if (memberError) { console.error('[shares] listShareMembers (members):', memberError.message); throw new Error('listShareMembers: ' + memberError.message) }

  const profiles = await getProfiles((memberRows ?? []).map((m) => m.user_id))

  return (memberRows ?? []).map((m) => ({
    shareId: m.share_id,
    userId: m.user_id,
    canEdit: m.can_edit,
    profile: profiles.get(m.user_id) ?? null,
  }))
}

export async function setMemberEdit(shareId, userId, canEdit) {
  const { error } = await supabase
    .from('share_members')
    .update({ can_edit: canEdit })
    .eq('share_id', shareId)
    .eq('user_id', userId)
  if (error) { console.error('[shares] setMemberEdit:', error.message); throw new Error('setMemberEdit: ' + error.message) }
}

export async function kickMember(shareId, userId) {
  const { error } = await supabase.rpc('revoke_share_member', { p_share_id: shareId, p_user_id: userId })
  if (error) { console.error('[shares] kickMember:', error.message); throw new Error('kickMember: ' + error.message) }
}

// Delete MY membership rows for every share this owner has on this canvas —
// i.e. leave a canvas that was shared to me.
export async function leaveSharedCanvas(ownerId, canvasId) {
  const userId = await currentUserId()
  const { data: shares, error } = await supabase
    .from('canvas_shares')
    .select('id')
    .eq('owner_id', ownerId)
    .eq('canvas_id', canvasId)
  if (error) { console.error('[shares] leaveSharedCanvas:', error.message); throw new Error('leaveSharedCanvas: ' + error.message) }

  const shareIds = (shares ?? []).map((s) => s.id)
  if (!shareIds.length) return

  await Promise.all(shareIds.map(async (shareId) => {
    const { error: revokeError } = await supabase.rpc('revoke_share_member', { p_share_id: shareId, p_user_id: userId })
    if (revokeError) throw new Error('leaveSharedCanvas: ' + revokeError.message)
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

export async function isShareLinkActive(token) {
  const { data, error } = await supabase.rpc('share_link_is_active', { token })
  if (error) { console.error('[shares] isShareLinkActive:', error.message); throw new Error('isShareLinkActive: ' + error.message) }
  return data === true
}

export async function getShareLinkPreview(token) {
  const { data, error } = await supabase.rpc('share_link_preview', { token })
  if (error) throw new Error('share_link_preview: ' + error.message)
  return Array.isArray(data) ? data[0] ?? null : data
}

export async function listPendingEmailInvites() {
  const { data, error } = await supabase.rpc('list_pending_email_invites')
  if (error) throw new Error('list_pending_email_invites: ' + error.message)
  return data ?? []
}

export async function claimEmailInvite(shareId) {
  const { data, error } = await supabase.rpc('claim_email_invite', { p_share_id: shareId })
  if (error) throw new Error('claim_email_invite: ' + error.message)
  return data
}

export async function revokeShareMember(shareId, userId) {
  const { error } = await supabase.rpc('revoke_share_member', { p_share_id: shareId, p_user_id: userId })
  if (error) throw new Error('revoke_share_member: ' + error.message)
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

  // My own membership rows (if any) for these shares, to read my can_edit
  // flag. A pending (unclaimed) email invite has no membership row yet —
  // defaults to true.
  const shareIds = deduped.map((s) => s.id)
  let myMemberships = []
  if (shareIds.length) {
    const { data: memberRows, error: memberError } = await supabase
      .from('share_members')
      .select('share_id, can_edit')
      .eq('user_id', userId)
      .in('share_id', shareIds)
    if (memberError) { console.error('[shares] listSharedWithMe (members):', memberError.message); throw new Error('listSharedWithMe: ' + memberError.message) }
    myMemberships = memberRows ?? []
  }
  const canEditByShareId = new Map(myMemberships.map((m) => [m.share_id, m.can_edit]))

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
      canEdit: canEditByShareId.has(s.id) ? canEditByShareId.get(s.id) : true,
    })
  }
  return results
}
