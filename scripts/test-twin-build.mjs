import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import {
  createTwinBuild,
  migrateTwinBuild,
  TWIN_BUILD_SCHEMA_VERSION,
  TwinBuildError,
} from '../shared/twinBuild.js'
import { reconcileTwinBuild } from '../shared/twinBuildReconciler.js'
import { createWorkflowCanvasSystemMap } from '../shared/workflowCanvasSystemMap.js'
import { WORKFLOW_SYSTEM_TWIN_BUILD } from '../shared/workflowSystemTwinBuild.js'

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
})
assert.equal(Object.isFrozen(build), true)
assert.equal(Object.isFrozen(build.entities[0]), true)
assert.equal(build.relations[0].gatewayId, 'gateway:order-database')
assert.equal(build.operations[0].approval, 'explicit')

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

const expectedWorkflowCanvas = createWorkflowCanvasSystemMap()
const workflowReview = reconcileTwinBuild({
  build: WORKFLOW_SYSTEM_TWIN_BUILD,
  canvas: expectedWorkflowCanvas,
})
assert.equal(workflowReview.summary.pending, 0)
assert.equal(workflowReview.summary.actionable, 0)

const manuallyChanged = createWorkflowCanvasSystemMap()
const repository = manuallyChanged.nodes.find((node) => node.id === 'map-local-repo')
repository.position = { x: 9_999, y: -2_000 }
repository.width = 444
repository.data.manualAnnotation = '사용자 전용 메모'
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

const changedMeaning = createWorkflowCanvasSystemMap()
changedMeaning.nodes.find((node) => node.id === 'map-web-app').data.purpose = '사용자가 직접 바꾼 목적'
const changedReview = reconcileTwinBuild({
  build: WORKFLOW_SYSTEM_TWIN_BUILD,
  canvas: changedMeaning,
})
const changedItem = changedReview.items.find((item) => item.itemKey === 'build-entity-contract:map-web-app')
assert.equal(changedItem.status, 'map_modified')
assert.equal(changedItem.proposal, undefined)

console.log('TwinBuild schema and reconciliation checks passed')
