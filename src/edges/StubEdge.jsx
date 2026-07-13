import { BaseEdge } from '@xyflow/react'
import { getStubEdgeGeometry } from './stubEdgeGeometry'

// Perpendicular stub: the line leaves each connection point straight out
// (perpendicular to the node side) for a fixed stub length, then curves
// over to the other side's stub.
export default function StubEdge({
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  sourceHandleId, targetHandleId,
  markerEnd, style,
}) {
  const { path, arrowPoints } = getStubEdgeGeometry({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    sourceHandleId, targetHandleId,
  })
  const hasArrow = !!markerEnd
  const edgeColor = style?.stroke ?? '#8b94a7'

  return (
    <>
      <path
        d={path}
        className="wfc-edge-halo"
        fill="none"
        strokeDasharray={style?.strokeDasharray}
        pointerEvents="none"
      />
      {hasArrow && (
        <polygon
          points={arrowPoints}
          className="wfc-edge-arrow-halo"
          pointerEvents="none"
        />
      )}
      <BaseEdge path={path} style={style} />
      {hasArrow && (
        <polygon
          points={arrowPoints}
          className="wfc-edge-arrow"
          fill={edgeColor}
          stroke={edgeColor}
          pointerEvents="none"
        />
      )}
    </>
  )
}
