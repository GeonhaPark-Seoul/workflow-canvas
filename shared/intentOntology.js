export const INTENT_SCHEMA_VERSION = 1
export const MAX_INTENT_VERSIONS = 25

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

const KIND_BY_ID = new Map(INTENT_KIND_DEFS.map((item) => [item.id, item]))
const STATUS_BY_ID = new Map(INTENT_STATUS_DEFS.map((item) => [item.id, item]))

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
  }
}

function sameSnapshot(left, right) {
  return !!left && !!right
    && left.label === right.label
    && left.statement === right.statement
    && left.intentKind === right.intentKind
    && left.intentStatus === right.intentStatus
}

export function normalizeIntentNodeData(data = {}) {
  return {
    ...data,
    intentSchemaVersion: INTENT_SCHEMA_VERSION,
    ...currentSnapshot(data),
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
