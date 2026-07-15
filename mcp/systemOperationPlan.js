import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const PLAN_SCHEMA_VERSION = 1
const DEFAULT_TTL_MS = 5 * 60 * 1000
const MAX_TOKEN_LENGTH = 16_000
const INITIATOR_KINDS = new Set(['human_ui', 'deterministic_automation', 'ai_agent'])
const RISK_LEVELS = new Set(['none', 'low', 'medium', 'high', 'critical'])
const SIDE_EFFECT_LEVELS = new Set(['none', 'session', 'external', 'mutation', 'destructive', 'authorization', 'recurring'])
const APPROVAL_LEVELS = new Set(['none', 'preview', 'explicit', 'multi_party'])
const VERIFICATION_MODES = new Set(['none', 'postcondition', 'independent'])
const RECOVERY_MODES = new Set(['unavailable', 'manual', 'automatic', 'append_only'])

export class SystemOperationPlanError extends Error {
  constructor(status, code, message) {
    super(message)
    this.name = 'SystemOperationPlanError'
    this.status = status
    this.code = code
  }
}

function requiredText(value, label, maxLength = 500) {
  const text = typeof value === 'string' ? value.trim() : ''
  if (!text || text.length > maxLength) {
    throw new SystemOperationPlanError(400, 'INVALID_OPERATION_PLAN', `${label} 값이 올바르지 않습니다.`)
  }
  return text
}

function signingSecret(value) {
  const secret = typeof value === 'string' ? value.trim() : ''
  if (secret.length < 32) {
    throw new SystemOperationPlanError(503, 'OPERATION_SIGNING_UNAVAILABLE', '시스템 조작 계획 서명 설정이 없습니다.')
  }
  return secret
}

function signature(encodedPayload, secret) {
  return createHmac('sha256', signingSecret(secret))
    .update('workflow-canvas-operation-plan-v1\0')
    .update(encodedPayload)
    .digest('base64url')
}

function operationId(token) {
  return `op-${createHash('sha256').update(token).digest('hex')}`
}

function parseTimestamp(value, code, message) {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new SystemOperationPlanError(400, code, message)
  return parsed
}

function normalizeOperationContract(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const definitionFingerprint = requiredText(value.definitionFingerprint, '조작 계약 지문', 128)
  if (!/^[a-f0-9]{8,128}$/i.test(definitionFingerprint)) {
    throw new SystemOperationPlanError(400, 'INVALID_OPERATION_PLAN', '조작 계약 지문이 올바르지 않습니다.')
  }
  const initiatorKind = INITIATOR_KINDS.has(value.initiatorKind) ? value.initiatorKind : null
  if (!initiatorKind) throw new SystemOperationPlanError(400, 'INVALID_OPERATION_PLAN', '조작 시작 주체가 올바르지 않습니다.')
  if (!RISK_LEVELS.has(value.risk) || !SIDE_EFFECT_LEVELS.has(value.sideEffect) || !APPROVAL_LEVELS.has(value.approval)) {
    throw new SystemOperationPlanError(400, 'INVALID_OPERATION_PLAN', '조작 계약의 위험·부작용·승인 정보가 올바르지 않습니다.')
  }
  if (!VERIFICATION_MODES.has(value.verification?.mode) || !RECOVERY_MODES.has(value.recovery?.mode)) {
    throw new SystemOperationPlanError(400, 'INVALID_OPERATION_PLAN', '조작 계약의 검증 또는 복구 정보가 올바르지 않습니다.')
  }
  const timeoutMs = Number(value.timeoutMs)
  return {
    definitionId: requiredText(value.definitionId, '조작 계약', 240),
    definitionFingerprint,
    initiatorKind,
    risk: value.risk,
    sideEffect: value.sideEffect,
    approval: value.approval,
    timeoutMs: Number.isInteger(timeoutMs) ? Math.max(1_000, Math.min(24 * 60 * 60 * 1000, timeoutMs)) : 60_000,
    verification: {
      required: value.verification?.required === true,
      mode: value.verification.mode,
      adapterId: typeof value.verification?.adapterId === 'string' ? value.verification.adapterId.slice(0, 240) : '',
    },
    recovery: {
      mode: value.recovery.mode,
      maxAttempts: Number.isInteger(value.recovery?.retry?.maxAttempts)
        ? Math.max(1, Math.min(10, value.recovery.retry.maxAttempts))
        : 1,
    },
  }
}

export function systemOperationSigningSecret(env = process.env) {
  return signingSecret(env.WORKFLOW_CANVAS_OPERATION_SIGNING_SECRET || env.SUPABASE_SERVICE_ROLE_KEY)
}

export function createSignedSystemOperationPlan(definition, secret, {
  now = new Date(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  const issuedAtMs = now instanceof Date ? now.getTime() : Date.parse(now)
  if (!Number.isFinite(issuedAtMs)) throw new SystemOperationPlanError(400, 'INVALID_PLAN_TIME', '조작 계획 생성 시각이 올바르지 않습니다.')
  const safeTtl = Math.max(30_000, Math.min(15 * 60 * 1000, Number(ttlMs) || DEFAULT_TTL_MS))
  const payload = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    operation: requiredText(definition.operation, '조작 종류', 160),
    actorId: requiredText(definition.actorId, '승인 사용자', 160),
    targetKey: requiredText(definition.targetKey, '조작 대상', 240),
    stateFingerprint: requiredText(definition.stateFingerprint, '상태 지문', 128),
    confirmation: requiredText(definition.confirmation, '확인 문구', 160),
    issuedAt: new Date(issuedAtMs).toISOString(),
    expiresAt: new Date(issuedAtMs + safeTtl).toISOString(),
    nonce: randomBytes(18).toString('base64url'),
    scope: definition.scope ?? {},
    writeSet: Array.isArray(definition.writeSet) ? definition.writeSet : [],
    excludes: Array.isArray(definition.excludes) ? definition.excludes : [],
    recovery: definition.recovery ?? {},
    contract: normalizeOperationContract(definition.contract),
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const token = `${encodedPayload}.${signature(encodedPayload, secret)}`
  return {
    token,
    payload,
    publicPlan: {
      id: operationId(token),
      operation: payload.operation,
      targetKey: payload.targetKey,
      stateFingerprint: payload.stateFingerprint,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
      scope: payload.scope,
      writeSet: payload.writeSet,
      excludes: payload.excludes,
      recovery: payload.recovery,
      contract: payload.contract,
      confirmation: payload.confirmation,
    },
  }
}

export function verifySignedSystemOperationPlan(token, secret, {
  actorId,
  operation,
  confirmation,
  definitionId,
  definitionFingerprint,
  initiatorKind,
  now = new Date(),
} = {}) {
  if (typeof token !== 'string' || !token || token.length > MAX_TOKEN_LENGTH) {
    throw new SystemOperationPlanError(400, 'INVALID_OPERATION_PLAN', '조작 계획 토큰이 올바르지 않습니다.')
  }
  const segments = token.split('.')
  if (segments.length !== 2 || !segments[0] || !segments[1]) {
    throw new SystemOperationPlanError(400, 'INVALID_OPERATION_PLAN', '조작 계획 토큰 형식이 올바르지 않습니다.')
  }
  const [encodedPayload, providedSignature] = segments
  const expectedSignature = signature(encodedPayload, secret)
  const providedBytes = Buffer.from(providedSignature)
  const expectedBytes = Buffer.from(expectedSignature)
  if (providedBytes.length !== expectedBytes.length || !timingSafeEqual(providedBytes, expectedBytes)) {
    throw new SystemOperationPlanError(403, 'OPERATION_PLAN_TAMPERED', '조작 계획이 변경되었거나 유효하지 않습니다.')
  }
  let payload
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'))
  } catch {
    throw new SystemOperationPlanError(400, 'INVALID_OPERATION_PLAN', '조작 계획 내용을 읽을 수 없습니다.')
  }
  if (payload?.schemaVersion !== PLAN_SCHEMA_VERSION) {
    throw new SystemOperationPlanError(400, 'INVALID_OPERATION_PLAN', '지원하지 않는 조작 계획 버전입니다.')
  }
  if (payload.actorId !== actorId) {
    throw new SystemOperationPlanError(403, 'OPERATION_ACTOR_MISMATCH', '이 조작 계획을 승인한 사용자가 아닙니다.')
  }
  if (payload.operation !== operation) {
    throw new SystemOperationPlanError(409, 'OPERATION_TYPE_MISMATCH', '조작 계획의 작업 종류가 일치하지 않습니다.')
  }
  if (payload.confirmation !== confirmation) {
    throw new SystemOperationPlanError(400, 'OPERATION_CONFIRMATION_REQUIRED', '미리보기에서 요구한 확인 문구가 필요합니다.')
  }
  if (definitionId && payload.contract?.definitionId !== definitionId) {
    throw new SystemOperationPlanError(409, 'OPERATION_DEFINITION_MISMATCH', '조작 계획의 표준 계약이 현재 실행 계약과 다릅니다.')
  }
  if (definitionFingerprint && payload.contract?.definitionFingerprint !== definitionFingerprint) {
    throw new SystemOperationPlanError(409, 'OPERATION_DEFINITION_CHANGED', '미리보기 이후 표준 조작 계약이 변경되었습니다.')
  }
  if (initiatorKind && payload.contract?.initiatorKind !== initiatorKind) {
    throw new SystemOperationPlanError(403, 'OPERATION_INITIATOR_MISMATCH', '조작 계획을 시작한 경로가 현재 실행 요청과 다릅니다.')
  }
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now)
  const issuedAt = parseTimestamp(payload.issuedAt, 'INVALID_OPERATION_PLAN', '조작 계획 생성 시각이 올바르지 않습니다.')
  const expiresAt = parseTimestamp(payload.expiresAt, 'INVALID_OPERATION_PLAN', '조작 계획 만료 시각이 올바르지 않습니다.')
  if (!Number.isFinite(nowMs) || issuedAt > nowMs + 60_000) {
    throw new SystemOperationPlanError(400, 'INVALID_OPERATION_PLAN', '조작 계획 시각을 신뢰할 수 없습니다.')
  }
  if (expiresAt <= nowMs) {
    throw new SystemOperationPlanError(409, 'OPERATION_PLAN_EXPIRED', '조작 계획이 만료되었습니다. 최신 상태로 다시 미리보세요.')
  }
  return { id: operationId(token), token, payload }
}
