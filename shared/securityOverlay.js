import {
  analyzeTrustBoundary,
  normalizeTrustGateway,
  normalizeTrustZone,
  TRUST_GATEWAY_DIRECTION_DEFS,
  TRUST_GATEWAY_EXPOSURE_DEFS,
  TRUST_GATEWAY_KIND_DEFS,
  TRUST_ZONE_KIND_DEFS,
} from './trustTopology.js'

export const SECURITY_OVERLAY_SCHEMA_VERSION = 1

const ZONE_COLORS = Object.freeze({
  unknown: '#94a3b8',
  'local-device': '#14b8a6',
  'local-network': '#22c55e',
  intranet: '#84cc16',
  'private-datacenter': '#a3e635',
  'private-cloud': '#06b6d4',
  'public-cloud': '#3b82f6',
  'public-internet': '#f59e0b',
  'external-saas': '#a855f7',
  'physical-site': '#ec4899',
})

const ZONE_LABELS = new Map(TRUST_ZONE_KIND_DEFS.map((item) => [item.id, item.label]))
const GATEWAY_LABELS = new Map(TRUST_GATEWAY_KIND_DEFS.map((item) => [item.id, item.label]))
const EXPOSURE_LABELS = new Map(TRUST_GATEWAY_EXPOSURE_DEFS.map((item) => [item.id, item.label]))
const DIRECTION_LABELS = new Map(TRUST_GATEWAY_DIRECTION_DEFS.map((item) => [item.id, item.label]))

function visibleNode(node) {
  return !!node
    && node.type === 'system'
    && node.hidden !== true
    && node.redacted !== true
    && node.data?.redacted !== true
}

function visibleEdge(edge, visibleNodeIds) {
  return !!edge
    && edge.hidden !== true
    && edge.redacted !== true
    && visibleNodeIds.has(edge.source)
    && visibleNodeIds.has(edge.target)
}

function plainLabel(value, fallback) {
  if (typeof value !== 'string') return fallback
  const label = value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
  return label || fallback
}

function overlayZone(node) {
  const normalized = normalizeTrustZone(node.data?.trustZone)
  if (normalized) return normalized
  return {
    schemaVersion: 1,
    id: 'overlay:unassigned-zone',
    kind: 'unknown',
    label: '신뢰영역 미지정',
    controlOwner: '',
    evidenceRef: '',
  }
}

function zonePresentation(zone) {
  return {
    color: ZONE_COLORS[zone.kind] ?? ZONE_COLORS.unknown,
    kindLabel: ZONE_LABELS.get(zone.kind) ?? ZONE_LABELS.get('unknown'),
  }
}

function gatewayPresentation(gateway) {
  if (!gateway) return null
  return {
    ...gateway,
    kindLabel: GATEWAY_LABELS.get(gateway.kind) ?? GATEWAY_LABELS.get('unknown'),
    exposureLabel: EXPOSURE_LABELS.get(gateway.exposure) ?? EXPOSURE_LABELS.get('unknown'),
    directionLabel: DIRECTION_LABELS.get(gateway.direction) ?? DIRECTION_LABELS.get('unknown'),
  }
}

export function createSecurityOverlayProjection(nodes = [], edges = []) {
  const visibleNodes = (Array.isArray(nodes) ? nodes : []).filter(visibleNode)
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  const nodeById = new Map()
  const zoneById = new Map()

  for (const node of visibleNodes) {
    const zone = overlayZone(node)
    const presentation = zonePresentation(zone)
    const record = {
      schemaVersion: SECURITY_OVERLAY_SCHEMA_VERSION,
      nodeId: node.id,
      nodeLabel: plainLabel(node.data?.label, node.id),
      zone,
      ...presentation,
    }
    nodeById.set(node.id, record)
    if (!zoneById.has(zone.id)) {
      zoneById.set(zone.id, {
        id: zone.id,
        label: zone.label || presentation.kindLabel,
        kind: zone.kind,
        kindLabel: presentation.kindLabel,
        color: presentation.color,
      })
    }
  }

  const edgeById = new Map()
  for (const edge of (Array.isArray(edges) ? edges : [])) {
    if (!visibleEdge(edge, visibleNodeIds)) continue
    const source = nodeById.get(edge.source)
    const target = nodeById.get(edge.target)
    const gateway = normalizeTrustGateway(edge.data?.trustGateway)
    const analysis = analyzeTrustBoundary({
      sourceZone: source.zone,
      targetZone: target.zone,
      gateway,
    })
    if (!['through-gateway', 'gateway-mismatch', 'unknown-gap'].includes(analysis.status)) continue
    edgeById.set(edge.id, {
      schemaVersion: SECURITY_OVERLAY_SCHEMA_VERSION,
      edgeId: edge.id,
      source: { id: source.nodeId, label: source.nodeLabel, zone: source.zone },
      target: { id: target.nodeId, label: target.nodeLabel, zone: target.zone },
      status: analysis.status,
      valid: analysis.valid,
      warning: ['gateway-mismatch', 'unknown-gap'].includes(analysis.status),
      reason: analysis.reason,
      gateway: gatewayPresentation(gateway),
    })
  }

  return {
    schemaVersion: SECURITY_OVERLAY_SCHEMA_VERSION,
    nodeById,
    edgeById,
    zones: [...zoneById.values()],
  }
}

export function securityOverlayHasModeledData(nodes = [], edges = []) {
  const visibleNodes = (Array.isArray(nodes) ? nodes : []).filter(visibleNode)
  const visibleNodeIds = new Set(visibleNodes.map((node) => node.id))
  return visibleNodes.some((node) => !!normalizeTrustZone(node.data?.trustZone))
    || (Array.isArray(edges) ? edges : []).some((edge) => (
      visibleEdge(edge, visibleNodeIds) && !!normalizeTrustGateway(edge.data?.trustGateway)
    ))
}
