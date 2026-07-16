import assert from 'node:assert/strict'

import {
  annotationDataForSystemLayer,
  createSystemLayerProjection,
  createSystemLayerViews,
  deriveDefaultSystemLayer,
  effectiveSystemLayerForNode,
  ensureSystemLayerViews,
  normalizeNodePresentation,
  SYSTEM_LAYER_DEFINITIONS,
  withSystemLayerOverride,
} from '../shared/systemLayers.js'
import { SYSTEM_KIND_DEFS } from '../shared/systemOntology.js'

const expectedKinds = {
  actor: 'L1',
  engine: 'L2',
  frontend: 'L2',
  service: 'L2',
  api: 'L2',
  function: 'L2',
  auth: 'L2',
  queue: 'L2',
  mcp: 'L2',
  database: 'L3',
  table: 'L3',
  storage: 'L3',
  policy: 'L3',
  deployment: 'L4',
  external: 'L4',
  credential: 'L4',
}

assert.equal(SYSTEM_LAYER_DEFINITIONS.length, 4)
assert.deepEqual(Object.keys(expectedKinds).sort(), SYSTEM_KIND_DEFS.map((item) => item.id).sort())
for (const [systemKind, layer] of Object.entries(expectedKinds)) {
  assert.equal(deriveDefaultSystemLayer({ systemKind }), layer, `${systemKind} 기본 층`)
}
assert.equal(deriveDefaultSystemLayer({ systemKind: 'unknown', trustZone: { kind: 'local-device' } }), 'L4')
assert.equal(deriveDefaultSystemLayer({ systemKind: 'database', trustZone: { kind: 'public-cloud' } }), 'L3')
assert.equal(deriveDefaultSystemLayer({ systemKind: 'unknown', trustZone: { kind: 'unknown' } }), null)
assert.equal(deriveDefaultSystemLayer({}), null)

const actor = { id: 'actor', type: 'system', data: { systemKind: 'actor' } }
assert.equal(effectiveSystemLayerForNode(actor), 'L1')
assert.equal(effectiveSystemLayerForNode({ ...actor, data: withSystemLayerOverride(actor.data, 'L3') }), 'L3')
assert.deepEqual(normalizeNodePresentation({ layerOverride: 'L2', ignored: 'drop' }), { layerOverride: 'L2' })
assert.equal(normalizeNodePresentation({ layerOverride: 'L9' }), null)
assert.deepEqual(annotationDataForSystemLayer({ header: '메모' }, 'L4'), {
  header: '메모', presentation: { layerOverride: 'L4' },
})
assert.deepEqual(annotationDataForSystemLayer({
  header: '메모', presentation: { layerOverride: 'L2' },
}, 'L4'), {
  header: '메모', presentation: { layerOverride: 'L2' },
}, '노트를 다른 층에서 캔버스로 올려도 생성 시점의 층을 보존해야 합니다.')

const layerViews = createSystemLayerViews()
assert.deepEqual(layerViews.map((view) => view.systemLayer), ['L1', 'L2', 'L3', 'L4'])
const userView = { id: 'user-view', name: '사용자 뷰', bounds: { x: 0, y: 0, width: 10, height: 10 } }
const ensured = ensureSystemLayerViews([userView])
assert.equal(ensured[0], userView)
assert.equal(ensured.length, 5)
assert.equal(ensureSystemLayerViews(ensured), ensured, '이미 완성된 층 뷰는 같은 배열을 보존해야 합니다.')

const graphNodes = [
  { id: 'group', type: 'group', position: { x: 0, y: 0 }, data: { label: '기존 공간 그룹' } },
  { id: 'experience', type: 'system', parentId: 'group', data: { label: '사용자', systemKind: 'actor' } },
  { id: 'app', type: 'system', parentId: 'group', data: { label: '앱', systemKind: 'frontend' } },
  { id: 'hidden-app', type: 'system', data: { redacted: true } },
  { id: 'note', type: 'memo', data: { header: '과거 미분류 메모' } },
]
const graphEdges = [
  { id: 'visible-crossing', source: 'experience', target: 'app', data: { relationType: 'uses' } },
  { id: 'hidden-crossing', source: 'experience', target: 'hidden-app', redacted: true },
  { id: 'defense-in-depth', source: 'experience', target: 'hidden-app', data: { relationType: 'calls' } },
]

const unrestricted = createSystemLayerProjection(
  graphNodes.map((node) => node.id === 'hidden-app'
    ? { ...node, data: { label: '숨은 앱', systemKind: 'frontend' } }
    : node),
  graphEdges.map((edge) => ({ ...edge, redacted: false })),
  'L1',
)
assert.equal(unrestricted.portalsByNode.get('experience')[0].count, 2)

const restricted = createSystemLayerProjection(graphNodes, graphEdges, 'L1')
assert.deepEqual([...restricted.visibleNodeIds].sort(), ['experience', 'group', 'note'])
assert.deepEqual([...restricted.visibleEdgeIds], [])
assert.equal(restricted.portalsByNode.get('experience')[0].count, 1)
assert.deepEqual(restricted.portalsByNode.get('experience')[0].targets.map((target) => target.nodeId), ['app'])
assert.equal(JSON.stringify([...restricted.portalsByNode.values()]).includes('hidden-app'), false)

const layerTwo = createSystemLayerProjection(graphNodes, graphEdges, 'L2')
assert.equal(layerTwo.visibleNodeIds.has('app'), true)
assert.equal(layerTwo.visibleNodeIds.has('group'), true, '보이는 자식의 기존 공간 그룹은 문맥으로 남아야 합니다.')
assert.equal(layerTwo.portalsByNode.get('app')[0].targetLayer, 'L1')

console.log('System layer derivation, saved views and redaction-safe portal checks passed')
