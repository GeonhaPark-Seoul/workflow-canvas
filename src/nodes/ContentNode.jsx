import { useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeResizer, useStore } from '@xyflow/react'
import EditToolbar from '../components/EditToolbar'

// Bidirectional connection ports: every handle is type="source"; with the
// canvas in connectionMode="loose", a source handle can also receive a
// connection, so any port can be both an input and an output.
const HANDLE = {
  width: 45, height: 45, border: 'none',
  background: 'radial-gradient(circle, #8b94a7 7px, #0f0f13 7px 10.5px, transparent 10.5px)',
}
const PORTS = [
  { id: 'left', position: Position.Left },
  { id: 'right', position: Position.Right },
  { id: 'top', position: Position.Top },
  { id: 'bottom', position: Position.Bottom },
]

const KIND_LABEL = {
  photo: '🖼 사진',
  database: '🗄 데이터베이스',
  browser: '🌐 브라우저',
}

// Downscale an image file to a data URL (max dimension 1200px, JPEG quality 0.85).
function downscaleImage(file, maxSize = 1200, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        let { width, height } = img
        if (width > maxSize || height > maxSize) {
          const scale = maxSize / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        canvas.getContext('2d').drawImage(img, 0, 0, width, height)
        resolve(canvas.toDataURL('image/jpeg', quality))
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

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

export default function ContentNode({ data, selected, id }) {
  // Abstract (LOD) mode: re-renders only when crossing the threshold, not every zoom tick.
  const abstract = useStore((s) => s.transform[2] < (data.lodThreshold ?? 0.55))
  // Shape-only (deeper LOD) mode: below this, all text/content disappears — only the colored shape + handles remain.
  // Also forced by the App agent (data.forceShapeOnly) for out-of-region nodes under view-restricted sharing.
  const zoomShapeOnly = useStore((s) => s.transform[2] < (data.lodThreshold ?? 0.55) * 0.45)
  const shapeOnly = zoomShapeOnly || data.forceShapeOnly

  const filled = data.nodeFill !== false

  const [editing, setEditing] = useState(null) // 'header' | null
  const headerRef = useRef(null)
  const longPressTimer = useRef(null)
  const longPressStart = useRef(null)
  const dimPressTimer = useRef(null)
  const headerContainerRef = useRef(null)
  const caretPosRef = useRef(null)
  const fileInputRef = useRef(null)
  const [urlDraft, setUrlDraft] = useState(data.url ?? '')

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
      headerRef.current.innerHTML = data.header ?? ''
      headerRef.current.focus()
      placeCaretAt(headerRef.current, caretPosRef.current)
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setUrlDraft(data.url ?? '')
  }, [data.url])

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

  const startEdit = (field, pos) => { caretPosRef.current = pos ?? null; setEditing(field); data.onEditStart?.() }

  const stopEdit = (field, ref) => {
    if (editing !== field) return
    const html = ref.current?.innerHTML ?? ''
    const patch = { header: data.header }
    if (field === 'header') { patch.header = html; patch.headerTouched = true }
    setEditing(null)
    data.onEditEnd?.()
    data.onUpdate?.(patch)
  }

  const handleDisplayClick = (field) => (e) => {
    if (!selected || editing || justSelected()) return
    startEdit(field, { x: e.clientX, y: e.clientY })
  }

  const onPickFile = () => fileInputRef.current?.click()
  const onFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const src = await downscaleImage(file)
      data.onUpdate?.({ src })
    } finally {
      e.target.value = ''
    }
  }

  const commitUrl = () => {
    const url = urlDraft.trim()
    if (url !== (data.url ?? '')) data.onUpdate?.({ url })
  }

  const headerValue = data.header ?? ''
  const kindLabel = KIND_LABEL[data.kind] ?? '콘텐츠'

  const headerFontSize = abstract ? Math.round(13 * 1.9) : 13
  const circleSize = abstract ? Math.round(14 * 1.9) : 14

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minWidth: 160,
        minHeight: 100,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: abstract ? 'center' : undefined,
        background: filled ? '#20242e' : 'transparent',
        border: `2px solid ${selected ? '#ffffff' : '#8b94a788'}`,
        borderRadius: 12,
        boxShadow: selected
          ? '0 0 0 2px #8b94a744, 0 8px 32px #0008'
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
        minHeight={100}
        color="#8b94a7"
        handleStyle={{
          width: 20, height: 20, background: 'transparent', border: 'none',
          backgroundImage: 'radial-gradient(circle, #8b94a7 5px, transparent 5px)',
          backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
        }}
        lineStyle={{ borderColor: '#8b94a744' }}
      />

      {PORTS.map((p) => (
        <Handle key={p.id} type="source" id={p.id} position={p.position} style={HANDLE} />
      ))}

      {/* Header strip — editable, defaults to the kind label; fully hidden in the shape-only tier */}
      {!shapeOnly && (
      <div
        style={{
          background: filled ? '#8b94a722' : 'transparent',
          borderBottom: abstract ? 'none' : '1px solid #8b94a744',
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
            background: '#8b94a7', border: 'none', cursor: 'pointer', flexShrink: 0,
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
                borderBottom: '1px solid #8b94a7',
                color: '#c7cbd6', fontSize: headerFontSize, fontWeight: 800, letterSpacing: 0.3,
                outline: 'none', minHeight: 18, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                cursor: 'text',
              }}
            />
          ) : (
            <div
              className="rich-content text-hover-line"
              onClick={handleDisplayClick('header')}
              dangerouslySetInnerHTML={{ __html: headerValue || (data.headerTouched ? '' : kindLabel) }}
              style={{
                flex: 1, color: headerValue ? '#c7cbd6' : '#8b94a7',
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

      {/* Body — kind-specific content; only rendered in normal (non-abstract) mode */}
      {!abstract && !shapeOnly && (
        <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {data.kind === 'photo' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 6 }}>
              {data.src ? (
                <>
                  <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', alignItems: 'flex-start', justifyContent: 'center' }}>
                    <img src={data.src} alt="" style={{ maxWidth: '100%', borderRadius: 8 }} />
                  </div>
                  {selected && (
                    <button
                      type="button"
                      className="nodrag"
                      onClick={onPickFile}
                      style={{
                        alignSelf: 'flex-start', background: '#8b94a722', border: '1px solid #8b94a766',
                        color: '#c7cbd6', fontSize: 11, borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                      }}
                    >
                      사진 교체
                    </button>
                  )}
                </>
              ) : (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="nodrag"
                    onClick={onPickFile}
                    style={{
                      background: '#8b94a722', border: '1px solid #8b94a766',
                      color: '#c7cbd6', fontSize: 12, borderRadius: 6, padding: '6px 14px', cursor: 'pointer',
                    }}
                  >
                    사진 선택
                  </button>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileChange}
                style={{ display: 'none' }}
              />
            </div>
          )}

          {data.kind === 'browser' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, gap: 4 }}>
              <input
                className="nodrag"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onBlur={commitUrl}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitUrl() } }}
                placeholder="https://..."
                style={{
                  flexShrink: 0, background: 'transparent', border: '1px solid #8b94a766',
                  borderRadius: 6, color: '#c7cbd6', fontSize: 11, padding: '4px 8px', outline: 'none',
                }}
              />
              <div style={{ flexShrink: 0, fontSize: 9, color: '#8b94a7' }}>
                사이트에 따라 임베드가 차단될 수 있습니다
              </div>
              {data.url && (
                <div className="nodrag nowheel" style={{ flex: 1, minHeight: 0 }}>
                  <iframe
                    src={data.url}
                    title="browser-content"
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    style={{ width: '100%', height: '100%', border: 'none', borderRadius: 8, background: '#fff' }}
                  />
                </div>
              )}
            </div>
          )}

          {data.kind === 'database' && (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
              <div style={{ fontSize: 28 }}>🗄</div>
              <div style={{ color: '#888', fontSize: 12 }}>데이터베이스 (준비 중)</div>
            </div>
          )}
        </div>
      )}

      {/* Rich-text toolbar — portalled to body */}
      <EditToolbar
        editRef={editing === 'header' ? headerRef : null}
        anchorRef={editing === 'header' ? headerContainerRef : null}
      />
    </div>
  )
}
