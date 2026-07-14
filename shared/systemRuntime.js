import { systemPartContainsSecretLiteral } from './systemPartOntology.js'
import {
  SYSTEM_OBSERVATION_AVAILABILITY_DEFS,
  systemObservationCatalogForCapability,
} from './systemObservationCatalog.js'

export const SYSTEM_RUNTIME_SCHEMA_VERSION = 3
export const SYSTEM_RUNTIME_MAX_METRIC_GROUPS = 12
export const SYSTEM_RUNTIME_MAX_OBSERVATIONS = 64

export const SYSTEM_CAPABILITY_OPERATION_DEFS = Object.freeze([
  Object.freeze({ id: 'observe', label: '관측', sideEffect: 'none', risk: 'none' }),
  Object.freeze({ id: 'read', label: '조회', sideEffect: 'none', risk: 'low' }),
  Object.freeze({ id: 'validate', label: '검증', sideEffect: 'none', risk: 'low' }),
  Object.freeze({ id: 'subscribe', label: '구독', sideEffect: 'session', risk: 'low' }),
  Object.freeze({ id: 'execute', label: '실행', sideEffect: 'external', risk: 'medium' }),
  Object.freeze({ id: 'create', label: '생성', sideEffect: 'mutation', risk: 'high' }),
  Object.freeze({ id: 'update', label: '변경', sideEffect: 'mutation', risk: 'high' }),
  Object.freeze({ id: 'delete', label: '삭제', sideEffect: 'destructive', risk: 'critical' }),
  Object.freeze({ id: 'approve', label: '승인', sideEffect: 'authorization', risk: 'high' }),
  Object.freeze({ id: 'automate', label: '자동화', sideEffect: 'recurring', risk: 'high' }),
  Object.freeze({ id: 'restore', label: '복구', sideEffect: 'mutation', risk: 'high' }),
])

const OPERATION_BY_ID = new Map(SYSTEM_CAPABILITY_OPERATION_DEFS.map((definition) => [definition.id, definition]))

const capability = (definition) => {
  const operation = OPERATION_BY_ID.get(definition.operation)
  if (!operation) throw new Error(`Unknown system capability operation: ${definition.operation}`)
  return Object.freeze({
    freshnessMs: 15 * 60 * 1000,
    ...definition,
    sideEffect: operation.sideEffect,
    risk: operation.risk,
    pathEdgeIds: Object.freeze([...(definition.pathEdgeIds ?? [])]),
    sourceRefs: Object.freeze([...new Set([
      'shared/systemObservationCatalog.js',
      ...(definition.sourceRefs ?? []),
    ])]),
    catalogFields: systemObservationCatalogForCapability(definition.id),
  })
}

export const SYSTEM_RUNTIME_CAPABILITY_DEFS = Object.freeze([
  capability({
    id: 'workflow.vercel.deployment.runtime',
    label: 'Vercel 프로덕션 운영 상태',
    operation: 'observe',
    resultKind: 'observations',
    authorization: 'system_operator',
    dataScope: 'application_metadata',
    sourceId: 'workflow-canvas:self-system',
    entityKey: 'runtime-capability:workflow.vercel.deployment.runtime',
    targetNodeId: 'map-vercel',
    partKinds: Object.freeze(['output']),
    partRefs: Object.freeze(['workflow.vercel.deployment.runtime']),
    sourceRefs: Object.freeze([
      'shared/systemRuntime.js',
      'mcp/systemRuntime.js',
      'api/system-runtime.js',
      'src/lib/systemRuntimeApi.js',
      'src/nodes/SystemNode.jsx',
      'vercel.json',
    ]),
  }),
  capability({
    id: 'workflow.api.shared-canvas.health',
    label: '공유 캔버스 API 상태',
    operation: 'validate',
    resultKind: 'observations',
    authorization: 'system_operator',
    dataScope: 'route_metadata',
    sourceId: 'workflow-canvas:self-system',
    entityKey: 'runtime-capability:workflow.api.shared-canvas.health',
    targetNodeId: 'map-shared-api',
    partKinds: Object.freeze(['connection']),
    partRefs: Object.freeze(['workflow.api.shared-canvas.health']),
    pathEdgeIds: Object.freeze(['map-edge-vercel-shared']),
    sourceRefs: Object.freeze([
      'shared/systemRuntime.js',
      'mcp/systemRuntime.js',
      'api/system-runtime.js',
      'api/shared-canvas.js',
      'src/lib/systemRuntimeApi.js',
      'src/nodes/SystemNode.jsx',
    ]),
  }),
  capability({
    id: 'workflow.api.mcp.route',
    label: 'MCP 배포 경로 상태',
    operation: 'validate',
    resultKind: 'observations',
    authorization: 'system_operator',
    dataScope: 'route_metadata',
    sourceId: 'workflow-canvas:self-system',
    entityKey: 'runtime-capability:workflow.api.mcp.route',
    targetNodeId: 'map-mcp-api',
    partKinds: Object.freeze(['connection']),
    partRefs: Object.freeze(['workflow.api.mcp.route']),
    pathEdgeIds: Object.freeze(['map-edge-vercel-mcp']),
    sourceRefs: Object.freeze([
      'shared/systemRuntime.js',
      'mcp/systemRuntime.js',
      'api/system-runtime.js',
      'api/mcp.js',
      'mcp/server.js',
      'src/lib/systemRuntimeApi.js',
      'src/nodes/SystemNode.jsx',
    ]),
  }),
  capability({
    id: 'workflow.supabase.auth.session',
    label: 'Supabase Auth 세션 검증',
    operation: 'validate',
    resultKind: 'observations',
    authorization: 'system_operator',
    dataScope: 'operator_session',
    sourceId: 'workflow-canvas:self-system',
    entityKey: 'runtime-capability:workflow.supabase.auth.session',
    targetNodeId: 'map-supabase-auth',
    partKinds: Object.freeze(['connection']),
    partRefs: Object.freeze(['workflow.supabase.auth.session']),
    pathEdgeIds: Object.freeze(['map-edge-app-auth', 'map-edge-auth-user']),
    sourceRefs: Object.freeze([
      'shared/systemRuntime.js',
      'mcp/systemRuntime.js',
      'mcp/shareAccess.js',
      'api/system-runtime.js',
      'src/lib/systemRuntimeApi.js',
      'src/nodes/SystemNode.jsx',
    ]),
  }),
  capability({
    id: 'workflow.supabase.user-canvases.read',
    label: '브라우저 RLS 읽기 경로',
    operation: 'validate',
    resultKind: 'health',
    authorization: 'system_operator',
    dataScope: 'operator_canary',
    sourceId: 'workflow-canvas:self-system',
    entityKey: 'credential-reference:SUPABASE_ANON_KEY',
    targetNodeId: 'map-web-app',
    partKinds: Object.freeze(['credential_ref']),
    partRefs: Object.freeze(['SUPABASE_ANON_KEY']),
    pathEdgeIds: Object.freeze(['map-edge-app-canvases-read', 'map-edge-rls-canvases']),
    sourceRefs: Object.freeze([
      'shared/systemRuntime.js',
      'mcp/systemRuntime.js',
      'api/system-runtime.js',
      'src/lib/systemRuntimeApi.js',
      'src/lib/supabase.js',
      'src/nodes/SystemNode.jsx',
    ]),
  }),
  capability({
    id: 'workflow.supabase.canvas-service.operations',
    label: '캔버스 서비스 운영 현황',
    operation: 'read',
    resultKind: 'metric_groups',
    authorization: 'system_operator',
    dataScope: 'application_aggregate',
    sourceId: 'workflow-canvas:self-system',
    entityKey: 'runtime-capability:workflow.supabase.canvas-service.operations',
    targetNodeId: 'map-canvases-table',
    partKinds: Object.freeze(['output']),
    partRefs: Object.freeze(['workflow.supabase.canvas-service.operations']),
    sourceRefs: Object.freeze([
      'shared/systemRuntime.js',
      'mcp/systemRuntime.js',
      'mcp/shareAccess.js',
      'api/system-runtime.js',
      'src/lib/systemRuntimeApi.js',
      'src/nodes/SystemNode.jsx',
      'supabase-runtime-read.sql',
    ]),
  }),
])

const CAPABILITY_BY_ID = new Map(SYSTEM_RUNTIME_CAPABILITY_DEFS.map((definition) => [definition.id, definition]))
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,239}$/
const SAFE_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,79}$/
const OBSERVATION_AVAILABILITY_IDS = new Set(SYSTEM_OBSERVATION_AVAILABILITY_DEFS.map((item) => item.id))
const REQUEST_KEYS = new Set(['canvasId', 'nodeId', 'partId'])
const CANVAS_REQUEST_KEYS = new Set(['canvasId'])
const BATCH_REQUEST_KEYS = new Set(['canvasId', 'action'])

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function plainText(value, maxLength = 240) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
}

function nonSecretText(value, maxLength = 240) {
  const text = plainText(value, maxLength)
  if (systemPartContainsSecretLiteral(text)) {
    throw new SystemRuntimeContractError('SECRET_VALUE_BLOCKED', '운영 관측 결과에는 실제 키나 토큰 값을 포함할 수 없습니다.')
  }
  return text
}

function requiredId(value, label) {
  const id = plainText(value)
  if (!SAFE_ID.test(id) || systemPartContainsSecretLiteral(id)) {
    throw new SystemRuntimeContractError('INVALID_REQUEST', `${label}가 올바르지 않습니다.`)
  }
  return id
}

export class SystemRuntimeContractError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'SystemRuntimeContractError'
    this.code = code
  }
}

export function systemRuntimeCapabilityDefinition(id) {
  return CAPABILITY_BY_ID.get(id) ?? null
}

export function systemCapabilityOperationDefinition(id) {
  return OPERATION_BY_ID.get(id) ?? null
}

export function systemRuntimeCapabilityForPart(part, nodeId) {
  if (!plainObject(part?.digitalTwinBinding)) return null
  return SYSTEM_RUNTIME_CAPABILITY_DEFS.find((definition) => (
    definition.targetNodeId === nodeId
    && definition.sourceId === part.digitalTwinBinding.sourceId
    && definition.entityKey === part.digitalTwinBinding.entityKey
    && definition.partKinds.includes(part.kind)
    && definition.partRefs.includes(part.ref)
  )) ?? null
}

export function normalizeSystemRuntimeRequest(value) {
  if (!plainObject(value)) throw new SystemRuntimeContractError('INVALID_REQUEST', '시스템 작업 요청이 올바르지 않습니다.')
  const unexpected = Object.keys(value).filter((key) => !REQUEST_KEYS.has(key))
  if (unexpected.length) {
    throw new SystemRuntimeContractError('UNEXPECTED_FIELD', '시스템 작업 요청에 허용되지 않은 항목이 있습니다.')
  }
  return {
    canvasId: requiredId(value.canvasId, '캔버스 ID'),
    nodeId: requiredId(value.nodeId, '노드 ID'),
    partId: requiredId(value.partId, '파츠 ID'),
  }
}

export function normalizeSystemRuntimeCanvasRequest(value) {
  if (!plainObject(value)) throw new SystemRuntimeContractError('INVALID_REQUEST', '운영 관측 요청이 올바르지 않습니다.')
  const unexpected = Object.keys(value).filter((key) => !CANVAS_REQUEST_KEYS.has(key))
  if (unexpected.length) {
    throw new SystemRuntimeContractError('UNEXPECTED_FIELD', '운영 관측 요청에 허용되지 않은 항목이 있습니다.')
  }
  return { canvasId: requiredId(value.canvasId, '캔버스 ID') }
}

export function normalizeSystemRuntimeBatchRequest(value) {
  if (!plainObject(value)) throw new SystemRuntimeContractError('INVALID_REQUEST', '전체 운영 점검 요청이 올바르지 않습니다.')
  const unexpected = Object.keys(value).filter((key) => !BATCH_REQUEST_KEYS.has(key))
  if (unexpected.length || value.action !== 'check_all') {
    throw new SystemRuntimeContractError('UNEXPECTED_FIELD', '전체 운영 점검 요청에 허용되지 않은 항목이 있습니다.')
  }
  return { canvasId: requiredId(value.canvasId, '캔버스 ID'), action: 'check_all' }
}

function catalogFieldBase(field) {
  return {
    id: field.id,
    category: field.category,
    label: field.label,
    valueType: field.valueType,
    unit: field.unit,
    sensitivity: field.sensitivity,
    sourceKind: field.sourceKind,
    refreshMode: field.refreshMode,
    evidenceRef: field.evidenceRef,
  }
}

function defaultCatalogEntry(field) {
  return {
    ...catalogFieldBase(field),
    availability: field.defaultAvailability,
    verification: field.lockedAvailability ? 'declared' : 'unavailable',
    reason: field.defaultReason,
  }
}

function normalizedObservationValue(item, field) {
  if (field.valueType === 'number' || field.valueType === 'duration_ms') {
    const number = Number(item.value)
    return Number.isFinite(number)
      ? Math.max(-1_000_000_000_000, Math.min(1_000_000_000_000, number))
      : 0
  }
  if (field.valueType === 'boolean') return item.value === true
  if (field.valueType === 'timestamp') {
    const timestamp = new Date(item.value)
    if (!Number.isFinite(timestamp.getTime())) {
      throw new SystemRuntimeContractError('INVALID_RESULT', '운영 관측 시각이 올바르지 않습니다.')
    }
    return timestamp.toISOString()
  }
  return nonSecretText(item.value, 240)
}

function metricGroupObservations(value) {
  if (!Array.isArray(value.items)) return []
  const observations = []
  let latestUpdate = ''
  for (const group of value.items.slice(0, SYSTEM_RUNTIME_MAX_METRIC_GROUPS)) {
    if (!plainObject(group)) continue
    for (const metric of (Array.isArray(group.metrics) ? group.metrics : []).slice(0, 16)) {
      if (!plainObject(metric)) continue
      observations.push({ id: metric.id, value: metric.value, availability: 'available' })
    }
    if (!latestUpdate && typeof group.updatedAt === 'string') latestUpdate = group.updatedAt
  }
  if (latestUpdate) observations.push({ id: 'latest-update', value: latestUpdate, availability: 'available' })
  return observations
}

function normalizeObservationCatalog(capability, rawItems, checkedAt, resultVerification) {
  const fieldById = new Map(capability.catalogFields.map((field) => [field.id, field]))
  const rawById = new Map()
  for (const item of rawItems.slice(0, SYSTEM_RUNTIME_MAX_OBSERVATIONS)) {
    if (!plainObject(item)) throw new SystemRuntimeContractError('INVALID_RESULT', '운영 관측값이 올바르지 않습니다.')
    const id = requiredId(item.id, '운영 관측값 ID')
    if (!fieldById.has(id) || rawById.has(id)) continue
    rawById.set(id, item)
  }
  return capability.catalogFields.map((field) => {
    const item = rawById.get(field.id)
    if (!item || field.lockedAvailability) return defaultCatalogEntry(field)
    const requestedAvailability = OBSERVATION_AVAILABILITY_IDS.has(item.availability)
      ? item.availability
      : Object.hasOwn(item, 'value')
        ? 'available'
        : field.defaultAvailability
    if (requestedAvailability !== 'available' || !Object.hasOwn(item, 'value')) {
      const availability = requestedAvailability === 'available' ? 'not_observed' : requestedAvailability
      return {
        ...catalogFieldBase(field),
        availability,
        verification: 'unavailable',
        reason: nonSecretText(item.reason, 240) || field.defaultReason,
      }
    }
    const observedAt = item.observedAt ? new Date(item.observedAt) : checkedAt
    if (!Number.isFinite(observedAt.getTime())) {
      throw new SystemRuntimeContractError('INVALID_RESULT', '운영 관측 시각이 올바르지 않습니다.')
    }
    return {
      ...catalogFieldBase(field),
      availability: 'available',
      verification: ['verified', 'partial', 'declared'].includes(item.verification)
        ? item.verification
        : resultVerification,
      value: normalizedObservationValue(item, field),
      observedAt: observedAt.toISOString(),
    }
  })
}

export function systemRuntimeCatalogForResult(capabilityId, result) {
  const capability = systemRuntimeCapabilityDefinition(capabilityId)
  if (!capability) return []
  if (Array.isArray(result?.catalog)) return result.catalog
  return capability.catalogFields.map(defaultCatalogEntry)
}

export function normalizeSystemRuntimeResult(value) {
  if (!plainObject(value)) throw new SystemRuntimeContractError('INVALID_RESULT', '연결 확인 결과가 올바르지 않습니다.')
  const capability = systemRuntimeCapabilityDefinition(value.capabilityId)
  if (!capability) throw new SystemRuntimeContractError('INVALID_RESULT', '등록되지 않은 연결 확인 결과입니다.')
  const status = ['healthy', 'degraded', 'unknown', 'failed'].includes(value.status) ? value.status : 'failed'
  const checkedAt = new Date(value.checkedAt)
  if (!Number.isFinite(checkedAt.getTime())) {
    throw new SystemRuntimeContractError('INVALID_RESULT', '연결 확인 시각이 올바르지 않습니다.')
  }
  const latency = Number(value.latencyMs)
  const errorCode = plainText(value.errorCode, 80)
  const verification = status === 'healthy' && value.verification === 'verified'
    ? 'verified'
    : status === 'degraded' && ['verified', 'partial'].includes(value.verification)
      ? 'partial'
      : status === 'unknown'
        ? 'unavailable'
        : 'failed'
  const rawObservations = ['healthy', 'degraded'].includes(status)
    ? [
        ...(Array.isArray(value.observations) ? value.observations : []),
        ...(Array.isArray(value.catalog) ? value.catalog : []),
        ...(capability.resultKind === 'metric_groups' ? metricGroupObservations(value) : []),
      ]
    : []
  const catalog = normalizeObservationCatalog(capability, rawObservations, checkedAt, verification)
  const availableObservations = catalog.filter((item) => item.availability === 'available')
  const result = {
    schemaVersion: SYSTEM_RUNTIME_SCHEMA_VERSION,
    capabilityId: capability.id,
    resultKind: capability.resultKind,
    status,
    verification,
    authorization: capability.authorization,
    dataScope: capability.dataScope,
    operation: capability.operation,
    sideEffect: capability.sideEffect,
    risk: capability.risk,
    resourceId: requiredId(value.resourceId, '런타임 자원 ID'),
    checkedAt: checkedAt.toISOString(),
    latencyMs: Number.isFinite(latency) ? Math.max(0, Math.min(30_000, Math.round(latency))) : 0,
    summary: nonSecretText(value.summary, 180),
    catalog,
    catalogCount: catalog.length,
    availableCatalogCount: availableObservations.length,
    ...(['failed', 'unknown'].includes(status) && SAFE_ERROR_CODE.test(errorCode) ? { errorCode } : {}),
  }
  if (!['healthy', 'degraded'].includes(status)) return result
  if (capability.resultKind === 'observations') {
    return {
      ...result,
      collectionLabel: nonSecretText(value.collectionLabel, 80) || capability.label,
      totalCount: availableObservations.length,
      observations: availableObservations,
      truncated: rawObservations.length > SYSTEM_RUNTIME_MAX_OBSERVATIONS,
    }
  }
  if (capability.resultKind !== 'metric_groups') return result

  const rawItems = Array.isArray(value.items) ? value.items.slice(0, SYSTEM_RUNTIME_MAX_METRIC_GROUPS) : []
  const items = rawItems.map((item) => {
    if (!plainObject(item)) throw new SystemRuntimeContractError('INVALID_RESULT', '운영 지표 그룹이 올바르지 않습니다.')
    const count = (raw) => {
      const number = Number(raw)
      return Number.isFinite(number) ? Math.max(0, Math.min(1_000_000_000, Math.trunc(number))) : 0
    }
    const metrics = []
    const metricIds = new Set()
    for (const metric of (Array.isArray(item.metrics) ? item.metrics : []).slice(0, 8)) {
      if (!plainObject(metric)) {
        throw new SystemRuntimeContractError('INVALID_RESULT', '운영 지표가 올바르지 않습니다.')
      }
      const id = requiredId(metric.id, '운영 지표 ID')
      if (metricIds.has(id)) continue
      metricIds.add(id)
      metrics.push({
        id,
        label: nonSecretText(metric.label, 40) || '값',
        value: count(metric.value),
      })
    }
    const updatedAt = typeof item.updatedAt === 'string' && item.updatedAt.trim()
      ? new Date(item.updatedAt)
      : null
    if (updatedAt && !Number.isFinite(updatedAt.getTime())) {
      throw new SystemRuntimeContractError('INVALID_RESULT', '운영 지표 시각이 올바르지 않습니다.')
    }
    return {
      id: requiredId(item.id, '운영 지표 그룹 ID'),
      title: nonSecretText(item.title, 120) || '운영 지표',
      ...(updatedAt ? { updatedAt: updatedAt.toISOString() } : {}),
      metrics,
    }
  })
  return {
    ...result,
    collectionLabel: nonSecretText(value.collectionLabel, 80) || capability.label,
    totalCount: items.length,
    items,
    truncated: Array.isArray(value.items) && value.items.length > items.length,
  }
}

export function normalizeSystemRuntimeRecords(value) {
  if (!Array.isArray(value)) throw new SystemRuntimeContractError('INVALID_RESULT', '운영 관측 목록이 올바르지 않습니다.')
  const seen = new Set()
  const records = []
  for (const item of value.slice(0, 100)) {
    if (!plainObject(item)) throw new SystemRuntimeContractError('INVALID_RESULT', '운영 관측 항목이 올바르지 않습니다.')
    const nodeId = requiredId(item.nodeId, '운영 관측 노드 ID')
    const partId = requiredId(item.partId, '운영 관측 파츠 ID')
    const key = `${nodeId}:${partId}`
    if (seen.has(key)) continue
    seen.add(key)
    records.push({ nodeId, partId, result: normalizeSystemRuntimeResult(item.result) })
  }
  return records
}

export function failedSystemRuntimeResult(capabilityId, summary, errorCode = 'REQUEST_FAILED') {
  return normalizeSystemRuntimeResult({
    capabilityId,
    status: 'failed',
    verification: 'failed',
    resourceId: 'runtime-check:unverified',
    checkedAt: new Date().toISOString(),
    latencyMs: 0,
    summary,
    errorCode,
  })
}

export function systemPartRuntimeReality(value, now = Date.now()) {
  if (value?.status === 'checking') return { id: 'checking', label: '확인 중', color: '#60a5fa' }
  try {
    const result = normalizeSystemRuntimeResult(value)
    const capability = systemRuntimeCapabilityDefinition(result.capabilityId)
    const checkedAt = Date.parse(result.checkedAt)
    if (['healthy', 'degraded'].includes(result.status)
        && Number.isFinite(checkedAt)
        && now - checkedAt > capability.freshnessMs) {
      return { id: 'stale', label: '오래됨', color: '#f59e0b' }
    }
    if (result.status === 'healthy') {
      return {
        id: 'healthy',
        label: result.resultKind === 'metric_groups' ? '운영 조회' : 'LIVE',
        color: '#22c55e',
      }
    }
    if (result.status === 'degraded') return { id: 'degraded', label: '부분 확인', color: '#eab308' }
    if (result.status === 'unknown') return { id: 'unknown', label: '미확인', color: '#94a3b8' }
    return { id: 'failed', label: '오류', color: '#ef4444' }
  } catch {
    return { id: 'unknown', label: '미확인', color: '#94a3b8' }
  }
}

export function systemRuntimePathEdgeIds(capabilityId) {
  return [...(systemRuntimeCapabilityDefinition(capabilityId)?.pathEdgeIds ?? [])]
}
