import { useId } from 'react'
import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react'
import { getStubEdgeGeometry } from './stubEdgeGeometry'
import { edgeRelationInfo } from '../../shared/relationOntology.js'
import { edgeOperationStatusDefinition } from '../../shared/edgeOperation.js'

// Perpendicular stub: the line leaves each connection point straight out
// (perpendicular to the node side) for a fixed stub length, then curves
// over to the other side's stub.
export default function StubEdge({
  sourceX, sourceY, targetX, targetY,
  sourcePosition, targetPosition,
  sourceHandleId, targetHandleId,
  markerEnd, style, data,
}) {
  const markerUid = useId().replace(/:/g, '')
  const markerId = `wfc-edge-arrow-${markerUid}`
  const { path, labelX, labelY } = getStubEdgeGeometry({
    sourceX, sourceY, targetX, targetY,
    sourcePosition, targetPosition,
    sourceHandleId, targetHandleId,
  })
  const hasArrow = !!markerEnd
  const edgeColor = style?.stroke ?? '#8b94a7'
  const partLink = data?.partsLink === true
    || (sourceHandleId?.startsWith('p-') && targetHandleId?.startsWith('p-'))
  const relation = edgeRelationInfo(data, style?.strokeDasharray ? 'references' : 'flows_to')
  const relationLabel = relation.label.length > 16 ? `${relation.label.slice(0, 15)}…` : relation.label
  const relationWidth = Math.max(58, Math.min(162, relationLabel.length * 11 + 32))
  const operation = data?.edgeOperation
  const showRelation = relation.explicit && !partLink && !operation
  const runtime = data?.systemRuntime
  const operationStatus = edgeOperationStatusDefinition(operation?.status)
  const operationIcon = ['planning', 'queued', 'succeeded', 'failed'].includes(operationStatus.id)
    ? operationStatus.icon
    : operation?.icon || operationStatus.icon
  const operationTitle = operation
    ? [operation.tooltip || operation.label, operationStatus.label, operation.message].filter(Boolean).join(' · ')
    : ''

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
      {showRelation && (
        <g
          className="wfc-relation-label"
          data-reality={relation.provenance.reality.id}
          transform={`translate(${labelX} ${labelY})`}
          style={{ '--relation-color': relation.color }}
          pointerEvents="none"
          aria-hidden="true"
        >
          <rect x={-relationWidth / 2} y={-12} width={relationWidth} height={24} rx={4} />
          <circle cx={-relationWidth / 2 + 11} cy="0" r="3.5" fill={relation.provenance.reality.color} />
          <text x="5" y="1" textAnchor="middle" dominantBaseline="middle">{relationLabel}</text>
        </g>
      )}
      {runtime && (
        <g
          className={`system-runtime-edge-indicator is-${runtime.status}`}
          transform={`translate(${labelX} ${labelY - (showRelation ? 19 : 0)})`}
          style={{ '--runtime-edge-color': runtime.color }}
          pointerEvents="none"
          aria-hidden="true"
        >
          <circle r="6" className="system-runtime-edge-indicator-ring" />
          <circle r="3" className="system-runtime-edge-indicator-dot" />
          <title>{[runtime.label, runtime.summary].filter(Boolean).join(' · ')}</title>
        </g>
      )}
      {operation && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className={`edge-operation-control nodrag nopan nowheel is-${operationStatus.id} is-direction-${operation.direction ?? 'unknown'}`}
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
            title={operationTitle}
            aria-label={operationTitle}
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation()
              operation.onOpen?.()
            }}
          >
            <span className="edge-operation-icon" aria-hidden="true">{operationIcon}</span>
            <span className="edge-operation-tooltip" role="tooltip">{operation.tooltip || operationTitle}</span>
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  )
}
