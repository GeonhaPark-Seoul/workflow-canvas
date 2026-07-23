import assert from 'node:assert/strict'

import {
  WORKSHOP_ASSIGNEE_KINDS,
  WORKSHOP_STAGE_CONTRACTS,
  WORKSHOP_STAGES,
  WorkshopContractError,
  assertWorkshopExternalRefSafe,
  buildWorkshopContextPack,
  buildWorkshopTaskForest,
  designateWorkshopControlNode,
  nextWorkshopStage,
  normalizeWorkshopArtifactInput,
  normalizeWorkshopGoalInput,
  workshopContainsSecretValue,
  workshopGateReadiness,
} from '../shared/workshop.js'
import {
  WORKSHOP_DISPLAY_NAMES,
  WORKSHOP_STAGE_DISPLAY_NAMES,
} from '../shared/uiConstants.js'

assert.deepEqual(WORKSHOP_STAGES, ['backlog', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'])
assert.deepEqual(WORKSHOP_ASSIGNEE_KINDS, ['manual', 'yescode', 'nocode'])
assert.equal(WORKSHOP_STAGE_CONTRACTS.length, 9)
assert.deepEqual(WORKSHOP_STAGE_CONTRACTS.map((item) => item.position), [0, 1, 2, 3, 4, 5, 6, 7, 8])
assert.deepEqual(WORKSHOP_STAGE_CONTRACTS.find((item) => item.stage === 'B').recommendedArtifactKinds, [
  'patch',
  'base-commit',
  'sha256',
  'verification',
])
assert.equal(nextWorkshopStage('backlog'), 'A')
assert.equal(nextWorkshopStage('H'), null)
assert.deepEqual(Object.keys(WORKSHOP_DISPLAY_NAMES).sort(), [
  'artifact',
  'backlog',
  'board',
  'control-node',
  'gate',
  'goal',
  'task',
  'thread',
])
assert.deepEqual(Object.keys(WORKSHOP_STAGE_DISPLAY_NAMES), WORKSHOP_STAGES)

const designatedNodes = designateWorkshopControlNode([
  { id: 'system-old', type: 'system', data: { label: 'old', workshopRole: 'control-node' } },
  { id: 'system-new', type: 'system', data: { label: 'new' } },
  { id: 'memo', type: 'memo', data: { workshopRole: 'control-node' } },
], 'system-new')
assert.equal(designatedNodes[0].data.workshopRole, undefined)
assert.equal(designatedNodes[1].data.workshopRole, 'control-node')
assert.equal(designatedNodes[2].data.workshopRole, 'control-node', 'non-system node data remains untouched')
assert.equal(
  designatedNodes.filter((node) => node.type === 'system' && node.data?.workshopRole === 'control-node').length,
  1,
)
assert.throws(
  () => designateWorkshopControlNode(designatedNodes, 'memo'),
  (error) => error instanceof WorkshopContractError && error.code === 'INVALID_CONTROL_NODE',
)

const goal = normalizeWorkshopGoalInput({
  canvasOwnerId: '00000000-0000-4000-8000-000000000001',
  canvasId: 'main',
  title: '작업장 기록 슬라이스',
  reason: '현재 협업 흐름을 먼저 기록한다.',
  terminalStage: 'B',
})
assert.equal(goal.terminalStage, 'B')
assert.throws(
  () => normalizeWorkshopGoalInput({ ...goal, terminalStage: 'backlog' }),
  (error) => error instanceof WorkshopContractError && error.code === 'INVALID_TERMINAL_STAGE',
)

const secretSamples = [
  `Bearer ${'a'.repeat(32)}`,
  `Basic ${'b'.repeat(32)}`,
  `token=${'c'.repeat(32)}`,
  `sk-${'d'.repeat(32)}`,
  `eyJ${'e'.repeat(24)}.${'f'.repeat(16)}.${'g'.repeat(16)}`,
  '-----BEGIN PRIVATE KEY-----',
]
for (const sample of secretSamples) {
  assert.equal(workshopContainsSecretValue(sample), true, `secret must be rejected: ${sample.slice(0, 20)}`)
}
assert.equal(workshopContainsSecretValue('SUPABASE_SERVICE_ROLE_KEY'), false, 'credential names remain valid references')
assert.equal(workshopContainsSecretValue('commit 0123456789abcdef0123456789abcdef01234567'), false)

for (const reference of [
  'docs/architecture/WORKSHOP_BLUEPRINT.md',
  '0123456789abcdef0123456789abcdef01234567',
  'https://example.com/releases/42',
  'https://example.com/My%20File',
  '/absolute/path/name-only.txt',
  'C:\\project\\artifact.patch',
]) {
  assert.equal(assertWorkshopExternalRefSafe(reference), reference)
}
for (const reference of [
  `https://example.com/download?sig=${'a'.repeat(32)}`,
  `https://example.com/download?X-Goog-Signature=${'b'.repeat(32)}`,
  `https://example.com/download?%73ig=${'b'.repeat(32)}`,
  `https://example.com/oauth?code=${'c'.repeat(32)}`,
  `https://example.com/#sig=${'d'.repeat(32)}`,
  `https://example.com/#%73ig=${'d'.repeat(32)}`,
  `https://example.com/%2577ebhooks/${'d'.repeat(32)}`,
  `https://user:${'e'.repeat(24)}@example.com/file`,
  'javascript:alert(1)',
  'data:text/plain,secret',
  'file:///private/tmp/report.txt',
  `https://hooks.slack.com/services/T000/B000/${'f'.repeat(32)}`,
  `https://discord.com/api/webhooks/123/${'g'.repeat(32)}`,
  `https://api.telegram.org/bot${'h'.repeat(32)}/sendMessage`,
  `https://example.com/webhooks/${'i'.repeat(32)}`,
]) {
  assert.throws(
    () => assertWorkshopExternalRefSafe(reference),
    (error) => error instanceof WorkshopContractError
      && ['SECRET_VALUE_BLOCKED', 'UNSAFE_EXTERNAL_REF'].includes(error.code),
    `sensitive external ref must be rejected: ${reference}`,
  )
}

const artifact = normalizeWorkshopArtifactInput({
  goalId: '00000000-0000-4000-8000-000000000010',
  stage: 'B',
  kind: 'patch',
  title: '구현 patch',
  externalRef: 'commits/0123456789abcdef',
})
assert.equal(artifact.externalRef, 'commits/0123456789abcdef')
assert.throws(
  () => normalizeWorkshopArtifactInput({
    ...artifact,
    body: `Authorization: Bearer ${'z'.repeat(40)}`,
  }),
  (error) => error.code === 'SECRET_VALUE_BLOCKED',
)
assert.throws(
  () => normalizeWorkshopArtifactInput({
    ...artifact,
    externalRef: `https://example.com/#token=${'z'.repeat(40)}`,
  }),
  (error) => error.code === 'SECRET_VALUE_BLOCKED',
)

const tasks = [
  {
    id: 'root',
    goalId: 'goal-1',
    title: 'root',
    createdAt: '2026-07-20T00:00:00Z',
  },
  {
    id: 'child',
    goalId: 'goal-1',
    parentTaskId: 'root',
    title: 'child',
    createdAt: '2026-07-20T00:01:00Z',
  },
  {
    id: 'spawn',
    goalId: 'goal-1',
    parentTaskId: 'root',
    spawnedFromTaskId: 'child',
    title: 'spawn',
    createdAt: '2026-07-20T00:02:00Z',
  },
]
const forest = buildWorkshopTaskForest(tasks, { goalId: 'goal-1' })
assert.equal(forest.length, 1)
assert.deepEqual(forest[0].children.map((item) => item.id), ['child', 'spawn'])
assert.deepEqual(forest[0].children[0].spawnedChildIds, ['spawn'])
assert.throws(
  () => buildWorkshopTaskForest([
    { id: 'one', goalId: 'goal-1', parentTaskId: 'two' },
    { id: 'two', goalId: 'goal-1', parentTaskId: 'one' },
  ]),
  (error) => error.code === 'TASK_PARENT_CYCLE',
)
assert.throws(
  () => buildWorkshopTaskForest([
    { id: 'one', goalId: 'goal-1' },
    { id: 'two', goalId: 'goal-2', spawnedFromTaskId: 'one' },
  ]),
  (error) => error.code === 'SPAWN_TASK_MISSING',
)

const missingGate = workshopGateReadiness({
  goal: { title: '구현', reason: '검증', stage: 'B' },
  artifacts: [{ stage: 'B', kind: 'patch' }],
})
assert.equal(missingGate.forcedRequired, true)
assert.deepEqual(missingGate.missingArtifactKinds, ['base-commit', 'sha256', 'verification'])
const readyGate = workshopGateReadiness({
  goal: { title: '구현', reason: '검증', stage: 'B' },
  artifacts: ['patch', 'base-commit', 'sha256', 'verification'].map((kind) => ({ stage: 'B', kind })),
})
assert.equal(readyGate.forcedRequired, false)

const contextPack = buildWorkshopContextPack({
  goal: { title: '작업장 MVP', reason: '기록 구조 검증', stage: 'A' },
  artifacts: [{ kind: 'design-brief', title: '설계의뢰서', externalRef: 'Codex/brief.md' }],
  messages: [{ authorLabel: 'Codex', body: '구현 범위를 확인했습니다.' }],
})
assert.match(contextPack, /작업장 MVP/)
assert.match(contextPack, /design-brief/)
assert.match(contextPack, /Codex/)
const boundedContextPack = buildWorkshopContextPack({
  goal: {
    title: '큰 기록 묶음',
    reason: '유효한 긴 참조가 있어도 컨텍스트 팩은 예산 안에서 결정적으로 줄어들어야 한다. '.repeat(80),
    stage: 'B',
  },
  artifacts: Array.from({ length: 12 }, (_, index) => ({
    kind: 'verification',
    title: `검증 ${index + 1}`,
    externalRef: `https://example.com/builds/${index + 1}/${'a'.repeat(1850)}`,
  })),
  messages: Array.from({ length: 8 }, (_, index) => ({
    authorLabel: `agent-${index + 1}`,
    body: `결과 ${index + 1} `.repeat(300),
  })),
})
assert.ok(boundedContextPack.length <= 12000)
assert.match(boundedContextPack, /생략|잘림/)
assert.equal(
  boundedContextPack,
  buildWorkshopContextPack({
    goal: {
      title: '큰 기록 묶음',
      reason: '유효한 긴 참조가 있어도 컨텍스트 팩은 예산 안에서 결정적으로 줄어들어야 한다. '.repeat(80),
      stage: 'B',
    },
    artifacts: Array.from({ length: 12 }, (_, index) => ({
      kind: 'verification',
      title: `검증 ${index + 1}`,
      externalRef: `https://example.com/builds/${index + 1}/${'a'.repeat(1850)}`,
    })),
    messages: Array.from({ length: 8 }, (_, index) => ({
      authorLabel: `agent-${index + 1}`,
      body: `결과 ${index + 1} `.repeat(300),
    })),
  }),
)
assert.throws(
  () => buildWorkshopContextPack({
    goal: { title: 'unsafe', reason: `Bearer ${'q'.repeat(32)}`, stage: 'A' },
  }),
  (error) => error.code === 'SECRET_VALUE_BLOCKED',
)

console.log('Workshop domain, tree, gate, context-pack, and secret-boundary checks passed')
