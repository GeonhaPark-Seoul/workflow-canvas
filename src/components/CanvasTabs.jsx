import { useState, useRef, useEffect } from 'react'

export default function CanvasTabs({ canvases, activeId, onSwitch, onAdd, onRename, onDelete }) {
  const [editingId, setEditingId] = useState(null)
  const [value, setValue] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    if (editingId && inputRef.current) { inputRef.current.focus(); inputRef.current.select() }
  }, [editingId])

  const startRename = (c) => { setEditingId(c.id); setValue(c.name) }
  const commit = () => {
    if (editingId && value.trim()) onRename(editingId, value.trim())
    setEditingId(null)
  }

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        top: 20,
        left: 20,
        zIndex: 10,
        display: 'flex',
        alignItems: 'center',
        gap: 4,
        maxWidth: '38vw',
        overflowX: 'auto',
        background: '#1a1a22',
        border: '1px solid #ffffff18',
        borderRadius: 12,
        padding: '6px 8px',
        boxShadow: '0 4px 24px #000a',
        backdropFilter: 'blur(8px)',
      }}
    >
      {canvases.map((c) => {
        const active = c.id === activeId
        return (
          <div
            key={c.id}
            onClick={() => onSwitch(c.id)}
            onDoubleClick={() => startRename(c)}
            title="클릭: 전환 · 더블클릭: 이름 변경"
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: active ? '#3b82f622' : 'transparent',
              border: `1px solid ${active ? '#3b82f6' : '#ffffff14'}`,
              borderRadius: 8, padding: '5px 10px', cursor: 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
              transition: 'background 0.15s, border-color 0.15s',
            }}
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
                  background: '#2a2a36', border: '1px solid #3b82f6', borderRadius: 4,
                  color: '#f0f0f0', fontSize: 12, padding: '2px 6px', outline: 'none',
                  width: 90, fontFamily: 'inherit',
                }}
              />
            ) : (
              <span style={{ color: active ? '#fff' : '#aaa', fontSize: 12, fontWeight: active ? 700 : 500 }}>
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

      <button
        onClick={onAdd}
        title="새 캔버스"
        style={{
          background: 'transparent', border: '1px dashed #ffffff22', borderRadius: 8,
          color: '#888', fontSize: 12, fontWeight: 600, padding: '5px 10px',
          cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0, fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.borderColor = '#ffffff44' }}
        onMouseLeave={(e) => { e.currentTarget.style.color = '#888'; e.currentTarget.style.borderColor = '#ffffff22' }}
      >
        + 새 캔버스
      </button>
    </div>
  )
}
