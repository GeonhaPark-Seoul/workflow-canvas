// Unit tests for mcp/layout.js and mcp/sanitize.js — plain node, no deps, no DB.
// Run: node scripts/test-mcp-logic.mjs
import assert from 'node:assert/strict'
import { layoutGraph, findNonOverlapping, validateGraphInput, overlaps, nodeRect } from '../mcp/layout.js'
import { sanitizeHtml } from '../mcp/sanitize.js'

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

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`)
