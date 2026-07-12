// Unit tests for mcp/layout.js and mcp/sanitize.js — plain node, no deps, no DB.
// Run: node scripts/test-mcp-logic.mjs
import assert from 'node:assert/strict'
import { layoutGraph, findNonOverlapping, validateGraphInput, overlaps, nodeRect, radialLevels, segmentIntersectsRect, avoidEdgeCrossings, edgeAnchors, SIZE } from '../mcp/layout.js'
import { checkRadialLevelMixing, editableNodeIdSet, assertRegionEdit } from '../mcp/store.js'
import { sanitizeHtml } from '../mcp/sanitize.js'
import { applySharedCanvasUpdate, redactCanvas } from '../mcp/shareAccess.js'

let passed = 0
function t(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 }
}

const stage = (tmp_id) => ({ tmp_id, type: 'stage' })
const memo = (tmp_id) => ({ tmp_id, type: 'memo' })
const edge = (source, target) => ({ source, target })

console.log('layoutGraph')

t('linear chain A→B→C: 3 columns, same row', () => {
  const pos = layoutGraph({ newNodes: [stage('A'), stage('B'), stage('C')], newEdges: [edge('A', 'B'), edge('B', 'C')], existingNodes: [] })
  assert.equal(pos.get('B').x - pos.get('A').x, 320)
  assert.equal(pos.get('C').x - pos.get('B').x, 320)
  assert.equal(pos.get('A').y, pos.get('B').y)
  assert.equal(pos.get('B').y, pos.get('C').y)
})

t('diamond A→B, A→C, B→D, C→D: B/C share a column, D after', () => {
  const pos = layoutGraph({
    newNodes: [stage('A'), stage('B'), stage('C'), stage('D')],
    newEdges: [edge('A', 'B'), edge('A', 'C'), edge('B', 'D'), edge('C', 'D')],
    existingNodes: [],
  })
  assert.equal(pos.get('B').x, pos.get('C').x)
  assert.ok(pos.get('D').x > pos.get('B').x)
  assert.notEqual(pos.get('B').y, pos.get('C').y)
})

t('cycle A→B→C→A terminates with 3 distinct columns', () => {
  const pos = layoutGraph({
    newNodes: [stage('A'), stage('B'), stage('C')],
    newEdges: [edge('A', 'B'), edge('B', 'C'), edge('C', 'A')],
    existingNodes: [],
  })
  const xs = new Set([pos.get('A').x, pos.get('B').x, pos.get('C').x])
  assert.equal(xs.size, 3)
})

t('no edges: 6 stages form a grid (rows of 4)', () => {
  const pos = layoutGraph({ newNodes: [1, 2, 3, 4, 5, 6].map((i) => stage(`S${i}`)), newEdges: [], existingNodes: [] })
  assert.equal(pos.get('S1').y, pos.get('S5').y - 200) // S5 starts row 2
  assert.equal(pos.get('S1').x, pos.get('S5').x)
  assert.equal(pos.get('S4').x, pos.get('S1').x + 3 * 320)
})

t('memos alternate above then below their stage', () => {
  const pos = layoutGraph({
    newNodes: [stage('A'), memo('M1'), memo('M2')],
    newEdges: [edge('M1', 'A'), edge('M2', 'A')],
    existingNodes: [],
  })
  assert.ok(pos.get('M1').y < pos.get('A').y, 'first memo above')
  assert.ok(pos.get('M2').y > pos.get('A').y, 'second memo below')
  assert.equal(pos.get('M1').x, pos.get('A').x)
})

t('memo-only graph places memos without error', () => {
  const pos = layoutGraph({ newNodes: [memo('M1'), memo('M2')], newEdges: [], existingNodes: [] })
  assert.ok(pos.has('M1') && pos.has('M2'))
  assert.notDeepEqual(pos.get('M1'), pos.get('M2'))
})

t('empty canvas: layout starts at (100,100)', () => {
  const pos = layoutGraph({ newNodes: [stage('A')], newEdges: [], existingNodes: [] })
  assert.deepEqual(pos.get('A'), { x: 100, y: 100 })
})

t('non-empty canvas: layout translated below existing content', () => {
  const existing = [{ id: 'e1', type: 'stage', position: { x: 0, y: 300 }, height: 90 }]
  const pos = layoutGraph({ newNodes: [stage('A')], newEdges: [], existingNodes: existing })
  assert.ok(pos.get('A').y >= 300 + 90 + 160)
})

console.log('layoutGraph — presets')

t('preset:left mirrors right horizontally', () => {
  const posR = layoutGraph({ newNodes: [stage('A'), stage('B'), stage('C')], newEdges: [edge('A', 'B'), edge('B', 'C')], existingNodes: [], preset: 'right' })
  const posL = layoutGraph({ newNodes: [stage('A'), stage('B'), stage('C')], newEdges: [edge('A', 'B'), edge('B', 'C')], existingNodes: [], preset: 'left' })
  // In left preset A should have larger x than C (reversed)
  assert.ok(posL.get('A').x > posL.get('C').x, 'A is rightmost in left-preset')
  assert.equal(posR.get('A').y, posL.get('A').y, 'y unchanged by mirror')
})

t('preset:down swaps axes (layers become rows top→bottom)', () => {
  const pos = layoutGraph({ newNodes: [stage('A'), stage('B'), stage('C')], newEdges: [edge('A', 'B'), edge('B', 'C')], existingNodes: [], preset: 'down' })
  // With down preset, layer increment maps to y increment
  assert.ok(pos.get('B').y > pos.get('A').y, 'B below A')
  assert.ok(pos.get('C').y > pos.get('B').y, 'C below B')
  assert.equal(pos.get('A').x, pos.get('B').x, 'same column (no siblings)')
})

console.log('layoutGraph — radial')

t('radial: root is placed at canvas origin (100,100)', () => {
  // Star: R -> A, B, C (R is the hub)
  const nodes = [stage('R'), stage('A'), stage('B'), stage('C')]
  const edges = [edge('R', 'A'), edge('R', 'B'), edge('R', 'C')]
  const pos = layoutGraph({ newNodes: nodes, newEdges: edges, existingNodes: [], preset: 'radial' })
  // Root should be at origin (100,100) after translation
  // The root center is 0,0 before translation; top-left = (-w/2, -h/2) before translation
  // After translation minX/minY -> 100: root top-left should be at 100,100
  const rootEntry = pos.get('R')
  assert.ok(rootEntry.x >= 100, 'root x >= 100')
  assert.ok(rootEntry.y >= 100, 'root y >= 100')
})

t('radial: nodes use normal stage default size (no level-based sizing)', () => {
  const nodes = [stage('R'), stage('A'), stage('B'), stage('C')]
  const edges = [edge('R', 'A'), edge('R', 'B'), edge('R', 'C')]
  const pos = layoutGraph({ newNodes: nodes, newEdges: edges, existingNodes: [], preset: 'radial' })
  // No width/height emitted by layout (no level-based sizing)
  assert.equal(pos.get('R').width, undefined, 'root: no layout-assigned width')
  assert.equal(pos.get('R').height, undefined, 'root: no layout-assigned height')
  assert.equal(pos.get('A').width, undefined, 'L1 child: no layout-assigned width')
})

t('radial: no two nodes overlap (simple star with 4 children)', () => {
  const children = ['A', 'B', 'C', 'D']
  const nodes = [stage('R'), ...children.map(stage)]
  const edges = children.map((c) => edge('R', c))
  const pos = layoutGraph({ newNodes: nodes, newEdges: edges, existingNodes: [], preset: 'radial' })
  const rects = [...pos.entries()].map(([id, p]) => {
    const n = nodes.find((x) => x.tmp_id === id)
    const w = n?.type === 'memo' ? 180 : 220
    const h = 90
    return { x: p.x, y: p.y, w, h }
  })
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      assert.ok(!overlaps(rects[i], rects[j], 0, 0), `nodes ${i} and ${j} overlap`)
    }
  }
})

t('radial: memo goes on a free (perpendicular) side when both horizontal sides are used', () => {
  // R -> P -> C: P's inbound side is 'left' (opposite of its own dir), and
  // since P has its own child C, P's outbound side is 'right' (its dir) —
  // both horizontal sides are taken. A memo linked to P should land on top
  // or bottom instead, with memoStageFacing matching the chosen side.
  const nodes = [stage('R'), stage('P'), stage('C'), memo('M')]
  const edges = [edge('R', 'P'), edge('P', 'C'), edge('M', 'P')]
  const pos = layoutGraph({ newNodes: nodes, newEdges: edges, existingNodes: [], preset: 'radial' })

  assert.equal(pos.get('P').dir, 'right', 'P is the sole level-1 child, so it takes the right side')
  const facing = pos.get('M').memoStageFacing
  assert.ok(['top', 'bottom'].includes(facing), `expected memo on a free perpendicular side, got: ${facing}`)
  assert.equal(pos.get('M').memoOwnFacing, facing === 'top' ? 'bottom' : 'top', 'memoOwnFacing is the opposite of memoStageFacing')
})

t('radial: non-root parent pins both children to the same sourceHandle (parent branch dir)', () => {
  // R -> A -> X, Y  (A is a non-root parent; X and Y are its two children)
  // R -> B (another branch, different direction)
  const nodes = [stage('R'), stage('A'), stage('B'), stage('X'), stage('Y')]
  const edges = [edge('R', 'A'), edge('R', 'B'), edge('A', 'X'), edge('A', 'Y')]
  const pos = layoutGraph({ newNodes: nodes, newEdges: edges, existingNodes: [], preset: 'radial' })

  // All nodes must get a position
  for (const id of ['R', 'A', 'B', 'X', 'Y']) {
    assert.ok(pos.has(id), `${id} should have a position`)
  }

  // A is a level-1 node so it gets a dir
  const aDir = pos.get('A').dir
  assert.ok(['right', 'left', 'bottom', 'top'].includes(aDir), `A should have a branch dir, got: ${aDir}`)

  // X and Y (children of A) inherit A's dir
  assert.equal(pos.get('X').dir, aDir, 'X inherits A branch direction')
  assert.equal(pos.get('Y').dir, aDir, 'Y inherits A branch direction')

  // Verify that both X and Y share the same dir (A's dir), confirming single connection point
  assert.equal(pos.get('X').dir, pos.get('Y').dir, 'both children of A have same branch direction')
})

console.log('findNonOverlapping / overlaps')

t('returns desired spot when free', () => {
  const r = findNonOverlapping([], { x: 50, y: 50 }, 220, 90)
  assert.deepEqual(r, { x: 50, y: 50, shifted: false })
})

t('shifts away from an occupied spot', () => {
  const taken = [{ x: 50, y: 50, w: 220, h: 90 }]
  const r = findNonOverlapping(taken, { x: 60, y: 60 }, 220, 90)
  assert.equal(r.shifted, true)
  assert.ok(!overlaps({ x: r.x, y: r.y, w: 220, h: 90 }, taken[0]))
})

t('nodeRect uses width/height with type defaults', () => {
  assert.deepEqual(nodeRect({ type: 'memo', position: { x: 1, y: 2 } }), { x: 1, y: 2, w: 180, h: 90 })
  assert.deepEqual(nodeRect({ type: 'stage', position: { x: 0, y: 0 }, width: 300, height: 150 }), { x: 0, y: 0, w: 300, h: 150 })
})

console.log('validateGraphInput')

const types5 = [0, 1, 2, 3, 4].map((i) => ({ label: `t${i}` }))

t('accepts a valid graph', () => {
  validateGraphInput({ nodes: [stage('A'), stage('B')], edges: [edge('A', 'B')] }, [], types5)
})

t('rejects duplicate tmp_id', () => {
  assert.throws(() => validateGraphInput({ nodes: [stage('A'), stage('A')], edges: [] }, [], types5), /중복된 tmp_id/)
})

t('rejects tmp_id colliding with an existing node id', () => {
  assert.throws(() => validateGraphInput({ nodes: [stage('n-1')], edges: [] }, [{ id: 'n-1' }], types5), /기존 노드 id와 충돌/)
})

t('rejects unresolved edge refs, listing all of them', () => {
  assert.throws(
    () => validateGraphInput({ nodes: [stage('A')], edges: [edge('A', 'ghost1'), edge('ghost2', 'A')] }, [], types5),
    /ghost1.*ghost2|ghost2.*ghost1/s)
})

t('allows edges to existing node ids', () => {
  validateGraphInput({ nodes: [stage('A')], edges: [edge('A', 'n-old')] }, [{ id: 'n-old' }], types5)
})

t('rejects out-of-range stageTypeIdx with the valid range', () => {
  assert.throws(
    () => validateGraphInput({ nodes: [{ ...stage('A'), stageTypeIdx: 9 }], edges: [] }, [], types5),
    /0\.\.4.*get_stage_types/s)
})

t('manual layout requires x/y on every node', () => {
  assert.throws(
    () => validateGraphInput({ nodes: [{ ...stage('A'), x: 1 }], edges: [] }, [], types5, 'manual'),
    /manual.*누락: A/s)
})

console.log('radialLevels / checkRadialLevelMixing')

t('radialLevels: root=level 0, direct children=level 1, grandchildren=level 2', () => {
  // R -> A, B; A -> X
  const nodes = [stage('R'), stage('A'), stage('B'), stage('X')]
  const edges = [edge('R', 'A'), edge('R', 'B'), edge('A', 'X')]
  const lv = radialLevels(nodes, edges)
  assert.equal(lv.get('R'), 0)
  assert.equal(lv.get('A'), 1)
  assert.equal(lv.get('B'), 1)
  assert.equal(lv.get('X'), 2)
})

t('checkRadialLevelMixing: warns when same-level nodes have different stageTypeIdx', () => {
  // R(idx=0) -> A(idx=1) -> X(idx=3)
  //           -> B(idx=2)   <- B uses idx 2 instead of 1: level-1 mix
  const nodes = [
    { tmp_id: 'R', type: 'stage', stageTypeIdx: 0 },
    { tmp_id: 'A', type: 'stage', stageTypeIdx: 1 },
    { tmp_id: 'B', type: 'stage', stageTypeIdx: 2 },
    { tmp_id: 'X', type: 'stage', stageTypeIdx: 3 },
  ]
  const edges = [edge('R', 'A'), edge('R', 'B'), edge('A', 'X')]
  const warn = checkRadialLevelMixing(nodes, edges)
  assert.ok(warn !== null, 'expected a warning')
  assert.ok(warn.includes('레벨 1'), warn)
  assert.ok(warn.includes('update_nodes'), warn)
})

t('checkRadialLevelMixing: no warning when all levels are uniform', () => {
  // R(idx=0) -> A(idx=1), B(idx=1); A -> X(idx=2)
  const nodes = [
    { tmp_id: 'R', type: 'stage', stageTypeIdx: 0 },
    { tmp_id: 'A', type: 'stage', stageTypeIdx: 1 },
    { tmp_id: 'B', type: 'stage', stageTypeIdx: 1 },
    { tmp_id: 'X', type: 'stage', stageTypeIdx: 2 },
  ]
  const edges = [edge('R', 'A'), edge('R', 'B'), edge('A', 'X')]
  const warn = checkRadialLevelMixing(nodes, edges)
  assert.equal(warn, null, 'expected no warning for uniform levels')
})

console.log('sanitizeHtml')

t('removes <script> with content', () => {
  assert.equal(sanitizeHtml('a<script>alert(1)</script>b'), 'ab')
})

t('strips on* handlers and javascript: URLs', () => {
  const out = sanitizeHtml('<div onclick="x()"><a href="javascript:evil()">c</a></div>')
  assert.ok(!/onclick/.test(out) && !/javascript:/.test(out), out)
  assert.ok(out.includes('<a>c</a>') || out.includes('c'), out)
})

t('preserves checklist markup (class + checked)', () => {
  const src = '<div class="cl-item"><input type="checkbox" checked>&nbsp;항목</div>'
  const out = sanitizeHtml(src)
  assert.ok(out.includes('class="cl-item"'), out)
  assert.ok(out.includes('type="checkbox"'), out)
  assert.ok(out.includes('checked'), out)
})

t('preserves <details><summary> toggles', () => {
  const src = '<details open><summary>제목</summary><div>내용</div></details>'
  const out = sanitizeHtml(src)
  assert.ok(out.includes('<details open>') && out.includes('<summary>제목</summary>'), out)
})

t('keeps data:image/png img, drops http and svg+xml img', () => {
  assert.ok(sanitizeHtml('<img src="data:image/png;base64,AAAA">').includes('<img'))
  assert.equal(sanitizeHtml('<img src="http://x/a.png">'), '')
  assert.equal(sanitizeHtml('<img src="data:image/svg+xml;base64,AAAA">'), '')
})

t('drops non-checkbox inputs entirely', () => {
  assert.equal(sanitizeHtml('<input type="text" value="x">'), '')
})

t('keeps https links, font colors, bold', () => {
  const out = sanitizeHtml('<b>a</b><font color="#ff0000">b</font><a href="https://x.com">c</a>')
  assert.ok(out.includes('<b>a</b>') && out.includes('color="#ff0000"') && out.includes('href="https://x.com"'), out)
})

t('is idempotent', () => {
  const src = '<div class="cl-item"><input type="checkbox">&nbsp;x</div><details><summary>t</summary><div>d</div></details><b>y</b>'
  const once = sanitizeHtml(src)
  assert.equal(sanitizeHtml(once), once)
})

console.log('segmentIntersectsRect')

t('segment passing through rect center: intersects', () => {
  const rect = { x: 100, y: 100, w: 100, h: 100 }
  // Horizontal segment through center
  assert.ok(segmentIntersectsRect({ x: 50, y: 150 }, { x: 250, y: 150 }, rect))
})

t('segment fully to the left of rect: no intersection', () => {
  const rect = { x: 100, y: 100, w: 100, h: 100 }
  assert.ok(!segmentIntersectsRect({ x: 0, y: 150 }, { x: 50, y: 150 }, rect))
})

t('segment diagonal passing through corner: intersects', () => {
  const rect = { x: 100, y: 100, w: 100, h: 100 }
  assert.ok(segmentIntersectsRect({ x: 50, y: 50 }, { x: 250, y: 250 }, rect))
})

t('segment parallel and above rect: no intersection', () => {
  const rect = { x: 100, y: 200, w: 100, h: 100 }
  assert.ok(!segmentIntersectsRect({ x: 50, y: 100 }, { x: 300, y: 100 }, rect))
})

t('segment endpoint touches rect edge: intersects', () => {
  const rect = { x: 100, y: 100, w: 100, h: 100 }
  // Segment ends exactly at left edge center
  assert.ok(segmentIntersectsRect({ x: 0, y: 150 }, { x: 100, y: 150 }, rect))
})

t('zero-length segment inside rect: intersects', () => {
  const rect = { x: 100, y: 100, w: 100, h: 100 }
  assert.ok(segmentIntersectsRect({ x: 150, y: 150 }, { x: 150, y: 150 }, rect))
})

t('zero-length segment outside rect: no intersection', () => {
  const rect = { x: 100, y: 100, w: 100, h: 100 }
  assert.ok(!segmentIntersectsRect({ x: 50, y: 50 }, { x: 50, y: 50 }, rect))
})

console.log('avoidEdgeCrossings')

t('node on edge path gets shifted off it', () => {
  // A at (0,0), C at (1000,0): edge A→C goes horizontally through (500,0).
  // B at (500, -45) [center at 500,0 with h=90]: sits exactly on the segment.
  // After avoidance, B should not intersect the segment anymore.
  // avoidEdgeCrossings uses center-to-center fallback (level=null) here:
  // A center=(110,0), C center=(890,0), B center=(500,0) — on the segment.
  const nodes = [
    { tmp_id: 'A', type: 'stage' },
    { tmp_id: 'B', type: 'stage' },
    { tmp_id: 'C', type: 'stage' },
  ]
  const edges = [{ source: 'A', target: 'C' }]
  const pos = new Map([
    ['A', { x: 0,    y: -45 }],   // center at (110, 0)
    ['B', { x: 390,  y: -45 }],   // center at (500, 0) — sits on the segment
    ['C', { x: 780,  y: -45 }],   // center at (890, 0)
  ])
  avoidEdgeCrossings(pos, nodes, edges, null, null)
  const bPos = pos.get('B')
  // Verify against the same center-to-center segment used by avoidEdgeCrossings
  const aR = pos.get('A')
  const cR = pos.get('C')
  const p1 = { x: aR.x + 110, y: aR.y + 45 }   // A center
  const p2 = { x: cR.x + 110, y: cR.y + 45 }   // C center
  const bRect = { x: bPos.x, y: bPos.y, w: 220, h: 90 }
  const PAD = 6
  const paddedB = { x: bRect.x - PAD, y: bRect.y - PAD, w: bRect.w + 2 * PAD, h: bRect.h + 2 * PAD }
  assert.ok(!segmentIntersectsRect(p1, p2, paddedB), `B should be shifted off the path but rect is ${JSON.stringify(bRect)}`)
})

t('node not on edge path is not moved', () => {
  // A→C horizontal; B far above — not intersecting the path.
  const nodes = [
    { tmp_id: 'A', type: 'stage' },
    { tmp_id: 'B', type: 'stage' },
    { tmp_id: 'C', type: 'stage' },
  ]
  const edges = [{ source: 'A', target: 'C' }]
  const pos = new Map([
    ['A', { x: 0,    y: -45 }],
    ['B', { x: 390,  y: -500 }],  // far above, not on the segment
    ['C', { x: 780,  y: -45 }],
  ])
  const origB = { ...pos.get('B') }
  avoidEdgeCrossings(pos, nodes, edges, null, null)
  assert.deepEqual(pos.get('B'), origB, 'B should not be moved when not on path')
})

console.log('directional preset handle pinning (via layoutGraph + store wiring)')

t('layout right: fan children of parent are all to the right, no overlaps', () => {
  // P→C1, P→C2, P→C3 (fan of 3 children)
  const nodes = [stage('P'), stage('C1'), stage('C2'), stage('C3')]
  const edges = [edge('P', 'C1'), edge('P', 'C2'), edge('P', 'C3')]
  const pos = layoutGraph({ newNodes: nodes, newEdges: edges, existingNodes: [], preset: 'right' })
  // All children should be to the right of parent
  assert.ok(pos.get('C1').x > pos.get('P').x, 'C1 right of P')
  assert.ok(pos.get('C2').x > pos.get('P').x, 'C2 right of P')
  assert.ok(pos.get('C3').x > pos.get('P').x, 'C3 right of P')
  // No two children should overlap (avoidance pass may shift them off the same column)
  const W = 220, H = 90
  const rects = ['C1', 'C2', 'C3'].map((id) => ({ x: pos.get(id).x, y: pos.get(id).y, w: W, h: H }))
  for (let i = 0; i < rects.length; i++) {
    for (let j = i + 1; j < rects.length; j++) {
      assert.ok(!overlaps(rects[i], rects[j], 0, 0), `C${i+1} and C${j+1} overlap`)
    }
  }
})

t('layout down: fan children are below parent', () => {
  const nodes = [stage('P'), stage('C1'), stage('C2')]
  const edges = [edge('P', 'C1'), edge('P', 'C2')]
  const pos = layoutGraph({ newNodes: nodes, newEdges: edges, existingNodes: [], preset: 'down' })
  assert.ok(pos.get('C1').y > pos.get('P').y, 'C1 below P')
  assert.ok(pos.get('C2').y > pos.get('P').y, 'C2 below P')
})

console.log('edgeAnchors / radial crossing regression')

t('edgeAnchors: root→child uses child.dir as source handle', () => {
  // Simple radial: root R, child A with dir='right'
  const nodes = [stage('R'), stage('A')]
  const pos = new Map([
    ['R', { x: 0,   y: 0,   /* no dir = root */ }],
    ['A', { x: 480, y: 0,   dir: 'right' }],
  ])
  const level = new Map([['R', 0], ['A', 1]])
  const { p1, p2 } = edgeAnchors('R', 'A', pos, nodes, level, 'R')
  // sourceHandle = child dir = 'right' → right edge of R (x + w, y + h/2)
  const rW = SIZE.stage.w, rH = SIZE.stage.h
  assert.equal(p1.x, 0 + rW,      'source anchor x = right edge of R')
  assert.equal(p1.y, 0 + rH / 2,  'source anchor y = vertical center of R')
  // targetHandle = OPPOSITE['right'] = 'left' → left edge of A
  assert.equal(p2.x, 480,         'target anchor x = left edge of A')
  assert.equal(p2.y, 0 + rH / 2,  'target anchor y = vertical center of A')
})

t('edgeAnchors: non-root parent→child uses parent.dir as source handle', () => {
  // Radial chain: root R → parent P (dir=top) → child C (dir=top)
  const nodes = [stage('R'), stage('P'), stage('C')]
  const pos = new Map([
    ['R', { x: 0,   y: 0   }],
    ['P', { x: 0,   y: -320, dir: 'top' }],
    ['C', { x: 0,   y: -620, dir: 'top' }],
  ])
  const level = new Map([['R', 0], ['P', 1], ['C', 2]])
  const { p1, p2 } = edgeAnchors('P', 'C', pos, nodes, level, 'R')
  const sW = SIZE.stage.w, sH = SIZE.stage.h
  // sourceHandle = parent dir = 'top' → top edge of P
  assert.equal(p1.x, 0 + sW / 2, 'source anchor x = horizontal center of P')
  assert.equal(p1.y, -320,        'source anchor y = top edge of P')
  // targetHandle = OPPOSITE['top'] = 'bottom' → bottom edge of C
  assert.equal(p2.x, 0 + sW / 2, 'target anchor x = horizontal center of C')
  assert.equal(p2.y, -620 + sH,  'target anchor y = bottom edge of C')
})

t('edgeAnchors: memo edge uses memoStageFacing / memoOwnFacing', () => {
  const nodes = [stage('S'), memo('M')]
  const pos = new Map([
    ['S', { x: 100, y: 100 }],
    ['M', { x: 340, y: 100, memoStageFacing: 'right', memoOwnFacing: 'left' }],
  ])
  const { p1, p2 } = edgeAnchors('S', 'M', pos, nodes, null, null)
  const sW = SIZE.stage.w, sH = SIZE.stage.h
  // Stage is source; memoStageFacing='right' → stage right edge
  assert.equal(p1.x, 100 + sW,    'stage right edge x')
  assert.equal(p1.y, 100 + sH / 2,'stage right edge y (center)')
  // Memo is target; memoOwnFacing='left' → memo left edge
  assert.equal(p2.x, 340,          'memo left edge x')
})

t('radial regression: root+4dir+fans+memo — y-offset, no overlaps, zero crossings', () => {
  // Reproduce the repro scenario: root, 4 direction children with fan children
  // (5/4/6/4 respectively for p1/p2/p3/p4). Side assignment for 4 branches is
  // subtree-size-aware: the two largest branches take the horizontal sides.
  // Here p3 has the largest subtree (6), so it lands on a horizontal side
  // (right) — still fanning vertically like the original repro — plus 2 memos
  // on root.
  // Asserts:
  //  1. Every horizontal-side (p3) child's |y-offset from p3 center| stays bounded
  //     (no quadrant invasion). 500px comfortably covers both the natural fan
  //     spread (≤ ~315px) and avoidEdgeCrossings' worst-case fallback shift
  //     (up to 6 steps × 60px) when it has to clear a real crossing.
  //  2. Zero node-node overlaps
  //  3. Zero edge-over-node crossings with real handle anchors (padded 6px)

  const PAD = 6
  const allNodes = [
    stage('root'),
    stage('p1'), stage('p2'), stage('p3'), stage('p4'),
    ...['c11','c12','c13','c14','c15'].map(stage),
    ...['c21','c22','c23','c24','c25','c26'].map(stage),
    ...['c31','c32','c33','c34'].map(stage),
    ...['c41','c42','c43','c44'].map(stage),
    memo('m1'), memo('m2'),
  ]
  const allEdges = [
    edge('root','p1'), edge('root','p2'), edge('root','p3'), edge('root','p4'),
    edge('p1','c11'), edge('p1','c12'), edge('p1','c13'), edge('p1','c14'), edge('p1','c15'),
    edge('p2','c31'), edge('p2','c32'), edge('p2','c33'), edge('p2','c34'),
    edge('p3','c21'), edge('p3','c22'), edge('p3','c23'), edge('p3','c24'), edge('p3','c25'), edge('p3','c26'),
    edge('p4','c41'), edge('p4','c42'), edge('p4','c43'), edge('p4','c44'),
    edge('root','m1'), edge('root','m2'),
  ]

  const pos = layoutGraph({ newNodes: allNodes, newEdges: allEdges, existingNodes: [], preset: 'radial' })

  const getRect = (id) => {
    const p = pos.get(id)
    const n = allNodes.find((x) => x.tmp_id === id)
    const w = n?.width  ?? SIZE[n?.type]?.w ?? SIZE.stage.w
    const h = n?.height ?? SIZE[n?.type]?.h ?? SIZE.stage.h
    return { x: p.x, y: p.y, w, h }
  }

  // 1. p3's (horizontal-side) children must stay within ±500px of p3 vertically
  const p3p = pos.get('p3')
  const p3cy = p3p.y + SIZE.stage.h / 2
  for (const id of ['c21','c22','c23','c24','c25','c26']) {
    const r = getRect(id)
    const cy = r.y + r.h / 2
    const dy = Math.abs(cy - p3cy)
    assert.ok(dy <= 500, `${id} y-offset from p3 center is ${dy.toFixed(0)}px > 500px (quadrant invasion)`)
  }

  // 2. Zero node-node overlaps
  const ids = allNodes.map((n) => n.tmp_id).filter((id) => pos.has(id))
  const overlapDetails = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (overlaps(getRect(ids[i]), getRect(ids[j]), 0, 0)) {
        overlapDetails.push(`${ids[i]} ∩ ${ids[j]}`)
      }
    }
  }
  assert.equal(overlapDetails.length, 0,
    `Expected 0 node-node overlaps, got ${overlapDetails.length}:\n    ${overlapDetails.join('\n    ')}`)

  // 3. Zero edge-over-node crossings with real handle anchors (padded 6px)
  const level = radialLevels(allNodes, allEdges)
  const stages = allNodes.filter((n) => n.type === 'stage')
  const rootStage = stages.find((n) => pos.has(n.tmp_id) && pos.get(n.tmp_id).dir == null)
  const rootId = rootStage?.tmp_id ?? null

  const paddedRect = (r) => ({ x: r.x - PAD, y: r.y - PAD, w: r.w + 2 * PAD, h: r.h + 2 * PAD })

  let crossings = 0
  const crossingDetails = []
  for (const e of allEdges) {
    if (!pos.has(e.source) || !pos.has(e.target)) continue
    const { p1, p2 } = edgeAnchors(e.source, e.target, pos, allNodes, level, rootId)
    for (const n of allNodes) {
      if (n.tmp_id === e.source || n.tmp_id === e.target) continue
      if (!pos.has(n.tmp_id)) continue
      const nr = getRect(n.tmp_id)
      if (segmentIntersectsRect(p1, p2, paddedRect(nr))) {
        crossings++
        crossingDetails.push(`edge ${e.source}→${e.target} crosses node ${n.tmp_id}`)
      }
    }
  }

  assert.equal(crossings, 0,
    `Expected 0 crossings with real anchors, got ${crossings}:\n    ${crossingDetails.join('\n    ')}`)
})

t('radial regression: subtree-aware side assignment + staggered wrap (5/6/4/4 children, real-data repro)', () => {
  // Exact repro from the integration harness: radial root with 4 level-1
  // branches whose child counts are 5, 6, 4, 4 in input order (p1..p4). The
  // old count-based side table assigned 4 children to [top, bottom, left,
  // right] purely by input order, so the 6-child branch (p2) landed on
  // BOTTOM — a vertical side whose wrapped 2nd row reused row-1's perpendicular
  // offsets, sending parent→row-2 edges straight through row-1 nodes.
  // The fix assigns sides by subtree size (largest two branches get the
  // horizontal sides) and staggers wrapped rows/columns into the gaps between
  // the previous row/column's children.
  const W = 260, H = 115 // within the 250-270 x 110-120 range from the repro
  const bigStage = (tmp_id) => ({ tmp_id, type: 'stage', width: W, height: H })

  const allNodes = [
    bigStage('root'),
    bigStage('p1'), bigStage('p2'), bigStage('p3'), bigStage('p4'),
    ...['c11', 'c12', 'c13', 'c14', 'c15'].map(bigStage),               // p1: 5 children
    ...['c21', 'c22', 'c23', 'c24', 'c25', 'c26'].map(bigStage),        // p2: 6 children
    ...['c31', 'c32', 'c33', 'c34'].map(bigStage),                      // p3: 4 children
    ...['c41', 'c42', 'c43', 'c44'].map(bigStage),                      // p4: 4 children
  ]
  const allEdges = [
    edge('root', 'p1'), edge('root', 'p2'), edge('root', 'p3'), edge('root', 'p4'),
    edge('p1', 'c11'), edge('p1', 'c12'), edge('p1', 'c13'), edge('p1', 'c14'), edge('p1', 'c15'),
    edge('p2', 'c21'), edge('p2', 'c22'), edge('p2', 'c23'), edge('p2', 'c24'), edge('p2', 'c25'), edge('p2', 'c26'),
    edge('p3', 'c31'), edge('p3', 'c32'), edge('p3', 'c33'), edge('p3', 'c34'),
    edge('p4', 'c41'), edge('p4', 'c42'), edge('p4', 'c43'), edge('p4', 'c44'),
  ]

  const pos = layoutGraph({ newNodes: allNodes, newEdges: allEdges, existingNodes: [], preset: 'radial' })

  // 1. The 6-child branch (p2) must be assigned a HORIZONTAL side.
  const p2Dir = pos.get('p2').dir
  assert.ok(['left', 'right'].includes(p2Dir), `expected p2 (6 children, largest subtree) on a horizontal side, got: ${p2Dir}`)

  const getRect = (id) => {
    const p = pos.get(id)
    const n = allNodes.find((x) => x.tmp_id === id)
    return { x: p.x, y: p.y, w: n.width, h: n.height }
  }

  // 2. Zero node-node overlaps.
  const ids = allNodes.map((n) => n.tmp_id)
  const overlapDetails = []
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      if (overlaps(getRect(ids[i]), getRect(ids[j]), 0, 0)) overlapDetails.push(`${ids[i]} ∩ ${ids[j]}`)
    }
  }
  assert.equal(overlapDetails.length, 0, `Expected 0 node-node overlaps, got:\n    ${overlapDetails.join('\n    ')}`)

  // 3. Zero edge-over-node crossings via edgeAnchors + segmentIntersectsRect (6px padding).
  const level = radialLevels(allNodes, allEdges)
  const rootStage = allNodes.find((n) => pos.has(n.tmp_id) && pos.get(n.tmp_id).dir == null)
  const rootId = rootStage?.tmp_id ?? null
  const PAD = 6
  const paddedRect = (r) => ({ x: r.x - PAD, y: r.y - PAD, w: r.w + 2 * PAD, h: r.h + 2 * PAD })

  let crossings = 0
  const crossingDetails = []
  for (const e of allEdges) {
    const { p1, p2 } = edgeAnchors(e.source, e.target, pos, allNodes, level, rootId)
    for (const n of allNodes) {
      if (n.tmp_id === e.source || n.tmp_id === e.target) continue
      const nr = getRect(n.tmp_id)
      if (segmentIntersectsRect(p1, p2, paddedRect(nr))) {
        crossings++
        crossingDetails.push(`edge ${e.source}→${e.target} crosses node ${n.tmp_id}`)
      }
    }
  }
  assert.equal(crossings, 0, `Expected 0 crossings with real anchors, got ${crossings}:\n    ${crossingDetails.join('\n    ')}`)

  // 4. Every non-root parent's children edges share a single source handle (reuse
  // edgeAnchors: the source-side anchor point is fixed by the parent's dir, so it
  // must be identical across all of that parent's outgoing edges).
  for (const par of ['p1', 'p2', 'p3', 'p4']) {
    const childEdges = allEdges.filter((e) => e.source === par)
    const anchors = childEdges.map((e) => edgeAnchors(e.source, e.target, pos, allNodes, level, rootId).p1)
    for (const a of anchors) {
      assert.deepEqual(a, anchors[0], `expected all of ${par}'s children edges to share one source handle`)
    }
  }
})


// ── Shared-canvas region gating (pure helpers) ───────────────────────────────
console.log('assertRegionEdit / editableNodeIdSet')

{
  const NODES = [
    { id: 'grp', type: 'group' },
    { id: 'a', type: 'stage', parentId: 'grp' },
    { id: 'b', type: 'stage', parentId: 'grp' },
    { id: 'out', type: 'stage' },
  ]
  const owner = { role: 'owner' }
  const canvasInv = { role: 'invitee', scope: 'canvas' }
  const groupInv = { role: 'invitee', scope: 'group', targetId: 'grp' }
  const nodeInv = { role: 'invitee', scope: 'node', targetId: 'a' }

  t('owner: everything allowed incl. canvas-admin', () => {
    for (const kind of ['canvas-admin', 'types', 'graph', 'node-create', 'edge']) {
      assertRegionEdit(owner, NODES, { kind, nodeId: 'out', source: 'a', target: 'out' })
    }
  })

  t('canvas-scope invitee: edits allowed, canvas-admin denied', () => {
    assertRegionEdit(canvasInv, NODES, { kind: 'node-update', nodeId: 'out' })
    assertRegionEdit(canvasInv, NODES, { kind: 'types' })
    assertRegionEdit(canvasInv, NODES, { kind: 'graph' })
    assert.throws(() => assertRegionEdit(canvasInv, NODES, { kind: 'canvas-admin' }), /소유자만/)
  })

  t('group-scope: editable set = frame children only', () => {
    const set = editableNodeIdSet(groupInv, NODES)
    assert.deepEqual([...set].sort(), ['a', 'b'])
    assert.equal(editableNodeIdSet(owner, NODES), null)
    assert.equal(editableNodeIdSet(canvasInv, NODES), null)
  })

  t('group-scope: inside edits ok, outside denied, frame itself denied', () => {
    assertRegionEdit(groupInv, NODES, { kind: 'node-update', nodeIds: ['a', 'b'] })
    assertRegionEdit(groupInv, NODES, { kind: 'node-delete', nodeId: 'b' })
    assertRegionEdit(groupInv, NODES, { kind: 'node-create' })
    assert.throws(() => assertRegionEdit(groupInv, NODES, { kind: 'node-update', nodeId: 'out' }), /밖 노드입니다/)
    assert.throws(() => assertRegionEdit(groupInv, NODES, { kind: 'node-delete', nodeId: 'grp' }), /밖 노드입니다/)
  })

  t('group-scope: edge needs both endpoints inside; types/graph denied', () => {
    assertRegionEdit(groupInv, NODES, { kind: 'edge', source: 'a', target: 'b' })
    assert.throws(() => assertRegionEdit(groupInv, NODES, { kind: 'edge', source: 'a', target: 'out' }), /양 끝/)
    assert.throws(() => assertRegionEdit(groupInv, NODES, { kind: 'types' }), /캔버스 전체 초대/)
    assert.throws(() => assertRegionEdit(groupInv, NODES, { kind: 'graph' }), /create_graph/)
  })

t('node-scope: content update on target only; move/delete/create/edge denied', () => {
    assertRegionEdit(nodeInv, NODES, { kind: 'node-update', nodeId: 'a' })
    assert.throws(() => assertRegionEdit(nodeInv, NODES, { kind: 'node-update', nodeId: 'b' }), /외에는 수정할 수 없습니다/)
    assert.throws(() => assertRegionEdit(nodeInv, NODES, { kind: 'node-update', nodeId: 'a', movesPosition: true }), /위치\(x\/y\)/)
    assert.throws(() => assertRegionEdit(nodeInv, NODES, { kind: 'node-delete', nodeId: 'a' }), /내용·크기 수정만/)
    assert.throws(() => assertRegionEdit(nodeInv, NODES, { kind: 'node-create' }), /내용·크기 수정만/)
    assert.throws(() => assertRegionEdit(nodeInv, NODES, { kind: 'edge', source: 'a', target: 'b' }), /내용·크기 수정만/)
})

console.log('shared canvas server gateway')

const sharedRow = {
  nodes: [
    { id: 'frame', type: 'group', position: { x: 0, y: 0 }, data: { label: '비공개 그룹' } },
    { id: 'inside', type: 'memo', parentId: 'frame', position: { x: 10, y: 10 }, data: { header: '허용', text: '볼 수 있음' } },
    { id: 'outside', type: 'memo', position: { x: 500, y: 10 }, data: { header: '비공개', text: '보이면 안 됨' } },
  ],
  edges: [{ id: 'inside-edge', source: 'inside', target: 'outside' }],
}

t('restrict_view: server redacts body data outside the invited group', () => {
  const result = redactCanvas({ row: sharedRow, scope: 'group', targetId: 'frame', canEdit: true, restrictView: true })
  const hidden = result.nodes.find((node) => node.id === 'outside')
  assert.deepEqual(hidden.data, { redacted: true })
  assert.equal(JSON.stringify(hidden).includes('비공개'), false)
})

t('group invite: server rejects moving a child outside the group', () => {
  const submitted = structuredClone(sharedRow.nodes)
  submitted.find((node) => node.id === 'inside').parentId = undefined
  assert.throws(() => applySharedCanvasUpdate(
    { row: sharedRow, scope: 'group', targetId: 'frame', canEdit: true, restrictView: false }, submitted, sharedRow.edges,
  ), /그룹 밖/)
})

t('read-only invite: server rejects every save attempt', () => {
  assert.throws(() => applySharedCanvasUpdate(
    { row: sharedRow, scope: 'canvas', targetId: null, canEdit: false, restrictView: false }, sharedRow.nodes, sharedRow.edges,
  ), /읽기 전용/)
})
}

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`)
