import assert from 'node:assert/strict'

import {
  AI_CONTEXT_GATE_ENGINE_ID,
  AI_CONTEXT_GATE_HARD_LIMITS,
  AI_CONTEXT_GATE_PROJECT_MASTER_MARKER,
  AI_CONTEXT_GATE_PROJECT_MASTER_PATH,
  AI_CONTEXT_GATE_WORKFLOW,
  completeAiContextGateWorkflow,
  runAiContextGateWorkflow,
} from './ai-context-gate-engine.mjs'

const baseInput = {
  project: { id: 'workflow-canvas', name: 'Workflow Canvas' },
  targetAi: { name: 'development-ai' },
  projectStateFingerprint: 'project-state:baseline-001',
  planningFacts: [{
    id: 'feature-sharing',
    category: 'feature',
    status: 'confirmed',
    title: '공유·협업',
    statement: '캔버스를 다른 사용자와 공유하고 함께 편집합니다.',
    details: ['초대와 공유 링크를 포함', '개인 로컬 백업은 제외'],
    evidence: ['src/App.jsx:share'],
  }],
}

const manual = runAiContextGateWorkflow(baseInput)
assert.deepEqual(manual, runAiContextGateWorkflow(baseInput))
assert.equal(manual.engine.id, AI_CONTEXT_GATE_ENGINE_ID)
assert.equal(manual.workflow.id, AI_CONTEXT_GATE_WORKFLOW.id)
assert.equal(manual.enforcement.level, 'advisory')
assert.equal(manual.enforcement.canClaimForced, false)
assert.equal(manual.dispatch.status, 'user-action-required')
assert.equal(manual.projectMasterDocument.path, AI_CONTEXT_GATE_PROJECT_MASTER_PATH)
assert.match(manual.projectMasterDocument.proposedText, new RegExp(AI_CONTEXT_GATE_PROJECT_MASTER_MARKER))
assert.match(manual.projectMasterDocument.proposedText, /프로젝트 한 문장/)
assert.match(manual.projectMasterDocument.proposedText, /확인 대기 중인 AI 제안/)
assert.match(manual.instruction.text, /planning/)
assert.match(manual.instruction.text, /사용자 확정 내용은 조용히 덮어쓰지/)
assert.equal(manual.projectMasterDocument.automaticallySentToAi, false)
assert.equal(manual.projectMasterDocument.owner, 'user')
assert.equal(manual.projectMasterDocument.canonicalPlanningDocument, true)
assert.equal(manual.projectMasterDocument.finalProductStorageForm, 'undecided')
assert.equal(manual.tokenDefense.protectedParty, 'workflow-canvas-product-user')
assert.equal(manual.tokenDefense.fullProjectMasterAutomaticallySent, false)
assert.ok(manual.instruction.estimatedTokens <= manual.tokenDefense.promptTokenLimit)
assert.ok(manual.planningContextPack.estimatedTokens <= manual.tokenDefense.planningContextPackTokenLimit)
assert.doesNotMatch(manual.instruction.text, /const baseInput/)

const connectedPending = runAiContextGateWorkflow({
  ...baseInput,
  delivery: { method: 'connected-ai' },
})
assert.equal(connectedPending.dispatch.type, 'ConnectorExchangeRequest')
assert.equal(connectedPending.dispatch.ownerEngineId, 'engine-connector-bridge')
assert.equal(connectedPending.enforcement.status, 'delivery-pending')
assert.equal(connectedPending.enforcement.canClaimForced, false)

const connected = runAiContextGateWorkflow({
  ...baseInput,
  delivery: {
    method: 'connected-ai',
    deliveryReceipt: {
      id: 'delivery-001',
      promptFingerprint: connectedPending.instruction.fingerprint,
    },
  },
})
assert.equal(connected.enforcement.level, 'advisory')
assert.equal(connected.enforcement.status, 'delivery-receipt-unverified')

const connectedVerified = runAiContextGateWorkflow({
  ...baseInput,
  delivery: {
    method: 'connected-ai',
    deliveryReceipt: {
      id: 'delivery-001',
      promptFingerprint: connectedPending.instruction.fingerprint,
    },
  },
}, {
  authority: 'test-connector-host',
  verifyDeliveryReceipt: (receipt) => receipt.id === 'delivery-001',
})
assert.equal(connectedVerified.enforcement.level, 'delivery-verified')
assert.equal(connectedVerified.enforcement.canClaimForced, false)
assert.equal(connectedVerified.dispatch.verificationAuthority, 'test-connector-host')

assert.throws(
  () => runAiContextGateWorkflow({
    ...baseInput,
    delivery: {
      method: 'connected-ai',
      deliveryReceipt: { id: 'delivery-002', promptFingerprint: 'wrong000' },
    },
  }),
  (error) => error.code === 'delivery-receipt-mismatch',
)

const managedUnbound = runAiContextGateWorkflow({
  ...baseInput,
  delivery: { method: 'managed-development' },
})
assert.equal(managedUnbound.enforcement.status, 'gate-configuration-required')
assert.equal(managedUnbound.enforcement.canClaimForced, false)

const managed = runAiContextGateWorkflow({
  ...baseInput,
  delivery: {
    method: 'managed-development',
    completionGate: {
      id: 'managed-finish-gate',
      instructionFingerprint: managedUnbound.instruction.fingerprint,
    },
  },
})
assert.equal(managed.enforcement.level, 'advisory')
assert.equal(managed.enforcement.canClaimForced, false)

const managedVerified = runAiContextGateWorkflow({
  ...baseInput,
  delivery: {
    method: 'managed-development',
    completionGate: {
      id: 'managed-finish-gate',
      instructionFingerprint: managedUnbound.instruction.fingerprint,
    },
  },
}, {
  authority: 'test-managed-development-host',
  verifyCompletionGate: (gate) => gate.id === 'managed-finish-gate',
})
assert.equal(managedVerified.enforcement.level, 'completion-gated')
assert.equal(managedVerified.enforcement.canClaimForced, true)
assert.equal(managedVerified.dispatch.verificationAuthority, 'test-managed-development-host')

assert.throws(
  () => runAiContextGateWorkflow({ ...baseInput, projectMasterPath: '../PROJECT_MASTER.md' }),
  (error) => error.code === 'unsafe-project-master-path',
)
assert.throws(
  () => runAiContextGateWorkflow({
    ...baseInput,
    project: { id: 'workflow canvas', name: 'Workflow Canvas' },
  }),
  (error) => error.code === 'invalid-project-id',
)
assert.throws(
  () => runAiContextGateWorkflow({
    ...baseInput,
    budgets: { promptTokens: AI_CONTEXT_GATE_HARD_LIMITS.promptTokens + 1 },
  }),
  (error) => error.code === 'unsafe-token-budget',
)
assert.throws(
  () => runAiContextGateWorkflow({
    ...baseInput,
    planningFacts: Array.from({ length: AI_CONTEXT_GATE_HARD_LIMITS.planningFacts + 1 }, (_, index) => ({
      id: `feature-${index}`,
      category: 'feature',
      title: `기능 ${index}`,
      statement: '테스트',
    })),
  }),
  (error) => error.code === 'planning-context-pack-too-large',
)

const handoffBase = {
  declaration: {
    change: 'planning',
    summary: '공유 초대 흐름의 기획 경계를 수정했습니다.',
    evidenceRefs: ['src/App.jsx:share'],
  },
  observed: {
    baseProjectStateFingerprint: managedVerified.manifest.projectStateFingerprint,
    resultProjectStateFingerprint: 'project-state:result-002',
    projectMasterPath: managedVerified.manifest.projectMasterPath,
    baseProjectMasterFingerprint: managedVerified.manifest.baselineProjectMasterFingerprint,
    resultProjectMasterFingerprint: 'project-master:result-002',
    planningChangeSignals: ['feature boundary decision changed'],
    evidenceRefs: ['src/App.jsx:share'],
  },
}

assert.throws(
  () => completeAiContextGateWorkflow(managedVerified, {
    ...handoffBase,
    observed: {
      ...handoffBase.observed,
      resultProjectMasterFingerprint: handoffBase.observed.baseProjectMasterFingerprint,
    },
  }),
  (error) => error.code === 'project-master-not-updated',
)
assert.throws(
  () => completeAiContextGateWorkflow(managedVerified, {
    declaration: { change: 'none', summary: '기획 변경이 없습니다.' },
    observed: {
      ...handoffBase.observed,
      resultProjectMasterFingerprint: handoffBase.observed.baseProjectMasterFingerprint,
    },
  }),
  (error) => error.code === 'undeclared-planning-change',
)
assert.throws(
  () => completeAiContextGateWorkflow(managedVerified, {
    ...handoffBase,
    observed: {
      ...handoffBase.observed,
      baseProjectStateFingerprint: 'project-state:stale-000',
    },
  }),
  (error) => error.code === 'stale-project-state-baseline',
)

assert.throws(
  () => completeAiContextGateWorkflow(managedVerified, {
    ...handoffBase,
    observed: {
      ...handoffBase.observed,
      evidenceRefs: [],
    },
  }),
  (error) => error.code === 'unverified-planning-evidence',
)
assert.throws(
  () => completeAiContextGateWorkflow(managedVerified, {
    ...handoffBase,
    observed: {
      ...handoffBase.observed,
      planningChangeSignals: [],
    },
  }),
  (error) => error.code === 'planning-signal-required',
)
const receipt = completeAiContextGateWorkflow(managedVerified, handoffBase)
assert.deepEqual(receipt, completeAiContextGateWorkflow(managedVerified, handoffBase))
assert.equal(receipt.status, 'accepted')
assert.equal(receipt.enforcement.enforced, true)
assert.equal(receipt.enforcement.level, 'completion-gated')
assert.equal(receipt.enrollmentFingerprint, managedVerified.manifest.fingerprint)

const advisoryReceipt = completeAiContextGateWorkflow(manual, handoffBase)
assert.equal(advisoryReceipt.enforcement.enforced, false)

const noneReceipt = completeAiContextGateWorkflow(manual, {
  declaration: {
    change: 'none',
    summary: '기획 변경 없이 기존 기능을 구현했습니다.',
    evidenceRefs: [],
  },
  observed: {
    baseProjectStateFingerprint: manual.manifest.projectStateFingerprint,
    resultProjectStateFingerprint: 'project-state:implementation-only',
    projectMasterPath: manual.manifest.projectMasterPath,
    baseProjectMasterFingerprint: manual.manifest.baselineProjectMasterFingerprint,
    resultProjectMasterFingerprint: manual.manifest.baselineProjectMasterFingerprint,
    planningChangeSignals: [],
    evidenceRefs: [],
  },
})
assert.equal(noneReceipt.change, 'none')
assert.equal(noneReceipt.status, 'accepted')

console.log('AI Context Gate checks passed')
