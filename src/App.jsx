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
import ContentNode from './nodes/ContentNode'
import SystemNode from './nodes/SystemNode'
import StubEdge from './edges/StubEdge'
import Toolbar from './components/Toolbar'
import CanvasTabs from './components/CanvasTabs'
import AuthPanel from './components/AuthPanel'
import InvitePopover from './components/InvitePopover'
import NotesPanel from './components/NotesPanel'
import DigitalTwinReviewPanel from './components/DigitalTwinReviewPanel'
import EdgeRelationEditor from './components/EdgeRelationEditor'
import {
  initCanvases, loadCanvasData, saveCanvasData, deleteCanvasData,
  saveCanvasList, saveActiveId, uid,
  loadCanvasList, loadActiveId,
  loadLodThreshold, saveLodThreshold,
  loadCanvasStorageOwner, resetCanvasStorage, saveCanvasStorageOwner,
  STORAGE_ERROR_EVENT,
  getLastStorageError,
} from './storage'
import { supabase } from './lib/supabase'
import { sanitizeNodeData } from './lib/sanitizeHtml'
import {
  checkAllSystemRuntime,
  checkSystemPartRuntime,
  loadLatestSystemRuntime,
} from './lib/systemRuntimeApi.js'
import {
  saveCanvas as cloudSaveCanvas,
  loadAllCanvases as cloudLoadAllCanvases,
  loadCanvasRow as cloudLoadCanvasRow,
  deleteCanvas as cloudDeleteCanvas,
  saveUserPrefs as cloudSaveUserPrefs,
  loadUserPrefs as cloudLoadUserPrefs,
  CanvasConflictError,
} from './lib/cloudStorage'
import { CanvasSchemaGuardError } from './lib/canvasSchemaGuard'
import {
  getSharedCanvas, listCanvasParticipants, listSharedCanvases,
  setMemberViewRestriction, updateSharedCanvas,
} from './lib/sharedCanvasApi'
import { appendHistorySnapshot, sameCanvasSnapshot } from './lib/canvasSync'
import {
  chooseOwnCanvasToRestore, loadLastOpenedCanvas, saveLastOpenedCanvas,
} from './lib/canvasNavigation'
import { absoluteNodePosition, boundsForNodeIds } from './lib/canvasGeometry'
import { dataUrlToBlob, uploadCanvasImage } from './lib/imageStorage'
import { mergeCanvasSnapshots } from './lib/canvasMerge'
import { joinCanvasPresence } from './lib/presence'
import {
  claimEmailInvite, claimShareToken, getShareLinkPreview, isShareLinkActive, listPendingEmailInvites, listShares, revokeShareMember,
  setMemberEdit, kickMember, leaveSharedCanvas,
} from './lib/shares'
import { getMyProfile, loadMySettings, upsertMyEmail, touchLastSeen } from './lib/profiles'
import { createSystemNodeData } from '../shared/systemOntology.js'
import { detachSystemPartBindings, normalizeSystemParts } from '../shared/systemPartOntology.js'
import {
  failedSystemRuntimeResult,
  systemPartRuntimeReality,
  systemRuntimeCapabilityForPart,
  systemRuntimePathEdgeIds,
} from '../shared/systemRuntime.js'
import {
  clearDigitalTwinReviewDecision,
  partitionDigitalTwinReviewItems,
  setDigitalTwinReviewDecision,
} from '../shared/digitalTwinReview.js'
import {
  applyDigitalTwinGraphProposal,
  digitalTwinProposalAutoFitKey,
  digitalTwinProposalMatchesItem,
  filterDigitalTwinProposalNodeChanges,
  planDigitalTwinGraphProposal,
  previewDigitalTwinPartChanges,
} from '../shared/digitalTwinProposal.js'
import { inspectDigitalTwinCanvas } from './lib/digitalTwinAdapters.js'
import {
  createEdgeRelationData,
  edgeRelationInfo,
  normalizeEdgeRelationData,
} from '../shared/relationOntology.js'

const nodeTypes = { stage: StageNode, memo: MemoNode, group: GroupNode, content: ContentNode, system: SystemNode }
const edgeTypes = { stub: StubEdge }

const defaultEdgeOptions = {
  type: 'stub',
  animated: false,
  style: { stroke: '#4a4a5a', strokeWidth: 3 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#4a4a5a' },
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
// Keep only the relation/part fields we understand and force type 'stub' on
// every saved edge — old 'separable' type
// (and any other removed/foreign custom type, incl. MCP-created edges with no
// type) would otherwise cause React Flow to emit unknown-type warnings or fall
// back to the default bezier look. Keeps style/markerEnd so appearance (color,
// dash pattern) survives; the stub geometry itself comes from edgeTypes.stub.
function normalizeEdges(edges) {
  return (edges ?? []).map(({ data, type, ...e }) => {
    const safeData = normalizeEdgeRelationData(data)
    return { ...e, type: 'stub', ...(Object.keys(safeData).length ? { data: safeData } : {}) }
  })
}

function maxNodeId(nodes) {
  return Math.max(10, ...(nodes ?? []).map((n) => parseInt(n.id) || 0))
}

function nodeDisplayName(node) {
  if (!node) return '알 수 없는 노드'
  const raw = node.type === 'memo'
    ? node.data?.header
    : node.type === 'content'
      ? node.data?.header
      : node.data?.label
  const plain = String(raw ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  if (plain) return plain
  if (node.type === 'memo') return '메모'
  if (node.type === 'content') return '콘텐츠'
  if (node.type === 'system') return '시스템 실체'
  if (node.type === 'group') return '그룹'
  return '단계 노드'
}

// ── Phase 2 sharing: shared canvases live under a composite localStorage/
// activeCanvasId key so they never collide with the owner's own canvas ids.
const SHARED_PREFIX = 'shared:'
const PENDING_SHARE_TOKEN_KEY = 'wfc:pending-share-token'
function sharedCanvasId(ownerId, canvasId) { return `${SHARED_PREFIX}${ownerId}:${canvasId}` }
function parseSharedId(id) {
  if (typeof id !== 'string' || !id.startsWith(SHARED_PREFIX)) return null
  const rest = id.slice(SHARED_PREFIX.length)
  const sep = rest.indexOf(':')
  if (sep === -1) return null
  return { ownerId: rest.slice(0, sep), canvasId: rest.slice(sep + 1) }
}

function systemRuntimeTargetsForNodes(nodes) {
  const targets = []
  for (const node of nodes ?? []) {
    if (node?.type !== 'system') continue
    for (const part of normalizeSystemParts(node.data?.systemParts)) {
      const capability = systemRuntimeCapabilityForPart(part, node.id)
      if (capability) targets.push({ nodeId: node.id, partId: part.id, capability })
    }
  }
  return targets
}

function systemRuntimeMapFromRecords(records) {
  const byNode = {}
  for (const record of records ?? []) {
    byNode[record.nodeId] = { ...(byNode[record.nodeId] ?? {}), [record.partId]: record.result }
  }
  return byNode
}

function systemRuntimePersistenceError(response, expectedCount) {
  if (response.persistenceAvailable === false) return '운영 관측 저장소 SQL이 아직 적용되지 않았습니다.'
  if (response.persistenceErrorCode === 'OBSERVATION_READ_FAILED') return '최근 운영 관측 기록을 불러오지 못했습니다.'
  const persisted = typeof expectedCount === 'number'
    ? response.persistedCount === expectedCount
    : response.persisted === true
  return persisted ? '' : '운영 상태는 확인했지만 관측 기록을 저장하지 못했습니다.'
}

const RUNTIME_STATE_PRIORITY = {
  checking: 6,
  failed: 5,
  degraded: 4,
  stale: 3,
  unknown: 2,
  healthy: 1,
}

function aggregateSystemNodeRuntime(node, runtimeByPart, now = Date.now()) {
  const targets = systemRuntimeTargetsForNodes([node])
  if (!targets.length) return undefined
  const states = targets.map((target) => ({
    target,
    result: runtimeByPart?.[target.partId],
    reality: systemPartRuntimeReality(runtimeByPart?.[target.partId], now),
  }))
  const worst = states.reduce((current, candidate) => (
    !current || RUNTIME_STATE_PRIORITY[candidate.reality.id] > RUNTIME_STATE_PRIORITY[current.reality.id]
      ? candidate
      : current
  ), null)
  const checkedTimes = states.map(({ result }) => Date.parse(result?.checkedAt ?? '')).filter(Number.isFinite)
  return {
    status: worst?.reality.id ?? 'unknown',
    verification: states.every(({ reality }) => reality.id === 'healthy') ? 'verified' : 'partial',
    resourceId: `system-node:${node.id}`,
    verifiedAt: checkedTimes.length ? new Date(Math.max(...checkedTimes)).toISOString() : new Date(0).toISOString(),
  }
}

function systemRuntimeDashboardSummary(targets, runtimeByNode, checking, now = Date.now()) {
  if (!targets.length) return null
  const counts = { healthy: 0, degraded: 0, stale: 0, failed: 0, unknown: 0, checking: 0 }
  for (const target of targets) {
    const state = systemPartRuntimeReality(runtimeByNode[target.nodeId]?.[target.partId], now)
    counts[state.id] = (counts[state.id] ?? 0) + 1
  }
  const status = checking || counts.checking
    ? 'checking'
    : counts.failed
      ? 'failed'
      : counts.degraded || counts.stale
        ? 'degraded'
        : counts.unknown
          ? 'unknown'
          : 'healthy'
  const color = {
    healthy: '#22c55e', degraded: '#eab308', failed: '#ef4444', unknown: '#94a3b8', checking: '#60a5fa',
  }[status]
  return {
    status,
    color,
    label: `${counts.healthy}/${targets.length}`,
    title: `전체 운영 상태 확인 · 정상 ${counts.healthy} · 부분/오래됨 ${counts.degraded + counts.stale} · 오류 ${counts.failed} · 미확인 ${counts.unknown}`,
    counts,
  }
}

function systemRuntimeByEdge(targets, runtimeByNode, now = Date.now()) {
  const byEdge = new Map()
  for (const target of targets) {
    const result = runtimeByNode[target.nodeId]?.[target.partId]
    const reality = systemPartRuntimeReality(result, now)
    for (const edgeId of systemRuntimePathEdgeIds(target.capability.id)) {
      const current = byEdge.get(edgeId)
      if (!current || RUNTIME_STATE_PRIORITY[reality.id] > RUNTIME_STATE_PRIORITY[current.reality.id]) {
        byEdge.set(edgeId, { reality, result, capability: target.capability })
      }
    }
  }
  return byEdge
}

function participantKey(person) {
  return person.userId ? `user:${person.userId}` : `email:${person.email ?? person.shareId}`
}

function dedupeParticipants(people) {
  const unique = new Map()
  ;(people ?? []).forEach((person) => {
    const key = participantKey(person)
    if (!unique.has(key)) unique.set(key, person)
  })
  return [...unique.values()]
}

function scopedParticipants(people) {
  const owner = people.find((person) => person.isOwner)
  const scoped = {}
  for (const person of people) {
    if (person.isOwner) continue
    const grants = person.grants?.length ? person.grants : [person]
    for (const grant of grants) {
      if (grant.scope === 'canvas' || !grant.targetId) continue
      const key = `${grant.scope}:${grant.targetId}`
      if (!scoped[key]) scoped[key] = []
      scoped[key].push({
        ...person,
        shareId: grant.shareId ?? person.shareId,
        scope: grant.scope,
        targetId: grant.targetId,
        canEdit: grant.canEdit,
        restrictView: !!grant.restrictView,
      })
    }
  }
  Object.keys(scoped).forEach((key) => {
    scoped[key] = dedupeParticipants(owner ? [owner, ...scoped[key]] : scoped[key])
  })
  return scoped
}

// "연결선 정리": pick the nearest-side handle pair between two nodes, based on
// their absolute centers (accounts for parentId children — see absolutePosition).
function closestHandles(sourceNode, targetNode, byId) {
  const dim = (n) => ({ w: n.measured?.width ?? n.width ?? 200, h: n.measured?.height ?? n.height ?? 80 })
  const sPos = absoluteNodePosition(sourceNode, byId)
  const tPos = absoluteNodePosition(targetNode, byId)
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

function sanitizeNodes(nodes) {
  return (nodes ?? []).map((node) => ({ ...node, data: sanitizeNodeData(node.data) }))
}

function sanitizeNotes(notes) {
  return (notes ?? []).map((note) => ({ ...note, data: sanitizeNodeData(note.data) }))
}

// A "부품(part) 연결선" links two part handles (ids starting 'p-') on stage
// nodes — dashed, no arrowhead, distinct from memo links.
function isPartEdge(e) {
  return !!e.data?.partsLink || (!!e.sourceHandle?.startsWith('p-') && !!e.targetHandle?.startsWith('p-'))
}

function partIdFromHandle(handle) {
  const match = typeof handle === 'string' ? handle.match(/^p-(.+)-(l|r)$/) : null
  return match?.[1] ?? null
}

// Base (unselected) appearance for an edge, derived purely from whether it's a
// dashed memo link or a part link. Used to force a clean look on deselect so
// selection-bold can never linger — even if a stale bold style got baked into
// the edge by reconnect.
function baseEdgeStyle(e) {
  if (isPartEdge(e)) {
    return { style: { stroke: '#8b94a7', strokeWidth: 2, strokeDasharray: '6,4' }, markerEnd: undefined }
  }
  const isMemo = !!e.style?.strokeDasharray
  const relation = edgeRelationInfo(e.data, isMemo ? 'references' : 'flows_to')
  const stroke = relation.explicit ? relation.color : '#4a4a5a'
  return {
    style: isMemo
      ? { stroke: '#f59e0b88', strokeWidth: 2.25, strokeDasharray: '5,4' }
      : { stroke, strokeWidth: 3 },
    markerEnd: isMemo || !relation.directed ? undefined : { type: MarkerType.ArrowClosed, color: stroke },
  }
}

// Strip runtime callbacks (and stageTypes) before snapshot / localStorage save
function stripNode(n) {
  const {
    onUpdate, onEditStart, onEditEnd, onOpenInNotes, onCheckSystemPart,
    stageTypes, imageContext, twinRuntime, systemPartRuntime, canRunSystemChecks, ...data
  } = n.data ?? {}
  const { selected, ...rest } = n
  return { ...rest, data }
}
function detachDigitalTwinBinding(data) {
  const { digitalTwinBinding, ...rest } = data ?? {}
  if (!Array.isArray(rest.systemParts)) return rest
  return { ...rest, systemParts: detachSystemPartBindings(rest.systemParts) }
}
const stripNote = (note) => ({ ...note, data: sanitizeNodeData(note.data) })
const stripEdge = ({ selected, data, redacted, ...edge }) => {
  const safeData = normalizeEdgeRelationData(data)
  return { ...edge, ...(Object.keys(safeData).length ? { data: safeData } : {}) }
}

function canvasSnapshot(name, data = {}) {
  return {
    name: name ?? '캔버스',
    nodes: data.nodes ?? [],
    edges: data.edges ?? [],
    notes: data.notes ?? [],
    views: data.views ?? [],
    stageTypes: data.stageTypes ?? null,
  }
}

function cloudRowSnapshot(row) {
  return canvasSnapshot(row.name, {
    nodes: row.nodes,
    edges: row.edges,
    notes: row.notes,
    views: row.views,
    stageTypes: row.stage_types,
  })
}

// ── Bootstrap canvases (runs once at module load) ────────────────────────────
const EMPTY_CANVAS_SEEDS = []
const { list: initCanvasList, activeId: initActiveId } = initCanvases(EMPTY_CANVAS_SEEDS)
// Never render an old local mirror for a shared canvas before the server has
// re-checked its current permission and redacted it if necessary.
const initData = parseSharedId(initActiveId)
  ? { nodes: [], edges: [] }
  : (loadCanvasData(initActiveId) ?? { nodes: [], edges: [] })

// ── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [canvases, setCanvases] = useState(initCanvasList)
  const [activeCanvasId, setActiveCanvasId] = useState(initActiveId)

  const [nodes, setNodes, onNodesChange] = useNodesState(sortParentsFirst(sanitizeNodes(initData.nodes)))
  const [edges, setEdges, onEdgesChange] = useEdgesState(normalizeEdges(initData.edges))
  const [notes, setNotes] = useState(() => sanitizeNotes(initData.notes))
  const [stageTypes, setStageTypes] = useState(() => initData.stageTypes ?? DEFAULT_STAGE_TYPES)
  const [contextMenu, setContextMenu] = useState(null)
  const [renamingTypeIdx, setRenamingTypeIdx] = useState(null)
  const [notesPanel, setNotesPanel] = useState(null) // { type: 'stage'|'memo'|'content'|'system' } | null
  const [twinReviewOpen, setTwinReviewOpen] = useState(false)
  const [digitalTwinReview, setDigitalTwinReview] = useState(null)
  const [twinProposalPreview, setTwinProposalPreview] = useState(null) // { itemId, itemFingerprint } | null
  const [twinProposalStatus, setTwinProposalStatus] = useState(null) // { type, message } | null
  const [systemPartRuntimeByNode, setSystemPartRuntimeByNode] = useState({})
  const [systemRuntimeDashboard, setSystemRuntimeDashboard] = useState({
    loading: false,
    checking: false,
    persistenceAvailable: true,
    error: '',
  })
  const [systemRuntimeNow, setSystemRuntimeNow] = useState(Date.now)
  const [notesSelectedId, setNotesSelectedId] = useState(null)
  const [notesSide, setNotesSide] = useState('right')
  const [renameValue, setRenameValue] = useState('')
  const reactFlowRef = useRef(null)
  const [rfInstance, setRfInstance] = useState(null)
  const [isAnyEditing, setIsAnyEditing] = useState(false)
  const [isPinching, setIsPinching] = useState(false)
  const [lassoRect, setLassoRect] = useState(null) // screen-space rubber-band box
  const [alignGuides, setAlignGuides] = useState([]) // [{axis:'x'|'y', value}] in flow-space coords, drawn while dragging
  // Unified canvas settings (theme / node-fill / LOD threshold). AuthPanel owns
  // the editor UI and cloud persistence (user_prefs.settings) — it calls
  // onSettingsChange(next) below on every change; lodThreshold keeps its
  // localStorage mirror so logged-out visitors still get a sensible default.
  const [settings, setSettings] = useState(() => ({ theme: 'light', nodeFill: false, lodThreshold: loadLodThreshold() }))
  const onSettingsChange = useCallback((next) => {
    setSettings((prev) => ({ ...prev, ...next }))
    if (next.lodThreshold !== undefined) saveLodThreshold(next.lodThreshold)
  }, [])
  useEffect(() => { document.body.dataset.theme = settings.theme }, [settings.theme])

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
  const systemRuntimeTargets = useMemo(() => systemRuntimeTargetsForNodes(nodes), [nodes])
  const systemRuntimeTargetSignature = systemRuntimeTargets
    .map((target) => `${target.nodeId}:${target.partId}:${target.capability.id}`)
    .sort()
    .join('|')
  const systemRuntimeSummary = useMemo(
    () => systemRuntimeDashboardSummary(
      systemRuntimeTargets,
      systemPartRuntimeByNode,
      systemRuntimeDashboard.checking,
      systemRuntimeNow,
    ),
    [systemRuntimeTargets, systemPartRuntimeByNode, systemRuntimeDashboard.checking, systemRuntimeNow],
  )
  const runtimeByEdge = useMemo(
    () => systemRuntimeByEdge(systemRuntimeTargets, systemPartRuntimeByNode, systemRuntimeNow),
    [systemRuntimeTargets, systemPartRuntimeByNode, systemRuntimeNow],
  )

  useEffect(() => {
    if (!systemRuntimeTargetSignature) return undefined
    setSystemRuntimeNow(Date.now())
    const timer = window.setInterval(() => setSystemRuntimeNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [systemRuntimeTargetSignature])

  useEffect(() => {
    let cancelled = false
    setSystemPartRuntimeByNode({})
    setSystemRuntimeDashboard({ loading: false, checking: false, persistenceAvailable: true, error: '' })
    if (!user?.id || parseSharedId(activeCanvasId) || !systemRuntimeTargetSignature) return undefined
    setSystemRuntimeDashboard((current) => ({ ...current, loading: true }))
    loadLatestSystemRuntime({ canvasId: activeCanvasId })
      .then((response) => {
        if (cancelled) return
        setSystemPartRuntimeByNode(systemRuntimeMapFromRecords(response.results))
        setSystemRuntimeDashboard({
          loading: false,
          checking: false,
          persistenceAvailable: response.persistenceAvailable,
          error: response.persistenceErrorCode
            ? systemRuntimePersistenceError(response)
            : response.persistenceAvailable ? '' : '운영 관측 저장소 SQL이 아직 적용되지 않았습니다.',
        })
      })
      .catch((error) => {
        if (cancelled) return
        setSystemRuntimeDashboard({
          loading: false,
          checking: false,
          persistenceAvailable: true,
          error: error?.message || '최근 운영 관측을 불러오지 못했습니다.',
        })
      })
    return () => { cancelled = true }
  }, [activeCanvasId, systemRuntimeTargetSignature, user?.id])
  // Tracks which user id has already run the full afterLogin() sequence, so a
  // tab-refocus re-emitting SIGNED_IN for the SAME user (supabase-js token
  // revalidation) doesn't re-run loadFromCloud() and yank the viewer back to
  // their own active_canvas_id while they're looking at a shared canvas.
  const initializedUserRef = useRef(null)
  const cloudHydratedUserRef = useRef(null)
  const [cloudSyncing, setCloudSyncing] = useState(false)
  const [storageError, setStorageError] = useState(() => getLastStorageError())
  // Stable ref to always-current state for use inside async callbacks
  const latestRef = useRef({ canvases: initCanvasList, activeCanvasId: initActiveId, stageTypes: [], views: [], notes: [] })
  const isAnyEditingRef = useRef(false) // mirror for the realtime channel callback
  const lastPushedPrefsRef = useRef('') // JSON of the last prefs payload saved to cloud
  const legacyImageMigrationsRef = useRef(new Set())
  const canvasSyncBaseRef = useRef(new Map()) // canvas key -> { revision, snapshot }
  const dirtyCanvasSnapshotsRef = useRef(new Map()) // canvas key -> queued save entry
  const conflictedCanvasKeysRef = useRef(new Set())
  const syncFlushRunningRef = useRef(false)
  const [syncConflict, setSyncConflict] = useState(null)
  const [canvasSchemaGuardError, setCanvasSchemaGuardError] = useState(null)

  // ── Sharing / invite (phase 2) ────────────────────────────────────────────
  const [invite, setInvite] = useState(null) // { scope, targetId, x, y } | null
  const [onlineUsers, setOnlineUsers] = useState([]) // [{ user_id, email }] in the active canvas
  const [sharedCanvases, setSharedCanvases] = useState([]) // canvases shared WITH me (listSharedWithMe())
  const loadedSharedIdRef = useRef(null)
  const pendingShareTokenRef = useRef(null) // #share=<token> waiting for preview + explicit acceptance
  const [authNotice, setAuthNotice] = useState(null) // share-link login gate notice shown in AuthPanel
  const [shareLinkError, setShareLinkError] = useState(null)
  const [emailInviteNotices, setEmailInviteNotices] = useState([])
  const [linkInviteNotice, setLinkInviteNotice] = useState(null)
  const [inviteActionError, setInviteActionError] = useState(null)
  const [inviteActionBusy, setInviteActionBusy] = useState(false)
  const inviteActionPendingRef = useRef(false)
  const [scopedParticipantMap, setScopedParticipantMap] = useState({})
  const inviteWrapRef = useRef(null) // invite popover wrapper (outside-click close)

  // ── Profiles (nickname/avatar) ────────────────────────────────────────────
  const [myProfile, setMyProfile] = useState(null)
  useEffect(() => { if (!user) setMyProfile(null) }, [user])

  // Participants shown in the CanvasTabs avatar row for the ACTIVE canvas.
  const [shareParticipantsBase, setShareParticipantsBase] = useState([]) // [{ userId, email, profile, isOwner }]
  // Own canvases with at least one active share (moved into "공유 캔버스" in CanvasTabs).
  const [sharedOutCanvasIds, setSharedOutCanvasIds] = useState(new Set())

  const nextId = () => String(++counterRef.current)

  // Discard the previous account's browser cache. Signed-in data is restored
  // from Supabase; an unsigned visitor gets a fresh local workspace instead.
  const resetToGuestCanvas = useCallback(() => {
    const { list, activeId } = resetCanvasStorage(EMPTY_CANVAS_SEEDS)
    const data = loadCanvasData(activeId) ?? { nodes: [], edges: [] }
    const nNodes = sortParentsFirst(sanitizeNodes(data.nodes))
    isRestoring.current = true
    setCanvases(list)
    setActiveCanvasId(activeId)
    setNodes(nNodes)
    setEdges(normalizeEdges(data.edges))
    setNotes(sanitizeNotes(data.notes))
    setViews(data.views ?? [])
    setStageTypes(data.stageTypes ?? DEFAULT_STAGE_TYPES)
    setCurrentViewId(null)
    counterRef.current = maxNodeId(nNodes)
    historyStack.current = [{ nodes: nNodes.map(stripNode), edges: normalizeEdges(data.edges).map(stripEdge), notes: sanitizeNotes(data.notes).map(stripNote) }]
    historyPointer.current = 0
    setTimeout(() => { isRestoring.current = false }, 400)
  }, [setNodes, setEdges])

  // Keep latestRef and userRef in sync so async callbacks always see fresh state
  useEffect(() => {
    latestRef.current = { canvases, activeCanvasId, stageTypes, views, notes, sharedCanvases }
  }, [canvases, activeCanvasId, stageTypes, views, notes, sharedCanvases])
  useEffect(() => { userRef.current = user }, [user])
  useEffect(() => { isAnyEditingRef.current = isAnyEditing }, [isAnyEditing])
  useEffect(() => {
    const onStorageError = (event) => setStorageError(event.detail?.message ?? '브라우저 저장 공간에 기록하지 못했습니다.')
    window.addEventListener(STORAGE_ERROR_EVENT, onStorageError)
    return () => window.removeEventListener(STORAGE_ERROR_EVENT, onStorageError)
  }, [])

  // ── Auto-save active canvas + history snapshot (debounced) ───────────────
  useEffect(() => {
    if (isRestoring.current) return
    const histSnapshot = { nodes: nodes.map(stripNode), edges: edges.map(stripEdge), notes: notes.map(stripNote) }
    const name = latestRef.current.canvases.find((canvas) => canvas.id === activeCanvasId)?.name
      ?? latestRef.current.sharedCanvases?.find((canvas) => sharedCanvasId(canvas.ownerId, canvas.canvasId) === activeCanvasId)?.name
      ?? '캔버스'
    const queuedSnapshot = canvasSnapshot(name, { ...histSnapshot, views, stageTypes })

    if (userRef.current && cloudHydratedUserRef.current === userRef.current.id) {
      const shared = parseSharedId(activeCanvasId)
      const base = canvasSyncBaseRef.current.get(activeCanvasId)?.snapshot
      if (!base || JSON.stringify(base) !== JSON.stringify(queuedSnapshot)) {
        dirtyCanvasSnapshotsRef.current.set(activeCanvasId, {
          key: activeCanvasId,
          shared: !!shared,
          ownerId: shared?.ownerId,
          canvasId: shared?.canvasId ?? activeCanvasId,
          userId: userRef.current.id,
          snapshot: queuedSnapshot,
        })
      }
    }

    // localStorage snapshot also carries saved views + stage types (undo/redo does not).
    const lsTimer = setTimeout(() => { saveCanvasData(activeCanvasId, { ...histSnapshot, views, stageTypes }) }, 500)

    const histTimer = setTimeout(() => {
      if (isRestoring.current) return
      const last = historyStack.current[historyPointer.current]
      if (last && JSON.stringify(last) === JSON.stringify(histSnapshot)) return
      historyStack.current = appendHistorySnapshot(historyStack.current, historyPointer.current, histSnapshot)
      historyPointer.current = historyStack.current.length - 1
    }, 300)

    return () => { clearTimeout(lsTimer); clearTimeout(histTimer) }
  }, [nodes, edges, notes, activeCanvasId, views, stageTypes])

  // ── Undo / Redo ──────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    if (permRef.current.role === 'invitee' && (permRef.current.scope !== 'canvas' || permRef.current.canEdit === false)) return
    if (historyPointer.current <= 0) return
    historyPointer.current--
    const snap = historyStack.current[historyPointer.current]
    isRestoring.current = true
    setNodes(snap.nodes)
    setEdges(snap.edges)
    setNotes(snap.notes ?? [])
    saveCanvasData(latestRef.current.activeCanvasId, {
      ...snap,
      views: latestRef.current.views,
      stageTypes: latestRef.current.stageTypes,
    })
    setTimeout(() => { isRestoring.current = false }, 400)
  }, [setNodes, setEdges])

  const redo = useCallback(() => {
    if (permRef.current.role === 'invitee' && (permRef.current.scope !== 'canvas' || permRef.current.canEdit === false)) return
    if (historyPointer.current >= historyStack.current.length - 1) return
    historyPointer.current++
    const snap = historyStack.current[historyPointer.current]
    isRestoring.current = true
    setNodes(snap.nodes)
    setEdges(snap.edges)
    setNotes(snap.notes ?? [])
    saveCanvasData(latestRef.current.activeCanvasId, {
      ...snap,
      views: latestRef.current.views,
      stageTypes: latestRef.current.stageTypes,
    })
    setTimeout(() => { isRestoring.current = false }, 400)
  }, [setNodes, setEdges])

  useEffect(() => {
    const handler = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (isAnyEditingRef.current || isTypingTarget()) return
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
        } else if (touchDevice && !(permRef.current.role === 'invitee' && (permRef.current.scope !== 'canvas' || permRef.current.canEdit === false))) {
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
            .select('name, nodes, edges, notes, views, stage_types, updated_at')
            .eq('user_id', userRef.current.id)
            .eq('canvas_id', id)
            .maybeSingle()
          if (row) {
            data = {
              name: row.name,
              nodes: row.nodes ?? [],
              edges: row.edges ?? [],
              notes: row.notes ?? [],
              views: row.views ?? [],
              stageTypes: row.stage_types?.length ? row.stage_types : undefined,
              revision: row.updated_at,
            }
            canvasSyncBaseRef.current.set(id, { revision: row.updated_at, snapshot: cloudRowSnapshot(row) })
            saveCanvasData(id, {
              nodes: data.nodes,
              edges: data.edges,
              notes: data.notes,
              views: data.views,
              stageTypes: data.stageTypes,
            })
          }
        } catch (e) {
          console.warn('[cloud] loadCanvas fetch:', e.message)
        }
      }
    }
    if (data.revision) {
      canvasSyncBaseRef.current.set(id, {
        revision: data.revision,
        snapshot: canvasSnapshot(data.name ?? latestRef.current.canvases.find((canvas) => canvas.id === id)?.name, data),
      })
    }
    const nNodes = sortParentsFirst(sanitizeNodes(data.nodes))
    const nEdges = normalizeEdges(data.edges)
    isRestoring.current = true
    setActiveCanvasId(id)
    saveActiveId(id)
    if (userRef.current?.id) saveLastOpenedCanvas(userRef.current.id, id)
    setNodes(nNodes)
    setEdges(nEdges)
    setNotes(sanitizeNotes(data.notes))
    setNotesSelectedId(null)
    setViews(data.views ?? [])
    setStageTypes(data.stageTypes ?? DEFAULT_STAGE_TYPES)
    setCurrentViewId(null)
    counterRef.current = maxNodeId(nNodes)
    const snap = { nodes: nNodes.map(stripNode), edges: nEdges.map(stripEdge), notes: sanitizeNotes(data.notes).map(stripNote) }
    historyStack.current = [snap]
    historyPointer.current = 0
    setTimeout(() => { isRestoring.current = false }, 400)
  }, [setNodes, setEdges])

  const persistCurrent = useCallback(() => {
    const data = { nodes: nodes.map(stripNode), edges: edges.map(stripEdge), notes: notes.map(stripNote), views, stageTypes }
    saveCanvasData(activeCanvasId, data)
    if (user && cloudHydratedUserRef.current === user.id) {
      const shared = parseSharedId(activeCanvasId)
      const name = canvases.find((canvas) => canvas.id === activeCanvasId)?.name
        ?? sharedCanvases.find((canvas) => sharedCanvasId(canvas.ownerId, canvas.canvasId) === activeCanvasId)?.name
        ?? '캔버스'
      const snapshot = canvasSnapshot(name, data)
      const base = canvasSyncBaseRef.current.get(activeCanvasId)?.snapshot
      if (!base || JSON.stringify(base) !== JSON.stringify(snapshot)) {
        dirtyCanvasSnapshotsRef.current.set(activeCanvasId, {
          key: activeCanvasId,
          shared: !!shared,
          ownerId: shared?.ownerId,
          canvasId: shared?.canvasId ?? activeCanvasId,
          userId: user.id,
          snapshot,
        })
      }
    }
  }, [activeCanvasId, nodes, edges, notes, views, stageTypes, user, canvases, sharedCanvases])

  // Invited canvases always pass through the server permission gateway. It
  // redacts restricted nodes before the browser sees them.
  const loadSharedCanvas = useCallback(async (ownerId, canvasId) => {
    let row
    try {
      row = await getSharedCanvas(ownerId, canvasId)
    } catch (err) {
      console.error('[shares] loadSharedCanvas:', err.message)
      throw err
    }
    const compositeId = sharedCanvasId(ownerId, canvasId)
    const data = {
      nodes: row.nodes ?? [],
      edges: row.edges ?? [],
      notes: row.notes ?? [],
      views: row.views ?? [],
      stageTypes: row.stageTypes?.length ? row.stageTypes : undefined,
    }
    canvasSyncBaseRef.current.set(compositeId, {
      revision: row.revision,
      snapshot: canvasSnapshot(row.name, data),
      permission: row.permission,
    })
    setSharedCanvases((previous) => previous.map((item) => (
      item.ownerId === ownerId && item.canvasId === canvasId
        ? {
            ...item,
            scope: row.permission?.scope ?? item.scope,
            targetId: row.permission?.targetId ?? item.targetId,
            canEdit: row.permission?.canEdit ?? item.canEdit,
            restrictView: row.permission?.restrictView ?? item.restrictView,
          }
        : item
    )))
    const existing = loadCanvasData(compositeId)
    if (latestRef.current.activeCanvasId === compositeId && loadedSharedIdRef.current === compositeId && existing && JSON.stringify(existing) === JSON.stringify(data)) return
    saveCanvasData(compositeId, data)
    loadedSharedIdRef.current = compositeId
    loadCanvas(compositeId, data)
  }, [loadCanvas])

  const handleSharedAccessLost = useCallback((ownerId, canvasId, error) => {
    if (!/권한|찾을 수 없습니다/.test(error?.message ?? '')) return false
    const compositeId = sharedCanvasId(ownerId, canvasId)
    setSharedCanvases((prev) => prev.filter((item) => item.ownerId !== ownerId || item.canvasId !== canvasId))
    deleteCanvasData(compositeId)
    loadedSharedIdRef.current = null
    const firstOwn = latestRef.current.canvases[0]
    if (firstOwn) loadCanvas(firstOwn.id)
    setShareLinkError('이 공유 캔버스에 대한 접근 권한이 종료되었습니다.')
    return true
  }, [loadCanvas])

  const acceptEmailInvite = useCallback(async (incoming) => {
    setInviteActionError(null)
    await claimEmailInvite(incoming.id)
    setSharedCanvases(await listSharedCanvases())
    persistCurrent()
    await loadSharedCanvas(incoming.ownerId, incoming.canvasId)
    setEmailInviteNotices((prev) => prev.filter((invite) => invite.id !== incoming.id))
  }, [persistCurrent, loadSharedCanvas])

  const rejectEmailInvite = useCallback(async (id) => {
    setInviteActionError(null)
    if (user?.id) await revokeShareMember(id, user.id)
    setEmailInviteNotices((prev) => prev.filter((invite) => invite.id !== id))
  }, [user])

  const acceptLinkInvite = useCallback(async (incoming) => {
    setInviteActionError(null)
    const claimed = await claimShareToken(incoming.token)
    setSharedCanvases(await listSharedCanvases())
    if (claimed) {
      persistCurrent()
      await loadSharedCanvas(claimed.owner_id, claimed.canvas_id)
    }
    pendingShareTokenRef.current = null
    sessionStorage.removeItem(PENDING_SHARE_TOKEN_KEY)
    setLinkInviteNotice(null)
    history.replaceState(null, '', location.pathname + location.search)
  }, [persistCurrent, loadSharedCanvas])

  const rejectLinkInvite = useCallback(async (incoming) => {
    setInviteActionError(null)
    if (user?.id) await revokeShareMember(incoming.id, user.id)
    pendingShareTokenRef.current = null
    sessionStorage.removeItem(PENDING_SHARE_TOKEN_KEY)
    setLinkInviteNotice(null)
    history.replaceState(null, '', location.pathname + location.search)
  }, [user])

  const runInviteAction = useCallback(async (label, action) => {
    if (inviteActionPendingRef.current) return
    inviteActionPendingRef.current = true
    setInviteActionBusy(true)
    try {
      await action()
    } catch (err) {
      console.error(`[shares] ${label}:`, err.message)
      setInviteActionError(err.message)
    } finally {
      inviteActionPendingRef.current = false
      setInviteActionBusy(false)
    }
  }, [])

  const switchCanvas = useCallback((id) => {
    if (id === activeCanvasId) return
    if (user?.id) saveLastOpenedCanvas(user.id, id)
    persistCurrent()
    const shared = parseSharedId(id)
    if (shared) {
      loadSharedCanvas(shared.ownerId, shared.canvasId).catch((err) => {
        if (!handleSharedAccessLost(shared.ownerId, shared.canvasId, err)) {
          window.alert(`공유 캔버스를 열지 못했습니다: ${err.message}`)
        }
      })
      return
    }
    loadCanvas(id)
  }, [activeCanvasId, user, persistCurrent, loadCanvas, loadSharedCanvas, handleSharedAccessLost])

  const addCanvas = useCallback(() => {
    persistCurrent()
    const id = uid()
    const name = `캔버스 ${canvases.length + 1}`
    setCanvases((prev) => {
      const next = [...prev, { id, name }]
      saveCanvasList(next)
      return next
    })
    const data = { nodes: [], edges: [], notes: [], views: [], stageTypes: DEFAULT_STAGE_TYPES }
    saveCanvasData(id, data)
    if (user && cloudHydratedUserRef.current === user.id) {
      dirtyCanvasSnapshotsRef.current.set(id, {
        key: id,
        shared: false,
        canvasId: id,
        userId: user.id,
        snapshot: canvasSnapshot(name, data),
      })
    }
    loadCanvas(id)
  }, [persistCurrent, loadCanvas, canvases.length, user])

  const renameCanvas = useCallback((id, name) => {
    setCanvases((prev) => {
      const next = prev.map((c) => (c.id === id ? { ...c, name } : c))
      saveCanvasList(next)
      return next
    })
    if (user && cloudHydratedUserRef.current === user.id) {
      const data = id === activeCanvasId
        ? { nodes: nodes.map(stripNode), edges: edges.map(stripEdge), notes: notes.map(stripNote), views, stageTypes }
        : (loadCanvasData(id) ?? { nodes: [], edges: [], notes: [], views: [], stageTypes: DEFAULT_STAGE_TYPES })
      dirtyCanvasSnapshotsRef.current.set(id, {
        key: id,
        shared: false,
        canvasId: id,
        userId: user.id,
        snapshot: canvasSnapshot(name, data),
      })
    }
  }, [activeCanvasId, nodes, edges, notes, views, stageTypes, user])

  const deleteCanvas = useCallback((id) => {
    setCanvases((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.filter((c) => c.id !== id)
      saveCanvasList(next)
      deleteCanvasData(id)
      dirtyCanvasSnapshotsRef.current.delete(id)
      canvasSyncBaseRef.current.delete(id)
      conflictedCanvasKeysRef.current.delete(id)
      if (user) cloudDeleteCanvas(user.id, id)
      if (id === activeCanvasId) loadCanvas(next[0].id)
      return next
    })
  }, [activeCanvasId, loadCanvas, user])

  // ── Cloud: load all canvases from Supabase into memory + localStorage ────
  // Placed after loadCanvas so it can be a stable dep reference (no TDZ).
  const loadFromCloud = useCallback(async (userId, preferredCanvasId = null) => {
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
        const revision = await cloudSaveCanvas(userId, c.id, c.name, d.nodes ?? [], d.edges ?? [], d.notes ?? [], d.views ?? [], d.stageTypes, null)
        canvasSyncBaseRef.current.set(c.id, {
          revision,
          snapshot: canvasSnapshot(c.name, d),
        })
      }
      await cloudSaveUserPrefs(userId, {
        active_canvas_id: loadActiveId(),
        canvas_order: list,
      })
      cloudHydratedUserRef.current = userId
      return
    }

    // Populate localStorage from cloud (so existing loadCanvas() works unchanged)
    // Merge prefs.canvas_order with rows so MCP-created canvases (not in canvas_order) appear in tabs
    const prefOrder = prefs?.canvas_order ?? []
    const prefIds = new Set(prefOrder.map((c) => c.id))
    const missing = rows.filter((r) => !prefIds.has(r.canvas_id)).map((r) => ({ id: r.canvas_id, name: r.name }))
    const canvasList = prefOrder.length ? [...prefOrder, ...missing] : rows.map((r) => ({ id: r.canvas_id, name: r.name }))
    canvasSyncBaseRef.current = new Map(rows.map((row) => [
      row.canvas_id,
      { revision: row.updated_at, snapshot: cloudRowSnapshot(row) },
    ]))
    dirtyCanvasSnapshotsRef.current.clear()
    conflictedCanvasKeysRef.current.clear()
    rows.forEach((r) => saveCanvasData(r.canvas_id, { nodes: r.nodes ?? [], edges: r.edges ?? [], notes: r.notes ?? [], views: r.views ?? [], stageTypes: r.stage_types?.length ? r.stage_types : undefined }))
    saveCanvasList(canvasList)
    const activeId = chooseOwnCanvasToRestore(rows, prefs, preferredCanvasId)

    setCanvases(canvasList)
    if (activeId) {
      const activeRow = rows.find((r) => r.canvas_id === activeId)
      const prefetched = activeRow
        ? {
            name: activeRow.name,
            nodes: activeRow.nodes ?? [],
            edges: activeRow.edges ?? [],
            notes: activeRow.notes ?? [],
            views: activeRow.views ?? [],
            stageTypes: activeRow.stage_types?.length ? activeRow.stage_types : undefined,
            revision: activeRow.updated_at,
          }
        : null
      loadCanvas(activeId, prefetched)
    }
    cloudHydratedUserRef.current = userId
  }, [loadCanvas, setCanvases])

  // ── Sharing: refresh the "shared with me" list ────────────────────────────
  const refreshSharedCanvases = useCallback(async () => {
    try {
      setSharedCanvases(await listSharedCanvases())
    } catch (err) {
      console.error('[shares] refreshSharedCanvases:', err.message)
    }
  }, [])

  const loadPendingEmailInvites = useCallback(async () => {
    const pending = await listPendingEmailInvites()
    setEmailInviteNotices(pending.map((share) => ({
      id: share.id,
      ownerId: share.owner_id,
      canvasId: share.canvas_id,
      name: share.name ?? '공유 캔버스',
      scope: share.scope,
    })))
  }, [])

  // Email invites are not in the canvases Realtime publication. Polling the
  // pending-invite RPC keeps an already-open recipient tab informed too.
  useEffect(() => {
    if (!user) return
    const timer = setInterval(() => {
      loadPendingEmailInvites().catch((err) => console.error('[shares] loadPendingEmailInvites:', err.message))
    }, 20000)
    return () => clearInterval(timer)
  }, [user, loadPendingEmailInvites])

  // ── Sharing: participants shown in the CanvasTabs avatar row for the
  // active canvas. Accepted members come from the permission-checked server
  // endpoint so every collaborator sees the same team roster. Pending email
  // addresses are owner-only and are appended from the invitation table.
  const refreshShareParticipants = useCallback(async () => {
    const u = userRef.current
    const aid = latestRef.current.activeCanvasId
    if (!u || !aid) {
      setShareParticipantsBase([])
      setScopedParticipantMap({})
      return
    }
    const shared = parseSharedId(aid)
    try {
      const ownerId = shared?.ownerId ?? u.id
      const canvasId = shared?.canvasId ?? aid
      const accepted = await listCanvasParticipants(ownerId, canvasId)
      if (!shared) {
        const shares = await listShares(aid)
        const claimedShareIds = new Set(accepted.flatMap((person) => person.grants ?? []).map((grant) => grant.shareId))
        const pending = shares
          .filter((s) => s.invitee_email && !claimedShareIds.has(s.id))
          .map((s) => ({
            userId: null, email: s.invitee_email, profile: null, isOwner: false,
            lastSeenAt: null, shareId: s.id, canEdit: true,
            scope: s.scope, targetId: s.target_id, restrictView: !!s.restrict_view,
          }))
        const people = dedupeParticipants([...accepted, ...pending])
        setScopedParticipantMap(scopedParticipants(people))
        setShareParticipantsBase(people)
      } else {
        setScopedParticipantMap(scopedParticipants(accepted))
        setShareParticipantsBase(accepted)
      }
    } catch (err) {
      console.error('[profiles] refreshShareParticipants:', err.message)
    }
  }, [])

  // ── Sharing: which of MY OWN canvases have at least one active share
  // (moves that tab row into the "공유 캔버스" dropdown section).
  const refreshSharedOutCanvasIds = useCallback(async () => {
    const u = userRef.current
    if (!u) { setSharedOutCanvasIds(new Set()); return }
    try {
      // A canvas counts as "shared out" when someone can currently reach it:
      // an accepted member exists, OR there is a live invitation (an active row
      // that still carries a link token or an invitee email). This keeps a
      // canvas in the shared group after its invitation is deleted but members
      // remain, and drops ghost rows that grant access to nobody.
      const { data: shares, error } = await supabase.from('canvas_shares')
        .select('id, canvas_id, invitation_active, link_token, invitee_email')
        .eq('owner_id', u.id)
      if (error) throw error
      const shareIds = (shares ?? []).map((s) => s.id)
      let membered = new Set()
      if (shareIds.length) {
        const { data: mems, error: memErr } = await supabase.from('share_members')
          .select('share_id').in('share_id', shareIds)
        if (memErr) throw memErr
        membered = new Set((mems ?? []).map((m) => m.share_id))
      }
      const ids = new Set()
      for (const s of shares ?? []) {
        const liveInvite = s.invitation_active && (s.link_token || s.invitee_email)
        if (membered.has(s.id) || liveInvite) ids.add(s.canvas_id)
      }
      setSharedOutCanvasIds(ids)
    } catch (err) {
      console.error('[shares] refreshSharedOutCanvasIds:', err.message)
    }
  }, [])

  // Leave a canvas shared to me: drop my membership rows on every share the
  // owner has on it, then fall back to my first own canvas.
  const onLeaveShared = useCallback(async (sharedId) => {
    const parsed = parseSharedId(sharedId)
    if (!parsed) return
    try {
      await leaveSharedCanvas(parsed.ownerId, parsed.canvasId)
      const nextShared = await listSharedCanvases()
      setSharedCanvases(nextShared)
      deleteCanvasData(sharedId)
      loadedSharedIdRef.current = null
    } catch (err) {
      console.error('[shares] leaveSharedCanvas:', err.message)
      window.alert(`공유 캔버스에서 나가지 못했습니다: ${err.message}`)
      return
    }
    const firstOwn = latestRef.current.canvases[0]
    if (firstOwn) loadCanvas(firstOwn.id)
  }, [loadCanvas])

  // Owner controls in the participants modal: toggle a member's edit access
  // / kick them off the share entirely.
  const onToggleMemberEdit = useCallback(async (p) => {
    try {
      await setMemberEdit(p.shareId, p.userId, !p.canEdit)
    } catch (err) {
      console.error('[shares] setMemberEdit:', err.message)
    }
    refreshShareParticipants()
  }, [refreshShareParticipants])

  const onKickMember = useCallback(async (p) => {
    const canvasId = latestRef.current.activeCanvasId
    if (!canvasId || parseSharedId(canvasId)) return
    try {
      await kickMember(canvasId, p.userId)
      setShareParticipantsBase((prev) => prev.filter((member) => member.userId !== p.userId))
      setScopedParticipantMap((prev) => {
        const next = {}
        Object.entries(prev).forEach(([key, members]) => { next[key] = members.filter((member) => member.userId !== p.userId) })
        return next
      })
    } catch (err) {
      console.error('[shares] kickMember:', err.message)
      window.alert(`참여자를 추방하지 못했습니다: ${err.message}`)
      return
    }
    await refreshShareParticipants()
  }, [refreshShareParticipants])

  const onToggleMemberViewRestriction = useCallback(async (participant, restricted) => {
    const canvasId = latestRef.current.activeCanvasId
    const owner = userRef.current
    if (!owner || !canvasId || parseSharedId(canvasId) || !participant?.userId) return
    try {
      await setMemberViewRestriction(owner.id, canvasId, participant.userId, restricted)
      await refreshShareParticipants()
    } catch (err) {
      console.error('[shares] set view restriction:', err.message)
      window.alert(`시야 제한을 변경하지 못했습니다: ${err.message}`)
    }
  }, [refreshShareParticipants])

  // Kept fresh every render (not in the auth effect's deps, which stay stable
  // like before) so the auth listener can call the latest closures without
  // re-subscribing on every node/edge edit.
  const sharedFnRef = useRef({})
  useEffect(() => { sharedFnRef.current = { refreshSharedCanvases, refreshSharedOutCanvasIds } })

  // ── Auth listener ─────────────────────────────────────────────────────────
  useEffect(() => {
    // Link share: #share=<token>. Store it across an OAuth redirect, remove it
    // from the address bar, then show the explicit accept/decline preview.
    const hashMatch = location.hash.match(/^#share=(.+)$/)
    const storedToken = sessionStorage.getItem(PENDING_SHARE_TOKEN_KEY)
    const initialToken = hashMatch?.[1] ?? storedToken
    if (initialToken) {
      const token = initialToken
      pendingShareTokenRef.current = token
      sessionStorage.setItem(PENDING_SHARE_TOKEN_KEY, token)
      if (hashMatch) history.replaceState(null, '', location.pathname + location.search)
      isShareLinkActive(token).then((active) => {
        if (active || pendingShareTokenRef.current !== token) return
        pendingShareTokenRef.current = null
        sessionStorage.removeItem(PENDING_SHARE_TOKEN_KEY)
        setAuthNotice(null)
        setShareLinkError('이 공유 링크는 더 이상 유효하지 않습니다.')
        history.replaceState(null, '', location.pathname + location.search)
      }).catch((err) => console.error('[shares] share link check:', err.message))
    }

    const afterLogin = async (u) => {
      canvasSyncBaseRef.current.clear()
      dirtyCanvasSnapshotsRef.current.clear()
      conflictedCanvasKeysRef.current.clear()
      setSyncConflict(null)
      const cachedOwner = loadCanvasStorageOwner()
      if (cachedOwner && cachedOwner !== u.id) resetToGuestCanvas()
      saveCanvasStorageOwner(u.id)
      initializedUserRef.current = u.id
      cloudHydratedUserRef.current = null
      setAuthNotice(null)
      const preferredCanvasId = loadLastOpenedCanvas(u.id)
      try {
        await loadFromCloud(u.id, preferredCanvasId)
      } catch (err) {
        console.error('[cloud] hydrate before invite:', err.message)
      }
      Promise.all([getMyProfile(), loadMySettings()]).then(([p, privateSettings]) => {
        setMyProfile(p)
        // Seed App-level settings from the private own-user preference row;
        // any missing field keeps its
        // current value (localStorage lodThreshold / 'dark' theme default).
        if (privateSettings) setSettings((prev) => ({ ...prev, ...privateSettings }))
      }).catch((err) => console.error('[profiles] load profile/settings:', err.message))
      if (u.email) upsertMyEmail(u.email).catch((err) => console.error('[profiles] upsertMyEmail:', err.message))
      sharedFnRef.current.refreshSharedOutCanvasIds()
      try { await loadPendingEmailInvites() } catch (err) { console.error('[shares] loadPendingEmailInvites:', err.message) }

      let availableShared = []
      let sharedListLoaded = false
      try {
        availableShared = await listSharedCanvases()
        sharedListLoaded = true
        setSharedCanvases(availableShared)
      } catch (err) {
        console.error('[shares] restore shared canvases:', err.message)
      }

      if (pendingShareTokenRef.current) {
        const token = pendingShareTokenRef.current
        pendingShareTokenRef.current = null
        try {
          const preview = await getShareLinkPreview(token)
          if (preview) {
            setLinkInviteNotice({ ...preview, token })
          } else {
            sessionStorage.removeItem(PENDING_SHARE_TOKEN_KEY)
            setShareLinkError('이 공유 링크는 더 이상 사용할 수 없습니다.')
          }
        } catch (err) {
          console.error('[shares] share link preview:', err.message)
          setShareLinkError('이 공유 링크를 확인할 수 없습니다.')
        }
        return
      }

      const preferredShared = parseSharedId(preferredCanvasId)
      if (preferredShared && !sharedListLoaded) {
        // The own-canvas hydration above is provisional. Keep the tab-local
        // target on a transient network failure so the next refresh can retry.
        saveLastOpenedCanvas(u.id, preferredCanvasId)
      }
      if (preferredShared && availableShared.some((item) => (
        item.ownerId === preferredShared.ownerId && item.canvasId === preferredShared.canvasId
      ))) {
        try {
          await loadSharedCanvas(preferredShared.ownerId, preferredShared.canvasId)
        } catch (err) {
          if (!handleSharedAccessLost(preferredShared.ownerId, preferredShared.canvasId, err)) {
            console.error('[shares] restore active shared canvas:', err.message)
            saveLastOpenedCanvas(u.id, preferredCanvasId)
          }
        }
      }
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null
      userRef.current = u
      setUser(u)
      if (u) {
        if (u.id !== initializedUserRef.current) afterLogin(u)
      }
      // Logged-out visitor following a share link: gate access behind login.
      else if (pendingShareTokenRef.current) setAuthNotice('공유받은 캔버스를 보려면 로그인이 필요합니다')
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const u = session?.user ?? null
      userRef.current = u
      setUser(u)
      // supabase-js re-emits SIGNED_IN on tab-refocus (token revalidation) even
      // when it's the same user already signed in — only run afterLogin (which
      // ends by switching to this browser's active_canvas_id) on an actual new
      // sign-in, not that revalidation echo.
      if (event === 'SIGNED_IN' && u && u.id !== initializedUserRef.current) afterLogin(u)
      if (event === 'SIGNED_OUT') {
        if (initializedUserRef.current) resetToGuestCanvas()
        initializedUserRef.current = null
        cloudHydratedUserRef.current = null
        loadedSharedIdRef.current = null
        inviteActionPendingRef.current = false
        setInviteActionBusy(false)
        setInviteActionError(null)
        setEmailInviteNotices([])
        setLinkInviteNotice(null)
        setSharedCanvases([])
        setSharedOutCanvasIds(new Set())
        setScopedParticipantMap({})
        canvasSyncBaseRef.current.clear()
        dirtyCanvasSnapshotsRef.current.clear()
        conflictedCanvasKeysRef.current.clear()
        setSyncConflict(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [loadFromCloud, resetToGuestCanvas, loadPendingEmailInvites, loadSharedCanvas, handleSharedAccessLost])

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
        .select('name, nodes, edges, notes, views, stage_types, updated_at')
        .eq('user_id', user.id)
        .eq('canvas_id', id)
        .maybeSingle()
      if (!row) return
      if (dirtyCanvasSnapshotsRef.current.has(id) || conflictedCanvasKeysRef.current.has(id)) return
      canvasSyncBaseRef.current.set(id, { revision: row.updated_at, snapshot: cloudRowSnapshot(row) })

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
        notes: sanitizeNotes(row.notes),
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
      if (sameCanvasSnapshot(local, mirror)) return

      isRestoring.current = true
      const nEdges = normalizeEdges(mirror.edges)
      setNodes(mirror.nodes)
      setEdges(nEdges)
      setNotes(mirror.notes)
      setViews(mirror.views)
      setStageTypes(mirror.stageTypes ?? DEFAULT_STAGE_TYPES)
      counterRef.current = maxNodeId(mirror.nodes)
      // Push (not reset) history so Ctrl+Z can undo a remote change
      const snap = { nodes: mirror.nodes.map(stripNode), edges: nEdges.map(stripEdge), notes: mirror.notes.map(stripNote) }
      historyStack.current = appendHistorySnapshot(historyStack.current, historyPointer.current, snap)
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

  // ── Shared refresh: direct owner-row Realtime would bypass the permission
  // gateway, so invitees poll the same redacting server endpoint instead.
  useEffect(() => {
    if (!user) return
    const shared = parseSharedId(activeCanvasId)
    if (!shared) return
    const timer = setInterval(() => {
      const key = sharedCanvasId(shared.ownerId, shared.canvasId)
      if (!isAnyEditingRef.current && !dirtyCanvasSnapshotsRef.current.has(key) && !conflictedCanvasKeysRef.current.has(key)) {
        loadSharedCanvas(shared.ownerId, shared.canvasId)
          .catch((err) => {
            if (!handleSharedAccessLost(shared.ownerId, shared.canvasId, err)) {
              console.error('[shares] shared refresh:', err.message)
            }
          })
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [user, activeCanvasId, loadSharedCanvas, handleSharedAccessLost])

  // ── Presence: who else is viewing the active canvas ───────────────────────
  useEffect(() => {
    if (!user || !activeCanvasId) { setOnlineUsers([]); return }
    const shared = parseSharedId(activeCanvasId)
    const ownerId = shared ? shared.ownerId : user.id
    const canvasId = shared ? shared.canvasId : activeCanvasId
    const { unsubscribe } = joinCanvasPresence({ ownerId, canvasId, user, onlineRef_or_callback: setOnlineUsers })
    return () => { unsubscribe(); setOnlineUsers([]) }
  }, [user, activeCanvasId])

  // ── Presence heartbeat: bump my profiles.last_seen_at while a canvas is
  // open, so other participants' mini profile cards can show a relative
  // "마지막 접속" time even when I'm not currently online.
  useEffect(() => {
    if (!user || !activeCanvasId) return
    touchLastSeen().catch((err) => console.error('[profiles] touchLastSeen:', err.message))
    const timer = setInterval(() => {
      touchLastSeen().catch((err) => console.error('[profiles] touchLastSeen:', err.message))
    }, 60000)
    return () => clearInterval(timer)
  }, [user, activeCanvasId])

  // Refresh the CanvasTabs avatar-row participants whenever the active canvas changes.
  useEffect(() => { refreshShareParticipants() }, [refreshShareParticipants, activeCanvasId, user])

  // Invitations are changed from other browsers and are not part of the
  // canvases Realtime publication. Periodically refresh only the small sharing
  // metadata so accepted/rejected invites and scoped avatars do not stay stale.
  useEffect(() => {
    if (!user) return
    const timer = setInterval(() => {
      refreshShareParticipants()
      refreshSharedOutCanvasIds()
      refreshSharedCanvases()
    }, 20000)
    return () => clearInterval(timer)
  }, [user, refreshShareParticipants, refreshSharedOutCanvasIds, refreshSharedCanvases])

  // Merge in live online status without re-fetching profiles on every presence tick.
  const onlineIdSet = useMemo(() => new Set(onlineUsers.map((u) => u.user_id)), [onlineUsers])
  const shareParticipants = useMemo(
    () => shareParticipantsBase.map((p) => ({ ...p, online: p.userId ? onlineIdSet.has(p.userId) : false })),
    [shareParticipantsBase, onlineIdSet],
  )
  const scopedParticipantsByTarget = useMemo(() => {
    const next = {}
    Object.entries(scopedParticipantMap).forEach(([key, participants]) => {
      next[key] = participants.map((participant) => ({
        ...participant,
        online: participant.userId ? onlineIdSet.has(participant.userId) : false,
      }))
    })
    return next
  }, [scopedParticipantMap, onlineIdSet])

  const applySyncedSnapshot = useCallback((key, snapshot) => {
    const data = {
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      notes: snapshot.notes,
      views: snapshot.views,
      stageTypes: snapshot.stageTypes,
    }
    saveCanvasData(key, data)
    const shared = parseSharedId(key)
    if (shared) {
      setSharedCanvases((prev) => prev.map((canvas) => (
        canvas.ownerId === shared.ownerId && canvas.canvasId === shared.canvasId
          ? { ...canvas, name: snapshot.name }
          : canvas
      )))
    } else {
      setCanvases((prev) => prev.map((canvas) => (canvas.id === key ? { ...canvas, name: snapshot.name } : canvas)))
    }
    if (latestRef.current.activeCanvasId !== key) return

    const nextNodes = sortParentsFirst(sanitizeNodes(snapshot.nodes))
    const nextEdges = normalizeEdges(snapshot.edges)
    isRestoring.current = true
    setNodes(nextNodes)
    setEdges(nextEdges)
    setNotes(sanitizeNotes(snapshot.notes))
    setViews(snapshot.views ?? [])
    setStageTypes(snapshot.stageTypes?.length ? snapshot.stageTypes : DEFAULT_STAGE_TYPES)
    const historySnapshot = { nodes: nextNodes.map(stripNode), edges: nextEdges.map(stripEdge), notes: sanitizeNotes(snapshot.notes).map(stripNote) }
    historyStack.current = appendHistorySnapshot(historyStack.current, historyPointer.current, historySnapshot)
    historyPointer.current = historyStack.current.length - 1
    setTimeout(() => { isRestoring.current = false }, 400)
  }, [setNodes, setEdges])

  const saveQueuedCanvas = useCallback(async (entry, expectedRevision) => {
    const snapshot = entry.snapshot
    if (entry.shared) {
      const saved = await updateSharedCanvas(
        entry.ownerId,
        entry.canvasId,
        snapshot.nodes,
        snapshot.edges,
        snapshot.notes,
        snapshot.views,
        snapshot.stageTypes,
        expectedRevision,
      )
      return {
        revision: saved.revision,
        permission: saved.permission,
        snapshot: canvasSnapshot(saved.name, {
          nodes: saved.nodes,
          edges: saved.edges,
          notes: saved.notes,
          views: saved.views,
          stageTypes: saved.stageTypes,
        }),
      }
    }
    const revision = await cloudSaveCanvas(
      entry.userId,
      entry.canvasId,
      snapshot.name,
      snapshot.nodes,
      snapshot.edges,
      snapshot.notes,
      snapshot.views,
      snapshot.stageTypes,
      expectedRevision,
    )
    return { revision, snapshot }
  }, [])

  const fetchRemoteCanvas = useCallback(async (entry) => {
    if (entry.shared) {
      const row = await getSharedCanvas(entry.ownerId, entry.canvasId)
      return {
        revision: row.revision,
        permission: row.permission,
        snapshot: canvasSnapshot(row.name, {
          nodes: row.nodes,
          edges: row.edges,
          notes: row.notes,
          views: row.views,
          stageTypes: row.stageTypes,
        }),
      }
    }
    const row = await cloudLoadCanvasRow(entry.userId, entry.canvasId)
    return row ? { revision: row.updated_at, snapshot: cloudRowSnapshot(row) } : null
  }, [])

  const finishQueuedSave = useCallback((entry, saved, shouldApply = false) => {
    canvasSyncBaseRef.current.set(entry.key, saved)
    conflictedCanvasKeysRef.current.delete(entry.key)
    const stillCurrent = dirtyCanvasSnapshotsRef.current.get(entry.key) === entry
    if (stillCurrent) dirtyCanvasSnapshotsRef.current.delete(entry.key)
    if (shouldApply && stillCurrent) applySyncedSnapshot(entry.key, saved.snapshot)
  }, [applySyncedSnapshot])

  const flushDirtyCanvases = useCallback(async () => {
    const currentUser = userRef.current
    if (!currentUser || cloudHydratedUserRef.current !== currentUser.id || syncFlushRunningRef.current
        || conflictedCanvasKeysRef.current.size) return
    syncFlushRunningRef.current = true
    setCloudSyncing(true)
    try {
      for (const initialEntry of [...dirtyCanvasSnapshotsRef.current.values()]) {
        if (conflictedCanvasKeysRef.current.has(initialEntry.key)) continue
        const base = canvasSyncBaseRef.current.get(initialEntry.key)
        if (initialEntry.shared && !base?.revision) continue
        try {
          const saved = await saveQueuedCanvas(initialEntry, base?.revision ?? null)
          const changedByServer = JSON.stringify(saved.snapshot) !== JSON.stringify(initialEntry.snapshot)
          finishQueuedSave(initialEntry, saved, changedByServer)
        } catch (error) {
          if (error instanceof CanvasSchemaGuardError) {
            conflictedCanvasKeysRef.current.add(initialEntry.key)
            setCanvasSchemaGuardError(error.message)
            console.error('[cloud] schema guard:', error.message)
            break
          }
          if (!(error instanceof CanvasConflictError)) {
            if (initialEntry.shared) {
              try {
                const refreshed = await fetchRemoteCanvas(initialEntry)
                if (refreshed.permission?.canEdit === false) {
                  dirtyCanvasSnapshotsRef.current.delete(initialEntry.key)
                  canvasSyncBaseRef.current.set(initialEntry.key, refreshed)
                  applySyncedSnapshot(initialEntry.key, refreshed.snapshot)
                  setShareLinkError('이 공유 캔버스가 읽기 전용으로 변경되어 저장되지 않은 편집을 반영하지 않았습니다.')
                }
              } catch (accessError) {
                if (handleSharedAccessLost(initialEntry.ownerId, initialEntry.canvasId, accessError)) {
                  dirtyCanvasSnapshotsRef.current.delete(initialEntry.key)
                }
              }
            }
            console.error('[cloud] queued autosave:', error.message)
            continue
          }

          const remote = await fetchRemoteCanvas(initialEntry)
          if (!remote) {
            console.error('[cloud] canvas was deleted before it could be saved:', initialEntry.canvasId)
            continue
          }
          const latestEntry = dirtyCanvasSnapshotsRef.current.get(initialEntry.key) ?? initialEntry
          const mergeBase = base?.snapshot ?? canvasSnapshot(latestEntry.snapshot.name)
          const result = mergeCanvasSnapshots(mergeBase, latestEntry.snapshot, remote.snapshot)

          if (latestEntry.shared) {
            result.merged.name = remote.snapshot.name
            if (remote.permission?.scope !== 'canvas') {
              result.merged.views = remote.snapshot.views
              result.merged.stageTypes = remote.snapshot.stageTypes
            }
          }

          if (!result.conflicts.length) {
            const mergedEntry = { ...latestEntry, snapshot: result.merged }
            dirtyCanvasSnapshotsRef.current.set(mergedEntry.key, mergedEntry)
            const saved = await saveQueuedCanvas(mergedEntry, remote.revision)
            finishQueuedSave(mergedEntry, saved, true)
            continue
          }

          conflictedCanvasKeysRef.current.add(latestEntry.key)
          setSyncConflict({
            entry: latestEntry,
            remote,
            proposed: result.merged,
            conflicts: result.conflicts,
          })
          break
        }
      }

      const { canvases: cvs, activeCanvasId: aid } = latestRef.current
      const prefsPayload = JSON.stringify({ aid, cvs })
      if (prefsPayload !== lastPushedPrefsRef.current) {
        await cloudSaveUserPrefs(currentUser.id, { active_canvas_id: aid, canvas_order: cvs })
        lastPushedPrefsRef.current = prefsPayload
      }
    } catch (error) {
      console.error('[cloud] flush queue:', error.message)
    } finally {
      syncFlushRunningRef.current = false
      setCloudSyncing(false)
    }
  }, [applySyncedSnapshot, fetchRemoteCanvas, finishQueuedSave, handleSharedAccessLost, saveQueuedCanvas])

  // Debounce normal edits, then keep a slow retry heartbeat for transient
  // network failures. The queue retains canvases switched away from before the
  // debounce elapsed, so quick tab changes cannot strand unsaved work.
  useEffect(() => {
    if (!user) return undefined
    const timer = setTimeout(flushDirtyCanvases, 1500)
    return () => clearTimeout(timer)
  }, [user, nodes, edges, notes, stageTypes, canvases, activeCanvasId, views, flushDirtyCanvases])

  useEffect(() => {
    if (!user) return undefined
    const timer = setInterval(flushDirtyCanvases, 10000)
    return () => clearInterval(timer)
  }, [user, flushDirtyCanvases])

  const resolveSyncConflict = useCallback(async (keepLocal) => {
    if (!syncConflict || syncConflict.busy) return
    const { entry, remote, proposed } = syncConflict
    setSyncConflict((current) => ({ ...current, busy: true, error: null }))
    try {
      if (!keepLocal) {
        const latestRemote = await fetchRemoteCanvas(entry)
        if (!latestRemote) throw new Error('캔버스가 삭제되었습니다.')
        dirtyCanvasSnapshotsRef.current.delete(entry.key)
        conflictedCanvasKeysRef.current.delete(entry.key)
        canvasSyncBaseRef.current.set(entry.key, latestRemote)
        applySyncedSnapshot(entry.key, latestRemote.snapshot)
        setSyncConflict(null)
        return
      }

      const proposedEntry = { ...entry, snapshot: proposed }
      dirtyCanvasSnapshotsRef.current.set(entry.key, proposedEntry)
      const saved = await saveQueuedCanvas(proposedEntry, remote.revision)
      finishQueuedSave(proposedEntry, saved, true)
      setSyncConflict(null)
    } catch (error) {
      if (error instanceof CanvasSchemaGuardError) {
        conflictedCanvasKeysRef.current.add(entry.key)
        setCanvasSchemaGuardError(error.message)
        setSyncConflict(null)
        return
      }
      if (error instanceof CanvasConflictError) {
        try {
          const newest = await fetchRemoteCanvas(entry)
          const latestEntry = dirtyCanvasSnapshotsRef.current.get(entry.key) ?? entry
          const base = canvasSyncBaseRef.current.get(entry.key)?.snapshot ?? canvasSnapshot(latestEntry.snapshot.name)
          const result = mergeCanvasSnapshots(base, latestEntry.snapshot, newest.snapshot)
          if (latestEntry.shared) {
            result.merged.name = newest.snapshot.name
            if (newest.permission?.scope !== 'canvas') {
              result.merged.views = newest.snapshot.views
              result.merged.stageTypes = newest.snapshot.stageTypes
            }
          }
          setSyncConflict({
            entry: latestEntry,
            remote: newest,
            proposed: result.merged,
            conflicts: result.conflicts,
            busy: false,
            error: '선택하는 동안 다른 변경이 또 저장되어 최신 상태로 비교를 갱신했습니다.',
          })
          return
        } catch (refreshError) {
          error = refreshError
        }
      }
      setSyncConflict((current) => current ? {
        ...current,
        busy: false,
        error: error.message,
      } : current)
    }
  }, [applySyncedSnapshot, fetchRemoteCanvas, finishQueuedSave, saveQueuedCanvas, syncConflict])

  // Persist the active canvas id promptly (the 1.5 s content autosave is
  // debounced and skipped on shared canvases, so a quick refresh could restore
  // a stale tab). Only own-canvas ids are stored — a shared composite id has no
  // canvases row and would reload blank. Waits for cloud hydration so the
  // transient guest canvas never overwrites the real active id.
  useEffect(() => {
    if (!user || cloudHydratedUserRef.current !== user.id) return
    if (parseSharedId(activeCanvasId)) return
    const t = setTimeout(() => {
      cloudSaveUserPrefs(user.id, { active_canvas_id: activeCanvasId, canvas_order: latestRef.current.canvases })
        .catch((err) => console.error('[cloud] persist active id:', err.message))
    }, 300)
    return () => clearTimeout(t)
  }, [user, activeCanvasId])

  // ── Sharing: permission model for the active canvas ───────────────────────
  // Own canvases are always full-edit 'owner'. A shared composite activeCanvasId resolves to whichever
  // matching share is most permissive (canvas > group > node).
  const perm = useMemo(() => {
    const parsed = parseSharedId(activeCanvasId)
    if (!parsed) return { role: 'owner', scope: 'canvas', targetId: null, restrictView: false, canEdit: true }
    const matches = sharedCanvases.filter((s) => s.ownerId === parsed.ownerId && s.canvasId === parsed.canvasId)
    // Fail closed while an invite list is loading or an invite was revoked.
    if (!matches.length) return { role: 'invitee', scope: 'node', targetId: null, restrictView: true, canEdit: false }
    const priority = { canvas: 0, group: 1, node: 2 }
    const best = [...matches].sort((a, b) => (
      priority[a.scope] - priority[b.scope]
      || Number(b.canEdit) - Number(a.canEdit)
      || Number(a.restrictView) - Number(b.restrictView)
    ))[0]
    return { role: 'invitee', scope: best.scope, targetId: best.targetId, restrictView: best.restrictView, canEdit: best.canEdit !== false }
  }, [activeCanvasId, sharedCanvases])
  const imageContext = useMemo(() => {
    if (!user) return null
    const shared = parseSharedId(activeCanvasId)
    return shared
      ? { ownerId: shared.ownerId, canvasId: shared.canvasId }
      : { ownerId: user.id, canvasId: activeCanvasId }
  }, [activeCanvasId, user])

  // Kept fresh every render so the touch long-press gesture handler (bound
  // once, high up in the file, well before `perm` exists) can read the
  // current permission without needing to be in that effect's deps.
  const permRef = useRef(perm)
  useEffect(() => { permRef.current = perm })

  // canEdit === false (read-only share): the whole canvas is view-only,
  // regardless of scope — this overrides the group/node scope carve-out below.
  const canEditCanvas = !(perm.role === 'invitee' && perm.canEdit === false)
  const canEditNotes = canEditCanvas && (perm.role === 'owner' || perm.scope === 'canvas')

  useEffect(() => {
    setDigitalTwinReview(null)
    setTwinProposalPreview(null)
    setTwinProposalStatus(null)
  }, [activeCanvasId])
  useEffect(() => {
    let cancelled = false
    const timer = setTimeout(() => {
      const canvas = { nodes: nodes.map(stripNode), edges: edges.map(stripEdge) }
      inspectDigitalTwinCanvas(canvas)
        .then((review) => { if (!cancelled) setDigitalTwinReview(review) })
        .catch((error) => {
          console.error('[digital-twin] inspect canvas:', error)
          if (!cancelled) setDigitalTwinReview(null)
        })
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [activeCanvasId, nodes, edges])
  const digitalTwinReviewRoot = digitalTwinReview?.source.rootNodeId
    ? nodes.find((node) => node.id === digitalTwinReview.source.rootNodeId)
    : null
  const digitalTwinReviewState = digitalTwinReviewRoot?.data?.digitalTwinReview
  const digitalTwinReviewPartitions = useMemo(() => (
    digitalTwinReview
      ? partitionDigitalTwinReviewItems(digitalTwinReview.items, digitalTwinReviewState)
      : { pending: [], reviewed: [], ignored: [], decisions: {} }
  ), [digitalTwinReview, digitalTwinReviewState])
  const canDecideTwinReview = perm.role === 'owner' && !!digitalTwinReview?.source.rootNodeId
  const twinProposalPreviewItem = twinProposalPreview && digitalTwinReview
    ? digitalTwinReview.items.find((item) => (
        item.id === twinProposalPreview.itemId
        && item.fingerprint === twinProposalPreview.itemFingerprint
        && digitalTwinProposalMatchesItem(item.proposal, item)
      ))
    : null
  const activeTwinProposal = twinProposalPreviewItem?.proposal ?? null
  const twinProposalPlan = useMemo(() => {
    if (!activeTwinProposal) return { nodes: [], edges: [], parts: [], partReplacements: [], alreadyPresent: [], error: null }
    try {
      return {
        ...planDigitalTwinGraphProposal({ nodes, edges }, activeTwinProposal),
        error: null,
      }
    } catch (error) {
      return { nodes: [], edges: [], parts: [], partReplacements: [], alreadyPresent: [], error: error?.message ?? '수정안을 미리 볼 수 없습니다.' }
    }
  }, [activeTwinProposal, nodes, edges])
  const twinProposalPreviewNodes = useMemo(() => twinProposalPlan.nodes.map((node) => ({
    ...node,
    className: `${node.className ? `${node.className} ` : ''}digital-twin-proposal-node`,
    draggable: false,
    selectable: false,
    deletable: false,
    data: { ...node.data, digitalTwinProposalPreview: true },
  })), [twinProposalPlan.nodes])
  const twinProposalPreviewNodeIds = useMemo(
    () => new Set(twinProposalPreviewNodes.map((node) => node.id)),
    [twinProposalPreviewNodes],
  )
  const twinProposalPreviewPartsByNode = useMemo(() => {
    const byNode = new Map()
    for (const planned of twinProposalPlan.parts) {
      const current = byNode.get(planned.targetNodeId) ?? { additions: [], replacements: [] }
      current.additions.push(planned.part)
      byNode.set(planned.targetNodeId, current)
    }
    for (const planned of twinProposalPlan.partReplacements) {
      const current = byNode.get(planned.targetNodeId) ?? { additions: [], replacements: [] }
      current.replacements.push(planned)
      byNode.set(planned.targetNodeId, current)
    }
    return byNode
  }, [twinProposalPlan.parts, twinProposalPlan.partReplacements])
  const twinProposalPreviewAugmentedNodeIds = useMemo(
    () => new Set(twinProposalPreviewPartsByNode.keys()),
    [twinProposalPreviewPartsByNode],
  )
  const twinProposalPreviewEdges = useMemo(() => twinProposalPlan.edges.map((edge) => ({
    ...edge,
    className: `${edge.className ? `${edge.className} ` : ''}wfc-edge digital-twin-proposal-edge`,
    selectable: false,
    deletable: false,
    reconnectable: false,
    zIndex: 1000,
    style: { ...edge.style, stroke: '#f59e0b', strokeWidth: 3, strokeDasharray: '7 5' },
    markerEnd: edge.markerEnd ? { ...edge.markerEnd, color: '#f59e0b' } : undefined,
  })), [twinProposalPlan.edges])
  const twinProposalFitKey = digitalTwinProposalAutoFitKey(activeCanvasId, activeTwinProposal)
  const lastFittedTwinProposalRef = useRef(null)

  useEffect(() => {
    if (!digitalTwinReview) setTwinReviewOpen(false)
  }, [activeCanvasId, digitalTwinReview])

  useEffect(() => {
    if (twinProposalPreview && !twinProposalPreviewItem) setTwinProposalPreview(null)
  }, [twinProposalPreview, twinProposalPreviewItem])

  useEffect(() => {
    if (!twinProposalFitKey) {
      lastFittedTwinProposalRef.current = null
      return undefined
    }
    if (
      !rfInstance
      || twinProposalPlan.error
      || (
        !twinProposalPlan.nodes.length
        && !twinProposalPlan.edges.length
        && !twinProposalPlan.parts.length
        && !twinProposalPlan.partReplacements.length
      )
      || lastFittedTwinProposalRef.current === twinProposalFitKey
    ) return undefined
    lastFittedTwinProposalRef.current = twinProposalFitKey
    const ids = [...new Set([
      ...twinProposalPlan.nodes.map((node) => node.id),
      ...twinProposalPlan.edges.flatMap((edge) => [edge.source, edge.target]),
      ...twinProposalPlan.parts.map((planned) => planned.targetNodeId),
      ...twinProposalPlan.partReplacements.map((planned) => planned.targetNodeId),
    ])]
    const timer = setTimeout(() => {
      rfInstance.fitView({ nodes: ids.map((id) => ({ id })), duration: 450, padding: 0.4, maxZoom: 1.05 })
    }, 0)
    return () => clearTimeout(timer)
  }, [
    rfInstance,
    twinProposalFitKey,
    twinProposalPlan.error,
    twinProposalPlan.nodes,
    twinProposalPlan.edges,
    twinProposalPlan.parts,
    twinProposalPlan.partReplacements,
  ])

  const decideDigitalTwinReviewItem = useCallback((item, disposition) => {
    if (!canDecideTwinReview || item?.sourceId !== digitalTwinReview?.source.id) return
    setTwinProposalPreview(null)
    setTwinProposalStatus(null)
    const rootNodeId = digitalTwinReview.source.rootNodeId
    setNodes((currentNodes) => currentNodes.map((node) => (
      node.id === rootNodeId
        ? {
            ...node,
            data: {
              ...node.data,
              digitalTwinReview: setDigitalTwinReviewDecision(node.data?.digitalTwinReview, item, disposition),
            },
          }
        : node
    )))
  }, [canDecideTwinReview, digitalTwinReview, setNodes])

  const clearDigitalTwinReviewItem = useCallback((item) => {
    if (!canDecideTwinReview || item?.sourceId !== digitalTwinReview?.source.id) return
    const rootNodeId = digitalTwinReview.source.rootNodeId
    setNodes((currentNodes) => currentNodes.map((node) => (
      node.id === rootNodeId
        ? {
            ...node,
            data: {
              ...node.data,
              digitalTwinReview: clearDigitalTwinReviewDecision(node.data?.digitalTwinReview, item),
            },
          }
        : node
    )))
  }, [canDecideTwinReview, digitalTwinReview, setNodes])

  const previewDigitalTwinProposal = useCallback((item) => {
    if (!digitalTwinProposalMatchesItem(item?.proposal, item)) return
    setTwinProposalStatus(null)
    setTwinProposalPreview((current) => (
      current?.itemId === item.id && current?.itemFingerprint === item.fingerprint
        ? null
        : { itemId: item.id, itemFingerprint: item.fingerprint }
    ))
  }, [])

  const applyDigitalTwinProposal = useCallback((item) => {
    const isPending = digitalTwinReviewPartitions.pending.some((candidate) => (
      candidate.id === item?.id && candidate.fingerprint === item?.fingerprint
    ))
    if (!canDecideTwinReview || !isPending || !digitalTwinProposalMatchesItem(item?.proposal, item)) {
      setTwinProposalStatus({ type: 'error', message: '최신 검토 항목이 아니거나 적용 권한이 없습니다.' })
      return
    }
    try {
      const result = applyDigitalTwinGraphProposal({ nodes, edges }, item.proposal)
      const rootNodeId = digitalTwinReview.source.rootNodeId
      const nextNodes = result.nodes.map((node) => (
        node.id === rootNodeId
          ? {
              ...node,
              data: {
                ...node.data,
                digitalTwinReview: setDigitalTwinReviewDecision(node.data?.digitalTwinReview, item, 'reviewed'),
              },
            }
          : node
      ))
      setNodes(sanitizeNodes(nextNodes))
      setEdges(result.edges.map(stripEdge))
      setTwinProposalPreview(null)
      setTwinProposalStatus({
        type: 'success',
        message: result.writesPerformed
          ? `지도에 노드 ${result.appliedNodeIds.length}개, 연결선 ${result.appliedEdgeIds.length}개, 시스템 파츠 ${result.appliedPartIds.length}개 변경을 적용했습니다.`
          : '같은 수정안이 이미 지도에 적용되어 있습니다.',
      })
    } catch (error) {
      setTwinProposalStatus({ type: 'error', message: error?.message ?? '수정안을 적용하지 못했습니다.' })
    }
  }, [canDecideTwinReview, digitalTwinReview, digitalTwinReviewPartitions.pending, edges, nodes, setEdges, setNodes])

  // Set of node ids an invitee may edit; null means "everything" (owner or canvas-scope).
  const editableSet = useMemo(() => {
    if (perm.role === 'owner') return null
    if (!canEditCanvas) return new Set()
    if (perm.scope === 'canvas') return null
    if (perm.scope === 'group') return new Set(nodes.filter((n) => n.parentId === perm.targetId).map((n) => n.id))
    if (perm.scope === 'node') return new Set([perm.targetId])
    return new Set()
  }, [perm, nodes, canEditCanvas])
  const isNodeEditable = useCallback((id) => editableSet === null || editableSet.has(id), [editableSet])

  // Someone other than me online in the active canvas → glow the invite icons.
  // Close the invite popover on outside click / Escape.
  useEffect(() => {
    if (!invite) return
    const onDown = (e) => {
      if (inviteWrapRef.current && !inviteWrapRef.current.contains(e.target)) {
        setInvite(null); refreshShareParticipants(); refreshSharedOutCanvasIds()
      }
    }
    const onKey = (e) => { if (e.key === 'Escape') { setInvite(null); refreshShareParticipants(); refreshSharedOutCanvasIds() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [invite])

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

  // restrict_view: the invited region (canvas scope has no region — null).
  // Used only for the one-time fitBounds-on-open below and to compute which
  // nodes get forceShapeOnly (panning itself stays free, no viewport clamp).
  const restrictBounds = useMemo(() => {
    if (perm.role !== 'invitee' || !perm.restrictView || perm.scope === 'canvas' || !perm.targetId) return null
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const target = byId.get(perm.targetId)
    if (!target) return null
    const { x, y } = absoluteNodePosition(target, byId)
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

  // restrict_view: nodes OUTSIDE the invited region (region = the target node
  // for node-scope, or the group frame + its children for group-scope) get
  // `data.forceShapeOnly` — they lose all text/content and render as bare
  // shapes. Canvas-scope invitees have no region, so this is a no-op for them.
  const forceShapeOnlySet = useMemo(() => {
    if (perm.role !== 'invitee' || !perm.restrictView || perm.scope === 'canvas' || !perm.targetId) return null
    const visible = new Set([perm.targetId])
    if (perm.scope === 'group') nodes.forEach((n) => { if (n.parentId === perm.targetId) visible.add(n.id) })
    return new Set(nodes.filter((n) => !visible.has(n.id)).map((n) => n.id))
  }, [perm, nodes])

  // ── Node data ────────────────────────────────────────────────────────────
  const updateNodeData = useCallback((id, patch) => {
    setNodes((nds) => nds.map((n) => n.id === id ? { ...n, data: sanitizeNodeData({ ...n.data, ...patch }) } : n))
    if (Object.hasOwn(patch, 'systemParts')) {
      setSystemPartRuntimeByNode((current) => {
        if (!Object.hasOwn(current, id)) return current
        const next = { ...current }
        delete next[id]
        return next
      })
      const remainingPartIds = new Set(normalizeSystemParts(patch.systemParts).map((part) => part.id))
      setEdges((currentEdges) => currentEdges.filter((edge) => {
        if (!isPartEdge(edge)) return true
        if (edge.source === id && !remainingPartIds.has(partIdFromHandle(edge.sourceHandle))) return false
        if (edge.target === id && !remainingPartIds.has(partIdFromHandle(edge.targetHandle))) return false
        return true
      }))
    }
  }, [setEdges, setNodes])

  const runSystemPartRuntimeCheck = useCallback(async (nodeId, part) => {
    const canvasId = latestRef.current.activeCanvasId
    const capability = systemRuntimeCapabilityForPart(part, nodeId)
    if (!userRef.current || parseSharedId(canvasId) || !capability) return
    const partId = part.id
    setSystemPartRuntimeByNode((current) => ({
      ...current,
      [nodeId]: {
        ...(current[nodeId] ?? {}),
        [partId]: { status: 'checking', capabilityId: capability.id },
      },
    }))
    try {
      const response = await checkSystemPartRuntime({ canvasId, nodeId, partId })
      if (latestRef.current.activeCanvasId !== canvasId) return
      setSystemPartRuntimeByNode((current) => ({
        ...current,
        [nodeId]: { ...(current[nodeId] ?? {}), [partId]: response.result },
      }))
      setSystemRuntimeDashboard((current) => ({
        ...current,
        persistenceAvailable: response.persistenceAvailable,
        error: systemRuntimePersistenceError(response),
      }))
    } catch (error) {
      if (latestRef.current.activeCanvasId !== canvasId) return
      const result = failedSystemRuntimeResult(
        capability.id,
        error?.message || '연결 상태를 확인하지 못했습니다.',
        error?.code || 'REQUEST_FAILED',
      )
      setSystemPartRuntimeByNode((current) => ({
        ...current,
        [nodeId]: { ...(current[nodeId] ?? {}), [partId]: result },
      }))
    }
  }, [])

  const runAllSystemRuntimeChecks = useCallback(async () => {
    const canvasId = latestRef.current.activeCanvasId
    if (!userRef.current || parseSharedId(canvasId) || !systemRuntimeTargets.length) return
    const previous = systemPartRuntimeByNode
    setSystemRuntimeDashboard((current) => ({ ...current, checking: true, error: '' }))
    setSystemPartRuntimeByNode((current) => {
      const next = { ...current }
      for (const target of systemRuntimeTargets) {
        next[target.nodeId] = {
          ...(next[target.nodeId] ?? {}),
          [target.partId]: { status: 'checking', capabilityId: target.capability.id },
        }
      }
      return next
    })
    try {
      const response = await checkAllSystemRuntime({ canvasId })
      if (latestRef.current.activeCanvasId !== canvasId) return
      setSystemPartRuntimeByNode(systemRuntimeMapFromRecords(response.results))
      setSystemRuntimeDashboard({
        loading: false,
        checking: false,
        persistenceAvailable: response.persistenceAvailable,
        error: systemRuntimePersistenceError(response, systemRuntimeTargets.length),
      })
    } catch (error) {
      if (latestRef.current.activeCanvasId !== canvasId) return
      setSystemPartRuntimeByNode(previous)
      setSystemRuntimeDashboard((current) => ({
        ...current,
        checking: false,
        error: error?.message || '전체 운영 상태를 확인하지 못했습니다.',
      }))
    }
  }, [systemPartRuntimeByNode, systemRuntimeTargets])

  const updateNoteData = useCallback((id, patch) => {
    if (!canEditNotes) return
    setNotes((items) => items.map((note) => (
      note.id === id ? { ...note, data: sanitizeNodeData({ ...note.data, ...patch }) } : note
    )))
  }, [canEditNotes])

  const createNote = useCallback((type, contentKind) => {
    if (!canEditNotes || !['stage', 'memo', 'content'].includes(type)) return
    if (type === 'content' && !['photo', 'database', 'browser'].includes(contentKind)) return
    const id = `note-${crypto.randomUUID()}`
    const data = type === 'stage'
      ? { label: '새 단계', description: '', colorIdx: 0 }
      : type === 'memo'
        ? { header: '', text: '' }
        : { header: '', kind: contentKind }
    setNotes((items) => [...items, { id, type, data }])
    setNotesPanel({ type })
    setNotesSelectedId(id)
  }, [canEditNotes])

  const promoteNoteAt = useCallback((noteId, position) => {
    if (!canEditNotes) return
    const note = latestRef.current.notes.find((item) => item.id === noteId)
    if (!note || nodes.some((node) => node.id === noteId)) return
    const node = { ...stripNote(note), position }
    setNotes((items) => items.filter((item) => item.id !== noteId))
    setNodes((items) => [...items, node])
  }, [canEditNotes, nodes, setNodes])

  const promoteNoteToCenter = useCallback((noteId) => {
    if (!rfInstance || !reactFlowRef.current) return
    const rect = reactFlowRef.current.getBoundingClientRect()
    promoteNoteAt(noteId, rfInstance.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }))
  }, [rfInstance, promoteNoteAt])

  // Existing photo nodes may still contain a large data URL from older builds.
  // Move one at a time when the owner opens that canvas; a failed migration
  // leaves the original image untouched and will be retried on a later load.
  useEffect(() => {
    if (!user || perm.role !== 'owner' || cloudHydratedUserRef.current !== user.id) return
    const legacy = nodes.find((node) => (
      node.type === 'content'
      && node.data?.kind === 'photo'
      && !node.data?.storagePath
      && node.data?.src?.startsWith('data:image/')
      && !legacyImageMigrationsRef.current.has(`${activeCanvasId}:${node.id}`)
    ))
    if (!legacy) return

    const migrationKey = `${activeCanvasId}:${legacy.id}`
    legacyImageMigrationsRef.current.add(migrationKey)
    uploadCanvasImage({
      ownerId: user.id,
      canvasId: activeCanvasId,
      nodeId: legacy.id,
      blob: dataUrlToBlob(legacy.data.src),
    }).then(({ storagePath }) => {
      updateNodeData(legacy.id, { storagePath, src: null })
    }).catch((error) => {
      console.warn('[images] legacy migration:', error.message)
    })
  }, [activeCanvasId, nodes, perm.role, updateNodeData, user])

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
    if (perm.role === 'invitee' && (!canEditCanvas || perm.scope === 'node')) return
    const id = nextId()
    if (perm.role === 'invitee' && perm.scope === 'group') {
      const frame = nodes.find((n) => n.id === perm.targetId)
      if (!frame) return
      setNodes((nds) => [...nds, { id, type: 'stage', parentId: perm.targetId, position: centerInFrame(frame, 200, 80), data: { label: '새 단계', description: '', colorIdx: 0 } }])
      return
    }
    setNodes((nds) => [...nds, { id, type: 'stage', position: { x: 200 + Math.random() * 400, y: 150 + Math.random() * 300 }, data: { label: '새 단계', description: '', colorIdx: 0 } }])
  }, [setNodes, perm, nodes, canEditCanvas])

  const addMemo = useCallback(() => {
    if (perm.role === 'invitee' && (!canEditCanvas || perm.scope === 'node')) return
    const id = nextId()
    if (perm.role === 'invitee' && perm.scope === 'group') {
      const frame = nodes.find((n) => n.id === perm.targetId)
      if (!frame) return
      setNodes((nds) => [...nds, { id, type: 'memo', parentId: perm.targetId, position: centerInFrame(frame, 160, 80), data: { header: '', text: '' } }])
      return
    }
    setNodes((nds) => [...nds, { id, type: 'memo', position: { x: 300 + Math.random() * 400, y: 200 + Math.random() * 200 }, data: { header: '', text: '' } }])
  }, [setNodes, perm, nodes, canEditCanvas])

  const addStageAt = useCallback((pos) => {
    const id = nextId()
    setNodes((nds) => [...nds, { id, type: 'stage', position: pos, data: { label: '새 단계', description: '', colorIdx: 0 } }])
  }, [setNodes])

  const addMemoAt = useCallback((pos) => {
    const id = nextId()
    setNodes((nds) => [...nds, { id, type: 'memo', position: pos, data: { header: '', text: '' } }])
  }, [setNodes])

  // ── Palette (드래그&드롭 / 탭) node creation ──────────────────────────────
  // Shared by the canvas drop target (onDrop) and Toolbar's tap-to-add
  // fallback (onPaletteAdd). Respects the same gating as addStage/addMemo:
  // node-scope invitees and read-only shares can't add anywhere; group-scope
  // invitees get forced into their invited frame.
  const addFromPalette = useCallback((payload, pos) => {
    if (perm.role === 'invitee' && (!canEditCanvas || perm.scope === 'node')) return
    if (!payload?.nodeType) return
    const forceFrame = perm.role === 'invitee' && perm.scope === 'group'
    const frame = forceFrame ? nodes.find((n) => n.id === perm.targetId) : null
    if (forceFrame && !frame) return

    if (payload.nodeType === 'content') {
      const id = nextId()
      const position = forceFrame ? centerInFrame(frame, 220, 140) : pos
      const node = { id, type: 'content', position, data: { kind: payload.contentKind } }
      setNodes((nds) => [...nds, forceFrame ? { ...node, parentId: perm.targetId } : node])
      return
    }
    if (payload.nodeType === 'system') {
      const id = nextId()
      const position = forceFrame ? centerInFrame(frame, 240, 130) : pos
      const node = { id, type: 'system', position, data: createSystemNodeData(payload.systemKind) }
      setNodes((nds) => [...nds, forceFrame ? { ...node, parentId: perm.targetId } : node])
      return
    }
    if (payload.nodeType === 'stage') {
      if (forceFrame) {
        const id = nextId()
        setNodes((nds) => [...nds, { id, type: 'stage', parentId: perm.targetId, position: centerInFrame(frame, 200, 80), data: { label: '새 단계', description: '', colorIdx: 0 } }])
      } else addStageAt(pos)
      return
    }
    if (payload.nodeType === 'memo') {
      if (forceFrame) {
        const id = nextId()
        setNodes((nds) => [...nds, { id, type: 'memo', parentId: perm.targetId, position: centerInFrame(frame, 160, 80), data: { header: '', text: '' } }])
      } else addMemoAt(pos)
    }
  }, [perm, canEditCanvas, nodes, addStageAt, addMemoAt, setNodes])

  const onDragOver = useCallback((e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = e.dataTransfer.types.includes('application/wfc-note') ? 'move' : 'copy'
  }, [])

  const onDrop = useCallback((e) => {
    e.preventDefault()
    if (!rfInstance) return
    const noteId = e.dataTransfer.getData('application/wfc-note')
    if (noteId) {
      promoteNoteAt(noteId, rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
      return
    }
    let payload
    try { payload = JSON.parse(e.dataTransfer.getData('application/wfc-node') || '') } catch { return }
    addFromPalette(payload, rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY }))
  }, [rfInstance, addFromPalette, promoteNoteAt])

  // Touch fallback: Toolbar's palette has no native drag on touch devices, so
  // tapping a card adds it at the viewport center instead.
  const onPaletteAdd = useCallback((payload) => {
    if (!rfInstance) return
    addFromPalette(payload, rfInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }))
  }, [rfInstance, addFromPalette])

  // ── Copy / Paste (in-app clipboard, not the OS clipboard) ─────────────────
  const clipboardRef = useRef(null) // { nodes, edges } — stripped copies, original ids
  const pasteCountRef = useRef(0) // repeated pastes offset further each time

  const copySelection = useCallback((explicitIds) => {
    const selected = explicitIds
      ? nodes.filter((n) => explicitIds.includes(n.id))
      : nodes.filter((n) => n.selected)
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
        return { ...rest, position: absoluteNodePosition(n, byId) }
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

  // atFlowPos (optional): flow-space point to paste at (pane context menu) —
  // each node is offset relative to the clipboard bbox top-left, so the
  // pasted group lands with that corner under the clicked point. Omitted
  // (keyboard / node-menu paste): falls back to the existing +40/+40 stagger.
  const pasteClipboard = useCallback((atFlowPos) => {
    const clip = clipboardRef.current
    if (!clip || !clip.nodes.length) return
    if (perm.role === 'invitee' && (!canEditCanvas || perm.scope === 'node')) return // nowhere to paste
    const forceFrame = perm.role === 'invitee' && perm.scope === 'group'
    const frame = forceFrame ? nodes.find((n) => n.id === perm.targetId) : null
    if (forceFrame && !frame) return

    pasteCountRef.current += 1

    const idMap = new Map()
    clip.nodes.forEach((n) => idMap.set(n.id, nextId()))
    const partIdMap = new Map()
    clip.nodes.forEach((n) => {
      ;[...(n.data?.parts ?? []), ...(n.data?.systemParts ?? [])]
        .forEach((p) => partIdMap.set(p.id, `pt-${uid()}`))
    })

    // Delta applied to top-level (not parented within this clip) node positions.
    let delta
    if (atFlowPos) {
      const topLevel = clip.nodes.filter((n) => !(n.parentId && idMap.has(n.parentId)))
      const minX = Math.min(...topLevel.map((n) => n.position.x))
      const minY = Math.min(...topLevel.map((n) => n.position.y))
      delta = { x: atFlowPos.x - minX, y: atFlowPos.y - minY }
    } else {
      const offset = 40 * pasteCountRef.current
      delta = { x: offset, y: offset }
    }

    const newNodes = clip.nodes.map((n) => {
      const hasCopiedParent = !!(n.parentId && idMap.has(n.parentId))
      let parentId = hasCopiedParent ? idMap.get(n.parentId) : undefined
      let position = hasCopiedParent ? { ...n.position } : { x: n.position.x + delta.x, y: n.position.y + delta.y }

      if (forceFrame && !hasCopiedParent) {
        parentId = perm.targetId
        position = centerInFrame(frame, n.measured?.width ?? n.width ?? 200, n.measured?.height ?? n.height ?? 80)
      }

      const parts = n.data?.parts ? n.data.parts.map((p) => ({ ...p, id: partIdMap.get(p.id) ?? p.id })) : undefined
      const copiedData = detachDigitalTwinBinding(n.data)
      const systemParts = copiedData.systemParts
        ? copiedData.systemParts.map((part) => ({ ...part, id: partIdMap.get(part.id) ?? part.id }))
        : undefined
      const { parentId: _drop, ...rest } = n
      const nextData = {
        ...copiedData,
        ...(parts ? { parts } : {}),
        ...(systemParts ? { systemParts } : {}),
      }

      return {
        ...rest,
        id: idMap.get(n.id),
        position,
        ...(parentId ? { parentId } : {}),
        selected: true,
        data: nextData,
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
  }, [nodes, setNodes, setEdges, perm, canEditCanvas])

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
    // 파츠 연결 규칙: exactly one side a part handle ('p-...') → reject; both → dashed no-arrow part link.
    const sourceIsPart = !!params.sourceHandle?.startsWith('p-')
    const targetIsPart = !!params.targetHandle?.startsWith('p-')
    if (sourceIsPart !== targetIsPart) return
    if (sourceIsPart && targetIsPart) {
      const sourceNode = nodes.find((node) => node.id === params.source)
      const targetNode = nodes.find((node) => node.id === params.target)
      if (sourceNode?.type !== 'system' || targetNode?.type !== 'system') return
      const newEdge = {
        ...params,
        id: `e-${uid()}`,
        data: { partsLink: true },
        style: { stroke: '#8b94a7', strokeWidth: 2, strokeDasharray: '6,4' },
        markerEnd: undefined,
      }
      setEdges((eds) => eds.concat(newEdge))
      return
    }
    const isMemoSource = nodes.find((n) => n.id === params.source)?.type === 'memo'
    const isMemoTarget = nodes.find((n) => n.id === params.target)?.type === 'memo'
    const isMemo = isMemoSource || isMemoTarget
    const newEdge = {
      ...params,
      id: `e-${uid()}`,
      data: createEdgeRelationData(isMemo ? 'references' : 'flows_to', '', false),
      style: isMemo ? { stroke: '#f59e0b88', strokeWidth: 2.25, strokeDasharray: '5,4' } : { stroke: '#4a4a5a', strokeWidth: 3 },
      markerEnd: isMemo ? undefined : { type: MarkerType.ArrowClosed, color: '#4a4a5a' },
    }
    setEdges((eds) => eds.concat(newEdge))
  }, [nodes, setEdges, perm, isNodeEditable])

  // ── Reconnect: drag an edge endpoint onto another node/handle ──────────────
  const onReconnectStart = useCallback(() => {
    setReconnecting(true)
  }, [])

  const onReconnect = useCallback((oldEdge, newConnection) => {
    if (perm.role === 'invitee' && (!isNodeEditable(newConnection.source) || !isNodeEditable(newConnection.target))) return
    // 파츠 연결 규칙: part edges may only reconnect part↔part; normal edges may never gain a part endpoint.
    const oldIsPart = isPartEdge(oldEdge)
    const newSourceIsPart = !!newConnection.sourceHandle?.startsWith('p-')
    const newTargetIsPart = !!newConnection.targetHandle?.startsWith('p-')
    if (oldIsPart ? !(newSourceIsPart && newTargetIsPart) : (newSourceIsPart || newTargetIsPart)) return
    if (oldIsPart) {
      const sourceNode = nodes.find((node) => node.id === newConnection.source)
      const targetNode = nodes.find((node) => node.id === newConnection.target)
      if (sourceNode?.type !== 'system' || targetNode?.type !== 'system') return
    }
    // Reconnect the clean edge from state, not the styled (bold) object React
    // Flow hands back — otherwise the selection styling gets baked in permanently.
    setEdges((eds) => {
      const clean = eds.find((e) => e.id === oldEdge.id) ?? oldEdge
      return reconnectEdge(clean, newConnection, eds)
    })
  }, [nodes, setEdges, perm, isNodeEditable])

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
    const dPos = absoluteNodePosition(dragged, byId)
    const dXs = [dPos.x, dPos.x + dd.w / 2, dPos.x + dd.w] // left, centerX, right
    const dYs = [dPos.y, dPos.y + dd.h / 2, dPos.y + dd.h] // top, centerY, bottom

    let xSnap = null
    let ySnap = null
    for (const n of nodes) {
      if (n.id === dragged.id) continue
      const nd = dim(n)
      const nPos = absoluteNodePosition(n, byId)
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

  // ── Alignment guides while RESIZING: same edge-snap idea as drag, applied
  // to whichever edge of the box is actually moving. A NodeResizer drag from
  // the right/bottom handles only changes width/height (the left/top edge
  // stays put); a drag from the left/top handles also emits a position
  // change on that axis (the opposite edge stays put instead). hasPosX/
  // hasPosY tell us which edge moved so we snap the right one and keep the
  // other edge fixed — otherwise "snapping" would silently translate the box.
  const computeResizeAlignSnap = useCallback((nodeId, newWidth, newHeight, newPosX, newPosY, hasPosX, hasPosY) => {
    if (nodes.length > ALIGN_MAX_NODES) return null
    const byId = new Map(nodes.map((n) => [n.id, n]))
    const dragged = byId.get(nodeId)
    if (!dragged) return null
    const dim = (n) => ({ w: n.measured?.width ?? n.width ?? 0, h: n.measured?.height ?? n.height ?? 0 })

    const oldAbs = absoluteNodePosition(dragged, byId)
    const oldDim = dim(dragged)
    const parentAbsX = oldAbs.x - dragged.position.x
    const parentAbsY = oldAbs.y - dragged.position.y

    const movingX = hasPosX ? { edge: 'left', value: parentAbsX + newPosX } : { edge: 'right', value: oldAbs.x + newWidth }
    const movingY = hasPosY ? { edge: 'top', value: parentAbsY + newPosY } : { edge: 'bottom', value: oldAbs.y + newHeight }

    let xSnap = null, ySnap = null
    for (const n of nodes) {
      if (n.id === nodeId) continue
      const nd = dim(n)
      const nPos = absoluteNodePosition(n, byId)
      if (!xSnap && Math.abs(movingX.value - nPos.x) <= ALIGN_SNAP) xSnap = { value: nPos.x }
      if (!xSnap && Math.abs(movingX.value - (nPos.x + nd.w)) <= ALIGN_SNAP) xSnap = { value: nPos.x + nd.w }
      if (!ySnap && Math.abs(movingY.value - nPos.y) <= ALIGN_SNAP) ySnap = { value: nPos.y }
      if (!ySnap && Math.abs(movingY.value - (nPos.y + nd.h)) <= ALIGN_SNAP) ySnap = { value: nPos.y + nd.h }
      if (xSnap && ySnap) break
    }
    if (!xSnap && !ySnap) return null

    let width = newWidth, height = newHeight, posX = newPosX, posY = newPosY
    const guides = []
    if (xSnap) {
      guides.push({ axis: 'x', value: xSnap.value })
      if (movingX.edge === 'left') {
        width = Math.max(40, (oldAbs.x + oldDim.w) - xSnap.value)
        posX = xSnap.value - parentAbsX
      } else {
        width = Math.max(40, xSnap.value - oldAbs.x)
      }
    }
    if (ySnap) {
      guides.push({ axis: 'y', value: ySnap.value })
      if (movingY.edge === 'top') {
        height = Math.max(40, (oldAbs.y + oldDim.h) - ySnap.value)
        posY = ySnap.value - parentAbsY
      } else {
        height = Math.max(40, ySnap.value - oldAbs.y)
      }
    }
    return { width, height, posX, posY, guides }
  }, [nodes])

  // Wraps useNodesState's onNodesChange: after the raw change is applied,
  // detect an interactive NodeResizer dimension change (resizing is only set
  // — true or false — by the resizer's own drag/end handlers, never by the
  // plain ResizeObserver auto-measure) and overlay the same alignment snap
  // used for drag. Re-applied on the final (resizing:false) change too,
  // since the resizer's own onEnd recomputes size from the raw pointer
  // delta and would otherwise snap the box back out of alignment on release.
  const handleNodesChange = useCallback((changes) => {
    const persistedChanges = filterDigitalTwinProposalNodeChanges(
      changes,
      twinProposalPreviewNodeIds,
      twinProposalPreviewAugmentedNodeIds,
    )
    if (!persistedChanges.length) return
    onNodesChange(persistedChanges)

    const dimChange = persistedChanges.find((c) => c.type === 'dimensions' && typeof c.resizing === 'boolean')
    if (!dimChange) return

    const posChange = persistedChanges.find((c) => c.type === 'position' && c.id === dimChange.id)
    const dragged = nodes.find((n) => n.id === dimChange.id)
    if (!dragged) { setAlignGuides([]); return }

    const newWidth = dimChange.dimensions.width
    const newHeight = dimChange.dimensions.height
    const hasPosX = !!posChange && posChange.position.x !== dragged.position.x
    const hasPosY = !!posChange && posChange.position.y !== dragged.position.y
    const newPosX = posChange ? posChange.position.x : dragged.position.x
    const newPosY = posChange ? posChange.position.y : dragged.position.y

    const snap = computeResizeAlignSnap(dimChange.id, newWidth, newHeight, newPosX, newPosY, hasPosX, hasPosY)
    if (!snap) { setAlignGuides([]); return }

    setNodes((nds) => nds.map((n) => n.id === dimChange.id
      ? {
          ...n,
          position: { x: snap.posX, y: snap.posY },
          width: snap.width,
          height: snap.height,
          measured: { ...(n.measured ?? {}), width: snap.width, height: snap.height },
        }
      : n))
    setAlignGuides(dimChange.resizing ? snap.guides : [])
  }, [
    onNodesChange,
    nodes,
    computeResizeAlignSnap,
    setNodes,
    twinProposalPreviewNodeIds,
    twinProposalPreviewAugmentedNodeIds,
  ])

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
    // Group/node-scope invitees (and read-only invitees of any scope) can't
    // add nodes "elsewhere" on the pane — there's nothing this menu could
    // offer them, so don't open it.
    if (perm.role === 'invitee' && (perm.scope !== 'canvas' || !canEditCanvas)) return
    const bounds = reactFlowRef.current?.getBoundingClientRect()
    setContextMenu({ x: e.clientX, y: e.clientY, flowX: e.clientX - (bounds?.left ?? 0), flowY: e.clientY - (bounds?.top ?? 0) })
    setRenamingTypeIdx(null)
  }, [perm, canEditCanvas])

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
    if (edge.redacted) return
    setContextMenu({ x: e.clientX, y: e.clientY, edgeId: edge.id })
    setRenamingTypeIdx(null)
  }, [])

  const onEdgeDoubleClick = useCallback((e, edge) => {
    e.preventDefault()
    e.stopPropagation()
    if (edge.redacted) return
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

  const handleContextAddGroup = () => {
    if (!rfInstance || !contextMenu) return
    const pos = rfInstance.screenToFlowPosition({ x: contextMenu.flowX, y: contextMenu.flowY })
    const id = nextId()
    setNodes((nds) => [...nds, { id, type: 'group', position: pos, width: 320, height: 220, zIndex: -1, data: { label: '새 그룹' } }])
    closeContext()
  }

  const handleContextAddContent = (kind) => {
    if (!rfInstance || !contextMenu) return
    const pos = rfInstance.screenToFlowPosition({ x: contextMenu.flowX, y: contextMenu.flowY })
    const id = nextId()
    setNodes((nds) => [...nds, { id, type: 'content', position: pos, data: { kind } }])
    closeContext()
  }

  const handleContextAddSystem = () => {
    if (!rfInstance || !contextMenu) return
    const pos = rfInstance.screenToFlowPosition({ x: contextMenu.flowX, y: contextMenu.flowY })
    const id = nextId()
    setNodes((nds) => [...nds, { id, type: 'system', position: pos, data: createSystemNodeData() }])
    closeContext()
  }

  const handleContextPaste = () => {
    if (!contextMenu) return
    if (contextMenu.flowX != null && rfInstance) {
      pasteClipboard(rfInstance.screenToFlowPosition({ x: contextMenu.flowX, y: contextMenu.flowY }))
    } else {
      pasteClipboard()
    }
    closeContext()
  }

  const handleContextDeleteNode = () => {
    if (!contextMenu?.nodeId) return
    const ids = contextMenu.selectedIds?.length ? contextMenu.selectedIds : [contextMenu.nodeId]
    if (perm.role === 'invitee' && !ids.every(isNodeEditable)) { closeContext(); return }
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

  const handleContextUpdateEdgeRelation = (patch) => {
    if (!contextMenu?.edgeId || !ctxEdgeEditable) return
    setEdges((items) => items.map((edge) => {
      if (edge.id !== contextMenu.edgeId || isPartEdge(edge)) return edge
      const data = normalizeEdgeRelationData({
        ...(edge.data ?? {}),
        ...patch,
        relationExplicit: patch.relationExplicit ?? true,
      }, patch.relationType ?? edge.data?.relationType ?? 'flows_to')
      return { ...edge, data }
    }))
  }

  const handleContextGroupSelection = () => {
    if (perm.role === 'invitee' && (perm.scope !== 'canvas' || !canEditCanvas)) return
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
    if (perm.role === 'invitee' && (perm.scope !== 'canvas' || !canEditCanvas)) return
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

  // ── Notes panel: move the canvas viewport to focus a given node ───────────
  const focusNode = useCallback((id) => {
    if (!rfInstance) return
    rfInstance.fitView({ nodes: [{ id }], duration: 400, padding: 0.3, maxZoom: 1.1 })
  }, [rfInstance])

  const focusDigitalTwinReviewItem = useCallback((item) => {
    if (!rfInstance || !item?.focus) return
    const nodeId = item.focus.nodeId
    if (nodeId && nodes.some((node) => node.id === nodeId)) {
      setEdges((currentEdges) => currentEdges.map((edge) => ({ ...edge, selected: false })))
      focusNode(nodeId)
      return
    }
    const edgeId = item.focus.edgeId
    const edge = edges.find((candidate) => candidate.id === edgeId)
    const nodeIds = (item.focus.nodeIds ?? [edge?.source, edge?.target])
      .filter((id) => nodes.some((node) => node.id === id))
    if (edge) setEdges((currentEdges) => currentEdges.map((candidate) => ({ ...candidate, selected: candidate.id === edgeId })))
    if (nodeIds.length) {
      rfInstance.fitView({ nodes: nodeIds.map((id) => ({ id })), duration: 400, padding: 0.35, maxZoom: 1.1 })
    }
  }, [edges, focusNode, nodes, rfInstance, setEdges])

  const openNotesPanel = useCallback((type) => {
    setTwinReviewOpen(false)
    setTwinProposalPreview(null)
    setTwinProposalStatus(null)
    setNotesSelectedId(null)
    setNotesPanel((prev) => (prev?.type === type ? null : { type }))
  }, [])

  const openNodeInNotes = useCallback((nodeId, type) => {
    if (!['stage', 'memo', 'content', 'system'].includes(type)) return
    setTwinReviewOpen(false)
    setTwinProposalPreview(null)
    setTwinProposalStatus(null)
    setNotesPanel({ type })
    setNotesSelectedId(nodeId)
  }, [])

  const toggleDigitalTwinReview = useCallback(() => {
    setNotesPanel(null)
    setNotesSelectedId(null)
    setTwinProposalPreview(null)
    setTwinProposalStatus(null)
    setTwinReviewOpen((open) => !open)
  }, [])

  // ── Saved views ───────────────────────────────────────────────────────────
  // Compute the bounding box (in flow coords) of the given node ids.
  const boundsOf = useCallback((ids) => {
    return boundsForNodeIds(nodes, ids)
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
    const byId = new Map(nodes.map((node) => [node.id, node]))
    setNodes((nds) => {
      // Parent nodes must precede their children in the array (React Flow requirement).
      const others = nds.filter((n) => !idSet.has(n.id))
      const children = nds.filter((n) => idSet.has(n.id)).map((n) => {
        const absolute = absoluteNodePosition(n, byId)
        return {
          ...n,
          parentId: groupId,
          position: { x: absolute.x - gx, y: absolute.y - gy },
        }
      })
      return [...others, groupNode, ...children]
    })
  }, [boundsOf, nodes, setNodes])

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
  // Selected edges get reconnectable + a bold stroke and colored marker. The
  // cross-browser blue halo is rendered as a real SVG path by StubEdge.
  const systemPartIdsByNode = new Map(nodes
    .filter((node) => node.type === 'system')
    .map((node) => [node.id, new Set(normalizeSystemParts(node.data?.systemParts).map((part) => part.id))]))
  const visibleEdges = edges.filter((edge) => {
    if (!isPartEdge(edge)) return true
    const sourcePartId = partIdFromHandle(edge.sourceHandle)
    const targetPartId = partIdFromHandle(edge.targetHandle)
    return !!sourcePartId
      && !!targetPartId
      && systemPartIdsByNode.get(edge.source)?.has(sourcePartId)
      && systemPartIdsByNode.get(edge.target)?.has(targetPartId)
  })
  const styledEdges = visibleEdges.map((e) => {
    // Delete key / built-in delete UI must also respect the edit gating.
    // (isNodeEditable already resolves to "always true" for owners/full-edit
    // canvas-scope invitees via editableSet === null.)
    const deletable = isNodeEditable(e.source) && isNodeEditable(e.target)
    const type = 'stub'
    const runtimeEdge = runtimeByEdge.get(e.id)
    const runtimeClass = runtimeEdge ? ` system-runtime-edge is-runtime-${runtimeEdge.reality.id}` : ''
    const runtimeData = runtimeEdge
      ? {
          ...(e.data ?? {}),
          systemRuntime: {
            status: runtimeEdge.reality.id,
            label: runtimeEdge.reality.label,
            color: runtimeEdge.reality.color,
            summary: runtimeEdge.result?.summary || runtimeEdge.capability.label,
            checkedAt: runtimeEdge.result?.checkedAt,
          },
        }
      : e.data
    // Stable hook class so CSS can target `.wfc-edge:hover` for the hover glow.
    const className = `wfc-edge${e.className ? ` ${e.className}` : ''}${runtimeClass}`
    if (!e.selected) return { ...e, ...baseEdgeStyle(e), data: runtimeData, deletable, type, className }
    if (isPartEdge(e)) {
      return {
        ...e,
        data: runtimeData,
        deletable,
        type,
        className,
        reconnectable: true,
        zIndex: 1001,
        style: { ...baseEdgeStyle(e).style, stroke: '#c3cad9', strokeWidth: 3 },
        markerEnd: undefined,
      }
    }
    const isMemo = !!e.style?.strokeDasharray
    const relation = edgeRelationInfo(e.data, isMemo ? 'references' : 'flows_to')
    const color = isMemo ? '#f59e0b' : '#60a5fa'
    return {
      ...e,
      data: runtimeData,
      deletable,
      type,
      className,
      // Only a selected (bold) edge can be snatched/reconnected.
      reconnectable: true,
      zIndex: 1001,
      style: { ...baseEdgeStyle(e).style, stroke: color, strokeWidth: isMemo ? 3.5 : 4.5 },
      markerEnd: isMemo || !relation.directed ? undefined : { type: MarkerType.ArrowClosed, color },
    }
  })
  const previewAugmentedNodes = twinProposalPreviewPartsByNode.size
    ? nodes.map((node) => {
        const previewPlan = twinProposalPreviewPartsByNode.get(node.id)
        if (!previewPlan) return node
        const { parts: previewParts, previewPartIds } = previewDigitalTwinPartChanges(
          node.data?.systemParts,
          previewPlan.additions,
          previewPlan.replacements,
        )
        return {
          ...node,
          data: {
            ...node.data,
            systemParts: previewParts,
            digitalTwinProposalPreviewPartIds: previewPartIds,
          },
        }
      })
    : nodes
  const renderedCanvasNodes = twinProposalPreviewNodes.length
    ? [...previewAugmentedNodes, ...twinProposalPreviewNodes]
    : previewAugmentedNodes
  const renderedCanvasEdges = twinProposalPreviewEdges.length
    ? [...styledEdges, ...twinProposalPreviewEdges]
    : styledEdges

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
    const positionMenu = () => {
      if (!menuRef.current) return
      const { width, height } = menuRef.current.getBoundingClientRect()
      const pad = 8
      let left = contextMenu.x
      let top = contextMenu.y
      if (left + width > window.innerWidth - pad) left = Math.max(pad, contextMenu.x - width)
      if (top + height > window.innerHeight - pad) top = Math.max(pad, contextMenu.y - height)
      setMenuPos((current) => (current.left === left && current.top === top ? current : { left, top }))
    }
    positionMenu()
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(positionMenu) : null
    observer?.observe(menuRef.current)
    window.addEventListener('resize', positionMenu)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', positionMenu)
    }
  }, [contextMenu])

  // Resolve which nodes the node-context-menu acts on, and whether it's a
  // multi-selection (so labels can say "전체 …").
  const ctxIds = contextMenu?.selectedIds?.length ? contextMenu.selectedIds : (contextMenu?.nodeId ? [contextMenu.nodeId] : [])
  const ctxMulti = (contextMenu?.selectedIds?.length ?? 0) >= 2

  // Sharing: canvas-scope invitees get full edit (including stage-type
  // editing); group/node-scope invitees only touch nodes in their editable
  // set; a read-only share (canEdit === false) never gets full edit.
  const ctxFullEdit = perm.role === 'owner' || (perm.scope === 'canvas' && canEditCanvas)
  const ctxCanDelete = ctxFullEdit || ctxIds.every(isNodeEditable)
  const ctxEdge = contextMenu?.edgeId ? edges.find((edge) => edge.id === contextMenu.edgeId) : null
  const ctxEdgeEditable = ctxEdge
    ? ctxFullEdit || (isNodeEditable(ctxEdge.source) && isNodeEditable(ctxEdge.target))
    : false
  const ctxEdgeSourceLabel = nodeDisplayName(nodes.find((node) => node.id === ctxEdge?.source))
  const ctxEdgeTargetLabel = nodeDisplayName(nodes.find((node) => node.id === ctxEdge?.target))

  return (
    <div
      className="app-shell"
      style={{ width: '100vw', height: '100vh', position: 'relative', display: 'flex', overflow: 'hidden' }}
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
      <div className="canvas-pane" style={{ position: 'relative', flex: '1 1 auto', minWidth: 0, height: '100%', order: 1 }}>
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
        participants={shareParticipants}
        nodes={nodes.filter((node) => !node.data?.redacted)}
        sharedOutIds={sharedOutCanvasIds}
        onLeaveShared={onLeaveShared}
        onToggleMemberEdit={onToggleMemberEdit}
        onKickMember={onKickMember}
        onToggleViewRestriction={onToggleMemberViewRestriction}
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
        onPaletteAdd={onPaletteAdd}
        systemRuntime={systemRuntimeSummary ? {
          ...systemRuntimeSummary,
          checking: systemRuntimeDashboard.checking || systemRuntimeDashboard.loading,
          disabled: !user || !!parseSharedId(activeCanvasId),
          error: systemRuntimeDashboard.error,
          onCheck: runAllSystemRuntimeChecks,
        } : null}
      />

      <AuthPanel
        user={user}
        syncing={cloudSyncing}
        mobile={mobile}
        forceOpen={!!authNotice}
        notice={authNotice}
        myProfile={myProfile}
        settings={settings}
        onProfileSaved={setMyProfile}
        lodThreshold={settings.lodThreshold}
        onSettingsChange={onSettingsChange}
      />

      {invite && (
        <div ref={inviteWrapRef} style={{ position: 'fixed', left: invite.x, top: invite.y, zIndex: 1000 }} onClick={(e) => e.stopPropagation()}>
          <InvitePopover
            scope={invite.scope}
            targetId={invite.targetId}
            canvasId={activeCanvasId}
            onClose={() => { setInvite(null); refreshShareParticipants(); refreshSharedOutCanvasIds() }}
            onlineUserIds={new Set(onlineUsers.map((u) => u.user_id))}
            onSharesChanged={() => { refreshShareParticipants(); refreshSharedOutCanvasIds() }}
          />
        </div>
      )}

      {/* Share-link login gate: centered notice for logged-out visitors */}
      {authNotice && !user && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 900,
          background: '#000000aa', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            position: 'relative',
            background: '#1a1a22', border: '1px solid #ffffff22', borderRadius: 14,
            padding: '28px 32px', width: 'min(340px, calc(100vw - 24px))', boxSizing: 'border-box',
            textAlign: 'center', boxShadow: '0 12px 48px #000d',
          }}>
            <button type="button" title="닫기" onClick={() => setAuthNotice(null)} style={{
              position: 'absolute', top: 8, right: 10, background: 'transparent', border: 'none',
              color: '#888', fontSize: 16, cursor: 'pointer', padding: 4,
            }}>✕</button>
            <div style={{ fontSize: 28, marginBottom: 12 }}>🔒</div>
            <div style={{ color: '#f0f0f0', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              공유받은 캔버스를 보려면 로그인이 필요합니다
            </div>
            <div style={{ color: '#888', fontSize: 12, lineHeight: 1.6 }}>
              오른쪽 위 로그인 패널에서 로그인하거나 가입하면<br />초대된 캔버스로 바로 이동합니다.
            </div>
          </div>
        </div>
      )}

      {shareLinkError && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1200,
          background: '#000000aa', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            background: '#1a1a22', border: '1px solid #ffffff22', borderRadius: 10,
            padding: '24px 28px', width: 'min(340px, calc(100vw - 24px))', boxSizing: 'border-box',
            textAlign: 'center', boxShadow: '0 12px 48px #000d',
          }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>⚠</div>
            <div style={{ color: '#f0f0f0', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
              공유 캔버스를 열 수 없습니다
            </div>
            <div style={{ color: '#aaa', fontSize: 12, lineHeight: 1.6, marginBottom: 16 }}>{shareLinkError}</div>
            <button onClick={() => setShareLinkError(null)} style={{
              background: '#3b82f6', border: 'none', borderRadius: 6, color: '#fff',
              fontSize: 12, fontWeight: 700, padding: '8px 16px', cursor: 'pointer', fontFamily: 'inherit',
            }}>확인</button>
          </div>
        </div>
      )}

      {syncConflict && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1250,
          background: '#000000aa', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={(event) => event.stopPropagation()}>
          <div style={{
            background: '#1a1a22', border: '1px solid #f59e0b66', borderRadius: 8,
            padding: '24px 28px', width: 'min(390px, calc(100vw - 24px))', boxSizing: 'border-box',
            boxShadow: '0 12px 48px #000d',
          }}>
            <div style={{ color: '#f0f0f0', fontSize: 15, fontWeight: 700, marginBottom: 9 }}>
              동시 편집 충돌
            </div>
            <div style={{ color: '#aaa', fontSize: 12, lineHeight: 1.65, marginBottom: 16 }}>
              같은 항목을 다른 브라우저나 AI도 수정했습니다. 서로 다른 항목의 변경은 이미 합쳤고,
              겹친 {syncConflict.conflicts.length}개 변경만 선택이 필요합니다.
            </div>
            {syncConflict.error && (
              <div style={{ color: '#fca5a5', fontSize: 11, lineHeight: 1.5, marginBottom: 12 }}>
                {syncConflict.error}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" disabled={syncConflict.busy} onClick={() => resolveSyncConflict(false)} style={{
                background: 'transparent', border: '1px solid #ffffff2a', borderRadius: 6,
                color: '#ccc', fontSize: 12, fontWeight: 600, padding: '8px 12px',
                cursor: syncConflict.busy ? 'default' : 'pointer', opacity: syncConflict.busy ? 0.55 : 1,
              }}>
                서버 최신 내용 사용
              </button>
              <button type="button" disabled={syncConflict.busy} onClick={() => resolveSyncConflict(true)} style={{
                background: '#f59e0b', border: 'none', borderRadius: 6,
                color: '#17120a', fontSize: 12, fontWeight: 700, padding: '8px 12px',
                cursor: syncConflict.busy ? 'default' : 'pointer', opacity: syncConflict.busy ? 0.55 : 1,
              }}>
                내 변경 우선 병합
              </button>
            </div>
          </div>
        </div>
      )}

      {canvasSchemaGuardError && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1275,
          background: '#000000aa', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }} onClick={(event) => event.stopPropagation()}>
          <div style={{
            background: '#1a1a22', border: '1px solid #ef444466', borderRadius: 8,
            padding: '24px 28px', width: 'min(390px, calc(100vw - 24px))', boxSizing: 'border-box',
            boxShadow: '0 12px 48px #000d',
          }}>
            <div style={{ color: '#f0f0f0', fontSize: 15, fontWeight: 700, marginBottom: 9 }}>
              안전을 위해 저장을 중단했습니다
            </div>
            <div style={{ color: '#aaa', fontSize: 12, lineHeight: 1.65, marginBottom: 10 }}>
              현재 탭에서 관계 정보가 사라질 수 있는 저장이 감지되어 서버가 변경을 거부했습니다.
            </div>
            <div style={{ color: '#fca5a5', fontSize: 11, lineHeight: 1.55, marginBottom: 16 }}>
              {canvasSchemaGuardError}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" onClick={() => window.location.reload()} style={{
                background: '#ef4444', border: 'none', borderRadius: 6,
                color: '#fff', fontSize: 12, fontWeight: 700, padding: '8px 12px',
                cursor: 'pointer', fontFamily: 'inherit',
              }}>
                최신 앱 다시 불러오기
              </button>
            </div>
          </div>
        </div>
      )}

      {storageError && (
        <div style={{
          position: 'fixed', left: '50%', bottom: 18, transform: 'translateX(-50%)', zIndex: 1300,
          width: 'min(460px, calc(100vw - 24px))', boxSizing: 'border-box',
          background: '#291719', border: '1px solid #ef444466', borderRadius: 8,
          color: '#fecaca', padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 8px 28px #000a', fontSize: 11, lineHeight: 1.5,
        }}>
          <span style={{ flex: 1 }}>
            브라우저 로컬 저장에 실패했습니다. 로그인 상태라면 클라우드 동기화 여부를 확인해 주세요. {storageError}
          </span>
          <button type="button" title="닫기" onClick={() => setStorageError(null)} style={{
            background: 'transparent', border: 'none', color: '#fecaca', cursor: 'pointer', fontSize: 14, padding: 4,
          }}>✕</button>
        </div>
      )}

      {emailInviteNotices[0] && (() => {
        const incoming = emailInviteNotices[0]
        const scopeLabel = { canvas: '캔버스', group: '그룹', node: '노드' }[incoming.scope] ?? '캔버스'
        return (
          <div style={{
            position: 'fixed', inset: 0, zIndex: 1200,
            background: '#000000aa', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              background: '#1a1a22', border: '1px solid #ffffff22', borderRadius: 10,
              padding: '24px 28px', width: 'min(360px, calc(100vw - 24px))', boxSizing: 'border-box',
              textAlign: 'center', boxShadow: '0 12px 48px #000d',
            }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>✉</div>
              <div style={{ color: '#f0f0f0', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>새 공유 초대</div>
              <div style={{ color: '#aaa', fontSize: 12, lineHeight: 1.6, marginBottom: 18 }}>
                <strong style={{ color: '#e4e6ec' }}>{incoming.name}</strong> {scopeLabel}에 초대받았습니다.
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                <button disabled={inviteActionBusy} onClick={() => runInviteAction('reject email invite', () => rejectEmailInvite(incoming.id))} style={{
                  background: 'transparent', border: '1px solid #ffffff22', borderRadius: 6, color: '#aaa',
                  fontSize: 12, fontWeight: 600, padding: '8px 14px', cursor: inviteActionBusy ? 'default' : 'pointer',
                  opacity: inviteActionBusy ? 0.6 : 1, fontFamily: 'inherit',
                }}>거절</button>
                <button disabled={inviteActionBusy} onClick={() => runInviteAction('accept email invite', () => acceptEmailInvite(incoming))} style={{
                  background: '#3b82f6', border: 'none', borderRadius: 6, color: '#fff',
                  fontSize: 12, fontWeight: 700, padding: '8px 14px', cursor: inviteActionBusy ? 'default' : 'pointer',
                  opacity: inviteActionBusy ? 0.6 : 1, fontFamily: 'inherit',
                }}>열기</button>
              </div>
              {inviteActionError && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 10 }}>{inviteActionError}</div>}
            </div>
          </div>
        )
      })()}

      {linkInviteNotice && (() => {
        const incoming = linkInviteNotice
        const scopeLabel = { canvas: '캔버스', group: '그룹', node: '노드' }[incoming.scope] ?? '캔버스'
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1200, background: '#000000aa', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#1a1a22', border: '1px solid #ffffff22', borderRadius: 10, padding: '24px 28px', width: 'min(360px, calc(100vw - 24px))', boxSizing: 'border-box', textAlign: 'center', boxShadow: '0 12px 48px #000d' }}>
              <div style={{ fontSize: 28, marginBottom: 12 }}>🔗</div>
              <div style={{ color: '#f0f0f0', fontSize: 15, fontWeight: 700, marginBottom: 8 }}>공유 캔버스 참여</div>
              <div style={{ color: '#aaa', fontSize: 12, lineHeight: 1.6, marginBottom: 18 }}>
                <strong style={{ color: '#e4e6ec' }}>{incoming.name ?? '공유 캔버스'}</strong> {scopeLabel}에 참여할까요?
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                <button disabled={inviteActionBusy} onClick={() => runInviteAction('reject link invite', () => rejectLinkInvite(incoming))} style={{ background: 'transparent', border: '1px solid #ffffff22', borderRadius: 6, color: '#aaa', fontSize: 12, fontWeight: 600, padding: '8px 14px', cursor: inviteActionBusy ? 'default' : 'pointer', opacity: inviteActionBusy ? 0.6 : 1, fontFamily: 'inherit' }}>거절</button>
                <button disabled={inviteActionBusy} onClick={() => runInviteAction('accept link invite', () => acceptLinkInvite(incoming))} style={{ background: '#3b82f6', border: 'none', borderRadius: 6, color: '#fff', fontSize: 12, fontWeight: 700, padding: '8px 14px', cursor: inviteActionBusy ? 'default' : 'pointer', opacity: inviteActionBusy ? 0.6 : 1, fontFamily: 'inherit' }}>참여</button>
              </div>
              {inviteActionError && <div style={{ color: '#ef4444', fontSize: 11, marginTop: 10 }}>{inviteActionError}</div>}
            </div>
          </div>
        )
      })()}

      <ReactFlow
        ref={reactFlowRef}
        className={reconnecting ? 'rf-reconnecting' : undefined}
        nodes={renderedCanvasNodes.map((n) => {
          if (n.data?.digitalTwinProposalPreview) {
            return {
              ...n,
              draggable: false,
              selectable: false,
              deletable: false,
              data: {
                ...n.data,
                stageTypes,
                lodThreshold: settings.lodThreshold,
                nodeFill: settings.nodeFill,
                theme: settings.theme,
                readOnly: true,
                canInvite: false,
                canManageParticipants: false,
                scopedParticipants: [],
              },
            }
          }
          const isOwner = perm.role === 'owner'
          const nodeScope = n.type === 'group' ? 'group' : 'node'
          const nodeScopedParticipants = scopedParticipantsByTarget[`${nodeScope}:${n.id}`] ?? []
          // canEdit === false: the whole canvas is view-only regardless of
          // scope — every node stays selectable (so it can still be viewed/
          // pinned) but never draggable or deletable.
          const viewOnly = !isOwner && !canEditCanvas
          // Only group/node scopes carve out a restricted subset of nodes;
          // canvas-scope invitees get full edit, same as owner (left as
          // React Flow defaults so the isAnyEditing/isPinching global drag
          // gate above still applies to them).
          const restrictedScope = !isOwner && !viewOnly && (perm.scope === 'group' || perm.scope === 'node')
          const editable = restrictedScope ? isNodeEditable(n.id) : !viewOnly
          const isNodeScopeTarget = restrictedScope && perm.scope === 'node' && n.id === perm.targetId
          const overrides = viewOnly
            ? { draggable: false, deletable: false, selectable: true }
            : restrictedScope
            ? { draggable: editable && !isNodeScopeTarget, deletable: editable && !isNodeScopeTarget, selectable: editable }
            : {}
          return {
            ...n,
            ...overrides,
            data: {
              ...n.data,
              stageTypes,
              lodThreshold: settings.lodThreshold,
              nodeFill: settings.nodeFill,
              theme: settings.theme,
              imageContext,
              readOnly: viewOnly || (restrictedScope && !editable),
              forceShapeOnly: forceShapeOnlySet?.has(n.id) ?? false,
              canInvite: isOwner,
              onInvite: isOwner ? openInvite : undefined,
              canManageParticipants: isOwner,
              onToggleViewRestriction: isOwner ? onToggleMemberViewRestriction : undefined,
              scopedParticipants: nodeScopedParticipants,
              systemPartRuntime: systemPartRuntimeByNode[n.id] ?? {},
              twinRuntime: n.type === 'system'
                ? aggregateSystemNodeRuntime(n, systemPartRuntimeByNode[n.id] ?? {}, systemRuntimeNow)
                : undefined,
              canRunSystemChecks: isOwner && !!user,
              onCheckSystemPart: isOwner ? runSystemPartRuntimeCheck : undefined,
              onUpdate: (patch) => updateNodeData(n.id, patch),
              onOpenInNotes: n.type === 'group' ? undefined : () => openNodeInNotes(n.id, n.type),
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
        edges={renderedCanvasEdges}
        onNodesChange={handleNodesChange}
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
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onPaneContextMenu={onPaneContextMenu}
        onNodeContextMenu={onNodeContextMenu}
        onEdgeContextMenu={onEdgeContextMenu}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneClick={() => {
          setEdges((eds) => eds.some((e) => e.selected) ? eds.map((e) => ({ ...e, selected: false })) : eds)
        }}
        onDragOver={onDragOver}
        onDrop={onDrop}
        nodesDraggable={!isAnyEditing && !isPinching}
        snapToGrid
        snapGrid={[12, 12]}
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
        style={{ background: settings.theme === 'light' ? '#f5f5f7' : '#0f0f13' }}
      >
        <Background id="grid" variant={BackgroundVariant.Lines} gap={12} size={0.45} />
        {!mobile && <Controls style={{ background: '#1a1a22', border: '1px solid #ffffff18', borderRadius: 8 }} />}
        {!mobile && (
          <MiniMap
            nodeColor={(n) => (n.type === 'memo' ? '#f59e0b88' : n.type === 'group' ? '#8b94a733' : n.type === 'system' ? '#06b6d488' : '#3b82f688')}
            maskColor="#0f0f1388"
            style={{ background: '#1a1a22', border: '1px solid #ffffff18', borderRadius: 8 }}
          />
        )}
      </ReactFlow>


      {/* ── Notes panel: right-edge open buttons + the panel itself ───────── */}
      <div
        className={`notes-rail notes-rail-${notesSide}`}
        style={{
          position: 'absolute', [notesSide === 'left' ? 'left' : 'right']: 0,
          top: '50%', transform: 'translateY(-50%)', zIndex: 15,
          display: 'flex', flexDirection: 'column', gap: 4,
          background: '#1a1a22', border: '1px solid #ffffff18',
          borderRight: notesSide === 'right' ? 'none' : '1px solid #ffffff18',
          borderLeft: notesSide === 'left' ? 'none' : '1px solid #ffffff18',
          borderRadius: notesSide === 'right' ? '10px 0 0 10px' : '0 10px 10px 0', padding: 5,
        }}
      >
        {digitalTwinReview && (
          <>
            <button
              type="button"
              className="notes-rail-button twin-review-rail-button"
              data-tooltip="배포·소스 변경 검토"
              title="배포·소스 변경 검토"
              aria-label="배포·소스 변경 검토"
              onClick={toggleDigitalTwinReview}
              style={{
                position: 'relative', background: twinReviewOpen ? '#f59e0b33' : 'transparent',
                border: 'none', borderRadius: 6, color: twinReviewOpen ? '#fbbf24' : '#ccc',
                width: 32, height: 32, fontSize: 9, fontWeight: 800, padding: 0, cursor: 'pointer',
                display: 'grid', placeItems: 'center', fontFamily: 'inherit',
              }}
            >
              검토
              {digitalTwinReviewPartitions.pending.length > 0 && (
                <span className="twin-review-rail-count">
                  {digitalTwinReviewPartitions.pending.length > 99 ? '99+' : digitalTwinReviewPartitions.pending.length}
                </span>
              )}
            </button>
            <div style={{ height: 1, background: '#ffffff18', margin: '2px 3px' }} />
          </>
        )}
        {[
          ['stage', '단계·계층 노트', '☷'],
          ['memo', '참고·메모 노트', '※'],
          ['content', '콘텐츠 노트', '▣'],
          ['system', '시스템·트윈 노트', '⌬'],
        ].map(([t, label, icon]) => (
          <button
            key={t}
            type="button"
            className="notes-rail-button"
            data-tooltip={label}
            title={label}
            aria-label={label}
            onClick={() => openNotesPanel(t)}
            style={{
              background: notesPanel?.type === t ? '#3b82f633' : 'transparent',
              border: 'none', borderRadius: 6, color: notesPanel?.type === t ? '#8ab4ff' : '#ccc',
              width: 32, height: 32, fontSize: 16, fontWeight: 600, padding: 0, cursor: 'pointer',
              display: 'grid', placeItems: 'center', fontFamily: 'inherit',
            }}
          >
            {icon}
          </button>
        ))}
      </div>

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
              style={{ position: 'fixed', left: sx, top: 0, width: 0.7, height: '100vh', background: '#ffffffcc', zIndex: 6, pointerEvents: 'none' }}
            />
          )
        }
        const sy = rfInstance.flowToScreenPosition({ x: 0, y: g.value }).y
        return (
          <div
            key={i}
            style={{ position: 'fixed', left: 0, top: sy, width: '100vw', height: 0.7, background: '#ffffffcc', zIndex: 6, pointerEvents: 'none' }}
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
            minWidth: contextMenu.edgeId ? 320 : 200,
            maxHeight: 'calc(100vh - 16px)',
            overflowY: 'auto',
          }}
        >
          {/* Pane: add nodes (group/node-scope invitees, and read-only shares,
              can't add "elsewhere" — menu doesn't even open for them) */}
          {!contextMenu.nodeId && !contextMenu.edgeId && (
            <>
              <ContextItem label="단계 노드 추가" color="#3b82f6" onClick={handleContextAddStage} />
              <ContextItem label="메모 노드 추가" color="#f59e0b" onClick={handleContextAddMemo} />
              <ContextItem icon="⬚" label="그룹 추가" color="#8b94a7" onClick={handleContextAddGroup} />
              <div style={{ padding: '6px 12px 2px', color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                시스템 모델
              </div>
              <ContextItem icon="◆" label="시스템 실체" color="#06b6d4" indent onClick={handleContextAddSystem} />
              <div style={{ padding: '6px 12px 2px', color: '#555', fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase' }}>
                컨텐츠 추가
              </div>
              <ContextItem icon="🖼" label="사진" color="#22c55e" indent onClick={() => handleContextAddContent('photo')} />
              <ContextItem icon="🗄" label="데이터베이스" color="#a855f7" indent onClick={() => handleContextAddContent('database')} />
              <ContextItem icon="🌐" label="브라우저" color="#06b6d4" indent onClick={() => handleContextAddContent('browser')} />
              {clipboardRef.current && (
                <ContextItem icon="📋" label="붙여넣기" color="#8b94a7" onClick={handleContextPaste} />
              )}
            </>
          )}

          {/* Edge: semantic relation + delete. Part sockets keep their fixed link meaning. */}
          {ctxEdge && !ctxEdge.redacted && !isPartEdge(ctxEdge) && (
            <EdgeRelationEditor
              edge={ctxEdge}
              sourceLabel={ctxEdgeSourceLabel}
              targetLabel={ctxEdgeTargetLabel}
              readOnly={!ctxEdgeEditable}
              onChange={handleContextUpdateEdgeRelation}
            />
          )}
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
              <ContextItem icon="⧉" label="복사" color="#8b94a7" onClick={() => { copySelection(ctxIds); closeContext() }} />
              {clipboardRef.current && !(perm.role === 'invitee' && (!canEditCanvas || perm.scope === 'node')) && (
                <ContextItem icon="📋" label="붙여넣기" color="#8b94a7" onClick={handleContextPaste} />
              )}
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

          {/* System node: ontology fields live in the notes panel; context menu only deletes. */}
          {contextMenu.nodeId && contextMenu.nodeType === 'system' && ctxCanDelete && (
            <ContextItem icon="🗑" label={ctxMulti ? '전체 삭제' : '노드 삭제'} color="#ef4444" onClick={handleContextDeleteNode} />
          )}
        </div>
      )}
      </div>

      {notesPanel && (
        <NotesPanel
          type={notesPanel.type}
          nodes={nodes.filter((node) => !node.data?.redacted)}
          notes={notes}
          edges={edges}
          selectedId={notesSelectedId}
          onSelect={setNotesSelectedId}
          onClose={() => { setNotesPanel(null); setNotesSelectedId(null) }}
          onFocusNode={focusNode}
          onUpdateNode={updateNodeData}
          onUpdateNote={updateNoteData}
          onCreateNote={createNote}
          onPromoteNote={promoteNoteToCenter}
          isNodeEditable={isNodeEditable}
          isNoteEditable={() => canEditNotes}
          canCreateNotes={canEditNotes}
          side={notesSide}
          onSideChange={setNotesSide}
          imageContext={imageContext}
        />
      )}
      {twinReviewOpen && digitalTwinReview && (
        <DigitalTwinReviewPanel
          review={digitalTwinReview}
          reviewState={digitalTwinReviewState}
          canDecide={canDecideTwinReview}
          side={notesSide}
          onSideChange={setNotesSide}
          onClose={() => {
            setTwinReviewOpen(false)
            setTwinProposalPreview(null)
            setTwinProposalStatus(null)
          }}
          onDecision={decideDigitalTwinReviewItem}
          onClearDecision={clearDigitalTwinReviewItem}
          onFocus={focusDigitalTwinReviewItem}
          proposalPreview={twinProposalPreview}
          proposalStatus={twinProposalStatus}
          proposalPlanError={twinProposalPlan.error}
          onPreviewProposal={previewDigitalTwinProposal}
          onApplyProposal={applyDigitalTwinProposal}
        />
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────
function ContextItem({ icon, label, color, onClick, indent }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        background: 'transparent', border: 'none', borderRadius: 6,
        padding: indent ? '7px 12px 7px 26px' : '8px 12px', color: '#ccc', fontSize: 13, cursor: 'pointer',
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
