import { createEdgeRelationData, edgeRelationInfo } from './relationOntology.js'
import { createSystemNodeData, normalizeLogicalComponent } from './systemOntology.js'

export const ENGINE_CAPABILITY_MAP_GROUP_ID = 'map-group-product-engines'
export const ENGINE_CAPABILITY_MAP_GROUP = Object.freeze({
  id: ENGINE_CAPABILITY_MAP_GROUP_ID,
  label: '제품·엔진 구성층 (논리)',
  x: 0,
  y: 1240,
  width: 3280,
  height: 2040,
})

const CLUSTER_WIDTH = 1070
const CLUSTER_HEIGHT = 660
const TOP_WIDTH = 320
const TOP_HEIGHT = 270
const CHILD_WIDTH = 230
const CHILD_HEIGHT = 260

function componentNodeId(componentId) {
  return `map-${componentId}`
}

function componentPosition(component, parent) {
  if (!parent) {
    return {
      x: component.display.column * CLUSTER_WIDTH + 350,
      y: component.display.row * CLUSTER_HEIGHT + 45,
    }
  }
  return {
    x: parent.display.column * CLUSTER_WIDTH + 25 + (component.display.order - 1) * 250,
    y: parent.display.row * CLUSTER_HEIGHT + 355,
  }
}

function validateRegistry(registry, agentManifest) {
  if (registry?.schemaVersion !== 1 || !registry.product?.id || !registry.product?.version || !Array.isArray(registry.components)) {
    throw new Error('지원하지 않는 Engine registry입니다.')
  }
  if (agentManifest?.schemaVersion !== 1 || !Array.isArray(agentManifest.agents)) {
    throw new Error('지원하지 않는 Maintainer Agent manifest입니다.')
  }
  const byId = new Map()
  for (const component of registry.components) {
    if (!component?.id || byId.has(component.id)) throw new Error('Engine registry 구성요소 ID가 없거나 중복되었습니다.')
    byId.set(component.id, component)
  }
  const agentsById = new Map()
  for (const agent of agentManifest.agents) {
    const complete = agent?.id
      && agent?.name
      && Array.isArray(agent.scope?.engineIds)
      && Array.isArray(agent.allowedTools) && agent.allowedTools.length > 0
      && Array.isArray(agent.requiredTests) && agent.requiredTests.length > 0
      && Array.isArray(agent.escalation) && agent.escalation.length > 0
      && Array.isArray(agent.humanApprovalRequiredFor) && agent.humanApprovalRequiredFor.length > 0
    if (!complete || agentsById.has(agent.id)) {
      throw new Error('Maintainer Agent 계약이 불완전하거나 ID가 중복되었습니다.')
    }
    agentsById.set(agent.id, agent)
  }
  for (const component of registry.components) {
    if (component.parentId && !byId.has(component.parentId)) {
      throw new Error(`${component.id}의 상위 엔진을 찾을 수 없습니다.`)
    }
    if (component.parentId && byId.get(component.parentId)?.parentId) {
      throw new Error(`${component.id}은 현재 지원하는 2단계 제품 구성보다 깊습니다.`)
    }
    if (!component.parentId && (!Number.isInteger(component.display?.row) || !Number.isInteger(component.display?.column))) {
      throw new Error(`${component.id}의 제품 구성도 위치가 없습니다.`)
    }
    if (component.parentId && !Number.isInteger(component.display?.order)) {
      throw new Error(`${component.id}의 하위 구성요소 순서가 없습니다.`)
    }
    if (component.maintainerAgentId) {
      const agent = agentsById.get(component.maintainerAgentId)
      const scopeEngineId = component.parentId || component.id
      if (!agent || !agent.scope.engineIds.includes(scopeEngineId)) {
        throw new Error(`${component.id}의 담당 Maintainer Agent 계약이나 범위가 올바르지 않습니다.`)
      }
    }
  }
  return byId
}

function createCapabilityNode(component, parent, registry, agentManifest) {
  const agent = (agentManifest?.agents ?? []).find((item) => item.id === component.maintainerAgentId)
  const logicalComponent = normalizeLogicalComponent({
    schemaVersion: 1,
    id: component.id,
    kind: component.kind,
    productVersion: component.productVersion ?? registry.product.version,
    technicalVersion: component.technicalVersion,
    maturity: component.maturity,
    maintainerAgentId: component.maintainerAgentId,
    inputs: component.inputs,
    outputs: component.outputs,
    codeEvidence: component.codeEvidence,
    testEvidence: component.testEvidence,
    compatibility: component.compatibility,
  })
  const complete = logicalComponent
    && logicalComponent.kind === component.kind
    && logicalComponent.maturity === component.maturity
    && logicalComponent.productVersion
    && logicalComponent.technicalVersion
    && logicalComponent.inputs.length > 0
    && logicalComponent.outputs.length > 0
    && logicalComponent.codeEvidence.length > 0
    && logicalComponent.testEvidence.length > 0
  if (!complete) throw new Error(`${component.id}의 논리 구성요소 정보가 올바르지 않습니다.`)
  return {
    id: componentNodeId(component.id),
    type: 'system',
    parentId: ENGINE_CAPABILITY_MAP_GROUP_ID,
    position: componentPosition(component, parent),
    width: parent ? CHILD_WIDTH : TOP_WIDTH,
    height: parent ? CHILD_HEIGHT : TOP_HEIGHT,
    data: {
      ...createSystemNodeData('engine'),
      label: component.name,
      description: component.description,
      purpose: component.description,
      responsibility: parent
        ? `${parent.name}의 ${component.kind} 구성요소`
        : 'Workflow Canvas OS의 독립 버전 엔진',
      constraints: '논리 구성요소이며 독립 서버나 LIVE 실행 자원으로 해석하지 않습니다.',
      evidence: [...component.codeEvidence, ...component.testEvidence].join(', '),
      environment: 'unknown',
      sourceKind: 'code',
      provider: agent ? `담당: ${agent.name}` : '담당 에이전트: 미배정',
      externalRef: component.codeEvidence.join(', '),
      logicalComponent,
    },
  }
}

function createCapabilityRelation(parent, child) {
  const data = createEdgeRelationData('contains', '', true, {
    relationSourceKind: 'code',
    relationConfidence: 'high',
    relationEvidence: `${parent.name} registry가 ${child.name}을 내부 구성요소로 선언합니다.`,
    relationEvidenceRef: 'shared/engineRegistry.js',
  })
  const relation = edgeRelationInfo(data)
  const style = { stroke: relation.color, strokeWidth: 3 }
  return {
    id: `map-edge-${parent.id}-${child.id}`,
    source: componentNodeId(parent.id),
    target: componentNodeId(child.id),
    type: 'stub',
    sourceHandle: 'bottom',
    targetHandle: 'top',
    data,
    style,
    markerEnd: { type: 'arrowclosed', color: relation.color },
  }
}

export function createEngineCapabilityMap(registry, agentManifest) {
  const byId = validateRegistry(registry, agentManifest)
  const group = {
    id: ENGINE_CAPABILITY_MAP_GROUP.id,
    type: 'group',
    position: { x: ENGINE_CAPABILITY_MAP_GROUP.x, y: ENGINE_CAPABILITY_MAP_GROUP.y },
    width: ENGINE_CAPABILITY_MAP_GROUP.width,
    height: ENGINE_CAPABILITY_MAP_GROUP.height,
    zIndex: -1,
    data: {
      label: ENGINE_CAPABILITY_MAP_GROUP.label,
      engineRegistrySnapshot: {
        schemaVersion: registry.schemaVersion,
        productVersion: registry.product.version,
        maintainerAgentManifestVersion: agentManifest?.schemaVersion ?? null,
      },
    },
  }
  const nodes = registry.components.map((component) => (
    createCapabilityNode(component, component.parentId ? byId.get(component.parentId) : null, registry, agentManifest)
  ))
  const edges = registry.components
    .filter((component) => component.parentId)
    .map((component) => createCapabilityRelation(byId.get(component.parentId), component))
  return { group, nodes, edges }
}
