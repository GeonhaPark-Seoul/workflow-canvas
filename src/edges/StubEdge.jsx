import { useEffect, useId, useRef, useState } from 'react'
import { BaseEdge, EdgeLabelRenderer } from '@xyflow/react'
import { getStubEdgeGeometry } from './stubEdgeGeometry'
import { edgeRelationInfo } from '../../shared/relationOntology.js'
import { edgeOperationStatusDefinition } from '../../shared/edgeOperation.js'

function SecurityGatewayControl({ overlay, x, y, offset = 0 }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const gateway = overlay?.gateway
  const warning = overlay?.warning === true
  const title = warning
    ? `${overlay.status === 'unknown-gap' ? '미확인 통로' : '게이트웨이 불일치'} · ${overlay.reason}`
    : `${gateway?.kindLabel || '게이트웨이'} · ${gateway?.route || overlay.reason}`

  useEffect(() => {
    if (!open) return undefined
    const close = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <EdgeLabelRenderer>
      <div
        ref={rootRef}
        className="security-gateway-anchor nodrag nopan nowheel"
        style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y + offset}px)` }}
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className={`security-gateway-button ${warning ? 'is-warning' : 'is-modeled'}`}
          title={title}
          aria-label={title}
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation()
            setOpen((value) => !value)
          }}
        >
          <span aria-hidden="true">{warning ? '!' : '◈'}</span>
        </button>
        {open && (
          <section className={`security-gateway-popover ${warning ? 'is-warning' : ''}`} aria-label="보안 통로 상세">
            <header>
              <strong>{warning ? '확인되지 않은 경계' : (gateway?.kindLabel || '게이트웨이')}</strong>
              <span>{warning ? '주의' : '선언됨'}</span>
            </header>
            <dl>
              <div><dt>방향</dt><dd>{overlay.source.label} → {overlay.target.label}</dd></div>
              <div><dt>영역</dt><dd>{overlay.source.zone.label} → {overlay.target.zone.label}</dd></div>
              <div><dt>판정</dt><dd>{overlay.reason}</dd></div>
              {gateway && <div><dt>통로</dt><dd>{gateway.route || gateway.kindLabel}</dd></div>}
              {gateway?.protocol && <div><dt>프로토콜</dt><dd>{gateway.protocol}</dd></div>}
              {gateway?.dataClasses?.length > 0 && <div><dt>데이터</dt><dd>{gateway.dataClasses.join(' · ')}</dd></div>}
              {gateway?.authentication && <div><dt>인증</dt><dd>{gateway.authentication}</dd></div>}
              {gateway?.authorization && <div><dt>권한</dt><dd>{gateway.authorization}</dd></div>}
              {gateway?.encryption && <div><dt>암호화</dt><dd>{gateway.encryption}</dd></div>}
              {gateway?.exposureLabel && <div><dt>노출</dt><dd>{gateway.exposureLabel}</dd></div>}
              {gateway?.evidenceRef && <div><dt>근거</dt><dd>{gateway.evidenceRef}</dd></div>}
            </dl>
          </section>
        )}
      </div>
    </EdgeLabelRenderer>
  )
}

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
  const securityOverlay = data?.securityOverlay

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
      {securityOverlay && (
        <SecurityGatewayControl
          overlay={securityOverlay}
          x={labelX}
          y={labelY}
          offset={operation || showRelation || runtime ? 28 : 0}
        />
      )}
    </>
  )
}
