import { supabase } from './supabase'
import { getProfiles } from './profiles'

// Client API for sharing/invitations. Mirrors cloudStorage.js's
// error-log-then-throw style and requires supabase-shares.sql.

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
    .eq('invitation_active', true)
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
    .select('id, scope, target_id, invitation_active')
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
    scope: shares.find((s) => s.id === m.share_id)?.scope ?? 'canvas',
    targetId: shares.find((s) => s.id === m.share_id)?.target_id ?? null,
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

export async function kickMember(canvasId, userId) {
  const { error } = await supabase.rpc('revoke_canvas_member', { p_canvas_id: canvasId, p_user_id: userId })
  if (error) { console.error('[shares] kickMember:', error.message); throw new Error('kickMember: ' + error.message) }
}

// Leave the whole shared canvas, including overlapping scope/link paths.
export async function leaveSharedCanvas(ownerId, canvasId) {
  const { error } = await supabase.rpc('leave_shared_canvas', { p_owner_id: ownerId, p_canvas_id: canvasId })
  if (error) { console.error('[shares] leaveSharedCanvas:', error.message); throw new Error('leaveSharedCanvas: ' + error.message) }
}

export async function deleteShare(id) {
  const { error } = await supabase.rpc('disable_share_invitation', { p_share_id: id })
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
