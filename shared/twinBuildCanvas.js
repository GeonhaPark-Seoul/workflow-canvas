import { digitalTwinReviewFingerprint } from './digitalTwinReview.js'
import { createEdgeRelationData, edgeRelationInfo } from './relationOntology.js'
import { createSystemNodeData, normalizeSystemNodeData } from './systemOntology.js'
import { normalizeSystemPart, normalizeSystemParts } from './systemPartOntology.js'
import { createTwinBuild } from './twinBuild.js'

function safeChildId(prefix, parentId, childId) {
  const candidate = `${prefix}:${parentId}:${childId}`
  return candidate.length <= 240
    ? candidate
    : `${prefix}:${digitalTwinReviewFingerprint({ parentId, childId })}`
}

function withoutDerivedFields(value) {
  if (!value || typeof value !== 'object') return value
  const { fingerprint, evidenceIds, ...rest } = value
  return rest
}

function evidenceKind(sourceKind) {
  if (['code', 'connector', 'runtime', 'manual'].includes(sourceKind)) return sourceKind
  return 'declaration'
}

function createEvidenceRegistry(initial = []) {
  const byRef = new Map()
  const records = []
  const add = ({ id: requestedId, ref, kind = 'declaration', summary = '', confidence = 'high', fingerprint = '', observedAt = null }) => {
    const normalizedRef = typeof ref === 'string' ? ref.trim() : ''
    if (!normalizedRef) return null
    const key = `${kind}:${normalizedRef}`
    if (byRef.has(key)) return byRef.get(key)
    const id = requestedId || `evidence:${digitalTwinReviewFingerprint({ kind, ref: normalizedRef })}`
    records.push({ id, kind, ref: normalizedRef, summary, confidence, fingerprint, observedAt })
    byRef.set(key, id)
    return id
  }
  for (const item of Array.isArray(initial) ? initial : []) add(item)
  return { add, records }
}

function bindingFromPart(part) {
  const binding = part?.digitalTwinBinding
  if (!binding?.sourceId || !binding?.entityKey || !binding?.observedFingerprint) return null
  return {
    sourceId: binding.sourceId,
    entityKey: binding.entityKey,
    observedFingerprint: binding.observedFingerprint,
    observedSnapshotId: binding.observedSnapshotId,
    proposalId: binding.proposalId,
    itemId: binding.itemId,
    itemFingerprint: binding.itemFingerprint,
  }
}

function partIdFromHandle(handle) {
  if (typeof handle !== 'string' || !handle.startsWith('p-') || !/-[lr]$/.test(handle)) return null
  return handle.slice(2, -2)
}

export function createTwinBuildFromCanvasTemplate({
  id,
  source,
  canvas,
  evidence = [],
  trustZones = [],
  gateways = [],
  operations = [],
}) {
  const registry = createEvidenceRegistry(evidence)
  const nodes = Array.isArray(canvas?.nodes) ? canvas.nodes : []
  const edges = Array.isArray(canvas?.edges) ? canvas.edges : []
  const entities = []
  const parts = []
  const zones = new Map((Array.isArray(trustZones) ? trustZones : []).map((zone) => [zone.id, zone]))
  const gatewayRecords = new Map((Array.isArray(gateways) ? gateways : []).map((gateway) => [gateway.id, gateway]))
  const partByCanvasIdentity = new Map()

  for (const node of nodes) {
    const data = node?.data ?? {}
    const sourceKind = data.sourceKind ?? (node.type === 'group' ? 'manual' : 'code')
    const evidenceIds = []
    const evidenceId = registry.add({
      ref: data.externalRef || data.evidence || `canvas-node:${node.id}`,
      kind: evidenceKind(sourceKind),
      summary: data.evidence || `${data.label || node.id} 캔버스 템플릿 근거`,
    })
    if (evidenceId) evidenceIds.push(evidenceId)
    if (data.trustZone?.id) zones.set(data.trustZone.id, data.trustZone)
    entities.push({
      id: node.id,
      kind: node.type === 'group' ? 'layer' : (data.systemKind ?? 'service'),
      label: data.label || node.id,
      description: data.description,
      purpose: data.purpose,
      responsibility: data.responsibility,
      constraints: data.constraints,
      evidenceSummary: data.evidence,
      environment: data.environment,
      sourceKind,
      provider: data.provider,
      externalRef: data.externalRef,
      parentId: node.parentId,
      trustZoneId: data.trustZone?.id ?? null,
      evidenceIds,
      placement: {
        nodeId: node.id,
        nodeType: node.type === 'group' ? 'group' : 'system',
        initialPosition: node.position,
        initialSize: {
          width: node.width ?? node.measured?.width ?? (node.type === 'group' ? 900 : 240),
          height: node.height ?? node.measured?.height ?? (node.type === 'group' ? 560 : 140),
        },
        zIndex: node.zIndex,
      },
    })
    for (const part of normalizeSystemParts(data.systemParts)) {
      const canonicalPartId = safeChildId('part', node.id, part.id)
      const partEvidenceId = registry.add({
        ref: part.evidenceRef || `canvas-part:${node.id}:${part.id}`,
        kind: evidenceKind(part.sourceKind),
        summary: `${data.label || node.id} · ${part.label}`,
      })
      parts.push({
        id: canonicalPartId,
        entityId: node.id,
        kind: part.kind,
        label: part.label,
        ref: part.ref,
        exposure: part.exposure,
        sourceKind: part.sourceKind,
        evidenceIds: partEvidenceId ? [partEvidenceId] : [],
        operationIds: [],
        binding: bindingFromPart(part),
        placement: { partId: part.id },
      })
      partByCanvasIdentity.set(`${node.id}:${part.id}`, canonicalPartId)
    }
  }

  const relations = edges.map((edge) => {
    const sourcePartId = partIdFromHandle(edge.sourceHandle)
    const targetPartId = partIdFromHandle(edge.targetHandle)
    const relationEvidenceId = registry.add({
      ref: edge.data?.relationEvidenceRef || `canvas-edge:${edge.id}`,
      kind: evidenceKind(edge.data?.relationSourceKind),
      summary: edge.data?.relationEvidence || `${edge.source} → ${edge.target}`,
      confidence: edge.data?.relationConfidence,
    })
    const gateway = edge.data?.trustGateway
    if (gateway?.id) gatewayRecords.set(gateway.id, gateway)
    return {
      id: edge.id,
      source: {
        entityId: edge.source,
        partId: sourcePartId ? partByCanvasIdentity.get(`${edge.source}:${sourcePartId}`) : null,
      },
      target: {
        entityId: edge.target,
        partId: targetPartId ? partByCanvasIdentity.get(`${edge.target}:${targetPartId}`) : null,
      },
      relationType: edge.data?.relationType ?? 'flows_to',
      relationLabel: edge.data?.relationLabel,
      sourceKind: edge.data?.relationSourceKind,
      confidence: edge.data?.relationConfidence,
      summary: edge.data?.relationEvidence,
      evidenceIds: relationEvidenceId ? [relationEvidenceId] : [],
      gatewayId: gateway?.id ?? null,
      partsLink: edge.data?.partsLink === true,
      placement: {
        edgeId: edge.id,
        sourceHandle: edge.sourceHandle,
        targetHandle: edge.targetHandle,
      },
    }
  })

  return createTwinBuild({
    schemaVersion: 1,
    id,
    source,
    entities,
    parts,
    relations,
    trustZones: [...zones.values()],
    gateways: [...gatewayRecords.values()],
    evidence: registry.records,
    operations,
  })
}

function evidenceRefs(build, ids) {
  const byId = new Map(build.evidence.map((item) => [item.id, item]))
  return ids.map((id) => byId.get(id)?.ref).filter(Boolean).join(', ')
}

function entityParentNodeId(build, entity) {
  if (!entity.parentId) return undefined
  return build.entities.find((candidate) => candidate.id === entity.parentId)?.placement.nodeId
}

function entityTrustZone(build, entity) {
  const zone = build.trustZones.find((candidate) => candidate.id === entity.trustZoneId)
  return zone ? withoutDerivedFields(zone) : undefined
}

export function materializeTwinBuildPart(build, part) {
  const materialized = {
    id: part.placement.partId,
    kind: part.kind,
    label: part.label,
    ref: part.ref,
    exposure: part.exposure,
    sourceKind: part.sourceKind,
    evidenceRef: evidenceRefs(build, part.evidenceIds),
  }
  if (part.binding) {
    materialized.digitalTwinBinding = {
      schemaVersion: 1,
      ...part.binding,
    }
  }
  return normalizeSystemPart(materialized)
}

export function materializeTwinBuildEntity(build, entity, reviewItem = null) {
  const parentId = entityParentNodeId(build, entity)
  const binding = {
    schemaVersion: 1,
    sourceId: build.source.id,
    entityKey: entity.id,
    observedFingerprint: entity.fingerprint,
    observedSnapshotId: build.source.snapshotId,
    itemId: reviewItem?.id ?? '',
    itemFingerprint: reviewItem?.fingerprint ?? '',
  }
  const base = {
    id: entity.placement.nodeId,
    type: entity.placement.nodeType,
    ...(parentId ? { parentId } : {}),
    position: entity.placement.initialPosition,
    width: entity.placement.initialSize.width,
    height: entity.placement.initialSize.height,
    ...(entity.placement.zIndex ? { zIndex: entity.placement.zIndex } : {}),
  }
  if (entity.placement.nodeType === 'group') {
    return {
      ...base,
      data: { label: entity.label, digitalTwinBinding: binding },
    }
  }
  const parts = build.parts
    .filter((part) => part.entityId === entity.id)
    .map((part) => materializeTwinBuildPart(build, part))
    .filter(Boolean)
  const data = normalizeSystemNodeData({
    ...createSystemNodeData(entity.kind),
    label: entity.label,
    description: entity.description,
    purpose: entity.purpose,
    responsibility: entity.responsibility,
    constraints: entity.constraints,
    evidence: entity.evidenceSummary,
    environment: entity.environment,
    sourceKind: entity.sourceKind,
    provider: entity.provider,
    externalRef: entity.externalRef,
    ...(entity.trustZoneId ? { trustZone: entityTrustZone(build, entity) } : {}),
    ...(parts.length ? { systemParts: parts } : {}),
    digitalTwinBinding: binding,
  })
  return { ...base, data }
}

function relationGateway(build, relation) {
  const gateway = build.gateways.find((candidate) => candidate.id === relation.gatewayId)
  return gateway ? withoutDerivedFields(gateway) : undefined
}

function endpointHandle(build, endpoint, explicitHandle, fallback) {
  if (explicitHandle) return explicitHandle
  if (!endpoint.partId) return fallback
  const part = build.parts.find((candidate) => candidate.id === endpoint.partId)
  return part ? `p-${part.placement.partId}-${fallback === 'right' ? 'r' : 'l'}` : fallback
}

export function materializeTwinBuildRelation(build, relation) {
  const sourceEntity = build.entities.find((entity) => entity.id === relation.source.entityId)
  const targetEntity = build.entities.find((entity) => entity.id === relation.target.entityId)
  const relationData = createEdgeRelationData(relation.relationType, relation.relationLabel, true, {
    relationSourceKind: relation.sourceKind,
    relationConfidence: relation.confidence,
    relationEvidence: relation.summary,
    relationEvidenceRef: evidenceRefs(build, relation.evidenceIds),
    trustGateway: relationGateway(build, relation),
  })
  if (relation.partsLink) relationData.partsLink = true
  const info = edgeRelationInfo(relationData)
  return {
    id: relation.placement.edgeId,
    source: sourceEntity.placement.nodeId,
    target: targetEntity.placement.nodeId,
    type: 'stub',
    sourceHandle: endpointHandle(build, relation.source, relation.placement.sourceHandle, 'right'),
    targetHandle: endpointHandle(build, relation.target, relation.placement.targetHandle, 'left'),
    data: relationData,
    style: { stroke: info.color, strokeWidth: 3 },
    markerEnd: info.directed ? { type: 'arrowclosed', color: info.color } : undefined,
  }
}

export function twinBuildEntityCanvasProjection(build, entity, node) {
  const parentId = entityParentNodeId(build, entity) ?? null
  if (entity.placement.nodeType === 'group') {
    return {
      type: node?.type ?? null,
      parentId: node?.parentId ?? null,
      label: node?.data?.label ?? '',
      expected: { type: 'group', parentId, label: entity.label },
    }
  }
  const data = normalizeSystemNodeData(node?.data ?? {})
  return {
    type: node?.type ?? null,
    parentId: node?.parentId ?? null,
    systemKind: data.systemKind,
    label: data.label ?? '',
    description: data.description ?? '',
    purpose: data.purpose ?? '',
    responsibility: data.responsibility ?? '',
    constraints: data.constraints ?? '',
    evidence: data.evidence ?? '',
    environment: data.environment,
    sourceKind: data.sourceKind,
    provider: data.provider,
    externalRef: data.externalRef,
    trustZoneId: data.trustZone?.id ?? null,
    expected: {
      type: 'system',
      parentId,
      systemKind: createSystemNodeData(entity.kind).systemKind,
      label: entity.label,
      description: entity.description,
      purpose: entity.purpose,
      responsibility: entity.responsibility,
      constraints: entity.constraints,
      evidence: entity.evidenceSummary,
      environment: entity.environment,
      sourceKind: entity.sourceKind,
      provider: entity.provider,
      externalRef: entity.externalRef,
      trustZoneId: entity.trustZoneId,
    },
  }
}

export function findTwinBuildEntityNode(build, entity, canvas) {
  const nodes = Array.isArray(canvas?.nodes) ? canvas.nodes : []
  return nodes.find((node) => node.id === entity.placement.nodeId)
    ?? nodes.find((node) => (
      node.data?.digitalTwinBinding?.sourceId === build.source.id
      && node.data.digitalTwinBinding.entityKey === entity.id
    ))
    ?? null
}
