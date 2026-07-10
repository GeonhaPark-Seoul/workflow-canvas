import { useState, useRef, useEffect } from 'react'
import { Avatar } from './AuthPanel'

export default function CanvasTabs({
  canvases, activeId, onSwitch, onAdd, onRename, onDelete, mobile,
  sharedCanvases = [], onInvite, presenceGlow,
  participants = [], sharedOutIds = new Set(),
}) {
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

  const activeCanvas = canvases.find((c) => c.id === activeId) ?? sharedCanvases.find((c) => c.id === activeId) ?? canvases[0]
  const isOwnActive = canvases.some((c) => c.id === activeId)

  // Own canvases the owner has shared out (any active canvas_shares row)
  // move into the "공유 캔버스" section alongside canvases shared TO me.
  const ownRegular = canvases.filter((c) => !sharedOutIds.has(c.id))
  const ownShared = canvases.filter((c) => sharedOutIds.has(c.id))

  const renderOwnRow = (c, { shared }) => {
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
          <>
            {shared && <span style={{ fontSize: 11, color: '#888', flexShrink: 0 }} title="공유 중">⤴</span>}
            <span style={{ flex: 1, color: active ? '#fff' : '#aaa', fontSize: 13, fontWeight: active ? 700 : 500, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {c.name}
            </span>
          </>
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
  }

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
        {participants.length > 0 && (
          <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            {participants.slice(0, 5).map((p, i) => (
              <span
                key={p.userId ?? p.email ?? i}
                title={p.isOwner ? '소유자' : (p.userId ? (p.profile?.nickname || undefined) : p.email)}
                style={{ marginLeft: i === 0 ? 0 : -6, display: 'inline-block', lineHeight: 0 }}
              >
                <Avatar
                  profile={p.profile ?? (p.email ? { glyph: p.email[0]?.toUpperCase() } : null)}
                  size={18}
                  online={p.online}
                />
              </span>
            ))}
            {participants.length > 5 && (
              <span
                style={{
                  marginLeft: -6, width: 18, height: 18, borderRadius: '50%',
                  background: '#2a2a36', border: '2px solid #ffffff33', boxSizing: 'border-box',
                  color: '#aaa', fontSize: 9, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                +{participants.length - 5}
              </span>
            )}
          </span>
        )}
        {isOwnActive && onInvite && (
          <span
            onClick={(e) => { e.stopPropagation(); const r = e.currentTarget.getBoundingClientRect(); onInvite('canvas', null, r) }}
            title="공유 초대"
            style={{
              width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: '#ffffff14', color: '#ccc', fontSize: 12, cursor: 'pointer',
              boxShadow: presenceGlow ? '0 0 0 2px #22c55e55, 0 0 10px 2px #22c55e88' : 'none',
              animation: presenceGlow ? 'wfcInviteGlow 1.6s ease-in-out infinite' : 'none',
            }}
          >
            ＋
          </span>
        )}
        <span style={{ color: '#888', fontSize: 11, flexShrink: 0 }}>▾</span>
      </button>
      <style>{`@keyframes wfcInviteGlow { 0%,100% { box-shadow: 0 0 0 2px #22c55e55, 0 0 8px 2px #22c55e77; } 50% { box-shadow: 0 0 0 3px #22c55e77, 0 0 16px 6px #22c55eaa; } }`}</style>

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
          {ownRegular.map((c) => renderOwnRow(c, { shared: false }))}

          {/* Shared canvases: mine shared out + canvases shared to me */}
          {(ownShared.length > 0 || sharedCanvases.length > 0) && (
            <>
              <div style={{ padding: '6px 12px 4px', borderTop: '1px solid #ffffff10', color: '#666', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>
                공유 캔버스
              </div>
              {ownShared.map((c) => renderOwnRow(c, { shared: true }))}
              {sharedCanvases.map((c) => {
                const active = c.id === activeId
                return (
                  <div
                    key={c.id}
                    onClick={() => { onSwitch(c.id); setOpen(false) }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '7px 12px',
                      cursor: 'pointer',
                      background: active ? '#3b82f622' : 'transparent',
                      borderLeft: active ? '2px solid #3b82f6' : '2px solid transparent',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = '#ffffff0a' }}
                    onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ fontSize: 12, flexShrink: 0 }}>🤝</span>
                    <span style={{
                      flex: 1, color: active ? '#fff' : '#aaa', fontSize: 13, fontWeight: active ? 700 : 500,
                      minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {c.name}
                    </span>
                  </div>
                )
              })}
            </>
          )}

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
