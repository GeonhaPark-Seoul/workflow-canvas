import { digitalTwinReviewFingerprint } from './digitalTwinReview.js'
import { systemPartContainsSecretLiteral } from './systemPartOntology.js'

export const OPERATION_CONTRACT_SCHEMA_VERSION = 1

export const OPERATION_INITIATOR_KINDS = Object.freeze([
  'human_ui',
  'deterministic_automation',
  'ai_agent',
])

export const OPERATION_RUN_STATES = Object.freeze([
  'planned',
  'awaiting_approval',
  'approved',
  'rejected',
  'queued',
  'running',
  'verifying',
  'succeeded',
  'failed',
  'cancelled',
  'recovery_pending',
  'recovering',
  'recovered',
  'recovery_failed',
])

const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,239}$/
const SAFE_FINGERPRINT = /^[a-f0-9]{8,128}$/i
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])
const AVAILABILITY_LEVELS = new Set(['declared', 'planned', 'executable', 'disabled'])
const ACCESS_LEVELS = new Set(['read', 'write', 'execute'])
const APPROVAL_LEVELS = new Set(['none', 'preview', 'explicit', 'multi_party'])
const RISK_LEVELS = new Set(['none', 'low', 'medium', 'high', 'critical'])
const SIDE_EFFECT_LEVELS = new Set(['none', 'session', 'external', 'mutation', 'destructive', 'authorization', 'recurring'])
const TARGET_KINDS = new Set(['entity', 'part', 'relation', 'gateway'])
const EXECUTION_LOCATIONS = new Set(['browser', 'server', 'local_connector', 'worker', 'external_provider', 'unknown'])
const IDEMPOTENCY_MODES = new Set(['none', 'keyed', 'inherent'])
const REPLAY_POLICIES = new Set(['reject', 'return_existing'])
const VERIFICATION_MODES = new Set(['none', 'postcondition', 'independent'])
const RECOVERY_MODES = new Set(['unavailable', 'manual', 'automatic', 'append_only'])
const BACKOFF_MODES = new Set(['none', 'fixed', 'exponential'])
const WRITE_OPERATIONS = new Set(['create', 'update', 'delete', 'execute', 'sync', 'append'])
const LIFECYCLE_ACTOR_KINDS = new Set([
  'human',
  'automation',
  'ai',
  'control_plane',
  'execution_adapter',
  'verifier',
  'recovery_adapter',
])
const TERMINAL_STATES = new Set(['rejected', 'succeeded', 'cancelled', 'recovered', 'recovery_failed'])
const ACTIVE_STATES = new Set(['queued', 'running', 'verifying', 'recovery_pending', 'recovering'])
const MAXIMUM_LIST_ITEMS = 120
const MAXIMUM_EVENT_DETAIL_BYTES = 20_000

export class OperationContractError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'OperationContractError'
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

function nonSecretText(value, label, maximum = 240) {
  const text = safeText(value, maximum)
  if (text && systemPartContainsSecretLiteral(text)) {
    throw new OperationContractError('SECRET_LITERAL_BLOCKED', `${label}에는 실제 키나 토큰 값을 넣을 수 없습니다.`)
  }
  return text
}

function safeId(value, label) {
  const id = safeText(value, 240)
  if (!SAFE_ID.test(id) || UNSAFE_KEYS.has(id)) {
    throw new OperationContractError('INVALID_OPERATION_ID', `${label} 식별자가 올바르지 않습니다.`)
  }
  return id
}

function safeFingerprint(value, label, { required = true } = {}) {
  const fingerprint = safeText(value, 128)
  if ((!fingerprint && required) || (fingerprint && !SAFE_FINGERPRINT.test(fingerprint))) {
    throw new OperationContractError('INVALID_OPERATION_FINGERPRINT', `${label} 지문이 올바르지 않습니다.`)
  }
  return fingerprint || null
}

function safeTimestamp(value, label, { required = true } = {}) {
  if (!value && !required) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) {
    throw new OperationContractError('INVALID_OPERATION_TIME', `${label} 시각이 올바르지 않습니다.`)
  }
  return new Date(parsed).toISOString()
}

function boundedInteger(value, fallback, minimum, maximum) {
  const number = Number(value)
  return Number.isInteger(number) ? Math.max(minimum, Math.min(maximum, number)) : fallback
}

function uniqueIds(value, label, maximum = MAXIMUM_LIST_ITEMS) {
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

function uniqueTexts(value, label, maximum = MAXIMUM_LIST_ITEMS) {
  const result = []
  const seen = new Set()
  for (const item of Array.isArray(value) ? value.slice(0, maximum) : []) {
    const text = nonSecretText(item, label, 240)
    if (text && !seen.has(text)) {
      seen.add(text)
      result.push(text)
    }
  }
  return result.sort()
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const child of Object.values(value)) deepFreeze(child, seen)
  return Object.freeze(value)
}

function withFingerprint(value) {
  return deepFreeze({ ...value, fingerprint: digitalTwinReviewFingerprint(value) })
}

function normalizeTarget(value) {
  if (!plainObject(value) || !TARGET_KINDS.has(value.kind)) {
    throw new OperationContractError('INVALID_OPERATION_TARGET', '조작 대상 종류가 올바르지 않습니다.')
  }
  return { kind: value.kind, id: safeId(value.id, '조작 대상') }
}

function normalizeInput(value) {
  const input = plainObject(value) ? value : {}
  return {
    schemaRef: nonSecretText(input.schemaRef, '입력 스키마 참조', 300),
    dataClassIds: uniqueIds(input.dataClassIds, '입력 데이터 종류'),
  }
}

function normalizeWriteSet(value) {
  const records = []
  const seen = new Set()
  for (const item of Array.isArray(value) ? value.slice(0, MAXIMUM_LIST_ITEMS) : []) {
    if (!plainObject(item)) throw new OperationContractError('INVALID_WRITE_SET', '조작 쓰기 범위가 올바르지 않습니다.')
    const resource = nonSecretText(item.resource, '쓰기 자원', 240)
    const operation = WRITE_OPERATIONS.has(item.operation) ? item.operation : 'execute'
    if (!resource) throw new OperationContractError('INVALID_WRITE_SET', '조작 쓰기 자원 이름이 없습니다.')
    const key = `${resource}:${operation}`
    if (seen.has(key)) throw new OperationContractError('DUPLICATE_WRITE_SET', `쓰기 범위 ${key}가 중복되었습니다.`)
    seen.add(key)
    records.push({
      resource,
      operation,
      maximumItems: boundedInteger(item.maximumItems ?? item.maximumRows, 1, 1, 1_000_000),
    })
  }
  return records.sort((left, right) => `${left.resource}:${left.operation}`.localeCompare(`${right.resource}:${right.operation}`))
}

function normalizeExecution(value) {
  const execution = plainObject(value) ? value : {}
  return {
    adapterId: safeText(execution.adapterId, 240),
    actionId: safeText(execution.actionId, 240),
    location: EXECUTION_LOCATIONS.has(execution.location) ? execution.location : 'unknown',
  }
}

function normalizeIdempotency(value) {
  const idempotency = plainObject(value) ? value : {}
  return {
    mode: IDEMPOTENCY_MODES.has(idempotency.mode) ? idempotency.mode : 'none',
    keyScope: nonSecretText(idempotency.keyScope, '멱등 키 범위', 240),
    replay: REPLAY_POLICIES.has(idempotency.replay) ? idempotency.replay : 'reject',
  }
}

function normalizeVerification(value) {
  const verification = plainObject(value) ? value : {}
  const mode = VERIFICATION_MODES.has(verification.mode) ? verification.mode : 'none'
  return {
    required: verification.required === true,
    mode,
    adapterId: safeText(verification.adapterId, 240),
    successCriteria: uniqueTexts(verification.successCriteria, '검증 성공 조건'),
  }
}

function normalizeRecovery(value) {
  const recovery = plainObject(value) ? value : {}
  const retry = plainObject(recovery.retry) ? recovery.retry : {}
  return {
    mode: RECOVERY_MODES.has(recovery.mode) ? recovery.mode : 'unavailable',
    retry: {
      maxAttempts: boundedInteger(retry.maxAttempts, 1, 1, 10),
      backoff: BACKOFF_MODES.has(retry.backoff) ? retry.backoff : 'none',
    },
    rollbackOperationId: recovery.rollbackOperationId ? safeId(recovery.rollbackOperationId, '롤백 조작') : null,
    summary: nonSecretText(recovery.summary ?? recovery.note, '복구 설명', 500),
  }
}

function defaultSideEffect(access) {
  if (access === 'read') return 'none'
  if (access === 'write') return 'mutation'
  return 'external'
}

function defaultRisk(access) {
  if (access === 'read') return 'low'
  if (access === 'write') return 'high'
  return 'medium'
}

function assertExecutableOperation(operation) {
  if (!operation.allowedInitiators.length) {
    throw new OperationContractError('MISSING_OPERATION_INITIATOR', `${operation.id}에 허용된 시작 주체가 없습니다.`)
  }
  if (!operation.authorizationPolicyIds.length) {
    throw new OperationContractError('MISSING_OPERATION_POLICY', `${operation.id}에 권한 정책이 연결되지 않았습니다.`)
  }
  if (!operation.execution.adapterId || !operation.execution.actionId || operation.execution.location === 'unknown') {
    throw new OperationContractError('MISSING_EXECUTION_ADAPTER', `${operation.id}의 실행 어댑터가 완성되지 않았습니다.`)
  }
  if (operation.sideEffect !== 'none') {
    if (!['explicit', 'multi_party'].includes(operation.approval)) {
      throw new OperationContractError('UNSAFE_OPERATION_APPROVAL', `${operation.id}의 부작용 있는 실행은 명시적 승인이 필요합니다.`)
    }
    if (!operation.confirmation) {
      throw new OperationContractError('MISSING_OPERATION_CONFIRMATION', `${operation.id}의 승인 확인 문구가 없습니다.`)
    }
    if (!operation.writeSet.length) {
      throw new OperationContractError('MISSING_WRITE_SET', `${operation.id}의 쓰기 범위가 선언되지 않았습니다.`)
    }
    if (!operation.verification.required || operation.verification.mode === 'none') {
      throw new OperationContractError('MISSING_OPERATION_VERIFICATION', `${operation.id}의 실행 후 검증이 선언되지 않았습니다.`)
    }
  }
  if (operation.verification.required && (!operation.verification.adapterId || !operation.verification.successCriteria.length)) {
    throw new OperationContractError('INCOMPLETE_OPERATION_VERIFICATION', `${operation.id}의 검증 어댑터와 성공 조건이 필요합니다.`)
  }
  if (
    operation.verification.mode === 'independent'
    && operation.verification.adapterId === operation.execution.adapterId
  ) {
    throw new OperationContractError('VERIFIER_NOT_INDEPENDENT', `${operation.id}의 독립 검증기는 실행 어댑터와 달라야 합니다.`)
  }
  if (operation.recovery.retry.maxAttempts > 1 && operation.idempotency.mode === 'none') {
    throw new OperationContractError('UNSAFE_OPERATION_RETRY', `${operation.id}는 멱등성 없이 재시도할 수 없습니다.`)
  }
  if (operation.reversible && operation.recovery.mode === 'unavailable') {
    throw new OperationContractError('MISSING_OPERATION_RECOVERY', `${operation.id}는 복구 가능하다고 선언했지만 복구 방식이 없습니다.`)
  }
  if (operation.recovery.rollbackOperationId === operation.id) {
    throw new OperationContractError('CYCLIC_OPERATION_ROLLBACK', `${operation.id}가 자기 자신을 롤백 조작으로 참조합니다.`)
  }
}

export function normalizeOperationDefinition(value) {
  if (!plainObject(value)) throw new OperationContractError('INVALID_OPERATION', '조작 계약 형식이 올바르지 않습니다.')
  const access = ACCESS_LEVELS.has(value.access) ? value.access : 'execute'
  const allowedInitiators = uniqueIds(value.allowedInitiators, '조작 시작 주체')
  if (allowedInitiators.some((kind) => !OPERATION_INITIATOR_KINDS.includes(kind))) {
    throw new OperationContractError('INVALID_OPERATION_INITIATOR', '지원하지 않는 조작 시작 주체가 있습니다.')
  }
  const operation = {
    schemaVersion: OPERATION_CONTRACT_SCHEMA_VERSION,
    id: safeId(value.id, '조작'),
    capability: safeId(value.capability, '조작 능력'),
    label: nonSecretText(value.label, '조작 이름', 160),
    description: nonSecretText(value.description, '조작 설명', 500),
    availability: AVAILABILITY_LEVELS.has(value.availability) ? value.availability : 'declared',
    access,
    approval: APPROVAL_LEVELS.has(value.approval) ? value.approval : 'explicit',
    confirmation: nonSecretText(value.confirmation, '승인 확인 문구', 160),
    reversible: value.reversible === true,
    risk: RISK_LEVELS.has(value.risk) ? value.risk : defaultRisk(access),
    sideEffect: SIDE_EFFECT_LEVELS.has(value.sideEffect) ? value.sideEffect : defaultSideEffect(access),
    allowedInitiators,
    authorizationPolicyIds: uniqueIds(value.authorizationPolicyIds, '조작 권한 정책'),
    target: normalizeTarget(value.target),
    input: normalizeInput(value.input),
    writeSet: normalizeWriteSet(value.writeSet),
    excludes: uniqueTexts(value.excludes, '조작 제외 범위'),
    execution: normalizeExecution(value.execution),
    timeoutMs: boundedInteger(value.timeoutMs, 60_000, 1_000, 24 * 60 * 60 * 1000),
    idempotency: normalizeIdempotency(value.idempotency),
    verification: normalizeVerification(value.verification),
    recovery: normalizeRecovery(value.recovery),
    evidenceIds: uniqueIds(value.evidenceIds, '조작 근거'),
  }
  if (!operation.label) throw new OperationContractError('INCOMPLETE_OPERATION', '조작 이름이 없습니다.')
  if (operation.availability === 'executable') assertExecutableOperation(operation)
  return withFingerprint(operation)
}

function normalizeInitiator(value) {
  if (!plainObject(value) || !OPERATION_INITIATOR_KINDS.includes(value.kind)) {
    throw new OperationContractError('INVALID_OPERATION_INITIATOR', '조작을 시작한 주체가 올바르지 않습니다.')
  }
  return {
    kind: value.kind,
    principalId: safeId(value.principalId, '조작 시작 주체'),
    channel: nonSecretText(value.channel, '조작 시작 경로', 120),
  }
}

function normalizeScope(value) {
  const scope = plainObject(value) ? value : {}
  const result = {}
  for (const key of Object.keys(scope).sort().slice(0, 80)) {
    if (UNSAFE_KEYS.has(key)) throw new OperationContractError('INVALID_OPERATION_SCOPE', '조작 범위에 허용되지 않은 키가 있습니다.')
    const safeKey = safeText(key, 120)
    const raw = scope[key]
    if (typeof raw === 'boolean') result[safeKey] = raw
    else if (typeof raw === 'number' && Number.isFinite(raw)) result[safeKey] = raw
    else if (typeof raw === 'string') result[safeKey] = nonSecretText(raw, '조작 범위 값', 500)
    else if (Array.isArray(raw)) result[safeKey] = uniqueTexts(raw, '조작 범위 값', 40)
  }
  return result
}

export function createOperationPlan(definitionValue, request, {
  now = new Date(),
  ttlMs = 5 * 60 * 1000,
  nonce = '',
} = {}) {
  const definition = normalizeOperationDefinition(definitionValue)
  if (definition.availability !== 'executable') {
    throw new OperationContractError('OPERATION_NOT_EXECUTABLE', `${definition.id}는 아직 실행 가능한 조작이 아닙니다.`)
  }
  if (!plainObject(request)) throw new OperationContractError('INVALID_OPERATION_PLAN', '조작 계획 요청이 올바르지 않습니다.')
  const initiator = normalizeInitiator(request.initiator)
  if (!definition.allowedInitiators.includes(initiator.kind)) {
    throw new OperationContractError('OPERATION_INITIATOR_NOT_ALLOWED', `${initiator.kind} 주체는 ${definition.id}를 시작할 수 없습니다.`)
  }
  const issuedAt = safeTimestamp(now, '조작 계획 생성')
  const safeTtl = boundedInteger(ttlMs, 5 * 60 * 1000, 30_000, 15 * 60 * 1000)
  const base = {
    schemaVersion: OPERATION_CONTRACT_SCHEMA_VERSION,
    operationId: definition.id,
    capability: definition.capability,
    definitionFingerprint: definition.fingerprint,
    targetKey: nonSecretText(request.targetKey, '조작 대상 키', 300),
    twinRevision: nonSecretText(request.twinRevision, 'Asset 원장 리비전', 180),
    stateFingerprint: safeFingerprint(request.stateFingerprint, '대상 상태'),
    inputFingerprint: safeFingerprint(request.inputFingerprint, '조작 입력'),
    inputSummary: nonSecretText(request.inputSummary, '조작 입력 요약', 500),
    initiator,
    scope: normalizeScope(request.scope),
    risk: definition.risk,
    sideEffect: definition.sideEffect,
    approval: {
      mode: definition.approval,
      required: definition.approval !== 'none',
      confirmation: definition.confirmation,
    },
    writeSet: definition.writeSet,
    excludes: definition.excludes,
    execution: definition.execution,
    timeoutMs: definition.timeoutMs,
    idempotency: definition.idempotency,
    verification: definition.verification,
    recovery: definition.recovery,
    issuedAt,
    expiresAt: new Date(Date.parse(issuedAt) + safeTtl).toISOString(),
    nonce: nonSecretText(nonce || request.nonce, '조작 계획 nonce', 180),
  }
  if (!base.targetKey || !base.twinRevision || !base.nonce) {
    throw new OperationContractError('INCOMPLETE_OPERATION_PLAN', '조작 계획에는 대상, Asset 원장 리비전, 고유 nonce가 필요합니다.')
  }
  const fingerprint = digitalTwinReviewFingerprint(base)
  return deepFreeze({ ...base, id: `plan:${fingerprint}`, fingerprint })
}

export function verifyOperationPlan(plan, definitionValue, { now = new Date() } = {}) {
  if (!plainObject(plan) || plan.schemaVersion !== OPERATION_CONTRACT_SCHEMA_VERSION) {
    throw new OperationContractError('INVALID_OPERATION_PLAN', '조작 계획 버전이 올바르지 않습니다.')
  }
  const definition = normalizeOperationDefinition(definitionValue)
  const { id, fingerprint, ...base } = plan
  const expectedFingerprint = digitalTwinReviewFingerprint(base)
  if (fingerprint !== expectedFingerprint || id !== `plan:${expectedFingerprint}`) {
    throw new OperationContractError('OPERATION_PLAN_TAMPERED', '조작 계획이 변경되었거나 손상되었습니다.')
  }
  if (plan.operationId !== definition.id || plan.definitionFingerprint !== definition.fingerprint) {
    throw new OperationContractError('OPERATION_DEFINITION_CHANGED', '미리보기 이후 조작 계약이 달라졌습니다.')
  }
  const nowMs = Date.parse(now)
  const issuedAt = Date.parse(plan.issuedAt)
  const expiresAt = Date.parse(plan.expiresAt)
  if (!Number.isFinite(nowMs) || !Number.isFinite(issuedAt) || !Number.isFinite(expiresAt) || issuedAt > nowMs + 60_000) {
    throw new OperationContractError('INVALID_OPERATION_TIME', '조작 계획 시각을 신뢰할 수 없습니다.')
  }
  if (expiresAt <= nowMs) throw new OperationContractError('OPERATION_PLAN_EXPIRED', '조작 계획이 만료되었습니다.')
  return plan
}

function normalizeActor(value, requiredKind = null) {
  if (!plainObject(value) || !LIFECYCLE_ACTOR_KINDS.has(value.kind)) {
    throw new OperationContractError('INVALID_OPERATION_ACTOR', '조작 사건의 행위자가 올바르지 않습니다.')
  }
  if (requiredKind && value.kind !== requiredKind) {
    throw new OperationContractError('OPERATION_ACTOR_ROLE_MISMATCH', `${requiredKind} 역할만 이 사건을 기록할 수 있습니다.`)
  }
  return { kind: value.kind, principalId: safeId(value.principalId, '조작 행위자') }
}

function normalizeEventDetail(value) {
  if (value == null) return {}
  if (!plainObject(value)) throw new OperationContractError('INVALID_OPERATION_EVENT', '조작 사건 상세가 올바르지 않습니다.')
  const json = JSON.stringify(value)
  if (new TextEncoder().encode(json).length > MAXIMUM_EVENT_DETAIL_BYTES) {
    throw new OperationContractError('OPERATION_EVENT_TOO_LARGE', '조작 사건 상세가 허용 크기를 초과했습니다.')
  }
  const visit = (item) => {
    if (typeof item === 'string') {
      if (systemPartContainsSecretLiteral(item)) {
        throw new OperationContractError('SECRET_LITERAL_BLOCKED', '조작 감사 사건에는 실제 키나 토큰 값을 넣을 수 없습니다.')
      }
      return safeText(item, 1_000)
    }
    if (typeof item === 'number') return Number.isFinite(item) ? item : null
    if (typeof item === 'boolean' || item === null) return item
    if (Array.isArray(item)) return item.slice(0, 120).map(visit)
    if (!plainObject(item)) return null
    const result = {}
    for (const key of Object.keys(item).sort().slice(0, 120)) {
      if (UNSAFE_KEYS.has(key)) throw new OperationContractError('INVALID_OPERATION_EVENT', '조작 사건에 허용되지 않은 키가 있습니다.')
      result[safeText(key, 120)] = visit(item[key])
    }
    return result
  }
  return visit(value)
}

function appendEvent(run, { type, state, actor, at = new Date(), detail = {} }, updates = {}) {
  const previous = run.events.at(-1) ?? null
  const sequence = previous ? previous.sequence + 1 : 1
  const normalized = {
    sequence,
    type: safeId(type, '조작 사건'),
    state: OPERATION_RUN_STATES.includes(state) ? state : null,
    actor: normalizeActor(actor),
    occurredAt: safeTimestamp(at, '조작 사건'),
    detail: normalizeEventDetail(detail),
    previousFingerprint: previous?.fingerprint ?? null,
  }
  if (!normalized.state) throw new OperationContractError('INVALID_OPERATION_STATE', '조작 사건 상태가 올바르지 않습니다.')
  const event = withFingerprint(normalized)
  const next = {
    ...run,
    ...updates,
    state,
    updatedAt: event.occurredAt,
    events: [...run.events, event],
  }
  const { fingerprint: ignored, ...withoutFingerprint } = next
  return deepFreeze({ ...withoutFingerprint, fingerprint: digitalTwinReviewFingerprint(withoutFingerprint) })
}

function assertState(run, allowed, action) {
  if (!plainObject(run) || !Array.isArray(run.events) || !allowed.includes(run.state)) {
    throw new OperationContractError('INVALID_OPERATION_TRANSITION', `${run?.state ?? 'unknown'} 상태에서는 ${action}할 수 없습니다.`)
  }
}

export function createOperationRun(plan, { now = new Date() } = {}) {
  if (!plainObject(plan) || plan.schemaVersion !== OPERATION_CONTRACT_SCHEMA_VERSION || !plan.fingerprint) {
    throw new OperationContractError('INVALID_OPERATION_PLAN', '실행을 만들 조작 계획이 올바르지 않습니다.')
  }
  const { id: planId, fingerprint: planFingerprint, ...planBase } = plan
  const expectedPlanFingerprint = digitalTwinReviewFingerprint(planBase)
  if (planFingerprint !== expectedPlanFingerprint || planId !== `plan:${expectedPlanFingerprint}`) {
    throw new OperationContractError('OPERATION_PLAN_TAMPERED', '변경되거나 손상된 조작 계획으로 실행을 만들 수 없습니다.')
  }
  const createdAt = safeTimestamp(now, '조작 실행 생성')
  if (Date.parse(plan.expiresAt) <= Date.parse(createdAt)) {
    throw new OperationContractError('OPERATION_PLAN_EXPIRED', '만료된 조작 계획으로 실행을 만들 수 없습니다.')
  }
  const runKey = digitalTwinReviewFingerprint({ planId: plan.id, createdAt })
  const actorKind = {
    human_ui: 'human',
    deterministic_automation: 'automation',
    ai_agent: 'ai',
  }[plan.initiator.kind]
  let run = {
    schemaVersion: OPERATION_CONTRACT_SCHEMA_VERSION,
    id: `run:${runKey}`,
    planId: plan.id,
    operationId: plan.operationId,
    definitionFingerprint: plan.definitionFingerprint,
    targetKey: plan.targetKey,
    initiator: plan.initiator,
    risk: plan.risk,
    sideEffect: plan.sideEffect,
    approval: plan.approval,
    execution: plan.execution,
    verification: plan.verification,
    idempotency: plan.idempotency,
    recovery: plan.recovery,
    timeoutMs: plan.timeoutMs,
    attempt: 0,
    executorPrincipalId: null,
    cancellationRequested: false,
    state: 'planned',
    createdAt,
    updatedAt: createdAt,
    events: [],
  }
  run = appendEvent(run, {
    type: 'plan_created',
    state: 'planned',
    actor: { kind: actorKind, principalId: plan.initiator.principalId },
    at: createdAt,
    detail: { planId: plan.id, definitionFingerprint: plan.definitionFingerprint },
  })
  if (plan.approval.required) {
    return appendEvent(run, {
      type: 'approval_requested',
      state: 'awaiting_approval',
      actor: { kind: 'control_plane', principalId: 'operation-control-plane' },
      at: createdAt,
      detail: { mode: plan.approval.mode },
    })
  }
  return appendEvent(run, {
    type: 'approval_not_required',
    state: 'approved',
    actor: { kind: 'control_plane', principalId: 'operation-control-plane' },
    at: createdAt,
    detail: { mode: 'none' },
  })
}

export function recordOperationApproval(run, {
  decision,
  actor,
  confirmation = '',
  at = new Date(),
  reason = '',
} = {}) {
  assertState(run, ['awaiting_approval'], '승인 결정')
  const approver = normalizeActor(actor, 'human')
  if (run.approval.mode === 'multi_party') {
    throw new OperationContractError('MULTI_PARTY_APPROVAL_REQUIRED', '다자 승인은 전용 승인 집계 계약이 구현되기 전에는 실행할 수 없습니다.')
  }
  if (!['approved', 'rejected'].includes(decision)) {
    throw new OperationContractError('INVALID_APPROVAL_DECISION', '승인 또는 거절 결정을 선택해야 합니다.')
  }
  if (decision === 'approved' && run.approval.mode === 'explicit' && confirmation !== run.approval.confirmation) {
    throw new OperationContractError('OPERATION_CONFIRMATION_REQUIRED', '미리보기에서 요구한 확인 문구가 필요합니다.')
  }
  return appendEvent(run, {
    type: decision === 'approved' ? 'approved' : 'rejected',
    state: decision,
    actor: approver,
    at,
    detail: { reason: nonSecretText(reason, '승인 결정 사유', 500) },
  })
}

export function queueOperationRun(run, { actor, at = new Date() } = {}) {
  assertState(run, ['approved'], '실행 대기열 등록')
  return appendEvent(run, {
    type: 'queued',
    state: 'queued',
    actor: normalizeActor(actor, 'control_plane'),
    at,
    detail: { idempotencyMode: run.idempotency.mode },
  })
}

export function startOperationRun(run, { actor, at = new Date() } = {}) {
  assertState(run, ['queued'], '실행 시작')
  if (run.attempt >= run.recovery.retry.maxAttempts) {
    throw new OperationContractError('OPERATION_ATTEMPT_LIMIT', '허용된 실행 횟수를 모두 사용했습니다.')
  }
  const executor = normalizeActor(actor, 'execution_adapter')
  return appendEvent(run, {
    type: 'execution_started',
    state: 'running',
    actor: executor,
    at,
    detail: { attempt: run.attempt + 1 },
  }, {
    attempt: run.attempt + 1,
    executorPrincipalId: executor.principalId,
    cancellationRequested: false,
  })
}

export function completeOperationExecution(run, { actor, at = new Date(), resultFingerprint, summary = '' } = {}) {
  assertState(run, ['running'], '실행 완료')
  const executor = normalizeActor(actor, 'execution_adapter')
  if (executor.principalId !== run.executorPrincipalId) {
    throw new OperationContractError('OPERATION_EXECUTOR_MISMATCH', '실행을 시작한 어댑터만 실행 결과를 제출할 수 있습니다.')
  }
  const detail = {
    resultFingerprint: safeFingerprint(resultFingerprint, '실행 결과'),
    summary: nonSecretText(summary, '실행 결과 요약', 500),
  }
  if (run.verification.required) {
    return appendEvent(run, { type: 'execution_completed', state: 'verifying', actor: executor, at, detail })
  }
  return appendEvent(run, { type: 'execution_succeeded', state: 'succeeded', actor: executor, at, detail })
}

export function completeOperationVerification(run, {
  actor,
  succeeded,
  at = new Date(),
  evidenceFingerprint,
  summary = '',
} = {}) {
  assertState(run, ['verifying'], '실행 결과 검증')
  const verifier = normalizeActor(actor, 'verifier')
  if (run.verification.mode === 'independent' && verifier.principalId === run.executorPrincipalId) {
    throw new OperationContractError('VERIFIER_NOT_INDEPENDENT', '실행자가 자신의 실행 결과를 독립 검증할 수 없습니다.')
  }
  const state = succeeded === true ? 'succeeded' : 'failed'
  return appendEvent(run, {
    type: succeeded === true ? 'verification_succeeded' : 'verification_failed',
    state,
    actor: verifier,
    at,
    detail: {
      evidenceFingerprint: safeFingerprint(evidenceFingerprint, '검증 근거'),
      summary: nonSecretText(summary, '검증 결과 요약', 500),
    },
  })
}

export function failOperationRun(run, { actor, at = new Date(), code = 'OPERATION_FAILED', summary = '' } = {}) {
  assertState(run, ['queued', 'running', 'verifying'], '실패 기록')
  return appendEvent(run, {
    type: 'failed',
    state: 'failed',
    actor: normalizeActor(actor),
    at,
    detail: {
      code: safeId(code, '실패 코드'),
      summary: nonSecretText(summary, '실패 요약', 500),
    },
  })
}

export function requestOperationCancellation(run, { actor, at = new Date(), reason = '' } = {}) {
  assertState(run, ['awaiting_approval', 'approved', 'queued', 'running', 'verifying'], '중지 요청')
  const requester = normalizeActor(actor)
  const detail = { reason: nonSecretText(reason, '중지 사유', 500) }
  if (['running', 'verifying'].includes(run.state)) {
    return appendEvent(run, {
      type: 'cancellation_requested',
      state: run.state,
      actor: requester,
      at,
      detail,
    }, { cancellationRequested: true })
  }
  return appendEvent(run, { type: 'cancelled', state: 'cancelled', actor: requester, at, detail })
}

export function acknowledgeOperationCancellation(run, { actor, at = new Date(), summary = '' } = {}) {
  assertState(run, ['running', 'verifying'], '중지 확인')
  if (!run.cancellationRequested) {
    throw new OperationContractError('CANCELLATION_NOT_REQUESTED', '먼저 실행 중지 요청을 기록해야 합니다.')
  }
  const expectedKind = run.state === 'running' ? 'execution_adapter' : 'verifier'
  return appendEvent(run, {
    type: 'cancelled',
    state: 'cancelled',
    actor: normalizeActor(actor, expectedKind),
    at,
    detail: { summary: nonSecretText(summary, '중지 결과', 500) },
  })
}

export function retryOperationRun(run, { actor, at = new Date(), reason = '' } = {}) {
  assertState(run, ['failed'], '재시도')
  if (run.attempt >= run.recovery.retry.maxAttempts) {
    throw new OperationContractError('OPERATION_ATTEMPT_LIMIT', '허용된 실행 횟수를 모두 사용했습니다.')
  }
  if (run.idempotency.mode === 'none') {
    throw new OperationContractError('UNSAFE_OPERATION_RETRY', '멱등성이 없는 조작은 자동으로 재시도할 수 없습니다.')
  }
  return appendEvent(run, {
    type: 'retry_queued',
    state: 'queued',
    actor: normalizeActor(actor, 'control_plane'),
    at,
    detail: { reason: nonSecretText(reason, '재시도 사유', 500), nextAttempt: run.attempt + 1 },
  })
}

export function requestOperationRecovery(run, { actor, at = new Date(), reason = '' } = {}) {
  assertState(run, ['failed'], '복구 요청')
  if (run.recovery.mode === 'unavailable' || run.recovery.mode === 'append_only') {
    throw new OperationContractError('OPERATION_RECOVERY_UNAVAILABLE', '이 조작은 실행 복구를 지원하지 않습니다.')
  }
  return appendEvent(run, {
    type: 'recovery_requested',
    state: 'recovery_pending',
    actor: normalizeActor(actor, run.recovery.mode === 'manual' ? 'human' : null),
    at,
    detail: { reason: nonSecretText(reason, '복구 사유', 500) },
  })
}

export function startOperationRecovery(run, { actor, at = new Date() } = {}) {
  assertState(run, ['recovery_pending'], '복구 시작')
  return appendEvent(run, {
    type: 'recovery_started',
    state: 'recovering',
    actor: normalizeActor(actor, 'recovery_adapter'),
    at,
    detail: { rollbackOperationId: run.recovery.rollbackOperationId },
  })
}

export function completeOperationRecovery(run, {
  actor,
  succeeded,
  at = new Date(),
  evidenceFingerprint,
  summary = '',
} = {}) {
  assertState(run, ['recovering'], '복구 완료')
  const state = succeeded === true ? 'recovered' : 'recovery_failed'
  return appendEvent(run, {
    type: succeeded === true ? 'recovery_succeeded' : 'recovery_failed',
    state,
    actor: normalizeActor(actor, 'recovery_adapter'),
    at,
    detail: {
      evidenceFingerprint: safeFingerprint(evidenceFingerprint, '복구 근거'),
      summary: nonSecretText(summary, '복구 결과', 500),
    },
  })
}

export function operationRunIsActive(run) {
  return ACTIVE_STATES.has(run?.state)
}

export function operationRunIsTerminal(run) {
  return TERMINAL_STATES.has(run?.state)
}

export function verifyOperationEventChain(run) {
  if (!plainObject(run) || !Array.isArray(run.events) || !run.events.length) {
    throw new OperationContractError('INVALID_OPERATION_EVENT_CHAIN', '검증할 조작 감사 사건이 없습니다.')
  }
  let previousFingerprint = null
  for (let index = 0; index < run.events.length; index += 1) {
    const event = run.events[index]
    const { fingerprint, ...base } = event
    if (
      event.sequence !== index + 1
      || event.previousFingerprint !== previousFingerprint
      || digitalTwinReviewFingerprint(base) !== fingerprint
    ) {
      throw new OperationContractError('OPERATION_EVENT_CHAIN_TAMPERED', '조작 감사 사건 사슬이 변경되었거나 순서가 손상되었습니다.')
    }
    previousFingerprint = fingerprint
  }
  if (run.events.at(-1).state !== run.state) {
    throw new OperationContractError('OPERATION_EVENT_CHAIN_TAMPERED', '마지막 감사 사건과 현재 조작 상태가 일치하지 않습니다.')
  }
  const { fingerprint, ...base } = run
  if (digitalTwinReviewFingerprint(base) !== fingerprint) {
    throw new OperationContractError('OPERATION_EVENT_CHAIN_TAMPERED', '조작 실행 기록의 지문이 현재 사건 사슬과 일치하지 않습니다.')
  }
  return true
}
