export const DIGITAL_TWIN_REVIEW_SCHEMA_VERSION = 1

const DISPOSITIONS = new Set(['reviewed', 'ignored'])
const CATEGORIES = new Set(['entity', 'relation', 'resource', 'security', 'runtime'])
const CHANGE_TYPES = new Set(['added', 'changed', 'removed', 'evidence', 'warning'])
const SEVERITIES = new Set(['info', 'attention', 'critical'])
const MAX_DECISIONS_PER_SOURCE = 500
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeKey(value, maxLength = 240) {
  const key = typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
  return key && !UNSAFE_KEYS.has(key) ? key : ''
}

function stableValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'object') return String(value ?? '')
  if (seen.has(value)) return '[circular]'
  seen.add(value)
  if (Array.isArray(value)) {
    const result = value.map((item) => stableValue(item, seen))
    seen.delete(value)
    return result
  }
  if (!plainObject(value)) {
    seen.delete(value)
    return String(value ?? '')
  }
  const result = {}
  for (const key of Object.keys(value).sort()) {
    if (value[key] !== undefined) result[key] = stableValue(value[key], seen)
  }
  seen.delete(value)
  return result
}

export function digitalTwinReviewFingerprint(value) {
  const input = JSON.stringify(stableValue(value))
  let left = 0x811c9dc5
  let right = 0x9e3779b9
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    left ^= code
    left = Math.imul(left, 0x01000193)
    right ^= code + index
    right = Math.imul(right, 0x85ebca6b)
  }
  return `${(left >>> 0).toString(16).padStart(8, '0')}${(right >>> 0).toString(16).padStart(8, '0')}`
}

function compactEvidence(items) {
  const seen = new Set()
  const result = []
  for (const item of Array.isArray(items) ? items : []) {
    const ref = typeof item === 'string' ? item.trim() : String(item?.ref ?? '').trim()
    if (!ref || seen.has(ref)) continue
    seen.add(ref)
    result.push({
      ref: ref.slice(0, 360),
      kind: typeof item === 'object' && item?.kind ? String(item.kind).slice(0, 40) : 'reference',
    })
  }
  return result.slice(0, 24)
}

export function createDigitalTwinReviewItem({
  sourceId,
  itemKey,
  category,
  changeType,
  severity,
  title,
  summary,
  evidence,
  focus,
  observation,
  status,
}) {
  const safeSourceId = safeKey(sourceId)
  const safeItemKey = safeKey(itemKey)
  if (!safeSourceId || !safeItemKey) throw new Error('Asset review items require safe sourceId and itemKey values.')
  const id = `${safeSourceId}::${safeItemKey}`
  const normalized = {
    id,
    sourceId: safeSourceId,
    itemKey: safeItemKey,
    category: CATEGORIES.has(category) ? category : 'resource',
    changeType: CHANGE_TYPES.has(changeType) ? changeType : 'changed',
    severity: SEVERITIES.has(severity) ? severity : 'attention',
    title: String(title ?? safeItemKey).trim().slice(0, 180),
    summary: String(summary ?? '').trim().slice(0, 800),
    evidence: compactEvidence(evidence),
    focus: plainObject(focus) ? stableValue(focus) : null,
    status: typeof status === 'string' ? status.slice(0, 80) : '',
  }
  return {
    ...normalized,
    fingerprint: digitalTwinReviewFingerprint({
      id,
      category: normalized.category,
      changeType: normalized.changeType,
      status: normalized.status,
      observation: stableValue(observation ?? {}),
    }),
  }
}

function normalizeDecision(value) {
  if (!plainObject(value) || !DISPOSITIONS.has(value.disposition)) return null
  const fingerprint = safeKey(value.fingerprint, 80)
  if (!fingerprint) return null
  const parsedAt = Date.parse(value.decidedAt ?? '')
  return {
    fingerprint,
    disposition: value.disposition,
    decidedAt: Number.isFinite(parsedAt) ? new Date(parsedAt).toISOString() : null,
  }
}

export function normalizeDigitalTwinReviewState(value) {
  const result = { schemaVersion: DIGITAL_TWIN_REVIEW_SCHEMA_VERSION, sources: {} }
  if (!plainObject(value?.sources)) return result
  for (const [rawSourceId, sourceValue] of Object.entries(value.sources)) {
    const sourceId = safeKey(rawSourceId)
    if (!sourceId || !plainObject(sourceValue?.decisions)) continue
    const decisions = {}
    for (const [rawItemId, rawDecision] of Object.entries(sourceValue.decisions).slice(-MAX_DECISIONS_PER_SOURCE)) {
      const itemId = safeKey(rawItemId, 520)
      const decision = normalizeDecision(rawDecision)
      if (itemId && decision) decisions[itemId] = decision
    }
    result.sources[sourceId] = { decisions }
  }
  return result
}

function matchingDecision(normalized, item) {
  const decision = normalized.sources[item?.sourceId]?.decisions?.[item?.id]
  return decision?.fingerprint === item?.fingerprint ? decision : null
}

export function digitalTwinReviewDecision(state, item) {
  return matchingDecision(normalizeDigitalTwinReviewState(state), item)
}

export function partitionDigitalTwinReviewItems(items, state) {
  const normalized = normalizeDigitalTwinReviewState(state)
  const result = { pending: [], reviewed: [], ignored: [], decisions: {} }
  for (const item of Array.isArray(items) ? items : []) {
    const decision = matchingDecision(normalized, item)
    if (!decision) result.pending.push(item)
    else {
      result[decision.disposition].push(item)
      result.decisions[item.id] = decision
    }
  }
  return result
}

export function setDigitalTwinReviewDecision(state, item, disposition, decidedAt = new Date().toISOString()) {
  if (!item?.id || !item?.sourceId || !item?.fingerprint || !DISPOSITIONS.has(disposition)) {
    return normalizeDigitalTwinReviewState(state)
  }
  const normalized = normalizeDigitalTwinReviewState(state)
  const existing = normalized.sources[item.sourceId]?.decisions ?? {}
  const parsedAt = Date.parse(decidedAt)
  const safeDecidedAt = Number.isFinite(parsedAt) ? new Date(parsedAt).toISOString() : new Date().toISOString()
  const decisions = {
    ...existing,
    [item.id]: {
      fingerprint: item.fingerprint,
      disposition,
      decidedAt: safeDecidedAt,
    },
  }
  const entries = Object.entries(decisions)
    .sort((left, right) => Date.parse(left[1].decidedAt ?? '') - Date.parse(right[1].decidedAt ?? ''))
    .slice(-MAX_DECISIONS_PER_SOURCE)
  return {
    ...normalized,
    sources: {
      ...normalized.sources,
      [item.sourceId]: { decisions: Object.fromEntries(entries) },
    },
  }
}

export function clearDigitalTwinReviewDecision(state, item) {
  const normalized = normalizeDigitalTwinReviewState(state)
  const source = normalized.sources[item?.sourceId]
  if (!source?.decisions?.[item?.id]) return normalized
  const decisions = { ...source.decisions }
  delete decisions[item.id]
  return {
    ...normalized,
    sources: {
      ...normalized.sources,
      [item.sourceId]: { decisions },
    },
  }
}
