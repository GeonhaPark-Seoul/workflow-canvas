import { useEffect, useRef } from 'react'

// Drag&drop node palette: dragging a card sets `application/wfc-node` JSON
// payload for the canvas to consume on drop. Tap (touch fallback) calls
// onPick directly with the same payload.
const NODE_DEFS = [
  { key: 'stage', nodeType: 'stage', label: '단계 노드', desc: '흐름의 한 단계', border: '#3b82f6', borderStyle: 'solid' },
  { key: 'memo', nodeType: 'memo', label: '메모 노드', desc: '자유 메모', border: '#f59e0b', borderStyle: 'dashed' },
  { key: 'content-photo', nodeType: 'content', contentKind: 'photo', label: '컨텐츠 - 사진', desc: '이미지 첨부', icon: '🖼', border: '#22c55e', borderStyle: 'solid' },
  { key: 'content-database', nodeType: 'content', contentKind: 'database', label: '컨텐츠 - 데이터베이스', desc: '구조화된 데이터', icon: '🗄', border: '#a855f7', borderStyle: 'solid', badge: '준비 중' },
  { key: 'content-browser', nodeType: 'content', contentKind: 'browser', label: '컨텐츠 - 브라우저', desc: '웹 페이지 임베드', icon: '🌐', border: '#06b6d4', borderStyle: 'solid' },
]

const payloadOf = (def) => ({ nodeType: def.nodeType, ...(def.contentKind ? { contentKind: def.contentKind } : {}) })

export default function NodePalette({ onClose, onPick, mobile }) {
  const ref = useRef(null)

  useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose?.() }
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const handleDragStart = (e, def) => {
    e.dataTransfer.setData('application/wfc-node', JSON.stringify(payloadOf(def)))
    e.dataTransfer.effectAllowed = 'copy'
  }

  return (
    <div
      ref={ref}
      onClick={(e) => e.stopPropagation()}
      style={{
        position: mobile ? 'fixed' : 'absolute',
        ...(mobile
          ? { left: 12, right: 12, bottom: 'calc(env(safe-area-inset-bottom, 0px) + 78px)' }
          : { top: '100%', left: 0, marginTop: 8 }),
        width: mobile ? 'auto' : 240,
        background: '#000000f2',
        border: '1px solid #ffffff22',
        borderRadius: 14,
        padding: 12,
        boxShadow: '0 8px 32px #000c',
        zIndex: 20,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ color: '#fff', fontSize: 12, fontWeight: 700, marginBottom: 10 }}>노드 목록</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: mobile ? '50vh' : '60vh', overflowY: 'auto' }}>
        {NODE_DEFS.map((def) => (
          <div
            key={def.key}
            draggable
            onDragStart={(e) => handleDragStart(e, def)}
            onClick={() => onPick?.(payloadOf(def))}
            title={def.desc}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: '#0a0a0a', border: `1px ${def.borderStyle} ${def.border}`,
              borderRadius: 8, padding: '8px 10px', cursor: 'grab',
            }}
          >
            {def.icon && <span style={{ fontSize: 16, flexShrink: 0 }}>{def.icon}</span>}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ color: '#fff', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {def.label}
              </div>
              <div style={{ color: '#ccc', fontSize: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {def.desc}
              </div>
            </div>
            {def.badge && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: '#f59e0b', background: '#f59e0b22',
                border: '1px solid #f59e0b44', borderRadius: 4, padding: '1px 5px', flexShrink: 0,
              }}>
                {def.badge}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
