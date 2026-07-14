import {
  compareWorkflowSystemMapRelation,
  hasWorkflowRelationMetadata,
} from './workflowSystemMapRepair.js'
import { normalizeSystemParts } from './systemPartOntology.js'

export const LEGACY_SYSTEM_MAP_BASELINE_ID = 'phase3-41ca765'
export const WORKFLOW_SYSTEM_DISCOVERY_SOURCE_ID = 'workflow-canvas:self-system'

export const WORKFLOW_SYSTEM_MAP_NODE_BINDINGS = Object.freeze({
  'map-web-app': [
    'file:src/App.jsx',
    'file:src/components/DigitalTwinReviewPanel.jsx',
    'file:src/lib/digitalTwinAdapters.js',
    'file:src/nodes/SystemNode.jsx',
    'file:shared/digitalTwinProposal.js',
    'file:shared/digitalTwinReview.js',
    'file:shared/workflowSystemTwinAdapter.js',
    'dependency:react',
    'dependency:vite',
  ],
  'map-canvas-engine': ['dependency:@xyflow/react'],
  'map-local-cache': ['file:src/storage.js'],
  'map-pwa': ['file:vite.config.js', 'dependency:vite-plugin-pwa'],
  'map-vercel': ['file:vercel.json', 'npm-script:build'],
  'map-shared-api': ['api:/api/shared-canvas', 'file:mcp/shareAccess.js'],
  'map-mcp-api': [
    'api:/api/mcp',
    'file:mcp/server.js',
    'file:mcp/store.js',
    'collection:mcp-tools',
    'collection:environment-variables',
    'dependency:@modelcontextprotocol/sdk',
  ],
  'map-permission-gateway': ['file:mcp/shareAccess.js'],
  'map-supabase-auth': ['file:src/lib/supabase.js', 'dependency:@supabase/supabase-js'],
  'map-postgres': ['file:supabase-schema.sql'],
  'map-rls': ['collection:rls-policies', 'collection:db-functions'],
  'map-canvases-table': ['db-table:canvases'],
  'map-sharing-tables': ['db-table:canvas_shares', 'db-table:share_members'],
  'map-profiles-table': ['db-table:profiles'],
  'map-prefs-table': ['db-table:user_prefs'],
  'map-mcp-tokens-table': ['db-table:mcp_tokens'],
  'map-realtime': ['realtime-table:canvases'],
  'map-image-storage': ['storage-bucket:canvas-images'],
  'map-local-repo': [
    'file:package.json',
    'file:scripts/generate-source-twin.mjs',
    'file:scripts/source-twin-scanner.mjs',
    'file:shared/sourceTwin.js',
    'file:mcp/sourceTwinStore.js',
    'file:api/source-twin.js',
    'file:api/source-twin-webhook.js',
    'file:src/components/SourceTwinPanel.jsx',
    'file:src/lib/sourceTwinApi.js',
    'api:/api/source-twin',
    'api:/api/source-twin-webhook',
    'db-table:source_twin_snapshots',
    'db-table:source_twin_events',
  ],
  'map-tests': [
    'npm-script:test',
    'npm-script:discover:check',
    'npm-script:source-twin:check',
    'file:scripts/test-mcp-logic.mjs',
    'file:scripts/test-source-twin.mjs',
    'file:scripts/test-sql-security.mjs',
  ],
})

const ACTIONABLE_RESOURCE_KINDS = new Set([
  'api',
  'credential-reference',
  'db-table',
  'realtime-table',
  'storage-bucket',
])

const LEGACY_SIGNATURE_NODE_IDS = ['map-web-app', 'map-mcp-api', 'map-postgres', 'map-canvases-table']

function snapshotManifestId(canvas) {
  return (canvas?.nodes ?? [])
    .map((node) => node?.data?.systemMapSnapshot?.manifestId)
    .find((value) => typeof value === 'string' && value)
}

export function selectWorkflowSystemMapBaseline(canvas, discovery) {
  const requestedId = snapshotManifestId(canvas)
  if (requestedId) {
    if (requestedId === discovery.current.id) {
      return {
        manifest: discovery.current,
        id: requestedId,
        source: 'canvas-declared-current',
        trust: 'declared-not-server-verified',
      }
    }
    if (discovery.baselines?.[requestedId]) {
      return {
        manifest: discovery.baselines[requestedId],
        id: requestedId,
        source: 'canvas-declared-history',
        trust: 'declared-not-server-verified',
      }
    }
    return {
      manifest: null,
      id: requestedId,
      source: 'canvas-declared-unknown',
      trust: 'unavailable',
    }
  }

  const nodeIds = new Set((canvas?.nodes ?? []).map((node) => node.id))
  const isLegacySelfMap = LEGACY_SIGNATURE_NODE_IDS.every((id) => nodeIds.has(id))
  if (isLegacySelfMap && discovery.baselines?.[LEGACY_SYSTEM_MAP_BASELINE_ID]) {
    return {
      manifest: discovery.baselines[LEGACY_SYSTEM_MAP_BASELINE_ID],
      id: LEGACY_SYSTEM_MAP_BASELINE_ID,
      source: 'legacy-template-inference',
      trust: 'declared-not-server-verified',
    }
  }

  return { manifest: null, id: null, source: 'unavailable', trust: 'unavailable' }
}

function nodeLabel(node, fallback) {
  const value = node?.data?.label
  return typeof value === 'string' && value.trim() ? value.replace(/<[^>]*>/g, ' ').trim() : fallback
}

function changedResourceStatus(current, baseline) {
  if (!current) return 'source_missing'
  if (!baseline) return 'discovered_since_baseline'
  return current.fingerprint === baseline.fingerprint ? 'current' : 'changed'
}

function appliedResourceStatus(current, observedFingerprint) {
  if (!current) return 'source_missing'
  return current.fingerprint === observedFingerprint ? 'current' : 'changed'
}

function workflowResourceBindings(canvas) {
  const byNode = new Map()
  const addBinding = (nodeId, key, observedFingerprint = null) => {
    if (!byNode.has(nodeId)) byNode.set(nodeId, new Map())
    const resources = byNode.get(nodeId)
    const current = resources.get(key)
    if (!current || (!current.observedFingerprint && observedFingerprint)) {
      resources.set(key, { key, observedFingerprint })
    }
  }
  for (const [nodeId, resourceKeys] of Object.entries(WORKFLOW_SYSTEM_MAP_NODE_BINDINGS)) {
    for (const key of resourceKeys) addBinding(nodeId, key)
  }
  const addDigitalTwinBinding = (nodeId, binding) => {
    if (binding?.sourceId !== WORKFLOW_SYSTEM_DISCOVERY_SOURCE_ID) return
    if (typeof binding.entityKey !== 'string' || !binding.entityKey.trim()) return
    if (typeof binding.observedFingerprint !== 'string' || !/^[a-f0-9]{8,80}$/i.test(binding.observedFingerprint)) return
    addBinding(nodeId, binding.entityKey, binding.observedFingerprint)
  }
  for (const node of canvas?.nodes ?? []) {
    addDigitalTwinBinding(node.id, node?.data?.digitalTwinBinding)
    for (const part of node?.data?.systemParts ?? []) {
      addDigitalTwinBinding(node.id, part?.digitalTwinBinding)
    }
  }
  return [...byNode].map(([nodeId, resources]) => ({ nodeId, resources: [...resources.values()] }))
}

function priorityStatus(statuses) {
  for (const status of ['source_missing', 'changed', 'discovered_since_baseline']) {
    if (statuses.includes(status)) return status
  }
  return 'current'
}

function evidenceFiles(reference, current, baseline) {
  if (typeof reference !== 'string' || !reference.trim()) return []
  const known = new Set([...Object.keys(current?.files ?? {}), ...Object.keys(baseline?.files ?? {})])
  return [...known].filter((file) => reference.includes(file)).sort()
}

function compactResource(resource, status) {
  return {
    key: resource?.key,
    kind: resource?.kind,
    label: resource?.label,
    status,
    source_refs: resource?.sourceRefs ?? [],
    ...(resource?.details ? { details: resource.details } : {}),
  }
}

function systemPartContractSignature(part) {
  return JSON.stringify({
    id: part.id,
    kind: part.kind,
    ref: part.ref,
    exposure: part.exposure,
    sourceId: part.digitalTwinBinding?.sourceId ?? null,
    entityKey: part.digitalTwinBinding?.entityKey ?? null,
    observedFingerprint: part.digitalTwinBinding?.observedFingerprint ?? null,
  })
}

export function inspectWorkflowSystemMap({ canvas, expectedMap, discovery }) {
  const current = discovery.current
  const baselineSelection = selectWorkflowSystemMapBaseline(canvas, discovery)
  const baseline = baselineSelection.manifest
  const canvasNodes = new Map((canvas?.nodes ?? []).map((node) => [node.id, node]))
  const canvasEdges = new Map((canvas?.edges ?? []).map((edge) => [edge.id, edge]))
  const expectedNodes = new Map((expectedMap?.nodes ?? []).map((node) => [node.id, node]))
  const expectedEdges = new Map((expectedMap?.edges ?? []).map((edge) => [edge.id, edge]))
  const nodeFindings = []
  const relationFindings = []
  let unchangedBoundNodes = 0
  const resourceBindings = workflowResourceBindings(canvas)

  for (const [nodeId, expected] of expectedNodes) {
    const actual = canvasNodes.get(nodeId)
    if (!actual) {
      nodeFindings.push({
        status: 'missing_on_canvas',
        node_id: nodeId,
        label: nodeLabel(expected, nodeId),
        reason: '기준 시스템 지도에 있던 노드가 현재 캔버스에 없습니다.',
      })
      continue
    }
    if (actual.type !== expected.type) {
      nodeFindings.push({
        status: 'map_modified',
        node_id: nodeId,
        label: nodeLabel(actual, nodeId),
        reason: `노드 종류가 ${expected.type}에서 ${actual.type}으로 바뀌었습니다.`,
      })
    }
    const actualParts = new Map(normalizeSystemParts(actual.data?.systemParts).map((part) => [part.id, part]))
    for (const expectedPart of normalizeSystemParts(expected.data?.systemParts)) {
      const actualPart = actualParts.get(expectedPart.id)
      if (!actualPart) {
        nodeFindings.push({
          status: 'system_part_missing',
          node_id: nodeId,
          label: nodeLabel(actual, nodeId),
          expected_part: expectedPart,
          reason: `${expectedPart.label} 실행 파츠가 현재 시스템 지도에 없습니다.`,
        })
      } else if (systemPartContractSignature(actualPart) !== systemPartContractSignature(expectedPart)) {
        nodeFindings.push({
          status: 'system_part_modified',
          node_id: nodeId,
          label: nodeLabel(actual, nodeId),
          expected_part: expectedPart,
          actual_part: actualPart,
          reason: `${expectedPart.label} 실행 파츠가 기준과 다르게 수정되었습니다.`,
        })
      }
    }
  }

  for (const { nodeId, resources: boundResources } of resourceBindings) {
    const actualNode = canvasNodes.get(nodeId)
    if (!actualNode) continue
    const resources = boundResources.map(({ key, observedFingerprint }) => {
      const currentResource = current.resources[key]
      const baselineResource = baseline?.resources?.[key]
      const status = observedFingerprint
        ? appliedResourceStatus(currentResource, observedFingerprint)
        : changedResourceStatus(currentResource, baselineResource)
      return compactResource(currentResource ?? baselineResource ?? { key, label: key, sourceRefs: [] }, status)
    })
    const status = baseline ? priorityStatus(resources.map((resource) => resource.status)) : 'baseline_unavailable'
    if (status === 'current') {
      unchangedBoundNodes += 1
    } else {
      nodeFindings.push({
        status,
        node_id: nodeId,
        label: nodeLabel(actualNode, nodeId),
        resources: resources.filter((resource) => resource.status !== 'current'),
        reason: status === 'baseline_unavailable'
          ? '비교할 기준 manifest를 찾을 수 없어 현재 존재 여부만 확인했습니다.'
          : '연결된 코드·설정 자원이 지도 작성 또는 수정안 적용 시점과 다릅니다.',
      })
    }
  }

  for (const [edgeId, expected] of expectedEdges) {
    const actual = canvasEdges.get(edgeId)
    if (!actual) {
      const comparison = compareWorkflowSystemMapRelation(actual, expected)
      relationFindings.push({
        status: 'missing_on_canvas',
        edge_id: edgeId,
        relation_type: expected.data?.relationType,
        differences: comparison.differences,
        expected: comparison.expected,
        reason: '기준 시스템 지도에 있던 관계가 현재 캔버스에 없습니다.',
      })
      continue
    }
    const comparison = compareWorkflowSystemMapRelation(actual, expected)
    if (comparison.differences.length) {
      const metadataMissing = comparison.differences.includes('relation_metadata')
      relationFindings.push({
        status: metadataMissing ? 'relation_metadata_missing' : 'map_modified',
        edge_id: edgeId,
        relation_type: actual.data?.relationType ?? null,
        differences: comparison.differences,
        actual: comparison.actual,
        expected: comparison.expected,
        repair_eligible: metadataMissing
          && actual.source === expected.source
          && actual.target === expected.target
          && !hasWorkflowRelationMetadata(actual.data),
        reason: metadataMissing
          ? '연결선의 양 끝은 유지됐지만 관계 타입과 근거 메타데이터가 통째로 없습니다.'
          : '관계의 양 끝 또는 의미 타입이 기준 지도와 다릅니다.',
      })
      continue
    }

    const reference = actual.data?.relationEvidenceRef
    const files = evidenceFiles(reference, current, baseline)
    if (!reference) {
      relationFindings.push({
        status: 'evidence_missing',
        edge_id: edgeId,
        relation_type: actual.data?.relationType,
        reason: '관계의 근거 참조가 비어 있습니다.',
      })
      continue
    }
    if (!files.length || !baseline) continue

    const sourceMissing = files.filter((file) => !current.files[file])
    const changed = files.filter((file) => current.files[file] && baseline.files?.[file] !== current.files[file])
    if (sourceMissing.length || changed.length) {
      relationFindings.push({
        status: sourceMissing.length ? 'source_missing' : 'needs_review',
        edge_id: edgeId,
        relation_type: actual.data?.relationType,
        source_missing: sourceMissing,
        changed_evidence_files: changed,
        reason: sourceMissing.length
          ? '관계 근거로 적힌 파일을 최신 코드에서 찾을 수 없습니다.'
          : '근거 파일이 지도 작성 이후 바뀌어 관계 의미를 다시 확인해야 합니다.',
      })
    }
  }

  const modeledResources = new Set(resourceBindings.flatMap((binding) => binding.resources.map((resource) => resource.key)))
  const unmodeledResources = Object.values(current.resources)
    .filter((resource) => ACTIONABLE_RESOURCE_KINDS.has(resource.kind) && !modeledResources.has(resource.key))
    .map((resource) => compactResource(resource, 'unmodeled'))

  const expectedNodeIds = new Set(expectedNodes.keys())
  const expectedEdgeIds = new Set(expectedEdges.keys())
  return {
    mode: 'read-only-discovery',
    writes_performed: false,
    scanner: { manifest_id: current.id, ...current.summary },
    baseline: {
      manifest_id: baselineSelection.id,
      source: baselineSelection.source,
      trust: baselineSelection.trust,
    },
    summary: {
      expected_nodes: expectedNodes.size,
      canvas_nodes: canvasNodes.size,
      custom_canvas_nodes: [...canvasNodes.keys()].filter((id) => !expectedNodeIds.has(id)).length,
      expected_relations: expectedEdges.size,
      canvas_relations: canvasEdges.size,
      custom_canvas_relations: [...canvasEdges.keys()].filter((id) => !expectedEdgeIds.has(id)).length,
      unchanged_bound_nodes: unchangedBoundNodes,
      node_findings: nodeFindings.length,
      relation_findings: relationFindings.length,
      unmodeled_resources: unmodeledResources.length,
    },
    node_findings: nodeFindings,
    relation_findings: relationFindings,
    unmodeled_resources: unmodeledResources,
    guidance: [
      '이 보고서는 코드·SQL·설정의 이름과 지문만 비교하며 어떤 파일, DB, 캔버스도 수정하지 않습니다.',
      'changed 또는 needs_review는 오류 확정이 아니라 사람이 다시 확인해야 한다는 뜻입니다.',
      'unmodeled 자원은 자동 추가하지 말고 필요성과 보안 경계를 검토한 뒤 지도 반영 여부를 결정하세요.',
    ],
  }
}
