import assert from 'node:assert/strict'

import {
  createSourceCodeWorldProjection,
  sourceCodeWorldSelection,
  SOURCE_CODE_WORLD_LODS,
  SOURCE_CODE_WORLD_PROJECTION_SCHEMA_VERSION,
  traceSourceCodeWorld,
} from '../shared/sourceCodeWorldProjection.js'
import { SOURCE_FLOW_MANIFEST } from '../shared/sourceFlowManifest.js'
import { SOURCE_TWIN_MANIFEST } from '../shared/sourceTwinManifest.js'

const overview = createSourceCodeWorldProjection(SOURCE_TWIN_MANIFEST)
const repeated = createSourceCodeWorldProjection(SOURCE_TWIN_MANIFEST)

assert.deepEqual(repeated, overview, '같은 Source Lens manifest는 같은 코드 세계를 만들어야 합니다.')
assert.equal(overview.schemaVersion, SOURCE_CODE_WORLD_PROJECTION_SCHEMA_VERSION)
assert.equal(overview.status, 'ready')
assert.equal(overview.sourceManifestId, SOURCE_TWIN_MANIFEST.id)
assert.equal(overview.repository.repositoryUrl, SOURCE_TWIN_MANIFEST.source.repositoryUrl)
assert.equal(overview.repository.project.id, SOURCE_TWIN_MANIFEST.source.profile.id)
assert.equal(overview.repository.defaultBranch, SOURCE_TWIN_MANIFEST.source.defaultBranch)
assert.ok(overview.districts.length > 0)
assert.ok(overview.groups.subsystems.length > 0)
assert.ok(overview.groups.components.length > 0)
assert.ok(overview.parts.length > 0)
assert.ok(overview.edges.length > 0)
assert.ok(overview.parts.length <= SOURCE_CODE_WORLD_LODS.overview.maxParts)
assert.ok(overview.edges.length <= SOURCE_CODE_WORLD_LODS.overview.maxEdges)

const sourceEntityIds = new Set(SOURCE_TWIN_MANIFEST.entities.map((entity) => entity.id))
const sourceRelationById = new Map(SOURCE_TWIN_MANIFEST.relations.map((relation) => [relation.id, relation]))
assert.ok(overview.parts.every((part) => sourceEntityIds.has(part.id)))
assert.ok(overview.parts.every((part) => part.entityKind === 'file'))
assert.ok(overview.groups.components.every((component) => (
  component.partIds.length > 0
  && component.partIds.every((partId) => sourceEntityIds.has(partId))
)))
assert.ok(overview.edges.every((edge) => {
  const source = sourceRelationById.get(edge.id)
  return source
    && source.source === edge.source
    && source.target === edge.target
    && source.type === edge.type
}))

const sourceTwinPartId = 'file:shared/sourceTwin.js'
const sourceTwinPart = overview.parts.find((part) => part.id === sourceTwinPartId)
assert.ok(sourceTwinPart, '실제 Source Lens 파일 entity가 overview에 보여야 합니다.')
assert.equal(sourceTwinPart.path, 'shared/sourceTwin.js')
assert.ok(overview.districts.some((district) => district.partIds.includes(sourceTwinPartId)))
assert.ok(overview.groups.subsystems.some((group) => group.partIds.includes(sourceTwinPartId)))

const selection = sourceCodeWorldSelection(overview, sourceTwinPartId, {
  flowCatalog: SOURCE_FLOW_MANIFEST,
})
assert.equal(selection.status, 'ready')
assert.equal(selection.part.id, sourceTwinPartId)
assert.ok(selection.district)
assert.ok(selection.subsystem)
assert.ok(selection.incomingEdges.length + selection.outgoingEdges.length > 0)
assert.ok(selection.sourceFlows)
assert.equal(selection.sourceFlows.moduleId, sourceTwinPartId)

const relation = overview.edges.find((edge) => edge.type === 'imports')
assert.ok(relation, 'overview에는 실제 파일 import relation이 있어야 합니다.')
const trace = traceSourceCodeWorld(overview, relation.source, {
  direction: 'outgoing',
  depth: 1,
  relationTypes: ['imports'],
})
assert.equal(trace.status, 'ready')
assert.ok(trace.partIds.includes(relation.source))
assert.ok(trace.partIds.includes(relation.target))
assert.ok(trace.edgeIds.includes(relation.id))
assert.equal(trace.depthByPartId[relation.source], 0)
assert.equal(trace.depthByPartId[relation.target], 1)

const focusedFunctionId = 'function:shared/sourceTwin.js:sourceTwinEntities'
const focused = createSourceCodeWorldProjection(SOURCE_TWIN_MANIFEST, {
  selectedId: focusedFunctionId,
})
assert.ok(focused.parts.some((part) => part.id === focusedFunctionId))
assert.ok(focused.parts.some((part) => part.id === sourceTwinPartId))
assert.ok(focused.edges.some((edge) => (
  edge.type === 'contains'
  && edge.source === sourceTwinPartId
  && edge.target === focusedFunctionId
)))

const balanced = createSourceCodeWorldProjection(SOURCE_TWIN_MANIFEST, { lod: 'balanced' })
assert.ok(balanced.parts.some((part) => part.entityKind === 'function'))
assert.ok(balanced.parts.length > overview.parts.length)
assert.ok(balanced.parts.length <= SOURCE_CODE_WORLD_LODS.balanced.maxParts)
assert.ok(balanced.edges.length <= SOURCE_CODE_WORLD_LODS.balanced.maxEdges)

const constrained = createSourceCodeWorldProjection(SOURCE_TWIN_MANIFEST, {
  lod: 'detail',
  limits: {
    maxAreas: 3,
    maxSubsystems: 4,
    maxComponents: 5,
    maxParts: 20,
    maxEdges: 12,
  },
})
assert.ok(constrained.districts.length <= 3)
assert.ok(constrained.groups.subsystems.length <= 4)
assert.ok(constrained.groups.components.length <= 5)
assert.ok(constrained.parts.length <= 20)
assert.ok(constrained.edges.length <= 12)
assert.equal(constrained.truncation.active, true)

const noMatch = createSourceCodeWorldProjection(SOURCE_TWIN_MANIFEST, {
  query: 'this-query-cannot-match-any-source-entity-7f9b27',
})
assert.equal(noMatch.status, 'empty')
assert.equal(noMatch.emptyState.code, 'source-entities-no-match')
assert.deepEqual(noMatch.parts, [])
assert.deepEqual(noMatch.edges, [])
assert.deepEqual(noMatch.districts, [])

const missing = createSourceCodeWorldProjection(null)
assert.equal(missing.status, 'empty')
assert.equal(missing.emptyState.code, 'source-manifest-unavailable')
assert.equal(missing.repository.linked, false)

const empty = createSourceCodeWorldProjection({
  id: 'empty-source-lens-result',
  source: { id: 'empty-repository', label: '빈 저장소' },
  entities: [],
  relations: [],
})
assert.equal(empty.status, 'empty')
assert.equal(empty.emptyState.code, 'source-entities-empty')
assert.equal(empty.counts.sourceEntities, 0)
assert.deepEqual(empty.groups, { subsystems: [], components: [] })

assert.equal(sourceCodeWorldSelection(overview, '__missing__').status, 'not-found')
assert.equal(traceSourceCodeWorld(overview, '__missing__').status, 'not-found')

console.log(
  `Source Code World projection checks passed `
  + `(${overview.parts.length} overview parts, ${overview.edges.length} manifest edges).`,
)
