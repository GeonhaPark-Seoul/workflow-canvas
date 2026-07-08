// Supabase access layer for the MCP server.
//
// Runs server-side only (Vercel function). Uses the service-role key, so RLS is
// bypassed — every query is therefore scoped manually by the authenticated
// user id. A request is authenticated by a personal access token (Bearer) that
// maps to a user id via the `mcp_tokens` table; a raw Supabase access token
// (JWT) is also accepted as a fallback.
import { createClient } from '@supabase/supabase-js'
import { sanitizeTextFields } from './sanitize.js'
import {
  SIZE, nodeW, nodeH, nodeRect, overlaps, findNonOverlapping,
  layoutGraph, validateGraphInput, radialLevels,
} from './layout.js'

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

const findDuplicateEdge = (edges, source, target) =>
  (edges ?? []).find((e) => e.source === source && e.target === target)

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
      dimmed: n.data?.dimmed ?? false,
      ...(n.type === 'memo'
        ? { header: n.data?.header ?? '', text: n.data?.text ?? '' }
        : { label: n.data?.label ?? '', description: n.data?.description ?? '', stageTypeIdx: n.data?.colorIdx ?? 0 }),
    })),
    edges: (row.edges ?? []).map((e) => ({
      id: e.id, source: e.source, target: e.target,
      ...(e.sourceHandle ? { sourceHandle: e.sourceHandle } : {}),
      ...(e.targetHandle ? { targetHandle: e.targetHandle } : {}),
    })),
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
  await getRow(userId, canvasId) // ownership / existence check
  const { error } = await admin().from('canvases').update({ name: trimmed }).eq('user_id', userId).eq('canvas_id', canvasId)
  if (error) throw new Error(error.message)
  const prefs = await loadPrefs(userId)
  if (prefs?.canvas_order?.some((c) => c.id === canvasId)) {
    await savePrefs(userId, {
      canvas_order: prefs.canvas_order.map((c) => (c.id === canvasId ? { ...c, name: trimmed } : c)),
    })
  }
  return { canvas_id: canvasId, name: trimmed }
}

export async function deleteCanvasRow(userId, canvasId) {
  await getRow(userId, canvasId) // ownership / existence check
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
  return opts.type === 'memo'
    ? { ...base, data: { header: opts.header ?? '', text: opts.text ?? '', ...dimmed } }
    : {
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
  const row = await getRow(userId, canvasId)
  const nodes = row.nodes ?? []
  sanitizeTextFields(opts)
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
  await saveArrays(userId, canvasId, [...nodes, node], row.edges ?? [])
  return shifted ? { ...node, shifted } : node
}

// Per-node patch application, shared by updateNode and updateNodes.
function applyPatch(n, patch, types) {
  sanitizeTextFields(patch)
  const data = { ...n.data }
  if (patch.label != null) data.label = patch.label
  if (patch.description != null) data.description = patch.description
  if (patch.stageTypeIdx != null || patch.colorIdx != null) data.colorIdx = assertStageTypeIdx(types, patch.stageTypeIdx ?? patch.colorIdx)
  if (patch.header != null) data.header = patch.header
  if (patch.text != null) data.text = patch.text
  if (patch.dimmed != null) data.dimmed = patch.dimmed === true
  const position = { ...n.position }
  if (Number.isFinite(patch.x)) position.x = patch.x
  if (Number.isFinite(patch.y)) position.y = patch.y
  const next = { ...n, position, data }
  const size = clampSize(n.type, patch.width, patch.height)
  if (size.width != null) next.width = size.width
  if (size.height != null) next.height = size.height
  return next
}

export async function updateNode(userId, canvasId, nodeId, patch) {
  const row = await getRow(userId, canvasId)
  const nodes = [...(row.nodes ?? [])]
  const idx = nodes.findIndex((n) => n.id === nodeId)
  if (idx < 0) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`)
  nodes[idx] = applyPatch(nodes[idx], patch, rowStageTypes(row))
  await saveArrays(userId, canvasId, nodes, row.edges ?? [])
  return nodes[idx]
}

// Bulk update: all node_ids must exist (fail-all before any write), one save.
export async function updateNodes(userId, canvasId, patches) {
  const row = await getRow(userId, canvasId)
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
  await saveArrays(userId, canvasId, nodes, row.edges ?? [])
  return { updated: patches.map((p) => p.node_id), count: patches.length }
}

export async function deleteNode(userId, canvasId, nodeId) {
  const row = await getRow(userId, canvasId)
  if (!(row.nodes ?? []).some((n) => n.id === nodeId)) throw new Error(`노드를 찾을 수 없습니다: ${nodeId}`)
  const nodes = (row.nodes ?? []).filter((n) => n.id !== nodeId)
  const edges = (row.edges ?? []).filter((e) => e.source !== nodeId && e.target !== nodeId)
  await saveArrays(userId, canvasId, nodes, edges)
  return { deleted: nodeId, remaining_nodes: nodes.length }
}

// Bulk delete: idempotent-friendly — deletes what it finds, reports the rest.
export async function deleteNodes(userId, canvasId, nodeIds) {
  const row = await getRow(userId, canvasId)
  const ids = new Set(nodeIds)
  const found = (row.nodes ?? []).filter((n) => ids.has(n.id)).map((n) => n.id)
  if (!found.length) throw new Error(`노드를 찾을 수 없습니다: ${nodeIds.join(', ')}. get_canvas로 현재 노드 id를 확인하세요.`)
  const foundSet = new Set(found)
  const nodes = (row.nodes ?? []).filter((n) => !foundSet.has(n.id))
  const edges = (row.edges ?? []).filter((e) => !foundSet.has(e.source) && !foundSet.has(e.target))
  await saveArrays(userId, canvasId, nodes, edges)
  return {
    deleted: found,
    not_found: nodeIds.filter((id) => !foundSet.has(id)),
    remaining_nodes: nodes.length,
  }
}

// ── Edge-level ───────────────────────────────────────────────────────────────
export async function createEdge(userId, canvasId, { source, target, sourceHandle, targetHandle }) {
  const row = await getRow(userId, canvasId)
  const nodes = row.nodes ?? []
  const sNode = nodes.find((n) => n.id === source)
  const tNode = nodes.find((n) => n.id === target)
  if (!sNode) throw new Error(`출발 노드를 찾을 수 없습니다: ${source}`)
  if (!tNode) throw new Error(`도착 노드를 찾을 수 없습니다: ${target}`)
  const dup = findDuplicateEdge(row.edges, source, target)
  if (dup) {
    throw new Error(
      `이미 같은 방향의 연결이 있습니다 (edge_id: ${dup.id}). 중복 연결은 대부분 실수입니다 — ` +
      '정말 평행선이 필요하면 먼저 delete_edge로 기존 것을 지우세요.')
  }
  const edge = buildEdge({ source, target, sourceHandle, targetHandle }, sNode, tNode)
  await saveArrays(userId, canvasId, nodes, [...(row.edges ?? []), edge])
  return edge
}

// Shared edge construction (createEdge + createGraph): memo links are dashed,
// missing handles are auto-computed from the two nodes' final positions.
function buildEdge({ source, target, sourceHandle, targetHandle }, sNode, tNode) {
  const isMemo = sNode.type === 'memo' || tNode.type === 'memo'
  const auto = (!sourceHandle || !targetHandle) ? closestHandles(sNode, tNode) : {}
  return {
    id: newEdgeId(),
    source,
    target,
    sourceHandle: sourceHandle || auto.sourceHandle,
    targetHandle: targetHandle || auto.targetHandle,
    style: isMemo ? NOTE_STYLE : FLOW_STYLE,
    markerEnd: { type: 'arrowclosed', color: isMemo ? '#f59e0b88' : '#4a4a5a' },
  }
}

// Auto heuristic: pick 'radial' when there is exactly one in-degree-0 stage,
// that stage has out-degree ≥ 3, and the total stage count ≥ 5.
function autoPreset(nodeInputs, edgeInputs) {
  const stageIds = new Set(nodeInputs.filter((n) => n.type === 'stage').map((n) => n.tmp_id))
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
  const row = await getRow(userId, canvasId)
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

  // BFS level map (radial): used to determine parent vs child in edge pinning.
  // Built from input edges using the same logic as radialLevels.
  const bfsLevel = preset === 'radial' ? radialLevels(nodeInputs, edgeInputs) : null

  // Opposite handle for a given direction
  const OPPOSITE = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' }

  // Materialize edges: resolve refs, silently dedupe (within call + vs existing)
  const allNodes = [...existing, ...newNodes]
  const byId = new Map(allNodes.map((n) => [n.id, n]))
  const newEdges = []
  const skippedDuplicates = []
  const seenPairs = new Set((row.edges ?? []).map((e) => `${e.source}→${e.target}`))
  for (const e of edgeInputs) {
    const source = idMap.get(e.source) ?? e.source
    const target = idMap.get(e.target) ?? e.target
    const key = `${source}→${target}`
    if (seenPairs.has(key)) { skippedDuplicates.push({ source: e.source, target: e.target }); continue }
    seenPairs.add(key)

    // Radial handle pinning (Task 1): when preset is radial and handles are not
    // explicitly provided, pin them so all children of the same non-root parent
    // leave from the parent's single outward connection point.
    let { sourceHandle, targetHandle } = e
    if (preset === 'radial' && (!sourceHandle || !targetHandle)) {
      const srcTmp = e.source   // original tmp_id (before idMap resolution)
      const tgtTmp = e.target
      const srcInNew = idMap.has(srcTmp)
      const tgtInNew = idMap.has(tgtTmp)

      if (srcInNew && tgtInNew) {
        // Both nodes are from this call — check if this is a stage-stage edge
        const srcNode = nodeInputs.find((n) => n.tmp_id === srcTmp)
        const tgtNode = nodeInputs.find((n) => n.tmp_id === tgtTmp)
        const bothStages = srcNode?.type === 'stage' && tgtNode?.type === 'stage'

        if (bothStages) {
          const srcLevel = bfsLevel?.get(srcTmp) ?? -1
          const tgtLevel = bfsLevel?.get(tgtTmp) ?? -1
          // Determine which is parent (lower level) and which is child
          if (srcLevel < tgtLevel) {
            // source = parent, target = child
            const childDir = layoutDirs.get(tgtTmp)
            if (childDir) {
              const parentIsRoot = srcLevel === 0
              const parentDir = parentIsRoot ? childDir : layoutDirs.get(srcTmp)
              if (parentDir) {
                if (!sourceHandle) sourceHandle = parentDir
                if (!targetHandle) targetHandle = OPPOSITE[childDir]
              }
            }
          } else if (tgtLevel < srcLevel) {
            // target = parent, source = child
            const childDir = layoutDirs.get(srcTmp)
            if (childDir) {
              const parentIsRoot = tgtLevel === 0
              const parentDir = parentIsRoot ? childDir : layoutDirs.get(tgtTmp)
              if (parentDir) {
                if (!targetHandle) targetHandle = parentDir
                if (!sourceHandle) sourceHandle = OPPOSITE[childDir]
              }
            }
          }
        } else if (srcNode?.type === 'memo' || tgtNode?.type === 'memo') {
          // Memo edge pinning: use the facing directions computed by the layout
          const memoTmp = srcNode?.type === 'memo' ? srcTmp : tgtTmp
          const stageTmp = srcNode?.type === 'memo' ? tgtTmp : srcTmp
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
      }
    }

    newEdges.push(buildEdge({ source, target, sourceHandle, targetHandle }, byId.get(source), byId.get(target)))
  }

  await saveArrays(userId, canvasId, allNodes, [...(row.edges ?? []), ...newEdges])

  // Radial-only teaching warning: check for per-branch (instead of per-depth) stageTypeIdx usage.
  const warning = preset === 'radial' ? checkRadialLevelMixing(nodeInputs, edgeInputs) : null

  return {
    created_nodes: nodeInputs.map((n) => ({ tmp_id: n.tmp_id, id: idMap.get(n.tmp_id), ...positions.get(n.tmp_id) })),
    created_edges: newEdges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
    ...(skippedDuplicates.length ? { skipped_duplicate_edges: skippedDuplicates } : {}),
    ...(shifted.length ? { shifted } : {}),
    layout: preset ?? mode,
    ...(warning ? { warning } : {}),
  }
}

export async function deleteEdge(userId, canvasId, edgeId) {
  const row = await getRow(userId, canvasId)
  if (!(row.edges ?? []).some((e) => e.id === edgeId)) throw new Error(`연결선을 찾을 수 없습니다: ${edgeId}`)
  const edges = (row.edges ?? []).filter((e) => e.id !== edgeId)
  await saveArrays(userId, canvasId, row.nodes ?? [], edges)
  return { deleted: edgeId, remaining_edges: edges.length }
}
