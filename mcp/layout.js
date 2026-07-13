// Pure layout/validation helpers for the MCP server — no DB access, unit-testable.
//
// layoutGraph: layered or radial auto-layout for create_graph. Stages are
// topologically layered (cycles tolerated), memos ride near their linked stage.
// Supports presets: 'right' (default), 'left', 'down', 'up', 'radial'.

// Default/min render sizes — must match StageNode/MemoNode minWidth/minHeight
export const SIZE = {
  stage: { w: 220, h: 90, minW: 200, minH: 80 },
  memo:  { w: 180, h: 90, minW: 160, minH: 80 },
  content: { w: 220, h: 140, minW: 160, minH: 100 },
  group: { w: 320, h: 220, minW: 240, minH: 160 },
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
// Hub-and-spoke for hierarchical content.
// Returns Map<tmp_id, {x, y, dir?}> where dir = 'right'|'left'|'bottom'|'top'
// is the outward branch direction for that node (used by createGraph to pin handles).
// Root has dir=null (it legitimately connects on up to 4 sides).
function radialLayout({ newNodes, newEdges }) {
  const pos = new Map() // tmp_id -> {x, y, dir?}
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

  // Direction assigned to each level-1 node (from root), inherited by descendants.
  // Count-specific arrangements (input order fills the listed sides in order):
  //   1 → [right]; 2 → [right, left]; 3 → [top, bottom, bottom] (삼각형);
  //   4 → [top, bottom, left, right] (상하좌우 하나씩); ≥5 → balanced round-robin.
  const SIDES = ['right', 'left', 'bottom', 'top']
  const level1 = stages.filter((n) => level.get(n.tmp_id) === 1)
  const sideOf = new Map() // tmp_id -> 'right'|'left'|'bottom'|'top'
  if (level1.length > 0) {
    const n = level1.length
    let sides
    if (n === 1) sides = ['right']
    else if (n === 2) sides = ['right', 'left']
    else if (n === 3) sides = ['top', 'bottom', 'bottom']
    else if (n === 4) {
      // Subtree-aware assignment (still 상하좌우 하나씩, but WHICH child gets which
      // side is chosen by branch size): the two largest descendant-subtrees take
      // the horizontal sides (right = largest, left = 2nd largest), the remaining
      // two take bottom (3rd) / top (4th). Ties keep input order (stable sort).
      // This keeps big fans off the narrower vertical sides, where wrapped rows
      // would otherwise reuse column-0's offsets and cross through it.
      const childrenOf = new Map(stages.map((s) => [s.tmp_id, []]))
      for (const [id, par] of parentId) {
        if (par != null) childrenOf.get(par)?.push(id)
      }
      const subtreeSize = (id) =>
        (childrenOf.get(id) ?? []).reduce((sum, c) => sum + 1 + subtreeSize(c), 0)
      const bySize = level1
        .map((node, i) => ({ i, size: subtreeSize(node.tmp_id) }))
        .sort((a, b) => b.size - a.size || a.i - b.i)
      const rankSide = ['right', 'left', 'bottom', 'top']
      sides = new Array(4)
      bySize.forEach((entry, rank) => { sides[entry.i] = rankSide[rank] })
    }
    else sides = level1.map((_, i) => SIDES[i % 4]) // ≥5: round-robin by slot
    level1.forEach((node, i) => sideOf.set(node.tmp_id, sides[i]))
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
  const OPPOSITE = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' }
  // Distance from parent center to child center (outward), by side
  const DIST = { right: 480, left: 480, bottom: 320, top: 320 }
  // Perpendicular spacing between siblings, by side
  const FAN_SPACING = { right: 210, left: 210, bottom: 340, top: 340 }
  // Level ≥2 distance
  const DIST2 = { right: 460, left: 460, bottom: 300, top: 300 }
  // Extra outward distance per wrap column (when children.length > MAX_FAN_PER_COL)
  const WRAP_DIST = { right: 460, left: 460, bottom: 300, top: 300 }
  // Max children per column before wrapping to next outward column
  const MAX_FAN_PER_COL = 4

  // Center position (will convert to top-left after placing)
  const center = new Map() // tmp_id -> {cx, cy, w, h}

  // Place root at origin center using normal stage default size
  const rootW = root.width ?? SIZE.stage.w
  const rootH = root.height ?? SIZE.stage.h
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
        const baseDist = lv === 1 ? DIST[side] : DIST2[side]
        const fanSpacing = FAN_SPACING[side]

        // Fan wrapping: cap children per column at MAX_FAN_PER_COL; extras go outward.
        //
        // Geometry constraint: straight edges all leave the parent's single anchor, and
        // a full 4-child inner fan blocks every angular window through its own band
        // EXCEPT the central one (node boxes are wide relative to the gaps between
        // lanes, so the side gaps close). The only crossing-free way to reach wrapped
        // children is therefore the CENTER corridor: |perp/dist| ≲ 0.10 clears the
        // inner fan's bodies. That corridor fits at most 2 extra nodes (±0.08·dist,
        // vertically separated just past the overlap padding) — and only on horizontal
        // sides, where the perpendicular axis is y (node heights ~115) rather than
        // x (widths ~250, too wide to fit two in the corridor).
        const isHoriz = side === 'right' || side === 'left'
        const overflowCount = children.length - MAX_FAN_PER_COL

        let dist, fanOffset
        if (overflowCount > 0 && overflowCount <= 2 && isHoriz) {
          // 5-6 children on a horizontal side: full inner fan + center-corridor overflow.
          if (ci < MAX_FAN_PER_COL) {
            dist = baseDist
            fanOffset = (ci - (MAX_FAN_PER_COL - 1) / 2) * fanSpacing
          } else {
            dist = baseDist + WRAP_DIST[side]
            fanOffset = overflowCount === 1 ? 0 : (ci === MAX_FAN_PER_COL ? -1 : 1) * 0.08 * dist
          }
        } else {
          // General wrap (vertical sides, or ≥7 children): staggered columns, best effort.
          const colIdx = Math.floor(ci / MAX_FAN_PER_COL)
          const posInCol = ci % MAX_FAN_PER_COL
          const colStart = colIdx * MAX_FAN_PER_COL
          const colCount = Math.min(MAX_FAN_PER_COL, children.length - colStart)
          dist = baseDist + colIdx * WRAP_DIST[side]

          // Center the fan of this column on its own subset, then stagger wrapped
          // columns into the gaps of column 0's lanes. Whether a half-spacing shift is
          // needed depends on parity: a centered fan of m children occupies integer
          // lanes when m is odd and half-integer lanes when m is even, so column k
          // collides with column 0 exactly when their counts share parity. The offset
          // is scaled by dist/baseDist so the ray from the parent's anchor is aimed
          // through the same ANGULAR gap at every distance.
          const col0Count = Math.min(MAX_FAN_PER_COL, children.length)
          const stagger = colIdx > 0 && (col0Count - colCount) % 2 === 0 ? fanSpacing / 2 : 0
          fanOffset = ((posInCol - (colCount - 1) / 2) * fanSpacing + stagger) * (dist / baseDist)
        }

        const cx = pcx + dir.dx * dist + dir.dy * fanOffset  // dir.dy is perp for horiz dirs: 0 for right/left
        const cy = pcy + dir.dy * dist + dir.dx * fanOffset   // dir.dx is perp for vert dirs: 0 for bottom/top

        const w = n.width ?? SIZE.stage.w
        const h = n.height ?? SIZE.stage.h
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

  // Convert centers to top-left positions and record in pos.
  // Emit dir = branch direction for non-root nodes (null for root).
  // dir is used by createGraph to pin radial edge handles.
  for (const [id, { cx, cy, w, h }] of center) {
    const entry = { x: cx - w / 2, y: cy - h / 2 }
    const dir = sideOf.get(id) ?? null  // null for root
    if (dir != null) entry.dir = dir
    pos.set(id, entry)
  }

  // ── Memos: prefer the stage's FREE connection points ──────────────────────
  // A stage's "used" sides are: its inbound side (OPPOSITE of its dir — where
  // it connects to its parent; for the root, there's no parent, so instead the
  // root's used sides are simply the union of all its children's dirs), its
  // outbound side (its dir — where its own children branch out, if it has any;
  // for the root this collapses to the same children-dirs set), and any side
  // already claimed by a previously-placed memo of that stage. We place each
  // new memo on the first free side in preference order (the two sides
  // perpendicular to the stage's reference dir first, then the rest); if all
  // four sides are taken, fall back to the old perpendicular alternation.
  const memoCountPerStage = new Map()
  const memoSidesUsed = new Map() // stageId -> Set<side> claimed by memos already placed
  const memoW = SIZE.memo.w
  const memoH = SIZE.memo.h

  const parentSet = new Set([...parentId.values()].filter((p) => p != null)) // stages that have a stage child
  const rootChildDirs = new Set()
  for (const [id, par] of parentId) {
    if (par === rootId) {
      const d = sideOf.get(id)
      if (d) rootChildDirs.add(d)
    }
  }

  // Reference dir used purely to decide which pair of sides counts as
  // "perpendicular" for preference ordering. Root has no real dir; 'top'
  // matches the old default (root memos alternated left/right).
  const refDir = (stageId) => (stageId === rootId ? 'top' : (getSide(stageId) ?? 'top'))

  const baseUsedSides = (stageId) => {
    if (stageId === rootId) return new Set(rootChildDirs)
    const used = new Set()
    const dir = getSide(stageId)
    if (dir) {
      used.add(OPPOSITE[dir])              // inbound: side facing its parent
      if (parentSet.has(stageId)) used.add(dir) // outbound: side facing its own children
    }
    return used
  }

  const preferredOrder = (stageId) => {
    const isHorizDir = refDir(stageId) === 'right' || refDir(stageId) === 'left'
    return isHorizDir ? ['top', 'bottom', 'right', 'left'] : ['left', 'right', 'top', 'bottom']
  }

  const pickSide = (stageId, count) => {
    const used = new Set([...baseUsedSides(stageId), ...(memoSidesUsed.get(stageId) ?? [])])
    for (const s of preferredOrder(stageId)) if (!used.has(s)) return s
    // All four sides taken: fall back to the old perpendicular alternation.
    const isHorizDir = refDir(stageId) === 'right' || refDir(stageId) === 'left'
    const options = isHorizDir ? ['top', 'bottom'] : ['left', 'right']
    return options[count % 2]
  }

  for (const m of memos) {
    const link = newEdges.find((e) =>
      (e.source === m.tmp_id && pos.has(e.target)) || (e.target === m.tmp_id && pos.has(e.source)))
    if (!link) continue
    const stageId = link.source === m.tmp_id ? link.target : link.source
    const stagePos = pos.get(stageId)
    if (!stagePos) continue
    const { cx: scx, cy: scy } = center.get(stageId) ?? { cx: stagePos.x + (sizeOut.get(stageId)?.w ?? SIZE.stage.w) / 2, cy: stagePos.y + (sizeOut.get(stageId)?.h ?? SIZE.stage.h) / 2 }

    const count = memoCountPerStage.get(stageId) ?? 0
    memoCountPerStage.set(stageId, count + 1)

    const side = pickSide(stageId, count)
    const sideSet = memoSidesUsed.get(stageId) ?? new Set()
    sideSet.add(side)
    memoSidesUsed.set(stageId, sideSet)

    // Place just beyond the chosen side (half stage thickness + half memo
    // thickness + gap, along that side's axis — existing distance math).
    const sStageH = sizeOut.get(stageId)?.h ?? SIZE.stage.h
    const sStageW = sizeOut.get(stageId)?.w ?? SIZE.stage.w
    const isHorizSide = side === 'right' || side === 'left'
    const dist = isHorizSide ? (sStageW / 2 + memoW / 2 + 60) : (sStageH / 2 + memoH / 2 + 60)
    const mcx = scx + DIR[side].dx * dist
    const mcy = scy + DIR[side].dy * dist

    const desired = { x: mcx - memoW / 2, y: mcy - memoH / 2 }
    const spot = findNonOverlapping(placedRects, desired, memoW, memoH)
    placedRects.push({ x: spot.x, y: spot.y, w: memoW, h: memoH })

    // memoStageFacing: the side of the stage that faces the memo (= chosen side).
    // memoOwnFacing: the side of the memo that faces the stage (= opposite).
    pos.set(m.tmp_id, { x: spot.x, y: spot.y, memoStageFacing: side, memoOwnFacing: OPPOSITE[side] })
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

// ── Real-handle anchor computation (exported for tests and avoidEdgeCrossings) ─
// Computes the exact handle anchor points for an edge using the same pinning
// rules that createGraph applies:
//   root → child:       sourceHandle = child.dir,  targetHandle = OPPOSITE[child.dir]
//   non-root parent → child: sourceHandle = parent.dir, targetHandle = OPPOSITE[child.dir]
//   memo edge:          handles = memoStageFacing / memoOwnFacing (or reverse)
//   directional preset: sourceHandle/targetHandle come from the preset direction
// Falls back to center-to-center when info is missing.
//
// params:
//   srcId, tgtId  — tmp_ids of the edge endpoints
//   pos           — Map<tmp_id, entry> (entry has .x, .y, optionally .dir,
//                   .memoStageFacing, .memoOwnFacing)
//   newNodes      — array of node input objects (to get .type, .width, .height)
//   level         — Map<tmp_id, number> BFS depth (0=root, 1=L1 child, …)
//                   Pass null/undefined for non-radial layouts.
//   rootId        — tmp_id of the radial root (or null for non-radial)
//
// Returns { p1, p2 } — the two anchor {x, y} points for the segment check.
export function edgeAnchors(srcId, tgtId, pos, newNodes, level, rootId) {
  const OPPOSITE = { right: 'left', left: 'right', top: 'bottom', bottom: 'top' }

  const getRect = (id) => {
    const p = pos.get(id)
    if (!p) return null
    const n = newNodes.find((x) => x.tmp_id === id)
    const w = n?.width  ?? SIZE[n?.type]?.w ?? SIZE.stage.w
    const h = n?.height ?? SIZE[n?.type]?.h ?? SIZE.stage.h
    return { x: p.x, y: p.y, w, h }
  }

  const srcRect = getRect(srcId)
  const tgtRect = getRect(tgtId)
  if (!srcRect || !tgtRect) {
    return { p1: { x: 0, y: 0 }, p2: { x: 0, y: 0 } }
  }

  const srcEntry = pos.get(srcId) ?? {}
  const tgtEntry = pos.get(tgtId) ?? {}
  const srcNode = newNodes.find((x) => x.tmp_id === srcId)
  const tgtNode = newNodes.find((x) => x.tmp_id === tgtId)

  let sh = null, th = null

  // ── Memo edge ──────────────────────────────────────────────────────────────
  if (srcNode?.type === 'memo') {
    // src is memo, tgt is stage: memo's own facing → stage's facing side
    sh = srcEntry.memoOwnFacing   ?? null
    th = srcEntry.memoStageFacing ?? null
  } else if (tgtNode?.type === 'memo') {
    // tgt is memo: stage's facing → memo's own facing
    sh = tgtEntry.memoStageFacing ?? null
    th = tgtEntry.memoOwnFacing   ?? null
  // ── Radial edge ────────────────────────────────────────────────────────────
  } else if (level != null) {
    const srcLv = level.get(srcId) ?? -1
    const tgtLv = level.get(tgtId) ?? -1
    const srcDir = srcEntry.dir ?? null
    const tgtDir = tgtEntry.dir ?? null

    // Determine which node is the parent and which is the child by BFS level.
    // parent is the one with lower level (or the one that is the root).
    let parentId = null, childId = null
    if (srcLv < tgtLv) { parentId = srcId; childId = tgtId }
    else if (tgtLv < srcLv) { parentId = tgtId; childId = srcId }
    else {
      // Same level — lateral edge; fall back to center-to-center
      parentId = null; childId = null
    }

    if (parentId != null && childId != null) {
      const childDir = pos.get(childId)?.dir ?? null
      if (childDir) {
        if (parentId === rootId) {
          // root → child: source handle = child's dir, target handle = opposite
          if (parentId === srcId) { sh = childDir; th = OPPOSITE[childDir] }
          else                     { sh = OPPOSITE[childDir]; th = childDir }
        } else {
          // non-root parent → child: source handle = parent's dir, target = opposite of child's dir
          const parentDir = pos.get(parentId)?.dir ?? childDir
          if (parentId === srcId) { sh = parentDir; th = OPPOSITE[childDir] }
          else                     { sh = OPPOSITE[childDir]; th = parentDir }
        }
      }
    }
  }

  const p1 = handleAnchor(srcRect, sh)
  const p2 = handleAnchor(tgtRect, th)
  return { p1, p2 }
}

// ── Segment-vs-rect intersection (exported for tests) ────────────────────────
// Returns true when the line segment p1→p2 intersects or passes through the
// axis-aligned rect {x, y, w, h}. Uses Liang-Barsky clipping.
export function segmentIntersectsRect(p1, p2, rect) {
  const { x, y, w, h } = rect
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  // p = direction component magnitudes, q = distance from boundary
  const p = [-dx, dx, -dy, dy]
  const q = [p1.x - x, x + w - p1.x, p1.y - y, y + h - p1.y]
  let tMin = 0, tMax = 1
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return false // parallel and outside
    } else {
      const t = q[i] / p[i]
      if (p[i] < 0) { if (t > tMax) return false; if (t > tMin) tMin = t }
      else          { if (t < tMin) return false; if (t < tMax) tMax = t }
    }
  }
  return tMin <= tMax
}

// Anchor point on a node's rect edge for a given handle side (center of that edge).
function handleAnchor(rect, side) {
  const { x, y, w, h } = rect
  if (side === 'right')  return { x: x + w, y: y + h / 2 }
  if (side === 'left')   return { x,        y: y + h / 2 }
  if (side === 'bottom') return { x: x + w / 2, y: y + h }
  if (side === 'top')    return { x: x + w / 2, y }
  return { x: x + w / 2, y: y + h / 2 } // center fallback
}

// ── Edge-over-node crossing avoidance post-pass ───────────────────────────────
// For each new edge, check whether any non-endpoint new node's rect intersects
// the edge segment. If so, shift the offending node perpendicular to the segment
// until it clears (bounded: up to 6 steps of 60px in each perpendicular direction).
// Two sweeps over all edges. Modifies positions Map in-place.
//
// Anchors are computed via edgeAnchors() using real pinning rules (same as
// createGraph) when level/rootId context is available, so the pass detects
// crossings that actually exist for the rendered edge, not just center-to-center.
//
// When a memo node is shifted, its memoStageFacing/memoOwnFacing fields are
// updated to reflect the new side it ended up on (relative to its linked stage).
//
// level:  Map<tmp_id, number> BFS depth — pass null for non-radial layouts.
// rootId: tmp_id of the radial root — pass null for non-radial layouts.
// newEdges must already be filtered to edges whose both endpoints are in positions.
export function avoidEdgeCrossings(positions, newNodes, newEdges, level, rootId) {
  const PAD = 6
  const STEP = 60
  const MAX_STEPS = 6

  const getRect = (tmp_id) => {
    const p = positions.get(tmp_id)
    if (!p) return null
    const n = newNodes.find((x) => x.tmp_id === tmp_id)
    const w = (n?.width ?? SIZE[n?.type]?.w ?? SIZE.stage.w)
    const h = (n?.height ?? SIZE[n?.type]?.h ?? SIZE.stage.h)
    return { x: p.x, y: p.y, w, h }
  }

  const paddedRect = (r) => ({ x: r.x - PAD, y: r.y - PAD, w: r.w + 2 * PAD, h: r.h + 2 * PAD })

  // Build a quick lookup from memo tmp_id -> its linked stage tmp_id (for facing updates)
  const memoLinkedStage = new Map()
  for (const e of newEdges) {
    const srcNode = newNodes.find((x) => x.tmp_id === e.source)
    const tgtNode = newNodes.find((x) => x.tmp_id === e.target)
    if (srcNode?.type === 'memo' && tgtNode?.type === 'stage') memoLinkedStage.set(e.source, e.target)
    if (tgtNode?.type === 'memo' && srcNode?.type === 'stage') memoLinkedStage.set(e.target, e.source)
  }

  for (let sweep = 0; sweep < 2; sweep++) {
    for (let ei = 0; ei < newEdges.length; ei++) {
      const e = newEdges[ei]
      const srcId = e.source
      const tgtId = e.target
      if (!positions.has(srcId) || !positions.has(tgtId)) continue

      // Use real anchor rules via edgeAnchors
      const { p1, p2 } = edgeAnchors(srcId, tgtId, positions, newNodes, level, rootId)

      // Perpendicular direction to the segment
      const dx = p2.x - p1.x
      const dy = p2.y - p1.y
      const len = Math.sqrt(dx * dx + dy * dy)
      if (len < 1) continue
      // Perpendicular unit vector: (-dy, dx) and (dy, -dx)
      const px = -dy / len
      const py =  dx / len

      for (const n of newNodes) {
        if (n.tmp_id === srcId || n.tmp_id === tgtId) continue
        if (!positions.has(n.tmp_id)) continue

        const nr = getRect(n.tmp_id)
        if (!segmentIntersectsRect(p1, p2, paddedRect(nr))) continue

        // Try shifting in both perpendicular directions
        let moved = false
        outer: for (const sign of [1, -1]) {
          for (let step = 1; step <= MAX_STEPS; step++) {
            const ox = px * sign * step * STEP
            const oy = py * sign * step * STEP
            const orig = positions.get(n.tmp_id)
            const candidate = { x: orig.x + ox, y: orig.y + oy }
            const candidateRect = { x: candidate.x, y: candidate.y, w: nr.w, h: nr.h }

            // Check clears this segment
            if (segmentIntersectsRect(p1, p2, paddedRect(candidateRect))) continue

            // Check doesn't overlap other placed rects
            const overlapsOther = newNodes.some((other) => {
              if (other.tmp_id === n.tmp_id) return false
              if (!positions.has(other.tmp_id)) return false
              return overlaps(candidateRect, getRect(other.tmp_id))
            })
            if (overlapsOther) continue

            const newEntry = { ...orig, x: candidate.x, y: candidate.y }

            // If this is a memo node, update its facing fields to reflect new position
            if (n.type === 'memo' && memoLinkedStage.has(n.tmp_id)) {
              const stageId = memoLinkedStage.get(n.tmp_id)
              const stagePos = positions.get(stageId)
              if (stagePos) {
                const stageNode = newNodes.find((x) => x.tmp_id === stageId)
                const sw = stageNode?.width  ?? SIZE.stage.w
                const sh = stageNode?.height ?? SIZE.stage.h
                const stageCx = stagePos.x + sw / 2
                const stageCy = stagePos.y + sh / 2
                const memoCx  = candidate.x + (nr.w / 2)
                const memoCy  = candidate.y + (nr.h / 2)
                const relX = memoCx - stageCx
                const relY = memoCy - stageCy
                // Determine which side the memo ended up on relative to its stage
                let stageFacing, memoFacing
                if (Math.abs(relX) >= Math.abs(relY)) {
                  stageFacing = relX >= 0 ? 'right' : 'left'
                  memoFacing  = relX >= 0 ? 'left'  : 'right'
                } else {
                  stageFacing = relY >= 0 ? 'bottom' : 'top'
                  memoFacing  = relY >= 0 ? 'top'    : 'bottom'
                }
                newEntry.memoStageFacing = stageFacing
                newEntry.memoOwnFacing   = memoFacing
              }
            }

            positions.set(n.tmp_id, newEntry)
            moved = true
            break outer
          }
        }
        // If no spot found, leave in place (best-effort)
        void moved
      }
    }
  }
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

  // ── Edge-over-node avoidance post-pass (all presets, before translate) ───────
  // avoidEdgeCrossings now uses edgeAnchors() internally with the real pinning
  // rules, so we only need to pass BFS level info (for radial) or null (others).
  {
    // For radial, reconstruct BFS level from the pos entries: root has no dir
    // and level 0; other nodes' levels are inferred by BFS on the stage graph.
    let avoidLevel = null
    let avoidRootId = null
    if (preset === 'radial') {
      avoidLevel = radialLevels(newNodes, newEdges)
      // Root = stage whose pos entry has no dir field
      const stages = newNodes.filter((n) => n.type === 'stage')
      const rootStage = stages.find((n) => pos.has(n.tmp_id) && pos.get(n.tmp_id).dir == null)
      avoidRootId = rootStage?.tmp_id ?? null
    }
    // Only run avoidance for new-node pairs (both endpoints in pos)
    const newEdgesForAvoidance = newEdges.filter((e) => pos.has(e.source) && pos.has(e.target))
    avoidEdgeCrossings(pos, newNodes, newEdgesForAvoidance, avoidLevel, avoidRootId)
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
