import { Fragment, useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, NodeToolbar, Position, useStore, useUpdateNodeInternals } from '@xyflow/react'
import OpenInNotesButton from '../components/OpenInNotesButton'
import ScopedParticipants from '../components/ScopedParticipants'
import SystemObservationCatalog from '../components/SystemObservationCatalog'
import { sanitizeHtml } from '../lib/sanitizeHtml'
import {
  SYSTEM_COMPONENT_KIND_DEFS,
  SYSTEM_COMPONENT_MATURITY_DEFS,
  SYSTEM_ENVIRONMENT_DEFS,
  SYSTEM_SOURCE_DEFS,
  systemKindDefinition,
  systemNodeReality,
} from '../../shared/systemOntology.js'
import {
  normalizeSystemPart,
  normalizeSystemParts,
  SYSTEM_PART_EXPOSURE_DEFS,
  SYSTEM_PART_KIND_DEFS,
  systemPartKindDefinition,
  validateSystemPartInput,
} from '../../shared/systemPartOntology.js'
import {
  systemPartRuntimeReality,
  systemRuntimeCatalogForResult,
  systemRuntimeCapabilityForPart,
} from '../../shared/systemRuntime.js'

const PORTS = [
  { id: 'left', position: Position.Left },
  { id: 'right', position: Position.Right },
  { id: 'top', position: Position.Top },
  { id: 'bottom', position: Position.Bottom },
]

const byId = (items, id) => items.find((item) => item.id === id)
const newPartId = () => `sp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`

function compactList(items, maximum = 2) {
  const values = Array.isArray(items) ? items.filter(Boolean) : []
  if (!values.length) return '없음'
  const visible = values.slice(0, maximum).join(' · ')
  return values.length > maximum ? `${visible} 외 ${values.length - maximum}` : visible
}

function evidenceSummary(items) {
  const values = Array.isArray(items) ? items.filter(Boolean) : []
  if (!values.length) return '근거 없음'
  return values.length > 1 ? `${values[0]} 외 ${values.length - 1}` : values[0]
}

function runtimeCheckedAtLabel(value) {
  if (!value) return ''
  const checkedAt = new Date(value)
  if (!Number.isFinite(checkedAt.getTime())) return ''
  return checkedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function runtimeUpdatedAtLabel(value) {
  if (!value) return ''
  const updatedAt = new Date(value)
  if (!Number.isFinite(updatedAt.getTime())) return ''
  return updatedAt.toLocaleString('ko-KR', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function runtimeTitle(runtime, reality) {
  const details = [reality.label]
  if (runtime?.summary) details.push(runtime.summary)
  if (Number.isFinite(runtime?.latencyMs)) details.push(`${runtime.latencyMs}ms`)
  const checkedAt = runtimeCheckedAtLabel(runtime?.checkedAt)
  if (checkedAt) details.push(checkedAt)
  return details.join(' · ')
}

function runtimeObservationValue(item) {
  if (item.valueType === 'boolean') return item.value ? '예' : '아니오'
  if (item.valueType === 'duration_ms') return `${item.value}ms`
  if (item.valueType === 'timestamp') return runtimeUpdatedAtLabel(item.value)
  return `${item.value}${item.unit ? ` ${item.unit}` : ''}`
}

function blankSystemPart() {
  return {
    id: newPartId(),
    kind: 'connection',
    label: '새 연결',
    ref: '',
    exposure: 'internal',
    sourceKind: 'manual',
    evidenceRef: '',
  }
}

export default function SystemNode({ data, selected, id }) {
  const updateNodeInternals = useUpdateNodeInternals()
  const abstract = useStore((state) => state.transform[2] < (data.lodThreshold ?? 0.55))
  const zoomShapeOnly = useStore((state) => state.transform[2] < (data.lodThreshold ?? 0.55) * 0.45)
  const shapeOnly = data.forceShapeOnly || zoomShapeOnly
  const kind = systemKindDefinition(data.systemKind)
  const reality = systemNodeReality(data)
  const logicalComponent = data.logicalComponent ?? null
  const componentKind = byId(SYSTEM_COMPONENT_KIND_DEFS, logicalComponent?.kind)?.label ?? 'Engine'
  const componentMaturity = byId(SYSTEM_COMPONENT_MATURITY_DEFS, logicalComponent?.maturity)?.label ?? '프로토타입'
  const componentManaged = !!logicalComponent
  const environment = byId(SYSTEM_ENVIRONMENT_DEFS, data.environment)?.label ?? '환경 미지정'
  const source = byId(SYSTEM_SOURCE_DEFS, data.sourceKind)?.label ?? '수동 모델'
  const filled = data.nodeFill !== false
  const darkText = data.theme === 'light' && !filled
  const titleColor = darkText ? '#17191f' : '#edf0f7'
  const bodyColor = darkText ? '#4b5563' : '#aeb6c6'

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(data.label ?? '')
  const selectedAtRef = useRef(0)
  const longPressTimer = useRef(null)
  const longPressStart = useRef(null)
  const dimPressTimer = useRef(null)

  useEffect(() => { setTitleDraft(data.label ?? '') }, [data.label])
  useEffect(() => {
    if (selected) selectedAtRef.current = Date.now()
    else setEditingTitle(false)
  }, [selected])

  const handlePointerDown = (event) => {
    if (event.pointerType !== 'touch') return
    longPressStart.current = { x: event.clientX, y: event.clientY }
    const { clientX, clientY } = event
    longPressTimer.current = setTimeout(() => {
      data.onLongPress?.(clientX, clientY)
      longPressTimer.current = null
    }, 500)
  }
  const handlePointerMove = (event) => {
    if (!longPressStart.current || !longPressTimer.current) return
    if (Math.hypot(event.clientX - longPressStart.current.x, event.clientY - longPressStart.current.y) > 10) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }
  const handlePointerUp = () => {
    clearTimeout(longPressTimer.current)
    longPressTimer.current = null
    longPressStart.current = null
  }

  const startTitleEdit = () => {
    if (data.readOnly || componentManaged || !selected || editingTitle || Date.now() - selectedAtRef.current < 300) return
    setTitleDraft(data.label ?? '')
    setEditingTitle(true)
    data.onEditStart?.()
  }
  const finishTitleEdit = (save = true) => {
    if (!editingTitle) return
    setEditingTitle(false)
    data.onEditEnd?.()
    if (save) data.onUpdate?.({ label: titleDraft.trim() || `새 ${kind.label}` })
    else setTitleDraft(data.label ?? '')
  }

  const startDimPress = (event) => {
    if (data.readOnly) return
    event.stopPropagation()
    dimPressTimer.current = setTimeout(() => {
      data.onUpdate?.({ dimmed: !data.dimmed })
      dimPressTimer.current = null
    }, 500)
  }
  const cancelDimPress = () => {
    clearTimeout(dimPressTimer.current)
    dimPressTimer.current = null
  }

  const handleStyle = {
    width: 45,
    height: 45,
    border: 'none',
    background: `radial-gradient(circle, ${kind.color} 7px, #0f0f13 7px 10.5px, transparent 10.5px)`,
  }
  const purpose = data.purpose || data.description || ''
  const systemParts = normalizeSystemParts(data.systemParts)
  const linkedPartHandles = new Set(Array.isArray(data.linkedSystemPartHandles) ? data.linkedSystemPartHandles : [])
  const systemPartLayoutKey = systemParts.map((part) => part.id).join('|')
  const previewPartIds = new Set(data.digitalTwinProposalPreviewPartIds ?? [])
  const partEditingLocked = data.readOnly || componentManaged || previewPartIds.size > 0
  const [partDraft, setPartDraft] = useState(null)
  const [partError, setPartError] = useState('')

  useEffect(() => {
    if (!selected || partEditingLocked) {
      setPartDraft(null)
      setPartError('')
    }
  }, [selected, partEditingLocked])

  useEffect(() => {
    const frame = requestAnimationFrame(() => updateNodeInternals(id))
    return () => cancelAnimationFrame(frame)
  }, [abstract, id, shapeOnly, systemPartLayoutKey, updateNodeInternals])

  const openPartEditor = (part = null) => {
    if (partEditingLocked) return
    setPartDraft(part ? { ...part } : blankSystemPart())
    setPartError('')
  }
  const savePart = () => {
    const error = validateSystemPartInput(partDraft)
    const normalized = error ? null : normalizeSystemPart(partDraft)
    if (error || !normalized) {
      setPartError(error || '파츠를 저장할 수 없습니다.')
      return
    }
    const exists = systemParts.some((part) => part.id === normalized.id)
    data.onUpdate?.({
      systemParts: exists
        ? systemParts.map((part) => (part.id === normalized.id ? normalized : part))
        : [...systemParts, normalized],
    })
    setPartDraft(null)
    setPartError('')
  }
  const removePart = () => {
    if (!partDraft || partEditingLocked) return
    data.onUpdate?.({ systemParts: systemParts.filter((part) => part.id !== partDraft.id) })
    setPartDraft(null)
    setPartError('')
  }
  const persistedPartDraft = partDraft
    ? systemParts.find((part) => part.id === partDraft.id) ?? null
    : null
  const partDraftRuntimeCapability = persistedPartDraft
    ? systemRuntimeCapabilityForPart(persistedPartDraft, id)
    : null
  const partDraftRuntime = persistedPartDraft
    ? data.systemPartRuntime?.[persistedPartDraft.id]
    : null
  const partDraftRuntimeReality = partDraftRuntimeCapability
    ? systemPartRuntimeReality(partDraftRuntime)
    : null
  const partDraftRuntimeItems = partDraftRuntime?.status === 'healthy'
    && partDraftRuntime?.resultKind === 'metric_groups'
    && Array.isArray(partDraftRuntime.items)
    ? partDraftRuntime.items
    : null
  const partDraftRuntimeObservations = ['healthy', 'degraded'].includes(partDraftRuntime?.status)
    && partDraftRuntime?.resultKind === 'observations'
    && Array.isArray(partDraftRuntime.observations)
    ? partDraftRuntime.observations
    : null
  const partDraftRuntimeCatalog = partDraftRuntimeCapability
    ? systemRuntimeCatalogForResult(partDraftRuntimeCapability.id, partDraftRuntime)
    : []
  const runtimeActionLabel = partDraftRuntimeCapability?.operation === 'read'
    ? '데이터 새로 조회'
    : ['observe', 'validate'].includes(partDraftRuntimeCapability?.operation)
      ? '운영 상태 확인'
      : '시스템 작업 실행'

  return (
    <div
      className="canvas-node-card system-node-card"
      data-reality={reality.id}
      data-proposal-preview={data.digitalTwinProposalPreview ? 'true' : undefined}
      data-part-proposal-preview={previewPartIds.size ? 'true' : undefined}
      style={{
        width: '100%',
        height: '100%',
        minWidth: 200,
        minHeight: 110,
        boxSizing: 'border-box',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: abstract ? 'center' : undefined,
        '--system-accent': kind.color,
        background: filled ? '#171a21' : 'transparent',
        border: `2px solid ${selected ? '#ffffff' : kind.color}`,
        borderRadius: 6,
        boxShadow: 'none',
        transition: 'border-color 0.15s, outline-color 0.15s, background-color 0.15s',
        touchAction: 'manipulation',
        filter: data.dimmed ? 'grayscale(0.85) brightness(0.55)' : undefined,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <OpenInNotesButton visible={selected && !shapeOnly} onOpen={data.onOpenInNotes} />
      <NodeResizer
        isVisible={selected && !data.readOnly}
        minWidth={200}
        minHeight={110}
        color={kind.color}
        handleStyle={{
          width: 20, height: 20, background: 'transparent', border: 'none',
          backgroundImage: `radial-gradient(circle, ${kind.color} 5px, transparent 5px)`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
        }}
        lineStyle={{ borderColor: `${kind.color}66` }}
      />
      {data.digitalTwinProposalPreview && (
        <span className="digital-twin-proposal-node-badge">미리보기</span>
      )}
      {!data.digitalTwinProposalPreview && previewPartIds.size > 0 && (
        <span className="digital-twin-proposal-node-badge">파츠 미리보기</span>
      )}

      {PORTS.map((port) => (
        <Handle key={port.id} type="source" id={port.id} position={port.position} style={handleStyle} />
      ))}

      {abstract && systemParts.map((part, index) => {
        const partKind = systemPartKindDefinition(part.kind)
        const top = `${((index + 1) / (systemParts.length + 1)) * 100}%`
        const leftHandleId = `p-${part.id}-l`
        const rightHandleId = `p-${part.id}-r`
        const compactSocketStyle = {
          width: 8,
          height: 11,
          borderRadius: 2,
          border: `1px solid ${partKind.color}`,
          background: '#0f1117',
          opacity: linkedPartHandles.has(leftHandleId) || linkedPartHandles.has(rightHandleId) ? 0.95 : 0.45,
          pointerEvents: 'none',
          zIndex: 6,
        }
        return (
          <Fragment key={part.id}>
            <Handle
              type="source"
              position={Position.Left}
              id={leftHandleId}
              className={`part-socket is-compact${linkedPartHandles.has(leftHandleId) ? ' is-linked' : ''}`}
              isConnectable={false}
              style={{ ...compactSocketStyle, left: 0, top, transform: 'translate(-50%, -50%)' }}
            />
            <Handle
              type="source"
              position={Position.Right}
              id={rightHandleId}
              className={`part-socket is-compact${linkedPartHandles.has(rightHandleId) ? ' is-linked' : ''}`}
              isConnectable={false}
              style={{ ...compactSocketStyle, right: 0, top, transform: 'translate(50%, -50%)' }}
            />
          </Fragment>
        )
      })}

      {!shapeOnly && (
        <div style={{ padding: abstract ? '10px 14px' : '10px 12px 8px', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 22 }}>
            <button
              type="button"
              title="길게 누르기: 끄기/켜기"
              onPointerDown={startDimPress}
              onPointerUp={cancelDimPress}
              onPointerLeave={cancelDimPress}
              onPointerCancel={cancelDimPress}
              style={{
                width: abstract ? 24 : 20,
                height: abstract ? 24 : 20,
                display: 'grid',
                placeItems: 'center',
                flexShrink: 0,
                color: kind.color,
                background: `${kind.color}18`,
                border: `1px solid ${kind.color}88`,
                borderRadius: 4,
                fontSize: abstract ? 14 : 12,
                cursor: data.readOnly ? 'default' : 'pointer',
              }}
            >
              {kind.icon}
            </button>
            <span style={{ flex: 1, minWidth: 0, color: kind.color, fontSize: abstract ? 11 : 10, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {kind.label}
            </span>
            <span style={{
              flexShrink: 0,
              color: reality.color,
              background: `${reality.color}18`,
              border: `1px solid ${reality.color}66`,
              borderRadius: 4,
              padding: '1px 5px',
              fontSize: 9,
              fontWeight: 800,
            }}>
              {reality.label}
            </span>
            <ScopedParticipants
              participants={data.scopedParticipants}
              canInvite={selected && data.canInvite}
              onInvite={data.onInvite}
              canManageRestrictions={data.canManageParticipants}
              onToggleViewRestriction={data.onToggleViewRestriction}
              scope="node"
              targetId={id}
            />
          </div>

          <div style={{ marginTop: 7, minWidth: 0 }}>
            {editingTitle ? (
              <input
                autoFocus
                className="nodrag nowheel"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => finishTitleEdit(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); finishTitleEdit(true) }
                  if (event.key === 'Escape') { event.preventDefault(); finishTitleEdit(false) }
                }}
                style={{
                  width: '100%', boxSizing: 'border-box', background: 'transparent',
                  border: 'none', borderBottom: `1px solid ${kind.color}`, outline: 'none',
                  color: titleColor, fontSize: abstract ? 15 : 14, fontWeight: 750,
                  padding: '1px 0 2px', fontFamily: 'inherit',
                }}
              />
            ) : (
              <div
                className="text-hover-line"
                onClick={startTitleEdit}
                style={{
                  color: titleColor, fontSize: abstract ? 15 : 14, fontWeight: 750,
                  whiteSpace: abstract ? 'normal' : 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  textAlign: abstract ? 'center' : undefined, cursor: data.readOnly || componentManaged ? 'default' : 'text',
                }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.label || `새 ${kind.label}`) }}
              />
            )}
          </div>

          {!abstract && (
            <>
              <div style={{
                marginTop: 6,
                minHeight: systemParts.length || selected || componentManaged ? 16 : 30,
                color: bodyColor,
                fontSize: 11.5,
                lineHeight: 1.45,
                overflow: 'hidden',
                whiteSpace: systemParts.length || selected ? 'nowrap' : undefined,
                textOverflow: systemParts.length || selected ? 'ellipsis' : undefined,
              }}>
                {purpose ? (
                  <div className="rich-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(purpose) }} />
                ) : (
                  <span style={{ opacity: 0.55 }}>목적 미정</span>
                )}
              </div>
              {logicalComponent && (
                <div
                  className="logical-component-details nowheel"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
                    gap: '4px 8px',
                    marginTop: 7,
                    paddingTop: 7,
                    borderTop: `1px solid ${kind.color}38`,
                    color: bodyColor,
                    fontSize: 9.5,
                    lineHeight: 1.25,
                    minWidth: 0,
                  }}
                >
                  <span title={`내부 종류: ${componentKind}`}><b style={{ color: kind.color }}>종류</b> {componentKind}</span>
                  <span title={`성숙도: ${componentMaturity}`}><b style={{ color: kind.color }}>성숙도</b> {componentMaturity}</span>
                  <span title={`제품 버전 ${logicalComponent.productVersion || '미정'}`}><b style={{ color: kind.color }}>제품</b> {logicalComponent.productVersion || '미정'}</span>
                  <span title={`기술 버전 ${logicalComponent.technicalVersion || '미정'}${logicalComponent.compatibility?.length ? ` · ${logicalComponent.compatibility.join(' · ')}` : ''}`}><b style={{ color: kind.color }}>기술</b> {logicalComponent.technicalVersion || '미정'}</span>
                  <span style={{ gridColumn: '1 / -1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(logicalComponent.inputs ?? []).join(' · ')}><b style={{ color: kind.color }}>입력</b> {compactList(logicalComponent.inputs)}</span>
                  <span style={{ gridColumn: '1 / -1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(logicalComponent.outputs ?? []).join(' · ')}><b style={{ color: kind.color }}>출력</b> {compactList(logicalComponent.outputs)}</span>
                  <span style={{ gridColumn: '1 / -1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(logicalComponent.codeEvidence ?? []).join(' · ')}><b style={{ color: kind.color }}>코드</b> {evidenceSummary(logicalComponent.codeEvidence)}</span>
                  <span style={{ gridColumn: '1 / -1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={(logicalComponent.testEvidence ?? []).join(' · ')}><b style={{ color: kind.color }}>테스트</b> {evidenceSummary(logicalComponent.testEvidence)}</span>
                  <span style={{ gridColumn: '1 / -1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={logicalComponent.maintainerAgentId || '현재 담당 Maintainer Agent가 배정되지 않았습니다.'}><b style={{ color: kind.color }}>담당</b> {logicalComponent.maintainerAgentId || '미배정'}</span>
                </div>
              )}
              {(systemParts.length > 0 || (selected && !partEditingLocked)) && (
                <div className="system-parts-strip nodrag nowheel" aria-label="시스템 파츠">
                  {systemParts.map((part) => {
                    const partKind = systemPartKindDefinition(part.kind)
                    const preview = previewPartIds.has(part.id)
                    const runtimeCapability = preview ? null : systemRuntimeCapabilityForPart(part, id)
                    const runtime = runtimeCapability ? data.systemPartRuntime?.[part.id] : null
                    const runtimeReality = runtimeCapability ? systemPartRuntimeReality(runtime) : null
                    const socketStyle = {
                      width: 13,
                      height: 16,
                      borderRadius: 3,
                      border: `1.5px solid ${partKind.color}`,
                      background: '#0f1117',
                    }
                    return (
                      <div
                        key={part.id}
                        className={`system-part-chip${preview ? ' is-preview' : ''}${runtimeReality ? ` is-runtime-${runtimeReality.id}` : ''}`}
                        style={{ '--part-color': partKind.color }}
                        title={`${partKind.label} · ${part.label}${part.ref ? ` · ${part.ref}` : ''}${preview ? ' · 미리보기' : ''}${runtimeReality ? ` · ${runtimeTitle(runtime, runtimeReality)}` : ''}`}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (preview) return
                          data.onSelectForPart?.()
                          if (data.onOpenSystemPart?.(part) === true) return
                          openPartEditor(part)
                        }}
                      >
                        <Handle
                          type="source"
                          position={Position.Left}
                          id={`p-${part.id}-l`}
                          className={`part-socket${linkedPartHandles.has(`p-${part.id}-l`) ? ' is-linked' : ''}`}
                          isConnectable={!partEditingLocked && !preview}
                          style={{ ...socketStyle, left: 0, top: '50%', transform: 'translate(-50%, -50%)' }}
                        />
                        {runtimeReality && (
                          <span
                            className="system-part-runtime-dot"
                            style={{ '--runtime-color': runtimeReality.color }}
                            aria-label={runtimeReality.label}
                          />
                        )}
                        <span aria-hidden="true">{partKind.icon}</span>
                        <span>{part.label}</span>
                        <Handle
                          type="source"
                          position={Position.Right}
                          id={`p-${part.id}-r`}
                          className={`part-socket${linkedPartHandles.has(`p-${part.id}-r`) ? ' is-linked' : ''}`}
                          isConnectable={!partEditingLocked && !preview}
                          style={{ ...socketStyle, right: 0, top: '50%', transform: 'translate(50%, -50%)' }}
                        />
                      </div>
                    )
                  })}
                  {selected && !partEditingLocked && (
                    <button
                      type="button"
                      className="system-part-add"
                      title="시스템 파츠 추가"
                      aria-label="시스템 파츠 추가"
                      onClick={(event) => { event.stopPropagation(); openPartEditor() }}
                    >
                      +
                    </button>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, minWidth: 0, color: bodyColor, fontSize: 9.5 }}>
                <span style={{ whiteSpace: 'nowrap' }}>{logicalComponent ? '논리 구성요소' : environment}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.provider || source}</span>
              </div>
            </>
          )}
        </div>
      )}

      {partDraft && selected && !partEditingLocked && (
        <NodeToolbar
          nodeId={id}
          isVisible
          position={Position.Bottom}
          align="start"
          offset={8}
          style={{ zIndex: 2002, pointerEvents: 'all' }}
        >
          <div
            className={`system-part-editor nodrag nowheel${partDraftRuntimeCatalog.length || partDraftRuntimeItems || partDraftRuntimeObservations ? ' has-runtime-data' : ''}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="system-part-editor-heading">
              <strong>시스템 파츠</strong>
              <button type="button" title="닫기" aria-label="닫기" onClick={() => setPartDraft(null)}>×</button>
            </div>
            <label>
              <span>종류</span>
              <select value={partDraft.kind} onChange={(event) => setPartDraft({ ...partDraft, kind: event.target.value })}>
                {SYSTEM_PART_KIND_DEFS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label>
              <span>이름</span>
              <input value={partDraft.label} maxLength={120} onChange={(event) => setPartDraft({ ...partDraft, label: event.target.value })} />
            </label>
            <label>
              <span>참조</span>
              <input
                value={partDraft.ref}
                maxLength={240}
                placeholder={partDraft.kind === 'credential_ref' ? 'SUPABASE_ANON_KEY' : '선택 사항'}
                onChange={(event) => setPartDraft({ ...partDraft, ref: event.target.value })}
              />
            </label>
            <label>
              <span>노출</span>
              <select value={partDraft.exposure} onChange={(event) => setPartDraft({ ...partDraft, exposure: event.target.value })}>
                {SYSTEM_PART_EXPOSURE_DEFS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            {partDraftRuntimeCapability && partDraftRuntimeReality && (
              <>
                <div
                  className={`system-part-runtime is-${partDraftRuntimeReality.id}`}
                  style={{ '--runtime-color': partDraftRuntimeReality.color }}
                  title={runtimeTitle(partDraftRuntime, partDraftRuntimeReality)}
                >
                  <span
                    className="system-part-runtime-dot"
                    style={{ '--runtime-color': partDraftRuntimeReality.color }}
                    aria-hidden="true"
                  />
                  <strong>{partDraftRuntimeReality.label}</strong>
                  <span className="system-part-runtime-summary">
                    {partDraftRuntime?.summary || partDraftRuntimeCapability.label}
                  </span>
                  {(Number.isFinite(partDraftRuntime?.latencyMs) || partDraftRuntime?.checkedAt) && (
                    <span className="system-part-runtime-latency">
                      {Number.isFinite(partDraftRuntime?.latencyMs) ? `${partDraftRuntime.latencyMs}ms` : ''}
                      {Number.isFinite(partDraftRuntime?.latencyMs) && partDraftRuntime?.checkedAt ? ' · ' : ''}
                      {runtimeCheckedAtLabel(partDraftRuntime?.checkedAt)}
                    </span>
                  )}
                  <button
                    type="button"
                    className="system-part-runtime-check"
                    title={data.canRunSystemChecks ? runtimeActionLabel : `로그인 후 ${runtimeActionLabel}`}
                    aria-label={runtimeActionLabel}
                    disabled={!data.canRunSystemChecks || partDraftRuntime?.status === 'checking'}
                    onClick={() => data.onCheckSystemPart?.(id, persistedPartDraft)}
                  >
                    ↻
                  </button>
                </div>
                {partDraftRuntimeCatalog.length > 0 ? (
                  <SystemObservationCatalog
                    catalog={partDraftRuntimeCatalog}
                    collectionLabel={partDraftRuntime?.collectionLabel || partDraftRuntimeCapability.label}
                  />
                ) : (partDraftRuntimeItems || partDraftRuntimeObservations) && (
                  <div
                    className="system-runtime-data"
                    aria-label={partDraftRuntime.collectionLabel || partDraftRuntimeCapability.label}
                  >
                    <div className="system-runtime-data-heading">
                      <strong>
                        {partDraftRuntime.collectionLabel || '항목'}{' '}
                        {partDraftRuntime.totalCount ?? partDraftRuntimeItems?.length ?? partDraftRuntimeObservations?.length ?? 0}
                      </strong>
                        {partDraftRuntime.truncated && (
                          <span>표시 {partDraftRuntimeItems?.length ?? partDraftRuntimeObservations?.length ?? 0}개</span>
                        )}
                      </div>
                    {partDraftRuntimeItems && (
                      <div className="system-runtime-data-list">
                        {partDraftRuntimeItems.length ? partDraftRuntimeItems.map((item) => (
                        <div className="system-runtime-data-row" key={item.id}>
                          <div className="system-runtime-data-title">
                            <strong title={item.title}>{item.title}</strong>
                            {item.updatedAt && <time dateTime={item.updatedAt}>{runtimeUpdatedAtLabel(item.updatedAt)}</time>}
                          </div>
                          <div className="system-runtime-data-counts">
                            {item.metrics.map((metric) => (
                              <span key={metric.id}>{metric.label} <b>{metric.value}</b></span>
                            ))}
                          </div>
                        </div>
                      )) : (
                        <div className="system-runtime-data-empty">
                          조회된 {partDraftRuntime.collectionLabel || '항목'} 없음
                        </div>
                        )}
                      </div>
                    )}
                    {partDraftRuntimeObservations && (
                      <div className="system-runtime-data-list">
                        {partDraftRuntimeObservations.length ? partDraftRuntimeObservations.map((item) => (
                          <div className="system-runtime-data-row" key={item.id}>
                            <div className="system-runtime-data-title">
                              <strong title={item.label}>{item.label}</strong>
                              <time dateTime={item.observedAt}>{runtimeUpdatedAtLabel(item.observedAt)}</time>
                            </div>
                            <div className="system-runtime-data-counts">
                              <span><b>{runtimeObservationValue(item)}</b></span>
                              <code title={`${item.verification} · ${item.availability}`}>{item.category}</code>
                            </div>
                          </div>
                        )) : (
                          <div className="system-runtime-data-empty">관측된 항목 없음</div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
            {partError && <div className="system-part-editor-error">{partError}</div>}
            <div className="system-part-editor-actions">
              {systemParts.some((part) => part.id === partDraft.id) && (
                <button type="button" className="is-delete" onClick={removePart}>삭제</button>
              )}
              <span />
              <button type="button" onClick={() => setPartDraft(null)}>취소</button>
              <button type="button" className="is-save" onClick={savePart}>저장</button>
            </div>
          </div>
        </NodeToolbar>
      )}
    </div>
  )
}
