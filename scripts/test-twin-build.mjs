import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  createTwinBuild,
  migrateTwinBuild,
  TWIN_BUILD_SCHEMA_VERSION,
  TwinBuildError,
} from '../shared/twinBuild.js'
import { reconcileTwinBuild } from '../shared/twinBuildReconciler.js'
import { applyDigitalTwinGraphProposal } from '../shared/digitalTwinProposal.js'
import { TWIN_ENGINE_SCHEMA_VERSION } from '../shared/twinAdapterContract.js'
import { createWorkflowCanvasSystemMap } from '../shared/workflowCanvasSystemMap.js'
import { ENGINE_CAPABILITY_MAP_GROUP_ID } from '../shared/capabilityMapper.js'
import { WORKFLOW_ENGINE_REGISTRY } from '../shared/engineRegistry.js'
import { inspectWorkflowSystemTwin } from '../shared/workflowSystemTwinAdapter.js'
import {
  WORKFLOW_SOURCE_FEATURE_EXTENSION,
  WORKFLOW_SYSTEM_TWIN_BUILD,
} from '../shared/workflowSystemTwinBuild.js'
import {
  WORKFLOW_GIT_SYNC_OPERATION_DEFINITION,
  WORKFLOW_SOURCE_SNAPSHOT_OPERATION_DEFINITION,
} from '../shared/workflowOperationDefinitions.js'

const fixtureUrl = new URL('./fixtures/twin-adapter-contract/', import.meta.url)
const rawBuild = JSON.parse(await readFile(new URL('order-service-build.json', fixtureUrl), 'utf8'))

const build = createTwinBuild(rawBuild)
const repeated = createTwinBuild(structuredClone(rawBuild))
assert.equal(build.schemaVersion, TWIN_BUILD_SCHEMA_VERSION)
assert.equal(build.fingerprint, repeated.fingerprint)
assert.equal(createTwinBuild(build).fingerprint, build.fingerprint)
assert.deepEqual(build.summary, {
  entities: 2,
  parts: 2,
  relations: 1,
  trustZones: 2,
  gateways: 1,
  evidence: 3,
  operations: 1,
  dataClasses: 1,
  policies: 1,
  observations: 1,
  events: 1,
  controls: 1,
  threats: 1,
})
assert.equal(Object.isFrozen(build), true)
assert.equal(Object.isFrozen(build.entities[0]), true)
assert.equal(build.relations[0].gatewayId, 'gateway:order-database')
assert.equal(build.operations[0].approval, 'explicit')
assert.equal(build.operations[0].availability, 'planned')
assert.equal(build.policies[0].target.id, 'operation:retry-order-request')
assert.equal(build.threats[0].controlIds[0], 'control:order-retry-idempotency')

const legacy = {
  ...structuredClone(rawBuild),
  schemaVersion: 0,
  nodes: structuredClone(rawBuild.entities),
  capabilities: structuredClone(rawBuild.parts),
  connections: structuredClone(rawBuild.relations),
  zones: structuredClone(rawBuild.trustZones),
  actions: structuredClone(rawBuild.operations),
}
delete legacy.entities
delete legacy.parts
delete legacy.relations
delete legacy.trustZones
delete legacy.operations
assert.equal(migrateTwinBuild(legacy).fingerprint, build.fingerprint)

const versionOne = {
  schemaVersion: 1,
  id: 'fixture-order-build:legacy-v1',
  source: { ...structuredClone(rawBuild.source), engineSchemaVersion: 1 },
  evidence: structuredClone(rawBuild.evidence),
  trustZones: structuredClone(rawBuild.trustZones),
  gateways: structuredClone(rawBuild.gateways),
  entities: structuredClone(rawBuild.entities),
  parts: structuredClone(rawBuild.parts).map((part) => ({ ...part, operationIds: [] })),
  relations: structuredClone(rawBuild.relations),
  operations: [{
    id: 'operation:retry-order-request',
    capability: 'orders.retry-request',
    label: '주문 요청 재시도',
    description: '구형 선언',
    access: 'execute',
    approval: 'explicit',
    reversible: false,
    target: { kind: 'part', id: 'part:orders-api:route' },
    evidenceIds: ['evidence:order-api-code'],
  }],
}
const migratedVersionOne = migrateTwinBuild(versionOne)
assert.equal(migratedVersionOne.schemaVersion, TWIN_BUILD_SCHEMA_VERSION)
assert.equal(migratedVersionOne.source.engineSchemaVersion, TWIN_ENGINE_SCHEMA_VERSION)
assert.equal(migratedVersionOne.operations[0].id, 'operation:retry-order-request')
assert.equal(migratedVersionOne.operations[0].availability, 'declared')
assert.equal(migratedVersionOne.policies.length, 0)
assert.equal(migratedVersionOne.events.length, 0)

const versionTwo = {
  ...structuredClone(rawBuild),
  schemaVersion: 2,
  entities: structuredClone(rawBuild.entities).map(({ logicalComponent, ...entity }) => entity),
}
const migratedVersionTwo = migrateTwinBuild(versionTwo)
assert.equal(migratedVersionTwo.schemaVersion, TWIN_BUILD_SCHEMA_VERSION)
assert.ok(migratedVersionTwo.entities.every((entity) => entity.logicalComponent === null))

assert.throws(
  () => migrateTwinBuild({ ...rawBuild, schemaVersion: 99 }),
  (error) => error instanceof TwinBuildError && error.code === 'MIGRATION_UNAVAILABLE',
)

const duplicateEntity = structuredClone(rawBuild)
duplicateEntity.entities.push(structuredClone(duplicateEntity.entities[0]))
assert.throws(
  () => createTwinBuild(duplicateEntity),
  (error) => error instanceof TwinBuildError && error.code === 'DUPLICATE_RECORD',
)

const missingEvidence = structuredClone(rawBuild)
missingEvidence.parts[0].evidenceIds = ['evidence:not-found']
assert.throws(
  () => createTwinBuild(missingEvidence),
  (error) => error instanceof TwinBuildError && error.code === 'MISSING_EVIDENCE',
)

const duplicatePlacement = structuredClone(rawBuild)
duplicatePlacement.entities[1].placement.nodeId = duplicatePlacement.entities[0].placement.nodeId
assert.throws(
  () => createTwinBuild(duplicatePlacement),
  (error) => error instanceof TwinBuildError && error.code === 'DUPLICATE_PLACEMENT',
)

const cyclicParent = structuredClone(rawBuild)
cyclicParent.entities[0].parentId = cyclicParent.entities[1].id
cyclicParent.entities[1].parentId = cyclicParent.entities[0].id
assert.throws(
  () => createTwinBuild(cyclicParent),
  (error) => error instanceof TwinBuildError && error.code === 'CYCLIC_ENTITY_PARENT',
)

const unmodeledCrossing = structuredClone(rawBuild)
unmodeledCrossing.relations[0].gatewayId = null
assert.throws(
  () => createTwinBuild(unmodeledCrossing),
  (error) => error instanceof TwinBuildError && error.code === 'UNMODELED_TRUST_CROSSING',
)

const wrongPartEndpoint = structuredClone(rawBuild)
wrongPartEndpoint.relations[0].source.partId = 'part:orders-db:records'
assert.throws(
  () => createTwinBuild(wrongPartEndpoint),
  (error) => error instanceof TwinBuildError && error.code === 'INVALID_RELATION_PART',
)

const secretEvidence = structuredClone(rawBuild)
secretEvidence.evidence[0].ref = 'sk-test_1234567890abcdefghijklmnop'
assert.throws(
  () => createTwinBuild(secretEvidence),
  (error) => error instanceof TwinBuildError && error.code === 'UNSAFE_EVIDENCE_REF',
)

const missingOperationPolicy = structuredClone(rawBuild)
missingOperationPolicy.operations[0].authorizationPolicyIds = ['policy:not-found']
assert.throws(
  () => createTwinBuild(missingOperationPolicy),
  (error) => error instanceof TwinBuildError && error.code === 'MISSING_OPERATION_POLICY',
)

const missingThreatControl = structuredClone(rawBuild)
missingThreatControl.threats[0].controlIds = ['control:not-found']
assert.throws(
  () => createTwinBuild(missingThreatControl),
  (error) => error instanceof TwinBuildError && error.code === 'MISSING_THREAT_CONTROL',
)

const missingObservationSubject = structuredClone(rawBuild)
missingObservationSubject.observations[0].subject.id = 'operation:not-found'
assert.throws(
  () => createTwinBuild(missingObservationSubject),
  (error) => error instanceof TwinBuildError && error.code === 'MISSING_RECORD_TARGET',
)

const expectedWorkflowCanvas = createWorkflowCanvasSystemMap()
const gitSyncCanvasEdge = expectedWorkflowCanvas.edges.find((edge) => edge.id === 'map-edge-repo-github')
const gitSyncBuildRelation = WORKFLOW_SYSTEM_TWIN_BUILD.relations.find((relation) => relation.id === 'map-edge-repo-github')
assert.equal(gitSyncCanvasEdge.data.partsLink, true)
assert.match(gitSyncCanvasEdge.sourceHandle, /^p-.+-r$/)
assert.match(gitSyncCanvasEdge.targetHandle, /^p-.+-l$/)
assert.equal(gitSyncBuildRelation.partsLink, true)
assert.ok(gitSyncBuildRelation.source.partId)
assert.ok(gitSyncBuildRelation.target.partId)
assert.equal(WORKFLOW_SYSTEM_TWIN_BUILD.operations.length, 2)
assert.equal(WORKFLOW_SYSTEM_TWIN_BUILD.dataClasses.length, 8)
assert.equal(WORKFLOW_SYSTEM_TWIN_BUILD.policies.length, 3)
assert.equal(WORKFLOW_SYSTEM_TWIN_BUILD.observations.length, 2)
assert.equal(WORKFLOW_SYSTEM_TWIN_BUILD.controls.length, 3)
assert.equal(WORKFLOW_SYSTEM_TWIN_BUILD.threats.length, 1)
assert.equal(WORKFLOW_SYSTEM_TWIN_BUILD.trustZones.length, 6)
assert.equal(WORKFLOW_SYSTEM_TWIN_BUILD.gateways.length, 11)
assert.equal(WORKFLOW_SYSTEM_TWIN_BUILD.entities.filter((entity) => entity.trustZoneId).length, 59)
assert.equal(WORKFLOW_SYSTEM_TWIN_BUILD.relations.filter((relation) => relation.gatewayId).length, 15)
assert.equal(WORKFLOW_SOURCE_FEATURE_EXTENSION.entities.length, 17)
assert.equal(WORKFLOW_SOURCE_FEATURE_EXTENSION.parts.length, 13)
assert.ok(WORKFLOW_SOURCE_FEATURE_EXTENSION.entities.every((entity) => entity.kind === 'feature'))
assert.ok(WORKFLOW_SOURCE_FEATURE_EXTENSION.relations.some((relation) => relation.relationType === 'implemented_by'))
assert.ok(WORKFLOW_SOURCE_FEATURE_EXTENSION.relations.some((relation) => relation.relationType === 'reads'))
assert.ok(WORKFLOW_SOURCE_FEATURE_EXTENSION.relations.some((relation) => relation.relationType === 'writes'))
assert.equal(
  WORKFLOW_SYSTEM_TWIN_BUILD.operations.find((item) => item.id === WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.id)?.fingerprint,
  WORKFLOW_GIT_SYNC_OPERATION_DEFINITION.fingerprint,
)
assert.equal(
  WORKFLOW_SYSTEM_TWIN_BUILD.operations.find((item) => item.id === WORKFLOW_SOURCE_SNAPSHOT_OPERATION_DEFINITION.id)?.fingerprint,
  WORKFLOW_SOURCE_SNAPSHOT_OPERATION_DEFINITION.fingerprint,
)
const firstBindingReview = reconcileTwinBuild({
  build: WORKFLOW_SYSTEM_TWIN_BUILD,
  canvas: expectedWorkflowCanvas,
})
const firstBindingItem = firstBindingReview.items.find((item) => item.status === 'twin_binding_missing')
assert.equal(firstBindingItem.proposal.counts.bindings, 24)
assert.ok(firstBindingItem.proposal.operations.some((operation) => operation.targetNodeId === 'map-canvas-engine'))
const canvasEngineBefore = structuredClone(expectedWorkflowCanvas.nodes.find((node) => node.id === 'map-canvas-engine'))
const firstBindingApplied = applyDigitalTwinGraphProposal(expectedWorkflowCanvas, firstBindingItem.proposal)
const canvasEngineAfter = firstBindingApplied.nodes.find((node) => node.id === 'map-canvas-engine')
assert.deepEqual(canvasEngineAfter.position, canvasEngineBefore.position)
assert.equal(canvasEngineAfter.data.purpose, canvasEngineBefore.data.purpose)
assert.equal(canvasEngineAfter.data.digitalTwinBinding.entityKey, 'map-canvas-engine')

function bindAllTwinEntities(canvas) {
  let current = structuredClone(canvas)
  for (let index = 0; index < 10; index += 1) {
    const review = reconcileTwinBuild({ build: WORKFLOW_SYSTEM_TWIN_BUILD, canvas: current })
    const item = review.items.find((candidate) => ['twin_binding_missing', 'twin_binding_stale'].includes(candidate.status))
    if (!item) return current
    const applied = applyDigitalTwinGraphProposal(current, item.proposal)
    current = { ...current, nodes: applied.nodes, edges: applied.edges }
  }
  throw new Error('코드 트윈 바인딩 배치가 종료되지 않았습니다.')
}

function applyAllTrustTopology(canvas) {
  let current = structuredClone(canvas)
  for (let index = 0; index < 10; index += 1) {
    const review = reconcileTwinBuild({ build: WORKFLOW_SYSTEM_TWIN_BUILD, canvas: current })
    const item = review.items.find((candidate) => ['trust_topology_missing', 'trust_topology_stale'].includes(candidate.status))
    if (!item) return current
    const applied = applyDigitalTwinGraphProposal(current, item.proposal)
    current = { ...current, nodes: applied.nodes, edges: applied.edges }
  }
  throw new Error('신뢰경계 동기화 배치가 종료되지 않았습니다.')
}

const boundWorkflowCanvas = bindAllTwinEntities(expectedWorkflowCanvas)
const staleEngineContracts = structuredClone(boundWorkflowCanvas)
const staleComponentIds = new Set([
  'engine-twin-core',
  'component-twin-reconciler',
  'engine-source-lens',
  'component-source-scanner',
  'component-source-profile',
])
for (const node of staleEngineContracts.nodes) {
  if (!staleComponentIds.has(node.data?.logicalComponent?.id)) continue
  node.data.logicalComponent.technicalVersion = '0.1.0-alpha.0'
}
const staleSourceLens = staleEngineContracts.nodes.find((node) => node.id === 'map-engine-source-lens')
staleSourceLens.data.logicalComponent.compatibility = ['Source Twin Schema v1']
staleSourceLens.data.manualAnnotation = '버전 동기화 뒤에도 보존할 메모'
const componentDriftReview = reconcileTwinBuild({
  build: WORKFLOW_SYSTEM_TWIN_BUILD,
  canvas: staleEngineContracts,
})
const componentDriftItem = componentDriftReview.items.find((item) => item.status === 'logical_component_stale')
assert.equal(componentDriftItem.proposal.counts.components, 5)
assert.equal(componentDriftItem.focus.nodeId, 'map-engine-source-lens')
assert.ok(componentDriftItem.proposal.operations.some((operation) => (
      operation.targetNodeId === 'map-engine-source-lens'
      && operation.logicalComponent.technicalVersion === '0.4.0-alpha.0'
)))
const componentDriftApplied = applyDigitalTwinGraphProposal(staleEngineContracts, componentDriftItem.proposal)
assert.equal(componentDriftApplied.appliedLogicalComponentIds.length, 5)
assert.equal(
  componentDriftApplied.nodes.find((node) => node.id === 'map-engine-source-lens').data.logicalComponent.technicalVersion,
  '0.4.0-alpha.0',
)
assert.equal(
  componentDriftApplied.nodes.find((node) => node.id === 'map-engine-source-lens').data.manualAnnotation,
  '버전 동기화 뒤에도 보존할 메모',
)
assert.equal(
  reconcileTwinBuild({
    build: WORKFLOW_SYSTEM_TWIN_BUILD,
    canvas: { ...staleEngineContracts, nodes: componentDriftApplied.nodes },
  }).items.some((item) => ['logical_component_missing', 'logical_component_stale'].includes(item.status)),
  false,
)
const firstFeatureStage = inspectWorkflowSystemTwin(boundWorkflowCanvas).items
  .find((item) => item.status === 'source_feature_areas_missing')
assert.deepEqual(firstFeatureStage.proposal.counts, { nodes: 8, edges: 0, parts: 0 })
const featureAreasApplied = applyDigitalTwinGraphProposal(boundWorkflowCanvas, firstFeatureStage.proposal)
let featureCanvas = { ...boundWorkflowCanvas, nodes: featureAreasApplied.nodes, edges: featureAreasApplied.edges }
const secondFeatureStage = inspectWorkflowSystemTwin(featureCanvas).items
  .find((item) => item.status === 'source_feature_subsystems_missing')
assert.deepEqual(secondFeatureStage.proposal.counts, { nodes: 9, edges: 0, parts: 0 })
const featureSubsystemsApplied = applyDigitalTwinGraphProposal(featureCanvas, secondFeatureStage.proposal)
featureCanvas = { ...featureCanvas, nodes: featureSubsystemsApplied.nodes, edges: featureSubsystemsApplied.edges }
let relationBatchCount = 0
for (let index = 0; index < 10; index += 1) {
  const relationStage = inspectWorkflowSystemTwin(featureCanvas).items
    .find((item) => item.status === 'source_feature_relations_missing')
  if (!relationStage) break
  assert.ok(relationStage.proposal.counts.edges > 0 && relationStage.proposal.counts.edges <= 20)
  const applied = applyDigitalTwinGraphProposal(featureCanvas, relationStage.proposal)
  featureCanvas = { ...featureCanvas, nodes: applied.nodes, edges: applied.edges }
  relationBatchCount += 1
}
assert.ok(relationBatchCount > 1)
assert.equal(new Set(featureCanvas.nodes.map((node) => node.id)).size, featureCanvas.nodes.length)
featureCanvas = applyAllTrustTopology(featureCanvas)
const workflowReview = reconcileTwinBuild({
  build: WORKFLOW_SYSTEM_TWIN_BUILD,
  canvas: featureCanvas,
})
assert.equal(workflowReview.summary.pending, 0)
assert.equal(workflowReview.summary.actionable, 0)

const topologyDrift = structuredClone(featureCanvas)
const topologyRepository = topologyDrift.nodes.find((node) => node.id === 'map-local-repo')
topologyRepository.position = { x: 8_888, y: -1_111 }
topologyRepository.data.manualAnnotation = '보안 경계 적용 뒤에도 보존할 사용자 메모'
delete topologyRepository.data.trustZone
const topologyEdge = topologyDrift.edges.find((edge) => edge.id === 'map-edge-app-auth')
topologyEdge.style = { ...topologyEdge.style, strokeWidth: 7 }
delete topologyEdge.data.trustGateway
const zoneRepairItem = reconcileTwinBuild({ build: WORKFLOW_SYSTEM_TWIN_BUILD, canvas: topologyDrift }).items
  .find((item) => item.status === 'trust_topology_missing')
assert.equal(zoneRepairItem.proposal.counts.trustZones, 1)
const zoneRepaired = applyDigitalTwinGraphProposal(topologyDrift, zoneRepairItem.proposal)
const repairedRepository = zoneRepaired.nodes.find((node) => node.id === 'map-local-repo')
assert.deepEqual(repairedRepository.position, { x: 8_888, y: -1_111 })
assert.equal(repairedRepository.data.manualAnnotation, '보안 경계 적용 뒤에도 보존할 사용자 메모')
const gatewayRepairCanvas = { ...topologyDrift, nodes: zoneRepaired.nodes, edges: zoneRepaired.edges }
const gatewayRepairItem = reconcileTwinBuild({ build: WORKFLOW_SYSTEM_TWIN_BUILD, canvas: gatewayRepairCanvas }).items
  .find((item) => item.status === 'trust_topology_missing')
assert.equal(gatewayRepairItem.proposal.counts.trustGateways, 1)
const gatewayRepaired = applyDigitalTwinGraphProposal(gatewayRepairCanvas, gatewayRepairItem.proposal)
assert.equal(gatewayRepaired.edges.find((edge) => edge.id === 'map-edge-app-auth').style.strokeWidth, 7)

const engineNodeIds = new Set(WORKFLOW_ENGINE_REGISTRY.components.map((item) => `map-${item.id}`))
const topEngineNodeIds = new Set(WORKFLOW_ENGINE_REGISTRY.components
  .filter((item) => !item.parentId)
  .map((item) => `map-${item.id}`))
const childEngineNodeIds = new Set([...engineNodeIds].filter((id) => !topEngineNodeIds.has(id)))
const engineEdgeIds = new Set(WORKFLOW_ENGINE_REGISTRY.components
  .filter((item) => item.parentId)
  .map((item) => `map-edge-${item.parentId}-${item.id}`))
const legacySystemMap = createWorkflowCanvasSystemMap()
legacySystemMap.nodes = legacySystemMap.nodes.filter((node) => (
  node.id !== ENGINE_CAPABILITY_MAP_GROUP_ID && !engineNodeIds.has(node.id)
))
legacySystemMap.edges = legacySystemMap.edges.filter((edge) => !engineEdgeIds.has(edge.id))
const fullSystemMap = createWorkflowCanvasSystemMap()

const firstEngineStage = inspectWorkflowSystemTwin(legacySystemMap).items
  .find((item) => item.status === 'engine_layer_missing')
assert.deepEqual(firstEngineStage.proposal.counts, { nodes: topEngineNodeIds.size + 1, edges: 0, parts: 0 })

legacySystemMap.nodes.push(...structuredClone(fullSystemMap.nodes.filter((node) => (
  node.id === ENGINE_CAPABILITY_MAP_GROUP_ID || topEngineNodeIds.has(node.id)
))))
const secondEngineStage = inspectWorkflowSystemTwin(legacySystemMap).items
  .find((item) => item.status === 'engine_components_missing')
assert.deepEqual(secondEngineStage.proposal.counts, { nodes: Math.min(childEngineNodeIds.size, 24), edges: 0, parts: 0 })

legacySystemMap.nodes.push(...structuredClone(fullSystemMap.nodes.filter((node) => childEngineNodeIds.has(node.id))))
const thirdEngineStage = inspectWorkflowSystemTwin(legacySystemMap).items
  .find((item) => item.status === 'engine_relations_missing')
assert.deepEqual(thirdEngineStage.proposal.counts, { nodes: 0, edges: Math.min(engineEdgeIds.size, 24), parts: 0 })

const manuallyChanged = structuredClone(featureCanvas)
const repository = manuallyChanged.nodes.find((node) => node.id === 'map-local-repo')
repository.position = { x: 9_999, y: -2_000 }
repository.width = 444
repository.data.manualAnnotation = '사용자 전용 메모'
repository.data.presentation = { layerOverride: 'L1' }
manuallyChanged.nodes.push({
  id: 'manual-unmanaged-node',
  type: 'system',
  position: { x: 0, y: 0 },
  data: { label: '사용자 추가 실체' },
})
const preservedReview = reconcileTwinBuild({
  build: WORKFLOW_SYSTEM_TWIN_BUILD,
  canvas: manuallyChanged,
})
assert.equal(preservedReview.summary.pending, 0)
assert.equal(preservedReview.summary.unmanagedCanvasNodes, 1)
assert.deepEqual(repository.position, { x: 9_999, y: -2_000 })
assert.equal(repository.width, 444)
assert.equal(repository.data.manualAnnotation, '사용자 전용 메모')
assert.deepEqual(repository.data.presentation, { layerOverride: 'L1' })

const sourceFeatureNode = manuallyChanged.nodes.find((node) => node.id === 'map-source-feature-area-source-code-twin')
sourceFeatureNode.position = { x: 7_777, y: -7_777 }
sourceFeatureNode.data.manualAnnotation = '사용자가 정리한 Source Lens 기능 메모'
const sourceFeaturePreserved = inspectWorkflowSystemTwin(manuallyChanged)
assert.equal(sourceFeaturePreserved.items.some((item) => item.status?.startsWith('source_feature_')), false)
assert.deepEqual(sourceFeatureNode.position, { x: 7_777, y: -7_777 })
assert.equal(sourceFeatureNode.data.manualAnnotation, '사용자가 정리한 Source Lens 기능 메모')

const changedMeaning = structuredClone(featureCanvas)
changedMeaning.nodes.find((node) => node.id === 'map-web-app').data.purpose = '사용자가 직접 바꾼 목적'
const changedReview = reconcileTwinBuild({
  build: WORKFLOW_SYSTEM_TWIN_BUILD,
  canvas: changedMeaning,
})
const changedItem = changedReview.items.find((item) => item.itemKey === 'build-entity-contract:map-web-app')
assert.equal(changedItem.status, 'map_modified')
assert.equal(changedItem.proposal, undefined)

console.log('TwinBuild schema and reconciliation checks passed')
