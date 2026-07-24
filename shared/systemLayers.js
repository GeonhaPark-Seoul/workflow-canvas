const ANNOTATION_NODE_TYPES = new Set(['stage', 'memo', 'content', 'group'])
const SYSTEM_LAYER_VIEW_PREFIX = 'view:system-layer:'
const LEGACY_OFFICIAL_LAYER_IDS = new Set(['L1', 'L2', 'L3', 'L4'])
// User-created layer ids: `u` + 4-24 base36 chars. Layer meaning lives in the
// saved view itself; there is no built-in layer catalog or kind-to-layer map.
const CUSTOM_LAYER_ID_PATTERN = /^u[0-9a-z]{4,24}$/
const CUSTOM_LAYER_COLORS = Object.freeze([
  '#f59e0b', '#ec4899', '#14b8a6', '#8b5cf6', '#ef4444', '#84cc16', '#0ea5e9', '#f97316',
])

export function normalizeSystemLayerId(value) {
  return typeof value === 'string' && CUSTOM_LAYER_ID_PATTERN.test(value) ? value : null
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

export function effectiveSystemLayerForNode(node) {
  return normalizeNodePresentation(node?.data?.presentation)?.layerOverride ?? null
}

export function isSystemLayerView(view) {
  return view?.viewKind === 'system-layer' && !!normalizeSystemLayerId(view?.systemLayer)
}

export function systemLayerFromView(view) {
  return normalizeSystemLayerId(view?.systemLayer)
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

function colorForLayerId(id) {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) hash = ((hash * 31) + id.charCodeAt(index)) | 0
  return CUSTOM_LAYER_COLORS[Math.abs(hash) % CUSTOM_LAYER_COLORS.length]
}

// Ordered switcher entries come entirely from the canvas's saved layer views.
// The same metadata feeds portal labels and ordering.
export function systemLayerOptionsFromViews(views = []) {
  const layerViews = (Array.isArray(views) ? views : []).filter(isSystemLayerView)
  const options = []
  const seen = new Set()
  for (const view of layerViews) {
    const id = systemLayerFromView(view)
    if (!id || seen.has(id)) continue
    seen.add(id)
    const label = view.name || '사용자 층'
    options.push({
      id,
      label,
      short: label.slice(0, 2),
      color: colorForLayerId(id),
      question: '',
      order: options.length + 1,
    })
  }
  return options
}

// Removes only the retired built-in L1-L4 layer views. Ordinary saved views and
// user-created layers are preserved. Returning the original array when unchanged
// keeps React state updates stable.
export function pruneLegacyOfficialSystemLayerViews(views = []) {
  const current = Array.isArray(views) ? views : []
  const filtered = current.filter((view) => !(
    view?.viewKind === 'system-layer'
    && LEGACY_OFFICIAL_LAYER_IDS.has(view?.systemLayer)
  ))
  return filtered.length === current.length ? current : filtered
}

// Deleting a layer clears matching overrides. Those nodes remain available in
// the all-nodes view and can be assigned to another layer later.
export function removeSystemLayerFromNodes(nodes = [], layerId) {
  const normalized = normalizeSystemLayerId(layerId)
  if (!normalized) return nodes
  return (nodes ?? []).map((node) => {
    const override = normalizeNodePresentation(node?.data?.presentation)?.layerOverride
    if (override !== normalized) return node
    return { ...node, data: withSystemLayerOverride(node.data, null) }
  })
}

// Layer filtering is enabled only by layer views owned by the canvas. Nodes and
// stable self-map group ids no longer imply or backfill a layer contract.
export function canvasSupportsSystemLayers(_nodes = [], views = []) {
  return (views ?? []).some(isSystemLayerView)
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

// layerMeta: optional Map(layerId -> {short, label, order}) so user layers
// resolve to their names and order in portals instead of raw ids.
export function createSystemLayerProjection(nodes = [], edges = [], activeLayerId = null, layerMeta = null) {
  const metaFor = (id) => (layerMeta?.get?.(id)) ?? null
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
