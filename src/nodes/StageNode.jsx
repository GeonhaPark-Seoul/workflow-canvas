import { useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'
import EditToolbar from '../components/EditToolbar'

const DEFAULT_TYPES = [
  { bg: '#1e3a5f', border: '#3b82f6', label: '기획' },
  { bg: '#1a3a2a', border: '#22c55e', label: '제작' },
  { bg: '#3a1a1a', border: '#ef4444', label: '검토' },
  { bg: '#1a2a3a', border: '#06b6d4', label: '실행' },
  { bg: '#2a1a3a', border: '#a855f7', label: '완료' },
]

// Bidirectional ports: type="source" + canvas connectionMode="loose" lets every
// handle act as both input and output.
const HANDLE_STYLE = (borderColor) => ({
  width: 24, height: 24, border: 'none',
  background: `radial-gradient(circle, ${borderColor} 3px, #0f0f13 3px 5px, transparent 5px)`,
})
const PORTS = [
  { id: 'left', position: Position.Left },
  { id: 'right', position: Position.Right },
  { id: 'top', position: Position.Top },
  { id: 'bottom', position: Position.Bottom },
]

// Place caret at end of contentEditable element
function caretAtEnd(el) {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.collapse(false)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

// Select all content of contentEditable element
function selectAll(el) {
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

export default function StageNode({ data, selected, id, width }) {
  const scale = Math.min(Math.max((width ?? 220) / 220, 1), 2)
  const stageTypes = data.stageTypes ?? DEFAULT_TYPES
  const colorIdx = Math.min(Math.max(data.colorIdx ?? 0, 0), stageTypes.length - 1)
  const color = stageTypes[colorIdx]

  const [editing, setEditing] = useState(null) // 'title' | 'desc' | null
  const titleRef = useRef(null)
  const descRef = useRef(null)
  const longPressTimer = useRef(null)
  const longPressStart = useRef(null)
  const lastTapRef = useRef(0)
  const dimPressTimer = useRef(null)
  const suppressClick = useRef(false)
  const titleContainerRef = useRef(null)
  const descContainerRef = useRef(null)

  // Touch double-tap → edit, while preventing the browser's double-tap zoom.
  const touchEdit = (field) => (e) => {
    const now = Date.now()
    if (now - lastTapRef.current < 300) {
      e.preventDefault()
      lastTapRef.current = 0
      startEdit(field)
    } else {
      lastTapRef.current = now
    }
  }

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

  // Set innerHTML once when entering edit mode, then focus
  useEffect(() => {
    if (editing === 'title' && titleRef.current) {
      titleRef.current.innerHTML = data.label ?? ''
      titleRef.current.focus()
      selectAll(titleRef.current)
    }
    if (editing === 'desc' && descRef.current) {
      descRef.current.innerHTML = data.description || ''
      descRef.current.focus()
      caretAtEnd(descRef.current)
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const cycleColor = (e) => {
    e.stopPropagation()
    if (suppressClick.current) { suppressClick.current = false; return }
    const next = (colorIdx + 1) % stageTypes.length
    data.onUpdate?.({ colorIdx: next })
  }

  const onDimPointerDown = (e) => {
    e.stopPropagation()
    dimPressTimer.current = setTimeout(() => {
      data.onUpdate?.({ dimmed: !data.dimmed })
      suppressClick.current = true
      dimPressTimer.current = null
    }, 500)
  }
  const onDimPointerUp = () => { clearTimeout(dimPressTimer.current); dimPressTimer.current = null }
  const onDimPointerLeave = () => { clearTimeout(dimPressTimer.current); dimPressTimer.current = null }
  const onDimPointerCancel = () => { clearTimeout(dimPressTimer.current); dimPressTimer.current = null }

  const startEdit = (field) => {
    setEditing(field)
    data.onEditStart?.()
  }

  const stopEdit = (field, ref) => {
    if (editing !== field) return
    const html = ref.current?.innerHTML ?? ''
    const patch = { label: data.label, description: data.description }
    if (field === 'title') { patch.label = html; patch.titleTouched = true }
    if (field === 'desc') { patch.description = html; patch.descTouched = true }
    setEditing(null)
    data.onEditEnd?.()
    data.onUpdate?.(patch)
  }

  // Display-mode checkbox toggle: persist innerHTML after flipping
  const handleDisplayClick = (field) => (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
      e.stopPropagation()
      e.target.toggleAttribute('checked')
      const html = e.currentTarget.innerHTML
      if (field === 'title') data.onUpdate?.({ label: html })
      if (field === 'desc') data.onUpdate?.({ description: html })
    }
  }

  const titleValue = data.label ?? ''
  const descValue = data.description || ''

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
        filter: data.dimmed ? 'grayscale(0.85) brightness(0.55)' : undefined,
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
            onPointerDown={onDimPointerDown}
            onPointerUp={onDimPointerUp}
            onPointerLeave={onDimPointerLeave}
            onPointerCancel={onDimPointerCancel}
            title="클릭: 색상 변경 · 길게 누르기: 끄기/켜기"
            style={{
              width: Math.round(14 * scale), height: Math.round(14 * scale), borderRadius: '50%',
              background: color.border, border: 'none', cursor: 'pointer', flexShrink: 0,
            }}
          />
          <span style={{ color: color.border, fontSize: Math.round(10 * scale), fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            {color.label}
          </span>
        </div>

        {/* Title field */}
        <div ref={titleContainerRef}>
          {editing === 'title' ? (
            <div
              ref={titleRef}
              contentEditable
              suppressContentEditableWarning
              className="nodrag nowheel rich-content"
              onBlur={() => stopEdit('title', titleRef)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); stopEdit('title', titleRef) } if (e.key === 'Escape') { e.preventDefault(); stopEdit('title', titleRef) } }}
              style={{
                background: 'transparent',
                borderBottom: `1px solid ${color.border}`,
                color: '#f0f0f0', fontSize: Math.round(15 * scale), fontWeight: 700,
                width: '100%', outline: 'none', marginBottom: 4,
                minHeight: Math.round(22 * scale), lineHeight: `${Math.round(22 * scale)}px`, whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            />
          ) : (
            <div
              className="rich-content"
              onDoubleClick={() => startEdit('title')}
              onTouchStart={touchEdit('title')}
              onClick={handleDisplayClick('title')}
              dangerouslySetInnerHTML={{ __html: titleValue || (data.titleTouched ? '' : '단계 이름 (더블클릭하여 편집)') }}
              style={{
                color: titleValue ? '#f0f0f0' : '#ffffff66', fontSize: Math.round(15 * scale), fontWeight: 700,
                marginBottom: 4, cursor: 'text', minHeight: Math.round(22 * scale), lineHeight: `${Math.round(22 * scale)}px`,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                touchAction: 'manipulation',
              }}
            />
          )}
        </div>
      </div>

      {/* Description — fills remaining height; double-click to edit */}
      <div style={{ flex: 1, padding: '0 12px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div ref={descContainerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {editing === 'desc' ? (
            <div
              ref={descRef}
              contentEditable
              suppressContentEditableWarning
              className="nodrag nowheel rich-content"
              onBlur={() => stopEdit('desc', descRef)}
              style={{
                flex: 1, background: 'transparent',
                color: '#aaa', fontSize: Math.round(12 * scale), width: '100%',
                outline: 'none', lineHeight: 1.5, minHeight: 0,
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowY: 'auto',
              }}
            />
          ) : (
            <div
              className="rich-content"
              onDoubleClick={() => startEdit('desc')}
              onTouchStart={touchEdit('desc')}
              onClick={handleDisplayClick('desc')}
              dangerouslySetInnerHTML={{ __html: descValue || (data.descTouched ? '' : '설명 (더블클릭하여 편집)') }}
              style={{
                flex: 1, color: descValue ? '#aaa' : '#888', fontSize: Math.round(12 * scale),
                whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'text',
                overflow: 'auto', lineHeight: 1.5, minHeight: 0,
                touchAction: 'manipulation',
              }}
            />
          )}
        </div>
      </div>

      {/* Rich-text toolbar — portalled to body */}
      <EditToolbar
        editRef={editing === 'title' ? titleRef : editing === 'desc' ? descRef : null}
        anchorRef={editing === 'title' ? titleContainerRef : editing === 'desc' ? descContainerRef : null}
      />
    </div>
  )
}
