import { useState, useRef, useEffect } from 'react'
import { NodeResizer, useStore } from '@xyflow/react'

export default function GroupNode({ data, selected, id }) {
  // Abstract (LOD) mode: re-renders only when crossing the threshold, not every zoom tick.
  const abstract = useStore((s) => s.transform[2] < (data.lodThreshold ?? 0.55))
  // Shape-only (deeper LOD) mode: the frame loses everything but its outline — the
  // title tab is the one exception, it must stay legible at every zoom level.
  const shapeOnly = useStore((s) => s.transform[2] < (data.lodThreshold ?? 0.55) * 0.45)

  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(data.label ?? '')
  const inputRef = useRef(null)
  const longPressTimer = useRef(null)
  const longPressStart = useRef(null)

  // Click-to-edit cycle: click 1 selects (React Flow default), click 2 (while already
  // selected) starts editing. React Flow selects on mousedown, so the first click's
  // `click` event already sees selected===true — guard with a timestamp so a fresh
  // selection can't be instantly followed by an edit-start on the same click.
  const selectedAtRef = useRef(0)
  useEffect(() => {
    if (selected) selectedAtRef.current = Date.now()
  }, [selected])

  useEffect(() => {
    if (editing) {
      setValue(data.label ?? '')
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps

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

  const commit = () => {
    setEditing(false)
    if (value.trim()) data.onUpdate?.({ label: value.trim() })
  }

  const startEditing = () => {
    if (data.readOnly) return
    setEditing(true)
  }

  const handleLabelClick = () => {
    if (!selected || Date.now() - selectedAtRef.current < 300) return
    startEditing()
  }

  // Title tab survives all LOD tiers and enlarges further in shape-only (the deepest tier).
  const tabScale = shapeOnly ? 2.4 : abstract ? 1.9 : 1
  const labelFontSize = Math.round(13 * tabScale)

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minWidth: 240,
        minHeight: 160,
        boxSizing: 'border-box',
        background: '#ffffff06',
        border: '1.5px dashed #8b94a766',
        borderRadius: 14,
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={240}
        minHeight={160}
        color="#8b94a7"
        handleStyle={{ width: 10, height: 10, borderRadius: 2, border: '2px solid #8b94a7' }}
        lineStyle={{ borderColor: '#8b94a766' }}
      />

      {/* Title tab — protrudes above the frame's top-left corner like a folder tab.
          Survives every LOD tier (including shape-only) so the group stays identifiable
          however far the canvas is zoomed out. */}
      <div
        style={{
          position: 'absolute',
          top: -34 * tabScale,
          left: 10,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: '#20242e',
          border: '1.5px solid #8b94a7',
          borderBottom: 'none',
          borderRadius: '8px 8px 0 0',
          padding: '4px 14px',
          fontWeight: 700,
        }}
      >
        {editing ? (
          <input
            ref={inputRef}
            className="nodrag nowheel"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') { e.preventDefault(); setEditing(false) }
            }}
            style={{
              background: 'transparent',
              border: 'none',
              borderBottom: '1px solid #8b94a7',
              color: '#aab',
              fontSize: labelFontSize,
              fontWeight: 700,
              outline: 'none',
              fontFamily: 'inherit',
              minWidth: 80,
              cursor: 'text',
            }}
          />
        ) : (
          <div
            className="text-hover-line"
            onClick={handleLabelClick}
            style={{ color: '#aab', fontSize: labelFontSize, fontWeight: 700, cursor: 'text' }}
          >
            {data.label || '새 그룹'}
          </div>
        )}
        {!editing && data.onInvite && (
          <button
            type="button"
            className="nodrag"
            onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); data.onInvite('group', id, r) }}
            title="공유 초대"
            style={{
              width: 18, height: 18, borderRadius: '50%', border: 'none', flexShrink: 0,
              background: '#ffffff14', color: '#aab', fontSize: 12, lineHeight: '18px',
              padding: 0, cursor: 'pointer',
              boxShadow: data.presenceGlow ? '0 0 0 2px #22c55e55, 0 0 10px 2px #22c55e88' : 'none',
              animation: data.presenceGlow ? 'wfcInviteGlow 1.6s ease-in-out infinite' : 'none',
            }}
          >
            ＋
          </button>
        )}
      </div>
      <style>{`@keyframes wfcInviteGlow { 0%,100% { box-shadow: 0 0 0 2px #22c55e55, 0 0 8px 2px #22c55e77; } 50% { box-shadow: 0 0 0 3px #22c55e77, 0 0 16px 6px #22c55eaa; } }`}</style>
    </div>
  )
}
