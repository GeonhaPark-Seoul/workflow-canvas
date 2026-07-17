import { digitalTwinReviewFingerprint } from './digitalTwinReview.js'
import { SOURCE_FEATURE_MANIFEST } from './sourceFeatureManifest.js'
import { createTwinBuild } from './twinBuild.js'

export const WORKFLOW_SOURCE_FEATURE_ENTITY_PREFIX = 'source-feature:workflow-canvas:'
export const WORKFLOW_SOURCE_FEATURE_NODE_PREFIX = 'map-source-feature-'
export const WORKFLOW_SOURCE_FEATURE_RELATION_PREFIX = 'map-source-feature-edge-'

function stableSuffix(value, length = 16) {
  return digitalTwinReviewFingerprint(value).slice(0, length)
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort()
}

function featureEntityId(candidate) {
  return `${WORKFLOW_SOURCE_FEATURE_ENTITY_PREFIX}${candidate.scope}:${candidate.id}`
}

function featureNodeId(candidate) {
  return `${WORKFLOW_SOURCE_FEATURE_NODE_PREFIX}${candidate.scope}-${candidate.id}`
}

function featureEvidenceRegistry(featureModel) {
  const entityById = new Map(featureModel.candidates
    .flatMap((candidate) => candidate.evidence ?? [])
    .map((entity) => [entity.entityId, entity]))
  const evidence = []
  const evidenceIdByEntityId = new Map()
  const usedEntityIds = unique(featureModel.candidates
    .filter((candidate) => candidate.eligible)
    .flatMap((candidate) => candidate.evidenceEntityIds))
  for (const entityId of usedEntityIds) {
    const entity = entityById.get(entityId)
    if (!entity?.path) continue
    const evidenceId = `evidence:source-feature:${stableSuffix(entityId)}`
    evidenceIdByEntityId.set(entityId, evidenceId)
    evidence.push({
      id: evidenceId,
      kind: 'code',
      ref: `source:${entity.path}`,
      summary: entity.summary || `${entity.path} 코드 근거`,
      confidence: 'high',
      sourceFingerprint: entity.fingerprint,
    })
  }
  const profileEvidenceId = `evidence:source-feature-profile:${stableSuffix(featureModel.profile)}`
  evidence.push({
    id: profileEvidenceId,
    kind: 'config',
    ref: `profile:${featureModel.profile.id}@${featureModel.profile.version}#feature-model`,
    summary: '기능 Asset, Capability와 속성의 결정적 판정 선언',
    confidence: 'high',
    sourceFingerprint: featureModel.fingerprint,
  })
  return {
    evidence,
    profileEvidenceId,
    idsFor: (entityIds) => unique([
      profileEvidenceId,
      ...entityIds.map((id) => evidenceIdByEntityId.get(id)),
    ]).slice(0, 120),
  }
}

function featurePlacement(candidate, index) {
  const columns = 5
  return {
    nodeId: featureNodeId(candidate),
    nodeType: 'system',
    initialPosition: {
      x: (index % columns) * 300,
      y: -1_800 + Math.floor(index / columns) * 205,
    },
    initialSize: { width: 260, height: 150 },
  }
}

function relationRecord({ id, sourceId, targetId, type, summary, evidenceIds, sourceHandle = 'right', targetHandle = 'left' }) {
  return {
    id,
    source: { entityId: sourceId },
    target: { entityId: targetId },
    relationType: type,
    sourceKind: 'code',
    confidence: 'high',
    summary,
    evidenceIds,
    placement: { edgeId: id, sourceHandle, targetHandle },
  }
}

export function createWorkflowSourceFeatureExtension({
  featureModel = SOURCE_FEATURE_MANIFEST,
  existingEntityIds = [],
} = {}) {
  const assetCandidates = featureModel.candidates.filter((candidate) => (
    candidate.classification === 'feature-asset' && candidate.eligible
  ))
  const assetByKey = new Map(assetCandidates.map((candidate) => [candidate.key, candidate]))
  const evidenceRegistry = featureEvidenceRegistry(featureModel)
  const targetEntityIds = new Set(existingEntityIds)
  const entities = assetCandidates.map((candidate, index) => ({
    id: featureEntityId(candidate),
    kind: 'feature',
    label: candidate.label,
    description: candidate.description,
    purpose: candidate.description || `${candidate.label} 기능을 사용자에게 제공합니다.`,
    responsibility: `${candidate.evidencePaths.length}개 코드 파일에서 발견된 ${candidate.scope === 'area' ? '제품 영역' : '하위 기능'} 근거를 대표합니다.`,
    constraints: '코드와 Source Profile에서 발견된 declared 기능이며 실제 실행 상태나 LIVE를 뜻하지 않습니다.',
    evidenceSummary: candidate.evidencePaths.slice(0, 6).join(', '),
    environment: 'unknown',
    sourceKind: 'code',
    provider: 'Workflow Canvas',
    externalRef: candidate.key,
    evidenceIds: evidenceRegistry.idsFor(candidate.evidenceEntityIds),
    placement: featurePlacement(candidate, index),
  }))
  for (const entity of entities) targetEntityIds.add(entity.id)

  const parts = featureModel.candidates
    .filter((candidate) => candidate.classification === 'capability' && candidate.eligible)
    .filter((candidate) => assetByKey.has(candidate.ownerKey))
    .map((candidate) => {
      const owner = assetByKey.get(candidate.ownerKey)
      return {
        id: `source-capability:${featureModel.profile.id}:${candidate.id}`,
        entityId: featureEntityId(owner),
        kind: 'capability',
        label: candidate.label,
        ref: `source-subsystem:${candidate.id}`,
        exposure: 'internal',
        sourceKind: 'code',
        evidenceIds: evidenceRegistry.idsFor(candidate.evidenceEntityIds),
        operationIds: [],
        placement: { partId: `source-capability-${candidate.id}` },
      }
    })

  const relations = []
  for (const candidate of assetCandidates) {
    const sourceId = featureEntityId(candidate)
    if (candidate.scope === 'subsystem' && assetByKey.has(candidate.ownerKey)) {
      const owner = assetByKey.get(candidate.ownerKey)
      const id = `${WORKFLOW_SOURCE_FEATURE_RELATION_PREFIX}contains-${stableSuffix([owner.key, candidate.key])}`
      relations.push(relationRecord({
        id,
        sourceId: featureEntityId(owner),
        targetId: sourceId,
        type: 'contains',
        summary: `${owner.label} 제품 기능이 ${candidate.label} 하위 기능을 포함한다는 Source Profile 분류입니다.`,
        evidenceIds: evidenceRegistry.idsFor(candidate.evidenceEntityIds),
        sourceHandle: 'bottom',
        targetHandle: 'top',
      }))
    }
    for (const implementation of candidate.implementations) {
      if (!targetEntityIds.has(implementation.targetEntityId)) continue
      const id = `${WORKFLOW_SOURCE_FEATURE_RELATION_PREFIX}implementation-${stableSuffix([candidate.key, implementation.targetEntityId])}`
      relations.push(relationRecord({
        id,
        sourceId,
        targetId: implementation.targetEntityId,
        type: 'implemented_by',
        summary: `${candidate.label} 기능을 구현하는 코드가 ${implementation.targetEntityId} 구성요소에 연결됩니다.`,
        evidenceIds: evidenceRegistry.idsFor(implementation.evidenceEntityIds),
      }))
    }
    for (const access of candidate.dataAccess) {
      if (!targetEntityIds.has(access.targetEntityId)) continue
      const relationType = access.operation === 'write' ? 'writes' : 'reads'
      const id = `${WORKFLOW_SOURCE_FEATURE_RELATION_PREFIX}${relationType}-${stableSuffix([candidate.key, access.targetEntityId])}`
      relations.push(relationRecord({
        id,
        sourceId,
        targetId: access.targetEntityId,
        type: relationType,
        summary: `${candidate.label} 구현 코드가 ${access.sourceEntityIds.join(', ')} 자료를 ${relationType === 'reads' ? '읽습니다' : '씁니다'}.`,
        evidenceIds: evidenceRegistry.idsFor(access.evidenceEntityIds),
      }))
    }
  }

  return Object.freeze({
    featureModel,
    entities: Object.freeze(entities),
    parts: Object.freeze(parts),
    relations: Object.freeze(relations),
    evidence: Object.freeze(evidenceRegistry.evidence),
    entityIds: Object.freeze(entities.map((entity) => entity.id)),
    nodeIds: Object.freeze(entities.map((entity) => entity.placement.nodeId)),
    partIds: Object.freeze(parts.map((part) => part.id)),
    relationIds: Object.freeze(relations.map((relation) => relation.id)),
  })
}

export function extendWorkflowTwinBuildWithSourceFeatures(baseBuild, options = {}) {
  const extension = createWorkflowSourceFeatureExtension({
    ...options,
    existingEntityIds: baseBuild.entities.map((entity) => entity.id),
  })
  const build = createTwinBuild({
    ...baseBuild,
    id: `${baseBuild.id}:features:${extension.featureModel.fingerprint.slice(0, 12)}`,
    entities: [...baseBuild.entities, ...extension.entities],
    parts: [...baseBuild.parts, ...extension.parts],
    relations: [...baseBuild.relations, ...extension.relations],
    evidence: [...baseBuild.evidence, ...extension.evidence],
  })
  return { build, extension }
}
