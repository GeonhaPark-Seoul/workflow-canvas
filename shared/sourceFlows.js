export const SOURCE_FLOW_SCHEMA_VERSION = 1

function text(value, maximum = 500) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : ''
}

export function sourceFlowsForModule(catalog, moduleId, { limit = 120 } = {}) {
  const id = text(moduleId, 800)
  if (!id || id !== moduleId || !catalog?.modules || !Object.hasOwn(catalog.modules, id)) return null
  const index = catalog.modules[id]
  const maximum = Math.max(1, Math.min(120, Number(limit) || 120))
  const entityIds = Array.isArray(catalog.entityIds) ? catalog.entityIds : []
  const expandRelation = (relationId) => {
    const row = catalog.relations?.[relationId]
    if (!Array.isArray(row)) return row ?? null
    const [kind, sourceIndex, targetIndex, label, evidenceRef, confidence, unknownReason, props] = row
    return {
      id: relationId,
      kind,
      source: entityIds[sourceIndex] ?? '',
      target: targetIndex >= 0 ? entityIds[targetIndex] ?? null : null,
      label,
      evidenceRef,
      evidenceKind: 'code',
      realityLevel: 'declared',
      confidence,
      ...(unknownReason ? { unknownReason } : {}),
      ...(Array.isArray(props) && props.length ? { props } : {}),
    }
  }
  const expandFlow = (flowId) => {
    const row = catalog.flows?.[flowId]
    if (!Array.isArray(row)) return row ?? null
    const [kind, label, sourceIndex, evidenceRef, steps, moduleCount] = row
    return {
      id: flowId,
      kind,
      label,
      source: entityIds[sourceIndex] ?? '',
      evidenceRef,
      evidenceKind: 'code',
      realityLevel: 'declared',
      steps: (steps ?? []).map(([entityIndex, depth]) => ({ entityId: entityIds[entityIndex] ?? '', depth })).filter((item) => item.entityId),
      moduleCount,
      promotion: {
        status: 'candidate',
        eligible: false,
        reason: '독립된 상태·책임·사용자 인지가 확인되기 전에는 Component 파츠로만 표시합니다.',
      },
    }
  }
  const relations = (index.relationIds ?? []).slice(0, maximum).map(expandRelation).filter(Boolean)
  const flows = (index.flowIds ?? []).slice(0, maximum).map(expandFlow).filter(Boolean)
  return {
    schemaVersion: SOURCE_FLOW_SCHEMA_VERSION,
    sourceId: text(catalog.sourceId, 240),
    sourceManifestId: text(catalog.sourceManifestId, 240),
    moduleId: id,
    moduleFingerprint: text(index.fingerprint, 80),
    relations,
    flows,
    truncated: (index.relationIds?.length ?? 0) > relations.length || (index.flowIds?.length ?? 0) > flows.length,
  }
}

export function sourceFlowToSystemPart(flow) {
  const id = text(flow?.id, 240)
  const label = text(flow?.label, 120)
  const evidenceRef = text(flow?.evidenceRef, 500)
  if (!id || !label || !evidenceRef) return null
  return {
    id: `flow-${id.replace(/[^A-Za-z0-9._:-]/g, '').slice(-36)}`,
    kind: 'capability',
    label: `흐름 · ${label}`.slice(0, 120),
    ref: text(flow.kind, 80),
    exposure: 'internal',
    sourceKind: 'code',
    evidenceRef,
  }
}
