import { digitalTwinReviewFingerprint } from './digitalTwinReview.js'

export const SOURCE_TWIN_SCHEMA_VERSION = 1
export const SOURCE_TWIN_SOURCE_ID = 'workflow-canvas:self-source'
export const SOURCE_TWIN_SNAPSHOT_OPERATION = 'source-twin.snapshot.create'
export const SOURCE_TWIN_OPERATION_CONFIRMATION = 'CREATE_SOURCE_TWIN_SNAPSHOT'

export const SOURCE_TWIN_PERSPECTIVES = Object.freeze({
  all: '전체',
  functionality: '기능',
  code: '코드',
  database: 'DB',
  security: '보안',
  deployment: '배포',
})

const VALID_PERSPECTIVES = new Set(Object.keys(SOURCE_TWIN_PERSPECTIVES))

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue)
  if (plainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]))
  }
  return value
}

export function sourceTwinFingerprint(value) {
  return digitalTwinReviewFingerprint(stableValue(value))
}

export function sourceTwinEntityMap(manifest) {
  return new Map((manifest?.entities ?? []).map((entity) => [entity.id, entity]))
}

export function sourceTwinEntities(manifest, { perspective = 'all', query = '', limit = 500 } = {}) {
  const selectedPerspective = VALID_PERSPECTIVES.has(perspective) ? perspective : 'all'
  const allowed = selectedPerspective === 'all'
    ? null
    : new Set(manifest?.perspectives?.[selectedPerspective] ?? [])
  const normalizedQuery = String(query ?? '').trim().toLocaleLowerCase()
  return (manifest?.entities ?? [])
    .filter((entity) => !allowed || allowed.has(entity.id))
    .filter((entity) => {
      if (!normalizedQuery) return true
      return [entity.label, entity.path, entity.name, entity.summary, ...(entity.tags ?? [])]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase().includes(normalizedQuery))
    })
    .slice(0, Math.max(1, Math.min(2_000, Number(limit) || 500)))
}

export function sourceTwinCodeUrl(manifest, entity, commitSha = '') {
  const repositoryUrl = String(manifest?.source?.repositoryUrl ?? '').replace(/\/$/, '')
  const path = String(entity?.path ?? '').replace(/^\/+/, '')
  if (!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/i.test(repositoryUrl) || !path) return ''
  const ref = /^[a-f0-9]{7,64}$/i.test(commitSha) ? commitSha : (manifest?.source?.defaultBranch || 'main')
  const line = Number.isInteger(entity?.lineStart) && entity.lineStart > 0 ? `#L${entity.lineStart}` : ''
  return `${repositoryUrl}/blob/${encodeURIComponent(ref)}/${path.split('/').map(encodeURIComponent).join('/')}${line}`
}

function compactEntityFingerprints(manifest) {
  return Object.fromEntries((manifest?.entities ?? []).map((entity) => [entity.id, {
    fingerprint: entity.fingerprint,
    kind: entity.kind,
    label: entity.label,
    path: entity.path ?? '',
    parentId: entity.parentId ?? null,
  }]))
}

function normalizeMetrics(value) {
  if (!plainObject(value)) return {}
  return Object.fromEntries(Object.entries(value)
    .filter(([, item]) => typeof item === 'number' && Number.isFinite(item))
    .sort(([left], [right]) => left.localeCompare(right)))
}

export function createSourceTwinSnapshot({
  manifest,
  capturedAt = new Date().toISOString(),
  reason = 'manual',
  operationId = '',
  deployment = {},
  database = {},
  operations = {},
  runtime = {},
  privacy = {},
}) {
  if (manifest?.schemaVersion !== SOURCE_TWIN_SCHEMA_VERSION || !manifest?.id) {
    throw new Error('유효한 소스 트윈 manifest가 필요합니다.')
  }
  const parsedAt = Date.parse(capturedAt)
  const safeCapturedAt = Number.isFinite(parsedAt) ? new Date(parsedAt).toISOString() : new Date().toISOString()
  const safeOperationId = /^op-[a-f0-9]{64}$/i.test(operationId) ? operationId.toLocaleLowerCase() : ''
  const entityFingerprints = compactEntityFingerprints(manifest)
  const sections = {
    code: {
      fingerprint: manifest.fingerprints?.code ?? sourceTwinFingerprint(entityFingerprints),
      summary: manifest.summary ?? {},
      entities: entityFingerprints,
    },
    database: {
      fingerprint: sourceTwinFingerprint({ declared: manifest.fingerprints?.database, state: database }),
      declaredFingerprint: manifest.fingerprints?.database ?? '',
      state: stableValue(database),
    },
    deployment: {
      fingerprint: sourceTwinFingerprint(deployment),
      state: stableValue(deployment),
    },
    operations: {
      fingerprint: sourceTwinFingerprint(operations),
      metrics: normalizeMetrics(operations?.metrics ?? operations),
      state: stableValue(operations),
    },
    runtime: {
      fingerprint: sourceTwinFingerprint(runtime),
      state: stableValue(runtime),
    },
    security: {
      fingerprint: sourceTwinFingerprint({ declared: manifest.fingerprints?.security, privacy }),
      declaredFingerprint: manifest.fingerprints?.security ?? '',
      state: stableValue(privacy),
    },
  }
  const snapshotKey = sourceTwinFingerprint(reason === 'deployment'
    ? {
        manifestId: manifest.id,
        commitSha: deployment.commitSha ?? '',
        reason: 'deployment',
      }
    : {
        manifestId: manifest.id,
        commitSha: deployment.commitSha ?? '',
        reason: 'manual',
        operationId: safeOperationId,
        capturedAt: safeCapturedAt,
        sections: Object.fromEntries(Object.entries(sections).map(([key, section]) => [key, section.fingerprint])),
      })
  return {
    schemaVersion: SOURCE_TWIN_SCHEMA_VERSION,
    id: `source-snapshot-${snapshotKey}`,
    snapshotKey,
    sourceId: manifest.source?.id ?? SOURCE_TWIN_SOURCE_ID,
    manifestId: manifest.id,
    capturedAt: safeCapturedAt,
    reason: reason === 'deployment' ? 'deployment' : 'manual',
    ...(safeOperationId ? { operationId: safeOperationId } : {}),
    commitSha: String(deployment.commitSha ?? '').slice(0, 64),
    sections,
  }
}

function changedEntities(fromEntities = {}, toEntities = {}) {
  const added = []
  const changed = []
  const removed = []
  for (const [id, entity] of Object.entries(toEntities)) {
    if (!fromEntities[id]) added.push(entity)
    else if (fromEntities[id].fingerprint !== entity.fingerprint) changed.push(entity)
  }
  for (const [id, entity] of Object.entries(fromEntities)) {
    if (!toEntities[id]) removed.push(entity)
  }
  const sort = (items) => items.sort((left, right) => `${left.path}:${left.label}`.localeCompare(`${right.path}:${right.label}`))
  return { added: sort(added), changed: sort(changed), removed: sort(removed) }
}

function metricChanges(from = {}, to = {}) {
  return [...new Set([...Object.keys(from), ...Object.keys(to)])].sort().flatMap((key) => {
    const before = from[key]
    const after = to[key]
    if (before === after) return []
    return [{ key, before: before ?? null, after: after ?? null, delta: typeof before === 'number' && typeof after === 'number' ? after - before : null }]
  })
}

export function compareSourceTwinSnapshots(from, to) {
  if (!from?.id || !to?.id) throw new Error('비교할 두 상태 스냅샷이 필요합니다.')
  const sections = {}
  for (const key of ['code', 'database', 'deployment', 'operations', 'runtime', 'security']) {
    sections[key] = {
      changed: from.sections?.[key]?.fingerprint !== to.sections?.[key]?.fingerprint,
      beforeFingerprint: from.sections?.[key]?.fingerprint ?? '',
      afterFingerprint: to.sections?.[key]?.fingerprint ?? '',
    }
  }
  const entities = changedEntities(from.sections?.code?.entities, to.sections?.code?.entities)
  const metrics = metricChanges(from.sections?.operations?.metrics, to.sections?.operations?.metrics)
  return {
    from: { id: from.id, capturedAt: from.capturedAt, manifestId: from.manifestId, commitSha: from.commitSha },
    to: { id: to.id, capturedAt: to.capturedAt, manifestId: to.manifestId, commitSha: to.commitSha },
    sections,
    entities,
    metrics,
    summary: {
      changedSections: Object.values(sections).filter((section) => section.changed).length,
      addedEntities: entities.added.length,
      changedEntities: entities.changed.length,
      removedEntities: entities.removed.length,
      changedMetrics: metrics.length,
    },
  }
}
