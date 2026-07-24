import assert from 'node:assert/strict'

import {
  annotationDataForSystemLayer,
  canvasSupportsSystemLayers,
  createCustomSystemLayerView,
  createSystemLayerProjection,
  effectiveSystemLayerForNode,
  normalizeNodePresentation,
  normalizeSystemLayerId,
  pruneLegacyOfficialSystemLayerViews,
  removeSystemLayerFromNodes,
  systemLayerOptionsFromViews,
  withSystemLayerOverride,
} from '../shared/systemLayers.js'

const FIRST_LAYER_ID = 'uwork'
const SECOND_LAYER_ID = 'ucode'
const firstLayerView = {
  id: `view:system-layer:custom:${FIRST_LAYER_ID}`,
  name: '업무 흐름',
  viewKind: 'system-layer',
  systemLayer: FIRST_LAYER_ID,
}
const secondLayerView = {
  id: `view:system-layer:custom:${SECOND_LAYER_ID}`,
  name: '코드 흐름',
  viewKind: 'system-layer',
  systemLayer: SECOND_LAYER_ID,
}

assert.equal(normalizeSystemLayerId('L1'), null, '폐기된 공식 층 id를 다시 활성화하면 안 됩니다.')
assert.equal(normalizeSystemLayerId(FIRST_LAYER_ID), FIRST_LAYER_ID)
assert.equal(normalizeSystemLayerId('u123'), null)

const unassignedActor = {
  id: 'actor',
  type: 'system',
  data: { systemKind: 'actor', trustZone: { kind: 'public-cloud' } },
}
assert.equal(effectiveSystemLayerForNode(unassignedActor), null,
  '노드 종류나 신뢰영역으로 층을 자동 배정하면 안 됩니다.')
assert.equal(
  effectiveSystemLayerForNode({
    ...unassignedActor,
    data: withSystemLayerOverride(unassignedActor.data, FIRST_LAYER_ID),
  }),
  FIRST_LAYER_ID,
)
assert.deepEqual(
  normalizeNodePresentation({ layerOverride: FIRST_LAYER_ID, ignored: 'drop' }),
  { layerOverride: FIRST_LAYER_ID },
)
assert.equal(normalizeNodePresentation({ layerOverride: 'L2' }), null)
assert.deepEqual(annotationDataForSystemLayer({ header: '메모' }, FIRST_LAYER_ID), {
  header: '메모', presentation: { layerOverride: FIRST_LAYER_ID },
})
assert.deepEqual(annotationDataForSystemLayer({
  header: '메모', presentation: { layerOverride: SECOND_LAYER_ID },
}, FIRST_LAYER_ID), {
  header: '메모', presentation: { layerOverride: SECOND_LAYER_ID },
}, '노트를 다른 층에서 캔버스로 올려도 생성 시점의 층을 보존해야 합니다.')

const userView = { id: 'user-view', name: '사용자 뷰', bounds: { x: 0, y: 0, width: 10, height: 10 } }
const legacyViews = [
  userView,
  { id: 'view:system-layer:L1', name: 'L1 경험 층', viewKind: 'system-layer', systemLayer: 'L1' },
  firstLayerView,
  { id: 'view:system-layer:L4', name: 'L4 인프라 층', viewKind: 'system-layer', systemLayer: 'L4' },
]
const prunedViews = pruneLegacyOfficialSystemLayerViews(legacyViews)
assert.deepEqual(prunedViews, [userView, firstLayerView])
assert.equal(pruneLegacyOfficialSystemLayerViews(prunedViews), prunedViews,
  '정리할 뷰가 없으면 React 상태 안정성을 위해 같은 배열을 반환해야 합니다.')

const graphNodes = [
  { id: 'group', type: 'group', position: { x: 0, y: 0 }, data: { label: '기존 공간 그룹' } },
  {
    id: 'experience',
    type: 'system',
    parentId: 'group',
    data: withSystemLayerOverride({ label: '사용자', systemKind: 'actor' }, FIRST_LAYER_ID),
  },
  {
    id: 'app',
    type: 'system',
    parentId: 'group',
    data: withSystemLayerOverride({ label: '앱', systemKind: 'frontend' }, SECOND_LAYER_ID),
  },
  {
    id: 'hidden-app',
    type: 'system',
    data: { ...withSystemLayerOverride({ label: '숨은 앱' }, SECOND_LAYER_ID), redacted: true },
  },
  { id: 'note', type: 'memo', data: { header: '과거 미분류 메모' } },
]
const graphEdges = [
  { id: 'visible-crossing', source: 'experience', target: 'app', data: { relationType: 'uses' } },
  { id: 'hidden-crossing', source: 'experience', target: 'hidden-app', redacted: true },
  { id: 'defense-in-depth', source: 'experience', target: 'hidden-app', data: { relationType: 'calls' } },
]

const unrestricted = createSystemLayerProjection(
  graphNodes.map((node) => node.id === 'hidden-app'
    ? { ...node, data: withSystemLayerOverride({ label: '숨은 앱' }, SECOND_LAYER_ID) }
    : node),
  graphEdges.map((edge) => ({ ...edge, redacted: false })),
  FIRST_LAYER_ID,
)
assert.equal(unrestricted.portalsByNode.get('experience')[0].count, 2)

const layerOptions = systemLayerOptionsFromViews([firstLayerView, secondLayerView])
const layerMeta = new Map(layerOptions.map((option) => [option.id, option]))
const restricted = createSystemLayerProjection(graphNodes, graphEdges, FIRST_LAYER_ID, layerMeta)
assert.deepEqual([...restricted.visibleNodeIds].sort(), ['experience', 'group', 'note'])
assert.deepEqual([...restricted.visibleEdgeIds], [])
assert.equal(restricted.portalsByNode.get('experience')[0].count, 1)
assert.deepEqual(restricted.portalsByNode.get('experience')[0].targets.map((target) => target.nodeId), ['app'])
assert.equal(JSON.stringify([...restricted.portalsByNode.values()]).includes('hidden-app'), false)

const layerTwo = createSystemLayerProjection(graphNodes, graphEdges, SECOND_LAYER_ID, layerMeta)
assert.equal(layerTwo.visibleNodeIds.has('app'), true)
assert.equal(layerTwo.visibleNodeIds.has('group'), true, '보이는 자식의 기존 공간 그룹은 문맥으로 남아야 합니다.')
assert.equal(layerTwo.portalsByNode.get('app')[0].targetLayer, FIRST_LAYER_ID)

// Stable self-map group ids remain compatible layout data, but no longer imply
// or backfill a built-in layer contract.
const legacyMapNodes = [
  { id: 'map-group-experience', type: 'group', data: {} },
  { id: 'map-group-runtime', type: 'group', data: {} },
  { id: 'map-web-app', type: 'system', parentId: 'map-group-experience', data: { systemKind: 'frontend' } },
]
assert.equal(canvasSupportsSystemLayers(legacyMapNodes, []), false)
assert.equal(canvasSupportsSystemLayers(legacyMapNodes, [firstLayerView]), true)

const customView = createCustomSystemLayerView('  업무 흐름  ')
assert.equal(customView.name, '업무 흐름')
assert.equal(customView.viewKind, 'system-layer')
assert.ok(customView.id.includes(':custom:'))
const customId = customView.systemLayer
assert.equal(normalizeSystemLayerId(customId), customId, '커스텀 층 id는 유효한 층으로 인식되어야 합니다.')
assert.equal(createCustomSystemLayerView('   '), null, '빈 이름은 층을 만들지 않습니다.')

assert.deepEqual(layerOptions.map((option) => option.id), [FIRST_LAYER_ID, SECOND_LAYER_ID])
assert.deepEqual(layerOptions.map((option) => option.order), [1, 2])
assert.equal(layerOptions[0].label, '업무 흐름')
assert.equal(
  systemLayerOptionsFromViews([secondLayerView, firstLayerView])[1].color,
  layerOptions[0].color,
  '레이어 색은 목록 위치가 바뀌어도 안정적이어야 합니다.',
)

// Assigning a node to a custom layer, then a projection on that layer.
const nodeOnCustom = { id: 'cn', type: 'system', data: withSystemLayerOverride({ systemKind: 'frontend' }, customId) }
assert.equal(effectiveSystemLayerForNode(nodeOnCustom), customId)
const customProjection = createSystemLayerProjection([nodeOnCustom], [], customId,
  new Map(systemLayerOptionsFromViews([customView]).map((option) => [option.id, option])))
assert.equal(customProjection.visibleNodeIds.has('cn'), true)

// Deleting a layer clears its override instead of assigning a hidden default.
const cleared = removeSystemLayerFromNodes([nodeOnCustom], customId)
assert.equal(effectiveSystemLayerForNode(cleared[0]), null)

console.log('User-defined layer views, legacy pruning and redaction-safe portal checks passed')
