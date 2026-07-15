import {
  DIGITAL_TWIN_REVIEW_SCHEMA_VERSION,
  createDigitalTwinReviewItem,
  digitalTwinReviewFingerprint,
} from './digitalTwinReview.js'
import {
  createDigitalTwinGraphProposal,
  digitalTwinProposalEdgeFingerprint,
} from './digitalTwinProposal.js'
import { createEdgeRelationData, edgeRelationInfo } from './relationOntology.js'
import { normalizeSystemPart } from './systemPartOntology.js'
import {
  GITHUB_GIT_SYNC_PART_ID,
  LOCAL_GIT_SYNC_PART_ID,
} from './localConnector.js'
import { createSystemNodeData, normalizeSystemPlainText } from './systemOntology.js'
import { createWorkflowCanvasSystemMap } from './workflowCanvasSystemMap.js'
import {
  WORKFLOW_GIT_SYNC_EDGE_ID,
  WORKFLOW_SOURCE_TWIN_PART_IDS,
} from './workflowSourceTwinCanvas.js'
import {
  inspectWorkflowSystemMap,
  WORKFLOW_SYSTEM_DISCOVERY_SOURCE_ID,
} from './workflowSystemDiscovery.js'
import { WORKFLOW_SYSTEM_DISCOVERY } from './workflowSystemDiscoveryManifest.js'
import { TWIN_ENGINE_SCHEMA_VERSION } from './twinAdapterContract.js'
import { reconcileTwinBuild } from './twinBuildReconciler.js'
import {
  canInspectWorkflowSystemCanvas,
  WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR,
} from './workflowSystemTwinAdapterDescriptor.js'
import { WORKFLOW_SYSTEM_TWIN_BUILD } from './workflowSystemTwinBuild.js'

export const WORKFLOW_SYSTEM_TWIN_SOURCE_ID = WORKFLOW_SYSTEM_DISCOVERY_SOURCE_ID

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
  system_part_missing: '실행 파츠 없음',
  system_part_modified: '실행 파츠 변경',
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

function expectedSystemPartProposal(finding, item, canvas) {
  if (!['system_part_missing', 'system_part_modified'].includes(finding.status) || !finding.expected_part) return null
  const target = (canvas.nodes ?? []).find((node) => node.id === finding.node_id && node.type === 'system')
  if (!target) return null
  const targetLabel = normalizeSystemPlainText(target.data?.label, 120) || target.id
  const partLabel = normalizeSystemPlainText(finding.expected_part.label, 120) || finding.expected_part.id
  const replacing = finding.status === 'system_part_modified' && !!finding.actual_part
  const actualPart = replacing ? normalizeSystemPart(finding.actual_part) : null
  const executionPart = ['connection', 'trigger'].includes(finding.expected_part.kind)
  const partContract = executionPart
    ? `서버 허용 목록으로 제한된 ${partLabel} 실행 파츠`
    : `구현 근거가 연결된 ${partLabel} 파츠`
  if (replacing && !actualPart) return null
  return createDigitalTwinGraphProposal({
    sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
    proposalKey: `${replacing ? 'replace' : 'restore'}-system-part:${target.id}:${finding.expected_part.id}`,
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    snapshotId: WORKFLOW_SYSTEM_DISCOVERY.current.id,
    title: `${partLabel} 파츠 ${replacing ? '교체' : '추가'}`,
    summary: replacing
      ? `${targetLabel} 노드의 기존 파츠가 미리 확인한 지문과 같을 때만 ${partContract}로 교체합니다.`
      : `${targetLabel} 노드에 ${partContract} 1개를 추가합니다. 기존 노드 필드는 바꾸지 않습니다.`,
    operations: [replacing
      ? {
          action: 'replace_part',
          targetNodeId: target.id,
          partId: actualPart.id,
          expectedPartFingerprint: digitalTwinReviewFingerprint(actualPart),
          label: `${targetLabel}의 ${partLabel} 교체`,
          part: finding.expected_part,
        }
      : {
          action: 'add_part',
          targetNodeId: target.id,
          label: `${targetLabel}에 ${partLabel} 추가`,
          part: finding.expected_part,
        }],
  })
}

function workflowCodePortMigrationItem(canvas) {
  const localNode = (canvas.nodes ?? []).find((node) => node.id === 'map-local-repo' && node.type === 'system')
  const githubNode = (canvas.nodes ?? []).find((node) => node.id === 'map-github' && node.type === 'system')
  const expectedLocalNode = EXPECTED_MAP.nodes.find((node) => node.id === 'map-local-repo')
  const expectedGithubNode = EXPECTED_MAP.nodes.find((node) => node.id === 'map-github')
  const expectedEdge = EXPECTED_MAP.edges.find((edge) => edge.id === WORKFLOW_GIT_SYNC_EDGE_ID)
  if (!localNode || !githubNode || !expectedLocalNode || !expectedGithubNode || !expectedEdge) return null

  const localParts = new Map((localNode.data?.systemParts ?? []).map((part) => [part.id, normalizeSystemPart(part)]))
  const githubParts = new Map((githubNode.data?.systemParts ?? []).map((part) => [part.id, normalizeSystemPart(part)]))
  const expectedLocalPart = normalizeSystemPart(expectedLocalNode.data?.systemParts?.find((part) => part.id === WORKFLOW_SOURCE_TWIN_PART_IDS.localCode))
  const expectedGithubPart = normalizeSystemPart(expectedGithubNode.data?.systemParts?.find((part) => part.id === WORKFLOW_SOURCE_TWIN_PART_IDS.githubCode))
  const actualEdge = (canvas.edges ?? []).find((edge) => edge.id === WORKFLOW_GIT_SYNC_EDGE_ID)
  if (!expectedLocalPart || !expectedGithubPart) return null

  const operations = []
  const planPart = (targetNodeId, currentParts, expectedPart, label) => {
    const currentPart = currentParts.get(expectedPart.id)
    if (!currentPart) {
      operations.push({ action: 'add_part', targetNodeId, part: expectedPart, label: `${label} 추가` })
      return
    }
    if (digitalTwinReviewFingerprint(currentPart) === digitalTwinReviewFingerprint(expectedPart)) return
    operations.push({
      action: 'replace_part',
      targetNodeId,
      partId: currentPart.id,
      expectedPartFingerprint: digitalTwinReviewFingerprint(currentPart),
      part: expectedPart,
      label: `${label} 교체`,
    })
  }
  const retirePart = (targetNodeId, currentParts, partId, label) => {
    const currentPart = currentParts.get(partId)
    if (!currentPart) return
    operations.push({
      action: 'remove_part',
      targetNodeId,
      partId,
      expectedPartFingerprint: digitalTwinReviewFingerprint(currentPart),
      label: `${label} 퇴역`,
    })
  }

  planPart(localNode.id, localParts, expectedLocalPart, '로컬 코드 파츠')
  planPart(githubNode.id, githubParts, expectedGithubPart, 'GitHub 코드 파츠')
  retirePart(localNode.id, localParts, LOCAL_GIT_SYNC_PART_ID, '중복 Git 동기화 파츠')
  retirePart(githubNode.id, githubParts, GITHUB_GIT_SYNC_PART_ID, '중복 로컬 동기화 파츠')

  if (!actualEdge) {
    operations.push({ action: 'add_edge', edge: expectedEdge, label: '코드 파츠 동기화 연결선 추가' })
  } else if (digitalTwinProposalEdgeFingerprint(actualEdge) !== digitalTwinProposalEdgeFingerprint(expectedEdge)) {
    if (actualEdge.source !== expectedEdge.source || actualEdge.target !== expectedEdge.target) return null
    operations.push({
      action: 'replace_edge',
      edgeId: actualEdge.id,
      expectedEdgeFingerprint: digitalTwinProposalEdgeFingerprint(actualEdge),
      edge: expectedEdge,
      label: '코드 파츠 동기화 연결선 교체',
    })
  }
  if (!operations.length) return null

  const item = createDigitalTwinReviewItem({
    sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
    itemKey: 'relation:repository-code-ports-migration',
    category: 'relation',
    changeType: 'changed',
    severity: 'attention',
    title: '저장소 코드 파츠와 동기화 연결 정리',
    summary: '동기화를 별도 파츠 두 개로 표현한 이전 모델을 정리하고, 로컬 코드와 GitHub 코드 파츠 사이의 방향성 있는 조작 관계로 바꿉니다.',
    evidence: [
      'shared/workflowCanvasSystemMap.js',
      'shared/workflowSourceTwinCanvas.js',
      'scripts/local-connector-agent.mjs',
    ],
    focus: { edgeId: WORKFLOW_GIT_SYNC_EDGE_ID, nodeIds: [localNode.id, githubNode.id] },
    status: 'map_modified',
    observation: {
      localParts: [...localParts.values()].filter(Boolean),
      githubParts: [...githubParts.values()].filter(Boolean),
      edge: actualEdge ?? null,
    },
  })
  const proposal = createDigitalTwinGraphProposal({
    sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
    proposalKey: 'migrate-repository-code-ports',
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    snapshotId: WORKFLOW_SYSTEM_DISCOVERY.current.id,
    title: '저장소 코드 파츠와 동기화 연결 정리',
    summary: '로컬 코드와 GitHub 코드 파츠를 만든 뒤 연결선을 두 코드 포트에 연결하고, 중복 동기화 파츠를 같은 적용 안에서 제거합니다.',
    operations,
  })
  return { ...item, proposal }
}

function nodeReviewItem(finding, canvas) {
  const isResourceFinding = Array.isArray(finding.resources)
  const isPartFinding = !!finding.expected_part
  const status = finding.status
  const itemKey = isPartFinding
    ? `entity-part:${finding.node_id}:${finding.expected_part.id}`
    : `${isResourceFinding ? 'entity-resources' : 'entity-structure'}:${finding.node_id}`
  const severity = ['missing_on_canvas', 'source_missing'].includes(status) ? 'critical' : 'attention'
  const changeType = status === 'missing_on_canvas' || status === 'source_missing'
    ? 'removed'
    : status === 'system_part_missing'
      ? 'added'
      : status === 'baseline_unavailable'
        ? 'warning'
        : 'changed'
  const evidence = isPartFinding
    ? String(finding.expected_part.evidenceRef ?? '').split(',').map((value) => value.trim()).filter(Boolean)
    : evidenceForResources(finding.resources)
  const item = createDigitalTwinReviewItem({
    sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
    itemKey,
    category: isPartFinding ? 'runtime' : 'entity',
    changeType,
    severity,
    title: `${finding.label ?? finding.node_id} · ${STATUS_LABELS[status] ?? status}`,
    summary: finding.reason,
    evidence,
    focus: (canvas.nodes ?? []).some((node) => node.id === finding.node_id)
      ? { nodeId: finding.node_id }
      : null,
    status,
    observation: {
      nodeId: finding.node_id,
      status,
      resources: resourceObservation(finding.resources),
      ...(isPartFinding ? {
        partId: finding.expected_part.id,
        expectedPart: finding.expected_part,
        actualPart: finding.actual_part ?? null,
      } : {}),
    },
  })
  const proposal = expectedSystemPartProposal(finding, item, canvas)
  return proposal ? { ...item, proposal } : item
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
  const item = createDigitalTwinReviewItem({
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
  if (
    finding.edge_id !== 'map-edge-repo-github'
    || status !== 'map_modified'
    || !actual
    || !expected
    || actual.source !== expected.source
    || actual.target !== expected.target
  ) return item
  const proposal = createDigitalTwinGraphProposal({
    sourceId: WORKFLOW_SYSTEM_TWIN_SOURCE_ID,
    proposalKey: `replace-edge-contract:${finding.edge_id}`,
    itemId: item.id,
    itemFingerprint: item.fingerprint,
    snapshotId: WORKFLOW_SYSTEM_DISCOVERY.current.id,
    title: 'Git 동기화 연결선을 양쪽 코드 파츠에 연결',
    summary: '로컬 저장소와 GitHub 사이의 기존 양 끝 노드는 유지하고, 연결선 양 끝을 각 저장소의 코드 파츠 소켓으로 옮겨 최신 근거 계약으로 교체합니다.',
    operations: [{
      action: 'replace_edge',
      edgeId: actual.id,
      expectedEdgeFingerprint: digitalTwinProposalEdgeFingerprint(actual),
      label: 'Git 동기화 연결선 계약 교체',
      edge: expected,
    }],
  })
  return { ...item, proposal }
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
  if (!canInspectWorkflowSystemCanvas(canvas)) return null
  const root = workflowTwinRoot(canvas)
  const buildReview = reconcileTwinBuild({ build: WORKFLOW_SYSTEM_TWIN_BUILD, canvas })
  const report = inspectWorkflowSystemMap({
    canvas,
    expectedMap: EXPECTED_MAP,
    discovery: WORKFLOW_SYSTEM_DISCOVERY,
  })
  const codePortMigration = workflowCodePortMigrationItem(canvas)
  const migratedPartIds = new Set([
    WORKFLOW_SOURCE_TWIN_PART_IDS.localCode,
    WORKFLOW_SOURCE_TWIN_PART_IDS.githubCode,
  ])
  const items = [
    ...(codePortMigration ? [codePortMigration] : []),
    ...buildReview.items.filter((item) => (
      item.category !== 'runtime'
      && !(codePortMigration && item.itemKey.includes('map-edge-repo-github'))
    )),
    ...report.node_findings
      .filter((finding) => (
        (Array.isArray(finding.resources) || !!finding.expected_part)
        && !(
          codePortMigration
          && ['map-local-repo', 'map-github'].includes(finding.node_id)
          && migratedPartIds.has(finding.expected_part?.id)
        )
      ))
      .map((finding) => nodeReviewItem(finding, canvas)),
    ...report.relation_findings
      .filter((finding) => ['source_missing', 'needs_review'].includes(finding.status))
      .map((finding) => relationReviewItem(finding, canvas)),
    ...report.unmodeled_resources.map((resource) => resourceReviewItem(resource, canvas)),
  ].sort((left, right) => (
    severityRank(left.severity) - severityRank(right.severity)
    || left.category.localeCompare(right.category)
    || left.title.localeCompare(right.title)
  ))

  return {
    schemaVersion: DIGITAL_TWIN_REVIEW_SCHEMA_VERSION,
    source: {
      adapterId: WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR.id,
      adapterContractVersion: WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR.contractVersion,
      adapterVersion: WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR.adapterVersion,
      engineSchemaVersion: TWIN_ENGINE_SCHEMA_VERSION,
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
      buildSchemaVersion: WORKFLOW_SYSTEM_TWIN_BUILD.schemaVersion,
      buildId: WORKFLOW_SYSTEM_TWIN_BUILD.id,
      buildFingerprint: WORKFLOW_SYSTEM_TWIN_BUILD.fingerprint,
    },
    summary: {
      ...report.summary,
      twin_build_findings: buildReview.summary.pending,
      twin_build_actionable: buildReview.summary.actionable,
      twin_build_blocked: buildReview.summary.blocked,
    },
    items,
    report: {
      ...report,
      twin_build_reconciliation: buildReview.report,
    },
  }
}

export const workflowSystemTwinAdapter = Object.freeze({
  id: WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR.id,
  describe: () => WORKFLOW_SYSTEM_TWIN_ADAPTER_DESCRIPTOR,
  canInspect: canInspectWorkflowSystemCanvas,
  normalize: () => WORKFLOW_SYSTEM_TWIN_BUILD,
  reconcile: (canvas, build = WORKFLOW_SYSTEM_TWIN_BUILD) => reconcileTwinBuild({ build, canvas }),
  inspect: inspectWorkflowSystemTwin,
})
