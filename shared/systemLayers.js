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
// Custom (user-created) layer ids: `u` + 4-24 base36 chars. Layers are a
// general canvas feature (MASTER.md §2.4); L1-L4 are the protected presets
// of system maps, everything else is user-defined.
const CUSTOM_LAYER_ID_PATTERN = /^u[0-9a-z]{4,24}$/
const CUSTOM_LAYER_COLORS = Object.freeze([
  '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#ef4444', '#84cc16', '#0ea5e9', '#f97316',
])

export function isOfficialSystemLayerId(value) {
  return typeof value === 'string' && LAYER_BY_ID.has(value)
}

export function normalizeSystemLayerId(value) {
  if (typeof value !== 'string') return null
  if (LAYER_BY_ID.has(value)) return value
  return CUSTOM_LAYER_ID_PATTERN.test(value) ? value : null
}

export function systemLayerDefinition(value) {
  return LAYER_BY_ID.get(value) ?? null
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

export function createCustomSystemLayerView(name) {
  const trimmed = String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  if (!trimmed) return null
  const layerId = `u${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`.slice(0, 25)
  return {
    id: `${SYSTEM_LAYER_VIEW_PREFIX}custom:${layerId}`,
    name: trimmed,
    viewKind: 'system-layer',
    systemLayer: layerId,
  }
}

export function isCustomSystemLayerView(view) {
  return isSystemLayerView(view) && !isOfficialSystemLayerId(view.systemLayer)
}

// Ordered switcher entries derived from the canvas's own views: official
// presets first (L1-L4 order), then custom layers in view order. The result
// also feeds portal labels/ordering so custom layers never fall back to ids.
export function systemLayerOptionsFromViews(views = []) {
  const layerViews = (Array.isArray(views) ? views : []).filter(isSystemLayerView)
  const official = []
  const custom = []
  const seen = new Set()
  for (const view of layerViews) {
    const id = systemLayerFromView(view)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const def = systemLayerDefinition(id)
    if (def) {
      official.push({ ...def, short: def.id, official: true })
    } else {
      custom.push({
        id,
        label: view.name || '사용자 층',
        short: (view.name || '층').slice(0, 2),
        color: CUSTOM_LAYER_COLORS[custom.length % CUSTOM_LAYER_COLORS.length],
        question: '',
        official: false,
      })
    }
  }
  official.sort((left, right) => left.order - right.order)
  return [...official.map((item, i) => ({ ...item })), ...custom.map((item, index) => ({
    ...item,
    order: 100 + index,
  }))]
}

// Pure helper for deleting a custom layer: clears matching overrides so nodes
// return to the derived default (assets) or the everywhere-visible legacy
// mode (annotations) instead of vanishing behind a dead layer id.
export function removeSystemLayerFromNodes(nodes = [], layerId) {
  const normalized = normalizeSystemLayerId(layerId)
  if (!normalized) return nodes
  return (nodes ?? []).map((node) => {
    const override = normalizeNodePresentation(node?.data?.presentation)?.layerOverride
    if (override !== normalized) return node
    return { ...node, data: withSystemLayerOverride(node.data, null) }
  })
}

// Stable group ids from the self system map template (present since the map
// template's first commit, well before systemMapSnapshot metadata existed).
// A map created before that metadata field shipped still carries these ids,
// so detection must not depend on systemMapSnapshot alone.
const LEGACY_SYSTEM_MAP_GROUP_IDS = new Set([
  'map-group-experience', 'map-group-runtime', 'map-group-data', 'map-group-development',
])

// True only for the self system map template — gates the official L1-L4
// preset backfill. Generic canvases never get presets forced onto them.
export function isSystemMapTemplateCanvas(nodes = []) {
  return (nodes ?? []).some((node) => (
    node?.data?.redacted !== true
    && (
      node?.data?.systemMapSnapshot?.source === 'server-template'
      || LEGACY_SYSTEM_MAP_GROUP_IDS.has(node?.id)
    )
  ))
}

// Layers are enabled wherever any layer view exists (user-created included),
// or on a recognized system map template (which then backfills presets).
export function canvasSupportsSystemLayers(nodes = [], views = []) {
  if ((views ?? []).some(isSystemLayerView)) return true
  return isSystemMapTemplateCanvas(nodes)
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

// layerMeta: optional Map(layerId -> {short, label, order}) so custom (user)
// layers resolve to their names/order in portals instead of raw ids. Falls
// back to the official definition, then the id itself.
export function createSystemLayerProjection(nodes = [], edges = [], activeLayerId = null, layerMeta = null) {
  const metaFor = (id) => (layerMeta?.get?.(id)) ?? systemLayerDefinition(id) ?? null
  const orderOf = (id) => metaFor(id)?.order ?? 999
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
    const layer = metaFor(targetLayer)
    const group = portalGroups.get(key) ?? {
      id: key,
      nodeId: anchorId,
      targetLayer,
      targetLayerShort: layer?.short ?? targetLayer,
      targetLayerLabel: layer?.label ?? targetLayer,
      depthDirection: orderOf(targetLayer) > orderOf(activeLayer) ? 'down' : 'up',
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
    entries.sort((left, right) => orderOf(left.targetLayer) - orderOf(right.targetLayer))
  }

  return { activeLayer, visibleNodeIds, visibleEdgeIds, focusNodeIds, portalsByNode }
}
