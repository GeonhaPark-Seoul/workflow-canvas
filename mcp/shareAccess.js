// Shared-canvas authorization for server-only callers (MCP and browser API).
import { createClient } from '@supabase/supabase-js'
import { sanitizeHtml, sanitizeTextFields } from './sanitize.js'
import { normalizeEdgeRelationData } from '../shared/relationOntology.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tuaifwiigkacrflbhjmu.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SCOPE_RANK = { canvas: 0, group: 1, node: 2 }

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

export async function mySharesFor(userId, canvasId = null) {
  const db = admin()
  let query = db.from('canvas_shares').select('id, owner_id, canvas_id, scope, target_id, invitee_email, restrict_view')
  if (canvasId) query = query.eq('canvas_id', canvasId)
  const { data: shares, error } = await query
  if (error) throw new Error(error.message)
  if (!shares?.length) return []

  const { data: members, error: membersError } = await db
    .from('share_members').select('*').eq('user_id', userId)
  if (membersError) throw new Error(membersError.message)
  const memberByShare = new Map((members ?? []).map((member) => [member.share_id, member]))
  return shares
    .filter((share) => share.owner_id !== userId && memberByShare.has(share.id))
    .map((share) => effectiveShareGrant(share, memberByShare.get(share.id)))
}

export function effectiveShareGrant(share, member = {}) {
  return {
    ...share,
    can_edit: member.can_edit !== false,
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

export async function resolveSharedCanvasAccess(userId, ownerId, canvasId) {
  const shares = (await mySharesFor(userId, canvasId)).filter((share) => share.owner_id === ownerId)
  if (!shares.length) throw new Error('이 공유 캔버스에 접근할 권한이 없습니다.')
  const share = pickBestShareAccess(shares)
  const { data: row, error } = await admin().from('canvases').select('*')
    .eq('user_id', ownerId).eq('canvas_id', canvasId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('공유 캔버스를 찾을 수 없습니다.')
  return { row, ownerId, scope: share.scope, targetId: share.target_id, canEdit: share.can_edit !== false, restrictView: !!share.restrict_view }
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
  if (viewerId !== ownerId) await resolveSharedCanvasAccess(viewerId, ownerId, canvasId)

  const db = admin()
  const { data: canvas, error: canvasError } = await db.from('canvases').select('canvas_id')
    .eq('user_id', ownerId).eq('canvas_id', canvasId).maybeSingle()
  if (canvasError) throw new Error(canvasError.message)
  if (!canvas) throw new Error('공유 캔버스를 찾을 수 없습니다.')

  const { data: shares, error: sharesError } = await db.from('canvas_shares')
    .select('id, scope, target_id, restrict_view, created_at')
    .eq('owner_id', ownerId).eq('canvas_id', canvasId)
  if (sharesError) throw new Error(sharesError.message)

  const shareIds = (shares ?? []).map((share) => share.id)
  let members = []
  if (shareIds.length) {
    const { data, error } = await db.from('share_members').select('*').in('share_id', shareIds)
    if (error) throw new Error(error.message)
    members = data ?? []
  }

  const userIds = [...new Set([ownerId, ...members.map((member) => member.user_id)])]
  const { data: profiles, error: profilesError } = await db.from('profiles')
    .select('user_id, nickname, glyph, color, email, last_seen_at').in('user_id', userIds)
  if (profilesError) throw new Error(profilesError.message)
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
    restrictView: false,
    grants: [],
  }]

  const memberParticipants = [...grantsByUser.entries()].map(([userId, grants]) => {
    const best = pickBestShareAccess(grants)
    const profile = publicProfile(profileByUser.get(userId))
    return {
      userId,
      email: profile?.email ?? null,
      profile,
      isOwner: false,
      shareId: best.id,
      scope: best.scope,
      targetId: best.target_id,
      canEdit: best.can_edit !== false,
      restrictView: !!best.restrict_view,
      joinedAt: members.find((member) => member.user_id === userId)?.joined_at ?? null,
      grants: grants.map((grant) => ({
        shareId: grant.id,
        scope: grant.scope,
        targetId: grant.target_id,
        canEdit: grant.can_edit !== false,
        restrictView: !!grant.restrict_view,
      })),
    }
  }).sort((a, b) => String(a.joinedAt ?? '').localeCompare(String(b.joinedAt ?? '')))

  return [...participants, ...memberParticipants]
}

export async function setCanvasMemberViewRestriction(ownerId, canvasId, memberUserId, restricted, viewerId) {
  if (viewerId !== ownerId || memberUserId === ownerId) throw new Error('시야 제한을 변경할 권한이 없습니다.')
  if (typeof restricted !== 'boolean') throw new Error('시야 제한 값이 올바르지 않습니다.')
  const db = admin()
  const { data: shares, error: sharesError } = await db.from('canvas_shares').select('id, scope')
    .eq('owner_id', ownerId).eq('canvas_id', canvasId)
  if (sharesError) throw new Error(sharesError.message)
  const shareIds = (shares ?? []).filter((share) => share.scope !== 'canvas').map((share) => share.id)
  if (!shareIds.length) throw new Error('공유 캔버스를 찾을 수 없습니다.')
  const { data, error } = await db.from('share_members')
    .update({ restrict_view_override: restricted })
    .eq('user_id', memberUserId)
    .in('share_id', shareIds)
    .select('share_id')
  if (error) throw new Error(error.message)
  if (!data?.length) throw new Error('해당 참여자를 찾을 수 없습니다.')
  return data.length
}

export function editableNodeIdSet(access, nodes) {
  if (access.scope === 'canvas') return null
  if (access.scope === 'group') return new Set((nodes ?? []).filter((node) => node.parentId === access.targetId).map((node) => node.id))
  return new Set([access.targetId])
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
  const visibleIds = access.restrictView ? editableNodeIdSet(access, access.row.nodes) : null
  return {
    name: access.row.name,
    revision: access.row.updated_at,
    nodes: (access.row.nodes ?? []).map((node) => redactNode(node, visibleIds)),
    edges: (access.row.edges ?? []).map((edge) => redactEdge(edge, visibleIds)),
    notes: access.restrictView ? [] : (access.row.notes ?? []),
    views: access.row.views ?? [],
    stageTypes: access.row.stage_types ?? [],
    permission: {
      scope: access.scope,
      targetId: access.targetId,
      canEdit: access.canEdit,
      restrictView: access.restrictView,
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
  const data = sanitizeTextFields({ ...storedData })
  if (Array.isArray(data.parts)) {
    data.parts = data.parts.map((part) => ({ ...part, text: typeof part.text === 'string' ? sanitizeHtml(part.text) : part.text }))
  }
  return { ...node, data }
}

function sanitizeEdge(edge) {
  const { data, type, redacted, ...shape } = edge
  const safeData = normalizeEdgeRelationData(data)
  return { ...shape, type: 'stub', ...(Object.keys(safeData).length ? { data: safeData } : {}) }
}

export function applySharedCanvasUpdate(access, submittedNodes, submittedEdges, metadata = {}) {
  if (!access.canEdit) throw new Error('읽기 전용 초대에서는 변경할 수 없습니다.')
  if (!Array.isArray(submittedNodes) || !Array.isArray(submittedEdges)) throw new Error('nodes와 edges는 배열이어야 합니다.')

  const nodeIds = submittedNodes.map((node) => node?.id)
  if (nodeIds.some((id) => typeof id !== 'string' || !id)) throw new Error('모든 노드에는 id가 필요합니다.')
  if (new Set(nodeIds).size !== nodeIds.length) throw new Error('중복된 노드 id는 저장할 수 없습니다.')
  const edgeIds = submittedEdges.map((edge) => edge?.id)
  if (edgeIds.some((id) => typeof id !== 'string' || !id)) throw new Error('모든 연결선에는 id가 필요합니다.')
  if (new Set(edgeIds).size !== edgeIds.length) throw new Error('중복된 연결선 id는 저장할 수 없습니다.')

  const originalNodes = access.row.nodes ?? []
  const originalEdges = access.row.edges ?? []
  const originalById = new Map(originalNodes.map((node) => [node.id, node]))
  const submittedById = new Map(submittedNodes.map((node) => [node?.id, node]))
  const editable = editableNodeIdSet(access, originalNodes)
  const mayEdit = (id) => editable === null || editable.has(id)
  const isEditableNode = (node) => mayEdit(node.id) || (access.scope === 'group' && node.parentId === access.targetId)
  const visibleIds = access.restrictView ? editable : null
  const mergedNodes = []

  for (const original of originalNodes) {
    const submitted = submittedById.get(original.id)
    if (!submitted) {
      if (access.scope === 'node') throw new Error('노드 초대에서는 대상 노드를 삭제할 수 없습니다.')
      if (!mayEdit(original.id)) throw new Error('초대 범위 밖 노드는 삭제할 수 없습니다.')
      continue
    }
    if (!mayEdit(original.id)) {
      if (!same(redactNode(original, visibleIds), submitted)) throw new Error('초대 범위 밖 노드는 변경할 수 없습니다.')
      mergedNodes.push(original)
      continue
    }
    if (access.scope === 'node' && (
      submitted.type !== original.type || submitted.parentId !== original.parentId ||
      !same(submitted.position, original.position)
    )) throw new Error('노드 초대에서는 대상 노드의 내용과 크기만 수정할 수 있습니다.')
    if (access.scope === 'group' && submitted.parentId !== access.targetId) {
      throw new Error('그룹 초대에서는 노드를 초대된 그룹 밖으로 옮길 수 없습니다.')
    }
    mergedNodes.push(submitted)
  }

  for (const submitted of submittedNodes) {
    if (!submitted?.id || originalById.has(submitted.id)) continue
    if (access.scope === 'node') throw new Error('노드 초대에서는 새 노드를 만들 수 없습니다.')
    if (access.scope === 'group' && submitted.parentId !== access.targetId) {
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
    const edgeEditable = mayEdit(edge.source) && mayEdit(edge.target)
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
    if (original && (!mayEdit(original.source) || !mayEdit(original.target))) continue
    const changed = !original || !same(original, edge)
    if (changed && (!isEditableNode(source) || !isEditableNode(target))) {
      throw new Error('연결선의 양 끝은 모두 초대된 편집 범위 안에 있어야 합니다.')
    }
    if (!original) mergedEdges.push(edge)
  }
  const result = { nodes: mergedNodes.map(sanitizeNode), edges: mergedEdges.map(sanitizeEdge) }
  if (access.scope === 'canvas') {
    if (metadata.views !== undefined && !Array.isArray(metadata.views)) {
      throw new Error('views는 배열이어야 합니다.')
    }
    if (metadata.stageTypes !== undefined && !Array.isArray(metadata.stageTypes)) {
      throw new Error('stageTypes는 배열이어야 합니다.')
    }
    if (metadata.notes !== undefined && !Array.isArray(metadata.notes)) {
      throw new Error('notes는 배열이어야 합니다.')
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
