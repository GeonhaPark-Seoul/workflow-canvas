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

// Map a Bearer token to a user id. Returns null when unauthenticated.
export async function resolveUser(token) {
  if (!token) return null
  const db = admin()
  const { data } = await db.from('mcp_tokens').select('user_id').eq('token', token).maybeSingle()
  if (data?.user_id) return data.user_id
  const { data: u } = await db.auth.getUser(token)
  return u?.user?.id ?? null
}

// ── Stage types (user_prefs.stage_types) ────────────────────────────────────
async function loadPrefsRow(userId) {
  const { data, error } = await admin()
    .from('user_prefs')
    .select('stage_types')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  const list = data?.stage_types
  if (!list || !Array.isArray(list) || list.length === 0) return DEFAULT_STAGE_TYPES
  return list
}

async function saveStageTypesRow(userId, types) {
  const { error } = await admin()
    .from('user_prefs')
    .upsert({ user_id: userId, stage_types: types }, { onConflict: 'user_id' })
  if (error) throw new Error(error.message)
}

const toExternal = (types) => types.map((t, i) => ({ stageTypeIdx: i, label: t.label, color: t.border }))

export async function getStageTypes(userId) {
  return toExternal(await loadPrefsRow(userId))
}

export async function createStageType(userId, label) {
  const types = await loadPrefsRow(userId)
  const palette = TYPE_PALETTE[types.length % TYPE_PALETTE.length]
  const next = [...types, { id: `type-${uid()}`, ...palette, label: label?.trim() || '새 종류' }]
  await saveStageTypesRow(userId, next)
  return toExternal(next)[next.length - 1]
}

export async function renameStageType(userId, stageTypeIdx, label) {
  const types = await loadPrefsRow(userId)
  if (stageTypeIdx < 0 || stageTypeIdx >= types.length) throw new Error(`단계 종류를 찾을 수 없습니다: ${stageTypeIdx}`)
  if (!label?.trim()) throw new Error('이름은 비어있을 수 없습니다.')
  const next = types.map((t, i) => (i === stageTypeIdx ? { ...t, label: label.trim() } : t))
  await saveStageTypesRow(userId, next)
  return toExternal(next)[stageTypeIdx]
}

export async function deleteStageType(userId, stageTypeIdx) {
  const types = await loadPrefsRow(userId)
  if (stageTypeIdx < 0 || stageTypeIdx >= types.length) throw new Error(`단계 종류를 찾을 수 없습니다: ${stageTypeIdx}`)
  if (types.length <= 1) throw new Error('최소 1개의 단계 종류는 남아있어야 합니다.')
  const next = types.filter((_, i) => i !== stageTypeIdx)
  await saveStageTypesRow(userId, next)

  // 이 종류를 쓰던 모든 캔버스의 노드를 재색인 (삭제된 인덱스→0, 그보다 큰 인덱스→-1)
  const { data: rows, error } = await admin()
    .from('canvases')
    .select('canvas_id, nodes')
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
  for (const row of rows ?? []) {
    const nodes = row.nodes ?? []
    let touched = false
    const reindexed = nodes.map((n) => {
      if (n.type !== 'stage') return n
      const ci = n.data?.colorIdx ?? 0
      if (ci === stageTypeIdx) { touched = true; return { ...n, data: { ...n.data, colorIdx: 0 } } }
      if (ci > stageTypeIdx) { touched = true; return { ...n, data: { ...n.data, colorIdx: ci - 1 } } }
      return n
    })
    if (touched) {
      const { error: uErr } = await admin()
        .from('canvases')
        .update({ nodes: reindexed })
        .eq('user_id', userId)
        .eq('canvas_id', row.canvas_id)
      if (uErr) throw new Error(uErr.message)
    }
  }
  return toExternal(next)
}

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

export async function getCanvas(userId, canvasId) {
  const row = await getRow(userId, canvasId)
  return {
    canvas_id: row.canvas_id,
    name: row.name,
    stage_types: await getStageTypes(userId),
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
export async function createEdge(userId, canvasId, { source, target }) {
  const row = await getRow(userId, canvasId)
  const nodes = row.nodes ?? []
  const sNode = nodes.find((n) => n.id === source)
  const tNode = nodes.find((n) => n.id === target)
  if (!sNode) throw new Error(`출발 노드를 찾을 수 없습니다: ${source}`)
  if (!tNode) throw new Error(`도착 노드를 찾을 수 없습니다: ${target}`)
  const isMemo = sNode.type === 'memo' || tNode.type === 'memo'
  const edge = {
    id: newEdgeId(),
    source,
    target,
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
