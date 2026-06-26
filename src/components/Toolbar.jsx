export default function Toolbar({ onAddStage, onAddMemo, onFitView, onClearAll }) {
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
      <ToolBtn
        onClick={onAddStage}
        color="#3b82f6"
        icon="＋"
        label="단계 추가"
      />
      <ToolBtn
        onClick={onAddMemo}
        color="#f59e0b"
        icon="📝"
        label="메모 추가"
      />
      <div style={{ width: 1, background: '#ffffff18', margin: '0 4px' }} />
      <ToolBtn
        onClick={onFitView}
        color="#888"
        icon="⊡"
        label="전체 보기"
      />
      <ToolBtn
        onClick={onClearAll}
        color="#ef4444"
        icon="✕"
        label="전체 삭제"
      />
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
