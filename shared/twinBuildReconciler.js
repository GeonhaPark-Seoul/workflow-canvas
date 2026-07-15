import {
  createDigitalTwinGraphProposal,
  digitalTwinProposalEdgeFingerprint,
} from './digitalTwinProposal.js'
import {
  DIGITAL_TWIN_REVIEW_SCHEMA_VERSION,
  createDigitalTwinReviewItem,
  digitalTwinReviewFingerprint,
} from './digitalTwinReview.js'
import { normalizeSystemPart, normalizeSystemParts } from './systemPartOntology.js'
import { createTwinBuild } from './twinBuild.js'
import {
  findTwinBuildEntityNode,
  materializeTwinBuildEntity,
  materializeTwinBuildPart,
  materializeTwinBuildRelation,
  twinBuildEntityCanvasProjection,
} from './twinBuildCanvas.js'

export const TWIN_BUILD_RECONCILIATION_SCHEMA_VERSION = 1

function compactKey(kind, id) {
  const value = `${kind}:${id}`
  return value.length <= 220
    ? value
    : `${kind}:${digitalTwinReviewFingerprint(value)}`
}

function evidenceRefs(build, ids) {
  const evidenceById = new Map(build.evidence.map((item) => [item.id, item]))
  return ids.map((id) => evidenceById.get(id)?.ref).filter(Boolean)
}

function severityRank(severity) {
  return { critical: 0, attention: 1, info: 2 }[severity] ?? 3
}

function reviewSource(build) {
  const root = build.entities.find((entity) => entity.id === build.source.rootEntityId)
  return {
    adapterId: build.source.adapterId,
    adapterContractVersion: build.source.adapterContractVersion,
    adapterVersion: build.source.adapterVersion,
    engineSchemaVersion: build.source.engineSchemaVersion,
    id: build.source.id,
    label: build.source.label,
    snapshotId: build.source.snapshotId,
    observationLevel: build.source.observationLevel,
    observationLabel: 'TwinBuild에서 정규화됨',
    runtimeVerified: build.source.observationLevel === 'verified',
    runtimeLabel: build.source.observationLevel === 'verified' ? '실행 근거 확인' : '실행 확인 아님',
    rootNodeId: root?.placement.nodeId ?? null,
    buildSchemaVersion: build.schemaVersion,
    buildId: build.id,
    buildFingerprint: build.fingerprint,
  }
}

function createItem(build, value) {
  return createDigitalTwinReviewItem({
    sourceId: build.source.id,
    evidence: evidenceRefs(build, value.evidenceIds ?? []),
    ...value,
  })
}

function entityReview(build, entity, canvas, nodeByEntityId) {
  const actual = nodeByEntityId.get(entity.id)
  if (!actual) {
    const parentPresent = !entity.parentId || nodeByEntityId.has(entity.parentId)
    const item = createItem(build, {
      itemKey: compactKey('build-entity', entity.id),
      category: 'entity',
      changeType: 'added',
      severity: entity.placement.nodeType === 'group' ? 'attention' : 'info',
      title: `${entity.label} 지도 추가`,
      summary: parentPresent
        ? '정규화된 시스템 실체가 현재 캔버스에 없습니다.'
        : '부모 실체를 먼저 지도에 추가해야 이 실체를 안전하게 배치할 수 있습니다.',
      evidenceIds: entity.evidenceIds,
      focus: null,
      status: parentPresent ? 'missing_on_canvas' : 'blocked_dependency',
      observation: {
        buildFingerprint: build.fingerprint,
        entityFingerprint: entity.fingerprint,
        parentPresent,
      },
    })
    if (!parentPresent) return item
    const node = materializeTwinBuildEntity(build, entity, item)
    const proposal = createDigitalTwinGraphProposal({
      sourceId: build.source.id,
      proposalKey: compactKey('add-build-entity', entity.id),
      itemId: item.id,
      itemFingerprint: item.fingerprint,
      snapshotId: build.source.snapshotId,
      title: `${entity.label} 지도 추가`,
      summary: '초기 배치 힌트로 새 실체를 추가합니다. 기존 노드의 위치·크기·메모는 바꾸지 않습니다.',
      operations: [{ action: 'add_node', label: `${entity.label} 노드 추가`, node }],
    })
    return { ...item, proposal }
  }

  const projection = twinBuildEntityCanvasProjection(build, entity, actual)
  const { expected, ...current } = projection
  if (digitalTwinReviewFingerprint(current) === digitalTwinReviewFingerprint(expected)) return null
  return createItem(build, {
    itemKey: compactKey('build-entity-contract', entity.id),
    category: 'entity',
    changeType: 'changed',
    severity: 'attention',
    title: `${entity.label} 정의 재검토`,
    summary: '정규화된 실체 정의와 현재 지도 설명이 다릅니다. 사용자의 설명을 자동으로 덮어쓰지 않고 차이만 알립니다.',
    evidenceIds: entity.evidenceIds,
    focus: { nodeId: actual.id },
    status: 'map_modified',
    observation: { current, expected, entityFingerprint: entity.fingerprint },
  })
}

function partReview(build, part, nodeByEntityId) {
  const target = nodeByEntityId.get(part.entityId)
  if (!target || target.type !== 'system') return null
  const desired = materializeTwinBuildPart(build, part)
  const actual = normalizeSystemParts(target.data?.systemParts).find((candidate) => candidate.id === desired.id)
  const targetEntity = build.entities.find((entity) => entity.id === part.entityId)
  if (!actual) {
    const item = createItem(build, {
      itemKey: compactKey('build-part', part.id),
      category: 'runtime',
      changeType: 'added',
      severity: 'info',
      title: `${part.label} 파츠 추가`,
      summary: `${targetEntity?.label ?? target.id}에 정규화된 기능·보기·연결 파츠가 없습니다.`,
      evidenceIds: part.evidenceIds,
      focus: { nodeId: target.id },
      status: 'system_part_missing',
      observation: { partFingerprint: part.fingerprint, targetEntityId: part.entityId },
    })
    const proposal = createDigitalTwinGraphProposal({
      sourceId: build.source.id,
      proposalKey: compactKey('add-build-part', part.id),
      itemId: item.id,
      itemFingerprint: item.fingerprint,
      snapshotId: build.source.snapshotId,
      title: `${part.label} 파츠 추가`,
      summary: '대상 시스템 노드에 파츠 하나만 추가하며 기존 파츠와 노드 설명은 유지합니다.',
      operations: [{ action: 'add_part', targetNodeId: target.id, label: `${part.label} 추가`, part: desired }],
    })
    return { ...item, proposal }
  }
  const currentFingerprint = digitalTwinReviewFingerprint(normalizeSystemPart(actual))
  const desiredFingerprint = digitalTwinReviewFingerprint(desired)
  if (currentFingerprint === desiredFingerprint) return null
  const item = createItem(build, {
    itemKey: compactKey('build-part-contract', part.id),
    category: 'runtime',
    changeType: 'changed',
    severity: 'attention',
    title: `${part.label} 파츠 계약 변경`,
    summary: '현재 파츠가 정규화된 종류·참조·노출 범위·근거와 다릅니다.',
    evidenceIds: part.evidenceIds,
    focus: { nodeId: target.id },
    status: 'system_part_modified',
    observation: { currentFingerprint, desiredFingerprint, partFingerprint: part.fingerprint },
  })
  const proposal = createDigitalTwinGraphProposal({
    sourceId: build.source.id,
    proposalKey: compactKey('replace-build-part', part.id),
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    snapshotId: build.source.snapshotId,
    title: `${part.label} 파츠 계약 교체`,
    summary: '미리 본 기존 파츠 지문이 그대로일 때만 정규화된 계약으로 교체합니다.',
    operations: [{
      action: 'replace_part',
      targetNodeId: target.id,
      partId: actual.id,
      expectedPartFingerprint: currentFingerprint,
      label: `${part.label} 교체`,
      part: desired,
    }],
  })
  return { ...item, proposal }
}

function relationReview(build, relation, canvas, nodeByEntityId) {
  const sourceNode = nodeByEntityId.get(relation.source.entityId)
  const targetNode = nodeByEntityId.get(relation.target.entityId)
  if (!sourceNode || !targetNode) {
    return createItem(build, {
      itemKey: compactKey('build-relation-blocked', relation.id),
      category: 'relation',
      changeType: 'warning',
      severity: 'attention',
      title: `${relation.id} 연결 대기`,
      summary: '연결선 양쪽 실체를 먼저 지도에 추가해야 관계를 안전하게 만들 수 있습니다.',
      evidenceIds: relation.evidenceIds,
      focus: null,
      status: 'blocked_dependency',
      observation: {
        relationFingerprint: relation.fingerprint,
        sourcePresent: !!sourceNode,
        targetPresent: !!targetNode,
      },
    })
  }
  const desired = materializeTwinBuildRelation(build, relation)
  const actual = (canvas.edges ?? []).find((edge) => edge.id === desired.id)
  if (!actual) {
    const item = createItem(build, {
      itemKey: compactKey('build-relation', relation.id),
      category: 'relation',
      changeType: 'added',
      severity: 'info',
      title: `${relation.id} 관계 추가`,
      summary: '정규화된 두 실체 사이의 관계가 현재 캔버스에 없습니다.',
      evidenceIds: relation.evidenceIds,
      focus: { nodeIds: [sourceNode.id, targetNode.id] },
      status: 'missing_on_canvas',
      observation: { relationFingerprint: relation.fingerprint },
    })
    const proposal = createDigitalTwinGraphProposal({
      sourceId: build.source.id,
      proposalKey: compactKey('add-build-relation', relation.id),
      itemId: item.id,
      itemFingerprint: item.fingerprint,
      snapshotId: build.source.snapshotId,
      title: `${relation.id} 관계 추가`,
      summary: '이미 존재하는 두 실체 사이에 근거와 신뢰경계 정보를 포함한 연결선 하나를 추가합니다.',
      operations: [{ action: 'add_edge', label: `${relation.id} 연결선 추가`, edge: desired }],
    })
    return { ...item, proposal }
  }
  const currentFingerprint = digitalTwinProposalEdgeFingerprint(actual)
  const desiredFingerprint = digitalTwinProposalEdgeFingerprint(desired)
  if (currentFingerprint === desiredFingerprint) return null
  const endpointsMatch = actual.source === desired.source && actual.target === desired.target
  const item = createItem(build, {
    itemKey: compactKey('build-relation-contract', relation.id),
    category: 'relation',
    changeType: 'changed',
    severity: 'attention',
    title: `${relation.id} 관계 계약 변경`,
    summary: endpointsMatch
      ? '관계의 종류·근거·파츠 연결점 또는 신뢰 게이트웨이가 정규형과 다릅니다.'
      : '연결선 양 끝 실체가 정규형과 달라 자동으로 다시 연결하지 않고 사람의 판단을 기다립니다.',
    evidenceIds: relation.evidenceIds,
    focus: { edgeId: actual.id, nodeIds: [actual.source, actual.target] },
    status: 'map_modified',
    observation: { currentFingerprint, desiredFingerprint, endpointsMatch },
  })
  if (!endpointsMatch) return item
  const proposal = createDigitalTwinGraphProposal({
    sourceId: build.source.id,
    proposalKey: compactKey('replace-build-relation', relation.id),
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    snapshotId: build.source.snapshotId,
    title: `${relation.id} 관계 계약 교체`,
    summary: '양 끝 실체는 유지하고 미리 본 연결선 지문이 그대로일 때만 정규화된 계약으로 교체합니다.',
    operations: [{
      action: 'replace_edge',
      edgeId: actual.id,
      expectedEdgeFingerprint: currentFingerprint,
      label: `${relation.id} 연결선 계약 교체`,
      edge: desired,
    }],
  })
  return { ...item, proposal }
}

export function reconcileTwinBuild({ build: inputBuild, canvas }) {
  const build = createTwinBuild(inputBuild)
  const nodeByEntityId = new Map(build.entities.map((entity) => [
    entity.id,
    findTwinBuildEntityNode(build, entity, canvas),
  ]).filter(([, node]) => !!node))
  const entityItems = build.entities.map((entity) => entityReview(build, entity, canvas, nodeByEntityId)).filter(Boolean)
  const partItems = build.parts.map((part) => partReview(build, part, nodeByEntityId)).filter(Boolean)
  const relationItems = build.relations.map((relation) => relationReview(build, relation, canvas, nodeByEntityId)).filter(Boolean)
  const items = [...entityItems, ...partItems, ...relationItems].sort((left, right) => (
    severityRank(left.severity) - severityRank(right.severity)
    || left.category.localeCompare(right.category)
    || left.title.localeCompare(right.title)
  ))
  const managedNodeIds = new Set(build.entities.map((entity) => entity.placement.nodeId))
  const managedEdgeIds = new Set(build.relations.map((relation) => relation.placement.edgeId))
  const summary = {
    pending: items.length,
    actionable: items.filter((item) => !!item.proposal).length,
    blocked: items.filter((item) => item.status === 'blocked_dependency').length,
    entityFindings: entityItems.length,
    partFindings: partItems.length,
    relationFindings: relationItems.length,
    unmanagedCanvasNodes: (canvas?.nodes ?? []).filter((node) => !managedNodeIds.has(node.id)).length,
    unmanagedCanvasRelations: (canvas?.edges ?? []).filter((edge) => !managedEdgeIds.has(edge.id)).length,
  }
  return {
    schemaVersion: DIGITAL_TWIN_REVIEW_SCHEMA_VERSION,
    reconciliationSchemaVersion: TWIN_BUILD_RECONCILIATION_SCHEMA_VERSION,
    source: reviewSource(build),
    summary,
    items,
    report: {
      mode: 'twin-build-reconciliation',
      writes_performed: false,
      build: {
        id: build.id,
        schemaVersion: build.schemaVersion,
        fingerprint: build.fingerprint,
        summary: build.summary,
      },
      summary,
      ownership: {
        engineManaged: ['실체 의미 필드', '정규화된 파츠 계약', '관계 계약', '신뢰영역과 게이트웨이 참조'],
        userPreserved: ['노드 위치', '노드 크기', '사용자 메모', '추가 파츠와 연결선', '검토 결정'],
      },
    },
  }
}
