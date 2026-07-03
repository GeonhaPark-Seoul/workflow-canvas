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
const clampColor = (c) => Math.min(Math.max(Number.isInteger(c) ? c : 0, 0), 4)

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
      width: nodeW(n),
      height: nodeH(n),
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

// ── Node-level ───────────────────────────────────────────────────────────────
export async function createNode(userId, canvasId, opts) {
  const row = await getRow(userId, canvasId)
  const nodes = row.nodes ?? []
  const id = newNodeId()
  // 좌표 생략 시 겹치지 않게 배치: 빈 캔버스는 (80, 320), 아니면 기존 노드들
  // 오른쪽 끝에서 한 칸 띄운 위치에 대표 y(첫 stage, 없으면 320)로 정렬.
  const autoPos = () => {
    if (!nodes.length) return { x: 80, y: 320 }
    const rightEdge = Math.max(...nodes.map((n) => (n.position?.x ?? 0) + nodeW(n)))
    const baseY = (nodes.find((n) => n.type === 'stage') ?? nodes[0]).position?.y ?? 320
    return { x: rightEdge + 80, y: baseY }
  }
  const auto = (Number.isFinite(opts.x) && Number.isFinite(opts.y)) ? null : autoPos()
  const position = {
    x: Number.isFinite(opts.x) ? opts.x : auto.x,
    y: Number.isFinite(opts.y) ? opts.y : auto.y,
  }
  const size = clampSize(opts.type, opts.width, opts.height)
  const base = { id, type: opts.type, position }
  if (size.width != null) base.width = size.width
  if (size.height != null) base.height = size.height
  const node = opts.type === 'memo'
    ? { ...base, data: { header: opts.header ?? '', text: opts.text ?? '' } }
    : { ...base, data: { label: opts.label ?? '새 단계', description: opts.description ?? '', colorIdx: clampColor(opts.colorIdx) } }
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
  if (patch.colorIdx != null) data.colorIdx = clampColor(patch.colorIdx)
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
  const edge = {
    id: newEdgeId(),
    source,
    target,
    ...(sourceHandle ? { sourceHandle } : {}),
    ...(targetHandle ? { targetHandle } : {}),
    type: 'separable',
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
