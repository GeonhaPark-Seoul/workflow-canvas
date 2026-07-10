import { useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeResizer, useStore } from '@xyflow/react'
import EditToolbar from '../components/EditToolbar'

// Bidirectional connection ports: every handle is type="source"; with the
// canvas in connectionMode="loose", a source handle can also receive a
// connection, so any port can be both an input and an output.
const HANDLE = {
  width: 30, height: 30, border: 'none',
  background: 'radial-gradient(circle, #f59e0b 4.5px, #0f0f13 4.5px 7px, transparent 7px)',
}
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

export default function MemoNode({ data, selected, id }) {
  // Abstract (LOD) mode: re-renders only when crossing the threshold, not every zoom tick.
  const abstract = useStore((s) => s.transform[2] < (data.lodThreshold ?? 0.55))
  // Shape-only (deeper LOD) mode: below this, all text/content disappears — only the colored shape + handles remain.
  const shapeOnly = useStore((s) => s.transform[2] < (data.lodThreshold ?? 0.55) * 0.45)

  const [editing, setEditing] = useState(null) // 'header' | 'text' | null
  const headerRef = useRef(null)
  const textRef = useRef(null)
  const longPressTimer = useRef(null)
  const longPressStart = useRef(null)
  const lastTapRef = useRef(0)
  const dimPressTimer = useRef(null)
  const headerContainerRef = useRef(null)
  const textContainerRef = useRef(null)

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
    if (editing === 'header' && headerRef.current) {
      headerRef.current.innerHTML = data.header ?? ''
      headerRef.current.focus()
      selectAll(headerRef.current)
    }
    if (editing === 'text' && textRef.current) {
      textRef.current.innerHTML = data.text || ''
      textRef.current.focus()
      caretAtEnd(textRef.current)
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const onDimPointerDown = (e) => {
    e.stopPropagation()
    dimPressTimer.current = setTimeout(() => {
      data.onUpdate?.({ dimmed: !data.dimmed })
      dimPressTimer.current = null
    }, 500)
  }
  const onDimPointerUp = () => { clearTimeout(dimPressTimer.current); dimPressTimer.current = null }
  const onDimPointerLeave = () => { clearTimeout(dimPressTimer.current); dimPressTimer.current = null }
  const onDimPointerCancel = () => { clearTimeout(dimPressTimer.current); dimPressTimer.current = null }

  const startEdit = (field) => { setEditing(field); data.onEditStart?.() }

  const stopEdit = (field, ref) => {
    if (editing !== field) return
    const html = ref.current?.innerHTML ?? ''
    const patch = { header: data.header, text: data.text }
    if (field === 'header') { patch.header = html; patch.headerTouched = true }
    if (field === 'text') { patch.text = html; patch.textTouched = true }
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
      if (field === 'header') data.onUpdate?.({ header: html })
      if (field === 'text') data.onUpdate?.({ text: html })
    }
  }

  const headerValue = data.header ?? ''
  const textValue = data.text || ''

  const headerFontSize = abstract ? Math.round(13 * 1.9) : 13
  const circleSize = abstract ? Math.round(14 * 1.9) : 14

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minWidth: 160,
        minHeight: 80,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: abstract ? 'center' : undefined,
        background: '#2a2510',
        border: `2px solid ${selected ? '#ffffff' : '#f59e0b88'}`,
        borderRadius: 12,
        boxShadow: selected
          ? '0 0 0 2px #f59e0b44, 0 8px 32px #0008'
          : '0 4px 16px #0005',
        transition: 'border-color 0.15s, box-shadow 0.15s',
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
        minWidth={160}
        minHeight={80}
        color="#f59e0b"
        handleStyle={{ width: 10, height: 10, borderRadius: 5, border: '2px solid #f59e0b' }}
        lineStyle={{ borderColor: '#f59e0b44' }}
      />

      {PORTS.map((p) => (
        <Handle key={p.id} type="source" id={p.id} position={p.position} style={HANDLE} />
      ))}

      {/* Header strip — editable, blank by default; fully hidden in the shape-only tier */}
      {!shapeOnly && (
      <div
        style={{
          background: '#f59e0b22',
          borderBottom: abstract ? 'none' : '1px solid #f59e0b44',
          padding: '5px 10px',
          borderRadius: abstract ? 10 : '10px 10px 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          minHeight: 26,
        }}
      >
        <button
          onPointerDown={onDimPointerDown}
          onPointerUp={onDimPointerUp}
          onPointerLeave={onDimPointerLeave}
          onPointerCancel={onDimPointerCancel}
          title="길게 누르기: 끄기/켜기"
          style={{
            width: circleSize, height: circleSize, borderRadius: '50%',
            background: '#f59e0b', border: 'none', cursor: 'pointer', flexShrink: 0,
          }}
        />
        <div ref={headerContainerRef} style={{ flex: 1, minWidth: 0 }}>
          {editing === 'header' ? (
            <div
              ref={headerRef}
              contentEditable
              suppressContentEditableWarning
              className="nodrag nowheel rich-content"
              onBlur={() => stopEdit('header', headerRef)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); stopEdit('header', headerRef) } if (e.key === 'Escape') { e.preventDefault(); stopEdit('header', headerRef) } }}
              style={{
                flex: 1, background: 'transparent',
                borderBottom: '1px solid #f59e0b88',
                color: '#f59e0b', fontSize: headerFontSize, fontWeight: 800, letterSpacing: 0.3,
                outline: 'none', minHeight: 18, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
              }}
            />
          ) : (
            <div
              className="rich-content"
              onDoubleClick={() => startEdit('header')}
              onTouchStart={touchEdit('header')}
              onClick={handleDisplayClick('header')}
              dangerouslySetInnerHTML={{ __html: headerValue || (data.headerTouched ? '' : '제목 (더블클릭)') }}
              style={{
                flex: 1, color: headerValue ? '#f59e0b' : '#f59e0b66',
                fontSize: headerFontSize, fontWeight: 800, letterSpacing: 0.3, cursor: 'text',
                whiteSpace: abstract ? 'pre-wrap' : 'nowrap',
                overflow: abstract ? 'visible' : 'hidden',
                textOverflow: abstract ? 'unset' : 'ellipsis',
                touchAction: 'manipulation',
              }}
            />
          )}
        </div>
      </div>
      )}

      {/* Content — only rendered in normal (non-abstract) mode, or when being edited */}
      {(!abstract || editing === 'text') && (
        <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div ref={textContainerRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {editing === 'text' ? (
              <div
                ref={textRef}
                contentEditable
                suppressContentEditableWarning
                className="nodrag nowheel rich-content"
                onBlur={() => stopEdit('text', textRef)}
                style={{
                  flex: 1, background: 'transparent',
                  color: '#e8d88a', fontSize: 12, width: '100%',
                  outline: 'none', lineHeight: 1.6, minHeight: 0,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowY: 'auto',
                }}
              />
            ) : (
              <div
                className="rich-content"
                onDoubleClick={() => startEdit('text')}
                onTouchStart={touchEdit('text')}
                onClick={handleDisplayClick('text')}
                dangerouslySetInnerHTML={{ __html: textValue || (data.textTouched ? '' : '메모 내용 (더블클릭하여 편집)') }}
                style={{
                  flex: 1, color: textValue ? '#e8d88a' : '#e8d88a55', fontSize: 12,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'text',
                  overflow: 'auto', lineHeight: 1.6, minHeight: 0,
                  touchAction: 'manipulation',
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Rich-text toolbar — portalled to body */}
      <EditToolbar
        editRef={editing === 'header' ? headerRef : editing === 'text' ? textRef : null}
        anchorRef={editing === 'header' ? headerContainerRef : editing === 'text' ? textContainerRef : null}
      />
    </div>
  )
}
