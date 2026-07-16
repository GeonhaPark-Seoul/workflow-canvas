import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import { absoluteNodePosition } from '../src/lib/canvasGeometry.js'
import {
  findNonOverlappingAbsolutePosition,
  findGroupAtPoint,
  findGroupDropTarget,
  nodeDimensions,
  positionInsideGroup,
  reparentNodePreservingPosition,
} from '../src/lib/groupMembership.js'

const groupA = { id: 'group-a', type: 'group', position: { x: 100, y: 100 }, width: 400, height: 300 }
const groupB = { id: 'group-b', type: 'group', position: { x: 250, y: 180 }, width: 200, height: 160 }
const topLevelNode = { id: 'node-a', type: 'stage', position: { x: 420, y: 180 }, width: 200, height: 80 }
const nodes = [groupA, groupB, topLevelNode]

assert.equal(findGroupAtPoint(nodes, { x: 300, y: 220 })?.id, 'group-b', '겹친 그룹에서는 더 작은 프레임을 선택해야 합니다.')
assert.equal(findGroupAtPoint(nodes, { x: 300, y: 220 }, { allowedGroupIds: ['group-a'] })?.id, 'group-a')
assert.equal(findGroupAtPoint(nodes, { x: 20, y: 20 }), null)

assert.equal(findGroupDropTarget(nodes, 'node-a')?.id, 'group-a', '노드 면적의 35% 이상이 겹치면 그룹에 포함해야 합니다.')
assert.equal(findGroupDropTarget(nodes, 'node-a', { overlapThreshold: 0.5 }), null)

const grouped = reparentNodePreservingPosition(nodes, 'node-a', 'group-a')
const groupedById = new Map(grouped.map((node) => [node.id, node]))
assert.equal(groupedById.get('node-a').parentId, 'group-a')
assert.deepEqual(absoluteNodePosition(groupedById.get('node-a'), groupedById), { x: 420, y: 180 })

const ungrouped = reparentNodePreservingPosition(grouped, 'node-a', null)
const ungroupedById = new Map(ungrouped.map((node) => [node.id, node]))
assert.equal(ungroupedById.get('node-a').parentId, undefined)
assert.deepEqual(ungroupedById.get('node-a').position, { x: 420, y: 180 })

assert.deepEqual(
  positionInsideGroup(nodes, 'group-a', { x: 490, y: 390 }, { width: 200, height: 80 }),
  { x: 188, y: 208 },
  '그룹 안에서 생성한 노드는 프레임 밖으로 넘치지 않아야 합니다.',
)

assert.equal(findGroupDropTarget(nodes, 'group-a'), null, '그룹 프레임 자체를 다른 그룹의 자식으로 만들지 않습니다.')
assert.deepEqual(nodeDimensions({ type: 'intent' }), { width: 220, height: 120 })

const placementNodes = [
  { id: 'work', type: 'system', position: { x: 100, y: 100 }, width: 240, height: 130 },
  { id: 'intent-1', type: 'intent', position: { x: 376, y: 100 }, width: 240, height: 140 },
]
assert.deepEqual(
  findNonOverlappingAbsolutePosition(placementNodes, { x: 376, y: 100 }, { width: 240, height: 140 }),
  { x: 376, y: 264 },
  '같은 Work에서 만든 다음 Intent는 먼저 만든 Intent 아래의 빈자리를 사용해야 합니다.',
)

const engineNode = {
  id: 'engine-a', type: 'system', position: { x: 150, y: 150 }, width: 240, height: 130,
  data: { logicalComponent: { kind: 'engine' } },
}
const withEngine = [...nodes.slice(0, 2), engineNode]
assert.equal(findGroupDropTarget(withEngine, 'engine-a')?.id, 'group-a', '엔진 노드도 일반 시스템 노드처럼 그룹에 포함할 수 있어야 합니다.')
const groupedEngine = reparentNodePreservingPosition(withEngine, 'engine-a', 'group-a')
assert.equal(groupedEngine.find((node) => node.id === 'engine-a')?.parentId, 'group-a')

const systemNodeSource = await readFile(new URL('../src/nodes/SystemNode.jsx', import.meta.url), 'utf8')
assert.doesNotMatch(
  systemNodeSource,
  /className="logical-component-details nodrag/,
  '엔진 설명 전체가 nodrag이면 그룹 안에서 엔진 노드를 잡아 움직일 수 없습니다.',
)

console.log('Group membership and position-preserving reparent checks passed')
