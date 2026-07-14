export const SYSTEM_RUNTIME_SCHEMA_VERSION = 1

export const SYSTEM_RUNTIME_CAPABILITY_DEFS = Object.freeze([
  Object.freeze({
    id: 'workflow.supabase.user-canvases.read',
    label: 'Supabase 읽기 연결',
    sourceId: 'workflow-canvas:self-system',
    entityKey: 'credential-reference:SUPABASE_ANON_KEY',
    targetNodeId: 'map-web-app',
    partKinds: Object.freeze(['credential_ref']),
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
  )) ?? null
}

export function normalizeSystemRuntimeRequest(value) {
  if (!plainObject(value)) throw new SystemRuntimeContractError('INVALID_REQUEST', '연결 확인 요청이 올바르지 않습니다.')
  const unexpected = Object.keys(value).filter((key) => !REQUEST_KEYS.has(key))
  if (unexpected.length) {
    throw new SystemRuntimeContractError('UNEXPECTED_FIELD', '연결 확인 요청에 허용되지 않은 항목이 있습니다.')
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
  return {
    schemaVersion: SYSTEM_RUNTIME_SCHEMA_VERSION,
    capabilityId: capability.id,
    status,
    verification: status === 'healthy' && value.verification === 'verified' ? 'verified' : 'failed',
    resourceId: requiredId(value.resourceId, '런타임 자원 ID'),
    checkedAt: checkedAt.toISOString(),
    latencyMs: Number.isFinite(latency) ? Math.max(0, Math.min(30_000, Math.round(latency))) : 0,
    summary: plainText(value.summary, 180),
    ...(status === 'failed' && SAFE_ERROR_CODE.test(errorCode) ? { errorCode } : {}),
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
      ? { id: 'healthy', label: 'LIVE', color: '#22c55e' }
      : { id: 'failed', label: '오류', color: '#ef4444' }
  } catch {
    return { id: 'declared', label: '설계', color: '#f59e0b' }
  }
}
