const STUB = 22
const MAIN_HANDLE_RADIUS = 22.5
const BORDER_OVERLAP = 1

const DIR = {
  top: { x: 0, y: -1 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
}

const direction = (position, fallback) => DIR[position] ?? DIR[fallback]
const isPartHandle = (handleId) => typeof handleId === 'string' && handleId.startsWith('p-')

function correctedAnchor(x, y, dir, handleId) {
  // React Flow anchors an edge to the outside of a handle. Main handles are
  // 45px hit targets centered on the node border, so move their coordinates
  // back by 22.5px and overlap the border by one pixel. Part sockets are
  // visible connection shapes and intentionally keep their outside edge.
  const correction = isPartHandle(handleId) ? 0 : MAIN_HANDLE_RADIUS + BORDER_OVERLAP
  return { x: x - dir.x * correction, y: y - dir.y * correction }
}

export function getStubEdgeGeometry({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  targetHandleId,
}) {
  const sourceDir = direction(sourcePosition, 'bottom')
  const targetDir = direction(targetPosition, 'top')
  const source = correctedAnchor(sourceX, sourceY, sourceDir, sourceHandleId)
  const target = correctedAnchor(targetX, targetY, targetDir, targetHandleId)

  const p1 = { x: source.x + sourceDir.x * STUB, y: source.y + sourceDir.y * STUB }
  const p2 = { x: target.x + targetDir.x * STUB, y: target.y + targetDir.y * STUB }
  const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y)
  const curve = Math.min(Math.max(dist * 0.35, 24), 220)
  const c1 = { x: p1.x + sourceDir.x * curve, y: p1.y + sourceDir.y * curve }
  const c2 = { x: p2.x + targetDir.x * curve, y: p2.y + targetDir.y * curve }
  const path = `M ${source.x},${source.y} L ${p1.x},${p1.y} C ${c1.x},${c1.y} ${c2.x},${c2.y} ${p2.x},${p2.y} L ${target.x},${target.y}`

  return { path, source, target }
}
