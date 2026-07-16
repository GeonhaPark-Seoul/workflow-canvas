import { supabase } from './supabase'
import { getProfiles } from './profiles'

// Client API for sharing/invitations. Mirrors cloudStorage.js's
// error-log-then-throw style and requires supabase-shares.sql.

async function currentUserId() {
  const { data, error } = await supabase.auth.getUser()
  if (error) { console.error('[shares] getUser:', error.message); throw new Error('getUser: ' + error.message) }
  return data.user?.id
}

async function loadOwnedShareRows(ownerId, canvasId, columns, { activeOnly = false } = {}) {
  const rows = []
  const pageSize = 200
  for (let from = 0; ; from += pageSize) {
    let query = supabase.from('canvas_shares')
      .select(columns)
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (canvasId) query = query.eq('canvas_id', canvasId)
    if (activeOnly) query = query.eq('invitation_active', true)
    const { data, error } = await query
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
  }
  return rows
}

export async function listOwnedSharedCanvasIds() {
  const ownerId = await currentUserId()
  let shares
  try {
    shares = await loadOwnedShareRows(
      ownerId,
      null,
      'id, canvas_id, invitation_active, link_token, invitee_email, created_at',
    )
  } catch (error) {
    console.error('[shares] listOwnedSharedCanvasIds:', error.message)
    throw new Error('listOwnedSharedCanvasIds: ' + error.message)
  }

  const shareIds = shares.map((share) => share.id)
  let members = []
  if (shareIds.length) {
    try { members = await loadMemberRows(shareIds, 'share_id') } catch (error) {
      console.error('[shares] listOwnedSharedCanvasIds (members):', error.message)
      throw new Error('listOwnedSharedCanvasIds: ' + error.message)
    }
  }
  const membered = new Set(members.map((member) => member.share_id))
  return new Set(shares
    .filter((share) => (
      membered.has(share.id)
      || (share.invitation_active && (share.link_token || share.invitee_email))
    ))
    .map((share) => share.canvas_id))
}

async function loadMemberRows(shareIds, columns) {
  const rows = []
  for (let offset = 0; offset < shareIds.length; offset += 150) {
    for (let from = 0; ; from += 500) {
      const { data, error } = await supabase.from('share_members')
        .select(columns)
        .in('share_id', shareIds.slice(offset, offset + 150))
        .order('share_id', { ascending: true })
        .order('user_id', { ascending: true })
        .range(from, from + 499)
      if (error) throw error
      rows.push(...(data ?? []))
      if ((data?.length ?? 0) < 500) break
    }
  }
  return rows
}

export async function listShares(canvasId) {
  const ownerId = await currentUserId()
  let shares
  try {
    shares = await loadOwnedShareRows(
      ownerId,
      canvasId,
      'id, owner_id, canvas_id, scope, target_id, invitee_email, link_token, invitation_active, restrict_view, created_at',
      { activeOnly: true },
    )
  } catch (error) {
    console.error('[shares] listShares:', error.message)
    throw new Error('listShares: ' + error.message)
  }

  const shareIds = (shares ?? []).map((s) => s.id)
  let members = []
  if (shareIds.length) {
    try { members = await loadMemberRows(shareIds, 'share_id, user_id') } catch (error) {
      console.error('[shares] listShares (members):', error.message)
      throw new Error('listShares: ' + error.message)
    }
  }

  const membersByShare = new Map()
  for (const member of members) {
    const ids = membersByShare.get(member.share_id) ?? []
    ids.push(member.user_id)
    membersByShare.set(member.share_id, ids)
  }
  return (shares ?? []).map((share) => ({
    ...share,
    memberUserIds: membersByShare.get(share.id) ?? [],
  }))
}

// Members (claimed users) across all of my shares for a canvas, resolved to
// their profiles. Used by InvitePopover to show avatars inline on each
// invite row.
export async function listShareMembers(canvasId) {
  const ownerId = await currentUserId()
  let shares
  try {
    shares = await loadOwnedShareRows(ownerId, canvasId, 'id, scope, target_id, invitation_active, created_at')
  } catch (error) {
    console.error('[shares] listShareMembers:', error.message)
    throw new Error('listShareMembers: ' + error.message)
  }

  const shareIds = (shares ?? []).map((s) => s.id)
  if (!shareIds.length) return []

  let memberRows
  try { memberRows = await loadMemberRows(shareIds, 'share_id, user_id, can_edit') } catch (error) {
    console.error('[shares] listShareMembers (members):', error.message)
    throw new Error('listShareMembers: ' + error.message)
  }

  const profiles = await getProfiles((memberRows ?? []).map((m) => m.user_id))
  const shareById = new Map((shares ?? []).map((share) => [share.id, share]))

  return (memberRows ?? []).map((m) => ({
    shareId: m.share_id,
    userId: m.user_id,
    canEdit: m.can_edit,
    profile: profiles.get(m.user_id) ?? null,
    scope: shareById.get(m.share_id)?.scope ?? 'canvas',
    targetId: shareById.get(m.share_id)?.target_id ?? null,
  }))
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
