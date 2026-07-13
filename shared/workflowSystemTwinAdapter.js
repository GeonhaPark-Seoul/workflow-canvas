import { createDigitalTwinReviewItem } from './digitalTwinReview.js'
import { createWorkflowCanvasSystemMap } from './workflowCanvasSystemMap.js'
import { inspectWorkflowSystemMap } from './workflowSystemDiscovery.js'
import { WORKFLOW_SYSTEM_DISCOVERY } from './workflowSystemDiscoveryManifest.js'

export const WORKFLOW_SYSTEM_TWIN_SOURCE_ID = 'workflow-canvas:self-system'

const SIGNATURE_NODE_IDS = ['map-web-app', 'map-mcp-api', 'map-postgres', 'map-canvases-table']
const EXPECTED_MAP = createWorkflowCanvasSystemMap()

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

function resourceReviewItem(resource) {
  return createDigitalTwinReviewItem({
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
    ...report.unmodeled_resources.map(resourceReviewItem),
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
