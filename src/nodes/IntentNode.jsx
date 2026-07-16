import { useEffect, useRef, useState } from 'react'
import { Handle, NodeResizer, Position, useStore } from '@xyflow/react'
import OpenInNotesButton from '../components/OpenInNotesButton'
import ScopedParticipants from '../components/ScopedParticipants'
import {
  intentKindDefinition,
  intentStatusDefinition,
  intentVersionState,
} from '../../shared/intentOntology.js'

const PORTS = [
  { id: 'left', position: Position.Left },
  { id: 'right', position: Position.Right },
  { id: 'top', position: Position.Top },
  { id: 'bottom', position: Position.Bottom },
]

export default function IntentNode({ data, selected, id }) {
  const abstract = useStore((state) => state.transform[2] < (data.lodThreshold ?? 0.55))
  const zoomShapeOnly = useStore((state) => state.transform[2] < (data.lodThreshold ?? 0.55) * 0.45)
  const shapeOnly = data.forceShapeOnly || zoomShapeOnly
  const kind = intentKindDefinition(data.intentKind)
  const status = intentStatusDefinition(data.intentStatus)
  const version = intentVersionState(data)
  const filled = data.nodeFill !== false
  const darkText = data.theme === 'light' && !filled
  const titleColor = darkText ? '#17191f' : '#f4f1f3'
  const bodyColor = darkText ? '#4b5563' : '#c4b8c0'

  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(data.label ?? '')
  const selectedAtRef = useRef(0)
  const longPressTimer = useRef(null)
  const longPressStart = useRef(null)

  useEffect(() => { setTitleDraft(data.label ?? '') }, [data.label])
  useEffect(() => {
    if (selected) selectedAtRef.current = Date.now()
    else setEditingTitle(false)
  }, [selected])

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

  const clearLongPress = () => {
    clearTimeout(longPressTimer.current)
    longPressTimer.current = null
    longPressStart.current = null
  }

  const handleStyle = {
    width: 45,
    height: 45,
    border: 'none',
    background: `radial-gradient(circle, ${kind.color} 7px, #0f0f13 7px 10.5px, transparent 10.5px)`,
  }

  return (
    <div
      className="canvas-node-card intent-node-card"
      style={{
        width: '100%', height: '100%', minWidth: 220, minHeight: 120,
        boxSizing: 'border-box', position: 'relative', display: 'flex', flexDirection: 'column',
        justifyContent: abstract ? 'center' : undefined,
        background: filled ? '#2b1d24' : 'transparent',
        border: `2px solid ${selected ? '#ffffff' : `${kind.color}99`}`,
        borderRadius: 8, boxShadow: 'none', overflow: 'visible',
        transition: 'border-color 0.15s, background-color 0.15s',
        filter: data.dimmed ? 'grayscale(0.85) brightness(0.55)' : undefined,
        touchAction: 'manipulation',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearLongPress}
      onPointerCancel={clearLongPress}
    >
      <OpenInNotesButton visible={selected && !shapeOnly} onOpen={data.onOpenInNotes} />
      <NodeResizer
        isVisible={selected && !data.readOnly}
        minWidth={220}
        minHeight={120}
        color={kind.color}
        handleStyle={{
          width: 20, height: 20, background: 'transparent', border: 'none',
          backgroundImage: `radial-gradient(circle, ${kind.color} 5px, transparent 5px)`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
        }}
        lineStyle={{ borderColor: `${kind.color}66` }}
      />

      {PORTS.map((port) => (
        <Handle key={port.id} type="source" id={port.id} position={port.position} style={handleStyle} />
      ))}

      {!shapeOnly && (
        <div style={{ padding: abstract ? '12px 14px' : '10px 12px', minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minHeight: 22 }}>
            <span style={{ color: kind.color, fontSize: 14, fontWeight: 900 }}>◇</span>
            <span style={{ color: kind.color, fontSize: 10, fontWeight: 800 }}>{kind.label}</span>
            <span style={{
              color: status.color, border: `1px solid ${status.color}66`, background: `${status.color}18`,
              borderRadius: 4, padding: '1px 5px', fontSize: 9, fontWeight: 800,
            }}>{status.label}</span>
            <span
              title={version.dirty ? '현재 초안이 마지막 기록본과 다릅니다.' : '현재 내용이 마지막 기록본과 같습니다.'}
              style={{ marginLeft: 'auto', color: version.dirty ? '#f59e0b' : '#8b94a7', fontSize: 9.5, fontWeight: 750 }}
            >{version.label}</span>
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

          <div style={{ marginTop: 8, minWidth: 0 }}>
            {editingTitle ? (
              <input
                autoFocus
                className="nodrag nowheel"
                value={titleDraft}
                maxLength={180}
                onChange={(event) => setTitleDraft(event.target.value)}
                onBlur={() => finishTitleEdit(true)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') { event.preventDefault(); finishTitleEdit(true) }
                  if (event.key === 'Escape') { event.preventDefault(); finishTitleEdit(false) }
                }}
                style={{
                  width: '100%', boxSizing: 'border-box', background: 'transparent', border: 'none',
                  borderBottom: `1px solid ${kind.color}`, outline: 'none', color: titleColor,
                  fontSize: abstract ? 15 : 14, fontWeight: 750, padding: '1px 0 2px', fontFamily: 'inherit',
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
              >{data.label || `새 ${kind.label}`}</div>
            )}
          </div>

          {!abstract && (
            <div style={{
              marginTop: 7, color: bodyColor, fontSize: 11.5, lineHeight: 1.45,
              display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}>
              {data.statement || '의도 내용을 노트 창에서 작성하세요.'}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
