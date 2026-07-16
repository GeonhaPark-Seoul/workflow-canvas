export const SYSTEM_LAYER_CONTRACT_VERSION = 1

export const SYSTEM_LAYER_DEFINITIONS = Object.freeze([
  { id: 'L1', label: '경험 층', question: '무엇을 할 수 있는가', color: '#22c55e', order: 1 },
  { id: 'L2', label: '앱 구조 층', question: '무엇이 돌아가는가', color: '#3b82f6', order: 2 },
  { id: 'L3', label: '데이터 층', question: '데이터는 어디에 사는가', color: '#a855f7', order: 3 },
  { id: 'L4', label: '인프라 층', question: '어디에 배치되어 있는가', color: '#64748b', order: 4 },
])

const LAYER_BY_ID = new Map(SYSTEM_LAYER_DEFINITIONS.map((item) => [item.id, item]))
const SYSTEM_KIND_LAYER = Object.freeze({
  actor: 'L1',
  engine: 'L2',
  frontend: 'L2',
  service: 'L2',
  api: 'L2',
  function: 'L2',
  auth: 'L2',
  queue: 'L2',
  mcp: 'L2',
  database: 'L3',
  table: 'L3',
  storage: 'L3',
  policy: 'L3',
  deployment: 'L4',
  external: 'L4',
  credential: 'L4',
})
const INFRASTRUCTURE_TRUST_ZONES = new Set([
  'local-device',
  'local-network',
  'intranet',
  'private-datacenter',
  'private-cloud',
  'public-cloud',
  'public-internet',
  'external-saas',
  'physical-site',
])
const ANNOTATION_NODE_TYPES = new Set(['stage', 'memo', 'content', 'group'])
const SYSTEM_LAYER_VIEW_PREFIX = 'view:system-layer:'

export function normalizeSystemLayerId(value) {
  return typeof value === 'string' && LAYER_BY_ID.has(value) ? value : null
}

export function systemLayerDefinition(value) {
  return LAYER_BY_ID.get(normalizeSystemLayerId(value)) ?? null
}

export function normalizeNodePresentation(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const layerOverride = normalizeSystemLayerId(value.layerOverride)
  return layerOverride ? { layerOverride } : null
}

export function withSystemLayerOverride(data = {}, layerId = null) {
  const normalized = normalizeSystemLayerId(layerId)
  const next = { ...data }
  if (normalized) next.presentation = { layerOverride: normalized }
  else delete next.presentation
  return next
}

export function annotationDataForSystemLayer(data = {}, layerId = null) {
  const existing = normalizeNodePresentation(data?.presentation)?.layerOverride
  if (existing) return withSystemLayerOverride(data, existing)
  const normalized = normalizeSystemLayerId(layerId)
  return normalized ? withSystemLayerOverride(data, normalized) : { ...data }
}

export function isCanvasAnnotationNode(node) {
  return ANNOTATION_NODE_TYPES.has(node?.type) && !node?.data?.digitalTwinBinding
}

// This is intentionally a pure, closed mapping. New kinds stay unclassified
// until the contract and regression fixtures are updated together.
export function deriveDefaultSystemLayer({ systemKind, trustZone } = {}) {
  if (SYSTEM_KIND_LAYER[systemKind]) return SYSTEM_KIND_LAYER[systemKind]
  return INFRASTRUCTURE_TRUST_ZONES.has(trustZone?.kind) ? 'L4' : null
}

export function effectiveSystemLayerForNode(node) {
  const override = normalizeNodePresentation(node?.data?.presentation)?.layerOverride
  return override ?? deriveDefaultSystemLayer(node?.data)
}

export function createSystemLayerViews() {
  return SYSTEM_LAYER_DEFINITIONS.map((layer) => ({
    id: `${SYSTEM_LAYER_VIEW_PREFIX}${layer.id}`,
    name: `${layer.id} ${layer.label}`,
    viewKind: 'system-layer',
    systemLayer: layer.id,
  }))
}

export function isSystemLayerView(view) {
  return view?.viewKind === 'system-layer' && !!normalizeSystemLayerId(view?.systemLayer)
}

export function systemLayerFromView(view) {
  return normalizeSystemLayerId(view?.systemLayer)
}

export function ensureSystemLayerViews(views = []) {
  const current = Array.isArray(views) ? views : []
  const present = new Set(current.filter(isSystemLayerView).map(systemLayerFromView).filter(Boolean))
  const missing = createSystemLayerViews().filter((view) => !present.has(view.systemLayer))
  return missing.length ? [...current, ...missing] : current
}

// Stable group ids from the self system map template (present since the map
// template's first commit, well before systemMapSnapshot metadata existed).
// A map created before that metadata field shipped still carries these ids,
// so detection must not depend on systemMapSnapshot alone.
const LEGACY_SYSTEM_MAP_GROUP_IDS = new Set([
  'map-group-experience', 'map-group-runtime', 'map-group-data', 'map-group-development',
])

export function canvasSupportsSystemLayers(nodes = [], views = []) {
  if ((views ?? []).some(isSystemLayerView)) return true
  return (nodes ?? []).some((node) => (
    node?.data?.redacted !== true
    && (
      node?.data?.systemMapSnapshot?.source === 'server-template'
      || LEGACY_SYSTEM_MAP_GROUP_IDS.has(node?.id)
    )
  ))
}

function nodeIsRedacted(node) {
  return node?.redacted === true || node?.data?.redacted === true
}

function edgeIsVisible(edge, nodeById) {
  return edge?.redacted !== true
    && nodeById.has(edge?.source)
    && nodeById.has(edge?.target)
    && !nodeIsRedacted(nodeById.get(edge.source))
    && !nodeIsRedacted(nodeById.get(edge.target))
}

function plainNodeLabel(node) {
  const value = String(node?.data?.label ?? node?.data?.header ?? node?.id ?? '')
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 180)
}

function relationLabel(edge) {
  return String(edge?.data?.relationLabel || edge?.data?.relationType || '관계').slice(0, 120)
}

function addAncestorIds(visibleNodeIds, nodeById) {
  for (const nodeId of [...visibleNodeIds]) {
    let current = nodeById.get(nodeId)
    const visited = new Set([nodeId])
    while (current?.parentId && nodeById.has(current.parentId) && !visited.has(current.parentId)) {
      visited.add(current.parentId)
      current = nodeById.get(current.parentId)
      if (!nodeIsRedacted(current)) visibleNodeIds.add(current.id)
    }
  }
}

export function createSystemLayerProjection(nodes = [], edges = [], activeLayerId = null) {
  const activeLayer = normalizeSystemLayerId(activeLayerId)
  if (!activeLayer) {
    return {
      activeLayer: null,
      visibleNodeIds: new Set((nodes ?? []).map((node) => node.id)),
      visibleEdgeIds: new Set((edges ?? []).map((edge) => edge.id)),
      focusNodeIds: (nodes ?? []).filter((node) => node.type !== 'group').map((node) => node.id),
      portalsByNode: new Map(),
    }
  }

  const nodeById = new Map((nodes ?? []).map((node) => [node.id, node]))
  const layerByNode = new Map()
  const visibleNodeIds = new Set()
  const focusNodeIds = []

  for (const node of nodes ?? []) {
    if (nodeIsRedacted(node)) continue
    const layer = effectiveSystemLayerForNode(node)
    layerByNode.set(node.id, layer)
    const unassignedAnnotation = isCanvasAnnotationNode(node) && node.type !== 'group' && !layer
    if (layer === activeLayer || unassignedAnnotation) {
      visibleNodeIds.add(node.id)
      if (node.type !== 'group') focusNodeIds.push(node.id)
    }
  }
  addAncestorIds(visibleNodeIds, nodeById)

  const visibleEdgeIds = new Set()
  const portalGroups = new Map()
  const addPortal = (anchorId, targetId, targetLayer, edge, relationDirection) => {
    if (!visibleNodeIds.has(anchorId) || !targetLayer) return
    const key = `${anchorId}:${targetLayer}`
    const layer = systemLayerDefinition(targetLayer)
    const group = portalGroups.get(key) ?? {
      id: key,
      nodeId: anchorId,
      targetLayer,
      targetLayerLabel: layer?.label ?? targetLayer,
      depthDirection: (layer?.order ?? 0) > (systemLayerDefinition(activeLayer)?.order ?? 0) ? 'down' : 'up',
      targets: new Map(),
    }
    const target = group.targets.get(targetId) ?? {
      nodeId: targetId,
      label: plainNodeLabel(nodeById.get(targetId)),
      relationDirections: new Set(),
      relationLabels: new Set(),
      edgeIds: new Set(),
    }
    target.relationDirections.add(relationDirection)
    target.relationLabels.add(relationLabel(edge))
    target.edgeIds.add(edge.id)
    group.targets.set(targetId, target)
    portalGroups.set(key, group)
  }

  for (const edge of edges ?? []) {
    if (!edgeIsVisible(edge, nodeById)) continue
    const sourceLayer = layerByNode.get(edge.source) ?? effectiveSystemLayerForNode(nodeById.get(edge.source))
    const targetLayer = layerByNode.get(edge.target) ?? effectiveSystemLayerForNode(nodeById.get(edge.target))
    if (sourceLayer && targetLayer && sourceLayer !== targetLayer) {
      if (sourceLayer === activeLayer) addPortal(edge.source, edge.target, targetLayer, edge, 'outgoing')
      if (targetLayer === activeLayer) addPortal(edge.target, edge.source, sourceLayer, edge, 'incoming')
      continue
    }
    if (visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)) visibleEdgeIds.add(edge.id)
  }

  const portalsByNode = new Map()
  for (const group of portalGroups.values()) {
    const targets = [...group.targets.values()]
      .map((target) => ({
        ...target,
        relationDirections: [...target.relationDirections].sort(),
        relationLabels: [...target.relationLabels].sort(),
        edgeIds: [...target.edgeIds].sort(),
      }))
      .sort((left, right) => left.label.localeCompare(right.label) || left.nodeId.localeCompare(right.nodeId))
    const portal = { ...group, count: targets.length, targets }
    const entries = portalsByNode.get(group.nodeId) ?? []
    entries.push(portal)
    portalsByNode.set(group.nodeId, entries)
  }
  for (const entries of portalsByNode.values()) {
    entries.sort((left, right) => (
      (systemLayerDefinition(left.targetLayer)?.order ?? 0) - (systemLayerDefinition(right.targetLayer)?.order ?? 0)
    ))
  }

  return { activeLayer, visibleNodeIds, visibleEdgeIds, focusNodeIds, portalsByNode }
}
