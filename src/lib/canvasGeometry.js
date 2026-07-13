export function absoluteNodePosition(node, byId) {
  let x = node.position?.x ?? 0
  let y = node.position?.y ?? 0
  let current = node
  const visited = new Set([node.id])

  while (current.parentId && byId.has(current.parentId) && !visited.has(current.parentId)) {
    visited.add(current.parentId)
    current = byId.get(current.parentId)
    x += current.position?.x ?? 0
    y += current.position?.y ?? 0
  }
  return { x, y }
}

export function boundsForNodeIds(nodes, ids) {
  const selected = new Set(ids)
  const byId = new Map((nodes ?? []).map((node) => [node.id, node]))
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const node of nodes ?? []) {
    if (!selected.has(node.id)) continue
    const position = absoluteNodePosition(node, byId)
    const width = node.measured?.width ?? node.width ?? 0
    const height = node.measured?.height ?? node.height ?? 0
    minX = Math.min(minX, position.x)
    minY = Math.min(minY, position.y)
    maxX = Math.max(maxX, position.x + width)
    maxY = Math.max(maxY, position.y + height)
  }

  if (minX === Infinity) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
