import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import StageNode from './nodes/StageNode'
import MemoNode from './nodes/MemoNode'
import Toolbar from './components/Toolbar'
import Legend from './components/Legend'

const nodeTypes = { stage: StageNode, memo: MemoNode }

const defaultEdgeOptions = {
  type: 'smoothstep',
  animated: false,
  style: { stroke: '#4a4a5a', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#4a4a5a' },
}

// ── Stage type definitions ──────────────────────────────────────────────────
const DEFAULT_STAGE_TYPES = [
  { id: 'plan',   bg: '#1e3a5f', border: '#3b82f6', label: '기획' },
  { id: 'dev',    bg: '#1a3a2a', border: '#22c55e', label: '개발' },
  { id: 'review', bg: '#3a1a1a', border: '#ef4444', label: '검토' },
  { id: 'deploy', bg: '#2d2a1a', border: '#f59e0b', label: '배포' },
  { id: 'done',   bg: '#2a1a3a', border: '#a855f7', label: '완료' },
]

const TYPE_PALETTE = [
  { bg: '#1e3a5f', border: '#3b82f6' },
  { bg: '#1a3a2a', border: '#22c55e' },
  { bg: '#3a1a1a', border: '#ef4444' },
  { bg: '#2d2a1a', border: '#f59e0b' },
  { bg: '#2a1a3a', border: '#a855f7' },
  { bg: '#1a2a3a', border: '#06b6d4' },
  { bg: '#2a1a2a', border: '#ec4899' },
  { bg: '#2a2a1a', border: '#84cc16' },
]

// ── Initial canvas data ─────────────────────────────────────────────────────
const initialNodes = [
  { id: '1', type: 'stage', position: { x: 80,   y: 200 }, data: { label: '요구사항 분석', description: '사용자 인터뷰, 기능 정의',   colorIdx: 0 } },
  { id: '2', type: 'stage', position: { x: 380,  y: 200 }, data: { label: 'UI/UX 설계',   description: '와이어프레임, 프로토타입',  colorIdx: 0 } },
  { id: '3', type: 'stage', position: { x: 680,  y: 200 }, data: { label: '개발',          description: '프론트엔드 / 백엔드 구현', colorIdx: 1 } },
  { id: '4', type: 'stage', position: { x: 980,  y: 200 }, data: { label: 'QA 테스트',     description: '버그 수정, 성능 검증',     colorIdx: 2 } },
  { id: '5', type: 'stage', position: { x: 1280, y: 200 }, data: { label: '배포',          description: '프로덕션 릴리즈',          colorIdx: 3 } },
  { id: 'm1', type: 'memo', position: { x: 380, y: 380 }, data: { text: '디자인 시스템은 Figma에서 관리\n컴포넌트 라이브러리 재사용 필수' } },
  { id: 'm2', type: 'memo', position: { x: 980, y: 60  }, data: { text: '테스트 커버리지 80% 이상 목표' } },
]

const initialEdges = [
  { id: 'e1-2', source: '1', target: '2', ...defaultEdgeOptions },
  { id: 'e2-3', source: '2', target: '3', ...defaultEdgeOptions },
  { id: 'e3-4', source: '3', target: '4', ...defaultEdgeOptions },
  { id: 'e4-5', source: '4', target: '5', ...defaultEdgeOptions },
  { id: 'em1-2', source: 'm1', target: '2', type: 'smoothstep', style: { stroke: '#f59e0b88', strokeWidth: 1.5, strokeDasharray: '5,4' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b88' } },
  { id: 'em2-4', source: 'm2', target: '4', type: 'smoothstep', style: { stroke: '#f59e0b88', strokeWidth: 1.5, strokeDasharray: '5,4' }, markerEnd: { type: MarkerType.ArrowClosed, color: '#f59e0b88' } },
]

// ── localStorage helpers ────────────────────────────────────────────────────
function loadSavedState() {
  try { const r = localStorage.getItem('workflow-canvas');   return r ? JSON.parse(r)   : null } catch { return null }
}
function loadStageTypes() {
  try { const r = localStorage.getItem('workflow-canvas-types'); return r ? JSON.parse(r) : null } catch { return null }
}

// Strip runtime callbacks (and stageTypes) before snapshot / localStorage save
function stripNode(n) {
  const { onUpdate, onEditStart, onEditEnd, stageTypes, ...data } = n.data ?? {}
  const { selected, ...rest } = n
  return { ...rest, data }
}

const savedState = loadSavedState()
let nodeCounter = savedState?.nodes?.length
  ? Math.max(10, ...savedState.nodes.map((n) => parseInt(n.id) || 0))
  : 10

// ── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(savedState?.nodes ?? initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(savedState?.edges ?? initialEdges)
  const [stageTypes, setStageTypes] = useState(() => loadStageTypes() ?? DEFAULT_STAGE_TYPES)
  const [contextMenu, setContextMenu] = useState(null)
  const [renamingTypeIdx, setRenamingTypeIdx] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const reactFlowRef = useRef(null)
  const [rfInstance, setRfInstance] = useState(null)
  const [isAnyEditing, setIsAnyEditing] = useState(false)

  const historyStack = useRef([])
  const historyPointer = useRef(-1)
  const isRestoring = useRef(false)

  // ── Save stageTypes ──────────────────────────────────────────────────────
  useEffect(() => {
    try { localStorage.setItem('workflow-canvas-types', JSON.stringify(stageTypes)) } catch {}
  }, [stageTypes])

  // ── Auto-save canvas + history snapshot (debounced) ──────────────────────
  useEffect(() => {
    if (isRestoring.current) return
    const cleanNodes = nodes.map(stripNode)
    const cleanEdges = edges.map(({ selected, ...e }) => e)
    const snapshot = { nodes: cleanNodes, edges: cleanEdges }

    const lsTimer = setTimeout(() => {
      try { localStorage.setItem('workflow-canvas', JSON.stringify(snapshot)) } catch {}
    }, 500)

    const histTimer = setTimeout(() => {
      if (isRestoring.current) return
      const last = historyStack.current[historyPointer.current]
      if (last && JSON.stringify(last) === JSON.stringify(snapshot)) return
      historyStack.current = historyStack.current.slice(0, historyPointer.current + 1)
      historyStack.current.push(snapshot)
      historyPointer.current++
    }, 300)

    return () => { clearTimeout(lsTimer); clearTimeout(histTimer) }
  }, [nodes, edges])

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    if (historyPointer.current <= 0) return
    historyPointer.current--
    const snap = historyStack.current[historyPointer.current]
    isRestoring.current = true
    setNodes(snap.nodes)
    setEdges(snap.edges)
    setTimeout(() => { isRestoring.current = false }, 400)
  }, [setNodes, setEdges])

  const redo = useCallback(() => {
    if (historyPointer.current >= historyStack.current.length - 1) return
    historyPointer.current++
    const snap = historyStack.current[historyPointer.current]
    isRestoring.current = true
    setNodes(snap.nodes)
    setEdges(snap.edges)
    setTimeout(() => { isRestoring.current = false }, 400)
  }, [setNodes, setEdges])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [undo, redo])

  // ── Node data ────────────────────────────────────────────────────────────
  const updateNodeData = useCallback((id, patch) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
  }, [setNodes])

  // ── Stage type management ─────────────────────────────────────────────────
  const changeNodeStageType = useCallback((nodeId, typeIdx) => {
    setNodes((nds) => nds.map((n) => n.id === nodeId ? { ...n, data: { ...n.data, colorIdx: typeIdx } } : n))
  }, [setNodes])

  const renameStageType = useCallback((idx, label) => {
    if (!label.trim()) return
    setStageTypes((prev) => prev.map((t, i) => i === idx ? { ...t, label: label.trim() } : t))
  }, [])

  const deleteStageType = useCallback((idx) => {
    setStageTypes((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((_, i) => i !== idx)
      setNodes((nds) => nds.map((n) => {
        if (n.type !== 'stage') return n
        let ci = n.data.colorIdx ?? 0
        if (ci === idx) ci = 0
        else if (ci > idx) ci = ci - 1
        return { ...n, data: { ...n.data, colorIdx: ci } }
      }))
      return next
    })
  }, [setNodes])

  const handleAddStageType = useCallback(() => {
    const newIdx = stageTypes.length
    const palette = TYPE_PALETTE[newIdx % TYPE_PALETTE.length]
    setStageTypes((prev) => [...prev, { id: `type-${Date.now()}`, ...palette, label: '새 종류' }])
    setRenamingTypeIdx(newIdx)
    setRenameValue('새 종류')
  }, [stageTypes.length])

  // ── Add nodes ─────────────────────────────────────────────────────────────
  const addStage = useCallback(() => {
    nodeCounter++
    const id = String(nodeCounter)
    setNodes((nds) => [...nds, { id, type: 'stage', position: { x: 200 + Math.random() * 400, y: 150 + Math.random() * 300 }, data: { label: '새 단계', description: '', colorIdx: 0 } }])
  }, [setNodes])

  const addMemo = useCallback(() => {
    nodeCounter++
    const id = String(nodeCounter)
    setNodes((nds) => [...nds, { id, type: 'memo', position: { x: 300 + Math.random() * 400, y: 200 + Math.random() * 200 }, data: { text: '' } }])
  }, [setNodes])

  const addStageAt = useCallback((pos) => {
    nodeCounter++
    const id = String(nodeCounter)
    setNodes((nds) => [...nds, { id, type: 'stage', position: pos, data: { label: '새 단계', description: '', colorIdx: 0 } }])
  }, [setNodes])

  const addMemoAt = useCallback((pos) => {
    nodeCounter++
    const id = String(nodeCounter)
    setNodes((nds) => [...nds, { id, type: 'memo', position: pos, data: { text: '' } }])
  }, [setNodes])

  // ── Connect ───────────────────────────────────────────────────────────────
  const onConnect = useCallback((params) => {
    const isMemoSource = nodes.find((n) => n.id === params.source)?.type === 'memo'
    const isMemoTarget = nodes.find((n) => n.id === params.target)?.type === 'memo'
    const isMemo = isMemoSource || isMemoTarget
    setEdges((eds) => addEdge({
      ...params,
      type: 'smoothstep',
      style: isMemo ? { stroke: '#f59e0b88', strokeWidth: 1.5, strokeDasharray: '5,4' } : { stroke: '#4a4a5a', strokeWidth: 2 },
      markerEnd: { type: MarkerType.ArrowClosed, color: isMemo ? '#f59e0b88' : '#4a4a5a' },
    }, eds))
  }, [nodes, setEdges])

  // ── Context menus ─────────────────────────────────────────────────────────
  const onPaneContextMenu = useCallback((e) => {
    e.preventDefault()
    const bounds = reactFlowRef.current?.getBoundingClientRect()
    setContextMenu({ x: e.clientX, y: e.clientY, flowX: e.clientX - (bounds?.left ?? 0), flowY: e.clientY - (bounds?.top ?? 0) })
    setRenamingTypeIdx(null)
  }, [])

  const onNodeContextMenu = useCallback((e, node) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, nodeType: node.type })
    setRenamingTypeIdx(null)
  }, [])

  const onEdgeContextMenu = useCallback((e, edge) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id })
    setRenamingTypeIdx(null)
  }, [])

  const closeContext = () => { setContextMenu(null); setRenamingTypeIdx(null) }

  const handleContextAddStage = () => {
    if (!rfInstance || !contextMenu) return
    addStageAt(rfInstance.screenToFlowPosition({ x: contextMenu.flowX, y: contextMenu.flowY }))
    closeContext()
  }

  const handleContextAddMemo = () => {
    if (!rfInstance || !contextMenu) return
    addMemoAt(rfInstance.screenToFlowPosition({ x: contextMenu.flowX, y: contextMenu.flowY }))
    closeContext()
  }

  const handleContextDeleteNode = () => {
    if (!contextMenu?.nodeId) return
    const id = contextMenu.nodeId
    setNodes((nds) => nds.filter((n) => n.id !== id))
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
    closeContext()
  }

  const handleContextDeleteEdge = () => {
    if (!contextMenu?.edgeId) return
    setEdges((eds) => eds.filter((e) => e.id !== contextMenu.edgeId))
    closeContext()
  }

  const clearAll = useCallback(() => {
    if (window.confirm('모든 노드와 연결을 삭제할까요?')) { setNodes([]); setEdges([]) }
  }, [setNodes, setEdges])

  const fitView = useCallback(() => {
    rfInstance?.fitView({ padding: 0.1, duration: 500 })
  }, [rfInstance])

  // ── Selected edge highlight ───────────────────────────────────────────────
  const styledEdges = edges.map((e) => {
    if (!e.selected) return e
    const isMemo = !!e.style?.strokeDasharray
    const color = isMemo ? '#f59e0b' : '#60a5fa'
    return {
      ...e,
      style: { ...e.style, stroke: color, strokeWidth: isMemo ? 2.5 : 3.5, filter: `drop-shadow(0 0 6px ${color}88)` },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    }
  })

  // ── Commit rename on context menu close ───────────────────────────────────
  const commitRename = () => {
    if (renamingTypeIdx !== null) renameStageType(renamingTypeIdx, renameValue)
    setRenamingTypeIdx(null)
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }} onClick={() => { commitRename(); closeContext() }}>
      <Toolbar onAddStage={addStage} onAddMemo={addMemo} onFitView={fitView} onClearAll={clearAll} />

      <ReactFlow
        ref={reactFlowRef}
        nodes={nodes.map((n) => ({
          ...n,
          data: {
            ...n.data,
            stageTypes,
            onUpdate: (patch) => updateNodeData(n.id, patch),
            onEditStart: () => setIsAnyEditing(true),
            onEditEnd: () => setIsAnyEditing(false),
          },
        }))}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setRfInstance}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        nodesDraggable={!isAnyEditing}
        connectionMode="loose"
        panOnScroll
        panOnScrollMode="free"
        panOnScrollSpeed={1.5}
        zoomOnPinch
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={['Delete', 'Backspace']}
        style={{ background: '#0f0f13' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={28} size={1} color="#ffffff12" />
        <Controls style={{ background: '#1a1a22', border: '1px solid #ffffff18', borderRadius: 8 }} />
        <MiniMap
          nodeColor={(n) => (n.type === 'memo' ? '#f59e0b88' : '#3b82f688')}
          maskColor="#0f0f1388"
          style={{ background: '#1a1a22', border: '1px solid #ffffff18', borderRadius: 8 }}
        />
      </ReactFlow>

      <Legend />

      {/* ── Context Menu ─────────────────────────────────────────────────── */}
      {contextMenu && (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 1000,
            background: '#1e1e2a',
            border: '1px solid #ffffff22',
            borderRadius: 10,
            padding: '6px',
            boxShadow: '0 8px 32px #000c',
            minWidth: 200,
          }}
        >
          {/* Pane: add nodes */}
          {!contextMenu.nodeId && !contextMenu.edgeId && (
            <>
              <ContextItem icon="＋" label="단계 노드 추가" color="#3b82f6" onClick={handleContextAddStage} />
              <ContextItem icon="📝" label="메모 노드 추가" color="#f59e0b" onClick={handleContextAddMemo} />
            </>
          )}

          {/* Edge: delete */}
          {contextMenu.edgeId && (
            <ContextItem icon="🗑" label="연결선 삭제" color="#ef4444" onClick={handleContextDeleteEdge} />
          )}

          {/* Stage node: type selector + delete */}
          {contextMenu.nodeId && contextMenu.nodeType === 'stage' && (
            <>
              <div style={{ padding: '4px 8px 4px', color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                종류 선택
              </div>
              {stageTypes.map((type, idx) => (
                <div key={type.id} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '1px 4px' }}>
                  {renamingTypeIdx === idx ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => { renameStageType(idx, renameValue); setRenamingTypeIdx(null) }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { renameStageType(idx, renameValue); setRenamingTypeIdx(null) }
                        if (e.key === 'Escape') setRenamingTypeIdx(null)
                      }}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        flex: 1,
                        background: '#2a2a36',
                        border: `1px solid ${type.border}`,
                        borderRadius: 4,
                        color: '#f0f0f0',
                        fontSize: 12,
                        padding: '3px 8px',
                        outline: 'none',
                        fontFamily: 'inherit',
                      }}
                    />
                  ) : (
                    <TypeItem
                      type={type}
                      onClick={() => { changeNodeStageType(contextMenu.nodeId, idx); closeContext() }}
                    />
                  )}
                  {renamingTypeIdx !== idx && (
                    <>
                      <IconBtn
                        title="이름 변경"
                        onClick={(e) => { e.stopPropagation(); setRenamingTypeIdx(idx); setRenameValue(type.label) }}
                        hoverColor="#aaa"
                      >✎</IconBtn>
                      {stageTypes.length > 1 && (
                        <IconBtn
                          title="삭제"
                          onClick={(e) => { e.stopPropagation(); deleteStageType(idx) }}
                          hoverColor="#ef4444"
                        >✕</IconBtn>
                      )}
                    </>
                  )}
                </div>
              ))}
              <button
                onClick={(e) => { e.stopPropagation(); handleAddStageType() }}
                style={{
                  width: '100%', background: 'transparent', border: 'none',
                  borderRadius: 6, padding: '5px 12px', color: '#555',
                  fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#aaa')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#555')}
              >
                + 새 종류 추가
              </button>
              <div style={{ height: 1, background: '#ffffff18', margin: '4px 2px' }} />
              <ContextItem icon="🗑" label="노드 삭제" color="#ef4444" onClick={handleContextDeleteNode} />
            </>
          )}

          {/* Memo node: just delete */}
          {contextMenu.nodeId && contextMenu.nodeType === 'memo' && (
            <ContextItem icon="🗑" label="노드 삭제" color="#ef4444" onClick={handleContextDeleteNode} />
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────
function ContextItem({ icon, label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        background: 'transparent', border: 'none', borderRadius: 6,
        padding: '8px 12px', color: '#ccc', fontSize: 13, cursor: 'pointer',
        textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.1s',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = `${color}22`)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  )
}

function TypeItem({ type, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: 8,
        background: 'transparent', border: 'none', borderRadius: 6,
        padding: '5px 8px', color: '#ccc', fontSize: 12, cursor: 'pointer',
        textAlign: 'left', fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = `${type.border}22`)}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      <span style={{ width: 10, height: 10, borderRadius: '50%', background: type.border, flexShrink: 0, display: 'inline-block' }} />
      <span>{type.label}</span>
    </button>
  )
}

function IconBtn({ onClick, title, hoverColor, children }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'transparent', border: 'none', color: '#444',
        cursor: 'pointer', padding: '2px 5px', borderRadius: 3,
        fontSize: 12, lineHeight: 1, flexShrink: 0,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.color = hoverColor)}
      onMouseLeave={(e) => (e.currentTarget.style.color = '#444')}
    >
      {children}
    </button>
  )
}
