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
const clampColor = (c, max) => Math.min(Math.max(Number.isInteger(c) ? c : 0, 0), max)

const FLOW_STYLE = { stroke: '#4a4a5a', strokeWidth: 2 }
const NOTE_STYLE = { stroke: '#f59e0b88', strokeWidth: 1.5, strokeDasharray: '5,4' }

// Default stage types and palette (mirrors frontend defaults in src/App.jsx)
export const DEFAULT_STAGE_TYPES = [
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

// Map a Bearer token to a user id. Returns null when unauthenticated.
export async function resolveUser(token) {
  if (!token) return null
  const db = admin()
  const { data } = await db.from('mcp_tokens').select('user_id').eq('token', token).maybeSingle()
  if (data?.user_id) return data.user_id
  const { data: u } = await db.auth.getUser(token)
  return u?.user?.id ?? null
}

// ── Stage-type tools ──────────────────────────────────────────────────────────

export async function getStageTypes(userId) {
  const { data } = await admin()
    .from('user_prefs')
    .select('stage_types')
    .eq('user_id', userId)
    .maybeSingle()
  const list = data?.stage_types
  if (!list || !Array.isArray(list) || list.length === 0) return DEFAULT_STAGE_TYPES
  return list
}

export async function renameStageType(userId, index, label) {
  const list = [...(await getStageTypes(userId))]
  if (index < 0 || index >= list.length) throw new Error(`유효하지 않은 index입니다. 0–${list.length - 1} 범위여야 합니다.`)
  const trimmed = label?.trim()
  if (!trimmed) throw new Error('label이 비어 있습니다.')
  list[index] = { ...list[index], label: trimmed }
  await admin().from('user_prefs').upsert({ user_id: userId, stage_types: list }, { onConflict: 'user_id' })
  return list
}

export async function addStageType(userId, label) {
  const list = [...(await getStageTypes(userId))]
  const trimmed = label?.trim()
  if (!trimmed) throw new Error('label이 비어 있습니다.')
  const palette = TYPE_PALETTE[list.length % TYPE_PALETTE.length]
  list.push({ id: `type-${Date.now()}`, ...palette, label: trimmed })
  await admin().from('user_prefs').upsert({ user_id: userId, stage_types: list }, { onConflict: 'user_id' })
  return list
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
    nodes: (row.nodes ?? []).map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      ...(n.type === 'memo'
        ? { header: n.data?.header ?? '', text: n.data?.text ?? '' }
        : { label: n.data?.label ?? '', description: n.data?.description ?? '', colorIdx: n.data?.colorIdx ?? 0 }),
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

  let colorIdx = 0
  if (opts.type !== 'memo' && opts.colorIdx != null) {
    const stageTypes = await getStageTypes(userId)
    colorIdx = clampColor(opts.colorIdx, stageTypes.length - 1)
  }

  const node = opts.type === 'memo'
    ? { id, type: 'memo', position, data: { header: opts.header ?? '', text: opts.text ?? '' } }
    : { id, type: 'stage', position, data: { label: opts.label ?? '새 단계', description: opts.description ?? '', colorIdx } }
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
  if (patch.colorIdx != null) {
    const stageTypes = await getStageTypes(userId)
    data.colorIdx = clampColor(patch.colorIdx, stageTypes.length - 1)
  }
  if (patch.header != null) data.header = patch.header
  if (patch.text != null) data.text = patch.text
  const position = { ...n.position }
  if (Number.isFinite(patch.x)) position.x = patch.x
  if (Number.isFinite(patch.y)) position.y = patch.y
  nodes[idx] = { ...n, position, data }
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
  const edge = {
    id: newEdgeId(),
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
    ...(targetHandle ? { targetHandle } : {}),
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
