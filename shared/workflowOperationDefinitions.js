import { normalizeOperationDefinition } from './operationLifecycle.js'
import {
  SOURCE_TWIN_OPERATION_CONFIRMATION,
  SOURCE_TWIN_SNAPSHOT_OPERATION,
} from './sourceTwin.js'

export const WORKFLOW_GIT_SYNC_OPERATION_ID = 'operation:workflow-git-sync'
export const WORKFLOW_GIT_SYNC_CONFIRMATION = 'QUEUE_LOCAL_GIT_SYNC'
export const WORKFLOW_GIT_SYNC_OWNER_POLICY_ID = 'policy:workflow-git-sync-owner-approval'
export const WORKFLOW_GIT_SYNC_LOCAL_POLICY_ID = 'policy:workflow-git-sync-local-consent'
export const WORKFLOW_GIT_SYNC_STATE_CLASS_ID = 'data-class:workflow-git-state'
export const WORKFLOW_GIT_SYNC_AUDIT_CLASS_ID = 'data-class:workflow-operation-audit'
export const WORKFLOW_GIT_SYNC_EVIDENCE_ID = 'evidence:workflow-git-sync-operation'
export const WORKFLOW_GIT_SYNC_POLICY_EVIDENCE_ID = 'evidence:workflow-git-sync-policy'
export const WORKFLOW_GIT_SYNC_CONTROL_EVIDENCE_ID = 'evidence:workflow-git-sync-control'
export const WORKFLOW_SOURCE_SNAPSHOT_OPERATION_ID = 'operation:workflow-source-snapshot-create'
export const WORKFLOW_SOURCE_SNAPSHOT_POLICY_ID = 'policy:workflow-source-snapshot-owner-approval'
export const WORKFLOW_SOURCE_METADATA_CLASS_ID = 'data-class:workflow-source-metadata'
export const WORKFLOW_SOURCE_SNAPSHOT_EVIDENCE_ID = 'evidence:workflow-source-snapshot-operation'

export const WORKFLOW_GIT_SYNC_OPERATION_DEFINITION = normalizeOperationDefinition({
  id: WORKFLOW_GIT_SYNC_OPERATION_ID,
  capability: 'workflow.local.git-sync',
  label: '로컬 코드와 GitHub 코드 동기화',
  description: '상태를 먼저 확인한 뒤 일반 push 또는 fast-forward pull만 명시적 승인으로 실행합니다.',
  availability: 'executable',
  access: 'execute',
  approval: 'explicit',
  confirmation: WORKFLOW_GIT_SYNC_CONFIRMATION,
  reversible: false,
  risk: 'medium',
  sideEffect: 'external',
  allowedInitiators: ['human_ui'],
  authorizationPolicyIds: [WORKFLOW_GIT_SYNC_OWNER_POLICY_ID, WORKFLOW_GIT_SYNC_LOCAL_POLICY_ID],
  target: { kind: 'relation', id: 'map-edge-repo-github' },
  input: {
    schemaRef: 'workflow.local.git-sync.plan.v1',
    dataClassIds: [WORKFLOW_GIT_SYNC_STATE_CLASS_ID],
  },
  writeSet: [
    { resource: 'github_remote_branch', operation: 'sync', maximumItems: 1 },
    { resource: 'local_git_worktree', operation: 'sync', maximumItems: 1 },
    { resource: 'local_connector_operations', operation: 'append', maximumItems: 1 },
    { resource: 'local_connector_operation_events', operation: 'append', maximumItems: 8 },
  ],
  excludes: ['automatic-commit', 'credential-values', 'force-push', 'source-content', 'uncommitted-files'],
  execution: {
    adapterId: 'workflow.local-git-sync-agent',
    actionId: 'git.sync.non-force',
    location: 'local_connector',
  },
  timeoutMs: 180000,
  idempotency: {
    mode: 'keyed',
    keyScope: 'signed-plan-and-state-fingerprint',
    replay: 'reject',
  },
  verification: {
    required: true,
    mode: 'postcondition',
    adapterId: 'workflow.local-git-state-observer',
    successCriteria: [
      '로컬 HEAD와 승인된 방향의 대상 커밋이 일치합니다.',
      'origin 지문과 브랜치가 승인 계획과 같습니다.',
      '강제 push나 병합 커밋을 만들지 않았습니다.',
    ],
  },
  recovery: {
    mode: 'manual',
    retry: { maxAttempts: 1, backoff: 'none' },
    summary: '기존 Git 커밋 이력을 보존하며 별도 승인된 후속 커밋이나 Git 복구 절차로 되돌립니다.',
  },
  evidenceIds: [
    WORKFLOW_GIT_SYNC_EVIDENCE_ID,
    WORKFLOW_GIT_SYNC_POLICY_EVIDENCE_ID,
    WORKFLOW_GIT_SYNC_CONTROL_EVIDENCE_ID,
  ],
})

export const WORKFLOW_SOURCE_SNAPSHOT_OPERATION_DEFINITION = normalizeOperationDefinition({
  id: WORKFLOW_SOURCE_SNAPSHOT_OPERATION_ID,
  capability: SOURCE_TWIN_SNAPSHOT_OPERATION,
  label: '시스템 상태 불변 스냅샷 생성',
  description: '코드·DB 선언·배포·운영 상태의 제한된 메타데이터를 append-only 근거로 한 건 기록합니다.',
  availability: 'executable',
  access: 'write',
  approval: 'explicit',
  confirmation: SOURCE_TWIN_OPERATION_CONFIRMATION,
  reversible: false,
  risk: 'low',
  sideEffect: 'mutation',
  allowedInitiators: ['human_ui', 'ai_agent'],
  authorizationPolicyIds: [WORKFLOW_SOURCE_SNAPSHOT_POLICY_ID],
  target: { kind: 'entity', id: 'map-group-experience' },
  input: {
    schemaRef: 'workflow.source-twin.snapshot.v1',
    dataClassIds: [WORKFLOW_SOURCE_METADATA_CLASS_ID],
  },
  writeSet: [
    { resource: 'source_twin_snapshots', operation: 'append', maximumItems: 1 },
    { resource: 'system_operation_audit', operation: 'append', maximumItems: 1 },
  ],
  excludes: ['canvas-body', 'credential-values', 'source-content', 'user-email'],
  execution: {
    adapterId: 'workflow.source-twin-snapshot-rpc',
    actionId: SOURCE_TWIN_SNAPSHOT_OPERATION,
    location: 'server',
  },
  timeoutMs: 30000,
  idempotency: {
    mode: 'keyed',
    keyScope: 'signed-plan-and-state-fingerprint',
    replay: 'return_existing',
  },
  verification: {
    required: true,
    mode: 'postcondition',
    adapterId: 'workflow.source-twin-snapshot-result-check',
    successCriteria: [
      '생성된 스냅샷 ID와 manifest ID가 승인 계획과 같습니다.',
      '스냅샷과 조작 감사 기록이 같은 트랜잭션으로 기록됩니다.',
    ],
  },
  recovery: {
    mode: 'append_only',
    retry: { maxAttempts: 1, backoff: 'none' },
    summary: '기존 시스템 상태를 바꾸지 않으며 감사 무결성을 위해 생성된 근거를 수정하거나 삭제하지 않습니다.',
  },
  evidenceIds: [WORKFLOW_SOURCE_SNAPSHOT_EVIDENCE_ID],
})
