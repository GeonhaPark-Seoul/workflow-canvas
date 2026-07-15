import {
  DIGITAL_TWIN_REVIEW_SCHEMA_VERSION,
  digitalTwinReviewFingerprint,
} from './digitalTwinReview.js'

export const TWIN_ADAPTER_CONTRACT_VERSION = 1
export const TWIN_ENGINE_SCHEMA_VERSION = 1

const REQUIRED_INTERFACES = ['describe', 'canInspect', 'inspect']
const INTERFACE_IDS = new Set([
  ...REQUIRED_INTERFACES,
  'discover',
  'normalize',
  'reconcile',
  'planOperation',
  'executeOperation',
  'verifyOperation',
  'rollbackOperation',
  'redact',
  'migrate',
])
const ACCESS_IDS = new Set(['read', 'write', 'execute'])
const SENSITIVITY_IDS = new Set(['public', 'internal', 'sensitive', 'secret_reference'])
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/
const SAFE_FINGERPRINT = /^[a-f0-9]{16,128}$/i
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export class TwinAdapterContractError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'TwinAdapterContractError'
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

function adapterId(value, label = '어댑터') {
  const id = safeText(value, 160)
  if (!SAFE_ID.test(id) || UNSAFE_KEYS.has(id)) {
    throw new TwinAdapterContractError('INVALID_ADAPTER_ID', `${label} 식별자가 올바르지 않습니다.`)
  }
  return id
}

function positiveInteger(value, label) {
  const number = Number(value)
  if (!Number.isInteger(number) || number < 1) {
    throw new TwinAdapterContractError('INVALID_VERSION', `${label} 버전이 올바르지 않습니다.`)
  }
  return number
}

function uniqueIds(value, label, allowed = null, maximum = 60) {
  const result = []
  const seen = new Set()
  for (const item of Array.isArray(value) ? value.slice(0, maximum) : []) {
    const id = adapterId(item, label)
    if (allowed && !allowed.has(id)) {
      throw new TwinAdapterContractError('UNSUPPORTED_INTERFACE', `${label} ${id}는 현재 계약에서 지원하지 않습니다.`)
    }
    if (!seen.has(id)) {
      seen.add(id)
      result.push(id)
    }
  }
  return result.sort()
}

function normalizeDataClasses(value) {
  const result = []
  const seen = new Set()
  for (const item of Array.isArray(value) ? value.slice(0, 40) : []) {
    if (!plainObject(item)) throw new TwinAdapterContractError('INVALID_DATA_CLASS', '어댑터 데이터 범위가 올바르지 않습니다.')
    const id = adapterId(item.id, '데이터 종류')
    if (seen.has(id)) throw new TwinAdapterContractError('DUPLICATE_DATA_CLASS', `데이터 종류 ${id}가 중복되었습니다.`)
    seen.add(id)
    result.push({
      id,
      label: safeText(item.label, 120) || id,
      description: safeText(item.description, 360),
      sensitivity: SENSITIVITY_IDS.has(item.sensitivity) ? item.sensitivity : 'internal',
      leavesSource: item.leavesSource === true,
      includesContent: item.includesContent === true,
    })
  }
  return result.sort((left, right) => left.id.localeCompare(right.id))
}

function normalizePermissions(value) {
  const result = []
  const seen = new Set()
  for (const item of Array.isArray(value) ? value.slice(0, 40) : []) {
    if (!plainObject(item)) throw new TwinAdapterContractError('INVALID_PERMISSION', '어댑터 권한 정보가 올바르지 않습니다.')
    const id = adapterId(item.id, '권한')
    if (seen.has(id)) throw new TwinAdapterContractError('DUPLICATE_PERMISSION', `권한 ${id}가 중복되었습니다.`)
    if (!ACCESS_IDS.has(item.access)) throw new TwinAdapterContractError('INVALID_PERMISSION_ACCESS', `권한 ${id}의 접근 종류가 올바르지 않습니다.`)
    seen.add(id)
    result.push({
      id,
      label: safeText(item.label, 120) || id,
      access: item.access,
      scope: safeText(item.scope, 240),
      required: item.required !== false,
      reason: safeText(item.reason, 360),
    })
  }
  return result.sort((left, right) => left.id.localeCompare(right.id))
}

function cloneSerializable(value) {
  try {
    return structuredClone(value)
  } catch {
    try {
      return JSON.parse(JSON.stringify(value))
    } catch {
      throw new TwinAdapterContractError('CANVAS_NOT_SERIALIZABLE', '검사할 캔버스 스냅샷을 안전하게 복제할 수 없습니다.')
    }
  }
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object' || seen.has(value)) return value
  seen.add(value)
  for (const item of Object.values(value)) deepFreeze(item, seen)
  return Object.freeze(value)
}

export function createTwinAdapterDescriptor(value) {
  if (!plainObject(value)) throw new TwinAdapterContractError('INVALID_DESCRIPTOR', '트윈 어댑터 설명서가 없습니다.')
  const contractVersion = positiveInteger(value.contractVersion, '어댑터 계약')
  if (contractVersion !== TWIN_ADAPTER_CONTRACT_VERSION) {
    throw new TwinAdapterContractError('CONTRACT_VERSION_MISMATCH', `어댑터 계약 v${contractVersion}은 현재 엔진에서 지원하지 않습니다.`)
  }
  const minimumEngineSchemaVersion = positiveInteger(value.minimumEngineSchemaVersion, '최소 엔진 스키마')
  const maximumEngineSchemaVersion = positiveInteger(value.maximumEngineSchemaVersion, '최대 엔진 스키마')
  if (
    minimumEngineSchemaVersion > maximumEngineSchemaVersion
    || TWIN_ENGINE_SCHEMA_VERSION < minimumEngineSchemaVersion
    || TWIN_ENGINE_SCHEMA_VERSION > maximumEngineSchemaVersion
  ) {
    throw new TwinAdapterContractError('ENGINE_SCHEMA_INCOMPATIBLE', '트윈 어댑터와 현재 엔진 스키마 버전이 호환되지 않습니다.')
  }
  const interfaces = uniqueIds(value.interfaces, '인터페이스', INTERFACE_IDS)
  for (const required of REQUIRED_INTERFACES) {
    if (!interfaces.includes(required)) {
      throw new TwinAdapterContractError('MISSING_INTERFACE', `트윈 어댑터에 필수 인터페이스 ${required}가 없습니다.`)
    }
  }
  const descriptor = {
    id: adapterId(value.id),
    contractVersion,
    adapterVersion: safeText(value.adapterVersion, 80),
    minimumEngineSchemaVersion,
    maximumEngineSchemaVersion,
    label: safeText(value.label, 160),
    description: safeText(value.description, 500),
    systemKinds: uniqueIds(value.systemKinds, '시스템 종류'),
    interfaces,
    features: uniqueIds(value.features, '기능'),
    dataClasses: normalizeDataClasses(value.dataClasses),
    permissions: normalizePermissions(value.permissions),
    operationCapabilities: uniqueIds(value.operationCapabilities, '조작 능력'),
  }
  if (!descriptor.adapterVersion || !descriptor.label || !descriptor.systemKinds.length) {
    throw new TwinAdapterContractError('INCOMPLETE_DESCRIPTOR', '어댑터 버전, 이름, 지원 시스템 종류를 모두 선언해야 합니다.')
  }
  return deepFreeze({
    ...descriptor,
    fingerprint: digitalTwinReviewFingerprint(descriptor),
  })
}

export function createTwinAdapterRegistration({ descriptor, canInspect, load }) {
  const normalizedDescriptor = createTwinAdapterDescriptor(descriptor)
  if (typeof canInspect !== 'function' || typeof load !== 'function') {
    throw new TwinAdapterContractError('INVALID_REGISTRATION', '트윈 어댑터 등록에는 검사 대상 판별기와 지연 로더가 필요합니다.')
  }
  return Object.freeze({
    id: normalizedDescriptor.id,
    descriptor: normalizedDescriptor,
    canInspect,
    load,
  })
}

function validateLoadedAdapter(adapter, registration) {
  if (!plainObject(adapter)) throw new TwinAdapterContractError('ADAPTER_LOAD_FAILED', `어댑터 ${registration.id} 모듈을 불러오지 못했습니다.`)
  for (const method of registration.descriptor.interfaces) {
    if (typeof adapter[method] !== 'function') {
      throw new TwinAdapterContractError('MISSING_ADAPTER_METHOD', `어댑터 ${registration.id}에 선언된 ${method} 함수가 없습니다.`)
    }
  }
  const described = createTwinAdapterDescriptor(adapter.describe())
  if (described.id !== registration.id || described.fingerprint !== registration.descriptor.fingerprint) {
    throw new TwinAdapterContractError('ADAPTER_DESCRIPTOR_CHANGED', `등록된 어댑터 ${registration.id}의 설명서와 실행 모듈이 일치하지 않습니다.`)
  }
  return adapter
}

export function validateTwinAdapterReview(review, descriptor) {
  if (!plainObject(review) || review.schemaVersion !== DIGITAL_TWIN_REVIEW_SCHEMA_VERSION) {
    throw new TwinAdapterContractError('INVALID_REVIEW', '어댑터가 지원되는 검토 결과를 반환하지 않았습니다.')
  }
  if (!plainObject(review.source) || review.source.adapterId !== descriptor.id) {
    throw new TwinAdapterContractError('REVIEW_ADAPTER_MISMATCH', '검토 결과의 어댑터 식별자가 실행한 어댑터와 다릅니다.')
  }
  if (
    review.source.adapterContractVersion !== descriptor.contractVersion
    || review.source.adapterVersion !== descriptor.adapterVersion
    || review.source.engineSchemaVersion !== TWIN_ENGINE_SCHEMA_VERSION
  ) {
    throw new TwinAdapterContractError('REVIEW_VERSION_MISMATCH', '검토 결과의 엔진 또는 어댑터 버전 정보가 현재 계약과 다릅니다.')
  }
  const sourceId = safeText(review.source.id, 240)
  if (!SAFE_ID.test(sourceId)) throw new TwinAdapterContractError('INVALID_REVIEW_SOURCE', '검토 결과 출처 식별자가 올바르지 않습니다.')
  if (!Array.isArray(review.items)) throw new TwinAdapterContractError('INVALID_REVIEW_ITEMS', '검토 결과 항목 목록이 없습니다.')
  const itemIds = new Set()
  for (const item of review.items) {
    if (
      !plainObject(item)
      || item.sourceId !== sourceId
      || typeof item.id !== 'string'
      || !item.id.startsWith(`${sourceId}::`)
      || !SAFE_FINGERPRINT.test(item.fingerprint ?? '')
    ) {
      throw new TwinAdapterContractError('INVALID_REVIEW_ITEM', '어댑터 검토 항목의 출처 또는 지문이 올바르지 않습니다.')
    }
    if (itemIds.has(item.id)) throw new TwinAdapterContractError('DUPLICATE_REVIEW_ITEM', `검토 항목 ${item.id}가 중복되었습니다.`)
    itemIds.add(item.id)
  }
  return review
}

export function createTwinAdapterRegistry(registrations) {
  const normalized = (Array.isArray(registrations) ? registrations : []).map((registration) => (
    createTwinAdapterRegistration(registration)
  ))
  const ids = normalized.map((registration) => registration.id)
  if (new Set(ids).size !== ids.length) {
    throw new TwinAdapterContractError('DUPLICATE_ADAPTER', '같은 식별자의 트윈 어댑터를 두 번 등록할 수 없습니다.')
  }
  const frozenRegistrations = Object.freeze(normalized)
  const descriptors = Object.freeze(normalized.map((registration) => registration.descriptor))
  return Object.freeze({
    registrations: frozenRegistrations,
    descriptors,
    async inspect(canvas) {
      const snapshot = deepFreeze(cloneSerializable(canvas))
      const registration = frozenRegistrations.find((candidate) => candidate.canInspect(snapshot))
      if (!registration) return null
      const adapter = validateLoadedAdapter(await registration.load(), registration)
      if (!adapter.canInspect(snapshot)) {
        throw new TwinAdapterContractError('ADAPTER_SCOPE_MISMATCH', `어댑터 ${registration.id}가 등록 판별 결과를 확인하지 못했습니다.`)
      }
      const review = await adapter.inspect(snapshot)
      return validateTwinAdapterReview(review, registration.descriptor)
    },
  })
}
