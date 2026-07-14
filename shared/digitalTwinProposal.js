import { digitalTwinReviewFingerprint } from './digitalTwinReview.js'
import { normalizeSystemPart, normalizeSystemParts, validateSystemPartInput } from './systemPartOntology.js'

export const DIGITAL_TWIN_PROPOSAL_SCHEMA_VERSION = 1

const MAX_OPERATIONS = 24
const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export class DigitalTwinProposalError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'DigitalTwinProposalError'
    this.code = code
  }
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeText(value, maxLength = 300) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, maxLength)
    : ''
}

function safeId(value, label) {
  const id = safeText(value, 240)
  if (!id || UNSAFE_KEYS.has(id)) {
    throw new DigitalTwinProposalError('INVALID_ID', `${label} 식별자가 올바르지 않습니다.`)
  }
  return id
}

function finiteNumber(value, fallback, minimum = -1_000_000, maximum = 1_000_000) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(maximum, Math.max(minimum, number)) : fallback
}

function serializableValue(value, seen = new WeakSet(), depth = 0) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'object' || depth > 12) return undefined
  if (seen.has(value)) throw new DigitalTwinProposalError('CIRCULAR_VALUE', '수정안에 순환 참조가 있습니다.')
  seen.add(value)
  if (Array.isArray(value)) {
    const result = value.slice(0, 500).map((item) => serializableValue(item, seen, depth + 1) ?? null)
    seen.delete(value)
    return result
  }
  if (!plainObject(value)) {
    seen.delete(value)
    return undefined
  }
  const result = {}
  for (const [key, item] of Object.entries(value)) {
    if (UNSAFE_KEYS.has(key)) continue
    const normalized = serializableValue(item, seen, depth + 1)
    if (normalized !== undefined) result[key] = normalized
  }
  seen.delete(value)
  return result
}

function normalizeNode(value) {
  if (!plainObject(value)) throw new DigitalTwinProposalError('INVALID_NODE', '추가할 노드 정보가 없습니다.')
  const node = {
    id: safeId(value.id, '노드'),
    type: safeText(value.type, 80) || 'system',
    position: {
      x: finiteNumber(value.position?.x, 0),
      y: finiteNumber(value.position?.y, 0),
    },
    data: plainObject(value.data) ? serializableValue(value.data) : {},
  }
  const parentId = safeText(value.parentId, 240)
  if (parentId) node.parentId = safeId(parentId, '부모 노드')
  if (value.width != null) node.width = finiteNumber(value.width, 240, 1, 10_000)
  if (value.height != null) node.height = finiteNumber(value.height, 140, 1, 10_000)
  if (value.zIndex != null) node.zIndex = finiteNumber(value.zIndex, 0, -10_000, 10_000)
  return node
}

function normalizeEdge(value) {
  if (!plainObject(value)) throw new DigitalTwinProposalError('INVALID_EDGE', '추가할 연결선 정보가 없습니다.')
  const edge = {
    id: safeId(value.id, '연결선'),
    source: safeId(value.source, '시작 노드'),
    target: safeId(value.target, '도착 노드'),
    type: safeText(value.type, 80) || 'stub',
  }
  for (const key of ['sourceHandle', 'targetHandle']) {
    const handle = safeText(value[key], 80)
    if (handle) edge[key] = handle
  }
  for (const key of ['data', 'style', 'markerEnd']) {
    if (plainObject(value[key])) edge[key] = serializableValue(value[key])
  }
  return edge
}

function normalizeOperation(operation) {
  if (!plainObject(operation)) throw new DigitalTwinProposalError('INVALID_OPERATION', '수정안 작업 형식이 올바르지 않습니다.')
  if (operation.action === 'add_node') {
    return { action: 'add_node', label: safeText(operation.label, 180), node: normalizeNode(operation.node) }
  }
  if (operation.action === 'add_edge') {
    return { action: 'add_edge', label: safeText(operation.label, 180), edge: normalizeEdge(operation.edge) }
  }
  if (operation.action === 'add_part') {
    const partError = validateSystemPartInput(operation.part)
    const part = partError ? null : normalizeSystemPart(operation.part)
    if (partError || !part) {
      throw new DigitalTwinProposalError('INVALID_PART', partError || '추가할 시스템 파츠 정보가 없습니다.')
    }
    return {
      action: 'add_part',
      label: safeText(operation.label, 180),
      targetNodeId: safeId(operation.targetNodeId, '파츠 대상 노드'),
      part,
    }
  }
  throw new DigitalTwinProposalError(
    'UNSAFE_OPERATION',
    '이번 단계의 디지털 트윈 수정안은 새 노드, 연결선 또는 시스템 파츠 추가만 허용합니다.',
  )
}

export function createDigitalTwinGraphProposal({
  sourceId,
  proposalKey,
  itemId,
  itemFingerprint,
  snapshotId,
  title,
  summary,
  operations,
}) {
  const safeSourceId = safeId(sourceId, '수정안 출처')
  const safeProposalKey = safeId(proposalKey, '수정안')
  const safeItemId = safeId(itemId, '검토 항목')
  const safeItemFingerprint = safeId(itemFingerprint, '검토 지문')
  const rawOperations = Array.isArray(operations) ? operations : []
  if (rawOperations.length > MAX_OPERATIONS) {
    throw new DigitalTwinProposalError('TOO_MANY_OPERATIONS', `수정안 작업은 최대 ${MAX_OPERATIONS}개까지 허용합니다.`)
  }
  const normalizedOperations = rawOperations.map(normalizeOperation)
  if (!normalizedOperations.length) {
    throw new DigitalTwinProposalError('EMPTY_PROPOSAL', '추가할 노드, 연결선 또는 시스템 파츠가 없습니다.')
  }
  const nodeIds = normalizedOperations.filter((operation) => operation.action === 'add_node').map((operation) => operation.node.id)
  const edgeIds = normalizedOperations.filter((operation) => operation.action === 'add_edge').map((operation) => operation.edge.id)
  const partIds = normalizedOperations
    .filter((operation) => operation.action === 'add_part')
    .map((operation) => `${operation.targetNodeId}:${operation.part.id}`)
  if (
    new Set(nodeIds).size !== nodeIds.length
    || new Set(edgeIds).size !== edgeIds.length
    || new Set(partIds).size !== partIds.length
  ) {
    throw new DigitalTwinProposalError('DUPLICATE_OPERATION', '수정안 안에 중복된 노드, 연결선 또는 시스템 파츠가 있습니다.')
  }
  const proposal = {
    schemaVersion: DIGITAL_TWIN_PROPOSAL_SCHEMA_VERSION,
    id: `${safeSourceId}::${safeProposalKey}`,
    sourceId: safeSourceId,
    itemId: safeItemId,
    itemFingerprint: safeItemFingerprint,
    snapshotId: safeText(snapshotId, 180),
    title: safeText(title, 180) || safeProposalKey,
    summary: safeText(summary, 800),
    operations: normalizedOperations,
    counts: { nodes: nodeIds.length, edges: edgeIds.length, parts: partIds.length },
  }
  return {
    ...proposal,
    fingerprint: digitalTwinReviewFingerprint(proposal),
  }
}

export function digitalTwinProposalMatchesItem(proposal, item) {
  return proposal?.sourceId === item?.sourceId
    && proposal?.itemId === item?.id
    && proposal?.itemFingerprint === item?.fingerprint
}

export function filterDigitalTwinProposalNodeChanges(changes, previewNodeIds, previewAugmentedNodeIds) {
  const source = Array.isArray(changes) ? changes : []
  const ids = previewNodeIds instanceof Set
    ? previewNodeIds
    : new Set(Array.isArray(previewNodeIds) ? previewNodeIds : [])
  const augmentedIds = previewAugmentedNodeIds instanceof Set
    ? previewAugmentedNodeIds
    : new Set(Array.isArray(previewAugmentedNodeIds) ? previewAugmentedNodeIds : [])
  if (!ids.size && !augmentedIds.size) return source
  return source.filter((change) => (
    !ids.has(change?.id)
    && !(augmentedIds.has(change?.id) && change?.type === 'dimensions')
  ))
}

export function digitalTwinProposalAutoFitKey(canvasId, proposal) {
  const safeCanvasId = safeText(canvasId, 240)
  const proposalId = safeText(proposal?.id, 480)
  const proposalFingerprint = safeText(proposal?.fingerprint, 240)
  return safeCanvasId && proposalId && proposalFingerprint
    ? `${safeCanvasId}::${proposalId}::${proposalFingerprint}`
    : null
}

function matchingAppliedNode(existing, planned) {
  const current = existing?.data?.digitalTwinBinding
  const proposed = planned?.data?.digitalTwinBinding
  return plainObject(current)
    && plainObject(proposed)
    && current.sourceId === proposed.sourceId
    && current.entityKey === proposed.entityKey
    && current.itemFingerprint === proposed.itemFingerprint
}

function matchingAppliedEdge(existing, planned) {
  return existing?.source === planned?.source
    && existing?.target === planned?.target
    && (existing?.data?.relationType ?? null) === (planned?.data?.relationType ?? null)
    && (existing?.data?.relationEvidenceRef ?? '') === (planned?.data?.relationEvidenceRef ?? '')
}

function matchingAppliedPart(existing, planned) {
  return digitalTwinReviewFingerprint(normalizeSystemPart(existing))
    === digitalTwinReviewFingerprint(normalizeSystemPart(planned))
}

export function planDigitalTwinGraphProposal(graph, proposal) {
  if (proposal?.schemaVersion !== DIGITAL_TWIN_PROPOSAL_SCHEMA_VERSION || !Array.isArray(proposal.operations)) {
    throw new DigitalTwinProposalError('INVALID_PROPOSAL', '지원하지 않는 디지털 트윈 수정안입니다.')
  }
  const { fingerprint, ...proposalBody } = proposal
  if (digitalTwinReviewFingerprint(proposalBody) !== fingerprint) {
    throw new DigitalTwinProposalError('PROPOSAL_CHANGED', '미리보기 이후 수정안 내용이 달라졌습니다. 다시 검토해야 합니다.')
  }
  if (proposal.operations.some((operation) => !['add_node', 'add_edge', 'add_part'].includes(operation?.action))) {
    throw new DigitalTwinProposalError('UNSAFE_OPERATION', '추가 이외의 수정안 작업은 적용할 수 없습니다.')
  }
  const currentNodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const currentEdges = Array.isArray(graph?.edges) ? graph.edges : []
  const currentNodeById = new Map(currentNodes.map((node) => [node.id, node]))
  const currentEdgeById = new Map(currentEdges.map((edge) => [edge.id, edge]))
  const plannedNodes = proposal.operations.filter((operation) => operation.action === 'add_node').map((operation) => operation.node)
  const plannedEdges = proposal.operations.filter((operation) => operation.action === 'add_edge').map((operation) => operation.edge)
  const plannedParts = proposal.operations
    .filter((operation) => operation.action === 'add_part')
    .map((operation) => ({ targetNodeId: operation.targetNodeId, part: operation.part }))
  const addNodes = []
  const addEdges = []
  const addParts = []
  const alreadyPresent = []

  for (const node of plannedNodes) {
    const existing = currentNodeById.get(node.id)
    if (!existing) addNodes.push(node)
    else if (matchingAppliedNode(existing, node)) alreadyPresent.push(node.id)
    else throw new DigitalTwinProposalError('NODE_ID_CONFLICT', `노드 ${node.id}가 이미 다른 내용으로 존재합니다.`)
  }

  const availableNodeIds = new Set([...currentNodeById.keys(), ...plannedNodes.map((node) => node.id)])
  for (const node of plannedNodes) {
    if (node.parentId && !availableNodeIds.has(node.parentId)) {
      throw new DigitalTwinProposalError('MISSING_PARENT', `부모 그룹 ${node.parentId}를 찾을 수 없습니다.`)
    }
  }
  for (const edge of plannedEdges) {
    if (!availableNodeIds.has(edge.source) || !availableNodeIds.has(edge.target)) {
      throw new DigitalTwinProposalError('MISSING_ENDPOINT', `연결선 ${edge.id}의 양 끝 노드를 찾을 수 없습니다.`)
    }
    const existing = currentEdgeById.get(edge.id)
    if (!existing) addEdges.push(edge)
    else if (matchingAppliedEdge(existing, edge)) alreadyPresent.push(edge.id)
    else throw new DigitalTwinProposalError('EDGE_ID_CONFLICT', `연결선 ${edge.id}가 이미 다른 내용으로 존재합니다.`)
  }

  for (const planned of plannedParts) {
    const target = currentNodeById.get(planned.targetNodeId)
    if (!target) {
      throw new DigitalTwinProposalError('MISSING_PART_TARGET', `파츠 대상 노드 ${planned.targetNodeId}를 찾을 수 없습니다.`)
    }
    if (target.type !== 'system') {
      throw new DigitalTwinProposalError('INVALID_PART_TARGET', '시스템 파츠는 시스템 노드에만 추가할 수 있습니다.')
    }
    const existing = normalizeSystemParts(target.data?.systemParts).find((part) => part.id === planned.part.id)
    if (!existing) addParts.push(planned)
    else if (matchingAppliedPart(existing, planned.part)) alreadyPresent.push(`${planned.targetNodeId}:${planned.part.id}`)
    else throw new DigitalTwinProposalError('PART_ID_CONFLICT', `파츠 ${planned.part.id}가 대상 노드에 이미 다른 내용으로 존재합니다.`)
  }

  return {
    proposalId: proposal.id,
    proposalFingerprint: proposal.fingerprint,
    nodes: addNodes,
    edges: addEdges,
    parts: addParts,
    alreadyPresent,
    writesRequired: addNodes.length > 0 || addEdges.length > 0 || addParts.length > 0,
  }
}

export function applyDigitalTwinGraphProposal(graph, proposal) {
  const plan = planDigitalTwinGraphProposal(graph, proposal)
  const partsByNode = new Map()
  for (const planned of plan.parts) {
    const current = partsByNode.get(planned.targetNodeId) ?? []
    current.push(planned.part)
    partsByNode.set(planned.targetNodeId, current)
  }
  const currentNodes = Array.isArray(graph?.nodes) ? graph.nodes : []
  const nodesWithParts = currentNodes.map((node) => {
    const additions = partsByNode.get(node.id)
    if (!additions?.length) return node
    return {
      ...node,
      data: {
        ...node.data,
        systemParts: [...normalizeSystemParts(node.data?.systemParts), ...additions],
      },
    }
  })
  return {
    nodes: [...nodesWithParts, ...plan.nodes],
    edges: [...(Array.isArray(graph?.edges) ? graph.edges : []), ...plan.edges],
    appliedNodeIds: plan.nodes.map((node) => node.id),
    appliedEdgeIds: plan.edges.map((edge) => edge.id),
    appliedPartIds: plan.parts.map((planned) => `${planned.targetNodeId}:${planned.part.id}`),
    alreadyPresent: plan.alreadyPresent,
    writesPerformed: plan.writesRequired,
  }
}
