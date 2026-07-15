import { digitalTwinReviewFingerprint } from './digitalTwinReview.js'
import { normalizeOperationDefinition } from './operationLifecycle.js'
import { RELATION_TYPE_IDS, relationDefinition } from './relationOntology.js'
import {
  normalizeLogicalComponent,
  SYSTEM_ENVIRONMENT_DEFS,
  SYSTEM_SOURCE_DEFS,
} from './systemOntology.js'
import {
  SYSTEM_PART_EXPOSURE_DEFS,
  SYSTEM_PART_KIND_DEFS,
  SYSTEM_PART_SOURCE_DEFS,
  systemPartContainsSecretLiteral,
} from './systemPartOntology.js'
import {
  analyzeTrustBoundary,
  normalizeTrustGateway,
  normalizeTrustZone,
} from './trustTopology.js'

export const TWIN_BUILD_SCHEMA_VERSION = 3

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,239}$/
const SAFE_FINGERPRINT = /^[a-f0-9]{8,128}$/i
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const OBSERVATION_LEVELS = new Set(['declared', 'discovered', 'observed', 'verified'])
const EVIDENCE_KINDS = new Set(['code', 'config', 'runtime', 'connector', 'document', 'manual', 'declaration'])
const CONFIDENCE_LEVELS = new Set(['unknown', 'low', 'medium', 'high'])
const RECORD_TARGET_KINDS = new Set(['entity', 'part', 'relation', 'gateway', 'trust_zone', 'data_class', 'operation', 'policy', 'control'])
const NODE_TYPES = new Set(['system', 'group'])
const ENVIRONMENT_IDS = new Set(SYSTEM_ENVIRONMENT_DEFS.map((item) => item.id))
const ENTITY_SOURCE_IDS = new Set(SYSTEM_SOURCE_DEFS.map((item) => item.id))
const PART_KIND_IDS = new Set(SYSTEM_PART_KIND_DEFS.map((item) => item.id))
const PART_EXPOSURE_IDS = new Set(SYSTEM_PART_EXPOSURE_DEFS.map((item) => item.id))
const PART_SOURCE_IDS = new Set(SYSTEM_PART_SOURCE_DEFS.map((item) => item.id))
const RELATION_IDS = new Set(RELATION_TYPE_IDS)
const DATA_SENSITIVITY_LEVELS = new Set(['public', 'internal', 'sensitive', 'restricted', 'secret_reference'])
const DATA_CONTENT_SCOPES = new Set(['metadata', 'aggregate', 'content', 'credential_reference'])
const DATA_RETENTION_LEVELS = new Set(['none', 'transient', 'persistent', 'unknown'])
const POLICY_KINDS = new Set(['authorization', 'approval', 'data_handling', 'network', 'retention', 'execution'])
const POLICY_EFFECTS = new Set(['allow', 'deny', 'require_approval', 'limit'])
const POLICY_ENFORCEMENTS = new Set(['browser', 'server', 'database', 'connector', 'worker', 'external', 'manual'])
const OBSERVATION_KINDS = new Set(['state', 'health', 'metric', 'deployment', 'security', 'execution'])
const REALITY_LEVELS = new Set(['declared', 'discovered', 'observed', 'runtime_verified', 'stale', 'contradicted', 'unknown'])
const EVENT_ACTOR_KINDS = new Set(['human', 'system', 'connector', 'worker', 'external', 'unknown'])
const THREAT_CATEGORIES = new Set(['exfiltration', 'unauthorized_access', 'tampering', 'spoofing', 'availability', 'privilege_escalation', 'supply_chain', 'unknown'])
const THREAT_STATUSES = new Set(['hypothetical', 'observed', 'mitigated', 'accepted', 'unknown'])
const LIKELIHOOD_LEVELS = new Set(['unknown', 'low', 'medium', 'high'])
const IMPACT_LEVELS = new Set(['unknown', 'low', 'medium', 'high', 'critical'])
const CONTROL_KINDS = new Set(['authentication', 'authorization', 'encryption', 'validation', 'rate_limit', 'isolation', 'audit', 'backup', 'recovery', 'approval', 'network', 'unknown'])
const CONTROL_EFFECTS = new Set(['prevent', 'detect', 'limit', 'recover'])
const CONTROL_STATUSES = new Set(['declared', 'observed', 'verified', 'unknown'])
const MAXIMUM_RECORDS = 2_000

export class TwinBuildError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'TwinBuildError'
    this.code = code
  }
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeText(value, maximum = 240) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : ''
}

function safeId(value, label = '기록') {
  const id = safeText(value, 240)
  if (!SAFE_ID.test(id) || UNSAFE_KEYS.has(id)) {
    throw new TwinBuildError('INVALID_ID', `${label} 식별자가 올바르지 않습니다.`)
  }
  return id
}

function positiveInteger(value, label) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) {
    throw new TwinBuildError('INVALID_VERSION', `${label} 버전이 올바르지 않습니다.`)
  }
  return number
}

function finiteNumber(value, fallback, minimum = -1_000_000, maximum = 1_000_000) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback
}

function uniqueIds(value, label, maximum = 120) {
  const result = []
  const seen = new Set()
  for (const item of Array.isArray(value) ? value.slice(0, maximum) : []) {
    const id = safeId(item, label)
    if (!seen.has(id)) {
      seen.add(id)
      result.push(id)
    }
  }
  return result.sort()
}

function recordList(value, label, normalize) {
  if (!Array.isArray(value)) return []
  if (value.length > MAXIMUM_RECORDS) {
    throw new TwinBuildError('TOO_MANY_RECORDS', `${label} 기록은 최대 ${MAXIMUM_RECORDS}개까지 허용됩니다.`)
  }
  const records = value.map(normalize)
  const ids = records.map((record) => record.id)
  if (new Set(ids).size !== ids.length) {
    throw new TwinBuildError('DUPLICATE_RECORD', `${label} 식별자가 중복되었습니다.`)
  }
  return records.sort((left, right) => left.id.localeCompare(right.id))
}

function withFingerprint(value) {
  return { ...value, fingerprint: digitalTwinReviewFingerprint(value) }
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return Object.freeze(value)
}

function normalizeSource(value) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_SOURCE', 'TwinBuild 출처 정보가 없습니다.')
  const source = {
    id: safeId(value.id, 'TwinBuild 출처'),
    adapterId: safeId(value.adapterId, '어댑터'),
    adapterContractVersion: positiveInteger(value.adapterContractVersion, '어댑터 계약'),
    adapterVersion: safeText(value.adapterVersion, 80),
    engineSchemaVersion: positiveInteger(value.engineSchemaVersion, '엔진 스키마'),
    snapshotId: safeId(value.snapshotId, '스냅샷'),
    label: safeText(value.label, 160),
    systemKind: safeId(value.systemKind, '시스템 종류'),
    observationLevel: OBSERVATION_LEVELS.has(value.observationLevel) ? value.observationLevel : 'discovered',
    rootEntityId: value.rootEntityId ? safeId(value.rootEntityId, '루트 엔티티') : null,
  }
  if (!source.adapterVersion || !source.label) {
    throw new TwinBuildError('INCOMPLETE_SOURCE', 'TwinBuild 출처에는 어댑터 버전과 이름이 필요합니다.')
  }
  return source
}

function normalizeEvidence(value) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_EVIDENCE', '근거 기록 형식이 올바르지 않습니다.')
  const ref = safeText(value.ref, 500)
  if (!ref || systemPartContainsSecretLiteral(ref)) {
    throw new TwinBuildError('UNSAFE_EVIDENCE_REF', '근거에는 실제 비밀값이 아닌 파일·자원·이벤트 참조만 기록해야 합니다.')
  }
  const rawFingerprint = safeText(value.sourceFingerprint ?? value.fingerprint, 128)
  if (rawFingerprint && !SAFE_FINGERPRINT.test(rawFingerprint)) {
    throw new TwinBuildError('INVALID_EVIDENCE_FINGERPRINT', '근거 지문 형식이 올바르지 않습니다.')
  }
  const parsedAt = Date.parse(value.observedAt ?? '')
  return withFingerprint({
    id: safeId(value.id, '근거'),
    kind: EVIDENCE_KINDS.has(value.kind) ? value.kind : 'declaration',
    ref,
    summary: safeText(value.summary, 500),
    confidence: CONFIDENCE_LEVELS.has(value.confidence) ? value.confidence : 'unknown',
    sourceFingerprint: rawFingerprint || null,
    observedAt: Number.isFinite(parsedAt) ? new Date(parsedAt).toISOString() : null,
  })
}

function normalizePlacement(value, fallbackId) {
  const placement = plainObject(value) ? value : {}
  return {
    nodeId: placement.nodeId ? safeId(placement.nodeId, '캔버스 노드') : fallbackId,
    nodeType: NODE_TYPES.has(placement.nodeType) ? placement.nodeType : 'system',
    initialPosition: {
      x: finiteNumber(placement.initialPosition?.x, 0),
      y: finiteNumber(placement.initialPosition?.y, 0),
    },
    initialSize: {
      width: finiteNumber(placement.initialSize?.width, 240, 1, 10_000),
      height: finiteNumber(placement.initialSize?.height, 140, 1, 10_000),
    },
    zIndex: finiteNumber(placement.zIndex, 0, -10_000, 10_000),
  }
}

function normalizeEntity(value) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_ENTITY', '엔티티 기록 형식이 올바르지 않습니다.')
  const id = safeId(value.id, '엔티티')
  return withFingerprint({
    id,
    kind: safeId(value.kind || 'service', '엔티티 종류'),
    label: safeText(value.label, 180) || id,
    description: safeText(value.description, 500),
    purpose: safeText(value.purpose, 500),
    responsibility: safeText(value.responsibility, 500),
    constraints: safeText(value.constraints, 500),
    evidenceSummary: safeText(value.evidenceSummary, 500),
    environment: ENVIRONMENT_IDS.has(value.environment) ? value.environment : 'unknown',
    sourceKind: ENTITY_SOURCE_IDS.has(value.sourceKind) ? value.sourceKind : 'manual',
    provider: safeText(value.provider, 160),
    externalRef: safeText(value.externalRef, 500),
    parentId: value.parentId ? safeId(value.parentId, '부모 엔티티') : null,
    trustZoneId: value.trustZoneId ? safeId(value.trustZoneId, '신뢰영역') : null,
    logicalComponent: normalizeLogicalComponent(value.logicalComponent),
    evidenceIds: uniqueIds(value.evidenceIds, '근거'),
    placement: normalizePlacement(value.placement, id),
  })
}

function normalizeBinding(value) {
  if (!plainObject(value)) return null
  const observedFingerprint = safeText(value.observedFingerprint, 80)
  if (!SAFE_FINGERPRINT.test(observedFingerprint)) {
    throw new TwinBuildError('INVALID_BINDING', '파츠의 관측 지문이 올바르지 않습니다.')
  }
  const binding = {
    sourceId: safeId(value.sourceId, '바인딩 출처'),
    entityKey: safeText(value.entityKey, 300),
    observedFingerprint,
    observedSnapshotId: safeText(value.observedSnapshotId, 180),
    proposalId: safeText(value.proposalId, 360),
    itemId: safeText(value.itemId, 360),
    itemFingerprint: safeText(value.itemFingerprint, 80),
  }
  if (!binding.entityKey) throw new TwinBuildError('INVALID_BINDING', '파츠의 바인딩 자원 식별자가 없습니다.')
  return binding
}

function normalizePart(value) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_PART', '파츠 기록 형식이 올바르지 않습니다.')
  const id = safeId(value.id, '파츠')
  const ref = safeText(value.ref, 240)
  if (systemPartContainsSecretLiteral(ref)) {
    throw new TwinBuildError('UNSAFE_PART_REF', '파츠에는 실제 키나 토큰이 아닌 참조 이름만 기록해야 합니다.')
  }
  return withFingerprint({
    id,
    entityId: safeId(value.entityId, '파츠 소유 엔티티'),
    kind: PART_KIND_IDS.has(value.kind) ? value.kind : 'connection',
    label: safeText(value.label, 120) || id,
    ref,
    exposure: PART_EXPOSURE_IDS.has(value.exposure) ? value.exposure : 'internal',
    sourceKind: PART_SOURCE_IDS.has(value.sourceKind) ? value.sourceKind : 'manual',
    evidenceIds: uniqueIds(value.evidenceIds, '근거'),
    operationIds: uniqueIds(value.operationIds, '조작'),
    binding: normalizeBinding(value.binding),
    placement: {
      partId: value.placement?.partId ? safeId(value.placement.partId, '캔버스 파츠') : id,
    },
  })
}

function normalizeEndpoint(value, label) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_RELATION_ENDPOINT', `${label} 정보가 없습니다.`)
  return {
    entityId: safeId(value.entityId, `${label} 엔티티`),
    partId: value.partId ? safeId(value.partId, `${label} 파츠`) : null,
  }
}

function normalizeRelation(value) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_RELATION', '관계 기록 형식이 올바르지 않습니다.')
  const id = safeId(value.id, '관계')
  const relationType = safeId(value.relationType || 'flows_to', '관계 종류')
  if (!RELATION_IDS.has(relationType)) {
    throw new TwinBuildError('UNSUPPORTED_RELATION', `관계 종류 ${relationType}는 현재 온톨로지에 없습니다.`)
  }
  const definition = relationDefinition(relationType)
  return withFingerprint({
    id,
    source: normalizeEndpoint(value.source, '시작'),
    target: normalizeEndpoint(value.target, '도착'),
    relationType,
    relationLabel: relationType === 'custom' ? safeText(value.relationLabel, 80) : '',
    directed: definition.directed,
    sourceKind: ['manual', 'document', 'code', 'connector', 'runtime'].includes(value.sourceKind)
      ? value.sourceKind
      : 'manual',
    confidence: CONFIDENCE_LEVELS.has(value.confidence) ? value.confidence : 'unknown',
    summary: safeText(value.summary, 500),
    evidenceIds: uniqueIds(value.evidenceIds, '근거'),
    gatewayId: value.gatewayId ? safeId(value.gatewayId, '게이트웨이') : null,
    partsLink: value.partsLink === true,
    placement: {
      edgeId: value.placement?.edgeId ? safeId(value.placement.edgeId, '캔버스 연결선') : id,
      sourceHandle: safeText(value.placement?.sourceHandle, 120),
      targetHandle: safeText(value.placement?.targetHandle, 120),
    },
  })
}

function normalizeZone(value) {
  const zone = normalizeTrustZone(value)
  if (!zone) throw new TwinBuildError('INVALID_TRUST_ZONE', '신뢰영역 기록 형식이 올바르지 않습니다.')
  return withFingerprint({
    ...zone,
    evidenceIds: uniqueIds(value.evidenceIds, '근거'),
  })
}

function normalizeGateway(value) {
  const gateway = normalizeTrustGateway(value)
  if (!gateway) throw new TwinBuildError('INVALID_GATEWAY', '게이트웨이 기록 형식이 올바르지 않습니다.')
  return withFingerprint({
    ...gateway,
    evidenceIds: uniqueIds(value.evidenceIds, '근거'),
  })
}

function normalizeRecordTarget(value, label) {
  if (!plainObject(value) || !RECORD_TARGET_KINDS.has(value.kind)) {
    throw new TwinBuildError('INVALID_RECORD_TARGET', `${label} 대상 종류가 올바르지 않습니다.`)
  }
  return { kind: value.kind, id: safeId(value.id, `${label} 대상`) }
}

function normalizeTimestamp(value, label, { required = false } = {}) {
  if (!value && !required) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new TwinBuildError('INVALID_TIMESTAMP', `${label} 시각이 올바르지 않습니다.`)
  return new Date(parsed).toISOString()
}

function normalizeDataClass(value) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_DATA_CLASS', '데이터 종류 기록 형식이 올바르지 않습니다.')
  const id = safeId(value.id, '데이터 종류')
  return withFingerprint({
    id,
    label: safeText(value.label, 160) || id,
    description: safeText(value.description, 500),
    sensitivity: DATA_SENSITIVITY_LEVELS.has(value.sensitivity) ? value.sensitivity : 'internal',
    contentScope: DATA_CONTENT_SCOPES.has(value.contentScope) ? value.contentScope : 'metadata',
    retention: DATA_RETENTION_LEVELS.has(value.retention) ? value.retention : 'unknown',
    evidenceIds: uniqueIds(value.evidenceIds, '근거'),
  })
}

function normalizePolicy(value) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_POLICY', '정책 기록 형식이 올바르지 않습니다.')
  const id = safeId(value.id, '정책')
  return withFingerprint({
    id,
    kind: POLICY_KINDS.has(value.kind) ? value.kind : 'authorization',
    label: safeText(value.label, 160) || id,
    description: safeText(value.description, 500),
    effect: POLICY_EFFECTS.has(value.effect) ? value.effect : 'deny',
    subjects: uniqueIds(value.subjects, '정책 주체'),
    actions: uniqueIds(value.actions, '정책 동작'),
    target: normalizeRecordTarget(value.target, '정책'),
    enforcement: POLICY_ENFORCEMENTS.has(value.enforcement) ? value.enforcement : 'manual',
    dataClassIds: uniqueIds(value.dataClassIds, '정책 데이터 종류'),
    evidenceIds: uniqueIds(value.evidenceIds, '근거'),
  })
}

function normalizeObservation(value) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_OBSERVATION', '관측 기록 형식이 올바르지 않습니다.')
  const id = safeId(value.id, '관측')
  const reality = REALITY_LEVELS.has(value.reality) ? value.reality : 'unknown'
  const observedAt = normalizeTimestamp(value.observedAt, '관측', {
    required: ['observed', 'runtime_verified', 'stale', 'contradicted'].includes(reality),
  })
  const expiresAt = normalizeTimestamp(value.expiresAt, '관측 만료')
  if (observedAt && expiresAt && Date.parse(expiresAt) <= Date.parse(observedAt)) {
    throw new TwinBuildError('INVALID_OBSERVATION_WINDOW', `${id}의 만료 시각은 관측 시각보다 뒤여야 합니다.`)
  }
  return withFingerprint({
    id,
    kind: OBSERVATION_KINDS.has(value.kind) ? value.kind : 'state',
    label: safeText(value.label, 160) || id,
    subject: normalizeRecordTarget(value.subject, '관측'),
    reality,
    status: value.status ? safeId(value.status, '관측 상태') : 'unknown',
    summary: safeText(value.summary, 500),
    observedAt,
    expiresAt,
    dataClassIds: uniqueIds(value.dataClassIds, '관측 데이터 종류'),
    evidenceIds: uniqueIds(value.evidenceIds, '근거'),
  })
}

function normalizeEvent(value) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_EVENT', '사건 기록 형식이 올바르지 않습니다.')
  const id = safeId(value.id, '사건')
  return withFingerprint({
    id,
    type: safeId(value.type, '사건 종류'),
    subject: normalizeRecordTarget(value.subject, '사건'),
    actorKind: EVENT_ACTOR_KINDS.has(value.actorKind) ? value.actorKind : 'unknown',
    actorRef: safeText(value.actorRef, 240),
    occurredAt: normalizeTimestamp(value.occurredAt, '사건', { required: true }),
    summary: safeText(value.summary, 500),
    operationId: value.operationId ? safeId(value.operationId, '사건 조작') : null,
    dataClassIds: uniqueIds(value.dataClassIds, '사건 데이터 종류'),
    evidenceIds: uniqueIds(value.evidenceIds, '근거'),
  })
}

function normalizeControl(value) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_CONTROL', '통제 기록 형식이 올바르지 않습니다.')
  const id = safeId(value.id, '통제')
  return withFingerprint({
    id,
    kind: CONTROL_KINDS.has(value.kind) ? value.kind : 'unknown',
    label: safeText(value.label, 160) || id,
    description: safeText(value.description, 500),
    effect: CONTROL_EFFECTS.has(value.effect) ? value.effect : 'prevent',
    status: CONTROL_STATUSES.has(value.status) ? value.status : 'unknown',
    target: normalizeRecordTarget(value.target, '통제'),
    policyIds: uniqueIds(value.policyIds, '통제 정책'),
    evidenceIds: uniqueIds(value.evidenceIds, '근거'),
  })
}

function normalizeThreat(value) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_THREAT', '위협 기록 형식이 올바르지 않습니다.')
  const id = safeId(value.id, '위협')
  return withFingerprint({
    id,
    label: safeText(value.label, 160) || id,
    description: safeText(value.description, 500),
    category: THREAT_CATEGORIES.has(value.category) ? value.category : 'unknown',
    status: THREAT_STATUSES.has(value.status) ? value.status : 'hypothetical',
    likelihood: LIKELIHOOD_LEVELS.has(value.likelihood) ? value.likelihood : 'unknown',
    impact: IMPACT_LEVELS.has(value.impact) ? value.impact : 'unknown',
    source: normalizeRecordTarget(value.source, '위협 시작'),
    target: normalizeRecordTarget(value.target, '위협 도착'),
    gatewayIds: uniqueIds(value.gatewayIds, '위협 게이트웨이'),
    dataClassIds: uniqueIds(value.dataClassIds, '위협 데이터 종류'),
    controlIds: uniqueIds(value.controlIds, '위협 통제'),
    evidenceIds: uniqueIds(value.evidenceIds, '근거'),
  })
}

function normalizeOperation(value) {
  try {
    return normalizeOperationDefinition(value)
  } catch (error) {
    throw new TwinBuildError(error.code ?? 'INVALID_OPERATION', error.message ?? '조작 기록 형식이 올바르지 않습니다.')
  }
}

function requireReferences(build) {
  const evidenceIds = new Set(build.evidence.map((item) => item.id))
  const entityById = new Map(build.entities.map((item) => [item.id, item]))
  const partById = new Map(build.parts.map((item) => [item.id, item]))
  const relationIds = new Set(build.relations.map((item) => item.id))
  const zoneById = new Map(build.trustZones.map((item) => [item.id, item]))
  const gatewayById = new Map(build.gateways.map((item) => [item.id, item]))
  const operationIds = new Set(build.operations.map((item) => item.id))
  const dataClassIds = new Set(build.dataClasses.map((item) => item.id))
  const policyIds = new Set(build.policies.map((item) => item.id))
  const controlIds = new Set(build.controls.map((item) => item.id))

  const requireUniquePlacement = (records, selector, label) => {
    const ids = records.map(selector)
    if (new Set(ids).size !== ids.length) {
      throw new TwinBuildError('DUPLICATE_PLACEMENT', `${label} 캔버스 식별자가 중복되었습니다.`)
    }
  }
  requireUniquePlacement(build.entities, (item) => item.placement.nodeId, '엔티티')
  requireUniquePlacement(build.relations, (item) => item.placement.edgeId, '관계')
  const partPlacements = new Set()
  for (const part of build.parts) {
    const key = `${part.entityId}:${part.placement.partId}`
    if (partPlacements.has(key)) {
      throw new TwinBuildError('DUPLICATE_PLACEMENT', `엔티티 ${part.entityId}의 파츠 캔버스 식별자가 중복되었습니다.`)
    }
    partPlacements.add(key)
  }

  const requireEvidence = (record) => {
    for (const evidenceId of record.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        throw new TwinBuildError('MISSING_EVIDENCE', `${record.id}가 존재하지 않는 근거 ${evidenceId}를 참조합니다.`)
      }
    }
  }
  for (const record of [
    ...build.entities,
    ...build.parts,
    ...build.relations,
    ...build.trustZones,
    ...build.gateways,
    ...build.dataClasses,
    ...build.policies,
    ...build.operations,
    ...build.observations,
    ...build.events,
    ...build.controls,
    ...build.threats,
  ]) {
    requireEvidence(record)
  }
  if (build.source.rootEntityId && !entityById.has(build.source.rootEntityId)) {
    throw new TwinBuildError('MISSING_ROOT_ENTITY', 'TwinBuild 루트 엔티티를 찾을 수 없습니다.')
  }
  for (const entity of build.entities) {
    if (entity.parentId && !entityById.has(entity.parentId)) {
      throw new TwinBuildError('MISSING_PARENT_ENTITY', `${entity.id}의 부모 엔티티 ${entity.parentId}가 없습니다.`)
    }
    if (entity.trustZoneId && !zoneById.has(entity.trustZoneId)) {
      throw new TwinBuildError('MISSING_TRUST_ZONE', `${entity.id}의 신뢰영역 ${entity.trustZoneId}가 없습니다.`)
    }
  }
  for (const entity of build.entities) {
    const seen = new Set([entity.id])
    let parentId = entity.parentId
    while (parentId) {
      if (seen.has(parentId)) {
        throw new TwinBuildError('CYCLIC_ENTITY_PARENT', `${entity.id}의 부모 계층이 순환합니다.`)
      }
      seen.add(parentId)
      parentId = entityById.get(parentId)?.parentId ?? null
    }
  }
  for (const gateway of build.gateways) {
    if (!zoneById.has(gateway.sourceZoneId) || !zoneById.has(gateway.targetZoneId)) {
      throw new TwinBuildError('MISSING_GATEWAY_ZONE', `${gateway.id}의 양쪽 신뢰영역을 찾을 수 없습니다.`)
    }
  }
  for (const part of build.parts) {
    if (!entityById.has(part.entityId)) {
      throw new TwinBuildError('MISSING_PART_ENTITY', `${part.id}의 소유 엔티티 ${part.entityId}가 없습니다.`)
    }
    for (const operationId of part.operationIds) {
      if (!operationIds.has(operationId)) {
        throw new TwinBuildError('MISSING_PART_OPERATION', `${part.id}가 존재하지 않는 조작 ${operationId}를 참조합니다.`)
      }
    }
  }
  for (const relation of build.relations) {
    const sourceEntity = entityById.get(relation.source.entityId)
    const targetEntity = entityById.get(relation.target.entityId)
    if (!sourceEntity || !targetEntity) {
      throw new TwinBuildError('MISSING_RELATION_ENTITY', `${relation.id}의 양 끝 엔티티를 찾을 수 없습니다.`)
    }
    for (const [endpoint, entity] of [[relation.source, sourceEntity], [relation.target, targetEntity]]) {
      if (!endpoint.partId) continue
      const part = partById.get(endpoint.partId)
      if (!part || part.entityId !== entity.id) {
        throw new TwinBuildError('INVALID_RELATION_PART', `${relation.id}의 파츠 연결점이 해당 엔티티에 속하지 않습니다.`)
      }
    }
    if (relation.gatewayId && !gatewayById.has(relation.gatewayId)) {
      throw new TwinBuildError('MISSING_RELATION_GATEWAY', `${relation.id}의 게이트웨이 ${relation.gatewayId}가 없습니다.`)
    }
    if (sourceEntity.trustZoneId && targetEntity.trustZoneId && sourceEntity.trustZoneId !== targetEntity.trustZoneId) {
      const analysis = analyzeTrustBoundary({
        sourceZone: zoneById.get(sourceEntity.trustZoneId),
        targetZone: zoneById.get(targetEntity.trustZoneId),
        gateway: gatewayById.get(relation.gatewayId),
      })
      if (!analysis.valid) {
        throw new TwinBuildError('UNMODELED_TRUST_CROSSING', `${relation.id}: ${analysis.reason}`)
      }
    }
  }
  const targetSets = {
    entity: new Set(entityById.keys()),
    part: new Set(partById.keys()),
    relation: relationIds,
    gateway: new Set(gatewayById.keys()),
    trust_zone: new Set(zoneById.keys()),
    data_class: dataClassIds,
    operation: operationIds,
    policy: policyIds,
    control: controlIds,
  }
  const requireTarget = (target, record, label) => {
    if (!targetSets[target.kind]?.has(target.id)) {
      throw new TwinBuildError('MISSING_RECORD_TARGET', `${record.id}의 ${label} 대상 ${target.id}를 찾을 수 없습니다.`)
    }
  }
  const requireDataClasses = (record, ids = record.dataClassIds) => {
    for (const dataClassId of ids ?? []) {
      if (!dataClassIds.has(dataClassId)) {
        throw new TwinBuildError('MISSING_DATA_CLASS', `${record.id}가 존재하지 않는 데이터 종류 ${dataClassId}를 참조합니다.`)
      }
    }
  }
  for (const policy of build.policies) {
    requireTarget(policy.target, policy, '정책')
    requireDataClasses(policy)
  }
  for (const operation of build.operations) {
    if (!targetSets[operation.target.kind]?.has(operation.target.id)) {
      throw new TwinBuildError('MISSING_OPERATION_TARGET', `${operation.id}의 조작 대상을 찾을 수 없습니다.`)
    }
    requireDataClasses(operation, operation.input.dataClassIds)
    for (const policyId of operation.authorizationPolicyIds) {
      if (!policyIds.has(policyId)) {
        throw new TwinBuildError('MISSING_OPERATION_POLICY', `${operation.id}가 존재하지 않는 정책 ${policyId}를 참조합니다.`)
      }
    }
    if (operation.recovery.rollbackOperationId && !operationIds.has(operation.recovery.rollbackOperationId)) {
      throw new TwinBuildError('MISSING_ROLLBACK_OPERATION', `${operation.id}의 롤백 조작을 찾을 수 없습니다.`)
    }
  }
  for (const observation of build.observations) {
    requireTarget(observation.subject, observation, '관측')
    requireDataClasses(observation)
  }
  for (const event of build.events) {
    requireTarget(event.subject, event, '사건')
    requireDataClasses(event)
    if (event.operationId && !operationIds.has(event.operationId)) {
      throw new TwinBuildError('MISSING_EVENT_OPERATION', `${event.id}의 조작 ${event.operationId}를 찾을 수 없습니다.`)
    }
  }
  for (const control of build.controls) {
    requireTarget(control.target, control, '통제')
    for (const policyId of control.policyIds) {
      if (!policyIds.has(policyId)) {
        throw new TwinBuildError('MISSING_CONTROL_POLICY', `${control.id}가 존재하지 않는 정책 ${policyId}를 참조합니다.`)
      }
    }
  }
  for (const threat of build.threats) {
    requireTarget(threat.source, threat, '위협 시작')
    requireTarget(threat.target, threat, '위협 도착')
    requireDataClasses(threat)
    for (const gatewayId of threat.gatewayIds) {
      if (!gatewayById.has(gatewayId)) {
        throw new TwinBuildError('MISSING_THREAT_GATEWAY', `${threat.id}의 게이트웨이 ${gatewayId}를 찾을 수 없습니다.`)
      }
    }
    for (const controlId of threat.controlIds) {
      if (!controlIds.has(controlId)) {
        throw new TwinBuildError('MISSING_THREAT_CONTROL', `${threat.id}의 통제 ${controlId}를 찾을 수 없습니다.`)
      }
    }
  }
}

export function createTwinBuild(value) {
  if (!plainObject(value) || value.schemaVersion !== TWIN_BUILD_SCHEMA_VERSION) {
    throw new TwinBuildError('UNSUPPORTED_SCHEMA', '지원하지 않는 TwinBuild 스키마입니다. 먼저 전진 마이그레이션해야 합니다.')
  }
  const normalized = {
    schemaVersion: TWIN_BUILD_SCHEMA_VERSION,
    id: safeId(value.id, 'TwinBuild'),
    source: normalizeSource(value.source),
    evidence: recordList(value.evidence, '근거', normalizeEvidence),
    trustZones: recordList(value.trustZones, '신뢰영역', normalizeZone),
    gateways: recordList(value.gateways, '게이트웨이', normalizeGateway),
    dataClasses: recordList(value.dataClasses, '데이터 종류', normalizeDataClass),
    policies: recordList(value.policies, '정책', normalizePolicy),
    entities: recordList(value.entities, '엔티티', normalizeEntity),
    operations: recordList(value.operations, '조작', normalizeOperation),
    parts: recordList(value.parts, '파츠', normalizePart),
    relations: recordList(value.relations, '관계', normalizeRelation),
    observations: recordList(value.observations, '관측', normalizeObservation),
    events: recordList(value.events, '사건', normalizeEvent),
    controls: recordList(value.controls, '통제', normalizeControl),
    threats: recordList(value.threats, '위협', normalizeThreat),
  }
  requireReferences(normalized)
  const summary = {
    entities: normalized.entities.length,
    parts: normalized.parts.length,
    relations: normalized.relations.length,
    trustZones: normalized.trustZones.length,
    gateways: normalized.gateways.length,
    evidence: normalized.evidence.length,
    operations: normalized.operations.length,
    dataClasses: normalized.dataClasses.length,
    policies: normalized.policies.length,
    observations: normalized.observations.length,
    events: normalized.events.length,
    controls: normalized.controls.length,
    threats: normalized.threats.length,
  }
  return deepFreeze({
    ...normalized,
    summary,
    fingerprint: digitalTwinReviewFingerprint({ ...normalized, summary }),
  })
}

export function migrateTwinBuild(value) {
  if (!plainObject(value)) throw new TwinBuildError('INVALID_BUILD', '마이그레이션할 TwinBuild가 없습니다.')
  if (value.schemaVersion === TWIN_BUILD_SCHEMA_VERSION) return createTwinBuild(value)
  let migrated = value
  if (value.schemaVersion === 0) {
    migrated = {
      ...value,
      schemaVersion: 1,
      id: value.id,
      source: value.source,
      entities: value.entities ?? value.nodes ?? [],
      parts: value.parts ?? value.capabilities ?? [],
      relations: value.relations ?? value.connections ?? [],
      trustZones: value.trustZones ?? value.zones ?? [],
      gateways: value.gateways ?? [],
      evidence: value.evidence ?? [],
      operations: value.operations ?? value.actions ?? [],
    }
  }
  if (migrated.schemaVersion === 1) {
    migrated = {
      ...migrated,
      schemaVersion: 2,
      source: {
        ...migrated.source,
        engineSchemaVersion: Math.max(2, Number(migrated.source?.engineSchemaVersion) || 1),
      },
      dataClasses: migrated.dataClasses ?? [],
      policies: migrated.policies ?? [],
      observations: migrated.observations ?? [],
      events: migrated.events ?? [],
      controls: migrated.controls ?? [],
      threats: migrated.threats ?? [],
      operations: (migrated.operations ?? []).map((operation) => ({
        availability: 'declared',
        allowedInitiators: [],
        authorizationPolicyIds: [],
        input: { schemaRef: '', dataClassIds: [] },
        writeSet: [],
        excludes: [],
        execution: { adapterId: '', actionId: '', location: 'unknown' },
        idempotency: { mode: 'none', keyScope: '', replay: 'reject' },
        verification: { required: false, mode: 'none', adapterId: '', successCriteria: [] },
        recovery: {
          mode: operation.reversible === true ? 'manual' : 'unavailable',
          retry: { maxAttempts: 1, backoff: 'none' },
          summary: '',
        },
        ...operation,
      })),
    }
  }
  if (migrated.schemaVersion === 2) {
    return createTwinBuild({
      ...migrated,
      schemaVersion: TWIN_BUILD_SCHEMA_VERSION,
      entities: (migrated.entities ?? []).map((entity) => ({
        ...entity,
        logicalComponent: entity.logicalComponent ?? null,
      })),
    })
  }
  throw new TwinBuildError('MIGRATION_UNAVAILABLE', `TwinBuild v${value.schemaVersion ?? 'unknown'}에서 v${TWIN_BUILD_SCHEMA_VERSION}로 가는 마이그레이션이 없습니다.`)
}
