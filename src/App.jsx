import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  reconnectEdge,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import StageNode from './nodes/StageNode'
import MemoNode from './nodes/MemoNode'
import GroupNode from './nodes/GroupNode'
import { DEMO_CANVASES } from './demoCanvases'
import Toolbar from './components/Toolbar'
import HelpPanel from './components/HelpPanel'
import CanvasTabs from './components/CanvasTabs'
import AuthPanel from './components/AuthPanel'
import InvitePopover from './components/InvitePopover'
import {
  initCanvases, loadCanvasData, saveCanvasData, deleteCanvasData,
  saveCanvasList, saveActiveId, uid,
  loadCanvasList, loadActiveId,
  loadLodThreshold, saveLodThreshold,
} from './storage'
import { supabase } from './lib/supabase'
import {
  saveCanvas as cloudSaveCanvas,
  loadAllCanvases as cloudLoadAllCanvases,
  deleteCanvas as cloudDeleteCanvas,
  saveUserPrefs as cloudSaveUserPrefs,
  loadUserPrefs as cloudLoadUserPrefs,
  updateSharedCanvas as cloudUpdateSharedCanvas,
} from './lib/cloudStorage'
import { joinCanvasPresence } from './lib/presence'
import { claimEmailInvites, claimShareToken, listSharedWithMe } from './lib/shares'

const nodeTypes = { stage: StageNode, memo: MemoNode, group: GroupNode }

const defaultEdgeOptions = {
  animated: false,
  style: { stroke: '#4a4a5a', strokeWidth: 3 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#4a4a5a' },
  pathOptions: { curvature: 0.45 },
}

// ── Stage type definitions ──────────────────────────────────────────────────
const DEFAULT_STAGE_TYPES = [
  { id: 'plan',   bg: '#1e3a5f', border: '#3b82f6', label: '기획' },
  { id: 'dev',    bg: '#1a3a2a', border: '#22c55e', label: '개발' },
  { id: 'review', bg: '#3a1a1a', border: '#ef4444', label: '검토' },
  { id: 'deploy', bg: '#1a2a3a', border: '#06b6d4', label: '배포' },
  { id: 'done',   bg: '#2a1a3a', border: '#a855f7', label: '완료' },
]

const TYPE_PALETTE = [
  { bg: '#1e3a5f', border: '#3b82f6' },
  { bg: '#1a3a2a', border: '#22c55e' },
  { bg: '#3a1a1a', border: '#ef4444' },
  { bg: '#1a2a3a', border: '#06b6d4' },
  { bg: '#2a1a3a', border: '#a855f7' },
  { bg: '#20204a', border: '#6366f1' },
  { bg: '#2a1a2a', border: '#ec4899' },
  { bg: '#2a2a1a', border: '#84cc16' },
]

// ── Initial canvas data (seed for the very first canvas) ─────────────────────
// ── Helpers ──────────────────────────────────────────────────────────────────
// Strip type and data from saved edges so old 'separable' type (and any other
// removed custom type) doesn't cause React Flow to emit unknown-type warnings.
// Keeps style/markerEnd so visual appearance is preserved.
function normalizeEdges(edges) {
  return (edges ?? []).map(({ data, type, ...e }) => ({ ...e }))
}

function maxNodeId(nodes) {
  return Math.max(10, ...(nodes ?? []).map((n) => parseInt(n.id) || 0))
}

// ── Phase 2 sharing: shared canvases live under a composite localStorage/
// activeCanvasId key so they never collide with the owner's own canvas ids.
const SHARED_PREFIX = 'shared:'
function sharedCanvasId(ownerId, canvasId) { return `${SHARED_PREFIX}${ownerId}:${canvasId}` }
function parseSharedId(id) {
  if (typeof id !== 'string' || !id.startsWith(SHARED_PREFIX)) return null
  const rest = id.slice(SHARED_PREFIX.length)
  const sep = rest.indexOf(':')
  if (sep === -1) return null
  return { ownerId: rest.slice(0, sep), canvasId: rest.slice(sep + 1) }
}

// Walk a node's parentId chain to get its absolute flow-space position
// (child nodes carry positions relative to their parent frame).
function absolutePosition(node, byId) {
  let x = node.position.x, y = node.position.y, cur = node, guard = 0
  while (cur.parentId && byId.has(cur.parentId) && guard++ < 20) {
    const p = byId.get(cur.parentId)
    x += p.position.x; y += p.position.y; cur = p
  }
  return { x, y }
}

// "연결선 정리": pick the nearest-side handle pair between two nodes, based on
// their absolute centers (accounts for parentId children — see absolutePosition).
function closestHandles(sourceNode, targetNode, byId) {
  const dim = (n) => ({ w: n.measured?.width ?? n.width ?? 200, h: n.measured?.height ?? n.height ?? 80 })
  const sPos = absolutePosition(sourceNode, byId)
  const tPos = absolutePosition(targetNode, byId)
  const sd = dim(sourceNode), td = dim(targetNode)
  const dx = (tPos.x + td.w / 2) - (sPos.x + sd.w / 2)
  const dy = (tPos.y + td.h / 2) - (sPos.y + sd.h / 2)
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0 ? { sourceHandle: 'right', targetHandle: 'left' } : { sourceHandle: 'left', targetHandle: 'right' }
  }
  return dy >= 0 ? { sourceHandle: 'bottom', targetHandle: 'top' } : { sourceHandle: 'top', targetHandle: 'bottom' }
}

// Copy/paste and undo/redo keydown guards must not fire while the user is
// typing into a rich-text field, input, or textarea.
function isTypingTarget() {
  const el = document.activeElement
  if (!el) return false
  if (el.isContentEditable) return true
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT'
}

// Group-scope invitees can only add nodes inside their invited frame — place
// new nodes near the frame center (relative coords) with a little jitter so
// repeated adds don't stack exactly on top of each other.
function centerInFrame(frame, nodeW, nodeH) {
  const fw = frame.measured?.width ?? frame.width ?? 240
  const fh = frame.measured?.height ?? frame.height ?? 160
  const jx = (Math.random() - 0.5) * 60
  const jy = (Math.random() - 0.5) * 60
  return {
    x: Math.max(10, Math.min(fw - nodeW - 10, fw / 2 - nodeW / 2 + jx)),
    y: Math.max(46, Math.min(fh - nodeH - 10, fh / 2 - nodeH / 2 + jy)),
  }
}

// React Flow requires a parent node to appear before its children in the
// nodes array. Loaded data (localStorage / cloud) doesn't guarantee this, so
// re-sort on load: parents first, otherwise stable relative to input order.
function sortParentsFirst(nodes) {
  const byId = new Map((nodes ?? []).map((n) => [n.id, n]))
  const result = []
  const visited = new Set()
  const visit = (n) => {
    if (visited.has(n.id)) return
    if (n.parentId && byId.has(n.parentId)) visit(byId.get(n.parentId))
    visited.add(n.id)
    result.push(n)
  }
  ;(nodes ?? []).forEach(visit)
  return result
}

// Base (unselected) appearance for an edge, derived purely from whether it's a
// dashed memo link. Used to force a clean look on deselect so selection-bold can
// never linger — even if a stale bold style got baked into the edge by reconnect.
function baseEdgeStyle(e) {
  const isMemo = !!e.style?.strokeDasharray
  return {
    style: isMemo
      ? { stroke: '#f59e0b88', strokeWidth: 2.25, strokeDasharray: '5,4' }
      : { stroke: '#4a4a5a', strokeWidth: 3 },
    markerEnd: { type: MarkerType.ArrowClosed, color: isMemo ? '#f59e0b88' : '#4a4a5a' },
  }
}

// Strip runtime callbacks (and stageTypes) before snapshot / localStorage save
function stripNode(n) {
  const { onUpdate, onEditStart, onEditEnd, stageTypes, ...data } = n.data ?? {}
  const { selected, ...rest } = n
  return { ...rest, data }
}
const stripEdge = ({ selected, ...e }) => e

// ── Bootstrap canvases (runs once at module load) ────────────────────────────
const { list: initCanvasList, activeId: initActiveId } = initCanvases(DEMO_CANVASES)
const initData = loadCanvasData(initActiveId) ?? { nodes: DEMO_CANVASES[0].nodes, edges: DEMO_CANVASES[0].edges }

// ── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [canvases, setCanvases] = useState(initCanvasList)
  const [activeCanvasId, setActiveCanvasId] = useState(initActiveId)

  const [nodes, setNodes, onNodesChange] = useNodesState(sortParentsFirst(initData.nodes ?? []))
  const [edges, setEdges, onEdgesChange] = useEdgesState(normalizeEdges(initData.edges))
  const [stageTypes, setStageTypes] = useState(() => initData.stageTypes ?? DEFAULT_STAGE_TYPES)
  const [contextMenu, setContextMenu] = useState(null)
  const [renamingTypeIdx, setRenamingTypeIdx] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const reactFlowRef = useRef(null)
  const [rfInstance, setRfInstance] = useState(null)
  const [isAnyEditing, setIsAnyEditing] = useState(false)
  const [isPinching, setIsPinching] = useState(false)
  const [lassoRect, setLassoRect] = useState(null) // screen-space rubber-band box
  const [alignGuides, setAlignGuides] = useState([]) // [{axis:'x'|'y', value}] in flow-space coords, drawn while dragging
  const [lodThreshold, setLodThreshold] = useState(() => loadLodThreshold())

  // Saved views (per canvas): [{ id, name, bounds: {x,y,width,height} }]
  const [views, setViews] = useState(initData.views ?? [])
  const [currentViewId, setCurrentViewId] = useState(null) // view shown in the toolbar selector

  // Touch / responsive detection
  const [touchDevice] = useState(() => 'ontouchstart' in window || navigator.maxTouchPoints > 0)
  const [reconnecting, setReconnecting] = useState(false)
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth < 768)
    window.addEventListener('resize', fn)
    return () => window.removeEventListener('resize', fn)
  }, [])

  const counterRef = useRef(maxNodeId(initData.nodes))
  const historyStack = useRef([])
  const historyPointer = useRef(-1)
  const isRestoring = useRef(false)

  // ── Auth + cloud sync ─────────────────────────────────────────────────────
  const [user, setUser] = useState(null)
  const userRef = useRef(null)
  const [cloudSyncing, setCloudSyncing] = useState(false)
  // Stable ref to always-current state for use inside async callbacks
  const latestRef = useRef({ canvases: initCanvasList, activeCanvasId: initActiveId, stageTypes: [], views: [] })
  const isAnyEditingRef = useRef(false) // mirror for the realtime channel callback
  const lastPushedCanvasRef = useRef('') // JSON of the last canvas payload saved to cloud
  const lastPushedPrefsRef = useRef('') // JSON of the last prefs payload saved to cloud

  // ── Sharing / invite (phase 2) ────────────────────────────────────────────
  const [invite, setInvite] = useState(null) // { scope, targetId, x, y } | null
  const [onlineUsers, setOnlineUsers] = useState([]) // [{ user_id, email }] in the active canvas
  const [sharedCanvases, setSharedCanvases] = useState([]) // canvases shared WITH me (listSharedWithMe())
  const pendingShareTokenRef = useRef(null) // #share=<token> claimed right after SIGNED_IN

  const nextId = () => String(++counterRef.current)

  // Keep latestRef and userRef in sync so async callbacks always see fresh state
  useEffect(() => { latestRef.current = { canvases, activeCanvasId, stageTypes, views } }, [canvases, activeCanvasId, stageTypes, views])
  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { isAnyEditingRef.current = isAnyEditing }, [isAnyEditing])

  // ── Auto-save active canvas + history snapshot (debounced) ───────────────
  useEffect(() => {
    if (isRestoring.current) return
    const histSnapshot = { nodes: nodes.map(stripNode), edges: edges.map(stripEdge) }

    // localStorage snapshot also carries saved views + stage types (undo/redo does not).
    const lsTimer = setTimeout(() => { saveCanvasData(activeCanvasId, { ...histSnapshot, views, stageTypes }) }, 500)

    const histTimer = setTimeout(() => {
      if (isRestoring.current) return
      const last = historyStack.current[historyPointer.current]
      if (last && JSON.stringify(last) === JSON.stringify(histSnapshot)) return
      historyStack.current = historyStack.current.slice(0, historyPointer.current + 1)
      historyStack.current.push(histSnapshot)
      historyPointer.current++
    }, 300)

    return () => { clearTimeout(lsTimer); clearTimeout(histTimer) }
  }, [nodes, edges, activeCanvasId, views, stageTypes])

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

  // ── Trackpad: simultaneous pan + pinch ───────────────────────────────────
  const handleWheel = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (!rfInstance || !reactFlowRef.current) return

      const { x, y, zoom } = rfInstance.getViewport()
      const rect = reactFlowRef.current.getBoundingClientRect()
      const cx = e.clientX - rect.left
      const cy = e.clientY - rect.top

      if (e.ctrlKey) {
        const newZoom = Math.min(Math.max(zoom * Math.exp(-e.deltaY * 0.01), 0.1), 2)
        rfInstance.setViewport({
          x: cx - (cx - x) * (newZoom / zoom),
          y: cy - (cy - y) * (newZoom / zoom),
          zoom: newZoom,
        })
      } else if (e.deltaMode === 0) {
        rfInstance.setViewport({ x: x - e.deltaX * 1.5, y: y - e.deltaY * 1.5, zoom })
      } else {
        const newZoom = Math.min(Math.max(zoom * (e.deltaY > 0 ? 1 / 1.2 : 1.2), 0.1), 2)
        rfInstance.setViewport({
          x: cx - (cx - x) * (newZoom / zoom),
          y: cy - (cy - y) * (newZoom / zoom),
          zoom: newZoom,
        })
      }
    },
    [rfInstance],
  )

  useEffect(() => {
    if (touchDevice) return // native pinch handles zoom on touch devices
    const el = reactFlowRef.current
    if (!el || !rfInstance) return
    el.addEventListener('wheel', handleWheel, { passive: false, capture: true })
    return () => el.removeEventListener('wheel', handleWheel, { capture: true })
  }, [handleWheel, rfInstance, touchDevice])

  // ── Empty-space gesture: quick drag = pan, long-press then drag = box select ─
  // Works on both desktop (mouse) and mobile (touch). On touch, if a second
  // finger appears we cancel so React Flow can handle the pinch-to-zoom.
  useEffect(() => {
    const el = reactFlowRef.current
    if (!el || !rfInstance) return
    const LONG_PRESS = touchDevice ? 400 : 250
    const MOVE_THRESH = touchDevice ? 12 : 8
    let active = false, mode = null, sx = 0, sy = 0, vp = null, timer = null
    let activePointerId = null

    const cleanup = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointerdown', onSecondPointer)
      clearTimeout(timer)
    }
    // Cancel our single-finger handler when a second finger appears (pinch)
    const onSecondPointer = (e) => {
      if (e.pointerId !== activePointerId) {
        cleanup(); active = false; mode = null; setLassoRect(null)
      }
    }
    const onDown = (e) => {
      if (e.button !== 0) return
      if (e.pointerType === 'touch' && !e.isPrimary) return
      // Mobile: long-press on edge → edge context menu (same as desktop right-click)
      if (touchDevice && e.pointerType === 'touch') {
        const edgeEl = e.target.closest?.('.react-flow__edge')
        if (edgeEl) {
          const edgeId = edgeEl.getAttribute('data-id')
          if (edgeId) {
            const ex = e.clientX, ey = e.clientY
            const edgeLpTimer = setTimeout(() => {
              setContextMenu({ x: ex, y: ey, edgeId })
            }, 500)
            const cancelEdgeLp = () => {
              clearTimeout(edgeLpTimer)
              window.removeEventListener('pointermove', onEdgeLpMove)
              window.removeEventListener('pointerup', cancelEdgeLp)
              window.removeEventListener('pointercancel', cancelEdgeLp)
            }
            const onEdgeLpMove = (ev) => {
              if (Math.hypot(ev.clientX - ex, ev.clientY - ey) > 10) cancelEdgeLp()
            }
            window.addEventListener('pointermove', onEdgeLpMove)
            window.addEventListener('pointerup', cancelEdgeLp)
            window.addEventListener('pointercancel', cancelEdgeLp)
          }
          return
        }
      }
      if (!e.target.classList?.contains('react-flow__pane')) return
      active = true; mode = null; sx = e.clientX; sy = e.clientY
      vp = rfInstance.getViewport(); activePointerId = e.pointerId
      timer = setTimeout(() => {
        if (active && mode === null) { mode = 'lasso'; setLassoRect({ x: sx, y: sy, w: 0, h: 0 }) }
      }, LONG_PRESS)
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      if (e.pointerType === 'touch') window.addEventListener('pointerdown', onSecondPointer)
    }
    const onMove = (e) => {
      if (!active || e.pointerId !== activePointerId) return
      const dx = e.clientX - sx, dy = e.clientY - sy
      if (mode === null) {
        if (Math.hypot(dx, dy) > MOVE_THRESH) { mode = 'pan'; clearTimeout(timer) }
        else return
      }
      if (mode === 'pan') {
        rfInstance.setViewport({ x: vp.x + dx, y: vp.y + dy, zoom: vp.zoom })
      } else if (mode === 'lasso') {
        setLassoRect({ x: Math.min(sx, e.clientX), y: Math.min(sy, e.clientY), w: Math.abs(dx), h: Math.abs(dy) })
      }
    }
    const onUp = (e) => {
      if (e.pointerId !== activePointerId) return
      cleanup()
      if (mode === 'lasso') {
        const a = rfInstance.screenToFlowPosition({ x: sx, y: sy })
        const b = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY })
        const x1 = Math.min(a.x, b.x), y1 = Math.min(a.y, b.y), x2 = Math.max(a.x, b.x), y2 = Math.max(a.y, b.y)
        if (x2 - x1 > 2 || y2 - y1 > 2) {
          setNodes((nds) => {
            const byId = new Map(nds.map((n) => [n.id, n]))
            // Child nodes carry RELATIVE positions (parentId semantics) — walk
            // up the parent chain to get absolute flow-space coordinates.
            const absPos = (n) => {
              let x = n.position.x, y = n.position.y, cur = n, guard = 0
              while (cur.parentId && guard++ < 20) {
                const p = byId.get(cur.parentId)
                if (!p) break
                x += p.position.x; y += p.position.y; cur = p
              }
              return { x, y }
            }
            return nds.map((n) => {
              if (n.type === 'group') return { ...n, selected: false } // frames aren't lasso-selectable
              const { x, y } = absPos(n)
              const w = n.measured?.width ?? n.width ?? 0
              const h = n.measured?.height ?? n.height ?? 0
              const sel = x < x2 && x + w > x1 && y < y2 && y + h > y1
              return { ...n, selected: sel }
            })
          })
          const swallow = (ev) => { ev.stopPropagation(); window.removeEventListener('click', swallow, true) }
          window.addEventListener('click', swallow, true)
          setTimeout(() => window.removeEventListener('click', swallow, true), 50)
        } else if (touchDevice && !(permRef.current.role === 'invitee' && permRef.current.scope !== 'canvas')) {
          // Stationary long-press on empty space (touch) → pane context menu,
          // the mobile equivalent of a right-click.
          const r = reactFlowRef.current?.getBoundingClientRect()
          setContextMenu({ x: sx, y: sy, flowX: sx - (r?.left ?? 0), flowY: sy - (r?.top ?? 0) })
          setRenamingTypeIdx(null)
          const swallow = (ev) => { ev.stopPropagation(); window.removeEventListener('click', swallow, true) }
          window.addEventListener('click', swallow, true)
          setTimeout(() => window.removeEventListener('click', swallow, true), 50)
        }
      } else if (mode === null) {
        // Quick tap on empty pane (onDown only proceeds for .react-flow__pane,
        // so this is definitively empty space) → clear any selected-edge bold.
        // Done here because onPaneClick / root onClick aren't reliable on touch.
        setEdges((eds) => eds.some((ed) => ed.selected) ? eds.map((ed) => ({ ...ed, selected: false })) : eds)
      }
      active = false; mode = null; setLassoRect(null)
    }

    el.addEventListener('pointerdown', onDown)
    return () => { el.removeEventListener('pointerdown', onDown); cleanup() }
  }, [rfInstance, setNodes, setEdges, touchDevice])

  // ── Mobile: bridge touch → mousedown for React Flow edge reconnect ──────────
  // React Flow's EdgeAnchor (the edge-endpoint grab handle) only registers
  // onMouseDown — no touch handler — so reconnect never starts on touch devices.
  //
  // We can't rely on the touch's e.target: an endpoint sits on a node's boundary,
  // so the touch usually lands on the node DIV, not the (transparent) anchor
  // circle. Instead we geometrically match the touch against the screen positions
  // of the rendered .react-flow__edgeupdater circles (which only exist while an
  // edge is selected). If the touch is within grab range of one, we hijack the
  // gesture: stop it reaching the node (preventDefault + stopPropagation, which
  // blocks the node-drag) and dispatch a synthetic mousedown on that circle.
  // React Flow then takes over via its own touchmove/touchend document listeners.
  useEffect(() => {
    if (!touchDevice || !rfInstance) return
    const el = reactFlowRef.current
    if (!el) return

    const GRAB = 28 // px slack around the anchor center

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return
      const t = e.touches[0]
      const anchors = el.querySelectorAll('.react-flow__edgeupdater')
      if (!anchors.length) return

      let best = null, bestDist = Infinity, bestCx = 0, bestCy = 0
      anchors.forEach((a) => {
        const r = a.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const dist = Math.hypot(t.clientX - cx, t.clientY - cy)
        const reach = Math.max(r.width, r.height) / 2 + GRAB
        if (dist < reach && dist < bestDist) { best = a; bestDist = dist; bestCx = cx; bestCy = cy }
      })
      if (!best) return

      // Hijack: keep the node under the finger from starting a drag.
      e.preventDefault()
      e.stopPropagation()
      best.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true,
        clientX: bestCx, clientY: bestCy,
        button: 0, buttons: 1, view: window,
      }))
    }

    // Capture phase so we run before React Flow's node drag and our pinch handler.
    el.addEventListener('touchstart', onTouchStart, { passive: false, capture: true })
    return () => el.removeEventListener('touchstart', onTouchStart, { capture: true })
  }, [touchDevice, rfInstance])

  // ── Touch: additive tap selection for nodes AND edges ───────────────────────
  // Desktop multi-selects with Shift/Cmd/Ctrl, but touch has no modifier keys.
  // Once something is selected, tapping another node/edge ADDS it to the
  // selection (tapping an already-selected one removes it). React Flow's own
  // click handling replaces the selection, so we snapshot the selection from
  // the DOM in the capture phase (before RF mutates it) and merge it back
  // right after. The tapped element itself keeps RF's own selection verdict
  // (so invitee-gated `selectable:false` nodes can't sneak in) unless it was
  // already selected, in which case we toggle it off.
  useEffect(() => {
    if (!touchDevice) return
    const el = reactFlowRef.current
    if (!el || !rfInstance) return

    const onClickCapture = (e) => {
      const nodeEl = e.target.closest?.('.react-flow__node')
      const edgeEl = e.target.closest?.('.react-flow__edge')
      const tappedEl = nodeEl || edgeEl
      if (!tappedEl) return
      const tappedId = tappedEl.getAttribute('data-id')
      if (!tappedId) return
      const prevNodeIds = [...el.querySelectorAll('.react-flow__node.selected')].map((n) => n.getAttribute('data-id'))
      const prevEdgeIds = [...el.querySelectorAll('.react-flow__edge.selected')].map((n) => n.getAttribute('data-id'))
      if (prevNodeIds.length + prevEdgeIds.length === 0) return // first tap: default behavior
      const tappedWasSelected = tappedEl.classList.contains('selected')

      setTimeout(() => {
        setNodes((nds) => nds.map((n) => {
          const isTapped = !!nodeEl && n.id === tappedId
          if (isTapped) return tappedWasSelected && n.selected ? { ...n, selected: false } : n
          if (prevNodeIds.includes(n.id) && !n.selected) return { ...n, selected: true }
          return n
        }))
        setEdges((eds) => eds.map((ed) => {
          const isTapped = !!edgeEl && ed.id === tappedId
          if (isTapped) return tappedWasSelected && ed.selected ? { ...ed, selected: false } : ed
          if (prevEdgeIds.includes(ed.id) && !ed.selected) return { ...ed, selected: true }
          return ed
        }))
      }, 0)
    }

    el.addEventListener('click', onClickCapture, true)
    return () => el.removeEventListener('click', onClickCapture, true)
  }, [touchDevice, rfInstance, setNodes, setEdges])

  // ── Desktop: forgiving grab radius for edge reconnect endpoints ─────────────
  // index.css renders `.react-flow__edgeupdater` at a small, fixed CSS `r`
  // (it overrides the reconnectRadius prop's SVG attribute entirely — CSS
  // wins over presentation attributes), and that already-small circle shrinks
  // further on screen as the canvas zooms out. The result: a real mouse click
  // on a selected edge's endpoint routinely misses the tiny hit circle and
  // lands on the node/edge underneath instead, so the drag never starts.
  // Mirror the mobile touch bridge above: on mousedown, if the click is within
  // grab range of a rendered anchor circle but didn't land exactly on it,
  // hijack the gesture (block the node drag it would otherwise start) and
  // dispatch a synthetic mousedown centered on the anchor so React Flow's own
  // reconnect drag takes over from there.
  useEffect(() => {
    if (touchDevice || !rfInstance) return
    const el = reactFlowRef.current
    if (!el) return

    const GRAB = 20 // px slack around the anchor center

    const onMouseDown = (e) => {
      if (e.button !== 0) return
      if (e.target.closest?.('.react-flow__edgeupdater')) return // already a precise hit
      const anchors = el.querySelectorAll('.react-flow__edgeupdater')
      if (!anchors.length) return

      let best = null, bestDist = Infinity, bestCx = 0, bestCy = 0
      anchors.forEach((a) => {
        const r = a.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const dist = Math.hypot(e.clientX - cx, e.clientY - cy)
        const reach = Math.max(r.width, r.height) / 2 + GRAB
        if (dist < reach && dist < bestDist) { best = a; bestDist = dist; bestCx = cx; bestCy = cy }
      })
      if (!best) return

      e.preventDefault()
      e.stopPropagation()
      best.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true, cancelable: true,
        clientX: bestCx, clientY: bestCy,
        button: 0, buttons: 1, view: window,
      }))
    }

    // Capture phase so we run before React Flow's own node-drag mousedown handling.
    el.addEventListener('mousedown', onMouseDown, { capture: true })
    return () => el.removeEventListener('mousedown', onMouseDown, { capture: true })
  }, [touchDevice, rfInstance])

  // ── Touch: two-finger pinch zoom (custom) ────────────────────────────────────
  // React Flow's own pinch is disabled here because panOnDrag=false makes its
  // event filter reject every touchstart (so one-finger lasso can work). We
  // implement pinch ourselves so two-finger zoom and one-finger select coexist.
  useEffect(() => {
    if (!touchDevice) return
    const el = reactFlowRef.current
    if (!el || !rfInstance) return
    let pinch = null
    const distOf = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY)
    const midOf = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 })

    const onStart = (e) => {
      if (e.touches.length !== 2) return
      setIsPinching(true)
      const vp = rfInstance.getViewport()
      const rect = el.getBoundingClientRect()
      const m = midOf(e.touches)
      const cx0 = m.x - rect.left, cy0 = m.y - rect.top
      // P = the flow-space point currently under the pinch midpoint; we keep it
      // pinned under the (moving) midpoint while scaling.
      pinch = { startDist: distOf(e.touches), Px: (cx0 - vp.x) / vp.zoom, Py: (cy0 - vp.y) / vp.zoom, z0: vp.zoom, rect }
      e.preventDefault()
    }
    const onMove = (e) => {
      if (!pinch || e.touches.length !== 2) return
      e.preventDefault()
      const d = distOf(e.touches)
      const m = midOf(e.touches)
      const cx = m.x - pinch.rect.left, cy = m.y - pinch.rect.top
      const z = Math.min(Math.max(pinch.z0 * (d / pinch.startDist), 0.1), 2)
      rfInstance.setViewport({ x: cx - pinch.Px * z, y: cy - pinch.Py * z, zoom: z })
    }
    const onEnd = (e) => { if (e.touches.length < 2) { pinch = null; setIsPinching(false) } }

    // capture:true ensures our handler fires before any child element (e.g. a node)
    // and calling preventDefault in onStart prevents pointer-event synthesis for both
    // touch points, so React Flow won't start a node-drag while we're pinching.
    el.addEventListener('touchstart', onStart, { passive: false, capture: true })
    el.addEventListener('touchmove', onMove, { passive: false, capture: true })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart, { capture: true })
      el.removeEventListener('touchmove', onMove, { capture: true })
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [rfInstance, touchDevice])

  // ── Multi-canvas ───────────────────────────────────────────────────────────
  const loadCanvas = useCallback(async (id, prefetchedData) => {
    let data
    if (prefetchedData) {
      data = prefetchedData
    } else {
      data = loadCanvasData(id) ?? { nodes: [], edges: [] }
      if (userRef.current) {
        try {
          const { data: row } = await supabase
            .from('canvases')
            .select('nodes, edges, views, stage_types')
            .eq('user_id', userRef.current.id)
            .eq('canvas_id', id)
            .maybeSingle()
          if (row) {
            data = { nodes: row.nodes ?? [], edges: row.edges ?? [], views: row.views ?? [], stageTypes: row.stage_types?.length ? row.stage_types : undefined }
            saveCanvasData(id, data)
          }
        } catch (e) {
          console.warn('[cloud] loadCanvas fetch:', e.message)
        }
      }
    }
    const nNodes = sortParentsFirst(data.nodes ?? [])
    const nEdges = normalizeEdges(data.edges)
    isRestoring.current = true
    setActiveCanvasId(id)
    saveActiveId(id)
    setNodes(nNodes)
    setEdges(nEdges)
    setViews(data.views ?? [])
    setStageTypes(data.stageTypes ?? DEFAULT_STAGE_TYPES)
    setCurrentViewId(null)
    counterRef.current = maxNodeId(nNodes)
    const snap = { nodes: nNodes.map(stripNode), edges: nEdges.map(stripEdge) }
    historyStack.current = [snap]
    historyPointer.current = 0
    setTimeout(() => { isRestoring.current = false }, 400)
  }, [setNodes, setEdges])

  const persistCurrent = useCallback(() => {
    saveCanvasData(activeCanvasId, { nodes: nodes.map(stripNode), edges: edges.map(stripEdge), views, stageTypes })
  }, [activeCanvasId, nodes, edges, views, stageTypes])

  // Load a canvas I was invited to: fetched directly off the OWNER's row
  // (RLS grants invitees select access), then fed through loadCanvas's
  // existing prefetched-data path under a composite localStorage id.
  const loadSharedCanvas = useCallback(async (ownerId, canvasId) => {
    const { data: row, error } = await supabase
      .from('canvases')
      .select('name, nodes, edges, views, stage_types')
      .eq('user_id', ownerId)
      .eq('canvas_id', canvasId)
      .maybeSingle()
    if (error) { console.error('[shares] loadSharedCanvas:', error.message); return }
    if (!row) return
    const compositeId = sharedCanvasId(ownerId, canvasId)
    const data = { nodes: row.nodes ?? [], edges: row.edges ?? [], views: row.views ?? [], stageTypes: row.stage_types?.length ? row.stage_types : undefined }
    saveCanvasData(compositeId, data)
    loadCanvas(compositeId, data)
  }, [loadCanvas])

  const switchCanvas = useCallback((id) => {
    if (id === activeCanvasId) return
    persistCurrent()
    const shared = parseSharedId(id)
    if (shared) { loadSharedCanvas(shared.ownerId, shared.canvasId); return }
    loadCanvas(id)
  }, [activeCanvasId, persistCurrent, loadCanvas, loadSharedCanvas])

  const addCanvas = useCallback(() => {
    persistCurrent()
    const id = uid()
    setCanvases((prev) => {
      const name = `캔버스 ${prev.length + 1}`
      const next = [...prev, { id, name }]
      saveCanvasList(next)
      return next
    })
    saveCanvasData(id, { nodes: [], edges: [] })
    loadCanvas(id)
  }, [persistCurrent, loadCanvas])

  const renameCanvas = useCallback((id, name) => {
    setCanvases((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, name } : c))
      saveCanvasList(next)
      return next
    })
  }, [])

  const deleteCanvas = useCallback((id) => {
    setCanvases((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((c) => c.id !== id)
      saveCanvasList(next)
      deleteCanvasData(id)
      if (user) cloudDeleteCanvas(user.id, id)
      if (id === activeCanvasId) loadCanvas(next[0].id)
      return next
    })
  }, [activeCanvasId, loadCanvas, user])

  // ── Cloud: load all canvases from Supabase into memory + localStorage ────
  // Placed after loadCanvas so it can be a stable dep reference (no TDZ).
  const loadFromCloud = useCallback(async (userId) => {
    let rows, prefs
    try {
      ;[rows, prefs] = await Promise.all([
        cloudLoadAllCanvases(userId),
        cloudLoadUserPrefs(userId),
      ])
    } catch (err) {
      console.error('[cloud] loadFromCloud:', err.message)
      return
    }

    if (!rows.length) {
      // First login: push existing localStorage data up to the cloud
      const list = loadCanvasList() ?? []
      for (const c of list) {
        const d = loadCanvasData(c.id) ?? { nodes: [], edges: [] }
        await cloudSaveCanvas(userId, c.id, c.name, d.nodes ?? [], d.edges ?? [], d.views ?? [], d.stageTypes)
      }
      await cloudSaveUserPrefs(userId, {
        active_canvas_id: loadActiveId(),
        canvas_order: list,
      })
      return
    }

    // Populate localStorage from cloud (so existing loadCanvas() works unchanged)
    // Merge prefs.canvas_order with rows so MCP-created canvases (not in canvas_order) appear in tabs
    const prefOrder = prefs?.canvas_order ?? []
    const prefIds = new Set(prefOrder.map((c) => c.id))
    const missing = rows.filter((r) => !prefIds.has(r.canvas_id)).map((r) => ({ id: r.canvas_id, name: r.name }))
    const canvasList = prefOrder.length ? [...prefOrder, ...missing] : rows.map((r) => ({ id: r.canvas_id, name: r.name }))
    rows.forEach((r) => saveCanvasData(r.canvas_id, { nodes: r.nodes ?? [], edges: r.edges ?? [], views: r.views ?? [], stageTypes: r.stage_types?.length ? r.stage_types : undefined }))
    saveCanvasList(canvasList)
    const activeId = prefs?.active_canvas_id ?? canvasList[0]?.id

    setCanvases(canvasList)
    if (activeId) {
      const activeRow = rows.find((r) => r.canvas_id === activeId)
      const prefetched = activeRow
        ? { nodes: activeRow.nodes ?? [], edges: activeRow.edges ?? [], views: activeRow.views ?? [], stageTypes: activeRow.stage_types?.length ? activeRow.stage_types : undefined }
        : null
      loadCanvas(activeId, prefetched)
    }
  }, [loadCanvas, setCanvases])

  // ── Sharing: refresh the "shared with me" list ────────────────────────────
  const refreshSharedCanvases = useCallback(async () => {
    try {
      setSharedCanvases(await listSharedWithMe())
    } catch (err) {
      console.error('[shares] refreshSharedCanvases:', err.message)
    }
  }, [])

  // Kept fresh every render (not in the auth effect's deps, which stay stable
  // like before) so the auth listener can call the latest closures without
  // re-subscribing on every node/edge edit.
  const sharedFnRef = useRef({})
  useEffect(() => { sharedFnRef.current = { persistCurrent, loadSharedCanvas, refreshSharedCanvases } })

  // ── Auth listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Link share: #share=<token>. Claim immediately if already logged in,
    // otherwise stash it and claim right after SIGNED_IN.
    const hashMatch = location.hash.match(/^#share=(.+)$/)
    if (hashMatch) pendingShareTokenRef.current = hashMatch[1]

    const afterLogin = async (u) => {
      loadFromCloud(u.id)
      try { await claimEmailInvites() } catch (err) { console.error('[shares] claimEmailInvites:', err.message) }

      if (pendingShareTokenRef.current) {
        const token = pendingShareTokenRef.current
        pendingShareTokenRef.current = null
        try {
          const claimed = await claimShareToken(token)
          await sharedFnRef.current.refreshSharedCanvases()
          if (claimed) {
            sharedFnRef.current.persistCurrent()
            sharedFnRef.current.loadSharedCanvas(claimed.owner_id, claimed.canvas_id)
          }
        } catch (err) {
          console.error('[shares] claimShareToken:', err.message)
        }
        history.replaceState(null, '', location.pathname + location.search)
        return
      }

      sharedFnRef.current.refreshSharedCanvases()
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      setUser(u)
      if (u) afterLogin(u)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      setUser(u)
      if (event === 'SIGNED_IN' && u) afterLogin(u)
    })
    return () => subscription.unsubscribe()
  }, [loadFromCloud])

  // ── Realtime: reflect MCP(AI)/other-device writes live ───────────────────
  // Events are treated as signals only — large jsonb payloads can be truncated,
  // so the handler always refetches the row instead of applying payload.new.
  // Requires supabase-realtime.sql (publication + replica identity full).
  useEffect(() => {
    if (!user) return
    const handler = async (payload) => {
      const id = payload.new?.canvas_id ?? payload.old?.canvas_id
      if (!id) return

      if (payload.eventType === 'DELETE') {
        setCanvases((prev) => {
          const next = prev.filter((c) => c.id !== id)
          if (!next.length || next.length === prev.length) return prev
          saveCanvasList(next)
          deleteCanvasData(id)
          if (latestRef.current.activeCanvasId === id) loadCanvas(next[0].id)
          return next
        })
        return
      }

      const { data: row } = await supabase
        .from('canvases')
        .select('name, nodes, edges, views, stage_types')
        .eq('user_id', user.id)
        .eq('canvas_id', id)
        .maybeSingle()
      if (!row) return

      // Keep the tab list in sync (MCP-created canvas / renamed canvas)
      setCanvases((prev) => {
        const cur = prev.find((c) => c.id === id)
        if (cur && cur.name === row.name) return prev
        const next = cur
          ? prev.map((c) => (c.id === id ? { ...c, name: row.name } : c))
          : [...prev, { id, name: row.name }]
        saveCanvasList(next)
        return next
      })

      const mirror = {
        nodes: sortParentsFirst(row.nodes ?? []),
        edges: row.edges ?? [],
        views: row.views ?? [],
        stageTypes: row.stage_types?.length ? row.stage_types : undefined,
      }
      if (latestRef.current.activeCanvasId !== id) {
        saveCanvasData(id, mirror)
        return
      }
      // Active canvas: never clobber an open editor; skip when content is
      // unchanged (this also swallows the echo of our own autosave, since the
      // localStorage mirror is written faster than the echo arrives).
      if (isAnyEditingRef.current) return
      const local = loadCanvasData(id) ?? {}
      if (JSON.stringify({ n: local.nodes ?? [], e: local.edges ?? [] }) ===
          JSON.stringify({ n: mirror.nodes, e: mirror.edges })) return

      isRestoring.current = true
      const nEdges = normalizeEdges(mirror.edges)
      setNodes(mirror.nodes)
      setEdges(nEdges)
      setViews(mirror.views)
      setStageTypes(mirror.stageTypes ?? DEFAULT_STAGE_TYPES)
      counterRef.current = maxNodeId(mirror.nodes)
      // Push (not reset) history so Ctrl+Z can undo a remote change
      const snap = { nodes: mirror.nodes.map(stripNode), edges: nEdges.map(stripEdge) }
      historyStack.current = [...historyStack.current.slice(0, historyPointer.current + 1), snap]
      historyPointer.current = historyStack.current.length - 1
      saveCanvasData(id, mirror)
      setTimeout(() => { isRestoring.current = false }, 400)
    }

    const channel = supabase
      .channel(`canvases-live-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'canvases', filter: `user_id=eq.${user.id}` }, handler)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, loadCanvas, setNodes, setEdges])

  // ── Realtime: mirror the OWNER's canvas while a shared canvas is active ──
  // Same shape as the effect above, but filtered on the owner's user_id
  // (invitees don't have their own row for this canvas) and scoped to just
  // the one shared canvas currently open — it doesn't touch the tab list.
  useEffect(() => {
    if (!user) return
    const shared = parseSharedId(activeCanvasId)
    if (!shared) return
    const { ownerId, canvasId } = shared

    const handler = async (payload) => {
      const id = payload.new?.canvas_id ?? payload.old?.canvas_id
      if (id !== canvasId || payload.eventType === 'DELETE') return

      const { data: row } = await supabase
        .from('canvases')
        .select('nodes, edges, views, stage_types')
        .eq('user_id', ownerId)
        .eq('canvas_id', canvasId)
        .maybeSingle()
      if (!row) return

      const mirror = {
        nodes: sortParentsFirst(row.nodes ?? []),
        edges: row.edges ?? [],
        views: row.views ?? [],
        stageTypes: row.stage_types?.length ? row.stage_types : undefined,
      }
      if (isAnyEditingRef.current) return
      const local = loadCanvasData(activeCanvasId) ?? {}
      if (JSON.stringify({ n: local.nodes ?? [], e: local.edges ?? [] }) ===
          JSON.stringify({ n: mirror.nodes, e: mirror.edges })) return

      isRestoring.current = true
      const nEdges = normalizeEdges(mirror.edges)
      setNodes(mirror.nodes)
      setEdges(nEdges)
      setViews(mirror.views)
      setStageTypes(mirror.stageTypes ?? DEFAULT_STAGE_TYPES)
      counterRef.current = maxNodeId(mirror.nodes)
      const snap = { nodes: mirror.nodes.map(stripNode), edges: nEdges.map(stripEdge) }
      historyStack.current = [...historyStack.current.slice(0, historyPointer.current + 1), snap]
      historyPointer.current = historyStack.current.length - 1
      saveCanvasData(activeCanvasId, mirror)
      setTimeout(() => { isRestoring.current = false }, 400)
    }

    const channel = supabase
      .channel(`shared-canvas-live-${ownerId}-${canvasId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'canvases', filter: `user_id=eq.${ownerId}` }, handler)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [user, activeCanvasId, setNodes, setEdges])

  // ── Presence: who else is viewing the active canvas ───────────────────────
  useEffect(() => {
    if (!user || !activeCanvasId) { setOnlineUsers([]); return }
    const shared = parseSharedId(activeCanvasId)
    const ownerId = shared ? shared.ownerId : user.id
    const canvasId = shared ? shared.canvasId : activeCanvasId
    const { unsubscribe } = joinCanvasPresence({ ownerId, canvasId, user, onlineRef_or_callback: setOnlineUsers })
    return () => { unsubscribe(); setOnlineUsers([]) }
  }, [user, activeCanvasId])

  // ── Cloud auto-save (debounced 1.5 s, only when logged in) ───────────────
  const cloudSaveTimer = useRef(null)
  useEffect(() => {
    if (!user) return
    clearTimeout(cloudSaveTimer.current)
    cloudSaveTimer.current = setTimeout(async () => {
      const { canvases: cvs, activeCanvasId: aid, stageTypes: types, views: vws } = latestRef.current
      const snapshot = { nodes: nodes.map(stripNode), edges: edges.map(stripEdge) }
      const shared = parseSharedId(aid)

      // Shared canvas: invitee saves land directly on the owner's row —
      // nodes/edges only, never name or user_prefs (those are owner-only).
      if (shared) {
        const payload = JSON.stringify({ aid, nodes: snapshot.nodes, edges: snapshot.edges })
        if (payload === lastPushedCanvasRef.current) return
        setCloudSyncing(true)
        try {
          await cloudUpdateSharedCanvas(shared.ownerId, shared.canvasId, snapshot.nodes, snapshot.edges)
          lastPushedCanvasRef.current = payload
        } catch (err) {
          console.error('[cloud] shared autosave:', err.message)
        }
        setCloudSyncing(false)
        return
      }

      const name = cvs.find((c) => c.id === aid)?.name ?? '캔버스'
      // Dirty-check: skip writes whose payload didn't change since the last
      // push. An idle browser must not keep rewriting the row — that would
      // clobber concurrent MCP(AI) writes with stale local state.
      const canvasPayload = JSON.stringify({ aid, name, nodes: snapshot.nodes, edges: snapshot.edges, vws, types })
      const prefsPayload = JSON.stringify({ aid, cvs })
      const jobs = []
      if (canvasPayload !== lastPushedCanvasRef.current) {
        jobs.push(cloudSaveCanvas(user.id, aid, name, snapshot.nodes, snapshot.edges, vws, types)
          .then(() => { lastPushedCanvasRef.current = canvasPayload }))
      }
      if (prefsPayload !== lastPushedPrefsRef.current) {
        jobs.push(cloudSaveUserPrefs(user.id, { active_canvas_id: aid, canvas_order: cvs })
          .then(() => { lastPushedPrefsRef.current = prefsPayload }))
      }
      if (!jobs.length) return
      setCloudSyncing(true)
      try {
        await Promise.all(jobs)
      } catch (err) {
        console.error('[cloud] autosave:', err.message)
      }
      setCloudSyncing(false)
    }, 1500)
    return () => clearTimeout(cloudSaveTimer.current)
  }, [user, nodes, edges, stageTypes, canvases, activeCanvasId, views])

  // ── Sharing: permission model for the active canvas ───────────────────────
  // Own canvases (and canvases before any share info has loaded) are always
  // full-edit 'owner'. A shared composite activeCanvasId resolves to whichever
  // matching share is most permissive (canvas > group > node).
  const perm = useMemo(() => {
    const parsed = parseSharedId(activeCanvasId)
    if (!parsed) return { role: 'owner', scope: 'canvas', targetId: null, restrictView: false }
    const matches = sharedCanvases.filter((s) => s.ownerId === parsed.ownerId && s.canvasId === parsed.canvasId)
    if (!matches.length) return { role: 'owner', scope: 'canvas', targetId: null, restrictView: false }
    const priority = { canvas: 0, group: 1, node: 2 }
    const best = [...matches].sort((a, b) => priority[a.scope] - priority[b.scope])[0]
    return { role: 'invitee', scope: best.scope, targetId: best.targetId, restrictView: best.restrictView }
  }, [activeCanvasId, sharedCanvases])

  // Kept fresh every render so the touch long-press gesture handler (bound
  // once, high up in the file, well before `perm` exists) can read the
  // current permission without needing to be in that effect's deps.
  const permRef = useRef(perm)
  useEffect(() => { permRef.current = perm })

  // Set of node ids an invitee may edit; null means "everything" (owner or canvas-scope).
  const editableSet = useMemo(() => {
    if (perm.role === 'owner' || perm.scope === 'canvas') return null
    if (perm.scope === 'group') return new Set(nodes.filter((n) => n.parentId === perm.targetId).map((n) => n.id))
    if (perm.scope === 'node') return new Set([perm.targetId])
    return new Set()
  }, [perm, nodes])
  const isNodeEditable = useCallback((id) => editableSet === null || editableSet.has(id), [editableSet])

  // Someone other than me online in the active canvas → glow the invite icons.
  const presenceGlow = user ? onlineUsers.some((u) => u.user_id !== user.id) : false

  // Open the invite popover near the icon that was clicked, clamped to the viewport.
  const openInvite = useCallback((scope, targetId, anchorRect) => {
    const POPOVER_W = 280, POPOVER_H = 340
    let x = anchorRect ? anchorRect.left : window.innerWidth / 2 - POPOVER_W / 2
    let y = anchorRect ? anchorRect.bottom + 6 : window.innerHeight / 2 - POPOVER_H / 2
    x = Math.min(Math.max(8, x), window.innerWidth - POPOVER_W - 8)
    y = Math.min(Math.max(8, y), window.innerHeight - POPOVER_H - 8)
    setInvite({ scope, targetId, x, y })
  }, [])

  // Dedupe sharedCanvases (which can hold multiple distinct scope/target
  // entries per canvas) down to one tab row per owner+canvas.
  const sharedCanvasList = useMemo(() => {
    const seen = new Map()
    sharedCanvases.forEach((s) => {
      const key = `${s.ownerId}:${s.canvasId}`
      if (!seen.has(key)) seen.set(key, { id: sharedCanvasId(s.ownerId, s.canvasId), name: s.name })
    })
    return Array.from(seen.values())
  }, [sharedCanvases])

  // restrict_view: clamp the invitee's viewport to the invited region (canvas scope has no region).
  const restrictBounds = useMemo(() => {
    if (perm.role !== 'invitee' || !perm.restrictView || perm.scope === 'canvas' || !perm.targetId) return null
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const target = byId.get(perm.targetId)
    if (!target) return null
    const { x, y } = absolutePosition(target, byId)
    const w = target.measured?.width ?? target.width ?? 200
    const h = target.measured?.height ?? target.height ?? 80
    const MARGIN = 200
    return [[x - MARGIN, y - MARGIN], [x + w + MARGIN, y + h + MARGIN]]
  }, [perm, nodes])

  // Fit the viewport to the restricted region once, when entering it (not on every edit).
  useEffect(() => {
    if (!rfInstance || !restrictBounds) return
    const [[minX, minY], [maxX, maxY]] = restrictBounds
    rfInstance.fitBounds({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, { padding: 0, duration: 0 })
  }, [rfInstance, activeCanvasId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Node data ────────────────────────────────────────────────────────────
  const updateNodeData = useCallback((id, patch) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
  }, [setNodes])

  // ── Stage type management ─────────────────────────────────────────────────
  // Apply a stage type to one or many nodes (memo nodes are left untouched).
  const changeNodeStageType = useCallback((ids, typeIdx) => {
    const set = new Set(ids)
    setNodes((nds) => nds.map((n) => (set.has(n.id) && n.type === 'stage') ? { ...n, data: { ...n.data, colorIdx: typeIdx } } : n))
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
    setRenameValue('') // start blank so there's no default text to delete
  }, [stageTypes.length])

  // ── Add nodes ─────────────────────────────────────────────────────────────
  // Group-scope invitees can only add inside their invited frame (forced
  // parentId + a position inside it); node-scope invitees can't add at all.
  const addStage = useCallback(() => {
    if (perm.role === 'invitee' && perm.scope === 'node') return
    const id = nextId()
    if (perm.role === 'invitee' && perm.scope === 'group') {
      const frame = nodes.find((n) => n.id === perm.targetId)
      if (!frame) return
      setNodes((nds) => [...nds, { id, type: 'stage', parentId: perm.targetId, position: centerInFrame(frame, 200, 80), data: { label: '새 단계', description: '', colorIdx: 0 } }])
      return
    }
    setNodes((nds) => [...nds, { id, type: 'stage', position: { x: 200 + Math.random() * 400, y: 150 + Math.random() * 300 }, data: { label: '새 단계', description: '', colorIdx: 0 } }])
  }, [setNodes, perm, nodes])

  const addMemo = useCallback(() => {
    if (perm.role === 'invitee' && perm.scope === 'node') return
    const id = nextId()
    if (perm.role === 'invitee' && perm.scope === 'group') {
      const frame = nodes.find((n) => n.id === perm.targetId)
      if (!frame) return
      setNodes((nds) => [...nds, { id, type: 'memo', parentId: perm.targetId, position: centerInFrame(frame, 160, 80), data: { header: '', text: '' } }])
      return
    }
    setNodes((nds) => [...nds, { id, type: 'memo', position: { x: 300 + Math.random() * 400, y: 200 + Math.random() * 200 }, data: { header: '', text: '' } }])
  }, [setNodes, perm, nodes])

  const addStageAt = useCallback((pos) => {
    const id = nextId()
    setNodes((nds) => [...nds, { id, type: 'stage', position: pos, data: { label: '새 단계', description: '', colorIdx: 0 } }])
  }, [setNodes])

  const addMemoAt = useCallback((pos) => {
    const id = nextId()
    setNodes((nds) => [...nds, { id, type: 'memo', position: pos, data: { header: '', text: '' } }])
  }, [setNodes])

  // ── Copy / Paste (in-app clipboard, not the OS clipboard) ─────────────────
  const clipboardRef = useRef(null) // { nodes, edges } — stripped copies, original ids
  const pasteCountRef = useRef(0) // repeated pastes offset further each time

  const copySelection = useCallback(() => {
    const selected = nodes.filter((n) => n.selected)
    if (!selected.length) return
    const byId = new Map(nodes.map((n) => [n.id, n]))
    // A selected group frame brings its children along even if they weren't
    // individually selected — copying a group should copy its contents.
    const groupIds = new Set(selected.filter((n) => n.type === 'group').map((n) => n.id))
    const toCopy = new Map(selected.map((n) => [n.id, n]))
    nodes.forEach((n) => { if (n.parentId && groupIds.has(n.parentId)) toCopy.set(n.id, n) })

    const copiedNodes = Array.from(toCopy.values()).map((n) => {
      const stripped = stripNode(n)
      if (stripped.parentId && !toCopy.has(stripped.parentId)) {
        // Parent frame isn't part of the copy — fall back to absolute position.
        const { parentId, ...rest } = stripped
        return { ...rest, position: absolutePosition(n, byId) }
      }
      return stripped
    })
    const copiedIds = new Set(copiedNodes.map((n) => n.id))
    const copiedEdges = edges.filter((e) => copiedIds.has(e.source) && copiedIds.has(e.target)).map(stripEdge)

    clipboardRef.current = { nodes: copiedNodes, edges: copiedEdges }
    pasteCountRef.current = 0
  }, [nodes, edges])

  // Remap a part handle id ('p-<partId>-l'/'-r') through partIdMap; plain port
  // ids (left/right/top/bottom) are shared across nodes and stay untouched.
  const remapPartHandle = (handle, partIdMap) => {
    if (!handle || !handle.startsWith('p-')) return handle
    const m = handle.match(/^p-(.+)-(l|r)$/)
    if (!m) return handle
    const newPartId = partIdMap.get(m[1])
    return newPartId ? `p-${newPartId}-${m[2]}` : handle
  }

  const pasteClipboard = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip || !clip.nodes.length) return
    if (perm.role === 'invitee' && perm.scope === 'node') return // nowhere to paste
    const forceFrame = perm.role === 'invitee' && perm.scope === 'group'
    const frame = forceFrame ? nodes.find((n) => n.id === perm.targetId) : null
    if (forceFrame && !frame) return

    pasteCountRef.current += 1
    const offset = 40 * pasteCountRef.current

    const idMap = new Map()
    clip.nodes.forEach((n) => idMap.set(n.id, nextId()))
    const partIdMap = new Map()
    clip.nodes.forEach((n) => (n.data?.parts ?? []).forEach((p) => partIdMap.set(p.id, `pt-${uid()}`)))

    const newNodes = clip.nodes.map((n) => {
      const hasCopiedParent = !!(n.parentId && idMap.has(n.parentId))
      let parentId = hasCopiedParent ? idMap.get(n.parentId) : undefined
      let position = hasCopiedParent ? { ...n.position } : { x: n.position.x + offset, y: n.position.y + offset }

      if (forceFrame && !hasCopiedParent) {
        parentId = perm.targetId
        position = centerInFrame(frame, n.measured?.width ?? n.width ?? 200, n.measured?.height ?? n.height ?? 80)
      }

      const parts = n.data?.parts ? n.data.parts.map((p) => ({ ...p, id: partIdMap.get(p.id) ?? p.id })) : undefined
      const { parentId: _drop, ...rest } = n

      return {
        ...rest,
        id: idMap.get(n.id),
        position,
        ...(parentId ? { parentId } : {}),
        selected: true,
        data: parts ? { ...n.data, parts } : n.data,
      }
    })

    const newEdges = clip.edges.map((e) => ({
      ...e,
      id: `e-${uid()}`,
      source: idMap.get(e.source),
      target: idMap.get(e.target),
      sourceHandle: remapPartHandle(e.sourceHandle, partIdMap),
      targetHandle: remapPartHandle(e.targetHandle, partIdMap),
      selected: false,
    }))

    setNodes((nds) => sortParentsFirst([...nds.map((n) => (n.selected ? { ...n, selected: false } : n)), ...newNodes]))
    setEdges((eds) => eds.concat(newEdges))
  }, [nodes, setNodes, setEdges, perm])

  useEffect(() => {
    const handler = (e) => {
      if (!(e.metaKey || e.ctrlKey)) return
      if (isAnyEditingRef.current || isTypingTarget()) return
      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault()
        copySelection()
      } else if (e.key === 'v' || e.key === 'V') {
        e.preventDefault()
        pasteClipboard()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [copySelection, pasteClipboard])

  // ── Connect ───────────────────────────────────────────────────────────────
  // Each connection gets a unique id and is appended directly (instead of via
  // addEdge, which dedupes by source/target handle) so a single connection
  // point can spawn multiple edges — including several to the same node, which
  // the parallel-separation routing then fans out.
  const onConnect = useCallback((params) => {
    if (perm.role === 'invitee' && (!isNodeEditable(params.source) || !isNodeEditable(params.target))) return
    const isMemoSource = nodes.find((n) => n.id === params.source)?.type === 'memo'
    const isMemoTarget = nodes.find((n) => n.id === params.target)?.type === 'memo'
    const isMemo = isMemoSource || isMemoTarget
    const newEdge = {
      ...params,
      id: `e-${uid()}`,
      style: isMemo ? { stroke: '#f59e0b88', strokeWidth: 2.25, strokeDasharray: '5,4' } : { stroke: '#4a4a5a', strokeWidth: 3 },
      markerEnd: { type: MarkerType.ArrowClosed, color: isMemo ? '#f59e0b88' : '#4a4a5a' },
    }
    setEdges((eds) => eds.concat(newEdge))
  }, [nodes, setEdges, perm, isNodeEditable])

  // ── Reconnect: drag an edge endpoint onto another node/handle ──────────────
  const onReconnectStart = useCallback(() => {
    setReconnecting(true)
  }, [])

  const onReconnect = useCallback((oldEdge, newConnection) => {
    if (perm.role === 'invitee' && (!isNodeEditable(newConnection.source) || !isNodeEditable(newConnection.target))) return
    // Reconnect the clean edge from state, not the styled (bold) object React
    // Flow hands back — otherwise the selection styling gets baked in permanently.
    setEdges((eds) => {
      const clean = eds.find((e) => e.id === oldEdge.id) ?? oldEdge
      return reconnectEdge(clean, newConnection, eds)
    })
  }, [setEdges, perm, isNodeEditable])

  // ── Alignment guides (Obsidian-style): while dragging a node, compare its
  // absolute edges/center against every other visible node's and snap +
  // draw a guide line when within ALIGN_SNAP px. Bails out on large canvases.
  const ALIGN_SNAP = 6
  const ALIGN_MAX_NODES = 150
  const computeAlignSnap = useCallback((dragged) => {
    if (nodes.length > ALIGN_MAX_NODES) return null
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const dim = (n) => ({ w: n.measured?.width ?? n.width ?? 0, h: n.measured?.height ?? n.height ?? 0 })
    const findAxisSnap = (draggedVals, neighborVals) => {
      for (const dv of draggedVals) {
        for (const nv of neighborVals) {
          if (Math.abs(dv - nv) <= ALIGN_SNAP) return { delta: nv - dv, guide: nv }
        }
      }
      return null
    }

    const dd = dim(dragged)
    const dPos = absolutePosition(dragged, byId)
    const dXs = [dPos.x, dPos.x + dd.w / 2, dPos.x + dd.w] // left, centerX, right
    const dYs = [dPos.y, dPos.y + dd.h / 2, dPos.y + dd.h] // top, centerY, bottom

    let xSnap = null
    let ySnap = null
    for (const n of nodes) {
      if (n.id === dragged.id) continue
      const nd = dim(n)
      const nPos = absolutePosition(n, byId)
      if (!xSnap) xSnap = findAxisSnap(dXs, [nPos.x, nPos.x + nd.w / 2, nPos.x + nd.w])
      if (!ySnap) ySnap = findAxisSnap(dYs, [nPos.y, nPos.y + nd.h / 2, nPos.y + nd.h])
      if (xSnap && ySnap) break
    }
    if (!xSnap && !ySnap) return null
    return { xSnap, ySnap }
  }, [nodes])

  const onNodeDrag = useCallback((_e, n) => {
    const snap = computeAlignSnap(n)
    if (!snap) { setAlignGuides([]); return }
    const { xSnap, ySnap } = snap
    setNodes((nds) => nds.map((nn) => {
      if (nn.id !== n.id) return nn
      return {
        ...nn,
        position: {
          x: xSnap ? nn.position.x + xSnap.delta : nn.position.x,
          y: ySnap ? nn.position.y + ySnap.delta : nn.position.y,
        },
      }
    }))
    const guides = []
    if (xSnap) guides.push({ axis: 'x', value: xSnap.guide })
    if (ySnap) guides.push({ axis: 'y', value: ySnap.guide })
    setAlignGuides(guides)
  }, [computeAlignSnap, setNodes])

  const onNodeDragStop = useCallback(() => {
    setAlignGuides([])
  }, [])

  // Clicking a node bolds every edge connected to it (reuses the same
  // selected-edge bold styling as clicking an edge directly — see styledEdges).
  const onNodeClick = useCallback((_e, node) => {
    setEdges((eds) => eds.map((e) => ({
      ...e,
      selected: e.source === node.id || e.target === node.id,
    })))
  }, [setEdges])

  // ── Context menus ─────────────────────────────────────────────────────────
  const onPaneContextMenu = useCallback((e) => {
    e.preventDefault()
    // Group/node-scope invitees can't add nodes "elsewhere" on the pane —
    // there's nothing this menu could offer them, so don't open it.
    if (perm.role === 'invitee' && perm.scope !== 'canvas') return
    const bounds = reactFlowRef.current?.getBoundingClientRect()
    setContextMenu({ x: e.clientX, y: e.clientY, flowX: e.clientX - (bounds?.left ?? 0), flowY: e.clientY - (bounds?.top ?? 0) })
    setRenamingTypeIdx(null)
  }, [perm])

  const onNodeContextMenu = useCallback((e, node) => {
    e.preventDefault()
    e.stopPropagation()
    const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id)
    setContextMenu({ x: e.clientX, y: e.clientY, nodeId: node.id, nodeType: node.type, selectedIds })
    setRenamingTypeIdx(null)
  }, [nodes])

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
    const ids = contextMenu.selectedIds?.length ? contextMenu.selectedIds : [contextMenu.nodeId]
    if (perm.role === 'invitee' && perm.scope !== 'canvas' && !ids.every(isNodeEditable)) { closeContext(); return }
    const set = new Set(ids)
    setNodes((nds) => nds.filter((n) => !set.has(n.id)))
    setEdges((eds) => eds.filter((e) => !set.has(e.source) && !set.has(e.target)))
    closeContext()
  }

  const handleContextDeleteEdge = () => {
    if (!contextMenu?.edgeId) return
    const edge = edges.find((e) => e.id === contextMenu.edgeId)
    if (perm.role === 'invitee' && edge && (!isNodeEditable(edge.source) || !isNodeEditable(edge.target))) { closeContext(); return }
    setEdges((eds) => eds.filter((e) => e.id !== contextMenu.edgeId))
    closeContext()
  }

  const handleContextGroupSelection = () => {
    if (perm.role === 'invitee' && perm.scope !== 'canvas') return
    const ids = contextMenu?.selectedIds ?? []
    if (ids.length < 2) return
    groupSelection(ids)
    closeContext()
  }

  // "⇢ 연결선 정리": recompute both handles (nearest-side) for every edge
  // touching any selected node. Skips part-anchored edges (fixed rows) and,
  // for invitees, edges whose endpoints aren't both in their editable set.
  const handleContextCleanupEdges = () => {
    const ids = contextMenu?.selectedIds?.length ? contextMenu.selectedIds : (contextMenu?.nodeId ? [contextMenu.nodeId] : [])
    if (!ids.length) { closeContext(); return }
    const idSet = new Set(ids)
    const byId = new Map(nodes.map((n) => [n.id, n]))
    setEdges((eds) => eds.map((e) => {
      if (!idSet.has(e.source) && !idSet.has(e.target)) return e
      if (e.sourceHandle?.startsWith('p-') || e.targetHandle?.startsWith('p-')) return e
      if (perm.role === 'invitee' && (!isNodeEditable(e.source) || !isNodeEditable(e.target))) return e
      const sourceNode = byId.get(e.source)
      const targetNode = byId.get(e.target)
      if (!sourceNode || !targetNode) return e
      const { sourceHandle, targetHandle } = closestHandles(sourceNode, targetNode, byId)
      return { ...e, sourceHandle, targetHandle }
    }))
    closeContext()
  }

  const handleContextUngroup = () => {
    if (!contextMenu?.nodeId) return
    if (perm.role === 'invitee' && perm.scope !== 'canvas') return
    ungroup(contextMenu.nodeId)
    closeContext()
  }

  const clearAll = useCallback(() => {
    if (perm.role === 'invitee') return
    if (window.confirm('현재 캔버스의 모든 노드와 연결을 삭제할까요?')) { setNodes([]); setEdges([]) }
  }, [setNodes, setEdges, perm])

  const fitView = useCallback(() => {
    rfInstance?.fitView({ padding: 0.1, duration: 500 })
  }, [rfInstance])

  // ── Saved views ───────────────────────────────────────────────────────────
  // Compute the bounding box (in flow coords) of the given node ids.
  const boundsOf = useCallback((ids) => {
    const sel = nodes.filter((n) => ids.includes(n.id))
    if (!sel.length) return null
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    sel.forEach((n) => {
      const w = n.measured?.width ?? n.width ?? 0
      const h = n.measured?.height ?? n.height ?? 0
      minX = Math.min(minX, n.position.x)
      minY = Math.min(minY, n.position.y)
      maxX = Math.max(maxX, n.position.x + w)
      maxY = Math.max(maxY, n.position.y + h)
    })
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
  }, [nodes])

  // ── Groups (Obsidian-style frames) ────────────────────────────────────────
  // Wrap the given node ids in a new group frame sized to their bounding box
  // (+ padding), reparenting them with positions converted to relative coords.
  const groupSelection = useCallback((ids) => {
    const bounds = boundsOf(ids)
    if (!bounds) return
    const PAD = 40
    const TOP_PAD = 36
    const gx = bounds.x - PAD
    const gy = bounds.y - PAD - TOP_PAD
    const gw = bounds.width + PAD * 2
    const gh = bounds.height + PAD * 2 + TOP_PAD
    const groupId = nextId()
    const groupNode = {
      id: groupId, type: 'group', position: { x: gx, y: gy },
      width: gw, height: gh, zIndex: -1, data: { label: '새 그룹' },
    }
    const idSet = new Set(ids)
    setNodes((nds) => {
      // Parent nodes must precede their children in the array (React Flow requirement).
      const others = nds.filter((n) => !idSet.has(n.id))
      const children = nds.filter((n) => idSet.has(n.id)).map((n) => ({
        ...n,
        parentId: groupId,
        position: { x: n.position.x - gx, y: n.position.y - gy },
      }))
      return [...others, groupNode, ...children]
    })
  }, [boundsOf, setNodes])

  // Remove a group frame, converting its children back to absolute positions
  // and dropping their parentId. Used by both "그룹 해제" and "그룹 삭제".
  const ungroup = useCallback((groupId) => {
    setNodes((nds) => {
      const group = nds.find((n) => n.id === groupId)
      if (!group) return nds
      const { x: gx, y: gy } = group.position
      return nds
        .filter((n) => n.id !== groupId)
        .map((n) => {
          if (n.parentId !== groupId) return n
          const { parentId, ...rest } = n
          return { ...rest, position: { x: n.position.x + gx, y: n.position.y + gy } }
        })
    })
  }, [setNodes])

  const saveViewFromSelection = useCallback((ids) => {
    const bounds = boundsOf(ids)
    if (!bounds || !rfInstance) return
    rfInstance.fitBounds(bounds, { padding: 0.15, duration: 500 })
    setViews((prev) => [...prev, { id: uid(), name: `뷰 ${prev.length + 1}`, bounds }])
  }, [boundsOf, rfInstance])

  const recallView = useCallback((view) => {
    rfInstance?.fitBounds(view.bounds, { padding: 0.15, duration: 500 })
  }, [rfInstance])

  // Toolbar selector: null = fit all, otherwise recall the chosen view.
  const selectView = useCallback((id) => {
    if (id == null) { setCurrentViewId(null); fitView(); return }
    const v = views.find((x) => x.id === id)
    if (!v) return
    setCurrentViewId(id)
    recallView(v)
  }, [views, fitView, recallView])

  const renameView = useCallback((id, name) => {
    if (!name.trim()) return
    setViews((prev) => prev.map((v) => (v.id === id ? { ...v, name: name.trim() } : v)))
  }, [])

  const deleteView = useCallback((id) => {
    setViews((prev) => prev.filter((v) => v.id !== id))
    setCurrentViewId((cur) => (cur === id ? null : cur))
  }, [])

  // ── Selected-edge highlight ───────────────────────────────────────────────
  // Non-selected edges get a forced base style so baked-in bold can never linger.
  // Selected edges get reconnectable + bold stroke + drop-shadow + colored marker.
  const styledEdges = edges.map((e) => {
    // Delete key / built-in delete UI must also respect the edit gating.
    const deletable = perm.role === 'owner' || perm.scope === 'canvas' || (isNodeEditable(e.source) && isNodeEditable(e.target))
    const pathOptions = { curvature: 0.45 }
    if (!e.selected) return { ...e, ...baseEdgeStyle(e), deletable, pathOptions }
    const isMemo = !!e.style?.strokeDasharray
    const color = isMemo ? '#f59e0b' : '#60a5fa'
    return {
      ...e,
      deletable,
      pathOptions,
      // Only a selected (bold) edge can be snatched/reconnected.
      reconnectable: true,
      zIndex: 1001,
      style: { ...baseEdgeStyle(e).style, stroke: color, strokeWidth: isMemo ? 3.5 : 4.5, filter: `drop-shadow(0 0 6px ${color}88)` },
      markerEnd: { type: MarkerType.ArrowClosed, color },
    }
  })

  // ── Commit rename on context menu close ───────────────────────────────────
  const commitRename = () => {
    if (renamingTypeIdx !== null) renameStageType(renamingTypeIdx, renameValue)
    setRenamingTypeIdx(null)
  }

  // ── Keep the context menu on screen ───────────────────────────────────────
  // Default: opens down-right of the tap. If it would be clipped, flip so it
  // opens up / left instead.
  const menuRef = useRef(null)
  const [menuPos, setMenuPos] = useState({ left: 0, top: 0 })
  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) return
    const { width, height } = menuRef.current.getBoundingClientRect()
    const pad = 8
    let left = contextMenu.x
    let top = contextMenu.y
    if (left + width > window.innerWidth - pad) left = Math.max(pad, contextMenu.x - width)
    if (top + height > window.innerHeight - pad) top = Math.max(pad, contextMenu.y - height)
    setMenuPos({ left, top })
  }, [contextMenu])

  // Resolve which nodes the node-context-menu acts on, and whether it's a
  // multi-selection (so labels can say "전체 …").
  const ctxIds = contextMenu?.selectedIds?.length ? contextMenu.selectedIds : (contextMenu?.nodeId ? [contextMenu.nodeId] : [])
  const ctxMulti = (contextMenu?.selectedIds?.length ?? 0) >= 2

  // Sharing: canvas-scope invitees get full edit (including stage-type
  // editing); group/node-scope invitees only touch nodes in their editable set.
  const ctxFullEdit = perm.role === 'owner' || perm.scope === 'canvas'
  const ctxCanDelete = ctxFullEdit || ctxIds.every(isNodeEditable)
  const ctxEdgeEditable = contextMenu?.edgeId
    ? (() => { const e = edges.find((x) => x.id === contextMenu.edgeId); return ctxFullEdit || (e && isNodeEditable(e.source) && isNodeEditable(e.target)) })()
    : false

  return (
    <div
      style={{ width: '100vw', height: '100vh', position: 'relative' }}
      onClick={(e) => {
        commitRename()
        closeContext()
        // React Flow only deselects edges when clicking inside its own pane.
        // Clicks on toolbar / tabs / panels don't reach React Flow, so we
        // explicitly clear edge selection whenever the click lands outside a
        // node or edge element.
        if (!e.target.closest('.react-flow__edge') && !e.target.closest('.react-flow__node')) {
          setEdges((eds) => eds.some((ed) => ed.selected) ? eds.map((ed) => ({ ...ed, selected: false })) : eds)
        }
      }}
    >
      <CanvasTabs
        canvases={canvases}
        activeId={activeCanvasId}
        onSwitch={switchCanvas}
        onAdd={addCanvas}
        onRename={renameCanvas}
        onDelete={deleteCanvas}
        mobile={mobile}
        sharedCanvases={sharedCanvasList}
        onInvite={openInvite}
        presenceGlow={presenceGlow}
      />

      <Toolbar
        onAddStage={addStage}
        onAddMemo={addMemo}
        onClearAll={clearAll}
        onUndo={undo}
        mobile={mobile}
        views={views}
        currentViewId={currentViewId}
        onSelectView={selectView}
        onRenameView={renameView}
        onDeleteView={deleteView}
        lodThreshold={lodThreshold}
        onChangeLodThreshold={(v) => { setLodThreshold(v); saveLodThreshold(v) }}
      />

      <AuthPanel user={user} syncing={cloudSyncing} mobile={mobile} />

      {invite && (
        <div style={{ position: 'fixed', left: invite.x, top: invite.y, zIndex: 1000 }} onClick={(e) => e.stopPropagation()}>
          <InvitePopover
            scope={invite.scope}
            targetId={invite.targetId}
            canvasId={activeCanvasId}
            onClose={() => setInvite(null)}
            onlineUserIds={new Set(onlineUsers.map((u) => u.user_id))}
          />
        </div>
      )}

      <ReactFlow
        ref={reactFlowRef}
        className={reconnecting ? 'rf-reconnecting' : undefined}
        nodes={nodes.map((n) => {
          const isOwner = perm.role === 'owner'
          // Only group/node scopes carve out a restricted subset of nodes;
          // canvas-scope invitees get full edit, same as owner (left as
          // React Flow defaults so the isAnyEditing/isPinching global drag
          // gate above still applies to them).
          const restrictedScope = !isOwner && (perm.scope === 'group' || perm.scope === 'node')
          const editable = restrictedScope ? isNodeEditable(n.id) : true
          const isNodeScopeTarget = restrictedScope && perm.scope === 'node' && n.id === perm.targetId
          const overrides = restrictedScope
            ? { draggable: editable && !isNodeScopeTarget, deletable: editable && !isNodeScopeTarget, selectable: editable }
            : {}
          return {
            ...n,
            ...overrides,
            data: {
              ...n.data,
              stageTypes,
              lodThreshold,
              readOnly: restrictedScope && !editable,
              canInvite: isOwner,
              presenceGlow,
              onInvite: isOwner ? openInvite : undefined,
              onUpdate: (patch) => updateNodeData(n.id, patch),
              onEditStart: () => setIsAnyEditing(true),
              onEditEnd: () => setIsAnyEditing(false),
              onLongPress: (clientX, clientY) => {
                const selectedIds = nodes.filter((x) => x.selected).map((x) => x.id)
                setContextMenu({ x: clientX, y: clientY, nodeId: n.id, nodeType: n.type, selectedIds })
                setRenamingTypeIdx(null)
              },
            },
          }
        })}
        edges={styledEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onReconnect={onReconnect}
        onReconnectStart={onReconnectStart}
        onReconnectEnd={() => setReconnecting(false)}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onNodeClick={onNodeClick}
        onInit={setRfInstance}
        nodeTypes={nodeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onPaneClick={() => {
          setEdges((eds) => eds.some((e) => e.selected) ? eds.map((e) => ({ ...e, selected: false })) : eds)
        }}
        nodesDraggable={!isAnyEditing && !isPinching}
        snapToGrid
        snapGrid={[12, 12]}
        translateExtent={restrictBounds ?? undefined}
        edgesReconnectable={false}
        reconnectRadius={mobile ? 40 : 20}
        connectionMode="loose"
        connectionRadius={0}
        panOnDrag={false}
        multiSelectionKeyCode={['Shift', 'Meta', 'Control']}
        panOnScroll={false}
        zoomOnPinch={false}
        zoomOnScroll={false}
        zoomOnDoubleClick={false}
        elevateEdgesOnSelect
        fitView
        fitViewOptions={{ padding: 0.15 }}
        minZoom={0.1}
        maxZoom={2}
        deleteKeyCode={['Delete', 'Backspace']}
        style={{ background: '#0f0f13' }}
      >
        <Background id="minor" variant={BackgroundVariant.Lines} gap={24} color="#ffffff07" />
        <Background id="major" variant={BackgroundVariant.Lines} gap={120} color="#ffffff0d" />
        {!mobile && <Controls style={{ background: '#1a1a22', border: '1px solid #ffffff18', borderRadius: 8 }} />}
        {!mobile && (
          <MiniMap
            nodeColor={(n) => (n.type === 'memo' ? '#f59e0b88' : n.type === 'group' ? '#8b94a733' : '#3b82f688')}
            maskColor="#0f0f1388"
            style={{ background: '#1a1a22', border: '1px solid #ffffff18', borderRadius: 8 }}
          />
        )}
      </ReactFlow>

      <HelpPanel mobile={mobile} />

      {/* ── Selection rubber-band (long-press drag) ──────────────────────── */}
      {lassoRect && (
        <div
          style={{
            position: 'fixed',
            left: lassoRect.x,
            top: lassoRect.y,
            width: lassoRect.w,
            height: lassoRect.h,
            border: '1.5px solid #3b82f6',
            background: '#3b82f622',
            borderRadius: 2,
            zIndex: 6,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* ── Alignment guides (shown while dragging a node near another) ───── */}
      {rfInstance && alignGuides.map((g, i) => {
        if (g.axis === 'x') {
          const sx = rfInstance.flowToScreenPosition({ x: g.value, y: 0 }).x
          return (
            <div
              key={i}
              style={{ position: 'fixed', left: sx, top: 0, width: 1, height: '100vh', background: '#06b6d4', zIndex: 6, pointerEvents: 'none' }}
            />
          )
        }
        const sy = rfInstance.flowToScreenPosition({ x: 0, y: g.value }).y
        return (
          <div
            key={i}
            style={{ position: 'fixed', left: 0, top: sy, width: '100vw', height: 1, background: '#06b6d4', zIndex: 6, pointerEvents: 'none' }}
          />
        )
      })}

      {/* ── Context Menu ─────────────────────────────────────────────────── */}
      {contextMenu && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            zIndex: 1000,
            background: '#1e1e2a',
            border: '1px solid #ffffff22',
            borderRadius: 10,
            padding: '6px',
            boxShadow: '0 8px 32px #000c',
            minWidth: 200,
          }}
        >
          {/* Pane: add nodes (group/node-scope invitees can't add "elsewhere" — menu doesn't even open for them) */}
          {!contextMenu.nodeId && !contextMenu.edgeId && (
            <>
              <ContextItem icon="＋" label="단계 노드 추가" color="#3b82f6" onClick={handleContextAddStage} />
              <ContextItem icon="📝" label="메모 노드 추가" color="#f59e0b" onClick={handleContextAddMemo} />
            </>
          )}

          {/* Edge: delete */}
          {contextMenu.edgeId && ctxEdgeEditable && (
            <ContextItem icon="🗑" label="연결선 삭제" color="#ef4444" onClick={handleContextDeleteEdge} />
          )}

          {/* Pin a saved view from the current selection (or just this node) */}
          {contextMenu.nodeId && (
            <>
              <ContextItem
                icon="📌"
                label={`뷰 고정 (${ctxIds.length}개 노드)`}
                color="#06b6d4"
                onClick={() => { saveViewFromSelection(ctxIds); closeContext() }}
              />
              {ctxMulti && ctxFullEdit && (
                <ContextItem icon="⬚" label="그룹으로 묶기" color="#8b94a7" onClick={handleContextGroupSelection} />
              )}
              <ContextItem icon="⇢" label="연결선 정리" color="#8b94a7" onClick={handleContextCleanupEdges} />
              <div style={{ height: 1, background: '#ffffff18', margin: '4px 2px' }} />
            </>
          )}

          {/* Group node: ungroup (frame removed, children kept) */}
          {contextMenu.nodeId && contextMenu.nodeType === 'group' && ctxFullEdit && (
            <>
              <ContextItem icon="⬚" label="그룹 해제" color="#8b94a7" onClick={handleContextUngroup} />
              <ContextItem icon="🗑" label="그룹 삭제 (노드 유지)" color="#8b94a7" onClick={handleContextUngroup} />
            </>
          )}

          {/* Stage node: type selector + delete */}
          {contextMenu.nodeId && contextMenu.nodeType === 'stage' && (
            <>
              {ctxFullEdit && (
                <>
                  <div style={{ padding: '4px 8px 4px', color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                    {ctxMulti ? '종류 일괄 변경' : '종류 선택'}
                  </div>
                  {stageTypes.map((type, idx) => (
                    <div key={type.id} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '1px 4px' }}>
                      {renamingTypeIdx === idx ? (
                        <input
                          autoFocus
                          value={renameValue}
                          placeholder="종류 이름"
                          onFocus={(e) => e.target.select()}
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
                          onClick={() => { changeNodeStageType(ctxIds, idx); closeContext() }}
                        />
                      )}
                      {renamingTypeIdx !== idx && (
                        <>
                          <IconBtn
                            title="이름 변경"
                            onClick={(e) => { e.stopPropagation(); setRenamingTypeIdx(idx); setRenameValue(type.label === '새 종류' ? '' : type.label) }}
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
                </>
              )}
              {ctxCanDelete && (
                <ContextItem icon="🗑" label={ctxMulti ? '전체 삭제' : '노드 삭제'} color="#ef4444" onClick={handleContextDeleteNode} />
              )}
            </>
          )}

          {/* Memo node: just delete */}
          {contextMenu.nodeId && contextMenu.nodeType === 'memo' && ctxCanDelete && (
            <ContextItem icon="🗑" label={ctxMulti ? '전체 삭제' : '노드 삭제'} color="#ef4444" onClick={handleContextDeleteNode} />
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
