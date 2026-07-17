// Supabase access layer for the MCP server.
//
// Runs server-side only (Vercel function). Uses the service-role key, so RLS is
// bypassed — every query is therefore scoped manually by the authenticated
// user id. A request is authenticated by a personal access token (Bearer) that
// maps to a user id via the `mcp_tokens` table; a raw Supabase access token
// (JWT) is also accepted as a fallback.
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'node:crypto'
import { sanitizeTextFields } from './sanitize.js'
import {
  SIZE, nodeW, nodeH, nodeRect, overlaps, findNonOverlapping,
  isStructuralNode, layoutGraph, validateGraphInput, radialLevels,
} from './layout.js'
import { createSystemNodeData, normalizeSystemNodeData } from '../shared/systemOntology.js'
import { intentVersionState, normalizeIntentNodeData } from '../shared/intentOntology.js'
import {
  createEdgeRelationData,
  edgeRelationInfo,
  normalizeEdgeRelationData,
  relationDefinition,
} from '../shared/relationOntology.js'
import { createWorkflowCanvasSystemMap } from '../shared/workflowCanvasSystemMap.js'
import { WORKFLOW_SYSTEM_DISCOVERY } from '../shared/workflowSystemDiscoveryManifest.js'
import { inspectWorkflowSystemMap as buildWorkflowSystemMapInspection } from '../shared/workflowSystemDiscovery.js'
import {
  planWorkflowSystemMapRelationRepair,
  restoreMissingWorkflowSystemMapRelations,
  WORKFLOW_RELATION_REPAIR_CONFIRMATION,
} from '../shared/workflowSystemMapRepair.js'
import {
  composeSharePermission,
  editableGroupIdSet,
  editableNodeIdSetForPermission,
  permissionCanEditEdge,
  permissionCanEditNodeStructure,
  permissionFromAccess,
  visibleNodeIdSetForPermission,
} from '../shared/sharePermissions.js'
import { recordCanvasDataAccess } from './dataAccessAudit.js'
import { loadCanvasSummaries } from './canvasSummaries.js'
import { mySharesFor as listAcceptedShares } from './shareAccess.js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tuaifwiigkacrflbhjmu.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const CANVAS_ROW_SELECT = 'user_id, canvas_id, name, nodes, edges, notes, views, stage_types, updated_at'

let _admin
function admin() {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.')
  if (!_admin) _admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  return _admin
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const newNodeId = () => `n-${uid()}`
const newEdgeId = () => `e-${uid()}`

function writeConflict() {
  return new Error(
    '캔버스가 다른 브라우저나 AI에 의해 먼저 변경되었습니다. ' +
    'get_canvas로 최신 상태를 다시 읽고 작업을 재시도하세요.')
}

function nextRevision(previousRevision) {
  const previous = Date.parse(previousRevision ?? '')
  return new Date(Math.max(Date.now(), Number.isFinite(previous) ? previous + 1 : 0)).toISOString()
}

// Teaching validation: reject out-of-range indexes with the fix spelled out,
// instead of silently clamping (a silent clamp hides the AI's mistake).
function assertStageTypeIdx(types, idx) {
  if (idx == null) return 0
  if (!Number.isInteger(idx) || idx < 0 || idx >= types.length) {
    throw new Error(
      `stageTypeIdx ${idx}는 유효 범위를 벗어났습니다. 이 캔버스의 유효 범위: 0..${types.length - 1}. ` +
      'get_stage_types로 현재 종류 목록을 확인한 뒤 다시 시도하세요.')
  }
  return idx
}

const edgeRelationIdentity = (data, fallbackType = 'flows_to') => {
  const relation = edgeRelationInfo(data, fallbackType)
  return relation.id === 'custom'
    ? `${relation.id}:${relation.label.toLocaleLowerCase()}`
    : relation.id
}

const storedEdgeRelationIdentity = (edge) => edgeRelationIdentity(
  edge?.data,
  edge?.style?.strokeDasharray ? 'references' : 'flows_to',
)

const findDuplicateEdge = (edges, source, target, relationIdentity) =>
  (edges ?? []).find((edge) => (
    edge.source === source
    && edge.target === target
    && storedEdgeRelationIdentity(edge) === relationIdentity
  ))

// Teaching warning: for a radial graph, check whether same-depth stage nodes
// share a single stageTypeIdx. Returns a warning string if mixing is detected,
// or null when all levels are uniform. Pure function — no side effects.
export function checkRadialLevelMixing(nodeInputs, edgeInputs) {
  const level = radialLevels(nodeInputs, edgeInputs)
  // Map level -> Set of stageTypeIdx values used at that level
  const levelTypes = new Map()
  for (const n of nodeInputs) {
    if (n.type !== 'stage') continue
    const lv = level.get(n.tmp_id)
    if (lv == null || lv < 0) continue
    if (!levelTypes.has(lv)) levelTypes.set(lv, new Set())
    const idx = n.stageTypeIdx ?? n.colorIdx ?? 0
    levelTypes.get(lv).add(idx)
  }
  const mixed = []
  for (const [lv, types] of levelTypes) {
    if (types.size >= 2) mixed.push({ lv, types: [...types].sort((a, b) => a - b) })
  }
  if (!mixed.length) return null
  const detail = mixed.map(({ lv, types }) => `레벨 ${lv}: 종류 ${types.join(',')}`).join('; ')
  return (
    `⚠️ 같은 계층에 서로 다른 단계 종류가 섞여 있습니다 (${detail}). ` +
    '계층 구조에서는 깊이별로 같은 종류를 공유해야 합니다 — ' +
    'update_nodes로 stageTypeIdx를 레벨별로 통일하고, ' +
    "rename_stage_type으로 이름을 '핵심 주제/추진 방안/세부 과제'처럼 바꾸는 것을 권장합니다."
  )
}

// 단계 종류(stage type) 기본값/팔레트 — src/App.jsx의 DEFAULT_STAGE_TYPES/TYPE_PALETTE와 동일
const DEFAULT_STAGE_TYPES = [
  { id: 'plan',   bg: '#1e3a5f', border: '#3b82f6', label: '기획' },
  { id: 'dev',    bg: '#1a3a2a', border: '#22c55e', label: '개발' },
  { id: 'review', bg: '#3a1a1a', border: '#ef4444', label: '검토' },
  { id: 'deploy', bg: '#1a2a3a', border: '#06b6d4', label: '배포' },
  { id: 'done',   bg: '#2a1a3a', border: '#a855f7', label: '완료' },
]
const TYPE_PALETTE = [
  { bg: '#1e3a5f', border: '#3b82f6' }, { bg: '#1a3a2a', border: '#22c55e' },
  { bg: '#3a1a1a', border: '#ef4444' }, { bg: '#1a2a3a', border: '#06b6d4' },
  { bg: '#2a1a3a', border: '#a855f7' }, { bg: '#20204a', border: '#6366f1' },
  { bg: '#2a1a2a', border: '#ec4899' }, { bg: '#2a2a1a', border: '#84cc16' },
]

const FLOW_STYLE = { stroke: '#4a4a5a', strokeWidth: 2 }
const NOTE_STYLE = { stroke: '#f59e0b88', strokeWidth: 1.5, strokeDasharray: '5,4' }

// SIZE/nodeW/nodeH live in layout.js (shared with auto-layout); clampSize
// enforces the frontend NodeResizer minimums on MCP-supplied dimensions.
const clampSize = (type, w, h) => {
  const s = SIZE[type] ?? SIZE.stage
  return {
    width:  Number.isFinite(w) ? Math.max(w, s.minW) : undefined,
    height: Number.isFinite(h) ? Math.max(h, s.minH) : undefined,
  }
}

// Pick the handle pair (side of each node) that best matches the direction
// between the two node centers — used as the default when the caller doesn't
// pin an explicit sourceHandle/targetHandle, so the AI doesn't have to guess.
function closestHandles(source, target) {
  const sx = source.position.x + nodeW(source) / 2
  const sy = source.position.y + nodeH(source) / 2
  const tx = target.position.x + nodeW(target) / 2
  const ty = target.position.y + nodeH(target) / 2
  const dx = tx - sx, dy = ty - sy
  return Math.abs(dx) >= Math.abs(dy)
    ? { sourceHandle: dx > 0 ? 'right' : 'left', targetHandle: dx > 0 ? 'left' : 'right' }
    : { sourceHandle: dy > 0 ? 'bottom' : 'top', targetHandle: dy > 0 ? 'top' : 'bottom' }
}

// Map a Bearer token to a user id. Returns null when unauthenticated.
export async function resolveUser(token) {
  if (!token) return null
  const db = admin()
  const digest = createHash('sha256').update(token).digest('hex')
  let { data } = await db.from('mcp_tokens').select('user_id').eq('token', digest).maybeSingle()
  // Rolling-deploy bridge: old generated secrets were exactly 48 hex chars.
  // Once supabase-mcp-schema.sql hashes the rows, this branch finds nothing;
  // a 64-char digest supplied as a bearer secret never enters the fallback.
  if (!data?.user_id && /^[0-9a-f]{48}$/i.test(token)) {
    const legacy = await db.from('mcp_tokens').select('user_id').eq('token', token).maybeSingle()
    data = legacy.data
  }
  if (data?.user_id) return data.user_id
  const { data: u } = await db.auth.getUser(token)
  return u?.user?.id ?? null
}

const toExternal = (types) => types.map((t, i) => ({ stageTypeIdx: i, label: t.label, color: t.border }))

// ── Canvas-level ─────────────────────────────────────────────────────────────
export async function listCanvases(userId) {
  const db = admin()
  const own = await loadCanvasSummaries(db, { ownerId: userId })
  await Promise.all(own.map((row) => recordCanvasDataAccess(db, {
    actorUserId: userId,
    ownerUserId: userId,
    canvasId: row.canvas_id,
    source: 'mcp',
    purpose: 'mcp_canvas_operation',
    operation: 'read',
  })))

  // Canvases shared to me: compose every accepted scope per owner+canvas.
  const shares = await listAcceptedShares(userId, null)
  const grouped = new Map()
  for (const s of shares) {
    const key = `${s.owner_id}:${s.canvas_id}`
    const current = grouped.get(key) ?? { ownerId: s.owner_id, canvasId: s.canvas_id, grants: [] }
    current.grants.push(s)
    grouped.set(key, current)
  }
  const shared = []
  const groupedByOwner = new Map()
  for (const item of grouped.values()) {
    const items = groupedByOwner.get(item.ownerId) ?? []
    items.push(item)
    groupedByOwner.set(item.ownerId, items)
  }
  for (const [ownerId, items] of groupedByOwner) {
    const summaries = await loadCanvasSummaries(db, {
      ownerId,
      canvasIds: items.map((item) => item.canvasId),
    })
    const summaryById = new Map(summaries.map((summary) => [summary.canvas_id, summary]))
    for (const item of items) {
      const summary = summaryById.get(item.canvasId)
      if (!summary) continue
      const permission = composeSharePermission(item.grants)
      await recordCanvasDataAccess(db, {
        actorUserId: userId,
        ownerUserId: item.ownerId,
        canvasId: item.canvasId,
        source: 'mcp',
        purpose: 'mcp_canvas_operation',
        operation: 'read',
      })
      shared.push({
        ...summary,
        shared: true,
        permission_scope: permission.scope,
        permission_grants: permission.grants,
      })
    }
  }
  return [...own, ...shared]
}

// ── Shared-canvas access ─────────────────────────────────────────────────────
// The service-role client bypasses RLS, so shared-canvas access and the invited
// region are enforced explicitly here (mirrors the browser's gating in App.jsx).

// Resolve what `userId` may do with `canvasId`: own it, or hold an invite.
// Returns { row, role:'owner'|'invitee', ownerId, scope?, targetId? } (invitee
// gets the union of every accepted scope when several invites exist).
async function resolveCanvasAccess(userId, canvasId) {
  const db = admin()
  const { data: own, error } = await db
    .from('canvases').select(CANVAS_ROW_SELECT).eq('user_id', userId).eq('canvas_id', canvasId).maybeSingle()
  if (error) throw new Error(error.message)
  if (own) {
    await recordCanvasDataAccess(db, {
      actorUserId: userId,
      ownerUserId: userId,
      canvasId,
      source: 'mcp',
      purpose: 'mcp_canvas_operation',
      operation: 'read_for_write',
    })
    return { row: own, role: 'owner', ownerId: userId }
  }

  const mine = await listAcceptedShares(userId, canvasId)
  if (mine.length) {
    const byOwner = new Map()
    for (const share of mine) {
      const grants = byOwner.get(share.owner_id) ?? []
      grants.push(share)
      byOwner.set(share.owner_id, grants)
    }
    const candidates = [...byOwner.entries()].map(([ownerId, grants]) => ({
      ownerId,
      permission: composeSharePermission(grants),
    })).sort((left, right) => (
      Number(right.permission.canEditCanvas) - Number(left.permission.canEditCanvas)
      || Number(right.permission.canEdit) - Number(left.permission.canEdit)
      || Number(left.permission.restrictView) - Number(right.permission.restrictView)
      || right.permission.grants.length - left.permission.grants.length
    ))
    const selected = candidates[0]
    const { data: row, error: e3 } = await db
      .from('canvases').select(CANVAS_ROW_SELECT).eq('user_id', selected.ownerId).eq('canvas_id', canvasId).maybeSingle()
    if (e3) throw new Error(e3.message)
    if (row) {
      await recordCanvasDataAccess(db, {
        actorUserId: userId,
        ownerUserId: selected.ownerId,
        canvasId,
        source: 'mcp',
        purpose: 'mcp_canvas_operation',
        operation: 'read_for_write',
      })
      return { row, ownerId: selected.ownerId, ...selected.permission }
    }
  }
  throw new Error(`캔버스를 찾을 수 없습니다: ${canvasId}`)
}

function assertOwner(access, what) {
  if (access.role !== 'owner') throw new Error(`${what}은(는) 캔버스 소유자만 할 수 있습니다.`)
}

// ── Region gating (pure, unit-tested) ────────────────────────────────────────
// null → unrestricted (owner, or canvas-scope invite)
export function editableNodeIdSet(access, nodes) {
  return editableNodeIdSetForPermission(access, nodes)
}

// action: { kind: 'canvas-admin'|'types'|'graph'|'node-create'|'node-update'|
//           'node-delete'|'edge', nodeId?, nodeIds?, source?, target?, movesPosition? }
// Throws a teaching-style error when the invite's region doesn't allow it.
export function assertRegionEdit(access, nodes, action) {
  const permission = permissionFromAccess(access)
  if (permission.role === 'owner') return
  const deny = (msg) => { throw new Error(msg) }
  if (!permission.canEdit) deny('읽기 전용 초대에서는 변경할 수 없습니다.')
  if (action.kind === 'canvas-admin') deny('캔버스 삭제/이름 변경/초기화는 소유자만 할 수 있습니다.')
  if (permission.canEditCanvas) return

  if (action.kind === 'types') {
    deny('단계 종류 편집은 캔버스 전체 초대 권한이 필요합니다 (그룹/노드 초대로는 불가).')
  }
  if (action.kind === 'graph') {
    deny('초대 구역 편집에서는 create_graph를 쓸 수 없습니다. create_node/update_nodes/delete_nodes를 사용하세요.')
  }
  const editable = editableNodeIdSet(permission, nodes)
  const byId = new Map((nodes ?? []).map((node) => [node.id, node]))
  const groupIds = editableGroupIdSet(permission)
  if (action.kind === 'node-create') {
    if (groupIds.size) return
    deny('노드 초대 권한으로는 해당 노드의 내용·크기 수정만 가능합니다 (추가/삭제/연결선 불가).')
  }
  if (action.kind === 'edge') {
    if (!permissionCanEditEdge(permission, byId.get(action.source), byId.get(action.target))) {
      deny('연결선의 양 끝이 모두 초대된 그룹 편집 구역 안에 있어야 합니다.')
    }
    return
  }
  const ids = action.nodeIds ?? [action.nodeId]
  const bad = ids.filter((id) => !editable.has(id))
  if (bad.length) {
    deny(
      `초대된 편집 구역 밖 노드입니다: ${bad.join(', ')}. ` +
      '편집 가능한 노드는 get_canvas 응답의 my_permission.editable_node_ids를 참고하세요.')
  }
  if (action.kind === 'node-delete' && ids.some((id) => !permissionCanEditNodeStructure(permission, byId.get(id)))) {
    deny('노드 초대 권한으로는 해당 노드를 삭제할 수 없습니다.')
  }
  if (action.movesPosition && ids.some((id) => !permissionCanEditNodeStructure(permission, byId.get(id)))) {
    deny('노드 초대 권한으로는 위치(x/y)를 옮길 수 없습니다 (내용·크기만 수정 가능).')
  }
}

// ── Stage types (per-canvas: canvases.stage_types) ──────────────────────────
// Each canvas owns its own list, independent of every other canvas. A new
// canvas (or one that never customized types) has stage_types = null and
// falls back to DEFAULT_STAGE_TYPES.
function rowStageTypes(row) {
  return (row.stage_types?.length) ? row.stage_types : DEFAULT_STAGE_TYPES
}

export async function getStageTypes(userId, canvasId) {
  const { row } = await resolveCanvasAccess(userId, canvasId)
  return toExternal(rowStageTypes(row))
}

export async function createStageType(userId, canvasId, label) {
  const access = await resolveCanvasAccess(userId, canvasId)
  assertRegionEdit(access, access.row.nodes, { kind: 'types' })
  const types = rowStageTypes(access.row)
  const palette = TYPE_PALETTE[types.length % TYPE_PALETTE.length]
  const next = [...types, { id: `type-${uid()}`, ...palette, label: label?.trim() || '새 종류' }]
  const { data, error } = await admin().from('canvases')
    .update({ stage_types: next, updated_at: nextRevision(access.row.updated_at) })
    .eq('user_id', access.ownerId).eq('canvas_id', canvasId).eq('updated_at', access.row.updated_at)
    .select('updated_at').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw writeConflict()
  return toExternal(next)[next.length - 1]
}

export async function renameStageType(userId, canvasId, stageTypeIdx, label) {
  const access = await resolveCanvasAccess(userId, canvasId)
  assertRegionEdit(access, access.row.nodes, { kind: 'types' })
  const row = access.row
  const types = rowStageTypes(row)
  if (stageTypeIdx < 0 || stageTypeIdx >= types.length) throw new Error(`단계 종류를 찾을 수 없습니다: ${stageTypeIdx}`)
  if (!label?.trim()) throw new Error('이름은 비어있을 수 없습니다.')
  const next = types.map((t, i) => (i === stageTypeIdx ? { ...t, label: label.trim() } : t))
  const { data, error } = await admin().from('canvases')
    .update({ stage_types: next, updated_at: nextRevision(access.row.updated_at) })
    .eq('user_id', access.ownerId).eq('canvas_id', canvasId).eq('updated_at', access.row.updated_at)
    .select('updated_at').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw writeConflict()
  return toExternal(next)[stageTypeIdx]
}

export async function deleteStageType(userId, canvasId, stageTypeIdx) {
  const access = await resolveCanvasAccess(userId, canvasId)
  assertRegionEdit(access, access.row.nodes, { kind: 'types' })
  const row = access.row
  const types = rowStageTypes(row)
  if (stageTypeIdx < 0 || stageTypeIdx >= types.length) throw new Error(`단계 종류를 찾을 수 없습니다: ${stageTypeIdx}`)
  if (types.length <= 1) throw new Error('최소 1개의 단계 종류는 남아있어야 합니다.')
  const next = types.filter((_, i) => i !== stageTypeIdx)

  // 이 캔버스의 노드만 재색인 (단계 종류는 캔버스별로 독립적이라 다른 캔버스는 영향받지 않음)
  const reindexed = (row.nodes ?? []).map((n) => {
    if (n.type !== 'stage') return n
    const ci = n.data?.colorIdx ?? 0
    if (ci === stageTypeIdx) return { ...n, data: { ...n.data, colorIdx: 0 } }
    if (ci > stageTypeIdx) return { ...n, data: { ...n.data, colorIdx: ci - 1 } }
    return n
  })
  const { data, error } = await admin().from('canvases')
    .update({ stage_types: next, nodes: reindexed, updated_at: nextRevision(access.row.updated_at) })
    .eq('user_id', access.ownerId).eq('canvas_id', canvasId).eq('updated_at', access.row.updated_at)
    .select('updated_at').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw writeConflict()
  return toExternal(next)
}

function storedAbsolutePosition(node, byId) {
  let x = node.position?.x ?? 0
  let y = node.position?.y ?? 0
  let current = node
  const visited = new Set([node.id])
  while (current.parentId && byId.has(current.parentId) && !visited.has(current.parentId)) {
    visited.add(current.parentId)
    current = byId.get(current.parentId)
    x += current.position?.x ?? 0
    y += current.position?.y ?? 0
  }
  return { x, y }
}

export function toExternalCanvasNode(node, byId, hidden = false) {
  const shape = {
    id: node.id,
    type: node.type,
    position: node.position,
    absolute_position: storedAbsolutePosition(node, byId),
    width: nodeW(node),
    height: nodeH(node),
    dimmed: node.data?.dimmed ?? false,
    ...(node.parentId ? { parent_id: node.parentId } : {}),
  }
  if (hidden) return { ...shape, redacted: true }

  if (node.type === 'memo') {
    return { ...shape, header: node.data?.header ?? '', text: node.data?.text ?? '' }
  }
  if (node.type === 'group') {
    return { ...shape, label: node.data?.label ?? '' }
  }
  if (node.type === 'content') {
    const src = node.data?.src
    return {
      ...shape,
      kind: node.data?.kind ?? 'database',
      header: node.data?.header ?? '',
      ...(node.data?.url ? { url: node.data.url } : {}),
      ...(node.data?.storagePath ? { stored_image: true } : {}),
      ...(src && !src.startsWith('data:') ? { image_url: src } : {}),
      ...(src?.startsWith('data:') ? { embedded_image: true } : {}),
    }
  }
  if (node.type === 'system') {
    const data = normalizeSystemNodeData(node.data)
    return {
      ...shape,
      label: data.label ?? '',
      description: data.description ?? '',
      system_kind: data.systemKind,
      purpose: data.purpose ?? '',
      responsibility: data.responsibility ?? '',
      constraints: data.constraints ?? '',
      evidence: data.evidence ?? '',
      environment: data.environment,
      source_kind: data.sourceKind,
      ...(data.provider ? { provider: data.provider } : {}),
      ...(data.externalRef ? { external_ref: data.externalRef } : {}),
      ...(data.systemParts?.length ? { system_parts: data.systemParts } : {}),
      ...(data.trustZone ? { trust_zone: data.trustZone } : {}),
      reality: 'declared',
    }
  }
  if (node.type === 'intent') {
    const data = normalizeIntentNodeData(node.data)
    const version = intentVersionState(data)
    const latestRecorded = data.intentVersions.at(-1) ?? null
    const externalClause = (clause) => ({
      id: clause.id,
      clause_kind: clause.clauseKind,
      enforcement: clause.enforcement,
      text: clause.text,
    })
    const externalVersions = data.intentVersions.map(({ intentClauses, ...snapshot }) => ({
      ...snapshot,
      intent_clauses: intentClauses.map(externalClause),
    }))
    const clauseCounts = data.intentClauses.reduce((counts, clause) => ({
      ...counts,
      [clause.status]: (counts[clause.status] ?? 0) + 1,
    }), { candidate: 0, approved: 0, rejected: 0 })
    return {
      ...shape,
      label: data.label,
      statement: data.statement,
      intent_kind: data.intentKind,
      intent_status: data.intentStatus,
      current_version: version.currentVersion,
      version_state: version.dirty ? 'draft_changed' : 'recorded',
      ...(version.latestRecordedAt ? { latest_recorded_at: version.latestRecordedAt } : {}),
      source_count: data.intentSources.length,
      clause_counts: clauseCounts,
      approved_clauses: latestRecorded?.intentClauses.map(externalClause) ?? [],
      intent_versions: externalVersions,
      executable: false,
    }
  }
  return {
    ...shape,
    label: node.data?.label ?? '',
    description: node.data?.description ?? '',
    stageTypeIdx: node.data?.colorIdx ?? 0,
    parts: node.data?.parts ?? [],
  }
}

export function toExternalCanvasEdge(edge, hidden = false, trustedRuntime = null) {
  const shape = {
    id: edge.id,
    source: edge.source,
    target: edge.target,
    ...(edge.sourceHandle ? { sourceHandle: edge.sourceHandle } : {}),
    ...(edge.targetHandle ? { targetHandle: edge.targetHandle } : {}),
  }
  if (hidden) return { ...shape, redacted: true }
  const safeData = normalizeEdgeRelationData(
    edge?.data,
    edge?.style?.strokeDasharray ? 'references' : 'flows_to',
  )
  const relation = edgeRelationInfo(
    trustedRuntime ? { ...safeData, relationRuntime: trustedRuntime } : safeData,
    edge?.style?.strokeDasharray ? 'references' : 'flows_to',
  )
  return {
    ...shape,
    relation_type: relation.id,
    relation_label: relation.label,
    relation_family: relation.family,
    directed: relation.directed,
    show_relation_label: relation.explicit,
    relation_reality: relation.provenance.reality.id,
    relation_source_kind: relation.provenance.source.id,
    relation_confidence: relation.provenance.confidence.id,
    ...(relation.provenance.evidence ? { relation_evidence: relation.provenance.evidence } : {}),
    ...(relation.provenance.evidenceRef ? { relation_evidence_ref: relation.provenance.evidenceRef } : {}),
    ...(safeData.trustGateway ? { trust_gateway: safeData.trustGateway } : {}),
    server_verified: relation.provenance.reality.id === 'verified',
    ...(relation.provenance.verifiedAt ? { verified_at: relation.provenance.verifiedAt } : {}),
  }
}

export async function getCanvas(userId, canvasId) {
  const access = await resolveCanvasAccess(userId, canvasId)
  const row = access.row
  const editable = access.role === 'invitee' ? editableNodeIdSet(access, row.nodes) : null
  const permission = permissionFromAccess(access)
  const visible = access.role === 'invitee' ? visibleNodeIdSetForPermission(permission, row.nodes) : null
  const myPermission = access.role === 'invitee'
    ? {
        role: 'invitee',
        scope: permission.scope,
        target_id: permission.targetId,
        // null = 전체 편집 가능 (canvas 범위 초대)
        editable_node_ids: editable === null ? null : [...editable],
        can_edit: permission.canEdit,
        can_edit_canvas: permission.canEditCanvas,
        restrict_view: permission.restrictView,
        grants: permission.grants.map((grant) => ({
          share_id: grant.shareId,
          scope: grant.scope,
          target_id: grant.targetId,
          can_edit: grant.canEdit,
          restrict_view: grant.restrictView,
        })),
      }
    : undefined
  const byId = new Map((row.nodes ?? []).map((node) => [node.id, node]))
  return {
    ...(myPermission ? { my_permission: myPermission } : {}),
    canvas_id: row.canvas_id,
    name: row.name,
    updated_at: row.updated_at,
    views: row.views ?? [],
    stage_types: toExternal(rowStageTypes(row)),
    nodes: (row.nodes ?? []).map((node) => toExternalCanvasNode(
      node,
      byId,
      access.role === 'invitee' && visible !== null && !visible.has(node.id),
    )),
    edges: (row.edges ?? []).map((edge) => toExternalCanvasEdge(
      edge,
      access.role === 'invitee'
        && visible !== null
        && (!visible.has(edge.source) || !visible.has(edge.target)),
    )),
  }
}

async function saveArrays(userId, canvasId, nodes, edges, expectedRevision) {
  const { data, error } = await admin()
    .from('canvases')
    .update({ nodes, edges, updated_at: nextRevision(expectedRevision) })
    .eq('user_id', userId)
    .eq('canvas_id', canvasId)
    .eq('updated_at', expectedRevision)
    .select('updated_at')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw writeConflict()
}

export async function createCanvas(userId, name) {
  const canvasId = `c-${uid()}`
  const { error } = await admin().from('canvases').insert({
    user_id: userId, canvas_id: canvasId, name: name || '새 캔버스', nodes: [], edges: [],
  })
  if (error) throw new Error(error.message)
  return { canvas_id: canvasId, name: name || '새 캔버스' }
}

export function canCreateWorkflowSystemMap(userId, configuredOwnerId = process.env.WORKFLOW_CANVAS_OWNER_USER_ID) {
  return typeof userId === 'string'
    && typeof configuredOwnerId === 'string'
    && configuredOwnerId.trim().length > 0
    && userId === configuredOwnerId.trim()
}

export async function createWorkflowSystemMap(userId, name) {
  const ownerUserId = process.env.WORKFLOW_CANVAS_OWNER_USER_ID?.trim()
  if (!ownerUserId) {
    throw new Error('내부 시스템 지도 생성이 비활성화되어 있습니다. 서버에 WORKFLOW_CANVAS_OWNER_USER_ID를 설정하세요.')
  }
  if (!canCreateWorkflowSystemMap(userId, ownerUserId)) throw new Error('제품 소유자만 내부 시스템 지도를 생성할 수 있습니다.')

  const template = createWorkflowCanvasSystemMap()
  const canvasId = `c-${uid()}`
  const canvasName = name?.trim().slice(0, 120) || template.name
  const { error } = await admin().from('canvases').insert({
    user_id: userId,
    canvas_id: canvasId,
    name: canvasName,
    nodes: template.nodes,
    edges: template.edges,
    notes: template.notes,
    views: template.views,
    stage_types: template.stageTypes,
  })
  if (error) throw new Error(error.message)
  return {
    canvas_id: canvasId,
    name: canvasName,
    nodes: template.nodes.length,
    edges: template.edges.length,
    saved_views: template.views.map((view) => view.name),
    reality: 'declared',
    relation_reality: 'evidenced',
  }
}

export async function inspectWorkflowSystemMap(userId, canvasId) {
  const ownerUserId = process.env.WORKFLOW_CANVAS_OWNER_USER_ID?.trim()
  if (!ownerUserId) {
    throw new Error('내부 시스템 지도 검사가 비활성화되어 있습니다. 서버에 WORKFLOW_CANVAS_OWNER_USER_ID를 설정하세요.')
  }
  if (!canCreateWorkflowSystemMap(userId, ownerUserId)) {
    throw new Error('제품 소유자만 내부 시스템 지도를 검사할 수 있습니다.')
  }
  const access = await resolveCanvasAccess(userId, canvasId)
  assertOwner(access, '내부 시스템 지도 검사')
  return buildWorkflowSystemMapInspection({
    canvas: access.row,
    expectedMap: createWorkflowCanvasSystemMap(),
    discovery: WORKFLOW_SYSTEM_DISCOVERY,
  })
}

export function workflowSystemMapRelationRepairPlanId(
  canvasId,
  revision,
  plan,
  manifestId = WORKFLOW_SYSTEM_DISCOVERY.current.id,
) {
  return createHash('sha256').update(JSON.stringify({
    schema_version: 1,
    manifest_id: manifestId,
    canvas_id: canvasId,
    canvas_revision: revision ?? null,
    repairs: plan.repairs,
    blockers: plan.blockers,
  })).digest('hex')
}

function relationRepairPreview(row) {
  const expectedMap = createWorkflowCanvasSystemMap()
  const plan = planWorkflowSystemMapRelationRepair({ canvas: row, expectedMap })
  const planId = workflowSystemMapRelationRepairPlanId(row.canvas_id, row.updated_at, plan)
  return {
    mode: 'read-only-repair-preview',
    writes_performed: false,
    canvas_id: row.canvas_id,
    canvas_name: row.name,
    canvas_revision: row.updated_at,
    manifest_id: WORKFLOW_SYSTEM_DISCOVERY.current.id,
    plan_id: planId,
    can_apply: plan.repairs.length > 0 && plan.blockers.length === 0,
    ...plan,
    apply_requirements: {
      confirmation: WORKFLOW_RELATION_REPAIR_CONFIRMATION,
      plan_id_must_match_current_revision: true,
      close_or_reload_stale_canvas_tabs_first: true,
    },
    guidance: [
      '이 미리보기는 어떤 DB나 캔버스도 수정하지 않았습니다.',
      '기존 관계 메타데이터가 일부라도 남아 있는 연결선은 자동 복구하지 않습니다.',
      '실제 적용 전 모든 Workflow Canvas 탭을 닫고 최신 배포를 다시 열어 오래된 앱의 재저장을 막으세요.',
    ],
  }
}

async function relationMetadataGuardReady() {
  const { data, error } = await admin().rpc('canvas_relation_metadata_guard_ready')
  return !error && data === true
}

export async function previewWorkflowSystemMapRelationRepair(userId, canvasId) {
  const ownerUserId = process.env.WORKFLOW_CANVAS_OWNER_USER_ID?.trim()
  if (!ownerUserId) {
    throw new Error('내부 시스템 지도 복구 미리보기가 비활성화되어 있습니다. 서버에 WORKFLOW_CANVAS_OWNER_USER_ID를 설정하세요.')
  }
  if (!canCreateWorkflowSystemMap(userId, ownerUserId)) {
    throw new Error('제품 소유자만 내부 시스템 지도 복구를 미리 볼 수 있습니다.')
  }
  const access = await resolveCanvasAccess(userId, canvasId)
  assertOwner(access, '내부 시스템 지도 복구 미리보기')
  const preview = relationRepairPreview(access.row)
  const guardReady = await relationMetadataGuardReady()
  return {
    ...preview,
    can_apply: preview.can_apply && guardReady,
    protection_guard: {
      installed: guardReady,
      required_before_apply: true,
      migration: 'supabase-relation-metadata-guard.sql',
    },
  }
}

export async function repairWorkflowSystemMapRelations(userId, canvasId, planId, confirmation) {
  if (confirmation !== WORKFLOW_RELATION_REPAIR_CONFIRMATION) {
    throw new Error('복구 확인 문구가 일치하지 않습니다. 먼저 읽기 전용 미리보기를 실행하고 사용자의 명시적 승인을 받으세요.')
  }
  const ownerUserId = process.env.WORKFLOW_CANVAS_OWNER_USER_ID?.trim()
  if (!ownerUserId) {
    throw new Error('내부 시스템 지도 관계 복구가 비활성화되어 있습니다. 서버에 WORKFLOW_CANVAS_OWNER_USER_ID를 설정하세요.')
  }
  if (!canCreateWorkflowSystemMap(userId, ownerUserId)) {
    throw new Error('제품 소유자만 내부 시스템 지도 관계를 복구할 수 있습니다.')
  }

  const access = await resolveCanvasAccess(userId, canvasId)
  assertOwner(access, '내부 시스템 지도 관계 복구')
  if (!(await relationMetadataGuardReady())) {
    throw new Error('관계 메타데이터 보호 트리거가 설치되지 않았습니다. supabase-relation-metadata-guard.sql을 먼저 실행하세요.')
  }
  const preview = relationRepairPreview(access.row)
  if (planId !== preview.plan_id) {
    throw new Error('복구 계획이 현재 캔버스 revision과 일치하지 않습니다. 미리보기를 다시 실행하고 새 plan_id를 검토하세요.')
  }
  if (preview.blockers.length) {
    throw new Error('구조가 다른 관계가 있어 자동 복구를 중단했습니다. 미리보기의 blockers를 먼저 검토하세요.')
  }
  if (!preview.repairs.length) {
    return {
      mode: 'relation-repair',
      writes_performed: false,
      canvas_id: canvasId,
      repaired_relation_count: 0,
      message: '복구할 누락 관계 메타데이터가 없습니다.',
    }
  }

  const expectedMap = createWorkflowCanvasSystemMap()
  const restored = restoreMissingWorkflowSystemMapRelations({ canvas: access.row, expectedMap })
  const updatedAt = nextRevision(access.row.updated_at)
  const { data, error } = await admin().from('canvases')
    .update({ edges: restored.edges, updated_at: updatedAt })
    .eq('user_id', userId)
    .eq('canvas_id', canvasId)
    .eq('updated_at', access.row.updated_at)
    .select('updated_at')
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw writeConflict()

  return {
    mode: 'relation-repair',
    writes_performed: true,
    canvas_id: canvasId,
    previous_revision: access.row.updated_at,
    updated_revision: data.updated_at,
    repaired_relation_count: restored.repaired_edge_ids.length,
    repaired_edge_ids: restored.repaired_edge_ids,
    protected_existing_metadata: restored.protected_relations,
    message: '관계 메타데이터가 완전히 없던 연결선만 기준 템플릿에서 복구했습니다.',
  }
}

export async function clearCanvas(userId, canvasId) {
  const access = await resolveCanvasAccess(userId, canvasId)
  assertOwner(access, '캔버스 초기화')
  await saveArrays(userId, canvasId, [], [], access.row.updated_at)
}

async function loadPrefs(userId) {
  const { data, error } = await admin()
    .from('user_prefs')
    .select('active_canvas_id, canvas_order')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

async function savePrefs(userId, patch) {
  const { error } = await admin()
    .from('user_prefs')
    .upsert({ user_id: userId, ...patch }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

// The browser builds its tab list from user_prefs.canvas_order (not from
// canvases.name), so a rename must update both places to show up in tabs.
export async function renameCanvas(userId, canvasId, name) {
  const trimmed = name?.trim()
  if (!trimmed) throw new Error('캔버스 이름은 비어있을 수 없습니다.')
  const access = await resolveCanvasAccess(userId, canvasId)
  assertOwner(access, '캔버스 이름 변경')
  const { data, error } = await admin().from('canvases')
    .update({ name: trimmed, updated_at: nextRevision(access.row.updated_at) })
    .eq('user_id', userId).eq('canvas_id', canvasId).eq('updated_at', access.row.updated_at)
    .select('updated_at').maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw writeConflict()
  const prefs = await loadPrefs(userId)
  if (prefs?.canvas_order?.some((c) => c.id === canvasId)) {
    await savePrefs(userId, {
      canvas_order: prefs.canvas_order.map((c) => (c.id === canvasId ? { ...c, name: trimmed } : c)),
    })
  }
  return { canvas_id: canvasId, name: trimmed }
}

export async function deleteCanvasRow(userId, canvasId) {
  assertOwner(await resolveCanvasAccess(userId, canvasId), '캔버스 삭제')
  const { count, error: cntErr } = await admin()
    .from('canvases')
    .select('canvas_id', { count: 'exact', head: true })
    .eq('user_id', userId)
  if (cntErr) throw new Error(cntErr.message)
  if ((count ?? 0) <= 1) throw new Error('마지막 캔버스는 삭제할 수 없습니다 (최소 1개 유지).')
  const { error } = await admin().from('canvases').delete().eq('user_id', userId).eq('canvas_id', canvasId)
  if (error) throw new Error(error.message)
  const prefs = await loadPrefs(userId)
  if (prefs) {
    const order = (prefs.canvas_order ?? []).filter((c) => c.id !== canvasId)
    const patch = { canvas_order: order }
    if (prefs.active_canvas_id === canvasId) patch.active_canvas_id = order[0]?.id ?? null
    await savePrefs(userId, patch)
  }
  return { deleted: canvasId }
}

// Free-spot placement: scan grid candidates so auto-placed nodes never overlap
function findFreePosition(existingNodes) {
  const COL_STEP = 320
  const ROW_STEP = 200
  const COLS = 8
  const ROWS = 30
  const X_MARGIN = 300
  const Y_MARGIN = 180

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cx = 100 + col * COL_STEP
      const cy = 100 + row * ROW_STEP
      const taken = existingNodes.some((n) => {
        const nx = n.position?.x ?? 0
        const ny = n.position?.y ?? 0
        return Math.abs(nx - cx) < X_MARGIN && Math.abs(ny - cy) < Y_MARGIN
      })
      if (!taken) return { x: cx, y: cy }
    }
  }
  // All grid spots taken — place below the lowest node
  const maxY = existingNodes.reduce((m, n) => Math.max(m, n.position?.y ?? 0), 0)
  return { x: 100, y: maxY + 220 }
}

// ── Node-level ───────────────────────────────────────────────────────────────
// Build the stored node object shared by createNode and createGraph.
function materializeNode(opts, position, types) {
  const size = clampSize(opts.type, opts.width, opts.height)
  const base = { id: newNodeId(), type: opts.type, position }
  if (size.width != null) base.width = size.width
  if (size.height != null) base.height = size.height
  const dimmed = opts.dimmed === true ? { dimmed: true } : {}
  if (opts.type === 'memo') {
    return { ...base, data: { header: opts.header ?? '', text: opts.text ?? '', ...dimmed } }
  }
  if (opts.type === 'system') {
    const defaults = createSystemNodeData(opts.systemKind)
    const data = normalizeSystemNodeData({
      label: opts.label ?? defaults.label,
      description: opts.description ?? '',
      purpose: opts.purpose ?? '',
      responsibility: opts.responsibility ?? '',
      constraints: opts.constraints ?? '',
      evidence: opts.evidence ?? '',
      systemKind: opts.systemKind ?? defaults.systemKind,
      environment: opts.environment ?? defaults.environment,
      sourceKind: opts.sourceKind ?? defaults.sourceKind,
      provider: opts.provider ?? '',
      externalRef: opts.externalRef ?? '',
    })
    return { ...base, data: { ...data, ...dimmed } }
  }
  return {
    ...base,
    data: {
      label: opts.label ?? '새 단계',
      description: opts.description ?? '',
      colorIdx: assertStageTypeIdx(types, opts.stageTypeIdx ?? opts.colorIdx),
      ...dimmed,
    },
  }
}

export async function createNode(userId, canvasId, opts) {
  const access = await resolveCanvasAccess(userId, canvasId)
  assertRegionEdit(access, access.row.nodes, { kind: 'node-create' })
  const row = access.row
  const nodes = row.nodes ?? []
  sanitizeTextFields(opts)

  // Scoped invitees create inside an explicitly authorized group. A single
  // group grant is inferred; overlapping group grants require target_group_id.
  const permission = permissionFromAccess(access)
  if (access.role === 'invitee' && !permission.canEditCanvas) {
    const groupIds = editableGroupIdSet(permission)
    const requestedGroupId = opts.target_group_id ?? opts.targetGroupId ?? null
    const targetGroupId = requestedGroupId ?? (groupIds.size === 1 ? [...groupIds][0] : null)
    if (!targetGroupId || !groupIds.has(targetGroupId)) {
      throw new Error(groupIds.size > 1
        ? '편집 가능한 그룹이 여러 개입니다. target_group_id로 새 노드를 넣을 그룹을 지정하세요.'
        : '새 노드를 만들 수 있는 그룹 초대 권한이 없습니다.')
    }
    const targetGroup = nodes.find((node) => node.id === targetGroupId && node.type === 'group')
    if (!targetGroup) throw new Error(`초대된 그룹을 찾을 수 없습니다: ${targetGroupId}`)
    const siblings = nodes.filter((n) => n.parentId === targetGroupId)
    const size = clampSize(opts.type, opts.width, opts.height)
    const w = size.width ?? SIZE[opts.type]?.w ?? SIZE.stage.w
    const h = size.height ?? SIZE[opts.type]?.h ?? SIZE.stage.h
    const desired = (Number.isFinite(opts.x) && Number.isFinite(opts.y))
      ? { x: opts.x, y: opts.y }
      : { x: 24, y: 56 }
    const spot = findNonOverlapping(siblings.map(nodeRect), desired, w, h)
    const node = materializeNode(opts, { x: spot.x, y: spot.y }, rowStageTypes(row))
    node.parentId = targetGroupId
    await saveArrays(access.ownerId, canvasId, [...nodes, node], row.edges ?? [], row.updated_at)
    return spot.shifted ? { ...node, shifted: { from: desired, to: { x: spot.x, y: spot.y } } } : node
  }

  const explicit = Number.isFinite(opts.x) && Number.isFinite(opts.y)
  let position = explicit
    ? { x: opts.x, y: opts.y }
    : (Number.isFinite(opts.x) || Number.isFinite(opts.y))
      ? { x: Number.isFinite(opts.x) ? opts.x : findFreePosition(nodes).x, y: Number.isFinite(opts.y) ? opts.y : findFreePosition(nodes).y }
      : findFreePosition(nodes)

  // Overlap enforcement: an explicitly-placed node that collides with an
  // existing one gets shifted to the nearest free spot (reported, not fatal).
  let shifted = null
  if (explicit) {
    const size = clampSize(opts.type, opts.width, opts.height)
    const w = size.width ?? SIZE[opts.type]?.w ?? SIZE.stage.w
    const h = size.height ?? SIZE[opts.type]?.h ?? SIZE.stage.h
    const spot = findNonOverlapping(nodes.map(nodeRect), position, w, h)
    if (spot.shifted) {
      shifted = { from: position, to: { x: spot.x, y: spot.y } }
      position = { x: spot.x, y: spot.y }
    }
  }

  const node = materializeNode(opts, position, rowStageTypes(row))
  await saveArrays(access.ownerId, canvasId, [...nodes, node], row.edges ?? [], row.updated_at)
  return shifted ? { ...node, shifted } : node
}

// Per-node patch application, shared by updateNode and updateNodes.
function applyPatch(n, patch, types) {
  sanitizeTextFields(patch)
  const data = { ...n.data }
  // Runtime verification is server-owned evidence, never editable canvas data.
  delete data.twinRuntime
  delete data.systemPartRuntime
  delete data.canRunSystemChecks
  delete data.onCheckSystemPart
  delete data.securityOverlay
  if (patch.label != null) data.label = patch.label
  if (patch.description != null) data.description = patch.description
  if (n.type === 'stage' && (patch.stageTypeIdx != null || patch.colorIdx != null)) {
    data.colorIdx = assertStageTypeIdx(types, patch.stageTypeIdx ?? patch.colorIdx)
  }
  if (patch.header != null) data.header = patch.header
  if (patch.text != null) data.text = patch.text
  if (n.type === 'system') {
    for (const key of [
      'systemKind', 'purpose', 'responsibility', 'constraints', 'evidence',
      'environment', 'sourceKind', 'provider', 'externalRef',
    ]) {
      if (patch[key] != null) data[key] = patch[key]
    }
  }
  if (patch.dimmed != null) data.dimmed = patch.dimmed === true
  const position = { ...n.position }
  if (Number.isFinite(patch.x)) position.x = patch.x
  if (Number.isFinite(patch.y)) position.y = patch.y
  const next = { ...n, position, data: n.type === 'system' ? normalizeSystemNodeData(data) : data }
  const size = clampSize(n.type, patch.width, patch.height)
  if (size.width != null) next.width = size.width
  if (size.height != null) next.height = size.height
  return next
}

export async function updateNode(userId, canvasId, nodeId, patch) {
  const access = await resolveCanvasAccess(userId, canvasId)
  const row = access.row
  assertRegionEdit(access, row.nodes, {
    kind: 'node-update', nodeId,
    movesPosition: Number.isFinite(patch.x) || Number.isFinite(patch.y),
  })
  const nodes = [...(row.nodes ?? [])]
  const idx = nodes.findIndex((n) => n.id === nodeId)
  if (idx < 0) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`)
  nodes[idx] = applyPatch(nodes[idx], patch, rowStageTypes(row))
  await saveArrays(access.ownerId, canvasId, nodes, row.edges ?? [], row.updated_at)
  return nodes[idx]
}

// Bulk update: all node_ids must exist (fail-all before any write), one save.
export async function updateNodes(userId, canvasId, patches) {
  const access = await resolveCanvasAccess(userId, canvasId)
  const row = access.row
  assertRegionEdit(access, row.nodes, {
    kind: 'node-update', nodeIds: patches.map((p) => p.node_id),
    movesPosition: patches.some((p) => Number.isFinite(p.x) || Number.isFinite(p.y)),
  })
  const nodes = [...(row.nodes ?? [])]
  const byId = new Map(nodes.map((n, i) => [n.id, i]))
  const missing = patches.filter((p) => !byId.has(p.node_id)).map((p) => p.node_id)
  if (missing.length) {
    throw new Error(`노드를 찾을 수 없습니다: ${missing.join(', ')}. get_canvas로 현재 노드 id를 확인하세요.`)
  }
  const types = rowStageTypes(row)
  for (const p of patches) {
    const i = byId.get(p.node_id)
    nodes[i] = applyPatch(nodes[i], p, types)
  }
  await saveArrays(access.ownerId, canvasId, nodes, row.edges ?? [], row.updated_at)
  return { updated: patches.map((p) => p.node_id), count: patches.length }
}

export async function deleteNode(userId, canvasId, nodeId) {
  const access = await resolveCanvasAccess(userId, canvasId)
  const row = access.row
  assertRegionEdit(access, row.nodes, { kind: 'node-delete', nodeId })
  if (!(row.nodes ?? []).some((n) => n.id === nodeId)) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`)
  const nodes = (row.nodes ?? []).filter((n) => n.id !== nodeId)
  const edges = (row.edges ?? []).filter((e) => e.source !== nodeId && e.target !== nodeId)
  await saveArrays(access.ownerId, canvasId, nodes, edges, row.updated_at)
  return { deleted: nodeId, remaining_nodes: nodes.length }
}

// Bulk delete: idempotent-friendly — deletes what it finds, reports the rest.
export async function deleteNodes(userId, canvasId, nodeIds) {
  const access = await resolveCanvasAccess(userId, canvasId)
  const row = access.row
  assertRegionEdit(access, row.nodes, { kind: 'node-delete', nodeIds })
  const ids = new Set(nodeIds)
  const found = (row.nodes ?? []).filter((n) => ids.has(n.id)).map((n) => n.id)
  if (!found.length) throw new Error(`노드를 찾을 수 없습니다: ${nodeIds.join(', ')}. get_canvas로 현재 노드 id를 확인하세요.`)
  const foundSet = new Set(found)
  const nodes = (row.nodes ?? []).filter((n) => !foundSet.has(n.id))
  const edges = (row.edges ?? []).filter((e) => !foundSet.has(e.source) && !foundSet.has(e.target))
  await saveArrays(access.ownerId, canvasId, nodes, edges, row.updated_at)
  return {
    deleted: found,
    not_found: nodeIds.filter((id) => !foundSet.has(id)),
    remaining_nodes: nodes.length,
  }
}

// ── Edge-level ───────────────────────────────────────────────────────────────
export async function createEdge(userId, canvasId, opts) {
  const { source, target } = opts
  const access = await resolveCanvasAccess(userId, canvasId)
  const row = access.row
  assertRegionEdit(access, row.nodes, { kind: 'edge', source, target })
  const nodes = row.nodes ?? []
  const sNode = nodes.find((n) => n.id === source)
  const tNode = nodes.find((n) => n.id === target)
  if (!sNode) throw new Error(`출발 노드를 찾을 수 없습니다: ${source}`)
  if (!tNode) throw new Error(`도착 노드를 찾을 수 없습니다: ${target}`)
  const isMemo = sNode.type === 'memo' || tNode.type === 'memo'
  const relationType = relationDefinition(opts.relationType ?? (isMemo ? 'references' : 'flows_to')).id
  const relationIdentity = edgeRelationIdentity(
    createEdgeRelationData(relationType, opts.relationLabel ?? '', true),
    isMemo ? 'references' : 'flows_to',
  )
  const dup = findDuplicateEdge(row.edges, source, target, relationIdentity)
  if (dup) {
    throw new Error(
      `이미 같은 방향·같은 관계(${relationType})의 연결이 있습니다 (edge_id: ${dup.id}). ` +
      '두 자원 사이에 다른 의미가 필요하면 다른 relationType을 사용하세요.')
  }
  const edge = buildEdge(opts, sNode, tNode)
  await saveArrays(access.ownerId, canvasId, nodes, [...(row.edges ?? []), edge], row.updated_at)
  return edge
}

// Shared edge construction (createEdge + createGraph): memo links are dashed,
// missing handles are auto-computed, and explicit semantic relationships use
// their ontology-family color. Symmetric relations omit the arrowhead.
function buildEdge({
  source, target, sourceHandle, targetHandle,
  relationType, relationLabel, showRelationLabel,
  relationSourceKind, relationConfidence, relationEvidence, relationEvidenceRef,
}, sNode, tNode) {
  const isMemo = sNode.type === 'memo' || tNode.type === 'memo'
  const auto = (!sourceHandle || !targetHandle) ? closestHandles(sNode, tNode) : {}
  const fallbackType = isMemo ? 'references' : 'flows_to'
  const explicit = showRelationLabel ?? (relationType != null || relationLabel != null)
  const data = createEdgeRelationData(relationType ?? fallbackType, relationLabel ?? '', explicit, {
    relationSourceKind,
    relationConfidence,
    relationEvidence,
    relationEvidenceRef,
  })
  const relation = edgeRelationInfo(data, fallbackType)
  const style = isMemo
    ? NOTE_STYLE
    : { ...FLOW_STYLE, ...(relation.explicit ? { stroke: relation.color } : {}) }
  return {
    id: newEdgeId(),
    source,
    target,
    sourceHandle: sourceHandle || auto.sourceHandle,
    targetHandle: targetHandle || auto.targetHandle,
    data,
    style,
    markerEnd: isMemo || !relation.directed
      ? undefined
      : { type: 'arrowclosed', color: style.stroke },
  }
}

// Auto heuristic: pick 'radial' when there is exactly one in-degree-0
// structural node, it has out-degree >= 3, and there are at least 5 structural
// nodes. Structural means a hierarchy stage or a system entity.
function autoPreset(nodeInputs, edgeInputs) {
  const stageIds = new Set(nodeInputs.filter(isStructuralNode).map((n) => n.tmp_id))
  const stageEdges = (edgeInputs ?? []).filter((e) => stageIds.has(e.source) && stageIds.has(e.target))
  const inDeg = new Map([...stageIds].map((id) => [id, 0]))
  const outDeg = new Map([...stageIds].map((id) => [id, 0]))
  for (const e of stageEdges) {
    inDeg.set(e.target, inDeg.get(e.target) + 1)
    outDeg.set(e.source, outDeg.get(e.source) + 1)
  }
  const zeroDegIds = [...stageIds].filter((id) => inDeg.get(id) === 0)
  if (stageIds.size >= 5 && zeroDegIds.length === 1 && outDeg.get(zeroDegIds[0]) >= 3) return 'radial'
  return 'right'
}

// ── create_graph: whole graph in one call (1 read + 1 write) ─────────────────
export async function createGraph(userId, canvasId, { nodes: nodeInputs, edges: edgeInputs = [], layout }) {
  const access = await resolveCanvasAccess(userId, canvasId)
  assertRegionEdit(access, access.row.nodes, { kind: 'graph' })
  const row = access.row
  const existing = row.nodes ?? []
  const types = rowStageTypes(row)

  // Layout mode: explicit param wins; default auto when any position missing.
  const mode = layout ?? (nodeInputs.some((n) => !Number.isFinite(n.x) || !Number.isFinite(n.y)) ? 'auto' : 'manual')
  validateGraphInput({ nodes: nodeInputs, edges: edgeInputs }, existing, types, mode)
  nodeInputs.forEach(sanitizeTextFields)

  // Resolve the actual layout preset (for non-manual modes)
  const preset = mode === 'manual' ? null
    : mode === 'auto' ? autoPreset(nodeInputs, edgeInputs)
    : mode // 'radial', 'right', 'down', 'left', 'up'

  // Positions + layout direction info (radial only)
  const shifted = []
  const positions = new Map()  // tmp_id -> {x, y}
  const layoutDirs = new Map() // tmp_id -> 'right'|'left'|'bottom'|'top'|null (radial only)
  const layoutMemoFacing = new Map() // memo tmp_id -> {stageFacing, ownFacing} (radial only)
  if (mode !== 'manual') {
    const auto = layoutGraph({ newNodes: nodeInputs, newEdges: edgeInputs, existingNodes: existing, preset })
    for (const n of nodeInputs) {
      const entry = auto.get(n.tmp_id)
      positions.set(n.tmp_id, { x: entry.x, y: entry.y })
      if (preset === 'radial') {
        layoutDirs.set(n.tmp_id, entry.dir ?? null)
        if (entry.memoStageFacing != null) {
          layoutMemoFacing.set(n.tmp_id, { stageFacing: entry.memoStageFacing, ownFacing: entry.memoOwnFacing })
        }
      }
    }
  } else {
    const placedRects = existing.map(nodeRect)
    for (const n of nodeInputs) {
      const size = clampSize(n.type, n.width, n.height)
      const w = size.width ?? SIZE[n.type]?.w ?? SIZE.stage.w
      const h = size.height ?? SIZE[n.type]?.h ?? SIZE.stage.h
      const spot = findNonOverlapping(placedRects, { x: n.x, y: n.y }, w, h)
      if (spot.shifted) shifted.push({ tmp_id: n.tmp_id, from: { x: n.x, y: n.y }, to: { x: spot.x, y: spot.y } })
      positions.set(n.tmp_id, { x: spot.x, y: spot.y })
      placedRects.push({ x: spot.x, y: spot.y, w, h })
    }
  }

  // Materialize nodes; map tmp ids -> real ids.
  const idMap = new Map()
  const newNodes = nodeInputs.map((n) => {
    const node = materializeNode(n, positions.get(n.tmp_id), types)
    idMap.set(n.tmp_id, node.id)
    return node
  })

  // BFS/layer level map: used to determine parent vs child in edge handle pinning.
  // For radial: use radialLevels. For directional presets: compute Kahn layers.
  const bfsLevel = preset === 'radial' ? radialLevels(nodeInputs, edgeInputs) : (() => {
    if (!['right', 'left', 'down', 'up'].includes(preset)) return null
    const stageIds = new Set(nodeInputs.filter(isStructuralNode).map((n) => n.tmp_id))
    const stageEdges = (edgeInputs ?? []).filter((e) => stageIds.has(e.source) && stageIds.has(e.target))
    const succ = new Map([...stageIds].map((id) => [id, []]))
    const inDeg = new Map([...stageIds].map((id) => [id, 0]))
    for (const e of stageEdges) {
      succ.get(e.source).push(e.target)
      inDeg.set(e.target, inDeg.get(e.target) + 1)
    }
    const layer = new Map()
    const queue = [...stageIds].filter((id) => inDeg.get(id) === 0)
    for (const id of queue) layer.set(id, 0)
    const q = [...queue]
    while (q.length) {
      const cur = q.shift()
      for (const next of succ.get(cur)) {
        const nl = (layer.get(cur) ?? 0) + 1
        if (!layer.has(next) || layer.get(next) < nl) layer.set(next, nl)
        if (layer.get(next) === nl) q.push(next)
      }
    }
    // Unreachable stages get level -1
    for (const id of stageIds) if (!layer.has(id)) layer.set(id, -1)
    return layer
  })()

  // Opposite handle for a given direction
  const OPPOSITE = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' }

  // Flow-side handle for directional presets: the side of the parent that faces the child.
  // right→parent's right, left→parent's left, down→parent's bottom, up→parent's top.
  const FLOW_SIDE = { right: 'right', left: 'left', down: 'bottom', up: 'top' }

  // Materialize edges: resolve refs, silently dedupe (within call + vs existing)
  const allNodes = [...existing, ...newNodes]
  const byId = new Map(allNodes.map((n) => [n.id, n]))
  const newEdges = []
  const skippedDuplicates = []
  const seenPairs = new Set((row.edges ?? []).map((edge) => (
    `${edge.source}→${edge.target}→${storedEdgeRelationIdentity(edge)}`
  )))
  for (const e of edgeInputs) {
    const source = idMap.get(e.source) ?? e.source
    const target = idMap.get(e.target) ?? e.target
    const sourceNode = byId.get(source)
    const targetNode = byId.get(target)
    const isMemoRelation = sourceNode?.type === 'memo' || targetNode?.type === 'memo'
    const relationType = relationDefinition(e.relationType ?? (isMemoRelation ? 'references' : 'flows_to')).id
    const relationIdentity = edgeRelationIdentity(
      createEdgeRelationData(relationType, e.relationLabel ?? '', true),
      isMemoRelation ? 'references' : 'flows_to',
    )
    const key = `${source}→${target}→${relationIdentity}`
    if (seenPairs.has(key)) { skippedDuplicates.push({ source: e.source, target: e.target }); continue }
    seenPairs.add(key)

    let { sourceHandle, targetHandle } = e
    const srcTmp = e.source
    const tgtTmp = e.target
    const srcInNew = idMap.has(srcTmp)
    const tgtInNew = idMap.has(tgtTmp)

    if (preset === 'radial' && (!sourceHandle || !targetHandle) && srcInNew && tgtInNew) {
      // Radial handle pinning: pin so all children of the same non-root parent
      // leave from the parent's single outward connection point.
      const srcNode = nodeInputs.find((n) => n.tmp_id === srcTmp)
      const tgtNode = nodeInputs.find((n) => n.tmp_id === tgtTmp)
      const bothStages = isStructuralNode(srcNode) && isStructuralNode(tgtNode)

      if (bothStages) {
        const srcLevel = bfsLevel?.get(srcTmp) ?? -1
        const tgtLevel = bfsLevel?.get(tgtTmp) ?? -1
        if (srcLevel < tgtLevel) {
          // source = parent, target = child
          const childDir = layoutDirs.get(tgtTmp)
          if (childDir) {
            const parentDir = srcLevel === 0 ? childDir : layoutDirs.get(srcTmp)
            if (parentDir) {
              if (!sourceHandle) sourceHandle = parentDir
              if (!targetHandle) targetHandle = OPPOSITE[childDir]
            }
          }
        } else if (tgtLevel < srcLevel) {
          // target = parent, source = child
          const childDir = layoutDirs.get(srcTmp)
          if (childDir) {
            const parentDir = tgtLevel === 0 ? childDir : layoutDirs.get(tgtTmp)
            if (parentDir) {
              if (!targetHandle) targetHandle = parentDir
              if (!sourceHandle) sourceHandle = OPPOSITE[childDir]
            }
          }
        }
      } else if (srcNode?.type === 'memo' || tgtNode?.type === 'memo') {
        const memoTmp = srcNode?.type === 'memo' ? srcTmp : tgtTmp
        const facing = layoutMemoFacing.get(memoTmp)
        if (facing) {
          if (srcNode?.type === 'memo') {
            if (!sourceHandle) sourceHandle = facing.memoOwnFacing
            if (!targetHandle) targetHandle = facing.stageFacing
          } else {
            if (!sourceHandle) sourceHandle = facing.stageFacing
            if (!targetHandle) targetHandle = facing.memoOwnFacing
          }
        }
      }
    } else if (FLOW_SIDE[preset] && (!sourceHandle || !targetHandle) && srcInNew && tgtInNew) {
      // Directional preset handle pinning: single connection point on parent's flow side.
      const flowSide = FLOW_SIDE[preset]
      const srcNode = nodeInputs.find((n) => n.tmp_id === srcTmp)
      const tgtNode = nodeInputs.find((n) => n.tmp_id === tgtTmp)
      const bothStages = isStructuralNode(srcNode) && isStructuralNode(tgtNode)

      if (bothStages) {
        const srcLevel = bfsLevel?.get(srcTmp) ?? -1
        const tgtLevel = bfsLevel?.get(tgtTmp) ?? -1
        if (srcLevel < tgtLevel) {
          // source = parent, target = child
          if (!sourceHandle) sourceHandle = flowSide
          if (!targetHandle) targetHandle = OPPOSITE[flowSide]
        } else if (tgtLevel < srcLevel) {
          // target = parent, source = child
          if (!targetHandle) targetHandle = flowSide
          if (!sourceHandle) sourceHandle = OPPOSITE[flowSide]
        }
      } else if (srcNode?.type === 'memo' || tgtNode?.type === 'memo') {
        // Memo pinning for directional presets:
        // right/left flow (horizontal): memos above/below → stage bottom/top, memo top/bottom
        // down/up flow (vertical): memos left/right → stage right/left, memo left/right
        const memoTmp = srcNode?.type === 'memo' ? srcTmp : tgtTmp
        const stageTmp = srcNode?.type === 'memo' ? tgtTmp : srcTmp
        const memoPos = positions.get(memoTmp)
        const stagePos = positions.get(stageTmp)
        if (memoPos && stagePos) {
          const isHorizFlow = preset === 'right' || preset === 'left'
          let stageFacing, memoFacing
          if (isHorizFlow) {
            // memo hangs above or below the stage node
            stageFacing = memoPos.y < stagePos.y ? 'top' : 'bottom'
            memoFacing = OPPOSITE[stageFacing]
          } else {
            // memo hangs left or right of the stage node
            stageFacing = memoPos.x < stagePos.x ? 'left' : 'right'
            memoFacing = OPPOSITE[stageFacing]
          }
          if (srcNode?.type === 'memo') {
            if (!sourceHandle) sourceHandle = memoFacing
            if (!targetHandle) targetHandle = stageFacing
          } else {
            if (!sourceHandle) sourceHandle = stageFacing
            if (!targetHandle) targetHandle = memoFacing
          }
        }
      }
    }

    newEdges.push(buildEdge({ ...e, source, target, sourceHandle, targetHandle }, sourceNode, targetNode))
  }

  await saveArrays(access.ownerId, canvasId, allNodes, [...(row.edges ?? []), ...newEdges], row.updated_at)

  // Radial-only teaching warning: check for per-branch (instead of per-depth) stageTypeIdx usage.
  const warning = preset === 'radial' ? checkRadialLevelMixing(nodeInputs, edgeInputs) : null

  return {
    created_nodes: nodeInputs.map((n) => ({ tmp_id: n.tmp_id, id: idMap.get(n.tmp_id), ...positions.get(n.tmp_id) })),
    created_edges: newEdges.map((edge) => toExternalCanvasEdge(edge)),
    ...(skippedDuplicates.length ? { skipped_duplicate_edges: skippedDuplicates } : {}),
    ...(shifted.length ? { shifted } : {}),
    layout: preset ?? mode,
    ...(warning ? { warning } : {}),
  }
}

export function applyEdgeRelationPatch(edge, patch = {}) {
  const isMemo = !!edge.style?.strokeDasharray
  const fallbackType = isMemo ? 'references' : 'flows_to'
  const current = normalizeEdgeRelationData(edge.data, fallbackType)
  const relationType = patch.relationType ?? current.relationType ?? fallbackType
  const relationLabel = patch.relationLabel ?? current.relationLabel ?? ''
  const explicitlyChanged = patch.relationType != null || patch.relationLabel != null
  const showRelationLabel = patch.showRelationLabel
    ?? (explicitlyChanged ? true : current.relationExplicit === true)
  const data = {
    ...createEdgeRelationData(relationType, relationLabel, showRelationLabel, {
      relationSourceKind: patch.relationSourceKind ?? current.relationSourceKind,
      relationConfidence: patch.relationConfidence ?? current.relationConfidence,
      relationEvidence: patch.relationEvidence ?? current.relationEvidence,
      relationEvidenceRef: patch.relationEvidenceRef ?? current.relationEvidenceRef,
    }),
    ...(current.partsLink ? { partsLink: true } : {}),
  }
  const relation = edgeRelationInfo(data, fallbackType)
  const style = isMemo
    ? { ...edge.style, ...NOTE_STYLE }
    : {
        ...edge.style,
        ...FLOW_STYLE,
        ...(relation.explicit ? { stroke: relation.color } : {}),
      }
  return {
    ...edge,
    data,
    style,
    markerEnd: isMemo || !relation.directed
      ? undefined
      : { type: 'arrowclosed', color: style.stroke },
  }
}

export async function updateEdge(userId, canvasId, edgeId, patch) {
  const access = await resolveCanvasAccess(userId, canvasId)
  const row = access.row
  const edges = [...(row.edges ?? [])]
  const index = edges.findIndex((edge) => edge.id === edgeId)
  if (index < 0) throw new Error(`연결선을 찾을 수 없습니다: ${edgeId}`)
  const edge = edges[index]
  assertRegionEdit(access, row.nodes, { kind: 'edge', source: edge.source, target: edge.target })
  if (edge.data?.partsLink === true || (edge.sourceHandle?.startsWith('p-') && edge.targetHandle?.startsWith('p-'))) {
    throw new Error('파트 연결선은 고정된 연결 의미를 사용합니다.')
  }
  edges[index] = applyEdgeRelationPatch(edge, patch)
  await saveArrays(access.ownerId, canvasId, row.nodes ?? [], edges, row.updated_at)
  return toExternalCanvasEdge(edges[index])
}

export async function updateEdges(userId, canvasId, patches) {
  const access = await resolveCanvasAccess(userId, canvasId)
  const row = access.row
  const edges = [...(row.edges ?? [])]
  const byId = new Map(edges.map((edge, index) => [edge.id, index]))
  const missing = patches.filter((patch) => !byId.has(patch.edge_id)).map((patch) => patch.edge_id)
  if (missing.length) throw new Error(`연결선을 찾을 수 없습니다: ${missing.join(', ')}. get_canvas로 현재 edge id를 확인하세요.`)

  for (const patch of patches) {
    const index = byId.get(patch.edge_id)
    const edge = edges[index]
    assertRegionEdit(access, row.nodes, { kind: 'edge', source: edge.source, target: edge.target })
    if (edge.data?.partsLink === true || (edge.sourceHandle?.startsWith('p-') && edge.targetHandle?.startsWith('p-'))) {
      throw new Error(`파트 연결선은 관계를 바꿀 수 없습니다: ${edge.id}`)
    }
  }
  for (const patch of patches) {
    const index = byId.get(patch.edge_id)
    edges[index] = applyEdgeRelationPatch(edges[index], patch)
  }
  await saveArrays(access.ownerId, canvasId, row.nodes ?? [], edges, row.updated_at)
  return { updated: patches.map((patch) => patch.edge_id), count: patches.length }
}

export async function deleteEdge(userId, canvasId, edgeId) {
  const access = await resolveCanvasAccess(userId, canvasId)
  const row = access.row
  const target = (row.edges ?? []).find((e) => e.id === edgeId)
  if (!target) throw new Error(`연결선을 찾을 수 없습니다: ${edgeId}`)
  assertRegionEdit(access, row.nodes, { kind: 'edge', source: target.source, target: target.target })
  const edges = (row.edges ?? []).filter((e) => e.id !== edgeId)
  await saveArrays(access.ownerId, canvasId, row.nodes ?? [], edges, row.updated_at)
  return { deleted: edgeId, remaining_edges: edges.length }
}

export async function inspectSourceTwin(userId, {
  perspective = 'all',
  query = '',
  limit = 200,
} = {}) {
  const [{ currentSourceTwinState, requireSourceTwinOwner }, { sourceTwinEntities }] = await Promise.all([
    import('./sourceTwinStore.js'),
    import('../shared/sourceTwin.js'),
  ])
  requireSourceTwinOwner(userId, process.env.WORKFLOW_CANVAS_OWNER_USER_ID)
  const state = await currentSourceTwinState(admin())
  const entities = sourceTwinEntities(state.manifest, { perspective, query, limit })
  const entityIds = new Set(entities.map((entity) => entity.id))
  const relations = (state.manifest.relations ?? [])
    .filter((relation) => entityIds.has(relation.source) && entityIds.has(relation.target))
    .slice(0, 2_000)
  return {
    mode: 'read-only-source-twin',
    writes_performed: false,
    source: state.manifest.source,
    manifest_id: state.manifest.id,
    summary: state.manifest.summary,
    perspective,
    query,
    entities,
    relations,
    change_set: state.manifest.changeSet,
    deployment: state.deployment,
    database: state.database,
    operations: state.operations,
    runtime: state.runtime,
    privacy: state.privacy,
    webhook_configured: state.webhookConfigured,
    recent_events: state.events,
    source_content_included: false,
    credential_values_included: false,
  }
}

export async function getSourceTwinHistory(userId, limit = 30) {
  const { listSourceTwinSnapshots, requireSourceTwinOwner } = await import('./sourceTwinStore.js')
  requireSourceTwinOwner(userId, process.env.WORKFLOW_CANVAS_OWNER_USER_ID)
  return {
    mode: 'read-only-source-twin-history',
    writes_performed: false,
    ...(await listSourceTwinSnapshots(admin(), limit)),
    evidence_scope: 'internal-append-only-database-history',
    external_immutability_proof: false,
  }
}

export async function compareSourceTwinHistory(userId, fromSnapshotId, toSnapshotId) {
  const { compareStoredSourceTwinSnapshots, requireSourceTwinOwner } = await import('./sourceTwinStore.js')
  requireSourceTwinOwner(userId, process.env.WORKFLOW_CANVAS_OWNER_USER_ID)
  return {
    mode: 'read-only-source-twin-comparison',
    writes_performed: false,
    comparison: await compareStoredSourceTwinSnapshots(admin(), fromSnapshotId, toSnapshotId),
    evidence_scope: 'internal-append-only-database-history',
    external_immutability_proof: false,
  }
}

export async function previewSourceTwinSnapshot(userId) {
  const { previewSourceTwinSnapshotOperation, requireSourceTwinOwner } = await import('./sourceTwinStore.js')
  requireSourceTwinOwner(userId, process.env.WORKFLOW_CANVAS_OWNER_USER_ID)
  return previewSourceTwinSnapshotOperation(admin(), { actorUserId: userId })
}

export async function applySourceTwinSnapshot(userId, planToken, confirmation) {
  const { applySourceTwinSnapshotOperation, requireSourceTwinOwner } = await import('./sourceTwinStore.js')
  requireSourceTwinOwner(userId, process.env.WORKFLOW_CANVAS_OWNER_USER_ID)
  return applySourceTwinSnapshotOperation(admin(), {
    actorUserId: userId,
    planToken,
    confirmation,
  })
}
