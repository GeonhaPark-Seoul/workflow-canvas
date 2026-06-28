import { useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'

const DEFAULT_TYPES = [
  { bg: '#1e3a5f', border: '#3b82f6', label: '기획' },
  { bg: '#1a3a2a', border: '#22c55e', label: '개발' },
  { bg: '#3a1a1a', border: '#ef4444', label: '검토' },
  { bg: '#2d2a1a', border: '#f59e0b', label: '배포' },
  { bg: '#2a1a3a', border: '#a855f7', label: '완료' },
]

// Bidirectional ports: type="source" + canvas connectionMode="loose" lets every
// handle act as both input and output.
const HANDLE_STYLE = (borderColor) => ({
  width: 10, height: 10, border: `2px solid #0f0f13`, background: borderColor,
})
const PORTS = [
  { id: 'left', position: Position.Left },
  { id: 'right', position: Position.Right },
  { id: 'top', position: Position.Top },
  { id: 'bottom', position: Position.Bottom },
]

export default function StageNode({ data, selected, id }) {
  const stageTypes = data.stageTypes ?? DEFAULT_TYPES
  const colorIdx = Math.min(Math.max(data.colorIdx ?? 0, 0), stageTypes.length - 1)
  const color = stageTypes[colorIdx]

  const [editing, setEditing] = useState(null) // 'title' | 'desc' | null
  const [title, setTitle] = useState(data.label ?? '')
  const [description, setDescription] = useState(data.description || '')
  const titleRef = useRef(null)
  const descRef = useRef(null)
  const longPressTimer = useRef(null)
  const longPressStart = useRef(null)

  const handlePointerDown = (e) => {
    if (e.pointerType !== 'touch') return
    longPressStart.current = { x: e.clientX, y: e.clientY }
    const cx = e.clientX, cy = e.clientY
    longPressTimer.current = setTimeout(() => {
      data.onLongPress?.(cx, cy)
      longPressTimer.current = null
    }, 500)
  }
  const handlePointerMove = (e) => {
    if (!longPressStart.current || !longPressTimer.current) return
    if (Math.hypot(e.clientX - longPressStart.current.x, e.clientY - longPressStart.current.y) > 10)
      clearTimeout(longPressTimer.current)
  }
  const handlePointerUp = () => { clearTimeout(longPressTimer.current); longPressStart.current = null }

  useEffect(() => {
    if (editing === 'title' && titleRef.current) { titleRef.current.focus(); titleRef.current.select() }
    if (editing === 'desc' && descRef.current) { descRef.current.focus() }
  }, [editing])

  // Sync external label/description changes (e.g. from undo/redo, canvas switch)
  useEffect(() => { setTitle(data.label ?? '') }, [data.label])
  useEffect(() => { setDescription(data.description || '') }, [data.description])

  const cycleColor = (e) => {
    e.stopPropagation()
    const next = (colorIdx + 1) % stageTypes.length
    data.onUpdate?.({ colorIdx: next })
  }

  const startEdit = (field) => {
    // Clear the auto-generated default so the first edit starts blank
    if (field === 'title' && title === '새 단계') setTitle('')
    setEditing(field)
    data.onEditStart?.()
  }
  const stopEdit = () => {
    const patch = { label: title, description }
    if (editing === 'title') patch.titleTouched = true
    if (editing === 'desc') patch.descTouched = true
    setEditing(null)
    data.onEditEnd?.()
    data.onUpdate?.(patch)
  }
  const cancelEdit = () => {
    setTitle(data.label ?? '')
    setDescription(data.description || '')
    const patch = {}
    if (editing === 'title') patch.titleTouched = true
    setEditing(null)
    data.onEditEnd?.()
    if (Object.keys(patch).length > 0) data.onUpdate?.(patch)
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minWidth: 200,
        minHeight: 80,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: color.bg,
        border: `2px solid ${selected ? '#ffffff' : color.border}`,
        borderRadius: 0,
        boxShadow: selected
          ? `0 0 0 2px ${color.border}55, 0 8px 32px #0008`
          : '0 4px 20px #0005',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        cursor: 'default',
        touchAction: 'manipulation',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={200}
        minHeight={80}
        color={color.border}
        handleStyle={{ width: 10, height: 10, borderRadius: 2, border: `2px solid ${color.border}` }}
        lineStyle={{ borderColor: `${color.border}66` }}
      />

      {PORTS.map((p) => (
        <Handle key={p.id} type="source" id={p.id} position={p.position} style={HANDLE_STYLE(color.border)} />
      ))}

      {/* Header */}
      <div style={{ padding: '10px 12px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <button
            onClick={cycleColor}
            title="색상 변경"
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: color.border, border: 'none', cursor: 'pointer', flexShrink: 0,
            }}
          />
          <span style={{ color: color.border, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            {color.label}
          </span>
        </div>

        {editing === 'title' ? (
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={stopEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') stopEdit(); if (e.key === 'Escape') cancelEdit() }}
            placeholder="단계 이름 입력..."
            style={{
              background: 'transparent', border: 'none',
              borderBottom: `1px solid ${color.border}`,
              color: '#f0f0f0', fontSize: 15, fontWeight: 700,
              width: '100%', outline: 'none', marginBottom: 4, fontFamily: 'inherit',
            }}
          />
        ) : (
          <div
            onDoubleClick={() => startEdit('title')}
            style={{
              color: title ? '#f0f0f0' : '#ffffff66', fontSize: 15, fontWeight: 700,
              marginBottom: 4, cursor: 'text', minHeight: 22, lineHeight: '22px',
              touchAction: 'manipulation',
            }}
          >
            {title || (data.titleTouched ? '' : '단계 이름 (더블클릭하여 편집)')}
          </div>
        )}
      </div>

      {/* Description — fills remaining height; double-click to edit */}
      <div style={{ flex: 1, padding: '0 12px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {editing === 'desc' ? (
          <textarea
            ref={descRef}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={stopEdit}
            placeholder={data.descTouched ? '' : '설명을 입력하세요...'}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: '#aaa', fontSize: 12, width: '100%',
              resize: 'none', outline: 'none',
              fontFamily: 'inherit', lineHeight: 1.5, minHeight: 0,
            }}
          />
        ) : (
          <div
            onDoubleClick={() => startEdit('desc')}
            style={{
              flex: 1, color: description ? '#aaa' : '#888', fontSize: 12,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'text',
              overflow: 'auto', lineHeight: 1.5, minHeight: 0,
              touchAction: 'manipulation',
            }}
          >
            {description || (data.descTouched ? '' : '설명 (더블클릭하여 편집)')}
          </div>
        )}
      </div>
    </div>
  )
}
