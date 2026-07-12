// Shared-canvas authorization for server-only callers (MCP and browser API).
import { createClient } from '@supabase/supabase-js'
import { sanitizeHtml, sanitizeTextFields } from './sanitize.js'

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
    .from('share_members').select('share_id, can_edit').eq('user_id', userId)
  if (membersError) throw new Error(membersError.message)
  const canEditByShare = new Map((members ?? []).map((member) => [member.share_id, member.can_edit]))
  return shares
    .filter((share) => share.owner_id !== userId && canEditByShare.has(share.id))
    .map((share) => ({ ...share, can_edit: canEditByShare.has(share.id) ? canEditByShare.get(share.id) : true }))
}

export async function resolveSharedCanvasAccess(userId, ownerId, canvasId) {
  const shares = (await mySharesFor(userId, canvasId)).filter((share) => share.owner_id === ownerId)
  if (!shares.length) throw new Error('이 공유 캔버스에 접근할 권한이 없습니다.')
  shares.sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope] || Number(b.can_edit) - Number(a.can_edit))
  const share = shares[0]
  const { data: row, error } = await admin().from('canvases').select('*')
    .eq('user_id', ownerId).eq('canvas_id', canvasId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!row) throw new Error('공유 캔버스를 찾을 수 없습니다.')
  return { row, ownerId, scope: share.scope, targetId: share.target_id, canEdit: share.can_edit !== false, restrictView: !!share.restrict_view }
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

export function redactCanvas(access) {
  const visibleIds = access.restrictView ? editableNodeIdSet(access, access.row.nodes) : null
  return {
    name: access.row.name,
    nodes: (access.row.nodes ?? []).map((node) => redactNode(node, visibleIds)),
    edges: access.row.edges ?? [],
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

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

function sanitizeNode(node) {
  const data = sanitizeTextFields({ ...(node.data ?? {}) })
  if (Array.isArray(data.parts)) {
    data.parts = data.parts.map((part) => ({ ...part, text: typeof part.text === 'string' ? sanitizeHtml(part.text) : part.text }))
  }
  return { ...node, data }
}

export function applySharedCanvasUpdate(access, submittedNodes, submittedEdges) {
  if (!access.canEdit) throw new Error('읽기 전용 초대에서는 변경할 수 없습니다.')
  if (!Array.isArray(submittedNodes) || !Array.isArray(submittedEdges)) throw new Error('nodes와 edges는 배열이어야 합니다.')

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

  const originalEdgeById = new Map(originalEdges.map((edge) => [edge.id, edge]))
  const submittedEdgeById = new Map(submittedEdges.map((edge) => [edge?.id, edge]))
  for (const edge of originalEdges) {
    const submitted = submittedEdgeById.get(edge.id)
    const edgeEditable = mayEdit(edge.source) && mayEdit(edge.target)
    if (!submitted && !edgeEditable) throw new Error('초대 범위 밖 연결선은 삭제할 수 없습니다.')
    if (submitted && !edgeEditable && !same(edge, submitted)) throw new Error('초대 범위 밖 연결선은 변경할 수 없습니다.')
  }
  for (const edge of submittedEdges) {
    if (!edge?.id || originalEdgeById.has(edge.id)) continue
    const source = mergedNodes.find((node) => node.id === edge.source)
    const target = mergedNodes.find((node) => node.id === edge.target)
    if (!source || !target || !isEditableNode(source) || !isEditableNode(target)) {
      throw new Error('연결선의 양 끝은 모두 초대된 편집 범위 안에 있어야 합니다.')
    }
  }
  return { nodes: mergedNodes.map(sanitizeNode), edges: submittedEdges }
}
