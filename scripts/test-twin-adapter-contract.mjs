import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { applyDigitalTwinGraphProposal } from '../shared/digitalTwinProposal.js'
import {
  createTwinAdapterDescriptor,
  createTwinAdapterRegistration,
  createTwinAdapterRegistry,
  TWIN_ADAPTER_CONTRACT_VERSION,
  TWIN_ENGINE_SCHEMA_VERSION,
  TwinAdapterContractError,
} from '../shared/twinAdapterContract.js'
import {
  digitalTwinReviewDecision,
  setDigitalTwinReviewDecision,
} from '../shared/digitalTwinReview.js'
import { createTwinBuild } from '../shared/twinBuild.js'
import { reconcileTwinBuild } from '../shared/twinBuildReconciler.js'
import { createWorkflowCanvasSystemMap } from '../shared/workflowCanvasSystemMap.js'
import { workflowSystemTwinAdapter } from '../shared/workflowSystemTwinAdapter.js'
import {
  canInspectWorkflowSystemCanvas,
  WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR,
} from '../shared/workflowSystemTwinAdapterDescriptor.js'

const fixtureUrl = new URL('./fixtures/twin-adapter-contract/', import.meta.url)
const fixtureCanvas = JSON.parse(await readFile(new URL('order-service-canvas.json', fixtureUrl), 'utf8'))
const fixtureBuild = createTwinBuild(JSON.parse(await readFile(new URL('order-service-build.json', fixtureUrl), 'utf8')))
const fixtureReconciliation = JSON.parse(await readFile(new URL('order-service-reconciliation.json', fixtureUrl), 'utf8'))

const fixtureDescriptor = createTwinAdapterDescriptor({
  id: 'fixture-order-system',
  contractVersion: TWIN_ADAPTER_CONTRACT_VERSION,
  adapterVersion: '1.2.0',
  minimumEngineSchemaVersion: TWIN_ENGINE_SCHEMA_VERSION,
  maximumEngineSchemaVersion: TWIN_ENGINE_SCHEMA_VERSION,
  label: '주문 서비스 픽스처',
  description: '범용 레지스트리에 두 번째 소프트웨어 어댑터를 꽂는 골든 테스트입니다.',
  systemKinds: ['order-service'],
  interfaces: ['describe', 'canInspect', 'inspect', 'normalize', 'reconcile'],
  features: ['canonical-twin-build', 'common-reconciliation', 'golden-review'],
  dataClasses: [{
    id: 'order-topology',
    label: '주문 서비스 구조',
    sensitivity: 'internal',
    leavesSource: false,
    includesContent: false,
  }],
  permissions: [{
    id: 'fixture-canvas-read',
    label: '픽스처 지도 읽기',
    access: 'read',
    scope: 'fixture-canvas',
    required: true,
  }],
  operationCapabilities: [],
})

let inspectedFrozenCanvas = false
const fixtureAdapter = Object.freeze({
  describe: () => fixtureDescriptor,
  canInspect: (canvas) => canvas?.nodes?.some((node) => node.data?.fixtureSystem === 'order-service'),
  normalize: () => fixtureBuild,
  reconcile: (canvas, build = fixtureBuild) => reconcileTwinBuild({ build, canvas }),
  inspect(canvas) {
    inspectedFrozenCanvas = Object.isFrozen(canvas) && Object.isFrozen(canvas.nodes) && Object.isFrozen(canvas.nodes[0].data)
    return reconcileTwinBuild({ build: fixtureBuild, canvas })
  },
})

function reconciliationProjection(review) {
  return {
    pending: review.summary.pending,
    actionable: review.summary.actionable,
    blocked: review.summary.blocked,
    items: review.items.map((item) => ({
      itemKey: item.itemKey,
      status: item.status,
      action: item.proposal?.operations?.[0]?.action ?? null,
    })).sort((left, right) => left.itemKey.localeCompare(right.itemKey)),
  }
}

const registry = createTwinAdapterRegistry([
  createTwinAdapterRegistration({
    descriptor: WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR,
    canInspect: canInspectWorkflowSystemCanvas,
    load: async () => workflowSystemTwinAdapter,
  }),
  createTwinAdapterRegistration({
    descriptor: fixtureDescriptor,
    canInspect: fixtureAdapter.canInspect,
    load: async () => fixtureAdapter,
  }),
])

assert.equal(registry.descriptors.length, 2)
assert.equal(registry.descriptors[1].id, 'fixture-order-system')
assert.equal(registry.descriptors[1].permissions[0].access, 'read')
assert.equal(registry.descriptors[1].dataClasses[0].includesContent, false)
assert.equal(
  WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR.dataClasses
    .find((item) => item.id === 'deployment-source-metadata')?.leavesSource,
  true,
)
assert.deepEqual(WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR.operationCapabilities, [
  'source-twin.snapshot.create',
  'workflow.local.git-sync',
])

const fixtureBefore = structuredClone(fixtureCanvas)
const fixtureResult = await registry.inspect(fixtureCanvas)
assert.deepEqual(fixtureCanvas, fixtureBefore, '어댑터 검사는 원본 캔버스를 바꾸면 안 됩니다.')
assert.equal(inspectedFrozenCanvas, true, '어댑터에는 읽기 전용 스냅샷을 전달해야 합니다.')
assert.deepEqual(reconciliationProjection(fixtureResult), fixtureReconciliation.first)

let reconciledFixture = structuredClone(fixtureCanvas)
for (const item of fixtureResult.items.filter((candidate) => candidate.proposal)) {
  const applied = applyDigitalTwinGraphProposal(reconciledFixture, item.proposal)
  reconciledFixture = { nodes: applied.nodes, edges: applied.edges }
}
const secondFixtureResult = await registry.inspect(reconciledFixture)
assert.deepEqual(reconciliationProjection(secondFixtureResult), fixtureReconciliation.second)
const relationApplied = applyDigitalTwinGraphProposal(reconciledFixture, secondFixtureResult.items[0].proposal)
reconciledFixture = { nodes: relationApplied.nodes, edges: relationApplied.edges }
const completedFixtureResult = await registry.inspect(reconciledFixture)
assert.deepEqual(reconciliationProjection(completedFixtureResult), fixtureReconciliation.complete)
const preservedFixtureApi = reconciledFixture.nodes.find((node) => node.id === 'fixture-orders-api')
assert.deepEqual(preservedFixtureApi.position, fixtureCanvas.nodes[0].position)
assert.equal(preservedFixtureApi.width, fixtureCanvas.nodes[0].width)
assert.equal(preservedFixtureApi.height, fixtureCanvas.nodes[0].height)
assert.equal(preservedFixtureApi.data.manualAnnotation, fixtureCanvas.nodes[0].data.manualAnnotation)
assert.equal(preservedFixtureApi.data.digitalTwinBinding.entityKey, 'fixture-orders-api')
assert.equal(preservedFixtureApi.data.systemParts.some((part) => part.id === 'user-manual-note'), true)
const fixtureGatewayEdge = reconciledFixture.edges.find((edge) => edge.id === 'fixture-edge-orders-api-db')
assert.equal(fixtureGatewayEdge.sourceHandle, 'p-fixture-orders-route-r')
assert.equal(fixtureGatewayEdge.targetHandle, 'p-fixture-orders-records-l')
assert.equal(fixtureGatewayEdge.data.trustGateway.id, 'gateway:order-database')

const workflowCanvas = createWorkflowCanvasSystemMap()
const workflowRoot = workflowCanvas.nodes.find((node) => node.id === 'map-group-experience')
const manuallyPlacedNode = workflowCanvas.nodes.find((node) => node.id === 'map-local-repo')
manuallyPlacedNode.position = { x: 777, y: 333 }
manuallyPlacedNode.width = 319
manuallyPlacedNode.data.manualAnnotation = '사용자 배치와 메모는 엔진 대조가 소유하지 않습니다.'
const firstReview = await registry.inspect(workflowCanvas)
assert.equal(firstReview.source.adapterId, WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR.id)
assert.equal(firstReview.source.adapterContractVersion, TWIN_ADAPTER_CONTRACT_VERSION)
assert.equal(firstReview.source.engineSchemaVersion, TWIN_ENGINE_SCHEMA_VERSION)

const decidedItem = firstReview.items[0]
workflowRoot.data.digitalTwinReview = setDigitalTwinReviewDecision(
  workflowRoot.data.digitalTwinReview,
  decidedItem,
  'reviewed',
  '2026-07-15T00:00:00.000Z',
)
const preservedBeforeRescan = {
  position: structuredClone(manuallyPlacedNode.position),
  width: manuallyPlacedNode.width,
  annotation: manuallyPlacedNode.data.manualAnnotation,
  reviewState: structuredClone(workflowRoot.data.digitalTwinReview),
}
const secondReview = await registry.inspect(workflowCanvas)
const rescannedItem = secondReview.items.find((item) => item.id === decidedItem.id)
assert.deepEqual(manuallyPlacedNode.position, preservedBeforeRescan.position)
assert.equal(manuallyPlacedNode.width, preservedBeforeRescan.width)
assert.equal(manuallyPlacedNode.data.manualAnnotation, preservedBeforeRescan.annotation)
assert.deepEqual(workflowRoot.data.digitalTwinReview, preservedBeforeRescan.reviewState)
assert.equal(digitalTwinReviewDecision(workflowRoot.data.digitalTwinReview, rescannedItem)?.disposition, 'reviewed')

assert.equal(await registry.inspect({ nodes: [], edges: [] }), null)

assert.throws(() => createTwinAdapterRegistry([
  { descriptor: fixtureDescriptor, canInspect: fixtureAdapter.canInspect, load: async () => fixtureAdapter },
  { descriptor: fixtureDescriptor, canInspect: fixtureAdapter.canInspect, load: async () => fixtureAdapter },
]), (error) => error instanceof TwinAdapterContractError && error.code === 'DUPLICATE_ADAPTER')

const mismatchedDescriptor = createTwinAdapterDescriptor({
  ...fixtureDescriptor,
  adapterVersion: '2.0.0',
})
const mismatchedRegistry = createTwinAdapterRegistry([{
  descriptor: mismatchedDescriptor,
  canInspect: fixtureAdapter.canInspect,
  load: async () => fixtureAdapter,
}])
await assert.rejects(
  () => mismatchedRegistry.inspect(fixtureCanvas),
  (error) => error instanceof TwinAdapterContractError && error.code === 'ADAPTER_DESCRIPTOR_CHANGED',
)

assert.throws(() => createTwinAdapterDescriptor({
  ...fixtureDescriptor,
  minimumEngineSchemaVersion: TWIN_ENGINE_SCHEMA_VERSION + 1,
  maximumEngineSchemaVersion: TWIN_ENGINE_SCHEMA_VERSION + 1,
}), (error) => error instanceof TwinAdapterContractError && error.code === 'ENGINE_SCHEMA_INCOMPATIBLE')

const missingMethodDescriptor = createTwinAdapterDescriptor({
  ...fixtureDescriptor,
  id: 'fixture-missing-method',
  interfaces: [...fixtureDescriptor.interfaces, 'migrate'],
})
const missingMethodRegistry = createTwinAdapterRegistry([{
  descriptor: missingMethodDescriptor,
  canInspect: fixtureAdapter.canInspect,
  load: async () => ({ ...fixtureAdapter, describe: () => missingMethodDescriptor }),
}])
await assert.rejects(
  () => missingMethodRegistry.inspect(fixtureCanvas),
  (error) => error instanceof TwinAdapterContractError && error.code === 'MISSING_ADAPTER_METHOD',
)

const invalidReviewAdapter = {
  ...fixtureAdapter,
  inspect: (canvas) => {
    const review = reconcileTwinBuild({ build: fixtureBuild, canvas })
    return { ...review, source: { ...review.source, adapterId: 'wrong-adapter' } }
  },
}
const invalidReviewRegistry = createTwinAdapterRegistry([{
  descriptor: fixtureDescriptor,
  canInspect: fixtureAdapter.canInspect,
  load: async () => invalidReviewAdapter,
}])
await assert.rejects(
  () => invalidReviewRegistry.inspect(fixtureCanvas),
  (error) => error instanceof TwinAdapterContractError && error.code === 'REVIEW_ADAPTER_MISMATCH',
)

console.log('Twin adapter contract checks passed')
