import { BaseEdge, Position } from '@xyflow/react'

// Perpendicular stub: the line leaves each connection point straight out
// (perpendicular to the node side) for a fixed stub length, then curves
// over to the other side's stub.
const STUB = 22

const DIR = {
  [Position.Top]: { x: 0, y: -1 },
  [Position.Bottom]: { x: 0, y: 1 },
  [Position.Left]: { x: -1, y: 0 },
  [Position.Right]: { x: 1, y: 0 },
}

export default function StubEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style }) {
  const sDir = DIR[sourcePosition] ?? DIR[Position.Bottom]
  const tDir = DIR[targetPosition] ?? DIR[Position.Top]

  const p1x = sourceX + sDir.x * STUB
  const p1y = sourceY + sDir.y * STUB
  const p2x = targetX + tDir.x * STUB
  const p2y = targetY + tDir.y * STUB

  const dist = Math.hypot(p2x - p1x, p2y - p1y)
  const k = Math.min(Math.max(dist * 0.35, 24), 220)

  const c1x = p1x + sDir.x * k
  const c1y = p1y + sDir.y * k
  const c2x = p2x + tDir.x * k
  const c2y = p2y + tDir.y * k

  // Pull the path's start/end 2-3px inward (opposite the stub direction) so the stroke
  // underlaps the port dot instead of touching it edge-to-edge — avoids a visible seam
  // between line and dot at high zoom. The marker still lands on the true endpoint.
  const INSET = 2.5
  const m1x = sourceX - sDir.x * INSET
  const m1y = sourceY - sDir.y * INSET
  const m2x = targetX - tDir.x * INSET
  const m2y = targetY - tDir.y * INSET

  const path = `M ${m1x},${m1y} L ${p1x},${p1y} C ${c1x},${c1y} ${c2x},${c2y} ${p2x},${p2y} L ${m2x},${m2y} L ${targetX},${targetY}`

  return <BaseEdge path={path} markerEnd={markerEnd} style={style} />
}
