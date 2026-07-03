// Supabase access layer for the MCP server.
//
// Runs server-side only (Vercel function). Uses the service-role key, so RLS is
// bypassed — every query is therefore scoped manually by the authenticated
// user id. A request is authenticated by a personal access token (Bearer) that
// maps to a user id via the `mcp_tokens` table; a raw Supabase access token
// (JWT) is also accepted as a fallback.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tuaifwiigkacrflbhjmu.supabase.co'
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

let _admin
function admin() {
  if (!SERVICE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.')
  if (!_admin) _admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  return _admin
}

const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
const newNodeId = () => `n-${uid()}`
const newEdgeId = () => `e-${uid()}`
// 상한 없음: 종류 목록 길이는 사용자마다 다른 동적 값이라 서버에서 강제하지 않는다
// (프런트엔드가 렌더 시 stageTypes.length-1로 안전하게 클램프함).
const clampStageTypeIdx = (c) => Math.max(Number.isInteger(c) ? c : 0, 0)

// 단계 종류(stage type) 기본값/팔레트 — src/App.jsx의 DEFAULT_STAGE_TYPES/TYPE_PALETTE와 동일
const DEFAULT_STAGE_TYPES = [
  { id: 'plan',   bg: '#1e3a5f', border: '#3b82f6', label: '기획' },
  { id: 'dev',    bg: '#1a3a2a', border: '#22c55e', label: '개발' },
  { id: 'review', bg: '#3a1a1a', border: '#ef4444', label: '검토' },
  { id: 'deploy', bg: '#2d2a1a', border: '#f59e0b', label: '배포' },
  { id: 'done',   bg: '#2a1a3a', border: '#a855f7', label: '완료' },
]
const TYPE_PALETTE = [
  { bg: '#1e3a5f', border: '#3b82f6' }, { bg: '#1a3a2a', border: '#22c55e' },
  { bg: '#3a1a1a', border: '#ef4444' }, { bg: '#2d2a1a', border: '#f59e0b' },
  { bg: '#2a1a3a', border: '#a855f7' }, { bg: '#1a2a3a', border: '#06b6d4' },
  { bg: '#2a1a2a', border: '#ec4899' }, { bg: '#2a2a1a', border: '#84cc16' },
]

const FLOW_STYLE = { stroke: '#4a4a5a', strokeWidth: 2 }
const NOTE_STYLE = { stroke: '#f59e0b88', strokeWidth: 1.5, strokeDasharray: '5,4' }

// 명시적 크기가 없을 때의 기본/최소 렌더 크기 (StageNode/MemoNode의 minWidth/minHeight와 정합)
const SIZE = {
  stage: { w: 220, h: 90, minW: 200, minH: 80 },
  memo:  { w: 180, h: 90, minW: 160, minH: 80 },
}
const clampSize = (type, w, h) => {
  const s = SIZE[type] ?? SIZE.stage
  return {
    width:  Number.isFinite(w) ? Math.max(w, s.minW) : undefined,
    height: Number.isFinite(h) ? Math.max(h, s.minH) : undefined,
  }
}
const nodeW = (n) => n.width  ?? SIZE[n.type]?.w ?? SIZE.stage.w
const nodeH = (n) => n.height ?? SIZE[n.type]?.h ?? SIZE.stage.h

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
  const { data } = await db.from('mcp_tokens').select('user_id').eq('token', token).maybeSingle()
  if (data?.user_id) return data.user_id
  const { data: u } = await db.auth.getUser(token)
  return u?.user?.id ?? null
}

const toExternal = (types) => types.map((t, i) => ({ stageTypeIdx: i, label: t.label, color: t.border }))

// ── Canvas-level ─────────────────────────────────────────────────────────────
export async function listCanvases(userId) {
  const { data, error } = await admin()
    .from('canvases')
    .select('canvas_id, name, nodes, edges, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({
    canvas_id: r.canvas_id,
    name: r.name,
    node_count: (r.nodes ?? []).length,
    edge_count: (r.edges ?? []).length,
    updated_at: r.updated_at,
  }))
}

async function getRow(userId, canvasId) {
  const { data, error } = await admin()
    .from('canvases')
    .select('*')
    .eq('user_id', userId)
    .eq('canvas_id', canvasId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error(`캔버스를 찾을 수 없습니다: ${canvasId}`)
  return data
}

// ── Stage types (per-canvas: canvases.stage_types) ──────────────────────────
// Each canvas owns its own list, independent of every other canvas. A new
// canvas (or one that never customized types) has stage_types = null and
// falls back to DEFAULT_STAGE_TYPES.
function rowStageTypes(row) {
  return (row.stage_types?.length) ? row.stage_types : DEFAULT_STAGE_TYPES
}

export async function getStageTypes(userId, canvasId) {
  const row = await getRow(userId, canvasId)
  return toExternal(rowStageTypes(row))
}

export async function createStageType(userId, canvasId, label) {
  const row = await getRow(userId, canvasId)
  const types = rowStageTypes(row)
  const palette = TYPE_PALETTE[types.length % TYPE_PALETTE.length]
  const next = [...types, { id: `type-${uid()}`, ...palette, label: label?.trim() || '새 종류' }]
  const { error } = await admin().from('canvases').update({ stage_types: next }).eq('user_id', userId).eq('canvas_id', canvasId)
  if (error) throw new Error(error.message)
  return toExternal(next)[next.length - 1]
}

export async function renameStageType(userId, canvasId, stageTypeIdx, label) {
  const row = await getRow(userId, canvasId)
  const types = rowStageTypes(row)
  if (stageTypeIdx < 0 || stageTypeIdx >= types.length) throw new Error(`단계 종류를 찾을 수 없습니다: ${stageTypeIdx}`)
  if (!label?.trim()) throw new Error('이름은 비어있을 수 없습니다.')
  const next = types.map((t, i) => (i === stageTypeIdx ? { ...t, label: label.trim() } : t))
  const { error } = await admin().from('canvases').update({ stage_types: next }).eq('user_id', userId).eq('canvas_id', canvasId)
  if (error) throw new Error(error.message)
  return toExternal(next)[stageTypeIdx]
}

export async function deleteStageType(userId, canvasId, stageTypeIdx) {
  const row = await getRow(userId, canvasId)
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
  const { error } = await admin().from('canvases').update({ stage_types: next, nodes: reindexed }).eq('user_id', userId).eq('canvas_id', canvasId)
  if (error) throw new Error(error.message)
  return toExternal(next)
}

export async function getCanvas(userId, canvasId) {
  const row = await getRow(userId, canvasId)
  return {
    canvas_id: row.canvas_id,
    name: row.name,
    stage_types: toExternal(rowStageTypes(row)),
    nodes: (row.nodes ?? []).map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      width: nodeW(n),
      height: nodeH(n),
      ...(n.type === 'memo'
        ? { header: n.data?.header ?? '', text: n.data?.text ?? '' }
        : { label: n.data?.label ?? '', description: n.data?.description ?? '', stageTypeIdx: n.data?.colorIdx ?? 0 }),
    })),
    edges: (row.edges ?? []).map((e) => ({ id: e.id, source: e.source, target: e.target })),
  }
}

async function saveArrays(userId, canvasId, nodes, edges) {
  const { error } = await admin()
    .from('canvases')
    .update({ nodes, edges, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('canvas_id', canvasId)
  if (error) throw new Error(error.message)
}

export async function createCanvas(userId, name) {
  const canvasId = `c-${uid()}`
  const { error } = await admin().from('canvases').insert({
    user_id: userId, canvas_id: canvasId, name: name || '새 캔버스', nodes: [], edges: [],
  })
  if (error) throw new Error(error.message)
  return { canvas_id: canvasId, name: name || '새 캔버스' }
}

export async function clearCanvas(userId, canvasId) {
  await getRow(userId, canvasId) // ownership / existence check
  await saveArrays(userId, canvasId, [], [])
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
export async function createNode(userId, canvasId, opts) {
  const row = await getRow(userId, canvasId)
  const nodes = row.nodes ?? []
  const id = newNodeId()
  const position = (Number.isFinite(opts.x) && Number.isFinite(opts.y))
    ? { x: opts.x, y: opts.y }
    : (Number.isFinite(opts.x) || Number.isFinite(opts.y))
      ? { x: Number.isFinite(opts.x) ? opts.x : findFreePosition(nodes).x, y: Number.isFinite(opts.y) ? opts.y : findFreePosition(nodes).y }
      : findFreePosition(nodes)

  const size = clampSize(opts.type, opts.width, opts.height)
  const base = { id, type: opts.type, position }
  if (size.width != null) base.width = size.width
  if (size.height != null) base.height = size.height
  const node = opts.type === 'memo'
    ? { ...base, data: { header: opts.header ?? '', text: opts.text ?? '' } }
    : { ...base, data: { label: opts.label ?? '새 단계', description: opts.description ?? '', colorIdx: clampStageTypeIdx(opts.stageTypeIdx ?? opts.colorIdx) } }
  await saveArrays(userId, canvasId, [...nodes, node], row.edges ?? [])
  return node
}

export async function updateNode(userId, canvasId, nodeId, patch) {
  const row = await getRow(userId, canvasId)
  const nodes = [...(row.nodes ?? [])]
  const idx = nodes.findIndex((n) => n.id === nodeId)
  if (idx < 0) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`)
  const n = nodes[idx]
  const data = { ...n.data }
  if (patch.label != null) data.label = patch.label
  if (patch.description != null) data.description = patch.description
  if (patch.stageTypeIdx != null || patch.colorIdx != null) data.colorIdx = clampStageTypeIdx(patch.stageTypeIdx ?? patch.colorIdx)
  if (patch.header != null) data.header = patch.header
  if (patch.text != null) data.text = patch.text
  const position = { ...n.position }
  if (Number.isFinite(patch.x)) position.x = patch.x
  if (Number.isFinite(patch.y)) position.y = patch.y
  const next = { ...n, position, data }
  const size = clampSize(n.type, patch.width, patch.height)
  if (size.width != null) next.width = size.width
  if (size.height != null) next.height = size.height
  nodes[idx] = next
  await saveArrays(userId, canvasId, nodes, row.edges ?? [])
  return nodes[idx]
}

export async function deleteNode(userId, canvasId, nodeId) {
  const row = await getRow(userId, canvasId)
  if (!(row.nodes ?? []).some((n) => n.id === nodeId)) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`)
  const nodes = (row.nodes ?? []).filter((n) => n.id !== nodeId)
  const edges = (row.edges ?? []).filter((e) => e.source !== nodeId && e.target !== nodeId)
  await saveArrays(userId, canvasId, nodes, edges)
  return { deleted: nodeId, remaining_nodes: nodes.length }
}

// ── Edge-level ───────────────────────────────────────────────────────────────
export async function createEdge(userId, canvasId, { source, target, sourceHandle, targetHandle }) {
  const row = await getRow(userId, canvasId)
  const nodes = row.nodes ?? []
  const sNode = nodes.find((n) => n.id === source)
  const tNode = nodes.find((n) => n.id === target)
  if (!sNode) throw new Error(`출발 노드를 찾을 수 없습니다: ${source}`)
  if (!tNode) throw new Error(`도착 노드를 찾을 수 없습니다: ${target}`)
  const isMemo = sNode.type === 'memo' || tNode.type === 'memo'
  // Fill in whichever handle the caller didn't pin, from actual node positions —
  // avoids the AI mechanically repeating the same side regardless of real layout.
  const auto = (!sourceHandle || !targetHandle) ? closestHandles(sNode, tNode) : {}
  const edge = {
    id: newEdgeId(),
    source,
    target,
    sourceHandle: sourceHandle || auto.sourceHandle,
    targetHandle: targetHandle || auto.targetHandle,
    style: isMemo ? NOTE_STYLE : FLOW_STYLE,
    markerEnd: { type: 'arrowclosed', color: isMemo ? '#f59e0b88' : '#4a4a5a' },
  }
  await saveArrays(userId, canvasId, nodes, [...(row.edges ?? []), edge])
  return edge
}

export async function deleteEdge(userId, canvasId, edgeId) {
  const row = await getRow(userId, canvasId)
  if (!(row.edges ?? []).some((e) => e.id === edgeId)) throw new Error(`연결선을 찾을 수 없습니다: ${edgeId}`)
  const edges = (row.edges ?? []).filter((e) => e.id !== edgeId)
  await saveArrays(userId, canvasId, row.nodes ?? [], edges)
  return { deleted: edgeId, remaining_edges: edges.length }
}
