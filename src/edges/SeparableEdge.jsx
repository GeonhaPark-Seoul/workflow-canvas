import { BaseEdge, getSmoothStepPath } from '@xyflow/react'

// Perpendicular spacing between parallel edges that share the same node pair.
const SPACING = 24

// An edge that fans out when it runs parallel to siblings between the same two
// nodes: a quadratic curve whose midpoint is pushed perpendicular to the
// straight source→target line. Offset is 0 at both endpoints (so the lines
// converge at the connection points) and maximal in the middle. A lone edge
// (no parallel siblings) falls back to the standard smoothstep look.
export default function SeparableEdge({
  id, sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition, markerEnd, style, data,
}) {
  const sep = data?._sep
  let path

  if (!sep || sep.size <= 1) {
    ;[path] = getSmoothStepPath({
      sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition,
    })
  } else {
    const dx = targetX - sourceX
    const dy = targetY - sourceY
    const len = Math.hypot(dx, dy) || 1
    const px = -dy / len // perpendicular unit vector
    const py = dx / len
    const off = (sep.index - (sep.size - 1) / 2) * SPACING
    const mx = (sourceX + targetX) / 2 + px * off
    const my = (sourceY + targetY) / 2 + py * off
    path = `M ${sourceX},${sourceY} Q ${mx},${my} ${targetX},${targetY}`
  }

  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />
}
