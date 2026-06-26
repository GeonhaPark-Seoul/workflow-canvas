import { useState, useRef, useEffect } from 'react'
import { Handle, Position, NodeResizer } from '@xyflow/react'

const DEFAULT_TYPES = [
  { bg: '#1e3a5f', border: '#3b82f6', label: '기획' },
  { bg: '#1a3a2a', border: '#22c55e', label: '개발' },
  { bg: '#3a1a1a', border: '#ef4444', label: '검토' },
  { bg: '#2d2a1a', border: '#f59e0b', label: '배포' },
  { bg: '#2a1a3a', border: '#a855f7', label: '완료' },
]

const HANDLE_STYLE = (borderColor) => ({
  width: 10, height: 10, border: `2px solid #0f0f13`, background: borderColor,
})

export default function StageNode({ data, selected }) {
  const stageTypes = data.stageTypes ?? DEFAULT_TYPES
  const colorIdx = Math.min(Math.max(data.colorIdx ?? 0, 0), stageTypes.length - 1)
  const color = stageTypes[colorIdx]

  const [isEditing, setIsEditing] = useState(false)
  const [title, setTitle] = useState(data.label || '새 단계')
  const [description, setDescription] = useState(data.description || '')
  const inputRef = useRef(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  // Sync external label changes (e.g. from undo/redo)
  useEffect(() => { setTitle(data.label || '새 단계') }, [data.label])
  useEffect(() => { setDescription(data.description || '') }, [data.description])

  const cycleColor = (e) => {
    e.stopPropagation()
    const next = (colorIdx + 1) % stageTypes.length
    data.onUpdate?.({ colorIdx: next })
  }

  const handleTitleDoubleClick = () => {
    setIsEditing(true)
    data.onEditStart?.()
  }

  const handleTitleBlur = () => {
    setIsEditing(false)
    data.onEditEnd?.()
    data.onUpdate?.({ label: title, description })
  }

  const handleDescChange = (e) => {
    setDescription(e.target.value)
    data.onUpdate?.({ label: title, description: e.target.value })
  }

  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        minWidth: 200,
        minHeight: 80,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        background: color.bg,
        border: `2px solid ${selected ? '#ffffff' : color.border}`,
        borderRadius: 0,
        boxShadow: selected
          ? `0 0 0 2px ${color.border}55, 0 8px 32px #0008`
          : '0 4px 20px #0005',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        cursor: 'default',
      }}
    >
      <NodeResizer
        isVisible={selected}
        minWidth={160}
        minHeight={80}
        color={color.border}
        handleStyle={{ width: 10, height: 10, borderRadius: 2, border: `2px solid ${color.border}` }}
        lineStyle={{ borderColor: `${color.border}66` }}
      />

      <Handle type="target" position={Position.Left} style={HANDLE_STYLE(color.border)} />
      <Handle type="source" position={Position.Right} style={HANDLE_STYLE(color.border)} />
      <Handle type="target" id="top" position={Position.Top} style={HANDLE_STYLE(color.border)} />
      <Handle type="source" id="bottom" position={Position.Bottom} style={HANDLE_STYLE(color.border)} />

      {/* Header */}
      <div style={{ padding: '10px 12px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <button
            onClick={cycleColor}
            title="색상 변경"
            style={{
              width: 14, height: 14, borderRadius: '50%',
              background: color.border, border: 'none', cursor: 'pointer', flexShrink: 0,
            }}
          />
          <span style={{ color: color.border, fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
            {color.label}
          </span>
        </div>

        {isEditing ? (
          <input
            ref={inputRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => e.key === 'Enter' && handleTitleBlur()}
            style={{
              background: 'transparent', border: 'none',
              borderBottom: `1px solid ${color.border}`,
              color: '#f0f0f0', fontSize: 15, fontWeight: 700,
              width: '100%', outline: 'none', marginBottom: 4,
            }}
          />
        ) : (
          <div
            onDoubleClick={handleTitleDoubleClick}
            style={{
              color: '#f0f0f0', fontSize: 15, fontWeight: 700,
              marginBottom: 4, cursor: 'text', minHeight: 22, lineHeight: '22px',
            }}
          >
            {title}
          </div>
        )}
      </div>

      {/* Description — fills remaining height */}
      <div style={{ flex: 1, padding: '0 12px 10px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <textarea
          value={description}
          onChange={handleDescChange}
          onFocus={() => data.onEditStart?.()}
          onBlur={() => data.onEditEnd?.()}
          placeholder="설명을 입력하세요..."
          style={{
            flex: 1,
            background: 'transparent', border: 'none',
            color: '#aaa', fontSize: 12, width: '100%',
            resize: 'none', outline: 'none',
            fontFamily: 'inherit', lineHeight: 1.5, minHeight: 0,
          }}
        />
      </div>
    </div>
  )
}
