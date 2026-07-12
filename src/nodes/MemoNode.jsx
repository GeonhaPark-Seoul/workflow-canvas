import { useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeResizer, useStore } from '@xyflow/react'
import EditToolbar from '../components/EditToolbar'
import ScopedParticipants from '../components/ScopedParticipants'
import { useTheme } from './useTheme'
import { sanitizeHtml } from '../lib/sanitizeHtml'

// Bidirectional connection ports: every handle is type="source"; with the
// canvas in connectionMode="loose", a source handle can also receive a
// connection, so any port can be both an input and an output.
const HANDLE = {
  width: 45, height: 45, border: 'none',
  background: 'radial-gradient(circle, #f59e0b 7px, #0f0f13 7px 10.5px, transparent 10.5px)',
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

// Place the caret at a viewport point (click position) inside el, falling back to
// end-of-content if the point can't be resolved to a range inside el.
function placeCaretAt(el, pos) {
  if (pos) {
    let range = null
    if (document.caretRangeFromPoint) {
      range = document.caretRangeFromPoint(pos.x, pos.y)
    } else if (document.caretPositionFromPoint) {
      const cp = document.caretPositionFromPoint(pos.x, pos.y)
      if (cp) { range = document.createRange(); range.setStart(cp.offsetNode, cp.offset) }
    }
    if (range && el.contains(range.startContainer)) {
      range.collapse(true)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      return
    }
  }
  caretAtEnd(el)
}

// Wrap br-separated top-level text into <div> lines so per-line hover/caret-line CSS
// can target individual lines. Content that already has block-level tags is untouched.
function wrapLines(html) {
  if (!html) return html
  if (/<(div|p|li|summary|ul|ol)[\s>]/i.test(html)) return html
  return html.split(/<br\s*\/?>/i).map((line) => `<div>${line}</div>`).join('')
}

export default function MemoNode({ data, selected, id }) {
  // Abstract (LOD) mode: re-renders only when crossing the threshold, not every zoom tick.
  const abstract = useStore((s) => s.transform[2] < (data.lodThreshold ?? 0.55))
  // Shape-only (deeper LOD) mode: below this, all text/content disappears — only the colored shape + handles remain.
  // Also forced by the App agent (data.forceShapeOnly) for out-of-region nodes under view-restricted sharing.
  const zoomShapeOnly = useStore((s) => s.transform[2] < (data.lodThreshold ?? 0.55) * 0.45)
  const shapeOnly = zoomShapeOnly || data.forceShapeOnly

  const filled = data.nodeFill !== false
  const theme = useTheme()
  // Light theme + fill off ⇒ the node's background is transparent over a light page,
  // so the usual amber/yellow text would go low-contrast — use dark text instead.
  const darkText = theme === 'light' && !filled
  const headerColor = darkText ? '#1a1a22' : '#f59e0b'
  const headerPlaceholderColor = darkText ? '#999' : '#f59e0b66'
  const textColor = darkText ? '#333' : '#e8d88a'
  const textPlaceholderColor = darkText ? '#999' : '#e8d88a55'

  const [editing, setEditing] = useState(null) // 'header' | 'text' | null
  const headerRef = useRef(null)
  const textRef = useRef(null)
  const textDisplayRef = useRef(null)
  const longPressTimer = useRef(null)
  const longPressStart = useRef(null)
  const dimPressTimer = useRef(null)
  const headerContainerRef = useRef(null)
  const textContainerRef = useRef(null)
  const caretPosRef = useRef(null)
  const [textHover, setTextHover] = useState(null) // { top, height } | null — mousemove-follow line strip
  const [textCaret, setTextCaret] = useState(null) // { top, height } | null — always-on caret line strip while editing

  // Click-to-edit cycle: click 1 selects (React Flow default), click 2 (while already
  // selected) starts editing. React Flow selects on mousedown, so the first click's
  // `click` event already sees selected===true — guard with a timestamp so a fresh
  // selection can't be instantly followed by an edit-start on the same click.
  const selectedAtRef = useRef(0)
  useEffect(() => {
    if (selected) selectedAtRef.current = Date.now()
  }, [selected])
  const justSelected = () => Date.now() - selectedAtRef.current < 300

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

  // Set innerHTML once when entering edit mode, then focus with the caret at the
  // click position that triggered the edit (falls back to end-of-content).
  useEffect(() => {
    if (editing === 'header' && headerRef.current) {
      headerRef.current.innerHTML = sanitizeHtml(data.header ?? '')
      headerRef.current.focus()
      placeCaretAt(headerRef.current, caretPosRef.current)
    }
    if (editing === 'text' && textRef.current) {
      textRef.current.innerHTML = wrapLines(sanitizeHtml(data.text || ''))
      textRef.current.focus()
      placeCaretAt(textRef.current, caretPosRef.current)
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  // Caret-line strip for the text field while editing: an always-on overlay positioned
  // from the current selection's bounding rect. Both rects are viewport-relative and
  // already reflect live scroll position, so no manual scroll math is needed. Cleared
  // whenever `editing` changes (including on edit end), so no stuck strip can remain.
  useEffect(() => {
    if (editing !== 'text') { setTextCaret(null); return }
    const root = textRef.current
    const container = textContainerRef.current
    if (!root || !container) return
    const update = () => {
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) return
      const range = sel.getRangeAt(0)
      let rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        const rects = range.getClientRects()
        if (rects.length) rect = rects[0]
      }
      if (!rect || (rect.width === 0 && rect.height === 0)) return
      const containerRect = container.getBoundingClientRect()
      const style = getComputedStyle(root)
      let lineHeight = parseFloat(style.lineHeight)
      if (!lineHeight || Number.isNaN(lineHeight)) lineHeight = parseFloat(style.fontSize) * 1.5
      setTextCaret({ top: rect.top - containerRect.top, height: lineHeight })
    }
    document.addEventListener('selectionchange', update)
    update()
    return () => {
      document.removeEventListener('selectionchange', update)
      setTextCaret(null)
    }
  }, [editing])

  // Hover-follow line strip for the text field (display or edit): tracks the mouse and
  // highlights whichever soft-wrapped line it's under. Cleared on edit-mode transitions
  // and on mouseleave, so nothing can get stuck once the pointer moves away. Skipped on
  // coarse (touch) pointers — the selected-state pill affordance (.text-hover-line, CSS)
  // covers that case instead.
  useEffect(() => { setTextHover(null) }, [editing])
  const handleTextMouseMove = (e) => {
    if (window.matchMedia?.('(pointer: coarse)').matches) return
    const el = editing === 'text' ? textRef.current : textDisplayRef.current
    const container = textContainerRef.current
    if (!el || !container) return
    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const style = getComputedStyle(el)
    let lineHeight = parseFloat(style.lineHeight)
    if (!lineHeight || Number.isNaN(lineHeight)) lineHeight = parseFloat(style.fontSize) * 1.5
    const y = e.clientY - elRect.top + el.scrollTop
    const lineIndex = Math.max(0, Math.floor(y / lineHeight))
    setTextHover({ top: (elRect.top - containerRect.top) + lineIndex * lineHeight - el.scrollTop, height: lineHeight })
  }
  const handleTextMouseLeave = () => setTextHover(null)

  const onDimPointerDown = (e) => {
    if (data.readOnly) return
    e.stopPropagation()
    dimPressTimer.current = setTimeout(() => {
      data.onUpdate?.({ dimmed: !data.dimmed })
      dimPressTimer.current = null
    }, 500)
  }
  const onDimPointerUp = () => { clearTimeout(dimPressTimer.current); dimPressTimer.current = null }
  const onDimPointerLeave = () => { clearTimeout(dimPressTimer.current); dimPressTimer.current = null }
  const onDimPointerCancel = () => { clearTimeout(dimPressTimer.current); dimPressTimer.current = null }

  const startEdit = (field, pos) => {
    if (data.readOnly) return
    caretPosRef.current = pos ?? null; setEditing(field); data.onEditStart?.()
  }

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

  // Display-mode click: toggles a checkbox if that's what was clicked, otherwise
  // starts editing the field once the node is selected (click-to-edit cycle).
  const handleDisplayClick = (field) => (e) => {
    if (data.readOnly) return
    if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
      e.stopPropagation()
      e.target.toggleAttribute('checked')
      const html = e.currentTarget.innerHTML
      if (field === 'header') data.onUpdate?.({ header: html })
      if (field === 'text') data.onUpdate?.({ text: html })
      return
    }
    if (!selected || editing || justSelected()) return
    startEdit(field, { x: e.clientX, y: e.clientY })
  }

  const headerValue = data.header ?? ''
  const textValue = data.text || ''

  const headerFontSize = abstract ? Math.round(13 * 1.15) : 13
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
        background: filled ? '#2a2510' : 'transparent',
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
        isVisible={selected && !data.readOnly}
        minWidth={160}
        minHeight={80}
        color="#f59e0b"
        handleStyle={{
          width: 20, height: 20, background: 'transparent', border: 'none',
          backgroundImage: 'radial-gradient(circle, #f59e0b 5px, transparent 5px)',
          backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
        }}
        lineStyle={{ borderColor: '#f59e0b44' }}
      />

      {PORTS.map((p) => (
        <Handle key={p.id} type="source" id={p.id} position={p.position} style={HANDLE} />
      ))}

      {/* Header strip — editable, blank by default; fully hidden in the shape-only tier */}
      {!shapeOnly && (
      <div
        style={{
          background: filled ? '#f59e0b22' : 'transparent',
          borderBottom: abstract ? 'none' : '1px solid #f59e0b44',
          padding: '5px 10px',
          borderRadius: abstract ? 10 : '10px 10px 0 0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: abstract ? 'center' : undefined,
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
        <div ref={headerContainerRef} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
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
                color: headerColor, fontSize: headerFontSize, fontWeight: 800, letterSpacing: 0.3,
                outline: 'none', minHeight: 18, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                cursor: 'text', textAlign: abstract ? 'center' : undefined,
              }}
            />
          ) : (
            <div
              className="rich-content text-hover-line"
              onClick={handleDisplayClick('header')}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(headerValue || (data.headerTouched ? '' : '제목')) }}
              style={{
                flex: 1, color: headerValue ? headerColor : headerPlaceholderColor,
                fontSize: headerFontSize, fontWeight: 800, letterSpacing: 0.3, cursor: 'text',
                whiteSpace: abstract ? 'pre-wrap' : 'nowrap',
                overflow: abstract ? 'visible' : 'hidden',
                textOverflow: abstract ? 'unset' : 'ellipsis',
                textAlign: abstract ? 'center' : undefined,
                touchAction: 'manipulation',
              }}
            />
          )}
        </div>
        <ScopedParticipants
          participants={data.scopedParticipants}
          canInvite={selected && data.canInvite && !data.readOnly}
          onInvite={data.onInvite}
          scope="node"
          targetId={id}
        />
      </div>
      )}

      {/* Content — only rendered in normal (non-abstract) mode, or when being edited; always hidden under shapeOnly */}
      {!shapeOnly && (!abstract || editing === 'text') && (
        <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div
            ref={textContainerRef}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}
            onMouseMove={handleTextMouseMove}
            onMouseLeave={handleTextMouseLeave}
          >
            {editing === 'text' ? (
              <div
                ref={textRef}
                contentEditable
                suppressContentEditableWarning
                className="nodrag nowheel rich-content"
                onBlur={() => stopEdit('text', textRef)}
                style={{
                  flex: 1, background: 'transparent',
                  color: textColor, fontSize: 12, width: '100%',
                  outline: 'none', lineHeight: 1.6, minHeight: 0, cursor: 'text',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowY: 'auto',
                  overscrollBehavior: 'contain',
                }}
              />
            ) : (
              <div
                ref={textDisplayRef}
                className="rich-content nowheel"
                onClick={handleDisplayClick('text')}
                dangerouslySetInnerHTML={{ __html: wrapLines(sanitizeHtml(textValue || (data.textTouched ? '' : '메모 내용'))) }}
                style={{
                  flex: 1, color: textValue ? textColor : textPlaceholderColor, fontSize: 12,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'text',
                  overflowY: 'auto', overscrollBehavior: 'contain', lineHeight: 1.6, minHeight: 0,
                  touchAction: 'manipulation',
                }}
              />
            )}
            {textHover && (
              <div style={{ position: 'absolute', left: -4, right: -4, top: textHover.top, height: textHover.height, borderRadius: 6, background: '#ffffff12', pointerEvents: 'none' }} />
            )}
            {textCaret && (
              <div style={{ position: 'absolute', left: -4, right: -4, top: textCaret.top, height: textCaret.height, borderRadius: 6, background: '#ffffff12', pointerEvents: 'none' }} />
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
