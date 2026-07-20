import {
  AI_CONTEXT_GATE_CONTRACT_VERSION,
  createAiContextEnrollment,
  verifyAiContextHandoff,
} from '../shared/aiContextGate.js'

export const AI_CONTEXT_GATE_ENGINE_ID = 'engine-ai-context-gate'
export const AI_CONTEXT_GATE_ENGINE_VERSION = '0.1.0-alpha.0'

export const AI_CONTEXT_GATE_WORKFLOW = Object.freeze({
  id: 'ai-context-gate.project-master',
  version: '1.0.0',
  name: 'Project Master Enrollment Workflow',
  stages: Object.freeze([
    'validate-project-state-and-master-baseline',
    'resolve-target-ai-delivery-method',
    'select-bounded-planning-context',
    'build-project-master-recording-instruction',
    'prepare-human-owned-project-master',
    'bind-delivery-or-completion-gate',
    'verify-project-master-handoff-and-issue-receipt',
  ]),
})

export const AI_CONTEXT_GATE_BOUNDARY = Object.freeze({
  publicEntrypoint: 'scripts/ai-context-gate-engine.mjs',
  internalModules: Object.freeze(['shared/aiContextGate.js']),
  ownedArtifacts: Object.freeze([
    'AiContextEnrollmentManifest',
    'AiContextHandoffReceipt',
    'PROJECT_MASTER.md portable template',
  ]),
  externalDependencies: Object.freeze({
    connectorTransport: 'engine-connector-bridge',
    repositoryWrite: 'engine-safe-operations',
    sourceAnalysis: 'engine-source-lens',
  }),
  excludedResponsibilities: Object.freeze([
    'repository-or-ai-provider-connection',
    'source-code-analysis',
    'direct-repository-write',
    'claiming-enforcement-from-prompt-delivery-alone',
    'sending-full-project-master-to-a-model',
  ]),
})

export function runAiContextGateWorkflow(input = {}, verification = {}) {
  const result = createAiContextEnrollment(input, verification)
  return Object.freeze({
    contractVersion: AI_CONTEXT_GATE_CONTRACT_VERSION,
    engine: Object.freeze({
      id: AI_CONTEXT_GATE_ENGINE_ID,
      version: AI_CONTEXT_GATE_ENGINE_VERSION,
    }),
    workflow: Object.freeze({
      id: AI_CONTEXT_GATE_WORKFLOW.id,
      version: AI_CONTEXT_GATE_WORKFLOW.version,
    }),
    ...result,
  })
}

export function completeAiContextGateWorkflow(enrollment, handoff) {
  return verifyAiContextHandoff(enrollment, handoff)
}

export {
  AI_CONTEXT_GATE_HARD_LIMITS,
  AI_CONTEXT_GATE_PROJECT_MASTER_MARKER,
  AI_CONTEXT_GATE_PROJECT_MASTER_PATH,
  AiContextGateError,
  buildProjectMasterTemplate,
  buildTargetAiPrompt,
  estimateAiContextTokens,
} from '../shared/aiContextGate.js'
