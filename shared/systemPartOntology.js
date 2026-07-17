import {
  normalizeWorkDefinition,
  validateWorkDefinition,
} from './workOntology.js'

export const SYSTEM_PART_KIND_DEFS = Object.freeze([
  { id: 'code', label: '코드', icon: '</>', color: '#14b8a6' },
  { id: 'capability', label: '세부 기능', icon: '◆', color: '#16a34a' },
  { id: 'trigger', label: '트리거', icon: '▶', color: '#f97316' },
  { id: 'condition', label: '조건', icon: '◇', color: '#eab308' },
  { id: 'input', label: '입력', icon: '→', color: '#3b82f6' },
  { id: 'output', label: '출력', icon: '←', color: '#22c55e' },
  { id: 'owner', label: '담당자', icon: '◎', color: '#ec4899' },
  { id: 'connection', label: '연결', icon: '↔', color: '#06b6d4' },
  { id: 'view', label: '보기', icon: '▤', color: '#38bdf8' },
  { id: 'credential_ref', label: '키 참조', icon: '✦', color: '#a855f7' },
  { id: 'work', label: 'Work', icon: '▷', color: '#4f9cf9' },
])

export const SYSTEM_PART_EXPOSURE_DEFS = Object.freeze([
  { id: 'public', label: '공개' },
  { id: 'internal', label: '내부' },
  { id: 'secret_reference', label: '비밀 참조' },
])

export const SYSTEM_PART_SOURCE_DEFS = Object.freeze([
  { id: 'manual', label: '수동' },
  { id: 'code', label: '코드' },
  { id: 'connector', label: '커넥터' },
  { id: 'runtime', label: '실행 기록' },
])

const KIND_BY_ID = new Map(SYSTEM_PART_KIND_DEFS.map((item) => [item.id, item]))
const EXPOSURE_IDS = new Set(SYSTEM_PART_EXPOSURE_DEFS.map((item) => item.id))
const SOURCE_IDS = new Set(SYSTEM_PART_SOURCE_DEFS.map((item) => item.id))
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/
const FINGERPRINT = /^[a-f0-9]{8,80}$/i
const SECRET_LITERAL_PATTERNS = [
  /^eyJ[a-zA-Z0-9_-]{16,}\.[a-zA-Z0-9_-]{8,}/,
  /^(?:sk|pk|ghp|github_pat|xox[baprs])[-_][a-zA-Z0-9_-]{12,}$/i,
  /^sb_(?:publishable|secret)_[a-zA-Z0-9_-]{12,}$/i,
  /^(?:AKIA|ASIA)[A-Z0-9]{16}$/,
  /^AIza[a-zA-Z0-9_-]{20,}$/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
]

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function plainText(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
}

function normalizedId(value) {
  const id = plainText(value, 120)
  return SAFE_ID.test(id) ? id : ''
}

export function normalizeDigitalTwinBinding(value) {
  if (!plainObject(value)) return undefined
  const sourceId = plainText(value.sourceId, 160)
  const entityKey = plainText(value.entityKey, 300)
  const observedFingerprint = plainText(value.observedFingerprint, 80)
  if (!sourceId || !entityKey || !FINGERPRINT.test(observedFingerprint)) return undefined
  return {
    schemaVersion: 1,
    sourceId,
    entityKey,
    observedFingerprint,
    observedSnapshotId: plainText(value.observedSnapshotId, 180),
    proposalId: plainText(value.proposalId, 360),
    itemId: plainText(value.itemId, 360),
    itemFingerprint: plainText(value.itemFingerprint, 80),
  }
}

export function systemPartKindDefinition(id) {
  return KIND_BY_ID.get(id) ?? KIND_BY_ID.get('connection')
}

export function systemPartContainsSecretLiteral(value) {
  if (typeof value !== 'string') return false
  const text = value.trim()
  const candidates = [text, ...text.split(/[\s'"`=,:;()[\]{}]+/).filter(Boolean)]
    .map((candidate) => candidate.replace(/^[<>]+|[.!?<>]+$/g, ''))
  return candidates.some((candidate) => SECRET_LITERAL_PATTERNS.some((pattern) => pattern.test(candidate)))
}

export function validateSystemPartInput(value) {
  if (!plainObject(value)) return '파츠 정보가 올바르지 않습니다.'
  if (!normalizedId(value.id)) return '파츠 식별자가 올바르지 않습니다.'
  if (!plainText(value.label, 120)) return '파츠 이름을 입력해 주세요.'
  for (const field of ['label', 'ref', 'evidenceRef']) {
    if (systemPartContainsSecretLiteral(value[field])) {
      return '실제 키나 토큰 값 대신 참조 이름만 입력해 주세요.'
    }
  }
  if (value.kind === 'work') {
    const workError = validateWorkDefinition(value.work)
    if (workError) return workError
    const work = normalizeWorkDefinition(value.work)
    for (const field of ['executor', 'input', 'process', 'output', 'successCriteria']) {
      if (systemPartContainsSecretLiteral(work[field])) {
        return 'Work 설명에는 실제 키나 토큰 값을 입력할 수 없습니다.'
      }
    }
  }
  return null
}

export function normalizeSystemPart(value) {
  if (validateSystemPartInput(value)) return null
  const kind = KIND_BY_ID.has(value.kind) ? value.kind : 'connection'
  const exposure = EXPOSURE_IDS.has(value.exposure) ? value.exposure : 'internal'
  const sourceKind = SOURCE_IDS.has(value.sourceKind) ? value.sourceKind : 'manual'
  const normalized = {
    id: normalizedId(value.id),
    kind,
    label: plainText(value.label, 120),
    ref: plainText(value.ref, 240),
    exposure,
    sourceKind,
    evidenceRef: plainText(value.evidenceRef, 500),
  }
  const digitalTwinBinding = normalizeDigitalTwinBinding(value.digitalTwinBinding)
  if (digitalTwinBinding) normalized.digitalTwinBinding = digitalTwinBinding
  if (kind === 'work') normalized.work = normalizeWorkDefinition(value.work)
  return normalized
}

export function normalizeSystemParts(value) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const normalized = []
  for (const raw of value.slice(0, 40)) {
    const part = normalizeSystemPart(raw)
    if (!part || seen.has(part.id)) continue
    seen.add(part.id)
    normalized.push(part)
  }
  return normalized
}

export function detachSystemPartBindings(value) {
  return normalizeSystemParts(value).map(({ digitalTwinBinding, ...part }) => part)
}
