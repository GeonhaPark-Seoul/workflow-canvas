import { useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'

// Bidirectional connection ports: every handle is type="source"; with the
// canvas in connectionMode="loose", a source handle can also receive a
// connection, so any port can be both an input and an output.
const HANDLE = { background: '#f59e0b', width: 10, height: 10, border: '2px solid #0f0f13' }
const PORTS = [
  { id: 'left', position: Position.Left },
  { id: 'right', position: Position.Right },
  { id: 'top', position: Position.Top },
  { id: 'bottom', position: Position.Bottom },
]

export default function MemoNode({ data, selected }) {
  const [header, setHeader] = useState(data.header ?? '')
  const [text, setText] = useState(data.text || '')
  const [editing, setEditing] = useState(null) // 'header' | 'text' | null
  const headerRef = useRef(null)
  const textRef = useRef(null)

  // Sync external changes (e.g. undo/redo, canvas switch)
  useEffect(() => { setHeader(data.header ?? '') }, [data.header])
  useEffect(() => { setText(data.text || '') }, [data.text])

  useEffect(() => {
    if (editing === 'header' && headerRef.current) { headerRef.current.focus(); headerRef.current.select() }
    if (editing === 'text' && textRef.current) { textRef.current.focus() }
  }, [editing])

  const startEdit = (field) => { setEditing(field); data.onEditStart?.() }
  const stopEdit = () => {
    const patch = { header, text }
    if (editing === 'header') patch.headerTouched = true
    if (editing === 'text') patch.textTouched = true
    setEditing(null)
    data.onEditEnd?.()
    data.onUpdate?.(patch)
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minWidth: 160,
        minHeight: 80,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: '#2a2510',
        border: `2px solid ${selected ? '#ffffff' : '#f59e0b88'}`,
        borderRadius: 12,
        boxShadow: selected
          ? '0 0 0 2px #f59e0b44, 0 8px 32px #0008'
          : '0 4px 16px #0005',
        transition: 'border-color 0.15s, box-shadow 0.15s',
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={80}
        color="#f59e0b"
        handleStyle={{ width: 10, height: 10, borderRadius: 5, border: '2px solid #f59e0b' }}
        lineStyle={{ borderColor: '#f59e0b44' }}
      />

      {PORTS.map((p) => (
        <Handle key={p.id} type="source" id={p.id} position={p.position} style={HANDLE} />
      ))}

      {/* Header strip — editable, blank by default */}
      <div
        style={{
          background: '#f59e0b22',
          borderBottom: '1px solid #f59e0b44',
          padding: '5px 10px',
          borderRadius: '10px 10px 0 0',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          flexShrink: 0,
          minHeight: 26,
        }}
      >
        {editing === 'header' ? (
          <input
            ref={headerRef}
            value={header}
            onChange={(e) => setHeader(e.target.value)}
            onBlur={stopEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') stopEdit(); if (e.key === 'Escape') stopEdit() }}
            placeholder="제목 입력..."
            style={{
              flex: 1, background: 'transparent', border: 'none',
              borderBottom: '1px solid #f59e0b88',
              color: '#f59e0b', fontSize: 13, fontWeight: 800, letterSpacing: 0.3,
              outline: 'none', fontFamily: 'inherit', padding: 0,
            }}
          />
        ) : (
          <span
            onDoubleClick={() => startEdit('header')}
            style={{
              flex: 1, color: header ? '#f59e0b' : '#f59e0b66',
              fontSize: 13, fontWeight: 800, letterSpacing: 0.3, cursor: 'text',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}
          >
            {header || (data.headerTouched ? '' : '제목 (더블클릭)')}
          </span>
        )}
      </div>

      {/* Content — fills remaining height */}
      <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {editing === 'text' ? (
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onBlur={stopEdit}
            placeholder={data.textTouched ? '' : '메모 내용...'}
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: '#e8d88a', fontSize: 12, width: '100%',
              resize: 'none', outline: 'none',
              fontFamily: 'inherit', lineHeight: 1.6, minHeight: 0,
            }}
          />
        ) : (
          <div
            onDoubleClick={() => startEdit('text')}
            style={{
              flex: 1, color: text ? '#e8d88a' : '#e8d88a55', fontSize: 12,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word', cursor: 'text',
              overflow: 'auto', lineHeight: 1.6, minHeight: 0,
            }}
          >
            {text || (data.textTouched ? '' : '메모 내용 (더블클릭하여 편집)')}
          </div>
        )}
      </div>
    </div>
  )
}
