import assert from 'node:assert/strict'

import { normalizeEdgeRelationData } from '../shared/relationOntology.js'
import {
  createSecurityOverlayProjection,
  securityOverlayHasModeledData,
} from '../shared/securityOverlay.js'
import { normalizeSystemNodeData } from '../shared/systemOntology.js'
import { normalizeTrustGateway, normalizeTrustZone } from '../shared/trustTopology.js'

const localZone = {
  id: 'zone:test-local',
  kind: 'local-device',
  label: '테스트 로컬 기기',
  controlOwner: '테스트 사용자',
  evidenceRef: 'fixture:local',
}
const cloudZone = {
  id: 'zone:test-cloud',
  kind: 'public-cloud',
  label: '테스트 공개 클라우드',
  controlOwner: '테스트 운영자',
  evidenceRef: 'fixture:cloud',
}
const gateway = {
  id: 'gateway:test-browser-api',
  kind: 'browser-api',
  sourceZoneId: localZone.id,
  targetZoneId: cloudZone.id,
  direction: 'source-to-target',
  exposure: 'public',
  protocol: 'HTTPS JSON',
  route: '/api/test',
  dataClasses: ['data:test-metadata'],
  authentication: '사용자 세션 참조',
  authorization: '서버 범위 검사',
  encryption: '전송 구간 TLS',
  initiator: '테스트 웹 앱',
  evidenceRef: 'fixture:gateway',
}

const nodes = [
  { id: 'local', type: 'system', position: { x: 0, y: 0 }, data: { label: '로컬 앱', trustZone: localZone } },
  { id: 'cloud', type: 'system', position: { x: 200, y: 0 }, data: { label: '클라우드 API', trustZone: cloudZone } },
]
const modeledEdge = {
  id: 'modeled',
  source: 'local',
  target: 'cloud',
  data: { trustGateway: gateway },
}

const modeled = createSecurityOverlayProjection(nodes, [modeledEdge])
assert.equal(modeled.nodeById.size, 2)
assert.equal(modeled.edgeById.get('modeled').status, 'through-gateway')
assert.equal(modeled.edgeById.get('modeled').gateway.route, '/api/test')
assert.equal(securityOverlayHasModeledData(nodes, [modeledEdge]), true)

const gap = createSecurityOverlayProjection(nodes, [{ id: 'gap', source: 'local', target: 'cloud', data: {} }])
assert.equal(gap.edgeById.get('gap').status, 'unknown-gap')
assert.equal(gap.edgeById.get('gap').warning, true)

const sameZone = createSecurityOverlayProjection([
  ...nodes,
  { id: 'local-2', type: 'system', position: { x: 400, y: 0 }, data: { label: '로컬 캐시', trustZone: localZone } },
], [{ id: 'inside', source: 'local', target: 'local-2', data: {} }])
assert.equal(sameZone.edgeById.has('inside'), false)

const redactedNodes = [
  nodes[0],
  {
    id: 'hidden-cloud',
    type: 'system',
    position: { x: 200, y: 0 },
    data: {
      redacted: true,
      label: '숨겨진 서비스 이름',
      trustZone: { ...cloudZone, id: 'zone:hidden-cloud', label: '숨겨진 신뢰영역' },
    },
  },
]
const redactedProjection = createSecurityOverlayProjection(redactedNodes, [{
  id: 'hidden-edge',
  source: 'local',
  target: 'hidden-cloud',
  redacted: true,
  data: { trustGateway: { ...gateway, id: 'gateway:hidden', targetZoneId: 'zone:hidden-cloud', route: '숨겨진 통로' } },
}])
const exposed = JSON.stringify({
  zones: redactedProjection.zones,
  nodes: [...redactedProjection.nodeById.values()],
  edges: [...redactedProjection.edgeById.values()],
})
assert.equal(redactedProjection.nodeById.size, 1)
assert.equal(redactedProjection.edgeById.size, 0)
assert.doesNotMatch(exposed, /hidden|숨겨진/)
assert.equal(securityOverlayHasModeledData([
  { ...nodes[0], data: { ...nodes[0].data, trustZone: undefined } },
  redactedNodes[1],
], [{
  id: 'orphaned-hidden-edge',
  source: 'local',
  target: 'hidden-cloud',
  data: { trustGateway: { ...gateway, id: 'gateway:orphaned-hidden', targetZoneId: 'zone:hidden-cloud' } },
}]), false)

const layerHidden = createSecurityOverlayProjection([
  nodes[0],
  { ...nodes[1], hidden: true },
], [modeledEdge])
assert.equal(layerHidden.nodeById.size, 1)
assert.equal(layerHidden.edgeById.size, 0)

const unsafeToken = 'ghp_1234567890abcdefghijklmnop'
assert.equal(normalizeTrustZone({ ...localZone, controlOwner: unsafeToken }), null)
assert.equal(normalizeTrustGateway({ ...gateway, route: `/api/test?token=${unsafeToken}` }), null)

const sanitizedNode = normalizeSystemNodeData({
  label: '보안 노드',
  systemKind: 'service',
  trustZone: localZone,
  securityOverlay: { hiddenRuntimeOnly: true },
})
assert.equal(sanitizedNode.trustZone.id, localZone.id)
assert.equal(Object.hasOwn(sanitizedNode, 'securityOverlay'), false)
const sanitizedEdge = normalizeEdgeRelationData({
  relationType: 'calls',
  trustGateway: gateway,
  securityOverlay: { hiddenRuntimeOnly: true },
})
assert.equal(sanitizedEdge.trustGateway.id, gateway.id)
assert.equal(Object.hasOwn(sanitizedEdge, 'securityOverlay'), false)

console.log('Security overlay, trust boundary, redaction, and secret filtering checks passed')
