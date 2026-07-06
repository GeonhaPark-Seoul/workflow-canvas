// Pure layout/validation helpers for the MCP server — no DB access, unit-testable.
//
// layoutGraph: layered left→right auto-layout for create_graph. Stages are
// topologically layered (cycles tolerated), memos ride above/below their
// linked stage. The whole layout is translated below any existing content so
// it can never overlap what's already on the canvas.

// Default/min render sizes — must match StageNode/MemoNode minWidth/minHeight
export const SIZE = {
  stage: { w: 220, h: 90, minW: 200, minH: 80 },
  memo:  { w: 180, h: 90, minW: 160, minH: 80 },
}

export const nodeW = (n) => n.width  ?? SIZE[n.type]?.w ?? SIZE.stage.w
export const nodeH = (n) => n.height ?? SIZE[n.type]?.h ?? SIZE.stage.h

export function nodeRect(n) {
  return { x: n.position?.x ?? 0, y: n.position?.y ?? 0, w: nodeW(n), h: nodeH(n) }
}

export function overlaps(a, b, padX = 40, padY = 30) {
  return a.x < b.x + b.w + padX && a.x + a.w + padX > b.x &&
         a.y < b.y + b.h + padY && a.y + a.h + padY > b.y
}

// Scan outward from the desired spot in expanding rings (40px steps) for a
// position that doesn't overlap any existing rect. Fallback: below everything.
export function findNonOverlapping(existingRects, desired, w, h) {
  const fits = (x, y) => !existingRects.some((r) => overlaps({ x, y, w, h }, r))
  if (fits(desired.x, desired.y)) return { x: desired.x, y: desired.y, shifted: false }
  const STEP = 40
  for (let ring = 1; ring <= 14; ring++) {
    const d = ring * STEP
    const candidates = [
      [desired.x + d, desired.y], [desired.x - d, desired.y],
      [desired.x, desired.y + d], [desired.x, desired.y - d],
      [desired.x + d, desired.y + d], [desired.x - d, desired.y + d],
      [desired.x + d, desired.y - d], [desired.x - d, desired.y - d],
    ]
    for (const [x, y] of candidates) if (fits(x, y)) return { x, y, shifted: true }
  }
  const maxY = existingRects.reduce((m, r) => Math.max(m, r.y + r.h), 0)
  return { x: desired.x, y: maxY + 160, shifted: true }
}

// Layered auto-layout. newNodes: [{tmp_id, type, width?, height?}], newEdges:
// [{source, target}] where refs may be tmp_ids or existing node ids.
// Returns Map<tmp_id, {x, y}>.
export function layoutGraph({ newNodes, newEdges, existingNodes, colGap = 320, rowGap = 200 }) {
  const pos = new Map()
  const stages = newNodes.filter((n) => n.type === 'stage')
  const memos = newNodes.filter((n) => n.type === 'memo')
  const stageIds = new Set(stages.map((n) => n.tmp_id))

  // ── Stage layering (Kahn, cycle-tolerant) ──────────────────────────────────
  const succ = new Map(stages.map((n) => [n.tmp_id, []]))
  const inDeg = new Map(stages.map((n) => [n.tmp_id, 0]))
  for (const e of newEdges) {
    if (stageIds.has(e.source) && stageIds.has(e.target)) {
      succ.get(e.source).push(e.target)
      inDeg.set(e.target, inDeg.get(e.target) + 1)
    }
  }
  const hasStageEdges = [...inDeg.values()].some((d) => d > 0)

  const layer = new Map()
  if (!hasStageEdges) {
    // No ordering information — grid, rows of 4
    stages.forEach((n, i) => layer.set(n.tmp_id, i % 4))
  } else {
    const remaining = new Map(inDeg)
    const done = new Set()
    let queue = stages.filter((n) => remaining.get(n.tmp_id) === 0).map((n) => n.tmp_id)
    while (done.size < stages.length) {
      if (!queue.length) {
        // Cycle: force-pick the unprocessed stage with the smallest remaining
        // in-degree (input order breaks ties) — its pending edges are back-edges.
        const pick = stages
          .filter((n) => !done.has(n.tmp_id))
          .sort((a, b) => remaining.get(a.tmp_id) - remaining.get(b.tmp_id))[0]
        queue = [pick.tmp_id]
        remaining.set(pick.tmp_id, 0)
      }
      const id = queue.shift()
      if (done.has(id)) continue
      done.add(id)
      if (!layer.has(id)) layer.set(id, 0)
      for (const t of succ.get(id)) {
        if (done.has(t)) continue // back-edge of a broken cycle — ignore
        layer.set(t, Math.max(layer.get(t) ?? 0, layer.get(id) + 1))
        remaining.set(t, remaining.get(t) - 1)
        if (remaining.get(t) === 0) queue.push(t)
      }
    }
  }

  // ── Rows within each layer (barycenter of predecessors, one pass) ──────────
  const pred = new Map(stages.map((n) => [n.tmp_id, []]))
  for (const e of newEdges) {
    if (stageIds.has(e.source) && stageIds.has(e.target)) pred.get(e.target).push(e.source)
  }
  const layers = new Map() // layerIdx -> [tmp_id in input order]
  for (const n of hasStageEdges ? stages : []) {
    const l = layer.get(n.tmp_id)
    if (!layers.has(l)) layers.set(l, [])
    layers.get(l).push(n.tmp_id)
  }
  const row = new Map()
  if (!hasStageEdges) {
    stages.forEach((n, i) => row.set(n.tmp_id, Math.floor(i / 4)))
  } else {
    const sortedLayers = [...layers.keys()].sort((a, b) => a - b)
    for (const l of sortedLayers) {
      const ids = layers.get(l)
      const key = (id) => {
        const ps = pred.get(id).filter((p) => row.has(p))
        if (!ps.length) return ids.indexOf(id)
        return ps.reduce((s, p) => s + row.get(p), 0) / ps.length
      }
      ids.sort((a, b) => key(a) - key(b) || ids.indexOf(a) - ids.indexOf(b))
      ids.forEach((id, i) => row.set(id, i))
    }
  }
  for (const n of stages) {
    pos.set(n.tmp_id, { x: layer.get(n.tmp_id) * colGap, y: row.get(n.tmp_id) * rowGap })
  }

  // ── Memos: ride above/below their linked new stage, alternating ────────────
  const memoCountPerStage = new Map()
  const maxLayer = stages.length ? Math.max(...[...layer.values()], 0) : -1
  let orphanRow = 0
  const existingById = new Map((existingNodes ?? []).map((n) => [n.id, n]))
  const placedRects = () => [
    ...(existingNodes ?? []).map(nodeRect),
    ...[...pos.entries()].map(([id, p]) => {
      const n = newNodes.find((x) => x.tmp_id === id)
      return { x: p.x, y: p.y, w: nodeW(n), h: nodeH(n) }
    }),
  ]
  for (const m of memos) {
    const link = newEdges.find((e) =>
      (e.source === m.tmp_id && pos.has(e.target)) || (e.target === m.tmp_id && pos.has(e.source)))
    if (link) {
      const stageId = link.source === m.tmp_id ? link.target : link.source
      const sp = pos.get(stageId)
      const count = memoCountPerStage.get(stageId) ?? 0
      memoCountPerStage.set(stageId, count + 1)
      const side = count % 2 === 0 ? -1 : 1 // above first, then below
      const distance = rowGap * 0.7 * (Math.floor(count / 2) + 1)
      pos.set(m.tmp_id, { x: sp.x, y: sp.y + side * distance })
      continue
    }
    const extLink = newEdges.find((e) =>
      (e.source === m.tmp_id && existingById.has(e.target)) || (e.target === m.tmp_id && existingById.has(e.source)))
    if (extLink) {
      const extId = extLink.source === m.tmp_id ? extLink.target : extLink.source
      const ext = existingById.get(extId)
      const desired = { x: ext.position?.x ?? 0, y: (ext.position?.y ?? 0) - rowGap * 0.7 }
      const spot = findNonOverlapping(placedRects(), desired, nodeW(m), nodeH(m))
      pos.set(m.tmp_id, { x: spot.x, y: spot.y })
      continue
    }
    // Unlinked memo: stack in an extra column right of the layout
    pos.set(m.tmp_id, { x: (maxLayer + 1) * colGap, y: orphanRow * rowGap })
    orphanRow++
  }

  // ── Translate the whole layout onto the canvas ──────────────────────────────
  const xs = [...pos.values()]
  if (xs.length) {
    const minX = Math.min(...xs.map((p) => p.x))
    const minY = Math.min(...xs.map((p) => p.y))
    let originX = 100, originY = 100
    if ((existingNodes ?? []).length) {
      const maxExistingY = existingNodes.reduce((m, n) => Math.max(m, (n.position?.y ?? 0) + nodeH(n)), 0)
      originY = maxExistingY + 160
    }
    for (const p of pos.values()) { p.x = p.x - minX + originX; p.y = p.y - minY + originY }
  }
  return pos
}

// Fail-all validation for create_graph input. Throws a teaching error listing
// every problem of a kind at once so one retry can fix them all.
export function validateGraphInput({ nodes, edges }, existingNodes, stageTypes, layout) {
  if (!Array.isArray(nodes) || nodes.length < 1) throw new Error('nodes는 1개 이상이어야 합니다.')
  if (nodes.length > 100) throw new Error(`노드는 한 번에 최대 100개입니다 (요청: ${nodes.length}). 나눠서 호출하세요.`)
  if ((edges ?? []).length > 300) throw new Error(`연결선은 한 번에 최대 300개입니다 (요청: ${edges.length}).`)

  const existingIds = new Set((existingNodes ?? []).map((n) => n.id))
  const seen = new Set()
  const dupTmp = [], collideTmp = [], noTmp = []
  for (const n of nodes) {
    if (!n.tmp_id) { noTmp.push(n.label ?? n.header ?? '(이름없음)'); continue }
    if (seen.has(n.tmp_id)) dupTmp.push(n.tmp_id)
    if (existingIds.has(n.tmp_id)) collideTmp.push(n.tmp_id)
    seen.add(n.tmp_id)
  }
  if (noTmp.length) throw new Error(`tmp_id가 없는 노드가 있습니다: ${noTmp.join(', ')}. 모든 노드에 고유한 tmp_id를 지정하세요.`)
  if (dupTmp.length) throw new Error(`중복된 tmp_id: ${dupTmp.join(', ')}. tmp_id는 호출 내에서 고유해야 합니다.`)
  if (collideTmp.length) throw new Error(`tmp_id가 기존 노드 id와 충돌합니다: ${collideTmp.join(', ')}. 다른 tmp_id를 쓰세요.`)

  const unresolved = []
  for (const e of edges ?? []) {
    if (!seen.has(e.source) && !existingIds.has(e.source)) unresolved.push(e.source)
    if (!seen.has(e.target) && !existingIds.has(e.target)) unresolved.push(e.target)
  }
  if (unresolved.length) {
    throw new Error(
      `연결선이 참조하는 노드를 찾을 수 없습니다: ${[...new Set(unresolved)].join(', ')}. ` +
      '이 호출의 tmp_id 또는 기존 노드 id(get_canvas로 확인)만 참조할 수 있습니다.')
  }

  const badType = []
  for (const n of nodes) {
    if (n.type !== 'stage') continue
    const idx = n.stageTypeIdx ?? n.colorIdx
    if (idx != null && (idx < 0 || idx >= stageTypes.length)) badType.push(`${n.tmp_id}(${idx})`)
  }
  if (badType.length) {
    throw new Error(
      `stageTypeIdx가 유효 범위(0..${stageTypes.length - 1})를 벗어난 노드: ${badType.join(', ')}. ` +
      'get_stage_types로 이 캔버스의 종류 목록을 확인하세요.')
  }

  if (layout === 'manual') {
    const missing = nodes.filter((n) => !Number.isFinite(n.x) || !Number.isFinite(n.y)).map((n) => n.tmp_id)
    if (missing.length) throw new Error(`layout:'manual'에서는 모든 노드에 x/y가 필요합니다. 누락: ${missing.join(', ')}.`)
  }
}
