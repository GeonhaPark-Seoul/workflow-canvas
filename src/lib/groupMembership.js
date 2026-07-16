import { absoluteNodePosition } from './canvasGeometry.js'

export const GROUP_MEMBERSHIP_OVERLAP_THRESHOLD = 0.35

const DEFAULT_NODE_DIMENSIONS = Object.freeze({
  stage: { width: 200, height: 80 },
  memo: { width: 160, height: 80 },
  content: { width: 220, height: 140 },
  system: { width: 240, height: 130 },
  intent: { width: 220, height: 120 },
  group: { width: 320, height: 220 },
})

function positiveDimension(...values) {
  return values.find((value) => Number.isFinite(value) && value > 0) ?? 0
}

export function nodeDimensions(node) {
  const fallback = DEFAULT_NODE_DIMENSIONS[node?.type] ?? { width: 160, height: 80 }
  return {
    width: positiveDimension(node?.measured?.width, node?.width, fallback.width),
    height: positiveDimension(node?.measured?.height, node?.height, fallback.height),
  }
}

export function nodeAbsoluteRect(node, byId) {
  const position = absoluteNodePosition(node, byId)
  const { width, height } = nodeDimensions(node)
  return { ...position, width, height }
}

function overlapArea(left, right) {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  return width * height
}

function groupCandidates(nodes, allowedGroupIds) {
  const allowed = allowedGroupIds == null ? null : new Set(allowedGroupIds)
  return (nodes ?? []).filter((node) => (
    node.type === 'group'
    && !node.parentId
    && (!allowed || allowed.has(node.id))
  ))
}

export function findGroupAtPoint(nodes, point, { allowedGroupIds = null } = {}) {
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) return null
  const byId = new Map((nodes ?? []).map((node) => [node.id, node]))
  return groupCandidates(nodes, allowedGroupIds)
    .map((group) => ({ group, rect: nodeAbsoluteRect(group, byId) }))
    .filter(({ rect }) => (
      point.x >= rect.x && point.x <= rect.x + rect.width
      && point.y >= rect.y && point.y <= rect.y + rect.height
    ))
    .sort((left, right) => (
      left.rect.width * left.rect.height - right.rect.width * right.rect.height
    ))[0]?.group ?? null
}

export function findGroupDropTarget(nodes, nodeId, {
  allowedGroupIds = null,
  overlapThreshold = GROUP_MEMBERSHIP_OVERLAP_THRESHOLD,
} = {}) {
  const byId = new Map((nodes ?? []).map((node) => [node.id, node]))
  const node = byId.get(nodeId)
  if (!node || node.type === 'group') return null

  const nodeRect = nodeAbsoluteRect(node, byId)
  const nodeArea = nodeRect.width * nodeRect.height
  if (!nodeArea) return null

  return groupCandidates(nodes, allowedGroupIds)
    .filter((group) => group.id !== node.id)
    .map((group) => {
      const rect = nodeAbsoluteRect(group, byId)
      return {
        group,
        rect,
        overlapRatio: overlapArea(nodeRect, rect) / nodeArea,
      }
    })
    .filter((candidate) => candidate.overlapRatio >= overlapThreshold)
    .sort((left, right) => (
      right.overlapRatio - left.overlapRatio
      || left.rect.width * left.rect.height - right.rect.width * right.rect.height
    ))[0]?.group ?? null
}

export function positionInsideGroup(nodes, groupId, absolutePosition, {
  width = 0,
  height = 0,
  padding = 12,
} = {}) {
  const byId = new Map((nodes ?? []).map((node) => [node.id, node]))
  const group = byId.get(groupId)
  if (!group || group.type !== 'group') return absolutePosition

  const groupPosition = absoluteNodePosition(group, byId)
  const groupSize = nodeDimensions(group)
  const maxX = Math.max(padding, groupSize.width - width - padding)
  const maxY = Math.max(padding, groupSize.height - height - padding)
  return {
    x: Math.max(padding, Math.min(maxX, absolutePosition.x - groupPosition.x)),
    y: Math.max(padding, Math.min(maxY, absolutePosition.y - groupPosition.y)),
  }
}

export function reparentNodePreservingPosition(nodes, nodeId, targetGroupId = null) {
  const byId = new Map((nodes ?? []).map((node) => [node.id, node]))
  const node = byId.get(nodeId)
  if (!node || node.type === 'group' || node.parentId === targetGroupId) return nodes

  const absolute = absoluteNodePosition(node, byId)
  if (!targetGroupId) {
    const { parentId: _parentId, ...withoutParent } = node
    return nodes.map((candidate) => candidate.id === nodeId
      ? { ...withoutParent, position: absolute }
      : candidate)
  }

  const group = byId.get(targetGroupId)
  if (!group || group.type !== 'group' || group.parentId) return nodes
  const groupPosition = absoluteNodePosition(group, byId)
  return nodes.map((candidate) => candidate.id === nodeId
    ? {
        ...node,
        parentId: targetGroupId,
        position: {
          x: absolute.x - groupPosition.x,
          y: absolute.y - groupPosition.y,
        },
      }
    : candidate)
}
