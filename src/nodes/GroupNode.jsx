import { useState, useRef, useEffect } from 'react'
import { NodeResizer, useStore } from '@xyflow/react'

// Linear interpolation (unclamped) of value from [inMin, inMax] to [outMin, outMax].
function mapRange(value, inMin, inMax, outMin, outMax) {
  const t = (value - inMin) / (inMax - inMin)
  return outMin + t * (outMax - outMin)
}
const clamp = (v, min, max) => Math.min(Math.max(v, min), max)

export default function GroupNode({ data, selected, id }) {
  // The group label scales continuously with zoom (not a discrete LOD tier, unlike the
  // other node types) so it grows smoothly as the canvas zooms out, up to ×4.5.
  const threshold = data.lodThreshold ?? 0.55
  const zoom = useStore((s) => s.transform[2])
  const tabScale = clamp(mapRange(zoom, threshold, threshold * 0.3, 1, 4.5), 1, 4.5)

  const filled = data.nodeFill !== false

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

  const labelFontSize = Math.round(13 * tabScale)
  // Not gated by theme/darkText: the tab always sits on its own fixed dark background
  // (#20242e below, independent of node fill), so the light label color is always correct.
  const labelColor = '#aab'

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minWidth: 240,
        minHeight: 160,
        boxSizing: 'border-box',
        background: filled ? '#ffffff0f' : 'transparent',
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
        handleStyle={{
          width: 20, height: 20, background: 'transparent', border: 'none',
          backgroundImage: 'radial-gradient(circle, #8b94a7 5px, transparent 5px)',
          backgroundRepeat: 'no-repeat', backgroundPosition: 'center',
        }}
        lineStyle={{ borderColor: '#8b94a766' }}
      />

      {/* Title tab — protrudes above the frame's top-left corner like a folder tab.
          Survives every LOD tier (including shape-only) so the group stays identifiable
          however far the canvas is zoomed out — except under a forced (view-restricted)
          shape-only, where the tab is hidden too so only the frame shape remains. */}
      {!data.forceShapeOnly && (
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
              color: labelColor,
              fontSize: labelFontSize,
              fontWeight: 700,
              outline: 'none',
              fontFamily: 'inherit',
              minWidth: 80,
              cursor: 'text',
              transition: 'font-size 0.08s linear',
            }}
          />
        ) : (
          <div
            className="text-hover-line"
            onClick={handleLabelClick}
            style={{ color: labelColor, fontSize: labelFontSize, fontWeight: 700, cursor: 'text', transition: 'font-size 0.08s linear' }}
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
            }}
          >
            ＋
          </button>
        )}
      </div>
      )}
    </div>
  )
}
