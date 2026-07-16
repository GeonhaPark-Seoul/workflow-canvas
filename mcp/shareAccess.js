// Shared-canvas authorization for server-only callers (MCP and browser API).
import { createClient } from '@supabase/supabase-js'
import { sanitizeHtml, sanitizeTextFields } from './sanitize.js'
import { normalizeEdgeRelationData } from '../shared/relationOntology.js'
import { normalizeSystemParts } from '../shared/systemPartOntology.js'
import { normalizeIntentNodeData } from '../shared/intentOntology.js'
import {
  composeSharePermission,
  editableNodeIdSetForPermission,
  invitationAuthorizingGrants,
  permissionCanCreateInGroup,
  permissionCanEditEdge,
  permissionCanEditNodeStructure,
  permissionFromAccess,
  visibleNodeIdSetForPermission,
} from '../shared/sharePermissions.js'
import { recordCanvasDataAccess } from './dataAccessAudit.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tuaifwiigkacrflbhjmu.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SCOPE_RANK = { canvas: 0, group: 1, node: 2 }
const MAX_CANVAS_ITEMS = { nodes: 10_000, edges: 20_000, notes: 10_000, views: 1_000, stageTypes: 200 }
const CANVAS_ROW_SELECT = 'user_id, canvas_id, name, nodes, edges, notes, views, stage_types, updated_at'

let client
export function admin() {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.')
  if (!client) client = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  return client
}

export async function resolveBrowserUser(token) {
  if (!token) return null
  const { data } = await admin().auth.getUser(token)
  return data?.user ?? null
}

async function loadCanvasShareRows(db, ownerId, canvasId, columns) {
  const rows = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from('canvas_shares').select(columns)
      .eq('owner_id', ownerId).eq('canvas_id', canvasId)
      .order('created_at', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
  }
  return rows
}

async function loadMembersForShares(db, shareIds, columns) {
  const rows = []
  for (let offset = 0; offset < shareIds.length; offset += 150) {
    for (let from = 0; ; from += 500) {
      const { data, error } = await db.from('share_members').select(columns)
        .in('share_id', shareIds.slice(offset, offset + 150))
        .order('share_id', { ascending: true })
        .order('user_id', { ascending: true })
        .range(from, from + 499)
      if (error) throw new Error(error.message)
      rows.push(...(data ?? []))
      if ((data?.length ?? 0) < 500) break
    }
  }
  return rows
}

export async function mySharesFor(userId, canvasId = null) {
  const db = admin()
  const members = []
  const pageSize = 500
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from('share_members')
      .select('share_id, user_id, can_edit, can_invite, restrict_view_override, joined_at')
      .eq('user_id', userId)
      .order('share_id', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    members.push(...(data ?? []))
    if ((data?.length ?? 0) < pageSize) break
  }
  if (!members.length) return []

  // A service-role query bypasses RLS. Resolve the viewer's membership IDs
  // first so this function never scans or materializes unrelated invitations.
  const shares = []
  const shareIds = members.map((member) => member.share_id)
  for (let offset = 0; offset < shareIds.length; offset += 200) {
    let query = db.from('canvas_shares')
      .select('id, owner_id, canvas_id, scope, target_id, invitee_email, restrict_view')
      .in('id', shareIds.slice(offset, offset + 200))
    if (canvasId) query = query.eq('canvas_id', canvasId)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    shares.push(...(data ?? []))
  }
  const memberByShare = new Map((members ?? []).map((member) => [member.share_id, member]))
  return shares
    .filter((share) => share.owner_id !== userId && memberByShare.has(share.id))
    .map((share) => effectiveShareGrant(share, memberByShare.get(share.id)))
}

export function effectiveShareGrant(share, member = {}) {
  return {
    ...share,
    can_edit: member.can_edit !== false,
    can_invite: member.can_invite === true,
    restrict_view: member.restrict_view_override ?? !!share.restrict_view,
  }
}

export function compareShareAccess(a, b) {
  return SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope]
    || Number(b.can_edit) - Number(a.can_edit)
    || Number(a.restrict_view) - Number(b.restrict_view)
}

export function pickBestShareAccess(grants) {
  return [...(grants ?? [])].sort(compareShareAccess)[0] ?? null
}

export async function resolveSharedCanvasAccess(userId, ownerId, canvasId, { operation = 'read' } = {}) {
  const shares = (await mySharesFor(userId, canvasId)).filter((share) => share.owner_id === ownerId)
  if (!shares.length) throw new Error('이 공유 캔버스에 접근할 권한이 없습니다.')
  const permission = composeSharePermission(shares)
  const { data: row, error } = await admin().from('canvases').select(CANVAS_ROW_SELECT)
    .eq('user_id', ownerId).eq('canvas_id', canvasId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('공유 캔버스를 찾을 수 없습니다.')
  await recordCanvasDataAccess(admin(), {
    actorUserId: userId,
    ownerUserId: ownerId,
    canvasId,
    source: 'shared_canvas_api',
    purpose: operation === 'read' ? 'collaborator_canvas_read' : 'collaborator_canvas_write',
    operation,
  })
  return { row, ownerId, ...permission }
}

function publicProfile(row) {
  if (!row) return null
  return {
    nickname: row.nickname,
    glyph: row.glyph,
    color: row.color,
    email: row.email,
    lastSeenAt: row.last_seen_at,
  }
}

// Returns accepted team members only. Pending email addresses remain visible to
// the owner through the invitation UI and are never exposed to collaborators.
export async function listCanvasParticipants(ownerId, canvasId, viewerId) {
  if (viewerId !== ownerId) {
    const grants = (await mySharesFor(viewerId, canvasId)).filter((share) => share.owner_id === ownerId)
    if (!grants.length) throw new Error('이 공유 캔버스에 접근할 권한이 없습니다.')
  }

  const db = admin()
  const { data: canvas, error: canvasError } = await db.from('canvases').select('canvas_id')
    .eq('user_id', ownerId).eq('canvas_id', canvasId).maybeSingle()
  if (canvasError) throw new Error(canvasError.message)
  if (!canvas) throw new Error('공유 캔버스를 찾을 수 없습니다.')

  const shares = await loadCanvasShareRows(db, ownerId, canvasId, 'id, scope, target_id, restrict_view, created_at')

  const shareIds = (shares ?? []).map((share) => share.id)
  let members = []
  if (shareIds.length) {
    members = await loadMembersForShares(
      db,
      shareIds,
      'share_id, user_id, joined_at, can_edit, can_invite, restrict_view_override',
    )
  }

  const userIds = [...new Set([ownerId, ...members.map((member) => member.user_id)])]
  const profiles = []
  for (let offset = 0; offset < userIds.length; offset += 200) {
    const { data, error } = await db.from('profiles')
      .select('user_id, nickname, glyph, color, email, last_seen_at')
      .in('user_id', userIds.slice(offset, offset + 200))
    if (error) throw new Error(error.message)
    profiles.push(...(data ?? []))
  }
  const profileByUser = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]))
  const shareById = new Map((shares ?? []).map((share) => [share.id, share]))
  const grantsByUser = new Map()

  for (const member of members) {
    const share = shareById.get(member.share_id)
    if (!share) continue
    const grants = grantsByUser.get(member.user_id) ?? []
    grants.push(effectiveShareGrant(share, member))
    grantsByUser.set(member.user_id, grants)
  }

  const ownerProfile = publicProfile(profileByUser.get(ownerId))
  const participants = [{
    userId: ownerId,
    email: ownerProfile?.email ?? null,
    profile: ownerProfile,
    isOwner: true,
    canEdit: true,
    canInvite: true,
    restrictView: false,
    grants: [],
  }]

  const memberParticipants = [...grantsByUser.entries()].map(([userId, grants]) => {
    const best = pickBestShareAccess(grants)
    const permission = composeSharePermission(grants)
    const profile = publicProfile(profileByUser.get(userId))
    return {
      userId,
      email: profile?.email ?? null,
      profile,
      isOwner: false,
      shareId: best.id,
      scope: permission.scope,
      targetId: permission.targetId,
      canEdit: permission.canEdit,
      canEditCanvas: permission.canEditCanvas,
      canInvite: permission.canInvite,
      restrictView: permission.restrictView,
      joinedAt: members.find((member) => member.user_id === userId)?.joined_at ?? null,
      grants: grants.map((grant) => ({
        shareId: grant.id,
        scope: grant.scope,
        targetId: grant.target_id,
        canEdit: grant.can_edit !== false,
        canInvite: grant.can_invite === true,
        restrictView: !!grant.restrict_view,
      })),
    }
  }).sort((a, b) => String(a.joinedAt ?? '').localeCompare(String(b.joinedAt ?? '')))

  return [...participants, ...memberParticipants]
}

function normalizeInvitationTarget(scope, targetId, nodes) {
  if (!['canvas', 'group', 'node'].includes(scope)) throw new Error('초대 범위가 올바르지 않습니다.')
  if (scope === 'canvas') return null
  if (typeof targetId !== 'string' || !targetId) throw new Error('초대 대상이 필요합니다.')
  const target = (nodes ?? []).find((node) => node.id === targetId)
  if (!target) throw new Error('초대 대상을 찾을 수 없습니다.')
  if (scope === 'group' && target.type !== 'group') throw new Error('그룹 초대 대상이 올바르지 않습니다.')
  if (scope === 'node' && target.type === 'group') throw new Error('그룹은 그룹 초대로 공유해야 합니다.')
  return targetId
}

async function enforceInvitationRateLimit(db, inviterId) {
  const now = Date.now()
  const windows = [
    { since: new Date(now - 60_000).toISOString(), maximum: 20 },
    { since: new Date(now - 86_400_000).toISOString(), maximum: 500 },
  ]
  for (const window of windows) {
    const { count, error } = await db.from('canvas_shares')
      .select('id', { count: 'exact', head: true })
      .eq('invited_by_user_id', inviterId)
      .gte('created_at', window.since)
    if (error) throw new Error(error.message)
    if ((count ?? 0) >= window.maximum) {
      throw new Error('초대 요청이 너무 많습니다. 잠시 후 다시 시도하세요.')
    }
  }
}

export async function createCanvasInvitation({
  viewer,
  ownerId,
  canvasId,
  scope,
  targetId,
  email,
  restrictView = false,
  kind = 'email',
}) {
  if (!viewer?.id) throw new Error('로그인이 필요합니다.')
  if (!ownerId || !canvasId) throw new Error('ownerId와 canvasId가 필요합니다.')
  if (!/^[0-9a-f-]{36}$/i.test(ownerId) || String(canvasId).length > 240) throw new Error('초대 대상 식별자가 올바르지 않습니다.')
  if (!['email', 'link'].includes(kind)) throw new Error('초대 방식이 올바르지 않습니다.')
  const normalizedEmail = kind === 'email' ? String(email ?? '').trim().toLowerCase() : ''
  if (kind === 'email' && (normalizedEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail))) {
    throw new Error('올바른 이메일을 입력하세요.')
  }

  const db = admin()
  const { data: canvas, error: canvasError } = await db.from('canvases').select('canvas_id, nodes')
    .eq('user_id', ownerId).eq('canvas_id', canvasId).maybeSingle()
  if (canvasError) throw new Error(canvasError.message)
  if (!canvas) throw new Error('공유 캔버스를 찾을 수 없습니다.')
  const normalizedTargetId = normalizeInvitationTarget(scope, targetId, canvas.nodes)
  if (normalizedTargetId && normalizedTargetId.length > 240) throw new Error('초대 대상 식별자가 올바르지 않습니다.')

  let defaultCanEdit = true
  let effectiveRestrictView = !!restrictView
  if (viewer.id !== ownerId) {
    const grants = (await mySharesFor(viewer.id, canvasId)).filter((grant) => grant.owner_id === ownerId)
    const authorizing = invitationAuthorizingGrants(composeSharePermission(grants), scope, normalizedTargetId, canvas.nodes)
    if (!authorizing.length) throw new Error('이 범위에 다른 참여자를 초대할 권한이 없습니다.')
    defaultCanEdit = authorizing.some((grant) => grant.canEdit)
    if (authorizing.every((grant) => grant.restrictView)) effectiveRestrictView = true
    if (kind === 'link') throw new Error('참여자 초대권한은 이메일 초대에만 사용할 수 있습니다.')
  }

  if (kind === 'email') {
    const { data: targetProfile, error: profileError } = await db.from('profiles').select('user_id')
      .ilike('email', normalizedEmail).maybeSingle()
    if (profileError) throw new Error(profileError.message)
    if (targetProfile?.user_id === ownerId || targetProfile?.user_id === viewer.id) {
      throw new Error('자기 자신이나 캔버스 소유자는 초대할 수 없습니다.')
    }

    let duplicateQuery = db.from('canvas_shares').select('id')
      .eq('owner_id', ownerId).eq('canvas_id', canvasId).eq('scope', scope)
      .eq('invitation_active', true).ilike('invitee_email', normalizedEmail)
    duplicateQuery = normalizedTargetId == null
      ? duplicateQuery.is('target_id', null)
      : duplicateQuery.eq('target_id', normalizedTargetId)
    const { data: duplicate, error: duplicateError } = await duplicateQuery.maybeSingle()
    if (duplicateError) throw new Error(duplicateError.message)
    if (duplicate) throw new Error('같은 대상에 이미 활성화된 초대가 있습니다.')
  }

  await enforceInvitationRateLimit(db, viewer.id)

  const linkToken = kind === 'link' ? crypto.randomUUID() : null
  const { data: share, error } = await db.from('canvas_shares').insert({
    owner_id: ownerId,
    canvas_id: canvasId,
    scope,
    target_id: normalizedTargetId,
    invitee_email: kind === 'email' ? normalizedEmail : null,
    link_token: linkToken,
    restrict_view: effectiveRestrictView,
    default_can_edit: defaultCanEdit,
    invited_by_user_id: viewer.id,
  }).select('id, owner_id, canvas_id, scope, target_id, invitee_email, link_token, restrict_view, invitation_active, created_at').single()
  if (error) throw new Error(error.message)
  return { share, url: linkToken ? `/#share=${linkToken}` : null }
}

export async function setCanvasMemberPermission(ownerId, canvasId, memberUserId, field, enabled, viewerId) {
  if (viewerId !== ownerId || memberUserId === ownerId) throw new Error('참여자 권한을 변경할 권한이 없습니다.')
  if (!['can_edit', 'can_invite'].includes(field) || typeof enabled !== 'boolean') {
    throw new Error('참여자 권한 값이 올바르지 않습니다.')
  }
  const db = admin()
  const shares = await loadCanvasShareRows(db, ownerId, canvasId, 'id, created_at')
  const shareIds = (shares ?? []).map((share) => share.id)
  if (!shareIds.length) throw new Error('공유 캔버스를 찾을 수 없습니다.')
  const updated = []
  for (let offset = 0; offset < shareIds.length; offset += 150) {
    const { data, error } = await db.from('share_members').update({ [field]: enabled })
      .eq('user_id', memberUserId).in('share_id', shareIds.slice(offset, offset + 150)).select('share_id')
    if (error) throw new Error(error.message)
    updated.push(...(data ?? []))
  }
  if (!updated.length) throw new Error('해당 참여자를 찾을 수 없습니다.')

  if (field === 'can_invite' && !enabled) {
    const { error: disableError } = await db.from('canvas_shares').update({
      invitation_active: false,
      invitee_email: null,
      link_token: null,
    }).eq('owner_id', ownerId).eq('canvas_id', canvasId)
      .eq('invited_by_user_id', memberUserId).eq('invitation_active', true)
    if (disableError) throw new Error(disableError.message)
  }
  return updated.length
}

export async function setCanvasMemberViewRestriction(ownerId, canvasId, memberUserId, restricted, viewerId) {
  if (viewerId !== ownerId || memberUserId === ownerId) throw new Error('시야 제한을 변경할 권한이 없습니다.')
  if (typeof restricted !== 'boolean') throw new Error('시야 제한 값이 올바르지 않습니다.')
  const db = admin()
  const shares = await loadCanvasShareRows(db, ownerId, canvasId, 'id, scope, created_at')
  const shareIds = (shares ?? []).filter((share) => share.scope !== 'canvas').map((share) => share.id)
  if (!shareIds.length) throw new Error('공유 캔버스를 찾을 수 없습니다.')
  const updated = []
  for (let offset = 0; offset < shareIds.length; offset += 150) {
    const { data, error } = await db.from('share_members')
      .update({ restrict_view_override: restricted })
      .eq('user_id', memberUserId)
      .in('share_id', shareIds.slice(offset, offset + 150))
      .select('share_id')
    if (error) throw new Error(error.message)
    updated.push(...(data ?? []))
  }
  if (!updated.length) throw new Error('해당 참여자를 찾을 수 없습니다.')
  return updated.length
}

export function editableNodeIdSet(access, nodes) {
  return editableNodeIdSetForPermission(access, nodes)
}

export function redactNode(node, visibleIds) {
  if (visibleIds === null || visibleIds.has(node.id)) return node
  const { data, ...shape } = node
  return { ...shape, data: { redacted: true } }
}

export function redactEdge(edge, visibleIds) {
  const safe = sanitizeEdge(edge)
  if (visibleIds === null || (visibleIds.has(edge.source) && visibleIds.has(edge.target))) return safe
  const { data, ...shape } = safe
  return { ...shape, redacted: true }
}

export function redactCanvas(access) {
  const permission = permissionFromAccess(access)
  const visibleIds = visibleNodeIdSetForPermission(permission, access.row.nodes)
  return {
    name: access.row.name,
    revision: access.row.updated_at,
    nodes: (access.row.nodes ?? []).map((node) => redactNode(node, visibleIds)),
    edges: (access.row.edges ?? []).map((edge) => redactEdge(edge, visibleIds)),
    notes: permission.restrictView ? [] : (access.row.notes ?? []),
    views: access.row.views ?? [],
    stageTypes: access.row.stage_types ?? [],
    permission: {
      scope: permission.scope,
      targetId: permission.targetId,
      canEdit: permission.canEdit,
      canEditCanvas: permission.canEditCanvas,
      canInvite: permission.canInvite,
      restrictView: permission.restrictView,
      grants: permission.grants,
    },
  }
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map((key) => [key, stableValue(value[key])]),
    )
  }
  return value
}

const same = (left, right) => JSON.stringify(stableValue(left)) === JSON.stringify(stableValue(right))

function sanitizeNode(node) {
  const storedData = { ...(node.data ?? {}) }
  delete storedData.twinRuntime
  delete storedData.systemPartRuntime
  delete storedData.canRunSystemChecks
  delete storedData.onCheckSystemPart
  delete storedData.layerPortals
  delete storedData.onOpenLayerPortal
  let data = sanitizeTextFields({ ...storedData })
  if (Array.isArray(data.parts)) {
    data.parts = data.parts.map((part) => ({ ...part, text: typeof part.text === 'string' ? sanitizeHtml(part.text) : part.text }))
  }
  if (Array.isArray(data.systemParts)) data.systemParts = normalizeSystemParts(data.systemParts)
  if (node.type === 'intent' || data.intentSchemaVersion != null || data.intentKind != null || data.statement != null) {
    data = normalizeIntentNodeData(data)
  }
  return { ...node, data }
}

function sanitizeEdge(edge) {
  const { data, type, redacted, ...shape } = edge
  const safeData = normalizeEdgeRelationData(data)
  return { ...shape, type: 'stub', ...(Object.keys(safeData).length ? { data: safeData } : {}) }
}

export function applySharedCanvasUpdate(access, submittedNodes, submittedEdges, metadata = {}) {
  const permission = permissionFromAccess(access)
  if (!permission.canEdit) throw new Error('읽기 전용 초대에서는 변경할 수 없습니다.')
  if (!Array.isArray(submittedNodes) || !Array.isArray(submittedEdges)) throw new Error('nodes와 edges는 배열이어야 합니다.')
  if (submittedNodes.length > MAX_CANVAS_ITEMS.nodes || submittedEdges.length > MAX_CANVAS_ITEMS.edges) {
    throw new Error('캔버스 항목 수가 안전한 저장 한도를 초과했습니다.')
  }

  const nodeIds = submittedNodes.map((node) => node?.id)
  if (nodeIds.some((id) => typeof id !== 'string' || !id || id.length > 240)) throw new Error('모든 노드에는 올바른 id가 필요합니다.')
  if (new Set(nodeIds).size !== nodeIds.length) throw new Error('중복된 노드 id는 저장할 수 없습니다.')
  const edgeIds = submittedEdges.map((edge) => edge?.id)
  if (edgeIds.some((id) => typeof id !== 'string' || !id || id.length > 240)) throw new Error('모든 연결선에는 올바른 id가 필요합니다.')
  if (new Set(edgeIds).size !== edgeIds.length) throw new Error('중복된 연결선 id는 저장할 수 없습니다.')

  const originalNodes = access.row.nodes ?? []
  const originalEdges = access.row.edges ?? []
  const originalById = new Map(originalNodes.map((node) => [node.id, node]))
  const submittedById = new Map(submittedNodes.map((node) => [node?.id, node]))
  const editable = editableNodeIdSet(permission, originalNodes)
  const mayEdit = (id) => editable === null || editable.has(id)
  const mayEditStructure = (node) => permissionCanEditNodeStructure(permission, node)
  const visibleIds = visibleNodeIdSetForPermission(permission, originalNodes)
  const mergedNodes = []

  for (const original of originalNodes) {
    const submitted = submittedById.get(original.id)
    if (!submitted) {
      if (!mayEdit(original.id)) throw new Error('초대 범위 밖 노드는 삭제할 수 없습니다.')
      if (!mayEditStructure(original)) throw new Error('노드 초대에서는 대상 노드를 삭제할 수 없습니다.')
      continue
    }
    if (!mayEdit(original.id)) {
      if (!same(redactNode(original, visibleIds), submitted)) throw new Error('초대 범위 밖 노드는 변경할 수 없습니다.')
      mergedNodes.push(original)
      continue
    }
    if (!mayEditStructure(original) && (
      submitted.type !== original.type || submitted.parentId !== original.parentId ||
      !same(submitted.position, original.position) ||
      !same(submitted.data?.presentation ?? null, original.data?.presentation ?? null)
    )) throw new Error('노드 초대에서는 대상 노드의 내용과 크기만 수정할 수 있으며 위치·그룹·층은 바꿀 수 없습니다.')
    if (!permission.canEditCanvas && mayEditStructure(original) && !permissionCanCreateInGroup(permission, submitted.parentId)) {
      throw new Error('그룹 초대에서는 노드를 초대된 그룹 밖으로 옮길 수 없습니다.')
    }
    mergedNodes.push(submitted)
  }

  for (const submitted of submittedNodes) {
    if (!submitted?.id || originalById.has(submitted.id)) continue
    if (!permission.canEditCanvas && !permissionCanCreateInGroup(permission, submitted.parentId)) {
      throw new Error('새 노드는 초대된 그룹 안에만 만들 수 있습니다.')
    }
    mergedNodes.push(submitted)
  }

  const mergedNodeById = new Map(mergedNodes.map((node) => [node.id, node]))
  const originalEdgeById = new Map(originalEdges.map((edge) => [edge.id, edge]))
  const submittedEdgeById = new Map(submittedEdges.map((edge) => [edge?.id, edge]))
  const mergedEdges = []
  for (const edge of originalEdges) {
    const submitted = submittedEdgeById.get(edge.id)
    const edgeEditable = permissionCanEditEdge(permission, originalById.get(edge.source), originalById.get(edge.target))
    if (!submitted && !edgeEditable) throw new Error('초대 범위 밖 연결선은 삭제할 수 없습니다.')
    if (!submitted) continue
    if (!edgeEditable) {
      if (!same(redactEdge(edge, visibleIds), redactEdge(submitted, visibleIds))) {
        throw new Error('초대 범위 밖 연결선은 변경할 수 없습니다.')
      }
      mergedEdges.push(edge)
    } else {
      mergedEdges.push(submitted)
    }
  }
  for (const edge of submittedEdges) {
    const source = mergedNodeById.get(edge.source)
    const target = mergedNodeById.get(edge.target)
    if (!source || !target) throw new Error('연결선의 양 끝은 존재하는 노드여야 합니다.')

    const original = originalEdgeById.get(edge.id)
    if (original && !permissionCanEditEdge(permission, originalById.get(original.source), originalById.get(original.target))) continue
    const changed = !original || !same(original, edge)
    if (changed && !permissionCanEditEdge(permission, source, target)) {
      throw new Error('연결선의 양 끝은 모두 초대된 편집 범위 안에 있어야 합니다.')
    }
    if (!original) mergedEdges.push(edge)
  }
  const result = { nodes: mergedNodes.map(sanitizeNode), edges: mergedEdges.map(sanitizeEdge) }
  if (permission.canEditCanvas) {
    if (metadata.views !== undefined && !Array.isArray(metadata.views)) {
      throw new Error('views는 배열이어야 합니다.')
    }
    if (metadata.stageTypes !== undefined && !Array.isArray(metadata.stageTypes)) {
      throw new Error('stageTypes는 배열이어야 합니다.')
    }
    if (metadata.notes !== undefined && !Array.isArray(metadata.notes)) {
      throw new Error('notes는 배열이어야 합니다.')
    }
    if ((metadata.notes?.length ?? 0) > MAX_CANVAS_ITEMS.notes
      || (metadata.views?.length ?? 0) > MAX_CANVAS_ITEMS.views
      || (metadata.stageTypes?.length ?? 0) > MAX_CANVAS_ITEMS.stageTypes) {
      throw new Error('캔버스 메타데이터 수가 안전한 저장 한도를 초과했습니다.')
    }
    const notes = metadata.notes ?? access.row.notes ?? []
    const noteIds = notes.map((note) => note?.id)
    if (noteIds.some((id) => typeof id !== 'string' || !id)) throw new Error('모든 노트에는 id가 필요합니다.')
    if (new Set(noteIds).size !== noteIds.length) throw new Error('중복된 노트 id는 저장할 수 없습니다.')
    if (noteIds.some((id) => nodeIds.includes(id))) throw new Error('노트와 노드 id는 중복될 수 없습니다.')
    result.notes = notes.map(sanitizeNode)
    result.views = metadata.views ?? access.row.views ?? []
    result.stageTypes = metadata.stageTypes ?? access.row.stage_types ?? null
  }
  return result
}
