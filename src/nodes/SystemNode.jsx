import { useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, useStore } from '@xyflow/react'
import OpenInNotesButton from '../components/OpenInNotesButton'
import ScopedParticipants from '../components/ScopedParticipants'
import { sanitizeHtml } from '../lib/sanitizeHtml'
import {
  SYSTEM_ENVIRONMENT_DEFS,
  SYSTEM_SOURCE_DEFS,
  systemKindDefinition,
  systemNodeReality,
} from '../../shared/systemOntology.js'

const PORTS = [
  { id: 'left', position: Position.Left },
  { id: 'right', position: Position.Right },
  { id: 'top', position: Position.Top },
  { id: 'bottom', position: Position.Bottom },
]

const byId = (items, id) => items.find((item) => item.id === id)

export default function SystemNode({ data, selected, id }) {
  const abstract = useStore((state) => state.transform[2] < (data.lodThreshold ?? 0.55))
  const zoomShapeOnly = useStore((state) => state.transform[2] < (data.lodThreshold ?? 0.55) * 0.45)
  const shapeOnly = data.forceShapeOnly || zoomShapeOnly
  const kind = systemKindDefinition(data.systemKind)
  const reality = systemNodeReality(data)
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
    if (data.readOnly || !selected || editingTitle || Date.now() - selectedAtRef.current < 300) return
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

  return (
    <div
      className="canvas-node-card system-node-card"
      data-reality={reality.id}
      data-proposal-preview={data.digitalTwinProposalPreview ? 'true' : undefined}
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

      {PORTS.map((port) => (
        <Handle key={port.id} type="source" id={port.id} position={port.position} style={handleStyle} />
      ))}

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
              canInvite={selected && data.canInvite && !data.readOnly}
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
                  textAlign: abstract ? 'center' : undefined, cursor: data.readOnly ? 'default' : 'text',
                }}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.label || `새 ${kind.label}`) }}
              />
            )}
          </div>

          {!abstract && (
            <>
              <div style={{ marginTop: 8, minHeight: 30, color: bodyColor, fontSize: 11.5, lineHeight: 1.45, overflow: 'hidden' }}>
                {purpose ? (
                  <div className="rich-content" dangerouslySetInnerHTML={{ __html: sanitizeHtml(purpose) }} />
                ) : (
                  <span style={{ opacity: 0.55 }}>목적 미정</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, minWidth: 0, color: bodyColor, fontSize: 9.5 }}>
                <span style={{ whiteSpace: 'nowrap' }}>{environment}</span>
                <span style={{ opacity: 0.4 }}>·</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.provider || source}</span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
