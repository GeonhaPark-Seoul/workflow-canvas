import {
  sourceTwinEntities,
  sourceTwinEntityMap,
} from './sourceTwin.js'
import {
  groupSourceTwinEntitiesByArea,
  groupSourceTwinEntitiesBySubsystem,
  sourceTwinAreaId,
  sourceTwinSubsystemId,
} from './sourceTwinSemantics.js'
import {
  sourceComponentsForSubsystem,
  sourceEntityIsModuleAsset,
} from './sourceAssetHierarchy.js'
import { sourceFlowsForModule } from './sourceFlows.js'

export const SOURCE_CODE_WORLD_PROJECTION_SCHEMA_VERSION = 1

export const SOURCE_CODE_WORLD_LODS = Object.freeze({
  overview: Object.freeze({
    maxAreas: 24,
    maxSubsystems: 96,
    maxComponents: 200,
    maxParts: 320,
    maxEdges: 520,
    maxFocusParts: 48,
    entityScope: 'files',
  }),
  balanced: Object.freeze({
    maxAreas: 32,
    maxSubsystems: 160,
    maxComponents: 320,
    maxParts: 900,
    maxEdges: 1_600,
    maxFocusParts: 80,
    entityScope: 'modules',
  }),
  detail: Object.freeze({
    maxAreas: 48,
    maxSubsystems: 240,
    maxComponents: 600,
    maxParts: 2_000,
    maxEdges: 3_000,
    maxFocusParts: 120,
    entityScope: 'all',
  }),
})

const VALID_LODS = new Set(Object.keys(SOURCE_CODE_WORLD_LODS))
const VALID_PERSPECTIVES = new Set(['all', 'functionality', 'code', 'database', 'security', 'deployment'])
const VALID_TRACE_DIRECTIONS = new Set(['incoming', 'outgoing', 'both'])
const PART_KIND_ORDER = Object.freeze({
  file: 0,
  function: 1,
  'api-route': 2,
  'db-table': 3,
  'db-function': 4,
  'rls-policy': 5,
  deployment: 6,
  dependency: 7,
  'environment-variable': 8,
  'npm-script': 9,
})

function text(value, maximum = 800) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum)
    : ''
}

function stringList(value, maximum = 40) {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => text(item, 240)).filter(Boolean))].slice(0, maximum)
}

function boundedInteger(value, fallback, maximum) {
  const number = Number(value)
  if (!Number.isFinite(number)) return fallback
  return Math.max(1, Math.min(maximum, Math.floor(number)))
}

function normalizeLod(value, limitOverrides = {}) {
  const level = VALID_LODS.has(value) ? value : 'overview'
  const defaults = SOURCE_CODE_WORLD_LODS[level]
  return {
    level,
    entityScope: defaults.entityScope,
    limits: {
      maxAreas: boundedInteger(limitOverrides.maxAreas, defaults.maxAreas, 200),
      maxSubsystems: boundedInteger(limitOverrides.maxSubsystems, defaults.maxSubsystems, 1_000),
      maxComponents: boundedInteger(limitOverrides.maxComponents, defaults.maxComponents, 2_000),
      maxParts: boundedInteger(limitOverrides.maxParts, defaults.maxParts, 5_000),
      maxEdges: boundedInteger(limitOverrides.maxEdges, defaults.maxEdges, 10_000),
      maxFocusParts: boundedInteger(limitOverrides.maxFocusParts, defaults.maxFocusParts, 500),
    },
  }
}

function repositoryMetadata(manifest) {
  const source = manifest?.source && typeof manifest.source === 'object' ? manifest.source : {}
  const profile = source.profile && typeof source.profile === 'object' ? source.profile : {}
  const repositoryUrl = text(source.repositoryUrl, 500).replace(/\/$/, '')
  const match = repositoryUrl.match(/^https:\/\/github\.com\/([^/]+)\/([^/#]+?)(?:\.git)?$/i)
  const owner = text(match?.[1], 160)
  const name = text(match?.[2], 160)
  const sourceLabel = text(source.label, 240)
  return {
    id: text(source.id || manifest?.id, 240),
    label: sourceLabel || name,
    repositoryUrl,
    owner,
    name,
    defaultBranch: text(source.defaultBranch, 160),
    observationMode: text(source.observationMode, 160),
    linked: Boolean(repositoryUrl),
    contentIncluded: source.contentIncluded === true,
    credentialValuesIncluded: source.credentialValuesIncluded === true,
    project: {
      id: text(profile.id || name || source.id, 240),
      label: text(profile.label || sourceLabel || name, 240),
      version: text(profile.version, 80),
      contractVersion: Number.isInteger(profile.contractVersion) ? profile.contractVersion : null,
      capabilities: stringList(profile.capabilities, 80),
    },
  }
}

function baseProjection(manifest, lod, perspective, query) {
  return {
    schemaVersion: SOURCE_CODE_WORLD_PROJECTION_SCHEMA_VERSION,
    sourceManifestId: text(manifest?.id, 240),
    sourceManifestSchemaVersion: Number.isInteger(manifest?.schemaVersion) ? manifest.schemaVersion : null,
    repository: repositoryMetadata(manifest),
    perspective,
    query,
    lod,
    status: 'ready',
    emptyState: null,
    districts: [],
    groups: {
      subsystems: [],
      components: [],
    },
    parts: [],
    edges: [],
    counts: {
      sourceEntities: Array.isArray(manifest?.entities) ? manifest.entities.length : 0,
      sourceRelations: Array.isArray(manifest?.relations) ? manifest.relations.length : 0,
      candidateParts: 0,
      visibleParts: 0,
      visibleEdges: 0,
      areas: 0,
      subsystems: 0,
      components: 0,
    },
    truncation: {
      active: false,
      parts: 0,
      edges: 0,
      areas: 0,
      subsystems: 0,
      components: 0,
    },
    diagnostics: [],
  }
}

function emptyProjection(manifest, lod, perspective, query, code, description) {
  const projection = baseProjection(manifest, lod, perspective, query)
  projection.status = 'empty'
  projection.emptyState = {
    code,
    title: '표시할 코드 실체가 없습니다',
    description,
  }
  return projection
}

function entitySortKey(entity, areaOrder, subsystemOrder) {
  const areaId = sourceTwinAreaId(entity)
  const subsystemId = sourceTwinSubsystemId(entity)
  const kindOrder = PART_KIND_ORDER[entity?.kind] ?? 99
  const line = Number.isInteger(entity?.lineStart) ? String(entity.lineStart).padStart(9, '0') : '999999999'
  return [
    String(areaOrder.get(areaId) ?? 9_999).padStart(5, '0'),
    String(subsystemOrder.get(subsystemId) ?? 9_999).padStart(5, '0'),
    String(kindOrder).padStart(3, '0'),
    text(entity?.path, 800),
    line,
    text(entity?.label, 240),
    text(entity?.id, 800),
  ].join('\u0000')
}

function relationSortKey(relation) {
  return [
    text(relation?.source, 800),
    text(relation?.target, 800),
    text(relation?.type, 160),
    text(relation?.id, 800),
  ].join('\u0000')
}

function uniqueEntities(entities) {
  const seen = new Set()
  return entities.filter((entity) => {
    const id = text(entity?.id, 800)
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function validRelations(manifest, entityMap) {
  const seen = new Set()
  return (Array.isArray(manifest?.relations) ? manifest.relations : [])
    .filter((relation) => {
      const id = text(relation?.id, 800)
      const type = text(relation?.type, 160)
      const source = text(relation?.source, 800)
      const target = text(relation?.target, 800)
      if (!id || !type || !source || !target || seen.has(id)) return false
      if (!entityMap.has(source) || !entityMap.has(target)) return false
      seen.add(id)
      return true
    })
    .sort((left, right) => relationSortKey(left).localeCompare(relationSortKey(right)))
}

function scopeAllowsEntity(manifest, entity, scope) {
  if (scope === 'all') return true
  if (scope === 'files') return entity?.kind === 'file'
  return sourceEntityIsModuleAsset(manifest, entity)
}

function focusEntityIds(relations, entityMap, selectedId, pinnedEntityIds, maximum) {
  const roots = [...new Set([
    text(selectedId, 800),
    ...(Array.isArray(pinnedEntityIds) ? pinnedEntityIds.map((id) => text(id, 800)) : []),
  ].filter((id) => id && entityMap.has(id)))]
  if (!roots.length) return []
  const ids = [...roots]
  const seen = new Set(roots)
  const rootSet = new Set(roots)
  for (const relation of relations) {
    let neighbor = ''
    if (rootSet.has(relation.source)) neighbor = relation.target
    else if (rootSet.has(relation.target)) neighbor = relation.source
    if (!neighbor || seen.has(neighbor)) continue
    seen.add(neighbor)
    ids.push(neighbor)
    if (ids.length >= maximum) break
  }
  return ids
}

function selectGroupsWithFocus(groups, maximum, focusedIds) {
  if (groups.length <= maximum) return groups
  const focused = groups.filter((group) => group.entities.some((entity) => focusedIds.has(entity.id)))
  const rest = groups.filter((group) => !group.entities.some((entity) => focusedIds.has(entity.id)))
  const selectedIds = new Set([...focused, ...rest].slice(0, maximum).map((group) => group.id))
  return groups.filter((group) => selectedIds.has(group.id))
}

function projectEdge(relation) {
  return {
    id: relation.id,
    type: relation.type,
    source: relation.source,
    target: relation.target,
    names: stringList(relation.names),
    operations: stringList(relation.operations),
    ...(typeof relation.dynamic === 'boolean' ? { dynamic: relation.dynamic } : {}),
  }
}

function projectPart(entity, parentPartId, componentIds) {
  const isFile = entity.kind === 'file'
  const isFunction = entity.kind === 'function'
  return {
    id: entity.id,
    entityKind: text(entity.kind, 120),
    role: isFile ? 'module' : (isFunction ? 'code-part' : 'resource'),
    label: text(entity.label || entity.name || entity.path || entity.id, 240),
    path: text(entity.path, 800),
    language: text(entity.language, 80),
    layer: text(entity.layer, 120),
    lineStart: Number.isInteger(entity.lineStart) ? entity.lineStart : null,
    lineEnd: Number.isInteger(entity.lineEnd) ? entity.lineEnd : null,
    areaId: sourceTwinAreaId(entity),
    subsystemId: sourceTwinSubsystemId(entity),
    parentPartId: text(parentPartId, 800),
    componentIds: [...componentIds].sort(),
    summary: text(entity.summary, 800),
    userImpact: text(entity.userImpact, 800),
    technicalSummary: text(entity.technicalSummary, 800),
    tags: stringList(entity.tags, 40),
    fingerprint: text(entity.fingerprint, 120),
    explanationFingerprint: text(entity.explanationFingerprint, 120),
    explanationBasis: {
      method: text(entity.explanationBasis?.method, 160),
      refs: stringList(entity.explanationBasis?.refs, 12),
    },
  }
}

/**
 * Converts a Source Lens manifest into normalized, capped data for the Code World UI.
 * Every part ID and edge ID remains the identity emitted by Source Lens.
 */
export function createSourceCodeWorldProjection(manifest, {
  perspective: perspectiveInput = 'code',
  query: queryInput = '',
  lod: lodInput = 'overview',
  limits: limitOverrides = {},
  selectedId = '',
  pinnedEntityIds = [],
} = {}) {
  const perspective = VALID_PERSPECTIVES.has(perspectiveInput) ? perspectiveInput : 'code'
  const query = text(queryInput, 300)
  const lod = normalizeLod(lodInput, limitOverrides)
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return emptyProjection(
      null,
      lod,
      perspective,
      query,
      'source-manifest-unavailable',
      'Source Lens 분석 결과가 아직 전달되지 않았습니다.',
    )
  }
  if (!Array.isArray(manifest.entities) || manifest.entities.length === 0) {
    return emptyProjection(
      manifest,
      lod,
      perspective,
      query,
      'source-entities-empty',
      'Source Lens manifest에 코드 실체가 없습니다. 저장소를 다시 관측해 주세요.',
    )
  }

  const entityMap = sourceTwinEntityMap(manifest)
  const relations = validRelations(manifest, entityMap)
  const areaOrder = new Map((manifest.areas ?? []).map((item, index) => [item.id, item.order ?? index]))
  const subsystemOrder = new Map((manifest.subsystems ?? []).map((item, index) => [item.id, item.order ?? index]))
  const compareEntities = (left, right) => (
    entitySortKey(left, areaOrder, subsystemOrder).localeCompare(entitySortKey(right, areaOrder, subsystemOrder), 'ko')
  )
  const candidateLimit = Math.min(2_000, Math.max(lod.limits.maxParts * 4, lod.limits.maxParts))
  const queried = sourceTwinEntities(manifest, {
    perspective,
    query,
    limit: candidateLimit,
  })
  if (queried.length === 0) {
    return emptyProjection(
      manifest,
      lod,
      perspective,
      query,
      'source-entities-no-match',
      query
        ? `“${query}”에 일치하는 Source Lens 코드 실체가 없습니다.`
        : `“${perspective}” 관점에 표시할 Source Lens 코드 실체가 없습니다.`,
    )
  }

  let scoped = query
    ? queried
    : queried.filter((entity) => scopeAllowsEntity(manifest, entity, lod.entityScope))
  if (scoped.length === 0) scoped = queried
  scoped = uniqueEntities([...scoped].sort(compareEntities))

  const focusIds = focusEntityIds(
    relations,
    entityMap,
    selectedId,
    pinnedEntityIds,
    lod.limits.maxFocusParts,
  )
  const focusedSet = new Set(focusIds)
  const focused = focusIds.map((id) => entityMap.get(id)).filter(Boolean).sort(compareEntities)
  let visibleEntities = uniqueEntities([...focused, ...scoped]).slice(0, lod.limits.maxParts)

  const allAreaGroups = groupSourceTwinEntitiesByArea(manifest, visibleEntities)
  const selectedAreaGroups = selectGroupsWithFocus(allAreaGroups, lod.limits.maxAreas, focusedSet)
  const allowedAreaIds = new Set(selectedAreaGroups.map((group) => group.id))
  visibleEntities = visibleEntities.filter((entity) => allowedAreaIds.has(sourceTwinAreaId(entity)))

  const allSubsystemGroups = groupSourceTwinEntitiesBySubsystem(manifest, visibleEntities)
  const selectedSubsystemGroups = selectGroupsWithFocus(allSubsystemGroups, lod.limits.maxSubsystems, focusedSet)
  const allowedSubsystemIds = new Set(selectedSubsystemGroups.map((group) => group.id))
  visibleEntities = visibleEntities.filter((entity) => allowedSubsystemIds.has(sourceTwinSubsystemId(entity)))
  const visibleIdSet = new Set(visibleEntities.map((entity) => entity.id))

  const containsParent = new Map()
  for (const relation of relations) {
    if (relation.type === 'contains' && !containsParent.has(relation.target)) {
      containsParent.set(relation.target, relation.source)
    }
  }

  const componentCandidates = []
  for (const subsystem of selectedSubsystemGroups) {
    const subsystemEntities = visibleEntities.filter((entity) => (
      sourceTwinAreaId(entity) === subsystem.area
      && sourceTwinSubsystemId(entity) === subsystem.id
    ))
    const components = sourceComponentsForSubsystem(
      manifest,
      subsystem.area,
      subsystem.id,
      subsystemEntities,
    )
    for (const component of components) {
      const fileIds = new Set(component.moduleIds.filter((id) => visibleIdSet.has(id)))
      const partIds = new Set(fileIds)
      for (const entity of subsystemEntities) {
        if (fileIds.has(containsParent.get(entity.id))) partIds.add(entity.id)
      }
      if (!partIds.size) continue
      componentCandidates.push({
        id: `component:${component.id}`,
        componentId: component.id,
        areaId: subsystem.area,
        subsystemId: subsystem.id,
        label: component.label,
        kind: component.kind,
        description: component.description,
        parentComponentId: component.parentId,
        technicalVersion: component.technicalVersion,
        maturity: component.maturity,
        partIds: [...partIds],
      })
    }
  }
  const componentGroups = componentCandidates
    .sort((left, right) => (
      `${left.areaId}\u0000${left.subsystemId}\u0000${left.label}\u0000${left.componentId}`
        .localeCompare(`${right.areaId}\u0000${right.subsystemId}\u0000${right.label}\u0000${right.componentId}`, 'ko')
    ))
    .slice(0, lod.limits.maxComponents)

  const componentsByPart = new Map()
  for (const component of componentGroups) {
    component.partIds = component.partIds
      .filter((id) => visibleIdSet.has(id))
      .sort((left, right) => compareEntities(entityMap.get(left), entityMap.get(right)))
    for (const partId of component.partIds) {
      const ids = componentsByPart.get(partId) ?? []
      ids.push(component.componentId)
      componentsByPart.set(partId, ids)
    }
  }

  const parts = visibleEntities
    .sort(compareEntities)
    .map((entity) => projectPart(
      entity,
      visibleIdSet.has(containsParent.get(entity.id)) ? containsParent.get(entity.id) : '',
      componentsByPart.get(entity.id) ?? [],
    ))
  const partById = new Map(parts.map((part) => [part.id, part]))

  const subsystemGroups = selectedSubsystemGroups
    .map((subsystem) => {
      const partIds = parts
        .filter((part) => part.areaId === subsystem.area && part.subsystemId === subsystem.id)
        .map((part) => part.id)
      if (!partIds.length) return null
      const componentIds = componentGroups
        .filter((component) => component.areaId === subsystem.area && component.subsystemId === subsystem.id)
        .map((component) => component.componentId)
      return {
        id: `subsystem:${subsystem.id}`,
        subsystemId: subsystem.id,
        areaId: subsystem.area,
        label: subsystem.label,
        description: subsystem.description,
        componentIds,
        partIds,
        directPartIds: partIds.filter((id) => !(componentsByPart.get(id)?.length)),
      }
    })
    .filter(Boolean)
  const subsystemByArea = new Map()
  for (const subsystem of subsystemGroups) {
    const ids = subsystemByArea.get(subsystem.areaId) ?? []
    ids.push(subsystem.subsystemId)
    subsystemByArea.set(subsystem.areaId, ids)
  }
  const districts = selectedAreaGroups
    .map((area) => {
      const partIds = parts.filter((part) => part.areaId === area.id).map((part) => part.id)
      if (!partIds.length) return null
      return {
        id: `area:${area.id}`,
        areaId: area.id,
        label: area.label,
        description: area.description,
        subsystemIds: subsystemByArea.get(area.id) ?? [],
        partIds,
      }
    })
    .filter(Boolean)

  const edgeCandidates = relations.filter((relation) => (
    partById.has(relation.source) && partById.has(relation.target)
  ))
  const focusedEdges = edgeCandidates.filter((relation) => (
    focusedSet.has(relation.source) || focusedSet.has(relation.target)
  ))
  const regularEdges = edgeCandidates.filter((relation) => (
    !focusedSet.has(relation.source) && !focusedSet.has(relation.target)
  ))
  const edges = [...focusedEdges, ...regularEdges]
    .slice(0, lod.limits.maxEdges)
    .map(projectEdge)

  const projection = baseProjection(manifest, lod, perspective, query)
  projection.districts = districts
  projection.groups = {
    subsystems: subsystemGroups,
    components: componentGroups,
  }
  projection.parts = parts
  projection.edges = edges
  projection.counts = {
    sourceEntities: manifest.entities.length,
    sourceRelations: Array.isArray(manifest.relations) ? manifest.relations.length : 0,
    candidateParts: scoped.length,
    visibleParts: parts.length,
    visibleEdges: edges.length,
    areas: districts.length,
    subsystems: subsystemGroups.length,
    components: componentGroups.length,
  }
  projection.truncation = {
    active: (
      scoped.length > parts.length
      || edgeCandidates.length > edges.length
      || allAreaGroups.length > districts.length
      || allSubsystemGroups.length > subsystemGroups.length
      || componentCandidates.length > componentGroups.length
    ),
    parts: Math.max(0, scoped.length - parts.length),
    edges: Math.max(0, edgeCandidates.length - edges.length),
    areas: Math.max(0, allAreaGroups.length - districts.length),
    subsystems: Math.max(0, allSubsystemGroups.length - subsystemGroups.length),
    components: Math.max(0, componentCandidates.length - componentGroups.length),
  }
  const invalidRelationCount = (manifest.relations?.length ?? 0) - relations.length
  if (invalidRelationCount > 0) {
    projection.diagnostics.push({
      code: 'invalid-source-relations-omitted',
      count: invalidRelationCount,
      message: 'Source Lens entity를 가리키지 않는 relation은 화면 투영에서 제외했습니다.',
    })
  }
  return projection
}

/**
 * Returns inspector-ready context for one visible Source Lens entity.
 * On-demand flow data stays separate from manifest relation edges.
 */
export function sourceCodeWorldSelection(projection, selectedId, {
  flowCatalog = null,
  flowLimit = 40,
} = {}) {
  const id = text(selectedId, 800)
  const part = projection?.parts?.find((item) => item.id === id)
  if (!part) {
    return {
      status: 'not-found',
      selectedId: id,
      part: null,
      district: null,
      subsystem: null,
      components: [],
      incomingEdges: [],
      outgoingEdges: [],
      connectedParts: [],
      sourceFlows: null,
    }
  }
  const incomingEdges = (projection.edges ?? []).filter((edge) => edge.target === id)
  const outgoingEdges = (projection.edges ?? []).filter((edge) => edge.source === id)
  const connectedIds = new Set([
    ...incomingEdges.map((edge) => edge.source),
    ...outgoingEdges.map((edge) => edge.target),
  ])
  return {
    status: 'ready',
    selectedId: id,
    part,
    district: projection.districts.find((item) => item.areaId === part.areaId) ?? null,
    subsystem: projection.groups?.subsystems?.find((item) => item.subsystemId === part.subsystemId) ?? null,
    components: (projection.groups?.components ?? []).filter((item) => item.partIds.includes(id)),
    incomingEdges,
    outgoingEdges,
    connectedParts: (projection.parts ?? []).filter((item) => connectedIds.has(item.id)),
    sourceFlows: sourceFlowsForModule(flowCatalog, id, {
      limit: boundedInteger(flowLimit, 40, 120),
    }),
  }
}

/**
 * Performs a deterministic breadth-first trace over visible manifest relations.
 */
export function traceSourceCodeWorld(projection, startId, {
  direction: directionInput = 'both',
  depth: depthInput = 2,
  limit: limitInput = 120,
  relationTypes = [],
} = {}) {
  const id = text(startId, 800)
  const parts = Array.isArray(projection?.parts) ? projection.parts : []
  const edges = Array.isArray(projection?.edges) ? projection.edges : []
  const partById = new Map(parts.map((part) => [part.id, part]))
  if (!id || !partById.has(id)) {
    return {
      status: 'not-found',
      startId: id,
      direction: VALID_TRACE_DIRECTIONS.has(directionInput) ? directionInput : 'both',
      partIds: [],
      edgeIds: [],
      parts: [],
      edges: [],
      depthByPartId: {},
      truncated: false,
    }
  }
  const direction = VALID_TRACE_DIRECTIONS.has(directionInput) ? directionInput : 'both'
  const maximumDepth = boundedInteger(depthInput, 2, 8)
  const maximumParts = boundedInteger(limitInput, 120, 500)
  const allowedTypes = new Set(stringList(relationTypes, 80))
  const eligibleEdges = edges.filter((edge) => !allowedTypes.size || allowedTypes.has(edge.type))
  const adjacency = new Map()
  const add = (nodeId, edge, neighborId) => {
    const rows = adjacency.get(nodeId) ?? []
    rows.push({ edge, neighborId })
    adjacency.set(nodeId, rows)
  }
  for (const edge of eligibleEdges) {
    if (direction !== 'incoming') add(edge.source, edge, edge.target)
    if (direction !== 'outgoing') add(edge.target, edge, edge.source)
  }

  const depthByPartId = { [id]: 0 }
  const visited = new Set([id])
  const selectedEdgeIds = new Set()
  const queue = [id]
  let truncated = false
  while (queue.length) {
    const current = queue.shift()
    const currentDepth = depthByPartId[current]
    if (currentDepth >= maximumDepth) continue
    for (const { edge, neighborId } of adjacency.get(current) ?? []) {
      if (!partById.has(neighborId)) continue
      if (visited.has(neighborId)) {
        selectedEdgeIds.add(edge.id)
        continue
      }
      if (visited.size >= maximumParts) {
        truncated = true
        continue
      }
      visited.add(neighborId)
      selectedEdgeIds.add(edge.id)
      depthByPartId[neighborId] = currentDepth + 1
      queue.push(neighborId)
    }
  }
  const partIds = [...visited]
  const edgeIds = edges.filter((edge) => selectedEdgeIds.has(edge.id)).map((edge) => edge.id)
  return {
    status: 'ready',
    startId: id,
    direction,
    partIds,
    edgeIds,
    parts: partIds.map((partId) => partById.get(partId)),
    edges: edges.filter((edge) => selectedEdgeIds.has(edge.id)),
    depthByPartId,
    truncated,
  }
}
