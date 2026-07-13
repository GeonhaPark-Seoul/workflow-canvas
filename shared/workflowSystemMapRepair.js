export const WORKFLOW_RELATION_REPAIR_CONFIRMATION = 'RESTORE_MISSING_RELATION_METADATA'

export const WORKFLOW_RELATION_METADATA_FIELDS = Object.freeze([
  'relationType',
  'relationLabel',
  'relationExplicit',
  'relationSourceKind',
  'relationConfidence',
  'relationEvidence',
  'relationEvidenceRef',
  'relationRuntime',
])

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value ?? {}, key)

export function hasWorkflowRelationMetadata(data) {
  return WORKFLOW_RELATION_METADATA_FIELDS.some((field) => hasOwn(data, field))
}

function relationShape(edge) {
  return {
    source: edge?.source ?? null,
    target: edge?.target ?? null,
    relation_type: edge?.data?.relationType ?? null,
    relation_metadata_present: hasWorkflowRelationMetadata(edge?.data),
  }
}

export function compareWorkflowSystemMapRelation(actual, expected) {
  const actualShape = relationShape(actual)
  const expectedShape = relationShape(expected)
  const differences = []

  if (!actual) {
    differences.push('edge_missing')
  } else {
    if (actual.source !== expected?.source) differences.push('source')
    if (actual.target !== expected?.target) differences.push('target')
    if (expectedShape.relation_metadata_present && !actualShape.relation_metadata_present) {
      differences.push('relation_metadata')
    } else if (actualShape.relation_type !== expectedShape.relation_type) {
      differences.push('relation_type')
    }
  }

  return { differences, actual: actualShape, expected: expectedShape }
}

export function planWorkflowSystemMapRelationRepair({ canvas, expectedMap }) {
  const actualById = new Map((canvas?.edges ?? []).map((edge) => [edge.id, edge]))
  const expectedEdges = expectedMap?.edges ?? []
  const repairs = []
  const protectedRelations = []
  const blockers = []
  let alreadyDocumented = 0

  for (const expected of expectedEdges) {
    const actual = actualById.get(expected.id)
    const comparison = compareWorkflowSystemMapRelation(actual, expected)

    if (!actual) {
      blockers.push({
        edge_id: expected.id,
        reason: 'edge_missing',
        expected: comparison.expected,
      })
      continue
    }

    const endpointDifferences = comparison.differences.filter((field) => field === 'source' || field === 'target')
    if (endpointDifferences.length) {
      blockers.push({
        edge_id: expected.id,
        reason: 'endpoint_mismatch',
        differences: endpointDifferences,
        actual: comparison.actual,
        expected: comparison.expected,
      })
      continue
    }

    if (!comparison.actual.relation_metadata_present) {
      repairs.push({
        edge_id: expected.id,
        source: expected.source,
        target: expected.target,
        expected_relation_type: expected.data?.relationType ?? null,
        expected_evidence_ref: expected.data?.relationEvidenceRef ?? null,
      })
      continue
    }

    if (comparison.differences.length) {
      protectedRelations.push({
        edge_id: expected.id,
        reason: 'existing_metadata_differs',
        differences: comparison.differences,
        actual: comparison.actual,
        expected: comparison.expected,
      })
    } else {
      alreadyDocumented += 1
    }
  }

  return {
    summary: {
      expected_relations: expectedEdges.length,
      repairable_missing_metadata: repairs.length,
      already_documented: alreadyDocumented,
      protected_existing_metadata: protectedRelations.length,
      structural_blockers: blockers.length,
    },
    repairs,
    protected_relations: protectedRelations,
    blockers,
  }
}

export function restoreMissingWorkflowSystemMapRelations({ canvas, expectedMap }) {
  const plan = planWorkflowSystemMapRelationRepair({ canvas, expectedMap })
  if (plan.blockers.length) {
    throw new Error('구조가 다른 관계가 있어 복구할 수 없습니다. 먼저 미리보기의 blockers를 검토하세요.')
  }

  const repairIds = new Set(plan.repairs.map((repair) => repair.edge_id))
  const expectedById = new Map((expectedMap?.edges ?? []).map((edge) => [edge.id, edge]))
  const edges = (canvas?.edges ?? []).map((edge) => {
    if (!repairIds.has(edge.id)) return edge
    const expected = expectedById.get(edge.id)
    return {
      ...edge,
      data: { ...(edge.data ?? {}), ...(expected?.data ?? {}) },
    }
  })

  return {
    edges,
    repaired_edge_ids: plan.repairs.map((repair) => repair.edge_id),
    protected_relations: plan.protected_relations,
  }
}
