import { useState, useRef, useEffect } from 'react'

export default function CanvasTabs({ canvases, activeId, onSwitch, onAdd, onRename, onDelete, mobile }) {
  const [open, setOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [value, setValue] = useState('')
  const inputRef = useRef(null)
  const containerRef = useRef(null)

  useEffect(() => {
    if (editingId && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
  }, [editingId])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
        setEditingId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler) }
  }, [open])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (e.key === 'Escape') { setOpen(false); setEditingId(null) } }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open])

  const startRename = (c, e) => { e.stopPropagation(); setEditingId(c.id); setValue(c.name) }
  const commit = () => {
    if (editingId && value.trim()) onRename(editingId, value.trim())
    setEditingId(null)
  }

  const activeCanvas = canvases.find((c) => c.id === activeId) ?? canvases[0]

  return (
    <div
      ref={containerRef}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        top: mobile ? 0 : 20,
        left: mobile ? 0 : 20,
        right: mobile ? 0 : 'auto',
        zIndex: 10,
      }}
    >
      {/* Collapsed trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: mobile ? '100%' : 'auto',
          background: '#1a1a22',
          border: '1px solid #ffffff18',
          borderRadius: mobile ? (open ? '0 0 0 0' : '0 0 12px 12px') : (open ? '12px 12px 0 0' : 12),
          padding: mobile ? 'calc(env(safe-area-inset-top, 0px) + 6px) 12px 6px' : '6px 12px',
          boxShadow: open ? 'none' : '0 4px 24px #000a',
          backdropFilter: 'blur(8px)',
          color: '#f0f0f0',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: 'inherit',
          whiteSpace: 'nowrap',
          transition: 'border-radius 0.1s',
          boxSizing: 'border-box',
        }}
      >
        <span style={{ flex: 1, textAlign: 'left' }}>{activeCanvas?.name ?? '캔버스'}</span>
        <span style={{ color: '#888', fontSize: 11, flexShrink: 0 }}>▾</span>
      </button>

      {/* Expanded dropdown panel */}
      {open && (
        <div
          style={{
            position: mobile ? 'relative' : 'absolute',
            top: mobile ? 0 : '100%',
            left: 0,
            right: mobile ? 0 : 'auto',
            minWidth: mobile ? '100%' : 220,
            maxHeight: '60vh',
            overflowY: 'auto',
            background: '#1a1a22',
            border: '1px solid #ffffff18',
            borderTop: mobile ? '1px solid #ffffff18' : 'none',
            borderRadius: mobile ? '0 0 12px 12px' : '0 12px 12px 12px',
            boxShadow: '0 8px 32px #000c',
            backdropFilter: 'blur(8px)',
            zIndex: 11,
          }}
        >
          {canvases.map((c) => {
            const active = c.id === activeId
            return (
              <div
                key={c.id}
                onClick={() => { if (editingId !== c.id) { onSwitch(c.id); setOpen(false); setEditingId(null) } }}
                onDoubleClick={(e) => startRename(c, e)}
                title="클릭: 전환 · 더블클릭: 이름 변경"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '7px 12px',
                  cursor: editingId === c.id ? 'default' : 'pointer',
                  background: active ? '#3b82f622' : 'transparent',
                  borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#ffffff0a' }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
              >
                {editingId === c.id ? (
                  <input
                    ref={inputRef}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={commit}
                    onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditingId(null) }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      flex: 1,
                      background: '#2a2a36', border: '1px solid #3b82f6', borderRadius: 4,
                      color: '#f0f0f0', fontSize: 12, padding: '2px 6px', outline: 'none',
                      fontFamily: 'inherit',
                    }}
                  />
                ) : (
                  <span style={{ flex: 1, color: active ? '#fff' : '#aaa', fontSize: 13, fontWeight: active ? 700 : 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.name}
                  </span>
                )}

                {canvases.length > 1 && editingId !== c.id && (
                  <button
                    onClick={(e) => { e.stopPropagation(); if (window.confirm(`"${c.name}" 캔버스를 삭제할까요?`)) onDelete(c.id) }}
                    title="삭제"
                    style={{
                      background: 'transparent', border: 'none', color: '#555',
                      cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, flexShrink: 0,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#ef4444')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
                  >
                    ✕
                  </button>
                )}
              </div>
            )
          })}

          {/* Add canvas row */}
          <div
            onClick={() => { onAdd(); setOpen(false) }}
            style={{
              padding: '7px 12px',
              borderTop: '1px solid #ffffff10',
              color: '#888',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'color 0.1s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#fff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#888')}
          >
            + 새 캔버스
          </div>
        </div>
      )}
    </div>
  )
}
