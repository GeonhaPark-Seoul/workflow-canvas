import assert from 'node:assert/strict'
import { createServer } from 'vite'
import { createSourceCodeWorldProjection } from '../shared/sourceCodeWorldProjection.js'
import { SOURCE_TWIN_MANIFEST } from '../shared/sourceTwinManifest.js'

const server = await createServer({
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
})

try {
  const { buildCodeWorldModel } = await server.ssrLoadModule('/src/components/CodeWorldWorkspace.jsx')
  const projection = createSourceCodeWorldProjection(SOURCE_TWIN_MANIFEST, { lod: 'overview' })
  const changedPart = projection.parts.find((part) => part.entityKind === 'file')
  assert.ok(changedPart, 'fixture needs a visible Source Lens file')

  const localManifest = {
    id: 'local-manifest-test',
    entities: SOURCE_TWIN_MANIFEST.entities.map((entity) => (
      entity.id === changedPart.id
        ? { ...entity, fingerprint: 'f'.repeat(20) }
        : entity
    )).concat({
      id: 'file:local-only.js',
      kind: 'file',
      path: 'local-only.js',
      fingerprint: 'a'.repeat(20),
    }),
  }
  const localState = {
    connectors: [{
      id: 'connector-test',
      label: '테스트 로컬 연결',
      repositoryLabel: 'Workflow Canvas',
      online: true,
      connectionState: 'online',
      lastSeenAt: '2026-07-24T04:00:00.000Z',
      manifest: localManifest,
      git: {
        branch: 'main',
        headSha: 'a'.repeat(40),
        upstreamRef: 'origin/main',
        upstreamSha: 'b'.repeat(40),
        ahead: 1,
        behind: 0,
        dirty: 1,
        changedPaths: [changedPart.path],
        fetchStatus: 'ok',
      },
      sync: {
        action: 'blocked',
        reason: '커밋되지 않은 변경 1개가 있어 자동 동기화를 막았습니다.',
      },
    }],
    operations: [],
  }
  const current = {
    manifest: SOURCE_TWIN_MANIFEST,
    deployment: {
      provider: 'vercel',
      environment: 'production',
      commitSha: 'c'.repeat(40),
    },
    events: {
      available: true,
      events: [{
        delivery_id: 'delivery-test',
        ref: 'refs/heads/main',
        after_sha: 'd'.repeat(40),
        changed_paths: ['src/App.jsx'],
        received_at: '2026-07-24T03:59:00.000Z',
      }],
    },
  }
  const model = buildCodeWorldModel(projection, {
    current,
    currentObservedAt: '2026-07-24T04:00:05.000Z',
    localState,
    localObservedAt: '2026-07-24T04:00:06.000Z',
    canMaterialize: true,
  })

  assert.ok(model.districts.length > 0)
  const visibleScreenParts = model.districts.flatMap((district) => (
    district.components.flatMap((component) => component.parts)
  ))
  const sourceEntityIds = new Set(SOURCE_TWIN_MANIFEST.entities.map((entity) => entity.id))
  assert.ok(visibleScreenParts.length > 0)
  assert.equal(visibleScreenParts.every((part) => sourceEntityIds.has(part.id)), true)
  assert.equal(visibleScreenParts.some((part) => part.id === 'file:local-only.js'), false)

  const changedScreenPart = visibleScreenParts.find((part) => part.id === changedPart.id)
  assert.equal(changedScreenPart.status, 'pending')
  assert.equal(changedScreenPart.editable, true)

  assert.equal(model.delivery.stages.length, 4)
  assert.match(model.delivery.description, /실행 중인 Job이 아니라/)
  assert.equal(model.systems.length, 1)
  assert.equal(model.systems[0].kind, 'remote-repository')
  assert.equal(model.systems[0].status, 'observed')

  const projectedRelationIds = new Set(projection.edges.map((edge) => edge.id))
  assert.equal(
    projection.edges.every((edge) => model.relations.some((relation) => relation.id === edge.id)),
    true,
  )
  assert.equal(
    model.relations.filter((relation) => !projectedRelationIds.has(relation.id)).length,
    model.delivery.stages.length,
  )

  const observationIds = new Set(model.observations.map((observation) => observation.id))
  assert.equal(observationIds.has('observation:source-manifest'), true)
  assert.equal(observationIds.has('observation:local:connector-test'), true)
  assert.equal(observationIds.has('observation:local-deployed-difference'), true)
  assert.equal(observationIds.has('observation:git-position'), true)
  assert.equal(observationIds.has('delivery-test'), true)

  const emptyProjection = createSourceCodeWorldProjection(null)
  const emptyModel = buildCodeWorldModel(emptyProjection)
  assert.deepEqual(emptyModel.districts, [])
  assert.equal(
    emptyModel.observations.some((observation) => observation.id === 'observation:source-manifest-missing'),
    true,
  )

  console.log('source code world workspace tests passed')
} finally {
  await server.close()
}
