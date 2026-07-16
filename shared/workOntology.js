import {
  intentKindDefinition,
  intentVersionState,
  normalizeIntentNodeData,
} from './intentOntology.js'

export const WORK_SCHEMA_VERSION = 1
export const MAX_WORK_INTENT_BINDINGS = 16

export const WORK_TRIGGER_DEFS = Object.freeze([
  { id: 'manual', label: '수동' },
  { id: 'event', label: '이벤트' },
  { id: 'schedule', label: '예약' },
  { id: 'ai', label: 'AI 요청' },
])

const TRIGGER_IDS = new Set(WORK_TRIGGER_DEFS.map((item) => item.id))
const SAFE_REF = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,239}$/

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function plainText(value, maxLength) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maxLength)
    : ''
}

export function normalizeWorkIntentBinding(value) {
  if (!plainObject(value)) return null
  const intentNodeId = plainText(value.intentNodeId, 240)
  const version = Number.isInteger(value.version) && value.version > 0 ? value.version : 0
  if (!SAFE_REF.test(intentNodeId) || !version) return null
  return {
    schemaVersion: 1,
    intentNodeId,
    version,
    label: plainText(value.label, 180) || 'Intent',
    intentKind: intentKindDefinition(value.intentKind).id,
    clauseCount: Number.isInteger(value.clauseCount)
      ? Math.max(0, Math.min(value.clauseCount, 120))
      : 0,
  }
}

export function normalizeWorkIntentBindings(value) {
  const byIntent = new Map()
  for (const item of Array.isArray(value) ? value.slice(0, MAX_WORK_INTENT_BINDINGS * 2) : []) {
    const normalized = normalizeWorkIntentBinding(item)
    if (normalized) byIntent.set(normalized.intentNodeId, normalized)
  }
  return [...byIntent.values()].slice(0, MAX_WORK_INTENT_BINDINGS)
}

export function createWorkDefinition() {
  return {
    schemaVersion: WORK_SCHEMA_VERSION,
    trigger: 'manual',
    executor: '',
    input: '',
    process: '',
    output: '',
    successCriteria: '',
    intentBindings: [],
  }
}

export function normalizeWorkDefinition(value) {
  const source = plainObject(value) ? value : {}
  return {
    schemaVersion: WORK_SCHEMA_VERSION,
    trigger: TRIGGER_IDS.has(source.trigger) ? source.trigger : 'manual',
    executor: plainText(source.executor, 180),
    input: plainText(source.input, 600),
    process: plainText(source.process, 1200),
    output: plainText(source.output, 600),
    successCriteria: plainText(source.successCriteria, 600),
    intentBindings: normalizeWorkIntentBindings(source.intentBindings),
  }
}

export function validateWorkDefinition(value) {
  if (!plainObject(value)) return 'Work 정의가 없습니다.'
  const work = normalizeWorkDefinition(value)
  if (!work.input) return 'Work에는 투입이 필요합니다.'
  if (!work.process) return 'Work에는 처리 과정이 필요합니다.'
  if (!work.output) return 'Work에는 결과가 필요합니다.'
  return null
}

export function workIntentOptionFromNode(node) {
  if (node?.type !== 'intent') return null
  const data = normalizeIntentNodeData(node.data)
  const latest = data.intentVersions.at(-1) ?? null
  const version = intentVersionState(data)
  return {
    nodeId: node.id,
    label: latest ? (latest.label || 'Intent') : (data.label || 'Intent'),
    statement: latest ? latest.statement : (data.statement || ''),
    intentKind: latest ? latest.intentKind : data.intentKind,
    intentStatus: latest ? latest.intentStatus : data.intentStatus,
    version: latest?.version ?? 0,
    dirty: version.dirty,
    clauseCount: Array.isArray(latest?.intentClauses) ? latest.intentClauses.length : 0,
  }
}

export function workIntentBindingFromNode(node) {
  const option = workIntentOptionFromNode(node)
  if (!option?.version) return null
  return normalizeWorkIntentBinding({
    intentNodeId: option.nodeId,
    version: option.version,
    label: option.label,
    intentKind: option.intentKind,
    clauseCount: option.clauseCount,
  })
}
