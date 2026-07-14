// Unit tests for mcp/layout.js and mcp/sanitize.js — plain node, no deps, no DB.
// Run: node scripts/test-mcp-logic.mjs
import assert from 'node:assert/strict'
import { layoutGraph, findNonOverlapping, validateGraphInput, overlaps, nodeRect, radialLevels, segmentIntersectsRect, avoidEdgeCrossings, edgeAnchors, SIZE } from '../mcp/layout.js'
import {
  applyEdgeRelationPatch,
  canCreateWorkflowSystemMap,
  checkRadialLevelMixing,
  editableNodeIdSet,
  assertRegionEdit,
  toExternalCanvasEdge,
  toExternalCanvasNode,
  workflowSystemMapRelationRepairPlanId,
} from '../mcp/store.js'
import { sanitizeHtml, sanitizeTextFields } from '../mcp/sanitize.js'
import { applySharedCanvasUpdate, effectiveShareGrant, pickBestShareAccess, redactCanvas } from '../mcp/shareAccess.js'
import {
  claimSystemRuntimeCheck,
  loadLatestSystemRuntimeObservations,
  persistSystemRuntimeObservation,
  readWorkflowSystemOperations,
  requireSystemRuntimeOperator,
  resolveSystemRuntimeTarget,
  resolveSystemRuntimeTargets,
  runSystemRuntimeCapability,
  WORKFLOW_SYSTEM_OPERATIONS_RPC,
} from '../mcp/systemRuntime.js'
import { sanitizeExternalUrl as sanitizeBrowserUrl, sanitizeHtml as sanitizeBrowserHtml, sanitizeNodeData as sanitizeBrowserNodeData } from '../src/lib/sanitizeHtml.js'
import { appendHistorySnapshot, sameCanvasSnapshot } from '../src/lib/canvasSync.js'
import { absoluteNodePosition, boundsForNodeIds } from '../src/lib/canvasGeometry.js'
import { mergeCanvasSnapshots } from '../src/lib/canvasMerge.js'
import { getStubEdgeGeometry } from '../src/edges/stubEdgeGeometry.js'
import { chooseOwnCanvasToRestore } from '../src/lib/canvasNavigation.js'
import { nativeWheelScrollTarget } from '../src/lib/wheelRouting.js'
import { claimShareLaunchFallback, shareTokenFingerprint } from '../src/lib/shareLaunchCoordinator.js'
import {
  canvasWriteError,
  CanvasSchemaGuardError,
  RELATION_METADATA_GUARD_MARKER,
} from '../src/lib/canvasSchemaGuard.js'
import { createSystemNodeData, normalizeSystemNodeData, systemNodeReality } from '../shared/systemOntology.js'
import {
  detachSystemPartBindings,
  normalizeSystemPart,
  normalizeSystemParts,
  validateSystemPartInput,
} from '../shared/systemPartOntology.js'
import {
  createEdgeRelationData,
  edgeRelationInfo,
  edgeRelationProvenance,
  normalizeEdgeRelationData,
  RELATION_CONFIDENCE_DEFS,
  RELATION_DEFS,
  RELATION_FAMILY_DEFS,
  RELATION_SOURCE_DEFS,
} from '../shared/relationOntology.js'
import { createWorkflowCanvasSystemMap } from '../shared/workflowCanvasSystemMap.js'
import { WORKFLOW_SYSTEM_DISCOVERY } from '../shared/workflowSystemDiscoveryManifest.js'
import {
  inspectWorkflowSystemMap,
  LEGACY_SYSTEM_MAP_BASELINE_ID,
  selectWorkflowSystemMapBaseline,
} from '../shared/workflowSystemDiscovery.js'
import {
  planWorkflowSystemMapRelationRepair,
  restoreMissingWorkflowSystemMapRelations,
  WORKFLOW_RELATION_REPAIR_CONFIRMATION,
} from '../shared/workflowSystemMapRepair.js'
import {
  clearDigitalTwinReviewDecision,
  createDigitalTwinReviewItem,
  digitalTwinReviewFingerprint,
  partitionDigitalTwinReviewItems,
  setDigitalTwinReviewDecision,
} from '../shared/digitalTwinReview.js'
import {
  applyDigitalTwinGraphProposal,
  createDigitalTwinGraphProposal,
  digitalTwinProposalAutoFitKey,
  digitalTwinProposalMatchesItem,
  filterDigitalTwinProposalNodeChanges,
  planDigitalTwinGraphProposal,
  previewDigitalTwinPartChanges,
} from '../shared/digitalTwinProposal.js'
import {
  inspectWorkflowSystemTwin,
  WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
} from '../shared/workflowSystemTwinAdapter.js'
import {
  SYSTEM_OBSERVATION_CATALOGS,
  systemObservationAvailabilityDefinition,
  systemObservationCategoryDefinition,
  systemObservationRefreshDefinition,
} from '../shared/systemObservationCatalog.js'
import {
  SYSTEM_CAPABILITY_OPERATION_DEFS,
  normalizeSystemRuntimeBatchRequest,
  normalizeSystemRuntimeCanvasRequest,
  normalizeSystemRuntimeRecords,
  normalizeSystemRuntimeRequest,
  normalizeSystemRuntimeResult,
  systemCapabilityOperationDefinition,
  systemPartRuntimeReality,
  systemRuntimeCatalogForResult,
  systemRuntimeCapabilityForPart,
  systemRuntimePathEdgeIds,
} from '../shared/systemRuntime.js'
import { buildDiscoveryManifest } from './system-discovery.mjs'
import { recordCanvasDataAccess } from '../mcp/dataAccessAudit.js'
import {
  composeSharePermission,
  editableNodeIdSetForPermission,
  permissionCanEditEdge,
  visibleNodeIdSetForPermission,
} from '../shared/sharePermissions.js'
import {
  assertPrivacyReleaseGate,
  CANVAS_ENCRYPTION_TRANSITION,
  CANVAS_PRIVACY_CAPABILITIES,
} from '../shared/privacyCapabilities.js'

let passed = 0
function t(name, fn) {
  try { fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 }
}

async function ta(name, fn) {
  try { await fn(); passed++; console.log(`  ✓ ${name}`) }
  catch (e) { console.error(`  ✗ ${name}\n    ${e.message}`); process.exitCode = 1 }
}

const stage = (tmp_id) => ({ tmp_id, type: 'stage' })
const memo = (tmp_id) => ({ tmp_id, type: 'memo' })
const system = (tmp_id, systemKind = 'service') => ({ tmp_id, type: 'system', systemKind })
const edge = (source, target) => ({ source, target })

console.log('stub edge geometry')

t('main 45px handles are corrected from their outside edge to the node border', () => {
  const horizontal = getStubEdgeGeometry({
    sourceX: 222.5, sourceY: 100,
    targetX: 377.5, targetY: 100,
    sourcePosition: 'right', targetPosition: 'left',
    sourceHandleId: 'right', targetHandleId: 'left',
  })
  assert.deepEqual(horizontal.source, { x: 199, y: 100 })
  assert.deepEqual(horizontal.target, { x: 401, y: 100 })
  assert.equal(horizontal.labelX, 300)
  assert.equal(horizontal.labelY, 100)

  const vertical = getStubEdgeGeometry({
    sourceX: 100, sourceY: 77.5,
    targetX: 100, targetY: 322.5,
    sourcePosition: 'top', targetPosition: 'bottom',
    sourceHandleId: 'top', targetHandleId: 'bottom',
  })
  assert.deepEqual(vertical.source, { x: 100, y: 101 })
  assert.deepEqual(vertical.target, { x: 100, y: 299 })
})

t('visible part sockets keep their own outside-edge anchors', () => {
  const geometry = getStubEdgeGeometry({
    sourceX: 210, sourceY: 120,
    targetX: 390, targetY: 120,
    sourcePosition: 'right', targetPosition: 'left',
    sourceHandleId: 'p-a-r', targetHandleId: 'p-b-l',
  })
  assert.deepEqual(geometry.source, { x: 210, y: 120 })
  assert.deepEqual(geometry.target, { x: 390, y: 120 })
})

console.log('layoutGraph')

t('linear chain A→B→C: 3 columns, same row', () => {
  const pos = layoutGraph({ newNodes: [stage('A'), stage('B'), stage('C')], newEdges: [edge('A', 'B'), edge('B', 'C')], existingNodes: [] })
  assert.equal(pos.get('B').x - pos.get('A').x, 320)
  assert.equal(pos.get('C').x - pos.get('B').x, 320)
  assert.equal(pos.get('A').y, pos.get('B').y)
  assert.equal(pos.get('B').y, pos.get('C').y)
})

t('system entities participate in the same structural layout as stages', () => {
  const pos = layoutGraph({
    newNodes: [system('APP', 'frontend'), system('API', 'api'), system('DB', 'database')],
    newEdges: [edge('APP', 'API'), edge('API', 'DB')],
    existingNodes: [],
  })
  assert.equal(pos.get('API').x - pos.get('APP').x, 320)
  assert.equal(pos.get('DB').x - pos.get('API').x, 320)
  assert.equal(pos.get('APP').y, pos.get('DB').y)
})

t('mixed stage and system graph can be laid out radially with a linked memo', () => {
  const nodes = [
    stage('ROOT'), system('WEB', 'frontend'), system('AUTH', 'auth'),
    system('API', 'api'), system('DB', 'database'), memo('WHY'),
  ]
  const edges = [
    edge('ROOT', 'WEB'), edge('ROOT', 'AUTH'), edge('ROOT', 'API'),
    edge('ROOT', 'DB'), edge('WHY', 'DB'),
  ]
  const pos = layoutGraph({ newNodes: nodes, newEdges: edges, existingNodes: [], preset: 'radial' })
  for (const node of nodes) assert.ok(pos.has(node.tmp_id), `missing position: ${node.tmp_id}`)
  assert.equal(radialLevels(nodes, edges).get('ROOT'), 0)
  assert.equal(radialLevels(nodes, edges).get('DB'), 1)
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

t('nodeRect uses frontend defaults for content, system and group nodes', () => {
  assert.deepEqual(nodeRect({ type: 'content', position: { x: 1, y: 2 } }), { x: 1, y: 2, w: 220, h: 140 })
  assert.deepEqual(nodeRect({ type: 'system', position: { x: 2, y: 3 } }), { x: 2, y: 3, w: 240, h: 130 })
  assert.deepEqual(nodeRect({ type: 'group', position: { x: 3, y: 4 } }), { x: 3, y: 4, w: 320, h: 220 })
})

console.log('system ontology')

t('new system nodes are declared models, never self-verified twins', () => {
  const data = createSystemNodeData('database')
  assert.equal(data.systemKind, 'database')
  assert.equal(data.sourceKind, 'manual')
  assert.equal(systemNodeReality(data).id, 'declared')
  assert.equal(systemNodeReality({
    ...data,
    twinRuntime: { verification: 'verified', resourceId: 'db-1' },
  }).id, 'declared')
})

t('server-shaped verification evidence promotes a system model to LIVE', () => {
  const result = systemNodeReality({
    twinRuntime: {
      verification: 'verified',
      resourceId: 'db-1',
      verifiedAt: '2026-07-14T00:00:00.000Z',
    },
  })
  assert.equal(result.id, 'twin')
  assert.equal(result.label, 'LIVE')
})

t('system metadata normalization clamps enums and plain identifiers', () => {
  const result = normalizeSystemNodeData({
    systemKind: 'not-a-kind', environment: 'moon', sourceKind: 'guess',
    provider: '  Supabase\n  Cloud  ', externalRef: ' table\u0000name ',
  })
  assert.equal(result.systemKind, 'service')
  assert.equal(result.environment, 'unknown')
  assert.equal(result.sourceKind, 'manual')
  assert.equal(result.provider, 'Supabase Cloud')
  assert.equal(result.externalRef, 'table name')
})

t('system parts keep only the generic allowlist and reject literal credentials', () => {
  const safe = normalizeSystemPart({
    id: 'supabase-anon-ref', kind: 'credential_ref', label: 'Supabase 공개 키',
    ref: 'SUPABASE_ANON_KEY', exposure: 'public', sourceKind: 'code',
    evidenceRef: 'src/lib/supabase.js', rawValue: 'must-not-survive',
  })
  assert.deepEqual(safe, {
    id: 'supabase-anon-ref', kind: 'credential_ref', label: 'Supabase 공개 키',
    ref: 'SUPABASE_ANON_KEY', exposure: 'public', sourceKind: 'code',
    evidenceRef: 'src/lib/supabase.js',
  })
  assert.match(validateSystemPartInput({
    ...safe,
    ref: 'eyJhbGciOiJIUzI1NiJ9.aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb',
  }), /실제 키나 토큰/)
  assert.deepEqual(normalizeSystemParts([{ ...safe, ref: 'eyJhbGciOiJIUzI1NiJ9.aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb' }]), [])
})

t('copying a system part removes digital-twin identity without losing its visible definition', () => {
  const copied = detachSystemPartBindings([{
    id: 'part-one', kind: 'connection', label: '주문 API', ref: '/api/orders',
    exposure: 'internal', sourceKind: 'code', evidenceRef: 'api/orders.js',
    digitalTwinBinding: {
      sourceId: 'source-one', entityKey: 'api:/orders', observedFingerprint: 'abcdef1234567890',
    },
  }])
  assert.equal(copied.length, 1)
  assert.equal(copied[0].label, '주문 API')
  assert.equal(Object.hasOwn(copied[0], 'digitalTwinBinding'), false)
})

t('MCP system patches sanitize provided identifiers without inventing defaults', () => {
  const patch = {
    externalRef: ' public.\u0000canvases ',
    systemParts: [{
      id: 'orders-api', kind: 'connection', label: '주문 API', ref: '/api/orders',
      exposure: 'internal', sourceKind: 'code', evidenceRef: 'api/orders.js', ignored: 'drop',
    }],
  }
  sanitizeTextFields(patch)
  assert.equal(patch.externalRef, 'public. canvases')
  assert.equal(patch.systemParts[0].ref, '/api/orders')
  assert.equal(Object.hasOwn(patch.systemParts[0], 'ignored'), false)
  assert.equal(Object.hasOwn(patch, 'systemKind'), false)
  assert.equal(Object.hasOwn(patch, 'sourceKind'), false)
})

t('browser persistence sanitizer removes every runtime-only field and active markup', () => {
  const result = sanitizeBrowserNodeData({
    systemKind: 'database', purpose: '<script>steal()</script><b>원본 보관</b>',
    twinRuntime: { verification: 'verified', resourceId: 'forged', verifiedAt: '2026-07-14T00:00:00Z' },
    systemPartRuntime: { 'key-ref': { status: 'healthy' } },
    canRunSystemChecks: true,
    onCheckSystemPart: 'forged-callback',
  })
  assert.equal(Object.hasOwn(result, 'twinRuntime'), false)
  assert.equal(Object.hasOwn(result, 'systemPartRuntime'), false)
  assert.equal(Object.hasOwn(result, 'canRunSystemChecks'), false)
  assert.equal(Object.hasOwn(result, 'onCheckSystemPart'), false)
  assert.equal(result.purpose, '<b>원본 보관</b>')
})

console.log('system runtime capability boundary')

const runtimeCredentialPart = {
  id: 'supabase-anon-ref',
  kind: 'credential_ref',
  label: 'Supabase 공개 클라이언트 키',
  ref: 'SUPABASE_ANON_KEY',
  exposure: 'public',
  sourceKind: 'code',
  evidenceRef: 'src/lib/supabase.js',
  digitalTwinBinding: {
    sourceId: 'workflow-canvas:self-system',
    entityKey: 'credential-reference:SUPABASE_ANON_KEY',
    observedFingerprint: 'abcdef1234567890',
  },
}

const runtimeCanvasOperationsPart = {
  id: 'map-part-own-canvas-summary',
  kind: 'output',
  label: '캔버스 서비스 운영 현황',
  ref: 'workflow.supabase.canvas-service.operations',
  exposure: 'internal',
  sourceKind: 'code',
  evidenceRef: 'mcp/systemRuntime.js, supabase-runtime-read.sql',
  digitalTwinBinding: {
    sourceId: 'workflow-canvas:self-system',
    entityKey: 'runtime-capability:workflow.supabase.canvas-service.operations',
    observedFingerprint: '1234567890abcdef',
  },
}

const runtimeCanvas = {
  nodes: [
    {
      id: 'map-web-app',
      type: 'system',
      data: { systemParts: [runtimeCredentialPart] },
    },
    {
      id: 'map-canvases-table',
      type: 'system',
      data: { systemParts: [runtimeCanvasOperationsPart] },
    },
  ],
}

t('runtime requests accept identifiers only and reject URLs or credential material', () => {
  assert.deepEqual(normalizeSystemRuntimeRequest({
    canvasId: 'canvas-1', nodeId: 'map-web-app', partId: 'supabase-anon-ref',
  }), {
    canvasId: 'canvas-1', nodeId: 'map-web-app', partId: 'supabase-anon-ref',
  })
  for (const forged of [
    { url: 'https://attacker.example' },
    { token: 'stolen-token' },
    { key: 'stolen-key' },
  ]) {
    assert.throws(() => normalizeSystemRuntimeRequest({
      canvasId: 'canvas-1', nodeId: 'map-web-app', partId: 'supabase-anon-ref', ...forged,
    }), /허용되지 않은 항목/)
  }
  assert.deepEqual(normalizeSystemRuntimeCanvasRequest({ canvasId: 'canvas-1' }), { canvasId: 'canvas-1' })
  assert.deepEqual(normalizeSystemRuntimeBatchRequest({ canvasId: 'canvas-1', action: 'check_all' }), {
    canvasId: 'canvas-1', action: 'check_all',
  })
  assert.throws(
    () => normalizeSystemRuntimeCanvasRequest({ canvasId: 'canvas-1', token: 'forbidden' }),
    /허용되지 않은 항목/,
  )
  assert.throws(
    () => normalizeSystemRuntimeBatchRequest({ canvasId: 'canvas-1', action: 'delete_all' }),
    /허용되지 않은 항목/,
  )
})

t('capability operations distinguish observation, mutation, approval, automation and recovery risk', () => {
  assert.deepEqual(
    SYSTEM_CAPABILITY_OPERATION_DEFS.map((definition) => definition.id),
    ['observe', 'read', 'validate', 'subscribe', 'execute', 'create', 'update', 'delete', 'approve', 'automate', 'restore'],
  )
  assert.equal(systemCapabilityOperationDefinition('observe').sideEffect, 'none')
  assert.equal(systemCapabilityOperationDefinition('delete').sideEffect, 'destructive')
  assert.equal(systemCapabilityOperationDefinition('delete').risk, 'critical')
  assert.equal(systemCapabilityOperationDefinition('automate').sideEffect, 'recurring')
  assert.equal(systemCapabilityOperationDefinition('unknown'), null)
})

t('observation catalogs register bounded fields, provenance and explicit unavailable states', () => {
  for (const [capabilityId, fields] of Object.entries(SYSTEM_OBSERVATION_CATALOGS)) {
    assert.ok(fields.length > 0 && fields.length <= 64, `catalog size invalid: ${capabilityId}`)
    assert.equal(new Set(fields.map((field) => field.id)).size, fields.length, `duplicate field: ${capabilityId}`)
    for (const field of fields) {
      assert.ok(field.category)
      assert.ok(field.valueType)
      assert.ok(field.sourceKind)
      assert.ok(field.refreshMode)
      assert.ok(field.evidenceRef)
    }
  }
  const operations = systemRuntimeCatalogForResult('workflow.supabase.canvas-service.operations', null)
  assert.equal(operations.length, 27)
  assert.equal(operations.find((item) => item.id === 'canvas-bodies').availability, 'protected')
  assert.equal(operations.find((item) => item.id === 'database-size').availability, 'connector_required')
  assert.equal(systemObservationAvailabilityDefinition('protected').label, '보호됨')
  assert.equal(systemObservationCategoryDefinition('collaboration').label, '공유·협업')
  assert.equal(systemObservationRefreshDefinition('on_deploy').label, '배포 시')
})

t('only the exact persisted digital-twin part receives the registered capability', () => {
  assert.equal(
    systemRuntimeCapabilityForPart(runtimeCredentialPart, 'map-web-app')?.id,
    'workflow.supabase.user-canvases.read',
  )
  assert.equal(systemRuntimeCapabilityForPart(runtimeCredentialPart, 'different-node'), null)
  const { digitalTwinBinding, ...copiedPart } = runtimeCredentialPart
  assert.equal(systemRuntimeCapabilityForPart(copiedPart, 'map-web-app'), null)
  assert.equal(systemRuntimeCapabilityForPart({
    ...runtimeCredentialPart,
    digitalTwinBinding: { ...digitalTwinBinding, entityKey: 'credential-reference:OTHER_KEY' },
  }, 'map-web-app'), null)
  assert.equal(
    systemRuntimeCapabilityForPart(runtimeCanvasOperationsPart, 'map-canvases-table')?.id,
    'workflow.supabase.canvas-service.operations',
  )
  assert.equal(systemRuntimeCapabilityForPart({
    ...runtimeCanvasOperationsPart,
    ref: 'attacker.arbitrary-query',
  }, 'map-canvases-table'), null)
})

t('runtime target resolution requires the owner and the server-saved allowlisted part', () => {
  const target = resolveSystemRuntimeTarget({
    canvas: runtimeCanvas,
    actorUserId: 'owner-1',
    ownerUserId: 'owner-1',
    nodeId: 'map-web-app',
    partId: 'supabase-anon-ref',
  })
  assert.equal(target.capability.id, 'workflow.supabase.user-canvases.read')
  const operationsTarget = resolveSystemRuntimeTarget({
    canvas: runtimeCanvas,
    actorUserId: 'owner-1',
    ownerUserId: 'owner-1',
    nodeId: 'map-canvases-table',
    partId: 'map-part-own-canvas-summary',
  })
  assert.equal(operationsTarget.capability.id, 'workflow.supabase.canvas-service.operations')
  assert.throws(() => resolveSystemRuntimeTarget({
    canvas: runtimeCanvas,
    actorUserId: 'invitee-1',
    ownerUserId: 'owner-1',
    nodeId: 'map-web-app',
    partId: 'supabase-anon-ref',
  }), /운영자만/)
  assert.throws(() => resolveSystemRuntimeTarget({
    canvas: { nodes: [{ ...runtimeCanvas.nodes[0], data: { systemParts: [{ ...runtimeCredentialPart, digitalTwinBinding: undefined }] } }] },
    actorUserId: 'owner-1',
    ownerUserId: 'owner-1',
    nodeId: 'map-web-app',
    partId: 'supabase-anon-ref',
  }), /허용된 시스템 작업/)

  const targets = resolveSystemRuntimeTargets({
    canvas: runtimeCanvas,
    actorUserId: 'owner-1',
    ownerUserId: 'owner-1',
  })
  assert.deepEqual(targets.map((item) => item.capability.id), [
    'workflow.supabase.user-canvases.read',
    'workflow.supabase.canvas-service.operations',
  ])
  assert.throws(() => resolveSystemRuntimeTargets({
    canvas: runtimeCanvas,
    actorUserId: 'invitee-1',
    ownerUserId: 'owner-1',
  }), /운영자만/)
})

t('system runtime operator authority is separate from ordinary canvas ownership', () => {
  assert.equal(requireSystemRuntimeOperator('operator-1', ' operator-1 '), 'operator-1')
  assert.throws(
    () => requireSystemRuntimeOperator('ordinary-owner', 'operator-1'),
    (error) => error.code === 'SYSTEM_OPERATOR_REQUIRED' && error.status === 403,
  )
  assert.throws(
    () => requireSystemRuntimeOperator('ordinary-owner', ''),
    (error) => error.code === 'SYSTEM_OPERATOR_NOT_CONFIGURED' && error.status === 503,
  )
})

t('runtime checks are rate-limited per owner, canvas, node and part key', () => {
  const checks = new Map()
  claimSystemRuntimeCheck(checks, 'owner:canvas:node:part', 1_000, 3_000)
  assert.throws(
    () => claimSystemRuntimeCheck(checks, 'owner:canvas:node:part', 2_000, 3_000),
    /잠시 후/,
  )
  claimSystemRuntimeCheck(checks, 'owner:canvas:node:part', 4_000, 3_000)
})

t('runtime rate-limit memory remains bounded under forged unique identifiers', () => {
  const checks = new Map()
  for (let index = 0; index < 1_010; index += 1) {
    claimSystemRuntimeCheck(checks, `owner:canvas:node:part-${index}`, 1_000, 3_000)
  }
  assert.equal(checks.size, 1_000)
})

t('runtime results clamp public fields and map only server-known capabilities', () => {
  const result = normalizeSystemRuntimeResult({
    capabilityId: 'workflow.supabase.user-canvases.read',
    status: 'healthy',
    verification: 'verified',
    resourceId: 'workflow-supabase:canvases-user-read',
    checkedAt: '2026-07-14T00:00:00.000Z',
    latencyMs: 99_999,
    summary: ` 연결됨 ${'x'.repeat(300)} `,
    secret: 'must-not-survive',
  })
  assert.equal(result.latencyMs, 30_000)
  assert.equal(result.summary.length, 180)
  assert.equal(result.authorization, 'system_operator')
  assert.equal(result.dataScope, 'operator_canary')
  assert.equal(Object.hasOwn(result, 'secret'), false)
  const checkedAt = Date.parse(result.checkedAt)
  assert.equal(systemPartRuntimeReality(result, checkedAt + 1_000).id, 'healthy')
  assert.equal(systemPartRuntimeReality(result, checkedAt + 15 * 60 * 1000 + 1).id, 'stale')
  assert.equal(systemPartRuntimeReality({ status: 'checking' }).id, 'checking')
  assert.equal(systemPartRuntimeReality(null).id, 'unknown')
  assert.throws(() => normalizeSystemRuntimeResult({
    ...result, capabilityId: 'attacker.arbitrary-request',
  }), /등록되지 않은/)
})

t('application metric groups preserve aggregate counts only and discard user or row data', () => {
  const result = normalizeSystemRuntimeResult({
    capabilityId: 'workflow.supabase.canvas-service.operations',
    status: 'healthy',
    verification: 'verified',
    resourceId: 'workflow-supabase:canvas-service-operations',
    checkedAt: '2026-07-15T00:00:00.000Z',
    latencyMs: 18,
    summary: '요약',
    items: Array.from({ length: 20 }, (_, index) => ({
      id: `metric-group-${index}`,
      title: `운영 지표 ${index}`,
      ...(index === 0 ? { updatedAt: '2026-07-15T00:00:00.000Z' } : {}),
      metrics: [
        { id: 'canvases', label: '캔버스', value: index },
      ],
      nodes: [{ secretBody: true }],
      ownerEmail: 'private@example.com',
      userIds: ['private-user-id'],
    })),
    arbitrarySql: 'select * from auth.users',
  })
  assert.equal(result.resultKind, 'metric_groups')
  assert.equal(result.authorization, 'system_operator')
  assert.equal(result.dataScope, 'application_aggregate')
  assert.equal(result.items.length, 12)
  assert.equal(result.totalCount, 12)
  assert.equal(result.truncated, true)
  assert.equal(result.items[0].metrics[0].value, 0)
  assert.equal(Object.hasOwn(result.items[0], 'nodes'), false)
  assert.equal(Object.hasOwn(result.items[0], 'ownerEmail'), false)
  assert.equal(Object.hasOwn(result.items[0], 'userIds'), false)
  assert.equal(Object.hasOwn(result, 'arbitrarySql'), false)
  assert.equal(systemPartRuntimeReality(result).label, '운영 조회')
})

t('generic observation catalogs keep allowlisted scalars, explain missing fields and block credentials', () => {
  const result = normalizeSystemRuntimeResult({
    capabilityId: 'workflow.vercel.deployment.runtime',
    status: 'healthy',
    verification: 'verified',
    resourceId: 'workflow-vercel:production-runtime',
    checkedAt: '2026-07-15T00:00:00.000Z',
    latencyMs: 4,
    summary: '배포 함수가 실행 중입니다.',
    collectionLabel: '배포 관측',
    observations: [
      { id: 'runtime-active', value: true, availability: 'available' },
      { id: 'environment', value: 'production', availability: 'available' },
      {
        id: 'region', value: 'icn1', availability: 'available', ownerEmail: 'private@example.com',
        rowBody: { private: true }, category: 'forged', label: 'forged', evidenceRef: 'forged',
      },
      { id: 'commit', value: '1234567890ab', availability: 'available' },
      { id: 'host', value: 'workflow.example.com', availability: 'available' },
      { id: 'attacker-field', value: 'must-not-survive', availability: 'available' },
    ],
  })
  assert.equal(result.operation, 'observe')
  assert.equal(result.sideEffect, 'none')
  assert.equal(result.risk, 'none')
  assert.equal(result.catalog.length, 7)
  assert.equal(result.availableCatalogCount, 5)
  assert.equal(result.observations.length, 5)
  assert.equal(result.totalCount, 5)
  assert.equal(result.truncated, false)
  assert.equal(result.catalog.find((item) => item.id === 'region').value, 'icn1')
  assert.equal(result.catalog.find((item) => item.id === 'region').category, 'deployment')
  assert.equal(result.catalog.find((item) => item.id === 'region').evidenceRef, 'VERCEL_REGION')
  assert.equal(result.catalog.find((item) => item.id === 'deployment-history').availability, 'connector_required')
  assert.equal(result.catalog.some((item) => item.id === 'attacker-field'), false)
  assert.equal(Object.hasOwn(result.catalog.find((item) => item.id === 'region'), 'ownerEmail'), false)
  assert.equal(Object.hasOwn(result.catalog.find((item) => item.id === 'region'), 'rowBody'), false)
  assert.deepEqual(systemRuntimePathEdgeIds('workflow.api.shared-canvas.health'), ['map-edge-vercel-shared'])
  assert.deepEqual(systemRuntimePathEdgeIds('unknown'), [])

  const token = `eyJ${'a'.repeat(20)}.${'b'.repeat(12)}.${'c'.repeat(12)}`
  assert.throws(() => normalizeSystemRuntimeResult({
    ...result, observations: [{ id: 'host', value: token, availability: 'available' }],
  }), (error) => error.code === 'SECRET_VALUE_BLOCKED')
  assert.throws(() => normalizeSystemRuntimeResult({ ...result, summary: token }), (error) => (
    error.code === 'SECRET_VALUE_BLOCKED'
  ))
})

t('runtime record lists accept one latest result per persisted node and part key', () => {
  const result = normalizeSystemRuntimeResult({
    capabilityId: 'workflow.supabase.user-canvases.read',
    status: 'healthy',
    verification: 'verified',
    resourceId: 'workflow-supabase:canvases-user-read',
    checkedAt: '2026-07-15T00:00:00.000Z',
    latencyMs: 3,
    summary: '정상',
  })
  const records = normalizeSystemRuntimeRecords([
    { nodeId: 'map-web-app', partId: 'supabase-anon-ref', result, privateRow: true },
    { nodeId: 'map-web-app', partId: 'supabase-anon-ref', result: { ...result, status: 'failed' } },
  ])
  assert.equal(records.length, 1)
  assert.equal(records[0].result.status, 'healthy')
  assert.equal(Object.hasOwn(records[0], 'privateRow'), false)
})

await ta('the Supabase adapter uses a fixed HEAD/RLS request and returns no secrets or row body', async () => {
  const calls = []
  const times = [1_000, 1_025]
  const accessToken = 'private-user-access-token'
  const anonKey = 'public-anon-key-for-test'
  const result = await runSystemRuntimeCapability({
    capabilityId: 'workflow.supabase.user-canvases.read',
    actorUserId: 'owner-1',
    accessToken,
    supabaseUrl: 'https://project.supabase.co',
    supabaseAnonKey: anonKey,
    now: () => times.shift(),
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options })
      return {
        ok: true,
        status: 200,
        get text() { throw new Error('response body must not be read') },
      }
    },
  })
  assert.equal(calls.length, 1)
  const endpoint = new URL(calls[0].url)
  assert.equal(endpoint.origin, 'https://project.supabase.co')
  assert.equal(endpoint.pathname, '/rest/v1/canvases')
  assert.equal(endpoint.searchParams.get('select'), 'canvas_id')
  assert.equal(endpoint.searchParams.get('user_id'), 'eq.owner-1')
  assert.equal(endpoint.searchParams.get('limit'), '1')
  assert.equal(calls[0].options.method, 'HEAD')
  assert.equal(calls[0].options.redirect, 'error')
  assert.equal(calls[0].options.headers.apikey, anonKey)
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${accessToken}`)
  assert.equal(result.status, 'healthy')
  assert.equal(result.latencyMs, 25)
  assert.equal(result.catalog.find((item) => item.id === 'rls-path').value, true)
  assert.equal(result.catalog.find((item) => item.id === 'policy-name').availability, 'not_observed')
  assert.equal(result.catalog.find((item) => item.id === 'row-body').availability, 'protected')
  assert.equal(normalizeSystemRuntimeResult(result).catalog.find((item) => item.id === 'rls-path').value, true)
  assert.equal(JSON.stringify(result).includes(accessToken), false)
  assert.equal(JSON.stringify(result).includes(anonKey), false)
})

await ta('deployment, API route, MCP route and Auth runners expose only fixed operational evidence', async () => {
  const deployment = await runSystemRuntimeCapability({
    capabilityId: 'workflow.vercel.deployment.runtime',
    actorUserId: 'owner-1',
    deploymentContext: {
      isVercel: true,
      environment: 'production',
      region: 'icn1',
      commitSha: '1234567890abcdef1234567890abcdef',
      host: 'workflow.example.com',
    },
    now: () => Date.parse('2026-07-15T00:00:00.000Z'),
  })
  assert.equal(deployment.status, 'healthy')
  assert.equal(deployment.observations.find((item) => item.id === 'commit').value, '1234567890ab')
  assert.equal(deployment.observations.find((item) => item.id === 'host').value, 'workflow.example.com')
  assert.equal(deployment.catalog.find((item) => item.id === 'deployment-history').availability, 'connector_required')

  const routeCalls = []
  const routeNow = (() => {
    const values = [1_000, 1_001, 1_016, 2_000, 2_001, 2_018]
    return () => values.shift()
  })()
  const sharedRoute = await runSystemRuntimeCapability({
    capabilityId: 'workflow.api.shared-canvas.health',
    actorUserId: 'owner-1',
    accessToken: 'private-browser-token',
    runtimeBaseUrl: 'https://workflow.example.com',
    now: routeNow,
    fetchImpl: async (url, options) => {
      routeCalls.push({ url: String(url), options })
      return { status: 204, headers: { get: () => '' } }
    },
  })
  assert.equal(sharedRoute.status, 'healthy')
  assert.equal(routeCalls[0].url, 'https://workflow.example.com/api/shared-canvas?mode=health')
  assert.equal(routeCalls[0].options.headers.Authorization, 'Bearer private-browser-token')
  assert.equal(sharedRoute.catalog.find((item) => item.id === 'authentication').value, true)
  assert.equal(sharedRoute.catalog.find((item) => item.id === 'response-body').availability, 'protected')
  assert.equal(JSON.stringify(sharedRoute).includes('private-browser-token'), false)

  const mcpRoute = await runSystemRuntimeCapability({
    capabilityId: 'workflow.api.mcp.route',
    actorUserId: 'owner-1',
    runtimeBaseUrl: 'https://workflow.example.com',
    now: routeNow,
    fetchImpl: async (url, options) => {
      routeCalls.push({ url: String(url), options })
      return { status: 405, headers: { get: (name) => name.toLowerCase() === 'allow' ? 'POST' : '' } }
    },
  })
  assert.equal(mcpRoute.status, 'degraded')
  assert.equal(mcpRoute.verification, 'partial')
  assert.equal(routeCalls[1].url, 'https://workflow.example.com/api/mcp')
  assert.equal(mcpRoute.catalog.find((item) => item.id === 'allowed-method').value, 'POST')
  assert.equal(mcpRoute.catalog.find((item) => item.id === 'tool-invocation').availability, 'not_observed')

  let verifiedToken = ''
  const authNow = (() => { const values = [3_000, 3_011]; return () => values.shift() })()
  const auth = await runSystemRuntimeCapability({
    capabilityId: 'workflow.supabase.auth.session',
    actorUserId: 'owner-1',
    accessToken: 'private-auth-token',
    verifyAccessToken: async (token) => { verifiedToken = token; return { id: 'owner-1', email: 'private@example.com' } },
    now: authNow,
  })
  assert.equal(verifiedToken, 'private-auth-token')
  assert.equal(auth.status, 'healthy')
  assert.equal(auth.catalog.find((item) => item.id === 'identity-payload').availability, 'protected')
  assert.equal(JSON.stringify(auth).includes('private-auth-token'), false)
  assert.equal(JSON.stringify(auth).includes('private@example.com'), false)
})

await ta('the application operations adapter calls only the fixed service-role aggregate RPC', async () => {
  const rpcCalls = []
  const times = [5_000, 5_032]
  const privateUserId = 'private-user-id'
  const db = {
    rpc(name) {
      rpcCalls.push({ name, signal: null })
      return {
        abortSignal(signal) {
          rpcCalls[rpcCalls.length - 1].signal = signal
          return Promise.resolve({
            data: [{
              account_count: 12,
              canvas_count: 30,
              node_count: 500,
              edge_count: 720,
              note_count: 80,
              canvases_updated_24h: 7,
              accounts_updated_24h: 4,
              canvases_updated_7d: 19,
              accounts_updated_7d: 9,
              invalid_document_count: 0,
              active_invitation_count: 8,
              active_email_invitation_count: 3,
              active_link_invitation_count: 5,
              active_membership_count: 11,
              revoked_membership_count: 2,
              canvas_scope_share_count: 4,
              group_scope_share_count: 3,
              node_scope_share_count: 6,
              latest_canvas_update: '2026-07-15T00:00:00.000Z',
              user_ids: [privateUserId],
            }],
            error: null,
          })
        },
      }
    },
  }
  const result = await runSystemRuntimeCapability({
    capabilityId: 'workflow.supabase.canvas-service.operations',
    actorUserId: 'owner-1',
    now: () => times.shift(),
    readOperationalSnapshot: ({ signal }) => readWorkflowSystemOperations(db, signal),
  })
  assert.equal(rpcCalls.length, 1)
  assert.equal(rpcCalls[0].name, WORKFLOW_SYSTEM_OPERATIONS_RPC)
  assert.ok(rpcCalls[0].signal instanceof AbortSignal)
  assert.equal(result.status, 'healthy')
  assert.equal(result.resultKind, 'metric_groups')
  assert.equal(result.dataScope, 'application_aggregate')
  assert.equal(result.collectionLabel, '앱 운영 지표')
  assert.equal(result.latencyMs, 32)
  assert.deepEqual(result.items.map((item) => item.id), ['storage-scale', 'recent-activity', 'collaboration', 'document-integrity'])
  assert.equal(result.items[0].metrics.find((metric) => metric.id === 'canvases').value, 30)
  assert.equal(result.items[1].metrics.find((metric) => metric.id === 'accounts-24h').value, 4)
  assert.equal(result.items[2].metrics.find((metric) => metric.id === 'active-memberships').value, 11)
  assert.equal(result.items[3].metrics[0].value, 0)
  assert.equal(result.catalog.find((item) => item.id === 'active-link-invitations').value, 5)
  assert.equal(result.catalog.find((item) => item.id === 'canvas-bodies').availability, 'protected')
  assert.equal(result.catalog.find((item) => item.id === 'database-size').availability, 'connector_required')
  assert.equal(JSON.stringify(result).includes(privateUserId), false)
})

await ta('runtime observations persist append-only and latest reads ignore stale or mismatched rows', async () => {
  const target = resolveSystemRuntimeTarget({
    canvas: runtimeCanvas,
    actorUserId: 'owner-1',
    ownerUserId: 'owner-1',
    nodeId: 'map-web-app',
    partId: 'supabase-anon-ref',
  })
  const result = normalizeSystemRuntimeResult({
    capabilityId: target.capability.id,
    status: 'healthy',
    verification: 'verified',
    resourceId: 'workflow-supabase:canvases-user-read',
    checkedAt: '2026-07-15T01:00:00.000Z',
    latencyMs: 8,
    summary: 'RLS 경로 정상',
  })
  const inserts = []
  const cleanup = []
  const writeDb = {
    from(table) {
      assert.equal(table, 'system_runtime_observations')
      return {
        insert(row) {
          inserts.push(row)
          return Promise.resolve({ error: null })
        },
        delete() {
          const query = {
            eq(field, value) { cleanup.push(['eq', field, value]); return query },
            lt(field, value) { cleanup.push(['lt', field, value]); return Promise.resolve({ error: null }) },
          }
          return query
        },
      }
    },
  }
  const written = await persistSystemRuntimeObservation(writeDb, { canvasId: 'canvas-1', target, result })
  assert.deepEqual(written, { available: true, persisted: true })
  assert.equal(inserts.length, 1)
  assert.equal(inserts[0].canvas_id, 'canvas-1')
  assert.equal(inserts[0].node_id, 'map-web-app')
  assert.equal(inserts[0].result.status, 'healthy')
  assert.equal(cleanup.some(([operation, field]) => operation === 'lt' && field === 'observed_at'), true)

  const deniedWriteDb = {
    from() {
      return { insert: () => Promise.resolve({ error: { code: '42501' } }) }
    },
  }
  const deniedWrite = await persistSystemRuntimeObservation(deniedWriteDb, { canvasId: 'canvas-1', target, result })
  assert.deepEqual(deniedWrite, {
    available: true,
    persisted: false,
    errorCode: 'OBSERVATION_WRITE_FAILED',
  })

  const oldResult = { ...result, checkedAt: '2026-07-15T00:00:00.000Z', status: 'failed', verification: 'failed' }
  const storedRows = [
    {
      node_id: 'map-web-app', part_id: 'supabase-anon-ref',
      capability_id: target.capability.id, result, observed_at: result.checkedAt,
    },
    {
      node_id: 'map-web-app', part_id: 'supabase-anon-ref',
      capability_id: target.capability.id, result: oldResult, observed_at: oldResult.checkedAt,
    },
    {
      node_id: 'map-canvases-table', part_id: 'map-part-own-canvas-summary',
      capability_id: 'workflow.supabase.user-canvases.read', result, observed_at: result.checkedAt,
    },
    {
      node_id: 'unregistered-node', part_id: 'unknown-part',
      capability_id: target.capability.id, result, observed_at: result.checkedAt,
    },
  ]
  const readDb = {
    from(table) {
      assert.equal(table, 'system_runtime_observations')
      const query = {
        select() { return query },
        eq() { return query },
        order() { return query },
        limit() { return Promise.resolve({ data: storedRows, error: null }) },
      }
      return query
    },
  }
  const latest = await loadLatestSystemRuntimeObservations(readDb, {
    canvasId: 'canvas-1',
    canvas: runtimeCanvas,
    actorUserId: 'owner-1',
    ownerUserId: 'owner-1',
  })
  assert.equal(latest.available, true)
  assert.equal(latest.results.length, 1)
  assert.equal(latest.results[0].result.checkedAt, result.checkedAt)

  const unavailableDb = {
    from() {
      const query = {
        select() { return query },
        eq() { return query },
        order() { return query },
        limit() { return Promise.resolve({ data: null, error: { code: '42P01' } }) },
      }
      return query
    },
  }
  const unavailable = await loadLatestSystemRuntimeObservations(unavailableDb, {
    canvasId: 'canvas-1', canvas: runtimeCanvas, actorUserId: 'owner-1', ownerUserId: 'owner-1',
  })
  assert.equal(unavailable.available, false)
  assert.equal(unavailable.errorCode, 'OBSERVATION_STORE_UNAVAILABLE')
})

await ta('upstream rejection, network errors and timeouts expose safe summaries only', async () => {
  const secret = 'do-not-leak-this-token'
  const rejected = await runSystemRuntimeCapability({
    capabilityId: 'workflow.supabase.user-canvases.read',
    actorUserId: 'owner-1', accessToken: secret,
    supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'anon-test',
    now: (() => { const values = [2_000, 2_010]; return () => values.shift() })(),
    fetchImpl: async () => ({ ok: false, status: 403, rawBody: secret }),
  })
  assert.equal(rejected.errorCode, 'AUTH_OR_RLS_REJECTED')
  assert.equal(JSON.stringify(rejected).includes(secret), false)

  const operationsUnavailable = await runSystemRuntimeCapability({
    capabilityId: 'workflow.supabase.canvas-service.operations',
    actorUserId: 'owner-1',
    now: (() => { const values = [2_100, 2_110]; return () => values.shift() })(),
    readOperationalSnapshot: async () => ({ data: null, error: { code: 'PGRST202', secret } }),
  })
  assert.equal(operationsUnavailable.errorCode, 'READ_FUNCTION_UNAVAILABLE')
  assert.equal(JSON.stringify(operationsUnavailable).includes(secret), false)

  const malformedOperations = await runSystemRuntimeCapability({
    capabilityId: 'workflow.supabase.canvas-service.operations',
    actorUserId: 'owner-1',
    now: (() => { const values = [2_200, 2_210]; return () => values.shift() })(),
    readOperationalSnapshot: async () => ({ data: [{ canvas_count: 1, latest_canvas_update: secret }], error: null }),
  })
  assert.equal(malformedOperations.errorCode, 'INVALID_UPSTREAM_RESPONSE')
  assert.equal(JSON.stringify(malformedOperations).includes(secret), false)

  const network = await runSystemRuntimeCapability({
    capabilityId: 'workflow.supabase.user-canvases.read',
    actorUserId: 'owner-1', accessToken: secret,
    supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'anon-test',
    now: (() => { const values = [3_000, 3_010]; return () => values.shift() })(),
    fetchImpl: async () => { throw new Error(`network failed with ${secret}`) },
  })
  assert.equal(network.errorCode, 'NETWORK_ERROR')
  assert.equal(JSON.stringify(network).includes(secret), false)

  const timeout = await runSystemRuntimeCapability({
    capabilityId: 'workflow.supabase.user-canvases.read',
    actorUserId: 'owner-1', accessToken: secret,
    supabaseUrl: 'https://project.supabase.co', supabaseAnonKey: 'anon-test',
    now: (() => { const values = [4_000, 4_050]; return () => values.shift() })(),
    fetchImpl: async () => { const error = new Error('aborted'); error.name = 'AbortError'; throw error },
  })
  assert.equal(timeout.errorCode, 'TIMEOUT')
  assert.equal(JSON.stringify(timeout).includes(secret), false)
})

t('retired text-node parts remain preserved and sanitized in stored canvas data', () => {
  const result = sanitizeBrowserNodeData({
    label: '정보 노드',
    parts: [{ id: 'legacy-part', text: '<img src=x onerror=steal()>기존 정보' }],
  })
  assert.deepEqual(result.parts, [{ id: 'legacy-part', text: '기존 정보' }])
})

console.log('relation ontology')

t('relation ontology ids are unique and every relation belongs to a known family', () => {
  const ids = RELATION_DEFS.map((relation) => relation.id)
  const familyIds = new Set(RELATION_FAMILY_DEFS.map((family) => family.id))
  assert.equal(new Set(ids).size, ids.length)
  assert.equal(RELATION_DEFS.every((relation) => familyIds.has(relation.family)), true)
  assert.equal(new Set(RELATION_SOURCE_DEFS.map((item) => item.id)).size, RELATION_SOURCE_DEFS.length)
  assert.equal(new Set(RELATION_CONFIDENCE_DEFS.map((item) => item.id)).size, RELATION_CONFIDENCE_DEFS.length)
})

t('legacy edge data stays unlabeled while resolving to the generic flow relation', () => {
  assert.deepEqual(normalizeEdgeRelationData(undefined), {})
  const info = edgeRelationInfo(undefined)
  assert.equal(info.id, 'flows_to')
  assert.equal(info.explicit, false)
  assert.equal(info.directed, true)
})

t('custom relation labels are clamped and unknown runtime fields are dropped', () => {
  const data = normalizeEdgeRelationData({
    relationType: 'custom', relationLabel: '  배송\u0000 인계  ', relationExplicit: true,
    relationRuntime: { verification: 'verified' }, forged: 'drop-me',
  })
  assert.deepEqual(data, {
    relationType: 'custom', relationLabel: '배송 인계', relationExplicit: true,
    relationSourceKind: 'manual', relationConfidence: 'unknown',
  })
})

t('author evidence is documented but never treated as server verification', () => {
  const data = createEdgeRelationData('reads', '', true, {
    relationSourceKind: 'code',
    relationConfidence: 'high',
    relationEvidence: 'API handler calls the canvas query.',
    relationEvidenceRef: 'mcp/store.js',
  })
  const provenance = edgeRelationProvenance(data)
  assert.equal(provenance.reality.id, 'evidenced')
  assert.equal(provenance.confidence.id, 'high')
  assert.equal(provenance.evidenceRef, 'mcp/store.js')
})

t('only server-shaped runtime proof verifies a relation and persistence drops it', () => {
  const forged = {
    ...createEdgeRelationData('writes'),
    relationRuntime: {
      verification: 'verified',
      evidenceId: 'observation-1',
      verifiedAt: '2026-07-14T00:00:00.000Z',
    },
  }
  assert.equal(edgeRelationProvenance(forged).reality.id, 'verified')
  const persisted = normalizeEdgeRelationData(forged)
  assert.equal(Object.hasOwn(persisted, 'relationRuntime'), false)
  assert.equal(edgeRelationProvenance(persisted).reality.id, 'declared')
})

t('MCP row data cannot forge verification but a trusted server overlay can', () => {
  const edge = {
    id: 'edge-proof', source: 'api', target: 'db',
    data: {
      ...createEdgeRelationData('reads'),
      relationRuntime: {
        verification: 'verified', evidenceId: 'forged', verifiedAt: '2026-07-14T00:00:00.000Z',
      },
    },
  }
  assert.equal(toExternalCanvasEdge(edge).server_verified, false)
  const trusted = toExternalCanvasEdge(edge, false, {
    verification: 'verified', evidenceId: 'server-observation', verifiedAt: '2026-07-14T00:00:00.000Z',
  })
  assert.equal(trusted.server_verified, true)
  assert.equal(trusted.relation_reality, 'verified')
})

t('symmetric relation patch removes the arrow and keeps source/target intact', () => {
  const edge = {
    id: 'edge-1', source: 'A', target: 'B',
    style: { stroke: '#4a4a5a', strokeWidth: 3 },
    markerEnd: { type: 'arrowclosed', color: '#4a4a5a' },
  }
  const updated = applyEdgeRelationPatch(edge, { relationType: 'related_to' })
  assert.equal(updated.source, 'A')
  assert.equal(updated.target, 'B')
  assert.equal(updated.data.relationType, 'related_to')
  assert.equal(updated.data.relationExplicit, true)
  assert.equal(updated.markerEnd, undefined)
})

t('relation meaning remains stored when its canvas label is hidden', () => {
  const typed = applyEdgeRelationPatch({
    id: 'edge-2', source: 'A', target: 'B', style: { stroke: '#4a4a5a', strokeWidth: 3 },
  }, { relationType: 'depends_on' })
  const hidden = applyEdgeRelationPatch(typed, { showRelationLabel: false })
  assert.equal(hidden.data.relationType, 'depends_on')
  assert.equal(hidden.data.relationExplicit, false)
  assert.equal(toExternalCanvasEdge(hidden).relation_type, 'depends_on')
  assert.equal(toExternalCanvasEdge(hidden).show_relation_label, false)
})

t('relation provenance survives semantic edits and can be cleared explicitly', () => {
  const based = applyEdgeRelationPatch({
    id: 'edge-3', source: 'A', target: 'B', style: { stroke: '#4a4a5a', strokeWidth: 3 },
  }, {
    relationType: 'depends_on', relationSourceKind: 'document', relationConfidence: 'medium',
    relationEvidence: '운영 절차 4항', relationEvidenceRef: 'docs/runbook.md',
  })
  const changed = applyEdgeRelationPatch(based, { relationType: 'requires' })
  assert.equal(changed.data.relationSourceKind, 'document')
  assert.equal(changed.data.relationEvidenceRef, 'docs/runbook.md')
  const cleared = applyEdgeRelationPatch(changed, {
    relationSourceKind: 'manual', relationConfidence: 'unknown', relationEvidence: '', relationEvidenceRef: '',
  })
  assert.equal(Object.hasOwn(cleared.data, 'relationEvidence'), false)
  assert.equal(edgeRelationProvenance(cleared.data).reality.id, 'declared')
})

t('MCP edge representation exposes relation meaning and label visibility', () => {
  const result = toExternalCanvasEdge({
    id: 'edge-reads', source: 'api', target: 'db',
    data: createEdgeRelationData('reads'),
    style: { stroke: '#06b6d4', strokeWidth: 3 },
  })
  assert.equal(result.relation_type, 'reads')
  assert.equal(result.relation_label, '읽음')
  assert.equal(result.relation_family, 'system')
  assert.equal(result.directed, true)
  assert.equal(result.show_relation_label, true)
})

t('MCP redacted edge representation never exposes relation semantics', () => {
  const edge = {
    id: 'secret-edge', source: 'visible', target: 'hidden',
    data: createEdgeRelationData('custom', '비밀 관계', true, {
      relationSourceKind: 'document',
      relationEvidence: '비공개 보안 문서에서 확인',
      relationEvidenceRef: 'private/security-review.md',
    }),
  }
  const result = toExternalCanvasEdge(edge, true)
  assert.equal(result.redacted, true)
  assert.equal(Object.hasOwn(result, 'relation_type'), false)
  assert.equal(JSON.stringify(result).includes('비밀'), false)
  assert.equal(JSON.stringify(result).includes('security-review'), false)
})

console.log('Workflow Canvas self system map')

t('self map creation is disabled without an exact configured owner id', () => {
  assert.equal(canCreateWorkflowSystemMap('owner-1', undefined), false)
  assert.equal(canCreateWorkflowSystemMap('owner-1', ''), false)
  assert.equal(canCreateWorkflowSystemMap('other-user', 'owner-1'), false)
  assert.equal(canCreateWorkflowSystemMap('owner-1', ' owner-1 '), true)
})

t('self map is a declared, evidence-backed model with valid topology', () => {
  const map = createWorkflowCanvasSystemMap()
  const ids = map.nodes.map((node) => node.id)
  const idSet = new Set(ids)
  assert.equal(idSet.size, ids.length)
  assert.equal(map.views.length, 4)
  assert.equal(map.nodes.slice(0, 4).every((node) => node.type === 'group'), true)
  assert.equal(map.nodes.filter((node) => node.type === 'system').every((node) => (
    systemNodeReality(node.data).id === 'declared' && !node.data.twinRuntime
  )), true)
  assert.equal(map.edges.every((item) => idSet.has(item.source) && idSet.has(item.target)), true)
  assert.equal(map.edges.every((item) => {
    const info = edgeRelationInfo(item.data)
    return info.explicit
      && info.provenance.source.id === 'code'
      && info.provenance.confidence.id === 'high'
      && info.provenance.reality.id === 'evidenced'
  }), true)
})

t('self map covers the critical runtime, data, security and delivery boundaries', () => {
  const map = createWorkflowCanvasSystemMap()
  const labels = new Set(map.nodes.map((node) => node.data?.label))
  for (const label of [
    'Workflow Canvas 웹 앱', 'Vercel 프로덕션', 'Workflow Canvas MCP 서버',
    'Supabase Postgres', 'RLS·DB 함수 정책', 'canvases', 'mcp_tokens',
    '테스트·보안 검사', 'GitHub 저장소',
  ]) assert.equal(labels.has(label), true, `missing system map node: ${label}`)

  const relationTypes = new Set(map.edges.map((item) => item.data.relationType))
  for (const relationType of ['calls', 'reads', 'writes', 'authorizes', 'requires', 'syncs_with', 'triggers']) {
    assert.equal(relationTypes.has(relationType), true, `missing system map relation: ${relationType}`)
  }
  assert.equal(JSON.stringify(map).includes('SUPABASE_SERVICE_ROLE_KEY='), false)
  assert.deepEqual(
    resolveSystemRuntimeTargets({ canvas: map, actorUserId: 'owner-1', ownerUserId: 'owner-1' })
      .map((target) => target.capability.id),
    [
      'workflow.vercel.deployment.runtime',
      'workflow.api.shared-canvas.health',
      'workflow.api.mcp.route',
      'workflow.supabase.auth.session',
      'workflow.supabase.canvas-service.operations',
    ],
  )
})

console.log('read-only system discovery')

t('discovery records credential names but excludes literal values from output and fingerprints', () => {
  const credentialName = ['PUBLIC', 'ANON', 'KEY'].join('_')
  const environmentName = ['DISCOVERY', 'TEST', 'SECRET'].join('_')
  const scan = (secret) => buildDiscoveryManifest(new Map([
    ['package.json', '{}'],
    ['src/fake.js', [
      `let ${credentialName} = '${secret}'`,
      `const PRIVATE_TOKEN = process.env.${environmentName} ?? 'fallback-${secret}'`,
    ].join('\n')],
  ]))
  const first = scan('first-raw-secret')
  const second = scan('second-raw-secret')
  const serialized = JSON.stringify(first)

  assert.equal(serialized.includes('first-raw-secret'), false)
  assert.equal(serialized.includes('fallback-first-raw-secret'), false)
  assert.ok(first.resources[`env:${environmentName}`])
  assert.equal(
    first.resources[`credential-reference:${credentialName}`].details.classification,
    'public-client-reference',
  )
  assert.equal(
    first.resources['file:src/fake.js'].fingerprint,
    second.resources['file:src/fake.js'].fingerprint,
  )
  assert.equal(first.id, second.id)
})

t('discovery accepts SQL declarations only from SQL files and ignores test-source lookalikes', () => {
  const manifest = buildDiscoveryManifest(new Map([
    ['scripts/fake-test.mjs', `assert.match(sql, /create table if not exists public.fake_table/i)`],
    ['src/fake.js', `client.from('real_table').select('*')`],
    ['supabase-real.sql', 'create table if not exists public.real_table (id bigint);'],
  ]))
  assert.equal(Object.hasOwn(manifest.resources, 'db-table:fake_table'), false)
  assert.equal(Object.hasOwn(manifest.resources, 'db-table:public'), false)
  assert.ok(manifest.resources['db-table:real_table'])
  assert.deepEqual(manifest.resources['db-table:real_table'].details.definitions, ['supabase-real.sql'])
  assert.deepEqual(manifest.resources['db-table:real_table'].details.references, ['src/fake.js', 'supabase-real.sql'])
})

t('generated discovery manifest covers current API, DB, storage, realtime and MCP surfaces', () => {
  const resources = WORKFLOW_SYSTEM_DISCOVERY.current.resources
  for (const key of [
    'api:/api/mcp',
    'api:/api/shared-canvas',
    'db-table:canvases',
    'db-table:share_revocations',
    'db-table:system_runtime_observations',
    'storage-bucket:canvas-images',
    'realtime-table:canvases',
    'credential-reference:SUPABASE_ANON_KEY',
    'runtime-capability:workflow.supabase.canvas-service.operations',
  ]) assert.ok(resources[key], `missing discovery resource: ${key}`)
  assert.equal(Object.hasOwn(resources, 'db-table:public'), false)
  const operationsDetails = resources['runtime-capability:workflow.supabase.canvas-service.operations'].details
  assert.equal(operationsDetails.authorization, 'system_operator')
  assert.equal(operationsDetails.dataScope, 'application_aggregate')
  assert.equal(operationsDetails.freshnessMs, 900000)
  assert.equal(operationsDetails.operation, 'read')
  assert.deepEqual(operationsDetails.pathEdgeIds, [])
  assert.equal(operationsDetails.resultKind, 'metric_groups')
  assert.equal(operationsDetails.risk, 'low')
  assert.equal(operationsDetails.sideEffect, 'none')
  assert.equal(operationsDetails.targetNodeId, 'map-canvases-table')
  assert.equal(operationsDetails.catalogFieldCount, 27)
  assert.ok(operationsDetails.catalogFieldIds.includes('active-memberships'))
  assert.ok(operationsDetails.catalogFieldIds.includes('canvas-bodies'))
  for (const tool of [
    'inspect_workflow_system_map',
    'preview_workflow_system_map_relation_repair',
    'repair_workflow_system_map_relations',
  ]) assert.ok(resources['collection:mcp-tools'].details.items.includes(tool), `missing MCP tool: ${tool}`)
  assert.equal(JSON.stringify(WORKFLOW_SYSTEM_DISCOVERY).includes('eyJhbGciOi'), false)
})

t('new and legacy self maps select explicit, non-verified comparison baselines', () => {
  const currentMap = createWorkflowCanvasSystemMap()
  const current = selectWorkflowSystemMapBaseline(currentMap, WORKFLOW_SYSTEM_DISCOVERY)
  assert.equal(current.id, WORKFLOW_SYSTEM_DISCOVERY.current.id)
  assert.equal(current.source, 'canvas-declared-current')
  assert.equal(current.trust, 'declared-not-server-verified')

  const legacyMap = structuredClone(currentMap)
  delete legacyMap.nodes.find((node) => node.data?.systemMapSnapshot)?.data.systemMapSnapshot
  const legacy = selectWorkflowSystemMapBaseline(legacyMap, WORKFLOW_SYSTEM_DISCOVERY)
  assert.equal(legacy.id, LEGACY_SYSTEM_MAP_BASELINE_ID)
  assert.equal(legacy.source, 'legacy-template-inference')
  assert.equal(legacy.trust, 'declared-not-server-verified')
})

t('unknown declared snapshot stays unavailable instead of being treated as verified current state', () => {
  const map = createWorkflowCanvasSystemMap()
  map.nodes.find((node) => node.data?.systemMapSnapshot).data.systemMapSnapshot.manifestId = 'unknown-manifest'
  const baseline = selectWorkflowSystemMapBaseline(map, WORKFLOW_SYSTEM_DISCOVERY)
  assert.equal(baseline.manifest, null)
  assert.equal(baseline.source, 'canvas-declared-unknown')
  assert.equal(baseline.trust, 'unavailable')
})

t('current self map inspection is read-only and reports unmodeled resources without changing the map', () => {
  const map = createWorkflowCanvasSystemMap()
  const before = structuredClone(map)
  const report = inspectWorkflowSystemMap({
    canvas: map,
    expectedMap: createWorkflowCanvasSystemMap(),
    discovery: WORKFLOW_SYSTEM_DISCOVERY,
  })
  const unmodeled = new Set(report.unmodeled_resources.map((resource) => resource.key))

  assert.equal(report.mode, 'read-only-discovery')
  assert.equal(report.writes_performed, false)
  assert.equal(report.baseline.manifest_id, WORKFLOW_SYSTEM_DISCOVERY.current.id)
  assert.equal(report.summary.node_findings, 0)
  assert.equal(report.summary.relation_findings, 0)
  assert.ok(unmodeled.has('db-table:share_revocations'))
  assert.ok(unmodeled.has('credential-reference:SUPABASE_ANON_KEY'))
  assert.deepEqual(map, before)
  assert.equal(JSON.stringify(report).includes('eyJhbGciOi'), false)
})

t('legacy self map reports code drift as review signals without claiming a confirmed error', () => {
  const map = createWorkflowCanvasSystemMap()
  delete map.nodes.find((node) => node.data?.systemMapSnapshot)?.data.systemMapSnapshot
  const report = inspectWorkflowSystemMap({
    canvas: map,
    expectedMap: createWorkflowCanvasSystemMap(),
    discovery: WORKFLOW_SYSTEM_DISCOVERY,
  })

  assert.equal(report.baseline.manifest_id, LEGACY_SYSTEM_MAP_BASELINE_ID)
  assert.ok(report.node_findings.some((item) => ['changed', 'discovered_since_baseline'].includes(item.status)))
  assert.ok(report.relation_findings.some((item) => item.status === 'needs_review'))
  assert.ok(report.guidance.some((line) => line.includes('오류 확정이 아니라')))
})

t('inspection detects a missing map node and a semantically edited relation', () => {
  const map = createWorkflowCanvasSystemMap()
  map.nodes = map.nodes.filter((node) => node.id !== 'map-postgres')
  map.edges[0].data.relationType = map.edges[0].data.relationType === 'calls' ? 'reads' : 'calls'
  map.edges[1].data.relationEvidenceRef = ''
  const report = inspectWorkflowSystemMap({
    canvas: map,
    expectedMap: createWorkflowCanvasSystemMap(),
    discovery: WORKFLOW_SYSTEM_DISCOVERY,
  })

  assert.ok(report.node_findings.some((item) => item.node_id === 'map-postgres' && item.status === 'missing_on_canvas'))
  assert.ok(report.relation_findings.some((item) => item.edge_id === map.edges[0].id && item.status === 'map_modified'))
  assert.ok(report.relation_findings.some((item) => item.edge_id === map.edges[1].id && item.status === 'evidence_missing'))
})

t('inspection distinguishes erased relation metadata from an intentional semantic edit', () => {
  const map = createWorkflowCanvasSystemMap()
  const damagedEdgeId = map.edges[0].id
  delete map.edges[0].data
  const report = inspectWorkflowSystemMap({
    canvas: map,
    expectedMap: createWorkflowCanvasSystemMap(),
    discovery: WORKFLOW_SYSTEM_DISCOVERY,
  })
  const finding = report.relation_findings.find((item) => item.edge_id === damagedEdgeId)

  assert.equal(finding.status, 'relation_metadata_missing')
  assert.deepEqual(finding.differences, ['relation_metadata'])
  assert.equal(finding.actual.relation_type, null)
  assert.equal(finding.actual.relation_metadata_present, false)
  assert.equal(finding.expected.relation_type, 'uses')
  assert.equal(finding.repair_eligible, true)
})

console.log('digital twin change review')

t('review fingerprints are deterministic and independent of object key order', () => {
  const first = digitalTwinReviewFingerprint({ alpha: 1, nested: { beta: 2, gamma: [3, 4] } })
  const second = digitalTwinReviewFingerprint({ nested: { gamma: [3, 4], beta: 2 }, alpha: 1 })
  const changed = digitalTwinReviewFingerprint({ alpha: 1, nested: { beta: 9, gamma: [3, 4] } })

  assert.equal(first, second)
  assert.notEqual(first, changed)
  assert.match(first, /^[a-f0-9]{16}$/)
})

t('a reviewed item becomes pending again when its observed evidence changes', () => {
  const first = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'resource:orders', category: 'resource',
    changeType: 'changed', title: 'orders changed', observation: { version: 'v1' },
  })
  const second = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'resource:orders', category: 'resource',
    changeType: 'changed', title: 'orders changed', observation: { version: 'v2' },
  })
  const state = setDigitalTwinReviewDecision(null, first, 'reviewed', '2026-07-14T00:00:00.000Z')

  assert.equal(first.id, second.id)
  assert.notEqual(first.fingerprint, second.fingerprint)
  const reviewed = partitionDigitalTwinReviewItems([first], state)
  assert.deepEqual(reviewed.reviewed.map((item) => item.id), [first.id])
  assert.equal(reviewed.decisions[first.id].disposition, 'reviewed')
  assert.deepEqual(partitionDigitalTwinReviewItems([second], state).pending.map((item) => item.id), [second.id])
})

t('review decisions stay isolated by source and can be returned to pending', () => {
  const first = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'same-key', title: 'first', observation: { value: 1 },
  })
  const second = createDigitalTwinReviewItem({
    sourceId: 'source-two', itemKey: 'same-key', title: 'second', observation: { value: 1 },
  })
  const reviewed = setDigitalTwinReviewDecision(null, first, 'ignored', '2026-07-14T00:00:00.000Z')
  const cleared = clearDigitalTwinReviewDecision(reviewed, first)

  assert.equal(partitionDigitalTwinReviewItems([first, second], reviewed).ignored.length, 1)
  assert.equal(partitionDigitalTwinReviewItems([first, second], reviewed).pending.length, 1)
  assert.equal(partitionDigitalTwinReviewItems([first, second], cleared).pending.length, 2)
})

t('review decisions for different findings merge across two canvas editors', () => {
  const first = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'first', title: 'first', observation: { value: 1 },
  })
  const second = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'second', title: 'second', observation: { value: 1 },
  })
  const root = { id: 'twin-root', type: 'group', data: { digitalTwinReview: null } }
  const base = { name: 'Twin', nodes: [root], edges: [], notes: [], views: [], stageTypes: null }
  const local = structuredClone(base)
  const remote = structuredClone(base)
  local.nodes[0].data.digitalTwinReview = setDigitalTwinReviewDecision(null, first, 'reviewed', '2026-07-14T00:00:00.000Z')
  remote.nodes[0].data.digitalTwinReview = setDigitalTwinReviewDecision(null, second, 'ignored', '2026-07-14T00:00:01.000Z')
  const { merged, conflicts } = mergeCanvasSnapshots(base, local, remote)
  const partitions = partitionDigitalTwinReviewItems([first, second], merged.nodes[0].data.digitalTwinReview)

  assert.deepEqual(conflicts, [])
  assert.equal(partitions.reviewed.length, 1)
  assert.equal(partitions.ignored.length, 1)
})

t('conflicting decisions for the same finding still require user resolution', () => {
  const item = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'same', title: 'same', observation: { value: 1 },
  })
  const root = { id: 'twin-root', type: 'group', data: { digitalTwinReview: null } }
  const base = { name: 'Twin', nodes: [root], edges: [], notes: [], views: [], stageTypes: null }
  const local = structuredClone(base)
  const remote = structuredClone(base)
  local.nodes[0].data.digitalTwinReview = setDigitalTwinReviewDecision(null, item, 'reviewed', '2026-07-14T00:00:00.000Z')
  remote.nodes[0].data.digitalTwinReview = setDigitalTwinReviewDecision(null, item, 'ignored', '2026-07-14T00:00:00.000Z')
  const { merged, conflicts } = mergeCanvasSnapshots(base, local, remote)
  const partitions = partitionDigitalTwinReviewItems([item], merged.nodes[0].data.digitalTwinReview)

  assert.ok(conflicts.some((path) => path.endsWith(`decisions.${item.id}.disposition`)))
  assert.equal(partitions.reviewed.length, 1)
})

t('Workflow Canvas adapter emits generic discovered items without claiming live runtime', () => {
  const map = createWorkflowCanvasSystemMap()
  const before = structuredClone(map)
  const review = inspectWorkflowSystemTwin(map)
  const expectedCount = review.report.summary.node_findings
    + review.report.summary.relation_findings
    + review.report.summary.unmodeled_resources

  assert.equal(review.source.id, WORKFLOW_SYSTEM_TWIN_SOURCE_ID)
  assert.equal(review.source.observationLevel, 'discovered')
  assert.equal(review.source.runtimeVerified, false)
  assert.equal(review.items.length, expectedCount)
  assert.equal(new Set(review.items.map((item) => item.id)).size, review.items.length)
  assert.ok(review.items.some((item) => item.itemKey === 'resource:db-table:share_revocations'))
  assert.ok(review.items.every((item) => item.fingerprint && item.sourceId === WORKFLOW_SYSTEM_TWIN_SOURCE_ID))
  assert.deepEqual(map, before)
})

t('Workflow Canvas adapter ignores ordinary canvases instead of coupling the review UI to one app', () => {
  assert.equal(inspectWorkflowSystemTwin({
    nodes: [{ id: 'orders', type: 'system', data: { label: 'Orders' } }],
    edges: [],
  }), null)
})

t('digital twin proposals reject generic update and delete operations before they reach the canvas', () => {
  const item = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'resource:orders', title: 'orders found', observation: { version: 1 },
  })
  assert.throws(() => createDigitalTwinGraphProposal({
    sourceId: item.sourceId,
    proposalKey: 'unsafe-update',
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    operations: [{ action: 'update_node', node: { id: 'orders' } }],
  }), /파츠 교체만 허용/)
  assert.throws(() => createDigitalTwinGraphProposal({
    sourceId: item.sourceId,
    proposalKey: 'unsafe-delete',
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    operations: [{ action: 'remove_node', node: { id: 'orders' } }],
  }), /파츠 교체만 허용/)
})

t('proposal preview is read-only and explicit apply adds only the planned graph entities', () => {
  const item = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'resource:orders', title: 'orders found', observation: { version: 1 },
  })
  const proposal = createDigitalTwinGraphProposal({
    sourceId: item.sourceId,
    proposalKey: 'model-orders',
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    snapshotId: 'snapshot-one',
    operations: [
      {
        action: 'add_node',
        label: 'orders node',
        node: {
          id: 'orders', type: 'system', position: { x: 20, y: 30 },
          data: {
            label: 'Orders',
            digitalTwinBinding: {
              sourceId: item.sourceId, entityKey: 'db-table:orders', itemFingerprint: item.fingerprint,
            },
          },
        },
      },
      {
        action: 'add_edge',
        label: 'database contains orders',
        edge: {
          id: 'database-orders', source: 'database', target: 'orders', type: 'stub',
          data: { relationType: 'contains', relationEvidenceRef: 'schema.sql' },
        },
      },
    ],
  })
  const graph = { nodes: [{ id: 'database', type: 'system', position: { x: 0, y: 0 }, data: { label: 'DB' } }], edges: [] }
  const before = structuredClone(graph)
  const plan = planDigitalTwinGraphProposal(graph, proposal)

  assert.deepEqual(graph, before)
  assert.deepEqual(plan.nodes.map((node) => node.id), ['orders'])
  assert.deepEqual(plan.edges.map((edge) => edge.id), ['database-orders'])
  const applied = applyDigitalTwinGraphProposal(graph, proposal)
  assert.deepEqual(graph, before)
  assert.deepEqual(applied.nodes.map((node) => node.id), ['database', 'orders'])
  assert.deepEqual(applied.edges.map((edge) => edge.id), ['database-orders'])
  assert.equal(applied.writesPerformed, true)

  const repeated = applyDigitalTwinGraphProposal(applied, proposal)
  assert.equal(repeated.writesPerformed, false)
  assert.deepEqual(new Set(repeated.alreadyPresent), new Set(['orders', 'database-orders']))
})

t('system-part proposal preview is read-only and apply only appends the reviewed part', () => {
  const item = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'resource:public-key', title: 'public key found', observation: { version: 1 },
  })
  const proposal = createDigitalTwinGraphProposal({
    sourceId: item.sourceId,
    proposalKey: 'model-public-key',
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    operations: [{
      action: 'add_part',
      targetNodeId: 'web-app',
      part: {
        id: 'public-key-ref', kind: 'credential_ref', label: '공개 키', ref: 'PUBLIC_ANON_KEY',
        exposure: 'public', sourceKind: 'code', evidenceRef: 'src/client.js',
      },
    }],
  })
  const graph = {
    nodes: [{ id: 'web-app', type: 'system', position: { x: 0, y: 0 }, data: { label: 'Web', untouched: 'keep' } }],
    edges: [],
  }
  const before = structuredClone(graph)
  const plan = planDigitalTwinGraphProposal(graph, proposal)

  assert.deepEqual(graph, before)
  assert.deepEqual(proposal.counts, { nodes: 0, edges: 0, parts: 1 })
  assert.equal(plan.parts[0].targetNodeId, 'web-app')
  const applied = applyDigitalTwinGraphProposal(graph, proposal)
  assert.deepEqual(graph, before)
  assert.equal(applied.nodes[0].data.untouched, 'keep')
  assert.equal(applied.nodes[0].data.systemParts[0].ref, 'PUBLIC_ANON_KEY')
  assert.deepEqual(applied.appliedPartIds, ['web-app:public-key-ref'])
  assert.equal(applied.writesPerformed, true)

  const repeated = applyDigitalTwinGraphProposal(applied, proposal)
  assert.equal(repeated.writesPerformed, false)
  assert.deepEqual(repeated.alreadyPresent, ['web-app:public-key-ref'])
})

t('system-part replacement requires the exact previewed fingerprint and changes only that part', () => {
  const item = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'runtime:operations', title: 'runtime changed', observation: { version: 2 },
  })
  const oldPart = {
    id: 'operations', kind: 'output', label: '개인 요약', ref: 'account.summary',
    exposure: 'internal', sourceKind: 'code', evidenceRef: 'old.js',
  }
  const newPart = {
    id: 'operations', kind: 'output', label: '앱 운영 현황', ref: 'app.operations',
    exposure: 'internal', sourceKind: 'code', evidenceRef: 'new.js',
  }
  const proposal = createDigitalTwinGraphProposal({
    sourceId: item.sourceId,
    proposalKey: 'replace-operations',
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    operations: [{
      action: 'replace_part',
      targetNodeId: 'canvases',
      partId: oldPart.id,
      expectedPartFingerprint: digitalTwinReviewFingerprint(normalizeSystemPart(oldPart)),
      part: newPart,
    }],
  })
  const graph = {
    nodes: [{
      id: 'canvases', type: 'system', position: { x: 0, y: 0 },
      data: {
        label: 'canvases', untouched: 'keep',
        systemParts: [oldPart, { id: 'other', kind: 'input', label: '기타', ref: 'other' }],
      },
    }],
    edges: [],
  }
  const before = structuredClone(graph)
  const plan = planDigitalTwinGraphProposal(graph, proposal)
  assert.deepEqual(graph, before)
  assert.equal(plan.partReplacements.length, 1)

  const applied = applyDigitalTwinGraphProposal(graph, proposal)
  assert.equal(applied.nodes[0].data.untouched, 'keep')
  assert.equal(applied.nodes[0].data.systemParts.find((part) => part.id === 'operations').ref, 'app.operations')
  assert.equal(applied.nodes[0].data.systemParts.find((part) => part.id === 'other').ref, 'other')
  assert.deepEqual(applied.replacedPartIds, ['canvases:operations'])

  const repeated = applyDigitalTwinGraphProposal(applied, proposal)
  assert.equal(repeated.writesPerformed, false)
  const stale = structuredClone(graph)
  stale.nodes[0].data.systemParts[0].label = '사용자가 수정함'
  assert.throws(() => planDigitalTwinGraphProposal(stale, proposal), /미리보기 이후 달라졌/)
})

t('part replacement preview swaps one chip without duplicating or mutating stored parts', () => {
  const current = [
    { id: 'operations', kind: 'output', label: '개인 요약', ref: 'account.summary' },
    { id: 'other', kind: 'input', label: '기타', ref: 'other' },
  ]
  const before = structuredClone(current)
  const next = previewDigitalTwinPartChanges(current, [], [{
    partId: 'operations',
    part: { id: 'operations', kind: 'output', label: '앱 운영 현황', ref: 'app.operations' },
  }])
  assert.deepEqual(current, before)
  assert.equal(next.parts.length, 2)
  assert.equal(next.parts.find((part) => part.id === 'operations').ref, 'app.operations')
  assert.equal(next.parts.find((part) => part.id === 'other').ref, 'other')
  assert.deepEqual(next.previewPartIds, ['operations'])
})

t('system-part proposals reject secret literals and conflicting existing ids', () => {
  const item = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'resource:key', title: 'key found', observation: { version: 1 },
  })
  assert.throws(() => createDigitalTwinGraphProposal({
    sourceId: item.sourceId,
    proposalKey: 'unsafe-secret',
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    operations: [{
      action: 'add_part', targetNodeId: 'web-app',
      part: {
        id: 'key-ref', kind: 'credential_ref', label: '키',
        ref: 'eyJhbGciOiJIUzI1NiJ9.aaaaaaaaaaaaaaaa.bbbbbbbbbbbbbbbb',
      },
    }],
  }), /실제 키나 토큰/)

  const proposal = createDigitalTwinGraphProposal({
    sourceId: item.sourceId,
    proposalKey: 'conflicting-part',
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    operations: [{
      action: 'add_part', targetNodeId: 'web-app',
      part: { id: 'key-ref', kind: 'credential_ref', label: '새 이름', ref: 'PUBLIC_KEY' },
    }],
  })
  const graph = {
    nodes: [{
      id: 'web-app', type: 'system', position: { x: 0, y: 0 },
      data: { systemParts: [{ id: 'key-ref', kind: 'credential_ref', label: '기존 이름', ref: 'PUBLIC_KEY' }] },
    }],
    edges: [],
  }
  assert.throws(() => planDigitalTwinGraphProposal(graph, proposal), /이미 다른 내용/)
})

t('a proposal is bound to the exact review evidence and cannot follow a stale item', () => {
  const first = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'resource:orders', title: 'orders found', observation: { version: 1 },
  })
  const changed = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'resource:orders', title: 'orders found', observation: { version: 2 },
  })
  const proposal = createDigitalTwinGraphProposal({
    sourceId: first.sourceId,
    proposalKey: 'model-orders',
    itemId: first.id,
    itemFingerprint: first.fingerprint,
    operations: [{ action: 'add_node', node: { id: 'orders', type: 'system', position: { x: 0, y: 0 } } }],
  })

  assert.equal(digitalTwinProposalMatchesItem(proposal, first), true)
  assert.equal(digitalTwinProposalMatchesItem(proposal, changed), false)
})

t('proposal preview measurements never update persisted canvas nodes', () => {
  const changes = [
    { id: 'real-node', type: 'position', position: { x: 10, y: 20 } },
    { id: 'preview-node', type: 'dimensions', dimensions: { width: 240, height: 140 } },
  ]
  const persisted = filterDigitalTwinProposalNodeChanges(changes, new Set(['preview-node']))

  assert.deepEqual(persisted, [changes[0]])
  assert.equal(changes.length, 2)
})

t('part-preview measurement is ignored while ordinary target-node changes still persist', () => {
  const changes = [
    { id: 'web-app', type: 'dimensions', dimensions: { width: 240, height: 140 } },
    { id: 'web-app', type: 'position', position: { x: 24, y: 36 } },
    { id: 'other', type: 'select', selected: true },
  ]
  const persisted = filterDigitalTwinProposalNodeChanges(changes, new Set(), new Set(['web-app']))

  assert.deepEqual(persisted, [changes[1], changes[2]])
})

t('proposal auto-fit key stays stable across rerenders and changes with the proposal', () => {
  const proposal = { id: 'source::proposal', fingerprint: 'fingerprint-one' }

  assert.equal(
    digitalTwinProposalAutoFitKey('canvas-one', proposal),
    digitalTwinProposalAutoFitKey('canvas-one', structuredClone(proposal)),
  )
  assert.notEqual(
    digitalTwinProposalAutoFitKey('canvas-one', proposal),
    digitalTwinProposalAutoFitKey('canvas-one', { ...proposal, fingerprint: 'fingerprint-two' }),
  )
  assert.equal(digitalTwinProposalAutoFitKey('canvas-one', null), null)
})

t('proposal apply refuses content changed after the user previewed it', () => {
  const item = createDigitalTwinReviewItem({
    sourceId: 'source-one', itemKey: 'resource:orders', title: 'orders found', observation: { version: 1 },
  })
  const proposal = createDigitalTwinGraphProposal({
    sourceId: item.sourceId,
    proposalKey: 'model-orders',
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    operations: [{ action: 'add_node', node: { id: 'orders', type: 'system', position: { x: 0, y: 0 } } }],
  })
  proposal.operations[0].node.data.label = 'changed after preview'

  assert.throws(
    () => applyDigitalTwinGraphProposal({ nodes: [], edges: [] }, proposal),
    /미리보기 이후 수정안 내용이 달라졌/,
  )
})

t('Workflow Canvas resource proposals contain provenance but never credential values', () => {
  const review = inspectWorkflowSystemTwin(createWorkflowCanvasSystemMap())
  const proposed = review.items.filter((item) => item.proposal)
  const credential = proposed.find((item) => item.itemKey === 'resource:credential-reference:SUPABASE_ANON_KEY')
  const revocations = proposed.find((item) => item.itemKey === 'resource:db-table:share_revocations')

  assert.ok(credential?.proposal)
  assert.ok(revocations?.proposal)
  assert.deepEqual(credential.proposal.counts, { nodes: 0, edges: 0, parts: 1 })
  assert.deepEqual(revocations.proposal.counts, { nodes: 1, edges: 1, parts: 0 })
  const credentialOperation = credential.proposal.operations.find((operation) => operation.action === 'add_part')
  assert.equal(credentialOperation.targetNodeId, 'map-web-app')
  assert.equal(credentialOperation.part.ref, 'SUPABASE_ANON_KEY')
  assert.equal(credentialOperation.part.exposure, 'public')
  assert.equal(credentialOperation.part.digitalTwinBinding.entityKey, 'credential-reference:SUPABASE_ANON_KEY')
  assert.equal(JSON.stringify(credential.proposal).includes('SUPABASE_SERVICE_ROLE_KEY'), false)
  assert.equal(JSON.stringify(credential.proposal).includes('eyJ'), false)
})

t('an older system map replaces the account summary with the app operations part through explicit review', () => {
  const oldMap = structuredClone(createWorkflowCanvasSystemMap())
  const canvasesNode = oldMap.nodes.find((node) => node.id === 'map-canvases-table')
  canvasesNode.data.systemParts = [{
    id: 'map-part-own-canvas-summary',
    kind: 'output',
    label: '내 캔버스 현황',
    ref: 'workflow.supabase.user-canvases.summary',
    exposure: 'internal',
    sourceKind: 'code',
    evidenceRef: 'mcp/systemRuntime.js, supabase-runtime-read.sql',
    digitalTwinBinding: {
      schemaVersion: 1,
      sourceId: 'workflow-canvas:self-system',
      entityKey: 'runtime-capability:workflow.supabase.user-canvases.summary',
      observedFingerprint: '1234567890abcdef',
      observedSnapshotId: 'legacy-snapshot',
    },
  }]

  const review = inspectWorkflowSystemTwin(oldMap)
  const item = review.items.find((candidate) => (
    candidate.itemKey === 'entity-part:map-canvases-table:map-part-own-canvas-summary'
  ))
  assert.ok(item?.proposal)
  assert.equal(item.category, 'runtime')
  assert.deepEqual(item.proposal.counts, { nodes: 0, edges: 0, parts: 1 })
  assert.equal(item.proposal.operations[0].action, 'replace_part')
  assert.equal(item.proposal.operations[0].part.kind, 'output')
  assert.equal(item.proposal.operations[0].part.ref, 'workflow.supabase.canvas-service.operations')

  const applied = applyDigitalTwinGraphProposal(oldMap, item.proposal)
  const extended = { ...oldMap, nodes: applied.nodes, edges: applied.edges }
  const after = inspectWorkflowSystemTwin(extended)
  assert.equal(after.items.some((candidate) => candidate.itemKey === item.itemKey), false)
  const appliedPart = extended.nodes.find((node) => node.id === 'map-canvases-table')
    .data.systemParts.find((part) => part.id === 'map-part-own-canvas-summary')
  assert.equal(
    appliedPart.digitalTwinBinding.entityKey,
    'runtime-capability:workflow.supabase.canvas-service.operations',
  )
  assert.deepEqual(applied.replacedPartIds, ['map-canvases-table:map-part-own-canvas-summary'])
})

t('a missing app operations part remains an additive, reviewable proposal', () => {
  const map = structuredClone(createWorkflowCanvasSystemMap())
  const canvasesNode = map.nodes.find((node) => node.id === 'map-canvases-table')
  canvasesNode.data.systemParts = []
  const review = inspectWorkflowSystemTwin(map)
  const item = review.items.find((candidate) => (
    candidate.itemKey === 'entity-part:map-canvases-table:map-part-own-canvas-summary'
  ))
  assert.equal(item.proposal.operations[0].action, 'add_part')
  assert.equal(item.proposal.operations[0].part.ref, 'workflow.supabase.canvas-service.operations')
})

t('an applied Workflow Canvas proposal becomes modeled and remains fingerprint-tracked', () => {
  const map = createWorkflowCanvasSystemMap()
  const review = inspectWorkflowSystemTwin(map)
  const item = review.items.find((candidate) => candidate.itemKey === 'resource:db-table:share_revocations')
  const applied = applyDigitalTwinGraphProposal(map, item.proposal)
  const extended = { ...map, nodes: applied.nodes, edges: applied.edges }
  const after = inspectWorkflowSystemTwin(extended)
  const appliedNode = extended.nodes.find((node) => node.data?.digitalTwinBinding?.entityKey === 'db-table:share_revocations')

  assert.ok(appliedNode)
  assert.equal(after.items.some((candidate) => candidate.itemKey === item.itemKey), false)
  assert.equal(after.report.summary.unmodeled_resources, review.report.summary.unmodeled_resources - 1)

  const changedDiscovery = structuredClone(WORKFLOW_SYSTEM_DISCOVERY)
  changedDiscovery.current.resources['db-table:share_revocations'].fingerprint = '11111111111111111111'
  const changedReport = inspectWorkflowSystemMap({
    canvas: extended,
    expectedMap: createWorkflowCanvasSystemMap(),
    discovery: changedDiscovery,
  })
  assert.ok(changedReport.node_findings.some((finding) => (
    finding.node_id === appliedNode.id && finding.status === 'changed'
  )))
})

t('an applied credential-reference part becomes modeled and reopens when its evidence changes', () => {
  const map = createWorkflowCanvasSystemMap()
  const review = inspectWorkflowSystemTwin(map)
  const item = review.items.find((candidate) => candidate.itemKey === 'resource:credential-reference:SUPABASE_ANON_KEY')
  const applied = applyDigitalTwinGraphProposal(map, item.proposal)
  const extended = { ...map, nodes: applied.nodes, edges: applied.edges }
  const after = inspectWorkflowSystemTwin(extended)
  const webApp = extended.nodes.find((node) => node.id === 'map-web-app')
  const appliedPart = webApp.data.systemParts.find((part) => (
    part.digitalTwinBinding?.entityKey === 'credential-reference:SUPABASE_ANON_KEY'
  ))

  assert.ok(appliedPart)
  assert.equal(after.items.some((candidate) => candidate.itemKey === item.itemKey), false)
  assert.equal(after.report.summary.unmodeled_resources, review.report.summary.unmodeled_resources - 1)

  const changedDiscovery = structuredClone(WORKFLOW_SYSTEM_DISCOVERY)
  changedDiscovery.current.resources['credential-reference:SUPABASE_ANON_KEY'].fingerprint = '22222222222222222222'
  const changedReport = inspectWorkflowSystemMap({
    canvas: extended,
    expectedMap: createWorkflowCanvasSystemMap(),
    discovery: changedDiscovery,
  })
  assert.ok(changedReport.node_findings.some((finding) => (
    finding.node_id === 'map-web-app'
    && finding.status === 'changed'
    && finding.resources.some((resource) => resource.key === 'credential-reference:SUPABASE_ANON_KEY')
  )))
})

t('different resource proposals merge without duplicate nodes across two canvas editors', () => {
  const map = createWorkflowCanvasSystemMap()
  const review = inspectWorkflowSystemTwin(map)
  const credential = review.items.find((item) => item.itemKey === 'resource:credential-reference:SUPABASE_ANON_KEY')
  const revocations = review.items.find((item) => item.itemKey === 'resource:db-table:share_revocations')
  const localApplied = applyDigitalTwinGraphProposal(map, credential.proposal)
  const remoteApplied = applyDigitalTwinGraphProposal(map, revocations.proposal)
  const base = { ...map, notes: [], views: map.views, stageTypes: null }
  const local = { ...base, nodes: localApplied.nodes, edges: localApplied.edges }
  const remote = { ...base, nodes: remoteApplied.nodes, edges: remoteApplied.edges }
  const { merged, conflicts } = mergeCanvasSnapshots(base, local, remote)
  const bindings = merged.nodes.flatMap((node) => [
    node.data?.digitalTwinBinding?.entityKey,
    ...(node.data?.systemParts ?? []).map((part) => part.digitalTwinBinding?.entityKey),
  ]).filter(Boolean)

  assert.deepEqual(conflicts, [])
  assert.deepEqual(new Set(bindings), new Set([
    'runtime-capability:workflow.vercel.deployment.runtime',
    'runtime-capability:workflow.api.shared-canvas.health',
    'runtime-capability:workflow.api.mcp.route',
    'runtime-capability:workflow.supabase.auth.session',
    'runtime-capability:workflow.supabase.canvas-service.operations',
    'credential-reference:SUPABASE_ANON_KEY',
    'db-table:share_revocations',
  ]))
  assert.equal(new Set(merged.nodes.map((node) => node.id)).size, merged.nodes.length)
  assert.equal(new Set(merged.edges.map((edge) => edge.id)).size, merged.edges.length)
})

console.log('system map relation repair safety')

t('repair plan selects only structurally matching edges with completely missing metadata', () => {
  const expected = createWorkflowCanvasSystemMap()
  const damaged = structuredClone(expected)
  const before = structuredClone(damaged)
  damaged.edges = damaged.edges.map((edge, index) => {
    const next = { ...edge }
    delete next.data
    if (index === 0) next.data = { legacyDecoration: 'preserve-me' }
    return next
  })
  const damagedBeforePlanning = structuredClone(damaged)
  const plan = planWorkflowSystemMapRelationRepair({ canvas: damaged, expectedMap: expected })

  assert.equal(plan.summary.expected_relations, expected.edges.length)
  assert.equal(plan.summary.repairable_missing_metadata, expected.edges.length)
  assert.equal(plan.summary.protected_existing_metadata, 0)
  assert.equal(plan.summary.structural_blockers, 0)
  assert.deepEqual(damaged, damagedBeforePlanning)
  assert.notDeepEqual(damaged, before)
})

t('repair restores expected relation data while preserving every other edge field', () => {
  const expected = createWorkflowCanvasSystemMap()
  const damaged = structuredClone(expected)
  damaged.edges = damaged.edges.map((edge, index) => {
    const next = { ...edge, untouchedField: `value-${index}` }
    delete next.data
    if (index === 0) next.data = { legacyDecoration: 'preserve-me' }
    return next
  })
  const damagedBefore = structuredClone(damaged)
  const result = restoreMissingWorkflowSystemMapRelations({ canvas: damaged, expectedMap: expected })

  assert.equal(result.repaired_edge_ids.length, expected.edges.length)
  assert.equal(result.edges[0].data.legacyDecoration, 'preserve-me')
  assert.equal(result.edges[0].data.relationType, 'uses')
  assert.equal(result.edges[0].data.relationEvidenceRef, 'src/App.jsx')
  assert.equal(result.edges[0].untouchedField, 'value-0')
  assert.deepEqual(damaged, damagedBefore)
})

t('repair protects an existing intentional relation edit instead of overwriting it', () => {
  const expected = createWorkflowCanvasSystemMap()
  const damaged = structuredClone(expected)
  damaged.edges = damaged.edges.map((edge) => {
    const next = { ...edge }
    delete next.data
    return next
  })
  damaged.edges[0].data = createEdgeRelationData('reads', '', true, {
    relationSourceKind: 'manual',
    relationEvidence: '사용자가 별도로 수정함',
  })
  const plan = planWorkflowSystemMapRelationRepair({ canvas: damaged, expectedMap: expected })
  const result = restoreMissingWorkflowSystemMapRelations({ canvas: damaged, expectedMap: expected })

  assert.equal(plan.summary.repairable_missing_metadata, expected.edges.length - 1)
  assert.equal(plan.summary.protected_existing_metadata, 1)
  assert.equal(plan.protected_relations[0].edge_id, damaged.edges[0].id)
  assert.equal(result.edges[0].data.relationType, 'reads')
  assert.equal(result.repaired_edge_ids.includes(damaged.edges[0].id), false)
})

t('repair refuses a missing edge or changed endpoint instead of guessing', () => {
  const expected = createWorkflowCanvasSystemMap()
  const damaged = structuredClone(expected)
  delete damaged.edges[0].data
  damaged.edges[0].target = 'map-postgres'
  damaged.edges.pop()
  const plan = planWorkflowSystemMapRelationRepair({ canvas: damaged, expectedMap: expected })

  assert.equal(plan.summary.structural_blockers, 2)
  assert.ok(plan.blockers.some((item) => item.reason === 'endpoint_mismatch'))
  assert.ok(plan.blockers.some((item) => item.reason === 'edge_missing'))
  assert.throws(
    () => restoreMissingWorkflowSystemMapRelations({ canvas: damaged, expectedMap: expected }),
    /구조가 다른 관계/,
  )
})

t('repair plan id is bound to revision, manifest and exact repair list', () => {
  const expected = createWorkflowCanvasSystemMap()
  const damaged = structuredClone(expected)
  delete damaged.edges[0].data
  const plan = planWorkflowSystemMapRelationRepair({ canvas: damaged, expectedMap: expected })
  const first = workflowSystemMapRelationRepairPlanId('canvas-1', 'revision-1', plan, 'manifest-1')

  assert.match(first, /^[a-f0-9]{64}$/)
  assert.equal(first, workflowSystemMapRelationRepairPlanId('canvas-1', 'revision-1', plan, 'manifest-1'))
  assert.notEqual(first, workflowSystemMapRelationRepairPlanId('canvas-1', 'revision-2', plan, 'manifest-1'))
  assert.notEqual(first, workflowSystemMapRelationRepairPlanId('canvas-1', 'revision-1', plan, 'manifest-2'))
  assert.equal(WORKFLOW_RELATION_REPAIR_CONFIRMATION, 'RESTORE_MISSING_RELATION_METADATA')
})

t('database relation guard errors become an actionable reload error in the browser', () => {
  const guarded = canvasWriteError({
    message: `[${RELATION_METADATA_GUARD_MARKER}] blocked`,
  })
  const ordinary = canvasWriteError({ message: 'network unavailable' })

  assert.ok(guarded instanceof CanvasSchemaGuardError)
  assert.equal(guarded.code, 'CANVAS_SCHEMA_GUARD')
  assert.match(guarded.message, /최신 앱/)
  assert.equal(ordinary instanceof CanvasSchemaGuardError, false)
  assert.match(ordinary.message, /network unavailable/)
})

console.log('validateGraphInput')

const types5 = [0, 1, 2, 3, 4].map((i) => ({ label: `t${i}` }))

t('accepts a valid graph', () => {
  validateGraphInput({ nodes: [stage('A'), stage('B')], edges: [edge('A', 'B')] }, [], types5)
})

t('accepts system entities without a stageTypeIdx', () => {
  validateGraphInput({
    nodes: [system('API', 'api'), system('DB', 'database')],
    edges: [edge('API', 'DB')],
  }, [], types5)
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

t('browser sanitizer blocks stored-XSS markup while preserving safe formatting', () => {
  const out = sanitizeBrowserHtml('<img src=x onerror=alert(1)><a href="javascript:alert(1)">x</a><b>ok</b>')
  assert.equal(out.includes('onerror'), false)
  assert.equal(out.includes('javascript:'), false)
  assert.equal(out.includes('<b>ok</b>'), true)
})

t('browser URL sanitizer allows http(s) and rejects active protocols', () => {
  assert.equal(sanitizeBrowserUrl('javascript:alert(1)'), '')
  assert.equal(sanitizeBrowserUrl('data:text/html,boom'), '')
  assert.equal(sanitizeBrowserUrl('https://example.com/a'), 'https://example.com/a')
})

console.log('canvas realtime snapshot comparison')

t('detects a stage-type-only remote change', () => {
  const base = { nodes: [], edges: [], views: [], stageTypes: [{ id: 'a', label: '기획' }] }
  const changed = { ...base, stageTypes: [{ id: 'a', label: '계획' }] }
  assert.equal(sameCanvasSnapshot(base, changed), false)
})

t('detects a saved-view-only remote change', () => {
  const base = { nodes: [], edges: [], views: [], stageTypes: null }
  const changed = { ...base, views: [{ id: 'v1', name: '검토' }] }
  assert.equal(sameCanvasSnapshot(base, changed), false)
})

t('detects an independent-note-only remote change', () => {
  const base = { nodes: [], edges: [], notes: [], views: [], stageTypes: null }
  const changed = { ...base, notes: [{ id: 'note-1', type: 'memo', data: { text: '새 메모' } }] }
  assert.equal(sameCanvasSnapshot(base, changed), false)
})

t('treats equivalent realtime snapshots as unchanged', () => {
  const snapshot = { nodes: [{ id: 'a' }], edges: [], views: [], stageTypes: null }
  assert.equal(sameCanvasSnapshot(snapshot, structuredClone(snapshot)), true)
})

t('caps canvas history while keeping the newest snapshots', () => {
  let stack = []
  let pointer = -1
  for (let i = 0; i < 120; i++) {
    stack = appendHistorySnapshot(stack, pointer, { id: i }, 100)
    pointer = stack.length - 1
  }
  assert.equal(stack.length, 100)
  assert.equal(stack[0].id, 20)
  assert.equal(stack.at(-1).id, 119)
})

t('drops redo history when a new edit follows undo', () => {
  const stack = [{ id: 1 }, { id: 2 }, { id: 3 }]
  assert.deepEqual(appendHistorySnapshot(stack, 0, { id: 4 }), [{ id: 1 }, { id: 4 }])
})

console.log('group-aware canvas geometry')

t('converts a group child position to absolute flow coordinates', () => {
  const nodes = [
    { id: 'group', position: { x: 500, y: 300 } },
    { id: 'child', parentId: 'group', position: { x: 40, y: 60 } },
  ]
  assert.deepEqual(absoluteNodePosition(nodes[1], new Map(nodes.map((node) => [node.id, node]))), { x: 540, y: 360 })
})

t('saved-view bounds use absolute positions for group children', () => {
  const nodes = [
    { id: 'group', position: { x: 500, y: 300 }, width: 400, height: 300 },
    { id: 'child', parentId: 'group', position: { x: 40, y: 60 }, width: 200, height: 80 },
  ]
  assert.deepEqual(boundsForNodeIds(nodes, ['child']), { x: 540, y: 360, width: 200, height: 80 })
})

console.log('three-way canvas merge')

t('preserves edits made to different nodes', () => {
  const base = { name: 'A', nodes: [{ id: 'a', data: { text: 'old' } }, { id: 'b', data: { text: 'old' } }], edges: [], views: [], stageTypes: null }
  const local = structuredClone(base)
  const remote = structuredClone(base)
  local.nodes[0].data.text = 'local'
  remote.nodes[1].data.text = 'remote'
  const result = mergeCanvasSnapshots(base, local, remote)
  assert.deepEqual(result.conflicts, [])
  assert.equal(result.merged.nodes.find((node) => node.id === 'a').data.text, 'local')
  assert.equal(result.merged.nodes.find((node) => node.id === 'b').data.text, 'remote')
})

t('merges different fields on the same node', () => {
  const base = { name: 'A', nodes: [{ id: 'a', position: { x: 0, y: 0 }, data: { text: 'old' } }], edges: [], views: [], stageTypes: null }
  const local = structuredClone(base)
  const remote = structuredClone(base)
  local.nodes[0].data.text = 'local'
  remote.nodes[0].position.x = 100
  const result = mergeCanvasSnapshots(base, local, remote)
  assert.deepEqual(result.conflicts, [])
  assert.equal(result.merged.nodes[0].data.text, 'local')
  assert.equal(result.merged.nodes[0].position.x, 100)
})

t('reports a true same-field conflict and keeps local as the proposed result', () => {
  const base = { name: 'A', nodes: [{ id: 'a', data: { text: 'old' } }], edges: [], views: [], stageTypes: null }
  const local = structuredClone(base)
  const remote = structuredClone(base)
  local.nodes[0].data.text = 'mine'
  remote.nodes[0].data.text = 'theirs'
  const result = mergeCanvasSnapshots(base, local, remote)
  assert.deepEqual(result.conflicts, ['nodes.a.data.text'])
  assert.equal(result.merged.nodes[0].data.text, 'mine')
})

t('reports delete-versus-edit as a conflict', () => {
  const base = { name: 'A', nodes: [{ id: 'a', data: { text: 'old' } }], edges: [], views: [], stageTypes: null }
  const local = { ...base, nodes: [] }
  const remote = structuredClone(base)
  remote.nodes[0].data.text = 'changed'
  const result = mergeCanvasSnapshots(base, local, remote)
  assert.deepEqual(result.conflicts, ['nodes.a'])
  assert.equal(result.merged.nodes.length, 0)
})

t('merges independent notes by id without treating them as canvas nodes', () => {
  const base = { name: 'A', nodes: [], edges: [], notes: [{ id: 'note-a', data: { text: 'old' } }], views: [], stageTypes: null }
  const local = structuredClone(base)
  const remote = structuredClone(base)
  local.notes[0].data.text = 'local'
  remote.notes.push({ id: 'note-b', data: { text: 'remote' } })
  const result = mergeCanvasSnapshots(base, local, remote)
  assert.deepEqual(result.conflicts, [])
  assert.equal(result.merged.notes.find((note) => note.id === 'note-a').data.text, 'local')
  assert.equal(result.merged.notes.find((note) => note.id === 'note-b').data.text, 'remote')
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
    assert.throws(() => assertRegionEdit(nodeInv, NODES, { kind: 'node-update', nodeId: 'b' }), /밖 노드입니다/)
    assert.throws(() => assertRegionEdit(nodeInv, NODES, { kind: 'node-update', nodeId: 'a', movesPosition: true }), /위치\(x\/y\)/)
    assert.throws(() => assertRegionEdit(nodeInv, NODES, { kind: 'node-delete', nodeId: 'a' }), /삭제할 수 없습니다/)
    assert.throws(() => assertRegionEdit(nodeInv, NODES, { kind: 'node-create' }), /내용·크기 수정만/)
    assert.throws(() => assertRegionEdit(nodeInv, NODES, { kind: 'edge', source: 'a', target: 'b' }), /양 끝/)
})

t('composed grants union full-canvas reading with scoped group editing', () => {
  const permission = composeSharePermission([
    { id: 'canvas-read', scope: 'canvas', can_edit: false, restrict_view: false },
    { id: 'group-edit', scope: 'group', target_id: 'grp', can_edit: true, restrict_view: true },
  ])
  assert.equal(permission.scope, 'composed')
  assert.equal(permission.canEdit, true)
  assert.equal(permission.canEditCanvas, false)
  assert.equal(permission.restrictView, false)
  assert.deepEqual([...editableNodeIdSetForPermission(permission, NODES)].sort(), ['a', 'b'])
  assert.equal(visibleNodeIdSetForPermission(permission, NODES), null)
})

t('composed group grants edit the union and allow edges only inside granted groups', () => {
  const nodes = [
    { id: 'g1', type: 'group' }, { id: 'a', parentId: 'g1' },
    { id: 'g2', type: 'group' }, { id: 'b', parentId: 'g2' },
    { id: 'outside' },
  ]
  const permission = composeSharePermission([
    { scope: 'group', targetId: 'g1', canEdit: true, restrictView: true },
    { scope: 'group', targetId: 'g2', canEdit: true, restrictView: true },
  ])
  assert.deepEqual([...editableNodeIdSetForPermission(permission, nodes)].sort(), ['a', 'b'])
  assert.deepEqual([...visibleNodeIdSetForPermission(permission, nodes)].sort(), ['a', 'b', 'g1', 'g2'])
  assert.equal(permissionCanEditEdge(permission, nodes[1], nodes[3]), true)
  assert.equal(permissionCanEditEdge(permission, nodes[1], nodes[4]), false)
})

console.log('wheel routing / share launch coordination')

function fakeElement(classes, parentElement = null, dimensions = {}, style = {}) {
  return {
    nodeType: 1,
    parentElement,
    classList: { contains: (name) => classes.includes(name) },
    scrollHeight: dimensions.scrollHeight ?? 100,
    clientHeight: dimensions.clientHeight ?? 100,
    scrollWidth: dimensions.scrollWidth ?? 100,
    clientWidth: dimensions.clientWidth ?? 100,
    _style: { overflowY: 'visible', overflowX: 'visible', ...style },
  }
}

t('node body scroll is native only while its node is selected', () => {
  const root = fakeElement(['react-flow'])
  const unselected = fakeElement(['react-flow__node'], root)
  const unselectedBody = fakeElement(['rich-content'], unselected, { scrollHeight: 400, clientHeight: 100 }, { overflowY: 'auto' })
  assert.equal(nativeWheelScrollTarget(unselectedBody, root, 0, 20, (el) => el._style), null)

  const selected = fakeElement(['react-flow__node', 'selected'], root)
  const selectedBody = fakeElement(['rich-content'], selected, { scrollHeight: 400, clientHeight: 100 }, { overflowY: 'auto' })
  assert.equal(nativeWheelScrollTarget(selectedBody, root, 0, 20, (el) => el._style), selectedBody)
})

t('open part catalog keeps native scrolling even without a selected-node ancestor', () => {
  const root = fakeElement(['react-flow'])
  const editor = fakeElement(['system-part-editor'], root)
  const list = fakeElement(['system-observation-catalog-list'], editor, { scrollHeight: 500, clientHeight: 120 }, { overflowY: 'auto' })
  assert.equal(nativeWheelScrollTarget(list, root, 0, 20, (el) => el._style), list)
})

t('share launch fallback keeps one claimant and never stores the raw token', () => {
  const values = new Map()
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  }
  const token = 'secret-share-token'
  const first = claimShareLaunchFallback(token, { storage, now: 1, ownerId: 'tab-a' })
  const second = claimShareLaunchFallback(token, { storage, now: 2, ownerId: 'tab-b' })
  assert.ok(first)
  assert.equal(second, null)
  assert.equal(JSON.stringify([...values]), JSON.stringify([...values]).replaceAll(token, ''))
  assert.equal(shareTokenFingerprint(token), shareTokenFingerprint(token))
  first.release()
  assert.ok(claimShareLaunchFallback(token, { storage, now: 3, ownerId: 'tab-b' }))
})

t('privacy release status cannot claim operator blindness before encryption', () => {
  assert.equal(CANVAS_PRIVACY_CAPABILITIES.operatorBlind, false)
  assert.equal(CANVAS_PRIVACY_CAPABILITIES.endToEndEncryption, false)
  assert.ok(CANVAS_ENCRYPTION_TRANSITION.compatibilityGates.includes('explicit-mcp-key-delegation'))
  assert.throws(() => assertPrivacyReleaseGate({ WORKFLOW_CANVAS_PUBLIC_RELEASE: 'true' }), /게이트 차단/)
  assert.equal(assertPrivacyReleaseGate({}).publicReleaseGate, 'blocked-pending-operator-blind-storage')
})

await ta('server data access audit uses an allowlist and can fail closed', async () => {
  let inserted = null
  const healthyDb = { from: () => ({ insert: async (row) => { inserted = row; return { error: null } } }) }
  const entry = {
    actorUserId: 'actor', ownerUserId: 'owner', canvasId: 'canvas',
    source: 'mcp', purpose: 'mcp_canvas_operation', operation: 'read',
  }
  assert.deepEqual(await recordCanvasDataAccess(healthyDb, entry, {}), { available: true, recorded: true })
  assert.equal(inserted.canvas_id, 'canvas')

  const unavailableDb = { from: () => ({ insert: async () => ({ error: { code: '42P01' } }) }) }
  await assert.rejects(
    () => recordCanvasDataAccess(unavailableDb, entry, { WORKFLOW_CANVAS_ACCESS_AUDIT_MODE: 'required' }),
    /감사 기록/,
  )
  await assert.rejects(
    () => recordCanvasDataAccess(healthyDb, { ...entry, purpose: 'arbitrary_operator_read' }, {}),
    /허용되지 않은/,
  )
})

console.log('shared canvas server gateway')

const sharedRow = {
  nodes: [
    { id: 'frame', type: 'group', position: { x: 0, y: 0 }, data: { label: '비공개 그룹' } },
    { id: 'inside', type: 'memo', parentId: 'frame', position: { x: 10, y: 10 }, data: { header: '허용', text: '볼 수 있음' } },
    { id: 'outside', type: 'memo', position: { x: 500, y: 10 }, data: { header: '비공개', text: '보이면 안 됨' } },
  ],
  edges: [{
    id: 'inside-edge', source: 'inside', target: 'outside',
    data: createEdgeRelationData('custom', '민감한 의존 관계', true, {
      relationSourceKind: 'document',
      relationConfidence: 'high',
      relationEvidence: '숨겨진 운영 정보',
      relationEvidenceRef: 'private/runbook.md',
    }),
  }],
  notes: [{ id: 'note-private', type: 'memo', data: { header: '별도 노트', text: '보이면 안 됨' } }],
}

t('restrict_view: server redacts body data outside the invited group', () => {
  const result = redactCanvas({ row: sharedRow, scope: 'group', targetId: 'frame', canEdit: true, restrictView: true })
  assert.equal(result.nodes.find((node) => node.id === 'frame').data.label, '비공개 그룹')
  const hidden = result.nodes.find((node) => node.id === 'outside')
  assert.deepEqual(hidden.data, { redacted: true })
  assert.equal(JSON.stringify(hidden).includes('비공개'), false)
  assert.equal(Object.hasOwn(result.edges[0], 'data'), false)
  assert.equal(result.edges[0].redacted, true)
  assert.equal(JSON.stringify(result.edges).includes('민감한'), false)
  assert.equal(JSON.stringify(result.edges).includes('runbook'), false)
  assert.deepEqual(result.notes, [])
})

t('composed canvas-read plus group-edit saves only the group union', () => {
  const access = {
    row: sharedRow,
    grants: [
      { scope: 'canvas', canEdit: false, restrictView: false },
      { scope: 'group', targetId: 'frame', canEdit: true, restrictView: true },
    ],
  }
  const submitted = structuredClone(sharedRow.nodes)
  submitted.find((node) => node.id === 'inside').data.text = '합성 권한으로 수정'
  const result = applySharedCanvasUpdate(access, submitted, sharedRow.edges, {
    notes: [{ id: 'forged' }],
  })
  assert.equal(result.nodes.find((node) => node.id === 'inside').data.text, '합성 권한으로 수정')
  assert.equal(result.nodes.find((node) => node.id === 'outside').data.text, '보이면 안 됨')
  assert.equal(Object.hasOwn(result, 'notes'), false)
})

t('restrict_view: saving redacted edges preserves the hidden original relation', () => {
  const redacted = redactCanvas({ row: sharedRow, scope: 'group', targetId: 'frame', canEdit: true, restrictView: true })
  const result = applySharedCanvasUpdate(
    { row: sharedRow, scope: 'group', targetId: 'frame', canEdit: true, restrictView: true },
    redacted.nodes,
    redacted.edges,
  )
  assert.equal(result.edges[0].data.relationType, 'custom')
  assert.equal(result.edges[0].data.relationLabel, '민감한 의존 관계')
  assert.equal(result.edges[0].data.relationEvidenceRef, 'private/runbook.md')
})

t('shared save treats a missing MCP edge type and browser stub type as equivalent', () => {
  const submittedEdges = sharedRow.edges.map((edge) => ({ ...structuredClone(edge), type: 'stub' }))
  const result = applySharedCanvasUpdate(
    { row: sharedRow, scope: 'group', targetId: 'frame', canEdit: true, restrictView: false },
    sharedRow.nodes,
    submittedEdges,
  )
  assert.equal(result.edges[0].type, 'stub')
  assert.equal(result.edges[0].data.relationType, 'custom')
})

t('group invite: server rejects moving a child outside the group', () => {
  const submitted = structuredClone(sharedRow.nodes)
  submitted.find((node) => node.id === 'inside').parentId = undefined
  assert.throws(() => applySharedCanvasUpdate(
    { row: sharedRow, scope: 'group', targetId: 'frame', canEdit: true, restrictView: false }, submitted, sharedRow.edges,
  ), /그룹 밖/)
})

t('group invite: server rejects rewiring an inside edge to an outside node', () => {
  const row = structuredClone(sharedRow)
  row.edges = [{ id: 'inside-edge', source: 'inside', target: 'inside' }]
  const submittedEdges = [{ id: 'inside-edge', source: 'inside', target: 'outside' }]
  assert.throws(() => applySharedCanvasUpdate(
    { row, scope: 'group', targetId: 'frame', canEdit: true, restrictView: false }, row.nodes, submittedEdges,
  ), /편집 범위 안/)
})

t('shared save: server rejects duplicate node ids', () => {
  const submitted = [...structuredClone(sharedRow.nodes), structuredClone(sharedRow.nodes[1])]
  assert.throws(() => applySharedCanvasUpdate(
    { row: sharedRow, scope: 'canvas', targetId: null, canEdit: true, restrictView: false }, submitted, sharedRow.edges,
  ), /중복된 노드 id/)
})

t('shared save: server rejects dangling edges', () => {
  const submittedEdges = [{ id: 'dangling', source: 'inside', target: 'missing' }]
  assert.throws(() => applySharedCanvasUpdate(
    { row: sharedRow, scope: 'canvas', targetId: null, canEdit: true, restrictView: false }, sharedRow.nodes, submittedEdges,
  ), /존재하는 노드/)
})

t('shared save: server strips active protocols from browser content URLs', () => {
  const row = {
    nodes: [{ id: 'browser', type: 'content', position: { x: 0, y: 0 }, data: { kind: 'browser', url: '' } }],
    edges: [],
  }
  const submitted = structuredClone(row.nodes)
  submitted[0].data.url = 'javascript:alert(1)'
  const result = applySharedCanvasUpdate(
    { row, scope: 'canvas', targetId: null, canEdit: true, restrictView: false }, submitted, [],
  )
  assert.equal(result.nodes[0].data.url, '')
})

t('canvas invite: server accepts canvas-level notes, views and stage types', () => {
  const views = [{ id: 'view-1', name: '검토', bounds: { x: 0, y: 0, width: 800, height: 600 } }]
  const stageTypes = [{ id: 'plan', label: '계획', bg: '#111', border: '#222' }]
  const notes = [{ id: 'note-1', type: 'memo', data: { header: '메모', text: '<b>본문</b>' } }]
  const result = applySharedCanvasUpdate(
    { row: sharedRow, scope: 'canvas', targetId: null, canEdit: true, restrictView: false },
    sharedRow.nodes,
    sharedRow.edges,
    { notes, views, stageTypes },
  )
  assert.deepEqual(result.notes, notes)
  assert.deepEqual(result.views, views)
  assert.deepEqual(result.stageTypes, stageTypes)
})

t('shared save never persists a client-supplied redaction marker', () => {
  const submittedEdges = sharedRow.edges.map((edge) => ({ ...structuredClone(edge), redacted: true }))
  const result = applySharedCanvasUpdate(
    { row: sharedRow, scope: 'canvas', targetId: null, canEdit: true, restrictView: false },
    sharedRow.nodes,
    submittedEdges,
  )
  assert.equal(Object.hasOwn(result.edges[0], 'redacted'), false)
})

t('group invite: server never accepts canvas-level metadata changes', () => {
  const result = applySharedCanvasUpdate(
    { row: sharedRow, scope: 'group', targetId: 'frame', canEdit: true, restrictView: false },
    sharedRow.nodes,
    sharedRow.edges,
    { notes: [{ id: 'forged' }], views: [{ id: 'forged' }], stageTypes: [{ id: 'forged' }] },
  )
  assert.equal(Object.hasOwn(result, 'notes'), false)
  assert.equal(Object.hasOwn(result, 'views'), false)
  assert.equal(Object.hasOwn(result, 'stageTypes'), false)
})

t('read-only invite: server rejects every save attempt', () => {
  assert.throws(() => applySharedCanvasUpdate(
    { row: sharedRow, scope: 'canvas', targetId: null, canEdit: false, restrictView: false }, sharedRow.nodes, sharedRow.edges,
  ), /읽기 전용/)
})

t('member restriction override removes redaction without changing the invitation default', () => {
  const share = { id: 'share-1', scope: 'group', target_id: 'frame', restrict_view: true }
  assert.equal(effectiveShareGrant(share, { can_edit: true }).restrict_view, true)
  assert.equal(effectiveShareGrant(share, { can_edit: true, restrict_view_override: false }).restrict_view, false)
  assert.equal(effectiveShareGrant(share, { can_edit: true, restrict_view_override: true }).restrict_view, true)
  assert.equal(share.restrict_view, true)
})

t('participant roster permission uses the same strongest-grant ordering as canvas access', () => {
  const best = pickBestShareAccess([
    { id: 'node', scope: 'node', can_edit: true, restrict_view: false },
    { id: 'canvas-read', scope: 'canvas', can_edit: false, restrict_view: false },
    { id: 'canvas-edit', scope: 'canvas', can_edit: true, restrict_view: true },
  ])
  assert.equal(best.id, 'canvas-edit')
})

console.log('canvas refresh navigation')

t('refresh restores the tab-local own canvas before a stale cloud preference', () => {
  const rows = [{ canvas_id: 'first' }, { canvas_id: 'current' }]
  assert.equal(chooseOwnCanvasToRestore(rows, { active_canvas_id: 'first' }, 'current'), 'current')
})

t('refresh ignores deleted or shared ids until server access is revalidated', () => {
  const rows = [{ canvas_id: 'safe' }]
  assert.equal(chooseOwnCanvasToRestore(rows, { active_canvas_id: 'deleted' }, 'shared:owner:canvas'), 'safe')
})

console.log('MCP canvas node representation')

t('get_canvas representation includes group parent and absolute coordinates', () => {
  const group = { id: 'group', type: 'group', position: { x: 500, y: 300 }, width: 400, height: 300, data: { label: '팀' } }
  const child = {
    id: 'content', type: 'content', parentId: 'group', position: { x: 40, y: 60 },
    data: { kind: 'browser', header: '문서', url: 'https://example.com' },
  }
  const byId = new Map([[group.id, group], [child.id, child]])
  const result = toExternalCanvasNode(child, byId)
  assert.equal(result.parent_id, 'group')
  assert.deepEqual(result.absolute_position, { x: 540, y: 360 })
  assert.equal(result.kind, 'browser')
  assert.equal(result.url, 'https://example.com')
})

t('get_canvas representation does not return legacy embedded image bytes', () => {
  const photo = { id: 'photo', type: 'content', position: { x: 0, y: 0 }, data: { kind: 'photo', src: 'data:image/jpeg;base64,AAAA' } }
  const result = toExternalCanvasNode(photo, new Map([[photo.id, photo]]))
  assert.equal(result.embedded_image, true)
  assert.equal(Object.hasOwn(result, 'image_url'), false)
  assert.equal(JSON.stringify(result).includes('AAAA'), false)
})

t('get_canvas represents system ontology without claiming a live twin', () => {
  const node = {
    id: 'system-db', type: 'system', position: { x: 10, y: 20 },
    data: {
      label: '운영 DB', systemKind: 'database', purpose: '업무 원본 저장',
      environment: 'production', sourceKind: 'manual', provider: 'Supabase', externalRef: 'public.canvases',
      systemParts: [{
        id: 'orders-input', kind: 'input', label: '주문 입력', ref: 'orders.id',
        exposure: 'internal', sourceKind: 'manual', evidenceRef: '',
      }],
    },
  }
  const result = toExternalCanvasNode(node, new Map([[node.id, node]]))
  assert.equal(result.system_kind, 'database')
  assert.equal(result.environment, 'production')
  assert.equal(result.external_ref, 'public.canvases')
  assert.equal(result.system_parts[0].ref, 'orders.id')
  assert.equal(result.reality, 'declared')
})
}

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures)' : ''}`)
