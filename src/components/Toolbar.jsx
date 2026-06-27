import { useState, useEffect, useRef } from 'react'

export default function Toolbar({
  onAddStage, onAddMemo, onClearAll, mobile,
  views = [], currentViewId, onSelectView, onRenameView, onDeleteView,
}) {
  const viewProps = { views, currentViewId, onSelectView, onRenameView, onDeleteView, mobile }

  if (mobile) {
    return (
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          display: 'flex',
          justifyContent: 'space-around',
          alignItems: 'center',
          background: '#1a1a22ee',
          borderTop: '1px solid #ffffff18',
          borderRadius: '16px 16px 0 0',
          padding: '10px 8px',
          paddingBottom: 'calc(10px + env(safe-area-inset-bottom, 0px))',
          backdropFilter: 'blur(12px)',
          boxShadow: '0 -4px 24px #000a',
        }}
      >
        <MobileBtn onClick={onAddStage} color="#3b82f6" icon="＋" label="단계" />
        <MobileBtn onClick={onAddMemo} color="#f59e0b" icon="✎" label="메모" />
        <ViewSelector {...viewProps} />
        <MobileBtn onClick={onClearAll} color="#ef4444" icon="✕" label="전체삭제" />
      </div>
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: 20,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 10,
        display: 'flex',
        gap: 8,
        background: '#1a1a22',
        border: '1px solid #ffffff18',
        borderRadius: 12,
        padding: '8px 12px',
        boxShadow: '0 4px 24px #000a',
        backdropFilter: 'blur(8px)',
      }}
    >
      <ToolBtn onClick={onAddStage} color="#3b82f6" icon="＋" label="단계 추가" />
      <ToolBtn onClick={onAddMemo} color="#f59e0b" icon="📝" label="메모 추가" />
      <div style={{ width: 1, background: '#ffffff18', margin: '0 4px' }} />
      <ViewSelector {...viewProps} />
      <ToolBtn onClick={onClearAll} color="#ef4444" icon="✕" label="전체 삭제" />
    </div>
  )
}

// ── View selector ────────────────────────────────────────────────────────────
// Left icon toggles the saved-view list; the label shows the current view
// (or "전체 보기" for fit-all). Picking a view applies it and updates the label.
function ViewSelector({ views, currentViewId, onSelectView, onRenameView, onDeleteView, mobile }) {
  const [open, setOpen] = useState(false)
  const [renameId, setRenameId] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const ref = useRef(null)
  const COLOR = '#06b6d4'

  const current = views.find((v) => v.id === currentViewId)
  const label = current ? current.name : '전체 보기'

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setRenameId(null) } }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('touchstart', onDoc)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('touchstart', onDoc) }
  }, [open])

  const pick = (id) => { onSelectView(id); setOpen(false); setRenameId(null) }
  const commitRename = (id) => { onRenameView(id, renameValue); setRenameId(null) }

  const dropdown = (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        [mobile ? 'bottom' : 'top']: mobile ? 56 : 44,
        left: '50%',
        transform: 'translateX(-50%)',
        minWidth: 200,
        maxHeight: '50vh',
        overflowY: 'auto',
        background: '#1e1e2a',
        border: '1px solid #ffffff22',
        borderRadius: 10,
        padding: 6,
        boxShadow: '0 8px 32px #000c',
        zIndex: 50,
      }}
    >
      <button onClick={() => pick(null)} style={rowBtn(currentViewId == null)}>
        <span style={{ fontSize: 11 }}>▦</span>
        <span>전체 보기 (모든 노드)</span>
      </button>

      {views.length > 0 && <div style={{ height: 1, background: '#ffffff18', margin: '4px 2px' }} />}
      {views.length === 0 && (
        <div style={{ padding: '6px 12px', color: '#555', fontSize: 11 }}>저장된 뷰 없음</div>
      )}

      {views.map((v) => (
        <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '1px 2px' }}>
          {renameId === v.id ? (
            <input
              autoFocus
              value={renameValue}
              placeholder="뷰 이름"
              onFocus={(e) => e.target.select()}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={() => commitRename(v.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename(v.id)
                if (e.key === 'Escape') setRenameId(null)
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                flex: 1, background: '#2a2a36', border: `1px solid ${COLOR}`,
                borderRadius: 4, color: '#f0f0f0', fontSize: 12,
                padding: '4px 8px', outline: 'none', fontFamily: 'inherit',
              }}
            />
          ) : (
            <>
              <button onClick={() => pick(v.id)} style={rowBtn(currentViewId === v.id)}>
                <span style={{ fontSize: 11 }}>⊡</span>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.name}</span>
              </button>
              <SmallIcon title="이름 변경" hoverColor="#aaa"
                onClick={(e) => { e.stopPropagation(); setRenameId(v.id); setRenameValue(v.name) }}>✎</SmallIcon>
              <SmallIcon title="삭제" hoverColor="#ef4444"
                onClick={(e) => { e.stopPropagation(); onDeleteView(v.id) }}>✕</SmallIcon>
            </>
          )}
        </div>
      ))}
    </div>
  )

  // Mobile: column button matching the other bottom-bar items
  if (mobile) {
    return (
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen((o) => !o)}
          style={{
            background: 'transparent', border: 'none', color: COLOR,
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            padding: '4px 16px', cursor: 'pointer', fontFamily: 'inherit', minWidth: 56,
          }}
        >
          <span style={{ fontSize: 22 }}>⊡</span>
          <span style={{
            fontSize: 10, fontWeight: 600, color: '#aaa',
            maxWidth: 60, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{label}</span>
        </button>
        {open && dropdown}
      </div>
    )
  }

  // Desktop: split pill — left icon toggles list, label re-applies current view
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center',
          border: `1px solid ${COLOR}44`, borderRadius: 8, overflow: 'hidden',
        }}
      >
        <button
          onClick={() => setOpen((o) => !o)}
          title="저장된 뷰"
          style={{
            background: open ? `${COLOR}22` : 'transparent', border: 'none',
            borderRight: `1px solid ${COLOR}33`, color: COLOR,
            fontSize: 13, padding: '6px 8px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 3, fontFamily: 'inherit',
          }}
        >
          <span style={{ fontSize: 14 }}>⊡</span>
          <span style={{ fontSize: 10 }}>{open ? '▴' : '▾'}</span>
        </button>
        <button
          onClick={() => onSelectView(currentViewId ?? null)}
          title="현재 뷰로 이동"
          style={{
            background: 'transparent', border: 'none', color: COLOR,
            fontSize: 12, fontWeight: 600, padding: '6px 12px', cursor: 'pointer',
            whiteSpace: 'nowrap', fontFamily: 'inherit', maxWidth: 160,
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {label}
        </button>
      </div>
      {open && dropdown}
    </div>
  )
}

function rowBtn(active) {
  return {
    flex: 1, display: 'flex', alignItems: 'center', gap: 8,
    background: active ? '#06b6d422' : 'transparent', border: 'none', borderRadius: 6,
    padding: '6px 8px', color: active ? '#06b6d4' : '#ccc', fontSize: 12, cursor: 'pointer',
    textAlign: 'left', fontFamily: 'inherit', width: '100%',
  }
}

function SmallIcon({ onClick, title, hoverColor, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'transparent', border: 'none', color: '#555',
        cursor: 'pointer', padding: '2px 5px', borderRadius: 3,
        fontSize: 12, lineHeight: 1, flexShrink: 0,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = hoverColor)}
      onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
    >
      {children}
    </button>
  )
}

function ToolBtn({ onClick, color, icon, label }) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        background: 'transparent',
        border: `1px solid ${color}44`,
        borderRadius: 8,
        color,
        fontSize: 13,
        fontWeight: 600,
        padding: '6px 12px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        transition: 'background 0.15s, border-color 0.15s',
        whiteSpace: 'nowrap',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = `${color}18`
        e.currentTarget.style.borderColor = color
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'transparent'
        e.currentTarget.style.borderColor = `${color}44`
      }}
    >
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 12 }}>{label}</span>
    </button>
  )
}

function MobileBtn({ onClick, color, icon, label }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'transparent',
        border: 'none',
        color,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 3,
        padding: '4px 16px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        minWidth: 56,
      }}
    >
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 600, color: '#aaa' }}>{label}</span>
    </button>
  )
}
