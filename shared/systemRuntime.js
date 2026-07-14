export const SYSTEM_RUNTIME_SCHEMA_VERSION = 1
export const SYSTEM_RUNTIME_MAX_METRIC_GROUPS = 12

export const SYSTEM_RUNTIME_CAPABILITY_DEFS = Object.freeze([
  Object.freeze({
    id: 'workflow.supabase.user-canvases.read',
    label: '브라우저 RLS 읽기 경로',
    operation: 'check',
    resultKind: 'health',
    authorization: 'system_operator',
    dataScope: 'operator_canary',
    sourceId: 'workflow-canvas:self-system',
    entityKey: 'credential-reference:SUPABASE_ANON_KEY',
    targetNodeId: 'map-web-app',
    partKinds: Object.freeze(['credential_ref']),
    partRefs: Object.freeze(['SUPABASE_ANON_KEY']),
    sourceRefs: Object.freeze([
      'shared/systemRuntime.js',
      'mcp/systemRuntime.js',
      'api/system-runtime.js',
      'src/lib/systemRuntimeApi.js',
      'src/lib/supabase.js',
      'src/nodes/SystemNode.jsx',
    ]),
  }),
  Object.freeze({
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
const REQUEST_KEYS = new Set(['canvasId', 'nodeId', 'partId'])

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function plainText(value, maxLength = 240) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
}

function requiredId(value, label) {
  const id = plainText(value)
  if (!SAFE_ID.test(id)) throw new SystemRuntimeContractError('INVALID_REQUEST', `${label}가 올바르지 않습니다.`)
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

export function normalizeSystemRuntimeResult(value) {
  if (!plainObject(value)) throw new SystemRuntimeContractError('INVALID_RESULT', '연결 확인 결과가 올바르지 않습니다.')
  const capability = systemRuntimeCapabilityDefinition(value.capabilityId)
  if (!capability) throw new SystemRuntimeContractError('INVALID_RESULT', '등록되지 않은 연결 확인 결과입니다.')
  const status = value.status === 'healthy' ? 'healthy' : 'failed'
  const checkedAt = new Date(value.checkedAt)
  if (!Number.isFinite(checkedAt.getTime())) {
    throw new SystemRuntimeContractError('INVALID_RESULT', '연결 확인 시각이 올바르지 않습니다.')
  }
  const latency = Number(value.latencyMs)
  const errorCode = plainText(value.errorCode, 80)
  const result = {
    schemaVersion: SYSTEM_RUNTIME_SCHEMA_VERSION,
    capabilityId: capability.id,
    resultKind: capability.resultKind,
    status,
    verification: status === 'healthy' && value.verification === 'verified' ? 'verified' : 'failed',
    authorization: capability.authorization,
    dataScope: capability.dataScope,
    resourceId: requiredId(value.resourceId, '런타임 자원 ID'),
    checkedAt: checkedAt.toISOString(),
    latencyMs: Number.isFinite(latency) ? Math.max(0, Math.min(30_000, Math.round(latency))) : 0,
    summary: plainText(value.summary, 180),
    ...(status === 'failed' && SAFE_ERROR_CODE.test(errorCode) ? { errorCode } : {}),
  }
  if (status !== 'healthy' || capability.resultKind !== 'metric_groups') return result

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
        label: plainText(metric.label, 40) || '값',
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
      title: plainText(item.title, 120) || '운영 지표',
      ...(updatedAt ? { updatedAt: updatedAt.toISOString() } : {}),
      metrics,
    }
  })
  return {
    ...result,
    collectionLabel: plainText(value.collectionLabel, 80) || capability.label,
    totalCount: items.length,
    items,
    truncated: Array.isArray(value.items) && value.items.length > items.length,
  }
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

export function systemPartRuntimeReality(value) {
  if (value?.status === 'checking') return { id: 'checking', label: '확인 중', color: '#60a5fa' }
  try {
    const result = normalizeSystemRuntimeResult(value)
    return result.status === 'healthy'
      ? {
          id: 'healthy',
          label: result.resultKind === 'metric_groups' ? '운영 조회' : 'LIVE',
          color: '#22c55e',
        }
      : { id: 'failed', label: '오류', color: '#ef4444' }
  } catch {
    return { id: 'declared', label: '설계', color: '#f59e0b' }
  }
}
