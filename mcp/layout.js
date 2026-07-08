// Pure layout/validation helpers for the MCP server — no DB access, unit-testable.
//
// layoutGraph: layered or radial auto-layout for create_graph. Stages are
// topologically layered (cycles tolerated), memos ride near their linked stage.
// Supports presets: 'right' (default), 'left', 'down', 'up', 'radial'.

// Default/min render sizes — must match StageNode/MemoNode minWidth/minHeight
export const SIZE = {
  stage: { w: 220, h: 90, minW: 200, minH: 80 },
  memo:  { w: 180, h: 90, minW: 160, minH: 80 },
}

// Radial level-based default sizes (applied when node has no explicit width/height)
export const RADIAL_SIZE = {
  0: { w: 340, h: 150 },  // root
  1: { w: 270, h: 115 },  // level-1
  2: { w: 220, h: 90  },  // level-2+
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

// ── Layered layout (right/left/down/up) ──────────────────────────────────────
// Core algorithm always computes left→right (col=layer, row=sibling-order).
// Axis transforms handle the other 3 presets.
function layeredLayout({ newNodes, newEdges, colGap = 320, rowGap = 200 }) {
  const pos = new Map() // tmp_id -> {x, y}
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
    stages.forEach((n, i) => layer.set(n.tmp_id, i % 4))
  } else {
    const remaining = new Map(inDeg)
    const done = new Set()
    let queue = stages.filter((n) => remaining.get(n.tmp_id) === 0).map((n) => n.tmp_id)
    while (done.size < stages.length) {
      if (!queue.length) {
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
        if (done.has(t)) continue
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
  const layers = new Map()
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

  // ── Memos: near their linked stage (perpendicular to main axis) ────────────
  // For right/left (horizontal flow): memos go above/below (vertical offset).
  // For down/up (vertical flow): memos go left/right (horizontal offset).
  // We always compute in "right" coordinates here; axis transform is applied later.
  const memoCountPerStage = new Map()
  const maxLayer = stages.length ? Math.max(...[...layer.values()], 0) : -1
  let orphanRow = 0
  for (const m of memos) {
    const link = newEdges.find((e) =>
      (e.source === m.tmp_id && pos.has(e.target)) || (e.target === m.tmp_id && pos.has(e.source)))
    if (link) {
      const stageId = link.source === m.tmp_id ? link.target : link.source
      const sp = pos.get(stageId)
      const count = memoCountPerStage.get(stageId) ?? 0
      memoCountPerStage.set(stageId, count + 1)
      const side = count % 2 === 0 ? -1 : 1
      const distance = rowGap * 0.7 * (Math.floor(count / 2) + 1)
      pos.set(m.tmp_id, { x: sp.x, y: sp.y + side * distance })
      continue
    }
    // Unlinked memo: stack in an extra column right of the layout
    pos.set(m.tmp_id, { x: (maxLayer + 1) * colGap, y: orphanRow * rowGap })
    orphanRow++
  }

  return pos
}

// ── Radial layout ─────────────────────────────────────────────────────────────
// Hub-and-spoke for hierarchical content. Returns Map<tmp_id, {x,y,width?,height?}>.
function radialLayout({ newNodes, newEdges }) {
  const pos = new Map() // tmp_id -> {x, y, width?, height?}
  const stages = newNodes.filter((n) => n.type === 'stage')
  const memos = newNodes.filter((n) => n.type === 'memo')
  const stageIds = new Set(stages.map((n) => n.tmp_id))

  if (!stages.length) {
    // No stages: place memos in a simple column
    memos.forEach((m, i) => pos.set(m.tmp_id, { x: 0, y: i * 200 }))
    return pos
  }

  // Build adjacency (undirected stage-stage edges)
  const stageEdges = newEdges.filter((e) => stageIds.has(e.source) && stageIds.has(e.target))
  const adj = new Map(stages.map((n) => [n.tmp_id, new Set()]))
  for (const e of stageEdges) {
    adj.get(e.source).add(e.target)
    adj.get(e.target).add(e.source)
  }

  // Compute in-degree (directed) and total degree for root selection
  const inDeg = new Map(stages.map((n) => [n.tmp_id, 0]))
  for (const e of stageEdges) inDeg.set(e.target, inDeg.get(e.target) + 1)
  const totalDeg = (id) => adj.get(id).size

  // Root = in-degree-0 stage with highest total degree; fallback = highest total degree
  const zeroDeg = stages.filter((n) => inDeg.get(n.tmp_id) === 0)
  const pool = zeroDeg.length ? zeroDeg : [...stages]
  const root = pool.reduce((best, n) => totalDeg(n.tmp_id) >= totalDeg(best.tmp_id) ? n : best, pool[0])
  const rootId = root.tmp_id

  // BFS to compute levels and parents (undirected)
  const level = new Map([[rootId, 0]])
  const parentId = new Map([[rootId, null]])
  const bfsQueue = [rootId]
  while (bfsQueue.length) {
    const cur = bfsQueue.shift()
    for (const nb of adj.get(cur)) {
      if (!level.has(nb)) {
        level.set(nb, level.get(cur) + 1)
        parentId.set(nb, cur)
        bfsQueue.push(nb)
      }
    }
  }

  // Separate components: stages not reachable from root
  const connected = new Set(level.keys())
  const disconnected = stages.filter((n) => !connected.has(n.tmp_id))

  // Direction assigned to each level-1 node (from root), inherited by descendants
  // Distribute level-1 children across 4 sides: right, left, bottom, top (in order)
  const SIDES = ['right', 'left', 'bottom', 'top']
  const level1 = stages.filter((n) => level.get(n.tmp_id) === 1)
  const sideOf = new Map() // tmp_id -> 'right'|'left'|'bottom'|'top'
  if (level1.length > 0) {
    // Distribute: assign sides round-robin by slot to balance counts
    // e.g. 7 children → sides get [2,2,2,1]
    level1.forEach((n, i) => sideOf.set(n.tmp_id, SIDES[i % 4]))
  }

  // Inherit side from level-1 ancestor
  function getSide(id) {
    if (sideOf.has(id)) return sideOf.get(id)
    const par = parentId.get(id)
    if (par == null) return 'right' // root, shouldn't happen for memos
    const s = getSide(par)
    sideOf.set(id, s)
    return s
  }

  // Geometry helpers
  // For a given side, the "outward" direction vector and perpendicular axis
  const DIR = {
    right:  { dx: 1, dy: 0 },
    left:   { dx: -1, dy: 0 },
    bottom: { dx: 0, dy: 1 },
    top:    { dx: 0, dy: -1 },
  }
  // Distance from parent center to child center (outward), by side
  const DIST = { right: 480, left: 480, bottom: 320, top: 320 }
  // Perpendicular spacing between siblings, by side
  const FAN_SPACING = { right: 210, left: 210, bottom: 340, top: 340 }
  // Level ≥2 distance
  const DIST2 = { right: 460, left: 460, bottom: 300, top: 300 }

  // Compute radial default size for a stage node
  function stageSize(id) {
    const lv = level.get(id) ?? 2
    const sz = RADIAL_SIZE[Math.min(lv, 2)]
    return sz
  }

  // Center position (will convert to top-left after placing)
  const center = new Map() // tmp_id -> {cx, cy, w, h}

  // Place root at origin center
  const rootSz = stageSize(rootId)
  const rootW = root.width ?? rootSz.w
  const rootH = root.height ?? rootSz.h
  center.set(rootId, { cx: 0, cy: 0, w: rootW, h: rootH })
  const sizeOut = new Map([[rootId, { w: rootW, h: rootH }]])

  // BFS placement in level order
  const placedRects = [] // {x, y, w, h} in center-based coords (top-left = cx - w/2, cy - h/2)
  const rectOf = (cx, cy, w, h) => ({ x: cx - w / 2, y: cy - h / 2, w, h })
  placedRects.push(rectOf(0, 0, rootW, rootH))

  // Place connected stages level by level
  const maxLevel = level.size ? Math.max(...level.values()) : 0
  for (let lv = 1; lv <= maxLevel; lv++) {
    const atLevel = stages.filter((n) => level.get(n.tmp_id) === lv)

    // Group by parent to fan children together
    const byParent = new Map()
    for (const n of atLevel) {
      const par = parentId.get(n.tmp_id)
      if (!byParent.has(par)) byParent.set(par, [])
      byParent.get(par).push(n)
    }

    for (const [par, children] of byParent) {
      const parCenter = center.get(par)
      if (!parCenter) continue
      const { cx: pcx, cy: pcy } = parCenter

      for (let ci = 0; ci < children.length; ci++) {
        const n = children[ci]
        const side = getSide(n.tmp_id)
        const dir = DIR[side]
        const dist = lv === 1 ? DIST[side] : DIST2[side]
        const fanSpacing = FAN_SPACING[side]

        // Center the fan around the parent's position on the perpendicular axis
        const fanOffset = (ci - (children.length - 1) / 2) * fanSpacing

        const cx = pcx + dir.dx * dist + dir.dy * fanOffset  // dir.dy is perp for horiz dirs: 0 for right/left
        const cy = pcy + dir.dy * dist + dir.dx * fanOffset   // dir.dx is perp for vert dirs: 0 for bottom/top

        const sz = stageSize(n.tmp_id)
        const w = n.width ?? sz.w
        const h = n.height ?? sz.h
        sizeOut.set(n.tmp_id, { w, h })

        const desired = rectOf(cx, cy, w, h)
        const spot = findNonOverlapping(placedRects, desired, w, h)
        const finalCx = spot.x + w / 2
        const finalCy = spot.y + h / 2
        center.set(n.tmp_id, { cx: finalCx, cy: finalCy, w, h })
        placedRects.push(rectOf(finalCx, finalCy, w, h))
      }
    }
  }

  // Convert centers to top-left positions and record in pos
  for (const [id, { cx, cy, w, h }] of center) {
    const n = stages.find((s) => s.tmp_id === id)
    const entry = { x: cx - w / 2, y: cy - h / 2 }
    // Carry width/height only if layout assigned them (node had no explicit size)
    if (!n.width) entry.width = w
    if (!n.height) entry.height = h
    pos.set(id, entry)
  }

  // ── Memos: hang perpendicular to their stage's outward direction ─────────
  const memoCountPerStage = new Map()
  const memoW = SIZE.memo.w
  const memoH = SIZE.memo.h
  for (const m of memos) {
    const link = newEdges.find((e) =>
      (e.source === m.tmp_id && pos.has(e.target)) || (e.target === m.tmp_id && pos.has(e.source)))
    if (!link) continue
    const stageId = link.source === m.tmp_id ? link.target : link.source
    const stagePos = pos.get(stageId)
    if (!stagePos) continue
    const { cx: scx, cy: scy } = center.get(stageId) ?? { cx: stagePos.x + (sizeOut.get(stageId)?.w ?? SIZE.stage.w) / 2, cy: stagePos.y + (sizeOut.get(stageId)?.h ?? SIZE.stage.h) / 2 }

    const side = stageId === rootId ? 'top' : (getSide(stageId) ?? 'top')
    const count = memoCountPerStage.get(stageId) ?? 0
    memoCountPerStage.set(stageId, count + 1)

    // Perpendicular direction: if stage is on right/left side, memos hang up/down; else left/right
    const isHoriz = side === 'right' || side === 'left'
    const perpSign = count % 2 === 0 ? -1 : 1
    const perpDist = (Math.floor(count / 2) + 1) * (isHoriz ? 200 : 340)
    const sStageH = sizeOut.get(stageId)?.h ?? SIZE.stage.h
    const sStageW = sizeOut.get(stageId)?.w ?? SIZE.stage.w
    const outwardDist = isHoriz ? (sStageH / 2 + memoH / 2 + 60) : (sStageW / 2 + memoW / 2 + 60)

    let mcx, mcy
    if (isHoriz) {
      // Outward = along stage's direction (horiz); perpendicular = vertical
      const stageDirX = DIR[side].dx
      mcx = scx + stageDirX * 0 // stay on same horizontal center as stage
      // Actually hang off the perpendicular axis (above/below)
      mcx = scx + perpSign * outwardDist * 0 // no outward offset needed; perp is vertical
      // Simpler: place directly above or below the stage
      mcy = scy + perpSign * (sStageH / 2 + memoH / 2 + 60 + Math.floor(count / 2) * 110)
      mcx = scx + (count % 2 === 0 ? 0 : 0) // centered
      // Actually alternate left/right for multiple memos
      const memoSide = count % 2 === 0 ? -1 : 1
      mcx = scx + memoSide * perpDist
      mcy = scy
    } else {
      // Stage on top/bottom; perpendicular = horizontal
      const memoSide = count % 2 === 0 ? -1 : 1
      mcx = scx + memoSide * perpDist
      mcy = scy
    }

    const desired = { x: mcx - memoW / 2, y: mcy - memoH / 2 }
    const spot = findNonOverlapping(placedRects, desired, memoW, memoH)
    placedRects.push({ x: spot.x, y: spot.y, w: memoW, h: memoH })
    pos.set(m.tmp_id, { x: spot.x, y: spot.y })
  }

  // Unlinked memos
  let orphanRow = 0
  for (const m of memos) {
    if (pos.has(m.tmp_id)) continue
    pos.set(m.tmp_id, { x: 0, y: (maxLevel + 1) * 400 + orphanRow * 200 })
    orphanRow++
  }

  // Disconnected stages: lay out with layered algorithm, place below radial cluster
  if (disconnected.length) {
    const disconnectedEdges = newEdges.filter(
      (e) => disconnected.some((n) => n.tmp_id === e.source || n.tmp_id === e.target))
    const subPos = layeredLayout({ newNodes: disconnected, newEdges: disconnectedEdges })
    const subMinX = Math.min(...[...subPos.values()].map((p) => p.x))
    const subMinY = Math.min(...[...subPos.values()].map((p) => p.y))
    // Find bottom of radial cluster
    const radialMaxY = Math.max(...[...pos.values()].map((p) => (p.y ?? 0) + (p.height ?? SIZE.stage.h)))
    const offsetY = radialMaxY + 300
    for (const [id, p] of subPos) {
      pos.set(id, { x: p.x - subMinX, y: p.y - subMinY + offsetY })
    }
  }

  return pos
}

// ── radialLevels: BFS depth per stage node (exported for warning checks) ─────
// Returns Map<tmp_id, level> for stage nodes only, using the same root-selection
// and BFS logic as radialLayout. Non-stage nodes are excluded.
// Used by store.js to check whether same-depth nodes share stageTypeIdx.
export function radialLevels(nodeInputs, edgeInputs) {
  const stages = nodeInputs.filter((n) => n.type === 'stage')
  const stageIds = new Set(stages.map((n) => n.tmp_id))
  if (!stages.length) return new Map()

  const stageEdges = (edgeInputs ?? []).filter((e) => stageIds.has(e.source) && stageIds.has(e.target))
  const adj = new Map(stages.map((n) => [n.tmp_id, new Set()]))
  const inDeg = new Map(stages.map((n) => [n.tmp_id, 0]))
  for (const e of stageEdges) {
    adj.get(e.source).add(e.target)
    adj.get(e.target).add(e.source)
    inDeg.set(e.target, inDeg.get(e.target) + 1)
  }

  const totalDeg = (id) => adj.get(id).size
  const zeroDeg = stages.filter((n) => inDeg.get(n.tmp_id) === 0)
  const pool = zeroDeg.length ? zeroDeg : [...stages]
  const root = pool.reduce((best, n) => totalDeg(n.tmp_id) >= totalDeg(best.tmp_id) ? n : best, pool[0])
  const rootId = root.tmp_id

  const level = new Map([[rootId, 0]])
  const queue = [rootId]
  while (queue.length) {
    const cur = queue.shift()
    for (const nb of adj.get(cur)) {
      if (!level.has(nb)) {
        level.set(nb, level.get(cur) + 1)
        queue.push(nb)
      }
    }
  }

  // Unreachable stages (disconnected components) get level = -1
  for (const n of stages) {
    if (!level.has(n.tmp_id)) level.set(n.tmp_id, -1)
  }

  return level
}

// ── Main layoutGraph export ───────────────────────────────────────────────────
// preset: 'right' (default), 'left', 'down', 'up', 'radial'
// Returns Map<tmp_id, {x, y, width?, height?}>
export function layoutGraph({ newNodes, newEdges, existingNodes, colGap = 320, rowGap = 200, preset = 'right' }) {
  let pos

  if (preset === 'radial') {
    pos = radialLayout({ newNodes, newEdges })
  } else {
    // Axis parameterization for right/left/down/up
    // 'right': col=layer→x, row→y (colGap horizontal, rowGap vertical)
    // 'down':  col=layer→y, row→x (230px layer gap vertical, 320px sibling gap horizontal)
    // 'left'/'up': mirror of right/down
    const isVertical = preset === 'down' || preset === 'up'
    const cGap = isVertical ? 230 : colGap   // layer gap
    const rGap = isVertical ? 320 : rowGap   // sibling gap

    pos = layeredLayout({ newNodes, newEdges, colGap: cGap, rowGap: rGap })

    if (isVertical) {
      // Swap x and y so layers become rows (top→bottom) and siblings fan horizontally
      for (const [id, p] of pos) {
        pos.set(id, { x: p.y, y: p.x })
      }
      if (preset === 'up') {
        const maxY = Math.max(...[...pos.values()].map((p) => p.y))
        for (const [id, p] of pos) pos.set(id, { x: p.x, y: maxY - p.y })
      }
    } else if (preset === 'left') {
      const maxX = Math.max(...[...pos.values()].map((p) => p.x))
      for (const [id, p] of pos) pos.set(id, { x: maxX - p.x, y: p.y })
    }
  }

  // ── Translate the whole layout onto the canvas ──────────────────────────────
  const vals = [...pos.values()]
  if (vals.length) {
    const minX = Math.min(...vals.map((p) => p.x))
    const minY = Math.min(...vals.map((p) => p.y))
    let originX = 100, originY = 100
    if ((existingNodes ?? []).length) {
      const maxExistingY = existingNodes.reduce((m, n) => Math.max(m, (n.position?.y ?? 0) + nodeH(n)), 0)
      originY = maxExistingY + 160
    }
    for (const p of pos.values()) {
      p.x = p.x - minX + originX
      p.y = p.y - minY + originY
    }
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
