import { useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeResizer, useStore } from '@xyflow/react'
import EditToolbar from '../components/EditToolbar'
import { useTheme } from './useTheme'
import { sanitizeHtml } from '../lib/sanitizeHtml'

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
  width: 45, height: 45, border: 'none',
  background: `radial-gradient(circle, ${borderColor} 7px, #0f0f13 7px 10.5px, transparent 10.5px)`,
})
const PORTS = [
  { id: 'left', position: Position.Left },
  { id: 'right', position: Position.Right },
  { id: 'top', position: Position.Top },
  { id: 'bottom', position: Position.Bottom },
]

// Per-part ports: outlet-style sockets. See .part-socket in index.css for the slot pseudo-elements.
const PART_SOCKET_STYLE = (partColor) => ({
  width: 20, height: 26, borderRadius: 4,
  background: '#0f0f13', border: `1.5px solid ${partColor}`,
})

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

export default function StageNode({ data, selected, id }) {
  const stageTypes = data.stageTypes ?? DEFAULT_TYPES
  const colorIdx = Math.min(Math.max(data.colorIdx ?? 0, 0), stageTypes.length - 1)
  const color = stageTypes[colorIdx]

  // Abstract (LOD) mode: re-renders only when crossing the threshold, not every zoom tick.
  const abstract = useStore((s) => s.transform[2] < (data.lodThreshold ?? 0.55))
  // Shape-only (deeper LOD) mode: below this, all text/content disappears — only the colored shape + handles remain.
  // Also forced by the App agent (data.forceShapeOnly) for out-of-region nodes under view-restricted sharing.
  const zoomShapeOnly = useStore((s) => s.transform[2] < (data.lodThreshold ?? 0.55) * 0.45)
  const shapeOnly = zoomShapeOnly || data.forceShapeOnly

  const filled = data.nodeFill !== false
  const theme = useTheme()
  // Light theme + fill off ⇒ the node's background is transparent over a light page,
  // so text drawn in the usual light-on-dark colors would go invisible — use dark text instead.
  const darkText = theme === 'light' && !filled
  const titleColor = darkText ? '#1a1a22' : '#f0f0f0'
  const titlePlaceholderColor = darkText ? '#999' : '#ffffff66'
  const descColor = darkText ? '#333' : '#f0f0f0'
  const descPlaceholderColor = darkText ? '#999' : '#888'

  const [editing, setEditing] = useState(null) // 'title' | 'desc' | null
  const titleRef = useRef(null)
  const descRef = useRef(null)
  const descDisplayRef = useRef(null)
  const longPressTimer = useRef(null)
  const longPressStart = useRef(null)
  const dimPressTimer = useRef(null)
  const suppressClick = useRef(false)
  const titleContainerRef = useRef(null)
  const descContainerRef = useRef(null)
  const caretPosRef = useRef(null)
  const [descHover, setDescHover] = useState(null) // { top, height } | null — mousemove-follow line strip
  const [descCaret, setDescCaret] = useState(null) // { top, height } | null — always-on caret line strip while editing

  // Parts list: inline text editing per-row (id of the part currently being edited)
  const [editingPartId, setEditingPartId] = useState(null)
  const [partDraft, setPartDraft] = useState('')

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
    if (editing === 'title' && titleRef.current) {
      titleRef.current.innerHTML = sanitizeHtml(data.label ?? '')
      titleRef.current.focus()
      placeCaretAt(titleRef.current, caretPosRef.current)
    }
    if (editing === 'desc' && descRef.current) {
      descRef.current.innerHTML = wrapLines(sanitizeHtml(data.description || ''))
      descRef.current.focus()
      placeCaretAt(descRef.current, caretPosRef.current)
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  // Caret-line strip for the desc field while editing: an always-on overlay positioned
  // from the current selection's bounding rect. Both rects are viewport-relative and
  // already reflect live scroll position, so no manual scroll math is needed. Cleared
  // whenever `editing` changes (including on edit end), so no stuck strip can remain.
  useEffect(() => {
    if (editing !== 'desc') { setDescCaret(null); return }
    const root = descRef.current
    const container = descContainerRef.current
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
      setDescCaret({ top: rect.top - containerRect.top, height: lineHeight })
    }
    document.addEventListener('selectionchange', update)
    update()
    return () => {
      document.removeEventListener('selectionchange', update)
      setDescCaret(null)
    }
  }, [editing])

  // Hover-follow line strip for the desc field (display or edit): tracks the mouse and
  // highlights whichever soft-wrapped line it's under. Cleared on edit-mode transitions
  // and on mouseleave, so nothing can get stuck once the pointer moves away. Skipped on
  // coarse (touch) pointers — the selected-state pill affordance (.text-hover-line, CSS)
  // covers that case instead.
  useEffect(() => { setDescHover(null) }, [editing])
  const handleDescMouseMove = (e) => {
    if (window.matchMedia?.('(pointer: coarse)').matches) return
    const el = editing === 'desc' ? descRef.current : descDisplayRef.current
    const container = descContainerRef.current
    if (!el || !container) return
    const elRect = el.getBoundingClientRect()
    const containerRect = container.getBoundingClientRect()
    const style = getComputedStyle(el)
    let lineHeight = parseFloat(style.lineHeight)
    if (!lineHeight || Number.isNaN(lineHeight)) lineHeight = parseFloat(style.fontSize) * 1.5
    const y = e.clientY - elRect.top + el.scrollTop
    const lineIndex = Math.max(0, Math.floor(y / lineHeight))
    setDescHover({ top: (elRect.top - containerRect.top) + lineIndex * lineHeight - el.scrollTop, height: lineHeight })
  }
  const handleDescMouseLeave = () => setDescHover(null)

  const cycleColor = (e) => {
    e.stopPropagation()
    if (suppressClick.current) { suppressClick.current = false; return }
    if (data.readOnly) return
    const next = (colorIdx + 1) % stageTypes.length
    data.onUpdate?.({ colorIdx: next })
  }

  const onDimPointerDown = (e) => {
    e.stopPropagation()
    if (data.readOnly) return
    dimPressTimer.current = setTimeout(() => {
      data.onUpdate?.({ dimmed: !data.dimmed })
      suppressClick.current = true
      dimPressTimer.current = null
    }, 500)
  }
  const onDimPointerUp = () => { clearTimeout(dimPressTimer.current); dimPressTimer.current = null }
  const onDimPointerLeave = () => { clearTimeout(dimPressTimer.current); dimPressTimer.current = null }
  const onDimPointerCancel = () => { clearTimeout(dimPressTimer.current); dimPressTimer.current = null }

  const startEdit = (field, pos) => {
    if (data.readOnly) return
    caretPosRef.current = pos ?? null
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

  // Display-mode click: toggles a checkbox if that's what was clicked, otherwise
  // starts editing the field once the node is selected (click-to-edit cycle).
  const handleDisplayClick = (field) => (e) => {
    if (e.target.tagName === 'INPUT' && e.target.type === 'checkbox') {
      if (data.readOnly) { e.preventDefault(); return }
      e.stopPropagation()
      e.target.toggleAttribute('checked')
      const html = e.currentTarget.innerHTML
      if (field === 'title') data.onUpdate?.({ label: html })
      if (field === 'desc') data.onUpdate?.({ description: html })
      return
    }
    if (!selected || editing || justSelected()) return
    startEdit(field, { x: e.clientX, y: e.clientY })
  }

  // Parts list handlers
  const startPartEdit = (part) => {
    if (data.readOnly) return
    if (editingPartId === part.id) return
    setEditingPartId(part.id)
    setPartDraft(part.text ?? '')
  }
  const commitPartEdit = () => {
    if (editingPartId == null) return
    const parts = (data.parts ?? []).map((p) => (p.id === editingPartId ? { ...p, text: partDraft } : p))
    setEditingPartId(null)
    data.onUpdate?.({ parts })
  }
  const cancelPartEdit = () => setEditingPartId(null)

  // Click-to-edit a part row: click 2 while the node is already selected.
  const handlePartClick = (part) => () => {
    if (!selected || editingPartId != null || justSelected()) return
    startPartEdit(part)
  }

  const addPart = () => {
    if (data.readOnly) return
    const newPart = { id: 'pt-' + Date.now().toString(36), text: '새 파츠' }
    data.onUpdate?.({ parts: [...(data.parts ?? []), newPart] })
  }
  const removePart = (partId) => {
    if (data.readOnly) return
    data.onUpdate?.({ parts: (data.parts ?? []).filter((p) => p.id !== partId) })
  }

  const titleValue = data.label ?? ''
  const descValue = data.description || ''

  // In abstract mode, title font sizes get a ×1.15 multiplier (and are centered — see below).
  const titleFontSize = abstract ? Math.round(15 * 1.15) : 15
  const titleLineH = abstract ? Math.round(22 * 1.15) : 22
  const typeFontSize = abstract ? Math.round(10 * 1.9) : 10
  const circleSize = abstract ? Math.round(14 * 1.9) : 14

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
        justifyContent: abstract ? 'center' : undefined,
        background: filled ? color.bg : 'transparent',
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
        isVisible={selected && !data.readOnly}
        minWidth={200}
        minHeight={80}
        color={color.border}
        handleStyle={{
          width: 20, height: 20, background: 'transparent', border: 'none',
          backgroundImage: `radial-gradient(circle, ${color.border} 5px, transparent 5px)`,
          backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
        }}
        lineStyle={{ borderColor: `${color.border}66` }}
      />

      {PORTS.map((p) => (
        <Handle key={p.id} type="source" id={p.id} position={p.position} style={HANDLE_STYLE(color.border)} />
      ))}

      {/* Header — fully hidden in the shape-only tier */}
      {!shapeOnly && (
      <div style={{ padding: '10px 12px 4px', flexShrink: 0 }}>
        {abstract ? (
          /* Abstract mode: circle + title on one horizontal row, label hidden, title centered */
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
            <button
              onClick={cycleColor}
              onPointerDown={onDimPointerDown}
              onPointerUp={onDimPointerUp}
              onPointerLeave={onDimPointerLeave}
              onPointerCancel={onDimPointerCancel}
              title="클릭: 색상 변경 · 길게 누르기: 끄기/켜기"
              style={{
                width: circleSize, height: circleSize, borderRadius: '50%',
                background: color.border, border: 'none', cursor: 'pointer', flexShrink: 0,
              }}
            />
            <div ref={titleContainerRef} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
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
                    color: titleColor, fontSize: titleFontSize, fontWeight: 700,
                    width: '100%', outline: 'none', cursor: 'text', textAlign: 'center',
                    minHeight: titleLineH, lineHeight: `${titleLineH}px`, whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                />
              ) : (
                <div
                  className="rich-content text-hover-line"
                  onClick={handleDisplayClick('title')}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(titleValue || (data.titleTouched ? '' : '단계 이름')) }}
                  style={{
                    color: titleValue ? titleColor : titlePlaceholderColor, fontSize: titleFontSize, fontWeight: 700,
                    cursor: 'text', minHeight: titleLineH, lineHeight: `${titleLineH}px`, textAlign: 'center',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    touchAction: 'manipulation',
                  }}
                />
              )}
            </div>
            {selected && data.canInvite && <InviteButton data={data} id={id} />}
          </div>
        ) : (
          /* Normal mode: unchanged — circle + label row, then title below */
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <button
                onClick={cycleColor}
                onPointerDown={onDimPointerDown}
                onPointerUp={onDimPointerUp}
                onPointerLeave={onDimPointerLeave}
                onPointerCancel={onDimPointerCancel}
                title="클릭: 색상 변경 · 길게 누르기: 끄기/켜기"
                style={{
                  width: circleSize, height: circleSize, borderRadius: '50%',
                  background: color.border, border: 'none', cursor: 'pointer', flexShrink: 0,
                }}
              />
              <span style={{ color: color.border, fontSize: typeFontSize, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                {color.label}
              </span>
            </div>

            {/* Title field */}
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
              <div ref={titleContainerRef} style={{ flex: 1, minWidth: 0, position: 'relative' }}>
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
                      color: titleColor, fontSize: titleFontSize, fontWeight: 700,
                      width: '100%', outline: 'none', marginBottom: 4, cursor: 'text',
                      minHeight: titleLineH, lineHeight: `${titleLineH}px`, whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  />
                ) : (
                  <div
                    className="rich-content text-hover-line"
                    onClick={handleDisplayClick('title')}
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(titleValue || (data.titleTouched ? '' : '단계 이름')) }}
                    style={{
                      color: titleValue ? titleColor : titlePlaceholderColor, fontSize: titleFontSize, fontWeight: 700,
                      marginBottom: 4, cursor: 'text', minHeight: titleLineH, lineHeight: `${titleLineH}px`,
                      whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                      touchAction: 'manipulation',
                    }}
                  />
                )}
              </div>
              {selected && data.canInvite && <InviteButton data={data} id={id} />}
            </div>
          </>
        )}
      </div>
      )}

      {/* Description — only rendered in normal (non-abstract) mode, or when being edited */}
      {(!abstract || editing === 'desc') && (
        <div style={{ flex: 1, padding: '0 12px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div
            ref={descContainerRef}
            style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}
            onMouseMove={handleDescMouseMove}
            onMouseLeave={handleDescMouseLeave}
          >
            {editing === 'desc' ? (
              <div
                ref={descRef}
                contentEditable
                suppressContentEditableWarning
                className="nodrag nowheel rich-content"
                onBlur={() => stopEdit('desc', descRef)}
                style={{
                  flex: 1, background: 'transparent',
                  color: descColor, fontSize: 12, width: '100%',
                  outline: 'none', lineHeight: 1.5, minHeight: 0, cursor: 'text',
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflowY: 'auto',
                  overscrollBehavior: 'contain',
                }}
              />
            ) : (
              <div
                ref={descDisplayRef}
                className="rich-content nowheel"
                onClick={handleDisplayClick('desc')}
                dangerouslySetInnerHTML={{ __html: wrapLines(sanitizeHtml(descValue || (data.descTouched ? '' : '설명'))) }}
                style={{
                  flex: 1, color: descValue ? descColor : descPlaceholderColor, fontSize: 12,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'text',
                  overflowY: 'auto', overscrollBehavior: 'contain', lineHeight: 1.5, minHeight: 0,
                  touchAction: 'manipulation',
                }}
              />
            )}
            {descHover && (
              <div style={{ position: 'absolute', left: -4, right: -4, top: descHover.top, height: descHover.height, borderRadius: 6, background: '#ffffff12', pointerEvents: 'none' }} />
            )}
            {descCaret && (
              <div style={{ position: 'absolute', left: -4, right: -4, top: descCaret.top, height: descCaret.height, borderRadius: 6, background: '#ffffff12', pointerEvents: 'none' }} />
            )}
          </div>
        </div>
      )}

      {/* Parts list — only rendered in normal (non-abstract, non-shape-only) mode, same as description */}
      {!abstract && !shapeOnly && (
        <div style={{ padding: '0 12px 10px', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          {(data.parts ?? []).map((part) => {
            const partColor = part.color || '#8b94a7'
            return (
              <div
                key={part.id}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  margin: '3px -12px 0',
                  padding: '4px 12px',
                  borderLeft: `3px solid ${partColor}`,
                  background: '#00000038',
                  borderRadius: 0,
                }}
                onClick={handlePartClick(part)}
              >
                <Handle
                  type="target"
                  position={Position.Left}
                  id={`p-${part.id}-l`}
                  className="part-socket"
                  style={{ ...PART_SOCKET_STYLE(partColor), left: 0, top: '50%', transform: 'translate(-50%, -50%)' }}
                />

                {editingPartId === part.id ? (
                  <input
                    className="nodrag"
                    autoFocus
                    value={partDraft}
                    onChange={(e) => setPartDraft(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={commitPartEdit}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); commitPartEdit() }
                      if (e.key === 'Escape') { e.preventDefault(); cancelPartEdit() }
                    }}
                    style={{
                      flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none',
                      borderBottom: `1px solid ${partColor}`,
                      color: '#ccc', fontSize: 11, fontFamily: 'inherit', padding: 0, cursor: 'text',
                    }}
                  />
                ) : (
                  <span className="text-hover-line" style={{ flex: 1, minWidth: 0, color: '#ccc', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'text' }}>
                    {part.text}
                  </span>
                )}

                {selected && editingPartId !== part.id && (
                  <button
                    type="button"
                    className="nodrag stage-part-remove"
                    onClick={(e) => { e.stopPropagation(); removePart(part.id) }}
                    title="파츠 삭제"
                  >
                    ✕
                  </button>
                )}

                <Handle
                  type="source"
                  position={Position.Right}
                  id={`p-${part.id}-r`}
                  className="part-socket"
                  style={{ ...PART_SOCKET_STYLE(partColor), right: 0, top: '50%', transform: 'translate(50%, -50%)' }}
                />
              </div>
            )
          })}

          {selected && (
            <div className="stage-part-add" onClick={addPart}>
              ＋ 파츠
            </div>
          )}
        </div>
      )}

      {/* Rich-text toolbar — portalled to body */}
      <EditToolbar
        editRef={editing === 'title' ? titleRef : editing === 'desc' ? descRef : null}
        anchorRef={editing === 'title' ? titleContainerRef : editing === 'desc' ? descContainerRef : null}
      />
    </div>
  )
}

// Owner-only "invite" icon shown next to a selected stage node's title.
function InviteButton({ data, id }) {
  return (
    <button
      type="button"
      className="nodrag"
      onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); data.onInvite?.('node', id, r) }}
      title="공유 초대"
      style={{
        width: 18, height: 18, borderRadius: '50%', border: 'none', flexShrink: 0,
        background: '#ffffff14', color: '#f0f0f0', fontSize: 12, lineHeight: '18px',
        padding: 0, cursor: 'pointer', marginTop: 1,
      }}
    >
      ＋
    </button>
  )
}
