export const INTENT_SCHEMA_VERSION = 1
export const MAX_INTENT_VERSIONS = 25
export const MAX_INTENT_SOURCES = 10
export const MAX_INTENT_CLAUSES = 80

export const INTENT_KIND_DEFS = Object.freeze([
  { id: 'intent', label: '의도', color: '#ef6c8f' },
  { id: 'goal', label: '목표', color: '#22c55e' },
  { id: 'principle', label: '원칙', color: '#06b6d4' },
  { id: 'strategy', label: '전략', color: '#f59e0b' },
  { id: 'decision', label: '결정', color: '#3b82f6' },
  { id: 'plan', label: '계획', color: '#14b8a6' },
  { id: 'requirement', label: '요구사항', color: '#ef4444' },
])

export const INTENT_STATUS_DEFS = Object.freeze([
  { id: 'draft', label: '초안', color: '#94a3b8' },
  { id: 'active', label: '유효', color: '#22c55e' },
  { id: 'superseded', label: '대체됨', color: '#f59e0b' },
  { id: 'archived', label: '보관', color: '#64748b' },
])

export const INTENT_SOURCE_KIND_DEFS = Object.freeze([
  { id: 'meeting', label: '전략회의' },
  { id: 'ai_conversation', label: 'AI 대화' },
  { id: 'document', label: '문서' },
  { id: 'summary', label: '요약본' },
  { id: 'manual', label: '직접 작성' },
])

export const INTENT_CLAUSE_KIND_DEFS = Object.freeze([
  { id: 'purpose', label: '목적' },
  { id: 'direction', label: '방향' },
  { id: 'requirement', label: '준수' },
  { id: 'prohibition', label: '금지' },
  { id: 'success', label: '성공 기준' },
  { id: 'priority', label: '우선순위' },
  { id: 'exception', label: '예외' },
  { id: 'decision', label: '결정' },
  { id: 'assumption', label: '가정' },
  { id: 'question', label: '미결 질문' },
])

export const INTENT_CLAUSE_STATUS_DEFS = Object.freeze([
  { id: 'candidate', label: '후보' },
  { id: 'approved', label: '확정' },
  { id: 'rejected', label: '제외' },
])

export const INTENT_ENFORCEMENT_DEFS = Object.freeze([
  { id: 'guidance', label: '방향 제시' },
  { id: 'validate', label: '결과 검증' },
  { id: 'block', label: '위반 차단' },
])

const KIND_BY_ID = new Map(INTENT_KIND_DEFS.map((item) => [item.id, item]))
const STATUS_BY_ID = new Map(INTENT_STATUS_DEFS.map((item) => [item.id, item]))
const SOURCE_KIND_IDS = new Set(INTENT_SOURCE_KIND_DEFS.map((item) => item.id))
const CLAUSE_KIND_IDS = new Set(INTENT_CLAUSE_KIND_DEFS.map((item) => item.id))
const CLAUSE_STATUS_IDS = new Set(INTENT_CLAUSE_STATUS_DEFS.map((item) => item.id))
const ENFORCEMENT_IDS = new Set(INTENT_ENFORCEMENT_DEFS.map((item) => item.id))
const CONFIDENCE_IDS = new Set(['high', 'medium', 'low', 'unknown'])
const SAFE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,239}$/

export function intentKindDefinition(id) {
  return KIND_BY_ID.get(id) ?? KIND_BY_ID.get('intent')
}

export function intentStatusDefinition(id) {
  return STATUS_BY_ID.get(id) ?? STATUS_BY_ID.get('draft')
}

export function normalizeIntentPlainText(value, maxLength = 4000) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\r\n?/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .split('\n')
    .map((line) => line.replace(/[\t ]+/g, ' ').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength)
}

function normalizeIntentId(value) {
  const id = normalizeIntentPlainText(value, 240)
  return SAFE_ID.test(id) ? id : ''
}

function normalizeIntentSource(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = normalizeIntentId(value.id)
  if (!id) return null
  const addedAt = new Date(value.addedAt)
  return {
    id,
    sourceKind: SOURCE_KIND_IDS.has(value.sourceKind) ? value.sourceKind : 'manual',
    title: normalizeIntentPlainText(value.title, 180),
    text: normalizeIntentPlainText(value.text, 20000),
    sourceRef: normalizeIntentPlainText(value.sourceRef, 500),
    addedAt: Number.isFinite(addedAt.getTime()) ? addedAt.toISOString() : '',
  }
}

export function normalizeIntentSources(value) {
  const seen = new Set()
  const result = []
  for (const item of Array.isArray(value) ? value.slice(0, MAX_INTENT_SOURCES * 2) : []) {
    const source = normalizeIntentSource(item)
    if (!source || seen.has(source.id)) continue
    seen.add(source.id)
    result.push(source)
    if (result.length >= MAX_INTENT_SOURCES) break
  }
  return result
}

function normalizeIntentClause(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const id = normalizeIntentId(value.id)
  const text = normalizeIntentPlainText(value.text, 800)
  if (!id || !text) return null
  return {
    id,
    clauseKind: CLAUSE_KIND_IDS.has(value.clauseKind) ? value.clauseKind : 'direction',
    status: CLAUSE_STATUS_IDS.has(value.status) ? value.status : 'candidate',
    enforcement: ENFORCEMENT_IDS.has(value.enforcement) ? value.enforcement : 'guidance',
    text,
    sourceId: normalizeIntentId(value.sourceId),
    sourceExcerpt: normalizeIntentPlainText(value.sourceExcerpt, 500),
    confidence: CONFIDENCE_IDS.has(value.confidence) ? value.confidence : 'unknown',
  }
}

export function normalizeIntentClauses(value) {
  const seen = new Set()
  const result = []
  for (const item of Array.isArray(value) ? value.slice(0, MAX_INTENT_CLAUSES * 2) : []) {
    const clause = normalizeIntentClause(item)
    if (!clause || seen.has(clause.id)) continue
    seen.add(clause.id)
    result.push(clause)
    if (result.length >= MAX_INTENT_CLAUSES) break
  }
  return result
}

function clauseHash(value) {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function sentenceCandidates(value) {
  return normalizeIntentPlainText(value, 20000)
    .replace(/([.!?。！？])\s+/g, '$1\n')
    .split(/\n+/)
    .map((item) => item.replace(/^[-*•\d.)\s]+/, '').trim())
    .filter((item) => item.length >= 6)
}

function classifyClause(text) {
  if (/[?？]\s*$/.test(text) || /(논의|결정|확인).*(필요|해야)/.test(text)) return ['question', 'guidance', 'medium']
  if (/(금지|하지\s*마|해서는\s*안|하면\s*안|절대\s*안|허용하지)/.test(text)) return ['prohibition', 'block', 'high']
  if (/(예외|단,|다만|제외)/.test(text)) return ['exception', 'validate', 'medium']
  if (/(반드시|무조건|필수|해야\s*한다|하여야|필요하다)/.test(text)) return ['requirement', 'validate', 'high']
  if (/(성공\s*기준|완료\s*기준|달성|통과|결과는)/.test(text)) return ['success', 'validate', 'medium']
  if (/(우선|먼저|최우선|중요도|순위)/.test(text)) return ['priority', 'guidance', 'medium']
  if (/(결정|확정|채택|하기로)/.test(text)) return ['decision', 'guidance', 'medium']
  if (/(가정|전제|추정)/.test(text)) return ['assumption', 'guidance', 'medium']
  if (/(목표|목적|위해)/.test(text)) return ['purpose', 'guidance', 'medium']
  return ['direction', 'guidance', 'low']
}

export function extractIntentClauseCandidates(data = {}) {
  const normalized = normalizeIntentNodeData(data)
  const sources = normalized.intentSources.length
    ? normalized.intentSources
    : normalized.statement
      ? [{ id: 'intent-statement', text: normalized.statement }]
      : []
  const existingByEvidence = new Map(normalized.intentClauses.map((clause) => [
    `${clause.sourceId}\u0000${clause.sourceExcerpt.toLocaleLowerCase()}`,
    clause,
  ]))
  const additions = []
  for (const source of sources) {
    for (const sentence of sentenceCandidates(source.text)) {
      const evidenceKey = `${source.id}\u0000${sentence.toLocaleLowerCase()}`
      if (existingByEvidence.has(evidenceKey)) continue
      const [clauseKind, enforcement, confidence] = classifyClause(sentence)
      additions.push({
        id: `ic-${clauseHash(evidenceKey)}`,
        clauseKind,
        status: 'candidate',
        enforcement,
        text: sentence,
        sourceId: source.id,
        sourceExcerpt: sentence,
        confidence,
      })
    }
  }
  return normalizeIntentClauses([...normalized.intentClauses, ...additions])
}

function normalizeIntentSnapshot(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  if (!Number.isInteger(value.version) || value.version < 1) return null
  const recordedAt = new Date(value.recordedAt)
  if (!Number.isFinite(recordedAt.getTime())) return null
  return {
    version: value.version,
    recordedAt: recordedAt.toISOString(),
    label: normalizeIntentPlainText(value.label, 180),
    statement: normalizeIntentPlainText(value.statement, 4000),
    intentKind: intentKindDefinition(value.intentKind).id,
    intentStatus: intentStatusDefinition(value.intentStatus).id,
    intentClauses: normalizeIntentClauses(value.intentClauses)
      .filter((item) => item.status === 'approved'),
  }
}

function normalizeIntentVersions(value) {
  const byVersion = new Map()
  for (const item of Array.isArray(value) ? value : []) {
    const normalized = normalizeIntentSnapshot(item)
    if (normalized && !byVersion.has(normalized.version)) byVersion.set(normalized.version, normalized)
  }
  return [...byVersion.values()]
    .sort((left, right) => left.version - right.version)
    .slice(-MAX_INTENT_VERSIONS)
}

function currentSnapshot(data) {
  return {
    label: normalizeIntentPlainText(data.label, 180),
    statement: normalizeIntentPlainText(data.statement, 4000),
    intentKind: intentKindDefinition(data.intentKind).id,
    intentStatus: intentStatusDefinition(data.intentStatus).id,
    intentClauses: normalizeIntentClauses(data.intentClauses)
      .filter((item) => item.status === 'approved'),
  }
}

function sameSnapshot(left, right) {
  return !!left && !!right
    && left.label === right.label
    && left.statement === right.statement
    && left.intentKind === right.intentKind
    && left.intentStatus === right.intentStatus
    && JSON.stringify(left.intentClauses ?? []) === JSON.stringify(right.intentClauses ?? [])
}

export function normalizeIntentNodeData(data = {}) {
  return {
    ...data,
    intentSchemaVersion: INTENT_SCHEMA_VERSION,
    ...currentSnapshot(data),
    intentSources: normalizeIntentSources(data.intentSources),
    intentClauses: normalizeIntentClauses(data.intentClauses),
    intentVersions: normalizeIntentVersions(data.intentVersions),
  }
}

export function createIntentNodeData(intentKind = 'intent') {
  const kind = intentKindDefinition(intentKind)
  return normalizeIntentNodeData({
    label: `새 ${kind.label}`,
    statement: '',
    intentKind: kind.id,
    intentStatus: 'draft',
    intentSources: [],
    intentClauses: [],
    intentVersions: [],
  })
}

export function intentVersionState(data = {}) {
  const normalized = normalizeIntentNodeData(data)
  const latest = normalized.intentVersions.at(-1) ?? null
  const dirty = !latest || !sameSnapshot(currentSnapshot(normalized), latest)
  return {
    currentVersion: latest?.version ?? 0,
    latestRecordedAt: latest?.recordedAt ?? '',
    dirty,
    label: latest ? (dirty ? `v${latest.version} 이후 수정` : `v${latest.version} 기록됨`) : '미기록 초안',
  }
}

export function recordIntentVersion(data = {}, recordedAt = new Date().toISOString()) {
  const normalized = normalizeIntentNodeData(data)
  const latest = normalized.intentVersions.at(-1) ?? null
  const snapshot = currentSnapshot(normalized)
  if (latest && sameSnapshot(snapshot, latest)) return normalized

  const timestamp = new Date(recordedAt)
  const safeRecordedAt = Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : new Date().toISOString()
  return {
    ...normalized,
    intentVersions: [
      ...normalized.intentVersions,
      {
        version: (latest?.version ?? 0) + 1,
        recordedAt: safeRecordedAt,
        ...snapshot,
      },
    ].slice(-MAX_INTENT_VERSIONS),
  }
}
