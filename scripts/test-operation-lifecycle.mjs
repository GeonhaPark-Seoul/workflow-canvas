import assert from 'node:assert/strict'

import {
  acknowledgeOperationCancellation,
  completeOperationExecution,
  completeOperationRecovery,
  completeOperationVerification,
  createOperationPlan,
  createOperationRun,
  failOperationRun,
  normalizeOperationDefinition,
  OperationContractError,
  operationRunIsActive,
  operationRunIsTerminal,
  queueOperationRun,
  recordOperationApproval,
  requestOperationCancellation,
  requestOperationRecovery,
  retryOperationRun,
  startOperationRecovery,
  startOperationRun,
  verifyOperationEventChain,
  verifyOperationPlan,
} from '../shared/operationLifecycle.js'

const definitionInput = {
  id: 'operation:fixture-sync',
  capability: 'fixture.repository.sync',
  label: '픽스처 저장소 동기화',
  description: '범용 조작 생명주기 골든 테스트',
  availability: 'executable',
  access: 'execute',
  approval: 'explicit',
  confirmation: 'SYNC_FIXTURE_REPOSITORY',
  reversible: true,
  risk: 'medium',
  sideEffect: 'external',
  allowedInitiators: ['human_ui', 'deterministic_automation', 'ai_agent'],
  authorizationPolicyIds: ['policy:fixture-sync-approval'],
  target: { kind: 'relation', id: 'relation:fixture-repository' },
  input: {
    schemaRef: 'fixture.repository.sync.v1',
    dataClassIds: ['data-class:git-state'],
  },
  writeSet: [
    { resource: 'fixture_remote_branch', operation: 'sync', maximumItems: 1 },
    { resource: 'operation_events', operation: 'append', maximumItems: 12 },
  ],
  excludes: ['credential-values', 'force-push', 'source-content'],
  execution: {
    adapterId: 'fixture.sync-executor',
    actionId: 'repository.sync',
    location: 'worker',
  },
  timeoutMs: 120000,
  idempotency: {
    mode: 'keyed',
    keyScope: 'target-and-state-fingerprint',
    replay: 'return_existing',
  },
  verification: {
    required: true,
    mode: 'independent',
    adapterId: 'fixture.sync-verifier',
    successCriteria: ['승인한 대상 리비전과 실행 후 리비전이 같습니다.'],
  },
  recovery: {
    mode: 'manual',
    retry: { maxAttempts: 2, backoff: 'fixed' },
    rollbackOperationId: 'operation:fixture-sync-rollback',
    summary: '이전 리비전을 별도 승인으로 복구합니다.',
  },
  evidenceIds: ['evidence:fixture-sync'],
}

const definition = normalizeOperationDefinition(definitionInput)
assert.equal(definition.availability, 'executable')
assert.equal(definition.verification.mode, 'independent')
assert.equal(Object.isFrozen(definition), true)
assert.equal(
  normalizeOperationDefinition(structuredClone(definitionInput)).fingerprint,
  definition.fingerprint,
  '같은 조작 선언은 같은 지문을 만들어야 합니다.',
)

const planNow = new Date('2026-07-15T07:00:00.000Z')
const planRequest = {
  targetKey: 'fixture:repository:main',
  twinRevision: 'twin-build-v2-abcd1234',
  stateFingerprint: 'a'.repeat(64),
  inputFingerprint: 'b'.repeat(64),
  inputSummary: 'main 브랜치를 승인된 원격 리비전과 동기화',
  initiator: { kind: 'human_ui', principalId: 'user-123', channel: 'canvas-edge-control' },
  scope: { direction: 'push', branch: 'main' },
}
const plan = createOperationPlan(definition, planRequest, { now: planNow, nonce: 'fixture-plan-001' })
const repeatedPlan = createOperationPlan(definition, structuredClone(planRequest), { now: planNow, nonce: 'fixture-plan-001' })
assert.equal(plan.fingerprint, repeatedPlan.fingerprint)
assert.equal(plan.approval.required, true)
assert.deepEqual(plan.writeSet, definition.writeSet)
assert.equal(verifyOperationPlan(plan, definition, { now: new Date('2026-07-15T07:01:00.000Z') }), plan)
assert.throws(
  () => verifyOperationPlan(plan, { ...definitionInput, timeoutMs: 90000 }, { now: planNow }),
  (error) => error instanceof OperationContractError && error.code === 'OPERATION_DEFINITION_CHANGED',
)
assert.throws(
  () => verifyOperationPlan(plan, definition, { now: new Date('2026-07-15T07:06:00.000Z') }),
  (error) => error instanceof OperationContractError && error.code === 'OPERATION_PLAN_EXPIRED',
)

let run = createOperationRun(plan, { now: new Date('2026-07-15T07:00:01.000Z') })
assert.equal(run.state, 'awaiting_approval')
assert.equal(run.events.length, 2)
assert.equal(operationRunIsActive(run), false)
assert.throws(
  () => queueOperationRun(run, { actor: { kind: 'control_plane', principalId: 'control-plane' } }),
  (error) => error instanceof OperationContractError && error.code === 'INVALID_OPERATION_TRANSITION',
)
assert.throws(
  () => recordOperationApproval(run, {
    decision: 'approved',
    actor: { kind: 'human', principalId: 'user-123' },
    confirmation: 'WRONG_CONFIRMATION',
  }),
  (error) => error instanceof OperationContractError && error.code === 'OPERATION_CONFIRMATION_REQUIRED',
)
run = recordOperationApproval(run, {
  decision: 'approved',
  actor: { kind: 'human', principalId: 'user-123' },
  confirmation: 'SYNC_FIXTURE_REPOSITORY',
  at: '2026-07-15T07:00:10.000Z',
})
run = queueOperationRun(run, {
  actor: { kind: 'control_plane', principalId: 'control-plane' },
  at: '2026-07-15T07:00:11.000Z',
})
assert.equal(operationRunIsActive(run), true)
run = startOperationRun(run, {
  actor: { kind: 'execution_adapter', principalId: 'fixture.sync-executor' },
  at: '2026-07-15T07:00:12.000Z',
})
run = completeOperationExecution(run, {
  actor: { kind: 'execution_adapter', principalId: 'fixture.sync-executor' },
  at: '2026-07-15T07:00:20.000Z',
  resultFingerprint: 'c'.repeat(64),
  summary: '동기화 명령 완료',
})
assert.equal(run.state, 'verifying')
assert.throws(
  () => completeOperationVerification(run, {
    actor: { kind: 'verifier', principalId: 'fixture.sync-executor' },
    succeeded: true,
    evidenceFingerprint: 'd'.repeat(64),
  }),
  (error) => error instanceof OperationContractError && error.code === 'VERIFIER_NOT_INDEPENDENT',
)
run = completeOperationVerification(run, {
  actor: { kind: 'verifier', principalId: 'fixture.sync-verifier' },
  succeeded: true,
  at: '2026-07-15T07:00:22.000Z',
  evidenceFingerprint: 'd'.repeat(64),
  summary: '원격 리비전과 승인 목표가 일치',
})
assert.equal(run.state, 'succeeded')
assert.equal(operationRunIsTerminal(run), true)
assert.equal(verifyOperationEventChain(run), true)

const tamperedRun = structuredClone(run)
tamperedRun.events[2].detail.reason = 'changed'
assert.throws(
  () => verifyOperationEventChain(tamperedRun),
  (error) => error instanceof OperationContractError && error.code === 'OPERATION_EVENT_CHAIN_TAMPERED',
)

const planFor = (kind, nonce) => createOperationPlan(definition, {
  ...planRequest,
  initiator: {
    kind,
    principalId: kind === 'human_ui' ? 'user-123' : `${kind}-123`,
    channel: `${kind}-test`,
  },
}, { now: planNow, nonce })

for (const kind of ['deterministic_automation', 'ai_agent']) {
  const initiated = createOperationRun(planFor(kind, `fixture-${kind}`), {
    now: new Date('2026-07-15T07:00:01.000Z'),
  })
  assert.equal(initiated.state, 'awaiting_approval')
  assert.throws(
    () => recordOperationApproval(initiated, {
      decision: 'approved',
      actor: { kind: kind === 'ai_agent' ? 'ai' : 'automation', principalId: `${kind}-123` },
      confirmation: 'SYNC_FIXTURE_REPOSITORY',
    }),
    (error) => error instanceof OperationContractError && error.code === 'OPERATION_ACTOR_ROLE_MISMATCH',
    `${kind} 시작 주체는 사람 승인 단계를 대신할 수 없습니다.`,
  )
}

let cancelledRun = createOperationRun(planFor('human_ui', 'fixture-cancel'), { now: '2026-07-15T07:00:01.000Z' })
cancelledRun = recordOperationApproval(cancelledRun, {
  decision: 'approved',
  actor: { kind: 'human', principalId: 'user-123' },
  confirmation: 'SYNC_FIXTURE_REPOSITORY',
})
cancelledRun = queueOperationRun(cancelledRun, { actor: { kind: 'control_plane', principalId: 'control-plane' } })
cancelledRun = startOperationRun(cancelledRun, { actor: { kind: 'execution_adapter', principalId: 'fixture.sync-executor' } })
cancelledRun = requestOperationCancellation(cancelledRun, {
  actor: { kind: 'human', principalId: 'user-123' },
  reason: '사용자가 중지',
})
assert.equal(cancelledRun.state, 'running')
assert.equal(cancelledRun.cancellationRequested, true)
cancelledRun = acknowledgeOperationCancellation(cancelledRun, {
  actor: { kind: 'execution_adapter', principalId: 'fixture.sync-executor' },
  summary: '안전 지점에서 실행 중지',
})
assert.equal(cancelledRun.state, 'cancelled')

let failedRun = createOperationRun(planFor('human_ui', 'fixture-retry'), { now: '2026-07-15T07:00:01.000Z' })
failedRun = recordOperationApproval(failedRun, {
  decision: 'approved',
  actor: { kind: 'human', principalId: 'user-123' },
  confirmation: 'SYNC_FIXTURE_REPOSITORY',
})
failedRun = queueOperationRun(failedRun, { actor: { kind: 'control_plane', principalId: 'control-plane' } })
failedRun = startOperationRun(failedRun, { actor: { kind: 'execution_adapter', principalId: 'fixture.sync-executor' } })
failedRun = failOperationRun(failedRun, {
  actor: { kind: 'execution_adapter', principalId: 'fixture.sync-executor' },
  code: 'TEMPORARY_FAILURE',
  summary: '일시 오류',
})
failedRun = retryOperationRun(failedRun, {
  actor: { kind: 'control_plane', principalId: 'control-plane' },
  reason: '멱등 키로 한 번 재시도',
})
failedRun = startOperationRun(failedRun, { actor: { kind: 'execution_adapter', principalId: 'fixture.sync-executor' } })
failedRun = failOperationRun(failedRun, {
  actor: { kind: 'execution_adapter', principalId: 'fixture.sync-executor' },
  code: 'SECOND_FAILURE',
  summary: '두 번째 실패',
})
assert.throws(
  () => retryOperationRun(failedRun, { actor: { kind: 'control_plane', principalId: 'control-plane' } }),
  (error) => error instanceof OperationContractError && error.code === 'OPERATION_ATTEMPT_LIMIT',
)
let recoveredRun = requestOperationRecovery(failedRun, {
  actor: { kind: 'human', principalId: 'user-123' },
  reason: '이전 리비전 복구',
})
recoveredRun = startOperationRecovery(recoveredRun, {
  actor: { kind: 'recovery_adapter', principalId: 'fixture.rollback-executor' },
})
recoveredRun = completeOperationRecovery(recoveredRun, {
  actor: { kind: 'recovery_adapter', principalId: 'fixture.rollback-executor' },
  succeeded: true,
  evidenceFingerprint: 'e'.repeat(64),
  summary: '이전 리비전 확인',
})
assert.equal(recoveredRun.state, 'recovered')
assert.equal(verifyOperationEventChain(recoveredRun), true)

assert.throws(
  () => normalizeOperationDefinition({
    ...definitionInput,
    authorizationPolicyIds: [],
  }),
  (error) => error instanceof OperationContractError && error.code === 'MISSING_OPERATION_POLICY',
)
assert.throws(
  () => normalizeOperationDefinition({
    ...definitionInput,
    verification: { required: false, mode: 'none' },
  }),
  (error) => error instanceof OperationContractError && error.code === 'MISSING_OPERATION_VERIFICATION',
)
assert.doesNotThrow(() => normalizeOperationDefinition({
  ...definitionInput,
  availability: 'planned',
  authorizationPolicyIds: [],
  execution: {},
  verification: {},
}))

console.log('Universal operation lifecycle checks passed')
