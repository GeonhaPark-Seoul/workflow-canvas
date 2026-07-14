import {
  createDigitalTwinReviewItem,
  digitalTwinReviewFingerprint,
} from './digitalTwinReview.js'
import { createDigitalTwinGraphProposal } from './digitalTwinProposal.js'
import { createEdgeRelationData, edgeRelationInfo } from './relationOntology.js'
import { createSystemNodeData, normalizeSystemPlainText } from './systemOntology.js'
import { createWorkflowCanvasSystemMap } from './workflowCanvasSystemMap.js'
import {
  inspectWorkflowSystemMap,
  WORKFLOW_SYSTEM_DISCOVERY_SOURCE_ID,
} from './workflowSystemDiscovery.js'
import { WORKFLOW_SYSTEM_DISCOVERY } from './workflowSystemDiscoveryManifest.js'

export const WORKFLOW_SYSTEM_TWIN_SOURCE_ID = WORKFLOW_SYSTEM_DISCOVERY_SOURCE_ID

const SIGNATURE_NODE_IDS = ['map-web-app', 'map-mcp-api', 'map-postgres', 'map-canvases-table']
const EXPECTED_MAP = createWorkflowCanvasSystemMap()

const RESOURCE_PROPOSAL_DEFS = Object.freeze({
  api: {
    parentId: 'map-group-runtime', systemKind: 'api', anchorId: 'map-vercel', relationType: 'contains', provider: 'Vercel',
  },
  'db-table': {
    parentId: 'map-group-data', systemKind: 'table', anchorId: 'map-postgres', relationType: 'contains', provider: 'Supabase',
  },
  'realtime-table': {
    parentId: 'map-group-data', systemKind: 'table', anchorId: 'map-realtime', relationType: 'reads', provider: 'Supabase Realtime',
  },
  'storage-bucket': {
    parentId: 'map-group-data', systemKind: 'storage', anchorId: 'map-web-app', relationType: 'writes', provider: 'Supabase Storage',
  },
})

const KNOWN_RESOURCE_COPY = Object.freeze({
  'db-table:share_revocations': {
    purpose: '공유 초대 거절·나가기·추방 기록을 보관해 같은 초대를 임의로 다시 수락하지 못하게 한다.',
    responsibility: '공유 수단과 사용자별 접근 취소 기록',
    constraints: '초대자가 다시 초대해 새 공유 행을 만들기 전까지 기존 초대 재사용을 차단',
  },
  'credential-reference:SUPABASE_ANON_KEY': {
    partLabel: 'Supabase 공개 클라이언트 키',
    purpose: '브라우저의 Supabase 클라이언트 초기화에 사용하는 공개 클라이언트 키 참조다.',
    responsibility: '공개 클라이언트 요청에 프로젝트 식별과 RLS 적용 역할을 제공',
    constraints: '키의 실제 값은 캔버스에 저장하지 않으며 서비스 역할 비밀 키와 구분',
  },
})

const STATUS_LABELS = {
  missing_on_canvas: '지도에서 사라짐',
  map_modified: '지도 구조 변경',
  relation_metadata_missing: '관계 정보 손실',
  evidence_missing: '근거 없음',
  source_missing: '원본 사라짐',
  needs_review: '근거 변경',
  changed: '구현 변경',
  discovered_since_baseline: '기준 이후 발견',
  baseline_unavailable: '기준 없음',
  unmodeled: '지도에 없음',
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function workflowTwinRoot(canvas) {
  const nodes = canvas?.nodes ?? []
  return nodes.find((node) => node?.data?.systemMapSnapshot)
    ?? nodes.find((node) => node.id === 'map-group-experience')
    ?? null
}

function canInspectWorkflowSystemTwin(canvas) {
  const ids = new Set((canvas?.nodes ?? []).map((node) => node.id))
  return SIGNATURE_NODE_IDS.every((id) => ids.has(id))
}

function resourceObservation(resources = []) {
  return resources.map((resource) => ({
    key: resource.key,
    status: resource.status,
    fingerprint: WORKFLOW_SYSTEM_DISCOVERY.current.resources[resource.key]?.fingerprint ?? null,
  }))
}

function evidenceForResources(resources = []) {
  return unique(resources.flatMap((resource) => resource.source_refs ?? []))
}

function nodeSize(node) {
  return {
    width: Number(node?.width ?? node?.measured?.width) || (node?.type === 'group' ? 900 : 240),
    height: Number(node?.height ?? node?.measured?.height) || (node?.type === 'group' ? 560 : 140),
  }
}

function overlapsWithMargin(left, right, margin = 30) {
  return left.x < right.x + right.width + margin
    && left.x + left.width + margin > right.x
    && left.y < right.y + right.height + margin
    && left.y + left.height + margin > right.y
}

function findOpenGroupPosition(canvas, parentId, width = 240, height = 140) {
  const group = (canvas.nodes ?? []).find((node) => node.id === parentId && node.type === 'group')
  if (!group) return null
  const groupSize = nodeSize(group)
  const occupied = (canvas.nodes ?? [])
    .filter((node) => node.parentId === parentId)
    .map((node) => ({ ...node.position, ...nodeSize(node) }))
  const maximumX = groupSize.width - width - 40
  const maximumY = groupSize.height - height - 40
  for (let y = 75; y <= maximumY; y += 225) {
    for (let x = 45; x <= maximumX; x += 305) {
      const candidate = { x, y, width, height }
      if (!occupied.some((rect) => overlapsWithMargin(candidate, rect))) return { x, y }
    }
  }
  return null
}

function absolutePosition(node, canvas) {
  const byId = new Map((canvas.nodes ?? []).map((candidate) => [candidate.id, candidate]))
  byId.set(node.id, node)
  let x = node?.position?.x ?? 0
  let y = node?.position?.y ?? 0
  let parentId = node?.parentId
  const seen = new Set([node?.id])
  while (parentId && !seen.has(parentId)) {
    seen.add(parentId)
    const parent = byId.get(parentId)
    if (!parent) break
    x += parent.position?.x ?? 0
    y += parent.position?.y ?? 0
    parentId = parent.parentId
  }
  return { x, y }
}

function relationHandles(source, target, canvas) {
  const sourcePosition = absolutePosition(source, canvas)
  const targetPosition = absolutePosition(target, canvas)
  const deltaX = targetPosition.x - sourcePosition.x
  const deltaY = targetPosition.y - sourcePosition.y
  if (Math.abs(deltaX) >= Math.abs(deltaY)) {
    return deltaX >= 0
      ? { sourceHandle: 'right', targetHandle: 'left' }
      : { sourceHandle: 'left', targetHandle: 'right' }
  }
  return deltaY >= 0
    ? { sourceHandle: 'bottom', targetHandle: 'top' }
    : { sourceHandle: 'top', targetHandle: 'bottom' }
}

function credentialPartProposal(resource, item, canvas) {
  const target = (canvas.nodes ?? []).find((node) => node.id === 'map-web-app' && node.type === 'system')
  if (!target) return null
  const suffix = digitalTwinReviewFingerprint({
    sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
    entityKey: resource.key,
  }).slice(0, 12)
  const proposalKey = `model-resource:${resource.key}`
  const proposalId = `${WORKFLOW_SYSTEM_TWIN_SOURCE_ID}::${proposalKey}`
  const sourceRefs = unique(resource.source_refs ?? [])
  const copy = KNOWN_RESOURCE_COPY[resource.key] ?? {}
  const part = {
    id: `twin-part-${suffix}`,
    kind: 'credential_ref',
    label: copy.partLabel || normalizeSystemPlainText(resource.label || resource.key, 120),
    ref: normalizeSystemPlainText(resource.label || resource.key.replace(/^credential-reference:/, ''), 240),
    exposure: resource.details?.classification === 'public-client-reference' ? 'public' : 'secret_reference',
    sourceKind: 'code',
    evidenceRef: normalizeSystemPlainText(sourceRefs.join(', '), 500),
    digitalTwinBinding: {
      schemaVersion: 1,
      sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
      entityKey: resource.key,
      observedFingerprint: WORKFLOW_SYSTEM_DISCOVERY.current.resources[resource.key]?.fingerprint ?? item.fingerprint,
      observedSnapshotId: WORKFLOW_SYSTEM_DISCOVERY.current.id,
      proposalId,
      itemId: item.id,
      itemFingerprint: item.fingerprint,
    },
  }
  const targetLabel = normalizeSystemPlainText(target.data?.label, 120) || target.id
  return createDigitalTwinGraphProposal({
    sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
    proposalKey,
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    snapshotId: WORKFLOW_SYSTEM_DISCOVERY.current.id,
    title: `${part.label} 파츠 추가`,
    summary: `${targetLabel} 노드에 키의 실제 값이 아닌 ${part.ref} 참조 파츠 1개를 추가합니다. 기존 노드 필드는 바꾸지 않습니다.`,
    operations: [{
      action: 'add_part',
      targetNodeId: target.id,
      label: `${targetLabel}에 ${part.label} 추가`,
      part,
    }],
  })
}

function resourceProposal(resource, item, canvas) {
  if (resource.kind === 'credential-reference') return credentialPartProposal(resource, item, canvas)
  const definition = RESOURCE_PROPOSAL_DEFS[resource.kind]
  if (!definition) return null
  const anchor = (canvas.nodes ?? []).find((node) => node.id === definition.anchorId)
  const position = findOpenGroupPosition(canvas, definition.parentId)
  if (!anchor || !position) return null
  const suffix = digitalTwinReviewFingerprint({ sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID, entityKey: resource.key }).slice(0, 12)
  const nodeId = `twin-resource-${suffix}`
  const edgeId = `twin-relation-${suffix}`
  const proposalKey = `model-resource:${resource.key}`
  const proposalId = `${WORKFLOW_SYSTEM_TWIN_SOURCE_ID}::${proposalKey}`
  const sourceRefs = unique(resource.source_refs ?? [])
  const copy = KNOWN_RESOURCE_COPY[resource.key] ?? {
    purpose: '소스에서 발견된 자원의 실제 역할을 지도에서 검토하고 문서화한다.',
    responsibility: `${resource.kind} 자원과 구현 근거의 연결`,
    constraints: '빌드에서 발견된 정보이며 실제 실행 상태는 별도로 확인',
  }
  const node = {
    id: nodeId,
    type: 'system',
    parentId: definition.parentId,
    position,
    width: 240,
    height: 140,
    data: {
      ...createSystemNodeData(definition.systemKind),
      label: normalizeSystemPlainText(resource.label || resource.key, 180),
      description: '디지털 트윈 변경 검토에서 추가한 발견 자원',
      purpose: copy.purpose,
      responsibility: copy.responsibility,
      constraints: copy.constraints,
      evidence: normalizeSystemPlainText(sourceRefs.join(', '), 500),
      environment: 'unknown',
      sourceKind: 'code',
      provider: definition.provider,
      externalRef: normalizeSystemPlainText(resource.key, 300),
      digitalTwinBinding: {
        schemaVersion: 1,
        sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
        entityKey: resource.key,
        observedFingerprint: WORKFLOW_SYSTEM_DISCOVERY.current.resources[resource.key]?.fingerprint ?? item.fingerprint,
        observedSnapshotId: WORKFLOW_SYSTEM_DISCOVERY.current.id,
        proposalId,
        itemId: item.id,
        itemFingerprint: item.fingerprint,
      },
    },
  }
  const handles = relationHandles(anchor, node, canvas)
  const relationData = createEdgeRelationData(definition.relationType, '', true, {
    relationSourceKind: 'code',
    relationConfidence: 'medium',
    relationEvidence: `${resource.label || resource.key} 자원이 소스에서 발견됐다.`,
    relationEvidenceRef: sourceRefs.join(', '),
  })
  const relation = edgeRelationInfo(relationData)
  const edge = {
    id: edgeId,
    source: definition.anchorId,
    target: nodeId,
    type: 'stub',
    ...handles,
    data: relationData,
    style: { stroke: relation.color, strokeWidth: 3 },
    markerEnd: relation.directed ? { type: 'arrowclosed', color: relation.color } : undefined,
  }
  const anchorLabel = normalizeSystemPlainText(anchor.data?.label, 120) || definition.anchorId
  return createDigitalTwinGraphProposal({
    sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
    proposalKey,
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    snapshotId: WORKFLOW_SYSTEM_DISCOVERY.current.id,
    title: `${resource.label || resource.key} 지도 추가`,
    summary: `발견 자원 노드 1개와 ${anchorLabel} 연결선 1개를 추가합니다. 기존 노드와 연결선은 바꾸지 않습니다.`,
    operations: [
      { action: 'add_node', label: `${resource.label || resource.key} 노드 추가`, node },
      { action: 'add_edge', label: `${anchorLabel} → ${resource.label || resource.key} · ${relation.label}`, edge },
    ],
  })
}

function nodeReviewItem(finding, canvas) {
  const isResourceFinding = Array.isArray(finding.resources)
  const status = finding.status
  const itemKey = `${isResourceFinding ? 'entity-resources' : 'entity-structure'}:${finding.node_id}`
  const severity = ['missing_on_canvas', 'source_missing'].includes(status) ? 'critical' : 'attention'
  const changeType = status === 'missing_on_canvas' || status === 'source_missing'
    ? 'removed'
    : status === 'baseline_unavailable'
      ? 'warning'
      : 'changed'
  return createDigitalTwinReviewItem({
    sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
    itemKey,
    category: 'entity',
    changeType,
    severity,
    title: `${finding.label ?? finding.node_id} · ${STATUS_LABELS[status] ?? status}`,
    summary: finding.reason,
    evidence: evidenceForResources(finding.resources),
    focus: (canvas.nodes ?? []).some((node) => node.id === finding.node_id)
      ? { nodeId: finding.node_id }
      : null,
    status,
    observation: {
      nodeId: finding.node_id,
      status,
      resources: resourceObservation(finding.resources),
    },
  })
}

function relationReviewItem(finding, canvas) {
  const actual = (canvas.edges ?? []).find((edge) => edge.id === finding.edge_id)
  const expected = EXPECTED_MAP.edges.find((edge) => edge.id === finding.edge_id)
  const edge = actual ?? expected
  const files = unique([
    ...(finding.source_missing ?? []),
    ...(finding.changed_evidence_files ?? []),
    ...String(actual?.data?.relationEvidenceRef ?? expected?.data?.relationEvidenceRef ?? '')
      .split(',')
      .map((value) => value.trim()),
  ])
  const status = finding.status
  const severity = ['missing_on_canvas', 'relation_metadata_missing', 'source_missing'].includes(status)
    ? 'critical'
    : 'attention'
  const changeType = status === 'missing_on_canvas' || status === 'source_missing'
    ? 'removed'
    : status === 'evidence_missing' || status === 'needs_review'
      ? 'evidence'
      : 'changed'
  return createDigitalTwinReviewItem({
    sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
    itemKey: `relation:${finding.edge_id}`,
    category: 'relation',
    changeType,
    severity,
    title: `${finding.edge_id} · ${STATUS_LABELS[status] ?? status}`,
    summary: finding.reason,
    evidence: files,
    focus: edge ? { edgeId: finding.edge_id, nodeIds: [edge.source, edge.target] } : null,
    status,
    observation: {
      edgeId: finding.edge_id,
      status,
      differences: finding.differences ?? [],
      relationType: finding.relation_type ?? null,
      fileFingerprints: Object.fromEntries(files.map((file) => [
        file,
        WORKFLOW_SYSTEM_DISCOVERY.current.files[file] ?? null,
      ])),
      actual: finding.actual ?? null,
      expected: finding.expected ?? null,
    },
  })
}

function resourceReviewItem(resource, canvas) {
  const item = createDigitalTwinReviewItem({
    sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
    itemKey: `resource:${resource.key}`,
    category: resource.kind === 'credential-reference' ? 'security' : 'resource',
    changeType: 'added',
    severity: resource.kind === 'credential-reference' ? 'attention' : 'info',
    title: `${resource.label ?? resource.key} · ${STATUS_LABELS.unmodeled}`,
    summary: '현재 소스에서 발견됐지만 캔버스의 시스템 실체와 연결되지 않았습니다.',
    evidence: resource.source_refs,
    focus: null,
    status: 'unmodeled',
    observation: {
      key: resource.key,
      kind: resource.kind,
      fingerprint: WORKFLOW_SYSTEM_DISCOVERY.current.resources[resource.key]?.fingerprint ?? null,
    },
  })
  const proposal = resourceProposal(resource, item, canvas)
  return proposal ? { ...item, proposal } : item
}

function severityRank(severity) {
  return { critical: 0, attention: 1, info: 2 }[severity] ?? 3
}

export function inspectWorkflowSystemTwin(canvas) {
  if (!canInspectWorkflowSystemTwin(canvas)) return null
  const root = workflowTwinRoot(canvas)
  const report = inspectWorkflowSystemMap({
    canvas,
    expectedMap: EXPECTED_MAP,
    discovery: WORKFLOW_SYSTEM_DISCOVERY,
  })
  const items = [
    ...report.node_findings.map((finding) => nodeReviewItem(finding, canvas)),
    ...report.relation_findings.map((finding) => relationReviewItem(finding, canvas)),
    ...report.unmodeled_resources.map((resource) => resourceReviewItem(resource, canvas)),
  ].sort((left, right) => (
    severityRank(left.severity) - severityRank(right.severity)
    || left.category.localeCompare(right.category)
    || left.title.localeCompare(right.title)
  ))

  return {
    source: {
      adapterId: 'workflow-system-discovery',
      id: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
      label: 'Workflow Canvas 시스템',
      snapshotId: report.scanner.manifest_id,
      baselineId: report.baseline.manifest_id,
      baselineTrust: report.baseline.trust,
      observationLevel: 'discovered',
      observationLabel: '빌드에서 발견됨',
      runtimeVerified: false,
      runtimeLabel: '실행 확인 아님',
      rootNodeId: root?.id ?? null,
    },
    summary: report.summary,
    items,
    report,
  }
}

export const workflowSystemTwinAdapter = Object.freeze({
  id: 'workflow-system-discovery',
  canInspect: canInspectWorkflowSystemTwin,
  inspect: inspectWorkflowSystemTwin,
})
