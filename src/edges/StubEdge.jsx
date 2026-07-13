import { useId } from 'react'
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
  const markerUid = useId().replace(/:/g, '')
  const markerId = `wfc-edge-arrow-${markerUid}`
  const { path } = getStubEdgeGeometry({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    sourceHandleId, targetHandleId,
  })
  const hasArrow = !!markerEnd
  const edgeColor = style?.stroke ?? '#8b94a7'

  return (
    <>
      {hasArrow && (
        <defs>
          <marker
            id={markerId}
            markerWidth="20"
            markerHeight="22"
            refX="10"
            refY="6"
            viewBox="-5 -5 20 22"
            markerUnits="userSpaceOnUse"
            orient="auto"
            overflow="visible"
          >
            <path d="M 0 0.5 L 10 6 L 0 11.5 Z" className="wfc-edge-arrow-halo" />
            <path
              d="M 0 0.5 L 10 6 L 0 11.5 Z"
              className="wfc-edge-arrow"
              fill={edgeColor}
              stroke={edgeColor}
            />
          </marker>
        </defs>
      )}
      <path
        d={path}
        className="wfc-edge-halo"
        fill="none"
        strokeDasharray={style?.strokeDasharray}
        pointerEvents="none"
      />
      <BaseEdge
        path={path}
        markerEnd={hasArrow ? `url(#${markerId})` : undefined}
        style={style}
      />
    </>
  )
}
