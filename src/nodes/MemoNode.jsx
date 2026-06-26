import { useState } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'

export default function MemoNode({ data, selected }) {
  const [text, setText] = useState(data.text || '')

  const handleChange = (e) => {
    setText(e.target.value)
    data.onUpdate?.({ text: e.target.value })
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
        minWidth={140}
        minHeight={80}
        color="#f59e0b"
        handleStyle={{ width: 10, height: 10, borderRadius: 5, border: '2px solid #f59e0b' }}
        lineStyle={{ borderColor: '#f59e0b44' }}
      />

      <Handle type="source" position={Position.Right} style={{ background: '#f59e0b', width: 9, height: 9, border: '2px solid #0f0f13' }} />
      <Handle type="target" position={Position.Left}  style={{ background: '#f59e0b', width: 9, height: 9, border: '2px solid #0f0f13' }} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={{ background: '#f59e0b', width: 9, height: 9, border: '2px solid #0f0f13' }} />
      <Handle type="target" id="top"    position={Position.Top}    style={{ background: '#f59e0b', width: 9, height: 9, border: '2px solid #0f0f13' }} />

      {/* Header strip */}
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
        }}
      >
        <span style={{ fontSize: 12 }}>📝</span>
        <span style={{ color: '#f59e0b', fontSize: 10, fontWeight: 700, letterSpacing: 1 }}>MEMO</span>
      </div>

      {/* Content — fills remaining height */}
      <div style={{ flex: 1, padding: '8px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <textarea
          value={text}
          onChange={handleChange}
          onFocus={() => data.onEditStart?.()}
          onBlur={() => data.onEditEnd?.()}
          placeholder="메모 내용..."
          style={{
            flex: 1,
            background: 'transparent', border: 'none',
            color: '#e8d88a', fontSize: 12, width: '100%',
            resize: 'none', outline: 'none',
            fontFamily: 'inherit', lineHeight: 1.6, minHeight: 0,
          }}
        />
      </div>
    </div>
  )
}
