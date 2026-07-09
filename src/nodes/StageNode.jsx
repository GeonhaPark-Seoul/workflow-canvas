import { useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeResizer, useStore } from '@xyflow/react'
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

// Per-part handles: smaller port dots, colored per-part.
const PART_HANDLE_STYLE = (partColor) => ({
  width: 16, height: 16, border: 'none',
  background: `radial-gradient(circle, ${partColor} 2px, #0f0f13 2px 4px, transparent 4px)`,
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

// Select all content of contentEditable element
function selectAll(el) {
  const range = document.createRange()
  range.selectNodeContents(el)
  const sel = window.getSelection()
  sel.removeAllRanges()
  sel.addRange(range)
}

export default function StageNode({ data, selected, id }) {
  const stageTypes = data.stageTypes ?? DEFAULT_TYPES
  const colorIdx = Math.min(Math.max(data.colorIdx ?? 0, 0), stageTypes.length - 1)
  const color = stageTypes[colorIdx]

  // Abstract (LOD) mode: re-renders only when crossing the threshold, not every zoom tick.
  const abstract = useStore((s) => s.transform[2] < (data.lodThreshold ?? 0.55))

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

  // Parts list: inline text editing per-row (id of the part currently being edited)
  const [editingPartId, setEditingPartId] = useState(null)
  const [partDraft, setPartDraft] = useState('')
  const partLastTapRef = useRef({})

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

  const startEdit = (field) => {
    if (data.readOnly) return
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
      if (data.readOnly) { e.preventDefault(); return }
      e.stopPropagation()
      e.target.toggleAttribute('checked')
      const html = e.currentTarget.innerHTML
      if (field === 'title') data.onUpdate?.({ label: html })
      if (field === 'desc') data.onUpdate?.({ description: html })
    }
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

  // Touch double-tap → edit a part row, mirroring touchEdit() but keyed per-part id.
  const touchEditPart = (part) => (e) => {
    if (editingPartId === part.id) return
    const now = Date.now()
    if (now - (partLastTapRef.current[part.id] || 0) < 300) {
      e.preventDefault()
      partLastTapRef.current[part.id] = 0
      startPartEdit(part)
    } else {
      partLastTapRef.current[part.id] = now
    }
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

  // In abstract mode, font sizes get a ×1.9 multiplier.
  const titleFontSize = abstract ? Math.round(15 * 1.9) : 15
  const titleLineH = abstract ? Math.round(22 * 1.9) : 22
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
        {abstract ? (
          /* Abstract mode: circle + title on one horizontal row, label hidden */
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
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
            <div ref={titleContainerRef} style={{ flex: 1, minWidth: 0 }}>
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
                    color: '#f0f0f0', fontSize: titleFontSize, fontWeight: 700,
                    width: '100%', outline: 'none',
                    minHeight: titleLineH, lineHeight: `${titleLineH}px`, whiteSpace: 'pre-wrap',
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
                    color: titleValue ? '#f0f0f0' : '#ffffff66', fontSize: titleFontSize, fontWeight: 700,
                    cursor: 'text', minHeight: titleLineH, lineHeight: `${titleLineH}px`,
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
              <div ref={titleContainerRef} style={{ flex: 1, minWidth: 0 }}>
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
                      color: '#f0f0f0', fontSize: titleFontSize, fontWeight: 700,
                      width: '100%', outline: 'none', marginBottom: 4,
                      minHeight: titleLineH, lineHeight: `${titleLineH}px`, whiteSpace: 'pre-wrap',
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
                      color: titleValue ? '#f0f0f0' : '#ffffff66', fontSize: titleFontSize, fontWeight: 700,
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

      {/* Description — only rendered in normal (non-abstract) mode, or when being edited */}
      {(!abstract || editing === 'desc') && (
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
                  color: '#aaa', fontSize: 12, width: '100%',
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
                  flex: 1, color: descValue ? '#aaa' : '#888', fontSize: 12,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'text',
                  overflow: 'auto', lineHeight: 1.5, minHeight: 0,
                  touchAction: 'manipulation',
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Parts list — only rendered in normal (non-abstract) mode, same as description */}
      {!abstract && (
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
                  marginTop: 3,
                  padding: '3px 8px',
                  borderLeft: `3px solid ${partColor}`,
                  background: '#ffffff0a',
                  borderRadius: 4,
                }}
                onDoubleClick={() => startPartEdit(part)}
                onTouchStart={touchEditPart(part)}
              >
                <Handle
                  type="source"
                  position={Position.Left}
                  id={`p-${part.id}-l`}
                  style={{ ...PART_HANDLE_STYLE(partColor), left: -13, top: '50%', transform: 'translateY(-50%)' }}
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
                      color: '#ccc', fontSize: 11, fontFamily: 'inherit', padding: 0,
                    }}
                  />
                ) : (
                  <span style={{ flex: 1, minWidth: 0, color: '#ccc', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
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
                  style={{ ...PART_HANDLE_STYLE(partColor), right: -13, top: '50%', transform: 'translateY(-50%)' }}
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
      <style>{`@keyframes wfcInviteGlow { 0%,100% { box-shadow: 0 0 0 2px #22c55e55, 0 0 8px 2px #22c55e77; } 50% { box-shadow: 0 0 0 3px #22c55e77, 0 0 16px 6px #22c55eaa; } }`}</style>
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
        boxShadow: data.presenceGlow ? '0 0 0 2px #22c55e55, 0 0 10px 2px #22c55e88' : 'none',
        animation: data.presenceGlow ? 'wfcInviteGlow 1.6s ease-in-out infinite' : 'none',
      }}
    >
      ＋
    </button>
  )
}
