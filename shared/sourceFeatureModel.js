import { digitalTwinReviewFingerprint } from './digitalTwinReview.js'
import { SOURCE_FEATURE_MODEL_SCHEMA_VERSION } from './sourceProfileContract.js'

const CLASSIFICATIONS = new Set(['feature-asset', 'capability', 'attribute'])
const DB_OPERATIONS = new Set(['read', 'write'])

function compareText(left, right) {
  return String(left ?? '').localeCompare(String(right ?? ''), 'en')
}

function unique(values) {
  return [...new Set(values.filter(Boolean))].sort(compareText)
}

function featureKey(scope, id) {
  return `${scope}:${id}`
}

function implementationTargetForPath(path, rules) {
  for (const rule of rules) {
    if (new RegExp(rule.pathPattern, 'i').test(path)) return rule.targetEntityId
  }
  return null
}

function evidenceForCandidate(scope, id, files) {
  return files.filter((file) => scope === 'area' ? file.area === id : file.subsystem === id)
}

function implementationTargets(evidenceFiles, rules) {
  const grouped = new Map()
  for (const file of evidenceFiles) {
    const targetEntityId = implementationTargetForPath(file.path, rules)
    if (!targetEntityId) continue
    const current = grouped.get(targetEntityId) ?? []
    current.push(file.id)
    grouped.set(targetEntityId, current)
  }
  return [...grouped.entries()]
    .map(([targetEntityId, evidenceEntityIds]) => ({
      targetEntityId,
      evidenceEntityIds: unique(evidenceEntityIds),
    }))
    .sort((left, right) => compareText(left.targetEntityId, right.targetEntityId))
}

function dataAccessForCandidate(evidenceFiles, relations, bindings) {
  const fileIds = new Set(evidenceFiles.map((file) => file.id))
  const bindingBySource = new Map(bindings.map((item) => [item.sourceEntityId, item.targetEntityId]))
  const grouped = new Map()
  for (const relation of relations) {
    if (relation.type !== 'accesses' || !fileIds.has(relation.source)) continue
    const targetEntityId = bindingBySource.get(relation.target)
    if (!targetEntityId) continue
    for (const operation of relation.operations ?? []) {
      if (!DB_OPERATIONS.has(operation)) continue
      const key = `${operation}:${targetEntityId}`
      const current = grouped.get(key) ?? {
        operation,
        sourceEntityIds: new Set(),
        targetEntityId,
        evidenceEntityIds: new Set(),
        evidenceRelationIds: new Set(),
      }
      current.sourceEntityIds.add(relation.target)
      current.evidenceEntityIds.add(relation.source)
      current.evidenceRelationIds.add(relation.id)
      grouped.set(key, current)
    }
  }
  return [...grouped.values()]
    .map((item) => ({
      ...item,
      sourceEntityIds: [...item.sourceEntityIds].sort(compareText),
      evidenceEntityIds: [...item.evidenceEntityIds].sort(compareText),
      evidenceRelationIds: [...item.evidenceRelationIds].sort(compareText),
    }))
    .sort((left, right) => compareText(`${left.operation}:${left.targetEntityId}`, `${right.operation}:${right.targetEntityId}`))
}

function normalizedDecision(model, scope, id) {
  const decision = model.decisions.find((item) => item.scope === scope && item.id === id)
  return decision ?? {
    scope,
    id,
    classification: model.defaults?.[scope] ?? 'attribute',
    rationale: 'Source Profile 기본 판정',
  }
}

function candidateFor({ definition, scope, model, files, relations, profile }) {
  const decision = normalizedDecision(model, scope, definition.id)
  const classification = CLASSIFICATIONS.has(decision.classification) ? decision.classification : 'attribute'
  const evidenceFiles = evidenceForCandidate(scope, definition.id, files)
  const implementations = implementationTargets(evidenceFiles, model.implementationRules)
  const dataAccess = dataAccessForCandidate(evidenceFiles, relations, model.dataBindings)
  const areaId = scope === 'area' ? definition.id : definition.area
  const ownerKey = scope === 'subsystem' ? featureKey('area', areaId) : null
  const diagnostics = []
  if (classification !== 'attribute' && evidenceFiles.length === 0) diagnostics.push('source_evidence_missing')
  if (classification === 'feature-asset' && implementations.length === 0) diagnostics.push('implementation_evidence_missing')
  const eligible = classification === 'attribute'
    ? false
    : evidenceFiles.length > 0 && (classification !== 'feature-asset' || implementations.length > 0)
  const value = {
    key: featureKey(scope, definition.id),
    scope,
    id: definition.id,
    areaId,
    ownerKey,
    label: definition.label || definition.id,
    description: definition.description || '',
    order: Number.isInteger(definition.order) ? definition.order : 1_000,
    classification,
    rationale: decision.rationale,
    eligible,
    diagnostics,
    evidence: evidenceFiles.map((file) => ({
      entityId: file.id,
      path: file.path,
      fingerprint: file.fingerprint ?? '',
      summary: file.summary ?? '',
    })).sort((left, right) => compareText(left.entityId, right.entityId)),
    evidenceEntityIds: evidenceFiles.map((file) => file.id).sort(compareText),
    evidencePaths: unique(evidenceFiles.map((file) => file.path)),
    implementations,
    dataAccess,
  }
  return {
    ...value,
    fingerprint: digitalTwinReviewFingerprint({
      profileId: profile.id,
      profileVersion: profile.version,
      ...value,
    }),
  }
}

export function deriveSourceFeatureModel(manifest = {}) {
  const profile = manifest?.source?.profile ?? {}
  const model = profile.featureModel
  if (!model || model.schemaVersion !== SOURCE_FEATURE_MODEL_SCHEMA_VERSION) {
    return Object.freeze({
      schemaVersion: SOURCE_FEATURE_MODEL_SCHEMA_VERSION,
      profile: { id: profile.id ?? '', version: profile.version ?? '' },
      candidates: Object.freeze([]),
      summary: Object.freeze({ featureAssets: 0, capabilities: 0, attributes: 0, ineligible: 0 }),
      fingerprint: digitalTwinReviewFingerprint({ profileId: profile.id ?? '', featureModel: null }),
    })
  }
  const files = (manifest.entities ?? []).filter((entity) => entity.kind === 'file' && entity.path)
  const definitions = [
    ...(manifest.areas ?? []).map((definition) => ({ scope: 'area', definition })),
    ...(manifest.subsystems ?? []).map((definition) => ({ scope: 'subsystem', definition })),
  ]
  const candidates = definitions
    .map(({ scope, definition }) => candidateFor({
      definition,
      scope,
      model,
      files,
      relations: manifest.relations ?? [],
      profile,
    }))
    .sort((left, right) => (
      left.scope.localeCompare(right.scope)
      || left.order - right.order
      || compareText(left.id, right.id)
    ))
  const summary = {
    featureAssets: candidates.filter((item) => item.classification === 'feature-asset' && item.eligible).length,
    capabilities: candidates.filter((item) => item.classification === 'capability' && item.eligible).length,
    attributes: candidates.filter((item) => item.classification === 'attribute').length,
    ineligible: candidates.filter((item) => item.classification !== 'attribute' && !item.eligible).length,
  }
  const result = {
    schemaVersion: SOURCE_FEATURE_MODEL_SCHEMA_VERSION,
    profile: { id: profile.id ?? '', version: profile.version ?? '' },
    candidates,
    summary,
  }
  return Object.freeze({ ...result, fingerprint: digitalTwinReviewFingerprint(result) })
}
