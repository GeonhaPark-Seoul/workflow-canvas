import assert from 'node:assert/strict'
import { access } from 'node:fs/promises'

import { createEngineCapabilityMap, ENGINE_CAPABILITY_MAP_GROUP_ID } from '../shared/capabilityMapper.js'
import {
  MAINTAINER_AGENT_MANIFEST,
  WORKFLOW_CANVAS_PRODUCT_VERSION,
  WORKFLOW_ENGINE_REGISTRY,
} from '../shared/engineRegistry.js'
import { normalizeLogicalComponent, systemNodeReality } from '../shared/systemOntology.js'
import { WORKFLOW_SYSTEM_TWIN_BUILD } from '../shared/workflowSystemTwinBuild.js'

const map = createEngineCapabilityMap(WORKFLOW_ENGINE_REGISTRY, MAINTAINER_AGENT_MANIFEST)
const repeated = createEngineCapabilityMap(WORKFLOW_ENGINE_REGISTRY, MAINTAINER_AGENT_MANIFEST)
assert.deepEqual(map, repeated)
assert.equal(map.group.id, ENGINE_CAPABILITY_MAP_GROUP_ID)
assert.equal(map.nodes.length, WORKFLOW_ENGINE_REGISTRY.components.length)
assert.equal(map.edges.length, WORKFLOW_ENGINE_REGISTRY.components.filter((item) => item.parentId).length)
assert.equal(new Set(map.nodes.map((node) => node.id)).size, map.nodes.length)
assert.equal(new Set(map.edges.map((edge) => edge.id)).size, map.edges.length)

const twinCore = map.nodes.find((node) => node.data.logicalComponent?.id === 'engine-twin-core')
assert.equal(twinCore.data.label, 'Asset Core')
assert.equal(twinCore.data.logicalComponent.productVersion, WORKFLOW_CANVAS_PRODUCT_VERSION)
assert.equal(twinCore.data.logicalComponent.maintainerAgentId, '')
assert.equal(systemNodeReality({
  ...twinCore.data,
  twinRuntime: {
    resourceId: 'forged-runtime',
    verifiedAt: new Date().toISOString(),
    status: 'healthy',
    verification: 'verified',
  },
}).id, 'logical')

const drawMap = map.nodes.find((node) => node.data.logicalComponent?.id === 'engine-create-graph')
assert.equal(drawMap.data.label, 'Draw Map')
assert.match(drawMap.data.description, /온톨로지·사실 판정과 무관한 순수 가시화/)

const workCore = map.nodes.find((node) => node.data.logicalComponent?.id === 'engine-work-core')
const intentEngine = map.nodes.find((node) => node.data.logicalComponent?.id === 'engine-intent-core')
const aiContextGate = map.nodes.find((node) => node.data.logicalComponent?.id === 'engine-ai-context-gate')
assert.equal(workCore.data.label, 'Work Core')
assert.equal(workCore.data.logicalComponent.technicalVersion, '0.1.0-alpha.0')
assert.match(workCore.data.description, /실행기가 아니라/)
assert.equal(intentEngine.data.label, 'Intent Engine')
assert.equal(intentEngine.data.logicalComponent.technicalVersion, '0.2.0-alpha.0')
assert.match(intentEngine.data.description, /AI 하네스 집행은 포함하지 않습니다/)
assert.equal(aiContextGate.data.label, 'AI Context Gate')
assert.equal(aiContextGate.data.logicalComponent.technicalVersion, '0.1.0-alpha.0')
assert.match(aiContextGate.data.description, /완료 차단 수준을 구별/)
assert.ok(map.nodes.some((node) => node.data.logicalComponent?.id === 'component-intent-clause-extractor'))
assert.ok(map.nodes.some((node) => node.data.logicalComponent?.id === 'component-project-master-guardrail'))

for (const node of map.nodes) {
  assert.equal(node.type, 'system')
  assert.equal(node.parentId, ENGINE_CAPABILITY_MAP_GROUP_ID)
  assert.equal(node.data.systemKind, 'engine')
  assert.ok(node.data.logicalComponent?.productVersion)
  assert.ok(node.data.logicalComponent?.technicalVersion)
  assert.ok(node.data.logicalComponent?.maturity)
  assert.ok(node.data.logicalComponent?.inputs.length)
  assert.ok(node.data.logicalComponent?.outputs.length)
  assert.ok(node.data.logicalComponent?.codeEvidence.length)
  assert.ok(node.data.logicalComponent?.testEvidence.length)
  assert.equal(systemNodeReality(node.data).label, '논리 구성')
}

for (const component of WORKFLOW_ENGINE_REGISTRY.components) {
  for (const evidence of [...component.codeEvidence, ...component.testEvidence]) {
    const relativePath = evidence.split(':')[0]
    await access(new URL(`../${relativePath}`, import.meta.url))
  }
}

const mappedTwinEntities = WORKFLOW_SYSTEM_TWIN_BUILD.entities.filter((entity) => entity.logicalComponent)
assert.equal(mappedTwinEntities.length, WORKFLOW_ENGINE_REGISTRY.components.length)
assert.equal(
  mappedTwinEntities.find((entity) => entity.id === 'map-engine-twin-core')?.logicalComponent?.technicalVersion,
  '0.3.0-alpha.0',
)
assert.equal(
  mappedTwinEntities.find((entity) => entity.id === 'map-engine-source-lens')?.logicalComponent?.technicalVersion,
  '0.9.0-alpha.0',
)
assert.ok(map.nodes.some((node) => node.data.logicalComponent?.id === 'component-source-code-part-translator'))
assert.ok(map.nodes.some((node) => node.data.logicalComponent?.id === 'component-source-flow-discovery'))
assert.ok(map.nodes.some((node) => node.data.logicalComponent?.id === 'component-source-functional-context-contract'))
assert.ok(map.nodes.some((node) => node.data.logicalComponent?.id === 'component-source-functional-context-resolver'))
assert.ok(map.nodes.some((node) => node.data.logicalComponent?.id === 'component-source-functional-context-builder'))
assert.ok(map.nodes.some((node) => node.data.logicalComponent?.id === 'component-source-functional-context-guardrail'))
assert.ok(map.nodes.some((node) => node.data.logicalComponent?.id === 'component-source-ai-explanation'))
assert.ok(map.nodes.some((node) => node.data.logicalComponent?.id === 'component-source-roundtrip-editor'))
assert.ok(WORKFLOW_ENGINE_REGISTRY.components
  .filter((component) => !component.parentId)
  .every((component) => component.kind === 'engine'))
assert.ok(WORKFLOW_ENGINE_REGISTRY.components
  .filter((component) => component.parentId)
  .every((component) => component.kind !== 'engine'))
assert.equal(
  WORKFLOW_ENGINE_REGISTRY.components.find((component) => component.id === 'component-source-ai-explanation')?.parentId,
  'engine-connector-bridge',
)
assert.equal(
  WORKFLOW_ENGINE_REGISTRY.components.find((component) => component.id === 'component-source-roundtrip-editor')?.parentId,
  'engine-safe-operations',
)
assert.ok(WORKFLOW_ENGINE_REGISTRY.components
  .filter((component) => component.parentId === 'engine-source-lens')
  .every((component) => !['connector', 'agent-skill', 'agent-policy'].includes(component.kind)))
assert.equal(
  WORKFLOW_ENGINE_REGISTRY.components.filter((component) => !component.parentId).length,
  10,
)
assert.equal(
  WORKFLOW_ENGINE_REGISTRY.components.filter((component) => component.parentId === 'engine-ai-context-gate').length,
  8,
)
assert.ok(WORKFLOW_ENGINE_REGISTRY.components
  .filter((component) => component.parentId === 'engine-ai-context-gate')
  .every((component) => component.kind !== 'connector'))
const sourceLensRegistry = WORKFLOW_ENGINE_REGISTRY.components.find((component) => component.id === 'engine-source-lens')
assert.ok(sourceLensRegistry.codeEvidence.includes('scripts/source-lens-engine.mjs'))
assert.ok(sourceLensRegistry.codeEvidence.includes('shared/sourceFunctionalContext.js'))
assert.ok(sourceLensRegistry.testEvidence.includes('scripts/test-source-lens-engine.mjs'))
assert.ok(sourceLensRegistry.testEvidence.includes('scripts/test-source-functional-context.mjs'))
assert.doesNotMatch(sourceLensRegistry.codeEvidence.join(' '), /source-edit|local-connector|sourceAiExplanation|systemStateSnapshot/)
assert.equal(
  map.nodes.find((node) => node.data.logicalComponent?.id === 'component-local-connector')?.data.logicalComponent?.technicalVersion,
  '1.3.0',
)

assert.equal(MAINTAINER_AGENT_MANIFEST.agents.length, 1)
const maintainer = MAINTAINER_AGENT_MANIFEST.agents[0]
assert.equal(maintainer.status, 'planned-unassigned')
assert.ok(maintainer.scope.engineIds.length > 1)
assert.ok(maintainer.allowedTools.length)
assert.ok(maintainer.requiredTests.includes('npm test'))
assert.ok(maintainer.escalation.length)
assert.ok(maintainer.humanApprovalRequiredFor.length)
assert.ok(WORKFLOW_ENGINE_REGISTRY.components.every((component) => component.maintainerAgentId == null))

assert.equal(normalizeLogicalComponent({ schemaVersion: 2, id: 'future-component' }), null)
const invalidKindRegistry = structuredClone(WORKFLOW_ENGINE_REGISTRY)
invalidKindRegistry.components[0].kind = 'made-up-engine-kind'
assert.throws(
  () => createEngineCapabilityMap(invalidKindRegistry, MAINTAINER_AGENT_MANIFEST),
  /상위 구성요소만 Engine/,
)
const nestedEngineRegistry = structuredClone(WORKFLOW_ENGINE_REGISTRY)
nestedEngineRegistry.components.find((component) => component.parentId).kind = 'engine'
assert.throws(
  () => createEngineCapabilityMap(nestedEngineRegistry, MAINTAINER_AGENT_MANIFEST),
  /Engine 안에 중첩된 Engine일 수 없습니다/,
)
const incompleteAgentManifest = structuredClone(MAINTAINER_AGENT_MANIFEST)
incompleteAgentManifest.agents[0].requiredTests = []
assert.throws(
  () => createEngineCapabilityMap(WORKFLOW_ENGINE_REGISTRY, incompleteAgentManifest),
  /Maintainer Agent 계약이 불완전/,
)

console.log('Engine registry and logical capability map checks passed')
