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
export const WORKFLOW_SOURCE_EDIT_OPERATION_ID = 'operation:workflow-source-edit'
export const WORKFLOW_SOURCE_EDIT_ROLLBACK_OPERATION_ID = 'operation:workflow-source-edit-rollback'
export const WORKFLOW_SOURCE_EDIT_CONFIRMATION = 'QUEUE_LOCAL_SOURCE_EDIT'
export const WORKFLOW_SOURCE_EDIT_ROLLBACK_CONFIRMATION = 'QUEUE_LOCAL_SOURCE_EDIT_ROLLBACK'
export const WORKFLOW_SOURCE_EDIT_OWNER_POLICY_ID = 'policy:workflow-source-edit-owner-only'
export const WORKFLOW_SOURCE_EDIT_LOCAL_POLICY_ID = 'policy:workflow-source-edit-local-consent'
export const WORKFLOW_SOURCE_EDIT_ROLLBACK_OWNER_POLICY_ID = 'policy:workflow-source-edit-rollback-owner-only'
export const WORKFLOW_SOURCE_EDIT_ROLLBACK_LOCAL_POLICY_ID = 'policy:workflow-source-edit-rollback-local-consent'
export const WORKFLOW_SOURCE_EDIT_INPUT_CLASS_ID = 'data-class:workflow-source-edit-plan'
export const WORKFLOW_SOURCE_EDIT_EVIDENCE_ID = 'evidence:workflow-source-edit-operation'
export const WORKFLOW_SOURCE_EDIT_POLICY_EVIDENCE_ID = 'evidence:workflow-source-edit-policy'
export const WORKFLOW_SOURCE_EDIT_CONTROL_EVIDENCE_ID = 'evidence:workflow-source-edit-control'

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

export const WORKFLOW_SOURCE_EDIT_OPERATION_DEFINITION = normalizeOperationDefinition({
  id: WORKFLOW_SOURCE_EDIT_OPERATION_ID,
  capability: 'workflow.source-lens.safe-roundtrip-edit',
  label: '등록된 UI 상수 안전 편집',
  description: '명시적으로 등록된 UI 상수 하나만 격리 worktree에서 바꾸고 검증·로컬 승인을 거쳐 provenance 커밋으로 반영합니다.',
  availability: 'executable',
  access: 'write',
  approval: 'explicit',
  confirmation: WORKFLOW_SOURCE_EDIT_CONFIRMATION,
  reversible: true,
  risk: 'high',
  sideEffect: 'mutation',
  allowedInitiators: ['human_ui'],
  authorizationPolicyIds: [WORKFLOW_SOURCE_EDIT_OWNER_POLICY_ID, WORKFLOW_SOURCE_EDIT_LOCAL_POLICY_ID],
  target: { kind: 'entity', id: 'map-local-repo' },
  input: {
    schemaRef: 'workflow.source-edit.registered-property.v1',
    dataClassIds: [WORKFLOW_SOURCE_EDIT_INPUT_CLASS_ID],
  },
  writeSet: [
    { resource: 'isolated_local_git_worktree', operation: 'update', maximumItems: 1 },
    { resource: 'registered_ui_constant', operation: 'update', maximumItems: 1 },
    { resource: 'local_git_commit', operation: 'append', maximumItems: 1 },
    { resource: 'local_connector_operations', operation: 'append', maximumItems: 1 },
    { resource: 'local_connector_operation_events', operation: 'append', maximumItems: 8 },
  ],
  excludes: ['arbitrary-source-edit', 'automatic-push', 'credential-values', 'force-push', 'unregistered-property'],
  execution: {
    adapterId: 'workflow.local-source-edit-agent',
    actionId: 'source.edit.registered-ui-property',
    location: 'local_connector',
  },
  timeoutMs: 900000,
  idempotency: {
    mode: 'keyed',
    keyScope: 'signed-plan-property-anchor-and-state-fingerprint',
    replay: 'reject',
  },
  verification: {
    required: true,
    mode: 'postcondition',
    adapterId: 'workflow.source-edit-result-verifier',
    successCriteria: [
      '등록된 AST literal 하나만 요청 값으로 바뀝니다.',
      '격리 worktree에서 속성 검사와 production build가 통과합니다.',
      '원본 브랜치가 provenance 커밋으로만 fast-forward 됩니다.',
    ],
  },
  recovery: {
    mode: 'manual',
    rollbackOperationId: WORKFLOW_SOURCE_EDIT_ROLLBACK_OPERATION_ID,
    retry: { maxAttempts: 1, backoff: 'none' },
    summary: '별도 승인되는 rollback 조작이 원래 커밋을 되돌리는 새 provenance 커밋을 만듭니다.',
  },
  evidenceIds: [WORKFLOW_SOURCE_EDIT_EVIDENCE_ID, WORKFLOW_SOURCE_EDIT_POLICY_EVIDENCE_ID, WORKFLOW_SOURCE_EDIT_CONTROL_EVIDENCE_ID],
})

export const WORKFLOW_SOURCE_EDIT_ROLLBACK_OPERATION_DEFINITION = normalizeOperationDefinition({
  id: WORKFLOW_SOURCE_EDIT_ROLLBACK_OPERATION_ID,
  capability: 'workflow.source-lens.safe-roundtrip-rollback',
  label: '등록된 UI 상수 편집 롤백',
  description: '선택한 Source Lens 편집 커밋을 격리 worktree에서 검증한 뒤 새 revert 커밋으로 되돌립니다.',
  availability: 'executable',
  access: 'write',
  approval: 'explicit',
  confirmation: WORKFLOW_SOURCE_EDIT_ROLLBACK_CONFIRMATION,
  reversible: true,
  risk: 'high',
  sideEffect: 'mutation',
  allowedInitiators: ['human_ui'],
  authorizationPolicyIds: [WORKFLOW_SOURCE_EDIT_ROLLBACK_OWNER_POLICY_ID, WORKFLOW_SOURCE_EDIT_ROLLBACK_LOCAL_POLICY_ID],
  target: { kind: 'entity', id: 'map-local-repo' },
  input: {
    schemaRef: 'workflow.source-edit.rollback.v1',
    dataClassIds: [WORKFLOW_SOURCE_EDIT_INPUT_CLASS_ID],
  },
  writeSet: [
    { resource: 'isolated_local_git_worktree', operation: 'update', maximumItems: 1 },
    { resource: 'registered_ui_constant', operation: 'update', maximumItems: 1 },
    { resource: 'local_git_commit', operation: 'append', maximumItems: 1 },
    { resource: 'local_connector_operations', operation: 'append', maximumItems: 1 },
    { resource: 'local_connector_operation_events', operation: 'append', maximumItems: 8 },
  ],
  excludes: ['git-reset', 'history-rewrite', 'automatic-push', 'credential-values', 'force-push'],
  execution: {
    adapterId: 'workflow.local-source-edit-agent',
    actionId: 'source.edit.revert-provenance-commit',
    location: 'local_connector',
  },
  timeoutMs: 900000,
  idempotency: {
    mode: 'keyed',
    keyScope: 'signed-plan-original-operation-and-state-fingerprint',
    replay: 'reject',
  },
  verification: {
    required: true,
    mode: 'postcondition',
    adapterId: 'workflow.source-edit-result-verifier',
    successCriteria: [
      '대상 속성이 기록된 이전 값으로 돌아갑니다.',
      '격리 worktree 검사와 production build가 통과합니다.',
      'Git 이력을 지우지 않고 새 revert provenance 커밋을 만듭니다.',
    ],
  },
  recovery: {
    mode: 'manual',
    retry: { maxAttempts: 1, backoff: 'none' },
    summary: '롤백도 새 커밋이므로 필요한 경우 다시 명시적으로 편집할 수 있습니다.',
  },
  evidenceIds: [WORKFLOW_SOURCE_EDIT_EVIDENCE_ID, WORKFLOW_SOURCE_EDIT_POLICY_EVIDENCE_ID, WORKFLOW_SOURCE_EDIT_CONTROL_EVIDENCE_ID],
})
