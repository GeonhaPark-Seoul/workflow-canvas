export default function Toolbar({ onAddStage, onAddMemo, onFitView, onClearAll, mobile }) {
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
        <MobileBtn onClick={onFitView} color="#06b6d4" icon="⊡" label="전체보기" />
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
      <ToolBtn onClick={onFitView} color="#06b6d4" icon="⊡" label="전체 보기" />
      <ToolBtn onClick={onClearAll} color="#ef4444" icon="✕" label="전체 삭제" />
    </div>
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
