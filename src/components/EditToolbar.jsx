import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'

// ─── Layout detection ────────────────────────────────────────────────────────

function getLayout() {
  const mobile = window.innerWidth < 768
  const coarse = window.matchMedia('(pointer: coarse)').matches
  if (mobile) return 'mobile'
  if (coarse) return 'tablet'
  return 'desktop'
}

// ─── Image helpers ────────────────────────────────────────────────────────────

function downscaleAndInsert(file) {
  const reader = new FileReader()
  reader.onload = (ev) => {
    const img = new Image()
    img.onload = () => {
      const MAX = 800
      let { width: w, height: h } = img
      if (w > MAX || h > MAX) {
        const ratio = Math.min(MAX / w, MAX / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      canvas.getContext('2d').drawImage(img, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
      document.execCommand('insertHTML', false,
        `<img src="${dataUrl}" style="max-width:100%;border-radius:6px">`)
    }
    img.src = ev.target.result
  }
  reader.readAsDataURL(file)
}

// ─── Toolbar button styles ────────────────────────────────────────────────────

function btnStyle(layout, active) {
  const size = layout === 'desktop' ? 30 : 44
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: size, height: size, minWidth: size, flexShrink: 0,
    background: active ? '#3b82f644' : 'transparent',
    border: 'none',
    borderRadius: 6,
    color: active ? '#93c5fd' : '#c8c8d4',
    fontSize: layout === 'desktop' ? 13 : 16,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
    transition: 'background 0.1s, color 0.1s',
  }
}

function Divider() {
  return <div style={{ width: 1, alignSelf: 'stretch', background: '#3a3a50', margin: '4px 2px', flexShrink: 0 }} />
}

// ─── Sub-panels (dropdowns / popovers) ────────────────────────────────────────

function DropPanel({ style, children, onPointerDown }) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        position: 'fixed', zIndex: 1300,
        background: '#1e1e2a',
        border: '1px solid #3a3a50',
        borderRadius: 8,
        boxShadow: '0 8px 32px #0009',
        padding: 4,
        display: 'flex', flexDirection: 'column', gap: 2,
        ...style,
      }}
    >
      {children}
    </div>
  )
}

function DropItem({ label, onPointerDown }) {
  return (
    <div
      onPointerDown={onPointerDown}
      style={{
        padding: '6px 14px', borderRadius: 5, cursor: 'pointer',
        color: '#d8d8e8', fontSize: 13, whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = '#2e2e44' }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent' }}
    >
      {label}
    </div>
  )
}

// ─── Individual toolbar sections ──────────────────────────────────────────────

function BlockDropdown({ layout }) {
  const [open, setOpen] = useState(false)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const anchorRef = useRef(null)

  const toggle = (e) => {
    e.preventDefault()
    if (!open && anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect()
      setPanelPos({ top: r.bottom + 4, left: r.left })
    }
    setOpen((v) => !v)
  }

  const insert = (e, html) => {
    e.preventDefault()
    document.execCommand('insertHTML', false, html)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={anchorRef}
        onPointerDown={toggle}
        title="블록 형식"
        style={btnStyle(layout, open)}
      >
        ＋
      </button>
      {open && createPortal(
        <DropPanel
          style={{ top: panelPos.top, left: panelPos.left }}
          onPointerDown={(e) => e.preventDefault()}
        >
          <DropItem label="✓ 체크리스트" onPointerDown={(e) =>
            insert(e, '<div class="cl-item"><input type="checkbox">&nbsp;항목</div>')} />
          <DropItem label="▶ 토글" onPointerDown={(e) =>
            insert(e, '<details><summary>제목</summary><div>내용</div></details><br>')} />
          <DropItem label="• 글머리 목록" onPointerDown={(e) => {
            e.preventDefault()
            document.execCommand('insertUnorderedList')
            setOpen(false)
          }} />
        </DropPanel>,
        document.body
      )}
    </>
  )
}

const FONT_SIZES = [
  { label: '매우 큰', size: 6 },
  { label: '큰', size: 5 },
  { label: '중간', size: 3 },
  { label: '작은', size: 2 },
]

function FontSizeDropdown({ layout }) {
  const [open, setOpen] = useState(false)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const anchorRef = useRef(null)

  const toggle = (e) => {
    e.preventDefault()
    if (!open && anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect()
      setPanelPos({ top: r.bottom + 4, left: r.left })
    }
    setOpen((v) => !v)
  }

  const apply = (e, size) => {
    e.preventDefault()
    document.execCommand('fontSize', false, size)
    setOpen(false)
  }

  return (
    <>
      <button
        ref={anchorRef}
        onPointerDown={toggle}
        title="글씨 크기"
        style={btnStyle(layout, open)}
      >
        <span style={{ fontSize: layout === 'desktop' ? 11 : 13 }}>T▾</span>
      </button>
      {open && createPortal(
        <DropPanel
          style={{ top: panelPos.top, left: panelPos.left }}
          onPointerDown={(e) => e.preventDefault()}
        >
          {FONT_SIZES.map(({ label, size }) => (
            <DropItem key={size} label={label} onPointerDown={(e) => apply(e, size)} />
          ))}
        </DropPanel>,
        document.body
      )}
    </>
  )
}

const COLOR_SWATCHES = ['#f0f0f0', '#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899', '#94a3b8']

function ColorPicker({ layout }) {
  const [open, setOpen] = useState(false)
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const anchorRef = useRef(null)

  const toggle = (e) => {
    e.preventDefault()
    if (!open && anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect()
      setPanelPos({ top: r.bottom + 4, left: r.left })
    }
    setOpen((v) => !v)
  }

  const applyColor = (e, color) => {
    e.preventDefault()
    document.execCommand('styleWithCSS', false, true)
    document.execCommand('foreColor', false, color)
    setOpen(false)
  }

  const swatchSize = layout === 'desktop' ? 22 : 30

  return (
    <>
      <button
        ref={anchorRef}
        onPointerDown={toggle}
        title="글씨 색"
        style={btnStyle(layout, open)}
      >
        <span style={{ fontSize: layout === 'desktop' ? 13 : 16, color: '#ef4444' }}>A</span>
      </button>
      {open && createPortal(
        <DropPanel
          style={{
            top: panelPos.top, left: panelPos.left,
            flexDirection: 'row', flexWrap: 'wrap',
            width: swatchSize * 4 + 8 + 10, padding: 6, gap: 4,
          }}
          onPointerDown={(e) => e.preventDefault()}
        >
          {COLOR_SWATCHES.map((c) => (
            <div
              key={c}
              onPointerDown={(e) => applyColor(e, c)}
              title={c}
              style={{
                width: swatchSize, height: swatchSize,
                borderRadius: 4, background: c,
                cursor: 'pointer', flexShrink: 0,
                border: '2px solid #ffffff22',
              }}
            />
          ))}
        </DropPanel>,
        document.body
      )}
    </>
  )
}

function AlignButtons({ layout }) {
  const btn = (cmd, icon, title) => (
    <button
      key={cmd}
      onPointerDown={(e) => { e.preventDefault(); document.execCommand(cmd) }}
      title={title}
      style={btnStyle(layout, false)}
    >
      {icon}
    </button>
  )
  return (
    <>
      {btn('justifyLeft', '≡', '왼쪽 정렬')}
      {btn('justifyCenter', '☰', '가운데 정렬')}
      {btn('justifyRight', '≡', '오른쪽 정렬')}
    </>
  )
}

// ─── Main toolbar ─────────────────────────────────────────────────────────────
//
// Props:
//   editRef   — React ref object pointing at the contentEditable being edited
//               (the ref itself, not .current). Pass null/undefined when not editing.
//   anchorRef — React ref object pointing at the element to anchor the toolbar
//               above (typically the container div of the editable field).
//
// The toolbar portal-renders into document.body, avoiding React Flow's viewport
// transform clipping.

export default function EditToolbar({ editRef, anchorRef }) {
  const [layout, setLayout] = useState(getLayout)
  const [visible, setVisible] = useState(false)
  const [pos, setPos] = useState(null)      // { top, left, width } for desktop/tablet
  const [kbOffset, setKbOffset] = useState(0) // pixels above on-screen keyboard
  const fileInputRef = useRef(null)

  // Layout listener
  useEffect(() => {
    const handler = () => setLayout(getLayout())
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Enable styleWithCSS once on mount
  useEffect(() => {
    try { document.execCommand('styleWithCSS', false, true) } catch (_) {}
  }, [])

  // Position toolbar above the anchor element (desktop / tablet)
  const reposition = useCallback(() => {
    const anchor = anchorRef?.current
    if (!anchor || layout === 'mobile') return
    const r = anchor.getBoundingClientRect()
    const BAR_H = layout === 'desktop' ? 44 : 56
    const GAP = 6
    const barW = Math.min(480, window.innerWidth - 16)
    let left = r.left
    let top = r.top - BAR_H - GAP
    // If not enough room above, flip below
    if (top < 8) top = r.bottom + GAP
    if (left + barW > window.innerWidth - 8) left = window.innerWidth - 8 - barW
    if (left < 8) left = 8
    // Bail out when unchanged — this runs from a deps-less layout effect, so a
    // fresh object every render would loop setPos → render → setPos forever.
    setPos((p) => (p && p.top === top && p.left === left && p.width === barW) ? p : { top, left, width: barW })
  }, [anchorRef, layout])

  // Show / hide based on whether editRef is provided and populated
  useLayoutEffect(() => {
    if (editRef?.current) {
      setVisible(true)
      reposition()
    } else {
      setVisible(false)
    }
  }) // run every render so ref.current changes are caught

  useEffect(() => {
    if (!visible) return
    window.addEventListener('resize', reposition)
    return () => window.removeEventListener('resize', reposition)
  }, [visible, reposition])

  // Mobile: track visual viewport (on-screen keyboard)
  useEffect(() => {
    if (layout !== 'mobile' || !window.visualViewport) return
    const vv = window.visualViewport
    const handler = () => {
      const offset = window.innerHeight - vv.height - vv.offsetTop
      setKbOffset(Math.max(0, offset))
    }
    vv.addEventListener('resize', handler)
    vv.addEventListener('scroll', handler)
    handler()
    return () => { vv.removeEventListener('resize', handler); vv.removeEventListener('scroll', handler) }
  }, [layout])

  if (!visible) return null

  // ── Container style by layout ──────────────────────────────────────────────
  let containerStyle
  if (layout === 'mobile') {
    containerStyle = {
      position: 'fixed',
      bottom: kbOffset,
      left: 0,
      right: 0,
      zIndex: 1200,
      background: '#1a1a22',
      borderTop: '1px solid #3a3a50',
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      overflowX: 'auto',
      flexWrap: 'nowrap',
      gap: 2,
      padding: `6px 10px calc(6px + var(--safe-bottom))`,
      boxShadow: '0 -4px 20px #0008',
    }
  } else {
    containerStyle = {
      position: 'fixed',
      top: pos?.top ?? -200,
      left: pos?.left ?? 0,
      width: pos?.width ?? 400,
      zIndex: 1200,
      background: '#1a1a22',
      border: '1px solid #3a3a50',
      borderRadius: 10,
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'nowrap',
      gap: 2,
      padding: '4px 8px',
      boxShadow: '0 8px 32px #0009',
    }
  }

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (file) downscaleAndInsert(file)
    e.target.value = ''
  }

  return createPortal(
    <div
      style={containerStyle}
      // Prevent toolbar from stealing focus/selection
      onPointerDown={(e) => e.preventDefault()}
    >
      {/* ＋ 블록 형식 */}
      <BlockDropdown layout={layout} />

      <Divider />

      {/* 글씨 크기 */}
      <FontSizeDropdown layout={layout} />

      <Divider />

      {/* B 볼드 */}
      <button
        onPointerDown={(e) => { e.preventDefault(); document.execCommand('bold') }}
        title="볼드 (B)"
        style={{ ...btnStyle(layout, false), fontWeight: 800 }}
      >
        B
      </button>

      {/* 글씨 색 */}
      <ColorPicker layout={layout} />

      {/* S̶ 줄긋기 */}
      <button
        onPointerDown={(e) => { e.preventDefault(); document.execCommand('strikeThrough') }}
        title="줄긋기 (S̶)"
        style={{ ...btnStyle(layout, false), textDecoration: 'line-through' }}
      >
        S
      </button>

      <Divider />

      {/* 정렬 */}
      <AlignButtons layout={layout} />

      <Divider />

      {/* 🖼 사진 */}
      <button
        onPointerDown={(e) => { e.preventDefault(); fileInputRef.current?.click() }}
        title="사진 삽입"
        style={btnStyle(layout, false)}
      >
        🖼
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>,
    document.body
  )
}
